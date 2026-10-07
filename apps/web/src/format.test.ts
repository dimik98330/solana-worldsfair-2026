import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { amount, rawAmount, integer, decimalInput, add, subtract, multiply, percentage, safeExplorer } from './format';

test('settlement formatting preserves six decimals beyond Number.MAX_SAFE_INTEGER', () => {
  assert.equal(amount('1000000000'), '1,000.000000');
  assert.equal(amount('9007199254740993123456'), '9,007,199,254,740,993.123456');
  assert.equal(rawAmount('1'), '0.000001');
  assert.equal(amount('-0'), '0.000000');
  assert.equal(amount(null), '--');
  assert.equal(amount('1e12'), '--');
  assert.equal(amount('Infinity'), '--');
});
test('financial preview uses integer arithmetic and exact input parsing', () => {
  assert.equal(multiply('10', '1000000000'), '10000000000');
  assert.equal(add(['500000000', '250000000', '150000000']), '900000000');
  assert.equal(subtract('900000000', '500000000'), '400000000');
  assert.equal(decimalInput('1000.000001'), '1000000001');
  assert.equal(decimalInput('1.1234567'), null);
  assert.equal(decimalInput('1e3'), null);
  assert.equal(decimalInput('-1'), null);
  assert.equal(integer('NaN'), null);
  assert.equal(percentage('500000000', '900000000'), 55.55);
  assert.equal(percentage('1', '0'), 0);
});
test('proof URLs accept the intended HTTPS explorer only', () => {
  assert.equal(safeExplorer('javascript:alert(1)'), undefined);
  assert.equal(safeExplorer('https://explorer.solana.com.evil.example/tx/abc'), undefined);
  assert.equal(safeExplorer('https://explorer.solana.com/tx/abc?cluster=devnet'), 'https://explorer.solana.com/tx/abc?cluster=devnet');
});
