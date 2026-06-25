# Implementation Plan: Handling Mistyped / Bounced Emails (v2)

> **Historical (pre-live):** Schema steps below assumed editing `001_initial.sql` + `db:reset`. Since go-live (2026-06), add idempotent `002_*.sql` migrations instead — see `docs/DB-MIGRATIONS.md`.

> Revision incorporating Cursor's review. Corrections from the first pass are folded in directly rather than listed as a diff — this is the version to hand to an agent for implementation.

## Context

A reservation went through payment, the email was syntactically valid, but a typo (e.g. `gmial.com`) caused a Resend bounce. The app has no idea — both the success page and the reconciliation logic assume the email was delivered, because the only check performed is `payment.status === 'completed'`.

Confirmation flow today: `email_delivery_tasks` → `emailDeliveryTaskService` → Resend → `email_sent_log`. Nothing downstream of `email_sent_log` knows about bounces.

---

## Decisions confirmed during review

| Topic | Decision |
|---|---|
| Schema change method | Edit `src/db/migrations/001_initial.sql` directly and recreate the DB locally — this project drops/recreates pre-live, no `ALTER TABLE`. |
| Timestamp type | `DATETIME(3)`, not `TIMESTAMPTZ` (MySQL, not Postgres). |
| Linking a bounce to a reservation | `email_sent_log` has no `reservation_id` column. Use `entity_type` + `entity_id` (`entity_type === 'reservation' ? entity_id : null`). |
| Webhook scope | The webhook updates `delivery_status` for **every** logged email (invoice, reminder, confirmation). Alerts fire **only** for `reservation-confirmation` bounces; other templates just get their status stored for admin visibility. |
| Admin resend vs. idempotency | `wasAlreadySent()` + the unique `(template_id, entity_type, entity_id)` constraint on tasks blocks a naive "resend same template." Needs an explicit decision in Phase 5 (see below) — either a dedicated `reservation-confirmation-resend` template id, or an admin-only path that bypasses `wasAlreadySent()`. |
| Success-page polling | Bounces can arrive after the page already shows "confirmed." Keep polling for ~2–3 minutes after `completed` instead of stopping immediately, so a late bounce can still flip the UI. |
| Svix headers | Resend signs webhooks with standard Svix headers (`svix-id`, `svix-timestamp`, `svix-signature`) — `svix` is already in the lockfile via Resend's SDK. |
| Typo detection false positives | Levenshtein ≤2 is fine because the hint is non-blocking. |
| Double opt-in | Correctly deferred — not worth the conversion cost for this edge case. |
| `stripe.js` | No bounce logic belongs there. Confirmation is task-based; the webhook, task service, and log repo are the only touch points. |

---

## Phase 1 — Schema (`email_sent_log`)

1. Edit `src/db/migrations/001_initial.sql` (not `ALTER TABLE` — project convention is drop/recreate pre-live). Add to `email_sent_log`:
   - `delivery_status` — `ENUM('accepted','delivered','bounced','complained') NOT NULL DEFAULT 'accepted'` (or `VARCHAR` if more flexibility is wanted)
   - `bounce_reason` — `TEXT NULL`
   - `bounced_at` — `DATETIME(3) NULL`
2. Add an index on `provider_message_id` — currently unindexed, needed for webhook lookups.
3. Update `docs/DB-SCHEMA.md`.
4. Recreate the DB locally and confirm existing queries still work.

---

## Phase 2 — Resend webhook (core gap)

**Config**
- Add `RESEND_WEBHOOK_SECRET` to `src/config/index.js` and `.env.example`.

**Repo — extend `emailSentLogRepo.js`**
```js
// Returns the log row with entity_type, entity_id, recipient_email, template_id, delivery_status
async function findByProviderMessageId(messageId) { /* ... */ }

// Idempotent — no-op if the row is already bounced
async function markBounced(messageId, { status, reason }) { /* ... */ }
```

**Route — new `src/routes/api/resend.js`**
- Verify the Svix signature (`svix-id`, `svix-timestamp`, `svix-signature`).
- Handle `email.bounced` and `email.complained`.
- Optionally handle `email.delivered` → set `delivery_status = 'delivered'` (nice to have, not required for MVP).

Deriving the reservation link (no `reservation_id` column on this table):
```js
const reservationId =
  logRow.entity_type === 'reservation' ? logRow.entity_id : null;
```

**Wiring — `src/app.js`**

Mount the same way Stripe/KROS webhooks are wired — raw body before `express.json()`:
```js
const resendWebhookRouter = require('./routes/api/resend');
// ...
app.use(
  '/api/resend/webhook',
  apiAccessLog,
  express.raw({ type: 'application/json' }),
  resendWebhookRouter
);
```

**Alert**
- Add `EMAIL_BOUNCED` (or reuse a reconciliation alert type) in `systemAlertService.js`.
- Fire it **only** when the bounced template is `reservation-confirmation` and `entity_type === 'reservation'`. Other bounced templates (invoice, reminder) still get `delivery_status` updated in `email_sent_log` for admin visibility, just without triggering an alert.

**Ops**
- Register `https://<domain>/api/resend/webhook` in the Resend dashboard.
- Store the signing secret in env.

