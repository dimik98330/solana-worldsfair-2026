//! Paged, on-chain capture. No caller supplies a trusted root or entitlements.
use crate::{state::*, v2_contexts::*, v2_state::*};
use anchor_lang::prelude::*;
use anchor_spl::{associated_token::get_associated_token_address,
    token::{self, Burn, MintTo, TokenAccount, TransferChecked}};

pub fn initialize(ctx: Context<InitializeIssueV2>, series_id: u64, name: String,
    face_value: u64, maturity_ts: i64, coupon_count: u32, rate_bps: u16, frequency: u8) -> Result<()> {
    require!(!name.trim().is_empty() && name.len() <= 64 && face_value > 0
        && coupon_count > 0 && maturity_ts > Clock::get()?.unix_timestamp, BondError::InvalidTerms);
    require!((rate_bps == 0 && frequency == 0) || (rate_bps > 0 && frequency > 0), BondError::InvalidTerms);
    if rate_bps > 0 { rate_coupon_amount(face_value, rate_bps, frequency)?; }
    let b = &mut ctx.accounts.bond;
    b.version = 2; b.issuer = ctx.accounts.issuer.key(); b.bond_mint = ctx.accounts.bond_mint.key();
    b.settlement_mint = ctx.accounts.settlement_mint.key(); b.vault = ctx.accounts.vault.key();
    b.series_id = series_id; b.name = name; b.face_value = face_value; b.rate_bps = rate_bps;
    b.frequency = frequency; b.maturity_ts = maturity_ts; b.state = DRAFT; b.bump = ctx.bumps.bond;
    b.coupon_count = coupon_count;
    // All counters and capture locks are zero in the newly initialized account.
    Ok(())
}

pub fn append_schedule(ctx: Context<AppendScheduleV2>, page_index: u32, coupons: Vec<CouponTerms>) -> Result<()> {
    let b = &mut ctx.accounts.bond;
    require!(b.state == DRAFT, BondError::InvalidPhase);
    require!(b.schedule_appended < b.coupon_count
        && page_index == b.schedule_appended / V2_PAGE_CAP as u32, BondError::InvalidPage);
    let count = (b.coupon_count - b.schedule_appended).min(V2_PAGE_CAP as u32) as usize;
    require!(coupons.len() == count, BondError::InvalidTerms);
    let now = Clock::get()?.unix_timestamp;
    let rate_amount = if b.rate_bps > 0 { Some(rate_coupon_amount(b.face_value, b.rate_bps, b.frequency)?) } else { None };
    for terms in &coupons {
        require!(terms.record_ts > now && terms.record_ts > b.last_record_ts
            && terms.payment_ts >= terms.record_ts && terms.payment_ts > b.last_payment_ts
            && terms.payment_ts <= b.maturity_ts && terms.unit_amount > 0, BondError::InvalidTerms);
        if let Some(amount) = rate_amount { require!(terms.unit_amount == amount, BondError::InvalidTerms); }
        if b.schedule_appended == 0 { b.first_record_ts = terms.record_ts; b.next_record_ts = terms.record_ts; }
        b.last_record_ts = terms.record_ts; b.last_payment_ts = terms.payment_ts;
        b.coupon_unit_total = b.coupon_unit_total.checked_add(terms.unit_amount).ok_or(BondError::MathOverflow)?;
        b.schedule_appended = b.schedule_appended.checked_add(1).ok_or(BondError::MathOverflow)?;
    }
    let page = &mut ctx.accounts.schedule_page;
    page.bond = b.key(); page.index = page_index; page.terms = coupons; page.bump = ctx.bumps.schedule_page;
    b.required_reserve()?;
    b.touch()
}

pub fn create_registry_page(ctx: Context<CreateRegistryPageV2>, page_index: u32) -> Result<()> {
    let b = &mut ctx.accounts.bond;
    b.require_registry_window(Clock::get()?.unix_timestamp)?;
    require!(page_index == b.holder_count / V2_PAGE_CAP as u32, BondError::InvalidPage);
    let page = &mut ctx.accounts.registry_page;
    page.bond = b.key(); page.index = page_index; page.bump = ctx.bumps.registry_page; page.wallets = Vec::new();
    b.touch()
}

