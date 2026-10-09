# Независимая проверка усиления backend

Дата: 8 октября 2026. Роль: отдельный контекст архитектуры/security, нейтральный plan → review в ProofPilot coach. Это инженерная проверка разрешённого тестового прототипа, без конкурсного балла и без утверждения production readiness.

## Границы и метод

Прочитаны AGENTS.md, CODEX_SOLANA_WORLDSFAIR_START.md, docs/00-STATE.md, docs/21-BACKEND-FOCUS.md и относящиеся к рискам исходники. Применены фактически установленные `.agents/skills/proofpilot/SKILL.md` (routing, plan, review, quality, solana-new, safety), `solana-dev/SKILL.md` (Anchor accounts/migrations, security/invariants, testing), `review-and-iterate/SKILL.md` (security-basics, code-review-rubric, compute-optimization). Использованы чтение исходников и официальные документационные read-запросы. Исходники продукта, конфигурация, процессы, ledger, keys и старые evidence не изменялись. Не запускались builds, tests, Git, installs, deploy или chain writes. Единственная запись агента — этот отчёт; lead сохраняет общий checkpoint/quality bookkeeping.

Контекст: confidential source, coach, engineering/general. Последующий application verdict требует собственного пакета с application context. HTML/оценки/изменение `.superstack` из общего review skill здесь не выполняются: назначенное владение ограничено этим Markdown-отчётом. Mechanical quality helper не запускался, protocol acceptance этим текстом не заявляется.

Перед существенной работой и при передаче задачи каждый агент обязан заново прочитать актуальные AGENTS/START/STATE, выбрать и прочитать подходящие установленные SKILL и обязательные refs, сообщить их и сохранить stopping gate. Старые review lineage/initial+две repairs не сбрасываются. Сейчас идёт новая работа по воспроизведённому runtime failure и новым требованиям; история предыдущих выпусков остаётся отдельной.

## Исходный архитектурный cutoff

Просмотр исходников до 2026-10-08T12:35:47Z происходил одновременно с реализацией другими агентами. Поэтому это проверка предложенной архитектуры и увиденных baseline-свойств, **не frozen verdict новых файлов**. Например, `FinancialTerms` уже появлялся в state.rs, пока initialize_issue/launcher ещё были прежними. После завершения lead должен передать один frozen source manifest, actual checks/logs/live evidence и список изменений. Тогда можно проверять финальный набор целиком.

Противоречащее прежней успешной демонстрации свидетельство сохранено в docs/00-STATE.md: validator PID был жив, но RPC не слушал; RocksDB append завершился I/O panic на `/mnt/c`. Причина «закончился диск» не установлена. Последующее восстановление сохранённого ledger без новых financial signatures сообщает тот же genesis и те же итоговые суммы; агент это сообщение заново транзакциями не проверял.

## Материальные риски и приёмка

### ST-R1 — доступность, носитель и безопасный restart

**Наблюдение.** Исходный scripts/backend-runtime.ps1 получал ledger как Windows project `.local/backend-execution/<hash>/validator`, затем переводил через wslpath; scripts/backend-validator.sh запускал RocksDB там. Readiness проверял доступность getGenesisHash и API program identity. Это полезная проверка происхождения, но не доказывает исправность записи ledger или продвижение банка. Живой PID/порт уже оказался недостаточным.

**Требуемая реализация.** Для нового isolated release выбрать абсолютный native WSL namespace, сохранить старый Windows-mounted ledger целиком. Проверять свободное место native FS и реального Windows тома, содержащего WSL VHD; лимит VHD и свободное место physical host различаются. Проверка должна fail closed при невозможности определить обязательный носитель. Хранить exact ledger path, distro, PID/start identity, RPC/genesis/release, API/data namespace и журнал результата. Не использовать общий pkill, reset, удаление, WSL shutdown или новый genesis под старым recovery ID. Restart прекращает только собственный подтверждённый процесс и сначала восстанавливает чтения; не вызывает bootstrap или financial send.

**Gate.** Отдельный новый runtime имеет native ledger и проходит getHealth + две валидные slot observations с продвижением + expected genesis/program + API reconciliation + durable metadata readiness. Controlled restart показывает ту же genesis, financial totals, parent/child IDs и signatures. Занятый посторонним процессом порт, живой процесс с недоступным RPC, недостаточное место и чужой runtime record отклоняются, ledger/key files сохранены. SQLite проверяется в своём существующем Windows namespace; перенос native ledger не разрешает обход storage safe-path rules.

### ST-F1 — terms действительно гарантирует программа

**Наблюдение.** Baseline server/rate-terms.ts и admin.ts связывали rate/frequency с issuer-signed creation Memo, точной формулой и immutable projection. Baseline initialize_issue проверял положительные фиксированные coupon amounts/даты и checked reserve, но не имел annual-rate аргументов. Memo доказывает подписанное описание; оно не равно программному enforcement формулы.

**Требуемая реализация.** `initialize_rate_issue` создаёт Bond + versioned `FinancialTerms` PDA в одной атомарной instruction/transaction; seeds содержат Bond key, issuer подписывает, typed ownership/discriminator и canonical bump обязательны. Terms immutable, нет attach/update/close для существующего Bond. Сохраняется прежний layout/discriminator Bond и прежние fixed-amount instructions. Formula: checked widened integer `nominal × rate_bps / (10_000 × frequency)`, remainder=0, результат>0 и помещается в u64; каждый coupon unit_amount равен результату. Проверять также total reserve overflow. Никакого округления/API-only bypass.

