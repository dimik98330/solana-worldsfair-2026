# BondTrace backend — final targeted repair2

08.10.2026. Это **последний** pass в bounded initial + repair1 + repair2 нового backend-goal, не перезапуск прежних architecture/issuer/application assessments. ProofPilot **coach**; technical review связан с выбранным KASE prototype, отдельный frozen readiness packet имеет правильный `decision_context: application` и требует independent review. Новые official scores, win odds, спрос, допуск или production certification не присваиваются.

AGENTS/STATE/план21/latest commits и прежние issue records перечитаны. Ранее прочитанные unchanged START и installed skills используются в том же контексте: ProofPilot coach + quality/quality-review/evidence/safety/review, solana-dev security/Kit, review-and-iterate security/code review, CSO focused backend integrity/exception/business logic. Quality-review reference перечитан. Rule обязательных skills и owner gates сохраняется для новых chats/handoffs; никаких reinstalls/MCP/config changes.

Reviewer owns только этот report и `.local/backend-focus/final-quality-review.json`; server/program/deps/config/Git/services read-only. Не выполнены live RPC, POST, signing, chain mutation, key/auth reads или повторные runtime tests. Исследование использует actual code, Git staged bytes, публичные metadata hashes, final logs и raw reports. Public JSON filenames в legacy preservation list сверены без открытия wallets/keys. Проверенный screenshot используется как visual artifact, не как доказательство human-wallet подписи.

## Frozen inputs и integrity

На первоначальном final cutoff manifest `docs/review/backend-source-manifest.json` имеет timestamp `2026-10-07T23:40:33.121Z`. Все **50** его entries проверены через read-only `git show :path`: bytes и SHA256 совпали, mismatches0. Это exact staged Git-normalized source, без смешения CRLF workspace/normalized staging bytes. Embedded source content в ProofPilot packet совпал с соответствующими actual files по SHA256 и bytes. `docs/22-BACKEND-READINESS.md` побайтно равен frozen `draft-1.md`.

Initial final packet hashes:

- packet `97e52975fee704da80624a7924b13523355ee825ce17a1683112ecb01479a67a`;
- draft `47dd3124847cf4ffddfe667e3768d79ef98be3f48d9764cf57f915ba82de4d1e`;
- assessment `9e497a0851514e27a47031abbea2b220f8411fbd237f8ada0d67d262299744c4`;
- staged source snapshot `3740283ef3796628f92de0798dc006f889838960d29c602d2ac81a05c8268b73`.

Mechanical quality diagnostics=[] означает лишь consistency checker/awaiting_review. Оно не устанавливает truth/full claim coverage. Сохранённый `.local/github-read-verification.json` отдельно inspected: checked2026-10-07T23:06:44.9926349Z, identity/owner dimik98330, private solana-worldsfair-2026/id1409138286. Нового external GET reviewer не делал.

## Закрытие прежних IDs

| ID | Final checked code/evidence | Итог |
|---|---|---|
| F01 | Single confirmed graph, slot provenance, <=62 accounts, bounded3 discovery attempts; actual164 successful reads during normal cycle,4 одновременно | Исправлено в проверенном prototype scope |
| F02 | Exact BigInt/u64/decimal financial conservation, snapshot/mask totals, principal/supply, reserve gap/surplus; required accounts fail closed, zero canonical ATA exception сохранена; forecast/accrued/claimable bases явны | Исправлено; individual ballot sides и полный on-chain proposal discovery не заявлены |
| F03/F04 | Required financial values, canonical aliases/order/decimal representations, multi-coupon selection, no null fee0, strict reviewed message/Ed25519; actual19 malformed/identity/origin/UTF checks | Исправлено; normal prepared identity и generated-demo recovery IDs различаются явно |
| F05/F06 | Transactional SQLite DELETE/EXTRA and per-record journals; atomic exact bytes/signature/lifetime/operation commit before send; pending/unknown/projection-pending retained, original JSON preserved | Основная архитектура исправлена; новая seed metadata race ниже требует одной адресной поправки |
| F05-R1 | Catalog latest-read/merge/save защищён одним transactionSync после awaits; actual application regression4 процессов сохранил16 labels/16proposal IDs; final log PASS | Исправлено с нужным regression, не только generic DB counter |
| F07 | GET durable live observation + recorded fallback; signed old error reconcile; projection state distinct; null expired staysunknown; actual API restart3issues/11steps | Исправлено в checked failure/receipt scope |
| F08-R1 | `recordSlotSource` теперь actual verification или legacy-unbound; state не upgrades imported history; соответствующая assertion/regression passed | Исправлено |
| F09-R1 | Required context/own err/validated TransactionError/slot bounds; malformed receipt не writes confirmation/projection; simulation invalid/null fee reject; merely processed error stayspending until confirmed/finalized | Исправлено с negative tests |

