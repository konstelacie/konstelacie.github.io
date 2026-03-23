# Remarketing segments — Cítim, teda som funnel

Practical definition of behavior-based remarketing segments for the **Cítim, teda som** funnel: FB/IG ad → landing page with video → reservation → email → payment (€10).

**Main lead:** user who completed payment (purchase).  
**Key drop-off:** users who started reservation but did not pay.  
**Entry / engagement:** landing video is the primary engagement driver.  
**Support content:** “How the session works” video is for hesitant mid-funnel users, not cold traffic.

---

## 1. Segmentation principles

**Why behavior-based segmentation matters**

Remarketing budget and creative should follow what people *did*, not what page they saw once. In this funnel, one visit can mean curiosity; a played video means interest; a submitted slot and email means commitment; payment means conversion. Treating all of these as one “website visitors” pool blurs signal and wastes spend on people who never engaged with the core offer.

**Why we separate by intent (not just visits)**

Visits alone do not distinguish “bounced after 3 seconds” from “watched most of the video and almost booked.” Intent rises with each step: passive view → active engagement → reservation → payment. Messaging that fits a high-intent user (address payment friction, slot urgency) can feel pushy or irrelevant to a low-intent user; messaging that fits a warm but not-yet-committed user (insight, gentle CTA) under-delivers for someone who already chose a time.

**Why mixing segments hurts performance**

- **Creative mismatch:** one ad set cannot simultaneously reassure “almost paid” users and re-engage “only watched video” users without diluting both.
- **Frequency and fatigue:** high-intent users may need more reminders; low-intent users need fewer, lighter touches. A single mixed audience averages these needs and often over-communicates to the wrong group.
- **Measurement:** you cannot tell whether recovery messaging works if “expired reservation” and “never started” are in the same bucket.

---

## 2. Core segments

### 2.1 `video_engaged`

Users who **played** the landing funnel video (optionally thresholded by seconds watched, e.g. minimum watch time — see open questions).

| Attribute | Value |
|-----------|--------|
| **Intent level** | Low–medium |
| **Role** | Warm audience — past the first impression, not yet in the booking flow |

Use for: nurturing interest, light CTAs toward reservation, **not** heavy payment or “you left a slot” messaging.

---

### 2.2 `reservation_started`

Users who **selected a time slot and submitted email** (entered the reservation flow with a concrete commitment).

| Attribute | Value |
|-----------|--------|
| **Intent level** | High |
| **Role** | Strong remarketing target — clear booking intent |

Use for: moving from “interested” to “paid,” with messaging that respects they already took a step.

---

### 2.3 `reservation_started_no_purchase`

Users who **started reservation** (slot + email path) but **did not complete payment** (€10).

| Attribute | Value |
|-----------|--------|
| **Intent level** | Very high |
| **Role** | **Primary remarketing segment** — largest justified recovery focus |

This is the **key drop-off** for this funnel: they signaled intent but stopped before revenue.

---

### 2.4 `reservation_expired`

Users whose **reservation timed out** without payment (slot held, then released or invalidated).

| Attribute | Value |
|-----------|--------|
| **Intent level** | Very high, with **friction** (time pressure, uncertainty, or distraction) |
| **Role** | Recovery segment — same core problem as `reservation_started_no_purchase`, with an explicit “time ran out” narrative |

Often overlaps with `reservation_started_no_purchase` in behavior; treat as a **sub-focus** or **overlap** depending on how you define events (see open questions).

---

### 2.5 `purchase`

Users who **completed payment** (€10).

| Attribute | Value |
|-----------|--------|
| **Intent level** | Completed (conversion) |
| **Role** | **Exclude from acquisition** remarketing; use for onboarding, trust, and session preparation |

---

## 3. Intent hierarchy

Funnel progression (conceptual):

**`view_content` → `video_engaged` → `reservation_started` → `purchase`**

- **`view_content`:** landed on the page; intent unknown or low.
- **`video_engaged`:** engaged with the main story; intent moves from low to medium.
- **`reservation_started`:** chose a slot and identified themselves; intent is high.
- **`purchase`:** paid; funnel goal achieved.

**Where users drop off**