pub fn register_holder(ctx: Context<RegisterHolderV2>, index: u32) -> Result<()> {
    let b = &ctx.accounts.bond;
    b.require_registry_window(Clock::get()?.unix_timestamp)?;
    require!(index == b.holder_count, BondError::InvalidHolderIndex);
    require!(ctx.accounts.registry_page.index == index / V2_PAGE_CAP as u32
        && ctx.accounts.registry_page.wallets.len() == (index % V2_PAGE_CAP as u32) as usize,
        BondError::InvalidPage);
    require!(ctx.accounts.holder_bonds.amount == 0, BondError::InvalidHolderAccount);
    crate::validate_token_authorities(&ctx.accounts.holder_bonds)?;
    require!(ctx.accounts.holder_bonds.state == token::spl_token::state::AccountState::Initialized,
        BondError::InvalidHolderAccount);
    let series = b.series_id.to_le_bytes(); let bump = [b.bump];
    let seeds: &[&[u8]] = &[b"bond_v2", b.issuer.as_ref(), &series, &bump];
    crate::freeze(&ctx.accounts.holder_bonds.to_account_info(), &ctx.accounts.bond_mint.to_account_info(),
        &b.to_account_info(), seeds)?;
    let h = &mut ctx.accounts.holder_record;
    h.bond = b.key(); h.wallet = ctx.accounts.wallet.key(); h.index = index; h.bump = ctx.bumps.holder_record;
    ctx.accounts.registry_page.wallets.push(h.wallet);
    ctx.accounts.bond.holder_count = index.checked_add(1).ok_or(BondError::MathOverflow)?;
    ctx.accounts.bond.touch()
}

pub fn issue_units(ctx: Context<IssueUnitsV2>, amount: u64) -> Result<()> {
    let b = &ctx.accounts.bond;
    require!(b.state == DRAFT && amount > 0, BondError::InvalidPhase);
    b.require_registry_window(Clock::get()?.unix_timestamp)?;
    require!(ctx.accounts.holder_record.index < b.holder_count, BondError::InvalidHolderIndex);
    crate::validate_token_authorities(&ctx.accounts.holder_bonds)?;
    let series = b.series_id.to_le_bytes(); let bump = [b.bump];
    let seeds: &[&[u8]] = &[b"bond_v2", b.issuer.as_ref(), &series, &bump];
    thaw_or_empty(&ctx.accounts.holder_bonds, &ctx.accounts.bond_mint.to_account_info(), &b.to_account_info(), seeds)?;
    token::mint_to(CpiContext::new(token::ID, MintTo { mint: ctx.accounts.bond_mint.to_account_info(),
        to: ctx.accounts.holder_bonds.to_account_info(), authority: b.to_account_info() }).with_signer(&[seeds]), amount)?;
    crate::freeze(&ctx.accounts.holder_bonds.to_account_info(), &ctx.accounts.bond_mint.to_account_info(), &b.to_account_info(), seeds)?;
    ctx.accounts.bond.total_issued = b.total_issued.checked_add(amount).ok_or(BondError::MathOverflow)?;
    ctx.accounts.bond.required_reserve()?;
    ctx.accounts.bond.touch()
}

pub fn fund_vault(ctx: Context<FundVaultV2>, amount: u64) -> Result<()> {
    require!(amount > 0, BondError::InvalidTerms);
    require_keys_neq!(ctx.accounts.source.key(), ctx.accounts.vault.key(), BondError::SameAccount);
    token::transfer_checked(CpiContext::new(token::ID, TransferChecked {
        from: ctx.accounts.source.to_account_info(), mint: ctx.accounts.settlement_mint.to_account_info(),
        to: ctx.accounts.vault.to_account_info(), authority: ctx.accounts.funder.to_account_info() }), amount, 6)?;
    ctx.accounts.bond.touch()
}

pub fn seal_issue(ctx: Context<SealIssueV2>) -> Result<()> {
    let b = &mut ctx.accounts.bond;
    require!(b.state == DRAFT, BondError::InvalidPhase);
    b.require_registry_window(Clock::get()?.unix_timestamp)?;
    require!(b.total_issued > 0 && b.holder_count > 0, BondError::InvalidTerms);
    require!(ctx.accounts.bond_mint.supply == b.total_issued, BondError::SupplyMismatch);
    require!(ctx.accounts.vault.state == token::spl_token::state::AccountState::Initialized, BondError::InvalidTerms);
    crate::validate_token_authorities(&ctx.accounts.vault)?;
    require!(ctx.accounts.vault.amount >= b.required_reserve()?, BondError::InsufficientReserve);
    b.state = ACTIVE;
    b.touch()
}

