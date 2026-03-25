# Booking calendar — UI spec (density)

The full product and interaction specification lives in [booking-calendar.md](../ui-ux/booking-calendar.md) (`docs/ui-ux/`). This document adds **layout density** rules for the funnel booking picker.

---

## Density Optimization (v2)

### Goals

- Fit **nearest-slot** row plus **at least 2–3 days of slots** in one viewport without scrolling the calendar block alone.
- **Prioritize vertical density** over decorative spacing; keep labels and state text readable.
- **No changes** to data loading, slot state model, or interaction logic—only markup structure for the hero row and CSS.

### Nearest slot (“hero”) — superseded by v4

The original v2 spec used a separate **Rezervovať** CTA next to the datetime. That pattern is **replaced** by [Nearest Slot as Primary CTA (v4)](#nearest-slot-as-primary-cta-v4): the nearest slot is a **standard slot button** (same component and behavior as the grid below).

---

## Nearest Slot as Primary CTA (v4)

### Intent

- **One interaction model:** a slot control is the action; there is no separate primary CTA button for “nearest”.
- **Consistency:** the nearest bookable slot uses the same markup, classes, and click path as slots in the day list (`booking-slot`, `data-slot-id`, `mapSlotUi` states).
- **Layout:** label line **Najbližší voľný termín:** then a **single slot button** (same structure as the day grid). **Copy and line layout** for free slots are defined in [Visual Refinement (v5)](#visual-refinement-v5) (time-first; no **Voľné** label).

### Markup

- `div#booking-calendar-hero.booking-calendar__hero` (optional visibility)
  - `p.booking-calendar__hero-label` — static copy **Najbližší voľný termín:**
  - `div#booking-hero-slot-host.booking-calendar__hero-slot-host` — container; JS injects one `button.booking-slot.booking-slot--nearest` (plus state classes from the shared builder).

### Styling

- Same base slot styles as the day grid (see `public/assets/css/site.css` + funnel overrides).
- Optional emphasis: modifier **`booking-slot--nearest`** — subtle border/shadow in `funnel.css` so the row reads as the highlighted first choice without a second button.

### Behavior

- Clicking the nearest slot runs the same **`lockSlot`** flow as any other slot (delegated from `#booking-calendar-inner`).
- Hidden while a slot is pending (`pendingSlotId`) or when there is no eligible first-free slot.

### Implementation reference

- Logic: `public/assets/js/booking.js` — `buildSlotButtonHtml`, `renderCalendar`, delegated click on `#booking-calendar-inner`.
- Styles: `public/assets/css/funnel.css` — `.booking-calendar__hero*`, `.booking-slot--nearest`.
- Markup: `src/views/funnels/_funnel-content.ejs`.

---

## Day list & slot density (v2)

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

---

## Visual Refinement (v5)

### Goals

- **One slot pattern:** the nearest (“hero”) slot uses the **same** `buildSlotButtonHtml` output and classes as grid slots—no wide input-like strip, no separate “hero” markup beyond `booking-slot--nearest`.
- **Less noise:** free slots show **time only** on the primary line; drop redundant **Voľné** copy.
- **Clear affordance:** interactive slots read as **buttons** (border/fill, hover, `cursor: pointer`, `:focus-visible`).

### Content rules

| State / role | Primary line (`booking-slot__time`) | Second line (`booking-slot__label` or `booking-slot__label--meta`) |
|--------------|--------------------------------------|----------------------------------------------------------------------|
| **FREE** (clickable) | Time only, e.g. `08:30` | *(none)* |
| **FREE** (disabled, e.g. another slot held) | Time only | *(none)* |
| **LOCKED** (other user’s hold) | Time | **Práve rezervované** |
| **LOCKED** (my hold / selected) | Time | **Tvoj výber** — button uses **primary** highlight (`booking-slot--locked-me`) |
| **Pending** | Time | **Rezervujem...** |
| **Missing / closed** | Placeholder time or copy from builder | Short state (e.g. Nedostupné / Obsadené) as needed |

### Nearest slot (hero)

- **Same component** as grid slots: `button.booking-slot` + `booking-slot--nearest` when it is the first free slot.
- **Primary line:** time only (`timeKey`), matching the grid.
- **Second line:** **date context** for the funnel only — `booking-slot__label--meta` with weekday + date (e.g. `štvrtok 26. 3.`), not mixed into the time line. Section label **Najbližší voľný termín:** supplies intent; the button mirrors the grid (time bold, date muted).
- **Emphasis:** `booking-slot--nearest` — slightly larger padding / type than grid slots, primary-tinted border/background/shadow so it reads as the first actionable choice **without** a full-width field look.

### Interaction (unchanged)

- No changes to lock/poll/click delegation; only labels, optional second line, and CSS.

### Styling notes

- **Typography:** time is **bold** (`booking-slot__time`); state/meta lines are **smaller, secondary/muted** (`booking-slot__label`, `booking-slot__label--meta`).
- **Clickable free slots:** `booking-slot--primary` — primary border, light fill, primary-colored time; hover/focus from shared `.booking-slot` rules.
- **Implementation:** `public/assets/js/booking.js` (`mapSlotUi`, `buildSlotButtonHtml`, `renderCalendar`), `public/assets/css/funnel.css`, `public/assets/css/site.css` (base slot + `:focus-visible`).
