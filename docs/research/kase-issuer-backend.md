# Кабинет эмитента: серверные конструкторы и каталог

Дата: 2026-10-08. Этап P11/P13, рабочая область `C:\Users\dmitrii\Documents\solana`. Владение этого агента ограничено `server/admin.ts`, `server/catalog.ts`, `tests/client/admin.test.ts` и этим отчётом. Общий API, signing, recovery, config, package/Git и `docs/00-STATE.md` принадлежат lead.

## Инструкции и выбранные skills

Прочитаны `AGENTS.md`, `CODEX_SOLANA_WORLDSFAIR_START.md`, `docs/00-STATE.md`, `docs/20-FULL-ISSUER-PLAN.md`, последние commits и status.

- `.agents/skills/proofpilot/SKILL.md`, coach, direct implementation route; references `solana-new.md`, `routing.md`, `safety.md`. Реализация следует существующему плану; discovery и проверка спроса не перезапускались. Capability inventory с абсолютным root подтвердил полный установленный bundle. Первый запуск с относительным root был отвергнут и исправлен.
- `.agents/skills/solana-dev/SKILL.md`; references `security.md`, `kit/advanced.md`. Существующий Kit/Anchor client сохранён; миграция стека не требовалась.
- Прочитаны `.agents/skills/review-and-iterate/SKILL.md` и `references/security-basics.md` для проверки signer/owner/PDA/arithmetic. Формальный readiness score этим узким backend-тестом не выставлялся.
- Solana MCP tools в текущем хосте не обнаружены. Изменение MCP/shared config не входило в владение агента; установки не выполнялись. Для проверки mint и canonical ATA прочитаны официальные docs, см. источники ниже.

Это правило сохраняется при handoff и новых чатах: прежде существенной работы читать AGENTS/START/STATE/актуальный план; выбирать реально установленные skills, читать инструкции и необходимые references и сообщать результаты. Не выводить ключи и не расширять разрешение на mainnet, реальные активы, paid services, account consent, public visibility или submission.

## Реализованный контракт

`adminActions`: initialize_issue, register_holder, issue_units, seal_issue. `fund_vault` остаётся в общем actions-builder.

`makeAdminAction({action, params?, bondAddress?}, wallet)` возвращает `instructions`, `bondAddress`, `proofAccount`, optional `amount`, `metadata`, `summary`. Summary содержит network/action/signer/instrumentAddress; выдача дополнительно amountMinor/token/tokenDecimals=0/recipients. Регистрация содержит recipient wallet. Подпись, simulation, relay и confirmation остаются в существующем transaction pipeline.

Creation params: `seriesId`, `name`, `settlementMint`, `faceValueMinor`, `maturityTs` — строки; coupons — JSON string или массив `{recordTs,paymentTs,unitAmount}` со строками целых чисел. Даты представлены Unix seconds; суммы — settlement minor units. Любые JS numbers, дроби, знаки, out-of-range u64/i64, пустые/неупорядоченные schedules, >8 coupons и >64 UTF-8 bytes названия отвергаются. Проверены будущие record dates, неубывающие payment dates и maturity. Проверяется сумма face value + всех coupons и её произведение на issued supply в u64; floating point не используется.

Проверка renderability: normal API ограничивает timestamp положительными Unix seconds ≤8_640_000_000_000 (предел JS Date), чтобы `getState.toISOString()` мог отобразить реально созданный выпуск. Это дополнительный API bound внутри i64, без произвольного ограничения срока. Regression проверяет boundary и boundary+1; также отвергается malformed surrogate в текстах, который не выдерживает UTF-8 roundtrip.

Creation читает существующий settlement mint: classic SPL owner, 82 bytes, initialized, decimals6. Derived Bond не должен уже существовать. Остальные действия читают выбранный instrument через `readBond(bondAddress)`, повторно проверяют canonical Bond/mint/vault PDAs, signer issuer, draft и окно до первого record date.

Registration проверяет wallet/SystemAccount, max16, duplicate, пустую canonical ATA и отсутствие delegate/close authority; до `register_holder` ставит idempotent ATA creation. Issuance требует registered frozen ATA, units>0 и новый полный reserve без overflow. Seal требует nonzero issued supply, registered holders, mint supply==issued, canonical bond mint authority/freeze authority и достаточный full reserve.

