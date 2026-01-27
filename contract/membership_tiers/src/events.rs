use crate::types::{Tier, TierBenefits, TierThresholds};
use soroban_sdk::{symbol_short, Address, Env};

pub fn emit_tier_changed(
    env: &Env,
    user: &Address,
    old_tier: &Tier,
    new_tier: &Tier,
    token_balance: i128,
) {
    env.events().publish(
        (symbol_short!("tier_chg"),),
        (
            user.clone(),
            old_tier.clone(),
            new_tier.clone(),
            token_balance,
        ),
    );
}

pub fn emit_thresholds_updated(env: &Env, thresholds: &TierThresholds) {
    env.events().publish(
        (symbol_short!("thresh_up"),),
        (thresholds.bronze, thresholds.silver, thresholds.gold),
    );
}

pub fn emit_benefits_updated(env: &Env, tier: &Tier, benefits: &TierBenefits) {
    env.events().publish(
        (symbol_short!("ben_up"),),
        (tier.clone(), benefits.multiplier),
    );
}
