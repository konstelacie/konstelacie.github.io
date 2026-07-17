# Database Schema

**For AI assistants (Cursor, Copilot, etc.):** This document describes the database structure and purpose. **Schema source of truth:** `src/db/migrations/001_initial.sql`. For a compact inventory aligned with code, see `docs/IMPLEMENTATION-SNAPSHOT.md`. For migration commands and env vars, see `docs/DB-MIGRATIONS.md`. For domain flows and API design, see `docs/RESERVATION-SYSTEM-ARCHITECTURE.md` and `docs/STRIPE-ARCHITECTURE.md`. For invoicing flows and rollout notes, see `docs/payments/invoicing-mvp-implementation.md` and `src/services/billingDocumentService.js`, `src/services/billingDeliveryService.js`, `src/db/repositories/billingDocumentsRepo.js`.

---

## 1. Overview

- **Database:** `citim_teda_som`
- **Engine:** MySQL 8+ / MariaDB
- **Charset:** utf8mb4, utf8mb4_unicode_ci
- **Timestamps:** Stored in UTC (DATETIME(3))

---

## 2. Tables

### schema_migrations

*Migration runner infra — do not modify.*

| Column     | Type         | Description              |
|------------|--------------|--------------------------|
| id         | PK           | Auto-increment           |
| filename   | VARCHAR(255) | Migration filename, UNIQUE |
| applied_at | DATETIME(3)  | When applied             |

---

### users

Identity by email. A row is created when a **reservation** is created with that email (see `src/routes/api/reservations.js`). An optional email on a lock alone does not create a user row.

| Column     | Type         | Description    |
|------------|--------------|----------------|
| id         | PK           | Auto-increment |
| email      | VARCHAR(255) | NOT NULL, UNIQUE |
| name       | VARCHAR(255) | NULL           |
| created_at | DATETIME(3)  |                |
| updated_at | DATETIME(3)  |                |

**Relations:** Referenced by `reservations.user_id`, `payments.user_id`, `billing_documents.user_id` (optional link).

---

### slots

Bookable time slots. Admin-created. See `docs/RESERVATION-SYSTEM-ARCHITECTURE.md` for slot lifecycle.

| Column        | Type              | Description |
|---------------|-------------------|-------------|
| id            | PK                | Auto-increment |
| local_date    | DATE              | NOT NULL — business calendar day (Europe/Bratislava) |
| grid_index    | TINYINT UNSIGNED  | NOT NULL — row index 0..4 (fixed slot times in `src/config/slotGrid.js`) |
| timezone      | VARCHAR(64)       | NOT NULL, default Europe/Bratislava |
| start_at_utc  | DATETIME(3)       | NOT NULL — session start instant (UTC) |
| end_at_utc    | DATETIME(3)       | NOT NULL — session end instant (UTC) |
| status        | ENUM              | open, blocked, cancelled |
| capacity      | INT               | Default 1 |
| created_at    | DATETIME(3)       | |
| updated_at    | DATETIME(3)       | |

**Constraints:** `UNIQUE (local_date, grid_index)` — one cell per calendar slot.

**Indexes:** `(local_date)`, `(start_at_utc)`, `(status, start_at_utc)`.

**Relations:** Referenced by `slot_locks.slot_id`, `slot_lock_challenges.slot_id`, `reservations.slot_id`.

---

### slot_lock_challenges

Single-use capability tokens for **POST /api/slots/:slotId/lock** (see **GET /api/slots/:slotId/lock-challenge**). Short TTL (~2 minutes); expired rows are deleted opportunistically.

| Column          | Type         | Description                    |
|-----------------|--------------|--------------------------------|
| id              | PK           | Auto-increment                 |
| slot_id         | FK → slots   | NOT NULL                       |
| challenge_token | VARCHAR(128) | NOT NULL, UNIQUE               |
| expires_at      | DATETIME(3)  | NOT NULL                       |
| used_at         | DATETIME(3)  | NULL — set when lock consumes  |
| created_at      | DATETIME(3)  |                                |

**Indexes:** `(slot_id, expires_at)`; unique on `challenge_token`.

---

### slot_locks

