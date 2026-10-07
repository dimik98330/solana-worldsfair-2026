# BondTrace: независимое архитектурное ревью, draft1 + repair1 + repair2

Дата проверки: 07.10.2026. Роль: независимый технический критик, **ProofPilot coach, plan → review**. Это не официальный judging, аудит production или подтверждение eligibility. Первоначальный пакет: предложение ведущего, AGENTS.md, стартовый документ, docs/00, 07, 08, 10, 12, 15; первые state.rs/Cargo.toml. Проверяется выбранный KASE scope; поиск другой идеи не возобновлялся.

## Решение и пределы

Продолжать авторизованную локальную реализацию можно. Объявлять архитектуру проверенной или prototype готовым пока нельзя: у приведённой модели есть конкретные условия корректности и риск блокировки snapshot; исполняемых evidence ещё нет. Не требуется менять выбранный проект. Минимальные изменения ниже сохраняют три действия: coupon, redemption, voting.

В этой версии исходники instruction handlers, окончательные docs/09 и docs/11, compilation, serialized transactions, CU и runtime tests ещё не были доступны. Наличие state.rs и dependencies не является успешной компиляцией. До первого executable pass выводы о реализации — unknown. Не подписывались транзакции, не устанавливались инструменты, не менялись code/config/Git, аккаунты и submission.

Применены реально прочитанные project skills: proofpilot (routing, plan, review, quality, evidence, decisions, safety, honest-evaluation, solana-new); solana-dev (security, programs/design-patterns, testing); review-and-iterate (security-basics, code-review-rubric, compute-optimization); cso в scoped architecture/STRIDE режиме. Ограничение ownership разрешает запись только этого файла; дополнительные HTML/.superstack/quality-run файлы не создавались. Quality helper в этом проходе не запускался; никакого protocol accepted не заявлено. Начальная оценка плюс максимум две проверки исправлений; IDs замечаний сохранять.

Solana MCP tools в списке текущего critic-context не обнаружены. Вместо повторной установки использованы официальные первоисточники через web. Это локальная граница discovery critic-context, а не утверждение, что ранее настроенный MCP отсутствует у ведущего.

## Материальные замечания

### AR01 — HIGH: закрытие пустого frozen ATA способно заблокировать все snapshots

**Состояние:** подтверждённая особенность SPL; наличие уязвимого handler пока unknown. **Уверенность в механизме: 9/10.**

Legacy SPL `process_close_account` проверяет отсутствие token balance и close authority, но не отвергает Frozen. Держатель переводит все units другому зарегистрированному держателю через разрешённый transfer, затем напрямую закрывает свой пустой ATA. Registry остаётся неизменным. Если coupon/redemption/voting snapshot безусловно требует deserialize каждого ATA как TokenAccount, один отсутствующий ATA блокирует общую фиксацию. После record date transfer lock может сохраниться навсегда. Это DoS, а не кража coupon.

Минимальный fix: snapshot сначала проверяет **точный canonical ATA key** из wallet + token program + bond mint. Для system-owned, data-empty канонического ATA сумма равна0; не требовать lamports==0, поскольку туда можно прислать lamports. Для существующего SPL account проверить program owner и mint. Если amount0 — сумма0 независимо от Frozen/Initialized, token authority, close authority или delegate: после close→recreate holder может менять владельца пустого Initialized ATA, и строгая проверка owner для0 снова даст DoS. Для amount>0 обязательно проверять token authority=registry wallet, Frozen и запрет нестандартных authorities/delegates. Нельзя делать «ошибка decode →0» для произвольных account owners/data. Transfer/issue в recreated zero ATA должен безопасно создать/привести account к требуемому state; unconditional thaw пустого Initialized ATA ошибочен. Пустой ATA с чужим token authority не должен блокировать snapshot; перевод в него отдельно отклоняется до восстановления владельца. Альтернатива — issuer-funded idempotent recreate до snapshot, но она требует явного payer и проверенного runtime flow.

