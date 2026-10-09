# Account dialog — scoped review, 9 October 2026

Root: `C:\Users\dmitrii\Documents\solana`. Surface: Account dialog only. Reviewer owns this document; the lead owns implementation, shared browser, checks and top-level checkpoints. Backend, dependencies, Git, signing logic, archived evidence and other screens are outside this review.

## Evidence and method

- Direct owner screenshot opened: `C:/Users/dmitrii/AppData/Local/Temp/codex-clipboard-cd337423-918a-4fc0-8cec-d8e0499b4aee.png`, 1908×930. This new feedback supersedes earlier UI shipping dispositions for this surface.
- Pre-change source inspected: `apps/web/src/App.tsx:258–270`, shared `Overlay` in `components.tsx:42–47`, account/dialog rules in `styles.css`, `operations-design.css` and `workspace-shell.css`.
- Current `AGENTS.md`, START, state, PRODUCT, DESIGN, brand, frontend brief/plan/readability and latest commits/status consulted. Dirty/shared checkout preserved.
- Actual installed guidance read: Impeccable SKILL/context plus critique, Operate and craft-floor references; ECC2.2.3 frontend-design-direction/frontend-a11y; frontend-design-guidelines with interactions/states/craft-and-polish/Solana patterns; Vercel React and web guidelines; ProofPilot coach routing/plan/review for the narrow plan→review boundary. No new product claims or venture scoring.
- This is isolated visual/source Assessment A for the lead's combined review, not a separate full Impeccable critique command. The reviewer does not open or operate the shared browser. Lead supplies actual rendered images and input evidence for the final assessment. No detector, wallet or runtime result is inferred from reading a skill.
- Fresh primary web reference: [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), accessed 9 October 2026. Relevant checks: semantic actions, visible focus, focus unobscured by persistent regions, bounded content and responsive overflow. Credit: craft guidance draws on [Emil Kowalski](https://emilkowal.ski).

## Initial material findings

| ID | Severity | Evidence | Required result |
| --- | --- | --- | --- |
| AD01 | P1 | At 1908px the 580px one-column dialog stacks six holder rows, wallet copy/action and settings into one tall list. The sixth holder divider directly meets the wallet heading, while settings reads as another list row. `App.tsx:260–268`; generic width in `styles.css:340`. | A wider account-specific desktop layout with distinct holder inspection and wallet work areas; a separate settings footer. Section separation must be structural and visible before hovering. |
| AD02 | P2 | All six holder actions show the same name/“View only”/arrow treatment. Holder6 is visible behind the modal as the inspected portfolio, but no current state appears in the list. `App.tsx:260`. | Show the currently inspected holder by a readable state label plus surface/border treatment and a correct accessible state. It must derive from the inspected portfolio, never from signing authority. |
| AD03 | P2 | Row actions are native buttons with ≥56px height, but transparent full-width rows plus the same arrow vocabulary make holder inspection and bottom actions hard to distinguish. `operations-design.css:55–59`, `workspace-shell.css:74`. | Keep native row buttons and useful hit areas. Give each holder a contained selectable-row affordance, retain a distinct wallet primary action, and give settings an explicitly separate secondary action. No nested button/copy control inside holder buttons. |

Initial disposition: **fix** within Account only. Existing native button targets and native modal semantics are useful and should be retained; the screenshot does not establish a general clickability or touch-size failure.

Pre-capture implementation check: **AD04 / P2** — the first extracted `AccountPicker.tsx` unconditionally said “Connect a wallet…” above both disconnected and connected wallet content. That copy would instruct connection after connection. Use a universally true approval sentence or a state-specific description. Reported to the lead before the batched final capture; this is a narrow copy correction, not evidence of a wallet integration failure.

First rendered implementation, reported by the lead before final review: **AD05 / P1** — at 390px implicit grid-row shrinking allowed the wallet area to overlap holder rows4–6. The lead applied `grid-auto-rows:max-content`/`align-content:start` and mobile `min-height:auto`, and added an explicit last-holder/next-section non-overlap check. Reviewer confirmation awaits the repaired batch; the failed first packet is preserved rather than called a pass. A separate wheel baseline captured before queued wheel paint was a measurement timing problem; it is not independently established as a product defect.

## Narrow direction and protected behavior

Desktop: approximately 900–1040px account dialog with bounded internal columns; holder selection remains the first work area, wallet connection/signing identity the second. Use the existing navy/Manrope/Lucide system. Do not add a presentation, navigation tab, illustration, extra account model or dependency. A quiet surface seam is enough; avoid nesting several decorative cards.

Phone/tablet: reflow to one column at the space required by real EN/RU labels. A bounded main scroll region must keep the header close action and settings footer available, with `min-height:0` through the flex/grid chain. The persistent chrome must leave useful room for the first holder. Test an expanded demo-account region and short viewport, because the owner screenshot shows only six holders without demo signing controls.

Selecting a holder calls the existing `selectHolder` and navigates to its portfolio; it does not connect a wallet or change `mode`, `role` or `activeWallet`. Preserve wallet connect/use/disconnect callbacks, error behavior, generated signing-account disclosure and `busy || unsettled` locks. Preserve read-only archive status and the existing operation submission barriers. A visual “selected” state means “currently inspected,” not “authorized signer.” No wallet signature or financial POST is needed for this task.

## Final evidence required

- Actual account captures at 320/390/768/1440 and the owner's 1908px width, with both EN and RU represented; 2560 if the lead treats the layout as broad rather than account-local.
- Real input evidence for open/close, Tab/Shift+Tab boundary/focus return, Escape, holder change and reopen/current marker, settings transition, content scrolling with header/footer retained, and no document horizontal overflow.
- Rendered states for no compatible wallet, connect error, connected identity/actions and expanded generated accounts where available. Clearly label synthetic UI fixtures and never call them wallet integration or chain proof.
- Source review of holder-vs-signer separation and retained locks; build/typecheck result supplied by the lead. Existing UI tests need not be expanded merely to mirror styling.

## Final disposition

First final packet inspected: `docs/evidence/ui/account-dialog-20261009/qa-results.json`, capture time `2026-10-09T05:54:46.362Z`. Reviewer opened all 19 listed PNGs, including EN/RU320/390/768/1440/1908/2560, four scrolled phone wallet states, 16-holder stress and empty-registry fixture. Lead's packet records 90 checks passed and no browser errors; these counts are reported lead execution, not reviewer-run browser tests. Synthetic 16/empty data came only from routed client GETs and is not on-chain evidence.

**AD06 / P1 / fix:** `account-ru-768.png` shows holder addresses below their own row border, in inter-row gaps; the selected sixth address is clipped. `account-fixture16-1440.png` reproduces the defect with two-line long labels and a clipped selected16 address. The holder list remains a grid with shrinkable implicit rows. Preserve72px minimum targets while sizing each row to its intrinsic content (`grid-auto-rows:max-content` or equivalent), then confirm these affected images and a phone sanity render. Rectangles fitting the dialog and section-level non-overlap tests did not detect this row-content failure.

AD01–AD05 were visually resolved within their actual scope in the first final packet: desktop width/grouping, selected holder, distinct actions/footer, truthful wallet copy and phone section separation. **First-packet disposition: fix for AD06.** This finding prompted only the second bounded source repair/confirmation below.

## Confirmed final result

**Ship in the captured Account UI scope.** No remaining material finding in this surface's supplied final evidence. This supersedes the first-packet fix disposition, not the owner feedback or broader product gates.

The lead added `grid-auto-rows:max-content` to `.account-holder-list`. Reviewer then reopened every one of the 18 updated affected PNGs; the unchanged empty390 image had already been reviewed. RU768 and desktop 16-holder long-label fixtures now keep names and addresses inside their own row borders, including selected6/16. A partially visible first row at the local list's scroll edge is normal viewport clipping; its content no longer escapes its own button. Phone holder/wallet separation and persistent header/footer remain intact.

| Finding | Final status | Confirming evidence |
| --- | --- | --- |
| AD01 / P1 | Resolved | EN/RU1440/1908/2560 show a 1000px two-area dialog and a distinct footer. Phone320/390 reflow uses one bounded body. |
| AD02 / P2 | Resolved | Selected6 is visibly marked; selected16 is visible in the locally scrolled desktop fixture. Source uses the same validated viewed-holder→active-wallet→first-holder fallback as the portfolio. |
| AD03 / P2 | Resolved | Contained row buttons, explicit View/Selected labels, separate wallet action area and outlined settings/close footer controls. |
| AD04 / P2 | Resolved | Wallet description now universally says to approve each operation in the wallet. |
| AD05 / P1 | Resolved | Final390/320 wallet-scrolled renders show a clear seam after the last holder; the wallet section does not overlap holder rows. |
| AD06 / P1 | Resolved | Updated `account-ru-768.png` and `account-fixture16-1440.png` keep wrapped identity/address content inside their own buttons. |

Final verification packet: `repair-results.json`, captured `2026-10-09T05:59:43.432Z`, records 30/30 checks passed: 28 row-content/viewport checks and actual page-keyboard Tab/Shift+Tab checks, with no browser errors. The earlier 90-check packet supplies selection/navigation/settings/close/Escape/focus-return/native-closed-hidden/background-scroll evidence. These are lead-run checks, independently read by the reviewer; they are not 120 distinct unit tests or reviewer-operated browser sessions. The lead reported final build and six existing permission/wallet-deadline tests passed. The single mechanical detector reported zero primary findings and two 19/20px type advisories; it is not visual acceptance.

All four current source SHA256 values independently matched the updated `qa-results.json` manifest. Final account CSS: `9b057335f8f1d8ec7e8774478b83f07b2f5b2c79aa0c8dda16d7ebfa3b61ec4c`. Source review confirms native dialog semantics and optional account-only class, read-only holder selection, original connect/use/disconnect callbacks, generated-account disclosure and pending locks remain. AccountPicker scrolling is local UI behavior; it performs no wallet or financial operation.

Limits: current captured wallet state is “no compatible wallet detected.” Connected-wallet, connect-error and expanded generated-account states were not newly rendered here; preserved callbacks are source evidence only. Real extension handshake, signing, screen-reader output, live backend/chain correctness and owner acceptance are unverified by this review. The16/empty fixtures establish layout behavior only. Two bounded source repair batches are complete; no further polishing loop is required without new factual feedback.

Continuation rule: before substantial work, read AGENTS and select/read actually installed suitable skills and required references; preserve this account-only ownership and the lead's bounded inspection/repair budget.