Short-lived holds on a slot while the funnel books. **`expires_at`** is set by the API: **`POST /api/slots/:slotId/lock`** starts a **5-minute** window; **`POST /api/slots/:slotId/extend-lock`** resets the window to **15 minutes** from that moment (after email is collected). Used until a reservation is created. Listings treat expired locks as absent; operators may delete stale rows in batches from **`/admin/maintenance`** (no scheduled job).

| Column     | Type         | Description              |
|------------|--------------|--------------------------|
| id         | PK           | Auto-increment           |
| slot_id    | FK → slots   | NOT NULL                 |
| lock_token | CHAR(36)     | NOT NULL, UNIQUE (UUID)  |
| email      | VARCHAR(255) | NULL                     |
| expires_at | DATETIME(3)  | NOT NULL                 |
| created_at | DATETIME(3)  |                          |

**Indexes:** `(slot_id)`, `(expires_at)`.

**Relations:** `slot_id` → slots. Lock is deleted after reservation is created.

**See also:** `slot_lock_challenges` (pre-lock capability tokens).

---

### reservations

Links user + slot. Created after lock, before payment. See `docs/RESERVATION-SYSTEM-ARCHITECTURE.md` for flows.

| Column       | Type         | Description                                                       |
|--------------|--------------|-------------------------------------------------------------------|
| id           | PK           | Auto-increment                                                    |
| slot_id      | FK → slots   | NOT NULL                                                          |
| user_id      | FK → users   | NULL                                                              |
| email        | VARCHAR(255) | NOT NULL                                                          |
| status       | ENUM         | draft, pending_payment, confirmed, cancelled, expired             |
| payment_type | ENUM         | deposit, full — user's payment choice at creation                 |
| lock_token   | CHAR(36)     | NULL (stored for traceability)                                    |
| funnel_name  | VARCHAR(32)  | NULL — funnel instance (`pilot`, …) for A/B attribution           |
| funnel_campaign | VARCHAR(64) | NULL — campaign id from `?campaign=` / `INSTANCE_CAMPAIGNS`     |
| funnel_video_id | VARCHAR(128) | NULL — logical video id (`videoId` in campaign config)         |
| admin_note   | TEXT         | NULL — internal note (operator UI: `/admin/reservations/:id`)   |
| cancelled_at | DATETIME(3)  | NULL. Set when status = cancelled                                |
| created_at   | DATETIME(3)  |                                                                   |
| updated_at   | DATETIME(3)  |                                                                   |

**Indexes:** `(email, created_at)`, `(slot_id)`, `(status, created_at)`, `(funnel_name, funnel_campaign, created_at)`.

**Relations:** `slot_id` → slots, `user_id` → users. Referenced by `payments.reservation_id`, `billing_documents.reservation_id` (optional).

**Status flow:** New rows from the public API are created as `pending_payment` (not `draft`). `confirmed` after Stripe `checkout.session.completed` webhook; other terminal states per business rules.

---

### payments

Payment records. One row per Stripe Checkout Session. See `docs/STRIPE-ARCHITECTURE.md` and `docs/SESSION-PRICING.md`.

| Column         | Type         | Description                                              |
|----------------|--------------|----------------------------------------------------------|
| id             | PK           | Auto-increment                                           |
| user_id        | FK → users   | NULL                                                     |
| reservation_id | FK → reservations | NULL                                                |
| provider       | ENUM         | none, stripe                                             |
| provider_ref   | VARCHAR(255) | NULL. For Stripe: cs_... (Checkout Session ID)           |
| payment_type   | ENUM         | deposit, session, topup                                  |
| amount_cents   | INT          | NOT NULL                                                 |
| currency       | CHAR(3)      | Default eur                                              |
| status         | ENUM         | pending, completed, failed, expired, refunded             |
| paid_at        | DATETIME(3)  | NULL. Set when webhook confirms                          |
| checkout_expires_at | DATETIME(3) | NOT NULL. Stripe Checkout session end (and slot hold) for funnel `pending` rows; used to release the slot without cron if `checkout.session.expired` is delayed |
| created_at     | DATETIME(3)  |                                                          |
| updated_at     | DATETIME(3)  |                                                          |

**Indexes:** `(reservation_id)`, `(user_id)`, `(provider, provider_ref)`, UNIQUE `(provider_ref)`, `(status, created_at)`.

**Relations:** `user_id` → users, `reservation_id` → reservations. At most one **`billing_documents`** row per payment (`UNIQUE (payment_id)`).

