import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

async function start(options:{hosted?:boolean;large?:boolean;unsafeBackups?:boolean;holdBackupResponse?:boolean}={}){
  const directory=path.resolve('.local/tests/metadata-download-'+crypto.randomUUID()),data=path.join(directory,'data');
  fs.mkdirSync(data,{recursive:true});
  const build=path.join(directory,'ui');fs.mkdirSync(path.join(build,'assets'),{recursive:true});fs.writeFileSync(path.join(build,'index.html'),'<html>Public hosted fixture</html>');fs.writeFileSync(path.join(build,'assets','entry.js'),'console.log("public fixture")');
  // Malformed sentinels are synthetic test data, never actual credential material.
  fs.mkdirSync(path.join(data,'keys'));fs.writeFileSync(path.join(data,'keys','do-not-export.json'),'SYNTHETIC-NONPUBLIC-SENTINEL');
  fs.writeFileSync(path.join(data,'.env'),'SYNTHETIC-NONPUBLIC-SENTINEL');
  if(!options.hosted)fs.writeFileSync(path.join(data,'fixture.json'),JSON.stringify({name:'Public metadata fixture',amount:'18446744073709551615',...(options.large?{padding:'x'.repeat(6*1024*1024)}:{})}));
  if(options.unsafeBackups){const foreign=path.join(directory,'foreign');fs.mkdirSync(foreign);fs.writeFileSync(path.join(foreign,'retain.txt'),'retain');fs.symlinkSync(foreign,path.join(data,'backups'),process.platform==='win32'?'junction':'dir');}
  const reservation=http.createServer();await new Promise<void>(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=(reservation.address() as {port:number}).port;await new Promise<void>(resolve=>reservation.close(()=>resolve()));
  const credentials={user:'synthetic-test',password:'synthetic-test-download-password-123'};
  // Inject a delayed response in this isolated server only, making the transport
  // completion/abort boundary deterministic on fast loopback kernels.
  const hold=`import http from 'node:http';const end=http.ServerResponse.prototype.end;http.ServerResponse.prototype.end=function(...args){if(this.req.url==='/api/metadata/backup'&&this.statusCode===200){this.flushHeaders();setTimeout(()=>{if(!this.destroyed)end.apply(this,args);},2000);return this;}return end.apply(this,args);};await import('./server/index.ts');`;
  const args=options.holdBackupResponse?['--import','tsx','--input-type=module','--eval',hold]:['--import','tsx','server/index.ts'];
  const child=spawn(process.execPath,args,{cwd:process.cwd(),windowsHide:true,env:{...process.env,PORT:String(port),BONDTRACE_DATA_DIR:data,BONDTRACE_WEB_DIST:build,
    BONDTRACE_DEPLOYMENT:options.hosted?'hosted':'local',BONDTRACE_NETWORK:options.hosted?'devnet':'localnet',SOLANA_RPC_URL:options.hosted?'https://api.devnet.solana.com':'http://127.0.0.1:9',BONDTRACE_ENABLE_DEMO:'false',BONDTRACE_STORAGE_BACKEND:options.hosted?'postgres':'sqlite',
    BONDTRACE_PUBLIC_ORIGIN:'https://bondtrace-test.example',BONDTRACE_HTTP_USER:credentials.user,BONDTRACE_HTTP_PASSWORD:credentials.password,
    DATABASE_URL:options.hosted?'postgresql://synthetic:synthetic@127.0.0.1:9/synthetic?sslmode=require':undefined,BONDTRACE_DATABASE_TLS:'verify-full',BONDTRACE_DATABASE_NAMESPACE:'metadata-download-test'}});
  let diagnostics='';child.stdout.resume();child.stderr.on('data',part=>diagnostics+=String(part));
  const stopped=once(child,'close'),origin='http://127.0.0.1:'+port;
  async function close(){if(child.exitCode===null)child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),5000);try{await stopped;}finally{clearTimeout(timer);}}
  try{
    let ready=false;for(let attempt=0;attempt<80;attempt++){if(child.exitCode!==null)break;try{ready=(await fetch(origin+'/healthz',{signal:AbortSignal.timeout(500)})).ok;if(ready)break;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}
    assert.equal(ready,true,diagnostics);
  }catch(error){await close();throw error;}
  const get=(route:string,headers:Record<string,string>={})=>fetch(origin+route,{headers,signal:AbortSignal.timeout(5000)});
  return {directory,data,origin,child,close,get,authorization:'Basic '+Buffer.from(credentials.user+':'+credentials.password).toString('base64')};
}
async function waitClean(data:string){
  const directory=path.join(data,'backups');
  for(let attempt=0;attempt<100;attempt++){if(!fs.existsSync(directory)||fs.readdirSync(directory).length===0)return;await new Promise(resolve=>setTimeout(resolve,30));}
  assert.fail('Owned temporary backup was not cleaned');
}
test('portable HTTP backup contains a consistent verified SQLite and safe manifest without keys or local paths',async()=>{
  const app=await start({large:true});
  try{
    const response=await app.get('/api/metadata/backup',{authorization:app.authorization});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-disposition')??'',/^attachment; filename="bondtrace-metadata-.*\.sqlite\.json"$/);
    const envelope=await response.json();assert.equal(envelope.schema,'bondtrace.metadata-download.v1');assert.equal(envelope.database.encoding,'base64');assert.deepEqual(envelope.manifest.integrityCheck,['ok']);assert.equal(envelope.manifest.source.backend,'sqlite');
    const bytes=Buffer.from(envelope.database.data,'base64'),hash=createHash('sha256').update(bytes).digest('hex');assert.equal(bytes.toString('base64'),envelope.database.data);assert.equal(hash,envelope.manifest.sha256);assert.equal(hash,response.headers.get('x-bondtrace-sqlite-sha256'));assert.equal(bytes.length,envelope.manifest.bytes);assert.equal(bytes.subarray(0,16).toString(),'SQLite format 3\0');
    const serialized=JSON.stringify(envelope);assert.equal(serialized.includes(app.directory),false);assert.equal(serialized.includes('SYNTHETIC-NONPUBLIC-SENTINEL'),false);assert.equal('path' in envelope.manifest,false);assert.equal('path' in envelope.manifest.source,false);
    const input=path.join(app.directory,'portable.json'),output=path.join(app.directory,'unpacked');fs.writeFileSync(input,serialized);
    const unpack=(destination:string)=>spawnSync(process.execPath,['scripts/unpack-metadata-backup.mjs',input,destination],{cwd:process.cwd(),windowsHide:true,encoding:'utf8'});
    const unpacked=unpack(output);assert.equal(unpacked.status,0,unpacked.stderr);assert.equal(JSON.parse(unpacked.stdout).restored,false);assert.deepEqual(fs.readFileSync(path.join(output,'metadata.sqlite')),bytes);
    assert.notEqual(unpack(output).status,0,'An existing backup directory must never be overwritten');
    fs.writeFileSync(input,JSON.stringify({...envelope,manifest:{...envelope.manifest,sha256:'0'.repeat(64)}}));const rejected=path.join(app.directory,'tampered');assert.notEqual(unpack(rejected).status,0);assert.equal(fs.existsSync(rejected),false,'Tampering must fail before writing output');
    const decoded=path.join(app.directory,'download.sqlite');fs.writeFileSync(decoded,bytes,{flag:'wx'});const database=new DatabaseSync(path.toNamespacedPath(decoded),{readOnly:true,allowExtension:false});
    try{assert.equal(database.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');assert.equal(database.prepare('PRAGMA user_version').get()!.user_version,1);const fixture=database.prepare('SELECT body FROM documents WHERE key=?').get('fixture.json');assert.equal(JSON.parse(String(fixture!.body)).amount,'18446744073709551615');assert.equal(database.prepare("SELECT count(*) AS count FROM documents WHERE key LIKE 'keys/%' OR key='.env'").get()!.count,0);}finally{database.close();}
    await waitClean(app.data);assert.equal(fs.readFileSync(path.join(app.data,'keys','do-not-export.json'),'utf8'),'SYNTHETIC-NONPUBLIC-SENTINEL');
    const replay=await app.get('/api/metadata/backup');assert.equal(replay.status,200);await replay.arrayBuffer();await waitClean(app.data);
  }finally{await app.close();}
});
test('hosted HTTP protects operator backup and readiness while ordinary application routes stay public',async()=>{
  const app=await start({hosted:true});
  try{
    assert.deepEqual(await(await app.get('/healthz')).json(),{status:'alive'});
    const html=await app.get('/');assert.equal(html.status,200);assert.equal(html.headers.has('www-authenticate'),false);assert.match(await html.text(),/Public hosted fixture/);
    const staleLogin=await app.get('/',{authorization:'Basic stale-browser-login'});assert.equal(staleLogin.status,200);assert.equal(staleLogin.headers.has('www-authenticate'),false);
    const asset=await app.get('/assets/entry.js');assert.equal(asset.status,200);assert.equal(asset.headers.has('www-authenticate'),false);assert.match(await asset.text(),/public fixture/);
    const invalidReference=await app.get('/api/operations/x');assert.equal(invalidReference.status,400);assert.equal((await invalidReference.json()).error.code,'INVALID_OPERATION_ID');assert.equal(invalidReference.headers.has('www-authenticate'),false);
    for(const authorization of [undefined,'Basic !!!','Basic '+Buffer.from('synthetic:wrong').toString('base64')]){
      const response=await app.get('/api/metadata/backup',authorization?{authorization}:{});assert.equal(response.status,401);assert.match(response.headers.get('www-authenticate')??'',/^Basic /);assert.equal((await response.json()).error.code,'AUTH_REQUIRED');
    }
    const readiness=await fetch(app.origin+'/api/runtime/readiness',{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)});assert.equal(readiness.status,401);assert.equal((await readiness.json()).error.code,'AUTH_REQUIRED');
    // Authenticated input rejection happens before opening any remote database.
    const authenticated=await app.get('/api/metadata/backup?file=anything',{authorization:app.authorization});assert.equal(authenticated.status,400);assert.equal((await authenticated.json()).error.code,'INVALID_REQUEST');
    assert.equal(fs.existsSync(path.join(app.data,'backups')),false);assert.equal(fs.existsSync(path.join(app.data,'metadata.sqlite')),false);
  }finally{await app.close();}
});
test('public hosted transaction routes retain origin, demo and unsigned-message rejection without HTTP passwords',async()=>{
  const app=await start({hosted:true});
  const post=(route:string,value:unknown,origin='https://bondtrace-test.example')=>fetch(app.origin+route,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(value),signal:AbortSignal.timeout(5000)});
  try{
    const foreign=await post('/api/actions/prepare',{},'https://foreign.invalid');assert.equal(foreign.status,403);assert.equal((await foreign.json()).error.code,'ORIGIN_DENIED');
    const demo=await post('/api/demo/bootstrap',{operationId:'public-demo-rejection'});assert.equal(demo.status,403);assert.equal((await demo.json()).error.code,'DEMO_DISABLED');
    const malformed=await post('/api/transactions/submit',{signedTransactionBase64:'!!!'});assert.equal(malformed.status,400);assert.equal((await malformed.json()).error.code,'INVALID_TRANSACTION');
    const unsigned=await post('/api/transactions/submit',{});assert.equal(unsigned.status,400);assert.equal((await unsigned.json()).error.code,'INVALID_TRANSACTION');
    for(const response of [foreign,demo,malformed,unsigned])assert.equal(response.headers.has('www-authenticate'),false);
    assert.equal(fs.existsSync(path.join(app.data,'metadata.sqlite')),false);assert.equal(fs.existsSync(path.join(app.data,'backups')),false);
  }finally{await app.close();}
});
test('backup rejects user paths and foreign origins before touching export scratch',async()=>{
  const app=await start();
  try{
    for(const route of ['/api/metadata/backup?path=../../keys','/api/metadata/backup?download=true']){const response=await app.get(route);assert.equal(response.status,400);assert.equal((await response.json()).error.code,'INVALID_REQUEST');}
    const crossOrigin=await app.get('/api/metadata/backup',{origin:'https://foreign.example'});assert.equal(crossOrigin.status,403);
    const crossSite=await app.get('/api/metadata/backup',{'sec-fetch-site':'cross-site'});assert.equal(crossSite.status,403);assert.equal(fs.existsSync(path.join(app.data,'backups')),false);
  }finally{await app.close();}
});
test('one in-flight backup holds its bound until client abort and cleans only its generated files',async()=>{
  const app=await start({holdBackupResponse:true});let download:http.IncomingMessage|undefined,request:http.ClientRequest|undefined;
  try{
    download=await new Promise<http.IncomingMessage>((resolve,reject)=>{request=http.get(app.origin+'/api/metadata/backup',response=>{response.pause();response.socket.pause();resolve(response);});request.on('error',reject);});assert.equal(download.statusCode,200);
    const conflict=await app.get('/api/metadata/backup');assert.equal(conflict.status,409);assert.equal((await conflict.json()).error.code,'BACKUP_PENDING');
    const backups=path.join(app.data,'backups');assert.equal(fs.readdirSync(backups).length,1);
    download.destroy();request?.destroy();await waitClean(app.data);
    assert.equal(fs.readFileSync(path.join(app.data,'keys','do-not-export.json'),'utf8'),'SYNTHETIC-NONPUBLIC-SENTINEL');
  }finally{download?.destroy();request?.destroy();await app.close();}
});
test('linked backup directory is rejected without exporting or deleting a foreign file',async()=>{
  const app=await start({unsafeBackups:true});
  try{const response=await app.get('/api/metadata/backup');assert.equal(response.status,503);assert.equal((await response.json()).error.code,'BACKUP_PATH_UNSAFE');assert.deepEqual(fs.readdirSync(path.join(app.directory,'foreign')),['retain.txt']);}
  finally{await app.close();}
});
