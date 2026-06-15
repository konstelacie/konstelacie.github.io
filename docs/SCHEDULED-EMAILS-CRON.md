# Scheduled Emails & Cron — Architecture

**For AI assistants (Cursor, Copilot, etc.):** Describes timed email jobs and the cron HTTP endpoint. **Implemented behavior:** `src/routes/api/cron.js`, `src/jobs/`, `docs/API.md` (`/api/cron/run`). Sections below mix **current code** with **planned** design (newsletter, advisory lock, retry loops)—see labels.

**Related docs:** `docs/EMAILING.md`, `docs/POST-PAYMENT-CLIENT-JOURNEY.md`, `docs/RESERVATION-SYSTEM-ARCHITECTURE.md`, `docs/DB-SCHEMA.md`, `docs/IMPLEMENTATION-SNAPSHOT.md`.

---

## 1. Purpose

- **Personal timed emails** — One recipient per send; triggered by cron (e.g. pre-session reminder in a ~24h window before slot). **Implemented:** `pre-session-reminder` job.
- **Recovery jobs** — **Implemented:** `billing-deliver-stuck` (KROS webhook fallback; internal CT-PDF + `billing-invoice` email for stuck `accepted` documents — see `docs/EMAILING.md`).
- **Bulk timed emails** — Newsletter, special messages, etc. **Planned** — not in `src/jobs/index.js`.
- **Cron endpoint** — `POST` or `GET` `/api/cron/run` runs **all** registered jobs sequentially via `runAll()`. This is the single endpoint for all cron tasks; there are no per-job cron routes.

**Also implemented elsewhere:** Reservation confirmation email after Stripe `checkout.session.completed` (webhook), not via this cron. See `src/routes/api/stripe.js`, `docs/EMAILING.md`.

**Not part of `/api/cron/run`:** Cleanup of expired **`slot_locks`** or unused past **`slots`** — handled by operator actions at **`/admin/maintenance`** (`docs/IMPLEMENTATION-SNAPSHOT.md`, `docs/ui-ux/admin-interface.md`).

---

## 2. Use Cases by Type

### 2.1 Personal Timed Emails

| Use case | Trigger | Recipient | Content |
|----------|---------|-----------|---------|
| Pre-session reminder | Cron; slot in ~24h | One reservation | Slot date/time, how to join, preparation tips |
| Post-session follow-up | Cron; session completed | One reservation | Thank you, feedback link, rebook CTA |
| Doplatok reminder | Cron; session done, unpaid remainder | One reservation | Amount due, payment link |

**Characteristics:** One email per entity (reservation, user). Data from DB (reservations, slots, users). Idempotency via `email_sent_log`.

### 2.2 Bulk Timed Emails

| Use case | Trigger | Recipients | Content |
|----------|--------|------------|---------|
| **Reminders batch** | Cron; all slots in window | Many reservations | Same as personal reminder; loop over due items |
| **Newsletter** | Cron or admin; scheduled send | Subscribers (opt-in list) | News, updates, nurture content |
| **Special messages** | Admin; one-off broadcast | Selected segment (e.g. past clients) | Announcement, event, offer |

**Characteristics:** Same template, many recipients. Newsletter and special messages require consent/unsubscribe handling (see Section 6).

---

## 3. Legal & Consent Separation

| Category | Consent | Unsubscribe | Example |
|----------|---------|-------------|---------|
| **Transactional** | Implied (booking, payment) | Generally none | Confirmation, receipt, pre-session reminder |
| **Operator-assisted** | Implied (client relationship) | Optional | Follow-up after session, doplatok |
| **Newsletter** | Explicit opt-in required | Required | Regular updates, nurture sequences |
| **Special messages** | Depends on segment | Required if marketing | One-off announcements to past clients |

**Design rule:** Keep transactional/operator-assisted separate from newsletter/special messages in code, templates, and consent storage. Newsletter requires a separate consent table and unsubscribe flow. See `docs/EMAILING.md` Section 8.

---

## 4. Cron Endpoint

### 4.1 Route

```
POST /api/cron/run
```

- **Method:** POST (GET also supported if alwaysdata only allows GET).
- **Auth:** Secret token (see 4.2).
- **Response:** JSON with job results.

### 4.2 Authentication

| Env var | Description |
|---------|-------------|
| `CRON_SECRET` | Shared secret; required for cron requests in production-like contexts |

**Validation (implemented in `src/routes/api/cron.js`):** Valid secret via one of:

- Header: `Authorization: Bearer <CRON_SECRET>`
- Header: `X-Cron-Secret: <CRON_SECRET>`
- Query: `?secret=<CRON_SECRET>`

