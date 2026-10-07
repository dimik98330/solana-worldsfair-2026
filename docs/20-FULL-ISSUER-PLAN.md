# Полный кабинет эмитента — продолжение активной цели

На 8 октября 2026 пользователь поручил автономно довести frontend/backend и материалы до полного задания KASE. Предыдущий localnet цикл — работающий прототип, но не доказательство завершения всей цели. Предыдущий ход дал progress: реальные проверки, видео и private push. Цель остаётся active.

Выбран ProofPilot coach (plan → review) и установленный solana-dev. Новая задача закрывает конкретный пробел: создание выпуска/держателей/распределение/резерв/seal доступны через сценарий seed, а не через полный операторский интерфейс. Новизна не заявляется без доказательств. Приоритет — пригодный к воспроизведению workflow и точные права, не дополнительные несвязанные функции.

## Порядок

1. P11: unsigned issuer administration API — initialize_issue, register_holder, issue_units, fund_vault, seal_issue. Проверять mint, UTF-8, суммы, даты, authority и состояния. Подписывает выбранный wallet; generated signer только в явно отмеченном локальном демо.
2. P12: Issuer desk — формы условий/держателей/выдачи, сумма полного резерва и дефицит, явная активация. Реальные simulation/fee/confirmation перед сменой стадии. Полный schedule до 8 купонов, registry до 16.
3. P13: каталог выпусков и request-scoped выбор инструмента. Подтверждённая цепочка — источник identity/state; metadata не доказывает существование. Pending/unknown сохраняются; выбор выпуска не разрешает повторную подпись.
4. P14: реальный unsigned-message signing/relay smoke с generated test clients, issuer operations и дальнейшими corporate actions. Его не выдавать за подпись человека. Проверить browser/mobile/forms/reload/failures.
5. P15: обновить материалы по новому доказанному поведению, сохранить старый cutoff/ролик как историю. Отдельно завершить доступ жюри, devnet и registration/submission; их не объявлять passed по локальным тестам.

## Ownership и контракт

Lead: server/index/actions/state/transactions/prepared/store, root config/dependencies/Git, интеграция App/API/types и docs/state. Backend agent: только server/admin.ts, server/catalog.ts, tests/client/admin.test.ts и свой report. Frontend agent: только новый IssuerSetup.tsx/issuer.css и свой report. Reviewer: только отдельный report, без mutation/signing/shared UI.

Backend builder возвращает инструкции, bondAddress, proofAccount, summary и эффект metadata, привязанный к actor/series/mint/transaction. Catalog обновляется только после confirmed и проверки actual on-chain identity. Fixture текущего записанного demo не перезаписывается новым выпуском. Запрос выбора инструмента несёт bondAddress, не меняет глобальный fixture.

Новые endpoints остаются loopback/test-network. Mainnet/реальные деньги/paid services/ключи человека не разрешены. «Полный доступ» разрешает необходимую разработку и проверки, но не заменяет CAPTCHA, account/Terms/KYC consent и факты регистрации. Отдельный ранее заданный вопрос публикации сохраняется; неизвестный ответ не считается разрешением.

Definition of done: весь issuer workflow выполнен через проверяемые prepared transactions, данные читаются с chain после restart/reload, malicious/malformed/unauthorized/duplicate cases отвергнуты, корпоративный цикл нового выпуска завершён. Тесты frozen старого demo сами по себе этот новый этап не доказывают.
