# Implementation plan (backlog)

**Purpose:** Track work **not yet implemented** or only partially planned. **Current behavior** lives in code and `docs/IMPLEMENTATION-SNAPSHOT.md`; **HTTP contracts** in `docs/API.md`.

**How to use:** Pick an item; implement; update this file, `IMPLEMENTATION-SNAPSHOT.md`, and affected docs (`API.md`, `DB-SCHEMA.md`, integration docs) in the same effort.

**Phase:** Early dev — no legacy data constraints (see `docs/PRACTICES.md`).

---

## 1. Public API — reservations

| | |
|---|--|
| **Item** | `POST /api/reservations/:id/cancel` (or equivalent cancel contract) |
| **Current state** | No cancel endpoint. Reservation terminal states `cancelled` / `expired` exist in schema; no public flow sets them. |
| **Target** | Authenticated or token-based cancel safe for public use; or email+magic link; define policy. |
| **Dependencies** | Product rules (refund vs deposit forfeiture); Stripe refund if payment completed (`docs/STRIPE-ARCHITECTURE.md` future extensions); audit logging. |
| **Definition of done** | Documented route + tests/manual checklist; DB updates consistent with `slot` availability; `docs/API.md` updated. |

---

## 2. Admin / operator — gaps after internal UI

| | |
|---|--|
| **Item** | Hardening and optional extras beyond the **session HTML admin** at `/admin` |
| **Current state** | **Implemented:** `src/routes/admin.js` — login, slot grid, single + bulk create, block/unblock/cancel slot, reservation list/detail, confirm/cancel reservation, `admin_note`, external-handling note; **billing** — list/search (`/admin/billing`), CSV export, document detail, regenerate PDF, resend invoice email, notes on `billing_documents`. **Docs:** `docs/ui-ux/admin-interface.md`, `docs/IMPLEMENTATION-SNAPSHOT.md`, `docs/API.md` (Admin section). Env: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`. |
| **Target** | Product-dependent: CSRF tokens on admin forms, rate limiting, optional **JSON admin API** for automation, SSO — only if needed. |
| **Dependencies** | Same admin auth; Stripe refunds if cancel-with-refund is added (`docs/STRIPE-ARCHITECTURE.md`). |
| **Definition of done** | Scoped per sub-feature; update snapshot + `docs/API.md` if a new public contract appears. |

---

## 3. Email — reliability and operations

| | |
|---|--|
| **Item A** | Cron: **advisory lock** (or `cron_lock` table) so overlapping `/api/cron/run` does not double-process |
| **Current state** | `src/routes/api/cron.js` runs `runAll()` with no lock; idempotency via `email_sent_log` only. |
| **Target** | Single active run at a time, or explicit skip response when another run holds the lock. |
| **Dependencies** | MySQL `GET_LOCK` or small table; `docs/SCHEDULED-EMAILS-CRON.md` already describes planned design. |
| **Definition of done** | Lock + tests; doc §10 updated from “planned” to “implemented”. |

| | |
|---|--|
| **Item B** | **Resend retries / pacing** for cron sends (429, 5xx) |
| **Current state** | Single attempt per email in `emailService` / jobs; failures logged. |
| **Target** | Bounded retries/backoff per `docs/SCHEDULED-EMAILS-CRON.md` §11 (planning). |
| **Dependencies** | Item A optional but helps avoid duplicate sends under load. |
| **Definition of done** | Retry policy in code; observable in logs; doc updated. |

| | |
|---|--|
| **Item C** | **Operator-assisted / manual emails** (compose + send from admin) |
| **Current state** | `docs/EMAILING.md` — transactional email only. **Admin UI exists** (`/admin`) but **no** “send email to client” action yet. |
| **Target** | Send to reservation/user with audit; optional template slot for body. |
| **Dependencies** | Admin auth (§2); optional `email_sent_log.actor_type` = admin. |
| **Definition of done** | At least one path to send logged mail; documented. |

---

## 4. Scheduled jobs — new templates

| | |
|---|--|
| **Item** | Jobs: **post-session follow-up**, **doplatok reminder** (and similar) |
| **Current state** | Only `pre-session-reminder` in `src/jobs/index.js`. |
| **Target** | Cron jobs + EJS templates + `reservationsRepo` queries + `email_sent_log` idempotency per template. |
| **Dependencies** | Product rules in `docs/SESSION-PRICING.md` / `docs/POST-PAYMENT-CLIENT-JOURNEY.md`; session “completed” state or operator flag if not in DB yet. |
| **Definition of done** | Job registered; template id stable; docs in `SCHEDULED-EMAILS-CRON.md` and `EMAILING.md`. |

---

## 5. Marketing / bulk email

| | |
|---|--|
| **Item** | **Newsletter** or **broadcast** sends |
| **Current state** | Planned in `docs/SCHEDULED-EMAILS-CRON.md` / `docs/EMAILING.md`; no consent table or job. |
| **Target** | Opt-in storage, unsubscribe, batch job or Resend batch API. |
| **Dependencies** | Legal/consent design; separate from transactional. |
| **Definition of done** | Schema + minimal UI or API + one campaign path; documented. |

---

## 6. Stripe — payments lifecycle

| | |
|---|--|
| **Item** | **Refunds** (full or partial), extra webhook types as needed |
| **Current state** | `checkout.session.completed` / `expired` only; `payments.status` includes `refunded` but no flow sets it. |
| **Target** | Admin or automated refund; `payment_intent`/`charge` handling if required; webhook updates. |
| **Dependencies** | Product policy; Stripe Dashboard alignment. |
| **Definition of done** | Documented route or admin action + `docs/STRIPE-ARCHITECTURE.md` updated. |

---

## 7. Funnel / product

| | |
|---|--|
| **Item** | Additional **funnel instances** beyond `pilot`; production **Wistia** (or self-hosted) assets |
| **Current state** | `FUNNEL_INSTANCES = ['pilot']`; test Wistia id in `src/routes/funnels.js`. |
| **Target** | New funnels + campaigns per `docs/PRACTICES.md`; replace `WISTIA_TEST_HASHED_ID` when assets ready. |
| **Dependencies** | Creative pipeline `docs/CREATIVE-MEDIA.md`; `sitemap.xml` updates. |
| **Definition of done** | New funnel in registry + views + sitemap; snapshot updated. |

| | |
|---|--|
| **Item** | **PseudoChat** on remarketing funnels |
| **Current state** | Widget present under `public/assets/js/pseudochat/`; not loaded on pilot (`docs/PSEUDOCHAT.md`). |
| **Target** | Opt-in per funnel; flows wired to CTAs. |
| **Dependencies** | Remarketing funnel pages; optional analytics. |
| **Definition of done** | At least one funnel loads chat; doc updated. |

---

## 8. Client / UX (post-payment)

| | |
|---|--|
| **Item** | Richer **success page**; **preparation** forms; **feedback** capture |
| **Current state** | Planning and open questions in `docs/POST-PAYMENT-CLIENT-JOURNEY.md`. |
| **Target** | Product decisions first; then routes/storage + email hooks. |
| **Dependencies** | Items §1–§4 as needed. |
| **Definition of done** | Scoped milestones per feature; avoid duplicating tables in this file. |

---

## 9. Suggested priority order (opinion)

1. **Cancel reservation (public)** (§1) — if product needs it before launch.  
2. **Cron lock + email retries** (§3A–B) — before production traffic.  
3. **Operator manual email** (§3C) — if needed before launch; admin shell already exists.  
4. **Stripe refunds** (§6) — when cancellation/refund policy exists.  
5. **Admin hardening** (§2) — CSRF / rate limits as traffic warrants.  
6. Remaining items by product timeline.

---

## References

| Doc | Role |
|-----|------|
| `docs/API.md` | Public JSON API + admin UI pointer |
| `docs/ui-ux/admin-interface.md` | Admin UI routes and UX |
| `docs/IMPLEMENTATION-SNAPSHOT.md` | Code-first facts |
| `docs/STRIPE-ARCHITECTURE.md` | Stripe behavior |
| `docs/SCHEDULED-EMAILS-CRON.md` | Cron + jobs |
| `docs/EMAILING.md` | Mail + Resend |
| `docs/SESSION-PRICING.md` | Money rules |
