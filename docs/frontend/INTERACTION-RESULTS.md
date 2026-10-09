# Voting and shared interaction correction — 9 October 2026

Owner feedback: Voting is hard to read, icons are weak, static text and clickable controls are indistinguishable, and the workflow is unclear. The supplied screenshot supersedes prior surface acceptance. This pass remains frontend-only; original proposal text, exact vote weight, signing authority, pending locks, receipts, recovery and backend ownership remain binding.

ProofPilot coach: scoped plan → implementation → independent qualitative review. Impeccable Operate/clarify/craft-floor and ECC frontend-design-direction/make-interfaces-feel-better/frontend-a11y guided the work, with existing frontend/React/web and number-formatting guidance. Playwright Interactive instructions were reused; the direct js_repl tool was unavailable, so persistent CUA input plus bundled Playwright provided the render/input fallback. No skill reinstall, dependency/config change, backend work, Git write or real wallet operation.

## Implemented

- Voting now separates exact results, deadline/rights context and the available action. Closed proposals explain that voting ended and offer vote history; open cases provide existing account selection, refresh or review-for/against actions with the actual permission/recovery reason. No quorum, approved/rejected outcome, translated original proposal subject or new voting contract is invented.
- Working text is17px, section labels16–18px, subject26px/24phone, normal vote totals32px/30phone. Very large exact weights use24px/20phone with a bounded one-line local scroll area and full raw value in title/ARIA; no rounding, float conversion, abbreviation or separated commas.
- Shared commands have explicit boundaries. Quiet/ghost actions remain contained; holder names are underlined native links. Sidebar links and holder links preserve URL issue/query context, normal SPA navigation and browser Ctrl-click/new-tab behavior through WorkspaceLink. Buttons remain actions and dialogs; static facts remain ordinary text.
- Navigation/action icons use larger Lucide strokes; desktop settings and refresh have text labels, while compact toolbar controls keep accessible names and40×44 targets. The static issue icon is unframed so it does not pretend to be a control. Copy controls and disclosures have visible boundaries.
- Registry records reflow below900px with wrapped labels,16px gaps/padding and native holder targets at least40px high. Phone portfolio selector and transfer action stack. Payment history has the short contextual History/История label.

## Ownership and source

Lead: App/main/shared interaction-controls/WorkspaceLink/PaymentTable/PaymentsWorkspace/HolderPortfolio, integration, docs. Voting worker: VotingWorkspace/new voting-page.css and VOTING-REBUILD-NOTES. Fresh critic: INTERACTION-REVIEW only. Shared legacy voting-workspace.css (portfolio/settings/receipts) remains unchanged. A preflight legacy `.vote-results` collision was removed by using the unique `vote-tallies` container.

## Evidence and limits

Root: `C:\Users\dmitrii\Documents\solana\docs\evidence\ui\interaction-20261009\`. Initial56PNGs/241checks had239passes and two real overflow failures (Payments320 and Registry768); `qa-results.json` preserves that historical result. The consolidated correction has45passing checks in `repair-results.json`; native-link floor confirmation has5passing checks in `touch-results.json`. Completing the already-open large-number containment correction adds8passing checks in `number-confirmation.json`, including child bounds inside the card (page-width-only measurement had missed it). Final source hashes are the nine entries in that last file. Prior manifests remain source-cutoff-specific.

Current captures cover all six sections at320/390/768/1440/2560, Voting EN390/1440/2560 and owner1920×945, protected details/history/account/settings and issuer creation. Client-only fixtures cover open/no-account/eligible/no-rights/already-voted/unknown/offline/archive/empty, long subject and exact u64 weight. Fixture files are explicitly named; they are not chain proof or real extra participants.

Normal inputs verified native holder/sidebar navigation, Ctrl-click new tab, view-only authority, history filter, details/Escape/focus, phone menu, search recovery, existing account selection and read-only refresh. The one intercepted cast-vote preparation intent named the expected proposal and yes choice; all non-GET API requests were blocked, with no submit/demo-execution, wallet connection, signature or financial write. Backend/RPC correctness is not evaluated by these UI fixtures.

Actual headed native window was limited by this host to outer1940×1100/content1940×1013 even after explicit2560 request; `voting-native-1940.png` and `native-window.json` state its actual dimensions. CSS viewport2560 is verified for all six sections. Physical native2560 is not claimed; no display-resolution or other system setting was changed. The initially misnamed native file was corrected rather than presented as2560 evidence.

`build:web` and52existing UI tests passed. One manual integrated detector had0primary/4type-ramp advisories at its inspected cutoff; no repeated detector or clean-advisory claim. Review addresses the named material findings and caused regressions in bounded passes; the final IR09 closure adds only local containment within the existing correction, not another redesign/audit. Final disposition is recorded in INTERACTION-REVIEW. Owner acceptance, real signing/error/provider behavior, screen-reader certification and production/contest readiness remain unverified by this pass.
