# BondTrace — сценарий эмитента и демо

8 октября 2026. Материалы подготовлены с ProofPilot в режиме **coach / submit**, proofpilot-submission-builder и submit-to-hackathon. Это описание текущего продукта и план записи, без новой оценки готовности или сброса прежнего review budget. Источники: [KASE listing](https://superteam.fun/earn/listing/superteam-kazakhstan-x-kase-side-track-corporate-actions-on-blockchain), сохранённое полное чтение 7 октября 2026, 22:12 UTC; [текущий backend](22-BACKEND-READINESS.md), [API](15-API-CONTRACT.md), [реальный цикл](evidence/backend-lifecycle-localnet.json).

## Для кого и зачем

Оператор эмитента задаёт условия тестового выпуска, размещает облигации среди зарегистрированных держателей и резервирует все выплаты. Затем он видит ближайшее корпоративное действие, фиксирует права на дату реестра и открывает погашение. Инвестор получает свою выплату и подтверждение исполнения. Таблицы прав, расчётов и транзакций помогают сверить обязательства одного выпуска.

Это проверяемый прототип обслуживания инструмента после выпуска. Он не подключён к KASE, банку или депозитарию. Применение в реальной инфраструктуре потребует отдельного правового реестра, KYC, custody, банковских расчётов, операционных процедур и независимого security audit. Доступ к таким организациям и спрос пока не подтверждены.

## Пошаговый показ текущего интерфейса

Перед показом открыть собранное приложение на http://127.0.0.1:3000 с существующим local validator. Проверить метку сети и доступность chain state. Выбрать **Guided demo**, если используются generated test signers; этот режим не является подписью настоящим кошельком. Для нормального режима подпись выполняет внешний кошелёк. Подготовить новую тестовую серию, не заменяя исторические доказательства.

| Шаг | Что делает оператор | Что показать как результат |
|---|---|---|
| 1. Создать выпуск | В Issuer desk задать имя, series ID, settlement mint, face value и 1–8 фиксированных купонов с record/payment dates, затем maturity. Нажать Review issue creation и проверить транзакцию. | Подтверждённый Draft с точными неизменяемыми условиями и адресом выпуска. |
| 2. Зарегистрировать и разместить | Зарегистрировать держателей, затем разместить целое число облигаций каждому. | Реестр и balances; количества согласованы с mint supply. |
| 3. Зарезервировать и активировать | Пополнить весь отображаемый reserve gap и активировать выпуск до первого record date. | Active, резерв покрывает principal и все фиксированные купоны. При нехватке activation отклоняется. |
| 4. Зафиксировать права | В реальное chain time наступления record date выполнить Capture record date. | Immutable snapshot, eligibility и точная сумма каждого держателя. Переводы при просроченном uncaptured record date остановлены. |
| 5. Показать сохранение прав | После первого capture перевести две облигации от Investor 01 к Investor 02. | Текущие balances изменяются, права на уже зафиксированный купон сохраняются. Второй купон использует свой собственный snapshot. |
| 6. Выплатить купоны | После соответствующего payment time каждый entitled holder подтверждает Claim. | Paid amount и подтверждённая подпись. Не выдавать forecast до capture за уже начисленное право. |
| 7. Провести голосование | Создать informational proposal до maturity, показать snapshot weight и один голос держателя. | On-chain ballot и агрегат голосов. Голосование не меняет условия облигации и не исполняет решение. |
| 8. Погасить и сверить | После maturity и capture всех купонов эмитент открывает redemption; каждый держатель получает principal. | Платёж и burn атомарны. Payments показывает paid totals, retired units, остаток obligations и vault. Исторические невыплаченные купоны доступны даже после burn. |

По ошибке или неизвестному результату сохранить operation ID/signature и проверить его статус. Для остановленного unsigned test setup/operation использовать **Resume test setup / Resume test operation** того же ID. Не создавать новую финансовую подпись, пока старый signed результат неизвестен. При отказе человека от unsigned wallet review цепочка не должна меняться; отдельная проверка настоящего кошелька пока не подтверждена.

## Числовой пример для новой записи

Это заранее заданные **test settlement units**, не настоящие деньги и не ежегодное начисление процентов. Face value = 1,000; фиксированные купоны = 50 и 25 на облигацию; выпуск = 15 облигаций. Нужный полный резерв: `15 × (1,000 + 50 + 25) = 16,125`.

| Держатель | Первый snapshot | Первый купон | После перевода / второй snapshot | Второй купон | Principal |
|---|---:|---:|---:|---:|---:|
| Investor 01 | 10 | 500 | 8 | 200 | 8,000 |
| Investor 02 | 5 | 250 | 7 | 175 | 7,000 |
| Всего | 15 | 750 | 15 | 375 | 15,000 |

Итого купоны = 1,125; выплаты = 16,125; burn = 15; конечный vault = 0 при точном prefunding. Эти итоговые величины уже установлены для issue `68tCZNkPhRdjUits3iPNh4E4nYQseSqppSAghUi21w2z` в отдельном реальном API/chain cycle. Новая UI-запись должна иметь собственный issue и подписи. Вес 10 для показа голосования получается, только если его proposal snapshot создан до перевода; при snapshot после перевода показывать фактический вес 8.

## English product demo script — planned 2:50 recording

**Recording status:** this is a new shot list for the current issuer desk and strengthened backend, not a claim that a new video exists. Use actual transactions, retain the issue ID, label the network and generated test signing, and cut only idle waiting at real chain deadlines. Record no credentials or wallet secrets. Do not insert a public Explorer success screen for a localnet transaction.

| Time | Actual product view | Narration |
|---|---|---|
| 0:00–0:15 | Issuer overview / next corporate action | “A bond issuer needs to know who is owed what, when to pay, and whether payment actually happened. BondTrace brings that servicing workflow into one Solana console.” |
| 0:15–0:40 | Issuer desk: terms, registry, placement, reserve and activation | “Here I create a test bond with a face value of one thousand and two fixed coupons: fifty and twenty-five per bond. Two registered holders receive fifteen bonds. Before activation, the issuer must reserve all sixteen thousand one hundred and twenty-five test units.” |
| 0:40–1:05 | First coupon capture, immutable rights, then transfer | “At the first record date, the program fixes the rights. Investor One owns ten bonds and receives a five-hundred-unit coupon right. Two bonds move afterward. Current holdings change to eight and seven; that earlier five-hundred right stays with Investor One.” |
| 1:05–1:20 | Voting: proposal snapshot created before transfer; recorded ballot | “The additional corporate action is bondholder voting. This proposal records its own snapshot, so a holder's voting weight is fixed for that proposal. Each holder can vote once. This is an informational decision; it does not change the cash terms.” |
| 1:20–1:45 | Second capture and holder coupon claims | “The second record date has its own allocation: two hundred for Investor One and one hundred and seventy-five for Investor Two. Each investor signs a claim after the payment time. Both coupons total one thousand one hundred and twenty-five test units.” |
| 1:45–2:10 | Open redemption, investor claims, Payments final totals | “At maturity, the issuer opens principal redemption. Each claim pays the investor and burns the corresponding bonds in the same transaction. All fifteen bonds retire, fifteen thousand principal units are paid, and the exact reserve ends at zero.” |
| 2:10–2:35 | One receipt / operation recovery / reconciled totals | “Every action keeps its signature and recovery ID. If the server loses a response, it checks that same operation rather than preparing another payment. Financial totals come from one confirmed chain context and use exact integer amounts.” |
| 2:35–2:50 | Network label and source/demo handoff | “This is a working test-asset prototype. It uses real Solana program execution; bank, KASE and custody connections are outside this demo. The source and evidence explain the limits and how to reproduce the complete workflow.” |

Narration contains 301 whitespace-delimited English words; final edited video must stay below three minutes. The planned timeline totals 170 seconds. Waiting between record/payment/maturity events is edited, never replaced by a clock override.

## Existing video and safe fallback

The completed [2:54.021 product video](../artifacts/demo/bondtrace-product-demo.mp4) shows historical browser issue `5knY93zt91XKMqnxz2ukXGHVzx6Ro9vgKsrcrT3RbhJU`: 18 bonds, one 900-unit coupon, 18,000 principal, burn 18 and vault 0. Its generated-signing/localnet scope and edited waits remain visible. It does not record the later 15-bond backend cycle or the new issuer form. Preserve its bytes and provenance; do not relabel it as a devnet or human-wallet run. Public hosting and owner submission remain separate gates.

## Checkpoint and continuation

The four release-material files are local drafts. Chosen skills: ProofPilot coach/submit, proofpilot-submission-builder, submit-to-hackathon; frontend-design-guidelines and design-taste for the static copy sheet, using existing brand tokens. Before substantial follow-up tasks, read AGENTS.md and select/read applicable installed skills. Delegate this same rule in every handoff. No new readiness score is assigned. Missing public URLs, main entry and devnet/human-wallet proof remain explicit in the form draft; final consent and submission are not performed.

Source/format checks: current lifecycle JSON independently matched 19 receipts, coupon totals and 10/5 then 8/7 snapshots; exact reserve arithmetic passed. The description has 279 words. Both field artifacts contain the same 11 draft fields; 7 values are unset, including optional fields. HTML has labelled read-only textareas, no form, submit control or scripts. Browser inspection at 375, 768 and 1280 px found no horizontal document overflow; screenshots were visually inspected. Keyboard Tab reached the first textarea with a visible 3 px cobalt focus ring. The temporary preview tab/process were closed and viewport reset. Browser work used the installed computer-use guidance and CUA browser API only. Final current-form labels, external URLs and independent application-source review remain unresolved; these mechanical checks do not establish submission readiness.
