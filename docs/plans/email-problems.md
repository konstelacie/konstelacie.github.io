# Implementation Plan: Handling Mistyped / Bounced Emails

## Context

A reservation went through payment, the email was syntactically valid, but a typo (e.g. `gmial.com`) caused a Resend bounce. The app has no idea — both the success page and the reconciliation logic assume the email was delivered, because the only check performed is `payment.status === 'completed'`.

Root cause: nowhere in the chain **booking.js → /api/payments/start → Stripe webhook → emailDeliveryTaskService → Resend** is anything checked beyond regex syntax. A Resend bounce is an asynchronous event the app has no webhook for.

---

## Priority 1 — Frontend (hours of work, zero risk)

### 1a. Typo detection on email entry

In `public/assets/js/booking.js`, inside `validateEmail()`, add a check against a list of common domains (Levenshtein distance 1–2):

```js
const COMMON_DOMAINS = ['gmail.com', 'outlook.com', 'azet.sk', 'centrum.sk', 'yahoo.com', 'icloud.com', 'zoznam.sk', 'hotmail.com'];

function suggestDomainFix(email) {
  const [local, domain] = email.split('@');
  if (!domain) return null;
  for (const candidate of COMMON_DOMAINS) {
    if (domain !== candidate && levenshtein(domain, candidate) <= 2) {
      return `${local}@${candidate}`;
    }
  }
  return null;
}
```

UI: don't block submit, just show "Did you mean `xxx@gmail.com`?" with a button to apply the fix. (Site copy stays in Slovak — e.g. "Mysleli ste...?" — only the implementation/code is in English.)

### 1b. Re-validate email on payment submit

In `booking.js` (~line 1924), the email is read directly from `$('booking-email').value` when the payment form is submitted, but `validateEmail()` is never re-run. This is an actual gap, not just a UX improvement — add a `validateEmail()` call before the POST to `/api/payments/start`.

### 1c. Confirm-email field (consider, not required)

A second "Confirm email" field, shown only on first submit (not on every submit). A lighter alternative to double opt-in. Recommend A/B testing rather than treating as a hard requirement — it will mildly reduce conversion.

---

## Priority 2 — Resend bounce webhook (the core gap)

### 2a. DB migration

Extend `email_sent_log` (it already has `provider_message_id`, so a bounce can be matched directly — no separate table needed):

```sql
ALTER TABLE email_sent_log
  ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'accepted'
    CHECK (delivery_status IN ('accepted', 'delivered', 'bounced', 'complained')),
  ADD COLUMN bounce_reason TEXT,
  ADD COLUMN bounced_at TIMESTAMPTZ;

CREATE INDEX idx_email_sent_log_provider_message_id ON email_sent_log(provider_message_id);
```

If blocking future reservations on the same address becomes necessary (cross-reservation suppression), add a separate `email_suppressions(email, reason, created_at)` table later. For now, a query on `bounced_at IS NOT NULL` is sufficient.

### 2b. Webhook endpoint

New route, e.g. `src/routes/api/resend.js`:

```js
router.post('/api/resend/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['svix-signature']; // Resend uses Svix
  if (!verifyResendSignature(req.body, req.headers, RESEND_WEBHOOK_SECRET)) {
    return res.status(401).end();
  }

  const event = JSON.parse(req.body);
  const messageId = event.data?.email_id;

  if (event.type === 'email.bounced' || event.type === 'email.complained') {
    await emailSentLogRepo.markBounced(messageId, {
      status: event.type === 'email.bounced' ? 'bounced' : 'complained',
      reason: event.data?.bounce?.message || event.data?.reason,
    });

    const logRow = await emailSentLogRepo.findByMessageId(messageId);
    if (logRow?.reservation_id) {
      await systemAlertService.createAlert({
        type: 'email_bounced',
        entityType: 'reservation',
        entityId: logRow.reservation_id,
        details: { email: logRow.recipient_email, reason: event.data?.bounce?.message },
      });
    }
  }

  res.status(200).end();
});
```

Need to register the webhook URL in the Resend dashboard and store `RESEND_WEBHOOK_SECRET` in env. `docs/EMAILING.md` currently marks this webhook as "nice to have, not required for V1" — update the documentation once implemented.

---

## Priority 3 — Success page and status API

### 3a. Extend `/api/payments/status`

```js
{
  payment: { status: 'completed', ... },
  reservation: { ... },
  confirmationEmail: {
    status: 'sent' | 'pending' | 'bounced' | 'failed',
    recipientMasked: 'a***@gmail.com',
  }
}
```

### 3b. Conditional copy on the success page

In `public/assets/js/success-page.js`:

```js
if (data.confirmationEmail?.status === 'bounced' || data.confirmationEmail?.status === 'failed') {
  showEmailWarning(data.confirmationEmail.recipientMasked);
} else {
  showStandardConfirmation();
}
```

In `src/views/pages/booking-success.ejs`, drive the text from the status field instead of the static Slovak copy "Potvrdenie sme Ti poslali e-mailom." (page copy itself stays in Slovak; only the logic/markup driving it is implemented in English-named code).

**Important:** a Resend bounce can arrive with a delay (seconds to minutes), while the success page renders immediately after payment. Recommend therefore **always** showing the email address plus a hint like "If you don't receive it within a few minutes, check the address or contact us" — regardless of whether a bounce status has already arrived — and additionally switching to an explicit warning once a bounce status exists.

---

## Priority 4 — Admin and recovery

Without a way to fix the email from the admin panel, a bounce alert just adds work without a resolution path:

- **Admin reservation detail**: show `reservations.email`, delivery status, bounce reason.
- **Admin action** "Resend with corrected email": update `reservations.email` + create a new `email_delivery_tasks` row (or force-resend the existing template).
- **`stripeReconciliationService`**: extend `evaluateLocalPaymentIssue` to treat `bounced` similarly to `permanently_failed`.

---

## What to deliberately NOT do now

**Double opt-in before payment** — would cost conversion across 100% of reservations to fix an edge case affecting ~1–2% of cases. The bounce webhook + better success page copy + frontend typo hint covers nearly everything without impacting the flow.

---

## Recommended implementation order

1. DB migration (`email_sent_log` extension) — item 2a
2. Resend webhook endpoint — item 2b
3. Frontend re-validation on payment submit — item 1b
4. Frontend typo detection — item 1a
5. Extend `/api/payments/status` + success page copy — items 3a, 3b
6. Admin recovery flow — item 4
7. (Optional, A/B) Confirm-email field — item 1c

---

## Files involved in this change

- `public/assets/js/booking.js` — typo hint, re-validation
- `src/routes/api/payments.js` — `/start`, `/status`
- `src/routes/api/stripe.js` — webhook, `ensureReservationForCheckoutPayment`
- `src/routes/api/resend.js` — **new** bounce webhook
- `src/db/repositories/emailSentLogRepo.js` — `markBounced`, `findByMessageId`
- `src/db/repositories/emailDeliveryTasksRepo.js`
- `src/services/emailDeliveryTaskService.js`
- `src/services/systemAlertService.js` — new alert type `email_bounced`
- `src/services/stripeReconciliationService.js` — `evaluateLocalPaymentIssue`
- `public/assets/js/success-page.js`
- `src/views/pages/booking-success.ejs`
- `docs/EMAILING.md` — update after the webhook is implemented