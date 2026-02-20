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
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Count, &0u64);
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