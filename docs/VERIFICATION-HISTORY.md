# Verification history / История проверок

[Current hosted deployment](33-HOSTED-DEPLOYMENT.md) · [English README](../README.md) · [Русский README](../README.ru.md)

These are separate historical verification cohorts, preserved with their source IDs and original results. Words such as current/final in dated underlying reports refer to that report's cutoff. They do not replace the later hosted devnet evidence. No failed run is relabelled successful.

## Verification and evidence

Recorded backend snapshot: **SBF 541,456 bytes**, program `B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8`, SHA-256:

```text
761b993d403ae03a84e94475404299b0d4e798a6ea2d17ae44e003148077bdfd
```

The current release manifest is [programs/bondtrace/release.json](../programs/bondtrace/release.json). Counts below describe their recorded runs; they do not claim every check was performed in the same run or that historical evidence matches later UI changes.

| Check | Recorded result | What it establishes |
|---|---|---|
| Clean-source application/client suite | **219 Node tests**, **52 UI tests**, application build and frozen SBF hash passed | Exact amounts, parsing, relay/recovery and UI regressions; mocked transports are not live-network evidence |
|9October backend/hosting follow-up | **241 Node tests**, **52 UI tests** and current app build passed, including the3asset-repair cases | Hosted auth/origin/storage, disabled-signer boundary, RPC redirects and real HTTP missing-asset behavior; separate cohorts |
| Published Git58 clean reproduction | **243 Node /52 UI**, all11commands passed_snapshot;39actual finalized transactions | Exact immutable Git58 source, native SQLite, new ledger and API/validator restart; [source-bound result](../docs/evidence/jury-git58-reproduction-20261009.json) |
| Verified Git source snapshot e8f08fb | **266 Node passed /10optionalPG skipped,52UI**, all7commands passed_snapshot | Exact immutable Git archive: npm install/build, direct SBF build/hash and source-drift check; [result](../docs/evidence/jury-gite8-source-20261009.json); no new financial transactions in this verify-only run |
| PostgreSQL preparation | **43 targeted tests,0skipped** against isolated PostgreSQL16.15; default suite266passed/10PGcases skipped,52UI and build passed | Real transactions/TLS/fencing/COMMIT-ack loss/backup; synthetic Solana in the barrier test is separate from real lifecycle proof |
| Real PostgreSQL-backed lifecycle | **39 actual Solana transactions**, all observed finalized; coupon2,500/principal25,000/burn25/remaining0 | Same IDs/totals after API+validator restart,105-document downloaded backup, no local fallback; [17source hashes and full proof](../docs/evidence/postgres-preparation-20261009.json) |
| Isolated Linux hosted PostgreSQL | Node22.14.0/UID1000, verified TLS1.3, auth/origin/assets, backup/restart passed | [Actual process proof](../docs/evidence/hosted-postgres-linux-20261009.json), financialReady:false because devnet program absent; no Render/Neon provisioning |
| Separate program test run | **3 Rust unit + 16 actual SBF/SPL runtime tests**, including **64 deterministic sequences** | Real compiled program execution in LiteSVM, financial invariants, rejection cases and rollback; separate from the clean live cycle |
| Main live built-origin lifecycle | **39 distinct localnet transactions**, all observed finalized with retained schema2 proofs | Coupons **2,500**, principal **25,000**, **25** bonds burned; remaining obligations, supply and vault **0**; actual API/validator restart |
| Separate clean-source lifecycle | **39 distinct localnet transactions**, same financial totals, fresh keys/state/genesis | Reproduction from an allowlisted source copy on the prepared host; compiler/npm caches may be reused |
| Runtime/storage probes | Bounded quota stop, readiness and recovery evidence | Owned runtime stops on storage limits; supervision does not sign payments |
| Current interface review | Recorded browser input/render evidence at **320 / 390 / 768 / 1440 / 2560** | Working console layout and interactions against the read-only archive; no new wallet/chain proof |
| GitHub Actions | Manually dispatchable workflow supplied | Definition only; no remote CI execution is claimed |

