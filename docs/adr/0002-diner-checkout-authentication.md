# ADR 0002: Diner checkout authentication

- **Status:** Accepted
- **Date:** 2026-08-21
- **Related issue:** #313

## Context

Every existing authenticated route in this backend assumes a **staff member**:
`JwtAuthGuard` verifies a token against the `AdminUser` table and attaches
`restaurantId`/`role` to the request (`modules/auth/jwt.strategy.ts`). A diner
scanning a QR code at their table and paying for their own order is not a
staff member and has no `AdminUser` row — there is no diner identity model
in this codebase at all today.

`PaymentsController`'s `initiate`/`submit-signed` endpoints are diner-facing.
Left unguarded (or guarded by the existing staff `JwtAuthGuard`), either the
endpoint is wide open to anyone who knows an `orderId`, or diners simply
cannot use it.

## Decision

A diner's payment request is authorized by a **short-lived, order-scoped
checkout token** — a JWT distinct from the staff token, carrying
`{ sub: 'diner', type: 'checkout', orderId, restaurantId }` and expiring in
`CHECKOUT_TOKEN_TTL_SECONDS` (default 15 minutes — long enough to complete a
checkout, short enough that a leaked/logged URL stops working quickly).

- **Issuance:** `GET /orders/:orderId/checkout-token`, gated by the existing
  staff `JwtAuthGuard` (a staff member/POS system requests it when seating a
  table or printing/generating that table's QR code). The QR code encodes a
  URL containing this token; scanning it is what gives a diner's phone the
  authority to pay for that specific order.
- **Verification:** `DinerCheckoutGuard` (`modules/orders/guards/`) verifies
  the token and attaches `{ orderId, restaurantId }` to the request.
  `PaymentsController` marks its diner-facing routes `@Public()` (bypassing
  the global staff `JwtAuthGuard`) and applies `DinerCheckoutGuard` instead.
- **Scoping:** every payment-mutating call re-checks that the token's
  `orderId` matches the `orderId` being acted on — a valid token for order A
  can never be used to touch order B, even by request forgery.

This is deliberately **stateless** (no session table, no diner accounts) —
consistent with ADR 0001's non-custodial decision: the platform doesn't hold
diner identity any more than it holds diner funds. It is not a general-purpose
diner auth system; it authorizes exactly one thing (paying for the order it
was issued for) for exactly as long as the TTL allows.

## Alternatives considered

- **No auth at all (rely on `orderId` obscurity):** rejected — a UUID isn't
  a secret, and the issue explicitly calls this out as a real gap ("this
  endpoint isn't wide open").
- **Full diner accounts (email/phone + password or OTP):** far more than a
  QR-code, walk-up checkout flow needs, and a much larger, separate feature
  with its own security surface (credential storage, account recovery,
  etc.) — out of scope for a payment-initiation issue.
- **Reusing the staff `JwtAuthGuard`/`AdminUser`:** would require creating a
  fake `AdminUser` row per diner or per order, conflating two very
  different identity concepts and bloating the admin-user table with
  non-staff rows.

## Consequences

- `AuthModule` now exports `JwtModule` (previously module-local) so
  `OrdersModule` — which already imports `AuthModule` — can mint/verify
  checkout tokens with the same `JWT_SECRET` without a second registration.
- The QR-code generation/printing flow itself (turning a checkout-token
  response into an actual scannable code) is a frontend concern, not
  addressed here.
- If a genuine multi-session diner identity product need emerges later
  (order history, saved payment methods, etc.), that is a new ADR — this
  decision should not be stretched to cover it.
