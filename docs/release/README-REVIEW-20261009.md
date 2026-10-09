# README review,9October2026

Mode: ProofPilot coach, scoped review→implementation→review. No official score, win probability or perfect-backend claim is assigned. The owner requested full English/Russian descriptions and easy independent verification; video remains owner-produced.

## Findings addressed

| Reader need | Inspected gap | Result |
|---|---|---|
| Real chain execution | An archive can look like a working network | Live localnet3160/RPC8959 is the first launch path;4180 is explicitly read-only historical UI |
| Reproducible launch | WSL/tool versions, account access and interrupted runs matter | Exact prerequisites, setup helper, one-command lifecycle, recovery IDs and scope are stated |
| Financial logic | Marketing labels do not prove record rights or payouts | Eight requirements link to code/evidence; exact coupon/principal, immutable snapshots, masks, atomic burn and voting are explained |
| Backend quality | Test totals from different snapshots can mislead |219/52historical source suite, current241/52follow-up, separate Rust/SBF tests and39transaction cohorts remain distinguished |
| External wallet | Connected or approved does not establish a signed transaction | Actual Phantom connection/simulation and failed signing are recorded; no success/devnet claim |
| Hosting | A static deploy would omit recovery and on-chain execution | Prepared hosted API/volume/auth/HTTPS-origin contract and Linux tests are linked; public deployment and costs remain explicit gates |
| Evidence completeness | HTML alone can hide broken bundles | Verifier now fetches actual entry JS/CSS and records hashes; missing static files404 |
| Integrity | Prior failed verification could disappear in cleanup | Initial worker timeout, source-drift FAILED and historical cohorts are preserved; new evidence is additive |

## Current assessment

The EN/RU documents cover source access, architecture, implemented functions, backend controls, tests, honest simulations/limits and executable startup. The primary path needs no owner wallet or old fixtures. `verify:http` now targets3160 by default and writes a unique evidence file rather than overwriting an earlier proof.

The current host preparation still needs an actual devnet deployment/funding, external-wallet lifecycle, approved hosting/account setup and public-origin restart verification. The disk-backed Render option is prepared and tested at the Linux process/mount level, but conflicts with a strict zero-service-budget constraint until a durable remote-store option is implemented and verified. It must not be presented as an already free, public, fully working hosted demo. Vercel alone does not host this synchronous local SQLite API.

No README can guarantee maximum jury points. The defensible improvements are direct executable paths, precise requirement-to-evidence mappings and clear gaps; these also expose the remaining work instead of concealing it.