The **critical gap** is between **`reservation_started`** and **`purchase`**: payment is the revenue step; email and slot choice without payment is the main leak.

**Why later-stage users are more valuable**

Each step filters for people who are willing to invest time and identity. Someone who submitted a slot and email is **closer to €10** than someone who only pressed play. Remarketing ROI is typically higher when the audience already demonstrated booking behavior.

**Why budget should prioritize high-intent segments**

Spend and messaging depth should go first to **`reservation_started_no_purchase`** and **`reservation_expired`**: they are the smallest reachable groups with the strongest signal. **`video_engaged`** supports scale and pipeline but should not cannibalize budget meant for people who already started booking.

---

## 4. Messaging strategy by segment

Describes **type** of message (not exact copy).

### `video_engaged`

- **Reinforce insight** — align with the emotional/insight frame of the funnel video.
- **Encourage action** — clear, low-pressure next step toward reservation.
- **Keep it light** — avoid “you abandoned checkout” tone; they may not have opened the flow at all.

### `reservation_started_no_purchase`

- **Reduce friction** — payment steps, trust, clarity on what happens next.
- **Address hesitation** — normalize doubt without being defensive.
- **Introduce support content** — e.g. “how session works” video as **optional** reassurance, not the main hook.

### `reservation_expired`

- **Acknowledge delay** — slot/time pressure is real; don’t pretend it didn’t happen.
- **Normalize hesitation** — reduce shame or urgency that feels punitive.
- **Give a clear next step** — pick a new time, or resume payment if the product allows.

### `purchase`

- **Onboarding** — what to expect before the session.
- **Trust reinforcement** — professionalism, boundaries, what to bring.
- **Preparation for session** — practical and emotional readiness.

---

## 5. Use of “How session works” video

**Not for top-of-funnel**

The “How the session works” piece answers **process and uncertainty** (“What will happen?”, “Is this safe / structured?”). Cold audiences from FB/IG should see the **main funnel video** first; the support clip is **not** a replacement for the primary story and should not be the first thing we optimize for in broad remarketing.

**Best used for**

- **`reservation_started_no_purchase`** — user is committed enough to book but stopped before paying; process clarity can remove the last doubt.
- **`reservation_expired`** — same need, plus reassurance after a dropped slot.

**Purpose**

- Reduce **uncertainty**, not generate initial desire.
- Answer **“what will happen?”** in concrete terms.
- Remove the **last barrier to payment** for people who already want the session but hesitate on the details.

---

## 6. Recommended MVP segments

Minimal segments to start with:

| Segment | Role |
|---------|------|
| `video_engaged` | Warm pool, insight + CTA; scales reach |
| `reservation_started_no_purchase` | Primary recovery; highest intent among non-buyers |
| `purchase` | **Exclusion** from acquisition campaigns; separate onboarding |

**Why this is enough**

- **`reservation_started_no_purchase`** captures the **main revenue leak** and justifies focused creative and budget.
- **`video_engaged`** captures **meaningful engagement** without requiring full reservation plumbing in every tool on day one.
- **`purchase` exclusion** prevents paying to re-acquire people who already converted and keeps reporting clean.

**Deferred for later** (still useful): `reservation_expired` as a distinct narrative, `reservation_started` as a broader bucket before you split paid vs unpaid.

---

## 7. Open questions / future optimization

- **Threshold for `video_engaged`:** play event only vs minimum seconds (e.g. 10s) vs percentage watched — balance signal quality vs audience size.
- **When a reservation becomes `reservation_expired`:** exact timeout duration and whether “expired” is a separate event or inferred from `reservation_started_no_purchase` + time.
- **Overlap:** should `reservation_expired` be a strict subset of `reservation_started_no_purchase`, or mutually exclusive by definition?
- **Multiple funnels / topics:** if the same pixel or list serves several funnels, whether to **split by funnel or topic** to avoid cross-messaging.
- **Frequency caps and sequencing:** how many touches per week per segment; order (e.g. friction-reduction before support video).
- **Holdout / control:** small share without remarketing to estimate incremental lift.

---

*Document scope: strategy and naming only — no platform setup (Meta, GA4, etc.) and no implementation.*
