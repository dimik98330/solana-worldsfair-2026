# Assessment A — independent rejection diagnosis

8 October 2026. Independent design assessment before implementation. Target: `C:/Users/dmitrii/Documents/solana/apps/web/src/App.tsx`, Payments and the shared shell. Mode: Operate. This is Assessment A only; Assessment B/detector output was not seen. The latest owner rejection is contrary evidence to previous positive review, so previous finish verdicts are not design authority. No aggregate quality or competition score is asserted.

## Context and evidence

Read AGENTS.md, CODEX_SOLANA_WORLDSFAIR_START.md, docs/00-STATE.md, PRODUCT.md, DESIGN.md, frontend BRIEF/PLAN, current App.tsx/styles.css and focused IssuerSetup.tsx/issuer.css. The working tree is extensively dirty and shared with backend work; this agent owns only this report. Latest commits inspected: e416f72, 99b5c6d, 91a1d64. App.tsx SHA256 at inspection: `BD8B68CB98ADFBDF132E310F382BD6A3650FB26753B82315872448A085712885`.

Actually loaded skills: project-local Impeccable (SKILL, critique Assessment A/cognitive-load/heuristic references, new-work, operate, mode-operate), ProofPilot (SKILL, routing, plan, review), ui-ux-pro-max (SKILL, focused UX rules). Impeccable context command succeeded once. ProofPilot coach context: bounded plan → review; web2/web3; existing KASE hackathon product; private source stays local; scope is interface comprehension, not new demand/eligibility assessment. UI UX Pro Max search was attempted but `python` is absent from PATH; no install was made. Its loaded guidance was used directly. No React code or technical accessibility audit was performed, so those specialist checks remain with the implementation/Assessment B roles.

Visual evidence actually viewed:

- `.impeccable/review/navy/native-wide-overview.png`, file timestamp 08 October 11:51:14, 2550 × 1409 source pixels.
- `.impeccable/review/navy/mobile-payments.png`, file timestamp 08 October 11:48:48, 380px image width.
- Initial own IAB tab attempt at `http://localhost:3000/?view=payments` returned `net::ERR_CONNECTION_REFUSED`. After the lead restored the origin, IAB visibility was unavailable in a subagent, so an own new Chrome tab `321324096` opened `http://127.0.0.1:3000/?view=payments`. Live AX and full native-wide screenshot were inspected at displayed chain-read time 08 October 12:03:31 GMT+5: localnet, selected BondTrace Test Series, three paid holder rows, recorded900/paid900/remaining0, disabled Add reserve, and a connected external wallet. No viewport override or action was performed. The live 2560px-wide composition confirms the screenshot/source diagnosis; payment scope/date is absent, figures and columns are excessively separated, and the first recipient begins approximately y755 on desktop. Existing historical phone evidence remains the mobile basis.

Source still contains the observed shell, three payment metrics, payout tabs, reconciliation and mobile stacked table pattern. Live read verifies their presentation, not successful new transactions or backend financial correctness. No process was started, stopped or restarted by this agent. No financial action, signature, API mutation, browser viewport change, external reference access, dependency or Git mutation occurred. No Linear/Mercury private UI is claimed to have been seen.

## Verdict

The interface has recognizable financial content but a generic panel-dashboard composition. The problem is not a missing palette or icon pack. Too many surfaces have the same weight, factual repetition precedes the task, and available width increases distance between related facts. The result feels simultaneously empty on desktop and long on mobile. Dark navy, existing SVG lettering and Lucide can remain while the layout changes materially.

The product-specific mechanism should lead: **select a fixed payment entitlement, inspect who is owed exactly what, see what remains, then take the one operation authorized for the current role and state.** Current Payments instead begins with account explanations and reserve metrics; the entitlement is treated as a secondary report.

## Five high-value changes, ordered

