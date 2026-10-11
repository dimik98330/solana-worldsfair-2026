# Redesign QA — 8 October 2026

## Voting and shared interaction revision — 9 October 2026

Current scope and exact checks: [INTERACTION-RESULTS.md](https://github.com/dimik98330/solana-worldsfair-2026/blob/9b64a52b7ea98a5bd8bb9f81dbfc611d08aa3a4b/docs/frontend/INTERACTION-RESULTS.md), fresh [INTERACTION-REVIEW.md](https://github.com/dimik98330/solana-worldsfair-2026/blob/9b64a52b7ea98a5bd8bb9f81dbfc611d08aa3a4b/docs/frontend/INTERACTION-REVIEW.md). Owner's Voting screenshot superseded prior surface acceptance. Changes cover explicit voting states/actions, readable results/context, inspect dialog, shared contained commands, native underlined holder/sidebar navigation, toolbar labels/icons and responsive registry/portfolio controls. Original proposal wording, precise weights, voting/signer locks and API semantics remain binding.

Evidence root `C:\Users\dmitrii\Documents\solana\docs\evidence\ui\interaction-20261009\`:58actual final PNGs. Initial56renders/241checks retained239pass and two actual overflow failures; the corrected snapshots do not rewrite that historical result. Separate confirmations45/45,5/5 and8/8 passed, zero page errors. Final nine source hashes in number-confirmation.json independently match. Reviewer ships all six sections at inspected UI scope; IR01–12 closed. Cases include all sections320/390/768/1440/2560, Voting EN and owner's1920, dialogs/navigation/new-tab/search plus clearly marked browser-only fixtures for voting rights/status/unknown/large exact weights. One intercepted unsigned prepare intent was blocked; no financial writes, wallet calls or live-chain result is established.

At320 the extreme u64 weight remains one unbroken exact value in a bounded horizontal wrapper, with full raw title/ARIA and keyboard focus. Its284px text may exceed the262px visible wrapper; simultaneous visibility of every digit or actual scroll-input testing is not claimed. Page and local card-child containment were explicitly checked. Native window was honestly limited to1940×1100/content1940×1013;2560logical viewport is verified, physical native2560 remains unverified. No display setting was altered.

Build:web and52existing UI tests passed. One detector0primary/4type advisories was recorded at its integrated inspected cutoff; no repeated/clean detector or accessibility certificate. Actual DESIGN/sidecar/brand were synchronized. New prototype images remain archived read-only data or labelled UI fixtures; they are not fresh chain proof, production, contest readiness or final owner acceptance.

## Account dialog correction — 9 October 2026

Direct owner screenshot rejected the narrow580px account dialog and blended bottom controls. The account surface is now1000px on desktop, with distinct holder/wallet areas, explicit row actions/current state and a persistent settings/Close footer. Mobile uses one correctly bounded scrolling body. Scope: App account composition, optional Overlay className, new AccountPicker/account-picker.css only; backend/Git/dependencies/signing behavior untouched.

Evidence: `C:\Users\dmitrii\Documents\solana\docs\evidence\ui\account-dialog-20261009\`.19actual final PNGs cover EN/RU320×700,390×844,768×1000,1440×1000, owner's1908×930 and2560×1440; phone wallet after scroll; synthetic16-holder/long-label/short-height fixture and empty registry. `qa-results.json`90checks and `repair-results.json`30checks passed, zero page errors; final4/4source hashes match. Normal input covered holder2 navigation/view-only status, selected6, settings handoff, Close, Escape/focus return, closed-dialog hiding and unrelated receipt overlay. Native Tab/Shift+Tab were checked after correcting the harness's locator-focus behavior. No real wallet connect/signing/error or expanded-demo state is claimed.

Two bounded source repair batches resolved actual mobile section overlap and tablet/long-label row-height overflow; row identity/address bounds are now explicitly measured. A queued-wheel baseline and automated topbar scrollIntoView were harness measurement issues; final stationary-background test uses the visible portfolio account trigger, with settled scroll. Initial reports are preserved ignored in `.local/account-dialog-qa-first.json`/`account-dialog-qa-second.json`. Synthetic fixtures are client-only routed GET responses; they are not16on-chain holders or new financial evidence. All financial POSTs were blocked during tests.

`build:web` passed;6 existing holder-authority/wallet-deadline tests passed. One mechanical detector run:0primary/2advisory for the deliberate19/20px section-heading variants now documented in DESIGN. No repeated detector/no clean-advisory claim. Fresh [ACCOUNT-DIALOG-REVIEW.md](https://github.com/dimik98330/solana-worldsfair-2026/blob/9b64a52b7ea98a5bd8bb9f81dbfc611d08aa3a4b/docs/frontend/ACCOUNT-DIALOG-REVIEW.md) reports ship at inspected Account UI scope, AD01–AD06 resolved. Prior global60PNG review is historical for its source; this correction does not establish live-chain correctness, screen-reader certification or final owner acceptance.

## Current ECC replacement evidence

Current implementation is Settlement Workspace. Evidence root: `C:\Users\dmitrii\Documents\solana\docs\evidence\ui\ecc-redesign-20261008\`. Earlier QA below applies to its own historical source versions; prior `ship` did not establish acceptance of the owner-rejected design.

`qa-results.json`: 30 viewport renders (six sections at320/390/768/1440/2560), all without horizontal document overflow, 53 normal-input checks passed, zero page errors. `repair-results.json`: one coordinated CSS repair for portfolio identity at1440 and bounded voting results at2560, recaptured both screens at all five sizes and the exact selected-holder frame; 15 checks passed, zero page errors. `touch-repair-results.json`: second targeted repair keeps settings/refresh40×44 at320; all six sections in EN/RU,12 checks passed, no overflow or page errors. Additional phone evidence covers invalid creation with focus on the first error, exact review/top/footer, account and receipts. The QA runner initially used an ambiguous View only locator and failed to reopen New issue after reload; selectors were corrected and the complete final pass succeeded. These harness errors are not recorded as product failures.

Actual functional checks: coupon625/principal25,000; name/address and status search with no-match/clear; registry→view-only portfolio and holder switch; exact archived network/capture timestamp; UTC display preference retaining canonical time; untouched creation without red errors; invalid progression focus;1000.000001+25.000001=1025.000002; persisted draft reopened after reload; completed-stage return; calendar Save/Cancel/Escape and320 fit; unavailable API preserving Payments/recovery without first-run onboarding; phone account/receipt dialogs and Escape focus return. All financial POST requests were blocked in the render test context, and archived signing remained disabled.

Native window is separately verified in `native-window.json`/`payments-native-2560.png`: headed Chromium outer2560×1440, CSS content2560×1353, DPR1, document2560; holder x357 and amount x992.33 keep the register's scalar scan bounded. The temporary test window was positioned off screen and closed. Browser matrix uses CSS viewport screenshots, not full-page stitched form captures. CUA's persistent in-app browser was also used for real navigation, payment toggling, measured phone toolbar and screenshots. The direct js_repl tool was unavailable; bundled Playwright performed the reproducible render/input fallback without adding dependencies or changing feature flags.

Phone390 first payment row starts699.33; identity, exact200 and Paid are visible in844px height, detail action follows below. At320 the page remains320px; no claim that an entire long record fits in one viewport. Reviewer assesses that distinction from actual screenshots.

One Impeccable detector run:0primary/59advisory (old DESIGN type/color/radius vocabulary); implemented DESIGN/sidecar/brand were synchronized to actual source. No second detector or clean-advisory claim. This is not visual acceptance. Independent report: [ECC-FINISH-REVIEW.md](https://github.com/dimik98330/solana-worldsfair-2026/blob/9b64a52b7ea98a5bd8bb9f81dbfc611d08aa3a4b/docs/frontend/ECC-FINISH-REVIEW.md); final disposition recorded there. Delivery includes60actual UI PNGs and one clearly illustrative generated concept. Final18/18source hashes match. Review/deployment scope is local UI against saved localnet evidence; live chain, wallet signatures, production data, accessibility certification and final owner acceptance are not established by these checks.

Active matrix: overview, issuer terms/schedule/review and servicing; registry positions/rights; payments coupon/principal and detail; portfolio holder selection; voting; account, interface settings, network details, receipt filters/history; calendar Save/Cancel/Escape; initial/empty/error states.

Required viewports: 320, 390×844, 768, 1440, 2560; narrow reflow and long content. Check top/middle/bottom, mobile menu, label/focus/keyboard, resource errors, exact amounts/seconds/timezone, form persistence and read-only holder versus signer.

Off-happy-path checks: API unavailable while Payments selected; invalid form progression retains inputs; calendar cancel retains timestamp; missing wallet never enables financial operations.

Baseline paths: `docs/evidence/ui/redesign-20261008/before/`. Final evidence and concrete pass/fail results will be appended after implementation.

Browser: official Playwright Interactive instructions read from `.agents/skills/playwright-interactive/SKILL.md`, persistent `mcp__node_repl` with bundled Playwright through Node createRequire. The initial ESM import failed; CommonJS package loading succeeded. Browser opened site, interacted with navigation, captured and emitted screenshots. Connected Chrome fallback was checked then closed; the two sessions are not mixed.

Runtime limitation: WSL Ubuntu cannot mount its configured ext4.vhdx (ERROR_FILE_NOT_FOUND). Existing ledgers/keys preserved. Saved `docs/evidence/execution-lifecycle-localnet.json` state is used only inside isolated browser API interception for populated-screen UI QA; it is a historical localnet snapshot, not current chain verification. No financial submission is sent.

Skill installation: skill-installer attempted curated frontend-skill and received Skill path not found. Current curated listing contains playwright-interactive; installed locally into `.agents/skills/`. It is read directly; no claim of automatic discovery in this existing host session. Published OpenAI frontend instructions replace frontend-skill.

## Final observed results

The product remains a working React/Vite financial UI with six sections. All six were loaded at 320,390,768,1440 and2560 CSS pixels. Final document width equals viewport width in every checked combination; see `docs/evidence/ui/redesign-20261008/viewport-checks.json`. A separate headed Chromium window used outer2560×1440, actual content2544×1345, screen2560; its document width was2544. A720px reflow check is an additional narrow layout check, not a claim of testing physical200% browser zoom.

Both English and Russian payment screens were inspected. On390×844 the toolbar stays in one row, and the complete first recipient is at y625.875–843.8125. EN/RU targets40×40; settings/refresh40×44. Body17px, desktop payment18px, actual numeric font IBM Plex Mono. Date and time are separate stable lines, with seconds and one timezone note. Native2560 creation main2320px/form2224px: former width caps are absent.

### Functional coverage

| Area | Observed check |
| --- | --- |
| Navigation | All6 sections loaded; phone menu opened, section selected, menu closed; URL selects view/payment/holder. |
| Payments | Principal25,000/25,000/0; Coupon1 1,250/1,250/0; Coupon2 625/625/0. Selection uses existing recorded snapshots. |
| Detail | Holder1 coupon8×25=200; exact dates shown; historical preview truthfully reports matching transaction unavailable and offers issue receipts. No live RPC claim. |
| Portfolio | Holder selection changes inspection; Transfer bonds remains disabled without its signer. Current balances and historical rights stay distinct. |
| Voting | Closed result10 for/5 against/10 not cast, total25,2 voting accounts; deadline and snapshot disclosure inspected. No ballot submitted. |
| Receipts | Coupon filter showed7 actual saved items; drawer/filter/disclosures inspected. |
| Creation | Terms→Schedule→Review with real input; empty progression gives2 inline errors and focuses first field. Exact1000.000001+25.000001=1025.000002. Reopening after reload retains step and inputs. No issue submitted. |
| Calendar | Cancel retains value; Save updates selected time; Escape returns trigger focus.320/390/1440 dialogs inspected; seconds are retained (08:37:00 in exercised change). |
| Preferences | EN/RU switching; timezone changed toUTC and display changed, canonical time values unchanged; restored/default contexts use browser zone. |
| Connection failure | RealAPI3000 returns503 RPC_UNAVAILABLE; selectedPayments stays visible. Separate browser fixture→actual503 check retains6 rows and shows0 first-run onboarding. |
| Read-only preview | State identifies source/capture time; generated signing accounts hidden, issuer transaction control disabled. POST/actions/prepare returns403 SNAPSHOT_READ_ONLY. |
| Keyboard/accessibility | Visible3px button focus, single merged field edge, Escape return; checked payment screen has0 unnamed buttons/0 unlabelled inputs. Browser zoom remains allowed. |
| Long content | Explicit layout-only fixture with64-character issue label/long holder name at320: document width320. Financial data not changed. |

The interaction session also explored repeated menu/section switching, coupon changes, disclosures, form back/next, calendar cancellation and error recovery. No page exceptions or console errors were observed on the final populated read-only payment/detail/settings/account/receipt checks; expected real503 and test403 responses are documented rather than called load failures.

### Visual and engineering checks

- `npm run build`, `npm run typecheck`, `npm run build:web`: pass at final source. A transient root typecheck failure in an independently changing `tests/client/chain-view.test.ts:79` was observed earlier; later root check passed without this frontend task editing that file.
- `npm run test:ui`:52 passed,0 failed,0 skipped. Includes exact amounts, dates/timezone, draft recovery, receipt matching and view-only holder regression coverage.
- `node --check scripts/preview-ui.mjs` and scoped `git diff --check`: pass. Git's CRLF normalization notices are informational.
- Main JavaScript389.65kB/gzip119.49; lazy issuer/calendar146.83kB/gzip41.76. Existing dependencies retained; no product dependency install.
- Measured contrast: foreground/panel14.55:1, muted/panel8.44:1, white/blueaction4.53:1, link/canvas9.73:1, fieldborder/inset3.98:1. Focus and semantic state colors remain visible.
- Impeccable detector over lead targets:0 primary findings,33 advisory token/ramp items against the preceding DESIGN snapshot. Payment worker ran one earlier scoped check (3 advisory size items, corrected). No repeated detector tuning or detector-as-acceptance claim. Final DESIGN/sidecar were extracted separately from source.
- Independent full review's final narrow repairs:641–1600 Payment table reserves160px for its action, with the remaining width36/20/24/20%; last cell padding12px. At720 the Details button right640.70 is inside its cell right696. Calendar now overrides the native dialog cap:320px viewport gives304px dialog and40×44px day controls. Affected720/768/1440 table and320/390/1440 calendar captures were refreshed; no new business semantics.
- Full-page form captures repeatedly contained stale compositor/skip-link offsets even when DOM scroll/focus readings were correct. Those files were replaced with normal viewport captures after actual scrolling and300ms paint settlement; top/middle/bottom views cover long forms. No full-page form capture is claimed valid. Actual skip access remains intact.

## Evidence and assets

Final49 PNGs: `C:\Users\dmitrii\Documents\solana\docs\evidence\ui\redesign-20261008\final\`; hashes in sibling `screenshots.json`. Names include all6 sections1440/390; overview/payments320/768/2560; registry320; creation/schedule/review1440/390 and their bottom/middle viewport sections; calendar1440/390/320; creation2560; settings/account/detail/receipts; actual error1440/390; Russian phone; headed native; reflow and explicitly synthetic long-content check. Images were opened/emitted for visual inspection; the fresh independent reviewer reviews the frozen final set in `docs/frontend/REDESIGN-FINISH-REVIEW.md`.

Original project wordmark: `apps/web/public/brand/bondtrace-lettering.svg`; derived compact/favicon: `bondtrace-compact.svg`. SVG lettering has no font dependency. Fontsource's bundled Manrope/IBM Plex Mono OFL licenses and Lucide ISC/MIT package notices are retained. Fonts are locally served with swap; Cyrillic UI actually rendered. Kazakh is not an implemented interface locale; complete Kazakh glyph coverage is not claimed (fontTools inspection was unavailable). No third-party reference imagery is shipped, and no raster generation was needed.

## Launch and remaining limits

Final independent disposition: **ship at reviewed UI scope**. Reviewer opened all49 images, verified49/49 SHA-256 and confirmed F01–F05 resolved; latest six affected captures reviewed again. This is neither owner acceptance nor live-chain certification. Compact viewport copies for delivery are in `docs/evidence/ui/redesign-20261008/delivery/`; the frozen review manifest and49-file set remain unchanged.

`npm run build:web` then `npm run preview:ui` → http://127.0.0.1:4180, saved localnet data, read-only. Normal app/API: http://127.0.0.1:3000; development5173 proxies this API. No hosting or production change.

Ubuntu's configured ext4.vhdx is missing (`Wsl/Service/CreateInstance/MountDisk/HCS/ERROR_FILE_NOT_FOUND`); a live ledger/RPC restart cannot be verified. The existing ledgers/signers/historical evidence were preserved. Actual new chain writes, human-wallet authorization/cancel/signature recovery, mobile OS keyboard and physical200% browser zoom are not newly verified. Existing regression tests and historical chain proof keep their own scope; saved UI preview does not replace a live chain test.

## 10 October2026 — scoped v4 functional UI verification

Actual built app at http://127.0.0.1:3190 against preserved localnet genesis ECUp236cnJYsd7ZvngFPME4fvGoT5WkGemD2WU48t4kU, instrument CxUQ7fA3GShnTuiYPBg9RPh4ieZZ332Nevh5PzqatL8t. This is an actual RPC cohort with generated signers, not preview:ui or a human-wallet proof. UI source matches the owned v4 change; main.tsx/four other-chat CSS files remain excluded. Fresh UI90/90, web/general TypeScript and Vite build passed in the frozen source; independent GitHub source4e5dafa also passed all checks.

Real browser input confirmed: issuer Paged operations shows34 holders/9terms and incomplete capture; New issue restores its saved draft; ONE Add coupon click changes8→9 after the blur/layout correction; annual10%/frequency2/nominal1000 calculation fills all9 amounts with50; Fill example changes dates using observed chain time; EN/RU both retain exact values. No issue transaction was submitted in this form check. Actual Payments displays historical10/5/3 and primary500 while transfers changed current ownership. Searching New holder after record shows1of34, historical units0/amount0 and Нет начисления, rather than paid/unclaimed. Financial driver retains its independent late500 claim and principal burn sequence.

Reviewed normal-viewport screenshots at320/390/768/1440/2560 under ignored C:\Users\dmitrii\Documents\solana\.local\critic-fixes\ui-qa, filenames v4-form-*-ru.png, v4-nine-coupons-390[-ru].png, v4-coupon-nine-bottom-390-ru.png, v4-payments-live-*-ru.png and v4-no-historical-entitlement-320-ru.png. Phone payment record is visible in first viewport. At768 the financial table uses internal horizontal overflow to reach its right-side Details controls; no claim of all columns fitting simultaneously. At320 long Russian schedule-step/date text is crowded/wrapped; no broader CSS redesign or physical-device certification is claimed. Each image was viewed/emitted, not accepted from a test counter. Preserve previous frozen gallery.

Browser AX input/screenshots worked. One Playwright locator evaluateAll call timed out in the browser bridge; fallback used fresh AX state and native input, then actually confirmed9×50 and the Russian state. Diff-only AX omitted unchanged rows in a viewport loop; its false diagnostic flags were not treated as missing coupons. Full AX afterward confirmedCoupon9/9of16. Temporary viewport must be reset at finish. Ordinary Phantom signing remains unverified; no extension/profile/security bypass was used.

Final prepared launcher verification: exact source4e5dafa/7f822f3, API3200/RPC8999, new genesisFufYwudH3kBwAwCAqrL7vmCFsNHLgJ9kVTphrps8axeG, issue7QG8hMCSA7h6vk5emYTrxKd54aQ37w5krcNsBojTfqwc. One command exit0 in641.08s after separately verified24.01s web build/known SBF.37signatures independently freshly finalized;1800coupon/18000principal/18burn, zero supply/vault/obligations. Actual browser navigation selectedRU, coupon900/900/0 withprimary500 andprincipal18000/18000/0 withprimary10000. New four-holder table fits1440; header retains actuallocalnet context. Product tabmarked deliverable, temporaryviewportRESET. Compact public screenshots: [coupon](evidence/ui/servicing-v4-20261010/coupon-1440-ru.png), [principal](evidence/ui/servicing-v4-20261010/principal-1440-ru.png), [rate form](evidence/ui/servicing-v4-20261010/rate-form-390-ru.png), [no historic rights](evidence/ui/servicing-v4-20261010/zero-historical-320-ru.png). This does not establish ordinary Phantom. Generated test keys and earlier galleries remain ignored/preserved.

## 11 October 2026 — frontend quality pass (owner-requested full redo)

Owner requested a complete frontend redo (texts/icons/buttons/logic), dark Settlement Workspace kept, full depth, logic/signing/recovery untouched. Browser QA now available locally: installed `playwright` (dev dep) + Chromium; captured the read-only `preview:ui` snapshot (port 4180, saved localnet data) with headless Chromium. QA scripts and PNGs live under ignored `.local/qa/`.

Root cause of the rejected look identified and fixed: `main.tsx` was loading a second, half-migrated token/base/ui-system CSS layer *on top of* the canonical sheets, which regressed readability (headings 26px, buttons 44px/15px) and duplicated `.button`/`.nav-item`/`.badge` with conflicting values. Removed those three imports (`tokens.css`/`base.css`/`ui-system.css`; the new `shell.css` was never imported). The app now renders on the canonical DESIGN-contract sheets: headings 34px, body 17px, buttons 48px/16px/650. Files kept on disk (unused), not deleted.

Verified fixes (screenshots reviewed, EN+RU): raw `settle_coupon` in Overview recent operations → "Coupon payment/Купонная выплата" (missing key in `JudgeOverview` activity map); orphan timezone label "Qyzylorda" → "Time zone: Qyzylorda / Часовой пояс: Кызылорда" with clock icon; active nav item "Holder registry" no longer wraps/truncates (reduced to 16px, nowrap label, fixed chevron).

Reviewed with real headless-browser screenshots at 320/390/1440, EN and RU, across all six views (overview, registry, payments, portfolio, voting, issuer) plus the account dialog, network dialog, receipts drawer and the 3-step New-issue wizard. No horizontal overflow at 320; mobile table→card transforms clean; RU fully localized (nav, labels, dates with seconds, "Расчётные единицы"). `build:web` ✅, `typecheck` ✅, `test:ui` 90/90 ✅. Snapshot stays labelled "Saved snapshot/Архивный снимок", read-only; no live-chain, mainnet, funds or signing claims. Playwright is a local dev-only QA tool, not an app dependency.

## 11 October 2026 — financial-terminal rollout (owner-chosen direction)

After the owner rejected the soft-card look as generic, they chose a financial-terminal aesthetic. Rebuilt Overview as a sample (approved), then rolled the language across all six screens via a global `apps/web/src/terminal.css` (loaded last) plus per-screen sheets: monospace tabular figures, 2px square corners, uppercase tracked labels, module title bars, square mono status tags, denser grid readouts, clear button hierarchy (solid primary / raised secondary / quiet ghost links). Earlier passes this session also added: shared `tr` i18n helper, App.tsx decomposition (recovery.ts/labels.ts/TransactionReview.tsx), voting proportion bar, portfolio/registry cards, issuer+overview lifecycle stage rails, shortened action labels (Register/Place/Fund/Activate, Vote for/against), nav-wrap fix, removed regressed CSS layer + dead files.

Reviewed with headless-browser screenshots at 1440 and 390, EN and RU, across Overview, Payments, Holder registry, Portfolio, Holder voting, Issuer desk, plus account/network/receipts dialogs and the New-issue wizard. `build:web` ✅, `typecheck` ✅, `test:ui` 90/90 ✅. Dark-navy palette, exact-figure/unknown-not-zero, honest localnet/snapshot labelling and all transaction/signing/recovery semantics unchanged. QA scripts/PNGs under ignored `.local/qa/`. Playwright is a local dev QA tool, not an app dependency.
# Premium frontend replacement — 11 October 2026

Owner requested a complete replacement of the five pictured screens and a local preview. Root workspace: `C:\Users\dmitrii\Documents\solana`. Dark navy identity, original lettering, exact financial values, signing guards, recovery and EN/RU retained. Read-only historical preview at http://127.0.0.1:4180; no financial requests or chain writes.

## Scope and evidence

- Replaced terminal override with shared `premium.css`; reorganized issuer identity/results/payment schedule, holder identity/positions/rights, portfolio balance/register/authority disclosure, voting outcome/inspector and settings. Updated overview typography and amount tracks.
- Real Playwright Chromium input and screenshots: six routes at320/390/768/1440/2560. Initial30 captures, one integrated repair round, then targeted corrections for issuer320 and portfolio first record. EN captures at390/1440. Requested viewport2560 was tested headlessly; native full-screen desktop was not verified.
- Files: `.local/qa/premium-20261011/` with `first-pass.json`, `final-layout.json`, `repair-checks.json`, `functional.json`, `final-*.png`, `en-*.png`, settings/calendar/creation/error/receipt/reference screenshots and build/test logs. These local evidence files are ignored, not published.
- Latest targeted320 issuer has document width320; portfolio320/390 has document width equal to viewport. First portfolio record begins at783.8/785.8px respectively within844px viewport. Phone390 first payment recipient begins765.8px; registry first record472.1px. Exact money clipping scan found none after repair. Other final route/width samples have no document overflow.
- Functional checks: holder search/no-result/reset, holder navigation, receipt dialog, UTC preview12:42:45→07:42:45, EN/RU settings, Escape, archive details, native signing-context disclosure, creation terms→schedule→review, and injected read failure→selected route/retry→restored table. Snapshot review explicitly blocks creation/signing. Failure simulation is browser request interception, not a real outage.
- Calendar visually inspected390/1440; initial automated selectors omitted aria-label prefixes and timed out, then were corrected. Existing touched-field errors were inspected; no validation logic changes. Early recovery assertion expected the wrong English heading/stale table; corrected assertion verifies actual Holder registry route and retry without first-run onboarding.
- `npm run build:web` PASS; `npm run test:ui`90pass/0fail/0skip; `git diff --check` PASS (existing CRLF warnings only). No dependency or backend changes in this task.

## Independent review and repairs

Read-only fresh-context reviewer inspected all30 initial captures. Findings: mobile Overview clipped25,000; issuer2560 stretched scalar tracks. Fixed with mobile label/value rows and bounded issuer tracks. Lead additionally fixed malformed registry768 cards, portfolio first-record delay, cramped issuer mobile title, and a320 heading overflow introduced by the compact shared heading. Known defects were repaired, not hidden by page overflow clipping. Owner visual acceptance remains pending.

## Skills and sources

Applied installed design, Impeccable, ProofPilot coach, frontend-design-guidelines, React/web guidance, ECC frontend direction/a11y, UI UX Designer components/dashboard and playwright-interactive. Figma whoami returned UNAUTHORIZED and requested OAuth; no remote design was created. Local alternative: `docs/frontend/premium-reference.html`, clearly marked reference/non-live, with four switchable screens and holder search. The supplied images were treated as incumbent UI evidence, not new instructions.

Reference checks11October2026: [shadcn dashboard](https://ui.shadcn.com/examples/dashboard) for table/action hierarchy and [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) for focus/labels/states/overflow review. No copied branding or financial example data; preview figures come from existing project evidence. No live chain, wallet signing, mainnet, production, owner acceptance or Figma publication claim.

---
# Reference-led UX replacement — 11 October 2026, second revision

The owner rejected the previous premium pass as old-fashioned/unclear. This entry supersedes its design direction, not its historical evidence.

Sources checked11October: actual [Mercury Bill Pay demo](https://demo.mercury.com/bill-pay) rendered and screenshot-reviewed (tabs, scoped filters, quiet row actions); [Linear2026 refresh article](https://linear.app/now/behind-the-latest-design-refresh) read for subdued navigation/borders and consistent headers; [Ramp bill stages](https://support.ramp.com/managing-bills-and-payments-on-bill-pay/) read for workflow grouping. Linear inline image stayed blank/decoding timed out; no image-inspection claim. No external assets/branding/data shipped. Reference record: docs/frontend/premium-reference.html.

Implemented real structural changes: issuer payments/terms switch; precise coupon/principal recipients links and URL-persisted coupon choice; registry rights/positions switch; payments-first portfolio with exact received sum; native account/record-date/vote-weight disclosures; shorter UI copy;40px desktop/44px touch buttons; quieter232px navigation and flat financial records. Full desktop width preserved with bounded scalar tracks.

Evidence directory: `.local/qa/reference-rebuild-20261011/`. Initial30RU screenshots at320/390/768/1440/2560; one scoped repair round and final30 captures, plus12EN captures390/1440. Final document width equals viewport in every sampled route. At390×844 first row starts:issuer630.95px,registry603.56px,payments744.98px,portfolio591.70px. No clipped-money hit in initial automated scan; final screenshots reviewed. Headless viewport2560 is not native desktop2560 verification. The actual user IAB was reloaded and visually inspected at its current natural width using CUA.

Behavior: coupon1 link→coupon1/1250; principal link→principal; selected coupon survives reload/back; registry scope/filter/empty/reset; correct holder navigation; issue terms; exact record seconds; payment/voting dialogs; UTC07:42:45 and return to browser timezone; EN/RU; Escape/focus return; creation reaches review with snapshot signing disabled. `functional.json` holds21passing browser assertions and no page errors. Two initial test selectors used old class/label assumptions; corrected selectors were grounded in source. Vote-help wording assertion initially expected plural Transfers instead of actual singular; actual disclosure then verified.

Independent reviewer found wide portfolio scan distance and missing accessible payment-date label. Repaired with bounded columns and sr-only date/amount labels; Money's exact accessible amount retained. Lead repaired desktop payment-inspector inherited three-column layout, tablet amount/status spacing and overview stage contrast. No backend, transaction, wallet, dependency or ledger changes. `npm run build:web`,90/90UI tests, scoped diff check pass. Current4180 remains read-only historical snapshot. No owner acceptance or live financial success claim.

---

Amount scrollbar correction11October: overview financial dd changed from overflow-x:auto (which implicitly made overflow-y:auto) to overflow:visible. Build:web passed; all6amounts fit at320/390/768/1440/2560, both overflow axes visible. Actual Windows IAB screenshot reviewed, no internal amount scrollbars. Evidence: .local/qa/reference-rebuild-20261011/scroll-fix.json and scroll-fix.png.

## Overview object grouping — owner correction11October

User rejected the prior mixed numbers. Separate coupon/principal panels now bind titles/statuses, total with units, labeled paid/remaining, exact dates/counts and recipients actions. Voting/activity separated, terms remain accessible. Latest finalized coupon links select exact id even if prior coupon=0 is retained in URL. Build:web and90UI tests passed. Browser five widths320/390/768/1440/2560 andEN390/1440 captured/reviewed; no overflow or clipped amount. Actual Windows IAB overview reloaded. Initial critic findings: pre-redemption known maturity hidden and sparse wide panels; corrected with visible maturity and two internal columns at1800+. Confirmation fixtures verify capturing does not replace finalized coupon and pre-redemption date remains visible. Evidence .local/qa/overview-clarity/qa.json,confirmation.json,final-*.png,build.log,test-ui.log. Reused Impeccable Operate/clarify/craft-floor/frontend/React/a11y and ProofPilot coach boundaries. No wallet/financial/backend writes. Owner acceptance pending.

Repeated page-intro removal11October: owner requested removing all pictured heading/subtitle bands. All6routes have no visible main h1; semantic h1 retained sr-only. Actions relocated into working toolbars/section heading. Build:web passed;30route×viewport checks320/390/768/1440/2560 show no visible title/overflow, screenshot review1440/390; New issue remains visible in creation, History opens drawer. Evidence .local/qa/no-page-intros/qa.json and screenshots. Existing math/permissions/signing behavior untouched.

## Three languages and city/GMT settings —11October2026

Added kk/ru/en through existing t/tr with shared i18n.ts and catalogs;816KKkeys,680active extracted keys,0missing. Source-key audit covers controls, forms, accessible names, receipts, recovery/signing copy; actual user/on-chain issue and proposal names are not translated. 3catalog workers used ECCi18n-sync/UXwriting/frontend/Impeccable; lead integrated source/types. No new packages or backend changes.

Build:web passed (583kB entry/167kBgzip warning retained).97UItests pass, including localization and11timezone checks. KKcalendar labels and explicit month names avoid real Chromium M10 fallback; RU/EN output retained. Decimalentry hints repaired to say decimalpoint consistently with existing validator. Partial test selectors used wrong field-error class and broad Terms text; corrected against actual source/control names.

Browser: all6KKroutes320/390/768/1440/2560; RU/EN390/1440; settings320/390/1440 andKKcalendar/errors390. Initial KK320portfolio ghostlabel overflow335px fixed with short Details translation and128px min action track. No other recorded layout overflow, no pageerrors. London GMT+1→08:42:45, Kolkata GMT+5:30→13:12:45, UTC→07:42:45 checked from archived07:42:45Z; timezone switch keeps all original main time[datetime] values. KKpersistsafterreload. Preferences retain allIANAoptions+auto groupedbyoffset,commoncitieslocalized; timezone field fullwidth. External reference consulted: MDNIntl.DateTimeFormat https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat (11October). Native user tab refreshed into settings.

Evidence: .local/qa/i18n-20261011/inventory.json,coverage.json,functional.json,kk-layouts.json,97testlog,buildlog,screenshots. Source snapshots and initialfailedparserattempt retained: TypeScript7native exposes version-only API; installed rolldown parser used, no install. Tests/screenshot review do not assert native-speaker certification, new chain execution or owner designacceptance.

## Publication integration — 11 October 2026

Workspace: `C:\Users\dmitrii\.codex\worktrees\bondtrace-release\solana`. Root's latest reference-led KK/RU/EN UI, DESIGN and sidecar were integrated into the publication checkout, preserving the reviewed native full-wire Phantom v0 bridge and its regression tests from origin. Root's older wallet-signing implementation was deliberately excluded after a source diff identified the legacy-injected regression.

The separately reviewed backend UI safety changes were merged into the current composition: exact-chain-clock late activation with reserve/schedule checks; no claim affordance for zero/excluded historical rights; explicit exact principal burn/mint/historical-rights review; and partial capture/finalization recovery navigation. New safety text is translated in KK/RU/EN. The burn summary is in the current extracted TransactionReview component. Unreferenced NextActionDesk/action-desk and its obsolete test were removed only from this publication checkout.

Skills actually read: installed Root Impeccable context/harden/craft-floor, frontend-design-guidelines states/Solana UI, React best practices; previously read ProofPilot coach and Solana security guidance reused. Worktree does not contain the ignored local skill bundle; existing Root installation was reused without installs. No redesign or financial operation was performed.

Checks: build:web passed (main entry 592.60 kB / 169.43 kB gzip; existing >500 kB warning retained); 105/105 UI suite passed; payment-model targeted suite 6/6 after two added regressions (Kazakh exact burn description and extracted review rendering); full typecheck passed after correcting the new test fixture's required snapshotAddress. Scoped diff whitespace check passed; wallet-signing source/tests have zero diff versus publication origin. The previous browser screenshots above describe Root's earlier snapshot. Browser input/screenshots for this merged final-origin build remain a separate lead verification, not established by these unit/build checks.

### Release integration receipt regression — 11 October 2026

Actual v4 localnet walkthrough exposed empty Coupon/Principal activity filters and unavailable matching receipts because frontend kind allowlists only contained legacy instructions. Added explicit v2 variants, preserved exact beneficiary/mint/snapshot/signature/BigInt checks, and accepted stored finalized proofs alongside confirmed proofs.6targeted regression tests,110UI tests and production build passed. Independent scoped source review found no actionable defect. Earlier first test attempt failed on a CSS import in the Node test runner; extracting the proof adapter into the existing receipt helper fixed the test boundary without weakening assertions.
