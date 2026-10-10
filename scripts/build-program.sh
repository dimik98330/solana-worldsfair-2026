#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
export PATH="${HOME}/.cargo/bin:${HOME}/.local/bondtrace-tools/solana-release/bin:${HOME}/.local/bondtrace-tools:${PATH}"
export NO_DNA=1
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-${HOME}/.cache/bondtrace-target}"
mkdir -p .local/build-logs
build_log=".local/build-logs/sbf-$(date -u +%Y%m%dT%H%M%S)-$$.log"
cargo build-sbf --manifest-path programs/bondtrace/Cargo.toml --sbf-out-dir target/deploy 2>&1 | tee "$build_log"
# Some SBF toolchains emit an invalid stack frame diagnostic but return zero.
# Do not publish a release descriptor for a binary the VM cannot safely execute.
if grep -Eq 'Stack offset .* exceeded max offset|Error: Function .*Stack offset' "$build_log"; then
  echo "SBF stack validation failed; release metadata was not updated. See $build_log" >&2
  exit 1
fi
