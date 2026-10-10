import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createKeyPairSignerFromBytes, address, type TransactionSigner} from '@solana/kit';
import {BUFFER_CHUNK_BYTES, BUFFER_HEADER_BYTES, bufferImageHash, exactBufferU64,
  validateBufferAccount, validateBufferEndpoint, runBufferStage, type BufferIntent, type BufferRpc} from './program-buffer.ts';
import {SqliteBufferJournal} from './program-buffer-journal.ts';
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const usage = ['BUFFER staging only: no upgrade, extend, close or mainnet. Default read-only.',
  'Required: --network=devnet|localnet --rpc=URL --genesis=HASH --id=RECOVERY_ID',
  '--authority=PUBKEY --buffer=PUBKEY --image=PATH --sha256=HASH --bytes=INTEGER',
  'To sign explicit buffer: --stage --authority-keypair=PATH [--buffer-keypair=PATH]',
  '--max-fees=LAMPORTS --max-tx-fee=LAMPORTS --max-rent=LAMPORTS',
  'Optional: --max-transactions=N --max-run-ms=N --pace-ms=N',
  'Resume SAME id/network/image/authority/buffer. Preserve journal and explicit keys.'].join('\n');
function args(argv: string[]) {
  const allowed = new Set(['network','rpc','genesis','id','authority','buffer','image','sha256','bytes',
    'authority-keypair','buffer-keypair','max-fees','max-tx-fee','max-rent','max-transactions','max-run-ms','pace-ms']);
  const values = new Map<string, string>(); let stage = false;
  for (const item of argv) {
    if (item === '--stage') { if (stage) throw Error('DUPLICATE_STAGE'); stage = true; continue; }
    const match = /^--([a-z][a-z0-9-]*)=(.+)$/.exec(item);
    if (!match || !allowed.has(match[1]) || values.has(match[1])) throw Error('INVALID_OR_DUPLICATE_ARGUMENT');
    values.set(match[1], match[2]);
  }
  const get = (key: string) => { const value = values.get(key); if (!value) throw Error('MISSING_' + key.toUpperCase()); return value; };
  const number = (key: string, fallback?: number) => {
    const text = values.get(key); if (!text && fallback !== undefined) return fallback;
    if (!text || !/^(0|[1-9][0-9]*)$/.test(text)) throw Error('INVALID_' + key.toUpperCase());
    const value = Number(text); if (!Number.isSafeInteger(value)) throw Error('UNSAFE_' + key.toUpperCase()); return value;
  };
  return {values, stage, get, number};
}
function safeFile(filename: string, maxBytes: number): Uint8Array {
  const file = path.resolve(filename);
  for (let current = file; ; current = path.dirname(current)) {
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw Error('SYMLINK_PATH_REFUSED');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (current === path.dirname(current)) break;
  }
  const info = fs.statSync(file);
  if (!info.isFile() || info.nlink > 1 || info.size > maxBytes) throw Error('INVALID_INPUT_FILE');
  return fs.readFileSync(file);
}
async function signer(filename: string, expected: string): Promise<TransactionSigner> {
  const parsed: unknown = JSON.parse(Buffer.from(safeFile(filename, 4096)).toString('utf8'));
  if (!Array.isArray(parsed) || parsed.length !== 64 || !parsed.every(n => Number.isSafeInteger(n) && n >= 0 && n <= 255)) throw Error('INVALID_EXPLICIT_TEST_SIGNER');
  const bytes = Uint8Array.from(parsed);
  try {
    const result = await createKeyPairSignerFromBytes(bytes);
    if (result.address !== expected) throw Error('EXPLICIT_SIGNER_ADDRESS_MISMATCH');
    return result;
  } finally { bytes.fill(0); parsed.fill(0); }
}
function wait(ms: number, signal: AbortSignal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, ms);
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(Error('ABORTED')); };
    function done() { signal.removeEventListener('abort', abort); resolve(); }
    signal.addEventListener('abort', abort, {once:true}); if (signal.aborted) abort();
  });
}
/** One request at a time, >=1250ms between EVERY devnet RPC start. No transport retries. */
export function bufferHttpRpc(endpoint: string, network: BufferIntent['network']): BufferRpc {
  let next = 0, lastStarted = 0, busy = false;
  return {endpoint, async request<T>(method: string, params: readonly unknown[], signal: AbortSignal): Promise<T> {
    if (busy) throw Error('CONCURRENT_BUFFER_RPC_REFUSED');
    busy = true;
    try {
      signal.throwIfAborted();
      if (network === 'devnet') await wait(Math.max(0,1250 - (Date.now() - lastStarted)), signal);
      signal.throwIfAborted(); lastStarted = Date.now(); const id = ++next;
      const response = await fetch(endpoint, {method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify({jsonrpc:'2.0',id,method,params}), redirect:'error', signal});
      if (!response.ok) {
        const error = new Error('RPC_HTTP_' + response.status) as Error & {status:number};
        error.status = response.status; throw error;
      }
      const limit = 16 * 1024 * 1024;
      if (!response.body) throw Error('RPC_BODY_MISSING');
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > limit) throw Error('RPC_BODY_TOO_LARGE');
          chunks.push(chunk.value);
        }
      } catch (error) {
        try { await reader.cancel(); } catch {}
        throw error;
      } finally { reader.releaseLock(); }
      const body = new TextDecoder('utf-8', {fatal:true}).decode(Buffer.concat(chunks, bytes));
      const value = JSON.parse(body);
      if (!value || value.jsonrpc !== '2.0' || value.id !== id || (('result' in value) === ('error' in value))) throw Error('RPC_ENVELOPE_INVALID');
      if (value.error) throw Error('RPC_ERROR_' + String(value.error.code));
      return value.result as T;
    } finally { busy = false; }
  }};
}
export async function programBufferCli(argv: string[]): Promise<number> {
  if (argv.length === 1 && argv[0] === '--help') { console.log(usage); return 0; }
  const {values,stage,get,number} = args(argv);
  const image = safeFile(get('image'), 10 * 1024 * 1024), imageLength = number('bytes');
  const intent: BufferIntent = {version:1,id:get('id'),network:get('network') as BufferIntent['network'],
    endpoint:new URL(get('rpc')).href,expectedGenesis:get('genesis'),authorityAddress:address(get('authority')),
    bufferAddress:address(get('buffer')),imageSha256:get('sha256'),imageLength,chunkSize:BUFFER_CHUNK_BYTES};
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(intent.id) || !/^[a-f0-9]{64}$/.test(intent.imageSha256)
    || image.length !== imageLength || !imageLength || bufferImageHash(image) !== intent.imageSha256
    || intent.bufferAddress === intent.authorityAddress) throw Error('BUFFER_IMAGE_OR_INTENT_INVALID');
  validateBufferEndpoint(intent);
  const rpc = bufferHttpRpc(intent.endpoint,intent.network);
  const abort = new AbortController(), stop = () => abort.abort();
  process.once('SIGINT',stop); process.once('SIGTERM',stop);
  const request = <T>(method:string,params:readonly unknown[]) => rpc.request<T>(method,params,AbortSignal.any([abort.signal,AbortSignal.timeout(25000)]));
  let journal: SqliteBufferJournal | undefined;
  try {
    if (await request('getGenesisHash',[]) !== intent.expectedGenesis) throw Error('GENESIS_MISMATCH');
    const account = await request<{context:{slot:number};value:unknown}>('getAccountInfo',[intent.bufferAddress,{encoding:'base64',commitment:'finalized'}]);
    const payload = account.value === null ? null : validateBufferAccount(account.value,intent);
    const rent = exactBufferU64(await request('getMinimumBalanceForRentExemption',[BUFFER_HEADER_BYTES+image.length]),'RENT');
    const balance = exactBufferU64((await request<{value:unknown}>('getBalance',[intent.authorityAddress,{commitment:'finalized'}])).value,'BALANCE');
    let missingChunks = 0;
    for (let offset=0;offset<image.length;offset+=BUFFER_CHUNK_BYTES) {
      const chunk=image.subarray(offset,offset+BUFFER_CHUNK_BYTES);
      if (!payload || !Buffer.from(payload.subarray(offset,offset+chunk.length)).equals(chunk)) missingChunks++;
    }
    console.log(JSON.stringify({mode:stage?'explicit-buffer-stage':'read-only',intent,existingBuffer:payload!==null,
      finalizedAccountSlot:String(account.context.slot),missingChunks,rentLamports:rent.toString(),payerLamports:balance.toString(),
      programUpgrade:false,signerFilesRead:false}));
    if (!stage) return 0;
    const maxFees=exactBufferU64(get('max-fees'),'MAX_FEES'),maxTxFee=exactBufferU64(get('max-tx-fee'),'MAX_TX_FEE'),maxRent=exactBufferU64(get('max-rent'),'MAX_RENT');
    if (maxFees===0n || maxTxFee===0n || maxRent < (payload ? 0n : rent)) throw Error('STAGE_BUDGET_INVALID');
    if (balance < maxTxFee + (payload ? 0n : rent)) throw Error('STAGE_BALANCE_INSUFFICIENT');
    const directory=path.join(workspace,'.local','program-buffer',intent.id,'journal');
    journal=new SqliteBufferJournal(workspace,directory,intent); journal.acquire(); journal.initialize(intent);
    const authority=await signer(get('authority-keypair'),intent.authorityAddress);
    const buffer=values.has('buffer-keypair')?await signer(get('buffer-keypair'),intent.bufferAddress):undefined;
    if (!payload && !buffer) throw Error('MISSING_EXPLICIT_NEW_BUFFER_SIGNER');
    const result=await runBufferStage({image,intent,authoritySigner:authority,bufferSigner:buffer,rpc,journal,signal:abort.signal,
      limits:{maxTotalFeeLamports:maxFees,maxTransactionFeeLamports:maxTxFee,maxRentLamports:maxRent,
        maxTransactions:number('max-transactions',2000),maxRunMs:number('max-run-ms',7200000),
        paceMs:number('pace-ms',2000),rpcTimeoutMs:25000,pollIntervalMs:1500,maxPolls:40},
      onProgress:progress=>console.log(JSON.stringify({progress}))});
    console.log(JSON.stringify({result,journalDirectory:directory,programUpgrade:false}));
    return result.status==='bufferReady'?0:2;
  } finally {
    journal?.close(); process.removeListener('SIGINT',stop); process.removeListener('SIGTERM',stop);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  programBufferCli(process.argv.slice(2)).then(code=>{process.exitCode=code;}).catch(error=>{
    console.error(JSON.stringify({status:'stopped',code:/^[A-Z][A-Z0-9_-]+$/.test(error?.message??'')?error.message:'BUFFER_CLI_FAILED_RETAIN_JOURNAL',
      programUpgrade:false,sensitiveDetailsOmitted:true}));process.exitCode=2;
  });
}
