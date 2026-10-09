---
name: BondTrace
description: Settlement Workspace — exact financial records, inset controls and permitted actions on dark navy surfaces.
colors:
  primary: "#376cf4"
  primary-hover: "#2c5edd"
  primary-soft: "#1d3053"
  primary-foreground: "#ffffff"
  link: "#9fc0ff"
  background: "#0f1520"
  panel: "#161e2b"
  panel-subtle: "#1c2737"
  input: "#0d1420"
  foreground: "#eef2f8"
  muted: "#a6b3c6"
  border: "#2c3a4f"
  border-control: "#61748e"
  nav: "#0a101a"
  nav-surface: "#172231"
  nav-text: "#f0f4fa"
  nav-muted: "#b2bdcb"
  nav-border: "#233044"
  nav-active: "#182b49"
  muted-on-primary: "#e0e8ff"
  line-on-primary: "#5275d9"
  success: "#9cd2be"
  success-soft: "#253c37"
  warning: "#e1c39d"
  warning-soft: "#3b332c"
  error: "#efadb5"
  error-soft: "#3c2d37"
typography:
  headline:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "34px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-.03em"
  workspace-heading:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-.03em"
  title:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-.025em"
  record-title:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-.02em"
  body:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  button:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.45
  label:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
  metadata:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  table-label:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "15px"
    fontWeight: 500
  holder-name:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
  data:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "18px"
    fontWeight: 650
    fontFeature: "'tnum'"
  financial-summary:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "30px"
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: "-.025em"
    fontFeature: "'tnum'"
  portfolio-balance:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "28px"
    fontWeight: 650
    lineHeight: 1.35
  voting-result:
    fontFamily: "'Manrope Variable', 'Manrope', sans-serif"
    fontSize: "26px"
    fontWeight: 650
  clock:
    fontFamily: "'IBM Plex Mono', monospace"
    fontSize: "16px"
    fontWeight: 400
  code:
    fontFamily: "'IBM Plex Mono', monospace"
    fontSize: "14px"
    fontWeight: 400
rounded:
  badge: "5px"
  marker: "6px"
  control: "8px"
  panel: "14px"
  dialog: "16px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "20px"
  space-6: "24px"
  space-8: "32px"
  space-10: "40px"
  space-12: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
    height: "48px"
  button-ghost:
    backgroundColor: "{colors.input}"
    textColor: "{colors.foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
    height: "48px"
  issuer-input:
    backgroundColor: "{colors.input}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "56px"
  navigation-active:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "12px"
    height: "48px"
  badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    rounded: "{rounded.badge}"
    padding: "4px 8px"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
  date-trigger:
    backgroundColor: "{colors.input}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "76px"
  search-field:
    backgroundColor: "{colors.input}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "8px 12px 8px 40px"
    height: "44px"
---

# Design System: BondTrace — Settlement Workspace

## Overview

**Creative North Star: "Settlement Workspace"**

BondTrace is an operating issuer and holder application. Deep navy surfaces contain payment records, clear tabular figures and available actions. Inset fields distinguish editable data from the ledger; compact inspectors keep the selected financial object in view. The original open outlined BondTrace lettering is the visual signature.

The implemented world preserves the owner's dark navy direction, English/Russian switch, full desktop width, single field focus edge and existing exact financial/signing semantics. The product presentation is separate. Product commitments live in [PRODUCT.md](PRODUCT.md); the current replacement brief is [docs/frontend/ECC-REDESIGN.md](docs/frontend/ECC-REDESIGN.md). Earlier light-canvas and Settlement Ledger captures are historical.

The9October voting/interaction revision is described in [INTERACTION-RESULTS.md](docs/frontend/INTERACTION-RESULTS.md). Current controls, native navigation and vote layouts below reflect that implemented source. Earlier capture timestamps describe their own source cutoff; current QA and native-window limitations are recorded separately in docs/design-qa.md.

**Key Characteristics:**

- Deep navy canvas, darker navigation and contained tonal records.
- Saturated blue commands, light blue links and inset editable fields.
- Manrope interface text and financial figures; Plex Mono addresses, code and dedicated clock lines.
- Full-width desktop work with bounded financial tracks and responsive inspectors.
- Original path-drawn BondTrace lettering and one consistent Lucide icon family.

Documentation cutoff: 8 October 2026. Values come from the current `apps/web/src/styles.css`, later `operations-design.css` and `workspace-shell.css`, plus scoped overview/payment/issuer/calendar/voting styles. `main.tsx` imports self-hosted Manrope Variable and IBM Plex Mono 400/500. Normative frontmatter records reusable primitives; the schemaVersion 2 sidecar adds metadata and component specimens. Component `height` tokens describe the implemented minimum height, not a fixed clipping height.

