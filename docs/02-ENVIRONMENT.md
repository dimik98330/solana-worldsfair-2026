# Development environment and optional agent tooling

The application does **not** require Codex, ProofPilot, MCP or an AI account. Judges use [README](../README.md) and [setup](LOCALNET-SETUP.md). This page records workstation provenance, not universal prerequisites.

| Component | Source-bound configuration |
|---|---|
| Windows runtime | Node22.14.0, PowerShell7; locked npm dependencies |
| Linux tooling | Ubuntu24.04 x64, Rust1.91.0, Agave3.1.10, Anchor1.1.2 |
| Program | v4 SBF959,536bytes, SHA `ee2bb0f7eef91f04722b4b9f834d58d3bc4dc2fc3f76905dfc1d7521f8f1ee12` |
| Storage | Transactional SQLite or explicitly configured PostgreSQL; no silent fallback |
| Verification | [Actual CI scope](integrations/CI-VERIFICATION.md) |

WSL runs the compiler/validator on Windows. This workstation explicitly selects `BondTraceRuntime`; another machine selects its own installed distro. No cold install on a second PC or native macOS/ARM certification is claimed.

## Guidance provenance

Project skills: `C:\Users\dmitrii\Documents\solana\.agents\skills`. ProofPilot source stays outside the product: `C:\Users\dmitrii\Documents\proofpilot-source`. ProofPilot coach is mandatory for product decisions; select Solana/security/testing/browser skills by task. Native ECC2.2.3 is already installed in the Codex plugin cache; do not reinstall/change permissions without evidence.

The7October installation used commit-bound checks and a disclosed Windows fsync read/write-handle patch; flush was retained. [Integrity](setup/source-integrity.json), [patch](setup/proofpilot-windows-fsync.patch) and [original full catalogue/failed upstream tests](https://github.com/dimik98330/solana-worldsfair-2026/blob/9b64a52b7ea98a5bd8bb9f81dbfc611d08aa3a4b/docs/02-ENVIRONMENT.md) preserve provenance. Installed/configured tools and historical probes do not prove current handshakes or account sessions. Skills/local state are ignored and excluded from source reproduction.

## Boundaries

Only `dimik98330` may write GitHub; verify transport identity. Do not use the unrelated `zi-radio` connector. The repository was already public at10October source publication; that pass made no visibility change.

Use documented browser surfaces. Chrome's extension debugger was unattached and native computer APIs unavailable at the last attempt. No private-profile/raw-CDP/password/permission bypass. [Ordinary Phantom success remains unverified](release/WALLET-AND-LIVE-VERIFICATION.md). Never publish keys, credentials, databases or runtime state; preserve ledgers and unrelated projects.
