# Localnet setup / Локальная установка

[English README](../README.md) · [Русский README](../README.ru.md)

## Current paged v4 launcher / Текущий постраничный лаунчер v4

After prerequisites and `npm run setup:judge`, use `npm run demo:paged:lifecycle`. It builds the matching v4 image and starts API3200/RPC8999. For33 initial holders plus one later receiver and9coupons:

```powershell
pwsh -NoProfile -File scripts/lifecycle-demo.ps1 -Paged -Scale33 -LateCoupon -RpcPort 8999 -ApiPort 3200
```

The output retains a recovery ID, immutable plan and public evidence directory. Resume with the same flags and `-OperationId <saved-id>`; do not replace unresolved signed steps. New IDs create new issues. Generated keys, data and ledgers remain ignored/preserved. See the [paged contract](34-PAGED-SERVICING.md).

После подготовки `npm run demo:paged:lifecycle` собирает соответствующую v4-программу и запускает API3200/RPC8999. Команда выше проверяет33 исходных держателя, одного нового получателя и9купонов. Для продолжения сохраните ID/данные и используйте те же флаги с `-OperationId <saved-id>`; новый ID означает другой выпуск.

### Native Linux x64

The Windows launcher uses WSL; Solana itself can run natively on Linux. Use an isolated clone on a native Linux filesystem, Node22.14.0 and the pinned toolchain. This is the documented manual path; it is not a claim of a fresh cold install on another computer.

```bash
npm ci --ignore-scripts
BONDTRACE_JUDGE_SETUP=true bash scripts/setup-isolated-toolchain.sh
export PATH="$HOME/.cargo/bin:$HOME/.local/bondtrace-tools/solana-release/bin:$HOME/.local/bondtrace-tools:$PATH"
bash scripts/build-program.sh
node scripts/write-program-release.mjs --check
npm run build
# Dedicated terminal, unused port and new preserved ledger; do not add --reset:
solana-test-validator --ledger .local/paged-native-ledger --rpc-port 8899 \
  --bind-address 127.0.0.1 --bpf-program \
  B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8 target/deploy/bondtrace.so
```

In an API terminal and a separate demo terminal, set the same explicit environment:

```bash
export BONDTRACE_NETWORK=localnet BONDTRACE_DEPLOYMENT=local
export BONDTRACE_STORAGE_BACKEND=sqlite BONDTRACE_ENABLE_DEMO=true
export SOLANA_RPC_URL=http://127.0.0.1:8899
export BONDTRACE_DATA_DIR="$PWD/.local/paged-demo/native/data"
# API terminal:
PORT=3200 npm start
# Demo terminal, after API/validator are ready:
npm run demo:paged -- --late-coupon --operation-id native_paged_demo_01
```

Keep the same environment, ID and flags on resume. Visit `http://127.0.0.1:3200`. Never adopt an unrelated occupied port or delete an uncertain journal/ledger. Native Linux removes the Windows/WSL bridge, not the need for a real validator/program and exact release checks.

## Legacy launcher reference / Старый лаунчер

The following default3160/8959 instructions describe the retained legacy lifecycle. The current paged path above has separate IDs/ports and does not reuse an old financial run.

Detailed Windows/WSL instructions. The primary README is the current judge entry; historical interface captures below are not current chain proof.

## Run the actual localnet lifecycle

### First-time Windows setup

