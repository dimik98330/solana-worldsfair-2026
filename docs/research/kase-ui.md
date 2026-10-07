# BondTrace frontend checkpoint

Дата: 07.10.2026. Продукт: `C:\Users\dmitrii\Documents\solana`. Владелец файлов: frontend agent; зависимости, root config, API, Git, STATE — ведущий.

## Навыки и границы

Перед существенной задачей читались AGENTS.md, CODEX_SOLANA_WORLDSFAIR_START.md, docs/00-STATE.md, product/spec/UX/API/brand/plan и последние commits. В продолжениях требуется повторить этот вход и правило выбора/read actually installed SKILL.md; не переустанавливать bundle без проблемы, не менять общую конфигурацию или чужую область.

Применены ProofPilot **coach**, direct implementation route + bounded plan → review; frontend-design (`C:\Users\dmitrii\.codex\skills\ilm-alan-frontend-design\SKILL.md`), design-taste, frontend-design-guidelines + layout/interactions/states/forms/Solana/craft refs, product-review + onboarding/quality/crypto-UX refs, number-formatting + formatting/implementation/checklist refs, solana-dev + frontend/React/plugins refs. Discovery подтвердил installed skills; первый ошибочный вызов с относительным --root исправлен абсолютным путём без изменения конфигурации.

Установленных callable Solana MCP tools в этом агенте не найдено; конфигурация не менялась по разделению владения. Актуальные API проверены через официальную документацию и установленные package declarations. Контекст/цель/стадия product review известны из явного поручения и spec; повторного интервью о продукте/палитре не проводилось. Отдельное внешнее исследование рынка не запускалось.

Ни installs, package/lockfile edits, Git, login, paid services, external submission, mainnet, реальных wallet signatures/денег, backend changes агент не выполнял. Lead owns integration and browser QA.

## Реализация

`apps/web/index.html`, `src/main.tsx`, `App.tsx`, `components.tsx`, `styles.css`, `types.ts`, `api.ts`, `format.ts`, `wallet.tsx`, `format.test.ts`.

Работающие исходные пути: live GET state, explicit empty/loading/RPC failure, bootstrap review, generated-role demo actions, normal Wallet Standard connect/prepare/simulate/review/sign/relay path; Overview/lifecycle, holder registry + snapshot, coupon/principal reconciliation, portfolio claims/transfer, holder proposals/ballots, proof drawer. No fabricated numbers, wallets, signatures, revenue, customers or partner logos.

Wallet UI uses Kit 8.4.0 + React client provider + wallet plugin 0.21.0. Prepared transaction decodes actual version and signer; supports advertised v0/legacy/v1 as appropriate, requires successful simulation and unchanged reviewed message. Server-returned tokenDecimals=0 is integer bonds; 6 is settlement token. Currency labels say test units, without fabricated USD/KZT value.

Recovery saves public operation metadata before POST, locks new submissions on pending/unknown, and checks GET operations/signature explicitly. Confirmation alone unlocks and reloads chain state; user cancellation does not imply a failed on-chain payment. Snapshot rights remain separate from current holdings.

Visual brief: Swiss; comfortable density; panels and hairline separators; one family, tabular numbers, large left-aligned headings; short purposeful motion with reduced-motion fallback. Signature move: issuer’s lifecycle rail above a fixed entitlement/reconciliation table. No gradients, decorative glow, avatars, fake analytics or generic feature tiles.

## Проверки и остаточные ограничения

