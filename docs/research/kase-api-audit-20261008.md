# KASE API: targeted correctness repair, 8 октября 2026

Рабочий корень: `C:\Users\dmitrii\Documents\solana`. Это узкое расследование новых воспроизводимых дефектов поверх B01–B05, а не повторная конкурсная оценка и не новый бюджет прежнего assessment. Исходные evidence и журналы сохраняются. Готовность production, devnet или подачи этим отчётом не подтверждается.

Прочитаны AGENTS.md, CODEX_SOLANA_WORLDSFAIR_START.md, docs/00-STATE.md, docs/21-BACKEND-FOCUS.md и docs/22-BACKEND-READINESS.md; исходный HEAD `e416f72`, рабочее дерево уже содержало работу соседнего frontend-чата. Файлы `apps/web` не менялись.

Применены реально установленные `.agents/skills/solana-dev/SKILL.md` (включая релевантные client/account/lifecycle проверки security.md), `.agents/skills/review-and-iterate/SKILL.md` и его code-review-rubric/security-basics/compute-optimization references. ProofPilot явно использован в **coach**, по direct implementation/debugging route из routing.md/solana-new.md; без нового score, onboarding, поиска идеи или внешней передачи закрытого кода. Обязательное правило выбирать и читать подходящие навыки перед существенной работой сохраняется для следующего агента/чата.

## API-01 — P1: одинаковый ID выбирал чужую операцию

**Подтверждённый дефект.** Идентификатор wallet review — SHA-256 message (64 hex), а demo operation принимала любую строку `[a-zA-Z0-9_-]{8,100}`, включая этот hash. Журналы `prepared` и `operations` были раздельными, но `operationStatus` предпочитал `operations` без проверки коллизии. Никакой коллизии SHA-256 не требуется: клиент может передать уже известный hash как demo operationId.

Воспроизведение выполнено на настоящем Kit message/Ed25519 с synthetic RPC и отдельной SQLite `C:\Users\dmitrii\Documents\solana\.local\tests\api-audit-e9e71752-79d0-42fe-b235-57bacbd67e7b`. После создания wallet review добавлена unsigned demo operation с тем же ID и терминальным error. `submitPrepared` отправил **одну** транзакцию, RPC вернул **confirmed**, wallet prepared сохранил подпись; результат API при этом содержал `status:error`, `signature:null`, `chainStatus:not_submitted` от другой операции. Это может подтолкнуть клиента повторить уже выполненное действие. Нет доказательства двойной выплаты или обхода on-chain полномочий.

**Исправление.** В `server/operations.ts` и `server/prepared.ts` резервирование проверяет оба журнала внутри `transactionSync`. Первый владелец ID сохраняется, второй получает `RECOVERY_ID_CONFLICT`/409; формат ID и нормальный replay остаются прежними. Чтение status получает обе строки одним transactionSync и отклоняет историческую неоднозначность. `requirePrepared` отклоняет её до relay. Исторические строки и подписи не удаляются. Если подпись известна, проверка через `/api/transactions/:signature` остаётся доступной; автоматическое разделение неоднозначных исторических metadata не реализовано.

Проверки `tests/client/operation-identity.test.ts`: обе очередности создания, сохранение replay и исходных строк, legacy ambiguity до relay, recovery известной подписи, два реальных процесса, конкурирующих за один ID. Ровно один процесс создаёт запись, второй получает conflict. Lead отдельно обновил `server/index.ts`: HTTP mapper помечает `RECOVERY_ID_CONFLICT` как `recoveryRequired:true`; наличие этого условия проверено чтением исходника, HTTP запуск этого mapper здесь не выполнялся.

## API-02 — P2: issuance после закрытия пустого зарегистрированного ATA

Программный агент подтвердил on-chain дефект: пустой зарегистрированный SPL ATA можно закрыть и создать заново, после чего старый unconditional thaw отклонял issuance. API отдельно запрещал initialized empty ATA и не восстанавливал отсутствующий. Полномочия issuer, draft и first-record-date gates продолжают действовать.

Новый regression сначала упал на старом API с `INVALID_TOKEN_ACCOUNT`. Исправлен `server/admin.ts`: отсутствующий **канонический** ATA создаётся idempotently в той же транзакции перед issue; initialized ATA допускается только с `amount=0`, frozen допускается как ранее. Проверки mint, owner, delegate, close authority сохраняются; beforeHolderUnits для отсутствующего ATA равен точному `0`. Тест отдельно отвергает initialized positive, другой mint/owner, delegate и custom close authority.

Согласовано с программным агентом: handler thaw только Frozen, иначе требует Initialized+0, затем mint и freeze. API patch самостоятельно не обновляет deployed SBF. Проверку нового program artifact и live deployment выполняет lead; до неё успешный live flow не заявляется.

