# Settlement Ledger — issuer and calendar implementation

8 October 2026. Root: `C:\Users\dmitrii\Documents\solana`.

Worker ownership: `apps/web/src/issuer.css`, `apps/web/src/date-time-field.css`, the two issuer read-only disabled reasons in `IssuerSetup.tsx`, this note and the preceding `REDESIGN-INVENTORY.md`. Existing dirty work was read before editing and preserved. No edits to IssuerSetup JSX, calculations, validation, draft storage, action payloads, permissions, dependency/config files, shared styles, runtime or Git.

## Direction and changes

Applied the lead's Settlement Ledger direction through the shared tokens: dark ink canvas, tonal navy panels, darker inset fields, readable pale text and saturated blue actions with white labels. Original brand and global navigation stay lead-owned.

- Issuer facts now read as separated ledger columns with a22px title,15px labels,17–18px facts and exact second-bearing date/time lines.
- Draft placement uses the full workspace plus a380px reserve/activation column. At narrower desktop widths the reserve panels move below placement, then stack on phones. Registration/placement fields gain two columns on wide desktops without imposing a form-width cap.
- Fields use16px labels,17–18px values,52–56px height and the existing single border-edge focus treatment. Hints/errors remain15px and are still controlled by the existing touched/submit state.
- Creation has three equal numbered tracks, a220px instruction column from1280px, grouped terms/schedule fields, readable immutable review rows and a quieter footer. Phone actions stack onto full-width rows; saved-draft/storage messages remain visible.
- Exact financial/quantity values use IBM Plex Mono with tabular lining figures. No decimal parsing, arithmetic, display trimming or raw review precision changed. The project exactness policy overrides generic abbreviated/token-price suggestions in the formatting skill.
- Lucide icons use consistent1.75 strokes. Completed stage/checklist numbers stay restrained rather than become repeated decorative checks. No visual animation was added.
- Calendar is a compact420px protected dark editing surface, bounded by the viewport. Month/year selects and time controls use inset fields; dates and hour/minute values use clear tabular figures. Close/nav controls are44px and Save/Cancel48px. Existing seconds, timezone/DST checks, native focus trapping and Save/Cancel behavior remain unchanged. Internal scrolling keeps the action row outside the scroll body.
- Per lead's later instruction, `connectedHint` and `creationHint` prioritize the new optional `readOnlySnapshot` marker with an explicit English/Russian read-only reason. The marker and mutation guards are lead-owned; this worker changes only why the disabled action is explained.

## Skills actually used

- ProofPilot coach: existing bounded UI plan → implementation → review; routing/plan/review/safety read during inventory. No demand, eligibility or backend assessment was restarted.
- Impeccable: context command once, Operate, audit dimensions, new-work and craft-floor. Lead supplies the replacement direction; this worker implements its specified issuer/calendar surfaces.
- frontend-design-guidelines: existing brand/context plus forms, interactions and layout/design references; existing React/CSS foundation retained.
- number-formatting: tabular data/precision/accessibility guidance and review checklist. Existing exact settlement display is authoritative; no abbreviation or rounding changes.

## Verification and handoff

- Both modified CSS files parsed successfully with the existing PostCSS dependency.
- `npm run typecheck` passed (`tsc --noEmit`).
- Scoped `git diff --check` passed; issuer/date source differences were inspected against the contents captured at worker entry.
- No browser/render/touch/keyboard/signing checks were performed by this worker. Lead owns the integrated build, one batched actual render matrix and evidence-driven repair.

QA emphasis: creation Terms/Schedule/Review, registration and placement, exact reserve gap/activation, calendar with RU long month labels and errors at320/390/768/1440/2560; phone footer actions and no page overflow; saved draft and timezone seconds; native select/focus states after shared CSS integration. Mainnet, real assets, paid services, public visibility and final submission gates remain unchanged.
