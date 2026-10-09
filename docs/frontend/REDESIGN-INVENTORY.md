# Redesign surface inventory — 8 October 2026

Scope: source inventory and QA recommendations only. No source edits, server/browser control, transactions, installs or Git operations. Root: `C:\Users\dmitrii\Documents\solana`. Read current AGENTS/START/STATE, PRODUCT, DESIGN and frontend BRIEF/PLAN/READABILITY/REGISTRY-FIRST context. Latest owner constraints supersede historical white-canvas instructions.

Skills actually used: project-local ProofPilot (`coach`, bounded UI plan → review, confidential local source; routing/plan/review/safety), Impeccable (context command, Operate and audit reference dimensions). This inventory is neither a scored audit nor visual acceptance. No fresh render/signing proof is claimed.

## Rendered views

| View / entry | Visible records and controls | Important branches |
| --- | --- | --- |
| Overview — `JudgeOverview.tsx` | Actual issue status; coupon/principal/voting result strips; issue terms; Create issue; View coupon/redemption/voting; receipts | No recorded coupon/proposal; recorded vs paid; draft/active/redeeming/redeemed |
| Issuer desk — `IssuerSetup.tsx` | Current issue facts; New issue / Back to current issue; draft numbered phases; holder registration and placement; exact reserve gap funding; activation checklist | Draft before first record cutoff; registry limit16; wrong signer; funding gap/insufficient balance; non-draft servicing results with payment/history links |
| New issue, inside Issuer desk | Terms → Schedule → Review; name, nominal, settlement mint disclosure, generated series ID;1–8 coupons, per-bond amount, record/payment dates, maturity;15-minute example; Back/Next; exact immutable terms/authority review | Touched/blur/progression errors; expired dates while reviewing; wallet-independent draft entry; network/account-scoped persisted draft; storage unavailable; busy/recovery locks |
| Holder registry — `App.tsx`, `PaymentTable.tsx` | Current positions with holder links, address copy, units and face value; Capture record date; selectable coupon snapshots; recorded rights table; snapshot slot/address disclosure | Empty holder list; due/not due; issuer permission; current units after redemption vs retained recorded rights; multiple coupon histories |
| Payments — `PaymentsWorkspace.tsx` | Coupon / Principal selection; coupon history selector; exact selected record/payment/maturity dates; paid/recorded/remaining reconciliation; holder allocation table and Details; compact reserve disclosure; Add reserve; Holder portfolio; receipts | No coupon snapshot; unopened principal redemption; unavailable amounts; unpaid / paid; completed payments lead to receipts; permission/time locks on capture/redemption/funding |
| Portfolio — `HolderPortfolio.tsx` | Viewed holder selector, wallet/name, Signing account / View only; current units/face value; claimable coupon total; retained coupon/principal rows; Details, Claim and Transfer controls | No holder; viewed account differs from signer; scheduled/unclaimed/paid/not eligible; zero holding after burn with coupon rights retained; transfer only while active and for own positive balance |
| Holder voting — `VotingWorkspace.tsx` | Create proposal (issuer); per-proposal weight table, totals/accounts, deadline; own recorded weight; For/Against; snapshot disclosure; closed-vote receipts | No proposal; no signing account; ineligible/unknown/voted; already-voted immutability; open/closed; issuer create permission |

`NextActionDesk.tsx` exists but no live component imports it. Do not treat its copy, lifecycle prompts or optional callback as a rendered screen. `SectionLink` is likewise unused in the current TSX surface graph.

## Overlays and transient surfaces

