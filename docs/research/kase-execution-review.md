# KASE execution — independent architecture review

2026-10-08. Root: `C:\Users\dmitrii\Documents\solana`. **ProofPilot coach, plan → review**, scoped engineering architecture, без баллов. Это новая фактическая функциональность `settle_coupon`/batch executor/release gate из `docs/26-BACKEND-EXECUTION.md`. Закрытый servicing initial+repair1+repair2 не переоткрывается. Для нового scope: initial architecture, затем implementation review и не более двух evidence-driven repairs; не переносить acceptance на другой bytecode.

Прочитаны текущие AGENTS/STATE, execution plan, существующие `claim_coupon`, Anchor contexts, request contract, prepared/operations/transactions/effects и chain identity. Применены фактически установленные **ProofPilot coach**, **solana-dev** (security/testing и Anchor reference), **review-and-iterate**; неизменившиеся инструкции этих skills повторно использованы в том же контексте. При handoff передавать обязательное правило: сначала AGENTS/STATE, затем выбрать/прочитать подходящие установленные skills и сообщить проверки. Critic owns только этот report. Код, Git/config/UI/ledger/signers не менялись; новых live transactions нет.

## Архитектурный вывод

**Можно начинать реализацию минимальной on-chain инструкции.** Принцип permissionless payout безопасен для заявленной модели: signer даёт возможность оплатить транзакцию, но не выбирает получателя, сумму или источник денег. Указанная архитектура не требует менять account layout, principal permissions или immutable terms. Ниже обязательные условия реализации API/recovery; это проверяемые design constraints, а не утверждение, что ещё ненаписанный код уже нарушает их.

## Контракт выплаты

Сохранить текущие проверки `ClaimCoupon` для Bond PDA, `has_one settlement_mint/vault`, Coupon PDA/index/has_one bond, classic SPL vault mint/authority и token program. Новый beneficiary — read-only `UncheckedAccount` с ручным `bond.holder_index(beneficiary.key())`; проверять его ключ, не произвольный переданный index. Signer beneficiary не нужен. Новый destination обязан быть **canonical classic SPL ATA** именно этого beneficiary и settlement mint, с SPL owner authority, равным beneficiary. Не ослаблять это до одного совпадения mint или одного ATA address. Отсутствующий ATA создаётся обычной idempotent ATA instruction перед settlement.

Общий helper для claim/settle должен проверять payment date, unclaimed bit, положительные snapshot units, checked multiplication, reserve, CPI transfer, checked paid_total и общий claimed_mask. Размер выплаты — только `coupon.unit_amount * coupon.units[holder_index]`; в новом instruction нет amount override. Обновлять тот же Coupon account, а не отдельный settlement journal. Две конкурирующие инструкции сериализуются по writable Coupon; вторая не платит повторно. **Не добавлять ACTIVE-only gate:** существующий claim намеренно доступен после transfer и полного principal burn. Старый holder-signed claim может сохранить своё разрешение на любой holder-owned SPL destination; stricter canonical rule относится к permissionless route.

Receipt не должен изображать fee payer получателем дохода. Сохранить/явно указать beneficiary в on-chain receipt и per-recipient API summary; payer — отдельная роль. On-chain event format менять только осознанно и согласованно с decoder, если потребуется новый action kind.

## A1 · Release gate должен охватывать first relay, а не только prepare

Сейчас `/prepare` и `submitPrepared` разделены временем пользовательской подписи. Проверка hash только при prepare допускает отправку после смены программы. Минимальная реализация:

