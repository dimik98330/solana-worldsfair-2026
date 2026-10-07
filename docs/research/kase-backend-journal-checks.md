# Backend journal: isolated migration, retention and relay checks

08.10.2026. Root: `C:\Users\dmitrii\Documents\solana`; HEAD at check: `91a1d64a173b516a0b80c43c33eb0fc5fc3edc82`, existing uncommitted backend work preserved. Active stage: B03/B04/B05 from `docs/21-BACKEND-FOCUS.md`. Test worker owns only `tests/client/backend-journal.test.ts` and this checkpoint; server modules are read-only for this worker. Lead owns server changes, integration, config/Git and `docs/00-STATE.md`.

## Skills and continuity

AGENTS/STATE/BACKEND-FOCUS reread; START/approved specification/architecture/security/plan and unchanged skill instructions retained from the same context. Installed project skills used: ProofPilot **coach**, direct implementation/testing from existing KASE specification, with routing/plan/review/evidence/safety; `solana-dev` security/testing; `review-and-iterate` correctness/account/arithmetic/error guidance. No reinstallation, new product selection or new readiness score. Existing bounded review budgets remain unchanged. Every continuation/handoff must keep the AGENTS rule: select/read suitable installed skills before substantial work and report their use.

## Isolation and trust boundary

Every scenario creates a fresh ignored namespace under `.local/tests/backend-journal-<uuid>/...`. A separate Node process loads server modules after its own `BONDTRACE_DATA_DIR` is set. Module globals, SQLite singleton and `globalThis.fetch` cannot leak between scenarios or files in a parallel test runner. RPC URL is syntactically localnet, but **all fetches are intercepted**; an unexpected method fails the synthetic test. No calls to the real validator, no `.local/bondtrace` access, no existing key files, credential reads, actual transfers or resets.

Signing boundary tests generate transient Ed25519 Kit signers in memory. They build/verify real message and signature bytes against synthetic RPC. Legacy signatures and arrays are labelled synthetic metadata; migration leaves their provenance `legacy-unbound`. None of these results is an on-chain receipt or a substitute for the Lead's built-origin real lifecycle/restart proof. The built-in Node22.14 SQLite runtime's experimental warning remains visible; no new dependencies installed.

## Meaningful assertions

| Scenario | Verified behavior |
|---|---|
| Legacy migration + retention |180 signed prepared rows and190 signed operations, all projection-pending, survive conversion to per-record documents;190 activity receipts are preserved. Repeated migration is idempotent. Source JSON SHA256/bytes remain unchanged. A separate process reopen sees the final IDs, exact amounts and pending projection. Capacity rejects new intents rather than deleting history.|
| Invalid legacy row |A malformed identifier rolls back all per-record conversion and the journal marker. Original imported arrays and their source bytes remain available.|
| Canonical operation replay |Object field order, leading zeros, destination/targetWallet, top-level bond/instrumentAddress and operationId/requestId aliases normalize to the same intent. `9007199254740993` is exact across string/BigInt digest inputs. A changed amount or role conflicts; unsafe Number input and contradictory aliases reject. u64 max from legacy metadata remains exact.|
| GET confirmation/provenance |A first live mocked status lookup without a prior receipt persists genesisHash, slot700, observedAt and `live-rpc`, with projection pending. A separate process, seeing null RPC status, returns same-genesis `recorded-confirmation`. Changed genesis is rejected without altering retained evidence.|
| Legacy unbound confirmation |A historical confirmed row with no genesis and an absent live RPC receipt remains unknown. Its old slot/provenance are retained and never silently attached to the current ledger.|
| Synchronous callback failure |Signature receipt, lifetime and callback operation writes roll back together when the callback throws before send. `sendTransaction` count stays0; separate reopen sees no signed reference or partial lifetime.|
| Async/thenable callback |Async callback is rejected **before invocation**; returned thenable is rejected before relay. Both yield `INVALID_CALLBACK`, no receipt/lifetime and no send.|
| Invalid prepared lifetime |After exact signature verification, missing lifetime fails inside the transaction and rolls prepared signature/status back. No receipt/lifetime or relay is committed; reopened prepared metadata stays unsigned.|
| Ambiguous send/recovery |At mock relay entry, exact wire bytes, signature, genesis, lifetime and operation reference are already durable. Lost send response retains that identifier. Recovery confirms and completes projection without another send; process reopen can use recorded confirmation.|

