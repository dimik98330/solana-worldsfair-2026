param([ValidateRange(1024,65000)][int]$RpcPort=8959,[ValidateRange(1024,65000)][int]$ApiPort=3160,[switch]$SkipBuild,[switch]$Paged,[switch]$Scale33,[switch]$LateCoupon,[ValidatePattern('^[A-Za-z0-9_-]{8,80}$')][string]$OperationId)
$ErrorActionPreference='Stop'
if(-not $Paged -and ($Scale33 -or $LateCoupon -or $PSBoundParameters.ContainsKey('OperationId'))){throw 'Scale33, LateCoupon and OperationId require -Paged'}
$projectRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $projectRoot
try {
  if(-not $SkipBuild){
    & npm run build:program
    if($LASTEXITCODE -ne 0){throw 'Program build failed'}
    & npm run build
    if($LASTEXITCODE -ne 0){throw 'Application build failed'}
  }
  if($Paged){
    $pagedRelease=Get-Content -LiteralPath (Join-Path $projectRoot 'programs/bondtrace/release.json') -Raw | ConvertFrom-Json
    if($pagedRelease.releaseId -ne 'paged-corporate-actions-v4' -or $pagedRelease.sha256 -notmatch '^[a-f0-9]{64}$'){throw 'Paged lifecycle requires the current reviewed paged-corporate-actions-v4 release before runtime startup'}
  }
  # This launcher checks release bytes and refuses unrelated occupied ports.
  & node scripts/run-runtime.mjs -RpcPort $RpcPort -ApiPort $ApiPort -NativeLedger -RestartApi
  if($LASTEXITCODE -ne 0){throw 'Isolated runtime failed'}
  $release=Get-Content programs/bondtrace/release.json -Raw | ConvertFrom-Json
  $runtimeFile=Join-Path $projectRoot ('.local/backend-execution/'+$release.sha256.Substring(0,12)+'/runtime.json')
  $runtime=Get-Content -LiteralPath $runtimeFile -Raw | ConvertFrom-Json
  $env:SOLANA_RPC_URL=$runtime.rpcUrl
  $env:BONDTRACE_DATA_DIR=$runtime.dataDirectory
  $env:BONDTRACE_NETWORK='localnet'
  $env:BONDTRACE_ENABLE_DEMO='true'
  if($Paged){
    $planArguments=@('--data-directory',[string]$runtime.dataDirectory,'--rpc-url',[string]$runtime.rpcUrl)
    if($Scale33){$planArguments+='--scale33'}
    if($LateCoupon){$planArguments+='--late-coupon'}
    if($PSBoundParameters.ContainsKey('OperationId')){$planArguments+=@('--operation-id',$OperationId)}
    $planOutput=& node --import tsx scripts/paged-demo-launcher.ts @planArguments
    if($LASTEXITCODE -ne 0){throw 'Paged lifecycle plan rejected; preserve the existing ID, flags and signatures'}
    $launch=$planOutput | ConvertFrom-Json
    Write-Output ('Paged recovery ID: '+$launch.plan.operationId)
    Write-Output ('Immutable launcher plan: '+$launch.planFile)
    $pagedArguments=@($launch.args)
    & node --import tsx scripts/paged-demo.ts @pagedArguments
    if($LASTEXITCODE -ne 0){throw ('Paged lifecycle stopped. Resume only the same operation ID and flags; retain all signatures: '+$launch.plan.operationId)}
    Write-Output ('Paged public evidence: '+(Join-Path $runtime.dataDirectory 'paged-demo-public'))
    Write-Output ('Built application: '+$runtime.apiOrigin)
  }else{
  $bootstrapFile=Join-Path $runtime.dataDirectory 'lifecycle-bootstrap-id.json'
  if(Test-Path -LiteralPath $bootstrapFile){$bootstrap=Get-Content -LiteralPath $bootstrapFile -Raw | ConvertFrom-Json}else{
    New-Item -ItemType Directory -Force -Path $runtime.dataDirectory | Out-Null
    $bootstrap=@{operationId=('lifecycle-bootstrap-'+[guid]::NewGuid().ToString())}
    $bootstrap | ConvertTo-Json | Out-File -LiteralPath $bootstrapFile -Encoding utf8 -NoClobber
  }
  Write-Output ('Bootstrap recovery ID: '+$bootstrap.operationId)
  $result=Invoke-RestMethod -Uri ($runtime.apiOrigin+'/api/demo/bootstrap') -Method Post -ContentType 'application/json' -Body ($bootstrap | ConvertTo-Json -Compress) -TimeoutSec 180
  if($result.status -ne 'confirmed'){throw ('Bootstrap is unresolved; resume the saved ID, never create another signed intent: '+$bootstrap.operationId)}
  $evidenceName='execution-audit-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString().Substring(0,8)+'.json'
  $env:BONDTRACE_EXECUTION_EVIDENCE='docs/evidence/'+$evidenceName
  & node --import tsx scripts/strength-smoke.ts
  if($LASTEXITCODE -ne 0){throw 'Lifecycle stopped. Preserve the printed signatures and runtime data; financial requests are not automatically repeated.'}
  Write-Output ('Verified evidence: '+(Join-Path $projectRoot $env:BONDTRACE_EXECUTION_EVIDENCE))
  Write-Output ('Built application: '+$runtime.apiOrigin)
  }
} finally {Pop-Location}
