# Life Autopilot Assessment — First Technical Implementation Plan

**Status:** Draft v1 — planning only (no code yet)  
**Scope:** Free interactive assessment funnel (questionnaire), first shippable vertical slice  
**Canonical entry (start here):** [`016-assessment-v1-summary.md`](016-assessment-v1-summary.md) — decisions, content map, drift overrides, DoD  
**Locked decisions:** [`010-decisions.md`](010-decisions.md) (supersedes open defaults in §18 below)  
**Content / scoring:** [`011`](011-questionaire.md)–[`014`](014-scoring), principles [`015`](015-principles.md)  
**Product vision drafts (historical):** [`007-questionaire-v1.md`](007-questionaire-v1.md), [`008-questionaire-v2.md`](008-questionaire-v2.md)  
**Business context:** [`006-funnel-it-dev.md`](006-funnel-it-dev.md) §6 (free diagnostic), §7 (paid diagnosis)

---

## 1. Goal

Build a **new funnel type** — `assessment` — that delivers the free **Life Autopilot Assessment** as an interactive product experience, not a generic form.

The first implementation should prove the full user journey:

```
Landing → assessment (one question per screen) → analyzing → email unlock → personalized results → CTA toward paid diagnosis
```

Everything else (full analytics dashboard, email report delivery, 190 € booking integration, A/B campaigns) is explicitly **out of scope** for this first slice unless noted as optional.

---

## 2. Why this is not a video-booking funnel

Existing funnels (`pilot`, `manipulacia`) share one technical pattern:

| Layer | Current video-booking funnels |
|-------|------------------------------|
| View | `src/views/funnels/{name}.ejs` — hero, Wistia/self video, scroll reveal |
| Client JS | `funnel.js` (video reveal) + `booking.js` (slot lock, checkout) |
| Conversion | Slot → email → Stripe deposit → reservation |
| Primary KPI | `purchase` (reservation fee paid) |

The assessment funnel differs on every layer:

| Layer | Assessment funnel |
|-------|-------------------|
| View | Landing intro + in-page multi-step flow (no hero video required for v1) |
| Client JS | Dedicated state machine (`assessment.js`) — questions, progress, micro-insights |
| Conversion | Complete assessment → email unlock → results on page |
| Primary KPI | `assessment_email_unlocked` (see §9) |

**Decision:** Do **not** extend `pilot.ejs` or overload `renderFunnelExpressPage()` with conditionals. Introduce an explicit **`funnelType`** (or equivalent registry field) and separate render path, assets, and conversion flow.

---

## 3. Recommended funnel instance

| Field | Proposal | Notes |
|-------|----------|-------|
| Internal name (code) | `autopilot` | English, matches product language in code |
| Public URL (prod) | `/autopilot` | Slovak user-facing copy on page; URL can stay short |
| Public URL (test) | `/autopilot-test` | Standard `PAGE-VISIBILITY` pattern |
| Env var | `FUNNEL_AUTOPILOT_MODE=hidden\|test\|prod` | Default `hidden` until ready |
| Sitemap | Never | Same as all funnel pages |
| Indexing | Always `noindex` | Same as all funnel pages |

**Alternative considered:** `diagnostika` — clearer in Slovak but mixes languages in code. Prefer `autopilot` in registry; Slovak headline on the page.

---

## 4. Scope — first slice vs later

### In scope (draft v1)

- New `assessment` funnel type in registry
- Landing section + interactive assessment UI (mobile-first)
- 24 questions (or **12 for faster draft** — see §12 Phase 0); config-driven
- Likert scale (5 points) for all questions
- Micro-insights every 4–5 questions (config-driven copy)
- Client-side scoring → primary + secondary bottleneck
- “Analyzing…” interstitial before email gate
- Email unlock with captcha + rate limiting
- Persist submission (email, answers, scores, attribution)
- Results page: 6 sections from product spec (§5 in 007/008)
- Visual bar chart for four dimensions (CSS, no chart library required)
- Lead events for funnel analytics
- Optional CAPI `Lead` on email unlock (reuse existing sender)
- Soft CTA after results (link or copy toward paid diagnosis — no payment wiring yet)

