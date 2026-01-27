#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env};

// Mock token contract for testing
#[contract]
pub struct MockToken;

#[contractimpl]
impl MockToken {
    pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) -> bool {
        true
    }
}

#[test]
fn test_initialize() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenVestingContract);
    let client = TokenVestingContractClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let token_address = Address::generate(&env);
    
    env.mock_all_auths();
    
    // Initialize contract
    client.initialize(&admin, &token_address);
    
    // Should not be able to initialize twice
    let result = client.try_initialize(&admin, &token_address);
    assert!(result.is_err());
}

#[test]
fn test_create_vesting_schedule() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenVestingContract);
    let client = TokenVestingContractClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let token_address = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    env.mock_all_auths();
    client.initialize(&admin, &token_address);
    
    let total_amount = 1000i128;
    let start_time = env.ledger().timestamp() + 100; // Future start time
    let duration = 365 * 24 * 3600; // 1 year in seconds
    let cliff = 90 * 24 * 3600; // 90 days cliff
    
    let schedule_id = client.create_vesting(
        &admin,
        &recipient,
        &total_amount,
        &start_time,
        &duration,
        &cliff,
    );
    
    assert_eq!(schedule_id, 1);
    
    // Verify schedule was created
    let schedule = client.get_vesting_schedule(&schedule_id);
    assert_eq!(schedule.recipient, recipient);
    assert_eq!(schedule.total_amount, total_amount);
    assert_eq!(schedule.start_time, start_time);
    assert_eq!(schedule.duration, duration);
    assert_eq!(schedule.cliff, cliff);
    assert_eq!(schedule.claimed_amount, 0);
    assert_eq!(schedule.cancelled, false);
}

#[test]
fn test_invalid_vesting_parameters() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenVestingContract);
    let client = TokenVestingContractClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let token_address = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    env.mock_all_auths();
    client.initialize(&admin, &token_address);
    
    let start_time = env.ledger().timestamp() + 100;
    
    // Test invalid amount
    let result = client.try_create_vesting(&admin, &recipient, &0, &start_time, &1000, &100);
    assert!(result.is_err());
    
    // Test invalid duration
    let result = client.try_create_vesting(&admin, &recipient, &1000, &start_time, &0, &100);
    assert!(result.is_err());
    
    // Test invalid cliff (longer than duration)
    let result = client.try_create_vesting(&admin, &recipient, &1000, &start_time, &100, &200);
    assert!(result.is_err());
    
    // Test past start time
    let current_time = env.ledger().timestamp();
    if current_time > 100 {
        let past_time = current_time - 100;
        let result = client.try_create_vesting(&admin, &recipient, &1000, &past_time, &1000, &100);
        assert!(result.is_err());
    }
}

#[test]
fn test_vesting_calculation() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenVestingContract);
    let client = TokenVestingContractClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let token_address = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    env.mock_all_auths();
    client.initialize(&admin, &token_address);
    
    let total_amount = 1000i128;
    let start_time = env.ledger().timestamp();
    let duration = 1000u64; // 1000 seconds for easy calculation
    let cliff = 100u64; // 100 seconds cliff
    
    let _schedule_id = client.create_vesting(
        &admin,
        &recipient,
        &total_amount,
        &start_time,
        &duration,
        &cliff,
    );
    
    // Before cliff - should be 0 vested
    assert_eq!(client.get_vested_amount(&recipient), 0);
    assert_eq!(client.get_claimable_amount(&recipient), 0);
    
    // Jump to after cliff but before full vesting (50% through)
    env.ledger().with_mut(|li| {
        li.timestamp = start_time + 500; // 50% through duration
    });
    
    let vested = client.get_vested_amount(&recipient);
    assert_eq!(vested, 500); // 50% of 1000
    
    // Jump to full vesting
    env.ledger().with_mut(|li| {
        li.timestamp = start_time + duration;
    });
    
    let vested = client.get_vested_amount(&recipient);
    assert_eq!(vested, total_amount); // 100% vested
}

