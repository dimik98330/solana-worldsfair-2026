# Независимое review нового hosted evidence — 9 октября 2026

## Вывод и границы

**Материальных P0/P1 в проверенном новом пакете не обнаружено.** Предоставленные артефакты согласованно подтверждают записанный автоматизированный devnet-сценарий: 26 различных транзакций, 22 бизнес-ID, точные выплаты и burns, неизменные фиксированные права и пассивное чтение тех же ID после заявленного перезапуска. Пакет пригоден для ограниченных технических утверждений о конкретном тестовом cohort. Это не вывод о готовности финальной заявки, production или успешной человеческой подписи.

Режим ProofPilot: **coach / review / application**, только предоставленные локальные материалы; reviewer: **separate_context**, model label: unknown. Новый scope — hosted evidence и RPC/catalog changes, исходная проверка; repairs: 0. Старые driver/PG/backend assessment и их budgets не открывались заново. Числовой балл, официальный score, eligibility и разрешение на подачу не присваиваются.

Прочитаны AGENTS.md, START и текущий STATE. Использованы реально установленные `.agents/skills/proofpilot/SKILL.md` с routing/onboarding limited-work exception/review/evidence/safety/quality/quality-review/honest-evaluation/event-assessment; `.agents/skills/solana-dev/SKILL.md` и применимая security guidance; установленный ECC2.2.3 `skills/security-review/SKILL.md`. Colosseum/account setup не запускался. Пакет не передавался внешним сервисам. Короткий план: freeze → отрицательные/взаимные проверки → точная арифметика → recovery/backup → ограниченный вывод.

Выполнены только локальные JSON/hash/BigInt/consistency checks и отдельно разрешённая **read-only** проверка скачанного SQLite backup. Не выполнялись сеть/RPC/браузер/кошелёк, новые подписи, сервер/storage imports, PostgreSQL connections, runtime restart, build/tests/install/Git или чтение private deployment files. Единственный созданный файл — этот отчёт. `quality.js` run не создавался: review передаётся lead для его итогового workflow; этот Markdown не является helper acceptance certificate.

## Frozen inputs

| Артефакт | Проверенные bytes / SHA-256 |
|---|---|
| `docs/evidence/hosted-devnet-20261009.json` | 614717 / `36b224e0ff562cc7b63f402db7c17e494df9f1acd86e6494b244e70d2ded5866` |
| `docs/evidence/hosted-wallet-check-20261009.json` | 2073 / `dce65110798f45440b432bff3ccb588b69af2276ab7e33218994d310657747ef` |
| `server/rpc-control.ts` | `700e3fd0e9a936283e0b8722e4ff313b7dee99e1e934ba510ec04a7b7c455ac3` |
| `server/rpc.ts` | `4f691ce0f6f88cdfda4c5c4907293bc0f931095315e09b237c26f3f9e9e0260b` |
| `server/state.ts` | `6683e1959c13d11a7a68f9999c208ce72fed0b16c03af69727f161c16fbff380` |
| `tests/client/rpc-control.test.ts` | `f8633dd5684d2662671e05ad969e10f6c220a49845953a1df9dfe2a027858883` |
| `tests/client/catalog-selection.test.ts` | `ec342b5a21846fe14ac9bfffafcad3e54c5110187779c8aaa3503e0483b48631` |
| `server/transaction-proof.ts` | `101237b41a42053699db5b0eaf102ca0e3f87ad9d9ca7d7e78160f25c2557cdd` |

Пакет checkedAt `2026-10-09T17:38:03.069Z`, declared deployed source `bac8475fdbc4ac5b9dd6617020735dae7bb19d66`, exact program hash `761b993d403ae03a84e94475404299b0d4e798a6ea2d17ae44e003148077bdfd`, 541456 bytes. Git/провайдер/бинарник независимо не опрашивались; commit и deployment являются атрибуцией артефакта, а не новой проверкой deployment этим reviewer.

