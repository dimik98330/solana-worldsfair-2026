# KASE: аудит программы и узкое исправление 08.10.2026

## Scope и правила

Root: `C:\Users\dmitrii\Documents\solana`. Это новый запрошенный implementation audit программы, client adapter и runtime-тестов, не новая конкурсная оценка и не сброс исчерпанного backend assessment budget. Прочитаны AGENTS, START, STATE, backend focus/readiness, SPEC/ARCHITECTURE и PLAN. Frontend принадлежит другому чату; он не изменялся. Git, credentials, signers, исходный validator ledger и живые транзакции не затрагивались.

Фактически прочитаны установленные `.agents/skills/solana-dev/SKILL.md` (Anchor/security/testing), `.agents/skills/review-and-iterate/SKILL.md` (security basics/review rubric/compute), `.agents/skills/proofpilot/SKILL.md` (routing, Solana implementation, review/plan, evidence/safety/quality). ProofPilot **coach**, `plan → review` в рамках инженерного улучшения существующей спецификации. Colosseum/market research и формальный score здесь не нужны. При продолжении обязательны AGENTS и выбор/чтение подходящих установленных skills до существенной работы; historical review budgets сохраняются.

Первоначально разрешён только read-only и этот отчёт. После конкретного finding lead отдельно разрешил изменения `programs/bondtrace/src/lib.rs`, `tests/program/runtime.rs`, сборку существующим script и изолированный LiteSVM. Схема, IDL, state/contexts остаются прежними. Связанная API-правка передана API-agent; client adapter — lead.

## Findings и действия

### P2-PROGRAM-01 — выдача ломается после восстановления пустого ATA — исправлено

Владельцу SPL-account разрешено закрыть frozen account с нулевым балансом. Восстановленный canonical ATA имеет состояние Initialized. До исправления `issue_units` безусловно вызывал ThawAccount; SPL отклоняет thaw уже размороженного счёта. Повторная регистрация невозможна, так как wallet уже в registry. Это отказ штатного восстановления выдачи, а не обход полномочий или кража.

- Место: `programs/bondtrace/src/lib.rs:127`, ветка `issue_units`; analogous recovery уже существовал в `transfer_units`.
- Reproduction: новый `draft_issuance_recovers_recreated_empty_holder_account` в `tests/program/runtime.rs:684`: real SPL close → idempotent recreate → legitimate issuer issue.
- До: на исходном SBF SHA256 `15525ec2de285e7cc3065f7ec8ce47bfe81d1ed2837754b85b8cf2598c935dc2` тест упал: `InstructionError(0, Custom(13))`, `IssueUnits → ThawAccount → Invalid account state for operation`, 12934 CU. Это наблюдавшееся выполнение, не предположение.
- Исправление: thaw вызывается только для Frozen. Для иной ветки обязательны `state == Initialized && amount == 0`; прежние проверки registered owner, canonical ATA, mint, delegate/close-authority и issuer signer остаются перед ней. Mint затем снова freeze. Никакой schema/ABI change.
- После: тот же тест проходит; проверяет unauthorized issue rejection, две выдачи, итоговый frozen balance2, отклонение nonempty Initialized fixture без изменения supply, затем seal, capture, burn+principal и historic coupon после погашения. Итог: coupon100000000, principal2000000000, supply0, vault0 (base units, тестовая VM).
- API preflight тоже ранее требовал только Frozen (`server/admin.ts`, `issue_units`); API-agent получил отдельную задачу поддержать missing/empty Initialized canonical ATA с безопасным idempotent create. Этот отчёт не утверждает его итоговую интеграцию без lead проверки.

