$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$windowsPathForWsl = $projectRoot.Replace('\', '/')
$wslRoot = ((& wsl.exe -d Ubuntu --exec wslpath -a $windowsPathForWsl) -join '').Trim()
if ($LASTEXITCODE -ne 0) { throw 'WSL path resolution failed' }
& wsl.exe -d Ubuntu --exec bash "$wslRoot/scripts/build-program.sh"
if ($LASTEXITCODE -ne 0) { throw 'SBF build failed' }
$image = Join-Path $projectRoot 'target/deploy/bondtrace.so'
if (-not (Test-Path -LiteralPath $image)) { throw 'SBF image was not produced' }
Write-Output "SBF image: $((Get-Item -LiteralPath $image).Length) bytes"
Write-Output "SHA256: $((Get-FileHash -LiteralPath $image -Algorithm SHA256).Hash)"
