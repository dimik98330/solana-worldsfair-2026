# BondTrace: независимая integration/readiness review

Дата: 08.10.2026 Asia/Qyzylorda / 07.10.2026 19:06 UTC. Mode: **ProofPilot coach**, decision context: **application**, stage: integration/readiness. Separate reviewer context; исходный packet — задача lead, текущие исходники, docs07/08/09/11/12/14/15/17, сохранённые SBF/API/UI evidence. Это новая стадия с runtime/SBF/UI данными, не повторная оценка архитектуры. Старый architecture initial+2repairs сохранён; его budget не сбрасывается. Здесь initial review, максимум две evidence-driven repairs.

Владение: только этот файл. Не изменялись код, зависимости, конфигурация, Git, accounts, validator или fixture. POST/signing/deploy не выполнялись, key contents не читались. В любом continuation сначала читать AGENTS/STATE и выбирать/читать реально установленные skills перед существенной работой; сохранять эти ownership/stopping gates.

Применённые skills: proofpilot + proofpilot-readiness-review (routing, quality, review, evidence, decisions, safety, honest-evaluation, source-grounded review; scoped implementation/offline evidence exception); cso **--code --scope server** (не полный infrastructure audit); review-and-iterate (security basics, rubric, compute); solana-dev (security, manual client transactions); product-review (crypto UX, onboarding, quality rubric, с уже заданным product/target/stage). Численные баллы и mainnet verdict не назначались: это ограниченный прототип, не security certification и не официальный конкурсный score. Отдельный quality run должен оформлять lead с frozen packet/draft/hashes; этот report сам по себе не является quality-helper acceptance.

## Вывод initial review

Local prototype имеет существенные работающие доказательства. Для заявления «готово к внешней подаче» остаются **needs work**: R1 восстановление неоднозначной отправки и expiry, R2 отображение proposal после personal-wallet route, а также отдельные devnet/public/video/eligibility/consent gates. Успешный guided-demo не доказывает личную wallet integration. Сейчас repairs lead уже начаты; ниже сохранены исходные находки и фактически прочитанные изменения.

## Материальные находки

### R1 — P1: неоднозначная отправка теряла подпись и снимала UI lock

Исходный `server/transactions.ts` выполнял `const signature=await rpc<string>('sendTransaction',...)`, затем `onSubmitted?.(signature)`; prepared relay выполнял `completePrepared(prepared.id,signature)` также только после ответа RPC. Подпись уже содержится в signed bytes, однако при HTTP500/timeout после принятия сетью она не сохранялась. `apps/web/src/api.ts` считает серверную ошибку uncertain только при `result.error?.code === 'UNKNOWN_STATUS'`; App.tsx `const unknown = submitted && (!(failure instanceof ApiError) || failure.uncertain)` поэтому переводил серверный INTERNAL_ERROR/RPC_UNAVAILABLE в `error`, разрешая новую операцию. Для повторяемых transfer/fund это риск повторного намерения с новым blockhash; on-chain one-shot coupon/principal этого не покрывает. Confidence9/10 по полностью прослеженному source path; fault injection не выполнялась.

Минимальный fix: вычислить и persist expected signature + lifetime **до** send; сохранять ambiguous status/operation ID при прерванном ответе, возвращать UNKNOWN_STATUS; definitive preflight failure и confirmed on-chain error отделять от неопределённого transport. Не делать automatic resign.

Repair observed19:06UTC: lead перенёс callback/completePrepared перед send, сохраняет expected signature, добавил UNKNOWN_STATUS и `AppError.definitive` для явного preflight error. Это исправляет потерю send response, но R1 пока **partial**:

- `operationStatus` при наличии signature игнорирует сохранённый `status:error` и обращается к RPC; definitive preflight failure с отсутствующим on-chain receipt становится pending после reload.
- `transactionStatus` возвращает pending для любого null; lastValidBlockHeight не сохраняется в operation/prepared. Dropped/expired transaction способен бесконечно держать UI unknown. Persist lifetime и проверять expiry при отсутствии receipt, сохраняя uncertainty до истечения; definitive saved failure должен восстанавливаться как failure.
- После успешного send, ошибка в awaitConfirmation также должна оставаться UNKNOWN_STATUS, а не обычным RPC_UNAVAILABLE, снимающим UI lock.
- `rememberPrepared` фильтрует старые записи выражением `r.expiresAt>Date.now()` и ограничивает100; новый prepare через120seconds удаляет даже signed unresolved reference. Сохранять pending/signed записи независимо от preview TTL, явно определить bounded retention/expiry, не молча удалять единственный recovery reference.

