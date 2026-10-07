# Источники и границы доказательств

Все чтения относятся к 07.10.2026; точные corpus timestamps находятся в [архивной записке](research/colosseum-findings.md). Страницы открывались, а snippets не считались подтверждением. Слова поставщика о возможностях — reported, не наш runtime test.

| Источник | Дата чтения | Подтверждаемый тезис | Пробел |
|---|---|---|---|
| [splits](https://splits.org/protocol/help/split-contract/) | 2026-10-07 | Документация описывает распределение ETH/ERC20 по долям и изменяемую/неизменяемую конфигурацию. | Работоспособность/пользователи не проверены |
| [streamflow](https://streamflow.finance/) | 2026-10-07 | Первичная страница описывает Solana distribution, vesting, выплаты и SDK. | Работоспособность/пользователи не проверены |
| [itch](https://itch.io/docs/creators/payments) | 2026-10-07 | Direct mode платит одному аккаунту; collected mode поддерживает co-op bundles. | Работоспособность/пользователи не проверены |
| [x402_receipts](https://docs.x402.org/extensions/offer-receipt) | 2026-10-07 | Официальное расширение x402 уже предоставляет подписанные предложения и receipts. | Работоспособность/пользователи не проверены |
| [x402_idempotency](https://docs.x402.org/extensions/payment-identifier) | 2026-10-07 | В официальной документации есть расширение Payment-Identifier (Idempotency). | Работоспособность/пользователи не проверены |
| [x402api](https://x402api.com/docs/payments/x402/receipts) | 2026-10-07 | Vendor описывает signed finalized-payment record с business bindings. | Работоспособность/пользователи не проверены |
| [p402](https://p402.io/receipts) | 2026-10-07 | Vendor описывает per-event settlement receipts для AI на Base. | Работоспособность/пользователи не проверены |
| [repairdesk](https://help.repairdesk.co/portal/en/kb/articles/asset-management) | 2026-10-07 | Учет устройства включает repair history, IMEI/serial, tickets и activity log. | Работоспособность/пользователи не проверены |
| [arianee](https://www.arianee.com/en/platform) | 2026-10-07 | Vendor описывает паспорт, lifecycle history, ownership transfer, technician/reseller role. | Работоспособность/пользователи не проверены |
| [arianee_protocol](https://docs.arianee.org/docs/new-retrieve-databuild-wallet) | 2026-10-07 | Документация сочетает onchain и offchain passport data. | Работоспособность/пользователи не проверены |
| [guarantix_repo](https://github.com/guarantixnftdev/GuarantiX) | 2026-10-07 | Публичная страница репозитория открыта; наличие страницы не подтверждает runtime или все обещанные функции. | Работоспособность/пользователи не проверены |
| [gigsafe](https://gigsafe.pixxmo.com/) | 2026-10-07 | Страница с меткой DEVNET описывает gig, escrow funding, milestones, approval/release. | Работоспособность/пользователи не проверены |
| [solia](https://freelance.solia.network/) | 2026-10-07 | Страница описывает создать deal, fund escrow, complete/release. | Работоспособность/пользователи не проверены |
| [trustlesswork](https://github.com/Trustless-Work/trustlesswork-solana) | 2026-10-07 | Репозиторий описывает Solana milestone escrow и одно-/многоэтапные инструкции. | Работоспособность/пользователи не проверены |
| [hedera](https://docs.tokenization-studio.hedera.com/ats/user-guides/corporate-actions/) | 2026-10-07 | Официальная документация ATS описывает coupons, record dates, holder snapshots. | Работоспособность/пользователи не проверены |
| [tokeny](https://docs.tokeny.com/docs/solutions-overview-1) | 2026-10-07 | Enterprise tokenization suite; EVM и permissioned tokens. | Работоспособность/пользователи не проверены |
| [phantom](https://help.phantom.com/articles/19142125651731) | 2026-10-07 | Официальная помощь Phantom направляет Solana пользователя к Famous Fox's Revoker. | Работоспособность/пользователи не проверены |
| [compass](https://solanacompass.com/tools/revoke-token-approvals-solana) | 2026-10-07 | Vendor описывает delegate scan, amounts, batch revoke, SPL и Token-2022. | Работоспособность/пользователи не проверены |
| [superteam_ideas](https://superteam.fun/build/ideas) | 2026-10-07 | Открытая страница дала оболочку каталога без конкретных карточек идей. | Работоспособность/пользователи не проверены |

## Основные правила и техника

| Источник | Что проверено 07.10.2026 | Ограничение |
|---|---|---|
| [Источник](https://colosseum.com/worldsfair) | Конкурс и Solana Ecosystem Track | Заявка не отправлена |
| [Источник](https://colosseum.com/legal/Crypto%20World%27s%20Fair%20Hackathon%20Rules.pdf) | Возраст/ограничения, сроки, одна команда/проект, критерии | Не является проверкой личного допуска |
| [Источник](https://colosseum.com/hackathon) | Материалы, приватный код с доступом, reuse disclosure | Не подтверждает регистрацию пользователя |
| [Источник](https://superteam.fun/earn/listing/colosseum-crypto-worlds-fair-hackathon-superteam-kazakhstan-track) | Регистрация8/демо10/подача12, KZ и материалы | Нет часа/зоны местной регистрации |
| [Источник](https://superteam.fun/earn/listing/superteam-kazakhstan-x-kase-side-track-corporate-actions-on-blockchain) | Полный DOM: все3 сценария,8 минимумов, допускается simulated external rails, опубликованные веса | Web fetch был недоступен; browser успешно. API/sandbox не описаны |
| [Источник](https://kz.linkedin.com/company/solana-superteam-kz) | Совместимые местные треки; KASE/iDos контекст | Не переносим условия старого iDos2025 |
| [Источник](https://solana.com/docs/core/transactions) | Атомарные инструкции и подпись | Наш продукт ещё не посылал транзакций |
| [Источник](https://solana.com/docs/intro/coding-with-agents) | Официальный skill и MCP | Результат smoke отдельно в02 |
| [Источник](https://mcp.solana.com) | HTTP endpoint и документационные tools | Только3 read tools включены |
| [Источник](https://developers.openai.com/codex/skills) | Project .agents/skills, обнаружение | Реальный skills/list выполнен отдельно |
| [Источник](https://developers.openai.com/codex/mcp) | MCP конфигурация и allowlist | Не доказательство текущего model tool catalog |
| [Источник](https://developers.openai.com/codex/subagents) | Делегирование по разрешению | Реальные роли перечислены в05 |
| [Источник](https://github.com/Marakaya/proofpilot) | Pinned commit, package scripts, все требуемые instructions/manifest | Есть раскрытый локальный Windows patch |
| [Источник](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers) | Flush требует write-capable handle | Узкий smoke не заменяет full test suite |

## Прецеденты Colosseum

6 последовательных запросов × максимум5 результатов =30 выдач; это не30 прямых конкурентов. Прочитаны3 detail records: Fideox (доли), GuarantiX (гарантии), AgentGate (API payments). Их descriptions и archive summaries подтверждают пересечение идей; не подтверждают сегодняшнюю работу продукта. Оригинальные видео/бинарники нами не запускались. [Подробности и timestamps](research/colosseum-findings.md), [машинный реестр](research/product-sources.json).

## Что не установлено

Нет интервью, заявок на пилот, пользователей, дохода, willingness-to-pay, подтверждённого канала рекрутинга и product-market fit. Каталоги skills/MCP не доказывают спрос. Не проверены живые competitors flows, причины закрытия аналогов, полный рынок, платные Frames/Deep Dive, iDos2026 detailed eligibility, KASE API/sandbox, faucet и wallet signing нашего проекта. Нельзя считать неизвестное отсутствующим.

Технические URL, прочитанные специальной ролью, приведены с конкретными тезисами в [Solana research](research/solana.md) и [UX research](research/ux.md). Расхождение SAS package names сохранено как compatibility risk. Сам факт executable program account не доказывает SDK, security или соответствие исходникам.
