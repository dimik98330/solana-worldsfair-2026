# Issuer/calendar implementation — 8 октября 2026

Scope: рабочий интерфейс выпуска и календарь. Позднее уточнение владельца исключает презентацию и обучающий тур внутри сайта. Разрешённые изменения ограничены `IssuerSetup.tsx`, `issuer.css`, `DateTimeField.tsx`, `date-time-field.css`, `issuer-validation.ts`, `date-time-value.ts` и новыми `issuer-draft.ts`/тестами. Backend, зависимости, shared App/styles, signer authority, ledger и Git не менялись этим агентом.

Прочитаны AGENTS, starter, STATE, PRODUCT, BRIEF, brand/DESIGN. Применены Impeccable context/Operate + craft-floor/clarify/harden; UI UX Pro Max (локальный поиск form/wizard/validation/date); frontend-design-guidelines forms/interactions/states; vercel-react-best-practices; ProofPilot **coach**: scoped plan → implementation → review без нового market research или contest score. Официальный shadcn skill просмотрен для совместимости; сохраняется React/CSS foundation по прямому правилу владельца, CLI migration не проводилась.

Референс: [официальный shadcn Calendar](https://ui.shadcn.com/docs/components/base/calendar), проверен 08.10.2026: single-date calendar, month/year selection и явный timezone context. Сохраняется установленный react-day-picker и нативный `<dialog>`. Попытка открыть `https://daypicker.dev/guides/time-zones` в web tool вернула inaccessible; не выдаётся за просмотренный источник. Абсолютное время переводит проверенный `time-zone.ts` соседнего агента; календарные Date используются только для выбора календарного дня.

Изменения:

- `startNew` управляется явным выбором создания при переданном `onCreationChange`; отсутствие кошелька само по себе не открывает пустую форму. Три шага и существующие guards/review сохраняются.
- Версионированный browser draft привязан к public signer/network, содержит шаг, строки точных сумм, coupon keys, абсолютные seconds и ожидаемую identity создаваемого выпуска. Guest draft можно продолжить после выбора signer. Очистка происходит только после совпадения confirmed series/issuer; отдельные чужие черновики не очищаются. Ошибка browser storage сохраняет работающую форму и показывает короткую причину.
- Смена display zone переформатирует даты и сохраняет моменты времени, в том числе уже выбранный момент, попавший в DST fold другого пояса. Новое неоднозначное/несуществующее локальное время не принимается. Секунды сохраняются, показаны отдельно от даты; пояс виден в календаре и один раз на группу дат.
- Завершённый issuer screen показывает фактические оплаченные суммы и историю; неоплаченные зафиксированные купоны после погашения сохраняют отдельный правильный статус. Empty recorded state не заявляет успешную выплату. Optional `onViewPayments`/`onViewReceipts` готовы для интеграции root.
- Calendar labels16px, dates16px/time15px, controls15–16px, time edit24px; inset dark fields и одна focus stroke сохранены. Repeated decorative checks убраны из этапов/активации, этапы пронумерованы. No width caps, white surface, blinking или explanatory tour.

Проверки: `npx tsc --noEmit` passed. `node --import tsx --test apps/web/src/issuer-draft.test.ts apps/web/src/date-time-value.test.ts apps/web/src/issuer-validation.test.ts` — **23/23 passed**, 0 skipped. Регрессии: restore/reload data shape; signer/network keys; exact decimals и five-second separation; same UTC params после переноса пояса через смену даты; существующий DST fold и rejected new fold/gap; malformed drafts; existing u64/reserve guards.

При последнем повторе общей TypeScript-проверки после дальнейших параллельных backend-изменений появились только ошибки `server/rate-terms.ts` (AccountMeta.signer / compiled.instructions) и `server/state.ts` (RateTermsEvidence assignability). Issuer/date ошибок не было; backend этому агенту не принадлежит и не исправлялся. Более ранний passed typecheck не выдаётся за финальное состояние всего checkout.

Root владеет общим build, detector и браузерной проверкой desktop/phone: этот отчёт не заявляет визуальную acceptance, подписанные транзакции или frontend end-to-end success. При продолжении обязательно снова читать текущие AGENTS/STATE, выбрать реально установленные skills и сохранить disjoint ownership; не изменять backend/signers/ledger.
