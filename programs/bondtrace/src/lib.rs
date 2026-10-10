use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::get_associated_token_address,
    token::{self, Burn, FreezeAccount, MintTo, ThawAccount, TokenAccount, TransferChecked},
};

pub mod contexts;
pub mod state;
pub mod v2_contexts;
pub mod v2_state;
mod v2;
pub use contexts::*;
pub use state::*;
pub use v2_contexts::*;
pub use v2_state::*;

declare_id!("B3aFCQ25iN3gjmvznAaY5RNnnw8J5ihFPsPoGgWXhmb8");

#[program]
pub mod bondtrace {
    use super::*;

    pub fn initialize_issue_v2(ctx: Context<InitializeIssueV2>, series_id: u64, name: String,
        face_value: u64, maturity_ts: i64, coupon_count: u32, rate_bps: u16, frequency: u8) -> Result<()> {
        v2::initialize(ctx, series_id, name, face_value, maturity_ts, coupon_count, rate_bps, frequency)
    }
    pub fn append_schedule_v2(ctx: Context<AppendScheduleV2>, page_index: u32, coupons: Vec<CouponTerms>) -> Result<()> { v2::append_schedule(ctx, page_index, coupons) }
    pub fn create_registry_page_v2(ctx: Context<CreateRegistryPageV2>, page_index: u32) -> Result<()> { v2::create_registry_page(ctx, page_index) }
    pub fn register_holder_v2(ctx: Context<RegisterHolderV2>, index: u32) -> Result<()> { v2::register_holder(ctx, index) }
    pub fn issue_units_v2(ctx: Context<IssueUnitsV2>, amount: u64) -> Result<()> { v2::issue_units(ctx, amount) }
    pub fn fund_vault_v2(ctx: Context<FundVaultV2>, amount: u64) -> Result<()> { v2::fund_vault(ctx, amount) }
    pub fn seal_issue_v2(ctx: Context<SealIssueV2>) -> Result<()> { v2::seal_issue(ctx) }
    pub fn transfer_units_v2(ctx: Context<TransferUnitsV2>, amount: u64) -> Result<()> { v2::transfer_units(ctx, amount) }
    pub fn begin_coupon_v2(ctx: Context<BeginCouponV2>, index: u32) -> Result<()> { v2::begin_coupon(ctx, index) }
    pub fn begin_redemption_v2(ctx: Context<BeginRedemptionV2>) -> Result<()> { v2::begin_redemption(ctx) }
    pub fn create_proposal_v2(ctx: Context<CreateProposalV2>, proposal_id: u32, title: String, closes_at: i64) -> Result<()> { v2::create_proposal(ctx, proposal_id, title, closes_at) }
    pub fn capture_action_page_v2(ctx: Context<CaptureActionPageV2>, page_index: u32) -> Result<()> { v2::capture_page(ctx, page_index) }
    pub fn finalize_action_v2(ctx: Context<FinalizeActionV2>) -> Result<()> { v2::finalize_action(ctx) }
    pub fn claim_coupon_v2(ctx: Context<PayCouponV2>) -> Result<()> { v2::pay_coupon(ctx, true) }
    pub fn settle_coupon_v2(ctx: Context<PayCouponV2>) -> Result<()> { v2::pay_coupon(ctx, false) }
    pub fn redeem_principal_v2(ctx: Context<RedeemPrincipalV2>) -> Result<()> { v2::redeem_principal(ctx) }
    pub fn cast_vote_v2(ctx: Context<CastVoteV2>, support: bool) -> Result<()> { v2::cast_vote(ctx, support) }

    pub fn initialize_issue(
        ctx: Context<InitializeIssue>,
        series_id: u64,
        name: String,
        face_value: u64,
        maturity_ts: i64,
        coupons: Vec<CouponTerms>,
    ) -> Result<()> {
        validate_issue_terms(&name, face_value, maturity_ts, &coupons)?;
        let bond = &mut ctx.accounts.bond;
        bond.issuer = ctx.accounts.issuer.key();
        bond.bond_mint = ctx.accounts.bond_mint.key();
        bond.settlement_mint = ctx.accounts.settlement_mint.key();
        bond.vault = ctx.accounts.vault.key();
        bond.series_id = series_id;
        bond.name = name;
        bond.face_value = face_value;
        bond.maturity_ts = maturity_ts;
        bond.total_issued = 0;
        bond.total_redeemed = 0;
        bond.state = DRAFT;
        bond.bump = ctx.bumps.bond;
        bond.next_coupon_index = 0;
        bond.principal_claimed_mask = 0;
        bond.holder_wallets = Vec::new();
        bond.coupon_terms = coupons;
        bond.redemption_units = Vec::new();
        Ok(())
    }

