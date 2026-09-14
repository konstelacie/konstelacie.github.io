# 000 — Constellation offer + “Mapa situácie” funnel (brainstorming)

**Status:** Historical chat capture. **Not a spec. Do not implement.**  
**Superseded in part by:** [`001-technical-foundation.md`](001-technical-foundation.md) (working brief). Use `001` for positioning vs Autopilot, form type, swappable offer, and “do not build yet.” This file keeps the longer offer pyramid and early funnel sketch.  
**Source:** External chat with a strategy agent, saved 2026-09.  
**Index:** [`README.md`](README.md)

---

## 1. What this is

Two nested ideas from the same conversation:

1. **Business architecture** for a constellation facilitator (konštelár) in Slovakia — recurring revenue without selling “another constellation every month.”
2. **Acquisition MVP** — Facebook/Instagram ads → short diagnostic LP (“Mapa situácie”) → result on email → first sale attempt → nurture.

The chat also recommended **not** starting with membership, courses, or a large program. Start with one paid process, then a cheap research-style funnel to bring people in.

---

## 2. Relation to this codebase

| Surface | Today | This idea |
|---------|--------|-----------|
| `/autopilot` | Shipped Life Autopilot Assessment (Likert, 4 scored dimensions, email unlock, nurture) | Different product. Autopilot docs (`006`, `021`) say constellations are a method, not the thing sold. |
| `pilot` / `manipulacia` | Video + booking | Different conversion (Stripe deposit vs diagnostic lead). |
| Assessment engine | One wired config (`assessmentAutopilot.js`); route/API always use it | A second *assessment-type* URL is possible, but this brainstormed form is **qualitative / branching**, not Autopilot-style scoring. Reuse is an open technical decision, not a given. |

**Do not** clone Autopilot questions or theme until offer identity is decided. Building a second funnel now would freeze copy and claims we have not designed.

---

## 3. Distilled business model (from the chat)

### 3.1 Positioning

- Do not sell “one session solves the problem.”
- Constellation = one method inside a process.
- Example path: topic (e.g. relationship) → intro + constellation → integration period → later conversation / follow-up / another constellation on a new layer.
- Do **not** promise therapeutic or medical effects that cannot be substantiated.
- Recurring should not mean “you need me every month.” Better frame: “You don’t have to need me, but there is a place you can return to.”

### 3.2 Full pyramid (later; not MVP)

| Layer | Sketch |
|-------|--------|
| Entry | Individual constellation or group workshop — low barrier, experience the work |
| Integration process | e.g. 3 contacts over 6–8 weeks: constellation → integration → follow-up. Sell the process, not the number of constellations |
| Longer program | 3–6 months on a domain (partnership, family/boundaries, parenting, work/money, life transitions). Constellation only when useful |
| Regular group | e.g. one evening / month; members need not each have their own constellation; possible monthly membership |
| Community / alumni | Integration meetings, thematic workshops — retention from belonging, not from inventing new problems |
| Premium individual | e.g. 6-month mentoring where constellations are one tool |

**“Konštelačný kruh” (economic sketch, not decided):** 15–25 members, monthly fee, 1 group session / month + integration call or material. Only some participants have their own constellation each month. Individual sessions remain premium. Predictable monthly income without pushing one person to constellation monthly.

Frequency of individual constellations should follow what is happening with the client; after intense work, leave room to integrate.

### 3.3 MVP offer (chat recommendation)

**Not** membership or a big program. One paid process using existing 1:1 online/offline skill:

**“Konštelácia + integrácia”** — 3 contacts over ~4–6 weeks, one concrete topic.

| Contact | Length | Timing | Role |
|---------|--------|--------|------|
| Constellation session | 90 min | start | Client brings a situation/question; individual constellation online or in person |
| Integration | 45–60 min | ~1–2 weeks later | Not automatically another constellation. What actually happened since: noticing, behaviour/relationship change, what stays open |
| Follow-up | 45–60 min | ~3–5 weeks later | Review original topic. Natural fork: close / continue integratively / open a new topic |

The third contact is the business point: you do not claim they need regular constellations; you look together whether further work makes sense.

**Price test (illustrative only):** if a single session is €80 today, three separate visits = €240; process might be offered at **€190–220**. Perfect price is not the MVP question. The question is:

> Are people willing to buy a several-week process instead of a single constellation?

First **10–15 clients**: do not change ten other things at once.

**Do not build yet (chat):** online course, app, membership area, many packages, monthly subscription.

**Simple path:** content / referral → short conversation or booking → Konštelácia + integrácia → close or next topic.

