# Devnet deployment checkpoint

Проверено 07.10.2026, 18:44 UTC / 23:44 Казахстан UTC+5. **Статус: blocked by free test-SOL funding. Devnet-программа пока не развёрнута; deployment signatures отсутствуют.** Локальный работающий validator и его fixture не изменялись в этой задаче.

## Scope и skills

Собственная задача: только этот документ и `C:\Users\dmitrii\Documents\solana\.local\bondtrace\devnet\**`. Root manifests/source/IDL/Node dependencies/Git/local validator принадлежат lead и не редактировались. Перед задачей повторно прочитаны AGENTS/STATE; повторно использованы уже прочитанные неизменённые solana-dev SKILL и Anchor/security guidance, прочитаны RPC lookup reference и актуальные official deployment docs. Это техническое выполнение уже одобренной архитектуры; выбор продукта не перезапускался. Применены разрешённые devnet/test-wallet действия, без mainnet, реальных средств, paid services, публичного repo или финальной подачи.

В продолжении **MUST** читать AGENTS/STATE и соответствующие реально установленные skills перед существенной работой, сохранять ownership/stopping gate и записывать результаты проверок. Existing toolchain/ProofPilot не переустанавливать без конкретного доказательства проблемы. Lead обновляет `docs/00-STATE.md`.

## Подготовленные параметры

| Параметр | Проверенное значение |
|---|---|
| Cluster | devnet only |
| RPC | `https://api.devnet.solana.com` |
| Genesis hash | `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` |
| RPC apiVersion | 4.4.0-beta.0 |
| Program ID | `B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8` |
| Image | `C:\Users\dmitrii\Documents\solana\target\deploy\bondtrace.so`, 463096 bytes |
| SHA256 | `15525EC2DE285E7CC3065F7EC8CE47BFE81D1ED2837754B85B8CF2598C935DC2` |
| Dedicated devnet payer / intended upgrade authority | `BWpCPnVVzxPA1oTebFyfCjbk8wgTXLdjQWwY1ckjzqHS` |
| Payer key location (ignored, contents never printed) | `.local/bondtrace/devnet/keys/issuer-keypair.json` |
| Fixed program key location (ignored) | `.local/bondtrace-program-keypair.json` |
| Separate devnet fixture/history namespace | `.local/bondtrace/devnet`; localnet namespace remains separate |

Payer создан штатным `demoSigner('issuer')` из `server/transactions.ts` с **process-scoped** `BONDTRACE_NETWORK=devnet`, `SOLANA_RPC_URL=https://api.devnet.solana.com`. Выведен только публичный address; CLI pubkey подтвердил совпадение. `git check-ignore` подтвердил исключение обоих key files. Нет сохранённого real-funds wallet или global CLI network change.

## Точная причина остановки

Devnet `getAccountInfo` для Program ID вернул `value=null`: новая программа ещё отсутствует. `getBalance` payer после попыток —0 lamports, slot508549521.

1. Единственный первый `requestAirdrop`, 3 test SOL: HTTP200, JSON-RPC error `-32603: Internal error`; signature не выдана.
2. Единственный второй `requestAirdrop`, 2 test SOL: **HTTP429**, RPC error429: daily airdrop limit or faucet dry. Повторы остановлены, других faucets/IP/кошельков для обхода лимита не создавалось.

Подробное несекретное evidence находится в ignored namespace: `deployment-preflight.json`, `airdrop-1.json`, `airdrop-2.json`, `balance-after-airdrop.json`, `program-metadata-rent.json`.

Актуальный devnet `getMinimumBalanceForRentExemption(463141)` = **2_353_406_520 lamports** для ProgramData metadata45 + image463096. Program account36 rent =833120 lamports. Сумма rent: **2,35423964 test SOL**, плюс upload/deployment transaction fees. Консервативный deploy gate —2,4 test SOL; **3 test SOL** оставляет запас для демо. Ранее предполагавшиеся3,23 SOL были приблизительной оценкой, живой RPC дал другую сумму. Только test SOL, не предложение купить реальные SOL.

