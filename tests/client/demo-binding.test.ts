import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {generateKeyPairSigner} from '@solana/kit';
process.env.BONDTRACE_DATA_DIR=path.resolve('.local/tests/demo-binding-'+crypto.randomUUID());
const [{demoAction},{saveFixture},{demoSigner},{AppError}]=await Promise.all([import('../../server/actions.ts'),import('../../server/store.ts'),import('../../server/transactions.ts'),import('../../server/rpc.ts')]);
test('recovery ID rejects a different top-level instrument after an unsuccessful valid action',async()=>{
  const actor=await demoSigner('issuer'),a=await generateKeyPairSigner(),b=await generateKeyPairSigner();
  saveFixture({seriesId:'1',bond:a.address,name:'Isolated test issue',settlementMint:b.address,createdAt:new Date().toISOString(),rateBps:0,couponFrequency:0,roles:{issuer:actor.address},proposalIds:[],complete:true,accelerated:false});
  const prior=globalThis.fetch;let reads=0;globalThis.fetch=async()=>{reads++;return Response.json({jsonrpc:'2.0',id:1,result:{context:{slot:1},value:null}});};
  try{
    const operationId='binding_'+crypto.randomUUID();
    await assert.rejects(()=>demoAction({action:'seal_issue',role:'issuer',operationId,bondAddress:a.address,params:{}}),e=>e instanceof AppError&&e.code==='NO_INSTRUMENT');
    const observedReads=reads;
    await assert.rejects(()=>demoAction({action:'seal_issue',role:'issuer',operationId,bondAddress:b.address,params:{}}),e=>e instanceof AppError&&e.code==='OPERATION_CONFLICT');
    assert.equal(reads,observedReads,'the conflicting target must not cause another network operation');
  }finally{globalThis.fetch=prior;}
});
