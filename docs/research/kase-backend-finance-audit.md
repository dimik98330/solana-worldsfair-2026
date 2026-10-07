# BondTrace — независимый аудит backend и финансовой сверки

Initial review, 08.10.2026, cutoff 03:17 UTC+5. Mode: **ProofPilot coach**, decision_context: general; цель — улучшение работающего KASE backend, не новая оценка конкурсной заявки. Новая задача и `docs/21-BACKEND-FOCUS.md` расширили scope после issuer workflow; прежние bounded architecture/readiness reviews сохранены как история. Для этого отчёта допустимы initial + максимум две адресные проверки нового кода/evidence.

Reviewer прочитал AGENTS.md, START, STATE, план20/21, spec08, architecture09/security11, actual server/client/program code и относящиеся assertions. Skills: `.agents/skills/proofpilot/SKILL.md` (routing, review, evidence, safety, quality/quality-review, honest-evaluation, solana-new); `solana-dev` (security, Kit advanced); `review-and-iterate` (security-basics, code-review-rubric, compute-optimization); `cso` (backend code scope, exception/data-integrity/business-logic checks, daily confidence >=8/10). Файлы skills существуют и прочитаны; Solana MCP tools в этой сессии не обнаружены, установка/host config не выполнялись. Official docs использованы как read-only fallback. Colosseum market research и новый onboarding не нужны для этого scoped implementation review.

Ownership: reviewer изменяет только этот файл. Не выполнены POST, подписи, отправка транзакций, chain/ledger mutation, чтение keypair/auth files, installs, Git mutations или общий UI. Прочитанные отчёты/test assertions — inspected artifacts, не новые runtime PASS. Отдельный quality helper run/HTML/security-report не создавался из-за единственного разрешённого пути записи; результат не объявляется policy acceptance/сертификацией. Ни mainnet-ready, ни официальный score, ни win odds не присваиваются.

## Требование и границы

Публичный текст KASE сохранён в `.local/backend-focus/kase-source.txt`, URL https://superteam.fun/earn/listing/superteam-kazakhstan-x-kase-side-track-corporate-actions-on-blockchain, retrieved 2026-10-07T22:12:49.090Z. Проверяемый цикл: eligible holders → exact entitlement → execute/initiate → on-chain outcome. Нужны купон, principal redemption с retirement и дополнительное действие; BondTrace выбрал voting. Финансовая логика/Solana flow должны работать даже при моделировании внешних rails. Это не требование банковской интеграции, реальных денег, enterprise indexer, KYC или mainnet.

Предположения: permissioned prototype, до16 holders/8 coupons, classic SPL bond decimals0, settlement decimals6, loopback API, localnet/devnet, один оператор и нулевой внешний бюджет. Реальные main-hackathon registration, devnet funding/deployment, human-wallet approval/cancel и доступ жюри этим аудитом не установлены.

## Что уже снижает риск

- On-chain `lib.rs::snapshot` проверяет canonical ATA order, owner/mint и supply; ненулевые позиции frozen и без delegate/close authority. Zero canonical ATA разрешена как отсутствующая/system-empty или recreated zero, даже при изменённой token authority. Read model должен сохранять именно эту осознанную zero exception.
- Claim mask и checked u64 arithmetic защищают one-shot coupon/principal. Principal burn и settlement CPI находятся в одной транзакции; исторический runtime artifact сообщает rollback failed payment CPI, reviewer его заново не выполнял.
- Unsigned relay проверяет SHA256 точного message, наличие required signer и Ed25519 каждой signature **до** сохранения submitted identity. Это не authority bypass.
- `effects.ts` уже преобразует сбой projection **после confirmed receipt** в `UNKNOWN_STATUS`503. `demoAction` сохраняет его как pending, а не terminal error. Старый дефект «confirmed → ordinary error → разрешён повтор» не следует повторно объявлять открытым. Нужна стойкость этого исправления при eviction/restart, см. F06/F07.
- `transactionStatus` уже не трактует null receipt после lifetime как доказательство nonexecution. Existing test assertions покрывают transport loss, definitive preflight rejection, invalid signatures и synthetic init recovery в отдельном процессе; они не заменяют реальную проверку новой SQLite интеграции.

## Материальные findings initial baseline

