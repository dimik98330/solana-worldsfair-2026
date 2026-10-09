# Проверка исполняемой программы — backend checkpoint

8 октября 2026. Корень `C:\Users\dmitrii\Documents\solana`. Задача соответствует новой работе над Technical Execution и Corporate Action Logic; это проверка инженерного поведения, без выдуманного конкурсного балла и без перезапуска завершённого бюджета B01–B05.

Прочитаны актуальные AGENTS/START/STATE и docs/25-BACKEND-SERVICING-RESULTS.md. Использованы установленные `solana-dev` с security/testing references, `review-and-iterate`, ProofPilot **coach** по implementation/debugging route. Инструкции, уже прочитанные в этом контексте, переиспользованы; перед новым substantial task сохранять mandatory skill rule. Соседний чат владеет UI, lead — wiring/config/release manifest/Git. Эта работа не меняет их файлы.

## Причина

Сохранённый backend checkpoint различает старую программу основного validator8899 и исправленный SBF отдельного validator8919. Один и тот же Program ID не устанавливает, какие именно инструкции исполняет выбранная сеть. Новый `server/program-identity.ts` сравнивает наблюдаемые deployed bytes с явным release descriptor, чтобы lead мог разрешать новые подписи только для проверенной версии. Проверка не выполняет транзакции и сама не подключается к обработчикам recovery.

## Интерфейс

- `getProgramIdentity()` возвращает `known-match`, `mismatch` или `unavailable`; не выбрасывает ошибку при недоступном RPC/manifest.
- `assertVerifiedProgram()` возвращает тот же результат только при `known-match`. Иначе выбрасывает `PROGRAM_IDENTITY_MISMATCH`/409 либо `PROGRAM_IDENTITY_UNAVAILABLE`/503 с указанием сохранять прежние receipts.
- `createProgramIdentityVerifier({rpc, expected, programId?, network?, rpcUrl?})` изолирует injected RPC/descriptor и собственный cache для тестов. `expected` принимает descriptor или callback. Default programId — фиксированный `PROGRAM_ID`.
- Default descriptor заново читается из `programs/bondtrace/release.json`. Поля: `schemaVersion:1`, `programId`, `loader:'BPFLoaderUpgradeable'`, `programLen` (байты исходного .so), lowercase `sha256`; optional безопасный `releaseId`. Манифест создаёт lead после build; модуль не доверяет target/deploy автоматически и ничего не дописывает в manifest.

Пример интеграции lead: guard перед **новым** review/signing/relay. Если operation уже содержит подпись, сначала существующий passive recovery path; не требовать соответствия новой версии программы для чтения старой квитанции. Сам модуль не меняет `chain-identity.ts`, `actions.ts`, `transactions.ts`, `seed.ts`, `config.ts`, `index.ts`.

## Проверяемые свойства

ProgramData PDA выводится из bytes фиксированного Program ID с Upgradeable Loader ID; pointer в Program account обязан совпасть. Проверяются loader owner, executable flags, exact Program layout36, ProgramData header45, state tags2/3, Option authority0/1, RPC context и длины/каноническое base64-кодирование. Program и ProgramData читаются парой одним `getMultipleAccounts` context.

На холодном cache: genesis → coherent headers → coherent full accounts → повтор coherent headers → genesis. Изменение header/address/allocation или genesis внутри проверки возвращает unavailable. Slot последовательно не уменьшается; перед следующими чтениями передаётся `minContextSlot`. ProgramData deployment slot обязан быть старше observation slot, поскольку upgrade вступает в силу на следующем слоте.

SHA-256 считается по ровно `programLen` bytes после metadata45. Более короткое содержимое не проходит; больший allocation допускается только при полностью нулевом хвосте. Immutable `None` не сдвигает начало executable на13: bytes13…44 могут содержать прежние authority bytes. `Some(System Program)` отображается как configured authority, не как `None`.

Cache содержит hash одного проверенного payload с ключом genesis/program/ProgramData/full45-header/allocation/descriptor. Каждое обращение всё равно перечитывает genesis и headers до/после решения. Upgrade slot, authority, reserved header, allocation, release descriptor или reset инвалидируют cache. RPC failure не превращается в прежний success. Concurrent callers сериализуют наблюдения, чтобы старый ответ не заменил новый cache.

JSON раскрывает expected/observed hashes, actual payload/allocation lengths, padding, ProgramData, deploymentSlot, upgradeAuthority/immutable, genesis и confirmed context. `verification.method` отделяет `full-payload` от `cached-payload-with-fresh-headers`; `payloadContextSlot` отличается от свежего `headerContextSlot`. `sourceToBinaryAttested` всегда false.

## Проверки и границы

`tests/client/program-identity.test.ts` содержит synthetic public accounts и injectable read-only RPC: exact match, zero/nonzero padding, short/hash mismatch, mutable/immutable/System authority, owner/flag/state/PDA spoofing, malformed/null RPC, invalid descriptor, activation/stale slot, authority/upgrade/reset/descriptor cache invalidation, races при full/final чтении и concurrent callers. Никаких seed/private keys/signers, active ledger или настоящих RPC в этих тестах.

Первый прогон11/11 прошёл, затем добавлен отдельный warm-cache failure regression и assertion про System authority. Финальный результат12/12 passed,0skipped; `npm run typecheck` и scoped diff-check прошли на текущем source cutoff. Live чтения8899/8919, guard wiring, release.json и полный HTTP smoke выполняет lead; этим модулем они не заявляются проверенными.

Это **RPC-observed deployed-bytecode comparison**, не криптографическое доказательство честности RPC, не reproducible/source-to-binary build attestation и не production certificate. Cache опирается на корректную семантику loader: изменение исполняемого кода изменяет deployment slot. Mutable authority может обновить программу после последнего чтения; caller должен повторять guard непосредственно перед новым действием. Полностью устранить этот TOCTOU без on-chain/version-pinning архитектуры данная read-only проверка не может. Существующие receipts остаются отдельным историческим доказательством.

Primary sources, прочитаны2026-10-08:

- [Solana Program Deployment](https://solana.com/docs/core/programs/program-deployment): loader upgrade, authority, zero fill, activation на следующем слоте.
- [UpgradeableLoaderState source](https://docs.rs/crate/solana-loader-v3-interface/latest/source/src/state.rs): Program36/ProgramData metadata45 и типизированные состояния.
- [Canonical ProgramData PDA derivation](https://docs.rs/solana-loader-v3-interface/latest/src/solana_loader_v3_interface/lib.rs.html): seed — program public key, program — Upgradeable Loader.
- [getMultipleAccounts](https://solana.com/docs/rpc/http/getmultipleaccounts): request-order accounts, context, dataSlice, minContextSlot.

Solana Docs MCP semantic search также проверен; private source туда не передавался. Изменены только этот отчёт, новый module и его test. No build/install/Git writes/UI/live mutations/restarts. Следующий владелец сохраняет AGENTS mandatory skills, original ledger/signers/evidence и external gates (без mainnet/реальных денег/paid/public visibility/final submission).
