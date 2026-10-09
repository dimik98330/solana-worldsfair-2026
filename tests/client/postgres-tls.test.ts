import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const endpoint=process.env.BONDTRACE_TEST_PG_URL,ca=process.env.BONDTRACE_TEST_PG_CA;
for(const mode of ['verified','unknown-ca','wrong-host'])test('real PostgreSQL TLS '+mode,{skip:!endpoint||!ca},async()=>{
 const url=new URL(endpoint!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'32545');assert.equal(url.pathname,'/bondtrace_tests');
 const source=`import assert from 'node:assert/strict';import {Pool} from 'pg';import {postgresPolicy} from './server/postgres-policy.ts';const options=postgresPolicy({DATABASE_URL:process.env.BONDTRACE_TEST_PG_URL},'localnet','program');
 assert.equal(options.connection.ssl.rejectUnauthorized,true);assert.equal(options.connection.enableChannelBinding,true);if(process.env.PG_TLS_CASE==='wrong-host')options.connection.ssl={...options.connection.ssl,servername:'invalid.bondtrace.test'};
 const pool=new Pool(options.connection);let code;try{const connection=await pool.connect();try{const result=await connection.query('SELECT ssl,version FROM pg_stat_ssl WHERE pid=pg_backend_pid()');assert.equal(result.rows[0].ssl,true);assert.match(result.rows[0].version,/^TLSv1\\.[23]$/);}finally{connection.release();}}catch(error){code=error.code;}finally{await pool.end();}
 if(process.env.PG_TLS_CASE==='verified')assert.equal(code,undefined);else if(process.env.PG_TLS_CASE==='wrong-host')assert.equal(code,'ERR_TLS_CERT_ALTNAME_INVALID');else assert.ok(['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN'].includes(code));console.log(JSON.stringify({checked:process.env.PG_TLS_CASE}));`;
 const child=spawn(process.execPath,['--import','tsx','--input-type=module','--eval',source],{cwd:process.cwd(),windowsHide:true,env:{...process.env,PG_TLS_CASE:mode,NODE_EXTRA_CA_CERTS:mode==='unknown-ca'?'':ca!}});let errors='';child.stderr.on('data',data=>errors+=String(data));child.stdout.resume();
 const code=await new Promise<number|null>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('TLS test timed out'));},30000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',value=>{clearTimeout(timer);resolve(value);});});assert.equal(code,0,errors);
});
