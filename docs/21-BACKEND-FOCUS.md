# Backend scope and acceptance

The owner authorized complete backend strengthening on8October2026: eligible holders → immutable record-date rights → exact entitlement → settlement/retirement → verifiable outcome. Coupon, maturity redemption and snapshot-weighted voting are implemented. The canonical example is500coupon and10,000principal for ten bonds of face1,000 at10% annually/semiannual.

Current contracts: [architecture](../TECHNICAL.md), [API](15-API-CONTRACT.md), [paged protocol](34-PAGED-SERVICING.md), [security](11-SECURITY.md), [verification history](VERIFICATION-HISTORY.md).

Legacy complete-graph reads use one bank context. Paged reads use bounded RPC batches plus a revision fence and expose `sameBank:false`. Missing/inconsistent financial data fails closed. Amounts are checked integer minor units.

Signed wire, ID, genesis, release and lifetime must be durable before relay. Unknown submission outcomes require same-ID recovery, never replacement payments. Chain confirmation and metadata projection remain separate.

The [original B01–B05 narrative](https://github.com/dimik98330/solana-worldsfair-2026/blob/9b64a52b7ea98a5bd8bb9f81dbfc611d08aa3a4b/docs/21-BACKEND-FOCUS.md) describes an earlier cutoff. Lead owns integration/config/dependencies/Git/docs. Apply AGENTS and installed ProofPilot coach plus relevant Solana/security/testing skills. Preserve separately maintained frontend WIP, ledgers, signers and evidence.

Source/local v4 verification does not prove a public v4 upgrade or ordinary Phantom success. Mainnet, real funds, paid services, visibility changes, new consent and final submission remain outside this scope.