`metadata` имеет тип `Record<string,unknown>` и содержит проверенные сервером значения:

- initialize: `seriesId,name,settlementMint,faceValueMinor,maturityTs,coupons` (все числовые значения — decimal strings).
- register: `holderWallet,label?`.
- issue: `holderWallet,units,beforeTotalIssued,beforeHolderUnits`.
- seal: `requiredReserveMinor`.

`finalizeAdminEffect({action,wallet,bond?,params?,metadata?})` предназначен только для внутреннего вызова **после успешного confirmed receipt точного prepared message**. Сам по себе этот метод не утверждает наличие transaction receipt. Он перечитывает owned Bond, canonical identity, signer и actual effect. Creation сравнивает полный immutable schedule с metadata. Registration требует присутствие holder. Issuance проверяет issued total>=prepared baseline+units; draft holder balance также должен включать units. После seal/transfer/redemption delayed recovery не требует старый draft/balance. Seal требует state>draft. Неподтверждённое preparation не пишет каталог.

Каталог: `CatalogRecord extends Fixture` + `source:'wallet'|'demo'`, optional `holderLabels`. `readCatalog(bond)`, `listCatalog()`, `saveCatalog(record)` используют per-bond JSON в network-scoped localDir/catalog. Есть address/path/symlink checks, bounds на metadata/roles/proposals/labels и immutable issuer/series/mint/source. Запись через существующий atomic `jsonWrite`; исходный `fixture.json` не переписывается. Legacy fixture появляется как demo и не дублируется при наличии каталога. Source новых confirmed issuances классифицируется demo только при совпадении с legacy generated issuer, иначе wallet. Fixed coupons не превращаются в выдуманный rate: wallet record rateBps/couponFrequency=0. `createdAt` означает время локального наблюдения/внесения в каталог, а не доказанное chain creation time.

По замечанию independent review финальная catalog mutation перечитывает текущую запись после всех awaited chain checks; от этого чтения до atomic save нет await gap. Concurrent reconciliation сохраняет свежие labels/proposal IDs и монотонный complete, даже если issuer state успел продвинуться после первоначального read.

## Интеграция lead

1. В `ActionRequest` и HTTP передавать request-scoped `bondAddress`. Добавить `adminActions` в поддерживаемые действия и делегировать их `makeAdminAction` до общих coupon/holder reads. Никогда не менять глобальный выбранный fixture.
2. `readBond(bondAddress?)` должен использовать catalog record для explicit bond, проверять owner/discriminator/canonical issuer+series/mint; legacy fixture остаётся fallback. Каталог не импортирует state, поэтому circular state/catalog import отсутствует.
3. Добавить `metadata?:Record<string,unknown>` в PreparedRecord и Operation; persist `built.metadata` вместе с actor/bond/params/message identity. Пользовательские body metadata не должны подменять server-normalized values.
4. После confirmed в обычном submit, replay/recovery, guided execute и guided recovery вызывать `finalizeAdminEffect`; при RPC/effect/catalog failure сохранять confirmed signature и возможность повторить reconciliation, не разрешать новую подпись. Callback должен быть await-нут. Не применять hook при pending/unknown/error.
5. Corporate vote metadata/proposal IDs и activity должны также быть instrument-scoped. API/UI должны читать holderLabels только как display metadata; баланс, identity и lifecycle — из chain.

## Проверки и границы доказательств

Команда `node --import tsx --test tests/client/admin.test.ts`: первоначальная версия **9/9 passed**; это изолированный synthetic mocked RPC transport, не devnet/localnet транзакции. Test directory `.local/tests/admin-<UUID>` не затрагивает demo fixture. Покрытие: malformed terms, UTF-8, i64/u64, exact reserve above JS safe integer, mint owner/decimals/initialization, duplicate issue, catalog traversal/identity/file tamper, issuer/draft/date/duplicate/16 limit, ATA order, issuance positive/registration/overflow, seal reserve/supply/authority, actual chain ownership/identity/effect и delayed recovery after redemption.

Последняя версия после date-renderability, UTF-8 и concurrency repairs: **10/10 passed**, включая сохранение concurrent labels/proposal IDs/complete при awaited RPC reconciliation. Никаких реальных transaction sends в suite нет.

