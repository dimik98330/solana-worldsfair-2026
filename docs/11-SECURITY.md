# BondTrace: security model и проверка

07.10.2026, verified prototype checkpoint. Skills: ProofPilot coach/direct implementation, solana-dev security/testing/Anchor, review-and-iterate security-basics. Mandatory AGENTS/skill rule сохраняется в каждом handoff. Localnet/devnet test wallets разрешены; mainnet/реальные активы/paid/final submission запрещены. Не запрашивать/не печатать приватные ключи. Lead owns Git/dependencies/STATE.

## Границы доверия

Issuer выбирает фиксированные даты/amounts и <=16 permissioned holders **до** первого record date. Seal требует полные тестовые settlement reserves. Holder подписывает собственные transfer, coupon/principal claims и vote. Permissionless payer может capture due coupon, но не изменить amounts/holders. Upgrade authority — отдельный существенный operational trust, не устранённый прототипом. Это не аудит и не production certification.

Classic SPL bond mint/freeze authority — Bond PDA. Minting только Draft, registry immutable Active, никакого issuer withdrawal. Coupon snapshots/claim mask хранятся навсегда; Ballot init PDA once. Snapshot verifies precise canonical keys, SPL program owner/mint and supply conservation; nonzero accounts additionally require wallet/Frozen/no delegate/closeauthority. Missing **empty** canonical ATA разрешена как zero только при system owner+empty data; recreated SPL zero также zero независимо от token owner/delegate/closeauthority. Frozen nonzero account cannot escape registry via direct SPL transfer/burn; actual SPL CPI/runtime checks passed, including direct frozen burn/transfer rejection.

Amounts are u64 settlement base units, decimals6; multiplication/addition checked; no rounded floats. Claim transfers fixed snapshot entitlement to a holder-owned token account for correct mint. Principal burn+transfer are atomic; error rolls back burn and mask. All privileged actors typed Signer with has_one issuer; all state canonical PDA constraints and typed Account ownership/discriminator checks. Typed Token program disallows arbitrary CPI target. Transfers/payouts reject source/destination aliasing; Anchor1.1 also rejects duplicate mutable accounts by default.

## Known limits / residual risks

- Fully prefunded settlement is suitable for demonstration, may be capital-inefficient in practice; no banking/KASE/custodian integration claimed.
- Issuer liveness needed to begin redemption; coupon capture is permissionless. Wallet lost keys prevent claims, no recovery path.
- Settlement mint may retain external mint/freeze authority (test token issuer); freeze can cause payment liveness failure. This trust must be visible in the demo and production design needs independent issuer policy.
- Program upgrade authority remains capable of changing behavior; no multisig/timelock in MVP.
- Surplus funding cannot be reclaimed; rent/state are retained to preserve one-shot records.
- One transaction reads at most16 ATAs. Measured with16 holders: snapshots/proposals fit884 bytes maximum in this run and84_584 CU maximum. CU depends on PDA bumps; simulate each client transaction.
- Registry holder array permits16 **pre-registered wallets**, not16 arbitrary real investors or proven adoption. No privacy, KYC, compliance/eligibility certification.
- Voting is informational, no cash-term mutation or malicious-proposal execution path.

## Verification matrix (actual execution)

| Invariant | Required evidence | Initial status |
|---|---|---|
| Valid fixed terms; integer exactness and overflow | Rust helper + runtime bad terms/overflow | Passed |
| Issuer-only changes; registration/issue/seal before first record | Runtime negative paths | Passed |
| Full reserve required; wrong mint/owner rejected | Runtime CPI and constraints | Passed, owner and mint redirects rejected without burn/pay/claim-bit changes |
| External transfer/burn fail on nonzero frozen holdings | SPL runtime negative paths | Passed |
| Snapshot complete/order; closed zero/recreated zero safe | Runtime regression | Passed, actual SPL close/recreate/owner-change |
| Transfer record gate and immutable old coupon ownership | Full flow before/after record | Passed |
| Coupon one-shot; old claim survives post-redemption | Full flow | Passed |
| Principal maturity, current-owner snapshot, atomic burn+pay one-shot | Full flow | Passed |
| Snapshot vote weight; unique ballot and window | Full flow negative + positive | Passed |
|16-holder tx size/CU | Serialized transaction + consumed CU | Passed: capture839bytes/83_376CU, proposal884bytes/84_584CU, begin772bytes/75_763CU |
| Anchor/SBF compatibility, IDL | Actual build | Passed |
| Official Solana autofixer findings resolved | MCP tool output + documented dismissals | Passed issues=[], no dismissals |

Evidence logs: programs/bondtrace/tooling/runtime-final-results.log (5/0 standalone including new wrong-mint and CU regression asserts), runtime-results.log (5/0 standalone), runtime-idl-binary-results.log (5/0 direct full execution), unit-results.log (3/0). Official program_autofixer structured result saved in mcp-autofixer-result.json. Initial unit test caught a documentation estimate error: Proposal is323 bytes, assertion/docs corrected and unit test passed. This remains local prototype verification; devnet/public/browser/full independent review and production audit are separate gates. No fuzz testing, formal verification or real funds were exercised.
