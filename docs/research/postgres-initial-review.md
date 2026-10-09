# Independent PostgreSQL / relay review — initial pass

Review cutoff: 2026-10-09T13:40:03Z. Root: `C:\Users\dmitrii\Documents\solana`. Reviewer: separate-context `postgres_security_critic`. Mode: ProofPilot **coach**, scoped engineering/readiness review, decision context general. No official/application score or desired positive verdict. Initial review; up to two evidence-driven repair reviews remain. The earlier HOST/H1 and Windows long-path incidents are separate preserved histories.

**Conclusion:** the inspected acknowledgement-loss path fails closed and retains the exact signed recovery data, but the requested fresh fencing immediately before private signing is incomplete (PG01). Two smaller reachable error/configuration defects are PG02/PG03. No duplicate relay, secret disclosure or destructive migration is established by this read-only review. Fix these bounded items and retain their regression evidence before describing the PostgreSQL preparation as complete. Live Render/Neon deployment, provider restart and human-wallet execution remain outside this review and require the later owner-assisted hosting stage.

## Scope and method

Read actual `AGENTS.md`, START, current STATE/backend focus and supplied implementation checkpoints. Applied installed project ProofPilot/readiness instructions (coach review, quality/evidence/safety boundaries), project solana-dev/security, ECC security-review and production-audit. No installation, source change, test/build/Git command, service/network/browser/account action, credential file/key/.env read or connection descriptor dump occurred. This note is the only reviewer-written file. Formal quality-helper acceptance and a production certificate are not claimed; the assignment explicitly bounds this work to source/evidence inspection.

Inspected engine/types, pure document state, policy, Worker/bridge, facade, backup, storage dispatch, configuration/hosting policy, RPC/transactions, rebroadcast, hosted entrypoint/API routes, relevant PostgreSQL test sources, available redacted logs and hosting/README claims. Current source inspection, not old memory, supports every finding below. The old memory registry supplied only continuity/evidence-boundary context.

## PG01 — P2: writer check precedes asynchronous waits, so replaced writer still signs

Locations: `server/transactions.ts:39`, `:41–50`, `:52–56`; fresh fence implementation `server/storage.ts:306`, `server/postgres-document-store.ts:47`, `server/remote-postgres-engine.mjs:327–332`.

`buildTransaction` verifies writer ownership once at entry. It then awaits release verification and `getLatestBlockhash` before the first `partiallySignTransactionMessageWithSigners`, and awaits simulation before a second signing invocation. Ownership can change while either RPC is outstanding. A newly committed second writer fences the first engine only at its next primary check; there is no check at either crypto boundary. Therefore a stale writer holding a real `KeyPairSigner` still invokes private signing, despite the assigned fresh-fence-before-crypto contract.

Deterministic reproduction to add: start writer A and enter `buildTransaction` with an instrumented real test signer; during its mocked `getLatestBlockhash`, have writer B claim/commit the same PostgreSQL namespace, then release the RPC. A currently reaches the first signer. A second case transfers ownership during `simulateTransaction` and counts the subsequent signing call. This sequence is statically reachable; this reviewer did not execute it. Hosted demo=false normally uses external wallet/no-op signers, so the directly affected in-process private signer path is explicit local generated-signer mode. No premature signing claim is made about Phantom.

Fix: call `assertStorageRelayReady()` immediately before each signing invocation (first and CU-adjusted second), after the preceding awaits. Preserve the existing relay gate in `rpc.ts:25`. Add two bounded regressions asserting `STORAGE_FENCED`, no new crypto invocation after takeover, zero send, and unchanged retained IDs. The send gate already runs immediately before fetch, so this finding does **not** establish a duplicate on-chain send.

## PG02 — P3: acknowledged rollback is attempted twice and masks the capacity error

Locations: `server/postgres-document-store.ts:27,33–36`; engine `server/remote-postgres-engine.mjs:225–228,274–277,317,320–323`; bridge health exposes `activeTransaction` in `server/postgres-bridge.ts:6`.