**Gate.** Actual SBF tests вызывают новую instruction напрямую, без API/Memo: валидные terms принимаются, нулевые/вне диапазона rate/frequency, fractional base unit, mismatch одного coupon и overflow отвергаются без создания любого из новых аккаунтов. Reinit, чужой issuer/PDA/terms relationship и смешение accounts отвергаются. Старый fixed-amount lifecycle проходит с тем же layout. Client decoder и financial terms PDA читаются/проверяются в **том же financial getMultipleAccounts context**, а не отдельным свежим RPC, с сохранёнными bounds/retries и fail-closed ownership/schema проверками. Missing terms обозначает legacy/fixed, а не выдуманный annual rate.

**Неоднозначность, которую надо явно снять.** `frequency` может означать annual divisor либо календарную периодичность. Положительные упорядоченные даты сами по себе не доказывают «раз в полгода». Если регулярная calendar cadence не проверяется, честно назвать поле coupons-per-year для формулы и оставить schedule explicit; не утверждать календарный enforcement. Irregular/fixed coupons остаются самостоятельным разрешённым режимом.

### ST-T1 — business completion отдельно от finality

**Наблюдение.** Baseline server/rpc.ts сводил confirmed и finalized в один status=confirmed; ReceiptRecord сохранял chainStatus без original confirmationStatus. Retained transaction proof имел commitment=confirmed. Baseline return recorded-confirmation после null history является исторической сохранённой проверкой, а не live-finalized.

**Требуемая реализация.** Сохранить совместимый business/status contract и добавить durable finality/provenance отдельно: processed/confirmed/finalized/unknown, observedAt, observed slot, live либо retained basis. Return/UI/API/evidence должны передавать различие. Поднять до finalized можно только по валидному точному signature observation или соответствующему finalized getTransaction proof. Fresh confirmed account view, большой текущий slot, confirmations=null без валидного confirmationStatus и local completed flag не являются таким доказательством. При missing history хранить последнюю доказанную степень и explicitly retained source; legacy-unbound не получает выдуманную финальность.

**Gate.** Deterministic tests covering processed→confirmed→finalized, null/unknown history, failed tx, bad RPC shape, genesis mismatch и restart показывают, что finality не повышается без источника, proof commitment соответствует actual RPC request, а local projection не вызывает вторую выплату. Продвинувшийся slot может быть context этой проверки, но не отдельным finality сертификатом. Late/stale observer не перезаписывает более сильное сохранённое свидетельство; противоречивое live observation отражается как uncertainty/conflict без новой подписи.

### ST-W1 — durable whole-event, включая holder boundary

**Наблюдение.** Baseline coupon-run уже фиксировал immutable manifest/childOperationIds, genesis/release, explicit resume, bounded recipients/batches и unknown-child barrier. Servicing — advisory plan. Principal redeem instruction использует holder authority при burn. Bond REDEEMED достижим до поздних coupon claims; servicing.ts уже различал principal-redeemed-coupons-outstanding и fullySettled.

**Требуемая реализация.** Parent event manifest фиксируется транзакционно до первого child dispatch; child IDs неизменны и выводятся из идентичности плана/шага. Последовательность capture → coupon settlement → redemption opening → awaiting holder signatures → closed должна сохраняться при process death. Chain-derived already-satisfied steps учитываются отдельно от собственных receipts, не выдумывают signatures. В shared storage нет read/await/write race: после await обновлять latest state атомарно, с fence/release/genesis checks. Unknown signed child блокирует последующие financial intents; bounded same-wire recovery не превращается в fresh blockhash/re-sign.

**Gate.** Вне explicit generated-localtest mode план/статус/unsigned prepare не подписывают за issuer или holder. Две параллельные реальные процессы/requests и crash boundaries before persist / before send / after send before projection / after confirm before parent marker дают одни и те же child IDs/signatures и не более одного chain effect. Recovery после restart не требует нового parent ID. Closed подтверждается reconciliation: все coupon/principal obligations=0, redeemed units=issued, supply=0; избыточный donation reserve не должен требовать vault=0 для бизнес-закрытия. **Общий closure и aggregate finality остаются разными полями**. Пропущенная человеческая подпись оставляет awaiting_holders, а не success/failure. Купоны выплачиваются прежним record-date holders даже после transfer/burn.

### ST-I1 — stateful tests проверяют инварианты, а не только сценарий

**Наблюдение.** tests/program/runtime.rs действительно загружает compiled target/deploy/bondtrace.so в LiteSVM и classic SPL programs; baseline содержит rollback/maximum flow. Конкретные prior counts из STATE — сообщения предыдущего cutoff, здесь не повторно passed. Keypair::new и happy-path sequences сами по себе не делают workload seed-reproducible/stateful property testing.

**Gate.** Несколько фиксированных seeds производят воспроизводимые action sequences на current SBF: transfer/capture/pay/vote/mature/redeem плюс invalid/replay/alias/frozen-ATA cases. Независимая модель rights хранит units по capture, а не читает тот же helper программы. После **каждого шага**, включая failure, проверять supply=sum(current units)=issued−redeemed; paid=sum claimed snapshot rights; one-shot masks; reserve covers remaining liabilities; snapshot/vote rights immutable; failed transaction account bytes/balances неизменны. При failure печатать seed и компактный action trace, без key material. Нет утверждения fuzz coverage/security certificate по числу seeds.

