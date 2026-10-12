# Demonstration

**[English public-devnet demo · 2:43](https://youtu.be/arOCHtruN_Q)** · **[Separate project pitch · 1:56](https://youtu.be/3t2nP0fGRtI)** · [Published media record](evidence/colosseum-submission-20261012.json)

The English demo continuously records the actual public application reading the completed v4 issue: terms, a coupon payment of 500, principal repayment of 10,000 and 10 burned bonds, historical rights versus a zero current balance, a vote of 10 for / 0 against, and a Solana transaction receipt. It contains 21 real clicks and 22 GET requests, with no attempted financial write. The initial live loading is retained. No new payment or ordinary human-wallet signature is demonstrated.

Both videos use explicitly disclosed synthetic English narration, without cloning the owner's voice. The pitch is a separate authored presentation. The uploaded source MP4s are 1920×1080, H.264/AAC: demo 162.48 seconds / 4,062 frames; pitch 116.04 seconds / 2,901 frames. All native frames and timestamps are retained; no video cuts, crop, screenshot montage or speed change were used. Independent decode, continuity, audio alignment and visual checks passed. YouTube may transcode these source files; their hashes describe the uploaded originals. Both watch pages were opened and playback observed outside Studio.

## Earlier owner-narrated localnet walkthrough

**[Russian owner-narrated demo · 2:30](https://youtu.be/Izo33Mry-hc)** · [Original MP4](../artifacts/demo/one-take/bondtrace-demo.mp4) · [Original recording provenance](../artifacts/demo/one-take/provenance.json) · [Publication record](evidence/kase-submission-20261012.json)

The owner-narrated video follows the actual interface in one continuous take: languages and time zone, issue creation fields, coupon500 with its exact receipt, recorded holder rights and portfolio, principal10000, voting and transaction history. The cursor moves smoothly and remains visible inside dialogs. No cuts, screenshots, stitched clips or speed changes are used; the complete original narration is included.

It reads a completed **localnet v4 test issue** with synthetic SPL assets. No new financial transaction or human-wallet signature occurs during this walkthrough. Program execution is established separately by the lifecycle receipts; public deployment has its own [versioned record](33-HOSTED-DEPLOYMENT.md).

The MP4 is1440×1000,H.264/AAC,150.08seconds,9,700,894bytes. All3752native frames keep their original timestamps. Full decode, Chromium playback, complete audio and independent visual/continuity review passed. The unchanged source was uploaded unlisted to the same BONDTRACE channel on12October. The public watch player reached its end at150.101seconds without a media error. This does not assert anonymous access or equality between YouTube's transcode and the source hash.

## Reproduce the complete lifecycle

Follow [README](../README.md) and [setup](LOCALNET-SETUP.md):

```powershell
npm run demo:paged:lifecycle
```

The prepared localnet scenario covers issue/distribution → record rights/vote → transfer/new receiver → coupons → principal/burn → old coupon after retirement. Generated local test signers are used. [Historical prepared-launcher proof](evidence/servicing-v4-one-command-check-20261010.json) retains37independently observed finalized signatures at its exact cutoff. Unknown outcomes require the original recovery ID.

Earlier edited174s and silent98s video packages remain in the [immutable historical media snapshot](https://github.com/dimik98330/solana-worldsfair-2026/tree/56841f415bcf851b8096e57f1e8f3640c788c59a/artifacts/demo). They are superseded presentation assets; no financial evidence was rewritten. [Submission checkpoints](14-SUBMISSION.md) remain separate.
