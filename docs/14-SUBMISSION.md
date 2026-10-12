# KASE materials and owner gates

**Colosseum main hackathon: submitted.** On 12 October 2026 at 02:45 PDT (09:45 UTC, 14:45 Kazakhstan), the owner completed the final survey and submitted [BondTrace, project 16242](https://colosseum.com/arena/projects/bondtrace). The authenticated portal subsequently showed **Submitted** and **Your project is entered for judging**; all required materials and the sole participant profile were complete. This is portal submission status, not a judging result. [Evidence](evidence/colosseum-submission-20261012.json).

**KASE side track: separate submission pending.** The owner-supplied challenge requires coupon, maturity redemption, one additional action and verifiable Solana logic; external fiat rails may be simulated. See [acceptance](08-SPEC.md) and [bounded readiness](35-READINESS.md).

The form was inspected7October at [KASE listing](https://superteam.fun/earn/listing/superteam-kazakhstan-x-kase-side-track-corporate-actions-on-blockchain). Recheck actual fields/deadlines at submission; old logins are not current acceptance.

| Material | Destination / boundary |
|---|---|
| Source | [GitHub](https://github.com/dimik98330/solana-worldsfair-2026), already public at10October publication |
| Hosted application | [Render devnet](https://bondtrace-devnet.onrender.com/), current v4 rollout verified; [versioned record](33-HOSTED-DEPLOYMENT.md), free service may sleep |
| Architecture | [TECHNICAL](../TECHNICAL.md), [protocol](34-PAGED-SERVICING.md), [API](15-API-CONTRACT.md) |
| Reproduction | [English](../README.md) / [Russian](../README.ru.md), [setup](LOCALNET-SETUP.md) |
| Evidence | [Verification history](VERIFICATION-HISTORY.md), source-bound CI and JSON receipts |
| Videos | [English public-devnet demo (162.48 s)](https://youtu.be/arOCHtruN_Q), [separate English pitch (116.04 s)](https://youtu.be/3t2nP0fGRtI); both published unlisted, linked in the submitted form, playback observed; [scope/provenance](13-DEMO.md) |
| Main registration/project/profile | [BondTrace 16242](https://colosseum.com/arena/projects/bondtrace); sole participant profile complete, submitted 12 October |
| Binding consent / final send | Owner completed final survey and submission; agent observed portal confirmation. Accelerator application remained off. |

## English description draft

BondTrace services permissioned tokenized test bonds on Solana: identify holders, fix record-date rights, calculate integer entitlements, settle SPL coupons, pay principal with atomic burns, and record snapshot-weighted votes.

The additive v4 protocol has paged holder/schedule/action accounts. Any fee payer can advance due coupon/maturity capture; holders sign principal retirement. Post-activation receivers gain no historical rights. Durable IDs, exact signed messages, transactional metadata and reconciliation support recovery.

The public v4 run completed500coupon,10000principal,10bonds burned and a10/0vote. All18signatures were observed finalized;17business proofs match their original signed wires. An actual service restart preserved the same IDs and financial projection. The prepared localnet run and larger33→34holder/9coupon run remain separate capacity/lifecycle evidence. [Current public results](evidence/hosted-v4-lifecycle-20261011.json), [recovery](evidence/hosted-v4-recovery-20261011.json).

The matching public v4 program and refreshed workspace are now deployed and verified. All assets are test tokens; ordinary human Phantom success remains unverified. Registry/settlement adapters operate in sandbox/shadow mode; no real bank/KASE partner, customers, regulated securities or production audit is claimed.

## Русское описание

BondTrace обслуживает тестовые токенизированные облигации в Solana: реестр → неизменяемые права → точный расчёт → купон/погашение с burn → проверяемый результат. Дополнительное действие — голосование. Исходники v4 и localnet-доказательства опубликованы; совпадающие программа v4 и обновлённый интерфейс развёрнуты в публичном devnet. Тестовые подписанты, обычный Phantom и внешние интеграции описаны раздельно.

## Final owner checklist

1. Confirm main eligibility/registration and actual project/profile URLs.
2. Choose/upload a video within the required limit; match footage to version/network claims.
3. Inspect public links anonymously and disclose wallet/deployment limits.
4. Recheck live form/deadlines; personally confirm binding consent.
5. Submit only when authorized; retain accepted submission ID/state.

No social post, organizer message, visibility change, paid hosting, mainnet or real-money action is authorized here.