Официальная семантика проверена07.10.2026: RPC подпись можно извлечь до отправки; успешный send не равен confirmation, blockhash может истечь. [sendTransaction](https://solana.com/docs/rpc/http/sendtransaction), [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses). Это поддерживает recovery design, не доказывает эксплуатацию в данном запуске.

### R2 — P1: personal-wallet proposal не появлялся после confirmation/reload

`server/state.ts`: `for(const id of f!.proposalIds)` — единственный список отображаемых proposals. В исходном коде добавление `latest.proposalIds.push(id)` было только в `demoAction` после create_vote; `submitPrepared` этого не делал. Следовательно issuer через My wallet получает реальный confirmed proposal, но UI его не читает и следующий proposal может снова использовать ID1. Smoke использует исключительно `/api/demo/action`; этот путь им не покрыт. Confidence9/10 по source path; реальная personal-wallet подпись не выполнялась.

Минимальный fix: при confirmed prepared create_vote сохранять его точный ID и bond identity, также при recovery после interrupted response; альтернативно обнаруживать валидные program proposals on chain. Нельзя добавлять неподтверждённый proposal как success.

Repair observed19:06UTC: PreparedRecord теперь хранит bond; submitPrepared и operationStatus вызывают `recordProposal` только после confirmed, а helper проверяет текущую bond identity. Source fix **observed**. End-to-end prepared/personal-wallet route остаётся unverified; нужен narrow regression или подписывание владельцем с последующим GET/reload.

### R3 — P2: malformed input становится HTTP500

JSON body не проверяется как object: `null` вызывает доступ к полям, а domain.uint/address/string builders выбрасывают plain Error для malformed units/address/слишком длинного UTF8 title. index.ts общий catch превращает их в INTERNAL_ERROR500. UI допускает100 characters proposal title, adapter допускает96 **bytes**; даже49 Cyrillic characters не пройдут. Это input/UX/API-contract defect, не доказательство обхода signer/amount constraints: malformed transaction не проходит builder/simulation.

Минимальный fix: validate object/action/params/strict integer strings и адреса на boundary с AppError400; ограничить proposal UTF8 length96 в UI и API. Не принимать JSON numbers как token amount. Confidence9/10 по source. POST проверки не выполнялись по границе reviewer.

## Что проверено и проходит в данном scope

- `npm test`: **5 passed,0 failed**; exact coupons, rounding/u64 overflow,16mask positions, instruction discriminators vs actual IDL, truncated/bad-discriminator decoder.
- `npm run test:ui`: **3 passed,0 failed**; >Number.MAX_SAFE_INTEGER formatting, exact input arithmetic, Explorer URL allowlist.
- `npm run typecheck`: **passed**. Build здесь повторно не запускался; lead build evidence проверяется отдельно после repairs.
- Сохранённый `docs/evidence/full-smoke-localnet.json` прочитан вместе с `scripts/full-smoke.ts`: **11 confirmed action proofs**, coupon900, principal18000,18burnt, vault0, historical holder10 vs current8, duplicate ballot/claim/principal rejection, same demo operation ID/signature replay. Это inspected saved evidence, не новый reviewer run и не real human-wallet integration. Smoke reset/reseed здесь не выполнялся.
- `runtime-final-results.log`: **5/0** и реальные SBF/SPL paths; `unit-results.log`: **3/0**. Измеренный final run16 holders: proposal884bytes/66584CU, capture839bytes/68376CU, redemption772bytes/62263CU, principal47643CU. Более высокий84_584CU из другого recorded run не конфликтует: bumps/fixtures отличаются. Это16 registered addresses, не16 positive independent users; all16positive/8coupons/longest title worst case не заявлен проверенным.
- `mcp-autofixer-result.json`: issues=[], suggestions=[] в сохранённом output. Это static tool evidence, не audit.
- Exact prepared message SHA256 binding + runtime signature verification: сервер не подписывает personal-wallet messages; wallet.tsx проверяет signer/network/version и rejects altered message after wallet signing. Arbitrary instruction relay не обнаружен в проверенном code path. API wallet signing здесь не executed.
- Demo fixed roles только issuer/investor1/investor2/investor3; generated signer должен совпасть fixture; transfer destination принадлежит fixture; network config разрешает localnet loopback либо exact official devnet RPC. Personal keys не передаются API. Generated test custody обозначено отдельно от My wallet.
- Claims preview использует immutable coupon/redemption snapshot; transfer preview tokenDecimals0 и holder recipient; payouts/funding tokenDecimals6 и correct mint/recipient. BigInt financial multiplication/formatting; coupon numerator%denominator reject rounding. Rate/frequency — fixture metadata, не самостоятельно доказанная on-chain annualized rate.
- API слушает127.0.0.1; POST чужого Origin rejected, application/json/body limit; это локальный harness, direct nonbrowser clients without Origin разрешены. Общее public hosting с generated signer endpoints требует отдельного design/authorization; текущие guards не заявлены production authorization. Missing production rate limiting/TLS не выводились как уязвимости localhost.
- Actual screenshot `docs/evidence/ui/overview-desktop.jpg` просмотрен: localnet, Guided demo/test wallets, accelerated schedule, redeemed18, coupon900, principal/vault0, six-decimal display. Скриншот доказывает desktop rendered state, не clicks/signing/mobile flows.

## Live read и отсутствующие gates

GET `/api/health`:200 `{status:ok,demo:true}`. GET `/api/state` в19:03UTC:500 INTERNAL_ERROR fetch failed; повтор19:06UTC после error fix:503 RPC_UNAVAILABLE. API process жив, текущий validator/RPC read unavailable. Это наблюдение в ходе параллельной QA lead; причина не установлена и сохранённый completed smoke не аннулируется. Fresh chain-state gate **unknown**, последующий успешный read нужен прежде чем объявлять current end-to-end passed.

| Gate | Status | Основание |
|---|---|---|
| Local saved SBF+API economic cycle | passed at saved snapshot |11 receipts + inspected smoke source/runtime logs |
| Current live chain read | unknown |API200 health, state503 RPC unavailable |
| R1 recovery/expiry | needs repair/verification |source defects + partial lead fix |
| R2 personal-wallet proposal listing | source fix observed, runtime unknown |recordProposal added; wallet signing not tested |
| R3 malformed inputs | needs repair |plain Error500 +100chars/96bytes mismatch |
| Browser personal signing/cancellation + mobile | unknown in this review |desktop saved screenshot only; lead QA separate |
| Devnet deploy and full flow | blocked, not passed |docs16 zero-funded payer; no signature; no further airdrop attempted |
| Public/reviewer source access, video/demo link | not complete |docs14 private repo + URLs/video pending |
| Global registration/submission + eligibility | unknown/not submitted |login is not registration; owner confirms profile/eligibility/terms |
| Final submission and binding consent | owner gate |не отправлено; reviewer/lead не принимают terms |

Нет доказанных пользователей, KASE integration/partnership, production audit, mainnet safety или официального балла. Конкретный следующий шаг initial: lead завершает минимальные R1/R2/R3 repairs и narrow regression, восстанавливает GET chain state, затем отдельная evidence-bound repair review этого файла. External materials/owner gates остаются отдельно даже при чистом local review.

## Repair1 — итог, 07.10.2026 19:32:51 UTC

Перечитаны изменённые transaction/RPC/operation/prepared/store/action/API/UI paths и изолированный `tests/client/recovery.test.ts`; просмотрен `.local/recovery-test-results.log` (4/0). Reviewer повторно выполнил `npm test`: **9/9**, то есть исходные5 domain tests плюс4 transport regressions; `npm run typecheck`: **passed**; `node --import tsx --test apps/web/src/validation.test.ts`: **2/2**. Mock transport не обращается к chain, не содержит human wallet flow и не доказывает настоящую personal-wallet подпись. Тест заранее устанавливает `BONDTRACE_DATA_DIR=.local/tests/transport-<UUID>` до imports; fake activity/fixture остаются в этом ignored namespace, не в рабочем demo. Генерируемые signers эпизодические тестовые, private contents не печатались/не читались reviewer.

**R1 fixed для проверенного local transport scope.** Подпись и lifetime сохраняются до network send; потеря send response и confirmation-read failure дают UNKNOWN_STATUS. Callback recovery и prepared recovery подтверждены двумя отдельными mock fault tests. Definitive preflight failure сохраняется terminal error, operationStatus возвращает его; API больше не путает operation.error с API error wrapper; UI `track` и `reconcile` проверяют terminal status до signature branch. Signed unresolved prepared entries переживают preview TTL; source допускает отказ RECOVERY_CAPACITY вместо молчаливой потери recovery record.

Важная корректировка в пределах этого же repair1: при отсутствии receipt после lifetime сервер возвращает **unknown**, а не expired. Такой ответ не утверждает, что транзакция никогда не исполнилась; UI не делает повторную отправку и требует reconciliation. Mock test проверяет именно unknown. Automatic expiry/unlock не обещается; recovery для утраченной истории может потребовать ручного сопоставления текущего state и операции. Это безопасный остаточный liveness limit прототипа, а не unattended exactly-once guarantee.

Если live RPC уже не хранит старую подпись, ранее действительно observed confirmed activity может вернуться с `verification:'recorded-confirmation'` и `observedAt`; это историческая локальная запись, **не новое RPC confirmation**. Она доверяет сохранённому local file и непрерывности test ledger; cluster reset/изменение local history не аттестованы. Новый UNKNOWN не превращается в confirmed на основании одного намерения или mock. Поле `verification:'live-rpc'` отдельно обозначает текущий read. UI ещё не отображает verification provenance отдельной строкой; материал о сохранённых receipts обязан сохранять эту оговорку.

**R2 fixed на source/mock route.** Confirmed prepared create_vote добавляет точный ID в metadata выбранной bond; operation recovery применяет тот же helper. `recordProposal` сверяет bond identity и не переносит старый proposal на новую fixture. Четвёртый transport test проверяет `proposalIds=['3']` после submitPrepared. Настоящая wallet-authorized create_vote и subsequent getState/reload остаются отдельным **unknown**, не выдаются за прохождение mock test.

**R3 fixed для выявленных inputs.** JSON null/array reject400 по source; common domain string/u64/address failures mapped400; title UI проверяет96 UTF8bytes с сохранением полного исходного текста и focus на поле. Два реальных unit tests покрывают ASCII, Cyrillic, emoji, trim/empty. HTTP malformed-body requests здесь не выполнялись по запрету POST во время параллельной QA. Общая полная schema/fuzz validation не заявлена.

Fresh reviewer GET `/api/state` теперь **200**, localnet connected=true, correct program ID, current bond `5knY93zt91XKMqnxz2ukXGHVzx6Ro9vgKsrcrT3RbhJU`, Active, issued18/redeemed0/vault18_900_000_000, one proposal. Это **новый** выпуск для lead UI recording; сохранённый full lifecycle относится к `C9KpFDHagCG3sNi6FJqFx3RTaUW38oLqkUFkxpFLUuhN` и его Redeemed18/vault0. Состояния разных fixtures не смешиваются. Новые guided browser clips подтверждений сообщил lead; reviewer не проводил их playthrough и не проверял все кадры, поэтому не повышает human wallet/mobile/browser gates самостоятельно.

Source snapshot SHA256, на котором закрыт repair1:

```text
server/transactions.ts 151B9606A3F04CAE4BA85E39111A840FCFBACF9A54E9A9006E75C64218F4C83F
server/rpc.ts A3365DEDF0AC82E62FA6CB55D329D503A76824B85A615B1931FF1AF1B643ECF6
server/operations.ts 3FF3224CA7954CE616FFC0A8F742F57B11EA8BB3E30DA1021D484DD51616B360
server/prepared.ts E433C0297323DACC8EF8576FDD284531F32325DA6DB2EDFDEDE51AA3FF0272BA
server/actions.ts 40504DA1E74CFCEB9660B205C2B84F46B3301084D85C58E37DFFF4748C18AF32
server/store.ts E056EAD6AC0D7D2F69401235299A5BF589673C0DF0CCE601B6CAD924535517CB
server/index.ts 80CD42B2EFABE78C28D9B36DFAE5B1E34FB0F0B3EAB6DDBC9CA53DFF2CA1C323
apps/web/src/api.ts 7E75FAFC86A83B3010549BC915909E2D93ABBDF37AA3296666510E465CDD7BD5
apps/web/src/App.tsx 7C203BA59E72FB9AF3EE122C80113180C9CAC46F334DA03CDDCB0545ED85D59B
apps/web/src/validation.ts 1D66E66BF7E9B62EC0FAD5578A06E17739FDDE3A075A31B7678ADB65613D362F
tests/client/recovery.test.ts 4CB687F7F775BDEA6DB8792C7E7163930ED12A6DAE658F8D910BCE40A74B67AA
```

**Repair1 закрыт без нового материального source finding в проверенном scope.** Local prototype может продолжать demo/material preparation. Общая application readiness остаётся **needs work**: devnet funding/deploy, external accessible source/demo/video links, global registration/submission, eligibility и owner consent требуют отдельного evidence. Human wallet signing/mobile/полный browser flow остаются unknown в этом report; lead QA может обновить их отдельными фактическими материалами. Budget этой integration review: initial + repair1 использованы, максимум ещё один evidence-driven repair при новой материальной проблеме; старый architecture budget неизменен и исчерпан.
