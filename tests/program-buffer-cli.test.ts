import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {bufferImageHash} from '../scripts/program-buffer.ts';
import {programBufferCli, bufferHttpRpc} from '../scripts/program-buffer-cli.ts';
function fixture() {
  const id='cli_'+randomUUID().replaceAll('-',''),dir=path.resolve('.local/tests',id);
  fs.mkdirSync(dir,{recursive:true});
  const image=Uint8Array.from([1,2,3,4]),imagePath=path.join(dir,'synthetic.bin');fs.writeFileSync(imagePath,image);
  const args=['--network=localnet','--rpc=http://127.0.0.1:8999/','--genesis=11111111111111111111111111111111',
    '--id='+id,'--authority=11111111111111111111111111111111','--buffer=So11111111111111111111111111111111111111112',
    '--image='+imagePath,'--bytes=4','--sha256='+bufferImageHash(image)];
  return {args,id,imagePath};
}
async function transport<T>(action:(calls:string[],output:unknown[])=>Promise<T>) {
  const oldFetch=globalThis.fetch,oldLog=console.log,calls:string[]=[],output:unknown[]=[];
  globalThis.fetch=async (_input,options)=>{
    const body=JSON.parse(String(options?.body));calls.push(body.method);
    const result=body.method==='getGenesisHash'?'11111111111111111111111111111111':
      body.method==='getAccountInfo'?{context:{slot:12},value:null}:
      body.method==='getMinimumBalanceForRentExemption'?1000000:
      body.method==='getBalance'?{context:{slot:12},value:10000000}:undefined;
    assert.notEqual(result,undefined,'Read-only CLI must never sign/send/request airdrop');
    return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result}),{headers:{'content-type':'application/json'}});
  };
  console.log=(value?:unknown)=>output.push(value);
  try{return await action(calls,output);}finally{globalThis.fetch=oldFetch;console.log=oldLog;}
}
test('default CLI performs four read-only preflight calls without reading explicit nonexistent keys or creating a journal',async()=>{
  const f=fixture();
  await transport(async(calls,output)=>{
    assert.equal(await programBufferCli([...f.args,'--authority-keypair=nonexistent-owner-key.json','--buffer-keypair=nonexistent-buffer-key.json']),0);
    assert.deepEqual(calls,['getGenesisHash','getAccountInfo','getMinimumBalanceForRentExemption','getBalance']);
    const plan=JSON.parse(String(output[0]));assert.equal(plan.mode,'read-only');assert.equal(plan.signerFilesRead,false);
    assert.equal(plan.programUpgrade,false);assert.equal(plan.missingChunks,1);
  });
  assert.equal(fs.existsSync(path.resolve('.local/program-buffer',f.id)),false);
});
test('tampered image, duplicate flags and forbidden mainnet fail before any RPC or key read',async()=>{
  const f=fixture();
  await transport(async calls=>{
    fs.appendFileSync(f.imagePath,'changed');
    await assert.rejects(programBufferCli(f.args),/BUFFER_IMAGE_OR_INTENT_INVALID/);
    await assert.rejects(programBufferCli([...f.args,'--network=devnet']),/DUPLICATE/);
    const other=fixture();
    await assert.rejects(programBufferCli(other.args.map(a=>a==='--network=localnet'?'--network=mainnet':a)),/LOOPBACK_LOCALNET_REQUIRED/);
    assert.deepEqual(calls,[]);
  });
});
test('stage is refused before reading a signer when explicit fee/rent limits are absent or insufficient',async()=>{
  const f=fixture();
  await transport(async calls=>{
    await assert.rejects(programBufferCli([...f.args,'--stage','--authority-keypair=nonexistent.json']),/MISSING_MAX-FEES/);
    await assert.rejects(programBufferCli([...f.args,'--stage','--authority-keypair=nonexistent.json',
      '--max-fees=10000','--max-tx-fee=5000','--max-rent=999999']),/STAGE_BUDGET_INVALID/);
    assert.ok(calls.every(x=>!['sendTransaction','requestAirdrop'].includes(x)));
  });
  assert.equal(fs.existsSync(path.resolve('.local/program-buffer',f.id)),false);
});

test('RPC refuses an oversized streamed response and cancels before collecting the remainder',async()=>{
  const oldFetch=globalThis.fetch; let cancelled=false, pulls=0;
  const stream=new ReadableStream<Uint8Array>({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(9*1024*1024)); },
    cancel() { cancelled=true; },
  },{highWaterMark:0});
  globalThis.fetch=async()=>new Response(stream);
  try {
    await assert.rejects(bufferHttpRpc('http://127.0.0.1:8999/','localnet').request('getGenesisHash',[],new AbortController().signal),/RPC_BODY_TOO_LARGE/);
    assert.equal(cancelled,true); assert.equal(pulls,2);
  } finally { globalThis.fetch=oldFetch; }
});

test('recovery and confirmed progress require explicit distinct opt-ins and do not turn read-only into staging',async()=>{
  const f=fixture();
  await transport(async(calls,output)=>{
    assert.equal(await programBufferCli([...f.args,'--retry-expired-writes','--confirmed-progress']),0);
    const plan=JSON.parse(String(output[0]));
    assert.equal(plan.mode,'read-only'); assert.equal(plan.signerFilesRead,false);
    assert.equal(plan.retryExpiredWrites,true); assert.equal(plan.confirmedProgress,true);
    assert.deepEqual(calls,['getGenesisHash','getAccountInfo','getMinimumBalanceForRentExemption','getBalance']);
    await assert.rejects(programBufferCli([...f.args,'--retry-expired-writes','--retry-expired-writes']),/DUPLICATE_POLICY/);
    await assert.rejects(programBufferCli([...f.args,'--confirmed-progress','--confirmed-progress']),/DUPLICATE_POLICY/);
  });
  assert.equal(fs.existsSync(path.resolve('.local/program-buffer',f.id)),false);
});

test('devnet RPC pace is explicit and bounded at500ms while default1250 and single-flight behavior remain',async()=>{
  for(const pace of [499,0,-1,NaN,Infinity,500.5,60001])
    assert.throws(()=>bufferHttpRpc('https://api.devnet.solana.com/','devnet',pace),/INVALID_BUFFER_RPC_PACE/);
  assert.doesNotThrow(()=>bufferHttpRpc('https://api.devnet.solana.com/','devnet'));
  assert.doesNotThrow(()=>bufferHttpRpc('https://api.devnet.solana.com/','devnet',500));
  const previous=globalThis.fetch; let calls=0,finish:()=>void=()=>{};
  globalThis.fetch=async(_input,options)=>{
    calls++; const body=JSON.parse(String(options?.body));
    await new Promise<void>(resolve=>{finish=resolve;});
    return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result:'ok'}));
  };
  try{
    const rpc=bufferHttpRpc('https://api.devnet.solana.com/','devnet',500);
    const first=rpc.request('getGenesisHash',[],new AbortController().signal);
    await new Promise(resolve=>setTimeout(resolve,1));
    await assert.rejects(rpc.request('getGenesisHash',[],new AbortController().signal),/CONCURRENT_BUFFER_RPC_REFUSED/);
    assert.equal(calls,1);finish();await first;
  }finally{globalThis.fetch=previous;}
});
