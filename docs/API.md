# API reference

**Canonical behavior:** Match `src/routes/` and `docs/IMPLEMENTATION-SNAPSHOT.md`. This document describes the **public JSON HTTP API** under `/api`.

- **JSON API base:** `/api` — all routes below use JSON request/response unless noted.
- **Operator admin (HTML):** Session-based UI at `/admin` — not JSON; see [Admin (operator UI)](#admin-operator-ui) and `docs/ui-ux/admin-interface.md`.
- **Stripe webhook:** `POST /api/stripe/webhook` is mounted **separately** in `src/app.js` (raw body for signatures). It does **not** go through the same middleware stack as `/api/*` from `src/routes/api/index.js`.
- **Resend webhook:** `POST /api/resend/webhook` — same pattern (raw body, Svix signature). See [POST /api/resend/webhook](#post-apiresendwebhook).

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

## GET /api/slots/:slotId/lock-challenge

Issue a short-lived **challenge token** (≈2 minutes, single-use) bound to the slot. The booking UI calls this **immediately before** **POST /api/slots/:slotId/lock** and sends the token in the lock body.

**Response 200:**

```json
{
  "ok": true,
  "challengeToken": "<base64url ~43 chars>",
  "challengeExpiresAt": "2026-03-05T18:02:00.000Z"
}
```

**Response 409:** Slot not bookable (same opaque handling as lock; no extra detail in production).

---

## POST /api/slots/:slotId/lock

Lock a slot for **5 minutes** (time to enter email in the booking UI). Use **POST /api/slots/:slotId/extend-lock** after the user submits email to extend the hold to **15 minutes** for payment.

Requires a valid **`challengeToken`** from **GET /api/slots/:slotId/lock-challenge** (single-use, not expired).

**Body:**

```json
{
  "challengeToken": "<from lock-challenge>",
  "email": "optional@domain.com"
}
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

Create a Stripe Checkout Session for the slot lock (before or after reservation row exists per booking flow). Returns the Stripe-hosted URL to redirect the browser.

**Body:**

| Field | Required | Description |
|-------|----------|-------------|
| `slotId` | yes | Positive integer |
| `lockToken` | yes | UUID from slot lock |
| `email` | yes | Customer email |
| `paymentType` | yes | `"deposit"` or `"full"` |
| `amount` | if `full` | Integer euros, must be exactly `BOOKING_SESSION_FULL_EUR` (default **85**; see `src/lib/bookingCheckoutAmounts.js`) |
| `returnPath` | no | Booking page path for success/cancel URLs (e.g. `/`, `/pilot`, `/pilot-test`). Normalized to internal funnel name (`/` → `site`, `/pilot-test` → `pilot`). Invalid/empty → `site`. |
| `cancelReturn` | no | Root-relative path for Stripe `cancel_url` (must stay under the same funnel path) |
| `funnelName` / `funnel`, `funnelCampaign` / `campaign`, `funnelVideoId` | no | Attribution for analytics/metadata (validated against funnel config) |

**Deposit amount (server):** From **`returnPath`** funnel via `src/lib/bookingCheckoutAmounts.js`: **`site` (home) → `BOOKING_SESSION_MIN_EUR`** (default 45 €); each funnel → **`FUNNEL_{NAME}_DEPOSIT_EUR`** if set, else `BOOKING_SESSION_MIN_EUR` (e.g. `FUNNEL_PILOT_DEPOSIT_EUR=10`). **Full** checkout uses **`BOOKING_SESSION_FULL_EUR`** (default 85 €). Optional extra amounts use the balance/doplatok flow after the session minimum is met.

**Response 200:**

```json
{
  "ok": true,
  "url": "https://checkout.stripe.com/c/pay/cs_..."
}
```

**Errors:** 400 `VALIDATION_ERROR`, 404 `NOT_FOUND`, 409 `CONFLICT`, 503 `INTERNAL_ERROR` (Stripe or DB missing).

**Env:** `STRIPE_SECRET_KEY_TEST` / `STRIPE_SECRET_KEY_PROD` (selected by page mode), `BASE_URL` optional. See `docs/PAGE-VISIBILITY.md`, `docs/STRIPE-ARCHITECTURE.md`, `docs/SESSION-PRICING.md`.

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
  },
  "meetingUrl": "https://meet.google.com/...",
  "confirmationEmail": {
    "status": "sent",
    "recipientMasked": "a***@gmail.com"
  }
}
```

`confirmationEmail.status` is one of `pending`, `sent`, `bounced`, `failed`. Provider `complained` maps to `bounced`. Omitted when no confirmation task or log exists yet.

While the webhook has not completed, `payment.status` may be `"pending"` and `paidAt` `null`.

**Errors:** 400 — missing/invalid `session_id` (body shape `{ "ok": false, "error": "..." }`). 404 — payment not found. **503** — database not configured.

### POST /api/payments/fix-confirmation-email

Client self-service after bounce or exhausted send failures. Requires the Stripe Checkout `session_id` from the success page URL.

**Body (JSON):**

```json
{
  "session_id": "cs_...",
  "email": "correct@example.com"
}
```

**Response 200:**

```json
{
  "ok": true,
  "confirmationEmail": {
    "status": "sent",
    "recipientMasked": "c***@example.com"
  }
}
```

Allowed only when `confirmationEmail.status` would be `bounced` or `failed` for that payment’s reservation. Updates `reservations.email` when changed, resends `reservation-confirmation-resend`, resolves `email_bounced` admin alert.

**Errors:** 400 — invalid `session_id` or email. 404 — payment not found. 409 — payment not completed, reservation not confirmed, email already used by another reservation, or confirmation does not need correction. 502/503 — send failure / provider not configured. **429** — rate limited.

---

## Balance / doplatok (optional supplementary payment)

Public page: **`GET /platba-doplatok?token=…`** (see `docs/SESSION-PRICING.md`, *Supplementary payment*). Product rules: cumulative completed payments for the reservation must be **≥ 45 €**; at most **one** completed `topup` per reservation; no maximum total. Eligible signed URLs are on **`GET /admin/reservations/:id`** (copy). Operators may send **`POST /admin/reservations/:id/send-balance-email`** (session + optional subject/message) to deliver template **`balance-pay-invite`** via Resend — not part of the public JSON API.

**Env:** `BALANCE_PAY_TOKEN_SECRET` (required in production — HMAC secret for signed links; see `src/lib/balancePayToken.js`). Stripe keys per `docs/PAGE-VISIBILITY.md`, `BASE_URL` for Checkout.

### GET /api/payments/balance/context

**Query:** `token` (required) — signed token from `signBalancePayToken` / `scripts/sign-balance-pay-token.js`.

**Response 200** (`state: "ready"`):

```json
{
  "ok": true,
  "state": "ready",
  "paidCents": 1000,
  "paidEuros": 10,
  "minSupplementEur": 1,
  "defaultCustomSupplementEur": 115,
  "suggestedSupplements": [
    { "targetTotalEur": 45, "supplementEur": 35, "supplementCents": 3500 }
  ],
  "slot": {
    "localDate": "2026-04-20",
    "gridIndex": 2,
    "timeKey": "12:30",
    "timezone": "Europe/Bratislava",
    "startAt": "2026-04-20T10:30:00.000Z",
    "endAt": "2026-04-20T12:00:00.000Z"
  }
}
```

Other `state` values: `not_available`, `already_completed`, `checkout_pending` — include a Slovak `message` for display.

**Errors:** **404** `INVALID_BALANCE_LINK` — invalid or expired token. **503** — database not configured.

### POST /api/payments/balance/start

**Body:**

| Field | Required | Description |
|-------|----------|-------------|
| `token` | yes | Same signed token as context |
| `supplementEur` | yes | Integer euros: either one of the suggested supplements for this reservation, or any integer **1 … 50 000** (custom) |

**Response 200:**

```json
{
  "ok": true,
  "url": "https://checkout.stripe.com/c/pay/cs_...",
  "checkoutSessionId": "cs_..."
}
```

**Errors:** **404** invalid token; **400** `VALIDATION_ERROR`; **409** `BALANCE_NOT_ALLOWED`, `BALANCE_ALREADY_PAID`, `BALANCE_CHECKOUT_PENDING`; **502** `STRIPE_ERROR`; **503** — Stripe or DB missing.

---

## POST /api/stripe/webhook

**Not** under `src/routes/api/index.js`. **Method:** `POST` only. **Body:** raw JSON (Stripe signature). **Headers:** `Stripe-Signature` required.

**Env:** `STRIPE_WEBHOOK_SECRET_TEST`, `STRIPE_WEBHOOK_SECRET_PROD`

**Handled events:** `checkout.session.completed`, `checkout.session.expired` (see `src/routes/api/stripe.js`). Initial booking checkouts create the reservation; **balance** checkouts (`payment_type` `topup`, metadata `checkoutPurpose: balance_topup`) only mark the payment completed. Others are acknowledged but not persisted.

**Response:** `200` with `{ "received": true }` on success.

Full flow: `docs/STRIPE-ARCHITECTURE.md`.

---

## POST /api/resend/webhook

**Not** under `src/routes/api/index.js`. **Method:** `POST` only. **Body:** raw JSON (Svix-signed by Resend). **Headers:** `svix-id`, `svix-timestamp`, `svix-signature` required.

**Env:** `RESEND_WEBHOOK_SECRET`

**Handled events:** `email.bounced`, `email.complained` (updates `email_sent_log.delivery_status`; `email_bounced` admin alert for `reservation-confirmation` only), `email.delivered` (sets `delivery_status = delivered` when row is still `accepted`). Other event types are acknowledged with `200` and ignored.

**Response:** `200` with `{ "received": true }` on success. **401** when signature invalid. **503** when webhook secret not configured.

See `docs/EMAILING.md` and `src/routes/api/resend.js`.

---

## POST /api/cron/run (GET also supported)

Single endpoint for **all** cron tasks. Runs registered jobs in `src/jobs/index.js`: **cron-health**, **email-delivery-tasks**, **pre-session-reminder**, **billing-deliver-stuck** (KROS webhook missing recovery), **stripe-reconciliation** (payment mismatch detector — no auto-repair). A successful run records `system_settings.last_successful_cron_run_at` and auto-resolves `cron_not_running` alerts.

**Cron health (Phase 5):** While cron is actually down, staleness is detected primarily on **admin page load** (`adminAlertBanner` → `checkCronHealth`). The `cron-health` job at the start of a run reports a stale *previous* run when cron resumes; the end of `runAll()` records success and auto-resolves the alert. Before the first successful cron run (`last_successful_cron_run_at` unset), no `cron_not_running` alert is raised. See `docs/SCHEDULED-EMAILS-CRON.md` §4.4.

**Stripe reconciliation alerts:** `stripe_payment_needs_reconciliation` = data mismatch; `stripe_reconciliation_failed` = detector could not call Stripe (auto-resolved on next successful reconciliation run).

**Auth:**

- **Production:** `CRON_SECRET` via `Authorization: Bearer <secret>` or `X-Cron-Secret: <secret>` (`?secret=` works only outside production).
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
    },
    {
      "name": "billing-deliver-stuck",
      "alerted": 0,
      "delayedEmailsQueued": 0,
      "delayedEmailsSent": 0,
      "skipped": 0,
      "errors": []
    }
  ]
}
```

**Response 401:** invalid or missing secret (non-localhost / non-dev).

See `docs/SCHEDULED-EMAILS-CRON.md`.

---

## POST /api/assessment/submit

Unlock Life Autopilot Assessment results after all questions are answered. Server recalculates scores; client-sent scores are ignored.

**Body (JSON):**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `email` | string | yes | Normalized lowercase |
| `answers` | object | yes | `{ [questionId]: 1..5 }` for all 24 ids |
| `funnelName` | string | yes | Assessment funnel (`autopilot`) |
| `funnelCampaign` | string | no | Default `default` |
| `captchaToken` | string | conditional | When adaptive captcha requires it |
| `marketingConsent` | boolean | no | Accepted; not persisted in v1 |
| `sourceUrl` | string | no | Else derived from `Referer` |

**Response 200:**

```json
{
  "ok": true,
  "submissionId": 123,
  "scores": {
    "autopilot": { "raw": 22, "percent": 66.7 },
    "identity": { "raw": 28, "percent": 91.7 },
    "energy": { "raw": 19, "percent": 54.2 },
    "relationships": { "raw": 15, "percent": 37.5 }
  },
  "ranked": [ { "dimensionId": "identity", "resultId": "identity_loop", "raw": 28, "percent": 91.7 } ],
  "primaryBottleneck": "identity_loop",
  "secondaryBottleneck": "autopilot_loop",
  "isDualPrimary": false,
  "isBalanced": false,
  "isLowOverall": false,
  "result": {
    "id": "identity_loop",
    "title": "Slučka identity",
    "summary": ["…"],
    "sections": {
      "whatItMeans": ["…"],
      "blindSpot": ["…"],
      "longTermRisk": ["…"],
      "firstStep": ["…"],
      "transition": ["…"]
    }
  },
  "secondaryResult": { "id": "autopilot_loop", "title": "Slučka autopilota" }
}
```

When `isDualPrimary` is true, `secondaryResult` includes full sections like `result`.

**Errors:** `VALIDATION_ERROR` (400), `captcha_required` / `request_cannot_be_completed` (403), `RATE_LIMITED` (429), `INTERNAL_ERROR` (503 if DB missing).

**Rate limit:** 20 / 15 min per IP+email. **Captcha:** adaptive route `assessment_submit` (see `docs/security/captcha.md`).

Persists to `assessment_submissions` (migration `007`). Does **not** create a `users` row.

**Lead analytics:** fires `assessment_email_unlocked` (metadata: scores, bottlenecks, campaign) and optional Meta CAPI `Lead` (`assessment_lead:{submissionId}`). See `docs/leads/assessment-conversion-events.md`. Requires migration `008_assessment_lead_event.sql`.

---

## Seed data (optional)

Public listing requires each slot to start **≥ 24 hours** from now (and weekdays in the funnel). Do not seed slots for **today** only—they will not appear.

Prefer `yarn db:seed-slots` / `node scripts/seed-slots.js`, which picks the first **weekday from tomorrow onward** where all seeded times meet the 24h rule.

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
| GET | `/:funnelName` | Funnel page (`FUNNEL_PAGE_INSTANCES`; assessment e.g. `/autopilot-test`) |
| GET | `/:funnelName/success` | Checkout success (video-booking funnels; typically `?session_id=cs_...`) |
| GET | `/:funnelName/cancel` | Checkout cancelled (video-booking funnels) |
| GET | `/ochrana-udajov` | Privacy / cookies — `src/routes/legal.js` |
| GET | `/obchodne-podmienky` | Terms — `src/routes/legal.js` |
| GET | `/health` | JSON DB health |
| GET | `/robots.txt`, `/sitemap.xml` | Generated from page visibility config (`src/routes/static.js`) |

---

## Admin (operator UI)

**Not a JSON API.** The internal admin is **HTML + form posts** under **`/admin`**, with cookie session (`admin.sid`). Credentials: `ADMIN_USERNAME` / `ADMIN_PASSWORD`; `SESSION_SECRET` signs the session in production.

**Purpose:** Slot management (create, bulk, block/unblock/cancel), reservation list/detail, operator actions (confirm/cancel reservation, notes, external-handling note), **billing documents** (list, export CSV, detail, regenerate PDF, resend invoice mail, notes), and **`/admin/maintenance`** (batched purge of expired `slot_locks`; batched delete of past slots with no `reservations` row). Full route list and UX: `docs/ui-ux/admin-interface.md` and `docs/IMPLEMENTATION-SNAPSHOT.md` — Admin section.

There is **no** public **`/api/admin/*`** or REST surface for these actions today.

---

## Not implemented (tracked for later)

- `POST /api/reservations/:id/cancel` (public cancel; admin cancel exists at `/admin/reservations/:id/cancel`)
- JSON **REST** admin API (optional future; operator UI is HTML form posts)