### ST-C1 — чистые исходники и CI

**Наблюдение.** Исходные npm build/test:program вызывали Windows pwsh+WSL; shell helpers зависели от заранее установленного HOME/.local toolchain. Cargo.lock/Anchor pins есть, но clean-source-only archive не включает ignored tools/ledger/.so. `write-program-release.mjs` по умолчанию обновляет ожидаемый hash, а `--check` отдельно его проверяет. Update→check в одном verification job подтверждает только самосогласованность, не frozen expected release. В initial просмотре `.github` отсутствовал.

**Gate.** Один documented Linux-native reproducible path: pinned Node/npm, Agave/SBF/platform-tools/Rust, lockfiles, clean dependency install, build compiled SBF → current runtime tests → client/UI/typecheck/build → immutable release/IDL/source checks. Проверка frozen expected hash запускает `--check`, не переписывает expected manifest внутри того же gate. Если binary reproducibility не доказана, фиксировать toolchain/build provenance и не обещать byte-identical output на любой машине. CI выполняется без пользовательской .local/keys/evidence fixtures; smoke создаёт отдельные test identities/ledger. Safe source allowlist исключает `.local`, credentials, ignored keypairs, tool caches и stale runtime artifacts. Публичный staging также исключает media/artifacts, если задача именно source-only; private historical evidence не удаляется. Actual clean install/build output необходим, YAML/install state недостаточны. CI definition checked локально — не выполненный remote CI run.

## Первичные источники

Проверены read-only 2026-10-08; private product source внешним сервисам не передавался.

