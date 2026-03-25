# Booking calendar — UI spec (density)

The full product and interaction specification lives in [booking-calendar.md](../ui-ux/booking-calendar.md) (`docs/ui-ux/`). This document adds **layout density** rules for the funnel booking picker.

---

## Density Optimization (v2)

### Goals

- Fit **nearest-slot CTA** plus **at least 2–3 days of slots** in one viewport without scrolling the calendar block alone.
- **Prioritize vertical density** over decorative spacing; keep labels and state text readable.
- **No changes** to data loading, slot state model, or interaction logic—only markup structure for the hero row and CSS.

### Nearest slot (“hero”) — inline row

- **Before:** Stacked card: label, datetime line, full-width primary button with padding and border.
- **After:** Single **horizontal flow** (wraps on narrow screens):

  `Najbližší voľný termín:` + **datetime** (from JS, e.g. weekday + date + time) + **`Rezervovať`** button.

- **Markup:** `booking-calendar__hero` contains `booking-calendar__hero-row` with:
  - `span.booking-calendar__hero-label`
  - `span#booking-hero-datetime.booking-calendar__hero-datetime`
  - `button#booking-hero-cta.booking-calendar__hero-cta`
- **Chrome:** No card border, no filled background, **minimal vertical padding** on the hero container.

### Day blocks — list, not cards

- Days are **stacked sections**: compact **day label** (title + optional relative hint) with **slot buttons directly below**.
- **No** extra card framing around each day; spacing comes from **small gap** between day blocks, not large section gaps.

### Slot buttons

- **Smaller padding** and slightly **reduced type scale** while keeping **time + state label** on two lines.
- **Tighter gap** between buttons in the wrap row.
- Targets remain **clickable** (minimum height ~44px / `2.75rem` with tight padding; density-oriented, not micro-taps).

### Overall calendar block

- Outer `booking-calendar` margins are **tight** relative to section defaults.
- Inner `booking-calendar__inner` top margin is **small** so hero + first days start high in the block.
- Visual goal: the component reads as a **compact list**, not a spaced “card stack.”

### Implementation reference

- Styles: `public/assets/css/funnel.css` (`.booking-calendar*` / `.booking-day*` / `.booking-slot*`).
- Hero markup: `src/views/funnels/_funnel-content.ejs`.