- Gate перед generated signing/buildTransaction и перед **первой** отправкой externally signed prepared message. В persisted review/receipt сохранить observed release identity: genesis, program ID, ProgramData address, deployment slot, image length/hash.
- Чтение Program + ProgramData валидирует loader ownership, executable/type, привязку Program → ProgramData и собственно bytes; новый expected hash берётся из проверенного release artifact, не из произвольного параметра запроса и не автоматически принимается от RPC.
- Known-signature recovery (`operationStatus`, receipt polling/reconciliation) остаётся доступным при bytecode mismatch. Оно не строит новую транзакцию и не переподписывает прежнюю. Не включать release gate без разбора в общий `chainIdentity`, который используется recovery.
- Подготовленные unsigned legacy reviews при mismatch требуют новой подготовки после исправления deployment; сохранённые signed identifiers не удаляются и не заменяются. Release failure между persisted intent и send — не разрешение создать новый signed intent с тем же child ID.

Не обещать абсолютную блокировку upgrades между проверкой и исполнением: preflight/hash observation не делает upgradeable program неизменяемой. Для localnet scope достаточно честно назвать это проверкой текущего deployment перед отправкой; production доверие upgrade authority остаётся отдельным ограничением. Если ProgramData допускает allocation padding, сравнение должно явно учитывать reviewed image length и только допустимое zero padding, а не произвольно игнорировать suffix.

## A2 · Event manifest и child IDs фиксируются до подписи

Одного «stable ID для очередного номера batch» недостаточно: после обычного holder claim множество unpaid recipients меняется. Нельзя сохранить тот же child ID и подставить в него иной состав получателей. До подписи durable manifest должен связать event/run с genesis/program-release, bond, coupon, snapshot identity, точными beneficiary IDs и исходными child action params. Использовать существующий digest/conflict и fenced lease механизм; запись signed reference должна оставаться атомарной и предшествовать send.

После restart сначала восстанавливать retained child outcomes. `unknown`, `pending` или confirmed с projection pending останавливают новые подписи. При **достоверном** atomic failure из-за competing claim можно перечитать chain state и подготовить новый состав только под новым child ID/явной revision; старый failed receipt сохраняется. Альтернатива для первой версии — остановиться с reviewable conflict и дать явный новый run. Не объявлять частичный успех внутри failed atomic transaction. Chain claimed bit может доказать, что право уже исполнено другим плательщиком, но не создаёт отсутствующую transaction signature или локальный receipt.

## A3 · Предел4 получателей требует wire/CU и SOL-cost проверки

Нормализатор принимает непустой список1..4 разных зарегистрированных beneficiary keys, один явный coupon ID; отвергает duplicates, amount/destination overrides и неподдерживаемые поля. Перед подписью один coherent financial snapshot определяет только ещё неоплаченные права, а контракт повторно проверяет каждое. Batch — до4 отдельных settle instructions и при необходимости ATA-create instructions в одной транзакции. Это минимально использует текущую atomicity; не вводить новую on-chain batch state без причины.

«Actor платит только fee» неточно при создании ATA: он оплачивает **fee и rent**, settlement amount выходит из vault. Summary должен показывать эти разные источники и получателей, а executor иметь конечный лимит количества действий/SOL debit на явно запущенный run. Измерить реальный худший случай4 новых ATAs +4 settles с v0 wire size и CU; число4 само по себе не доказывает, что пакет помещается. При превышении лимита уменьшать группу до подписания и фиксировать её в manifest.

## Минимальные verification gates

1. Actual SBF: чужой beneficiary/index, неверный mint/vault/coupon, noncanonical или чужой destination, early/zero/duplicate; успешный outsider payer; исторические права после transfer/burn; обычный claim и settle в обоих порядках; повторный recipient и ошибка последнего recipient откатывают весь batch, включая предыдущие transfer/masks.
2. API: строгий1..4 request, exact per-recipient amounts, payer/beneficiary separation, новый IDL/client discriminator, четыре отсутствующих ATA, malformed RPC/release mismatch, upgrade между prepare и submit; recovery старых signatures при mismatch работает без нового signing/send.
3. Executor: crash до подписи, после atomic persistence до send, после send до ответа, confirmed до projection, два concurrent run owners; resume того же child не создаёт новую подпись. Competing holder claim не перепривязывает старый ID. Никаких human keys, mainnet или unattended paid services.
4. Новый isolated built-origin цикл с новым binary hash, mixed claim/settle, exact final reconciliation; старые servicing logs не являются результатом этих тестов.

