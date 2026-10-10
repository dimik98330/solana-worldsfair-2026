//! Version two uses bounded pages, never resizes or reinterprets legacy accounts.
use crate::state::{BondError, ACTIVE, DRAFT};
use anchor_lang::prelude::*;

pub const V2_PAGE_CAP: usize = 8;
pub const V2_COUPON: u8 = 1;
pub const V2_PRINCIPAL: u8 = 2;
pub const V2_VOTE: u8 = 3;

#[account]
#[derive(InitSpace)]
pub struct BondV2 {
    pub version: u8,
    pub issuer: Pubkey,
    pub bond_mint: Pubkey,
    pub settlement_mint: Pubkey,
    pub vault: Pubkey,
    pub series_id: u64,
    pub face_value: u64,
    pub rate_bps: u16,
    pub frequency: u8,
    pub maturity_ts: i64,
    pub total_issued: u64,
    pub total_redeemed: u64,
    pub state: u8,
    pub bump: u8,
    /// Optimistic read fence for paginated RPC reads. Every program mutation
    /// touching this instrument's economic graph increments it exactly once.
    pub revision: u64,
    pub holder_count: u32,
    pub coupon_count: u32,
    pub schedule_appended: u32,
    pub next_coupon_index: u32,
    pub first_record_ts: i64,
    pub next_record_ts: i64,
    pub last_record_ts: i64,
    pub last_payment_ts: i64,
    pub coupon_unit_total: u64,
    /// Zero means no capture. One instrument has at most one capture in flight.
    pub active_kind: u8,
    pub active_id: u32,
    #[max_len(64)]
    pub name: String,
}

#[account]
#[derive(InitSpace)]
pub struct HolderV2 {
    pub bond: Pubkey,
    pub wallet: Pubkey,
    /// Append-only; never reused or changed, even after a zero balance or burn.
    pub index: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct RegistryPageV2 {
    pub bond: Pubkey,
    pub index: u32,
    pub bump: u8,
    #[max_len(8)]
    pub wallets: Vec<Pubkey>,
}

#[account]
#[derive(InitSpace)]
pub struct SchedulePageV2 {
    pub bond: Pubkey,
    pub index: u32,
    pub bump: u8,
    #[max_len(8)]
    pub terms: Vec<crate::state::CouponTerms>,
}

#[account]
#[derive(InitSpace)]
pub struct ActionV2 {
    pub bond: Pubkey,
    pub kind: u8,
    pub id: u32,
    pub record_ts: i64,
    pub payment_ts: i64,
    pub unit_amount: u64,
    pub opened_at: i64,
    pub closes_at: i64,
    /// Registry prefix frozen when capture starts. Later holders have no rights.
    pub holder_count: u32,
    pub captured_pages: u32,
    pub total_units: u64,
    pub paid_total: u64,
    pub claimed_units: u64,
    pub yes_units: u64,
    pub no_units: u64,
    pub finalized: bool,
    pub bump: u8,
    #[max_len(96)]
    pub title: String,
}

#[account]
#[derive(InitSpace)]
pub struct SnapshotPageV2 {
    pub action: Pubkey,
    pub index: u32,
    pub claimed_mask: u8,
    pub voted_mask: u8,
    pub paid_total: u64,
    pub bump: u8,
    #[max_len(8)]
    pub units: Vec<u64>,
}

#[account]
#[derive(InitSpace)]
pub struct BallotV2 {
    pub action: Pubkey,
    pub voter: Pubkey,
    pub weight: u64,
    pub support: bool,
    pub bump: u8,
}

impl BondV2 {
    pub fn touch(&mut self) -> Result<()> {
        self.revision = self.revision.checked_add(1).ok_or(BondError::MathOverflow)?;
        Ok(())
    }
    pub fn require_window(&self, now: i64) -> Result<()> {
        require!(self.state == ACTIVE, BondError::InvalidPhase);
        require!(now < self.maturity_ts, BondError::Matured);
        require!(self.active_kind == 0, BondError::SnapshotLocked);
        require!(self.next_coupon_index == self.coupon_count || now < self.next_record_ts,
            BondError::RecordDateLocked);
        Ok(())
    }
    pub fn require_registry_window(&self, now: i64) -> Result<()> {
        if self.state == DRAFT {
            require!(self.schedule_appended == self.coupon_count, BondError::ScheduleIncomplete);
            require!(now < self.first_record_ts, BondError::RecordDatePassed);
            require!(self.active_kind == 0, BondError::SnapshotLocked);
            Ok(())
        } else {
            self.require_window(now)
        }
    }
    pub fn required_reserve(&self) -> Result<u64> {
        self.face_value.checked_add(self.coupon_unit_total)
            .and_then(|unit| unit.checked_mul(self.total_issued))
            .ok_or_else(|| error!(BondError::MathOverflow))
    }
    pub fn finalize_schedule_page(&self, kind: u8) -> u32 {
        // Initialized instruments always have at least one coupon. Coupon
        // finalization advances by one; terminal actions use the last page.
        let next = if kind == V2_COUPON { self.next_coupon_index.saturating_add(1) }
            else { self.next_coupon_index };
        next.min(self.coupon_count.saturating_sub(1)) / V2_PAGE_CAP as u32
    }
}

impl ActionV2 {
    pub fn page_count(&self) -> u32 {
        if self.holder_count == 0 { 0 } else { (self.holder_count - 1) / V2_PAGE_CAP as u32 + 1 }
    }
    pub fn holder_position(&self, holder: &HolderV2, snapshot: &SnapshotPageV2) -> Result<usize> {
        require!(self.finalized, BondError::SnapshotNotFinalized);
        require!(holder.index < self.holder_count, BondError::NoEntitlement);
        require!(snapshot.index == holder.index / V2_PAGE_CAP as u32, BondError::InvalidPage);
        let position = (holder.index % V2_PAGE_CAP as u32) as usize;
        require!(position < snapshot.units.len(), BondError::IncompleteSnapshot);
        Ok(position)
    }
}

#[event]
pub struct ActionReceiptV2 {
    pub bond: Pubkey,
    pub action: Pubkey,
    pub kind: u8,
    pub executor: Pubkey,
    pub beneficiary: Pubkey,
    pub units: u64,
    pub amount: u64,
    pub timestamp: i64,
}