Дополнительно прочитана новая unsigned-demo lease: owner/expiresAt сохраняются под BEGIN IMMEDIATE, replaced owner проверяется перед metadata и в atomic onSubmitted callback, signed reference никогда не reclaim; four-process single-owner и fresh-process expired lease assertions присутствуют и final log passed. `execute` также отвергает distinct intent с уже сохранённым exact signed message вместо выдачи прежней транзакции за новую. Actual leased cycle проверяет same-ID/signature replay после каждого действия. Эти checks не означают fuzz/full formal proof всех scheduling interleavings.

## Independent reconstruction фактических результатов

Final native `.local/backend-focus/final-all-110.txt` содержит tests110/pass110/fail0/skipped0/cancelled0. `.local/backend-focus/final-build-ready.txt` содержит `tsc --noEmit && vite build`, успешный production bundle. Reviewer не запускал их заново. Program report `kase-program-limits.md` отдельно подтверждает сохранённый ранний3unit+7SBF runtime,16positive holders/8coupons/128claims и failed payment CPI rollback; backend code не меняет program/IDL. Это prototype evidence, не новый deploy.

Raw cycle states и receipt arrays пересчитаны read-only JS/BigInt:

| Issue/evidence | Реальные receipts в этом report | Купоны | Principal | Retired | Final vault/obligations |
|---|---:|---:|---:|---:|---|
|68tC… / backend-lifecycle-localnet|19 distinct signatures|750+375=1125|15000|15|0/0|
|6ETH… / backend-guided-cycle-localnet|10 distinct signatures после bootstrap|900|18000|18|0/0|
|AjoD… / backend-lease-lifecycle-localnet|11 distinct signatures, все replaySameSignature=true|0.05|1|1|0/0|

Все суммы здесь test settlement units с6decimals. Exact first cycle `750000000+375000000+15000000000=16125000000` base units=16125; guided cash18900 и leased cash1.05. Каждый total совпал с own `reconciliation.totals.cashPaid`. Issue/signature sets не склеены в один искусственный запуск. Normal unsigned preparation survived actual API restart указано в report; это generated external test client, а не human wallet.

`backend-bootstrap-localnet.json`:11 satisfied steps, **6** signature-bearing transactions,4 balance-only funding checks и1 preexisting mint check. Все11 completed/projection complete, signatureCount6, same-ID replay=true. Отсутствующие подписи пяти checks не заменены выдуманными receipts.

`backend-concurrent-reads-localnet.json` хранит reads164/concurrency4/41samples. Inspected monitor source делает four independent assertions per Promise.all batch (holder sum, issued−redeemed, mint supply, common context), затем сохраняет one sample;41×4=164. Это наблюдение saved run, не performance/throughput SLA.

`backend-restart-localnet.json` и inspected checker сравнивают3 completed issues against their earlier own totals, сохраняют recorded-confirmation,11 bootstrap steps и unchanged signature set после completed bootstrap replay. Ledger сохранён. Saved source/report подтверждают объём restart verification; reviewer current services не перезапускал.

Migration raw report сравнил3 prior issues финансово **до новых funding**. Все **7 physical original JSON** сейчас independently hash-checked против saved baseline: bytes/SHA совпали. SQLite DB содержит новую logical fixture, а originals служат archived pre-migration metadata; смешивать эти два понятия нельзя. Actual saved public backup270336B имеет integrity ok и SHA96f92909ab0b6a1249d808fe1d94189af95828b841d9983497be5bc5de7d2838. Backup snapshot выполнен ранее новых final cycles, поэтому это не обещание автоматического backup самого последнего state или key recovery.

