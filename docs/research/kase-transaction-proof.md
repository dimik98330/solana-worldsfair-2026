# Публичное доказательство исполнения при подтверждении

8 октября 2026. Root: `C:\Users\dmitrii\Documents\solana`. Новый конкретный пробел обнаружен lead при live verification: после удаления validator transaction history подтверждённые accounts сохранились, а свежий getTransaction уже не мог вернуть per-transaction данные. Это не повод объявлять старую выплату ошибочной или повторять её.

Прочитаны актуальные AGENTS/STATE; исходные START и неизменённые навыки переиспользованы в том же контексте. Использованы `solana-dev` security/RPC/testing, `review-and-iterate` и ProofPilot **coach** для bounded implementation tradeoff. Mandatory rule выбирать/читать установленные навыки перед substantial work сохраняется в handoff. Этот worker владеет только `server/transaction-proof.ts`, `tests/client/transaction-proof.test.ts` и данной запиской. Journal/RPC/endpoint/export wiring, retention policy и live validator history принадлежат lead.

## Контракт

`captureTransactionProof({signature,slot,genesisHash,expectedWireBase64?}, readRpc=rpc)` выполняет ровно один `getTransaction` с `encoding:base64`, `commitment:confirmed`, `maxSupportedTransactionVersion:1`. Предполагается вызов с уже наблюдённой confirmed signature/slot. Входной genesis обязан быть валидным адресом, но он **привязан вызывающим кодом**: getTransaction не возвращает genesis. Поле `genesisScope:'caller-confirmed-context-not-returned-by-getTransaction'` раскрывает это явно; функция не делает второй genesis RPC.

Результат:

- `{status:'captured', proof}` — валидированное компактное публичное наблюдение с source `retained-confirmed-rpc-transaction`, capturedAt, confirmed slot/blockTime, signature, caller-bound genesis, wire/message SHA-256, version, wire length, accountKeys, exact pre/post lamport/token balances, fee и nullable CU.
- `{status:'unavailable',code,message,attemptedAt}` — явный пробел из-за pruned/null history, недоступного RPC, некорректного metadata, неподдерживаемой версии или ALT. Нет default success/zero и нет исключения, которое должно отменить confirmed financial outcome.

`expectedWireMatched:true` выставляется только при точном совпадении с supplied retained bytes. При отсутствии expected wire поле равно `null`. Все required Ed25519 signatures дополнительно проверяются против decoded message; первая signature обязана совпасть с requested receipt. Это усиливает привязку message, но **не удостоверяет правдивость RPC execution metadata**.

## Валидация и пределы

RPC slot обязан совпасть с observed confirmed slot; meta.err должен явно быть null. Wire и compiled message проходят каноническое decode/re-encode сравнение; подписи, header, account count и instruction indexes сверяются. Первый scope поддерживает legacy/v0 без ALT. V1 и любые addressTableLookups возвращают explicit unsupported gap; loadedAddresses не могут быть ненулевыми при отсутствии lookup tables.

Pre/post lamport arrays содержат ровно по одному bounded safe integer для каждого decoded account. Сумма pre−post обязана равняться exact fee; JSON-числа за пределами safe integer отвергаются вместо округления. Fee обязательна. Token arrays обязательны; duplicate/out-of-range indexes отвергаются. Token raw amount — canonical decimal u64 string, decimals0…255, mint/owner/program addresses валидируются. Один mint должен иметь согласованные decimals; смена mint/program identity того же token account внутри транзакции относится к unsupported proof scope. Отсутствующий optional owner/programId сохраняется как null, не подставляется из ожиданий приложения. UI float amounts не используются.

CU или blockTime могут отсутствовать/быть null и сохраняются как unknown; некорректный присутствующий тип отвергается. Никакие logs, inner-instruction free text, private keys или raw wire/signature byte arrays в proof не сохраняются. Limits: wire до4096 на decode, supported legacy/v0 до1232; accounts/token rows до256; итоговый normalized JSON не более65536 bytes. Hashes не заменяют исходное signed message для самостоятельной offline Ed25519 verification; `independentAttestation:false` всегда явно сохранено.

## Проверено

`node --import tsx --test tests/client/transaction-proof.test.ts`: **10/10 passed,0 skipped**. Сценарии охватывают legacy/v0 success, one-RPC contract, exact wire/signature/slot, altered message with retained signature, pruned/null/transport failure, malformed input genesis/slot/signature, failed/missing meta outcome, fee omissions/unsafe values, lamport conservation, duplicate/malformed/missing token balances, unknown CU/labels, v1/ALT unsupported, bad instruction indexes и trailing wire bytes.

`npm run typecheck` прошёл после исправления только test-fixture control-flow narrowing. Файлы проверены на whitespace/conflict markers. Тесты используют реальные Kit codecs и временные in-memory generated test signers для проверяемых public signatures, synthetic RPC и отдельный ignored namespace. Private keys не читаются из пользовательских файлов, не записываются и не выводятся. Live RPC, ledger/processes, config, shared journal и UI этим worker не изменялись.

## Интеграция lead

Capture нужно сохранять непосредственно при первом confirmed observation, пока history доступна. Once-only attempt marker предотвращает повторный getTransaction на каждом passive polling; отдельный explicit proof request может позднее повторить отсутствовавший capture. Retained proof должен оставаться `retained-confirmed-rpc-transaction` после pruning, а не называться fresh verification. Отсутствующее доказательство не позволяет создавать новую финансовую подпись и не отменяет подтверждённую выплату. Этот модуль не управляет сохранением, retry policy и production finality.

Official primary sources прочитаны2026-10-08: [getTransaction](https://solana.com/docs/rpc/http/gettransaction) описывает confirmed lookup, null и base64/version options; [RPC JSON structures](https://solana.com/docs/rpc/json-structures) задаёт slot/meta, pre/post balances и optional token metadata. Установленные Kit type declarations отдельно проверены для compiled message/header/instruction indexes. Ни RPC honesty, ни source-to-binary attestation, ни independent financial audit этими unit tests не подтверждены.

Следующий шаг: lead интегрирует optional retained proof в receipt/export, проверяет capture в новом built-origin cycle с достаточной history retention. Сохранить AGENTS mandatory skills, historical evidence/signers и gates: без mainnet/реальных средств/paid/Git visibility/final submission.