- TypeScript: `npm run typecheck` passed after Kit signer adapter repair.
- Formatting: `node --import tsx --test apps/web/src/format.test.ts` passed 3 tests, including smallest unit and values beyond JS integer precision, exact input parsing and Explorer URL allowlist.
- Source review found scheduled coupon API objects before snapshots; UI repaired to avoid false immutable rights or unreachable record-date control.
- Source review found transfer summary amount is bond units; UI repaired to preserve tokenDecimals=0.
- Native dialogs provide focus trap/Escape, unique label IDs; visible focus, real buttons/forms, 40px touch controls, retained inputs, full signer addresses and explicit pending/cancelled/unknown states implemented.
- Browser screenshots, mobile/tablet layout, keyboard walkthrough, API disconnected view and complete actual UI flow are pending lead QA; no browser pass or quality score asserted from source review alone.
- Bootstrap handshake исправлен ведущим: возвращается реальная final `fund_and_seal` signature/status/Explorer и operationId. Frontend передаёт заранее сохранённый operationId вместе с reset; потерянный bootstrap response проверяется существующим GET operations без повторной отправки.
- Human wallet signing remains unperformed. Mobile native Wallet Standard discovery cannot be guaranteed on a desktop-only test.

Next: lead builds/serves and executes browser QA; frontend agent repairs at most two evidence-driven review rounds and updates this checkpoint. Stopping gate: local/devnet test implementation authorized; public repository, final submission, legal consent, real funds/mainnet/paid services remain owner gates.

## Целевой repair 1 — bootstrap recovery и latest activity

Evidence от ведущего: `docs/evidence/ui/overview-desktop.jpg` и DOM показывали старый setup раньше более позднего redemption. API отдаёт activity DESC; прежний frontend reverse ошибочно предполагал ASC. Исправлено: widget и drawer сортируют копию activity по Date.parse(time) DESC перед ограничением списка. Исходный state не изменяется.

Второе исправление: `api.bootstrap(reset, operationId)` и App confirm передают уже сохранённый client UUID до HTTP-вызова. Recovery остаётся read-only через GET operations; нового signer/POST при неизвестном статусе не создаётся.

Проверки после обоих исправлений: TypeScript passed; существующие 3 formatting/URL tests passed. Область изменений ограничена App/api и этим checkpoint; styles/зависимости/Git/backend не менялись. Точные 6 decimals сохранены. Browser QA/recording остаются у ведущего, личные wallet signatures не тестировались. Повторно использованы уже прочитанные неизменённые frontend/number-formatting/solana-dev инструкции в том же контексте; product direction не пересматривался.

## Целевой repair 2 — UTF-8 title limit, 08.10.2026

Integration critic обнаружил несовпадение: UI допускал 100 characters, а программа принимает максимум 96 UTF-8 bytes (`programs/bondtrace/src/state.rs` max_len и `lib.rs` title.len). Перед prepare добавлен `proposalTitleError`, который измеряет TextEncoder bytes уже trimmed title. При превышении показывается inline сообщение с фактическим количеством bytes и фокус возвращается к полю; введённый текст сохраняется, не обрезается. Старое ограничение на 100 characters удалено для proposal, чтобы Unicode title не проходил по неверному счётчику и отклонённый ввод не обрезался браузером.

Файлы: `apps/web/src/validation.ts`, `validation.test.ts`, `App.tsx`; styles/backend/зависимости/Git не изменялись. TypeScript passed; 5 narrow tests passed (3 прежних formatting/URL и 2 новых UTF-8 boundary/trim tests). Границы проверены для ASCII 96/97 bytes, кириллицы 96/98 bytes и emoji 96/100 bytes. Повторно использованы прочитанные в этом контексте frontend-design-guidelines/forms и solana-dev; никакого нового продуктового решения/assessment не выполнялось. После repair 2 изменений без нового материального evidence не планируется; browser QA и восстановление local validator выполняет ведущий.

## Технические первоисточники

- https://solana.com/docs/frontend — accessed 07.10.2026; official Kit/plugins/React path.
- https://github.com/anza-xyz/kit-plugins — accessed 07.10.2026; official wallet plugin source; local installed `node_modules/@solana/kit-plugin-wallet/dist/types/types.d.ts` and `src/store.ts` verified actual signer surface.
- Installed `@solana/signers` transaction-modifying-signer and `@solana/transactions` codecs declarations checked 07.10.2026. This proves API compatibility/typecheck, not actual human wallet approval.
