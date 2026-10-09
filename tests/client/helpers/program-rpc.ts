import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {mock} from 'node:test';
import {getAddressEncoder,getProgramDerivedAddress,address} from '@solana/kit';
import {PROGRAM_ID} from '../../../packages/client/src/program.ts';
// Synthetic transport fixture only. Mock the expected manifest at the file-read
// boundary, never on disk, so Node tests need no Rust build or live network.
// The normal deployment guard still validates all accounts/hash/race checks.
const loader=address('BPFLoaderUpgradeab1e11111111111111111111111');
const image=Buffer.from('synthetic-unit-test-program-payload');
const manifest=JSON.stringify({schemaVersion:1,programId:PROGRAM_ID,loader:'BPFLoaderUpgradeable',programLen:image.length,sha256:createHash('sha256').update(image).digest('hex')});
const releaseFile=path.resolve('programs/bondtrace/release.json'),readFile=fs.readFileSync.bind(fs);
mock.method(fs,'readFileSync',(file:any,options?:any)=>{
  const filename=file instanceof URL?fileURLToPath(file):typeof file==='string'?path.resolve(file):null;
  if(filename===releaseFile)return typeof options==='string'||options?.encoding?manifest:Buffer.from(manifest);
  return readFile(file,options);
});
const programData=(await getProgramDerivedAddress({programAddress:loader,seeds:[getAddressEncoder().encode(PROGRAM_ID)]}))[0];
const program=Buffer.alloc(36);program.writeUInt32LE(2);Buffer.from(getAddressEncoder().encode(programData)).copy(program,4);
const header=Buffer.alloc(45);header.writeUInt32LE(3);header.writeBigUInt64LE(1n,4);
const payload=Buffer.concat([header,image]);
export function programRpc(request:{method:string;params?:any[]}):unknown|undefined{
  const params=request.params??[],options=params[1]??{};
  const envelope=(key:string)=>{
    const data=key===PROGRAM_ID?program:payload,slice=options.dataSlice;
    return {owner:loader,executable:key===PROGRAM_ID,lamports:10_000_000_000,space:data.length,data:[(slice?data.subarray(slice.offset,slice.offset+slice.length):data).toString('base64'),'base64']};
  };
  if(request.method==='getAccountInfo'&&[PROGRAM_ID,programData].includes(params[0]))return {context:{slot:100},value:envelope(params[0])};
  if(request.method==='getMultipleAccounts'&&Array.isArray(params[0])&&params[0].length>0&&params[0].every((key:string)=>key===PROGRAM_ID||key===programData))return {context:{slot:100},value:params[0].map(envelope)};
  return undefined;
}
