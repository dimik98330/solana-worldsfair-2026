# BondTrace — review полного issuer workflow

Дата: 08.10.2026. Reviewer работает в отдельном контексте; scope — P11–P14 из `docs/20-FULL-ISSUER-PLAN.md`. Это техническое coach review формы реализации, без конкурсной оценки или формального security audit.

## Checkpoint и skills

- Прочитаны `AGENTS.md`, `CODEX_SOLANA_WORLDSFAIR_START.md`, `docs/00-STATE.md`, `docs/20-FULL-ISSUER-PLAN.md`, действующие architecture/security, program/client/server/UI.
- Mode: **ProofPilot coach**, `plan -> review`, decision context `general`, решение — продолжить реализацию выбранного KASE проекта при сохранении перечисленных инвариантов.
- Использованы установленный `.agents/skills/proofpilot/SKILL.md` и routing/plan/review/quality/decisions/evidence/safety/solana-new; `.agents/skills/solana-dev/SKILL.md` и security; `.agents/skills/review-and-iterate/SKILL.md` и security-basics/code-review-rubric/compute-optimization; scoped access-control, integrity, exceptional-condition и false-positive checklist из `.agents/skills/cso/SKILL.md`. Полный CSO audit не выполнялся. Числовой/буквенный score не запрошен и не выдаётся.
- Solana MCP tool не найден в callable host inventory этого reviewer; установку/config reviewer не выполняет. Для transaction lifecycle прочитаны текущие официальные RPC docs; код проекта — авторитетный источник собственных ограничений.
- Initial inspected HEAD `91a1d64`; рабочий plan20 был untracked. Source/STATE продолжает меняться lead, поэтому выводы ниже привязаны к описанным функциям начального прототипа, а не являются утверждением о финальном diff.
- Ownership: reviewer меняет **только этот report**. Нет installs, Git mutation, HTTP POST, подписи, изменения ledger/fixture/source/UI или дополнительных субагентов. ProofPilot quality helper, которому потребовались бы другие output paths, здесь не запускался; этот report — evidence packet для интеграционного решения lead, без protocol certification.
- Предыдущий architecture review `initial + 2 repairs` и integration review `initial + repair1` остаются исторически завершёнными; бюджет не сброшен. P11–P14 — новая фактическая функция, для неё здесь initial technical review и один последующий targeted repair review после готовности кода.
- Handoff правило: до существенной работы любой продолжатель читает AGENTS/START/STATE, выбирает и читает применимые **установленные** SKILL.md/references, сохраняет skills/results/checkpoint и указанные границы. Lead обновляет верхнеуровневый STATE.

## Решение по форме реализации

`initialize_issue -> register_holder -> issue_units -> fund_vault -> seal_issue` можно безопасно вынести из seed в prepared transactions без изменения программы. Существующие on-chain ограничения соответствуют этому пути. При этом API для обычного кошелька должен только подготовить unsigned message: authority и fee payer — выбранный wallet, signature даёт сам wallet. Generated signer допустим отдельно в явно обозначенном test demo.

Request-scoped каталог и выбор выпуска — необходимая часть полного кабинета, а не косметическое дополнение. Записанный demo fixture нужно сохранять отдельно как historical evidence; новый выпуск не должен заменять его. Приведённые ниже требования не уменьшают первоначальную цель и не означают, что весь проект или внешняя подача завершены.

## Инварианты программы, подтверждённые чтением кода

