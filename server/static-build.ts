import fs from 'node:fs';
import path from 'node:path';

/** Pin a built UI without moving financial data or following paths outside this workspace. */
export function resolveStaticBuild(root:string,configured?:string){
  if(configured===undefined)return path.resolve(root,'apps/web/dist');
  if(!configured.trim()||configured.includes('\0'))throw new Error('Invalid static build directory');
  const base=fs.realpathSync(root),resolved=fs.realpathSync(path.resolve(root,configured));
  const relative=path.relative(base,resolved);
  if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Static build must stay inside the project workspace');
  const index=path.join(resolved,'index.html');
  if(fs.lstatSync(index).isSymbolicLink()||!fs.statSync(index).isFile())throw new Error('Static build must contain a regular index.html');
  return resolved;
}

/** Check the final asset as well as the directory, including nested junctions. */
export function staticAssetInside(directory:string,file:string){
  try{
    const root=fs.realpathSync(directory),actual=fs.realpathSync(file),relative=path.relative(root,actual);
    return Boolean(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)&&fs.statSync(actual).isFile();
  }catch{return false;}
}
