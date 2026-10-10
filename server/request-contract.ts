import {address} from '@solana/kit';
import {MAX_U64} from '../packages/client/src/domain.ts';
import {AppError} from './rpc.ts';
import {normalizeRateDescriptor,verifyRateAmounts} from './rate-terms.ts';
import {v2ActionNames,normalizeV2Request} from './v2-contract.ts';

export const actionNames=new Set(['initialize_issue','register_holder','issue_units','seal_issue','capture_coupon','claim_coupon','settle_coupon','begin_redemption','redeem_principal','create_vote','cast_vote','transfer_bonds','fund_vault',...v2ActionNames]);
function fail(code:string,message:string):never{throw new AppError(code,message);}
function object(value:unknown):Record<string,unknown>{if(value===null||typeof value!=='object'||Array.isArray(value))fail('INVALID_REQUEST','Expected an object containing named action parameters');return value as Record<string,unknown>;}
export function canonicalJson(value:unknown):string {
  const normalize=(item:unknown):unknown=>{
    if(item===null||typeof item==='string'||typeof item==='boolean')return item;
    if(typeof item==='number'){if(!Number.isSafeInteger(item))fail('INVALID_REQUEST','Numeric parameters must be safe integers; use decimal strings for money');return item;}
    if(typeof item==='bigint')return item.toString();
    if(Array.isArray(item))return item.map(normalize);
    if(typeof item==='object'&&item){const result:Record<string,unknown>={};for(const key of Object.keys(item).sort()){if(['__proto__','constructor','prototype'].includes(key))fail('INVALID_REQUEST','Unsupported parameter key');const value=(item as Record<string,unknown>)[key];if(value!==undefined)result[key]=normalize(value);}return result;}
    fail('INVALID_REQUEST','Unsupported parameter value');
  };return JSON.stringify(normalize(value));
}
function integer(value:unknown,field:string,positive=false,max=MAX_U64):string {
  if(typeof value!=='string'||!/^\d{1,20}$/.test(value))fail('INVALID_AMOUNT',`${field} must be an exact base-unit integer string`);
  const parsed=BigInt(value);if(parsed>max||(positive&&parsed===0n))fail('INVALID_AMOUNT',`${field} is outside its permitted integer range`);return parsed.toString();
}
function key(value:unknown,field:string):string{if(typeof value!=='string')fail('MISSING_FIELD',`${field} is required`);try{return String(address(value));}catch{return fail('INVALID_ADDRESS',`${field} must be a complete Solana address`);}}
function text(value:unknown,field:string,max:number):string{if(typeof value!=='string'||!value.trim())fail('MISSING_FIELD',`${field} is required`);const s=value.trim();if(Buffer.byteLength(s)>max||Buffer.from(s).toString()!==s||/[\u0000-\u001f\u007f]/u.test(s))fail('INVALID_TEXT',`${field} exceeds its UTF-8 or control-character limits`);return s;}
function alias(params:Record<string,unknown>,a:string,b:string,normalize:(v:unknown)=>unknown){const first=params[a]===undefined?undefined:normalize(params[a]),second=params[b]===undefined?undefined:normalize(params[b]);if(first!==undefined&&second!==undefined&&first!==second)fail('PARAMETER_CONFLICT',`${a} and ${b} refer to different values`);return first??second;}
export interface ContractRequest {action:string;walletAddress?:string;role?:string;operationId?:string;requestId?:string;bondAddress?:string;params:Record<string,unknown>;}
/** No amount, title or proposal identity is invented by the service. */
export function normalizeRequest(value:unknown):ContractRequest {
  if(value&&typeof value==='object'&&!Array.isArray(value)&&v2ActionNames.has(String((value as Record<string,unknown>).action)))return normalizeV2Request(value);
  const request=object(value);if(Object.keys(request).some(k=>!['action','walletAddress','role','operationId','requestId','bondAddress','params'].includes(k)))fail('UNEXPECTED_PARAMETER','The action request contains unsupported fields');if(typeof request.action!=='string'||!actionNames.has(request.action))fail('UNKNOWN_ACTION','Choose a supported corporate or issuer action');
  const raw=request.params===undefined?{}:object(request.params),params:Record<string,unknown>={};
  const target=alias({...raw,bondAddress:request.bondAddress??raw.bondAddress},'bondAddress','instrumentAddress',v=>key(v,'bondAddress'));
  if(request.bondAddress!==undefined&&raw.bondAddress!==undefined&&key(request.bondAddress,'bondAddress')!==key(raw.bondAddress,'bondAddress'))fail('PARAMETER_CONFLICT','The top-level and parameter instrument addresses disagree');
  if(target!==undefined)params.bondAddress=target;
  const allowed=new Set(['bondAddress','instrumentAddress']);const allow=(...names:string[])=>names.forEach(n=>allowed.add(n));
  switch(request.action){
    case 'initialize_issue':{
      allow('seriesId','name','settlementMint','faceValueMinor','maturityTs','coupons','rateBps','couponFrequency');
      params.seriesId=integer(raw.seriesId,'seriesId');params.name=text(raw.name,'name',64);params.settlementMint=key(raw.settlementMint,'settlementMint');params.faceValueMinor=integer(raw.faceValueMinor,'faceValueMinor',true);params.maturityTs=integer(raw.maturityTs,'maturityTs',true,8_640_000_000_000n);
      const rate=normalizeRateDescriptor(raw,BigInt(params.faceValueMinor as string));if(rate){params.rateBps=rate.rateBps;params.couponFrequency=rate.couponFrequency;}
      let rows=raw.coupons;if(typeof rows==='string'){try{rows=JSON.parse(rows);}catch{fail('INVALID_SCHEDULE','coupons must contain a valid JSON schedule');}}
      if(!Array.isArray(rows)||rows.length<1||rows.length>8)fail('INVALID_SCHEDULE','Provide one to eight coupon dates');
      const coupons=rows.map(row=>{const c=object(row);if(Object.keys(c).some(k=>!['recordTs','paymentTs','unitAmount'].includes(k)))fail('INVALID_SCHEDULE','Coupon fields are recordTs, paymentTs and unitAmount');return {recordTs:integer(c.recordTs,'recordTs',true,8_640_000_000_000n),paymentTs:integer(c.paymentTs,'paymentTs',true,8_640_000_000_000n),unitAmount:integer(c.unitAmount===undefined&&rate?rate.couponUnitMinor:c.unitAmount,'unitAmount',true)};});if(rate)verifyRateAmounts(rate,coupons.map(c=>BigInt(c.unitAmount)));params.coupons=coupons;break;
    }
    case 'register_holder':allow('holderWallet','label');params.holderWallet=key(raw.holderWallet,'holderWallet');if(raw.label!==undefined&&raw.label!=='')params.label=text(raw.label,'label',64);break;
    case 'issue_units':allow('holderWallet','units');params.holderWallet=key(raw.holderWallet,'holderWallet');params.units=integer(raw.units,'units',true);break;
    case 'fund_vault':allow('amountMinor');params.amountMinor=integer(raw.amountMinor,'amountMinor',true);break;
    case 'transfer_bonds':allow('targetWallet','destination','units');params.targetWallet=alias(raw,'targetWallet','destination',v=>key(v,'targetWallet'));if(params.targetWallet===undefined)fail('MISSING_FIELD','targetWallet is required');params.units=integer(raw.units,'units',true);break;
    case 'capture_coupon':case 'claim_coupon':allow('couponId','index');{const i=alias(raw,'couponId','index',v=>integer(typeof v==='number'&&Number.isSafeInteger(v)?String(v):v,'couponId',false,7n));if(i!==undefined)params.couponId=i;}break;
    case 'settle_coupon':{
      allow('couponId','holderWallets');params.couponId=integer(raw.couponId,'couponId',false,7n);
      if(!Array.isArray(raw.holderWallets)||raw.holderWallets.length<1||raw.holderWallets.length>4)fail('INVALID_BENEFICIARIES','Select one to four coupon beneficiaries');
      const holders=raw.holderWallets.map(v=>key(v,'holderWallets'));
      if(new Set(holders).size!==holders.length)fail('INVALID_BENEFICIARIES','Each coupon beneficiary must occur once');
      params.holderWallets=holders.sort();break;
    }
    case 'create_vote':allow('proposalId','title');params.proposalId=integer(raw.proposalId,'proposalId');params.title=text(raw.title,'title',96);break;
    case 'cast_vote':{
      allow('proposalId','choice','support');params.proposalId=integer(raw.proposalId,'proposalId');const choice=alias(raw,'choice','support',v=>v===true||v==='true'||v==='yes'?'yes':v===false||v==='false'||v==='no'?'no':fail('INVALID_VOTE','choice must explicitly be yes or no'));if(choice===undefined)fail('MISSING_FIELD','choice is required');params.choice=choice;break;
    }
  }
  if(Object.keys(raw).some(k=>!allowed.has(k)))fail('UNEXPECTED_PARAMETER','The selected action contains unsupported parameters');
  const result:ContractRequest={action:request.action,params};if(target!==undefined)result.bondAddress=String(target);
  if(request.walletAddress!==undefined)result.walletAddress=key(request.walletAddress,'walletAddress');
  if(request.role!==undefined){if(typeof request.role!=='string'||!['issuer','investor1','investor2','investor3'].includes(request.role))fail('INVALID_DEMO_ROLE','Choose a known generated test identity');result.role=request.role;}
  const id=alias(request,'operationId','requestId',v=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(v))fail('INVALID_OPERATION_ID','Use an 8 to 100 character recovery identifier');return v;});if(id!==undefined)result.operationId=String(id);
  return result;
}
