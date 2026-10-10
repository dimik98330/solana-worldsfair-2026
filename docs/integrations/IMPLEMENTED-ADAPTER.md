# Implemented shadow adapter

10 October2026. Implementation: [`server/integrations.ts`](../../server/integrations.ts). This is a nonexecuting integration boundary. It does not connect to KASE/a bank, initiate fiat payments, or protect a hypothetical future bank payment against a concurrent direct SPL claim. A real second rail would require an approved on-chain reservation/settlement-mode model and legal/security review. The [target contract](PILOT-CONTRACT.md) includes additional future requirements; the exact current API is below.

## Authority and envelope

`readIntegrationAuthorities()` reads optional `BONDTRACE_INTEGRATION_AUTHORITIES`: a JSON array of at most32 entries `{authorityId,sourceId,publicKeyBase64,scopes}`. The public key is raw32-byte Ed25519, canonical base64. Scopes are `registry` and/or `settlement-ack`. No configured authorities means imports/acknowledgements are disabled. There is no request endpoint to add an authority. Keys, validity windows and revocation are operator configuration; rotating/removing a key prevents its new signed submissions. Existing stored receipts remain readable.

Every signed request is `{payload,authorityId,signatureBase64}`. The64-byte Ed25519 signature covers UTF-8 `BondTrace integration v1\n` plus recursively key-sorted JSON from `canonicalJson(payload)`. `integrationSigningBytes()` is the exact interoperable helper. The recorded envelope digest hashes these bytes. Fields, nesting, node count and65000-byte signing length are bounded. Economic integers are canonical u64 strings. IDs, pseudonymous holder references and external references use8–100 ASCII letters/digits/underscore/hyphen. No private keys, names, account numbers or identity documents are required.

Both payload schemas require `schemaVersion:1`, `sourceId`, `nonce`, `sourceSequence` as a u64 string, `issuedAt`, `expiresAt` in canonical UTC with milliseconds, `mode:"sandbox"|"shadow"`, and `chain:{network,genesisHash,programId,bondAddress}`. New requests require a validity window of at most24 hours, unexpired at acceptance and issue time at most60 seconds ahead. An identical existing envelope can replay after expiry without creating new work. Same ID/nonce and different bytes conflicts.

Registry payload additionally contains `domain:"bondtrace.registry-attestation.v1"`, `importId`, `registryRef`, `basis:"current-registered-holdings"`, and complete `holders:[{holderRef,wallet,units}]` in the chain registry order. The adapter accepts at most1000 rows within the byte limit. It fences a normalized `getState(bond)` DTO with chain-identity observations, checks verified reconciliation and supply conservation, compares every wallet/quantity, and records actual comparison context. `matchStatus:"mismatch"` retains discrepancies but cannot generate a settlement plan. Each new assertion must advance its source/instrument/registry sequence. A matched assertion is provenance and comparison evidence, never a legal registry certificate.

## Factory and routes

```ts
const integrations = createIntegrationService({
  readView: getState,
  readIdentity: chainIdentity,
  authorities: readIntegrationAuthorities(),
});
```

| Route | Method call |
|---|---|
| `GET /api/integrations/capabilities` | `integrations.capabilities()` |
| `POST /api/integrations/registry/import` | `await integrations.importRegistry(body)` |
| `GET /api/integrations/registry/:importId` | `integrations.registryStatus(importId)` |
| `POST /api/integrations/settlement/plan` | `await integrations.planSettlement(body)` |
| `GET /api/integrations/settlement/:operationId` | `await integrations.settlementStatus(operationId)` |
| `POST /api/integrations/settlement/reconcile` | `await integrations.reconcileAck(body)` |
| `GET /api/integrations/audit/:operationId` | `await integrations.auditExport(operationId)` |

The application route owner applies operator authentication, existing origin checks and mutation serialization. Direct factory/harness tests do not establish HTTP authorization at the built application origin. Status/audit reads are passive and expose separate external status and current observed on-chain claim state; missing snapshot/right evidence yields `unknown`, never an invented unclaimed balance.

