import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {localDir} from './config.ts';
import {AppError} from './rpc.ts';
export function assertRuntimeBudget() {
  const configured=process.env.BONDTRACE_RUNTIME_MIN_FREE_MB;
  if(configured===undefined)return;
  if(!/^\d{1,6}$/.test(configured)||BigInt(configured)<64n)throw new AppError('RUNTIME_BUDGET_INVALID','Runtime storage budget is invalid',503);
  const space=fs.statfsSync(localDir,{bigint:true}),free=space.bavail*space.bsize;
  if(free<BigInt(configured)*1048576n)throw new AppError('RUNTIME_DISK_LOW','Signing is blocked until the configured local metadata volume has enough free space. Existing receipts are preserved.',503,true);
  const backing=process.env.BONDTRACE_RUNTIME_BACKING_ROOT;
  if(backing){const volume=fs.statfsSync(backing,{bigint:true});if(volume.bavail*volume.bsize<BigInt(configured)*1048576n)throw new AppError('RUNTIME_DISK_LOW','The ledger backing volume is below its signing budget',503,true);}
  const native=process.env.BONDTRACE_RUNTIME_NATIVE_LEDGER;
  if(native){
    const distro=process.env.BONDTRACE_WSL_DISTRO;
    if(!distro||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(distro)||!native.startsWith('/')||native.includes('\0'))throw new AppError('RUNTIME_BUDGET_INVALID','Native runtime identity is invalid',503);
    let available:bigint;
    try{const output=execFileSync('wsl.exe',['-d',distro,'--exec','/bin/df','-B1','--output=avail','--',native],{encoding:'utf8',windowsHide:true,timeout:5000});const count=output.trim().split(/\s+/).pop()!;if(!/^\d+$/.test(count))throw new Error('Invalid disk result');available=BigInt(count);}catch{throw new AppError('RUNTIME_STORAGE_UNAVAILABLE','Native ledger storage cannot be verified before signing/relay',503,true);}
    if(available<BigInt(configured)*1048576n)throw new AppError('RUNTIME_DISK_LOW','The native ledger volume is below its signing budget',503,true);
  }
}
