# BondTrace backend — targeted repair review1

08.10.2026, code cutoff03:54 UTC+5. Это **первая** из максимум двух адресных проверок нового backend-goal после initial `kase-backend-finance-audit.md`. Старые architecture/issuer/application reviews и их бюджеты не сбрасываются. Mode: **ProofPilot coach**, decision_context: general; вопрос — корректность разрешённой локальной реализации KASE backend, не официальный конкурсный score/eligibility.

AGENTS.md, START, STATE, план21, git status и latest commits перечитаны. Состояние продолжает активную реализацию; owner gates сохранены. Ранее прочитанные неизменённые installed skills использованы в этом же контексте: ProofPilot coach (routing/review/evidence/safety/quality/quality-review/honest-evaluation/solana-new), solana-dev (security/Kit advanced), review-and-iterate (security-basics/code-review/compute), CSO (backend code, business/integrity/exception paths, confidence >=8/10). Новые skill installs, MCP/host config и onboarding не выполнялись. Official RPC docs, прочитанные08.10 в initial pass, остаются источником semantics; новых live RPC вызовов не было.

Ownership: reviewer пишет только `C:\Users\dmitrii\Documents\solana\docs\research\kase-backend-finance-repair1.md`. Никаких source/config/program/UI/Git mutations, POST, подписей, чтения key/auth files, тестовых/реальных транзакций, chain/ledger mutation или installs. Actual tests **не запускались** reviewer; прочитанные test assertions — code evidence. Lead сообщил last83 run82passed/1mock inconsistency fixed и о продолжающихся journal/bootstrap tests; этот отчёт не повышает это до final PASS. Quality helper/HTML/дополнительный security-report не создавался из-за единственного пути записи; policy acceptance/сертификация не заявлены.

## Checked changes against F01–F09

| Initial ID | Проверенное в actual code | Статус к cutoff |
|---|---|---|
| F01 mixed RPC contexts | `readChainView` делает discovery, derive bounded graph, один confirmed getMultipleAccounts с minContextSlot; возвращает только final bank values; identity/list races ограничены3 попытками. Максимальный graph сейчас62 accounts для16 holders/8coupons/32proposal IDs. `getState` использует именно view | Code-resolved; fresh built-origin/restart evidence впереди |
| F02 financial identities | `reconcile` проверяет current=mint=issued−redeemed, coupon term/snapshot total/capture sequence/mask/paidTotal, redemption units/mask/current balances/final state, aggregate voting mask, full remaining obligations и zero gap после seal. Vault/required mints отсутствовать не могут; documented empty ATA exception сохранена. Exact decimal strings, `choiceEvidence=proposal-aggregate-only` и local-catalog proposal discovery раскрыты | Code-resolved в bounded prototype; tests assertions inspected, execution не объявляется |
| F03 invented params/fee0 | `normalizeRequest` требует amounts/IDs/title/choice, exact integer strings для денег, отклоняет contradictory aliases/unknown fields; wallet prepare требует explicit instrument. Single-coupon omission разрешена как unambiguous compatibility; multiple coupons требуют couponId. Null/malformed fee отклоняется503, CU estimate больше не подменяется0 | Code-resolved; no new financial defaults found |
| F04 raw JSON idempotency | Normalized params, sorted canonical serialization, BEGIN IMMEDIATE вокруг insert/conflict, retained params с первой записью. Equivalent aliases/zeros/key order сохраняют identity; legacy digest разрешается только при matching normalized saved params/action/role | Code-resolved; identity scope — actor role в namespace с pinned ledger; unsigned message identity дополнительно содержит actual wallet/addresses |
| F05 fragmented JSON durability | SQLite individual documents, DELETE rollback journal, synchronous EXTRA, transactionSync/savepoints, schema/application identity, one-time import/HASH records/public-only allowlist. Relay atomically сохраняет signed bytes/signature/genesis/lifetime и synchronous onSubmitted; already-submitted prepare повторно проверяется под lock, поэтому второй процесс не делает второй send того же prepared message | Основной дефект исправлен; дополнительный catalog projection race найден и исправлен в этом pass, regression pending |
| F06 unresolved eviction | Per-record IDs/receipts не режутся `.slice(100/150)`. Capacity gates учитывают chainConfirmed/projectionPending; expired unsigned previews остаются unsigned. `projectionStatus` отделён от `chainStatus`, originals import preserved | Code-resolved; assertions для >150 legacy references/restart inspected, execution пока не заявляется |
| F07 lost GET confirmation | `transactionStatus` persist observed receipt даже first GET; operation recovery сохраняет chainStatus и idempotent projection; all signed references reconcile включая old local error. Stored confirmed/error fallback при null RPC имеет явную source. UNKNOWN возвращается сразу из awaitConfirmation, не превращается в обычный timeout pending | Code-resolved при валидном RPC receipt; remaining shape defect F09-R1 ниже |
| F08 genesis/provenance | `chainIdentity` pinned in SQLite namespace; signature recovery сравнивает stored genesis, changed ledger409; legacy receipt без binding при null остаётсяunknown; действие не resends ради recovery | Safety gate code-resolved. Legacy capture slot label ещё требует поправки F08-R1 ниже |
| F09 API/RPC semantics | JSON-RPC envelope/version/request ID validation, HTTP429/unavailable503, malformed JSON503, typed unavailable fee/CU/account graph, storage errors bounded503 without internal paths, POST recoveryRequired for5xx | Частично: malformed receipt без обязательного err ещё принимается confirmed, F09-R1 |

