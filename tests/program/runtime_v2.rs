// Included in the actual compiled-SBF runtime suite; all keys are disposable.
use bondtrace::{ActionV2, BondV2, HolderV2, RegistryPageV2, SchedulePageV2, SnapshotPageV2,
    V2_COUPON, V2_PAGE_CAP, V2_PRINCIPAL, V2_VOTE};

fn v2_pda(name: &[u8], keys: &[&[u8]]) -> Pubkey {
    let mut seeds = vec![name]; seeds.extend_from_slice(keys);
    Pubkey::find_program_address(&seeds, &bondtrace::ID).0
}

impl Fixture {
    fn new_v2(holder_count: usize, coupon_count: u32) -> Self {
        let mut f = Self::uninitialized(holder_count);
        f.bond = v2_pda(b"bond_v2", &[pk(&f.issuer).as_ref(), &1_u64.to_le_bytes()]);
        f.mint = v2_pda(b"bond_mint_v2", &[f.bond.as_ref()]);
        f.vault = v2_pda(b"vault_v2", &[f.bond.as_ref()]);
        f.holdings = f.holders.iter().map(|h| get_associated_token_address(&pk(h), &f.mint)).collect();
        f.run(ix(bondtrace::accounts::InitializeIssueV2 { issuer:pk(&f.issuer), bond:f.bond,
            bond_mint:f.mint,settlement_mint:f.settlement,vault:f.vault,token_program:token::ID,
            system_program:anchor_lang::system_program::ID,rent:anchor_lang::prelude::rent::ID },
            bondtrace::instruction::InitializeIssueV2 { series_id:1,name:"Paged runtime bond".into(),
                face_value:1_000_000_000,maturity_ts:1_000,coupon_count,rate_bps:1_000,frequency:2 }),Actor::Issuer).unwrap();
        for page in 0..((coupon_count-1)/V2_PAGE_CAP as u32+1) {
            let terms = (page*8..((page+1)*8).min(coupon_count)).map(|i| CouponTerms {
                record_ts:200+i64::from(i)*50,payment_ts:210+i64::from(i)*50,unit_amount:50_000_000 }).collect();
            f.run(f.v2_schedule_ix(page,terms),Actor::Issuer).unwrap();
        }
        for i in 0..holder_count { f.v2_register(i); }
        f
    }
    fn v2_holder(&self,i:usize)->Pubkey { v2_pda(b"holder_v2", &[self.bond.as_ref(),pk(&self.holders[i]).as_ref()]) }
    fn v2_registry(&self,page:u32)->Pubkey { v2_pda(b"registry_v2", &[self.bond.as_ref(),&page.to_le_bytes()]) }
    fn v2_schedule(&self,page:u32)->Pubkey { v2_pda(b"schedule_v2", &[self.bond.as_ref(),&page.to_le_bytes()]) }
    fn v2_action(&self,kind:u8,id:u32)->Pubkey { v2_pda(b"action_v2", &[self.bond.as_ref(),&[kind],&id.to_le_bytes()]) }
    fn v2_snapshot(&self,kind:u8,id:u32,page:u32)->Pubkey { v2_pda(b"snapshot_v2", &[self.v2_action(kind,id).as_ref(),&page.to_le_bytes()]) }
    fn v2_schedule_ix(&self,page_index:u32,coupons:Vec<CouponTerms>)->Instruction {
        ix(bondtrace::accounts::AppendScheduleV2 { issuer:pk(&self.issuer),bond:self.bond,
            schedule_page:self.v2_schedule(page_index),system_program:anchor_lang::system_program::ID },
            bondtrace::instruction::AppendScheduleV2 { page_index,coupons })
    }
    fn v2_register_ix(&self,index:usize)->Instruction {
        ix(bondtrace::accounts::RegisterHolderV2 { issuer:pk(&self.issuer),bond:self.bond,
            registry_page:self.v2_registry(index as u32/8),holder_record:self.v2_holder(index),
            wallet:pk(&self.holders[index]),holder_bonds:self.holdings[index],bond_mint:self.mint,
            token_program:token::ID,system_program:anchor_lang::system_program::ID },
            bondtrace::instruction::RegisterHolderV2 { index:index as u32 })
    }
    fn v2_register(&mut self,index:usize) {
        if index%8==0 { self.run(ix(bondtrace::accounts::CreateRegistryPageV2 { issuer:pk(&self.issuer),
            bond:self.bond,registry_page:self.v2_registry(index as u32/8),system_program:anchor_lang::system_program::ID },
            bondtrace::instruction::CreateRegistryPageV2 { page_index:index as u32/8 }),Actor::Issuer).unwrap(); }
        token_fixture(&mut self.svm,self.holdings[index],self.mint,pk(&self.holders[index]),0);
        token_fixture(&mut self.svm,self.destinations[index],self.settlement,pk(&self.holders[index]),0);
        self.run(self.v2_register_ix(index),Actor::Issuer).unwrap();
    }
    fn v2_add_wallet(&mut self)->usize {
        let key=Keypair::new(); self.svm.airdrop(&key.pubkey(),10_000_000_000).unwrap();
        self.holdings.push(get_associated_token_address(&pk(&key),&self.mint));
        self.destinations.push(get_associated_token_address(&pk(&key),&self.settlement));
        self.holders.push(key);
        let index=self.holders.len()-1;
        token_fixture(&mut self.svm,self.holdings[index],self.mint,pk(&self.holders[index]),0);
        token_fixture(&mut self.svm,self.destinations[index],self.settlement,pk(&self.holders[index]),0);
        index
    }
    fn v2_issue_ix(&self,holder:usize,amount:u64)->Instruction {
        ix(bondtrace::accounts::IssueUnitsV2 { issuer:pk(&self.issuer),bond:self.bond,
            holder_record:self.v2_holder(holder),bond_mint:self.mint,holder_bonds:self.holdings[holder],token_program:token::ID },
            bondtrace::instruction::IssueUnitsV2 { amount })
    }
    fn v2_fund(&mut self,amount:u64) {
        self.run(ix(bondtrace::accounts::FundVaultV2 { funder:pk(&self.issuer),bond:self.bond,
            settlement_mint:self.settlement,source:self.source,vault:self.vault,token_program:token::ID },
            bondtrace::instruction::FundVaultV2 { amount }),Actor::Issuer).unwrap();
    }
    fn v2_seal_ix(&self)->Instruction {
        ix(bondtrace::accounts::SealIssueV2 { issuer:pk(&self.issuer),bond:self.bond,bond_mint:self.mint,vault:self.vault },bondtrace::instruction::SealIssueV2 {})
    }
    fn v2_transfer_ix(&self,source:usize,dest:usize,amount:u64)->Instruction {
        ix(bondtrace::accounts::TransferUnitsV2 { holder:pk(&self.holders[source]),bond:self.bond,bond_mint:self.mint,
            source_holder:self.v2_holder(source),destination_holder:self.v2_holder(dest),source:self.holdings[source],
            destination:self.holdings[dest],token_program:token::ID },bondtrace::instruction::TransferUnitsV2 { amount })
    }
    fn v2_begin_coupon_ix(&self,index:u32)->Instruction {
        ix(bondtrace::accounts::BeginCouponV2 { payer:pk(&self.outsider),bond:self.bond,
            action:self.v2_action(V2_COUPON,index),schedule_page:self.v2_schedule(index/8),bond_mint:self.mint,
            system_program:anchor_lang::system_program::ID },bondtrace::instruction::BeginCouponV2 { index })
    }
    fn v2_begin_principal_ix(&self)->Instruction {
        ix(bondtrace::accounts::BeginRedemptionV2 { payer:pk(&self.outsider),bond:self.bond,
            action:self.v2_action(V2_PRINCIPAL,0),bond_mint:self.mint,system_program:anchor_lang::system_program::ID },bondtrace::instruction::BeginRedemptionV2 {})
    }
    fn v2_proposal_ix(&self,proposal_id:u32,closes_at:i64)->Instruction {
        ix(bondtrace::accounts::CreateProposalV2 { issuer:pk(&self.issuer),bond:self.bond,
            action:self.v2_action(V2_VOTE,proposal_id),bond_mint:self.mint,system_program:anchor_lang::system_program::ID },
            bondtrace::instruction::CreateProposalV2 { proposal_id,title:"Paged immutable vote".into(),closes_at })
    }
    fn v2_capture_ix(&self,kind:u8,id:u32,page_index:u32)->Instruction {
        let a:ActionV2=self.decode(self.v2_action(kind,id));
        let start=page_index as usize*8;let end=((page_index as usize+1)*8).min(a.holder_count as usize);
        let mut instruction=ix(bondtrace::accounts::CaptureActionPageV2 { payer:pk(&self.outsider),bond:self.bond,
            action:self.v2_action(kind,id),registry_page:self.v2_registry(page_index),snapshot_page:self.v2_snapshot(kind,id,page_index),
            bond_mint:self.mint,system_program:anchor_lang::system_program::ID },bondtrace::instruction::CaptureActionPageV2 { page_index });
        instruction.accounts.extend(self.holdings[start..end].iter().map(|key|AccountMeta::new_readonly(ad(*key),false)));
        instruction
    }
    fn v2_finalize_ix(&self,kind:u8,id:u32)->Instruction {
        let b:BondV2=self.decode(self.bond);
        ix(bondtrace::accounts::FinalizeActionV2 { executor:pk(&self.outsider),bond:self.bond,
            action:self.v2_action(kind,id),bond_mint:self.mint,next_schedule_page:self.v2_schedule(b.finalize_schedule_page(kind)) },bondtrace::instruction::FinalizeActionV2 {})
    }
    fn v2_complete(&mut self,kind:u8,id:u32)->(usize,u64) {
        let a:ActionV2=self.decode(self.v2_action(kind,id));let mut bytes=0;let mut cu=0;
        for page in a.captured_pages..a.page_count() {
            let instruction=self.v2_capture_ix(kind,id,page);
            let tx=Transaction::new_signed_with_payer(&[instruction.clone()],Some(&self.outsider.pubkey()),&[&self.outsider],self.svm.latest_blockhash());
            bytes=bytes.max(bincode::serialize(&tx).unwrap().len());
            let revision=self.decode::<BondV2>(self.bond).revision;
            let result=self.run_without_issuer(instruction,Actor::Outsider).unwrap();cu=cu.max(result.compute_units_consumed);
            assert_eq!(self.decode::<BondV2>(self.bond).revision,revision+1);
            assert_eq!(self.decode::<ActionV2>(self.v2_action(kind,id)).captured_pages,page+1);
        }
        self.run_without_issuer(self.v2_finalize_ix(kind,id),Actor::Outsider).unwrap();
        assert_eq!(self.decode::<BondV2>(self.bond).active_kind,0);
        assert!(self.decode::<ActionV2>(self.v2_action(kind,id)).finalized);
        assert!(bytes<=1232,"paged capture legacy transaction={bytes}");assert!(cu<200_000,"paged capture CU={cu}");
        (bytes,cu)
    }
    fn v2_pay_ix(&self,holder:usize,id:u32,settle:bool)->Instruction {
        let accounts=bondtrace::accounts::PayCouponV2 { executor:if settle {pk(&self.outsider)} else {pk(&self.holders[holder])},
            beneficiary:pk(&self.holders[holder]),bond:self.bond,action:self.v2_action(V2_COUPON,id),holder_record:self.v2_holder(holder),
            snapshot_page:self.v2_snapshot(V2_COUPON,id,holder as u32/8),settlement_mint:self.settlement,
            vault:self.vault,destination:self.destinations[holder],token_program:token::ID };
        if settle {ix(accounts,bondtrace::instruction::SettleCouponV2 {})}else{ix(accounts,bondtrace::instruction::ClaimCouponV2 {})}
    }
    fn v2_redeem_ix(&self,holder:usize)->Instruction {
        ix(bondtrace::accounts::RedeemPrincipalV2 {holder:pk(&self.holders[holder]),bond:self.bond,
            action:self.v2_action(V2_PRINCIPAL,0),holder_record:self.v2_holder(holder),snapshot_page:self.v2_snapshot(V2_PRINCIPAL,0,holder as u32/8),
            bond_mint:self.mint,holder_bonds:self.holdings[holder],settlement_mint:self.settlement,
            vault:self.vault,destination:self.destinations[holder],token_program:token::ID},bondtrace::instruction::RedeemPrincipalV2 {})
    }
    fn v2_vote_ix(&self,holder:usize,id:u32,support:bool)->Instruction {
        let action=self.v2_action(V2_VOTE,id);
        ix(bondtrace::accounts::CastVoteV2 {voter:pk(&self.holders[holder]),bond:self.bond,action,
            holder_record:self.v2_holder(holder),snapshot_page:self.v2_snapshot(V2_VOTE,id,holder as u32/8),
            ballot:v2_pda(b"ballot_v2", &[action.as_ref(),pk(&self.holders[holder]).as_ref()]),system_program:anchor_lang::system_program::ID},
            bondtrace::instruction::CastVoteV2 {support})
    }
}

