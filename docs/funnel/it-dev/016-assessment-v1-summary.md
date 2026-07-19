# 016 — Life Autopilot Assessment v1 — Summary & Implementation Brief

**Status:** Canonical entry point for implementers — Phases 0–4 done (v1 slice); operator manual test remaining  
**Audience:** Anyone building or changing the free assessment funnel  
**Product:** Free Life Autopilot Assessment → email unlock → personalized results → soft CTA to paid Life Autopilot Diagnosis (~190 €)  
**Folder index:** [`README.md`](README.md)

This document does **not** redefine questions, results, or philosophy. It links the authoritative specs, records what is decided, reconciles drift between older plans and later decisions, and points at the as-built implementation.

**Live content:** shipped Slovak strings and question text live in `src/config/assessmentAutopilot.js`. When this pack and the config disagree, **prefer the config** and update the matching doc (`017` / `019` / `011`).

---

## 1. One-sentence product

Deliver a **config-driven interactive assessment** (`/autopilot`) that measures four life-system dimensions, unlocks results with an email, and positions the paid diagnosis as the natural next step — without wiring 190 € booking in the first slice.

```
Landing → 24 questions (one per screen) → micro-insights → analyzing → email unlock → results (4 scores + bottleneck copy) → soft CTA
```

---

## 2. Canonical sources

Use these as the source of truth. Prefer the newest numbered doc when topics overlap.

| Topic | Canonical doc | Notes |
|-------|---------------|--------|
| Business context, offer, pilot | [`006-funnel-it-dev.md`](006-funnel-it-dev.md) | Free diagnostic §6, paid §7 |
| Product / UX decisions (locked) | [`010-decisions.md`](010-decisions.md) | Overrides older defaults in `009` §18 |
| Questionnaire structure | [`011-questionaire.md`](011-questionaire.md) | Ids, dimensions, reverse flags, order |
| Question wording (v1.1) | [`019-question-wording.md`](019-question-wording.md) | Formulation only — synced into config |
| Experience / emotional journey | [`018-experience.md`](018-experience.md) | UX intent; not implementation |
| Micro-insights | [`012-insights.md`](012-insights.md) | English draft — **prod SK in `017` §6** |
| Results copy (4 bottlenecks × 6 sections) | [`013-result-framework.md`](013-result-framework.md) | English draft — **prod SK in `017` §9** |
| Scoring & tie rules | [`014-scoring.md`](014-scoring.md) | Normalized %, threshold dual-primary |
| Methodology principles | [`015-principles.md`](015-principles.md) | Decision filter for future changes |
| **Slovak UI + results pack** | [`017-assessment-content-sk.md`](017-assessment-content-sk.md) | Likert, landing, gate, analyzing, insights, results, CTA |
| Technical architecture & phases | [`009-questionnaire-implementation-plan.md`](009-questionnaire-implementation-plan.md) | Still valid for files/API/DB; apply overrides in §4 below |

**Planning only (not v1 ops):** [`020-customer-journey.md`](020-customer-journey.md) — next customer-journey proposal after Assessment v1. Do not treat as assessment implementation spec.

**Historical / reference only:** [`archive/`](archive/) (`000`–`005`, `007`–`008`). Do not implement from them without checking `006` + this brief.

**Project practices:** root-relative paths, funnel never in sitemap, `FUNNEL_{NAME}_MODE`, idempotent migrations — see workspace rules and `docs/PAGE-VISIBILITY.md`, `docs/PRACTICES.md`.

**Ops / as-built:** `docs/IMPLEMENTATION-SNAPSHOT.md`, `docs/API.md`, `docs/leads/assessment-conversion-events.md`, `docs/DB-SCHEMA.md`.

---

## 3. Decided for v1

From [`010-decisions.md`](010-decisions.md) and [`014-scoring.md`](014-scoring.md):

