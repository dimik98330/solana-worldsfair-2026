use crate::{state::BondError, v2_state::*};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
#[instruction(series_id: u64)]
pub struct InitializeIssueV2<'info> {
    #[account(mut)] pub issuer: Signer<'info>,
    #[account(init, payer = issuer, space = 8 + BondV2::INIT_SPACE,
        seeds = [b"bond_v2", issuer.key().as_ref(), &series_id.to_le_bytes()], bump)]
    pub bond: Box<Account<'info, BondV2>>,
    #[account(init, payer = issuer, seeds = [b"bond_mint_v2", bond.key().as_ref()], bump,
        mint::decimals = 0, mint::authority = bond, mint::freeze_authority = bond)]
    pub bond_mint: Account<'info, Mint>,
    #[account(constraint = settlement_mint.decimals == 6 @ BondError::InvalidTerms)]
    pub settlement_mint: Account<'info, Mint>,
    #[account(init, payer = issuer, seeds = [b"vault_v2", bond.key().as_ref()], bump,
        token::mint = settlement_mint, token::authority = bond)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(page_index: u32)]
pub struct AppendScheduleV2<'info> {
    #[account(mut)] pub issuer: Signer<'info>,
    #[account(mut, seeds = [b"bond_v2", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = issuer @ BondError::UnauthorizedIssuer)]
    pub bond: Box<Account<'info, BondV2>>,
    #[account(init, payer = issuer, space = 8 + SchedulePageV2::INIT_SPACE,
        seeds = [b"schedule_v2", bond.key().as_ref(), &page_index.to_le_bytes()], bump)]
    pub schedule_page: Box<Account<'info, SchedulePageV2>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(page_index: u32)]
pub struct CreateRegistryPageV2<'info> {
    #[account(mut)] pub issuer: Signer<'info>,
    #[account(mut, seeds = [b"bond_v2", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = issuer @ BondError::UnauthorizedIssuer)]
    pub bond: Box<Account<'info, BondV2>>,
    #[account(init, payer = issuer, space = 8 + RegistryPageV2::INIT_SPACE,
        seeds = [b"registry_v2", bond.key().as_ref(), &page_index.to_le_bytes()], bump)]
    pub registry_page: Box<Account<'info, RegistryPageV2>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(index: u32)]
pub struct RegisterHolderV2<'info> {
    #[account(mut)] pub issuer: Signer<'info>,
    #[account(mut, seeds = [b"bond_v2", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = issuer @ BondError::UnauthorizedIssuer, has_one = bond_mint)]
    pub bond: Box<Account<'info, BondV2>>,
    #[account(mut, seeds = [b"registry_v2", bond.key().as_ref(), &(index / V2_PAGE_CAP as u32).to_le_bytes()],
        bump = registry_page.bump, has_one = bond)]
    pub registry_page: Box<Account<'info, RegistryPageV2>>,
    #[account(init, payer = issuer, space = 8 + HolderV2::INIT_SPACE,
        seeds = [b"holder_v2", bond.key().as_ref(), wallet.key().as_ref()], bump)]
    pub holder_record: Account<'info, HolderV2>,
    pub wallet: SystemAccount<'info>,
    #[account(mut, associated_token::mint = bond_mint, associated_token::authority = wallet)]
    pub holder_bonds: Account<'info, TokenAccount>,
    pub bond_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct IssueUnitsV2<'info> {
    pub issuer: Signer<'info>,
    #[account(mut, seeds = [b"bond_v2", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = issuer @ BondError::UnauthorizedIssuer, has_one = bond_mint)]
    pub bond: Box<Account<'info, BondV2>>,
    #[account(seeds = [b"holder_v2", bond.key().as_ref(), holder_record.wallet.as_ref()],
        bump = holder_record.bump, has_one = bond)]
    pub holder_record: Account<'info, HolderV2>,
    #[account(mut)] pub bond_mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = bond_mint, associated_token::authority = holder_record.wallet)]
    pub holder_bonds: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct FundVaultV2<'info> {
    pub funder: Signer<'info>,
    #[account(mut, seeds = [b"bond_v2", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = settlement_mint, has_one = vault)]
    pub bond: Box<Account<'info, BondV2>>,
    pub settlement_mint: Account<'info, Mint>,
    #[account(mut, token::mint = settlement_mint, token::authority = funder)]
    pub source: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"vault_v2", bond.key().as_ref()], bump,
        token::mint = settlement_mint, token::authority = bond)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SealIssueV2<'info> {
    pub issuer: Signer<'info>,
    #[account(mut, seeds = [b"bond_v2", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = issuer @ BondError::UnauthorizedIssuer,
        has_one = bond_mint, has_one = vault)]
    pub bond: Box<Account<'info, BondV2>>,
    pub bond_mint: Account<'info, Mint>,
    #[account(seeds = [b"vault_v2", bond.key().as_ref()], bump, token::authority = bond,
        constraint = vault.mint == bond.settlement_mint)]
    pub vault: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct TransferUnitsV2<'info> {
    pub holder: Signer<'info>,
    #[account(mut, seeds = [b"bond_v2", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = bond_mint)]
    pub bond: Box<Account<'info, BondV2>>,
    pub bond_mint: Account<'info, Mint>,
    #[account(seeds = [b"holder_v2", bond.key().as_ref(), holder.key().as_ref()],
        bump = source_holder.bump, has_one = bond, constraint = source_holder.wallet == holder.key())]
    pub source_holder: Account<'info, HolderV2>,
    #[account(seeds = [b"holder_v2", bond.key().as_ref(), destination_holder.wallet.as_ref()],
        bump = destination_holder.bump, has_one = bond)]
    pub destination_holder: Account<'info, HolderV2>,
    #[account(mut, associated_token::mint = bond_mint, associated_token::authority = holder)]
    pub source: Account<'info, TokenAccount>,
    #[account(mut, associated_token::mint = bond_mint, associated_token::authority = destination_holder.wallet)]
    pub destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(index: u32)]