Обязательная проверка: transfer-all → SPL close frozen zero ATA → coupon capture всей registry проходит и сумма равна supply. Повторить для redemption и варианта close→recreate→SetAuthority(AccountOwner) пустого ATA; проверить malformed/noncanonical account rejection. При выборе recreate — проверить дополнительные accounts/CU/tx size.

Источник: [официальный SPL Token processor, process_close_account](https://github.com/solana-program/token/blob/main/program/src/processor.rs), прочитан 07.10.2026. В прочитанном raw тексте участок614–649 допускает closure frozen zero account; freeze checks есть у transfer/burn/approve/set_authority.

### AR02 — HIGH: запрет только Active transfers недостаточен для record-date cutoff

**Состояние:** обязательное условие реализации, handler ещё не проверен. **Уверенность: 8/10.**

Если Draft issuance/registration/seal допускаются после первого record_ts, issuer может выпустить units и добавить holders уже после даты, затем seal и capture объявят их владельцами на прошлую record date. Передача Active tokens будет защищена, но entitlement ошибочен.

Минимальный fix: создание terms требует `now < first_record_ts`; issuance и seal требуют `state == Draft && now < first_record_ts`. Registry и terms не меняются после seal; либо отдельно запретить registration после cutoff, либо доказать, что она не может повлиять ни на один valid sealed snapshot. Проверять время через `Clock::get()`, не timestamp аргументом/HTTP. После наступления каждой uncaptured record date запрещать все пути изменения supply/holdings, включая административные функции. Не разрешать capture в Draft.

Проверка: boundary Clock `record_ts-1`, `record_ts`, `record_ts+1`; поздние issue/seal/capture invalid; второй overdue coupon сохраняет transfer lock после capture первого. Maturity закрывает transfer независимо от coupon index.

### AR03 — MEDIUM: максимальный registry limit требует доказательства размера и вычислений

**Состояние:** unknown feasibility при16 holders. **Уверенность: 8/10, это verification gate, не установленный exploit.**

Atomically read ALL registered ATAs — разумный способ убрать влияние задержки фиксации. Но лимит16 сам по себе не доказывает, что create/capture/vote/redemption instructions, account initialization и дополнительные signers помещаются в реально выбранный transaction format и runtime budget.

Минимальный fix: измерить serialized transaction size и simulate CU для16 держателей и максимальных title/name/schedule; сохранить выбранный format и действующий wallet fallback. Если предел нарушен — снизить честно объявленный registry cap до измеренного значения либо применить проверенный v0+ALT/v1 путь. Не заменять atomic snapshot серверной таблицей или несколькими изменяемыми partial snapshots. Не строить MVP на неподтверждённой активации v1/wallet support.

Источник: [официальная документация Solana transactions](https://solana.com/docs/core/transactions), прочитана 07.10.2026: atomic rollback; legacy/v0 size1232 bytes, v1 format4096; формат/cluster/wallet совместимость всё равно нужно проверить локально.

### AR04 — MEDIUM: старые coupon права должны пережить продажу и полное погашение

**Состояние:** acceptance condition; handler ещё не проверен. **Уверенность: 9/10.**

Coupon claim не должен требовать текущие bond units, существующий bond ATA или только Active state. Держатель после capture может продать всю позицию; после maturity redeem burn уменьшает supply до0, но старые unpaid coupons остаются обязательствами. `claim_coupon` должен приниматься в Active, Redeeming и Redeemed при выполненных snapshot/signature/payment-time условиях.

Минимальный fix: права вычисляются исключительно из immutable Coupon.units и sealed registry; coupon PDA связан с правильным bond/index; recipient — canonical settlement ATA того же holder signer. Claims не закрываются переходом bond state. `begin_redemption` ждёт **всех captures**, но не всех coupon claims; principal reserve и unpaid coupon reserve остаются в общем vault. Нет withdrawal/sweep, уничтожающего эти права.

Проверка: capture → holder transfer-all → old coupon claim; capture → begin redemption → principal paid всем → old coupon claim; повторные claims отвергнуты, failed CPI откатывает bitmap/paid_total.

### AR05 — MEDIUM: exact coupon terms должны совпадать с UI annual-rate обещанием

**Состояние:** state.rs использует заранее заданный integer unit_amount; API/spec показывают rateBps/couponFrequency. **Уверенность: 8/10.**

Хранить купон в settlement base units на1 whole bond проще и безопаснее дробной математики; `payment_amount` и `required_reserve` используют checked multiplication/addition. Однако интерфейс не должен независимо считать одну сумму из annual rate, а on-chain платить другую из arbitrary unit_amount.

Минимальный fix: единый adapter проверяет/показывает связь `face_minor * rate_bps / (10000 * frequency)`; для MVP отклонять terms с ненулевым остатком деления либо явно определить rounding и показывать точные per-unit terms. При explicit fixed schedule отображать именно его, а rate помечать derivation/fixture metadata. Все u64 и intermediate u128/BigInt, JSON integer strings; `1000 * 1e6`, `500 * 1e6` не смешивать с bond units0 decimals. Проверить overflow aggregate reserve, positive face/supply, schedule ordering и `record <= payment <= maturity`.

Проверка примера: face1000, rate10%, frequency2 → per-unit50,10 bonds→500 coupon и10000 principal. Supply split между holders не меняет aggregate entitlement. Overflow и нецелая формула имеют явную ошибку, а не truncation без сообщения.

## Инварианты, которые требуют executable evidence

| Область | Ожидаемая защита | Минимальный adversarial check |
|---|---|---|
| Issuer administration | Signer + bond.issuer; canonical seeds/bump | Чужая подпись и настоящий issuer address без подписи |
| Supply | Only Bond PDA mint authority; mint/bond/vault relationships pinned | Другой mint, Token-2022 или fake Token program отвергнут |
| Freeze escape | Nonzero holder ATAs frozen между инструкциями; no generic thaw | Прямые SPL transfer/burn/approve/setAuthority/thaw не обходят программу |
| Account substitution | Exact registry order/count; canonical ATA; mint/owner/frozen checks | Omission, reorder, duplicate, foreign mint, foreign owner, fake snapshot |
| Source inventory | Сумма snapshot units == actual mint supply == sealed total_issued до burn | Дублированные holders и accounting drift не принимаются |
| Solvency | Seal до record, fully-funded principal + ALL fixed coupons; no withdrawal | Underfunded seal, overflow, CPI failure и unsolicited deposits |
| Coupon claim | Holder signer, correct bond/index, immutable units, bitmap before commit | Double claim, wrong recipient, wrong coupon, zero entitlement |
| Redemption | Immutable current holdings snapshot после всех coupons captured; thaw/burn/pay atomic | Cash без burn невозможен, burn без pay откатывается, повтор rejected |
| Voting | Snapshot current holdings при create; one ballot PDA proposal/voter; deadline | Transfer после vote snapshot не меняет вес; double/late/wrong-proposal vote rejected |
| Retry | Same signed transaction tracked until expiry/status known; business state idempotent | RPC timeout после execution не приводит к повторной выплате |
| Demo signer | Generated test roles only; localnet/devnet; fixed allowed actions/destinations | HTTP role/action не позволяет выбирать human key, arbitrary address/mainnet |

Снимок voting информационный: он не может менять face/schedule/reserve. У proposal должно быть явно показано opened_at и closes_at; фактическое участие/итоги читаются из chain после reload. Не нужны DAO execution, oracle, bridge, bank/KASE integration для выбранного scope.

Инструкция с thaw→transfer/burn→freeze корректна только внутри одной атомарной транзакции и с проверенным SPL program. У account после CPI кэш может быть старым; reload перед сравнением post-balance/post-supply. Freeze authority не равна юридическому реестру/регуляторному разрешению.

## Corporate logic и KASE coverage

| Задача | Предложение покрывает логику? | Чего пока не доказано |
|---|---|---|
| Coupon | Да, bounded immutable snapshot + exact integer payout | Истинная signature, payment-time/access/failure tests, UI reconciliation |
| Redemption | Да, maturity snapshot + principal/burn atomic | Старые coupon claims, all-capture liveness, закрытый ATA case |
| Additional action | Voting подходит заявленному дополнительному действию | Wallet signing, immutable weight/deadline, persisted result |
| External fiat rails | Test settlement token явно отделён от реальных rails | Нельзя заявлять банковскую/KASE интеграцию или real payment |
| Submission | docs08 задаёт prototype/demo/source/overview | Eligibility, judge repo access, global registration и owner final action unknown |

Полная KASE страница в critic web context недоступна: direct web open returned inaccessible. Ровно три категории действий и разрешение model external rails в этом проходе взяты из предоставленных docs/08 и state; это **reported source extraction**, не повторно проверенный critic DOM. Ведущему передано требование сохранить полный исходный browser text для exact-requirements check. API/sandbox/партнёрство не объявлены обязательными или имеющимися без evidence.

Один beginner developer, zero external-service budget и ближайший DemoDay — ограничения плана. Custom program оправдан необходимостью enforce immutable rights, one-time payouts и burn/pay atomicity; стандартный SPL transfer без собственного состояния этого не доказывает. Scope16 holders/8 coupons, заранее полностью funded test instrument, informational voting реалистичнее open market и partial funding/default workflow. Не добавлять production-scale claims: registry immutable после seal, coupons автоматизированы on-chain правилами, но snapshot требует explicit crank и issuer availability. Если issuer потерян, permissioned capture может остановиться; показать это как операционный trust/liveness bound либо сделать безопасный permissionless capture с теми же accounts/terms, если это не усложняет MVP.

## Остаточные неизвестные и следующий проход

Не проверены: Anchor1.1.2 actual build/dependency resolution, SBF stack/heap/account sizes, WSL/runtime compatibility, v1 activation/wallet support, localnet/devnet deployment/funding, transaction bytes/CU, real UI signing/failed signature, maximum registry edge, program upgrade authority и test settlement mint freeze authority. Upgrade authority может заменить программу; settlement mint freeze authority может остановить settlement. Для devnet prototype явно раскрыть эти trust assumptions; это не повод вводить mainnet/multisig/paid infrastructure в текущий scope.

Следующий critic pass: прочитать docs/09, docs/11 и actual handlers/tests после записи; проверить AR01–AR05 по code и executable outputs. Review после correction считать repair1, не сбрасывать draft1. Ведущий обновляет docs/00-STATE.md с chosen skills/checks/blockers/stopping gate. Owner login/consent, public visibility, mainnet/real funds/paid services, outreach/final submission сохраняют свои ограничения.

## Repair1: проверка фактических instruction handlers и09/11

Новые свидетельства: записаны lib.rs/accounts.rs, docs/09 и docs/11; ведущий передал сохранённый browser excerpt KASE. В этом проходе прочитаны все instruction handlers и account constraints; исходный draft1 и IDs выше оставлены как история. Runtime tests ещё не были доступны; чужие code/config не менялись, compilation/tests не запускались параллельно работе program-agent.

**Результат source pass:** значимого архитектурного блокера продолжению локальной реализации не осталось. Изученные signer/PDA/mint/vault relationships согласованы; snapshot invariants, checked reserve, one-shot masks и ballot PDA, atomic burn/pay реализованы последовательно. Это source review, не доказательство рабочих CPI, SBF/runtime или готовности к подаче.

| ID | Resolution / текущий gate | Source evidence |
|---|---|---|
| AR01 | **Source-fixed**; runtime regression pending | lib.rs:287–314: exact ATA key, system/data-empty→0; SPL mint проверяется всегда, owner/authority/Frozen только при amount>0. Destination Initialized0 thaw условный в transfer. |
| AR02 | **Source-fixed**; boundary runtime pending | lib.rs:16,56,74,106: init record строго позже Clock; register/issue/seal строго до record. Active capture; transfer window и maturity gate в state.rs. |
| AR03 | **Open verification gate** |09/11 явно сохраняют serialized size/CU pending для16 holders. Не превращать это в passed до измерения. |
| AR04 | **Source-covered**; end-to-end regression pending | lib.rs:167: claim_coupon зависит от Coupon snapshot/time/holder; не требует bond ATA/Active. Begin redemption требует all captures, не all claims; principal burn/pay единый instruction. |
| AR05 | **Program scope clarified; adapter alignment pending** |09 прямо говорит fixed unit amounts, annual rate не stored on-chain. TS adapter обязан отображать эти terms/known demo derivation без fake annual-rate facts. |

В accounts.rs claim/principal destination проверяет settlement mint и token authority=holder Signer. Такой holder-owned account не обязан быть ATA: это корректное более широкое решение; первоначальный совет canonical settlement ATA выше не является обязательным security fix. Чужой holder-owned mint/vault/coupon отвергаются соответствующими has_one/seeds/token constraints.

Coupon capture permissionless (payer Signer), поэтому потеря issuer сама по себе его не блокирует; issuer liveness остаётся у begin_redemption и create_proposal.09/11 это явно различают. В09/11 blanket wording «snapshot rejects delegates/close authority» следует понимать только для nonzero account — именно так реализован исправленный handler; для0 послабление необходимо против griefing.

Проверка exact demo arithmetic выполнена локально через BigInt, не через program test: face_minor1000000000×rate_bps1000/(10000×2)=unit_coupon_minor50000000;10 units→coupon_minor500000000; principal_minor10000000000. Перевод обратно даёт50/500/10000 settlement tokens при decimals6. Это проверка формулы/единиц, не evidence исполнения payouts.

KASE source evidence теперь прочитано в `.local/quality-input/kase-excerpt.txt`: provenance URL и дата07.10.2026, saved visible AX. Подтверждает обязательные coupon, maturity redemption и additional action; external/fiat rails могут быть simulated, entitlement/Solana flow должны быть functional. Voting покрывает third action по предоставленному listing interpretation; full DOM с deliverables остаётся у ведущего, этот critic не заявляет лично выполненный full-page browser access. Published weights не использовались для придуманного score или win odds. Приведённые в docs08 deliverables проверяются ведущим по расширенному excerpt перед submission.

### Зафиксированные hashes source pass

SHA256 получены `Get-FileHash`, а не придуманы. Дальнейшая смена этих bytes делает соответствующий вывод историческим, требующим узкой новой проверки изменённой логики; не требуется перезапускать весь scope.

| Artifact | SHA256 |
|---|---|
| programs/bondtrace/src/lib.rs |4424133760073F58001887DD34BDCA4960470750C9FD76399EFEE7E8B7B9D7AC|
| programs/bondtrace/src/accounts.rs |F1F64C536310D774E515EA1726078A572D88E4539D96E30F3A41BE6C4665A105|
| programs/bondtrace/src/state.rs |0E2630E5BE7DC68A6AE7FE3588D96FC60457BA32B0692D59D5C9A6C7D219D762|
| docs/09-ARCHITECTURE.md |48FE5770BB1C11EE7923B8E4D14868508E64BC196FA74775C9E1240BF6ED074E|
| docs/11-SECURITY.md |6B6D3EE71B8A12D2B81AD9CB3DAB669CE5A0AC2FD4DF674A2A52832329807821|
| .local/quality-input/kase-excerpt.txt |43A1A550841129B1B3C9E2120C17812127DE4A2FD7EBEE754BF702ACE7CB9B80|

Оставлен максимум один repair2 для реально новых execution findings. Следующий полезный action ведущего — compile/SBF/IDL, account-substitution и cutoff/zero-ATA/old-coupon regressions,16-holder bytes/CU, затем UI wallet→chain→confirmed read. Окончательная готовность runtime/devnet/UI/submission по этому документу **unknown**, mainnet/real assets вне scope.

## Repair2: окончательная проверка сохранённых execution evidence

07.10.2026. **Последний разрешённый repair этой архитектурной оценки; бюджет не сбрасывался.** Использованы ранее прочитанные неизменённые skills/references: ProofPilot coach, solana-dev security/design patterns/testing, review-and-iterate и scoped cso. Запись по-прежнему только этого отчёта; никакие tests/runtime/wallet/install/config/Git команды критиком не запускались. Исторические draft1/repair1 и первоначальные unknown выше сохранены; следующие результаты их уточняют.

Прочитаны обновлённые09/11, весь tests/program/runtime.rs, saved runtime-final-results.log, runtime-results.log, runtime-idl-binary-results.log, unit-results.log, окончания SBF/native/IDL build logs, generated IDL, mcp-autofixer-result.json; TS domain/program, seed/state/actions и tests/client/domain.test.ts. У .so проверены фактический размер и SHA256. Отчёт не подменяет самостоятельно повторённый прогон: execution подтверждён сохранёнными outputs и соответствующим тестовым кодом.

**Вывод:** для измеренного локального прототипа архитектурные AR01–AR05 закрыты в приведённых ниже пределах. Реальные SBF+SPL CPI tests проходят; issuer/record/snapshot/payment/redemption/voting инварианты имеют существенное покрытие. Продолжать local RPC/browser/devnet интеграцию обоснованно. Полная готовность UI/devnet/submission и production безопасность по этой оценке не подтверждены.

| ID | Окончательный статус и точное покрытие |
|---|---|
| AR01 | **Closed, local runtime:** actual SPL close frozen zero ATA; второй zero ATA close→ATA recreate→SetAuthority(owner); proposal/coupon/redemption snapshots проходят; recreated zero ATA получает units через controlled transfer. Canonical order/count проверены негативными тестами. |
| AR02 | **Closed, local runtime:** init invalid/backdated terms rejected with account creation rollback; чужой issuer account/signature rejected; Draft register/issue/seal at record_ts rejected; Active transfer at record_ts и maturity rejected; early capture/redemption rejected. Exact record boundary tested, каждый возможный invalid signer/account combination не перебирался. |
| AR03 | **Closed for measured legacy fixture:** все три full-registry transactions реально executed, size/CU assertions присутствуют. Ни v1, ни ALT для этого случая не нужны. Все16 зарегистрированы; positive units первоначально только у2 holders. Полный96-byte proposal title и8-coupon worst-case schedule отдельно не измерены; обязательная per-transaction simulation сохраняется. |
| AR04 | **Closed, local runtime:** snapshot6/4 сохранён после transfer-all; principal получают текущие9/1; supply→0 и Redeemed;500 coupon остаётся reserve; прежний владелец получает300 после Redeemed, второй200; vault→0. Coupon/principal repeats rejected. Sequential2 coupons имеют разных owners, нельзя пропустить record или начать redemption до all captures. |
| AR05 | **Closed for fixed-term demo adapter:** couponPerBond использует BigInt и reject ненулевого остатка; seed использует именно этот результат в initializeIssue; on-chain payments/aggregates декодируются integer и JSON strings. API coupon amounts вычисляются из chain terms/snapshot, а rateBps/frequency являются сохранённой fixture metadata. Это не подтверждает произвольное юридическое толкование annual coupon или day-count conventions. |

### Execution evidence и числа

Сохранённые standalone runtime-final-results.log и runtime-results.log: **5 passed /0 failed**. runtime-idl-binary-results.log: также **5/0**, запуск compiled SBF в LiteSVM. unit-results.log: **3/0** — program ID, exact integer payment/overflow/holder bitmap и allocations. Начальная оценка allocation Proposal423 исправлена на фактические323 bytes; unit assertion теперь passed. SBF build log заканчивается Finished release, native check — Finished dev; присутствуют macro cfg warnings, поэтому это не «zero warnings».

|16-holder transaction | Legacy bytes | CU runtime-results.log | CU final log | CU IDL-binary log |
|---|---:|---:|---:|---:|
| create_proposal |884|84584|66584|60584|
| capture_coupon |839|83376|68376|66876|
| begin_redemption |772|75763|62263|56263|

Все приведённые samples меньше1232 bytes и200000 CU. Разница CU соответствует разным generated keys/PDA bumps;84_584 — максимум **наблюдённых трёх прогонов**, не математический worst-case. Тест явно asserts limits для каждой строки. Redeem principal CU47643 также сохранён в outputs.

Фактический `target/deploy/bondtrace.so`: **463096 bytes**, SHA256 `15525EC2DE285E7CC3065F7EC8CE47BFE81D1ED2837754B85B8CF2598C935DC2`. runtime fixture вызывает add_program_from_file именно этого path; полноценные classic SPL transfer/burn/freeze/close/recreate выполняются как CPI, а не подменены toast/mock выплатами. Settlement mint/source предварительно установлены тестовым fixture и Clock time-travel доступен harness, не product program.

Generated IDL существует и содержит ожидаемый program address; native IDL build output сохранён. TS тест проверяет adapter discriminators против **каждого actual IDL instruction**, integer formula, fractional rejection/overflow,16 unique bitmap bits, malformed discriminator/truncated decoder. Ведущий сообщил Node client **5/0**; код всех пяти тестов прочитан, отдельный Node result log в предоставленном evidence не найден, поэтому это reported execution, а не собственный прогон критика. Current programAccount проверяет owner/executable, Reader проверяет discriminator/границы, token reads SPL program/mint/165-byte length; связи coupon/proposal/bond дополнительно проверяются в state reader.

Official MCP autofixer сохранённый structured result содержит issues=[] и suggestions=[]; это **нулевые находки конкретного tool**, не независимый security audit. fmt passing сообщил program handoff; отдельный fmt output critic не проверял. Fuzzing/formal verification не выполнялись.

### Два интеграционных замечания, исправленных в пределах repair2

**AR06 — transaction preview:** первоначально fund_vault summary указывал actor как recipient, хотя инструкция платит vault; transfer summary не содержал amount/token/recipient. Исправление ведущего прочитано в server/actions.ts: funding recipient=bond.vault; transfer amount=units, token=bondMint, tokenDecimals0, recipient=targetWallet; claims tokenDecimals6 и holder recipient. **Source-fixed**, отображение реального wallet preview в browser пока unknown. Перед подписью UI должен использовать правильные tokenDecimals, чтобы не показывать bond units как шестизначную settlement currency.

**AR07 — backend closed-ATA read:** первоначально system-owned/data-empty canonical holder ATA с присланными lamports давал INVALID_TOKEN_OWNER и ломал GET state, хотя program snapshot считал его0. Исправление ведущего прочитано: tokenAmount(...,allowClosedCanonical=false) допускает system owner+empty data как0 только при true; true передаётся только уже вычисленным canonical ATAs registered holders. Vault/прочие token reads сохраняют strict SPL owner/mint/length. **Source-fixed**, отдельный API donated-lamports regression critic не исполнял.

### Сохраняемые ограничения покрытия

- Wrong owner/mint destination тесты показывают rejection и неизменные supply/vault/claim masks. Они отвергаются account constraints **до burn**; отдельного negative test «burn успел выполниться, settlement CPI failed, всё rollback» нет в прочитанном runtime.rs. Atomic rollback гарантируется transaction semantics и изученным единым handler; useful следующая regression — frozen settlement recipient при redeem, затем supply/vault/mask unchanged. Это точное ограничение тестового покрытия, не доказательство неатомарности.
- Отдельные adversarial combinations: поддельный Token program, duplicate snapshot metas, foreign snapshot PDA, missing signature, nonzero malicious delegate, unknown RPC status/retry, потеря issuer и wallet cancellation не все executed в этой suite. Часть защищена изученными typed constraints; не объявлять всю security matrix исчерпывающе пройденной.
- Ведущий сообщил actual local API seed18 bonds/reserve18900, real vote и coupon500/replay rejection. seed arithmetic18×(1000+50)=18900 подтверждается кодом; отдельные API execution signatures/outputs не входили в этот critic packet. Полный browser flow, реальные wallet prompts, mobile QA, devnet deployment и публичные Explorer receipts **unknown** в этом проходе.
- Mainnet, реальные активы, banking/KASE rails, KYC/compliance, market demand, organizer eligibility/judge access/final submission не подтверждаются этими тестами. Upgrade authority и test mint authority остаются disclosed trust boundaries.
- docs/00 всё ещё содержит прежний «дождаться A/B/C» stopping gate; AGENTS явно его supersedes, но ведущему нужно обновить current checkpoint выбранного KASE и фактических checks перед handoff/new chat.

### Hash snapshot repair2

Текущие source/log bytes зафиксированы Get-FileHash; имена accounts module изменились на contexts.rs, старый repair1 hash accounts.rs остаётся историческим.

| Artifact | SHA256 |
|---|---|
| programs/bondtrace/src/lib.rs |548482EC49A8E73DF87BEA7999B7C4C087B06E4C3178EA1984D7440D44C020AE|
| programs/bondtrace/src/contexts.rs |7AA090CA039E2EAF04A2AE9D1558C8A94D9CE9CF84A48994D849029528752151|
| programs/bondtrace/src/state.rs |BDB4971ADD7E488CB0C008A965676DE1F34D00A04851103232C33E85F3396ECE|
| tests/program/runtime.rs |3CF93F1381AF4AA4F19E9B48FCDE219BA3FB8AD19CAFB3CDE909C5A573E9F408|
| tooling/runtime-final-results.log |DCB266C11FF38233E12FCB3B19C28F48D6C66911B67F88026B8F9C55B783DF00|
| tooling/runtime-results.log |A37C32DBF80162A15AC88B36C29B7A9CA6716DF9633A03A24D9EC829587DF932|
| tooling/runtime-idl-binary-results.log |7787D5B497DB453D6EDC93D6BAE5085E371654C9088B9EA8C3B32A87BE1A14EE|
| tooling/unit-results.log |AA06BAC0A666B77CB848F4F80B7F9C0EAEB2DF646070F33D89ABCA06B21CD4EF|
| programs/bondtrace/bondtrace-idl.json |3594CA5FAE6F24D1D2D9B8B1DDD94BCE330321ADEF19DF61231B0E8FD3563A33|
| packages/client/src/domain.ts |9C6BFF657A5E69740AC7DBFEB6DEBC593DF01520E4B93397743BA352CA67E0D8|
| packages/client/src/program.ts |0B794C700B41A6D6A968CB18E5FC0412B912C32D8394D59B810078862656BD48|
| server/seed.ts |97A3C93779E74D634E2EA37A5B6EE58AB7712EE10661E209D3CFE40427898D89|
| server/state.ts |FC83084A3271497884B37BBC776310DD378DE9037D00EBC100BF7D33EEE762B3|
| server/actions.ts |D46B4D6B290313064DF15E3BA2198A9F9E79E79B28ADB72E279EB845F2E3275D|
| tests/client/domain.test.ts |075A732391347F8C6DB2F0BFC67CC72B8A64EF309ED96C1E31BE1610B0F84B40|

`tooling/*` rows относятся к `programs/bondtrace/tooling/*`. Решение и покрытие не получают official score, accepted certificate или readiness promotion автоматически. Архитектурное ревью на repair2 завершено; оставшиеся integration/owner gates сохраняются в handoff.