Официальный SPL source: [processor.rs](https://raw.githubusercontent.com/solana-program/token/main/program/src/processor.rs), прочитан08.10.2026: initialization задаёт Initialized, close разрешён при amount0, thaw требует Frozen. Версионно точное поведение дополнительно подтверждено локальным SBF/SPL runtime, не только текущим upstream.

### P2-CLIENT-02 — coupon index молча преобразуется в другой купон — передано lead

`packages/client/src/program.ts:18,37,38` использует `Uint8Array.of(...)` для PDA/инструкций без проверки диапазона и целочисленности. Прямой adapter вызов с256 либо0.5 не отклоняется, а кодирует0. Это нарушение exact intent у прямого клиента, не подтверждённый HTTP exploit: `server/request-contract.ts:46` уже ограничивает индекс0..7.

Наблюдавшаяся read-only Node проверка:

```text
derive('coupon', PROGRAM_ID, 256) == derive('coupon', PROGRAM_ID, 0)
PDA: 5XKc89qgzK8WLucLzFwXgqSpjartEaS23RCDcFsYwGEe
captureCoupon(..., 256, []).data[8] == 0
claimCoupon(..., 0.5).data[8] == 0
```

Минимальное исправление: единый strict validator coupon index0..7 до derive/capture/claim; не конвертировать дроби, NaN/Infinity и переполнения. Узкие tests: допустимые0/7 и bigint seeds; reject−1,8,256,0.5,NaN,Infinity. Ownership packages/client у lead; агент программы не менял adapter.

## Проверенные инварианты и отвергнутые ложные findings

По исходникам и повторно выполненным runtime-тестам материального P0/P1 в проверенном scope не обнаружено. Это ограниченный audit, не гарантия отсутствия уязвимостей.

- Record date: transfers прекращаются на первом due uncaptured record; delayed capture не даёт передвинуть права. Проверяются exact registry order, canonical accounts, sum of holdings=mint supply=issued. Возобновление transfer после capture не меняет прошлые coupon/voting rights.
- Купоны: фиксированные positive unit amounts и schedule — on-chain terms; rate/frequency обозначены как local display metadata. `couponPerBond` exact integer formula проверена на10×1000×10%/2=500; sub-unit rounding отклоняется. Это выбранная архитектура, отсутствие on-chain годовой ставки не заявлено багом.
- Финальный coupon не исчезает: begin_redemption требует все coupon snapshots captured; historical claims остаются доступны после REDEEMED. Separate coupon/principal transactions — документированная модель. Тест двух купонов и runtime maximum8 выполняют её, не подменяя финальный купон principal.
- Redemption: issuer открывает maturity snapshot; holder подписывает собственный burn и выплату в свой settlement account. Двойной claim блокируется, mint supply уменьшается, платёжный CPI failure откатывает уже выполненный burn и все account bytes.
- Reserve: seal требует полный principal+все coupons; checked u64 sums/products. Withdrawal не добавлялся, unpaid historical coupons остаются обеспеченными. Excess locking и issuer-triggered begin redemption — раскрытые границы модели, не новые exploits.
- Voting: immutable weights, signer, proposal/ballot PDAs, one ballot per wallet и expiry проверены; transfer не создаёт второй вес. Quorum/executed governance отсутствуют в выбранном простом voting scope; не объявлены готовыми.
- Пределы16 holders/8 coupons, classic SPL6-decimal settlement, whole bonds — явные ограничения прототипа. Noncanonical positive holdings не принимаются. Zero closed/recreated ATA handling в snapshots не даёт добавить supply.

## Фактические проверки

| Команда/проверка | Наблюдавшийся результат |
|---|---|
| `node --import tsx --test tests/client/domain.test.ts` |5/5 passed, включая точный KASE расчёт, overflow, claims, IDL discriminators |
| `cargo test -p bondtrace --test runtime draft_issuance_recovers_recreated_empty_holder_account -- --exact --nocapture --test-threads=1` до fix |0passed/1failed; указанное SPL InvalidState13 |
| `pwsh -NoProfile -File scripts/build-program.ps1` |SBF build passed;462232bytes; hash ниже |
| Тот же exact regression после rebuild |1passed/0failed |
| `pwsh -NoProfile -File scripts/test-program.ps1` |3unit+8runtime passed;0skipped, включая128coupon claims и atomic burn rollback |
| `git diff --check -- programs/bondtrace/src/lib.rs tests/program/runtime.rs` |Passed |
| `git diff --quiet --` state/contexts и оба IDL |Unchanged |

Existing Anchor macro `unexpected cfg` warnings сохранены; новых dependency/config changes для их подавления не делалось. Максимальный сохранённый runtime scenario:16positive holders/8coupons/16votes/16redemptions/128coupon claims, supply0/vault0; largest observed bundle996bytes. Это in-process SBF execution с test sysvar time travel, не new localnet/devnet transactions и не human-wallet test.

Build artifact `target/deploy/bondtrace.so`: SHA256 `a46736e7e38b27db356f78c3dcefad0c02ef2147eaa21cb0161cfb6ee53739e1`,462232bytes. Прежний `.so` сохранён в ignored `.local/program-audit-20261008/bondtrace-before-15525ec2.so`; только binary, без keypairs. Логи: `.local/program-audit-20261008/build-after.log`, `regression-after.log`, `program-after.log`.

Source SHA256 после проверки: `programs/bondtrace/src/lib.rs` = `39c4a37070ab14605af6fa339ab08f2ddf40101ebae791621518b022efbd7877`; `tests/program/runtime.rs` = `fe95252044f07f10f6b98825e1f1452e397d403ceeebfa0d99811be2e03b900e`.

## Handoff и stopping gate

Внесены только program handler, meaningful runtime regression и этот отчёт. Текущий живой validator этим агентом не перезапускался и не обновлялся; новый SBF подтверждён только в изолированной VM. Lead должен отдельно согласовать новую binary provenance и built-origin verification, сохранив original ledger и historical evidence; API-agent завершает согласованный recovery preflight, lead — coupon adapter validation. Нельзя объявлять новый handler уже работающим на прежнем live validator. Mainnet/real funds/paid services/repo visibility/account consent/final submission остаются вне этих действий.
