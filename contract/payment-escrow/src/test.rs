// contract/payment-escrow/src/test.rs
#![cfg(test)]

use crate::{OrderEscrowContract, OrderEscrowContractClient, Escrow, EscrowStatus};
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token::{Client as TokenClient, StellarAssetClient as TokenAdminClient},
    Address, Env, String,
};

fn create_token_contract<'a>(e: &Env, admin: &Address) -> (TokenClient<'a>, TokenAdminClient<'a>) {
    let contract_address = e.register_stellar_asset_contract(admin.clone());
    (
        TokenClient::new(e, &contract_address),
        TokenAdminClient::new(e, &contract_address),
    )
}

fn setup_test_env() -> (Env, Address, Address, Address, TokenClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    let customer = Address::generate(&env);
    let restaurant = Address::generate(&env);
    let admin = Address::generate(&env);

    let (token, token_admin) = create_token_contract(&env, &admin);
    
    // Mint tokens to customer
    token_admin.mint(&customer, &10000);

    (env, customer, restaurant, admin, token)
}

#[test]
fn test_create_escrow_success() {
    let (env, customer, restaurant, _admin, token) = setup_test_env();
    let contract_id = env.register_contract(None, OrderEscrowContract);
    let client = OrderEscrowContractClient::new(&env, &contract_id);

    let order_id = 1u64;
    let amount = 1000i128;

    // Create escrow
    client.create_escrow(&order_id, &customer, &restaurant, &amount, &token.address);

    // Verify escrow details
    let escrow = client.get_escrow_details(&order_id);
    assert_eq!(escrow.customer, customer);
    assert_eq!(escrow.restaurant, restaurant);
    assert_eq!(escrow.amount, amount);
    assert_eq!(escrow.status, EscrowStatus::Locked);

    // Verify funds transferred to contract
    assert_eq!(token.balance(&contract_id), amount);
    assert_eq!(token.balance(&customer), 10000 - amount);
}

#[test]
#[should_panic(expected = "Order ID already exists")]
fn test_create_escrow_duplicate() {
    let (env, customer, restaurant, _admin, token) = setup_test_env();
    let contract_id = env.register_contract(None, OrderEscrowContract);
    let client = OrderEscrowContractClient::new(&env, &contract_id);

    let order_id = 1u64;
    let amount = 1000i128;

    client.create_escrow(&order_id, &customer, &restaurant, &amount, &token.address);
    // Try to create again - should panic
    client.create_escrow(&order_id, &customer, &restaurant, &amount, &token.address);
}

#[test]
fn test_complete_order_success() {
    let (env, customer, restaurant, _admin, token) = setup_test_env();
    let contract_id = env.register_contract(None, OrderEscrowContract);
    let client = OrderEscrowContractClient::new(&env, &contract_id);

    let order_id = 1u64;
    let amount = 1000i128;

    // Create escrow
    client.create_escrow(&order_id, &customer, &restaurant, &amount, &token.address);

    // Complete order
    client.complete_order(&order_id);

    // Verify status changed
    let escrow = client.get_escrow_details(&order_id);
    assert_eq!(escrow.status, EscrowStatus::Completed);

    // Verify funds transferred to restaurant
    assert_eq!(token.balance(&restaurant), amount);
    assert_eq!(token.balance(&contract_id), 0);
}

#[test]
#[should_panic(expected = "Escrow is not in a locked state")]
fn test_complete_order_already_completed() {
    let (env, customer, restaurant, _admin, token) = setup_test_env();
    let contract_id = env.register_contract(None, OrderEscrowContract);
    let client = OrderEscrowContractClient::new(&env, &contract_id);

    let order_id = 1u64;
    let amount = 1000i128;

    client.create_escrow(&order_id, &customer, &restaurant, &amount, &token.address);
    client.complete_order(&order_id);
    
    // Try to complete again - should panic
    client.complete_order(&order_id);
}

