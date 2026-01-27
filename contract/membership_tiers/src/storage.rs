use crate::types::{Tier, TierBenefits, TierHistoryEntry, TierThresholds, UserTierInfo};
use soroban_sdk::{contracttype, Address, Env, Vec};

#[contracttype]
pub enum DataKey {
    Admin,
    TierThresholds,
    TierBenefits(Tier),
    UserTier(Address),
    TierHistory(Address),
}

const DAY_IN_LEDGERS: u32 = 17280; // Approximate ledgers per day
const INSTANCE_LIFETIME_THRESHOLD: u32 = DAY_IN_LEDGERS * 30; // 30 days
const INSTANCE_BUMP_AMOUNT: u32 = DAY_IN_LEDGERS * 30; // 30 days

// Admin functions
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn get_admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

pub fn has_admin(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Admin)
}

pub fn is_admin(env: &Env, address: &Address) -> bool {
    if let Some(admin) = env
        .storage()
        .instance()
        .get::<DataKey, Address>(&DataKey::Admin)
    {
        admin == *address
    } else {
        false
    }
}

// Tier thresholds
pub fn set_tier_thresholds(env: &Env, thresholds: &TierThresholds) {
    env.storage()
        .instance()
        .set(&DataKey::TierThresholds, thresholds);
}

pub fn get_tier_thresholds(env: &Env) -> TierThresholds {
    env.storage()
        .instance()
        .get(&DataKey::TierThresholds)
        .unwrap_or(TierThresholds {
            bronze: 1000,
            silver: 5000,
            gold: 10000,
        })
}

// Tier benefits
pub fn set_tier_benefits(env: &Env, tier: &Tier, benefits: &TierBenefits) {
    env.storage()
        .instance()
        .set(&DataKey::TierBenefits(tier.clone()), benefits);
}

pub fn get_tier_benefits(env: &Env, tier: &Tier) -> TierBenefits {
    env.storage()
        .instance()
        .get(&DataKey::TierBenefits(tier.clone()))
        .unwrap_or(TierBenefits { multiplier: 10000 }) // Default 1.0x
}

// User tier management
pub fn set_user_tier(env: &Env, user: &Address, tier: &Tier) {
    let key = DataKey::UserTier(user.clone());
    let user_info = UserTierInfo {
        current_tier: tier.clone(),
        last_updated: env.ledger().timestamp(),
    };

    env.storage().persistent().set(&key, &user_info);
    env.storage()
        .persistent()
        .extend_ttl(&key, INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

pub fn get_user_tier(env: &Env, user: &Address) -> Tier {
    let key = DataKey::UserTier(user.clone());

    if let Some(user_info) = env
        .storage()
        .persistent()
        .get::<DataKey, UserTierInfo>(&key)
    {
        env.storage().persistent().extend_ttl(
            &key,
            INSTANCE_LIFETIME_THRESHOLD,
            INSTANCE_BUMP_AMOUNT,
        );
        user_info.current_tier
    } else {
        Tier::None
    }
}

// Tier history
pub fn add_tier_history(env: &Env, user: &Address, tier: &Tier, token_balance: i128) {
    let key = DataKey::TierHistory(user.clone());
    let mut history = get_tier_history(env, user);

    let entry = TierHistoryEntry {
        tier: tier.clone(),
        timestamp: env.ledger().timestamp(),
        token_balance,
    };

    history.push_back(entry);

    // Keep only last 50 entries to manage storage
    if history.len() > 50 {
        history.pop_front();
    }

    env.storage().persistent().set(&key, &history);
    env.storage()
        .persistent()
        .extend_ttl(&key, INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

pub fn get_tier_history(env: &Env, user: &Address) -> Vec<TierHistoryEntry> {
    let key = DataKey::TierHistory(user.clone());

    if let Some(history) = env
        .storage()
        .persistent()
        .get::<DataKey, Vec<TierHistoryEntry>>(&key)
    {
        env.storage().persistent().extend_ttl(
            &key,
            INSTANCE_LIFETIME_THRESHOLD,
            INSTANCE_BUMP_AMOUNT,
        );
        history
    } else {
        Vec::new(env)
    }
}
