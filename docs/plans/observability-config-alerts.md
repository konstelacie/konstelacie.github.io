# Plan: observability, config errors & admin alerts UI

**For AI assistants:** Improves diagnosability of config/deploy failures (e.g. missing `STRIPE_SECRET_KEY_PROD`), adds proactive admin alerts, and fixes alerts page layout. Code today: `apiAccessLog.js`, `apiError.js`, `paymentBackend.js`, `systemAlertService.js`, `admin/alerts.ejs`.

**Status:** Planned — not implemented.

---

## Context (incident that motivated this)

`POST /api/payments/start` returned **503** in ~2 ms while `/api/slots` kept working. Root cause: missing `STRIPE_SECRET_KEY_PROD` for a prod booking surface. Logs only showed:

```json
{"tag":"api_access","path":"/api/payments/start","status":503,"ms":2}
```

No error code, no env var name, no admin alert. Required reverse-engineering from status + timing.

---

## Goals

1. **Logs must answer “why?”** in one grep — without reading handler source.
2. **Config/deploy mistakes** should surface in admin **before** a customer hits checkout (proactive), and **when** they do (reactive).
3. **Admin alerts page** should be full-width with normal page scroll (not a short inner scroll box).
4. Keep user-facing messages generic; put detail in structured logs + admin UI only.

---

## Gap analysis (current state)

| Area | Today | Problem |
|------|--------|---------|
| `api_access` | `method`, `path`, `status`, `ms` | 503 looks like any other 5xx |
| `apiErrorHandler` | Logs non-`ApiError` only in dev via `console.error` | `ApiError('INTERNAL_ERROR', 'Stripe not configured')` is **silent** in prod |
| `paymentBackend.requireStripeSecret` | Throws `Error('STRIPE_SECRET_KEY_PROD is not configured')` | Caught and replaced with generic message; detail lost |
| Config checks | None at startup | App boots “fine”; fails on first payment |
| `/health` | DB ping only | Doesn’t reflect Stripe/Resend readiness |
| Admin alerts | 7 types (billing, email, cron, Stripe reconciliation) | No config-missing alerts |
| Alerts UI | `admin-wrap--wide` (960px) + `admin-table-wrap--scroll` (max 50vh) | Cramped; nested scroll |

---

## Part 1 — Logging improvements

### 1.1 Central `api_error` log (highest priority)

**Where:** `src/middleware/apiError.js`

On every `ApiError`, emit a structured line **before** sending JSON:

```json
{
  "tag": "api_error",
  "requestId": "...",
  "method": "POST",
  "path": "/api/payments/start",
  "status": 503,
  "error": "INTERNAL_ERROR",
  "message": "Stripe not configured",
  "internalReason": "STRIPE_SECRET_KEY_PROD is not configured",
  "details": { "backend": "prod", "funnelName": "site" }
}
```

Rules:

- Log **all** `ApiError` with `status >= 500`.
- Also log selected **4xx** that indicate ops issues (optional): `EMAIL_PROVIDER_NOT_CONFIGURED`, etc.
- `internalReason` / `details` never sent to client; logs only.
- Migrate remaining `console.error('[api]', …)` to `logLine` for consistency.

### 1.2 Enrich `api_access` for failures

**Where:** `src/middleware/apiAccessLog.js`

When `res.locals.apiErrorCode` is set (by error handler), include `error` on the access line. Enables grep on either tag:

```
grep '"path":"/api/payments/start"' | grep '"status":503'
grep '"tag":"api_error"' | grep stripe
```

### 1.3 Typed config errors (replace silent catch)

**Where:** `src/config/paymentBackend.js` (+ small helper module)

Introduce `ConfigNotReadyError` (or extend `ApiError` with `internalCode`):

| Field | Example |
|-------|---------|
| `envVar` | `STRIPE_SECRET_KEY_PROD` |
| `backend` | `prod` |
| `surface` | `site` / `pilot` |
| `context` | `payment_start` |

`payments.js` / `paymentBalance.js` should **not** use bare `catch { throw generic }`. Map `ConfigNotReadyError` → `ApiError` for client + rich `api_error` log.

Same pattern for:

- `Database not configured` → `DB_USER` / `DB_NAME` missing
- `RESEND_API_KEY` (email provider)
- `KROS_API_TOKEN`
- `SUPPORT_EMAIL` (support form)
- `RESEND_WEBHOOK_SECRET` (webhook route)
- `CRON_SECRET` / `SESSION_SECRET` (prod admin/cron)

### 1.4 Replace ad-hoc `console.error` in API paths

Audit and standardize these to `logLine` with `requestId`:

