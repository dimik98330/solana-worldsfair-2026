import assert from 'node:assert/strict';
import fs from 'node:fs';
const origin = 'http://127.0.0.1:3000';
const getState = async () => {
  const response = await fetch(`${origin}/api/state`, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200);
  return response.json();
};
const before = await getState();
assert.equal(before.connected, true);
assert.equal(before.network, 'localnet');
const index = await fetch(origin);
assert.equal(index.status, 200);
assert.match(await index.text(), /assets\/index-[^" ]+\.js/);
const checks = [];
for (const [name, body, headers, expected] of [
  ['JSON null', 'null', { 'content-type': 'application/json' }, 400],
  ['JSON array', '[]', { 'content-type': 'application/json' }, 400],
  ['malformed JSON', '{', { 'content-type': 'application/json' }, 400],
  ['content type', '{}', { 'content-type': 'text/plain' }, 415],
  ['foreign origin', '{}', { 'content-type': 'application/json', origin: 'https://foreign.invalid' }, 403],
]) {
  const response = await fetch(`${origin}/api/actions/prepare`, { method: 'POST', headers, body, signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  assert.equal(response.status, expected, name);
  checks.push({ name, status: response.status, code: result.error?.code });
}
const after = await getState();
assert.equal(after.instrument?.address, before.instrument?.address);
assert.equal(after.instrument?.vaultBalanceMinor, before.instrument?.vaultBalanceMinor);
assert.equal(after.activity.length, before.activity.length);
const report = { checkedAt: new Date().toISOString(), origin, builtApp: true, network: after.network,
  issue: after.instrument?.address, status: after.instrument?.status, checks, chainStateUnchanged: true,
  scope: 'Built same-origin app and rejected malformed/foreign-origin requests; no signing or chain mutation.' };
fs.writeFileSync('docs/evidence/http-checks.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
