param([ValidateRange(1024,65000)][int]$RpcPort=8929,[ValidateRange(1024,65000)][int]$ApiPort=3130,[switch]$RestartApi,[switch]$NativeLedger,[switch]$RestartValidator)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'wsl-runtime.ps1')
$projectRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$release=Get-Content -LiteralPath (Join-Path $projectRoot 'programs/bondtrace/release.json') -Raw | ConvertFrom-Json
$image=Join-Path $projectRoot 'target/deploy/bondtrace.so'
if(-not (Test-Path -LiteralPath $image)){throw 'Build the SBF with npm run build:program first.'}
$imageHash=(Get-FileHash -LiteralPath $image -Algorithm SHA256).Hash.ToLowerInvariant()
if($imageHash -cne $release.sha256 -or (Get-Item -LiteralPath $image).Length -ne $release.programLen){throw 'The SBF and release manifest disagree. Rebuild before starting.'}
$runtimeRoot=Join-Path $projectRoot ('.local/backend-execution/'+$imageHash.Substring(0,12))
$runtimeFile=Join-Path $runtimeRoot 'runtime.json'
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
$runtimeLock=[IO.File]::Open((Join-Path $runtimeRoot 'launcher.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try {
$prior=if(Test-Path -LiteralPath $runtimeFile){Get-Content -LiteralPath $runtimeFile -Raw | ConvertFrom-Json}else{$null}
$rpcUrl='http://127.0.0.1:'+$RpcPort
$apiOrigin='http://127.0.0.1:'+$ApiPort
function RpcGenesis { $reply=Invoke-RestMethod -Uri $rpcUrl -Method Post -ContentType 'application/json' -Body '{"jsonrpc":"2.0","id":1,"method":"getGenesisHash"}' -TimeoutSec 2; if($reply.error -or -not $reply.result){throw 'RPC genesis unavailable'}; return $reply.result }
function PortBusy([int]$Number){return [bool](Get-NetTCPConnection -LocalPort $Number -State Listen -ErrorAction SilentlyContinue)}
if((PortBusy $ApiPort) -and (-not $prior -or $prior.apiOrigin -ne $apiOrigin)){throw 'API port belongs to another or unrecorded process. Refusing to start a validator for it.'}
function WslPath([string]$Path){$converted=((& wsl.exe -d $bondtraceWslDistro --exec wslpath -a $Path.Replace('\','/')) -join '').Trim();if($LASTEXITCODE -ne 0){throw 'WSL path resolution failed'};return $converted}
$stamp=Get-Date -Format 'yyyyMMddTHHmmssfff'
$useNative=$NativeLedger -or ($prior -and $prior.ledgerStorage -eq 'wsl-native')
$nativeScope=$null;$nativeFs=$null;$nativeFree=$null
if($useNative){
  if($prior -and $prior.wslDistro -cne $bondtraceWslDistro){throw 'Saved native runtime belongs to another WSL distribution; preserve both ledgers'}
  $scopeHasher=[Security.Cryptography.SHA256]::Create()
  try{$nativeScope=([Convert]::ToHexString($scopeHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant())))).ToLowerInvariant().Substring(0,16)}finally{$scopeHasher.Dispose()}
  $nativeControl=WslPath (Join-Path $projectRoot 'scripts/native-runtime.sh')
  $nativeInfo=@(& wsl.exe -d $bondtraceWslDistro --exec bash $nativeControl resolve $nativeScope $imageHash)
  if($LASTEXITCODE -ne 0 -or $nativeInfo.Count -ne 3 -or $nativeInfo[2] -notmatch '^\d+$'){throw 'Native ledger resolution failed'}
  $ledger=[string]$nativeInfo[0];$nativeFs=[string]$nativeInfo[1];$nativeFree=[long]$nativeInfo[2]
  $distro=@(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' -ErrorAction Stop | Get-ItemProperty | Where-Object DistributionName -eq $bondtraceWslDistro)
  if($distro.Count -ne 1){throw 'Cannot verify the selected WSL VHD backing volume'}
  $basePath=([string]$distro[0].BasePath).Replace('\\?\','')
  $backingDrive=[IO.Path]::GetPathRoot($basePath).Substring(0,1)
  $hostFree=(Get-PSDrive -Name $backingDrive -ErrorAction Stop).Free
  if($hostFree -lt 2GB -or $nativeFree -lt 2GB){throw 'Runtime disk budget requires2GiB free on both the VHD backing volume and native filesystem. Preserve existing data.'}
  if($prior -and $prior.ledgerStorage -ne 'wsl-native'){throw 'An existing mounted ledger cannot be silently migrated. Preserve it and use a new release namespace.'}
  if($prior -and ($prior.ledger -cne $ledger -or $prior.nativeScope -cne $nativeScope)){throw 'Native runtime identity differs from its saved namespace'}
  if($prior){& wsl.exe -d $bondtraceWslDistro --exec bash $nativeControl check-ledger $nativeScope $imageHash | Out-Null;if($LASTEXITCODE -ne 0){throw 'Saved ledger is missing; no replacement chain was started'}}
}else{$ledger=WslPath (Join-Path $runtimeRoot 'validator')}
if($RestartValidator){
  if(-not $useNative -or -not $prior){throw 'Controlled validator restart requires a saved native runtime'}
  & wsl.exe -d $bondtraceWslDistro --exec bash $nativeControl stop $nativeScope $imageHash $RpcPort
  if($LASTEXITCODE -ne 0){throw 'Validator ownership/shutdown verification failed; preserve processes'}
  $stopDeadline=(Get-Date).AddSeconds(10)
  while((PortBusy ($RpcPort+1)) -and (Get-Date) -lt $stopDeadline){Start-Sleep -Milliseconds 100}
}
$validatorPid=$null
$validatorChild=$null
if(PortBusy $RpcPort){
  if(-not $prior -or $prior.rpcUrl -ne $rpcUrl -or (RpcGenesis) -ne $prior.genesisHash){throw 'RPC port belongs to another or unrecorded ledger. Preserve it and choose separate ports.'}
  $validatorScript=WslPath (Join-Path $projectRoot 'scripts/backend-validator.sh')
  $owners=@(Get-CimInstance Win32_Process -Filter "Name='wsl.exe'" | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($validatorScript) -and $_.CommandLine.Contains($ledger)})
  if($owners.Count -eq 1){$validatorPid=$owners[0].ProcessId}
}else{
  foreach($number in @(($RpcPort+1),($RpcPort+2),($RpcPort+3))){if(PortBusy $number){throw ('Companion port is occupied: '+$number)}}
  $validatorScript=WslPath (Join-Path $projectRoot 'scripts/backend-validator.sh')
  $child=Start-Process -FilePath (Get-Command wsl.exe).Source -ArgumentList @('-d',$bondtraceWslDistro,'--exec','bash',('"'+$validatorScript+'"'),('"'+$ledger+'"'),$RpcPort,($RpcPort+3),($RpcPort+2)) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeRoot "validator-$stamp.stdout.log") -RedirectStandardError (Join-Path $runtimeRoot "validator-$stamp.stderr.log")
  $validatorPid=$child.Id
  $validatorChild=$child
}
$deadline=(Get-Date).AddSeconds(180);$genesis=$null
while((Get-Date) -lt $deadline){if($validatorChild){$validatorChild.Refresh();if($validatorChild.HasExited){throw ('Validator exited before RPC readiness. Preserve logs in '+$runtimeRoot)}};try{$genesis=RpcGenesis;break}catch{Start-Sleep -Milliseconds 300}}
if(-not $genesis){throw ('Validator did not become ready. Preserve logs in '+$runtimeRoot)}
if($prior -and $prior.genesisHash -cne $genesis){throw 'The resumed ledger differs from its recorded genesis; preserve both states and receipts'}
$dataDirectory=Join-Path $runtimeRoot 'data'
$apiPid=$null
if($RestartApi -and (PortBusy $ApiPort)){
  $listener=Get-NetTCPConnection -LocalPort $ApiPort -State Listen -ErrorAction Stop
  if(-not $prior -or $prior.apiOrigin -ne $apiOrigin -or @($listener.OwningProcess|Select-Object -Unique).Count -ne 1 -or $listener.OwningProcess -ne $prior.apiProcessId){throw 'The API listener is not the recorded runtime process; preserve it.'}
  $process=Get-Process -Id $prior.apiProcessId -ErrorAction Stop
  if($process.ProcessName -ne 'node' -or $process.StartTime.ToUniversalTime() -gt ([DateTime]$prior.startedAt).ToUniversalTime()){throw 'The recorded API PID was reused; preserve the process.'}
  $before=Invoke-RestMethod -Uri ($apiOrigin+'/api/health') -TimeoutSec 5
  if($before.chain.genesisHash -ne $genesis -or $before.chain.rpcUrl -ne $rpcUrl){throw 'The running API belongs to another chain; preserve it.'}
  Stop-Process -Id $process.Id
  $deadline=(Get-Date).AddSeconds(5);while((PortBusy $ApiPort) -and (Get-Date) -lt $deadline){Start-Sleep -Milliseconds 100}
  if(PortBusy $ApiPort){throw 'The previous API did not release its port; preserve logs and inspect.'}
}
if(PortBusy $ApiPort){
  if(-not $prior -or $prior.apiOrigin -ne $apiOrigin){throw 'API port belongs to another or unrecorded process. Preserve it and choose another port.'}
  $apiPid=$prior.apiProcessId
}else{
  $env:PORT=[string]$ApiPort;$env:SOLANA_RPC_URL=$rpcUrl;$env:BONDTRACE_NETWORK='localnet';$env:BONDTRACE_ENABLE_DEMO='true';$env:BONDTRACE_DATA_DIR=$dataDirectory
  if($useNative){$env:BONDTRACE_RUNTIME_MIN_FREE_MB='2048';$env:BONDTRACE_RUNTIME_BACKING_ROOT=[IO.Path]::GetPathRoot($basePath);$env:BONDTRACE_RUNTIME_NATIVE_LEDGER=$ledger;$env:BONDTRACE_WSL_DISTRO=$bondtraceWslDistro}
  $child=Start-Process -FilePath (Get-Command node).Source -ArgumentList @('--import','tsx',('"'+(Join-Path $projectRoot 'server/index.ts')+'"')) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeRoot "api-$stamp.stdout.log") -RedirectStandardError (Join-Path $runtimeRoot "api-$stamp.stderr.log")
  $apiPid=$child.Id
}
$deadline=(Get-Date).AddSeconds(20);$health=$null
while((Get-Date) -lt $deadline){try{$health=Invoke-RestMethod -Uri ($apiOrigin+'/api/health') -TimeoutSec 4;break}catch{Start-Sleep -Milliseconds 300}}
if(-not $health -or $health.chain.genesisHash -ne $genesis -or $health.program.status -ne 'known-match' -or $health.program.expected.sha256 -cne $imageHash){throw ('API did not verify this release. Preserve logs in '+$runtimeRoot)}
$record=[ordered]@{startedAt=(Get-Date).ToUniversalTime().ToString('o');apiOrigin=$apiOrigin;rpcUrl=$rpcUrl;genesisHash=$genesis;programSha256=$imageHash;ledger=$(if($useNative){$ledger}else{Join-Path $runtimeRoot 'validator'});ledgerStorage=$(if($useNative){'wsl-native'}else{'windows-mounted'});nativeScope=$nativeScope;wslDistro=$bondtraceWslDistro;nativeFilesystem=$nativeFs;vhdBackingDrive=$(if($useNative){$backingDrive}else{$null});dataDirectory=$dataDirectory;apiProcessId=$apiPid;validatorProcessId=$validatorPid;readiness=@{status="pending"}}
$record | ConvertTo-Json | Set-Content -LiteralPath $runtimeFile -Encoding utf8
$ready=Invoke-RestMethod -Uri ($apiOrigin+'/api/runtime/readiness') -Method Post -ContentType 'application/json' -Body '{}' -TimeoutSec 8
if($ready.rpcHealth -ne 'ok' -or -not $ready.storage.verified -or $ready.slotAfter -le $ready.slotBefore -or $ready.chain.genesisHash -ne $genesis){throw 'Runtime is alive but not advancing/read-write ready'}
$record.readiness=@{status="ready";metadataWriteRead=$true;storageBackend=$(if($env:BONDTRACE_STORAGE_BACKEND -eq 'postgres'){'postgres'}else{'sqlite'});slotBefore=$ready.slotBefore;slotAfter=$ready.slotAfter}
if($record.readiness.storageBackend -eq 'sqlite'){$record.readiness.sqliteWriteRead=$true}
$record | ConvertTo-Json | Set-Content -LiteralPath $runtimeFile -Encoding utf8
$record | ConvertTo-Json
}finally{$runtimeLock.Dispose()}