## Findings and repairs

Two boundary findings were reported to Lead from read-only source inspection and then guarded by regressions:

1. `rpc.transactionStatus` originally updated a receipt only when a record already existed. A first confirmed GET without prior relay therefore could not survive a later null RPC response. Lead added persistent first observation with `action:observed-status` and pending projection rather than invented projection completion.
2. `execute` originally discarded the return value of `onSubmitted`. An async/thenable callback could escape the synchronous transaction boundary. Lead added rejection before invocation for async callbacks and rejection/rollback for returned thenables.

The initial captured suite run was8/9. Its sole failure was the test's provisional expected callback code; the implementation already correctly returned `INVALID_CALLBACK`. The assertion was aligned with that actual contract, preserving the no-invocation/no-relay/no-partial-record checks. No server files were patched by this worker.

## Final executed checks

- `node --import tsx --test tests/client/backend-journal.test.ts` — **9/9 passed**,0 failed/skipped,37.68s in the final captured run.
- `npm run typecheck` — passed with this test file and current integrated server code.
- Scoped `git diff --check` — passed for tracked diff; both new files inspected directly. Git read-only status/log used; no mutations/commits/pushes.

These are module/transport/storage tests against mocked RPC. They prove the tested persistence boundaries and exact normalization behavior, not production deployment, bank settlement, devnet availability, demand, eligibility or security certification.

## Handoff and stopping gate

Test file/checkpoint ready for Lead integration. Overall backend goal remains active until the independent scoped review, final build, real corporate-action cycle through built HTTP origin, restart comparison and preservation of previous instruments/evidence complete. Lead owns that evidence and STATE update. Account login/legally binding consent/final submission/public visibility/mainnet/paid services/real funds remain the existing owner gates; no permission reset or new automatic deployment is inferred from these tests.

## Appendix: concrete concurrency and RPC repair regressions

08.10.2026, follow-up B03/B04 task. AGENTS/STATE/backend scope reread; unchanged installed ProofPilot coach/direct implementation, solana-dev testing/security and review-and-iterate instructions reused in the same context. Ownership remains test/checkpoint only; Lead made the server fixes. Existing review budgets and stopping gate preserved.

Three focused tests were added for the reviewer-identified catalog race and the tightened RPC boundaries:

- **Actual process concurrency:** four simultaneous Node processes share one fresh ignored SQLite namespace. Each performs four `applyConfirmedEffect(create_vote)` and four `finalizeAdminEffect(register_holder)` operations, for 16 proposal IDs and 16 holder labels total. A 15 ms delay is injected after the catalog SELECT result to expose the old unlocked read/merge/write race. In the repaired implementation the final critical read, merge and write hold `BEGIN IMMEDIATE` across that delay. A separate reader process verifies all 16 labels and IDs in the catalog, all 16 IDs in the fixture and database integrity. `register_holder` uses a canonical synthetic valid Bond account through mocked `getAccountInfo`; `create_vote` needs no RPC. No transaction send or live read occurs.
- **Malformed confirmation:** nine variants cover missing `err`, `err:false`, `err:0`, absent context, confirmed slot greater than context, fractional context slot, wrong response ID, missing `jsonrpc` and simultaneous result/error fields. Each must throw `RPC_INVALID` both for direct status and operation recovery. No confirmed receipt appears, operation chain/projection remain pending and neither catalog nor fixture receives proposal 31.
- **Unavailable fee/simulation:** `getFeeForMessage.value:null` throws `FEE_UNAVAILABLE`; missing or false simulation `err` throws `RPC_INVALID`. No prepared or receipt record and no relay are created.

Initial appendix execution exposed a synthetic setup mismatch: a legacy fixture is classified demo, while its new catalog record was labelled wallet. The test record was corrected to demo; source code was not changed and the catalog's identity protection was not relaxed.

Executed command: `node --import tsx --test --test-name-pattern='concurrent catalog|malformed status|null fee' tests/client/backend-journal.test.ts` — **3/3 passed**, 0 failed/skipped, 13.54 s. `npm run typecheck` and scoped whitespace check passed afterward. The file now contains **12 tests**: the prior full 9/9 run is retained above; this follow-up executed only the three added cases, without repeating unrelated checks. A latest full integrated suite is Lead's responsibility.

This appendix confirms specific local process/RPC repairs. It does not create financial receipts, certify the program, prove human-wallet/devnet behavior or close the real built-origin/restart gate.
