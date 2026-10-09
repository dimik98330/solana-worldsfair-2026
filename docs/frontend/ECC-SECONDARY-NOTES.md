# ECC secondary frontend redesign — 8 October 2026

Scope: only `apps/web/src/HolderPortfolio.tsx`, `VotingWorkspace.tsx`, `voting-workspace.css`, `ReceiptDetails.tsx`, `InterfaceSettings.tsx`, and this note. Backend/program/client/contracts, shared styles/components, dependencies, Git and runtime belong to the lead/other agent and were not edited here.

## Direction and implementation

Operate mode, inherited from the lead's committed dark financial workspace. The user explicitly asked to proceed without questions; preserve product truth, signing permissions and exact financial values. The distinctive detail is aligned, labeled financial records rather than promotional or decorative content.

- Portfolio: compact selected-holder identity and account selector; a single current-position strip; recorded payment rows with both record and payment instants, exact amounts, entitlement state, detail access and original claim/transfer gates. View-only selection remains independent of signer authority.
- Voting: exact recorded result table and a compact deadline/ballot inspector; accessible For/Against actions retain the original action/params and are localized in transaction-review copy. Unavailable account weight remains unknown rather than displaying a fabricated zero. Mobile open ballots move before result totals for immediate access; closed ballots retain results first.
- Payment detail: beneficiary, exact quantity/per-bond/total breakdown, separate exact dates and timezone, confirmation scope, bounded existing proof enrichment and direct portfolio/receipt navigation. Loading has a static placeholder, no decorative animation. A paid entitlement with unavailable matching history remains explicitly distinct from a matched transaction.
- Receipts: stable operation title, exact date/time, confirmation state and expandable full transaction address. Evidence verification language remains unchanged.
- Settings: labeled native language/timezone selectors, consistent Lucide icons, date preview and explicit statement that display preferences do not change canonical scheduled times.

CSS uses shared tokens only. Figures use Manrope tabular numerals; clocks and addresses retain the existing mono treatment. Scoped selectors avoid order conflicts with `main.tsx`'s later shared stylesheet imports. Large screens retain full available workspace with bounded payment tracks. Mobile/320px layout is explicit in CSS; no visual result is claimed from source alone.

## Skills actually read

- Impeccable: `SKILL.md`; `context --target apps/web/src/HolderPortfolio.tsx` ran once; `reference/new-work.md`, `operate.md`, `craft-floor.md`. The lead owns the central direction seed and integrated bounded browser/detector passes.
- frontend-design-guidelines: `SKILL.md`; layout-and-design, interactions, states, solana-ui-patterns references. Existing brand/DESIGN is authoritative over generic width/number defaults.
- vercel-react-best-practices: `SKILL.md`; retained derived state and existing explicit imports without new dependencies or fetch waterfalls.
- web-design-guidelines: `SKILL.md` and fresh official rules at https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md (accessed 2026-10-08); labels, native actions, details focus, dynamic status announcements, tabular figures, long-content handling and dark native selects reviewed.
- number-formatting: `SKILL.md`, formatting-spec, implementation-guide and review-checklist. Project exact amount policy supersedes approximate dynamic-decimal/abbreviation examples; shared `Money` and raw BigInt-backed helpers are reused unchanged.
- ProofPilot: coach mode, scoped `plan -> implementation -> review`; routing/plan/review read. Goal is a clearer existing operating application, no new venture/competition assessment, market claims or scoring.
- Installed ECC2.2.3: `frontend-design-direction/SKILL.md` and `frontend-a11y/SKILL.md` at `C:/Users/dmitrii/.codex/plugins/cache/ecc/ecc/2.2.3/skills`; applied quiet repeated-use hierarchy, real controls, connected labels, consistent icons and responsive field constraints.

## Checked and limits

`npx tsc --noEmit -p tsconfig.web.json` passed. Existing scoped receipt-match/voting-model/time-zone tests: 14/14 passed, no skipped tests. These verify exact entitlement matching, viewed-account/signing separation, voting rights/unknown values and canonical timezone behavior; they do not establish visual acceptance or full signing proof.

No browser viewport or application runtime was mutated by this worker. The lead owns real input and reviewed screenshots at 390/768/1440/2560 plus overflow320, integrated detector, final build and the top-level DESIGN/STATE updates. No local signing, chain mutation, publishing, account messages, paid calls, credential access, install, commit or push occurred.

Continuation: before any substantial task read AGENTS.md and select/read actually installed suitable skills and required references. Preserve disjoint ownership, original backend ledger/signers and all exact monetary/signing semantics; carry this rule into every handoff/checkpoint.