**Initial architecture disposition:** on-chain design может быть реализован; A1–A3 должны войти в implementation и acceptance. Подтверждённых неизбежных архитектурных блокеров не найдено. Implementation correctness, максимальный bundle, release gate и event recovery пока **не проверены**, поскольку нового кода на этом cutoff ещё нет. Никакого score, production certificate или разрешения внешней подачи этот review не даёт.

## Initial implementation review — 2026-10-08

Это первый code/evidence pass нового execution scope после архитектуры выше. Skills: ProofPilot coach, solana-dev security/testing/Anchor, review-and-iterate; актуальные AGENTS/STATE прочитаны, неизменившиеся skill instructions повторно использованы. Сохраняется максимум две evidence-driven repairs. Старый servicing review закрыт. Source новой optional transaction-proof capture ещё не входил в переданный packet и **исключён** из этого verdict.

Проверены SettleCoupon/shared helper/event, generated IDL/client, coupon-settlement/coupon-run/program-identity, guards в transactions/seed, prepared/journal, request/actions/index/servicing и isolated launcher. Переданный исходный snapshot имеет два подтверждённых P2; они не опровергают успешный happy path, но препятствуют утверждению полноценного recovery/version binding.

### E1 · P2 · Конкурентная квитанция перезаписывается перед повторным relay

**Место frozen source:** `server/transactions.ts:78-89`, особенно transaction на87 (SHA-256 `D1DACE880ECA99C4D19C56B7BF29BEAE0D3D1A014A7699CBE1DE4BB1AEF38072`).

`submitPrepared` проверяет `receipt(signature)` до двух awaited release/genesis checks. Generated sender другого процесса может сохранить точно такую же signature в этот промежуток. В окончательном SQLite transaction повторно проверяется только prepared.signature; `saveReceipt` без проверки заменяет конкурентную успешную запись на pending и затем снова вызывается sendTransaction. Solana дедуплицирует ту же signature, поэтому этим не доказана двойная выплата. Но original operationId/подтверждённый provenance теряются, no-resend гарантия нарушена; при уже обрезанной RPC history восстановление может стать хуже, чем было до повторной отправки.

**Reproduction:** `.local/tests/execution-critic-c710f54b94e54d769e3f7a12f0200f74/relay-race.test.ts` сохраняет совместимую successful receipt при первом genesis RPC после outer lookup. Actual `submitPrepared` затем делает1 лишний send и меняет прежний operationId на prepared ID. **1/1 passed**, подтверждает дефект; RPC полностью mocked, новых live transactions нет.

**Минимальная коррекция:** inside того же final storage transaction заново прочитать receipt по expected signature, проверить retained контекст; совместимую запись только привязать к review и перейти к passive recovery, не перезаписывать/не отправлять. Несовместимая запись →409 без mutations. Проверить concurrency для confirmed, pending/unknown и context mismatch, а также сохранение исходных receipt fields. Внешняя предварительная проверка может остаться оптимизацией, но не границей корректности.

### E2 · P2 · Release manifest run не связан с фактически подписанным child

**Место frozen source:** `server/coupon-run.ts:226-237` и `child()/assess()`; caller-required release отсутствует в вызове `demoAction`, а sender independently выбирает текущий descriptor. SHA-256 coupon-run `7A94379AEC114FF165129B349018D5416454145B63A4ACDA1D30BE4E0C3B6A45`.

Parent проверяет plan.releaseSha256 до dispatch. Во время асинхронного makeAction/build программа и expected descriptor могут перейти на новый release. Обычный `execute` тогда корректно проверит новый текущий release, но не знает старую привязку parent. Child params/wallet/bond проверяются, фактический receipt.programRelease с manifest не сравнивается. Если это последний batch, parent после подтверждения возвращает completed без следующей pre-dispatch проверки. Это нарушение именно заявленного fixed-release run; доказательство хищения или злонамеренного upgrade этим review не заявляется.

