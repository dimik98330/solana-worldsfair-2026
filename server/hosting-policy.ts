import {createHash,timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface HostingPolicy {mode:'local'|'hosted';bindHost:string;publicOrigin:string|null;authorizationDigest:Buffer|null;persistentRoot:string|null;dataDirectory:string|null;storageBackend:'sqlite'|'postgres';}
/** Hosting is explicit. Local validators, test keys and implicit public access stay local. */
export function readHostingPolicy(env:NodeJS.ProcessEnv=process.env,root=process.cwd()):HostingPolicy{
  const mode=env.BONDTRACE_DEPLOYMENT??'local';
  const storageBackend=env.BONDTRACE_STORAGE_BACKEND??'sqlite';if(!['sqlite','postgres'].includes(storageBackend))throw new Error('Invalid public metadata backend');
  if(!['local','hosted'].includes(mode))throw new Error('Invalid deployment mode');
  if(mode==='local')return {mode,bindHost:'127.0.0.1',publicOrigin:null,authorizationDigest:null,persistentRoot:null,dataDirectory:null,storageBackend:storageBackend as 'sqlite'|'postgres'};
  if(env.BONDTRACE_NETWORK!=='devnet'||env.BONDTRACE_ENABLE_DEMO!=='false')throw new Error('Hosted deployment requires devnet and disabled generated signing');
  const origin=new URL(env.BONDTRACE_PUBLIC_ORIGIN??'');
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||['localhost','127.0.0.1','[::1]'].includes(origin.hostname))throw new Error('Hosted deployment requires one explicit HTTPS application origin');
  const user=env.BONDTRACE_HTTP_USER??'',password=env.BONDTRACE_HTTP_PASSWORD??'';
  if(!/^[A-Za-z0-9_-]{3,64}$/.test(user)||!/^[\x21-\x7e]{24,256}$/.test(password))throw new Error('Hosted deployment requires operator credentials; use a unique random password of at least24characters');
  if(storageBackend==='postgres'){
    const ignored=path.resolve(root,'.local'),data=path.resolve(root,env.BONDTRACE_DATA_DIR??'.local/hosted/devnet'),relative=path.relative(ignored,data);
    if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Hosted scratch directory must stay inside ignored .local');
    return {mode:'hosted',bindHost:'0.0.0.0',publicOrigin:origin.origin,authorizationDigest:authDigest(user+':'+password),persistentRoot:null,dataDirectory:data,storageBackend};
  }
  const ignored=path.resolve(root,'.local'),persistent=path.resolve(root,env.BONDTRACE_PERSISTENT_ROOT??'');
  const relative=path.relative(ignored,persistent);
  if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Persistent storage must be a dedicated directory inside ignored .local');
  const data=path.resolve(root,env.BONDTRACE_DATA_DIR??''),dataRelative=path.relative(persistent,data);
  if(!dataRelative||dataRelative==='..'||dataRelative.startsWith('..'+path.sep)||path.isAbsolute(dataRelative))throw new Error('Hosted metadata must be a dedicated namespace below its persistent volume');
  return {mode:'hosted',bindHost:'0.0.0.0',publicOrigin:origin.origin,authorizationDigest:authDigest(user+':'+password),persistentRoot:persistent,dataDirectory:data,storageBackend:'sqlite'};
}
function authDigest(value:string){return createHash('sha256').update(value).digest();}
/** Public application routes use wallet authorization; these operator routes retain HTTP auth. */
export function requiresOperatorAuthorization(pathname:string){
  return pathname==='/api/runtime/readiness'||pathname==='/api/metadata'||pathname.startsWith('/api/metadata/');
}
export function hostingAuthorized(policy:HostingPolicy,authorization:string|undefined){
  if(policy.mode==='local')return true;
  if(!authorization||authorization.length>2048||!authorization.startsWith('Basic '))return false;
  const encoded=authorization.slice(6),bytes=Buffer.from(encoded,'base64');
  if(bytes.toString('base64')!==encoded)return false;
  const value=bytes.toString('utf8');
  return timingSafeEqual(authDigest(value),policy.authorizationDigest!);
}
export function persistentMountPresent(mountInfo:string,target:string){
  return mountInfo.split('\n').some(line=>{
    const [fields,filesystem]=line.split(' - ');if(!filesystem)return false;
    const point=fields.split(' ')[4]?.replace(/\\([0-7]{3})/g,(_m,octal:string)=>String.fromCharCode(parseInt(octal,8)));
    return point===target&&!['overlay','tmpfs','ramfs','proc','sysfs'].includes(filesystem.split(' ')[0]);
  });
}
/** An env var claiming durability is insufficient: inspect the actual Linux mount. */
export function assertHostedVolume(policy:HostingPolicy){
  if(policy.mode==='local'||policy.storageBackend==='postgres')return;
  const target=policy.persistentRoot!;
  if(process.platform!=='linux'||!persistentMountPresent(fs.readFileSync('/proc/self/mountinfo','utf8'),target))throw new Error('Hosted writes require an actual dedicated persistent Linux volume; ephemeral deployment refused');
  if(fs.realpathSync(target)!==target||!fs.statSync(target).isDirectory())throw new Error('Persistent volume must be a regular non-linked directory');
}
