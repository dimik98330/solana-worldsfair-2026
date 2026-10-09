# Durable coupon run — backend implementation

8 октября 2026. Рабочий корень `C:\Users\dmitrii\Documents\solana`. Прочитаны актуальные AGENTS/STATE, исходные START instructions, `docs/26-BACKEND-EXECUTION.md` и A1/A2/A3 из `docs/research/kase-execution-review.md`. Использованы установленные `solana-dev` security/testing, `review-and-iterate`, ProofPilot **coach**, прямой implementation route. Уже прочитанные неизменившиеся навыки переиспользованы. Mandatory skills rule сохраняется для следующих агентов и чатов; старые bounded assessments не перезапускаются.

Scope этого worker: только `server/coupon-run.ts`, `tests/client/coupon-run.test.ts` и эта записка. Lead отдельно владеет `settle_coupon`, API action/build guards, routes, budget enforcement и live integration. UI, shared configuration, Git, текущие ledger/signers и процессы этим worker не менялись.

## Интерфейс и границы

`runCouponSettlement({operationId,bondAddress,couponId,maxBatches?})` явно запускает или продолжает localnet test executor. `couponRunStatus(id)` пассивно читает план, сверяет chain state и восстанавливает известные child receipts. GET никогда не вызывает sender или program-verification guard для новой подписи. `createCouponRunExecutor(deps)` даёт injectable readView/readGenesis/verifier/demoAction/operationStatus/fixture и scope flags для изолированных тестов.

Новый run разрешён только при `network=localnet`, включённом generated-demo режиме и совпадении fixture issuer с issuer выбранной облигации. Человеческие кошельки и devnet не автоматизируются. Подписи/ключи модуль сам не создаёт; отправка дочерней операции проходит существующий `demoAction` с role `issuer` и новой permissionless action `settle_coupon`. Фиксированные beneficiary destinations/суммы проверяет builder и on-chain instruction lead.

Status vocabulary: `ready`, `running`, `pending`, `unknown`, `blocked`, `error`, `completed`. Родитель — агрегат, поэтому `signature:null`; настоящие сохранённые signatures доступны в `groups[]`. У родителя нет выдуманной общей транзакции.

## Неизменяемое намерение

До первого sender call одним SQLite transaction сохраняется parent `Operation` с `action:'coupon_run'`, `metadata.couponRunVersion:1` и полным plan. План связывает:

- parent ID, genesis, Program ID, expected release hash и длину;
- bond/coupon canonical PDA, issuer, settlement mint/vault, series, registry;
- record/payment/capture time, exact unit amount, total units, units каждой registry позиции, snapshot bump;
- исходные claimed mask/paid total, read context и группы исходных unpaid positive holders размером до4.

SHA-256 manifest и parent ID определяют `coupon_<hash>` child IDs. Group recipient lists, amounts и child IDs никогда не пересобираются при replay. Same parent ID с другим coupon/bond получает conflict. Child action/role/params/wallet/bond проверяются до использования сохранённого результата. Изменение saved manifest без соответствия его digest блокирует продолжение.

Чтение для планирования и completion проходит `reconcile(view)`. Holder balances могут меняться после snapshot; transfer/principal burn не входят в immutable fingerprint, поэтому исторические coupon rights сохраняются.

## Возобновление и конкуренция

Перед дальнейшей подписью проверяются **все** имеющиеся дочерние операции. Signed child всегда идёт через passive `operationStatus`, без новой подписи или rebroadcast. `pending`, `unknown` и `confirmed` с незавершённой projection останавливают остальные группы. Unsigned active lease также останавливает второй worker; expired unsigned lease допускает только явное same-ID продолжение через существующий fenced lease механизм.

Parent progress использует transactional latest-read/merge/write. Completion требует текущей coherent paid-mask проверки всех positive rights и подтверждённых завершённых child receipts для каждой запланированной группы. Другой worker с pending child не может выдать false completion. Если все права были оплачены до планирования, допустим `completed` с0 children, нулевым лимитом новых транзакций и без invented receipts.

