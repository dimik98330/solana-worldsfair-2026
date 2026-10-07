# KASE backend: согласованное чтение и точная финансовая сверка

Checkpoint 08.10.2026. Root: `C:\Users\dmitrii\Documents\solana`. Active stage: B01/B02 из `docs/21-BACKEND-FOCUS.md`; это усиление backend выбранного KASE-прототипа, без новой идеи или конкурсного score. Исходный HEAD перед изменениями: `91a1d64a173b516a0b80c43c33eb0fc5fc3edc82`, main/private. Существующие issuer/backend/UI/evidence изменения сохранены; Git mutations не выполнялись.

## Skills и границы

Прочитаны AGENTS, START, STATE, BACKEND-FOCUS, утверждённый PLAN, финансовые разделы SPEC/ARCHITECTURE и SECURITY. Использованы реально установленные `C:\Users\dmitrii\Documents\solana\.agents\skills\proofpilot\SKILL.md` — **coach**, direct implementation из существующей спецификации, bounded plan → implementation → review; routing/solana-new/plan/review/evidence/safety. Capability helper запущен с абсолютным project skill root; установка не повторялась. Профильные инструкции: `solana-dev` (RPC, security, testing), `review-and-iterate` (security-basics, correctness/code-review, compute guidance). Это локальная инженерная сверка, не независимый security audit или новый readiness score; прежние bounded assessment budgets не сбрасываются.

Worker owns только `server/state.ts`, `server/chain-view.ts`, `server/reconciliation.ts`, два соответствующих `tests/client/*.test.ts` и этот файл. Lead owns интеграцию, RPC/API/actions/storage/config/dependencies/Git/STATE. Program/IDL/frontend, ledger и signer files не изменялись; ключи не читались, подписи и live mutations не выполнялись. Это правило skills и остановочный gate должны сохраняться в следующем handoff.

## Источники и допущения