Все нижеследующие дефекты трассированы по публичным API paths и существующему коду. Контрпримеры являются deductions из кода, если явно не указана локальная проверка; новых финансовых транзакций reviewer не выполнял. Приоритеты относятся к надёжности прототипа, не к способности украсть реальные средства.

### F01 — High: state объединяет несогласованные RPC contexts

Location: `server/state.ts:22,27,31-41`; `server/rpc.ts:17-18`. Clock, Bond, holders, vault, coupons, proposals и issuer balance читаются отдельными `getAccountInfo`; их context.slot не используется для общей view.

Контрпример: Bond прочитан до redemption (`redeemed=0`), holders/vault — после выплаты (`units=0`, vault уменьшен). API одновременно показывает старую principal liability и новые позиции. Transfer между двумя holder reads способен дать totals больше или меньше supply. BigInt предотвращает float rounding, но не делает разные состояния одной истиной.

Fix: discovery Bond, derive complete bounded graph, затем один `getMultipleAccounts` с confirmed commitment/minContextSlot. Повторно сверить discovery-sensitive fields (registry/terms/proposal set); при изменении bounded retry, после предела `STATE_CHANGED`/unavailable вместо смешанных чисел. Все финансовые значения и chain time относятся к одному возвращённому context; API отдаёт slot/commitment/provenance. `minContextSlot` — нижний порог, не запрос исторического snapshot.

Proof: synthetic mutation между discovery/final batch; отсутствие отдельных финансовых reads после batch; malformed/short/missing batch reject; реальный итог нового выпуска согласован после restart.

### F02 — High: API не сверяет conservation и claims

Location: `server/state.ts:20,33-41`; client decoders проверяют формат, но не все финансовые identities. Mint supply вообще не входит в текущий `getState`; coupon paidTotal считается доверенным отдельно от claimedMask.

Контрпример: прочитанный coupon `paidTotal > sum(entitlements)` формирует отрицательную coupon obligation; общая requiredReserve может уменьшиться/стать отрицательной. Отсутствующая holder ATA всегда превращается в0 без сверки mint supply. Missing snapshot для `index < nextCouponIndex` становится scheduled/current forecast, хотя должен существовать immutable record. Это дефекты fail-open RPC/read interpretation, а не доказательство, что program сам создаёт такую запись.

Fix в coherent view:

- `sum(current units) = mint.supply = totalIssued − totalRedeemed`; canonical bond mint authorities, decimals и initialized state. Nonzero holder token owner/Frozen/no delegate/closeauthority; zero exception соответствует program. Required vault/mints/Bond не подменяются нулями, absent optional issuer settlement ATA может означать0.
- Для каждого captured coupon: exact Bond/index/recordTs/paymentTs/unitAmount; `sum(units)=totalUnits=totalIssued`; mask не выходит за registry и не ставит bit для zero entitlement; `paidTotal=sum(claimed units×unitAmount)`; все indices перед nextCouponIndex существуют, последующие не приписываются recorded.
- Для redemption: `sum(redemptionUnits)=totalIssued`; claimed units=totalRedeemed; текущие units каждого holder равны непогашенным units его redemption snapshot; redeemed state требует supply0 и все ненулевые позиции погашены.
- Proposal: immutable identity/registry/snapshot total; ballot mask bound; `yesUnits+noUnits=sum(weights under mask)`. Отдельная проверка yes/no сторон через Ballot accounts не следует заявлять, если они не читаются.
- Все totals и remaining reserve проверяются на u64/неотрицательность; vault может иметь честно показанный surplus, его equality liability не требуется.

Proof: negative synthetic fixtures для supply mismatch, missing captured snapshot, unknown/high/zero mask bits, paidTotal mismatch, claimed-redemption/current mismatch, wrong owner/mint/authority/frozen; сохранённые реальные issues продолжают читаться с documented closed/recreated-zero ATA.

### F03 — High: финансовые параметры и target выбираются молча

Location: `server/actions.ts:19,23,33-36`; `server/transactions.ts:33`. Отсутствующие fund amount→`1000000`, coupon index→0, proposalId→1/title→demo string. `Number(couponId)` принимает `true` как1; top-level bond/params.bondAddress и aliases могут противоречить друг другу с молчаливым приоритетом. `fee.value === null` отображается как`0`.

Контрпример: `{action:'fund_vault',params:{}}` готовит реальный перевод одной settlement единицы. Для второго купона `couponId:true` выбирает1. `{couponId:1,index:0}` или два разных bond addresses не сообщает оператору ambiguity. Null fee — неизвестная комиссия, не бесплатная операция; официальный RPC допускает null.

