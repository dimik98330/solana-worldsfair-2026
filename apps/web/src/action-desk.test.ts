import {test} from 'node:test';import assert from 'node:assert/strict';
import {nextDeskAction} from './action-desk';import type {ChainState} from './types';
const at=(seconds:number)=>new Date(seconds*1000).toISOString();
const coupon=(id:string,record:number,payment:number,status='scheduled',paid='0')=>({id,recordAt:at(record),paymentAt:at(payment),status,snapshotAddress:status==='scheduled'?'':'snapshot',totalMinor:'100',paidMinor:paid});
function state(now:number,coupons:unknown[],status='active'){return {connected:true,serverTime:at(now),instrument:{status,maturityAt:at(400)},coupons,redemption:null} as ChainState;}
test('a paid first coupon never hides the next due or future record date',()=>{
  assert.equal(nextDeskAction(state(250,[coupon('0',100,110,'completed','100'),coupon('1',200,210)])),'capture');
  assert.equal(nextDeskAction(state(150,[coupon('0',100,110,'completed','100'),coupon('1',200,210)])),'record-wait');
});
test('historical unpaid coupons remain the action after complete token retirement',()=>{
  assert.equal(nextDeskAction(state(500,[coupon('0',100,110,'funded')],'redeemed')),'coupon');
  assert.equal(nextDeskAction(state(500,[coupon('0',100,110,'completed','100')],'redeemed')),'settled');
});
test('payment date, maturity and draft stages remain distinct',()=>{
  assert.equal(nextDeskAction(state(105,[coupon('0',100,110,'recorded')])),'coupon-wait');
  assert.equal(nextDeskAction(state(300,[coupon('0',100,110,'completed','100')])),'maturity-wait');
  assert.equal(nextDeskAction(state(500,[coupon('0',100,110,'completed','100')])),'redemption');
  assert.equal(nextDeskAction(state(105,[coupon('0',100,110)],'draft')),'draft');
});
