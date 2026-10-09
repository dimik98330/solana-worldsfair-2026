# BondTrace: backend полного корпоративного цикла

8 октября 2026. Корень: `C:\Users\dmitrii\Documents\solana`. Текущий запрос владельца — усиление backend по предоставленному полному тексту KASE; дизайн принадлежит параллельному чату. ProofPilot coach, plan → review, scoped implementation. Исходные B01–B05 и их отчёты сохранены; настоящая работа добавляет новые исправления и новые доказательства, не переоценивает прошлую заявку.

## Что было и что добавлено

Уже работали test instrument, реестр до16 держателей, неизменяемое расписание до8 купонов, record-date snapshots, точные integer-права, выплаты, principal redemption с burn и snapshot-weighted voting. Одно confirmed чтение сверяло финансовые данные; SQLite хранил намерения и квитанции до отправки. Эти существующие возможности не выдаются за новые.

В этом проходе:

- Исправлена выдача после закрытия/повторного создания пустого ATA. Эмитент восстанавливает канонический счёт; программа корректно принимает пустой initialized ATA и замораживает его после mint. Проверены missing, prefunded System account и независимо восстановленный SPL account. Чужие полномочия/делегаты/положительный незамороженный баланс не разрешаются.
- Recovery IDs демо и prepared transaction hashes атомарно разделяют одно пространство идентичности. Коллизия больше не подменяет результат другой операцией; неоднозначные прежние записи блокируются до отправки и требуют проверки сохранённой подписи.
- Прямой client adapter отвергает coupon index256, дробные и отрицательные значения вместо незаметного превращения в0. HTTP был защищён и раньше.
- Голосования обнаруживаются по program accounts даже без локального каталога. Финансовые значения по-прежнему из одного confirmed bank. Выбирается окно32 ID; дальнейшие голосования не блокируют деньги. Все пропуски, непроверенные PDA вне окна и discovery slots отмечены явно.
- Добавлен серверный план обслуживания `/api/servicing`: даты, последовательность фиксаций, доступные выплаты по держателям, причины блокировок, права голосования. Результат служит основанием для нового preview/simulation, самостоятельно не подписывает операции.
- Добавлена выгрузка `/api/evidence`: условия, registry/snapshots, обязательства/выплаты, сеть/genesis/program, локально сохранённые receipts и контрольная сумма JSON. Это проверяемый экспорт, не независимая аттестация и не полный архив транзакций.
- Состояние «principal погашен, купоны остались» отделено от полного завершения. Исторические купоны остаются доступными после burn.

## Сверка с заданием KASE

| Требование | Реализация и проверенная область |
|---|---|
| Test instrument, registry | Реальные SPL mint/accounts и sealed registry на отдельном local validator |
| Record date | Перед датой переводы разрешены; наступившая дата блокирует переводы до permissionless capture; сохраняются исторические права |
| Exact entitlement | Checked integer arithmetic; пример10×1000×10%÷2=500 покрыт тестом; фактический цикл проверяет два купона и перевод между snapshots |
| Coupon settlement | Настоящие переводы тестового settlement SPL; повторные claims защищены масками; купонные права переживают погашение |
| Maturity/redemption | Principal и burn исполняются атомарно; rollback failure проверен runtime-тестами |
| Дополнительное действие | Голосование с immutable weights и одним ballot; результат доступен после потери local catalog; автоматическое изменение условий не заявляется |
| On-chain outcome | Реальные signatures, accounts, supply, paid masks, reserve и per-holder права; evidence export указывает область каждого источника |
| Submission materials | Этот проход даёт backend/code/evidence. Актуальный ролик нового дизайна, доступные жюри URL, devnet и финальная подача остаются отдельными release gates |

## Новые доказательства

Actual corrected SBF:462232 bytes, SHA-256 `a46736e7e38b27db356f78c3dcefad0c02ef2147eaa21cb0161cfb6ee53739e1`. Read-only сравнение ProgramData в новом validator подтвердило побайтное совпадение с `target/deploy/bondtrace.so`. Account layout/IDL не менялись.