| Инвариант | Наблюдаемое основание | Следствие для API/UI |
|---|---|---|
| Initialize requires issuer signature; Bond PDA зависит от issuer+u64 series | `contexts.rs::InitializeIssue`, `program.ts::deriveBond/initializeIssue` | Не принимать bondAddress из metadata как authority; derive independently |
| Classic SPL settlement mint, decimals 6 | typed `Account<Mint>`, constraint в `InitializeIssue` | Reject wrong owner/Token-2022/decimals before preview; never mix display unit with u64 base units |
| Draft changes only before first record; max16 wallets | `lib.rs::register_holder/issue_units/seal_issue` | Re-read chain clock/state; prepare/simulation is not a durable permission grant |
| UTF-8 name max64 bytes, 1–8 positive coupons; record strictly increases; payment nondecreasing and <=maturity | `lib.rs::initialize_issue` | Match byte-length/date/order/amount checks at public API, including i64 and u64 limits |
| Issuer admin uses Signer + has_one issuer; funder can be another wallet | `contexts.rs::RegisterHolder/IssueUnits/SealIssue/FundVault` | UI issuer restrictions do not substitute chain auth; don't incorrectly forbid legitimate external funding |
| Issue amount adds to supply, checked arithmetic; zero not permitted | `lib.rs::issue_units`, `state.rs::required_reserve` | Avoid any automatic resend with fresh blockhash after uncertain response |
| Seal requires positive supply, registry, exact mint supply and complete prefunding | `lib.rs::seal_issue` | Display principal+all scheduled coupons, not only the next coupon |
| Principal retirement does not discard old coupon rights | corporate-action implementation + docs09 | Scheduled estimates and captured immutable entitlement must remain visibly distinct |

## Initial findings and concrete fixes

### I01 — Confirmation recovery must persist initialize metadata

**Observed:** initial `PreparedRecord` stores action/wallet/bond/params/signature; `submitPrepared` and `operationStatus` only have `create_vote` post-confirm side effects. New `initialize_issue` will create real chain accounts before catalog registration. If the send or confirmation response is lost, a simple chain-signature poll cannot register that issue.

**Required fix:** persist a typed metadata effect with the exact prepared message identity **before relay**: actor, seriesId, settlementMint, derived bond, metadata and action. Use one idempotent `applyConfirmedEffect(record, signature)` from initial submit, already-submitted replay and operation recovery. The function reads the Bond without requiring it to be in the catalog first, verifies program owner+discriminator, canonical Bond/mint/vault PDAs, stored issuer/series/settlement mint, then upserts metadata. Metadata is written only when the stored signature is confirmed. Catalog write failure retains enough information to repair on the next recovery read; do not mark the whole operation irrecoverably failed just because the metadata write failed.

**Acceptance evidence needed:** initialize lands, response is deliberately interrupted, server restart, recovery on old operationId registers exactly one matching issue and old fixture is byte-identical. A wrong-owner or identity mismatch cannot create a catalog row. No new signing to recover.

### I02 — Bind all activity and operations to a request-scoped instrument

**Observed:** initial `makeAction/readBond/getState` use global `fixture()`. Initial `beginOperation` digest includes `{action,role,params}` but no explicit bond; activity/proposal persistence is based on the fixture.

**Required fix:** explicit bondAddress in every instrument operation and state request; normalize address and include it in the operation digest even if action params are otherwise identical. Return bondAddress in the prepared summary and receipt. Bind activity/proposal metadata to it. Derive/read/verify the selected Bond for each request; a selector must never mutate the global fixture. GETs for A and B may execute concurrently without cross-selection leakage. JSON read-modify-write must avoid an `await` gap between read and write, or use a single local mutation queue for shared catalog/activity records.

**Acceptance evidence needed:** concurrent state/prepare requests for A/B return their own immutable terms and recipient/vault; replay ID originally used for A is rejected if reused for B. Fixture remains intact.

### I03 — UI preview must freeze issue selection as well as signer/network

**Observed:** initial `queue` checks returned signer/network; `confirm` checks activeWallet. Those checks do not establish which issue an unsigned transaction targets. `track` polls `/api/transactions/:signature`, which by itself cannot perform metadata recovery.

**Required fix:** capture request bondAddress in `TxRecord`; validate returned summary bondAddress+signer+network against that snapshot. Clear an unsigned review when selected issue changes, or require re-preview before confirming; never clear pending/unknown upon wallet/mode/issue changes. Route confirmation through operationStatus/shared confirmed-effect hook before selecting a newly initialized issue. Guard a stale GET/prepare completion with a selection generation or request key so A cannot populate B's screen.

**Acceptance evidence needed:** select B while A state/prepare is in flight; A cannot replace B and cannot sign as B. Reload unresolved initialize/issue/fund retains old operation and blocks new submission until outcome is known.

