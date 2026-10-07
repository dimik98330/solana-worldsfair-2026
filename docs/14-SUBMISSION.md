# KASE — материалы и поля заявки

Официальная форма прочитана7октября2026 в авторизованном Chrome. Login подтверждён. Checkbox и Submit не нажимались. На8октября публичный web fetch listing недоступен; повторная Chrome-проверка столкнулась с ошибкой политики браузерного сервиса. Это не означает выход пользователя из аккаунта. Сохранённые требования ниже не подменяются догадками.

Источник: https://superteam.fun/earn/listing/superteam-kazakhstan-x-kase-side-track-corporate-actions-on-blockchain . Все три сценария обязательны: купон, maturity redemption и дополнительное действие. Нужны test instrument, holders, record date, точные entitlements, settlement и проверяемый on-chain outcome. External fiat rails могут быть simulated; сама логика и Solana flow должны работать. Наше дополнительное действие — informational bondholder voting.

## Поля формы

| Поле | Обязательно | Подготовленный материал / gate |
|---|---|---|
| Link to Your Submission | Да, доступно всем | Предлагается статическая страница recorded demo/evidence; пока только localhost5180 |
| Tweet Link | Нет | Не создавался |
| Project Name | Да | BondTrace |
| Project Description | Да | Английский текст ниже |
| Project Github Link | Да | https://github.com/dimik98330/solana-worldsfair-2026 — сейчас private |
| Project Website / X | Нет | Не публиковались; localhost нельзя выдавать за public URL |
| Pitch deck or Loom/video presentation | Да | artifacts/demo/bondtrace-product-demo.mp4,174.021s; внешний URL pending |
| Submitted to official World's Fair? | Да, Yes/No | Подача не подтверждена; Yes пока запрещено |
| Colosseum project/profile links | Поля есть | Нужны реальные созданные URL, не homepage/придуманный slug |
| Anything Else | Нет | Technical overview, test scope и ограничения ниже |

Обязательные scope/adheres и Kazakhstan KYC if winner checkboxes, а также Terms при Submit подтверждает владелец в момент действия. Не проставлять их автоматически. Пользователь сообщил adult/Kazakhstan/no other team; остальные личные условия организатора и main registration не подтверждены.

## Project Description — English draft

BondTrace is a Solana console for corporate actions on permissioned tokenized test bonds. It makes one workflow visible: who is entitled, the exact amount owed, the action to sign and the settlement result.

An Anchor program fixes coupon rights at the record date, preserves them after later transfers, pays principal at maturity while burning the corresponding bonds, and records snapshot-weighted bondholder votes with one ballot per holder. Classic SPL Token handles settlement and retirement; the interface displays exact six-decimal test amounts and transaction receipts.

The completed local-validator demo has three generated holders and eighteen test bonds. After Investor01 transfers two bonds, its ten-bond record-date coupon remains500 test units. The full browser cycle settles900 coupon units and18000 principal units, burns all18 bonds and leaves zero supply and vault balance.

This is an accelerated test-asset prototype with generated demo signers. Devnet deployment awaits free test-SOL funding, and human external-wallet signing is not yet independently exercised. There are no real securities, fiat/KASE integrations, customers or validated demand. Source, runtime tests, technical overview and a2:54 product demonstration are prepared; public access and official World's Fair registration/submission are still pending.

## Короткий русский перевод

BondTrace — кабинет корпоративных действий тестовых токенизированных облигаций в Solana. Он показывает право держателя, точную сумму, операцию для подписи и реальный результат. Программа сохраняет купонные права после переводов, выплачивает principal с burn при maturity и учитывает голоса по snapshot. Реальный локальный цикл рассчитался по всем18 облигациям. Это test prototype: devnet, подпись человека, публичные ссылки и основная подача ещё не завершены; пользователей, банковской/KASE-интеграции и реальных активов нет.

## Anything Else — English draft

Technical overview: docs/18-TECHNICAL-OVERVIEW.md. Reproduction commands and dependency pins are in README.md. The video shows real localnet UI actions with generated test signers; idle waiting is edited. Its signatures refer to localnet and are not publicly verifiable devnet receipts. Browser and API lifecycle evidence identify different test issues. Development used AI assistance, installed ProofPilot/Solana/design guidance, Anchor, Solana Kit, React and classic SPL Token. No completed competitor product was imported. This entry does not claim KASE partnership, institutional settlement, traction or production audit.

## Конкретный вариант доступа жюри

После отдельного разрешения владельца: сделать именно этот репозиторий public и включить GitHub Pages из main/root. Уже подготовлены index.html, .nojekyll, MP4, captions, poster и публичные evidence-файлы без ключей. Предполагаемый URL: https://dimik98330.github.io/solana-worldsfair-2026/ — **не создан и не проверен**. Страница представляет запись/доказательства, не выдаёт статический плеер за live console. Backend/test signing endpoints туда не размещаются.

По проверенной8октября [GitHub documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), Free поддерживает Pages для public repositories. Это бесплатный конкретный вариант, не обещание доступности ещё не опубликованного сайта. Source publication — отдельное решение: START, общие правила3, запрещает автоматически публиковать private repo.

Локальный preview: npm run submission:preview → http://127.0.0.1:5180 . Реальное приложение: http://127.0.0.1:3000 после build, либо5173 в dev. Эти localhost URL не вставляются в заявку как публичные.

## Порядок оставшихся действий

1. Проверить основной профиль/регистрацию World's Fair и создать реальный project entry. Login Copilot это не заменяет.
2. Получить разрешение на public source + Pages и проверить материалы без авторизации после публикации.
3. При доступном free test-SOL выполнить devnet deploy и полный cycle; иначе сохранить честный localnet-only статус и не отмечать devnet passed.
4. Внести реальные Colosseum/project/video/source URL и окончательный статус в поля KASE.
5. Владелец подтверждает Terms/scope/KYC и финальную отправку; затем проверяется accepted submission state/ID.

Статус сейчас: **needs work**, не подано. Техническое выполнение localnet доказано; доступность материалов и регистрация — отдельные обязательные gates. На8октября ближайший опубликованный день KZ registration — сегодня, час неизвестен. Global deadline12окт23:59PT =13окт11:59UTC+5; местные сроки не продлеваются. Источники и точные пределы — docs01.
