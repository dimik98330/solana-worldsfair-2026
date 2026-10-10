import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';

const base=path.resolve('.local/tests/storage-namespace-safety-'+randomUUID()),baselineDir=path.join(base,'baseline');
fs.mkdirSync(baselineDir,{recursive:true});
const storageUrl=pathToFileURL(path.resolve('server/storage.ts')).href;
function fresh(name:string){const directory=path.join(base,name+'-'+randomUUID());assert.ok(directory.startsWith(base+path.sep));fs.mkdirSync(directory);return directory;}
function child(source:string,directory:string){return new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{
  const prelude=`import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import * as storage from ${JSON.stringify(storageUrl)};
const directory=process.env.BONDTRACE_DATA_DIR;const file=name=>path.join(directory,name);globalThis.fetch=()=>{throw new Error('No RPC or HTTP is permitted in namespace regressions');};\n`;
  const worker=spawn(process.execPath,['--import','tsx','--input-type=module','--eval',prelude+source],{cwd:process.cwd(),
    env:{...process.env,BONDTRACE_DATA_DIR:directory,BONDTRACE_NETWORK:'localnet',BONDTRACE_DEPLOYMENT:'local',BONDTRACE_STORAGE_BACKEND:'sqlite'},windowsHide:true});
  let stdout='',stderr='';worker.stdout.on('data',value=>{stdout+=String(value);});worker.stderr.on('data',value=>{stderr+=String(value);});worker.once('error',reject);
  const timer=setTimeout(()=>{worker.kill();reject(new Error('Namespace guard child timed out'));},40_000);
  worker.once('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
});}
async function success(source:string,directory:string){const result=await child(source,directory);assert.equal(result.code,0,result.stderr);return JSON.parse(result.stdout.trim()||'null');}
const baseline=await success(`storage.writeJson(file('fixture.json'),{value:'retained-public-metadata'});storage.closeStorage();console.log('null');`,baselineDir);
void baseline;
function copyDb(directory:string){fs.copyFileSync(path.join(baselineDir,'metadata.sqlite'),path.join(directory,'metadata.sqlite'),fs.constants.COPYFILE_EXCL);}

test('every individual SQLite filename and sidecar rejects an actual symlink/junction',async()=>{
  for(const suffix of ['', '-journal','-wal','-shm']) {
    const directory=fresh('suffix-'+(suffix||'database')),target=fresh('link-target');copyDb(directory);
    const candidate=path.join(directory,'metadata.sqlite'+suffix);
    if(suffix==='')fs.renameSync(candidate,path.join(directory,'retained-original.sqlite'));
    // A Windows directory junction at a file location is also an unsafe link;
    // it requires no symlink privilege and must be rejected before SQLite opens.
    fs.symlinkSync(target,candidate,process.platform==='win32'?'junction':'dir');
    const result=await success(`assert.throws(()=>storage.storageDiagnostics(),error=>error instanceof storage.StorageError&&error.code==='STORAGE_UNSAFE_PATH');
console.log(JSON.stringify({rejected:true,databaseReached:false}));`,directory);
    assert.equal(result.rejected,true);assert.deepEqual(fs.readdirSync(target),[],'Guard must not create a SQLite file in the link target');
  }
});

test('persistent ancestor replacement between individual file checks is rejected by the final walk',async()=>{
  const directory=fresh('mid-walk'),target=fresh('foreign-target');copyDb(directory);copyDb(target);
  const result=await success(`const lstat=fs.lstatSync,mkdir=fs.mkdirSync;const retained=directory+'-retained';let swapped=false,mkdirAfterSwap=0;const checked=[];
fs.lstatSync=function(filename,...args){const name=String(filename);
  if(name.startsWith(file('metadata.sqlite')))checked.push(name);
  const value=Reflect.apply(lstat,fs,[filename,...args]);
  if(name===file('metadata.sqlite')&&!swapped){fs.renameSync(directory,retained);fs.symlinkSync(${JSON.stringify(target)},directory,process.platform==='win32'?'junction':'dir');swapped=true;}
  return value;
};
fs.mkdirSync=function(filename,...args){if(swapped&&String(filename)===directory){mkdirAfterSwap++;throw new Error('Namespace guard returned before its final ancestor check');}return Reflect.apply(mkdir,fs,[filename,...args]);};
let failure;try{storage.storageDiagnostics();}catch(error){failure=error;}finally{fs.lstatSync=lstat;fs.mkdirSync=mkdir;}
assert.equal(swapped,true);assert(failure instanceof storage.StorageError);assert.equal(failure.code,'STORAGE_UNSAFE_PATH');assert.equal(mkdirAfterSwap,0);
assert.deepEqual(checked,['','-journal','-wal','-shm'].map(suffix=>file('metadata.sqlite'+suffix)));
console.log(JSON.stringify({rejectedAtFinalWalk:true,individualFilesChecked:checked.length,mkdirAfterSwap}));`,directory);
  assert.deepEqual(result,{rejectedAtFinalWalk:true,individualFilesChecked:4,mkdirAfterSwap:0});
});

test('later calls refresh namespace/file guards even after a successful warm-handle check',async()=>{
  const directory=fresh('fresh-next-call'),target=fresh('later-link-target');copyDb(directory);
  const result=await success(`storage.storageDiagnostics();fs.symlinkSync(${JSON.stringify(target)},file('metadata.sqlite-wal'),process.platform==='win32'?'junction':'dir');
assert.throws(()=>storage.storageDiagnostics(),error=>error instanceof storage.StorageError&&error.code==='STORAGE_UNSAFE_PATH');storage.closeStorage();
console.log(JSON.stringify({freshCheckRejected:true}));`,directory);
  assert.deepEqual(result,{freshCheckRejected:true});assert.deepEqual(fs.readdirSync(target),[]);
});

test('one warm synchronous namespace check probes each ancestor twice and every SQLite file once, without a wall-clock assertion',async t=>{
  const directory=fresh('probe-bound');copyDb(directory);
  const result=await success(`storage.storageDiagnostics();const original=fs.lstatSync,calls=[];
fs.lstatSync=function(filename,...args){calls.push(String(filename));return Reflect.apply(original,fs,[filename,...args]);};
try{storage.storageDiagnostics();storage.storageDiagnostics();}finally{fs.lstatSync=original;}
let current=path.parse(directory).root;const ancestors=directory.slice(current.length).split(path.sep).filter(Boolean).map(piece=>current=path.join(current,piece));
const sqliteFiles=['','-journal','-wal','-shm'].map(suffix=>file('metadata.sqlite'+suffix));
for(const ancestor of ancestors)assert.equal(calls.filter(name=>name===ancestor).length,4,'Two fresh walks in each of two independent calls');
for(const name of sqliteFiles)assert.equal(calls.filter(value=>value===name).length,2,'Every individual SQLite filename remains freshly checked');
assert.equal(calls.length,2*(2*ancestors.length+4));storage.closeStorage();
console.log(JSON.stringify({independentCalls:2,ancestorDepth:ancestors.length,actualProbes:calls.length,perCallBound:2*ancestors.length+4}));`,directory);
  assert.equal(result.actualProbes,2*result.perCallBound);
  t.diagnostic(`Deterministic filesystem probes only: depth ${result.ancestorDepth}, ${result.perCallBound} probes per invocation, ${result.independentCalls} fresh calls. No elapsed-time or bootstrap-deadline claim.`);
});
