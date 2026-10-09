# BondTrace — technical overview for KASE

[English README](../../README.md) · [Русский README](../../README.ru.md) · [Detailed technical guide](../../TECHNICAL.md)

Prepared9October2026. Scope: functional Solana **localnet** prototype with test SPL assets and generated test identities. Main-hackathon registration, judge access and final submission remain separate owner actions. The owner will record the final demonstration video.

## Architecture

React/Vite console → Node API → review/simulation → signed-message verification → durable SQLite intent/receipt → Solana RPC → Anchor program/SPL Token. The program owns financial truth: immutable issue terms, holder register, record-date positions, claim masks, atomic payments/burn and weighted ballots. SQLite retains discovery, operation IDs and recovery/proof observations; it never replaces on-chain ownership. Coherent financial reads use one confirmed bank context and exact reconciliation.

## Corporate actions

| Requirement | Current implementation |
|---|---|
| Instrument | Whole-unit SPL bond; nominal/maturity/coupon schedule; optional annual rate/frequency enforced in atomic61-byte FinancialTerms PDA |
| Holders/record date | Canonical registered ATAs; cutoff blocks transfers until complete immutable coupon capture; subsequent transfers/burn preserve historical rights |
| Entitlement | checkedu128/u64 and BigInt; nominal×basisPoints/(10000×frequency), then snapshot units; principal=units×nominal |
| Coupon | Holder claim or permissionless fixed-beneficiary delivery; shared paid mask, atomic batches≤4, explicit durable resume |
| Redemption | At maturity issuer opens redemption; holder receives nominal and bonds burn in the same transaction; repeat claims reject |
| Additional action | Informational snapshot-weighted bondholder voting; one ballot per holder |
| Outcome | Bond/Coupon/Proposal/Ballot accounts, events, signatures and retained normalized execution proofs; actual finality/provenance separate from financial closure |

The unchanged ten-bond example proves coupon500 and principal10000. Regular-rate fractional base units are rejected; fixed irregular coupon schedules remain separately supported. Frequency is a divisor, not an implicit day-count/calendar convention.

## Verification

Expected release:541456bytes, SHA761b993d403ae03a84e94475404299b0d4e798a6ea2d17ae44e003148077bdfd.

| Evidence layer | Recorded result |
|---|---|
| Clean prepared-host source snapshot |219Node,52UI, application/SBFbuild and exact frozenhash passed |
| Separate actual SBF/LiteSVM program run |3unit+16runtime, including64 deterministic sequences and canonical500/10000 |
| Main and separate clean live cohorts |Each39distinct localnet tx with observed finalized schema2proofs;2500coupons,25000principal,25burned; remainingobligations/supply/vault0 |
| Recovery |API/validator restart, stable manifest/child signatures; uncertain send never silently replaces signature |

See [current backend evidence](BACKEND-EVIDENCE.md), [checks and limits](../30-BACKEND-STRENGTHENING-RESULTS.md), [API contract](../15-API-CONTRACT.md) and [clean proof](../evidence/execution-strength-clean-549f5703-645c-4870-8b70-ccc5c58f8a20.json). Cohorts are historical observations with individual genesis/signatures, not fresh public-devnet attestations. Pruned RPC history remains disclosed. Later judge setup/documentation changes are reported separately in the release delivery check; original tests are not relabelled as new runs.

## Run

Use the bilingual README for the full first-clone prerequisites and exact commands. Windowsx64+Node22.14.0+PowerShell7+Ubuntu24.04WSL2: npmci → npmrun setup:judge → npmrun demo:lifecycle. Live app/API3160, RPC8959. Archive preview4180 is read-only and cannot settle. Native Ubuntu CI runs tests; the complete lifecycle launcher is Windows/WSL-specific.

## Real, simulated and bounded

Real: compiled Solana program, SPL transfers/burn, immutable snapshots/terms, votes and signatures. Simulated: valueless settlement currency, generated signers and accelerated schedules. No bank/KASE API/custody/KYC/legal securities register is integrated.

Limits:16holders,8coupons,4beneficiaries per batch,32proposal discovery window, wholeunits, fullprefunding, no surplus withdrawal, external settlement freeze authority/RPC trust. Human wallet/devnet/public hosting/production security and regulatory readiness are not established. New source/signing is release/genesis-fenced; exact signed recovery retains its own prior evidence.
