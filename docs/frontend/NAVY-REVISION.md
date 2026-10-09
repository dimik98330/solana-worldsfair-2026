# Frontend revision — 8 October 2026

## Scope and owner direction

Workspace: `C:\Users\dmitrii\Documents\solana`. The owner rejected the white UI, confusing form/date interactions and noisy hierarchy, then provided live PC feedback about compressed screens, repeated checkmarks, double input outlines and the brand. This revision supersedes the previous light direction and narrow issuer layout; prior screenshots remain historical evidence, not owner acceptance.

Implemented: dark navy surfaces; full available desktop width; two-column issue terms from960px; original path-drawn BondTrace wordmark; one control-edge focus stroke; numbered workflow stages; textual paid states; responsive entitlement rows; three-stage issuer form; individual touched-field validation; month calendar with direct24-hour editing and Save/Cancel. Exact arithmetic, immutable transaction review, signer authority and unresolved-operation locks are retained. No chain writes were performed for this UI verification.

## Skills and tools actually used

Impeccable context/craft-floor/new-work/operate, UI UX Pro Max search, frontend-design-guidelines, applicable Vercel React rules and current web-design-guidelines. ProofPilot coach bounds product choices to a UI plan → implementation → review; no venture discovery or new backend assessment. OpenAI Docs and skill-installer guided the missing project-local shadcn installation. The already-installed Anthropic frontend alternative remains available; Impeccable leads this design.

Official shadcn skill installed from `shadcn-ui/ui:skills/shadcn` into `.agents/skills/shadcn`. CLI4.21.4 confirmed Vite and no components.json. We retain the existing React/native/CSS foundation rather than introducing a second component framework. `.codex/config.toml` configures a project-local stdio server through the tested Windows cmd/npx command. Actual initialize, seven-tool listing and `get_audit_checklist` call passed; evidence `.local/shadcn-mcp-verification.json`. Host discovery in the current chat is not claimed; the saved config is for the next host reload. No global permission/config changes or paid service.

Official sources accessed8October2026:

- [shadcn skill](https://ui.shadcn.com/docs/skills), [MCP setup](https://ui.shadcn.com/docs/mcp): install/configuration context.
- [Calendar](https://ui.shadcn.com/docs/components/base/calendar): actual browser visual inspection of month/year navigation, day grid and clear selection; adapted to the existing DayPicker primitive.
- [Field](https://ui.shadcn.com/docs/components/base/field): visible labels, helper/error association, separate invalid states.
- [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md): current focused review guidance.
- [Codex project MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli): project-scoped transport instead of global changes.

Earlier Mercury/Ramp/Linear reference evidence remains in REFERENCES.md. Latest navy direction comes from the owner, not those products. Paid Mobbin collections and decorative animation libraries were not needed or claimed inspected. No third-party product logo copied.

## Verification

- Final `npm run build` passed; final client bundle `index-Z7LHUy2B.js` at cutoff after the review's redundant-overview-label fix. `npm run test:ui`:32 passed,0 failed/skipped, including exact amounts, schedule bounds, three timezones/DST and wallet deadline behavior.
- Scoped `git diff --check` passed. Impeccable detector returned `[]` once over the completed initial navy UI; not re-run as a polishing loop after owner feedback.
- Built origin `http://localhost:3000` exercised in IAB and Chrome, using actual existing localnet read state. Original API/validator process was not restarted; original ledger/signers and previous evidence preserved.
- Form entry retained values across steps; errors appeared after blur/progression and cleared on edits. Calendar invalid hour99 stayed neutral while typing, showed an explicit error on Save, and Cancel retained its old value. Escape returned focus to the trigger. Review showed exact1000 principal +25 coupon =1025 reserve per bond.
- First-error focus corrected from rAF timing to an explicit post-commit layout effect. IAB, Chrome Enter, and ordinary CDP mouse press/release focused the invalid input. The Chrome semantic locator click sometimes restored focus to its target button; this automation quirk is recorded in `.local/navy-focus-verification.json`, not represented as an app failure or a successful check.
- Tested desktop1440, phone390 and actual PC2560×1305. Native final main width2328px, issuer form2232px; full desktop capture `native-wide-terms.png`. Input computed focus:1px, offset−1px, no shadow. Phone page width matched390px; entitlement amount/status are visible without horizontal scrolling.
- Initial IAB emulated large captures were clipped/tiled by the capture surface. The reviewer required recapture; replacement Chrome captures were opened and checked. Those malformed files were replaced, and no approval relies on them.

Current screenshot set: `.impeccable/review/navy/desktop-terms.png`, `desktop-calendar.png`, `desktop-review.png`, `mobile-terms.png`, `mobile-calendar.png`, `mobile-review.png`, `mobile-errors.png`, `mobile-payments.png`, `native-wide-terms.png`, `native-wide-overview.png`. Calendar files are viewport captures; other named current files show the full document. Earlier `user-1143-terms`, `desktop-overview`, `desktop-payments` are historical and excluded from the last owner-correction review.

## Boundaries

Independent result: `docs/research/frontend-navy-finish-review.md`. DESIGN.md and `.impeccable/design.json` record final actual tokens; brand.md points to that system. A reviewer disposition is bounded UI evidence, not the owner's design approval, production/security certification or competition score.

Human wallet approval/cancellation and a new transaction cycle were not repeated for these visual changes. No final external submission, hosting deployment, private repository publication, mainnet, real funds or paid services. Additional backend/program changes appeared in the shared worktree during this task; they were not authored, reverted or certified by this frontend pass. Final Git status therefore includes work outside this revision.
