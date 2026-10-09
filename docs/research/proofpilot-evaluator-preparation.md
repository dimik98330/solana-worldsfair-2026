# Подготовка backend evidence для ProofPilot / KASE

Дата доступа: 8 октября 2026. Workspace: `C:\Users\dmitrii\Documents\solana`. Режим: **ProofPilot coach**, bounded review→submission preparation; это разбор протокола и evidence checklist, не официальный scorecard. Текущая реализация S01–S06 продолжается по `docs/29-BACKEND-STRENGTHENING.md` и не заменяется этим исследованием.

Прочитаны актуальные AGENTS/STATE и установленные ProofPilot, event-assessment/intake/quality/source-grounded review; ранее прочитанные solana-dev security/testing и review-and-iterate переиспользованы для технической evidence matrix. Source checkout `C:\Users\dmitrii\Documents\proofpilot-source` сохранён без изменений. Lead сообщил совпадение remote/local HEAD `e6c2a3c7af6b509cd5648884a017a610e68c739c`; профильные файлы инспектированы локально, страницы event-assessment и event-score также открыты по этому SHA на GitHub. Другие dirty local docs/Windows installer patch не изменялись. Здесь скрипты не запускались: offline CLI выполняет lead после чтения их source.

## Что подтверждает репозиторий, а что остаётся неизвестным

Репозиторий содержит инструкции и offline bookkeeping helpers. Само наличие этого repository **не подтверждает**, что судьи KASE используют его, какую версию они возьмут, какой model/runtime, custom rubric, allowed-source policy и deadline применят. Утверждение об использовании судьями получено от владельца; независимого опубликованного judging configuration в этом scoped пакете нет. Нельзя обещать баллы, победу или official acceptance на основании прохождения локального checker.

