import {setTimeout as sleep} from 'node:timers/promises';

// This is process-wide outbound backpressure for the single devnet API writer,
// not an inbound abuse limiter or a promise of the public provider's capacity.
const GLOBAL_GAP_MS=250;
const METHOD_GAP_MS=1250;
const MAX_PENDING=64;
const MAX_READ_RETRIES=2;
const readOnlyMethods=new Set([
  'getAccountInfo','getBalance','getBlockHeight','getFeeForMessage','getGenesisHash',
  'getHealth','getLatestBlockhash','getMinimumBalanceForRentExemption',
  'getMultipleAccounts','getProgramAccounts','getSignatureStatuses','getSlot',
  'getTokenAccountBalance','getTokenSupply','getTransaction','isBlockhashValid',
  'simulateTransaction',
]);

export class RpcControlError extends Error {
  readonly status=503;
  readonly retryable=true;
  constructor(readonly code:'RPC_UNAVAILABLE'|'RPC_BUSY',message:string){super(message);}
}
const unavailable=()=>new RpcControlError('RPC_UNAVAILABLE','The configured test RPC did not respond');

type Delay=(ms:number,signal:AbortSignal)=>Promise<void>;
type RpcRequest={network:string;url:string;method:string;body:string;timeoutMs:number;beforeSend?:()=>void};
type Ticket={method:string;deadline:number;signal:AbortSignal;beforeSend?:()=>void;start:()=>Promise<Response>;resolve:(value:Promise<Response>)=>void;reject:(reason:unknown)=>void;abort:()=>void};
type Dependencies={now?:()=>number;delay?:Delay;fetch?:typeof globalThis.fetch};

function abortable<T>(operation:Promise<T>,signal:AbortSignal):Promise<T>{
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(unavailable());
    if(signal.aborted){reject(unavailable());return;}
    signal.addEventListener('abort',abort,{once:true});
    operation.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}

function retryAfterMs(response:Response,now:number,remaining:number){
  const header=response.headers.get('retry-after')?.trim();
  let wait=2000;
  if(header){
    if(/^\d+(?:\.\d+)?$/.test(header))wait=Number(header)*1000;
    else {const date=Date.parse(header);if(Number.isFinite(date))wait=Math.max(0,date-now);}
  }
  return Math.min(wait,Math.max(0,remaining));
}

export function createRpcControl(dependencies:Dependencies={}){
  const now=dependencies.now??Date.now;
  const delay:Delay=dependencies.delay??(async(ms,signal)=>{await sleep(ms,undefined,{signal});});
  // Resolve global fetch at call time so existing isolated transport fixtures work.
  const fetchRpc:typeof globalThis.fetch=dependencies.fetch??((...args)=>globalThis.fetch(...args));
  const queue:Ticket[]=[];
  const nextMethod=new Map<string,number>();
  let nextGlobal=0,cooldownUntil=0,pending=0,pumping=false;

  async function pump(){
    if(pumping)return;
    pumping=true;
    try{
      while(queue.length){
        const ticket=queue[0];
        if(ticket.signal.aborted||now()>=ticket.deadline){ticket.abort();continue;}
        const wait=Math.max(nextGlobal,nextMethod.get(ticket.method)??0,cooldownUntil)-now();
        if(wait>0){
          try{await delay(Math.min(wait,ticket.deadline-now()),ticket.signal);}catch{ticket.abort();}
          continue; // A concurrent 429 may have extended the shared cooldown.
        }
        queue.shift();ticket.signal.removeEventListener('abort',ticket.abort);
        try{
          // No await between the fresh storage generation fence and fetch start.
          ticket.beforeSend?.();
          if(ticket.signal.aborted||now()>=ticket.deadline)throw unavailable();
          const started=now();
          nextGlobal=started+GLOBAL_GAP_MS;
          for(const [method,time]of nextMethod)if(time<=started)nextMethod.delete(method);
          nextMethod.set(ticket.method,started+METHOD_GAP_MS);
          ticket.resolve(ticket.start());
        }catch(error){ticket.reject(error);}
      }
    }finally{pumping=false;}
  }

  function schedule(request:RpcRequest,deadline:number,signal:AbortSignal,start:()=>Promise<Response>){
    return new Promise<Response>((resolve,reject)=>{
      const ticket:Ticket={method:request.method,deadline,signal,beforeSend:request.beforeSend,start,resolve,reject,abort:()=>{
        const index=queue.indexOf(ticket);if(index>=0)queue.splice(index,1);
        signal.removeEventListener('abort',ticket.abort);reject(unavailable());
      }};
      if(signal.aborted){reject(unavailable());return;}
      queue.push(ticket);signal.addEventListener('abort',ticket.abort,{once:true});void pump();
    });
  }

  return {
    async request<T>(request:RpcRequest,consume:(response:Response)=>Promise<T>):Promise<T>{
      const controlled=request.network==='devnet';
      if(controlled&&pending>=MAX_PENDING)throw new RpcControlError('RPC_BUSY','The test RPC queue is full. Retain the existing recovery identifier and try again later.');
      if(!Number.isSafeInteger(request.timeoutMs)||request.timeoutMs<=0)throw unavailable();
      if(controlled)pending++;
      const deadline=now()+request.timeoutMs,abort=new AbortController(),stopTimer=new AbortController();
      void delay(request.timeoutMs,stopTimer.signal).then(()=>abort.abort(),()=>{});
      const start=()=>{
        try{return fetchRpc(request.url,{method:'POST',headers:{'content-type':'application/json'},body:request.body,redirect:'error',signal:abort.signal})
          .catch(()=>{throw unavailable();});}catch{throw unavailable();}
      };
      const execute=async()=>{
        for(let retries=0;;retries++){
          let response:Response;
          if(controlled)response=await schedule(request,deadline,abort.signal,start);
          else {request.beforeSend?.();response=await start();}
          if(abort.signal.aborted||now()>=deadline){try{await response.body?.cancel();}catch{}throw unavailable();}
          if(response.status===429&&controlled)cooldownUntil=Math.max(cooldownUntil,now()+retryAfterMs(response,now(),deadline-now()));
          if(!response.ok){try{await response.body?.cancel();}catch{}}
          if(response.status===429&&controlled&&readOnlyMethods.has(request.method)&&retries<MAX_READ_RETRIES)continue;
          return consume(response);
        }
      };
      try{return await abortable(execute(),abort.signal);}
      finally{stopTimer.abort();abort.abort();if(controlled)pending--;}
    },
  };
}