pub struct BeginCouponV2<'info> {
    #[account(mut)] pub payer: Signer<'info>,
    #[account(mut, seeds = [b"bond_v2", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = bond_mint)]
    pub bond: Box<Account<'info, BondV2>>,
    #[account(init, payer = payer, space = 8 + ActionV2::INIT_SPACE,
        seeds = [b"action_v2", bond.key().as_ref(), &[V2_COUPON], &index.to_le_bytes()], bump)]
    pub action: Box<Account<'info, ActionV2>>,
    #[account(seeds = [b"schedule_v2", bond.key().as_ref(), &(index / V2_PAGE_CAP as u32).to_le_bytes()],
        bump = schedule_page.bump, has_one = bond)]
    pub schedule_page: Box<Account<'info, SchedulePageV2>>,
    pub bond_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BeginRedemptionV2<'info> {
    #[account(mut)] pub payer: Signer<'info>,
    #[account(mut, seeds = [b"bond_v2", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = bond_mint)]
    pub bond: Box<Account<'info, BondV2>>,
    #[account(init, payer = payer, space = 8 + ActionV2::INIT_SPACE,
        seeds = [b"action_v2", bond.key().as_ref(), &[V2_PRINCIPAL], &0_u32.to_le_bytes()], bump)]
    pub action: Box<Account<'info, ActionV2>>,
    pub bond_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(proposal_id: u32)]
pub struct CreateProposalV2<'info> {
    #[account(mut)] pub issuer: Signer<'info>,
    #[account(mut, seeds = [b"bond_v2", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = issuer @ BondError::UnauthorizedIssuer, has_one = bond_mint)]
    pub bond: Box<Account<'info, BondV2>>,
    #[account(init, payer = issuer, space = 8 + ActionV2::INIT_SPACE,
        seeds = [b"action_v2", bond.key().as_ref(), &[V2_VOTE], &proposal_id.to_le_bytes()], bump)]
    pub action: Box<Account<'info, ActionV2>>,
    pub bond_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(page_index: u32)]
pub struct CaptureActionPageV2<'info> {
    #[account(mut)] pub payer: Signer<'info>,
    #[account(mut, seeds = [b"bond_v2", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = bond_mint)]
    pub bond: Box<Account<'info, BondV2>>,
    #[account(mut, seeds = [b"action_v2", bond.key().as_ref(), &[action.kind], &action.id.to_le_bytes()],
        bump = action.bump, has_one = bond)]
    pub action: Box<Account<'info, ActionV2>>,
    #[account(seeds = [b"registry_v2", bond.key().as_ref(), &page_index.to_le_bytes()],
        bump = registry_page.bump, has_one = bond)]
    pub registry_page: Box<Account<'info, RegistryPageV2>>,
    #[account(init, payer = payer, space = 8 + SnapshotPageV2::INIT_SPACE,
        seeds = [b"snapshot_v2", action.key().as_ref(), &page_index.to_le_bytes()], bump)]
    pub snapshot_page: Box<Account<'info, SnapshotPageV2>>,
    pub bond_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeActionV2<'info> {
    pub executor: Signer<'info>,
    #[account(mut, seeds = [b"bond_v2", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = bond_mint)]
    pub bond: Box<Account<'info, BondV2>>,
    #[account(mut, seeds = [b"action_v2", bond.key().as_ref(), &[action.kind], &action.id.to_le_bytes()],
        bump = action.bump, has_one = bond)]
    pub action: Box<Account<'info, ActionV2>>,
    pub bond_mint: Account<'info, Mint>,
    #[account(seeds = [b"schedule_v2", bond.key().as_ref(), &bond.finalize_schedule_page(action.kind).to_le_bytes()],
        bump = next_schedule_page.bump, has_one = bond)]
    pub next_schedule_page: Box<Account<'info, SchedulePageV2>>,
}

