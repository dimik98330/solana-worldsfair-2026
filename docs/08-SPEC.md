# Спецификация KASE: критерии приёмки

Источник: https://superteam.fun/earn/listing/superteam-kazakhstan-x-kase-side-track-corporate-actions-on-blockchain , полный browser DOM прочитан 07.10.2026. Строится permissioned test instrument; все суммы считаются целыми минимальными единицами, без floating point.

## Приёмка

| ID | Обязательное поведение | Проверяемый результат |
|---|---|---|
| AC01 | Создать инструмент с issuer, face value, coupon, schedule, maturity | On-chain account и test token mint, подтверждённая signature |
| AC02 | Зарегистрировать держателей и выдать облигации | Registry согласован с фактическими токенами; unauthorized issuance отвергнута |
| AC03 | Record date | Snapshot фиксирует текущих holders/amounts и slot/time; смена последующих holdings не меняет прежние coupon/voting права |
| AC04 | Exact entitlement |10×1000×10%/2=500; integer checked arithmetic, запрещены некорректные суммы/параметры |
| AC05 | Coupon | Только право из snapshot; фактический test settlement либо явно реализованный settlement initiation; второй claim невозможен |
| AC06 | Redemption | Только непогашенные текущие позиции на maturity, principal выплачен/инициирован; соответствующие tokens burnt/retired/locked; повтор невозможен |
| AC07 | Additional action: voting | Вес snapshot, wallet signature,1ballot/owner/proposal; результат можно проверить после reload |
| AC08 | Authority/access | Issuer-only administration; чужой wallet не может подставить recipient/mint/vault/snapshot или изменить payout |
| AC09 | Failure UX | Pending/confirmed/error/cancelled/unknown-status; timeout не означает повторную оплату; смена wallet требует обновлённого preview |
| AC10 | Proof | UI показывает сеть, реальную signature/Explorer link, record date и источник сумм; никаких fake hashes/успеха до подтверждения |
| AC11 | Reproducibility | Чистая установка/запуск, seed test data, сохранённые checks/provenance; восстановление/reload сохраняют chain state |
| AC12 | Submission | Рабочий prototype, demo video, source repo доступный жюри, technical overview; global registration обязательна |

Допуск к финальной подаче требует выполнения обязательных критериев. Объявленная непроверенная часть остаётся непроверенной и не становится passed: AC12/регистрация/финальная отправка пока не подтверждены, обычная подпись Phantom также не подтверждена. Проверенные технические сценарии и их границы перечислены в [README](../README.md) и [readiness](35-READINESS.md). External/fiat rails можно моделировать по условиям задания, но entitlement и Solana flow должны работать.

## Демо-сценарий

Три тестовых держателя → issuer фиксирует record date → проверяет таблицу и итоги → выплата купона → investor видит подтверждение → investor голосует → maturity/redemption → supply/позиции обновляются. Demo-срез может использовать подготовленные on-chain состояния и ускоренные условия инструмента с явной маркировкой.
