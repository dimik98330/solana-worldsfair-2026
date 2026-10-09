import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRpcControl,RpcControlError} from '../../server/rpc-control.ts';

const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
class Clock {
  time=0;
  private tasks=new Set<{at:number;finish:()=>void}>();
  now=()=>this.time;
  delay=(ms:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
    const cleanup=()=>{this.tasks.delete(task);signal.removeEventListener('abort',abort);};
    const abort=()=>{cleanup();reject(new Error('Aborted'));};
    const task={at:this.time+ms,finish:()=>{cleanup();resolve();}};
    if(signal.aborted){reject(new Error('Aborted'));return;}
    this.tasks.add(task);signal.addEventListener('abort',abort,{once:true});
  });
  async advance(ms:number){
    const target=this.time+ms;
    await flush();
    for(;;){
      const next=[...this.tasks].filter(task=>task.at<=target).sort((a,b)=>a.at-b.at)[0];
      if(!next)break;
      this.time=next.at;next.finish();await flush();
    }
    this.time=target;await flush();
  }
  get timers(){return this.tasks.size;}
}
type Call={method:string;id:number;body:string;at:number;signal:AbortSignal;redirect:RequestRedirect|undefined};
function harness(respond:(call:Call)=>Response|Promise<Response>=()=>Response.json({ok:true})){
  const clock=new Clock(),calls:Call[]=[];
  const control=createRpcControl({now:clock.now,delay:clock.delay,fetch:async(_url,init)=>{
    const body=String(init?.body),parsed=JSON.parse(body);
    const call={method:parsed.method,id:parsed.id,body,at:clock.time,signal:init!.signal!,redirect:init?.redirect};
    calls.push(call);return respond(call);
  }});
  const request=(method:string,id:number,options:{network?:string;timeoutMs?:number;beforeSend?:()=>void;params?:unknown[]}={})=>control.request({
    network:options.network??'devnet',url:'https://api.devnet.solana.com',method,
    body:JSON.stringify({jsonrpc:'2.0',id,method,params:options.params??[]}),
    timeoutMs:options.timeoutMs??18000,beforeSend:options.beforeSend,
  },async response=>{if(!response.ok)throw new Error('HTTP '+response.status);return response.json();});
  return {clock,calls,request};
}
function limited(retryAfter?:string,onCancel=()=>{}){
  return new Response(new ReadableStream<Uint8Array>({cancel:onCancel}),{
    status:429,headers:retryAfter===undefined?{}:{'retry-after':retryAfter},
  });
}
const timeout=(error:unknown)=>error instanceof RpcControlError&&error.code==='RPC_UNAVAILABLE'&&error.retryable;

test('concurrent devnet consumers share global and per-method pacing in FIFO order',async()=>{
  const h=harness();
  const work=[h.request('getAccountInfo',1),h.request('getSlot',2),h.request('getAccountInfo',3),h.request('getGenesisHash',4)];
  await h.clock.advance(1500);await Promise.all(work);
  assert.deepEqual(h.calls.map(call=>[call.id,call.at]),[[1,0],[2,250],[3,1250],[4,1500]]);
  assert.ok(h.calls.every(call=>call.redirect==='error'));
  assert.equal(h.clock.timers,0);
});

test('devnet bounds admitted work at 64, rejects overflow, then releases capacity',async()=>{
  const h=harness();
  const work=Array.from({length:64},(_,i)=>h.request('known-caller-method-'+i,i));
  await assert.rejects(h.request('getSlot',65),error=>error instanceof RpcControlError&&error.code==='RPC_BUSY'&&error.retryable);
  await h.clock.advance(16000);await Promise.all(work);
  assert.equal(h.calls.length,64);assert.ok(!h.calls.some(call=>call.id===65));
  await h.request('getSlot',66);assert.equal(h.calls.at(-1)?.id,66);
  assert.equal(h.clock.timers,0);
});

test('a short queued deadline expires without waiting for the older FIFO head',async()=>{
  const h=harness();
  const first=h.request('getAccountInfo',1),second=h.request('getAccountInfo',2);
  const expired=assert.rejects(h.request('getSlot',3,{timeoutMs:100}),timeout);
  await h.clock.advance(100);await expired;
  assert.deepEqual(h.calls.map(call=>call.id),[1]);
  await h.clock.advance(1150);await Promise.all([first,second]);
  assert.deepEqual(h.calls.map(call=>[call.id,call.at]),[[1,0],[2,1250]]);
  assert.equal(h.clock.timers,0);
});

test('whitelisted read retries 429 at most twice with unchanged ID, params and cancelled bodies',async()=>{
  let attempts=0,cancelled=0;
  const h=harness(()=>++attempts<3?limited(attempts===1?'1':'2',()=>cancelled++):Response.json({value:'9007199254740993'}));
  const request=h.request('getAccountInfo',19,{params:['public-account',{encoding:'base64',commitment:'confirmed'}]});
  await h.clock.advance(3250);
  assert.deepEqual(await request,{value:'9007199254740993'});
  assert.deepEqual(h.calls.map(call=>call.at),[0,1250,3250]);
  assert.equal(new Set(h.calls.map(call=>call.body)).size,1);
  assert.equal(cancelled,2);assert.equal(h.clock.timers,0);
});

