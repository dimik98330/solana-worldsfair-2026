import path from 'node:path';
import {localDir} from '../server/config.ts';
import {backupStorage,closeStorage,storageDiagnostics} from '../server/storage.ts';

const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--backup')||args.length>1)throw new Error('Use metadata-check.ts with optional --backup');
try{
  const storage=storageDiagnostics({integrityCheck:true});
  const backup=args.includes('--backup')?backupStorage(path.join(localDir,'backups','metadata-'+Date.now()+'.sqlite')):undefined;
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),scope:'Local public metadata only; no signer-key access, chain mutation or automatic restore.',storage,...(backup?{backup}:{} )},null,2));
}finally{closeStorage();}