**Five numbers to watch:** how many were interested; how many bought the package; how many completed all three meetings; how many wanted to continue after; with what kind of topic they returned. The last one informs V2 — do not invent the recurring product at a desk.

### 3.4 V2 (only after MVP data)

If ~1/3–1/2 of graduates want to continue: **monthly integration circle** (e.g. 1× / month, 2–3 h, online/offline, **€25–40 / month**). Not everyone gets their own constellation. One or two pieces of work, representing, reflection, integration.

Then the pyramid becomes:

```
First contact
  → Konštelácia + integrácia (MVP product)
  → Monthly circle (recurring)
  → Individual session as needed
  → Thematic group workshops
```

Later: more circles or thematic programs without changing the core.

### 3.5 Research before even V2

Largest opportunity may be **past clients**. Chat: talk to ~10–20 former clients, not as a sale — what happened after the constellation, what was missing, did they want to return, when, would they want a follow-up meeting. From ~10 conversations, test whether “constellation + integration” is the right hypothesis. **Decide V2 only after that** (monthly group vs individual program vs something else).

Economics were offered next **if** we had: current 1:1 price, approx. clients / month, primary channel (online / offline / mix). Those numbers were **not** given in the saved chat.

---

## 4. Distilled acquisition funnel (from the chat)

Operator intent: FB ads + LP + simple form (what problem they have, etc.) + send results to email + first sale attempt + nurture if they don’t buy + keep qualitative insight on what people actually struggle with.

Chat: reasonable MVP funnel, but **not** “ad → quiz → buy a constellation.” The form itself should give a little value and do market research.

```
FB/IG ad → diagnostic LP → 5–8 questions → personalized result
  → email → offer first step → nurture → constellation / process
```

### 4.1 Ad does not sell constellations

People often don’t know what constellations are, or have prejudice. Speak to the **situation**, not the method.

Example:

> Je vo vašej rodine alebo vzťahoch situácia, ktorá sa napriek vašej snahe stále opakuje?

CTA: „Pozrieť sa na svoju situáciu → 3 minúty“

Captures people who know their problem, not people searching “rodinné konštelácie.”

### 4.2 LP = mini diagnostic (“Mapa situácie”)

Not a classic lead magnet (“download 7 tips”). The form **is** the free product.

Start e.g. „Čo sa vo vašom živote momentálne deje?“ then choose:

partnerstvo / rodičia / deti / širšia rodina / práca a peniaze / opakujúci sa životný problém / strata alebo odlúčenie / niečo iné

Then go deeper: how long; what have you already tried; what would you want to be different.

One high-value open question: „Keby ste to mali opísať vlastnými slovami, čo sa deje?“ — after ~100 answers, client vocabulary for ads, LP, products.

**Do not** pretend psychological diagnosis. Name e.g. **“Mapa vašej situácie”**, not a test or diagnosis.

### 4.3 Result has value without purchase

Do **not** interpret like “you are carrying your mother’s fate” — no data, too strong.

Factual recap instead: topic they want to explore is X; duration > 2 years; already tried Y; desired change was Z. Then: one way to look at this together is an individual constellation. Then first sale.

### 4.4 First offer experiment

| Variant | Offer |
|---------|--------|
| **A (chat prefers to test first)** | Individual constellation directly |
| B | Lower-risk intro meeting |

If LP + result already built trust, the extra step may be unnecessary. CTA sketch: „Chcem sa na svoju situáciu pozrieť individuálne → rezervovať konšteláciu.“

**Tension with §3.3:** business MVP is the **3-contact process**; funnel MVP tests selling a **single constellation**. Unresolved which offer sits on the result page for v1.

### 4.5 Email funnel (sketch only — no copy)

Lead is richer than name + email (topic, duration, what they tried, desired change). Segment by problem.

Example if they chose partnership:

| When | Theme |
|------|--------|
| Email 0 (immediate) | Their result + option to book |
| ~2 days | Why some relationship situations repeat |
| ~4 days | Anonymized example of work on a similar topic |
| ~7 days | How an individual constellation actually goes |
| later | Objections (family history? I don’t know constellations? online vs in person?) |
| last | Offer the meeting again |

Evergreen acquisition funnel. **Copy not written.**

### 4.6 After 2–3 months (research payoff)

If ~300 people complete the form, you may see mix of topics **and** which segments actually buy. Then ads/LP/emails can be specific (e.g. repeating relationship type) instead of generic “family constellations.”

### 4.7 Funnel MVP cut

Chat: you do **not** need complex personalized results at the start.

> 1 ad campaign + 1 LP + 1 form (~7 questions) + 1 result page + 5 emails + 1 product

