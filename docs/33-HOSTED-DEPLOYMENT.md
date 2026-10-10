# Actual hosted deployment — 9 October 2026

## Current supplement — 10 October 2026

The service received a **wallet-only v3 deployment**, source `e658553632a8289c575494b0691e6c36ab92e7f0`, Render `dep-db4urvqd0e5s73dj3qbg`. Actual HTML/JS asset `index-DRI4xkk7.js`, PostgreSQL, program SHA `761b993d…077bdfd` and the previous completed issue were read back on 10 October. [Versioned supplement](evidence/wallet-buffer-check-20261010.json). The older observations below retain their original cutoff.

V0 signing now selects the existing Wallet Standard full-wire/native-account path; injected message-only requests are limited to legacy. The repair was exercised in a v4 PR merge checkout:356 Node /93 UI /3 Rust unit /20 SBF runtime passed, separate PostgreSQL40 passed/3 TLS-fixture skips. The new BUFFER tooling is a separate29-test cohort. Neither CI nor the service deploy certifies a human Phantom transaction.

The new request reached a real Phantom approval window. Its warning showed an insufficient balance; the owner later reported selecting Devnet and seeing 0.03 test SOL. Passive API/RPC at 12:41 UTC still found the two retained operations `not_submitted` / `signature:null` and no derived draft account. Ordinary wallet acceptance remains open. Public v4 is also pending: at 12:44 UTC the upgrade payer had 2.121575440 test SOL; BUFFER rent plus ProgramData extension require 6.999127480 test SOL **before fees**, leaving at least 4.877552040 test SOL plus fees unfunded. No partial devnet staging or upgrade was executed.

GitHub deployment metadata reported main's revision for a manually selected service commit; it was not used to infer the runtime version. The verified Render build/source and served asset are recorded separately. Automatic deployment remains disabled; keep **[skip render]**, and never deploy main/v4 against the v3 program.

Stage: actual free Neon + Render deployment, authorized by the owner with owner-operated account login. This supersedes the earlier preparation-only hosting gate. Public repository visibility, paid plans, mainnet/real assets and final contest submission remain outside authorization.

## Verified status at 17:38 UTC