Fix: action-specific required schema до финансовых RPC; явный canonical instrument, exact integer strings для денежных значений/u64 IDs, range-checked coupon ID без coercion. Missing/conflicting fields reject; одна выбранная compatibility alias может приниматься только с equality всех одновременно заданных aliases. Валидированный explicit title и vote choice. Fee null/malformed и missing CU estimate требуют понятного unavailable результата, а не0/фальшивого measured value. Текстовый summary называет token/decimals/amount/recipient/network из validated action.

Proof: API reject omissions/boolean/number/coercion/conflicting aliases/unknown fields, нулевые суммы и overflow **до send**; fee-null preview не становится signable fee0. Exact KASE arithmetic локально пересчитана:10×1_000_000_000×1000/(10000×2)=500_000_000 minor =500 settlement units; principal10_000_000_000 minor.

### F04 — Medium: idempotency привязана к порядку raw JSON

Location: `server/operations.ts:14-16`. SHA256 от JSON.stringify raw params не соответствует identity нормализованного действия. Тот же объект с переставленными keys или `00010`/`10` даёт другой digest. Same top-level bond binding уже добавлен в текущий demo path и покрыт assertion `demo-binding.test.ts`; прежний конкретный cross-issue дефект исправлен, но canonicalization остаётся отсутствующей.

Контрпример reorder локально воспроизведён чистым JS без файлов/RPC: `JSON.stringify({units:'10',bondAddress:'A'}) !== JSON.stringify({bondAddress:'A',units:'10'})`. Same recovery ID даёт OPERATION_CONFLICT для логически того же запроса. Aliases скрывают или добавляют digest differences, хотя builder отправляет одно действие.

Fix: normalize/validate action сначала; canonical projection только значимых action fields, stable key serialization, exact normalized addresses/decimal strings и explicit actor/network+chain identity+bond. Atomically insert ID/digest; тот же ID+same action возвращает прежний outcome; другой canonical action конфликтует. Raw request можно сохранить отдельно для диагностики, не использовать как financial identity.

Proof: reordered keys, equivalent decimal representations/aliases replay same ID; changed amount/target/actor/action conflict; persisted params+metadata существуют с первой записью, до awaits.

### F05 — High: before-send записи не являются одной durable transaction

Location: `server/store.ts:5`; `server/transactions.ts:39-41,55-58`; JSON files operations/prepared/lifetimes/activity/catalog. write+rename снижает риск partial JSON в одном процессе, но не фиксирует data/fsync и не создаёт atomic commit между файлами. Read-modify-write и общий `.tmp` конфликтуют между процессами.

Контрпример: kill между `completePrepared` и `rememberLifetime` сохраняет signature без lifetime/activity. Replay затем только awaitConfirmation; expiry logic ищет другой файл и может никогда не получить saved lifetime. Два процесса читают один operations.json, добавляют разные IDs и последним rename теряют один record; process-local mutationBusy этого не предотвращает. Это допустимые контрпримеры из кода, не выполненный kill настоящего API.

Fix: root-owned SQLite integration с transactional insert/update, безопасным проверенным journal/synchronous режимом, unique ID/signature/message identity, атомарным signature+lifetime+pending activity+recovery metadata commit **до send**. Cross-process conflicts не должны перезаписывать records. Legacy public metadata импортировать один раз, валидировать, сохранить originals/bytes; wallet/key directories не импортировать. Для уже сохранённой подписи никогда автоматически строить новое сообщение. Сбой между commit и send оставить honest unresolved или безопасно повторять только exact saved signed bytes при отдельно реализованном protocol; не утверждать landed по одному storage commit.

Proof: isolated DB transaction rollback/constraint/concurrency + fresh-process restart; fault boundary до commit не вызывает send, после commit signature/lifetime/activity/metadata вместе видны recovery. Kill/transport injection — synthetic/isolation evidence, отдельно от реального localnet cycle.

### F06 — High: eviction может удалить незавершённое recovery

Location: `server/operations.ts:16`, `server/store.ts:10`, `server/prepared.ts:13`; confirmed status задаётся до `applyConfirmedEffect` в `transactions.ts:61-63`.

Контрпример1: oldest unknown demo operation имеет signature;101st new operation `.slice(0,100)` его удаляет независимо от статуса. Потеря ID допускает новый beginOperation для того же исходного recovery request. Activity cap150 стирает historical confirmation, используемую при pruned RPC.

