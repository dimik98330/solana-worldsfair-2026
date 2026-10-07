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
const jsonHeaders={'content-type':'application/json'};
for (const [name, body, headers, expected] of [
  ['JSON null', 'null', { 'content-type': 'application/json' }, 400],
  ['JSON array', '[]', { 'content-type': 'application/json' }, 400],
  ['malformed JSON', '{', { 'content-type': 'application/json' }, 400],
  ['content type', '{}', { 'content-type': 'text/plain' }, 415],
  ['foreign origin', '{}', { 'content-type': 'application/json', origin: 'https://foreign.invalid' }, 403],
  ['missing funding amount', JSON.stringify({action:'fund_vault',walletAddress:before.instrument.issuer,params:{bondAddress:before.instrument.address}}),jsonHeaders,400],
  ['fractional money', JSON.stringify({action:'fund_vault',walletAddress:before.instrument.issuer,params:{bondAddress:before.instrument.address,amountMinor:'1.5'}}),jsonHeaders,400],
  ['numeric money', JSON.stringify({action:'fund_vault',walletAddress:before.instrument.issuer,params:{bondAddress:before.instrument.address,amountMinor:9007199254740992}}),jsonHeaders,400],
  ['conflicting instrument aliases', JSON.stringify({action:'seal_issue',walletAddress:before.instrument.issuer,bondAddress:before.instrument.address,params:{bondAddress:before.instrument.issuer}}),jsonHeaders,400],
  ['missing proposal identity', JSON.stringify({action:'cast_vote',walletAddress:before.instrument.issuer,params:{bondAddress:before.instrument.address,choice:'yes'}}),jsonHeaders,400],
  ['conflicting vote aliases', JSON.stringify({action:'cast_vote',walletAddress:before.instrument.issuer,params:{bondAddress:before.instrument.address,proposalId:'1',choice:'yes',support:false}}),jsonHeaders,400],
  ['unsupported request field', JSON.stringify({action:'seal_issue',walletAddress:before.instrument.issuer,bondAddress:before.instrument.address,params:{},amount:10}),jsonHeaders,400],
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
const output=process.env.BONDTRACE_HTTP_EVIDENCE_FILE??'docs/evidence/http-checks.json';
if(!/^docs\/evidence\/[a-z0-9-]+\.json$/.test(output))throw new Error('HTTP evidence must be a named file in docs/evidence');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
