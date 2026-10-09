# Backend execution — Technical Execution / Corporate Action Logic

8 октября2026 владелец поручил полностью усилить backend по критериям30% и25% KASE. Root `C:\Users\dmitrii\Documents\solana`. ProofPilot coach, прямой implementation route, bounded plan→review; solana-dev security/testing/Anchor и review-and-iterate. UI/style/dependencies чужого чата не меняются. Нет обещаний баллов, production certification или рыночной уникальности.

Предыдущий servicing scope завершён independent initial+2repairs: S1/S2/S3 закрыты в `docs/research/kase-servicing-independent-review.md`. Его117Node +3unit+8runtime и a467… localnet artifacts остаются историческим cutoff. Новая функциональность требует новых доказательств; старый review budget не перезапускается.

## Пробел и результат

Сейчас купон получает каждый держатель отдельно. Для исполнения целого события добавляется permissionless fixed-beneficiary `settle_coupon`: оператор подписывает транзакцию/оплачивает её fee, деньги идут из предусмотренного vault строго canonical ATA зарегистрированного получателя и только по immutable coupon snapshot. Это не право произвольного расходования резерва. Existing holder claim остаётся доступным и использует тот же claimed mask. Principal/burn, голосование, immutable terms и старые accounts не меняют полномочия.

API собирает пакет до4 получателей с точной суммой каждому, fresh coherent state, simulation и подписью fee payer. Нельзя изменить размер выплаты или направить её оператору. Бэкенд выдаёт готовые группы выплат в servicing plan. Явно запущенный local test executor выполняет событие последовательно, хранит стабильные recovery IDs и останавливается при unknown/pending. Human wallet остаётся внешним подписантом; никакого автоматического доступа к человеческим ключам.

Вторая задача — exact program deployment identity: новые операции проверяют hash/identity развёрнутого bytecode относительно release metadata. Read-only recovery старых receipts сохраняется. Main ledger8899 не сбрасывается; новый binary запускается в отдельном namespace с проверкой портов/процессов и воспроизводимым launcher.

## Порядок и acceptance

1. Независимый review account/permission/recovery архитектуры. Записать реальные ограничения.
2. Anchor instruction + shared claim helper + runtime проверки: wrong beneficiary/mint/vault/snapshot, early/zero/duplicate payout, claim/settle гонка, после transfer/burn, rollback целого batch.
3. Generated IDL + typed client/request/API batch action, exact per-recipient summary, finite wire size, new action semantic tests. Existing user-signed claim/redeem tests сохраняются.
4. Exact deployment gate + isolated local runtime launcher + recoverable local event executor. No reset, no new signature on unknown outcome.
5. Fresh SBF/Node/type checks и реальный built-origin cycle: смешанные claim/settle, несколько coupons, перевод между dates, principal/burn, late coupon, interruption/recovery, итоговая сверка. Code review initial+не более2 repairs для нового scope.

Lead owns program/client/integration/routes/scripts/release metadata/docs/Git. Program-identity worker (если доступен) owns новый verification module и scoped tests. Independent reviewer owns только отдельный report. Два назначения subagents initially failed due model capacity; это не независимое review, lead продолжает самостоятельно. Каждый агент читает AGENTS/STATE и подходящие установленные skills, сообщает их и передаёт правило в handoff.

Gate: localnet/devnet test assets only, no mainnet/real funds/paid/public visibility/final submission. Проверка подписи человеком, публичное размещение и финальная подача — отдельные факты. Skills не переустанавливать; приватные ключи/credential files не читать и не печатать.