**Tests**
- Unit test signature verification.
- Unit test `markBounced` idempotency (calling it twice on the same `messageId` doesn't double-fire side effects).
- Fixture for a Resend bounce payload.

**Docs**
- Update `docs/EMAILING.md` (currently says delivery webhooks are "nice to have, not required for V1").

---

## Phase 3 — Frontend safety net (quick wins)

### 3a. Re-validate on payment submit

Confirmed gap — in `booking.js` (~lines 1924–1957), `validateEmail()` is **not** called on payment form submit:
```js
paymentForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = $('booking-email').value.trim();
  // validateEmail() is NOT called here
  // ...
  submitReservation(email, paymentType, amount, billing);
});
```

Fix: call `validateEmail(email)` before `submitReservation`; show the existing `booking-email-error` element and abort on invalid input.

Note: the server already validates the regex on `/api/payments/start` via `middleware/validators.js` — this only closes the client-side bypass (e.g. if the user edits the field after the email step without re-triggering validation).

### 3b. Typo hint

- Add `suggestDomainFix()` + a small Levenshtein helper (inline, ~15 lines is enough).
- Trigger on email blur/input, not on submit — non-blocking Slovak-language hint ("Mysleli ste...?") with an apply button.
- Do not block submit — avoids any conversion impact.

### 3c. Confirm-email field

Deferred — see Phase 6.

---

## Phase 4 — Status API + success page

**Extend `GET /api/payments/status` in `payments.js`**
- Join `email_delivery_tasks` for `reservation-confirmation` + the latest `email_sent_log` row for the same entity.
- Return:
```js
confirmationEmail: {
  status: 'pending' | 'sent' | 'bounced' | 'failed',
  recipientMasked: 'a***@gmail.com',
}
```

Mapping logic:
- `failed` — task exhausted (`status === 'failed' && attempts >= max`)
- `bounced` / `complained` — from `email_sent_log.delivery_status`
- `pending` — task exists but no successful log row yet
- `sent` — logged, not bounced

**`success-page.js`**
- Always show the masked email + "Ak do pár minút nedorazí, skontroluj adresu alebo nás kontaktuj" (Slovak copy, per the baseline UX recommendation).
- If `confirmationEmail.status` is `bounced` or `failed`, swap the static line in `booking-success.ejs` ("Potvrdenie sme Ti poslali e-mailom.") for explicit warning copy.
- **Keep polling** after `completed` for ~2–3 minutes at the same interval, so a late bounce still updates the UI. Today polling stops immediately:
```js
if (status === 'completed') {
  showState('confirmed', data);
  return; // ← stops polling here; needs to continue briefly instead
}
```

**`booking-success.ejs`**
- Add DOM hooks (e.g. `#success-email-notice`, `#success-email-warning`) rather than hardcoding all copy in JS.

---

## Phase 5 — Admin recovery

**Reservation detail** (`admin/reservation-detail.ejs` + `getAdminDetailById` / `mapAdminDetail`)
- Show email, confirmation delivery status, bounce reason, timestamp.

**Admin action — `POST /admin/reservations/:id/resend-confirmation`**
- Validate the new email server-side.
- Update `reservations.email`.
- **Resend strategy (needs an explicit choice)** — follow the billing pattern (`billing-invoice-resend`):
  - Option A: a separate template id `reservation-confirmation-resend`.
  - Option B: an admin-only send path that bypasses `wasAlreadySent()` (which today blocks resending the same `template_id` + `entity_type` + `entity_id`).
- Log a new `email_sent_log` row; optionally resolve the open bounce alert.

**`stripeReconciliationService.evaluateLocalPaymentIssue`**

After loading the task, also check the bounced confirmation log:
```js
function evaluateLocalPaymentIssue(payment, task) {
  // ... existing checks ...
  if (exhausted) {
    return { failureReason: 'confirmation_email_permanently_failed' };
  }
  // new: check email_sent_log.delivery_status for this entity
  // if bounced → return { failureReason: 'confirmation_email_bounced' }
  return null;
}
```
Add `confirmation_email_bounced` as a new failure reason (or fold it into the existing reconciliation alert with distinct metadata).

Extend `phase5OperationalSafety.test.js` to cover the new failure reason.

---

## Phase 6 — Optional

Confirm-email field (1c), behind a feature flag or A/B test, only after Phases 1–5 are live and there's real bounce-rate data to justify the conversion trade-off.

---

## Suggested PR breakdown

| PR | Scope |
|---|---|
| PR 1 | Schema + repo + Resend webhook + tests + env/docs |
| PR 2 | `/api/payments/status` + success page (polling + copy) |
| PR 3 | Frontend typo hint + payment-submit re-validation |
| PR 4 | Admin detail + resend + reconciliation extension |

This keeps the detection path (the actual gap) shippable before UI polish, matching the priority order: backend detection first, frontend UX second, admin recovery last.

---

## Files involved in this change

- `src/db/migrations/001_initial.sql` — schema change for `email_sent_log`
- `docs/DB-SCHEMA.md`
- `src/config/index.js`, `.env.example` — `RESEND_WEBHOOK_SECRET`
- `src/db/repositories/emailSentLogRepo.js` — `findByProviderMessageId`, `markBounced`
- `src/routes/api/resend.js` — **new** bounce webhook
- `src/app.js` — webhook route wiring
- `src/services/systemAlertService.js` — new alert type `EMAIL_BOUNCED`
- `docs/EMAILING.md` — update after webhook implementation
- `public/assets/js/booking.js` — typo hint, payment-submit re-validation
- `src/routes/api/payments.js` — `/status` extension
- `public/assets/js/success-page.js` — continued polling, conditional copy
- `src/views/pages/booking-success.ejs` — DOM hooks for conditional copy
- `src/views/admin/reservation-detail.ejs` — delivery status display
- `src/services/stripeReconciliationService.js` — `evaluateLocalPaymentIssue` extension
- `tests/phase5OperationalSafety.test.js` — new failure reason coverage