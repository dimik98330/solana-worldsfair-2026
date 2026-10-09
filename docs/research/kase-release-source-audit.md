# BondTrace — аудит отдельного source-only пакета для жюри

Дата: 8 октября 2026, Kazakhstan UTC+5. Предварительный snapshot: private HEAD `e416f7210f11c1ac718ceb41ee6949eb1c3f0d3f`. Агент `/root/release_source_audit` выполняет read-only source/release review; единственный записываемый файл — этот отчёт. Публичного пакета на момент первоначальной проверки ещё нет. Оригинальный private репозиторий, credentials, signer files, ledger, сервисы и Git не изменялись.

## Метод и границы

Прочитаны AGENTS.md, CODEX_SOLANA_WORLDSFAIR_START.md, docs/00-STATE.md, backend focus/readiness, package/config/tool wrappers и относящиеся к выпуску исходники/ссылки. Использованы установленные `.agents/skills/proofpilot/SKILL.md` (явный **coach**, review → submit; routing/review/submit/safety/evidence/quality), `cso` (custom scope: только экспортируемые файлы, secrets/data exposure, daily confidence gate 8/10) и `review-and-iterate` (rubric/security-basics/compute-optimization, без новой оценки chain correctness).

Цель — проверить безопасность состава публикации, честность claims и воспроизводимость заявленных команд. Это отдельный новый release scope, не сброс исчерпанного backend assessment. Initial release inspection и максимум две подтверждённые repairs; будущий окончательный cutoff должен идентифицировать фактически созданный пакет. Шансы на победу, production security, регистрацию и eligibility этот отчёт не оценивает. CI/dependency advisories не перепроверялись; ключи и private history не сканировались и не считывались.

## Точный предлагаемый whitelist

Экспортировать **только tracked blobs выбранного commit**, без `.git`/истории original repo, через явный список ниже. README/index/публичный technical overview создать отдельно; не копировать исходные private drafts. Working-tree corrections после данного HEAD должны быть отражены отдельными source SHA/commit и повторно проверены.

1. Root exact files: `.env.example`, `.gitattributes`, `.gitignore`, `.nojekyll`, `Anchor.toml`, `Cargo.toml`, `Cargo.lock`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `brand.md`.
2. `apps/web/index.html`, все tracked `apps/web/src/**`; никаких `dist`, node_modules, recordings или build sourcemaps.
3. Все tracked `server/**`, `packages/client/src/**`.
4. `programs/bondtrace/Cargo.toml`, `programs/bondtrace/bondtrace-idl.json`, `programs/bondtrace/bondtrace-idl.ts`, `programs/bondtrace/src/**`. Не экспортировать `programs/bondtrace/tooling/**`.
5. Все tracked `tests/client/**`, `tests/program/runtime.rs`.
6. Exact scripts: `scripts/build-program.ps1`, `scripts/build-program.sh`, `scripts/test-program.ps1`, `scripts/test-program.sh`, `scripts/localnet.ps1`, `scripts/dev.mjs`, `scripts/demo-seed.ts`, `scripts/full-smoke.ts`, `scripts/issuer-smoke.ts`, `scripts/metadata-check.ts`, `scripts/preview-submission.mjs`, `scripts/verify-http.mjs`.
7. Exact media: `artifacts/demo/bondtrace-product-demo.mp4`, `artifacts/demo/bondtrace-product-demo.en.srt`, `artifacts/demo/bondtrace-product-demo.en.vtt`, `artifacts/demo/poster.png`.
8. Exact frozen recording evidence: `artifacts/demo/evidence/browser-cycle-localnet-2026-10-07.json`, `artifacts/demo/evidence/full-smoke-localnet-2026-10-07.json`.
9. Exact current evidence: `docs/evidence/backend-bootstrap-localnet.json`, `backend-concurrent-reads-localnet.json`, `backend-final-http-contract.json`, `backend-guided-cycle-localnet.json`, `backend-http-checks.json`, `backend-lease-lifecycle-localnet.json`, `backend-lifecycle-localnet.json`, `backend-migration-localnet.json`, `backend-restart-localnet.json`, `browser-cycle-localnet.json`, `full-smoke-localnet.json` (все под `docs/evidence/`).
10. При необходимости exact screenshots `docs/evidence/ui/backend-payments.png` и `docs/evidence/ui/run2-overview.jpg`; обе непосредственно просмотрены, виден только тестовый интерфейс/публичные generated addresses, без chrome аккаунта и секретов.

