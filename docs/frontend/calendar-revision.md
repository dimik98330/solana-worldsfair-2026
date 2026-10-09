# Календарь и время — 8 октября 2026

Scope: `C:\Users\dmitrii\Documents\solana\apps\web\src\DateTimeField.tsx`, `date-time-field.css`, `date-time-value.ts` и `date-time-value.test.ts`. Props сохранены; issuer/API/contracts/signers не менялись этим агентом.

Прочитаны AGENTS.md, стартовый документ, STATE, PRODUCT, BRIEF, PLAN и REBUILD. Применены установленные Impeccable (context, craft-floor, operate), frontend-design-guidelines (forms/interactions/states), vercel-react-best-practices (derived state) и ui-ux-pro-max (UX search: locale dates, submission feedback, accessible errors). Сначала `python` отсутствовал в PATH; поиск затем успешно выполнен существующим bundled Python. Установок и глобальных изменений нет.

## Изменение

- Календарь React DayPicker с переключением месяца/года и клавиатурной навигацией; native dialog удерживает фокус, Escape/Отмена закрывают без изменения значения, после закрытия фокус возвращается на исходное поле.
- Часы и минуты вводятся прямо в отдельные крупные поля 24-часового формата вместо длинных select-списков. Одна цифра дополняется ведущим нулём; неверное время не обрезается и не округляется. Enter в поле времени выполняет сохранение.
- Красная ошибка внутри календаря появляется только после «Сохранить дату», исчезает при новом редактировании. Ошибка направляет фокус в исправляемое поле. Внешние ошибки остаются ответственностью issuer и передаются после проверки шага/blur.
- Выбранные дата и точное время видны перед сохранением. Уже существующие секунды сохраняются и показываются при ненулевом значении. Конвертации календарного дня через UTC нет; несуществующее местное время DST отвергается.
- Все поверхности используют общие токены тёмного интерфейса; поля используют `--input`, выделение/фокус — `--primary`. Светлых hardcoded поверхностей нет. На телефоне кнопки действий делят доступную ширину, dialog ограничен высотой экрана и прокручивается. Часовой пояс остаётся одной строкой в issuer schedule, а не повторяется в каждом поле.

## Проверка и границы доказательства

- `node --import tsx --test apps/web/src/date-time-value.test.ts`: 6/6 passed. Регрессии включают одиночную цифру, невозможные даты, exact seconds/min/max, локальную полночь и конец дня в Asia/Qyzylorda, Pacific/Kiritimati, America/New_York; проверен пропущенный час DST New York.
- Impeccable detector на компоненте и CSS: `[]`.
- Первый общий typecheck увидел только параллельно редактируемые issuer references `registrationTried`; issuer агент уведомлён. Финальную общую сборку выполняет lead после интеграции.
- Визуальное и клавиатурное browser QA самим календарным агентом не выполнялось; это задача lead. Detector и unit tests не заменяют проверку реального экрана/скринридера.

Официальные референсы, прочитаны 2026-10-08: https://daypicker.dev/guides/accessibility (navigation, focus, live announcement); https://daypicker.dev/guides/timepicker (отдельный time input, local date composition, DST). Применены к установленному react-day-picker 10.0.2, новый UI framework не добавлялся.

Продолжение: сохранить обязательное правило AGENTS — перед существенными изменениями выбирать/читать установленные skills, ProofPilot coach при продуктовых решениях, сохранять точную арифметику/права/подписи. Lead проверяет desktop/mobile, opening/cancel/save/focus, ошибки только после Save, точную дату/секунды и общую сборку. Mainnet, funds, visibility и финальная submission остаются вне этой задачи.
