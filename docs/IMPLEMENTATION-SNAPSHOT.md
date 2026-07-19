# Implementation snapshot (code-first)

**Purpose:** Point-in-time inventory of what the codebase actually does. **HTTP details (public JSON):** `docs/API.md`. **Tables/columns:** `docs/DB-SCHEMA.md`. **Planned / not built yet:** `docs/IMPLEMENTATION-PLAN.md`. Regenerate or update this file when making large behavior changes.

**Generated:** 2026-07-17 (from repository state).

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
6. `res.locals.metaPixelId` — from `config.metaPixelId` (`META_PIXEL_ID`); used with marketing cookie consent on public pages.
7. **Mount order:** `/api` → `/admin` → **`/` legal** (`src/routes/legal.js`) → funnels (`src/routes/funnels.js`) → index (`src/routes/index.js`) → static (`src/routes/static.js`: `robots.txt`, `sitemap.xml`) → health (`src/routes/health.js`).

---

## HTTP routes

### Pages (HTML)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/` | Home; `src/routes/index.js` |
| GET | `/:funnelName` | Funnel instance (see Funnels). Invalid name → `next('route')`. |
| GET | `/:funnelName/success` | Post–Stripe Checkout success (query `session_id` used client-side / status flow). |
| GET | `/:funnelName/cancel` | Checkout cancelled. |
| GET | `/ochrana-udajov` | Privacy / GDPR page; `src/routes/legal.js` → `ochrana-udajov.ejs`. |
| GET | `/obchodne-podmienky` | Terms; `src/routes/legal.js` → `obchodne-podmienky.ejs`. |
| GET | `/robots.txt` | File from repo root `robots.txt`. |
| GET | `/sitemap.xml` | Generated from `SITE_HOME_MODE` (`src/routes/static.js`). |
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
| GET | `/admin/maintenance` | Údržba: stats + preview for expired `slot_locks` and deletable past slots (no reservations). |
| POST | `/admin/maintenance/delete-expired-slot-locks` | Purge expired `slot_locks` (batched; checkbox `confirm`; audit `slot_locks_expired_purged`). |
| POST | `/admin/maintenance/delete-old-unused-slots` | Delete past slots with `end_at_utc < NOW` and no `reservations` row (batched; checkbox `confirmUnusedSlots`; audit `old_unused_slots_purged`). |
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
| GET | `/admin/billing` | List billing documents (search). |
| GET | `/admin/billing/export.csv` | CSV export (search). |
| GET | `/admin/billing/:id` | Billing document detail. |
| POST | `/admin/billing/:id/regenerate-pdf` | Regenerate PDF on disk. |
| POST | `/admin/billing/:id/resend-email` | Resend invoice email (`billing-invoice-resend`). |
| POST | `/admin/billing/:id/note` | Operator notes on document. |

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
| POST | `/api/assessment/submit` | Life Autopilot Assessment unlock: validate answers, server score, persist `assessment_submissions`, fire `assessment_email_unlocked` + optional CAPI Lead. Captcha + rate limit. See `docs/API.md`, `docs/leads/assessment-conversion-events.md`. |
| POST | `/api/cron/run` | Run scheduled jobs (auth below). |
| GET | `/api/cron/run` | Same as POST (for browser/cron GET). |

### Stripe webhook (separate mount)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/stripe/webhook` | Stripe signed webhooks (`src/routes/api/stripe.js`). Verifies test and prod webhook secrets. **Not** under the main `/api` router’s JSON stack; raw body only. |

**Handled Stripe event types (in code):**

- `checkout.session.completed` — in a transaction: payment **`completed`**, reservation **`confirmed`** (if linked), **`billing_documents`** row via `billingDocumentService`, **`webhook_events`** insert; after commit: async **`billingDeliveryService.processBillingDocumentDelivery`** (document number, PDF, optional invoice email) and **`sendReservationConfirmation`** when `reservation_id` present (async).
- `checkout.session.expired` — marks payment `expired` if pending.
- Other event types: logged, no DB update.

---

## Environment variables (referenced in code)

