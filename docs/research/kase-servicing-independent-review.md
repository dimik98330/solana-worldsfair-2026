# KASE servicing: независимое review новых изменений

Дата: 2026-10-08. Mode: **ProofPilot coach**; decision context: scoped engineering review, не конкурсная оценка. Отдельный контекст critic, без чтения заключений остальных audit-агентов. Initial review нового пользовательского запроса; старый исчерпанный backend assessment не пересматривается. Допустимы максимум две проверки исправлений именно этого отчёта.

Прочитаны AGENTS.md, CODEX_SOLANA_WORLDSFAIR_START.md, docs/00-STATE.md, docs/21-BACKEND-FOCUS.md, docs/24-BACKEND-SERVICING.md и текущий diff. Skills: установленные `.agents/skills/solana-dev/SKILL.md` (security/testing), `.agents/skills/review-and-iterate/SKILL.md` (security-basics/code-review-rubric/compute-optimization), `.agents/skills/proofpilot/SKILL.md` (coach, routing, Solana implementation, review, quality, safety). Правило сохраняется при handoff: перед substantial task снова прочитать AGENTS/STATE и выбрать/прочитать подходящие фактически установленные skills. Без установки, Git mutations, UI/config edits, чтения signer files, изменений live ledger или отправки транзакций.

## Initial findings

### S1 · P2 · 33-е допустимое голосование делает недоступным финансовое состояние

**Место:** `server/proposal-discovery.ts:36`, вызов из `server/chain-view.ts:94`; дополнительный аналогичный отказ при union catalog/discovery на `server/chain-view.ts:97`.

Новый обязательный discovery выбрасывает `PROPOSAL_CAPACITY`/503 при более чем 32 on-chain Proposal. Контракт `create_proposal` (`programs/bondtrace/src/lib.rs:471`, `contexts.rs:164`) допускает произвольный новый u64 ID без ограничения количества; создание `create_vote` также не ограничивает число уже существующих proposals. Поэтому корректный 33-й Proposal, созданный вне локального каталога, выключает `/api/state`, `/api/reconciliation`, `/api/servicing`, `/api/evidence` до чтения финансового графа. Купоны, principal, reserve и supply при этом могут оставаться совершенно корректными. On-chain claims не блокируются этим кодом, однако штатный интерфейс теряет состояние, необходимое для обслуживания. Удаление локального каталога не помогает: источник отказа теперь chain scan.

**Воспроизведение:** отдельный synthetic-RPC test `.local/tests/servicing-critic-bad8e52c5af84007ad815e20f0c325f9/capacity.test.ts`: один и тот же банк с 32 каноническими proposals проходит `readChainView` и `reconcile(status=verified)`; добавление 33-го валидного PDA вызывает 503 ещё до `getMultipleAccounts`. Выполнен, exit 0 (assert подтверждает наличие дефекта). Это не live-chain тест.

**Исправление:** отделить лимит включённых proposals от доступности полного финансового графа. После проверки всех заголовков выбирать детерминированное окно до 32 IDs; возвращать явные counts/IDs omitted и scope выборки, не утверждать completeness. Catalog-only IDs тоже должны подчиняться общей выборке, а не вызывать union overflow. Полные множества discovery до/после сравнивать для bounded retry; malformed headers, duplicate identity и неверные owner/PDA по-прежнему отвергать, а не прятать обрезкой массива. Если вводится отдельный жёсткий предел самого scan, его влияние на доступность и область непроверенных proposals нужно явно обработать, не представлять отказ голосования как финансовую несогласованность.

**Acceptance:** 33 и больше корректных proposals → финансовые amounts/snapshots доступны из одного context; ровно указанное окно голосований и omitted count; неверный заголовок за пределами окна не скрывается; catalog+chain union не выключает финансы; race в omitted части также обнаруживается.

### S2 · P2 · Prefunded пустой canonical ATA не проходит новое восстановление issuance

**Место:** новый `server/admin.ts:144-148`, через `token()` (optional допускает только `null`, а не SYSTEM-owned account с пустыми data).

После закрытия нулевого зарегистрированного ATA кто угодно может перевести lamports на его известный адрес. RPC тогда возвращает пустой system account вместо `null`. Новый путь восстановления правильно добавляет idempotent ATA-create для отсутствующего account, но для этого также восстанавливаемого состояния преждевременно выбрасывает `INVALID_TOKEN_ACCOUNT`. Эмитент не может выпустить units через API, пока ATA отдельно не восстановят другим инструментом. `chain-view.decodeTokenBalance` и контрактный `snapshot` уже признают именно такое пустое canonical состояние нулевым; новый issuance flow должен согласоваться с ними.

