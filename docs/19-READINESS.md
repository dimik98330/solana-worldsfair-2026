BondTrace реализует три действия задания KASE: купон, maturity redemption и дополнительное голосование держателей. Это соответствие проверенным сценариям, а не официальная оценка жюри.

Работающий прототип проверен на localnet с generated test signers. Сохранённый browser cycle рассчитался по купону900 и principal18000 test units, погасил18 из18 облигаций и оставил vault0. Исторические купонные права сохраняются после перевода; голосование использует snapshot и один ballot. Это тестовые кошельки, не пользователи или traction.

Проверки: Node14/14, Rust unit3/3 и реальный SBF runtime5/5. Четыре Node transport tests используют isolated mocked RPC; они не являются devnet или human-wallet evidence. Built origin и malformed/origin rejection проверены отдельно без изменения chain state. Видео2:54.021 прошло полное декодирование, representative frames просмотрены; его localnet/test-signing/монтаж обозначены.

Техническое описание, исходники, видео, субтитры и локальная страница материалов подготовлены. Репозиторий verified под dimik98330 и остаётся private. Публичный доступ жюри, devnet deployment, human-wallet signing, основная регистрация и финальная подача не подтверждены как завершённые. Нет проверенного спроса, KASE/fiat integration или production audit.

Application readiness: needs work. Завершён локальный комплект для review; окончательная подача пока не готова. Следующий шаг — решение владельца о public repo/странице видео, подтверждение основной регистрации и сохранённый funding gate для devnet. Terms/scope/KYC подтверждает владелец при действии. Эти материалы не разрешают публикацию или финальную отправку.
