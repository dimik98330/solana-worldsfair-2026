# S05: чистое воспроизведение исходников

8 октября 2026. Root `C:\Users\dmitrii\Documents\solana`. Назначенные worker files: только `scripts/reproduce-source.mjs`, `scripts/ci-verify.sh`, этот отчёт. Shared dependency/compiler installs, builds, IDL, Git, config/.github и фактический lifecycle запускает lead в согласованном окне. Прежние ledgers, owner signer files и регистрация Ubuntu не меняются.

## Навыки и текущие факты

Фактически выбраны/прочитаны и переиспользованы неизменённые project-local ProofPilot coach direct implementation (`routing`, `solana-new`), solana-dev (`Anchor`, `security`, `testing`, дополнительно `compatibility-matrix`), review-and-iterate (`security-basics`, `code-review-rubric`, `compute-optimization`). AGENTS, START и актуальные STATE/29-BACKEND-STRENGTHENING прочитаны. Это scoped engineering verification, без нового research/score или сброса старых review lineages.

Перед каждой substantial задачей, продолжением и handoff сохранять правило AGENTS: читать актуальные инструкции и подходящие фактически установленные skills/references, report выбранные skills, соблюдать раздельное ownership. В чистую копию `.agents` не переносится; копирование исходников не является установкой/активацией навыков для нового чата.

Lead реально выполнил program checks в отдельной `BondTraceRuntime`: `.local/strengthening/program-tests-isolated.log` перечитан. **3 unit + 16 runtime passed**, включая 64 последовательности с seed `0xb07d7ace20261008`, 150072 ms на stateful suite, 168.49 s на весь runtime. Прежние12 runtime cases сохранены. Это проверка S04, ещё не доказательство S05. Original Ubuntu disk ранее отсутствовал; worker не менял WSL registrations. Explicit ignored project selection `.local/toolchain/wsl-runtime.json` сейчас указывает `BondTraceRuntime`.

S05 scripts написаны; clean staging/install/build/lifecycle **пока не запускались**. Выполнены только `node --check`, read-only `--help`, `bash -n` для native CI script и harmless проверка PowerShell `-CommandWithArgs`: отдельные аргументы `ci|--ignore-scripts` передаются без shell concatenation. Program/compiler builds в этом этапе worker не выполнял.

## Windows/WSL launcher

```powershell
# Только создать копию и manifest. Никаких install/build/transaction calls.
node scripts/reproduce-source.mjs

# После lead window: clean install + application/SBF/Node/UI verification.
node scripts/reproduce-source.mjs --verify

# Полное новое localnet воспроизведение и остановка только своих процессов.
node scripts/reproduce-source.mjs --lifecycle --rpc-port=8979 --api-port=3180

# Если lead хочет оставить именно этот новый runtime для просмотра:
node scripts/reproduce-source.mjs --lifecycle --keep-runtime
```

Windows launcher требует Node22.14.0, PowerShell7.4+ (`-CommandWithArgs`), выбранный WSL distro и уже установленный pinned toolchain Rust1.91.0 / Agave3.1.10 / Anchor1.1.2. Он **не устанавливает** WSL или toolchain и не изменяет project selection. `--distro=NAME` или `BONDTRACE_WSL_DISTRO` имеет приоритет над original ignored selection; selected public distribution name явно передаётся clean child environment, поскольку `.local` в копию не входит.

Каждый запуск создаёт exclusive `.local/reproduction/<uuid>/source`. Source-root symlink/junction ancestors отвергаются, файлы создаются через exclusive copy, UUID directory не перезаписывается. На стадии копирования используются explicit root configs, trees `apps/web`, `packages/client`, `programs/bondtrace`, `server`, `scripts`, `tests`, несколько project instruction docs. Public frontend assets копируются только из `apps/web/public`.

Исключаются `.local`, `.git`, `.agents`, `.codex`, `.claude`, `.impeccable`, `node_modules`, `target`, `dist`, `build`, `coverage`, `artifacts`, fixture/state/key/credential directories, любой `.env*`, symlinks/junctions и wallet/keypair/signer/credential/secret JSON. JSON разрешены только явные root configs и public program IDL/release. Test helpers в исходниках — код новых fixtures; старые chain fixture JSON и ignored signer files не читаются/копируются.