| Decision | Choice |
|----------|--------|
| Length | **24** questions (6 × 4 dimensions), ~3–4 minutes |
| Scale | 5-point Likert (1–5); reverse-score per `011` |
| Back navigation | **Allowed** until submit / analyzing |
| Session recovery | **`sessionStorage`** resume |
| Primary KPI | `assessment_email_unlocked` |
| Also track (when practical) | `assessment_started`, `assessment_completed`, `results_viewed`, `paid_diagnosis_cta_clicked` |
| Show all four scores | **Yes** (bars / normalized %) |
| Tie handling | **No hard priority order.** If top two within **5%** (≈ one Likert point across six items), present **dual primary**; otherwise primary + secondary pattern |
| Results email | **None** in v1 (on-page after unlock) |
| Marketing consent | **Optional** checkbox; not required to unlock |
| Paid diagnosis CTA | Soft: waitlist / request info / contact — **not** Stripe booking |
| Server scoring | Authoritative on submit; ignore client-sent scores |

**Product principles (do not violate in UI copy):** diagnostic experience not survey; patterns not labels; recognition over certainty; assessment answers *what appears to be happening*; paid diagnosis answers *why*. See also [`018`](018-experience.md) and [`015`](015-principles.md).

---

## 4. Drift reconciliation (`009` vs later)

`009` §18 defaults that are **obsolete** — implement the later column:

| Topic | Obsolete (`009`) | Implement (`010` / `014`) |
|-------|------------------|---------------------------|
| Back navigation | No | **Yes** |
| Tie-break | Identity > Energy > Autopilot > Relationships | **Threshold dual-primary** (5%); no fixed priority |
| Content pack | Imagined future `010-questionnaire-content` | Already **`011`–`013`** (+ `014` scoring) + **`017` / `019`** |
| Product specs linked from `009` header | `007` / `008` (now in [`archive/`](archive/)) | Prefer **`011`–`015`**, **`017`–`019`**, + this brief |
| Scoring display | Raw sums OK for draft | **Normalize to 0–100%** for UI (`014`) |

Architecture in `009` (registry split, `assessment` funnel type, config module, API, migration) remains the plan. Only decision defaults and content pointers change.

---

## 5. User journey (technical)

| Step | UX | Technical |
|------|----|-----------|
| 1 | Ad → landing | `GET /autopilot` or `/autopilot-test` |
| 2 | Start | Client → question flow; fire `assessment_started` when wired |
| 3 | Q1…Q24 | One screen each; progress; answers in memory + `sessionStorage` |
| 4 | Micro-insights | After Q4, Q8, Q12, Q16, Q20 (`017` §6; EN: `012`) |
| 5 | Analyzing | Timed interstitial (~2–3 s) |
| 6 | Email unlock | Captcha + `POST /api/assessment/submit` |
| 7 | Results | Four bars + primary/dual copy + secondary + closing + CTA |
| 8 | Paid CTA | Static waitlist / contact (`010`); booking later |

Email is **after** all questions. Do not collect email mid-flow in v1.

---

## 6. Content → config map

Ship content via `src/config/assessmentAutopilot.js` (see `009` §9). Map fields to docs:

| Config export | Source |
|---------------|--------|
| `dimensions` | `011`, `014`, **`017` §3** — ids: `autopilot`, `identity`, `energy`, `relationships` |
| `bottlenecks` | **`017` §3** — result ids: `autopilot_loop`, `identity_loop`, `energy_drain`, `connection_gap` |
| `questions` | Structure: `011`; **wording: `019`** (and live config) |
| `likertLabels` | **`017` §2** (also mirrored in `011`) |
| `microInsights` | **`017` §6** (EN draft: `012`) |
| `bottleneckResults` | **`017` §9** (EN draft: `013`) |
| `landing` / `emailGate` / `analyzing` | **`017` §4 / §8 / §7** |
| `paidCta` / special states | **`017` §11–12** |
| Scoring rules | Pure functions in `src/lib/assessmentScoring.js` per `014` |

