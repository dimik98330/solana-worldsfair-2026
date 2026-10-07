import type {ChainState} from './types';
export type DeskAction='capture'|'coupon'|'coupon-wait'|'record-wait'|'redemption'|'principal'|'maturity-wait'|'settled'|'draft'|'unavailable';
/** Financial duties outlive token retirement; a due next snapshot takes priority. */
export function nextDeskAction(state:ChainState):DeskAction {
  const issue=state.instrument,now=Date.parse(state.serverTime);
  if(!issue||!state.connected||!Number.isFinite(now))return 'unavailable';
  if(issue.status==='draft')return 'draft';
  const scheduled=state.coupons.find(c=>c.status==='scheduled');
  if(scheduled&&now>=Date.parse(scheduled.recordAt))return 'capture';
  const unpaid=state.coupons.filter(c=>c.snapshotAddress&&BigInt(c.paidMinor)<BigInt(c.totalMinor));
  if(unpaid.some(c=>now>=Date.parse(c.paymentAt)))return 'coupon';
  if(unpaid.length)return 'coupon-wait';
  if(issue.status==='redeemed')return 'settled';
  if(state.redemption)return 'principal';
  if(scheduled)return 'record-wait';
  return now>=Date.parse(issue.maturityAt)?'redemption':'maturity-wait';
}
