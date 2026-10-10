# Documentation / Документация

Start with [English README](../README.md) or [Русский README](../README.ru.md). Those guides identify implemented functionality, real launch commands, current evidence and unresolved acceptance.

| Need / Задача | Canonical document |
|---|---|
| Architecture, math, state and recovery | [TECHNICAL.md](../TECHNICAL.md) |
| Paged Solana protocol and exact limits | [34-PAGED-SERVICING.md](34-PAGED-SERVICING.md) |
| HTTP actions, reads, signing and recovery | [15-API-CONTRACT.md](15-API-CONTRACT.md) |
| Authority, token controls and trust | [11-SECURITY.md](11-SECURITY.md) |
| Windows/WSL or native Linux start | [LOCALNET-SETUP.md](LOCALNET-SETUP.md) |
| Render/Neon operation, backup and one-writer policy | [31-HOSTING.md](31-HOSTING.md) |
| Version-bound verification, skips and failures | [VERIFICATION-HISTORY.md](VERIFICATION-HISTORY.md) |
| Current public v3 deployment evidence | [33-HOSTED-DEPLOYMENT.md](33-HOSTED-DEPLOYMENT.md) |
| Current source/technical readiness boundaries | [35-READINESS.md](35-READINESS.md) |
| Signed shadow registry/settlement adapter | [IMPLEMENTED-ADAPTER.md](integrations/IMPLEMENTED-ADAPTER.md) |
| Future external pilot acceptance/operations | [PILOT-CONTRACT.md](integrations/PILOT-CONTRACT.md), [PILOT-RUNBOOK.md](integrations/PILOT-RUNBOOK.md) |
| Demo and submission materials/owner actions | [13-DEMO.md](13-DEMO.md), [14-SUBMISSION.md](14-SUBMISSION.md) |
| Development continuity and current status | [00-STATE.md](00-STATE.md), [AGENTS.md](../AGENTS.md) |
| Intentional removals and history | [PUBLICATION.md](PUBLICATION.md) |

`npm run report` produces an offline HTML verification snapshot and input-hash manifest under ignored `.local/reports/`. It reads fixed public evidence, verifies its digests and preserves localnet/public-devnet, finality, wallet and integration boundaries. It performs no network request, signing or deployment.

## Evidence and history

The [evidence directory](evidence) retains transaction receipts, normalized execution proofs, original failures, source/manifest hashes and reviewed UI captures. Compact v4 entry points: [37-transaction launcher](evidence/servicing-v4-one-command-check-20261010.json), [33→34-holder/9-coupon scale run](evidence/servicing-v4-localnet-summary-20261010.json), [program/CI/shadow adapter](evidence/servicing-v4-verification-20261010.json).

Obsolete research, superseded plans and agent handoffs are removed from the current tree after exact local archiving. They remain in [Git snapshot9b64a52](https://github.com/dimik98330/solana-worldsfair-2026/tree/9b64a52b7ea98a5bd8bb9f81dbfc611d08aa3a4b/docs). Paths named by historical evidence refer to their recorded source revision, not necessarily the current checkout. Frozen JSON/media are not rewritten to make an old result current.

Для жюри достаточно README → TECHNICAL → нужный контракт/доказательство. Служебные старые планы не являются текущими ограничениями программы. Исторические результаты, отсутствующая обычная подпись Phantom и непроверенный внешний партнёр не превращаются в успешные проверки при уборке документации.
