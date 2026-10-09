# Owner-requested engineering audit — verified results

8 October 2026. Workspace: `C:\Users\dmitrii\Documents\solana`. Scope: inspect existing implementation before editing, repair confirmed gaps and verify all eight owner requirements on a real test Solana runtime. This is engineering evidence, not a competition score or submission confirmation.

## Final requirement matrix

| Requirement | Final status in bounded prototype | Fresh evidence |
|---|---|---|
| Test SPL instrument with nominal/rate/frequency/maturity | ✅ | Rate10%/frequency2/nominal1000; issuer-signed creation Memo; verified against immutable Bond amounts; original fixed UI preserved |
| Holder registry | ✅ | Six canonical holders, 25 issued whole bonds; runtime also tests 16-holder maximum |
| Immutable record-date snapshot | ✅ | Two captured dates; transfer of two bonds preserves first holder's historical 10-bond coupon |
| Exact coupon/principal | ✅ | Example500/10000 checked; regular-rate creation rejects inconsistent amount and nonrepresentable base units |
| Coupon payment | ✅ | Claim and shared-mask operator batches; two coupons total2500; atomic four-recipient batch808bytes |
| Maturity with retirement | ✅ | Principal25000, 25 bonds burned, final supply/vault/obligations0; coupon claim still works after burn |
| Additional action | ✅ | Snapshot-weighted voting yes10/no5; one ballot per holder; no governance execution claim |
| Verifiable result | ✅ | 39 distinct live transactions with39 retained proofs; independent fresh RPC reread and signed Memo verification |

These checkmarks refer to inspected localnet/test-asset behavior. They do not certify devnet/mainnet, real fiat, human-wallet execution, unlimited scale or production safety.

## Repairs

- A01: a funded frozen vault could activate. Real old-SBF regression failed; new guard rejects activation without changing DRAFT/accounts. Thaw permits coupon500/principal10000/burn. API mirrors the guard.
- A02: own issuer instruments lacked rate/frequency. Optional exact rate descriptor now derives/checks every coupon, is signed in the same creation transaction's Memo and is immutable in the confirmed catalog. Bond layout/IDL and legacy fixed/irregular instruments were preserved.
- A03: a commit-before-send interruption lacked explicit relay recovery. New POST rebroadcast verifies retained wire, all signatures, genesis/release/intent/lifetime and sends the same bytes/signature. Confirmed replay remains passive; expired unknown receipts never receive a new signature automatically.
- A04: full-smoke could overwrite historical JSON. Unique filenames, collision rejection and exclusive writes now preserve original evidence.
- A05: full demo required manual setup. `npm run demo:lifecycle` builds, starts the isolated runtime, resumes a durable bootstrap and executes/records the entire lifecycle.
- Runtime verification found a shared UDP-pool collision with old validators and an unsupported PowerShell `Set-Content -NoClobber` argument. Repaired with per-RPC pools, early child-exit diagnostics and `Out-File -NoClobber`; failed logs remain. README prepared commands now use the correct isolated ports explicitly.

## Actual checks

| Check | Result | Local log / artifact |
|---|---|---|
| Full Node |183/183 passed,0skipped | `.local/backend-execution/audit-node-tests.log` |
| Current UI tests |52/52 passed,0skipped | `audit-ui-tests.log`; includes independently maintained concurrent UI work |
| Rust units + actual SBF/SPL runtime |3+12 passed,0failed | `audit-program-tests.log` |
| TypeScript/Vite final build |Passed | `audit-web-build.log` |
| One-command lifecycle |Exit0;29wallet+4operator+6auxiliary=39 | `audit-lifecycle-demo-repair2.log`; [public artifact](evidence/execution-audit-20261008-144825-adc8a8ab.json) |
| Cold read-only verification |39 signatures, hashes, signed Memo and final totals verified again | `audit-live-verify.log`; `scripts/verify-lifecycle.ts` |
| Live commit-before-first-relay recovery |Recipient0 before relay; one transfer890880testlamports; same signature on replay | `audit-live-rebroadcast-repair.log`; [separate recovery artifact](evidence/rebroadcast-audit-1791453337606-e5bc1c10-8577-4260-b03b-237cc968d0bf.json) |
| Built-origin HTTP |HTML200; unauthorized seal400; duplicate principal400; formula mismatch400 | `.local/backend-execution/audit-http-checks.json` |
| Independent source/evidence review |Observed findings closed in current evidence scope | [review](research/kase-owner-audit-independent.md) |
| Scoped diff / final artifacts |Checked by lead; no Git mutation | Source hashes/checkpoint accompany final delivery |

The recovery fault is deliberately injected after durable receipt commit and before calling RPC; a separate live API process reads that receipt and relays its same signed message. This is a real localnet cross-process recovery verification with an injected transport fault, not a claim that an uncontrolled OS crash was observed. The first native-SOL fixture used less than the fresh recipient's rent minimum and failed simulation before commit; its failed log is retained. The repaired fixture queries actual rent exemption rather than assuming it.

## Exact live run

- API/built origin: http://127.0.0.1:3140. RPC: http://127.0.0.1:8939.
- Instrument: `57iYMPYrnjcPZhhjRzDBKCKNPafY6sqawnqbpLAYGuWE`.
- Program: `B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8`.
- SBF483008bytes; SHA256 `2c00cf68701f7769fd6a730aa62723d34fb66255db635fd1a1c7e58b7d45b0ff`.
- Genesis: `7EKZqLhf5y3tcBpAGzRLRR9QF7ST7cV2g4GCRfu4ruuw`.
- Namespace: `.local/backend-execution/2c00cf68701f/`. Earlier ledgers/signers/evidence were neither reset nor migrated away.
- Cohort totals: coupon2500000000, principal25000000000, cash27500000000 settlement base units; supply/vault/remaining liabilities0. First holder's first coupon500 uses10 snapshot units, while their principal8000 uses8 units after transfer. Separate unchanged-position runtime regression proves principal10000 for10 units.

All live signatures and accounts are in the public artifact; local Explorer links depend on this original ledger. The later native-SOL recovery transaction is a separate case and is not counted as a fortieth corporate-action lifecycle transaction.

## Remaining boundaries

Rate descriptor is an API/lifecycle capability; the current issuer form continues to create fixed-amount schedules. Actual amounts remain contract authority; old/discovered instruments do not acquire invented annual-rate metadata. Settlement freeze authority can obstruct later funds even after valid activation. Limits remain16holders/8coupons/4-per-batch/finite32-proposal discovery, full prefunding and no surplus withdrawal. Confirmed RPC observations are not independent attestations; pruned/unsupported history stays an evidence gap. No current devnet/human-wallet/public-hosting/submission verification is claimed.

Skills: ProofPilot coach/direct implementation/plan→review/quality and source-grounded independent review; solana-dev Anchor/security/testing; review-and-iterate. No reinstall/provider/account changes. Current host did not expose program_autofixer; that check is not claimed. Old bounded reviews remain historical; this new user-directed audit has new reproduced defects and source evidence, not a reset for better scoring. The original ledgers, keys and other active UI owner's work were preserved; no commit/push/visibility/mainnet/real-funds/paid/final-submission actions occurred.
