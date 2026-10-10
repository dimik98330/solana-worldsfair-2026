# Registry and settlement pilot contract

Version1,10 October2026. This is the implemented sandbox/shadow acceptance boundary plus the conditions for a future external pilot. Exact current payloads, routes and states are in [IMPLEMENTED-ADAPTER.md](IMPLEMENTED-ADAPTER.md); use that schema and the code helpers for interoperable requests.

## Implemented boundary

BondTrace accepts signed external registry assertions, compares them with actual reconciled chain holdings, freezes exact unpaid snapshot settlement instructions and retains signed nonexecuting acknowledgements. It does not register/mint/burn/claim for a holder, send fiat, or connect to KASE/a bank. No customer, partner, legal registry mapping or demand is established.

The adapter accepts localnet/devnet test assets, up to1000 registry rows within body/graph limits. A proposed first partner trial may deliberately use a small legacy16-holder/8-coupon instrument; these are trial bounds, not v4 limits. Paged v4 program tests cover33 initial holders, a later receiver and9 coupons.

One issuer operations reviewer and one registry/payment reviewer are proposed pilot roles, not confirmed participants. No paid dependency is authorized.

## Transport and trust

Hosted mutations and exports use the existing operator authentication/origin/body boundary and the signed-envelope checks. App operator credentials do not establish authority to speak for a registry/bank. Source names alone grant no trust.

Configured public Ed25519 authorities have `{authorityId,sourceId,publicKeyBase64,scopes}`; scopes are registry and/or settlement-ack. No request can add an authority. No configured keys means disabled. Rotating/removing a key prevents its new signed submissions. Partner private keys stay outside BondTrace; generated test keys are not partner credentials.

An envelope is `{payload,authorityId,signatureBase64}`. A64-byte signature covers UTF-8 `BondTrace integration v1\n` plus recursively key-sorted `canonicalJson(payload)`; arrays keep order. `integrationSigningBytes()` is the exact signing helper. SHA256 identifies the signed envelope. Schemas, nesting, signing length65000B and integer ranges are bounded.

Both signed payloads require schemaVersion1, sourceId, nonce, sourceSequence as canonical u64 string, issuedAt/expiresAt as canonical UTC milliseconds, sandbox/shadow mode and `{network,genesisHash,programId,bondAddress}` chain binding. New envelopes expire within24hours and allow at most60seconds future issue time. Same-ID/nonce different bytes conflict. Identical accepted replay returns the original result without new dispatch, even after transport expiry.

Public keys/receipts are provenance, not proof that an external ledger is legally correct. Never upload real names, identity documents, bank accounts or private partner references as public evidence.

## Registry acceptance

Registry payload adds domain bondtrace.registry-attestation.v1, importId, registryRef, basis current-registered-holdings and complete ordered `{holderRef,wallet,units}` rows. Pseudonymous references and exact quantities use the implemented schema.

Every wallet/order/current quantity and supply must match the revision-fenced chain view with chain-identity checks. A supplied as-of timestamp does not prove historical ownership. A mismatch is retained as a discrepancy and cannot generate a settlement plan; it never auto-fills missing positions or changes accepted mappings/chain state.

New assertions advance source/instrument/registry sequence. Identical digest replay preserves the accepted result; stale/new-conflicting assertions reject. The issuer aligns a draft only through separately wallet-reviewed actions: legacy register_holder/issue_units or paged register_holder_v2/issue_units_v2. The adapter performs neither.

## Settlement plan and outbox

Only finalized captured coupon/principal rights can produce a plan. Forecast, zero, paid or wrong-snapshot selections reject. Coupon IDs are exact integer strings within the actual legacy/v4 schedule. Current holdings never replace historical coupon quantities, including after transfer or principal burn.

A matched imported registry must still match current chain holdings. The server selects positive unpaid rights and computes wallet, snapshotAddress/couponId, units, exact amount, mint/decimals and holder reference. It retains comparison context and immutable row digest. Current payloads contain beneficiary wallet and programId; beneficiary ATA and exact SBF-release fields are not represented as additional signed row fields. Any future such fields require a versioned schema.

Economic paymentId hashes the canonical network/genesis/program/bond/action/snapshot/couponId/beneficiary identity, omitting couponId for principal. It is independent of request ID/process/adapter. A second plan cannot create another intent or replace immutable financial fields for the same obligation. Manifest and every outbox row commit atomically; unresolved rows are retained.

Current sandbox-file is an authenticated download/upload boundary with dispatchAllowed=false. Actual externalStatus is planned, accepted, simulated-settled, rejected, unknown or disputed; onChainStatus is separate. Export is not a send/acceptance and does not create a persisted exported state. A later chain claim does not rewrite the immutable manifest.

## Signed acknowledgement

The acknowledgement domain is bondtrace.settlement-ack.v1. Alongside common signed scope/nonce/sequence/expiry fields, the exact schema includes ackId, operationId, paymentId, outboxDigest, beneficiaryWallet, assetMint, assetDecimals, amountMinor, externalReference and accepted/simulated-settled/rejected/unknown status.

Unknown or unauthorized signatures reject. Authorized mismatches are durably quarantined as disputed; original financial fields remain. Same acknowledgement replay preserves its receipt. One external reference cannot satisfy two obligations. Late sequence evidence does not roll a terminal state backward; contradictory terminal evidence becomes disputed.

An acknowledgement never changes SPL claim masks, burn, chain receipts or reconciliation cash totals. Simulated-settled may coexist with on-chain unclaimed. Unknown external status does not authorize retry, replacement payment or new signature. Audit exports include signed assertions, exact outboxes, acknowledgement/dispute history, chain context and canonical integrity digest, with partnerConnection unverified and realAssets false.

## Required local acceptance cases

| Case | Required behavior |
|---|---|
| Signature tamper, wrong authority/domain/chain, nonce/sequence conflict | Reject new work; preserve accepted record |
| Registry wallet/order/quantity mismatch or unavailable chain/storage | Discrepancy/unavailable; no automatic token mutation |
| Forecast, already-paid/zero/wrong-snapshot selection | No new payable outbox |
| Transfer after coupon capture; burn before late coupon | Historical snapshot amount remains authoritative |
| Same obligation with another plan ID | No duplicate economic intent |
| Crash/uncertain COMMIT or process restart | Atomic manifest/rows; original ID/amount recovery; no signing/resend |
| Ack amount/asset/wallet/digest/reference mismatch | Dispute; chain masks/totals unchanged |
| External unknown/timeout | Passive observation; no dispatcher retry |
| Export/replay/reopen | Original IDs/digests and explicit evidence scope preserved |

## Conditions for a real external pilot

A named registry/custodian, verified public-key ownership/mappings, agreed instrument and cutoff, authorized deidentified data, bank sandbox access and actual operator acceptance are required. None is inferred from generated keys or a signed internal fixture.

Real second-rail dispatch additionally needs a separately approved on-chain reservation/settlement-mode model preventing conflict with direct SPL claims, scoped fixed endpoint/TLS/auth, durable dispatch barrier and same-ID external status lookup. Current shadow code does not solve or claim this. Do not promise exactly-once external transport.

The [pilot runbook](PILOT-RUNBOOK.md) records permissions, stop conditions, discrepancy disposition and provenance. Local cryptographic/restart evidence establishes adapter behavior; partner sandbox, legally recognized registry, bank settlement, commercial demand and production readiness each need their own evidence.
