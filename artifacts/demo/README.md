# Historical BondTrace demo assets

This earlier localnet release is separate from current v4. See [current demo](../../docs/13-DEMO.md). This folder contains a reproducible local pipeline for a 16:9 captured-product walkthrough. **The video is edited captured UI, not continuous screen recording or evidence of a human wallet signature.** All assets are test/localnet. The actual frame manifest and final `render-validation.json` determine what was rendered.

## Inputs and source

- [Archived SCENE-PLAN.md](https://github.com/dimik98330/solana-worldsfair-2026/blob/9b64a52b7ea98a5bd8bb9f81dbfc611d08aa3a4b/artifacts/demo/SCENE-PLAN.md): story, constraints, frame direction and ownership.
- `scenes.json`: final verified frame/clip manifest, English narration cues, timing, crop bounds and the separately identified browser issue.
- `scenes.draft.json`: preserved initial story/narration work, not the final render manifest.
- `narrate.ps1`: installed Microsoft Zira English voice via Windows SAPI; offline, without a paid or external provider.
- `render_demo.py`: Pillow composition and FFmpeg encoding. Captured screenshots are cropped/resized proportionally, never altered to fabricate app content.
- Verified screen inputs: lead-provided JPEG files under `docs/evidence/ui`, frozen byte-for-byte under `inputs/` with original paths and hashes in `frozen-inputs.json`.
- `capture_clips.py`: encodes actual CUA JPEG sequences and timestamps; source-frame hashes and timing are retained beside every clip.
- Saved integration reference: `docs/evidence/full-smoke-localnet.json`; this is the 7 October local run, separately labelled if later captures use another issue.
- [Archived 18-TECHNICAL-OVERVIEW.md](https://github.com/dimik98330/solana-worldsfair-2026/blob/9b64a52b7ea98a5bd8bb9f81dbfc611d08aa3a4b/docs/18-TECHNICAL-OVERVIEW.md): English technical scope and limitations.

## Rebuild

Run from `C:\Users\dmitrii\Documents\solana` after final capture names/crops have been verified:

```powershell
& 'C:\Users\dmitrii\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' artifacts/demo/capture_clips.py bootstrap capture-record transfer-bonds claim-coupon cast-vote open-redemption redeem-principal-investor3
pwsh -NoProfile -File artifacts/demo/narrate.ps1
& 'C:\Users\dmitrii\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' artifacts/demo/render_demo.py --art-only
& 'C:\Users\dmitrii\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' artifacts/demo/render_demo.py --ffprobe-wsl
```

The final command uses existing `C:\ffmpeg\bin\ffmpeg.exe` (inspected version 7.1) and `/usr/bin/ffprobe` in Ubuntu WSL (inspected 8.0.1-3ubuntu2), provisioned by the lead. The renderer does not download or install anything. The bundled Python/Pillow runtime is located through Codex's `load_workspace_dependencies`. There is no Remotion installation in this runtime; no new npm dependency was installed for the video.

`--manifest` and `--output` permit a single-scene test inside this folder. A scene may include an actual captured UI `clip`: it plays once at captured timing, quantized to 30fps, then dissolves into an actual result screenshot for narration. It is not looped or supplied with invented cursor actions. The immutable table shown after settlement is explicitly labelled, including its later `Paid` status. Missing/unverified screen paths, narration overflow, long captions, a duration over 180 seconds, invalid final dimensions/frame count or a decode failure abort rendering. Narration is measured from actual WAV samples; the remaining scene duration is a deliberate reading hold. Per-scene captions have at most eight words and appear at their matching utterance times.

## Final output contract

Completed final files:

- `bondtrace-product-demo.mp4`: H.264/AAC, 1920×1080, 30 fps; persistent localnet/test labels, generated signer boundary and marked deadline cuts.
- `bondtrace-product-demo.en.srt`: English timed subtitles, also burned into the MP4.
- `bondtrace-product-demo.en.vtt`: matching 44-cue WebVTT file for a native HTML video track.
- `poster.png`: actual product UI in the existing Swiss-cobalt visual system.
- `input-provenance.json`: capture paths/crops/SHA-256 values and exact manifest digest.
- `render-validation.json`: final digest, file size, FFprobe stream/format metadata and complete FFmpeg decode result.

Temporary `rendered/**`, `audio/**` and `qa/**` hold reproducible intermediate frames, scene clips, local speech, prior draft media and visual checks. A single-scene test is identified by `test-*.json` / `rendered/test-scene.mp4` and is **not the full submission video**. Files here are local materials; no hosting, upload, repository visibility change, account registration or final submission was performed by this asset task.

## Checks and continuation

The renderer was compiled with Python; fixed coupon/reserve calculations and eleven confirmed saved proof rows were checked against the local JSON. The distinct browser-cycle JSON has 16 confirmed activity records, 900 coupon, 18,000 principal, 18 bonds retired and zero vault. Local narration was generated and measured; every scene fits its allocated duration. Final WSL FFprobe measured **174.021333 seconds (2:54.021), H.264/AAC, 1920×1080, 30fps, 5,220 video frames**. Complete FFmpeg decode passed. Final action/result frames were visually reviewed; the complete three-row immutable snapshot was checked after its crop repair. WebVTT was checked to contain the same 44 cues/timestamps/text as the SRT. `render-validation.json` is authoritative for the final digest and bytes; `final-assets.json` freezes the delivered files for independent review.

Skills used: installed ProofPilot in coach mode for truthful submission claims; marketing-video, video-craft and design-taste with the listed references in [Archived SCENE-PLAN.md](https://github.com/dimik98330/solana-worldsfair-2026/blob/9b64a52b7ea98a5bd8bb9f81dbfc611d08aa3a4b/artifacts/demo/SCENE-PLAN.md). Existing user/project direction supplies product, jury audience, duration, brand and test scope, so no redundant interview or design approval loop is required. This is asset preparation, not an application-readiness verdict or an official score.

Ownership stays limited to this folder and [Archived 18-TECHNICAL-OVERVIEW.md](https://github.com/dimik98330/solana-worldsfair-2026/blob/9b64a52b7ea98a5bd8bb9f81dbfc611d08aa3a4b/docs/18-TECHNICAL-OVERVIEW.md). At continuation read AGENTS/STATE, relevant installed skills and the current capture/evidence cutoff before substantial work. Lead owns STATE, dependencies/config/Git and publication/submission decisions. Never publish keypairs, private account data or generated local signer files.
