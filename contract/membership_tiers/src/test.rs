#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};
use types::{Tier, TierBenefits};

#[test]
fn test_initialize() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MembershipTiersContract);
    let client = MembershipTiersContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);

    // Mock authentication for the admin
    env.mock_all_auths();

    // Initialize contract
    client.initialize(&admin);

    // Check default thresholds
    let thresholds = client.get_tier_thresholds();
    assert_eq!(thresholds.bronze, 1000);
    assert_eq!(thresholds.silver, 5000);
    assert_eq!(thresholds.gold, 10000);

    // Check default benefits
    let bronze_benefits = client.get_tier_benefits(&Tier::Bronze);
    let silver_benefits = client.get_tier_benefits(&Tier::Silver);
    let gold_benefits = client.get_tier_benefits(&Tier::Gold);

    assert_eq!(bronze_benefits.multiplier, 10000); // 1.0x
    assert_eq!(silver_benefits.multiplier, 12000); // 1.2x
    assert_eq!(gold_benefits.multiplier, 15000); // 1.5x
}

#[test]
fn test_tier_calculation() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MembershipTiersContract);
    let client = MembershipTiersContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    // Test tier calculations
    assert_eq!(client.get_user_tier(&user, &500), Tier::None);
    assert_eq!(client.get_user_tier(&user, &1000), Tier::Bronze);
    assert_eq!(client.get_user_tier(&user, &3000), Tier::Bronze);
    assert_eq!(client.get_user_tier(&user, &5000), Tier::Silver);
    assert_eq!(client.get_user_tier(&user, &7500), Tier::Silver);
    assert_eq!(client.get_user_tier(&user, &10000), Tier::Gold);
    assert_eq!(client.get_user_tier(&user, &15000), Tier::Gold);
}

#[test]
fn test_update_tier() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MembershipTiersContract);
    let client = MembershipTiersContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    // Initial tier should be None
    assert_eq!(client.get_current_user_tier(&user), Tier::None);

    // Update to Bronze
    let tier = client.update_tier(&user, &1500);
    assert_eq!(tier, Tier::Bronze);
    assert_eq!(client.get_current_user_tier(&user), Tier::Bronze);

    // Update to Silver
    let tier = client.update_tier(&user, &6000);
    assert_eq!(tier, Tier::Silver);
    assert_eq!(client.get_current_user_tier(&user), Tier::Silver);

    // Update to Gold
    let tier = client.update_tier(&user, &12000);
    assert_eq!(tier, Tier::Gold);
    assert_eq!(client.get_current_user_tier(&user), Tier::Gold);

    // Check history
    let history = client.get_tier_history(&user);
    assert_eq!(history.len(), 3);
}

#[test]
fn test_set_tier_thresholds() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MembershipTiersContract);
    let client = MembershipTiersContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let non_admin = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    // Admin can set thresholds
    client.set_tier_thresholds(&admin, &2000, &8000, &15000);

    let thresholds = client.get_tier_thresholds();
    assert_eq!(thresholds.bronze, 2000);
    assert_eq!(thresholds.silver, 8000);
    assert_eq!(thresholds.gold, 15000);

    // Non-admin cannot set thresholds
    let result = client.try_set_tier_thresholds(&non_admin, &1000, &5000, &10000);
    assert!(result.is_err());
}

#[test]
fn test_set_tier_benefits() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MembershipTiersContract);
    let client = MembershipTiersContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    // Set custom benefits
    let custom_benefits = TierBenefits { multiplier: 13000 }; // 1.3x
    client.set_tier_benefits(&admin, &Tier::Silver, &custom_benefits);

    let benefits = client.get_tier_benefits(&Tier::Silver);
    assert_eq!(benefits.multiplier, 13000);
}

#[test]
fn test_invalid_thresholds() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MembershipTiersContract);
    let client = MembershipTiersContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    // Invalid thresholds (bronze >= silver) should return error
    let result = client.try_set_tier_thresholds(&admin, &5000, &3000, &10000);
    assert!(result.is_err());
}

#[test]
fn test_double_initialization() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MembershipTiersContract);
    let client = MembershipTiersContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    // Second initialization should fail
    let result = client.try_initialize(&admin);
    assert!(result.is_err());
}
