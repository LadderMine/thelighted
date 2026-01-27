use soroban_sdk::{contracttype, Address};

#[contracttype]
#[derive(Clone, Debug)]
pub struct VestingSchedule {
    pub recipient: Address,
    pub total_amount: i128,
    pub start_time: u64,
    pub duration: u64,      // Duration in seconds
    pub cliff: u64,         // Cliff period in seconds
    pub claimed_amount: i128,
    pub cancelled: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct VestingInfo {
    pub schedule_id: u32,
    pub schedule: VestingSchedule,
    pub vested_amount: i128,
    pub claimable_amount: i128,
}