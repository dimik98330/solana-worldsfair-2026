use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

#[derive(Accounts)]
#[instruction(series_id: u64)]
pub struct InitializeIssue<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,
    #[account(init, payer = issuer, space = 8 + Bond::INIT_SPACE,
        seeds = [b"bond", issuer.key().as_ref(), &series_id.to_le_bytes()], bump)]
    pub bond: Box<Account<'info, Bond>>,
    #[account(init, payer = issuer, seeds = [b"bond_mint", bond.key().as_ref()], bump,
        mint::decimals = 0, mint::authority = bond, mint::freeze_authority = bond)]
    pub bond_mint: Account<'info, Mint>,
    #[account(constraint = settlement_mint.decimals == 6 @ BondError::InvalidTerms)]
    pub settlement_mint: Account<'info, Mint>,
    #[account(init, payer = issuer, seeds = [b"vault", bond.key().as_ref()], bump,
        token::mint = settlement_mint, token::authority = bond)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(series_id: u64)]
pub struct InitializeRateIssue<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,
    #[account(init, payer = issuer, space = 8 + Bond::INIT_SPACE,
        seeds = [b"bond", issuer.key().as_ref(), &series_id.to_le_bytes()], bump)]
    pub bond: Box<Account<'info, Bond>>,
    #[account(init, payer = issuer, seeds = [b"bond_mint", bond.key().as_ref()], bump,
        mint::decimals = 0, mint::authority = bond, mint::freeze_authority = bond)]
    pub bond_mint: Account<'info, Mint>,
    #[account(constraint = settlement_mint.decimals == 6 @ BondError::InvalidTerms)]
    pub settlement_mint: Account<'info, Mint>,
    #[account(init, payer = issuer, seeds = [b"vault", bond.key().as_ref()], bump,
        token::mint = settlement_mint, token::authority = bond)]
    pub vault: Account<'info, TokenAccount>,
    #[account(init, payer = issuer, space = 8 + FinancialTerms::INIT_SPACE,
        seeds = [b"financial_terms", bond.key().as_ref()], bump)]
    pub financial_terms: Account<'info, FinancialTerms>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct RegisterHolder<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,
    #[account(mut, seeds = [b"bond", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = issuer @ BondError::UnauthorizedIssuer, has_one = bond_mint)]
    pub bond: Box<Account<'info, Bond>>,
    pub wallet: SystemAccount<'info>,
    #[account(mut, associated_token::mint = bond_mint, associated_token::authority = wallet)]
    pub holder_bonds: Account<'info, TokenAccount>,
    pub bond_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct IssueUnits<'info> {
    pub issuer: Signer<'info>,
    #[account(mut, seeds = [b"bond", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = issuer @ BondError::UnauthorizedIssuer, has_one = bond_mint)]
    pub bond: Box<Account<'info, Bond>>,
    #[account(mut)]
    pub bond_mint: Account<'info, Mint>,
    #[account(mut, token::mint = bond_mint)]
    pub holder_bonds: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct FundVault<'info> {
    pub funder: Signer<'info>,
    #[account(seeds = [b"bond", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = settlement_mint, has_one = vault)]
    pub bond: Box<Account<'info, Bond>>,
    pub settlement_mint: Account<'info, Mint>,
    #[account(mut, token::mint = settlement_mint, token::authority = funder)]
    pub source: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"vault", bond.key().as_ref()], bump,
        token::mint = settlement_mint, token::authority = bond)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SealIssue<'info> {
    pub issuer: Signer<'info>,
    #[account(mut, seeds = [b"bond", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = issuer @ BondError::UnauthorizedIssuer,
        has_one = bond_mint, has_one = vault)]
    pub bond: Box<Account<'info, Bond>>,
    pub bond_mint: Account<'info, Mint>,
    #[account(seeds = [b"vault", bond.key().as_ref()], bump,
        token::authority = bond, constraint = vault.mint == bond.settlement_mint)]
    pub vault: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct TransferUnits<'info> {
    pub holder: Signer<'info>,
    #[account(seeds = [b"bond", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = bond_mint)]
    pub bond: Box<Account<'info, Bond>>,
    pub bond_mint: Account<'info, Mint>,
    #[account(mut, token::mint = bond_mint, token::authority = holder)]
    pub source: Account<'info, TokenAccount>,
    #[account(mut, token::mint = bond_mint)]
    pub destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct CaptureCoupon<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [b"bond", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = bond_mint)]
    pub bond: Box<Account<'info, Bond>>,
    #[account(init, payer = payer, space = 8 + Coupon::INIT_SPACE,
        seeds = [b"coupon", bond.key().as_ref(), &[index]], bump)]
    pub coupon: Box<Account<'info, Coupon>>,
    pub bond_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct ClaimCoupon<'info> {
    pub holder: Signer<'info>,
    #[account(seeds = [b"bond", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = settlement_mint, has_one = vault)]
    pub bond: Box<Account<'info, Bond>>,
    #[account(mut, seeds = [b"coupon", bond.key().as_ref(), &[index]], bump = coupon.bump,
        has_one = bond, constraint = coupon.index == index @ BondError::InvalidCouponIndex)]
    pub coupon: Box<Account<'info, Coupon>>,
    pub settlement_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"vault", bond.key().as_ref()], bump,
        token::mint = settlement_mint, token::authority = bond)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = settlement_mint, token::authority = holder)]
    pub destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct SettleCoupon<'info> {
    /// Pays transaction fees; cannot choose the entitlement or redirect it.
    pub executor: Signer<'info>,
    /// CHECK: key must be in the sealed registry, and destination is its canonical ATA.
    pub holder: UncheckedAccount<'info>,
    #[account(seeds = [b"bond", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = settlement_mint, has_one = vault)]
    pub bond: Box<Account<'info, Bond>>,
    #[account(mut, seeds = [b"coupon", bond.key().as_ref(), &[index]], bump = coupon.bump,
        has_one = bond, constraint = coupon.index == index @ BondError::InvalidCouponIndex)]
    pub coupon: Box<Account<'info, Coupon>>,
    pub settlement_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"vault", bond.key().as_ref()], bump,
        token::mint = settlement_mint, token::authority = bond)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, associated_token::mint = settlement_mint, associated_token::authority = holder)]
    pub destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct BeginRedemption<'info> {
    pub issuer: Signer<'info>,
    #[account(mut, seeds = [b"bond", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = issuer @ BondError::UnauthorizedIssuer, has_one = bond_mint)]
    pub bond: Box<Account<'info, Bond>>,
    pub bond_mint: Account<'info, Mint>,
}