При наличии применимого organizer rubric ProofPilot требует использовать его, сохранив weights/eligibility/evidence policy. Его стандартный `solana_hackathon@1.0.0` — собственный preset, не правила KASE: 25 problem/value, 25 technical, 15 Solana, 10 differentiation, 10 UX/DX, 10 viability, 5 communication. [Протокол](https://github.com/Marakaya/proofpilot/blob/e6c2a3c7af6b509cd5648884a017a610e68c739c/skills/proofpilot/references/event-assessment.md), [profiles](https://github.com/Marakaya/proofpilot/blob/e6c2a3c7af6b509cd5648884a017a610e68c739c/skills/proofpilot/references/event-profiles.json).

Предоставленные для текущей KASE работы веса: technical30%, corporate action logic25%, UX20%, real-world applicability15%, innovation10%; сумма100%, backend-пара55%. Они не должны заменяться preset-ом. Точная organizer scale/anchors остаётся отдельным условием: checker поддерживает только integer0–4, а веса сами по себе такую шкалу не устанавливают. До подтверждения scale/anchors нужен качественный checklist либо явно обозначенный coaching custom profile; нельзя объявлять собственные anchors официальными.

## Фактический порядок assessment

1. Participant improvement — coach; formal judge — evaluator. Выбрать applicable rubric и prospectively freeze rules, submitted code version, cutoff и sources.
2. Собрать небольшой пакет: artifact ID/location/real version или hash, `available_at`, фактический `observed_at`, source kind (`submitted`, `public`, `runtime`), basis и ограниченный scope. Инспектировать только разрешённые материалы; private coaching не становится formal judging evidence автоматически.
3. Заполнить admission checks отдельно от quality criteria. Default checks: доступность artifacts, достаточные verification instructions, disclosure prior/reused/event work, applicable eligibility/submission requirements. Доступ к коду и README не дают бонусных баллов.
4. Сопоставить claimed outcome с реально inspected evidence. Source inspection, recorded demo, independent runtime reproduction и team-reported statements — разные уровни. Отсутствующий доступ означает unknown/null, а не наблюдённую неработоспособность.
5. Затем проверить карточку offline checker; substantial evaluator/application claims требуют отдельного source-grounded review с привязкой к exact packet/draft/assessment hashes. Coach preparation не выдаётся за judging.

Один final evidence cutoff не заменяет отдельный build/submission deadline. Поздняя инспекция неизменённой submitted версии допускает поздний `observed_at`; поздний новый код/ответ нельзя задним числом объявить старым `available_at`. Правила common Q&A/remedy window устанавливает organizer, а не агент. [Event protocol](https://github.com/Marakaya/proofpilot/blob/e6c2a3c7af6b509cd5648884a017a610e68c739c/skills/proofpilot/references/event-assessment.md).

Default technical anchors означают: 0 — inspected core scenario fails/explicitly unimplemented; 2 — частично работающий сценарий с конкретными gaps; 4 — работающий core scenario, подходящие checks, объяснённая architecture и раскрытые limits. Это полезная структура technical evidence, **не принятые KASE anchors**. Число файлов/коммитов, complexity и video polish не заменяют работающую логику. [Profile source](https://github.com/Marakaya/proofpilot/blob/e6c2a3c7af6b509cd5648884a017a610e68c739c/skills/proofpilot/references/event-profiles.json).

## Что реально проверяет event-score.js

Source прочитан полностью до любой execution. `list` выводит presets; `init` пишет новый template с exclusive `wx`, не перезаписывая существующий; `check` читает JSON. Нет network calls, запуска product tests, просмотра видео, automatic code audit, authentication organizer provenance или model judge. Для helper нужен Node20+, дополнительный API key не нужен.

Проверяются schema/completeness/unique IDs, weights total100, integer0–4 scale, profile hash/pinned builtin version, refs на существующие artifact IDs, допустимые kinds и `available_at<=cutoff`, допустимая basis/confidence для numeric criterion. Scored criteria требуют inspected `observed`/`artifact_supported` basis; raw `team_reported` не позволяет выставить numeric outcome. Points вычисляются как `weight×level/4`. При unresolved criteria final total=null; covered points не нормализуются до100. Unknown/failed admission не делает результат comparison-ready. Даже полная coach card остаётся provisional.

Строка `mechanically_comparable` означает соответствие **объявленной** карточки условиям checker. Скрипт прямо возвращает `evidence_authenticity_verified:false`, `independent_review_verified:false`; он не устанавливает semantic correctness rationale, настоящую доступность locator, истинность scope, дату подачи, authorship или фактическую независимость reviewer. `possible_points_upper` — только арифметический остаток, не прогноз. [Checker source](https://github.com/Marakaya/proofpilot/blob/e6c2a3c7af6b509cd5648884a017a610e68c739c/skills/proofpilot/scripts/event-score.js).

Quality policy4 отдельно требует correct coach/evaluator и general/application declaration, frozen source facts и arithmetic. Evaluator/application автоматически требуют separate-context review. Восемь checks: fact fidelity, arithmetic, evidence support, constraints, verdict, next step, task scope, action bounds. Initial+максимум2 repairs; старые issues/lineages не сбрасываются. Acceptance этого протокола — consistency локального отчёта, не конкурсная оценка или security certification. [Quality](https://github.com/Marakaya/proofpilot/blob/e6c2a3c7af6b509cd5648884a017a610e68c739c/skills/proofpilot/references/quality.md), [review](https://github.com/Marakaya/proofpilot/blob/e6c2a3c7af6b509cd5648884a017a610e68c739c/skills/proofpilot/references/quality-review.md).

## Backend55%: предлагаемый компактный evidence packet

Все имена `strengthening-*` ниже — **предложенные новые artifacts**, не утверждение об их существовании. Фактические filenames/hash/timestamps заполняет lead после проверок. Один event-level evidence index должен связывать rubric criterion → requirement → exact submitted source → reproducible observation.

| Evidence ID | Criterion / stages | Что должно непосредственно устанавливать доказательство | Предлагаемый artifact / существенная граница |
|---|---|---|---|
| backend_source | Technical30; все S01–S06 | Exact source version, entrypoints, pinned tools, reproducible commands, expected deployed release | Source manifest + concise README; список установленного ПО не доказывает выполнение |
| runtime_restart | Technical30; S01 | Native Linux ledger сохраняет genesis и счета при owner-checked restart; RPC/SQLite и disk readiness различают живой процесс и рабочий сервис | Отдельный restart log + before/after genesis/accounts; бывший /mnt/c I/O incident и failed logs сохранить |
| rate_contract | Logic25; S02 | FinancialTerms PDA создаётся атомарно; rate/frequency/face immutable; неверная formula/authority/PDA/amount отклоняются программой; fixed legacy paths совместимы | Actual SBF tests + current generated IDL/source hash; прежний signed Memo доказывает собственный более узкий snapshot, не новую PDA |
| registry_snapshot | Logic25; S02/S04/S06 | Реестр, due record capture, immutable rights после transfer; текущие holdings отделены от historical coupon rights | Fresh lifecycle transactions + exact coupon accounts до/после transfer |
| exact_cash | Logic25; S02/S04/S06 | 10×1000×10%÷2=500; principal10×1000=10000; выплаты всех групп равны exact entitlements, claimed masks исключают повтор | Raw base-unit strings/expected totals и on-chain outcomes; пример10000 проверяется без transfer, либо principal после transfer явно объясняется |
| stateful_invariants | Technical30 + Logic25; S04 | Воспроизводимые seeded successful/rejected sequences; supply conservation, snapshot immutability, masks, burn и whole-transaction rollback | Seed + sequence/assertions + real SBF/SPL logs; unit test count не заменяет independent invariant |
| finality_provenance | Technical30; S03 | processed/confirmed/finalized различаются; retained history не называется fresh proof; pruning/conflict не повышает finality | Synthetic transition tests плюс настоящая finalized RPC observation с genesis/program/signature/slot |
| lifecycle_recovery | Technical30 + Logic25; S06 | Parent/child IDs переживают interruption/restart; unknown не вызывает новую подпись; holder principal signing boundary сохранён; завершение требует totals и finality | Persisted coordinator plan, interrupted/resumed observations, unchanged child signatures; fault injection честно назвать injected |
| maturity_voting | Logic25; S04/S06 | Principal+burn atomic, unpaid coupons доступны после burn; immutable voting weights/one ballot; governance amendment не заявляется | Fresh redemption/coupon-after-burn/vote transactions и accounts, негативные cases |
| clean_reproduction | Technical30; S05 | Pinned source build и complete isolated run без старых local fixtures/signers; observed deployed hash соответствует artifact | Clean staging manifest, npm/SBF build logs, new genesis/issue/full cycle; prepared-machine success не называется fresh-machine reproduction |
| transaction_index | Technical30 + Logic25; S03/S06 | Каждое claimed financial действие связано с signature + account/event outcome и точным network | Compact public receipt/proof export; не включать private keys/raw credentials; local Explorer зависит от доступности этого ledger |

## Admission и остаточные ограничения

Пакет для human/agent reviewer должен включать доступ к submitted source, короткую команду запуска, test-data scenario/expected results, AI/reused-work disclosure и demo timestamps/transcript как fallback. Transcript не подтверждает visual/runtime behavior; private repository access и рабочий localnet не равны publicly reachable demo. [Intake](https://github.com/Marakaya/proofpilot/blob/e6c2a3c7af6b509cd5648884a017a610e68c739c/skills/proofpilot/references/event-intake.md).

Текущий подтверждённый исторический cutoff описан в `docs/28-AUDIT-RESULTS.md`: actual localnet lifecycle39transactions, coupon2500/principal25000/supply-vault-obligations0, Memo-linked terms и same-wire relay recovery. Это reported project evidence document, не новая runtime observation этого исследователя. Его SBF/genesis/source hashes и failed/repaired attempts сохраняются. Latest STATE объявляет S01–S06 активными и новые properties пока непроверенными; новый code без новых logs/chain observations нельзя подставлять в старую accepted карточку.

Чтобы подготовить backend55% дальше: завершить S01–S06 acceptance gates, выполнить fresh built-origin cycle и clean reproduction, собрать source/evidence manifest и передать frozen neutral packet independent critic. Это исполняемый readiness deliverable, а не просьба заменить работу рассказом. Реальные issuer/custodian процессы, банковские расчёты/KASE integration, devnet/human-wallet verification и public access — самостоятельные ограничения. Backend не доказывает оставшиеся UX20/real-world15/innovation10 и не даёт55/55 автоматически.

## Проверенные source hashes

SHA256 фактически прочитанных локальных файлов; relative paths относятся к `C:\Users\dmitrii\Documents\proofpilot-source\skills\proofpilot`:

| Source | SHA256 |
|---|---|
| references/event-assessment.md | f4334bfba66b55912af2a64ea25114db5c1898de87df7f4660a1538cc5670296 |
| references/event-profiles.json | a301855dfde3ee7cb3061f240869b49aa93894709e6fc6fe2ea93b58e10e11f8 |
| references/event-intake.md | 4f95d28a88bf4f740b7fce059b67f4c0430ee2b30b21da0e1041826a3f6eedc9 |
| references/quality.md | 8504ec5923c55960627f0768308db6804ef2c0285ce0065a2b941753889bc761 |
| references/quality-review.md | b0936d8749b38f208febca2f161b83916e451c095a36a15128384428e0193dc6 |
| scripts/event-score.js | d90fe5fc02e8d4ca529d98469cdbb6c57a4fa846fc1224b07748901d823bf03f |

Agent-owned write: только этот report. Нет code/config/skills/install/Git/account/network mutations, evaluator scores или reset старых assessment budgets. Перед substantial continuation и каждым handoff читать AGENTS/STATE, выбирать/читать actually installed skills, сохранять ownership и test-only/zero-paid/no-final-submission gates.
