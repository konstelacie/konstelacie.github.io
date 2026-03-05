# Stripe Integration Architecture

**For AI assistants (Cursor, Copilot, etc.):** This document defines the technical architecture for Stripe payment integration. Use it when implementing payment flows, webhooks, or database models. Do not duplicate pricing logic—see `docs/SESSION-PRICING.md` for amounts and rules.

---

## 1. Stripe Integration Overview

### Rationale

Stripe is integrated **directly via the Stripe API** (not Payment Links). This approach provides:

- Full control over checkout flow and metadata
- Server-side validation of amounts against pricing rules
- Tight coupling with the reservation/session workflow
- Webhook-driven confirmation as the single source of truth

### High-Level Architecture

Stripe sits between the backend API and the payment processor. The backend:

1. Validates user eligibility and pricing
2. Creates Stripe Checkout Sessions
3. Receives webhook events from Stripe
4. Updates the database based on webhook confirmation

### Architecture Flow

```
User (logged in)
    → Backend API (validates, loads pricing, creates session)
    → Stripe Checkout (hosted payment page)
    → User completes payment on Stripe
    → Stripe sends webhook to Backend
    → Backend verifies signature, updates Database
    → User redirected to success/cancel URL
```

**Critical rule:** Payment success is confirmed **only** when the webhook is received and processed. Client-side redirects or URL parameters must never be trusted for payment state.

---

## 2. Stripe Components Used

| Component | Role |
|-----------|------|
| **Stripe Checkout Sessions** | Hosted payment page. Backend creates a session with `line_items`, `metadata`, `success_url`, `cancel_url`. User is redirected to Stripe-hosted URL. |
| **Stripe Webhooks** | Server-to-server events. Stripe POSTs to our webhook endpoint when payment state changes. Used for `checkout.session.completed` and related events. |
| **PaymentIntent** | Used internally by Checkout Sessions. We do not create PaymentIntents directly; Checkout abstracts this. We may store `payment_intent` from the session for reconciliation. |
| **Metadata** | Custom key-value pairs attached to Checkout Sessions. Essential for webhook reconciliation (user, booking, payment type). |
| **Customer email** | Pre-filled from authenticated user. Can be set via `customer_email` or `customer` (Stripe Customer ID) when creating the session. |

### Why Not Payment Links

Payment Links are excluded because:

- Amounts are defined in the Link, not validated server-side against our pricing document
- Limited metadata and reconciliation options
- No programmatic control over eligibility or session context

---

## 3. Backend API Design

### Payment Creation Endpoints

| Method | Endpoint | Responsibility |
|--------|----------|-----------------|
| POST | `/api/payments/deposit` | Create Checkout Session for **reservation fee** (first session: 10 €; future sessions: 45 €). Requires authenticated user and valid session/booking context. |
| POST | `/api/payments/session` | Create Checkout Session for **full session payment** (first or future). Amount validated against pricing document (min 45 €, suggested options). |
| POST | `/api/payments/topup` | Create Checkout Session for **top-up payment** (e.g. after reservation, user pays remaining amount). Amount validated against rules (min 45 € total for first session continuation). |

### Webhook Endpoint

| Method | Endpoint | Responsibility |
|--------|----------|-----------------|
| POST | `/api/stripe/webhook` | Receives Stripe events. Verifies signature; processes `checkout.session.completed`; updates payment and booking state; returns 200 quickly. |

### Endpoint Logic (Summary)

**POST /api/payments/deposit**

1. Require authentication.
2. Load booking/session context (e.g. first vs future session).
3. Load pricing rules from pricing document (or config derived from it).
4. Determine amount: 10 € (first session) or 45 € (future).
5. Validate no duplicate deposit for same booking.
6. Create Checkout Session with `payment_type: deposit`, metadata.
7. Return `{ url: session.url }` for client redirect.

**POST /api/payments/session**

1. Require authentication.
2. Load booking/session context.
3. Validate `amount` from request body against pricing rules (min 45 €, allowed range).
4. Create Checkout Session with `payment_type: session`, metadata.
5. Return `{ url: session.url }`.

**POST /api/payments/topup**

1. Require authentication.
2. Load booking/session context (must have prior deposit).
3. Validate amount against rules (e.g. total paid + topup ≥ 45 € for first session).
4. Create Checkout Session with `payment_type: topup`, metadata.
5. Return `{ url: session.url }`.