#[derive(Accounts)]
pub struct RedeemPrincipal<'info> {
    pub holder: Signer<'info>,
    #[account(mut, seeds = [b"bond", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = bond_mint, has_one = settlement_mint, has_one = vault)]
    pub bond: Box<Account<'info, Bond>>,
    #[account(mut)]
    pub bond_mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = bond_mint, associated_token::authority = holder)]
    pub holder_bonds: Account<'info, TokenAccount>,
    pub settlement_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"vault", bond.key().as_ref()], bump,
        token::mint = settlement_mint, token::authority = bond)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = settlement_mint, token::authority = holder)]
    pub destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,
    #[account(seeds = [b"bond", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()],
        bump = bond.bump, has_one = issuer @ BondError::UnauthorizedIssuer, has_one = bond_mint)]
    pub bond: Box<Account<'info, Bond>>,
    #[account(init, payer = issuer, space = 8 + Proposal::INIT_SPACE,
        seeds = [b"proposal", bond.key().as_ref(), &proposal_id.to_le_bytes()], bump)]
    pub proposal: Box<Account<'info, Proposal>>,
    pub bond_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(seeds = [b"bond", bond.issuer.as_ref(), &bond.series_id.to_le_bytes()], bump = bond.bump)]
    pub bond: Box<Account<'info, Bond>>,
    #[account(mut, seeds = [b"proposal", bond.key().as_ref(), &proposal.proposal_id.to_le_bytes()],
        bump = proposal.bump, has_one = bond)]
    pub proposal: Box<Account<'info, Proposal>>,
    #[account(init, payer = voter, space = 8 + Ballot::INIT_SPACE,
        seeds = [b"ballot", proposal.key().as_ref(), voter.key().as_ref()], bump)]
    pub ballot: Account<'info, Ballot>,
    pub system_program: Program<'info, System>,
}