    pub fn initialize_rate_issue(
        ctx: Context<InitializeRateIssue>,
        series_id: u64,
        name: String,
        face_value: u64,
        maturity_ts: i64,
        coupons: Vec<CouponTerms>,
        rate_bps: u16,
        frequency: u8,
    ) -> Result<()> {
        validate_issue_terms(&name, face_value, maturity_ts, &coupons)?;
        let unit_amount = rate_coupon_amount(face_value, rate_bps, frequency)?;
        require!(
            coupons.iter().all(|terms| terms.unit_amount == unit_amount),
            BondError::InvalidTerms
        );
        let bond = &mut ctx.accounts.bond;
        bond.issuer = ctx.accounts.issuer.key();
        bond.bond_mint = ctx.accounts.bond_mint.key();
        bond.settlement_mint = ctx.accounts.settlement_mint.key();
        bond.vault = ctx.accounts.vault.key();
        bond.series_id = series_id;
        bond.name = name;
        bond.face_value = face_value;
        bond.maturity_ts = maturity_ts;
        bond.total_issued = 0;
        bond.total_redeemed = 0;
        bond.state = DRAFT;
        bond.bump = ctx.bumps.bond;
        bond.next_coupon_index = 0;
        bond.principal_claimed_mask = 0;
        bond.holder_wallets = Vec::new();
        bond.coupon_terms = coupons;
        bond.redemption_units = Vec::new();
        let terms = &mut ctx.accounts.financial_terms;
        terms.version = FINANCIAL_TERMS_VERSION;
        terms.bond = bond.key();
        terms.nominal = face_value;
        terms.rate_bps = rate_bps;
        terms.frequency = frequency;
        terms.unit_amount = unit_amount;
        terms.bump = ctx.bumps.financial_terms;
        Ok(())
    }

    pub fn register_holder(ctx: Context<RegisterHolder>) -> Result<()> {
        let bond = &ctx.accounts.bond;
        require!(bond.state == DRAFT, BondError::InvalidPhase);
        require!(
            Clock::get()?.unix_timestamp < bond.coupon_terms[0].record_ts,
            BondError::RecordDatePassed
        );
        require!(
            bond.holder_wallets.len() < MAX_HOLDERS,
            BondError::RegistryFull
        );
        let wallet = ctx.accounts.wallet.key();
        require!(
            !bond.holder_wallets.contains(&wallet),
            BondError::AlreadyRegistered
        );
        require!(
            ctx.accounts.holder_bonds.amount == 0,
            BondError::InvalidHolderAccount
        );
        validate_token_authorities(&ctx.accounts.holder_bonds)?;
        let series = bond.series_id.to_le_bytes();
        let bump = [bond.bump];
        let seeds: &[&[u8]] = &[b"bond", bond.issuer.as_ref(), &series, &bump];
        freeze(
            &ctx.accounts.holder_bonds.to_account_info(),
            &ctx.accounts.bond_mint.to_account_info(),
            &bond.to_account_info(),
            seeds,
        )?;
        ctx.accounts.bond.holder_wallets.push(wallet);
        Ok(())
    }

