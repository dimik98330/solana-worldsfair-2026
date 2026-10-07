# B03 — транзакционное хранилище публичных метаданных

Дата: 2026-10-08. Корень: `C:\Users\dmitrii\Documents\solana`. Изолированное задание storage worker; это проверка модуля, не аттестация полного backend/KASE submission.

## Контекст и границы

Прочитаны `AGENTS.md`, `CODEX_SOLANA_WORLDSFAIR_START.md`, `docs/00-STATE.md`, `docs/21-BACKEND-FOCUS.md`, текущие config/store/prepared/operations/catalog и инструкции установленных skills. ProofPilot: **coach**, direct implementation route, bounded plan → implementation → review; существующий продукт/выбор KASE не пересматриваются. Использованы `.agents/skills/proofpilot/SKILL.md` + routing/solana-new/quality, `.agents/skills/solana-dev/SKILL.md` + testing/security, `.agents/skills/review-and-iterate/SKILL.md` + code-review-rubric/security-basics/compute-optimization. Formal application assessment/старые review budgets не сбрасывались.

Ownership: только `server/storage.ts`, `tests/client/storage.test.ts`, этот checkpoint. Lead владеет интеграцией, config/dependencies/Git и `docs/00-STATE.md`; остальные workers — своими назначенными файлами. Нельзя передавать продолжение без правила: прочитать AGENTS/STATE, выбрать реально установленные skills и нужные references до substantial task, сохранить skills/checks/gates в checkpoint. Subagents worker не создавал. Программа/IDL/GUI не изменялись; signing/RPC send не выполнялись. Установки и Git mutations не выполнялись.

Все исполнения storage worker используют синтетические `.local/tests/storage-<label>-<uuid>` или SQLite `:memory:`. Рабочее приложение и его namespace не открывались. Роли/кошельки/ключи не читались, не импортировались и не изменялись. Факт установленного модуля не доказывает его интеграцию в работающий процесс; это дальнейшая работа lead после backup/maintenance boundary.

## Реализация и контракт

Модуль не открывает базу при import. Первое обращение создаёт `metadata.sqlite` внутри `config.localDir`, строго под ignored project `.local`. На Node **22.14.0** реально проверена bundled SQLite **3.47.2**. Новых dependencies нет; используется `node:sqlite`. ExperimentalWarning остаётся видимым.

- `readJson<T>(absoluteFile, fallback): T` читает канонический документ базы.
- `writeJson(absoluteFile, value): void` атомарно заменяет один документ.
- `updateJson<T>(absoluteFile, fallback, mutator): T` выполняет read/modify/write под write lock и возвращает каноническое JSON-значение.
- `transactionSync<T>(() => T): T` использует `BEGIN IMMEDIATE`; вложенные вызовы используют SAVEPOINT. Ошибка откатывает текущую область. AsyncFunction отклоняется до вызова; возвращённый Promise/thenable отклоняется с rollback. Callback/mutator обязан быть синхронным и не планировать отложенные побочные эффекты.
- `listDocuments(prefix?): string[]` возвращает абсолютные логические filenames, даже если JSON-файлов на диске нет. Namespace prefix поддерживает `catalog`, `prepared`, `operations`, `receipts` или абсолютный путь к этим directories.
- `storageDiagnostics()` возвращает schema/version/counts/pragmas без полного integrity scan; `integrityCheck: []` означает непроверенное в этом вызове состояние. `storageDiagnostics({integrityCheck:true})` и `verifyStorageIntegrity()` выполняют явную проверку. Startup проверяет integrity один раз на открытие.
- `backupStorage(absoluteDestination)` создаёт согласованный snapshot через bound `VACUUM INTO ?`, проверяет readonly integrity/schema/application identity и возвращает SHA256/bytes. Destination: новый `.sqlite` внутри текущего ignored namespace, без overwrite; активная transaction отклоняется. Restore не автоматизирован и не меняет оригинал.
- `closeStorage()` позволяет контролируемый restart; закрытие внутри transaction отклоняется.

Schema version **1**, application identity **BTRC**. SQLite хранит JSON в TEXT, не REAL monetary columns. BigInt сериализуется decimal string; дробные, не-safe integer и non-finite numbers отклоняются. Limit **8 MiB на документ**; превышение блокирует запись и сохраняет старые записи. Pending/unknown и history в storage не обрезаются. Per-record documents позволяют root интеграции избежать aggregate array limit.

Разрешённые document keys: исходные `fixture.json`, `activity.json`, `prepared.json`, `operations.json`, `lifetimes.json`; `journal-migration.json`, `chain-identity.json`; `catalog/<base58 address 32..44>.json`; `prepared/<lowercase sha256 64>.json`; `operations/<A-Za-z0-9_- id 8..100>.json`; `receipts/<base58 signature 60..100>.json`. Эти filenames — внутренний storage contract; business/chain validation остаётся у callers. Все значения SQL передаются bind parameters; savepoint identifiers генерирует модуль.

## Импорт и отказ при повреждении

Одна transaction на первом открытии создаёт schema и импортирует **только пять исходных root JSON + catalog с адресными filenames**. Новые namespace JSON, keys, auth/credentials/env и другие файлы scanner не читает. При отсутствии данных возвращается caller fallback; отсутствующие на migration boundary legacy-файлы не перечитываются позднее.