1. **Move the payment object above account mechanics.** The mobile capture spends about 262px on brand/navigation, environment/language and issue/wallet context. Payments title, another Settlement account title, two explanatory paragraphs, disabled Add reserve and three metric rows follow. The first recipient starts around y1120. Collapse shell context and give the selected coupon/principal, record/payment dates and remaining amount the first task region. Keep one page title. The payout table must begin in the first mobile viewport after essential context, with its first recipient visible in a normal 390 × 844 check. This is a proposed acceptance target, not a measured result.

2. **Make action hierarchy state- and role-specific.** Payments currently gives Add reserve the only prominent action near its top, even for a settled issue or a viewer who cannot use it. An unexplained disabled control is not guidance. Place one contextual operation beside the payment status: eligible issuer capture/open redemption when allowed; connected holder View my claim linking to the existing portfolio; disconnected viewer Connect wallet only when they seek an action. Explain the existing blocking predicate in one nearby sentence. When fully settled, show the confirmed outcome and a secondary receipt link; do not manufacture a next task or imply the issuer can pay holders directly. Preserve every existing signing review and permission predicate.

3. **Replace full-width card stretching with work-area division.** The wide Overview has a lifecycle rail, a large issue panel, a near-equal-height completion panel, a large metric strip, a reconciliation panel and activity panel. Similar fills/borders make all regions equally important, while small text is separated by large blank areas. Use the full available workspace for a broad payment register plus a compact right inspector for reserve/issue facts and relevant receipts. Let the register grow; keep related scalar values close to their labels. This is not a reinstatement of 1360/900px caps. A roughly 340–400px inspector is a local secondary column, not a maximum width on the main content. At intermediate width, put inspector content below the main task; on phone, expose it through a labeled details disclosure.

4. **Establish one numeric hierarchy and show the payment scope unconditionally.** Three prominent zeros above a paid 900/900 reconciliation require the reader to infer that the metrics and register describe different concepts. The coupon selector only appears when multiple captured coupons exist, so one-coupon state lacks an explicit period control in the heading. Always name the selected payment and its dates even when selection is unnecessary. Lead with remaining entitlement; present recorded and confirmed paid as adjacent subordinate exact values. Reserve balance and principal obligation belong to the issue inspector, with their own scope labels. Retain tabular numerals and exact formatting; do not add a currency symbol, fake liquidity chart, rounded amount, or cumulative label unsupported by the data.

5. **Compress records by meaning, not by shrinking type.** Mobile recipient rows spend about 190–200px each: ordinal block, name/address, separate bonds/allocation grid, then a lone Paid pill. Replace with a compact two-level record: holder/name and allocation on the first line; shortened address and textual status on the second; recorded bonds as quiet associated metadata. Full address remains accessible by the existing copy/detail mechanism. Remove decorative row ordinals when order has no business meaning. Keep action targets comfortably touchable. Desktop uses aligned columns with right-aligned money and quiet row separators, not another card per fact. This improves density while preserving readable 14–16px operational text.

## Concrete replacement structure

### Shared shell

- Retain the original path-drawn BondTrace lettering and dark navigation. Sidebar groups issue work (Overview, Issuer desk, Registry, Payments) separately from holder work (My portfolio, Voting); this supplies role meaning to the current six equal peers without deleting a route.
- One compact top context region: selected issue on the left; compact truthful network, signing account and EN/RU controls on the right. Page location is supplied by the page title and selected navigation; a separate Workspace breadcrumb need not occupy its own row.
- One page heading, with receipts as a secondary action. Technical freshness remains one quiet, truthful context line/detail, not repeated beneath every metric.
- On mobile, brand/menu and compact environment/account controls should fit in a short header; issue selection occupies one full-width row. Do not hide network/signing truth or make the language switch inaccessible to attain a height target.

### Payments desktop

```text
Sidebar | Issue selector                         Network / account / EN-RU
        | Payments                                           Receipts
        |
        | MAIN WORK AREA                         | ISSUE INSPECTOR
        | Coupon / Principal tabs                | Reserve & obligations
        | Selected coupon and record/payment date| Exact balance + labels
        | Remaining amount · status              | Add reserve, if relevant
        | Recorded / Confirmed paid              | Scope / issue details
        | One relevant action or blocking reason | Relevant confirmations
        |----------------------------------------| (secondary, compact)
        | Holder | recorded bonds | amount | state
        | real entitlement rows
```

