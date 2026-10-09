# Render + PostgreSQL hosting / Хостинг Render + PostgreSQL

[English README](../README.md) · [Русский README](../README.ru.md)

## Prepared architecture

The primary [render.yaml](../render.yaml) runs **one native Node22.14.0 service on Render's free plan**, with the built React UI and API at one HTTPS origin. **External PostgreSQL (Neon) holds public recovery metadata. Solana devnet holds the instrument, fixed holder rights, settlements and burns.** Investor/issuer/deployment private keys never belong in the service or database. The default local development adapter remains SQLite; PostgreSQL is explicit opt-in.

```mermaid
flowchart LR
  Browser[Browser + external wallet] -->|HTTPS + deployment login| App[Render: React + Node API]
  App -->|verified TLS, acknowledged COMMIT| PG[(Neon PostgreSQL: public recovery metadata)]
  App -->|reads, simulation, signed transactions| Solana[Solana devnet: program + SPL]
  Wallet[Wallet signs reviewed message locally] --> Browser
  App -->|authenticated portable download| Backup[Owner-retained SQLite snapshot + manifest]
```

These are preparation files. **No Render/Neon resource or public URL has been provisioned.** Account login, consent and actual deployment are the next joint owner stage. The repository remains private. Current proof covers localnet test assets and isolated PostgreSQL; it does not establish live Neon durability, successful human-wallet execution or devnet deployment.

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
| BONDTRACE_HTTP_USER |Deployment login,3–64 ASCII letters/digits/underscore/hyphen |
| BONDTRACE_HTTP_PASSWORD |Unique random24–256 printable ASCII characters, entered as a Render secret |

The URL parser accepts only sslmode and channel_binding options and constructs explicit verified TLS options; URL parameters cannot override certificate verification. Unencrypted PG is allowed only with the explicit local-only setting on loopback localnet. Never use that setting for Neon. The database role must create/use the dedicated bondtrace_metadata schema; use a separate project database, not an unrelated production database. Schema/application/network/program bindings reject mismatched state.

All app/API paths require HTTP Basic deployment login. Only /healthz is public and returns data-free liveness. This login does not replace wallet signatures or Solana role checks. Financial readiness requires the exact deployed release/genesis; HTTP200 liveness alone proves neither. The hosted entrypoint refuses root API execution and never generates signer keys.

## Deploy together with the owner

1. Create the free Neon project/database and save its connection URL directly in Render secrets. Do not paste it into chat or a repository file. Use a stable namespace and a single API instance.
2. Deploy the frozen program to Solana devnet using isolated deployment tooling and **test SOL**. Confirm program ID, loader, bytecode SHA-256 and genesis against [release.json](../programs/bondtrace/release.json). The deployment key stays on the owner's machine. Current devnet program/funding is not yet verified.
3. Connect the private GitHub repository to Render as the owner; review render.yaml (native node, free, no disk, autoDeployTrigger off). Build: npm ci --include=dev --ignore-scripts && npm run build. Start: node --import tsx scripts/start-hosted.ts. No WSL/Rust/validator is required in the hosted Node service.
4. Supply the exact allocated HTTPS origin, database URL and unique deployment login. Check /healthz200, unauthenticated /401, then authenticated /api/health and /api/program. The metadata backend must be postgres and the deployed program known-match.
5. Run npm run verify:hosted locally with BONDTRACE_PUBLIC_ORIGIN / BONDTRACE_HTTP_USER / BONDTRACE_HTTP_PASSWORD supplied securely in that process environment. The verifier checks actual entry JS/CSS bytes, MIME/hash, origin/auth/demo restrictions and release matching. Its loopback-only diagnostic override records financialReady:false; it cannot certify a public deployment.
6. Connect an external devnet wallet, fund test SOL, create/register/distribute the instrument, fund the full principal-plus-coupon test SPL reserve, then seal. Capture records, settle coupons, vote, redeem and verify signatures/burn. The hosted service has no demo issuer private key; the issuer signs its own transactions. Use this final public origin for the browser check.
7. Download metadata, restart/redeploy once, verify the same namespace/IDs/signatures/reconciliation and recover existing operations. Do not create another payment to disguise lost metadata. Record the actual URL/version and results separately from local evidence.

