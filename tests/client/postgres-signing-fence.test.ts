import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawn} from 'node:child_process';
const endpoint=process.env.BONDTRACE_TEST_PG_URL;
for(const takeover of ['getLatestBlockhash','simulateTransaction'])test('actual PG takeover fences crypto after '+takeover,{skip:!endpoint},async()=>{
 const url=new URL(endpoint!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'32545');assert.equal(url.pathname,'/bondtrace_tests');
 const namespace='signing_'+crypto.randomUUID().replaceAll('-','');
 const source=`import assert from 'node:assert/strict';import {generateKeyPairSigner,getAddressDecoder,lamports} from '@solana/kit';import {getTransferSolInstruction} from '@solana-program/system';import {programRpc} from './tests/client/helpers/program-rpc.ts';
 const [storage,transactions,{PostgresDocumentStore},{postgresOptions}]=await Promise.all([import('./server/storage.ts'),import('./server/transactions.ts'),import('./server/postgres-document-store.ts'),import('./server/config.ts')]);
 const other=new PostgresDocumentStore(postgresOptions),key=n=>getAddressDecoder().decode(Uint8Array.from({length:32},(_,i)=>i===0?n:37));let signs=0,sends=0,claimed=false;
 globalThis.fetch=async(input,options)=>{const request=JSON.parse(String(options?.body));if(request.method===process.env.PG_TAKEOVER&&!claimed){other.write('fixture.json','{"writer":"B"}');claimed=true;}const deployment=programRpc(request);let result;
 if(deployment!==undefined)result=deployment;else if(request.method==='getGenesisHash')result=key(101);else if(request.method==='getLatestBlockhash')result={context:{slot:100},value:{blockhash:key(110),lastValidBlockHeight:1000}};else if(request.method==='simulateTransaction')result={context:{slot:100},value:{err:null,unitsConsumed:5000,logs:[]}};else if(request.method==='sendTransaction'){sends++;throw Error('Forbidden send');}else throw Error('Unmocked '+request.method);
 return Response.json({jsonrpc:'2.0',id:request.id,result});};
 const real=await generateKeyPairSigner(),actor={...real,signTransactions:async(...args)=>{signs++;return real.signTransactions(...args);}};
 let code;try{await transactions.buildTransaction([getTransferSolInstruction({source:actor,destination:key(4),amount:lamports(25n)})],String(actor.address),[actor]);}catch(error){code=error.code;}
 assert.equal(claimed,true,'Pre-takeover failure: '+code);assert.equal(code,'STORAGE_FENCED');assert.equal(signs,process.env.PG_TAKEOVER==='getLatestBlockhash'?0:1);assert.equal(sends,0);assert.equal(other.keys().some(key=>key.startsWith('receipts/')||key.startsWith('operations/')),false);other.close();storage.closeStorage();console.log(JSON.stringify({code,signs,sends}));`;
 const child=spawn(process.execPath,['--import','tsx','--input-type=module','--eval',source],{cwd:process.cwd(),windowsHide:true,env:{...process.env,DATABASE_URL:endpoint!,BONDTRACE_DEPLOYMENT:'local',BONDTRACE_NETWORK:'localnet',SOLANA_RPC_URL:'http://127.0.0.1:8899',BONDTRACE_ENABLE_DEMO:'true',BONDTRACE_STORAGE_BACKEND:'postgres',BONDTRACE_DATABASE_TLS:'local-only',BONDTRACE_DATABASE_NAMESPACE:namespace,BONDTRACE_DATA_DIR:path.resolve('.local/tests/pg-signing-'+crypto.randomUUID()),PG_TAKEOVER:takeover}});
 let output='',errors='';child.stdout.on('data',data=>output+=String(data));child.stderr.on('data',data=>errors+=String(data));
 const code=await new Promise<number|null>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Signing fence child timed out'));},60000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',value=>{clearTimeout(timer);resolve(value);});});assert.equal(code,0,errors);assert.equal(JSON.parse(output).sends,0);
});
