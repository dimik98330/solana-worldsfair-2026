# BondTrace — technical overview

Evidence snapshots: **7 October 2026, 18:46:40 UTC** for the saved API lifecycle and **19:40:55 UTC** for the separately recorded browser cycle (8 October in Kazakhstan, UTC+5). This overview was prepared on 8 October 2026. Exact UI inputs are identified in the demo asset manifest. BondTrace is a permissioned **localnet prototype** for coupons, bond redemption and informational holder voting. It is not connected to KASE, a bank or a custodian, and it represents no real financial asset.

## What is implemented

An issuer creates fixed bond terms, registers holders, distributes indivisible test bond tokens and prefunds all principal and coupon obligations. At a coupon record date, an immutable snapshot preserves who owns the right to each payment. Investors claim the test settlement tokens, vote with snapshot weights and redeem the principal at maturity. Redemption pays the current holder and burns the corresponding test bonds in the same transaction.

The React console provides issuer and investor views, a holder registry, coupon payment table, portfolio, voting and transaction proof. A guided test-signing mode is visibly separate from the external wallet path. The guided mode uses generated local test signers; the recorded demonstration does not establish a human wallet signature.

## Architecture and authority

```text
React / Wallet Standard
        │ prepare, simulate, inspect; wallet signs exact message
        ▼
Node HTTP API / transaction relay / recovery IDs
        │ Solana RPC; chain accounts are authoritative
        ▼
BondTrace Anchor program ── SPL Token CPI
        │                        │
        ├─ Bond / Coupon         ├─ bond mint: 0 decimals
        └─ Proposal / Ballot     └─ settlement mint: 6 decimals
```

The custom program enforces the corporate-action rules. Classic SPL Token performs minting, checked transfers, freezing and burning. The Bond PDA controls the bond mint and its freeze authority; ordinary holders cannot bypass the program with a direct transfer or burn of a nonzero frozen balance.

Issuer signatures are required for issue administration and starting redemption. A holder signs its own transfer, coupon claim, principal claim and ballot. Coupon capture may be initiated by any payer once due. Claims pay a settlement token account owned by the entitled holder with the correct mint. The API's local JSON files retain fixture metadata, prepared messages and recovery history; they are not the authoritative ownership or entitlement register.

The relay accepts only the exact message previously prepared by BondTrace, checked using its message digest. A preview includes the actual network, signer, action, recipient, amount, fee and RPC simulation. Operation IDs bind guided actions to their inputs: replaying an ID returns the existing signature, while conflicting inputs are rejected. A pending or unknown RPC outcome must be recovered by ID/signature before preparing another signature. On-chain one-shot claim records provide the financial protection even if off-chain history is lost.

## State, dates and rights

The issue follows `Draft → Active → Redeeming → Redeemed`. The prototype supports at most **16 preregistered wallets and 8 coupon dates**. Registration and issuance end before the first record date; the holder registry and issued quantity become fixed when sealed.

Dates are Unix seconds enforced against Solana's actual `Clock`. There is no administrator clock override. Record dates increase strictly; payment dates are nondecreasing and cannot precede their record dates or exceed maturity.

Transfers stop at the first uncaptured record date. Capture reads every canonical holder bond account in the registry order, checks token-program/mint/account constraints and verifies that their total equals both the issued supply and mint supply. This transfer cutoff lets a delayed capture preserve the due record-date positions. The snapshot cannot be rewritten. Transfers may resume after capture until the next uncaptured date or maturity.

Coupon claims use historical snapshot units, not present holdings. At maturity, all coupon snapshots must have been captured before redemption begins; coupon claims may still be unpaid. The redemption snapshot uses current holdings. Historical coupon claims remain available after all bonds have been redeemed.

Proposals take their own immutable holder snapshot. A Ballot PDA is unique per proposal and voter; a second ballot is rejected. Votes are informational and cannot change the cash terms or execute a proposal.

## Exact arithmetic and solvency

Amounts are checked `u64` integers in settlement base units. The settlement token has six decimals, so 1,000 displayed test units are `1_000_000_000` base units. The program stores a fixed amount per bond per coupon, rather than calculating a floating-point annual percentage.

