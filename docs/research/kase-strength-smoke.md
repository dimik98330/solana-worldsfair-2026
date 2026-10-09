# Драйвер настоящего усиленного localnet цикла

2026-10-08. Root: `C:\Users\dmitrii\Documents\solana`. Driver ownership: **новый** scripts/strength-smoke.ts и эта записка. Никакой live chain transaction, API/validator restart или bootstrap этим worker не выполнен; запуск принадлежит lead. Создание driver не является successful integration evidence.

Current AGENTS/STATE и strengthening scope перечитаны. Уже прочитанные неизменённые ProofPilot **coach** direct-implementation/evidence guidance, solana-dev RPC/security/testing и review-and-iterate переиспользованы; mandatory rule выбрать/прочитать реально установленные SKILL.md перед substantial task сохраняется во всех handoff. Judging материалы другого worker и старые assessment budgets не затронуты; scores не заявляются.

## Запуск lead

Перед запуском использовать **сохранённый runtime текущего release**: `.local/backend-execution/<release.sha256[0:12]>/runtime.json`. Требуются готовый native ledger, verified release, bootstrap generated fixture issuer и его test settlement mint. Driver проверяет network=localnet, точное dataDirectory/RPC, wsl-native storage/readiness и deployed hash. PORT3160/RPC8959 — текущий lead выбор, source не hardcodes эти порты.

```powershell
# Set these from the exact current saved runtime, never from another ledger:
$env:BONDTRACE_NETWORK = 'localnet'
$env:BONDTRACE_DATA_DIR = '<runtime.dataDirectory>'
$env:SOLANA_RPC_URL = '<runtime.rpcUrl>'
$env:PORT = '<runtime.apiOrigin port>'
node --import tsx scripts/strength-smoke.ts
```

Evidence default — уникальный `docs/evidence/execution-strengthening-<timestamp>-<id>.json`, созданный exclusive `flag:'wx'`. Optional BONDTRACE_STRENGTH_EVIDENCE/BONDTRACE_EXECUTION_EVIDENCE принимает только новый docs/evidence/execution-*.json. Это формат, совместимый с основными fields существующего cold verifier: receipts/auxiliary/runs/archivedProofs/state/program/bond/origin/rpcUrl; новые job/finality/native-restart sections additive. Старый verifier не объявлять passed без его настоящего запуска на этом artifact.

## Реальный сценарий

Driver создаёт новый rate instrument с25 units/6 generated holders `[10,5,3,2,4,1]`, face1000 test settlement units, annual10%, frequency2, двумя coupons50. На chain clock: record1+180секунд, record2+240, maturity+300; payment=record+1. Source assert проверяет financialTerms PDA/rateBasis и exact amounts on-chain. Generated external signers остаются в памяти; private keys/raw wire не попадают в public artifacts. Existing generated issuer key files не переписываются.

Только необходимые test funds: test settlement mint до27500 при реальном source gap и по0.01 test SOL каждому новому holder. Перед record1 выполняются register/issue/fundexact27500/seal и vote yes10/no5. Setup обязан завершиться до первой даты; иначе driver останавливается и сохраняет public recovery metadata, не создаёт второй выпуск.

Parent lifecycle с maxTransactions1 сначала waiting_date/noTx. Resume capture0 → transfer2 отholder0 кholder1 → external holder0 claim500 с сохранением snapshot10. Coupon run оставшихся пяти:4+1. После первой группы controlled RestartApi использует существующий backend-runtime.ps1, который проверяет recorded listener/PID/start/genesis. GET после restart обязан сохранить parent digest, capture signature, batch signature и first completed group. Explicit resume завершает оставшуюся группу. Capture1/coupon1 выполняет coordinator; holder0 snapshot8→400. На maturity coordinator только begin redemption и awaiting_holder_signature с6 exact requests. Все6 principal signatures выполняются отдельными external generated holder signers.

Закрытие требует coupon2500, principal25000, cash27500, liability0, supply0 и redeemed25. Parent signature всегда null. Same-parent explicit replay не меняет дочерние подписи. Aggregate job finality остаётся unknown/finalityPending для не связанных с parent holder signatures: financial graph не удостоверяет finality.

Driver отдельно наблюдает каждую фактическую signature до **live-rpc finalized** с общим bounded deadline60секунд, затем проверяет schema2 finalized getTransaction proof, exact signature/wire binding и retained provenance. Ни absent/pruned, ни confirmed не повышаются до finalized. После этого controlled RestartValidator через тот же launcher не reset ledger; проверяются samegenesis/hash/ledger/data/readiness, exact totals/supply/terms, parent digest/child signatures и финальные transaction observations. Export payload SHA сверяется.

Количество считается по уникальным реальным signatures. Не hardcode39: optional settlement mint может добавить transaction. Public ignored progress file сохраняет operation ID/ожидаемую signature **до** wallet submit и parent status после resume. Financial POST не повторяется автоматически; ambiguous submit/child/result останавливает driver. Только GET reads имеют bounded transport retry. При interruption восстановить сохранённые identifiers; повторный запуск driver создаёт новый выпуск и не является recovery старого.

## Проверка worker и пределы

`npm run typecheck` прошёл. Driver **не запускался**. Whitespace/conflict checks прошли; live dates, proofs, native restarts и exclusive evidence будут доказаны только успешным lead run. During driver inspection обнаружена direct child normalized bond binding ошибка; по отдельной authorization исправлены lifecycle-run.ts/test и добавлена настоящая normalizeRequest regression. **16/16 lifecycle tests PASS** в isolated mock namespaces, никаких chain writes.

Lead дальнейшие действия: inspect driver → execute against saved native runtime → cold read-only verification → preserve logs/evidence → update STATE/checkpoint. Никакой issuer burn, human wallet/devnet/real asset/production certification не заявляется. Existing historical ledgers/signers/evidence, other UI/source/dependencies/config/Git сохранены; mainnet/paid/public visibility/final submission/consent вне допуска.
