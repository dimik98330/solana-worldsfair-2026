# S06 — сохраняемый координатор жизненного цикла

2026-10-08. Root: `C:\Users\dmitrii\Documents\solana`. Реализована авторизованная внутренняя стадия S06 из docs/29-BACKEND-STRENGTHENING.md. Этот worker владеет только **новыми** server/lifecycle-run.ts, tests/client/lifecycle-run.test.ts и данной запиской. API routing, operations integration, demo/runtime scripts и top-level docs принадлежат lead.

Прочитаны текущие AGENTS.md, docs/00-STATE.md и утверждённый strengthening plan; START и неизменённые навыки переиспользованы в том же контексте. Применены установленные **ProofPilot coach** (direct implementation, bounded plan → review), **solana-dev** (RPC/recovery/security/testing) и **review-and-iterate**. Research/judging package ведёт другой worker; существующие assessment lineage/budgets не сбрасываются. Mandatory rule выбирать/читать фактически установленные SKILL.md перед substantial work обязательно сохраняется для lead/review/каждого следующего handoff. Skills и mocks не устанавливают working live integration.

## Экспорты и API wiring

`createLifecycleRunCoordinator(deps)` возвращает:

- `planLifecycleRun(request)` — сохраняет immutable manifest и читает состояние, никогда не отправляет транзакции;
- `runLifecycle(request)` — explicit start/resume с тем же parent ID; отправка возможна только в выбранном generated localnet режиме;
- `lifecycleRunStatus(operationId)` — только наблюдает/reconciles уже сохранённые child outcomes и coherent financial graph; GET никогда не dispatch.

Эти функции также экспортированы с production dependencies: readChainView, chainIdentity, assertVerifiedProgram, существующие operations, coupon-run и динамический demoAction. `LifecycleRunDependencies` позволяет изолированно проверить orchestration; private keys в нём отсутствуют.

Строгий request содержит только четыре **обязательных** поля:

```json
{
  "operationId": "stable-lifecycle-id",
  "bondAddress": "complete-selected-instrument-address",
  "mode": "review-only",
  "maxTransactions": 1
}
```

Modes: `review-only` или `explicit-localnet-generated-issuer`; maxTransactions — integer1…4. Extra fields, absent/invalid mode/limit/ID/address отвергаются. maxTransactions ограничивает **текущий explicit вызов**, не меняет подписанные финансовые параметры, digest или child ID. В review-only ответ `readyActionRequest` подходит существующему wallet prepare flow; generated mode запрещён на devnet, при disabled demo и при несовпадении issuer выбранного выпуска с реальным generated fixture issuer.

Lead должен добавить lifecycle_run special recovery routing до generic unsigned operation branch и соответствующие API plan/run/status routes. Result всегда `action:'lifecycle_run',signature:null`: parent не выдаётся за отдельную on-chain транзакцию.

## Сохраняемая модель

Manifest фиксирует genesis, program ID/SHA/program length, issuer, sealed registry, instrument/mint/vault addresses, series ID, issued units, face/maturity, все coupon record/payment/unit terms и optional immutable on-chain FinancialTerms. Draft не превращается в sealed manifest автоматически. Digest проверяется при каждом load; stage IDs детерминированы от parent/digest/kind/couponId.

Stages: `capture_coupon` и `coupon_run` для каждого coupon, затем `begin_redemption`. Normal direct children создаются в durable operations до callback; для coupon_run сохраняется dispatch request в parent metadata до вызова существующего executor. Сам coupon_run сохраняет свой immutable snapshot и детерминированные группы: заранее создавать неполный coupon_run record без его plan было бы несовместимо с existing loader.

В parent сохраняется fenced lease120секунд; concurrent explicit POST не владеет отправкой. Перед каждым dispatch проверяются lease owner/expiry, immutable release, generated issuer и child binding. Замена lease owner во время первого callback блокирует следующий child. finally снимает только собственный lease. Другой активный generated lifecycle того же bond не получает новый manifest. Отсутствующая/неизвестная signed child или nested coupon group требует восстановления прежней подписи; новая отправка для других children блокируется. Definitive failure сохраняется как parent error. Same-ID input conflict и wrong child/release блокируют выполнение.

Каждый callback вызывается максимум один раз до нового explicit resume, если он прерван до outcome или вернул отсутствие durable signature. Coordinator не делает implicit financial POST retry. Unsigned crash безопасно возобновляется с тем же fixed child ID; signed crash восстанавливается по уже сохранённой подписи. Никаких новых signer files, rebroadcast policy или holder-signing delegation этот модуль не вводит.