Контрпример2: signed preparation получает confirmed receipt, projection/catalog write fails UNKNOWN_STATUS; preparation остаётся `status='confirmed'` и попадает в terminal portion eviction после100 последующих previews, хотя metadata recovery ещё не завершено. Current code сохраняет большинство signed pending preparations, поэтому утверждение «любые pending preparations отбрасываются» было бы неверным.

Fix: bounded UI/history выборка отделена от authoritative durable records. Pending/unknown/chainConfirmed-projectionPending не удаляются. Terminal outcome и effectApplied имеют отдельные поля; cleanup unsigned expired previews допустим, unresolved signed identity всегда сохраняется. Existing pre-migration terminal error с signature не следует бездумно считать доказанным chain failure.

Proof: >100 operations и >150 activities/previews с unresolved oldest + confirmed projection failure; после restart его ID/signature/metadata recoverable, same ID не даёт новый send.

### F07 — High: успешный GET recovery не фиксирует outcome

Location: `server/operations.ts:19`; `server/transactions.ts:54`; `server/rpc.ts::transactionStatus`. operationStatus читает confirmed/reapplies effect и возвращает JSON, но не updateOperation/setPreparedStatus/recordActivity. Prepared already-submitted replay тоже не фиксирует полученную confirmation. terminal-error early-return вообще не проверяет signature.

Контрпример: send response потерян, API activity pending; следующий GET видит confirmed и делает projection. После restart/pruned RPC та же signature снова null, historical activity всё ещё pending: предыдущая наблюдённая confirmation потеряна, outcome снова unknown. Recovered preparations продолжают числиться pending, занимая recovery capacity. Старый ошибочный `status='error'` с confirmed signature после миграции не может repair через operationStatus early-return.

Fix: общий reconciliation state machine сохраняет confirmed/error receipt, slot/source/observedAt и effectApplied; при projection fail сохраняет известный chain-confirmed outcome и recoveryRequired. GET/relay/demo используют его идемпотентно. Terminal chain failure устанавливается только definitive preflight/actual error receipt; migration old ambiguous error+signature проверяется отдельно. Recovery outcome не запускает signing/send.

Proof: lost send → GET confirms → restart → null/pruned RPC сохраняет recorded confirmation с honest provenance; repeated GET не повреждает status/effects и ничего не sends. Error receipt остаётся error, post-confirm effect failure остаётся recoverable и не unblocks double action.

### F08 — Medium: receipt и lifetime не привязаны к genesis/endpoint context

Location: `server/rpc.ts:22-23`; `server/config.ts::localDir`; persisted record interfaces. Network label localnet и endpoint не различают два genesis после deliberate replacement ledger. Historical fallback подтверждает по signature/activity без stored chain identity.

Контрпример: новый локальный genesis на том же8899 с прежним `.local` catalog/activity. Null live receipt становится recorded-confirmation старой цепочки; applyConfirmedEffect может читать новый account graph. На активном ledger reviewer ничего не менял; это recovery boundary, не призыв сбрасывать validator.

Fix: capture `getGenesisHash` и configured network/endpoint at preparation/submission, bind durable records и live recovery. При genesis mismatch historical observation остаётся историей с явной provenance, но не удостоверяет live outcome/new projection и не снимает unresolved lock. Для legacy records без genesis отметить unknown association и проверить безопасно; не выдумывать current verified genesis для imports. Explicit expiry `null+height>last` сохраняет unknown и не разрешает новую подпись на основании отсутствующего receipt.

Proof: isolated mocked genesis change и legacy import; fail closed без new send, old artifacts сохранены. Lifetime no receipt/processed/error/confirmed/finalized cases различены; max wait возвращает последний реально увиденный unknown, а не просто pending.

### F09 — Medium: RPC ошибки и malformed bodies не имеют устойчивой API семантики

Location: `server/rpc.ts:11-16`; `server/index.ts::catch/body`. Все JSON-RPC errors по умолчанию400/nonretryable, malformed JSON response уходит generic500, HTTP429 `retryable=false`; raw decoder exceptions классифицируются regex message. Неизвестный/несогласованный chain read нельзя выдавать как ошибку денежных параметров.

