# Backend strengthening — authorized implementation plan

8 October 2026. The owner explicitly requested implementation of all engineering improvements proposed after the KASE audit. Root: `C:\Users\dmitrii\Documents\solana`. ProofPilot coach plan→review/direct implementation; Solana program/RPC/testing/security guidance and independent source review apply. No official score is claimed.

## Scope and acceptance

| Stage | Deliverable | Required evidence |
|---|---|---|
| S01 Runtime durability | Native Linux storage for new release ledgers, disk/readiness checks, bounded logs, ownership-checked recovery | Actual restart preserves genesis/financial state; RPC/SQLite readiness distinguishes partial failure; no reset or new financial signature |
| S02 Contract financial terms | Additive atomic rate-instrument initialization with immutable FinancialTerms PDA and checked exact formula | Direct program wrong-rate/amount/authority/PDA calls fail; canonical500/10000 works; old fixed/irregular instruments remain compatible |
| S03 Finality | Separate actual processed/confirmed/finalized observation from business status, provenance and retained history | Transition/pruning/conflict tests; no promotion from missing history; actual finalized RPC proof |
| S04 Stateful testing | Deterministic seeded sequences using existing LiteSVM and independent financial invariants | Reproducible seed, meaningful successful/rejected actions, supply/snapshot/claim/burn/rollback checks |
| S05 Reproduction | Clean source staging and verification workflow excluding original local state/signers | npm/SBF build and a full isolated cycle without original fixtures; pinned toolchains and deployed hash inspected |
| S06 Lifecycle coordinator | Durable parent/child IDs for record capture, coupons, redemption opening, holder-signature waits and final reconciliation | Crash/restart/replay at boundaries; waiting for holder signature preserved; closure needs chain totals and explicit finality status |

Annual frequency is the coupon-formula divisor; calendar dates remain explicitly configured. No new day-count convention or automatic calendar cadence is invented. Principal remains holder-signed; no permanent delegate, arbitrary issuer burn or wallet-secret storage is introduced. Only explicitly configured generated local test execution may sign without a human wallet.

## Ownership

- Lead: runtime/scripts/reproduction/coordinator, API/admin/chain-view integration, shared config/dependencies/IDL generation/Git and final docs.
- Program worker: `programs/bondtrace/src`, `packages/client/src/program.ts`, `tests/program/runtime.rs`, its new scoped tests/report. No shared builds until coordination.
- Finality worker: RPC/journal/proof capture modules and scoped tests/report. No financial-program or admin edits.
- Fresh critic: independent read-only review report. Initial plus at most two material repairs; past review lineages remain historical.

Every assignment/continuation must read AGENTS/STATE and choose/read suitable actually installed skills before substantial work. No concurrent edits, shared installs/builds/Git. Existing UI is separately maintained and is not redesigned here.

## Preservation and gates

Old ledgers, ignored signer files, historical evidence and old Bond account layout are preserved. A new deployed image uses a separate namespace; old accounts are not silently relabelled as rate-validated. Runtime recovery never resets a ledger or re-signs uncertain payments. New snapshots/evidence use exclusive filenames.

Authorized: reversible implementation, free tools, localnet/devnet test assets and generated test signers. Not authorized: mainnet, real funds, paid services, public visibility changes, account/legal consent or final submission. Source changes are not proof; each stage needs its recorded checks and actual integration evidence.
