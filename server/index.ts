import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {demoEnabled,port} from './config.ts';
import {AppError,transactionStatus} from './rpc.ts';
import {getState} from './state.ts';
import {bootstrap} from './seed.ts';
import {demoAction,prepareAction} from './actions.ts';
import {submitPrepared} from './transactions.ts';
import {operationStatus} from './operations.ts';
const dist=path.resolve('apps/web/dist');
const allowedOrigins=new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`,'http://127.0.0.1:5173','http://localhost:5173']);
let mutationBusy=false;
async function mutate<T>(action:()=>Promise<T>){if(mutationBusy)throw new AppError('ACTION_PENDING','Wait for the existing test operation',409);mutationBusy=true;try{return await action();}finally{mutationBusy=false;}}
function send(res:http.ServerResponse,status:number,value:unknown){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value,(_key,item)=>typeof item==='bigint'?item.toString():item));}
async function body(req:http.IncomingMessage){if(!String(req.headers['content-type']??'').startsWith('application/json'))throw new AppError('CONTENT_TYPE','Use application/json',415);let data='';for await(const chunk of req){data+=chunk;if(data.length>65000)throw new AppError('BODY_TOO_LARGE','Request exceeds limit',413);}try{const value=data?JSON.parse(data):{};if(value===null||typeof value!=='object'||Array.isArray(value))throw new AppError('INVALID_REQUEST','Expected a JSON object');return value;}catch(error){if(error instanceof AppError)throw error;throw new AppError('INVALID_JSON','Malformed JSON body');}}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url??'/','http://127.0.0.1');
    if(req.method==='POST'&&req.headers.origin&&!allowedOrigins.has(req.headers.origin))throw new AppError('ORIGIN_DENIED','Use the local BondTrace application',403);
    if(req.method==='GET'&&url.pathname==='/api/health')return send(res,200,{status:'ok',demo:demoEnabled});
    if(req.method==='GET'&&url.pathname==='/api/state')return send(res,200,await getState());
    if(req.method==='GET'&&url.pathname.startsWith('/api/transactions/'))return send(res,200,await transactionStatus(url.pathname.split('/').pop()!));
    if(req.method==='GET'&&url.pathname.startsWith('/api/operations/'))return send(res,200,await operationStatus(url.pathname.split('/').pop()!));
    if(req.method==='POST'&&url.pathname==='/api/demo/bootstrap'){if(!demoEnabled)throw new AppError('DEMO_DISABLED','Demo harness disabled',403);const data=await body(req);return send(res,200,await mutate(()=>bootstrap(data.reset===true,data.operationId??data.requestId)));}
    if(req.method==='POST'&&url.pathname==='/api/demo/action'){const data=await body(req);return send(res,200,await mutate(()=>demoAction(data)));}
    if(req.method==='POST'&&url.pathname==='/api/actions/prepare')return send(res,200,await prepareAction(await body(req)));
    if(req.method==='POST'&&url.pathname==='/api/transactions/submit'){const data=await body(req);return send(res,200,await mutate(()=>submitPrepared(data.signedTransactionBase64)));}
    if(url.pathname.startsWith('/api/'))throw new AppError('NOT_FOUND','API route not found',404);
    if(req.method!=='GET')throw new AppError('METHOD_NOT_ALLOWED','Use GET',405);
    const relative=decodeURIComponent(url.pathname).replace(/^\/+/,''), candidate=path.resolve(dist,relative||'index.html');
    if(!candidate.startsWith(dist+path.sep))throw new AppError('NOT_FOUND','Not found',404);
    const file=fs.existsSync(candidate)&&fs.statSync(candidate).isFile()?candidate:path.join(dist,'index.html');
    if(!fs.existsSync(file)){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<h1>BondTrace API готов</h1><p>Интерфейс разработки: http://127.0.0.1:5173. Для единого запуска выполните npm run build.</p>');return;}
    const type=({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.map':'application/json'} as Record<string,string>)[path.extname(file)]??'application/octet-stream';res.writeHead(200,{'content-type':type,'x-content-type-options':'nosniff'});res.end(fs.readFileSync(file));
  }catch(error){const message=error instanceof Error?error.message:'Operation failed';const inputFailure=/unsigned integer|string outside|out of bounds|exceeds u64|invalid address|base58|invalid coupon terms|negative entitlement|out of range/i.test(message);const known=error instanceof AppError?error:new AppError(inputFailure?'INVALID_REQUEST':'INTERNAL_ERROR',message,inputFailure?400:500);send(res,known.status,{error:{code:known.code,message:known.message,retryable:known.retryable}});}
});
server.listen(port,'127.0.0.1',()=>console.log(`BondTrace http://127.0.0.1:${port} · test networks only`));
const stop=()=>server.close(()=>process.exit(0));process.on('SIGINT',stop);process.on('SIGTERM',stop);
