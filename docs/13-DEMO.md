# Demonstration and recorded media

## Current workspace walkthrough — 11 October 2026

**[Watch the 98-second v4 demo](../artifacts/demo/release-20261011/bondtrace-v4-localnet.mp4)** · [English captions](../artifacts/demo/release-20261011/captions.en.vtt) · [Recording provenance](../artifacts/demo/release-20261011/provenance.json)

Actual navigation through the current built interface reading a completed **localnet v4** issue: coupon500 and its exact matching receipt; original10/5/3 rights and a later receiver with no old entitlement; next record10/4/3/1; voting13/5; principal10000 for the primary holder;18bonds retired; retained transaction signatures. The permanent scope caption identifies generated test signers and recorded results. No wallet prompt or financial transaction occurs in this recording; it is not footage of public execution.

The MP4 is1440×900,H.264,98.208seconds,1,314,625bytes. Full decode and Chromium playback were checked. Source1322f3b and built asset identity are pinned in provenance. It is an honest product walkthrough; the executable lifecycle and receipts establish the separate transaction evidence.

## Reproduce the complete lifecycle

For current v4, follow [README](../README.md) and [setup](LOCALNET-SETUP.md):

```powershell
npm run demo:paged:lifecycle
```

On a prepared machine: isolated validator/API → issue/distribute → record rights/vote → transfer/new receiver → coupons → principal/burn → old coupon after retirement → results/signatures. Generated local test signers are used. The historical prepared run retained [37 independently observed finalized signatures](evidence/servicing-v4-one-command-check-20261010.json).

For a live demonstration show issue/network, immutable coupon500, post-record transfer/new receiver with zero historical rights, receipt, voting result, principal10000/burn and zero obligations. Voting occurs before maturity even when its result is explained later. Unknown status requires same-ID recovery.

## Historical media

[Earlier English product demo](../artifacts/demo/bondtrace-product-demo.mp4):174.021333seconds,1920×1080,H.264/AAC,30fps. It captures an earlier localnet UI, edited rather than continuous, without human-wallet or v4 proof. [Media manifest/rebuild](../artifacts/demo/README.md) retains its exact inputs; old media was not overwritten.

A later Russian edit remains in the owner's ignored `.local/demo-video-v2/output`; it also shows an earlier release. `npm run submission:preview` serves the historical page on5180, not a fresh chain check. Final registration/submission and any platform-specific video upload remain [owner checkpoints](14-SUBMISSION.md). No successful ordinary Phantom transaction is demonstrated by these recordings.