The inspector contains existing facts/actions. No new backend capability, record filter, search index or fabricated data is needed. The signature is the exact reconciliation attached directly to the entitlement list: the relationship between recorded rights, confirmed paid and remaining is always legible. The three figures should behave as one equation-like group, not three unrelated KPI tiles. A real progress bar may be retained as secondary status, but the amount and textual outcome carry meaning.

For no snapshot, the primary area becomes a compact record-date explanation plus the eligible operation and reason if unavailable. For principal unopened, show maturity beside the existing operation. For unknown RPC, show unknown values and recovery; never substitute zero. For fully paid, keep the data and clear settled state. For pending/unknown signature, preserve the existing blocking recovery message above the actionable region. These cases use the same main grid rather than unrelated giant empty-state cards.

### Payments phone

Compact header → issue row → Payments → Coupon/Principal tabs → selected payment/date → remaining + paid/recorded summary → applicable action/reason → compact recipients → Reserve and issue details disclosure → receipt link/freshness. Do not place three general issue metrics ahead of recipients. Do not convert every metadata value into another full-width panel. A brief explanation of one-time claims belongs in contextual help or the operation review, not a full repeated notice after every paid register.

### Overview and issuer propagation

Overview becomes a route into the active duty and an issue summary, not a second copy of the complete payout registry. Keep current status/dates, exact reserve relationship and recent confirmed activity; reduce the five-stage rail to a compact lifecycle detail when it does not help the next action. The issuer creation screen retains Terms → Schedule → Review and its actual controls. Apply the same shell, section hierarchy and grouped fields; do not reinterpret signed terms or expand scope into a new form library.

## Cognitive-load assessment

Four clear failures on the supplied payment state: single focus, visual hierarchy, one thing at a time, progressive disclosure. Chunking is mixed: three metrics are a reasonable group, but six equal navigation destinations and five lifecycle stages exceed the reference's ≤4 cue without meaningful subgroups. Grouping inside reconciliation is a strength. Working memory is a partial failure: the reader has to connect zeros above with paid 900 below and infer the selected payment period. No claim is made that six navigation entries alone prove unusability; the greater issue is their undifferentiated task roles.

Emotional journey: start with lots of controls before the work; encounter an unavailable Add reserve without local explanation; finally reach exact payment evidence. This creates uncertainty at the point where a financial tool should reassure. The ending has a generic one-time-claims notice rather than a specific concise confirmed outcome. Proposal: lead with current payment/status, explain authority at the action, end with actual receipt access. Never celebrate an optimistic send as settlement.

## Heuristic guidance, not certification

Scores are provisional design guidance on a 0–4 scale. Visual confidence is medium-high after live native-wide confirmation; interaction confidence is low because no action/signing tests were performed. These are not measurements of task success and must not be aggregated into an official grade.

| Nielsen heuristic | Guidance | Evidence and limit |
|---|---:|---|
| System status visibility | 2 | Network, paid statuses and exact reconciliation exist; status competes with several generic surfaces. Pending behavior was only source-read. |
| Match to real-world task | 2 | Bond/holder/payment facts are concrete; Settlement account, Recorded rights and payout scope require translation. |
| User control/freedom | 2 | Tabs, cancel/review and language controls exist in source; live cancellation/navigation not retested. |
| Consistency/standards | 3 | Shared navy controls, Lucide family and tabular figures are consistent; desktop and mobile produce very different density. |
| Error prevention | 2 | Permission/date guards and signing review exist; unexplained disabled payment action obstructs understanding. Runtime correctness not reverified. |
| Recognition over recall | 2 | Data labels help; selected payment scope and role-to-action mapping are insufficiently local. |
| Flexibility/efficiency | 2 | Direct routes and tabs exist; excessive vertical preamble and repeated detail slow the main scan. |
| Aesthetic/minimalist design | 1 | Equivalent large panel treatments and duplicate explanatory headings obscure priority. |
| Error diagnosis/recovery | 2 | Source includes read-again and pending-operation recovery; useful, but unknown live layout and behavior. |
| Help/documentation | 2 | Considerable explanation exists, but placement is repetitive rather than task-specific. |