Первый `npm run typecheck` выявил собственные readonly-byte test typings (исправлены), зависимость от ещё не обновлённой lead-сигнатуры `readBond(bondAddress?)` и параллельный UI nullable BigInt. Повторная suite после добавления file tamper check: **9/9 passed**; повторный typecheck больше не сообщает собственных test-type ошибок, но остаются lead `readBond(optional)`, App issuer title и UI nullable BigInt. Полный результат lead-integration фиксируется отдельно; общий typecheck пока не passed. `git diff --check` для текущих tracked изменений не выявил whitespace errors; новые файлы ещё untracked и дополнительно проверяются после integration.

Агент не выполнял installs, signing, sending, chain state mutation, human wallet flow, devnet deployment или Git operations. Эти тесты не доказывают успешную цепочную интеграцию кабинета; соответствующий prepared-signing smoke и browser flow принадлежат lead.

## Источники

Доступ 2026-10-08: [официальные Solana mint docs](https://solana.com/docs/tokens/basics/create-mint) — mint owner/type/decimals/initialization; [token account/ATA docs](https://solana.com/docs/tokens/basics/create-token-account) — canonical ATA derivation. API getMintDecoder/getTokenDecoder/getCreateAssociatedTokenIdempotentInstruction сверены с установленным `@solana-program/token` 0.17.0 typings. Program behavior сверено с `programs/bondtrace/src/lib.rs`, `contexts.rs`, `state.rs` и `packages/client/src/program.ts`, а не предположено из documentation.

## Продолжение: regression нового prepared/recovery pipeline

Отдельное назначение lead ограничило владение `tests/client/admin-recovery.test.ts` и этим отчётом; server/UI/config/dependencies/Git не изменялись. Инструкции AGENTS/STATE/docs20/status и новые actions/transactions/operations/effects/prepared прочитаны. В том же контексте переиспользованы уже прочитанные неизменившиеся ProofPilot coach direct implementation, solana-dev security/Kit и security-basics; правило skills сохраняется в дальнейшем handoff.

Команда `node --import tsx --test tests/client/admin-recovery.test.ts`: **3/3 passed**. Использованы реальные Kit transaction messages и действительные Ed25519 signatures от ephemeral generated signer в памяти. RPC и chain accounts синтетические, отдельный ignored directory `.local/tests/admin-recovery_<UUID>`. Keypair не экспортируется/не сохраняется/не выводится.

Проверено:

1. Root `prepareAction(initialize_issue)` до send сохраняет normalized metadata, actor, derived bond и message identity. Нормализация проверяется на имени с окружающими пробелами, series с leading zero и coupons JSON string. В onSend перечитывается JSON с диска, чтобы metadata/signature-before-relay не зависели от in-memory object.
2. Синтетический RPC принимает создание и теряет send response: caller получает UNKNOWN_STATUS, исходная signature остаётся. Отдельный свежий Node-процесс загружает persisted prepared records, получает только публичные synthetic owned/canonical Bond/mint bytes, восстанавливает тот же operation ID в один matching catalog row и не вызывает sendTransaction. Процесс ограничен 15 секундами. Таким образом module/process reload recovery **проверен** в synthetic среде.
3. Post-confirm fetch failure instrument account и settlement mint account вызывают UNKNOWN_STATUS; signature и recoverable prepared record сохраняются. Последующий operationStatus повторяет только metadata reconciliation, пишет один каталоговый выпуск; repeated submit exact signed message не отправляет его снова.
4. Во всех сценариях byte comparison legacy fixture неизменен. Основной mocked RPC send count остаётся ровно1; restart subprocess send count0. Неверные replay-варианты этого теста не ослабляют signature verification root pipeline.

Это доказательство recovery-интеграции на mocked transport. Оно не подтверждает новый live-chain execution, человеческую подпись/отмену, devnet deployment, production crash persistence, public access или readiness/eligibility/submission. Отдельный реальный localnet smoke и browser evidence выполняются lead и не подменяются этой suite.

Текущий `npm run typecheck`: **passed** после lead-интеграции и узкого type guard для union `prepared.summary.issueTerms` в новом тесте. Упомянутые выше pending integration errors относятся к предыдущему checkpoint и больше не являются текущими.
