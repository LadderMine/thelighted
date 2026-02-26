//! # Order Contract
//!
//! Manages food orders placed by customers on the restaurant platform.
//! Orders progress through a well-defined lifecycle and emit events at each
//! transition so that off-chain indexers can stay in sync.
//!
//! ## Order lifecycle
//! ```text
//! Pending ──► Confirmed ──► Preparing ──► Ready ──► Delivered
//!    │              │
//!    └──────────────┴──────────────────────────────► Cancelled
//! ```
//!
//! ## Roles
//! - **Admin** – contract deployer; full control.
//! - **Restaurant owner** – confirms, updates, and marks orders as ready/delivered
//!   for orders belonging to their restaurant.
//! - **Customer** – places an order; can cancel while it is still `Pending`.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, vec, Address, Env, String, Vec,
};

use loyalty_token::Client as LoyaltyTokenClient;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Lifecycle state of an order.
#[contracttype]
#[derive(Clone, PartialEq)]
pub enum OrderStatus {
    Pending,
    Confirmed,
    Preparing,
    Ready,
    Delivered,
    Cancelled,
}

/// A single line-item in an order.
#[contracttype]
#[derive(Clone)]
pub struct OrderItem {
    /// Backend menu-item primary key for cross-system correlation.
    pub menu_item_id: u64,
    /// Snapshot of the item name at time of ordering.
    pub name: String,
    /// Number of portions ordered.
    pub quantity: u32,
    /// Price per unit in stroops (1 XLM = 10 000 000 stroops).
    pub unit_price: i128,
}

/// A complete order stored on-chain.
#[contracttype]
#[derive(Clone)]
pub struct Order {
    pub id: u64,
    pub restaurant_id: u64,
    pub customer: Address,
    pub items: Vec<OrderItem>,
    /// Sum of (quantity * unit_price) for all items, in stroops.
    pub total_amount: i128,
    pub status: OrderStatus,
    pub created_at: u64,
    pub updated_at: u64,
    /// Optional delivery/special instructions.
    pub notes: String,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
pub enum DataKey {
    Admin,
    Count,
    Order(u64),
    /// Ordered list of order IDs for a restaurant (for pagination off-chain).
    RestaurantOrders(u64),
    /// Ordered list of order IDs for a customer.
    CustomerOrders(Address),
    /// Address of the BITE loyalty token contract.
    LoyaltyToken,
    /// Flag to enable/disable reward minting.
    RewardsEnabled,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct OrderContract;

#[contractimpl]
impl OrderContract {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// Deploy and initialise the order contract.
    pub fn initialize(env: Env, admin: Address, loyalty_token: Address, rewards_enabled: bool) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Count, &0u64);
        env.storage().instance().set(&DataKey::LoyaltyToken, &loyalty_token);
        env.storage().instance().set(&DataKey::RewardsEnabled, &rewards_enabled);
        env.storage().instance().extend_ttl(17_280, 17_280);
    }

    // -----------------------------------------------------------------------
    // Customer actions
    // -----------------------------------------------------------------------

    /// Place a new order.
    ///
    /// # Arguments
    /// - `customer`       – wallet placing the order (must sign the tx).
    /// - `restaurant_id`  – target restaurant (registered in the registry).
    /// - `items`          – non-empty list of line items.
    /// - `notes`          – optional delivery / allergy notes.
    ///
    /// # Returns
    /// The auto-assigned order ID.
    pub fn place_order(
        env: Env,
        customer: Address,
        restaurant_id: u64,
        items: Vec<OrderItem>,
        notes: String,
    ) -> u64 {
        customer.require_auth();

        if items.is_empty() {
            panic!("order must contain at least one item");
        }

        // Compute total from items.
        let mut total: i128 = 0;
        for item in items.iter() {
            if item.quantity == 0 {
                panic!("quantity must be greater than zero");
            }
            if item.unit_price <= 0 {
                panic!("unit price must be positive");
            }
            total += item.unit_price * item.quantity as i128;
        }

        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::Count)
            .unwrap_or(0);
        let id: u64 = count + 1;
        let now = env.ledger().timestamp();

        let order = Order {
            id,
            restaurant_id,
            customer: customer.clone(),
            items: items.clone(),
            total_amount: total,
            status: OrderStatus::Pending,
            created_at: now,
            updated_at: now,
            notes,
        };