For a recoverable engine validation/capacity rejection, `#failed` already performs an acknowledged ROLLBACK and returns the original error with `health.activeTransaction=false`, without poisoning. The facade's outer catch checks only poisoned/closed and calls `rollback()` again. Engine now has no active transaction and returns `STORAGE_TRANSACTION`; that second error escapes before `throw error`, masking the actual `STORAGE_LIMIT` or validation cause. State restoration still occurs in finally, so this is an error-contract defect, not evidence of cache publication or financial loss.

Concrete reproduction to add with `PostgresPolicy.maxSnapshotBytes=1024`: write one valid JSON string body of approximately 950–1000 ASCII bytes. Pure state counts key+body and accepts it; encoded engine snapshot adds object/field/timestamp overhead and exceeds 1024. Engine rejects with STORAGE_LIMIT and rolls back; facade currently exposes STORAGE_TRANSACTION. Existing tests exercise engine rejection and a successful facade separately, leaving this seam uncovered.

Fix: perform cleanup rollback only when bridge health explicitly says an active transaction remains; preserve the original failure when rollback already succeeded. Keep ambiguous/poisoned paths blocked and restore only the acknowledged local baseline. Regression: exact STORAGE_LIMIT, previous body/hash retained, no owned epoch published after a failed first claim, and a subsequent small valid transaction succeeds.

## PG03 — P3: parser and engine disagree on accepted namespace length

Locations: `server/postgres-policy.ts:14–15`; `server/remote-postgres-engine.mjs:113`; Worker constructor catch `server/postgres-worker.mjs:6`; bridge generic error mapping `server/postgres-worker.mjs:17`.

Policy accepts 3–64 characters; engine accepts 8–128. `BONDTRACE_DATABASE_NAMESPACE=demo` passes the public configuration parser but engine construction fails in the Worker. The catch discards the configuration error and subsequent initialize returns a generic STORAGE_REMOTE. Default namespaces are valid, so this affects explicit operator configuration rather than the default startup.

Fix: choose one shared/minimally aligned length contract and document it; reject unsupported lengths before Worker startup. Add boundary tests for 3/7/8/64/65 as appropriate to the chosen contract. No database connection is needed for parser boundary coverage.

## Inspected safeguards and limits of proof

- Engine reserves one pool client for each whole transaction; namespace serialization is transaction-scoped. It verifies schema/binding, sets and verifies transaction-local synchronous_commit=on, validates TEXT bodies/exact safe integer spellings, and waits for exact COMMIT command acknowledgement before publishing the owned generation/snapshot.
- Transport/query timeout, lost acknowledgement, malformed control response, lost rollback acknowledgement and detected fencing poison the engine. Bridge request IDs are monotonic and synchronous; mismatched/fatal replies poison it. No automatic callback replay, SQL retry, local fallback, pruning or deletion is present in the inspected production path.
- Nested undo is staged locally. `prepareCommit` freezes the payload and publication token; facade compares acknowledged key/body content before `commitAcknowledged`. Errors reset to the previously acknowledged local map. PG02 concerns redundant cleanup after an already completed rollback.
- `execute` and `submitPrepared` transactionally retain signed bytes/signature/lifetime and the relevant ID before calling send. Central `rpc('sendTransaction')` performs fresh writer verification for both initial relay and explicit rebroadcast. Rebroadcast verifies retained bytes/signatures/release/genesis/lifetime and uses the same signed wire bytes.
- Policy does not pass raw URL SSL options into pg, enforces verified TLS outside explicit local loopback/localnet, and returns sanitized configuration errors. Worker forwards only STORAGE codes/fixed bridge messages. Hosted configuration requires devnet, demo=false, deployment authentication and exact HTTPS origin. This is source review, not a live TLS handshake or host access test.
- Switching to PostgreSQL refuses an existing native SQLite/legacy namespace; no automatic migration/destructive overwrite was added. Public-document allowlists exclude key files. Backup exports acknowledged public row sets, verifies source hash, writes a new SQLite file, rereads integrity/row values/hash and writes a manifest. This does not establish an off-host backup, restore safety after newer chain actions, or provider disaster recovery.

