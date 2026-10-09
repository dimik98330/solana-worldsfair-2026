#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
export PATH="${HOME}/.local/bondtrace-tools/solana-release/bin:${PATH}"
export NO_DNA=1
ledger=$1
rpc_port=$2
faucet_port=$3
gossip_port=$4
mkdir -p -- "$ledger"
[[ ! -L "$ledger" ]] || { echo 'Ledger symlink refused' >&2; exit 1; }
if [[ -f "$ledger/bondtrace-process.txt" ]]; then
  read -r old_pid old_ticks < "$ledger/bondtrace-process.txt"
  if [[ "$old_pid" =~ ^[0-9]+$ && -e "/proc/${old_pid}/stat" && $(awk '{print $22}' "/proc/${old_pid}/stat") == "$old_ticks" ]]; then
    echo 'An owned validator is still alive; preserve its identity and use controlled recovery' >&2; exit 1
  fi
fi
# Identity survives wrapper restarts and prevents signalling a reused Linux PID.
printf '%s %s\n' "$$" "$(awk '{print $22}' /proc/$$/stat)" > "$ledger/bondtrace-process.txt"
export RUST_LOG="${BONDTRACE_LOG_LEVEL:-warn}"
# Separate live ledgers need separate UDP pools. Preserve the old validators;
# deterministically select a bounded pool for this RPC port, away from its RPC/WS ports.
dynamic_start=$((20000 + (rpc_port % 400) * 100))
dynamic_end=$((dynamic_start + 80))
exec solana-test-validator --ledger "$ledger" --limit-ledger-size 1000000 --rpc-port "$rpc_port" --faucet-port "$faucet_port" --gossip-port "$gossip_port" --dynamic-port-range "${dynamic_start}-${dynamic_end}" --bind-address 127.0.0.1 --bpf-program B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8 target/deploy/bondtrace.so --quiet
