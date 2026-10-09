# Единый часовой пояс интерфейса

08.10.2026. Узкая задача в рамках текущего редизайна рабочего интерфейса; презентационные экраны и экскурсия не добавлялись. Владелец выбрал автоматический часовой пояс браузера с возможностью сменить его в настройках.

## Контракт и границы

Файлы: `C:\Users\dmitrii\Documents\solana\apps\web\src\time-zone.ts`, `display-preferences.tsx`, `time-zone.test.ts`; в `format.ts` / `format.test.ts` изменены только отображение дат и его регрессия. Прежние изменения денежных функций сохранены; этот проход их не меняет. App, календарь, создание выпуска, общий CSS, API, program, зависимости и Git принадлежат другим исполнителям.

- `browserTimeZone()` определяет IANA-пояс браузера, при отсутствии корректного значения использует UTC.
- `getDisplayTimeZone()` разрешает сохранённое `bondtrace.timeZone`: `auto` либо валидный IANA-пояс. Неподдерживаемое значение считается `auto`.
- `DisplayPreferencesProvider` / `useDisplayPreferences()` дают `timeZone` (фактический пояс), `preference`, `setTimeZone`. Сохранение происходит перед повторным render. При заблокированном localStorage выбор продолжает действовать в текущей сессии.
- `dateParts(value, zone, language)` даёт отдельные строки даты и времени, с секундами, без GMT/UTC-приписки у каждого значения. `timeZoneLabel(zone, language)` даёт понятное название города для общей подписи группы дат.
- `format.date(value, withTime, language, zone?)` использует тот же пояс и представление. Сам UTC-момент не изменяется.
- `zonedInput(seconds, zone)` переводит абсолютный момент в строку календаря `YYYY-MM-DDTHH:mm:ss`.
- `zonedSeconds(local, zone)` выполняет обратное преобразование; невозможное или повторяющееся местное время возвращает `null`. `wallTimeIssue()` различает `invalid`, `nonexistent` и `ambiguous`, чтобы форма могла дать точную ошибку. Смещения около IANA-перехода проверяются по обе стороны, а каждый найденный UTC-кандидат сверяется с исходными календарными полями.

Календарь/черновик должны сохранять исходные UTC-моменты при смене представления. Уже существующий момент внутри DST fold сохраняется вместе с исходным якорем; новая неоднозначная дата требует выбора другого времени или UTC. Это интегрирует исполнитель календаря, а не этот helper. Интерфейс не выбирает произвольно сторону повторяющегося часа.

## Навыки и решение

Прочитаны текущие AGENTS, стартовый файл, STATE, PRODUCT, BRIEF/PLAN и brand. Impeccable context успешно выполнен для `apps/web/src/format.ts`; прочитаны SKILL, craft-floor и harden. Использованы frontend-design-guidelines со states и vercel-react-best-practices: lazy state initializer, стабильный callback, общий memoized context и обработка недоступного storage. ProofPilot **coach**, scoped `plan → review`: решить путаницу представления дат, не менять финансовый момент и проверить обратимость/ошибки; выбор проекта/рынка заново не запускался.

Primary технические источники, проверены 08.10.2026: [MDN Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat), [MDN formatToParts](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/formatToParts). Явный `timeZone`, locale и `hourCycle: h23` задаются кодом; численные wall fields получаются через `formatToParts` с ISO-календарём и латинскими цифрами. Исследование не подтверждает поведение экрана без реальной интеграции.

## Проверки

`node --import tsx --test apps/web/src/time-zone.test.ts apps/web/src/format.test.ts`: **12 passed, 0 failed, 0 skipped**. Проверены UTC / Qyzylorda / New York / Kathmandu / Chatham, точные секунды и переход даты, DST gap/fold, получасовой DST Lord Howe, пропущенный день Apia, некорректные даты/пояса, auto в трёх отдельных процессах TZ, сохранённая preference и заблокированный storage. Регрессии денежных функций остались зелёными.

`git diff --check -- apps/web/src/format.ts apps/web/src/format.test.ts`: passed. Общий `npm run typecheck` во время параллельной интеграции остановился только на ещё отсутствующем `VotingWorkspace` и связанном inferred `request` в App. Ошибок в owned timezone-файлах он не сообщил; окончательный общий typecheck/build выполняет lead после интеграции.

Actual desktop/phone, смена настройки и календарь проверяются lead в общей финальной UI-проверке. Эти unit tests не означают принятие дизайна владельцем. Detector должен запускаться один раз после завершения общего UI, а не в середине независимого helper-прохода. No installs, Git operations, chain writes, signer access, hosting or submission.
