# Targeted readability review — 8 October 2026

Scope: native 2560px readability, payment dates/labels, truthful network context and phone usability. This is an advisory source review plus one initial visual inspection and at most one confirmation after repairs. It does not reopen the venture, backend or prior assessment budgets. Ownership: this document only; no code, dependencies, Git, browser, ledger or signer changes by this reviewer.

## Guidance actually used

- Read `AGENTS.md`, `CODEX_SOLANA_WORLDSFAIR_START.md`, `docs/00-STATE.md`, current `PRODUCT.md`, `DESIGN.md`, `brand.md`, frontend BRIEF/PLAN and REGISTRY-FIRST.
- Installed Impeccable 4.5.0: context for `apps/web/src/PaymentsWorkspace.tsx`, typeset, clarify and craft-floor. Operate mode; existing Manrope UI, Plex Mono addresses and original SVG lettering remain authoritative.
- Installed frontend-design-guidelines: layout-and-design and solana-ui-patterns. Project/user requirements for full native desktop width and exact settlement arithmetic override generic container and crypto-abbreviation defaults.
- Installed Vercel React best practices: rendering-derived-state guidance. Date labels should derive from the current stored value and locale rather than introduce additional mutable state.
- Context reported `.impeccable/design.json` older than `DESIGN.md`; no automatic artifact repair was performed. The lead owns token documentation and mechanical checks. Detector output cannot establish visual acceptance.

## Source observations before the lead's change

1. Payment dates use one `date(value, true, language)` string; this formatter includes seconds and time-zone text. `.payments-dates dd` is 13px desktop/12px phone with `overflow-wrap:anywhere`. Natural date/time groups can therefore break inside the value. Recommendation: separate date and complete time+zone groups, preserve seconds/raw time and full accessible context, allow wrapping between groups.
2. Current financial/table/support roles are small for the owner's native desktop: shared body15px/buttons13px, payment labels12–13px, phone holder13px and network11px. Raising the role scale is appropriate, but the existing desktop units160px/amount180px tracks and phone amount145px cap must be rechecked. `overflow-wrap:anywhere` on amounts can split a financial figure as type grows; preserve exact digits and units without rounding or truncation.
3. Toolbar displays raw `state.network` or RPC offline. A plain-language test-environment label can explain `localnet`; exact network and signing scope still need a discoverable details/review surface, including touch. A hover-only title does not provide phone access. Do not label arbitrary/unknown networks as test environments and do not conceal disconnection.

Evidence: `apps/web/src/PaymentsWorkspace.tsx`, `payments-workspace.css`, `styles.css`, `App.tsx`, `format.ts` inspected directly. No new technical claim about chain correctness or production readiness is made.

## Visual evidence and targeted result

At the initial evidence cutoff, reviewer directly opened `.impeccable/review/readability/desktop.png` showing native Payments, `mobile.png` and `network-details.png`. One initial combined desktop/phone inspection and one phone confirmation were used. The final phone capture has `Bonds` and `Amount` labels; the initial phone capture's `Recorded bonds`/`Allocation` labels are superseded. Previous registry-first captures remain historical. See the provenance correction below before linking a desktop artifact: that mutable filename was later overwritten with another active view.

1. **Dates — resolved for the inspected screen.** Record and payment dates each occupy a date line and a complete time line. `04:27:02` and `04:27:03` remain visibly distinct; `Times in UTC+5` is stated once. Neither date nor time breaks inside its digits on the phone. Source `PaymentDate` preserves original `<time dateTime>` and the full seconds/time-zone title, deriving visible text directly from current props and locale.
2. **Type and financial rows — resolved for the inspected values.** Native desktop uses readable recipient/amount roles and a clear hierarchy; the lead measured table18px/date17px/body17px. Source widens desktop units/amount tracks to180px/300px above1600px and prevents arbitrary amount wrapping. The exact `0.05` survives in totals and the holder row. The phone shows the complete first holder row, single-line `Amount` and `Bonds` labels, readable status, both language controls and a single-line Phantom control. The lead measured first-row bottom700px in an844px viewport and document width390px with no overflow. This reviewer visually confirms the layout, not those computed measurements independently.
3. **Network clarity — resolved for the inspected localnet context.** Toolbar says `Test network` (`Test` on the phone). The opened details dialog says `Test environment`, identifies `Solana localnet`, and explains that Solana runs locally with test tokens. Source uses an actual button with an accessible details label, so this is not a hover-only disclosure. The lead also reports opening that same disclosure on the phone. No production or real-asset meaning is implied.

Targeted verdict: **the three original readability risks are resolved in the supplied desktop/phone/localnet evidence; no blocking finding remains in this review scope.** This is a bounded UI result, not owner acceptance, all-product readiness or a financial-security assessment. Extreme u64 amounts, 200% zoom and other browser time zones were not rendered in this review. The lead reports build and32UI tests passing; this reviewer did not rerun them.

The lead reports updating DESIGN frontmatter and sidecar typography to the implemented roles; the earlier context-stale message is preserved as an initial observation, not a remaining blocker. No additional polish cycle is requested.

## Evidence provenance correction — no new review

During late captures the owner navigated the active Chrome tab. The later `desktop.png` therefore showed Registry, and is now named `.impeccable/review/readability/native-registry.png`. The former `desktop-readable.png` showed Voting and is now `.impeccable/review/readability/voting-readable.png`. Neither renamed file is evidence of Payments. The initial native Payments image this reviewer actually inspected remains the historical basis for the initial visual observations; the final native2560 computed font values remain explicitly lead-reported.

Stable final artifact references for this targeted result are `.impeccable/review/readability/payment-detail.png`, `mobile.png` and `network-details.png`. The lead opened `payment-detail.png` at an IAB1270 viewport and reports the final18px amounts, complete split date/time, exact0.05 and friendly network caption. This reviewer did not launch an additional visual pass for this naming correction. The directly inspected final phone and network-dialog evidence above remains valid.

The final type detector has19 advisory findings in unchanged legacy font sizes outside the principal role ramp. It is not an empty `[]` result and is not visual acceptance. No further detector run, legacy restyling or assessment cycle was requested or performed by this reviewer.

## Continuation boundary

Keep mandatory installed-skill selection/read in all handoffs. Preserve transaction/permission/numeric/signer/recovery semantics and original ledger/evidence. No fresh venture/backend assessment, installs, global changes, mainnet, funds, repository visibility, external publication or submission from this review.
