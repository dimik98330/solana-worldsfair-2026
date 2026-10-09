import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('real HTTP server rejects absent JS/CSS assets and retains ordinary SPA navigation',async()=>{
 const directory=path.resolve('.local/tests/static-http-'+crypto.randomUUID()),build=path.join(directory,'ui');fs.mkdirSync(path.join(build,'assets'),{recursive:true});
 fs.writeFileSync(path.join(build,'index.html'),'<html>Static fixture</html>');fs.writeFileSync(path.join(build,'assets','entry.js'),'console.log(1)');
 const reservation=http.createServer();await new Promise<void>(r=>reservation.listen(0,'127.0.0.1',r));const port=(reservation.address() as {port:number}).port;await new Promise<void>(r=>reservation.close(()=>r()));
 const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:process.cwd(),windowsHide:true,env:{...process.env,PORT:String(port),BONDTRACE_DEPLOYMENT:'local',BONDTRACE_NETWORK:'localnet',SOLANA_RPC_URL:'http://127.0.0.1:8899',BONDTRACE_ENABLE_DEMO:'false',BONDTRACE_DATA_DIR:path.join(directory,'data'),BONDTRACE_WEB_DIST:build}});
 let diagnostics='';child.stderr.on('data',part=>diagnostics+=String(part));child.stdout.resume();
 const closed=once(child,'close');
 try{
  let ready=false;for(let i=0;i<60;i++){if(child.exitCode!==null)break;try{ready=(await fetch('http://127.0.0.1:'+port+'/healthz',{signal:AbortSignal.timeout(500)})).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.equal(ready,true,diagnostics);
  const get=(route:string)=>fetch('http://127.0.0.1:'+port+route,{signal:AbortSignal.timeout(1000)});
  assert.equal((await get('/')).status,200);assert.equal((await get('/issuer/review')).status,200);
  const script=await get('/assets/entry.js');assert.equal(script.status,200);assert.match(script.headers.get('content-type')??'',/^text\/javascript/);
  for(const route of ['/assets/missing.js','/assets/missing.css','/missing.json'])assert.equal((await get(route)).status,404,route);
 }finally{child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),10000);try{await closed;}finally{clearTimeout(timer);}}
});
