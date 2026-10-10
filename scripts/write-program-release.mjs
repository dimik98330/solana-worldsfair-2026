import fs from 'node:fs';
import {createHash} from 'node:crypto';
const image=fs.readFileSync(new URL('../target/deploy/bondtrace.so',import.meta.url));
const idl=JSON.parse(fs.readFileSync(new URL('../programs/bondtrace/bondtrace-idl.json',import.meta.url),'utf8'));
if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(idl.address))throw new Error('Generated IDL has no valid program address');
const release={schemaVersion:1,programId:idl.address,loader:'BPFLoaderUpgradeable',programLen:image.length,sha256:createHash('sha256').update(image).digest('hex'),releaseId:'paged-corporate-actions-v4'};
const file=new URL('../programs/bondtrace/release.json',import.meta.url);
if(process.argv.includes('--check')){const current=JSON.parse(fs.readFileSync(file,'utf8'));for(const key of ['programId','loader','programLen','sha256'])if(current[key]!==release[key])throw new Error('Program image differs from release metadata: '+key);}
else fs.writeFileSync(file,JSON.stringify(release,null,2)+'\n');
console.log(JSON.stringify({programId:release.programId,bytes:release.programLen,sha256:release.sha256,mode:process.argv.includes('--check')?'verified':'updated'}));