pub fn transfer_units(ctx: Context<TransferUnitsV2>, amount: u64) -> Result<()> {
    let b = &ctx.accounts.bond;
    b.require_window(Clock::get()?.unix_timestamp)?;
    require!(amount > 0, BondError::InvalidTerms);
    require_keys_neq!(ctx.accounts.source.key(), ctx.accounts.destination.key(), BondError::SameAccount);
    crate::validate_token_authorities(&ctx.accounts.source)?;
    crate::validate_token_authorities(&ctx.accounts.destination)?;
    require!(ctx.accounts.source.state == token::spl_token::state::AccountState::Frozen, BondError::InvalidHolderAccount);
    let series = b.series_id.to_le_bytes(); let bump = [b.bump];
    let seeds: &[&[u8]] = &[b"bond_v2", b.issuer.as_ref(), &series, &bump];
    crate::thaw(&ctx.accounts.source.to_account_info(), &ctx.accounts.bond_mint.to_account_info(), &b.to_account_info(), seeds)?;
    thaw_or_empty(&ctx.accounts.destination, &ctx.accounts.bond_mint.to_account_info(), &b.to_account_info(), seeds)?;
    token::transfer_checked(CpiContext::new(token::ID, TransferChecked {
        from: ctx.accounts.source.to_account_info(), mint: ctx.accounts.bond_mint.to_account_info(),
        to: ctx.accounts.destination.to_account_info(), authority: ctx.accounts.holder.to_account_info() }), amount, 0)?;
    for account in [&ctx.accounts.source, &ctx.accounts.destination] {
        crate::freeze(&account.to_account_info(), &ctx.accounts.bond_mint.to_account_info(), &b.to_account_info(), seeds)?;
    }
    ctx.accounts.bond.touch()
}

fn start_action(b: &mut Account<BondV2>, a: &mut Account<ActionV2>, bump: u8, kind: u8, id: u32,
    record_ts: i64, payment_ts: i64, unit_amount: u64, closes_at: i64, title: String) -> Result<()> {
    require!(b.state == ACTIVE, BondError::InvalidPhase);
    require!(b.active_kind == 0, BondError::SnapshotLocked);
    a.bond = b.key(); a.kind = kind; a.id = id; a.record_ts = record_ts; a.payment_ts = payment_ts;
    a.unit_amount = unit_amount; a.opened_at = Clock::get()?.unix_timestamp; a.closes_at = closes_at;
    a.holder_count = b.holder_count; a.bump = bump; a.title = title;
    b.active_kind = kind; b.active_id = id;
    b.touch()
}

pub fn begin_coupon(ctx: Context<BeginCouponV2>, index: u32) -> Result<()> {
    let b = &ctx.accounts.bond;
    require!(index == b.next_coupon_index && index < b.coupon_count, BondError::InvalidCouponIndex);
    let terms = ctx.accounts.schedule_page.terms.get((index % V2_PAGE_CAP as u32) as usize)
        .ok_or(BondError::InvalidCouponIndex)?.clone();
    require!(Clock::get()?.unix_timestamp >= terms.record_ts, BondError::TooEarly);
    require!(ctx.accounts.bond_mint.supply == b.total_issued, BondError::SupplyMismatch);
    start_action(&mut ctx.accounts.bond, &mut ctx.accounts.action, ctx.bumps.action,
        V2_COUPON, index, terms.record_ts, terms.payment_ts, terms.unit_amount, 0, String::new())
}

pub fn begin_redemption(ctx: Context<BeginRedemptionV2>) -> Result<()> {
    let b = &ctx.accounts.bond;
    require!(Clock::get()?.unix_timestamp >= b.maturity_ts, BondError::TooEarly);
    require!(b.next_coupon_index == b.coupon_count, BondError::PendingCoupon);
    require!(ctx.accounts.bond_mint.supply == b.total_issued, BondError::SupplyMismatch);
    let (maturity, face) = (b.maturity_ts, b.face_value);
    start_action(&mut ctx.accounts.bond, &mut ctx.accounts.action, ctx.bumps.action,
        V2_PRINCIPAL, 0, maturity, maturity, face, 0, String::new())
}

