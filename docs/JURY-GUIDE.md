# Judge inspection guide / Гид проверки жюри

[English README](../README.md) · [Русский README](../README.ru.md) · [Technical guide](../TECHNICAL.md)

## Inspect without installing

1. Open the [completed devnet issue](https://bondtrace-devnet.onrender.com/?view=payments&instrument=2KWpyE9mQWS6VTviCJFi1b4Zh55rti9xeDS6yk37sU7Y). No wallet/site login is needed for inspection.
2. Payments: coupon total 900 paid, principal total 18,000 paid; first holder 500 coupon and 10,000 principal. Every completed on-chain operation has a signature in Receipts & activity.
3. Holder registry and voting: coupon/vote snapshots retain 10/5/3 despite a transfer changing current holdings to 10/4/4; voting records 13 yes / 5 no. After redemption the live mint supply is zero.
4. Inspect [the actual Solana account](https://explorer.solana.com/address/2KWpyE9mQWS6VTviCJFi1b4Zh55rti9xeDS6yk37sU7Y?cluster=devnet), [26 exact transaction proofs](evidence/hosted-devnet-20261009.json) and [deployment/restart record](33-HOSTED-DEPLOYMENT.md).
5. To reproduce new transactions, use README → setup:judge → demo:lifecycle. That uses an isolated local validator and generated test identities, not the already completed holders' keys.

The application/API runs on free Render with Neon PostgreSQL; financial accounts/transfers/burns execute on Solana devnet. Test settlement currency and identities are simulated; signatures, SPL balances, fixed rights and retirement are actual chain state. The public server holds no issuer/holder private keys. Free sleep/quota and RPC-history limitations remain explicit.

## Wallet check

The required corporate-action cycle has 26 actual finalized signatures from external cryptographic test signers. Phantom connection and simulation were observed, but its owner-reported approval produced Unexpected error before API submission. The attempted draft is absent and its test balance unchanged. [Exact wallet result](evidence/hosted-wallet-check-20261009.json). Wallet diagnosis is complete for this evidence cutoff; successful Phantom signing is not asserted. A connection screenshot is not a signing proof.

## Submission boundaries

| Material / condition | Current evidence |
|---|---|
| Working Solana prototype | Eight KASE minimum engineering functions demonstrated in the recorded hosted cycle |
| Source and launch instructions | Private repository, EN/RU README, setup/demo scripts and tests supplied; owner must provide reviewer access |
| Short technical overview | [TECHNICAL.md](../TECHNICAL.md), architecture/formulas/record dates/settlement/recovery |
| Final demo video | Owner records the final version; historical frozen media is not a new submission video |
| Main registration / eligibility | Owner/account stage; no new authoritative organizer verification in this code/documentation audit |
| Final submission / acceptance | Owner action and organizer receipt; neither Git push nor ProofPilot review performs it |

ProofPilot coach acceptance concerns the exact reviewed artifact/evidence scope. It is not an organizer decision, production certificate or guaranteed score.

## Источники и порядок проверки

Открыть завершённый выпуск → купоны/номинал → реестр/голосование → квитанции и Explorer → технический обзор. Для воспроизведения нового цикла использовать инструкции README: настоящий localnet, отдельные тестовые ключи и реальные транзакции.

Восемь технических требований KASE показаны; подключение Phantom не выдаётся за успешную подпись. Доступ жюри к приватному GitHub, финальное видео, eligibility и отправка остаются действиями владельца. Старые отчёты сохраняют собственные даты и source IDs: [история проверок](VERIFICATION-HISTORY.md), [индекс документации](README.md).
