import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
process.env.BONDTRACE_DATA_DIR=path.resolve('.local/tests/evidence-'+crypto.randomUUID());
const {buildEvidenceReport}=await import('../../server/evidence.ts');
const {canonicalJson}=await import('../../server/request-contract.ts');
const identity={network:'localnet',genesisHash:'synthetic-genesis',programId:'synthetic-program',rpcUrl:'http://127.0.0.1:8899',observedAt:'2026-10-08T00:00:00.000Z'};
test('evidence exposes public fields, exact strings and honest provenance; export hash detects any payload change',()=>{
  const state={instrument:{address:'synthetic-instrument',faceValueMinor:'9007199254740993'},context:{slot:'51'},holders:[],coupons:[],redemption:null,proposals:[],reconciliation:{status:'verified'},servicing:{fullySettled:false},activity:[{signature:'synthetic-signature',kind:'claim_coupon',status:'unknown',time:'2026-10-08',explorerUrl:'synthetic-url',signedBytes:'must-not-export',secret:'must-not-export'}]};
  const report=buildEvidenceReport(state,identity),serialized=JSON.stringify(report);
  assert.equal(serialized.includes('must-not-export'),false);assert.equal(report.payload.receipts[0].status,'unknown');
  assert.equal(report.payload.receipts[0].verification,'legacy-unbound');assert.equal(report.payload.scope.independentlyAttested,false);
  assert.equal(report.payload.instrument.faceValueMinor,'9007199254740993');
  assert.equal(report.integrity.payloadSha256,createHash('sha256').update(canonicalJson(report.payload)).digest('hex'));
  assert.equal(report.integrity.payloadSha256,buildEvidenceReport({...state,instrument:{faceValueMinor:'9007199254740993',address:'synthetic-instrument'}},identity).integrity.payloadSha256);
  state.instrument.faceValueMinor='9007199254740994';assert.notEqual(report.integrity.payloadSha256,buildEvidenceReport(state,identity).integrity.payloadSha256);
});
test('evidence export refuses to manufacture a report for an absent instrument',()=>{
  assert.throws(()=>buildEvidenceReport({instrument:null,holders:[],coupons:[],redemption:null,proposals:[],activity:[]},identity),/Select a confirmed instrument/);
});
