# Независимый engineering review восьми требований владельца

Дата: 8 октября 2026. Режим ProofPilot: coach, review, confidential project source. Контекст reviewer отдельный; желаемый вердикт и score не передавались. Это новый ограниченный review owner-audit scope, а не сброс budget старых backend/servicing/execution reviews.

## Границы и метод

Прочитаны AGENTS.md, CODEX_SOLANA_WORLDSFAIR_START.md, docs/00-STATE.md, AUDIT.md, backend focus/execution plans и актуальный dirty-tree diff. Reviewer не изменял source/config/Git/dependencies/processes/chain; единственный разрешённый файл записи — этот отчёт. Общие builds/tests запускает lead, reviewer читает их реальные сохранённые результаты. Во всех handoff/продолжениях сохраняется правило: до существенной работы выбрать и прочитать фактически установленные SKILL.md и подходящие references, затем сообщить выбранные навыки.

Навыки реально прочитаны: `.agents/skills/proofpilot/SKILL.md` (coach; routing, direct Solana implementation, review, quality, quality-review, evidence, safety); `.agents/skills/solana-dev/SKILL.md` (security, testing, Anchor); `.agents/skills/review-and-iterate/SKILL.md` (security basics, review rubric, compute optimization). Numerical review grade не вычислялся: задача требует конкретной engineering проверки, а не конкурсного балла.

Проверялись в первую очередь опровергающие evidence: freeze резервного ATA, подписанная ставка и её связь с выпуском, сохранение wire/signature до send, ambiguity/expiry/release boundaries, exact payment masks, atomic burn/payment и повторяемость launcher. Установка навыков или зелёная mocked-RPC проверка отдельно не принимается за working deployment.

## Исходный дефект A01 и проверенный ремонт

Сохранённый `.local/backend-execution/audit-frozen-baseline.log` содержит фактическое исполнение прежнего SBF: `frozen_reserve_cannot_activate_even_when_fully_funded`, reserve 10500000000 base units, `seal_succeeded=true phase=1`, после чего regression assertion падает. Это доказанное исходное нарушение готовности выплаты; не доказанный захват средств или double payout.

Текущий `programs/bondtrace/src/lib.rs:213` требует Initialized settlement vault перед ACTIVE. `server/admin.ts:176` аналогично отклоняет frozen vault перед подготовкой. Сохранённый `audit-program-tests.log` подтверждает current SBF: seal failed, phase remained DRAFT; thaw → seal → coupon 500000000 → principal 10000000000 → supply/vault zero. В том же логе 3 unit и 12 SBF/SPL runtime tests прошли без skipped/ignored. Build log и `programs/bondtrace/release.json` согласованы: 483008 bytes, SHA256 `2c00cf68701f7769fd6a730aa62723d34fb66255db635fd1a1c7e58b7d45b0ff`.

Дальнейшая freeze после активации остаётся зависимостью от settlement-mint authority; ремонт A01 не превращает сторонний settlement token в production guarantee.

## Проверенные семантические границы новых изменений

- `server/rate-terms.ts:20–29` принимает rate/frequency как optional exact pair; u64 base units/BigInt, положительная и точно делимая регулярная выплата. `server/request-contract.ts:37–42` выводит пропущенную coupon unit amount и отклоняет конфликт с формулой. Fixed/irregular coupons без descriptor сохраняются.
- `server/rate-terms.ts:50–72` проверяет confirmed creation receipt, canonical retained wire, matching first signature, issuer signer/Ed25519 signature, точный Memo и initialize instruction того же выпуска. `server/admin.ts:203–207` дополнительно сравнивает все immutable terms с chain Bond до catalog projection. `server/catalog.ts:114` запрещает замену rate provenance; `server/state.ts:22–25` повторно связывает номинал и каждую coupon amount с chain. Это issuer-signed creation memo, не новые Bond account fields.
- `server/transactions.ts:88` сохраняет exact signed wire, signature, operation ID, release/genesis/lifetime атомарно до первого relay. Passive `operationStatus` не отправляет transaction. `server/rebroadcast.ts` проверяет retained wire/all signatures, intent identity, genesis/network, успешный предыдущий status, deployed release и lifetime; explicit POST повторно передаёт исходные bytes/signature. Expired ambiguous receipt остаётся unknown; новый message/новая подпись не создаются. Ответ RPC, потерянный после relay, не становится definitive failure.
- Coupon PDA init и index progression дают однократную запись snapshot; дальнейшие transfer/burn не переносят прежние units. Claim и settle используют `pay_coupon` и один mask. Permissionless settle получает canonical beneficiary ATA, principal transfer/burn находятся в одном runtime transaction. Existing test log покрывает unauthorized/early/duplicate/wrong accounts, transfer cutoff, amount shortage/overflow и payment-CPI rollback после burn.
- Proof export явно ограничивает scope retained observation. `server/transaction-proof.ts` связывает RPC outcome/slot/wire/проверенные подписи, ограничивает decoded formats и сверяет pre/post metadata. SHA export обозначен как integrity hash, не on-chain commitment или независимая аттестация.