[Main lifecycle](../docs/evidence/execution-strengthening-20261008172355127-29505989.json) · [clean reproduction manifest](../docs/evidence/clean-source-reproduction.json) · [separate clean lifecycle](../docs/evidence/execution-strength-clean-549f5703-645c-4870-8b70-ccc5c58f8a20.json) · [storage probes](../docs/evidence/runtime-strengthening-probes.json) · [browser QA](../docs/design-qa.md).

Each cohort retains its own issue, genesis, signatures and timestamps. At the final read-only review, the original RPC transaction history had been pruned: retained finalized observations are historical evidence, not a claim of fresh RPC confirmation today. Local Explorer links require the corresponding validator. These observations are not a third-party attestation.

```powershell
npm test
npm run test:ui
npm run build
npm run test:program
node scripts/write-program-release.mjs --check
npm run metadata:check
npm run verify:source
```

`verify:source` creates a new ignored source copy, builds it and runs another actual localnet lifecycle; it writes new test transactions. Likewise `demo:lifecycle`, `smoke` and `smoke:issuer` create new test issues. Run them deliberately. `metadata:check` checks SQLite integrity without chain mutation. For an isolated Ubuntu24.04 x64 CI runner/container with Node22.14.0 already installed:

```bash
BONDTRACE_CI=true bash scripts/setup-isolated-toolchain.sh
bash scripts/ci-verify.sh
```

PostgreSQL integration is separate from the default localnet setup: use a disposable loopback PostgreSQL16 database at127.0.0.1:32545 named bondtrace_tests, set BONDTRACE_TEST_PG_URL only in the test process, then run `npm run test:postgres`. The runner rejects unrelated endpoints and runs sequentially. [Optional local Compose fixture](../deploy/postgres-test.compose.yaml) contains a synthetic public test password; its Docker image was not run here. TLS handshake cases additionally need BONDTRACE_TEST_PG_CA and a matching local TLS server. Never reuse the hosted DATABASE_URL for destructive schema/fault tests. The published43-test cohort used a real isolated server and local test CA, with no skipped TLS cases.

This runs application/client/UI/SBF and Rust runtime checks. It does not run the live Windows lifecycle or prove a devnet deployment. The GitHub workflow is manual, not automatically triggered by a push.


---

## Какие проверки проведены

Зафиксированный backend release: **541 456 байт**, программа `B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8`.

```text
SHA-256: 761b993d403ae03a84e94475404299b0d4e798a6ea2d17ae44e003148077bdfd
```

| Проверка | Зафиксированный результат | Что подтверждает |
|---|---|---|
| Чистая копия исходников |219 Node,52 UI, сборка приложения/SBF и совпадение frozen hash | Точные суммы, парсинг, recovery/relay, UI-регрессии; mocked RPC не выдаётся за live chain |
| Backend/hosting9октября |241Node,52UI и текущая сборка прошли, включая3asset-регрессии | Вход/origin/диск, блокировка demo-подписантов, RPC redirects и настоящий HTTP-отказ для отсутствующих assets; отдельные наборы доказательств |
| Чистое воспроизведение опубликованного Git58 |243Node/52UI, все11команд passed_snapshot;39настоящих finalized-транзакций | Неизменяемый Git58, SQLite, новый ledger и API/validator restart; [результат с привязкой к source](../docs/evidence/jury-git58-reproduction-20261009.json) |
| Проверенный исторический Git-срез e8f08fb |266Nodepassed/10optionalPGskipped,52UI, все7команд passed_snapshot | Неизменяемый Git-архив: npm install/build, сборка/хеш SBF и отсутствие source-drift; [результат](../docs/evidence/jury-gite8-source-20261009.json); verify-only не отправляет новые финансовые транзакции |
| PostgreSQL-подготовка |43профильных теста,0пропусков на PostgreSQL16.15; обычный набор266passed/10PGкейсов skipped,52UI и build passed | Настоящие транзакции БД/TLS/fencing/потеря COMMIT-ack/backup; SolanaRPC в barrier-тесте синтетический и отделён от live lifecycle |
| Настоящий lifecycle с PostgreSQL |39реальных Solana-транзакций, все observed finalized; купоны2 500/номинал25 000/burn25/остаток0 | Прежние IDs/итоги после API+validator restart, скачан backup105документов, local fallback отсутствует; [17source hashes и полный proof](../docs/evidence/postgres-preparation-20261009.json) |
| Отдельный Linux hosted PostgreSQL |Node22.14.0/UID1000, verifiedTLS1.3, auth/origin/assets/backup/restart passed | [Проверка настоящего процесса](../docs/evidence/hosted-postgres-linux-20261009.json), financialReady:false из-за отсутствия devnet-программы; без Render/Neon provisioning |
| Отдельный program-run |3 Rust unit +16 SBF/SPL runtime, включая64 последовательности | Реальный скомпилированный SBF в LiteSVM, финансовые инварианты, отказы и rollback |
| Основной live API-прогон |39 отдельных localnet-транзакций, observed finalized и schema2proofs |2 500 купонов,25 000 номинала,25 сожжённых облигаций; obligations/supply/vault0; API/validator restart |
| Отдельный clean-source live-прогон |39 транзакций, те же финансовые итоги, новые keys/state/genesis | Воспроизведение на подготовленном компьютере, с допустимым переиспользованием compiler/npm caches |
| Runtime/storage | Quota stop, readiness и recovery probes | Остановка только собственного runtime при лимите хранения; без финансовых подписей |
| Интерфейс | Browser input/render evidence320/390/768/1440/2560 | Вёрстка и действия на read-only архиве; без новой wallet/chain-аттестации |
| GitHub Actions | Подготовлен manual workflow | Конфигурация; исполнение remote CI отдельно не заявляется |

