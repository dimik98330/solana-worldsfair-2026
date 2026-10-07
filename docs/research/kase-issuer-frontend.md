# Кабинет эмитента — frontend checkpoint

Дата: 2026-10-08. Этап P12 из `docs/20-FULL-ISSUER-PLAN.md`; автор — frontend subagent. Root: `C:\Users\dmitrii\Documents\solana`.

## Задача и границы

Собран reviewable кабинет создания и подготовки отдельного выпуска. Это продолжение выбранного KASE проекта, а не новый поиск идеи. Локальные формы не доказывают готовность участия, подпись человеком или production settlement. Спрос/партнёрства/eligibility не заявляются.

Изменены только:

- `C:\Users\dmitrii\Documents\solana\apps\web\src\IssuerSetup.tsx`;
- `C:\Users\dmitrii\Documents\solana\apps\web\src\issuer.css`;
- `C:\Users\dmitrii\Documents\solana\apps\web\src\issuer-validation.ts`;
- `C:\Users\dmitrii\Documents\solana\apps\web\src\issuer-validation.test.ts`;
- этот checkpoint.

Lead отвечает за App/API/types/server wiring, зависимости/config/Git, browser и transaction verification. Подагент не управлял общим браузером, не подписывал транзакции, не менял `.local`, не устанавливал пакеты и не делал Git writes/deployment.

## Применённые реально установленные skills

До реализации прочитаны AGENTS, START, STATE, утверждённый `docs/20-FULL-ISSUER-PLAN.md`, brand и последние commits.

- ProofPilot **coach**, bounded `plan -> review` контекст существующего утверждённого плана. Прочитаны main/profile, routing/plan/review/evidence/decisions/safety/solana-new/onboarding/taxonomy. Scoped implementation не требовал нового Colosseum login или внешнего исследования; старые review budgets не сбрасываются.
- `.agents/skills/frontend-design-guidelines/SKILL.md`: forms, layout, interactions, states, craft-and-polish, Solana UI, animation. Credit Emil Kowalski дан в commentary. Использованы существующие Button/Panel/Address/Money/Badge и Swiss/cobalt tokens.
- `.agents/skills/design-taste/SKILL.md`: design-judgment и anti-ai-slop. Direction: Swiss operator console, comfortable формы, плотный подтверждённый список, асимметричные колонки размещение/резерв, прямые финансовые тексты, CSS micro-feedback.
- `.agents/skills/number-formatting/SKILL.md`: formatting-spec, implementation-guide, review-checklist. Ввод/финансовые подтверждения сохраняют точные 6 знаков settlement mint через существующий Money; денежной рыночной цены нет, fiat valuation не придумывается. Внутренние суммы — BigInt, detailed quantities не сокращаются, нет scientific notation/NaN. Семейство шрифта/tabular соответствует заданному brand и существующим компонентам.
- `.agents/skills/solana-dev/SKILL.md` и frontend reference: UI не получает ключи и делегирует подготовку/simulation/подпись/relay общему потоку. Native Kit `isAddress` наличие проверено runtime. Discovery Solana MCP в доступных tools не обнаружен; настройка MCP не входила в file ownership этого подагента. Solana SDK/API/signing здесь не менялись.
- `.agents/skills/page-load-animations/SKILL.md` и hover-micro: CSS transitions без дополнительной библиотеки, reduced-motion, никакой задержки входа перед финансовым действием.

## Результат

`IssuerSetup` экспортирует `IssuerIntent` и props: `{state, walletAddress?, canAct, busy, onAction, onChooseIssue?}`. Catalog/issue selection остаётся у root; `onChooseIssue` сохранён в контракте, не вызывается до подтверждения создания.

Новый выпуск доступен и при active/redeemed выбранном инструменте: name <=64 UTF-8 bytes, существующий settlement mint, точный положительный nominal, maturity с timezone, 1..8 фиксированных купонов. Series ID генерируется один раз для формы. Record/payment/maturity переводятся в точные Unix seconds. Порядок дат и полный unit reserve соответствуют фактически прочитанному `programs/bondtrace/src/lib.rs` (initialize_issue). Кнопка коротких тестовых дат задаёт первый record через15мин, каждый следующий через20мин и payment через10мин после своего record; это явно ускоренный тестовый schedule с реальным ходом времени, не доказательство production maturity.