| Variable | Used for |
|----------|----------|
| `PORT` | Server listen (default 3000). |
| `NODE_ENV` | Morgan dev logging; API error message detail in `apiError`. |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL pool (`getPoolConfig` in `src/config/database.js`). Pool is **disabled** when **`host`**, **`user`**, or **`database`** is falsy after defaults (empty **`DB_USER`** is the usual case until `.env` is set). |
| `META_PIXEL_ID` | Facebook Pixel id; `res.locals.metaPixelId` (`src/app.js`). |
| `SITE_LEGAL_ENTITY`, `SITE_LEGAL_EMAIL` | Legal pages + imprint; `SITE_LEGAL_EMAIL` falls back to `RESEND_FROM_EMAIL` (`src/config/index.js` → `views`). |
| `STRIPE_SECRET_KEY_TEST`, `STRIPE_SECRET_KEY_PROD` | Checkout backend per page mode (`docs/PAGE-VISIBILITY.md`). |
| `STRIPE_WEBHOOK_SECRET_TEST`, `STRIPE_WEBHOOK_SECRET_PROD` | Webhook signature verification. |
| `BASE_URL` | Success/cancel URLs for Checkout; fallback `req.protocol` + host. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME` | Resend email (`src/email/provider.js`, `src/config/index.js`). |
| `BILLING_VAT_RATE` | Optional; VAT decimal for net/VAT split on billing rows (`src/services/billingDocumentService.js`; default 0.23). |
| `BILLING_DOCUMENT_PREFIX`, `BILLING_PDF_STORAGE_DIR`, `BILLING_SEND_INVOICE_EMAIL`, `BILLING_INVOICE_*` | Invoice numbering, PDF dir, suppress email, supplier block on PDF (`src/config/index.js`, `billingDeliveryService`). |
| `KROS_API_TOKEN`, `KROS_WEBHOOK_SECRET` | KROS migration preparation secrets (Phase 0). Current issuance path still uses internal billing PDF pipeline; KROS wiring is planned, not implemented in code paths yet. |
| `CRON_SECRET` | Cron auth (`Authorization: Bearer`, `X-Cron-Secret`, or `?secret=`); dev localhost bypass. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Internal admin login (`src/config/index.js`). |
| `SESSION_SECRET` | Signs admin session cookie; required in production (`src/app.js`). |

---

## Database schema (MySQL)

**Source of truth:** `src/db/migrations/001_initial.sql` (frozen baseline at go-live) plus newer numbered migrations. See `docs/DB-MIGRATIONS.md`.

**Database name:** `citim_teda_som` (created in migration).

**Tables:**

| Table | Role |
|-------|------|
| `schema_migrations` | Migration runner bookkeeping. |
| `users` | Identity by email. |
| `slots` | Bookable slots (`status`: open, blocked, cancelled). |
| `slot_locks` | Short-lived locks (`lock_token` UUID, `expires_at` — duration set by API: 5 min after lock, 15 min after extend). Expired rows are ignored by availability queries; optional row purge via **`/admin/maintenance`** (no scheduled cron job for this). |
| `reservations` | Booking workflow (`status`: draft, pending_payment, confirmed, cancelled, expired); funnel fields; optional `admin_note`. |
| `payments` | Stripe Checkout (`provider_ref` = session id `cs_...`; unique); `payment_type` deposit, session, topup. |
| `billing_documents` | Internal invoicing; unique `payment_id`; PDF + email pipeline. |
| `billing_document_counters` | Per-year sequence for `document_number`. |
| `webhook_events` | Stripe `evt_...` idempotency. |
| `email_sent_log` | Transactional email audit. |
| `audit_logs` | Generic audit trail. |
| `lead_event_types` / `lead_events` | Funnel analytics (migrations `002`–`003`, `008` for assessment KPI). |
| `assessment_submissions` | Free assessment unlock rows (migration `007`). |
| `capi_send_log` | Meta CAPI send audit (migration `005`). |

---

## Booking / payment constants (code)

- **Lock (before email):** 5 minutes — `LOCK_HOLD_BEFORE_EMAIL_MS` in `src/routes/api/slots.js`.
- **Lock (after email, until payment):** 15 minutes — `LOCK_HOLD_AFTER_EMAIL_MS` (applied by `POST /api/slots/:slotId/extend-lock`).
- **Deposit (first payment):** 1000 cents (10 €) — `DEPOSIT_CENTS_FIRST` in `src/routes/api/payments.js`.
- **Full payment minimum:** 45 € → validated as amount ≥ 45 in reservations and payments; stored in cents in DB (`amount * 100` in payments flow for full).
- **Timezone (UI date defaults):** `Europe/Bratislava` for funnel booking date min/max and copy.

---

## Funnels

**Registry:** `FUNNEL_INSTANCES` / `FUNNEL_PAGE_INSTANCES` / `FUNNEL_PAGE_TYPES` in `src/config/funnelInstances.js` — page funnels: `pilot`, `manipulacia` (`video-booking`), `autopilot` (`assessment`).

**Visibility:** `FUNNEL_{NAME}_MODE=hidden|test|prod` (e.g. `FUNNEL_AUTOPILOT_MODE`). Test URLs use `-test` suffix. Never in sitemap; always `noindex`. See `docs/PAGE-VISIBILITY.md`.

### Video-booking (`pilot`, `manipulacia`)

**Campaigns** (for `/:funnelName?campaign=id`): `INSTANCE_CAMPAIGNS` in `src/routes/funnels.js`.

**Templates:** `src/views/funnels/{name}.ejs`; shared partials `_funnel-content.ejs`, `_funnel-success.ejs`, `_funnel-cancel.ejs`.

**Video resolution:** `src/config/funnelVideo.js` (`resolveCampaignVideo`) — supports `self`, `wistia`, legacy iframe `videoUrl`.

**Assets:** `/assets/css/funnel.css`, `/assets/js/booking.js`, `/assets/js/funnel.js`; success page `/assets/js/success-page.js`.

### Assessment (`autopilot`)

**Product:** Free Life Autopilot Assessment → email unlock → results → soft CTA to paid diagnosis (~190 €, no Stripe in v1).

**Template / assets:** `src/views/funnels/autopilot.ejs`, `/assets/css/assessment.css`, `/assets/js/assessment.js`, scoring in `/assets/js/assessment-scoring.js` (required from `src/lib/assessmentScoring.js`).

**Config / copy:** `src/config/assessmentAutopilot.js` (from `docs/funnel/it-dev/017-assessment-content-sk.md`).

**API / DB:** `POST /api/assessment/submit` → `assessment_submissions`; lead event `assessment_email_unlocked` (migration `008`). Docs: `docs/funnel/it-dev/README.md`, `docs/funnel/it-dev/016-assessment-v1-summary.md`, `docs/leads/assessment-conversion-events.md`.

**Results CTA:** Option A — dual `mailto:` (`SUPPORT_EMAIL`) for info + waitlist.

**Sitemap:** dynamic — `/` when `SITE_HOME_MODE=prod`, plus legal pages. Funnel URLs never listed.

---

## Front-end assets (funnel / booking)

Loaded by video-booking funnel template (see `funnels.js` `extraStyles` / `extraScripts`):

- `/assets/css/funnel.css`
- `/assets/js/booking.js`
- `/assets/js/funnel.js`
- `/assets/js/success-page.js` on success page only.

Assessment pages load `assessment.css` / `assessment.js` instead (no booking widget).

**PseudoChat:** Implemented under `public/assets/js/pseudochat/` and `public/assets/css/pseudochat.css`; **not** included on funnel bundles above (see `docs/PSEUDOCHAT.md`).

---

## Email

- **Provider:** Resend (`src/email/provider.js`).
- **Templates (EJS):** `reservation-confirmation.ejs`, `pre-session-reminder.ejs`, `billing-invoice.ejs`, `billing-invoice-resend.ejs` under `src/templates/emails/`.
- **Sent from code:**
  - After `checkout.session.completed` — `emailService.sendReservationConfirmation` (async; when payment has reservation).
  - Same webhook path — `billingDeliveryService.processBillingDocumentDelivery` → `sendBillingInvoiceEmail` (initial invoice, PDF attach) unless disabled / invalid recipient.
  - Admin **`POST /admin/billing/:id/resend-email`** — `resendBillingInvoiceEmailAdmin` → `sendBillingInvoiceEmail` with `resend: true`.
  - Cron **`pre-session-reminder`** — `emailService.sendPreSessionReminder` (`reservationsRepo.findDueForPreSessionReminder`).

**Template IDs (logging):** `reservation-confirmation`, `pre-session-reminder`, `billing-invoice`, `billing-invoice-resend` — see `docs/EMAILING.md` (parity table).

**Operator free-form email** from admin is **not** implemented; **invoice resend** is (see above).

---

## Cron / scheduled jobs

- **Endpoint:** `POST` or `GET` `/api/cron/run`.
- **Auth:** `CRON_SECRET` via Bearer, `X-Cron-Secret`, or `?secret=`; **or** `NODE_ENV === 'development'` and request host is localhost.
- **Jobs:** `src/jobs/index.js` registers `preSessionReminder` only (`src/jobs/preSessionReminder.js`).

---

## Related config modules

- `src/config/index.js` — port, env, db, Meta Pixel id, **site** (legal entity/email), Resend, **billing**, cron secret, admin credentials.
- `src/config/database.js` — pool creation guard (needs host, user, database).
- `src/config/funnelVideo.js` — campaign video resolution for EJS.
- `src/config/slotGrid.js` — grid times / timezone helpers used by API and admin.

---

## Out of scope for this snapshot

- **Detailed** repository query logic (see `src/db/repositories/`).
- **Marketing / creative** file listing beyond funnel video config — see `docs/CREATIVE-MEDIA.md` and `public/assets/media/funnel/`.

When docs disagree with this file, **prefer the code** unless the team explicitly changes behavior and then updates both.
