# Project Practices

**For AI assistants (Cursor, Copilot, etc.):** Follow these rules when editing this codebase. Apply them consistently.

**Deployment:** We deploy on alwaysdata (not GitHub Pages). Production checklist (env, cron, Stripe): `docs/DEPLOY-ALWAYSDATA.md`. Page visibility and dual Stripe/KROS backends: `docs/PAGE-VISIBILITY.md`.

**Phase:** **Live** since 2026-06. Stripe testing and release flows: `docs/STRIPE-ARCHITECTURE.md` (Section 10).

---

## Live: Data & Schema

**We are live.** Production data must be preserved.

| Rule | Meaning |
|------|---------|
| **No DB replacement** | Never run `yarn db:reset` on production. Do not drop/recreate the database or tables for schema changes. |
| **Schema changes** | Add a **new** numbered file in `src/db/migrations/` (e.g. `002_add_foo.sql`). Each script must be **idempotent** and safe on the live DB. Apply with `yarn db:migrate`. |
| **Baseline frozen** | `001_initial.sql` was applied at go-live—do **not** edit it for new changes. |
| **Data changes** | Use normal `UPDATE` / `INSERT` as needed; avoid destructive bulk deletes without operator intent. |
| **Docs** | After schema changes, update `docs/DB-SCHEMA.md` to match. |

See `docs/DB-MIGRATIONS.md` for commands and safety notes.

---

## Links and Asset Paths

### Use root-relative URLs

**Always** use root-relative paths (starting with `/`) for:

- Stylesheets: `href="/assets/css/…"`
- Scripts: `src="/assets/js/…"`
- Internal links: `href="/pilot"`, `href="/"`

**Examples:**
```html
<!-- ✓ Correct -->
<link rel="stylesheet" href="/assets/css/site.css">
<script src="/assets/js/funnel.js"></script>
<a href="/pilot">Pilot</a>
<a href="/">Home</a>

<!-- ✗ Avoid – relative paths break when file location changes -->
<link rel="stylesheet" href="../../assets/css/site.css">
<a href="../other-funnel/">Other</a>
```

**Why:** Root-relative paths work the same from any page depth. They survive restructuring and work reliably regardless of deployment.

---

## Naming and Conventions

| Rule | Meaning |
|------|---------|
| **File names** | **MUST be in English.** Variables, functions, classes, file paths—all developer-facing identifiers use English. |
| **User-facing content** | May be Slovak (lang of site). URLs (e.g. `/rezervacia/`), labels, copy, meta—Slovak is fine. |
| **Dev language of code** | English. Comments, log messages, commit messages—English. |

---

## File Structure

```
project-root/
├── docs/
│   ├── PRACTICES.md                    # Project conventions (this file)
│   ├── API.md                          # API reference (current endpoints)
│   ├── IMPLEMENTATION-SNAPSHOT.md      # Code-first inventory (align other docs to this + code)
│   ├── IMPLEMENTATION-PLAN.md            # Backlog: not implemented / planned work
│   ├── DB-MIGRATIONS.md                # DB migrations, env vars, commands
│   ├── PSEUDOCHAT.md                   # PseudoChat widget (flows, API, integration)
│   ├── POST-PAYMENT-CLIENT-JOURNEY.md  # Post-payment / post-booking flow (planning, open questions)
│   ├── RESERVATION-SYSTEM-ARCHITECTURE.md  # Booking/reservation design
│   ├── SESSION-PRICING.md              # Session pricing model, payment options, UX
│   ├── STRIPE-ARCHITECTURE.md          # Stripe integration (Checkout, webhooks, API)
│   ├── EMAILING.md                     # Emailing (transactional, operator-assisted; planning, open questions)
│   ├── SCHEDULED-EMAILS-CRON.md        # Timed emails (personal, bulk), cron endpoint, newsletter, special messages
│   ├── CREATIVE-MEDIA.md               # FB ad vs funnel video folders, public `/assets/media/funnel/`
│   └── funnel/it-dev/                  # Life Autopilot Assessment — start at README.md / 016-…
├── creative/                           # FB ad assets & funnel masters (not all are web-served; see CREATIVE-MEDIA.md)
│   ├── facebook-ads/                   # Meta Ads exports, campaign folders
│   └── funnel/                         # Funnel video working / masters
├── src/
│   ├── app.js                          # Express app, EJS config
│   ├── config/                         # App config; funnelVideo.js — campaign video resolution (self / Wistia)
│   ├── db/                             # Migrations, repositories
│   ├── middleware/
│   ├── routes/
│   │   ├── api/                        # JSON /api/* (+ stripe webhook mounted separately in app.js)
│   │   ├── admin.js                    # /admin HTML (slots, reservations, billing)
│   │   ├── funnels.js                  # /{name} routes (e.g. /pilot)
│   │   ├── health.js                   # /health
│   │   ├── index.js                    # /
│   │   ├── legal.js                    # /ochrana-udajov, /obchodne-podmienky
│   │   └── static.js                   # sitemap, robots
│   └── views/
│       ├── admin/                      # operator UI (slots, reservations, billing, login)
│       ├── layouts/                    # default.ejs, admin.ejs
│       ├── partials/                   # header.ejs, footer.ejs, cookie-banner.ejs
│       ├── index.ejs                   # Home page
│       ├── ochrana-udajov.ejs
│       ├── obchodne-podmienky.ejs
│       └── funnels/                    # {name}.ejs instances; _funnel-content, _funnel-success, _funnel-cancel (generic)
├── public/assets/
│   ├── css/                            # site.css, funnel.css, pseudochat.css
│   ├── js/                             # funnel.js, booking.js, pseudochat/ (funnel-chatbot.js parked)
│   └── media/
│       └── funnel/                     # Funnel page video/audio used on site → `/assets/media/funnel/…`
├── scripts/                            # db-migrate.js
├── server.js                           # Entry point
```