**POST /api/stripe/webhook**

1. Verify signature using `STRIPE_WEBHOOK_SECRET`.
2. Parse event type.
3. For `checkout.session.completed`: extract metadata, update payment record, update booking state.
4. Return 200 within 5 seconds (Stripe retries on timeout).
5. Implement idempotency (see Section 5).

---

## 4. Payment Creation Flow

### Step-by-Step

1. **User logged in** — All payment endpoints require valid session/JWT. Unauthenticated requests return 401.

2. **Backend validates eligibility** — Check that the user can perform this payment type for this booking (e.g. no duplicate deposit, booking exists, session not already fully paid).

3. **Backend loads pricing rules from pricing document** — Amounts and rules come from `docs/SESSION-PRICING.md` (or a config module that codifies it). The backend **never** trusts client-supplied amounts for validation; it uses the pricing document as the source of truth.

4. **Backend creates Stripe Checkout Session** — With validated amount, metadata, success/cancel URLs. Amount is in smallest currency unit (cents for EUR).

5. **User redirected to Stripe** — Client receives `session.url` and redirects (e.g. `window.location.href = url`).

6. **Stripe processes payment** — User completes payment on Stripe-hosted page.

7. **Webhook confirms payment** — Stripe sends `checkout.session.completed` to our webhook. This is the **single source of truth** for payment success.

8. **Database updated** — Webhook handler updates `payments` table and related `sessions`/`bookings` state.

### Where Validation Happens

| Validation | Location |
|------------|----------|
| Amount against pricing rules | Backend, before creating Checkout Session |
| User authentication | Backend, at start of each payment endpoint |
| Booking/session existence | Backend, before creating Checkout Session |
| Duplicate payment prevention | Backend (idempotency) + webhook (idempotency key) |
| Payment success | Webhook only; never from client redirect |

---

## 5. Webhook Handling

### Endpoint

`POST /api/stripe/webhook`

- Must accept raw body for signature verification (do not parse JSON before verification).
- Use `stripe.webhooks.constructEvent(body, signature, secret)` to verify.

### Signature Verification

- Header: `Stripe-Signature`
- Secret: `STRIPE_WEBHOOK_SECRET` (from Stripe Dashboard → Webhooks)
- Reject request with 400 if signature invalid.

### Events to Listen For

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Update payment status to `paid`; update booking/session state; trigger any post-payment logic. |
| `checkout.session.expired` | Optionally mark session as expired; no payment recorded. |

Other events (e.g. `payment_intent.succeeded`) may be logged but are not the primary trigger—Checkout Session completion is sufficient.

### Idempotency

- Use `event.id` as idempotency key. Before processing, check if `event.id` was already processed (e.g. in `webhook_events` table or similar).
- If already processed: return 200 immediately.
- Prevents duplicate database updates on Stripe retries.

### Updating Payment State

- Look up payment by `stripe_session_id` (from `session.id` in event).
- Set `status = 'paid'`, `paid_at = NOW()`.
- Update related `sessions`/`bookings` (e.g. `payment_status`, `total_paid`).
- Webhook confirmation is the **single source of truth**—never update payment state based on success URL or client-side logic.

---

## 6. Database Model

### Tables Overview

| Table | Purpose |
|-------|---------|
| `users` | User accounts (auth). Referenced by `payments.user_id`. |
| `sessions` (or `bookings`) | Reservation/session records. Links to `payments` via `session_id`. |
| `payments` | Payment records. One row per Stripe Checkout Session. |

### Payments Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | PK, auto-increment | Internal ID |
| `user_id` | FK → users | Payer |
| `session_id` | FK → sessions | Related booking/session (nullable for top-ups without direct session) |
| `stripe_session_id` | VARCHAR(255), unique | Stripe Checkout Session ID (`cs_...`) |
| `stripe_payment_intent` | VARCHAR(255), nullable | From session, for reconciliation |
| `payment_type` | ENUM | `deposit`, `session`, `topup` |
| `amount` | INT | Amount in cents |
| `currency` | VARCHAR(3) | e.g. `eur` |
| `status` | ENUM | `pending`, `paid`, `failed`, `expired`, `refunded` |
| `metadata_json` | JSON, nullable | Additional metadata snapshot |
| `created_at` | TIMESTAMP | When record created |
| `paid_at` | TIMESTAMP, nullable | When webhook confirmed payment |

