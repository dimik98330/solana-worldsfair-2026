# Issuer workflow revision — 8 October 2026

Owner: issuer worker. Files: `apps/web/src/IssuerSetup.tsx`, `apps/web/src/issuer.css`. Lead owns integration, shared tokens, browser verification, top-level checkpoint and Git. Calendar worker owns `DateTimeField` and its date/time semantics.

## Direction and skills

The latest owner rejection of white surfaces supersedes the earlier light-workspace brief. This flow inherits the lead's navy workspace, blue actions and Lucide icon system. It keeps the approved terms → schedule → review sequence and exact transaction semantics.

Actually read and applied: Impeccable (`context --target`, new-work/operate/craft-floor); frontend-design-guidelines (forms/interactions/states/layout); Vercel React best practices (`rerender-no-inline-components`); ProofPilot **coach**, bounded plan → review for this narrow interaction correction. No research, scoring, dependency installation or external service action was needed. Preserve the AGENTS mandatory skill selection/read rule in subsequent work and handoffs.

## Implemented

- Text fields validate independently after blur or explicit step/submit attempts. Editing clears that field's displayed error until another blur/attempt. Registration blur no longer marks its unrelated sibling invalid. Coupon/calendar selections do not trigger premature parent errors.
- Existing three-step flow preserves draft values across step changes, focuses a step heading on navigation and the first error on failed validation. New-issue mode hides selected-issue management. Inputs are module-level components and keep their DOM identity during typing/clock updates.
- Shorter headings and copy; removed the second page introduction in creation. The schedule shortcut explicitly names the 15-minute example. Review action wording now matches transaction preview; expired terms offer “Check fields”.
- Exact review amounts remain visible when a date expires, using the existing exact parser and BigInt addition. `validateIssueDraft` remains the authority for submission. No float conversion, program limits, transaction parameters, permission checks or signer behavior changed.
- Inset 48px creation inputs use shared `--input` / `--border-control` tokens, visible blue focus, unchanged background on errors, tabular figures, max 900px form width, aligned page/form edge and mobile stacking. No hard-coded light colors.
- Added Russian translations for existing reserve/placement guard messages and localised section accessible labels.

## Evidence and remaining checks

- `npm run typecheck`: passed after integration with current calendar files.
- `node --import tsx --test apps/web/src/issuer-validation.test.ts`: 12/12 passed, zero skipped (existing exact-number/date/limits/placement tests).
- Impeccable detector for the two owned UI files: `[]`.
- `git diff --check -- apps/web/src/IssuerSetup.tsx apps/web/src/issuer.css`: passed (Git prints existing line-ending normalization notices).

No browser or visual acceptance is claimed here. Lead must verify the complete dark result together at desktop/mobile widths: initial typing stays neutral; clearing and retyping after blur/Next preserves focus and clears the current error; Next focuses the first failing field; back/forward preserves dates/values; calendar Save/Cancel works; exact final review is correct and no external signing occurs before user confirmation. Do not reuse prior light-theme captures as proof of this revision.

## Evidence-driven focus repair

Lead's actual browser check found that clicking Plan payments on an empty name displayed its error but left focus on the button twice. The rAF callback could run before React committed touched attributes. Replaced failed-submit focus in creation, registration and placement with explicit incrementing focus requests consumed by `useLayoutEffect` after commit. Step heading focus uses the same committed request mechanism. Effects depend only on these explicit requests, so ordinary typing and blur cannot steal focus. Typecheck and scoped diff-check passed after repair; the detector was not rerun. Actual browser confirmation belongs to the lead.