fn v2_graph(f:&Fixture)->Vec<(Pubkey,Option<Account>)> {
    let mut keys=vec![f.bond,f.mint,f.vault];keys.extend(&f.holdings);keys.extend(&f.destinations);
    for i in 0..f.holders.len(){keys.push(f.v2_holder(i));}
    for page in 0..5 {keys.push(f.v2_registry(page));}
    for page in 0..2 {keys.push(f.v2_schedule(page));}
    let actions=(0..9).map(|id|(V2_COUPON,id)).chain([(V2_PRINCIPAL,0),(V2_VOTE,7),(V2_VOTE,8)]);
    for (kind,id) in actions {keys.push(f.v2_action(kind,id));for page in 0..5{keys.push(f.v2_snapshot(kind,id,page));}}
    keys.into_iter().map(|key|(key,f.svm.get_account(&ad(key)))).collect()
}
fn v2_reject(instruction:Instruction,actor:Actor,error_name:Option<&str>,f:&mut Fixture) {
    let before=v2_graph(f);let failure=if matches!(actor,Actor::Issuer){f.run(instruction,actor)}else{f.run_without_issuer(instruction,actor)}.unwrap_err();
    if let Some(name)=error_name {assert!(failure.meta.logs.iter().any(|line|line.contains(name)),"expected {name}: {:?}",failure.meta.logs);}
    assert_eq!(v2_graph(f),before,"failed operation rolls back entire paged economic graph");
}