Actual built-origin HTTP reports содержат12 malformed/alias/origin cases и7 final identity/UTF streaming cases. Последние seven выполняли только unsigned simulated preview; no chainState changes. Screenshot backend-payments.png visually показывает localNet/generated test wallets, coupon2 recorded/paid375, holder allocations200+175, vault/principal/unpaid0; это согласуется с normal two-coupon report и не является human-wallet evidence.

## Final newly identified material code issue

### F05-R2 — cross-process bootstrap metadata merge может потерять faucet intent marker

Initial frozen `server/seed.ts::runStep` делает `updateOperation(childId,{metadata:{...findOperation(childId)?.metadata,...params}})` без outer transaction вокруг **latest read + metadata merge + write**. `updateOperation` защищает write/read current record, но supplied metadata уже вычислена раньше и заменяет whole metadata field.

Минимальная interleaving deduction:

1. P2 начинает explicit resume того же bootstrap ID и читает child metadata без `airdropRequestStarted`.
2. P1 `ensureSol` под transactionSync записывает `airdropRequestStarted:true`, commits перед requestAirdrop; баланс ещё ниже threshold/response lost.
3. P2 сохраняет ранее собранный metadata object, удаляя marker.
4. P2 `ensureSol` видит low balance/no signature/no marker и может повторить localnet faucet request.

Process-local `pending`/mutationBusy не синхронизируют разные процессы. Signed transaction child callback уже имеет atomic signature fencing; поэтому замечание касается **unsigned/unknown external faucet marker**, не утверждает повторный principal/coupon send или реальную потерю средств. Reproduction — traced code scheduling counterexample, live faucet/ledger не тронуты.

Minimal repair перед complete: outer transactionSync с latest read/merge/write + assertActive перед metadata update; test должен искусственно открыть stale read window и показать сохранение started marker/no second request. Никаких enterprise сервисов/нового DB layer не нужно. Issue передан lead во время final pass; до inspected final delta он остаётся открытым. Это последнее assessment окно, не разрешение сбросить initial+2 budget.

## ProofPilot semantic coverage issue

Frozen packet содержит full official KASE text в s_kase, но facts/assessment **не имеют rule fact/claim mappings** для paragraph о coupon/redemption/additional action, допустимых simulated rails и вывода о полном KASE cycle. Git identity/private repo statement поддержан separately inspected real GET JSON, но тот источник/fact/claim также не включён в packet. Code claims и основные numeric results представлены; absence этих mappings — конкретный coverage gap, не выдуманная ошибка правильной prose.

Minimal quality correction: add precise source-derived KASE facts/claim mappings и Git source/fact/claim; сохранить eligibility/registration/public-access unknowns. Frozen facts нельзя silently переписать; сохранить первый run/hash/history и объявить новый source/evidence delta по protocol, если обновляется source packet. Wrong score/new universal enterprise conditions не добавлять. Semantic review не может объявить accepted только из diagnostics[].

## Limits и disposition at initial final cutoff

Сильное positive evidence: три fresh complete local test cycles, independent financial equality, actual built origin/restart, original preservation и targeted negative regressions. Оно закрывает прежние proof gaps initial/repair1. Still unverified: human-wallet signing/cancel, devnet deploy/funding outcome, public demo/jury access, main hackathon registration, KYC/Terms/final submission, market demand и bank/KASE integration. Fixed16/8/prefunding/issuer-controlled liveness, settlement mint external freeze authority, RPC trust, hardware durability и program upgrade trust раскрыты. Generated signers/accelerated terms — deliberate test harness.

Initial final verdict: **основной KASE local backend подтверждён в указанном scope; complete требует F05-R2 code fix и честной quality coverage correction**. Нового official score нет. Root сохраняет owner gates и решает implementation/integration/private source checkpoint. Этот report будет дополнен только точной final delta этого же pass, если lead предоставит её до завершения; прежние frozen hashes остаются историей, не будут silently заменены.

## Appended verification той же final repair2 — 08.10.2026,04:52–04:55 UTC+5

Lead предоставил действительно изменённый source/evidence packet после concrete counterexample, сохранив original run, original frozen source и hash-bound review с disposition **repair**. Reviewer перечитал exact delta и новый packet. Это продолжение текущей последней technical assessment; additional code-audit budget=false. `docs/review/backend-review-lineage.json` сохраняет overall quality draft2of3, original issues и их resolutions. Новый helper run используется только потому, что helper не поддерживает mutation frozen facts; он не стирает старые active issue records и не выдаётся за сброс бюджета.

