# Backend strengthening contract

Authorized8October2026; refreshed10October. This is the invariant map, not a claim that every historical run passed.

| Area | Required behavior | Contract/evidence |
|---|---|---|
| Runtime | Native namespaces, disk/readiness checks, bounded logs, ownership-checked restart; retain genesis/keys/IDs | [Setup](LOCALNET-SETUP.md) |
| Terms | Immutable rate/frequency/face; checked integer math; reject fractional base units | [Architecture](../TECHNICAL.md), [security](11-SECURITY.md) |
| Finality | Separate actual observation, retained proof and missing RPC history | [History](VERIFICATION-HISTORY.md) |
| Stateful checks | Deterministic supply/snapshot/payment/burn/CPI-rollback sequences | [CI](integrations/CI-VERIFICATION.md) |
| Reproduction | Explicit source-only staging, pinned release; no owner credentials/runtime fixtures | `scripts/reproduce-source.mjs` |
| Recovery | Durable IDs/wire/lifetime; passive reconciliation; no replacement signing after unknown outcome | [API](15-API-CONTRACT.md) |

Legacy server coordinators retain parent/child operations. Paged v4 uses explicit actions and a durable CLI lifecycle plan; the legacy coordinator does not automatically service v4. Frequency is a formula divisor; dates imply no day-count convention. Principal remains holder-signed. Generated test signers are distinct from human wallets.

The [original S01–S06 plan](https://github.com/dimik98330/solana-worldsfair-2026/blob/9b64a52b7ea98a5bd8bb9f81dbfc611d08aa3a4b/docs/29-BACKEND-STRENGTHENING.md) remains historical. Preserve old layouts, ledgers, signers and failed checks. No ledger reset/mainnet/real funds/paid services/visibility change/new consent/final submission is authorized here.
