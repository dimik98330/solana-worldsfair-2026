# Colosseum V2: ограниченный поиск прецедентов

7 октября 2026. Шесть последовательных `search-projects --limit 5` и три `project --slug`, через штатный `scripts/colosseum-read.js` проверенного ProofPilot source snapshot `e6c2a3c7af6b509cd5648884a017a610e68c739c`. Все операции вернули `ok=true`, `operation_verified=true`, `http_status=200`. Секреты не выводились/не копировались; Deep Dive, Frames, платные операции и remote writes не использованы.

Корпус сообщает revision `e10bd0f2ecb268e18c06e26ad2e62f9de16ee5643478cb5e0b7e0d50baba5982`. `archiveIngestedAt=2026-10-07T08:42:40.567Z`; это дата загрузки архива, не дата повторного тестирования продукта. Известные sync timestamps карточек сохранены в `product-sources.json`.

## Поисковое покрытие

| UTC checked_at | Запрос | Возвращенные пять названий |
|---|---|---|
| 17:26:33.562 | revenue split game team payment | Splitter; Fideox; SplitPact; Fuel-app; Koltena |
| 17:27:05.477 | repair warranty product passport issuer | Smart Product Passport; GuarantiX; Safeout; CERTIFY; QR Auth |
| 17:27:09.412 | one milestone freelance escrow | PIVOX; WorkProof Pay; SHIELD-PAY; Trustless Work; Nexcrow |
| 17:27:13.080 | AI agent API payment receipts audit | AgentGate; AgentPay; Payjent; OpenSecondBrain: Pay Memory for AI Agents; Prova |
| 17:27:16.006 | tokenized bond coupon corporate actions | Lacus; Bond Hive; Action Finance; Moose.Capital / Blinks; 20APY |
| 17:27:19.046 | token delegate approval revocation wallet | Blockpal Smart Delegation; Flame App; SMART WALLET; OrbLocker; Multisig Wallet |

Это **30 результатов, а не 30 прямых конкурентов**: семантический поиск возвращает и слабые совпадения. Например, bond yield product не равен корпоративным действиям, а EVM firewall не равен Solana delegate revoker. Scores similarity/crowdedness из API не использованы как конкурсные баллы, доля рынка или доказательство спроса. Пагинация не продолжалась. Историческая заявка не подтверждает текущий live status и число пользователей; `isWinner=false` не доказывает провал бизнеса.

## Три прочитанные полные карточки

### Fideox — 2026-10-07T17:27:57.705Z

Источник: [Colosseum](https://colosseum.com/projects/explore/fideox); оригинальный pitch locator: [видео](https://youtu.be/RK5Mg1ACYjM). Поле `description`, точная короткая выдержка: **“USDC revenue splits on Solana for teams”**.

**Reported карточкой/архивом:** Frontier, команда из одного участника; разделение USDC между участниками по onchain долям, роли, проектный бюджет, внешний contract URL/hash, sign-offs и история. Pitch summary описывает до восьми участников и devnet-интерфейс. В том же summary прямо ограничено доказательство: walkthrough использовал одинаковые адреса в разных ролях и не показал фактическую distribution-транзакцию. `repoSummary=null`, Github в карточке помечен непубличным.

**Наш вывод:** идея «маленькая команда, проценты, USDC, прозрачная история» уже практически совпадает. Проверяемый живой платеж нашего MVP мог бы улучшить качество демонстрации, но сам по себе не создает новый пользовательский продукт. Не утверждать, что Fideox не умеет платить сегодня.

### GuarantiX — 2026-10-07T17:28:00.618Z

Источник: [Colosseum](https://colosseum.com/projects/explore/guarantix); [публичный repo](https://github.com/guarantixnftdev/GuarantiX); [demo locator](https://www.youtube.com/watch?v=p0zfXT5DrCc). Поле `description`, точная выдержка: **“A digital warranty system using NFTs.”**

**Reported карточкой/архивом:** Breakout, переносимая NFT-гарантия с датой, моделью, сроком и продавцом. Demo summary описывает wallet connection, ввод warranty fields, mint prompt и отображение сертификата. Pitch summary также заявляет extend/revoke/modify через brand addresses; это нельзя автоматически считать реализацией, поскольку demo summary показывает более узкий mint-сценарий. Repo summary говорит, что в его input не было business-logic файлов `/src`; наличие зависимостей не доказывает работоспособность.

**Наш вывод:** переносимость, Solana и даже заявленный отзыв не являются достаточным отличием. Понадобятся реальная мастерская и проверка полезности ее процесса исправления/отзыва. Полные videos и код этой ролью не запускались.

### AgentGate — 2026-10-07T17:28:03.839Z

Источник: [Colosseum](https://colosseum.com/projects/explore/agentgate); [repo locator](https://github.com/Lin-xun1113/AgentGate); [demo locator](https://www.loom.com/share/3c11decf20054b7abaa95e288f289ca4). Поле `description`, точная выдержка: **“AgentGate is a spend governance gateway for AI agents calling paid tools.”**

**Reported карточкой/архивом:** Frontier; gateway, per-call/daily budgets, allowlist, payment headers, idempotency и аудит состояний. Repo summary различает memory/SQLite storage для receipts и отдельный **in-memory idempotency recorder**. Demo summary явно говорит о mock payment mode; настоящий onchain settlement в демонстрации не показан. Это не означает, что весь продукт только in-memory, или что сегодня live-интеграции нет.

**Наш вывод:** «budget + retry + receipt dashboard» тоже повторяет существующий сценарий. Только narrow failure reconciliation с проверенной Solana-оплатой и настоящим пользовательским случаем заслуживает дальнейшего теста. Само улучшение mock до devnet — критерий честного демо, не доказательство спроса.

## Проверяемые ограничения

- На этом ограниченном поиске не просмотрены оригинальные ролики, не запускались конкуренты и не доказана их текущая production-готовность.
- Точные карточки содержат автоматические evidence summaries с `extractorVersion=archive-gemini-v1`. Эти пересказы помечены reported; не выдаются за прямые наблюдения исследователя.
- Причины закрытия/неудачи проектов не установлены. Отсутствие награды, обновлений или публичного repo не трактуется как закрытие.
- Нет основания писать «аналогов нет», «рынок свободен», «есть спрос» или «выигрыш вероятен».
- Следующее решение — выбор владельцем направления для ограниченного теста. Создание продукта, outreach и подача не выполнены.

Передача продолжению: читать проектный AGENTS и актуальный STATE, выбирать/читать установленные навыки до существенной работы; ProofPilot coach обязателен для продукта. Сохранять уже пройденный corpus-поиск, не повторять его без нового вопроса или свежих данных.