## Backup and recovery

Authenticated GET **/api/metadata/backup** downloads one JSON envelope containing a consistent verified SQLite snapshot (base64), public manifest and SHA-256. The route accepts no filename/path/query/body, allows one bounded response at a time, sends no-store and cleans only its generated scratch files. It exports no wallet/DB credentials. Save it outside Render under owner control, then unpack/verify:

```text
node scripts/unpack-metadata-backup.mjs downloaded-backup.json new-backup-directory
```

The helper checks size/hash/schema, SQLite integrity/application identity and writes exclusive new files. It **does not restore** the running service. CLI npm run metadata:check / metadata:backup also supports the selected adapter with its existing server environment. A local backup on the same ephemeral filesystem is not an off-host backup. Provider replication and retention do not substitute for a verified owner download.

A restore of an older journal can omit transactions already executed on-chain. Preserve unresolved signed bytes/IDs, compare genesis/release/signatures/account effects and reconcile before any replacement signature. No automatic restore or migration between local SQLite and remote PostgreSQL is implemented; selecting PG with existing local metadata is refused explicitly. Preserve original ledgers and signer files.

## Verification scope

Current results and exact cutoffs are linked from [README](../README.md) and [delivery checks](release/JURY-DELIVERY-CHECKS.md). The native suite, actual PostgreSQL/TCP fault tests, real localnet financial cycles, isolated Linux hosting and human-wallet/cloud checks are separate cohorts. Synthetic Solana RPC in the COMMIT-loss test proves the persistence barrier, not an SPL transfer. Individual finalized transactions do not establish complete parent attribution when external holder signatures are unlinked.

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

## Русский

Основной путь подготовлен для **бесплатного Render native Node22.14.0 + внешнего PostgreSQL Neon**, интерфейс/API на одном HTTPS-origin. Solana devnet хранит выпуск, права держателей, выплаты и сжигание; PostgreSQL — публичный журнал восстановления. Локальный запуск по умолчанию остаётся SQLite. На Render не нужен WSL, Rust или локальный валидатор.

После перезапуска Render данные должны читаться из той же БД/namespace, а не с временного диска. Адаптер публикует изменения только после подтверждённого COMMIT, проверяет активного писателя перед подписью/отправкой и останавливает новые отправки при неопределённом результате. Повторная попытка использует прежние подписанные байты и ID. Старый процесс после смены поколения блокируется; работает одна инстанция, автодеплой выключен. Режим hosted требует проверяемый TLS, devnet, demo=false, точный HTTPS-origin и отдельный пароль доступа. Ключи эмитента/держателей/деплоя на сервер и в БД не передаются.

Вместе с владельцем: создать бесплатную Neon БД → развернуть frozen-программу на devnet за тестовые SOL → подключить приватный GitHub к Render → задать secrets из таблицы → проверить вход, программу и реальные JS/CSS → выполнить полный цикл своим devnet-кошельком → скачать backup → перезапустить и проверить прежние IDs/signatures. Аккаунты, согласия и размещение сейчас не выполнялись. Публичного URL, успешного human-wallet сценария и devnet deployment пока нет; localnet evidence их не заменяет.

Backup скачивается после входа через /api/metadata/backup одним JSON-файлом с проверенной SQLite-копией и manifest. Команда выше распакует его в **новую** папку и проверит SHA-256/integrity; автоматического восстановления нет. Сохранять файл нужно вне Render. Старый журнал нельзя восстанавливать поверх уже выполненных ончейн-выплат без сверки. Бесплатные Render/Neon могут засыпать и имеют квоты; это задержка/лимит доступности, не гарантия промышленного uptime. Платный вариант с постоянным SQLite-диском сохранён отдельно и требует одобрения бюджета. Видео, доступ жюри и финальная заявка остаются отдельным этапом владельца.