### Out of scope (defer)

- Transactional email with full report PDF/HTML
- Paid diagnosis booking at ~190 € (different product from current session booking)
- Server-side scoring re-validation (acceptable for v1; add in v2 if abuse matters)
- Per-question abandonment analytics dashboard
- Admin UI for submissions (read via DB/SQL initially)
- Circular “Life System” brand diagram (CSS bars sufficient for v1)
- Campaign variants beyond `default`
- Newsletter / drip sequences by bottleneck type
- PseudoChat on assessment pages

### Content dependencies (non-code, blocking polish)

These are **not** in 007/008 yet and must be authored before prod launch:

1. 24 Slovak questions (6 × 4 dimensions)
2. ~5 micro-insight texts
3. Landing page copy (hero, trust, what you receive)
4. Result copy for four bottlenecks × six sections each
5. Tie-break rules when dimension scores are equal

Implementation can proceed with **placeholder Slovak copy** and one fully written bottleneck (e.g. Identity Loop) for UX validation.

---

## 5. User journey — technical mapping

| Step | UX (from 008) | Technical behavior |
|------|---------------|-------------------|
| 1 | Meta ad → landing | `GET /autopilot` renders assessment funnel view |
| 2 | Start assessment | Client transitions to question flow; fire `assessment_started` |
| 3 | Q1…Q24 | Single-screen steps; progress bar; answers in client state |
| 4 | Micro-insight | Inserted after Q4, Q8, Q12, Q16, Q20 (configurable) |
| 5 | Analyzing | Timed screen (~2–3 s); no server call yet |
| 6 | Email unlock | Form + captcha → `POST /api/assessment/submit` |
| 7 | Results | Render from server response or embedded result id + client template |
| 8 | Paid diagnosis CTA | Static link / mailto / waitlist — TBD (§15) |

**Email timing:** Email is **after** all questions, per 008. Answers live in client memory (and optionally `sessionStorage` for refresh resilience) until submit.

---