**Notes:** `provider_ref` stores Stripe Checkout Session ID. Webhook updates `status` and `paid_at` on `checkout.session.completed`. The same webhook path inserts **`billing_documents`** and triggers PDF/email delivery — see `docs/STRIPE-ARCHITECTURE.md` §4–§8, `src/routes/api/stripe.js`, `docs/payments/invoicing-mvp-implementation.md`.

---

### billing_documents

Internal invoicing documents tied to a **single Stripe-settled payment**. Created after `checkout.session.completed` (see `src/services/billingDocumentService.js`); PDF path, document number, and customer email send are handled by `src/services/billingDeliveryService.js`. Admin UI: `/admin/billing`.

| Column | Type | Description |
|--------|------|-------------|
| id | PK | Auto-increment |
| document_number | VARCHAR(64) | NULL until issued — human-visible number (year sequence via `billing_document_counters`) |
| internal_type | ENUM | deposit, full, topup, final, correction, refund — class of document |
| status | ENUM | recorded, issued, void, superseded — default **recorded** |
| user_id | FK → users | NULL — optional link to app user |
| customer_email_snapshot | VARCHAR(255) | NOT NULL — copy at issue time |
| customer_name_snapshot | VARCHAR(255) | NULL |
| reservation_id | FK → reservations | NULL |
| payment_id | FK → payments | NOT NULL — **one document per payment** |
| stripe_checkout_session_id | VARCHAR(255) | NOT NULL — `cs_...` |
| stripe_payment_intent_id | VARCHAR(255) | NULL |
| stripe_charge_id | VARCHAR(255) | NULL |
| currency | CHAR(3) | NOT NULL, default eur |
| amount_net_cents | INT | NOT NULL |
| amount_vat_cents | INT | NOT NULL |
| amount_gross_cents | INT | NOT NULL |
| vat_rate | DECIMAL(6,5) | NOT NULL |
| issued_at | DATETIME(3) | NULL |
| paid_at | DATETIME(3) | NULL |
| refunded_at | DATETIME(3) | NULL |
| related_document_id | FK → billing_documents | NULL — e.g. correction/refund links to original |
| pdf_storage_ref | VARCHAR(512) | NULL — app-relative path under storage |
| pdf_generated_at | DATETIME(3) | NULL |
| email_sent_at | DATETIME(3) | NULL |
| email_message_id | VARCHAR(255) | NULL — Resend id when sent |
| metadata | JSON | NULL |
| notes | TEXT | NULL — operator notes (admin) |
| created_at | DATETIME(3) | |
| updated_at | DATETIME(3) | |

**Constraints:** UNIQUE **`(payment_id)`** — idempotent one document per payment for the MVP insert path.

**Indexes:** `(created_at)`, `(stripe_checkout_session_id)`.

**Relations:** `user_id` → users, `reservation_id` → reservations, `payment_id` → payments, `related_document_id` → self (optional chain).

---

### billing_document_counters

Year-scoped sequence for **`billing_documents.document_number`**. One row per calendar year (`scope_year` PK); `next_seq` advanced under row lock when issuing (see `billingDeliveryService`).

| Column | Type | Description |
|--------|------|-------------|
| scope_year | SMALLINT UNSIGNED | PK — e.g. 2026 |
| next_seq | INT UNSIGNED | NOT NULL, default 1 — next sequence value to allocate |
| updated_at | DATETIME(3) | |

**Relations:** Standalone; used only by billing issuance logic.

---

### webhook_events

Idempotency for Stripe webhooks. One row per processed `evt_...` event.

| Column          | Type         | Description              |
|-----------------|--------------|--------------------------|
| id              | PK           | Auto-increment           |
| stripe_event_id | VARCHAR(255) | NOT NULL, UNIQUE (evt_...) |
| processed_at    | DATETIME(3)  |                          |

---

### email_sent_log

Audit trail for transactional emails. See `docs/EMAILING.md`.

