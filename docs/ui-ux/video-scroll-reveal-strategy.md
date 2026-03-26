# Video scroll reveal strategy (funnel landing)

## 1. Title and purpose

This document defines the **final UX strategy** for gradually revealing continuation below the hero video on funnel landing pages: a narrow hero, one vertical video, additional funnel content below the fold, a booking section in the same narrow conversion column, and a secondary branch (“Ešte nie som rozhodnutý”) later in the flow.

**Purpose:** balance **user autonomy** with **funnel progression** by separating (a) when content becomes structurally available, (b) when we show a subtle navigation hint, and (c) when we apply a gentle attention cue—without aggressive mechanics, auto-scroll, or sudden layout jumps.

The strategy is written to be **implementation-friendly**: engineers can map layers to DOM, CSS, and timers; product can tune config per campaign/video.

---

## 2. Problem statement

**The UX problem**

- Post-video content lives **below the fold**. Users may finish watching (or watch for a long time) without realizing there is a clear continuation.
- We must avoid two extremes:
  - **Too early:** unlocking or emphasizing everything while the video still carries the main message weakens the video and feels noisy.
  - **Too late:** waiting until the user gives up or leaves loses momentum and conversion opportunity.
- The solution must work for **multi-minute videos**, not only short clips—timing tied only to “a few seconds after load” is often wrong.

**Design constraints (non-negotiable)**

- No aggressive behavior.
- No **automatic scroll** of the page.
- No **sudden layout jumps** (content should appear in a controlled way; reserved space or opacity/transform beats reflow surprises).
- The user should feel **guided**, not **pushed**.

**Conceptual separation**

The reveal logic must distinguish:

1. **Content availability** — additional markup/layout exists so scrolling is possible; user may still see only the video viewport.
2. **Subtle hint** — e.g. a **down arrow** (navigation cue, not a primary CTA).
3. **Stronger but still gentle cue** — light animation, highlight, optional short helper copy (e.g. “Pokračovať”).

---

## 3. Final recommended default strategy: three layers

### Layer 1 — DOM / content reveal

- **What:** Lower funnel content is **present in the DOM and layout** (or equivalent: unhidden, interactive when scrolled into view). The user does **not** automatically see it without scrolling.
- **What it is not:** Not a visual “push”; not an overlay takeover; not a scroll.
- **Role:** Remove the **structural barrier** to continuing—scrolling is now meaningful.

### Layer 2 — Arrow reveal

- **What:** A **subtle down-arrow** (or equivalent affordance) appears **below the video** to signal that there is more below.
- **Role:** **Navigation hint only**—not a booking CTA, not a loud button. It answers: “there is a next step in this column.”

### Layer 3 — Arrow emphasis

- **What:** If the user **still has not scrolled** after Layer 2, the arrow may receive **gentle emphasis**: subtle motion, slight highlight, optional small helper text (e.g. “Pokračovať”).
- **Role:** Slightly stronger **attention** without intrusion; must remain easy to ignore.

---

## 4. Final recommended timing logic

**Ideal trigger (preferred)**

- **Content-synced:** Unlock Layer 1 when the video reaches the moment the speaker begins talking about **sessions, next step, or booking** (or whatever semantic “bridge” we define per video).
- Different videos differ in pacing; therefore **configurable trigger points per campaign/video** are required.

**Fallback when no semantic timestamp exists**

- Prefer **percentage of duration watched** over **absolute seconds alone**, so behavior scales with short vs long videos.
- An **absolute time** can still exist as a **secondary fallback** or safety cap in config (see §8).

**Recommended default sequence**

| Step | Behavior |
|------|----------|
| Layer 1 | Unlock at **semantic trigger** timecode when configured. |
| Layer 1 fallback | If no semantic trigger: unlock at approximately **30%** of video duration watched (configurable). |
| Layer 2 | Arrow appears **a few seconds after** Layer 1 (delay configurable). |
| Layer 3 | Emphasis only **later**, and **only if** the user has **not** scrolled into the lower content (see state model). |

