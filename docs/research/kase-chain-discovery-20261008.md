# Proposal discovery — scoped backend checkpoint

8 октября 2026. Корень: `C:\Users\dmitrii\Documents\solana`. Задача: убрать зависимость списка on-chain предложений только от локального каталога, сохранив один coherent confirmed bank для всех возвращаемых финансовых данных. Это новая реализация в текущем backend scope; прежние acceptance, hashes, demo и bounded review lineage остаются историческими.

## Навыки и границы

Прочитаны AGENTS, CODEX_SOLANA_WORLDSFAIR_START, docs/00-STATE, docs/21-BACKEND-FOCUS и актуальный docs/22-BACKEND-READINESS. Файла `docs/22-BACKEND-CHECKPOINT.md` нет; использован фактический READINESS.

Использованы установленные `.agents/skills/solana-dev/SKILL.md` (security, testing и Kit/RPC references) и `.agents/skills/proofpilot/SKILL.md` в **coach** mode: implementation routing, bounded plan → verification, evidence rules. Новый конкурсный score/assessment не запускался. Обязательное правило продолжения: перед существенной работой читать AGENTS и подходящие установленные SKILL.md/references; передавать то же правило агентам и сохранять ownership, review budget и stopping gate.

Ownership: `server/proposal-discovery.ts`, `server/chain-view.ts`, `tests/client/proposal-discovery.test.ts`, `tests/client/chain-view.test.ts`, этот документ. State/reconciliation/API/docs integration — ведущий агент; frontend — соседний чат. Program/IDL, dependencies/config, Git, signers, original ledger, server processes и реальные транзакции не менялись.

## Решение

1. `getAccountInfo` проверяет идентичность Bond и даёт нижнюю границу слота.
2. `getProgramAccounts` получает только 48-byte identity header: Anchor discriminator (8), Bond pubkey (32), u64 ID (8). Запрос использует `confirmed`, `withContext:true`, `minContextSlot`, `dataSlice` и два `memcmp` фильтра (discriminator offset 0, bond offset 8).
3. Каждый результат проверяется локально: contextual response, safe nonnegative slot, array, entry/pubkey, program owner, non-executable account, canonical base64, точная длина, discriminator/bond, уникальный ID/address. Неполный, неподходящий либо устаревший ответ — ошибка, без catalog-only fallback. IDs сохраняются точными decimal strings, сортируются по BigInt. Canonical PDA проверяется только у предложений выбранного окна; остальные явно отмечены как PDA-unverified.
4. On-chain header IDs объединяются с локальными. Из union детерминированно выбираются первые 32 по числовому ID; число всех найденных, выбранных и пропущенных предложений публикуется явно. Сам program не ограничивает количество proposal32: 33-е и следующие валидные предложения больше не блокируют финансовый view. Вместе с maximum registry/schedule сохраняется максимум 62 читаемых аккаунта. Local catalogue вне окна и отсутствующие в discovery ID сохраняют отдельную диагностику.
5. Единственный `getMultipleAccounts` читает все финансовые аккаунты, включая полные Proposal, при `minContextSlot >= discovery.contextSlot`. Полные proposal проверяются ещё раз по owner, discriminator, bond и proposal ID. Финансовые поля никогда не берутся из discovery RPC.
6. Повторный `getProgramAccounts` после финансового bank использует его слот как lower bound. Изменение proposal set/local ID set, изменение Bond graph либо исчезновение ранее обнаруженного Proposal отбрасывает снимок. Максимум 3 попытки, затем retryable `CHAIN_VIEW_CHANGED`. Устаревший/некорректный RPC response и RPC errors немедленно сохраняют ошибку.

## Точный контракт покрытия

`ChainView.proposalDiscovery` содержит:

```ts
{
  source: 'program-accounts', commitment: 'confirmed', scope: 'discovery-slot',
  contextSlot: number, verificationContextSlot: number, financialContextSlot: number,
  discoveredIds: string[], catalogIds: string[], queriedIds: string[],
  selection: 'lowest-proposal-id', discoveredCount: number, selectedIds: string[],
  selectedDiscoveredCount: number, omittedDiscoveredCount: number, omittedCatalogIds: string[],
  catalogIdsAbsentAtDiscovery: string[], unverifiedPdaCount: number,
  maxProposals: 32, completeAtFinancialContext: false
}
```

Одинаковые списки на двух discovery slots — наблюдение именно в этих двух banks. Это не обещание полного списка в более позднем/промежуточном financial bank. `minContextSlot` — нижняя граница; он не закрепляет все RPC за одним bank. Provider honesty, omission by malicious RPC и confirmed-fork finality не доказываются клиентской проверкой. `discoveredIds` содержит все cheaply validated headers; canonical PDA доказана только у выбранных on-chain IDs. `unverifiedPdaCount` равен числу пропущенных chain headers. Их деньги/голоса не читаются и не используются.

