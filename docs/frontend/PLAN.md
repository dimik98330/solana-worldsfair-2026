# Frontend implementation plan

Scope: actual issuer/holder app, desktop first; preserve all contract and transaction behavior. Later update the judge release from the verified source. User approved light cabinet + dark navigation; full redesign proceeds under this approval, overriding the pasted preparation-only stopping point and earlier UI-expansion stop.

1. Install/verify named design guidance and reference provenance; keep existing ProofPilot support. No hooks or global changes.
2. Build consistent core components/tokens/type, sidebar/context controls, accessible overlays/states. Lead owns dependencies and action logic.
3. Rework issuer workflow: clear creation/registry/placement/reserve/activation hierarchy, compact forms, exact summary.
4. Rework overview/registry/payments/portfolio/voting: meaningful totals and tables, next-action guidance, understandable unavailable controls, no decorative fabricated charts.
5. Integrate wallet timeout/cancel/recovery, preserve exact signing review and pending lock. Human owner signs; no secrets are inspected.
6. Build and narrow regressions, batched desktop/tablet/mobile screenshots and keyboard/focus/errors. Independent finish review +one fix batch/confirmation maximum; persist DESIGN.md and implementation tokens.
7. Refresh source-only judge package, reproduce on a clean SQLite namespace, publish only safe approved judge artifacts; main registration/consent/devnet funding remain separate owner gates.

Ownership: lead App.tsx/action/API/wallet/font/deps/Git; core-design worker styles.css/components.tsx; issuer worker IssuerSetup.tsx/issuer.css/NextActionDesk.tsx; reference worker docs/frontend references/setup/components only. No concurrent lockfile, config, browser viewport or shared file edits. Every agent must read AGENTS/PRODUCT/BRIEF and relevant installed SKILL.md before substantial work, including ProofPilot for product decisions.
