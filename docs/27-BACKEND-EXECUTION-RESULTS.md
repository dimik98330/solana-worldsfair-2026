# BondTrace — backend для Technical Execution и Corporate Action Logic

8 октября2026. Корень: `C:\Users\dmitrii\Documents\solana`. Scope владельца — backend по двум критериям KASE (30% и25%); баллы организаторов не выставлялись и не обещаются. Дизайн/компоненты UI этим чатом не менялись. Применены ProofPilot coach direct implementation/plan→review, solana-dev security/testing/Anchor, review-and-iterate и официальные RPC/Anchor источники в профильных записках.

## Результат

Обязательный цикл test instrument → registry → record date → exact entitlement → coupon settlement → maturity/principal+burn → on-chain outcome проверен. Дополнительное действие — snapshot-weighted voting. Backend теперь умеет обслужить целый купон с одного операторского запуска, сохранить каждую группу и продолжить после остановки клиента/API.

### Technical Execution — реализованные усиления

- Новый `settle_coupon` и batch API до4 получателей. Комиссию и создание ATA оплачивает исполнитель; выплаты идут из vault, только каноническим получателям и только по историческим правам. Отдельно показываются сумма расчётов, transaction fee и rent estimate. Излишне дорогие test-SOL операции блокируются до relay.
- Durable event manifest до4 групп/16 получателей: genesis, program release, immutable coupon/registry, состав каждой группы и child IDs фиксируются до подписания. `maxBatches` ограничивает работу вызова без изменения намерения. Неизвестная подпись блокирует дальнейшую отправку; competing claim требует нового проверенного плана, а не скрытой замены адресатов.
- Проверяется фактически развёрнутый SBF: loader, канонический ProgramData PDA, payload hash/length, padding, activation slot и изменения genesis/header. Проверка до подписи и первого relay; уже подписанные квитанции восстанавливаются отдельно. Saved plan release доходит до самого подписывающего пути и сверяется с записанной child-квитанцией.
- Два отправителя одного сообщения не могут перезаписать исходную квитанцию или повторно вызвать relay: проверка и привязка выполняются атомарно в SQLite. Проверены конфликтующие и совместимые гонки, а также возврат ранее отправленного сообщения через другой путь.
- При подтверждении сохраняется компактный public execution proof: подпись/хеш сообщения, slot, fee/CU, accounts, pre/post balances. Wire/Ed25519/slot/числа проверяются; ключи, logs и raw transaction bytes в export не попадают. Capture ограничен4секундами; gaps/unsupported formats не меняют финансовый успех. Proof — сохранённое наблюдение RPC, не независимая аттестация. Изменившийся receipt не делает старое доказательство актуальным.
- Persistent Windows/WSL launcher использует отдельный ledger/data namespace по release hash, не сбрасывает старые цепочки, проверяет порты и при RestartApi сверяет listener/PID/start time/genesis. Для тестового validator увеличено конечное окно ledger retention. Read-only API раскрывает действующую версию программы.

### Corporate Action Logic — проверенные свойства

- Целочисленная арифметика и checked overflow, включая пример KASE10×1000×10%÷2=500.
- Позиции фиксируются по record date; до capture после наступления даты переводы блокируются. Последующий transfer не переносит исторический купон.
- Holder claim и operator settlement используют один claimed mask: получение одним путём запрещает повтор другим.
- Каждый получатель/сумма определяются контрактом. Нельзя подставить другой vault/mint/snapshot/получателя, выдать сумму извне, получить нулевое право или выплату до срока.
- Пакет атомарен: ошибка последнего получателя откатывает уже выполненные внутри той же транзакции выплаты.
- Principal выплачивается одновременно с burn. Невыплаченные купоны остаются доступными после полного сжигания; «principal погашен» отличается от «все обязательства закрыты».
- Голосование сохраняет snapshot weights и один ballot на владельца. Автоматическое изменение условий по голосованию не заявляется.

## Доказательства текущего прохода

