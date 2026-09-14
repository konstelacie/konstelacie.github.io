# 001 — Working brief: Mapa situácie (acquisition funnel)

**Status:** Design / validation. **Not a build spec.** Do **not** implement the Map, a new funnel instance, or schema from this file.  
**Source:** Strategy-agent technical foundation (2026-09), recorded after [`000`](000-brainstorming.md).  
**Index:** [`README.md`](README.md)  
**Next product step:** design the Map itself (§12). That design becomes the technical spec.

No code was added with this document. A shell without questions, data model, or funnel name would freeze the wrong shape.

---

## 1. Autopilot in this project

On **citimtedasom.sk** the Life Autopilot Assessment already exists in **code** (`/autopilot`, default `FUNNEL_AUTOPILOT_MODE=hidden` in `.env.example`). Likert 24, four scored dimensions, email unlock, result page, nurture.

For **this** funnel:

- Do **not** treat Autopilot as a live product we must position against.
- Its value here is **infrastructure and patterns** we may reuse.
- We are **not** bound to its questions, Likert model, scoring, four dimensions, positioning, UX flow, or result copy.
- The new funnel may use a completely different logic.

Code fact (not a market claim): Autopilot v1 is shipped and can be turned on with env; mid-funnel anonymous events were never wired (`docs/leads/assessment-conversion-events.md`). Whether production ads ever ran is an operator fact, not something the repo proves.

**Do not** implement Map content or logic by cloning Autopilot.

---

## 2. Business context (accepted)

Operator experience: individual online and offline sessions, offline group work, family/systemic constellations.

Do not communicate constellation as “one session that solves the problem.” Working philosophy: constellation is a **method inside a broader process** with one concrete life situation.

No unsubstantiated therapeutic, diagnostic, or medical claims.

---

## 3. What we are testing

New acquisition funnel based on the user’s **situation/problem**, not primarily on promoting the constellation method.

Working funnel:

```
FB/IG ad → LP → Mapa situácie → email → personalized result → offer → email nurture
```

People arrive because they have a situation in life, family, or relationships. They need not be searching for “rodinné konštelácie.” Constellation work is **not hidden**: the funnel should be transparent about how the author works with clients.

---

## 4. Mapa situácie

Working name of the free product: **Mapa situácie**.

It is **not**: psychological diagnosis, clinical test, personality test, or Autopilot-style scored test.

It **is**: a short **qualitative** self-assessment. Roughly **6–10 questions** — count not fixed.

Three jobs at once:

| | Role |
|--|------|
| **A. Value** | Help the user name and structure the situation they are in |
| **B. Qualify / segment** | Area, duration, what they already tried, desired change, plus fields still to be designed |
| **C. Market research** | What problems people bring, in what language; which segments complete the Map, show paid interest, and buy |

Answers must be analyzable **by field / segment** later (not only as an opaque blob).

---

## 5. Open text

Expect at least one open question (e.g. “Ako by ste vlastnými slovami opísali, čo sa momentálne deje?”).

Purpose: help them formulate the situation; context for the result; qualitative research; natural client language.

Content may be highly personal. Do **not** prompt for: health data, diagnoses, identifiable data about other people, or unnecessarily detailed sensitive information.

Exact privacy / retention rules: **not specified yet**.

---

## 6. Result

Must **not** diagnose the cause. Ban examples: carrying the mother’s fate; problem because of the father; “your family has this systemic issue.”

Default logic: **structured reflection of what the user already said** (area, duration, tried, desired change). Light guidance may come later — still without diagnostic or fate claims.

**Result algorithm does not exist yet.** It is part of the next design phase.

---

## 7. Email

Assumed path: **Map → email → result** (unlock / delivery, similar pattern to existing assessment submit). Then optional nurture.

Distinguish:

- processing needed to **deliver** the Map/result,
- **marketing** email.

Legal copy: **not specified yet**.

---

## 8. Paid offer — do not lock in implementation