После freeze lead разрешил материалные claim checks в README EN/RU, TECHNICAL и docs31/33. Их hashes при чтении: README `8917566fd79f775112275f23d58e323a2680584e4f0fef832102d687ff1e5503`; README.ru `9e276b284e9179edc1d258f2151169db9b5ad442db46898e7776eb04b59a27fe`; TECHNICAL `36a633b5af0eec8a1c74598e5a9f5711929d9e3792c454863b58066067ebbc84`; docs31 `fa8b0a9b961cfad834c3ffb574e804c4ee7429425425d7f462dff72567f6908c`; docs33 `42575b790d59757c4913c436044d6ec139a53eb3963cb3b958c04e674a672136`. Проверены новые hosted claims и limitations, не все исторические отчёты.

## Наблюдённые проверки артефактов

1. **Binding и finality.** У `financialCycle` cohort `0ecfadd0-5db1-4c19-a16c-78b6cb314902`, bond `2KWpyE9mQWS6VTviCJFi1b4Zh55rti9xeDS6yk37sU7Y`: 22 уникальных business operationId и 4 auxiliary, всего 26 уникальных signature и 26 proofs. Для каждого proof `transactionSha256` совпал с pre-send `wireSha256`; signature/genesis/slot/finalized согласованы. Все 22 business `messageSha256` равны исходному operationId, `expectedWireMatched:true`. Auxiliary честно имеют `expectedWireMatched:null`: внешний pre-send wire hash совпадает с proof, но API journal наблюдал их **после** отправки. Это не pre-send app-journal proof.
2. **Точная арифметика.** Для всех 26 proofs сумма lamport pre/post соответствует fee, общие fees — **135000 lamports**. Суммы восстановлены из proof token deltas, не только из строк summary: coupon `900000000`, principal `18000000000`, burns `18`; final supply/vault/remaining obligations — `0`.

| Держатель по порядку cohort | Купон base units | Principal base units | Burns |
|---|---:|---:|---:|
| 1 | 500000000 | 10000000000 | 10 |
| 2 | 250000000 | 4000000000 | 4 |
| 3 | 150000000 | 4000000000 | 4 |

Settlement mint имеет 6 decimals: это 900/18000 тестовых SPL единиц; первому держателю 500/10000. Реальные fiat/ценные бумаги из этого не следуют.

3. **Snapshot/голосование.** Перед transfer текущие units 10/5/3; после него 10/4/4. Coupon entitlements и eligible voting weights остались 10/5/3. Голоса записаны 13 yes / 5 no, три voted wallets; proposal информационный. Финансовые terms до/после voting совпали после удаления только меняющегося read-contextSlot. `proposalCoverageComplete:false` сохранён: нельзя называть это полной аттестацией всех возможных proposal в одном финансовом контексте.
4. **Recovery.** `restart.observations` содержит 48 наблюдений: 22 исходных ID + 26 исходных signatures. ID→signature binding, complete projection, finalized/genesis/slot сохранились. Содержимое всех **26 retained proof bodies совпадает при canonical JSON comparison**; новое наблюдение finality может иметь более поздний context. Financial instrument/holders/coupons/redemption/proposals/supply/totals/principal совпали; исключён только `instrument.financialTerms.contextSlot` (`509253633` → `509256255`). Mode явно GET-only, без POST/send/sign/rebroadcast/resume. Это чтение прежнего исполнения, а не новый финансовый цикл. Aggregate signature отсутствует; finality относится отдельно к каждому signature.
5. **Backup.** Разрешённый `.local/hosting-live/pre-restart-backup/backup.json`: 273771 bytes, SHA `91657741bb5561dc458ff18e2a4fbb789eb119771004e1ab2b62db3ef6a7928d`. Base64 database точно совпал с `verified/metadata.sqlite`: 204800 bytes, SHA `f284315db1a6aa394cacb2abd362ff278395528877d5592bf3c0012b27b01d5d`. Envelope manifest совпал с verified manifest; read-only `PRAGMA integrity_check` дал `ok`, application_id `1112822339`, user_version `1`. Source manifest: postgres, generation4, acknowledgedAt `17:30:02.499Z`. Проверены скачанные bytes и целостность portable **public metadata** snapshot; restore live service/полнота offsite retention/PostgreSQL physical backup не проверялись и не заявляются. `metadataDownload.checkedAt` 17:29:19 — метка producer run; manifest createdAt 17:30:02 — более точная метка создания snapshot.
6. **Phantom и безопасность публикации.** Wallet packet сохраняет owner-reported approval отдельно от результата SDK `Unexpected error`: prepared/not_submitted, signature:null, successfulHumanWalletTransactionVerified:false; direct-check record указывает absent account и unchanged30000000 lamports. Автоматизированные generated signatures не выдаются за человеческую подпись. Рекурсивная проверка обоих public JSON не обнаружила credential-bearing keys, private-key markers, credential URLs/userinfo, database connection strings или абсолютных Windows/Unix host paths. Публичные адреса, Explorer/HTTPS URL и относительные ignored artifact locators не являются секретами.

