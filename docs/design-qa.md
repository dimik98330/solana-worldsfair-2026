# Redesign QA — 8 October 2026

## Voting and shared interaction revision — 9 October 2026

Current scope and exact checks: [INTERACTION-RESULTS.md](frontend/INTERACTION-RESULTS.md), fresh [INTERACTION-REVIEW.md](frontend/INTERACTION-REVIEW.md). Owner's Voting screenshot superseded prior surface acceptance. Changes cover explicit voting states/actions, readable results/context, inspect dialog, shared contained commands, native underlined holder/sidebar navigation, toolbar labels/icons and responsive registry/portfolio controls. Original proposal wording, precise weights, voting/signer locks and API semantics remain binding.

Evidence root `C:\Users\dmitrii\Documents\solana\docs\evidence\ui\interaction-20261009\`:58actual final PNGs. Initial56renders/241checks retained239pass and two actual overflow failures; the corrected snapshots do not rewrite that historical result. Separate confirmations45/45,5/5 and8/8 passed, zero page errors. Final nine source hashes in number-confirmation.json independently match. Reviewer ships all six sections at inspected UI scope; IR01–12 closed. Cases include all sections320/390/768/1440/2560, Voting EN and owner's1920, dialogs/navigation/new-tab/search plus clearly marked browser-only fixtures for voting rights/status/unknown/large exact weights. One intercepted unsigned prepare intent was blocked; no financial writes, wallet calls or live-chain result is established.

At320 the extreme u64 weight remains one unbroken exact value in a bounded horizontal wrapper, with full raw title/ARIA and keyboard focus. Its284px text may exceed the262px visible wrapper; simultaneous visibility of every digit or actual scroll-input testing is not claimed. Page and local card-child containment were explicitly checked. Native window was honestly limited to1940×1100/content1940×1013;2560logical viewport is verified, physical native2560 remains unverified. No display setting was altered.

Build:web and52existing UI tests passed. One detector0primary/4type advisories was recorded at its integrated inspected cutoff; no repeated/clean detector or accessibility certificate. Actual DESIGN/sidecar/brand were synchronized. New prototype images remain archived read-only data or labelled UI fixtures; they are not fresh chain proof, production, contest readiness or final owner acceptance.

## Account dialog correction — 9 October 2026

Direct owner screenshot rejected the narrow580px account dialog and blended bottom controls. The account surface is now1000px on desktop, with distinct holder/wallet areas, explicit row actions/current state and a persistent settings/Close footer. Mobile uses one correctly bounded scrolling body. Scope: App account composition, optional Overlay className, new AccountPicker/account-picker.css only; backend/Git/dependencies/signing behavior untouched.

Evidence: `C:\Users\dmitrii\Documents\solana\docs\evidence\ui\account-dialog-20261009\`.19actual final PNGs cover EN/RU320×700,390×844,768×1000,1440×1000, owner's1908×930 and2560×1440; phone wallet after scroll; synthetic16-holder/long-label/short-height fixture and empty registry. `qa-results.json`90checks and `repair-results.json`30checks passed, zero page errors; final4/4source hashes match. Normal input covered holder2 navigation/view-only status, selected6, settings handoff, Close, Escape/focus return, closed-dialog hiding and unrelated receipt overlay. Native Tab/Shift+Tab were checked after correcting the harness's locator-focus behavior. No real wallet connect/signing/error or expanded-demo state is claimed.

Two bounded source repair batches resolved actual mobile section overlap and tablet/long-label row-height overflow; row identity/address bounds are now explicitly measured. A queued-wheel baseline and automated topbar scrollIntoView were harness measurement issues; final stationary-background test uses the visible portfolio account trigger, with settled scroll. Initial reports are preserved ignored in `.local/account-dialog-qa-first.json`/`account-dialog-qa-second.json`. Synthetic fixtures are client-only routed GET responses; they are not16on-chain holders or new financial evidence. All financial POSTs were blocked during tests.

`build:web` passed;6 existing holder-authority/wallet-deadline tests passed. One mechanical detector run:0primary/2advisory for the deliberate19/20px section-heading variants now documented in DESIGN. No repeated detector/no clean-advisory claim. Fresh [ACCOUNT-DIALOG-REVIEW.md](frontend/ACCOUNT-DIALOG-REVIEW.md) reports ship at inspected Account UI scope, AD01–AD06 resolved. Prior global60PNG review is historical for its source; this correction does not establish live-chain correctness, screen-reader certification or final owner acceptance.

## Current ECC replacement evidence

Current implementation is Settlement Workspace. Evidence root: `C:\Users\dmitrii\Documents\solana\docs\evidence\ui\ecc-redesign-20261008\`. Earlier QA below applies to its own historical source versions; prior `ship` did not establish acceptance of the owner-rejected design.

`qa-results.json`: 30 viewport renders (six sections at320/390/768/1440/2560), all without horizontal document overflow, 53 normal-input checks passed, zero page errors. `repair-results.json`: one coordinated CSS repair for portfolio identity at1440 and bounded voting results at2560, recaptured both screens at all five sizes and the exact selected-holder frame; 15 checks passed, zero page errors. `touch-repair-results.json`: second targeted repair keeps settings/refresh40×44 at320; all six sections in EN/RU,12 checks passed, no overflow or page errors. Additional phone evidence covers invalid creation with focus on the first error, exact review/top/footer, account and receipts. The QA runner initially used an ambiguous View only locator and failed to reopen New issue after reload; selectors were corrected and the complete final pass succeeded. These harness errors are not recorded as product failures.

Actual functional checks: coupon625/principal25,000; name/address and status search with no-match/clear; registry→view-only portfolio and holder switch; exact archived network/capture timestamp; UTC display preference retaining canonical time; untouched creation without red errors; invalid progression focus;1000.000001+25.000001=1025.000002; persisted draft reopened after reload; completed-stage return; calendar Save/Cancel/Escape and320 fit; unavailable API preserving Payments/recovery without first-run onboarding; phone account/receipt dialogs and Escape focus return. All financial POST requests were blocked in the render test context, and archived signing remained disabled.

Native window is separately verified in `native-window.json`/`payments-native-2560.png`: headed Chromium outer2560×1440, CSS content2560×1353, DPR1, document2560; holder x357 and amount x992.33 keep the register's scalar scan bounded. The temporary test window was positioned off screen and closed. Browser matrix uses CSS viewport screenshots, not full-page stitched form captures. CUA's persistent in-app browser was also used for real navigation, payment toggling, measured phone toolbar and screenshots. The direct js_repl tool was unavailable; bundled Playwright performed the reproducible render/input fallback without adding dependencies or changing feature flags.

Phone390 first payment row starts699.33; identity, exact200 and Paid are visible in844px height, detail action follows below. At320 the page remains320px; no claim that an entire long record fits in one viewport. Reviewer assesses that distinction from actual screenshots.

One Impeccable detector run:0primary/59advisory (old DESIGN type/color/radius vocabulary); implemented DESIGN/sidecar/brand were synchronized to actual source. No second detector or clean-advisory claim. This is not visual acceptance. Independent report: [ECC-FINISH-REVIEW.md](frontend/ECC-FINISH-REVIEW.md); final disposition recorded there. Delivery includes60actual UI PNGs and one clearly illustrative generated concept. Final18/18source hashes match. Review/deployment scope is local UI against saved localnet evidence; live chain, wallet signatures, production data, accessibility certification and final owner acceptance are not established by these checks.

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
