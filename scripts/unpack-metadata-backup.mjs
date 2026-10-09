import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
const args=process.argv.slice(2);if(args.length!==2)throw new Error('Usage: node scripts/unpack-metadata-backup.mjs <download.json> <new-output-directory>');
const input=path.resolve(args[0]),output=path.resolve(args[1]),limit=32*1024*1024;
if(fs.statSync(input).size>64*1024*1024)throw new Error('Download exceeds64MiB');
const value=JSON.parse(fs.readFileSync(input,'utf8'));
if(value?.schema!=='bondtrace.metadata-download.v1'||value.database?.encoding!=='base64'||typeof value.database.data!=='string'||value.database.data.length>Math.ceil(limit/3)*4)throw new Error('Invalid portable metadata envelope');
const bytes=Buffer.from(value.database.data,'base64'),sha256=createHash('sha256').update(bytes).digest('hex');
if(bytes.toString('base64')!==value.database.data||bytes.length>limit||bytes.length!==value.manifest?.bytes||sha256!==value.manifest.sha256||value.manifest.schemaVersion!==1)throw new Error('Metadata size/hash/schema verification failed');
// Exclusive new directory/files. No restore, existing-data replacement or wallet import.
fs.mkdirSync(output,{mode:0o700});const database=path.join(output,'metadata.sqlite');fs.writeFileSync(database,bytes,{flag:'wx',mode:0o600});
const db=new DatabaseSync(path.toNamespacedPath(database),{readOnly:true,allowExtension:false,enableDoubleQuotedStringLiterals:false});
try{db.exec('PRAGMA trusted_schema=OFF');const check=db.prepare('PRAGMA integrity_check').all();if(check.length!==1||check[0].integrity_check!=='ok'||db.prepare('PRAGMA application_id').get().application_id!==1112822339||db.prepare('PRAGMA user_version').get().user_version!==1)throw new Error('Downloaded SQLite integrity/identity failed');}finally{db.close();}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(value.manifest,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({output,bytes:bytes.length,sha256,integrity:'ok',restored:false}));
