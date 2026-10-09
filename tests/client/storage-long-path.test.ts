import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
process.env.BONDTRACE_DATA_DIR=path.resolve('.local/tests/storage-long-'+crypto.randomUUID(),'a'.repeat(80),'b'.repeat(80),'c'.repeat(40));
const storage=await import('../../server/storage.ts');

test('native SQLite commit, reopen and consistent backup work beyond Windows MAX_PATH',()=>{
 const directory=process.env.BONDTRACE_DATA_DIR!,file=path.join(directory,'operations','long_path_record_01.json');
 assert.ok(storage.databasePath.length>300);
 storage.writeJson(file,{id:'long_path_record_01',amountMinor:'9007199254740993'});
 storage.closeStorage();
 assert.deepEqual(storage.readJson(file,null),{id:'long_path_record_01',amountMinor:'9007199254740993'});
 const backup=storage.backupStorage(path.join(directory,'backups','long-snapshot.sqlite'));
 assert.deepEqual(backup.integrityCheck,['ok']);assert.ok(backup.bytes>0);
 storage.closeStorage();
});

test('four native SQLite writers preserve every record in a long Windows namespace',async()=>{
 const moduleUrl=pathToFileURL(path.resolve('server/storage.ts')).href;
 const source=`import path from 'node:path';const storage=await import(${JSON.stringify(moduleUrl)});const file=path.join(process.env.BONDTRACE_DATA_DIR,'operations','long_concurrent_01.json');for(let i=0;i<15;i++)storage.updateJson(file,{items:[]},current=>({items:[...current.items,process.env.LONG_PATH_WRITER+'_'+i]}));storage.closeStorage();`;
 await Promise.all([0,1,2,3].map(writer=>new Promise<void>((resolve,reject)=>{
  const child=spawn(process.execPath,['--import','tsx','--input-type=module','--eval',source],{cwd:process.cwd(),windowsHide:true,env:{...process.env,LONG_PATH_WRITER:String(writer)}});
  let errors='';child.stdout.resume();child.stderr.on('data',part=>errors+=String(part));
  const timer=setTimeout(()=>{child.kill();reject(new Error('Long-path writer timeout'));},30000);
  child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',code=>{clearTimeout(timer);if(code===0)resolve();else reject(new Error(errors));});
 })));
 const result=storage.readJson<{items:string[]}>(path.join(process.env.BONDTRACE_DATA_DIR!,'operations','long_concurrent_01.json'),{items:[]});
 assert.equal(result.items.length,60);assert.equal(new Set(result.items).size,60);storage.closeStorage();
});