Experience intent for screens/transitions: [`018`](018-experience.md) (do not invent new product rules from it alone).

**Content readiness**

| Asset | Status |
|-------|--------|
| 24 Slovak questions + reverse flags | Ready — structure `011`, wording `019` / config |
| Likert Slovak labels | **Done** — `017` §2 / `011` |
| Micro-insights | **Done** — `017` §6 |
| Result frameworks | **Done** — `017` §9 |
| Landing + email-gate + analyzing + CTA strings | **Done** — `017` §4, §7–8, §12 |
| Dual-bottleneck / balanced / low-score blurbs | **Done** — generic + all 6 pair blurbs in `dualPrimaryPairs` |
| Experience spec | **Done** — `018` (reference for UX polish) |

---

## 7. Funnel registry (proposal)

| Field | Value |
|-------|--------|
| Internal name | `autopilot` |
| URLs | `/autopilot`, `/autopilot-test` |
| Env | `FUNNEL_AUTOPILOT_MODE=hidden\|test\|prod` |
| Type | `assessment` (separate render path from `video-booking`) |
| Sitemap / index | Never / always `noindex` |

Do **not** overload `pilot.ejs` or `renderFunnelExpressPage()` with assessment conditionals.

---

## 8. Implementation suggestions

### 8.1 Build order

| Phase | Goal | Notes |
|-------|------|--------|
| **0 — Content** | Likert SK, landing/gate stubs, SK translations | **Done** — [`017`](017-assessment-content-sk.md) |
| **1 — Shell** | Registry + EJS + CSS + `assessment.js` state machine; client scoring + mock results | **Done** — set `FUNNEL_AUTOPILOT_MODE=test`, open `/autopilot-test` |
| **2 — Persist** | Migration `007_assessment_submissions.sql` + submit API + captcha + rate limit; server scoring authoritative | **Done** — run `yarn db:migrate`; unlock posts to `/api/assessment/submit` |
| **3 — Analytics** | Wire `assessment_email_unlocked` (+ metadata); optional CAPI `Lead`; optional started/completed only if email constraint solved (`009` §11.2) | **Done** — primary KPI + CAPI Lead; started/completed deferred |
| **4 — Polish** | Pair-specific dual copy; results CTA Option A; docs snapshot; manual checklist | **Done** — operator runs `009` §20 on mobile |

### 8.2 Scoring implementation notes

- Apply reverse scoring before summing (`011` flags: A05, I05, E05, E06, R05 — confirm against file when coding).
- Dimension raw sum 6–30 → display `(score - 6) / (30 - 6)` as 0–100%.
- Primary = highest normalized; secondary = second highest.
- If `|primary - secondary| ≤ 5` percentage points → dual primary UI + short “reinforce one another” copy (`014`).
- Unit-test edge cases: ties, reverse items, balanced four-way scores (`014` balanced handling).

### 8.3 API / DB (summary)

- `POST /api/assessment/submit` — email, answers map, funnel attribution, captcha; response includes scores, bottleneck(s), result sections (`009` §10).
- Table `assessment_submissions` — email, answers_json, scores_json, primary/secondary bottleneck, funnel fields (`009` §11).
- Do **not** auto-create `users` row on submit.
- Do **not** modify `scripts/db-migrate.js` or `001_initial.sql`.

### 8.4 Files to create / modify

**Create:** `assessmentAutopilot.js`, `assessmentScoring.js`, `autopilot.ejs`, `assessment.js`, `assessment.css`, `routes/api/assessment.js`, `assessmentService.js`, `assessmentSubmissionsRepo.js`, `007_assessment_submissions.sql`, `tests/assessmentScoring.test.js`.

**Modify:** `funnelInstances.js`, `funnels.js`, `api/index.js`, `leadEventsGate.js`, `adminLeadEventDisplay.js`, `.env.example`, `API.md`, `DB-SCHEMA.md`, `IMPLEMENTATION-SNAPSHOT.md`, `IMPLEMENTATION-PLAN.md`.

