# README review,9October2026

Mode: ProofPilot coach, scoped review→implementation→review. No official score, win probability or perfect-backend claim is assigned. The owner requested full English/Russian descriptions and easy independent verification; video remains owner-produced.

## Findings addressed

| Reader need | Inspected gap | Result |
|---|---|---|
| Real chain execution | An archive can look like a working network | Live localnet3160/RPC8959 is the first launch path;4180 is explicitly read-only historical UI |
| Reproducible launch | WSL/tool versions, account access and interrupted runs matter | Exact prerequisites, setup helper, one-command lifecycle, recovery IDs and scope are stated |
| Financial logic | Marketing labels do not prove record rights or payouts | Eight requirements link to code/evidence; exact coupon/principal, immutable snapshots, masks, atomic burn and voting are explained |
| Backend quality | Test totals from different snapshots can mislead |219/52 and241/52 historical; exact Git58 passed_snapshot243/52; PG preparation266passed/10PGskipped+52UI, separate43PG/0skip and actual39transaction cohorts remain distinguished |
| External wallet | Connected or approved does not establish a signed transaction | Actual Phantom connection/simulation and failed signing are recorded; no success/devnet claim |
| Hosting | Ephemeral local SQLite cannot preserve a free Render journal | Primary nativeNode/freeRender + externalverifiedTLS PostgreSQL adapter; actual LinuxUID1000/TLS/auth/assets/PGbackup/restart proof; old paidSQLite option separate |
| Evidence completeness | HTML alone can hide broken bundles | Verifier now fetches actual entry JS/CSS and records hashes; missing static files404 |
| Integrity | Prior failed verification could disappear in cleanup | Initial worker timeout, source-drift FAILED and historical cohorts are preserved; new evidence is additive |

## Current assessment

The EN/RU documents cover source access, architecture, implemented functions, backend controls, tests, honest simulations/limits and executable startup. The primary path needs no owner wallet or old fixtures. `verify:http` now targets3160 by default and writes a unique evidence file rather than overwriting an earlier proof.

The current host preparation implements and verifies the remote PostgreSQL option: acknowledged COMMIT-before-send, generation fences, safe nested rollback, verified TLS, portable backup download and an actual39-transaction Solana localnet lifecycle with API/validator restart. The prepared primary Blueprint is free native Render plus external Neon, not ephemeral SQLite. This does not establish live provider durability or a public working deployment. Devnet deployment/funding, human-wallet lifecycle, account setup and final public-origin restart remain the joint owner stage. Vercel alone does not host this long-running API/writer. Provider free tiers can sleep and have quotas; no unlimited uptime claim.

No README can guarantee maximum jury points. The defensible improvements are direct executable paths, precise requirement-to-evidence mappings and clear gaps; these also expose the remaining work instead of concealing it.
