#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, String,
};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
pub enum DataKey {
    /// The platform admin who controls minting.
    Admin,
    /// Optional secondary minter (e.g. the Order contract address).
    Minter,
    /// Total tokens in circulation.
    TotalSupply,
    /// Per-account balances.
    Balance(Address),
    /// Allowances: (owner, spender) → (amount, expiration_ledger).
    Allowance(Address, Address),
}

// ---------------------------------------------------------------------------
// Token metadata (stored once at init)
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub struct TokenMeta {
    pub name: String,
    pub symbol: String,
    pub decimals: u32,
}

#[contracttype]
pub enum MetaKey {
    Meta,
}

// ---------------------------------------------------------------------------
// Allowance helper struct
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub struct AllowanceData {
    pub amount: i128,
    pub expiration_ledger: u32,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct LoyaltyToken;

#[contractimpl]
impl LoyaltyToken {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// Deploy the BITE token.
    ///
    /// # Arguments
    /// - `admin`   – address with mint authority.
    /// - `minter`  – optional secondary minter (pass `admin` to disable).
    pub fn initialize(env: Env, admin: Address, minter: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Minter, &minter);
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);
        env.storage().instance().set(
            &MetaKey::Meta,
            &TokenMeta {
                name: String::from_str(&env, "Bite Rewards"),
                symbol: String::from_str(&env, "BITE"),
                decimals: 7,
            },
        );
        env.storage().instance().extend_ttl(17_280, 17_280);
    }

    // -----------------------------------------------------------------------
    // Admin / Minter actions
    // -----------------------------------------------------------------------

    /// Mint `amount` BITE to `to`.  Only callable by admin or minter.
    pub fn mint(env: Env, caller: Address, to: Address, amount: i128) {
        caller.require_auth();
        Self::assert_admin_or_minter(&env, &caller);

        if amount <= 0 {
            panic!("amount must be positive");
        }

        let new_balance = Self::balance_of(&env, &to) + amount;
        Self::set_balance(&env, &to, new_balance);

        let supply: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &(supply + amount));
        env.storage().instance().extend_ttl(17_280, 17_280);

        env.events().publish(
            (symbol_short!("mint"), symbol_short!("BITE")),
            (to, amount),
        );
    }

    /// Update the authorised minter address (admin only).
    pub fn set_minter(env: Env, caller: Address, new_minter: Address) {
        caller.require_auth();
        Self::assert_admin_or_panic(&env, &caller);
        env.storage().instance().set(&DataKey::Minter, &new_minter);
        env.storage().instance().extend_ttl(17_280, 17_280);
    }

    /// Transfer the admin role.
    pub fn transfer_admin(env: Env, caller: Address, new_admin: Address) {
        caller.require_auth();
        Self::assert_admin_or_panic(&env, &caller);
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        env.storage().instance().extend_ttl(17_280, 17_280);
    }

    // -----------------------------------------------------------------------
    // SEP-41 token interface
    // -----------------------------------------------------------------------

    /// Return the token balance of `account`.
    pub fn balance(env: Env, account: Address) -> i128 {
        Self::balance_of(&env, &account)
    }

    /// Transfer `amount` BITE from `from` to `to`.
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        Self::do_transfer(&env, &from, &to, amount);
    }

    /// Return the current allowance for `spender` to spend on behalf of `from`.
    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        Self::get_allowance(&env, &from, &spender)
    }

    /// Approve `spender` to transfer up to `amount` on behalf of `from`.
    ///
    /// `expiration_ledger` is the last ledger at which the approval is valid.
    /// Pass `0` to revoke.
    pub fn approve(
        env: Env,
        from: Address,
        spender: Address,
        amount: i128,
        expiration_ledger: u32,
    ) {
        from.require_auth();
        if amount < 0 {
            panic!("allowance amount cannot be negative");
        }
        if amount > 0 && expiration_ledger < env.ledger().sequence() {
            panic!("expiration_ledger is in the past");
        }
        let data = AllowanceData {
            amount,
            expiration_ledger,
        };
        let ttl = expiration_ledger.saturating_sub(env.ledger().sequence());
        env.storage()
            .temporary()
            .set(&DataKey::Allowance(from.clone(), spender.clone()), &data);
        if ttl > 0 {
            env.storage().temporary().extend_ttl(
                &DataKey::Allowance(from.clone(), spender.clone()),
                ttl,
                ttl,
            );
        }
        env.events().publish(
            (symbol_short!("approve"), symbol_short!("BITE")),
            (from, spender, amount, expiration_ledger),
        );
    }

    /// Transfer `amount` on behalf of `from` using a prior allowance.
    pub fn transfer_from(
        env: Env,
        spender: Address,
        from: Address,
        to: Address,
        amount: i128,
    ) {
        spender.require_auth();

        let current = Self::get_allowance(&env, &from, &spender);
        if current < amount {
            panic!("insufficient allowance");
        }

        // Decrement allowance.
        let allowance_key = DataKey::Allowance(from.clone(), spender.clone());
        let mut data: AllowanceData = env
            .storage()
            .temporary()
            .get(&allowance_key)
            .unwrap_or(AllowanceData {
                amount: 0,
                expiration_ledger: 0,
            });
        data.amount -= amount;
        env.storage().temporary().set(&allowance_key, &data);

        Self::do_transfer(&env, &from, &to, amount);
    }

    /// Burn `amount` BITE from `from`'s account.
    pub fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        Self::do_burn(&env, &from, amount);
    }

    /// Burn `amount` BITE from `from` using a spender's allowance.
    pub fn burn_from(env: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();

        let current = Self::get_allowance(&env, &from, &spender);
        if current < amount {
            panic!("insufficient allowance");
        }

        let allowance_key = DataKey::Allowance(from.clone(), spender.clone());
        let mut data: AllowanceData = env
            .storage()
            .temporary()
            .get(&allowance_key)
            .unwrap_or(AllowanceData {
                amount: 0,
                expiration_ledger: 0,
            });
        data.amount -= amount;
        env.storage().temporary().set(&allowance_key, &data);

        Self::do_burn(&env, &from, amount);
    }

    // -----------------------------------------------------------------------
    // Token metadata (SEP-41)
    // -----------------------------------------------------------------------

    pub fn name(env: Env) -> String {
        let meta: TokenMeta = env.storage().instance().get(&MetaKey::Meta).unwrap();
        meta.name
    }

    pub fn symbol(env: Env) -> String {
        let meta: TokenMeta = env.storage().instance().get(&MetaKey::Meta).unwrap();
        meta.symbol
    }

    pub fn decimals(env: Env) -> u32 {
        let meta: TokenMeta = env.storage().instance().get(&MetaKey::Meta).unwrap();
        meta.decimals
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    fn balance_of(env: &Env, account: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(account.clone()))
            .unwrap_or(0)
    }

    fn set_balance(env: &Env, account: &Address, amount: i128) {
        let ttl: u32 = 2_073_600;
        env.storage()
            .persistent()
            .set(&DataKey::Balance(account.clone()), &amount);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Balance(account.clone()), ttl, ttl);
    }

    fn do_transfer(env: &Env, from: &Address, to: &Address, amount: i128) {
        if amount <= 0 {
            panic!("transfer amount must be positive");
        }
        let from_bal = Self::balance_of(env, from);
        if from_bal < amount {
            panic!("insufficient balance");
        }
        Self::set_balance(env, from, from_bal - amount);
        Self::set_balance(env, to, Self::balance_of(env, to) + amount);

        env.events().publish(
            (symbol_short!("transfer"), symbol_short!("BITE")),
            (from.clone(), to.clone(), amount),
        );
    }

    fn do_burn(env: &Env, from: &Address, amount: i128) {
        if amount <= 0 {
            panic!("burn amount must be positive");
        }
        let bal = Self::balance_of(env, from);
        if bal < amount {
            panic!("insufficient balance");
        }
        Self::set_balance(env, from, bal - amount);

        let supply: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &(supply - amount));
        env.storage().instance().extend_ttl(17_280, 17_280);

        env.events().publish(
            (symbol_short!("burn"), symbol_short!("BITE")),
            (from.clone(), amount),
        );
    }

    fn get_allowance(env: &Env, from: &Address, spender: &Address) -> i128 {
        let data: Option<AllowanceData> = env
            .storage()
            .temporary()
            .get(&DataKey::Allowance(from.clone(), spender.clone()));

        match data {
            None => 0,
            Some(d) => {
                if env.ledger().sequence() > d.expiration_ledger {
                    0
                } else {
                    d.amount
                }
            }
        }
    }

    fn assert_admin_or_panic(env: &Env, caller: &Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if caller != &admin {
            panic!("unauthorized: admin only");
        }
    }

    fn assert_admin_or_minter(env: &Env, caller: &Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        let minter: Address = env.storage().instance().get(&DataKey::Minter).unwrap();
        if caller != &admin && caller != &minter {
            panic!("unauthorized: admin or minter only");
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    fn setup() -> (Env, LoyaltyTokenClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register_contract(None, LoyaltyToken);
        let client = LoyaltyTokenClient::new(&env, &cid);
        let admin = Address::generate(&env);
        client.initialize(&admin, &admin); // admin is also minter
        (env, client, admin)
    }

    #[test]
    fn test_metadata() {
        let (env, client, _admin) = setup();
        assert_eq!(client.name(), String::from_str(&env, "Bite Rewards"));
        assert_eq!(client.symbol(), String::from_str(&env, "BITE"));
        assert_eq!(client.decimals(), 7u32);
    }

    #[test]
    fn test_mint_and_balance() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        client.mint(&admin, &user, &1_000_000);
        assert_eq!(client.balance(&user), 1_000_000);
        assert_eq!(client.total_supply(), 1_000_000);
    }

    #[test]
    fn test_transfer() {
        let (env, client, admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        client.mint(&admin, &alice, &500_000);
        client.transfer(&alice, &bob, &200_000);

        assert_eq!(client.balance(&alice), 300_000);
        assert_eq!(client.balance(&bob), 200_000);
    }

    #[test]
    fn test_approve_and_transfer_from() {
        let (env, client, admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        client.mint(&admin, &alice, &1_000_000);

        // Alice approves bob to spend 300_000 for 1000 ledgers.
        let expiry = env.ledger().sequence() + 1_000;
        client.approve(&alice, &bob, &300_000, &expiry);
        assert_eq!(client.allowance(&alice, &bob), 300_000);

        client.transfer_from(&bob, &alice, &bob, &100_000);
        assert_eq!(client.balance(&bob), 100_000);
        assert_eq!(client.allowance(&alice, &bob), 200_000);
    }

    #[test]
    fn test_burn() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        client.mint(&admin, &user, &500_000);
        client.burn(&user, &200_000);

        assert_eq!(client.balance(&user), 300_000);
        assert_eq!(client.total_supply(), 300_000);
    }

    #[test]
    #[should_panic(expected = "insufficient balance")]
    fn test_transfer_overdraft_panics() {
        let (env, client, admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        client.mint(&admin, &alice, &100_000);
        client.transfer(&alice, &bob, &200_000);
    }

    #[test]
    #[should_panic(expected = "unauthorized: admin or minter only")]
    fn test_unauthorised_mint_panics() {
        let (env, client, _admin) = setup();
        let rando = Address::generate(&env);
        client.mint(&rando, &rando, &1_000_000);
    }
}
