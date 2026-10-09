# Backend servicing — 8 октября 2026

Активный запрос владельца: проверить полный цикл KASE и усилить backend, пока другой чат меняет дизайн. Root: `C:\Users\dmitrii\Documents\solana`. Frontend, зависимости и чужие изменения не принадлежат этому проходу.

ProofPilot coach, scoped implementation, plan → review; domains web3/web2, hackathon, confidential source. Применены установленные solana-dev (security/testing), review-and-iterate; официальные Solana RPC docs. Старые B01–B05 и их исчерпанный assessment budget сохранены. Этот проход проверяет новые найденные дефекты и новую функциональность; не повышает прежний балл и не аттестует production.

## План и критерии

1. Программа и API: проверить record date, купоны, maturity, подписи, повторное исполнение. Исправлять только воспроизведённые дефекты, с узкими регрессиями.
2. Обнаруживать голосования по Solana accounts, чтобы восстановление не зависело только от локального каталога. Суммы остаются из единого confirmed context, границы discovery указываются явно.
3. Серверный план обслуживания: ожидаемые даты, доступные действия, держатели с невыплаченными правами, причины блокировки. Полное погашение токенов не означает завершения всех расчётов, если остались купоны.
4. Выгрузка доказательств: условия, держатели, snapshots, точные суммы, контекст сети и локально сохранённые receipts с честной областью подтверждения.
5. Изолированные tests, typecheck, actual SBF runtime и read-only проверка новых API через built origin. Новые изменения контрактов проверять отдельным validator; старый ledger/ключи/исторические proofs не менять.

Ownership: lead — servicing/evidence, state/reconciliation/index, packages/client, docs и интеграция; program_audit — program lib/runtime; api_audit — admin/operation identity и scoped tests; chain_discovery — chain-view/proposal-discovery и scoped tests. Нет Git/install/config/UI операций у агентов. До substantial task каждый читает AGENTS/STATE, выбирает установленные skills и сообщает использованные.

Stop gate: localnet/devnet test scope only. Mainnet, реальные деньги, paid services, public visibility и финальная подача не разрешены этим запросом. Инженерная полнота не равна готовности инфраструктуры биржи.
