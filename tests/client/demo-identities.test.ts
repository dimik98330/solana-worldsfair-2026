import {test} from 'node:test';import assert from 'node:assert/strict';import {isKnownDemoWallet} from '../../server/demo-identities.ts';
test('any known generated identity may become a different issue issuer without being labelled as a human wallet',()=>{
  const roles={issuer:'issuer-public',investor1:'holder-a-public',investor2:'holder-b-public'};
  for(const address of Object.values(roles))assert.equal(isKnownDemoWallet(address,roles),true);
  assert.equal(isKnownDemoWallet('external-human-public',roles),false);assert.equal(isKnownDemoWallet('issuer-public',undefined),false);
});