**Воспроизведение:** `.local/tests/servicing-critic-bad8e52c5af84007ad815e20f0c325f9/ata.test.ts`: `null` для derived holder ATA даёт 2 инструкции; замена только этого account на `{owner: SYSTEM, executable: false, data: ['', 'base64'], lamports: 1}` вызывает `INVALID_TOKEN_ACCOUNT`. Выполнен, exit 0. Синтетический RPC; не утверждается, что в этой проверке выполнялся ATA program.

**Исправление:** только в явно canonical/optional lookup допустить корректный неисполняемый SYSTEM envelope с пустыми data как отсутствие token account, затем строить тот же `getCreateAssociatedTokenIdempotentInstruction`. Не принимать non-empty SYSTEM data, иной owner, executable или malformed encoding и не ослаблять полномочия уже существующего SPL account. Сохранять `beforeHolderUnits: '0'`.

**Acceptance:** API builder regression с 1 lamport и negative envelopes; actual isolated SBF/ATA runtime: close zero ATA → system transfer/prefund → idempotent recreate → issuer issuance → frozen positive ATA. Нельзя получать success лишь изменением mock expectation.

## Проверки и границы

Самостоятельно выполнено:

- `node --import tsx --test tests/client/servicing.test.ts tests/client/evidence.test.ts tests/client/proposal-discovery.test.ts tests/client/operation-identity.test.ts` — **17/17 passed**, 0 skipped.
- Два описанных дополнительных воспроизведения — **2/2 passed** как подтверждение существующего отказа. Fixtures сохраняются в отдельном ignored namespace.
- Прочитаны новые admin/chain-view/domain tests и actual SBF runtime test source. SBF, built-origin и live lifecycle этим critic не перезапускались; их исполнение принадлежит lead. Исторические результаты не аттестуют изменённый binary.
- По новому diff не обнаружен дополнительный подтверждённый обход signer/authority, двойная выплата, numeric rounding или потеря retained receipt. Это ограниченный результат review, не сертификат безопасности или production readiness.
- Servicing отличает principal retirement от завершения coupon obligations. Evidence явно обозначает test SPL settlement, retained receipts, отсутствие historical archive/independent attestation; SHA-256 заявлен как integrity, не chain commitment. Эти ограничения соответствуют прочитанной реализации.