## Evidence attribution

`postgres-engine-note.md` records repaired **21/21** engine results (16 actual PG subtests, four transport/validation tests plus containing integration group), and preserves earlier failed/20-test cohorts. At this cutoff, `postgres-engine-tests.log` had been overwritten by the separate **1/1** `postgres-financial-barrier.test.ts` run; its exit file is 0. I directly inspected that latest log and test source. Do not cite that 367-byte log as a 21-test engine transcript. Retain a uniquely named repaired-engine log or exact runner output/source hashes for handoff.

The financial test uses actual dedicated loopback PostgreSQL and a TCP proxy that drops a real COMMIT acknowledgement; Solana RPC results are synthetic in that test. Its assertions establish zero initial send, three persisted recovery documents, and recovery sending the original signed wire once. They do not establish a real SPL transfer, Render/Neon or wallet execution. The separately reported native 243-test/Git 58-check/39-real-SPL cohort is historical source-bound evidence and is not PostgreSQL financial acceptance. This reviewer did not rerun any test or authenticate the test server.

Current README/hosting files inspected still primarily describe the earlier paid disk-backed SQLite route and correctly deny public hosting. Lead's new PostgreSQL/Render documentation integration is ongoing and must not inherit an old SQLite/Linux acceptance claim. Review the final revised handoff separately within the remaining two repair reviews.

## Initial source hashes

SHA-256 at the cutoff (uppercase preserved as returned):

| Path | SHA-256 |
|---|---|
| server/remote-postgres-engine.mjs | 051975F5B30C4BDAFAEEE5BEA1C9AB1B9082E466D3C66FBEB48017A5012121B6 |
| server/remote-postgres-engine.d.mts | 7F20D2CF9D7304B13459091E9B92DEC87E0C363A2BDB787308D975081AB16AC8 |
| server/remote-document-state.ts | BD9A6A1225132911E409C2D3F47AC48C4D5146523A249A7ACCADC54F4084BC51 |
| server/postgres-policy.ts | 447C5C585F04253E928F3E2ECAEEF0B9B15CB86E0BB88F48F0A9B93921A83C1D |
| server/postgres-worker.mjs | 2ACBCF96577F1D1D09666764BBB30A20705298174FE46333DA7070C8C506AE49 |
| server/postgres-bridge.ts | 6FD5E35AE614A711B2051596E1AD96F5CCE56D70B9EBA9A39C7F1E8927DC77EE |
| server/postgres-document-store.ts | C86B2344FC65B2EFDAA7608E32245CDAD99670CE7D0C1DAE90E4F39C8193BA84 |
| server/postgres-backup.ts | E46A518A17663ADC636BFC7E886ADC138F6974BFF80C3E5899C5F18C47C8E080 |
| server/storage.ts | 60AF3F48B7340962C728DAB078C8FB70BC7493C527A489FD072A6A0B0449A991 |
| server/config.ts | 2FBE0C09B8A4645F83FA2C6987CF9633A92AB216EC8E30BF58E5803B4936F8AF |
| server/hosting-policy.ts | E7DF97796DE79986E217E2EF6A01E1E114B580E0EC3F2205712770FE8C17D1F3 |
| server/rpc.ts | 9B1A631A3BE77171F6E6FABBEE89360F5453EA6030546F9367B9984C0F4B8E5F |
| server/transactions.ts | AB95BFAED0A91E72307B97245FC913EC5400D2BA3B377507CF36F24374D33A52 |
| scripts/start-hosted.ts | F31652319E3AE7ED992F78041277B3A42C1CAFB6E73AB1365AB94B5DEC261918 |

Stopping gates unchanged: no deployment/account consent, paid service, public visibility, mainnet/real funds/final submission, source edits or reruns by this reviewer. Lead owns implementation/tests/docs/Git; next reviewer action requires revised source and targeted evidence for PG01–PG03, followed by a single bounded repair review.