#[test]
fn paged_v2_thirty_three_holders_nine_coupons_new_holder_and_permissionless_maturity() {
    assert_eq!(8+<BondV2 as anchor_lang::Space>::INIT_SPACE,319);
    assert_eq!(8+<ActionV2 as anchor_lang::Space>::INIT_SPACE,235);
    assert_eq!(8+<HolderV2 as anchor_lang::Space>::INIT_SPACE,77);
    assert_eq!(8+<RegistryPageV2 as anchor_lang::Space>::INIT_SPACE,305);
    assert_eq!(8+<SchedulePageV2 as anchor_lang::Space>::INIT_SPACE,241);
    assert_eq!(8+<SnapshotPageV2 as anchor_lang::Space>::INIT_SPACE,123);
    let mut f=Fixture::new_v2(33,9);
    for holder in 0..33{f.run(f.v2_issue_ix(holder,1),Actor::Issuer).unwrap();}
    f.v2_fund(47_850_000_000);
    f.run(f.v2_seal_ix(),Actor::Issuer).unwrap();
    let b:BondV2=f.decode(f.bond);assert_eq!((b.holder_count,b.coupon_count,b.rate_bps,b.frequency),(33,9,1000,2));
    assert_eq!(f.decode::<RegistryPageV2>(f.v2_registry(4)).wallets.len(),1);
    assert_eq!(f.decode::<SchedulePageV2>(f.v2_schedule(1)).terms.len(),1);
    let newcomer=f.v2_add_wallet();assert_eq!(newcomer,33);
    let direct=token::spl_token::instruction::transfer_checked(&token::ID,&f.holdings[0],&f.mint,&f.holdings[1],&pk(&f.holders[0]),&[],1,0).unwrap();
    v2_reject(direct,Actor::Holder(0),None,&mut f);
    v2_reject(f.v2_begin_coupon_ix(0),Actor::Outsider,Some("TooEarly"),&mut f);
    f.now(200);
    v2_reject(f.v2_transfer_ix(0,1,1),Actor::Holder(0),Some("RecordDateLocked"),&mut f);
    v2_reject(f.v2_register_ix(newcomer),Actor::Issuer,Some("RecordDateLocked"),&mut f);
    f.run_without_issuer(f.v2_begin_coupon_ix(0),Actor::Outsider).unwrap();
    v2_reject(f.v2_finalize_ix(V2_COUPON,0),Actor::Outsider,Some("IncompleteSnapshot"),&mut f);
    v2_reject(f.v2_capture_ix(V2_COUPON,0,1),Actor::Outsider,Some("InvalidPage"),&mut f);
    f.run_without_issuer(f.v2_capture_ix(V2_COUPON,0,0),Actor::Outsider).unwrap();
    v2_reject(f.v2_capture_ix(V2_COUPON,0,0),Actor::Outsider,None,&mut f);
    let mut wrong=f.v2_capture_ix(V2_COUPON,0,1);wrong.accounts.swap(7,8);
    v2_reject(wrong,Actor::Outsider,Some("InvalidHolderAccount"),&mut f);
    v2_reject(f.v2_transfer_ix(0,1,1),Actor::Holder(0),Some("SnapshotLocked"),&mut f);
    f.now(210);
    v2_reject(f.v2_pay_ix(0,0,false),Actor::Holder(0),Some("SnapshotNotFinalized"),&mut f);
    let (mut max_bytes,mut max_cu)=f.v2_complete(V2_COUPON,0);
    assert_eq!(f.decode::<ActionV2>(f.v2_action(V2_COUPON,0)).captured_pages,5);
    f.run(f.v2_register_ix(newcomer),Actor::Issuer).unwrap();
    assert_eq!(f.decode::<HolderV2>(f.v2_holder(newcomer)).index,33);
    assert_eq!(f.decode::<RegistryPageV2>(f.v2_registry(4)).wallets.len(),2);
    assert_eq!(f.decode::<SnapshotPageV2>(f.v2_snapshot(V2_COUPON,0,4)).units,vec![1]);
    f.run_without_issuer(f.v2_transfer_ix(0,newcomer,1),Actor::Holder(0)).unwrap();
    v2_reject(f.v2_pay_ix(newcomer,0,false),Actor::Holder(newcomer),Some("NoEntitlement"),&mut f);
    f.run_without_issuer(f.v2_pay_ix(0,0,false),Actor::Holder(0)).unwrap();
    v2_reject(f.v2_pay_ix(0,0,true),Actor::Outsider,Some("AlreadyClaimed"),&mut f);
    let mut wrong_pay=f.v2_pay_ix(1,0,true);wrong_pay.accounts[8].pubkey=ad(f.destinations[2]);
    v2_reject(wrong_pay,Actor::Outsider,None,&mut f);
    let mut unauthorized=f.v2_issue_ix(1,1);unauthorized.accounts[0].pubkey=ad(pk(&f.outsider));
    v2_reject(unauthorized,Actor::Outsider,Some("UnauthorizedIssuer"),&mut f);
    let mut unauthorized=f.v2_proposal_ix(7,900);unauthorized.accounts[0].pubkey=ad(pk(&f.outsider));
    v2_reject(unauthorized,Actor::Outsider,Some("UnauthorizedIssuer"),&mut f);
    f.run(f.v2_proposal_ix(7,900),Actor::Issuer).unwrap();
    f.v2_complete(V2_VOTE,7);
    f.run_without_issuer(f.v2_transfer_ix(1,2,1),Actor::Holder(1)).unwrap();
    f.run_without_issuer(f.v2_vote_ix(1,7,true),Actor::Holder(1)).unwrap();
    f.run_without_issuer(f.v2_vote_ix(2,7,false),Actor::Holder(2)).unwrap();
    f.run_without_issuer(f.v2_vote_ix(newcomer,7,true),Actor::Holder(newcomer)).unwrap();
    v2_reject(f.v2_vote_ix(1,7,false),Actor::Holder(1),None,&mut f);
    v2_reject(f.v2_vote_ix(0,7,true),Actor::Holder(0),Some("NoEntitlement"),&mut f);
    let vote:ActionV2=f.decode(f.v2_action(V2_VOTE,7));assert_eq!((vote.yes_units,vote.no_units),(2,1));
    for id in 1..9 {
        f.now(200+i64::from(id)*50);
        f.run_without_issuer(f.v2_begin_coupon_ix(id),Actor::Outsider).unwrap();
        let (bytes,cu)=f.v2_complete(V2_COUPON,id);max_bytes=max_bytes.max(bytes);max_cu=max_cu.max(cu);
        assert_eq!(f.decode::<ActionV2>(f.v2_action(V2_COUPON,id)).holder_count,34);
    }
    f.now(620);
    for id in 0..9 {for holder in 0..34 {
        let rights=f.decode::<SnapshotPageV2>(f.v2_snapshot(V2_COUPON,id,holder as u32/8)).units;
        let Some(units)=rights.get(holder%8)else{continue};
        if *units==0||(id==0&&holder==0){continue;}
        f.run_without_issuer(f.v2_pay_ix(holder,id,true),Actor::Outsider).unwrap();
    }}
    assert_eq!(f.decode::<BondV2>(f.bond).next_coupon_index,9);
    v2_reject(f.v2_begin_principal_ix(),Actor::Outsider,Some("TooEarly"),&mut f);
    // An issuer may disappear after opening a very short vote. Its frozen
    // capture remains finishable by anyone, even after deadline and maturity.
    f.run(f.v2_proposal_ix(8,650),Actor::Issuer).unwrap();
    f.run_without_issuer(f.v2_capture_ix(V2_VOTE,8,0),Actor::Outsider).unwrap();
    f.now(1000);
    v2_reject(f.v2_vote_ix(2,8,true),Actor::Holder(2),Some("VotingClosed"),&mut f);
    v2_reject(f.v2_begin_principal_ix(),Actor::Outsider,Some("SnapshotLocked"),&mut f);
    f.v2_complete(V2_VOTE,8);
    f.run_without_issuer(f.v2_begin_principal_ix(),Actor::Outsider).unwrap();
    f.v2_complete(V2_PRINCIPAL,0);
    v2_reject(f.v2_transfer_ix(2,3,1),Actor::Holder(2),Some("InvalidPhase"),&mut f);
    // The failure occurs in payment CPI AFTER burn; all token/state writes
    // including the burn and revision must roll back atomically.
    let original=f.svm.get_account(&ad(f.vault)).unwrap();let mut frozen=original.clone();
    let mut vault=token::spl_token::state::Account::unpack(&frozen.data).unwrap();
    vault.state=token::spl_token::state::AccountState::Frozen;token::spl_token::state::Account::pack(vault,&mut frozen.data).unwrap();
    f.svm.set_account(ad(f.vault),frozen).unwrap();
    let before=v2_graph(&f);
    let failed=f.run_without_issuer(f.v2_redeem_ix(2),Actor::Holder(2)).unwrap_err();
    assert!(failed.meta.logs.iter().any(|line|line.contains("Instruction: Burn")));
    assert!(failed.meta.logs.iter().any(|line|line.contains("Instruction: TransferChecked")));
    assert_eq!(v2_graph(&f),before);
    f.svm.set_account(ad(f.vault),original).unwrap();
    let holdings:Vec<_>=f.holdings.iter().map(|key|f.balance(*key)).collect();
    for (holder,units) in holdings.iter().enumerate(){
        if *units==0{v2_reject(f.v2_redeem_ix(holder),Actor::Holder(holder),Some("NoEntitlement"),&mut f);continue;}
        f.run_without_issuer(f.v2_redeem_ix(holder),Actor::Holder(holder)).unwrap();
        if holder==2{v2_reject(f.v2_redeem_ix(holder),Actor::Holder(holder),Some("AlreadyClaimed"),&mut f);}
    }
    let b:BondV2=f.decode(f.bond);assert_eq!((b.state,b.total_issued,b.total_redeemed),(REDEEMED,33,33));
    assert_eq!(f.supply(),0);assert_eq!(f.balance(f.vault),0);
    assert_eq!(f.decode::<ActionV2>(f.v2_action(V2_PRINCIPAL,0)).paid_total,33_000_000_000);
    for holder in 0..34 {let historic=if holder<33{50_000_000}else{0};
        assert_eq!(f.balance(f.destinations[holder]),historic+holdings[holder]*(1_000_000_000+8*50_000_000));}
    println!("PROVEN paged_v2 initialholders33 postactivation34 coupons9 pages5 snapshotresume=true expiredvote_recovered=true issuer_absent_maturity=true coupon14850000000 principal33000000000 supply0 vault0 maxCapture={}bytes/{}CU revision={}",max_bytes,max_cu,b.revision);
}