pub fn create_proposal(ctx: Context<CreateProposalV2>, proposal_id: u32, title: String, closes_at: i64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let b = &ctx.accounts.bond;
    b.require_window(now)?;
    require!(!title.trim().is_empty() && title.len() <= 96 && closes_at > now && closes_at <= b.maturity_ts,
        BondError::InvalidTerms);
    require!(ctx.accounts.bond_mint.supply == b.total_issued, BondError::SupplyMismatch);
    start_action(&mut ctx.accounts.bond, &mut ctx.accounts.action, ctx.bumps.action,
        V2_VOTE, proposal_id, now, 0, 0, closes_at, title)
}

fn require_capture(b: &BondV2, a: &ActionV2) -> Result<()> {
    require!(b.state == ACTIVE, BondError::InvalidPhase);
    require!(!a.finalized && b.active_kind == a.kind && b.active_id == a.id,
        BondError::SnapshotLocked);
    require!((V2_COUPON..=V2_VOTE).contains(&a.kind), BondError::InvalidActionKind);
    Ok(())
}

pub fn capture_page(ctx: Context<CaptureActionPageV2>, page_index: u32) -> Result<()> {
    let b = &ctx.accounts.bond;
    let a = &ctx.accounts.action;
    require_capture(b, a)?;
    require!(page_index == a.captured_pages && page_index < a.page_count(), BondError::InvalidPage);
    require!(ctx.accounts.registry_page.index == page_index, BondError::InvalidPage);
    require!(ctx.accounts.bond_mint.supply == b.total_issued, BondError::SupplyMismatch);
    let start = page_index.checked_mul(V2_PAGE_CAP as u32).ok_or(BondError::MathOverflow)?;
    let count = (a.holder_count - start).min(V2_PAGE_CAP as u32) as usize;
    require!(ctx.remaining_accounts.len() == count && ctx.accounts.registry_page.wallets.len() >= count,
        BondError::IncompleteSnapshot);
    let mut units = Vec::with_capacity(count);
    let mut total = 0_u64;
    for (wallet, info) in ctx.accounts.registry_page.wallets.iter().take(count).zip(ctx.remaining_accounts) {
        require_keys_eq!(info.key(), get_associated_token_address(wallet, &b.bond_mint), BondError::InvalidHolderAccount);
        let amount = if info.owner == &anchor_lang::system_program::ID && info.data_is_empty() { 0 } else {
            require_keys_eq!(*info.owner, token::ID, BondError::InvalidHolderAccount);
            let account = TokenAccount::try_deserialize(&mut &info.try_borrow_data()?[..])?;
            require_keys_eq!(account.mint, b.bond_mint, BondError::InvalidHolderAccount);
            // An empty canonical ATA can safely be closed/recreated by its owner.
            if account.amount > 0 {
                require_keys_eq!(account.owner, *wallet, BondError::InvalidHolderAccount);
                crate::validate_token_authorities(&account)?;
                require!(account.state == token::spl_token::state::AccountState::Frozen, BondError::InvalidHolderAccount);
            }
            account.amount
        };
        total = total.checked_add(amount).ok_or(BondError::MathOverflow)?;
        units.push(amount);
    }
    let s = &mut ctx.accounts.snapshot_page;
    s.action = a.key(); s.index = page_index; s.units = units; s.bump = ctx.bumps.snapshot_page;
    let next_total = a.total_units.checked_add(total).ok_or(BondError::MathOverflow)?;
    let next_page = a.captured_pages.checked_add(1).ok_or(BondError::MathOverflow)?;
    ctx.accounts.action.total_units = next_total;
    ctx.accounts.action.captured_pages = next_page;
    // No deadline check: an abandoned/expired vote must never lock maturity.
    ctx.accounts.bond.touch()
}

pub fn finalize_action(ctx: Context<FinalizeActionV2>) -> Result<()> {
    let b = &mut ctx.accounts.bond;
    let a = &mut ctx.accounts.action;
    require_capture(b, a)?;
    require!(a.captured_pages == a.page_count(), BondError::IncompleteSnapshot);
    require!(a.total_units == b.total_issued && ctx.accounts.bond_mint.supply == b.total_issued,
        BondError::SupplyMismatch);
    if a.kind == V2_COUPON {
        require!(a.id == b.next_coupon_index, BondError::InvalidCouponIndex);
        b.next_coupon_index = b.next_coupon_index.checked_add(1).ok_or(BondError::MathOverflow)?;
        b.next_record_ts = if b.next_coupon_index < b.coupon_count {
            ctx.accounts.next_schedule_page.terms.get((b.next_coupon_index % V2_PAGE_CAP as u32) as usize)
                .ok_or(BondError::InvalidCouponIndex)?.record_ts
        } else { b.maturity_ts };
    } else if a.kind == V2_PRINCIPAL {
        require!(b.next_coupon_index == b.coupon_count, BondError::PendingCoupon);
        b.state = REDEEMING;
    }
    a.finalized = true; b.active_kind = 0; b.active_id = 0;
    b.touch()
}

