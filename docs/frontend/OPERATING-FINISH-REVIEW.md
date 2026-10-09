disposition: fix

Comp/quality-bar card отсутствуют намеренно: code-led уточнение owner-pinned Operate world, без нового seed/concept/palette. Live keyboard, 200% zoom, tablet, keyboard-open phone, ошибки и pending recovery не проверены этим reviewer; нет их свежих captures. Арифметика/backend отдельно не сертифицированы.

## persistence

PRODUCT и текущий operating brief существуют и соответствуют запрету презентации. DESIGN/brand сохраняют правильные navy tokens, SVG identity и readable type, но DESIGN описывает старый Overview main+360px inspector и старый evidence path; фактический Overview — три горизонтальные operational sections. Требуется синхронизация после одной repair batch. Initial recapture закрыл неверные registry/portfolio/voting/issuer desktop и issuer mobile: исправленные пять файлов заново открыты, теперь сцены корректны; native desktop 2560×1249 допустим, phone390×700 показывает настоящий overflow.

Skills фактически прочитаны: Impeccable SKILL, finish reviewer role и craft-floor; frontend-design-guidelines SKILL; ProofPilot SKILL/routing/review, coach scoped review. AGENTS, START top, текущий frontend STATE, PRODUCT, DESIGN/brand/планы прочитаны; предоставленные source samples просмотрены. 52 UI tests, frontend build и исправленный UI typecheck — результаты пакета lead, не повторный запуск reviewer. Detector0 primary/14 advisory не является acceptance.

## fidelity

| Обещание | Состояние | Основание |
|---|---|---|
| TYPE / оригинальная identity | match | Path-drawn lowercase lettering; Manrope, tabular amounts, 18px финансовые строки читаемы на2560. |
| MATERIAL | match | Честные плоские navy surfaces, inset inputs, single-edge field focus; нет имитации материала. |
| GROUND | match | Restrained graphite-navy canvas/nav соответствует закреплённым DESIGN tokens; белая поверхность не вернулась. |
| Рабочее приложение без pitch/tour | match | Шесть task views, реальные controls, receipts/account/settings; overview показывает реальные действия и суммы. |
| Payments records + exact context | adaptation | Dates/reconciliation/records идут до reserve; compact inspector и labeled phone records;900/900/0 и10×50=500 видны. |
| Responsive controls/records | contradicted | Toolbar overflow, скрытые значения Registry и calendar Save: F1–F3. |
| Readability/stable scan | contradicted | Имя склеено с address, широкие scalar paths, смешанные date/time строки: F4–F6. |
| Authority/evidence truth | match в выборке | View-only/signing разделены; нет кошелька не выдаётся за authority; missing matching transaction явно указан; localnet в receipts. |

## ceiling

Направление не требует новых иллюстраций, палитры, эффектов или tour. Неиспользованные рабочие приёмы: bounded internal data tracks и постоянная calendar action strip. Эти локальные недочёты мешают законченности; rebuild визуального мира не обоснован.

## material_fixes

1. **F1 · Phone shell overflow.** На всех390px кадрах refresh обрезан справа (x≈373+); issuer-mobile после focus scroll теряет ≈19px слева. styles.css:111,643,660 сохраняет nonshrinking inline action row; App.tsx:223 длинный Connect wallet. Уместить controls/short account label внутри viewport без page-level horizontal scroll, сохранив44px targets и EN/RU/network/account/refresh.
2. **F2 · Registry phone record.** registry-mobile.png: первая строка начинается y454, но Bonds now/Face-value значения справа за x364; видны имя/address, финансовые поля требуют бокового поиска. App.tsx:237, styles.css:237-238, operations-design.css:9-10 не дают current-position mobile layout. Сделать labeled current-position records с units/amount и Portfolio action рядом; локальная прокрутка technical address допустима.
3. **F3 · Calendar commit controls.** calendar-mobile.png: Cancel/Save начинаются околоy658 и обрезаны снизу; ordinary modal scroll валиден, но существенное действие скрыто. date-time-field.css:18,63, DateTimeField.tsx:187: footer идёт после всего scroll content. Закрепить action row в пределах dialog, прокручивая календарь/time content; сохранить40px day targets, Cancel/Escape и точное выбранное время.
4. **F4 · Holder name/address separation.** Desktop payments и Registry recorded rights показывают Test investor 14N6e6… как склеенную строку (registry-desktop x374/y789). PaymentTable.tsx:10 ставит button рядом с Address; operations-design.css:4 задаёт inline. Развести name/address на стабильные строки либо дать явный gap, сохранив copy и18px имя/сумму.
5. **F5 · Bounded financial tracks at2560.** В registry-desktop name≈x374, face-value≈x2010; portfolio-desktop event≈x333, amount≈x2288. App.tsx:237 auto table, operations-design.css:52 первая1fr колонка поглощает свободное место. Ограничить внутренние name/address/units/money tracks; полный workspace/panel width сохранить, свободное место отдать завершающей actions/filler track, не возвращать1360/900 caps.
6. **F6 · Stable dates beyond Payments.** payment-detail-mobile.png Rights/Payment timestamps остаются одной строкой, Registry recorded-right label и Portfolio date тоже совмещены. ReceiptDetails.tsx:70, HolderPortfolio.tsx:30, App.tsx:238 используют single date string. Вывести date иHH:mm:ss отдельными стабильными линиями через существующий dateParts/display timezone; один timezone note, исходный instant/seconds не менять.
7. **F7 · Persist actual system.** DESIGN Layout/Evidence всё ещё описывает предыдущий Overview/старые captures. После одной repair batch записать фактические strips, registry/portfolio tracks, mobile action layout и текущий operating-ui evidence; не называть reviewer verdict owner acceptance.

