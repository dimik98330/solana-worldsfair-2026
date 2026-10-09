# Project and README readiness — 9 October 2026

ProofPilot **coach / application review**, participant self-check against the user-supplied Superteam Kazakhstan × KASE brief. This is a new whole-project/publication scope; earlier backend/hosting reports and their repair budgets remain historical. The criteria weights are Technical Execution30, Corporate Action Logic25, Product & UX20, Real-World Applicability15 and Innovation10. No official numerical grade or organizer acceptance is assigned.

## Engineering verdict

**All eight minimum technical functions are demonstrated in the recorded test scope.** The custom Solana program, public API and durable PostgreSQL journal support coupon payment, maturity redemption with token retirement and snapshot-weighted voting. The EN/RU README is ready for publication with the explicit limits below. This does not establish final submission readiness or successful Phantom signing.

| Minimum requirement | Checked result |
|---|---|
| Tokenized instrument | Classic SPL mint; immutable nominal/maturity and program-validated annual rate/frequency in FinancialTerms |
| Holder registry | Canonical registered accounts, issuer-authorized issuance; hosted cohort18 bonds across3 holders |
| Record date | Fixed10/5/3 rights remain after transfer changes current holdings to10/4/4; uncaptured due cutoff blocks transfers |
| Entitlements | Exact integer calculations; primary unchanged10 bonds receive500 coupon and10000 principal |
| Coupon | Three actual SPL payments total900; duplicate payment rejected |
| Redemption | Three principal payments total18000 and18 bonds burned atomically; duplicate principal rejected |
| Additional action | Informational bondholder voting, fixed weights,13yes/5no, one ballot per holder |
| Verifiable outcome |26 unique finalized signatures/proofs,22 business operation IDs, correct balances and zero outstanding obligations |

Evidence: [actual hosted cohort](../evidence/hosted-devnet-20261009.json), [program](../../programs/bondtrace/src/lib.rs), [technical guide](../../TECHNICAL.md). These are test assets and generated external test signers; no bank or KASE API integration is claimed.

## Criteria and remaining boundaries

| Criterion / supplied weight | Qualitative assessment |
|---|---|
| Technical Execution30% | Core prototype demonstrated through actual public HTTPS origin; acknowledged-COMMIT journal, writer fencing, exact-message relay, bounded RPC and retained recovery. Cold installation on another physical machine and production security are not certified. |
| Corporate Action Logic25% | Immutable rights, exact amounts, prefunding, duplicate prevention and atomic retirement supported by source/tests/actual chain outcomes. Prototype limits16holders/8coupons/4-recipient batches remain explicit. |
| Product & UX20% | EN/RU console, inspection without login, exact amounts and receipts are visible. Scripted reproduction works in the documented Windows/WSL environment; successful human Phantom signing remains unverified. |
| Real-World Applicability15% | Permissioned servicing model and separated chain/journal responsibilities are implemented. Currency/identities are test fixtures; legal register, bank rails, custody/KYC and market-infrastructure deployment are not integrated. |
| Innovation10% | Durable event orchestration, fixed rights and signature-bound evidence are implemented. Comparative novelty against other submissions was not researched or scored. |

The custom event card retains these supplied weights and uses qualitative, unscored findings; its mechanical validation does not certify evidence or produce a ranking.

Actual Render restart recovery retained all22 IDs/26 signatures/proofs, fixed rights, terms and financial totals using GET only. The downloaded204800-byte metadata database passed hash/integrity checks. Final recorded tests:288 Node passed/0failed/10optionalPGskipped and52 UI passed; separate43PostgreSQL and3Rust/16SBF/64sequence cohorts retain their historical cutoffs. Failed RPC429, immediate restart502 and initial synthetic timeout remain separate evidence.

## Publication and wallet disposition

The current README leads with live devnet, the eight functions, current evidence, setup/demo commands, architecture and honest limits. Detailed local setup and historical runs have dedicated documents. The cleanup excluded24 unreferenced drafts/identical frames (1186874bytes), while preserving local copies, Git history and all27 protected media/capture hashes. Source, tests, lockfiles, program release, chain proofs and review lineage remain. [Publication record](../PUBLICATION.md).

**Wallet investigation is complete; Phantom compatibility is a known limitation, not a passed signing test.** The owner reported approving a fresh simulated devnet draft; Phantom returned Unexpected error before API submission. The API retained signature:null/not_submitted, the attempted account is absent and its test SOL balance unchanged. Offline bridge checks did not establish an internal cause. [Exact wallet result](../evidence/hosted-wallet-check-20261009.json). A named Phantom integration is not a separate minimum in the supplied KASE brief; generated signatures nevertheless cannot prove human-wallet UX.

Required owner stages remain separate: provide judge access to the private repository, record the final video, verify authoritative registration/eligibility, perform final submission/consents and retain the organizer receipt. Login, Git push and ProofPilot quality acceptance do not perform those actions. The historical frozen video is not presented as the final version.

**Вывод:** техническое ядро KASE покрывает8/8 требований в проверенном тестовом scope; README пригоден для публикации с указанными границами. Диагностика Phantom завершена, успешная подпись не заявляется. Финальная конкурсная приёмка и действия владельца не подменяются техническим отчётом.
