# BondTrace — checkpoint 8 октября 2026

Backend B01–B05 выполнен для разрешённой localnet демонстрации KASE. Пользователь остановил дальнейшее расширение дизайна; сохранены готовый issuer UI и необходимые API/recovery связи. Backend scope выполнен; independent review и private checkpoint завершены. Не начинать выбор идеи заново; прежний Prompt1-only gate заменён явным запросом полноценного KASE-проекта.

## Обязательные правила продолжения

Корень C:\Users\dmitrii\Documents\solana. В новом/продолженном чате читать AGENTS, CODEX_SOLANA_WORLDSFAIR_START.md и этот STATE, затем актуальную спецификацию/план и git status. Перед существенной задачей выбирать и читать подходящие установленные SKILL.md: ProofPilot coach обязателен для продукта, профильные Solana/development/design/checks — по задаче. Правило обязательно передавать субагентам.42 skills уже проверены; повторная установка не нужна. ProofPilot source отдельно C:\Users\dmitrii\Documents\proofpilot-source,0.3.0/e6c2a3c…, раскрытая Windows fsync поправка. Upstream locale test failure — не тест BondTrace.

Разрешены reversible implementation, localnet/devnet, бесплатные инструменты и отдельные generated test signers. Mainnet/реальные активы/платные услуги/публикация private repo не разрешены. GitHub только dimik98330 через проверенный GCM, repo1409138286 private, origin https://dimik98330@github.com/dimik98330/solana-worldsfair-2026.git; fresh GET07Oct23:50UTC совпал. Connector zi-radio не использовать. Root owns deps/config/Git/integration; не перезаписывать чужие файлы и keys/ledger.

## Реализация и доказательства

Текущий отчёт docs/22-BACKEND-READINESS.md и API docs/15-API-CONTRACT.md. Финансовый граф читается одним confirmed context, до62 accounts/3 retries. Exact u64/BigInt/string amounts; проверяются supply, snapshot/masks/paid totals, principal и весь reserve. Forecast/fixed rights/claimable разделены; canonical empty ATA exception сохранён. Provider honesty/production finality не сертифицируются.

Built-in node:sqlite3.47.2, Node22.14, DELETE/EXTRA; transactional per-record recovery before send, отдельные chain/projection statuses, no pending/unknown eviction. Client demo recovery ID обязателен. Genesis/provenance сохраняются; malformed RPC/fee/UTF/aliases fail closed. Unsigned demo work имеет fenced lease2min и explicit same-ID resume; signed intent больше не захватывается.

Bootstrap имеет immutable plan и11 child steps; no retry unknown signatures/faucet calls. Devnet autoairdrop отключён. Explicit reset of expired partial проверяет old receipts, архивирует только настоящий выпуск и блокирует старые sender callbacks. Последний race marker исправлен одним transactionSync latest-read/merge/write +assertActive. Deterministic two-process actual runStep regression прошёл без realRPC.

- Combined Node/UI110/110 passed,0 skipped. После marker fix отдельный final bootstrap+marker9/9 passed,0 skipped; это не111 новый combined. Последний TypeScript/Vite repaired-build passed.
- Rust3 unit +7 actual SBF/SPL runtime ранее прошли:16 positive holders/8coupons/128claims и rollback после burn/payment failure. Program/IDL не менялись. ProgramID B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8; image463096B/SHA15525ec2de285e7cc3065f7ec8ce47bfe81d1ed2837754b85b8cf2598c935dc2. Measured996bytes/observed108899CU.
- Migration:3 прежних выпуска финансово совпали до новых тестовых funding;7 original public JSON sameSHA. Ключи в SQLite/backup не импортируются.
-68tCZN… normal relay:19confirmed, coupons750+375=1125, principal15000, burn15/vault0. Unsigned review пережил actual API restart.164 concurrent verified reads,4 одновременно.
-6ETHnf… durable bootstrap:6 actual transactions +5 already-satisfied checks;11 completed steps. Guided cycle ещё10confirmed, coupon900/principal18000,18burned/vault0.
-AjoDma… fresh lease API:11confirmed, каждый explicit same-ID replay сохраняетsignature, coupon0.05/principal1,1burn/vault0.
- Exact repaired API process восстановил3 законченных cohorts и11bootstrap steps; completed replay не дал новой подписи. Final HTTP:12 input/origin cases +7 ID/MIME/strictUTF8/chunk cases; no chain writes кроме unsigned simulated preview.
- Evidence docs/evidence/backend-*.json; разные выпуски/подписи не смешивать. UI screenshot docs/evidence/ui/backend-payments.png. Original17–19/media manifests — historical snapshots, не аттестация новых изменений; frozen video bytes сохранены.

