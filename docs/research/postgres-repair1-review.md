# PostgreSQL / hosted preparation — bounded repair review 1

Cutoff: 2026-10-09T14:03:19Z, with final backup-hash/exit-file confirmation immediately afterward. Root `C:\Users\dmitrii\Documents\solana`. Separate-context reviewer: `postgres_security_critic`. ProofPilot **coach**, general engineering/readiness context. Initial report remains `.local/hosting-readiness/postgres-independent-review.md`; this is repair **1 of at most 2**, leaving one bounded repair review if a material change warrants it. Earlier HOST/H1/native Windows incident histories are separate and unchanged.

**Disposition: PG01, PG02 and PG03 resolved. No new material source regression found in the scoped backup/download/unpack additions. The inspected local PostgreSQL/Render preparation can be handed to the owner-assisted deployment stage. This is not a cloud/deployment, devnet, human-wallet or production acceptance claim and carries no official score.**

## Scope and skills

Reread actual AGENTS and latest STATE plus the full initial issue record; reused unchanged installed ProofPilot/readiness review+quality/evidence/safety, solana-dev/security and ECC security-review/production-audit instructions already read in this context. No installation, test/build/Git command, service/network/browser/account action or credential/key/.env/connection-descriptor read occurred. Only this note was written. Evidence analysis used source reads, parsing of public retained JSON, log inspection and SHA-256 comparison. No fresh live verification or formal quality-helper certification is implied.

Reviewed current repaired transaction/facade/policy paths and their tests, newly added HTTP backup route/unpack CLI/tests, primary Render native configuration and retained paid alternative, README EN/RU/TECHNICAL/hosting statements, unique repaired logs, financial raw evidence and isolated Linux public summary. Native program/SBF compilation remains its separate Git58 source-bound cohort.

## Stable issue resolution

| ID | Status | Inspected correction and targeted evidence |
|---|---|---|
| PG01 P2 | Resolved | `server/transactions.ts:50–51` and `:57` now call the fresh primary fence immediately before each private-signing invocation, after the preceding async RPC. Central `rpc.ts:25` send fence remains. `postgres-signing-fence.test.ts` transfers actual PostgreSQL ownership during getLatestBlockhash/simulation; instrumented signer counts are respectively 0/1, no next sign, zero sends and no receipt/operation inserted. |
| PG02 P3 | Resolved | `server/postgres-document-store.ts:34` performs rollback only when bridge health explicitly retains an active transaction. Actual-PG facade regression at snapshot limit1024 now asserts exact STORAGE_LIMIT, original acknowledged hash/cache, null first-claim owned generation, and a subsequent small successful commit. Poisoned/closed paths remain blocked. |
| PG03 P3 | Resolved | `server/postgres-policy.ts:14` matches engine namespace8–128; parser rejects3/7/129 and accepts8/64/65/128 before any connection. Default namespace unchanged. |

Exact narrow transcript `.local/hosting-readiness/postgres-repair1-tests.log`: **7/7 passed,0failed,0skipped**. Inspected test source supports the listed assertions; they are not inferred merely from green counters. The takeover tests use real PostgreSQL plus synthetic Solana RPC, without claiming a real transfer.

The initial overwritten-log attribution concern is also resolved: `.local/hosting-readiness/postgres-engine21-repaired.log` is uniquely retained and has **21/21 passed,0skipped**, with exit0. It contains16 actual SQL engine subtests plus the four validation/transport tests and containing integration group.

## New backup/download/unpack path

`server/index.ts:41–90` adds authenticated GET `/api/metadata/backup` after the global auth boundary. It rejects queries/body/foreign Origin/cross-site browser requests, uses an internal UUID scratch destination, allows one in-flight response, and delegates consistency to existing backupStorage. It compares actual downloaded bytes/length/SHA against the adapter result, excludes private filesystem paths and connection configuration from the whitelisted manifest, caps SQLite32MiB/envelope64MiB, and adds attachment/no-store/nosniff/hash headers.