| Location | Today |
|----------|--------|
| `payments.js` — Stripe create/expire/retrieve | `console.error('[payments/start] …')` |
| `paymentBalance.js` | same pattern |
| `stripe.js` webhook | mix of `logLine` + gaps |
| `supportContactService.js` | `console.error` only |
| `kros.js` | mostly `logLine` ✓ (good model) |

Use consistent tags: `stripe_checkout_create_failed`, `stripe_session_expire_failed`, etc.

### 1.5 Startup readiness log

**New:** `src/lib/deploymentReadiness.js` (or `src/services/configHealthService.js`)

On app boot (in `app.js` / server entry), run checks derived from **active page modes** (`pageVisibility` + `paymentBackend`):

For each surface that can accept bookings (home `test|prod`, each funnel `test|prod`):

- Required: `STRIPE_SECRET_KEY_{TEST|PROD}`, `STRIPE_PUBLIC_KEY_{*}`, `STRIPE_WEBHOOK_SECRET_{*}`
- If prod surface: also validate `KROS_SEQUENCE_PREFIX_PROD` if billing is expected

Global prod checks:

- `DB_*`, `RESEND_API_KEY`, `SESSION_SECRET`, `CRON_SECRET`, `BALANCE_PAY_TOKEN_SECRET` (if balance pay used)

Emit once:

```json
{"tag":"deployment_readiness","ok":false,"missing":["STRIPE_SECRET_KEY_PROD"],"warnings":["STRIPE_WEBHOOK_SECRET_PROD"]}
```

Never log secret values — only var **names** and which surface needs them.

See also `docs/PAGE-VISIBILITY.md` for how page mode maps to Stripe `_*_{TEST|PROD}` vars.

### 1.6 Optional: extend `/health` (careful)

Add `readiness` block **only if** alwaysdata health checks may expose config state. Safer alternative: **admin-only** readiness panel on `/admin/maintenance` (see Part 2).

---

## Part 2 — Admin alerts: what to warn about

Follow existing patterns in `systemAlertService.js`: idempotent create, auto-resolve when fixed (`cron_not_running`, `stripe_reconciliation_failed`).

### 2.1 New alert types (recommended)

| Type | Severity | Trigger | Entity | Auto-resolve |
|------|----------|---------|--------|--------------|
| `stripe_not_configured` | **critical** | Active surface needs backend X but `STRIPE_SECRET_KEY_X` (or public/webhook pair) missing | `null` (global) or per-backend metadata | When all required keys present |
| `database_not_configured` | **critical** | `getPool()` null in prod | global | When pool available |
| `email_provider_not_configured` | **warning** | `RESEND_API_KEY` missing; emails will fail | global | When set |
| `cron_secret_not_configured` | **warning** | prod + `CRON_SECRET` unset | global | When set |
| `session_secret_not_configured` | **critical** | prod admin + `SESSION_SECRET` unset | global | When set |
| `kros_not_configured` | **warning** | prod billing surface + `KROS_API_TOKEN` missing | global | When set |
| `support_email_not_configured` | **info** | `SUPPORT_EMAIL` missing | global | When set |

Metadata example for `stripe_not_configured`:

```json
{
  "backend": "prod",
  "missingEnvVars": ["STRIPE_SECRET_KEY_PROD"],
  "surfaces": ["site (SITE_HOME_MODE=prod)"],
  "detectedAt": "…",
  "lastRequestPath": "/api/payments/start"
}
```

### 2.2 When to create alerts

**Proactive (preferred):**

- App startup → `deploymentReadiness` → create/resolve config alerts.
- Admin banner middleware (`adminAlertBanner`) → also run readiness check (cheap, cached ~1 min) so fixing env + reload resolves banner without waiting for cron.
- Optional: lightweight cron job `config-health` (same as `cron-health` pattern).

**Reactive (backup):**

- First `ConfigNotReadyError` on a user-facing route → ensure alert exists (deduped by type).

### 2.3 What should **NOT** become admin alerts

| Case | Handle with |
|------|-------------|
| 400 validation, 409 slot/email conflicts | `api_error` at info/debug only |
| 403 captcha | `captcha_*` logs (already exist) |
| 429 rate limit | `api_access` level warn |
| One-off Stripe 502 (network blip) | `api_error` + existing reconciliation alerts if payment actually stuck |
| User bounce / confirmation email failure | **Already covered** (`email_bounced`, `reservation_confirmation_email_failed`) |

### 2.4 Existing alerts — no change needed

Keep as-is: billing doc failure, KROS webhook missing, cron stale, Stripe reconciliation mismatch/failure. New config alerts complement these; avoid duplicate titles.

