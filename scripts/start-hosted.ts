import fs from 'node:fs';
import {readHostingPolicy,assertHostedVolume} from '../server/hosting-policy.ts';
process.umask(0o077);
const policy=readHostingPolicy();
if(policy.mode!=='hosted')throw new Error('This entrypoint requires explicit hosted configuration');
assertHostedVolume(policy);
// Only the validated dedicated volume root needs ownership on first mount.
// Existing files, external paths and the original workstation ledger are untouched.
if(process.getuid?.()===0){
  const directory=policy.persistentRoot??policy.dataDirectory!;
  if(policy.storageBackend==='postgres'){fs.mkdirSync(directory,{recursive:true});if(fs.realpathSync(directory)!==directory)throw new Error('Hosted scratch directory must not be linked');}
  fs.chownSync(directory,1000,1000);
  process.setgid!(1000);process.setuid!(1000);
}
if(process.getuid?.()===0)throw new Error('Hosted API must not run as root');
await import('../server/index.ts');