Scratch directory containment/link checks run before creation and cleanup. Completion/close/error cleanup checks its generated directory identity and removes only named regular backup files without recursive deletion; unverifiable paths are retained. A hard kill can leave ignored scratch data, as the implementation note states. This is not automatic off-host retention.

`scripts/unpack-metadata-backup.mjs` does not derive a destination from manifest.filename. It requires an explicit new output directory, canonical base64, exact size/hash/schema, and read-only SQLite integrity/application/user-version checks with extensions disabled/trusted_schema off. Exclusive directory/files prevent replacing prior backups or a live service. It reports restored:false and adds no restore/migration/signing behavior.

The five source tests in `tests/client/metadata-download.test.ts` cover actual6MiB HTTP SQLite/unpack/roundtrip, hash tampering rejected before output creation, existing output refusal, nonpublic sentinels excluded, hosted auth before DB, query/origin rejection, deterministic one-in-flight abort cleanup and foreign linked-directory preservation. All five appear passed in the full native transcript (tests135–139). The abort case injects a delayed response into its isolated child; it does not claim an uncontrolled network/hard-crash experiment. No new material defect was found at this seam. Boundary-size32/64MiB and hard-kill behavior were not executed by this reviewer or asserted as passed.

## Retained verification, attributed to its actual cohort

- Combined PG cohort `.local/hosting-readiness/postgres-tests-20261009134944297-9e71d081.log` and matching JSON: **43passed,0failed,0skipped,exit0**, eight named test files. This total includes pure state/policy/transport tests; it does not mean every one of43 is an SQL integration test. Source/log include successful verified TLS and rejection of unknown CA/wrong hostname. The separate TLS-only run is `postgres-tests-20261009134908117-59860032.log/json`.
- Full native/default transcript `postgres-native-suite.log`: **276total,266passed,10PGcases skipped,0failed**, exit0. This honest skip count stays distinct from the actual PG cohort. `postgres-ui-suite.log`:52passed,0failed/skipped; `postgres-build.log` has successful typecheck/Vite build. Inspected corresponding exit files all0. No rerun by reviewer.
- `docs/evidence/postgres-preparation-20261009.json` lists17 source hashes. **All17 matched current inspected files**, including server/index, repaired transactions/policy/facade, runtime helper and strength driver. This ties the actual financial evidence to the current tested server source; the new unpack helper has its own native test/hash below.
- Raw `docs/evidence/execution-postgres-b4013149-c3dd-47e4-b78f-1576a7ce7bdb.json`: **690024bytes**, SHA-256 `b3fc25d84576ace231155280cc15d1ba345a7dbc7f31ce6a0a06707eeb2250e9`, both match public preparation manifest. Parsed29 wallet/direct issuer receipts +4coupon groups +6auxiliary = **39 unique signatures**. There are39 finalized finality observations and39 archived proofs with finalized commitment. Financial totals: coupon2500000000minor (2500 at6decimals), principal25000000000minor (25000), issued/redeemed25, current/mint supply0 and remaining/vault0. Native validator restart retains the same genesis; API restart retains parent digest/child signature and replay checks.
- Six direct setup transfers in the PG test driver are explicitly external generated-localnet transactions; they bypass application storage to keep the API as sole PG writer. Driver persists only a public pre-send wire hash, performs one send with maxRetries0 and stops on unknown. All six retained finalized RPC proof hashes bind to their pre-send driver hashes. They are **not** application commit-before-send proof and are labelled accordingly in source/raw evidence. The separate lost-COMMIT/TCP test establishes the application persistence barrier with synthetic Solana. Parent aggregate finality remains correctly unknown because external holder signatures are unlinked; individual finalized observations do not upgrade it.
- Actual downloaded lifecycle SQLite file `.local/hosting-readiness/pg-lifecycle-downloaded.sqlite`: **380928bytes**, SHA-256 `3eed89c078fa43ca9832f5cd93dda25ceff9911673aa5c5aac3e30c50b12dbdf`, independently compared to preparation manifest and matched. The record reports105documents and no fallback; this reviewer did not query the SQLite file or reauthenticate the server.
- `.local/hosting-readiness/linux-pg-public-summary.json` records isolated Linux Node22.14.0/UID1000, npm-ci/web build/verifier exit0, authenticated actual JS/CSS bytes, verified PostgreSQL TLS1.3, read/write, identical marker/snapshot/SQLite hash across API restart, no SQLite fallback/signer directory and owned cleanup. Its source manifest was verified before/after in that run. It explicitly records devnet program unavailable, **financialReady:false**, loopback diagnostic scope and no cloud/wallet/financial transaction. The reviewer inspected the retained summary; it is not a fresh provider handshake.

