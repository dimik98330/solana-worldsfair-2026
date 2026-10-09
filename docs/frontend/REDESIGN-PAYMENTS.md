# Payments and voting — Settlement Ledger redesign, 8 October 2026

Agent scope: `C:/Users/dmitrii/Documents/solana/apps/web/src/payments-workspace.css`, `voting-workspace.css`, minimal presentation-only markup in `PaymentsWorkspace.tsx` and `VotingWorkspace.tsx`. `PaymentTable.tsx` was read but unchanged. No dependency/config/backend/ledger/signing/Git mutation. Existing uncommitted source was the starting point; no file was reset.

## Decision and source evidence

ProofPilot explicitly invoked in coach mode, bounded plan → implementation → review. This is an existing working financial app; no new feature or venture assessment. Impeccable Operate/new-work/craft-floor guides replacement of the rejected large rounded ledger wrapper with flat records and ruled contextual details. Frontend-design-guidelines (layout, interactions/states, Solana UI patterns) preserves familiar buttons, exact states, dates and permission reasons. Number-formatting was read for tabular data, with the project-specific exact-settlement requirement overriding general abbreviation/precision recipes. Exact display still uses existing Money/units; no formatting/calculation helper changed.

Read governing AGENTS/START/STATE, PRODUCT/DESIGN/brand, frontend BRIEF/PLAN/REGISTRY-FIRST/READABILITY. Source files and global table/operations styles were inspected. Incumbent visual evidence inspected: `.impeccable/review/operating-ui/payments-desktop.png`, a prior native2560 capture; its token world is historical after the current replacement direction. No fresh live visual acceptance is claimed by this worker.

The lead selected Settlement Ledger palette (#101824 canvas, #162231 panel, #1b2a3c subtle, #0e1723 inset, #f0f4fa text, #b2bdcb muted, #31465d rule, #61798f control, #356df3 action), Manrope UI and IBM Plex Mono exact figures. This worker uses shared CSS variables, no local alternate palette. Selected text stays foreground; primary is only a focus/selection stroke. Global links remain lead-owned and should use --link.

## Implemented

- Payments page has one task heading; the duplicate issue name under it was removed because the global issue/account toolbar carries the selected issue.
- Flat ledger: tabs, selected payment, exact dates with seconds, one zone note, and paid/recorded/remaining reconciliation precede holder records.
- Financial figures use IBM Plex Mono; holder names/amounts18px, labels15–16px, reconciliation26px (phone22px).
- Wide table internal tracks340px holder /180px recorded bonds /240px amount /160px status, with detail actions starting directly after the status track. Workspace/table remain full width, with no1360/900px cap.
- Right inspector320px separated by a structural rule. Completed-payment receipts, collapsed reserve and portfolio control preserve existing behavior. Reserve labels stay close to values.
- On phone, dates are two columns, reconciliation is compact and holder rows retain recipient/quantity/amount/status/detail action. The first-record844px criterion requires the lead's integrated measurement.
- Voting uses the same flat heading/table/inspector composition. Existing result weights remain exact; the real ballot deadline gains a Lucide calendar icon. Icons in these scopes use1.75px strokes. No motion, blink, decorative checkmark or invented chart.
- Unavailable-state text, disabled reasons, all callbacks and all mathematical/chain/snapshot/signing code remain unchanged.

## Checks and remaining limits

`npm run typecheck` passed. Scoped `git diff --check` passed; these files were already untracked, so that command alone does not prove their content delta. Source review confirms the only TSX deltas are removal of duplicate heading copy, one date-group wrapper and the deadline icon/import.

One scoped mechanical detector was run before the lead's message to reserve detection for integration arrived. It returned three advisory font-size findings19/20px; those literals were corrected to existing18/22px roles. Detector was not repeated, and its result is not design acceptance. No UI regression suite was rerun for CSS/structure-only changes. Integrated build, desktop2560/1440 +phone390 renders, first-record bounds, translated labels, controls and voting states are explicitly delegated to the lead. Fresh measured evidence belongs in the final integrated checkpoint.

Stopping gate unchanged: no account login/consent/registration/messages/final submission, public repository visibility, mainnet, real assets or paid services. No subagents spawned by this worker.
