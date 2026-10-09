#!/usr/bin/env bash
set -euo pipefail
[[ "${WSL_DISTRO_NAME:-}" == 'BondTraceRuntime' || "${BONDTRACE_CI:-}" == 'true' || "${BONDTRACE_JUDGE_SETUP:-}" == 'true' ]] || { echo 'Use the dedicated BondTrace runtime, isolated CI, or explicitly opt in with BONDTRACE_JUDGE_SETUP=true' >&2; exit 1; }
[[ "$(uname -m)" == 'x86_64' ]] || { echo 'The verified toolchain supports x86_64 Linux only' >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive NO_DNA=1
export RUSTUP_TOOLCHAIN=1.91.0
tool_root="${HOME}/.local/bondtrace-tools"
export PATH="${HOME}/.cargo/bin:${tool_root}/solana-release/bin:${tool_root}:$PATH"
if [[ "$("${HOME}/.cargo/bin/rustup" run 1.91.0 rustc --version 2>/dev/null || true)" == 'rustc 1.91.0 '* && "$(solana --version 2>/dev/null || true)" == 'solana-cli 3.1.10 '* && "$(anchor --version 2>/dev/null || true)" == 'anchor-cli 1.1.2' ]] && command -v cargo-build-sbf >/dev/null && command -v solana-test-validator >/dev/null; then
  echo 'Pinned toolchain already available; no packages or defaults changed'
  rustc --version; solana --version; anchor --version
  exit 0
fi
# Elevate the OS package step only; tool downloads remain in the invoking HOME.
apt_command=(apt-get)
if [[ "${EUID}" != 0 ]]; then
  command -v sudo >/dev/null || { echo 'Install the documented build packages as root; sudo is unavailable' >&2; exit 1; }
  apt_command=(sudo -E apt-get)
fi
"${apt_command[@]}" update -qq
"${apt_command[@]}" install -y --no-install-recommends ca-certificates curl build-essential pkg-config libssl-dev libudev-dev clang libclang-dev protobuf-compiler cmake git bzip2 xz-utils python3 >/dev/null
cache="${tool_root}/downloads"
mkdir -p -- "$cache"
download(){ curl --fail --location --proto '=https' --tlsv1.2 --retry 2 --connect-timeout 20 --max-time 600 "$1" -o "$2"; }
if [[ ! -x "${HOME}/.cargo/bin/rustc" ]]; then
  download 'https://static.rust-lang.org/rustup/archive/1.28.2/x86_64-unknown-linux-gnu/rustup-init' "$cache/rustup-init"
  download 'https://static.rust-lang.org/rustup/archive/1.28.2/x86_64-unknown-linux-gnu/rustup-init.sha256' "$cache/rustup-init.sha256"
  expected=$(awk '{print $1}' "$cache/rustup-init.sha256")
  [[ "$expected" =~ ^[a-f0-9]{64}$ ]] || exit 1
  printf '%s  %s\n' "$expected" "$cache/rustup-init" | sha256sum -c -
  chmod 700 "$cache/rustup-init"
  "$cache/rustup-init" -y --profile minimal --default-toolchain 1.91.0 --no-modify-path
fi
if ! "${HOME}/.cargo/bin/rustup" run 1.91.0 rustc --version >/dev/null 2>&1; then
  "${HOME}/.cargo/bin/rustup" toolchain install 1.91.0 --profile minimal
fi
if [[ ! -x "$tool_root/solana-release/bin/solana" ]]; then
  download 'https://github.com/anza-xyz/agave/releases/download/v3.1.10/solana-release-x86_64-unknown-linux-gnu.tar.bz2' "$cache/agave.tar.bz2"
  printf '%s  %s\n' 'a7205ff29bcf0f7199740225ecae2b85a28ea9668892d5ec21bd9749882984a1' "$cache/agave.tar.bz2" | sha256sum -c -
  tar -xjf "$cache/agave.tar.bz2" -C "$tool_root"
fi
if [[ ! -x "$tool_root/anchor" ]]; then
  download 'https://github.com/otter-sec/anchor/releases/download/v1.1.2/anchor-1.1.2-x86_64-unknown-linux-gnu' "$cache/anchor"
  printf '%s  %s\n' 'fdea9979629e9416e5f5e5622ff6c11b8c691d1e559581ece368e903c0c980c1' "$cache/anchor" | sha256sum -c -
  install -m755 "$cache/anchor" "$tool_root/anchor"
fi
export PATH="${HOME}/.cargo/bin:${tool_root}/solana-release/bin:${tool_root}:$PATH"
[[ "$(rustc --version)" == 'rustc 1.91.0 '* && "$(solana --version)" == 'solana-cli 3.1.10 '* && "$(anchor --version)" == 'anchor-cli 1.1.2' ]] || { echo 'Existing tool versions conflict with the pinned judge toolchain; no global defaults were replaced' >&2; exit 1; }
command -v cargo-build-sbf >/dev/null
command -v solana-test-validator >/dev/null
rustc --version
solana --version
anchor --version