Evidence scope: `docs/evidence/ui/ecc-redesign-20261008/qa-results.json`, captured at `2026-10-08T18:35:33.427Z`, records six views at 320/390/768/1440/2560, 30 viewport captures and 53 passing checks with no recorded failure. Those checks used the read-only saved snapshot on port 4180 and local browser drafts, with no chain signing. A later source-backed repair narrowed the inner voting track and protected portfolio identity from flex collapse; `repair-results.json`, captured at `2026-10-08T18:43:13.843Z`, records 15 passing checks and no errors, including the affected five widths and phone creation/overlay states. The stored final source hashes were refreshed after scoped recaptures, with sourceHashesUpdatedAt recording that cutoff. A second targeted touch repair records 12 passing EN/RU checks across all six 320px sections; settings and refresh measure 40×44px, with document width320. The native-window record separately reports headed outer 2560×1440/content 2560×1353 with no document overflow. Snapshot checks, source inspection and saved screenshots do not establish current chain availability, owner acceptance or completed independent review. The generated payment concept is illustrative and supplies no financial truth or approved fidelity target.

## Colors

Dark navy neutrals carry working records. Command blue identifies available actions; its lighter companion carries links and control accents.

### Primary

`primary` fills command buttons, selected calendar days and active numbered workflow markers. `primary-hover` deepens available commands, with `primary-foreground` remaining white. `link` is readable on the navy grounds. `primary-soft` identifies selected financial rows and information groups; it does not introduce another command palette.

### Neutral

`background` is the workspace and toolbar ground; `panel` contains ledger and form records; `panel-subtle` groups hover or selected subregions. `input` recesses editable controls and reconciliation strips. `foreground` carries the principal fact; `muted` carries supporting labels and context. `border` supplies structural seams; `border-control` makes interactive edges legible.

The `nav` family defines the darker rail, hover and active surfaces, rail text and border. The selected navigation label uses the observed light blue component text token. `muted-on-primary` and `line-on-primary` retain their existing command-surface contrast roles.

### Semantic states

Success, warning and error use text/soft-ground pairs. Status text remains visible; a color alone does not prove paid, confirmed, failed or eligible.

**The Honest State Rule.** Color represents an actual operation or validation state; it never implies production, payment or eligibility without evidence.

## Typography

Manrope Variable is the self-hosted interface and financial face. IBM Plex Mono 400/500 supplies addresses, technical references and dedicated clock lines. The brand uses SVG paths and has no font dependency.

Shared headings use the `headline` token; Payments uses `workspace-heading`, while Overview has the same size/line height with the shared heading weight. Phone page headings reduce to 28px. Shared section titles use `title`; selected payment, issuer and voting titles use the stronger but quieter `record-title`. Working body is `body`; primary labels use `label`; captions use `metadata` only where supporting context warrants it.

Payment/registry figures use `data`, with tabular lining numerals. Payment holder names use `holder-name`; registry names use weight 650. Phone Payments names reduce to 16px while payment amounts remain 18px; phone registry names use 17px. Reconciliation and Overview totals use `financial-summary`, reducing to 22px on phones. Overview totals become 34px at 1800px and above. Portfolio uses `portfolio-balance`, reducing to 24px below 640px and 22px at 360px. Voting results use `voting-result`, reducing to 24px below 640px. Issuer review figures use 26px/650 and receipt totals use 28px/650, reducing to 25px on phones.

Creation text fields use 18px; numeric fields use Manrope tabular numerals at weight 600. Coupon amount controls use 22px on broad screens and 20px at compact sizes. Dedicated payment/voting clock lines use Plex Mono 15px, reducing to 14px in phone Payments; date triggers use `clock`. The calendar's hour/minute inputs deliberately use Manrope 24px/650, while its selected time readout uses Plex Mono. General date/time components retain Manrope tabular numerals where their scoped stylesheet does not choose a mono clock.

Amounts are derived from integer minor units. Display removes only insignificant fractional trailing zeros and adds grouping; raw precision remains available through `Money` accessibility/detail presentation and transaction review. Unknown numeric values remain unknown, never zero. Long exact amounts scroll inside financial cells or wrap in the existing record-specific rules without widening the page.

**The Exact Figures Rule.** Format the display without rounding away significant digits or changing raw arithmetic; do not substitute floating-point approximations or abbreviations for settlement values.