- Runtime:3 unit +8 actual SBF/SPL tests passed,0 skipped. Новый regression сначала падал на старой программе (`ThawAccount InvalidState`), затем прошёл. Сохранены16 holders/8coupons/128claims и rollback failed payment после burn.
- Финальный полный Node pass117/117,0skipped. Первоначальный полный pass113/113 и repair54/54 сохранены отдельно; эти пересекающиеся наборы не суммируются.
- [Новый lifecycle](evidence/servicing-lifecycle-localnet.json): issuer API19 confirmed операций +4 auxiliary token/system транзакции; отдельный выпуск `Cu3YxSD7EZbEHxP687hwQMwGj2q1TLqY2P4Budde7a2L`. Два купона750+375=1125; principal15000;15 burned; vault и remaining obligations0. Купоны получены после полного погашения principal. Смена holdings между record dates изменила только следующий snapshot.
- [HTTP и recovery](evidence/servicing-http-localnet.json): built HTML реально обслуживается, plan/export работают, SHA-256 экспортируемого payload перепроверен. После API restart проверены сохранённые create/last-claim IDs и signatures. Процесс с пустой metadata базой восстановил все деньги и голосование; отсутствие receipts/record slot в новой базе не замещено выдуманными доказательствами.
- При первом live прогоне prefunding на1 lamport был отклонён simulation из-за rent requirements до отправки этого prefunding. Failed-attempt log и частичный выпуск сохранены. Успешный прогон использовал фактический `getMinimumBalanceForRentExemption(0)`, что отдельно записано в auxiliary receipt. Тест с1 lamport — synthetic envelope, не утверждение успешной live транзакции.
- TypeScript check и scoped diff-check прошли. Frontend-файлы и сборка интерфейса этим чатом не менялись; HTTP использовал уже имеющийся built bundle.

## Отличие и честные границы

Сильная сторона BondTrace — полный цикл обслуживания с exact reconciliation, историческими правами после transfer/burn и восстановлением на основе chain state. Новый action plan и portable evidence делают это пригодным для операторской работы. Это аргумент о реализованном сочетании возможностей; мировая уникальность, рыночный спрос, интеграция с KASE и банковскими rails не доказаны.

Это полноценный проверенный локальный прототип корпоративного цикла, не промышленная биржевая система. Ограничения: permissioned registry16, schedule8, окно32 voting proposals, prefunded test settlement; confirmed commitment и доверие RPC; key custody/permissioned distribution и резерв требуют отдельного production-проектирования. Human-wallet UX/devnet/public hosting и внешние интеграции этим тестом не проверялись.

## Запуск и передача соседнему чату

- Основной validator8899 и API3000 оставлены как были, с прежней программой и прежним ledger. Их старые доказательства не относятся к новому bytecode. Bootstrap в прежнем `localnet.sh` не обновляет уже запущенную программу.
- Исправленная проверенная среда: RPC `http://127.0.0.1:8919`, API/built app `http://127.0.0.1:3110`, ledger `.local/backend-servicing/validator`, metadata `.local/backend-servicing/data`. Это отдельная локальная сеть, не devnet. Generated test signers остаются только ignored.
- Для UI доступны additive `state.servicing`, `state.proposalDiscovery`, `/api/servicing?instrument=...` и `/api/evidence?instrument=...`. Не показывать retained receipt как fresh confirmation; не превращать `principal-redeemed-coupons-outstanding` в «всё выплачено»; не скрывать finite voting window.
- Воспроизведение: isolated validator с новым `target/deploy/bondtrace.so`, bootstrap через API3110, затем `node --import tsx scripts/servicing-smoke.ts` с `BONDTRACE_DATA_DIR=.local/backend-servicing/data`, `SOLANA_RPC_URL=http://127.0.0.1:8919`, `BONDTRACE_API_ORIGIN=http://127.0.0.1:3110`.
- Никаких commit/push, смены visibility, mainnet/real funds, paid services или финальной подачи в этом проходе. Сохранять mandatory skills rule и читать AGENTS/STATE при продолжении.
