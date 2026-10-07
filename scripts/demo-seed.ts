import {bootstrap} from '../server/seed.ts';
try{console.log(JSON.stringify(await bootstrap(process.argv.includes('--reset'))));}catch(error){console.error(error instanceof Error?error.message:'Demo seed failed');process.exitCode=1;}
