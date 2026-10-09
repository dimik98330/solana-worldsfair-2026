import {test} from 'node:test';import assert from 'node:assert/strict';
import {readinessPolicy,restartPolicy} from '../../scripts/runtime-policy.mjs';
const ready={hostFreeBytes:4_000_000_000n,nativeFreeBytes:9_000_000_000n,logBytes:1,rpcHealth:'ok',genesis:'same',expectedGenesis:'same',slotBefore:10,slotAfter:11,programVerified:true,storageVerified:true};
test('native logical capacity cannot conceal full backing disk; alive-but-stalled RPC and SQLite failure are unready',()=>{
 assert.equal(readinessPolicy(ready).healthy,true);
 for(const change of [{hostFreeBytes:1n},{nativeFreeBytes:1n},{slotAfter:10},{slotAfter:NaN},{genesis:'other'},{storageVerified:false},{programVerified:false},{rpcHealth:'bad'},{logBytes:9_000_000n}])assert.equal(readinessPolicy({...ready,...change}).healthy,false);
});
test('safe recovery is bounded to three owned-process restarts per ten minutes',()=>{
 assert.equal(restartPolicy([],1000000,2).allowed,false);assert.equal(restartPolicy([],1000000,3).allowed,true);
 assert.equal(restartPolicy([999900,999901,999902],1000000,4).exhausted,true);
 assert.equal(restartPolicy([1,2,3],1000000,3).allowed,true);
});
