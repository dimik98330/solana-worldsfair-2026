# BondTrace: архитектура и зафиксированный интерфейс

Checkpoint 07.10.2026. Skills: ProofPilot **coach**, bounded `plan -> review` и direct Solana implementation; solana-dev (Anchor, design patterns, security, testing, compatibility); scaffold-project; review-and-iterate. AGENTS.md, START и STATE прочитаны. Это разрешённый permissioned прототип для localnet/devnet, без mainnet и реальных активов. Реализация находится в `C:\Users\dmitrii\Documents\solana\programs\bondtrace`; проверки — `C:\Users\dmitrii\Documents\solana\tests\program`. Интеграцию, dependencies/lockfiles/config/Git ведёт главный агент. Изменение этого документа не заменяет обновление STATE главным агентом.

## Решение и допущения

Нужна собственная программа, потому что корпоративные действия требуют неизменяемых прав на выплату, блокировки передачи на record date, одноразового погашения и голосов по историческому составу держателей. SPL Token выполняет реальные mint/transfer/freeze/burn/settlement CPI; программа управляет правилами. Reference scaffold — официальный Anchor pattern и `program-examples` из установленного scaffold catalog. Код написан для выбранного ТЗ, не клонирован из непроверенного протокола.

Прототип ограничен **16 заранее зарегистрированными кошельками и 8 купонами**. Регистрация и выпуск только Draft; seal фиксирует состав/количество. Ограничение обеспечивает атомарное чтение всех token accounts. Реальные LiteSVM-транзакции с 16 accounts проверены: capture839 bytes/83_376 CU, proposal884 bytes/84_584 CU, begin redemption772 bytes/75_763 CU в одном из прогонов; все меньше1232 bytes/200k CU. PDA bumps меняют CU, поэтому клиент всё равно симулирует. Это разрешённый issuer-controlled registry, без KYC, юридического реестра, банковского расчёта или интеграции с KASE. Голосование информационное, не меняет финансовые условия.

## Деньги и время

Bond mint: classic SPL Token, decimals=0, mint/freeze authority=Bond PDA. Держатели используют canonical ATAs и целое число облигаций. Ненулевые holdings постоянно frozen; только `transfer_units` выполняет thaw/transfer_checked/freeze атомарно. Issuer не может напрямую подписать mint/freeze authority.

Settlement mint: classic SPL Token, decimals=6. `face_value` и `unit_amount` — **u64 в миллионных долях settlement token на одну облигацию**. Например face 1000 = 1_000_000_000 base units; 10% годовых, 2 выплаты/год дают 50 = 50_000_000 units на купон. Программа хранит фиксированные coupon amounts и даты, а не процентную ставку. Клиент выводит amount из условий выпуска; неподтверждённые дополнительные metadata не становятся on-chain facts. Все сложения/умножения checked; дробная облигация и плавающая арифметика отсутствуют.

Даты i64 Unix seconds читаются из настоящего `Clock::get()`. Все record dates строго возрастают; payment>=record; payment<=maturity; firstrecord>init now. Register/issue/seal требуют now<firstrecord. Клиент должен показывать ускоренный demo separately from example two-year term. Программа не содержит admin clock override. Payment dates не убывают; проверка выполнена при инициализации.

## State machine и обязательства

`Draft(0) -> Active(1) -> Redeeming(2) -> Redeemed(3)`.

`seal_issue` требует vault >= issued × (face + sum(coupon amounts)). Нет issuer withdrawal: старые купонные права остаются обеспеченными после смены владельца и погашения. Излишек добровольного funding остаётся в vault; возврат excess сознательно вне MVP.

Для первого ещё не captured купона transfers прекращаются при now>=record_ts. Permissionless `capture_coupon` атомарно читает actual SPL amounts всех canonical accounts в точном registry order и проверяет sum=mint_supply=issued. Поэтому даже запоздалый capture видит состав на due record date: с этого момента передачи блокированы. Snapshot нельзя задним числом перезаписать. После capture transfers вновь разрешены до следующего uncaptured record/maturity. Coupon claim использует старый snapshot, а не текущий баланс.

При maturity transfers прекращаются независимо от capture. `begin_redemption` требует все coupon snapshots captured; claims могут быть незавершены. Redemption snapshot использует **текущих** holders, сохраняя старые coupons. `redeem_principal` атомарно burns все принадлежащие holder snapshot units и платит face×units. Unique bit предотвращает повтор; финальный burn переводит state в Redeemed. Coupon claims продолжают работать после Redeemed.

## PDAs, аккаунты и размеры

Program ID: `B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8`. Anchor=1.1.2 exact; Agave CLI=3.1.10; native Rust=1.91.0. Установки из официальных release assets в `/home/dmitrii/.local/bondtrace-tools`, transient PATH; глобальная Solana network config не менялась.