## Planning and acknowledgements

Plan input: `{operationId,bondAddress,action:"coupon"|"principal",couponId?,registryImportId,adapter:"sandbox-file",holderWallets?,snapshotAddress?}`. Coupon index is an exact integer string. Principal rejects a coupon index. An optional unique holder subset supports bounded pages; an optional snapshot address rejects an unexpected snapshot. A plan requires a matched registry still matching current balances and an already immutable coupon/maturity snapshot. Forecasts, explicitly selected zero/paid/unregistered rights, and duplicate economic obligations reject. Current balances never replace old coupon rights; those survive subsequent transfer or principal burn. The response is `{plan,outbox}` with exact selected total.

The economic `paymentId` binds test chain/program/bond/action/snapshot/beneficiary. Its outbox digest also binds amount, units, asset mint/decimals and pseudonymous holder reference. Plan plus every row commits atomically before returning. A second request ID cannot produce another intent for an existing obligation. Repeating the same plan ID/intent returns its original records, even after storage reopen. There is no automatic dispatcher, transport retry, wallet signing or SPL write. `dispatchAllowed` is alwaysfalse.

Acknowledgement payload additionally requires `domain:"bondtrace.settlement-ack.v1"`, `ackId`, `operationId`, `paymentId`, `outboxDigest`, `beneficiaryWallet`, `assetMint`, integer `assetDecimals`, exact `amountMinor`, `externalReference`, and status `accepted|simulated-settled|rejected|unknown`. An authorized signed mismatch is durably quarantined as `disputed`, retaining original financial fields. Wrong/unsigned authorities reject. An external reference cannot satisfy two payment IDs. Duplicate acknowledgement returns its original receipt. Source-sequence ordering retains late evidence without rolling terminal state backward; a newer contradictory terminal outcome becomes disputed. Unknown status stays nonexecuting. All acknowledgement history is capped and unresolved records are retained.

An acknowledgement never changes SPL claim masks, principal retirement/burn, Solana signatures, reconciliation cash totals, or existing evidence scope. `simulated-settled` is a sandbox external state. Audit exports contain signed source assertions, exact manifest/outbox records, acknowledgement/dispute history, observed chain context, explicit unverified partner scope and canonical SHA-256; no credential or signed Solana transaction payload.

## Reproduce the HTTP adapter check

```powershell
node --import tsx scripts/integration-sandbox-demo.ts
node --import tsx --test tests/client/integrations.test.ts
```

The one-command demo launches two actual loopback HTTP services: the real adapter factory backed by isolated SQLite and a counterparty that signs acknowledgements using a second generated Ed25519 authority. Both private keys stay only in memory. It executes signed registry import → exact three-holder900000000-base-unit coupon plan → three HTTP-signed acknowledgements → duplicate replay → storage reopen → audit download. It writes public result/audit JSON under a fresh ignored `.local/integration-sandbox/<uuid>` and closes both services. The chain DTO is synthetic: output explicitly says `actualChainVerified:false`, `chainReadSource:synthetic-chain-fixture`, `partnerConnection:unverified`, `realAssets:false`. This demonstrates real transport, cryptographic verification and durable adapter behavior; it does not demonstrate a live chain read or external partner connection.

Scoped tests separately exercise tampering/authority/scope/integer failures, registry mismatch/nonce/sequence/expiry, immutable rights/partial plans/duplicate obligations/concurrency, changed holdings and principal burn, exact acknowledgement mismatch/reference reuse/unknown/late events, a real SQLite-trigger failure after manifest insertion, and a restored verified backup reopened by a new Node process. Actual commands/outcomes belong to the current task checkpoint; source assertions or a written runbook alone do not mean passed. Built-origin authorization plus actual normalized chain reads and the PostgreSQL adapter path need their own integration evidence.

Technical reference checked10October2026: [Node22 crypto sign/verify](https://nodejs.org/docs/latest-v22.x/api/crypto.html#cryptoverifyalgorithm-data-key-signature-callback). Authority configuration and source provenance do not prove the underlying external ledger is true.