Catalog-only missing IDs выбранного окна сохраняются в `missingProposalIds` на financial context. `catalogIdsAbsentAtDiscovery` сообщает отсутствие локальных ID в discovery slot, включая ID вне окна; это не утверждение отсутствия в более позднем финансовом bank. `omittedCatalogIds` не смешивается с missing: среди пропущенных могут быть существующие on-chain предложения. Выбранный обнаруженный chain ID, отсутствующий в coherent bank, не выдаётся как обычное предупреждение каталога: снимок повторяется/отклоняется. До/после сравнивается SHA-256 fingerprint **всех** отсортированных header identities, включая пропущенные.

## Проверено

- Current independent repair 1: `node --import tsx --test tests/client/proposal-discovery.test.ts tests/client/chain-view.test.ts`: **25/25 passed, 0 skipped**. Только синтетические RPC и отдельные `.local/tests/...` namespaces. `npm run typecheck` теперь passed; scoped `git diff --check` passed.
- Новые regression cases: 40 on-chain proposals сохраняют coherent cash state и finite32 graph; combined catalog overflow не даёт503; более32 local IDs сохраняют missing/omitted diagnostics; незадействованный PDA вне окна не объявляется проверенным; malformed/duplicate omitted header отклоняется; изменение вне окна тоже меняет fingerprint и вызывает retry.
- Historical pre-review checkpoint: **22/22 passed, 0 skipped**. Независимый critic затем нашёл valid33 availability regression; этот первоначальный результат не доказывал корректность за пределами32.
- Покрыты: неизвестные каталогу proposal; новые proposal во время чтения; order-independent stable set; повторная смена набора/исчезновение до bounded failure; combined32 capacity; полный u64 ID; malformed envelopes/base64/discriminator/bond/PDA/duplicates; ошибки и stale context; последовательные slot floors; неизменный coherent source всех сумм и голосов; прежние transfer/redemption/reconciliation checks.
- `git diff --check` для назначенных tracked файлов: passed. Diff просмотрен; новые файлы также просмотрены.
- Historical first typecheck: собственная ошибка narrowing была исправлена; тогда shared checkout сообщал две параллельные ошибки `tests/client/servicing.test.ts:19:66` и `:49:47` (`string` vs `Address<string>`). Ведущему агенту передано; этот чужой файл не менялся. Current repair typecheck passed; API/built-origin proof после интеграции выполняет lead.

Первый scoped test run дал 20/21 из-за несовпадения ожидаемого кода ошибки для 47-byte заголовка; классификация exact-length/canonical-base64 исправлена. Затем 21/21; после добавления проверки slot propagation — 22/22. Это инженерные итерации текущего implementation scope, не перезапуск прошлой формальной оценки.

First independent repair сохраняет новое critic finding: первоначальная версия отклоняла любое valid33/combined33 и делала недоступными все финансовые routes. Исправление — explicit deterministic window и честный scope, без изменения program или cash semantics. Старый review lineage не сбрасывался. Reused unchanged skills: solana-dev security/testing и ProofPilot coach; AGENTS/latest state перечитаны. Непрерывное изменение полного proposal set по-прежнему может дать bounded `CHAIN_VIEW_CHANGED`; RPC/provider scan limits и объём дешёвого чтения всех headers остаются ограничениями GPA, хотя дорогие PDA derivations ограничены выбранными32.

## Источники и остаточные проверки

Официальные страницы Solana прочитаны 2026-10-08:

- [getProgramAccounts](https://solana.com/docs/rpc/http/getprogramaccounts): фильтрация program-owned accounts, параметры `withContext`, `minContextSlot`, `dataSlice`, `filters` и contextual envelope.
- [getMultipleAccounts](https://solana.com/docs/rpc/http/getmultipleaccounts): ordered response, contextual read, `minContextSlot`, максимум 100 адресов.

Реальные RPC совместимость фильтров, built-origin API propagation, данные существующих выпусков и полный backend suite в этом subtask не проверялись. Следующий шаг lead: экспортировать coverage в state/reconciliation, выполнить общий typecheck и read-only localnet/built-origin discovery proof. При отказе провайдера поддержать scan возвращать ошибку; не замещать её пустым либо local-only списком.

Stopping gate сохраняется: без mainnet/реальных средств/платных сервисов, без изменения private visibility или final submission; пользовательские данные и исторические evidence сохраняются. Не объявлять isolated tests подтверждением production/readiness или реальной конкурсной подачи.
