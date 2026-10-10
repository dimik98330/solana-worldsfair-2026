# API contract — current v4 source

[Overview](../TECHNICAL.md) · [Paged protocol](34-PAGED-SERVICING.md) · [Setup](LOCALNET-SETUP.md)

This contract describes the current source. The recorded public deployment uses the separately identified v3 program; inspect `/api/program` and require the matching release before preparing financial operations. Whole bonds have decimals0; the mock settlement mint has decimals6. Money and quantities are exact decimal integer strings, never JSON floating-point amounts.

## Read, reconcile and inspect

| Route | Meaning |
|---|---|
| `GET /healthz` | Process liveness only |
| `GET /api/health` | Metadata access and actual configured chain identity |
| `GET /api/program` | Canonical program/ProgramData and expected-versus-observed payload hash |
| `GET /api/state?instrument=<bond>` | Selected instrument, current holdings, immutable rights, payments, votes, receipts and servicing requests |
| `GET /api/reconciliation?instrument=<bond>` | Exact supply/liability/reserve reconciliation and its observation context |
| `GET /api/servicing?instrument=<bond>` | Read-only next-action requests; no signing or dispatch |
| `GET /api/evidence?instrument=<bond>` | Whitelisted public evidence and integrity digest; no private signer files or retained signed wire |
| `GET /api/operations/<id>` | Passive same-ID operation/projection recovery |
| `GET /api/transactions/<signature>` | Live or explicitly retained transaction/finality observation |
| `GET /api/transactions/<signature>/proof` | Retained execution proof; `?retry=true` explicitly requests read-only recapture |

With no instrument, selection uses the configured fixture or catalog; it does not invent a financial issue. A selected missing/invalid account fails closed rather than falling back to unrelated holdings. A due uncaptured record and an incomplete capture are different from a finalized claimable snapshot. Principal retirement and all-obligations-settled are also separate states.

V2 financial reads batch up to100 accounts per request, with a4,096-account observation budget. They read the Bond revision before/after the graph and retry a changing graph at most3 times. Returned context exposes its slot interval and `sameBank:false`; this is **not** one atomic Solana bank snapshot. External SPL observations retain their own scope. Legacy single-bank graph reads have their separate implementation; do not apply that claim to v2.

`reconciliation.status:verified` means the inspected exact supply, fixed quantities/masks/totals, principal retirement, reserve and voting aggregates passed the checks at that context. It is not a security certificate or reservation of funds. Unavailable/inconsistent required financial data does not become zero.

V2 proposal discovery selects up to64 recent known history IDs plus required/active actions within the graph budget. Local discovery retains512 IDs and128 optional labels with sticky truncation disclosure. `completeAtFinancialContext:false` remains explicit; a list of queried IDs is not exhaustive chain discovery. Legacy proposal discovery uses its separate32-ID window.

Scoped inspection:

```text
GET /api/v2/instruments/<bond>/pages/registry/<page>
GET /api/v2/instruments/<bond>/pages/schedule/<page>
GET /api/v2/instruments/<bond>/pages/snapshot/<page>?kind=1&id=0
```

Page/action indices are canonical u32 values. Snapshot kinds are1=coupon,2=principal,3=vote; principal ID is0. Duplicate/unsupported query fields reject. A scoped page is not full financial reconciliation.

## Prepare, sign and submit

`POST /api/actions/prepare` accepts `{action,walletAddress,bondAddress?,operationId?,params}`. Creation has no existing bond address; other financial actions require an explicit selected instrument. The response includes `operationId`, exact `transactionBase64`, `lastValidBlockHeight` and summary of network/signer/accounts/amount/fee/terms. It runs current release/account validation and simulation. An unavailable fee is an error, not a zero fee.

The wallet signs those exact bytes. `POST /api/transactions/submit` accepts only `{signedTransactionBase64}`. Relay verifies the prepared message and every required Ed25519 signature, signer/account/lifetime, chain/release and durable write barrier. It commits the signed wire, signature, intent and ID before the first send. The server does not silently change a failed sign-only request into wallet broadcast.

### V2 actions

Use these exact action names for paged instruments. Browser compatibility aliases do not make legacy API actions automatically target v2 accounts. All monetary fields below are integer strings; counters may also be bounded safe integers and are normalized to strings. Unsupported or conflicting fields reject.

