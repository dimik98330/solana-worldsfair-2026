# Усиление backend: технические результаты

Финальная проверка завершена9октября2026, UTC+5; executiontimestamps сохранены в UTC. Корень `C:\Users\dmitrii\Documents\solana`. Прямое поручение — выполнить S01–S06 из [плана](29-BACKEND-STRENGTHENING.md), продолжить функциональный backend и подготовить проверяемые материалы для ProofPilot. Это отчёт инженера; он не обещает конкурсные баллы или production certification.

## Реализовано

| Этап | Реализация | Проверяемое поведение |
|---|---|---|
| S01 Runtime | Отдельный native Linux ledger, project-selected WSL distribution, сохранённый genesis/release, проверка RPC/getHealth/движения slot/SQLite read-write и места на native/metadata/VHD backing disks | Старый ledger не сбрасывается; процесс с живым PID и мёртвым RPC не считается готовым; supervisor не подписывает финансовые действия |
| S02 Условия выпуска | Аддитивный `initialize_rate_issue` атомарно создаёт Bond/mint/vault +61byte FinancialTerms PDA | Программа проверяет checkedu128 формулу и каждый coupon; неправильный прямой вызов отклоняется; старый Bond layout/fixed initializer сохранены |
| S03 Finality | Business status отдельно от signature-bound processed/confirmed/finalized и live/retained provenance | Pruned/legacy не повышается; conflicting settled slot/outcome fail closed; schema2 proof делает фактический finalized RPC query |
| S04 Последовательности | SplitMix64 seeds, детерминированные адреса, независимая финансовая модель в LiteSVM |64 последовательности successful/rejected transfer/capture/claim/settle/vote/burn/rollback; seed воспроизводим |
| S05 Воспроизведение | `reproduce-source.mjs`, source allowlist, новая `.local/reproduction/<id>/source`, новые keys/fixtures/genesis, frozen SBF check; native Linux CI script/workflow | Старые `.local`/keys/compiled outputs не копируются; build не переписывает ожидаемый image hash; remote CI отдельно не заявляется |
| S06 Координатор | Immutable parent manifest, фиксированные child IDs, fenced lease, explicit bounded resume, passive GET | Проходит record/coupon/maturity; pending/unknown child останавливает дальнейшую отправку; principal остаётся holder-signed |

Frequency означает делитель годового купона. Даты задаются явно; новая календарная cadence/day-count policy не выдумана. Новые условия читаются одним coherent bank вместе с остальными финансовыми счетами; API может восстановить annual terms без local catalog. Старые Memo-only/fixed issues сохраняют собственное происхождение и не получают выдуманный FinancialTerms PDA.

## Проверки основного выпуска

Current SBF541456bytes, SHA256 `761b993d403ae03a84e94475404299b0d4e798a6ea2d17ae44e003148077bdfd`; program `B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8`. IDL сгенерирован official Anchor1.1.2. Название release `financial-terms-lifecycle-v3` описывает эту версию; существенная identity — hash/length/deployed bytes.

- Rust unit3/3 + actual SBF/SPL runtime16/16 passed; `.local/strengthening/program-tests-isolated.log`. Последний включает64 seeded sequences; rootseed `0xb07d7ace20261008`. Прямые tests проверяют issuer signature, canonical PDA/writable terms, bounds/overflow/remainder и несовпадение каждого из8 купонов. Unchanged10-bond position доказывает500coupon/10000principal.
- Live built-origin cycle: [execution-strengthening-20261008172355127-29505989.json](evidence/execution-strengthening-20261008172355127-29505989.json), выпуск `Bf2T9Tz5Uh6ZQQoDespYpxaKTgsZN697dwE6y4JpYuPy`, API3160/RPC8959, genesis `6sNRfcm4QfwRYW1QM8425j5ws7ENXcZkzpTcEd7RRNGA`.39distinct transactions и39actual finalized schema2 proofs;2500coupon/25000principal/25burn, obligations/supply/vault0. First holder coupon500 остаётся после transfer2, principal для него8000; этот cohort не подменяет unchanged-position10000example.
- Parent `lifecycle-strength-ea85a5dc-eb20-44e5-bfcd-e7233cba5004` пережил actual API restart между выплатами; digest и child signatures сохранились. После native validator restart сохранились genesis/accounts/terms и финансовое закрытие. Cold read-only verifier повторно перечитал39signatures и rate account; `.local/strengthening/cold-verify.log`.
- Parent financially_closed отличается от aggregatefinality: внешние holder signatures не привязаны к parent manifest, поэтому parentfinalityunknown/pending честно сохраняется. Сам сценарий отдельно проверил все39реальных signaturefinality. Голосование informational, полномочия holderburn не расширены.
-24 targeted runtime/storage/release regressions passed; `.local/strengthening/runtime-repair-tests.log`. Late first relay при падении дискового бюджета не создал receipt/signaturebinding/send; existing same-wire recovery сохраняется отдельно.
- Фактическая quota проверка [public summary](evidence/runtime-strengthening-probes.json), полный raw JSON `.local/strengthening/watchdog-quota-evidence.json`:9MiB diagnosticfixture при трёх свежих рестартах в budget; storage-stop сработал до restart-budget branch, ownedRPC перестал слушать. Результат/fixture сохранены, ledger восстановлен безreset, финансовыхtransaction в этом тесте нет.
- Built-origin readiness, passive financialclosure, foreignOrigin denial и unsafe executor request —4/4; `.local/strengthening/http-final-checks.json`.
- Отдельный current-release fault-injected before-first-relay test: [recovery artifact](evidence/rebroadcast-audit-1791483895124-dbaf37d3-016c-4268-974c-a2a01a9f143d.json). Исходная подпись восстановлена отдельным APIprocess, recipient получил ровно890880testlamports однажды. Эта операция не входит в39bondtransactions.

