# BondTrace: реальные предельные параметры и откат failed CPI

Дата: 2026-10-08. Этап: P11–P14 из `docs/20-FULL-ISSUER-PLAN.md`, закрытие конкретных пробелов program evidence. Это проверка существующего прототипа, не новая оценка конкурсной готовности или сертификат безопасности.

## Scope, skills и воспроизведение

- Рабочий корень: `C:\Users\dmitrii\Documents\solana`.
- Изменения этого задания: только дополнение `tests/program/runtime.rs` и этот report; raw output в ignored `.local/program-limits-checks/`.
- Прочитаны `AGENTS.md`, `CODEX_SOLANA_WORLDSFAIR_START.md`, `docs/00-STATE.md`, `docs/20-FULL-ISSUER-PLAN.md`, актуальные последние commits и scoped diff/status.
- Применены установленные `.agents/skills/proofpilot/SKILL.md` в **coach mode**, direct implementation route (`references/solana-new.md`, `routing.md`); `.agents/skills/solana-dev/SKILL.md` с `references/testing.md`/`security.md`; `.agents/skills/review-and-iterate/SKILL.md` и security/compute/review references. Venture discovery, account onboarding и очередной scoring не запускались. Capability helper запускался с абсолютным проектным skill root.
- Solana documentation MCP не обнаружен среди инструментов этой сессии. Конфигурация и установки вне ownership не менялись; официальные страницы проверены через read-only browsing.
- WSL Ubuntu toolchain: `/home/dmitrii/.cargo`, `/home/dmitrii/.local/bondtrace-tools`. Использован существующий `scripts/test-program.sh`, `NO_DNA=1` включён самим wrapper.
- Ни active validator/ledger, ни RPC, ни настоящие кошельки не затрагивались. Все signer keys созданы внутри LiteSVM и не экспортированы.

```powershell
wsl -d Ubuntu -- bash -lc 'cd /mnt/c/Users/dmitrii/Documents/solana && bash scripts/test-program.sh > .local/program-limits-checks/runtime.log 2>&1'
```

Перед воспроизведением создать `.local/program-limits-checks/`. Wrapper компилирует host tests, но не перестраивает SBF: runtime загружает `target/deploy/bondtrace.so`.

## Зафиксированный исполняемый артефакт

Program ID: `B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8`.

SBF: **463096 bytes**, SHA256 **15525ec2de285e7cc3065f7ec8ce47bfe81d1ed2837754b85b8cf2598c935dc2**. Hash проверен до и после запусков; program source/IDL/dependencies не менялись.

Финальный wrapper завершился exit 0: **Rust unit 3/3, SBF runtime 7/7**. Существующие пять runtime tests сохранены; добавлены два. Первоначальный запуск также 3/3 + 7/7; финальный повтор нужен после усиления boundary assertions и добавления полного transfer bundle. Оба лога сохранены отдельно: `runtime-initial.log` и `runtime.log`. Существующие Anchor `unexpected cfg` warnings не блокируют тесты; никаких dependency updates для их скрытия не выполнялось.

## Maximum-parameter lifecycle

Тест `maximum_parameters_complete_all_holders_coupons_and_v0_bundles` выполняет реальные инструкции существующего SBF:

1. Инициализирует выпуск с **64 UTF-8 bytes** в имени (`Қ` × 32) и **8 разными coupon terms**. Неверные имя65 и девятый корректно упорядоченный купон отклоняются с `InvalidTerms`; account creation откатывается.
2. Создаёт bond ATA через настоящий idempotent ATA instruction и регистрирует **16 разных wallets**. Выдаёт им 1…16 единиц: все16 положительные, supply **136**. Валидный 17-й wallet/ATA отклоняется именно с `RegistryFull`.
3. Полный резерв — `136 × (1000000000 + 1000000 + … + 8000000) = 140896000000` settlement base units. Funding на **одну base unit меньше** не разрешает seal; после добавления1 exact reserve проходит. Начальное settlement source balance и все конечные balances сверяются.
4. Создаёт proposal с **96 UTF-8 bytes** (`Қ` × 48); title97 отклоняется с `InvalidTerms`, proposal creation откатывается. Snapshot содержит все16 положительных weights. Все16 голосуют, highest bit15 устанавливается первым, повторный ballot отклоняется; final mask `65535`, yes64/no72.
5. Выполняет полный application transfer bundle: ATA idempotent + transfer holder15 → holder0 на одну единицу. Все16 остаются положительными; новые holdings `2,2,3,…,15,15`, total136. Proposal сохраняет прежние weights; все8 будущих coupon snapshots фиксируют новые holdings.
6. По очереди фиксирует все8 record dates, затем redemption snapshot. Проверяет каждый snapshot vector, supply и `next_coupon_index=8`.
7. Погашает всех16 держателей с **actual ATA creation + burn + principal**; highest bit15 устанавливается первым, повторная выплата отклоняется. Total burned136, final state `Redeemed`, principal mask65535, mint supply0. В vault остаётся полный historical coupon reserve **4896000000**.
8. После всех burns выполняет **128 coupon claims** (8 × 16). В каждой coupon mask проверяется highest bit15 и duplicate rejection, paid total и final mask65535. Каждый holder получает ровно recorded units × (principal + все8 coupons). Final vault0; source decrease равен первоначальному полному резерву.

