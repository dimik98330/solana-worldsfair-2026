import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {couponPerBond,entitlement,hasClaim,MAX_U64,uint} from '../../packages/client/src/domain.ts';
import {instruction,PROGRAM_ID,decodeBond,derive,captureCoupon,claimCoupon} from '../../packages/client/src/program.ts';
test('KASE coupon and principal are exact integer settlement amounts',()=>{const face=1000_000000n;assert.equal(couponPerBond(face,1000,2),50_000000n);assert.equal(entitlement(couponPerBond(face,1000,2),10n),500_000000n);assert.equal(entitlement(face,10n),10_000_000000n);});
test('rejects fractional base-unit coupons and invalid/overflowing amounts',()=>{assert.throws(()=>couponPerBond(1n,1,2));assert.throws(()=>couponPerBond(100n,0,2));assert.throws(()=>entitlement(MAX_U64,2n));for(const value of ['-1','1.1','1e3','NaN',Number(3)])assert.throws(()=>uint(value));});
test('all 16 claim positions remain distinct including highest bit',()=>{for(let i=0;i<16;i++){assert.equal(hasClaim(1<<i,i),true);for(let j=0;j<16;j++)if(i!==j)assert.equal(hasClaim(1<<i,j),false);}assert.throws(()=>hasClaim(0,16));});
test('manual adapter instruction discriminators agree with actual generated IDL',()=>{const idl=JSON.parse(fs.readFileSync('programs/bondtrace/bondtrace-idl.json','utf8'));assert.equal(idl.address,PROGRAM_ID);for(const ix of idl.instructions)assert.deepEqual([...instruction(ix.name,[]).data!],ix.discriminator);});
test('decoder rejects invalid discriminators and truncated state',()=>{assert.throws(()=>decodeBond(Buffer.alloc(8)));assert.throws(()=>decodeBond(Buffer.alloc(0)));});
test('coupon adapter rejects fractional, missing and overflowing indexes instead of silently addressing coupon zero',async()=>{
  for(const index of [-1,0.5,8,256,NaN,Infinity]){
    await assert.rejects(derive('coupon',PROGRAM_ID,index),/Coupon index/);
    assert.throws(()=>captureCoupon(PROGRAM_ID,PROGRAM_ID,PROGRAM_ID,PROGRAM_ID,index,[]),/Coupon index/);
    assert.throws(()=>claimCoupon(PROGRAM_ID,PROGRAM_ID,PROGRAM_ID,PROGRAM_ID,PROGRAM_ID,PROGRAM_ID,index),/Coupon index/);
  }
  await assert.rejects(derive('coupon',PROGRAM_ID),/Coupon index/);
  await assert.rejects(derive('coupon',PROGRAM_ID,'0'),/Coupon index/);
  assert.equal(await derive('coupon',PROGRAM_ID,0),await derive('coupon',PROGRAM_ID,0n));
  assert.notEqual(await derive('coupon',PROGRAM_ID,0),await derive('coupon',PROGRAM_ID,7));
});