#[test]
fn test_cancel_order_before_timeout_with_restaurant_auth() {
    let (env, customer, restaurant, _admin, token) = setup_test_env();
    let contract_id = env.register_contract(None, OrderEscrowContract);
    let client = OrderEscrowContractClient::new(&env, &contract_id);

    let order_id = 1u64;
    let amount = 1000i128;

    client.create_escrow(&order_id, &customer, &restaurant, &amount, &token.address);

    // Cancel before timeout (requires restaurant auth)
    client.cancel_order(&order_id);

    // Verify refund
    let escrow = client.get_escrow_details(&order_id);
    assert_eq!(escrow.status, EscrowStatus::Refunded);
    assert_eq!(token.balance(&customer), 10000); // Full refund
    assert_eq!(token.balance(&contract_id), 0);
}

#[test]
fn test_cancel_order_after_timeout() {
    let (env, customer, restaurant, _admin, token) = setup_test_env();
    let contract_id = env.register_contract(None, OrderEscrowContract);
    let client = OrderEscrowContractClient::new(&env, &contract_id);

    let order_id = 1u64;
    let amount = 1000i128;

    client.create_escrow(&order_id, &customer, &restaurant, &amount, &token.address);

    // Fast forward time by 25 hours (past 24 hour expiry)
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp + (25 * 60 * 60);
    });

    // Cancel after timeout (anyone can trigger)
    client.cancel_order(&order_id);

    // Verify refund
    let escrow = client.get_escrow_details(&order_id);
    assert_eq!(escrow.status, EscrowStatus::Refunded);
    assert_eq!(token.balance(&customer), 10000);
}

#[test]
fn test_partial_refund_success() {
    let (env, customer, restaurant, _admin, token) = setup_test_env();
    let contract_id = env.register_contract(None, OrderEscrowContract);
    let client = OrderEscrowContractClient::new(&env, &contract_id);

    let order_id = 1u64;
    let amount = 1000i128;
    let refund_amount = 300i128;

    client.create_escrow(&order_id, &customer, &restaurant, &amount, &token.address);

    // Partial refund
    client.partial_refund(&order_id, &refund_amount);

    // Verify status and balances
    let escrow = client.get_escrow_details(&order_id);
    assert_eq!(escrow.status, EscrowStatus::PartialRefunded);
    
    // Customer gets refund
    assert_eq!(token.balance(&customer), 10000 - amount + refund_amount);
    // Restaurant gets remainder
    assert_eq!(token.balance(&restaurant), amount - refund_amount);
    assert_eq!(token.balance(&contract_id), 0);
}

#[test]
#[should_panic(expected = "Partial refund cannot exceed total amount")]
fn test_partial_refund_exceeds_amount() {
    let (env, customer, restaurant, _admin, token) = setup_test_env();
    let contract_id = env.register_contract(None, OrderEscrowContract);
    let client = OrderEscrowContractClient::new(&env, &contract_id);

    let order_id = 1u64;
    let amount = 1000i128;

    client.create_escrow(&order_id, &customer, &restaurant, &amount, &token.address);

    // Try to refund more than total
    client.partial_refund(&order_id, &1000); // Should panic (needs to be < amount)
}

#[test]
#[should_panic(expected = "Order not found")]
fn test_get_nonexistent_order() {
    let env = Env::default();
    let contract_id = env.register_contract(None, OrderEscrowContract);
    let client = OrderEscrowContractClient::new(&env, &contract_id);

    client.get_escrow_details(&999u64);
}

#[test]
fn test_escrow_expiry_set_correctly() {
    let (env, customer, restaurant, _admin, token) = setup_test_env();
    let contract_id = env.register_contract(None, OrderEscrowContract);
    let client = OrderEscrowContractClient::new(&env, &contract_id);

    let order_id = 1u64;
    let amount = 1000i128;
    
    let start_time = env.ledger().timestamp();
    
    client.create_escrow(&order_id, &customer, &restaurant, &amount, &token.address);

    let escrow = client.get_escrow_details(&order_id);
    
    // Verify expiry is 24 hours from creation
    assert_eq!(escrow.expiry, start_time + (24 * 60 * 60));
    assert_eq!(escrow.created_at, start_time);
}