Strengths worth retaining: exact financial values and confirmed-state semantics; consistent icon/control family; meaningful real data with no invented business success. Persona red flags: novice issuer cannot distinguish funding from payment execution; holder sees an issuer-oriented disabled action before their own path; returning operator scans multiple summaries before recipients. Minor observations: receipt entry appears in sidebar and page heading; date appears twice in Overview maturity; completed lifecycle remains equally prominent after settlement.

## Handoff and bounded next check

Lead should synthesize with isolated Assessment B, then implement one coherent layout repair. Validate one desktop/native-wide and one phone batch using real existing data, plus offline/no-snapshot/unauthorized/pending states where safely available. Acceptance: selected payment and dates explicit; exact amount relationship understandable; one applicable action or reason; recipients visible early on phone; no full-width main cap; correct focus/keyboard behavior; unchanged arithmetic, permissions and signing semantics. Limit to one evidence-driven correction and one confirmation batch for this visual repair; do not reuse old positive verdict as acceptance.

Questions for parent synthesis, if owner input would materially affect the final concept: (1) should desktop Payments lead with the recipient register or a selected payment detail and recipient register side by side? Recommended here: register plus compact issue inspector. (2) should holder work be a separate navigation group or a workspace-role switch? Recommended here: simple groups, because a new role switch adds state and confusion. This agent does not ask the owner separately; the parent owns the critique close and already-authorized implementation scope.

Mandatory continuation rule: every substantial continuation and agent handoff must read AGENTS.md and select/read appropriate actually installed skills and references before work, report those skills, preserve assigned file ownership and current stopping gate. No public visibility, submission, consent, mainnet, real funds, signer/ledger changes or dependency installation is authorized by this report.

## Implementation handoff — pure PaymentsWorkspace

Later on 8 October the lead assigned this agent only `apps/web/src/PaymentsWorkspace.tsx`, `apps/web/src/payments-workspace.css` and this implementation note. Added a pure named-export component with the agreed props contract; App integration and permissions remain lead-owned. Main register now precedes the 340px issue inspector in DOM/layout, selected coupon/record/payment dates remain explicit, and a compact exact remaining/recorded/confirmed-paid group replaces the decorative percentage bar. Mobile uses compact recipient rows and moves the reserve/holder inspector below the register. No overall width cap, hardcoded color, state fetch, mutation or transaction handler was added. Local operational strings use inline English/Russian translation; shared Money retains its existing raw-precision tooltip/accessibility behavior. Unknown/offline values remain undefined, never zero. Existing date and BigInt formatting helpers are reused.

Before implementation reused Impeccable context/product directions and read craft-floor; loaded frontend-design-guidelines with layout/interactions/states/Solana UI references, vercel-react-best-practices, number-formatting and current brand.md. Explicit project full-width and exact-unrounded-number requirements override generic skill container caps/number abbreviation defaults. This static component uses render-time derived values and existing React/CSS controls; no effect, dependency or component-library migration is needed.

Checks: isolated TypeScript compilation of PaymentsWorkspace and its imports passed with the project-equivalent strict/ES2022/Bundler/react-jsx settings. Full `npm run typecheck` was attempted during concurrent lead integration and reported incomplete JSX around App.tsx217; this agent did not edit App and notified the lead. Source review checked props, exact subtract/undefined behavior, translation branches, DOM order and token-only colors. Browser and viewport are lead-owned for the integrated batched visual pass; no mobile height/contrast or financial execution result is claimed from this implementation alone. Lead should pass table/guarded empty/actions as children, without the former Reconciliation/Panel wrapper, and validate the completed integrated screen.