        let ttl: u32 = 2_073_600;
        env.storage()
            .persistent()
            .set(&DataKey::Order(id), &order);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Order(id), ttl, ttl);

        // Append to restaurant index.
        Self::append_to_list(
            &env,
            DataKey::RestaurantOrders(restaurant_id),
            id,
            ttl,
        );
        // Append to customer index.
        Self::append_to_list(
            &env,
            DataKey::CustomerOrders(customer.clone()),
            id,
            ttl,
        );

        env.storage().instance().set(&DataKey::Count, &id);
        env.storage().instance().extend_ttl(17_280, 17_280);

        env.events().publish(
            (symbol_short!("placed"), symbol_short!("order")),
            (id, restaurant_id, customer, total),
        );

        id
    }

    /// Cancel an order.
    ///
    /// - Customers may cancel while the order is `Pending`.
    /// - The admin may cancel at any time (for dispute resolution).
    pub fn cancel_order(env: Env, caller: Address, order_id: u64) {
        caller.require_auth();

        let mut order = Self::load_order(&env, order_id);
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();

        let is_admin = caller == admin;
        let is_customer = caller == order.customer;

        if !is_admin && !is_customer {
            panic!("unauthorized");
        }

        if order.status == OrderStatus::Delivered {
            panic!("cannot cancel a delivered order");
        }

        if order.status == OrderStatus::Cancelled {
            panic!("order already cancelled");
        }

        if is_customer && order.status != OrderStatus::Pending {
            panic!("customers may only cancel pending orders");
        }

        order.status = OrderStatus::Cancelled;
        order.updated_at = env.ledger().timestamp();
        Self::save_order(&env, &order);

        env.events().publish(
            (symbol_short!("cancelled"), symbol_short!("order")),
            (order_id, caller),
        );
    }

    
    // -----------------------------------------------------------------------
    // Restaurant / Admin actions
    // -----------------------------------------------------------------------

    /// Advance the order to the next status in the lifecycle.
    ///
    /// Only the contract admin may call this; in production you would add a
    /// check against the restaurant registry to allow restaurant owners too.
    ///
    /// Valid transitions (in order):
    /// `Pending → Confirmed → Preparing → Ready → Delivered`
    pub fn advance_status(env: Env, caller: Address, order_id: u64) {
        caller.require_auth();
        Self::assert_admin_or_panic(&env, &caller);

        let mut order = Self::load_order(&env, order_id);
        let old_status = order.status.clone();

        order.status = match order.status {
            OrderStatus::Pending => OrderStatus::Confirmed,
            OrderStatus::Confirmed => OrderStatus::Preparing,
            OrderStatus::Preparing => OrderStatus::Ready,
            OrderStatus::Ready => OrderStatus::Delivered,
            OrderStatus::Delivered => panic!("order already delivered"),
            OrderStatus::Cancelled => panic!("cannot advance a cancelled order"),
        };
        order.updated_at = env.ledger().timestamp();
        Self::save_order(&env, &order);

        // Mint BITE rewards if order was just delivered
        if old_status == OrderStatus::Ready && order.status == OrderStatus::Delivered {
            Self::maybe_mint_reward(&env, &order);
        }

        env.events().publish(
            (symbol_short!("advanced"), symbol_short!("order")),
            order_id,
        );
    }

    /// Directly set an order's status (admin only – for dispute resolution).
    pub fn set_status(env: Env, caller: Address, order_id: u64, status: OrderStatus) {
        caller.require_auth();
        Self::assert_admin_or_panic(&env, &caller);

        let mut order = Self::load_order(&env, order_id);
        order.status = status;
        order.updated_at = env.ledger().timestamp();
        Self::save_order(&env, &order);

        env.events().publish(
            (symbol_short!("setstatus"), symbol_short!("order")),
            order_id,
        );
    }

    // -----------------------------------------------------------------------
    // View functions
    // -----------------------------------------------------------------------

    /// Fetch a single order by ID.
    pub fn get_order(env: Env, order_id: u64) -> Order {
        Self::load_order(&env, order_id)
    }

    /// Return a list of order IDs for a restaurant.
    pub fn get_restaurant_orders(env: Env, restaurant_id: u64) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::RestaurantOrders(restaurant_id))
            .unwrap_or_else(|| vec![&env])
    }

    /// Return a list of order IDs for a customer.
    pub fn get_customer_orders(env: Env, customer: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::CustomerOrders(customer))
            .unwrap_or_else(|| vec![&env])
    }

    /// Total orders ever placed.
    pub fn get_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }

    /// Toggle reward minting on/off (admin only).
    pub fn set_rewards_enabled(env: Env, caller: Address, enabled: bool) {
        caller.require_auth();
        Self::assert_admin_or_panic(&env, &caller);
        env.storage().instance().set(&DataKey::RewardsEnabled, &enabled);
        env.storage().instance().extend_ttl(17_280, 17_280);
    }

    /// Get the stored loyalty token address.
    pub fn get_loyalty_token(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::LoyaltyToken)
            .unwrap_or_else(|| panic!("loyalty token address not set"))
    }

    /// Check if rewards are enabled.
    pub fn is_rewards_enabled(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::RewardsEnabled)
            .unwrap_or(false)
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    fn load_order(env: &Env, order_id: u64) -> Order {
        env.storage()
            .persistent()
            .get(&DataKey::Order(order_id))
            .unwrap_or_else(|| panic!("order not found"))
    }

    fn save_order(env: &Env, order: &Order) {
        let ttl: u32 = 2_073_600;
        env.storage()
            .persistent()
            .set(&DataKey::Order(order.id), order);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Order(order.id), ttl, ttl);
    }

    fn assert_admin_or_panic(env: &Env, caller: &Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if caller != &admin {
            panic!("unauthorized: admin only");
        }
    }

    fn append_to_list(env: &Env, key: DataKey, id: u64, ttl: u32) {
        let mut list: Vec<u64> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| vec![env]);
        list.push_back(id);
        env.storage().persistent().set(&key, &list);
        env.storage().persistent().extend_ttl(&key, ttl, ttl);
    }

    fn maybe_mint_reward(env: &Env, order: &Order) {
        let rewards_enabled: bool = env
            .storage()
            .instance()
            .get(&DataKey::RewardsEnabled)
            .unwrap_or(false);
        
        if !rewards_enabled {
            return;
        }

        let loyalty_token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::LoyaltyToken)
            .unwrap_or_else(|| panic!("loyalty token address not set"));

        // Calculate reward: bite_reward = total_amount / 10_000, minimum 1 * 10^7
        let bite_reward = (order.total_amount / 10_000).max(10_000_000);

        // Create a client for the loyalty token contract
        let loyalty_client = LoyaltyTokenClient::new(env, &loyalty_token_address);
        
        // Mint the tokens (the order contract is the caller)
        loyalty_client.mint(&env.current_contract_address(), &order.customer, &bite_reward);

        // Emit reward event
        env.events().publish(
            (symbol_short!("rewarded"), symbol_short!("order")),
            (order.id, order.customer.clone(), bite_reward),
        );
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{vec, Env, String};

    fn make_item(env: &Env, id: u64, qty: u32, price: i128) -> OrderItem {
        OrderItem {
            menu_item_id: id,
            name: String::from_str(env, "Jollof Rice"),
            quantity: qty,
            unit_price: price,
        }
    }

    fn setup() -> (Env, OrderContractClient<'static>, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register_contract(None, OrderContract);
        let client = OrderContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let loyalty_token = Address::generate(&env);
        client.initialize(&admin, &loyalty_token, &true);
        (env, client, admin, loyalty_token)
    }

    #[test]
    fn test_place_and_get_order() {
        let (env, client, _admin, _loyalty_token) = setup();
        let customer = Address::generate(&env);

        let items = vec![&env, make_item(&env, 1, 2, 5_000_000)]; // 2 × 0.5 XLM
        let id = client.place_order(
            &customer,
            &42,
            &items,
            &String::from_str(&env, "No onions please"),
        );

        assert_eq!(id, 1);
        let order = client.get_order(&id);
        assert_eq!(order.total_amount, 10_000_000);
        assert_eq!(order.status, OrderStatus::Pending);
    }

    #[test]
    fn test_advance_status() {
        let (env, client, admin, _loyalty_token) = setup();
        let customer = Address::generate(&env);

        let items = vec![&env, make_item(&env, 1, 1, 7_000_000)];
        let id = client.place_order(&customer, &1, &items, &String::from_str(&env, ""));

        client.advance_status(&admin, &id);
        assert_eq!(client.get_order(&id).status, OrderStatus::Confirmed);

        client.advance_status(&admin, &id);
        assert_eq!(client.get_order(&id).status, OrderStatus::Preparing);

        client.advance_status(&admin, &id);
        assert_eq!(client.get_order(&id).status, OrderStatus::Ready);

        client.advance_status(&admin, &id);
        assert_eq!(client.get_order(&id).status, OrderStatus::Delivered);
    }

    #[test]
    fn test_customer_cancel_pending() {
        let (env, client, _admin, _loyalty_token) = setup();
        let customer = Address::generate(&env);

        let items = vec![&env, make_item(&env, 2, 1, 3_000_000)];
        let id = client.place_order(&customer, &1, &items, &String::from_str(&env, ""));

        client.cancel_order(&customer, &id);
        assert_eq!(client.get_order(&id).status, OrderStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "customers may only cancel pending orders")]
    fn test_customer_cannot_cancel_confirmed() {
        let (env, client, admin, _loyalty_token) = setup();
        let customer = Address::generate(&env);

        let items = vec![&env, make_item(&env, 1, 1, 5_000_000)];
        let id = client.place_order(&customer, &1, &items, &String::from_str(&env, ""));
        client.advance_status(&admin, &id);
        client.cancel_order(&customer, &id);
    }

    #[test]
    fn test_get_restaurant_orders() {
        let (env, client, _admin, _loyalty_token) = setup();
        let customer = Address::generate(&env);

        let items = vec![&env, make_item(&env, 1, 1, 5_000_000)];
        client.place_order(&customer, &7, &items.clone(), &String::from_str(&env, ""));
        client.place_order(&customer, &7, &items, &String::from_str(&env, ""));

        let orders = client.get_restaurant_orders(&7);
        assert_eq!(orders.len(), 2);
    }

    #[test]
    fn test_admin_helpers() {
        let (env, client, admin, loyalty_token) = setup();
        
        // Test get_loyalty_token
        assert_eq!(client.get_loyalty_token(), loyalty_token);
        
        // Test is_rewards_enabled (should be true from setup)
        assert!(client.is_rewards_enabled());
        
        // Test set_rewards_enabled
        client.set_rewards_enabled(&admin, &false);
        assert!(!client.is_rewards_enabled());
        
        client.set_rewards_enabled(&admin, &true);
        assert!(client.is_rewards_enabled());
    }

    #[test]
    #[should_panic(expected = "unauthorized: admin only")]
    fn test_set_rewards_enabled_unauthorized() {
        let (env, client, _admin, _loyalty_token) = setup();
        let unauthorized = Address::generate(&env);
        client.set_rewards_enabled(&unauthorized, &false);
    }

    #[test]
    fn test_reward_minting_on_delivery() {
        let env = Env::default();
        env.mock_all_auths();
        
        // Register both contracts
        let order_contract_id = env.register_contract(None, OrderContract);
        let loyalty_contract_id = env.register_contract(None, LoyaltyToken);
        
        let order_client = OrderContractClient::new(&env, &order_contract_id);
        let loyalty_client = LoyaltyTokenClient::new(&env, &loyalty_contract_id);
        
        let admin = Address::generate(&env);
        let customer = Address::generate(&env);
        
        // Initialize both contracts
        loyalty_client.initialize(&admin, &order_contract_id); // Order contract is minter
        order_client.initialize(&admin, &loyalty_contract_id, &true);
        
        // Place an order for 50,000,000 stroops (5 XLM)
        let items = vec![&env, make_item(&env, 1, 1, 50_000_000)];
        let order_id = order_client.place_order(&customer, &1, &items, &String::from_str(&env, ""));
        
        // Advance to delivered
        order_client.advance_status(&admin, &order_id); // Confirmed
        order_client.advance_status(&admin, &order_id); // Preparing  
        order_client.advance_status(&admin, &order_id); // Ready
        order_client.advance_status(&admin, &order_id); // Delivered
        
        // Check reward: 50,000,000 / 10,000 = 5,000 BITE tokens
        let expected_reward = 5_000_000_000; // 5,000 * 10^7 base units
        assert_eq!(loyalty_client.balance(&customer), expected_reward);
    }

    #[test]
    fn test_no_reward_when_disabled() {
        let env = Env::default();
        env.mock_all_auths();
        
        // Register both contracts
        let order_contract_id = env.register_contract(None, OrderContract);
        let loyalty_contract_id = env.register_contract(None, LoyaltyToken);
        
        let order_client = OrderContractClient::new(&env, &order_contract_id);
        let loyalty_client = LoyaltyTokenClient::new(&env, &loyalty_contract_id);
        
        let admin = Address::generate(&env);
        let customer = Address::generate(&env);
        
        // Initialize both contracts with rewards disabled
        loyalty_client.initialize(&admin, &order_contract_id);
        order_client.initialize(&admin, &loyalty_contract_id, &false);
        
        // Place and deliver an order
        let items = vec![&env, make_item(&env, 1, 1, 50_000_000)];
        let order_id = order_client.place_order(&customer, &1, &items, &String::from_str(&env, ""));
        
        order_client.advance_status(&admin, &order_id); // Confirmed
        order_client.advance_status(&admin, &order_id); // Preparing
        order_client.advance_status(&admin, &order_id); // Ready
        order_client.advance_status(&admin, &order_id); // Delivered
        
        // Should have no rewards
        assert_eq!(loyalty_client.balance(&customer), 0);
    }

    #[test]
    fn test_reward_minimum_threshold() {
        let env = Env::default();
        env.mock_all_auths();
        
        // Register both contracts
        let order_contract_id = env.register_contract(None, OrderContract);
        let loyalty_contract_id = env.register_contract(None, LoyaltyToken);
        
        let order_client = OrderContractClient::new(&env, &order_contract_id);
        let loyalty_client = LoyaltyTokenClient::new(&env, &loyalty_contract_id);
        
        let admin = Address::generate(&env);
        let customer = Address::generate(&env);
        
        // Initialize both contracts
        loyalty_client.initialize(&admin, &order_contract_id);
        order_client.initialize(&admin, &loyalty_contract_id, &true);
        
        // Place an order for 5,000 stroops (below threshold)
        let items = vec![&env, make_item(&env, 1, 1, 5_000)];
        let order_id = order_client.place_order(&customer, &1, &items, &String::from_str(&env, ""));
        
        // Advance to delivered
        order_client.advance_status(&admin, &order_id); // Confirmed
        order_client.advance_status(&admin, &order_id); // Preparing
        order_client.advance_status(&admin, &order_id); // Ready
        order_client.advance_status(&admin, &order_id); // Delivered
        
        // Should get minimum reward of 1 * 10^7
        let min_reward = 10_000_000;
        assert_eq!(loyalty_client.balance(&customer), min_reward);
    }

    #[test]
    fn test_reward_formula_exact_values() {
        let env = Env::default();
        env.mock_all_auths();
        
        // Register both contracts
        let order_contract_id = env.register_contract(None, OrderContract);
        let loyalty_contract_id = env.register_contract(None, LoyaltyToken);
        
        let order_client = OrderContractClient::new(&env, &order_contract_id);
        let loyalty_client = LoyaltyTokenClient::new(&env, &loyalty_contract_id);
        
        let admin = Address::generate(&env);
        let customer1 = Address::generate(&env);
        let customer2 = Address::generate(&env);
        let customer3 = Address::generate(&env);
        
        // Initialize both contracts
        loyalty_client.initialize(&admin, &order_contract_id);
        order_client.initialize(&admin, &loyalty_contract_id, &true);
        
        // Test case 1: Exactly 10,000 stroops = 1 BITE
        let items1 = vec![&env, make_item(&env, 1, 1, 10_000)];
        let order1_id = order_client.place_order(&customer1, &1, &items1, &String::from_str(&env, ""));
        
        // Test case 2: 100,000 stroops = 10 BITE
        let items2 = vec![&env, make_item(&env, 1, 1, 100_000)];
        let order2_id = order_client.place_order(&customer2, &1, &items2, &String::from_str(&env, ""));
        
        // Test case 3: 1,000,000 stroops = 100 BITE
        let items3 = vec![&env, make_item(&env, 1, 1, 1_000_000)];
        let order3_id = order_client.place_order(&customer3, &1, &items3, &String::from_str(&env, ""));
        
        // Deliver all orders
        for &order_id in &[order1_id, order2_id, order3_id] {
            order_client.advance_status(&admin, &order_id); // Confirmed
            order_client.advance_status(&admin, &order_id); // Preparing
            order_client.advance_status(&admin, &order_id); // Ready
            order_client.advance_status(&admin, &order_id); // Delivered
        }
        
        // Verify rewards
        assert_eq!(loyalty_client.balance(&customer1), 10_000_000); // 1 BITE
        assert_eq!(loyalty_client.balance(&customer2), 100_000_000); // 10 BITE
        assert_eq!(loyalty_client.balance(&customer3), 1_000_000_000); // 100 BITE
    }
}