- [Solana getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses): returned status и searchTransactionHistory; отсутствие status не устанавливает неуспешное исполнение.
- [Solana RPC overview](https://solana.com/docs/rpc): commitment levels различаются; дополнительно Solana Docs MCP поиск подтвердил тип confirmationStatus и отдельно ordered comparison.
- [Solana getHealth](https://solana.com/docs/rpc/http/gethealth): проверяет здоровье RPC относительно tip; поэтому дополнение own single-node slot progress — инженерный вывод, а не обещание getHealth проверить диск.
- [Microsoft WSL filesystems](https://learn.microsoft.com/en-us/windows/wsl/filesystems): native Linux FS рекомендован для Linux I/O/performance. Это поддерживает выбранный isolation, но **не устанавливает причину конкретного RocksDB panic**.
- [Microsoft WSL disk space](https://learn.microsoft.com/en-us/windows/wsl/disk-space): видимый guest VHD capacity отличается от фактического свободного Windows host space. Рекомендация проверять оба носителя — вывод для этого runtime.

## Статус и следующий cutoff

Предложенный additive подход совместим с сохранением старых Bond accounts/fixed coupons/ledger и holder-signed principal, **если перечисленные gates будут подтверждены**. На этом cutoff принятие реализации отсутствует: программа/API/scripts меняются параллельно, новые stateful/CI/live результаты ещё не предоставлены. Старый accepted review не переносится на новую release. Следующая проверка — только frozen implemented source + live evidence; до двух material repairs с сохранением initial findings, без перезапуска прежних lineage и без обещания официального 30/30+25/25.

Stopping gate: localnet/devnet test scope, zero paid services; no mainnet/real funds/public visibility/final submit/consent. Lead владеет integration/runtime/shared config/deps/Git/top-level docs; critic не меняет эти зоны.

## Initial implementation review — 8 октября, второй cutoff

Возобновление после фактической реализации S01–S06. Прочитаны заменённые владельцем AGENTS, актуальные STATE и approved docs/29-BACKEND-STRENGTHENING.md. Relevant unchanged ProofPilot coach/quality, solana-dev и review-and-iterate переиспользованы; дополнительно прочитаны ProofPilot evidence, quality-review, decisions. Read-only git status/latest3 commits проверены; checkout содержит параллельные frontend и backend edits и не очищался. Действующий frontend delivery contract/Saved snapshot4180 признан, UI-acceptance этим backend review не проводится.

Осмотр до 2026-10-08T16:58:47Z; source hashes ниже сняты непосредственно после этого просмотра. Общий frozen source/evidence manifest lead ещё не передал, runtime/start/restart и clean reproduction продолжаются. Поэтому проверка устанавливает source findings и observed local log contents; **не разрешает объявить S01–S06 полностью проверенными**. Архитектурный preflight выше сохранён; это initial implementation review, далее максимум две material repairs, прежние закрытые lineage не затрагиваются.

### Подтверждённые свойства текущего source

| Gate | Проверено чтением/журналом | Остаток до acceptance |
|---|---|---|
| ST-F1 | `initialize_rate_issue` atomic init Bond/mint/vault/FinancialTerms; signer/PDA constraints, checked u128 exact division, matching all coupons. Terms61bytes immutable; original Bond layout сохраняется. chain-view включает terms PDA в тот же getMultipleAccounts и проверяет nominal/bump/coupons; decoder проверяет formula | Fresh built-origin actual rate issue и complete lifecycle, frozen current release/source/IDL manifest |
| ST-T1 | RPC сохраняет отдельную finality observation, rejects context/commitment/settled-outcome regression; legacy receipt finality остаётся unknown. Proof capture upgrade требует requested finalized commitment, matching signature/slot/genesis/provenance и не удаляет prior proof при gap | Actual new-release finalized RPC proof/restart evidence, final frozen bytes |
| ST-I1 | Source64-seed suite использует SplitMix64 + deterministic disposable addresses и отдельную model holdings/record/vote/paid/redemption. После successful/failed actions сверяются exact amounts/masks/supply/account rollback. Прочитан actual `.local/strengthening/program-tests-isolated.log`:16 runtime passed/0failed и64 sequences завершены; `.local/strengthening/node-full-first.log`:213passed/0failed/0skipped; web-build-repair log завершился successful Vite output | Lead связывает execution logs с exact frozen source/current SBF, без stale copied image. Reviewer эти suites не перезапускал |
| ST-W1 | Immutable plan/child IDs до dispatch, generated-localnet-only executor, parent lease и existing child fences. Нет вызова principal redeem за holder. Closed требует all captured coupons, remaining obligations0, supply0 и redeemed==issued; surplus допустим. External principal events честно оставляют aggregate finality unknown | Actual API/validator restart + whole-event replay evidence; synthetic tests не заменяют отдельные процессы/live chain |
| ST-R1 | Native namespace, обе disk capacities, launcher lock, exact Linux PID/start-ticks/ledger/RPC stop, readiness getHealth+slots+SQLite marker. До readiness POST сохраняется pending runtime record | Два code findings ниже; actual restored readiness/restart logs. Прочитанный native-start.log содержит прежний STORAGE_INVALID_PATH, его нельзя выдавать за passed; source allowlist fix виден |
| ST-C1 | Pin metadata/lockfiles и новые runtime/toolchain scripts существуют | На cutoff clean source build/cycle, Linux CI definition/execution и archive allowlist evidence ещё не предоставлены; installed isolated tools не равны clean reproduction |

Annual frequency теперь прямо определена approved plan как formula divisor, explicit dates сохраняются: ST-F1 cadence ambiguity снята без выдуманной day-count/calendar политики. Утрата старого Ubuntu VHD сообщена lead; причинность не устанавливалась. Новая separate project distro не переносит доказательства/ledger из старой Ubuntu; old registration/Windows-ledger сохранение требуется подтвердить отдельными inventory/logs.

### ST-R1-L — material: log quota наблюдает, но не ограничивает рост

**Exact source basis.** `native-runtime.sh` action log-size измеряет только target текущего `ledger/validator.log`. `runtime-watchdog.mjs` при `BigInt(native('log-size')[0])>8388608n` выполняет `persist('attention-required','storage-budget'); return;`. При этом owned validator продолжает работать и писать; нет cap/rotation/owned stop. Предыдущие native log files, API/launcher stdout/stderr не входят в сумму.

**Эффект.** S01 обещает bounded logs. Текущая реализация сообщает превышение одного active file, но суммарный рост namespace не ограничивает и не предотвращает повторное давление на диск. Это воспроизводимый вывод из control flow, не утверждение, что диск уже заполнен.

**Concrete repair.** Ввести cumulative accounting только текущего owned namespace с безопасной проверкой путей. При configured quota — bounded sink/rotation либо ownership-checked stop writer + durable attention state без automatic restart до снятия причины. Сохранить старые evidence/ledgers и незавершённые signatures. Учитывать API/launcher/native logs, не удалять чужие/исторические файлы. Добавить meaningful injected quota test, подтверждающий, что writer/restart policy реально ограничивает дальнейший рост; одно `readinessPolicy(...).healthy=false` недостаточно. Альтернатива — честно оставить S01 bounded-logs incomplete и изменить claim на monitored warning, но это не закрывает исходный запрос всех усилений.

### ST-R1-B — material: disk budget не перепроверяется у позднего first relay

**Exact source basis.** Единственный вызов `assertRuntimeBudget()` в transactions.ts находится в `buildTransaction()`. `submitPrepared()` принимает signature позднее, проверяет message/program/genesis, сохраняет receipt и вызывает sendTransaction без повторного budget check. Это позволяет stale unsigned review дойти до первого relay, когда configured threshold уже нарушен. Runtime budget проверяет fs.statfs(localDir) — metadata volume; обязательные native/VHD checks выполняются launcher/watchdog отдельно.

**Эффект.** Запись journal до send остаётся и предотвращает неподтверждённую повторную оплату, поэтому double-payment не найден. Но заявленное «Signing is blocked until ... enough free space»/fail-closed runtime threshold не полностью enforced на delayed wallet path. Проверка build до пользовательской подписи не гарантирует состояние носителей перед relay.

**Concrete repair.** У нового финансового intent/first relay перепроверять mandatory configured runtime budget непосредственно перед durable bind/send, включая required metadata/native/backing-volume policy для выбранного native runtime. Existing retained same-wire recovery трактовать отдельно, без новых message/blockhash/signature и без удаления receipt. Test: prepare при достаточном space → injected low-space before submit → no first send/no fresh intent; уже сохранённый signature продолжает разрешённый same-ID recovery по явно заданной policy. Не требовать mainnet/human credentials.

### Дополнительные source notes, без material verdict

- Launcher должен fail closed, если saved `wslDistro` отличается от selected distro. Одинаковый Linux string path в разных distributions не является одной ledger identity.
- Native resolve проверяет symlink только конечного namespace/ledger. Проверка существующих parent ancestors/realpath containment лучше защищает assigned namespace и предотвращает случайное размещение через symlink. Новые ignored scopes не оправдывают запись в чужой путь.
- Watchdog restart precheck использует `fs.statfs(root)`, тогда как probe измеряет saved VHD backing drive; launcher повторяет VHD check и не даёт restart на полном другом drive, но unit policy не доказывает эту композицию. Сохранить точный failure reason.
- Runtime record до POST probe есть; нужно доказать recovery от startup interruption до первого record, если процесс уже запущен. Unrecorded busy port должен оставаться preserved/blocked, а не присваиваться новым namespace автоматически.
- Aggregate parent finality unknown после unlinked holder principal signatures — корректная ограниченная характеристика, не дефект. Не менять её на finalized из confirmed totals ради completion.

### Reviewed source identity

Raw SHA256 Windows file bytes; это scoped inspected snapshot, не полный release manifest. Последующие edits требуют сравнения и repair review.

| File | SHA256 |
|---|---|
| scripts/backend-runtime.ps1 | 2e5ae8876a09a6010932aca243dbd0e6f5f1d30551791a2ab1845c9f7e14970b |
| scripts/native-runtime.sh | e9b5e9d49dee3bf4a522c468593daa178547049fcdc674cfac3988a8b5381fb8 |
| scripts/backend-validator.sh | 2da9e635a37c2ce3113b4eca6a53ceef8bd83984f88c1ca01802fed595cd8adb |
| scripts/runtime-watchdog.mjs | 102c5c1f8113c5201a6336aa72987f9599572688f28f990256719c5222529090 |
| scripts/runtime-policy.mjs | 4da6125dc976c5ebdd92239c0cdb5d03f1723862a135fe4d0a9a5f174b55ffef |
| server/runtime-budget.ts | ef3e7135e0d8f4eafe74bb3d93445c53b6c4fe91962c7d918acf0211c05698db |
| programs/bondtrace/src/lib.rs | 85b653955b33a900f344f4774b3bc78d619b63be209145fc3b54d0d53775b005 |
| programs/bondtrace/src/state.rs | f072bb5e4900db402d9df8e39b61298ddd474ac1153f0fc801f772ea62a0344b |
| programs/bondtrace/src/contexts.rs | b61647e17f969ab55ec080fad2016191ec8e5f31138ec39240308efe6a83b33b |
| server/chain-view.ts | 907e7cf38d3a4911b9f8a7fa4f0c6c57cec2477e3c6f5c193ae9137b34eb67e6 |
| server/rpc.ts | ce4059bfbe50a1cd319c3ea55697fdac69185018bba48a236ac8f15438f3b1f8 |
| server/journal.ts | 9d06b6fc91fcca77d845e9b5768110658ee2b893ca2fc9ca9a9369a0d63c458e |
| server/lifecycle-run.ts | d06e8a82543810c880b51f24dc543e16f048eabea48f2cfc2438d5013ada403f |
| server/transaction-proof.ts | 101237b41a42053699db5b0eaf102ca0e3f87ad9d9ca7d7e78160f25c2557cdd |
| server/proof-retention.ts | 51859ec3f6f474cef0f4354c13b55bc6816ad20f490f879dc971df8c6de46ef9 |

Manifest read:541456bytes, SHA761b993d403ae03a84e94475404299b0d4e798a6ea2d17ae44e003148077bdfd. Его filename/releaseId ещё старое coupon-settlement-v2; image sha/length — существенная текущая identity, название само по себе не attestation.

**Disposition этого cutoff: repair для ST-R1-L/ST-R1-B; live/reproduction evidence pending.** Нет конкурсного score, whole-release acceptance или remote CI pass. Read-only source/evidence review продолжается после конкретных fixes и frozen evidence. Старые reports/failed logs не заменять задним числом.

## Repair1 — source и live evidence, промежуточный cutoff

Проверка 2026-10-08T18:27:34Z, сохраняет initial IDs и общий budget. Relevant unchanged skills переиспользованы; отдельно прочитан установленный `stoic-solana-execution-review/SKILL.md` и required `references/source-findings.md`. Этот **project-local** skill открыто сообщает отсутствие upstream SKILL, pinned archive и отсутствие скопированного runtime. Его применённая польза здесь — trace amount → exact instruction → actual signer → original lifetime → retained receipt/finality; trading/custodial signing/mainnet/внешние модельные или социальные действия не переносились. Источником corporate-action acceptance остаётся specification BondTrace. Upstream bot не запускался/не устанавливался, секретные материалы не читались. Report `docs/research/stoic-solana-reference-review.md` различает disabled transfer handler, reachable-validation swap fragment и невоспроизведённый whole-framework exploit: такая граница доказательств корректна по прочитанному bounded reference packet; reviewer не заявляет самостоятельную проверку всего upstream tree/runtime.

### Resolutions прежних material findings

- **ST-R1-B, fixed по source и regression.** `assertRuntimeBudget()` теперь вызывается в execute перед durable receipt bind и в late submitPrepared перед первым signed bind/send. Native runtime передаёт threshold, backing root, native ledger и выбранную distro; guard проверяет metadata FS, physical backing volume и native `/bin/df` с fail-closed malformed/timeout. Existing signed-ID recovery идёт своим ранее сохранённым путём без новой подписи. Test `tests/client/release-relay.test.ts` prepare→budget becomes low→late submit проверяет no send и prepared.signature отсутствует; actual `.local/strengthening/runtime-repair-tests.log`24passed/0failed/0skipped прочитан. Это configured-budget guard, не гарантия, что OS/disk не откажет после проверки.
- **ST-R1-L, source repaired; evidence scope уточнён.** Native log-size суммирует validator files текущего namespace; watchdog суммирует own API/validator/launcher/watchdog output logs. Threshold branch теперь ownership-checks и останавливает validator, сохраняет attention-required, выходит без financial execution/autorestart. Первоначальный repair имел bypass: `decision.exhausted` выполнялся до budget branch. Пока repair1 packet готовился, reviewer сообщил это lead; текущий source переставил budget stop **перед** restart-policy return. Этот промежуточный defect и исправление сохраняются в том же issue ID, не создают новое assessment ради бюджета. Old reports сохранены.

Прочитан retained `.local/strengthening/watchdog-exhausted-quota-state.json`:2026-10-08T18:26:32.952Z, attention-required/storage-budget-owned-writer-stopped/financialExecution=false. Retained9MiB public fixture имеет9437184bytes; quota stdout log содержит только запуск и сам по себе stop не доказывает. В inspected before/after JSON `restarts:[]`, поэтому этот packet пока доказывает recorded quota-stop outcome, **не именно injected3-restart exhausted state**. Source-order fix предотвращает такой bypass; if lead claim требует runtime exhausted demonstration, нужны actual input timestamps+output, а не переименование этого fixture.

Дополнительные notes исправлены в source: prior.wslDistro mismatch теперь отказ; symlink ancestor checks охватывают native scope hierarchy; saved namespace без genesis.bin не запускает replacement chain; recovered genesis сверяется с prior до API recovery. Строгой byte-hard cap за один момент времени нет: это cumulative quota monitoring + owned writer shutdown. Не заявлять cap/rotation удалённых исторических evidence; fault-log/ledger сохранение соблюдается.

### Live evidence независимо перечитано

Файл `docs/evidence/execution-strengthening-20261008172355127-29505989.json` SHA256 `bb4dc9ace081316e58c092bca32626d085fa8f2c98523de213cce940d03a0478` проверен. Scope: generated localnet test signatures, не human-wallet/devnet/production. Прочитаны driver source `scripts/strength-smoke.ts`, actual native-lifecycle.log, cold-verify.log и JSON:

- Выпуск Bf2T9Tz5Uh6ZQQoDespYpxaKTgsZN697dwE6y4JpYuPy, parent lifecycle-strength-ea85a5dc-eb20-44e5-bfcd-e7233cba5004, stable digest0b1b96133d87bb10f6827bacaba5156e96e13355fb71ef2119ae4f35edaeb3df.
-29wallet/direct issuer +4coupon batch +6auxiliary=39distinct. JSON содержит39finalized observations и39finalized schema2 transaction proofs. Первая batch808bytes/181155CU — observed именно этого event/release.
- Driver/asserted stages: before-date no-send, fixed capture, transfer сохраняет record rights, existing first batch signature после actual API restart, holder-signature barrier, manual generated external-holder redemptions, parent replay без новой подписи, controlled validator restart с same ledger/genesis/totals/terms/child IDs. Прочитан before/after genesis6sNRfcm4QfwRYW1QM8425j5ws7ENXcZkzpTcEd7RRNGA; storage wsl-native, readiness slot5016→5019/SQLite verified. Driver не выдаёт generated external test signers за human wallet.
- **Собственные read-only observations reviewer около18:26UTC:** GET3160 health known-match SHA761b993d403ae03a84e94475404299b0d4e798a6ea2d17ae44e003148077bdfd и same genesis. GET выбранного state: couponPaid2500000000, principalPaid25000000000, remaining0, issued/redeemed25, mint/current supply0. Один direct `getSignatureStatuses` read для всех39 evidence signatures на RPC8959/context6832:39finalized,0null,0errors. Read RPC POST здесь является чтением, никакие sendTransaction/process/tests/Git не выполнялись.
- Parent financially_closed и aggregate finality unknown/finalityPending соответствуют unlinked external holder principal signatures. Individual transactions finalized не автоматически превращают aggregate parent в finalized. Point-in-time reads не являются обещанием дальнейшего uptime; следующие fault-injection/recovery lead происходят отдельно.

`.local/strengthening/recovery-live-current.log` дополнительно сообщает explicit retained same-wire890880lamports case; это отдельный cohort/signature, **не40-я транзакция** главного39-cycle. Reviewer прочитал сообщение, в этот cutoff заново этот relay не выполнял.

### Clean reproduction/CI на этом промежуточном cutoff

Native `.github/workflows/backend-verify.yml` с read-only permissions/pinned action revisions вызывает isolated pinned tools и ci-verify.sh. Shell flow Node22.14/Rust1.91/Agave3.1.10/Anchor1.1.2 → npm ci/build → direct SBF build → release --check без manifest rewrite → Node/UI/Rust/SBF runtime tests выглядит согласованно. Определение CI — не evidence выполненного remote job. Оно прямо не заявляет live deployment.

Source allowlist reproduce-source.mjs исключает `.local`, keys/credentials, compiled artifacts и старые fixture/evidence. На prepared machine clean snapshot e74c1a12-49be-42ed-9e02-08dc287deead actual npm-ci/application-build/toolversions/direct-SBF/frozen-check/Node/UI commands завершились0. **Full reproduction failed** на isolated-native-runtime с WSL path resolution failed (08-isolated-native-runtime.log). Result сохраняет failed и originalSourceChanged6files, включая параллельный frontend и watchdog repair. Поэтому S05 full isolated cycle и соответствие final delivered snapshot остаются unverified; нельзя представить этот partial run как complete fresh-machine reproduction. Lead готовит corrected exclusive snapshot, failed logs сохраняются.

**Промежуточный результат:** ST-R1-B resolved; ST-R1-L исправлен в source с уточнённым quota evidence. S02/S03/S04/S06 имеют новые bounded source/live подтверждения. Итоговое acceptance остаётся pending до final corrected clean cycle, frozen source/docs manifest и final scoped comparison. Текущий repair1 не расходуется на новые score loops; max2 material repairs/старые lineages сохраняются. Нет official KASE score, public/deployment/eligibility/submission или production certificate.

## Repair1 clarification — quota и frozen reproduction scope

Проверка 2026-10-08 около18:52UTC. Lead передал новое фактическое quota evidence, не заменяя предыдущие[] observations. `.local/strengthening/watchdog-quota-evidence.json` теперь сохраняет9MiB/9437184bytes, before known-match/same genesis6sNR…, three recent timestamps1791484056284/384/484, after attention-required/storage-budget-owned-writer-stopped, rpcListeningAfter=false и financialExecution=false. Это поддерживает **actual exhausted-budget quota branch**, ранее недоказанную[] packet. Source branch budget-stop-before-restart-budget соответствует этому outcome. Exact old probes сохранены отдельно, их имя не используется как доказательство других входов. ST-R1-L закрыт в данном scope cumulative monitoring+owned validator shutdown; instantaneous absolute byte cap/rotation не заявляется.

Воспроизведение36ba5a2d-b5e6-4a0f-9d37-286f4b51aad5 имеет новое чистое identity. Reviewer непосредственно перечитал events/logs/result и сравнил **каждый staged file** с original frozen manifest hash:0staged changes. Logs:216Node/52UI,0failed/0skipped; direct SBF/frozen SHA check и app build прошли; fresh bootstrap confirmed; complete lifecycle exit0 для нового выпуска4Cv86BLBCNrJ1ML66Sr2SHjHHSeqTqaHFYsXwsQJgtkC, parent lifecycle-strength-fef8d445-6741-4b9f-bc0d-370c5bc5348c,39distinct transactions/coupon2500/principal25000/burn25. Owned API/validator cleanup завершён0. Старый b919 bootstrap unresolved сохраняется unresolved отдельным event, не присваивается этому success и не объявляется recovered. 36ba accounts/signatures также не смешиваются с main Bf2… cycle.

Recorded result36ba имеет **status failed**, потому что текущий root изменился в AGENTS.md/voting-workspace.css/workspace-shell.css. На review current-root hash comparison дополнительно увидел brand.md/DESIGN.md UI documentation drift. Стабильность staged source доказана независимо; все inspected current server/program/scripts/client/tests/dependencies совпадают с36ba. Diff AGENTS в этом пакете добавляет frontend-only ECC replacement/Settlement Workspace и сохраняет backend ownership/financial/safety gates.

**Нейтральное scope решение.** Для S05 backend clean reproduction failed execution и post-run root UI drift — разные факты. Выполнение замороженной clean copy с неизменными bytes может быть passed_snapshot при раскрытом drift в соседнем текущем UI; это не ослабление money/runtime/compiled release criteria. Нельзя переименовывать сохранённый36ba failed result задним числом. Новый исправленный verifier/run должен:

1. Всегда fail, если изменился хоть один staged source file (bytes, presence, type/symlink) относительно frozen manifest.
2. Fail при текущем root drift в backend/program/client/IDL/release/runtime/scripts/build/config/deps/lockfiles/tests и финансовых frontend связках (wallet/request/recovery/precision/permission). Не освобождать все `apps/web` по одному лишь владельцу папки.
3. Сохранять **весь** other UI/documentation drift; выделять только inspected scoped CSS/visual/docs changes. Contract/README/TECH/AGENTS changes могут менять полномочия/acceptance, поэтому требуют semantic review, а не blanket docs exemption. Здесь latest AGENTS дифф оказался frontend-specific и safety boundaries сохранены.
4. Объявлять `passed_snapshot`/currentRuntimeMatches исключительно для exact frozen backend set; не переносить52UIunit tests/build этой копии на текущую UI visual acceptance и не утверждать current full product byte equality.

Такая замена общей проверки root drift на две точные проверки допустима по actual backend scope и явным двум владельцам. Она не создаёт новое assessment ради повышения verdict. Failed snapshots/result/history сохраняются; этот clarification объясняет критерий до нового corrected run, а не задним числом меняет наблюдение.

Проверено также latest relay maxRetries5: это bounded validator rebroadcast **того же wire/signature**, а не создание replacement message/blockhash. Narrow actual20-test log lead ещё сопоставляет с final snapshot; повторный uncertain bootstrap не трактовать как доказательство failure/refund либо право silently fresh-sign. Final review восьми quality checks ждёт frozen packet/draft/assessment/docs и actual corrected reproduction result.

## Финальный cutoff — 9 октября2026, UTC+5

Завершён 2026-10-08T19:34:52Z (9 октября локально). Все предыдущие pending/repair/failed observations выше остаются историческими cutoff и не переписаны. Прочитаны актуальные AGENTS/STATE; unchanged ProofPilot coach/quality/source-grounded review, solana-dev security/program/testing, review-and-iterate и локальный Stoic reference skill переиспользованы. Critic выполнял read-only source/hash/evidence/process/RPC reads; writes ограничены собственным отчётом и двумя review JSON. Builds/tests/signing/chain sends/install/Git mutations не выполнялись reviewer.

### Проверенные финальные результаты

- Clean run549f5703-645c-4870-8b70-ccc5c58f8a20:185staged file hashes/lengths проверены reviewer, staged/current-runtime drift0 на execution cutoff,11commands exit0, `passed_snapshot`, собственные API/validator остановлены. Clean copy выполнила219Node/52UI и отдельный actual39-transaction lifecycle. Compiler/npm cache reuse раскрыт; это prepared-host clean source, не новая физическая машина и не remote CI run.
- **Отдельный** program-run:3Rust unit/16actual SBF runtime, включая64seeded sequences на same541456bytes/SHA761b993d403ae03a84e94475404299b0d4e798a6ea2d17ae44e003148077bdfd. Не приписывается cargo test командам clean launcher, которых в его11-command list нет.
- Clean6CEQJLbS8pDq5ZorKsofCr4KhmNfdfzT9v3Xb4AEcDoS и mainBf2T9… — раздельные39-transaction cohorts с собственными genesis/parent/receipts. Каждый verified run имеет39finalized observations/schema2 proofs,2500coupon/25000principal/25burn и0remaining/supply/vault. Public clean JSON raw SHA `bba9bb22e2e9f037132b961f61f93339a8f3c86c4d0bc0053c90cd88ab27281f` совпал с exact clean-copy artifact. Parent financial closure сохраняет unknown aggregate finality для unlinked external holder signatures.
- ST-R1-L и ST-R1-B закрыты подтверждёнными fixes/evidence, без удаления initial issues: cumulative quota + exact owned writer stop до exhausted-budget return с actual3timestamps/9MiB/RPC not listening; guard у delayed first bind/relay + native/VHD/metadata checks/no-send regression. Monitoring/shutdown не выдаётся за мгновенный byte-hard cap или uptime guarantee.
- Manifest version2: все66current hashes/lengths совпали. От v1 изменены только docs/00-STATE.md и docs/15-API-CONTRACT.md. Preserved v1 SHA `1adbe3e272efc0c840f8cab328db91163c780ba01d0d6b462740a8038df61d71` совпадает с previousManifestSha256. API doc теперь соответствует inspected state/admin/chainview/journal/proof/lifecycle/index: immutable program-validated terms, original fixed/Memo provenance, same bank, actual schema2 requested commitment, explicit lifecycle modes/limits, holder barrier и unsigned/read-write readiness probe. Executable source при этой repair не менялся.

### Независимый quality review и исправление QF1

Reviewer создал separate-context `.local/strengthening/final-review/review.json`, затем `.local/strengthening/final-review/review-2.json`. Actual model identifier неизвестен и так записан; declared separate context не является криптографическим подтверждением независимости. Frozen packet SHA `439762cf5a8d805a288d45b726f4f68085bc18e72d9f32dd311ccc746ddc00d4` не менялся.

Initial draft1 получил7pass/1fail: **QF1_clean_test_attribution**, неверная фраза приписывала3Rust/16SBF/64sequences clean copy. Repair draft2 прямо разделяет clean219Node/52UI/fullcycle и отдельный program-run; exact claim mapping исправлен, finalized confirmations названы архивом. Original draft/issue/source packet/logs сохранены. Repair review:8pass, issues0, explicit QF1 resolution=fixed; review2 SHA `d796b10a49ab4d8148e385c2faef6980039c581df603b62a4513b4b132b22fbd`.

Lead выполнил quality helper; reviewer прочитал actual [status](../review/strengthening-quality-status.json): policy4, coach/application, disposition **accepted**, draft2of3, diagnostics[], activeIssues[]. Это принятие точного локального отчёта по protocol, **не** официальный конкурсный балл, security certificate, eligibility или разрешение внешних действий. Engineering initial findings/repair история выше и прежние закрытые lineage не сбрасывались.

### Текущая operational/evidence граница

Reviewer read-only main health около19:20UTC подтвердил API3160 known-match, SHA761…, genesis6sNR…. Direct status batch39main signatures к этому времени вернул39null из-за pruned history; прежний собственный read18:26UTC видел39finalized. Поэтому итог описывает **сохранённые finalized observations/proofs**, а не fresh-livefinality всех39на delivery. Null не означает payment failure и не разрешает новые signatures; latest STATE и draft2 это различие сохраняют. Clean runtime намеренно остановлен после verification, его preserved logs/proofs остаются evidence. Last health check не обещает future uptime.

Readiness достаточна для заявленного S01–S06 internal testlocalnet deliverable и transparent reference-derived Stoic guidance. Limits16holders/8coupons/4batch/32proposal/fullprefunding/wholeunits/no-surplus-withdraw/externalfreezer/RPCtrust сохраняются. Human-wallet/devnet/publichosting/productionsecurity, official judge configuration/score, account/legal consent и final submission остаются самостоятельными непроверенными gates. Другой frontend/ECC scope и текущий визуальный acceptance этим reviewer не присваиваются.

Continuation: читать current AGENTS/START/STATE и соответствующие actually installed skills перед substantial work; сохранять ownership и old evidence/review budgets. No mainnet/real assets/paid/public visibility/final submit/consent/Git write authorization выводить из accepted запрещено. После этого cutoff обязательной reviewer работы не осталось.
