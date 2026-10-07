# Техническая проверка BondTrace

Проверка на 8 октября 2026. Это ограниченный test-asset прототип, не production/security certification.

| Проверка | Результат | Доказательство и границы |
|---|---|---|
| SBF/IDL/fmt | Passed | Реальный image463096bytes; generated IDL; docs09/11 |
| Rust unit |3 passed,0 failed| Расчёты, allocation, program ID |
| SBF + SPL runtime |5 passed,0 failed| Реальный SBF; authority/dates/destination/duplicate claims;2coupons;16registry |
| Размер/compute |≤884bytes, max84584CU в запусках| Первоначально2 nonzero из16; worst case всех16 positive не измерен |
| Node client/domain |5 passed| Integer amounts/overflow/claim bits/actual IDL/state decoding |
| Recovery transport |4 passed| Isolated mocked RPC; lost send/confirmation outage/rejection/unknown history/proposal discovery |
| UI format/validation |5 passed| Exact6decimals/URLs и96UTF8bytes title |
| Typecheck/production build |Passed| tsc и Vite; повтор после UI copy fixes |
| Полный API/chain cycle |Passed,11 confirmed actions| docs/evidence/full-smoke-localnet.json, issue C9K… |
| Полный browser/chain cycle |Passed в Guided demo| docs/evidence/browser-cycle-localnet.json, issue5kn…; реальные screenshots/clips |
| Купон после перевода |Passed| 10 recorded→500;8 current после transfer2; snapshot не меняется |
| Principal/burn |Passed|18000 paid;18 burned; supply/vault0 |
| Повторные claims/ballot |Rejected как ожидается| Program/API cycle; same operation ID сохраняет signature |
| Responsive |Passed в указанном scope|375px все5pages;768/1280overview; нет document overflow |
| Отмена review/Escape |Passed| Unsigned bootstrap review закрыт; focus возвращён; new issue не создан |
| Отсутствующий кошелёк |Passed| No compatible wallet detected; My wallet без подключения не даёт issuer action |
| Human-wallet signing/cancel |Not verified| SDK source checks не заменяют подпись человека |
| Devnet deployment/full cycle |Blocked funding| docs16; последний баланс0; подписи deployment нет |
| Внешняя подача |Not submitted| Private repo; public links/global entry/consent ещё не подтверждены |

Каждый цикл имеет отдельный instrument ID и timestamps. Browser cycle завершил купон900, principal18000, burn18/vault0, yes weight10; activity включает setup. Значения в test settlement units, не реальные деньги. Обе проверки localnet, не devnet.

Unknown RPC outcome не считается failed/confirmed по таймауту. Подпись сохранена до отправки; новая финансовая подпись блокируется до reconciliation. Если live RPC больше не хранит старый receipt, ранее observed confirmation может быть возвращена как recorded-confirmation: это сохранённая история, не свежая аттестация сети. Для потерянной истории unattended exactly-once guarantee не заявлена.

Скриншоты и responsive measurements: docs/evidence/ui. Тесты mobile viewport не равны проверке на реальном Android/iOS. Отмена настоящего wallet prompt и wrong-chain prompt пока не проверены человеком. Guided signers предназначены только для локального test harness.

Независимый architecture critic завершил исходный review и две доработки; integration critic проверил выявленные repairs по source и mocked transport evidence. Финальная готовность заявки определяется также доступностью материалов и состоянием регистрации. Нет пользовательских интервью, fiat/KASE integration или production audit. Отдельный upstream ProofPilot npm test имеет Windows locale failure; это не результат тестов BondTrace.