test('retries stop after three read HTTP attempts and retain final 429 as failure',async()=>{
  let cancelled=0;const h=harness(()=>limited(undefined,()=>cancelled++));
  const result=assert.rejects(h.request('simulateTransaction',1,{params:['same-synthetic-wire',{sigVerify:false}]}),/HTTP 429/);
  await h.clock.advance(4000);await result;
  assert.deepEqual(h.calls.map(call=>call.at),[0,2000,4000]);
  assert.equal(cancelled,3);assert.equal(h.clock.timers,0);
});

test('sendTransaction and unknown methods have exactly one HTTP attempt after 429',async()=>{
  for(const method of ['sendTransaction','requestAirdrop','getUnknownPotentialWrite']){
    let cancelled=0;const h=harness(()=>limited(undefined,()=>cancelled++));
    await assert.rejects(h.request(method,1,{params:['same-signed-wire',{encoding:'base64',maxRetries:2}]}),/HTTP 429/);
    await h.clock.advance(6000);
    assert.equal(h.calls.length,1,method);assert.equal(cancelled,1);
    assert.equal(JSON.parse(h.calls[0].body).params[1].maxRetries,2);
    assert.equal(h.clock.timers,0);
  }
});

test('429 shared cooldown also delays other already queued methods; retry joins the tail',async()=>{
  const h=harness(call=>call.id===1&&call.at===0?limited('3'):Response.json({ok:true}));
  const first=h.request('getAccountInfo',1),second=h.request('getSlot',2);
  await h.clock.advance(2999);assert.equal(h.calls.length,1);
  await h.clock.advance(251);await Promise.all([first,second]);
  assert.deepEqual(h.calls.map(call=>[call.id,call.at]),[[1,0],[2,3000],[1,3250]]);
});

test('send 429 also imposes shared cooldown without retrying its signed wire',async()=>{
  const h=harness(call=>call.id===1?limited():Response.json({ok:true}));
  await assert.rejects(h.request('sendTransaction',1),/HTTP 429/);
  const read=h.request('getSlot',2);
  await h.clock.advance(1999);assert.equal(h.calls.length,1);
  await h.clock.advance(1);await read;
  assert.deepEqual(h.calls.map(call=>[call.id,call.at]),[[1,0],[2,2000]]);
});

test('storage generation is checked after queue wait immediately before send; stale sender never fetches',async()=>{
  let generation=7,guardCalls=0;
  const fenced=new Error('Storage generation changed'),h=harness();
  const first=h.request('getSlot',1);
  const send=assert.rejects(h.request('sendTransaction',2,{beforeSend:()=>{guardCalls++;if(generation!==7)throw fenced;}}),error=>error===fenced);
  await flush();assert.equal(guardCalls,0);
  generation=8;
  await h.clock.advance(250);await Promise.all([first,send]);
  assert.equal(guardCalls,1);assert.deepEqual(h.calls.map(call=>call.id),[1]);
  assert.equal(h.clock.timers,0);
});

test('Retry-After date is honoured and a longer cooldown cannot outlive request deadline',async()=>{
  const dated=harness(call=>call.at===0?limited(new Date(3000).toUTCString()):Response.json({ok:true}));
  const ready=dated.request('getSlot',1);await dated.clock.advance(3000);await ready;
  assert.deepEqual(dated.calls.map(call=>call.at),[0,3000]);
  const capped=harness(()=>limited('999999999999999999999999999999999999999999999999999999'));
  const expired=assert.rejects(capped.request('getSlot',2,{timeoutMs:500}),timeout);
  await capped.clock.advance(500);await expired;
  assert.equal(capped.calls.length,1);assert.equal(capped.clock.timers,0);
});

test('deadline includes a stalled response consumer, and transport/HTTP errors do not retry',async()=>{
  const stalled=harness(()=>new Response(new ReadableStream<Uint8Array>({})));
  const expired=assert.rejects(stalled.request('getSlot',1,{timeoutMs:100}),timeout);
  await stalled.clock.advance(100);await expired;assert.equal(stalled.calls.length,1);
  assert.equal(stalled.calls[0].signal.aborted,true);assert.equal(stalled.clock.timers,0);
  for(const respond of [()=>{throw new Error('Private transport detail');},()=>new Response(null,{status:500})]){
    const h=harness(respond);await assert.rejects(h.request('getSlot',2));
    await h.clock.advance(6000);assert.equal(h.calls.length,1);assert.equal(h.clock.timers,0);
  }
});

test('localnet fixtures bypass pacing, queue bounds and 429 retries',async()=>{
  const h=harness(call=>call.id===70?limited():Response.json({ok:true}));
  await Promise.all(Array.from({length:70},(_,id)=>h.request('getAccountInfo',id,{network:'localnet'})));
  await assert.rejects(h.request('getAccountInfo',70,{network:'localnet'}),/HTTP 429/);
  assert.equal(h.calls.length,71);assert.ok(h.calls.every(call=>call.at===0));
  assert.equal(h.clock.timers,0);
});
