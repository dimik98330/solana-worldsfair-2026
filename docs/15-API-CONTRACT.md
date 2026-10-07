# API contract v1 — frontend/integration boundary

All money/quantities are integer **strings** in smallest units. Settlement token uses6 decimals, bond units0. Server chain decoder is source of runtime state; no success before RPC confirmation. API errors use `{error:{code,message,retryable}}`. Canonical network is localnet/devnet only.

## GET /api/state

Returns `{network,rpcUrl,programId,connected,serverTime,instrument,holders,coupons,redemption,proposals,activity,demo}`.

- `instrument`: null or `{address,name,symbol,issuer,bondMint,settlementMint,faceValueMinor,rateBps,couponFrequency,status,issuedSupply,redeemedSupply,recordAt,paymentAt,maturityAt,vaultBalanceMinor}`. status draft/active/redeeming/redeemed.
- `holders`: `{wallet,label,units}`[]. Labels are explicit test fixture labels or known local metadata; never invented people.
- `coupons`: `{id,snapshotAddress,recordAt,paymentAt,recordSlot,totalMinor,paidMinor,status,entitlements}`[]; entitlement `{wallet,units,amountMinor,claimed}`; status scheduled/recorded/funded/completed.
- `redemption`: null or `{snapshotAddress,totalMinor,paidMinor,entitlements}` with same entitlement fields.
- `proposals`: `{id,title,snapshotAddress,deadlineAt,yesWeight,noWeight,eligibleWeights,votedWallets,status}`[]; eligibleWeights `{wallet,units}`[]; status open/closed.
- `activity`: `{signature,time,kind,status,explorerUrl}`[]; only real signatures; localnet explorerUrl may use custom RPC reference.
- `demo`: `{available,ready,accelerated,roleWallets}`; roleWallets is public-address map issuer/investor1/investor2/investor3. No secrets in response.

## Wallet and demo actions

`POST /api/actions/prepare` `{action,walletAddress,params}` → `{transactionBase64,lastValidBlockHeight,operationId,summary}`. Summary includes actual `simulation:{success,computeUnits}` and `feeLamports`, plus `{network,action,signer,amountMinor?,token?,recipients?}`. User signs with wallet, server relays already signed bytes via `POST /api/transactions/submit` `{signedTransactionBase64}` → `{signature,status}`. Exact prepared message hash is persisted; arbitrary/modified transactions are rejected, replay returns its saved signature. `GET /api/transactions/:signature` reads confirmation.

Action names: capture_coupon, claim_coupon, begin_redemption, redeem_principal, create_vote, cast_vote, transfer_bonds, fund_vault. Coupon/proposal IDs and targetWallet/units/choice are params where applicable. Exact program instruction mapping belongs to lead adapter.

Clearly separated local **demo** actions: `POST /api/demo/bootstrap` sets up test instrument and generated test wallets only; `POST /api/demo/action` `{action,role,params}` runs the same program instruction using named generated test signer (role issuer/investor1/investor2/investor3). This is explicitly a demo harness, never a proxy for human wallet signature or actual funds. Response real signature/status, not synthetic toast. Server rejects non-demo signers, arbitrary external destinations, mainnet, or actions outside fixed fixture.

Frontend handles empty/disconnected RPC, initialization, pending/confirmed/failure, already-claimed and cancelled-wallet states. Polling while pending is bounded; uncertain status does not automatically re-sign. Lead may evolve optional fields without changing existing meanings; version changes coordinated before edits.
