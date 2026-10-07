# BondTrace — состояние на 8 октября 2026

Пользователь выбрал KASE и поручил полноценный проект с красивым интерфейсом и подготовкой подачи. Прежний этап «только промпт 1» завершён; выбор A/B/C сохранён как история. Продолжать текущую реализацию, не начинать исследование заново.

## Пути и разрешения

- Корень: C:\Users\dmitrii\Documents\solana.
- ProofPilot source: C:\Users\dmitrii\Documents\proofpilot-source; v0.3.0, commit e6c2a3c7af6b509cd5648884a017a610e68c739c, раскрытая Windows-поправка fsync.
- Skills: C:\Users\dmitrii\Documents\solana\.agents\skills; 42 обнаруженных хостом скилла. Установка полная и повторного запуска не требует.
- GitHub: только dimik98330. Origin https://dimik98330@github.com/dimik98330/solana-worldsfair-2026.git, репозиторий private. Connector zi-radio не использовать для записи.
- Разрешены локальная реализация, localnet/devnet, бесплатные инструменты и отдельные тестовые подписанты. Mainnet, реальные активы, платные услуги и публикация private-репозитория не разрешены.
- Superteam login подтверждён в Chrome, форма KASE прочитана. Ничего не отправлялось; согласия не принимались. IAB имеет отдельную неавторизованную сессию.

## Работающий продукт

BondTrace — кабинет корпоративных действий для permissioned тестовых облигаций. Купонные права фиксируются на record date и сохраняются после перевода/погашения. Principal выплачивается текущему держателю с атомарным burn. Голосование использует собственный snapshot и один ballot на владельца; оно информационное.

Anchor1.1.2, classic SPL Token, максимум16 зарегистрированных держателей/8 купонов. Полное prefunding principal + всех купонов перед seal; нет issuer withdrawal. React19.3/Vite8.3/TS7, Kit8.4/Wallet Standard, loopback Node API. Guided demo с generated test signers явно отделён от My wallet.

## Этапы и доказательства

| Этап | Статус | Проверка |
|---|---|---|
| P01 требования/форма | Завершён, подача впереди | docs08/14; обязательны все3 действия |
| P02 архитектура/ревью | Завершён в пределах прототипа | docs09/11; исходный review +2 repairs |
| P03 compiler/SBF/IDL | Passed; новые WSL build/test wrappers также проверены | Реальный SBF463096bytes, generated IDL |
| P04 вертикальный срез | Passed localnet | Реальные подписи, preview, simulation, confirmed state |
| P05 купон | Passed localnet | 10 recorded →500; после transfer8 current, право остаётся500 |
| P06 погашение | Passed localnet | 18000 principal paid,18 burned, supply/vault0 |
| P07 голосование | Passed localnet | Вес10, повторный ballot rejected |
| P08 UI | Passed в проверенном scope | Весь цикл через браузер;375/768/1280; Escape/no-wallet |
| P09 integration | Passed localnet; devnet blocked | Два разных сохранённых цикла, Node9/9 +UI5/5 |
| P10 материалы | Финальная сборка и review | Видео174.021s и локальная страница готовы; независимое финальное review идёт |

Program ID B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8.
SBF SHA25615525ec2de285e7cc3065f7ec8ce47bfe81d1ed2837754b85b8cf2598c935dc2.
Rust unit3/3, SBF runtime5/5. Измеренная транзакция максимум884bytes/84584CU в документированных запусках. В16-holder fixture первоначально только2 nonzero holders; все16 positive/8 coupons/max title не benchmarked.

API cycle: docs/evidence/full-smoke-localnet.json, issue C9KpFDHagCG3sNi6FJqFx3RTaUW38oLqkUFkxpFLUuhN,11 confirmed actions после setup.
Browser cycle: docs/evidence/browser-cycle-localnet.json, issue5knY93zt91XKMqnxz2ukXGHVzx6Ro9vgKsrcrT3RbhJU;16 activity после создания, включая setup. Купон900, principal18000,18 burned/vault0, yes weight10. Не смешивать доказательства разных выпусков.
Screenshots docs/evidence/ui; raw actual-action frames ignored в docs/evidence/ui/recording. Responsive — эмуляция viewport, не физический телефон. Human-wallet signing и отмена реальной подписи ещё не проверены.

Transport regression4 tests используют isolated mocked RPC, не добавляют фиктивные receipts в demo fixture. Unknown после потерянного RPC response сохраняет signature и блокирует новую подпись. Null после срока blockhash не доказывает, что транзакция не исполнилась. Историческая recorded-confirmation отдельно от свежего live-rpc read.

## Процессы

- Validator: отдельный скрытый Windows process22584, WSL Ubuntu, ledger .local/bondtrace-validator. RPC127.0.0.1:8899, WS8900. Сохранённый ledger восстановлен с исходным относительным путём; reset/delete не выполнялись.
- API/Vite: exec session43602, API127.0.0.1:3000 и web5173. Нужны для текущего UI; не дублировать.
- Страница материалов: exec session51503, http://127.0.0.1:5180. Native video playback/byte ranges/VTT и375px layout проверены; это локальный preview, не public site.
- Toolchain только WSL в /home/dmitrii/.local/bondtrace-tools и /home/dmitrii/.cargo; Codex и Node native Windows.

## Внешние gates

Devnet payer BWpCPnVVzxPA1oTebFyfCjbk8wgTXLdjQWwY1ckjzqHS: последний read balance0. Rent2.35423964 test SOL плюс fees; рекомендуются3 test SOL. Две airdrop попытки закончились Internal error/429, повторы остановлены. Read-only PoW feasibility не дала применимого бесплатного funding. Владельцу уже отправлена async-инструкция official faucet; ждать ответа, не спрашивать повторно. Подготовлен funding-gated ignored deploy script; devnet deployment signature отсутствует.

Регистрация/проект/подача в основном Colosseum не подтверждены. Copilot authorization не является регистрацией. Сегодня8окт — ближайший опубликованный день регистрации KZ, час неизвестен. Global deadline12окт23:59PT =13окт11:59UTC+5. KASE публичные материалы и подтверждение global участия обязательны.

Частный repo не становится public автоматически. Перед изменением visibility или public hosting подготовить конкретный безопасный вариант и запросить решение владельца в самом конце. Final Terms, scope и Kazakhstan KYC checkboxes — владелец подтверждает при действии. Не нажимать Submit до готовых материалов и согласий.

## Преемственность

В новом чате читать AGENTS, START, STATE и актуальные spec/architecture/UX/security/plan, git status и последние commits. Перед существенной задачей выбрать и прочитать профильные установленные SKILL.md: ProofPilot coach для продукта/readiness/submission, solana-dev для chain/tooling, frontend/design для UI, профильные проверки. Передавать правило всем субагентам и сохранять checkpoint.

Lead отвечает за root dependencies/config/Git/API/docs; program agent — programs/Rust tests/docs09/11; frontend — apps/web/docs10; demo agent — artifacts/demo и docs18; critic — отдельный report. Не допускать одновременных edits одной зоны. Architecture review initial+2 repairs завершён, бюджет не сбрасывать. Integration review initial+repair1 завершён; новые browser/video данные — отдельное финальное evidence, не попытка поднять старый score. Initial Prompt1 accepted — история, не сертификат KASE readiness.
