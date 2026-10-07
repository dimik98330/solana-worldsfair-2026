import {TOKEN_PROGRAM_ADDRESS} from '@solana-program/token';
import {PROGRAM_ID, decodeBond} from '../packages/client/src/program.ts';
import {entitlement, hasClaim} from '../packages/client/src/domain.ts';
import {account, AppError, chainClock} from './rpc.ts';
import {activities, fixture} from './store.ts';
import {isKnownDemoWallet} from './demo-identities.ts';
import {readCatalog, listCatalog} from './catalog.ts';
import {demoEnabled, network, rpcUrl} from './config.ts';
import {accountBytes, readChainView, validateBondIdentity, type Bond} from './chain-view.ts';
import {decimalAmount, isoTimestamp, reconcile} from './reconciliation.ts';

// Individual reads remain available to transaction builders; /state uses the complete coherent graph.
export async function programAccount(key: string) {
  const data = await account(key); if (!data.value) return null;
  return {bytes: accountBytes(data.value, PROGRAM_ID), slot: data.slot};
}
function metadata(key: string, bond: Bond) {
  const meta = readCatalog(key);
  if (meta && (bond.issuer !== meta.roles.issuer || bond.seriesId.toString() !== meta.seriesId || bond.settlementMint !== meta.settlementMint)) throw new AppError('FIXTURE_MISMATCH', 'Recorded instrument does not match on-chain identity');
  return meta ?? {seriesId: bond.seriesId.toString(), bond: key, name: bond.name, settlementMint: bond.settlementMint, createdAt: '', rateBps: 0, couponFrequency: 0, roles: {issuer: String(bond.issuer)}, proposalIds: [], complete: bond.state > 0, accelerated: false, source: 'wallet' as const, holderLabels: {} as Record<string, string>};
}
export async function readBond(selected?: string) {
  const key = selected ?? fixture()?.bond; if (!key) return null;
  const raw = await programAccount(key); if (!raw) return null;
  const bond = decodeBond(raw.bytes); await validateBondIdentity(key, bond);
  return {bond, address: key, fixture: metadata(key, bond)};
}
export async function tokenAmount(key: string, mint: string, allowClosedCanonical = false) {
  const {value} = await account(key);
  if (!value) {
    if (allowClosedCanonical) return 0n;
    throw new AppError('MISSING_REQUIRED_ACCOUNT', 'Required token account is absent', 503);
  }
  const bytes = accountBytes(value);
  if (allowClosedCanonical && value.owner === '11111111111111111111111111111111' && bytes.length === 0) return 0n;
  if (value.owner !== TOKEN_PROGRAM_ADDRESS) throw new AppError('INVALID_TOKEN_OWNER', 'Token account has an unexpected program owner');
  if (bytes.length !== 165) throw new AppError('INVALID_TOKEN_ACCOUNT', 'Expected classic SPL token account');
  const token = await import('@solana-program/token'), decoded = token.getTokenDecoder().decode(bytes);
  if (decoded.mint !== mint) throw new AppError('WRONG_TOKEN_MINT', 'Token mint mismatch');
  return decoded.amount;
}
export async function getState(selected?: string) {
  const f = fixture(), key = selected ?? f?.bond;
  const result: any = {network, rpcUrl, programId: PROGRAM_ID, connected: true, instrument: null, holders: [], coupons: [], redemption: null, proposals: [], activity: activities(), instruments: listCatalog().map(item => ({address: item.bond, name: item.name, issuer: item.roles.issuer, source: item.source})), demo: {available: demoEnabled, ready: false, accelerated: true, roleWallets: f?.roles ?? {}}};
  if (!key) { const clock = await chainClock(); result.serverTime = isoTimestamp(clock.timestamp); return result; }
  const view = await readChainView(key, {proposalIds: () => readCatalog(key)?.proposalIds ?? []});
  const {bond, address: bondAddress, clock} = view, meta = metadata(key, bond), reconciliation = reconcile(view);
  result.slot = String(view.contextSlot);
  result.context = {commitment: 'confirmed', slot: result.slot, clockSlot: clock.slot.toString(), chainTimestamp: clock.timestamp.toString(), accountCount: view.accountCount};
  result.serverTime = isoTimestamp(clock.timestamp); result.reconciliation = reconciliation;
  const generatedMatch = isKnownDemoWallet(String(bond.issuer), f?.roles);
  result.demo = {available: demoEnabled && generatedMatch, ready: bond.state > 0, accelerated: meta.accelerated, roleWallets: generatedMatch ? f!.roles : {}};
  const amounts = view.holders.map(h => h.amount);
  const label = (wallet: string) => meta.holderLabels?.[wallet] ?? Object.entries(generatedMatch ? f!.roles : {}).find(([, value]) => value === wallet)?.[0].replace('issuer', 'Test issuer').replace('investor', 'Test investor ') ?? 'Registered holder';
  result.holders = bond.holderWallets.map((wallet, i) => ({wallet, label: label(wallet), units: amounts[i].toString(), tokenAccount: view.holders[i].address, accountState: view.holders[i].closed ? 'closed-empty-canonical' : view.holders[i].state === 2 ? 'frozen' : 'initialized-empty'}));
  result.instrument = {address: bondAddress, name: bond.name, symbol: 'BOND·TEST', issuer: bond.issuer, bondMint: bond.bondMint, settlementMint: bond.settlementMint, settlementDecimals: view.settlementMint.decimals, faceValueMinor: bond.faceValue.toString(), faceValueDecimal: decimalAmount(bond.faceValue), seriesId: bond.seriesId.toString(), rateBps: meta.rateBps, couponFrequency: meta.couponFrequency, rateBasis: 'local-display-metadata', couponUnitMinor: bond.couponTerms.reduce((sum, c) => sum + c.unitAmount, 0n).toString(), status: ['draft', 'active', 'redeeming', 'redeemed'][bond.state], issuedSupply: bond.totalIssued.toString(), redeemedSupply: bond.totalRedeemed.toString(), recordAt: isoTimestamp(bond.couponTerms[0].recordTs), paymentAt: isoTimestamp(bond.couponTerms[0].paymentTs), maturityAt: isoTimestamp(bond.maturityTs), vaultBalanceMinor: view.vault.amount.toString(), vaultBalanceDecimal: decimalAmount(view.vault.amount), requiredReserveMinor: reconciliation.totals.remainingObligations.baseUnits, fundingGapMinor: reconciliation.totals.fundingGap.baseUnits, settlementBalanceMinor: view.issuerSettlement.amount.toString(), settlementBalanceDecimal: decimalAmount(view.issuerSettlement.amount), settlementAccountAvailable: !view.issuerSettlement.closed};
  for (let index = 0; index < bond.couponTerms.length; index++) {
    const terms = bond.couponTerms[index], snapshot = view.coupons[index], key = view.couponAddresses[index], financial = reconciliation.coupons[index];
    const units = snapshot?.units ?? amounts;
    const rows = bond.holderWallets.map((wallet, i) => {
      const amount = entitlement(terms.unitAmount, units[i]), claimed = snapshot ? hasClaim(snapshot.claimedMask, i) : false;
      return {wallet, units: units[i].toString(), amountMinor: amount.toString(), amountDecimal: decimalAmount(amount), claimed, basis: financial.basis, claimableNow: Boolean(snapshot && !claimed && units[i] > 0n && clock.timestamp >= terms.paymentTs)};
    });
    const creation = result.activity.find((item: any) => item.account === key && item.bond === bondAddress && item.kind === 'capture_coupon' && item.status === 'confirmed');
    const total = BigInt(financial.total.baseUnits), paid = BigInt(financial.paid.baseUnits);
    result.coupons.push({id: String(index), snapshotAddress: snapshot ? key : '', recordAt: isoTimestamp(terms.recordTs), paymentAt: isoTimestamp(terms.paymentTs), unitAmountMinor: terms.unitAmount.toString(), unitAmountDecimal: decimalAmount(terms.unitAmount), capturedAt: snapshot ? isoTimestamp(snapshot.capturedAt) : null, recordSlot: creation?.slot ?? '', recordSlotSource: creation?.slot!=null ? creation.verification??'legacy-unbound' : null, basis: financial.basis, totalMinor: total.toString(), totalDecimal: financial.total.decimal, paidMinor: paid.toString(), paidDecimal: financial.paid.decimal, remainingMinor: financial.remaining.baseUnits, claimableMinor: financial.claimable.baseUnits, status: !snapshot ? 'scheduled' : paid === total ? 'completed' : clock.timestamp >= terms.paymentTs ? 'funded' : 'recorded', entitlements: rows});
  }
  if (bond.state >= 2) {
    const rows = bond.holderWallets.map((wallet, i) => { const amount = entitlement(bond.faceValue, bond.redemptionUnits[i]); return {wallet, units: bond.redemptionUnits[i].toString(), amountMinor: amount.toString(), amountDecimal: decimalAmount(amount), claimed: hasClaim(bond.principalClaimedMask, i)}; });
    result.redemption = {snapshotAddress: bondAddress, basis: 'immutable-maturity-snapshot', totalMinor: reconciliation.principal.total.baseUnits, totalDecimal: reconciliation.principal.total.decimal, paidMinor: reconciliation.principal.paid.baseUnits, paidDecimal: reconciliation.principal.paid.decimal, remainingMinor: reconciliation.principal.remaining.baseUnits, claimableMinor: reconciliation.principal.claimable.baseUnits, entitlements: rows};
  }
  result.proposals = view.proposals.map(({id, address: key, value: p}) => ({id, title: p.title, snapshotAddress: key, deadlineAt: isoTimestamp(p.closesAt), yesWeight: p.yesUnits.toString(), noWeight: p.noUnits.toString(), eligibleWeights: bond.holderWallets.map((wallet, i) => ({wallet, units: p.units[i].toString()})), votedWallets: bond.holderWallets.filter((_wallet, i) => hasClaim(p.ballotMask, i)), status: clock.timestamp >= p.closesAt ? 'closed' : 'open'}));
  result.missingProposalIds = view.missingProposalIds;
  const associated = new Set([bondAddress, ...view.couponAddresses, ...view.proposals.map(p => p.address)]);
  result.activity = result.activity.filter((a: any) => a.bond === bondAddress || (!a.bond && a.account && associated.has(a.account)));
  return result;
}
