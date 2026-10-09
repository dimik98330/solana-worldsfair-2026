# BondTrace requirement audit — 8 October 2026

This is an engineering audit against the eight requirements supplied by the owner in this chat. It is not an organizer score, mainnet certificate or submission confirmation. Stage 1 inspected the dirty working tree without source edits. Existing ledgers, keys and historical evidence were preserved. Later repairs are identified separately below.

## Before repair

| Requirement | Status at initial audit | Implementation / evidence | Missing work |
|---|---|---|---|
| 1. SPL instrument with nominal, coupon rate, frequency and maturity | ⚠️ Partial | `programs/bondtrace/src/state.rs`, `contexts.rs`; classic SPL bond mint, nominal/maturity/fixed coupon schedule | Ordinary issuer API lacked rate/frequency; only seeded demonstration had a descriptor |
| 2. Holder registry | ✅ Verified in actual SBF/SPL runtime | `register_holder`, `issue_units`, canonical ATAs; `server/chain-view.ts` | Bounded prototype: 16 registered wallets, whole bonds |
| 3. Immutable record-date snapshot | ✅ Verified in runtime | `capture_coupon`, immutable `Coupon.units`; transfer cutoff until capture | No arbitrary historical RPC reconstruction is claimed; positions are locked at cutoff |
| 4. Exact coupon and principal | ⚠️ Partial requirement coverage | `packages/client/src/domain.ts`, checked Rust arithmetic; existing tests give coupon 500 and principal 10,000 | Issuer creation did not connect declared rate/frequency to supplied unit amounts |
| 5. Coupon settlement | ✅ Verified in runtime | `claim_coupon`, `settle_coupon`; canonical recipient and shared claimed mask | Mock settlement asset; external fiat rails absent |
| 6. Redemption with token retirement | ✅ Verified in runtime | `begin_redemption`, atomic principal transfer + SPL burn | Settlement freeze authority can obstruct later payouts; no production token guarantee |
| 7. Additional action | ✅ Verified in runtime | `create_vote`, `cast_vote`; fixed weights, one ballot | Informational voting, no automatic governance execution |
| 8. Verifiable on-chain result | ✅ Mechanism verified; fresh full-cycle run pending | Bond/Coupon/Proposal/Ballot accounts, events, signed receipts and execution-proof archive | Localnet Explorer requires the corresponding local validator; RPC history is finite |

Initial checks: Node 174/174; UI 35/35; Rust unit 3/3 and actual SBF/SPL runtime 11/11 passed. Direct SBF build passed and matched the prior 482,752-byte release. First web build failed because `App.tsx` referenced the then-missing `VotingWorkspace.tsx`. A concurrent UI owner supplied that file; a subsequent build passed without this auditor replacing their UI.

## Confirmed findings and scope

| ID | Priority | Finding | Concrete repair |
|---|---|---|---|
| A01 | P0/P3 | `seal_issue` accepted a fully funded but frozen settlement vault | Require Initialized vault before ACTIVE; matching API preflight and actual SPL freeze/thaw regression |
| A02 | P1 | Own issuer issues lacked rate/frequency and formula validation | Optional exact rate terms; exact amount derivation/checks; signed creation memo, confirmed projection and explicit provenance |
| A03 | P1 | Commit-before-send crash could retain an unrelayed signed message with no explicit relay recovery path | Explicit POST rebroadcast of the same retained bytes/signature, before expiry and under the same genesis/release; GET stays passive |
| A04 | P2 | `full-smoke.ts` overwrote its historical evidence filename | Unique output, preflight collision rejection and exclusive write |
| A05 | P1 | Full operator lifecycle required several setup commands and environment values | `npm run demo:lifecycle`: build, isolated runtime, durable bootstrap, lifecycle and signatures |

A01 was reproduced before its repair against the actual prior SBF: sufficient reserve 10,500; frozen vault; seal succeeded; phase became ACTIVE. The new regression failed. Log: `.local/backend-execution/audit-frozen-baseline.log`. This is observed failure, not a hypothetical source finding.

No confirmed double-payout, unauthorized issuer or non-atomic redemption exploit was established. Existing runtime tests cover record-date transfers, altered snapshot/account identities, incomplete/reordered holder accounts, claim/settle races, zero entitlement, one-base-unit reserve shortage, overflow, duplicate burn/payment, and rollback after burn when payment CPI fails. Server tests additionally exercise cryptographic signatures, exact-message binding, concurrent SQLite writes, restart recovery and malformed RPC/input responses.

## Simulations, constants and stated limits

- Real: Solana SBF execution, SPL tokens/transfers/burn, PDA snapshots and ballots. Simulated: test settlement assets and generated test identities; no bank/KASE payment integration.
- Mocked RPC transports in Node tests are isolated regressions, not network-deployment proof. Rust runtime tests load the actual compiled SBF and SPL program. The lifecycle command provides independent live localnet execution through the built API origin.
- Explicit constants: 16 holders, 8 coupons, 4 recipients per atomic settlement batch, 32 proposal-discovery window, settlement decimals 6, bond decimals 0, v0 transaction compatibility and full prefunding. No scalable/unbounded registry claim is made.
- Fractional base-unit regular coupons are rejected; there is no float rounding or silent truncation. Fixed irregular coupon schedules remain supported separately.
- No unfinished `TODO`/`FIXME` placeholder implementing a mandatory financial action was found in program/client/server/scripts. UI placeholders are input examples. Simulate-before-sign is a safety step; confirmed settlement still requires a real transaction.
- Excess vault funds have no withdrawal path; third-party freeze authority, RPC trust/history, human-wallet validation and devnet/public deployment remain disclosed limits.

## Final verification

The final counts, source release and fresh lifecycle evidence are recorded in `TECHNICAL.md` and `docs/28-AUDIT-RESULTS.md` after execution. Prior evidence documents retain their original issues/signatures and are not relabelled as this run.

Skills actually read: ProofPilot coach/direct implementation/plan→review/quality; solana-dev Anchor/security/testing; review-and-iterate security/rubric/compute. Official Solana/Memo documentation was checked on 8 October 2026. Current host discovery did not expose `program_autofixer`; its execution is not claimed. UI was concurrently owned elsewhere and was not redesigned by this audit.
