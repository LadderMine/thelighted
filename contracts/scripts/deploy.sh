#!/bin/bash

# Deployment script for TheLighted platform contracts
# Deploys all contracts to Stellar Testnet or Mainnet in correct dependency order

set -e

# Default network
NETWORK="testnet"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --network)
            NETWORK="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--network testnet|mainnet]"
            echo "  --network  Target network (default: testnet)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validate network
if [[ "$NETWORK" != "testnet" && "$NETWORK" != "mainnet" ]]; then
    echo "Error: Network must be 'testnet' or 'mainnet'"
    exit 1
fi

# Confirm mainnet deployment
if [[ "$NETWORK" == "mainnet" ]]; then
    echo "WARNING: You are about to deploy to Stellar MAINNET."
    echo "This will deploy real contracts and consume real funds."
    read -p "Are you sure you want to continue? (type 'mainnet' to confirm): " confirm
    if [[ "$confirm" != "mainnet" ]]; then
        echo "Deployment cancelled."
        exit 1
    fi
fi

echo "Deploying to $NETWORK..."

# Check required environment variables
check_env() {
    if [[ -z "${!1}" ]]; then
        echo "Error: Environment variable $1 is not set"
        exit 1
    fi
}

if [[ "$NETWORK" == "testnet" ]]; then
    check_env "STELLAR_ACCOUNT"
    check_env "STELLAR_NETWORK_PASSPHRASE"
else
    check_env "STELLAR_ACCOUNT"
    check_env "STELLAR_NETWORK_PASSPHRASE"
    check_env "STELLAR_SECRET_KEY"
fi

# Set network-specific configurations
if [[ "$NETWORK" == "testnet" ]]; then
    RPC_URL="https://soroban-testnet.stellar.org:443"
    NETWORK_PASSPHRASE="$STELLAR_NETWORK_PASSPHRASE"
else
    RPC_URL="https://soroban.stellar.org:443"
    NETWORK_PASSPHRASE="$STELLAR_NETWORK_PASSPHRASE"
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$SCRIPT_DIR/.env.contracts"

# Clean up previous env file
rm -f "$ENV_FILE"

echo "Building contracts..."
cd "$CONTRACTS_DIR"

# Build all contracts
cargo build --release --target wasm32-unknown-unknown --workspace

echo "Deployment starting..."

# Function to deploy contract
deploy_contract() {
    local contract_name="$1"
    local wasm_file="$2"
    local init_args="$3"
    
    echo "Deploying $contract_name..."
    
    # Deploy contract
    if [[ "$NETWORK" == "testnet" ]]; then
        contract_id=$(stellar contract deploy \
            --wasm "$wasm_file" \
            --source "$STELLAR_ACCOUNT" \
            --rpc-url "$RPC_URL" \
            --network-passphrase "$NETWORK_PASSPHRASE")
    else
        contract_id=$(stellar contract deploy \
            --wasm "$wasm_file" \
            --source "$STELLAR_ACCOUNT" \
            --secret-key "$STELLAR_SECRET_KEY" \
            --rpc-url "$RPC_URL" \
            --network-passphrase "$NETWORK_PASSPHRASE")
    fi
    
    echo "Deployed $contract_name: $contract_id"
    
    # Initialize contract if init args provided
    if [[ -n "$init_args" ]]; then
        echo "Initializing $contract_name..."
        if [[ "$NETWORK" == "testnet" ]]; then
            stellar contract invoke \
                --id "$contract_id" \
                --source "$STELLAR_ACCOUNT" \
                --rpc-url "$RPC_URL" \
                --network-passphrase "$NETWORK_PASSPHRASE" \
                -- \
                initialize $init_args
        else
            stellar contract invoke \
                --id "$contract_id" \
                --source "$STELLAR_ACCOUNT" \
                --secret-key "$STELLAR_SECRET_KEY" \
                --rpc-url "$RPC_URL" \
                --network-passphrase "$NETWORK_PASSPHRASE" \
                -- \
                initialize $init_args
        fi
        echo "Initialized $contract_name"
    fi
    
    # Write to env file
    local env_var_name="CONTRACT_$(echo "$contract_name" | tr '[:lower:]' '[:upper:]')"
    echo "$env_var_name=$contract_id" >> "$ENV_FILE"
    
    echo "$contract_id"
}

# Deploy in dependency order
echo "Step 1: Deploying loyalty_token..."
LOYALTY_TOKEN_ID=$(deploy_contract "loyalty_token" "target/wasm32-unknown-unknown/release/loyalty_token.wasm" "$STELLAR_ACCOUNT $STELLAR_ACCOUNT")

echo "Step 2: Deploying restaurant_registry..."
RESTAURANT_REGISTRY_ID=$(deploy_contract "restaurant_registry" "target/wasm32-unknown-unknown/release/restaurant_registry.wasm" "$STELLAR_ACCOUNT")

echo "Step 3: Deploying payment..."
PAYMENT_ID=$(deploy_contract "payment" "target/wasm32-unknown-unknown/release/payment.wasm" "$STELLAR_ACCOUNT $STELLAR_ACCOUNT 250")

echo "Step 4: Deploying order..."
ORDER_ID=$(deploy_contract "order" "target/wasm32-unknown-unknown/release/order.wasm" "$STELLAR_ACCOUNT $LOYALTY_TOKEN_ID true")

echo ""
echo "Deployment completed successfully!"
echo "Contract IDs written to: $ENV_FILE"
echo ""
echo "Contract Summary:"
echo "Loyalty Token: $LOYALTY_TOKEN_ID"
echo "Restaurant Registry: $RESTAURANT_REGISTRY_ID"
echo "Payment: $PAYMENT_ID"
echo "Order: $ORDER_ID"
echo ""
echo "You can now use these contract IDs in your application configuration."
