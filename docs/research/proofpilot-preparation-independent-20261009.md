# Независимое review: PostgreSQL / Render preparation

Cutoff: 2026-10-09T14:17:49Z. Workspace: `C:\Users\dmitrii\Documents\solana`. Отдельный контекст `jury_release_critic`; точная модель reviewer неизвестна, поэтому в JSON указано `unknown`. ProofPilot **coach**, `decision_context: application`, decision `artifact/complete`. Это первое формальное review данного frozen report; PostgreSQL initial/repair1 остаются собственной сохранённой историей, их бюджет не обнуляется.

**Вывод:** существенных дефектов в unchanged draft-1 и assessment не найдено; восемь protocol checks — pass. Проверенная локальная подготовка обосновывает следующий совместный с владельцем этап размещения. Это не официальный конкурсный балл, допуск, production certificate или доказательство успешного Neon/Render/devnet/Phantom. Lead должен выполнить `quality.js review/status` и прочитать disposition; reviewer сам helper не запускал.

## Инструкции и метод

Прочитаны AGENTS, START, активный STATE и backend focus. Применены фактически установленные project ProofPilot/readiness-review с event-assessment, quality, quality-review, evidence, safety, routing, decisions, review, honest-evaluation и onboarding limited/submitted-material exception; solana-dev и его security reference; ECC2.2.3 security-review. Это review предоставленных материалов без внешнего исследования и без заявления о завершённой research setup. Memory registry использован только для continuity/evidence boundaries, не как источник текущих результатов.

Проверены frozen packet/draft/assessment/template/state, девять источников, текущие README EN/RU/TECHNICAL/31-HOSTING/render.yaml/package scripts, важные signing/relay/facade/policy/hosting guards, program arithmetic, retained PG logs, public Linux summary и raw localnet proof. Выполнялись только локальные чтения, JSON parsing, SHA-256/byte comparisons, read-only Git status/log; не запускались тесты, сборки, сервисы, браузер, аккаунты, RPC или cloud. Credential/key/.env/private connection descriptor не читались. Reviewer изменил только назначенные `review.json` и этот note.

## Evidence и арифметика

- Все девять исходных файлов совпали с frozen packet SHA при первоначальной сверке. Report/assessment сохранили exact hashes из template. Материальные assertions покрыты claim mapping; полные источники поддерживают их и за пределами узких supporting quotes.
- Git58 snapshot остаётся отдельным native SQLite cohort: 11 команд, 243 Node/52 UI, 39 localnet transactions; raw execution SHA также совпал. Никакие PostgreSQL или последующие источники этому commit не приписаны.
- PG raw artifact — 690024 bytes, SHA `b3fc25d84576ace231155280cc15d1ba345a7dbc7f31ce6a0a06707eeb2250e9`. Independently parsed 29 wallet/direct issuer receipts + 4 batches + 6 auxiliary = 39 distinct signatures; 39 finalized observations и 39 nested schema2 finalized proofs. Coupon 2500000000 minor / 10^6 = 2500; principal 25000000000 / 10^6 = 25000; issued/redeemed 25, current/mint supply, vault и remaining obligations 0. Parent aggregate finality остаётся `unknown-unlinked-external-holder-signatures`.
- COMMIT-loss/crypto-fence тесты используют реальный PostgreSQL и синтетический Solana RPC. Шесть auxiliary setup transfers в финансовом цикле подписаны внешними generated signers и явно не являются application commit-before-send proof. Реальный финансовый lifecycle и отдельный persistence-barrier test не смешаны.
- Retained PG transcript подтверждает 43 pass/0 fail/0 skip; repair1 transcript 7/7. Linux summary подтверждает Node22.14.0/UID1000, verified TLS1.3, auth/origin/assets, backup marker/hash после restart; `financialReady:false`, program unavailable, diagnostic loopback, без wallet/financial/cloud. Это inspected retained evidence, не повтор runtime reviewer.
- 16/17 production execution hashes совпали с текущими файлами. Для `server/remote-postgres-engine.mjs` original run source `.local/reproduction/b4013149-c3dd-47e4-b78f-1576a7ce7bdb/source/server/remote-postgres-engine.mjs` имеет 25848 bytes/SHA `051975f5b30c4bdafaeee5bea1c9ab1b9082e466d3c66fbeb48017a5012121b6`; current — 25847 bytes/SHA `627ae4e59acba7482a3f4f634f2682e6a01dd92971961339e9cc19465d495c8b`. Прямое сравнение каждого байта подтвердило ровно удалённый trailing LF. Это явно записано в PG provenance и report; исходный финансовый hash не переписан.
- Пример 10 × 1000 × 10% / 2 = 500, principal = 10000; checked-u128 program formula отвергает дробный minor unit. Веса 30+25+20+15+10=100 — supplied rubric, не earned score.

## Две небольшие неточности adjacent handoff и их исправления

Обе обнаружены и исправлены lead ДО этого initial formal review. Они не меняли фактических assertions report/assessment и не требуют draft2; frozen packet сохранён. `issues: []`, `resolutions: []` относятся к формальному report review, а не стирают эту историю документов.