Контрпример: server/rpc получает upstream node-not-ready/error или malformed result; пользователь видит RPC_ERROR400 как будто request неверен. Account decoder `Truncated program account` становится INTERNAL_ERROR500; counterfeit result shape может породить TypeError вместо стабильного INVALID_CHAIN_STATE. После send retryability транспортного запроса не означает, что разрешён новый financial send.

Fix: минимальная typed validation JSON-RPC envelope/id/result/context/shape и canonical addresses; 400 для проверяемого client input, 409 для state/idempotency conflict, 503 для недоступной/несогласованной upstream state/storage recovery. Distinguish retryable read/recovery от sign/send permission. Generic errors не выводят internal file paths/SQL или stack; useful bounded code/message сохраняются.

Proof: exact API response assertions для malformed request/aliases/RPC envelope/context/null fee/unavailable state; no financial RPC/send after invalid request; post-send failures always return existing operation/signature or recoverable ID.

## Минимальный пакет завершения B01–B05

1. Нужны actual code tests для coherent batch/invariants (F01/F02), canonical public request validation/fee-null (F03/F04), SQLite full rollback/concurrency/restart/migration (F05/F06), persisted recovery/projection/genesis/expiry cases (F07–F09). Reviewer сейчас видел старые transport/admin assertions; новые tests ещё не inspected/run.
2. Lead запускает real normal API generated-client localnet cycle через **built origin** с проверкой каждый holder→coupon entitlement→settlement→burn/vote outcome и coherent slot. Сохранённые19-tx API/11-tx GUI циклы и16positive/8coupon/128claims program report — historical artifacts новой verification не заменяют. Human-wallet flow явно остаётся отдельно unverified.
3. До/после сравнить все существующие issues по chain identities/financial totals, не смешивать signatures разных issues. Restart API без reset/delete ledger/data; сохранённая operation, catalog, labels, proposals, activity/recovery читаются из нового storage. Оригинальные JSON/fixture bytes сохранены.
4. Случай lost-send/confirmed-projection-failure восстанавливается без новой подписи; exact observed outcome persists. Если real crash injection на active API нарушает scope/удобство, изолированный subprocess test достаточен для failure regression, а реальный restart+cycle доказывает интеграцию; не смешивать эти evidence labels.
5. Финальный root checkpoint: реальные команды/результаты, final diff, source-only secret-safe private push в dimik98330, текущие unknowns. Registration/public visibility/final submission остаются owner gates и не оценкой backend.

## Initial snapshot и источники

Это modified working tree поверх commit `91a1d64`; пока builder agents работают параллельно, ниже baseline hash read03:17, не утверждение frozen final code:

| File | SHA256 |
|---|---|
| server/state.ts | 3AC168EA6765ECFF02CE573900CA44D3FF873ECC49CB0D1A5F7472943DC8F88D |
| server/transactions.ts | DCF4278EDDE16930D40DAEA9CDEE9468FA0BCE1DA7920002293B672ED139D079 |
| server/operations.ts | 11CC6FB66291B349410C343290597EABA5382284EF7AF9DADEB26F613EFE6394 |
| server/prepared.ts | B6B5D133A1A2909475E38E9172E5C4E0AAF5A9F177A9D1CAB0B7282524702EE9 |
| server/rpc.ts | A3365DEDF0AC82E62FA6CB55D329D503A76824B85A615B1931FF1AF1B643ECF6 |
| server/store.ts | 47CAE3E8AFA0882A1B609B28F580746A353FF7089612FFECDBFEBC015759E0E4 |

Primary technical sources opened08.10.2026: [getMultipleAccounts](https://solana.com/docs/rpc/http/getmultipleaccounts) (up to100 addresses, single context, minContextSlot); [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses) (recent cache vs searchTransactionHistory); [getFeeForMessage](https://solana.com/docs/rpc/http/getfeeformessage) (u64 or null); [transaction confirmation/expiration](https://solana.com/developers/cookbook/transactions/confirmation) (saved lastValidBlockHeight and same commitment lifecycle). Внешние страницы описывают RPC semantics, не доказывают результаты нашего проекта. KASE text — local inspected official-source capture with retrieval above; повторного браузерного login не выполнялось.

Verdict initial: **backend needs repairs and new integration evidence**. Авторизованное bounded local development продолжается; перечень выше достаточно конкретен для интеграции без нового product discovery или enterprise расширения. Readiness/eligibility внешней заявки остаётся за пределами этого вывода.