Competing holder claim до неподписанной группы даёт `blocked/PLAN_STATE_CHANGED`: получатели под старым ID не заменяются. Definitive child error сохраняется и останавливает run. Новый explicit parent ID может планировать remaining rights только после terminal prior run без unresolved signed children или активных unsigned leases. Даже ошибочно terminal parent не скрывает pending/unknown child от overlap check.

После сохранения signature и до send возможен crash. Такая операция остаётся unknown, если её outcome нельзя доказать; модуль сознательно не отправляет её повторно и не создаёт новый child ID. Это fail-closed recovery boundary, а не доказательство отсутствия исполнения.

## Ограничения работы и test-SOL

`maxBatches` — необязательный **per-call scheduling cap**, integer1..4, default4. Он не входит в request financial binding, immutable plan/digest или child IDs. После указанного количества новых child executions возвращается текущий passive status. Уже подтверждённые группы не расходуют этот cap; последующий запрос с тем же parent ID может выбрать другой cap.

Plan budget фиксирует максимум16 recipients,4 на batch, до4 transactions, ceilings12,000,000 lamports ATA topups +1,000,000 lamports transaction fee на batch, максимум52,000,000 test lamports на run из4 groups. Это **safety ceilings, not predicted charge**. Реальные оценки fee и ATA topups остаются в action preview. Fresh enforcement этих caps до persistence/send реализует lead в общих builder/transaction modules; executor не запускает дополнительный unsigned prepare и не выдумывает actual charge.

## Проверено

`tests/client/coupon-run.test.ts` использует настоящую SQLite, fixed public account models и synthetic dependency transport; private signers/live RPC не используются.

- Последний полный scoped suite: **16/16 passed,0 skipped**. Покрыты bounded4groups/16holders, canonical same-ID replay, durable manifest before sender, crash before signing/after signature persistence, response loss, projection pending, два executor worker instances с shared durable leases, competing claim, definitive error/new parent, terminal-parent hidden unknown, snapshot/genesis/release mutation, foreign child binding,0-child completion, scope restrictions и passive fresh-process recovery.
- Затем добавлен отдельный **actual process restart** regression: после `maxBatches:1` новый Node process читает тот же SQLite, пассивно подтверждает ready, выполняет только оставшуюся группу2 holders и сохраняет первую signature, весь digest и child IDs. Этот тест прошёл **1/1**, не выдаётся за повторный combined17-suite run.
- `npm run typecheck` прошёл после final test additions. Новые файлы проверены на whitespace/conflict markers.

Пример intended integration: POST `/api/demo/coupon-run` с6 recipients и `maxBatches:1` → первая группа4 confirmed, parent ready → штатный restart API → GET parent status (без send) → POST same ID с default cap → оставшаяся группа2 confirmed. Реальный built-origin/SBF smoke этого сценария, release.json и routes принадлежат lead; synthetic tests не подменяют эту live проверку.

Исходные failed test runs относились к неполному synthetic proposalDiscovery fixture и TypeScript partial fixture cast; они исправлены, не скрываются как production findings. Source on-chain semantics и wire/CU worst case проверяет отдельная программа/runtime работа lead. Два workers здесь — независимые executor instances в одном test process; отдельный OS process используется для restart recovery/resume, а прежние shared lease tests уже покрывают multiprocess ownership. Production durability, RPC honesty, source-to-binary attestation, public hosting и final submission не заявляются.

Handoff: сохранить AGENTS/mandatory skills, не менять fixed financial plan при последующем HTTP/UI wiring. Если пользователь хочет исполнить оставшиеся права после подтверждённого atomic error, нужен explicit новый parent ID. Mainnet/реальные средства/paid services/visibility/final submission остаются вне scope этого задания.