## Проверено в этой работе

| Проверка | Результат |
|---|---|
| Новый admin regression до patch | Ожидаемо воспроизвёл INVALID_TOKEN_ACCOUNT |
| `node --import tsx --test tests/client/admin.test.ts tests/client/admin-recovery.test.ts` | 14/14 passed, 0 skipped |
| `node --import tsx --test tests/client/operation-identity.test.ts tests/client/recovery.test.ts tests/client/demo-lease.test.ts tests/client/backend-journal.test.ts` | 28/28 passed, 0 skipped |
| Scoped `git diff --check` | Passed |
| Live RPC / ledger / signer files / process restarts | Не использовались и не менялись |
| Full typecheck, rebuilt origin, current SBF integration | Передано lead; этим агентом не заявлено |

Тесты используют уникальные ignored `.local/tests` namespaces, synthetic public metadata и перехваченный fetch. В исходном reproducer создавался временный signer в памяти; ключ на диск не записывался. Самостоятельные правки ограничены admin.ts, operations.ts, prepared.ts, admin.test.ts, operation-identity.test.ts и этой запиской. Git mutations, installs, config и frontend не выполнялись.

## Остаточные границы, не объявленные новыми finding

Crash после durable signed receipt и до фактического send по-прежнему приводит к безопасной неопределённости: recovery читает status и не создаёт новую подпись, автоматического rebroadcast тех же bytes нет. Это известная граница выбранного fail-closed подхода; здесь она не выдаётся за новый регресс B03 и не изменяется без отдельного решения.

Предложение/ballot discovery через local catalog, ограничение 16 holders/8 coupons, RPC honesty и confirmed вместо production finality остаются ранее раскрытыми границами. Аудит API не нашёл нового доказанного bypass signer/issuer checks; отдельные chain account/consistency вопросы принадлежат другим назначенным агентам.

Официальный источник, перечитан 2026-10-08: [Solana getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses) — проверка ведётся по конкретной transaction signature; history search явно задаётся в запросе. Источник подтверждает семантику RPC, а не результаты synthetic tests. Страница advanced/retry была недоступна через инструмент и не использовалась как доказательство.

Следующий шаг: lead объединяет HTTP recovery marker, программный fix и другие disjoint изменения, выполняет общий typecheck и узкую integrated/live проверку в разрешённом scope, обновляет top-level checkpoint. Сохранить mandatory skill rule, original ledger/evidence/signers и внешние gates: никакого mainnet, реальных активов, платных услуг, изменения visibility или финальной подачи.

## Independent repair 1: пустой закрытый ATA с lamport balance

Независимый critic обнаружил пропущенный вариант API-02: после закрытия ATA перевод 1 lamport на его адрес создаёт System-owned account с пустыми данными. Такой адрес можно восстановить через idempotent ATA create, но optional `token()` продолжал возвращать `INVALID_TOKEN_ACCOUNT`. Исходный critic reproducer сохранён отдельно в `.local/tests/servicing-critic-bad8e52c5af84007ad815e20f0c325f9/ata.test.ts`. Это первая evidence-driven repair нового feature scope; прежний бюджет B01–B05 не перезапускается.

Добавленный repository regression сначала воспроизвёл отказ. `server/admin.ts` теперь допускает vacant System account **только** в optional recovery branch и после проверки, что адрес совпадает с ATA от ожидаемых owner/mint. Envelope требует `executable:false`, целый неотрицательный safe lamport balance, точную пару `['','base64']` и отсутствующий либо нулевой `space`. Настоящие SPL token accounts проходят прежние mint/owner/state/delegate/close-authority проверки; непустой либо некорректный System account не принимается за отсутствующий.

Проверка `node --import tsx --test tests/client/admin.test.ts tests/client/admin-recovery.test.ts`: **15/15 passed, 0 skipped**. Новый regression проверяет issuance и регистрацию на lamport-funded canonical ATA, а также отвергает 16 некорректных envelopes: непустые/неправильно закодированные/неполные data, executable true или отсутствующий, чужой owner, отрицательные/дробные/строковые/отсутствующие/неточные lamports и ненулевой space. Live программа, ledger и кошельки этим агентом не использовались. Runtime funded-recreation проверка и общий typecheck остаются интеграционной задачей lead.

Повторно проверены актуальные AGENTS/STATE; уже прочитанные неизменённые `solana-dev`, `review-and-iterate`, ProofPilot coach/direct-debugging инструкции переиспользованы. Изменены только назначенные `server/admin.ts`, `tests/client/admin.test.ts` и эта записка. Правило обязательных навыков и границы авторизации сохраняются в продолжении.