Для пунктов 1–9 на указанном HEAD: **105 файлов, 103 текстовых, 9 860 666 bytes**. SHA-256 отсортированного tracked path list с завершающим LF: `b17d4cdd4bc513892fee712503c168b4a40005cf3a1e50802b4f0a0488671c18`. Это контроль первоначального whitelist, не хеш готового пакета. Два опциональных screenshots и новые public docs увеличат состав; итог должен иметь собственный manifest.

Не экспортировать original AGENTS/START/STATE, docs/01–14, docs/research/review/setup, RESEARCH.html, proofpilot-source/bundle/config, private continuation notes, account/consent state, `.local/**`, `.env`, sqlite/backup/ledger, keypairs/auth/credentials, tools caches, raw video capture/inputs/audio/clips или первоначальный Git history. Для публичного AGENTS можно создать короткую самостоятельную инструкцию с обязательным ProofPilot/specialist skill выбором, не раскрывая private setup и не обещая установленный bundle на машине жюри.

## Проверка раскрытия данных

105 selected HEAD blobs прочитаны через Git, без чтения исключённых/ignored файлов. На 103 текстовых файлах выполнен bounded pattern scan: PEM private keys, GitHub/OpenAI/Slack access tokens, credential-bearing HTTP/database URLs, literal 64-byte Solana secret arrays, персональные абсолютные пути. **Credential/private-key pattern hits: 0**. Единственное personal-path совпадение в selected source — `scripts/localnet.ps1:14` (`/home/dmitrii/...`), описано ниже. Pattern scan не доказывает отсутствие всех возможных секретов; итоговый пакет всё равно требует финального exact-file scan и визуальной проверки выбранных бинарных assets.

IDL/PDA/program IDs, generated holder public addresses, signatures, unsigned/signed public transaction messages и тестовые суммы не являются приватными ключами. Они относятся к явно маркированному test/localnet evidence, а не к клиентским финансовым данным. `.env.example` содержит публичный loopback RPC и program ID; секретов в нём нет. `Anchor.toml` задаёт только относительный путь к **не включённому** keypair, а не сам keypair. Generated private signers остаются исключительно в ignored local namespace.

`artifacts/demo/render-validation.json:131` содержит `/mnt/c/Users/dmitrii/...`, а demo README/render helpers завязаны на личные пути. Эти файлы в whitelist **не входят**. Не публиковать полный `final-assets.json` как manifest сокращённого пакета: он перечисляет отсутствующие private/intermediate artifacts. Вместо него нужен отдельный manifest только реально включённых файлов с bytes/SHA и ясным historical cutoff.

## Подтверждённые release defects / исправления

