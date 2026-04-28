# Stripe integration architecture

**For AI assistants (Cursor, Copilot, etc.):** Describes how Stripe is wired in this repo. **Facts:** `src/routes/api/payments.js`, `src/routes/api/stripe.js`, `docs/API.md`. **Schema:** `docs/DB-SCHEMA.md`, `src/db/migrations/001_initial.sql`. **Pricing amounts:** `docs/SESSION-PRICING.md`.

---

## Required env vars

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Secret key (`sk_test_...` / `sk_live_...`). Used only on the server to create Checkout Sessions (`POST /api/payments/start`). |
| `STRIPE_PUBLIC_KEY` | Publishable key (`pk_test_...` / `pk_live_...`). Optional for future client-side use (e.g. Elements). Listed in `.env.example`. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret (`whsec_...`) for `POST /api/stripe/webhook`. |
| `BASE_URL` | Optional. Used when building Stripe `success_url` / `cancel_url`. If unset, derived from the incoming request (`protocol` + `Host`). |

### Billing / invoice (optional)

Used when issuing internal documents after `checkout.session.completed` (`src/services/billingDocumentService.js`, `billingDeliveryService.js`). See `docs/DB-SCHEMA.md` (`billing_documents`), `src/config/index.js` (`billing`), and `docs/payments/invoicing-mvp-implementation.md`.

| Variable | Description |
|----------|-------------|
| `BILLING_VAT_RATE` | Decimal 0–1 for VAT split on document rows; default **0.23** if unset or invalid. |
| `BILLING_DOCUMENT_PREFIX` | Prefix for `document_number` (e.g. `CT-2026-00001`); default **`CT`**. |
| `BILLING_PDF_STORAGE_DIR` | Absolute directory for generated PDFs; default **`{cwd}/storage/billing-pdfs`**. |
| `BILLING_SEND_INVOICE_EMAIL` | If **`0`** or **`false`**, PDF issuance still runs but **invoice email is skipped**. Otherwise (default) send via Resend when recipient is valid. |
| `BILLING_INVOICE_COMPANY_NAME`, `BILLING_INVOICE_COMPANY_ADDRESS`, `BILLING_INVOICE_ICO`, `BILLING_INVOICE_DIC`, `BILLING_INVOICE_IC_DPH` | Supplier block on PDF (optional strings). |

### KROS migration (status)

These variables are now required in environment setup because we are migrating invoice/receipt generation in phases from internal custom PDF generation to KROS API generation.

| Variable | Description |
|----------|-------------|
| `KROS_API_TOKEN` | API token used for authenticated calls to KROS. |
| `KROS_WEBHOOK_SECRET` | KROS webhook verification secret (**50-char key**). |
| `KROS_ENABLED` | Feature flag. Only when set to **`true`** the app sends documents to KROS. Default should stay `false` until you intentionally enable live sync. |

Current state:
- **Phase 0: completed** - KROS credentials are prepared in environment and Stripe remains authoritative for payment completion.
- **Phase 1: completed** - schema + booking billing inputs + document typing (`advance`/`settlement`/`standard`) are wired in `billing_documents`.
- **Phase 2: in progress** - KROS client + payload mapping + webhook processing are wired behind `KROS_ENABLED`.
- The two-document model is: **zálohová faktúra** after successful deposit payment, then **vyúčtovacia faktúra** after successful top-up/session payment when an advance exists.
- `advancePaymentDeduction` is populated only for `document_type = settlement` from the linked advance document amount.

---

## 1. Overview

- Integration uses **Stripe Checkout Sessions** (hosted checkout), not Payment Links.
- **Payment creation:** Single endpoint `POST /api/payments/start` (not separate `/deposit`, `/session`, `/topup` routes).
- **Confirmation of payment:** **Stripe webhooks** update `payments` and `reservations`, insert a **`billing_documents`** row for the settled payment (when applicable), and kick off **PDF + optional invoice email** in the background. The success page may poll `GET /api/payments/status`, but **authoritative state** is written by the webhook.
- Booking is **email-based** (no JWT on payment routes): the server checks an existing **reservation** in `pending_payment` with a matching `payment_type`.

**Critical rule:** Treat payment as succeeded for business logic only after the webhook has updated the DB (or after reading DB state that the webhook updated). Redirect to success URL alone is not proof of capture.

---

## 2. HTTP surface (implemented)