### Relationships

- `payments.user_id` → `users.id`
- `payments.session_id` → `sessions.id`
- A session can have multiple payments (e.g. deposit + top-up).

### Webhook Events Table (Optional but Recommended)

| Column | Type | Description |
|--------|------|-------------|
| `id` | PK | |
| `stripe_event_id` | VARCHAR(255), unique | `evt_...` — idempotency key |
| `processed_at` | TIMESTAMP | When processed |

---

## 7. Stripe Metadata Strategy

### Metadata Fields

Attach to Checkout Session `metadata`:

| Key | Value | Purpose |
|-----|-------|---------|
| `userId` | Internal user ID | Link payment to user in webhook |
| `sessionId` | Internal session/booking ID | Link payment to booking |
| `paymentType` | `deposit` \| `session` \| `topup` | Determine handling logic |
| `internalReference` | Optional unique ref | Audit trail, support |

### Why Metadata Is Critical

- Webhook payload contains `session.metadata` but not our database IDs.
- Without metadata, we cannot reliably match `checkout.session.completed` to the correct `payments` and `sessions` rows.
- Metadata is immutable once the session is created—safe for reconciliation.

---

## 8. Security Considerations

| Risk | Mitigation |
|------|-------------|
| **Client-side price manipulation** | All amounts validated server-side against pricing document. Client may send desired amount, but backend rejects if outside allowed range. |
| **Spoofed payment success** | Never trust success URL or query params. Only webhook confirmation updates payment state. |
| **Webhook forgery** | Verify `Stripe-Signature` using webhook secret. Reject unverified requests. |
| **Duplicate payments** | Idempotency via `event.id`; unique constraint on `stripe_session_id`. |
| **Email bypass** | Pre-fill `customer_email` from authenticated user. Stripe can require email; we ensure it matches our user. |
| **Amount tampering** | Backend computes/validates amount from pricing rules. Never use client-supplied amount without validation. |

### Backend Validation Summary

- Authentication required for all payment creation endpoints.
- Amounts derived from pricing document, not client input (or client input validated against document).
- Webhook signature verification mandatory.
- Idempotency prevents duplicate processing.

---

## 9. Error Handling Strategy

| Scenario | Handling |
|----------|----------|
| **Cancelled payment** | User clicks "Back" on Stripe. No webhook for success. Payment remains `pending` or can be marked `expired` if session expires. User can retry by creating new session. |
| **Incomplete payment** | Stripe may send `checkout.session.expired`. Mark session expired. No payment recorded. |
| **Webhook retries** | Stripe retries on non-2xx or timeout. Idempotency ensures safe retries. Return 200 only after successful processing (or after detecting already-processed event). |
| **Temporary Stripe outage** | Checkout creation may fail. Return 503; client can retry. Webhook retries handle delayed events. |
| **Database failure during webhook** | Return 500 so Stripe retries. Ensure webhook handler is transactional where possible. |

### Timeouts

- Webhook handler must respond within ~5 seconds. Defer heavy work (e.g. emails) to background job if needed.

---

## 10. Future Extensions

| Capability | Notes |
|------------|-------|
| **Refunds** | Stripe API supports refunds. Add `POST /api/payments/:id/refund` with admin auth. Update `payments.status` to `refunded`. |
| **Payment history in client area** | Query `payments` by `user_id`. Display in client dashboard. |
| **Admin dashboard** | List payments, filter by status/type, view Stripe Dashboard link via `stripe_session_id`. |
| **Suspicious activity monitoring** | Log failed validations, unusual amounts. Alert on patterns (e.g. many failed attempts). |

---

## References

- **Pricing rules:** `docs/SESSION-PRICING.md` — All amounts, reservation vs full payment, first vs future sessions.
- **Project practices:** `docs/PRACTICES.md` — Conventions, paths, structure.
- **Stripe Checkout:** [Stripe Checkout Session API](https://stripe.com/docs/api/checkout/sessions)
- **Stripe Webhooks:** [Stripe Webhooks](https://stripe.com/docs/webhooks)