#[test]
fn test_claim_vested_tokens() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenVestingContract);
    let client = TokenVestingContractClient::new(&env, &contract_id);
    
    // Register mock token
    let token_id = env.register_contract(None, MockToken);
    
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    env.mock_all_auths();
    client.initialize(&admin, &token_id);
    
    let total_amount = 1000i128;
    let start_time = env.ledger().timestamp();
    let duration = 1000u64;
    let cliff = 100u64;
    
    client.create_vesting(
        &admin,
        &recipient,
        &total_amount,
        &start_time,
        &duration,
        &cliff,
    );
    
    // Jump to 50% vesting
    env.ledger().with_mut(|li| {
        li.timestamp = start_time + 500;
    });
    
    // Claim vested tokens
    let claimed = client.claim_vested(&recipient);
    assert_eq!(claimed, 500);
    
    // Should not be able to claim again immediately
    let claimed_again = client.claim_vested(&recipient);
    assert_eq!(claimed_again, 0);
    
    // Jump to 75% vesting
    env.ledger().with_mut(|li| {
        li.timestamp = start_time + 750;
    });
    
    // Should be able to claim additional 25%
    let claimed_additional = client.claim_vested(&recipient);
    assert_eq!(claimed_additional, 250);
}

#[test]
fn test_cancel_vesting() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenVestingContract);
    let client = TokenVestingContractClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let token_address = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    env.mock_all_auths();
    client.initialize(&admin, &token_address);
    
    let total_amount = 1000i128;
    let start_time = env.ledger().timestamp();
    let duration = 1000u64;
    let cliff = 100u64;
    
    let schedule_id = client.create_vesting(
        &admin,
        &recipient,
        &total_amount,
        &start_time,
        &duration,
        &cliff,
    );
    
    // Jump to 50% vesting
    env.ledger().with_mut(|li| {
        li.timestamp = start_time + 500;
    });
    
    // Cancel vesting - should return 50% unvested
    let unvested = client.cancel_vesting(&admin, &schedule_id);
    assert_eq!(unvested, 500);
    
    // Verify schedule is cancelled
    let schedule = client.get_vesting_schedule(&schedule_id);
    assert_eq!(schedule.cancelled, true);
    
    // Should not be able to cancel again
    let result = client.try_cancel_vesting(&admin, &schedule_id);
    assert!(result.is_err());
    
    // Vested amount should now be 0 for cancelled schedule
    assert_eq!(client.get_vested_amount(&recipient), 0);
}

#[test]
fn test_multiple_vesting_schedules() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenVestingContract);
    let client = TokenVestingContractClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let token_address = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    env.mock_all_auths();
    client.initialize(&admin, &token_address);
    
    let start_time = env.ledger().timestamp();
    
    // Create multiple vesting schedules
    let schedule1 = client.create_vesting(&admin, &recipient, &1000, &start_time, &1000, &100);
    let schedule2 = client.create_vesting(&admin, &recipient, &2000, &start_time, &2000, &200);
    
    assert_eq!(schedule1, 1);
    assert_eq!(schedule2, 2);
    
    // Jump to 50% through first schedule, 25% through second
    env.ledger().with_mut(|li| {
        li.timestamp = start_time + 500;
    });
    
    // Total vested should be sum of both schedules
    let total_vested = client.get_vested_amount(&recipient);
    assert_eq!(total_vested, 500 + 500); // 50% of 1000 + 25% of 2000
    
    // Get user vesting info
    let vesting_info = client.get_user_vesting_info(&recipient);
    assert_eq!(vesting_info.len(), 2);
}

#[test]
fn test_unauthorized_access() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenVestingContract);
    let client = TokenVestingContractClient::new(&env, &contract_id);
    
    let admin = Address::generate(&env);
    let non_admin = Address::generate(&env);
    let token_address = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    env.mock_all_auths();
    client.initialize(&admin, &token_address);
    
    // Non-admin should not be able to create vesting
    let result = client.try_create_vesting(
        &non_admin,
        &recipient,
        &1000,
        &(env.ledger().timestamp() + 100),
        &1000,
        &100,
    );
    assert!(result.is_err());
    
    // Create a schedule as admin
    let schedule_id = client.create_vesting(
        &admin,
        &recipient,
        &1000,
        &(env.ledger().timestamp() + 100),
        &1000,
        &100,
    );
    
    // Non-admin should not be able to cancel vesting
    let result = client.try_cancel_vesting(&non_admin, &schedule_id);
    assert!(result.is_err());
}