Full tables: `009` §16–17.

### 8.5 Security

Captcha + rate limit on submit; server recalculates scores; privacy link on email form (`/ochrana-udajov`); optional marketing consent only.

### 8.6 Out of scope (v1)

Transactional results email; 190 € Stripe/booking; circular “Life System” diagram; admin submissions UI; PseudoChat; per-question abandonment dashboard; personalized micro-insights; campaign variants beyond `default`.

### 8.7 Paid CTA (Phase 4)

**Shipped Option A** — static dual `mailto:` (info + waitlist) to `SUPPORT_EMAIL`. Diagnosis Stripe/booking deferred.

---

## 9. Still TBD / open product (non-blocking for assessment shell)

From `006` §16 and `010` — do not block Phase 1–2:

- Exact 90-min paid session structure and deliverables
- Guarantee copy
- Bonus packaging / pilot pricing messaging polish
- Whether extended funnel (video series, drip by bottleneck) comes after pilot data
- Dual-bottleneck specific copy — **done** for all 6 pairs in `dualPrimaryPairs` (tune later if needed)

Broader post-v1 journey proposals: [`020`](020-customer-journey.md) (planning only).

---

## 10. Definition of done (first slice)

- [x] `/autopilot-test` serves assessment when `FUNNEL_AUTOPILOT_MODE=test`
- [x] Full flow: landing → questions (back + resume) → analyzing → email → results with four scores
- [x] Tie within 5% shows dual primary; otherwise primary + secondary
- [x] Submission in `assessment_submissions`
- [x] `assessment_email_unlocked` in `lead_events`
- [x] Captcha + rate limit on submit
- [x] Scoring unit tests pass (incl. reverse + ties)
- [x] No regression on `pilot` / other video-booking funnels
- [x] Docs updated: `API.md`, `DB-SCHEMA.md`, `IMPLEMENTATION-SNAPSHOT.md`
- [ ] Manual check on mobile viewport (operator — `009` §20)

---

## 11. Suggested reading order (before coding)

1. This brief (`016`) — or folder [`README.md`](README.md)
2. [`017-assessment-content-sk.md`](017-assessment-content-sk.md) — Slovak strings to load into config
3. [`010-decisions.md`](010-decisions.md)
4. [`009-questionnaire-implementation-plan.md`](009-questionnaire-implementation-plan.md) — architecture only; apply §4 overrides
5. [`014-scoring.md`](014-scoring.md) + [`011-questionaire.md`](011-questionaire.md) + [`019-question-wording.md`](019-question-wording.md)
6. [`018-experience.md`](018-experience.md) — tone / emotional journey
7. [`012-insights.md`](012-insights.md) + [`013-result-framework.md`](013-result-framework.md) — EN reference only
8. [`015-principles.md`](015-principles.md) — tone check
9. [`006-funnel-it-dev.md`](006-funnel-it-dev.md) §6–7 — business framing

---

## 12. Next action

1. ~~Author Phase 0 strings~~ → [`017`](017-assessment-content-sk.md)
2. ~~Implement Phase 1 shell~~ → registry + `/autopilot-test` + client scoring unlock (no API yet)
3. ~~Phase 2 persist~~ → `007` + `POST /api/assessment/submit` + captcha/rate limit
4. ~~Phase 3~~ → `assessment_email_unlocked` + CAPI Lead (`008`)
5. ~~Phase 4~~ → soft CTA Option A + pair blurbs + snapshot docs
6. **Operator:** run manual checklist `009` §20 (incl. mobile); set `FUNNEL_AUTOPILOT_MODE` when ready for test/prod traffic
7. **Product (later):** journey continuation proposals in [`020`](020-customer-journey.md) — separate from assessment v1 ops

*`010` + this brief remain binding for v1 decisions; `017` / `019` for Slovak UI and question wording; live strings in `src/config/assessmentAutopilot.js`.*