## Чистый запуск и финальный review

Финальный snapshot `549f5703-645c-4870-8b70-ccc5c58f8a20` завершил11commands со статусом passed_snapshot: npmci/applicationbuild/toolversions/directSBF/frozenhash/219Node/52UI/newnative runtime/full39transactioncycle/ownedAPIstop/ownedvalidatorstop. [Public manifest/result](evidence/clean-source-reproduction.json) и [отдельный clean cycle](evidence/execution-strength-clean-549f5703-645c-4870-8b70-ccc5c58f8a20.json).185sourcefiles, stageddrift0, currentruntime/rootdrift0 на cutoff, новыеkeys/data/genesis безкопирования старых fixtures. Compiler/npm caches переиспользуются; это clean-source reproduction на подготовленном host, а не другая физическая машина. Actual remoteworkflow не запускался.

Clean instrument `6CEQJLbS8pDq5ZorKsofCr4KhmNfdfzT9v3Xb4AEcDoS`, genesis сохранён в его artifact, все39signatures finalized/schema2,2500coupon/25000principal/25burn/0obligations-supply-vault. API и validator restart сохранилиparentdigest/childsignatures; послецикла толькосвоиhelpers остановлены, файлы/ledger сохранены. Этотcohort не смешивается с основным Bf2T9…39-cycle.

Failed attempts сохранены: npm.cmd install directory, PATHEXT/WSL launch, unresolved original mint signature в отдельном старом clean namespace, source CSS/instruction drift и занятый APIport после недостаточной cleanup. Ни одинfailedresult не перезаписан в pass. RPC теперь допускает5bounded повтора тех же signedbytes; неизвестный/истёкший результат никогда не получает новуюподпись автоматически. Launcher проверяет APIport до созданияvalidator, cleanupForce+wait проверяет остановку только своегоPID.

Проверка snapshot теперь подтверждает ALLstagedbytes/type/symlink и строгоrejectsbackend/runtime/client/financialwallet/types/request/numeric/deps/IDL/config drift. Параллельные CSS/brand docs изменения толькораскрываются отдельно, AGENTS допускаетсятолько с идентичным protected tail. Passed_snapshot не является новым UI acceptance. В последнем успешном run такихdrift вообще0.3meaningfulsnapshot regressionspassed; fullNode219 уже включает их.

## Инструменты и границы

ProofPilot upstream HEAD `e6c2a3c7af6b509cd5648884a017a610e68c739c` совпал с локальным snapshot. Реально выполнены offline inspect/eventlist; [разбор evaluator protocol](research/proofpilot-evaluator-preparation.md). KASE weights30/25/20/15/10 сохраняются; builtinpreset не выдаётся за официальный. Подтверждение использования/конфигурации навыка жюри остаётся сообщением владельца. Backend55% не доказывает UX/market/eligibility.

Stoic repository `affaan-m/stoictradingAI` pinned `a771fb9b06cf37c3724984420805a156862e89ac` — архивный Eliza/trading проект безSKILL.md. [Разбор](research/stoic-solana-reference-review.md) отделяет полезные сравнения от float/custody/mainnet/lifetime weaknesses. Создан собственный project-local `stoic-solana-execution-review`, явно маркированный reference-derived; quick_validate passed. Никакой trading code, сервис, внешнийmodel или чужиеcredential literals в продукт не добавлены. Host discovery нового навыка ожидается в следующем turn/reload; его файлы фактически прочитаны и использованы для текущего scopedreview.

Original Ubuntu registration больше не находила свой ext4.vhdx. Файл не восстанавливался выдуманно и старая registration не удалялась. Отдельный BondTraceRuntime imported official Ubuntu24.04 rootfs с SHA8251e27…verified и scoped pinned Rust1.91/Agave3.1.10/Anchor1.1.2. Existing Windowsledgers/signers/history сохранены. Skills: ProofPilotcoach/directimplementation/plan→review/quality, solana-dev Anchor/RPC/security/testing, review-and-iterate; skill-installer/skill-creator для прозрачной локальной адаптации Stoic.

Бесплатный testlocalnet scope. Ограничения16holders/8coupons/4perbatch/32proposal window, wholeunits, fullprefunding, surpluswithdrawalabsent и external settlementfreezer/RPChistory доверие остаются. Humanwallet/devnet/publichosting/productionsecurity/finalsubmission отдельно не подтверждены. No commit/push/visibility/mainnet/realfunds/paid/consent действия этого прохода.