| ID | Наблюдение | Фактическая правка и повторная инспекция |
|---|---|---|
| D01 minor | Старый31-HOSTING step6 перечислял seal перед funding, хотя seal требует полный principal+coupon reserve. Ошибка могла вызвать безопасный отказ seal, не ложный финансовый success. | Current step6 теперь: create/register/distribute → fund full principal-plus-coupon reserve → seal. Новые bytes перечитаны; источник frozen packet сохраняет прежний текст. |
| D02 minor | TECHNICAL дважды описывал HTTP API только как loopback, хотя explicit hosted listener использует0.0.0.0 и deployment authentication. | Architecture теперь явно local loopback **or** authenticated hosted listener0.0.0.0; HTTP-guard paragraph охватывает оба режима. Сверено с `readHostingPolicy` и current bytes. |

Исходный hosting SHA в frozen packet: `b2088154ffbd3f08c54f4a3c46c9924a9424e5181f9aa486550ccd33d4f70e72`. Frozen content не изменён; current hosting — отдельно проверенный output delta. Исходный TECHNICAL на первоначальной инспекции: `44e740a20b511947d28fe134f752c1d141f8729a91a4db2875384bd7ff875ee4`. D01/D02 — только документация; execution tests и финансовый run им не приписаны заново.

## Exact binding и финальные output hashes

| File / binding | SHA-256 |
|---|---|
| packet binding, policy4 | `6e65b21bb3fb595d28bfc6fadbf276944e28585fd58b0a464a152a7f0a6762a4` |
| run/draft-1.md | `871df825c3952554f2bd54bdf08d398db3dc1a657d0f7b0cc041705a89da3110` |
| run/draft-1.assessment.json | `444ecfc9b520b0148bc1863fc6f8ba27ba629448ebc68f7e9ebe532a5c91da4c` |
| README.md | `8a23dfe36287f79c54ad272280785a7e99003ecc3024d04f45374d3e2aa4c7ba` |
| README.ru.md | `df967dd7aea907c7e8047418158d59a4ce8b5d206ae8c15d86be92c959321631` |
| TECHNICAL.md, corrected output | `f5819ffd484ee302a220ba84297ff6b02d003b72ea9ee76bd167e405822301af` |
| docs/31-HOSTING.md, corrected output | `89302f196d0b00c39ef9e1b9170700459e43028535ec9f83d00eb3e25bdeafe5` |
| render.yaml | `02a7ec715b1ecb8b1934eba263b13089c5ed083330711e2768ff99a9283e52bb` |

Root later reported exact immutable Git e8f08fb `--verify` completion and live UI/API readiness refresh. Those are additive evidence outside this frozen packet, not independently inspected by this reviewer and not claims of draft-1. Preserve source cutoffs: exact-Git source verification, prepared PG real financial run, and final document edits have distinct provenance. Any published report copy should retain reviewed draft bytes and resolve its relative evidence links from the final docs location.

## Remaining owner stage

Account login/consent, actual Neon role/TLS/provider probe, devnet deployment/test funding, final authenticated public origin, successful external-wallet financial cycle, provider restart/redeploy with same IDs/signatures, and owner-retained off-host backup remain unverified. Phantom's retained `Unexpected error` is unresolved. Judge access, registration, owner video, eligibility and final submission remain separate unknown gates. Free-tier quotas, recovery after an older journal restore, production security/regulation and demand/partnership/competitive advantage cannot be inferred from these checks. No new application/build/provisioning authorization follows from artifact completion.

## Delivery-byte follow-up — 2026-10-09T14:24:57Z

Lead сообщил о Git LF-normalization в adjacent `docs/31-HOSTING.md` и запросил только уточнение provenance. Reviewer повторно прочитал исправленный step6 и текущие bytes: **15431 bytes**, SHA-256 `05230787ae1d8050998ffdb90a9979d5bef5f6d288c3ac9ebd49b078e4416d97`, terminal LF (`0A`). Этот SHA совпадает с index SHA, сообщённым lead; отдельного чтения Git index reviewer здесь не выполнял.

Для строгого сравнения reviewer в памяти заменил единственный terminal LF текущего файла на CRLF, не меняя остальные bytes. Получены **15432 bytes** и ровно ранее записанный SHA `89302f196d0b00c39ef9e1b9170700459e43028535ec9f83d00eb3e25bdeafe5`. Значит отличие от просмотренного corrected output в таблице выше — только удалённый `0D` перед финальным `0A`; текст и исправленный порядок funding-before-seal сохранены. Старый SHA выше остаётся историческим inspection cutoff, финальный delivery SHA — `05230787ae1d8050998ffdb90a9979d5bef5f6d288c3ac9ebd49b078e4416d97`.

Полная последовательность hosting provenance: frozen input `b2088154ffbd3f08c54f4a3c46c9924a9424e5181f9aa486550ccd33d4f70e72` → D01-corrected inspected output `89302f196d0b00c39ef9e1b9170700459e43028535ec9f83d00eb3e25bdeafe5` → EOF-normalized delivery `05230787ae1d8050998ffdb90a9979d5bef5f6d288c3ac9ebd49b078e4416d97`. Frozen packet не менялся.

Повторная SHA-сверка также подтвердила unchanged TECHNICAL `f5819ffd484ee302a220ba84297ff6b02d003b72ea9ee76bd167e405822301af`, draft-1 `871df825c3952554f2bd54bdf08d398db3dc1a657d0f7b0cc041705a89da3110` и review.json `66699fbe874edcce835e8f17373d6274a3d3dfec55941c3ceb70708cd02a516a`. Существенного нового дефекта нет; verdict, assessment и review binding не изменены. Новый draft/assessment/helper run или reset не создавался; tests/build/services/Git mutations/secrets не использовались. Lead перекопирует дополненный note и зафиксирует его новый hash отдельно.