## 6. Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│  GET /autopilot                                              │
│  src/routes/funnels.js → renderAssessmentFunnelPage()        │
│  src/views/funnels/autopilot.ejs                             │
│  CSS: assessment.css (+ site.css tokens)                     │
│  JS:  assessment.js                                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  src/config/assessmentAutopilot.js                           │
│  questions, dimensions, microInsights, bottleneckResults     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  POST /api/assessment/submit                                 │
│  src/routes/api/assessment.js                                │
│  src/services/assessmentService.js                           │
│  src/db/repositories/assessmentSubmissionsRepo.js            │
│  → lead_events, optional CAPI Lead                           │
└─────────────────────────────────────────────────────────────┘
```

**Principle:** Config-driven content in `src/config/`; thin API; no business logic in EJS. Matches existing patterns (`funnelInstances.js`, `bookingCheckoutAmounts.js`, `webinarService.js`).

---

## 7. Funnel registry changes

### 7.1 Extend `src/config/funnelInstances.js`

Add metadata per page funnel instance:

```js
// Illustrative — not implementation
const FUNNEL_PAGE_CONFIG = {
  pilot: { type: 'video-booking' },
  manipulacia: { type: 'video-booking' },
  autopilot: { type: 'assessment' },
};
```

Keep `FUNNEL_INSTANCES` for attribution (`site`, `pilot`, `manipulacia`, `autopilot`).

### 7.2 `src/routes/funnels.js`

- Add `autopilot` to `INSTANCE_META` and minimal `INSTANCE_CAMPAIGNS` (landing copy overrides; no video required).
- Branch main route handler:
  - `type === 'video-booking'` → existing `renderFunnelExpressPage()`
  - `type === 'assessment'` → new `renderAssessmentFunnelPage()`
- **Do not** add assessment URLs to sitemap (`docs/PAGE-VISIBILITY.md`).

### 7.3 Attribution

Reuse existing funnel attribution pattern:

- `data-funnel-name`, `data-funnel-campaign` on root element (see `booking-content.ejs` / `citim-tracking.js`)
- API body: `funnelName`, `funnelCampaign` on submit
- Store on submission row + `lead_events.form_id`

No `funnelVideoId` for assessment v1 (null / omitted).

---

## 8. Frontend

### 8.1 View — `src/views/funnels/autopilot.ejs`

Suggested sections (single page, client-driven steps):

1. **Landing** — headline, subhead, “not a personality test”, what you’ll receive, CTA “Start Assessment”
2. **Assessment container** — empty shell; JS mounts question UI
3. **Results container** — hidden until after successful submit

Use `layouts/default`, `hideHeader: true`, `robotsNoindex: true`, testing banner — same as other funnels.

### 8.2 Client — `public/assets/js/assessment.js`

State machine (explicit phases):

```
landing | question | insight | analyzing | email | results
```

Responsibilities:

- Render current question + Likert buttons (1–5)
- Progress bar (current / total)
- Navigate forward (no back button in v1 — optional later)
- Insert micro-insight screens from config indices
- Accumulate answers `{ questionId: score }`
- On complete → analyzing → show email form
- POST submit → render results from response
- Persist in-progress answers to `sessionStorage` (key scoped by funnel name) to survive accidental refresh

**Non-goals for v1:** Page transitions library, swipe gestures, question review/edit.

### 8.3 Styles — `public/assets/css/assessment.css`

- Use design tokens from `site.css` (`var(--color-primary)`, spacing, typography)
- One-question layout, large tap targets (mobile-first)
- Progress bar, dimension result bars (████░░░░)
- Reduced motion: respect `prefers-reduced-motion` for analyzing animation

### 8.4 Scripts loaded

Assessment page should **not** load `booking.js` or `funnel.js`.

Suggested load order:

1. `assessment.css`
2. Captcha site key inline (same pattern as booking)
3. `assessment.js`
4. Optional: `citim-tracking.js` / Clarity if already on funnel pages

---

## 9. Config — `src/config/assessmentAutopilot.js`

Single module exporting:

| Export | Purpose |
|--------|---------|
| `dimensions` | `autopilot`, `identity`, `energy`, `relationships` — ids, Slovak labels, order |
| `bottlenecks` | Maps dimension id → result id (`autopilot_loop`, `identity_loop`, `energy_drain`, `connection_gap`) |
| `questions` | `{ id, dimensionId, text sk, order }` — 24 items |
| `likertLabels` | 5 Slovak labels |
| `microInsights` | `{ afterQuestionIndex, text sk }` |
| `bottleneckResults` | Per bottleneck: `title`, `whatItMeans`, `blindSpot`, `longTermRisk`, `firstStep` (Slovak HTML or markdown-ish plain text) |
| `landing` | Headline, subhead, bullets, CTA label |
| `emailGate` | Headline, subhead, button label |
| `analyzing` | Message(s) for interstitial |

**Scoring config** (can live in same file or `src/lib/assessmentScoring.js`):

- Sum scores per dimension (each question 1–5)
- Primary bottleneck = highest sum; secondary = second highest
- Tie-break: fixed dimension priority order (document in config); optional: if secondary within N points of primary, mention both prominently

Client and server should share scoring logic — extract pure functions importable from Node and bundled/minified for browser, **or** score only on server in v1 (client shows analyzing, server returns scores). **Recommendation for v1:** score on **both** — client for instant UX preview optional, server authoritative on submit.

---

## 10. API

### 10.1 `POST /api/assessment/submit`

**Purpose:** Accept completed assessment + email; persist; emit events; return result payload.

**Request body (JSON):**

| Field | Type | Required |
|-------|------|----------|
| `email` | string | yes |
| `answers` | `{ [questionId]: 1..5 }` | yes — all question ids |
| `funnelName` | string | yes — expect `autopilot` |
| `funnelCampaign` | string | no — default `default` |
| `captchaToken` | string | yes if captcha enabled |

**Validation:**

- Email format + normalize (lowercase trim)
- All question ids present; each score integer 1–5
- Unknown question ids rejected
- Rate limit per IP (reuse pattern from `webinarRegisterLimiter` / slot lock)
- Captcha verify (reuse booking captcha middleware/helper)

**Response 200:**

```json
{
  "ok": true,
  "submissionId": 123,
  "scores": {
    "autopilot": 22,
    "identity": 28,
    "energy": 19,
    "relationships": 15
  },
  "primaryBottleneck": "identity_loop",
  "secondaryBottleneck": "autopilot_loop",
  "result": {
    "title": "…",
    "sections": { "whatItMeans": "…", "blindSpot": "…", "longTermRisk": "…", "firstStep": "…" }
  }
}
```

**Errors:** Standard `ApiError` pattern (`VALIDATION_ERROR`, `CAPTCHA_FAILED`, `RATE_LIMITED`).

### 10.2 Optional — `POST /api/assessment/progress`

**Defer.** Not needed for v1. If added later for abandonment analytics, must be privacy-conscious (no PII until email step).

### 10.3 Route registration

- New file: `src/routes/api/assessment.js`
- Mount in `src/routes/api/index.js` at `/assessment`
- Document in `docs/API.md`

---

## 11. Database

### 11.1 New migration — `007_assessment_submissions.sql` (next free number)

New table `assessment_submissions`:

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `email` | VARCHAR(255) NOT NULL | |
| `funnel_name` | VARCHAR(64) NOT NULL | e.g. `autopilot` |
| `funnel_campaign` | VARCHAR(64) NULL | |
| `answers_json` | JSON NOT NULL | `{ questionId: score }` |
| `scores_json` | JSON NOT NULL | `{ dimensionId: number }` |
| `primary_bottleneck` | VARCHAR(64) NOT NULL | |
| `secondary_bottleneck` | VARCHAR(64) NOT NULL | |
| `source_url` | VARCHAR(2048) NULL | From request |
| `created_at` | DATETIME(3) | UTC |

Indexes:

- `(email, created_at)`
- `(funnel_name, created_at)`
- `(primary_bottleneck, created_at)` — for distribution reporting

**Idempotent:** `CREATE TABLE IF NOT EXISTS`.

**Users table:** Do **not** auto-create `users` row on assessment submit (that row is tied to reservation flow today). Revisit if product wants unified identity.

### 11.2 Lead event types — same or follow-up migration

Add to `lead_event_types` (active):

| code | category | when |
|------|----------|------|
| `assessment_started` | acquisition | First question shown / Start clicked |
| `assessment_completed` | acquisition | Last question answered (client beacon before email) |
| `assessment_email_unlocked` | acquisition | Successful submit with email |

Wire in `src/lib/leadEventsGate.js` → `WIRED_EVENT_TYPES`.

**Note:** `assessment_started` / `assessment_completed` may fire **without email** — store email as empty string is **not** allowed (`lead_events.email NOT NULL`). Options:

1. **Recommended:** Only wire `assessment_email_unlocked` in v1; defer anonymous step events to v2 with schema change or placeholder email (avoid).
2. **Alternative:** Add nullable `email` on lead_events ( bigger change — avoid for v1).

**Primary KPI for this funnel:** `assessment_email_unlocked`.

Document separately from `docs/leads/conversion-events.md` (that doc is reservation-funnel-specific). Add `docs/leads/assessment-conversion-events.md` or a section in 009 during implementation.

---

## 12. Implementation phases

### Phase 0 — Content stub (can parallel code)

**Done** — see [`017-assessment-content-sk.md`](017-assessment-content-sk.md). Older stub checklist below is obsolete:

- [x] 24 questions in Slovak — `011` (not placeholders)
- [x] All four bottleneck results in Slovak — `017` §9
- [x] 5 micro-insights in Slovak — `017` §6
- [x] Landing + email gate + analyzing copy — `017` §4, §7–8
- [x] Likert SK labels — `017` §2 / `011`

### Phase 1 — Shell (no persistence)

**Done** (client-side unlock; no submit API yet):

- [x] Registry: `autopilot`, `funnelType: assessment`
- [x] EJS + CSS + JS state machine through all screens with config data
- [x] Client-side scoring + results render from config
- [x] `FUNNEL_AUTOPILOT_MODE=test` locally (see `.env.example`)

### Phase 2 — API + persistence

- [ ] Migration `assessment_submissions`
- [ ] `POST /api/assessment/submit` + service + repo
- [ ] Email gate + captcha + rate limit
- [ ] Server-side scoring matches client

### Phase 3 — Analytics

- [ ] `assessment_email_unlocked` lead event (+ metadata: scores, bottlenecks)
- [ ] Optional: CAPI `Lead` on unlock (`scheduleCapiLead`)
- [ ] Clarity / page context includes funnel name

### Phase 4 — Polish + handoff

- [ ] Replace placeholder copy
- [ ] Results CTA block (paid diagnosis — see §15)
- [ ] Manual test checklist
- [ ] Update `docs/API.md`, `docs/DB-SCHEMA.md`, `IMPLEMENTATION-SNAPSHOT.md`

**Estimated order:** Phase 1 → 2 → 3 can overlap; Phase 0 content can lag behind Phase 1 with placeholders.

---

## 13. Security & abuse

| Risk | Mitigation |
|------|------------|
| Email spam | Captcha on submit (same as booking) |
| API abuse | Rate limiter on `/api/assessment/submit` |
| Scraping questions | Low priority; questions are not secret |
| Fake scores | Server recalculates from answers; ignore client-sent scores |
| PII | Store email + answers; privacy policy link on email form (`/ochrana-udajov`) |
| Marketing consent | Optional checkbox — **defer** unless legally required; do not block unlock |

---

## 14. Analytics & observability

### v1 (minimum)

- `lead_events` for email unlock
- Server log on submit (submission id, funnel, primary bottleneck — no full answers in logs)
- Manual SQL for bottleneck distribution:

```sql
SELECT primary_bottleneck, COUNT(*) FROM assessment_submissions GROUP BY 1;
```

### v2 (planned, not in first slice)

- Client beacon for question index drop-off
- Admin list view for submissions
- Funnel metrics dashboard
- Microsoft Clarity custom tags for assessment phase

---

## 15. Paid diagnosis handoff (explicitly TBD)

The paid **Diagnostika životného autopilota** (~190 €, 90 min) is a **different product** from current session booking (deposit ~10–45 €, `BOOKING_SESSION_*` pricing).

**Options for results-page CTA (pick one before Phase 4):**

| Option | Effort | Notes |
|--------|--------|-------|
| A. Static copy + `mailto:` / contact | Minimal | Fine for first 20 clients |
| B. Link to separate `/autopilot/diagnosis` video-booking page | Medium | Reuse booking.js with new env pricing |
| C. Full new checkout amount (`FUNNEL_AUTOPILOT_DIAGNOSIS_FULL_EUR=190`) | Medium–high | Needs product + Stripe + slot policy decision |

**Recommendation for first slice:** Option A or waitlist form (could reuse support API pattern). Do not block assessment launch on payment integration.

---

## 16. Files to create

| Path | Purpose |
|------|---------|
| `docs/funnel/it-dev/009-questionnaire-implementation-plan.md` | This document |
| `src/config/assessmentAutopilot.js` | Questions, results, landing copy |
| `src/lib/assessmentScoring.js` | Pure scoring + tie-break |
| `src/views/funnels/autopilot.ejs` | Assessment funnel page |
| `public/assets/js/assessment.js` | Client state machine |
| `public/assets/css/assessment.css` | Assessment styles |
| `src/routes/api/assessment.js` | HTTP handler |
| `src/services/assessmentService.js` | Validation, scoring, persist, events |
| `src/db/repositories/assessmentSubmissionsRepo.js` | DB access |
| `src/db/migrations/007_assessment_submissions.sql` | Schema |
| `tests/assessmentScoring.test.js` | Unit tests for scoring |

## 17. Files to modify

| Path | Change |
|------|--------|
| `src/config/funnelInstances.js` | Add `autopilot`, funnel type metadata |
| `src/routes/funnels.js` | Assessment render path, meta, campaigns |
| `src/routes/api/index.js` | Mount assessment routes |
| `src/lib/leadEventsGate.js` | New event type(s) |
| `src/lib/adminLeadEventDisplay.js` | Slovak labels for new events |
| `.env.example` | `FUNNEL_AUTOPILOT_MODE` |
| `docs/API.md` | New endpoint |
| `docs/DB-SCHEMA.md` | New table |
| `docs/IMPLEMENTATION-SNAPSHOT.md` | Assessment funnel row |
| `docs/IMPLEMENTATION-PLAN.md` | Mark item in progress / done when shipped |

**Do not modify:** `scripts/db-migrate.js`, `001_initial.sql`.

---

## 18. Open decisions (resolve before or during Phase 2)

**Resolved in [`010-decisions.md`](010-decisions.md) and summarized in [`016`](016-assessment-v1-summary.md) §3–4.** Do not use the table below as defaults — kept for history only.

| # | Question | Historical default in this draft | Resolved (010 / 014) |
|---|----------|----------------------------------|----------------------|
| 1 | 24 vs 12 questions for first deploy | 24 with placeholder text | **24** |
| 2 | Allow back navigation between questions | No in v1 | **Yes** |
| 3 | `sessionStorage` resume after refresh | Yes | **Yes** |
| 4 | Primary KPI event name | `assessment_email_unlocked` | **Unchanged** |
| 5 | Paid diagnosis CTA | Static contact / waitlist | **Unchanged** (soft CTA) |
| 6 | Tie-break dimension order | Identity > Energy > Autopilot > Relationships | **Rejected** — use 5% threshold dual-primary |
| 7 | Send transactional email with results | No in v1 | **No** |
| 8 | Require marketing consent checkbox | No | **Optional only** |

---

## 19. Definition of done (first slice)

- [ ] `/autopilot-test` serves assessment funnel when `FUNNEL_AUTOPILOT_MODE=test`
- [ ] User can complete full flow: landing → questions → email → results
- [ ] Submission persisted in `assessment_submissions`
- [ ] `assessment_email_unlocked` recorded in `lead_events`
- [ ] Captcha + rate limit on submit
- [ ] Scoring unit tests pass
- [ ] No regression on existing video-booking funnels
- [ ] Docs updated: `API.md`, `DB-SCHEMA.md`, `IMPLEMENTATION-SNAPSHOT.md`
- [ ] Manual test on mobile viewport

---

## 20. Testing checklist (manual)

1. Start assessment → progress through all questions
2. Micro-insight appears at configured indices
3. Refresh mid-flow → resume from `sessionStorage` (if implemented)
4. Submit invalid email → validation error
5. Submit without captcha → error
6. Successful submit → results match expected bottleneck for known answer pattern
7. Repeat submit same email → allowed (new row) or rate-limited — **decision:** allow multiple submissions in v1
8. `/autopilot` redirects or 404 when mode `hidden`
9. Existing `/pilot-test` unchanged

---

## 21. Relationship to product docs

| Doc | Role |
|-----|------|
| [`016`](016-assessment-v1-summary.md) | **Start here** — summary, links, implementation brief |
| [`017`](017-assessment-content-sk.md) | Phase 0 Slovak UI + results pack (map into config) |
| 010 | Locked product/UX decisions |
| 011–014 | Questionnaire, insights (EN), results (EN), scoring |
| 015 | Methodology principles |
| 007 / 008 | Historical vision drafts (superseded for content) |
| 006 | IT-dev funnel context, paid product pricing |
| This doc (009) | **How** to build draft v1 in this codebase (architecture, API, DB, phases) |

---

## 22. Guiding constraints (from project practices)

- Root-relative asset paths (`/assets/…`)
- File names in English; user-facing copy in Slovak
- New schema via numbered idempotent migration only
- Funnel URLs never in sitemap
- Assessment funnel must not depend on lead_events table for core submit path (same as booking: insert is best-effort if gate disabled)

---

*Phase 0 content is in [`017`](017-assessment-content-sk.md). Treat [`016`](016-assessment-v1-summary.md) and [`010`](010-decisions.md) as binding for v1 decisions; use this doc for architecture detail. Next: Phase 1 shell.*