| Method | Path | Role |
|--------|------|------|
| POST | `/api/payments/start` | Create Checkout Session; insert `payments` row (`provider` = `stripe`, `provider_ref` = session id `cs_...`, `status` = `pending`). |
| GET | `/api/payments/status` | Read payment + reservation + slot by `session_id` (`cs_...`) for UI/polling. |
| POST | `/api/stripe/webhook` | Raw body; **not** mounted under the same middleware as `/api` JSON routes (`src/app.js`). |

Details: `docs/API.md`.

---

## 3. Checkout Session creation (`POST /api/payments/start`)

**Prerequisites:** Valid slot lock (`slotId` + `lockToken`), slot open for booking, email passes availability checks; no conflicting pending Stripe payment on the slot. Inserts a **pending** `payments` row (`reservation_id` null); reservation is created and linked in **`checkout.session.completed`** (`src/routes/api/stripe.js`).

**Amounts (server-side):** See `src/lib/bookingCheckoutAmounts.js`.

- **Deposit:** Cents from **`returnPath`** funnel (`site` → 45 €; `pilot` → 10 € while `BOOKING_FUNNEL_LOW_DEPOSIT_PROMO` is on, else 45 €).
- **Full:** Client sends **`amount`** = **85** € (only accepted value); stored as cents with `payments.payment_type` = `session`.

**Redirects:**

- `success_url`: `{BASE_URL or request origin}/{returnPath}?payment_pending=1&session_id={CHECKOUT_SESSION_ID}` — the funnel page shows a blocking overlay and polls `GET /api/payments/status` until `payment.status === 'completed'` (webhook), then redirects to `/{returnPath}/success?session_id=…`.
- `cancel_url`: `{BASE_URL or request origin}/{returnPath}/cancel`
- `returnPath` is optional; normalized to a funnel name in `FUNNEL_INSTANCES` (empty/invalid → `site`, unknown segment → `pilot` — see `validateReturnPath`).

**Stripe Session fields:** `mode: payment`, `payment_method_types: ['card']`, `customer_email` from request body, `line_items` with `price_data` (EUR), `metadata` (see below).

---

## 4. Webhook (`POST /api/stripe/webhook`)

**Verification:** `Stripe-Signature` + `STRIPE_WEBHOOK_SECRET`; body must remain **raw** for `constructEvent`.

**Database:** If the MySQL pool is not configured, responds **503**.

**Idempotency:** Before handling, if `event.id` already exists in `webhook_events`, respond **200** `{ received: true }` and do nothing else.

**Handled event types:**

| Event | Behavior |
|-------|----------|
| `checkout.session.completed` | In a **DB transaction:** find **pending** `payments` row by `provider_ref = session.id`. Update payment to **`completed`** and `paid_at`. If `reservation_id` is set, set reservation to **`confirmed`**. Call **`billingDocumentService.insertBillingDocumentForCompletedPayment`** — inserts **`billing_documents`** with `status = recorded`, snapshots email/name, VAT split from gross (`BILLING_VAT_RATE`), Stripe ids from session. Insert **`webhook_events`** for `event.id`, **commit**. After commit: audit (`payment_confirmed`, `billing_document_recorded`); **`billingDeliveryService.processBillingDocumentDelivery(billingDocumentId)`** in the background (assigns **`document_number`** via **`billing_document_counters`**, writes PDF, optionally sends **invoice email** — errors logged, HTTP response not blocked). If there is a reservation, **`sendReservationConfirmation`** also runs **asynchronously** (separate from invoice pipeline). |
| `checkout.session.expired` | If pending payment exists for `session.id`, set payment `status` to **`expired`**. Insert `webhook_events` for `event.id`. |
| Other types | Logged only; still returns **200** `{ received: true }` at end of handler. |

**Payment status values in DB:** `pending`, `completed`, `failed`, `expired`, `refunded` (not the string `paid`).

**Lookup key:** Stripe Checkout Session id `cs_...` is stored in `payments.provider_ref` (unique).

**Billing idempotency:** **`webhook_events`** prevents replay of the same Stripe `evt_...`. **`billing_documents`** has **UNIQUE (`payment_id`)** so a second insert for the same payment fails at DB level if ever attempted outside that guard.

---

## 5. Metadata on Checkout Session

Set in code when creating the session (`metadata`):

| Key | Content |
|-----|---------|
| `reservationId` | String |
| `userId` | String; empty if no user row |
| `paymentType` | `deposit` or `session` (maps DB enum for full session payment) |
| `funnelName`, `funnelCampaign`, `funnelVideoId` | From reservation row (attribution) |

The webhook handler does **not** rely on metadata to find the payment row; it uses `session.id` → `provider_ref`.

---

## 6. Database model

