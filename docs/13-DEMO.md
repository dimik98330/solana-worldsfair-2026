# Demonstration and recorded media

For **current v4**, follow [README](../README.md) and [setup](LOCALNET-SETUP.md):

```powershell
npm run demo:paged:lifecycle
```

On a prepared machine: isolated validator/API → issue/distribute → record rights/vote → transfer/new receiver → coupons → principal/burn → old coupon after retirement → results/signatures. Generated local test signers are used. The prepared run retained [37 independently observed finalized signatures](evidence/servicing-v4-one-command-check-20261010.json).

For a short walkthrough show issue/network, immutable coupon500, post-record transfer/new receiver with zero historical rights, receipt, voting result, principal10000/burn and zero obligations. Voting occurs before maturity even when its result is explained later. Unknown status requires same-ID recovery.

## Historical video

[English product demo](../artifacts/demo/bondtrace-product-demo.mp4):174.021333seconds,1920×1080,H.264/AAC,30fps. It captures an **earlier localnet UI**, edited rather than continuous, without human-wallet or v4 proof. [Media manifest/rebuild](../artifacts/demo/README.md) retains exact inputs.

A later Russian Svetlana edit was delivered locally in the owner's ignored `.local/demo-video-v2/output`; it is also an earlier release. Local paths are not submission URLs. `npm run submission:preview` serves the historical page on5180, not a fresh chain check. Final video upload, separate pitch if required, registration and submission remain [owner actions](14-SUBMISSION.md). No successful ordinary Phantom transaction is demonstrated.