**Repeated visits**

- On return visits, behavior may be **faster and less restrictive** (e.g. unlock Layer 1 earlier or show Layer 2 sooner), so repeat users are not blocked by the same pacing as first-time viewers. Exact rules are configurable (§8).

---

## 5. Why fixed “15 seconds” alone is not ideal

A single fixed delay (e.g. 15s from start) is **too mechanical** for this product:

- It **ignores video length** — 15s is very different on a 45s clip vs a 6-minute talk.
- It **ignores where the spoken content transitions** from hook/story to “what to do next.”
- For **multi-minute videos**, 15s is often **too early** relative to the narrative, so we either distract during the story or we pick an arbitrary number that fits no video well.

**Clarification:** The issue is not “15 seconds is always wrong.” The issue is **“15 seconds alone is context-blind.”** A fixed time can still be:

- A **fallback** alongside percentage or semantic triggers.
- A **config option** for campaigns that only have rough timing estimates.

**Preferred default:** semantic trigger first, **percentage-based fallback**, optional absolute time as tertiary or cap.

---

## 6. State model / event model

### Conceptual states

| State | Meaning |
|-------|---------|
| `initial` | Page loaded; video not yet started (or not tracked). |
| `video_started` | Playback has started (or meaningful “engaged” threshold—implementation detail). |
| `lower_content_unlocked` | Layer 1: lower content available in DOM/layout. |
| `arrow_visible` | Layer 2: arrow shown. |
| `arrow_emphasized` | Layer 3: gentle emphasis active (may be time-limited). |
| `user_scrolled` | User has scrolled to reveal / interact with lower content (threshold TBD: e.g. scroll past video bottom or intersection with booking region). |
| `video_ended` | Video completed (optional transitions—see below). |

### Typical transitions

```
initial → video_started → lower_content_unlocked → arrow_visible → arrow_emphasized (optional)
                ↓                                              ↓
         user_scrolled ────────────────────────────────────────┘ (stops nudging)
                ↓
         video_ended (may short-circuit emphasis per config)
```

### Events that stop or dampen further nudging

- **User scrolls down** into lower content → transition to `user_scrolled`; **stop** Layer 3 and any repeating emphasis (recommended default).
- **User manually interacts** with lower content (e.g. focuses booking control) → treat like `user_scrolled` or a dedicated `lower_engaged` state (implementation choice; same UX outcome: no more push).
- **Video ends** — optional: trigger emphasis once if not scrolled (configurable); or ensure emphasis does not fight the end screen. Not a substitute for scroll.
- **User pauses video** — **configurable:** either pause reveal timers, continue timers, or only pause Layer 3. Default should avoid punishing pause (see §8).

### Principles

- No state should imply **auto-scroll**.
- `arrow_emphasized` should not be infinite by default (cap animations / duration).

---

## 7. Default behavioral rules

| Rule | Recommendation |
|------|----------------|
| Auto-scroll | **Never** default on. |
| Viewport jump / centering | **No** automatic repositioning after play starts or after unlock. |
| Overlays | **No** aggressive full-screen or heavy overlay on top of the video for this feature. |
| Arrow emphasis | **Not** looping forever; respect max animations or time window. |
| Attention cue | **Stops** once user scrolls (or engages lower content). |
| Repeat visit | May **unlock earlier** than first visit (configurable). |

---

## 8. Configuration options

Legend: **(R)** = recommended default; **(O)** = optional tuning.

