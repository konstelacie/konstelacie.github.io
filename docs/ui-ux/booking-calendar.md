# Booking Calendar — UI/UX Specification

**Scope:** Clean redesign for 1:1 session booking in the funnel. Not an iteration of the current UI.

---

## 1. UX reasoning

- Users want **soonest availability** and **a date that fits** — not a planner overview.
- A **weekly grid or month view** optimizes for scanning many days at once; the funnel optimizes for **one fast decision**.
- **Chronological day blocks** match mental order (“next usable day → pick a time”) and avoid “calendar app” affordances.
- **Text + state labels** reduce ambiguity; color alone is insufficient for accessibility and trust.

---

## 2. Constraints (product)

| Rule | Detail |
|------|--------|
| Slot times | 08:30, 10:00, 11:30, 13:00, 14:30 |
| Days | Weekdays only (Mon–Fri) |
| Lead time | First bookable slot ≥ **now + 24 hours** |
| Lock | Temporary hold **15 minutes** |
| Confirmed | Paid booking |

**Funnel cap:** Show at most **~7–10 future days** with at least one valid slot (see §8).

---

## 3. Layout

### 3.1 Core pattern

- **No** classic Mon–Fri weekly grid.
- **No** month calendar.
- Days as **sorted blocks**: nearest bookable day first, then forward in time.
- Each block lists **all valid slots** for that day as horizontal **buttons**.

### 3.2 Day block

Each block shows:

- **Full date** (Slovak), e.g. `Piatok 27. 3.`
- **Optional relative hint:** `zajtra`, `o 2 dni`, etc.

Example line:

`Piatok 27. 3. — zajtra`

### 3.3 Slots row

Fixed order (left → right): `08:30` · `10:00` · `11:30` · `13:00` · `14:30`

Only render buttons for slots that exist for that day **and** pass the 24h rule. Omit missing/invalid slots rather than showing disabled placeholders unless product explicitly requires five slots always visible.

---

## 4. State model

### 4.1 Backend

| State | Meaning |
|-------|---------|
| `FREE` | Available to book |
| `LOCKED_BY_OTHER` | Held by another user |
| `LOCKED_BY_ME` | Held by current user (session) |
| `CONFIRMED_BY_OTHER` | Paid by someone else |
| `CONFIRMED_BY_ME` | Paid by current user |

### 4.2 Frontend copy & behavior

| Backend | Label (SK) | Interactive |
|---------|------------|-------------|
| `FREE` | Voľné | Yes (primary action) |
| `LOCKED_BY_OTHER` | Práve rezervované | No (disabled) |
| `LOCKED_BY_ME` | Tvoj výber | Yes (highlighted; e.g. proceed / change flow) |
| `CONFIRMED_BY_OTHER` | Obsadené | No (disabled) |
| `CONFIRMED_BY_ME` | Tvoj termín | Yes (highlighted; e.g. details / reschedule policy link per product) |

**Loading / transitional (frontend-only, not a backend enum):**

| Phase | Label (SK) |
|-------|------------|
| After click, before API OK | Rezervujem... |
| On success (lock acquired) | Tvoj výber |

After **payment**, map `CONFIRMED_BY_ME` → **Tvoj termín**.

---

## 5. Interaction flow

1. User taps a **Voľné** slot.
2. **Immediately** set that control to **Rezervujem...** (disable double-submit).
3. **Success:** slot → **Tvoj výber**; other slots on the same day (and globally, per rules) update per latest poll/API state.
4. **Failure:** revert to **Voľné** and show a short, actionable error (copy TBD).
5. **After payment:** **Tvoj termín** for the paid slot.

No success animations that draw attention away from the CTA; no flashing states.

---

## 6. Real-time updates (MVP)

- **Polling every 5 seconds** while the booking widget is visible (and optionally stop when tab hidden — implementation detail).
- Each tick: **refresh all visible slots** for loaded days.
- Apply mapping in §4.2 from fresh data.

**When poll changes a slot:**

- Was free → locked by other → **Práve rezervované**
- Was locked by other → free → **Voľné**
- Becomes confirmed (other) → **Obsadené**

Do **not** animate transitions or pulse rows; text updates only.

---

## 7. 24h rule

- **Never** show a slot that starts earlier than now + 24 hours.
- If a calendar day has **no** qualifying slots after this filter, **hide the entire day block** (do not show an empty day).

---

## 8. Funnel optimization — “nearest slot” hero

At the **top** of the component (above day blocks):

1. **Najbližší voľný termín:**  
   One line with date + time, e.g. **`Piatok 27. 3. o 10:00`**
2. Primary button: **`Rezervovať tento termín`** — selects that slot (same flow as tapping the slot in the list: lock → Tvoj výber → payment).

Below: full **chronological day list** as in §3.

If there is no free slot at all, show empty/error state (copy TBD) instead of the hero.

---

## 9. Mobile behavior

- Day blocks **stack vertically** (single column).
- Slot buttons: **large touch targets** (thumb-friendly); adequate spacing.
- Slots **wrap** to multiple rows **or** sit in a **single horizontal scroll** row per day — pick one in implementation; avoid tiny hit areas.
- Hero block and primary CTA remain **above the fold** when possible on common phone heights.

---

## 10. Visual style

- Minimal chrome; funnel-first, not Outlook-style.
- **Clickable** slots: clear contrast vs background.
- **Disabled** slots: visibly non-interactive (muted + no pointer).
- Prefer **neutral, calm** palette; avoid heavy red for non-errors.
- **Never** rely on color alone — every state has explicit text (§4.2).

---

## 11. What to avoid

- Classic weekly / monthly calendar grids.
- Tiny clickable areas.
- State communicated only by color.
- Dense secondary information in the picker step.
- Listing more than ~7–10 future days in the funnel view.

---

## 12. Example structures (pseudo HTML)

### 12.1 Hero + days

```html
<section class="booking-calendar" aria-label="Rezervácia termínu">
  <div class="booking-calendar__hero">
    <p class="booking-calendar__hero-label">Najbližší voľný termín:</p>
    <p class="booking-calendar__hero-datetime">
      <strong>Piatok 27. 3. o 10:00</strong>
    </p>
    <button type="button" class="booking-calendar__hero-cta">
      Rezervovať tento termín
    </button>
  </div>

  <div class="booking-calendar__days">
    <!-- day blocks -->
  </div>
</section>
```

### 12.2 Day block + slots

```html
<article class="booking-day" data-date="2025-03-27">
  <header class="booking-day__header">
    <span class="booking-day__title">Piatok 27. 3.</span>
    <span class="booking-day__hint">zajtra</span>
  </header>
  <div class="booking-day__slots" role="group" aria-label="Časy pre piatok 27. 3.">
    <button type="button" class="booking-slot" data-state="free">Voľné</button>
    <button type="button" class="booking-slot" data-state="locked-other" disabled>
      Práve rezervované
    </button>
    <!-- ... -->
  </div>
</article>
```

### 12.3 Transitional state (same button)

```html
<button type="button" class="booking-slot" data-state="pending" disabled aria-busy="true">
  Rezervujem...
</button>
```

---

## 13. Implementation checklist (for dev)

- [ ] Filter slots by 24h rule server-side or client-side consistently with API.
- [ ] Hide days with zero visible slots.
- [ ] Map all five backend states + pending UI state to labels in §4.2.
- [ ] Poll 5s; full refresh of visible slots; no flashy UI.
- [ ] Hero “nearest” uses same slot entity as list + CTA.
- [ ] Mobile: large targets; wrap or horizontal scroll per decision.
