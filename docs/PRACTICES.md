# Project Practices

**For AI assistants (Cursor, Copilot, etc.):** Follow these rules when editing this codebase. Apply them consistently.

**Deployment:** We deploy on alwaysdata (not GitHub Pages).

---

## Links and Asset Paths

### Use root-relative URLs

**Always** use root-relative paths (starting with `/`) for:

- Stylesheets: `href="/assets/css/…"`
- Scripts: `src="/assets/js/…"`
- Internal links: `href="/funnels/pilot/"`, `href="/"`

**Examples:**
```html
<!-- ✓ Correct -->
<link rel="stylesheet" href="/assets/css/site.css">
<script src="/assets/js/funnel.js"></script>
<a href="/funnels/pilot/">Pilot</a>
<a href="/">Home</a>

<!-- ✗ Avoid – relative paths break when file location changes -->
<link rel="stylesheet" href="../../assets/css/site.css">
<a href="../other-funnel/">Other</a>
```

**Why:** Root-relative paths work the same from any page depth. They survive restructuring and work reliably regardless of deployment.

---

## File Structure

```
project-root/
├── docs/
│   └── PRACTICES.md        # Project conventions (this file)
├── src/
│   ├── app.js              # Express app, EJS config
│   ├── views/              # EJS templates
│   │   ├── layouts/        # default.ejs
│   │   ├── partials/       # header.ejs, footer.ejs
│   │   ├── index.ejs       # Home page
│   │   └── funnels/        # views/funnels/{name}.ejs
│   └── routes/
├── public/assets/          # Static files (served at /assets/...)
│   ├── css/                # site.css, funnel.css
│   └── js/                 # funnel.js
├── server.js               # Entry point
├── sitemap.xml
└── robots.txt
```

- **`/`** – Home page (rendered from `views/index.ejs`)
- **`/assets/`** – Static assets from `public/assets/` (CSS, JS)
- **`/funnels/{name}/`** – Funnel pages (rendered from `views/funnels/{name}.ejs`)

New funnels: add `src/views/funnels/{name}.ejs`, add route in `src/routes/funnels.js`, update `sitemap.xml`.

---

## EJS Templates

- Layout: `views/layouts/default.ejs` wraps all pages.
- Partials: `header.ejs`, `footer.ejs` in `views/partials/`.
- Pass `title`, `description`, `home`, `extraStyles`, `extraScripts` from routes.
- New funnels: create `views/funnels/{name}.ejs` and register in `src/routes/funnels.js`.

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

- `funnel.js` exposes `window.funnel` (video, chatbot, cta).
- Keep logic in IIFE or modules; avoid global variables.
- Call `funnel.video.embed(url)` etc. from page-specific inline scripts when needed.

---

## When Editing

1. Keep links and asset paths root-relative.
2. Match existing patterns (header/footer structure, `.container` usage).
3. Add new funnel pages to `sitemap.xml`.
4. Use Slovak (`sk`) for user-facing content.
