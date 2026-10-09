#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
export NO_DNA=1 BONDTRACE_CI=true
export PATH="${HOME}/.cargo/bin:${HOME}/.local/bondtrace-tools/solana-release/bin:${HOME}/.local/bondtrace-tools:${PATH}"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-${HOME}/.cache/bondtrace-target}"

# Tool installation belongs to the caller's isolated CI setup, never this check.
[[ "$(node --version)" == 'v22.14.0' ]] || { echo 'CI requires Node22.14.0' >&2; exit 1; }
[[ "$(rustc --version)" == 'rustc 1.91.0 '* ]] || { echo 'CI requires Rust1.91.0' >&2; exit 1; }
[[ "$(solana --version)" == 'solana-cli 3.1.10 '* ]] || { echo 'CI requires Agave3.1.10' >&2; exit 1; }
[[ "$(anchor --version)" == 'anchor-cli 1.1.2' ]] || { echo 'CI requires Anchor1.1.2' >&2; exit 1; }
node --version; rustc --version; solana --version; anchor --version

[[ ! -f .env ]] || { echo 'CI checkout must not contain owner environment data' >&2; exit 1; }
mkdir -p -- .local
ci_run=$(mktemp -d "$PWD/.local/ci-verification-XXXXXXXX")
export BONDTRACE_NETWORK=localnet BONDTRACE_ENABLE_DEMO=true
export SOLANA_RPC_URL=http://127.0.0.1:8979 BONDTRACE_DATA_DIR="$ci_run"
export NPM_CONFIG_USERCONFIG="${ci_run}/empty.npmrc"
: > "$NPM_CONFIG_USERCONFIG"
npm ci --ignore-scripts
npm run build
bash scripts/build-program.sh
# Never invoke the PowerShell build wrapper here: it rewrites release metadata.
node scripts/write-program-release.mjs --check
npm test
npm run test:ui
cargo test -p bondtrace --lib
cargo test -p bondtrace --test runtime -- --nocapture --test-threads=1
echo 'PASS native Linux application/client/UI/SBF/runtime checks; no live cluster deployment claimed'