## Обнаруженные counterexamples и адресные исправления

### F05-R1 — High: cross-process catalog read/merge был вне lock; исправлен по коду

В первом чтении repair1 `admin.finalizeAdminEffect` выполнял final `readCatalog` и сборку holder labels до `saveCatalog`; latter берёт SQLite transaction, но re-read внутри него проверял identity, затем перезаписывал **всю supplied row**. В `effects.create_vote` был такой же read-before-lock. Синхронность одного event loop не синхронизирует другой процесс.

Минимальный counterexample из code flow: P1/P2 прочитали C с labels{}, P1 сохранил labelA, P2 сохранил stale C+labelB; A потеряна. Аналогично два proposal IDs или proposal+holder label. Это наблюдённый дефект scope cross-process, не выполненный exploit/runtime на live namespace.

Lead в ходе этого pass добавил `transactionSync` вокруг **final latest-read/identity/merge/save** в admin после всех awaited chain checks (`admin.ts:209`), а в effects — вокруг `recordProposal`/catalog read/merge/save (`effects.ts:19`). Latest code перечитан: stale merge теперь происходит под BEGIN IMMEDIATE, второй writer получает актуальную row. Chain reads не выполняются под DB lock. `create_vote` больше не выдумывает ID при отсутствующей persisted metadata; recovery остаётсяpending.

Resolution: **fixed by inspected code**. Остался конкретный proof gap: multi-process regression непосредственно на confirmed catalog projection/labels+proposal IDs, а не только generic `storage.updateJson` counter. Existing admin assertion проверяет concurrent awaits внутри одного процесса; storage generic test4 processes×40updates подтверждает соответствующий test intent, но не application integration. Lead сообщил, что отдельный worker добавит этот regression; результат здесь пока не observed.

### F09-R1 — Medium/material: incomplete RPC receipt может стать durable confirmed

Location: `server/rpc.ts:34-43` на зафиксированном cutoff. Outer JSON-RPC envelope валидируется, но result не требует valid `context.slot`, а value predicate проверяет slot/confirmationStatus без обязательного `err`. Затем `value?.err` truthiness определяет error vs success.

Минимальный JSON-RPC result, который проходит current guard:

```json
{"value":[{"slot":700,"confirmationStatus":"confirmed"}]}
```

Чистая reproduction текущего predicate в JS (без filesystem/RPC/source imports) дала `hasErr=false`, `rejected=false`, `status=confirmed`. Дальше actual code сохраняет `chainStatus:'confirmed'`, genesis и `verification:'live-rpc'`; `operationStatus` может применить projection. Это не подтверждение, что реальный localhost validator возвращает такой ответ: дефект заключается в fail-open при incomplete upstream data, прямо входящий в заявленную typed RPC boundary.

Required minimal fix: validate result context and receipt object **до любого outcome write**; require own err field, `err===null` либо допустимую nonnull transaction-error representation, safe slot и допустимый confirmationStatus. Не приниматься `err:false`,0,empty string как success. Аналогично preflight error.data.err и simulation err не должны классифицировать arbitrary falsy malformed values как definitive failure/success. Можно оставить bounded generic TransactionError validation, без огромного RPC framework.

Proof: mocked missing err/falsy err/missing or invalid context → `RPC_INVALID`503, receipt/operation/projection untouched; actual error receipt сохраняется error; err:null confirmed сохраняется confirmed/recoverable. Нельзя поменять test fixture на malformed success, чтобы получить зелёный mock.

Disposition at cutoff: **open required fix**. Lead уведомлён; последующее исправление должно быть перечитано и отражено адресно, без пересчёта старого application score.

### F08-R1 — Medium: legacy-unbound capture slot получает более сильный label

Location: `server/store.ts:10`; `server/state.ts:64,66`; `server/journal.ts:30`. Migration честно хранит legacy confirmed observation с `genesisHash:null/verification:'legacy-unbound'`. `/api/transactions` при null receipt также честно возвращаетunknown. Но `activities()` всё ещё показывает исторический chainStatus confirmed; getState выбирает capture по kind/bond/account/status и без проверки verification устанавливает `recordSlotSource:'recorded-confirmation'`.

Минимальная pure projection reproduction: legacy activity `{kind:'capture_coupon',bond:'B',account:'C',status:'confirmed',slot:17,verification:'legacy-unbound'}` выбрана current finder и даёт recordSlot17/source recorded-confirmation. Genesis/verification этой observation в `Activity` не сохраняется полностью. On-chain coupon account не хранит capture slot, поэтому нельзя получить текущий подтверждённый slot только из его существования; финансовые суммы при этом остаются coherent и эта проблема не даёт финансового authority bypass.

