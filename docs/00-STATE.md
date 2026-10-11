# BondTrace — release checkpoint, 11 October 2026

## Active task

Владелец разрешил проверку ProofPilot, уборку GitHub, обновление README и существующего сайта. Рабочая интеграция: `C:\Users\dmitrii\.codex\worktrees\bondtrace-release\solana`, ветка `codex/bondtrace-release`, основана на `origin/main` `83ea45b`. Исходный Root `C:\Users\dmitrii\Documents\solana` и backend worktree сохранены; Root нельзя публиковать целиком: он отстаёт и содержит уже удалённые исторические документы.

## Integrated source

- Latest Root Settlement Workspace, KK/RU/EN, timezone/calendar settings and responsive source merged with current backend safety fixes.
- Origin full-wire Phantom v0 signing and exact returned-message/signature checks preserved; Root's older signing implementation was not copied.
- Fully configured/reserved late draft activation by any fee payer; cutoff still freezes issuance/registry. Holder zero-entitlement controls suppressed; principal review states exact burn quantity/mint; pending snapshot routes to continuation.
- Compiled SBF: 960296 bytes, SHA256 `257a89b28a427863b4ed8adf26eaaed868f15d8d7a290970200f9cc81a33106c`.
- Existing published cleanup preserved:108 obsolete Markdown already absent. Only unused NextActionDesk/action-desk source and its isolated test removed. Working tests and historical proofs retained.
- English/Russian README shortened around required scenarios, exact math, reproduction and verifiable evidence.

## Checks in this integration

Actual local checks: build/typecheck;399Node passed/0failed/10optionalPGskips;107UI passed;3Rust unit +22SBF/SPLruntime passed. Program rebuilt to the expected hash. Node totals identify this run and do not include later separately checked RPC-pacing changes. Build warning:592.6kB JS/169.43kB gzip; no new production dependency.

Built UI against existing matching localnet API9009/3220, through read-only4230:30route×width checks at320/390/768/1440/2560 without horizontal overflow; actual screenshots inspected. This is localnet/GET-only evidence, not a public deployment or human-wallet signature. Private logs/screenshots: `.local/release-20261011`.

ProofPilot coach plan→review→submission preparation; Solana-dev/security, ECC deployment guidance, Impeccable harden/craft-floor, frontend guidelines, React and persistent browser QA. Disjoint UI integration and BUFFER recovery implementation; fresh independent BUFFER review reproduced40/40 targeted tests with no substantiated material finding. Final README quality review and deployment verification remain pending.

## Deployment work in progress

GitHub identity verified live as `dimik98330`; repository1409138286 is already public. Render remains free, auto-deploy off, previous source `e658553`. Public program still v3 at preflight; do not deploy mismatched service or alter its release guard.

Existing devnet buffer `CxKhsyd9Uc8xb2Thm7Tu2dahBWGGeAZr5drw9GDp82HB`, operation `v4_257a89_upgrade_20261011`, is resumed using its ORIGINAL exclusive SQLite journal in backend worktree. Old expired write is preserved; explicit BUFFER-only retry appends a linked attempt after finalized expiry/history/account checks. Full readiness requires finalized exact bytes/hash. Test-only fee cap7500000lamports; no new buffer or rent requested. Program upgrade is a separate later verified action.

Next: finish same-buffer upload, verify exact finalized image, controlled devnet program upgrade, deploy matching reviewed commit on existing Render/Neon namespace, verify existing completed issue and new frontend/public readiness. Keep all retained IDs/wires/receipts. README/deployment records must reflect actual outcome, not intent.

## Stopping gate

No mainnet, real assets, paid service, new binding consent, messages to people or final contest submission. Ordinary Phantom execution, registration, final video URL and accepted submission are not established by source tests. No history rewrite or force-push. Preserve Root/other worktrees, original ledgers, databases and ignored keys. Historical checkpoint: [83ea45b](https://github.com/dimik98330/solana-worldsfair-2026/blob/83ea45b693aa450b9921ce617237b0596c75081d/docs/00-STATE.md).
