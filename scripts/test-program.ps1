$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'wsl-runtime.ps1')
$projectRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$windowsPathForWsl=$projectRoot.Replace('\','/')
$wslRoot=((& wsl.exe -d $bondtraceWslDistro --exec wslpath -a $windowsPathForWsl) -join '').Trim()
if($LASTEXITCODE -ne 0){throw 'WSL path resolution failed'}
& wsl.exe -d $bondtraceWslDistro --exec bash "$wslRoot/scripts/test-program.sh"
if($LASTEXITCODE -ne 0){throw 'Program checks failed'}
