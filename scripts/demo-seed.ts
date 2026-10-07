import {bootstrap} from '../server/seed.ts';
const args=process.argv.slice(2),position=args.indexOf('--operation-id'),operationId=position>=0?args[position+1]:crypto.randomUUID();
if(typeof operationId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(operationId))throw new Error('Provide a valid --operation-id');
console.log(JSON.stringify({stage:'starting',operationId,reset:args.includes('--reset')}));
try{console.log(JSON.stringify(await bootstrap(args.includes('--reset'),operationId)));}catch(error){console.error(error instanceof Error?error.message:'Demo seed failed');process.exitCode=1;}