### F05-R2 / BQR-BOOTSTRAP — fixed

`runStep` теперь выполняет `assertActive`, fresh `findOperation`, metadata merge и `updateOperation` внутри одного `transactionSync`. Protected latest read не может предшествовать competing marker commit, а затем стереть его stale write. Signed callback fencing остаётся прежним.

New `bootstrap-marker.test.ts` использует **два настоящих Node-процесса и одну isolated SQLite namespace**, mocked faucet; delayed worker расширяет actual runStep SELECT window через DatabaseSync.prepare, barrier запускает competing same-ID resume. Assertion требует ровно один synthetic requestAirdrop request marker. Лог `marker-regression.txt`:1/1passed; повторная адресная suite `.local/backend-focus/final-bootstrap-checks.txt`:**9/9passed,fail0/skipped0** — marker плюс8existing bootstrap branches. Это настоящий application-path interleaving regression, не тест копии implementation и не live faucet call. `.local/backend-focus/repaired-build.txt`: `tsc --noEmit && vite build` passed.

110/110 остаётся **предыдущим полным combined Node/UI прогоном**;9/9 — отдельный final changed-branch regression,8tests пересекаются с предыдущей suite. Здесь не заявляется новый111combined PASS и не складываются пересекающиеся counts в119tests. Unchanged final lifecycle/financial evidence остаётся валидным для тех же flows; actual repaired-server restart и completed same-ID replay lead выполняет после review, reviewer их не приписывает себе.

### BQR-COVERAGE — fixed

Corrected packet содержит6sources/21facts/30claims. Все source SHA/content совпали с actual files, all registered quotes присутствуют в exact frozen draft. Добавлены f_kase/f_fiat с full official source и прямыми claim mappings; full-KASE inference включает эти rule facts. Добавлены fresh Git identity/private facts и source: actual GET checked `2026-10-07T23:50:12.3097265Z`, identity/owner dimik98330, same private repository/id. Eligibility/registration/public access/final submit остаютсяunknown. Никакой score/допуск не выведен из этих additions.

### Exact final delta/hashes

Read-only comparison старого и нового source containers: old50/new51files; **единственный изменённый existing file — server/seed.ts**, added только tests/client/bootstrap-marker.test.ts, removed0. Trailing EOF blank trim отмечен lead; сравнение body без trailing whitespace не выявило других изменений. Все51 current manifest entries снова сверены с `git show :path`, mismatches0.

| Final input | SHA256 |
|---|---|
| server/seed.ts,26886bytes |1c78182ccc4dd7576cee410134fc63f2361914ed830ecad1b5ddd4a452e23ec8|
| tests/client/bootstrap-marker.test.ts,4653bytes |11af256317ff162f74e0215f6ea28ca3cd338fa50ac7eabc3b8bd912dde8601e|
| corrected staged source snapshot |de3e007d91c6194e0dd6d297fed7745eb2176b79f2462eecc3ffea8ea155a932|
| corrected packet |4320de25f940c70c36be87711105e5f82d45870862a2277a714e810acbe0b828|
| unchanged draft/docs22 |47dd3124847cf4ffddfe667e3768d79ef98be3f48d9764cf57f915ba82de4d1e|
| corrected assessment |9a6af884b02afd4eada273540d548ac55c07950c91b80d8be231af3e8b89abbd|

Corrected hash-bound `.local/backend-focus/final-quality-review.json`: actual reviewer `separate_context`, exact model label unavailable=`unknown`,8checks pass, new issues0. Prior BQR-COVERAGE/BQR-BOOTSTRAP resolutions находятся в check notes/этом report/lineage; corrected helper run не получает выдуманные active issue IDs из другого run. `accepted` здесь не объявляется от имени helper до его actual review command/disposition; JSON сообщает проведённый независимый semantic review.

**Final technical verdict: material findings initial/repair1/final repair2 разрешены в проверенном prototype scope.** Три complete generated local cycles, exact financial reconciliation, durable recovery и preservation/restart evidence поддерживают ограниченный local KASE demonstration. Остались lead-controlled exact-source API restart/replay и private safe checkpoint, а внешние owner gates/unknowns выше сохраняются. Это не mainnet/production/public-submission eligibility certificate. Бюджет этой technical assessment исчерпан по плану; новый review ради повышения score не нужен.
