# Implementation snapshot (code-first)

**Purpose:** Point-in-time inventory of what the codebase actually does. **HTTP details (public JSON):** `docs/API.md`. **Tables/columns:** `docs/DB-SCHEMA.md`. **Planned / not built yet:** `docs/IMPLEMENTATION-PLAN.md`. Regenerate or update this file when making large behavior changes.

**Generated:** 2026-03-26 (from repository state).

---

## Application entry

- **Server:** Express (`src/app.js`).
- **Views:** EJS + `express-ejs-layouts`; views under `src/views/`.
- **Static files:** `GET /assets/*` → `public/assets/` (path is `public/assets`).

**Middleware order (relevant):**

1. `POST /api/stripe/webhook` — raw body (`express.raw({ type: 'application/json' })`) for Stripe signature verification.
2. `express.json()`, `express.urlencoded({ extended: true })`, `cookie-parser`.
3. `express-session` — admin session cookie `admin.sid` (see `src/app.js`).
4. `morgan` in non-production.
5. `GET /assets` static.
6. **Mount order:** `/api` → `/admin` → funnel routes (`/`) → index (`/`) → static (`/robots.txt`, `/sitemap.xml`) → `/health`.

---

## HTTP routes

### Pages (HTML)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/` | Home; `src/routes/index.js` |
| GET | `/:funnelName` | Funnel instance (see Funnels). Invalid name → `next('route')`. |
| GET | `/:funnelName/success` | Post–Stripe Checkout success (query `session_id` used client-side / status flow). |
| GET | `/:funnelName/cancel` | Checkout cancelled. |
| GET | `/robots.txt` | File from repo root `robots.txt`. |
| GET | `/sitemap.xml` | File from repo root `sitemap.xml`. |
| GET | `/health` | JSON DB health (`src/routes/health.js`). |

### Admin (HTML, session — not JSON API)

**Router:** `src/routes/admin.js`, base path **`/admin`**. **UI/UX spec:** `docs/ui-ux/admin-interface.md`.

