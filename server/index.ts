import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {demoEnabled,port,hosting,localDir,storageBackend} from './config.ts';
import {AppError,transactionStatus,rpc} from './rpc.ts';
import {getState} from './state.ts';
import {buildEvidenceReport} from './evidence.ts';
import {getProgramIdentity} from './program-identity.ts';
import {runCouponSettlement} from './coupon-run.ts';
import {planLifecycleRun,runLifecycle,lifecycleRunStatus} from './lifecycle-run.ts';
import {resolveStaticBuild,staticAssetInside} from './static-build.ts';
import {hostingAuthorized} from './hosting-policy.ts';
import {receipt} from './journal.ts';
import {captureRetainedProof,publicExecutionProof} from './proof-retention.ts';
import {bootstrap} from './seed.ts';
import {demoAction,prepareAction} from './actions.ts';
import {submitPrepared} from './transactions.ts';
import {rebroadcastTransaction} from './rebroadcast.ts';
import {operationStatus} from './operations.ts';
import {chainIdentity} from './chain-identity.ts';
import {storageDiagnostics,StorageError,closeStorage,verifyStorageWrite,backupStorage} from './storage.ts';
const dist=resolveStaticBuild(process.cwd(),process.env.BONDTRACE_WEB_DIST);
const allowedOrigins=new Set(hosting.publicOrigin?[hosting.publicOrigin]:[`http://127.0.0.1:${port}`,`http://localhost:${port}`,'http://127.0.0.1:5173','http://localhost:5173']);
let mutationBusy=false;
async function mutate<T>(action:()=>Promise<T>){if(mutationBusy)throw new AppError('ACTION_PENDING','Wait for the existing test operation',409);mutationBusy=true;try{return await action();}finally{mutationBusy=false;}}
function send(res:http.ServerResponse,status:number,value:unknown){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value,(_key,item)=>typeof item==='bigint'?item.toString():item));}
async function body(req:http.IncomingMessage){if(String(req.headers['content-type']??'').split(';')[0].trim().toLowerCase()!=='application/json')throw new AppError('CONTENT_TYPE','Use application/json',415);const parts:Buffer[]=[];let bytes=0;for await(const chunk of req){const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=part.length;if(bytes>65000)throw new AppError('BODY_TOO_LARGE','Request exceeds the 65000-byte limit',413);parts.push(part);}try{const data=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)),value=data?JSON.parse(data):{};if(value===null||typeof value!=='object'||Array.isArray(value))throw new AppError('INVALID_REQUEST','Expected a JSON object');return value;}catch(error){if(error instanceof AppError)throw error;throw new AppError('INVALID_JSON','Use a well-formed UTF-8 JSON body');}}
function recoveryId(data:Record<string,unknown>){if(data.operationId!==undefined&&data.requestId!==undefined&&data.operationId!==data.requestId)throw new AppError('PARAMETER_CONFLICT','Recovery identifiers disagree');if((data.operationId!==undefined&&typeof data.operationId!=='string')||(data.requestId!==undefined&&typeof data.requestId!=='string'))throw new AppError('INVALID_OPERATION_ID','Recovery identifiers must be strings');const id=data.operationId??data.requestId;if(typeof id!=='string')throw new AppError('MISSING_OPERATION_ID','Generate and retain a recovery identifier before submitting a demo request');return id;}
const maximumBackupBytes=32*1024*1024,maximumExportBytes=64*1024*1024;
let backupBusy=false;
function safeBackupDirectory(directory:string){
  const relative=path.relative(path.resolve(localDir),directory);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new AppError('BACKUP_PATH_UNSAFE','Public metadata export storage is unavailable',503);
  let current=path.parse(directory).root;
  for(const segment of directory.slice(current.length).split(path.sep).filter(Boolean)){
    current=path.join(current,segment);const stat=fs.lstatSync(path.toNamespacedPath(current));
    if(stat.isSymbolicLink()||!stat.isDirectory())throw new AppError('BACKUP_PATH_UNSAFE','Public metadata export requires regular scratch directories',503);
  }
}
/** One authenticated portable response; generated scratch artifacts never become durable backups. */
function downloadMetadataBackup(req:http.IncomingMessage,res:http.ServerResponse,url:URL){
  if(url.search)throw new AppError('INVALID_REQUEST','Metadata backup accepts no query parameters');
  if(req.headers.origin&&!allowedOrigins.has(req.headers.origin))throw new AppError('ORIGIN_DENIED','Use the configured BondTrace application origin',403);
  if(req.headers['sec-fetch-site']==='cross-site')throw new AppError('ORIGIN_DENIED','Metadata export requires the configured application origin',403);
  if(req.headers['content-length']!==undefined||req.headers['transfer-encoding']!==undefined)throw new AppError('INVALID_REQUEST','Metadata backup accepts no request body');
  if(backupBusy)throw new AppError('BACKUP_PENDING','Wait for the existing metadata download to finish',409);
  backupBusy=true;
  const deadline=setTimeout(()=>res.destroy(),30000);deadline.unref();
  let directory:string|undefined,owned:fs.Stats|undefined,finished=false;
  const cleanup=()=>{
    if(finished)return;finished=true;clearTimeout(deadline);
    try{
      if(!directory||!owned)return;
      safeBackupDirectory(directory);
      const current=fs.lstatSync(path.toNamespacedPath(directory));
      if(current.ino!==owned.ino||current.dev!==owned.dev)return;
      // Never recurse: remove only files created by this exact backup operation.
      for(const name of ['snapshot.sqlite','snapshot.sqlite.manifest.json','snapshot.sqlite-journal','snapshot.sqlite-wal','snapshot.sqlite-shm']){
        const file=path.join(directory,name);let stat:fs.Stats;
        try{stat=fs.lstatSync(path.toNamespacedPath(file));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
        if(stat.isSymbolicLink()||!stat.isFile())return;
        fs.unlinkSync(path.toNamespacedPath(file));
      }
      fs.rmdirSync(path.toNamespacedPath(directory));
    }catch{/* Preserve an unverifiable or changed directory; never delete an unrelated path. */}
    finally{backupBusy=false;}
  };
  res.once('finish',cleanup);res.once('close',cleanup);
  try{
    const backups=path.resolve(localDir,'backups');
    // Check existing ancestors before making the fixed backup directory.
    let ancestor=backups;while(!fs.existsSync(path.toNamespacedPath(ancestor)))ancestor=path.dirname(ancestor);
    safeBackupDirectory(ancestor);
    fs.mkdirSync(path.toNamespacedPath(backups),{recursive:true});safeBackupDirectory(backups);
    directory=path.join(backups,'http-export-'+crypto.randomUUID());fs.mkdirSync(path.toNamespacedPath(directory),{mode:0o700});safeBackupDirectory(directory);owned=fs.lstatSync(path.toNamespacedPath(directory));
    const location=path.join(directory,'snapshot.sqlite'),result=backupStorage(location),stat=fs.lstatSync(path.toNamespacedPath(location));
    if(stat.isSymbolicLink()||!stat.isFile()||stat.size>maximumBackupBytes||stat.size!==result.bytes)throw new AppError('BACKUP_LIMIT','Public metadata backup exceeds the32MiB download limit or changed during export',413);
    const bytes=fs.readFileSync(path.toNamespacedPath(location)),sha256=createHash('sha256').update(bytes).digest('hex');
    if(bytes.length!==result.bytes||sha256!==result.sha256)throw new AppError('BACKUP_INTEGRITY','Public metadata export could not verify its exact downloaded bytes',503);
    const source='source' in result?result.source:undefined;
    const createdAt=new Date().toISOString(),filename='bondtrace-metadata-'+createdAt.replace(/[:.]/g,'-')+'.sqlite';
    const manifest={filename,createdAt,schemaVersion:result.schemaVersion,bytes:bytes.length,sha256,integrityCheck:result.integrityCheck,
      source:{backend:storageBackend,scope:'Consistent public metadata only; no signer keys, database credentials or automatic restore',
        ...(source?{snapshotDataSha256:source.snapshotDataSha256,observedGeneration:source.observedGeneration,acknowledgedAt:source.acknowledgedAt,network:source.network,programId:source.programId}:{})}};
    const payload=JSON.stringify({schema:'bondtrace.metadata-download.v1',manifest,database:{encoding:'base64',data:bytes.toString('base64')}});
    if(Buffer.byteLength(payload)>maximumExportBytes)throw new AppError('BACKUP_LIMIT','Public metadata download exceeds the64MiB portable export limit',413);
    res.writeHead(200,{'content-type':'application/json; charset=utf-8','content-disposition':`attachment; filename="${filename}.json"`,'content-length':Buffer.byteLength(payload),'cache-control':'no-store','x-content-type-options':'nosniff','x-bondtrace-sqlite-sha256':sha256});
    res.end(payload);
  }catch(error){cleanup();throw error;}
}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url??'/','http://127.0.0.1');
    if(req.method==='GET'&&url.pathname==='/healthz')return send(res,200,{status:'alive'});
    if(!hostingAuthorized(hosting,req.headers.authorization)){res.setHeader('www-authenticate','Basic realm="BondTrace", charset="UTF-8"');throw new AppError('AUTH_REQUIRED','Authenticate to this private test deployment',401);}
    if(req.method==='POST'&&req.headers.origin&&!allowedOrigins.has(req.headers.origin))throw new AppError('ORIGIN_DENIED','Use the configured BondTrace application origin',403);
    if(req.method==='GET'&&url.pathname==='/api/metadata/backup')return downloadMetadataBackup(req,res,url);
    if(req.method==='GET'&&url.pathname==='/api/health'){const chain=await chainIdentity(),program=await getProgramIdentity();return send(res,200,{status:program.signingAllowed?'ok':'read-only',demo:demoEnabled,storage:storageDiagnostics(),chain,program});}
    if(req.method==='GET'&&url.pathname==='/api/program')return send(res,200,await getProgramIdentity());
    if(req.method==='POST'&&url.pathname==='/api/runtime/readiness'){const data=await body(req);if(Object.keys(data).length)throw new AppError('INVALID_REQUEST','Readiness accepts an empty object');const chain=await chainIdentity(),program=await getProgramIdentity(),rpcHealth=await rpc('getHealth'),slotBefore=await rpc<number>('getSlot',[{commitment:'confirmed'}]);await new Promise(resolve=>setTimeout(resolve,800));const slotAfter=await rpc<number>('getSlot',[{commitment:'confirmed'}]);const storage=verifyStorageWrite();return send(res,200,{chain,program,rpcHealth,slotBefore,slotAfter,storage});}
    if(req.method==='GET'&&['/api/state','/api/reconciliation','/api/servicing','/api/evidence'].includes(url.pathname)){
      const identity=await chainIdentity(),state=await getState(url.searchParams.get('instrument')??undefined);
      if(url.pathname==='/api/evidence'){
        const report=buildEvidenceReport(state,identity,signature=>publicExecutionProof(receipt(signature)));
        res.setHeader('content-disposition',`attachment; filename="bondtrace-${state.instrument.address}.json"`);
        return send(res,200,report);
      }
      if(url.pathname==='/api/servicing')return send(res,200,{instrument:state.instrument?.address??null,context:state.context??null,chainIdentity:identity,servicing:state.servicing??null});
      return send(res,200,url.pathname==='/api/state'?{...state,chainIdentity:identity}:{instrument:state.instrument?.address??null,context:state.context??null,chainIdentity:identity,reconciliation:state.reconciliation??null});
    }
    if(req.method==='GET'&&/^\/api\/transactions\/[^/]+\/proof$/.test(url.pathname)){const signature=url.pathname.split('/')[3],status=await transactionStatus(signature);if(url.searchParams.get('retry')==='true')await captureRetainedProof(signature,true);return send(res,200,{...status,executionProof:publicExecutionProof(receipt(signature))});}
    if(req.method==='GET'&&url.pathname.startsWith('/api/transactions/'))return send(res,200,await transactionStatus(url.pathname.split('/').pop()!));
    if(req.method==='GET'&&url.pathname.startsWith('/api/operations/'))return send(res,200,await operationStatus(url.pathname.split('/').pop()!));
    if(req.method==='POST'&&url.pathname==='/api/demo/bootstrap'){if(!demoEnabled)throw new AppError('DEMO_DISABLED','Demo harness disabled',403);const data=await body(req);if(Object.keys(data).some(k=>!['reset','operationId','requestId'].includes(k))||(data.reset!==undefined&&typeof data.reset!=='boolean'))throw new AppError('INVALID_REQUEST','Bootstrap accepts a boolean reset and one recovery identifier');const id=recoveryId(data);return send(res,200,await mutate(()=>bootstrap(data.reset===true,id)));}
    if(req.method==='POST'&&url.pathname==='/api/demo/action'){const data=await body(req);recoveryId(data);return send(res,200,await mutate(()=>demoAction(data)));}
    if(req.method==='POST'&&url.pathname==='/api/demo/coupon-run'){if(!demoEnabled)throw new AppError('DEMO_DISABLED','Generated test execution is disabled',403);const data=await body(req);return send(res,200,await mutate(()=>runCouponSettlement(data)));}
    if(req.method==='POST'&&url.pathname==='/api/lifecycle/plan'){const data=await body(req);return send(res,200,await mutate(()=>planLifecycleRun(data)));}
    if(req.method==='POST'&&url.pathname==='/api/lifecycle/resume'){const data=await body(req);return send(res,200,await mutate(()=>runLifecycle(data)));}
    if(req.method==='GET'&&/^\/api\/lifecycle\/[a-zA-Z0-9_-]{8,100}$/.test(url.pathname))return send(res,200,await lifecycleRunStatus(url.pathname.split('/').pop()!));
    if(req.method==='POST'&&url.pathname==='/api/actions/prepare')return send(res,200,await prepareAction(await body(req)));
    if(req.method==='POST'&&url.pathname==='/api/transactions/submit'){const data=await body(req);if(Object.keys(data).some(k=>k!=='signedTransactionBase64'))throw new AppError('INVALID_REQUEST','Submit accepts only the reviewed signed transaction');return send(res,200,await mutate(()=>submitPrepared(data.signedTransactionBase64)));}
    if(req.method==='POST'&&/^\/api\/transactions\/[^/]+\/rebroadcast$/.test(url.pathname)){const data=await body(req);if(Object.keys(data).some(k=>k!=='operationId')||(data.operationId!==undefined&&(typeof data.operationId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(data.operationId))))throw new AppError('INVALID_REQUEST','Rebroadcast accepts only an optional existing operation identifier');return send(res,200,await mutate(()=>rebroadcastTransaction(url.pathname.split('/')[3],data.operationId)));}
    if(url.pathname.startsWith('/api/'))throw new AppError('NOT_FOUND','API route not found',404);
    if(req.method!=='GET')throw new AppError('METHOD_NOT_ALLOWED','Use GET',405);
    const relative=decodeURIComponent(url.pathname).replace(/^\/+/,''), candidate=path.resolve(dist,relative||'index.html');
    if(!candidate.startsWith(dist+path.sep))throw new AppError('NOT_FOUND','Not found',404);
    const exists=fs.existsSync(candidate)&&fs.statSync(candidate).isFile();
    if(!exists&&(relative.startsWith('assets/')||path.extname(relative)))throw new AppError('NOT_FOUND','Static asset not found',404);
    const file=exists?candidate:path.join(dist,'index.html');
    if(!fs.existsSync(file)){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<h1>BondTrace API готов</h1><p>Интерфейс разработки: http://127.0.0.1:5173. Для единого запуска выполните npm run build.</p>');return;}
    if(!staticAssetInside(dist,file))throw new AppError('NOT_FOUND','Not found',404);
    const type=({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.map':'application/json'} as Record<string,string>)[path.extname(file)]??'application/octet-stream';res.writeHead(200,{'content-type':type,'x-content-type-options':'nosniff'});res.end(fs.readFileSync(file));
  }catch(error){const known=error instanceof AppError?error:error instanceof StorageError?new AppError(error.code,'Public metadata storage is unavailable. Existing signed identifiers must be retained for recovery.',503,true):new AppError('INTERNAL_ERROR','The service could not complete this request. Retain any submitted recovery identifier.',500,true);send(res,known.status,{error:{code:known.code,message:known.message,retryable:known.retryable,recoveryRequired:['RECOVERY_ID_CONFLICT','MESSAGE_ALREADY_SUBMITTED','PLAN_RELEASE_MISMATCH'].includes(known.code)||(req.method==='POST'&&known.status>=500)}});}
});
server.headersTimeout=10000;server.requestTimeout=30000;server.keepAliveTimeout=5000;
server.listen(port,hosting.bindHost,()=>console.log(`BondTrace ${hosting.publicOrigin??'http://127.0.0.1:'+port} · test networks only`));
const stop=()=>server.close(()=>{closeStorage();process.exit(0);});process.on('SIGINT',stop);process.on('SIGTERM',stop);
