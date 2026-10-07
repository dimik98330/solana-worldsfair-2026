# План реализации BondTrace

Пользователь прямо поручил полный проект KASE; отдельный повторный запрос «можно ли разрабатывать» не нужен. Согласия аккаунтов остаются за владельцем. План уточняется только по проверенной совместимости/рискам, без перезапуска отбора идеи.

| Этап | Владелец | Зависимость | Done |
|---|---|---|---|
| P01: требования/форма | Lead | KASE listing | Сохранены AC и реальные поля; login владельца |
| P02: архитектура/security | Program+Lead+critic | P01 | Account/state/signers/custody/arithmetic/retry описаны, замечания устранены |
| P03: toolchain/scaffold | Program(WSL),Lead(Node) | P02 | Версии pinned, реальная компиляция, общие contracts |
| P04: вертикальный срез | Program+Lead | P03 | UI→подпись→реальный create/issue/snapshot→confirmed read |
| P05: coupon | Program+Lead | P04 | Exact payout, idempotency, access и failure tests |
| P06: redemption | Program+Lead | P05 | Principal и token retirement атомарны, двойная операция отвергнута |
| P07: voting | Program+Lead | P04 | Snapshot weights и1ballot проверены |
| P08: polished UI | Frontend+Lead | Contracts,P04 | Issuer/investor flows; mobile; status UX; браузер/скриншоты |
| P09: integration/devnet | Lead+critic | P05–P08 | Narrow tests/build + полный seed/cycle/reload; signatures сохранены |
| P10: submission package | Lead+owner | P09 | Technical overview, сценарии demo/pitch, реальная readiness; final owner controls |

Программа/WSL и интерфейс работают параллельно в разных файлах. Lead единолично управляет package/lockfiles/root configs/Git и интеграцией. Технические/toolchain blockers фиксируются сразу; установленный скилл не считается работающим компилятором.

Местный DemoDay10окт не обещается. Основной внешний ориентир — global deadline12окт23:59PT; готовые материалы желательно11окт. Финальный срок KASE в интерфейсе и регистрация global проверяются отдельно. На видео, review и owner действия оставляется резерв; не объявлять все этапы ready, если нет runtime proof.
