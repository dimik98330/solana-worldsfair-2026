import {spawn} from 'node:child_process';
const raw=process.env.BONDTRACE_TEST_PG_URL;if(!raw)throw new Error('Set BONDTRACE_TEST_PG_URL for an isolated loopback test database; refusing a silently skipped integration run');
const url=new URL(raw);if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.port!=='32545'||url.pathname!=='/bondtrace_tests')throw new Error('Only the isolated loopback database127.0.0.1:32545/bondtrace_tests is allowed; never use the app/Neon DATABASE_URL');
const names=['remote-postgres-engine','remote-document-state','postgres-policy','postgres-bridge','postgres-storage','postgres-financial-barrier','postgres-signing-fence','postgres-tls'];
if(!process.env.BONDTRACE_TEST_PG_CA)console.log('TLS handshake cases require BONDTRACE_TEST_PG_CA and a matching local TLS server; those cases will be explicitly skipped.');
const child=spawn(process.execPath,['--import','tsx','--test','--test-concurrency=1',...names.map(name=>'tests/client/'+name+'.test.ts')],{stdio:'inherit',windowsHide:true});
child.once('error',()=>{console.error('PostgreSQL test process could not start');process.exitCode=1;});child.once('close',code=>{process.exitCode=code??1;});