`storage_meta.legacy_import_complete` фиксирует границу один раз; `legacy_imports` сохраняет document key, source SHA256, source bytes и timestamp. После этого база является источником метаданных: изменённый/повреждённый/вновь созданный legacy JSON не перезаписывает canonical state. Оригиналы importer не переписывает, не удаляет и не архивирует. Lead отдельно переносит старые массивы в per-record документы одной transaction с `journal-migration.json`; module не выполняет business migration самостоятельно.

Ошибка JSON/UTF-8/размера откатывает весь import; corrupt или чужой SQLite/schema не заменяется. Symlinks/junctions и не-regular files/directories отклоняются; проверяются ancestors, namespace, DB sidecars и document paths. Legacy file identity/размер/mtime проверяются вокруг чтения. Native Windows `lstat.dev` может быть 0 при реальном volume id в `fstat.dev`; учтено без отказа от inode/file identity проверки. Прочие credential paths/path traversal отклоняются до открытия документа.

Новый SQLite использует **DELETE rollback journal**; другой journal mode отклоняется без silent conversion. `synchronous=EXTRA (3)` включает FULL и усиливает sync после удаления rollback journal. `busy_timeout=5000`. Schema/marker inspection происходит под `BEGIN IMMEDIATE`, чтобы конкурентные первые открытия не смешивали разные schema snapshots. No WAL.

## Фактические проверки

Команды из корня проекта:

```powershell
node --import tsx --test tests/client/storage.test.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

Последний узкий запуск: **13 passed, 0 failed, 0 skipped**, 12.66 s; credential sentinels защищены test spies на `openSync` и `readFileSync`. Typecheck: **exit 0** после завершённых параллельных изменений других workers. Отдельный runtime read: `node=v22.14.0`, `sqlite=3.47.2`; experimental warning видим.

Покрыты:

1. Lazy opening; только разрешённый legacy import; source SHA/bytes сохраняются; 220 synthetic pending/unknown activity не обрезаются; не читаются credential sentinels и новые namespace FS JSON.
2. Exact u64 BigInt → string; float/unsafe/non-finite/circular/undefined/oversized updates сохраняют предыдущий документ.
3. Signature + lifetime + prepared + operation + activity атомарно commit/rollback; новый процесс получает все committed документы.
4. Nested rollback/release/outer rollback; Promise rejection; active-close rejection.
5. Reopen и отдельный процесс сохраняют canonical state несмотря на corrupt/новый stale legacy JSON.
6. Path traversal/credential names/invalid prefixes отклоняются; per-record namespace documents и markers сохраняются атомарно без JSON files.
7. Corrupt source откатывает schema/import целиком и оставляет legacy bytes; corrupt и unrelated SQLite не заменяются.
8. Namespace/catalog junctions отклоняются, целевой каталог не получает базу.
9. Abrupt `process.exit(41)` после 4 MiB write оставляет hot rollback journal; reopen восстанавливает предыдущие operation/lifetime и integrity `ok`.
10. Четыре процесса одновременно выполняют первый open/import и по 40 atomic increments: итог **160**, source JSON неизменён, integrity `ok`.
11. Backup SHA/integrity, readonly restore в другом isolated namespace, destination no-overwrite и in-transaction/outside destination rejection.

Initial failure был Windows lstat/fstat device mismatch; исправлен по фактическому синтетическому stat output и перепроверен. Затем усилена first-open concurrency и добавлены необходимые lead per-record namespaces; новые evidence-driven checks прошли. Это локальные implementation repairs, не новый formal application score.

## Источники и ограничения

Официальные источники, проверены **2026-10-08**:

- [Node v22.14 SQLite API](https://raw.githubusercontent.com/nodejs/node/v22.14.0/doc/api/sqlite.md): DatabaseSync/StatementSync, параметры и experimental API этой конкретной версии.
- [SQLite PRAGMA](https://sqlite.org/pragma.html): busy_timeout, synchronous FULL/EXTRA, journal settings и границы durability.
- [SQLite WAL](https://sqlite.org/wal.html): официальный WAL-reset bug затрагивает старые версии при определённой concurrent WAL нагрузке; поэтому для bundled 3.47.2 здесь WAL не применяется.
- [SQLite atomic commit](https://sqlite.org/atomiccommit.html), [transactions](https://sqlite.org/lang_transaction.html), [savepoints](https://sqlite.org/lang_savepoint.html): locks/rollback/nested commit semantics.
- [SQLite VACUUM INTO](https://sqlite.org/lang_vacuum.html): согласованный snapshot; interrupted backup может быть неполным, поэтому integrity/SHA проверяются после успешного возврата.

Process crash/restart/backup recovery доказаны этими синтетическими тестами. Внезапное отключение питания, отказ накопителя, hostile local filesystem races/ACL, сетевые filesystems, human-wallet/devnet и работа integrated backend этим заданием не проверены. EXTRA не является обещанием сохранности на любом hardware/OS. SQLite experimental API не выдан за production audit. Backup только public runtime metadata; он не заменяет chain ledger backup или backup кошельков.

Следующий шаг: lead подключает callers к per-record storage, атомарно сохраняет signature/lifetime/activity **до RPC send**, выполняет maintenance backup+одноразовый импорт настоящего namespace и проверяет built-origin localnet/restart и существующие выпуски. Stopping gate сохраняется: login/consent/final submission/public repository/mainnet/real funds/paid services — владельцу; этот worker ничего из этого не выполнял.
