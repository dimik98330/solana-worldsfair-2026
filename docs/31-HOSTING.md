# Render + PostgreSQL hosting / Хостинг Render + PostgreSQL

[English README](../README.md) · [Русский README](../README.ru.md)

## Hosted architecture and current status

The primary [render.yaml](../render.yaml) runs **one native Node22.14.0 service on Render's free plan**, with the built React UI and API at one HTTPS origin. **External PostgreSQL (Neon) holds public recovery metadata. Solana devnet holds the instrument, fixed holder rights, settlements and burns.** Investor/issuer/deployment private keys never belong in the service or database. The default local development adapter remains SQLite; PostgreSQL is explicit opt-in.

```mermaid
flowchart LR
  Browser[Browser + external wallet] -->|public HTTPS| App[Render: React + Node API]
  App -->|verified TLS, acknowledged COMMIT| PG[(Neon PostgreSQL: public recovery metadata)]
  App -->|reads, simulation, signed transactions| Solana[Solana devnet: program + SPL]
  Wallet[Wallet signs reviewed message locally] --> Browser
  App -->|authenticated portable download| Backup[Owner-retained SQLite snapshot + manifest]
```

**Live test application: [bondtrace-devnet.onrender.com](https://bondtrace-devnet.onrender.com).** At the 9 October 2026, 17:38 UTC evidence cutoff, Render Free native Node 22.14.0 in Frankfurt serves source `bac8475fdbc4ac5b9dd6617020735dae7bb19d66`. Neon Free in Frankfurt runs PostgreSQL 16.15 with verified TLS. The exact frozen program is deployed to Solana devnet. The strict public-origin verifier passed again after the actual Render restart: public app/API access, operator-only authentication, real entry JS/CSS, origin/demo restrictions, PostgreSQL read/write and `known-match` / `financialReady:true`.

The separate automated hosted devnet cohort **completed 22 business + 4 auxiliary transactions**, all 26 unique signatures observed finalized with execution proofs. Actual coupon/principal/burn closure, off-host backup and passive same-ID recovery after a provider restart passed; see [public evidence](evidence/hosted-devnet-20261009.json) and [actual deployment checkpoint](33-HOSTED-DEPLOYMENT.md). The earlier RPC429 cohort remains an empty preserved draft. The owner connected Phantom and reported approving a separate empty-draft attempt, but the app returned `Unexpected error`; API status remained `prepared` / `not_submitted` with `signature:null`. **Successful human-wallet execution remains unverified** ([wallet evidence](evidence/hosted-wallet-check-20261009.json)). The repository remains private; generated external test signers, localnet results and isolated Linux proofs do not replace this missing human-wallet result.

## Why this database

PostgreSQL provides transactional storage independent from a sleeping/redeployed web process. It stores public intents, signed transaction bytes, signatures, lifetimes, reconciliation metadata and proofs. It does not replace authoritative Solana accounts. The adapter reserves one pg client for each BEGIN–COMMIT, stages nested changes synchronously and publishes the local cache only after the exact COMMIT acknowledgement. An uncertain commit/timeout poisons that process: **no initial relay; recover the same retained ID/signature from a fresh process**. There is no automatic SQL replay, local fallback or destructive migration.

One API process is the writer. Its first successful write claims a generation; a replacement process fences the previous writer. Fresh primary checks run immediately before private signing and send/rebroadcast. A fenced process cannot reclaim its generation automatically. Stop the old instance, keep one instance, and disable automatic deploys. Passive CLI checks/backup exports are observers and do not claim a writer. Auxiliary setup transactions in the PG localnet driver use explicit external signing and have separate proof attribution.

Neon compute can suspend while storage remains separate. A cold start or failed connection is a retryable **availability** limitation, never permission to send without an acknowledged journal. Render free instances can also sleep. Free tiers have quotas and no production uptime guarantee; they are suitable for this test prototype, not a promise that a database can never fail. Keep independently retained downloads. The app snapshot limit is32MiB, a document8MiB; it fails closed rather than silently deleting recovery data.

Official references checked9October2026: [Render free limits](https://render.com/docs/free), [native Node version](https://render.com/docs/node-version), [Blueprint fields](https://render.com/docs/blueprint-spec), [Neon plans](https://neon.com/pricing), [Neon scale to zero](https://neon.com/docs/introduction/scale-to-zero), [pg transactions](https://node-postgres.com/features/transactions), [pg TLS](https://node-postgres.com/features/ssl). Provider terms may change. Render's free PostgreSQL expires; it is not the selected datastore. No paid services are authorized.

## Settings

| Setting | Required value/meaning |
|---|---|
| NODE_VERSION |22.14.0, same tested baseline |
| BONDTRACE_DEPLOYMENT |hosted; binds0.0.0.0 on platform PORT |
| BONDTRACE_STORAGE_BACKEND |postgres; default local adapter is sqlite |
| DATABASE_URL |Neon server-only connection URL; never a frontend VITE_ variable or committed file |
| BONDTRACE_DATABASE_TLS |verify-full; certificate/hostname verification cannot be disabled in hosted mode |
| BONDTRACE_DATABASE_NAMESPACE |Stable8–128 characters: letters/digits, underscore/hyphen; preserve across redeploys |
| BONDTRACE_DATA_DIR |.local/hosted/devnet; ephemeral scratch only, no local database fallback |
| BONDTRACE_NETWORK |devnet; exact official RPC and expected genesis |
| BONDTRACE_ENABLE_DEMO |false; generated signer/bootstrap disabled |
| BONDTRACE_PUBLIC_ORIGIN |Exact allocated HTTPS origin, no path/query/credentials |
| BONDTRACE_HTTP_USER |Operator backup/readiness login,3–64 ASCII letters/digits/underscore/hyphen |
| BONDTRACE_HTTP_PASSWORD |Unique random24–256 printable ASCII characters, entered as a Render secret; not a visitor login |

The URL parser accepts only sslmode and channel_binding options and constructs explicit verified TLS options; URL parameters cannot override certificate verification. Unencrypted PG is allowed only with the explicit local-only setting on loopback localnet. Never use that setting for Neon. The database role must create/use the dedicated bondtrace_metadata schema; use a separate project database, not an unrelated production database. Schema/application/network/program bindings reject mismatched state.

The application and ordinary API routes are public: there is no browser HTTP-login wall for visitors. Wallet signatures and Solana roles authorize financial actions. Operator HTTP Basic authentication remains on `/api/metadata*` and `/api/runtime/readiness`; operator credentials are still mandatory server secrets. `/healthz` returns data-free liveness. Financial readiness requires the exact deployed release/genesis; HTTP200 liveness alone proves neither. The hosted entrypoint refuses root API execution and never generates signer keys.

## Open the application

Open [the HTTPS application](https://bondtrace-devnet.onrender.com) and select an external wallet configured for devnet. No local server, WSL, Rust or validator is needed to use it. Public pages and ordinary API routes require no HTTP password. A connected wallet proves connection only; review and sign each intended operation in the wallet. Keep all issuer, holder and deployment private keys on the owner's workstation.

## Deploy or maintain this configuration

The current deployment is already provisioned. These steps describe a fresh deployment or controlled redeploy; do not create duplicate resources or replace the existing database/namespace to recover an operation.

**Select the matching checkout before steps 2–7.** For maintenance of the existing public v3 service, use the separately reviewed wallet-only commit `e658553632a8289c575494b0691e6c36ab92e7f0`, whose manifest expects 541456 bytes/SHA761b993d…077bdfd. Keep main/v4 in a separate checkout for local verification. Do not build/deploy main against the existing v3 program, edit the manifest to bypass a mismatch, or infer service code from GitHub's manual-deploy metadata. For a v4 public rollout, first complete the controlled program upgrade and independently verify 959536 bytes/SHAee2bb0f7…8f1ee12, then select the matching reviewed v4 service revision. Preserve the same database/namespace and one-writer fence. [Actual service supplement](33-HOSTED-DEPLOYMENT.md#current-supplement--10-october-2026).

1. Create the free Neon project/database and save its connection URL directly in Render secrets. Do not paste it into chat or a repository file. Use a stable namespace and a single API instance.
2. Verify the existing devnet program against [release.json](../programs/bondtrace/release.json) before considering a deployment. The current program is `B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8`, exact payload 541456 bytes / SHA-256 `761b993d403ae03a84e94475404299b0d4e798a6ea2d17ae44e003148077bdfd`. A fresh environment uses isolated deployment tooling and **test SOL**; the deployment key stays on the owner's machine. Preserve uncertain upload receipts and the original buffer instead of depositing rent into replacement buffers blindly.
3. Connect the private GitHub repository to Render as the owner; review render.yaml (native node, free, no disk, autoDeployTrigger off). Build: npm ci --include=dev --ignore-scripts && npm run build. Start: node --import tsx scripts/start-hosted.ts. No WSL/Rust/validator is required in the hosted Node service.
4. Supply the exact allocated HTTPS origin, database URL and unique operator login. Check `/healthz`200 and public `/`200 without WWW-Authenticate; unauthenticated metadata backup/readiness must return401. Inspect public `/api/health` and `/api/program`: metadata backend postgres and deployed program known-match are required for financial readiness.
5. From the repository root with Node22.14.0 and dependencies installed, run `npm run verify:hosted` with BONDTRACE_PUBLIC_ORIGIN / BONDTRACE_HTTP_USER / BONDTRACE_HTTP_PASSWORD supplied securely in that process environment. For the existing service, the origin is `https://bondtrace-devnet.onrender.com`. The verifier checks actual entry JS/CSS bytes, MIME/hash, origin/auth/demo restrictions, storage and release matching. Its loopback-only diagnostic override records financialReady:false; it cannot certify a public deployment. No WSL is required for this Node verifier. Never put credentials in a command transcript or documentation.
6. Connect an external devnet wallet, fund test SOL, create/register/distribute the instrument, fund the full principal-plus-coupon test SPL reserve, then seal. Capture records, settle coupons, vote, redeem and verify signatures/burn. The hosted service has no demo issuer private key; the issuer signs its own transactions. Use this final public origin for the browser check.
7. Download metadata, restart/redeploy once, verify the same namespace/IDs/signatures/reconciliation and recover existing operations. Do not create another payment to disguise lost metadata. Record the actual URL/version and results separately from local evidence.

The hosted build/start commands are:

```text
npm ci --include=dev --ignore-scripts
npm run build
node --import tsx scripts/start-hosted.ts
```

Set the table's environment values before starting; hosted mode requires PostgreSQL, verified TLS, the exact devnet/origin and operator credentials. These commands run the Node service and do not start a Solana validator. The historical localnet workflow in [README](../README.md) is a separate route with its own local toolchain and ledger.

## Backup and recovery

Authenticated GET **/api/metadata/backup** downloads one JSON envelope containing a consistent verified SQLite snapshot (base64), public manifest and SHA-256. The route accepts no filename/path/query/body, allows one bounded response at a time, sends no-store and cleans only its generated scratch files. It exports no wallet/DB credentials. Save it outside Render under owner control, then unpack/verify:

```text
node scripts/unpack-metadata-backup.mjs downloaded-backup.json new-backup-directory
```

The helper checks size/hash/schema, SQLite integrity/application identity and writes exclusive new files. It **does not restore** the running service. CLI npm run metadata:check / metadata:backup also supports the selected adapter with its existing server environment. A local backup on the same ephemeral filesystem is not an off-host backup. Provider replication and retention do not substitute for a verified owner download.

A restore of an older journal can omit transactions already executed on-chain. Preserve unresolved signed bytes/IDs, compare genesis/release/signatures/account effects and reconcile before any replacement signature. No automatic restore or migration between local SQLite and remote PostgreSQL is implemented; selecting PG with existing local metadata is refused explicitly. Preserve original ledgers and signer files.

Devnet RPC requests share a bounded queue. Read-only RPC429 retries are bounded; a transaction send makes exactly one HTTP attempt, with a fresh storage-generation fence after queue admission and immediately before the request. After an uncertain send, retain and reconcile the same operation/signature and signed bytes. Never rerun a cohort's initial execution command to work around rate limiting. Temporary operator-credential copies stay private and must be removed after final checks; retained deployment buffers, test keys and recovery journals have a separate retention purpose and must be preserved.

## Verification scope

Current results and exact cutoffs are linked from [README](../README.md) and [delivery checks](https://github.com/dimik98330/solana-worldsfair-2026/blob/9b64a52b7ea98a5bd8bb9f81dbfc611d08aa3a4b/docs/release/JURY-DELIVERY-CHECKS.md). The native suite, actual PostgreSQL/TCP fault tests, real localnet financial cycles, isolated Linux hosting and human-wallet/cloud checks are separate cohorts. Synthetic Solana RPC in the COMMIT-loss test proves the persistence barrier, not an SPL transfer. Individual finalized transactions do not establish complete parent attribution when external holder signatures are unlinked.

The actual [Render + Neon devnet packet](evidence/hosted-devnet-20261009.json), checked at 17:38:03 UTC on 9 October, records automated cohort `0ecfadd0-5db1-4c19-a16c-78b6cb314902`: coupon 900, principal 18,000, burn 18, remaining mint supply/vault/obligations 0; all amounts are synthetic test SPL units with 6 decimals. Fixed coupon/vote rights 10/5/3 survived a transfer to current holdings 10/4/4. An actual Render service restart at 17:30 UTC was followed by strict readiness and GET-only recovery of the same 22 business IDs and 26 signatures/proofs, without financial POST, new signature or rebroadcast. The first immediate post-restart HTTP502 is retained as an availability failure. The off-host JSON backup contains an integrity-checked 204800-byte SQLite snapshot; no restore was performed. These are observed hosted results, separate from the historical packets below and the unresolved Phantom attempt.

The [PostgreSQL evidence packet](evidence/postgres-preparation-20261009.json) records43targeted tests/0skips and an actual39-transaction Solana localnet lifecycle: coupon2,500/principal25,000/burn25, API+validatorrestart, sameIDs,105-document verified download, no local SQLite fallback and17source hashes. [Linux hostedPG proof](evidence/hosted-postgres-linux-20261009.json) records nativeNode22.14.0/UID1000, verifiedTLS1.3, auth/origin/demo/assets and identical publicbackuphash/marker after APIrestart. It explicitly records financialReady:false because the official devnet program was absent; it is not Neon/Render verification.

Optional local integration fixture (requires an available Docker engine; not executed in the published cohort):

```powershell
docker compose -f deploy/postgres-test.compose.yaml up -d --wait
# Synthetic public fixture password; never substitute production/Neon credentials.
$env:BONDTRACE_TEST_PG_URL='postgresql://bondtrace_test:synthetic-local-postgres-test-password@127.0.0.1:32545/bondtrace_tests'
npm run test:postgres
```

The plain local fixture does not enable TLS; its3handshake cases are explicitly skipped unless a matching local TLS server and BONDTRACE_TEST_PG_CA are supplied. The published43-test cohort used the owned TLS-enabled PostgreSQL server and process-scoped test CA. Stop only a fixture you started, and preserve anything already listening on32545. These tests deliberately inject corruption/connection loss in the test database.

The former paid Docker + persistent SQLite alternative is retained as [deploy/render-sqlite.yaml](../deploy/render-sqlite.yaml) with [Dockerfile](../Dockerfile). It requires owner-approved spending and an actual dedicated Linux mount; free ephemeral SQLite startup remains refused. Older [Linux SQLite proof](evidence/hosted-linux-20261009.json) and [asset repair](evidence/hosted-linux-h1-20261009.json) retain their original source cutoffs; they are not Neon/Render proof. Docker engine/image execution remains unverified. Vercel alone does not host this long-running Node API and metadata writer; the selected path keeps UI/API on Render.

## Paged-v4 upgrade preparation: paced BUFFER staging

The public program remains v3; uploading source does not upgrade it. The supplemental [account/balance observation](evidence/wallet-buffer-check-20261010.json) records a rent-only funding gap; current live fees must be added before staging. Failed free faucet requests are preserved; no repeated request loop, paid RPC, real funds or closing the existing program is used to fund an upgrade.

`node --import tsx scripts/program-buffer-cli.ts --help` describes a separate explicit BUFFER tool. `npm.cmd run program:buffer -- --help` also works in Windows PowerShell; the PowerShell npm wrapper can consume `--help`. Default mode only reads the supplied image and chain accounts; it creates no journal, reads no keypair and sends no transaction:

```text
node --import tsx scripts/program-buffer-cli.ts --network=devnet --rpc=https://api.devnet.solana.com --genesis=EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG --id=<retained-id> --authority=<pubkey> --buffer=<pubkey> --image=<reviewed-image-path> --sha256=<exact-image-sha256> --bytes=<exact-image-length>
```

These are placeholders, not a copy/paste deployment command. For explicit staging, the operator additionally supplies `--stage`, local `--authority-keypair=<path>`, a new `--buffer-keypair=<path>` when creating a buffer, and integer lamport limits `--max-fees`, `--max-tx-fee`, `--max-rent`. There is no implicit/default wallet. Devnet uses one RPC at a time, at least 1250 ms between all request starts and 900-byte writes; each transaction is simulated and its fee/rent/balance checked before signing. Signed bytes and lifetime are durably committed before a single send.429/403/unknown stops new signing. Resume with the **same ID, network, image, actors and buffer**; retained signatures and finalized bytes are reconciled first, with no replacement signing or automatic rebroadcast.

Preserve `.local/program-buffer/<id>/journal` and explicit local test keys; never upload them to Render or Git. The CLI cannot extend, upgrade or close a program. `bufferReady` certifies only the finalized BUFFER bytes. A program upgrade additionally requires full funding, correct authority, canonical ProgramData extension, its later slot, controlled writer quiescence, matching API/image rollout, exact public readback and same-ID financial recovery. A v3 rollback is unsafe after new v4 accounts or integration records are written.

Verification: 29 targeted tests/typecheck/build and independent repair1 review passed. One actual localnet 2701-byte synthetic buffer resumed after a 2-transaction limit and ended with 5 distinct transactions/4 write chunks, matching finalized bytes and unchanged existing program. Full 959536-byte upload, devnet staging and the final upgrade remain unverified. The tool is preparation evidence, not a public-v4 deployment.

## Русский

Приложение уже работает по адресу **[bondtrace-devnet.onrender.com](https://bondtrace-devnet.onrender.com)**: бесплатный Render native Node 22.14.0 и Neon PostgreSQL 16.15 в Frankfurt, интерфейс/API на одном HTTPS-origin. На срезе 9 октября 17:38 UTC развёрнут `bac8475fdbc4ac5b9dd6617020735dae7bb19d66`; программа реально опубликована в devnet с точным проверенным SHA-256. После фактического перезапуска Render повторно проверены публичный доступ, операторская защита, TLS/БД, JS/CSS и `known-match` / `financialReady:true`. Solana хранит выпуск, права держателей, выплаты и сжигание; PostgreSQL — публичный журнал восстановления. Локальный запуск по умолчанию остаётся SQLite. Для использования сайта и hosted Node-пути WSL, Rust и локальный валидатор не нужны.

После перезапуска Render данные должны читаться из той же БД/namespace, а не с временного диска. Адаптер публикует изменения только после подтверждённого COMMIT, проверяет активного писателя перед подписью/отправкой и останавливает новые отправки при неопределённом результате. Повторная попытка использует прежние подписанные байты и ID. Старый процесс после смены поколения блокируется; работает одна инстанция, автодеплой выключен. Hosted требует проверяемый TLS, devnet, demo=false и точный HTTPS-origin. Сайт и обычный API открываются без HTTP-пароля; финансовые действия требуют подписи кошелька. Отдельный операторский пароль защищает только backup/readiness. Ключи эмитента/держателей/деплоя на сервер и в БД не передаются.

Отдельный автоматизированный hosted-сценарий завершён: 22 бизнес-операции + 4 вспомогательные транзакции, все 26 подписей наблюдались finalized и имеют execution proof. Купон 900, погашение 18 000 тестовых SPL-единиц, сожжено 18; остатки supply/vault/обязательств — 0. Проверены скачанный backup и GET-only восстановление прежних ID/подписей после реального перезапуска Render без повторной отправки финансовых операций. Первый HTTP502 после перезапуска сохранён как сбой доступности. Первый RPC429-сценарий также сохранён: draft, 0 держателей / 0 выпущено. [Публичное evidence](evidence/hosted-devnet-20261009.json) и [checkpoint](33-HOSTED-DEPLOYMENT.md) содержат точные результаты и историю.

Phantom подключён; владелец сообщил об одобрении отдельной операции создания пустого draft, но приложение вернуло `Unexpected error`, API — `prepared` / `not_submitted` / `signature:null`. Успешная человеческая транзакция не подтверждена; её нельзя подменять результатами автоматизированного сценария. [Wallet evidence](evidence/hosted-wallet-check-20261009.json) сохраняет этот предел проверки. Раздел выше содержит команды для нового окружения/контролируемого redeploy; существующие БД, namespace, операции и буферы сохраняются.

Backup скачивается после входа через /api/metadata/backup одним JSON-файлом с проверенной SQLite-копией и manifest. Команда выше распакует его в **новую** папку и проверит SHA-256/integrity; автоматического восстановления нет. Сохранять файл нужно вне Render. Старый журнал нельзя восстанавливать поверх уже выполненных ончейн-выплат без сверки. Бесплатные Render/Neon могут засыпать и имеют квоты; это задержка/лимит доступности, не гарантия промышленного uptime. Платный вариант с постоянным SQLite-диском сохранён отдельно и требует одобрения бюджета. Видео, доступ жюри и финальная заявка остаются отдельным этапом владельца.