**Reproduction:** `.local/tests/execution-critic-c710f54b94e54d769e3f7a12f0200f74/run-release-race.test.ts` использует предусмотренный injectable sender boundary: после parent check sender выбирает release B и сохраняет его в child receipt, тогда как immutable parent содержит A; результат всё равно completed. **1/1 passed**. Это синтетическая смена release в async boundary, не live upgrade; source подтверждает отсутствие pinned descriptor в нормальном вызове sender.

**Минимальная коррекция:** передавать trusted caller-required descriptor parent → demoAction → execute/buildTransaction; проверять его до cryptographic signing. Перед send сравнить descriptor freshly retained receipt с parent binding внутри атомарного persistence callback, с rollback при несовпадении. При assess сверять descriptor фактически signed child, не только текущую deployed release: passive recovery старых A-receipts должен работать при current B, но B-child не должен аттестоваться как исполнение A-manifest. Старые/неполные descriptors требуют явно ограниченного fallback, без молчаливого заимствования нового expected release.

### Остальная проверенная область

- On-chain `SettleCoupon` использует registry key и canonical associated token authority/mint, общий `pay_coupon` с holder claim, checked arithmetic и прежний mask. ACTIVE-only ограничения не добавлено; event разделяет executor/beneficiary/destination. В проверенном новом diff не найден обход фиксированного получателя, произвольной суммы или principal permissions.
- Request ограничен1..4 уникальными адресами, explicit coupon, запрещает amount overrides. Rent и settlement отображаются отдельно; four-new-ATA runtime bundle в retained lifecycle измерен **808 bytes**. API ограничивает rent12000000 и fee1000000 test lamports; finite run содержит до4 batches. Эти ограничения не являются budget для mainnet/реальных средств.
- Immutable snapshot/groups/digest и deterministic child IDs реализованы; конкурирующий обычный claim блокирует старый план, unknown/pending не переподписываются. Текущие tests покрывают passive restart и lease. E1/E2 — конкретные оставшиеся границы этих гарантий.
- Program identity проверяет canonical loader pointer, typed metadata/owner/flags, activation slot, hash/length/zero padding, fresh headers и genesis вокруг payload; cache не заменяет новые header observations. Source-to-binary attestation не заявлена. Snapshot source использует gates до generated signing и первой wallet relay, сохраняя passive known-signature recovery.
- Launcher сохраняет старый ledger, выбирает hash namespace, проверяет image/release и чужие занятые порты; destructive reset отсутствует. Его запуск critic не повторял.

### Фактически выполненные проверки и evidence

Независимо запущены `coupon-settlement.test.ts`, `coupon-run.test.ts`, `program-identity.test.ts`, `release-relay.test.ts`: **39/39 passed**,0skipped, exit0. Дополнительно E1 и E2 reproductions —2 отдельных passed tests, подтверждающих ошибки; их нельзя суммировать с passed regression как отсутствие дефектов. Retained logs `.local/backend-execution/node-tests.log` и `program-tests.log` прочитаны:156Node и3unit+11runtime passed; полные наборы critic не перезапускал. Изменение test helper на synthetic manifest-at-read-boundary не меняло release.json на диске и не подменяет actual SBF evidence.

Прочитаны `scripts/execution-smoke.ts` и `.local/backend-execution/lifecycle.log`: assertions предшествуют evidence write, есть реальная restart gate между batches и сравнение first signature/digest после restart. Retained JSON:29 wallet +4 operator +3 auxiliary,36 distinct signatures; шесть holders,25 units, coupons1875/principal25000. First four-recipient batch проверяет отсутствие прежних recipient ATAs и точные postToken amounts. В source не обнаружена подстановка fictitious successful signatures или смешение человеческого кошелька с generated test signers.