## Независимое review и ограничение бюджета

Backend initial +repair1 +final repair2 завершены, материальные findings закрыты. docs/research/kase-backend-finance-repair2.md сохраняет первый cutoff и exact appended marker fix verification. Дополнительного assessment budget нет.

ProofPilot coach/application policy4: первая frozen run сохранилась какrepair из-за marker race и неполной KASE/Git claim mapping. Actual changed code/regression потребовали corrected snapshot; old facts/hashes не заменены. Общий budget draft2of3 сохранён вручную в docs/review/backend-review-lineage.json. Corrected8-check separate-context review accepted, issues0; docs/review/backend-quality-review.json/backend-quality-status.json. Это protocol acceptance локального отчёта, не конкурсный score/eligibility/security certificate. Exact staged source hashes docs/review/backend-source-manifest.json.

## Процессы и эксплуатация

- Validator hidden Windows22584/WSL, RPC8899/WS8900, original .local/bondtrace-validator. Reset/delete не выполнять.
- Exact repaired built API3000 exec session15679, Node20004. Vite5173 остановлен; built app работает без него. После финального restart completed replay/HTTP checks exit0.
- Recorded static preview5180/session51503 ранее running, сейчас не перепроверен; это не backend hosting.
- npm run metadata:check /metadata:backup проверяют integrity и сохраняют consistent public metadata в ignored namespace; no key backup/automatic restore. Actual earlier snapshot270336B integrityok.
- Все smoke/combined/scoped cells завершились; не перезапускать процессы только из-за observation timeout. UI IAB tab5 deliverable, KASE source tab8 authenticatedDmitriy; не считать login регистрацией.

## Внешние gates и следующий шаг

Main Colosseum registration/project/submission не подтверждены. Copilot connected не означает участие. Adult/KZ/one-project user confirmed, documentary eligibility не аттестована. KZ registration опубликована на8окт, точный час unknown; global deadline12окт23:59PT=13окт11:59UTC+5. Ничего не подано, Terms/KYC/consent автоматически не приняты.

Devnet payerBWpCPnVVzxPA1oTebFyfCjbk8wgTXLdjQWwY1ckjzqHS последний known read0; rent2.35423964testSOL +fees. Две airdrop Internal error/429 остановлены. Async funding/registration/public-visibility вопросы уже отправлены; не дублировать, отсутствие ответа не approval. Deployment signature отсутствует. Human-wallet signing/cancel ещё не проверены.

Следующий разрешённый шаг после owner response: public source/demo links и verified global entry/конкурсная подача с согласиями; либо devnet при бесплатном test funding. Backend-ready не означает автоматически public/submitted. Сохранять AGENTS mandatory skill rule при любом handoff/новом чате. До ответа продолжать только независимо разрешённые задачи; не менять visibility и не подписывать реальные активы.

Финальный checkpoint: implementation commit99b5c6d сохранён и pushed в private main dimik98330. Final staged scan106files/86text/20binary/17JSON,findings0; diffcheckpassed. All current source51Git-normalized entries входят в reviewedmanifest; originalqualityrepair/source сохранены, v2accepted8/8checks,globaldraft2of3. ExactrepairedAPIrestart+completedsameIDreplay/HTTP снова exit0. Goal backend выполнен в localnet scope, externalgatesнеподменяютсяcompleted. Передновойработой читатьAGENTS/skillsиэтотcheckpoint; новыхсайтов/регистраций/visibilitychangesавтоматическинет.