pub fn pay_coupon(ctx: Context<PayCouponV2>, holder_signed: bool) -> Result<()> {
    let b = &ctx.accounts.bond;
    let a = &ctx.accounts.action;
    require!(a.kind == V2_COUPON, BondError::InvalidActionKind);
    if holder_signed { require_keys_eq!(ctx.accounts.executor.key(), ctx.accounts.beneficiary.key(), BondError::InvalidHolderAccount); }
    require!(Clock::get()?.unix_timestamp >= a.payment_ts, BondError::TooEarly);
    let position = a.holder_position(&ctx.accounts.holder_record, &ctx.accounts.snapshot_page)?;
    let bit = 1_u8 << position;
    require!(ctx.accounts.snapshot_page.claimed_mask & bit == 0, BondError::AlreadyClaimed);
    let units = ctx.accounts.snapshot_page.units[position];
    require!(units > 0, BondError::NoEntitlement);
    let amount = payment_amount(a.unit_amount, units)?;
    require!(ctx.accounts.vault.amount >= amount, BondError::InsufficientReserve);
    validate_destination(&ctx.accounts.destination)?;
    payout(b, &ctx.accounts.vault.to_account_info(), &ctx.accounts.settlement_mint.to_account_info(),
        &ctx.accounts.destination.to_account_info(), amount)?;
    record_payment(&mut ctx.accounts.action, &mut ctx.accounts.snapshot_page, bit, units, amount)?;
    emit!(ActionReceiptV2 { bond: b.key(), action: ctx.accounts.action.key(), kind: V2_COUPON,
        executor: ctx.accounts.executor.key(), beneficiary: ctx.accounts.beneficiary.key(), units, amount,
        timestamp: Clock::get()?.unix_timestamp });
    ctx.accounts.bond.touch()
}

pub fn redeem_principal(ctx: Context<RedeemPrincipalV2>) -> Result<()> {
    let b = &ctx.accounts.bond;
    let a = &ctx.accounts.action;
    require!(b.state == REDEEMING, BondError::InvalidPhase);
    require!(a.kind == V2_PRINCIPAL, BondError::InvalidActionKind);
    let position = a.holder_position(&ctx.accounts.holder_record, &ctx.accounts.snapshot_page)?;
    let bit = 1_u8 << position;
    require!(ctx.accounts.snapshot_page.claimed_mask & bit == 0, BondError::AlreadyClaimed);
    let units = ctx.accounts.snapshot_page.units[position];
    require!(units > 0, BondError::NoEntitlement);
    require!(ctx.accounts.holder_bonds.amount == units, BondError::SupplyMismatch);
    require!(ctx.accounts.bond_mint.supply == b.total_issued.checked_sub(b.total_redeemed).ok_or(BondError::MathOverflow)?, BondError::SupplyMismatch);
    let amount = payment_amount(a.unit_amount, units)?;
    require!(ctx.accounts.vault.amount >= amount, BondError::InsufficientReserve);
    crate::validate_token_authorities(&ctx.accounts.holder_bonds)?;
    validate_destination(&ctx.accounts.destination)?;
    let series = b.series_id.to_le_bytes(); let bump = [b.bump];
    let seeds: &[&[u8]] = &[b"bond_v2", b.issuer.as_ref(), &series, &bump];
    crate::thaw(&ctx.accounts.holder_bonds.to_account_info(), &ctx.accounts.bond_mint.to_account_info(), &b.to_account_info(), seeds)?;
    token::burn(CpiContext::new(token::ID, Burn { mint: ctx.accounts.bond_mint.to_account_info(),
        from: ctx.accounts.holder_bonds.to_account_info(), authority: ctx.accounts.holder.to_account_info() }), units)?;
    crate::freeze(&ctx.accounts.holder_bonds.to_account_info(), &ctx.accounts.bond_mint.to_account_info(), &b.to_account_info(), seeds)?;
    payout(b, &ctx.accounts.vault.to_account_info(), &ctx.accounts.settlement_mint.to_account_info(),
        &ctx.accounts.destination.to_account_info(), amount)?;
    record_payment(&mut ctx.accounts.action, &mut ctx.accounts.snapshot_page, bit, units, amount)?;
    ctx.accounts.bond.total_redeemed = b.total_redeemed.checked_add(units).ok_or(BondError::MathOverflow)?;
    if ctx.accounts.bond.total_redeemed == ctx.accounts.bond.total_issued { ctx.accounts.bond.state = REDEEMED; }
    emit!(ActionReceiptV2 { bond: ctx.accounts.bond.key(), action: ctx.accounts.action.key(), kind: V2_PRINCIPAL,
        executor: ctx.accounts.holder.key(), beneficiary: ctx.accounts.holder.key(), units, amount,
        timestamp: Clock::get()?.unix_timestamp });
    ctx.accounts.bond.touch()
}

