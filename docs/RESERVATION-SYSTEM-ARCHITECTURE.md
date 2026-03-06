# Reservation System — Architecture Proposal

**For AI assistants (Cursor, Copilot, etc.):** This document defines the technical architecture for the booking/reservation system. Use it when implementing slots, reservations, payments, or admin. Do not duplicate pricing or Stripe logic—see `docs/SESSION-PRICING.md` and `docs/STRIPE-ARCHITECTURE.md`.

**Schema source of truth:** `src/db/migrations/001_initial.sql`. For full schema reference (tables, columns, indexes, relationships), see `docs/DB-SCHEMA.md`. Sections 3–4 describe the domain model and schema; they match the implementation.

---

## 1) Goals & Non-Goals

### V1 Goals
- Public slot browsing (no auth required).
- Slot lock for 15 minutes after user selects a slot.
- Lock expiry and automatic unlock.
- Reservation creation with minimum 10 € payment (first session) or 45 € (future sessions) per `docs/SESSION-PRICING.md`.
- Payment via Stripe Checkout; webhook as single source of truth (see `docs/STRIPE-ARCHITECTURE.md`).
- Reservation status endpoint for polling.
- Cancellation endpoint (business rules as placeholders).
- Minimal admin: slot creation, basic monitoring.
- Audit logging for critical actions.
- Timezone: Europe/Bratislava.

### V2+ (Deferred)
- Live availability via WebSockets.
- “People viewing” presence.
- Google Calendar sync.
- Reschedule flows.
- Waitlists.
- Full calendar UI in admin.
- Magic link / passwordless auth (V1 can use email + minimal identity).

---

## 2) User Flows (V1)

### Flow A: First-time user booking
1. User visits booking page (no auth).
2. User selects date range; system returns available slots.
3. User selects slot → **POST lock slot** (15 min lock).
4. User enters email (and optionally name); system creates or finds user by email.
5. User chooses payment path: **reservation only** (10 €) or **full payment now** (45 €+). See `docs/SESSION-PRICING.md` for amounts and labels.
6. **POST create reservation** (links slot + user + payment type).
7. **POST start payment** → Stripe Checkout (deposit or full amount).
8. User pays on Stripe; webhook confirms → reservation status = `confirmed`.
9. User sees confirmation page; email sent (optional).

*V2: Magic link / passwordless auth may add identity step before payment choice; V1 uses email only.*

### Flow B: Returning user booking
1. User logs in to client zone (`/zona/`).
2. User selects slot → **POST lock slot**.
3. User chooses reservation (10 € first) or full payment (45 €+).
4. **POST create reservation**.
5. **POST start payment** → Stripe Checkout.
6. Webhook confirms → reservation confirmed.
7. Confirmation shown in client zone.

### Flow C: Cancellation / reschedule (tech view)
1. User or admin calls **POST cancel reservation**.
2. Business rules (placeholders): refund policy, cutoff time, etc.
3. Slot released; reservation status = `cancelled`.
4. Optional: Stripe refund via admin or automated rule.
5. Audit log records cancellation.

### Slot lock concept
- **Lock duration:** 15 minutes from lock creation.
- **Lock creation:** `POST /api/slots/:slotId/lock` returns `lockToken` and `expiresAt`.
- **Lock usage:** `lockToken` required for `POST create reservation` and `POST start payment`.
- **Manual revoke:** `POST /api/revoke` with body `{ slotId, lockToken }` releases the lock before expiry.
- **Unlock:** Automatic on expiry; cron cleans expired locks; reads treat expired locks as unlocked.

---

## 3) Domain Model

### Entities

| Entity | Purpose |
|--------|---------|
| **User** | Identity (email, optional name). Guest or registered. |
| **Slot** | Time slot for a session (1 hour). |
| **Reservation** | Links User + Slot + Payment. |
| **SlotLock** | Temporary hold on a slot (15 min). |
| **Payment** | Payment record (per Stripe doc). |
| **AuditLog** | Critical actions for debugging and compliance. |
| **AdminUser** | Admin identity (separate from User). |

### Key fields

**User**
- `id`, `email` (unique), `name` (nullable), `created_at`, `updated_at`.

**Slot**
- `id`, `start_at` (DATETIME), `end_at` (DATETIME), `timezone`, `status` (open | blocked | cancelled), `capacity`, `created_at`, `updated_at`.

**SlotLock**
- `id`, `slot_id` (FK), `lock_token` (unique, UUID), `email` (nullable), `expires_at` (DATETIME), `created_at`.

**Reservation**
- `id`, `slot_id` (FK), `user_id` (FK, nullable), `email`, `status` (draft | pending_payment | confirmed | cancelled | expired), `payment_type` (deposit | full), `lock_token` (nullable), `cancelled_at` (nullable), `created_at`, `updated_at`.

**Payment**
- Per `docs/DB-SCHEMA.md`: `id`, `user_id`, `reservation_id`, `provider`, `provider_ref` (Stripe session ID), `payment_type` (deposit | session | topup), `amount_cents`, `currency`, `status`, `paid_at`, `created_at`, `updated_at`.

