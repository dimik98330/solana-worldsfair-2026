import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyHostedAssets} from './hosted-assets.mjs';
const publicOrigin=new URL(process.env.BONDTRACE_PUBLIC_ORIGIN??'');
if(publicOrigin.protocol!=='https:'||publicOrigin.origin!==process.env.BONDTRACE_PUBLIC_ORIGIN)throw new Error('Use the exact configured HTTPS application origin');
const target=new URL(process.env.BONDTRACE_VERIFY_ORIGIN??publicOrigin.origin);
if(target.origin!==publicOrigin.origin&&!(target.protocol==='http:'&&target.hostname==='127.0.0.1'&&target.port&&target.pathname==='/'))throw new Error('Verification target must be the exact hosted origin or explicit loopback test port');
const username=process.env.BONDTRACE_HTTP_USER,password=process.env.BONDTRACE_HTTP_PASSWORD;
if(!username||!password)throw new Error('Set operator credentials in the environment; never put them in the URL');
const auth='Basic '+Buffer.from(username+':'+password).toString('base64');
async function request(route,options={}){return fetch(target.origin+route,{...options,headers:{authorization:auth,...options.headers},redirect:'error',signal:AbortSignal.timeout(30000)});}
const liveness=await fetch(target.origin+'/healthz',{redirect:'error',signal:AbortSignal.timeout(5000)});assert.equal(liveness.status,200);assert.deepEqual(await liveness.json(),{status:'alive'});
const denied=await fetch(target.origin+'/',{redirect:'error',signal:AbortSignal.timeout(5000)});assert.equal(denied.status,401);assert.match(denied.headers.get('www-authenticate')??'',/^Basic /);
const index=await request('/');assert.equal(index.status,200);const html=await index.text();
const entryAssets=await verifyHostedAssets(html,route=>request(route));
const response=await request('/api/health');assert.equal(response.status,200);const health=await response.json();
assert.equal(health.chain.network,'devnet');assert.equal(health.chain.genesisHash,'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');assert.equal(health.demo,false);
const post=(route,origin)=>request(route,{method:'POST',headers:{'content-type':'application/json',origin},body:'{}'});
assert.equal((await post('/api/actions/prepare','https://foreign.invalid')).status,403);
const demo=await post('/api/demo/bootstrap',publicOrigin.origin);assert.equal(demo.status,403);assert.equal((await demo.json()).error.code,'DEMO_DISABLED');
const readiness=await post('/api/runtime/readiness',publicOrigin.origin);assert.equal(readiness.status,200);const ready=await readiness.json();assert.equal(ready.storage.verified,true);assert.ok(ready.slotAfter>ready.slotBefore);
if(process.env.BONDTRACE_VERIFY_REQUIRE_PROGRAM!=='false')assert.equal(health.program.status,'known-match','Deploy and verify the exact program before accepting the public demo');
else if(target.protocol!=='http:'||target.hostname!=='127.0.0.1')throw new Error('Skipping the program gate is permitted only for explicit loopback diagnostics');
const result={checkedAt:new Date().toISOString(),target:target.origin,network:'devnet',liveness:true,authentication:true,htmlVerified:true,entryAssetsVerified:true,entryAssets,foreignOriginRejected:true,generatedDemoRejected:true,storageReadWrite:true,chainAdvancing:true,programStatus:health.program.status,financialReady:health.program.signingAllowed===true,scope:'HTTP/configuration/storage-readiness plus actual entry JS/CSS bytes verification. No wallet signature or financial transaction submitted; full financial/wallet checks remain separate. Missing program is allowed only in explicit loopback diagnostic mode.'};
if(process.env.BONDTRACE_VERIFY_OUTPUT){const output=process.env.BONDTRACE_VERIFY_OUTPUT;if(!/\.json$/.test(output))throw new Error('Use a JSON evidence destination');fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify(result));