- [KASE listing](https://superteam.fun/earn/listing/superteam-kazakhstan-x-kase-side-track-corporate-actions-on-blockchain): перечитанный root-agent browser snapshot `.local/backend-focus/kase-source.txt`, retrieved `2026-10-07T22:12:49.090Z`; разобран worker 08.10.2026. Требуемый цикл: eligibility → exact entitlement → action → verifiable on-chain outcome; coupon, redemption и дополнительное действие обязательны. Никакой банковской/KASE API интеграции этот snapshot не требует и реализация её не заявляет.
- [Официальный getMultipleAccounts](https://solana.com/docs/rpc/http/getmultipleaccounts), проверен 08.10.2026: до 100 адресов, значения в порядке запроса, общий RPC context, commitment/minContextSlot.
- [Официальный getAccountInfo](https://solana.com/docs/rpc/http/getaccountinfo), проверен 08.10.2026: `null` означает отсутствие аккаунта на выбранном commitment. Ошибки или некорректный envelope не равны отсутствующему аккаунту.
- Authoritative code: текущие account decoders `packages/client/src/program.ts` и правила `programs/bondtrace/src/lib.rs`, в том числе zero canonical ATA exception и исторические coupon claims после redemption. Новые источники спроса, пользователи, интервью или legal/compliance evidence не собирались.

`confirmed` — выбранный commitment прототипа. Цифры относятся к одному предоставленному RPC bank context; это не гарантия честности провайдера, finality навсегда, корректности внешнего fiat settlement или production certification.

## Что изменено

`readChainView` использует Bond discovery только для определения адресов. Следующий **один** `getMultipleAccounts` с `commitment: confirmed` и `minContextSlot` discovery читает Bond, Clock, bond mint, settlement mint, vault, все canonical holder ATAs, все coupon PDAs, до32 catalog proposal PDAs и issuer settlement ATA. Максимум: `5 + 16 + 8 + 32 + 1 = 62` аккаунта. Holder/term/address graph и список proposal IDs сравниваются после чтения; изменение выбрасывает первый результат и повторяет discovery, максимум3 попытки. Transfer/redemption, не меняющие graph, возвращают целиком новое состояние из batch, а не смешанные цифры.

Account envelopes/base64, program ownership/discriminators, SPL account sizes, mint initialization/decimals и bond mint/freeze authorities проверяются. Bond/mints/vault/captured coupons обязательны. Absent или system-owned empty **canonical** holder ATA трактуется как zero, а conserved supply проверяется полностью. Recreated SPL zero ATA может иметь изменённого owner/delegate/closeAuthority согласно программе; nonzero требует registered wallet, Frozen, no delegate/alternate close authority. Issuer settlement ATA optional: настоящее отсутствие даёт zero и `settlementAccountAvailable:false`; обязательный vault отсутствовать не может. Invalid proposal не пропускается; только настоящий `null` записывается в `missingProposalIds` и `proposalCoverageComplete:false`.

`reconcile` работает с чистым decoded input. Проверяет:

1. current holdings = mint supply = issued − redeemed;
2. immutable schedule, sequential coupon existence, vector length/sum/totalUnits, capture times, допустимые claim bits, запрет claims на zero и paidTotal = сумма заявленных exact entitlements;
3. principal snapshot = issued, claimed principal units = totalRedeemed, unclaimed current balances = redemption vector, terminal state = complete burn;
4. proposal snapshot total/vector, dates/mask и yes + no = сумма voted mask weights; индивидуальная сторона ballot не прочитана и явно имеет `choiceEvidence:proposal-aggregate-only`;
5. весь contractual reserve, principal/coupon paid и remaining obligations, vault gap/surplus. Gap допустим в Draft; после seal недофинансирование — ошибка.

Каждое финансовое сложение и умножение проверяет u64. JSON хранит суммы и units строками; `decimal` строится вставкой decimal separator в integer string, без floating point. Даты отдельно проверяются на поддерживаемый ISO диапазон; суммы никогда не преобразуются в Number.

До capture купон имеет `basis:scheduled-forecast`, fixed accrued и claimable равны0. После capture total — фиксированное историческое entitlement из record snapshot; это не пропорциональное начисление процентов за прошедшие дни. `claimable` начинается только при достижении payment date по Clock из того же batch. Coupon rights сохраняются после перевода и burn; principal использует maturity snapshot, а burned units не уничтожают историю уже оплаченного principal.

## API contract для Lead

Существующие `getState(selected?)`, `programAccount`, `readBond`, `tokenAmount` exports и основные GUI fields сохранены. Индивидуальные helper reads остаются в builders; `/api/state` использует целый graph. `tokenAmount` больше не подставляет0 при отсутствии **required** account: optional/closed canonical caller должен явно передать `true`.

GET `/api/state` возвращает прежние instrument/holders/coupons/redemption/proposals/activity и дополнительно:

- `slot` string и `context:{commitment,slot,clockSlot,chainTimestamp,accountCount}`;
- `reconciliation.supply`, coupon rows и principal totals;
- каждое денежное значение `{baseUnits,decimal,decimals:6}`;
- `totals.contractual/cashPaid/remainingObligations/scheduledCouponForecast/fixedAccruedCoupon/claimableNow/vault/fundingGap/surplus`;
- `missingProposalIds`, `proposalCoverageComplete`, `proposalDiscovery:local-catalog-identifiers-only`.

`reconciliation.status:verified` означает выполненные финансовые identities на этом RPC context, а не security certificate. Proposal discovery ограничен локальным каталогом; аккаунты неизвестных catalog IDs не заявляются найденными. Annual rate/frequency из metadata имеют `rateBasis:local-display-metadata`; on-chain истина — фиксированные coupon amounts.

`recordSlot` может брать только исторически recorded **confirmed** capture activity и маркируется `recordSlotSource:recorded-confirmation`. Если такого evidence нет, `recordSlot:''`; текущий `context.slot` не выдумывается как slot capture или record date. `capturedAt` берётся из Coupon on-chain field. Исторический slot не требуется для exact текущих сумм.

Рекомендация route: не скрывать `RECONCILIATION_FAILED`/required-account errors, возвращать503 с кодом и без финансового state. `CHAIN_VIEW_CHANGED`503 retryable — клиент может повторить чтение без подписи. Root отвечает за общий error contract, durable recovery и проверку через built HTTP origin.

## Проверки

Команды выполнялись из project root 08.10.2026:

| Проверка | Результат | Scope |
|---|---|---|
| `node --import tsx --test tests/client/chain-view.test.ts tests/client/reconciliation.test.ts` | **17/17 passed** | Synthetic isolated metadata/RPC banks, не реальные receipts |
| `node --import tsx --test tests/client/admin.test.ts tests/client/demo-binding.test.ts tests/client/domain.test.ts` | **16/16 passed** | Narrow compatibility/regressions существующих builders/catalog/domain |
| `npm run typecheck` | Passed | Последний запуск после всех test/source edits |
| `git diff --check -- server/state.ts server/chain-view.ts server/reconciliation.ts tests/client/chain-view.test.ts tests/client/reconciliation.test.ts` | Passed | Tracked diff; новые файлы дополнительно просмотрены |

Тесты проверяют transfer/redemption между discovery и batch, graph/catalog races, retry cap3, maximum62 accounts, missing-required/truncated/regressing responses, SPL substitutions, positive/zero canonical rules, wrong Clock/mint/coupon availability, immutable dates/masks/paid totals, principal conservation, proposal votes, u64 overflow, amounts выше Number precision, draft funding gap и exact KASE `10×1000×10%÷2 = 500` / principal10000. Server modules в тестах загружаются **после** isolated `BONDTRACE_DATA_DIR`, чтобы SQL/catalog integration не затрагивала сохранённый demo.

Отдельно direct **read-only** `getState` успешно прочитал все три существующих localnet catalog instruments. RPC context/Clock slot совпали и были **28432**; использован существующий validator, seed/reset/send не выполнялись:

| Bond | Issued/burned/current | Coupon paid | Principal paid | Cash paid | Remaining/vault/gap |
|---|---:|---:|---:|---|
| `6u2T8w8NuwLCX78b2kAumNNETGCxKEksDo538i4XPGFV` |3/3/0|150.000000|3000.000000|3150.000000|0/0/0|
| `HvArwiNhkrvxm2Wot8FKtaatRBs8Utyqge2g2Ai1oJmi` |15/15/0|1125.000000 (750 +375)|15000.000000|16125.000000|0/0/0|
| `5knY93zt91XKMqnxz2ukXGHVzx6Ro9vgKsrcrT3RbhJU` |18/18/0|900.000000|18000.000000|18900.000000|0/0/0|

Это тестовые settlement token amounts, не доллары клиента или подтверждение банковского расчёта. Source money/positions прошли новые identities; история полного burn не обнулила total/paid. Stored instruments/evidence сохранены.

## Следующий шаг и stopping gate

B01/B02 готовы для Lead integration; общий backend goal ещё active. Lead должен завершить transactional storage/request/idempotency/recovery, независимый scoped review, final build, новую реальную corporate-action цепочку через built origin и persistence restart с сравнением прежних выпусков. Не считать direct-module read или synthetic tests заменой этого доказательства. Devnet, human-wallet signing, внешняя регистрация и final submission здесь не доказаны. Public visibility, paid/mainnet/real funds и юридические согласия остаются внешними owner gates.