    pub fn issue_units(ctx: Context<IssueUnits>, amount: u64) -> Result<()> {
        let bond = &ctx.accounts.bond;
        require!(bond.state == DRAFT && amount > 0, BondError::InvalidPhase);
        require!(
            Clock::get()?.unix_timestamp < bond.coupon_terms[0].record_ts,
            BondError::RecordDatePassed
        );
        validate_holder_account(
            bond,
            &ctx.accounts.holder_bonds,
            ctx.accounts.holder_bonds.key(),
        )?;
        let new_total = bond
            .total_issued
            .checked_add(amount)
            .ok_or(BondError::MathOverflow)?;
        let series = bond.series_id.to_le_bytes();
        let bump = [bond.bump];
        let seeds: &[&[u8]] = &[b"bond", bond.issuer.as_ref(), &series, &bump];
        // A registered wallet can close its frozen zero ATA and recreate it.
        // Only an empty initialized account may bypass thaw; all other holder
        // identity and authority checks above still apply.
        if ctx.accounts.holder_bonds.state == token::spl_token::state::AccountState::Frozen {
            thaw(
                &ctx.accounts.holder_bonds.to_account_info(),
                &ctx.accounts.bond_mint.to_account_info(),
                &bond.to_account_info(),
                seeds,
            )?;
        } else {
            require!(
                ctx.accounts.holder_bonds.state
                    == token::spl_token::state::AccountState::Initialized
                    && ctx.accounts.holder_bonds.amount == 0,
                BondError::InvalidHolderAccount
            );
        }
        token::mint_to(
            CpiContext::new(
                token::ID,
                MintTo {
                    mint: ctx.accounts.bond_mint.to_account_info(),
                    to: ctx.accounts.holder_bonds.to_account_info(),
                    authority: bond.to_account_info(),
                },
            )
            .with_signer(&[seeds]),
            amount,
        )?;
        freeze(
            &ctx.accounts.holder_bonds.to_account_info(),
            &ctx.accounts.bond_mint.to_account_info(),
            &bond.to_account_info(),
            seeds,
        )?;
        ctx.accounts.bond.total_issued = new_total;
        ctx.accounts.bond.required_reserve()?;
        receipt(
            ctx.accounts.bond.key(),
            0,
            ctx.accounts.issuer.key(),
            0,
            amount,
            0,
        )?;
        Ok(())
    }

    pub fn fund_vault(ctx: Context<FundVault>, amount: u64) -> Result<()> {
        require!(amount > 0, BondError::InvalidTerms);
        require_keys_neq!(
            ctx.accounts.source.key(),
            ctx.accounts.vault.key(),
            BondError::SameAccount
        );
        token::transfer_checked(
            CpiContext::new(
                token::ID,
                TransferChecked {
                    from: ctx.accounts.source.to_account_info(),
                    mint: ctx.accounts.settlement_mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.funder.to_account_info(),
                },
            ),
            amount,
            6,
        )
    }

    pub fn seal_issue(ctx: Context<SealIssue>) -> Result<()> {
        let bond = &mut ctx.accounts.bond;
        require!(bond.state == DRAFT, BondError::InvalidPhase);
        require!(
            bond.total_issued > 0 && !bond.holder_wallets.is_empty(),
            BondError::InvalidTerms
        );
        require!(
            Clock::get()?.unix_timestamp < bond.coupon_terms[0].record_ts,
            BondError::RecordDatePassed
        );
        require!(
            ctx.accounts.bond_mint.supply == bond.total_issued,
            BondError::SupplyMismatch
        );
        require!(
            ctx.accounts.vault.state == token::spl_token::state::AccountState::Initialized,
            BondError::InvalidTerms
        );
        require!(
            ctx.accounts.vault.amount >= bond.required_reserve()?,
            BondError::InsufficientReserve
        );
        bond.state = ACTIVE;
        Ok(())
    }

    pub fn transfer_units(ctx: Context<TransferUnits>, amount: u64) -> Result<()> {
        let bond = &ctx.accounts.bond;
        bond.require_transfer_window(Clock::get()?.unix_timestamp)?;
        require!(amount > 0, BondError::InvalidTerms);
        require_keys_neq!(
            ctx.accounts.source.key(),
            ctx.accounts.destination.key(),
            BondError::SameAccount
        );
        validate_holder_account(bond, &ctx.accounts.source, ctx.accounts.source.key())?;
        validate_holder_account(
            bond,
            &ctx.accounts.destination,
            ctx.accounts.destination.key(),
        )?;
        let series = bond.series_id.to_le_bytes();
        let bump = [bond.bump];
        let seeds: &[&[u8]] = &[b"bond", bond.issuer.as_ref(), &series, &bump];
        thaw(
            &ctx.accounts.source.to_account_info(),
            &ctx.accounts.bond_mint.to_account_info(),
            &bond.to_account_info(),
            seeds,
        )?;
        // A zero account can be closed and idempotently recreated by its wallet.
        // A recreated, empty canonical ATA is safe to receive its first units.
        if ctx.accounts.destination.state == token::spl_token::state::AccountState::Frozen {
            thaw(
                &ctx.accounts.destination.to_account_info(),
                &ctx.accounts.bond_mint.to_account_info(),
                &bond.to_account_info(),
                seeds,
            )?;
        } else {
            require!(
                ctx.accounts.destination.amount == 0,
                BondError::InvalidHolderAccount
            );
        }
        token::transfer_checked(
            CpiContext::new(
                token::ID,
                TransferChecked {
                    from: ctx.accounts.source.to_account_info(),
                    mint: ctx.accounts.bond_mint.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: ctx.accounts.holder.to_account_info(),
                },
            ),
            amount,
            0,
        )?;
        freeze(
            &ctx.accounts.source.to_account_info(),
            &ctx.accounts.bond_mint.to_account_info(),
            &bond.to_account_info(),
            seeds,
        )?;
        freeze(
            &ctx.accounts.destination.to_account_info(),
            &ctx.accounts.bond_mint.to_account_info(),
            &bond.to_account_info(),
            seeds,
        )?;
        receipt(bond.key(), 1, ctx.accounts.holder.key(), 0, amount, 0)
    }