Business hypothesis remains **Konštelácia + integrácia** (90 min constellation → 45–60 min integration ~1–2 weeks later → 45–60 min follow-up ~3–5 weeks; ~4–6 weeks; one topic). Details in [`000`](000-brainstorming.md) §3.3.

**Do not** implement the Map as hard-wired to that product only. The Map is a relatively stable acquisition/research asset; the paid offer behind it must be **swappable**.

v1 may test **A** individual constellation or **B** the process — or change again. **CTA / offer layer is a separate layer** from Map + result.

---

## 9. Do not build in this phase

Membership, monthly constellation circle, community, alumni, online course, member area, many packages, recurring subscription, a CRM just for this experiment.

Validate acquisition + Map + first paid offer first.

---

## 10. Architecture to keep possible (no over-engineering)

Logical pipeline:

```
Traffic source / campaign
  → Map
  → answers
  → lead / email
  → result
  → offer / CTA
  → purchase / conversion
```

Desired analysis (event names not locked):

- ad → Map started
- started → completed
- completed → email
- email → result viewed
- result → CTA click
- CTA → purchase

and **topic → conversion rate** (e.g. partnership vs parents). That analysis is a main reason to build the Map.

### Codebase constraints (when we do build)

These are facts, not a schema proposal:

| Piece | Today | Implication for Map |
|-------|--------|---------------------|
| Funnel pages | Registry + `FUNNEL_{NAME}_MODE`; never sitemap | Need an English instance name + env when building; not chosen |
| Assessment submit | Always `assessmentAutopilot` questions/scoring | Do **not** extend that path for Map answers |
| `assessment_submissions` | Requires `scores_json`, `primary_bottleneck`, `secondary_bottleneck` | Poor fit for a qualitative Map; likely a **new** table after the data model exists |
| `lead_events` | `email` is **NOT NULL** | Pre-email steps (started, completed) need a **different** mechanism or a later schema change — Autopilot deferred this. Do not invent anonymous beacons before §12 lists events |
| Campaign | `?campaign=` on funnels | Reuse for traffic source when the instance exists |
| Consent | Assessment optional marketing checkbox + nurture | Keep delivery vs marketing separate for Map too |
| Offer | Autopilot mailto CTA is in result copy | Map should keep offer as a **config/layer**, not baked into result generation |

Reuse **patterns** (visibility, captcha/rate-limit on submit, campaign id, consent split). Do **not** reuse Autopilot config, scoring, bottleneck copy, or nurture sequence.

---

## 11. MVP principle

Not optimizing for scale. First validation meta: on the order of **100 completed Maps**.

Want: funnel behaviour, qualitative answers, first conversion data, input for later product/segment/ads decisions.

---

## 12. Next product step (blocks implementation)

Before any implementation, design **Mapa situácie**. That design must include:

1. Exact questions  
2. Type of each question  
3. Answer options  
4. Required vs optional  
5. Branching  
6. Which values to store as segments  
7. Open-text fields  
8. Data model needed for the result  
9. Rules / algorithm to assemble the result  
10. Events needed for funnel analytics  

**That** document is the basis of a technical spec.

Until it exists: no Map UI, no submit API, no new migration, no funnel registry row, no offer wiring.

---

## 13. Decisions closed here vs still open

**Closed for this funnel (supersedes the same items in `000` §6):**

- Autopilot is **infra to borrow**, not a positioning constraint.
- Form is a **qualitative Map**, not a Likert clone.
- Offer is **not** locked to Konštelácia + integrácia in the Map implementation; CTA is a separate layer.
- Path is **Map → email → result**, then nurture.
- No membership / circle / course in this phase.
- Do not start from Autopilot content.

**Still open (needed in the Map design or soon after):**

- Exact questions, types, branching, segments, result algorithm (§12).
- Internal funnel name, public URL, visual theme.
- v1 offer on the CTA layer (A vs B vs later).
- Session price, volume, online/offline mix (economics).
- Privacy / retention / consent copy.
- Whether v1 nurture is one sequence or already segmented.
- How to record pre-email funnel steps given `lead_events.email` NOT NULL.
