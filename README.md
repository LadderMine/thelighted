## 🌐 Overview

TheLighted is a cutting-edge SaaS restaurant management platform that combines modern web technologies with blockchain innovation. Built on the Stellar network, it transforms how restaurants engage with customers through intelligent menu recommendations, frictionless crypto payments, and transparent loyalty programs—all while reducing transaction costs and enabling instant cross-border settlements.

### Why Stellar?

TheLighted leverages Stellar's blockchain infrastructure to bring unique value to both restaurants and diners:

- **🌍 Global Reach**: Enable customers worldwide to pay in their preferred currency with automatic conversion at minimal fees (<$0.01 per transaction)
- **⚡ Instant Settlements**: Restaurant owners receive payments in 3-5 seconds instead of days, improving cash flow
- **🎁 Tokenized Loyalty**: Create custom loyalty tokens that customers can trade, gift, or redeem across partner restaurants
- **💳 Reduced Fees**: Save 2-3% on payment processing compared to traditional credit card networks
- **🔐 Transparent Rewards**: All loyalty points and rewards are recorded on-chain, ensuring transparency and preventing fraud
- **🏪 Multi-Restaurant Tokens**: Enable restaurant groups to create shared loyalty ecosystems on Stellar

## ✨ Features

### For Customers

- **🤖 AI-Powered Recommendations**: Get personalized menu suggestions based on preferences, dietary restrictions, and trending items
- **🎭 Mood-Based Ordering**: Filter menu items by mood (comfort food, healthy, adventurous, quick bites)
- **📱 Digital QR Menu**: Scan table QR codes for instant access to interactive menus
- **🛒 Smart Cart System**: Seamless ordering experience with real-time price calculations
- **💰 Crypto Payments**: Pay with XLM, USDC, or other Stellar-based assets
- **🎫 On-Chain Loyalty**: Earn tokenized rewards automatically recorded on Stellar blockchain
- **📤 Social Sharing**: Share favorite dishes and dining experiences
- **⭐ Reviews & Ratings**: Help others discover great meals

### For Restaurant Owners

- **📊 Comprehensive Dashboard**: Manage menus, orders, and analytics in one place
- **👥 User Management**: Handle staff permissions and customer data
- **📈 Sales Analytics**: Track performance, popular items, and revenue trends
- **🏷️ Dynamic Pricing**: Adjust prices and run promotions in real-time
- **🔔 Real-Time Orders**: Receive instant notifications for new orders
- **💸 Stellar Wallet Integration**: Accept crypto payments with automatic conversion to fiat
- **🎁 Custom Token Creation**: Launch your own restaurant loyalty token on Stellar
- **🌐 Multi-Location Support**: Manage multiple restaurant branches from one dashboard
- **📱 QR Code Generator**: Create and manage table-specific QR codes

### Stellar Blockchain Integration

- **Smart Contract Automation**: Automatic loyalty token distribution using Stellar smart contracts
- **Asset Tokenization**: Create branded tokens for gift cards, vouchers, and seasonal promotions
- **Decentralized Identity**: Optional privacy-preserving customer profiles using Stellar's identity features
- **Cross-Border Payments**: Accept payments from international customers without currency conversion headaches
- **Transparent Accounting**: Immutable transaction records for audit compliance
- **Partner Network**: Enable token exchange between participating restaurants on Stellar DEX

## 🎯 Benefits to the Stellar Ecosystem

TheLighted contributes to Stellar's growth and adoption in several key ways:

1. **Real-World Use Case**: Demonstrates Stellar's practical application in the hospitality industry, showcasing fast, low-cost payments to mainstream users
2. **Merchant Adoption**: Onboards restaurants and their customers to the Stellar network, expanding the ecosystem
3. **Token Economy**: Creates demand for XLM and stablecoins like USDC through daily transactions
4. **Network Effects**: Multi-restaurant loyalty programs increase on-chain activity and liquidity
5. **Developer Example**: Serves as an open-source reference for integrating Stellar into SaaS applications
6. **Financial Inclusion**: Enables unbanked restaurant workers to receive tips and wages via Stellar wallets

## 🏗️ Technology Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn/ui, Radix UI
- **State Management**: Zustand / Redux Toolkit
- **Blockchain**: Stellar SDK for JavaScript
- **Wallet Integration**: Freighter, Albedo, LOBSTR
- **Forms**: React Hook Form + Zod validation
- **Charts**: Recharts / Chart.js
- **QR Codes**: qrcode.react