В final maximum test отправлены207 успешных v0 transactions, каждая предварительно simulated. Это не один мегабатч: registry/issue/claims идут отдельными транзакциями, как в приложении.

## Размеры реальных v0 bundles

Не измерялись только сериализованные instruction args или legacy message без overhead. Каждый измеренный bundle включает **SetComputeUnitLimit**, actor как fee payer/signature, а в соответствующих действиях — реальный idempotent ATA instruction. Применены static addresses, без ALT. Simulation cap1400000 CU, окончательный cap — measured consumption ×1.2 с округлением вверх +1000, минимум10000; send проверяет этот cap.

Финальный прогон (максимум внутри каждого класса действия):

| Bundle | Bytes | CU | Static accounts |
|---|---:|---:|---:|
| initialize, name64/coupons8 | 740 | 35077 | 10 |
| register + новая bond ATA | 461 | 46097 | 10 |
| issue units | 360 | 35877 | 7 |
| fund vault | 393 | 18796 | 8 |
| seal exact reserve | 319 | 12177 | 6 |
| proposal title96/holders16 | **996** | 69799 | **23** |
| vote | 353 | 24636 | 7 |
| transfer + existing bond ATA | 499 | 50723 | 11 |
| capture holders16 | 881 | 69899 | **23** |
| begin redemption holders16 | 814 | 58952 | 21 |
| principal + новая settlement ATA | 525 | **71801** | 12 |
| historical coupon + existing ATA | 493 | 32145 | 11 |

Максимальный observed wire size **996 ≤ 1232 bytes**, accounts **23 ≤ 64**. Каждый actual send в maximum test имеет CU <200000 и ≤simulated final cap. CU зависят от случайных fixture addresses и canonical PDA bump searches: в первоначальном прогоне capture16 потребил **108899 CU** — самый большой расход по двум сохранённым прогонам. В final maximum scenario максимум71801 CU; в старом сохранённом16-holder test final capture81876 CU. Таблица не обещает абсолютную CU верхнюю границу для всех возможных pubkeys или runtime versions.

## Failed payment CPI после успешного burn

Тест `failed_settlement_cpi_after_burn_rolls_back_principal_and_all_token_state` использует настоящие SPL Token инструкции в LiteSVM:

- Fixture settlement mint получает test freeze authority. Только этот test mint изменяется fixture setup; deployed SBF не изменяется.
- Holder имеет3 bonds, exact reserve3150000000; coupon snapshot и redemption snapshot уже зафиксированы.
- **После redemption snapshot** holder settlement ATA замораживается `FreezeAccount` с подписью fixture authority.
- Отправляется настоящий redeem transaction. Logs и порядок проверяют `Burn` CPI, его success до `TransferChecked`, затем именно SPL `AccountFrozen`17 / `0x11` на payment CPI. Это не отказ Anchor destination validation до burn.
- После failed transaction **все шесть accounts побайтно равны состоянию до redeem**: Bond, bond mint, holder bond ATA, vault, settlement destination ATA, Coupon. Supply3/holder3, principal bit0, redeemed total0, phase `Redeeming`, vault3150000000, destination0. Fee payer исключён из этого сравнения: transaction fees не являются откатываемым token/program state.
- Реальный `ThawAccount`, затем redeem succeeds once: supply0, principal3000000000, remaining historical coupon150000000. Второе погашение отклонено. Последующий coupon claim завершает vault0, destination3150000000.

Final failed-transaction consumption **42787 CU**; initial **44287 CU**. Эти CU не являются ценой успешного redemption. Failure transaction здесь использует существующий legacy fixture runner; полный maximum lifecycle выше отдельно исполняет реальные v0 bundles.

## Источники и ограничения

Официальные страницы прочитаны **2026-10-08**:

- [Solana Transactions](https://solana.com/docs/core/transactions): атомарность state changes, fee treatment при failure, packet/account limits для legacy/v0.
- [Solana Freeze Account](https://solana.com/docs/tokens/basics/freeze-account): frozen token account не принимает перевод до thaw; freeze authority подписывает FreezeAccount.

Конкретные результаты — local SBF evidence, не сведения о devnet. Не проверены здесь human-wallet signing/cancellation, live RPC, devnet deployment, registration/submission, performance на validator под нагрузкой, fuzz/property coverage всех комбинаций дат/сумм/адресов и влияние будущих program upgrades. У classic settlement mint freeze authority остаётся external settlement trust/liveness risk: atomic rollback сохраняет bonds, но сам по себе не заставляет mint authority разморозить ATA. Тесты не являются независимым полным security audit или доказательством юридической пригодности инструмента.

## Continuation handoff

Lead обновляет `docs/00-STATE.md` и final evidence pointers; этот агент shared state/Git/config не редактировал. Новый/возобновлённый чат сначала читает AGENTS/START/STATE/docs20 и последние commits, выбирает и читает подходящие установленные skills до существенной работы и повторяет правило в каждом assignment/handoff. Не переустанавливать bundle, не менять program source для прохождения этих тестов, не трогать live validator/ledger. Сохранять scope: private repo; public visibility, mainnet/real funds/paid services, owner account/Terms/KYC/final submission gates не разрешены этим runtime evidence. Следующий шаг — lead integration P11–P14 и review фактически работающего issuer workflow; program-limit gap в указанном scope закрыт.
