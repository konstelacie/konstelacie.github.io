# Captcha Hardening Plan (Google reCAPTCHA)

## Context

The booking flow exposes public endpoints that perform state-changing operations:

* slot lock creation
* reservation creation
* checkout session creation

The primary security model remains:

* capability-based authorization
* DB invariant checks
* rate limiting
* idempotency

Captcha is **not** the primary protection layer.
It is an **adaptive abuse-resistance layer** used only when traffic or behavior becomes suspicious.

---

## Goal

Introduce Google reCAPTCHA as a **selective fallback challenge**, not as a default blocker for all users.

This should:

* reduce cheap bot abuse
* protect DB write endpoints
* preserve conversion for legitimate users

---

## Non-Goals

Captcha must NOT be treated as:

* a replacement for rate limiting
* a replacement for capability tokens
* a replacement for DB transaction checks
* a replacement for idempotency

Captcha alone is insufficient because:

* advanced bots can solve or bypass it
* it adds UX friction
* it should only increase attacker cost, not carry security on its own

---

## Recommended Strategy

Use **risk-based captcha gating**.

Default flow:

* no captcha for normal traffic

Escalated flow:

* captcha required only when server detects suspicious behavior

This gives the best balance between:

* UX
* conversion
* abuse resistance

---

## Where Captcha Should Be Applied

### 1. POST /api/slots/:slotId/lock

#### Why

This is the highest-risk public write endpoint.
An attacker can:

* spam lock attempts
* cycle through slots
* create artificial scarcity
* create DB load

#### Recommendation

Captcha support should exist here.
However:

* do not require captcha by default
* require captcha only after suspicious activity is detected

#### Example triggers

* too many lock attempts from one IP in short time
* repeated lock failures
* fast sequential attempts across multiple slots
* suspicious automation patterns

---

### 2. POST /api/reservations

#### Why

This endpoint can be abused for:

* spam email submissions
* fake reservations
* write amplification
* poisoning lead/contact data

#### Recommendation

Captcha support should exist here as well.
This is a strong candidate for adaptive captcha.

---

### 3. POST /api/checkout/create-session

#### Recommendation

Do NOT require captcha by default.

#### Why

This is the most conversion-sensitive moment.
Security here should come primarily from:

* valid reservation state
* capability checks
* idempotency
* cooldowns

Captcha should only be considered here if real abuse is observed in production.

---

### 4. GET /api/slots

#### Recommendation

Do NOT add captcha.

#### Why

Captcha on read endpoints harms UX and does not meaningfully stop scraping.
Read abuse should instead be handled by:

* rate limiting
* caching
* minimal payloads

---

## UX Principle

Captcha must be invisible in normal flow.

The intended UX is:

1. user attempts normal action
2. server decides action is suspicious
3. server responds with `captcha_required`
4. frontend renders captcha
5. frontend retries the same action with captcha token

This avoids unnecessary friction for legitimate users.

---

## Recommended Flow

### Normal request

Frontend sends request without captcha token.

Example:

```json
POST /api/slots/:slotId/lock
{
  "challengeToken": "..."
}
```

Server evaluates:

* rate-limit state
* IP behavior
* slot behavior
* recent failures

If acceptable:

* continue normally

If suspicious:

```json
{
  "error": "captcha_required"
}
```

---

### Escalated request

Frontend displays Google reCAPTCHA.
After successful solve:

```json
POST /api/slots/:slotId/lock
{
  "challengeToken": "...",
  "captchaToken": "..."
}
```

Server verifies captcha with Google.
If valid:

* continue with normal business logic

If invalid:

* reject with generic message

---

## Backend Design

### General Rule

Captcha verification must happen on the server.
The frontend only obtains the captcha token.
The backend must:

* send token to Google verification endpoint
* verify the response
* reject invalid or missing token when captcha is required

Never trust frontend-only captcha state.

---

## Risk Decision Layer

Add a centralized server-side function such as:

```ts
shouldRequireCaptcha(context): boolean
```

This function decides whether captcha is required for a request.

Possible inputs:

* IP address
* route name
* request velocity
* failure count
* slot attempt pattern
* email attempt pattern
* user-agent quality
* recent per-IP lock count
* recent per-IP reservation count

This decision should be reusable across routes.

---

## Example Risk Signals

### Strong signals

* many write attempts in short period
* repeated failed lock attempts
* repeated failed reservation attempts
* many different slots targeted from same IP
* suspicious burst behavior

### Medium signals

* low-quality user-agent
* unusual request timing
* repeated retries after conflict

### Weak signals

* first request from unknown IP
* ordinary browsing behavior

Weak signals alone should not trigger captcha.

---

## Suggested Captcha Trigger Model

### Level 0: Normal

* no captcha

### Level 1: Elevated suspicion

* require captcha for lock endpoint

### Level 2: High suspicion

* require captcha for lock + reservation endpoints
* optionally apply stronger temporary rate limiting

### Level 3: Severe abuse

* block requests temporarily
* no captcha fallback
* return rate limit / abuse response

This prevents captcha from becoming the only line of defense.

---

## Verification Requirements

When captcha is required:

* captcha token must be present
* token must be verified server-side
* request must be rejected if verification fails

Do not continue to business logic if:

* captcha token is missing
* captcha token is invalid
* verification response is unsuccessful