### Backend
- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: TypeORM
- **Authentication**: JWT + Passport
- **Blockchain**: Stellar Node.js SDK
- **Payment Processing**: Stellar Anchor integration
- **File Upload**: Cloudinary / AWS S3
- **Real-time**: WebSockets (Socket.io)
- **Caching**: Redis
- **API Documentation**: Swagger/OpenAPI

### Blockchain (Stellar)
- **Network**: Stellar Mainnet / Testnet
- **Assets**: XLM, USDC, custom loyalty tokens
- **Smart Contracts**: Soroban (upcoming integration)
- **Wallet Support**: Freighter, Albedo, LOBSTR
- **Horizon API**: Transaction queries and account management
- **Anchors**: Integration with Stellar-compliant payment processors

### DevOps
- **Deployment**: Vercel (Frontend), Render/Railway (Backend)
- **CI/CD**: GitHub Actions
- **Monitoring**: Sentry, LogRocket
- **Testing**: Jest, React Testing Library, Supertest

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- PostgreSQL 14+
- Redis (optional, for caching)
- Stellar account (for testnet/mainnet interaction)
- Freighter wallet (for testing)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/thelighted.git
cd thelighted
```

2. **Install Frontend Dependencies**
```bash
cd frontend
npm install
```

3. **Install Backend Dependencies**
```bash
cd ../backend
npm install
```

4. **Environment Setup**

Create `.env` files in both frontend and backend directories:

**Frontend `.env.local`:**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Backend `.env`:**
```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=yourpassword
DATABASE_NAME=thelighted

JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRATION=7d

STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_MASTER_SECRET=YOUR_STELLAR_SECRET_KEY

CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

REDIS_HOST=localhost
REDIS_PORT=6379
```

5. **Database Setup**
```bash
cd backend
npm run migration:run
npm run seed
```

6. **Run Development Servers**

Terminal 1 (Frontend):
```bash
cd frontend
npm run dev
```

Terminal 2 (Backend):
```bash
cd backend
npm run start:dev
```

Visit `http://localhost:3000` to see the application.

## 📖 Documentation

### Key Concepts

#### Stellar Integration

TheLighted uses Stellar for three primary functions:

1. **Payment Processing**: Customers can pay using XLM or Stellar-based stablecoins
2. **Loyalty Tokens**: Restaurants issue custom tokens as loyalty rewards
3. **Instant Settlements**: Payments settle on the Stellar network in seconds

#### Loyalty Token Flow

```typescript
// Example: Customer earns loyalty tokens after purchase
const orderTotal = 50.00; // USD
const loyaltyRate = 0.10; // 10% back in tokens

// Backend automatically:
// 1. Receives payment in USDC on Stellar
// 2. Calculates loyalty tokens earned
// 3. Sends tokens to customer's Stellar wallet
// 4. Records transaction on-chain
```

#### Multi-Restaurant Network

Restaurants can join TheLighted's partner network, allowing:
- Shared loyalty tokens redeemable across all partners
- Cross-promotion opportunities
- Liquidity pools on Stellar DEX for token trading

### API Documentation

Once the backend is running, visit `http://localhost:3001/api/docs` for interactive API documentation.

### Stellar Wallet Setup

1. Install [Freighter](https://www.freighter.app/) browser extension
2. Create a new wallet or import existing
3. Switch to Testnet for development
4. Fund your account using [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test)

## 🧪 Testing

### Frontend Tests
```bash
cd frontend
npm run test
npm run test:coverage
```

### Backend Tests
```bash
cd backend
npm run test
npm run test:e2e
npm run test:cov
```

### Stellar Integration Tests
```bash
cd backend
npm run test:stellar
```

## 🤝 Contributing

We welcome contributions from the community! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Contribution Guidelines

- Follow the existing code style (Prettier + ESLint)
- Write tests for new features
- Update documentation as needed
- Keep commits atomic and well-described
- Ensure all tests pass before submitting PR

### Good First Issues

Check out issues labeled `good-first-issue` for beginner-friendly tasks.

---

<div align="center">

**Built with ❤️ for the Stellar Ecosystem**

</div>
