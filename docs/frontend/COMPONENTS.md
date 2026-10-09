# Component foundation and state contracts

8October2026. Approved direction: light financial workspace + dark navigation. This is an implementation contract, not a report that all states have passed browser QA. DESIGN.md at finish records the actual tokens. Read AGENTS/PRODUCT/BRIEF and relevant installed skills before substantial edits; ProofPilot coach governs product choices and the rule persists in handoffs.

## Foundation choice

Keep the existing **React + semantic HTML + project CSS** foundation. The current app already has native controls, tables and `<dialog>` with exact wallet/API integration. Redesign its tokens and components coherently rather than adopting multiple unfamiliar APIs during submission work. Lucide React is the single icon family. No Tailwind/shadcn/components.json is currently present; choosing shadcn would require Tailwind/base-library/config migration and renewed overlay/form regression checks. The supplied catalog makes its installation conditional. [Official shadcn skill docs](https://ui.shadcn.com/docs/skills) were checked; shadcn, Radix and React Aria are alternatives, not dependencies to pile together.

| Source/dependency | Version / license evidence | Decision |
|---|---|---|
| React / React DOM |19.3.0 installed manifest; package MIT | Existing component/runtime foundation |
| lucide-react |1.52.0 local package ISC; [upstream license](https://github.com/lucide-icons/lucide/blob/main/LICENSE) preserves the Lucide/Feather notices | Retain existing outlines; typical16px controls,18–20px navigation,24px meaningful status. Consistent stroke; icons beside labels are decorative/aria-hidden. Standalone icon actions need accessible names. |
| @fontsource-variable/manrope |5.3.0, local package OFL1.1 | Self-host UI text/headings; include required language subsets, font-display behavior and license notices. |
| @fontsource/ibm-plex-mono |5.3.0, local package OFL1.1 | Restrict to numbers/addresses; avoid monospaced paragraphs. |
| Project CSS / native HTML | Existing source | One token vocabulary for all pages. Use semantic native input/select/dialog behavior. |
| Motion/effect/gallery packages | Not in inspected manifest | CSS hover/focus/state transitions suffice. No Magic UI/Aceternity/React Bits or paid template is required. No third-party brand artwork is copied. |

## Component matrix

| Component | Required behavior and states | Responsive / accessibility | Source foundation |
|---|---|---|---|
| Button | Primary, secondary, ghost; idle/hover/focus/pressed/disabled/busy. Action verbs; one dominant action per task. Busy prevents repeat send. | Visible focus, native button type, text label; icon-only controls named. Keep target generous on phone. Disabled reason is visible nearby. | Existing Button + CSS |
| Field/Input | Label, unit/hint, editable/read-only, validation error, retained values. Group related terms, schedule and parties. | Label association, described hint/error, inputMode/type/autocomplete by real data. Multi-error submission focuses linked summary or first invalid field. Single column on phone. | input/textarea/fieldset/legend |
| Select | Issue, network/signer context and known holder options; selected/disabled/focus. | Native select label; long choice may wrap in adjacent summary. Do not lose current issue silently. | select |
| Checkbox | Selected/unselected/disabled with clear text. Use only for a real choice. | Clickable label and native semantics. No pre-ticked legal consent. | input type=checkbox; optional where needed |
| Dialog/Sheet | Exact signing review or transaction detail; open/closed/busy/error. Close/cancel allowed only where safe. | Native dialog/top layer, accessible title, focus entry/restore and Escape. Small-screen interior scroll; primary actions not obscured. API pending lock remains authoritative. | Existing dialog + project focus logic |
| Tabs | Only parallel views of the same task, selected/unselected/disabled. Page navigation stays navigation. | Use links/buttons with accurate semantics, or a full keyboard tab pattern if roles=tab. Never add ARIA tabs without arrow-key/panel behavior. | Existing controls |
| Surface/Card | Group one coherent summary/form/task; avoid nested card piles. | Shrinkable columns, readable text measure, restrained consistent12px surface corners. | section/div + semantic heading |
| Badge | Phase/paid/pending/warning/failed. State expressed in text, not color alone. | Contrast; no fake Live/Production claim. Informative icon may supplement label. | Existing Badge |
| Navigation | Visible current page, consistent labels/icons; issue identity above content. | Persistent dark sidebar desktop, compact reachable nav phone. aria-current or selected state; no hover-only discovery. | nav + links/buttons |
| Alert/Status | Cause, recovery and exact operation state. Error distinct from informational notice. | role=alert for new errors; one polite status region for ordinary progress, no focus stealing. Long failures wrap. | Existing Notice/inline status |
| Table/List | Named columns, exact amounts, holder rights and real statuses/actions. Stable row identifiers. | Header semantics, numeric alignment, local horizontal scroll only if table needs it; do not shrink every column to unreadable text. On phone keep action reachable and full address copy available. | table or meaningful list |
| Skeleton | Loading coherent state; reserve space without guessed values. | aria-busy/loading text; nonessential shimmer off under reduced motion. | CSS placeholder; no new library |
| EmptyState | Distinguish no issue, no rights, nothing due and failed data load. Offer the actual next action. | Clear heading/reason; no zero financial claim for missing data; next action keyboard reachable. | Existing EmptyState |
| Address | Compact display, full copy/details, copy success/failure. Exact string unchanged. | Full text available beyond hover, wrap full addresses with overflow-wrap; copy button labelled. No word-break:break-all on prose. | Existing Address |
| Money | Underlying exact integer/decimal strings preserved; unit explicit in financial context. Unknown stays unknown. | Tabular digits; no floating-point rounding; full precise value accessible where display is shortened. Never label unknown fee0. | Existing exact format/Money |

## Solana state sequence

| State | Visible meaning / permitted next action |
|---|---|
| Disconnected | Connect wallet; read-only inspection may remain. |
| Connected | Public address and actual network/signer mode visible; authority checked for the selected operation. |
| Wrong/unknown network | Explain mismatch; block signing/relay until verified context. |
| Review ready | Exact operation, network, amount/fee and consequences shown before signature. Unsigned expiry requires a fresh review. |
| Awaiting signature | Wallet approval required; no confirmed success. Bounded timeout/rejection must release this UI wait without pretending a transaction was relayed. |
| User rejected | Clear cancelled-signature state; safe return to review/preparation. No issuance/payment success. |
| Sent/pending/unknown | Signature/recovery identifier available; reconcile this operation. Do not offer a duplicate financial send. |
| Chain confirmed / projection pending | Distinguish confirmed transaction from a not-yet-refreshed local view. |
| Confirmed | Actual receipt/signature and financial outcome; Explorer link only for the verified network where supported. |
| Failed | Preserve cause/error details and a safe recovery path. Failure and unknown confirmation are distinct. |

Generated workspace and My wallet remain visibly different signer contexts. One Localnet/Sandbox environment context replaces repetitive testing microcopy. This does not rename immutable on-chain issue terms or turn local outcomes into real assets.

## Checks to perform on the implementation

Use Impeccable Operate and the fresh [Vercel web guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), with focused ui-ux-pro-max search for form grouping, errors, focus and keyboard. React guidance applies to avoiding effect/listener leaks, stable keys and unnecessary loading work; do not add SWR just because one example uses it, or Next.js-only configuration to Vite. Preserve typed supported Lucide imports rather than deep paths that lose declarations.

Build/typecheck and narrow behavior regressions, then inspect the approved widths and actual long amounts/addresses, empty/loading/error, focus/Escape/restore, reduced motion and wallet pending/rejection states. Follow the lead's initial batched visual review plus at most one visual fix confirmation; functional failures remain fixable on evidence. No installed skill or component matrix alone proves these checks passed.
