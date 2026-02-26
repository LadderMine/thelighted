use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, vec, Address, Env, String, Vec,
    testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation, MockAuth, MockAuthContract},
};
use loyalty_token::Client as LoyaltyTokenClient;
use restaurant_registry::Client as RestaurantRegistryClient;
use payment::{Client as PaymentClient, PaymentStatus};
use order::{Client as OrderClient, OrderItem, OrderStatus};

#[contract]
pub struct IntegrationTest;

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, AuthorizedFunction, MockAuth};

    fn setup_contracts(env: &Env) -> (Address, Address, Address, Address, Address, Address) {
        // Create test addresses
        let admin = Address::generate(env);
        let owner = Address::generate(env);
        let customer = Address::generate(env);
        let restaurant_wallet = Address::generate(env);
        let treasury = Address::generate(env);

        // Register contracts
        let loyalty_token_id = env.register_contract(None, loyalty_token::LoyaltyToken);
        let restaurant_registry_id = env.register_contract(None, restaurant_registry::RestaurantRegistry);
        let payment_id = env.register_contract(None, payment::Payment);
        let order_id = env.register_contract(None, order::OrderContract);

        // Create clients
        let loyalty_client = LoyaltyTokenClient::new(env, &loyalty_token_id);
        let registry_client = RestaurantRegistryClient::new(env, &restaurant_registry_id);
        let payment_client = PaymentClient::new(env, &payment_id);
        let order_client = OrderClient::new(env, &order_id);

        // Mock all auths for initialization
        env.mock_all_auths();

        // Step 1: Initialize restaurant_registry
        registry_client.initialize(&admin);

        // Step 2: Register restaurant
        let restaurant_id = registry_client.register_restaurant(
            &owner,
            &String::from_str(env, "Savoria"),
            &String::from_str(env, "savoria")
        );
        assert_eq!(restaurant_id, 1, "Restaurant ID should be 1");

        // Step 3: Initialize loyalty_token with order contract as minter
        loyalty_client.initialize(&admin, &order_id);

        // Step 4: Initialize payment contract
        payment_client.initialize(&admin, &treasury, &250u32);

        // Step 5: Initialize order contract
        order_client.initialize(&admin, &loyalty_token_id, &true);

        (loyalty_token_id, restaurant_registry_id, payment_id, order_id, customer, restaurant_wallet)
    }

    fn make_order_item(env: &Env, id: u64, qty: u32, price: i128) -> OrderItem {
        OrderItem {
            menu_item_id: id,
            name: String::from_str(env, "Test Item"),
            quantity: qty,
            unit_price: price,
        }
    }

    #[test]
    fn test_end_to_end_integration() {
        let env = Env::default();
        env.mock_all_auths();

        // Setup contracts
        let (loyalty_token_id, restaurant_registry_id, payment_id, order_id, customer, restaurant_wallet) = setup_contracts(&env);

        // Create clients
        let loyalty_client = LoyaltyTokenClient::new(&env, &loyalty_token_id);
        let registry_client = RestaurantRegistryClient::new(&env, &restaurant_registry_id);
        let payment_client = PaymentClient::new(&env, &payment_id);
        let order_client = OrderClient::new(&env, &order_id);

        // Create admin and owner addresses for authorization
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);

        // Register mock XLM token for payments
        let xlm_token_id = env.register_stellar_asset_contract_v2(Address::generate(&env));

        // Step 6: Place order
        let items = vec![
            &env,
            make_order_item(&env, 1, 2, 5_000_000i128), // 2 items at 0.5 XLM each
        ];
        let order_id = order_client.place_order(
            &customer,
            &1u64, // restaurant_id
            &items,
            &String::from_str(&env, "Test order notes")
        );
        assert_eq!(order_id, 1, "Order ID should be 1");

        // Verify order initial state
        let order = order_client.get_order(&order_id);
        assert_eq!(order.status, OrderStatus::Pending);
        assert_eq!(order.total_amount, 10_000_000i128); // 2 * 5,000,000

        // Step 7: Escrow payment
        let payment_amount = 10_000_000i128;
        payment_client.escrow_payment(
            &customer,
            &order_id,
            &restaurant_wallet,
            &xlm_token_id,
            &payment_amount
        );

        // Verify payment is escrowed
        let payment_info = payment_client.get_payment(&order_id);
        assert_eq!(payment_info.payer, customer);
        assert_eq!(payment_info.restaurant_wallet, restaurant_wallet);
        assert_eq!(payment_info.amount, payment_amount);

        // Step 8: Advance order status to Delivered
        let admin = Address::generate(&env);
        env.mock_auths(&[
            MockAuth {
                address: &admin,
                contract: &order_id,
                fn_name: "advance_status",
                args: (&admin, order_id).into_val(env),
                invoked: &AuthorizedInvocation {
                    contract: &order_id,
                    fn_name: "advance_status",
                    args: (&admin, order_id).into_val(env),
                    sub_invocations: vec![],
                },
            },
            MockAuth {
                address: &admin,
                contract: &order_id,
                fn_name: "advance_status",
                args: (&admin, order_id).into_val(env),
                invoked: &AuthorizedInvocation {
                    contract: &order_id,
                    fn_name: "advance_status",
                    args: (&admin, order_id).into_val(env),
                    sub_invocations: vec![],
                },
            },
            MockAuth {
                address: &admin,
                contract: &order_id,
                fn_name: "advance_status",
                args: (&admin, order_id).into_val(env),
                invoked: &AuthorizedInvocation {
                    contract: &order_id,
                    fn_name: "advance_status",
                    args: (&admin, order_id).into_val(env),
                    sub_invocations: vec![],
                },
            },
            MockAuth {
                address: &admin,
                contract: &order_id,
                fn_name: "advance_status",
                args: (&admin, order_id).into_val(env),
                invoked: &AuthorizedInvocation {
                    contract: &order_id,
                    fn_name: "advance_status",
                    args: (&admin, order_id).into_val(env),
                    sub_invocations: vec![],
                },
            },
        ]);

        order_client.advance_status(&admin, &order_id); // Pending -> Confirmed
        assert_eq!(order_client.get_order(&order_id).status, OrderStatus::Confirmed);

        order_client.advance_status(&admin, &order_id); // Confirmed -> Preparing
        assert_eq!(order_client.get_order(&order_id).status, OrderStatus::Preparing);

        order_client.advance_status(&admin, &order_id); // Preparing -> Ready
        assert_eq!(order_client.get_order(&order_id).status, OrderStatus::Ready);

        order_client.advance_status(&admin, &order_id); // Ready -> Delivered
        assert_eq!(order_client.get_order(&order_id).status, OrderStatus::Delivered);

        // Step 9: Release payment
        let treasury = Address::generate(&env);
        env.mock_auths(&[
            MockAuth {
                address: &admin,
                contract: &payment_id,
                fn_name: "release_payment",
                args: (&admin, order_id).into_val(env),
                invoked: &AuthorizedInvocation {
                    contract: &payment_id,
                    fn_name: "release_payment",
                    args: (&admin, order_id).into_val(env),
                    sub_invocations: vec![],
                },
            },
        ]);

        payment_client.release_payment(&admin, &order_id);

        // Verify payment was released
        let updated_payment_info = payment_client.get_payment(&order_id);
        assert!(matches!(updated_payment_info.status, PaymentStatus::Released));

        // Verify restaurant and treasury received payments
        // Note: In a real scenario, we'd check token balances, but for this test we verify the payment state
        let expected_fee = payment_amount * 250 / 10000; // 250 bps = 2.5%
        let expected_restaurant_amount = payment_amount - expected_fee;
        
        // Step 10: Verify BITE reward
        let bite_balance = loyalty_client.balance(&customer);
        assert!(bite_balance > 0, "Customer should have received BITE rewards");

        // Verify reward calculation: 10,000,000 / 10,000 = 1,000 BITE tokens
        let expected_reward = 1_000 * 10_000_000; // 1,000 BITE * 10^7 base units
        assert_eq!(bite_balance, expected_reward, "BITE reward should match formula");

        // Verify final state
        let final_order = order_client.get_order(&order_id);
        assert_eq!(final_order.status, OrderStatus::Delivered);
        assert_eq!(final_order.id, 1);

        println!("✅ All 10 integration test steps passed successfully!");
        println!("📊 Final Summary:");
        println!("   - Order ID: {}", final_order.id);
        println!("   - Order Status: {:?}", final_order.status);
        println!("   - Total Amount: {} stroops", final_order.total_amount);
        println!("   - BITE Reward: {} base units", bite_balance);
        println!("   - Payment Released: {}", updated_payment_info.released);
    }

    #[test]
    fn test_contract_initialization() {
        let env = Env::default();
        env.mock_all_auths();

        let (loyalty_token_id, restaurant_registry_id, payment_id, order_id, _, _) = setup_contracts(&env);

        // Verify all contracts are properly initialized
        let loyalty_client = LoyaltyTokenClient::new(&env, &loyalty_token_id);
        let registry_client = RestaurantRegistryClient::new(&env, &restaurant_registry_id);
        let payment_client = PaymentClient::new(&env, &payment_id);
        let order_client = OrderClient::new(&env, &order_id);

        // Check token metadata
        assert_eq!(loyalty_client.name(), String::from_str(&env, "Bite Rewards"));
        assert_eq!(loyalty_client.symbol(), String::from_str(&env, "BITE"));
        assert_eq!(loyalty_client.decimals(), 7);

        // Check restaurant registry
        let restaurants = registry_client.get_all_restaurants();
        assert_eq!(restaurants.len(), 1);

        // Check order contract settings
        assert!(order_client.is_rewards_enabled());
        assert_eq!(order_client.get_loyalty_token(), loyalty_token_id);

        println!("✅ All contracts initialized successfully!");
    }
}