## Границы финансового результата

Состояния: ready, waiting_date, running, pending, unknown, blocked, error, awaiting_holder_signature, financially_closed. До даты нет dispatch. Capture использует eligible sequential record date; coupon settlement использует existing bounded coupon_run; begin redemption ждёт maturity/all captures.

Открытие redemption возвращает отдельные holder barriers с точным principal amount и `redeem_principal` unsigned requests. Coordinator **никогда** не подписывает/не вызывает redemption за держателя и не делает issuer burn. Невыплаченные исторические купоны продолжают обслуживаться независимо от principal burn.

External manual effects допускаются по validated coherent graph как `satisfied_external`, signature:null, externallySatisfied:true. Coordinator не создаёт выдуманную подпись для уже захваченного snapshot/оплаченного coupon/open redemption. financially_closed требует одновременно все captured coupons, exact remaining coupon+principal obligations0, mint supply0 и redeemed==issued. Donation/surplus не блокирует закрытие: vault не обязан равняться0.

`financialClosure` и `finality` отдельны. Finality содержит linked direct/nested observations и unlinkedExternalEvents. Direct fresh status может иметь live-rpc source; nested receipts показывают retained-observation. У unlinked manual events и внешних holder principal signatures aggregate finality остаётся unknown/finalityPending даже при financially_closed. Account graph на confirmed не повышает transaction finality. Если нужны доказанные финальные holder outcomes как часть parent, lead должен добавить отдельное explicit linkage; этот модуль честно раскрывает текущий предел.

## Проверено и остаток

```powershell
node --import tsx --test tests/client/lifecycle-run.test.ts
```

**15/15 PASS, 0 skipped**. Уникальный ignored namespace `.local/tests/lifecycle-run-<uuid>`, synthetic coherent ChainView, actual existing coupon-run executor/SQLite journal и injected send/recovery dependencies. Проверены before-date noTx, review-only noTx, capture→coupon batch→redemption holder barrier, maxTransactions, unsigned child persisted before callback, SQLite close/reopen + new executor with same child ID, signed unknown restart, nested unknown coupon group, conflicting parent/child inputs, concurrent parent lease, in-flight lease replacement, callback without signature/no implicit loop, foreign issuer/devnet/disabled demo, changed terms/release/genesis, external effects, closure with surplus9 и finality unknown.

SQLite close/reopen и пересоздание executor подтверждены в этих unit tests; отдельный fresh process/actual validator restart и built-origin API cycle ещё не выполнялись worker. Источники runtime, chain identity и selected program release simulated в unit tests, не являются live attestation. Initial syntax error в dispatch object был исправлен до successful suite. Lead global typecheck выявил control-flow narrowing у arrow fail helper и aggregate-vs-transaction finality union; worker исправил function declaration/explicit load type и default runtime-narrowing wrapper, не скрывая aggregate кастом. `npm run typecheck` затем прошёл; 15 targeted tests повторно прошли. Scoped diff/whitespace check прошёл, conflict markers отсутствуют.

Lead integration gate: relevant whole-client regression suites, route/operation recovery contract, actual built-origin lifecycle с тем же parent ID после interruption/API restart и honest linked finality evidence; typecheck повторить после любых дальнейших integration edits. После результатов обновить docs/00-STATE.md. Existing ledgers/signers/evidence, other UI work, dependency/config/Git сохранены. Stopping gates: бесплатные testlocalnet/devnet и reversible implementation; без mainnet/real funds/paid/public visibility/final external submission/account consent.

## Дополнительная contract regression перед live driver

При чтении настоящего demoAction перед live запуском worker обнаружил, что normalizeRequest добавляет `params.bondAddress` из top-level field. Ранее direct stage сохранил только couponId/пустые params: pre-created child конфликтовал бы с claimDemoOperation, а stageChild recovery сравнивал бы неверные stripped inputs. Это обнаружено **до** chain execution. По отдельной lead authorization direct capture/begin-redemption stage params теперь создаются через реальный normalizeRequest и сохраняются в manifest/child одинаково. Synthetic sender tests также нормализуют настоящий ActionRequest; добавлена explicit persisted binding + SQLite reopen regression. **16/16 targeted tests PASS,0 skipped; npm run typecheck PASS**. Старые результаты15/15 выше сохраняются как предыдущий cutoff, не переписываются задним числом. Для записанных до исправления incompatible manifests сохраняется fail-closed/no-send, а не скрытая смена child inputs.
