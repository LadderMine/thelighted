use soroban_sdk::contracttype;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Tier {
    None,
    Bronze,
    Silver,
    Gold,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct TierThresholds {
    pub bronze: i128,
    pub silver: i128,
    pub gold: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct TierBenefits {
    pub multiplier: u32, // Basis points (10000 = 1.0x, 12000 = 1.2x)
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct TierHistoryEntry {
    pub tier: Tier,
    pub timestamp: u64,
    pub token_balance: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct UserTierInfo {
    pub current_tier: Tier,
    pub last_updated: u64,
}
