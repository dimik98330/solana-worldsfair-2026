import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export function walletRpcTarget(value){
 const url=new URL(value);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!url.port)throw new Error('Wallet RPC target must be an explicit loopback HTTP endpoint');
 return url.origin;
}
export function walletRpcRead(method){return typeof method==='string'&&(/^get[A-Z][A-Za-z0-9]*$/.test(method)||method==='simulateTransaction');}
export function createWalletRpcProxy(target){
 target=walletRpcTarget(target);
 return http.createServer(async(req,res)=>{
  const headers={'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'content-type','access-control-allow-methods':'POST, OPTIONS','cache-control':'no-store'};
  if(req.method==='OPTIONS'){res.writeHead(204,headers);res.end();return;}
  const reply=(status,value)=>{res.writeHead(status,headers);res.end(JSON.stringify(value));};
  if(req.method!=='POST'||req.url!=='/'){reply(404,{error:'Read-only local wallet RPC'});return;}
  let bytes=0;const parts=[];
  try{
   for await(const chunk of req){bytes+=chunk.length;if(bytes>65000){reply(413,{error:'Request too large'});return;}parts.push(chunk);}
   const body=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts));
   const input=JSON.parse(body),requests=Array.isArray(input)?input:[input];
   if(!requests.length||requests.length>20||requests.some(item=>!item||item.jsonrpc!=='2.0'||!walletRpcRead(item.method))){reply(403,{jsonrpc:'2.0',id:input?.id??null,error:{code:-32601,message:'Only reads and simulation are permitted; submit reviewed signed bytes through the application'}});return;}
   const upstream=await fetch(target,{method:'POST',headers:{'content-type':'application/json'},body,redirect:'error',signal:AbortSignal.timeout(15000)});
   const output=await upstream.text();res.writeHead(upstream.status,headers);res.end(output);
  }catch{reply(503,{jsonrpc:'2.0',id:null,error:{code:-32000,message:'Local wallet RPC is unavailable'}});}
 });
}
async function main(){
 const release=JSON.parse(fs.readFileSync('programs/bondtrace/release.json','utf8'));
 const directory=path.resolve('.local/backend-execution',release.sha256.slice(0,12));
 const runtime=JSON.parse(fs.readFileSync(path.join(directory,'runtime.json'),'utf8'));
 const target=walletRpcTarget(runtime.rpcUrl);
 const response=await fetch(target,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getGenesisHash'}),redirect:'error',signal:AbortSignal.timeout(5000)}).then(r=>r.json());
 if(response.result!==runtime.genesisHash||runtime.programSha256!==release.sha256)throw new Error('Wallet RPC alias ledger/release binding failed');
 if(new URL(target).port==='8899')throw new Error('Validator already uses the standard wallet port; no alias required');
 const server=createWalletRpcProxy(target);
 server.once('error',()=>{process.stderr.write('Wallet port8899 is occupied or unavailable; no process was stopped\n');process.exitCode=1;});
 server.listen(8899,'127.0.0.1',()=>console.log(JSON.stringify({walletRpc:'http://127.0.0.1:8899',validatorRpc:target,genesisHash:runtime.genesisHash,readOnly:true})));
 process.once('SIGINT',()=>server.close());process.once('SIGTERM',()=>server.close());
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
