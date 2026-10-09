import type {PoolConfig} from 'pg';
export interface PostgresPolicy {connection:PoolConfig;namespace:string;network:'localnet'|'devnet';programId:string;transactionTimeoutMs:number;maxSnapshotBytes:number;}
/** Parse server-only credentials without passing URL SSL parameters to pg's parser. */
export function postgresPolicy(env:NodeJS.ProcessEnv,network:'localnet'|'devnet',programId:string):PostgresPolicy{
 let url:URL;try{url=new URL(env.DATABASE_URL??'');}catch{throw new Error('PostgreSQL requires a valid server-only DATABASE_URL');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.hash||!url.username||!url.password||!/^\/[^/]+$/.test(url.pathname))throw new Error('Invalid PostgreSQL connection configuration');
 const allowed=new Set(['sslmode','channel_binding']);for(const key of url.searchParams.keys())if(!allowed.has(key))throw new Error('Unsupported PostgreSQL URL options');
 const tlsMode=env.BONDTRACE_DATABASE_TLS??'verify-full';
 const loopback=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 const localOnly=tlsMode==='local-only'&&(env.BONDTRACE_DEPLOYMENT??'local')==='local'&&network==='localnet'&&loopback;
 if(!localOnly&&tlsMode!=='verify-full')throw new Error('Only explicit loopback localnet development may disable database TLS');
 if(!localOnly&&url.searchParams.has('sslmode')&&!['require','verify-full','verify-ca'].includes(url.searchParams.get('sslmode')!))throw new Error('Database TLS verification cannot be disabled');
 const namespace=env.BONDTRACE_DATABASE_NAMESPACE??('bondtrace-'+network);
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/.test(namespace))throw new Error('PostgreSQL document namespace must contain 8–128 letters, digits, underscores or hyphens');
 const port=url.port?Number(url.port):5432;if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PostgreSQL port');
 let user:string,password:string,database:string;try{user=decodeURIComponent(url.username);password=decodeURIComponent(url.password);database=decodeURIComponent(url.pathname.slice(1));}catch{throw new Error('Invalid PostgreSQL credentials encoding');}
 if([user,password,database].some(value=>!value||value.includes('\0')))throw new Error('Invalid PostgreSQL connection fields');
 return {connection:{host:url.hostname.replace(/^\[|\]$/g,''),port,user,password,database,ssl:localOnly?false:{rejectUnauthorized:true},enableChannelBinding:!localOnly,max:1,idleTimeoutMillis:30000,connectionTimeoutMillis:5000,application_name:'BondTrace'},namespace,network,programId,transactionTimeoutMs:10000,maxSnapshotBytes:32*1024*1024};
}
