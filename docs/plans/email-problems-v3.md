# Implementation Plan: Handling Mistyped / Bounced Emails (v3 — final)

> v3 resolves the remaining nits from the second Cursor review. No open decisions left — ready for Agent mode, starting with PR 1.

## Context

A reservation went through payment, the email was syntactically valid, but a typo (e.g. `gmial.com`) caused a Resend bounce. The app has no idea — both the success page and the reconciliation logic assume the email was delivered, because the only check performed is `payment.status === 'completed'`.

Confirmation flow today: `email_delivery_tasks` → `emailDeliveryTaskService` → Resend → `email_sent_log`. Nothing downstream of `email_sent_log` knows about bounces.

---

## Decisions confirmed during review (all resolved)

| Topic | Decision |
|---|---|
| Schema change method | Edit `src/db/migrations/001_initial.sql` directly and recreate the DB locally — this project drops/recreates pre-live, no `ALTER TABLE`. |
| Timestamp type | `DATETIME(3)`, not `TIMESTAMPTZ` (MySQL, not Postgres). |
| Linking a bounce to a reservation | `email_sent_log` has no `reservation_id` column. Use `entity_type` + `entity_id` (`entity_type === 'reservation' ? entity_id : null`). |
| Webhook scope | Updates `delivery_status` for **every** logged email (invoice, reminder, confirmation). Alerts fire **only** for `reservation-confirmation` bounces. |
| Admin resend strategy | **Option A** — dedicated template id `reservation-confirmation-resend`. Fits the existing `wasAlreadySent()` + unique `(template_id, entity_type, entity_id)` constraint with no special-casing, same pattern already used for `billing-invoice-resend`. |
| Where the bounce check lives in reconciliation | In the **async** `detectLocalPaymentIssue`, not the synchronous `evaluateLocalPaymentIssue`. Query `email_sent_log` in the async layer, then pass a `bounced: boolean` flag (or third argument) into `evaluateLocalPaymentIssue`. |
| `complained` status in the API | Not a separate client-facing status. `confirmationEmail.status` stays `'pending' \| 'sent' \| 'bounced' \| 'failed'` — map `complained` to `bounced` for UI purposes (same warning copy/path). |
| Alert type | Dedicated `EMAIL_BOUNCED`, separate from the existing `reservation_confirmation_email_failed`. Keeps "send failed at dispatch time" distinct from "accepted, then bounced later" for admin triage. |
| Success-page polling | Keep polling for ~2–3 minutes after `completed` instead of stopping immediately, so a late bounce can still flip the UI. |
| Svix headers | Resend signs webhooks with standard Svix headers (`svix-id`, `svix-timestamp`, `svix-signature`) — `svix` is already in the lockfile via Resend's SDK. |
| Typo detection false positives | Levenshtein ≤2 is fine because the hint is non-blocking. |
| Double opt-in | Correctly deferred — not worth the conversion cost for this edge case. |
| `stripe.js` | No bounce logic belongs there. Confirmation is task-based; the webhook, task service, and log repo are the only touch points. |
| Webhook rate limiting | Optional — apply the same rate limit pattern already used on the KROS webhook. |

---

## Phase 1 — Schema (`email_sent_log`)

1. Edit `src/db/migrations/001_initial.sql` (not `ALTER TABLE`). Add to `email_sent_log`:
   - `delivery_status` — `ENUM('accepted','delivered','bounced','complained') NOT NULL DEFAULT 'accepted'`
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
- Handle `email.bounced` and `email.complained` — both map to `delivery_status` values `'bounced'` / `'complained'` in the DB; the client-facing status API collapses `complained` into `bounced` (see Phase 4).
- Optionally handle `email.delivered` → set `delivery_status = 'delivered'` (nice to have, not required for MVP).
- Optional: apply the same rate-limit middleware used on the KROS webhook.

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
- Add a **dedicated** `EMAIL_BOUNCED` alert type in `systemAlertService.js` — kept separate from the existing `reservation_confirmation_email_failed`, since "failed to send" and "sent then bounced" need different admin triage.
- Fire it **only** when the bounced template is `reservation-confirmation` and `entity_type === 'reservation'`. Other bounced templates (invoice, reminder) still get `delivery_status` updated in `email_sent_log` for admin visibility, just without triggering an alert.

**Ops**
- Register `https://<domain>/api/resend/webhook` in the Resend dashboard.
- Store the signing secret in env.

**Tests**
- Unit test signature verification.
- Unit test `markBounced` idempotency.
- Fixture for a Resend bounce payload.

**Docs**
- Update `docs/EMAILING.md` (currently says delivery webhooks are "nice to have, not required for V1").
- Update `docs/API.md` with the new webhook route.

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