**AuditLog**
- `id`, `action`, `entity_type`, `entity_id`, `actor_type` (anon | user | admin | system), `actor_id` (nullable), `payload_json`, `ip`, `user_agent`, `created_at`.

**AdminUser**
- `id`, `email`, `password_hash`, `created_at`, `last_login_at` (nullable).

### Indexes
- `slots`: `(start_at)`, `(status, start_at)`.
- `slot_locks`: `(slot_id)`, `(lock_token)` unique, `(expires_at)`.
- `reservations`: `(slot_id)`, `(email, created_at)`, `(status, created_at)`.
- `payments`: `(reservation_id)`, `(user_id)`, UNIQUE `(provider_ref)`.
- `audit_logs`: `(action, created_at)`, `(entity_type, entity_id)`.

### Enums
- **Slot status:** `open`, `blocked`, `cancelled`.
- **SlotLock:** no status; validity by `expires_at`.
- **Reservation status:** `draft`, `pending_payment`, `confirmed`, `cancelled`, `expired`.
- **Payment status:** `pending`, `completed`, `failed`, `expired`, `refunded` (per Stripe doc).

---

## 4) Database Schema (MySQL/MariaDB)

### Timezone
- Store all timestamps in **UTC**.
- Convert to Europe/Bratislava only for display and slot generation.

### Tables

**users**
| Column | Type | Constraints |
|--------|------|-------------|
| id | BIGINT UNSIGNED AUTO_INCREMENT | PK |
| email | VARCHAR(255) | NOT NULL, UNIQUE |
| name | VARCHAR(255) | NULL |
| created_at | DATETIME(3) | DEFAULT CURRENT_TIMESTAMP |
| updated_at | DATETIME(3) | ON UPDATE CURRENT_TIMESTAMP |

**slots**
| Column | Type | Constraints |
|--------|------|-------------|
| id | BIGINT UNSIGNED AUTO_INCREMENT | PK |
| start_at | DATETIME(3) | NOT NULL, INDEX |
| end_at | DATETIME(3) | NOT NULL |
| timezone | VARCHAR(64) | DEFAULT 'Europe/Bratislava' |
| status | ENUM('open','blocked','cancelled') DEFAULT 'open' | INDEX |
| capacity | INT | DEFAULT 1 |
| created_at | DATETIME(3) | |
| updated_at | DATETIME(3) | |

Index: `(status, start_at)` for availability queries.

**slot_locks**
| Column | Type | Constraints |
|--------|------|-------------|
| id | BIGINT UNSIGNED AUTO_INCREMENT | PK |
| slot_id | BIGINT UNSIGNED | NOT NULL, FK → slots(id), ON DELETE CASCADE |
| lock_token | CHAR(36) | NOT NULL, UNIQUE |
| email | VARCHAR(255) | NULL |
| expires_at | DATETIME(3) | NOT NULL, INDEX |
| created_at | DATETIME(3) | |

Index: `(expires_at)` for cleanup.

**reservations**
| Column | Type | Constraints |
|--------|------|-------------|
| id | BIGINT UNSIGNED AUTO_INCREMENT | PK |
| slot_id | BIGINT UNSIGNED | NOT NULL, FK → slots(id) |
| user_id | BIGINT UNSIGNED | NULL, FK → users(id) |
| email | VARCHAR(255) | NOT NULL |
| status | ENUM('draft','pending_payment','confirmed','cancelled','expired') DEFAULT 'draft' | INDEX |
| payment_type | ENUM('deposit','full') | NOT NULL DEFAULT 'deposit' |
| lock_token | CHAR(36) | NULL |
| cancelled_at | DATETIME(3) | NULL |
| created_at | DATETIME(3) | |
| updated_at | DATETIME(3) | |

Unique: `(slot_id)` where status IN ('pending_payment','confirmed') — one active reservation per slot.

**payments**
- Per `docs/DB-SCHEMA.md`; `reservation_id` maps to `reservations.id`; `provider_ref` stores Stripe session ID.

**audit_logs**
| Column | Type | Constraints |
|--------|------|-------------|
| id | BIGINT UNSIGNED AUTO_INCREMENT | PK |
| actor_type | ENUM('anon','user','admin','system') | DEFAULT 'system' |
| actor_id | BIGINT UNSIGNED | NULL |
| action | VARCHAR(100) | NOT NULL |
| entity_type | VARCHAR(50) | NULL |
| entity_id | BIGINT UNSIGNED | NULL |
| ip | VARCHAR(45) | NULL |
| user_agent | VARCHAR(255) | NULL |
| payload_json | JSON | NULL |
| created_at | DATETIME(3) | |

Index: `(action, created_at)`, `(entity_type, entity_id)`.

**admin_users**
| Column | Type | Constraints |
|--------|------|-------------|
| id | BIGINT UNSIGNED AUTO_INCREMENT | PK |
| email | VARCHAR(255) | NOT NULL, UNIQUE |
| password_hash | VARCHAR(255) | NOT NULL |
| created_at | TIMESTAMP | |
| last_login_at | TIMESTAMP | NULL |

---

## 5) API Contract (V1)

### Public

