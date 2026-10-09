import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';

test('core RPC refuses redirect before disclosing a reviewed transaction to another endpoint',async()=>{
 let received=0;
 const destination=http.createServer((_req,res)=>{received++;res.end('{}');});
 await new Promise<void>(r=>destination.listen(0,'127.0.0.1',r));
 const upstream=http.createServer((_req,res)=>{res.writeHead(307,{location:'http://127.0.0.1:'+(destination.address() as {port:number}).port});res.end();});
 await new Promise<void>(r=>upstream.listen(0,'127.0.0.1',r));
 process.env.BONDTRACE_DATA_DIR=path.resolve('.local/tests/core-rpc-redirect-'+crypto.randomUUID());
 process.env.SOLANA_RPC_URL='http://127.0.0.1:'+(upstream.address() as {port:number}).port;
 const {rpc,AppError}=await import('../../server/rpc.ts');
 try{
  await assert.rejects(()=>rpc('sendTransaction',['synthetic-reviewed-bytes']),e=>e instanceof AppError&&e.code==='RPC_UNAVAILABLE');
  assert.equal(received,0);
 }finally{for(const server of [upstream,destination])server.closeAllConnections();await Promise.all([upstream,destination].map(s=>new Promise<void>(r=>s.close(()=>r()))));}
});