---

## Response Design

### When captcha is required

Return a machine-readable response such as:

```json
{
  "error": "captcha_required"
}
```

### When captcha verification fails

Return generic failure:

```json
{
  "error": "request_cannot_be_completed"
}
```

Avoid overly specific error messages.

---

## Logging and Observability

Log captcha-related events such as:

* captcha required
* captcha passed
* captcha failed
* captcha missing when required

Log dimensions:

* requestId
* route
* IP
* slotId if applicable
* reservationId if applicable
* result

These logs are important for:

* tuning thresholds
* spotting abuse
* deciding whether captcha is helping

---

## Frontend Requirements

Frontend must support:

* receiving `captcha_required`
* rendering captcha only when requested
* obtaining captcha token
* retrying original action with captcha token
* handling failure without breaking the booking flow

Frontend must NOT:

* assume captcha is always required
* assume one captcha token is reusable forever
* hardcode security decisions that belong to backend

---

## Security Requirements

### Keep captcha separate from capability model

Even if captcha passes, server must still verify:

* challengeToken
* lockToken
* slot availability
* reservation state
* DB invariants

Captcha does not grant permission by itself.

---

### Keep rate limiting even with captcha

A solved captcha must not allow unlimited requests.

Captcha should only:

* reduce false positives for legitimate users
* increase attacker cost

Rate limiting remains mandatory.

---

## Recommended Initial Scope

### Implement now

* backend support for optional captcha verification
* centralized `shouldRequireCaptcha(...)`
* frontend fallback flow for `captcha_required`
* captcha support on:

  * lock endpoint
  * reservation endpoint

### Do not implement now

* mandatory captcha for all users
* captcha on checkout by default
* captcha on read endpoints

---

## Rollout Strategy

### Phase 1

* build backend + frontend support
* keep captcha disabled by default
* log when captcha would have been required

### Phase 2

* enable captcha on elevated-risk lock requests

### Phase 3

* enable captcha on elevated-risk reservation requests
* tune thresholds based on real traffic

This reduces risk of hurting conversion too early.

---

## Implementation (app)

This codebase implements adaptive **Google reCAPTCHA v3** as a secondary layer:

| Surface | HTTP route | `route` in logs |
|--------|------------|-----------------|
| Lock | `POST /api/slots/:slotId/lock` | `lock` |
| Payment / checkout start | `POST /api/payments/start` | `payment_start` |

There is no separate `POST /api/reservations` for the public funnel; the doc’s “reservation” step here is **payment start** (Stripe Checkout session creation). **Read** endpoints are unchanged (no captcha).

### Modes (`CAPTCHA_MODE`)

| Value | Behavior |
|-------|----------|
| `off` (default) | No velocity recording, no captcha. |
| `shadow` | Record per-IP POST counts; when the threshold would be exceeded, log JSON with `tag: captcha_would_require` and still allow the request. |
| `enforce` | Same velocity; when threshold exceeded, require valid `captchaToken` in the JSON body or respond `403` with `error: captcha_required`. |

If `enforce` is set but `RECAPTCHA_SECRET_KEY` is missing, the server logs a warning and **allows** the request (avoid locking users out).

### Environment variables

| Variable | Purpose |
|----------|---------|
| `CAPTCHA_MODE` | `off` \| `shadow` \| `enforce` |
| `RECAPTCHA_SECRET_KEY` | Server-side secret for Google `siteverify` (required for enforce to actually block). |
| `RECAPTCHA_SITE_KEY` | Public v3 key; funnel pages inject it for `booking.js` (required for users to solve in enforce). |
| `RECAPTCHA_MIN_SCORE` | v3 score floor (default `0.5`). |
| `CAPTCHA_LOCK_THRESHOLD` | Per-IP `POST …/lock` count in the sliding window before captcha tier (default `25`). |
| `CAPTCHA_PAYMENT_START_THRESHOLD` | Per-IP `POST …/payments/start` count before captcha tier (default `20`). |

Velocity window is **5 minutes** (in-memory per process; not shared across multiple Node instances).

### Structured log tags

| `tag` | When |
|-------|------|
| `captcha_would_require` | Shadow (or reference for tuning): threshold exceeded. |
| `captcha_required_response` | Enforce: blocked with `captcha_required`. |
| `captcha_passed` | Enforce: token verified. |
| `captcha_failed` | Enforce: token present but verification failed. |

### Code / CSP

* Logic: `src/lib/captcha.js` — config: `src/config/index.js` (`captcha.*`).
* Funnel: `src/routes/funnels.js` sets `window.__BOOKING_RECAPTCHA_SITE_KEY` when `RECAPTCHA_SITE_KEY` is set; client retries: `public/assets/js/booking.js`.
* Production CSP allows Google reCAPTCHA script/frame hosts (`src/middleware/securityHeaders.js`).

---

## Final Model Summary

Google reCAPTCHA should be used as an **adaptive secondary defense layer**.

Primary defenses remain:

* capability tokens
* DB transaction checks
* rate limiting
* idempotency

Captcha should:

* protect the most abuse-prone write endpoints
* appear only when risk is elevated
* stay out of the normal booking flow whenever possible

The intended result is:

* low friction for real users
* higher cost for bots
* better protection for DB and booking integrity
