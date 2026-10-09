# Issuer composition rework — 8 October 2026

Scope: presentation only in `apps/web/src/IssuerSetup.tsx` and `apps/web/src/issuer.css`. Lead owns App/shared styles/tokens, dependencies/Git and final browser integration. Another agent owns Payments. No backend, ledger, signer, date-picker implementation or numeric semantics were changed.

## Implemented

- The existing three-step form remains full width. At 1180 px and above, the body has a 240 px instructional column and a flexible field/review column, separated by 40 px. Terms retain their existing two-column name/nominal grouping. Smaller widths stack the introduction above the fields.
- Step navigation groups its three numbered stages together instead of distributing them across the entire monitor. It keeps current-step semantics and directional connectors. One consistent Lucide icon accompanies the current task heading; no extra decorative completion marks or animation.
- Body and footer padding are more compact. Technical details remain a real disclosure with all existing facts, inputs and errors. No factual hint was deleted.
- Schedule retains its original controls and relationships. Maturity aligns with one date column on desktop and fills the content width on phone. Existing calendar interactions and focus behavior are unchanged.
- Review labels now use 14 px; coupon dates and amounts use 15 px; authority labels use 13 px. Fixed Manrope sizes and tabular money rendering are retained. All colors inherit shared tokens, including the lead's revised navy palette. There are no additional hardcoded colors or overall max-width caps.
- Markup change is one `.issuer-flow-content` wrapper, current-step icon, `data-step`, and removal of an unused step-map destructuring. Touched validation, Next/Back/submit, first-invalid focus, generated identifiers, date parsing, reserve calculations, permissions and signing handlers were untouched.

## Skills and rules

Reused already-read AGENTS/start/state, PRODUCT/BRIEF/PLAN, Impeccable context, ProofPilot coach context and Impeccable Operate guidance from this task. Read Impeccable `reference/craft-floor.md` immediately before edits. Also read installed frontend-design-guidelines with forms/interactions/states/layout references, brand.md, and vercel-react-best-practices with the applicable conditional-render rule. Existing React/CSS stack retained; no component migration or dependency install.

Mandatory continuation rule: before substantial work, read AGENTS.md and appropriate actually installed SKILL.md/references; report selected skills and evidence. Pass this rule and explicit file ownership into every handoff. User's full-width/single-focus-stroke requirements override generic skill suggestions about container caps or double rings.

## Checks and limits

- `npm run typecheck` executed once after edits. It reported only `apps/web/src/App.tsx(217,65): TS2322 string | undefined is not assignable to string`, in the lead's concurrent Payments integration. No issuer diagnostics were reported. Sent the precise error to the lead; did not edit App.tsx.
- `git diff --check -- apps/web/src/IssuerSetup.tsx apps/web/src/issuer.css` passed. Git noted existing CRLF-to-LF normalization warnings; no whitespace errors.
- Reviewed the small authored markup/CSS patch and the resulting creation wrapper boundaries. The broad Git diff also contains earlier unrelated issuer work; this note does not claim that whole diff was authored in this pass.
- No detector rerun, build, browser action, viewport change or new tests in this presentation-only subtask. Lead must complete integrated typecheck/build and one batched native desktop/phone inspection, including Terms, Schedule/calendar and Review. Visual acceptance is not claimed from source inspection.

Stopping gate: ready for lead integration and bounded browser verification, not publication/submission. Keep transaction and exact-value behavior unchanged.
