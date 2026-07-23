# 031 — Manual UX Test Checklist

**Status:** Operator worksheet (printable)  
**Product:** Life Autopilot Assessment + post-assessment nurture  
**Related:** [`016`](016-assessment-v1-summary.md) · [`018`](018-experience.md) · [`027`](027-sk-copy-pack1.md)–[`030`](030-sk-copy-pack4.md) · admin `/admin/email-nurture-test`

Print this page (or export to PDF). Mark **Pass** / **Fail**, jot notes. Focus on how it *feels*, not only whether it works.

---

## Session

| | |
|--|--|
| Date | ________________ |
| Tester | ________________ |
| Environment | local / staging / prod |
| Funnel URL | `/autopilot-test` · `/autopilot` · other: ________ |
| Device(s) | phone · desktop · both |
| Test inbox | ________________ |

---

## Setup (before you start)

| Check | Done |
|-------|:----:|
| Resend configured (emails actually send) | ☐ |
| Funnel mode allows the URL you will open | ☐ |
| Admin access for `/admin/email-nurture-test` | ☐ |
| Two emails ready (consent on / consent off) *or* two full runs | ☐ |

**Nurture timing** (days from enrollment, Europe/Bratislava):

| E1 | E2 | E3 | E4 | E5 | E6 | E7 |
|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| 0 | +2 | +5 | +8 | +12 | +16 | +21 |

Admin rule: one page load / run = **at most one next email** per enrollment. Advance day offset after each send.

**Suggested order (~45–60 min):** A1–A7 on mobile (consent on) → confirm E1 → drive E2–E7 via admin → unsubscribe on a second consented enrollment (optional) → desktop glance at results.

---

## A. Assessment funnel

### A1 — First impression → start

Open cold. Read landing as if from an ad. Tap start.

| Criterion | Pass | Fail | Notes |
|-----------|:----:|:----:|-------|
| Curiosity without “survey” vibe | ☐ | ☐ | |
| After start: minimal UI (progress + question + answers) | ☐ | ☐ | |
| No leftover marketing chrome | ☐ | ☐ | |

---

### A2 — Early rhythm (Q1–Q4)

Answer quickly, without overthinking.

| Criterion | Pass | Fail | Notes |
|-----------|:----:|:----:|-------|
| Questions feel relatable | ☐ | ☐ | |
| Answering becomes automatic | ☐ | ☐ | |
| Progress is clear | ☐ | ☐ | |

---

### A3 — Micro-insights (after Q4, Q8, Q12, Q16, Q20)

| Checkpoint | Pass | Fail | Notes |
|------------|:----:|:----:|-------|
| After Q4 — recognition, not a tip/label | ☐ | ☐ | |
| After Q8 | ☐ | ☐ | |
| After Q12 | ☐ | ☐ | |
| After Q16 | ☐ | ☐ | |
| After Q20 | ☐ | ☐ | |
| Continue after insight feels seamless | ☐ | ☐ | |

---

### A4 — Mid-flow friction

| Action | Pass | Fail | Notes |
|--------|:----:|:----:|-------|
| Back a few questions, change answer, continue | ☐ | ☐ | |
| Refresh mid-flow → resume | ☐ | ☐ | |
| Leave tab ~1 min, return → still intact | ☐ | ☐ | |

---

### A5 — Late questions + analyzing

Finish Q21–Q24; watch analyzing interstitial.

| Criterion | Pass | Fail | Notes |
|-----------|:----:|:----:|-------|
| Anticipation (not empty spinner) | ☐ | ☐ | |
| Email gate feels like unlocking *my* result | ☐ | ☐ | |
| Gate does not feel like a lead form first | ☐ | ☐ | |

---

### A6 — Unlock **without** marketing consent

Email A · consent **off**.

| Criterion | Pass | Fail | Notes |
|-----------|:----:|:----:|-------|
| Results still unlock | ☐ | ☐ | |
| No guilt / hard sell | ☐ | ☐ | |
| Four score bars readable | ☐ | ☐ | |
| Bottleneck copy = patterns, not personality labels | ☐ | ☐ | |
| Soft CTA feels optional | ☐ | ☐ | |
| No nurture emails for this enrollment | ☐ | ☐ | |