### I04 — Generated demo actor is independent of selected instrument

**Observed:** initial `demoAction` resolves generated role from the original fixture. New catalog instruments may have a human wallet issuer or a different holder registry.

**Required fix:** keep demo role addresses sourced from the actual generated key identities, not catalog-provided roles. Issuer-only demo action requires generated issuer signer == on-chain selected bond.issuer. Demo transfer destinations must belong to the selected bond registry (and any deliberately narrower demo policy), not merely original fixture roles. If mismatched, return a clear error without substitution. Ordinary wallet prepare never calls demoSigner. Demo funding only transfers an existing source token balance; do not silently mint/fund a human-created issue or overwrite accelerated flags.

**Acceptance evidence needed:** generated role attempts admin on another issuer's issue and is rejected; normal wallet prepares with its own address and no server signature. Preview explicitly says generated test signer where applicable.

### I05 — Reserve and multiple coupons need chain-derived interpretation

**Observed:** `getState` uses live current holder balances for an uncaptured coupon and immutable snapshot balances after capture. `App` selects the latest captured coupon for the payment panel, although portfolio lists all captured coupons. Metadata rate/frequency is not stored on-chain.

**Required fix:** Draft required reserve = `totalIssued × (faceValue + Σ unitAmount)` from actual chain terms, checked within u64. Funding deficit = max(required−vault,0). Any display of remaining liability after claims uses immutable snapshots/paid totals and remaining principal, preserving old rights after transfers/redemption. Mark uncaptured rows projected/current-balance estimates; don't call them recorded entitlement. Provide selection/history for all up to8 coupons so an older unpaid snapshot remains accessible. Fixed coupon schedule is authoritative; optional displayed rate/frequency cannot invent a contract term for arbitrary imported/manual schedules.

**Acceptance evidence needed:** two coupons with transfer between snapshots, old coupon unpaid until after principal redemption; each claim pays only its own recorded holder/quantity and reserve totals are consistent. Eight schedule rows render and validate; checked overflow rejected.

### I06 — Reject invalid required signatures before storing submitted identity

**Observed:** initial relay identifies preparation by SHA256(messageBytes), then extracts the supplied first signature and calls `completePrepared` before RPC preflight verifies that signature. Chain still rejects an invalid signature, so this is **not an authority bypass**. An invalid/unsigned relay can nevertheless poison the saved preparation with an unexecuted signature and block its correct replay; this is a recovery robustness concern for the same loopback trust boundary.

**Recommended fix:** validate exact prepared message, required signer addresses/count and every required ed25519 signature before persisting pending/signature. A valid signature is tied cryptographically to the message; never bind catalog effect to a different request's signature or caller-supplied issuer. Preserve original confirmed/error outcome for a recognized already-submitted message, and apply effects on confirmed replay.

**Acceptance evidence needed:** changed-message, unsigned, invalid signature and wrong-signer bytes are rejected before changing prepared record; an actual signed generated-client submission uses exactly the previewed bytes. This proves relay transport with generated clients, not human wallet support.

## Checks and limits

This initial pass traced actual code and documented public RPC semantics; it did not execute transactions or mutate data. Current official docs read 08.10.2026:

- [sendTransaction](https://solana.com/docs/rpc/http/sendtransaction): accepted RPC relay is not confirmation; preflight verifies signatures and simulates.
- [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses): use stored first signature and searchTransactionHistory for recovery beyond recent cache.
- [getTransaction](https://solana.com/docs/rpc/http/gettransaction): null at requested commitment does not establish nonexecution.

Existing tests and frozen video describe the prior localnet prototype. New generated-client smoke, browser forms/reload/switch/failure tests and restart recovery must be run on the new issuer path by lead. Neither mocked RPC nor generated client is evidence of a human wallet approval/cancel flow. This review does not establish devnet deployment, public jury access, registration, KYC, final submission, demand or KASE integration.

Next: lead integrates the proposed API/state/UI contract, sends actual code and check outputs for one targeted review of material invariants above. Keep previous review records and stopping gates; no repeated scoring or feature removal to close the review.

## Targeted code/evidence pass — repair1, 08.10.2026

AGENTS/STATE/plan20/START continuation прочитаны повторно; ранее прочитанные неизменённые skills использованы в том же контексте. Ownership и запреты сохранены. Проверены actual `admin/catalog/effects/actions/prepared/operations/transactions/state/index`, App/API/types/IssuerSetup/issuer-validation, assertions `admin.test.ts`, `recovery.test.ts`, `issuer-validation.test.ts`, reproduction script и issuer lifecycle evidence. Тесты reviewer не запускал: signing/POST/runtime mutation не входят в его scope. Это один targeted pass, не пересмотр старых assessments.

### Подтверждённое evidence

`docs/evidence/issuer-lifecycle-localnet.json`, SHA256 `d74a47418e37ddc4db63a59e5caf399ceb1bc44deb5a2607921e8c7a9235e6ab`, содержит 19 receipts для выпуска `HvArwiNhkrvxm2Wot8FKtaatRBs8Utyqge2g2Ai1oJmi`. Reviewer сделал только read-only GET `/api/state?instrument=...`: live response совпал с final evidence — issued/redeemed15, principal15_000_000_000 base units, coupon totals750_000_000 +375_000_000, vault/remaining obligations/funding gap0, yes weight10, catalog2, labels Operator holder A/B. Это подтверждает доступность нового issuer flow state через работающий API; receipt signatures отдельно RPC reviewer не перечитывал.

Inspected `scripts/issuer-smoke.ts` действительно подготавливает unsigned messages через normal API, подписывает точные messageBytes **generated** external test client, проверяет simulation/signature/status, отклонение invalid signature перед правильной подписью того же preparation, historical claims после redemption и equality original fixture bytes. Evidence относится к этой реализации smoke; оно не доказывает подпись человека, devnet или browser workflow.

`recovered:true` означает успешный operationStatus после обычного successful submit. Скрипт не инжектирует потерянный initialize response и не перезапускает API. Existing transport loss tests используют `action: test-only`. Следовательно реальное lost-init-response + restart восстановление остаётся **не выполненным** в этом evidence, несмотря на наличие recovery hooks. Admin unit assertions проверяют immutable identity, delayed finalize after later lifecycle и preservation concurrent metadata; это полезные synthetic tests, отдельные от полного transport пути. Старый `docs/evidence/node-test-results.txt` на момент чтения всё ещё содержал14tests; новые19/20 и UI17 results reviewer не наблюдал как этот saved log и не приписывает себе их выполнение.

### Stable issue resolutions

| Issue | Checked resolution | Статус на cutoff targeted pass |
|---|---|---|
| I01 | `PreparedRecord/Operation.metadata` сохранены до send; `applyConfirmedEffect` вызывается в confirm/replay/operationStatus; init decode owner/PDA/issuer/series/mint/full terms проверены; catalog re-read после awaits сохраняет concurrent IDs/labels; delayed issued balance after redemption разрешён | Частично исправлено; post-confirm failure classification ниже остаётся material |
| I02 | `readBond/getState` принимают request instrument; подготовка сохраняет resolved bond; per-bond catalog и activity filtering; normal wallet lifecycle сохраняет fixture | Частично исправлено; demo raw digest/top-level selection и unconditional fixture write ниже |
| I03 | App сохраняет params.bondAddress и проверяет returned summary+confirm target; pending/unknown localStorage lock и selector disabled; track использует operationStatus; init selection после confirmed | Частично исправлено; state reader stale response ниже |
| I04 | Demo identities берутся из actual generated fixture; issuer admin подтверждается API и program signer constraints; foreign issuer UI demo недоступен; canonical selected registry checks в corporate builder | Основной actor invariant исправлен; demo proposal persistence residual ниже связан с I02 |
| I05 | API отдаёт full coupon-unit sum/current obligations; issuer reserve rederives every coupon/u64 and rejects inconsistent totals; Payments picker позволяет открыть каждый captured coupon, Portfolio сохраняет old rights | Исправлено по коду и two-coupon lifecycle. Eight-row browser rendering отдельно не выполнено reviewer |
| I06 | Required wallet присутствует в decoded signers; every required ed25519 signature проверяется against exact message до completePrepared; isolated poison assertions не допускают сохранённой подписи | Исправлено по коду/assertions и normal-API lifecycle invalid-then-valid case |

### Остаточные material замечания, переданные lead

**I01-R1 — ошибка metadata после confirmed ошибочно разблокирует resend.** В прочитанном `submitPrepared` chain receipt уже confirmed/setPreparedStatus confirmed, затем `applyConfirmedEffect` может выбросить default400/500 из `finalizeAdminEffect`/filesystem. `ApiError.uncertain` true только для UNKNOWN_STATUS: frontend показывает ordinary error и разрешает новую операцию. В `demoAction` catch additionally overwrites confirmed Operation to error; `operationStatus` для такого record больше не применяет эффект. Результат — выполненная issuance может быть предъявлена как невыполненная, с потенциальным новым выпуском при ручном повторе.

Fix: post-confirm effect failure преобразовать в recoverable uncertain503/UNKNOWN_STATUS с явным сообщением о существующей confirmed receipt; сохранить signature и не переводить confirmed record в terminal error. Operation recovery повторяет idempotent effect без новой подписи. Добавить injected effect failure regression и последующее successful recovery; failed chain preflight остаётся отдельным definitive error.

**I02-R1 — demo create_vote ещё меняет чужой legacy fixture.** После `execute` код в `demoAction` напрямую `fixture()`/push proposalId/`saveFixture`, без `built.bondAddress===fixture.bond`. Затем уже вызывается `applyConfirmedEffect`, чей `recordProposal` имеет правильный guard. Новый catalog выпуск того же generated issuer может добавить proposalId в старый recorded demo; unsigned smoke не покрывает этот demo branch.

Fix: убрать direct save и использовать единый guarded confirmed effect. Документация normal smoke о byte-identical fixture остаётся верной для своего пути; она не закрывает этот branch.

**I02-R2 — operation digest не учитывает top-level bond selection.** `beginOperation(...request.params??{})` вызывается до нормализации selection, хотя API `ActionRequest` также принимает top-level `bondAddress`. Одинаковый ID+action+role+params с разными top-level instruments будет replay старой операции вместо OPERATION_CONFLICT. UI кладёт bond внутрь params, но public API поддерживает оба пути.

Fix: до beginOperation однозначно normalize requested instrument (top-level/params конфликт отвергнуть), сохранить resolved key в digest inputs. Отсутствующий selection зафиксировать к default bond, чтобы later default change тоже не менял смысл replay.

**I03-R1 — stale state response не защищён.** `App.refresh` использует один `reading.current` для всех selection keys. При A read in flight, choose B вызывает B callback, который ждёт A и `if(!fresh)return`; A completion без guard выполняет `setState(A)`. B не загружается до следующего12s tick либо A возвращает старую view поверх следующего выбора. Confirm binding полезен, но не заменяет привязку отображаемого state.

Fix: read ref с instrument key и generation/AbortController; B запускается сразу и A completion/error/finally игнорируются после selection change. Пока state не соответствует выбранному issue, mark loading и prohibit actions. Narrow delayed-A/quick-B regression должен проверить стабильный B, отсутствие unsigned A preview и восстановление pending lock.

Эти замечания относятся к фактически прочитанному cutoff; reviewer не редактировал source. До подтверждения исправлений этот report не утверждает, что весь набор recovery/selection invariants закрыт. Lead может продолжить in-scope fixes и перечисленные проверки; no human-wallet/devnet/public/submission overclaims. Полная цель остаётся active, старые budgets и внешние gates сохраняются.

## Final resolution confirmation — repair2, 08.10.2026

Это **вторая и последняя доработка данного issuer review** (`initial + repair1 + repair2`), в рамках исходных issue IDs. Старые architecture/integration/application review records и budgets сохранены. AGENTS/STATE continuation и обязательное правило установленного skill selection сохраняются; применены прежние неизменённые ProofPilot coach, solana-dev/security, review-and-iterate и scoped CSO instructions. Reviewer по-прежнему изменяет только этот report, без подписей/POST/Git/source/UI/runtime mutation.

### Resolution table

| Stable issue | Проверенное исправление | Итог в текущем bounded scope |
|---|---|---|
| I01 / I01-R1 | Общий `effects.ts` ловит **post-confirm projection** errors и возвращает UNKNOWN_STATUS503. Normal record уже confirmed с сохранённой подписью; guided catch оставляет pending, recovery повторяет только idempotent metadata effect. Init identity/terms проверены без повторного creation-time gate | Закрыт по коду и новым regression assertions; scope synthetic transport/restart указан ниже |
| I02 / I02-R1 | Unconditional demo `fixture()/saveFixture` для create_vote удалён. Единственный путь — `applyConfirmedEffect`, внутри `recordProposal` legacy guard по bond и per-bond catalog write | Закрыт по коду; previous real normal-API fixture equality сохраняет свой точный scope |
| I02 / I02-R2 | Перед `beginOperation` top-level или params/default instrument фиксируется в `request.params.bondAddress`, поэтому digest включает выбранный выпуск и default не остаётся неявным | Закрыт по коду; precedence top-level явен и digest отражает тот же target |
| I03 / I03-R1 | `createScopedReader` uses key+generation+AbortController; App uses key-aware pending read, discards obsolete result/error before any state commit, clears old state on actual selection and preserves same-selection state. Existing unsigned preview/confirm binding and pending lock retained | Закрыт по коду и delayed-A/quick-B, A→B→A/stale-error assertions |
| I03 loading-network follow-up | Последний verified network вынесен в отдельный state, меняется только от current successful API outcome; WalletProvider не переключается на devnet при очистке instrument state. Connect wallet disabled while loading/no chain connection | Закрыт по финальному App source; real human-wallet continuity всё ещё не проверялась |
| I04 | Actual generated role addresses независимы от catalog metadata; privileged signer checks остаются в builder/program; mutation of legacy proposal list устранена по I02 | Закрыт в reviewed architecture shape, не proof работы кошелька человека |
| I05 | Полный schedule/reserve и отдельные immutable coupon histories остаются в final code; live two-coupon result и earlier inspected math assertions unchanged | Закрыт в пределах проверенного two-coupon lifecycle и validation helpers |
| I06 | Ed25519 verification of every required signer against exact prepared message остаётся до completePrepared; rejected bytes не занимают operation signature | Закрыт по коду, poison regression и prior real invalid-then-valid relay |

В текущем scope не осталось открытых material замечаний из данного review. Это подтверждение исправлений inspected workflow, без production/security certification, конкурсного score или заявления о завершении общей цели.

### Дополнительные проверки и точный уровень evidence

Observed file `.local/issuer-all-tests.txt` завершён `tests43/pass43/fail0`, SHA256 ниже. Reviewer прочитал actual tests и итоговый лог, сам их не запускал. В нём:

- `admin-recovery.test.ts`3tests применяют настоящие Kit messages и Ed25519 signatures к **synthetic RPC** в отдельной ignored data directory. После accepted send потеря ответа сохраняет exact signature+normalized immutable metadata; fresh subprocess читает persisted prepared record, получает mocked owned chain accounts и регистрирует один catalog record. Assertions: parent send1, subprocess send0, replay send count остаётся1, original fixture unchanged.
- Instrument/mint read failures после confirmed возвращают UNKNOWN_STATUS, signature сохранена, record не terminal error; subsequent operationStatus/replay создаёт один matching catalog и не отправляет повторную транзакцию.
- `data-reader.test.ts`3tests не зеркалируют реализацию: удерживают старый promise, меняют selection, поздно возвращают A/error и проверяют obsolete/current generation behavior; current transport error остаётся видимым.

Эти tests закрывают **local persistence/fresh-process reconciliation** и race regression. Они не исполняют initialize на validator во время transport fault и не являются испытанием validator/ledger restart. Дополнение не расширяет scope сохранённых real19 receipts: тот цикл остаётся реальным localnet normal unsigned API → external generated client → signature → confirmed state с двумя купонами. Cash/program source не менялся данным repair.

Lead сообщает successful final build; reviewer не запускал compiler/build самостоятельно. Browser375/768/1280 проверки выполняются lead после этого source cutoff; reviewer не видел весь их финальный комплект и не приписывает их этому report.

### Source cutoff hashes (SHA256)

Хэши снимка реально прочитанных файлов. Любой дальнейший source edit требует нового hash, а не переноса этого подтверждения на иные байты.

| Source | SHA256 |
|---|---|
| `server/effects.ts` | `5f51c5a208507252ac4a95a86012716778d1acaea04915307c26642184f72f5c` |
| `server/actions.ts` | `0bf76d84d22de9c29944676250372f17e546d461108efc12d979d1833e920fac` |
| `server/admin.ts` | `de3e47aa3cf52458c2c52fbdf54789947660effe40373b58a6636cc859760836` |
| `server/catalog.ts` | `be618bc660ff982939a9d83839e855d7bbf429f1c52aa2ce2a440f5d83abf5a9` |
| `server/transactions.ts` | `dcf4278edde16930d40daea9cdee9468fa0bce1da7920002293b672ed139d079` |
| `server/operations.ts` | `11cc6fb66291b349410c343290597eaba5382284ef7af9dadeb26f613efe6394` |
| `apps/web/src/data-reader.ts` | `33d836bb236be1aad7f7967a1564f02ec6e8eada7c5bc2ed0469045bf530707d` |
| `apps/web/src/data-reader.test.ts` | `01f8546cc2339b204d7ac6a0ee4ba40d46d4f365256864cdbacf977b984ea02f` |
| `apps/web/src/App.tsx` | `83932d2efa29daac0f97d101e4a7e3a160e5eabbfb53d732695f4386a5c985bb` |
| `tests/client/admin-recovery.test.ts` | `fec9b293f9ddfdd6fc0541e9fea707ad196d7a545d6871dd5d67e43a2409b0cc` |
| `docs/evidence/issuer-lifecycle-localnet.json` | `d74a47418e37ddc4db63a59e5caf399ceb1bc44deb5a2607921e8c7a9235e6ab` |
| `.local/issuer-all-tests.txt` (ignored local log) | `52baa438876e7aa02f942167c5b6e6971e96ca39db57a378db8899ecba651e40` |

### Остаточные границы и следующая работа lead

1. Real human wallet connect/sign/cancel/reload и физический mobile device не проверены этим evidence; generated signatures, mocked RPC и viewport screenshots не заменяют их.
2. New lifecycle использует2coupons/2positiveholders. Программа/API/UI ограничены16holders/8coupons; все16 positive +8coupons/max title не benchmarked этим review. Earlier measured sizes/CU сохраняют исходный fixture scope.
3. Lost-init/fault recovery проверен synthetic RPC с fresh Node process, не fault injection на работающем validator и не ledger restore experiment.
4. Settlement mint/freeze authority, program upgrade authority, issuer liveness для открытия погашения, отсутствие withdrawal/key recovery, permissioned registry и informational voting остаются disclosed prototype trust constraints docs09/11.
5. Финальный browser/form/responsive evidence нового workflow lead должен сохранить отдельно. Source checks и43tests не устанавливают полный browser feature flow.
6. Devnet deployment/funding receipt отсутствуют по текущему STATE; faucet429 не возобновлять автоматически. Mainnet, real funds и paid services вне разрешения.
7. Public jury access/repository visibility, Colosseum main registration/profile/project и final submission/owner Terms/KYC остаются внешними gates. Private push/локальный build не закрывают их.
8. Submission materials/video должны точно отражать новый workflow и cutoff; старое видео/evidence остаются историческими. Demand, eligibility, KASE/bank integration и победа не установлены review.

Handoff: lead продолжает полную авторизованную цель, обновляет STATE со stage/skills/checks/remaining gates и проводит заявленные browser/material milestones. Этот bounded issuer review завершён; новый assessment ради повышения оценки не нужен. Все последующие агенты наследуют обязательное чтение AGENTS/STATE и выбор установленных skills, source ownership и внешние stopping gates.