| Surface | Actions / branches |
| --- | --- |
| Network details | Exact Solana localnet/devnet scope; truthful test-token explanation; offline retry |
| Receipts drawer | All/Coupon/Principal/Voting filters; semantic chronological receipts; retained-vs-current RPC proof; technical signature/slot; devnet Explorer; issue/program disclosure; Other issues switcher with address suffix and pending locks |
| Interface settings | English/Russian; Automatic or explicit IANA time zone; exact date/time preview; available independently of wallet |
| Payment details | Beneficiary; exact quantity × unit amount = entitlement; record/payment instants; paid state; bounded proof lookup loading/matching/unavailable history; technical details; Portfolio / Issue receipts |
| Account | Read-only holder selection; wallet detection/connect/use/disconnect and failure; wallet information link; test signer roles (issuer +3 investors); interface settings |
| Transaction review | Preparing/review/signing/pending/confirmed/cancelled/error/unknown; network and signer; exact amount, recipient, mint, fee, simulation; immutable issue terms; explicit generated-signer scope; recovery ID, signature/Explorer; approve/cancel/close/check/resume |
| Add reserve form | Positive settlement decimal amount, up to6 places; Cancel / Review; submit errors |
| Transfer form | Another registered recipient; positive whole units within own current holding; Cancel / Review; submit errors |
| Create proposal form | UTF-8 constrained title; Cancel / Review; submit errors |
| Native date/time dialog — `DateTimeField.tsx` | Month/year selectors, month arrows, day grid,24-hour hour/minute inputs; preserved seconds; selected instant preview; Save / Cancel / close/Escape; bounds/DST/invalid segment/open failures; focus return |

Global surfaces: skeleton initial loading; truly empty Issues state with Create issue / Open example workspace; API/RPC error with retry while keeping selected view; unresolved-operation warning with Check operation; desktop navigation/mobile menu, language/network/settings/account/refresh toolbar; address copy success/failure and safe Explorer links.

## Essential redesign acceptance controls

1. **Authority:** selecting any viewed holder never changes the signer. Review and action availability still use `activeWallet`; issuer-only operations and holder-only claims/votes retain their existing gates.
2. **Financial truth:** current holdings, fixed snapshots, forecasts and payable rights stay distinct. Test zero,0.05, six significant decimal places and large integer values. Remove insignificant trailing zeroes only; keep raw precision accessible. Unknown chain values remain unavailable rather than zero.
3. **Time:** exact selected payment instants and seconds remain visible on stable separate lines. Auto/explicit timezone changes presentation only. Test draft Back/navigation/reload, cancelled date edits and rebase across zones; new ambiguous/skipped wall times must fail validation.
4. **Recovery:** rejected signature, prepare failure, expired review, confirmation timeout and restored unknown operation preserve a recovery ID and prevent duplicate submission. Pending/signing blocks dialog close and issue/account changes as currently intended. RPC failure must not show the empty-first-run form.
5. **Layout/craft:** batch capture all six views plus terms/schedule/review, calendar, account, settings, receipts, payment details and real error state at native2560 and phone390×700/844; add1280/tablet reflow. First phone record belongs in the first viewport. Financial text18px/body17px; full workspace width with bounded internal tracks. Keep original path lettering and one coherent icon family.
6. **Controls:** keyboard menu/dialog/calendar navigation; Escape and focus return; one existing-border focus edge for fields; clear disabled reasons; no validation red while typing; phone touch targets and on-screen keyboard; long Cyrillic names, full addresses and UTF-8 byte limits; EN/RU errors and signing review.
7. **Performance/state:** shared CSS changes must not reset draft/form stage, current coupon, viewed holder or deep links (`view`, `instrument`, `payment`, `holder`). Skeleton and spinner convey real work only; static status never blinks.

## Source-observed risks to address or explicitly verify

- **Localization gaps:** the language provider translates explicit `t()` calls only. `components.tsx` ErrorNotice heading, App action-form titles/help/errors, several review authority/dynamic messages and some empty-state descriptions are raw English. Verify every requested RU surface, including failure/review rather than Payments alone.
- **Last-read data:** App keeps the previous instrument on a refresh error and disables actions; some tables/portfolio facts can remain last-read values under the global error banner. Preserve this recovery behavior and make freshness understandable; do not replace unavailable values with zero or invent fresh confirmation.
- **Overlay handoffs:** account→settings, payment detail→receipts, form→transaction review and issue switching combine different React state variables with native dialogs. Verify visible-dialog order and focus restoration rather than relying only on CSS or native focus trapping.
- **CSS authority:** shared styles, issuer/date styles and `operations-design.css` overlap. Measure final computed working text/focus/width after integration; a detector result or token declaration alone does not prove the final rendering.
- **Historical context conflict:** frontend documents retain earlier light layouts and smaller table text as history. PRODUCT/DESIGN/current AGENTS corrections govern the new work; old screenshots and finish verdicts are not owner acceptance.

No browser, build or transaction checks were run by this inventory worker. The lead owns integration, runtime, Git and `docs/00-STATE.md` checkpoint updates. All mainnet/real funds/paid/public-visibility/final-submission owner gates remain in force.