**Независимое текущее read-only RPC8929, slot4730:** genesis соответствует evidence; у выпуска `4fUZgJbBL99e98o5t5JfcsqSqT5kw8qaYHvUL6GSaG8G` coherent bank показал issued25/redeemed25/mint supply0/vault0, coupon claimed masks63/63, paid coupon sum1875000000 и principal25000000000 minor units. Это подтверждает текущие accounts/денежные итоги. Все36 запросов `getSignatureStatuses(...searchTransactionHistory:true)` вернули null: old transaction history сейчас недоступна, поэтому они не переаттестованы как fresh confirmations. Будущий proof-capture module необходимо проверить отдельно; эти null не превращены ни в success, ни в false transaction failure.

### Frozen initial implementation hashes

| Файл | SHA-256 |
| --- | --- |
| server/coupon-settlement.ts | 8466B1DD0133C95A05618B4248CE7DFAD5027F1C1DD22D2BB725731791C4517D |
| server/coupon-run.ts | 7A94379AEC114FF165129B349018D5416454145B63A4ACDA1D30BE4E0C3B6A45 |
| server/program-identity.ts | B9580A3DD2C71B24499D5E5DEAF18E6A4491E64A5C5E1EB41D9E461B9778C39D |
| server/transactions.ts | D1DACE880ECA99C4D19C56B7BF29BEAE0D3D1A014A7699CBE1DE4BB1AEF38072 |
| programs/bondtrace/src/lib.rs | BB77EE34F03BD90CA201692B440103BCFFB0414F33F6BCED88EF21FDA2FFDEDC |
| programs/bondtrace/src/contexts.rs | D0154C67E076F8215C0C2AA8DCC312C9BDCED677A5B71E657537849883CB6999 |
| programs/bondtrace/src/state.rs | F7895EDF747EBC45B47DECE506472882E83D08F67D3A49FA002AE5AA966EC4C9 |
| programs/bondtrace/bondtrace-idl.json | E29A5D3A727D1FF82464D92CF638BA82085D9F22933B58D1FA60BFC5762E8B17 |
| programs/bondtrace/release.json | F48872FDE014A0BD3A1245A4CCDD8C3AE73C030B542D81B474342B968C695095 |
| packages/client/src/program.ts | 9183F4C2D5946D823871F0DEF47C7B6596F816396FC808E54AA045DB4DF83C03 |
| scripts/execution-smoke.ts | 52EEE26032464852A26F745DA4494F9804D246502589B7088779BA0A54B871EC |
| docs/evidence/execution-lifecycle-localnet.json | 46C8D604ED7521730076C7D03BD196A7038A242505B9FD97CFFBA36F90F3FC4A |

**Initial implementation disposition: repair required, E1/E2 открыты.** Lead сообщил о начатых исправлениях уже после воспроизведений; их source не получает acceptance этого frozen cutoff. Следующий review — переданный завершённый repair packet с regressions; максимум2 repairs сохраняется. No code/Git/config/UI mutation, signer reads, server restarts или live writes со стороны critic.

## Repair 1 — E1/E2 и публичный transaction-proof archive

2026-10-08. Исходные finding IDs, reproductions и hashes выше сохранены. Current AGENTS/STATE прочитаны; использованы те же установленные ProofPilot coach, solana-dev security/testing и review-and-iterate. Новый proof capture включён в этот предоставленный repair packet, без переоткрытия старого servicing review.

**E1 closed.** Окончательный SQLite transaction в submitPrepared повторно читает receipt после async verification. Совместимый retained context приводит к привязке prepared signature и passive recovery; receipt не заменяется и send не вызывается. Несовместимый context завершается409. Проверены regressions, сохраняющие receipt непосредственно во время async genesis verifier: both compatible/no-overwrite и incompatible/no-bind paths. Начальная outer проверка не используется как единственная гарантия.

