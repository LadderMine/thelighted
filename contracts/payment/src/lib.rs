//! # Payment Contract
//!
//! Escrow-based payment processing for the restaurant ordering platform.
//!
//! ## Flow
//! ```text
//! Customer                   Contract                    Restaurant
//!     │                          │                            │
//!     │── escrow_payment() ─────►│  (holds token funds)      │
//!     │                          │                            │
//!     │                          │◄── release_payment() ──────│
//!     │                          │──── transfer to wallet ───►│
//!     │                          │
//!     │     OR (dispute / cancel)│
//!     │◄── refund_payment() ─────│  (admin only)
//! ```
//!
//! Supports any SEP-41 token (XLM native wrapper, USDC, etc.).
//!
//! ## Roles
//! - **Admin** – can release or refund any payment; set fee bps.
//! - **Restaurant wallet** – may call `release_payment` for their own orders.
//! - **Customer** – escrows funds; cannot self-release (prevents fraud).

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Status of a payment record.
#[contracttype]
#[derive(Clone, PartialEq)]
pub enum PaymentStatus {
    /// Funds held in escrow on this contract.
    Escrowed,
    /// Funds released to the restaurant wallet.
    Released,
    /// Funds returned to the customer.
    Refunded,
}

/// A single payment record, keyed by order ID.
#[contracttype]
#[derive(Clone)]
pub struct Payment {
    /// Matches the order ID from the Order contract.
    pub order_id: u64,
    /// Customer who escrowed the funds.
    pub payer: Address,
    /// Restaurant's receiving wallet.
    pub restaurant_wallet: Address,
    /// SEP-41 token contract address (use XLM native wrapper or USDC).
    pub token: Address,
    /// Amount in the token's smallest unit (stroops for XLM).
    pub amount: i128,
    /// Platform fee taken at release (in the same token unit).
    pub fee_amount: i128,
    pub status: PaymentStatus,
    pub created_at: u64,
    pub settled_at: u64,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
pub enum DataKey {
    Admin,
    /// Treasury address that receives platform fees.
    Treasury,
    /// Fee in basis points (100 bps = 1 %). Default: 100 (1 %).
    FeeBps,
    Payment(u64),
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct PaymentContract;

#[contractimpl]
impl PaymentContract {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// Deploy the payment contract.
    ///
    /// # Arguments
    /// - `admin`    – full-control address (platform operator).
    /// - `treasury` – wallet that receives platform fees.
    /// - `fee_bps`  – platform fee in basis points (e.g. 100 = 1 %).
    pub fn initialize(env: Env, admin: Address, treasury: Address, fee_bps: u32) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        if fee_bps > 1_000 {
            // cap at 10 %
            panic!("fee cannot exceed 1000 bps");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
        env.storage().instance().extend_ttl(17_280, 17_280);
    }

    // -----------------------------------------------------------------------
    // Customer action
    // -----------------------------------------------------------------------

    /// Lock funds in escrow for a specific order.
    ///
    /// The customer must approve this contract to spend `amount` of `token`
    /// before calling this function (standard SEP-41 allowance flow).
    ///
    /// # Arguments
    /// - `payer`              – customer wallet (must sign).
    /// - `order_id`           – ID from the Order contract.
    /// - `restaurant_wallet`  – receiving wallet of the restaurant.
    /// - `token`              – SEP-41 token contract address.
    /// - `amount`             – gross amount **before** platform fee deduction.
    pub fn escrow_payment(
        env: Env,
        payer: Address,
        order_id: u64,
        restaurant_wallet: Address,
        token_address: Address,
        amount: i128,
    ) {
        payer.require_auth();

        if env.storage().persistent().has(&DataKey::Payment(order_id)) {
            panic!("payment already exists for this order");
        }
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let fee_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::FeeBps)
            .unwrap_or(0);
        let fee_amount: i128 = (amount * fee_bps as i128) / 10_000;

        // Pull funds from payer into this contract.
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&payer, &env.current_contract_address(), &amount);

