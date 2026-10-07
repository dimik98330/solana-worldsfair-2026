#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
export PATH="${HOME}/.cargo/bin:${HOME}/.local/bondtrace-tools/solana-release/bin:${HOME}/.local/bondtrace-tools:${PATH}"
export NO_DNA=1
cargo build-sbf --manifest-path programs/bondtrace/Cargo.toml --sbf-out-dir target/deploy