## Source review и сохранённые ограничения

`rpc-control.ts` применяет общий devnet FIFO/backpressure, bounded64 pending, 250ms global /1250ms method gaps, shared Retry-After cooldown, deadline включая queue и consumer. Только whitelist read methods повторяют HTTP429, максимум два retry; sendTransaction/airdrop/unknown methods автоматически не повторяются. Generation fence вызывается после ожидания непосредственно перед fetch без промежуточного await. `rpc.ts` подключает его для sendTransaction, сохраняет строгую envelope/error/finality validation. `state.ts` добавляет только read-only catalog selection; выбранный адрес всё равно проходит coherent chain graph и identity validation. Transaction-builder default и numeric logic этим fallback не подменяются.

Статические регрессии проверяют pacing/queue/deadline/body cancellation/неповторение send/fresh fence, а catalog tests — exact >2^53 amounts, explicit/legacy selection priority, identity substitution и absent newest account fail-closed. Тесты здесь **не перезапускались**. Пакет сообщает 288 Node pass/0 fail/10 optional PG skip и52 UI pass, 13 RPC/45 catalog-related scoped checks; это recorded результаты lead. Сохранённый первоначальный synthetic devnet timeout и изменение только harness bound180s не превращены в SLA или новый PG suite.

Сохранённый новый cohort отделён от failed RPC429 draft/zero-issued cohort; widened dates/one-shot filename явно указаны в provenance. Не найдено утверждений об исправленном Phantom, production certification, KASE/bank integration, официальном балле либо выполненной contest submission в новых frozen hosted claims.

Reviewer не наблюдал Render Restart service action лично: его факт — отчёт lead и соответствующие сохранённые post-restart observations, не независимое подключение к provider. Первый HTTP502 остаётся видимым. Proof capture source проверяет canonical signed wires/Ed25519/успешный RPC outcome до сохранения; этот reviewer сверил нормализованные сохранённые proofs и hashes, но не переснимал RPC и не выполнял повторную cryptographic verification сырых wires, которых public packet не содержит. Встроенный evidenceDigest относится к отдельному exported payload; в этом review он не объявлен независимо пересчитанным.

## Source-grounded quality checks

| Check | Результат |
|---|---|
| fact_fidelity | pass: producer/runtime/RPC/user-report и reviewer observation разделены |
| arithmetic | pass: BigInt proof deltas, fees, burns, units и6 decimals сверены |
| evidence_support | pass: exact hashes/IDs/proofs/state/backup; ограничения fresh attestation сохранены |
| constraints | pass: offline scope и file ownership соблюдены; старые budgets не сброшены |
| verdict | pass: только ограниченный технический artifact conclusion; no official/production/submission score |
| next_step | pass: lead может использовать exact scoped claims; человеческая подпись остаётся отдельным unresolved check |
| task_scope | pass: новое hosted evidence/RPC/catalog; без повторного старого backend audit |
| action_bounds | pass: нет сети, подписи, новых финансовых действий или external writes |

Material issue records: **нет**. Остаточная неизвестность не скрыта: Phantom root cause/success, независимая свежая сеть/provider attestation, production reliability, live restore и конкурсные/аккаунтные gates этим review не устанавливаются. Итог относится только к указанным frozen bytes; изменённые после них claims требуют отдельного точечного сравнения.
