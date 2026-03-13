# API Reference (Phase 2B)

Base URL: `/api`

All responses are JSON. Errors return `{ "ok": false, "error": "...", "message": "...", "details": {...} }`.

---

## GET /api/slots

List available slots in a date range.

**Query params:**

- `from` (required): ISO date YYYY-MM-DD
- `to` (required): ISO date YYYY-MM-DD (max 31 days range)
- `lockToken` (optional): UUID to identify slots held by the current user; adds `isMyLock` to matching slots

**Example:**

```bash
curl "http://localhost:3000/api/slots?from=2026-03-05&to=2026-03-10"
```

**Response 200:**

```json
{
  "ok": true,
  "range": { "from": "2026-03-05", "to": "2026-03-10" },
  "slots": [
    {
      "id": 1,
      "startAt": "2026-03-05T18:00:00.000Z",
      "endAt": "2026-03-05T19:00:00.000Z",
      "timezone": "Europe/Bratislava",
      "status": "open",
      "capacity": 1,
      "isLocked": false,
      "lockExpiresAt": null
    }
  ]
}
```

---

## POST /api/slots/:slotId/lock

Lock a slot for 15 minutes.

**Body (optional):**

```json
{ "email": "optional@domain.com" }
```

**Example:**

```bash
curl -X POST http://localhost:3000/api/slots/1/lock \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

**Response 200:**

```json
{
  "ok": true,
  "slotId": 1,
  "lockToken": "550e8400-e29b-41d4-a716-446655440000",
  "expiresAt": "2026-03-05T18:15:00.000Z"
}
```

**Response 409 (already locked):**

```json
{
  "ok": false,
  "error": "SLOT_LOCKED",
  "message": "Slot is already locked",
  "details": { "retryAfterSeconds": 523 }
}
```

---

## POST /api/revoke

Revoke (release) a slot lock. Uses POST with JSON body.

**Body:**

```json
{ "slotId": 1, "lockToken": "550e8400-e29b-41d4-a716-446655440000" }
```

**Response 200:**

```json
{ "ok": true, "revoked": true }
```

`revoked: false` when the lock was not found or already expired.

---

## POST /api/reservations

Create a reservation from a valid lock. Requires `paymentType` and `amount` when `paymentType` is `full`. See `docs/SESSION-PRICING.md` for amounts.

**Body:**

```json
{
  "slotId": 1,
  "lockToken": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@domain.com",
  "paymentType": "deposit",
  "amount": null
}
```

- For reservation: `"paymentType": "deposit"`, `"amount"` omitted.
- For full payment: `"paymentType": "full"`, `"amount"` required (min 45, in euros).

**Example:**

```bash
curl -X POST http://localhost:3000/api/reservations \
  -H "Content-Type: application/json" \
  -d '{"slotId":1,"lockToken":"YOUR-LOCK-TOKEN","email":"user@example.com"}'
```

**Response 201:**

```json
{
  "ok": true,
  "reservation": {
    "id": 1,
    "slotId": 1,
    "email": "user@domain.com",
    "status": "pending_payment",
    "createdAt": "2026-03-05T18:05:00.000Z"
  }
}
```

---

## POST /api/payments/start

Create a Stripe Checkout Session for a pending reservation. Returns the Stripe-hosted payment URL for redirect. See `docs/STRIPE-ARCHITECTURE.md` and `docs/SESSION-PRICING.md`.

**Body:**

```json
{
  "reservationId": 1,
  "paymentType": "deposit",
  "amount": null
}
```

- `reservationId` (required): Positive integer — reservation ID from `POST /api/reservations`.
- `paymentType` (required): `"deposit"` or `"full"` — must match the reservation.
- `amount` (required when `paymentType` is `"full"`): Integer in euros, minimum 45.

**Example (deposit):**

```bash
curl -X POST http://localhost:3000/api/payments/start \
  -H "Content-Type: application/json" \
  -d '{"reservationId":1,"paymentType":"deposit"}'
```

**Example (full payment):**

```bash
curl -X POST http://localhost:3000/api/payments/start \
  -H "Content-Type: application/json" \
  -d '{"reservationId":1,"paymentType":"full","amount":85}'
