import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {Pool} from 'pg';
import {pgCommitProxy} from './helpers/pg-commit-proxy.ts';
const endpoint=process.env.BONDTRACE_TEST_PG_URL;
const common=`import assert from 'node:assert/strict';import {generateKeyPairSigner,getAddressDecoder,lamports} from '@solana/kit';import {getTransferSolInstruction} from '@solana-program/system';import {programRpc} from './tests/client/helpers/program-rpc.ts';
const [storage,journal,operations,transactions,rpc,rebroadcast]=await Promise.all([import('./server/storage.ts'),import('./server/journal.ts'),import('./server/operations.ts'),import('./server/transactions.ts'),import('./server/rpc.ts'),import('./server/rebroadcast.ts')]);
const key=n=>getAddressDecoder().decode(Uint8Array.from({length:32},(_,i)=>i===0?n:37)),realFetch=globalThis.fetch;let sends=0,lastWire;
globalThis.fetch=async(input,options)=>{const request=JSON.parse(String(options?.body));const deployment=programRpc(request);let result;
 if(deployment!==undefined)result=deployment;
 else if(request.method==='getGenesisHash')result=key(101);
 else if(request.method==='getLatestBlockhash')result={context:{slot:100},value:{blockhash:key(110),lastValidBlockHeight:1000}};
 else if(request.method==='simulateTransaction')result={context:{slot:100},value:{err:null,unitsConsumed:5000,logs:[]}};
 else if(request.method==='getFeeForMessage'){if(process.env.PG_DROP_ACK==='true'){const armed=await realFetch(process.env.PG_ARM_URL,{method:'POST'});assert.equal(armed.status,200);}result={context:{slot:100},value:5000};}
 else if(request.method==='sendTransaction'){sends++;lastWire=request.params[0];result=rpc.signatureOf(lastWire);}
 else if(request.method==='getSignatureStatuses')result={context:{slot:110},value:[sends?{slot:105,confirmations:1,err:null,confirmationStatus:'confirmed'}:null]};
 else if(request.method==='getBlockHeight')result=100;
 else throw Error('Unmocked RPC '+request.method);
 return Response.json({jsonrpc:'2.0',id:request.id,result});};
`;
async function child(source:string,env:NodeJS.ProcessEnv){
 const processChild=spawn(process.execPath,['--import','tsx','--input-type=module','--eval',common+source],{cwd:process.cwd(),windowsHide:true,env:{...process.env,...env}});let out='',err='';processChild.stdout.on('data',data=>out+=String(data));processChild.stderr.on('data',data=>err+=String(data));
 const code=await new Promise<number|null>((resolve,reject)=>{const timer=setTimeout(()=>{processChild.kill();reject(Error('Financial barrier child timeout'));},60000);processChild.once('error',error=>{clearTimeout(timer);reject(error);});processChild.once('close',value=>{clearTimeout(timer);resolve(value);});});assert.equal(code,0,err);return JSON.parse(out);
}
test('actual PostgreSQL COMMIT acknowledgement loss prevents relay and preserves exact signed recovery',{skip:!endpoint},async()=>{
 const url=new URL(endpoint!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'32545');assert.equal(url.pathname,'/bondtrace_tests');
 const proxy=await pgCommitProxy(32545),proxied=new URL(endpoint!);proxied.port=String(proxy.port);
 const namespace='financial_'+crypto.randomUUID().replaceAll('-',''),directory=path.resolve('.local/tests/pg-financial-'+crypto.randomUUID());
 const env={BONDTRACE_DEPLOYMENT:'local',BONDTRACE_NETWORK:'localnet',SOLANA_RPC_URL:'http://127.0.0.1:8899',BONDTRACE_ENABLE_DEMO:'true',BONDTRACE_STORAGE_BACKEND:'postgres',BONDTRACE_DATABASE_TLS:'local-only',BONDTRACE_DATABASE_NAMESPACE:namespace,BONDTRACE_DATA_DIR:directory};
 const pool=new Pool({connectionString:endpoint!,ssl:false,max:1});
 try{
  const first=await child(`const actor=await generateKeyPairSigner(),id='pg_commit_loss_01';operations.beginOperation(id,'journal_fixture','test-only',{});let signed;let code;
   try{await transactions.execute([getTransferSolInstruction({source:actor,destination:key(4),amount:lamports(25n)})],actor,'journal_fixture',[],undefined,signature=>{signed=signature;operations.updateOperation(id,{signature,wallet:actor.address,status:'pending',chainStatus:'pending'});});}catch(error){code=error.code;}
   assert.ok(signed);assert.equal(sends,0);assert.ok(code?.startsWith('STORAGE_'));storage.closeStorage();console.log(JSON.stringify({signature:signed,sends,code}));`,{...env,DATABASE_URL:proxied.toString(),PG_DROP_ACK:'true',PG_ARM_URL:proxy.armUrl});
  assert.equal(proxy.dropped,true);assert.equal(first.sends,0);
  const rows=await pool.query('SELECT key,body FROM bondtrace_metadata.documents WHERE namespace=$1 AND key IN($2,$3,$4)',[namespace,'receipts/'+first.signature+'.json','operations/pg_commit_loss_01.json','lifetimes.json']);assert.equal(rows.rows.length,3);
  const receipt=JSON.parse(rows.rows.find(row=>row.key.startsWith('receipts/')).body);assert.equal(receipt.signature,first.signature);assert.equal(receipt.chainStatus,'pending');assert.equal(JSON.parse(rows.rows.find(row=>row.key==='operations/pg_commit_loss_01.json').body).signature,first.signature);assert.equal(JSON.parse(rows.rows.find(row=>row.key==='lifetimes.json').body)[first.signature],1000);
  const recovered=await child(`const signature=process.env.PG_ORIGINAL_SIGNATURE,original=journal.receipt(signature).signedTransactionBase64;const result=await rebroadcast.rebroadcastTransaction(signature,'pg_commit_loss_01');assert.equal(sends,1);assert.equal(lastWire,original);assert.equal(result.signature,signature);storage.closeStorage();console.log(JSON.stringify({signature,sends,recovered:true}));`,{...env,DATABASE_URL:endpoint!,PG_DROP_ACK:'false',PG_ORIGINAL_SIGNATURE:first.signature});
  assert.equal(recovered.signature,first.signature);assert.equal(recovered.recovered,true);
 }finally{await pool.end();await proxy.close();}
});
