# BondTrace — проверка текущего backend

8 октября 2026. ProofPilot **coach**, контекст application: отчёт об инженерной готовности выбранного KASE-прототипа. Это не подтверждение допуска, подачи, mainnet или production audit. Ранние документы17–19 и видео сохраняют собственный исторический snapshot.

По [заданию KASE](https://superteam.fun/earn/listing/superteam-kazakhstan-x-kase-side-track-corporate-actions-on-blockchain), перечитанному07Oct22:12UTC, нужны точные права держателей, купоны, maturity redemption с retirement и ещё одно корпоративное действие. У нас это голосование. Fiat rails могут быть тестовыми; Solana-логика работает на настоящем local validator.

## Что исправлено

- Финансовые данные читаются одним confirmed RPC context: Bond, Clock, mints, vault, holders и snapshots. Изменение регистра/каталога даёт максимум3 повторных чтения; неполные или несогласованные данные не превращаются в нули.
- Все суммы — u64/BigInt и точные строки с6 decimals. Сверяются supply/holder balances, issued−burned, snapshot/masks/paid totals, principal и полный reserve/gap/surplus. Forecast до capture отделён от фиксированных прав и доступных к выплате сумм.
- Public metadata/journal — transactional SQLite. Signature, signed bytes, lifetime и operation сохраняются вместе до send. Original JSON импортируются один раз и остаются побайтно прежними; ключи исключены. Pending/unknown и confirmed projection-pending не вытесняются историей.
- Chain confirmation и локальная проекция разделены. Потерянный ответ, сбой metadata и pruned history не дают разрешения повторить выплату. Genesis/provenance сохраняются; processed error не объявляется окончательным confirmed failure. Неверные RPC envelopes/error shapes не становятся подтверждением.
- Явные финансовые параметры, IDs и согласованные aliases; canonical intent. Every required Ed25519 signature проверяется против точного reviewed message. Null fee не равна0. Для generated demo client заранее сохраняет recovery ID.
- Bootstrap имеет неизменяемый план и11 child steps. Same-ID resume повторно проверяет известные подписи, продолжая лишь неотправленные шаги. Devnet faucet loop отключён. Смена истёкшего partial plan явно архивирует только реальный выпуск после проверки old receipts и блокирует его старые отправители.
- Unsigned demo operation можно продолжить после process crash через двухминутную lease. Четыре конкурирующих процесса получают одного владельца; заменённый процесс не может записать metadata или отправить транзакцию. Signed intent больше не захватывается. Exact prior message не выдаётся за новую операцию.
- HTTP сохраняет UTF-8 через границы chunks, ограничивает размер тела в байтах, отклоняет отсутствующие recovery IDs и противоречивые поля. UI получает явные Resume test setup / Resume test operation; дальнейшее расширение дизайна остановлено по запросу пользователя.

## Наблюдаемые результаты

| Проверка | Результат | Доказательство |
|---|---|---|
| Node/UI final suite |110/110 passed,0 skipped| Native Node22.14; concurrency4; final log сохранён локально |
| TypeScript/Vite build |Passed| Последняя сборка после API contract/streaming JSON поправок |
| Program |3 unit +7 SBF runtime passed|16 positive holders,8 coupons,128 claims, atomic burn rollback; program не менялся в backend focus |
| Migration |3 прежних выпуска финансово unchanged;7 originals sameSHA|[migration](evidence/backend-migration-localnet.json), до последующих новых тестовых пополнений |
| Normal unsigned/external generated relay |19 confirmed;2 coupons750+375, principal15000,15 burned/vault0|[lifecycle](evidence/backend-lifecycle-localnet.json); unsigned preview пережил API restart |
| Concurrent reads |164 успешных reads,4 одновременно|[numeric context checks](evidence/backend-concurrent-reads-localnet.json) |
| Durable bootstrap |11 satisfied steps;6 actual transactions; same-ID replay no new send|[bootstrap](evidence/backend-bootstrap-localnet.json); funded balances/preexisting mint — проверки, не выдуманные receipts |
| Generated guided cycle |10 дальнейших confirmed actions; coupon900/principal18000,18 burned/vault0|[guided cycle](evidence/backend-guided-cycle-localnet.json); другой выпуск |
| Final unsigned lease path |11 actual confirmed actions, каждый same-ID replay сохраняет подпись; coupon0.05/principal1,1 burned/vault0|[lease lifecycle](evidence/backend-lease-lifecycle-localnet.json); отдельный однобондовый выпуск |
| Fresh API process |3 завершённых выпуска и11 bootstrap steps восстановлены; completed replay no new signature|[restart](evidence/backend-restart-localnet.json); ledger сохранён |
| HTTP contract |12 malformed/alias/origin checks +7 final identity/UTF checks; no chain changes|[HTTP](evidence/backend-http-checks.json), [stream/IDs](evidence/backend-final-http-contract.json) |
| Metadata snapshot |SQLite integrity ok; real270336-byte backup|Public metadata only; ignored namespace, no automatic restore or key backup |

В новом normal cycle купоны1125 + principal15000 =16125 тестовых единиц; выплачено всё, остаток обязательств и vault равны0. Все приведённые деньги — test settlement units. Разные выпуски и наборы подписей не объединяются в один выдуманный запуск. Реальные результаты через собранный интерфейс отражены на [снимке Payments](evidence/ui/backend-payments.png).

## Границы и дальнейшая подача

Backend проверен для разрешённой локальной демонстрации полного KASE цикла. Human-wallet signing/cancel, devnet deployment, публичные ссылки, основная регистрация и финальная подача пока не подтверждены. Репозиторий остаётся private под dimik98330; менять visibility без решения владельца нельзя. Никакие Terms/KYC/consent автоматически не приняты.

Модель ограничена16 holders/8 coupons; полный prefunding обязателен, issuer withdrawal отсутствует. Proposal discovery ограничен local catalog, индивидуальные ballot sides не объявлены проверенными. Confirmed context и SQLite EXTRA не гарантируют честность RPC, hardware durability или production finality. Ни банковская/KASE API интеграция, ни спрос/партнёрство/шансы на победу не заявлены.

Для воспроизведения: `npm test`, `npm run test:ui`, `npm run build`, затем `npm start` на127.0.0.1:3000 и `npm run smoke:issuer` на существующем local validator. Smoke создаёт новый тестовый выпуск. `npm run metadata:check` проверяет storage; `npm run metadata:backup` сохраняет согласованный ignored snapshot. При сбое сохранять ID и проверять/продолжать именно его; новый financial intent требует отдельного review.

Текущий initial backend audit и repair1 сохранены; последний независимый repair2 относится к этому source/evidence cutoff, без сброса бюджета. Его статус и точные hashes сохраняются отдельно. Предыдущая acceptance application report не аттестует эти новые изменения.
