import fs from 'node:fs';
import {activityFile,fixtureFile} from './config.ts';
export interface Fixture {seriesId:string;bond:string;name:string;settlementMint:string;createdAt:string;rateBps:number;couponFrequency:number;roles:Record<string,string>;proposalIds:string[];complete:boolean;accelerated:boolean;bootstrapSignature?:string;}
export interface Activity {signature:string;time:string;kind:string;status:string;slot?:number|null;explorerUrl:string;account?:string;}
export function jsonWrite(file:string,value:unknown){const temporary=file+'.tmp';fs.writeFileSync(temporary,JSON.stringify(value,(_key,item)=>typeof item==='bigint'?item.toString():item,2),{mode:0o600});fs.renameSync(temporary,file);}
export function fixture():Fixture|null{return fs.existsSync(fixtureFile)?JSON.parse(fs.readFileSync(fixtureFile,'utf8')):null;}
export function saveFixture(value:Fixture){jsonWrite(fixtureFile,value);}
export function recordProposal(bond:string,id:string){const value=fixture();if(value?.bond===bond&&!value.proposalIds.includes(id)){value.proposalIds.push(id);saveFixture(value);}}
export function activities():Activity[]{const values:Activity[]=fs.existsSync(activityFile)?JSON.parse(fs.readFileSync(activityFile,'utf8')):[];return values.sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));}
export function recordActivity(value:Activity){const previous=activities();const index=previous.findIndex(a=>a.signature===value.signature);if(index<0)jsonWrite(activityFile,[value,...previous].slice(0,150));else if(previous[index].status==='pending'||value.status==='confirmed'){previous[index]={...previous[index],...value};jsonWrite(activityFile,previous);}}
