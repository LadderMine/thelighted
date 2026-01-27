#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env, Vec};

mod errors;
mod events;
mod storage;
mod types;

#[cfg(test)]
mod test;

use errors::MembershipError;
use types::{Tier, TierBenefits, TierThresholds};

#[contract]
pub struct MembershipTiersContract;

#[contractimpl]
impl MembershipTiersContract {
    /// Initialize the contract with default tier thresholds
    pub fn initialize(env: Env, admin: Address) -> Result<(), MembershipError> {
        admin.require_auth();

        if storage::has_admin(&env) {
            return Err(MembershipError::AlreadyInitialized);
        }

        storage::set_admin(&env, &admin);

        // Set default thresholds
        let thresholds = TierThresholds {
            bronze: 1000, // 1000 tokens for Bronze
            silver: 5000, // 5000 tokens for Silver
            gold: 10000,  // 10000 tokens for Gold
        };
        storage::set_tier_thresholds(&env, &thresholds);

        // Set default benefits (multipliers as basis points, 10000 = 1.0x)
        storage::set_tier_benefits(&env, &Tier::Bronze, &TierBenefits { multiplier: 10000 });
        storage::set_tier_benefits(&env, &Tier::Silver, &TierBenefits { multiplier: 12000 }); // 1.2x
        storage::set_tier_benefits(&env, &Tier::Gold, &TierBenefits { multiplier: 15000 }); // 1.5x

        Ok(())
    }

    /// Set tier thresholds (only admin)
    pub fn set_tier_thresholds(
        env: Env,
        admin: Address,
        bronze: i128,
        silver: i128,
        gold: i128,
    ) -> Result<(), MembershipError> {
        admin.require_auth();

        if !storage::is_admin(&env, &admin) {
            return Err(MembershipError::Unauthorized);
        }

        if bronze >= silver || silver >= gold {
            return Err(MembershipError::InvalidThresholds);
        }

        let thresholds = TierThresholds {
            bronze,
            silver,
            gold,
        };
        storage::set_tier_thresholds(&env, &thresholds);

        events::emit_thresholds_updated(&env, &thresholds);

        Ok(())
    }

    /// Set tier benefits (only admin)
    pub fn set_tier_benefits(
        env: Env,
        admin: Address,
        tier: Tier,
        benefits: TierBenefits,
    ) -> Result<(), MembershipError> {
        admin.require_auth();

        if !storage::is_admin(&env, &admin) {
            return Err(MembershipError::Unauthorized);
        }

        storage::set_tier_benefits(&env, &tier, &benefits);
        events::emit_benefits_updated(&env, &tier, &benefits);

        Ok(())
    }

    /// Get user's current tier based on token balance
    pub fn get_user_tier(env: Env, _user: Address, token_balance: i128) -> Tier {
        let thresholds = storage::get_tier_thresholds(&env);

        if token_balance >= thresholds.gold {
            Tier::Gold
        } else if token_balance >= thresholds.silver {
            Tier::Silver
        } else if token_balance >= thresholds.bronze {
            Tier::Bronze
        } else {
            Tier::None
        }
    }

    /// Update user's tier and track history
    pub fn update_tier(
        env: Env,
        user: Address,
        token_balance: i128,
    ) -> Result<Tier, MembershipError> {
        let new_tier = Self::get_user_tier(env.clone(), user.clone(), token_balance);
        let current_tier = storage::get_user_tier(&env, &user);

        if new_tier != current_tier {
            storage::set_user_tier(&env, &user, &new_tier);
            storage::add_tier_history(&env, &user, &new_tier, token_balance);
            events::emit_tier_changed(&env, &user, &current_tier, &new_tier, token_balance);
        }

        Ok(new_tier)
    }

    /// Get tier benefits
    pub fn get_tier_benefits(env: Env, tier: Tier) -> TierBenefits {
        storage::get_tier_benefits(&env, &tier)
    }

    /// Get tier thresholds
    pub fn get_tier_thresholds(env: Env) -> TierThresholds {
        storage::get_tier_thresholds(&env)
    }

    /// Get user's tier history
    pub fn get_tier_history(env: Env, user: Address) -> Vec<types::TierHistoryEntry> {
        storage::get_tier_history(&env, &user)
    }

    /// Get current user tier (without balance parameter)
    pub fn get_current_user_tier(env: Env, user: Address) -> Tier {
        storage::get_user_tier(&env, &user)
    }
}