---

## Part 3 — Admin alerts UI (full width + page scroll)

### Current CSS

`public/assets/css/site.css`:

- `.admin-wrap--wide` — `max-width: min(960px, 100%)`
- `.admin-table-wrap--scroll` — `max-height: min(50vh, 420px); overflow: auto`

Used in `src/views/admin/alerts.ejs`.

### Proposed changes

**`src/views/admin/alerts.ejs`**

- Replace wrapper: `admin-wrap admin-wrap--wide` → `admin-wrap admin-wrap--alerts` (new modifier).
- Remove `admin-table-wrap--scroll`; use plain `admin-table-wrap` (or no wrapper) so the table grows with content.
- Keep detail rows (`admin-table__detail-row`) — they work better with page scroll.

**`public/assets/css/site.css`**

```css
.admin-wrap--alerts {
  max-width: none;           /* or min(1400px, 100%) if a soft cap is preferred */
  padding-inline: var(--spacing-container);
}
```

Optional UX improvements (same pass):

- Sticky `<thead>` via `position: sticky; top: 0` on alerts table (works with body scroll).
- On wide screens, show `message` truncated in main row; full text stays in detail row.

**Do not change** other admin pages’ `--scroll` boxes unless the same treatment is explicitly wanted there (maintenance, bulk preview still benefit from inner scroll).

---

## Part 4 — Implementation phases

### Phase A — Immediate diagnostics (~1 PR)

1. `api_error` logging in `apiErrorHandler`.
2. `ConfigNotReadyError` + fix `paymentBackend.requireStripeSecret` swallowing.
3. Update `payments.js` / `paymentBalance.js` to log `backend`, `funnelName`, `missingEnvVar` on 503.
4. Tests: one unit test for error mapping; one test that `api_error` payload shape is stable.

**After Phase A**, the incident log would look like:

```json
{"tag":"api_error","path":"/api/payments/start","error":"INTERNAL_ERROR","internalReason":"STRIPE_SECRET_KEY_PROD is not configured","backend":"prod"}
```

### Phase B — Proactive config health (~1 PR)

1. `deploymentReadiness.js` + startup log.
2. `systemAlertService` new types + create/resolve helpers.
3. Hook into `adminAlertBanner` (and optionally cron).
4. Admin maintenance page: “Stav konfigurácie” section listing missing vars (read-only, Slovak labels).

### Phase C — Admin alerts UI (~1 small PR)

1. CSS `admin-wrap--alerts`.
2. `alerts.ejs` layout change.
3. Visual check: banner + nav + long alert list scrolls with body.

### Phase D — Docs

Update:

- `docs/security/booking.md` — `api_error` tag, grep examples.
- `docs/PAGE-VISIBILITY.md` — link config readiness to Stripe `_*_{TEST|PROD}` vars.
- New short `docs/OBSERVABILITY.md` — log tags, alert types, what to grep in alwaysdata logs.

---

## Part 5 — Testing checklist

| Scenario | Expected |
|----------|----------|
| Missing `STRIPE_SECRET_KEY_PROD` + `SITE_HOME_MODE=prod` | Startup `deployment_readiness` fail; admin critical alert; `api_error` on payment start |
| Fix env + restart | Alert auto-resolved; payment start 200 |
| Missing DB | Slots 503 + alert + `api_error` with `DB_USER`/`DB_NAME` hint |
| Normal validation error | No admin alert; optional low-level `api_error` skip |
| Alerts page with 20+ rows | Page scrolls to bottom; no inner box clip |

---

## Files likely touched (summary)

| File | Change |
|------|--------|
| `src/middleware/apiError.js` | `api_error` logging |
| `src/middleware/apiAccessLog.js` | optional `error` field |
| `src/config/paymentBackend.js` | typed config error |
| `src/lib/deploymentReadiness.js` | **new** |
| `src/services/systemAlertService.js` | new alert types |
| `src/middleware/adminAlertBanner.js` | run readiness |
| `app.js` / server entry | startup check |
| `src/routes/api/payments.js`, `paymentBalance.js` | use typed errors |
| `src/views/admin/alerts.ejs` | layout |
| `src/views/admin/maintenance.ejs` | config status panel |
| `public/assets/css/site.css` | `admin-wrap--alerts` |
| `tests/` | readiness + logging |

---

## Out of scope

- Changing user-facing booking error copy (keep generic Slovak).
- Exposing missing env vars on public `/health` (unless explicitly desired).
- Log aggregation / external paging — structured tags are enough for alwaysdata grep for now.
