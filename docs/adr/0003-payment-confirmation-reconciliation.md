# ADR 0003: Payment confirmation, status tracking, and reconciliation

- **Status:** Accepted
- **Date:** 2026-08-22
- **Related issue:** #314

## Context

Before this issue, `PaymentsService.submitSigned` treated a successful call
to `StellarService.submitTransaction()` as equivalent to the payment being
`CONFIRMED` — set in the same code path, with no independent verification.
This conflates two genuinely different events: "we asked Horizon to submit
a transaction" and "the transaction actually settled on the ledger."

Classic Horizon's `POST /transactions` is synchronous — it blocks until the
transaction closes in a ledger, so in the common case the two events are
only milliseconds apart. But the HTTP call to Horizon can itself fail
**ambiguously**: a client-side timeout or dropped connection can fire
before Horizon's response arrives, even though the transaction was
successfully included. Treating that ambiguous case as `FAILED` risks
telling a diner their payment failed when it actually succeeded (or the
reverse, silently doing nothing while genuinely stuck).

## Decision

`Payment.status` follows a guarded state machine (`payment-state-machine.ts`):

```
PENDING -> SUBMITTED -> CONFIRMED
        \            \-> FAILED
         \            \-> EXPIRED
          \-> FAILED
           \-> EXPIRED
```

**`CONFIRMED` is only ever set by `PaymentReconciliationService`, after
independently verifying the transaction against Horizon by hash** — never
assumed from a successful submit call, however synchronous Horizon's own
API is.

Concretely:

- `PaymentsService.submitSigned` computes the transaction's hash **locally**
  from the signed XDR (`StellarService.computeTransactionHash`) *before*
  calling Horizon, and persists `status: SUBMITTED` with that hash
  immediately. This is what makes the ambiguous-error case recoverable: even
  if the submit call itself throws with no usable response, the payment
  still carries the hash needed to look it up later.
- A **definitive** Horizon rejection (a structured `result_codes` response,
  or a confirmed not-found account) transitions the payment straight to
  `FAILED` with a distinguishable `failureReason`
  (`isDefinitiveHorizonRejection`, `horizon-error-mapper.ts`).
- Any other (ambiguous/network/timeout) submit error leaves the payment at
  `SUBMITTED` — it is neither assumed successful nor assumed failed.
- `PaymentReconciliationService` polls every `SUBMITTED` payment on a short
  interval (`@Cron(CronExpression.EVERY_10_SECONDS)`), independently
  fetching the transaction by hash from Horizon:
  - `successful: true` → `CONFIRMED`.
  - `successful: false` (a rare on-ledger operation failure) → `FAILED`.
  - "not found" (`NotFoundError`) → left `SUBMITTED`; Horizon not yet having
    a record is expected for a few seconds after submission (propagation
    delay), not a failure. This is the "bounded retry before falling back"
    the issue calls for — each poll tick is one bounded attempt, bounded
    overall by the expiry check below.
  - any other error → left `SUBMITTED`, logged, retried next tick.
- Once a payment's Stellar transaction timebounds
  (`Payment.expiresAt`, mirroring `StellarService`'s own
  `TRANSACTION_TIMEOUT_SECONDS`) pass without a confirmation ever landing,
  the reconciliation job marks it `EXPIRED` — **not** `FAILED` — so the
  API/UI can tell "never charged" apart from "charge attempted and
  rejected." This applies both to `SUBMITTED` payments that never resolved
  and to `PENDING` payments that were never even submitted.
- `payment:status_changed` is emitted (via a new sibling `PaymentsGateway`,
  following `OrdersGateway`'s namespace/room/auth pattern exactly) on every
  transition — from the synchronous `submitSigned` call and from the
  asynchronous reconciliation job alike — so the checkout UI isn't left
  polling. A `GET /payments/stellar/:paymentId` endpoint exists alongside it
  so a client that misses the event (e.g. reconnecting after a dropped
  WebSocket) can fetch current status directly instead.

## Alternatives considered

- **Trust the synchronous submit response as confirmation**: rejected —
  this is exactly the behavior this issue exists to fix; it can't recover
  from an ambiguous submit-call error at all (no hash was ever recorded if
  the call throws before a response arrives, under the old design where the
  hash only ever came from Horizon's own response).
- **Horizon SSE streaming as the primary confirmation mechanism**: the
  issue suggests this for latency; not implemented here. A stream still
  needs its own reconnect/backfill handling to be safe across a service
  restart, and the polling job already re-checks every `SUBMITTED` payment
  on every tick regardless of whether a stream would have caught it —
  meaning polling alone already satisfies this issue's correctness
  requirements (confirmation within one poll interval, i.e. a few seconds).
  Layering a stream on top as a pure latency optimization is a reasonable,
  clearly-scoped follow-up, not a blocking requirement.
- **Parsing on-ledger operation-level failure reasons from `result_xdr`**:
  the acceptance criteria only requires three distinguishable on-chain
  failure reasons, already satisfied by the existing submit-time mapper
  (`INSUFFICIENT_BALANCE`, `MISSING_TRUSTLINE`, `SEQUENCE_CONFLICT`). An
  on-ledger failure caught by reconciliation (rare — most rejections happen
  at pre-ledger validation) is recorded generically
  (`SUBMISSION_FAILED`) rather than parsing raw `result_xdr`, which would
  add real complexity for a case that essentially never occurs with a
  single-operation payment transaction.

## Consequences

- `Payment.expiresAt` is now persisted (mirroring the transaction builder's
  own `setTimeout`), so both the app and the reconciliation job agree on
  when a given payment can no longer be applied.
- `PaymentsGateway` needs `JwtService` directly, so `PaymentsModule` now
  imports `AuthModule` itself rather than relying on `OrdersModule` to
  re-export it (it doesn't).
- `ScheduleModule.forRoot()` is now registered globally in `AppModule` to
  power the reconciliation `@Cron` job.
- The frontend work in #315 can treat `submitted` as "money may have moved,
  wait for confirmation" and `confirmed` as the only state that's actually
  final-success — it should never treat a successful `submit-signed` HTTP
  response alone as proof of payment.
