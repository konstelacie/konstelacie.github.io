# Booking API Security Hardening Plan (Capability-Based Model)

## Context

This system exposes **public booking APIs** (no user authentication) that perform **state-changing operations**:

* Slot locking
* Reservation creation
* Checkout session creation (Stripe)

These endpoints must remain publicly accessible, but **must not be freely exploitable**.

The goal is to transform the system from:

> “public endpoints with implicit trust”

into:

> “public endpoints with strict capability-based authorization + abuse resistance”

---

## Core Principles

### 1. Capability-Based Authorization (NOT user auth)

Every state-changing action must require:

* A **high-entropy, unguessable token**
* Bound to:

  * specific `slotId`
  * specific DB row (lock/reservation)
  * short TTL
* Ideally **single-use** (where applicable)

No endpoint should allow mutation based only on `slotId` or other predictable identifiers.

---

### 2. Server is the Source of Truth

Client input is always treated as:

* untrusted
* replayable
* forgeable

All invariants must be re-validated:

* inside DB transaction
* right before mutation

---

### 3. Abuse Resistance is Mandatory

Even “valid flows” must be protected against:

* spam
* brute-force
* enumeration
* resource exhaustion

---

## Endpoint-by-Endpoint Design

---

### GET /api/slots

#### Purpose

Public read of available slots.

#### Risks

* scraping
* enumeration
* DB load amplification

#### Requirements

* Rate limit per IP (e.g. 30–60 req/min)
* Response must NOT include:

  * internal states
  * lock tokens
  * hidden metadata
* Prefer:

  * caching (server or CDN)
  * minimal payload

#### Optional

* Add jitter / caching layer to reduce DB hits

---

### POST /api/slots/:slotId/lock

#### Purpose

Create a temporary lock on a slot.

#### Current Risk

* Bot can iterate slotIds and lock everything
* No cost to attacker

#### Required Changes

##### 1. Rate Limiting

* Per IP (strict)
* Per slotId (prevent hammering single slot)

##### 2. Capability Challenge (NEW)

Introduce a pre-step:

```
GET /api/slots/:slotId/lock-challenge
→ returns: { challengeToken }
```

* challengeToken:

  * high entropy (≥128 bits)
  * short TTL (1–3 min)
  * bound to slotId

Then:

```
POST /api/slots/:slotId/lock
body: { challengeToken }
```

Server verifies:

* token exists
* token matches slotId
* token not expired
* token not already used

##### 3. DB Enforcement

Inside transaction:

* SELECT slot FOR UPDATE
* ensure:

  * slot is still open
  * no active lock
* insert lock row

##### 4. Response Hardening

Always return generic errors:

```
"Slot is no longer available"
```

Never expose:

* whether slot exists
* whether token was invalid

---

### POST /api/reservations

#### Purpose

Convert lock → reservation

#### Required Constraints

* Must require:

  * `lockToken`
  * `slotId`
  * `email`

* Validate:

  * lock exists
  * lock belongs to slotId
  * lockToken matches (exact)
  * lock not expired

##### DB Transaction

Inside transaction:

* lock row must still be valid
* reservation must not already exist

##### Idempotency

* If reservation already exists for this lock:

  * return existing reservation
  * DO NOT create new one

##### Rate Limiting

* Per IP
* Per email

---

### POST /api/checkout/create-session

#### Purpose

Create Stripe Checkout session

#### Risks

* Session spam
* DB inconsistency
* multiple active sessions

#### Required Constraints

* Must require:

  * valid reservationId
* Validate:

  * reservation exists
  * status = `pending_payment`
  * not expired

##### Idempotency (CRITICAL)

* If active session already exists:

  * return existing session
  * DO NOT create new one

##### Rate Limiting

* Per reservation
* Per IP

##### Cooldown

* Prevent rapid repeated attempts

---

### POST /api/revoke (or similar)

#### Purpose

Cancel lock / reservation

#### Requirements

* Must require:

  * `lockToken`
* Validate:

  * token matches DB row
  * token bound to correct slot/reservation

##### Token Rules

* high entropy
* compared safely
* optionally:

  * single-use
  * invalidated after action