**Authoritative columns:** See `docs/DB-SCHEMA.md` — `payments` uses `reservation_id`, `provider_ref` (Stripe session id), `payment_type` (`deposit` \| `session` \| `topup`), `amount_cents`, `status`, `paid_at`, etc. **`webhook_events.stripe_event_id`** stores Stripe `evt_...` for idempotency. **`billing_documents`** (one row per completed payment in the MVP path) and **`billing_document_counters`** hold internal invoicing state, PDF path, and email send timestamps.

Do not duplicate full column lists here; keep them in `DB-SCHEMA.md` / `001_initial.sql`.

---

## 7. Security notes

| Topic | Implementation |
|-------|------------------|
| Amount tampering | Deposit and full amounts are fixed server-side from `returnPath` / validation rules; full must be exactly 85 €. |
| Spoofed success | Success/cancel pages must not assume payment succeeded; webhook updates state. |
| Webhook forgery | Signature verification required. |
| Duplicate processing | `webhook_events` + unique `provider_ref` on payments + unique `billing_documents.payment_id`. |

---

## 8. Post-payment emails

After `checkout.session.completed` **commits**, two **independent** async paths run (each `.catch` logs errors; **200** is returned to Stripe regardless):

1. **Reservation confirmation** — `emailService.sendReservationConfirmation` when `reservation_id` was present on the payment. Logged template id: **`reservation-confirmation`**. EJS: `src/templates/emails/reservation-confirmation.ejs`.
2. **Billing invoice** — `billingDeliveryService.processBillingDocumentDelivery` allocates **`document_number`**, renders PDF, then optionally **`emailService.sendBillingInvoiceEmail`** (templates **`billing-invoice`** / **`billing-invoice-resend`** for admin resend). Skipped when `BILLING_SEND_INVOICE_EMAIL` is disabled; recipient must be a valid email (not e.g. `(unknown)` placeholder). See `docs/EMAILING.md`.

Both paths log to **`email_sent_log`** when Resend returns a message id.

KROS sync is a third async path: `syncToKros(billingDocumentId)` is fire-and-forget and never blocks Stripe webhook completion. Failures are persisted in `billing_documents.kros_last_error` and logs.

---

## 9. KROS webhook

- Endpoint: `POST /api/kros/webhook` (raw body, same raw-body mounting pattern as Stripe webhook).
- Signature header: `X-Kros-Signature-256`.
- Verification algorithm: **HMAC-SHA256 where both payload and secret are converted to UTF-16LE bytes before hashing**; digest compared as Base64.
- Invalid signature returns **400** and is ignored.
- Valid webhook always returns **200** after processing to avoid retries:
  - `status = 200` -> mark document `kros_status = webhook_received`, store `kros_document_id`, `kros_download_url`, payload snapshot.
  - `status = 207` -> mark document `kros_status = failed`, store problem details in `kros_last_error`.
  - unmatched `externalId` -> logged and acknowledged (200).

---

## 10. Error handling (summary)

| Scenario | Behavior |
|----------|----------|
| Invalid webhook signature | **400** |
| Missing pool / Stripe secret where required | **503** / errors from API layer |
| `checkout.session.completed` but no pending payment for session | Handler logs warning; no row update; still **200** after switch |
| Unhandled event types | Logged; **200** `{ received: true }` |

---

## 11. Testing and release

| Phase | Notes |
|-------|--------|
| Local | Test keys; `stripe listen --forward-to localhost:PORT/api/stripe/webhook`; put CLI `whsec_...` in `STRIPE_WEBHOOK_SECRET`. |
| Staging / alwaysdata | HTTPS endpoint `https://.../api/stripe/webhook` in Dashboard (test mode). |
| Live | Live keys + separate live webhook endpoint. |

---

## 12. Future extensions

Examples: **`charge.refunded`** (or equivalent) to drive **correction / refund** billing rows; admin-initiated Checkout; PaymentIntents outside Checkout; more webhook types. **Not implemented** unless added to `src/routes/api/stripe.js` / `payments.js`. Admin **regenerate PDF** / **resend invoice** for existing documents lives under **`/admin/billing`** (not webhook).

---

## References

- `docs/API.md` — Request/response shapes.
- `docs/SESSION-PRICING.md` — Product pricing copy and rules.
- `docs/EMAILING.md` — Resend, templates, logging (confirmation + invoice).
- `docs/payments/invoicing-mvp-implementation.md` — Invoicing domain and edge cases.
- [Stripe Checkout Session API](https://stripe.com/docs/api/checkout/sessions), [Webhooks](https://stripe.com/docs/webhooks)
