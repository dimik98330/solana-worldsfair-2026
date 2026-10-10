# Automatic verification scope

10 October2026. The [workflow](../../.github/workflows/backend-verify.yml) runs for pushes to `main`, pull requests, and manual dispatch. It uses read-only repository permissions, pinned checkout/setup-node commits with persisted Git credentials disabled, a branch/PR concurrency group with cancellation, bounded job timeouts, and disposable runners/services. It does not deploy, fund wallets, access hosted databases, submit applications, change repository visibility, or upload `.local`/signer artifacts.

The native Linux job retains `scripts/ci-verify.sh`: Node22.14.0, Rust1.91.0, Agave3.1.10 and Anchor1.1.2; locked dependencies without install lifecycle scripts; application typecheck/Vite build; SBF build and frozen release check; client/UI tests; Rust unit and SBF/SPL runtime tests. A75-minute cold-run cap covers tool installation and compilation. No successful GitHub run is claimed merely from this workflow edit.

A separate15-minute job uses the repository's existing PostgreSQL16.15 fixture, a synthetic public test credential, host127.0.0.1 port32545/database `bondtrace_tests`, and a1CPU/512MiB service cap. It calls `npm run test:postgres`, whose wrapper refuses other endpoints and executes destructive schema/fault cases sequentially. This plain isolated fixture runs real database persistence, acknowledgement-loss and recovery checks. Its three TLS handshake cases are explicitly skipped unless a matching local TLS fixture and test CA are supplied; this job does not establish hosted TLS verification. The existing recorded TLS-enabled cohort remains historical evidence with its own cutoff.

The storage regression no longer requires SQLite to remain experimental forever. A bare `node:sqlite` import in the same runtime is the warning baseline. When that baseline emits `ExperimentalWarning`, the storage child must leave it visible. When it does not, the same exact persistence/rollback/crash/concurrency/backup checks still apply. This neither suppresses runtime warnings nor substitutes warning text for durability evidence.

Repository Actions enablement, fork policy and account runner-minute availability are outside a YAML edit. The first actual GitHub run must confirm dependency/tool download availability, cold compilation time, frozen SBF reproducibility and PostgreSQL image startup. GitHub run URLs/results should be added only after observed completion; local checks and old run counts must not be presented as current CI success.

Official references checked10October2026: [workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency), [PostgreSQL service networking](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers), [Node SQLite API history](https://nodejs.org/api/sqlite.html). The unchanged application/tool versions remain project-pinned; this task does not upgrade them.

## Observed run,10 October2026

[Run38010713994](https://github.com/dimik98330/solana-worldsfair-2026/actions/runs/38010713994), source4e5dafa9098e2c9bfea845aa7f452b14375b4d82, completed successfully. Native job114089816983 ran00:49:51–01:02:41UTC: full Node362total/352pass/0fail/10optionalPGskip; UI90pass/0fail; integration-verifier command passed; Rust3unit/20runtime passed; actual rebuilt959536B SBF matched ee2bb0f7eef91f04722b4b9f834d58d3bc4dc2fc3f76905dfc1d7521f8f1ee12. The separate PostgreSQL job114089817078 completed43total/40pass/0fail/3TLSfixture skips. Local failed/partial runs remain separately retained; this does not certify public v4 deployment, ordinary Phantom, bank/KASE integration or production security.


## Source cleanup and report verification, 10 October 2026

Actual [run38019153339](https://github.com/dimik98330/solana-worldsfair-2026/actions/runs/38019153339), source5678433fcc0ae4ebbee1bedc03b6af0dce6ee63a, **completed successfully**. General job114116051462:366 Node total/356passed/0failed/10optional PostgreSQL skips;90 UI passed/0failed;3 Rust unit/20 compiled-SBF runtime passed. Rebuilt959,536-byte SBF again matched ee2bb0f7…8f1ee12. PostgreSQL job114116051304:43total/40passed/0failed/3TLS-fixture skips.

[Version-bound summary](../evidence/source-cleanup-ci-20261010.json) retains downloaded-log digests, source identity and limits. Four new CLI cases cover the repaired offline report; they also passed in source-only staging without archived ledger fixtures. Historical evidence/report bytes remain unchanged. This run does not upgrade public v4, verify ordinary Phantom, prove bank/KASE partnership or accept a contest submission.