    pub fn capture_coupon(ctx: Context<CaptureCoupon>, index: u8) -> Result<()> {
        let bond = &ctx.accounts.bond;
        require!(bond.state == ACTIVE, BondError::InvalidPhase);
        require!(
            index == bond.next_coupon_index,
            BondError::InvalidCouponIndex
        );
        let terms = bond
            .coupon_terms
            .get(usize::from(index))
            .ok_or(BondError::InvalidCouponIndex)?
            .clone();
        let now = Clock::get()?.unix_timestamp;
        require!(now >= terms.record_ts, BondError::TooEarly);
        let units = snapshot(bond, ctx.accounts.bond_mint.supply, ctx.remaining_accounts)?;
        let coupon = &mut ctx.accounts.coupon;
        coupon.bond = bond.key();
        coupon.index = index;
        coupon.record_ts = terms.record_ts;
        coupon.payment_ts = terms.payment_ts;
        coupon.unit_amount = terms.unit_amount;
        coupon.captured_at = now;
        coupon.total_units = bond.total_issued;
        coupon.claimed_mask = 0;
        coupon.paid_total = 0;
        coupon.units = units;
        coupon.bump = ctx.bumps.coupon;
        ctx.accounts.bond.next_coupon_index =
            index.checked_add(1).ok_or(BondError::MathOverflow)?;
        receipt(
            ctx.accounts.bond.key(),
            2,
            ctx.accounts.payer.key(),
            u64::from(index),
            ctx.accounts.bond.total_issued,
            payment_amount(terms.unit_amount, ctx.accounts.bond.total_issued)?,
        )
    }

    pub fn claim_coupon(ctx: Context<ClaimCoupon>, index: u8) -> Result<()> {
        let bond = &ctx.accounts.bond;
        let (units, amount) = pay_coupon(
            bond,
            &mut ctx.accounts.coupon,
            ctx.accounts.holder.key(),
            &ctx.accounts.vault,
            &ctx.accounts.settlement_mint.to_account_info(),
            &ctx.accounts.destination.to_account_info(),
        )?;
        receipt(
            bond.key(),
            3,
            ctx.accounts.holder.key(),
            u64::from(index),
            units,
            amount,
        )
    }

