import { createHash } from 'node:crypto';
import { AccountRole, address, getAddressDecoder, getAddressEncoder, getProgramDerivedAddress, type Address, type Instruction } from '@solana/kit';
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS, ASSOCIATED_TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { couponPerBond, uint } from './domain.ts';
export const PROGRAM_ID = address('B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8');
export const SYSTEM = address('11111111111111111111111111111111');
export const RENT = address('SysvarRent111111111111111111111111111111111');
const encoder = getAddressEncoder(), decoder = getAddressDecoder();
export const pubkeyBytes = (value: string) => new Uint8Array(encoder.encode(address(value)));
const disc = (namespace: string, name: string) => createHash('sha256').update(`${namespace}:${name}`).digest().subarray(0, 8);
const u64 = (value: bigint) => { const out = Buffer.alloc(8); out.writeBigUInt64LE(uint(value)); return out; };
const i64 = (value: bigint) => { if(value < -(1n<<63n) || value >= 1n<<63n)throw new Error('i64 out of bounds');const out=Buffer.alloc(8);out.writeBigInt64LE(value);return out; };
const u32 = (value: number) => { const out = Buffer.alloc(4); out.writeUInt32LE(value); return out; };
const u16 = (value: number) => { const out = Buffer.alloc(2); out.writeUInt16LE(value); return out; };
const string = (value: string, max: number) => { const bytes = Buffer.from(value); if (!bytes.length || bytes.length > max) throw new Error('String outside allowed byte length'); return Buffer.concat([u32(bytes.length),bytes]); };
export type CouponTerms = { recordTs: bigint; paymentTs: bigint; unitAmount: bigint };
function couponIndex(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'bigint') || (typeof value === 'number' && !Number.isSafeInteger(value)) || value < 0 || value > 7) throw new Error('Coupon index must be an integer from 0 to 7');
  return Number(value);
}
export async function deriveBond(issuer: string, seriesId: bigint) { return (await getProgramDerivedAddress({programAddress:PROGRAM_ID,seeds:[Buffer.from('bond'),pubkeyBytes(issuer),u64(seriesId)]}))[0]; }
export async function deriveFinancialTerms(bond: string) { return (await getProgramDerivedAddress({programAddress:PROGRAM_ID,seeds:[Buffer.from('financial_terms'),pubkeyBytes(bond)]}))[0]; }
export async function derive(name: 'bond_mint'|'vault'|'coupon'|'proposal'|'ballot', bond: string, id?: bigint | number | string) {
  const tail = name === 'coupon' ? [Uint8Array.of(couponIndex(id))] : id === undefined ? [] : [typeof id === 'string' ? pubkeyBytes(id) : u64(BigInt(id))];
  return (await getProgramDerivedAddress({programAddress:PROGRAM_ID,seeds:[Buffer.from(name),pubkeyBytes(bond),...tail]}))[0];
}
export async function ata(wallet: string, mint: string) { return (await findAssociatedTokenPda({owner:address(wallet),mint:address(mint),tokenProgram:TOKEN_PROGRAM_ADDRESS}))[0]; }
type Meta = [string, 'r'|'w'|'s'|'sw'];
const roles = {r:AccountRole.READONLY,w:AccountRole.WRITABLE,s:AccountRole.READONLY_SIGNER,sw:AccountRole.WRITABLE_SIGNER};
export function instruction(name: string, accounts: Meta[], payload: Uint8Array = new Uint8Array()): Instruction {
  return {programAddress:PROGRAM_ID,accounts:accounts.map(([key,role])=>({address:address(key),role:roles[role]})),data:Buffer.concat([disc('global',name),payload])};
}
export async function initializeIssue(issuer: string, settlement: string, seriesId: bigint, name: string, face: bigint, maturity: bigint, coupons: CouponTerms[]) {
  if (coupons.length < 1 || coupons.length > 8) throw new Error('Unsupported coupon schedule');
  const bond=await deriveBond(issuer,seriesId), mint=await derive('bond_mint',bond), vault=await derive('vault',bond);
  return {bond,mint,vault,ix:instruction('initialize_issue',[[issuer,'sw'],[bond,'w'],[mint,'w'],[settlement,'r'],[vault,'w'],[TOKEN_PROGRAM_ADDRESS,'r'],[SYSTEM,'r'],[RENT,'r']],Buffer.concat([u64(seriesId),string(name,64),u64(face),i64(maturity),u32(coupons.length),...coupons.map(c=>Buffer.concat([i64(c.recordTs),i64(c.paymentTs),u64(c.unitAmount)]))]))};
}
export async function initializeRateIssue(issuer: string, settlement: string, seriesId: bigint, name: string, face: bigint, maturity: bigint, coupons: CouponTerms[], rateBps: number, frequency: number) {
  if (coupons.length < 1 || coupons.length > 8) throw new Error('Unsupported coupon schedule');
  const unitAmount = couponPerBond(face, rateBps, frequency);
  if (coupons.some(coupon => coupon.unitAmount !== unitAmount)) throw new Error('Every coupon amount must match the on-chain rate formula');
  const bond = await deriveBond(issuer, seriesId), mint = await derive('bond_mint', bond), vault = await derive('vault', bond), financialTerms = await deriveFinancialTerms(bond);
  return {bond, mint, vault, financialTerms, ix: instruction('initialize_rate_issue', [[issuer,'sw'],[bond,'w'],[mint,'w'],[settlement,'r'],[vault,'w'],[financialTerms,'w'],[TOKEN_PROGRAM_ADDRESS,'r'],[SYSTEM,'r'],[RENT,'r']], Buffer.concat([u64(seriesId),string(name,64),u64(face),i64(maturity),u32(coupons.length),...coupons.map(c=>Buffer.concat([i64(c.recordTs),i64(c.paymentTs),u64(c.unitAmount)])),u16(rateBps),Uint8Array.of(frequency)]))};
}
export function registerHolder(issuer:string,bond:string,wallet:string,holderAta:string,mint:string) { return instruction('register_holder',[[issuer,'sw'],[bond,'w'],[wallet,'r'],[holderAta,'w'],[mint,'r'],[TOKEN_PROGRAM_ADDRESS,'r'],[ASSOCIATED_TOKEN_PROGRAM_ADDRESS,'r'],[SYSTEM,'r']]); }
export function issueUnits(issuer:string,bond:string,mint:string,holderAta:string,amount:bigint) { return instruction('issue_units',[[issuer,'s'],[bond,'w'],[mint,'w'],[holderAta,'w'],[TOKEN_PROGRAM_ADDRESS,'r']],u64(amount)); }
export function fundVault(funder:string,bond:string,settlement:string,source:string,vault:string,amount:bigint) { return instruction('fund_vault',[[funder,'s'],[bond,'r'],[settlement,'r'],[source,'w'],[vault,'w'],[TOKEN_PROGRAM_ADDRESS,'r']],u64(amount)); }
export function sealIssue(issuer:string,bond:string,mint:string,vault:string) { return instruction('seal_issue',[[issuer,'s'],[bond,'w'],[mint,'r'],[vault,'r']]); }
export function transferUnits(holder:string,bond:string,mint:string,source:string,destination:string,amount:bigint) { return instruction('transfer_units',[[holder,'s'],[bond,'r'],[mint,'r'],[source,'w'],[destination,'w'],[TOKEN_PROGRAM_ADDRESS,'r']],u64(amount)); }
export function captureCoupon(payer:string,bond:string,coupon:string,mint:string,index:number,holders:string[]) { return instruction('capture_coupon',[[payer,'sw'],[bond,'w'],[coupon,'w'],[mint,'r'],[SYSTEM,'r'],...holders.map(key=>[key,'r'] as Meta)],Uint8Array.of(couponIndex(index))); }
export function claimCoupon(holder:string,bond:string,coupon:string,settlement:string,vault:string,destination:string,index:number) { return instruction('claim_coupon',[[holder,'s'],[bond,'r'],[coupon,'w'],[settlement,'r'],[vault,'w'],[destination,'w'],[TOKEN_PROGRAM_ADDRESS,'r']],Uint8Array.of(couponIndex(index))); }
export function settleCoupon(executor:string,holder:string,bond:string,coupon:string,settlement:string,vault:string,destination:string,index:number) { return instruction('settle_coupon',[[executor,'s'],[holder,'r'],[bond,'r'],[coupon,'w'],[settlement,'r'],[vault,'w'],[destination,'w'],[TOKEN_PROGRAM_ADDRESS,'r']],Uint8Array.of(couponIndex(index))); }
export function beginRedemption(issuer:string,bond:string,mint:string,holders:string[]) { return instruction('begin_redemption',[[issuer,'s'],[bond,'w'],[mint,'r'],...holders.map(key=>[key,'r'] as Meta)]); }
export function redeemPrincipal(holder:string,bond:string,mint:string,holderAta:string,settlement:string,vault:string,destination:string) { return instruction('redeem_principal',[[holder,'s'],[bond,'w'],[mint,'w'],[holderAta,'w'],[settlement,'r'],[vault,'w'],[destination,'w'],[TOKEN_PROGRAM_ADDRESS,'r']]); }
export function createProposal(issuer:string,bond:string,proposal:string,mint:string,id:bigint,title:string,closes:bigint,holders:string[]) { return instruction('create_proposal',[[issuer,'sw'],[bond,'r'],[proposal,'w'],[mint,'r'],[SYSTEM,'r'],...holders.map(key=>[key,'r'] as Meta)],Buffer.concat([u64(id),string(title,96),i64(closes)])); }
export function castVote(voter:string,bond:string,proposal:string,ballot:string,support:boolean) { return instruction('cast_vote',[[voter,'sw'],[bond,'r'],[proposal,'w'],[ballot,'w'],[SYSTEM,'r']],Uint8Array.of(Number(support))); }