Note: the server already validates the regex on `/api/payments/start` via `middleware/validators.js` — this only closes the client-side bypass.

### 3b. Typo hint

- Add `suggestDomainFix()` + a small Levenshtein helper (inline, ~15 lines is enough).
- Trigger on email blur/input, not on submit — non-blocking Slovak-language hint ("Mysleli ste...?") with an apply button.
- Do not block submit.

### 3c. Confirm-email field

Deferred — see Phase 6.

---

## Phase 4 — Status API + success page

**Extend `GET /api/payments/status` in `payments.js`**
- Join `email_delivery_tasks` for `reservation-confirmation` + the latest `email_sent_log` row for the same entity.
- Return:
```js
confirmationEmail: {
  status: 'pending' | 'sent' | 'bounced' | 'failed', // 'complained' maps to 'bounced' here
  recipientMasked: 'a***@gmail.com',
}
```

Mapping logic:
- `failed` — task exhausted (`status === 'failed' && attempts >= max`)
- `bounced` — `email_sent_log.delivery_status` is `bounced` **or** `complained`
- `pending` — task exists but no successful log row yet
- `sent` — logged, not bounced

- Update `docs/API.md` for this response shape.

**`success-page.js`**
- Always show the masked email + "Ak do pár minút nedorazí, skontroluj adresu alebo nás kontaktuj."
- If `confirmationEmail.status` is `bounced` or `failed`, swap the static line in `booking-success.ejs` ("Potvrdenie sme Ti poslali e-mailom.") for explicit warning copy.
- **Keep polling** after `completed` for ~2–3 minutes at the same interval:
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

**Reservation detail** (`admin/reservation-detail.ejs`, `src/routes/admin.js`, `src/lib/adminReservationDisplay.js` — `getAdminDetailById` / `mapAdminDetail`)
- Show email, confirmation delivery status, bounce reason, timestamp.

**Admin action — `POST /admin/reservations/:id/resend-confirmation`**
- Validate the new email server-side.
- Update `reservations.email`.
- **Resend strategy — decided: Option A.** Use a dedicated template id `reservation-confirmation-resend`. This fits the existing `wasAlreadySent()` + unique `(template_id, entity_type, entity_id)` constraint with no special-casing, matching the established `billing-invoice-resend` pattern.
- Log a new `email_sent_log` row; optionally resolve the open bounce alert.

**`stripeReconciliationService` — bounce check goes in the async layer**

The bounce lookup needs a DB read, so it belongs in `detectLocalPaymentIssue` (async), not `evaluateLocalPaymentIssue` (sync). Query `email_sent_log` there and pass the result down:
```js
// detectLocalPaymentIssue (async)
const bounced = await emailSentLogRepo.isBouncedForEntity('reservation', reservation.id);
const issue = evaluateLocalPaymentIssue(payment, task, bounced);

// evaluateLocalPaymentIssue (sync, unchanged signature otherwise)
function evaluateLocalPaymentIssue(payment, task, bounced) {
  // ... existing checks ...
  if (exhausted) {
    return { failureReason: 'confirmation_email_permanently_failed' };
  }
  if (bounced) {
    return { failureReason: 'confirmation_email_bounced' };
  }
  return null;
}
```

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
| PR 4 | Admin detail + resend (Option A) + reconciliation extension |

Backend detection first, frontend UX second, admin recovery last.

---

## Files involved in this change

- `src/db/migrations/001_initial.sql` — schema change for `email_sent_log`
- `docs/DB-SCHEMA.md`
- `src/config/index.js`, `.env.example` — `RESEND_WEBHOOK_SECRET`
- `src/db/repositories/emailSentLogRepo.js` — `findByProviderMessageId`, `markBounced`, `isBouncedForEntity`
- `src/routes/api/resend.js` — **new** bounce webhook
- `src/app.js` — webhook route wiring
- `src/services/systemAlertService.js` — new alert type `EMAIL_BOUNCED`
- `docs/EMAILING.md`, `docs/API.md` — update after webhook + status API changes
- `public/assets/js/booking.js` — typo hint, payment-submit re-validation
- `src/routes/api/payments.js` — `/status` extension
- `public/assets/js/success-page.js` — continued polling, conditional copy
- `src/views/pages/booking-success.ejs` — DOM hooks for conditional copy
- `src/views/admin/reservation-detail.ejs` — delivery status display
- `src/routes/admin.js` — resend-confirmation action
- `src/lib/adminReservationDisplay.js` — `getAdminDetailById` / `mapAdminDetail`
- `src/services/stripeReconciliationService.js` — `detectLocalPaymentIssue` (async bounce check), `evaluateLocalPaymentIssue` (new param)
- `tests/phase5OperationalSafety.test.js` — new failure reason coverage