# Production deployment on alwaysdata

**Status:** Production runs on alwaysdata (live since 2026-06). Use this as the deployment and operations checklist.

**Hosting:** The site runs on [alwaysdata](https://www.alwaysdata.com/) (not GitHub Pages). See also `docs/PRACTICES.md`.

---

## 1. Prerequisites

- alwaysdata account with Node.js app and MySQL database provisioned.
- Code deployed to the app directory (git pull, upload, or CI—per your workflow).
- Copy `.env.example` → `.env` (or set **Environment variables** in the alwaysdata admin UI—preferred for secrets).

---

## 2. Database

1. Create the database and user in alwaysdata (MySQL host is typically `mysql-{account}.alwaysdata.net`).
2. Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
3. Run migrations: `yarn db:migrate` over SSH from the app directory, or apply SQL manually—see `docs/DB-MIGRATIONS.md` (**alwaysdata workflow**).

**Before first prod migration:** back up (alwaysdata backup or `mysqldump`).

---

## 3. Security-related environment variables

Set these in **Admin → Sites → your site → Environment variables** (or equivalent). Never commit real values to git.

| Variable | Required for prod? | Purpose |
|----------|-------------------|---------|
| `NODE_ENV` | Yes | Set to `production` (trust proxy, secure cookies, stricter behavior). |
| `SESSION_SECRET` | **Yes** | Signs the admin session cookie (`admin.sid`). App **fails to start** in production if unset (`src/app.js`). |
| `ADMIN_USERNAME` | If using `/admin` | Internal admin login. |
| `ADMIN_PASSWORD` | If using `/admin` | Internal admin login. |
| `CRON_SECRET` | **Yes** if scheduled jobs run | Protects `POST/GET /api/cron/run`. Without it, cron returns 401 in production. See `docs/SCHEDULED-EMAILS-CRON.md` §4.4. |
| `STRIPE_SECRET_KEY_TEST`, `STRIPE_SECRET_KEY_PROD` | If payments | Checkout Session creation (`POST /api/payments/start`). See `docs/PAGE-VISIBILITY.md`. |
| `STRIPE_WEBHOOK_SECRET_TEST`, `STRIPE_WEBHOOK_SECRET_PROD` | If payments | Verifies `POST /api/stripe/webhook` (both configured; either may match). |
| `SITE_HOME_MODE`, `FUNNEL_*_MODE` | Yes | Page visibility and payment backend selection. See `docs/PAGE-VISIBILITY.md`. |
| `KROS_SEQUENCE_PREFIX_TEST`, `KROS_SEQUENCE_PREFIX_PROD` | If KROS invoicing | Invoice numbering sequences (KROS has no sandbox). |
| `BASE_URL` | Optional | Stripe success/cancel URLs; defaults to request origin if unset. |

**Optional hardening / features:**

| Variable | Notes |
|----------|--------|
| `CAPTCHA_MODE`, `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_SITE_KEY`, thresholds | Adaptive Google reCAPTCHA v3. Default mode is effectively **off** until configured. See `docs/security/captcha.md`. |
| `ENABLE_SECURITY_CSP` | Content-Security-Policy is **on** unless set to `0`. |

**Other operational secrets** (not strictly “security” but needed for a working site): Resend (`RESEND_*`), billing PDF dirs (`BILLING_*`), `META_PIXEL_ID`, legal lines — see `.env.example` and `docs/EMAILING.md`, `docs/STRIPE-ARCHITECTURE.md`.

---

## 4. Cron (scheduled tasks)

Configure alwaysdata **Scheduled tasks** to call `/api/cron/run` with `CRON_SECRET` in a header or (non-prod only) query string. Step-by-step: **`docs/SCHEDULED-EMAILS-CRON.md`** → §4.4 **alwaysdata Setup Guide**.

---

## 5. Stripe

- Dashboard webhook endpoint: `https://your-account.alwaysdata.net/api/stripe/webhook` (HTTPS, test or live mode as appropriate).
- Env vars and local testing: `docs/STRIPE-ARCHITECTURE.md`.
- `POST /api/stripe/webhook` uses **raw body**; do not put the main JSON parser in front of that route (already correct in `src/app.js`).

---

## 6. Billing PDFs (if invoicing is enabled)

Ensure the process can write to `storage/billing-pdfs/` or set `BILLING_PDF_STORAGE_DIR` to an absolute path. See `docs/DB-MIGRATIONS.md` → **Billing PDF storage**.

---

## 7. Quick verification checklist (before go-live)

- [ ] `NODE_ENV=production`
- [ ] `SESSION_SECRET` set (strong random, e.g. `openssl rand -hex 32`)
- [ ] Admin credentials set if `/admin` is used
- [ ] `CRON_SECRET` set and scheduled task configured if jobs are required
- [ ] Stripe keys + webhook secret + webhook URL in Stripe Dashboard
- [ ] DB reachable from app with correct credentials
- [ ] Optional: captcha keys if `CAPTCHA_MODE=enforce` or `shadow`

---

## Related docs

| Topic | Doc |
|-------|-----|
| Full env template | `.env.example` |
| DB migrations | `docs/DB-MIGRATIONS.md` |
| Stripe | `docs/STRIPE-ARCHITECTURE.md` |
| Cron | `docs/SCHEDULED-EMAILS-CRON.md` |
| Captcha | `docs/security/captcha.md` |
| API overview | `docs/API.md` |
