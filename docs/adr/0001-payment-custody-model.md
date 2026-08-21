# ADR 0001: Payment custody model

- **Status:** Accepted
- **Date:** 2026-08-21
- **Related issue:** #312

## Context

The README commits to two payment shapes without ever deciding between them:

- "Restaurant owners receive payments... with automatic conversion to fiat" —
  implies custodial/anchor involvement on the collection side.
- Wallet-first UX (Freighter/Albedo/LOBSTR) — implies non-custodial: the
  diner signs and sends the payment themselves.

Nothing in the codebase resolves this. `.env.example`/README document a
`STELLAR_MASTER_SECRET`, but no code reads it and no custodial account
management exists anywhere. The one piece of real evidence is
`frontend/components/checkout/StellarCheckout.tsx`, which already assumes
the diner *has their own Stellar wallet address* and enters it directly —
there is no "we'll hold your funds" onboarding flow anywhere in the UI.

This decision gates the wallet UX design (#315) and the key-management/
security scope of #316, so it needs to be made once, explicitly, before
either of those issues can be scoped correctly.

## Decision

**Payment collection is non-custodial.** The diner always signs the payment
transaction with their own wallet (Freighter/Albedo/LOBSTR); the platform
never holds diner private keys or diner funds, even transiently.

Concretely, for the service layer landing in this issue:

- `StellarService.buildPaymentTransaction()` returns an **unsigned** XDR
  envelope. The backend never has access to a diner's signing key.
- `StellarService.submitTransaction()` only ever submits an
  **already-signed** envelope handed back to it — it does not sign
  anything itself.
- The restaurant's destination account is the restaurant's own Stellar
  account, supplied when the restaurant is onboarded. Funds settle directly
  there; the platform is never a middleman holding restaurant balances
  either.

`STELLAR_MASTER_SECRET`, as documented in the README today, is **not**
adopted by this decision. No code in this issue reads or needs it — there
is nothing for the platform to sign on the diner's or restaurant's behalf.
If a future issue needs a platform-controlled account (e.g. to sponsor
account-creation reserves for a restaurant's first Stellar account, or to
collect a platform fee via a path payment), that is a new, narrower
decision to make explicitly when that need actually arises — it should not
be assumed to exist just because the env var is documented.

README's "automatic conversion to fiat" is **not** ruled out by this
decision — it is a restaurant-side concern, not a collection-side one. Once
a payment settles into a restaurant's own Stellar account, that restaurant
can independently choose to run received funds through a Stellar anchor
to off-ramp to fiat. That is a separate integration this ADR does not
scope or commit to.

## Alternatives considered

- **Custodial**: the platform holds a pooled account and settles
  internally. Rejected for v1 — it requires key-management infrastructure,
  custody/security review, and likely regulatory exposure (money
  transmission) that nothing in the current codebase or roadmap justifies
  yet, and it contradicts the wallet-first UX already built into
  `StellarCheckout.tsx`.
- **Hybrid** (custodial onboarding for new users, non-custodial for
  wallet-holders): the more flexible long-term answer, but there is no
  custodial onboarding UI, key-management, or custody-security design
  anywhere in this codebase today. Building it as a side effect of this
  foundation issue would be scope creep past what #312 asks for. If
  diner-side custodial onboarding becomes a real product requirement, it
  should be its own ADR with its own security review — not folded into
  this decision by default.

## Consequences

- `StellarService` needs no secret key material at all; it only builds
  unsigned transactions and submits signed ones. This keeps the service
  introduced in this issue simple and keeps private keys off the backend
  entirely.
- The wallet UX (#315) must support connecting a diner's existing wallet
  (Freighter/Albedo/LOBSTR) to sign the transaction `StellarService` builds
  — there is no scenario where the backend signs on the diner's behalf.
- The key-management/security scope of #316 is correspondingly narrower:
  there are no diner keys for the platform to protect, because the
  platform never holds them.
- Restaurant onboarding needs a destination Stellar account per restaurant
  (tracked as a follow-up; out of scope for this issue's `Order`/`Payment`
  schema, which stores `destinationAccount` per payment already).