---

### POST /api/stripe/webhook

#### Purpose

Finalize payment state

#### Rules (STRICT)

* Must:

  * use raw body
  * verify Stripe signature

* Only webhook can:

  * mark reservation as confirmed
  * mark payment as paid

Client redirects (success/cancel) are NOT trusted.

---

### POST /api/cron/run

#### Purpose

Internal automation

#### Required Changes

* DO NOT pass secret in query string
* Use:

```
Authorization: Bearer <CRON_SECRET>
```

* Secret must be:

  * long
  * random

#### Optional Hardening

* IP allowlist
* secondary secret

---

## Cross-Cutting Concerns

---

### Rate Limiting (Global)

Apply to:

* lock creation
* reservation creation
* checkout creation
* slot listing (lighter)

Strategy:

* IP-based
* optional email-based
* optional slot-based

---

### Error Message Strategy

All auth-like failures must be indistinguishable.

BAD:

* "invalid token"
* "slot not found"

GOOD:

* "request cannot be completed"

---

### Token Design

All tokens (lockToken, challengeToken):

* length: ≥128 bits entropy
* format: base64url / hex
* stored hashed (optional but recommended for shared secrets)
* bound to:

  * slotId
  * DB row
  * TTL

---

### Idempotency

Required for:

* reservation creation
* checkout session creation

Approach:

* idempotency key OR
* reuse existing DB rows

---

### DB Safety

* Use transactions for all writes
* Use:

  * `SELECT ... FOR UPDATE`
* Keep transactions short

---

### CSRF Considerations

Current system:

* no user sessions → low risk

Future risk:

* if cookies added → CSRF becomes relevant

Rule:

* keep booking API cookie-less

---

### Observability

Must have:

* requestId logging
* logs for:

  * lock creation
  * reservation creation
  * checkout creation
  * webhook events

Monitor:

* spikes in:

  * 429
  * failed locks
  * failed reservations

---

### Security Headers

Recommended:

* HTTPS only
* HSTS
* CSP (basic)
* frame-ancestors / X-Frame-Options

---

## Implementation Phases

---

### Phase 1 (Immediate)

* Rate limiting
* Generic error responses
* Idempotency for checkout
* Move cron secret to header

---

### Phase 2

* Introduce lock challenge (capability pre-step)
* Strengthen token binding
* Add cooldowns

---

### Phase 3

* Observability + alerts
* Optional WAF / proxy rules
* DB privilege hardening

**Implemented in app (Phase 3)**

* **Request IDs** — `X-Request-Id` on `/api/*` and `/api/stripe/webhook` (see `requestId.js`, `app.js`).
* **Structured access logs** — one JSON line per API response (`tag: api_access`, `requestId`, `method`, `path`, `status`, `ms`) — grep for `"status":429` or `"status":5` for spikes; `level` is `warn` for 429, `error` for 5xx.
* **Stripe webhook logs** — `stripe_webhook_received`, `stripe_webhook_checkout_completed` (after successful `checkout.session.completed`), `duplicate`, `invalid_signature`, `stripe_webhook_unhandled` (see `src/routes/api/stripe.js`).
* **Security headers** — `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`; in production also **HSTS** and **CSP** (Meta Pixel allowed: `connect.facebook.net`, `www.facebook.com`). Disable CSP with **`ENABLE_SECURITY_CSP=0`** if something breaks.

**Operator / infra (not in repo)**

* **Alerts** — point your log stack at JSON lines above (e.g. high counts of `api_access` lines with `"status":429` or `"level":"error"`).
* **WAF / proxy** — optional rate limits and bot rules at alwaysdata or CDN.
* **DB privileges** — grant the app MySQL user only `SELECT/INSERT/UPDATE/DELETE` on app tables; separate migration/admin user.

---

## Final Model Summary

Public API stays:

* READ → open (limited)
* WRITE → guarded by:

  * capability tokens
  * DB invariants
  * rate limiting
  * idempotency

Stripe remains:

* single source of truth for payments (via webhook)

---

This design preserves:

* frictionless UX (no login)
* high abuse resistance
* strong consistency guarantees
