# Scheduled Emails & Cron — Architecture

**For AI assistants (Cursor, Copilot, etc.):** This document defines the architecture for timed emails (personal and bulk) and the cron endpoint that processes them. Use it when implementing reminder emails, newsletters, special messages, or the cron route.

**Related docs:** `docs/EMAILING.md`, `docs/POST-PAYMENT-CLIENT-JOURNEY.md`, `docs/RESERVATION-SYSTEM-ARCHITECTURE.md`, `docs/DB-SCHEMA.md`.

---

## 1. Purpose

- **Personal timed emails** — One recipient per send; triggered by schedule (e.g. pre-session reminder 24h before slot).
- **Bulk timed emails** — Same template, many recipients; used for reminders batch, newsletter, or special messages.
- **Cron endpoint** — HTTP endpoint hit by alwaysdata scheduled tasks every 15 minutes; processes all due jobs and attempts to send all emails that are due.

**Existing:** Transactional emails (reservation confirmation) are already implemented. See `src/services/emailService.js`, `src/email/provider.js`, `docs/EMAILING.md`.

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
| `CRON_SECRET` | Shared secret; required for cron requests |

**Validation:** Request must include valid secret via one of:
- Header: `Authorization: Bearer <CRON_SECRET>`
- Header: `X-Cron-Secret: <CRON_SECRET>`
- Query: `?secret=<CRON_SECRET>` (fallback for GET; less secure)

Reject with 401 if missing or invalid.

### 4.3 Response Format

```json
{
  "ok": true,
  "jobs": [
    {
      "name": "pre-session-reminder",
      "sent": 3,
      "skipped": 0,
      "errors": []
    },
    {
      "name": "newsletter-batch",
      "sent": 0,
      "skipped": 0,
      "errors": []
    }
  ]
}
```

### 4.4 alwaysdata Setup Guide

When deploying to production on alwaysdata:

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

### 5.2 Job Types

| Job | Type | Query / source | Idempotency |
|-----|------|----------------|-------------|
| `pre-session-reminder` | Personal (bulk loop) | Reservations with slot in ~24h window | `email_sent_log` by template + reservation |
| `post-session-follow-up` | Personal | Reservations with completed session | Same |
| `doplatok-reminder` | Personal | Reservations with unpaid remainder | Same |
| `newsletter-batch` | Bulk | Queue or scheduled campaign | Per campaign + recipient |
| `special-message` | Bulk | Admin-created broadcast; recipient list | Per broadcast + recipient |

### 5.3 Orchestrator

`jobs.runAll()` iterates over registered jobs, runs each, aggregates results. Jobs run sequentially to avoid overload; parallelisation can be added later if needed.

**Cron handler flow:** Before `runAll()`, acquire advisory lock (Section 10). If lock not acquired, return immediately. After `runAll()` (in `finally`), release lock. Each job sends all due emails; per-email retries (Section 11) handle Resend rate limits and transient errors.

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

## 7. Folder Structure

```
src/
├── jobs/                          # Cron job definitions
│   ├── index.js                   # Job registry; runAll() orchestrator
│   ├── preSessionReminder.js      # 24h before slot
│   ├── postSessionFollowUp.js     # (future) After session
│   ├── doplatokReminder.js        # (future) Unpaid remainder
│   ├── newsletterBatch.js        # (future) Newsletter sends
│   └── specialMessage.js          # (future) Admin broadcasts
│
├── routes/
│   └── api/
│       └── cron.js                # POST /api/cron/run
│
├── services/
│   └── emailService.js            # Add sendPreSessionReminder, etc.
│
├── db/
│   └── repositories/
│       ├── emailSentLogRepo.js    # Existing; add wasAlreadySent(templateId, entityType, entityId)
│       └── (future: newsletterSubscribersRepo, broadcastQueueRepo)
│
├── templates/
│   └── emails/
│       ├── reservation-confirmation.ejs
│       ├── pre-session-reminder.ejs
│       └── (future: newsletter, special-message)
│
└── email/
    └── provider.js
```

---

## 8. Idempotency

**Personal / reminders:** Before sending, check `email_sent_log` for `template_id` + `entity_type` + `entity_id`. If exists, skip.

**Newsletter / special messages:** Per campaign/broadcast + recipient. Store in `email_sent_log` with `entity_type` = `newsletter_campaign` or `broadcast`, `entity_id` = campaign/broadcast ID.

---

## 9. Timing Windows

For deterministic reminders (e.g. 24h before):

- **Window:** Slot `start_at` in [now + 23h 30m, now + 24h 30m]
- **Cron frequency:** Every 15 min
- **Effect:** Each slot falls into exactly one window; no duplicates, no gaps

---

## 10. Cron Concurrency & Overlapping Runs

### 10.1 Problem

