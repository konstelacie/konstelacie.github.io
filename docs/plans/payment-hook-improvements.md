# Payment Safety, Email Reliability and Billing Error Flow — Implementation Plan

## Goal

Make the booking system safe after a successful Stripe payment.

Primary rule:

> A successful Stripe payment must always result in a confirmed reservation and a customer confirmation email, independent of billing, KROS, PDF generation, cron, or any other secondary process.

---

# 1. Priority order

## P0 — Payment and reservation safety

Implement first.

* Decouple reservation confirmation from billing document creation.
* Never allow invoice/KROS/PDF errors to roll back a paid booking.
* Make reservation confirmation email retryable.
* Add admin visibility for failed confirmation emails.

## P1 — Billing failure handling

Implement after P0.

* Remove legacy automatic CT-PDF fallback for KROS stuck state.
* Replace it with explicit billing error state.
* Add customer "billing delayed" email where appropriate.
* Add persistent admin alert until manually acknowledged.

## P2 — Cron reminders

Implement last.

* Keep reservation confirmation unchanged.
* Add simple pre-session reminder rule.
* Make reminder idempotent.

---

# 2. Required use case flows

## Flow A — Successful payment, everything works

Required behavior:

1. Customer pays in Stripe Checkout.
2. Stripe sends `checkout.session.completed`.
3. System creates confirmed reservation.
4. System marks payment completed.
5. System records webhook event as processed.
6. System commits DB transaction.
7. System sends reservation confirmation email.
8. System creates billing document.
9. System syncs billing document to KROS.
10. KROS webhook arrives.
11. System downloads PDF if possible.
12. System sends invoice email.
13. No admin alert is created.

Customer receives:

* Reservation confirmation email.
* Invoice / receipt email.

Admin sees:

* Confirmed reservation.
* Completed payment.
* Billing document delivered.

---

## Flow B — Successful payment, KROS sync fails

Required behavior:

1. Customer pays successfully.
2. Reservation is created and confirmed.
3. Confirmation email is sent or queued for retry.
4. KROS sync fails.
5. Reservation remains confirmed.
6. Payment remains completed.
7. Billing document enters error state.
8. Persistent admin alert is created.
9. Customer may receive billing delayed email, but only after confirmation is secured.

Customer receives:

* Reservation confirmation email.
* Optional billing delayed email.

Customer must NOT receive:

* Legacy CT-PDF fallback invoice automatically.

Admin sees:

* Red persistent alert:

  * KROS sync failed.
  * Billing document ID.
  * Reservation ID.
  * Payment ID.
  * Error message.
  * Manual acknowledge button.

---

## Flow C — Successful payment, billing document creation fails

Required behavior:

1. Customer pays successfully.
2. Reservation is created and confirmed.
3. Payment is marked completed.
4. Webhook event is stored.
5. Confirmation email is sent or queued.
6. Billing document creation fails after the booking transaction.
7. Persistent admin alert is created.
8. Billing can be retried manually.

Customer receives:

* Reservation confirmation email.

Admin sees:

* Red persistent alert:

  * Billing document creation failed.
  * Reservation exists.
  * Payment completed.
  * Manual retry/resolve path.

Forbidden behavior:

* Do not roll back reservation.
* Do not mark payment failed.
* Do not show customer payment error after Stripe already captured funds.

---

## Flow D — Successful payment, confirmation email fails

Required behavior:

1. Customer pays successfully.
2. Reservation is created.
3. Payment is completed.
4. Confirmation email attempt fails.
5. System records failed email attempt.
6. System retries automatically.
7. Admin alert is created if still not delivered after configured threshold.

Customer eventually receives:

* Reservation confirmation email.

Admin sees:

* Alert if confirmation email is still undelivered.

Required technical behavior:

* Confirmation email must be idempotent.
* Confirmation email must use `email_sent_log` or equivalent delivery tracking.
* Retry must not send duplicate emails.

---

## Flow E — Successful payment, Resend unavailable