**Development bypass:** If `NODE_ENV === 'development'` **and** the request `Host` is `localhost` or `127.0.0.1`, the handler does **not** require `CRON_SECRET` (easier local/browser testing).

Otherwise reject with **401** if secret is missing or wrong.

### 4.3 Response format

```json
{
  "ok": true,
  "jobs": [
    {
      "name": "pre-session-reminder",
      "sent": 3,
      "skipped": 0,
      "errors": []
    }
  ]
}
```

Only jobs registered in `src/jobs/index.js` appear (currently `pre-session-reminder` and `billing-deliver-stuck`). Future jobs would add more entries here.

### 4.4 alwaysdata Setup Guide

When deploying to production on alwaysdata (see also **`docs/DEPLOY-ALWAYSDATA.md`** for the full checklist—we are not on prod yet):

**1. Set `CRON_SECRET` in environment**

- Admin → Sites → your site → Environment variables
- Add `CRON_SECRET` with a strong random value (e.g. `openssl rand -hex 32`)

**2. Create scheduled task**

- Admin → Advanced → Scheduled tasks
- New task:
  - **Command:** Leave empty if using URL
  - **URL:** `https://your-account.alwaysdata.net/api/cron/run` (replace with your site URL)
  - **Method:** POST or GET (alwaysdata supports both)
  - **Headers (if supported):** `X-Cron-Secret: <your-CRON_SECRET>`
  - **Alternative:** Use query param: `https://.../api/cron/run?secret=<CRON_SECRET>` (less secure; secret may appear in logs)

**3. Schedule**

- **Frequency:** Every 15 minutes
- **Crontab:** `*/15 * * * *` (every 15 min)

**4. Verify**

- After deploy, trigger manually from alwaysdata task panel or `curl` with secret
- Check response: `{"ok":true,"jobs":[...]}`

---

## 5. Job Architecture

### 5.1 Job Interface

Each job is a module that exports:

```javascript
module.exports = {
  name: 'job-name',
  async run() {
    // 1. Query due items (or load from queue)
    // 2. For each: check idempotency, send, log
    // 3. Return { sent, skipped, errors }
  },
};
```

### 5.2 Job types

| Job | Status | Query / source | Idempotency |
|-----|--------|----------------|-------------|
| `pre-session-reminder` | **Implemented** (`src/jobs/preSessionReminder.js`) | `reservationsRepo.findDueForPreSessionReminder()` — confirmed reservations, slot `start_at_utc` in [now+23h30m, now+24h30m) | `email_sent_log` via `emailSentLogRepo.wasAlreadySent` |
| `billing-deliver-stuck` | **Implemented** (`src/jobs/billingDeliverStuck.js`) | `billingDocumentsRepo.findStuckKrosAcceptedForFallback()` — `kros_status='accepted'`, no webhook, no email, older than 30 min (max 50/run) | `email_sent_log` (`billing-invoice-kros` **or** `billing-invoice`) + `email_sent_at` |
| `post-session-follow-up` | Planned | — | — |
| `doplatok-reminder` | Planned | — | — |
| `newsletter-batch` | Planned | — | — |
| `special-message` | Planned | — | — |

### 5.3 Orchestrator

**Implemented:** `runAll()` in `src/jobs/index.js` runs each registered job **sequentially**, collects `{ name, sent, skipped, errors }`, returns `{ ok: true, jobs: [...] }`.

**Planned (not in code):** Advisory lock before `runAll()`, per-email retry with backoff (Section 10–11). The live route **does not** acquire a DB advisory lock; overlapping HTTP calls can run jobs in parallel—**idempotency** (`email_sent_log`) still prevents duplicate sends for the same template + entity.

---

## 6. Bulk Email Variants

### 6.1 Reminders Batch

- **Same as personal:** Pre-session reminder logic; loop over due reservations.
- **No extra consent:** Transactional; user expects it.
- **Implementation:** One job queries due reservations, sends one email per reservation.

### 6.2 Newsletter

- **Recipients:** Opt-in subscribers (future `newsletter_subscribers` or similar).
- **Content:** Template + optional personalisation (name).
- **Consent:** Explicit signup; unsubscribe link required.
- **Timing:** Scheduled (cron) or admin-triggered.
- **Deferred:** Requires newsletter signup flow, consent table, unsubscribe handling. See `docs/EMAILING.md`.

### 6.3 Special Messages

- **Recipients:** Admin-selected segment (e.g. all past clients, users with tag).
- **Content:** Custom subject/body or template with slots.
- **Consent:** Depends on segment; if marketing, require consent.
- **Timing:** One-off; admin triggers from admin UI.
- **Implementation:** Admin creates broadcast; cron or immediate job sends to list.

---

