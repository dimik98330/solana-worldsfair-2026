import {address,lamports} from '@solana/kit';
import {getCreateAccountInstruction} from '@solana-program/system';
import {getCreateAssociatedTokenIdempotentInstruction,getInitializeMint2Instruction,getMintToInstruction,getMintSize,TOKEN_PROGRAM_ADDRESS} from '@solana-program/token';
import {ata,fundVault,initializeIssue,issueUnits,registerHolder,sealIssue} from '../packages/client/src/program.ts';
import {couponPerBond,SETTLEMENT_SCALE} from '../packages/client/src/domain.ts';
import {AppError,account,awaitConfirmation,chainClock,rpc} from './rpc.ts';
import {activities,fixture,saveFixture} from './store.ts';
import {demoSigner,execute} from './transactions.ts';
import {network} from './config.ts';
import {beginOperation,operationStatus,updateOperation} from './operations.ts';
let pending:Promise<unknown>|null=null;
export function bootstrap(reset=false,requestedId=crypto.randomUUID()){if(pending)return pending;const existing=beginOperation(requestedId,'bootstrap','issuer',{reset});if(!existing.new)return operationStatus(requestedId);pending=seed(reset,requestedId).catch(error=>{updateOperation(requestedId,{status:error instanceof AppError&&error.code==='UNKNOWN_STATUS'?'pending':'error',error:error instanceof Error?error.message:'Setup failed'});throw error;}).finally(()=>{pending=null;});return pending;}
async function seed(reset:boolean,operationId:string){
  const current=fixture();if(current?.complete&&!reset){const signature=current.bootstrapSignature??activities().find(a=>a.kind==='fund_and_seal'&&Date.parse(a.time)>=Date.parse(current.createdAt))?.signature;if(!signature)throw new AppError('BOOTSTRAP_PROOF_MISSING','Create a fresh test issue to obtain setup proof');const result=await awaitConfirmation(signature);updateOperation(operationId,{signature,status:result.status});return {...result,bond:current.bond,operationId};}
  const issuer=await demoSigner('issuer'),mint=await demoSigner('settlement-mint');const investors=await Promise.all(['investor1','investor2','investor3'].map(demoSigner));
  const all=[issuer,...investors];for(const signer of all){const balance=await rpc<number>('getBalance',[signer.address,{commitment:'confirmed'}]);const actual=(balance as any).value??balance;if(actual<100_000_000){const request=await rpc<string>('requestAirdrop',[signer.address,network==='localnet'?2_000_000_000:1_000_000_000,{commitment:'confirmed'}]);const status=await awaitConfirmation(request);if(status.status!=='confirmed')throw new AppError('AIRDROP_PENDING','Test SOL funding is pending; do not repeat automatically',503);}}
  const source=await ata(issuer.address,mint.address);const mintAccount=await account(mint.address);
  if(!mintAccount.value){const rent=await rpc<number>('getMinimumBalanceForRentExemption',[getMintSize()]);await execute([getCreateAccountInstruction({payer:issuer,newAccount:mint,lamports:lamports(BigInt(rent)),space:getMintSize(),programAddress:TOKEN_PROGRAM_ADDRESS}),getInitializeMint2Instruction({mint:mint.address,decimals:6,mintAuthority:issuer.address})],issuer,'test_settlement_mint',[mint]);}
  await execute([getCreateAssociatedTokenIdempotentInstruction({payer:issuer,ata:source,owner:issuer.address,mint:mint.address}),getMintToInstruction({mint:mint.address,token:source,mintAuthority:issuer,amount:50_000n*SETTLEMENT_SCALE})],issuer,'test_settlement_funding');
  const clock=await chainClock();const series=BigInt(Date.now());const face=1000n*SETTLEMENT_SCALE;const coupon=couponPerBond(face,1000,2);
  // Accelerated demo uses on-chain seconds. Production two-year terms are not simulated silently.
  const record=clock.timestamp+(network==='localnet'?90n:180n),payment=record+5n,maturity=record+300n;
  const creation=await initializeIssue(issuer.address,mint.address,series,'BondTrace · Test Series',face,maturity,[{recordTs:record,paymentTs:payment,unitAmount:coupon}]);
  const roles={issuer:String(issuer.address),investor1:String(investors[0].address),investor2:String(investors[1].address),investor3:String(investors[2].address)};
  saveFixture({seriesId:series.toString(),bond:creation.bond,name:'BondTrace · Test Series',settlementMint:mint.address,createdAt:new Date().toISOString(),rateBps:1000,couponFrequency:2,roles,proposalIds:[],complete:false,accelerated:true});
  await execute([creation.ix],issuer,'initialize_issue',[],creation.bond);
  const holdings=[10n,5n,3n];for(let i=0;i<investors.length;i++){
    const holding=await ata(investors[i].address,creation.mint);
    const settlement=await ata(investors[i].address,mint.address);
    await execute([getCreateAssociatedTokenIdempotentInstruction({payer:issuer,ata:holding,owner:investors[i].address,mint:creation.mint}),getCreateAssociatedTokenIdempotentInstruction({payer:issuer,ata:settlement,owner:investors[i].address,mint:mint.address}),registerHolder(issuer.address,creation.bond,investors[i].address,holding,creation.mint),issueUnits(issuer.address,creation.bond,creation.mint,holding,holdings[i])],issuer,'register_and_issue');
  }
  const final=await execute([fundVault(issuer.address,creation.bond,mint.address,source,creation.vault,(face+coupon)*18n),sealIssue(issuer.address,creation.bond,creation.mint,creation.vault)],issuer,'fund_and_seal',[],creation.bond,signature=>updateOperation(operationId,{signature,status:'pending'}));
  const completed=fixture()!;completed.complete=final.status==='confirmed';completed.bootstrapSignature=final.signature;saveFixture(completed);updateOperation(operationId,{signature:final.signature,status:final.status});return {...final,bond:creation.bond,operationId,accelerated:true};
}