---

### A7 — Unlock **with** marketing consent

Email B · consent **on**.

| Criterion | Pass | Fail | Notes |
|-----------|:----:|:----:|-------|
| Consent copy clear and optional | ☐ | ☐ | |
| E1 arrives (cron or admin day 0) | ☐ | ☐ | |

**After results, mark what you felt:**

| Feeling | Yes | No | Weak |
|---------|:---:|:--:|:----:|
| Seen | ☐ | ☐ | ☐ |
| Understood | ☐ | ☐ | ☐ |
| Curious about *why* | ☐ | ☐ | ☐ |
| Soft pull toward paid diagnosis | ☐ | ☐ | ☐ |
| Not sold-to | ☐ | ☐ | ☐ |

If most of the five land, assessment UX is doing its job.

---

### A8 — Results variants (optional)

| Variant attempted | Pass | Fail | Notes |
|-------------------|:----:|:----:|-------|
| Distinct primary bottleneck | ☐ | ☐ | which: ________ |
| Dual-primary / near-tie | ☐ | ☐ | |
| Copy matches how you answered | ☐ | ☐ | |

---

## B. Nurture emails (inbox)

Drive via `/admin/email-nurture-test` (time ~07:00). Read each on **phone**, then desktop if useful.

**Per-email skim:** subject+preview → open? · first screenful tone · bold hierarchy · CTA/mailto · footer + unsubscribe.

| Day | Email | Subject cue | Expected feel | CTA | Pass | Fail | Notes |
|----:|-------|-------------|---------------|-----|:----:|:----:|-------|
| 0 | E1 | Vaše hodnotenie je len začiatok | Recognition; no sell | none | ☐ | ☐ | |
| 2 | E2 | Čo ak to nie je vaša osobnosť? | Patterns ≠ identity | none | ☐ | ☐ | |
| 5 | E3 | Na jednu otázku diagnostika neodpovedá | Honest limits; “why” needs talk | soft | ☐ | ☐ | |
| 8 | E4 | Problém nemusí byť tam, kde ho cítite | Symptoms vs system | soft | ☐ | ☐ | |
| 12 | E5 | Prečo existuje ďalší krok… | Product = understanding, not coaching/therapy | medium | ☐ | ☐ | |
| 16 | E6 | Možno vám ešte napadli tieto otázky | Doubts answered; fit / non-fit | medium | ☐ | ☐ | |
| 21 | E7 | Rozhodnutie nemusíte urobiť dnes | Invitation without pressure | primary | ☐ | ☐ | |

| Sequence arc | Pass | Fail | Notes |
|--------------|:----:|:----:|-------|
| E1–E2 no sell → E3–E4 soft → E5–E6 clarity → E7 invite | ☐ | ☐ | |
| Does **not** feel like a promo blast | ☐ | ☐ | |
| Mailto CTAs open with expected subject (when present) | ☐ | ☐ | |
| Footer: why-receiving + Odhlásiť sa z odberu | ☐ | ☐ | |

---

## C. Unsubscribe

From any nurture email (prefer a second consented enrollment).

| Step | Pass | Fail | Notes |
|------|:----:|:----:|-------|
| Link opens `/odhlasenie-emailov` | ☐ | ☐ | |
| Success feels calm / final | ☐ | ☐ | |
| No further emails after advancing admin days | ☐ | ☐ | |

---

## D. Negative paths (still UX)

| Scenario | Pass | Fail | Notes |
|----------|:----:|:----:|-------|
| Empty / invalid email on unlock → clear error | ☐ | ☐ | |
| Rapid resubmit → rate limit / captcha, no crash | ☐ | ☐ | |
| Funnel `hidden` → redirect home (not half-broken) | ☐ | ☐ | |
| Consent off → silence (no E1) | ☐ | ☐ | |

---

## Verdict

| | |
|--|--|
| Overall | Pass · Fail · Conditional |
| Ship blockers | |
| Polish later | |
| Tester sign-off | ________________ |

---

*Print tip: use browser Print → save as PDF; hide nav if your viewer adds chrome. One session per printout.*
