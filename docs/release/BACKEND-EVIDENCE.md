# BondTrace backend evidence packet

Prepared for source-based technical review on 8 October 2026. Challenge scope: eligible holders → exact entitlement → execution/initiation → verifiable Solana outcome. KASE weights supplied by the owner are Technical Execution30%, Corporate Action Logic25%, Product/UX20%, Real-World Applicability15%, Innovation10%. This packet addresses backend evidence and retains the other criteria; it does not predict a score or certify admission.

## Reproduce and inspect

Prepared Windows/WSL environment:

```powershell
npm ci --ignore-scripts
npm run demo:lifecycle
# An independent source-only copy with fresh keys/state and another local validator:
npm run verify:source
```

The toolchain is pinned to Node22.14, Rust1.91, Agave3.1.10, Anchor1.1.2. The original host selected isolated BondTraceRuntime after its previous Ubuntu disk became unavailable; an explicit `BONDTRACE_WSL_DISTRO` selects an independently prepared compatible distribution. No owner wallet or previous fixture is required by the clean-copy workflow. New native ledgers are separate from previous ones.

## Evidence map

| Claim to inspect | Relevant source | Meaningful verification |
|---|---|---|
| Correct annual coupon formula even when bypassing API | `programs/bondtrace/src/lib.rs`: `initialize_rate_issue`; immutable FinancialTerms61-byte PDA | Direct SBF wrong-rate/amount/remainder/overflow/signer/PDA tests; canonical10×1000×10%÷2=500 |
| Registry and record cutoff | Register/issue/seal/freeze-controlled transfer + Coupon accounts | Snapshot capture before transfer; old10-unit right preserved when current balance becomes8 |
| One payment per holder/event | Contract shared claim/settle mask, canonical beneficiary ATA | Duplicate/unauthorized/wrong-account/zero-right failures; atomic failed batch rollback |
| Principal and retirement | `begin_redemption`, `redeem_principal` | Holder-signature boundary; burn and settlement rollback together; no repeated principal |
| Additional action | Proposal/Ballot accounts, issuer creation and holder ballot | Fixed weights yes10/no5; one ballot per holder; informational voting disclosed |
| Exact financial read | `server/chain-view.ts`, `reconciliation.ts` | FinancialTerms/supply/holders/coupon/reserve from one confirmed bank; independently checked integer identities |
| Accurate transaction outcome | `rpc.ts`, journal and schema2 proof decoder | Actual finalized RPC observation; no promotion of pruned/legacy history; signature/message/genesis/release bound |
| Recovery and lifecycle orchestration | `lifecycle-run.ts`, `coupon-run.ts`, prepared receipts/SQLite | Persisted parent/child IDs, replay and restart; unknown children block dispatch; external principal remains holder-signed |
| Runtime durability | Native runtime helper, readiness, disk/diagnostic supervisor and relay budget | Actual API/validator restart and quota-stop test; repeated same-wire recovery, no ledger reset |
| Adversarial sequences | `tests/program/runtime.rs` independent deterministic model |64 seeds exercising successful/rejected financial transitions, conservation, masks, immutable rights and rollback |
| Source reproduction | `scripts/reproduce-source.mjs`, native Linux CI script and workflow | Source allowlist excludes secrets/state/compiled outputs; build compared to frozen SBF; new localnet cohort and logs |

Current evidence: [original-host39-transaction run](../evidence/execution-strengthening-20261008172355127-29505989.json), [verified clean-source result](../evidence/clean-source-reproduction.json), [separate clean39-transaction cohort](../evidence/execution-strength-clean-549f5703-645c-4870-8b70-ccc5c58f8a20.json), [technical guide](../../TECHNICAL.md), [implementation/check report](../30-BACKEND-STRENGTHENING-RESULTS.md). Every cohort retains its own genesis, issue, source release and signatures. The clean snapshot passed185source hashes,219Node/52UI and11commands; failed earlier attempts remain separate. This is a clean source copy on the prepared host with compiler/npm caches, not a fresh physical machine or a remote CI claim.

## What is implemented, simulated or unknown

- Implemented: custom Solana SBF program, classic SPL test bond/settlement mint, immutable terms/snapshots, exact payout/burn and voting, transactional public metadata, signed-message review/recovery, finality observations and bounded local runtime supervision.
- Simulated: settlement currency has no real fiat value; generated signers are test identities; the accelerated contract schedule is a demonstration. No bank/KASE payment API is claimed.
- Finality scope: every transaction in the strengthened demonstration was checked finalized and has a retained schema2 proof. The aggregate parent remains unknown for unlinked external holder signatures; the separate evidence index provides those actual signatures. A parent has no invented transaction signature.
- Limits:16holders/8coupons/4-per-atomic-batch/finite32-proposal discovery, whole bonds, full reserve, no surplus withdrawal, outside settlement freeze authority and RPC/history trust. Voting does not automatically amend terms. Frequency is an annual divisor, dates are explicit.
- Not established by backend tests: real-user demand, KASE partnership/integration, production regulation/security, human-wallet/devnet/public hosting, main registration/eligibility or final submission. Actual submitted repository/media access and event evidence cutoff require their own owner/organizer verification.

ProofPilot was inspected at pinned upstream `e6c2a3c7af6b509cd5648884a017a610e68c739c`; its checker performs schema/weight/arithmetic bookkeeping, while source assessment depends on the evaluator and allowed artifacts. A local unscored coach card retains the full KASE weight denominator with unknown admission and no numeric score. It is not an official rubric adoption or judge run. [Protocol analysis](../research/proofpilot-evaluator-preparation.md).

AI assistance and reused dependencies are disclosed in README. No competitor program or archived trading bot code was imported. The optional project-local Stoic skill is a transparent reference-derived execution review; the upstream archive has no Codex skill. Neither that skill nor a green mechanical checker substitutes for the runtime evidence above.