## keep

Сохранить navy tokens, оригинальный path SVG, Lucide, readable body/financial type, full2560 working width, single-edge input focus, EN/RU, exact Money/rights, view-only versus signer, truthful network/receipt gaps, drafts и recovery; не добавлять презентацию, tour, fabricated data, новый design concept или transactions ради visual QA.

## verdict

Confirmation8October2026: все18 обязательных capture paths заново открыты после repair; они показывают корректные сцены, desktop2560 и phone390×700. Это scoring F1–F7, без нового design hunt; ранее прочитанные Impeccable/frontend/ProofPilot instructions reused.

- F1 resolved — шесть phone work screens помещают Account/network/EN/RU/settings/refresh в viewport; общего горизонтального scrollbar и левого focus-scroll clipping больше нет.
- F2 resolved — registry-mobile показывает оба значения Bonds now/Face value (0/0) и Portfolio action внутри первой записи, x32..≈350.
- F3 resolved — calendar-mobile показывает selected date/time околоy539..591 и целые Cancel/Save y620..664; scroll body отделён от selection/actions. Escape/focus return подтверждён пакетом lead, не live reviewer.
- F4 resolved — payments/Registry desktop recipient name и address идут отдельными строками; copy сохранён, склейки имени с адресом нет.
- F5 resolved — desktop internal registry tracks закреплены340/320/180/240, entitlement340/180/240/140; Portfolio description/amount/state480/180/150. Значение current position примерноx1368, recorded payment≈x1037 и Portfolio amount≈x1004; полный workspace width сохранён. Это фактические разные строки, не единое claimed647px измерение.
- F6 resolved в исходном scope — payment-detail, Registry record date и Portfolio date показывают раздельные календарную дату иHH:mm:ss; timezone note остаётся один. Расширение на Receipts породило R1 ниже.
- F7 partial — DESIGN Layout193..195/250 теперь соответствует operational strips, bounded tracks и calendar footer;144 указывает operating-ui. Но157 всё ещё заявляет Current composition REGISTRY-FIRST и Current visual evidence registry-first, создавая противоречивый current pointer.

## remaining

- R1 introduced regression: receipts-mobile склеивает дату и время в `8 October 202604:17:52` (первая receipt околоx87/y456). DisplayDate.tsx возвращает два inline spans; operations-design.css:94 `.receipt-copy time {display:block}` перекрывает column-flex из5. Нужен receipt-specific column-flex или block children, затем корректный receipt capture. Это одна регрессия, возникшая при batch; других материалных регрессий в оценённых изменениях не обнаружено.
- F7: заменить противоречивый Current composition/evidence paragraph DESIGN.md:157 актуальным operating brief/path либо явно пометить весь старый pointer historical.

Остальные исходные ограничения проверки сохраняются. Пока R1/F7 открыты, ship не присваивается; заключительная disposition относится только к scoring fixes, не к готовности всего продукта или owner acceptance. Backend/RPC restart,52 tests/build — утверждения lead packet, отдельно не подтверждались reviewer. Изменён только этот отчёт.

disposition: fix

disposition: recapture

## recapture

Final targeted R1/F7 scoring: DESIGN current pointer157 исправлен и explicitly marks registry-first historical; F7 resolved по исходнику. CSS `.display-date > span {display:block}` присутствует. Однако новый receipts-mobile.png невалиден: верхние≈450px из700 — пустая navy область, внизу только часть drawer header/filter, receipt dates/time не видны. Check0 Impeccable finish role требует корректного capture этого же390×700 пути с полностью видимым drawer/receipt rows; визуальное закрытиеR1 и ship пока не подтверждены. Это repair evidence, не новый design assessment.

## verdict

Final targeted scoring8October2026, R1/F7 only; previously read skills reused, no new design hunt.

- R1 resolved — the same receipts-mobile.png now has a valid390×700 full drawer capture with header at top. First two visible confirmations show8October2026 and04:19:46 /04:19:45 on separate stable lines. The date/time concatenation and malformed blank region are absent.
- F7 resolved — retained source check confirmed the current operating-ui evidence pointer and explicit historical registry-first reference. No other code change occurred in this evidence repair packet.

## remaining

clear — F1–F7 and the introducedR1 are closed within this bounded scoring scope; no material regression remains from the assessed fix batch. This ship covers the scored fixes, not the whole surface. It does not establish owner acceptance, backend/production readiness or the previously unreviewed interaction scenarios. Only this report was appended; initial findings and evidence repairs remain preserved.

disposition: ship
