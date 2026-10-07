# B03 — восстановление guided demo bootstrap

Дата: 2026-10-08. Корень: `C:\Users\dmitrii\Documents\solana`. Ownership worker: `server/seed.ts`, `tests/client/bootstrap-recovery.test.ts`, этот checkpoint. Lead owns operations/effects/index/UI/config/dependencies/Git и normal full smoke. Реальные процессы/validator/RPC/кошельки/ledger worker не изменял.

## Обязательная преемственность

AGENTS/STATE/START/docs21 и текущие seed/operations/effects/transactions прочитаны; продолжение обязано повторить AGENTS/skill rule. Skills: установленный **ProofPilot coach**, direct implementation route (routing/solana-new/quality), **solana-dev** (testing/security), **review-and-iterate** (code-review/security guidance), **debug-program** (debug-workflow/common-pitfalls). Не перезапускались идея/установка/официальные assessment budgets. Solana MCP tools в host не обнаружены; конфигурацию/установку worker не менял, использовал публичные official RPC docs. Skills/актуальные gates переносить в каждый handoff/checkpoint.

## Причина и исправление

Прежний retry partial seed создавал новый `Date.now()` series и снова выполнял settlement MintTo; лишь последняя fund_and_seal signature попадала в parent operation. Нельзя было установить, какие промежуточные действия уже отправились.

Теперь parent получает immutable `metadata.bootstrapPlan` + canonical SHA256 `bootstrapPlanDigest` **до airdrop/sign/send**. План фиксирует network/genesis, роли/адреса, series, все minor amounts, coupon/record/maturity dates и 11 детерминированных child IDs. Series детерминирован по genesis/request ID. Финансовые значения — BigInt → decimal strings. План никогда не изменяется при resume.

Каждый шаг — отдельная durable `bootstrap_step` operation. Transaction callback `onSubmitted` атомарно сохраняет child signature и parent progress вместе с receipt/lifetime внутри existing execute. Повтор callback при уже связанной signature отклоняется до network; signature другого issue не используется как новый receipt (ждать свежий blockhash и явно resume). Фактические activity kinds сохранены. Signed wire остаётся в ignored receipt storage и не выдаётся progress API.

POST того же `operationId` и того же `reset` сверяет старые signatures и продолжает только ещё не отправленные шаги. Confirmed не пересылаются; pending/unknown блокируют продолжение; definitive rejection не вызывает автоматический replacement. Ошибка до signature сохраняет план и допускает explicit retry. Другой ID во время активного процесса отклоняется; finished/superseded progress не понижается конкурентным старым callback.

Полный старый fixture архивируется в catalog **до** выбора нового fixture одной transaction. Новый parent signature устанавливается только после всех 11 шагов и confirmed final fund_and_seal; partial parent не выглядит complete лишь из-за промежуточного receipt. Завершение атомарно сохраняет complete fixture/catalog/parent.

## Explicit funding и reset

Devnet bootstrap **никогда не вызывает requestAirdrop**. Недостаточный test SOL возвращает TEST_SOL_REQUIRED, адрес роли и funding_required; manual funding + same-ID POST продолжает тот же frozen plan.

Localnet stock faucet сохраняет `airdropRequestStarted` до request; известная signature затем сохраняется и сверяется. Потерянный response без signature никогда не приводит к повторному requestAirdrop. Explicit same-ID POST может проверить свежий достаточный balance и завершить funding precondition как **balance-only**, `chainStatus=not_submitted`; `airdropOutcome=unknown` и исходный request flag сохраняются. Это доказательство текущего баланса, не поддельный confirmed faucet receipt. Недостаточный баланс оставляет блокер.

Если frozen record date истёк, даты не переписываются. Explicit **reset=true с новым ID** может заменить partial plan только после чтения всех его signed receipts: каждый должен быть confirmed/error, ни один pending/unknown; faucet request без signature также блокирует reset. Прочитан и проверен предыдущий Bond account. Actual partial issue архивируется; reserved fixture без существующего issue не попадает в catalog; confirmed issue при недоступном account блокирует reset.