**Auth:** `ADMIN_USERNAME` + `ADMIN_PASSWORD` (`src/config/index.js`); session signed with `SESSION_SECRET` (required in production; dev fallback in `app.js` if unset). Not configured → login shows a “not configured” state.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin` | Redirect → `/admin/login` or `/admin/slots` if logged in. |
| GET | `/admin/login` | Login form. |
| POST | `/admin/login` | Authenticate; redirect with `next` (same-origin `/admin/*` only). |
| POST | `/admin/logout` | End session. |
| GET | `/admin/slots` | Slot grid / management. |
| POST | `/admin/slots/create` | Create slot(s). |
| POST | `/admin/slots/bulk/preview` | Bulk slot preview. |
| GET | `/admin/slots/bulk-preview` | Bulk preview page. |
| POST | `/admin/slots/bulk/confirm` | Confirm bulk create. |
| GET | `/admin/slots/bulk-cancel` | Cancel bulk flow. |
| POST | `/admin/slots/:slotId/block` | Block slot. |
| POST | `/admin/slots/:slotId/unblock` | Unblock slot. |
| POST | `/admin/slots/:slotId/cancel` | Cancel slot (admin). |
| GET | `/admin/reservations` | Reservation list (filters). |
| GET | `/admin/reservations/:id` | Reservation detail. |
| POST | `/admin/reservations/:id/confirm` | Confirm reservation (admin). |
| POST | `/admin/reservations/:id/cancel` | Cancel reservation (admin). |
| POST | `/admin/reservations/:id/note` | Set `admin_note`. |
| POST | `/admin/reservations/:id/external` | Append external-handling note. |

There is **no** public **`/api/admin/*`** JSON surface; operator actions are form posts to `/admin/*`.

### API (`/api` prefix)

All JSON APIs use `requestId` middleware. Base: `src/routes/api/index.js`.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/revoke` | Revoke slot lock (`slotId`, `lockToken` in body/query/header `X-Lock-Token`). |
| GET | `/api/slots` | List slots in date range (`from`, `to` query). Response includes `grid` metadata and per-slot `localDate`, `gridIndex`, `timeKey` for UI placement. Optional `lockToken` for “my” lock. |
| POST | `/api/slots/:slotId/lock` | Create **5-minute** hold; body `email` optional. |
| POST | `/api/slots/:slotId/extend-lock` | Extend hold to **15 minutes** from now; body `lockToken` + `email` (required). |
| GET | `/api/reservations/:id/status` | Reservation + latest payment status. |
| POST | `/api/reservations` | Create reservation from lock; body includes funnel attribution (`funnelName` / `funnel`, `funnelCampaign` / `campaign`). |
| GET | `/api/payments/status` | Query `session_id` (`cs_...`) — payment + reservation + slot summary. |
| POST | `/api/payments/start` | Create Stripe Checkout Session; body `reservationId`, `paymentType` (`deposit` \| `full`), `amount` (full only), `returnPath` (funnel segment for success/cancel URLs). |
| POST | `/api/cron/run` | Run scheduled jobs (auth below). |
| GET | `/api/cron/run` | Same as POST (for browser/cron GET). |

### Stripe webhook (separate mount)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/stripe/webhook` | Stripe signed webhooks (`src/routes/api/stripe.js`). Uses `STRIPE_WEBHOOK_SECRET`. **Not** under the main `/api` router’s JSON stack; raw body only. |

**Handled Stripe event types (in code):**

- `checkout.session.completed` — marks payment completed, reservation `confirmed`, idempotency via `webhook_events`, triggers reservation confirmation email (async).
- `checkout.session.expired` — marks payment `expired` if pending.
- Other event types: logged, no DB update.

---

## Environment variables (referenced in code)

| Variable | Used for |
|----------|----------|
| `PORT` | Server listen (default 3000). |
| `NODE_ENV` | Morgan dev logging; API error message detail in `apiError`. |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL pool (`src/config/index.js`, `src/config/database.js`). Pool is **disabled** if `host`, `user`, or `database` is missing. |
| `STRIPE_SECRET_KEY` | Stripe Checkout Session creation (`/api/payments/start`). |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification. |
| `BASE_URL` | Success/cancel URLs for Checkout; fallback `req.protocol` + host. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME` | Resend email (`src/email/provider.js`, `src/config/index.js`). |
| `CRON_SECRET` | Cron auth (`Authorization: Bearer`, `X-Cron-Secret`, or `?secret=`); dev localhost bypass. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Internal admin login (`src/config/index.js`). |
| `SESSION_SECRET` | Signs admin session cookie; required in production (`src/app.js`). |

---

## Database schema (MySQL)

**Source of truth:** `src/db/migrations/001_initial.sql`.

**Database name:** `citim_teda_som` (created in migration).

**Tables:**

| Table | Role |
|-------|------|
| `schema_migrations` | Migration runner bookkeeping. |
| `users` | Identity by email. |
| `slots` | Bookable slots (`status`: open, blocked, cancelled). |
| `slot_locks` | Short-lived locks (`lock_token` UUID, `expires_at` — duration set by API: 5 min after lock, 15 min after extend). |
| `reservations` | Booking workflow (`status`: draft, pending_payment, confirmed, cancelled, expired); funnel fields; optional `admin_note`. |
| `payments` | Stripe Checkout (`provider_ref` = session id `cs_...`; unique); `payment_type` deposit, session, topup. |
| `webhook_events` | Stripe `evt_...` idempotency. |
| `email_sent_log` | Transactional email audit. |
| `audit_logs` | Generic audit trail. |

---

## Booking / payment constants (code)

- **Lock (before email):** 5 minutes — `LOCK_HOLD_BEFORE_EMAIL_MS` in `src/routes/api/slots.js`.
- **Lock (after email, until payment):** 15 minutes — `LOCK_HOLD_AFTER_EMAIL_MS` (applied by `POST /api/slots/:slotId/extend-lock`).
- **Deposit (first payment):** 1000 cents (10 €) — `DEPOSIT_CENTS_FIRST` in `src/routes/api/payments.js`.
- **Full payment minimum:** 45 € → validated as amount ≥ 45 in reservations and payments; stored in cents in DB (`amount * 100` in payments flow for full).
- **Timezone (UI date defaults):** `Europe/Bratislava` for funnel booking date min/max and copy.

---

## Funnels

**Registry:** `FUNNEL_INSTANCES` in `src/routes/funnels.js` — currently `['pilot']`.

**Campaigns** (for `/:funnelName?campaign=id`): defined in `INSTANCE_CAMPAIGNS.pilot`:

- `default`, `poslanie` (same hero content as default in practice),
- `zavist`.

**Templates:** `src/views/funnels/pilot.ejs` (instance page); shared partials `_funnel-content.ejs`, `_funnel-success.ejs`, `_funnel-cancel.ejs`.

**Video resolution:** `src/config/funnelVideo.js` (`resolveCampaignVideo`) — supports `self`, `wistia`, legacy iframe `videoUrl`.

**Sitemap:** `sitemap.xml` lists `https://citimtedasom.sk/` and `https://citimtedasom.sk/pilot` (no query campaign variants).

---

## Front-end assets (funnel / booking)

Loaded by funnel template (see `funnels.js` `extraStyles` / `extraScripts`):

- `/assets/css/funnel.css`
- `/assets/js/booking.js`
- `/assets/js/funnel.js`
- `/assets/js/success-page.js` on success page only.

**PseudoChat:** Implemented under `public/assets/js/pseudochat/` and `public/assets/css/pseudochat.css`; **not** included on the pilot funnel bundle above (see `docs/PSEUDOCHAT.md`).

---

## Email

- **Provider:** Resend (`src/email/provider.js`).
- **Templates (EJS):** `src/templates/emails/reservation-confirmation.ejs`, `pre-session-reminder.ejs`.
- **Sent from code:**
  - After successful `checkout.session.completed` webhook — `emailService.sendReservationConfirmation`.
  - Cron job `pre-session-reminder` — `emailService.sendPreSessionReminder` for due reservations (see `src/jobs/preSessionReminder.js`, `reservationsRepo.findDueForPreSessionReminder`).

**Template IDs (logging):** `reservation-confirmation`, `pre-session-reminder` (see `emailService` / `preSessionReminder.js`).

**Operator-composed email** from admin is **not** implemented; transactional sends only (see `docs/EMAILING.md`).

---

## Cron / scheduled jobs

- **Endpoint:** `POST` or `GET` `/api/cron/run`.
- **Auth:** `CRON_SECRET` via Bearer, `X-Cron-Secret`, or `?secret=`; **or** `NODE_ENV === 'development'` and request host is localhost.
- **Jobs:** `src/jobs/index.js` registers `preSessionReminder` only (`src/jobs/preSessionReminder.js`).

---

## Related config modules

- `src/config/index.js` — port, env, db, Resend, cron secret, admin credentials.
- `src/config/database.js` — pool creation guard (needs host, user, database).
- `src/config/funnelVideo.js` — campaign video resolution for EJS.
- `src/config/slotGrid.js` — grid times / timezone helpers used by API and admin.

---

## Out of scope for this snapshot

- **Detailed** repository query logic (see `src/db/repositories/`).
- **Marketing / creative** file listing beyond funnel video config — see `docs/CREATIVE-MEDIA.md` and `public/assets/media/funnel/`.

When docs disagree with this file, **prefer the code** unless the team explicitly changes behavior and then updates both.
