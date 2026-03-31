# API reference

**Canonical behavior:** Match `src/routes/` and `docs/IMPLEMENTATION-SNAPSHOT.md`. This document describes the **public JSON HTTP API** under `/api`.

- **JSON API base:** `/api` — all routes below use JSON request/response unless noted.
- **Operator admin (HTML):** Session-based UI at `/admin` — not JSON; see [Admin (operator UI)](#admin-operator-ui) and `docs/ui-ux/admin-interface.md`.
- **Stripe webhook:** `POST /api/stripe/webhook` is mounted **separately** in `src/app.js` (raw body for signatures). It does **not** go through the same middleware stack as `/api/*` from `src/routes/api/index.js`.

---

## Conventions

**Responses:** JSON. Success bodies typically include `"ok": true`.

**Errors:** For routes using `ApiError`, error shape is:

```json
{
  "ok": false,
  "error": "ERROR_CODE",
  "message": "Human-readable message",
  "details": {}
}
```

`details` is omitted when empty. A few endpoints (e.g. `GET /api/payments/status` validation) return `{ "ok": false, "error": "..." }` without `message` / `details`.

**Request ID:** Routes under `src/routes/api/index.js` set `X-Request-Id` (echoed from incoming `X-Request-Id` or generated).

---

## GET /api/slots

List slots in a date range, with lock state for the booking UI.

**Query params:**

- `from` (required): ISO date `YYYY-MM-DD`
- `to` (required): ISO date `YYYY-MM-DD`
- `lockToken` (optional): UUID — if it matches the active lock on a slot, that slot has `isMyLock: true`

**Validation:** Range inclusive; maximum **31** calendar days (`from` through `to`).

**Example:**

```bash
curl "http://localhost:3000/api/slots?from=2026-03-05&to=2026-03-10"
```

**Response 200:**

Slots include explicit calendar coordinates (`localDate`, `gridIndex`, `timeKey`) computed on the server; the UI should not derive cell placement from `startAt`/`endAt` alone.

```json
{
  "ok": true,
  "range": { "from": "2026-03-05", "to": "2026-03-10" },
  "grid": {
    "timezone": "Europe/Bratislava",
    "times": ["08:30", "10:00", "11:30", "13:00", "14:30"]
  },
  "slots": [
    {
      "id": 1,
      "localDate": "2026-03-05",
      "gridIndex": 0,
      "timeKey": "08:30",
      "startAt": "2026-03-05T07:30:00.000Z",
      "endAt": "2026-03-05T09:00:00.000Z",
      "timezone": "Europe/Bratislava",
      "status": "open",
      "capacity": 1,
      "isLocked": false,
      "isMyLock": false,
      "lockExpiresAt": null
    }
  ]
}
```

---

## POST /api/slots/:slotId/lock

Lock a slot for **5 minutes** (time to enter email in the booking UI). Use **POST /api/slots/:slotId/extend-lock** after the user submits email to extend the hold to **15 minutes** for payment.

**Body (optional):**

```json
{ "email": "optional@domain.com" }
```

**Response 200:**

```json
{
  "ok": true,
  "slotId": 1,
  "lockToken": "550e8400-e29b-41d4-a716-446655440000",
  "expiresAt": "2026-03-05T18:05:00.000Z"
}
```

**Response 409 (`SLOT_LOCKED`):**

```json
{
  "ok": false,
  "error": "SLOT_LOCKED",
  "message": "Slot is already locked",
  "details": { "retryAfterSeconds": 523 }
}
```

---

## POST /api/slots/:slotId/extend-lock

Extend an active lock to **15 minutes** and set the **email** on the lock (after the user submits email, before payment).

**Body:**

```json
{
  "lockToken": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@domain.com"
}
```

**Response 200:**

```json
{
  "ok": true,
  "expiresAt": "2026-03-05T18:15:00.000Z"
}
```

**Response 404 (`LOCK_INVALID`):** lock not found or expired.

---

## POST /api/revoke

Release a slot lock (`slot_locks` row).

**Parameters:** `slotId` and `lockToken` may be sent in the **JSON body**, **query string**, or `lockToken` via header **`X-Lock-Token`**.

**Body example:**

```json
{ "slotId": 1, "lockToken": "550e8400-e29b-41d4-a716-446655440000" }
```

**Response 200:**

```json
{ "ok": true, "revoked": true }
```

`revoked` is `false` when no matching lock existed (already expired or revoked).

---

## POST /api/reservations

Create a reservation from a valid, unexpired lock. Sets status to `pending_payment`.

**Body:**

| Field | Required | Description |
|-------|----------|-------------|
| `slotId` | yes | Positive integer |
| `lockToken` | yes | UUID (36 chars) |
| `email` | yes | Valid email |
| `paymentType` | yes | `"deposit"` or `"full"` |
| `amount` | if `paymentType` is `full` | Integer **euros**, minimum **45** |
| `funnelName` or `funnel` | no | Must be a known funnel instance (e.g. `pilot`) |
| `funnelCampaign` or `campaign` | no | Campaign id; default `default`. Must exist in that funnel’s campaign map |

**Funnel attribution:** The server stores `funnel_name`, `funnel_campaign`, and resolves **`funnel_video_id`** from campaign config (`src/routes/funnels.js` — `INSTANCE_CAMPAIGNS`). Clients do **not** send `funnelVideoId`; it is derived server-side.

**Example:**

```bash
curl -X POST http://localhost:3000/api/reservations \
  -H "Content-Type: application/json" \
  -d '{"slotId":1,"lockToken":"YOUR-LOCK-TOKEN","email":"user@example.com","paymentType":"deposit","funnelName":"pilot","funnelCampaign":"default"}'
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

**Errors:** `VALIDATION_ERROR`, `NOT_FOUND`, `SLOT_NOT_OPEN`, `LOCK_INVALID`, `SLOT_RESERVED`, etc. See `src/middleware/validators.js` and `src/routes/api/reservations.js`.

---

## GET /api/reservations/:id/status

Reservation snapshot for polling: reservation fields, slot times, latest payment status.

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

`paymentUrl` is reserved for future use; currently `null`.

**Errors:** 404 — reservation not found. **503** — database not configured.

---

## POST /api/payments/start

Create a Stripe Checkout Session for a reservation in `pending_payment`. Returns the Stripe-hosted URL to redirect the browser.

**Body:**

| Field | Required | Description |
|-------|----------|-------------|
| `reservationId` | yes | Positive integer |
| `paymentType` | yes | `"deposit"` or `"full"` — must match the reservation’s `payment_type` |
| `amount` | if `full` | Integer euros, minimum **45** (converted to cents server-side) |
| `returnPath` | no | Funnel segment used for success/cancel URLs (e.g. `pilot`). If invalid or omitted, defaults to `pilot`. Must be in `FUNNEL_INSTANCES`. |

**Deposit amount:** Fixed in code at **1000** cents (10 €). **Full** payment stores `payment_type` `session` in `payments` with the given amount.

**Response 200:**

```json
{
  "ok": true,
  "url": "https://checkout.stripe.com/c/pay/cs_..."
}
```

**Errors:** 400 `VALIDATION_ERROR`, 404 `NOT_FOUND`, 409 `CONFLICT`, 503 `INTERNAL_ERROR` (Stripe or DB missing).

**Env:** `STRIPE_SECRET_KEY`, `BASE_URL` optional (defaults to request origin). See `docs/STRIPE-ARCHITECTURE.md` and `docs/SESSION-PRICING.md`.

---

## GET /api/payments/status

Load payment and reservation state by **Stripe Checkout Session ID** (success page / polling).

**Query:**

- `session_id` (required): must start with `cs_`

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
    "localDate": "2026-03-05",
    "gridIndex": 0,
    "timeKey": "08:30",
    "startAt": "2026-03-05T07:30:00.000Z",
    "endAt": "2026-03-05T09:00:00.000Z",
    "timezone": "Europe/Bratislava"
  }
}
```

While the webhook has not completed, `payment.status` may be `"pending"` and `paidAt` `null`.

**Errors:** 400 — missing/invalid `session_id` (body shape `{ "ok": false, "error": "..." }`). 404 — payment not found. **503** — database not configured.

---

## POST /api/stripe/webhook

**Not** under `src/routes/api/index.js`. **Method:** `POST` only. **Body:** raw JSON (Stripe signature). **Headers:** `Stripe-Signature` required.

**Env:** `STRIPE_WEBHOOK_SECRET`

**Handled events:** `checkout.session.completed`, `checkout.session.expired` (see `src/routes/api/stripe.js`). Others are acknowledged but not persisted.

**Response:** `200` with `{ "received": true }` on success.

Full flow: `docs/STRIPE-ARCHITECTURE.md`.

---

## POST /api/cron/run (GET also supported)

Runs registered jobs in `src/jobs/index.js` (currently **pre-session reminder** only).

**Auth:**

- **Production:** `CRON_SECRET` via `Authorization: Bearer <secret>`, `X-Cron-Secret: <secret>`, or `?secret=`.
- **Development:** if `NODE_ENV === 'development'` and the request `Host` is localhost, secret is not required.

**Example:**

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

**Response 401:** invalid or missing secret (non-localhost / non-dev).

See `docs/SCHEDULED-EMAILS-CRON.md`.

---

## Seed data (optional)

Public listing requires each slot to start **≥ 24 hours** from now (and weekdays in the funnel). Do not seed slots for **today** only—they will not appear.

Prefer `npm run db:seed-slots` / `node scripts/seed-slots.js`, which picks the first **weekday from tomorrow onward** where all seeded times meet the 24h rule.

Manual SQL example (replace with real UTC instants for your `local_date` + `grid_index`):

```sql
INSERT INTO slots (local_date, grid_index, timezone, start_at_utc, end_at_utc, status, capacity) VALUES
('2026-03-10', 0, 'Europe/Bratislava', '2026-03-10 07:30:00.000', '2026-03-10 09:00:00.000', 'open', 1);
```

---

## HTML and misc (not under `/api` alone)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/` | Home |
| GET | `/:funnelName` | Funnel page (`FUNNEL_INSTANCES`) |
| GET | `/:funnelName/success` | Checkout success (typically `?session_id=cs_...`) |
| GET | `/:funnelName/cancel` | Checkout cancelled |
| GET | `/ochrana-udajov` | Privacy / cookies — `src/routes/legal.js` |
| GET | `/obchodne-podmienky` | Terms — `src/routes/legal.js` |
| GET | `/health` | JSON DB health |
| GET | `/robots.txt`, `/sitemap.xml` | Static files |

---

## Admin (operator UI)

**Not a JSON API.** The internal admin is **HTML + form posts** under **`/admin`**, with cookie session (`admin.sid`). Credentials: `ADMIN_USERNAME` / `ADMIN_PASSWORD`; `SESSION_SECRET` signs the session in production.

**Purpose:** Slot management (create, bulk, block/unblock/cancel), reservation list/detail, operator actions (confirm/cancel reservation, notes, external-handling note), **billing documents** (list, export CSV, detail, regenerate PDF, resend invoice mail, notes), and **`/admin/maintenance`** (batched purge of expired `slot_locks`; batched delete of past slots with no `reservations` row). Full route list and UX: `docs/ui-ux/admin-interface.md` and `docs/IMPLEMENTATION-SNAPSHOT.md` — Admin section.

There is **no** public **`/api/admin/*`** or REST surface for these actions today.

---

## Not implemented (tracked for later)

- `POST /api/reservations/:id/cancel` (public cancel; admin cancel exists at `/admin/reservations/:id/cancel`)
- JSON **REST** admin API (optional future; operator UI is HTML form posts)
