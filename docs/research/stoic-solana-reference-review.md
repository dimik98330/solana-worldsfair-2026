# stoictradingAI: scoped Solana reference review

8 октября 2026. Workspace: `C:\Users\dmitrii\Documents\solana`. Активная задача BondTrace/KASE и план S01–S06 сохраняются. Режим — **ProofPilot coach**, source-grounded technical review. Прочитаны актуальные AGENTS/STATE; переиспользованы actually installed ProofPilot direct implementation/review, solana-dev security/testing/payment guidance и review-and-iterate security/code-review references. Это анализ внешнего source, не установка, исполнение, benchmark или integration.

## Происхождение и назначение

Pin: `affaan-m/stoictradingAI@a771fb9b06cf37c3724984420805a156862e89ac`. GitHub показывает archived repository (18 мая 2026). README описывает Eliza agent framework с model/connectors/actions и trading среди use cases. Это не специализированный corporate-actions engine и не доказанная ML-модель для BondTrace. [README](https://github.com/affaan-m/stoictradingAI/blob/a771fb9b06cf37c3724984420805a156862e89ac/README.md).

Lead inventory `.local/stoic-review/inventory.json` фиксирует `skillFiles:[]` в tree `a69ef4d8bf757a04f054822305b920fffae98db0`. В этой pinned версии готового upstream `SKILL.md` не обнаружено. Если owner запросил skill, подходящий deliverable — **прозрачно обозначенный локальный reference-derived skill**, написанный с skill-creator и ссылками на исходники, а не утверждение «установлен официальный stoictradingAI skill». Дериватив не должен объявлять обучение модели, работающее подключение или пакетную установку monorepo.

LICENSE — MIT, copyright 2024 Shaw Walters, aka Moon aka @lalalune. При копировании существенных частей исходников сохранять copyright/license notice; локальные рекомендации могут быть оригинальными и только ссылаться на pin. [LICENSE](https://github.com/affaan-m/stoictradingAI/blob/a771fb9b06cf37c3724984420805a156862e89ac/LICENSE). Это license/provenance observation, не общий юридический вывод.

## Что полезно как проверочный reference

| Source pattern | Ограниченное полезное применение в BondTrace |
|---|---|
| transfer derives sender/recipient ATA; builds account creation before token transfer | Проверять canonical beneficiary/mint/owner и absent-account path. BondTrace уже использует idempotent ATA, так что копировать старую existence-check/create race не нужно |
| swap checks keypair public key against expected wallet | Дополнительный пример того, почему сохранённая signing identity должна совпадать с actual signer. В BondTrace human-wallet keys остаются во внешнем wallet |
| swapUtils simulates before execute and stops on `value.err` | Evidence/checklist для preflight failure и transaction atomicity. Это не разрешение подписывать или менять entitlement |
| wallet has finite retry loop and separates provider read from action construction | Можно использовать как контрпример для bounded read retries, cache context и timeout policy, сохраняя текущие зависимости и прямой Solana RPC |
| token tests inject mocked cache/provider | Изолировать unit tests от RPC/accounts и honest-mark mocked observations; такие тесты не заменяют actual SBF/SPL/runtime |

Эти patterns уже в значительной степени представлены в BondTrace. Внешний источник оправдывает конкретную проверку, но не новый trading feature, Jupiter/Birdeye/GraphQL/OpenAI/Twitter connector, MCP, paid provider или новый framework.

## Что нельзя переносить без переосмысления

### Exact math и mint identity

`transfer.ts:150–158` получает parsed mint decimals с fallback9 и рассчитывает `BigInt(Number(amount)×10^decimals)`. Number intermediate может потерять точность до BigInt, а missing decimals не должны становиться guessed9. `swapUtils.ts:52–65` также масштабирует amount через Number. `swap.ts:84–89` использует BigNumber, но input quantity уже имеет number type и может ранее потерять точность. Для corporate-action liabilities нужны decimal-string/BigInt base units, verified classic SPL mint/decimals/authority и fail-closed unknown state. [Transfer](https://github.com/affaan-m/stoictradingAI/blob/a771fb9b06cf37c3724984420805a156862e89ac/packages/plugin-solana/src/actions/transfer.ts#L150), [swapUtils](https://github.com/affaan-m/stoictradingAI/blob/a771fb9b06cf37c3724984420805a156862e89ac/packages/plugin-solana/src/actions/swapUtils.ts#L52), [swap](https://github.com/affaan-m/stoictradingAI/blob/a771fb9b06cf37c3724984420805a156862e89ac/packages/plugin-solana/src/actions/swap.ts#L71).

### LLM output не является полномочием расходовать средства

Transfer content создаётся LLM (`transfer.ts:121–125`), однако action validator на76–95 **возвращает false**, а admin checks закомментированы. Этот проход не утверждает, что этот transfer action доступен в работающем агенте. Handler как пример nevertheless использует server keypair и signer-send путь; его нельзя переносить в BondTrace.

В `swap.ts:221–224` validator возвращает true; request получается через model на250–254, а handler не содержит пользовательского review/confirmation gate перед keypair signing388. При этом quantity принудительно заменяется на0.0008 на350, независимо от разобранного amount. Это verified source behavior данного handler, не воспроизведённый exploit всего framework. В BondTrace адресаты/amount/record date должны определяться immutable contract и точным request; LLM может объяснять состояние, но не выбирать beneficiaries, купоны, burn authority или лимиты. [Transfer validation](https://github.com/affaan-m/stoictradingAI/blob/a771fb9b06cf37c3724984420805a156862e89ac/packages/plugin-solana/src/actions/transfer.ts#L76), [swap validation](https://github.com/affaan-m/stoictradingAI/blob/a771fb9b06cf37c3724984420805a156862e89ac/packages/plugin-solana/src/actions/swap.ts#L218), [quantity/signing](https://github.com/affaan-m/stoictradingAI/blob/a771fb9b06cf37c3724984420805a156862e89ac/packages/plugin-solana/src/actions/swap.ts#L340).

### Custody и mainnet defaults

`transfer.ts:140–143`, `swap.ts:374–388` получают private signing capability через `getWalletKey`; implementation этого helper не входила в bounded packet, поэтому точное место хранения/формат секретов здесь не устанавливается. Swap явным образом создаёт mainnet connection341–343; swapUtils17 и wallet DEFAULT_RPC16 также имеют mainnet fallback. Это не подходит test-localnet/devnet-only gate BondTrace и external-wallet custody. Не переносить runtime private key configuration, mainnet fallback, automatic trading или любые default credentials.

`swap.ts:30–33` содержит credential-like hardcoded Twitter defaults, а403–428 вызывает OpenAI/Twitter side effect до confirmation. Значения намеренно не сохраняются в этой записке; действительность/принадлежность этих публичных literals не проверялись. Нельзя импортировать/запускать этот module ради «полезных helpers» или перепечатывать секретоподобные строки в skill. [Pinned swap source](https://github.com/affaan-m/stoictradingAI/blob/a771fb9b06cf37c3724984420805a156862e89ac/packages/plugin-solana/src/actions/swap.ts).

### Lifetime, outcomes и third-party transaction trust

Transfer handler на211–217 сообщает success после `sendTransaction`, без наблюдаемого confirmation. Swap deserializes external Jupiter transaction364–370 и затем подписывает; здесь нет exact instruction allowlist/review comparison. `swapUtils.ts:74–85` и `swap.ts:392–437` запрашивают fresh latest blockhash для confirmation уже построенного/signed external message; этот code fragment не устанавливает, что confirmation lifetime совпадает с blockhash внутри того сообщения. Передача signature и другого lifetime не даёт корректного expiry evidence.

Для BondTrace сохранять reviewed exact message, every required Ed25519 signature, actual signed blockhash/lastValidBlockHeight, genesis/deployed-release binding и durable receipt до relay. HTTP response/signature, confirmed, finalized и local projection completion — разные факты. Financial POST при unknown не заменяется automatic newly signed retry. [Transfer send](https://github.com/affaan-m/stoictradingAI/blob/a771fb9b06cf37c3724984420805a156862e89ac/packages/plugin-solana/src/actions/transfer.ts#L199), [swapUtils confirmation](https://github.com/affaan-m/stoictradingAI/blob/a771fb9b06cf37c3724984420805a156862e89ac/packages/plugin-solana/src/actions/swapUtils.ts#L69), [swap confirmation](https://github.com/affaan-m/stoictradingAI/blob/a771fb9b06cf37c3724984420805a156862e89ac/packages/plugin-solana/src/actions/swap.ts#L390).

### Cache и providers не являются финансовым реестром

`wallet.ts:65` задаёт five-minute cache; portfolio key118 и175 включает wallet, но не chain genesis/slot/program. В GraphQL transformation233 decimals записаны как6, amount/value поля представлены market-provider projection. `fetchWithRetry:75–105` ограничивает число attempts, но inspected fetch78 не содержит explicit timeout/AbortSignal и generic catch повторяет errors без различения HTTP429. Это пригодно как review counterexample; рынок/USD/cache не определяет bond holdings, historical snapshot или liabilities.

BondTrace получает финансовый граф из validated accounts одного confirmed context; caches для необязательных explanation/market views должны иметь scope/age и не попадать в money authority. [Wallet provider](https://github.com/affaan-m/stoictradingAI/blob/a771fb9b06cf37c3724984420805a156862e89ac/packages/plugin-solana/src/providers/wallet.ts#L65), [GraphQL transform](https://github.com/affaan-m/stoictradingAI/blob/a771fb9b06cf37c3724984420805a156862e89ac/packages/plugin-solana/src/providers/wallet.ts#L198).

### Mock tests не доказывают execution

Прочитанный `token.test.ts` содержит5 cache/wallet lookup tests, global fetch/provider mocks, без actual Solana transaction settlement assertions. Эти checks поддерживают узкие cache behavior claims; они не доказывают transfer auth, exact quantities, chain finality, coupon snapshot или redemption. Они не запускались и pass не заявляется. [Tests](https://github.com/affaan-m/stoictradingAI/blob/a771fb9b06cf37c3724984420805a156862e89ac/packages/plugin-solana/src/tests/token.test.ts).

## Дополнительные проверки: design для текущего backend

Это proposed acceptance additions в уже разрешённом S01–S06 scope. Фактическое наличие/результаты current implementation проверяет lead; эта записка их не исполняет и не делает новые требования бесконечным audit loop. Не дублировать уже покрытые cases без нового gap.

| Stage | Проверка | Наблюдаемый результат |
|---|---|---|
| S02/S04 | Amount выше JS safe integer, nonrepresentable coupon, missing/wrong mint decimals | Raw exact integer сохраняется либо запрос rejected до signature; никакого guessed precision/rounding |
| S02/S06 | Подмена beneficiary/amount через prose, aliases, conflicting parsed fields | Contract/request binding fail-closed; recipients и amounts неизменны; вообще не требуется LLM service |
| S03/S06 | Signed message lifetime отличается от fresh RPC latest lifetime | Recovery использует сохранённый signed lifetime; expiry не разрешает новую подпись при unknown |
| S03/S06 | Relay accepted/lost response, confirmed затем pruned history, later finalized observation | Same signature/recovery ID; provenance явно recorded vs live; finality не повышается из null |
| S01/S03 | Bounded RPC read stalls/429/malformed JSON | Конечный timeout, rate-limit stop/backoff policy, no unbounded concurrent retry; unresolved financial receipt сохранён |
| S01/S06 | Stale view/cached wrong genesis перед batch | Подписывание blocked или refresh coherent graph; cache не определяет entitlement |
| S04/S06 | ATA создан другим процессом после preview; vault/recipient freeze изменён | Idempotent ATA + simulation/program constraints; whole batch rollback, no partial payment внутри transaction |
| S06 | Исходящий status/evidence side effect fails after successful payment | Chain status остаётся authoritative; projection recovery не подписывает action заново и не делает success до receipt |

Existing independently verified backend properties и план S01–S06 должны оставаться основой. Из данного repo полезен небольшой reference/counterexample checklist, а не migration на Eliza, Jupiter swap workflow или серверный custody.

## Инспектированный packet и SHA256

Fetched pinned GitHub raw text08.10.2026, UTF-8 SHA256; source не сохранялся в product source. Прочитаны relevant code ranges после первоначального targeted scan; credential-like literals не включаются в deliverable.

| Файл | SHA256 |
|---|---|
| README.md | 72ef440fcc92c7f955b1df752a375386e54a2fb243ee40cce5599446ded47385 |
| LICENSE | 5480f4b0b6265de4f44b38266edd42bc2e474cb179988860e815eb5518e486ca |
| packages/plugin-solana/src/actions/transfer.ts | cabaadcd0e388781010ec458d58a1b47bf9fc2bf199bd62d6f87cb8630146af2 |
| packages/plugin-solana/src/actions/swap.ts | f44fe1feb5ee0eca48758e60cd46f2c54c75cb5a35c3dffa275752e02f6edb05 |
| packages/plugin-solana/src/actions/swapUtils.ts | 12903270104466d52b90af6b29940392080e1c3011df7cae56b2cac337ceca4e |
| packages/plugin-solana/src/providers/wallet.ts | eee56ddf1be1b4580d7e41cb844a7402c1cad149fa9f1840f03a38a33f12e235 |
| packages/plugin-solana/src/tests/token.test.ts | 8a7523793051e729d247de31bd0dce6addb5136bbc8fbcc34ed5652a1668014f |

Все primary source links закреплены на одном SHA; archive/MIT/inventory не означают security certification. Не проверялись текущая совместимость old dependencies, actual remote services, runnable upstream app, ML training или mainnet transactions. Единственный write этого агента — `docs/research/stoic-solana-reference-review.md`. Нет установки, code/config/skills/Git/process/chain/account mutations. Lead отвечает за requested local skill и implementation/testing.

Continuation rule: прочитать AGENTS/STATE, выбирать/читать actually installed relevant SKILL.md/references перед substantial task; handoff повторяет rule, disjoint ownership и gates. Preserve original ledgers/signers/evidence и old assessment budgets. Test localnet/devnet only; no real assets/mainnet/paid/public visibility/final submission/consent из этого scope.
