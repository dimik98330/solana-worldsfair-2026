# Среда, ProofPilot и подключения

Проверено 07.10.2026. Это настройка native Windows, не WSL. Продукт: `C:\Users\dmitrii\Documents\solana`. Источник ProofPilot: `C:\Users\dmitrii\Documents\proofpilot-source`. Skill root: `C:\Users\dmitrii\Documents\solana\.agents\skills`.

## Выполненные проверки

| Проверка | Результат |
|---|---|
| OS / shell | Windows 10.0.28000; PowerShell 7.6.5 |
| Node / npm / Git | 22.14.0 / 10.9.2 / 2.54.0.windows.1 |
| Codex | CLI/app-server 0.154.0; multi_agent=true; 3 роли запущены, критик отдельно |
| gh / Rust / Cargo / Solana CLI / Anchor | Не найдены в PATH; для этого этапа установка не нужна |
| npm ci --ignore-scripts | Успешно; 6 packages audited, 0 vulnerabilities на момент проверки |
| npm test источника | FAILED: CRLF generated docs, затем locale-dependent digest fixture. Полный test suite не прошёл |
| inspect | Успешно, версия 0.3.0 |
| dependencies --status | complete=true; full; 36 installed; 12 assets installed; pending_transaction=false |
| capabilities | 36 поддерживающих навыков обнаружены по фактическим путям |
| Codex skills/list, forceReload | 42 project skills enabled; errors=[]; отдельный read-only app-server, без запуска модельного задания |
| Colosseum | V2 status HTTP200, evidence:read; 6 поисков и 3 карточки HTTP200. Это проверка corpus, не спроса |
| Browser | Страница Solana прочитана; реальный screenshot получен через cua_repl |

Исходный package scripts проверен до npm. Первый installer не активировал частичную установку: Git fetch ETHGlobal дважды завис; отдельная probe также зависла. Использован HTTPS fallback по тем же пяти commit: 283 файла проверены по Git blob SHA из commit-bound tree. Штатный installPackage выполнил ownership, transaction, adaptation и completeness проверки. [Хеши источников](setup/source-integrity.json).

Обнаружен Windows-дефект fsync: read-only file handle даёт EPERM. Две операции открытия изменены на r+ только для Windows; flush не отключался, права Codex не менялись. Узкий тест воспроизвёл EPERM до исправления, затем syncPreparedTree прошёл, байты неизменны. [Локальный патч](setup/proofpilot-windows-fsync.patch). Это локально исправленный snapshot, не неизменённый upstream и не доказательство прохождения полного npm test.

## Интеграции

| Возможность | Источник и назначение | Доступ/стоимость | Реальный результат |
|---|---|---|---|
| Solana Developer MCP | https://solana.com/docs/intro/coding-with-agents ; https://mcp.solana.com/mcp | Публичная документация без API key. Только list_sections/get_documentation/Solana_Documentation_Search; без кошелька | HTTP initialize/tools-list/list_sections успешны, server v2.0.0. Codex config solana-docs enabled; автоматическое появление MCP-tools в уже открытом чате не подтверждено |
| GitHub | Git Credential Manager + GitHub REST /user и /user/repos | Уже сохранённый аккаунт dimik98330. Приватный repo, без дополнительного MCP/gh | Identity подтверждена, repo private=true. zi-radio connector не используется |
| Colosseum | Официальный copilot-connect 0.2.2; protected helper store | Владелец завершил browser flow. Grant: evidence:read, telemetry:write, self-data:read. Использовались только чтения, без telemetry/upload/Frames/платежей | Live V2 verified 17:24:29 UTC; corpus HTTP200 17:26–17:28 UTC |
| Браузер | Уже имеющийся cua_repl/IAB | Дополнительных аккаунтов/платных сервисов не подключали | Навигация, чтение страницы, screenshot прошли |
| Context7 | Не подключён | Пробела официальной документации пока нет | Не проверялся и не требуется |

MCP добавлен штатным codex mcp add; существующие серверы и global permissions сохранены. Allowlist ограничен тремя документационными инструментами. Откат только этой интеграции: `codex mcp remove solana-docs`. Наличие MCP в конфиге не заменяет его smoke.

## Полный каталог навыков

