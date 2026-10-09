#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
export PATH="${HOME}/.cargo/bin:${HOME}/.local/bondtrace-tools/solana-release/bin:${HOME}/.local/bondtrace-tools:${PATH}"
export NO_DNA=1
command -v solana-test-validator >/dev/null || { echo 'Install the pinned Agave tools or put solana-test-validator on PATH.' >&2; exit 1; }
image=target/deploy/bondtrace.so
if [[ ! -f "$image" ]]; then image=artifacts/program/bondtrace.so; fi
[[ -f "$image" ]] || { echo 'Build the SBF program first or use the verified release image.' >&2; exit 1; }
if [[ "$image" == artifacts/program/bondtrace.so ]]; then
  [[ "$(sha256sum -- "$image" | cut -d' ' -f1)" == 15525ec2de285e7cc3065f7ec8ce47bfe81d1ed2837754b85b8cf2598c935dc2 ]] || { echo 'Release program image hash does not match.' >&2; exit 1; }
fi
exec solana-test-validator --ledger .local/bondtrace-validator --rpc-port 8899 --faucet-port 9900 --bind-address 127.0.0.1 --bpf-program B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8 "$image" --quiet
