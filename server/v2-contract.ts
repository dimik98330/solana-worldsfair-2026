import {address} from '@solana/kit';
import {MAX_U64} from '../packages/client/src/domain.ts';
import {AppError} from './rpc.ts';
import {normalizeRateDescriptor,verifyRateAmounts} from './rate-terms.ts';
import type {ContractRequest} from './request-contract.ts';

export const v2ActionNames = new Set(['initialize_issue_v2','append_schedule_v2','create_registry_page_v2','register_holder_v2','issue_units_v2','fund_vault_v2','seal_issue_v2','transfer_units_v2','begin_coupon_v2','begin_redemption_v2','create_proposal_v2','capture_action_page_v2','finalize_action_v2','claim_coupon_v2','settle_coupon_v2','redeem_principal_v2','cast_vote_v2']);
const U32 = 4294967295n, TIME = 8640000000000n;
function fail(code:string,message:string):never {throw new AppError(code,message);}
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))fail('INVALID_REQUEST','Expected named parameters');return v as Record<string,unknown>;}
function integer(v:unknown,name:string,max=MAX_U64,positive=false,counter=false):string {
  if(counter&&typeof v==='number'&&Number.isSafeInteger(v))v=String(v);
  if(typeof v!=='string'||!/^\d{1,20}$/.test(v))fail('INVALID_AMOUNT',`${name} must be an exact integer string`);
  const n=BigInt(v);if(n>max||(positive&&n===0n))fail('INVALID_AMOUNT',`${name} is outside its supported range`);return n.toString();
}
function key(v:unknown,name:string):string{if(typeof v!=='string')fail('MISSING_FIELD',`${name} is required`);try{return String(address(v));}catch{return fail('INVALID_ADDRESS',`${name} must be a complete Solana address`);}}
function text(v:unknown,name:string,max:number):string{if(typeof v!=='string'||!v.trim())fail('MISSING_FIELD',`${name} is required`);const s=v.trim();if(Buffer.byteLength(s)>max||Buffer.from(s).toString()!==s||/[\u0000-\u001f\u007f]/u.test(s))fail('INVALID_TEXT',`${name} exceeds its UTF-8 limits`);return s;}
function alias(raw:Record<string,unknown>,a:string,b:string,fn:(v:unknown)=>unknown){const x=raw[a]===undefined?undefined:fn(raw[a]),y=raw[b]===undefined?undefined:fn(raw[b]);if(x!==undefined&&y!==undefined&&x!==y)fail('PARAMETER_CONFLICT',`${a} and ${b} disagree`);return x??y;}
function couponRows(input:unknown,maximum:number){
  let rows=input;if(typeof rows==='string'){if(Buffer.byteLength(rows)>64000)fail('INVALID_SCHEDULE','Schedule JSON exceeds its bounded request size');try{rows=JSON.parse(rows);}catch{fail('INVALID_SCHEDULE','Invalid schedule JSON');}}
  if(!Array.isArray(rows)||rows.length<1||rows.length>maximum)fail('INVALID_SCHEDULE',maximum===16?'One-review v0 creation supports one to 16 coupons; use count-only creation and separate pages for larger schedules':'A schedule page contains one to eight coupons');
  let lastRecord=0n,lastPayment=0n;
  return rows.map(row=>{const c=object(row);if(Object.keys(c).some(k=>!['recordTs','paymentTs','unitAmount'].includes(k)))fail('INVALID_SCHEDULE','Unsupported coupon field');const normalized={recordTs:integer(c.recordTs,'recordTs',TIME,true),paymentTs:integer(c.paymentTs,'paymentTs',TIME,true),unitAmount:integer(c.unitAmount,'unitAmount',MAX_U64,true)},record=BigInt(normalized.recordTs),payment=BigInt(normalized.paymentTs);if(record<=lastRecord||payment<=lastPayment||payment<record)fail('INVALID_SCHEDULE','Coupon record and payment dates must increase strictly and payment must follow its record date');lastRecord=record;lastPayment=payment;return normalized;});
}
export function normalizeV2Request(input:unknown):ContractRequest {
  const r=object(input);if(Object.keys(r).some(k=>!['action','walletAddress','role','operationId','requestId','bondAddress','params'].includes(k)))fail('UNEXPECTED_PARAMETER','Unsupported request field');
  if(typeof r.action!=='string'||!v2ActionNames.has(r.action))fail('UNKNOWN_ACTION','Unsupported paged action');
  const raw=r.params===undefined?{}:object(r.params),p:Record<string,unknown>={},allowed=new Set(['bondAddress','instrumentAddress']);
  const allow=(...names:string[])=>names.forEach(n=>allowed.add(n));
  const counter=(name:string,a?:string,required=true)=>{allow(name,...(a?[a]:[]));const n=a?alias(raw,name,a,v=>integer(v,name,U32,false,true)):raw[name]===undefined?undefined:integer(raw[name],name,U32,false,true);if(n===undefined&&required)fail('MISSING_FIELD',`${name} is required`);if(n!==undefined)p[name]=n;};
  const target=alias(raw,'bondAddress','instrumentAddress',v=>key(v,'bondAddress'));
  if(target!==undefined&&r.bondAddress!==undefined&&target!==key(r.bondAddress,'bondAddress'))fail('PARAMETER_CONFLICT','Instrument addresses disagree');
  const bond=r.bondAddress===undefined?target:key(r.bondAddress,'bondAddress');if(bond!==undefined)p.bondAddress=bond;
  const actionIdentity=()=>{allow('actionKind','kind');const kind=alias(raw,'actionKind','kind',v=>{const k=v==='coupon'?1:v==='principal'?2:v==='vote'?3:Number(integer(v,'actionKind',3n,true,true));if(k<1||k>3)fail('INVALID_ACTION_KIND','Use coupon, principal or vote');return String(k);});if(kind===undefined)fail('MISSING_FIELD','actionKind is required');p.actionKind=kind;counter('actionId','id');if(kind==='2'&&p.actionId!=='0')fail('INVALID_ACTION_ID','Principal action ID is zero');};
  switch(r.action){
    case 'initialize_issue_v2':{
      allow('seriesId','name','settlementMint','faceValueMinor','maturityTs','couponCount','rateBps','couponFrequency','coupons');
      p.seriesId=integer(raw.seriesId,'seriesId');p.name=text(raw.name,'name',64);p.settlementMint=key(raw.settlementMint,'settlementMint');p.faceValueMinor=integer(raw.faceValueMinor,'faceValueMinor',MAX_U64,true);p.maturityTs=integer(raw.maturityTs,'maturityTs',TIME,true);p.couponCount=integer(raw.couponCount,'couponCount',U32,true,true);
      const rate=normalizeRateDescriptor(raw,BigInt(String(p.faceValueMinor)));if(rate){p.rateBps=rate.rateBps;p.couponFrequency=rate.couponFrequency;}
      if(raw.coupons!==undefined){const coupons=couponRows(raw.coupons,16);if(String(coupons.length)!==p.couponCount)fail('INVALID_SCHEDULE','couponCount must exactly match the provided complete schedule');if(coupons.some(c=>BigInt(c.paymentTs)>BigInt(String(p.maturityTs))))fail('INVALID_SCHEDULE','Every coupon payment must be at or before maturity');const amounts=coupons.map(c=>BigInt(c.unitAmount));if(BigInt(String(p.faceValueMinor))+amounts.reduce((a,b)=>a+b,0n)>MAX_U64)fail('INVALID_AMOUNT','Complete per-unit reserve exceeds u64');if(rate)verifyRateAmounts(rate,amounts);p.coupons=coupons;}break;
    }
    case 'append_schedule_v2':{
      counter('pageIndex','page');allow('coupons','terms');let rows=raw.coupons??raw.terms;if(raw.coupons!==undefined&&raw.terms!==undefined&&JSON.stringify(raw.coupons)!==JSON.stringify(raw.terms))fail('PARAMETER_CONFLICT','coupons and terms disagree');
      p.coupons=couponRows(rows,8);break;
    }
    case 'create_registry_page_v2':counter('pageIndex','page');break;
    case 'register_holder_v2':allow('holderWallet','label');p.holderWallet=key(raw.holderWallet,'holderWallet');counter('holderIndex','index',false);if(raw.label!==undefined&&raw.label!=='')p.label=text(raw.label,'label',64);break;
    case 'issue_units_v2':allow('holderWallet','units');p.holderWallet=key(raw.holderWallet,'holderWallet');p.units=integer(raw.units,'units',MAX_U64,true);break;
    case 'fund_vault_v2':allow('amountMinor');p.amountMinor=integer(raw.amountMinor,'amountMinor',MAX_U64,true);break;
    case 'transfer_units_v2':allow('targetWallet','destination','units');p.targetWallet=alias(raw,'targetWallet','destination',v=>key(v,'targetWallet'));if(p.targetWallet===undefined)fail('MISSING_FIELD','targetWallet is required');p.units=integer(raw.units,'units',MAX_U64,true);break;
    case 'begin_coupon_v2':case 'claim_coupon_v2':counter('couponId','index');break;
    case 'settle_coupon_v2':allow('holderWallet');counter('couponId','index');p.holderWallet=key(raw.holderWallet,'holderWallet');break;
    case 'create_proposal_v2':allow('title','closesAt','closesTs');counter('proposalId','id');p.title=text(raw.title,'title',96);p.closesAt=alias(raw,'closesAt','closesTs',v=>integer(v,'closesAt',TIME,true));if(p.closesAt===undefined)fail('MISSING_FIELD','closesAt is required');break;
    case 'capture_action_page_v2':actionIdentity();counter('pageIndex','page');break;
    case 'finalize_action_v2':actionIdentity();break;
    case 'cast_vote_v2':counter('proposalId','id');allow('choice','support');p.choice=alias(raw,'choice','support',v=>v===true||v==='yes'||v==='true'?'yes':v===false||v==='no'||v==='false'?'no':fail('INVALID_VOTE','Choose yes or no'));if(p.choice===undefined)fail('MISSING_FIELD','choice is required');break;
  }
  if(Object.keys(raw).some(k=>!allowed.has(k)))fail('UNEXPECTED_PARAMETER','Unsupported action parameter');
  const result:ContractRequest={action:r.action,params:p};if(bond!==undefined)result.bondAddress=String(bond);
  if(r.walletAddress!==undefined)result.walletAddress=key(r.walletAddress,'walletAddress');
  if(r.role!==undefined){if(typeof r.role!=='string'||!['issuer','investor1','investor2','investor3'].includes(r.role))fail('INVALID_DEMO_ROLE','Unknown generated identity');result.role=r.role;}
  const id=alias(r,'operationId','requestId',v=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(v))fail('INVALID_OPERATION_ID','Use an 8 to 100 character recovery identifier');return v;});if(id!==undefined)result.operationId=String(id);
  return result;
}
