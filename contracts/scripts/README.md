# Contract Deployment Scripts

This directory contains deployment scripts and documentation for TheLighted platform contracts.

## Overview

The platform consists of four Soroban smart contracts that work together:

1. **Loyalty Token** - BITE token for customer rewards
2. **Restaurant Registry** - Manages restaurant registration and metadata
3. **Payment** - Handles payment escrow and fee distribution
4. **Order** - Manages order lifecycle and automatic reward distribution

## Prerequisites

### Environment Variables

Before deploying, you must set the following environment variables:

#### For Testnet Deployment:
```bash
export STELLAR_ACCOUNT="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
export STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
```

#### For Mainnet Deployment:
```bash
export STELLAR_ACCOUNT="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
export STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
export STELLAR_SECRET_KEY="SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

### Required Tools

1. **Stellar CLI** - Install from https://github.com/stellar/stellar-cli
2. **Rust toolchain** - `rustup target add wasm32-unknown-unknown`
3. **Cargo** - Rust package manager

## Deployment

### Quick Start (Testnet)

```bash
# Navigate to contracts directory
cd contracts

# Deploy to testnet
./scripts/deploy.sh

# Or explicitly specify network
./scripts/deploy.sh --network testnet
```

### Mainnet Deployment

```bash
# Deploy to mainnet (with confirmation prompt)
./scripts/deploy.sh --network mainnet
```

## Deployment Process

The deployment script performs the following steps in order:

1. **Build Contracts** - Compiles all contracts to WASM
2. **Deploy Loyalty Token** - Deploys and initializes with deployer as admin and minter
3. **Deploy Restaurant Registry** - Deploys and initializes with deployer as admin
4. **Deploy Payment** - Deploys and initializes with treasury and 250 bps fee
5. **Deploy Order** - Deploys with loyalty token address and rewards enabled

### Dependency Order

Contracts are deployed in this specific order due to dependencies:

```
loyalty_token → restaurant_registry → payment → order
```

- `order` depends on `loyalty_token` for reward minting
- `payment` is independent but deployed before `order` for logical flow
- `restaurant_registry` is independent but deployed early for setup

## Output

After successful deployment, the script creates `.env.contracts` with:

```bash
CONTRACT_LOYALTY_TOKEN=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
CONTRACT_RESTAURANT_REGISTRY=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
CONTRACT_PAYMENT=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
CONTRACT_ORDER=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

## Integration Testing

### Run Integration Tests

```bash
# Navigate to contracts directory
cd contracts

# Run all tests including integration
cargo test

# Run only integration tests
cargo test integration_test

# Run with output
cargo test integration_test -- --nocapture
```

### Test Coverage

The integration test (`tests/integration_test.rs`) covers:

1. ✅ Restaurant registry initialization
2. ✅ Restaurant registration (ID verification)
3. ✅ Loyalty token initialization (with order as minter)
4. ✅ Payment contract initialization (treasury and fees)
5. ✅ Order contract initialization (loyalty token and rewards)
6. ✅ Order placement (ID and amount verification)
7. ✅ Payment escrow (amount and wallet verification)
8. ✅ Order status advancement to Delivered
9. ✅ Payment release (restaurant + treasury distribution)
10. ✅ BITE reward minting (formula verification)

### Test Environment

The integration test uses:
- `soroban_sdk::testutils` for mock environment
- `register_stellar_asset_contract_v2` for mock XLM token
- Shared `Env` for all contracts
- No external network calls

## Contract Configuration

### Loyalty Token
- **Name**: Bite Rewards
- **Symbol**: BITE
- **Decimals**: 7
- **Admin**: Deployer wallet
- **Minter**: Order contract (for automatic rewards)

### Restaurant Registry
- **Admin**: Deployer wallet
- **Auto-incrementing IDs**: Starting from 1

### Payment
- **Admin**: Deployer wallet
- **Treasury**: Deployer wallet (configurable)
- **Fee Basis Points**: 250 (2.5%)

### Order
- **Admin**: Deployer wallet
- **Loyalty Token**: Deployed loyalty token contract
- **Rewards Enabled**: true (configurable via admin functions)

## Reward Formula

BITE rewards are calculated as:
```
bite_reward = max(total_amount / 10_000, 1 * 10^7)
```

- 1 BITE token per 10,000 stroops
- Minimum reward: 1 BITE (10^7 base units)
- Automatically minted on order delivery

## Troubleshooting

### Common Issues

1. **"stellar command not found"**
   - Install Stellar CLI: https://github.com/stellar/stellar-cli

2. **"wasm32-unknown-unknown target not found"**
   - Add target: `rustup target add wasm32-unknown-unknown`

3. **"Environment variable not set"**
   - Ensure all required environment variables are set

4. **"Insufficient funds"**
   - Ensure deployer account has sufficient XLM for deployment

### Debug Mode

For debugging, you can modify the script to add `--verbose` flags to stellar commands.

### Manual Deployment

If the script fails, you can deploy manually:

```bash
# Build
cargo build --release --target wasm32-unknown-unknown --workspace

# Deploy each contract
stellar contract deploy --wasm target/wasm32-unknown-unknown/release/loyalty_token.wasm --source $STELLAR_ACCOUNT --rpc-url https://soroban-testnet.stellar.org:443 --network-passphrase "$STELLAR_NETWORK_PASSPHRASE"

# Initialize each contract
stellar contract invoke --id CONTRACT_ID --source $STELLAR_ACCOUNT --rpc-url https://soroban-testnet.stellar.org:443 --network-passphrase "$STELLAR_NETWORK_PASSPHRASE" -- initialize $STELLAR_ACCOUNT $STELLAR_ACCOUNT
```

## Security Considerations

1. **Mainnet Deployment**: Always double-check network and addresses
2. **Key Security**: Never commit private keys to version control
3. **Admin Permissions**: Deployer becomes admin for all contracts
4. **Minter Permissions**: Order contract gets minter role for loyalty token
5. **Treasury Setup**: Ensure treasury address is secure and accessible

## Support

For issues with deployment or testing:
1. Check environment variables
2. Verify Stellar CLI installation
3. Ensure sufficient account balance
4. Review contract logs for specific error messages