    /// Anyone may deliver an already-fixed coupon to its beneficiary. The
    /// beneficiary never delegates custody and the same mask protects both paths.
    pub fn settle_coupon(ctx: Context<SettleCoupon>, index: u8) -> Result<()> {
        let (units, amount) = pay_coupon(
            &ctx.accounts.bond,
            &mut ctx.accounts.coupon,
            ctx.accounts.holder.key(),
            &ctx.accounts.vault,
            &ctx.accounts.settlement_mint.to_account_info(),
            &ctx.accounts.destination.to_account_info(),
        )?;
        emit!(CouponSettlementReceipt {
            bond: ctx.accounts.bond.key(),
            coupon: ctx.accounts.coupon.key(),
            index,
            executor: ctx.accounts.executor.key(),
            beneficiary: ctx.accounts.holder.key(),
            destination: ctx.accounts.destination.key(),
            units,
            amount,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    pub fn begin_redemption(ctx: Context<BeginRedemption>) -> Result<()> {
        let bond = &ctx.accounts.bond;
        require!(bond.state == ACTIVE, BondError::InvalidPhase);
        require!(
            Clock::get()?.unix_timestamp >= bond.maturity_ts,
            BondError::TooEarly
        );
        require!(
            usize::from(bond.next_coupon_index) == bond.coupon_terms.len(),
            BondError::PendingCoupon
        );
        let units = snapshot(bond, ctx.accounts.bond_mint.supply, ctx.remaining_accounts)?;
        ctx.accounts.bond.redemption_units = units;
        ctx.accounts.bond.state = REDEEMING;
        receipt(
            ctx.accounts.bond.key(),
            4,
            ctx.accounts.executor.key(),
            0,
            ctx.accounts.bond.total_issued,
            payment_amount(ctx.accounts.bond.face_value, ctx.accounts.bond.total_issued)?,
        )
    }

    pub fn redeem_principal(ctx: Context<RedeemPrincipal>) -> Result<()> {
        let bond = &ctx.accounts.bond;
        require!(bond.state == REDEEMING, BondError::InvalidPhase);
        let index = bond.holder_index(ctx.accounts.holder.key())?;
        let bit = holder_bit(index)?;
        require!(
            bond.principal_claimed_mask & bit == 0,
            BondError::AlreadyClaimed
        );
        let units = *bond
            .redemption_units
            .get(index)
            .ok_or(BondError::IncompleteSnapshot)?;
        require!(units > 0, BondError::NoEntitlement);
        require!(
            ctx.accounts.holder_bonds.amount == units,
            BondError::SupplyMismatch
        );
        let amount = payment_amount(bond.face_value, units)?;
        require!(
            ctx.accounts.vault.amount >= amount,
            BondError::InsufficientReserve
        );
        let series = bond.series_id.to_le_bytes();
        let bump = [bond.bump];
        let seeds: &[&[u8]] = &[b"bond", bond.issuer.as_ref(), &series, &bump];
        thaw(
            &ctx.accounts.holder_bonds.to_account_info(),
            &ctx.accounts.bond_mint.to_account_info(),
            &bond.to_account_info(),
            seeds,
        )?;
        token::burn(
            CpiContext::new(
                token::ID,
                Burn {
                    mint: ctx.accounts.bond_mint.to_account_info(),
                    from: ctx.accounts.holder_bonds.to_account_info(),
                    authority: ctx.accounts.holder.to_account_info(),
                },
            ),
            units,
        )?;
        freeze(
            &ctx.accounts.holder_bonds.to_account_info(),
            &ctx.accounts.bond_mint.to_account_info(),
            &bond.to_account_info(),
            seeds,
        )?;
        payout(
            bond,
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.settlement_mint.to_account_info(),
            &ctx.accounts.destination.to_account_info(),
            amount,
        )?;
        ctx.accounts.bond.principal_claimed_mask |= bit;
        ctx.accounts.bond.total_redeemed = ctx
            .accounts
            .bond
            .total_redeemed
            .checked_add(units)
            .ok_or(BondError::MathOverflow)?;
        if ctx.accounts.bond.total_redeemed == ctx.accounts.bond.total_issued {
            ctx.accounts.bond.state = REDEEMED;
        }
        receipt(
            ctx.accounts.bond.key(),
            5,
            ctx.accounts.holder.key(),
            0,
            units,
            amount,
        )
    }

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        proposal_id: u64,
        title: String,
        closes_at: i64,
    ) -> Result<()> {
        let bond = &ctx.accounts.bond;
        let now = Clock::get()?.unix_timestamp;
        require!(bond.state == ACTIVE, BondError::InvalidPhase);
        require!(now < bond.maturity_ts, BondError::Matured);
        require!(
            !title.trim().is_empty()
                && title.len() <= 96
                && closes_at > now
                && closes_at <= bond.maturity_ts,
            BondError::InvalidTerms
        );
        let units = snapshot(bond, ctx.accounts.bond_mint.supply, ctx.remaining_accounts)?;
        let proposal = &mut ctx.accounts.proposal;
        proposal.bond = bond.key();
        proposal.proposal_id = proposal_id;
        proposal.title = title;
        proposal.opened_at = now;
        proposal.closes_at = closes_at;
        proposal.total_units = bond.total_issued;
        proposal.yes_units = 0;
        proposal.no_units = 0;
        proposal.ballot_mask = 0;
        proposal.units = units;
        proposal.bump = ctx.bumps.proposal;
        receipt(
            bond.key(),
            6,
            ctx.accounts.issuer.key(),
            proposal_id,
            bond.total_issued,
            0,
        )
    }

    pub fn cast_vote(ctx: Context<CastVote>, support: bool) -> Result<()> {
        let proposal = &ctx.accounts.proposal;
        require!(
            Clock::get()?.unix_timestamp < proposal.closes_at,
            BondError::VotingClosed
        );
        let index = ctx.accounts.bond.holder_index(ctx.accounts.voter.key())?;
        let bit = holder_bit(index)?;
        require!(proposal.ballot_mask & bit == 0, BondError::AlreadyVoted);
        let weight = *proposal
            .units
            .get(index)
            .ok_or(BondError::IncompleteSnapshot)?;
        require!(weight > 0, BondError::NoEntitlement);
        let ballot = &mut ctx.accounts.ballot;
        ballot.proposal = proposal.key();
        ballot.voter = ctx.accounts.voter.key();
        ballot.weight = weight;
        ballot.support = support;
        ballot.bump = ctx.bumps.ballot;
        if support {
            ctx.accounts.proposal.yes_units = ctx
                .accounts
                .proposal
                .yes_units
                .checked_add(weight)
                .ok_or(BondError::MathOverflow)?;
        } else {
            ctx.accounts.proposal.no_units = ctx
                .accounts
                .proposal
                .no_units
                .checked_add(weight)
                .ok_or(BondError::MathOverflow)?;
        }
        ctx.accounts.proposal.ballot_mask |= bit;
        receipt(
            ctx.accounts.bond.key(),
            7,
            ctx.accounts.voter.key(),
            ctx.accounts.proposal.proposal_id,
            weight,
            u64::from(support),
        )
    }
}

fn validate_issue_terms(name: &str, face_value: u64, maturity_ts: i64, coupons: &[CouponTerms]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        !name.trim().is_empty() && name.len() <= 64 && face_value > 0,
        BondError::InvalidTerms
    );
    require!(
        !coupons.is_empty() && coupons.len() <= MAX_COUPONS && maturity_ts > now,
        BondError::InvalidTerms
    );
    let mut prior_record = now;
    let mut prior_payment = now;
    let mut unit_total = face_value;
    for terms in coupons {
        require!(
            terms.record_ts > prior_record
                && terms.payment_ts >= terms.record_ts
                && terms.payment_ts >= prior_payment
                && terms.payment_ts <= maturity_ts
                && terms.unit_amount > 0,
            BondError::InvalidTerms
        );
        prior_record = terms.record_ts;
        prior_payment = terms.payment_ts;
        unit_total = unit_total.checked_add(terms.unit_amount).ok_or(BondError::MathOverflow)?;
    }
    Ok(())
}

fn validate_token_authorities(account: &TokenAccount) -> Result<()> {
    require!(
        account.delegate.is_none() && account.close_authority.is_none(),
        BondError::UnsafeTokenAuthority
    );
    Ok(())
}

fn validate_holder_account(bond: &Bond, account: &TokenAccount, key: Pubkey) -> Result<()> {
    bond.holder_index(account.owner)?;
    require_keys_eq!(
        account.mint,
        bond.bond_mint,
        BondError::InvalidHolderAccount
    );
    require_keys_eq!(
        key,
        get_associated_token_address(&account.owner, &bond.bond_mint),
        BondError::InvalidHolderAccount
    );
    validate_token_authorities(account)
}

/// Frozen, non-empty SPL accounts cannot be externally transferred or burned.
/// Empty closed canonical ATAs are safely interpreted as zero, preventing a
/// holder from breaking every corporate action by closing their zero account.
fn snapshot(bond: &Bond, mint_supply: u64, accounts: &[AccountInfo]) -> Result<Vec<u64>> {
    require!(
        accounts.len() == bond.holder_wallets.len(),
        BondError::IncompleteSnapshot
    );
    require!(mint_supply == bond.total_issued, BondError::SupplyMismatch);
    let mut total = 0_u64;
    let mut units = Vec::with_capacity(accounts.len());
    for (wallet, info) in bond.holder_wallets.iter().zip(accounts) {
        require_keys_eq!(
            info.key(),
            get_associated_token_address(wallet, &bond.bond_mint),
            BondError::InvalidHolderAccount
        );
        let amount = if info.owner == &anchor_lang::system_program::ID && info.data_is_empty() {
            0
        } else {
            require_keys_eq!(*info.owner, token::ID, BondError::InvalidHolderAccount);
            let account = TokenAccount::try_deserialize(&mut &info.try_borrow_data()?[..])?;
            require_keys_eq!(
                account.mint,
                bond.bond_mint,
                BondError::InvalidHolderAccount
            );
            if account.amount > 0 {
                require_keys_eq!(account.owner, *wallet, BondError::InvalidHolderAccount);
                validate_token_authorities(&account)?;
                require!(
                    account.state == token::spl_token::state::AccountState::Frozen,
                    BondError::InvalidHolderAccount
                );
            }
            account.amount
        };
        total = total.checked_add(amount).ok_or(BondError::MathOverflow)?;
        units.push(amount);
    }
    require!(total == bond.total_issued, BondError::SupplyMismatch);
    Ok(units)
}

fn thaw<'info>(
    account: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    seeds: &[&[u8]],
) -> Result<()> {
    token::thaw_account(
        CpiContext::new(
            token::ID,
            ThawAccount {
                account: account.clone(),
                mint: mint.clone(),
                authority: authority.clone(),
            },
        )
        .with_signer(&[seeds]),
    )
}

