import fs from 'node:fs';
import {readHostingPolicy,assertHostedVolume} from '../server/hosting-policy.ts';
process.umask(0o077);
const policy=readHostingPolicy();
if(policy.mode!=='hosted')throw new Error('This entrypoint requires explicit hosted configuration');
assertHostedVolume(policy);
// Only the validated dedicated volume root needs ownership on first mount.
// Existing files, external paths and the original workstation ledger are untouched.
if(process.getuid?.()===0){
  fs.chownSync(policy.persistentRoot!,1000,1000);
  process.setgid!(1000);process.setuid!(1000);
}
if(process.getuid?.()===0)throw new Error('Hosted API must not run as root');
await import('../server/index.ts');