## 7. Folder structure (as implemented)

```
src/
├── jobs/
│   ├── index.js                   # Registry; runAll()
│   ├── preSessionReminder.js    # pre-session reminder
│   └── billingDeliverStuck.js   # KROS webhook fallback (deliver-stuck batch)
├── routes/api/cron.js             # POST & GET /api/cron/run (single cron endpoint)
├── services/emailService.js       # sendReservationConfirmation, sendPreSessionReminder
├── services/billingDeliveryService.js # processStuckKrosAcceptedFallbackBatch
├── db/repositories/
│   ├── emailSentLogRepo.js
│   ├── billingDocumentsRepo.js  # findStuckKrosAcceptedForFallback
│   └── reservationsRepo.js      # findDueForPreSessionReminder
├── templates/emails/
│   ├── reservation-confirmation.ejs
│   └── pre-session-reminder.ejs
└── email/provider.js            # Resend
```

Additional job files (post-session, newsletter, etc.) are **not** present until built.

---

## 8. Idempotency

**Personal / reminders:** Before sending, check `email_sent_log` for `template_id` + `entity_type` + `entity_id`. If exists, skip.

**Newsletter / special messages:** Per campaign/broadcast + recipient. Store in `email_sent_log` with `entity_type` = `newsletter_campaign` or `broadcast`, `entity_id` = campaign/broadcast ID.

---

## 9. Timing Windows

For deterministic reminders (e.g. 24h before):

- **Window:** Slot `start_at_utc` in [now + 23h 30m, now + 24h 30m]
- **Cron frequency:** Every 15 min
- **Effect:** Each slot falls into exactly one window; no duplicates, no gaps

---

## 10. Cron concurrency & overlapping runs

### 10.1 Problem (design)

Scheduled tasks may overlap if a run is slow or triggered twice.

### 10.2 Current implementation

**`src/routes/api/cron.js` does not acquire an advisory lock or `cron_lock` row.** Each request runs `runAll()` to completion. Overlapping calls are possible.

**Mitigation in production:** Idempotency via `email_sent_log` (`wasAlreadySent` before send in `preSessionReminder.js`) prevents duplicate reminder emails for the same reservation.

### 10.3 Planned: advisory lock (not implemented)

Options documented below remain **design only** until implemented in `cron.js`:

- **Acquire lock** at start of `/api/cron/run` (e.g. MySQL `GET_LOCK('cron_run', 0)` non-blocking).
- **If lock not acquired:** Return early without processing (or return a structured skip message).
- **Release lock** in `finally`.

### 10.4 Race conditions

If multiple cron runs overlap, rely on **idempotency** (Section 8) per template + entity. Jobs should always check `wasAlreadySent` before sending.

---

## 11. Retries & Resend rate limits

### 11.1 Resend constraints (reference)

Resend may return 429 (rate / quota) or 5xx. See Resend docs for current limits.

### 11.2 Current implementation

**`emailService` + `preSessionReminder`:** Single `sendEmail` call per due item; **no** automatic retry loop, exponential backoff, or pacing delay in code. Failures append to the job’s `errors` array and are logged.

### 11.3 Planned enhancements

Per-email retries, throttling between sends, and batch APIs (Sections 11.2–11.5 in earlier revisions of this doc) remain **optional future work** if production load requires them.

### 11.4 Recovery behavior today

If a send fails, no `email_sent_log` row is written for that template + entity (unless partial success semantics change). The next cron run may select the same reservation again while it is still in the time window—operators should monitor `errors` in the JSON response and server logs.

---

## 12. Open Questions

1. **Newsletter scope** — When to build; consent table design; unsubscribe flow.
2. **Special messages** — Admin UI scope; segment definition (query vs. manual list).
3. **Multiple reminder timings** — 7d, 24h, 1h before; one job with param vs. separate jobs.
4. **Dead-letter handling** — Admin view of failed sends; manual retry; alerting.

---

## 13. Implementation status

| Item | Status |
|------|--------|
| Cron route, `CRON_SECRET`, dev localhost bypass | Done (`src/routes/api/cron.js`) |
| `runAll()`, `pre-session-reminder` job | Done |
| `billing-deliver-stuck` job (KROS webhook fallback) | Done (`src/jobs/billingDeliverStuck.js`) |
| `findDueForPreSessionReminder`, template `pre-session-reminder.ejs` | Done |
| Advisory lock on cron | Not implemented |
| Per-email Resend retries / pacing | Not implemented |
| Post-session, doplatok, newsletter, special messages | Not implemented |

---

*Planning sections above describe direction; **code** in `src/jobs/`, `src/routes/api/cron.js`, and `docs/API.md` are authoritative for current behavior.*
