import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {getBase58Decoder} from '@solana/kit';

// Isolated child processes own all module globals, fetch mocks, signers and SQLite.
// Synthetic journal references below are never live receipts or real wallet keys.
const base = path.resolve('.local/tests/backend-journal-' + crypto.randomUUID());
fs.mkdirSync(base, {recursive: true});
const moduleUrl = (file: string) => pathToFileURL(path.resolve(file)).href;
const modules = ['server/storage.ts', 'server/journal.ts', 'server/operations.ts', 'server/prepared.ts', 'server/rpc.ts', 'server/request-contract.ts', 'server/transactions.ts', 'packages/client/src/program.ts'].map(moduleUrl);
const prelude = `
import {programRpc} from './tests/client/helpers/program-rpc.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {generateKeyPairSigner, getAddressDecoder} from '@solana/kit';
const [storage,journal,operations,prepared,rpc,contracts,transactions,program] = await Promise.all(${JSON.stringify(modules)}.map(url=>import(url)));
const file=name=>path.join(process.env.BONDTRACE_DATA_DIR,name);
const key=id=>getAddressDecoder().decode(Uint8Array.from({length:32},(_,i)=>i===0?id:37));
let genesis=key(101), mode='confirmed', sends=0, onSend=()=>{};
const requests=[];
globalThis.fetch=async(_input,init)=>{
  const request=JSON.parse(String(init?.body)); requests.push(request.method); let result;
  const deployment=programRpc(request);if(deployment!==undefined)return Response.json({jsonrpc:'2.0',id:request.id,result:deployment});
  switch(request.method){
    case 'getGenesisHash':result=genesis;break;
    case 'getLatestBlockhash':result={context:{slot:600},value:{blockhash:'11111111111111111111111111111111',lastValidBlockHeight:1000}};break;
    case 'simulateTransaction':result={context:{slot:600},value:{err:null,unitsConsumed:1000,logs:[]}};break;
    case 'getFeeForMessage':result={context:{slot:600},value:5000};break;
    case 'sendTransaction':sends++;onSend(request.params[0]);if(mode==='send-loss')throw new TypeError('Synthetic response lost after accepting bytes');result=rpc.signatureOf(request.params[0]);break;
    case 'getSignatureStatuses':result={context:{slot:701},value:[mode==='absent'?null:{err:mode==='error'?{InstructionError:[0,{Custom:6001}]}:null,slot:700,confirmationStatus:'confirmed'}]};break;
    case 'getBlockHeight':result=2000;break;
    default:throw new Error('Unexpected synthetic RPC '+request.method);
  }
  return Response.json({jsonrpc:'2.0',id:request.id,result});
};
const code=expected=>error=>error instanceof rpc.AppError&&error.code===expected;
const ix=(actor,tag)=>program.instruction('journal_fixture',[[actor.address,'sw']],Uint8Array.of(tag));
const signed=async(actor,tag)=>transactions.buildTransaction([ix(actor,tag)],actor.address,[actor],0);
`;
function namespace(label: string) {
  const directory = path.join(base, label + '-' + crypto.randomUUID());
  fs.mkdirSync(directory, {recursive: true}); return directory;
}
function worker(body: string, directory: string, diagnosticPhase?: string) {
  return new Promise<{code: number | null; stdout: string; stderr: string}>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', prelude + body], {
      cwd: process.cwd(), env: {...process.env, BONDTRACE_NETWORK: 'localnet', SOLANA_RPC_URL: 'http://127.0.0.1:8899', BONDTRACE_DATA_DIR: directory}, windowsHide: true,
    });
    let stdout = '', stderr = '', progress = '';
    child.stdout.on('data', value => { stdout += String(value);if(diagnosticPhase)progress=stdout.match(/projection-stage:[a-zA-Z0-9_-]+/g)?.at(-1)??progress; }); child.stderr.on('data', value => { stderr += String(value); });
    child.once('error', reject);
    const timer = setTimeout(() => { child.kill(); reject(new Error('Isolated backend-journal worker timed out'+(diagnosticPhase?' ('+diagnosticPhase+(progress?'; '+progress:'')+')':''))); }, 45_000);
    child.once('close', code => { clearTimeout(timer); resolve({code, stdout, stderr}); });
  });
}
async function success(body: string, directory: string, diagnosticPhase?: string) {
  const result = await worker(body, directory, diagnosticPhase); assert.equal(result.code, 0, result.stderr); return result;
}
function signature(id: number) { const bytes = Buffer.alloc(64, 17); bytes.writeUInt32LE(id, 60); return getBase58Decoder().decode(bytes); }
const hash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const projectionFixture = `
const [{createHash},{getAddressEncoder,address},{readCatalog,saveCatalog},{saveFixture,fixture},{finalizeAdminEffect},{applyConfirmedEffect}] = await Promise.all([import('node:crypto'),import('@solana/kit'),import(${JSON.stringify(moduleUrl('server/catalog.ts'))}),import(${JSON.stringify(moduleUrl('server/store.ts'))}),import(${JSON.stringify(moduleUrl('server/admin.ts'))}),import(${JSON.stringify(moduleUrl('server/effects.ts'))})]);
const issuer=key(1),settlementMint=key(4),bondAddress=await program.deriveBond(issuer,77n),bondMint=await program.derive('bond_mint',bondAddress),vault=await program.derive('vault',bondAddress);
const holderWallets=Array.from({length:16},(_,i)=>key(50+i));
const u64=v=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(v);return b;};const i64=v=>{const b=Buffer.alloc(8);b.writeBigInt64LE(v);return b;};const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;};const pk=v=>Buffer.from(getAddressEncoder().encode(address(v)));
const name=Buffer.from('Synthetic concurrent projection');
const bondBytes=Buffer.concat([createHash('sha256').update('account:Bond').digest().subarray(0,8),...[issuer,bondMint,settlementMint,vault].map(pk),u64(77n),u32(name.length),name,u64(1000000n),i64(400n),u64(0n),u64(0n),Buffer.from([0,255,0]),Buffer.alloc(2),u32(holderWallets.length),...holderWallets.map(pk),u32(1),i64(200n),i64(300n),u64(50000n),u32(0)]);
const record={seriesId:'77',bond:bondAddress,name:name.toString(),settlementMint,createdAt:'2026-10-08T00:00:00.000Z',rateBps:0,couponFrequency:0,roles:{issuer},proposalIds:[],complete:false,accelerated:false,source:'demo'};
const originalMock=globalThis.fetch;
globalThis.fetch=async(input,init)=>{const req=JSON.parse(String(init?.body));if(req.method==='getAccountInfo'&&req.params[0]===bondAddress){return Response.json({jsonrpc:'2.0',id:req.id,result:{context:{slot:600},value:{owner:program.PROGRAM_ID,executable:false,data:[bondBytes.toString('base64'),'base64']}}});}return originalMock(input,init);};
`;
const retainedProjectionIntent = `
const retainProjection=(id,signature,action,params,metadata)=>{
  operations.beginOperation(id,action,'issuer',params);
  operations.updateOperation(id,{wallet:issuer,bond:bondAddress,signature,status:'confirmed',chainStatus:'confirmed',projectionStatus:'pending',metadata});
  journal.saveReceipt({signature,operationId:id,action,wallet:issuer,bond:bondAddress,network:'localnet',genesisHash:genesis,chainStatus:'confirmed',projectionStatus:'pending',submittedAt:'2026-10-08T00:00:00.000Z',slot:700,observedAt:'2026-10-08T00:00:00.000Z',verification:'live-rpc',finality:{schemaVersion:1,signature,status:'confirmed',source:'live-rpc',slot:700,contextSlot:701,observedAt:'2026-10-08T00:00:00.000Z',genesisHash:genesis}});
};
`;
async function waitForMarker(directory: string, name: string) {
  const deadline = Date.now() + 30_000;
  while (!fs.existsSync(path.join(directory, name))) {
    if (Date.now() >= deadline) throw new Error('Projection test coordination marker timed out');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test('legacy arrays migrate once, preserve bytes and retain more than150 signed and projection-pending records through restart', async () => {
  const directory = namespace('legacy-retention'), createdAt = new Date().toISOString();
  const prepared = Array.from({length: 180}, (_, i) => ({id: i.toString(16).padStart(64, '0'), action: 'journal_fixture', wallet: '11111111111111111111111111111111', signature: signature(i + 1), expiresAt: 1, lastValidBlockHeight: 1000, status: 'confirmed', chainStatus: 'confirmed', projectionStatus: 'pending', params: {amountMinor: '9007199254740993'}}));
  const operations = Array.from({length: 190}, (_, i) => ({id: 'legacy-operation_' + i, digest: 'a'.repeat(64), action: 'journal_fixture', role: 'test-only', signature: signature(i + 1000), createdAt, status: i % 2 ? 'unknown' : 'confirmed', chainStatus: i % 2 ? 'unknown' : 'confirmed', projectionStatus: 'pending', params: {amountMinor: '18446744073709551615'}}));
  const activity = operations.map((o, i) => ({signature: o.signature, time: createdAt, kind: o.action, status: i % 2 ? 'unknown' : 'confirmed', slot: 700, explorerUrl: 'synthetic'}));
  const legacy = {'prepared.json': prepared, 'operations.json': operations, 'activity.json': activity, 'lifetimes.json': Object.fromEntries(operations.map(o => [o.signature, 1000]))};
  for (const [name, value] of Object.entries(legacy)) fs.writeFileSync(path.join(directory, name), JSON.stringify(value));
  const before = Object.fromEntries(Object.keys(legacy).map(name => [name, hash(path.join(directory, name))]));
  await success(`
    journal.migrateJournal();journal.migrateJournal();
    assert.equal(journal.journalValues('prepared').length,180);assert.equal(journal.journalValues('operations').length,190);assert.equal(journal.receipts().length,190);
    const first=operations.findOperation('legacy-operation_0');assert.equal(first.params.amountMinor,'18446744073709551615');assert.equal(first.projectionStatus,'pending');
    assert.equal(journal.receipts()[0].verification,'legacy-unbound');assert.equal(journal.receipts()[0].genesisHash,null);
    assert.throws(()=>operations.beginOperation('blocked-new_intent','journal_fixture','test-only',{}),code('RECOVERY_CAPACITY'));
    const actor=await generateKeyPairSigner(),value=await signed(actor,11);
    assert.throws(()=>prepared.rememberPrepared(value.transactionBase64,{action:'journal_fixture',wallet:actor.address,lastValidBlockHeight:value.lastValidBlockHeight}),code('RECOVERY_CAPACITY'));
    assert.equal(journal.journalValues('prepared').length,180);assert.equal(journal.journalValues('operations').length,190);
    assert.equal(sends,0);storage.closeStorage();
  `, directory);
  await success(`
    assert.equal(journal.journalValues('prepared').length,180);assert.equal(journal.journalValues('operations').length,190);
    assert.equal(operations.findOperation('legacy-operation_189').signature,${JSON.stringify(signature(1189))});
    assert.equal(operations.findOperation('legacy-operation_189').projectionStatus,'pending');
    assert.deepEqual(storage.verifyStorageIntegrity(),['ok']);assert.equal(sends,0);storage.closeStorage();
  `, directory);
  for (const [name, digest] of Object.entries(before)) assert.equal(hash(path.join(directory, name)), digest);
});

test('invalid legacy row rolls back per-record conversion without losing original arrays or accepting a migration marker', async () => {
  const directory = namespace('invalid-legacy');
  const p = [{id: 'b'.repeat(64), action: 'journal_fixture', wallet: '11111111111111111111111111111111', expiresAt: 1}], o = [{id: 'valid-legacy_01', status: 'pending'}, {id: 'short', status: 'pending'}];
  fs.writeFileSync(path.join(directory, 'prepared.json'), JSON.stringify(p)); fs.writeFileSync(path.join(directory, 'operations.json'), JSON.stringify(o));
  const before = hash(path.join(directory, 'operations.json'));
  await success(`
    assert.throws(()=>journal.migrateJournal(),/Legacy journal contains an invalid identifier/);
    assert.deepEqual(storage.listDocuments('prepared'),[]);assert.deepEqual(storage.listDocuments('operations'),[]);assert.deepEqual(storage.listDocuments('receipts'),[]);
    assert.equal(storage.readJson(file('journal-migration.json'),null),null);
    assert.deepEqual(storage.readJson(file('prepared.json'),[]),${JSON.stringify(p)});assert.deepEqual(storage.readJson(file('operations.json'),[]),${JSON.stringify(o)});
    storage.closeStorage();
  `, directory);
  assert.equal(hash(path.join(directory, 'operations.json')), before);
});

test('canonical replay normalizes aliases and exact integers while financial changes conflict and cannot rewrite the intent', async () => {
  await success(`
    const bond=key(7),destination=key(8),operationId='canonical-replay_01';
    const a=contracts.normalizeRequest({action:'transfer_bonds',requestId:operationId,bondAddress:bond,params:{destination,units:'009007199254740993'}});
    const b=contracts.normalizeRequest({action:'transfer_bonds',operationId,params:{units:'9007199254740993',targetWallet:destination,instrumentAddress:bond}});
    assert.deepEqual(a,b);const created=operations.beginOperation(a.operationId,a.action,'investor1',a.params);assert.equal(created.new,true);
    const replay=operations.beginOperation(b.operationId,b.action,'investor1',b.params);assert.equal(replay.new,false);assert.equal(replay.operation.params.units,'9007199254740993');
    assert.equal(operations.beginOperation(operationId,a.action,'investor1',{units:9007199254740993n,targetWallet:destination,bondAddress:bond}).new,false);
    assert.throws(()=>operations.beginOperation(operationId,a.action,'investor1',{...a.params,units:'9007199254740994'}),code('OPERATION_CONFLICT'));
    assert.throws(()=>operations.beginOperation(operationId,a.action,'investor2',a.params),code('OPERATION_CONFLICT'));
    assert.throws(()=>contracts.normalizeRequest({action:'fund_vault',params:{amountMinor:Number.MAX_SAFE_INTEGER+1}}),code('INVALID_AMOUNT'));
    assert.throws(()=>contracts.normalizeRequest({action:'transfer_bonds',params:{targetWallet:destination,destination:key(9),units:'1'}}),code('PARAMETER_CONFLICT'));
    assert.equal(operations.findOperation(operationId).params.units,'9007199254740993');
    storage.closeStorage();assert.equal(operations.findOperation(operationId).digest,created.operation.digest);assert.equal(sends,0);storage.closeStorage();
  `, namespace('canonical'));
});

test('GET confirmation persists genesis and provenance; null receipt after restart recovers recorded evidence and reset is rejected', async () => {
  const directory = namespace('get-confirmation'), sig = signature(5000);
  await success(`
    const signature=${JSON.stringify(sig)};assert.equal(journal.receipt(signature),null);
    const result=await rpc.transactionStatus(signature);assert.equal(result.status,'confirmed');assert.equal(result.verification,'live-rpc');
    const saved=journal.receipt(signature);assert.ok(saved,'First live GET confirmation must be durable even without a prior relay');
    assert.equal(saved.chainStatus,'confirmed');assert.equal(saved.genesisHash,genesis);assert.equal(saved.slot,700);assert.equal(saved.verification,'live-rpc');assert.equal(saved.projectionStatus,'pending');assert.ok(saved.observedAt);
    assert.equal(sends,0);storage.closeStorage();
  `, directory);
  await success(`
    const signature=${JSON.stringify(sig)};mode='absent';const observed=await rpc.transactionStatus(signature);
    assert.equal(observed.status,'confirmed');assert.equal(observed.verification,'recorded-confirmation');assert.equal(observed.slot,700);assert.equal(observed.genesisHash,genesis);
    const saved=journal.receipt(signature);genesis=key(102);
    await assert.rejects(()=>rpc.transactionStatus(signature),code('CHAIN_IDENTITY_CHANGED'));assert.deepEqual(journal.receipt(signature),saved);
    assert.equal(sends,0);storage.closeStorage();
  `, directory);
});

test('unbound legacy confirmation with absent RPC receipt remains unknown, preserving historical provenance', async () => {
  await success(`
    const signature=${JSON.stringify(signature(6000))};journal.saveReceipt({signature,action:'journal_fixture',network:'localnet',genesisHash:null,chainStatus:'confirmed',projectionStatus:'pending',submittedAt:'2026-10-07T00:00:00.000Z',observedAt:'2026-10-07T00:00:00.000Z',slot:17,verification:'legacy-unbound'});
    mode='absent';const status=await rpc.transactionStatus(signature);assert.equal(status.status,'unknown');assert.equal(status.verification,'live-rpc');
    const old=journal.receipt(signature);assert.equal(old.genesisHash,null);assert.equal(old.verification,'legacy-unbound');assert.equal(old.slot,17);assert.equal(old.chainStatus,'confirmed');
    assert.equal(sends,0);storage.closeStorage();
  `, namespace('legacy-unbound'));
});

test('receipt, lifetime and callback operation changes roll back together before relay on a synchronous failure', async () => {
  const directory = namespace('callback-rollback');
  await success(`
    const actor=await generateKeyPairSigner(),id='callback-rollback_01';operations.beginOperation(id,'journal_fixture','test-only',{});let signature;
    await assert.rejects(()=>transactions.execute([ix(actor,21)],actor,'journal_fixture',[],undefined,sig=>{signature=sig;operations.updateOperation(id,{signature:sig,status:'pending',chainStatus:'pending'});throw new Error('Synthetic callback failure before relay');}),/Synthetic callback failure/);
    assert.ok(signature);assert.equal(sends,0);assert.equal(journal.receipt(signature),null);assert.equal(storage.readJson(file('lifetimes.json'),{})[signature],undefined);
    assert.equal(operations.findOperation(id).signature,undefined);assert.equal(operations.findOperation(id).status,'preparing');assert.equal(journal.receipts().length,0);storage.closeStorage();
  `, directory);
  await success(`assert.equal(operations.findOperation('callback-rollback_01').signature,undefined);assert.deepEqual(journal.receipts(),[]);assert.deepEqual(storage.readJson(file('lifetimes.json'),{}),{});storage.closeStorage();`, directory);
});

test('async and thenable pre-relay callbacks cannot bypass transactional persistence', async () => {
  await success(`
    const actor=await generateKeyPairSigner();let called=false;
    await assert.rejects(()=>transactions.execute([ix(actor,22)],actor,'journal_fixture',[],undefined,async()=>{called=true;}),code('INVALID_CALLBACK'));
    assert.equal(called,false,'An async callback must be rejected before invocation');assert.equal(sends,0);assert.deepEqual(journal.receipts(),[]);assert.deepEqual(storage.readJson(file('lifetimes.json'),{}),{});
    await assert.rejects(()=>transactions.execute([ix(actor,23)],actor,'journal_fixture',[],undefined,()=>Promise.resolve()),code('INVALID_CALLBACK'));
    assert.equal(sends,0);assert.deepEqual(journal.receipts(),[]);assert.deepEqual(storage.readJson(file('lifetimes.json'),{}),{});storage.closeStorage();
  `, namespace('async-callback'));
});

test('prepared signature is rolled back if lifetime metadata cannot be committed before send', async () => {
  await success(`
    const actor=await generateKeyPairSigner(),value=await signed(actor,24);
    const id=prepared.rememberPrepared(value.transactionBase64,{action:'journal_fixture',wallet:actor.address,programRelease:value.programRelease});
    await assert.rejects(()=>transactions.submitPrepared(value.transactionBase64),code('INVALID_LIFETIME'));
    assert.equal(prepared.findPrepared(id).signature,undefined);assert.equal(prepared.findPrepared(id).status,'prepared');assert.equal(sends,0);assert.deepEqual(journal.receipts(),[]);assert.deepEqual(storage.readJson(file('lifetimes.json'),{}),{});
    storage.closeStorage();assert.equal(prepared.findPrepared(id).signature,undefined);storage.closeStorage();
  `, namespace('prepared-lifetime'));
});

test('relay observes durable exact bytes, signature, lifetime and operation before an ambiguous response; recovery uses that identifier', async () => {
  const directory = namespace('relay-durable');
  await success(`
    const actor=await generateKeyPairSigner(),id='relay-durable_01';operations.beginOperation(id,'journal_fixture','test-only',{});let submitted;
    mode='send-loss';onSend=wire=>{submitted=rpc.signatureOf(wire);const row=journal.receipt(submitted);assert.equal(row.signedTransactionBase64,wire);assert.equal(row.chainStatus,'pending');assert.equal(row.projectionStatus,'pending');assert.equal(row.genesisHash,genesis);assert.equal(row.lastValidBlockHeight,1000);assert.equal(storage.readJson(file('lifetimes.json'),{})[submitted],1000);assert.equal(operations.findOperation(id).signature,submitted);};
    await assert.rejects(()=>transactions.execute([ix(actor,25)],actor,'journal_fixture',[],undefined,sig=>operations.updateOperation(id,{signature:sig,status:'pending',chainStatus:'pending'})),code('UNKNOWN_STATUS'));
    assert.equal(sends,1);assert.ok(submitted);assert.equal(journal.receipt(submitted).chainStatus,'pending');assert.equal(operations.findOperation(id).signature,submitted);
    mode='confirmed';const status=await operations.operationStatus(id);assert.equal(status.status,'confirmed');assert.equal(status.projectionStatus,'complete');assert.equal(sends,1);
    assert.equal(journal.receipt(submitted).projectionStatus,'complete');assert.equal(journal.receipt(submitted).verification,'live-rpc');storage.closeStorage();
  `, directory);
  await success(`mode='absent';const result=await operations.operationStatus('relay-durable_01');assert.equal(result.status,'confirmed');assert.equal(result.verification,'recorded-confirmation');assert.equal(result.projectionStatus,'complete');assert.equal(sends,0);storage.closeStorage();`, directory);
});

test('concurrent catalog projections from four processes preserve every holder label and proposal identifier in the same database', async (t) => {
  const directory = namespace('concurrent-projections');
  const intents = Array.from({length: 16}, (_, position) => ({position, voteId: 'concurrent-vote_' + position, voteSignature: signature(9000 + position * 2), holderId: 'concurrent-holder_' + position, holderSignature: signature(9001 + position * 2)}));
  await success(projectionFixture + retainedProjectionIntent + `
    saveFixture(record);saveCatalog(record);
    for(const item of ${JSON.stringify(intents)}){retainProjection(item.voteId,item.voteSignature,'create_vote',{proposalId:String(item.position)});retainProjection(item.holderId,item.holderSignature,'register_holder',{holderWallet:holderWallets[item.position]},{holderWallet:holderWallets[item.position],label:'Holder '+item.position});}
    storage.closeStorage();
  `, directory, 'projection-setup-32');
  const startAt = Date.now() + 2_500;
  const runs = await Promise.all(Array.from({length: 4}, (_, index) => worker(projectionFixture + `
    const {DatabaseSync}=await import('node:sqlite');const originalPrepare=DatabaseSync.prototype.prepare,originalExec=DatabaseSync.prototype.exec;const sleep=new Int32Array(new SharedArrayBuffer(4));let nativeBusy=0,deferred=0;
    DatabaseSync.prototype.exec=function(sql){try{return Reflect.apply(originalExec,this,[sql]);}catch(error){if(error.code==='ERR_SQLITE_ERROR'&&error.errcode===5)nativeBusy++;throw error;}};
    // Expand the old read/merge/write race window. In the fixed code the entire
    // critical catalog read/merge/write holds BEGIN IMMEDIATE across this delay.
    DatabaseSync.prototype.prepare=function(sql){const statement=Reflect.apply(originalPrepare,this,[sql]);if(sql==='SELECT body FROM documents WHERE key = ?'){const get=statement.get;statement.get=function(...args){const row=Reflect.apply(get,this,args);if(args[0]==='catalog/'+bondAddress+'.json')Atomics.wait(sleep,0,0,15);return row;};}return statement;};
    const wait=${startAt}-Date.now();if(wait>0)Atomics.wait(sleep,0,0,wait);
    const intents=${JSON.stringify(intents)},completed=new Set();let blocked=false,attempted=0;
    projectionPass:for(let j=0;j<4;j++){const item=intents[${index}*4+j];for(const [id,signature] of [[item.voteId,item.voteSignature],[item.holderId,item.holderSignature]]){
      attempted++;
      process.stdout.write('projection-stage:'+id+String.fromCharCode(10));const beforeBusy=nativeBusy;
      try{const result=await operations.operationStatus(id);assert.equal(result.signature,signature);assert.equal(result.projectionStatus,'complete');completed.add(id);}
      catch(error){const typedBusy=error instanceof storage.StorageError&&error.code==='STORAGE_BUSY'&&error.cause?.code==='ERR_SQLITE_ERROR'&&error.cause?.errcode===5,unknownBusy=error instanceof rpc.AppError&&error.code==='UNKNOWN_STATUS'&&nativeBusy>beforeBusy;assert.ok(typedBusy||unknownBusy,'Only a retained confirmed projection with a native busy cause may await recovery: '+JSON.stringify({name:error.name,code:error.code,sqliteCode:error.errcode,sqliteMessage:error.errstr,frames:String(error.stack).match(/server[\\/][a-z-]+\\.ts:\\d+:\\d+/g)}));deferred++;blocked=true;break projectionPass;}
    }}
    if(blocked)for(const item of intents.slice(${index}*4,${index}*4+4))for(const [id,signature] of [[item.voteId,item.voteSignature],[item.holderId,item.holderSignature]])if(!completed.has(id)){const retained=operations.findOperation(id);assert.equal(retained.signature,signature);assert.equal(retained.chainStatus,'confirmed');assert.equal(retained.projectionStatus,'pending');assert.equal(journal.receipt(signature).chainStatus,'confirmed');assert.equal(journal.receipt(signature).projectionStatus,'pending');}
    assert.equal(sends,0);process.stdout.write(JSON.stringify({deferred,nativeBusy,blocked,attempted,pending:8-completed.size})+String.fromCharCode(10));storage.closeStorage();
  `, directory, 'projection-writer-'+index)));
  for (const result of runs) {assert.equal(result.code, 0, result.stderr);t.diagnostic(result.stdout.trim().split(/\r?\n/).filter(line=>line.startsWith('{')).join(' '));}
  const recoveryIntents = intents.flatMap(item => [{id: item.voteId, signature: item.voteSignature}, {id: item.holderId, signature: item.holderSignature}]);
  assert.equal(recoveryIntents.length, 32);
  assert.equal(new Set(recoveryIntents.map(item => item.id)).size, 32);
  assert.equal(new Set(recoveryIntents.map(item => item.signature)).size, 32);
  // Each passive recovery request retains its original ID/signature. Bound the
  // work per fresh process rather than expanding the existing 45s watchdog.
  for (let start = 0; start < recoveryIntents.length; start += 4) {
    const chunk = recoveryIntents.slice(start, start + 4);
    assert.equal(chunk.length, 4);
    await success(projectionFixture + `
      for(const {id,signature} of ${JSON.stringify(chunk)}){process.stdout.write('projection-stage:'+id+String.fromCharCode(10));const result=await operations.operationStatus(id);assert.equal(result.signature,signature);assert.equal(result.chainStatus,'confirmed');assert.equal(result.projectionStatus,'complete');const operation=operations.findOperation(id),receipt=journal.receipt(signature);assert.equal(operation.signature,signature);assert.equal(operation.chainStatus,'confirmed');assert.equal(operation.projectionStatus,'complete');assert.equal(receipt.signature,signature);assert.equal(receipt.chainStatus,'confirmed');assert.equal(receipt.projectionStatus,'complete');}
      assert.equal(sends,0);storage.closeStorage();
    `, directory, 'projection-fresh-drain-chunk-'+(start/4)+'-4');
  }
  await success(projectionFixture + `
    const {DatabaseSync}=await import('node:sqlite'),originalExec=DatabaseSync.prototype.exec;let writerBegins=0;DatabaseSync.prototype.exec=function(sql){if(sql==='BEGIN IMMEDIATE')writerBegins++;return Reflect.apply(originalExec,this,[sql]);};
    for(const {id,signature} of ${JSON.stringify(recoveryIntents)}){const operation=operations.findOperation(id),receipt=journal.receipt(signature);assert.equal(operation.signature,signature);assert.equal(operation.chainStatus,'confirmed');assert.equal(operation.projectionStatus,'complete');assert.equal(receipt.signature,signature);assert.equal(receipt.chainStatus,'confirmed');assert.equal(receipt.projectionStatus,'complete');}
    const value=readCatalog(bondAddress);assert.equal(Object.keys(value.holderLabels).length,16);for(let i=0;i<16;i++)assert.equal(value.holderLabels[holderWallets[i]],'Holder '+i);
    assert.deepEqual(value.proposalIds.map(Number).sort((a,b)=>a-b),Array.from({length:16},(_,i)=>i));assert.deepEqual(fixture().proposalIds.map(Number).sort((a,b)=>a-b),Array.from({length:16},(_,i)=>i));
    assert.deepEqual(storage.verifyStorageIntegrity(),['ok']);assert.equal(writerBegins,0,'Final stored-state verification must not reserve a writer');assert.deepEqual(requests,[],'Final stored-state verification must not perform RPC');assert.equal(sends,0);storage.closeStorage();
  `, directory, 'projection-readonly-verify-32');
});

test('real SQLite lock timeout retains a confirmed projection and a fresh process recovers its same ID without relay', async (t) => {
  const directory = namespace('projection-lock-recovery'), id = 'locked-projection_01', sig = signature(9500);
  await success(projectionFixture + retainedProjectionIntent + `saveFixture(record);saveCatalog(record);retainProjection(${JSON.stringify(id)},${JSON.stringify(sig)},'register_holder',{holderWallet:holderWallets[0]},{holderWallet:holderWallets[0],label:'Recovered holder'});assert.equal(storage.storageDiagnostics().busyTimeoutMs,5000);storage.closeStorage();`, directory);
  const recovery = worker(projectionFixture + `
    const {DatabaseSync}=await import('node:sqlite'),originalExec=DatabaseSync.prototype.exec;let observedBusy=false,elapsed=0;
    DatabaseSync.prototype.exec=function(sql){const start=performance.now();try{return Reflect.apply(originalExec,this,[sql]);}catch(error){if(sql==='BEGIN IMMEDIATE'&&error.code==='ERR_SQLITE_ERROR'&&error.errcode===5){observedBusy=true;elapsed=performance.now()-start;fs.writeFileSync(file('projection-busy.marker'),'SQLITE_BUSY');}throw error;}};
    const priorMock=globalThis.fetch;let gated=false;
    globalThis.fetch=async(input,init)=>{const request=JSON.parse(String(init?.body));if(!gated&&request.method==='getAccountInfo'&&request.params[0]===bondAddress){gated=true;fs.writeFileSync(file('projection-ready.marker'),'ready');const deadline=Date.now()+30000;while(!fs.existsSync(file('projection-held.marker'))){if(Date.now()>deadline)throw new Error('Projection lock holder did not become ready');await new Promise(resolve=>setTimeout(resolve,10));}}return priorMock(input,init);};
    await assert.rejects(()=>operations.operationStatus(${JSON.stringify(id)}),code('UNKNOWN_STATUS'));assert.ok(observedBusy);assert.ok(elapsed>=4500,'The real configured SQLite busy timeout must expire');const retained=operations.findOperation(${JSON.stringify(id)});assert.equal(retained.signature,${JSON.stringify(sig)});assert.equal(retained.chainStatus,'confirmed');assert.equal(retained.projectionStatus,'pending');assert.equal(journal.receipt(${JSON.stringify(sig)}).projectionStatus,'pending');assert.equal(sends,0);process.stdout.write(JSON.stringify({observedBusy,elapsed})+'\\n');storage.closeStorage();
  `, directory);
  // Attach a rejection handler while coordinating, retaining the original failure below.
  void recovery.catch(() => {});
  await waitForMarker(directory, 'projection-ready.marker');
  const holder = worker(`
    assert.equal(storage.storageDiagnostics().busyTimeoutMs,5000);const sleep=new Int32Array(new SharedArrayBuffer(4));
    storage.transactionSync(()=>{fs.writeFileSync(file('projection-held.marker'),'held');const deadline=Date.now()+20000;while(!fs.existsSync(file('projection-busy.marker'))){if(Date.now()>deadline)throw new Error('Expected SQLite busy timeout did not occur');Atomics.wait(sleep,0,0,25);}});storage.closeStorage();
  `, directory);
  const [failed, released] = await Promise.all([recovery, holder]);
  assert.equal(failed.code, 0, failed.stderr);assert.equal(released.code, 0, released.stderr);
  t.diagnostic(failed.stdout.trim());
  await success(projectionFixture + `const result=await operations.operationStatus(${JSON.stringify(id)});assert.equal(result.signature,${JSON.stringify(sig)});assert.equal(result.projectionStatus,'complete');assert.equal(operations.findOperation(${JSON.stringify(id)}).signature,${JSON.stringify(sig)});assert.equal(journal.receipt(${JSON.stringify(sig)}).projectionStatus,'complete');assert.equal(readCatalog(bondAddress).holderLabels[holderWallets[0]],'Recovered holder');assert.deepEqual(storage.verifyStorageIntegrity(),['ok']);assert.equal(sends,0);storage.closeStorage();`, directory);
});

test('completed journal migration re-reads its marker without writer locks and detects a changed marker', async () => {
  await success(`
    journal.migrateJournal();const marker=file('journal-migration.json');assert.ok(storage.readJson(marker,null));
    const {DatabaseSync}=await import('node:sqlite'),originalExec=DatabaseSync.prototype.exec;let begins=0;
    DatabaseSync.prototype.exec=function(sql){if(sql==='BEGIN IMMEDIATE')begins++;return Reflect.apply(originalExec,this,[sql]);};
    journal.journalValues('operations');journal.receipts();journal.receipt(${JSON.stringify(signature(9600))});assert.equal(begins,0,'Fresh persisted migration marker reads must not reserve a writer');
    storage.writeJson(marker,false);begins=0;journal.journalValues('operations');assert.ok(begins>0,'An altered marker must be observed and rechecked inside an atomic migration');assert.equal(storage.readJson(marker,null).schemaVersion,1);assert.deepEqual(storage.verifyStorageIntegrity(),['ok']);assert.equal(sends,0);storage.closeStorage();
  `, namespace('journal-marker-fresh-read'));
});

test('malformed status or RPC envelope cannot persist confirmation or complete a catalog projection', async () => {
  const directory = namespace('malformed-status');
  const signatures = Array.from({length: 9}, (_, i) => signature(7000 + i));
  await success(projectionFixture + `
    saveFixture(record);saveCatalog(record);
    const statusMock=globalThis.fetch;let variant=0;
    globalThis.fetch=async(input,init)=>{const req=JSON.parse(String(init?.body));if(req.method!=='getSignatureStatuses')return statusMock(input,init);
      const value={err:null,slot:700,confirmationStatus:'confirmed'},result={context:{slot:701},value:[value]},envelope={jsonrpc:'2.0',id:req.id,result};
      if(variant===0)delete value.err;if(variant===1)value.err=false;if(variant===2)value.err=0;if(variant===3)delete result.context;if(variant===4)value.slot=702;
      if(variant===5)result.context.slot=701.5;if(variant===6)envelope.id=req.id+1;if(variant===7)delete envelope.jsonrpc;if(variant===8)envelope.error={code:-32000,message:'Synthetic conflicting result/error'};
      return Response.json(envelope);
    };
    const signatures=${JSON.stringify(signatures)};
    for(variant=0;variant<signatures.length;variant++){
      const signature=signatures[variant],id='malformed-status_'+variant;operations.beginOperation(id,'create_vote','test-only',{proposalId:'31'});operations.updateOperation(id,{signature,bond:bondAddress,wallet:issuer,status:'pending',chainStatus:'pending',projectionStatus:'pending',params:{proposalId:'31'}});
      await assert.rejects(()=>rpc.transactionStatus(signature),code('RPC_INVALID'));assert.equal(journal.receipt(signature),null);
      await assert.rejects(()=>operations.operationStatus(id),code('RPC_INVALID'));assert.equal(journal.receipt(signature),null);
      assert.equal(operations.findOperation(id).chainStatus,'pending');assert.equal(operations.findOperation(id).projectionStatus,'pending');assert.deepEqual(readCatalog(bondAddress).proposalIds,[]);assert.deepEqual(fixture().proposalIds,[]);
    }
    assert.equal(sends,0);assert.deepEqual(journal.receipts(),[]);storage.closeStorage();
  `, directory);
});

test('null fee and incomplete or false simulation error fields reject before prepared persistence or relay', async () => {
  await success(`
    const actor=await generateKeyPairSigner(),transport=globalThis.fetch;let variant='fee-null';
    globalThis.fetch=async(input,init)=>{const req=JSON.parse(String(init?.body));if(req.method==='getFeeForMessage'&&variant==='fee-null')return Response.json({jsonrpc:'2.0',id:req.id,result:{context:{slot:600},value:null}});
      if(req.method==='simulateTransaction'&&variant!=='fee-null'){const value={err:null,unitsConsumed:1000,logs:[]};if(variant==='simulation-missing-err')delete value.err;if(variant==='simulation-false-err')value.err=false;return Response.json({jsonrpc:'2.0',id:req.id,result:{context:{slot:600},value}});}return transport(input,init);};
    await assert.rejects(()=>signed(actor,31),code('FEE_UNAVAILABLE'));
    for(const next of ['simulation-missing-err','simulation-false-err']){variant=next;await assert.rejects(()=>signed(actor,32),code('RPC_INVALID'));}
    assert.equal(sends,0);assert.deepEqual(journal.receipts(),[]);assert.deepEqual(journal.journalValues('prepared'),[]);storage.closeStorage();
  `, namespace('fee-simulation'));
});