**E2 closed.** Parent передаёт requiredProgramRelease через фактический defaultExecutor wrapper → demoAction → execute → buildTransaction. Проверка precedes cryptographic signing; fresh recorded descriptor повторно сравнивается с required в синхронном pre-send callback внутри storage transaction. Child operation сохраняет descriptor. `child()` проверяет retained receipt descriptor (или сохранённый child descriptor, если receipt descriptor отсутствует) против manifest; чужой release больше не становится completed run. Passive recovery не требует current deployment совпадать со старым release: сравнивается recorded child. Проверен negative child mismatch и signer counter test с другой допустимой текущей версией.

### Proof archive review

`transaction-proof.ts` выполняет один getTransaction и проверяет confirmed slot, successful meta, canonical wire/message, first receipt signature и все необходимые Ed25519 signatures, expected retained wire (когда доступен), version/lookup scope, indices, exact safe lamports/u64 token amounts, fee conservation и mint/decimal consistency. В public proof сохраняются normalized balances, account keys и hashes, без signed transaction bytes и provider logs. Legacy/v0 без address tables поддержаны; unsupported version/lookup/missing/malformed data дают явный gap, не изменяют payment status.

`proof-retention.ts` сначала резервирует capture attempt, затем принимает его результат только для того же attempt и неизменного confirmed receipt slot/genesis. Автоматический повтор отсутствует; explicit retry имеет новый fenced attempt. Ошибки optional archival не меняют chainStatus/projectionStatus. Production capture transport ограничен4s. Public representation явно сообщает retained-observation scope и whether stored receipt context still matches. Retry route/export не выдаёт archived balances за новый financial snapshot или независимую аттестацию. По проверенному коду новых материальных defects не найдено.

Launcher/source smoke прочитаны: RestartApi проверяет recorded listener/PID/start-time и genesis/RPC перед остановкой, сохраняет ledger; execFileSync `stdio:ignore` устраняет ожидание pipe handles дочернего server. Smoke сохраняет новое имя evidence и отвергает overwrite старого; archive result пишется только после checks всех предусмотренных proofs. Сам critic запуск/restart/mutations не выполнял.

### Независимые проверки repair 1

- `release-relay.test.ts` + `coupon-run.test.ts` + `transaction-proof.test.ts` + `proof-retention.test.ts`: **40/40 passed**,0failed/0skipped, exit0. Output сохранён в `.local/tests/execution-critic-c710f54b94e54d769e3f7a12f0200f74/repair1-tests.log`. Полный156-test initial pass не выдаётся за повторную полную проверку repaired source.
- Scoped `git diff --check` — exit0.
- `docs/evidence/execution-client-crash-recovery.json`: same plan digest `88b581a3…`, same first signature `2cWRDLUy…`, before ready → after completed/2groups/desiredRightsPaid true. Его scope честно исключает principal и второй coupon; это отдельный interrupted-client case, не полный исходный цикл4fUZ….
- Независимый **live read-only RPC8929** этого first-proof transaction на slot8698 вернул успешный getTransaction. Current genesis совпал; SHA-256 wire совпал с retained proof, wire808 bytes, pre/post lamport arrays и fee5000 совпали побайтно/по точным строкам с сохранёнными значениями. Это fresh recheck конкретной signature2cWRDLUy…, а не повторное подтверждение всех36 ранее pruned signatures.
- На момент source/test cutoff `docs/evidence/execution-archive-lifecycle-localnet.json` **ещё отсутствовал**. Полный новый цикл с archival всех транзакций остаётся ожидаемым evidence; существующий proof одного batch не заменяет его. Позднейший завершённый файл может быть добавлен отдельным evidence-only appendix к этому же неизменённому snapshot.

### Repair-1 snapshot hashes