Официальный [Solana faucet](https://faucet.solana.com/) на дату доступа07.10.2026 описывает GitHub sign-in для повышенного лимита и отдельно направляет AI agents к programmatic CLI/PoW/local validator. CLI-эквивалент уже исчерпал bounded attempts. Владельцу можно пройти официальный web faucet вручную, указав **публичный payer address**, при необходимости войдя только разрешённым `dimik98330`. Account login/consent/captcha выполняет владелец; seed phrases, private keys и tokens в чат не нужны. PoW/tool installs не выполнялись: отдельного разрешения в этом subtask на новые зависимости нет.

## Reviewable команда после funding

Подготовлен ignored script `.local/bondtrace/devnet/deploy-devnet.sh`. Он проверяет оба публичных адреса, SHA256, наличие не менее2,4 test SOL; при недостатке завершается **до** создания upload buffer или отправки deployment. Нет `config set`, mainnet/custom RPC, `--skip-preflight`, `--skip-feature-verify`, закрытия программы или смены authority. Deployment сохраняет scoped devnet upgrade authority за payer; irreversible `--final` отсутствует. Explicit buffer key предотвращает печать recovery mnemonic при upload failure.

```powershell
wsl -d Ubuntu -- bash /mnt/c/Users/dmitrii/Documents/solana/.local/bondtrace/devnet/deploy-devnet.sh
```

Основная команда, для review:

```bash
NO_DNA=1 /home/dmitrii/.local/bondtrace-tools/solana-release/bin/solana program deploy \
  /mnt/c/Users/dmitrii/Documents/solana/target/deploy/bondtrace.so \
  --url https://api.devnet.solana.com \
  --keypair /mnt/c/Users/dmitrii/Documents/solana/.local/bondtrace/devnet/keys/issuer-keypair.json \
  --fee-payer /mnt/c/Users/dmitrii/Documents/solana/.local/bondtrace/devnet/keys/issuer-keypair.json \
  --program-id /mnt/c/Users/dmitrii/Documents/solana/.local/bondtrace-program-keypair.json \
  --upgrade-authority /mnt/c/Users/dmitrii/Documents/solana/.local/bondtrace/devnet/keys/issuer-keypair.json \
  --buffer /mnt/c/Users/dmitrii/Documents/solana/.local/bondtrace/devnet/keys/program-buffer-keypair.json \
  --max-len 463096 --max-sign-attempts 2 --use-rpc --commitment confirmed
```

Installed CLI3.1.10 `program deploy --help` подтвердил эти options, включая `--max-len`, `--buffer`, `--program-id`, explicit authority. `--max-len` фиксирует image capacity и не резервирует дополнительную capacity. Данный script проверен `bash -n`; funding gate выполнен с balance0 и остановился без deployment. Все подписи/fees только devnet/test SOL в рамках имеющейся авторизации.

После настоящего deployment требуется сохранить confirmed signature(s), slot, Program account executable/owner, ProgramData address/authority и on-chain image hash/length. Затем lead запускает отдельный devnet issuer setup и полный Kit flow, проверяет браузер и сохраняет реальные Explorer links. [Пока только reviewable Program ID link](https://explorer.solana.com/address/B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8?cluster=devnet) не является доказательством существования программы.

Источники, доступ07.10.2026: [Official program deployment guide](https://solana.com/docs/programs/deploying) для CLI/program authority/rent workflow; [official clusters](https://solana.com/docs/references/clusters) и живой pinned devnet JSON-RPC для адреса сети и фактического rent/баланса/отсутствия программы. Local SBF/unit/runtime/IDL доказательства —09/11 и `docs/research/kase-chain.md`; devnet verification ими не подменяется.

## Позднейшая bounded PoW feasibility проверка

07.10.2026: lead отдельно разрешил исследование официального programmatic Proof-of-Work route и условную isolated tool installation / **один запуск не более двух минут**, только если этот путь может обеспечить минимум2,4 test SOL. Запрет повторения429 public airdrop, paid services, реальных средств, account/captcha automation и mainnet сохранён. Skills: повторно применены установленный solana-dev (RPC/security) и ProofPilot coach для evidence-based технического tradeoff; AGENTS/STATE перечитаны, bundle не переустанавливался.

**Вывод: путь не подходит текущей задаче; CLI не установлен, mining/challenge/transactions не запускались.** Причина установлена read-only до расходования CPU.

Provenance:

- [Official Solana devnet guide](https://solana.com/developers/cookbook/development/airdrops-and-faucets) рекомендует `devnet-pow` и непосредственно ссылается на [jarry-xiao/proof-of-work-faucet](https://github.com/jarry-xiao/proof-of-work-faucet), называя maintainer Ellipsis Labs. Это легитимный отдельный PoW route, а не смена IP/обход лимита public requestAirdrop.
- GitHub commit зафиксирован: `1efbcbf87497ed6d75a9bda373766ab11c5b4501`, committer timestamp2023-06-09T21:24:08Z. [CLI source](https://github.com/jarry-xiao/proof-of-work-faucet/blob/1efbcbf87497ed6d75a9bda373766ab11c5b4501/cli/src/main.rs) и [program source](https://github.com/jarry-xiao/proof-of-work-faucet/blob/1efbcbf87497ed6d75a9bda373766ab11c5b4501/programs/proof-of-work-faucet/src/lib.rs) прочитаны, no shell installer/build script invoked.
- [Crates.io devnet-pow](https://crates.io/crates/devnet-pow) latest0.1.4, опубликован2023-05-30, MIT, yanked=false. Crate скачан только для source inspection; SHA256 совпал с registry checksum: `1a0f40287a071514e8021738852a31bb6339419984c95d696c8b30a4aa70ce8a`. Это не установка. Crate source сохранён в ignored `.local/bondtrace/devnet/pow-source/devnet-pow-0.1.4`; Cargo.toml и единственный src/main.rs прочитаны.

Два независимых технических препятствия:

1. **Bootstrap fee:** опубликованный CLI0.1.4 при payer balance<5000 автоматически выполняет обычный `request_airdrop(1SOL)` перед mining (crate src/main.rs270–275). Полученная PoW выплата требует подписанной транзакции payer + mined key; fee payer — наш отдельный devnet payer. На его balance0 этот stock CLI повторил бы уже остановленный rate-limited public airdrop. Запуск не выполнен. Нет sponsor/безусловно бесплатной подписи в прочитанном CLI path.
2. **Живые rewards:** read-only `getProgramAccounts` PoW program `PoWSNH2hEZogtCg1Zgm51FnkmJperzYDgPK4fvs8taL` с dataSize17 дал23 specs. Скрипт проверил program owner, Anchor Difficulty discriminator и data length, вывел canonical source PDAs, затем одним `getMultipleAccounts` проверил balances. Из них **только один полностью funded**: difficulty2, reward **100 lamports =0,0000001 test SOL**, source balance999934900 lamports. Faucet из README с20SOL reward пустой; все прочие существенные reward pools также пусты. Есть только частично funded source с900000 lamports при объявленном reward19000000. Сумма всех наблюдавшихся source balances —**1,0008349 test SOL**, уже меньше требуемых2,4, независимо от вычислительной мощности. Для reward100 потребовалось бы24 миллиона claims до2,4; reward меньше transaction fees. Такой путь не удовлетворяет ни сумме, ни одному bounded challenge.

Evidence сохранён в `.local/bondtrace/devnet/pow-live-specs.json` (timestamp внутри) и read-only `.local/bondtrace/devnet/pow-inspect.mjs`. Этот скрипт не читает keypairs, не подписывает, не вызывает `requestAirdrop` и не майнит. Приведённые CPU runtime/throughput не измерялись; вывод основан на фактической ликвидности/reward и bootstrap code. Новые install/mining/faucet requests не производились. Manual owner faucet request остаётся прежним; дополнительного запроса владельцу не добавлено.

Следующий шаг не меняется: допустимое бесплатное funding dedicated payer владельцем либо оставить devnet как честно незавершённый gate, продолжая независимый localnet/client/browser/submission-materials scope. Не выдавать исследованный PoW CLI, Program ID Explorer link или уже работающий localnet за успешный devnet deployment.
