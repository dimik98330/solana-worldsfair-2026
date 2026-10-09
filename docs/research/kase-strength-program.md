# Усиление program/client: атомарные процентные условия и stateful SBF

8 октября 2026. Корень: `C:\Users\dmitrii\Documents\solana`. Worker ownership: только `programs/bondtrace/src/{lib,contexts,state}.rs`, `packages/client/src/program.ts`, `tests/program/runtime.rs`, `tests/client/financial-terms.test.ts`, этот checkpoint. Lead владеет сборкой, IDL, зависимостями/config, ledger/runtime/deployment, интеграцией, Git и top-level docs. Существующий dirty checkout и все исторические данные сохранены; ключи не читались.

## Навыки и границы

Фактически прочитаны project-local `solana-dev/SKILL.md` и Anchor/security/testing references, `review-and-iterate/SKILL.md` и security-basics/code-review-rubric/compute-optimization, `proofpilot/SKILL.md` и routing/solana-new. ProofPilot явно применён в **coach**, direct implementation из существующего задания; новый поиск идеи, новые оценки и сброс старого bounded review budget не выполнялись. Colosseum не нужен для этой локальной реализации. Custom program выбран потому, что проверка самой финансовой формулы должна происходить при атомарном создании выпуска в SBF.

В начале прочитаны AGENTS, START, STATE и backend-focus; git status подтверждает уже изменённые файлы. Перед любой substantial задачей или продолжением каждый агент обязан снова соблюдать AGENTS: выбирать и читать актуальные установленные skills/references, сохранять stopping gate и ownership. No mainnet/real funds/paid/public visibility/final submission/consent/commit/push в этой задаче.

Host раскрывает `mcp__solana_docs__Solana_Documentation_Search`; реальные вызовы выполнены для Anchor PDA/init/signer constraints и детерминированных test keypairs. Инструмент `program_autofixer` отсутствует в callable inventory этого host, хотя docs tool description его упоминает. Его выполнение **не заявляется**. Конфигурация MCP не менялась.