/// The same fixed-beneficiary accounts serve holder claims and keeper payouts.
#[derive(Accounts)]
pub struct PayCouponV2<'info> {
    pub executor: Signer<'info>,
    /// CHECK: bound to the immutable HolderV2 and canonical destination below.
    pub beneficiary: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"bond_v2", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = settlement_mint, has_one = vault)]
    pub bond: Box<Account<'info, BondV2>>,
    #[account(mut, seeds = [b"action_v2", bond.key().as_ref(), &[action.kind], &action.id.to_le_bytes()],
        bump = action.bump, has_one = bond)]
    pub action: Box<Account<'info, ActionV2>>,
    #[account(seeds = [b"holder_v2", bond.key().as_ref(), beneficiary.key().as_ref()],
        bump = holder_record.bump, has_one = bond, constraint = holder_record.wallet == beneficiary.key())]
    pub holder_record: Account<'info, HolderV2>,
    #[account(mut, seeds = [b"snapshot_v2", action.key().as_ref(), &(holder_record.index / V2_PAGE_CAP as u32).to_le_bytes()],
        bump = snapshot_page.bump, has_one = action)]
    pub snapshot_page: Box<Account<'info, SnapshotPageV2>>,
    pub settlement_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"vault_v2", bond.key().as_ref()], bump,
        token::mint = settlement_mint, token::authority = bond)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, associated_token::mint = settlement_mint, associated_token::authority = beneficiary)]
    pub destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RedeemPrincipalV2<'info> {
    pub holder: Signer<'info>,
    #[account(mut, seeds = [b"bond_v2", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = bond_mint, has_one = settlement_mint, has_one = vault)]
    pub bond: Box<Account<'info, BondV2>>,
    #[account(mut, seeds = [b"action_v2", bond.key().as_ref(), &[V2_PRINCIPAL], &0_u32.to_le_bytes()],
        bump = action.bump, has_one = bond)]
    pub action: Box<Account<'info, ActionV2>>,
    #[account(seeds = [b"holder_v2", bond.key().as_ref(), holder.key().as_ref()],
        bump = holder_record.bump, has_one = bond, constraint = holder_record.wallet == holder.key())]
    pub holder_record: Box<Account<'info, HolderV2>>,
    #[account(mut, seeds = [b"snapshot_v2", action.key().as_ref(), &(holder_record.index / V2_PAGE_CAP as u32).to_le_bytes()],
        bump = snapshot_page.bump, has_one = action)]
    pub snapshot_page: Box<Account<'info, SnapshotPageV2>>,
    #[account(mut)] pub bond_mint: Box<Account<'info, Mint>>,
    #[account(mut, associated_token::mint = bond_mint, associated_token::authority = holder)]
    pub holder_bonds: Box<Account<'info, TokenAccount>>,
    pub settlement_mint: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [b"vault_v2", bond.key().as_ref()], bump,
        token::mint = settlement_mint, token::authority = bond)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = settlement_mint, associated_token::authority = holder)]
    pub destination: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CastVoteV2<'info> {
    #[account(mut)] pub voter: Signer<'info>,
    #[account(mut, seeds = [b"bond_v2", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()], bump = bond.bump)]
    pub bond: Box<Account<'info, BondV2>>,
    #[account(mut, seeds = [b"action_v2", bond.key().as_ref(), &[V2_VOTE], &action.id.to_le_bytes()],
        bump = action.bump, has_one = bond)]
    pub action: Box<Account<'info, ActionV2>>,
    #[account(seeds = [b"holder_v2", bond.key().as_ref(), voter.key().as_ref()],
        bump = holder_record.bump, has_one = bond, constraint = holder_record.wallet == voter.key())]
    pub holder_record: Account<'info, HolderV2>,
    #[account(mut, seeds = [b"snapshot_v2", action.key().as_ref(), &(holder_record.index / V2_PAGE_CAP as u32).to_le_bytes()],
        bump = snapshot_page.bump, has_one = action)]
    pub snapshot_page: Box<Account<'info, SnapshotPageV2>>,
    #[account(init, payer = voter, space = 8 + BallotV2::INIT_SPACE,
        seeds = [b"ballot_v2", action.key().as_ref(), voter.key().as_ref()], bump)]
    pub ballot: Account<'info, BallotV2>,
    pub system_program: Program<'info, System>,
}