Required behavior:

1. Customer pays successfully.
2. Reservation is confirmed.
3. Confirmation email is queued/pending.
4. Resend failure is stored.
5. Retry job attempts again later.
6. Admin alert appears if unresolved.

Forbidden behavior:

* Do not silently log only to console.
* Do not lose the email task.
* Do not rely only on fire-and-forget `.catch(console.error)`.

---

## Flow F — KROS accepted invoice but webhook never arrives

Required behavior:

1. KROS sync returns accepted.
2. KROS webhook does not arrive after threshold.
3. System creates persistent billing alert.
4. System may send billing delayed email to customer.
5. Admin resolves manually or retries KROS flow.
6. Alert remains visible until manually acknowledged.

Customer receives:

* Reservation confirmation email.
* Optional billing delayed email.

Customer must NOT receive:

* Automatic legacy CT-PDF fallback invoice.

Admin sees:

* Red persistent alert:

  * KROS accepted but webhook missing.
  * Age of pending KROS document.
  * Retry/check option.
  * Manual resolved/acknowledged option.

---

## Flow G — KROS webhook arrives but PDF download fails

Required behavior:

1. KROS webhook is received.
2. Billing document status is updated.
3. PDF download fails.
4. System still tries to send invoice email if a valid KROS link exists.
5. If invoice email cannot be sent, create admin alert.
6. If PDF missing but link available, admin resend must still be possible.

Forbidden behavior:

* Do not block admin resend only because internal PDF file is missing.
* Do not hide the error only in logs.

---

## Flow H — Cron disabled for 24 hours

Required behavior:

* Reservation confirmation must still work.
* Payment confirmation must still work.
* KROS webhook email must still work if webhook arrives.
* Pre-session reminders may be missed.
* KROS stuck recovery may be delayed.
* Admin should see that cron has not run recently.

Forbidden behavior:

* Reservation confirmation must not depend on cron.
* Paid booking must not depend on cron.

---

## Flow I — Late booking less than reminder threshold before session

Required behavior:

* Confirmation email is still sent.
* Pre-session reminder may be skipped.
* No duplicate reminder is sent immediately after confirmation unless explicitly configured.

Suggested rule:

```text
Send pre-session reminder only if:
- reservation is confirmed
- reminder not already sent
- session starts within reminder window
- payment/confirmation was not just completed moments ago
```

---

# 3. Forbidden use case flows

These flows must not be possible.

## Forbidden Flow 1 — Stripe captured money but reservation rolled back

Must never happen:

```text
Stripe payment completed
billing insert fails
transaction rolls back
reservation does not exist
payment marked failed
customer receives no email
```

Required prevention:

* Booking transaction must not include non-critical billing creation.
* Payment must not be marked failed after Stripe has already captured funds unless Stripe itself failed.

---

## Forbidden Flow 2 — Stripe captured money but customer receives no communication

Must never happen silently.

If email delivery fails:

* Store failed state.
* Retry.
* Alert admin.
* Keep reservation confirmed.

---

## Forbidden Flow 3 — KROS failure blocks reservation confirmation

Must never happen.

KROS is secondary.

Allowed:

```text
reservation confirmed
confirmation sent
KROS failed
admin alert created
```

Forbidden:

```text
KROS failed
reservation not confirmed
confirmation not sent
```

---

## Forbidden Flow 4 — Fire-and-forget critical customer email

Reservation confirmation must not be only:

```js
sendConfirmationEmailAsync().catch(console.error)
```

Required:

* durable email task,
* idempotency,
* retry,
* admin visibility.

---

## Forbidden Flow 5 — Legacy invoice fallback automatically sent to customer

Remove this behavior:

```text
KROS webhook missing > 30 minutes
cron sends internal CT-PDF fallback invoice to customer
```

Replace with:

```text
KROS webhook missing
admin alert
optional billing delayed email
manual resolution
```

---

## Forbidden Flow 6 — Admin cannot see unresolved paid-booking problems