**GET /api/slots**
- Query: `from` (ISO date), `to` (ISO date), `timezone` (optional, default Europe/Bratislava).
- Response: `{ slots: [{ id, startAt, endAt, status, isLocked? }] }`.
- Errors: 400 (invalid params).

**POST /api/slots/:slotId/lock**
- Body: `{ email?: string, userId?: number }` (one of email or userId for returning user).
- Response: `{ lockToken, expiresAt, slotId }`.
- Errors: 400 (slot invalid), 409 (slot locked or reserved).

**POST /api/revoke**
- Body: `{ slotId, lockToken }`.
- Response: `{ ok, revoked }`. `revoked: false` when lock not found or expired.
- Errors: 400 (invalid params).

**GET /api/reservations/:id/status**
- Query: `lockToken` (optional, for pending).
- Response: `{ id, status, slotId, startsAt, paymentStatus?, paymentUrl? }`.
- Errors: 404.

### Authenticated (user or lockToken)

**POST /api/reservations**
- Body: `{ slotId, lockToken, email, paymentType: 'deposit'|'full', amount?: number }`. `email` required for first-time users; `amount` required when `paymentType: 'full'`.
- Headers: `Authorization: Bearer <token>` (returning user) or `X-Lock-Token: <lockToken>` (first-time).
- Response: `{ id, status, slotId, paymentUrl }`.
- Errors: 400, 401, 409 (slot no longer available).

**POST /api/payments/start**
- Boundary to Stripe doc. Body: `{ reservationId, paymentType }`.
- Response: `{ url }` (Stripe Checkout URL).
- Errors: 401, 404, 409 (already paid).

**POST /api/reservations/:id/cancel**
- Body: `{ reason?: string }`.
- Response: `{ id, status: 'cancelled' }`.
- Errors: 404, 409 (already completed/cancelled).

### Webhook

**POST /api/stripe/webhook**
- Raw body; verify Stripe signature.
- See `docs/STRIPE-ARCHITECTURE.md` for handling.
- Response: 200 (always after processing or idempotent).

### Admin (protected)

**POST /api/admin/slots** (bulk create)
- Body: `{ slots: [{ startsAt, endsAt }] }`.
- Response: `{ created: number, ids: number[] }`.

---

## 6) Concurrency & Consistency

### Double booking prevention
1. **Unique constraint:** One active reservation per slot (`slot_id` + status IN ('pending','confirmed')).
2. **Row locking:** `SELECT ... FOR UPDATE` on slot when creating reservation.
3. **Transactions:** Lock slot → create reservation → create payment record in one transaction.
4. **Idempotency:** `X-Idempotency-Key` on POST create reservation and POST start payment; store and reject duplicates.

### Lock expiry
1. **Cron:** Every 5 minutes delete `slot_locks` where `expires_at < NOW()`.
2. **Read-time check:** When using `lockToken`, verify `expires_at > NOW()`; treat expired as invalid.
3. **Write-time check:** Before creating reservation, re-validate lock.

---

## 7) Security & Abuse Prevention (V1)

- **Rate limiting:** 60 req/min per IP for lock; 20 req/min for reservation creation.
- **Email validation:** Format check; optional magic link for first-time users.
- **Bot risk:** Optional hCaptcha/Turnstile on lock (can be deferred).
- **Audit logging:** Log lock, reservation, payment, cancel.
- **Lock abuse:** Max 3 active locks per email/IP (configurable).

---

## 8) Admin & Operations

- **Admin auth:** Session cookie or simple JWT; routes under `/api/admin/*`.
- **Slot creation:** Manual via `POST /api/admin/slots` or script that inserts into `slots`.
- **Monitoring:** Health check for DB; log webhook failures; optional alert on repeated 5xx.
- **Migrations:** Sequential SQL files (e.g. `migrations/001_initial.sql`); run on deploy.

---

## 9) Integration Points

- **Stripe:** See `docs/STRIPE-ARCHITECTURE.md`. Reservation metadata: `reservationId`, `userId`, `paymentType`.
- **Pricing:** See `docs/SESSION-PRICING.md` for amounts and rules.
- **Chatbot:** PseudoChat can link to booking; `OPEN_URL` to booking page. Future: API to check availability.
- **Client zone:** `/zona/` shows user reservations; link to booking; payment history from `payments` by `user_id`.

---

## 10) UX/Copy Hooks (non-authoritative)

- Slot lock countdown (15 min).
- “Limited availability” (static message; no live count in V1).
- Reservation pending state (15 min to pay).
- Success/cancel redirect URLs from Stripe.
- Error messages for expired lock, slot taken, payment failed.

---

## 11) V2 Roadmap (brief)

- WebSockets for live availability.
- “People viewing” presence.
- Google Calendar sync.
- Reschedule flows.
- Waitlists.
- Magic link auth.
- Refund automation.

---

## Assumptions

- Backend: **Node.js + Express** (matches current stack).
- Database: MariaDB/MySQL via `mysql2`.
- Hosting: AlwaysData.
- Auth: Session/JWT for users; separate admin auth.
- First-time users: Email + optional magic link; guest records allowed.
