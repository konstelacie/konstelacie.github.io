# Scheduled Emails & Cron — Architecture

**For AI assistants (Cursor, Copilot, etc.):** This document defines the architecture for timed emails (personal and bulk) and the cron endpoint that processes them. Use it when implementing reminder emails, newsletters, special messages, or the cron route.

**Related docs:** `docs/EMAILING.md`, `docs/POST-PAYMENT-CLIENT-JOURNEY.md`, `docs/RESERVATION-SYSTEM-ARCHITECTURE.md`, `docs/DB-SCHEMA.md`.

---

## 1. Purpose

- **Personal timed emails** — One recipient per send; triggered by schedule (e.g. pre-session reminder 24h before slot).
- **Bulk timed emails** — Same template, many recipients; used for reminders batch, newsletter, or special messages.
- **Cron endpoint** — HTTP endpoint hit by alwaysdata scheduled tasks; runs all due jobs.

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

### 4.4 alwaysdata Setup

1. Admin → Advanced → Scheduled tasks
2. New task:
   - **URL:** `https://your-app.alwaysdata.net/api/cron/run`
   - **Method:** POST (or GET with query param)
   - **Headers:** `X-Cron-Secret: <CRON_SECRET>` (if supported)
   - **Schedule:** e.g. every 15–30 min (`*/30 * * * *`)

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
- **Cron frequency:** Every 30 min
- **Effect:** Each slot falls into exactly one window; no duplicates, no gaps

---

## 10. Open Questions

1. **Newsletter scope** — When to build; consent table design; unsubscribe flow.
2. **Special messages** — Admin UI scope; segment definition (query vs. manual list).
3. **Multiple reminder timings** — 7d, 24h, 1h before; one job with param vs. separate jobs.
4. **Rate limiting** — Resend limits; batch size per cron run.
5. **Retries** — Failed sends; retry strategy; dead-letter handling.

---

## 11. Implementation Order

| Phase | Items |
|-------|-------|
| **1** | Cron route, CRON_SECRET, jobs index |
| **2** | Pre-session reminder job, template, reservationsRepo query |
| **3** | (Future) Post-session, doplatok |
| **4** | (Future) Newsletter: consent, unsubscribe, batch job |
| **5** | (Future) Special messages: admin UI, broadcast job |

---

*This document defines the architecture. Implementation details (exact SQL, template content) are in code and referenced docs.*
