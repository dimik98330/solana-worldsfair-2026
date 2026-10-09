param([ValidateRange(1024,65000)][int]$RpcPort=8959,[ValidateRange(1024,65000)][int]$ApiPort=3160,[switch]$SkipBuild)
$ErrorActionPreference='Stop'
$projectRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $projectRoot
try {
  if(-not $SkipBuild){
    & npm run build:program
    if($LASTEXITCODE -ne 0){throw 'Program build failed'}
    & npm run build
    if($LASTEXITCODE -ne 0){throw 'Application build failed'}
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
} finally {Pop-Location}
