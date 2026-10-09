import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {appendTransactionMessageInstructions,createTransactionMessage,generateKeyPairSigner,getAddressEncoder,getBase64EncodedWireTransaction,getSignatureFromTransaction,partiallySignTransactionMessageWithSigners,setTransactionMessageFeePayerSigner,setTransactionMessageLifetimeUsingBlockhash,type KeyPairSigner,type Instruction,address,blockhash,getTransactionDecoder,getTransactionEncoder} from '@solana/kit';
import {createHash} from 'node:crypto';
import * as program from '../../packages/client/src/program.ts';
process.env.BONDTRACE_DATA_DIR = path.resolve('.local/tests/rate-terms-' + crypto.randomUUID());
const [{normalizeRateDescriptor,verifyRateAmounts,rateMemoInstruction,rateTermsMemo,confirmedRateEvidence,validateRateEvidence}, {normalizeRequest}, {saveCatalog,readCatalog}, {readBond}, {closeStorage}] = await Promise.all([
  import('../../server/rate-terms.ts'), import('../../server/request-contract.ts'), import('../../server/catalog.ts'), import('../../server/state.ts'), import('../../server/storage.ts'),
]);
const originalFetch = globalThis.fetch;
after(() => {globalThis.fetch = originalFetch; closeStorage();});
const issuer = await generateKeyPairSigner(), mint = await generateKeyPairSigner();
const face = 1_000_000_000n, descriptor = normalizeRateDescriptor({rateBps: '1000', couponFrequency: '2'}, face)!;
const request = {action: 'initialize_issue', walletAddress: issuer.address, params: {seriesId: '102', name: 'Rate terms test', settlementMint: mint.address, faceValueMinor: face.toString(), rateBps: '1000', couponFrequency: '2', maturityTs: '300', coupons: [{recordTs: '100', paymentTs: '120'}, {recordTs: '200', paymentTs: '220'}]}};
async function signed(instructions: Instruction[], actor: KeyPairSigner = issuer) {
  let message = createTransactionMessage({version: 0});
  const prepared = appendTransactionMessageInstructions(instructions, setTransactionMessageLifetimeUsingBlockhash({blockhash: blockhash('11111111111111111111111111111111'), lastValidBlockHeight: 1000n}, setTransactionMessageFeePayerSigner(actor, message)));
  const transaction = await partiallySignTransactionMessageWithSigners(prepared);
  return {signature: String(getSignatureFromTransaction(transaction)), wire: getBase64EncodedWireTransaction(transaction)};
}
async function creation(otherMemo?: Instruction) {
  const coupons = [{recordTs: 100n, paymentTs: 120n, unitAmount: 50_000_000n}, {recordTs: 200n, paymentTs: 220n, unitAmount: 50_000_000n}];
  const built = await program.initializeIssue(issuer.address, mint.address, 102n, 'Rate terms test', face, 300n, coupons);
  const result = await signed([built.ix, otherMemo ?? rateMemoInstruction(built.bond, issuer.address, face.toString(), descriptor)]);
  const record = {signature: result.signature, action: 'initialize_issue', bond: String(built.bond), wallet: String(issuer.address), network: 'localnet', genesisHash: String(mint.address), chainStatus: 'confirmed' as const, projectionStatus: 'pending' as const, submittedAt: '2026-10-08T01:00:00.000Z', signedTransactionBase64: result.wire};
  return {built, record, coupons};
}
test('annual rate and frequency are an exact optional pair; no fractional, zero, overflow or sub-unit rounding', () => {
  assert.equal(normalizeRateDescriptor({}, face), undefined);
  for (const value of [{rateBps: '1000'}, {couponFrequency: '2'}, {rateBps: 1000, couponFrequency: '2'}, {rateBps: '0', couponFrequency: '2'}, {rateBps: '10001', couponFrequency: '2'}, {rateBps: '1000', couponFrequency: '0'}, {rateBps: '1000', couponFrequency: '13'}, {rateBps: '10.5', couponFrequency: '2'}]) assert.throws(() => normalizeRateDescriptor(value, face));
  assert.throws(() => normalizeRateDescriptor({rateBps: '1', couponFrequency: '12'}, 1_000_000n), /exactly representable/);
  assert.deepEqual(normalizeRateDescriptor({rateBps: '001000', couponFrequency: '02'}, face), descriptor);
  verifyRateAmounts(descriptor, [50_000_000n, 50_000_000n]);
  assert.throws(() => verifyRateAmounts(descriptor, [50_000_000n, 25_000_000n]), /Every coupon amount/);
  assert.equal(BigInt(descriptor.couponUnitMinor) * 10n, 500_000_000n);
  assert.equal(face * 10n, 10_000_000_000n);
});
test('API normalization derives omitted coupon amounts and conflicts cannot silently change the financial formula', () => {
  const normalized = normalizeRequest(request);
  assert.equal(normalized.params.rateBps, '1000'); assert.equal(normalized.params.couponFrequency, '2');
  assert.deepEqual(normalized.params.coupons, [{recordTs: '100', paymentTs: '120', unitAmount: '50000000'}, {recordTs: '200', paymentTs: '220', unitAmount: '50000000'}]);
  assert.throws(() => normalizeRequest({...request, params: {...request.params, coupons: [{recordTs: '100', paymentTs: '120', unitAmount: '49999999'}]}}), /Every coupon amount/);
  assert.throws(() => normalizeRequest({...request, params: {...request.params, couponFrequency: undefined}}), /together/);
  assert.throws(() => normalizeRequest({...request, params: {...request.params, rateBps: undefined, couponFrequency: undefined}}));
});
test('rate provenance verifies the exact issuer-signed creation memo and remains immutable in catalog', async () => {
  const {built,record} = await creation(), evidence = await confirmedRateEvidence(record, built.bond, issuer.address, face.toString(), descriptor);
  assert.deepEqual(await confirmedRateEvidence({...record, lastValidBlockHeight: 1}, built.bond, issuer.address, face.toString(), descriptor), evidence, 'Confirmed creation provenance survives transaction lifetime expiry');
  assert.equal(evidence.creationSignature, record.signature); assert.equal(evidence.provenance, 'issuer-signed-creation-memo');
  assert.deepEqual(validateRateEvidence(evidence, built.bond, issuer.address), evidence);
  const item = {seriesId: '102', bond: String(built.bond), name: 'Rate terms test', settlementMint: String(mint.address), createdAt: '2026-10-08T01:00:00.000Z', rateBps: 1000, couponFrequency: 2, roles: {issuer: String(issuer.address)}, proposalIds: [], complete: false, accelerated: false, source: 'wallet' as const, rateTerms: evidence};
  saveCatalog(item); assert.deepEqual(readCatalog(built.bond)?.rateTerms, evidence);
  assert.throws(() => saveCatalog({...item, rateBps: 0, couponFrequency: 0, rateTerms: undefined}), /creation evidence cannot be replaced/);
  assert.throws(() => saveCatalog({...item, rateBps: 500}), /differ from signed/);
  assert.throws(() => validateRateEvidence({...evidence, memoSha256: '0'.repeat(64)}, built.bond, issuer.address), /immutable memo/);
  const pubkey = (key: string) => Buffer.from(getAddressEncoder().encode(address(key)));
  const u64 = (value: bigint) => {const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(value); return bytes;};
  const i64 = (value: bigint) => {const bytes = Buffer.alloc(8); bytes.writeBigInt64LE(value); return bytes;};
  const u32 = (value: number) => {const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes;};
  const bondMint = await program.derive('bond_mint', built.bond), vault = await program.derive('vault', built.bond);
  let observedFace = face, observedAmount = 50_000_000n;
  globalThis.fetch = async (_input, init) => {
    const req = JSON.parse(String(init?.body)), name = Buffer.from(item.name);
    assert.equal(req.method, 'getAccountInfo'); assert.equal(req.params[0], built.bond);
    const bytes = Buffer.concat([createHash('sha256').update('account:Bond').digest().subarray(0, 8), ...[issuer.address, bondMint, mint.address, vault].map(pubkey), u64(102n), u32(name.length), name, u64(observedFace), i64(300n), u64(0n), u64(0n), Buffer.from([0, 255, 0]), Buffer.alloc(2), u32(0), u32(2), i64(100n), i64(120n), u64(observedAmount), i64(200n), i64(220n), u64(50_000_000n), u32(0)]);
    return Response.json({jsonrpc: '2.0', id: req.id, result: {context: {slot: 99}, value: {owner: program.PROGRAM_ID, executable: false, data: [bytes.toString('base64'), 'base64']}}});
  };
  try {
    assert.equal((await readBond(built.bond))?.fixture.rateTerms?.creationSignature, record.signature);
    observedFace = face + 1n; await assert.rejects(readBond(built.bond), /different nominal/);
    observedFace = face; observedAmount = 49_999_999n; await assert.rejects(readBond(built.bond), /Every coupon amount/);
  } finally {globalThis.fetch = originalFetch;}
});
test('maximum supported eight-coupon creation with a rate memo fits the verified version0 wire limit', async () => {
  const coupons = Array.from({length: 8}, (_, i) => ({recordTs: BigInt(100 + i * 10), paymentTs: BigInt(105 + i * 10), unitAmount: 50_000_000n}));
  const built = await program.initializeIssue(issuer.address, mint.address, 103n, 'A'.repeat(64), face, 300n, coupons);
  const wire = await signed([built.ix, rateMemoInstruction(built.bond, issuer.address, face.toString(), descriptor)]);
  assert.ok(Buffer.from(wire.wire, 'base64').length <= 1232);
});
test('tampered memo, issuer signature, receipt identity and unconfirmed receipt cannot acquire rate provenance', async () => {
  const {built,record} = await creation();
  for (const change of [{wallet: String(mint.address)}, {bond: String(mint.address)}, {action: 'fund_vault'}, {chainStatus: 'pending' as const}, {signedTransactionBase64: undefined}]) await assert.rejects(confirmedRateEvidence({...record, ...change}, built.bond, issuer.address, face.toString(), descriptor));
  const incorrect = await creation(rateMemoInstruction(built.bond, issuer.address, face.toString(), {...descriptor, rateBps: '500'}));
  await assert.rejects(confirmedRateEvidence(incorrect.record, built.bond, issuer.address, face.toString(), descriptor), /does not commit/);
  const detached = await signed([rateMemoInstruction(built.bond, issuer.address, face.toString(), descriptor)]);
  await assert.rejects(confirmedRateEvidence({...record, signature: detached.signature, signedTransactionBase64: detached.wire}, built.bond, issuer.address, face.toString(), descriptor), /does not commit/);
  const changed = getTransactionDecoder().decode(Buffer.from(record.signedTransactionBase64, 'base64')), oldSignature = changed.signatures[issuer.address]!;
  const invalidSignature = Uint8Array.from(oldSignature); invalidSignature[0] ^= 1;
  const tampered = {...changed, signatures: {...changed.signatures, [issuer.address]: invalidSignature as any}}, wire = Buffer.from(getTransactionEncoder().encode(tampered)).toString('base64');
  await assert.rejects(confirmedRateEvidence({...record, signature: String(getSignatureFromTransaction(tampered)), signedTransactionBase64: wire}, built.bond, issuer.address, face.toString(), descriptor), /does not commit/);
  assert.match(rateTermsMemo(built.bond, issuer.address, face.toString(), descriptor), /"rateBps":"1000"/);
});
