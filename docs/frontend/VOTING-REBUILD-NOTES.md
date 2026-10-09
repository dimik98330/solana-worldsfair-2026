# Voting rebuild — 9 October 2026

Surface mode: **Operate**. This focused replacement responds to the owner's supplied Voting screenshot: small working text/icons, ambiguous clickability, a sparse stretched result panel and unclear action logic. The BondTrace dark navy system and original proposal subject remain authoritative.

## Scope and narrow plan

ProofPilot **coach**, `plan -> review`; domains web2/web3, existing hackathon application, confidential local source. No market research, scoring, account setup, external write, transaction or program change is needed for this local UI decision.

1. Show the original proposal subject, explicit open/closed status and a contained inspection button.
2. Keep exact yes/no/not-cast bond weights separate from total eligible bonds and unique voting accounts. Use three useful broad-screen lanes: results, deadline/rights context, permitted action. Reflow the deadline context beneath results/actions at intermediate widths and prioritize an open ballot on phones.
3. Give each ballot state its appropriate next step: closed/voted -> receipts; no account/no rights -> account menu; unknown/network unavailable -> refresh; eligible -> explicit review-for/review-against. Saved snapshots never permit a ballot.
4. Let the lead integrate the shared control vocabulary, build once and inspect the changed state/viewport matrix. Independent review findings determine one repair batch, followed by confirmation.

Ownership: `apps/web/src/VotingWorkspace.tsx`, new `apps/web/src/voting-page.css`, this note. Shared CSS, App, models/format/types, backend, wallet, dependencies, config and Git remain outside this lane. New optional `onConnect` and `onRefresh` callbacks require the lead's existing account/read-again wiring.

## Implemented

- 24–26px original subject, 17px body, 16px working labels, 28–32px Manrope tabular bond weights; one Lucide family at 20/22px and stroke2.
- Explicit outlined `Inspect details` and contained `View vote history`/recovery/account controls replace the ghost receipt link and native triangular technical summary. Native broad-screen results stay bounded to a720px lane while the event panel fills the workspace.
- The inspection uses existing native `Overlay` and `Address`: exact deadline with seconds, display timezone, original UTC value, proposal ID, network/archive scope, saved capture time, rights record address and signing account when selected.
- `cast_vote` keeps its exact proposal ID/choice request, original subject in review explanation, fixed weight, eligible/not-voted/not-closed/canAct guards and cannot-replace statement. Archive/disconnected checks additionally fail closed. A click only queues the existing review; it does not sign or send.
- Empty proposals, unavailable network, unknown weight, no rights, no account, eligible account, already-voted and closed states have distinct copy/actions. Result data remains visible during unavailable action states.
- No result winner, quorum, majority approval, chart, fabricated ballot, presentation content or decorative animation is introduced.

## Skills actually read and applied

- Project `impeccable/SKILL.md`; context command succeeded once for VotingWorkspace; Operate, clarify and craft-floor references. Replacement serves the task and preserves content/financial truth.
- Installed ECC2.2.3 `frontend-design-direction`, `make-interfaces-feel-better`, `frontend-a11y`: meaningful layout constraints, native buttons/dialog, clear control boundaries, stable tabular figures, adequate targets and shared native overlay behavior.
- Project `frontend-design-guidelines` with layout, interactions, states and Solana UI references; existing `brand.md` read. Existing React/CSS, exact units and review remain the foundation; owner full-width/Manrope instructions override generic width/mono defaults.
- Project `react-best-practices` with derived-state-no-effect and conditional-render rules: ballot facts derive from current props; local state only controls inspection.
- Project `web-design-guidelines`; current official rules fetched 9 October 2026 from https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md for native semantics, focus, hit targets, long content and date handling.
- Project `proofpilot` with routing, plan, review, safety and scoped implementation route: bounded local product decision, no fresh idea selection or external claim.
- During the exact-u64 repair: installed `number-formatting` plus formatting-spec, implementation-guide and review-checklist references. Existing integer `units` remains authoritative; owner requirements override generic abbreviations/float helper/mono defaults. No numeric conversion, rounding or abbreviation was added.

Mandatory continuity rule: before substantial follow-up, read AGENTS/START/STATE, then select and read appropriate **actually installed** SKILL.md and required references. Carry the same rule, ownership boundaries, chosen skills/results and stopping gates into every agent handoff/new chat.

## Verification cutoff

Source checks after the initial implementation:

- `npx tsc --noEmit -p tsconfig.web.json`: passed.
- `node --import tsx --test apps/web/src/voting-model.test.ts`: 3/3 passed; existing exact weight, zero/invalid eligibility, voted/closed and inconsistent remainder coverage.
- `git diff --check -- apps/web/src/VotingWorkspace.tsx apps/web/src/voting-page.css`: no whitespace errors.
- Manual source review: original title and exact helper/payload preserved; old shared voting stylesheet untouched; no non-semantic click targets or added dependency.

The first integrated actual browser render exposed a legacy `styles.css` class collision: `.vote-results` applied an old two-column grid to the new results container. The owned markup and every responsive padding selector now use the unique `.vote-tallies` container; `.vote-results-table` remains unchanged. Table and participation regain their intended vertical flow without editing shared CSS or adding overrides. This evidence-driven correction precedes the full matrix.

The first full state/width matrix passed ordinary voting states/design, then IR09P2 identified an actual390px exact-u64 fixture rendering `18,446,744,073,709,551,615` across lines with a leading comma. A shared local `VoteWeight` display now keeps every formatted integer on one unbroken line, reduces formatted values longer than14characters to24px desktop/20px phone, preserves complete raw value in title/accessibility and allows local horizontal scrolling with keyboard focus. It covers yes/no/remaining/total-eligible/recorded-account weights. Long participation values get a full-width label/value stack rather than expanding the grid. Ordinary weights retain the32/28/22 hierarchy. This intentionally permits **local numeric scrolling** for extreme values; it does not permit page overflow or imply abbreviated/rounded values. Lead recapture of390/320 exact-large and normal Voting is pending at the repair's source cutoff.

The lead owns one integrated detector run, build, browser input, reviewed screenshots at320/390/768/1440/2560, dialog Escape/focus return, EN/RU and ballot state matrix. Full rendered results are **pending at this lane's source cutoff**, and source/type checks do not establish design acceptance or live signing. No build/dist mutation, wallet signing, chain transaction, commit or push performed by this lane.
