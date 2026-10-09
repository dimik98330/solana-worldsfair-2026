import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {hostingAuthorized,persistentMountPresent,readHostingPolicy} from '../../server/hosting-policy.ts';
const root=path.resolve('.local/tests/hosting-policy');
const credentials={user:'jury-test',password:'only-a-synthetic-test-password-123'};
const valid:NodeJS.ProcessEnv={BONDTRACE_DEPLOYMENT:'hosted',BONDTRACE_NETWORK:'devnet',BONDTRACE_ENABLE_DEMO:'false',BONDTRACE_PUBLIC_ORIGIN:'https://bondtrace.example.com',BONDTRACE_HTTP_USER:credentials.user,BONDTRACE_HTTP_PASSWORD:credentials.password,BONDTRACE_PERSISTENT_ROOT:'.local/hosted',BONDTRACE_DATA_DIR:'.local/hosted/devnet'};

test('local default preserves loopback and needs no hosted credentials',()=>{
 const policy=readHostingPolicy({},root);assert.equal(policy.bindHost,'127.0.0.1');assert.equal(hostingAuthorized(policy,undefined),true);
});
test('hosted mode requires devnet, explicit disabled demo, credentials and exact HTTPS origin',()=>{
 const policy=readHostingPolicy(valid,root);assert.equal(policy.bindHost,'0.0.0.0');assert.equal(policy.publicOrigin,'https://bondtrace.example.com');
 for(const override of [{BONDTRACE_NETWORK:'localnet'},{BONDTRACE_ENABLE_DEMO:'true'},{BONDTRACE_ENABLE_DEMO:undefined},{BONDTRACE_HTTP_PASSWORD:'short'},{BONDTRACE_HTTP_USER:''},{BONDTRACE_PUBLIC_ORIGIN:'http://bondtrace.example.com'},{BONDTRACE_PUBLIC_ORIGIN:'https://u:p@bondtrace.example.com'},{BONDTRACE_PUBLIC_ORIGIN:'https://bondtrace.example.com/path'}])assert.throws(()=>readHostingPolicy({...valid,...override},root));
});
test('hosted storage must be a namespace under the dedicated ignored volume',()=>{
 for(const override of [{BONDTRACE_PERSISTENT_ROOT:undefined},{BONDTRACE_PERSISTENT_ROOT:'.local'},{BONDTRACE_PERSISTENT_ROOT:'../escape'},{BONDTRACE_DATA_DIR:'.local/hosted'},{BONDTRACE_DATA_DIR:'.local/another/devnet'}])assert.throws(()=>readHostingPolicy({...valid,...override},root));
});
test('hosted basic authentication refuses missing, wrong and noncanonical input',()=>{
 const policy=readHostingPolicy(valid,root),auth='Basic '+Buffer.from(credentials.user+':'+credentials.password).toString('base64');
 assert.equal(hostingAuthorized(policy,auth),true);
 for(const value of [undefined,'Bearer token','Basic !!!',auth+' ',auth.slice(0,-4),'Basic '+Buffer.from('other:'+credentials.password).toString('base64')])assert.equal(hostingAuthorized(policy,value),false);
 assert.equal(JSON.stringify(policy).includes(credentials.password),false);
});
test('durability check requires exact mount and rejects ephemeral filesystem claims',()=>{
 const line='29 23 0:26 / /app/.local/hosted rw,relatime - ext4 /dev/sdb rw';
 assert.equal(persistentMountPresent(line,'/app/.local/hosted'),true);
 assert.equal(persistentMountPresent(line,'/app/.local'),false);
 assert.equal(persistentMountPresent(line.replace('ext4','overlay'),'/app/.local/hosted'),false);
 assert.equal(persistentMountPresent(line.replace('ext4','tmpfs'),'/app/.local/hosted'),false);
 assert.equal(persistentMountPresent(line.replace('/app/','/app\\040space/'),'/app space/.local/hosted'),true);
});
