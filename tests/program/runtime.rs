//! Real compiled SBF execution with classic SPL CPI in LiteSVM.
//! Sysvar time travel is test-only; the program has no clock bypass.
use anchor_lang::{
    prelude::Pubkey,
    solana_program::{program_option::COption, program_pack::Pack},
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use anchor_spl::{
    associated_token::{get_associated_token_address, spl_associated_token_account},
    token,
};
use bondtrace::{Ballot, Bond, Coupon, CouponTerms, FinancialTerms, Proposal, ACTIVE, REDEEMED};
use litesvm::{types::TransactionResult, LiteSVM};
use solana_account::Account;
use solana_address::Address;
use solana_clock::Clock;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

fn pk(k: &Keypair) -> Pubkey {
    Pubkey::new_from_array(k.pubkey().to_bytes())
}
fn ad(k: Pubkey) -> Address {
    Address::from(k.to_bytes())
}
fn ix(accounts: impl ToAccountMetas, args: impl InstructionData) -> Instruction {
    Instruction {
        program_id: ad(bondtrace::ID),
        accounts: accounts.to_account_metas(None),
        data: args.data(),
    }
}
fn mint_fixture(svm: &mut LiteSVM, key: Pubkey, authority: Pubkey, decimals: u8) {
    let mint = token::spl_token::state::Mint {
        mint_authority: COption::Some(authority),
        supply: 1_000_000_000_000,
        decimals,
        is_initialized: true,
        freeze_authority: COption::None,
    };
    let mut data = vec![0; token::spl_token::state::Mint::LEN];
    token::spl_token::state::Mint::pack(mint, &mut data).unwrap();
    svm.set_account(
        ad(key),
        Account {
            lamports: svm.minimum_balance_for_rent_exemption(data.len()),
            data,
            owner: ad(token::ID),
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
}
fn token_fixture(svm: &mut LiteSVM, key: Pubkey, mint: Pubkey, wallet: Pubkey, amount: u64) {
    let holding = token::spl_token::state::Account {
        mint,
        owner: wallet,
        amount,
        delegate: COption::None,
        state: token::spl_token::state::AccountState::Initialized,
        is_native: COption::None,
        delegated_amount: 0,
        close_authority: COption::None,
    };
    let mut data = vec![0; token::spl_token::state::Account::LEN];
    token::spl_token::state::Account::pack(holding, &mut data).unwrap();
    svm.set_account(
        ad(key),
        Account {
            lamports: svm.minimum_balance_for_rent_exemption(data.len()),
            data,
            owner: ad(token::ID),
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
}
#[derive(Clone, Copy)]
enum Actor {
    Issuer,
    Holder(usize),
    Outsider,
}
struct Fixture {
    svm: LiteSVM,
    issuer: Keypair,
    holders: Vec<Keypair>,
    outsider: Keypair,
    bond: Pubkey,
    mint: Pubkey,
    settlement: Pubkey,
    vault: Pubkey,
    source: Pubkey,
    holdings: Vec<Pubkey>,
    destinations: Vec<Pubkey>,
}
impl Fixture {
    fn new(holder_count: usize) -> Self {
        Self::new_with_terms(
            holder_count,
            vec![CouponTerms {
                record_ts: 200,
                payment_ts: 250,
                unit_amount: 50_000_000,
            }],
        )
    }
    fn new_with_terms(holder_count: usize, terms: Vec<CouponTerms>) -> Self {
        let mut f = Self::uninitialized(holder_count);
        f.run(f.init_ix(1_000_000_000, terms), Actor::Issuer)
            .unwrap();
        f.register_all();
        f
    }
    fn uninitialized(holder_count: usize) -> Self {
        Self::uninitialized_with_seed(holder_count, None)
    }
    fn uninitialized_with_seed(holder_count: usize, seed: Option<u64>) -> Self {
        let mut svm = LiteSVM::new();
        svm.add_program_from_file(
            ad(bondtrace::ID),
            format!(
                "{}/../../target/deploy/bondtrace.so",
                env!("CARGO_MANIFEST_DIR")
            ),
        )
        .unwrap();
        // Deterministic keys are disposable in-process test fixtures only.
        let mut key_index = 0_u64;
        let mut next_key = || {
            key_index += 1;
            match seed {
                Some(value) => sequence_keypair(value, key_index),
                None => Keypair::new(),
            }
        };
        let issuer = next_key();
        let outsider = next_key();
        let holders: Vec<_> = (0..holder_count).map(|_| next_key()).collect();
        for wallet in std::iter::once(&issuer)
            .chain(std::iter::once(&outsider))
            .chain(holders.iter())
        {
            svm.airdrop(&wallet.pubkey(), 10_000_000_000).unwrap();
        }
        let mut clock: Clock = svm.get_sysvar();
        clock.unix_timestamp = 100;
        svm.set_sysvar(&clock);
        let (bond, _) = Pubkey::find_program_address(
            &[b"bond", pk(&issuer).as_ref(), &1_u64.to_le_bytes()],
            &bondtrace::ID,
        );
        let (mint, _) =
            Pubkey::find_program_address(&[b"bond_mint", bond.as_ref()], &bondtrace::ID);
        let (vault, _) = Pubkey::find_program_address(&[b"vault", bond.as_ref()], &bondtrace::ID);
        let settlement = pk(&next_key());
        let source = get_associated_token_address(&pk(&issuer), &settlement);
        mint_fixture(&mut svm, settlement, pk(&issuer), 6);
        token_fixture(&mut svm, source, settlement, pk(&issuer), 1_000_000_000_000);
        let holdings = holders
            .iter()
            .map(|h| get_associated_token_address(&pk(h), &mint))
            .collect();
        let destinations = holders
            .iter()
            .map(|h| get_associated_token_address(&pk(h), &settlement))
            .collect();
        Self {
            svm,
            issuer,
            holders,
            outsider,
            bond,
            mint,
            settlement,
            vault,
            source,
            holdings,
            destinations,
        }
    }
    fn register_all(&mut self) {
        for i in 0..self.holders.len() {
            token_fixture(&mut self.svm, self.holdings[i], self.mint, pk(&self.holders[i]), 0);
            token_fixture(
                &mut self.svm,
                self.destinations[i],
                self.settlement,
                pk(&self.holders[i]),
                0,
            );
            self.run(self.register_ix(i, false), Actor::Issuer).unwrap();
        }
    }
    fn financial_terms(&self) -> Pubkey {
        Pubkey::find_program_address(&[b"financial_terms", self.bond.as_ref()], &bondtrace::ID).0
    }
    fn rate_init_ix(&self, face_value: u64, rate_bps: u16, frequency: u8, coupons: Vec<CouponTerms>) -> Instruction {
        ix(
            bondtrace::accounts::InitializeRateIssue {
                issuer: pk(&self.issuer), bond: self.bond, bond_mint: self.mint,
                settlement_mint: self.settlement, vault: self.vault,
                financial_terms: self.financial_terms(), token_program: token::ID,
                system_program: anchor_lang::system_program::ID, rent: anchor_lang::prelude::rent::ID,
            },
            bondtrace::instruction::InitializeRateIssue {
                series_id: 1, name: "Runtime rate bond".into(), face_value,
                maturity_ts: 400, coupons, rate_bps, frequency,
            },
        )
    }
    fn init_ix(&self, face: u64, coupons: Vec<CouponTerms>) -> Instruction {
        ix(
            bondtrace::accounts::InitializeIssue {
                issuer: pk(&self.issuer),
                bond: self.bond,
                bond_mint: self.mint,
                settlement_mint: self.settlement,
                vault: self.vault,
                token_program: token::ID,
                system_program: anchor_lang::system_program::ID,
                rent: anchor_lang::prelude::rent::ID,
            },
            bondtrace::instruction::InitializeIssue {
                series_id: 1,
                name: "Runtime test bond".into(),
                face_value: face,
                maturity_ts: 400,
                coupons,
            },
        )
    }
    fn register_ix(&self, index: usize, outsider: bool) -> Instruction {
        ix(
            bondtrace::accounts::RegisterHolder {
                issuer: if outsider {
                    pk(&self.outsider)
                } else {
                    pk(&self.issuer)
                },
                bond: self.bond,
                wallet: pk(&self.holders[index]),
                holder_bonds: self.holdings[index],
                bond_mint: self.mint,
                token_program: token::ID,
                associated_token_program: spl_associated_token_account::program::ID,
                system_program: anchor_lang::system_program::ID,
            },
            bondtrace::instruction::RegisterHolder {},
        )
    }
    fn issue_ix(&self, holder: usize, amount: u64, outsider: bool) -> Instruction {
        ix(
            bondtrace::accounts::IssueUnits {
                issuer: if outsider {
                    pk(&self.outsider)
                } else {
                    pk(&self.issuer)
                },
                bond: self.bond,
                bond_mint: self.mint,
                holder_bonds: self.holdings[holder],
                token_program: token::ID,
            },
            bondtrace::instruction::IssueUnits { amount },
        )
    }
    fn seal_ix(&self) -> Instruction {
        ix(
            bondtrace::accounts::SealIssue {
                issuer: pk(&self.issuer),
                bond: self.bond,
                bond_mint: self.mint,
                vault: self.vault,
            },
            bondtrace::instruction::SealIssue {},
        )
    }
    fn fund(&mut self, amount: u64) {
        let instruction = ix(
            bondtrace::accounts::FundVault {
                funder: pk(&self.issuer),
                bond: self.bond,
                settlement_mint: self.settlement,
                source: self.source,
                vault: self.vault,
                token_program: token::ID,
            },
            bondtrace::instruction::FundVault { amount },
        );
        self.run(instruction, Actor::Issuer).unwrap();
    }
    fn transfer_ix(&self, source: usize, dest: usize, amount: u64) -> Instruction {
        ix(
            bondtrace::accounts::TransferUnits {
                holder: pk(&self.holders[source]),
                bond: self.bond,
                bond_mint: self.mint,
                source: self.holdings[source],
                destination: self.holdings[dest],
                token_program: token::ID,
            },
            bondtrace::instruction::TransferUnits { amount },
        )
    }
    fn coupon(&self, index: u8) -> Pubkey {
        Pubkey::find_program_address(&[b"coupon", self.bond.as_ref(), &[index]], &bondtrace::ID).0
    }
    fn snapshot_metas(&self) -> Vec<AccountMeta> {
        self.holdings
            .iter()
            .map(|k| AccountMeta::new_readonly(ad(*k), false))
            .collect()
    }
    fn capture_ix(&self, index: u8) -> Instruction {
        let mut instruction = ix(
            bondtrace::accounts::CaptureCoupon {
                payer: pk(&self.issuer),
                bond: self.bond,
                coupon: self.coupon(index),
                bond_mint: self.mint,
                system_program: anchor_lang::system_program::ID,
            },
            bondtrace::instruction::CaptureCoupon { index },
        );
        instruction.accounts.extend(self.snapshot_metas());
        instruction
    }
    fn claim_ix(&self, holder: usize) -> Instruction {
        self.claim_ix_at(holder, 0)
    }
    fn claim_ix_at(&self, holder: usize, index: u8) -> Instruction {
        ix(
            bondtrace::accounts::ClaimCoupon {
                holder: pk(&self.holders[holder]),
                bond: self.bond,
                coupon: self.coupon(index),
                settlement_mint: self.settlement,
                vault: self.vault,
                destination: self.destinations[holder],
                token_program: token::ID,
            },
            bondtrace::instruction::ClaimCoupon { index },
        )
    }
    fn begin_ix(&self) -> Instruction {
        let mut instruction = ix(
            bondtrace::accounts::BeginRedemption {
                issuer: pk(&self.issuer),
                bond: self.bond,
                bond_mint: self.mint,
            },
            bondtrace::instruction::BeginRedemption {},
        );
        instruction.accounts.extend(self.snapshot_metas());
        instruction
    }
    fn settle_ix(&self, holder: usize, index: u8) -> Instruction {
        ix(
            bondtrace::accounts::SettleCoupon {
                executor: pk(&self.outsider),
                holder: pk(&self.holders[holder]),
                bond: self.bond,
                coupon: self.coupon(index),
                settlement_mint: self.settlement,
                vault: self.vault,
                destination: self.destinations[holder],
                token_program: token::ID,
            },
            bondtrace::instruction::SettleCoupon { index },
        )
    }
    fn redeem_ix(&self, holder: usize) -> Instruction {
        ix(
            bondtrace::accounts::RedeemPrincipal {
                holder: pk(&self.holders[holder]),
                bond: self.bond,
                bond_mint: self.mint,
                holder_bonds: self.holdings[holder],
                settlement_mint: self.settlement,
                vault: self.vault,
                destination: self.destinations[holder],
                token_program: token::ID,
            },
            bondtrace::instruction::RedeemPrincipal {},
        )
    }
    fn proposal(&self) -> Pubkey {
        Pubkey::find_program_address(
            &[b"proposal", self.bond.as_ref(), &1_u64.to_le_bytes()],
            &bondtrace::ID,
        )
        .0
    }
    fn proposal_ix(&self) -> Instruction {
        let mut instruction = ix(
            bondtrace::accounts::CreateProposal {
                issuer: pk(&self.issuer),
                bond: self.bond,
                proposal: self.proposal(),
                bond_mint: self.mint,
                system_program: anchor_lang::system_program::ID,
            },
            bondtrace::instruction::CreateProposal {
                proposal_id: 1,
                title: "Publish monthly disclosure".into(),
                closes_at: 390,
            },
        );
        instruction.accounts.extend(self.snapshot_metas());
        instruction
    }
    fn vote_ix(&self, holder: usize, support: bool) -> Instruction {
        let ballot = Pubkey::find_program_address(
            &[
                b"ballot",
                self.proposal().as_ref(),
                pk(&self.holders[holder]).as_ref(),
            ],
            &bondtrace::ID,
        )
        .0;
        ix(
            bondtrace::accounts::CastVote {
                voter: pk(&self.holders[holder]),
                bond: self.bond,
                proposal: self.proposal(),
                ballot,
                system_program: anchor_lang::system_program::ID,
            },
            bondtrace::instruction::CastVote { support },
        )
    }
    fn now(&mut self, timestamp: i64) {
        let mut clock: Clock = self.svm.get_sysvar();
        clock.unix_timestamp = timestamp;
        self.svm.set_sysvar(&clock);
    }
    fn run(&mut self, instruction: Instruction, actor: Actor) -> TransactionResult {
        self.run_batch(vec![instruction], actor)
    }
    fn run_batch(&mut self, instructions: Vec<Instruction>, actor: Actor) -> TransactionResult {
        self.svm.expire_blockhash();
        let actor: &dyn Signer = match actor {
            Actor::Issuer => &self.issuer,
            Actor::Holder(i) => &self.holders[i],
            Actor::Outsider => &self.outsider,
        };
        let mut signers: Vec<&dyn Signer> = vec![&self.issuer];
        if actor.pubkey() != self.issuer.pubkey() {
            signers.push(actor);
        }
        let tx = Transaction::new_signed_with_payer(
            &instructions,
            Some(&self.issuer.pubkey()),
            &signers,
            self.svm.latest_blockhash(),
        );
        self.svm.send_transaction(tx)
    }
    fn decode<T: AccountDeserialize>(&self, key: Pubkey) -> T {
        T::try_deserialize(&mut &self.svm.get_account(&ad(key)).unwrap().data[..]).unwrap()
    }
    fn balance(&self, key: Pubkey) -> u64 {
        token::spl_token::state::Account::unpack(&self.svm.get_account(&ad(key)).unwrap().data)
            .unwrap()
            .amount
    }
    fn supply(&self) -> u64 {
        token::spl_token::state::Mint::unpack(&self.svm.get_account(&ad(self.mint)).unwrap().data)
            .unwrap()
            .supply
    }
    fn tx_size(&self, instruction: &Instruction) -> usize {
        let tx = Transaction::new_signed_with_payer(
            &[instruction.clone()],
            Some(&self.issuer.pubkey()),
            &[&self.issuer],
            self.svm.latest_blockhash(),
        );
        bincode::serialize(&tx).unwrap().len()
    }
}

#[test]
fn permissionless_coupon_pays_only_fixed_beneficiary_and_shares_claim_mask() {
    let mut f = Fixture::new(3);
    f.run(f.issue_ix(0, 6, false), Actor::Issuer).unwrap();
    f.run(f.issue_ix(1, 4, false), Actor::Issuer).unwrap();
    f.fund(10_500_000_000);
    f.run(f.seal_ix(), Actor::Issuer).unwrap();
    f.now(200);
    f.run(f.capture_ix(0), Actor::Issuer).unwrap();
    assert!(f.run(f.settle_ix(0, 0), Actor::Outsider).is_err(), "payment date is enforced");
    f.now(250);
    for (account_index, replacement) in [(1, pk(&f.outsider)), (3, f.proposal()), (4, f.mint), (5, f.source), (6, f.destinations[1])] {
        let mut instruction = f.settle_ix(0, 0);
        instruction.accounts[account_index].pubkey = ad(replacement);
        assert!(f.run(instruction, Actor::Outsider).is_err(), "substituted account {account_index} must fail");
        assert_eq!(f.decode::<Coupon>(f.coupon(0)).claimed_mask, 0);
        assert_eq!(f.balance(f.vault), 10_500_000_000);
    }
    let alternative = pk(&Keypair::new());
    token_fixture(&mut f.svm, alternative, f.settlement, pk(&f.holders[0]), 0);
    let mut instruction = f.settle_ix(0, 0);
    instruction.accounts[6].pubkey = ad(alternative);
    assert!(f.run(instruction, Actor::Outsider).is_err(), "same holder noncanonical token account must fail");
    assert!(f.run(f.settle_ix(2, 0), Actor::Outsider).is_err(), "zero entitlement cannot be claimed");
    let paid = f.run(f.settle_ix(0, 0), Actor::Outsider).unwrap();
    assert_eq!(f.balance(f.destinations[0]), 300_000_000);
    assert_eq!(f.decode::<Coupon>(f.coupon(0)).claimed_mask, 1);
    assert!(f.run(f.claim_ix(0), Actor::Holder(0)).is_err(), "holder cannot repeat operator settlement");
    assert!(f.run(f.settle_ix(0, 0), Actor::Outsider).is_err(), "operator cannot pay twice");
    f.run(f.claim_ix(1), Actor::Holder(1)).unwrap();
    assert!(f.run(f.settle_ix(1, 0), Actor::Outsider).is_err(), "operator cannot repeat holder claim");
    assert_eq!(f.decode::<Coupon>(f.coupon(0)).paid_total, 500_000_000);
    println!("PROVEN permissionless_coupon fixed_destination=canonical claim_settle_shared_mask=true units6_coupon300000000 measuredCU={}", paid.compute_units_consumed);
}

#[test]
fn permissionless_coupon_survives_transfer_and_full_principal_burn() {
    let mut f = Fixture::new(2);
    f.run(f.issue_ix(0, 3, false), Actor::Issuer).unwrap();
    f.fund(3_150_000_000);
    f.run(f.seal_ix(), Actor::Issuer).unwrap();
    f.now(200);
    f.run(f.capture_ix(0), Actor::Issuer).unwrap();
    f.run(f.transfer_ix(0, 1, 1), Actor::Holder(0)).unwrap();
    f.now(400);
    f.run(f.begin_ix(), Actor::Issuer).unwrap();
    f.run(f.redeem_ix(0), Actor::Holder(0)).unwrap();
    f.run(f.redeem_ix(1), Actor::Holder(1)).unwrap();
    assert_eq!(f.supply(), 0);
    assert_eq!(f.decode::<Bond>(f.bond).state, REDEEMED);
    f.run(f.settle_ix(0, 0), Actor::Outsider).unwrap();
    assert_eq!(f.balance(f.destinations[0]), 2_150_000_000);
    assert_eq!(f.balance(f.destinations[1]), 1_000_000_000);
    assert_eq!(f.balance(f.vault), 0);
    assert!(f.run(f.settle_ix(1, 0), Actor::Outsider).is_err(), "later owner has no old coupon entitlement");
}

#[test]
fn operator_coupon_batch_rolls_back_all_payments_when_one_recipient_fails() {
    let mut f = Fixture::new(4);
    for i in 0..4 { f.run(f.issue_ix(i, 1, false), Actor::Issuer).unwrap(); }
    f.fund(4_200_000_000);
    f.run(f.seal_ix(), Actor::Issuer).unwrap();
    f.now(200);
    f.run(f.capture_ix(0), Actor::Issuer).unwrap();
    f.now(250);
    // Valid frozen SPL fixture models an externally frozen settlement mint destination.
    let destination = ad(f.destinations[3]);
    let mut account = f.svm.get_account(&destination).unwrap();
    let mut frozen = token::spl_token::state::Account::unpack(&account.data).unwrap();
    frozen.state = token::spl_token::state::AccountState::Frozen;
    token::spl_token::state::Account::pack(frozen, &mut account.data).unwrap();
    f.svm.set_account(destination, account).unwrap();
    let keys = [f.coupon(0), f.vault, f.destinations[0], f.destinations[1], f.destinations[2], f.destinations[3]];
    let before: Vec<_> = keys.iter().map(|key| f.svm.get_account(&ad(*key)).unwrap()).collect();
    let instructions = (0..4).map(|i| f.settle_ix(i, 0)).collect();
    let failed = f.run_batch(instructions, Actor::Outsider).unwrap_err();
    assert!(failed.meta.logs.iter().filter(|line| line.contains("Instruction: TransferChecked")).count() >= 4);
    for (key, original) in keys.iter().zip(&before) { assert_eq!(f.svm.get_account(&ad(*key)).unwrap(), *original); }
    let mut account = f.svm.get_account(&destination).unwrap();
    frozen.state = token::spl_token::state::AccountState::Initialized;
    token::spl_token::state::Account::pack(frozen, &mut account.data).unwrap();
    f.svm.set_account(destination, account).unwrap();
    let instructions = (0..4).map(|i| f.settle_ix(i, 0)).collect();
    f.run_batch(instructions, Actor::Outsider).unwrap();
    assert_eq!(f.decode::<Coupon>(f.coupon(0)).claimed_mask, 15);
    assert_eq!(f.decode::<Coupon>(f.coupon(0)).paid_total, 200_000_000);
    for recipient in &f.destinations { assert_eq!(f.balance(*recipient), 50_000_000); }
}

#[test]
fn sixteen_holder_full_flow_preserves_old_coupon_after_transfer_and_redemption() {
    let mut f = Fixture::new(16);
    f.run(f.issue_ix(0, 6, false), Actor::Issuer).unwrap();
    f.run(f.issue_ix(1, 4, false), Actor::Issuer).unwrap();
    assert!(
        f.run(f.seal_ix(), Actor::Issuer).is_err(),
        "unfunded seal must fail"
    );
    f.fund(10_500_000_000);
    f.run(f.seal_ix(), Actor::Issuer).unwrap();
    assert_eq!(f.decode::<Bond>(f.bond).state, ACTIVE);
    assert!(
        f.run(f.issue_ix(0, 1, false), Actor::Issuer).is_err(),
        "cannot issue after seal"
    );
    assert!(
        f.run(f.capture_ix(0), Actor::Issuer).is_err(),
        "cannot capture early"
    );
    assert!(
        f.run(f.begin_ix(), Actor::Issuer).is_err(),
        "cannot redeem early"
    );

    let direct = token::spl_token::instruction::transfer_checked(
        &token::ID,
        &f.holdings[0],
        &f.mint,
        &f.holdings[1],
        &pk(&f.holders[0]),
        &[],
        1,
        0,
    )
    .unwrap();
    assert!(
        f.run(direct, Actor::Holder(0)).is_err(),
        "direct frozen transfer must fail"
    );
    let direct_burn = token::spl_token::instruction::burn(
        &token::ID,
        &f.holdings[0],
        &f.mint,
        &pk(&f.holders[0]),
        &[],
        1,
    )
    .unwrap();
    assert!(
        f.run(direct_burn, Actor::Holder(0)).is_err(),
        "direct frozen burn must fail"
    );

    // A real SPL close of a frozen zero ATA must not block snapshots.
    let close = token::spl_token::instruction::close_account(
        &token::ID,
        &f.holdings[2],
        &pk(&f.holders[2]),
        &pk(&f.holders[2]),
        &[],
    )
    .unwrap();
    f.run(close, Actor::Holder(2)).unwrap();
    let close = token::spl_token::instruction::close_account(
        &token::ID,
        &f.holdings[3],
        &pk(&f.holders[3]),
        &pk(&f.holders[3]),
        &[],
    )
    .unwrap();
    f.run(close, Actor::Holder(3)).unwrap();
    let recreate =
        spl_associated_token_account::instruction::create_associated_token_account_idempotent(
            &pk(&f.issuer),
            &pk(&f.holders[3]),
            &f.mint,
            &token::ID,
        );
    f.run(recreate, Actor::Issuer).unwrap();
    let owner_change = token::spl_token::instruction::set_authority(
        &token::ID,
        &f.holdings[3],
        Some(&pk(&f.outsider)),
        token::spl_token::instruction::AuthorityType::AccountOwner,
        &pk(&f.holders[3]),
        &[],
    )
    .unwrap();
    f.run(owner_change, Actor::Holder(3)).unwrap();

    let proposal_ix = f.proposal_ix();
    let proposal_size = f.tx_size(&proposal_ix);
    assert!(
        proposal_size <= 1232,
        "legacy transaction too large: {proposal_size}"
    );
    let proposal_cu = f
        .run(proposal_ix, Actor::Issuer)
        .unwrap()
        .compute_units_consumed;
    assert!(proposal_cu < 200_000);
    f.run(f.vote_ix(0, true), Actor::Holder(0)).unwrap();
    assert!(
        f.run(f.vote_ix(0, false), Actor::Holder(0)).is_err(),
        "unique ballot prevents double vote"
    );
    assert!(
        f.run(f.vote_ix(2, true), Actor::Holder(2)).is_err(),
        "zero snapshot has no vote"
    );

    f.now(200);
    assert!(
        f.run(f.transfer_ix(0, 1, 1), Actor::Holder(0)).is_err(),
        "record cutoff blocks transfer"
    );
    let mut incomplete = f.capture_ix(0);
    incomplete.accounts.pop();
    assert!(
        f.run(incomplete, Actor::Issuer).is_err(),
        "missing holder account rejected"
    );
    let mut swapped = f.capture_ix(0);
    swapped.accounts.swap(5, 6);
    assert!(
        f.run(swapped, Actor::Issuer).is_err(),
        "wrong order rejected"
    );
    let capture_ix = f.capture_ix(0);
    let capture_size = f.tx_size(&capture_ix);
    assert!(
        capture_size <= 1232,
        "legacy capture transaction too large: {capture_size}"
    );
    let capture_cu = f
        .run(capture_ix, Actor::Issuer)
        .unwrap()
        .compute_units_consumed;
    assert!(capture_cu < 200_000);
    let coupon: Coupon = f.decode(f.coupon(0));
    assert_eq!(&coupon.units[..4], &[6, 4, 0, 0]);
    assert!(
        f.run(f.capture_ix(0), Actor::Issuer).is_err(),
        "no second snapshot"
    );
    assert!(
        f.run(f.claim_ix(0), Actor::Holder(0)).is_err(),
        "no payment before payment date"
    );

    // All six bonds leave holder0; historical coupon and vote remain six.
    f.run(f.transfer_ix(0, 1, 6), Actor::Holder(0)).unwrap();
    assert_eq!(f.balance(f.holdings[0]), 0);
    assert_eq!(f.balance(f.holdings[1]), 10);
    f.run(f.vote_ix(1, false), Actor::Holder(1)).unwrap();
    let proposal: Proposal = f.decode(f.proposal());
    assert_eq!((proposal.yes_units, proposal.no_units), (6, 4));
    let ballot = Pubkey::find_program_address(
        &[b"ballot", f.proposal().as_ref(), pk(&f.holders[0]).as_ref()],
        &bondtrace::ID,
    )
    .0;
    assert_eq!(f.decode::<Ballot>(ballot).weight, 6);

    // Recreate closed zero holder2 ATA and transfer one bond to it via program.
    let recreate =
        spl_associated_token_account::instruction::create_associated_token_account_idempotent(
            &pk(&f.issuer),
            &pk(&f.holders[2]),
            &f.mint,
            &token::ID,
        );
    f.run(recreate, Actor::Issuer).unwrap();
    f.run(f.transfer_ix(1, 2, 1), Actor::Holder(1)).unwrap();
    assert_eq!(f.balance(f.holdings[2]), 1);
    f.now(400);
    assert!(
        f.run(f.transfer_ix(1, 0, 1), Actor::Holder(1)).is_err(),
        "maturity blocks transfer"
    );
    assert!(
        f.run(f.vote_ix(2, true), Actor::Holder(2)).is_err(),
        "vote window closed"
    );
    let begin_ix = f.begin_ix();
    let begin_size = f.tx_size(&begin_ix);
    assert!(begin_size <= 1232);
    let begin_cu = f
        .run(begin_ix, Actor::Issuer)
        .unwrap()
        .compute_units_consumed;
    assert!(begin_cu < 200_000);
    let principal_cu = f
        .run(f.redeem_ix(1), Actor::Holder(1))
        .unwrap()
        .compute_units_consumed;
    assert_eq!(f.balance(f.destinations[1]), 9_000_000_000);
    assert!(
        f.run(f.redeem_ix(1), Actor::Holder(1)).is_err(),
        "principal one shot"
    );
    f.run(f.redeem_ix(2), Actor::Holder(2)).unwrap();
    assert_eq!(f.supply(), 0);
    assert_eq!(f.decode::<Bond>(f.bond).state, REDEEMED);
    assert_eq!(
        f.balance(f.vault),
        500_000_000,
        "unclaimed historic coupon fully reserved"
    );
    f.run(f.claim_ix(0), Actor::Holder(0)).unwrap();
    assert_eq!(
        f.balance(f.destinations[0]),
        300_000_000,
        "old owner claims after Redeemed"
    );
    assert!(
        f.run(f.claim_ix(0), Actor::Holder(0)).is_err(),
        "coupon one shot"
    );
    f.run(f.claim_ix(1), Actor::Holder(1)).unwrap();
    assert_eq!(f.balance(f.destinations[1]), 9_200_000_000);
    assert_eq!(f.balance(f.vault), 0);
    println!("MEASURED holders16 proposal={proposal_size}bytes/{proposal_cu}CU capture={capture_size}bytes/{capture_cu}CU redemption={begin_size}bytes/{begin_cu}CU principal={principal_cu}CU");
}

#[test]
fn draft_authority_and_record_date_cannot_be_bypassed() {
    let mut f = Fixture::new(2);
    assert!(f.run(f.issue_ix(0, 1, true), Actor::Outsider).is_err());
    assert!(f.run(f.register_ix(0, true), Actor::Outsider).is_err());
    f.run(f.issue_ix(0, 1, false), Actor::Issuer).unwrap();
    f.fund(1_050_000_000);
    let fresh = Keypair::new();
    f.svm.airdrop(&fresh.pubkey(), 1_000_000_000).unwrap();
    let fresh_ata = get_associated_token_address(&pk(&fresh), &f.mint);
    token_fixture(&mut f.svm, fresh_ata, f.mint, pk(&fresh), 0);
    f.holders.push(fresh);
    f.holdings.push(fresh_ata);
    f.now(200);
    assert!(f.run(f.issue_ix(0, 1, false), Actor::Issuer).is_err());
    assert!(f.run(f.register_ix(2, false), Actor::Issuer).is_err());
    assert!(f.run(f.seal_ix(), Actor::Issuer).is_err());
    assert_eq!(f.supply(), 1);
}

#[test]
fn draft_issuance_recovers_recreated_empty_holder_account() {
    let mut f = Fixture::new(1);
    let close = token::spl_token::instruction::close_account(
        &token::ID,
        &f.holdings[0],
        &pk(&f.holders[0]),
        &pk(&f.holders[0]),
        &[],
    )
    .unwrap();
    f.run(close, Actor::Holder(0)).unwrap();
    let recreate =
        spl_associated_token_account::instruction::create_associated_token_account_idempotent(
            &pk(&f.issuer),
            &pk(&f.holders[0]),
            &f.mint,
            &token::ID,
        );
    f.run(recreate, Actor::Issuer).unwrap();
    let holding = token::spl_token::state::Account::unpack(
        &f.svm.get_account(&ad(f.holdings[0])).unwrap().data,
    )
    .unwrap();
    assert_eq!(holding.state, token::spl_token::state::AccountState::Initialized);
    assert_eq!(holding.amount, 0);
    assert!(f.run(f.issue_ix(0, 1, true), Actor::Outsider).is_err());
    f.run(f.issue_ix(0, 1, false), Actor::Issuer)
        .expect("issuer can issue into the holder's safely recreated empty canonical ATA");
    f.run(f.issue_ix(0, 1, false), Actor::Issuer).unwrap();
    assert_eq!(f.supply(), 2);
    assert_eq!(f.decode::<Bond>(f.bond).total_issued, 2);
    let holding = token::spl_token::state::Account::unpack(
        &f.svm.get_account(&ad(f.holdings[0])).unwrap().data,
    )
    .unwrap();
    assert_eq!(holding.state, token::spl_token::state::AccountState::Frozen);
    assert_eq!(holding.amount, 2);

    // The exception is only for empty initialized accounts, never positive ones.
    let mut account = f.svm.get_account(&ad(f.holdings[0])).unwrap();
    let original_account = account.clone();
    let mut unfrozen = holding;
    unfrozen.state = token::spl_token::state::AccountState::Initialized;
    token::spl_token::state::Account::pack(unfrozen, &mut account.data).unwrap();
    f.svm.set_account(ad(f.holdings[0]), account).unwrap();
    assert!(f.run(f.issue_ix(0, 1, false), Actor::Issuer).is_err());
    assert_eq!(f.supply(), 2);
    assert_eq!(f.decode::<Bond>(f.bond).total_issued, 2);
    f.svm.set_account(ad(f.holdings[0]), original_account).unwrap();

    f.fund(2_100_000_000);
    f.run(f.seal_ix(), Actor::Issuer).unwrap();
    f.now(200);
    f.run(f.capture_ix(0), Actor::Issuer).unwrap();
    assert_eq!(f.decode::<Coupon>(f.coupon(0)).units, vec![2]);
    f.now(400);
    f.run(f.begin_ix(), Actor::Issuer).unwrap();
    f.run(f.redeem_ix(0), Actor::Holder(0)).unwrap();
    f.run(f.claim_ix(0), Actor::Holder(0)).unwrap();
    assert_eq!(f.decode::<Bond>(f.bond).state, REDEEMED);
    assert_eq!(f.supply(), 0);
    assert_eq!(f.balance(f.vault), 0);
    assert_eq!(f.balance(f.destinations[0]), 2_100_000_000);
    println!("PROVEN recreated-empty-ATA draft issue=2 frozen=true coupon=100000000 principal=2000000000 supply=0 vault=0");
}

#[test]
fn wrong_claim_destination_is_rejected_without_burning_or_paying() {
    let mut f = Fixture::new(2);
    f.run(f.issue_ix(0, 1, false), Actor::Issuer).unwrap();
    f.fund(1_050_000_000);
    f.run(f.seal_ix(), Actor::Issuer).unwrap();
    f.now(200);
    f.run(f.capture_ix(0), Actor::Issuer).unwrap();
    f.now(400);
    f.run(f.begin_ix(), Actor::Issuer).unwrap();
    let mut wrong = f.redeem_ix(0);
    wrong.accounts[6].pubkey = ad(f.destinations[1]);
    assert!(f.run(wrong, Actor::Holder(0)).is_err());
    assert_eq!(f.supply(), 1);
    assert_eq!(f.balance(f.vault), 1_050_000_000);
    assert_eq!(f.decode::<Bond>(f.bond).principal_claimed_mask, 0);
    let wrong_mint_account = pk(&Keypair::new());
    token_fixture(&mut f.svm, wrong_mint_account, f.mint, pk(&f.holders[0]), 0);
    let mut wrong_mint = f.redeem_ix(0);
    wrong_mint.accounts[6].pubkey = ad(wrong_mint_account);
    assert!(f.run(wrong_mint, Actor::Holder(0)).is_err());
    assert_eq!(f.supply(), 1);
    assert_eq!(f.balance(f.vault), 1_050_000_000);
    f.run(f.redeem_ix(0), Actor::Holder(0)).unwrap();
    let mut wrong_coupon = f.claim_ix(0);
    wrong_coupon.accounts[5].pubkey = ad(f.destinations[1]);
    assert!(f.run(wrong_coupon, Actor::Holder(0)).is_err());
    assert_eq!(f.decode::<Coupon>(f.coupon(0)).claimed_mask, 0);
    let mut wrong_coupon_mint = f.claim_ix(0);
    wrong_coupon_mint.accounts[5].pubkey = ad(wrong_mint_account);
    assert!(f.run(wrong_coupon_mint, Actor::Holder(0)).is_err());
    assert_eq!(f.decode::<Coupon>(f.coupon(0)).claimed_mask, 0);
}

#[test]
fn sequential_coupons_use_different_record_owners_and_must_capture_before_redemption() {
    let mut f = Fixture::new_with_terms(
        2,
        vec![
            CouponTerms {
                record_ts: 200,
                payment_ts: 250,
                unit_amount: 50_000_000,
            },
            CouponTerms {
                record_ts: 300,
                payment_ts: 350,
                unit_amount: 50_000_000,
            },
        ],
    );
    f.run(f.issue_ix(0, 1, false), Actor::Issuer).unwrap();
    f.fund(1_100_000_000);
    f.run(f.seal_ix(), Actor::Issuer).unwrap();
    f.now(200);
    assert!(
        f.run(f.capture_ix(1), Actor::Issuer).is_err(),
        "cannot skip first scheduled record"
    );
    f.run(f.capture_ix(0), Actor::Issuer).unwrap();
    f.run(f.transfer_ix(0, 1, 1), Actor::Holder(0)).unwrap();
    f.now(400);
    assert!(
        f.run(f.begin_ix(), Actor::Issuer).is_err(),
        "final coupon cannot disappear at maturity"
    );
    f.run(f.capture_ix(1), Actor::Issuer).unwrap();
    assert_eq!(&f.decode::<Coupon>(f.coupon(0)).units, &[1, 0]);
    assert_eq!(&f.decode::<Coupon>(f.coupon(1)).units, &[0, 1]);
    f.run(f.begin_ix(), Actor::Issuer).unwrap();
    f.run(f.redeem_ix(1), Actor::Holder(1)).unwrap();
    f.run(f.claim_ix_at(0, 0), Actor::Holder(0)).unwrap();
    f.run(f.claim_ix_at(1, 1), Actor::Holder(1)).unwrap();
    assert_eq!(f.balance(f.vault), 0);
}

#[test]
fn invalid_terms_fail_before_creating_a_new_issue() {
    let mut f = Fixture::new(1);
    let bond = Pubkey::find_program_address(
        &[b"bond", pk(&f.issuer).as_ref(), &2_u64.to_le_bytes()],
        &bondtrace::ID,
    )
    .0;
    let mint = Pubkey::find_program_address(&[b"bond_mint", bond.as_ref()], &bondtrace::ID).0;
    let vault = Pubkey::find_program_address(&[b"vault", bond.as_ref()], &bondtrace::ID).0;
    let cases = vec![
        (
            0,
            vec![CouponTerms {
                record_ts: 200,
                payment_ts: 250,
                unit_amount: 1,
            }],
        ),
        (
            1,
            vec![CouponTerms {
                record_ts: 100,
                payment_ts: 250,
                unit_amount: 1,
            }],
        ),
        (
            1,
            vec![CouponTerms {
                record_ts: 200,
                payment_ts: 190,
                unit_amount: 1,
            }],
        ),
        (
            1,
            vec![CouponTerms {
                record_ts: 200,
                payment_ts: 401,
                unit_amount: 1,
            }],
        ),
        (
            1,
            vec![CouponTerms {
                record_ts: 200,
                payment_ts: 250,
                unit_amount: 0,
            }],
        ),
        (
            u64::MAX,
            vec![CouponTerms {
                record_ts: 200,
                payment_ts: 250,
                unit_amount: 1,
            }],
        ),
        (
            1,
            vec![
                CouponTerms {
                    record_ts: 200,
                    payment_ts: 350,
                    unit_amount: 1,
                },
                CouponTerms {
                    record_ts: 300,
                    payment_ts: 340,
                    unit_amount: 1,
                },
            ],
        ),
        (
            1,
            vec![
                CouponTerms {
                    record_ts: 200,
                    payment_ts: 250,
                    unit_amount: 1,
                },
                CouponTerms {
                    record_ts: 200,
                    payment_ts: 260,
                    unit_amount: 1,
                },
            ],
        ),
        (1, Vec::new()),
    ];
    for (face_value, coupons) in cases {
        let instruction = ix(
            bondtrace::accounts::InitializeIssue {
                issuer: pk(&f.issuer),
                bond,
                bond_mint: mint,
                settlement_mint: f.settlement,
                vault,
                token_program: token::ID,
                system_program: anchor_lang::system_program::ID,
                rent: anchor_lang::prelude::rent::ID,
            },
            bondtrace::instruction::InitializeIssue {
                series_id: 2,
                name: "Invalid terms".into(),
                face_value,
                maturity_ts: 400,
                coupons,
            },
        );
        assert!(f.run(instruction, Actor::Issuer).is_err());
        assert!(
            f.svm.get_account(&ad(bond)).is_none(),
            "failure must roll back account creation"
        );
    }
}

// Measure the complete v0 bundles used by the application: compute-budget
// instruction, optional idempotent ATA creation, and the program instruction.
// The actual actor pays/signs; these are ephemeral LiteSVM keys, never RPC keys.
#[derive(Default)]
struct LimitMeasurements(std::collections::BTreeMap<&'static str, (usize, u64, usize)>);

impl Fixture {
    fn run_v0_measured(
        &mut self,
        instructions: Vec<Instruction>,
        actor: Actor,
        label: &'static str,
        measurements: &mut LimitMeasurements,
    ) -> litesvm::types::TransactionMetadata {
        use solana_message::{v0, VersionedMessage};
        use solana_transaction::versioned::VersionedTransaction;

        self.svm.expire_blockhash();
        let signer: &dyn Signer = match actor {
            Actor::Issuer => &self.issuer,
            Actor::Holder(index) => &self.holders[index],
            Actor::Outsider => &self.outsider,
        };
        let build = |limit: u32| {
            let mut data = vec![2]; // SetComputeUnitLimit.
            data.extend_from_slice(&limit.to_le_bytes());
            let mut bundle = vec![Instruction {
                program_id: "ComputeBudget111111111111111111111111111111"
                    .parse()
                    .unwrap(),
                accounts: vec![],
                data,
            }];
            bundle.extend(instructions.clone());
            let message = v0::Message::try_compile(
                &signer.pubkey(),
                &bundle,
                &[], // No ALT; the application also uses static addresses here.
                self.svm.latest_blockhash(),
            )
            .unwrap();
            VersionedTransaction::try_new(VersionedMessage::V0(message), &[signer]).unwrap()
        };
        let simulated = self.svm.simulate_transaction(build(1_400_000)).unwrap();
        // Same measured 20% margin + 1,000 CU used by server/transactions.ts.
        let used = simulated.meta.compute_units_consumed;
        let limit = (((used * 120 + 99) / 100) + 1_000).clamp(10_000, 1_400_000) as u32;
        let transaction = build(limit);
        let bytes = bincode::serialize(&transaction).unwrap().len();
        let accounts = transaction.message.static_account_keys().len();
        assert!(
            bytes <= 1232,
            "{label} v0 bundle exceeds packet limit: {bytes}"
        );
        assert!(accounts <= 64, "{label} exceeds 64 static accounts");
        let metadata = self.svm.send_transaction(transaction).unwrap();
        assert!(metadata.compute_units_consumed <= u64::from(limit));
        assert!(
            metadata.compute_units_consumed < 200_000,
            "{label} exceeds measured CU guard"
        );
        let maximum = measurements.0.entry(label).or_default();
        maximum.0 = maximum.0.max(bytes);
        maximum.1 = maximum.1.max(metadata.compute_units_consumed);
        maximum.2 = maximum.2.max(accounts);
        metadata
    }

    fn ensure_settlement_ix(&self, holder: usize) -> Instruction {
        spl_associated_token_account::instruction::create_associated_token_account_idempotent(
            &pk(&self.holders[holder]),
            &pk(&self.holders[holder]),
            &self.settlement,
            &token::ID,
        )
    }

    fn maximum_fixture(measurements: &mut LimitMeasurements) -> Self {
        let mut svm = LiteSVM::new();
        svm.add_program_from_file(
            ad(bondtrace::ID),
            format!(
                "{}/../../target/deploy/bondtrace.so",
                env!("CARGO_MANIFEST_DIR")
            ),
        )
        .unwrap();
        let issuer = Keypair::new();
        let outsider = Keypair::new();
        let holders: Vec<_> = (0..16).map(|_| Keypair::new()).collect();
        for wallet in std::iter::once(&issuer)
            .chain(std::iter::once(&outsider))
            .chain(holders.iter())
        {
            svm.airdrop(&wallet.pubkey(), 10_000_000_000).unwrap();
        }
        let mut clock: Clock = svm.get_sysvar();
        clock.unix_timestamp = 100;
        svm.set_sysvar(&clock);
        let bond = Pubkey::find_program_address(
            &[b"bond", pk(&issuer).as_ref(), &1_u64.to_le_bytes()],
            &bondtrace::ID,
        )
        .0;
        let mint = Pubkey::find_program_address(&[b"bond_mint", bond.as_ref()], &bondtrace::ID).0;
        let vault = Pubkey::find_program_address(&[b"vault", bond.as_ref()], &bondtrace::ID).0;
        let settlement = pk(&Keypair::new());
        let source = get_associated_token_address(&pk(&issuer), &settlement);
        mint_fixture(&mut svm, settlement, pk(&issuer), 6);
        token_fixture(&mut svm, source, settlement, pk(&issuer), 1_000_000_000_000);
        let holdings = holders
            .iter()
            .map(|holder| get_associated_token_address(&pk(holder), &mint))
            .collect();
        let destinations = holders
            .iter()
            .map(|holder| get_associated_token_address(&pk(holder), &settlement))
            .collect();
        let mut f = Self {
            svm,
            issuer,
            holders,
            outsider,
            bond,
            mint,
            settlement,
            vault,
            source,
            holdings,
            destinations,
        };
        let terms: Vec<_> = (0..8)
            .map(|index| CouponTerms {
                record_ts: 120 + index * 30,
                payment_ts: 130 + index * 30,
                unit_amount: (index as u64 + 1) * 1_000_000,
            })
            .collect();
        let name = "Қ".repeat(32);
        assert_eq!(name.len(), 64, "UTF-8 limit is bytes, not characters");
        let mut initialize = f.init_ix(1_000_000_000, terms.clone());
        let arguments = |name: String, coupons: Vec<CouponTerms>| {
            bondtrace::instruction::InitializeIssue {
                series_id: 1,
                name,
                face_value: 1_000_000_000,
                maturity_ts: 400,
                coupons,
            }
            .data()
        };
        initialize.data = arguments(format!("{name}X"), terms.clone());
        let invalid_name = f.run(initialize.clone(), Actor::Issuer).unwrap_err();
        assert!(invalid_name
            .meta
            .logs
            .iter()
            .any(|line| line.contains("Error Code: InvalidTerms.")));
        assert!(
            f.svm.get_account(&ad(f.bond)).is_none(),
            "invalid initialization must roll back"
        );
        let mut nine_terms = terms.clone();
        nine_terms.push(CouponTerms {
            record_ts: 360,
            payment_ts: 370,
            unit_amount: 9_000_000,
        });
        initialize.data = arguments(name.clone(), nine_terms);
        let too_many_coupons = f.run(initialize.clone(), Actor::Issuer).unwrap_err();
        assert!(too_many_coupons
            .meta
            .logs
            .iter()
            .any(|line| line.contains("Error Code: InvalidTerms.")));
        assert!(f.svm.get_account(&ad(f.bond)).is_none());
        initialize.data = arguments(name, terms);
        f.run_v0_measured(
            vec![initialize],
            Actor::Issuer,
            "initialize_name64_coupons8",
            measurements,
        );
        for index in 0..16 {
            let create = spl_associated_token_account::instruction::create_associated_token_account_idempotent(
                &pk(&f.issuer), &pk(&f.holders[index]), &f.mint, &token::ID,
            );
            f.run_v0_measured(
                vec![create, f.register_ix(index, false)],
                Actor::Issuer,
                "register_with_new_ata",
                measurements,
            );
        }
        f
    }
}

#[test]
fn maximum_parameters_complete_all_holders_coupons_and_v0_bundles() {
    let mut measurements = LimitMeasurements::default();
    let mut f = Fixture::maximum_fixture(&mut measurements);
    let terms = f.decode::<Bond>(f.bond).coupon_terms;
    let mut units: Vec<u64> = (1..=16).collect();
    let total_units: u64 = units.iter().sum();
    let coupon_per_unit = terms
        .iter()
        .try_fold(0_u64, |sum, term| sum.checked_add(term.unit_amount))
        .unwrap();
    let unit_reserve = 1_000_000_000_u64.checked_add(coupon_per_unit).unwrap();
    let full_reserve = total_units.checked_mul(unit_reserve).unwrap();
    assert_eq!(full_reserve, 140_896_000_000);
    for (holder, amount) in units.iter().enumerate() {
        f.run_v0_measured(
            vec![f.issue_ix(holder, *amount, false)],
            Actor::Issuer,
            "issue_units",
            &mut measurements,
        );
        assert_eq!(f.balance(f.holdings[holder]), *amount);
    }
    assert_eq!(f.supply(), total_units);
    assert_eq!(f.decode::<Bond>(f.bond).holder_wallets.len(), 16);
    // Supply a valid seventeenth wallet/ATA so rejection exercises RegistryFull.
    let extra = Keypair::new();
    f.svm.airdrop(&extra.pubkey(), 1_000_000_000).unwrap();
    let extra_ata = get_associated_token_address(&pk(&extra), &f.mint);
    token_fixture(&mut f.svm, extra_ata, f.mint, pk(&extra), 0);
    f.holders.push(extra);
    f.holdings.push(extra_ata);
    let registry_full = f.run(f.register_ix(16, false), Actor::Issuer).unwrap_err();
    assert!(registry_full
        .meta
        .logs
        .iter()
        .any(|line| line.contains("Error Code: RegistryFull.")));
    f.holders.pop();
    f.holdings.pop();
    assert_eq!(f.decode::<Bond>(f.bond).holder_wallets.len(), 16);

    let fund = |f: &Fixture, amount| {
        ix(
            bondtrace::accounts::FundVault {
                funder: pk(&f.issuer),
                bond: f.bond,
                settlement_mint: f.settlement,
                source: f.source,
                vault: f.vault,
                token_program: token::ID,
            },
            bondtrace::instruction::FundVault { amount },
        )
    };
    f.run_v0_measured(
        vec![fund(&f, full_reserve - 1)],
        Actor::Issuer,
        "fund_vault",
        &mut measurements,
    );
    assert!(
        f.run(f.seal_ix(), Actor::Issuer).is_err(),
        "one base-unit reserve shortfall must fail"
    );
    assert_eq!(f.decode::<Bond>(f.bond).state, bondtrace::DRAFT);
    f.run_v0_measured(
        vec![fund(&f, 1)],
        Actor::Issuer,
        "fund_vault",
        &mut measurements,
    );
    f.run_v0_measured(
        vec![f.seal_ix()],
        Actor::Issuer,
        "seal_exact_reserve",
        &mut measurements,
    );
    assert_eq!(f.balance(f.vault), full_reserve);

    let title = "Қ".repeat(48);
    assert_eq!(title.len(), 96);
    let mut proposal_ix = f.proposal_ix();
    proposal_ix.data = bondtrace::instruction::CreateProposal {
        proposal_id: 1,
        title: format!("{title}X"),
        closes_at: 390,
    }
    .data();
    let invalid_title = f.run(proposal_ix.clone(), Actor::Issuer).unwrap_err();
    assert!(invalid_title
        .meta
        .logs
        .iter()
        .any(|line| line.contains("Error Code: InvalidTerms.")));
    assert!(f.svm.get_account(&ad(f.proposal())).is_none());
    proposal_ix.data = bondtrace::instruction::CreateProposal {
        proposal_id: 1,
        title: title.clone(),
        closes_at: 390,
    }
    .data();
    f.run_v0_measured(
        vec![proposal_ix],
        Actor::Issuer,
        "proposal_title96_holders16",
        &mut measurements,
    );
    let proposal: Proposal = f.decode(f.proposal());
    assert_eq!(proposal.title, title);
    assert_eq!(proposal.units, units);
    for holder in (0..16).rev() {
        f.run_v0_measured(
            vec![f.vote_ix(holder, holder % 2 == 0)],
            Actor::Holder(holder),
            "vote",
            &mut measurements,
        );
        if holder == 15 {
            assert_eq!(f.decode::<Proposal>(f.proposal()).ballot_mask, 1 << 15);
            assert!(f
                .run(f.vote_ix(holder, true), Actor::Holder(holder))
                .is_err());
        }
    }
    let proposal: Proposal = f.decode(f.proposal());
    assert_eq!(proposal.ballot_mask, u16::MAX);
    assert_eq!((proposal.yes_units, proposal.no_units), (64, 72));

    let ensure_bond_destination =
        spl_associated_token_account::instruction::create_associated_token_account_idempotent(
            &pk(&f.holders[15]),
            &pk(&f.holders[0]),
            &f.mint,
            &token::ID,
        );
    f.run_v0_measured(
        vec![ensure_bond_destination, f.transfer_ix(15, 0, 1)],
        Actor::Holder(15),
        "transfer_with_existing_ata",
        &mut measurements,
    );
    units[0] += 1;
    units[15] -= 1;
    assert!(units.iter().all(|amount| *amount > 0));
    assert_eq!(f.balance(f.holdings[0]), units[0]);
    assert_eq!(f.balance(f.holdings[15]), units[15]);

    for (index, term) in terms.iter().enumerate() {
        f.now(term.record_ts);
        f.run_v0_measured(
            vec![f.capture_ix(index as u8)],
            Actor::Issuer,
            "capture_holders16",
            &mut measurements,
        );
        let coupon: Coupon = f.decode(f.coupon(index as u8));
        assert_eq!(coupon.units, units);
        assert_eq!(coupon.total_units, total_units);
        assert_eq!(coupon.claimed_mask, 0);
    }
    assert_eq!(f.decode::<Bond>(f.bond).next_coupon_index, 8);
    f.now(400);
    f.run_v0_measured(
        vec![f.begin_ix()],
        Actor::Issuer,
        "begin_redemption_holders16",
        &mut measurements,
    );
    assert_eq!(f.decode::<Bond>(f.bond).redemption_units, units);
    for holder in (0..16).rev() {
        f.run_v0_measured(
            vec![f.ensure_settlement_ix(holder), f.redeem_ix(holder)],
            Actor::Holder(holder),
            "principal_with_new_ata",
            &mut measurements,
        );
        assert_eq!(f.balance(f.holdings[holder]), 0);
        assert_eq!(
            f.balance(f.destinations[holder]),
            units[holder] * 1_000_000_000
        );
        if holder == 15 {
            assert_eq!(f.decode::<Bond>(f.bond).principal_claimed_mask, 1 << 15);
            assert!(f.run(f.redeem_ix(holder), Actor::Holder(holder)).is_err());
        }
    }
    let bond: Bond = f.decode(f.bond);
    assert_eq!(bond.name.len(), 64);
    assert_eq!(bond.state, REDEEMED);
    assert_eq!(bond.total_redeemed, total_units);
    assert_eq!(bond.principal_claimed_mask, u16::MAX);
    assert_eq!(f.supply(), 0);
    assert_eq!(f.balance(f.vault), total_units * coupon_per_unit);

    // All 128 historical entitlements remain payable after all 136 units burn.
    for index in (0..8).rev() {
        for holder in (0..16).rev() {
            f.run_v0_measured(
                vec![f.ensure_settlement_ix(holder), f.claim_ix_at(holder, index)],
                Actor::Holder(holder),
                "coupon_with_existing_ata",
                &mut measurements,
            );
            if holder == 15 {
                assert_eq!(f.decode::<Coupon>(f.coupon(index)).claimed_mask, 1 << 15);
                assert!(f
                    .run(f.claim_ix_at(holder, index), Actor::Holder(holder))
                    .is_err());
            }
        }
        let coupon: Coupon = f.decode(f.coupon(index));
        assert_eq!(coupon.claimed_mask, u16::MAX);
        assert_eq!(
            coupon.paid_total,
            total_units * terms[index as usize].unit_amount
        );
    }
    assert_eq!(f.balance(f.vault), 0);
    assert_eq!(f.balance(f.source), 1_000_000_000_000 - full_reserve);
    for holder in 0..16 {
        assert_eq!(
            f.balance(f.destinations[holder]),
            units[holder] * unit_reserve
        );
    }
    for (label, (bytes, cu, accounts)) in measurements.0 {
        println!("MEASURED maximum {label}={bytes}bytes/{cu}CU/{accounts}accounts v0 actor-payer budget+actual-bundle");
    }
    println!("PROVEN maximum holders=16 positive=16 coupons=8 name_utf8_bytes=64 title_utf8_bytes=96 units=136 reserve=140896000000 votes=16 principal=16 coupon_claims=128 final_supply=0 final_vault=0");
}

#[test]
fn frozen_reserve_cannot_activate_even_when_fully_funded() {
    let mut f = Fixture::new(1);
    // Model a valid classic settlement mint whose external authority can freeze
    // accounts. Such mints remain supported; activation needs a spendable vault.
    let mut settlement_account = f.svm.get_account(&ad(f.settlement)).unwrap();
    let mut settlement_mint =
        token::spl_token::state::Mint::unpack(&settlement_account.data).unwrap();
    settlement_mint.freeze_authority = COption::Some(pk(&f.issuer));
    token::spl_token::state::Mint::pack(settlement_mint, &mut settlement_account.data).unwrap();
    f.svm
        .set_account(ad(f.settlement), settlement_account)
        .unwrap();
    f.run(f.issue_ix(0, 10, false), Actor::Issuer).unwrap();
    f.fund(10_500_000_000);
    let freeze = token::spl_token::instruction::freeze_account(
        &token::ID,
        &f.vault,
        &f.settlement,
        &pk(&f.issuer),
        &[],
    )
    .unwrap();
    f.run(freeze, Actor::Issuer).unwrap();
    let keys = [f.bond, f.vault, f.mint, f.holdings[0]];
    let before: Vec<_> = keys
        .iter()
        .map(|key| f.svm.get_account(&ad(*key)).unwrap())
        .collect();
    let result = f.run(f.seal_ix(), Actor::Issuer);
    println!(
        "OBSERVED frozen-reserve funded={} seal_succeeded={} phase={}",
        f.balance(f.vault),
        result.is_ok(),
        f.decode::<Bond>(f.bond).state
    );
    assert!(result.is_err(), "a fully funded frozen vault must not activate the issue");
    let failed = result.unwrap_err();
    assert!(failed
        .meta
        .logs
        .iter()
        .any(|line| line.contains("Error Code: InvalidTerms.")));
    for (key, original) in keys.iter().zip(&before) {
        assert_eq!(f.svm.get_account(&ad(*key)).unwrap(), *original);
    }
    assert_eq!(f.decode::<Bond>(f.bond).state, bondtrace::DRAFT);

    let thaw = token::spl_token::instruction::thaw_account(
        &token::ID,
        &f.vault,
        &f.settlement,
        &pk(&f.issuer),
        &[],
    )
    .unwrap();
    f.run(thaw, Actor::Issuer).unwrap();
    f.run(f.seal_ix(), Actor::Issuer).unwrap();
    assert_eq!(f.decode::<Bond>(f.bond).state, ACTIVE);
    f.now(200);
    f.run(f.capture_ix(0), Actor::Issuer).unwrap();
    f.now(250);
    f.run(f.claim_ix(0), Actor::Holder(0)).unwrap();
    assert_eq!(f.balance(f.destinations[0]), 500_000_000);
    f.now(400);
    f.run(f.begin_ix(), Actor::Issuer).unwrap();
    f.run(f.redeem_ix(0), Actor::Holder(0)).unwrap();
    assert_eq!(f.balance(f.destinations[0]), 10_500_000_000);
    assert_eq!(f.balance(f.vault), 0);
    assert_eq!(f.supply(), 0);
    println!("PROVEN frozen-reserve rejected=true thaw+seal+coupon+principal=paid coupon500000000 principal10000000000 supply0 vault0");
}

#[test]
fn failed_settlement_cpi_after_burn_rolls_back_principal_and_all_token_state() {
    let mut f = Fixture::new(2);
    // Only a fixture mint authority is added; the deployed program is unchanged.
    let mut settlement_account = f.svm.get_account(&ad(f.settlement)).unwrap();
    let mut settlement_mint =
        token::spl_token::state::Mint::unpack(&settlement_account.data).unwrap();
    settlement_mint.freeze_authority = COption::Some(pk(&f.issuer));
    token::spl_token::state::Mint::pack(settlement_mint, &mut settlement_account.data).unwrap();
    f.svm
        .set_account(ad(f.settlement), settlement_account)
        .unwrap();
    f.run(f.issue_ix(0, 3, false), Actor::Issuer).unwrap();
    f.fund(3_150_000_000);
    f.run(f.seal_ix(), Actor::Issuer).unwrap();
    f.now(200);
    f.run(f.capture_ix(0), Actor::Issuer).unwrap();
    f.now(400);
    f.run(f.begin_ix(), Actor::Issuer).unwrap();
    let freeze = token::spl_token::instruction::freeze_account(
        &token::ID,
        &f.destinations[0],
        &f.settlement,
        &pk(&f.issuer),
        &[],
    )
    .unwrap();
    f.run(freeze, Actor::Issuer).unwrap();
    let keys = [
        f.bond,
        f.mint,
        f.holdings[0],
        f.vault,
        f.destinations[0],
        f.coupon(0),
    ];
    let before: Vec<_> = keys
        .iter()
        .map(|key| f.svm.get_account(&ad(*key)).unwrap())
        .collect();
    let failed = f.run(f.redeem_ix(0), Actor::Holder(0)).unwrap_err();
    let logs = &failed.meta.logs;
    let burn = logs
        .iter()
        .position(|line| line.contains("Instruction: Burn"))
        .expect("burn CPI must execute before failure");
    let payout = logs
        .iter()
        .position(|line| line.contains("Instruction: TransferChecked"))
        .expect("payment CPI must be reached");
    assert!(burn < payout);
    let token_success = format!("Program {} success", token::ID);
    assert!(
        logs[burn + 1..payout]
            .iter()
            .any(|line| line == &token_success),
        "SPL burn must have succeeded before payout"
    );
    let token_failure = format!("Program {} failed: custom program error: 0x11", token::ID);
    assert!(
        logs[payout..].iter().any(|line| line == &token_failure),
        "payment must fail with SPL AccountFrozen (17), not a pre-burn validation"
    );
    for (key, original) in keys.iter().zip(&before) {
        assert_eq!(
            f.svm.get_account(&ad(*key)).unwrap(),
            *original,
            "failed transaction must restore every affected program/token account"
        );
    }
    let bond: Bond = f.decode(f.bond);
    assert_eq!(bond.principal_claimed_mask, 0);
    assert_eq!(bond.total_redeemed, 0);
    assert_eq!(bond.state, bondtrace::REDEEMING);
    assert_eq!(f.balance(f.holdings[0]), 3);
    assert_eq!(f.supply(), 3);
    assert_eq!(f.balance(f.vault), 3_150_000_000);
    assert_eq!(f.balance(f.destinations[0]), 0);
    let thaw = token::spl_token::instruction::thaw_account(
        &token::ID,
        &f.destinations[0],
        &f.settlement,
        &pk(&f.issuer),
        &[],
    )
    .unwrap();
    f.run(thaw, Actor::Issuer).unwrap();
    f.run(f.redeem_ix(0), Actor::Holder(0)).unwrap();
    assert_eq!(f.supply(), 0);
    assert_eq!(f.balance(f.holdings[0]), 0);
    assert_eq!(f.balance(f.destinations[0]), 3_000_000_000);
    assert_eq!(f.balance(f.vault), 150_000_000);
    assert_eq!(f.decode::<Bond>(f.bond).principal_claimed_mask, 1);
    assert_eq!(f.decode::<Bond>(f.bond).state, REDEEMED);
    assert!(
        f.run(f.redeem_ix(0), Actor::Holder(0)).is_err(),
        "retry after successful redemption cannot pay twice"
    );
    f.run(f.claim_ix(0), Actor::Holder(0)).unwrap();
    assert_eq!(f.balance(f.destinations[0]), 3_150_000_000);
    assert_eq!(f.balance(f.vault), 0);
    println!("PROVEN rollback burn-CPI-success -> SPL-TransferChecked-AccountFrozen17 -> all-6-account-bytes-restored failed_CU={} thaw+retry_once=paid coupon=paid final_supply=0 final_vault=0", failed.meta.compute_units_consumed);
}

fn regular_terms(amount: u64) -> Vec<CouponTerms> {
    vec![CouponTerms { record_ts: 200, payment_ts: 250, unit_amount: amount }]
}

fn assert_initialization_absent(f: &Fixture) {
    for key in [f.bond, f.mint, f.vault, f.financial_terms()] {
        assert!(f.svm.get_account(&ad(key)).is_none(), "failed init retained {key}");
    }
}

#[test]
fn direct_rate_initialization_rejects_every_mismatch_range_remainder_and_overflow() {
    let mut f = Fixture::uninitialized(1);
    let source = f.svm.get_account(&ad(f.source)).unwrap();
    let settlement = f.svm.get_account(&ad(f.settlement)).unwrap();
    let canonical = 50_000_000;
    let mut cases = vec![
        (1_000_000_000, 0, 2, regular_terms(canonical)),
        (1_000_000_000, 10_001, 2, regular_terms(canonical)),
        (1_000_000_000, u16::MAX, 2, regular_terms(canonical)),
        (1_000_000_000, 1000, 0, regular_terms(canonical)),
        (1_000_000_000, 1000, 13, regular_terms(canonical)),
        (1_000_000_000, 1000, u8::MAX, regular_terms(canonical)),
        (0, 1000, 2, regular_terms(canonical)),
        (1_000_000, 1, 12, regular_terms(1)), // Nonzero remainder.
        (1, 1, 1, regular_terms(1)), // Sub-unit coupon cannot round up.
        (1_000_000_000, 1000, 2, regular_terms(canonical - 1)),
        (1_000_000_000, 1000, 2, regular_terms(canonical + 1)),
        (u64::MAX, 10_000, 1, regular_terms(u64::MAX)), // Total obligation overflows u64.
    ];
    // A matching first item cannot mask a mismatching later item.
    for wrong_index in 0..8 {
        let mut coupons: Vec<_> = (0..8).map(|i| CouponTerms {
            record_ts: 120 + i * 30, payment_ts: 130 + i * 30, unit_amount: canonical,
        }).collect();
        coupons[wrong_index].unit_amount += 1;
        cases.push((1_000_000_000, 1000, 2, coupons));
    }
    for (face, rate, frequency, coupons) in cases {
        let failure = f.run(f.rate_init_ix(face, rate, frequency, coupons), Actor::Issuer).unwrap_err();
        assert!(failure.meta.logs.iter().any(|line| line.contains("Error Code: InvalidTerms.") || line.contains("Error Code: MathOverflow.")));
        assert_initialization_absent(&f);
        assert_eq!(f.svm.get_account(&ad(f.source)).unwrap(), source);
        assert_eq!(f.svm.get_account(&ad(f.settlement)).unwrap(), settlement);
    }
    // Multiplication exceeds u64 while the exact quotient and liabilities fit.
    let face = 9_000_000_000_000_000_000;
    f.run(f.rate_init_ix(face, 1000, 2, regular_terms(450_000_000_000_000_000)), Actor::Issuer).unwrap();
    let terms: FinancialTerms = f.decode(f.financial_terms());
    assert_eq!(terms.unit_amount, 450_000_000_000_000_000);
    println!("PROVEN rate direct-calls invalid_cases=20 all8coupon_positions=true checked_u128=true atomic_rollback=true");
}

#[test]
fn rate_initialization_requires_issuer_signature_canonical_pd_as_and_writable_terms() {
    let mut f = Fixture::uninitialized(1);
    let base = f.rate_init_ix(1_000_000_000, 1000, 2, regular_terms(50_000_000));
    // Use another fee payer so transaction compilation cannot promote issuer to signer.
    let mut unsigned_issuer = base.clone();
    unsigned_issuer.accounts[0].is_signer = false;
    f.svm.expire_blockhash();
    let tx = Transaction::new_signed_with_payer(&[unsigned_issuer], Some(&f.outsider.pubkey()), &[&f.outsider], f.svm.latest_blockhash());
    let failure = f.svm.send_transaction(tx).unwrap_err();
    assert!(failure.meta.logs.iter().any(|line| line.contains("AccountNotSigner")));
    assert_initialization_absent(&f);
    for position in [1, 2, 4, 5] {
        let mut substituted = base.clone();
        substituted.accounts[position].pubkey = ad(pk(&f.outsider));
        assert!(f.run(substituted, Actor::Issuer).is_err(), "PDA substitution {position}");
        assert_initialization_absent(&f);
    }
    let mut other_issuer = base.clone();
    other_issuer.accounts[0].pubkey = ad(pk(&f.outsider));
    assert!(f.run(other_issuer, Actor::Outsider).is_err(), "issuer cannot initialize another issuer's namespace");
    assert_initialization_absent(&f);
    let mut readonly_terms = base;
    readonly_terms.accounts[5].is_writable = false;
    assert!(f.run(readonly_terms, Actor::Issuer).is_err());
    assert_initialization_absent(&f);
    println!("PROVEN rate signer=true canonical_bond_mint_vault_terms=true writable_terms=true");
}

#[test]
fn atomic_rate_terms_are_immutable_and_cannot_attach_to_a_legacy_issue() {
    let mut f = Fixture::uninitialized(2);
    f.run(f.rate_init_ix(1_000_000_000, 1000, 2, regular_terms(50_000_000)), Actor::Issuer).unwrap();
    let original = f.svm.get_account(&ad(f.financial_terms())).unwrap();
    assert_eq!(original.data.len(), 61);
    let terms: FinancialTerms = f.decode(f.financial_terms());
    assert_eq!((terms.version, terms.bond, terms.nominal, terms.rate_bps, terms.frequency, terms.unit_amount), (1, f.bond, 1_000_000_000, 1000, 2, 50_000_000));
    assert_eq!(terms.bump, Pubkey::find_program_address(&[b"financial_terms", f.bond.as_ref()], &bondtrace::ID).1);
    assert!(f.run(f.rate_init_ix(1_000_000_000, 500, 2, regular_terms(25_000_000)), Actor::Issuer).is_err());
    assert_eq!(f.svm.get_account(&ad(f.financial_terms())).unwrap(), original);
    f.register_all();
    f.run(f.issue_ix(0, 10, false), Actor::Issuer).unwrap();
    f.fund(10_500_000_000);
    f.run(f.seal_ix(), Actor::Issuer).unwrap();
    f.now(200); f.run(f.capture_ix(0), Actor::Issuer).unwrap();
    f.run(f.transfer_ix(0, 1, 4), Actor::Holder(0)).unwrap();
    f.now(400); f.run(f.begin_ix(), Actor::Issuer).unwrap();
    f.run(f.redeem_ix(0), Actor::Holder(0)).unwrap();
    f.run(f.redeem_ix(1), Actor::Holder(1)).unwrap();
    f.run(f.settle_ix(0, 0), Actor::Outsider).unwrap();
    assert_eq!(f.decode::<Coupon>(f.coupon(0)).paid_total, 500_000_000);
    assert_eq!(f.decode::<Bond>(f.bond).total_redeemed, 10);
    assert_eq!(f.balance(f.destinations[0]) + f.balance(f.destinations[1]), 10_500_000_000);
    assert_eq!(f.balance(f.vault), 0);
    assert_eq!(f.supply(), 0);
    assert_eq!(f.svm.get_account(&ad(f.financial_terms())).unwrap(), original);
    let mut legacy = Fixture::new(1);
    assert!(legacy.run(legacy.rate_init_ix(1_000_000_000, 1000, 2, regular_terms(50_000_000)), Actor::Issuer).is_err());
    assert!(legacy.svm.get_account(&ad(legacy.financial_terms())).is_none());
    println!("PROVEN rate canonical10x1000x10percent/2_coupon500 principal10000 final_supply0 immutable_terms61 legacy_unattached=true");
}

/// SplitMix64 fixes operation ordering and disposable addresses without a new dependency.
struct SequenceRng(u64);
impl SequenceRng {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9e3779b97f4a7c15);
        let mut value = self.0;
        value = (value ^ (value >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        value = (value ^ (value >> 27)).wrapping_mul(0x94d049bb133111eb);
        value ^ (value >> 31)
    }
    fn index(&mut self, length: usize) -> usize { (self.next() % length as u64) as usize }
    fn order(&mut self, length: usize) -> Vec<usize> {
        let mut order: Vec<_> = (0..length).collect();
        for i in (1..length).rev() { let j = self.index(i + 1); order.swap(i, j); }
        order
    }
}
fn sequence_keypair(seed: u64, role: u64) -> Keypair {
    let mut rng = SequenceRng(seed ^ role.wrapping_mul(0xd6e8feb86659fd93));
    let mut bytes = [0_u8; 32];
    for chunk in bytes.chunks_mut(8) { chunk.copy_from_slice(&rng.next().to_le_bytes()); }
    Keypair::new_from_array(bytes)
}

struct SequenceModel {
    total: u64,
    holdings: Vec<u64>,
    snapshots: Vec<Vec<u64>>,
    paid: Vec<Vec<bool>>,
    principal: Option<Vec<u64>>,
    redeemed: Vec<bool>,
    payouts: Vec<u64>,
    funded: u64,
    terms: Account,
    proposal_units: Option<Vec<u64>>,
    votes: Vec<Option<bool>>,
}

const SEQUENCE_FACE: u64 = 1_000_000_000;
const SEQUENCE_COUPON: u64 = 50_000_000;

fn assert_sequence_invariants(f: &Fixture, model: &SequenceModel, seed: u64, step: &str) {
    let bond: Bond = f.decode(f.bond);
    let holdings: Vec<_> = f.holdings.iter().map(|key| f.balance(*key)).collect();
    assert_eq!(holdings, model.holdings, "seed={seed:#x} step={step} current rights");
    assert_eq!(f.supply(), holdings.iter().sum::<u64>(), "seed={seed:#x} step={step} supply");
    assert_eq!(bond.total_issued, model.total, "seed={seed:#x} step={step} issued");
    let principal_units: u64 = model.principal.as_ref().map_or(0, |rights| rights.iter().enumerate().filter(|(i,_)| model.redeemed[*i]).map(|(_,units)| *units).sum::<u64>());
    assert_eq!(bond.total_redeemed, principal_units, "seed={seed:#x} step={step} burned");
    assert_eq!(f.supply() + principal_units, model.total, "seed={seed:#x} step={step} conservation");
    assert_eq!(f.svm.get_account(&ad(f.financial_terms())).unwrap(), model.terms, "seed={seed:#x} step={step} immutable terms");
    assert_eq!(usize::from(bond.next_coupon_index), model.snapshots.len(), "seed={seed:#x} step={step} capture cursor");
    let mut coupon_paid = 0_u64;
    for (index, rights) in model.snapshots.iter().enumerate() {
        let coupon: Coupon = f.decode(f.coupon(index as u8));
        let expected_mask = model.paid[index].iter().enumerate().filter(|(_,paid)| **paid).fold(0_u16, |mask,(i,_)| mask | (1_u16 << i));
        let expected_paid: u64 = rights.iter().enumerate().filter(|(i,_)| model.paid[index][*i]).map(|(_,units)| *units * SEQUENCE_COUPON).sum::<u64>();
        assert_eq!(coupon.units, *rights, "seed={seed:#x} step={step} snapshot {index}");
        assert_eq!(coupon.total_units, model.total, "seed={seed:#x} step={step} snapshot total");
        assert_eq!(coupon.claimed_mask, expected_mask, "seed={seed:#x} step={step} coupon mask");
        assert_eq!(coupon.paid_total, expected_paid, "seed={seed:#x} step={step} coupon paid");
        assert_eq!(coupon.unit_amount, SEQUENCE_COUPON);
        coupon_paid += expected_paid;
    }
    let principal_mask = model.redeemed.iter().enumerate().filter(|(_,paid)| **paid).fold(0_u16, |mask,(i,_)| mask | (1_u16 << i));
    assert_eq!(bond.principal_claimed_mask, principal_mask, "seed={seed:#x} step={step} principal mask");
    if let Some(rights) = &model.principal { assert_eq!(bond.redemption_units, *rights, "seed={seed:#x} step={step} principal rights"); }
    for (i,key) in f.destinations.iter().enumerate() { assert_eq!(f.balance(*key), model.payouts[i], "seed={seed:#x} step={step} beneficiary {i}"); }
    let paid = coupon_paid + principal_units * SEQUENCE_FACE;
    assert_eq!(paid, model.payouts.iter().sum::<u64>(), "seed={seed:#x} step={step} total paid");
    let liability = model.total * (SEQUENCE_FACE + 2 * SEQUENCE_COUPON);
    let remaining = model.total * 2 * SEQUENCE_COUPON - coupon_paid + (model.total - principal_units) * SEQUENCE_FACE;
    assert_eq!(paid + remaining, liability, "seed={seed:#x} step={step} paid+remaining");
    assert_eq!(f.balance(f.vault) + paid, model.funded, "seed={seed:#x} step={step} funded conservation");
    if let Some(rights) = &model.proposal_units {
        let proposal: Proposal = f.decode(f.proposal());
        assert_eq!(proposal.units, *rights, "seed={seed:#x} step={step} vote snapshot");
        let mask = model.votes.iter().enumerate().filter(|(_,vote)| vote.is_some()).fold(0_u16, |mask,(i,_)| mask | (1_u16 << i));
        let yes: u64 = rights.iter().enumerate().filter(|(i,_)| model.votes[*i] == Some(true)).map(|(_,units)| *units).sum::<u64>();
        let no: u64 = rights.iter().enumerate().filter(|(i,_)| model.votes[*i] == Some(false)).map(|(_,units)| *units).sum::<u64>();
        assert_eq!((proposal.ballot_mask,proposal.yes_units,proposal.no_units), (mask,yes,no), "seed={seed:#x} step={step} votes");
    }
}

fn sequence_account_snapshot(f: &Fixture) -> Vec<(Pubkey, Option<Account>)> {
    let mut keys = vec![f.bond, f.mint, f.vault, f.source, f.financial_terms(), f.coupon(0), f.coupon(1), f.proposal()];
    keys.extend(f.holdings.iter().copied()); keys.extend(f.destinations.iter().copied());
    for holder in &f.holders {
        keys.push(Pubkey::find_program_address(&[b"ballot",f.proposal().as_ref(),pk(holder).as_ref()], &bondtrace::ID).0);
    }
    keys.into_iter().map(|key| (key, f.svm.get_account(&ad(key)))).collect()
}
fn reject_sequence(instructions: Vec<Instruction>, actor: Actor, model: &SequenceModel, seed: u64, step: &str, f: &mut Fixture) {
    let before = sequence_account_snapshot(f);
    assert!(f.run_batch(instructions, actor).is_err(), "seed={seed:#x} step={step} unexpectedly succeeded");
    // Fee-payer SOL lamports are intentionally excluded: failed transactions pay fees.
    for (key,account) in before { assert_eq!(f.svm.get_account(&ad(key)), account, "seed={seed:#x} step={step} rollback {key}"); }
    assert_sequence_invariants(f, model, seed, step);
}
fn execute_sequence(instruction: Instruction, actor: Actor, seed: u64, step: &str, f: &mut Fixture) {
    f.run(instruction, actor).unwrap_or_else(|failure| panic!("seed={seed:#x} step={step} failure={failure:?}"));
}
fn sequence_transfers(f: &mut Fixture, model: &mut SequenceModel, rng: &mut SequenceRng, seed: u64) {
    for _ in 0..8 {
        let source = rng.index(model.holdings.len());
        let destination = (source + 1 + rng.index(model.holdings.len() - 1)) % model.holdings.len();
        if model.holdings[source] == 0 { continue; }
        let amount = 1 + rng.next() % model.holdings[source];
        execute_sequence( f.transfer_ix(source,destination,amount), Actor::Holder(source), seed,"transfer",f);
        model.holdings[source] -= amount; model.holdings[destination] += amount;
        assert_sequence_invariants(f,model,seed,"transfer");
        reject_sequence(vec![f.transfer_ix(source,destination,model.holdings[source]+1)],Actor::Holder(source),model,seed,"overspend",f);
    }
}
fn sequence_coupon_payment(f: &mut Fixture, model: &mut SequenceModel, index: usize, holder: usize, operator: bool, seed: u64) {
    let instruction = if operator { f.settle_ix(holder,index as u8) } else { f.claim_ix_at(holder,index as u8) };
    let actor = if operator { Actor::Outsider } else { Actor::Holder(holder) };
    if model.snapshots[index][holder] == 0 || model.paid[index][holder] {
        reject_sequence(vec![instruction],actor,model,seed,"zero-or-duplicate-coupon",f);
    } else {
        execute_sequence(instruction,actor,seed,"pay-coupon",f);
        model.paid[index][holder] = true;
        model.payouts[holder] += model.snapshots[index][holder] * SEQUENCE_COUPON;
        assert_sequence_invariants(f,model,seed,"pay-coupon");
        reject_sequence(vec![f.settle_ix(holder,index as u8)],Actor::Outsider,model,seed,"repeat-coupon",f);
    }
}

#[test]
fn sixty_four_seeded_stateful_sbf_sequences_preserve_financial_and_snapshot_invariants() {
    const ROOT_SEED: u64 = 0xb07d_7ace_2026_1008;
    let replay = std::env::var("BONDTRACE_SEQUENCE_SEED").ok().map(|text| {
        let text = text.trim();
        if let Some(hex) = text.strip_prefix("0x") { u64::from_str_radix(hex,16).expect("invalid replay seed") } else { text.parse().expect("invalid replay seed") }
    });
    let seeds: Vec<_> = replay.map_or_else(|| (0..64).map(|i| ROOT_SEED.wrapping_add(i)).collect(), |seed| vec![seed]);
    let started = std::time::Instant::now();
    for &seed in &seeds {
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let mut rng = SequenceRng(seed);
            let count = 2 + rng.index(5);
            let mut f = Fixture::uninitialized_with_seed(count,Some(seed));
            let coupons = vec![CouponTerms {record_ts:200,payment_ts:210,unit_amount:SEQUENCE_COUPON},CouponTerms {record_ts:300,payment_ts:310,unit_amount:SEQUENCE_COUPON}];
            execute_sequence(f.rate_init_ix(SEQUENCE_FACE,1000,2,coupons),Actor::Issuer,seed,"rate-init",&mut f);
            f.register_all();
            let mut model = SequenceModel {total:0,holdings:vec![0;count],snapshots:vec![],paid:vec![],principal:None,redeemed:vec![false;count],payouts:vec![0;count],funded:0,terms:f.svm.get_account(&ad(f.financial_terms())).unwrap(),proposal_units:None,votes:vec![None;count]};
            for holder in 0..count {
                let amount = 1 + rng.next() % 8;
                execute_sequence(f.issue_ix(holder,amount,false),Actor::Issuer,seed,"issue",&mut f);
                model.total += amount; model.holdings[holder] += amount;
                assert_sequence_invariants(&f,&model,seed,"issue");
            }
            reject_sequence(vec![f.issue_ix(0,1,true)],Actor::Outsider,&model,seed,"unauthorized-issue",&mut f);
            model.funded = model.total * (SEQUENCE_FACE + 2 * SEQUENCE_COUPON);
            f.fund(model.funded); f.run(f.seal_ix(),Actor::Issuer).unwrap();
            assert_sequence_invariants(&f,&model,seed,"fund-seal");
            execute_sequence(f.proposal_ix(),Actor::Issuer,seed,"proposal",&mut f);
            model.proposal_units = Some(model.holdings.clone());
            sequence_transfers(&mut f,&mut model,&mut rng,seed);
            for holder in rng.order(count) {
                let support = rng.next() & 1 != 0;
                execute_sequence(f.vote_ix(holder,support),Actor::Holder(holder),seed,"vote",&mut f);
                model.votes[holder] = Some(support);
                assert_sequence_invariants(&f,&model,seed,"vote");
                reject_sequence(vec![f.vote_ix(holder,!support)],Actor::Holder(holder),&model,seed,"repeat-vote",&mut f);
            }
            f.now(200);
            reject_sequence(vec![f.transfer_ix(0,1,1)],Actor::Holder(0),&model,seed,"record-lock",&mut f);
            reject_sequence(vec![f.capture_ix(1)],Actor::Issuer,&model,seed,"out-of-order-record",&mut f);
            let mut missing = f.capture_ix(0); missing.accounts.pop();
            reject_sequence(vec![missing],Actor::Issuer,&model,seed,"incomplete-record",&mut f);
            execute_sequence(f.capture_ix(0),Actor::Issuer,seed,"capture0",&mut f);
            model.snapshots.push(model.holdings.clone()); model.paid.push(vec![false;count]);
            assert_sequence_invariants(&f,&model,seed,"capture0");
            let eligible = model.snapshots[0].iter().position(|units| *units > 0).unwrap();
            reject_sequence(vec![f.settle_ix(eligible,0)],Actor::Outsider,&model,seed,"early-payment",&mut f);
            sequence_transfers(&mut f,&mut model,&mut rng,seed);
            f.now(210);
            // A valid first payment followed by its duplicate must roll back the whole bundle.
            reject_sequence(vec![f.settle_ix(eligible,0),f.settle_ix(eligible,0)],Actor::Outsider,&model,seed,"batch-duplicate-rollback",&mut f);
            for holder in rng.order(count).into_iter().take(count/2) { sequence_coupon_payment(&mut f,&mut model,0,holder,rng.next()&1!=0,seed); }
            f.now(300);
            execute_sequence(f.capture_ix(1),Actor::Issuer,seed,"capture1",&mut f);
            model.snapshots.push(model.holdings.clone()); model.paid.push(vec![false;count]);
            assert_sequence_invariants(&f,&model,seed,"capture1");
            sequence_transfers(&mut f,&mut model,&mut rng,seed);
            f.now(400);
            execute_sequence(f.begin_ix(),Actor::Issuer,seed,"begin-principal",&mut f);
            model.principal = Some(model.holdings.clone());
            assert_sequence_invariants(&f,&model,seed,"begin-principal");
            for holder in rng.order(count) {
                let units = model.principal.as_ref().unwrap()[holder];
                if units == 0 { reject_sequence(vec![f.redeem_ix(holder)],Actor::Holder(holder),&model,seed,"zero-principal",&mut f); continue; }
                // Force a real SPL transfer failure after the burn CPI, then check exact rollback.
                let key = ad(f.destinations[holder]);
                let mut account = f.svm.get_account(&key).unwrap();
                let mut token_state = token::spl_token::state::Account::unpack(&account.data).unwrap();
                token_state.state = token::spl_token::state::AccountState::Frozen;
                token::spl_token::state::Account::pack(token_state,&mut account.data).unwrap(); f.svm.set_account(key,account).unwrap();
                reject_sequence(vec![f.redeem_ix(holder)],Actor::Holder(holder),&model,seed,"burn-payment-rollback",&mut f);
                let mut account = f.svm.get_account(&key).unwrap(); token_state.state = token::spl_token::state::AccountState::Initialized;
                token::spl_token::state::Account::pack(token_state,&mut account.data).unwrap(); f.svm.set_account(key,account).unwrap();
                execute_sequence(f.redeem_ix(holder),Actor::Holder(holder),seed,"principal",&mut f);
                model.redeemed[holder] = true; model.holdings[holder] = 0; model.payouts[holder] += units * SEQUENCE_FACE;
                assert_sequence_invariants(&f,&model,seed,"principal");
                reject_sequence(vec![f.redeem_ix(holder)],Actor::Holder(holder),&model,seed,"repeat-principal",&mut f);
            }
            for index in rng.order(2) { for holder in rng.order(count) { sequence_coupon_payment(&mut f,&mut model,index,holder,rng.next()&1!=0,seed); } }
            assert_sequence_invariants(&f,&model,seed,"complete");
            assert_eq!(f.decode::<Bond>(f.bond).state,REDEEMED); assert_eq!(f.balance(f.vault),0);
        }));
        if let Err(payload) = outcome {
            eprintln!("REPRO BONDTRACE_SEQUENCE_SEED={seed:#x} cargo test -p bondtrace --test runtime sixty_four_seeded -- --nocapture");
            std::panic::resume_unwind(payload);
        }
    }
    println!("PROVEN stateful sequences={} root_seed={ROOT_SEED:#x} deterministic_addresses=true exact_rights_supply_paid_remaining_masks_rollback=true elapsed_ms={}",seeds.len(),started.elapsed().as_millis());
}