pub fn cast_vote(ctx: Context<CastVoteV2>, support: bool) -> Result<()> {
    let a = &ctx.accounts.action;
    require!(a.kind == V2_VOTE, BondError::InvalidActionKind);
    require!(Clock::get()?.unix_timestamp < a.closes_at, BondError::VotingClosed);
    let position = a.holder_position(&ctx.accounts.holder_record, &ctx.accounts.snapshot_page)?;
    let bit = 1_u8 << position;
    require!(ctx.accounts.snapshot_page.voted_mask & bit == 0, BondError::AlreadyVoted);
    let weight = ctx.accounts.snapshot_page.units[position];
    require!(weight > 0, BondError::NoEntitlement);
    ctx.accounts.snapshot_page.voted_mask |= bit;
    let a = &mut ctx.accounts.action;
    if support { a.yes_units = a.yes_units.checked_add(weight).ok_or(BondError::MathOverflow)?; }
    else { a.no_units = a.no_units.checked_add(weight).ok_or(BondError::MathOverflow)?; }
    require!(a.yes_units.checked_add(a.no_units).ok_or(BondError::MathOverflow)? <= a.total_units, BondError::SupplyMismatch);
    let ballot = &mut ctx.accounts.ballot;
    ballot.action = a.key(); ballot.voter = ctx.accounts.voter.key(); ballot.weight = weight;
    ballot.support = support; ballot.bump = ctx.bumps.ballot;
    ctx.accounts.bond.touch()
}

fn record_payment(a: &mut Account<ActionV2>, s: &mut Account<SnapshotPageV2>, bit: u8, units: u64, amount: u64) -> Result<()> {
    s.claimed_mask |= bit;
    s.paid_total = s.paid_total.checked_add(amount).ok_or(BondError::MathOverflow)?;
    a.paid_total = a.paid_total.checked_add(amount).ok_or(BondError::MathOverflow)?;
    a.claimed_units = a.claimed_units.checked_add(units).ok_or(BondError::MathOverflow)?;
    require!(a.claimed_units <= a.total_units && a.paid_total == payment_amount(a.unit_amount, a.claimed_units)?, BondError::SupplyMismatch);
    Ok(())
}

fn thaw_or_empty<'info>(account: &Account<'info, TokenAccount>, mint: &AccountInfo<'info>,
    authority: &AccountInfo<'info>, seeds: &[&[u8]]) -> Result<()> {
    if account.state == token::spl_token::state::AccountState::Frozen {
        crate::thaw(&account.to_account_info(), mint, authority, seeds)
    } else {
        require!(account.state == token::spl_token::state::AccountState::Initialized && account.amount == 0,
            BondError::InvalidHolderAccount);
        Ok(())
    }
}

fn validate_destination(destination: &TokenAccount) -> Result<()> {
    require!(destination.state == token::spl_token::state::AccountState::Initialized, BondError::InvalidHolderAccount);
    crate::validate_token_authorities(destination)
}

fn payout<'info>(b: &Account<'info, BondV2>, vault: &AccountInfo<'info>, mint: &AccountInfo<'info>,
    destination: &AccountInfo<'info>, amount: u64) -> Result<()> {
    require_keys_neq!(vault.key(), destination.key(), BondError::SameAccount);
    let series = b.series_id.to_le_bytes(); let bump = [b.bump];
    let seeds: &[&[u8]] = &[b"bond_v2", b.issuer.as_ref(), &series, &bump];
    token::transfer_checked(CpiContext::new(token::ID, TransferChecked { from: vault.clone(), mint: mint.clone(),
        to: destination.clone(), authority: b.to_account_info() }).with_signer(&[seeds]), amount, 6)
}