Draft: регистрация wallet+local label, confirmed holder list, выдача целых bonds, principal+all coupons reserve/currentvault/gap, funding только exactgap, checklist и review seal. No signer/wrong issuer/busy/unresolved root gate/прошедший record cutoff блокируют действия. Таймер продвигает предоставленный chain clock между чтениями для своевременного UI cutoff; программа снова проверяет время при исполнении. Новый issue может создавать другой выбранный signer, а управление draft требует текущего issuer.

Все изменения стадии и registry приходят из переданного chain state. Confirmed register выбирает появившегося держателя только после его чтения в state. Никакого оптимистического подтверждения/фиктивных signatures/сумм. Активация отдельно объясняет закрытие registration/placement. Последующие купоны доступны snapshot владельцам даже после principal redemption.

Inline errors, labels, fieldsets, native select/date controls, фокус первого invalid field, фокус после add/remove coupon, 40px+ targets, live reserve announcement и reduced-motion CSS предусмотрены. Browsers/viewport/physical-phone проверки в этом подагенте не выполнялись по ownership; требуется lead integration review.

## Согласованный payload

| Action | params |
|---|---|
| initialize_issue | seriesId/name/settlementMint/faceValueMinor/maturityTs/coupons(JSON [{recordTs,paymentTs,unitAmount}]) |
| register_holder | holderWallet/label |
| issue_units | holderWallet/units |
| fund_vault | amountMinor (exact gap) |
| seal_issue | empty; root добавляет выбранный bondAddress |

Root добавляет request-scoped bondAddress к текущим issue actions и выбирает новый instrumentAddress только по confirmed result. Дополнительные chain поля поддержаны с безопасным fallback: Instrument seriesId, couponUnitMinor (сумма купонов за bond), requiredReserveMinor, settlementBalanceMinor; Coupon unitAmountMinor. Reserve не доверяет несовместимым totals: при mismatch/неизвестных данных fund/seal блокируются. После requested initialize форма очищается и получает новый ID только когда выбранный on-chain issuer+seriesId точно совпали с запросом. Root должен предоставить actual seriesId; иначе сохраняется форма для исправления, а не объявляется успех.

## Проверки и оставшийся шаг

- `node --import tsx --test apps/web/src/issuer-validation.test.ts`: 12/12 passed после исправления собственной TS narrowing ошибки и добавления control-character проверки.
- Покрыты exact six-decimal/u64 boundary/positive count, ASCII+Cyrillic+emoji UTF-8, address decoded size, valid local datetime roundtrip+невозможные даты, date ordering/payment equality+maturity, 1..8 coupons и reserve/aggregate issuance overflow/mismatch.
- `npm run typecheck` после исправления owned ошибки: owned files без diagnostics; shared integration пока сообщала `App.tsx` отсутствие issuer viewLabel и `server/admin.ts` readBond/getState argument shape. Эти файлы не менялись данным агентом; lead продолжает интеграцию.
- Targeted scan: нет новых hardcoded цветов, `transition: all`, фиктивных blockchain подтверждений.

Следующий шаг lead: общий typecheck/build; browser375/768/1280, keyboard/inline errors/no signer/wrong issuer/busy и работа всего issuer цикла через реальные prepared transactions. Затем milestone STATE обновляет lead. Не объявлять новый P12/P14 passed по одним unit tests.

## Правило преемственности и gate

В каждом новом/resumed task сначала AGENTS/START/STATE/current approved plan/git status. Перед существенной работой выбрать реально установленные подходящие skills, прочитать SKILL.md + нужные references, записать использование в checkpoint. Каждое поручение subagent повторяет это правило, задачу/входы/deliverable/file ownership/forbidden actions; не редактировать общий файл одновременно.

Продолжать авторизованную локальную реализацию и localnet/devnet verification. Не переустанавливать bundle без проблемы. Mainnet/реальные деньги/paid services/public visibility/final submission/account legal consent не разрешены этим checkpoint. Сохранять pending/unknown signing locks и подтверждённые независимые review budgets.