#[test]
fn paged_v2_rejects_rate_mismatch_foreign_accounts_and_incomplete_schedule() {
    let mut f=Fixture::new_v2(2,1);
    f.run(f.v2_issue_ix(0,2),Actor::Issuer).unwrap();f.v2_fund(2_100_000_000);
    f.run(f.v2_seal_ix(),Actor::Issuer).unwrap();
    f.now(200);f.run_without_issuer(f.v2_begin_coupon_ix(0),Actor::Outsider).unwrap();
    let mut wrong=f.v2_capture_ix(V2_COUPON,0,0);wrong.accounts[5].pubkey=ad(f.settlement);
    v2_reject(wrong,Actor::Outsider,Some("ConstraintHasOne"),&mut f);
    let foreign=pk(&Keypair::new());f.svm.set_account(ad(foreign),f.svm.get_account(&ad(f.v2_registry(0))).unwrap()).unwrap();
    let mut wrong=f.v2_capture_ix(V2_COUPON,0,0);wrong.accounts[3].pubkey=ad(foreign);
    v2_reject(wrong,Actor::Outsider,Some("ConstraintSeeds"),&mut f);
    f.now(1000);v2_reject(f.v2_begin_principal_ix(),Actor::Outsider,Some("PendingCoupon"),&mut f);
    f.v2_complete(V2_COUPON,0);
    f.run_without_issuer(f.v2_begin_principal_ix(),Actor::Outsider).unwrap();f.v2_complete(V2_PRINCIPAL,0);
    let mut wrong=f.v2_redeem_ix(0);wrong.accounts[9].pubkey=ad(f.destinations[1]);
    v2_reject(wrong,Actor::Holder(0),None,&mut f);
    f.run_without_issuer(f.v2_redeem_ix(0),Actor::Holder(0)).unwrap();
    f.run_without_issuer(f.v2_pay_ix(0,0,true),Actor::Outsider).unwrap();
    assert_eq!(f.balance(f.vault),0,"old coupon remains claimable after principal burn");

    // Build a draft without any schedule: no holder registry/seal is possible.
    let mut f=Fixture::new_v2(1,1);
    // Use a second canonical issue, keeping its rate metadata in the account.
    let series=2_u64;f.bond=v2_pda(b"bond_v2", &[pk(&f.issuer).as_ref(),&series.to_le_bytes()]);
    f.mint=v2_pda(b"bond_mint_v2", &[f.bond.as_ref()]);f.vault=v2_pda(b"vault_v2", &[f.bond.as_ref()]);
    f.holdings=vec![get_associated_token_address(&pk(&f.holders[0]),&f.mint)];
    f.run(ix(bondtrace::accounts::InitializeIssueV2 {issuer:pk(&f.issuer),bond:f.bond,bond_mint:f.mint,
        settlement_mint:f.settlement,vault:f.vault,token_program:token::ID,system_program:anchor_lang::system_program::ID,
        rent:anchor_lang::prelude::rent::ID},bondtrace::instruction::InitializeIssueV2 {series_id:series,name:"Schedule validation".into(),face_value:1_000_000_000,
            maturity_ts:1000,coupon_count:9,rate_bps:1000,frequency:2}),Actor::Issuer).unwrap();
    let create_page=ix(bondtrace::accounts::CreateRegistryPageV2 {issuer:pk(&f.issuer),bond:f.bond,registry_page:f.v2_registry(0),
        system_program:anchor_lang::system_program::ID},bondtrace::instruction::CreateRegistryPageV2 {page_index:0});
    v2_reject(create_page,Actor::Issuer,Some("ScheduleIncomplete"),&mut f);
    let mut terms:Vec<_>=(0..8).map(|i|CouponTerms {record_ts:200+i*50,payment_ts:210+i*50,unit_amount:50_000_000}).collect();
    terms[7].unit_amount=49_999_999;
    v2_reject(f.v2_schedule_ix(0,terms.clone()),Actor::Issuer,Some("InvalidTerms"),&mut f);
    terms[7].unit_amount=50_000_000;
    f.run(f.v2_schedule_ix(0,terms),Actor::Issuer).unwrap();
    assert_eq!(f.decode::<BondV2>(f.bond).schedule_appended,8);
    v2_reject(f.v2_seal_ix(),Actor::Issuer,Some("ScheduleIncomplete"),&mut f);
}
