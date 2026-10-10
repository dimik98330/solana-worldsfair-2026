param([string]$Distro,[switch]$CheckOnly)
$ErrorActionPreference='Stop'
$projectRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
foreach($required in @('node','npm','wsl.exe')){if(-not(Get-Command $required -ErrorAction SilentlyContinue)){throw "Missing $required. See README first-time prerequisites."}}
if($PSVersionTable.PSVersion.Major -lt 7){throw 'PowerShell7 is required.'}
$nodeVersion=(& node --version).Trim()
if($nodeVersion -ne 'v22.14.0'){throw 'Use verified Node22.14.0 for the complete judge reproduction.'}
$selectionPath=Join-Path $projectRoot '.local/toolchain/wsl-runtime.json'
if($Distro -and $env:BONDTRACE_WSL_DISTRO -and $Distro -cne $env:BONDTRACE_WSL_DISTRO){throw 'Explicit -Distro conflicts with inherited BONDTRACE_WSL_DISTRO. Use a separate clean session/clone; the caller environment was not changed.'}
if(-not $Distro){
  if($env:BONDTRACE_WSL_DISTRO){$Distro=$env:BONDTRACE_WSL_DISTRO}
  elseif(Test-Path -LiteralPath $selectionPath){$Distro=(Get-Content -LiteralPath $selectionPath -Raw | ConvertFrom-Json).distro}
  else {$Distro='Ubuntu-24.04'}
}
if($Distro -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$'){throw 'Invalid WSL distribution name.'}
if(Test-Path -LiteralPath $selectionPath){
  $previous=(Get-Content -LiteralPath $selectionPath -Raw | ConvertFrom-Json).distro
  if($previous -cne $Distro){throw 'This workspace already selects another WSL distribution. Preserve its ledgers; use a separate clone for the new distribution.'}
}
$installed=@((& wsl.exe --list --quiet) | ForEach-Object {$_.Replace([string][char]0,'').Trim()} | Where-Object {$_})
if($LASTEXITCODE -ne 0 -or $installed -notcontains $Distro){throw "WSL distribution $Distro is unavailable. Install Ubuntu24.04 using the README or pass an existing -Distro explicitly. Existing distributions were not modified."}
$scriptPath=((& wsl.exe -d $Distro --exec wslpath -a (Join-Path $projectRoot 'scripts/setup-isolated-toolchain.sh')) -join '').Trim()
if($LASTEXITCODE -ne 0 -or -not $scriptPath){throw 'Cannot resolve the repository inside the selected WSL distribution.'}
if($CheckOnly){
  $check='export PATH="$HOME/.cargo/bin:$HOME/.local/bondtrace-tools/solana-release/bin:$HOME/.local/bondtrace-tools:$PATH"; set -e; [[ "$(rustup run 1.91.0 rustc --version)" == "rustc 1.91.0 "* ]]; [[ "$(solana --version)" == "solana-cli 3.1.10 "* ]]; [[ "$(anchor --version)" == "anchor-cli 1.1.2" ]]; [[ "$(uname -m)" == "x86_64" ]]; rustup run 1.91.0 rustc --version; solana --version; anchor --version; command -v cargo-build-sbf; command -v solana-test-validator'
  & wsl.exe -d $Distro --exec bash -c $check
  if($LASTEXITCODE -ne 0){throw 'Pinned toolchain check failed. Run setup:judge without -CheckOnly.'}
  Write-Output "Read-only prerequisites checked: Node$nodeVersion, WSL$Distro."
  exit 0
}
# Explicit setup affects this selected distribution only. The Bash script keeps
# Rust/tool installations in the same default user's HOME used by runtime calls.
& wsl.exe -d $Distro --exec env BONDTRACE_JUDGE_SETUP=true bash $scriptPath
if($LASTEXITCODE -ne 0){throw 'Pinned toolchain installation/check failed; project selection was not changed.'}
if(-not(Test-Path -LiteralPath $selectionPath)){
  New-Item -ItemType Directory -Force -Path (Split-Path $selectionPath) | Out-Null
  [IO.File]::WriteAllText($selectionPath,(@{distro=$Distro} | ConvertTo-Json)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
}
Write-Output "Ready: Node$nodeVersion, WSL$Distro, Rust1.91.0, Agave3.1.10, Anchor1.1.2. Run npm run demo:paged:lifecycle."