Must never rely only on logs.

Admin panel must surface:

* confirmation email not delivered,
* billing document failed,
* KROS stuck,
* KROS webhook missing,
* invoice email not delivered,
* cron not running.

---

# 4. Proposed technical changes

## 4.1 Split Stripe webhook transaction

Current problem:

Billing document creation is inside the same transaction as reservation creation.

Target structure:

```text
Stripe checkout.session.completed
|
BEGIN TRANSACTION
  create reservation
  mark payment completed
  store webhook event
  create confirmation email outbox row
COMMIT
|
post-commit:
  process confirmation email
  create billing document
  sync to KROS
```

Important:

* Billing document creation failure must not affect reservation.
* KROS failure must not affect reservation.
* Email sending failure must not affect reservation.

---

## 4.2 Add durable confirmation email delivery

Preferred solution:

Create an email outbox table or extend `email_sent_log` with pending/failed states.

Minimum fields:

```text
id
email_type
reservation_id
payment_id
recipient_email
status: pending | sending | sent | failed
attempt_count
last_attempt_at
next_attempt_at
last_error
created_at
sent_at
```

Required email type:

```text
reservation-confirmation
```

Rules:

* Insert pending confirmation email in the same transaction as reservation.
* Process pending emails after commit.
* Retry failed emails.
* Do not send duplicate confirmation emails.
* Show failed/pending email state in admin.

---

## 4.3 Add admin system alerts

Create persistent alerts.

Suggested table:

```text
system_alerts
-------------
id
severity: info | warning | critical
type
entity_type
entity_id
title
message
status: open | acknowledged | resolved
created_at
updated_at
acknowledged_at
acknowledged_by
resolved_at
resolved_by
metadata_json
```

Required alert types:

```text
reservation_confirmation_email_failed
billing_document_creation_failed
kros_sync_failed
kros_webhook_missing
invoice_email_failed
cron_not_running
stripe_payment_needs_reconciliation
```

Admin UI:

* Show red alert bar at top of admin panel if any critical open alert exists.
* Alert must not disappear automatically.
* Admin can acknowledge/resolve manually.
* Store audit trail.

---

## 4.4 Replace legacy billing fallback

Remove or disable automatic customer-facing CT-PDF fallback from cron.

Current behavior to remove:

```text
billing-deliver-stuck → forceInternal → CT-PDF → customer billing email
```

New behavior:

```text
billing-kros-stuck-check
  if KROS accepted but webhook missing:
    create/update system alert
    optionally send billing delayed email once
```

Suggested customer email:

Subject:

```text
Doklad k platbe pošleme dodatočne
```

Body meaning:

```text
Rezervácia je potvrdená.
Platbu evidujeme.
Doklad k platbe spracúvame a pošleme ho dodatočne.
Na sedenie príďte podľa potvrdeného termínu.
```

Important:

* This email must never replace reservation confirmation.
* Send only once per reservation/payment.
* Track in email log.

---

## 4.5 Improve KROS states

Use explicit states.

Suggested statuses:

```text
pending
syncing
accepted
webhook_received
pdf_download_failed
invoice_email_failed
delivered
failed
manual_resolution_required
```

At minimum, ensure current states can represent:

* KROS sync failed.
* KROS accepted but webhook missing.
* KROS webhook received but PDF failed.
* Invoice email failed.
* Invoice email sent.

---

## 4.6 Add Stripe reconciliation job

Add scheduled/admin job:

Detect:

```text
Stripe Checkout session completed
but no confirmed reservation exists
```

or:

```text
payment completed
but no confirmation email sent
```

Actions:

* Create critical system alert.
* Do not auto-create reservation unless safe and idempotent.
* Provide admin investigation data.

---

## 4.7 Add cron health visibility

Store last successful cron run.

Suggested table or setting:

```text
cron_job_runs
-------------
id
job_name
status
started_at
finished_at
result_json
error_message
```

Admin alert:

```text
cron_not_running
```

