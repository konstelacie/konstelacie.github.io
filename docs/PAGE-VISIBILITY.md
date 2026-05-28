# Page visibility and payment backends

**For AI assistants:** Controls which URLs are served, indexing, and which Stripe/KROS backend each booking uses. Code: `src/config/pageVisibility.js`, `src/config/paymentBackend.js`.

---

## Page visibility modes

Independent of `NODE_ENV` (which still controls cookies, CSP, error messages, etc.).

| Surface | Env var | Values | Default |
|---------|---------|--------|---------|
| Home `/` | `SITE_HOME_MODE` | `test` \| `prod` | `test` |
| Each funnel page | `FUNNEL_{NAME}_MODE` | `hidden` \| `test` \| `prod` | `hidden` |

Example: `FUNNEL_PILOT_MODE` for the `pilot` funnel.

### Home

| Mode | Indexing | Sitemap | Stripe backend for home booking |
|------|----------|---------|--------------------------------|
| `prod` | Indexable (`/` in sitemap, no `noindex`) | Includes `/` | **prod** (`STRIPE_*_PROD`) |
| `test` | `noindex, nofollow`; excluded from sitemap | Omits `/` | **test** (`STRIPE_*_TEST`) |

Home booking always lives on **`/`** — there is no `/site` route. Internal attribution id remains `site` (DB, analytics, deposit pricing).

Stripe returns: `/?payment_pending=1&…` → poll → `/success` or `/cancel`.

### Funnel pages

Always **`noindex, nofollow`**. Never in sitemap. Used only via direct links (ads, email).

| Mode | URL | Stale URLs → redirect `/` |
|------|-----|---------------------------|
| `hidden` | none | `/pilot`, `/pilot-test`, subpaths |
| `test` | `/pilot-test`, `/pilot-test/success`, `/pilot-test/cancel` | `/pilot`, … |
| `prod` | `/pilot`, `/pilot/success`, `/pilot/cancel` | `/pilot-test`, … |

### Testing banner

Shown on home when `SITE_HOME_MODE=test`, on funnel pages when `FUNNEL_*_MODE=test`. Global off: `SITE_TESTING_BANNER=0`.

---

## Payment backends (Stripe + KROS prefix)

Both test and prod credentials are configured in `.env`. Runtime selection follows **page mode of the booking surface**:

| Booking from | Backend |
|--------------|---------|
| Home (`SITE_HOME_MODE=prod`) | prod |
| Home (`SITE_HOME_MODE=test`) | test |
| Funnel (`FUNNEL_*_MODE=prod`) | prod |
| Funnel (`FUNNEL_*_MODE=test` or `hidden`*) | test |

\*Hidden funnels have no route; checkout cannot start from them.

### Env vars

```env
STRIPE_PUBLIC_KEY_TEST=
STRIPE_SECRET_KEY_TEST=
STRIPE_WEBHOOK_SECRET_TEST=

STRIPE_PUBLIC_KEY_PROD=
STRIPE_SECRET_KEY_PROD=
STRIPE_WEBHOOK_SECRET_PROD=

KROS_SEQUENCE_PREFIX_TEST=T    # → numbering sequence T-OF
KROS_SEQUENCE_PREFIX_PROD=     # → OF
```

KROS uses one API (no sandbox). Prefix is the only test/prod separator for invoice sequences.

### Webhook

`POST /api/stripe/webhook` verifies the signature against **both** webhook secrets. KROS sequence prefix follows Stripe `livemode` on the event (`false` → test, `true` → prod).

Configure **test and live** webhook endpoints in Stripe Dashboard pointing to the same URL.

---

## Deployment scenarios

| Goal | `SITE_HOME_MODE` | `FUNNEL_PILOT_MODE` |
|------|------------------|---------------------|
| Home live, funnels off | `prod` | `hidden` |
| Home live, pilot internal test | `prod` | `test` → share `/pilot-test?campaign=…` |
| Pilot in ads | `prod` | `prod` → share `/pilot?campaign=…` |
| Full pre-launch | `test` | `hidden` or `test` |

---

## Adding a funnel page

1. `src/views/funnels/{name}.ejs`
2. `FUNNEL_PAGE_INSTANCES` in `src/config/funnelInstances.js`
3. Campaign/meta in `src/routes/funnels.js`
4. `FUNNEL_{NAME}_MODE` in env
5. **Do not** add funnel URLs to sitemap

---

## Related docs

| Doc | Topic |
|-----|--------|
| `docs/STRIPE-ARCHITECTURE.md` | Checkout, webhooks, `returnPath` |
| `docs/DEPLOY-ALWAYSDATA.md` | Production env checklist |
| `.env.example` | Full variable template |
