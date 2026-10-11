---
name: BondTrace
description: Settlement Workspace — exact financial records, inset controls and permitted actions on dark navy surfaces.
colors:
  primary: "#416ee8"
  primary-hover: "#315dce"
  primary-soft: "#1e3053"
  primary-foreground: "#ffffff"
  link: "#a9c4ff"
  background: "#10141d"
  panel: "#151c28"
  panel-subtle: "#1c2635"
  input: "#111822"
  foreground: "#eef1f6"
  muted: "#acb7c7"
  border: "#2a3546"
  border-control: "#62758d"
  nav: "#0c1018"
  nav-surface: "#18212e"
  nav-text: "#f0f4fa"
  nav-muted: "#9ca9bb"
  nav-border: "#252e3b"
  nav-active: "#202b3d"
  muted-on-primary: "#e0e8ff"
  line-on-primary: "#5275d9"
  success: "#96d6ba"
  success-soft: "#1b332d"
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
  panel: "12px"
  dialog: "14px"
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


# Design System: BondTrace — reference-led operating workspace

11 October 2026, second owner-directed revision. The owner rejected the previous card-heavy premium attempt: old-fashioned controls, excessive text and unclear flow. That version is not an approved visual target. The current system follows actual study of Mercury Bill Pay and Linear's documented2026 interface refresh, while retaining BondTrace's original path lettering and dark navy commitment.

## Structure and interaction

- Quiet232px desktop rail with management/holder groups;70px toolbar; full-width work area. At800px the rail collapses. No marketing introduction, ornamental card grid or decorative blinking.
- One consistent button system:8px corners,40px desktop minimum/44px touch,15px medium labels, subdued filled secondary buttons, quiet contextual ghost actions, blue commands. Inputs retain an inset surface, explicit label and single-edge focus. Main headings30px/27px phone; body17px and primary labels15–16px. Addresses remain13px mono metadata, financial values use Manrope tabular figures.
- Issuer starts with payments and actual paid totals. Terms/addresses/lifecycle live in an explicit second view. Every Recipients button selects its exact coupon or principal; coupon selection persists in the URL and survives refresh/back.
- Registry separates Payment rights from Current positions. Recorded balances and current holdings never appear as indistinguishable tables stacked together.
- Portfolio starts with selected holder, exact received total and payments. Present position/account authority is a native disclosure below. Record dates remain accessible per row and in details. Wide financial rows use bounded inner tracks, full-width separators.
- Voting keeps exact weight results, deadline, state and actions; the explanation is a native disclosure. Preferences are compact rows with an exact timezone preview.
- Financial arithmetic, transaction reviews, permissions, snapshot prohibitions and recovery are preserved. Unknown values remain unknown. Archived preview never becomes live evidence.

## Source and verification

Final shared layer: apps/web/src/premium.css. Route-specific files: issuer-premium.css, portfolio-vote-premium.css, settings-premium.css, registry.css and judge-overview.css. Old terminal.css is not imported. Existing foundation files remain; no wholesale dependency migration.

Sources and concrete decisions: docs/frontend/premium-reference.html. Mercury demo was rendered and inspected; Linear's official article and Ramp help documentation were read. Linear image loading failed and is not claimed as visual inspection. Evidence: .local/qa/reference-rebuild-20261011/. See docs/design-qa.md for checks and repairs. Owner acceptance is pending. Preview remains http://127.0.0.1:4180, read-only historical data.

## Latest owner correction — overview clarity,11October2026

Owner rejected the mixed/stretched numeric overview. JudgeOverview now uses separate coupon/principal panels, each owning one36px total with explicit units,16px paid/remaining labels with19px values, exact15–17px dates/counts and adjacent recipients action. The section explicitly identifies the latest finalized recorded coupon. Two panels on desktop, one column below1100px; at1800px total and reconciliation occupy bounded adjacent internal columns. Voting/activity are separate semantic sections. Issue terms remain native details; known maturity stays visible before redemption. Implementation: overview-clarity.css imported by JudgeOverview.tsx, independent of old overview selectors in premium.css. Dark navy/original wordmark/financial semantics retained.

Latest owner correction11October: repeated visible page titles/intro/status bands removed across all6tabs. Overview creation action moved to payments section header; registry History sits beside view switch; payments History sits in payment toolbar; portfolio History beside holder controls; issuer keeps creation controls. Semantic h1 remains sr-only for navigation/accessibility; creation and dialog task titles remain visible. Implemented without changing financial/signing behavior.

## Three languages and timezone labels — owner request11October2026

The operating UI now supports kk/ru/en (header KZ/RU/EN and preferences Қазақша/Русский/English), persisted at the existing bondtrace.language key with correct HTML language codes. Existing t/tr are backed by one pure i18n module and source-key catalogs; hardcoded RU/EN UI branches moved to that module. Source labels, not external issue names or proposal text, are translated. Kazakh calendar/date display uses explicit month names to avoid Chromium ICU M10 fallback.

Timezone preferences preserve original IANA values and browser-auto mode. Choices are city + GMT offset, grouped/sorted by offset at preview instant; all supported zones remain selectable, common cities have EN/RU/KK names. Full-width timezone selection avoids mobile ellipsis. Offsets account for DST and half/quarter hours. Preferences change display only. All payment instants/signing/financial guards remain unchanged.
