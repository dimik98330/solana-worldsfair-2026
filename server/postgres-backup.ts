import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import type {RemoteSnapshot} from './remote-postgres-engine.mjs';
import {PostgresBridgeError} from './postgres-bridge.ts';
const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
/** Materialize an acknowledged primary export into a new verified portable SQLite snapshot. */
export function materializePostgresBackup(snapshot:RemoteSnapshot,destination:string){
 const data={documents:snapshot.documents,storageMeta:snapshot.storageMeta,legacyImports:snapshot.legacyImports};
 if(digest(JSON.stringify(data))!==snapshot.dataSha256)throw new PostgresBridgeError('STORAGE_BACKUP_INTEGRITY');
 fs.closeSync(fs.openSync(destination,'wx',0o600));
 const db=new DatabaseSync(path.toNamespacedPath(destination),{allowExtension:false,enableDoubleQuotedStringLiterals:false});
 let begun=false;
 try{
  db.exec(`PRAGMA synchronous=EXTRA;PRAGMA trusted_schema=OFF;BEGIN IMMEDIATE;
    CREATE TABLE documents(key TEXT PRIMARY KEY NOT NULL,body TEXT NOT NULL CHECK(json_valid(body)),updated_at TEXT NOT NULL) STRICT;
    CREATE TABLE storage_meta(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL) STRICT;
    CREATE TABLE legacy_imports(document_key TEXT PRIMARY KEY NOT NULL,source_sha256 TEXT NOT NULL,source_bytes INTEGER NOT NULL,imported_at TEXT NOT NULL) STRICT;
    PRAGMA application_id=1112822339;PRAGMA user_version=1;`);begun=true;
  const documents=db.prepare('INSERT INTO documents(key,body,updated_at) VALUES(?,?,?)');for(const row of snapshot.documents)documents.run(row.key,row.body,row.updatedAt);
  const meta=db.prepare('INSERT INTO storage_meta(key,value) VALUES(?,?)');for(const row of snapshot.storageMeta)meta.run(row.key,row.value);
  const imports=db.prepare('INSERT INTO legacy_imports(document_key,source_sha256,source_bytes,imported_at) VALUES(?,?,?,?)');for(const row of snapshot.legacyImports)imports.run(row.documentKey,row.sourceSha256,row.sourceBytes,row.importedAt);
  db.exec('COMMIT');begun=false;
 }catch(error){if(begun)try{db.exec('ROLLBACK');}catch{}throw error;}finally{db.close();}
 const verify=new DatabaseSync(path.toNamespacedPath(destination),{readOnly:true,allowExtension:false});
 try{
  const integrity=verify.prepare('PRAGMA integrity_check').all();if(integrity.length!==1||integrity[0].integrity_check!=='ok')throw new PostgresBridgeError('STORAGE_BACKUP_INTEGRITY');
  const docs=verify.prepare('SELECT key,body,updated_at FROM documents').all(),meta=verify.prepare('SELECT key,value FROM storage_meta').all(),imports=verify.prepare('SELECT document_key,source_sha256,source_bytes,imported_at FROM legacy_imports').all();
  if(docs.length!==snapshot.documents.length||meta.length!==snapshot.storageMeta.length||imports.length!==snapshot.legacyImports.length)throw new PostgresBridgeError('STORAGE_BACKUP_INTEGRITY');
  const byKey=new Map(docs.map(row=>[String(row.key),row])),byMeta=new Map(meta.map(row=>[String(row.key),String(row.value)])),byImport=new Map(imports.map(row=>[String(row.document_key),row]));
  const restored={documents:snapshot.documents.map(row=>{const actual=byKey.get(row.key);if(!actual||actual.body!==row.body||actual.updated_at!==row.updatedAt)throw new PostgresBridgeError('STORAGE_BACKUP_INTEGRITY');return row;}),storageMeta:snapshot.storageMeta.map(row=>{if(byMeta.get(row.key)!==row.value)throw new PostgresBridgeError('STORAGE_BACKUP_INTEGRITY');return row;}),legacyImports:snapshot.legacyImports.map(row=>{const actual=byImport.get(row.documentKey);if(!actual||actual.source_sha256!==row.sourceSha256||actual.source_bytes!==row.sourceBytes||actual.imported_at!==row.importedAt)throw new PostgresBridgeError('STORAGE_BACKUP_INTEGRITY');return row;})};
  if(digest(JSON.stringify(restored))!==snapshot.dataSha256)throw new PostgresBridgeError('STORAGE_BACKUP_INTEGRITY');
 }finally{verify.close();}
 const result={path:destination,schemaVersion:1,bytes:fs.statSync(destination).size,sha256:digest(fs.readFileSync(destination)),integrityCheck:['ok'],source:{backend:'postgres',snapshotDataSha256:snapshot.dataSha256,observedGeneration:snapshot.generation,acknowledgedAt:snapshot.acknowledgedAt,network:snapshot.metadata.network,programId:snapshot.metadata.program_id,scope:'Consistent public metadata only; no keys, DB credentials or automatic restore'}};
 fs.writeFileSync(destination+'.manifest.json',JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});return result;
}
