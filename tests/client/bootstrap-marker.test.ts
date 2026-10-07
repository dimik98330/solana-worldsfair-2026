import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
const modules=['server/seed.ts','server/operations.ts'].map(p=>pathToFileURL(path.resolve(p)).href);
const source=`
import fs from 'node:fs';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
const directory=process.env.BONDTRACE_DATA_DIR,id=process.env.MARKER_ID,mode=process.env.MARKER_MODE;
const [seed,operations]=await Promise.all(${JSON.stringify(modules)}.map(p=>import(p)));
globalThis.fetch=async (_url,init)=>{const r=JSON.parse(String(init.body));let result;
 if(r.method==='getGenesisHash')result='11111111111111111111111111111111';
 else if(r.method==='getAccountInfo'){if(r.params[0]==='SysvarC1ock11111111111111111111111111111111'){const bytes=Buffer.alloc(40);bytes.writeBigInt64LE(100n,32);result={context:{slot:1},value:{owner:'Sysvar1111111111111111111111111111111111111',executable:false,data:[bytes.toString('base64'),'base64']}};}else result={context:{slot:1},value:null};}
 else if(r.method==='getMinimumBalanceForRentExemption')result=1000000;
 else if(r.method==='getBalance'){if(mode==='prime')throw Error('Synthetic prime stop before funding marker');result={context:{slot:1},value:0};}
 else if(r.method==='requestAirdrop'){fs.writeFileSync(path.join(directory,'faucet-'+process.pid+'.txt'),'synthetic request only',{flag:'wx'});throw Error('Synthetic accepted faucet response loss');}
 else throw Error('Unexpected synthetic RPC '+r.method);
 return Response.json({jsonrpc:'2.0',id:r.id,result});
};
const wait=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);
if(mode==='peer'){fs.writeFileSync(path.join(directory,'peer-ready.txt'),'ready');const start=Date.now();while(!fs.existsSync(path.join(directory,'refresh-started.txt'))){if(Date.now()-start>30000)throw Error('Barrier deadline');wait(10);}}
if(mode==='delayed'){
 const step=operations.findOperation(id).metadata.bootstrapPlan.steps[0].operationId;
 const prepare=DatabaseSync.prototype.prepare;let delayed=false;
 DatabaseSync.prototype.prepare=function(sql){const statement=prepare.call(this,sql);if(sql==='SELECT body FROM documents WHERE key = ?'){const get=statement.get;statement.get=function(...args){const row=get.apply(this,args),stack=new Error().stack;
  if(!delayed&&args[0]==='operations/'+step+'.json'&&stack.includes('runStep')&&!['beginOperation','updateOperation','reconcileStep','ensureSol','progress','bootstrapStatus'].some(name=>stack.includes(name))){delayed=true;fs.writeFileSync(path.join(directory,'refresh-started.txt'),'read');wait(900);}return row;};}return statement;};
}
try{await seed.bootstrap(true,id);throw Error('Synthetic funding cannot complete');}catch(e){console.log(JSON.stringify({code:e.code,message:e.message}));}
`;
function worker(directory:string,id:string,mode:string){return new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{const child=spawn(process.execPath,['--import','tsx','--input-type=module','--eval',source],{cwd:process.cwd(),env:{...process.env,BONDTRACE_NETWORK:'localnet',SOLANA_RPC_URL:'http://127.0.0.1:8899',BONDTRACE_DATA_DIR:directory,MARKER_ID:id,MARKER_MODE:mode},windowsHide:true});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);const timer=setTimeout(()=>{child.kill();reject(Error('Synthetic marker worker timeout'));},45000);child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});});}
test('a delayed bootstrap metadata refresh cannot erase another process faucet marker and issue a second request',async()=>{
 const directory=path.resolve('.local/tests/bootstrap-marker-'+crypto.randomUUID()),id='marker_'+crypto.randomUUID();fs.mkdirSync(directory,{recursive:true});
 const prime=await worker(directory,id,'prime');assert.equal(prime.code,0,prime.stderr);
 const peer=worker(directory,id,'peer'),start=Date.now();while(!fs.existsSync(path.join(directory,'peer-ready.txt'))){if(Date.now()-start>30000)throw Error('Peer initialization deadline');await new Promise(r=>setTimeout(r,10));}
 const delayed=worker(directory,id,'delayed');
 for(const result of await Promise.all([peer,delayed]))assert.equal(result.code,0,result.stderr);
 assert.ok(fs.existsSync(path.join(directory,'refresh-started.txt')),'actual runStep metadata read was delayed');
 assert.equal(fs.readdirSync(directory).filter(name=>/^faucet-\d+\.txt$/.test(name)).length,1,'two competing bootstrap processes must retain one unknown faucet request');
});