| Проверка | Наблюдаемый результат |
|---|---|
| Final Node suite |174/174 passed,0skipped; `.local/backend-execution/final-node-tests.log` |
| Anchor/Rust + actual SBF/SPL |3unit +11runtime passed; `.local/backend-execution/program-tests.log` |
| TypeScript / scoped diff |Passed; release image/manifest independently matched by helper |
| [Свежий полный цикл](evidence/execution-archive-lifecycle-localnet.json) |40 distinct transactions:29 wallet relay +4 operator batches +7 auxiliary test-funding;6 holders |
| Точные итоги |1875 купонов +25000 principal =26875 тестовых settlement units;25 bonds burned; obligations/vault/supply0 |
| [Свежая HTTP/RPC сверка](evidence/execution-archive-http-localnet.json) |Все40 подписей заново найдены confirmed/finalized; built HTML, replay, export digest и запрет старой программы проверены |
| Пакет с4 новыми ATA |808 wire bytes,210886 CU,5000lamports transaction fee; pre/post balances подтвердили4 создания и точные выплаты |
| Public proof archive |40/40 execution proofs сохранены, привязаны к exact signed bytes и stored receipts; доступны после API restart |
| [Сбой клиента](evidence/execution-client-crash-recovery.json) |Другой HTTP-клиент продолжил существующий run с1 до2 подтверждённых групп, сохранив первую signature/digest; этот отдельный случай не заявляет principal или второй купон |

Последний полный выпуск: `wvgaaG3CDQ2irLz3y4obWVfPmFoe7pGQ3QtrB7J96G4`. Program ID `B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8`; SBF482752bytes, SHA-256 `4b75579ad52b046f8fedf528dbddc09722e7cd92d73b2778e16201d612b44b50`. IDL с13 инструкциями сгенерирован официальным Anchor1.1.2. Аккаунты ранее созданных инструментов не мигрировали.

Предыдущий36-transaction execution cycle, servicing a467… и исходные B01–B05 сохраняют собственные snapshots. Их подписи/сети/счётчики не объединяются с новым40-transaction циклом. Default local ledger ранее удалил raw history старого36-case; его итоговые счета и сохранённые confirmed receipts остались. Старые записи не выданы за свежий RPC proof.

## Независимое review и воспроизводимость

[Execution review](research/kase-execution-review.md) сохранил архитектурные условия и initial findings E1/E2. Оба исправлены и проверены в repair1; новых материальных дефектов на его cutoff не найдено. Новый полный archived-cycle проверяется отдельным evidence appendix. Это независимое review в другом контексте того же доступного инструмента, не сертификация безопасности.

В ходе smoke выявлены ограничения самого стенда/клиента: очередной цикл исчерпал тестовый settlement balance; вложенный Windows launcher удержал stdout pipe; затем клиент использовал закрытый keep-alive socket после restart. Failed logs/частичные выпуски сохранены. Harness теперь явно пополняет только свой local test mint, запускает restart без наследуемых pipes и повторяет только безопасные GET reads. Финансовые POST автоматически не повторяются. Новый40-case полностью прошёл после исправлений.

Запуск: `npm run build:program`, затем `npm run build` и `pwsh -NoProfile -File scripts/backend-runtime.ps1`. Текущий проверенный built API — http://127.0.0.1:3130, RPC8929. Namespace: `.local/backend-execution/4b75579ad52b/`; launcher runtime.json фиксирует используемые пути и известные процессы. Null Windows validator PID означает, что WSL wrapper не найден, а не выдуманную идентичность процесса. Main8899/API3000 и оригинальные ledgers/signers сохранены.

Для smoke взять `dataDirectory`/`rpcUrl` из runtime.json в `BONDTRACE_DATA_DIR`/`SOLANA_RPC_URL`, задать новый `BONDTRACE_EXECUTION_EVIDENCE=docs/evidence/execution-<unique-name>.json`, выполнить `node --import tsx scripts/execution-smoke.ts`. Скрипт отказывается перезаписывать прошлый evidence. Фактический human wallet не используется: все подписи — явно generated test signers.

## Граница результата

Это проверенный localnet backend выбранного прототипа, с обслуживанием событий сверх одиночного claim. Сохраняются ограничения16 holders/8coupons/окно32proposals, полный предварительный резерв, отсутствие surplus withdrawal, доверие RPC и confirmed commitment. Whole-event autoexecutor ограничен явно запущенным localnet generated-issuer режимом; обычный wallet подписывает reviewable batches самостоятельно. Proof decoder поддерживает проверенные legacy/v0 без ALT; другое исполнение не объявляется ошибочным, но получает evidence gap.

Devnet deployment, подпись человеческим кошельком, промышленные роли/регуляторные процессы, реальные активы, публичное размещение и финальная заявка не доказаны этим проходом. Код не коммитился/не пушился; visibility/consent не менялись. Продолжение должно читать AGENTS/STATE, сохранять skills rule и все исходные ledgers/evidence.