- **`/`** – Home page (`views/pages/home.ejs`); booking + Stripe return on `/`, `/success`, `/cancel`
- **`/assets/`** – Static assets from `public/assets/`
- **`/{name}`** or **`/{name}-test`** – Funnel pages when `FUNNEL_*_MODE` is `prod` or `test` (see `docs/PAGE-VISIBILITY.md`)
- **`/ochrana-udajov`**, **`/obchodne-podmienky`** – Legal pages; in sitemap when home is prod
- **`/robots.txt`**, **`/sitemap.xml`** – Generated dynamically (`src/routes/static.js`)

New funnels: add `views/funnels/{name}.ejs`, add to `FUNNEL_PAGE_INSTANCES` in `src/config/funnelInstances.js`, campaigns in `src/routes/funnels.js`, set `FUNNEL_{NAME}_MODE` in env.

---

## EJS Templates

- Layout: `views/layouts/default.ejs` wraps all pages.
- Partials: `header.ejs`, `footer.ejs` in `views/partials/`.
- Pass `title`, `description`, `home`, `extraStyles`, `extraScripts` from routes.
- New funnels: create `views/funnels/{name}.ejs` (campaign block + `<%- include('_funnel-content') %>`), add to `FUNNEL_INSTANCES` and `INSTANCE_*` in `src/routes/funnels.js`. Success/cancel pages use generic templates with `backUrl` from route.

---

## HTML

- **Semantic elements:** Use `header`, `main`, `footer`, `section` as appropriate.
- **Language:** `lang="sk"` on `<html>`.
- **Viewport:** Keep `<meta name="viewport" content="width=device-width, initial-scale=1">` in `<head>`.

---

## CSS

- **Design tokens** – Colors and spacing live in `:root` in `site.css`. Use `var(--variable-name)` instead of hardcoding values.
- **Base styles** go in `site.css`.
- **Funnel-specific** layout/spacing goes in `funnel.css`.
- Use existing classes (`.container`, `.prose`, `.cta`, `.muted`) before adding new ones.

### Available variables

| Token | Purpose |
|-------|---------|
| `--color-text`, `--color-text-secondary`, `--color-text-muted` | Text colors |
| `--color-bg`, `--color-border` | Background, borders |
| `--color-primary`, `--color-primary-hover`, `--color-on-primary` | CTA / accents |
| `--spacing-sm`, `--spacing-md`, `--spacing-container`, `--spacing-gap`, `--spacing-section`, `--spacing-section-lg`, `--spacing-footer` | Spacing |
| `--max-width-content`, `--max-width-narrow` | Layout widths |
| `--radius-pill` | Pill-shaped buttons |

Add new tokens to `:root` when a value is reused; avoid hardcoding `#hex` or raw `px`/`rem` in new rules.

---

## JavaScript

- `funnel.js` exposes `window.funnel` (video, cta).
- **PseudoChat widget** – Decision-tree chat; see `docs/PSEUDOCHAT.md`. **Parked for remarketing**; lives in `pseudochat/` folder, not loaded on pilot.
- Keep logic in IIFE or modules; avoid global variables.
- Call `funnel.video.embed(url)` etc. from page-specific inline scripts when needed.

---

## When Editing

1. Keep links and asset paths root-relative.
2. Match existing patterns (header/footer structure, `.container` usage).
3. Add new funnel pages to `sitemap.xml`.
4. Use Slovak for user-facing content (copy, URLs, meta).
5. Use English for file names, code identifiers, comments.