Compiler/dependency caches допускаются как ускорение загрузки/компиляции, но не являются input fixtures и не подменяют clean source. Child environment имеет узкий allowlist системных путей плюс явные test network/RPC/data/distro; owner RPC/data directories, tokens и NODE_OPTIONS не наследуются. `npm ci --ignore-scripts` получает отдельный пустой user npm config. Package lock сохраняется byte-for-byte.

Последовательность `--verify`: npm ci→npm run build→проверка tool versions→**direct** WSL `bash <clean-root>/scripts/build-program.sh`→`node scripts/write-program-release.mjs --check`→полный npm test→UI tests. PowerShell build wrapper не вызывается, поскольку он обновляет release metadata. Manifest copied frozen SHA/length остаётся контрольной величиной; при mismatch результат failed, оба образа/log сохраняются, metadata автоматически не переписывается. Это существенно при проверке воспроизводимости нового пути/toolchain.

`--lifecycle` затем требует `scripts/strength-smoke.ts` в самом staged snapshot, запускает **новый** runtime RPC8979/API3180 с `-NativeLedger`, проверяет сохранённые release/distro/origins/data directory, создаёт bootstrap ID `clean-source-bootstrap-<uuid>` до единственного POST. Unresolved bootstrap не повторяется автоматически и не получает новый ID. После confirmed bootstrap выполняется новый strength driver с `BONDTRACE_STRENGTH_EVIDENCE=docs/evidence/execution-strength-clean-<uuid>.json`; JSON и его SHA фиксируются в result. API/runtime получают только новые localnet test assets/signers.

После цикла по умолчанию Node API останавливается только при совпадении recorded PID/start time/exact clean server path. Native validator завершается через существующий ownership guard `native-runtime.sh stop` с exact scope/release/RPC и `/proc` identity. Files/ledger/logs **никогда не удаляются**. Если запускающий helper упал до сохранения проверяемого runtime identity, результат отмечает необходимость inspection; непроверенный PID не останавливается. `--keep-runtime` сохраняет процессы только этого нового runtime для lead inspection.

Output: immutable initial `manifest.json` с exact source byte SHA, `logs/<n>-<command>.log`, append-only `events.jsonl`, separate final `result.json`, bootstrap ID/result и evidence hashes. Каждая command record содержит actual clean cwd, args, exit/log SHA. В конце original allowlisted source hashes снова сверяются; обнаруженная concurrent source mutation делает result failed и перечисляется без отката. Стартовать snapshot после code freeze, а не во время соседних source edits.

## Native Linux CI recipe

```bash
# In an isolated Ubuntu24.04+ x86_64 CI runner, after pinned Node22.14.0 setup:
# Toolchain provisioning is an explicit setup step, outside the verification script.
BONDTRACE_CI=true bash scripts/setup-isolated-toolchain.sh

# All actual verification uses native Bash, Node and Cargo; no pwsh/WSL wrapper.
bash scripts/ci-verify.sh
```

`setup-isolated-toolchain.sh` содержит root package provisioning: запускающий workflow обязан выбрать подходящего owner/HOME для установки и последующих checks; не смешивать root-installed cache с непишущим runner account. В текущем dedicated WSL обе стадии используют один изолированный owner. `.github` workflow составляет lead; worker его не менял. Official downloads/version/SHA source закреплены в самом project setup helper, внешние ключи/платные services не нужны.

`ci-verify.sh` проверяет exact versions, делает npm ci с ignore-scripts, application build, direct SBF build и frozen release check, полные Node/UI тесты, Rust unit/runtime. Test data directory unique через mktemp внутри ignored `.local`; owner .env отвергается, RPC/network/data заменяются явным loopback test context. Никаких validator/deploy/live transactions он не заявляет. Actual new isolated lifecycle относится к `reproduce-source.mjs --lifecycle`, не к зелёному CI alone.

## Acceptance и handoff

До завершения S05 нужны actual clean source manifest/result с passed commands, совпадение frozen SBF SHA/length, успешный новый lifecycle/evidence и output ownership checks. Source-only copied/generated files, setup scripts и cache presence не доказывают reproduction сами по себе. При недоступности tools/RPC/disk или frozen mismatch сохранять точную ошибку и не повторять финансовые intents.

Worker scripts frozen для lead. No build/install execution в этом S05 implementation handoff. Gate остаётся: только бесплатные reversible source/localnet/devnet work; mainnet/real assets/paid/public visibility/final submission/consent/Git не входят в разрешение этого worker.
