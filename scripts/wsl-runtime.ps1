$runtimeSelection=Join-Path (Join-Path $PSScriptRoot '..') '.local/toolchain/wsl-runtime.json'
$bondtraceWslDistro=if($env:BONDTRACE_WSL_DISTRO){$env:BONDTRACE_WSL_DISTRO}elseif(Test-Path -LiteralPath $runtimeSelection){(Get-Content -LiteralPath $runtimeSelection -Raw | ConvertFrom-Json).distro}else{'Ubuntu'}
if($bondtraceWslDistro -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$'){throw 'Invalid project WSL distribution name'}