| Файл | SHA-256 |
| --- | --- |
| server/transactions.ts | EA05815FFDAD98C149EDCB21C8D2E6BBEA896099E3298B5EA41B860A05E6E5DB |
| server/actions.ts | 006876D51E3A78CB64E68E0A2F0D81CE235E0B3EA68A38A56EF1FEF497AD40CD |
| server/coupon-run.ts | 22A2DBC800EE4025C2FA0467833EF51101A0C305809F317FE9993C69155D2A49 |
| server/transaction-proof.ts | 4C6777F85A6559623D8FC2C479D82B07DBDA137F33B7AE9D8A8DA72D14F08691 |
| server/proof-retention.ts | AB89F2D2C3575931FE04C4AE3E0E7427B8A52538CC58D73B548B0B8EB8DCF644 |
| server/rpc.ts | 294F350D75945658D1ECF3EFE7DF53AF370DD94EB89BA7195DB529481E974CB0 |
| server/evidence.ts | 744D19F2A5F412C23D56009328C3C96E3C6B5B5A88D14335AE61ED160ECF5185 |
| server/index.ts | D9295473B475C10A54F2E2714ABC8AC39D53282AEE5B923439C8181DFCB7F23D |
| server/journal.ts | D7E9F6148CBBE32FCBCD11C1EA0DD93BF708C074913A9D949DBEB0EA5FE8FBF5 |
| scripts/backend-runtime.ps1 | 42D55BDB76FF916B40B03FB4DF5BFF9605CC8CB4FD35FD473432E34E1D14E431 |
| scripts/backend-validator.sh | 66471881AF18CFDE42ECA4EBBF1120F1B0850DA5C64D24CDC1FF6EAC38CE3266 |
| scripts/execution-smoke.ts | 0CCEBAF95F3B5E9B1E28CFA0A93F8B23FFC976BAA12B7F073DC17B526213ED96 |
| tests/client/release-relay.test.ts | E22BB7B38896BE26264E76468DCA78704563BF8635F310ADBDE952A9108A0170 |
| tests/client/coupon-run.test.ts | 8DDD6899661B61524AF972C85D6BBBE179A95E1E6888ECE1FDD81D6F494CC20C |
| tests/client/transaction-proof.test.ts | 5A05C015C298862132FBA87D0AA0E45AE47798F16A6408337D7CD95F5E670954 |
| tests/client/proof-retention.test.ts | 9B4EDB96C60D03313E95F11424BE7EB73DEB8DE41D06FD58C8D05E40F4CB04B4 |
| docs/evidence/execution-client-crash-recovery.json | 2FDD0B219B52ED5ACEBE6D912756DD5A3AB16D40268F1513C32688E8119307BB |

**Repair-1 disposition:** E1/E2 closed; новых подтверждённых material code blockers нет. Source conditions A1–A3 пройдены в указанном localnet/test scope. Полный новый archive-cycle evidence ещё не рассмотрен. Вторая repair нужна только при новых подтверждённых дефектах/изменениях; не запускать score или polishing loop ради дополнительного verdict. Внешние gates, RPC trust, mutable upgrade authority, отсутствие source-to-binary/independent attestation и ограничения decoder сохранены.

## Final evidence-only appendix — полный archive cycle закрыт

2026-10-08. Current AGENTS/STATE прочитаны; те же уже прочитанные ProofPilot coach, solana-dev security/testing, review-and-iterate использованы для проверки evidence. Это завершение ожидавшейся evidence части repair1, **не новая code repair, не переоценка и не сброс бюджета**. E1/E2 остаются closed.

Повторные SHA-256 семи критичных backend modules (`transactions`, `actions`, `coupon-run`, `transaction-proof`, `proof-retention`, `rpc`, `evidence`) совпали с repair1 snapshot выше. Просмотренные изменения harness ограничивают автоматический retry безопасными GET и добавляют `Connection: close`; финансовый POST не повторяется автоматически. Прочитан portable release helper: он вычисляет hash actual SBF и в `--check` сравнивает descriptor, без обхода runtime guard. Actual local binary/manifest по-прежнему4b75579a…/482752bytes.

Независимо проверены оба завершённых artifact: `execution-archive-lifecycle-localnet.json` и `execution-archive-http-localnet.json`; выпуск `wvgaaG3CDQ2irLz3y4obWVfPmFoe7pGQ3QtrB7J96G4` не смешивается с прежними36-case или client-crash case.

