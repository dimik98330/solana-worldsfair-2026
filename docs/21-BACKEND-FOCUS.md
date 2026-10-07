# Backend BondTrace — точное обслуживание корпоративных действий

8 октября 2026 пользователь остановил дальнейшее расширение интерфейса и поручил полностью усилить backend по [заданию KASE](https://superteam.fun/earn/listing/superteam-kazakhstan-x-kase-side-track-corporate-actions-on-blockchain). Страница перечитана в открытом браузере; публичная часть сохранена отдельно от account header в .local/backend-focus/kase-source.txt. Общая регистрация/финальная подача не относятся к завершённым фактам backend.

## Подтверждённое задание

Цикл: eligible holders → exact entitlement → execute/initiate → on-chain outcome. Нужны test instrument, registry, record date, coupon, maturity redemption с retirement и дополнительное действие. Наше действие — bondholder voting. Fiat rails можно моделировать, но Solana logic обязана работать; simulated и implemented различаются явно. Пример:10×1000×10%÷2=500 coupon; principal10000 плюс последний coupon. Отсутствует требование настоящих клиентских средств или интеграции с банковским/KASE API.

## Текущий проверенный baseline

- Предыдущий ход был progress: полный issuer API/desk, подтверждённый 19-action unsigned relay cycle с двумя coupons; GUI create/register/issue/reserve/seal/capture/vote/coupon/redemption,11 confirmed действий нового выпуска6u2…;150coupon/3000principal,3burned/vault0.
- 48 Node/UI tests прошли. Program unit3/3 + runtime7/7, в том числе16positive holders/8coupons/128payments и реальный откат failed payment CPI после burn. Это не human-wallet/devnet/production certification.
- Существующие code/evidence и wallets сохраняются; после interruption GET подтвердил финальное состояние. Старые документы/видео и bounded review budgets — история, не аттестация новой реализации.

## Реальные пробелы и план

1. B01 — coherent chain view. Сейчас state читает Bond/Clock/holder accounts отдельными RPC: transfer или redemption между чтениями могут дать смешанные цифры. Получать весь граф одним getMultipleAccounts context после discovery; registry/term change требует bounded retry. Fail closed при несогласованных supply/rights/masks, не подставлять нули.
2. B02 — финансовая сверка. Проверять current holdings=mint supply=issued−redeemed; snapshot units и paid masks; principal claimed units; полный reserve и gap. Разделить forecast до record capture, immutable accrued entitlement и claimable after payment. Деньги — u64 base units/BigInt, JSON string и точная decimal presentation, никакого float.
3. B03 — durable operations. Заменить ограниченные перезаписываемые JSON journal на transactional local SQLite. Сохранить/import existing public metadata без удаления оригинальных файлов, ключи не читать/import. Pending/unknown не вытесняются history limits; signature/lifetime/activity фиксируются атомарно до send. SQLite built-in реально доступен в Node22.14; выбрать безопасный journal по фактической bundled version, без новых внешних dependencies.
4. B04 — точный request contract. Явные обязательные суммы и идентификаторы; canonical params для idempotency, исключить молчаливые финансовые defaults. Недоступная fee/RPC information не равна0. Ошибки после confirmed остаются recovery-required, а не разрешением повторной подписи.
5. B05 — доказать поведение. Isolation/unit + concurrency/restart/crash boundaries; реальный localnet cycle через built origin и persistence restart; сравнить все существующие выпуски до/после. Обновить API/README/STATE/evidence, inspect diff/secret scan, сохранить private GitHub dimik98330.

Owner: Lead — integration/API/config/operations/transactions/Git/docs. Read-model worker — state/chain-view/reconciliation + scoped tests. Storage worker — storage module/tests. Independent critic — read-only report. Перед substantial task каждому обязательны AGENTS/STATE и выбранные установленные skills: ProofPilot coach и профильные Solana/security/testing. Не менять program/IDL/front design/кошельки/active ledger без причины.

Definition of done: обязательный KASE цикл работает, read numbers относятся к одному chain context, все financial identities проверены, recovery state survives restart и не даёт двойных действий, malformed/adversarial inputs reject до отправки, existing data/evidence сохранены, новые contracts/reproduction проверены. Не заменять это только зелёными isolated тестами. Цель active; UI design expansion остановлено по запросу пользователя.
