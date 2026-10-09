# Actual hosted deployment —9October2026

Stage: owner explicitly authorized free Neon + Render deployment, with owner-operated account login. This supersedes the earlier preparation-only hosting gate. Public repository visibility, paid plans, mainnet/real assets and final contest submission remain unauthorized.

## Latest actual stage

Render Free nativeNode service `srv-db4g7oqd0e5s73espfqg`, Blueprint `exs-db4g3enlk1mc73fu3kf0`, actual URL https://bondtrace-devnet.onrender.com created. Deployed11b01f8. Actual HTTPS liveness, entryJS/CSS hashes, Neon16.15 verifiedTLS, devnetgenesis, correctorigin and disabledgeneratedsigning passed; financialReady:false because the frozen Solana program is not deployed yet. Initial origin-editor failure retained separately; a verified field input plus redeploy repaired it.

Owner rejected the user-facing HTTP login wall. The application/ordinary API becomes public, financial Ed25519/role checks unchanged; BasicAuth remains only on operator metadata/readiness.14targeted tests/typecheck passed and fresh source critic found no P0/P1. Publicpreview/status metadata and free-resource availability remain bounded prototype limits. Actual public-auth redeploy/HTTP readback is the next check.

Owner-operated GitHub/CAPTCHA faucet funded the isolated6fK…payer5testSOL; liveRPC confirmed. Two bounded CLI uploads left a valid persistent bufferE7… with partial exact code. Same-buffer paced repair is in progress; no new rent deposit or source/program-ID substitution. Program upload is not complete until the full canonical deployed payload equals frozenSHA761… and the hosted API reports known-match. Original upload failures/signatures/buffer/key material remain preserved in ignored evidence; no ephemeral recovery mnemonic printed.

Lead applied installed ProofPilot coach, solana-dev, ECC deployment-patterns and documented CUA browser controls; a disjoint read-only devnet release check used ProofPilot/Solana security. Existing source commit9c9a6bb and private repository were clean at entry. No original localnet ledger, signer or public evidence was replaced.

## Neon

- Owner logged in. Created **bondtrace-kase**, project `odd-shape-25117485`, production branch `br-jolly-morning-b2nzu4y0`.
- Actual UI confirms **Free**, AWS Frankfurt, PostgreSQL16, one database named `bondtrace`; other Neon services disabled.
- Browser showed no storage/network/compute use at creation. This is resource creation, not proof of application writes/recovery.
- Credentials remain private; no connection URL/password belongs in this file or Git.

## Render

- Owner logged in. GitHub integration installation is pending owner action, limited to `dimik98330/solana-worldsfair-2026`; the application requests new repository permissions.
- The Blueprint pins **free**, one writer, no automatic deploy, nativeNode22.14.0 and **Frankfurt** to match Neon and avoid cross-region database round trips. Official region field: https://render.com/docs/blueprint-spec (checked9October2026).
- Actual Render service/origin, server secrets, build/start and public verification are not complete yet.

## Solana devnet

- Read-only check: published541456-byte program/SHA761b… matches; expected B3a… account absent, isolated devnet funding signer6fK… has0testSOL.
- Correct program key file is the preserved `.local/bondtrace-program-keypair.json` (public-key-only CLI match). The generated `target/deploy` key has a different public address and must not be used for this release.
- Planned deployment requires about3testSOL including retained rent, bounded fees and test budget. Use an explicit persistent buffer key and exact max length, preserve uncertain results; never allow the CLI to print an ephemeral recovery mnemonic.
- No new faucet/deploy transaction has been sent in this hosting stage yet. Next: connect Render source/secrets, obtain free test SOL, deploy/verify exact program and exercise the actual HTTPS origin, then restart and reconcile the same IDs/signatures.

## Boundaries

Account consent and new GitHub App access are owner actions. No paid resources, broad repository grant, public repo visibility, production/real funds or final contest submission are implied. Current hosted status must be updated only from actual provider/RPC/HTTP observations; earlier localnet and LinuxPG evidence remains at its original cutoff.
