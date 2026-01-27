// contract/payment-escrow/src/lib.rs
#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env,
};

const TWENTY_FOUR_HOURS: u64 = 24 * 60 * 60; // 24 hours in seconds
const STORAGE_LIFETIME_THRESHOLD: u32 = 518400; // ~60 days
const STORAGE_BUMP_AMOUNT: u32 = 1036800; // ~120 days

#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum EscrowStatus {
    Locked = 1,
    Completed = 2,
    Refunded = 3,
    PartialRefunded = 4,
}

#[contracttype]
#[derive(Clone)]
pub struct Escrow {
    pub customer: Address,
    pub restaurant: Address,
    pub amount: i128,
    pub asset: Address,
    pub status: EscrowStatus,
    pub created_at: u64,
    pub expiry: u64,
}

#[contract]
pub struct OrderEscrowContract;

#[contractimpl]
impl OrderEscrowContract {
    
    /// Create a new escrow and lock funds
    /// Note: Customer must approve the contract to transfer tokens beforehand
    pub fn create_escrow(
        env: Env,
        order_id: u64,
        customer: Address,
        restaurant: Address,
        amount: i128,
        asset: Address,
    ) {
        // Authenticate customer to ensure they are initiating this
        customer.require_auth();

        // Validate inputs
        if amount <= 0 {
            panic!("Amount must be positive");
        }

        // Check if order already exists
        if env.storage().persistent().has(&order_id) {
            panic!("Order ID already exists");
        }

        // Transfer funds from customer to this contract
        let token_client = token::Client::new(&env, &asset);
        token_client.transfer(&customer, &env.current_contract_address(), &amount);

        let now = env.ledger().timestamp();
        let expiry = now + TWENTY_FOUR_HOURS;

        let escrow = Escrow {
            customer,
            restaurant,
            amount,
            asset,
            status: EscrowStatus::Locked,
            created_at: now,
            expiry,
        };

        // Store with TTL management
        env.storage().persistent().set(&order_id, &escrow);
        env.storage()
            .persistent()
            .extend_ttl(&order_id, STORAGE_LIFETIME_THRESHOLD, STORAGE_BUMP_AMOUNT);
    }

    /// Release funds to the restaurant
    pub fn complete_order(env: Env, order_id: u64) {
        let mut escrow: Escrow = env.storage().persistent().get(&order_id).expect("Order not found");

        if escrow.status != EscrowStatus::Locked {
            panic!("Escrow is not in a locked state");
        }

        // Customer must sign off to release to restaurant
        escrow.customer.require_auth();

        let token_client = token::Client::new(&env, &escrow.asset);
        token_client.transfer(&env.current_contract_address(), &escrow.restaurant, &escrow.amount);

        escrow.status = EscrowStatus::Completed;
        env.storage().persistent().set(&order_id, &escrow);
        env.storage()
            .persistent()
            .extend_ttl(&order_id, STORAGE_LIFETIME_THRESHOLD, STORAGE_BUMP_AMOUNT);
    }

    /// Full refund to customer (Cancellation or Timeout)
    pub fn cancel_order(env: Env, order_id: u64) {
        let mut escrow: Escrow = env.storage().persistent().get(&order_id).expect("Order not found");

        if escrow.status != EscrowStatus::Locked {
            panic!("Escrow is not in a locked state");
        }

        let now = env.ledger().timestamp();
        
        // Logic:
        // 1. If timeout passed, anyone can trigger refund (permissionless cleanup)
        // 2. If before timeout, Restaurant must agree to cancel (to prevent customer canceling after food is made)
        if now < escrow.expiry {
            escrow.restaurant.require_auth();
        }

        let token_client = token::Client::new(&env, &escrow.asset);
        token_client.transfer(&env.current_contract_address(), &escrow.customer, &escrow.amount);

        escrow.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&order_id, &escrow);
        env.storage()
            .persistent()
            .extend_ttl(&order_id, STORAGE_LIFETIME_THRESHOLD, STORAGE_BUMP_AMOUNT);
    }

    /// Partial refund (e.g., missing items)
    /// Sends `refund_amount` back to customer, remainder to restaurant
    pub fn partial_refund(env: Env, order_id: u64, refund_amount: i128) {
        let mut escrow: Escrow = env.storage().persistent().get(&order_id).expect("Order not found");
        
        // Requires Restaurant auth (they are admitting fault/missing item)
        escrow.restaurant.require_auth();

        if escrow.status != EscrowStatus::Locked {
            panic!("Escrow is not in a locked state");
        }
        
        // Validate refund amount
        if refund_amount <= 0 {
            panic!("Refund amount must be positive");
        }
        if refund_amount >= escrow.amount {
            panic!("Partial refund cannot exceed total amount");
        }

        let token_client = token::Client::new(&env, &escrow.asset);
        let restaurant_amount = escrow.amount - refund_amount;

        // Send refund to customer
        token_client.transfer(&env.current_contract_address(), &escrow.customer, &refund_amount);
        // Send remainder to restaurant
        token_client.transfer(&env.current_contract_address(), &escrow.restaurant, &restaurant_amount);

        escrow.status = EscrowStatus::PartialRefunded;
        env.storage().persistent().set(&order_id, &escrow);
        env.storage()
            .persistent()
            .extend_ttl(&order_id, STORAGE_LIFETIME_THRESHOLD, STORAGE_BUMP_AMOUNT);
    }

    /// Get escrow details for an order
    pub fn get_escrow_details(env: Env, order_id: u64) -> Escrow {
        env.storage().persistent().get(&order_id).expect("Order not found")
    }
}

#[cfg(test)]
mod test;