fn freeze<'info>(
    account: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    seeds: &[&[u8]],
) -> Result<()> {
    token::freeze_account(
        CpiContext::new(
            token::ID,
            FreezeAccount {
                account: account.clone(),
                mint: mint.clone(),
                authority: authority.clone(),
            },
        )
        .with_signer(&[seeds]),
    )
}

fn pay_coupon<'info>(
    bond: &Account<'info, Bond>,
    coupon: &mut Account<'info, Coupon>,
    holder: Pubkey,
    vault: &Account<'info, TokenAccount>,
    mint: &AccountInfo<'info>,
    destination: &AccountInfo<'info>,
) -> Result<(u64, u64)> {
    require!(Clock::get()?.unix_timestamp >= coupon.payment_ts, BondError::TooEarly);
    let position = bond.holder_index(holder)?;
    let bit = holder_bit(position)?;
    require!(coupon.claimed_mask & bit == 0, BondError::AlreadyClaimed);
    let units = *coupon.units.get(position).ok_or(BondError::IncompleteSnapshot)?;
    require!(units > 0, BondError::NoEntitlement);
    let amount = payment_amount(coupon.unit_amount, units)?;
    require!(vault.amount >= amount, BondError::InsufficientReserve);
    payout(bond, &vault.to_account_info(), mint, destination, amount)?;
    coupon.claimed_mask |= bit;
    coupon.paid_total = coupon.paid_total.checked_add(amount).ok_or(BondError::MathOverflow)?;
    Ok((units, amount))
}