Официальный Solana docs MCP доступен и использован 2026-10-08 для проверки RPC context/config и ATA semantics. Технические ориентиры: [официальный Kit getProgramAccounts API](https://github.com/anza-xyz/kit/blob/HEAD/packages/rpc-api/src/getProgramAccounts.ts), [официальный Solana create token account](https://solana.com/docs/tokens/basics/create-token-account). `minContextSlot` — нижняя граница, поэтому два совпавших discovery-наблюдения не дают доказательства исчерпывающего множества на промежуточном финансовом слоте; текущая отметка `completeAtFinancialContext:false` это честно сохраняет.

Initial cutoff SHA-256 (фактические bytes до исправлений):

| Файл | SHA-256 |
| --- | --- |
| server/proposal-discovery.ts | 6F0804564EDD0AC5053BDC4A5BD28CF1B3D88A87979AC3F2D6265109372AE9E7 |
| server/chain-view.ts | 2EE51AB8843B7E5A04A58C252C1B6C32F874FEB57F49BA4189D02E00391761AA |
| server/admin.ts | 2C1A00326A1E0BAE93E51CC60FACA5FB62ACD6372B2A417E74ABEB0207DEB711 |
| programs/bondtrace/src/lib.rs | 39C4A37070AB14605AF6FA339AB08F2DDF40101EBAE791621518B022EFBD7877 |
| server/servicing.ts | A83821BB6BE00FF53810CA3FA2181CE0C1A40AE60587613974BBD64DBCE26F62 |
| server/evidence.ts | 811B3B04F193CE36178F766D026FFF65D29A0E910779C04907EC1B6BC7D2FF5D |

Статус initial: **repair requested, S1/S2 открыты**. Оценочные баллы не выставлялись. Следующий шаг — ограниченные исправления и их проверка; final submission, public visibility, mainnet, реальные деньги и paid services не разрешены этим review.

## Repair 1 — проверка исправлений

Сохраняется исходная lineage S1/S2 и её факты; это первая из максимум двух проверок исправлений. Те же выбранные skills и stopping gate. Прочитаны изменённые discovery/chain-view/admin, регрессионные tests, `scripts/servicing-smoke.ts`, evidence route и предыдущий отчёт. Другие audit opinions не использованы.

**S1 — исходный отказ закрыт на уровне кода и synthetic RPC.** Финансовый граф больше не зависит от количества обнаруженных proposals: выбирается не более 32 минимальных числовых IDs из union, выводятся omitted/catalog/selection поля, полное множество identity headers fingerprinted до/после чтения. Race за пределами окна вызывает повтор всего coherent read. Malformed envelope/discriminator/bond/duplicates проверяются для всех заголовков. PDA derivation выполняется только для выбранного окна; принят меньший объём проверки, чем предложен первоначально, поскольку omitted identities не поставляют финансовые values, `unverifiedPdaCount` явно раскрывает границу, а `completeAtFinancialContext:false` сохранён. Такие omitted identities нельзя в итоговом описании назвать проверенными каноническими Proposal.

**S2 — API fix закрыт; actual prefunded runtime proof на этом cutoff ещё ожидается.** Optional lookup проверяет canonical ATA, SYSTEM owner, executable=false, строго пустой base64 payload, безопасное число lamports и space, прежде чем вернуть vacancy. Negative envelopes не проходят. Этот путь также корректно используется регистрацией; существующие SPL account authority проверки не ослаблены. Source smoke действительно включает close → 1-lamport prefund → issuance через API и separate recreate для второго holder. Успех выполнения здесь не приписывается: итоговый evidence файл на момент проверки ещё отсутствовал.

### S3 · P2 · В repair 1 catalogProposalsResolved ошибочно игнорирует omitted IDs

**Место:** `server/reconciliation.ts:94` в repair-1 snapshot (SHA-256 `6B7F07BAFB60EDF43EAC08E9AE6023EE6D6315F73FF031B21551EDB27A93F984`). Флаг проверяет только `missingProposalIds`, который после S1 fix относится лишь к выбранному окну.

**Воспроизведение:** 40 обнаруженных IDs 0..39 и catalog `['0','38','100']` → `omittedCatalogIds=['38','100']`, `catalogIdsAbsentAtDiscovery=['100']`, `missingProposalIds=[]`, но `catalogProposalsResolved=true`. Следовательно новый reconciliation/evidence summary утверждает разрешённый каталог при заведомо отсутствующем и непрочитанном ID. Финансовые суммы остаются правильными; проблема в достоверности coverage-вывода.

Изолированный `.local/tests/servicing-critic-bad8e52c5af84007ad815e20f0c325f9/repair1-scope.test.ts` выполнен, **1/1 passed**, то есть противоречие воспроизведено. Исправление: вычислять этот флаг по фактически прочитанным и проверенным catalog IDs; как минимум требовать отсутствие и missing, и omitted catalog IDs. Проверить false при omitted absent/present catalog и true при полностью разрешённом каталоге.

Проверки repair 1:

- Независимый запуск `node --import tsx --test tests/client/proposal-discovery.test.ts tests/client/chain-view.test.ts tests/client/admin.test.ts` — **37/37 passed**, 0 skipped. Это 7 discovery +18 chain-view +12 admin, не заявленные в передаче 15 admin.
- Smoke source выполняет реальные unsigned preparation/sign/submit/recovery проверки, сохраняет evidence только после проверенных coupon/principal/supply/vault assertions, проверяет canonical payload hash. В нём нет подстановки mock-success или fabrication signatures. Область test localnet/generated signers явно указана. Указание corrected SBF необходимо дополнить отдельным deployment/binary evidence; сам скрипт bytecode не сравнивает.
- Smoke проверяет неизменность своего isolated legacy fixture; эта проверка сама по себе не доказывает неизменность original main ledger. Original ledger не читается и не изменяется critic.

Repair-1 reviewed hashes:

| Файл | SHA-256 |
| --- | --- |
| server/proposal-discovery.ts | 485503E9698E3955C1A6B51F9930FBFE7E256800B472A5F574005E640B08348A |
| server/chain-view.ts | 04D9F2BE93EBC4068531272065A558C2E779AFF1E5BD2D1993EA2666F4D5219C |
| server/admin.ts | 47CBAE0268437B3EC45E353DEB80C7A2BFCEC345A8560F403B4196E0F24D359E |
| server/reconciliation.ts | 6B7F07BAFB60EDF43EAC08E9AE6023EE6D6315F73FF031B21551EDB27A93F984 |
| scripts/servicing-smoke.ts | 9690043860371F8F6C02DCAF7B4D328B50C1F1059809CC61A2BFD668EA3CB707 |

Статус repair 1: **S1 закрыт; S2 код закрыт/runtime pending; S3 открыт**. После первой передачи S3 lead начал менять reconciliation; изменённая версия не получает acceptance этого cutoff автоматически. Осталась одна проверка исправлений, с новым hash и завершённым runtime evidence.

## Final repair 2 — закрытие прежнего servicing scope

Дата проверки: 2026-10-08. Перечитаны обновлённый AGENTS.md и актуальный STATE; сохранены уже прочитанные неизменившиеся skills **ProofPilot coach, solana-dev security/testing, review-and-iterate**. Проверены текущие source, полный предыдущий issue lineage, smoke source, retained lifecycle log, runtime/Node logs и оба JSON evidence. Это вторая и последняя проверка исправлений данного servicing scope. Новый пользовательский запрос на расширение Technical Execution/Corporate Action Logic не входит в её verdict и не сбрасывает этот budget.

| Finding | Итог | Основание |
| --- | --- | --- |
| S1 | Closed | Корректные наборы больше32 не выключают финансовый граф; bounded numeric window, полный header fingerprint и явные omitted/PDA-unverified границы сохранены. В `servicing.votingCoverage` добавлено то же описание области. |
| S2 | Closed для проверенного localnet scope | Source guard и negative tests сохранены. Завершённый retained actual lifecycle включает closed ATA → **890880 lamports** rent-prefunding → API issuance, а также отдельное восстановление ATA второго держателя. Это не live перевод1lamport. |
| S3 | Closed | `catalogProposalsResolved` теперь требует одновременно отсутствие missingProposalIds и omittedCatalogIds. Независимо выполненная regression с40 proposals проверяет false для catalog0/38/100 и true для полностью прочитанных0/1. |

### Проверенные результаты и происхождение

- Narrow independent test: `node --import tsx --test --test-name-pattern='more than 32 valid' tests/client/chain-view.test.ts` — **1/1 passed**, exit0,0 skipped. Проверены и неполный, и полный catalog cases внутри теста.
- Retained `.local/backend-servicing/node-final-tests.log`: **117/117 passed**,0failed/0skipped. Retained `.local/program-audit-20261008/program-after.log`: **3 unit +8 runtime passed**,0failed/0ignored. Critic прочитал и сопоставил эти logs с текущими regression sources; полный набор и SBF самостоятельно не перезапускал.
- Независимая offline-сверка `.local/backend-servicing/lifecycle.log` с `docs/evidence/servicing-lifecycle-localnet.json`: все19 API signatures совпадают по порядку, instrument один и тот же;19API+4aux дают23 уникальные signatures. Log заканчивается `passed:true` после source assertions.
- Для `Cu3YxSD7EZbEHxP687hwQMwGj2q1TLqY2P4Budde7a2L` суммы entitlement rows отдельно пересчитаны BigInt: principal `15000000000`, coupons `1125000000` minor units; все положительные права отмечены claimed. Итог:15issued/15redeemed/0mint supply, vault0. Предшествующий servicing snapshot сохраняет `fullySettled:false` и coupon debt1125000000 после burn; финальный `fullySettled:true`. JSON HTTP/lifecycle совпадают по instrument и genesis.
- Прочитан `.local/backend-servicing/verify-http.mjs`: он действительно читает Program account, извлекает ProgramData address, проверяет loader discriminator, сравнивает deployed bytes после45-byte metadata с actual `target/deploy/bondtrace.so`; evidence пишется после assertions. Текущий local binary независимо захеширован:462232 bytes, `a46736e7e38b27db356f78c3dcefad0c02ef2147eaa21cb0161cfb6ee53739e1`, что совпадает с retained HTTP evidence.
- HTTP source проверяет built HTML, attachment header, payload SHA-256, отсутствие private export fields, empty-metadata financial/proposal recovery, отсутствие придуманных receipts/record slots и saved operation recovery. Критик не выдаёт retained assertions за собственное повторное выполнение endpoint checks.
- `git diff --check` для назначенного backend/client/program/tests scope — exit0. Исходные отчёты, failed1-lamport attempt и исторические evidence не заменены.

**Текущее live-ограничение:** попытка critic независимо перечитать `getGenesisHash` из `http://127.0.0.1:8919` завершилась `ECONNREFUSED` до любого дальнейшего RPC. Поэтому signatures и deployed ProgramData не были повторно подтверждены critic в живой сети на этом cutoff. Закрытие S2 опирается на inspected source + retained successful runtime/lifecycle/HTTP artifacts, а не на обещание, что validator сейчас запущен. Процессы не перезапускались; network writes, signer reads и live transactions не выполнялись.

### Final reviewed source snapshot

Хеши относятся к фактическим bytes этого cutoff. Последующие изменения новой execution-функциональности требуют отдельной проверки своего diff и не наследуют этот verdict автоматически.

| Файл | SHA-256 |
| --- | --- |
| programs/bondtrace/src/lib.rs | 39C4A37070AB14605AF6FA339AB08F2DDF40101EBAE791621518B022EFBD7877 |
| packages/client/src/program.ts | 87F454B5500AD804E63FC7FE4F818B890B8E0256BC2431A31FE5EAEF49BF649F |
| server/admin.ts | 47CBAE0268437B3EC45E353DEB80C7A2BFCEC345A8560F403B4196E0F24D359E |
| server/operations.ts | 3EDCCBC8050AF6048354D9E7769E19B183A793F93DFB56523BF4BA45776EA368 |
| server/prepared.ts | E6FA04B0D54C4D881BBCC518A63F7AF7FAFBD59F445CCA2625260A0FA6335349 |
| server/chain-view.ts | 04D9F2BE93EBC4068531272065A558C2E779AFF1E5BD2D1993EA2666F4D5219C |
| server/proposal-discovery.ts | 485503E9698E3955C1A6B51F9930FBFE7E256800B472A5F574005E640B08348A |
| server/servicing.ts | 5F9B1F79B923A75B8141AB6764D7D4E2EE4544B19A896C9A8DEDA0183F7D198D |
| server/evidence.ts | 811B3B04F193CE36178F766D026FFF65D29A0E910779C04907EC1B6BC7D2FF5D |
| server/state.ts | 9096C2FD1B234C900733EE889E03CC0AC45D23F8765138593706404D304FC8D9 |
| server/reconciliation.ts | 92ED794D4AA9F8F2BF707F3D54888F04353CEA2C6025E2D7632271FB009B7713 |
| server/index.ts | CBF5220CC3CD03104DA9D981D8BDAD4C996CC6F111C64FB231FA07EC08659A7E |
| scripts/servicing-smoke.ts | 91DD6DD7992ECA306458D06D0703B422984FD8C75713CB8FC7784CF898DA5C52 |
| tests/client/chain-view.test.ts | 32B8E0E11590C5F6C93F4D87B8B55814109624C19B1F7F5A943513689155526D |
| tests/client/admin.test.ts | C088B42F194D8FF0E555B6EB218110F785356E2F7BEE4CBB1BFDB7584C2CED9F |
| tests/program/runtime.rs | FE95252044F07F10F6B98825E1F1452E397D403CEEEBFA0D99811BE2E03B900E |

Final evidence snapshot:

| Артефакт | SHA-256 |
| --- | --- |
| docs/evidence/servicing-lifecycle-localnet.json | 880AD30583239F2802AF595D77789A0A964DE15C46621CB0FE3F4AA1525F7A9E |
| docs/evidence/servicing-http-localnet.json | 6E6C830D1B939F83B5986D3B1285940C51DF0C597761CD369DFE5EB08D38CF6E |
| .local/backend-servicing/node-final-tests.log | 960EF2FDF70056950D06034E25788736CC18CD81A17AFF04A39EF0B092C1E277 |
| .local/program-audit-20261008/program-after.log | 50936F6BB0C6CC8A3D4C049D862A9057F5C96A9E62F0288C733C62FB0573FCB7 |
| .local/backend-servicing/verify-http.mjs | 5AE8E88377C8953C543915A32E0E015323E3C6E0D285E0D98A7097C6BBD3A64F |

**Final servicing review disposition:** S1/S2/S3 закрыты в указанном source/localnet-evidence scope; новых подтверждённых code blockers не найдено. Initial+repair1+repair2 завершены, budget этого review исчерпан без новой переоценки. Не подтверждены current-live availability, human-wallet UX, devnet/public hosting, промышленная готовность, eligibility или submission. Mainnet/реальные средства/paid/visibility/consent gates сохранены.
