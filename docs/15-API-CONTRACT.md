# BondTrace API — current backend contract

Loopback API for localnet/devnet test assets. All money and bond quantities are exact integer strings in base units: settlement has6 decimals, bonds0. `1000000000` means `1000.000000` test units. No money passes through JavaScript Number. This document supersedes the original eight-action contract.

## Read and reconcile

`GET /api/health` checks metadata access and actual RPC genesis identity. Changed identity fails closed with `CHAIN_IDENTITY_CHANGED`; preserve old receipts and use a separate ignored namespace. SQLite is built into Node22.14+, schema1, DELETE journal / EXTRA synchronous. Health is not a corporate-action or security proof.

`GET /api/state?instrument=<address>` returns issue, registry, all coupons, redemption, locally catalogued proposals, activity and demo availability. Without an instrument it selects the current demo fixture. `GET /api/reconciliation?instrument=<address>` returns just instrument address, financial context, chain identity and reconciliation.

All financial values are read from one confirmed `getMultipleAccounts` context after address discovery. `context` names RPC slot, Clock slot/timestamp and account count. Changing registry/terms/catalog triggers up to3 read retries. Required missing accounts and inconsistent money fail503 with no financial payload; closed empty canonical holder ATAs are an explicit program exception.

`reconciliation.status:verified` means exact holder/mint/issued-minus-burned supply, coupon snapshot/claim masks/paid totals, principal claimed/burned units, reserve and aggregate voting identities passed at that context. It is not a security certificate. Money is `{baseUnits,decimal,decimals:6}`. Totals include contractual, cashPaid, remainingObligations, scheduledCouponForecast, fixedAccruedCoupon, claimableNow, vault, fundingGap and surplus.

Before capture, a coupon is a scheduled forecast. After capture it is fixed historical entitlement, claimable at payment time. Transfer and burn do not erase rights. Annual rate/frequency are explicitly local display metadata; actual on-chain terms are fixed coupon amounts. Issuer settlement ATA absence is marked `settlementAccountAvailable:false`, rather than hiding missing required vault data.

Proposals use up to32 local catalog IDs; missingProposalIds/proposalCoverageComplete disclose gaps. All individual ballot sides are not reread: choiceEvidence is proposal-aggregate-only. Activity verification and historical recordSlotSource preserve provenance: imported legacy-unbound slots are not asserted to be fresh genesis-bound confirmations.

## Unsigned review and relay

`POST /api/actions/prepare` accepts `{action,walletAddress,bondAddress?,params}` and returns transactionBase64, lastValidBlockHeight, operationId and summary. Every wallet action except creation requires an explicit instrument. Summary includes network, signer, instrument, token/recipients/amount when applicable, simulation and actual fee. Creation includes reviewed immutable terms. Unavailable fee is FEE_UNAVAILABLE503, never zero.

| Action | Required params |
|---|---|
| initialize_issue | seriesId, name <=64 UTF-8 bytes, settlementMint, positive faceValueMinor, maturityTs,1–8 coupons |
| register_holder | holderWallet; optional label <=64 UTF-8 bytes |
| issue_units | holderWallet, positive units |
| seal_issue | none; requires full principal + all coupons reserve |
| fund_vault | positive amountMinor |
| transfer_bonds | targetWallet (alias destination), positive units |
| capture_coupon / claim_coupon | couponId (alias index), mandatory for multiple coupons |
| begin_redemption / redeem_principal | none |
| create_vote | proposalId, title <=96 UTF-8 bytes |
| cast_vote | proposalId, explicit choice yes/no (alias support true/false) |

Coupon rows are `{recordTs,paymentTs,unitAmount}` strings, passed as array or JSON-encoded array. Integers obey u64 and dates the supported ISO range; payment cannot precede record or follow maturity. Unknown fields and conflicting aliases fail before relay. Matching params.bondAddress/instrumentAddress aliases are supported. Canonical intent ignores key order and equivalent supported aliases, while different amounts, role, target or action conflict. No financial amount, title, proposal identity or vote choice is invented.

`POST /api/transactions/submit` accepts only `{signedTransactionBase64}`. Every required Ed25519 signature verifies against the exact persisted reviewed message. Invalid/unsigned messages cannot poison recovery. The signed bytes, signature, lifetime, operation and receipt commit together before any relay. Repeating the signed message recovers its existing receipt without another send. Wallet keys remain outside the relay.

## Recovery and generated demo

`GET /api/transactions/:signature` checks RPC and persists live observations. Same-genesis retained confirmation may be returned as recorded-confirmation if history is pruned; it does not claim a fresh RPC receipt. Receipt absence after lifetime expiry remains unknown, since absence cannot prove failure. Retained definitive rejection is separate.

`GET /api/operations/:id` checks retained signatures and completes local catalog reconciliation. chainStatus and projectionStatus are separate: confirmed chain action can still need local projection recovery. Keep the same ID after uncertainty; do not sign the financial action again. Even old stored errors with signed references are checked. GET never sends transactions.

`POST /api/demo/action` accepts `{action,role,bondAddress?,params,operationId}`. The client must generate and retain its recovery ID before dispatch; missing/numeric/null IDs fail before signing. Fixed generated issuer/investor1–3 identities are checked against actual public keys. Transfers are restricted to the fixture's generated recipients. Same-ID replay recovers that intent; changed values/target are409. This is a disclosed test harness, separate from human signing.

`POST /api/demo/bootstrap` accepts boolean reset and required client operationId (alias requestId). Persisted immutable plan and child receipts allow explicit same-ID resume of unsubmitted steps. Pending/unknown steps block duplicate sends; GET remains read-only. Devnet insufficient funding does not restart an airdrop loop. Original completed demo catalog is retained when choosing a new demo issue. An explicitly requested new-ID reset of an expired partial plan first reconciles every old signed child, rejects unknown outcomes, archives only a real issue and fences the superseded old plan; it never rewrites immutable dates.

Unsigned demo work uses a two-minute database lease. A stopped process can be resumed explicitly under the same intent after that lease expires; an old owner cannot write replacement metadata or relay after its ownership changes. Once a signature exists, the intent is never claimed again. A distinct demo intent cannot silently reuse an old identical signed message from the same blockhash. The UI labels unsigned recovery **Resume test operation**; GET remains passive.

Signed unknown/pending and confirmed-but-unreconciled records are never evicted by history limits.100 unresolved signed records block new intents while retaining all recovery data. Unsigned reviews last2 minutes with at most128 concurrent live previews. SQLite imports original public JSON metadata once and preserves its bytes; keys are excluded from migration/backup.

## Error contract

`{error:{code,message,retryable,recoveryRequired}}`: invalid requests/signatures400, forbidden403, conflicts409, capacity429, unavailable/inconsistent RPC or storage503. Unexpected HTTP failures use a generic message. POST5xx conservatively requires recovery; no automatic mutation or signature retry. JSON is limited to65000 bytes and decoded as strict UTF-8 after complete chunk assembly, preserving split multibyte text; MIME prefixes are not accepted as application/json.

UNKNOWN_STATUS means a signed action may have executed or its local projection is incomplete. Retain operationId/signature and query them. RPC envelope, context and mandatory error fields are validated before storing a confirmation. Synthetic transport/concurrency/crash checks are disclosed separately from actual localnet lifecycle evidence. Confirmed is the prototype commitment; no production finality, provider honesty or banking integration is certified.
