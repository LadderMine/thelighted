# Stellar Blockchain Payment Integration

## Overview
This module implements Stellar blockchain payment integration for XLM and USDC cryptocurrency payments, wallet management, and tokenized loyalty programs.

## Features
- ✅ XLM and USDC payment processing
- ✅ Restaurant loyalty token creation and management
- ✅ Wallet connection and verification
- ✅ Automatic loyalty token distribution
- ✅ Real-time exchange rate conversions
- ✅ Transaction tracking and confirmation
- ✅ Refund processing
- ✅ Background job processing

## Endpoints

### Payment Processing
- `POST /api/payments/stellar/initiate` - Initiate Stellar payment
- `POST /api/payments/stellar/confirm` - Confirm payment received
- `GET /api/payments/stellar/:transactionHash` - Get transaction details
- `POST /api/payments/stellar/refund` - Process refund

### Wallet Management
- `POST /api/wallets/connect` - Connect Stellar wallet
- `GET /api/wallets/balance` - Get wallet balance
- `GET /api/wallets/transactions` - Get transaction history
- `POST /api/wallets/verify` - Verify wallet ownership

### Loyalty Tokens
- `POST /api/loyalty/tokens/create` - Create restaurant loyalty token
- `POST /api/loyalty/tokens/issue` - Issue tokens to customer
- `GET /api/loyalty/tokens/:tokenCode` - Get token info
- `GET /api/loyalty/tokens/holders` - Get token holders
- `POST /api/loyalty/tokens/redeem` - Redeem tokens for rewards

### Exchange Rates
- `GET /api/exchange-rates` - Get current XLM/USDC rates
- `POST /api/exchange-rates/calculate` - Calculate conversion

## Database Schema
- `stellar_wallets` - Stores user wallet information
- `stellar_transactions` - Tracks blockchain transactions
- `loyalty_tokens` - Manages restaurant loyalty tokens
- `loyalty_balances` - Stores user token balances
- `token_transactions` - Records token movement

## Background Jobs
- Exchange rate updates (every 30 seconds)
- Transaction confirmation polling (every minute)
- Token distribution queue (every 30 seconds)
- Failed transaction cleanup (daily)

## Security
- Encrypted master account secrets
- Proper transaction validation
- Idempotency for payment confirmation
- Rate limiting for payment endpoints
- Validated wallet signatures

## Configuration
Environment variables required:
- `STELLAR_HORIZON_URL` - Horizon API URL
- `STELLAR_NETWORK_PASSPHRASE` - Network passphrase
- `RESTAURANT_WALLET_PUBLIC_KEY` - Restaurant's wallet address
- `LOYALTY_TOKEN_ISSUER_PUBLIC_KEY` - Issuer wallet address

## Dependencies
- `@stellar/stellar-sdk` - Stellar blockchain interaction
- `@nestjs/schedule` - Job scheduling
- `typeorm` - Database ORM
- `node-cache` - Rate caching

## Testing
Unit tests cover:
- Payment initiation and confirmation
- Exchange rate calculations
- Token issuance and redemption
- Wallet verification
- Transaction queries
- Error scenarios