| ID | Влияние и доказательство | Требуемое исправление |
|---|---|---|
| R01 | Fresh Windows/WSL reproduction: `scripts/localnet.ps1:14` жёстко задаёт `/home/dmitrii/.local/bondtrace-tools/.../solana-test-validator`. У другого WSL username этот путь отсутствует. Confidence 10/10, reproducibility issue, не секрет/vulnerability. | Portable public wrapper: найти `solana-test-validator` через PATH или `$HOME` внутри WSL, с проверкой пути и явной ошибкой. Указать Linux прямую команду и официальный pinned toolchain prerequisite. Не менять global CLI network. |
| R02 | Fresh SQLite reproduction: `scripts/issuer-smoke.ts:12` и :57 безусловно читают `fixture.json`. `server/store.ts:8` сохраняет fixture через SQLite `writeJson`, а свежий `seed.ts:102/119` не создаёт legacy JSON. После нового seed эта smoke-команда может закончиться ENOENT до проверки lifecycle. Confidence 10/10, regression in reproduction helper. | Snapshot логического `fixture()` всегда; byte-for-byte legacy assertion выполнять только при существовании legacy file, также проверяя, что отсутствие сохраняется. Создать evidence output directory; optional restart gate должен создать собственный ignored directory. Не ослаблять chain/amount assertions. |
| R03 | Private links/dead scripts: original `index.html` ведёт в private original repo, technical/validation docs; original README ссылается на private planning/state, personal cwd/tool setup. `package.json` `report` требует исключённый `scripts/build-research-report.mjs` и private docs. Confidence 10/10. | Создать самостоятельные public README/index/technical/backend scope docs; заменить все source links на фактический public package. Удалить public `report` script или включить лишь действительно нужный safe independent tool. Проверить локальные ссылки и exact script targets. |
| R04 | Historical overview mismatch: original docs/18 содержит ранние 5 runtime tests, Node22.12, JSON storage и меньшие CU/holder coverage; текущий backend требует Node22.14 и SQLite, имеющееся video отражает ранний UI. Confidence 10/10. | Не копировать старый overview как описание current source. Отдельный concise public technical overview с нынешними функциями/границами; clearly state demo is historical captured UI and current source includes later issuer/backend work. Исторические evidence/media bytes не менять. |

Проектный `LICENSE` отсутствует в HEAD. Это информационная граница: не заявлять open-source/permissive reuse license без решения владельца; публичный доступ к source и разрешение на его повторное использование — разные утверждения. В исходниках наблюдаются pinned dependencies, custom authored source и generated IDL; vendored competitor project в данном whitelist не обнаружен. Полный legal/license audit не проводился.

## Честность public claims и эксплуатационные границы

- Public static page — **recorded demonstration + source/evidence**, интерактивный console запускается локально. Не называть static video site live hosted dApp/backend.
- Фактическое видео `2:54.021` отражает отдельный browser localnet issue с generated test signers, coupons 900, principal 18 000 и 18 burns. Current two-coupon normal issuer report относится к **другому** выпуску (1125/15 000/15). Не объединять их транзакции или выдавать новые backend checks за кадры старого видео.
- Local Explorer links с `127.0.0.1:8899` не дают внешнему жюри доступа к original ledger. Evidence JSON — сохранённые тестовые receipts; public devnet verification должно иметь собственные фактические ссылки/signatures, если deployment позже выполнен.
- Human external-wallet signing/cancel, devnet deployment, main registration и final submission остаются unknown в проверенном HEAD. Новые статусы разрешено обновить только по фактическим результатам lead; connected Colosseum Copilot/login не доказательство регистрации.
- Нет KASE/bank/custody API, real assets, fiat settlement, production audit, спроса/партнёрства/traction. Голосование informational; fixed cash terms не меняет. Full prefunding, 16 holders/8 coupons и отсутствие issuer withdrawal должны остаться явными.
- API source слушает loopback; default generated test harness предназначен для local demo. Публикация только static сайта не меняет этой security boundary. Не выставлять owner API/validator/keys наружу ради ссылки для жюри.

## Текущий вывод и финальный gate

**Предварительный status: needs work** для publishable self-contained package, из-за R01–R04 и отсутствия фактически созданного пакета. Состав whitelist в указанном cutoff не обнаружил credential/private-key pattern hits; это не security certificate. Source-only package может быть подготовлен автономно в рамках lead scope, не раскрывая private original history.

Перед final release inspection нужны: actual export directory/manifest, самостоятельные public документы/ссылки, исправленные reproduction helpers, результат `npm ci --ignore-scripts` + targeted Node/UI checks + build в export namespace, включая no-secret final scan. Fresh complete program-toolchain setup отдельно unknown, пока его не воспроизвели. Публикацию, Git и финальную конкурсную подачу выполняет только lead при действительной scoped owner authorization; этот отчёт сам ничего не публикует.

Continuation: при новой сессии/передаче читать AGENTS/STATE и suitable installed skills; mandatory ProofPilot coach для release/product решения, specialist security/review skills для проверок. Сохранить source/evidence cutoff, finding IDs и initial + максимум две repairs, не запускать новый review ради улучшения самооценки.