if no successful `/api/cron/run` in expected time window.

---

# 5. Implementation phases

## Phase 1 — Payment safety refactor

Tasks:

1. Refactor Stripe webhook transaction.
2. Move billing document creation out of critical transaction.
3. Ensure successful Stripe payment cannot be marked failed because of billing errors.
4. Store webhook event after critical booking commit.
5. Add alert when post-commit billing creation fails.

Acceptance tests:

* Simulate billing document insert failure.
* Expected:

  * payment completed,
  * reservation confirmed,
  * confirmation email pending/sent,
  * admin alert created.

---

## Phase 2 — Confirmation email reliability

Tasks:

1. Add durable email outbox or pending email log.
2. Insert confirmation email task in booking transaction.
3. Add processor/retry logic.
4. Add admin visibility.
5. Add idempotency guard.

Acceptance tests:

* Simulate Resend failure.
* Expected:

  * reservation confirmed,
  * email pending/failed visible,
  * retry sends later,
  * no duplicate email.

---

## Phase 3 — Admin alerts

Tasks:

1. Create `system_alerts`.
2. Add alert creation service.
3. Add admin red banner.
4. Add alert list/detail page.
5. Add acknowledge/resolve action.

Acceptance tests:

* Trigger KROS failure.
* Expected:

  * red admin banner visible,
  * alert persists,
  * manual acknowledge hides only after action.

---

## Phase 4 — KROS error flow

Tasks:

1. Remove automatic legacy customer CT-PDF fallback.
2. Replace stuck KROS cron with alert creation.
3. Add optional billing delayed customer email.
4. Enable resend invoice when KROS URL exists even if internal PDF is missing.
5. Add clear KROS status display in admin.

Acceptance tests:

* Simulate KROS accepted but no webhook.
* Expected:

  * reservation confirmation sent,
  * no legacy PDF sent,
  * admin alert created,
  * optional billing delayed email sent once.

---

## Phase 5 — Cron reminders

Tasks:

1. Keep confirmation email unchanged.
2. Add simple pre-session reminder logic.
3. Ensure reminder is idempotent.
4. Add cron run tracking.

Suggested reminder rule:

```text
Send reminder if:
- reservation is confirmed
- reminder not sent
- session starts between 23h30m and 24h30m
```

Optional later improvement:

```text
For bookings created less than 24h before session, skip reminder.
```

Acceptance tests:

* Session tomorrow → reminder sent.
* Session in 5 hours and just booked → no duplicate reminder.
* Cron runs twice → only one reminder.

---

# 6. Testing checklist

## Payment webhook tests

* Normal full payment.
* Normal deposit payment.
* Top-up payment.
* Duplicate Stripe webhook.
* Billing document creation throws.
* DB failure before reservation commit.
* DB failure after reservation commit.
* Stripe retry after webhook failure.

## Email tests

* Confirmation email succeeds.
* Confirmation email fails once then succeeds.
* Confirmation email fails permanently.
* Resend not configured.
* Duplicate email task.
* Admin resend.

## KROS tests

* KROS accepted + webhook received.
* KROS API 401.
* KROS API timeout.
* KROS webhook 207.
* KROS webhook missing.
* PDF download failure.
* Invoice email failure.

## Cron tests

* Cron disabled.
* Cron resumes.
* Reminder idempotency.
* KROS stuck detection.
* Cron health alert.

---

# 7. Definition of done

This refactor is complete only when all of the following are true:

* A successful Stripe payment cannot be lost because billing failed.
* A successful Stripe payment always creates or preserves a confirmed reservation.
* Confirmation email is durable, retryable and visible in admin.
* KROS failure never blocks reservation confirmation.
* Legacy automatic CT-PDF fallback is removed from customer-facing cron flow.
* Billing failures create persistent admin alerts.
* Admin panel clearly shows unresolved critical states.
* Cron is only used for reminders and recovery, not for core payment confirmation.
* Tests cover all required and forbidden flows.