Все строки проверены installed и обнаружены хостом; установка не означает выполнение каждого workflow. Версии фиксируются commit; отдельные version приведены там, где заявлены upstream.

| Скилл | Назначение | Версия / commit | Фактический путь | Статус |
|---|---|---|---|---|
| proofpilot-submission-builder | Заявка; не запускался | 0.3.0 / e6c2a3c7af6b + Windows fix | `C:\Users\dmitrii\Documents\solana\.agents\skills\proofpilot-submission-builder` | installed; host enabled |
| proofpilot-readiness-review | Проверка готовности | 0.3.0 / e6c2a3c7af6b + Windows fix | `C:\Users\dmitrii\Documents\solana\.agents\skills\proofpilot-readiness-review` | installed; host enabled |
| proofpilot-mvp-planner | Планирование; не запускался | 0.3.0 / e6c2a3c7af6b + Windows fix | `C:\Users\dmitrii\Documents\solana\.agents\skills\proofpilot-mvp-planner` | installed; host enabled |
| proofpilot-venture-validation | Валидация | 0.3.0 / e6c2a3c7af6b + Windows fix | `C:\Users\dmitrii\Documents\solana\.agents\skills\proofpilot-venture-validation` | installed; host enabled |
| proofpilot-idea-discovery | Поиск идеи | 0.3.0 / e6c2a3c7af6b + Windows fix | `C:\Users\dmitrii\Documents\solana\.agents\skills\proofpilot-idea-discovery` | installed; host enabled |
| proofpilot | Основной router | 0.3.0 / e6c2a3c7af6b + Windows fix | `C:\Users\dmitrii\Documents\solana\.agents\skills\proofpilot` | installed; host enabled |
| animation-reverse-engineering | Разбор и перенос анимаций | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\animation-reverse-engineering` | installed; host enabled |
| brand-design | Бренд, палитра и типографика | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\brand-design` | installed; host enabled |
| build-data-pipeline | Индексация и обработка данных | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\build-data-pipeline` | installed; host enabled |
| build-defi-protocol | DeFi-программы и их риски | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\build-defi-protocol` | installed; host enabled |
| build-mobile | Мобильные Solana-приложения | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\build-mobile` | installed; host enabled |
| build-with-claude | Общие build-инструкции; другой AI не разрешён | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\build-with-claude` | installed; host enabled |
| cso | Проверка безопасности | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\cso` | installed; host enabled |
| debug-program | Отладка Solana-программ | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\debug-program` | installed; host enabled |
| design-taste | Визуальная оценка дизайна | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\design-taste` | installed; host enabled |
| frontend-design-guidelines | Интерфейс и состояния | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\frontend-design-guidelines` | installed; host enabled |
| launch-token | Выпуск токена; не запускался | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\launch-token` | installed; host enabled |
| navigate-skills | Подбор скиллов и каталогов | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\navigate-skills` | installed; host enabled |
| number-formatting | Корректное отображение сумм | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\number-formatting` | installed; host enabled |
| page-load-animations | Анимации интерфейса | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\page-load-animations` | installed; host enabled |
| product-review | UX, onboarding, продуктовая проверка | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\product-review` | installed; host enabled |
| review-and-iterate | Ревью кода и исправления | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\review-and-iterate` | installed; host enabled |
| roast-my-product | Критический разбор продукта | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\roast-my-product` | installed; host enabled |
| scaffold-project | Стартовая структура приложения | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\scaffold-project` | installed; host enabled |
| verify-humanity-poh | Proof of Humanity; не подключался | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\verify-humanity-poh` | installed; host enabled |
| virtual-solana-incubator | Обучение Solana | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\virtual-solana-incubator` | installed; host enabled |
| competitive-landscape | Конкуренты и заменители | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\competitive-landscape` | installed; host enabled |
| defillama-research | Публичные DeFi-данные | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\defillama-research` | installed; host enabled |
| find-next-crypto-idea | Поиск продуктовых направлений | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\find-next-crypto-idea` | installed; host enabled |
| learn | Обучение и сохранение выводов | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\learn` | installed; host enabled |
| solana-beginner | Основы для новичка | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\solana-beginner` | installed; host enabled |
| validate-idea | Проверка спроса и рисков | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\validate-idea` | installed; host enabled |
| apply-grant | Подготовка гранта; не запускался | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\apply-grant` | installed; host enabled |
| create-pitch-deck | Подготовка презентации; не запускался | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\create-pitch-deck` | installed; host enabled |
| deploy-to-mainnet | Инструкции deployment; mainnet запрещён | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\deploy-to-mainnet` | installed; host enabled |
| marketing-video | Маркетинговое видео; не запускался | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\marketing-video` | installed; host enabled |
| submit-to-hackathon | Подготовка подачи; не запускался | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\submit-to-hackathon` | installed; host enabled |
| video-craft | Демонстрационные видео | e81c26164503 | `C:\Users\dmitrii\Documents\solana\.agents\skills\video-craft` | installed; host enabled |
| solana-dev | Официальная разработка Solana (skill 2.5.0) | bb24c39dbdfc | `C:\Users\dmitrii\Documents\solana\.agents\skills\solana-dev` | installed; host enabled |
| colosseum-copilot | Поиск прецедентов, API V2 (skill 2.0.0) | 079bd44b0d4d | `C:\Users\dmitrii\Documents\solana\.agents\skills\colosseum-copilot` | installed; host enabled |
| ethglobal-skills | ETHGlobal research; paid paths запрещены | 88cc3afde256 | `C:\Users\dmitrii\Documents\solana\.agents\skills\ethglobal-skills` | installed; host enabled |
| openai-docs | Документация OpenAI; системный навык сохранён | 49f948faa925 | `C:\Users\dmitrii\Documents\solana\.agents\skills\openai-docs` | installed; host enabled |

## Общие assets

| Ресурс | Фактический путь | Статус |
|---|---|---|
| data/solana-knowledge | `C:\Users\dmitrii\Documents\solana\.agents\skills\data\solana-knowledge` | installed |
| data/guides | `C:\Users\dmitrii\Documents\solana\.agents\skills\data\guides` | installed |
| data/ideas | `C:\Users\dmitrii\Documents\solana\.agents\skills\data\ideas` | installed |
| data/colosseum | `C:\Users\dmitrii\Documents\solana\.agents\skills\data\colosseum` | installed |
| data/defi | `C:\Users\dmitrii\Documents\solana\.agents\skills\data\defi` | installed |
| data/specs | `C:\Users\dmitrii\Documents\solana\.agents\skills\data\specs` | installed |
| data/catalogs/clonable-repos.json | `C:\Users\dmitrii\Documents\solana\.agents\skills\data\catalogs\clonable-repos.json` | installed |
| data/catalogs/solana-skills.json | `C:\Users\dmitrii\Documents\solana\.agents\skills\data\catalogs\solana-skills.json` | installed |
| data/catalogs/solana-mcps.json | `C:\Users\dmitrii\Documents\solana\.agents\skills\data\catalogs\solana-mcps.json` | installed |
| SKILL_ROUTER.md | `C:\Users\dmitrii\Documents\solana\.agents\skills\SKILL_ROUTER.md` | installed |
| tone-guide.md | `C:\Users\dmitrii\Documents\solana\.agents\skills\tone-guide.md` | installed |
| data/licenses/solana-new-LICENSE.txt | `C:\Users\dmitrii\Documents\solana\.agents\skills\data\licenses\solana-new-LICENSE.txt` | installed |

## Ownership, воспроизведение, границы

Скиллы проекта принадлежат его .proofpilot-bundle.json и managed markers. В глобальном skill root существовал системный openai-docs; его не заменяли. Skills и .local исключены из Git. Никаких seed phrases, wallet keys или credentials в docs нет. Пять источников и полный commit каждого приведены в source-integrity.json; основной commit e6c2a3c7af6b509cd5648884a017a610e68c739c.

Перезапуск ради завершения исследования не требуется: host skill discovery выполнен, установленный SKILL.md явно прочитан. Если селектор текущего UI ещё показывает старый список, откройте следующий ход/чат в той же папке; не переустанавливайте bundle. Если новые MCP-tools не появились, перезапустите Codex и продолжите по AGENTS/STATE.

Devnet RPC read-only проверен технической ролью; продуктовые транзакции, компиляторы и пользовательские сценарии ещё не выполнялись. Программа SAS найдена executable, но это не проверка SDK/реализации.
