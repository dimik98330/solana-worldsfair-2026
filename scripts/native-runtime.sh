#!/usr/bin/env bash
set -euo pipefail
action=$1
scope=$2
release=$3
[[ "$scope" =~ ^[a-f0-9]{16}$ && "$release" =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid native runtime scope' >&2; exit 1; }
native_base="${HOME}/.local/state/bondtrace/${scope}/${release}"
ledger="${native_base}/ledger"
safe_part="$HOME"
for part in .local state bondtrace "$scope" "$release" ledger; do safe_part="$safe_part/$part"; [[ ! -L "$safe_part" ]] || { echo 'Native runtime ancestor symlink refused' >&2; exit 1; }; done
case "$action" in
  resolve)
    mkdir -p -- "$native_base"
    [[ ! -L "$native_base" && ! -L "$ledger" ]] || { echo 'Native runtime symlink refused' >&2; exit 1; }
    fs_kind=$(stat -f -c %T "$native_base")
    [[ "$fs_kind" != '9p' && "$fs_kind" != 'ntfs' && "$fs_kind" != 'fuseblk' ]] || { echo 'Use a native Linux filesystem' >&2; exit 1; }
    printf '%s\n%s\n' "$ledger" "$fs_kind"
    df -B1 --output=avail "$native_base" | tail -n 1 | tr -d ' '
    ;;
  stop)
    rpc_port=$4
    pid_file="${ledger}/bondtrace-process.txt"
    [[ -f "$pid_file" && ! -L "$pid_file" ]] || { echo 'No owned validator identity' >&2; exit 1; }
    read -r task_pid start_ticks < "$pid_file"
    [[ "$task_pid" =~ ^[0-9]+$ && "$start_ticks" =~ ^[0-9]+$ ]] || exit 1
    [[ -e "/proc/${task_pid}/cmdline" ]] || { echo 'Owned validator is already stopped'; exit 0; }
    [[ $(awk '{print $22}' "/proc/${task_pid}/stat") == "$start_ticks" ]] || { echo 'PID reused; preserve process' >&2; exit 1; }
    mapfile -d '' args < "/proc/${task_pid}/cmdline"
    [[ "${args[0]}" == *solana-test-validator ]] || exit 1
    found_ledger=false; found_port=false
    for ((i=1;i<${#args[@]}-1;i++)); do
      [[ "${args[i]}" != '--ledger' || "${args[i+1]}" != "$ledger" ]] || found_ledger=true
      [[ "${args[i]}" != '--rpc-port' || "${args[i+1]}" != "$rpc_port" ]] || found_port=true
    done
    [[ "$found_ledger" == true && "$found_port" == true ]] || { echo 'Validator ownership mismatch' >&2; exit 1; }
    kill -INT "$task_pid"
    for ((i=0;i<30;i++)); do kill -0 "$task_pid" 2>/dev/null || { echo 'Owned validator stopped without reset'; exit 0; }; sleep 1; done
    echo 'Graceful shutdown timed out; preserve ledger' >&2; exit 1
    ;;
  check-ledger)
    [[ -f "$ledger/genesis.bin" && ! -L "$ledger/genesis.bin" ]] || { echo 'Recorded ledger genesis is absent; refusing a replacement chain' >&2; exit 1; }
    printf 'existing-ledger\n'
    ;;
  log-size)
    if [[ -d "$ledger" ]]; then find "$ledger" -maxdepth 1 -type f -name 'validator-*.log' -printf '%s\n' | awk '{sum+=$1} END {printf "%.0f\n",sum}'; else echo 0; fi
    ;;
  *) echo 'Unsupported native runtime action' >&2; exit 1;;
esac