First goal e.g. **100 completed forms**, not max revenue. Ad spend is also customer research.

### 4.8 Consent / data (non-negotiable even in MVP)

Answers may be very personal. Need proper processing consent and a **separate** marketing-communication consent. Intentionally **do not** collect health details or identifiable data about other family members.

---

## 5. What the next chat offered (not done)

Draft **7–10 exact questions**, form branching, and a **result algorithm** so the same artefact is lead magnet + email segmentation + market research. Called “the core of the whole funnel.” **Not produced in the saved thread.**

---

## 6. Open decisions (must decide before any build)

**Update:** [`001`](001-technical-foundation.md) §13 closes Autopilot-as-positioning, qualitative Map (not Likert clone), and swappable CTA/offer. Remaining blockers are the Map design (`001` §12) plus name/URL, v1 offer choice, economics, and legal copy.

Until the Map design exists, do not add a funnel instance, questionnaire config, or ads.

### Identity and overlap

- [ ] Is this a **second offer on citimtedasom.sk**, a **pivot** away from Autopilot, or a **separate brand/URL**?
- [ ] How do we speak about constellations here vs Autopilot (“method, not the product”)? Same visitor seeing both is a positioning conflict if unresolved.
- [ ] Internal funnel name (English, for code) and public URL (Slovak OK). Candidates not chosen.

### Offer on the result / first purchase

- [ ] Result CTA: **single constellation (A)**, **intro call (B)**, or **Konštelácia + integrácia package**?
- [ ] Current 1:1 session price (chat assumed €80 only as example).
- [ ] Approx. clients / month today; capacity for a 3-contact process.
- [ ] Primary delivery: **online / offline / mix** (operator has experience with all three).
- [ ] Booking: reuse existing Stripe/slot booking, mailto, or waitlist?

### Form (“Mapa situácie”)

- [ ] Exact **7–10 questions**, types, and branching — not designed.
- [ ] Result rules: recap-only vs light guidance; **no** diagnostic/fate claims.
- [ ] Open-text field: stored how, shown how in admin, used how in ads (anonymization).
- [ ] Likert/scoring Autopilot clone vs **qualitative wizard** (chat describes the latter). Engine reuse vs new flow.
- [ ] Theme: new visual vs Autopilot skin with different colors. No theme chosen.

### Email / ads

- [ ] 5-email copy and whether v1 is **one universal sequence** or already segmented by topic.
- [ ] First ad angle and creative (situation vs method).
- [ ] Goal for v1: **100 form completions** vs also a conversion target.

### Research vs build order

- [ ] Interview **10–20 past clients** before building the LP, or build the funnel in parallel?
- [ ] Is past-client outreach in scope for this site (manual) or a product feature?

### Legal / claims

- [ ] Marketing consent copy; what is stored; retention.
- [ ] Explicit ban-list: health, third-party identities, therapeutic promises.
- [ ] Privacy policy updates if a new form collects extra categories of data.

### Success metrics (proposed, not locked)

Interest → package (or session) purchase → 3-contact completion → continue rate → returning topic type.

---

## 7. Explicitly out of scope for now

- Membership site, course, app, monthly subscription
- Konštelačný kruh / alumni community
- Multiple packages and thematic LPs (those come after segment data)
- Cloning Autopilot scoring, bottleneck copy, or nurture emails onto this funnel
- New DB tables until the form schema is decided (existing `assessment_submissions.funnel_name` may or may not fit)

---

## 8. If this is later built — smallest technical first step

Only after §6 identity + offer + form shape are decided:

1. Confirm whether the flow is still `assessment` page type or a **new** page type (qualitative map).
2. If assessment-type: add `funnelName → config` lookup so Autopilot is not silently reused (`funnels.js` + `assessmentService.js` today always load `assessmentAutopilot`).
3. New instance: view, `FUNNEL_PAGE_INSTANCES`, `FUNNEL_{NAME}_MODE`, never sitemap (`docs/PAGE-VISIBILITY.md`).
4. Theme via scoped CSS tokens; questions/results in a dedicated config file.
5. Nurture: **new** sequence or none — do not send Autopilot emails.

That wiring is cheap. **Content, claims, and form type are the real work** and are still missing.

---

## 9. Suggested next conversation (human)

1. Resolve Autopilot vs constellation identity (same site or not).
2. Pick the **v1 paid offer** on the result page (A / B / process package).
3. Give current price, volume, online/offline mix — or skip economics.
4. Decide research-first (past-client calls) vs funnel-first (100 maps).
5. Only then: 7–10 questions, branching, recap algorithm, consent copy.
