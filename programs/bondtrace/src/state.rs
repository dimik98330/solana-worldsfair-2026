use anchor_lang::prelude::*;

pub const MAX_HOLDERS: usize = 16;
pub const MAX_COUPONS: usize = 8;
pub const DRAFT: u8 = 0;
pub const ACTIVE: u8 = 1;
pub const REDEEMING: u8 = 2;
pub const REDEEMED: u8 = 3;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, Debug)]
pub struct CouponTerms {
    pub record_ts: i64,
    pub payment_ts: i64,
    /// Settlement-token base units payable for one whole bond.
    pub unit_amount: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Bond {
    pub issuer: Pubkey,
    pub bond_mint: Pubkey,
    pub settlement_mint: Pubkey,
    pub vault: Pubkey,
    pub series_id: u64,
    #[max_len(64)]
    pub name: String,
    /// Settlement-token base units per whole bond, never floating point.
    pub face_value: u64,
    pub maturity_ts: i64,
    pub total_issued: u64,
    pub total_redeemed: u64,
    pub state: u8,
    pub bump: u8,
    pub next_coupon_index: u8,
    pub principal_claimed_mask: u16,
    /// Immutable after sealing; every snapshot uses precisely this order.
    #[max_len(16)]
    pub holder_wallets: Vec<Pubkey>,
    #[max_len(8)]
    pub coupon_terms: Vec<CouponTerms>,
    #[max_len(16)]
    pub redemption_units: Vec<u64>,
}

/// Created atomically with a rate-based issue. There is deliberately no update,
/// close, or attach-to-existing-bond instruction for this immutable account.
#[account]
#[derive(InitSpace)]
pub struct FinancialTerms {
    pub version: u8,
    pub bond: Pubkey,
    /// Settlement-token base units per whole bond.
    pub nominal: u64,
    pub rate_bps: u16,
    pub frequency: u8,
    /// Exact settlement-token base units for each regular coupon.
    pub unit_amount: u64,
    pub bump: u8,
}

pub const FINANCIAL_TERMS_VERSION: u8 = 1;

pub fn rate_coupon_amount(nominal: u64, rate_bps: u16, frequency: u8) -> Result<u64> {
    require!(
        nominal > 0 && (1..=10_000).contains(&rate_bps) && (1..=12).contains(&frequency),
        BondError::InvalidTerms
    );
    let numerator = u128::from(nominal)
        .checked_mul(u128::from(rate_bps))
        .ok_or(BondError::MathOverflow)?;
    let denominator = 10_000_u128
        .checked_mul(u128::from(frequency))
        .ok_or(BondError::MathOverflow)?;
    require!(numerator % denominator == 0, BondError::InvalidTerms);
    let amount = u64::try_from(numerator / denominator).map_err(|_| BondError::MathOverflow)?;
    require!(amount > 0, BondError::InvalidTerms);
    Ok(amount)
}

#[account]
#[derive(InitSpace)]
pub struct Coupon {
    pub bond: Pubkey,
    pub index: u8,
    pub record_ts: i64,
    pub payment_ts: i64,
    pub unit_amount: u64,
    pub captured_at: i64,
    pub total_units: u64,
    pub claimed_mask: u16,
    pub paid_total: u64,
    #[max_len(16)]
    pub units: Vec<u64>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Proposal {
    pub bond: Pubkey,
    pub proposal_id: u64,
    #[max_len(96)]
    pub title: String,
    pub opened_at: i64,
    pub closes_at: i64,
    pub total_units: u64,
    pub yes_units: u64,
    pub no_units: u64,
    pub ballot_mask: u16,
    #[max_len(16)]
    pub units: Vec<u64>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Ballot {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub weight: u64,
    pub support: bool,
    pub bump: u8,
}

#[error_code]
pub enum BondError {
    #[msg("Only the configured issuer may perform this operation")]
    UnauthorizedIssuer,
    #[msg("This operation is unavailable in the issue's current phase")]
    InvalidPhase,
    #[msg("Terms, dates, name or amount are invalid")]
    InvalidTerms,
    #[msg("Checked integer arithmetic overflow")]
    MathOverflow,
    #[msg("The registry supports at most sixteen pre-registered holders")]
    RegistryFull,
    #[msg("Wallet is already registered")]
    AlreadyRegistered,
    #[msg("Wallet is not in this issue's sealed holder registry")]
    UnregisteredHolder,
    #[msg("Expected the canonical holder token account for this bond mint")]
    InvalidHolderAccount,
    #[msg("Token accounts cannot have delegates or custom close authorities")]
    UnsafeTokenAuthority,
    #[msg("The requested action is not due yet")]
    TooEarly,
    #[msg("Capture the due coupon record before transferring bonds")]
    RecordDateLocked,
    #[msg("Transfers and new proposals stop at maturity")]
    Matured,
    #[msg("Capture all coupon records before beginning principal redemption")]
    PendingCoupon,
    #[msg("Coupon records must be captured exactly once in schedule order")]
    InvalidCouponIndex,
    #[msg("Supply or holder balances do not match the sealed issue")]
    SupplyMismatch,
    #[msg("Pass every registered holder account in exact registry order")]
    IncompleteSnapshot,
    #[msg("The vault must cover all principal and coupon liabilities")]
    InsufficientReserve,
    #[msg("This wallet already received this payment")]
    AlreadyClaimed,
    #[msg("The immutable snapshot grants this wallet no entitlement")]
    NoEntitlement,
    #[msg("Source and destination must be different accounts")]
    SameAccount,
    #[msg("The ballot window has closed")]
    VotingClosed,
    #[msg("This wallet already cast a ballot on this proposal")]
    AlreadyVoted,
    #[msg("Draft changes must finish before the first coupon record date")]
    RecordDatePassed,
    #[msg("Expected the canonical page and the next sequential page index")]
    InvalidPage,
    #[msg("A paged snapshot is in progress; transfers and registry changes are locked")]
    SnapshotLocked,
    #[msg("Append the complete immutable coupon schedule before continuing")]
    ScheduleIncomplete,
    #[msg("Finalize every snapshot page before claiming or voting")]
    SnapshotNotFinalized,
    #[msg("The action kind does not support this operation")]
    InvalidActionKind,
    #[msg("Expected the next append-only registry position")]
    InvalidHolderIndex,
}

impl Bond {
    pub fn holder_index(&self, wallet: Pubkey) -> Result<usize> {
        self.holder_wallets
            .iter()
            .position(|v| *v == wallet)
            .ok_or_else(|| error!(BondError::UnregisteredHolder))
    }

    pub fn required_reserve(&self) -> Result<u64> {
        let unit_total = self
            .coupon_terms
            .iter()
            .try_fold(self.face_value, |sum, terms| {
                sum.checked_add(terms.unit_amount)
                    .ok_or_else(|| error!(BondError::MathOverflow))
            })?;
        unit_total
            .checked_mul(self.total_issued)
            .ok_or_else(|| error!(BondError::MathOverflow))
    }

    pub fn require_transfer_window(&self, now: i64) -> Result<()> {
        require!(self.state == ACTIVE, BondError::InvalidPhase);
        require!(now < self.maturity_ts, BondError::Matured);
        if let Some(terms) = self.coupon_terms.get(usize::from(self.next_coupon_index)) {
            require!(now < terms.record_ts, BondError::RecordDateLocked);
        }
        Ok(())
    }
}

pub fn payment_amount(unit_amount: u64, units: u64) -> Result<u64> {
    unit_amount
        .checked_mul(units)
        .ok_or_else(|| error!(BondError::MathOverflow))
}

pub fn holder_bit(index: usize) -> Result<u16> {
    1_u16
        .checked_shl(u32::try_from(index).map_err(|_| error!(BondError::RegistryFull))?)
        .ok_or_else(|| error!(BondError::RegistryFull))
}

#[event]
pub struct ActionReceipt {
    pub bond: Pubkey,
    /// 0=issued, 1=transferred, 2=coupon captured, 3=coupon paid,
    /// 4=redemption opened, 5=principal paid, 6=proposal opened, 7=vote.
    pub kind: u8,
    pub actor: Pubkey,
    pub action_id: u64,
    pub units: u64,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct CouponSettlementReceipt {
    pub bond: Pubkey,
    pub coupon: Pubkey,
    pub index: u8,
    pub executor: Pubkey,
    pub beneficiary: Pubkey,
    pub destination: Pubkey,
    pub units: u64,
    pub amount: u64,
    pub timestamp: i64,
}
