$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'wsl-runtime.ps1')
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$windowsPathForWsl = $projectRoot.Replace('\', '/')
$wslRoot = ((& wsl.exe -d $bondtraceWslDistro --exec wslpath -a $windowsPathForWsl) -join '').Trim()
if ($LASTEXITCODE -ne 0) { throw 'WSL path resolution failed' }
& wsl.exe -d $bondtraceWslDistro --exec bash "$wslRoot/scripts/build-program.sh"
if ($LASTEXITCODE -ne 0) { throw 'SBF build failed' }
$image = Join-Path $projectRoot 'target/deploy/bondtrace.so'
if (-not (Test-Path -LiteralPath $image)) { throw 'SBF image was not produced' }
Write-Output "SBF image: $((Get-Item -LiteralPath $image).Length) bytes"
Write-Output "SHA256: $((Get-FileHash -LiteralPath $image -Algorithm SHA256).Hash)"
& node (Join-Path $projectRoot 'scripts/write-program-release.mjs')
if($LASTEXITCODE -ne 0){throw 'Release metadata update failed'}
Write-Output 'Updated programs/bondtrace/release.json from the built SBF image.'
