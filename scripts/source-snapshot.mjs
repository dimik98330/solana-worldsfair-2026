import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function ordinaryFile(root,relative){
 const file=path.resolve(root,relative),boundary=path.resolve(root)+path.sep;
 if(!file.startsWith(boundary))return false;
 let current=file;
 for(;;){try{if(fs.lstatSync(current).isSymbolicLink())return false;}catch{return false;}if(current===path.resolve(root))break;current=path.dirname(current);}
 return fs.lstatSync(file).isFile();
}
function harmlessDrift(relative,original,staged){
 if(/^apps\/web\/src\/[A-Za-z0-9_-]+\.css$/.test(relative)||['brand.md','DESIGN.md'].includes(relative))return true;
 if(relative==='AGENTS.md'){
  const protectedSection='## Scope and continuity';
  const read=file=>{const text=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');const offset=text.indexOf(protectedSection);return offset<0?null:text.slice(offset);};
  const before=read(staged),after=read(original);return before!==null&&before===after;
 }
 return false;
}
/** Verify the tested snapshot itself; disclose unrelated concurrent styling without weakening financial gates. */
export function verifySourceSnapshot(sourceRoot,cleanRoot,files){
 const stagedSourceChanged=[],originalSourceChanged=[],runtimeSourceChanged=[],presentationDrift=[];
 for(const entry of files){
  const staged=path.resolve(cleanRoot,entry.path),original=path.resolve(sourceRoot,entry.path);
  if(!ordinaryFile(cleanRoot,entry.path)||digest(staged)!==entry.sha256)stagedSourceChanged.push(entry.path);
  if(!ordinaryFile(sourceRoot,entry.path)||digest(original)!==entry.sha256){
   originalSourceChanged.push(entry.path);
   if(ordinaryFile(sourceRoot,entry.path)&&ordinaryFile(cleanRoot,entry.path)&&harmlessDrift(entry.path,original,staged))presentationDrift.push(entry.path);else runtimeSourceChanged.push(entry.path);
  }
 }
 return {stagedSourceChanged,originalSourceChanged,runtimeSourceChanged,presentationDrift,stagedSnapshotVerified:stagedSourceChanged.length===0,currentRuntimeSourceMatches:runtimeSourceChanged.length===0,currentFrontendAcceptance:false};
}
