# Demonstration

**[Watch the 2:30 continuous demo](../artifacts/demo/one-take/bondtrace-demo.mp4)** · [Recording provenance](../artifacts/demo/one-take/provenance.json)

The owner-narrated video follows the actual interface in one continuous take: languages and time zone, issue creation fields, coupon500 with its exact receipt, recorded holder rights and portfolio, principal10000, voting and transaction history. The cursor moves smoothly and remains visible inside dialogs. No cuts, screenshots, stitched clips or speed changes are used; the complete original narration is included.

It reads a completed **localnet v4 test issue** with synthetic SPL assets. No new financial transaction or human-wallet signature occurs during this walkthrough. Program execution is established separately by the lifecycle receipts; public deployment has its own [versioned record](33-HOSTED-DEPLOYMENT.md).

The MP4 is1440×1000,H.264/AAC,150.08seconds,9,700,894bytes. All3752native frames keep their original timestamps. Full decode, Chromium playback, complete audio and independent visual/continuity review passed.

## Reproduce the complete lifecycle

Follow [README](../README.md) and [setup](LOCALNET-SETUP.md):

```powershell
npm run demo:paged:lifecycle
```

The prepared localnet scenario covers issue/distribution → record rights/vote → transfer/new receiver → coupons → principal/burn → old coupon after retirement. Generated local test signers are used. [Historical prepared-launcher proof](evidence/servicing-v4-one-command-check-20261010.json) retains37independently observed finalized signatures at its exact cutoff. Unknown outcomes require the original recovery ID.

Earlier edited174s and silent98s video packages remain in the [immutable historical media snapshot](https://github.com/dimik98330/solana-worldsfair-2026/tree/56841f415bcf851b8096e57f1e8f3640c788c59a/artifacts/demo). They are superseded presentation assets; no financial evidence was rewritten. [Submission checkpoints](14-SUBMISSION.md) remain separate.