```

**Response 200:**

```json
{
  "ok": true,
  "url": "https://checkout.stripe.com/c/pay/cs_..."
}
```

Client should redirect the user to `url` (e.g. `window.location.href = data.url`).

**Errors:**

- 400: `VALIDATION_ERROR` — invalid body, amount &lt; 45 when full, or paymentType mismatch.
- 404: `NOT_FOUND` — reservation not found.
- 409: `CONFLICT` — reservation not pending payment, or payment already in progress.
- 503: `INTERNAL_ERROR` — Stripe or database not configured.

---

## GET /api/payments/status

Get payment and reservation status by Stripe Checkout Session ID. Used by the success page to display confirmation and poll until webhook has processed.

**Query params:**

- `session_id` (required): Stripe Checkout Session ID (`cs_...`) from the success URL

**Example:**

```bash
curl "http://localhost:3000/api/payments/status?session_id=cs_test_..."
```

**Response 200:**

```json
{
  "ok": true,
  "payment": {
    "status": "completed",
    "amountCents": 1000,
    "paidAt": "2026-03-05T18:10:00.000Z"
  },
  "reservation": {
    "id": 1,
    "status": "confirmed",
    "slotId": 1
  },
  "slot": {
    "startAt": "2026-03-05T18:00:00.000Z",
    "endAt": "2026-03-05T19:00:00.000Z",
    "timezone": "Europe/Bratislava"
  }
}
```

When payment is still pending (webhook not yet processed), `payment.status` is `"pending"` and `paidAt` is null.

**Errors:**

- 400: Missing or invalid `session_id`
- 404: Payment not found

---

## GET /api/reservations/:id/status

Get reservation status for polling. Returns reservation, slot, and payment status.

**Example:**

```bash
curl "http://localhost:3000/api/reservations/1/status"
```

**Response 200:**

```json
{
  "ok": true,
  "id": 1,
  "status": "confirmed",
  "slotId": 1,
  "startsAt": "2026-03-05T18:00:00.000Z",
  "endsAt": "2026-03-05T19:00:00.000Z",
  "timezone": "Europe/Bratislava",
  "paymentStatus": "completed",
  "paymentUrl": null
}
```

**Errors:**

- 404: Reservation not found

---

## Seed data (optional)

To create a few slots for testing:

```sql
INSERT INTO slots (start_at, end_at, timezone, status, capacity) VALUES
('2026-03-05 18:00:00', '2026-03-05 19:00:00', 'Europe/Bratislava', 'open', 1),
('2026-03-06 10:00:00', '2026-03-06 11:00:00', 'Europe/Bratislava', 'open', 1),
('2026-03-07 14:00:00', '2026-03-07 15:00:00', 'Europe/Bratislava', 'open', 1);
```

---

## POST /api/cron/run (GET also supported)

**Cron endpoint** for scheduled jobs. Intended to run every 15 minutes via alwaysdata scheduled task. Processes all due emails; uses advisory lock to skip if a previous run is still active. See `docs/SCHEDULED-EMAILS-CRON.md` for retries, Resend rate limits, and concurrency.

**Auth:** In production, requires `CRON_SECRET` via header (`Authorization: Bearer <secret>`, `X-Cron-Secret: <secret>`) or query (`?secret=<secret>`). On localhost in development, unauthenticated requests are allowed for easy browser testing.

**Example (localhost dev):**

```
http://localhost:3000/api/cron/run
```

**Example (production):**

```bash
curl -X POST https://your-app.alwaysdata.net/api/cron/run \
  -H "X-Cron-Secret: <CRON_SECRET>"
```

**Response 200:**

```json
{
  "ok": true,
  "jobs": [
    {
      "name": "pre-session-reminder",
      "sent": 0,
      "skipped": 0,
      "errors": []
    }
  ]
}
```

**Response 401 (production, missing/invalid secret):**

```json
{
  "ok": false,
  "error": "UNAUTHORIZED",
  "message": "Invalid or missing CRON_SECRET"
}
```

---

## Not yet implemented (details to be added when available)

- `POST /api/reservations/:id/cancel` — cancel reservation
- Admin endpoints (e.g. slot creation)
