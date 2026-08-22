# ADR 0004: Platform fee collection and loyalty token distribution

- **Status:** Accepted
- **Date:** 2026-08-22
- **Related issue:** #316

## Context

ADR 0001 decided payment collection is non-custodial and explicitly deferred
two questions rather than answering them: "If a future issue needs a
platform-controlled account (e.g. ... to collect a platform fee via a path
payment), that is a new, narrower decision to make explicitly when that
need actually arises." Issue #316 is that future issue — it needs both a
platform fee split and, per the README's worked example, automatic loyalty
token issuance to the diner after a confirmed payment. Neither exists in
the codebase today; this ADR makes the narrower decision ADR 0001 deferred.

## Decision

**Platform fee: no new custodial key.** The fee is collected as a second
`Operation.payment` in the *same* transaction the diner already builds and
signs once (`StellarService.buildSplitPaymentTransaction`) — one operation
pays the restaurant's net amount, the other pays
`PLATFORM_FEE_STELLAR_ADDRESS`. Both land or neither does; there is no
"payment succeeded but fee collection failed" state to reconcile, because
it was never two transactions. This keeps ADR 0001's non-custodial decision
completely intact — the diner is still the only signer, for both legs.

**Loyalty distribution: a new, narrowly-scoped platform-controlled
account.** Sending a loyalty asset to the diner is fundamentally a payment
*from* the platform, which no diner signature can authorize. This
unavoidably requires a platform-held Stellar secret key
(`LOYALTY_ISSUER_SECRET`), used for exactly one thing: signing the
platform's own loyalty-asset payouts. It never touches a diner's or
restaurant's account or key material — this is the platform operating its
own wallet, the same way a restaurant operates its own
`stellarWalletAddress`, not custody of anyone else's funds. It is
deliberately **not** a revival of the never-adopted `STELLAR_MASTER_SECRET`
from the README/`.env.example` — that name implied broad, undefined
custodial authority; this key's scope is fixed to loyalty payouts and
named accordingly.

Because a payout is a genuinely separate transaction from the (now
possibly-atomic) primary payment, it needs its own idempotent,
independently-retryable lifecycle — `LoyaltyPayout` gets its own status
machine (`loyalty-payout-state-machine.ts`), mirroring `Payment`'s
`pending -> submitted -> confirmed | failed` shape from ADR 0003, with one
difference: `failed -> submitted` is a legal transition here (a fresh
submission attempt with a new sequence number), driven by
`LoyaltyPayoutService`'s own scheduled job, so a payout failure recovers
automatically instead of being a dead end. One `LoyaltyPayout` row per
`Payment` is enforced at the DB level (`paymentId` unique), the same
belt-and-suspenders pattern `Payment.idempotencyKey` uses — a payout can
never be double-issued for the same payment, no matter how many times
reconciliation re-processes it.

**Scope for this issue: one platform-wide loyalty asset, not per-restaurant
custom tokens.** The README's longer-term vision ("Restaurants issue custom
tokens as loyalty rewards," "Launch your own restaurant loyalty token")
would mean holding a *distinct* issuing key per restaurant — a much larger
custodial surface (many secrets, many restaurants' worth of key-management
and security review) that ADR 0001 already flagged as out of scope for v1
("it requires key-management infrastructure, custody/security review, and
likely regulatory exposure... that nothing in the current codebase or
roadmap justifies yet"). This issue delivers the single-asset version
(`LOYALTY_ASSET_CODE`, default `BITE`, one issuer) sufficient to
demonstrate the full settlement flow end-to-end. Per-restaurant tokens are
a distinct future decision, deserving its own ADR and security review, not
folded into this one by default — same reasoning ADR 0001 applied to
custodial diner onboarding.

**Fee rate and loyalty rate are both configurable, not hardcoded.**
`PLATFORM_FEE_BPS` (default `0`, i.e. no fee unless an operator configures
`PLATFORM_FEE_STELLAR_ADDRESS`) and `LOYALTY_RATE_BPS` (default `1000` =
10%, matching the README's worked example `loyaltyRate = 0.10` exactly).
Neither figure is specified anywhere else in this codebase or its docs;
these are placeholder defaults to be tuned to real business terms, not a
claim that 10%/0% are the "correct" rates.

## Alternatives considered

- **Fee via a separate platform-signed payout job**, mirroring loyalty's
  design. Rejected: it would need its own custodial key for money that
  originates from the diner, when the diner is already signing a
  transaction right there — needlessly widening custodial scope for no
  benefit over folding it into the same atomic, diner-signed transaction.
- **Loyalty via a pre-funded distribution account instead of an issuing
  account** (avoids `Operation.payment` needing the issuer specifically).
  Not adopted for this issue: it adds an extra funding/top-up operational
  concern (the distribution account running dry) without removing the
  core custodial-key requirement this ADR already accepts is unavoidable —
  a real optimization, but orthogonal to the decision this ADR needs to
  make, so left as a documented follow-up rather than scope creep here.

## Consequences

- `LOYALTY_ISSUER_SECRET` is the only new secret this issue introduces. It
  is loaded once at boot (`LoyaltyPayoutService.onModuleInit`, fail-fast —
  mirroring `StellarService`'s existing pattern), held only as a decoded
  `Keypair` in memory, and never appears in any log line, thrown error, or
  API response — audited explicitly in
  `loyalty-payout.service.spec.ts`.
- `SequenceAllocator` (already generic per-account) is reused for the
  loyalty issuer account, since every restaurant's confirmed orders share
  that one account and would otherwise race the same
  read-then-increment sequence problem it already solves for diner
  accounts (issue #313).
- `Order.status` gains a concrete meaning for `CONFIRMED` (previously
  declared but unused anywhere in the codebase): a `Payment` reconciling to
  `CONFIRMED` flips its `Order` from `PENDING` to `CONFIRMED` — "paid." No
  new enum value was needed.
- Staff-triggered payout visibility/retry (`PayoutsController`) is scoped
  to `AdminRole.MANAGER` and above, restaurant-scoped via
  `req.user.restaurantId`, mirroring `AdminController`'s existing pattern —
  `AdminRole.STAFF` cannot trigger a financial retry action.