| Account | Seeds (program ID выше) | Allocation incl discriminator |
|---|---|---:|
| Bond | `bond`, issuer pubkey, series_id u64LE | 1093 |
| bond_mint | `bond_mint`, Bond pubkey | SPL Mint |
| vault | `vault`, Bond pubkey | SPL TokenAccount |
| Coupon | `coupon`, Bond pubkey, index u8 | 224 |
| Proposal | `proposal`, Bond pubkey, proposal_id u64LE | 323 |
| Ballot | `ballot`, Proposal pubkey, voter pubkey | 82 |

Wallet ATAs derived with classic SPL Token program. Empty canonical ATA may be closed by its wallet: snapshot treats system-owned empty canonical address as zero, and re-created initialized empty SPL ATA as zero. Zero SPL accounts still require correct SPL program and bond mint; changed owner/delegate/close authority on a recreated empty canonical address cannot block a snapshot. Nonempty accounts must have correct token owner/mint/wallet and Frozen state. Destination newly recreated empty ATA is thawed conditionally then frozen after receiving. Delegate/custom close authority rejected.

Account layouts in exact Borsh order are `programs/bondtrace/src/state.rs`. Fields must be decoded against generated IDL, not guessed offsets. `Bond`: issuer, bond_mint, settlement_mint, vault Pubkey; series_id u64; name String<=64; face_value u64; maturity_ts i64; total_issued/total_redeemed u64; state/bump/next_coupon_index u8; principal_claimed_mask u16; holder_wallets Vec<Pubkey><=16; coupon_terms Vec<{record_ts:i64,payment_ts:i64,unit_amount:u64}><=8; redemption_units Vec<u64><=16. Coupon/Proposal units use immutable Bond registry order.

## Stable instructions

Account order is defined by `programs/bondtrace/src/contexts.rs`. `s` signer, `w` writable; unspecified read-only. Every Bond seeds/canonical bump relationship validated on-chain. Parameter order below is wire order.

| Instruction / args | Accounts in exact order |
|---|---|
| initialize_issue(series_id:u64,name:String,face_value:u64,maturity_ts:i64,coupons:Vec<CouponTerms>) | issuer(sw), bond(w), bond_mint(w), settlement_mint, vault(w), token_program, system_program, rent |
| register_holder() | issuer(sw), bond(w), wallet(SystemAccount), holder_bonds(w), bond_mint, token_program, associated_token_program, system_program |
| issue_units(amount:u64) | issuer(s), bond(w), bond_mint(w), holder_bonds(w), token_program |
| fund_vault(amount:u64) | funder(s), bond, settlement_mint, source(w), vault(w), token_program |
| seal_issue() | issuer(s), bond(w), bond_mint, vault |
| transfer_units(amount:u64) | holder(s), bond, bond_mint, source(w), destination(w), token_program |
| capture_coupon(index:u8) | payer(sw), bond(w), coupon(w), bond_mint, system_program; remaining ALL holder bond ATAs, exact registry order |
| claim_coupon(index:u8) | holder(s), bond, coupon(w), settlement_mint, vault(w), destination(w), token_program |
| begin_redemption() | issuer(s), bond(w), bond_mint; remaining ALL holder bond ATAs |
| redeem_principal() | holder(s), bond(w), bond_mint(w), holder_bonds(w), settlement_mint, vault(w), destination(w), token_program |
| create_proposal(proposal_id:u64,title:String<=96,closes_at:i64) | issuer(sw), bond, proposal(w), bond_mint, system_program; remaining ALL holder bond ATAs |
| cast_vote(support:bool) | voter(sw), bond, proposal(w), ballot(w), system_program |

Client creates holder canonical ATA idempotently before register. Claim destination can be any legitimate classic SPL token account owned by holder for settlement mint; no arbitrary recipient. Snapshots take read-only accounts; votes have separate unique Ballot PDAs and weighted tally plus a backup per-holder mask. Events aid timeline display; account state and confirmed transactions are authoritative evidence, logs alone are not.

## Verification checkpoint

Actual checks: native cargo check passed; SBF build passed (463096 bytes); generated Anchor IDL passed and saved at programs/bondtrace/bondtrace-idl.json/.ts; standalone cargo test runtime passed5/0 and unit tests passed3/0. Runtime executes real SBF+SPL CPI, including16 holders, frozen direct transfer/burn rejection, zero ATA close/recreate/change owner, record dates, reserve, two coupons, immutable votes and old coupon claims after Redeemed. Official Solana MCP autofixer returned issues=[] and suggestions=[]. These are prototype checks, not an audit or mainnet readiness. Lead local RPC test validator is running on127.0.0.1:8899/WS8900 with genesis-loaded program; Windows getHealth=ok and program executable=true were checked. Full browser/public/devnet integration is the lead responsibility and remains distinct from these results. No Git actions, final submission, visibility change, paid services, mainnet or real funds permitted by this handoff.

Primary-source provenance and tests will be updated in `docs/research/kase-chain.md` and `docs/11-SECURITY.md`.
