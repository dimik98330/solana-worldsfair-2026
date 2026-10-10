# Shadow pilot runbook and evidence gates

Proposed v1, 10 October2026. Read [the integration contract](PILOT-CONTRACT.md) first. This runbook does not report a completed partner pilot or authorize contacting people, sending payments, sharing private documents, opening accounts, or signing agreements.

## Sequence and ownership

| Stage | Owner | Reviewable deliverable and pass condition |
|---|---|---|
| A. Implement bounded adapters | Backend lead | Disabled-by-default authority policy, exact signed registry import, durable sandbox outbox, signed acknowledgement reconciliation, whitelisted export and meaningful failure tests |
| B. Prove local vertical flow | Backend lead and independent critic | Actual built origin handles signed synthetic registry → exact snapshot plan → file export → signed sandbox acknowledgement → restart → audit download; no duplicate obligation or chain mutation from acknowledgement |
| C. Prepare partner packet | Owner with agent drafting | Neutral one-page purpose, schema/example files, field mapping, security/data scope, review checklist, named contact roles left unfilled until confirmed |
| D. Obtain partner access | Owner/authorized partner | Identified organization/operator, permission to use a sandbox and deidentified data, verified authority public key out of band, documented endpoint/auth/error/idempotency semantics; no inferred KASE/bank endorsement |
| E. Run nonexecuting shadow comparison | Authorized operators | Agreed cohort and cutoffs; external signed source assertions and nonexecuting acknowledgements; mismatches and manual corrections retained with both reviewers' actual observations |
| F. Decide next scope | Owner and relevant legal/security reviewers | Evidence determines whether to continue a shadow pilot or design a real rail; no automatic production/mainnet enablement |

The bounded first technical experiment is one existing test instrument with three synthetic holders, one captured coupon and one opened maturity snapshot. Include changed holdings after record date, one already paid row, one tampered signature, one mismatched acknowledgement, one duplicated request, and one interrupted/restarted metadata operation. Use localnet/devnet only and preserve all original keys, ledgers, evidence and media. Existing generated test signing, if needed, remains within its original explicit localnet harness; partner signing keys never enter the server.

## Test measurements and outcomes

Success for local adapter verification requires every required acceptance case in the contract to pass, exact manifest totals to equal the selected unpaid snapshot totals,0duplicate economic payment IDs,0chain writes caused by registry import/acknowledgement, and identical recovered IDs/amounts after process restart. The audit must disclose sandbox mode and all live/retained/unknown proof provenance. A passing synthetic test supports adapter behavior only.

A partner shadow comparison additionally requires an actual authorized external source, verified out-of-band authority mapping, an agreed instrument/cohort/as-of cutoff, every observed discrepancy disposition, and both operators' actual acceptance of the comparison output. Do not substitute an internally generated key, spreadsheet or acknowledgement for that evidence. The target trial length and operator workload stay unestimated until participant access and cadence are known.

Stop further dispatch/planning on signature/authority failure, chain binding change, unexplained entitlement discrepancy, conflicting acknowledgement, uncertain external status or uncertain durable write. Preserve source bytes and existing IDs. Recover by passive status/readback first. A measured mismatch means revise the mapping/contract and rerun the same failed case after a specific correction; missing external access means the partner pilot remains unverified. Neither outcome justifies an invented user, endorsement, LOI or demand claim.

## Evidence packet

Keep raw pilot source files and private external references in an owner-approved ignored directory. Publish only explicitly approved, deidentified exports. A packet records:

- Scope/version, participants with consent if actually present, network/genesis, program/app hashes and exact fixture identity.
- Signed registry bytes/digest, authority fingerprint, actual comparison slot, expected/observed field mapping and discrepancy list.
- Immutable settlement manifest, economic payment IDs, exact amounts/asset/snapshot basis, source acknowledgement bytes and disputes.
- Process restart/failed-attempt lineage, storage backend, exact commands and actual outcomes; HTTP/browser evidence at the built origin.
- Separate actual on-chain signatures/finality and sandbox acknowledgement state; no merged "paid" certificate.
- Export/manifest hashes, reviewer findings and no more than two evidence-driven repair versions for this bounded review.

Public claim ladder: **contract specified** → **sandbox adapter implemented** → **sandbox flow verified** → **partner sandbox connected** → **authorized shadow pilot observed**. Each step requires its own evidence. Current wording must stop at the last demonstrated step. Real bank settlement, legal registry equivalence, production readiness, KASE acceptance, demand and final contest submission are separate claims.