**The Readable Work Rule.** Primary body and labels use the documented working hierarchy; compact metadata must not become the default size for financial tasks.

## Layout

The fixed navigation rail is 240px, reducing to 232px at 1080px; the mobile shell replaces it at 800px. The workspace occupies the remaining width with no global content cap. Main padding is 32px, increasing to 40px at 1600px. Below 800px it is 24px vertically/16px horizontally; below 360px it is 12px horizontally.

One issue/account toolbar carries the selected issue, network details, EN/RU, settings, account and refresh. Desktop toolbar minimum height is 80px with 14px/32px padding, increasing to 40px horizontally at 1600px. Between 801–1180px its issue and controls recompose into rows. Below 800px its minimum height is 104px; the issue is a separate line and controls stay in one compact row. The phone account control presents the wallet name, with the full address available in details.

Overview is a payment ledger plus issue/activity inspector. Its fluid record track is paired with a 360px inspector, increasing to 400px with a 32px gap at 1800px. At that width, payment identity occupies 320px and its financial values remain bounded to 860px. Below 1200px the inspector moves under the ledger in two columns; below 640px it becomes one column. Financial values remain a grouped three-column record. Its retained `JudgeOverview` source name does not authorize a judge tour or marketing narrative.

Payments pairs a fluid ledger with a 304px reserve/action inspector; at 1800px this becomes 320px with a 32px gap. At 1650px and below the inspector moves under the ledger. Exact selected record/payment dates and reconciliation precede recipient rows. The selection block pairs a bounded 200–300px identity track with the date group, stacking below 1050px. The desktop date tracks are bounded to 240px; reconciliation tracks to 260px.

The payment table reserves a 144px action track from 641–1800px. Its remaining width is split 36/20/24/20% across holder, recorded quantity, payment and status. Above 1800px, the tracks use 340px holder, 180px quantity, 240px payment and 160px status, with remaining room for actions. At exactly 1800px the later 641–1800px rule applies. Phone rows pair holder/amount, then recorded quantity/status, with a full-row details action; search and status filters remain usable. The first phone payment begins at 699.328125px in the saved 390×844 capture, so it is visible but not wholly contained in that viewport.

Registry has a name/address search and labeled narrow records. At1600px its holder/address/quantity/value tracks are340/300/180/220px; below900px it recomposes to two-column record groups with name, address and action spanning both tracks. Labels wrap within minmax(0,1fr) tracks with16px gaps. Action buttons retain16px horizontal padding; native holder links have40px minimum height. Search fields fill the phone toolbar.

Issuer creation uses three numbered stages and fills the task canvas. The Terms step pairs a fluid form with a 300px summary and 32px gap; from 761–1179px this summary becomes 240px with a 24px gap; below 760px it follows the fields. Broad terms use a second bounded 240–420px field track at 1600px. Coupon amount/date/date tracks use a 180–260px amount and two fluid date controls; 761–1179px keeps the amount above a pair of date controls; below 760px all stack. Form-body padding is 32px, reducing to 20px at 760px and 16px at 420px. Existing placement/reserve work pairs a fluid main track with 360px side work, stacking below 1280px. Do not restore the former 1360px main or 900px form caps.

Portfolio places the inspected account and its three real balance totals before recorded payment rows. Account identity uses a 360px flex basis and minimum width bounded by the lesser of its available width and 320px; its parent wraps controls instead of collapsing the identity text. Rows use fluid 230/140/180/220px minimum tracks; at 1800px they use 460px description, 240px amount, 240px payment date and the remaining action track. Below 1180px the rows recompose into two tracks; below 640px the name spans the row and date/amount sit together above state/actions. Phone totals become label/value rows. Inspection does not grant signing authority.

Voting uses a dedicated vote-page system with results, deadline/rights context and a useful action area. At1800px the result track is bounded to520–720px, context fills available width, and actions use360–440px. Below1450px context moves under results/actions; below900px open ballot actions lead; below640px areas and vote choices stack. The full workspace remains uncapped. Subject26px/24phone, result labels17px and normal totals32px/30phone support clear scanning. Closed state explicitly ends voting and offers history; open states offer account selection, unsigned vote review or read recovery according to actual rights. Original proposal text and exact weights remain unchanged; no governance approval/quorum result is inferred. Long weights use24px/20phone one-line local scrolling, full raw title/ARIA and bounded grid tracks. Portfolio selector/action controls stack below640px.

