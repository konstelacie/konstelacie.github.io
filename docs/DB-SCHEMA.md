# Database Schema

**For AI assistants (Cursor, Copilot, etc.):** This document describes the database structure and purpose. Schema source of truth: `src/db/migrations/001_initial.sql`. For migration commands and env vars, see `docs/DB-MIGRATIONS.md`. For domain flows and API design, see `docs/RESERVATION-SYSTEM-ARCHITECTURE.md` and `docs/STRIPE-ARCHITECTURE.md`.

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

Identity by email. Created on first reservation or when user provides email during lock.

| Column     | Type         | Description    |
|------------|--------------|----------------|
| id         | PK           | Auto-increment |
| email      | VARCHAR(255) | NOT NULL, UNIQUE |
| name       | VARCHAR(255) | NULL           |
| created_at | DATETIME(3)  |                |
| updated_at | DATETIME(3)  |                |

**Relations:** Referenced by `reservations.user_id`, `payments.user_id`.

---

### slots

Bookable time slots. Admin-created. See `docs/RESERVATION-SYSTEM-ARCHITECTURE.md` for slot lifecycle.

| Column     | Type         | Description                    |
|------------|--------------|--------------------------------|
| id         | PK           | Auto-increment                 |
| start_at   | DATETIME(3)  | NOT NULL                       |
| end_at     | DATETIME(3)  | NOT NULL                       |
| timezone   | VARCHAR(64) | Default Europe/Bratislava      |
| status     | ENUM         | open, blocked, cancelled      |
| capacity   | INT          | Default 1                     |
| created_at | DATETIME(3)  |                                |
| updated_at | DATETIME(3)  |                                |

**Indexes:** `(start_at)`, `(status, start_at)`.

**Relations:** Referenced by `slot_locks.slot_id`, `reservations.slot_id`.

---

### slot_locks

15-minute holds on slots. Created by `POST /api/slots/:slotId/lock`. Used for reservation creation.

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
| cancelled_at | DATETIME(3)  | NULL. Set when status = cancelled                                |
| created_at   | DATETIME(3)  |                                                                   |
| updated_at   | DATETIME(3)  |                                                                   |

**Indexes:** `(email, created_at)`, `(slot_id)`, `(status, created_at)`.

**Relations:** `slot_id` → slots, `user_id` → users. Referenced by `payments.reservation_id`.

**Status flow:** draft → pending_payment (after creation) → confirmed (after webhook) or cancelled/expired.

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
| created_at     | DATETIME(3)  |                                                          |
| updated_at     | DATETIME(3)  |                                                          |

**Indexes:** `(reservation_id)`, `(user_id)`, `(provider, provider_ref)`, UNIQUE `(provider_ref)`, `(status, created_at)`.

**Relations:** `user_id` → users, `reservation_id` → reservations.

**Notes:** `provider_ref` stores Stripe Checkout Session ID. Webhook updates `status` and `paid_at` on `checkout.session.completed`.

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
| entity_id          | BIGINT       | NULL                                     |
| provider_message_id | VARCHAR(255) | NULL (Resend message ID)                 |
| actor_type         | ENUM         | anon, user, admin, system (default: system) |
| actor_id           | BIGINT       | NULL                                     |
| sent_at            | DATETIME(3)  | When sent                                |

**Indexes:** `(recipient_email)`, `(entity_type, entity_id)`, `(sent_at)`.

---

### audit_logs

Logging for critical actions. See `docs/RESERVATION-SYSTEM-ARCHITECTURE.md`.

| Column      | Type         | Description    |
|-------------|--------------|----------------|
| id          | PK           | Auto-increment |
| actor_type  | ENUM         | anon, user, admin, system |
| actor_id    | BIGINT       | NULL           |
| action      | VARCHAR(100) | NOT NULL       |
| entity_type | VARCHAR(50)  | NULL           |
| entity_id   | BIGINT       | NULL           |
| ip          | VARCHAR(45)  | NULL           |
| user_agent  | VARCHAR(255) | NULL           |
| payload_json| JSON         | NULL           |
| created_at  | DATETIME(3)  |                |

**Indexes:** `(action, created_at)`, `(entity_type, entity_id)`.

---

## 3. Entity relationship summary

```
users ←── reservations ──→ slots
   ↑            ↑
   └── payments ─┘

slot_locks → slots
payments → reservations
webhook_events (standalone)
email_sent_log (standalone)
audit_logs (standalone)
```

---

## 4. Related docs

| Doc | Content |
|-----|---------|
| `docs/DB-MIGRATIONS.md` | Migration commands, env vars, recreate workflow |
| `docs/RESERVATION-SYSTEM-ARCHITECTURE.md` | Booking flows, slots, locks, reservations |
| `docs/STRIPE-ARCHITECTURE.md` | Payments, webhooks, Checkout Sessions |
| `docs/SESSION-PRICING.md` | Amounts, deposit vs full payment |
