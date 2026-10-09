import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AccountRole, generateKeyPairSigner} from '@solana/kit';
import * as program from '../../packages/client/src/program.ts';

const issuer = await generateKeyPairSigner(), settlement = await generateKeyPairSigner();
const schedule = [{recordTs: 200n, paymentTs: 250n, unitAmount: 50_000_000n}];
const discriminator = (namespace: string, name: string) => createHash('sha256').update(`${namespace}:${name}`).digest().subarray(0,8);
function termsBytes(bond: string, nominal = 1_000_000_000n, rate = 1000, frequency = 2, amount = 50_000_000n) {
  const bytes = Buffer.alloc(61); discriminator('account','FinancialTerms').copy(bytes);
  bytes[8] = 1; Buffer.from(program.pubkeyBytes(bond)).copy(bytes,9);
  bytes.writeBigUInt64LE(nominal,41); bytes.writeUInt16LE(rate,49); bytes[51] = frequency;
  bytes.writeBigUInt64LE(amount,52); bytes[60] = 255;
  return bytes;
}

test('rate creation commits exact formula and terms PDA in one instruction; fixed creation retains its interface', async () => {
  const rated = await program.initializeRateIssue(issuer.address,settlement.address,2n,'Rate bond',1_000_000_000n,400n,schedule,1000,2);
  const fixed = await program.initializeIssue(issuer.address,settlement.address,2n,'Rate bond',1_000_000_000n,400n,schedule);
  assert.equal(rated.bond,fixed.bond); assert.equal(rated.mint,fixed.mint); assert.equal(rated.vault,fixed.vault);
  assert.equal(rated.financialTerms,await program.deriveFinancialTerms(rated.bond));
  assert.equal(rated.ix.accounts?.length,9); assert.equal(fixed.ix.accounts?.length,8);
  assert.equal(rated.ix.accounts?.[5].address,rated.financialTerms);
  assert.equal(rated.ix.accounts?.[5].role,AccountRole.WRITABLE);
  assert.equal(rated.ix.accounts?.[0].role,AccountRole.WRITABLE_SIGNER);
  const bytes = Buffer.from(rated.ix.data!);
  assert.ok(bytes.subarray(0,8).equals(discriminator('global','initialize_rate_issue')));
  assert.ok(bytes.subarray(8,-3).equals(Buffer.from(fixed.ix.data!).subarray(8)));
  assert.equal(bytes.readUInt16LE(bytes.length-3),1000); assert.equal(bytes.at(-1),2);
});

test('client rejects any coupon mismatch, remainder, fractional rate and invalid ranges before building', async () => {
  const build = (face: bigint,rate: number,frequency: number,coupons = schedule) => program.initializeRateIssue(issuer.address,settlement.address,3n,'Rate bond',face,400n,coupons,rate,frequency);
  for (const [face,rate,frequency] of [[0n,1000,2],[1n,1,1],[1_000_000n,1,12],[1_000_000_000n,0,2],[1_000_000_000n,10001,2],[1_000_000_000n,1000.5,2],[1_000_000_000n,1000,0],[1_000_000_000n,1000,13],[1_000_000_000n,1000,2.5]] as const) await assert.rejects(build(face,rate,frequency));
  await assert.rejects(build(1_000_000_000n,1000,2,[...schedule,{recordTs:300n,paymentTs:350n,unitAmount:49_999_999n}]),/Every coupon/);
  await assert.rejects(build(1_000_000_000n,1000,2,[]),/schedule/);
});

test('FinancialTerms decoder validates exact version, length, discriminator and arithmetic', async () => {
  const bond = await program.deriveBond(issuer.address,4n), bytes = termsBytes(bond);
  assert.deepEqual(program.decodeFinancialTerms(bytes),{version:1,bond,nominal:1_000_000_000n,rateBps:1000,couponFrequency:2,unitAmount:50_000_000n,bump:255});
  for (const invalid of [bytes.subarray(0,60),Buffer.concat([bytes,Buffer.alloc(1)])]) assert.throws(()=>program.decodeFinancialTerms(invalid),/length/);
  const discriminatorMismatch = Buffer.from(bytes); discriminatorMismatch[0] ^= 1;
  assert.throws(()=>program.decodeFinancialTerms(discriminatorMismatch),/discriminator/);
  const unknownVersion = Buffer.from(bytes); unknownVersion[8] = 2;
  assert.throws(()=>program.decodeFinancialTerms(unknownVersion),/Inconsistent/);
  for (const invalid of [termsBytes(bond,0n),termsBytes(bond,1n,1,1,1n),termsBytes(bond,1_000_000_000n,0),termsBytes(bond,1_000_000_000n,1000,13),termsBytes(bond,1_000_000_000n,1000,2,50_000_001n)]) assert.throws(()=>program.decodeFinancialTerms(invalid));
});

test('wide exact arithmetic survives multiplication above u64 without loss', async () => {
  const bond = await program.deriveBond(issuer.address,5n);
  const value = program.decodeFinancialTerms(termsBytes(bond,9_000_000_000_000_000_000n,1000,2,450_000_000_000_000_000n));
  assert.equal(value.unitAmount,450_000_000_000_000_000n);
  assert.equal(value.nominal,9_000_000_000_000_000_000n);
});
