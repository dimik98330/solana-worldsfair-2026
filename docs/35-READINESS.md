# Technical readiness —10October2026

[English README](../README.md) · [Русский README](../README.ru.md)

ProofPilot coach policy4 accepted the bounded technical report below after a fresh-context review. This is local evidence-checklist acceptance, not official judging, a perfect-product verdict or production certification. The frozen report covers source4e5dafa and the large localnet cohort; the later [37-transaction prepared launcher](evidence/servicing-v4-one-command-check-20261010.json) is a separate supplement.

## Четыре замечания и текущее состояние

| Замечание | Что реализовано и проверено | Оставшаяся граница |
|---|---|---|
| Эмитент блокирует погашение | В v4 любой fee payer открывает/завершает наступившую фиксацию; держатель получает номинал и атомарно сжигает токены. Протестировано отсутствие эмитента в транзакции | Публичный devnet ещё на прежнем v3; обновление требует бесплатных test SOL |
| 16 держателей/8 купонов, закрытый реестр | Отдельные страницы по8/u32,33→34 держателя/9 купонов; нулевые новые получатели после активации не получают прошлых прав | API4096 account observations, browser16 coupons, controlled frozen SPL transfers; без обещаний unlimited/DEX |
| Обычный Phantom | Исправлен sign-only путь, проверяются точные байты/Ed25519/кошелёк/срок; нет скрытого broadcast fallback | Успешная обычная подпись не подтверждена; код/тестовые подписанты не заменяют её |
| Нет внешнего внедрения | Подписанные реестр/outbox/ACK, shadow reconciliation, actual HTTP/chain read и restart проверены | Реальные KASE/банк/кастодиан/клиентский пилот не подтверждены; dispatch disabled |

Солана-ядро прототипа закрывает все8 функциональных требований в проверенных localnet-сценариях. Внешние рельсы — явно обозначенная sandbox/shadow граница. Eligibility, final submission и production approval здесь не присваиваются.

## Reviewed report — verbatim

# BondTrace technical handoff —10October2026

Observed: the actual v4 localnet cohort completed253 distinct transactions:215 instrument/servicing operations and38 auxiliary transactions. It uses generated local test signers and a mock settlement token; it does not prove ordinary Phantom signing.

Observed:33 initial holders plus a later receiver and9coupons were serviced. Coupon21600 and principal48000 test units were paid;48bonds were retired with zero supply/vault/obligations. The unchanged primary10-bond position receives500 per coupon and10000principal. Historical coupon rights survive transfer and burn, including a late500claim after retirement.

Observed: the later built-origin financial reread verified the completed state. The recorded archive contains247finalized and6confirmed observations with253 execution proofs; later RPC lookup missed75older statuses. Complete fresh history is not established, and archived proof is not promoted to current finality.

Observed: isolated GitHub verification of source4e5dafa passed352Node tests with0fail/10optionalPGskip,90UI,3Rustunit and20SBF/SPLruntime cases. A separate actualPostgreSQL16.15job passed40with0fail/3explicitTLSfixture skips. These separate counters are not one combined suite; old failed/partial local runs remain retained.

Observed: the bounded fresh program review found no substantiated material defect. This is not a formal audit, official judging score, production certificate or unlimited-capacity test. Permissionless opening and paged state address the issuer dependency and whole-issue array limits in v4; the old public program has its separately documented version boundary.

Observed: human Phantom execution and public v4 deployment remain unverified. Signed shadow registry/settlement adapters are implemented with generated-authority evidence, but no bank/KASE partnership, customer demand or real-asset settlement is established. Those gaps cannot be closed by relabelling tests.

Inference and decision: complete this bounded technical evidence handoff for source review. Keep public upgrade, ordinary-wallet acceptance, external partner trial and owner contest submission as separate next actions; no new paid service, mainnet transaction, credential exposure or official acceptance is authorized by this report.