Официальные технические sources проверены 8 октября 2026: [Memo interface](https://www.solana-program.com/docs/memo) — каждый переданный Memo account должен подписать transaction; [Solana transactions](https://solana.com/docs/core/transactions) — atomic instruction execution и Ed25519 signatures; [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses) — status по первой подписи и ограниченный recent cache без history option. Source/source-runtime conclusions выше не заменяются этими общими docs.

## Важные ограничения заявления

Existing Issuer UI (`apps/web/src/issuer-validation.ts:12–13,98`, `IssuerSetup.tsx:354`) создаёт fixed coupon schedule без полей annual rate/frequency. Новые regular-rate terms доступны в API/lifecycle; не следует заявлять, что отдельная UI форма ставки уже поставлена. При утрате catalog/receipts Bond account самостоятельно восстанавливает exact amounts, dates и финансовые права, но не оригинальный annual descriptor из Memo.

Canonical example 10 × 1000 × 10% ÷ 2 = 500; 10 × 1000 = 10000 проверен отдельной SBF regression без transfer. Новый live execution script имеет 25 units и два одинаковых coupon: ожидаются 2500 coupon / 25000 principal. Его holder1 имеет snapshot10 (coupon500), затем переводит2 units, поэтому principal этого holder1 будет8000. Cohorts не смешивать; старый execution evidence с1875 coupons остаётся историческим.

16 holders / 8 coupons / atomic batch до4 / proposal discovery до32, whole bonds, classic SPL settlement6 decimals, full prefunding и отсутствие excess withdrawal — явные пределы прототипа. Freeze authority/RPC trust/finite history, human-wallet test, fresh-machine reproduction, devnet/public demo и final submission остаются отдельными границами. Local Explorer URL требует соответствующий живой validator.

## Текущий review status

Initial source inspection не установил нового material engineering дефекта в A01–A05 repair beyond the recorded original A01. Итоговый verdict ПОКА НЕ ДАН: свежий полный lifecycle, final Node/UI/build checks, final delivered docs и frozen ProofPilot packet ещё ожидаются. Их результаты будут добавлены отдельным cutoff ниже; этот исходный review текст сохранится.

## Новое фактическое evidence: launcher O1

После initial source inspection полный `audit-lifecycle-demo.log` завершился ошибкой `Validator did not become ready`. Сохранённые validator logs `validator-1791452345047.log` и `validator-1791452470943.log` устанавливают причину: `serve_repair_quic`, `No available UDP ports in (13030, 13060)`. Несколько изолированных validators использовали один маленький fixed dynamic-port pool. Это подтверждённый дефект воспроизводимости A05 на подготовленном компьютере с сохранёнными прежними ledger; не финансовый exploit.

O1 передан lead с reproducer: старые validators оставить живыми, вызвать новый lifecycle/launcher на8939/3140; readiness падает до lifecycle. Конкретный ремонт: выбрать bounded UDP pool отдельно от других активных RPC namespaces и быстро обнаруживать exit child process, сохраняя ledger/logs. Current `backend-validator.sh` выбирает port-derived pool, current `backend-runtime.ps1` проверяет child.HasExited. Source repair прочитан; фактический repaired run ещё ожидается. Возможные port collisions должны оставаться явным stop, без остановки чужих validators.

Свежий `audit-node-tests.log` независимо прочитан:183 passed,0 failed/cancelled/skipped, runtime129955ms. BigInteger calculation отдельно воспроизвела canonical coupon500000000/principal10000000000 и new25-unit cohort coupon2500000000/principal25000000000 base units. Полный successful live artifact пока отсутствует.

## Новое фактическое evidence: launcher O2 и продвижение repair

`audit-lifecycle-demo-repair1.log` подтверждает успешную readiness repaired validator/API: RPC8939, API3140, verified release2c00…, genesis `7EKZqLhf5y3tcBpAGzRLRR9QF7ST7cV2g4GCRfu4ruuw`. Поэтому первоначальная UDP причина O1 операционно устранена. После readiness обнаружен другой реальный дефект O2: `Set-Content -NoClobber` на `lifecycle-demo.ps1:26` не существует в текущем PowerShell7.6; bootstrap ещё не запущен, команда завершилась ошибкой. Требуемый конкретный ремонт — cmdlet с поддерживаемым exclusive/no-overwrite режимом.

Current `lifecycle-demo.ps1:26` использует `Out-File -LiteralPath … -Encoding utf8 -NoClobber`, сохраняет старый recovery ID и не заменяет существующий файл. В `audit-lifecycle-demo-repair2.log` уже наблюдаются confirmed initialize/register/issue/fund/seal/proposal/ballot transactions выпуска `57iYMPYrnjcPZhhjRzDBKCKNPafY6sqawnqbpLAYGuWE`. Это подтверждает прохождение repaired bootstrap boundary O2; полный финальный цикл ещё не завершён на данном cutoff. Initial/repair1 failure logs сохранены, исходный partial report не переписан в безусловный pass.

## Fresh full-cycle cutoff: 09:50:13 UTC, 8 октября 2026

Фактический `audit-lifecycle-demo-repair2.log` завершился `passed:true` и unique artifact `docs/evidence/execution-audit-20261008-144825-adc8a8ab.json`. Reviewer прочитал артефакт отдельно: API3140/RPC8939, bond `57iYMPYrnjcPZhhjRzDBKCKNPafY6sqawnqbpLAYGuWE`, genesis `7EKZqLhf5y3tcBpAGzRLRR9QF7ST7cV2g4GCRfu4ruuw`, known-match SBF2c00…; 29 wallet +4 operator +6 auxiliary transactions, 39 retained proofs captured с expectedWireMatched/matchesStoredReceipt. Отдельные faucet/bootstrap signatures не включаются молча в этот39-action cohort.

Два coupon по1250000000 paid, суммарно2500000000; principal25000000000, cash27500000000, remaining obligations0, mint supply0, vault0; proposal11 yes10/no5. Первый atomic operator batch808bytes/184126CU; API restart между groups и replay сохраняют first child signature. Signed rate terms присутствуют: face1000000000, rateBps1000, frequency2, coupon unit50000000, creation signature совпадает с initialize receipt.

| Требование владельца | Независимо прочитанное подтверждение | Практическая граница |
|---|---|---|
| 1. SPL инструмент и параметры | current Bond/SPL accounts, signed initialization Memo с rate/frequency, exact catalog/chain term reconciliation | Rate descriptor через API/lifecycle; existing form — fixed coupons |
| 2. Реестр держателей | six-holder live registry; complete16-holder SBF maximum runtime | Sealed permissioned registry, whole units,16wallets |
| 3. Immutable record-date snapshot | live capture → transfer → прежнее право500; runtime cutoff/PDA/snapshot attack cases | Scheduled transfer lock until complete capture, не historical indexer |
| 4. Exact coupon/principal | BigInteger formula, frozen-vault regression500/10000; new cohort2500/25000 | Cohorts с transfer и без transfer не смешиваются |
| 5. Реальная выплата купона | live holder claim +4 operator transactions, SPL before/after retained proof, both coupon paid totals | Real test SPL transfer, без fiat rails/real assets |
| 6. Погашение и burn | six actual principal receipts, supply0/vault0; runtime CPI rollback после burn | Holder-signed redemption, maturity snapshot |
| 7. Дополнительное действие | proposal11/ballots yes10/no5; one-ballot/runtime date guards | Informational voting, без автоматического governance execution |
| 8. Проверяемый on-chain outcome |39 exact retained execution proofs, signatures/genesis/release, coherent final accounting | Trusted configured local RPC, finite history; не public/devnet attestation |

O1 и O2 закрыты успешным целым repaired command; A01 закрыт corrected actual SBF regression и новым known-match release. Нового material финансового дефекта в проверенном scope не установлено. Основной engineering lifecycle подтверждён в разрешённой localnet/test-assets среде. Итоговый ProofPilot review доставляемых документов ещё ожидает frozen packet/diagnostics; этот раздел не объявляет mainnet, external submission или независимую production certification.

Дополнительное minor hardening наблюдение O3 передано lead: `verify-lifecycle.ts` семантически проверяет rate Memo только если current API state ещё содержит rateTerms. Для обещанного повторного annual-descriptor check следует требовать current descriptor, когда он был в исходном artifact, и сравнивать их. Current reviewed full cycle descriptor содержит; это не обесценивает его actual proof. Current verifier отдельно перечитывает configured RPC transactions и API state, а не использует второй независимый RPC provider.

## Deliverable documentation finding O4

README section `Run on the prepared Windows workspace` ещё использует launcher defaults8929/3130 и сообщает visit3130; current reviewed2c00 namespace уже записан за8939/3140, предыдущая среда8929 сохранена отдельно. Поэтому именно эту top recipe launcher корректно отклонит как чужой/другой ledger; новый раздел Verification с `npm run demo:lifecycle` корректен. O4 передан lead до final freeze. Требуемый конкретный ремонт: explicit `-RpcPort 8939 -ApiPort 3140` в prepared runtime/restart commands и соответствующие URLs, либо primary lifecycle command. Исторические1875 totals в README названы отдельным старым artifact; они не считаются новым финансовым результатом и не требуют удаления.

## Final engineering resolution cutoff: 09:55:37 UTC

O3 исправлен: `verify-lifecycle.ts:35` требует exact current rateTerms deep-equality с первоначальным artifact, когда descriptor был сохранён; утрата metadata теперь не пропускает semantic Memo check. O4 исправлен в README: prepared runtime/restart commands и visit URL явным образом используют8939/3140; прежние environments названы отдельными.

`audit-live-verify.log` реально подтверждает fresh RPC reread39 signatures, тот же genesis/release, coupon2500000000/principal25000000000/supply0/vault0. `audit-ui-tests.log` —52/52 passed,0failed/skipped/cancelled. `audit-web-build.log` завершён успешно с built bundle `index-C6TMVciO.js`. Это verification functional source/evidence, не visual owner acceptance.

Отдельный live commit-before-send check имеет собственный artifact `docs/evidence/rebroadcast-audit-1791453337606-e5bc1c10-8577-4260-b03b-237cc968d0bf.json` и signature `4GJtZNL2ica6WndmyzygEsRaYTe8gfQhqQFZ7TqQ4i7SrF1K6e1ngPjkJy8UXwPZNuvRBWFSZ6ntejrbAncJjENp`. В том же localnet процесс сначала сохранил signed receipt, injected network interruption произошёл до first relay, recipient balance оставался0; отдельный API process rebroadcast подтвердил исходную signature/bytes. Completed replay не создал второй перевод; balance ровно890880 test lamports. Размер получен через actual `getMinimumBalanceForRentExemption(0)`. Исходная попытка fixture с10000lamports отклонялась simulation до этого boundary и сохранена в `audit-live-rebroadcast.log`; она не являлась успешной crash проверкой и не доказывала recovery bug. Corrected test log `audit-live-rebroadcast-repair.log` —pass. Эта дополнительная test-SOL операция не входит в39-signature bond cohort.

Engineering verdict: восемь требований подтверждены в явно ограниченном localnet test prototype scope; исходный frozen-reserve дефект и наблюдённые launcher/documentation замечания исправлены и проверены. Не установлено оставшегося material source defect в рассмотренном scope. Указанные пределы UI/registry/settlement authority/RPC/public-deployment остаются существенными disclosure, а не скрытыми pass. Final application/document quality review будет привязано к отдельно предоставленному frozen packet; новых formal scores и нового budget старых reviews не создаётся.