        let now = env.ledger().timestamp();
        let payment = Payment {
            order_id,
            payer: payer.clone(),
            restaurant_wallet: restaurant_wallet.clone(),
            token: token_address.clone(),
            amount,
            fee_amount,
            status: PaymentStatus::Escrowed,
            created_at: now,
            settled_at: 0,
        };

        let ttl: u32 = 2_073_600;
        env.storage()
            .persistent()
            .set(&DataKey::Payment(order_id), &payment);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Payment(order_id), ttl, ttl);

        env.storage().instance().extend_ttl(17_280, 17_280);

        env.events().publish(
            (symbol_short!("escrowed"), symbol_short!("pay")),
            (order_id, payer, amount),
        );
    }

    // -----------------------------------------------------------------------
    // Release / Refund (admin or restaurant wallet)
    // -----------------------------------------------------------------------

    /// Release escrowed funds to the restaurant.
    ///
    /// Callable by the admin or the restaurant wallet recorded in the payment.
    /// The platform fee is sent to the treasury; the remainder goes to the
    /// restaurant wallet.
    pub fn release_payment(env: Env, caller: Address, order_id: u64) {
        caller.require_auth();

        let mut payment: Payment = env
            .storage()
            .persistent()
            .get(&DataKey::Payment(order_id))
            .unwrap_or_else(|| panic!("payment not found"));

        if payment.status != PaymentStatus::Escrowed {
            panic!("payment is not in escrow");
        }

        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if caller != admin && caller != payment.restaurant_wallet {
            panic!("unauthorized");
        }

        let token_client = token::Client::new(&env, &payment.token);
        let net_amount = payment.amount - payment.fee_amount;

        // Send net amount to restaurant.
        token_client.transfer(
            &env.current_contract_address(),
            &payment.restaurant_wallet,
            &net_amount,
        );

        // Send fee to treasury.
        if payment.fee_amount > 0 {
            let treasury: Address = env.storage().instance().get(&DataKey::Treasury).unwrap();
            token_client.transfer(
                &env.current_contract_address(),
                &treasury,
                &payment.fee_amount,
            );
        }

        payment.status = PaymentStatus::Released;
        payment.settled_at = env.ledger().timestamp();

        let ttl: u32 = 2_073_600;
        env.storage()
            .persistent()
            .set(&DataKey::Payment(order_id), &payment);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Payment(order_id), ttl, ttl);

        env.events().publish(
            (symbol_short!("released"), symbol_short!("pay")),
            (order_id, net_amount),
        );
    }

    /// Refund the escrowed amount in full to the customer (admin only).
    ///
    /// Used when an order is cancelled or disputed.
    pub fn refund_payment(env: Env, caller: Address, order_id: u64) {
        caller.require_auth();
        Self::assert_admin_or_panic(&env, &caller);

        let mut payment: Payment = env
            .storage()
            .persistent()
            .get(&DataKey::Payment(order_id))
            .unwrap_or_else(|| panic!("payment not found"));

        if payment.status != PaymentStatus::Escrowed {
            panic!("payment is not in escrow");
        }

        let token_client = token::Client::new(&env, &payment.token);

        // Return full amount to payer.
        token_client.transfer(
            &env.current_contract_address(),
            &payment.payer,
            &payment.amount,
        );

        payment.status = PaymentStatus::Refunded;
        payment.settled_at = env.ledger().timestamp();

        let ttl: u32 = 2_073_600;
        env.storage()
            .persistent()
            .set(&DataKey::Payment(order_id), &payment);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Payment(order_id), ttl, ttl);

        env.events().publish(
            (symbol_short!("refunded"), symbol_short!("pay")),
            (order_id, payment.amount),
        );
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    /// Update the platform fee (admin only).
    pub fn set_fee_bps(env: Env, caller: Address, fee_bps: u32) {
        caller.require_auth();
        Self::assert_admin_or_panic(&env, &caller);
        if fee_bps > 1_000 {
            panic!("fee cannot exceed 1000 bps");
        }
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
        env.storage().instance().extend_ttl(17_280, 17_280);
    }

    /// Transfer the admin role to a new address.
    pub fn transfer_admin(env: Env, caller: Address, new_admin: Address) {
        caller.require_auth();
        Self::assert_admin_or_panic(&env, &caller);
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        env.storage().instance().extend_ttl(17_280, 17_280);
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    /// Fetch a payment record.
    pub fn get_payment(env: Env, order_id: u64) -> Payment {
        env.storage()
            .persistent()
            .get(&DataKey::Payment(order_id))
            .unwrap_or_else(|| panic!("payment not found"))
    }

    /// Current platform fee in basis points.
    pub fn fee_bps(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0)
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    fn assert_admin_or_panic(env: &Env, caller: &Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if caller != &admin {
            panic!("unauthorized: admin only");
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, MockAuth, MockAuthInvoke};
    use soroban_sdk::{token, Env, IntoVal};

    /// Helper: create a token contract and mint `amount` to `recipient`.
    fn create_token(
        env: &Env,
        admin: &Address,
    ) -> (Address, token::StellarAssetClient<'_>) {
        let token_addr = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let sac = token::StellarAssetClient::new(env, &token_addr);
        (token_addr, sac)
    }

    fn setup() -> (Env, PaymentContractClient<'static>, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register_contract(None, PaymentContract);
        let client = PaymentContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury, &100u32); // 1 % fee
        (env, client, admin, treasury, cid)
    }

    #[test]
    fn test_escrow_and_release() {
        let (env, client, admin, treasury, contract_id) = setup();
        let token_admin = Address::generate(&env);
        let payer = Address::generate(&env);
        let restaurant = Address::generate(&env);

        let (token_addr, sac) = create_token(&env, &token_admin);
        // Mint 100 XLM (stroops) to payer.
        sac.mint(&payer, &100_000_000);

        let amount: i128 = 50_000_000; // 5 XLM
        client.escrow_payment(&payer, &1, &restaurant, &token_addr, &amount);

        let payment = client.get_payment(&1);
        assert_eq!(payment.status, PaymentStatus::Escrowed);
        assert_eq!(payment.amount, amount);

        client.release_payment(&admin, &1);
        let payment = client.get_payment(&1);
        assert_eq!(payment.status, PaymentStatus::Released);

        let token_client = token::Client::new(&env, &token_addr);
        // Restaurant receives 99 % of 5 XLM = 4.95 XLM = 49_500_000 stroops.
        assert_eq!(token_client.balance(&restaurant), 49_500_000);
        // Treasury receives 1 % = 0.05 XLM = 500_000 stroops.
        assert_eq!(token_client.balance(&treasury), 500_000);
    }

    #[test]
    fn test_refund() {
        let (env, client, admin, _treasury, _contract_id) = setup();
        let token_admin = Address::generate(&env);
        let payer = Address::generate(&env);
        let restaurant = Address::generate(&env);

        let (token_addr, sac) = create_token(&env, &token_admin);
        sac.mint(&payer, &50_000_000);

        client.escrow_payment(&payer, &2, &restaurant, &token_addr, &50_000_000);
        client.refund_payment(&admin, &2);

        let token_client = token::Client::new(&env, &token_addr);
        assert_eq!(token_client.balance(&payer), 50_000_000);
    }

    #[test]
    #[should_panic(expected = "payment already exists for this order")]
    fn test_double_escrow_panics() {
        let (env, client, _admin, _treasury, _cid) = setup();
        let token_admin = Address::generate(&env);
        let payer = Address::generate(&env);
        let restaurant = Address::generate(&env);

        let (token_addr, sac) = create_token(&env, &token_admin);
        sac.mint(&payer, &100_000_000);

        client.escrow_payment(&payer, &3, &restaurant, &token_addr, &20_000_000);
        client.escrow_payment(&payer, &3, &restaurant, &token_addr, &20_000_000);
    }
}
