# Project Practices

**For AI assistants (Cursor, Copilot, etc.):** Follow these rules when editing this codebase. Apply them consistently.

**Deployment:** We deploy on alwaysdata (not GitHub Pages).

**Phase:** We are in **early dev phase**—not live yet. Testing and release flows are in `docs/STRIPE-ARCHITECTURE.md` (Section 10).

---

## Dev Phase: Data & Schema

**We are in early dev phase.** We are not live yet. There is no legacy data to protect.

| Rule | Meaning |
|------|---------|
| **Hard refactors** | Do dev refactors without legacy support. No backward compatibility for old data structures. |
| **Schema changes** | Use **drop/create** (drop table, create table). No `ALTER TABLE` or migration scripts. |
| **Data changes** | Use **delete/insert** (delete rows, insert new). Avoid `UPDATE` for structural changes. |
| **Migration file** | Always edit `src/db/migrations/001_initial.sql` when the schema changes. Do not add new migration files—we always recreate the database while not live; git tracks history. |

When we go live, we will introduce proper migrations and ALTER/UPDATE flows. Until then, keep schema and data changes simple and destructive.

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
│   ├── DB-MIGRATIONS.md                # DB migrations, env vars, commands
│   ├── PSEUDOCHAT.md                   # PseudoChat widget (flows, API, integration)
│   ├── POST-PAYMENT-CLIENT-JOURNEY.md  # Post-payment / post-booking flow (planning, open questions)
│   ├── RESERVATION-SYSTEM-ARCHITECTURE.md  # Booking/reservation design
│   ├── SESSION-PRICING.md              # Session pricing model, payment options, UX
│   ├── STRIPE-ARCHITECTURE.md          # Stripe integration (Checkout, webhooks, API)
│   ├── EMAILING.md                     # Emailing (transactional, operator-assisted; planning, open questions)
│   └── SCHEDULED-EMAILS-CRON.md        # Timed emails (personal, bulk), cron endpoint, newsletter, special messages
├── src/
│   ├── app.js                          # Express app, EJS config
│   ├── config/                         # App config (database, etc.)
│   ├── db/                             # Migrations, repositories
│   ├── middleware/
│   ├── routes/
│   │   ├── api/                        # /api/slots, /api/reservations
│   │   ├── booking.js                  # Embedded in pilot funnel
│   │   ├── funnels.js                  # /{name} routes (e.g. /pilot)
│   │   ├── health.js                   # /health
│   │   ├── index.js                    # /
│   │   └── static.js                   # sitemap, robots
│   └── views/
│       ├── layouts/                    # default.ejs
│       ├── partials/                   # header.ejs, footer.ejs
│       ├── index.ejs                   # Home page
│       └── funnels/                    # {name}.ejs instances, _funnel-content.ejs (generic)
├── public/assets/
│   ├── css/                            # site.css, funnel.css, pseudochat.css
│   └── js/                             # funnel.js, booking.js, pseudochat/ (funnel-chatbot.js parked)
├── scripts/                            # db-migrate.js
├── server.js                           # Entry point
├── sitemap.xml
└── robots.txt
```

- **`/`** – Home page (`views/index.ejs`)
- **`/assets/`** – Static assets from `public/assets/`
- **`/{name}`** – Funnel pages (`views/funnels/{name}.ejs`), e.g. `/pilot`
- **Booking** – Embedded in pilot funnel; CTA "Rezervovať sedenie" reveals form inline (`public/assets/js/booking.js`). Flow: slot → email → payment choice → payment → confirmation (see `docs/RESERVATION-SYSTEM-ARCHITECTURE.md`).

New funnels: add `views/funnels/{name}.ejs`, register in `routes/funnels.js`, update `sitemap.xml`.

---

## EJS Templates

- Layout: `views/layouts/default.ejs` wraps all pages.
- Partials: `header.ejs`, `footer.ejs` in `views/partials/`.
- Pass `title`, `description`, `home`, `extraStyles`, `extraScripts` from routes.
- New funnels: create `views/funnels/{name}.ejs` (campaign block + `<%- include('_funnel-content') %>`), register in `src/routes/funnels.js`.

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
