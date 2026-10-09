import { ArrowRight, Archive, Clock3, FileCheck2 } from 'lucide-react';
import { Badge, Button, Panel } from './components';
import { date } from './format';
import { nextDeskAction } from './action-desk';
import type { ChainState } from './types';

export function NextActionDesk({ state, issuer, blocked, onCapture, onRedemption, onClaims, onIssuer, onNewDemo }: {
  state: ChainState;
  issuer: boolean;
  blocked: boolean;
  onCapture: () => void;
  onRedemption: () => void;
  onClaims: () => void;
  onIssuer: () => void;
  onNewDemo?: () => void;
}) {
  const action = nextDeskAction(state);
  const issue = state.instrument;
  const scheduled = state.coupons.find(coupon => coupon.status === 'scheduled');
  const unpaid = state.coupons.find(coupon => coupon.snapshotAddress && BigInt(coupon.paidMinor) < BigInt(coupon.totalMinor));
  const heading = {
    capture: 'Capture the next record date',
    coupon: 'Pay recorded coupon rights',
    'coupon-wait': 'Coupon payment is scheduled',
    'record-wait': 'Next record date is scheduled',
    redemption: 'Open principal redemption',
    principal: 'Principal claims are open',
    'maturity-wait': 'Waiting for maturity',
    settled: 'All obligations are settled',
    draft: 'Finish issue setup',
    unavailable: 'Reconnect to continue',
  }[action];
  const detail = {
    capture: 'Fix each holder’s coupon entitlement. Later transfers preserve these recorded rights.',
    coupon: 'Holders can claim their recorded allocations, including rights retained after redemption.',
    'coupon-wait': 'Entitlements are recorded. Claims open at the payment time.',
    'record-wait': 'The next snapshot opens at its record date. Existing rights stay fixed.',
    redemption: 'All scheduled snapshots are captured. Record maturity positions for principal payment and retirement.',
    principal: 'Each entitled holder receives principal and burns the bonds in one transaction.',
    'maturity-wait': 'Coupon obligations are settled. Principal redemption opens at maturity.',
    settled: 'Recorded coupons and issued principal have been paid.',
    draft: 'Register holders, place bonds and cover every payment before activation.',
    unavailable: 'Refresh the chain connection before preparing an operation.',
  }[action];
  const maturityAction = ['maturity-wait', 'redemption', 'principal'].includes(action);
  const couponAction = action === 'coupon' || action === 'coupon-wait';
  const record = maturityAction || action === 'settled' || action === 'draft' || action === 'unavailable' ? undefined : couponAction ? unpaid?.recordAt : scheduled?.recordAt;
  const deadline = action === 'settled' || action === 'draft' || action === 'unavailable' ? undefined : maturityAction ? issue?.maturityAt : couponAction ? unpaid?.paymentAt : scheduled?.paymentAt;
  const issuerAction = action === 'capture' || action === 'redemption';
  const scheduledAction = ['record-wait', 'coupon-wait', 'maturity-wait'].includes(action);
  const Icon = action === 'settled' ? Archive : scheduledAction ? Clock3 : FileCheck2;

  return <section className="next-action" aria-label="Next step">
    <div className="next-action-content">
      <span className={`next-action-symbol ${action === 'settled' ? 'complete' : ''}`}><Icon size={21} aria-hidden="true" /></span>
      <div className="next-action-copy"><h3>{heading}</h3><p>{detail}</p>
        {(record || deadline) && <dl className="next-action-dates">{record && <div><dt>Record date</dt><dd>{date(record, true)}</dd></div>}{deadline && <div><dt>{maturityAction ? 'Maturity' : 'Payment date'}</dt><dd>{date(deadline, true)}</dd></div>}</dl>}
        {issuerAction && !issuer && <p className="control-hint">Connect this issue’s issuer wallet to prepare this action. Holders sign their own claims.</p>}
        {issuerAction && issuer && blocked && <p className="control-hint">Resolve the current operation or refresh chain state before continuing.</p>}
      </div>
      <div className="next-action-control">
        {action === 'capture' ? <Button variant="primary" disabled={blocked || !issuer} onClick={onCapture}>Capture record date<ArrowRight size={16} aria-hidden="true" /></Button>
          : action === 'redemption' ? <Button variant="primary" disabled={blocked || !issuer} onClick={onRedemption}>Open redemption<ArrowRight size={16} aria-hidden="true" /></Button>
          : action === 'coupon' || action === 'principal' ? <Button variant="primary" onClick={onClaims}>Open holder claims<ArrowRight size={16} aria-hidden="true" /></Button>
          : action === 'draft' ? <Button variant="primary" onClick={onIssuer}>Open issuer desk<ArrowRight size={16} aria-hidden="true" /></Button>
          : action === 'settled' ? <Button onClick={onIssuer}>Create another issue<ArrowRight size={16} aria-hidden="true" /></Button>
          : <Button onClick={onClaims}>Review recorded rights<ArrowRight size={16} aria-hidden="true" /></Button>}
      </div>
    </div>
  </section>;
}
