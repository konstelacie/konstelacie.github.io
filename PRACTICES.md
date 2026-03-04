# Project Practices

**For AI assistants (Cursor, Copilot, etc.):** Follow these rules when editing this codebase. Apply them consistently.

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

**Why:** Root-relative paths work the same from any page depth. They survive restructuring and work reliably on GitHub Pages.

---

## File Structure

- **`/`** – Main site (`index.html`)
- **`/assets/css/`** – Styles (`site.css` = base, `funnel.css` = funnel blocks)
- **`/assets/js/`** – Scripts (`funnel.js` = shared funnel logic)
- **`/funnels/{name}/`** – Each funnel has `index.html` at `funnels/{name}/`

New funnels: add `funnels/{name}/index.html` and update `sitemap.xml`.

---

## HTML

- **Semantic elements:** Use `header`, `main`, `footer`, `section` as appropriate.
- **Language:** `lang="sk"` on `<html>`.
- **Viewport:** Keep `<meta name="viewport" content="width=device-width, initial-scale=1">` in `<head>`.

---

## CSS

- **Base styles** go in `site.css`.
- **Funnel-specific** layout/spacing goes in `funnel.css`.
- Use existing classes (`.container`, `.prose`, `.cta`, `.muted`) before adding new ones.

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
