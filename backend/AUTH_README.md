# Authentication & User Management System

Complete JWT-based authentication system with role-based access control (RBAC) for TheLighted platform.

## Features Implemented

✅ User registration with email verification  
✅ JWT-based authentication (access & refresh tokens)  
✅ Password reset with secure token flow  
✅ Role-based authorization (Customer, Restaurant Owner, Admin)  
✅ Multi-restaurant ownership support  
✅ Rate limiting on authentication endpoints  
✅ Secure password hashing with bcrypt  
✅ Async email processing with Bull queue  
✅ Profile management endpoints  
✅ Security headers with Helmet  
✅ CORS configuration  
✅ Input validation with class-validator  

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - Logout (revoke refresh token)
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `POST /api/auth/verify-email` - Verify email address
- `GET /api/auth/me` - Get current user

### User Management
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `PATCH /api/users/password` - Change password
- `DELETE /api/users/account` - Delete account
- `GET /api/users/:id` - Get user by ID (Admin only)
- `GET /api/users` - List all users (Admin only)
- `PATCH /api/users/:id/role` - Update user role (Admin only)

## Setup Instructions

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and update values:
```bash
cp .env.example .env
```

Required environment variables:
- `JWT_SECRET` - Secret key for JWT tokens
- `JWT_REFRESH_SECRET` - Secret key for refresh tokens
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` - PostgreSQL configuration
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` - Email configuration
- `REDIS_HOST`, `REDIS_PORT` - Redis for Bull queue
- `FRONTEND_URL` - Frontend URL for email links

### 3. Start PostgreSQL and Redis
```bash
# Using Docker
docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres
docker run --name redis -p 6379:6379 -d redis
```

### 4. Run Migrations (if needed)
The application uses TypeORM with `synchronize: true` in development, which automatically creates tables.

### 5. Start the Application
```bash
npm run start:dev
```

The API will be available at `http://localhost:3000/api`

## Testing

### Run Unit Tests
```bash
npm run test
```

### Run E2E Tests
```bash
npm run test:e2e
```

### Run with Coverage
```bash
npm run test:cov
```

## Security Features

### Rate Limiting
- Global: 10 requests per minute
- Login: 5 attempts per 15 minutes
- Registration: 3 attempts per hour
- Password reset: 3 attempts per hour

### Password Requirements
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character

### Token Expiry
- Access Token: 15 minutes
- Refresh Token: 7 days
- Email Verification: 24 hours
- Password Reset: 1 hour

## Architecture

### Database Schema
- **users** - User accounts with roles
- **refresh_tokens** - JWT refresh token storage
- **password_resets** - Password reset tokens
- **restaurant_owners** - User-restaurant relationships

### Guards
- **JwtAuthGuard** - Applied globally, validates JWT tokens
- **RolesGuard** - Checks user roles for protected routes
- **RestaurantOwnerGuard** - Verifies restaurant ownership

### Decorators
- `@Public()` - Mark routes as public (skip JWT auth)
- `@Roles(...roles)` - Specify required roles
- `@CurrentUser()` - Extract current user from request

## Usage Examples

### Register a New User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123!",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123!"
  }'
```

### Access Protected Route
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Refresh Token
```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

## Integration with Existing Modules

The authentication system integrates with:
- **Orders Module** - Associates orders with authenticated users
- **Payments Module** - Links wallets to user accounts
- **Analytics Module** - Filters data by restaurant ownership

Apply `@UseGuards(JwtAuthGuard, RestaurantOwnerGuard)` to restaurant-specific endpoints.

## Troubleshooting

### Email Not Sending
- Check SMTP credentials in `.env`
- Verify Redis is running for Bull queue
- Check email service logs

### JWT Token Issues
- Ensure `JWT_SECRET` is set in `.env`
- Check token expiry times
- Verify token is passed in `Authorization: Bearer` header

### Database Connection Errors
- Verify PostgreSQL is running
- Check database credentials in `.env`
- Ensure database exists

## Next Steps

- [ ] Add OAuth2 providers (Google, Facebook)
- [ ] Implement 2FA (Two-Factor Authentication)
- [ ] Add session management dashboard
- [ ] Implement account lockout after failed attempts
- [ ] Add audit logging for security events

## License

MIT