| Option | Description |
|--------|-------------|
| Semantic trigger timestamp(s) **(R)** | Per campaign/video: timecode(s) where Layer 1 should unlock (preferred). |
| Fallback percentage threshold **(R)** | e.g. **0.30** of duration when no semantic trigger. |
| Fallback absolute time **(O)** | Seconds from start; use as fallback or cap. |
| Delay Layer 1 → Layer 2 **(R)** | Seconds after unlock before arrow appears. |
| Delay Layer 2 → Layer 3 **(O)** | Seconds after arrow before emphasis (if still not scrolled). |
| Repeat visit behavior **(O)** | e.g. immediate Layer 1, or shorter delays. |
| Arrow emphasis enabled **(R)** | Boolean; default **true** with gentle limits. |
| Helper text (e.g. “Pokračovať”) **(O)** | Boolean; default can be **false** or **true** per brand test. |
| Pause behavior **(O)** | Whether pause freezes reveal timers / only Layer 3 / none. |
| Max emphasis animations **(R)** | Integer cap (e.g. 2–3 pulses) or max duration. |
| Video end → emphasis **(O)** | If user has not scrolled, trigger or bump emphasis once (not mandatory). |

---

## 9. Recommended default config example

Illustrative **JSON-like** pseudocode (values are defaults to start from; tune per campaign):

```json
{
  "firstVisit": {
    "layer1": {
      "semanticTriggerSec": null,
      "fallbackPercentWatched": 0.30,
      "fallbackAbsoluteSec": null
    },
    "layer2DelaySec": 3,
    "layer3": {
      "enabled": true,
      "delayAfterLayer2Sec": 8,
      "helperText": {
        "enabled": false,
        "sk": "Pokračovať"
      },
      "maxEmphasisCycles": 3
    },
    "onPause": {
      "freezeRevealTimers": false,
      "freezeEmphasisOnly": true
    },
    "onVideoEnd": {
      "emphasisIfNotScrolled": "once_light"
    }
  },
  "repeatVisit": {
    "layer1": {
      "semanticTriggerSec": null,
      "fallbackPercentWatched": 0.10,
      "unlockImmediatelyIfProgressRestored": true
    },
    "layer2DelaySec": 1,
    "layer3": {
      "enabled": true,
      "delayAfterLayer2Sec": 4,
      "maxEmphasisCycles": 2
    }
  }
}
```

**Notes**

- When `semanticTriggerSec` is set for a given video, **ignore or only use** percentage as backup if playback never reaches the trigger (edge cases—implementation detail).
- `fallbackAbsoluteSec` can be set for unusually short clips where percent feels odd.

---

## 10. Alternative strategies (considered)

| Strategy | Pros | Cons | Verdict |
|----------|------|------|---------|
| Fixed absolute time only | Simple to implement | Context-blind; bad for long videos | **Rejected** as sole default; OK as optional fallback. |
| Percentage only | Scales with duration | Misses narrative “bridge” moment | **Good fallback**, not sole strategy if semantic data exists. |
| Reveal only after video end | Strong signal user finished | Late; many users drop before end | **Optional** emphasis at end; not default for Layer 1. |
| Immediate reveal on repeat visit | Respects returning users | Slight risk of skipping message | **Accepted** as configurable; recommended for repeat. |
| Auto-scroll after trigger | High visibility | Violates autonomy; feels pushy | **Rejected.** |
| No arrow; content reveal only | Minimal chrome | Low discoverability | **Optional** variant; weaker default for long pages. |
| Arrow visible from start | Maximum discoverability | Competes with video; feels noisy | **Rejected** as default; optional for specific tests. |

---

## 11. Recommendation summary

**Default product choice**

1. **Semantic-trigger-first** unlock for Layer 1, with **percentage-based fallback** (e.g. ~30% watched) when no timestamp is configured.
2. **Short delay**, then **Layer 2 arrow** (hint only).
3. **Layer 3 emphasis** only if the user has **not** scrolled, with **limits** (cycles/time) and **no infinite loop**.
4. **No auto-scroll** and **no sudden viewport repositioning.**

This yields a **guided, respectful** progression: structure first, then a small directional cue, then a gentle nudge—while leaving room for **per-video** and **per-campaign** tuning and A/B tests via configuration.