[Основной прогон](../docs/evidence/execution-strengthening-20261008172355127-29505989.json) · [clean manifest](../docs/evidence/clean-source-reproduction.json) · [отдельный clean-прогон](../docs/evidence/execution-strength-clean-549f5703-645c-4870-8b70-ccc5c58f8a20.json) · [storage probes](../docs/evidence/runtime-strengthening-probes.json) · [browser QA](../docs/design-qa.md).

Каждый набор доказательств сохраняет свои issue/genesis/signatures/timestamps. К итоговому read-only review RPC уже очистил историю исходного прогона: сохранённые finalized observations являются историческими доказательствами, а не свежим публичным подтверждением сегодня. Local Explorer требует соответствующего validator. Это не независимая внешняя аттестация.

### Повторить проверки

```powershell
npm test
npm run test:ui
npm run build
npm run test:program
node scripts/write-program-release.mjs --check
npm run metadata:check
npm run verify:source
```

`verify:source` создаёт новую игнорируемую копию исходников, собирает её и выполняет другой реальный localnet lifecycle с новыми тестовыми транзакциями. В его Windows-прогон Rust-suite не входит: program-тесты выполняются отдельно. `demo:lifecycle`, `smoke` и `smoke:issuer` также создают тестовые выпуски; запускать осознанно. `metadata:check` проверяет выбранное хранилище без изменения блокчейна.

PostgreSQL-тесты идут отдельно: нужна одноразовая локальная PostgreSQL16 на127.0.0.1:32545 с БД bondtrace_tests. Задайте BONDTRACE_TEST_PG_URL только в окружении тестового процесса и выполните `npm run test:postgres`; runner отвергает другие адреса и запускает кейсы последовательно. [Необязательный Compose fixture](../deploy/postgres-test.compose.yaml) содержит публичный синтетический пароль, его Docker image здесь не запускался. TLS-кейсам дополнительно нужны BONDTRACE_TEST_PG_CA и локальный TLS-сервер с подходящим сертификатом. **Не использовать hosted DATABASE_URL** для schema/fault-тестов. Опубликованный прогон43тестов использовал настоящий отдельный сервер и тестовый CA без пропусков.

В изолированном Ubuntu 24.04 x64 CI runner/container с заранее установленным Node 22.14.0:

```bash
BONDTRACE_CI=true bash scripts/setup-isolated-toolchain.sh
bash scripts/ci-verify.sh
```

Linux CI выполняет application/client/UI/SBF и Rust runtime checks, но не полный Windows lifecycle и не devnet deployment. GitHub workflow запускается вручную, а не автоматически после push. Native macOS/ARM-запуск не проверен.
