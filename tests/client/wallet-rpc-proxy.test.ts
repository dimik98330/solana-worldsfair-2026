import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createWalletRpcProxy,walletRpcRead,walletRpcTarget} from '../../scripts/wallet-rpc-proxy.mjs';

test('wallet RPC alias cannot target an external service or URL credentials',()=>{
 assert.equal(walletRpcTarget('http://127.0.0.1:8959'),'http://127.0.0.1:8959');
 for(const value of ['https://api.mainnet-beta.solana.com','http://user:password@127.0.0.1:8959','http://127.0.0.1:8959/private','http://127.0.0.1:8959/?target=other'])assert.throws(()=>walletRpcTarget(value));
});
test('wallet RPC alias permits reads/simulation and blocks every mutation',()=>{
 for(const name of ['getGenesisHash','getBalance','getLatestBlockhash','getFeeForMessage','simulateTransaction'])assert.equal(walletRpcRead(name),true);
 for(const name of ['sendTransaction','requestAirdrop','sendRawTransaction','reset',null,{},'getBalance;sendTransaction'])assert.equal(walletRpcRead(name),false);
});
test('wallet RPC alias forwards an actual read but never dispatches a mutation upstream',async()=>{
 const seen:string[]=[];
 const upstream=http.createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;const value=JSON.parse(body);seen.push(value.method);res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:value.id,result:'synthetic-genesis'}));});
 await new Promise<void>(r=>upstream.listen(0,'127.0.0.1',r));
 const upstreamPort=(upstream.address() as {port:number}).port;
 const proxy=createWalletRpcProxy('http://127.0.0.1:'+upstreamPort);await new Promise<void>(r=>proxy.listen(0,'127.0.0.1',r));
 const port=(proxy.address() as {port:number}).port;
 try{
  const call=(method:string)=>fetch('http://127.0.0.1:'+port,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method})});
  const read=await call('getGenesisHash');assert.equal((await read.json()).result,'synthetic-genesis');
  assert.equal((await call('sendTransaction')).status,403);assert.deepEqual(seen,['getGenesisHash']);
 }finally{proxy.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise<void>(r=>proxy.close(()=>r())),new Promise<void>(r=>upstream.close(()=>r()))]);}
});
test('wallet RPC alias refuses redirects instead of following a second endpoint',async()=>{
 let redirectedRequests=0;
 const destination=http.createServer((_req,res)=>{redirectedRequests++;res.end('{}');});
 await new Promise<void>(r=>destination.listen(0,'127.0.0.1',r));
 const targetPort=(destination.address() as {port:number}).port;
 const upstream=http.createServer((_req,res)=>{res.writeHead(307,{location:'http://127.0.0.1:'+targetPort});res.end();});
 await new Promise<void>(r=>upstream.listen(0,'127.0.0.1',r));
 const proxy=createWalletRpcProxy('http://127.0.0.1:'+(upstream.address() as {port:number}).port);
 await new Promise<void>(r=>proxy.listen(0,'127.0.0.1',r));
 try{
  const response=await fetch('http://127.0.0.1:'+(proxy.address() as {port:number}).port,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getGenesisHash'})});
  assert.equal(response.status,503);assert.equal(redirectedRequests,0);
 }finally{
  for(const server of [proxy,upstream,destination])server.closeAllConnections();
  await Promise.all([proxy,upstream,destination].map(server=>new Promise<void>(r=>server.close(()=>r()))));
 }
});
