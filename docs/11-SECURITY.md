# Security and trust model

[Architecture](../TECHNICAL.md) · [Paged protocol](34-PAGED-SERVICING.md) · [API](15-API-CONTRACT.md)

Current v4 source uses checked Anchor/SPL instructions and a fail-closed relay/recovery journal. This is a verified test prototype, not a production security certification. The separately recorded public v3 deployment has its own release and historical evidence.

## On-chain authority and assets

- Issuer signs creation, schedule append, registry administration, issuance, funding, activation and proposal creation. Minting is draft-only. After activation, v2 may register a **zero-balance** receiver between record locks; existing indices never move and historical prefixes never expand.
- Any fee payer can open due coupon/maturity capture, capture the next page and finalize complete rights. An absent issuer cannot veto v4 maturity. Even an abandoned voting capture can be finished after its deadline to release the lock.
- The holder signs transfers, personal coupon claims, voting and principal retirement. Permissionless coupon settlement can pay only the canonical historical beneficiary. It cannot choose another recipient or amount.
- Principal transfer and the corresponding burn occur in one transaction. Failed payment rolls back burn, totals and masks. Historical coupon rights remain payable after retirement. One shared per-holder/event paid bit protects claim and executor settlement.

Bond mint/freeze authority is the program PDA. Positive holdings remain frozen outside the controlled program transfer/burn path, preventing direct SPL transfer/burn or authority change from bypassing record-date policy. Canonical program owner, discriminator, PDA/bump, mint, ATA, wallet/index and typed Token/System accounts are validated; CPI targets are not supplied freely by the caller. Closed/recreated **zero** canonical ATAs have an explicit checked path; missing financial balances are not generically filled with zeros.

Record-date locks prevent late transfers and registry appends until capture completes. Each event fixes its registry prefix; pages must arrive in order. Finalization reconciles captured units with supply before claims. Amounts use checked u64/u128 arithmetic and BigInt; subunit remainders, overflow, conflicting rates and invalid ordering/dates reject.

## Relay, storage and observation

Exact prepared message, all required Ed25519 signatures, wallet identity, transaction lifetime, genesis and reviewed program image are checked before relay. Canonical signed bytes/intent/signature/ID commit before send. Same ID/different intent conflicts; an unknown outcome is not permission to re-sign.

SQLite uses DELETE/EXTRA, verified rollback, real interprocess locks and fresh filesystem guards. Typed STORAGE_BUSY is emitted only after known cleanup; uncertain cleanup fails closed. PostgreSQL uses verified TLS, acknowledged COMMIT and writer-generation fencing. Lost acknowledgement/rollback failure poisons the writer instead of enabling local fallback or SQL replay. Keep one hosted writer per namespace; do not point preview deployments at the production recovery journal.

GET recovery never relays. Explicit rebroadcast may resend only the original verified bytes under expiry/genesis/release guards. Business status, finality observations and retained proof commitment remain separate. Missing/pruned history never upgrades a receipt to freshly finalized.

V2 graph reads use bounded batches and a revision fence, with `sameBank:false` and slot-range disclosure. External SPL observations and bounded proposal discovery are not an atomic/exhaustive bank snapshot. On-chain account validation and fresh simulation still protect execution after an API read.

## Remaining trust and operating assumptions

| Boundary | Current policy / limit |
|---|---|
| Program upgrade authority | Can change code; no production multisig/timelock certificate |
| Settlement-mint authority | External mint/freeze authority can affect availability; test token is not fiat or a regulated bond |
| Reserve | Full prefunding; no issuer surplus withdrawal; donated surplus is not an unpaid liability |
| Transfer compatibility | Classic SPL controlled transfers; ordinary SPL/DEX interoperability not claimed |
| Scale | Pages replace v2 whole-issue16/8 arrays; tested33→34 holders/9 coupons, with explicit API/wire/discovery budgets |
| Holder keys | Principal needs the holder; no lost-key/legal-title recovery mechanism claimed |
| Wallet UI | Sign-only transport is tested; successful ordinary human Phantom signing remains unverified |
| External settlement | Signed sandbox/shadow adapters only; dispatch disabled and on-chain paid bits untouched |
| RPC/hosting | Availability/history/provider honesty remain assumptions; free-tier uptime is not guaranteed |

## Evidence scope

The matching v4 SBF is959536 bytes with SHA `ee2bb0f7eef91f04722b4b9f834d58d3bc4dc2fc3f76905dfc1d7521f8f1ee12`. Actual isolated CI rebuilt it and passed3 Rust unit /20 SBF+SPL runtime tests, including64 sequences, authority/account/rate failures, duplicate claims/burn/ballots, frozen vaults, capture locks and atomic payment rollback. Application/PG/browser checks have their separately recorded scopes in [verification history](VERIFICATION-HISTORY.md).

[The prepared launcher](evidence/servicing-v4-one-command-check-20261010.json) additionally completed37 transactions, independently observed finalized, with zero supply/vault/obligations. [The larger cohort](evidence/servicing-v4-localnet-summary-20261010.json) retains253 execution proofs and explicit later history gaps. Neither is a human-wallet test, formal audit, partner endorsement or permission to use mainnet/real assets. Older security notes and their failures remain recoverable at [the pre-cleanup Git snapshot](https://github.com/dimik98330/solana-worldsfair-2026/blob/9b64a52b7ea98a5bd8bb9f81dbfc611d08aa3a4b/docs/11-SECURITY.md).
