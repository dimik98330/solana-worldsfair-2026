import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createScopedReader} from './data-reader';
test('slow prior instrument cannot overwrite the newly selected response',async()=>{
  let old:(value:string)=>void=()=>{};const reader=createScopedReader<string>(key=>key==='A'?new Promise(resolve=>{old=resolve;}):Promise.resolve('B'),'A');
  const a=reader.read('A');reader.select('B');const b=await reader.read('B');assert.equal(b.kind,'current');old('A');assert.equal((await a).kind,'obsolete');assert.ok('version'in b&&reader.current(b.version));
});
test('A to B to A rejects the original A generation and stale errors',async()=>{
  let rejected:(value:Error)=>void=()=>{};let calls=0;const reader=createScopedReader<string>(()=>++calls===1?new Promise((_resolve,reject)=>{rejected=reject;}):Promise.resolve('new A'),'A');
  const old=reader.read('A');reader.select('B');reader.select('A');const current=await reader.read('A');rejected(new Error('old transport error'));assert.equal((await old).kind,'obsolete');assert.equal(current.kind,'current');
});
test('current transport error remains visible and later selection invalidates a returned result',async()=>{
  const reader=createScopedReader<string>(async()=>{throw new Error('current failure');});const value=await reader.read('');assert.equal(value.kind,'error');reader.select('B');assert.ok('version'in value&&!reader.current(value.version));
});
