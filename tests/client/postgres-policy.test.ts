import {test} from 'node:test';
import assert from 'node:assert/strict';
import {postgresPolicy} from '../../server/postgres-policy.ts';
const endpoint='postgresql://app:synthetic-secret@db.example.com/bondtrace?sslmode=require&channel_binding=require';
test('Postgres URL cannot override certificate verification and credentials stay out of errors',()=>{
 const policy=postgresPolicy({DATABASE_URL:endpoint},'devnet','program');assert.deepEqual(policy.connection.ssl,{rejectUnauthorized:true});assert.equal(policy.connection.enableChannelBinding,true);assert.equal(policy.connection.max,1);
 for(const value of [endpoint.replace('require&','disable&'),endpoint+'&sslrootcert=/private/file',endpoint+'#fragment'])assert.throws(()=>postgresPolicy({DATABASE_URL:value},'devnet','program'),error=>error instanceof Error&&!error.message.includes('synthetic-secret'));
});
test('unencrypted PG is limited to explicit loopback localnet development',()=>{
 const env={DATABASE_URL:'postgresql://app:synthetic-secret@127.0.0.1:32545/bondtrace',BONDTRACE_DATABASE_TLS:'local-only'};
 assert.equal(postgresPolicy(env,'localnet','program').connection.ssl,false);
 for(const override of [{BONDTRACE_DEPLOYMENT:'hosted'},{DATABASE_URL:endpoint}])assert.throws(()=>postgresPolicy({...env,...override},'localnet','program'));
 assert.throws(()=>postgresPolicy(env,'devnet','program'));
});
test('namespace boundaries match the Worker engine before any connection is attempted',()=>{
 for(const length of [3,7,129])assert.throws(()=>postgresPolicy({DATABASE_URL:endpoint,BONDTRACE_DATABASE_NAMESPACE:'a'.repeat(length)},'devnet','program'),/8–128/);
 for(const length of [8,64,65,128])assert.equal(postgresPolicy({DATABASE_URL:endpoint,BONDTRACE_DATABASE_NAMESPACE:'a'.repeat(length)},'devnet','program').namespace.length,length);
});