The demonstration's illustrative terms are a 1,000 test-unit face value, 10% annual coupon and two payments per year. One coupon is therefore 50 test units per bond: `1_000 × 10% ÷ 2 = 50`. The accelerated demonstration actually contains one coupon, not a two-year sequence.

| Position | Record-date bonds | Coupon | Bonds after transfer | Principal |
|---|---:|---:|---:|---:|
| Generated investor 1 | 10 | 500 | 8 | 8,000 |
| Generated investor 2 | 5 | 250 | 7 | 7,000 |
| Generated investor 3 | 3 | 150 | 3 | 3,000 |
| Total | 18 | 900 | 18 | 18,000 |

Two bonds move from investor 1 to investor 2 after capture. The old 500 coupon remains with investor 1 despite its current balance of eight. The `seal_issue` reserve is `issued × (face + sum(all fixed coupons))`: `18 × (1,000 + 50) = 18,900` test units, or `18_900_000_000` base units. The program has no issuer withdrawal path. After coupons, 18,000 remain for principal. In the saved full run, all 18 bonds were burned and both remaining supply and vault balance reached zero.

Principal payout and burn occur atomically: a rejected destination or failed payment rolls back the burn and claim state. Coupon and principal claim masks reject repeat claims. Checked multiplication/addition reject overflows instead of rounding or wrapping.

## Verified network and runtime evidence

Program ID: `B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8`.

SBF image: 463,096 bytes; SHA-256 `15525ec2de285e7cc3065f7ec8ce47bfe81d1ed2837754b85b8cf2598c935dc2`. Generated interface: `programs/bondtrace/bondtrace-idl.json`.

The full integration evidence was inspected at `docs/evidence/full-smoke-localnet.json` and frozen for this cutoff in [`full-smoke-localnet-2026-10-07.json`](../artifacts/demo/evidence/full-smoke-localnet-2026-10-07.json), checked at `2026-10-07T18:46:40.523Z`. It records **11 confirmed actions**, their signatures, slots, simulation results and recovery IDs. The fixture instrument is `C9KpFDHagCG3sNi6FJqFx3RTaUW38oLqkUFkxpFLUuhN`. Its record, payment and maturity times were 18:45:05, 18:45:10 and 18:46:35 UTC. These are accelerated real chain-clock deadlines; idle waiting may be cut in the video. Later smoke runs may replace the original report; the frozen copy preserves this overview's evidence.

The product video uses a **different, browser-driven issue**, `5knY93zt91XKMqnxz2ukXGHVzx6Ro9vgKsrcrT3RbhJU`. Its state is frozen in [`browser-cycle-localnet-2026-10-07.json`](../artifacts/demo/evidence/browser-cycle-localnet-2026-10-07.json), checked at `2026-10-07T19:40:55.4418372Z`. All 16 activity records in that report are confirmed. It records 900 test units of coupon paid, 18,000 principal paid, 18 redeemed/burned bonds, zero vault balance and a yes-vote weight of 10. Record time was 19:28:42 UTC, payment time 19:28:47 and maturity 19:33:42. Capture occurred later, at 19:31:51, while the record-date transfer cutoff preserved the positions. These are actual accelerated chain-clock dates, not a two-year financial term.

Actual UI JPEGs and timestamped action/pending/confirmed frame captures are preserved in `docs/evidence/ui`; exact copies, crops, hashes and real-transition clip provenance are saved under `artifacts/demo`. The video cuts idle waiting and combines the captured transitions with reading holds on captured results. A view of the immutable snapshot after payment is labelled as such; its `Paid` status is not presented as an unpaid pre-claim state. The older 11-action report appears only as a clearly separate saved-evidence card. Neither fixture is a public devnet deployment or human-wallet demonstration.

