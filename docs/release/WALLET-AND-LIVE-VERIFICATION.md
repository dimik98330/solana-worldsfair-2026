# Live Solana and external signing / Живая Solana и свой кошелёк

[English README](../../README.md) · [Русский README](../../README.ru.md)

## English

**Primary verification is live localnet, not the archive preview.** Run the README prerequisites, `npm run setup:judge` and `npm run demo:lifecycle`, then open the app on3160. The script creates a fresh issue and sends actual Solana transactions; inspect its printed signatures and unique evidence file. Test identities and valueless settlement currency do not make the RPC/account/program execution a mock.

To check independently:

```powershell
Invoke-RestMethod http://127.0.0.1:3160/api/health
Invoke-RestMethod http://127.0.0.1:3160/api/program
Invoke-RestMethod http://127.0.0.1:3160/api/state
```

Check `network: localnet`, the genesis hash and program `status: known-match` against the expected release manifest. State includes current account context and exact reconciliation. For a transaction, use `/api/transactions/SIGNATURE` and `/api/transactions/SIGNATURE/proof`. A local Explorer link works only while that exact validator/history is available. Missing/pruned history is an explicit gap; a retained observation is not a fresh RPC attestation.

### External Wallet Standard wallet

1. Use the live3160 application. Port4180 is an archive and cannot sign.
2. In **Account → Your wallet**, choose the detected wallet and approve connection in the extension. If already connected, choose **Use my wallet**.
3. The wallet/account must advertise `solana:localnet`, `solana:signTransaction` and the prepared message version. Unsupported wallets are not relabelled as devnet. The wallet's RPC, when required by the extension, must match `http://127.0.0.1:8959` and the same genesis.
4. The connected public address needs local test SOL for transaction fees/ATA rent. With the prepared WSL tools, a local validator faucet can fund that address:

```powershell
# Replace the distribution/address with your own selected WSL/public address.
# This is ONLY the loopback localnet faucet; it has no real SOL value.
wsl -d Ubuntu-24.04 --exec bash -lc 'export PATH="$HOME/.local/bondtrace-tools/solana-release/bin:$PATH"; solana airdrop 2 YOUR_CONNECTED_PUBLIC_ADDRESS --url http://127.0.0.1:8959'
```

5. Connecting does not grant issuer or holder authority. To test as an investor, the issuer must register this public address and issue bonds **before sealing and record date**, with the full settlement reserve funded. Use a fresh draft issue; a fully redeemed demo issue does not give a newly connected wallet old rights. Inspect the issuer/holder addresses in the app.
6. Prepare an eligible action, review network/amount/recipient/fee, then **Sign in wallet**. The API validates the exact signed message before relay; the resulting signature/account effects are the evidence. Private keys never enter the API in this mode.

The existing app uses Wallet Standard discovery and signing. A complete human-extension GUI run is **not yet established**. Official [Solana guidance](https://solana.com/developers/templates/web3js-nextjs) explains that localnet discovery lists only wallets advertising `solana:localnet`. Phantom [developer settings](https://help.phantom.com/articles/28951369255699) expose testnet mode; that alone does not prove arbitrary local RPC support. Backpack documents [developer testnets](https://support.backpack.exchange/wallet/actions/add-developer-testnets) and [localhost RPC limitations](https://support.backpack.exchange/wallet/technical-docs/localhost-rpc-endpoints). We do not guarantee a particular extension/version or expose the validator publicly to bypass a wallet limitation. Sources inspected9October2026.

Devnet is a separate deployment/funding/real-signature verification step. Do not switch the label or reuse localnet receipts as devnet proof. The complete recorded localnet financial path remains independently executable with generated cryptographic test signers even when an extension does not support the local cluster.

## Русский

**Основная проверка выполняется на живом localnet.** После подготовки из README запустить `npm run demo:lifecycle` и открыть3160. Скрипт создаёт новый выпуск и выполняет настоящие Solana-транзакции; подписи и отдельный JSON выводятся в консоль. Тестовая валюта/подписанты не подменяют RPC, аккаунты и исполнение программы макетом.

Команды `/api/health`, `/api/program`, `/api/state` выше позволяют проверить localnet/genesis, совпадение байткода и текущие числа. `/api/transactions/SIGNATURE` и `/proof` показывают receipt/proof. Local Explorer зависит от наличия именно этого validator и его истории; сохранённый proof после pruning не выдаётся за свежую RPC-проверку.

Для собственного кошелька открыть **«Аккаунт → Ваш кошелёк»**, выбрать обнаруженный кошелёк, подтвердить подключение и при необходимости нажать **«Использовать мой кошелёк»**. Требуются `solana:localnet`, `solana:signTransaction` и поддержка версии подготовленного сообщения. Если расширение само использует RPC, он должен совпадать с8959 и genesis приложения. Несовместимость не обходится подменой сети.

На адрес нужны локальные тестовые SOL для fee/ATA rent. Команда faucet выше использует только loopback8959; заменить WSL-систему и публичный адрес. Приватный ключ не вводится. Подключение не делает пользователя эмитентом/держателем: для проверки купона/погашения эмитент должен зарегистрировать этот адрес, выдать облигации и полностью профинансировать новый draft **до sealing/record date**. Старый погашенный выпуск не выдаёт новому кошельку исторические права.

После подготовки доступного действия проверить сеть/сумму/получателя/fee и нажать **«Подписать в кошельке»**. API принимает только точное проверенное сообщение с валидной подписью. Реальная подпись и изменения счетов подтверждают результат; ключи пользовательского кошелька не передаются backend.

Полный GUI-прогон с конкретным Phantom/Backpack пока **не подтверждён**. Официальные ссылки в английском разделе описывают возможности и ограничения, но наличие testnet mode не гарантирует localnet/custom RPC в любой версии. Валидатор ради обхода этого ограничения публично не раскрывается. Devnet требует отдельного развёртывания, финансирования и подписи; localnet-доказательства туда не переносятся.