**Public test application: [bondtrace-devnet.onrender.com](https://bondtrace-devnet.onrender.com).** Render serves source `bac8475fdbc4ac5b9dd6617020735dae7bb19d66` on the Free plan, native Node 22.14.0, Frankfurt. The app and ordinary API respond 200 without `WWW-Authenticate`. HTTP Basic authentication protects only `/api/metadata*` and `/api/runtime/readiness`; operator credentials remain required server secrets. Exact-message Ed25519 signatures, wallet authority/role checks and `demo=false` remain in force.

The strict public-origin verifier passed at **2026-10-09T17:05:03.742Z** and again after the actual Render restart at **17:33:08.458Z**: HTTPS liveness, public application, operator authentication, actual HTML/JS/CSS bytes, foreign-origin rejection, generated-demo rejection, PostgreSQL read/write, advancing devnet chain and exact deployed program `known-match` / `financialReady:true`. The original ignored result `.local/hosting-live/rpc-fixed-origin.json` is retained. These readiness probes submit no wallet signature or financial transaction; separate financial and restart results are below.

The automated cohort `0ecfadd0-5db1-4c19-a16c-78b6cb314902` is **completed**, with actual provider restart and passive same-ID recovery passed. Successful human-wallet execution remains **unverified**: the separate Phantom attempt returned `Unexpected error` and was not submitted according to the API and chain checks. The [public hosted evidence packet](evidence/hosted-devnet-20261009.json), checked at **2026-10-09T17:38:03.069Z**, is 614717 bytes / SHA-256 `36b224e0ff562cc7b63f402db7c17e494df9f1acd86e6494b244e70d2ded5866`. It covers synthetic test SPL assets and external generated test signers, not a human-wallet success, real securities, bank/KASE integration, production SLA or contest submission.

## Provider resources

| Resource | Observed configuration |
|---|---|
| Render service | `srv-db4g7oqd0e5s73espfqg` |
| Render Blueprint | `exs-db4g3enlk1mc73fu3kf0` |
| Render runtime | Free native Node 22.14.0, Frankfurt, one writer, automatic deployment disabled, no persistent local disk |
| Source access | Owner connected the authorized private `dimik98330/solana-worldsfair-2026` repository |
| Neon project | `bondtrace-kase` / `odd-shape-25117485` |
| Neon branch/database | `br-jolly-morning-b2nzu4y0` / `bondtrace` |
| Neon runtime | Free, AWS Frankfurt, actual PostgreSQL 16.15, verified TLS; extra services disabled |

UI/API share the HTTPS origin; PostgreSQL stores the public recovery journal independently of Render's ephemeral filesystem. Solana accounts remain authoritative for financial effects. Keys, seed phrases, database URLs and operator passwords are excluded from this document and Git. Authorized issuer/holder/deployment test private keys remain on the owner's workstation, never the hosted server. Free-tier sleep/quotas remain prototype availability limits, not a production uptime or backup guarantee.

## Actual Solana devnet deployment

| Release identity | Verified value |
|---|---|
| Program | `B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8` |
| Canonical ProgramData | `uZzaw6cRtbnd2JWk9rEirz9g8hZNY6VmUPWBPxuFz2r` |
| Payload | 541456 bytes |
| SHA-256 | `761b993d403ae03a84e94475404299b0d4e798a6ea2d17ae44e003148077bdfd` |
| Deploy signature | `5uJ9BN6EZhwNstrVuUcfL8P92fg6yhR6b8Adni2UxPPy6Yrg7mNqpJEFwe9fEi3nf8UHLNiGSPhjmthRkqnJv7hn` |

Public references: [program on devnet Explorer](https://explorer.solana.com/address/B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8?cluster=devnet), [deployment transaction](https://explorer.solana.com/tx/5uJ9BN6EZhwNstrVuUcfL8P92fg6yhR6b8Adni2UxPPy6Yrg7mNqpJEFwe9fEi3nf8UHLNiGSPhjmthRkqnJv7hn?cluster=devnet). Deployment and bytecode identity were observed by the lead on 9 October 2026; these links do not imply a complete instrument lifecycle or real assets. The preserved original program key is authoritative; the generated `target/deploy` key has a different public address.

## Preserved failure and recovery history

- **Initial provisioning/upload stage:** Neon creation and Render/source integration preceded program deployment. Earlier `financialReady:false`, absent-program and 0 test SOL observations belong to that stage. The owner subsequently funded the isolated payer with 5 test SOL through the GitHub/CAPTCHA faucet. Bounded CLI/paced upload failures retained the same persistent buffer, exact wires and receipts; the eventual deployment above supersedes the absent-program status. Do not delete that evidence or generate replacement recovery keys blindly.
- **Initial hosted configuration:** an origin-editor failure was repaired through verified field input and redeploy. The former public HTTP-login wall was removed at the owner's request; the later public-origin check above confirms the current authentication scope. Earlier deployment `11b01f8` and source/auth checks retain their historical cutoffs.
- **First actual automated cohort:** `a04cb28e-60b4-4771-8040-b1f71dd2c512` stopped at unsigned `register_holder` preparation with `RPC_RATE_LIMITED`, after four confirmed auxiliary/setup transactions and a confirmed empty draft. Passive recovery found draft status, 0 holders and 0 issued; no holder issuance/payment occurred. The draft is `8M3A7XMFQ8suEjoMGHYLuHrptGqzpPd3EZi9P6DaeX5G`, operation `e5b6864b3c4a45e5fdcaf2f65f98e063c9a86c65dc807d50d14ee37d151100e7`. Preserve original immutable dates, once-file, history, locks, checkpoints and signer files. Do not rerun its initial `--execute` command as recovery.
- **Runtime repair:** shared devnet RPC queue, bounded read-only retry, one HTTP attempt per transaction send and a fresh storage-generation fence after queue admission were implemented. 13 targeted RPC tests, 45 catalog-and-related tests (including 8 catalog cases), typecheck and build passed before `bac8475` deployment. The completed new cohort is distinct evidence, not a replacement receipt for the old attempt.

## Completed financial cycle and restart

The actual public HTTPS API cohort used instrument [2KWpyE9mQWS6VTviCJFi1b4Zh55rti9xeDS6yk37sU7Y](https://explorer.solana.com/address/2KWpyE9mQWS6VTviCJFi1b4Zh55rti9xeDS6yk37sU7Y?cluster=devnet). Its 22 business operations plus 4 auxiliary transactions produced **26 unique signatures, all individually observed finalized with 26 execution proofs**. No aggregate transaction is asserted.

| Observed result | Exact outcome |
|---|---|
| Coupon paid | 900 test SPL units / `900000000` base units |
| Principal paid | 18,000 test SPL units / `18000000000` base units |
| Burn | 18 bond units; remaining mint supply 0 |
| Closure | Vault 0; remaining obligations 0 |
| Fixed rights | Coupon/vote rights 10/5/3 preserved after current holdings changed to 10/4/4 |
| Primary holder | 500 coupon / 10,000 principal test SPL units |
| Recorded voting weights | Yes 13 / no 5; closed informational proposal |
| Rejected before preparation | Unauthorized issuer, insufficient reserve, too early, duplicate coupon claim, duplicate principal claim; exact financial state unchanged |

Settlement values use the test mint's 6 decimals. The maturity snapshot and principal claims follow the then-current holdings; earlier coupon/voting rights remain fixed. The test does not establish all possible corporate actions or an executed governance policy.

At **17:29:19 UTC**, the actual off-host backup download produced a 273771-byte JSON envelope (SHA-256 `91657741bb5561dc458ff18e2a4fbb789eb119771004e1ab2b62db3ef6a7928d`) containing an integrity-checked 204800-byte SQLite snapshot (SHA-256 `f284315db1a6aa394cacb2abd362ff278395528877d5592bf3c0012b27b01d5d`). It was verified without restoring or replacing the running journal.

The lead used Render's actual **Restart service** at **22:30 Asia/Qyzylorda / 17:30 UTC**. The first immediate readiness check returned **HTTP502**, retained as an availability failure. Later strict readiness passed. GET-only passive recovery `bffcefe6-c8bc-49cc-ba00-16c1ae7fe822` passed at **17:37:07 UTC** with the same 22 business IDs, 26 signatures/proofs, fixed rights, financial terms and final totals. It made no financial POST, replacement signature, rebroadcast or lifecycle resume. This is observed recovery from the same Neon namespace after a hosted process restart.

## Human-wallet check and validation limits

The owner connected Phantom at the public origin. A separate empty-draft `initialize_issue` review passed simulation with an estimated 5000-lamport fee; the owner reported approval. The SDK returned `Unexpected error`. The API retained operation `049f9f9a5f93531da3b6d4e04e8a881568ffb7d1458996d98e54d75e2c99b06d` as `prepared` / `not_submitted` / `signature:null`. At 17:37:29 UTC, direct devnet verification found attempted instrument `Gwse9mePWKY8NSXujqWYkCfeB5qKPwviqUdNXYD1HKn7` absent and the test wallet balance unchanged at 30000000 lamports. [Public wallet evidence](evidence/hosted-wallet-check-20261009.json) preserves this failed attempt separately from the automated financial cohort.

The installed wallet bridge passed 5/5 offline tests; source review found no evidence of a chain-forwarding, codec or lifetime defect. The internal wallet rejection cause and selected network inside the extension remain unknown. No speculative sign-and-send fallback, new signature, dependency migration or wallet security bypass was introduced. Successful human-wallet execution remains a required follow-up.

Final standard verification reported **288 Node tests passed, 0 failed, 10 optional PostgreSQL tests skipped** (298 total), and **52 UI tests passed**. The initial 287-pass / 1-fail / 10-skip run is preserved: its synthetic devnet bootstrap exceeded the 45-second worker bound after deliberate RPC pacing. Only that devnet harness bound changed to 180 seconds; assertions remained unchanged. The same regression passed in 136 seconds and the complete standard run passed in 367 seconds. Build and the 13 RPC / 45 catalog-and-related targeted checks retain their recorded scopes; these source checks do not resolve the Phantom limitation.

## Operations and remaining checks

The hosted Node service and local verifier need no WSL, Rust or local validator. [Hosting runbook](31-HOSTING.md) contains commands, settings and backup/recovery procedure; historical localnet instructions stay separate. Keep one API writer and the same PostgreSQL namespace across redeploys. Retain IDs/signatures/signed bytes and reconcile before signing any replacement operation. Download and verify an owner-retained metadata snapshot outside Render before controlled restart testing.

At this cutoff, automated public-origin financial execution and same-ID hosted restart recovery are verified in the exact cohort above. A successful human-wallet transaction remains unverified. Preserve both results; HTTP 200, Phantom connection, localnet results and generated test signatures cannot resolve that remaining check. Judge access, video and final submission remain separate owner stages.

After final cloud checks, the temporary operator-credential copy was removed from the workstation. Only that credential copy was deleted; deployment buffers, both cohorts' test signer files and recovery journals were verified preserved. Provider secrets remain configured server-side. No secret content belongs in docs, logs or chat.

Skills applied: installed ProofPilot in **coach** mode for evidence/readiness boundaries, `solana-dev` and security guidance for the lead's deployment, ECC `deployment-patterns` and documented CUA browser controls. This documentation update read AGENTS/START/current STATE and ProofPilot routing/review/evidence/safety plus ECC deployment-patterns; it performed no network call, transaction, build, installation or Git operation. Original localnet ledgers and historical evidence were preserved.

## Русский

**Сайт уже размещён:** [bondtrace-devnet.onrender.com](https://bondtrace-devnet.onrender.com). На 9 октября 17:38 UTC подтверждены бесплатный Render Node 22.14.0 и Neon PostgreSQL 16.15/TLS в Frankfurt, источник `bac8475fdbc4ac5b9dd6617020735dae7bb19d66`, реальная devnet-программа с точным SHA-256 и строгая проверка публичного origin после перезапуска. Сайт/обычный API открываются без HTTP-пароля; BasicAuth защищает только операторские metadata/readiness. Финансовые действия по-прежнему требуют точной подписи кошелька и полномочий.

Отдельный автоматизированный сценарий завершён: 22 бизнес-операции + 4 вспомогательные транзакции, все 26 подписей наблюдались finalized и имеют execution proof. Купон 900, principal 18 000 тестовых SPL-единиц; сожжено 18, supply/vault/обязательства 0. Фиксированные купонные/голосующие права 10/5/3 пережили изменение текущих остатков на 10/4/4; голосование записало 13 за / 5 против. Проверены off-host backup и GET-only восстановление прежних ID/подписей после фактического Restart service в 22:30 Qyzylorda, без новых финансовых отправок. Первый HTTP502 после перезапуска и старый RPC429-сценарий с пустым draft сохранены в истории.

Владелец подключил Phantom и сообщил об одобрении отдельной операции пустого draft, но SDK вернул `Unexpected error`; API остался `prepared` / `not_submitted` / `signature:null`. Прямой devnet-check подтвердил отсутствие нового аккаунта и неизменный баланс. Успешная человеческая транзакция не подтверждена; причина внутреннего отказа Phantom неизвестна, обход подписи не добавлялся. Автоматизированный сценарий её не заменяет. Для сайта/hosted Node не нужен WSL; localnet — отдельный исторический маршрут. Ключи остаются на рабочем компьютере владельца. Платные планы, mainnet, реальные активы, публичность репозитория и финальная конкурсная подача этим этапом не разрешены.