## Hosting/documentation conditions

Current primary render.yaml is native Node22.14.0, free service, one instance, autoDeployTrigger off, explicit postgres/verified TLS/devnet/demo=false/origin/deployment auth and server-only DATABASE_URL. The paid Docker+disk SQLite alternative remains at deploy/render-sqlite.yaml and requires separate owner budget approval. README EN/RU, TECHNICAL and31-HOSTING now distinguish the adapters/cohorts, no fallback/automatic migration/restore, cold starts/quotas and deferred owner deployment. They do not claim a Neon/Render resource or public URL exists.

Remaining conditions are the agreed **next stage**, not grounds to reinterpret this local preparation as failed or to invent production certainty: owner account/consent; actual free-provider project/role/TLS/pooler probe; exact devnet deployment/free funding; authenticated public origin and actual wallet cycle; provider restart/redeploy and same IDs/signatures; owner-retained downloaded backup. Current local Linux program-absent result and unresolved human-wallet history stay explicit. Provider policies/limits were not newly browsed by this reviewer under the no-network assignment.

The lead may finish current documentation links/final source manifest/private handoff without a new feature loop. If source changes materially afterward, preserve this cutoff and use the remaining single repair review on the changed scope. No requirement is invented for a perfect numerical score or endless retesting.

## Additional cutoff hashes

The17 preparation-manifest entries matched; the repaired/new important entries and delivered documentation at this cutoff are:

| File | SHA-256 |
|---|---|
| server/transactions.ts | 86365e2d32aa04c992e641470b728f54c80b27fb916b1bb5db36ccb4814c2fb2 |
| server/postgres-document-store.ts | 99d8548df641e1f85f993dcf26e50a595328d8dd91ac74e388c972c40519412f |
| server/postgres-policy.ts | 3d2739594590f7bd47098f7570b0d94b97786298ac4f649b7168381131500cee |
| server/index.ts | 3dd7eb741b94fcbbc9d12e87bb0c18b1bd3867bb296da0ec0ed64b9826953b36 |
| scripts/unpack-metadata-backup.mjs | fc5f548ab2fe1f6bf2e9099c61d32669acd163cea314a5f91516e3336d14c101 |
| tests/client/metadata-download.test.ts | 2292ba9c9343b439b5f099928261ed6063ba271530edff7f69db573a8de74a77 |
| render.yaml | 02a7ec715b1ecb8b1934eba263b13089c5ed083330711e2768ff99a9283e52bb |
| docs/31-HOSTING.md | 2f8d1c411e4936f24a0d69ee6d677afa0f97cef25c70d33dcc35ec4479ccb3fd |
| README.md | 8a23dfe36287f79c54ad272280785a7e99003ecc3024d04f45374d3e2aa4c7ba |
| README.ru.md | 0222b535915034d0c80749041dffb882067aca93e00ee1794a7b3177c5189461 |
| TECHNICAL.md | 44e740a20b511947d28fe134f752c1d141f8729a91a4db2875384bd7ff875ee4 |

Stopping gate: reviewer stops here. No source edits/reruns/Git/service/account/deployment/paid/public/mainnet/real-fund/final-submission action. Lead owns final integration and source handoff; actual hosting remains joint owner work.
