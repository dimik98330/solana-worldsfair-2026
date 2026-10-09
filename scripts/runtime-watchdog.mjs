import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readinessPolicy,restartPolicy} from './runtime-policy.mjs';
const root=process.cwd(),release=JSON.parse(fs.readFileSync('programs/bondtrace/release.json','utf8'));
const runtimeRoot=path.resolve('.local/backend-execution',release.sha256.slice(0,12)),runtimeFile=path.join(runtimeRoot,'runtime.json');
const saved=JSON.parse(fs.readFileSync(runtimeFile,'utf8'));
if(saved.ledgerStorage!=='wsl-native'||saved.programSha256!==release.sha256)throw new Error('Watchdog requires the recorded current native release');
if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(saved.wslDistro)||!/^[a-f0-9]{16}$/.test(saved.nativeScope)||!/^[A-Z]$/.test(saved.vhdBackingDrive))throw new Error('Native runtime metadata is invalid');
for(const endpoint of [saved.apiOrigin,saved.rpcUrl]){const url=new URL(endpoint);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Only recorded loopback endpoints are permitted');}
const control=spawnSync('wsl.exe',['-d',saved.wslDistro,'--exec','wslpath','-a',path.resolve('scripts/native-runtime.sh').replaceAll('\\','/')],{encoding:'utf8',windowsHide:true});
if(control.status!==0)throw new Error('Native control path unavailable');
const controlPath=control.stdout.trim(),stateFile=path.join(runtimeRoot,'watchdog.json');
let timestamps=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')).restarts??[]:[],failures=0;
const lockFile=path.join(runtimeRoot,'watchdog-owner.lock');
// A second supervisor cannot race controlled process recovery. A stale lock needs explicit owner inspection.
const lock=fs.openSync(lockFile,'wx');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
function native(action){const result=spawnSync('wsl.exe',['-d',saved.wslDistro,'--exec','bash',controlPath,action,saved.nativeScope,release.sha256,...(action==='stop'?[new URL(saved.rpcUrl).port]:[])],{encoding:'utf8',windowsHide:true,timeout:action==='stop'?35000:10000});if(result.status!==0)throw new Error('Native probe failed');return result.stdout.trim().split(/\r?\n/);}
function budgets(){
 const info=native('resolve'),drive=spawnSync('pwsh',['-NoProfile','-Command',`[Console]::Write((Get-PSDrive -Name ${saved.vhdBackingDrive}).Free)`],{encoding:'utf8',windowsHide:true,timeout:5000});
 if(drive.status!==0||!/^\d+$/.test(drive.stdout.trim()))throw new Error('Host backing-volume probe failed');
 const hostLogs=fs.readdirSync(runtimeRoot).filter(name=>/^(api|validator|watchdog|launcher)-[A-Za-z0-9.-]+\.(stdout|stderr)\.log$/.test(name)).reduce((sum,name)=>{const stat=fs.lstatSync(path.join(runtimeRoot,name));if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Unsafe diagnostic log');return sum+BigInt(stat.size);},0n);
 const metadataSpace=fs.statfsSync(root,{bigint:true});
 return {hostFreeBytes:BigInt(drive.stdout.trim())<metadataSpace.bavail*metadataSpace.bsize?BigInt(drive.stdout.trim()):metadataSpace.bavail*metadataSpace.bsize,nativeFreeBytes:BigInt(info[2]),logBytes:BigInt(native('log-size')[0])+hostLogs};
}
function persist(status,reason){const temporary=stateFile+'.tmp';fs.writeFileSync(temporary,JSON.stringify({checkedAt:new Date().toISOString(),status,reason,restarts:timestamps,financialExecution:false},null,2));fs.renameSync(temporary,stateFile);}
async function probe(){
 const response=await fetch(saved.apiOrigin+'/api/runtime/readiness',{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(6000)});
 if(!response.ok)throw new Error('Runtime readiness unavailable');const ready=await response.json();
 return readinessPolicy({...budgets(),rpcHealth:ready.rpcHealth,genesis:ready.chain.genesisHash,expectedGenesis:saved.genesisHash,slotBefore:ready.slotBefore,slotAfter:ready.slotAfter,programVerified:ready.program.status==='known-match'&&ready.program.expected.sha256===saved.programSha256,storageVerified:ready.storage.verified});
}
async function tick(){
 try{const value=await probe();if(value.healthy){failures=0;persist('healthy',null);return;}throw new Error(value.reasons.join(','));}
 catch(error){failures++;persist('degraded',error.message);
  // Fail closed on low space/log quota. Recovery must never grow storage to chase readiness.
  let budget;try{budget=budgets();}catch{return;}
  if(budget.hostFreeBytes<2147483648n||budget.nativeFreeBytes<2147483648n||budget.logBytes>8388608n){
    try{native('stop');persist('attention-required','storage-budget-owned-writer-stopped');}catch{persist('attention-required','storage-budget-stop-unverified');}
    await stop();return;
  }
  const decision=restartPolicy(timestamps,Date.now(),failures);if(decision.exhausted){persist('attention-required','restart-budget-exhausted');return;}if(!decision.allowed)return;
  timestamps=[...decision.recent,Date.now()];persist('recovering',error.message);
  const result=spawnSync('pwsh',['-NoProfile','-File','scripts/backend-runtime.ps1','-RpcPort',String(new URL(saved.rpcUrl).port),'-ApiPort',String(new URL(saved.apiOrigin).port),'-NativeLedger','-RestartValidator'],{cwd:root,stdio:'ignore',windowsHide:true,timeout:240000});
  persist(result.status===0?'recovered':'attention-required',result.status===0?null:'controlled-restart-failed');failures=0;
 }
}
async function stop(){fs.closeSync(lock);if(fs.existsSync(lockFile)&&JSON.parse(fs.readFileSync(lockFile,'utf8')).pid===process.pid)fs.unlinkSync(lockFile);process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
console.log(JSON.stringify({scope:'owned-native-test-runtime',origin:saved.apiOrigin,financialExecution:false}));
for(;;){await tick();await new Promise(resolve=>setTimeout(resolve,10000));}