- Фактический набор: **29 wallet relay +4 operator batches +7 auxiliary =40 уникальных signatures**. Auxiliary состоит из1 explicit test-settlement mint и6 test-SOL funding. У каждого из40 есть ровно один archived proof с той же signature, capture=captured, expectedWireMatched=true и matchesStoredReceipt=true; proof остаётся RPC observation/independentAttestation=false.
- Offline BigInt-сверка40 proof lamport arrays: sum(pre)−sum(post)=fee для каждого. Суммы итога:1875000000 coupon +25000000000 principal =26875000000 minor units при6 decimals, то есть1875+25000=26875 test units. Issued/redeemed25, mint supply/vault/remaining obligations0. Оба coupon runs completed.
- **Свежий независимый read-only RPC8929, context slot13979:** все40 signatures доступны, err=null, **все finalized**; genesis совпадает с artifact. Это новая прямая проверка именно40-case, а не переименование старой pruned history в подтверждённую.
- Для первого operator batch независимо перечитаны base64 и JSON getTransaction: hash wire совпал с retained proof, **808bytes/210886CU/5000lamports fee**. Для всех4 beneficiaries проверены preLamports0, отсутствие preToken entry, появление postToken entry и точное совпадение выплаты с immutable group amount. Это fresh evidence4 новых ATAs, не только boolean в отчёте.
- Retained `.local/backend-execution/final-node-tests.log` действительно заканчивается **174/174 passed,0failed/0skipped**, exit summary согласован. Не суммируется с initial156 или узкими40. Rust program не менялся после переданных3unit+11runtime; повторный Rust run critic не запускал.
- `docs/27-BACKEND-EXECUTION-RESULTS.md` и README прочитаны. Материальные итоговые claims согласуются с code/evidence, failed harness history и scope limits сохранены. README старый36-case ссылается на свой файл и не объединяет его с новым40-case. Scoped diff-check — exit0.

### Final evidence/document hashes

| Артефакт | SHA-256 |
| --- | --- |
| docs/evidence/execution-archive-lifecycle-localnet.json | 594E0B8C983B7E27CFEF58A3DF9BB8E0F0A370E5A0FC922DD00D2CDD428E766E |
| docs/evidence/execution-archive-http-localnet.json | EA9D39136E7E53E36390B4ECDED307A53F29EABC9B80FDF1C109CE451ED6F149 |
| docs/27-BACKEND-EXECUTION-RESULTS.md | 484DB0C1CF4F5EFCA48B80CD0EC5BFF81A791C04465DA16FD19D1EDC1996511B |
| README.md | C48CEF7AAAEE56A6FC760623FD57ED6DAE49CB1F908D29628B3FF62D162A9548 |
| scripts/execution-smoke.ts | FBF7B7E74D424964436E1F87B4CB9CB0103E6064A9F1F8874E4B8E87838FDA84 |
| scripts/write-program-release.mjs | AB0120266CD8FD1710C8B2517499212330A77A014FB4083B864BEF63C919D41C |
| .local/backend-execution/final-node-tests.log | BFFE4EF4D4F1C74E01B32E4317DA6B6BC036E4876DD31AEE9390AE4A98D917C3 |
| programs/bondtrace/release.json | F48872FDE014A0BD3A1245A4CCDD8C3AE73C030B542D81B474342B968C695095 |
| target/deploy/bondtrace.so | 4B75579AD52B046F8FEDF528DBDDC09722E7CD92D73B2778E16201D612B44B50 |

**Final disposition:** ранее ожидавшийся полный archive-cycle evidence подтверждён; E1/E2 закрыты, открытых подтверждённых материальных замечаний данного execution scope нет. Нет grounds для repair2 на этом snapshot. Результат относится к проверенному localnet backend; не означает конкурсных баллов, devnet/human-wallet/production/public-hosting или финальной подачи. Режим фиксированных bounded runs, RPC trust и release/consent gates сохранены. Critic выполнял только чтение и append этого отчёта, без code edits, process restart, подписания, network writes, Git/UI/ledger mutation.