Cron runs every 15 minutes. A run may exceed 15 minutes (many due emails, Resend rate limits, slow network). A new run can start while the previous one is still executing.

### 10.2 Design Goals

- **Single active run:** Only one cron run should process jobs at a time.
- **Graceful exit:** If a run is already active, the new run exits immediately (no duplicate work, no race conditions).
- **Max retries:** Per-email retries are bounded so a stuck run eventually finishes and frees the lock.

### 10.3 Advisory Lock

Use a DB advisory lock (or a dedicated `cron_lock` table) to prevent overlapping runs:

- **Acquire lock** at start of `/api/cron/run` (e.g. `GET_LOCK('cron_run', 0)` — non-blocking).
- **If lock not acquired:** Return 200 with `{ ok: true, skipped: "previous run still active" }`. Do not process jobs.
- **Release lock** in `finally` when run completes (success or error).

**Alternative:** `cron_lock` table with `(lock_key, acquired_at, expires_at)`. Acquire = INSERT with `expires_at = NOW() + 20 min`; release = DELETE. New run checks: if row exists and `acquired_at` is recent, skip.

### 10.4 Race Conditions

If multiple instances somehow run (e.g. alwaysdata misfire, manual trigger):

- **Idempotency** (Section 8) protects against duplicate sends: `email_sent_log` ensures each template+entity is sent at most once.
- **Lock** reduces the chance; idempotency handles the rest.
- Jobs should not assume exclusive access; always check `wasAlreadySent` before sending.

---

## 11. Retries & Resend Rate Limits

### 11.1 Resend Constraints

- **Rate limit:** Default 2 requests/second per team. 429 with `rate_limit_exceeded` when exceeded.
- **Quotas:** Daily/monthly limits; 429 with `daily_quota_exceeded` or `monthly_quota_exceeded`.
- **Transient errors:** 500, 503; `application_error`, `internal_server_error` — retry recommended.
- **Headers:** `retry-after` (seconds) and `ratelimit-remaining` help with backoff.

**Implication:** When sending many due emails in one cron run, hitting 429 is likely. Retries are essential.

### 11.2 Per-Email Retry Strategy

| Step | Action |
|------|--------|
| 1 | Send email. On success → log, continue. |
| 2 | On 429 (rate limit): wait `retry-after` seconds (or min 2s), retry. Max 3 retries per email. |
| 3 | On 429 (quota exceeded): do not retry this run; log; next cron run will retry (idempotency allows it). |
| 4 | On 5xx: exponential backoff (e.g. 2s, 4s, 8s); max 3 retries per email. |
| 5 | After max retries: log error, continue to next email. Do not block entire run. |

### 11.3 Throttling Within a Run

To reduce 429s:

- **Pacing:** Insert small delay between sends (e.g. 500–600 ms) to stay under 2 req/s.
- **Batch API:** Resend Batch API supports up to 100 emails per request; consider for newsletter/special messages. For personal reminders (one per reservation), individual sends with pacing may suffice.

### 11.4 Max Retries to Free the Cron

- **Per email:** Max 3 retries. After that, skip and log; next cron run will retry (item still due; idempotency prevents double-send if first attempt eventually succeeded).
- **Per run:** No global retry loop. One pass over due items; each item gets up to 3 attempts.
- **Effect:** A run with many rate-limited emails will take longer but eventually finish. Lock is released when run completes, so the next scheduled cron can proceed.

### 11.5 Dead-Letter / Manual Recovery

Items that fail after max retries remain "due" (no `email_sent_log` entry). They will be picked up by the next cron run. If Resend is down or quota is exhausted for an extended period, consider:

- Admin view of failed sends (from logs or a `email_send_failures` table).
- Manual retry trigger or "retry failed" job.
- Alerting when failure rate exceeds a threshold.

---

## 12. Open Questions

1. **Newsletter scope** — When to build; consent table design; unsubscribe flow.
2. **Special messages** — Admin UI scope; segment definition (query vs. manual list).
3. **Multiple reminder timings** — 7d, 24h, 1h before; one job with param vs. separate jobs.
4. **Dead-letter handling** — Admin view of failed sends; manual retry; alerting.

---

## 13. Implementation Order

| Phase | Items |
|-------|-------|
| **1** | Cron route, CRON_SECRET, jobs index |
| **2** | Pre-session reminder job, template, reservationsRepo query |
| **3** | Advisory lock (Section 10); retry logic with Resend 429/5xx handling (Section 11) |
| **4** | (Future) Post-session, doplatok |
| **5** | (Future) Newsletter: consent, unsubscribe, batch job |
| **6** | (Future) Special messages: admin UI, broadcast job |

---

*This document defines the architecture. Implementation details (exact SQL, template content) are in code and referenced docs.*
