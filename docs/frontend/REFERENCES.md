# Public references for the issuer workspace

Accessed8October2026. ProofPilot coach and Impeccable Operate guide the interpretation. These are evidence of useful public interface patterns, not customer validation, KASE integration, regulatory suitability or permission to copy brands/assets.

## User and task

The issuer needs to (1) create terms and place bonds with registered holders, (2) reserve settlement funds and activate the issue, and (3) service dated coupons/maturity and inspect signed receipts. The key screen joins issue phase, exact liabilities/reserve and the next authorized action. Holders need their actual rights, claims and voting; judges need a comprehensible reproducible example.

## Eight selected references

**Visual** means a real CUA screenshot was inspected on this task. **Text** means the linked primary page's content was read, without claiming that its underlying logged-in product was viewed. Product illustrations embedded in docs/marketing are labelled as such. Third-party assets were not saved or copied.

| Reference / inspection | Screen or flow | Useful observed pattern | Adaptation and destination |
|---|---|---|---|
| [Mercury Bill Pay overview](https://support.mercury.com/hc/en-us/articles/28768945847316-Bill-Pay-overview) — Text | Setup and bill-payment workflow | Setup, review, recipient, amount/date/funding and final review are separated. Scheduled and paid have different meanings. | Issuer creation uses grouped terms, schedule and summary. Activation has reserve/registry prerequisites. No OCR/banking functionality is implied. |
| [Ramp Bill Pay approvals](https://support.ramp.com/bill-pay-approvals/) — Text | Authorized operator/reviewer actions | Distinct view/approve/pay permissions and an activity history; pending work is discoverable through the relevant queue. | NextActionDesk identifies signer authority and the unmet prerequisite; transaction history shows the actual outcome. Do not implement Ramp's enterprise approval builder or AI recommendations. |
| [Mercury public Bill Pay demo](https://demo.mercury.com/bill-pay) — Visual + DOM | Real publicly accessible desktop demo | Compact toolbar; clear heading/action; three related totals; state tabs immediately above one table. Recipient, amount, date and status have stable columns. Selected section and sub-navigation are visible. | Overview: phase + three real financial totals + actionable record. Payments: stable holder/rights/amount/state/action rows. Our dark sidebar follows the user's choice; Mercury's inspected sidebar was light. All Mercury demo numbers remain third-party examples, never BondTrace data. |
| [Stripe Dashboard search](https://docs.stripe.com/dashboard/search) — Text | Financial resource list/search | Resource results expand into column-headed lists, and status/type qualifiers narrow relevant items. | Registry and receipt history show named columns, specific states and real identifiers; use small relevant filters only where data supports them. Do not add a decorative non-functional global search. |
| [Mercury Bill Pay public page](https://mercury.com/bill-pay) — Visual first screen + Text | Public product introduction with embedded dashboard | Restrained light surface, concise headline/action and a real product preview underneath. The operational preview is separate from marketing copy. | Judge introduction explains the servicing outcome and leads into a real app/video. Do not insert a marketing hero or sales form inside the issuer console. Do not borrow Mercury's logo or institutional claims. |
| [Ramp Accounts Payable public page](https://ramp.com/accounts-payable) — Visual first screen + Text | Public first screen | Strong left-aligned hierarchy and an obvious primary entry. The observed page was marketing, not an authenticated AP app. | Concise page titles/action hierarchy; remove redundant labels above every heading. Do not copy its lime palette, animation, logos, customer counts or performance claims. |
| [Linear Filters](https://linear.app/docs/filters) — Visual docs + embedded product example, Text | Focused operating list | Embedded example shows compact grouped rows and visible applied filters. The text documents filtering reflected in the URL. | Preserve issue/view URL context and selected navigation; use structured table groups. Maintain clear current location and return behavior. No new AI filter or complex AND/OR builder is needed. |
| [Linear Custom Views](https://linear.app/docs/custom-views) — Text | Workspace/team view navigation | Scoped views are named and reached from the sidebar; detail properties clarify the current view. | One consistent sidebar for Overview, Issuer, Registry, Payments, Portfolio and Voting; issue and network/signer context remain in a compact header. A work summary sits beside grouped issuer forms, not six unrelated cards. |

## Applied direction

Latest owner correction supersedes the older direction below: navy working surfaces, full desktop width, original path-drawn BondTrace lettering, one text-field focus stroke and numbered stages. Official shadcn calendar was additionally inspected visually on8October; see NAVY-REVISION.md. Earlier IBM Plex Mono-for-numbers guidance is superseded by Manrope tabular financial figures; Mono remains for identifiers.

The user selected **light financial workspace + dark navigation**. The synthesis is our design inference: an ink navy navigation column, cool gray working canvas, white information surfaces, blue primary/selection accents, and text+icon+semantic-color states. Manrope handles UI hierarchy; IBM Plex Mono handles numbers and addresses. Reference products do not independently justify every color or token.

The central sequence is issue → terms/placement → full reserve/activation → record/payment → maturity. Financial state and authority outrank decoration. Show one highest-priority next action with why, compact actual metrics and a readable table. Exact addresses/details remain available even when the default presentation is compact. Remove repetitive testing phrases from work panels while retaining one honest network/signing context and exact transaction review.

## Access boundaries and unsuitable inspiration

- `https://mercury.com/demo` visibly returned a404. The official Bill Pay page supplied the working `demo.mercury.com/bill-pay` link; it was inspected without creating a banking account or taking payment actions.
- The Linear inspection covered public docs and an embedded product image, not a private workspace. Ramp inspection covered public marketing/help, not its logged-in AP workflow.
- A Stripe support payment-record article appeared in search but its full open failed with unsupported content type; it is **not** one of the eight selected evidence sources.
- Mobbin/Refero paid/account galleries, Land-book/Awwwards/Godly and Figma were not inspected in this task. Public vendor references were sufficient for this operating cabinet. No inaccessible screenshot is claimed.
- These links support design interpretation. They do not grant a license to redistribute screenshots, company logos or complete branding. We reproduce general layout/behavior principles in original project code.

## Implementation acceptance

The outcome must let a first-time operator identify their current issue/phase, see the exact amount and signer consequence, find the next permitted task and recognize a confirmed receipt. The lead verifies this with actual app states and the bounded desktop/tablet/phone review in PLAN.md; these external references do not count as that verification.