Технические первичные источники, чтение через Solana docs MCP 2026-10-08: [Anchor account constraints](https://github.com/solana-foundation/anchor/blob/HEAD/docs/content/docs/references/account-constraints.mdx), [Solana SDK keypair](https://github.com/anza-xyz/solana-sdk/blob/HEAD/keypair/src/lib.rs). Версии проекта сохраняются: Anchor 1.1.2, LiteSVM 0.9.1; обновление toolchain/framework не выполнялось.

## Реализованный интерфейс

ADDITIVE `initialize_rate_issue` оставляет старый `initialize_issue` для фиксированных/нерегулярных сумм. Layout `Bond`, существующие accounts/error ordinals и старые instruction argument order сохранены. Общая проверка названия/дат/числа купонов/суммарного unit liability выделена без изменения правил.

Новые args: старые `series_id:u64, name:String, face_value:u64, maturity_ts:i64, coupons:Vec<CouponTerms>` затем `rate_bps:u16, frequency:u8`. Accounts: issuer, bond, bond_mint, settlement_mint, vault, **financial_terms**, token_program, system_program, rent. Все четыре init accounts создаются в одной транзакции. Fail в handler/constraint/CPI откатывает их все.

`FinancialTerms` PDA seeds `[b"financial_terms", bond]`, canonical bump. Точный Borsh payload53B + discriminator8B = **61B**:

| Поле | Тип | Offset с discriminator |
|---|---|---|
| version | u8 | 8 |
| bond | Pubkey | 9 |
| nominal | u64 | 41 |
| rate_bps | u16 | 49 |
| frequency | u8 | 51 |
| unit_amount | u64 | 52 |
| bump | u8 | 60 |

Version1, nominal>0, rate1..10000bps, frequency1..12. Checked u128 numerator=`nominal*rate_bps`, denominator=`10000*frequency`; remainder должен быть0, quotient>0 и помещаться вu64. **Каждый** coupon unit_amount обязан совпасть с quotient. Суммарные face+coupons также обязаны помещаться вu64 как раньше. Частота — явно заданное число купонов в год; договорной day-count/calendar-frequency проверки этот прототип не утверждает.

Нет update/close/attach instruction для FinancialTerms. Нельзя добавить sidecar к ранее созданному выпуску и назвать его программно проверенным: новый handler требует init самого Bond. Существующий signed Memo — историческая provenance, не ретроактивная аттестация новой инструкции.

Client exports `deriveFinancialTerms(bond)`, `initializeRateIssue(...existingArgs,coupons,rateBps,frequency)` returns `{bond,mint,vault,financialTerms,ix}` и `decodeFinancialTerms(bytes)` returns `{version,bond,nominal,rateBps,couponFrequency,unitAmount,bump}`. Decoder отвергает длину кроме61, discriminator/version/ranges/formula mismatch. RPC owner/PDA/bond linkage проверяет интеграционный read layer lead; standalone byte decoder не доказывает account ownership.

## Проверки, добавленные в source

- Direct SBF initialization:20 bad cases — rate/frequency bounds,zero nominal, remainder/sub-unit, mismatch±1, каждое из8мест расписания, liability overflow. Все четыре accounts обязаны отсутствовать после fail; source/mint bytes не меняются. Успешная формула9e18×1000/20000=4.5e17 проверяет intermediate>u64 при корректномu128.
- Signer/PDA: другой fee payer не позволяет compiler автоматически повысить issuer до signer; issuer signature обязателен. Подмены Bond/mint/vault/terms, другой issuer namespace, readonly terms отвергаются атомарно.
- Terms immutability: exact61B/version/fields/canonical bump, repeated initialization rejected, canonical10×1000×10%/2 coupon500 + principal10000, transfer after record, full burn, delayed operator coupon. Terms account полностью совпадает до/после цикла. Legacy issue sidecar отсутствует после попытки attach.
- Stateful test:64seeded sequences, default root seed `0xb07d7ace20261008` плюс индексы0..63. SplitMix64 фиксирует временные in-process addresses, allocations, action ordering и варианты claim/settle/votes/transfers. Эти тестовые ключи не читают signer files и никогда не используются вRPC.
- Независимая модель проверяет current holdings/supply/issued−redeemed, snapshot vectors и права после transfer/burn, exact masks/paid totals/beneficiary balances, `paid+remaining=initial liability`, `vault+paid=funded`, immutable terms, proposal snapshot/vote weights. Failure snapshots сравнивают все program/token account bytes/lamports, включая CPI burn→frozen settlement transfer и duplicate coupon bundle; fee-payer SOL исключён, поскольку failed tx платит fee.
- `BONDTRACE_SEQUENCE_SEED=0x...` воспроизводит одну последовательность; любой panic печатает exact seed и replay command. Это bounded deterministic stateful/adversarial suite, **не** coverage-guided fuzzing или доказательство всех возможных последовательностей.
- Client4cases: additive serialized instruction/account roles, fixed interface preservation, mismatches/ranges/remainder, strict61B/version/discriminator/exact decode и wide integer arithmetic.

## Текущий результат и следующий шаг

Scoped `git diff --check` прошёл. Shared build/tests **ожидают lead window**: worker их не запускал. Существующие12meaningful runtime tests сохранены. Новые четыре runtime cases доводят planned total до16runtime, но passing до реального выполнения не заявляется. Unit layout test дополнен FinancialTerms61B; прежний Bond1093B/Coupon224B/Proposal323B/Ballot82B сохранён.

Lead запускает SBF build → native Rust tests against this exact artifact → IDL generation/client checks → API integration и built-origin lifecycle. После результатов обновить этот checkpoint фактами/log paths; старые SHA/evidence не выдавать за proof новой версии.

Lead build SBF прошёл: 541456B, reported SHA prefix761b99; точный release manifest принадлежит lead. Первый compile native runtime tests отклонил два неоднозначных `sum()` (четыре E0283 diagnostics): `assert_eq!` имеет дополнительные `u64: PartialEq<serde_json::Value>` реализации. Все шесть model sums явно уточнены `sum::<u64>()`. Evidence первого compile: `.local/strengthening/program-tests.log`. Повторное выполнение пока ожидает lead; worker shared build/IDL/tests не запускал.

В выделенном lead окне worker запустил `npm run test:program`; выполнение остановилось **до Cargo** с `WSL path resolution failed`. Read-only direct `wsl.exe -d Ubuntu --exec wslpath ...` вернул exit−1 и `Wsl/Service/CreateInstance/MountDisk/HCS/ERROR_FILE_NOT_FOUND`: указанный WSL диск `C:\Users\dmitrii\AppData\Local\wsl\{d767f740-b7a4-48bb-b851-8c3c16e144fa}\ext4.vhdx` не найден. Это конкретный runtime blocker текущего host, не провал SBF-инварианта. Никакая настройка/регистрация/repair WSL со стороны worker не выполнялась. Log `.local/strengthening/program-tests-repair.log`. 64 последовательности пока не объявляются прошедшими.

Клиентский narrow run через штатный установленный loader `node --import tsx --test tests/client/financial-terms.test.ts` **4/4 passed**,0 failed/skipped, log `.local/strengthening/financial-terms-tests-tsx.log`. Первоначальный прямой Node strip-only запуск несовместим с уже существующим `Reader` parameter property; отдельный failed log `.local/strengthening/financial-terms-tests.log` сохранён, source ради обхода штатного loader не менялся. Shared SBF/IDL не пересобирались.
