# Conversion events & lead model — Cítim, teda som funnel

**Status:** proposal / decision draft (not implementation spec)  
**Scope:** FB/IG ad → dedicated landing page (with optional supporting video) → time slot selection → email → reservation → **€10 reservation fee** payment.

This document defines what counts as a lead, which events to track, how to classify them, and how they support analytics, remarketing, and future ad optimization for this funnel only.

---

## 1. Lead definition

### Primary lead (business truth)

A **lead** is a user who **completed payment** of the **€10 reservation fee** for a session slot.

**Why payment is the lead**

- Until payment succeeds, we have no confirmed commercial commitment; the slot can remain uncommitted or be released.
- The €10 fee is the first **irreversible business outcome** tied to this funnel: revenue, fulfillment obligation, and a defensible “converted user” for cohort and LTV work later.
- It aligns reporting with **cash and operations** (who actually booked), not with intent-only steps.

### What is *not* the main lead

**Email capture and “reservation started”** (slot selected + email submitted, before payment) are **strong funnel steps** but **not** the primary lead definition.

**Why**

- Email submission and reservation start do not guarantee payment; users can abandon at checkout, hit errors, or delay past the reservation window.
- Treating email as the main lead would **inflate** conversion metrics vs. real bookings and **misalign** ad optimization with business outcomes.
- These steps remain **critical for segmentation and remarketing** (see §3), but they must not replace **purchase** as the KPI anchor.

**Supporting distinction**

| Concept              | Role                                      |
|---------------------|--------------------------------------------|
| Payment completed   | **Lead** (primary KPI)                     |
| Reservation + email | Pre-lead / pipeline (remarketing-critical) |

---

## 2. Event definitions

**Naming:** `snake_case` event names everywhere below.

**Classification legend**

| Tag                    | Meaning                                              |
|------------------------|------------------------------------------------------|
| `primary_kpi`          | Maps to main business outcome (lead / purchase)    |
| `secondary_signal`     | UX / engagement; useful for quality and debugging  |
| `remarketing_signal`   | Used to build audiences and recovery campaigns     |

Each event: **name** → **when it fires** → **why it matters** → **classification**.

### `view_content`

- **When:** User loads the main landing page (dedicated LP for this campaign).
- **Why:** Baseline for funnel volume, drop-off math, and creative/entry comparison (which ad or variant drove visits).
- **Classification:** `secondary_signal` (foundational for analytics; not the business outcome).

### `video_play`

- **When:** User initiates playback of the “how the session works” video (wherever it is surfaced — not on the core LP path).
- **Why:** Indicates interest in reassurance/detail; supports content decisions and optional paths for users who need more context.
- **Classification:** `secondary_signal`.

### `video_watch_10s`

- **When:** User reaches **10 seconds** of cumulative watch time on that video (single session; reset rules can be decided at implementation time).
- **Why:** Lightweight engagement bar above accidental clicks; helps separate “glanced” vs. “actually watched.”
- **Classification:** `secondary_signal`.

### `reservation_started`

- **When:** User has selected a time slot **and** submitted an email (or equivalent identifier) such that a **timed reservation** exists and checkout can proceed — i.e. the step that starts the payment window, **before** successful payment.
- **Why:** Marks **high intent** and the start of the payment countdown; essential for **abandonment** and **expiry** analysis.
- **Classification:** `remarketing_signal` (also a key input to `primary_kpi` funnel math as a mid-funnel step).

### `purchase`

- **When:** **Reservation fee (€10) payment succeeds** (reservation confirmed in business terms).
- **Why:** This is the **lead** and the **primary conversion** for this funnel; use for ROAS, conversion rate from LP, and cohort reporting.
- **Classification:** `primary_kpi`.

### `reservation_expired`

- **When:** A started reservation **was not paid** within the allowed time limit; the hold is released (or equivalent business rule fires).
- **Why:** Defines users who showed **strong intent** but did **not** convert to lead; core audience for **high-value remarketing** and messaging about urgency, friction, or trust.
- **Classification:** `remarketing_signal` (business-critical for recovery, not a “happy path” KPI).

### Optional but useful (same schema)

| Event                 | When | Why | Classification |
|-----------------------|------|-----|----------------|
| `initiate_checkout`   | User lands on payment step / checkout UI | Pinpoints drop-off between intent and payment | `secondary_signal` |
| `payment_failed`      | Payment attempt returns failure | Diagnose friction vs. expiry | `secondary_signal` |

---

## 3. Key remarketing segment

### Audience: high intent, no lead

**Definition (conceptual):**

- Users with `reservation_started` **and** **no** `purchase` for that reservation attempt, **including** those who match `reservation_expired`.

**Two useful slices**

1. **`reservation_started` without `purchase` (any outcome)**  
   Broad pool: started checkout path but never paid (includes expiry, cancel, and in-progress).

2. **`reservation_expired` without `purchase`**  
   Narrower, time-bounded: explicitly **ran out of time** — strongest signal of **intent + urgency failure** (life got in the way, confusion, payment issues).

### Why this is high-value

- These users already **chose a slot** and **identified themselves** — stronger than cold traffic or casual LP visits.
- They are **not** random leads; they are **near-miss** conversions, ideal for:
  - **Remarketing** ads with clear next step (complete payment, new slot).
  - **Email** or on-site prompts if we have permission and tooling.
  - **Future ad optimization** by training or biasing systems toward users who reach `reservation_started` (while still optimizing to `purchase` where possible).

### Video placement note

The “how the session works” video is **out of the main LP flow**. For this segment, it can be used as **supporting creative** (e.g. “still deciding?”) rather than as a gate on the primary path.

---

## 4. Recommended MVP event set

Minimal set to **launch** tracking and support **analytics + remarketing** for this funnel:

| Event                 | Purpose |
|-----------------------|---------|
| `view_content`        | Traffic and funnel denominator |
| `reservation_started` | Mid-funnel intent; expiry pipeline |
| `purchase`            | **Lead** / primary KPI |
| `reservation_expired` | **High-intent remarketing** segment |

**Add immediately after MVP if video is live anywhere**

| Event               | Purpose        |
|---------------------|----------------|
| `video_play`        | Optional path usage |
| `video_watch_10s` | Engagement quality |

---

## 5. Open questions / future decisions

- **Reservation timer length:** Exact window affects how quickly `reservation_expired` fires and how aggressive recovery messaging can be.
- **Identity stitching:** How we link anonymous LP visits to `reservation_started` / `purchase` when users switch devices (impacts audience sizes, not the event definitions above).
- **`reservation_started` edge cases:** e.g. duplicate submissions, slot changes, server-side expiry vs. client-visible state — rules for “one funnel attempt” vs. multiple.
- **Payment retries:** Whether failed attempts roll into one `purchase` or need separate failure events for product analytics.
- **Cross-funnel deduplication:** If the same person hits other entry points later, how we attribute **first** vs. **last** touch for this campaign without double-counting leads.
- **Creative tests:** Which supporting assets (including the optional video) merit permanent events vs. one-off campaign parameters.

---

## Summary

| Layer | Role |
|-------|------|
| **Business events** | `purchase` = lead; `reservation_expired` = critical non-lead business signal for recovery |
| **UX / engagement** | `view_content`, `video_play`, `video_watch_10s` — quality and debugging, not the main KPI |
| **Remarketing segments** | `reservation_started` without `purchase`; especially `reservation_expired` — high-intent, near-miss audiences |

This keeps **reporting** honest on **paid bookings**, **optimization** focused on **payment completion**, and **remarketing** focused on users who already **committed to a slot** but did not **pay the €10 fee** in time.