Receipt details and display settings use ordinary dialogs. Receipt date pairs stack on phones, receipt activity becomes icon/content with the state/action beneath content, and the drawer occupies at most 600px. Settings uses labeled native selects and a date preview that states its timezone. The calendar has its own protected editing layout described below.

**The Bounded Tracks Rule.** Use the available desktop width while keeping related money, dates and identity tracks close enough to scan together.

Spacing follows the extracted four-pixel rhythm, with larger gaps separating tasks and smaller gaps binding label/value or name/address. Broad changes require rendered checks at 390/768/1440, overflow at 320 and actual 2560 desktop. Saved archive evidence does not replace a new check after source changes.

## Elevation & Depth

Working records rely on contained tonal surfaces and one-pixel seams. The overlay shadow (`0 24px 80px rgb(0 5 16 / 48%)`) identifies temporary dialogs and the calendar. Ordinary dialog backdrops use `rgb(3 9 17 / 72%)`; the calendar mixes the workspace ground at 76% opacity. No repeated ambient record shadow is part of the system.

Shared control feedback transitions color/background/border for 140ms with `cubic-bezier(.16, 1, .3, 1)`. Issuer and calendar feedback use 150ms. The one-second linear spinner represents actual pending work. These transitions and spinner run under `prefers-reduced-motion: no-preference`; static state dots and snapshot context do not blink.

**The Flat Records Rule.** Working records use tones and seams; overlay shadow identifies a temporary editing or inspection surface.

## Shapes

The normative corner hierarchy distinguishes compact badges, numbered markers, controls, financial panels and ordinary dialogs. Calendar uses the panel corner; active language/scope buttons use the badge corner. Corners identify function rather than turning every control into a pill.

The original `apps/web/public/brand/bondtrace-lettering.svg` is an open outlined path drawing with rounded terminals. Its desktop width is 184px; the mobile shell uses 162px. The compact companion/favicon is derived from the same original lettering. Do not replace this with a font-derived wordmark or unrelated badge.

Lucide remains the icon family. Navigation uses21px icons and2px strokes; shared action/copy icons also use2px strokes, generally18–22px. Dedicated compact static/input/calendar icons retain their existing treatments. Icons have accessible names when they are the control, or aria-hidden when a visible label supplies meaning. Static issue imagery is unframed; control boundaries identify actual actions.

## Components

### Buttons and navigation

Primary commands use the primary color pair; secondary actions use panel/foreground with a control border. Quiet/ghost actions use inset ground, foreground text and a visible control border; they must never resemble static muted labels. Shared command labels use16px/650,48px minimum height and9px/16px padding; compact quiet controls have44px minimum height. Hover strengthens the border and surface without decorative motion. Disabled operations retain their reason and existing opacity/locks.

Sidebar and holder navigation are native anchors with meaningful destinations and preserved browser new-tab behavior. Holder links are link-colored and underlined; static names and facts are ordinary text. Disclosures are contained controls with their native semantics. Desktop settings/refresh show text labels; phone versions keep accessible names and40×44 targets. Copy controls have a visible boundary. Use inspect icons for dialogs, direction arrows for internal transitions and external arrows for external destinations.

Rail items use17px/500 text, rising to650 for the selected item; compact navigation uses16px. Padding12px and48px minimum height remain. Selection uses the active navy surface and foreground label. At mobile width the menu opens labeled44px links. EN/RU targets are40×40px; settings/refresh remain40×44px through320px. Below360px the toolbar has8px horizontal padding to preserve those targets and one control row.

Ordinary buttons/links use a 3px visible keyboard outline with 3px offset; navigation substitutes its high-contrast light-blue focus color. Calendar buttons retain their own 2px visible focus treatment.

### Inputs and validation

Fields are inset, have a clear visible label and use the stronger control border. Issuer text/numeric fields have a 56px minimum height, with 52px on compact ordinary issuer fields. Decimal amounts remain decimal-safe text inputs. Search/filter controls have 44px minimum height; dark native select options retain readable colors.

Focus merges with the existing edge: link-colored border and one-pixel outline at offset -1px, with no shadow. Registry search applies this change to its surrounding field container. Payment search/status and date triggers use the same boundary principle.

**The Single Edge Rule.** Text-field focus occupies the existing control edge; do not add a detached second ring.

Red errors represent touched blur validation or attempted progression. Initial typing does not start a premature error state. Preserve first-invalid focus, field values, per-network/account creation drafts and exact final review. Disabled fields use the canvas/muted pair.

### Financial records, status and filters