fn payout<'info>(
    bond: &Account<'info, Bond>,
    vault: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    destination: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    require_keys_neq!(vault.key(), destination.key(), BondError::SameAccount);
    let series = bond.series_id.to_le_bytes();
    let bump = [bond.bump];
    let seeds: &[&[u8]] = &[b"bond", bond.issuer.as_ref(), &series, &bump];
    token::transfer_checked(
        CpiContext::new(
            token::ID,
            TransferChecked {
                from: vault.clone(),
                mint: mint.clone(),
                to: destination.clone(),
                authority: bond.to_account_info(),
            },
        )
        .with_signer(&[seeds]),
        amount,
        6,
    )
}

fn receipt(
    bond: Pubkey,
    kind: u8,
    actor: Pubkey,
    action_id: u64,
    units: u64,
    amount: u64,
) -> Result<()> {
    emit!(ActionReceipt {
        bond,
        kind,
        actor,
        action_id,
        units,
        amount,
        timestamp: Clock::get()?.unix_timestamp
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_integer_payment_and_overflow() {
        assert_eq!(payment_amount(50_000_000, 10).unwrap(), 500_000_000);
        assert!(payment_amount(u64::MAX, 2).is_err());
        assert_eq!(holder_bit(15).unwrap(), 32768);
        assert!(holder_bit(16).is_err());
    }
    #[test]
    fn account_allocation_matches_frozen_interface() {
        assert_eq!(Bond::INIT_SPACE + 8, 1093);
        assert_eq!(Coupon::INIT_SPACE + 8, 224);
        assert_eq!(Proposal::INIT_SPACE + 8, 323);
        assert_eq!(Ballot::INIT_SPACE + 8, 82);
        assert_eq!(FinancialTerms::INIT_SPACE + 8, 61);
    }
}
