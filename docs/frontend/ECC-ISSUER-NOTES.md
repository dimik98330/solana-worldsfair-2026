# ECC frontend pass — issuer and calendar

8 октября 2026. Корень `C:\Users\dmitrii\Documents\solana`.

## Scope и правила продолжения

Только `apps/web/src/IssuerSetup.tsx`, `issuer.css`, `DateTimeField.tsx`, `date-time-field.css` и этот checkpoint. Backend/server/program/client, utilities финансового расчёта, types, Git, конфигурация, dependencies и shared styles не менялись этим агентом. Checkout изначально содержал чужие изменения: они сохранены. Родительский агент отвечает за интеграцию, реальные browser input/screenshots и общий finish review.

Перед любой существенной работой агент должен читать AGENTS.md, START/STATE, выбирать и читать подходящие фактически установленные SKILL.md и необходимые ссылки; фиксировать навыки и результаты в checkpoint/handoff. Сохранить это правило в продолжении. Текущая явная команда владельца: полный frontend redesign без вопросов, другой агент делает backend. Финансовые значения, доступы, canonical instants, immutable terms, external wallet signing и network/archive truth неизменны; mainnet/реальные средства/paid/final submission/public visibility вне этой задачи.

## Прочитанные навыки

- Impeccable 4.5.0: SKILL, context для IssuerSetup, new-work, operate, craft-floor. Operate; pinned dark financial system. Центральный seed выполнен lead; нет approved image comp. Исторические screenshot fixtures inspected как anti-reference, freshness сопоставлена с исходным CSS.
- frontend-design-guidelines: SKILL, forms, interactions, states, layout-and-design; существующий React/CSS foundation и brand.md сохранены. Полноширинная рабочая область по прямому user contract имеет приоритет над generic max1280 suggestion.
- vercel-react-best-practices: SKILL, rerender-no-inline-components; дочерние компоненты сохранены на module scope, финансовые вычисления используют прежние BigInt utilities.
- web-design-guidelines: SKILL и официальный актуальный command.md, https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md, проверено 8 октября 2026. Inputs получили `name`, ошибки связаны с полями; native dialog/DayPicker keyboard behavior сохранены.
- ProofPilot: coach, scoped plan → implementation → review; SKILL/routing/plan/review. Решение касается usability существующего workflow, не нового выбора идеи, demand research или конкурсной оценки.
- ECC 2.2.3: `C:/Users/dmitrii/.codex/plugins/cache/ecc/ecc/2.2.3/skills/frontend-design-direction/SKILL.md` и `frontend-a11y/SKILL.md`. Усилены hierarchy, native semantics, labels, keyboard focus и return-to-completed-stage; новые зависимости не потребовались.

## Реализация

- Создание остаётся триэтапным. Segmented numbered rail показывает текущий этап; выполненные этапы доступны для возврата без утраты draft. Будущие этапы не обходят validation.
- Убран прежний 220px explanatory sidebar. Заголовок/описание над рабочими полями; отдельная financial summary справа содержит только существующие exact review values и signer address. Нет hero/tour/marketing.
- Условия используют всю рабочую область; bounded nominal input420px и summary300px предотвращают растяжение scan paths. Native2560 не ограничивается whole-form900px или workspace1360px.
- Coupon row группирует per-bond amount, record date, payment date; remove относится к header этой строки. Amount вводится decimal-safe text. Maturity рядом с exact principal per bond.
- Money/quantity/numeric inputs — Manrope tabular; адреса/время сохраняют техническую типографику. Labels16/body17, важные figures18–26. Валидация blur/progression, first-invalid focus и прежние disabled reasons сохранены.
- Calendar dialog440px с viewport cap, contained scroll и persistent Save/Cancel. Dates и exact-second times раздельны; один timezone label. На узком экране календарь сохраняет 7 tracks, inputs и формы reflow. Single-edge link focus вместо двойного ring. Декоративного blinking нет.

## Проверки и оставшийся gate

`npx tsc --noEmit -p tsconfig.web.json` — passed. Existing issuer-draft/date-time-value/time-zone tests19/19,0skipped. Scoped `git diff --check` — passed. Все onAction intents, params, validation functions, BigInt arithmetic, reserve guards, draft persistence/zone rebasing и calendar Save/Cancel logic сохранены.

Это source/logic evidence, не design acceptance. Родительскому агенту переданы реальные проверки390/768/1440/native2560/overflow320: Terms→Schedule→Review; возврат в completed stage; RU; submit-empty/first-invalid/no red during typing; calendar Save/Cancel/Escape/focus; precise draft reload/timezone; регистрация/размещение/резерв/activation reasons. Общий Impeccable detector выполняет lead один раз после интеграции. Новые screenshots и wallet signing здесь не заявлены.
