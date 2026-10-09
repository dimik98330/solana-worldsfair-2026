import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2),seen=new Set();
for(let i=0;i<args.length;i++){
 const key=args[i];if(seen.has(key)||!['-RpcPort','-ApiPort','-NativeLedger','-RestartApi','-RestartValidator'].includes(key))throw new Error('Unsupported or duplicate runtime option');seen.add(key);
 if(['-RpcPort','-ApiPort'].includes(key)){const value=args[++i];if(!/^\d{4,5}$/.test(value)||Number(value)<1024||Number(value)>65000)throw new Error('Invalid runtime port');}
}
const release=JSON.parse(fs.readFileSync('programs/bondtrace/release.json','utf8'));if(!/^[a-f0-9]{64}$/.test(release.sha256))throw new Error('Invalid release');
const directory=path.resolve('.local/backend-execution',release.sha256.slice(0,12));fs.mkdirSync(directory,{recursive:true});
const log=path.join(directory,'launcher-'+Date.now()+'-'+crypto.randomUUID()+'.stdout.log'),descriptor=fs.openSync(log,'wx');
let result;
try{result=spawnSync('pwsh',['-NoProfile','-File',path.resolve('scripts/backend-runtime.ps1'),...args],{cwd:process.cwd(),stdio:['ignore',descriptor,descriptor],windowsHide:true,timeout:240000});}finally{fs.closeSync(descriptor);}
if(result.error||result.status!==0){console.error(fs.readFileSync(log,'utf8').slice(-5000));if(result.error)console.error(result.error.message);process.exit(1);}
console.log(fs.readFileSync(path.join(directory,'runtime.json'),'utf8'));
