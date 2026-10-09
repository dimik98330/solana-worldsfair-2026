# Brand — BondTrace

Current implemented frontend-only ECC replacement, 8 October 2026: **Settlement Workspace**. Dark ink navy workspace and navigation, inset fields, aligned exact figures and blue commands with white labels. This supersedes the rejected white canvas and previous pale-action navy passes. [DESIGN.md](DESIGN.md) is the normative implemented token system; [PRODUCT.md](PRODUCT.md) records product truth; [docs/design-direction.md](docs/design-direction.md) preserves chosen direction and reference provenance.

BondTrace remains a working issuer and holder application. Use concise operational labels and contextual details. The9October interaction correction makes navigation native and underlined, actions visibly contained, and voting state/actions explicit; see docs/frontend/INTERACTION-RESULTS.md. The separate presentation explains the product: no judge tour, onboarding hero, marketing sections or scenario narration in work screens. One issue/account toolbar leads into the selected task; Payments places exact selected dates, reconciliation and holders before reserve mechanics.

The original identity is `apps/web/public/brand/bondtrace-lettering.svg`: path-drawn outlined lowercase lettering with rounded terminals and no font dependency. Its compact companion/favicon is derived from this lettering. Keep the open silhouette and original geometry. Do not replace it with a font wordmark, unrelated symbol or decorative badge.

Self-hosted Manrope Variable carries readable UI hierarchy: 17px body, 16px primary labels, 18px desktop holder names. Manrope 650 with tabular lining numerals carries financial figures and numeric fields. Self-hosted IBM Plex Mono 400/500 carries dedicated clock lines, addresses and code. Financial display removes only insignificant trailing zeros; raw precision and exact arithmetic remain unchanged. Dates and exact-second times occupy separate stable lines, with one timezone note per group.

Use the CSS navy/neutral roles and distinct command-blue versus light-blue-link roles defined in DESIGN.md. Input focus is one stroke on the existing control edge; ordinary keyboard controls retain visible focus. Lucide remains the control family: navigation uses21px/2px strokes and shared actions use18–22px/2px strokes; dedicated compact static/calendar treatments remain. Numbered stages and textual statuses replace repetitive decorative checkmarks. Do not blink static status or demo chrome.

Use the full desktop workspace, including native 2560px, with bounded internal financial tracks. Mobile navigation folds, account controls remain readable, and the first payment record belongs in the first viewport. English remains the default with a Russian switch. Inspection, signing account and operation permissions stay separate.

Keep one compact truthful network/signing context. A connection failure preserves the selected workspace and recovery. Unknown chain values are distinct from zero. Settlement units imply neither real fiat nor production assets, KASE integration or certification.

`npm run preview:ui` on 4180 is a separate read-only saved localnet snapshot. The header says Saved snapshot/Архивный снимок, or Saved/Архив on compact screens; capture time is available in details. Signing and mutations are disabled. Archive screenshots establish presentation of saved evidence, not current chain verification.

Reference studies informed alignment, navigation and restraint only; no third-party branding, imagery or sample data is shipped. Evidence and actual input-check limits live in [docs/design-qa.md](docs/design-qa.md). This document records implementation, not production readiness, eligibility, submission or final owner acceptance.