Minimal fix: сохранять фактический source (`legacy-unbound`) либо не отдавать такой slot как подтверждённый для текущей цепочки до actual RPC re-observation; activity может оставаться историей с явной provenance. Не менять originals и не делать новые транзакции для восстановления slot. Если нужен chain-bound label, проверять receipt.genesisHash против текущего pinned identity, не только status.

Proof: imported confirmed capture с null genesis → slot absent/unbound label; live re-observed same-genesis capture → chain-bound source. Existing state test доказывает blank slot при отсутствии activity, но не этот legacy branch.

Disposition at cutoff: **open small correction**; финансовая сверка не заблокирована, однако claim об источнике record date должен остаться честным.

## Seed/bootstrap и доказательства, не входящие в завершённые факты

Lead явно сообщил ongoing seed resumability worker; текущий прочитанный `seed.ts` ещё первоначальный и сохраняет recovery signature только финального fund_and_seal, а intermediate setup может иметь uncertain outcome. Это **unfinished assigned work**, не новый закрытый finding/новое обещание readiness. Нужен итог worker и реальный воспроизводимый bootstrap/restart behavior; не запускать неподготовленную повторную airdrop/funding chain ради теста.

Inspected new assertions: `request-contract.test.ts`, `chain-view.test.ts`, `reconciliation.test.ts`, `storage.test.ts`, `backend-journal.test.ts`; существующие recovery/admin/admin-recovery/demo-binding. Storage tests описывают JSON original hash preservation, secret sentinel untouched, atomic rollback, savepoints, first-open migration races/concurrent updates, abrupt exit with hot journal и backup integrity. Journal tests описывают >150refs retention, invalid legacy rollback, canonical aliases, GET durable observation/restart/genesis change, unbound old confirmationunknown, callback/async/lifetime failures rollback before relay и exact bytes before ambiguous response. Reviewer inspected intent/assertions, не фактический final run.

Fresh full-origin+restart evidence, итог новых tests, comparisons всех прежних issues и окончательный source-only diff пока не предоставлены. Старые19 API/11 GUI confirmed receipts и positive16×8 runtime report остаются historical artifacts. Human-wallet/devnet/public hosting/registration/KYC/final submission не проверены этим review и не становятся backend PASS.

## Snapshot и следующий gate

Working tree поверх `91a1d64`; root/workers продолжают edits. Code hashes at03:54 UTC+5 позволяют отличить этот pass от будущего финала:

| File | SHA256 |
|---|---|
| admin.ts | 87185E0CEBDEA337E50D3F611071FB8A5A172CC78F350D20C754FB1B8C310E1B |
| effects.ts | BF9E22688E4F1ED1BB143F0680E21B5FEF585B86AB4BD87CCA408743C3B8D1E0 |
| rpc.ts | 57B6083BD952F3398BA4EE2450C199D6FEDD9BDF5FE3E66288A0380B9BCDC215 |
| state.ts | 6132CA78D9E5CA44115E499A8DBBE06689466A359EA43A33A174BCCBAB9F9C15 |
| storage.ts | 6065F601B993969ED7CFBDAA9884781173F424D6B9159A00F0EBCEF2503D8286 |
| journal.ts | EC9879848228DF02456EAB458795FB26666CFE21F22A1CF1C8145F8448706641 |
| operations.ts | BFD9EDC49086A06935225BDFD12B62F086FB4E4130901069297D4F4A5FFDD186 |
| prepared.ts | DDF50F2FE9BFF451937CEB54E73E618EFADD7C0B7E8180F10E9199BF0A97BA5B |
| request-contract.ts | 0E3FCF91641EB776FD5A73830C8411B80A84BA1FF9A54660E0DD4795D07A9AA1 |
| chain-view.ts | 72032D67552D0AE8148D5EF91D0D928E2DA7AE3C678378A5C7BA617FCD74DD10 |
| reconciliation.ts | 662EDAE337FA37A1D5773F3791A5ED85F90391AD23D571EFF678949F97F7482A |
| transactions.ts | E08516ECD72CD238C8B37CCBA6FD184C99CA421B86C3DCAD0A7656A85DBD418C |

Primary-source scope (opened08.10.2026, no refresh/live RPC here): [getMultipleAccounts](https://solana.com/docs/rpc/http/getmultipleaccounts), [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses), [getFeeForMessage](https://solana.com/docs/rpc/http/getfeeformessage), [confirmation/expiration](https://solana.com/developers/cookbook/transactions/confirmation). KASE source URL/retrieval and full requirement distinctions сохранены в initial audit/план21; новое исследование рынка/eligibility не проводилось.

Verdict repair1: **основные initial дефекты исправлены по коду; остаются две конкретные адресные поправки и final integration evidence**. Следующий meaningful gate — F09-R1/F08-R1 regression, finished bootstrap+catalog projection concurrency tests, fresh built-origin lifecycle и API restart без reset ledger/data. Затем возможен последний repair2 по новым фактам. Не заменять этот gate ещё одним само-score или произвольными enterprise features.
