# Payment settlement demo checklist (issue #316)

A repeatable, end-to-end walkthrough of order → wallet-signed payment →
confirmed → funds distributed (restaurant + platform fee + loyalty token)
→ order marked paid, on Stellar testnet, through the real UI and API —
not a script. See `docs/adr/0001-payment-custody-model.md`,
`docs/adr/0003-payment-confirmation-reconciliation.md`, and
`docs/adr/0004-platform-fee-and-loyalty-distribution.md` for the
architecture this exercises.

## Prerequisites

- [ ] Backend running with `STELLAR_NETWORK=testnet` and a reachable
      `STELLAR_HORIZON_URL` (see `backend/.env.example`).
- [ ] `LOYALTY_ISSUER_SECRET` set to a funded testnet keypair (fund via
      [Friendbot](https://laboratory.stellar.org/#account-creator?network=test)),
      and the loyalty asset (`LOYALTY_ASSET_CODE`, default `BITE`) issued
      from that same account.
- [ ] Optional, to also exercise the fee split: `PLATFORM_FEE_STELLAR_ADDRESS`
      set to a funded testnet account, `PLATFORM_FEE_BPS` > 0 (e.g. `250`
      for 2.5%).
- [ ] A restaurant record with `stellarWalletAddress` set to a funded
      testnet account.
- [ ] The diner's own wallet (Freighter) installed, switched to Testnet,
      funded via Friendbot, and — if paying in a non-XLM asset — a
      trustline already established for that asset (the checkout UI's
      trustline-setup step, issue #315, or manually via Stellar Laboratory).
- [ ] The diner's wallet also holds a trustline for the loyalty asset
      (`LOYALTY_ASSET_CODE`/its issuer) — otherwise the loyalty payout will
      correctly and repeatedly fail with `MISSING_TRUSTLINE` until one is
      added; that failure mode is itself worth demonstrating once (see
      "Fallback / retry procedure" below).

## Walkthrough

1. **Place an order** through the real diner-facing flow (order
   notification → checkout). Note the `orderId`.
2. **Open checkout** for that order and connect the diner's wallet
   (Freighter) via the UI.
3. **Pay**: confirm the payment in the UI. This calls
   `POST /payments/stellar/initiate`, gets back an unsigned XDR envelope
   (single-operation, or two operations if a platform fee is configured —
   inspect the XDR in Stellar Laboratory to see both `Operation.payment`
   legs sharing one signature), signs it with the connected wallet, and
   submits it via `POST /payments/stellar/:paymentId/submit-signed`.
4. **Watch confirmation happen live**: the payment status moves
   `pending -> submitted -> confirmed` in the UI, driven by
   `PaymentReconciliationService`'s polling (~10s cadence) — no manual
   refresh needed if the payments WebSocket (`/payments` namespace) is
   connected; the reconnect-safe `GET /payments/stellar/:paymentId`
   fallback works identically if it isn't.
5. **Confirm on-chain funds movement directly** (not just via the API) —
   look up both destination accounts on
   [Stellar Expert](https://stellar.expert/explorer/testnet) or Stellar
   Laboratory:
   - [ ] The restaurant's `stellarWalletAddress` balance increased by the
         net amount (full amount minus fee, if a fee is configured).
   - [ ] If a fee is configured, `PLATFORM_FEE_STELLAR_ADDRESS` balance
         increased by the fee amount, in the **same transaction hash** as
         the restaurant's payment (proving the atomic split — one
         transaction, two operations).
6. **Watch the loyalty payout happen live**: within a few seconds of
   confirmation, `LoyaltyPayoutService`'s own cron tick submits a separate,
   platform-signed transaction. Watch the diner's wallet balance for the
   loyalty asset (`LOYALTY_ASSET_CODE`) increase by 10% of the payment
   amount (the README's worked-example rate, `LOYALTY_RATE_BPS=1000` by
   default) — or check `GET /payments/:paymentId/payout` (staff-facing,
   requires an authenticated admin session) for its status transitioning
   `pending -> submitted -> confirmed`.
7. **Confirm the order flips to paid**: the restaurant-side order view
   shows the order's status moved from `pending` to `confirmed` —
   `PaymentReconciliationService` does this the moment the payment
   confirms, in the same reconciliation pass (see ADR 0004).
8. **All traceable to one order**: from the `orderId`, you should be able
   to reach — the `Payment` row (with `platformFeeAmount`/
   `platformFeeDestination` if applicable), its `stellarTxHash`, the
   `LoyaltyPayout` row (`paymentId` foreign key), and its own
   `stellarTxHash` — three independently-verifiable on-chain facts, one
   order.

## Fallback / retry procedure (testnet Horizon flakiness)

Testnet Horizon occasionally rate-limits or drops requests. This flow is
built to tolerate that without a diner ever seeing a false "failed":

- If **submission** returns an ambiguous error (timeout, dropped
  connection), the payment stays `submitted` — reconciliation resolves it
  by independently checking Horizon by hash on its next tick. No action
  needed; just wait and re-check status.
- If **confirmation polling** hasn't resolved after 180s (the transaction's
  own timebounds — `TRANSACTION_TIMEOUT_SECONDS`), the payment is marked
  `expired`, not `failed` — this means "never charged," safe to retry the
  payment from step 3.
- If a **loyalty payout** fails (e.g. Horizon hiccup, or a missing
  trustline on the diner's wallet), `LoyaltyPayoutService` retries it
  automatically with exponential backoff (30s, 60s, 120s, up to a 300s
  cap) — no re-run of the primary payment needed. To force an immediate
  retry during a live demo instead of waiting out the backoff,
  `POST /payments/:paymentId/payout/retry` (staff-facing, manager role or
  above) clears the backoff so the next ~10s tick picks it up.
- If you need to demonstrate the failure-and-recovery path deliberately:
  temporarily remove the diner's loyalty-asset trustline before paying,
  confirm the payout lands in `failed` with a `MISSING_TRUSTLINE`-shaped
  reason, add the trustline back, then either wait for the next backoff
  window or use the manual retry endpoint above — it should reach
  `confirmed` without ever creating a second `LoyaltyPayout` row for the
  same payment (the `paymentId` unique constraint).