Contained panels supply surface, seam and corner; their own headings/bodies supply padding. Payment rows preserve their exact significant digits and explicit state. Status badges use 13px/600 type, 4px/8px padding and a 26px minimum height; payment/voting rows use 14px status text. Numbered workflow stages and textual completion replace repetitive decorative checkmarks.

Payments searches actual holder labels or wallet addresses and filters All/Paid/Unclaimed from claimed state. The result count is a live status; Clear filters restores the full record set. No-match is distinct from no recorded allocations. Registry search and holder selection retain their own view-only boundaries.

### Dates and protected calendar editing

Date triggers are inset controls with 76px minimum height and stable separate date/time lines. Canonical instants retain exact seconds; each date group states its display timezone once. Auto follows the browser; explicit IANA display preferences do not modify the canonical UTC instant or signing terms.

The calendar is at most 440px wide, with `max-width: calc(100vw - 16px)` and a bounded viewport height. Below 359px it uses the viewport minus 16px and 12px padding; at 320px its outer width is 304px. The seven-column grid keeps 44px-high day buttons, constrained horizontally by the available grid column. Exact minimum measured day width is not promoted from the previous calendar implementation without current evidence. Its scrollable body is separate from persistent Save/Cancel controls. Save applies the selection; Cancel and Escape preserve the previous value. Selected dates use command blue; disabled dates retain text treatment.

Hour/minute inputs use 56px minimum height and Manrope tabular 24px/650. A separate selected-time line uses Plex Mono. Ambiguous/nonexistent new local times remain invalid. Display preference changes preserve canonical instants and saved drafts.

### Accounts, receipts and errors

The account picker has its own protected 1000px desktop dialog, bounded by viewport margins and a maximum840px/viewport-minus48px height. It separates holder inspection from wallet actions into two columns. Header and footer remain outside the scrolling content; settings and Close are ordinary outlined buttons in that footer. Below760px the areas stack into one scrolling body with intrinsic-height rows, viewport-minus24px limits and safe-area footer padding. Sections never overlap.

Holder options have72px minimum height, explicit View/Selected text, a readable17px name and14px monospace shortened address. The list uses `grid-auto-rows: max-content`; wrapped names must increase a row's height, never push addresses outside its border. Current-holder highlighting follows the actual inspected portfolio, independently of signing authority. On desktop only the holder list scrolls to reveal the current option; the wallet pane and background page remain stationary. Section headings use20px, reducing to19px on compact screens. Wallet connection/signing callbacks and pending-operation locks remain the existing product behavior.

The phone account button shows the wallet name without an address wrapping across its label. Full addresses remain in account/signing details. Viewing another holder remains independent of transaction authority; settings are wallet-independent.

Receipt inspection shows the beneficiary, exact quantity/unit/total, related dates and matched evidence. It remains distinct from transaction submission. Unknown evidence has a loading/unavailable state instead of fabricated success. Activity exposes action filter, timestamps and scope; transaction review retains the existing exact network, signer and amount semantics.

A connection failure preserves the selected working view and recovery action. Unknown reads are not zero balances or first-run onboarding. Live network context says Test network/Тестовая сеть and opens exact localnet/devnet/signing details.

The separate read-only historical preview at `npm run preview:ui`/port 4180 says Saved snapshot/Архивный снимок, with compact Saved/Архив and capture time in details. It reads saved evidence and disables signing/API mutation. Archived paid/confirmed records do not become current chain proof through this visual system.

## Do's and Don'ts

### Do:

- Do use the available desktop width with bounded internal financial tracks.
- Do preserve exact raw values while presenting Manrope tabular financial figures.
- Do keep labels, date/time lines, recovery, network and signer scope readable and truthful.
- Do reuse the original path-drawn BondTrace lettering and consistent Lucide control icons.
- Do preserve keyboard focus, draft recovery, display-timezone semantics and reduced-motion behavior.
- Do distinguish an archive with capture time and disabled signing from current chain reads.

### Don't:

- Don't restore the rejected white workspace, pale-blue command fill or fixed desktop content caps.
- Don't restore mono financial figures from an earlier design document over the implemented Manrope system.
- Don't add a detached second focus ring to text fields.
- Don't use decorative blinking or repeated checkmarks as page decoration.
- Don't invent balances, customers, institutional endorsements or production claims.
- Don't add a judge tour, promotional hero or explanatory presentation to work screens.
- Don't relabel saved snapshots or generated concepts as current chain evidence.
- Don't replace the existing React/CSS component foundation wholesale without reviewed scope.