class Reader {
  offset=8; constructor(readonly bytes:Buffer){}
  take(size:number){if(size<0||this.offset+size>this.bytes.length)throw new Error('Truncated program account');const value=this.bytes.subarray(this.offset,this.offset+size);this.offset+=size;return value;}
  key(){return decoder.decode(this.take(32));} u8(){return this.take(1)[0];} u16(){return this.take(2).readUInt16LE();} u64(){return this.take(8).readBigUInt64LE();} i64(){return this.take(8).readBigInt64LE();}
  str(max:number){const size=this.take(4).readUInt32LE();if(size>max)throw new Error('Program string exceeds capacity');return this.take(size).toString('utf8');}
  vec<T>(max:number,read:()=>T){const count=this.take(4).readUInt32LE();if(count>max)throw new Error('Program vector exceeds capacity');return Array.from({length:count},read);}
}
function reader(bytes:Uint8Array, name:string){const data=Buffer.from(bytes);if(data.length<8||!data.subarray(0,8).equals(disc('account',name)))throw new Error(`Invalid ${name} discriminator`);return new Reader(data);}
export function decodeBond(bytes:Uint8Array){const r=reader(bytes,'Bond');const value={issuer:r.key(),bondMint:r.key(),settlementMint:r.key(),vault:r.key(),seriesId:r.u64(),name:r.str(64),faceValue:r.u64(),maturityTs:r.i64(),totalIssued:r.u64(),totalRedeemed:r.u64(),state:r.u8(),bump:r.u8(),nextCouponIndex:r.u8(),principalClaimedMask:r.u16(),holderWallets:[] as Address[],couponTerms:[] as CouponTerms[],redemptionUnits:[] as bigint[]};value.holderWallets=r.vec(16,()=>r.key());value.couponTerms=r.vec(8,()=>({recordTs:r.i64(),paymentTs:r.i64(),unitAmount:r.u64()}));value.redemptionUnits=r.vec(16,()=>r.u64());if(value.state>3||value.nextCouponIndex>value.couponTerms.length||value.totalRedeemed>value.totalIssued)throw new Error('Inconsistent Bond state');return value;}
export function decodeFinancialTerms(bytes: Uint8Array) {
  if (bytes.length !== 61) throw new Error('Invalid FinancialTerms account length');
  const r = reader(bytes, 'FinancialTerms'), value = {version: r.u8(), bond: r.key(), nominal: r.u64(), rateBps: r.u16(), couponFrequency: r.u8(), unitAmount: r.u64(), bump: r.u8()};
  if (value.version !== 1 || couponPerBond(value.nominal, value.rateBps, value.couponFrequency) !== value.unitAmount) throw new Error('Inconsistent FinancialTerms state');
  return value;
}
export function decodeCoupon(bytes:Uint8Array){const r=reader(bytes,'Coupon');const value={bond:r.key(),index:r.u8(),recordTs:r.i64(),paymentTs:r.i64(),unitAmount:r.u64(),capturedAt:r.i64(),totalUnits:r.u64(),claimedMask:r.u16(),paidTotal:r.u64(),units:[] as bigint[],bump:0};value.units=r.vec(16,()=>r.u64());value.bump=r.u8();return value;}
export function decodeProposal(bytes:Uint8Array){const r=reader(bytes,'Proposal');const value={bond:r.key(),proposalId:r.u64(),title:r.str(96),openedAt:r.i64(),closesAt:r.i64(),totalUnits:r.u64(),yesUnits:r.u64(),noUnits:r.u64(),ballotMask:r.u16(),units:[] as bigint[],bump:0};value.units=r.vec(16,()=>r.u64());value.bump=r.u8();return value;}