| Column             | Type         | Description                              |
|--------------------|--------------|------------------------------------------|
| id                 | PK           | Auto-increment                            |
| recipient_email    | VARCHAR(255) | NOT NULL                                 |
| template_id        | VARCHAR(100) | NOT NULL (e.g. reservation-confirmation) |
| entity_type        | VARCHAR(50)  | NULL (e.g. reservation)                  |
| entity_id          | BIGINT UNSIGNED | NULL                                  |
| provider_message_id | VARCHAR(255) | NULL (Resend message ID)                 |
| delivery_status    | ENUM         | accepted, delivered, bounced, complained (default: accepted) |
| bounce_reason      | TEXT         | NULL — provider bounce/complaint message |
| bounced_at         | DATETIME(3)  | NULL — when bounce/complaint webhook received |
| actor_type         | ENUM         | anon, user, admin, system (default: system) |
| actor_id           | BIGINT UNSIGNED | NULL                                  |
| sent_at            | DATETIME(3)  | When sent                                |

**Indexes:** `(recipient_email)`, `(entity_type, entity_id)`, `(sent_at)`, `(provider_message_id)`.

---

### audit_logs

Logging for critical actions. See `docs/RESERVATION-SYSTEM-ARCHITECTURE.md`.

| Column      | Type         | Description    |
|-------------|--------------|----------------|
| id          | PK           | Auto-increment |
| actor_type  | ENUM         | anon, user, admin, system |
| actor_id    | BIGINT UNSIGNED | NULL        |
| action      | VARCHAR(100) | NOT NULL       |
| entity_type | VARCHAR(50)  | NULL           |
| entity_id   | BIGINT UNSIGNED | NULL       |
| ip          | VARCHAR(45)  | NULL           |
| user_agent  | VARCHAR(255) | NULL           |
| payload_json| JSON         | NULL           |
| created_at  | DATETIME(3)  |                |

**Indexes:** `(action, created_at)`, `(entity_type, entity_id)`.

---

### assessment_submissions

Life Autopilot Assessment email-unlock rows (migration `007`). See `docs/funnel/it-dev/009-questionnaire-implementation-plan.md` §11.

| Column | Type | Description |
|--------|------|-------------|
| id | BIGINT UNSIGNED PK | Auto-increment |
| email | VARCHAR(255) | NOT NULL |
| funnel_name | VARCHAR(64) | NOT NULL (e.g. `autopilot`) |
| funnel_campaign | VARCHAR(64) | NULL |
| answers_json | JSON | `{ questionId: 1..5 }` |
| scores_json | JSON | `{ dimensionId: { raw, percent } }` |
| primary_bottleneck | VARCHAR(64) | NOT NULL |
| secondary_bottleneck | VARCHAR(64) | NOT NULL |
| source_url | VARCHAR(2048) | NULL |
| created_at | DATETIME(3) | UTC |

**Indexes:** `(email, created_at)`, `(funnel_name, created_at)`, `(primary_bottleneck, created_at)`.

Does **not** FK to `users`.

**Related lead event:** `assessment_email_unlocked` in `lead_event_types` / `lead_events` (migration `008`). See `docs/leads/assessment-conversion-events.md`.

---

## 3. Entity relationship summary

```
users ←── reservations ──→ slots
   ↑            ↑
   └── payments ─┘
          │
          └── billing_documents (FK payment_id, optional user_id, reservation_id;
              optional related_document_id → billing_documents)

billing_document_counters — yearly `next_seq` for document_number (no FK from billing_documents)

slot_locks → slots
slot_lock_challenges → slots
payments → reservations
webhook_events (standalone)
email_sent_log (standalone)
audit_logs (standalone)
assessment_submissions (standalone)
```

---

## 4. Related docs

| Doc | Content |
|-----|---------|
| `docs/IMPLEMENTATION-SNAPSHOT.md` | Code-first schema summary and env behavior |
| `docs/DB-MIGRATIONS.md` | Migration commands, env vars, live idempotent migration workflow |
| `docs/RESERVATION-SYSTEM-ARCHITECTURE.md` | Booking flows, slots, locks, reservations |
| `docs/STRIPE-ARCHITECTURE.md` | Payments, webhooks, Checkout Sessions |
| `docs/SESSION-PRICING.md` | Amounts, deposit vs full payment |
| `docs/payments/invoicing-mvp-implementation.md` | Invoicing MVP design, edge cases, rollout |
| `docs/EMAILING.md` | Templates incl. billing invoice email |
| `docs/funnel/it-dev/016-assessment-v1-summary.md` | Assessment funnel entry |