| Check | Inspected evidence | Scope |
|---|---|---|
| Rust unit tests: 3 passed | `programs/bondtrace/tooling/unit-results.log` | Account allocations, exact arithmetic/overflow |
| SBF runtime tests: 5 passed | `programs/bondtrace/tooling/runtime-final-results.log` | Real SBF + SPL CPI; access, dates, destinations, sequential coupons, transfer/burn, old rights and votes |
| Complete lifecycle | `evidence/full-smoke-localnet.json` + `scripts/full-smoke.ts` | Local API/chain actions, old coupon after transfer, replay/recovery, duplicate rejection, principal/burn and final zero balances |
| 16-address transaction fixture | Runtime log and architecture checkpoint | Latest logged proposal 884 bytes / 66,584 CU; capture 839 bytes / 68,376 CU; begin redemption 772 bytes / 62,263 CU |
| Client and UI/build checks | Latest integration-lead checkpoint; `17-VALIDATION.md` | 9 Node tests (5 client/domain + 4 mocked transport), 5 UI tests (3 formatting/URL + 2 UTF-8/title), typecheck; production build checkpoint |
| Browser lifecycle and viewport QA | `evidence/browser-cycle-localnet.json`, captured UI, latest integration-lead checkpoint | Issuer/investor guided-signing lifecycle; five pages at 375px, overview at 768/1280px; no document overflow; vote target 40×44px after the fix |

Across the documented runtime runs the largest measured transaction was 884 bytes and the largest compute result was 84,584 CU. This fixture started with only two nonzero holders. An all-positive 16-holder fixture with all eight coupons and maximum-length proposal title has **not** been benchmarked. These measurements do not establish general throughput, finality or maximum performance.

The Solana static autofixer reported no issues; this is not an independent security audit. Browser QA also checked Escape cancellation of an unsigned review with focus returned, the no-wallet dialog and disabled issuer actions in My Wallet mode. These viewport/browser checks do not establish behavior on a mobile OS/device. Human external-wallet signing/rejection and an induced unknown RPC outcome on that human-wallet path remain unverified. Mocked transport tests are labelled separately from real chain execution.

**Devnet is not deployed at this cutoff.** The dedicated test payer lacked test SOL and bounded public airdrop attempts returned an internal error and rate limiting. There is no devnet deployment signature or public app URL. A local Explorer URL points to `127.0.0.1:8899`; it will not connect a remote judge to this machine. See [`16-DEPLOYMENT.md`](16-DEPLOYMENT.md) for the preserved blocker.

## Versions and reproduction

Pinned project versions include Anchor 1.1.2, Agave CLI 3.1.10, Rust 1.91.0, Solana Kit 8.4.0, React 19.3.0, Vite 8.3.3 and TypeScript 7.0.2. Node requires 22.12 or later. Program tools were run inside Ubuntu WSL; the web/API commands run in Windows PowerShell. The checked toolchain paths and installation evidence are in [`02-ENVIRONMENT.md`](02-ENVIRONMENT.md).

From `C:\Users\dmitrii\Documents\solana`, with the existing toolchain and SBF image:

```powershell
npm ci
npm run localnet  # separate terminal; preserves an already running matching program
npm run dev      # separate terminal; API :3000 and Vite :5173
npm run demo:seed
npm run smoke
npm test
npm run test:ui
npm run typecheck
npm run build
npm run test:program
```

These are reproduction commands, not a claim that a fresh machine or a hosted deployment was verified. `npm run smoke` resets and creates a new local demonstration issue, waits for actual record/maturity deadlines and replaces its local evidence report. Do not run it against a fixture whose state or demonstration capture must be preserved. The checked `.env.example` selects localnet and enables only the explicit test harness. Generated keypairs and local state stay ignored and must not be published.

## Remaining trust and product limits

An upgradable deployment would retain trust in its upgrade authority; the prepared devnet configuration retains a payer authority and no production multisig/timelock policy is implemented. Test settlement-mint authority may freeze payment accounts, affecting liveness. Issuer action is required to start redemption; lost holder keys have no recovery flow. Excess prefunding is locked, rent/state remain, and full prefunding is a capital constraint. Rights and balances are public. There is no KYC, legal register, fiat settlement, custody integration, production audit, fuzz/formal verification or validation with real issuer staff. Test accounts are not users or traction.

Source access for judges, video publication, global registration/application, eligibility and owner consents remain submission tasks. The repository is private; no visibility change or final submission is implied by this overview. The KASE specification source was read by the lead on 7 October 2026: [Superteam Kazakhstan × KASE listing](https://superteam.fun/earn/listing/superteam-kazakhstan-x-kase-side-track-corporate-actions-on-blockchain). This overview describes project artifacts; it does not certify eligibility or organizer acceptance.

Preparation used installed ProofPilot in coach mode (`submit`, truthful project claims), marketing-video, video-craft and design-taste. It preserves the project's approved scope and bounded-review history.