| Action | `params` | Required authority |
|---|---|---|
| `initialize_issue_v2` | `seriesId`, `name`, `settlementMint`, `faceValueMinor`, `maturityTs`, `couponCount`; optional paired `rateBps`/`couponFrequency`, complete `coupons` | Issuer/payer |
| `append_schedule_v2` | `pageIndex`, `coupons` (1–8 terms) | Issuer |
| `create_registry_page_v2` | `pageIndex` | Issuer |
| `register_holder_v2` | `holderWallet`; optional `holderIndex`, `label` | Issuer; zero receiver after activation only between record locks |
| `issue_units_v2` | `holderWallet`, positive `units` | Issuer, draft only |
| `fund_vault_v2` | positive `amountMinor` | Issuer |
| `seal_issue_v2` | empty | Issuer; complete schedule/supply/full reserve required |
| `transfer_units_v2` | `targetWallet`, positive `units` | Current holder; record/capture/maturity locks enforced |
| `begin_coupon_v2` | `couponId` | Any fee payer after due record |
| `begin_redemption_v2` | empty | Any fee payer after maturity and preceding coupon captures |
| `create_proposal_v2` | `proposalId`, `title`, `closesAt` (Unix seconds) | Issuer before maturity |
| `capture_action_page_v2` | `actionKind`, `actionId`, `pageIndex` | Any fee payer; exact next page |
| `finalize_action_v2` | `actionKind`, `actionId` | Any fee payer; complete reconciled capture |
| `claim_coupon_v2` | `couponId` | Recorded holder |
| `settle_coupon_v2` | `couponId`, `holderWallet` | Any executor; fixed beneficiary/amount |
| `redeem_principal_v2` | empty | Corresponding holder; atomic principal transfer and burn |
| `cast_vote_v2` | `proposalId`, `choice` (`yes`/`no`) | Eligible holder; fixed weight/one ballot |

Coupon terms are `{recordTs,paymentTs,unitAmount}` with ordered future dates, payment at/after record and no later than maturity. Complete one-review creation supports up to16 coupons and must match `couponCount`. Larger declared schedules use count-only initialization and explicit page appends; the browser has no larger-calendar append control. In regular-rate mode every coupon must equal nominal×rateBps/(10000×frequency) exactly. Remainders, overflow and contradictory amounts reject; no silent rounding.

The program protects account identity, PDA/mint/owner, signer and phase constraints even for direct calls bypassing HTTP. Unknown HTTP role text never grants issuer/holder authority.

## Recovery and storage

Same ID with different intent conflicts. A confirmed chain transaction whose local projection is pending remains recoverable under the original ID. GET status routes never relay or sign. An unknown/expired/pruned receipt does not authorize a replacement payment signature.

`POST /api/transactions/<signature>/rebroadcast` accepts `{}` or `{operationId:<existing-id>}` only. It can resend the same retained wire after signature/message/genesis/release/expiry checks; it cannot construct a replacement. Confirmed/error outcomes remain passive. Business confirmation, observed finality and retained proof commitment are reported separately.

SQLite uses DELETE/EXTRA, verified rollback and interprocess locking. Native contention is `STORAGE_BUSY` only after cleanup is known. A busy GET returns503 with its valid recovery ID when supplied and `recoveryRequired:true`; it does not invent success. Hosted PostgreSQL requires acknowledged COMMIT, verified TLS and writer-generation fencing. Uncertain commit blocks new signing/relay; no empty-local-DB fallback. Keep one writer per namespace.

`POST /api/runtime/readiness` accepts `{}` and observes chain/program, health, slot progress and storage write/read. It sends no financial transaction. Hosted operator backup/readiness and integration routes retain their authentication/origin/body limits. Portable backup is exported by `GET /api/metadata/backup`; unpacking writes new files, without automatic destructive restore.

## Legacy and integration boundaries

Legacy fixed/rate instructions remain available with their old account layouts and16-holder/8-coupon limits. The current v4 program makes legacy maturity opening permissionless, while the separately recorded older public v3 program retains its original behavior. Never infer deployment from source publication.

`/api/lifecycle/plan`, `/api/lifecycle/resume`, `/api/lifecycle/<id>` and `/api/demo/coupon-run` are the retained legacy coordinator interfaces. V2 servicing is exposed through the explicit actions/read model above and the durable paged lifecycle CLI. Generated signing is an explicit local test capability; hosted demo execution is disabled. Principal always requires the holder.

Signed registry/outbox/ack routes are documented in [the implemented adapter contract](integrations/IMPLEMENTED-ADAPTER.md). They are sandbox/shadow only: no bank dispatcher, no on-chain paid-bit mutation, no legal registry/partner certification. External acknowledgement and SPL payment remain separate facts.