Freeze transaction повторно проверяет child signatures/request flags, сохраняет наблюдённые statuses, сохраняет old plan/journal, помечает old parent `superseded`/`bootstrapSupersededBy` и создаёт новый plan/fixture. Старый resume и old `onSubmitted` проверяют active fixture/суперсессию и больше не отправляют шаги. Partial legacy bootstrap без собственного plan нельзя безопасно пересоздавать автоматически; требуется owner review/отдельный namespace с сохранённой историей. Unknown faucet без signature может восстановить funding precondition по балансу, но unsafe partial reset с таким неопределённым request всё равно запрещён.

## Контракт для lead API/UI

`bootstrapStatus(id)` — synchronous local getter; не вызывает send/airdrop и не запускает bootstrap. Root GET должен использовать getter, а не POST runner. Lead добавляет свою chain identity/финальную receipt verification к GET.

Public snapshot: operationId/status/final-only signature/bond/explorerUrl/chainStatus/projectionStatus/error; `bootstrap` содержит mode/reset/planDigest, completedSteps/totalSteps, nextStep, steps, canResume/canCheckFunding/requiresExplicitResume/resumeOperationId/supersededBy. Child rows содержат id/operationId/kind/status/signature/chainStatus/projectionStatus/fundingVerification/error. Private signed wire/keys отсутствуют.

Parent metadata: bootstrapVersion=1, bootstrapPlan, bootstrapPlanDigest, bootstrapProgress; complete-fixture reuse — bootstrapExisting. Explicit replacement — bootstrapReplaces/bootstrapSupersededBy. Blocker — bootstrapBlocked/bootstrapBlockedBy. UI сохраняет исходный ID **и reset flag**, показывает retained child и pending/unknown, предлагает явный same-ID POST `Resume test setup`. canCheckFunding означает read current balance через explicit POST, не повтор faucet. GET/polling не продвигает незапущенные шаги.

## Проверки и ограничения

Все bootstrap tests запускают новые subprocesses в `.local/tests/bootstrap-<uuid>` с existing generated TEST signer API и mocked fetch; публичный `synthetic-transport.json` используется только как тестовый журнал. Ключи не выводятся/не передаются через stdin; live evidence не создаётся. Token/account data в tests синтетические; эти проверки доказывают transport/journal/restart поведение, не выполнение программы в validator.

Команды:

```powershell
node --import tsx --test tests/client/bootstrap-recovery.test.ts
node --import tsx --test --test-name-pattern="reset|expired" tests/client/bootstrap-recovery.test.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

Последний completed full запуск до добавления actual-partial archival testcase: **7/7 passed**, 0 failed/skipped, 128.00 s. Последний reset/expired запуск на стабильном seed после уточнения observed child status: **2/2 passed**, 0 failed/skipped, 45.00 s; TypeScript **exit 0**. Предыдущий повтор упёрся только в worker deadline 25 s при параллельной нагрузке Windows; изолированный test deadline увеличен до 45 s, app/RPC timeouts не менялись, оба cases перепроверены успешно. Всего текущий файл содержит **8 scenarios**; это не заявление о собственном едином 8/8 запуске. Lead запускает полный финальный suite и реальный normal bootstrap через built origin после stable handoff. Seed/tests stable, дальнейших code edits worker не планирует.

Покрыто: accepted funding response loss → fresh-process same-plan resume; unknown/processed/error child без дополнительного send; abrupt process.exit(41) после сохранения signature/send; failure before issue signature → explicit retry без повторного mint funding; local faucet response loss + manual sufficient balance без второго faucet; devnet insufficient/manual funding без auto-airdrop; new reset без phantom catalog; elapsed-window actual partial archival, immutable old dates/plan и запрет old sends после supersession. Old complete fixture catalog проверяется отдельно. Test helper initially ошибочно требовал confirmed от намеренно blocked faucet; исправлен. Кратковременная quote syntax error после catch-уточнения выявлена compiler и исправлена до следующего успешного прогона; не выдана за working integration.

Официальные источники, accessed 2026-10-08: [requestAirdrop](https://solana.com/docs/rpc/http/requestairdrop), [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses), [getBalance](https://solana.com/docs/rpc/http/getbalance). Faucet signature существует только в ответе; null receipt не доказывает failure. SDK/SQLite — уже установленные dependencies, без upgrade/install.

Stopping gate сохраняется: login/consent/final external submission/public repo/mainnet/real funds/paid services — owner actions. Next: lead интегрирует read-only status branch/explicit resume UI, финальные tests/typecheck, fresh API normal bootstrap и regression existing-data evidence. Это localnet/devnet prototype recovery, не production audit/certification.
