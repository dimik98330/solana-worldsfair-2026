import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const transactionModule=pathToFileURL(path.resolve('server/transactions.ts')).href;
const seedModule=pathToFileURL(path.resolve('server/seed.ts')).href;
const source=`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const directory=process.env.BONDTRACE_DATA_DIR,keys=path.join(directory,'keys');
const mode=process.env.BONDTRACE_BOUNDARY_TEST_MODE;
let rpcCalls=0,keyReads=0,keyGenerations=0;
globalThis.fetch=async()=>{rpcCalls++;throw Error('Unexpected RPC from signer boundary test');};
const readFile=fs.readFileSync;
fs.readFileSync=function(file,...args){
 if(String(file).endsWith('-keypair.json')){keyReads++;throw Error('Generated key file must not be read while disabled');}
 return readFile.call(this,file,...args);
};
const generateKey=crypto.subtle.generateKey;
if(mode!=='enabled')crypto.subtle.generateKey=async()=>{keyGenerations++;throw Error('Generated keys must not be created while disabled');};
const [{demoSigner},{bootstrap}]=await Promise.all([import(${JSON.stringify(transactionModule)}),import(${JSON.stringify(seedModule)})]);
assert.equal(fs.existsSync(keys),false,'importing signer/bootstrap modules must not create a keys directory');
if(mode==='disabled'){
 const rejected=error=>error.code==='DEMO_DISABLED'&&error.status===403;
 await assert.rejects(()=>demoSigner('issuer'),rejected);
 await assert.rejects(()=>bootstrap(false,'disabled_'+crypto.randomUUID()),rejected);
 assert.equal(fs.existsSync(keys),false,'disabled direct calls must not create keys');
 assert.equal(fs.existsSync(path.join(directory,'metadata.sqlite')),false,'disabled bootstrap must not retain a new intent');
 assert.equal(rpcCalls,0);assert.equal(keyReads,0);assert.equal(keyGenerations,0);
 // Existing data in this isolated namespace also must not be read or changed.
 fs.mkdirSync(keys);const sentinel=path.join(keys,'issuer-keypair.json');
 fs.writeFileSync(sentinel,'synthetic-invalid-key-sentinel',{flag:'wx'});
 await assert.rejects(()=>demoSigner('issuer'),rejected);
 assert.equal(keyReads,0);assert.equal(readFile(sentinel,'utf8'),'synthetic-invalid-key-sentinel');
 assert.equal(rpcCalls,0);assert.equal(keyGenerations,0);
}else if(mode==='enabled'){
 const actor=await demoSigner('issuer');
 assert.match(String(actor.address),/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
 assert.equal(fs.existsSync(path.join(keys,'issuer-keypair.json')),true,'explicitly enabled test signing remains available');
 assert.equal(rpcCalls,0);
}
crypto.subtle.generateKey=generateKey;
fs.readFileSync=readFile;
console.log(JSON.stringify({mode,network:process.env.BONDTRACE_NETWORK,rpcCalls,keyReads,keyGenerations}));
`;

async function worker(mode:'import'|'disabled'|'enabled',network:'localnet'|'devnet'){
 const directory=path.resolve('.local/tests/demo-disabled-boundary-'+crypto.randomUUID());
 return new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{
  const child=spawn(process.execPath,['--import','tsx','--input-type=module','--eval',source],{
   cwd:process.cwd(),windowsHide:true,
   env:{...process.env,BONDTRACE_NETWORK:network,SOLANA_RPC_URL:network==='devnet'?'https://api.devnet.solana.com':'http://127.0.0.1:8899',BONDTRACE_ENABLE_DEMO:mode==='enabled'?'true':'false',BONDTRACE_DATA_DIR:directory,BONDTRACE_BOUNDARY_TEST_MODE:mode},
  });
  let stdout='',stderr='';
  child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
  const timer=setTimeout(()=>{child.kill();reject(Error('Demo boundary worker timeout'));},45000);
  child.on('error',error=>{clearTimeout(timer);reject(error);});
  child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
 });
}

test('importing demo-capable modules while disabled creates no keys directory or RPC request',async()=>{
 const result=await worker('import','localnet');assert.equal(result.code,0,result.stderr);
 const observation=JSON.parse(result.stdout.trim());assert.equal(observation.rpcCalls,0);assert.equal(observation.keyGenerations,0);
});
for(const network of ['localnet','devnet'] as const){
 test('disabled direct signer/bootstrap reject before RPC, key access or intent retention on '+network,async()=>{
  const result=await worker('disabled',network);assert.equal(result.code,0,result.stderr);
 });
 test('explicitly enabled generated signer remains usable on '+network+' without RPC',async()=>{
  const result=await worker('enabled',network);assert.equal(result.code,0,result.stderr);
 });
}
