# Отдельное наблюдение финальности BondTrace

2026-10-08. Root: `C:\Users\dmitrii\Documents\solana`. Это checkpoint worker для текущего авторизованного усиления backend. Существующая ledger/history, ключи, программа, runtime/config, dependencies и Git не изменялись этим worker.

Прочитаны AGENTS.md, CODEX_SOLANA_WORLDSFAIR_START.md, актуальный docs/00-STATE.md и docs/21-BACKEND-FOCUS.md. Применены реально установленные **ProofPilot coach** (direct implementation, bounded plan → review), **solana-dev** (RPC, security, testing) и **review-and-iterate** (security/correctness rubric). Local capability inventory подтверждает установленные файлы; выполнена узкая Solana Documentation Search и чтение официальных RPC страниц. Colosseum/account research не требовался для реализации из существующего задания; никакой новый demand/score не заявляется. Mandatory rule выбирать/читать подходящие установленные SKILL.md перед substantial work сохраняется для lead, review и новых handoff; не переустанавливать пакет без конкретной проблемы.

## Решение и контракт

Успешная confirmed или finalized transaction сохраняет бизнес `chainStatus:'confirmed'`: это совместимо с финансовым servicing/recovery. Финальность отдельна от финансового результата и от чтения account graph на confirmed.

`ReceiptRecord.finality` и результат `transactionStatus` содержат объект `FinalityObservation`:

- `schemaVersion:1`, `signature`, `status:'processed'|'confirmed'|'finalized'|null`;
- `source:'live-rpc'|'retained-observation'|'legacy-unknown'`;
- `observedAt`, transaction `slot`, provider `contextSlot`, bound `genesisHash`.

Свежие наблюдения сохраняются только по валидированному getSignatureStatuses. Identity проверяется до и после status request. Внутри атомарной retention повторно проверяется latest receipt binding и progress, чтобы поздний lower response не переписал более сильное наблюдение. Signature/slot/genesis bind, timestamp и context проверяются при чтении сохранённой финальности.

При `null`/pruned history прежний успешный результат остаётся confirmed с `verification:'recorded-confirmation'`. Если previously наблюдали finalized, возвращается finalized с `source:'retained-observation'` и исходными observedAt/slot/contextSlot. Это сохранённое наблюдение, а не fresh RPC attestation. Legacy confirmed receipt без separate finality получает `status:null,source:'legacy-unknown'`: он никогда не становится finalized по business status или отсутствию истории. Unbound legacy confirmation остаётся unknown; прежний genesis не подставляется молча. Processed error остаётся pending до confirmed/finalized; settled error при pruning сохраняется как recorded rejection.

RPC_REGRESSION/RPC_RECEIPT_CONFLICT/RECEIPT_FINALITY_INVALID, malformed fields/status/error/count, lower context/commitment, settled slot/outcome contradictions и changed genesis fail closed. Они не definitive transaction rejection и не переписывают financial terminal state. Совместимость старых provider/mock optional confirmations/status сохранена: присутствующие поля проверяются; отсутствующие не используются для promotion. Отсутствие статуса после lifetime по-прежнему unknown, а не proof of failure. Восстанавливается та же подпись/operation ID; повторная выплата не разрешается.

## Доказательство исполнения

Старый `TransactionProof` schema1 confirmed остаётся читаемым. Новое capture выдаёт schema2 и `provenance:{source:'live-rpc',method:'getTransaction',requestedCommitment,observedAt}`. `TransactionProofRequest` добавляет optional `commitment:'confirmed'|'finalized'`; default confirmed. Returned proof commitment отражает **фактический параметр getTransaction**. Finalized input делает finalized RPC request; null/error/mismatch не дают finalized proof. Все прежние exact wire/signature Ed25519, numeric metadata и hash checks сохранены. Caller-bound genesisScope раскрыт по-прежнему: getTransaction не возвращает genesis; default retention wrapper сверяет chainIdentity до/после чтения.

При впервые наблюдённой finalized receipt retention выполняет одну automatic upgrade попытку даже после ранее сохранённого confirmed proof/gap. Capture marker теперь хранит optional commitment (старое отсутствие означает confirmed). Finalized gap сохраняет прежнее confirmed доказательство; passive polling не повторяет эту попытку бесконечно. Explicit retry fenced attemptId разрешён. Late context change, mismatch signature/slot/genesis/commitment или finalized result без schema2 finalized-query provenance не прикрепляются. Existing finalized proof не понижается.

`publicExecutionProof` дополнительно возвращает отдельную retained finality и proof provenance с `source:'retained-observation'`, commitment/time/slot/signature/genesis/schemaVersion. matchesStoredReceipt теперь проверяет и signature. Нормализованный proof не является независимой аттестацией (`independentAttestation:false`); криптографическая привязка wire не доказывает честность execution metadata одного RPC. V1 transactions/ALT остаются explicit unsupported proof gaps в существующем decoder, статус финансовой операции при этом не отменяется.

## Проверка

Выполнено:

```powershell
node --import tsx --test --test-concurrency=1 tests/client/finality.test.ts tests/client/transaction-proof.test.ts tests/client/proof-retention.test.ts
```

**23/23 PASS, 0 skipped**. Использованы уникальные ignored namespaces `.local/tests/finality-<uuid>`, transaction-proof и proof-retention. Новая suite: processed → confirmed → finalized → pruned, original retained provenance, legacy/unbound unknown, processed/settled errors, malformed and forged binding, lower context/commitment/changed slot/outcome с сохранением operation ID/business state, genesis change до/внутри status request, old schema1 proof + finalized gap/upgrade/fences, wrong proof signature. Existing codec tests проверяют Ed25519 exact-message binding и now actual finalized-query parameters. Scoped final diff inspected; `git diff --check` прошёл, conflict markers в изменённых worker файлах отсутствуют.

Worker не запускал shared full tests/build, не подписывал live transactions и не проводил built-origin smoke. Lead должен выполнить typecheck + существующие recovery/backend-journal regression suites, экспорт/API wiring и новый built-origin lifecycle, затем сохранить результат в top-level STATE. Financial lifecycle завершение и `finalityPending/awaitingFinalization` координатора принадлежат lead; finalized нельзя выводить из accounts/reconciliation. Installed skills/source/test evidence не являются production/devnet certification.

Проверенные первоисточники, access 2026-10-08: [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses) — signature status и searchTransactionHistory; [getTransaction](https://solana.com/docs/rpc/http/gettransaction) — commitment parameter и null при отсутствии по requested commitment. Solana docs MCP search подтвердил ordered processed/confirmed/finalized semantics и nullable confirmation status; используются официальные первоисточники.

Ownership worker: server/rpc.ts, server/journal.ts, server/transaction-proof.ts, server/proof-retention.ts, tests/client/finality.test.ts, точечные additions tests/client/transaction-proof.test.ts и эта записка. Stopping gates AGENTS сохранены: localnet/devnet only, historical evidence/signers сохраняются; no real funds/paid/mainnet/public visibility/final external submission.
