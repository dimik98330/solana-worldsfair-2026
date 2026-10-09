# Workflow rebuild after owner rejection

8October2026. The owner rejected the implemented UI as mixed, unclear and inconvenient to select dates. Prior screenshots, successful builds and zero detector findings are not design acceptance. Fresh independent review identifies a workflow rebuild; previous UI cut remains historical, backend budgets are unchanged.

Keep the approved light financial canvas/dark navigation. Rebuild the task model, not another token-only polish. Icons are mandatory: official Lucide, one weight/size vocabulary. Clear tabular UI figures, no insignificant zeros or decorative blinking. User explicitly chose English as default with a Russian switch; components follow the chosen locale.

## New interaction contract

- One context toolbar: selected issue and one account control; role/signing source explained inside its menu instead of three competing rows. Recorded coupon selection belongs to the payments/rights content it scopes.
- Creation is a focused three-step flow: terms, schedule, review. Opening New issue hides the existing redeemed issue and all unrelated placement content. Preserve inputs on step changes; validate the current step, focus its first error, retain final exact immutable review before external signing.
- Date selection is a real accessible month calendar and clear24-hour time, with month navigation and keyboard support. No fragmented datetime-local/seconds editing. Local timezone appears once; no silent UTC or whole-day shift.
- Technical mint details are secondary expandable content. The actual classic SPL mint/6-decimal restriction and exact transaction params remain enforced. Do not invent fiat currencies or hide account/network authority.
- Outside creation, show one next task with direct route/action, then positions/reserve/receipts. Archived issue names are historical source data, not the starting tutorial for a new user.

## Ownership and checks

Lead: App.tsx/shell styles, account interaction, locales, dependencies/lock/config/Git; calendar worker: DateTimeField.tsx/date-time-field.css plus isolated date helper tests; issuer worker: IssuerSetup.tsx/issuer.css for step flow (does not edit calendar or shared files). Fresh critic owns only its report. Every substantial task selects/reads installed skills; ProofPilot coach required for product decisions; relay rule into all handoffs/new chats.

React DayPicker10.0.2, official gpbl repository/MIT, npm React>=16.8 peers checked; official accessibility/month-grid guidance read live. This is a calendar primitive inside the existing React/native/CSS foundation, not a second full component system. No hooks/global permissions/paid services.

Complete code and functional checks, then new full desktop/phone/native-width captures and fresh full finish review. Do not recycle the earlier rejection into a passed verdict. No automatic final submission, mainnet, funds or private repo visibility change.
