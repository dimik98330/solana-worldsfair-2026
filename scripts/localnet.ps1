$ErrorActionPreference='Stop'
$projectRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$programId='B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8'
try {
    $probe=Invoke-RestMethod 'http://127.0.0.1:8899' -Method Post -ContentType 'application/json' -Body ('{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["'+$programId+'",{"encoding":"base64"}]}') -TimeoutSec 3
    if($probe.result.value.executable){Write-Output 'BondTrace local validator is already running.';exit 0}
    throw 'Port8899 is occupied by a validator without this program; preserve it and configure a separate port.'
} catch {
    if($_.Exception.Message -match 'Port8899'){throw}
}
$windowsPathForWsl=$projectRoot.Replace('\','/')
$wslRoot=((& wsl.exe -d Ubuntu --exec wslpath -a $windowsPathForWsl) -join '').Trim()
if($LASTEXITCODE -ne 0){throw 'WSL path resolution failed'}
$toolchain='/home/dmitrii/.local/bondtrace-tools/solana-release/bin/solana-test-validator'
$binary="$wslRoot/target/deploy/bondtrace.so"
if(-not (Test-Path (Join-Path $projectRoot 'target/deploy/bondtrace.so'))){throw 'Build the SBF program first; see README.'}
& wsl.exe -d Ubuntu --cd $projectRoot --exec $toolchain --ledger '.local/bondtrace-validator' --rpc-port 8899 --faucet-port 9900 --bind-address 127.0.0.1 --bpf-program $programId $binary --quiet
if($LASTEXITCODE -ne 0){throw 'Local validator stopped with an error'}
