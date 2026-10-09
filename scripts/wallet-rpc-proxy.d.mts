import type {Server} from 'node:http';
export function walletRpcTarget(value:string):string;
export function walletRpcRead(method:unknown):boolean;
export function createWalletRpcProxy(target:string):Server;