Install [Node **22.14.0**](https://nodejs.org/download/release/v22.14.0/), [PowerShell **7**](https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell-on-windows), Git and [WSL2 with Ubuntu24.04](https://learn.microsoft.com/en-us/windows/wsl/install). The verified live path supports **Windows x64 + Ubuntu24.04 x64**. Linux can run the isolated CI checks below; the full runtime/lifecycle launcher is Windows/WSL-specific. Native macOS/ARM startup has not been verified.

If WSL/Ubuntu is missing, run Microsoft's installation command and complete its normal reboot/user setup:

```powershell
wsl --install -d Ubuntu-24.04
```

From the cloned repository, after the npm install above:

```powershell
npm run setup:judge
npm run demo:lifecycle
```

The setup helper uses explicit `-Distro`, inherited `BONDTRACE_WSL_DISTRO`, the workspace selection, then **Ubuntu-24.04**, in that order. Conflicting explicit/environment values or an existing different workspace selection are rejected. It checks/downloads Rust **1.91.0**, Agave **3.1.10** and Anchor **1.1.2** into the same WSL user's home used by the runtime. Only Linux OS packages use root/sudo; the first installation can request that WSL user's sudo password. Downloads are checksum-verified. Rust is pinned to this repository through `rust-toolchain.toml`; no existing global Rust default or Solana cluster configuration is changed. An already prepared matching toolchain is reused. Initial setup/build needs internet for downloads; warmed caches are reused.

For a different existing distribution, use a **separate clone** if this workspace already pins another ledger:

```powershell
pwsh -NoProfile -File scripts/judge-setup.ps1 -Distro YourPreparedDistribution
# Optional read-only prerequisite check:
pwsh -NoProfile -File scripts/judge-setup.ps1 -CheckOnly
```

Full source reproduction uses exactly **Node22.14.0**. The helper's prepared-distribution branch and full source lifecycle have been exercised on the development host; OS/WSL provisioning on another physical machine has not been independently tested.

### Prepared workspace: one command

```powershell
npm run demo:lifecycle
```

This builds the program and app, starts an isolated native Linux ledger and the built HTTP app, resumes test setup, creates a regular-rate issue, distributes bonds, records rights, pays two coupons, exercises voting and redeems/burns principal. It waits for actual chain deadlines and checks transaction proofs and restart persistence. Assets and signers are generated test fixtures.

Default endpoints: **app/API [127.0.0.1:3160](http://127.0.0.1:3160)**; Solana RPC `http://127.0.0.1:8959`. The command prints signatures, a bootstrap recovery ID and a unique evidence file. Bootstrap resumes its saved ID. The financial driver creates a new issue on each invocation; rerunning this command does not resume an interrupted financial driver. Recover interrupted payments through the saved operation/parent IDs and API before starting another issue. Transaction count can vary when extra test funding is needed. Preserve the IDs and evidence if interrupted; never replace an unresolved signed operation with a newly signed payment.

### Start the application without creating a new lifecycle

```powershell
npm ci --ignore-scripts
npm run build:program
npm run build
npm run runtime:start
```

The launcher verifies deployed program bytes, preserves the recorded ledger/genesis and refuses unrelated occupied ports. On a fresh runtime, use explicit test setup; existing issues remain available. Current v4 issuer creation supports annual rate/frequency and explicit fixed schedules; the retained legacy coordinator remains a separate API capability. Normal wallet mode prepares an exact reviewed message; generated signing is labelled separately.

Local public metadata and test keys are under ignored `.local/`; native ledgers stay in the selected WSL distribution. No owner keys or old fixtures are needed for source reproduction. [.env.example](../.env.example) documents legacy development defaults; no `.env` is required by the isolated lifecycle command. `npm run dev` uses the legacy development ports, rather than the isolated endpoints above.

For alternate ports: `pwsh -NoProfile -File scripts/lifecycle-demo.ps1 -RpcPort 8949 -ApiPort 3150`. For a prepared runtime, `npm run runtime:watch` performs bounded readiness/storage supervision without signing financial actions. [TECHNICAL.md](../TECHNICAL.md) explains restart and storage behavior.

![BondTrace payments workspace](../docs/evidence/ui/ecc-redesign-20261008/payments-1440.png)

*Current interface capture against the explicitly labelled read-only archive; this screenshot is not fresh chain proof.*


---

## Поднять полноценный localnet и выполнить транзакции

### Первый запуск на Windows

Поддержанный путь: **Windows x64 + Ubuntu 24.04 x64 в WSL2**. Установить:

- [Node 22.14.0](https://nodejs.org/download/release/v22.14.0/);
- Git и [PowerShell 7](https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell-on-windows);
- [WSL2 с Ubuntu 24.04](https://learn.microsoft.com/en-us/windows/wsl/install).

Если WSL/Ubuntu ещё нет, выполнить официальную команду Microsoft и завершить обычную настройку пользователя/перезагрузку:

```powershell
wsl --install -d Ubuntu-24.04
```

После клонирования и `npm ci --ignore-scripts`, из корня проекта:

```powershell
npm run setup:judge
npm run demo:lifecycle
```

`setup:judge` выбирает WSL-систему в порядке: явный `-Distro`, переменная `BONDTRACE_WSL_DISTRO`, сохранённый выбор проекта, Ubuntu-24.04. Конфликт явного значения с переменной окружения или с уже выбранной системой проекта отклоняется. Проверяет/устанавливает Rust 1.91.0, Agave 3.1.10 и Anchor 1.1.2 в домашнюю директорию того же Linux-пользователя, от которого запускается приложение. Только установка системных Linux-пакетов использует root/sudo; при первом запуске может потребоваться пароль пользователя Ubuntu. Загрузки проверяются по SHA-256. Rust закреплён для репозитория через `rust-toolchain.toml`; существующие глобальные настройки Rust и кластер Solana не переключаются. Подходящие установленные инструменты переиспользуются.

Первая установка и сборка требуют интернета для зависимостей и инструментов; повторные запуски используют кеши. Наличие npm-зависимостей само по себе не устанавливает Solana-компилятор.

Для другой подготовленной WSL-системы:

```powershell
pwsh -NoProfile -File scripts/judge-setup.ps1 -Distro YourPreparedDistribution
# Только проверить предпосылки:
pwsh -NoProfile -File scripts/judge-setup.ps1 -CheckOnly
```

Если рабочая папка уже привязана к другой WSL-системе и ledger, использовать отдельный клон: помощник запрещает незаметно менять эту привязку. Полное воспроизведение требует именно Node 22.14.0. Проверены подготовленная ветка setup и сквозное воспроизведение на рабочем компьютере; установка ОС/WSL на другом физическом компьютере отдельно не проверялась.

### На подготовленном окружении — одна команда

```powershell
npm run demo:lifecycle
```

Команда собирает программу и приложение, запускает отдельный native Linux ledger и HTTP-приложение, восстанавливает тестовую настройку, выпускает инструмент с проверяемыми ставкой/частотой, распределяет облигации, фиксирует права, выплачивает два купона, выполняет голосование, погашает номинал и сжигает облигации. Даты проверяются по настоящему времени блокчейна. Прогон проверяет доказательства транзакций и сохранность состояния после рестартов.

Адреса: **приложение/API [127.0.0.1:3160](http://127.0.0.1:3160)**, Solana RPC `http://127.0.0.1:8959`. В консоли выводятся подписи, bootstrap recovery ID и путь нового JSON с доказательствами. Bootstrap использует сохранённый ID. Финансовый driver при каждом вызове создаёт новый выпуск; повтор этой команды не возобновляет прерванный финансовый driver. Прерванные выплаты сначала восстанавливаются через сохранённые operation/parent IDs и API. Количество транзакций может отличаться при дополнительном тестовом финансировании. Не заменять неизвестный результат новой подписью платежа.

### Запустить приложение без нового финансового сценария

```powershell
npm ci --ignore-scripts
npm run build:program
npm run build
npm run runtime:start
```

Launcher сверяет байткод программы, сохраняет старый ledger/genesis и отказывается занимать чужие порты. На новом runtime тестовый выпуск создаётся явно через приложение; существующие выпуски сохраняются. Форма эмитента поддерживает фиксированные купонные расписания; годовая ставка/частота и координатор жизненного цикла доступны через API и сквозной скрипт.

Обычный режим кошелька готовит неподписанную транзакцию для внешнего подписания. Режим сгенерированных тестовых подписантов обозначен отдельно. Метаданные и тестовые ключи лежат в игнорируемой `.local/`, native ledger — внутри выбранной WSL-системы. Ключи владельца и старые fixtures не нужны для воспроизведения исходников. `.env` для изолированного сквозного запуска не требуется; [.env.example](../.env.example) описывает прежние development defaults. `npm run dev` использует прежние порты разработки.

Другие порты: `pwsh -NoProfile -File scripts/lifecycle-demo.ps1 -RpcPort 8949 -ApiPort 3150`. `npm run runtime:watch` отдельно включает ограниченный контроль состояния и хранения; supervisor не подписывает финансовые действия.

![Рабочий экран выплат BondTrace](../docs/evidence/ui/ecc-redesign-20261008/payments-1440.png)

*Актуальный интерфейс с явно обозначенным архивным снимком. Скриншот не является свежим подтверждением блокчейна.*
