#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
export PATH="${HOME}/.cargo/bin:${HOME}/.local/bondtrace-tools/solana-release/bin:${HOME}/.local/bondtrace-tools:${PATH}"
export NO_DNA=1
cargo test -p bondtrace --lib
cargo test -p bondtrace --test runtime -- --nocapture --test-threads=1
