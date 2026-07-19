# 019 — Life Autopilot Assessment — Question Wording Refactor (v1.1)

**Status:** Wording v1.1 — formulation source for question text (structure stays in `011`)  
**Entry:** [`016`](016-assessment-v1-summary.md) · [`README`](README.md)  
**Live copy:** `src/config/assessmentAutopilot.js` (prefer config if drift)

## Purpose

Improve the **user experience and psychological quality** of all 24 assessment questions.

This document does **not** change:

* question IDs
* dimension mapping
* reverse-scoring flags
* scoring algorithm
* what each question measures

It changes **formulation only**.

Source of truth for structure remains [`011-questionaire.md`](011-questionaire.md).  
Experience principles: [`018-experience.md`](018-experience.md).

---

## Goals

1. Prefer **behavior** over self-judgment (“what I do” > “what I think about myself”).
2. Avoid **moralizing** cues (no implied “correct” life: vedomé rozhodnutia, správne priority, mal by som…).
3. Vary **openings** so the sequence does not feel templated.
4. Reduce repetition of the word **deň / dni**.
5. Alternate **short / medium / longer** items for a natural rhythm.
6. Prefer **situational** anchors when they fit the construct.
7. Keep language simple, calm, non-therapeutic, non-esoteric.

---

## Compatibility

| Field | Unchanged |
| --- | --- |
| `id` | A01–A06, I01–I06, E01–E06, R01–R06 |
| `dimensionId` | autopilot / identity / energy / relationships |
| `order` | 1–24 |
| `reverseScored` | A05, I05, E05, E06, R05 |

Production copy lives in `src/config/assessmentAutopilot.js` (synced with this doc and `011`).

---

## Question-by-question

For each item: construct → original → decision → new text (if changed).

---

### Dimension 1 — Autopilot

#### A01 — Presence

**Original**

> Keď sa obzriem za uplynulým týždňom, veľa dní mi splýva do jedného.

**Decision:** Light edit.

Shorter, more natural spoken rhythm; same week-blur construct.

**New**

> Keď sa obzriem za posledným týždňom, jednotlivé dni mi často splývajú.

---

#### A02 — Intentionality

**Original**

> Väčšina mojich dní sa odvíja skôr od povinností než od vedomých rozhodnutí.

**Decision:** Rewrite.

“Vedomé rozhodnutia” hints at a preferred answer. Describe what actually fills the day.

**New**

> Väčšinu dňa riešim to, čo práve treba vybaviť.

---

#### A03 — Reflection

**Original**

> Len zriedka sa zastavím a premýšľam, či mi môj súčasný spôsob života naozaj vyhovuje.

**Decision:** Rewrite.

Behavioral pause only — drop the self-evaluation clause; shorter item.

**New**

> Len zriedka sa počas bežného týždňa na chvíľu zastavím.

---

#### A04 — Reactivity

**Original**

> Počas dňa väčšinou riešim to, čo práve prichádza, namiesto toho, aby som určoval smer ja.

**Decision:** Rewrite.

The contrast “aby som určoval smer ja” moralizes. Keep the sense that circumstances drive the day.

**New**

> Často mám pocit, že môj deň riadia okolnosti viac než ja.

---

#### A05 — Intentional Living *(reverse)*

**Original**

> Mám pocit, že moje bežné dni odrážajú to, na čom mi skutočne záleží.

**Decision:** Rewrite.

More observable (time allocation) than feeling-based self-rating; less “deň”.

**New**

> To, čomu v bežnom týždni venujem čas, zodpovedá tomu, na čom mi naozaj záleží.

---

#### A06 — Awareness

**Original**

> Aj keď mám chvíľu pre seba, automaticky siaham po ďalšej úlohe alebo rozptýlení.

**Decision:** Rewrite.

Automatic fill of spare moments without naming a specific device or task.

**New**

> Keď mám chvíľu pre seba, automaticky siahnem po niečom, čo ma zamestná.

---

### Dimension 2 — Identity

#### I01 — Responsibility

**Original**

> Keď sa niečo pokazí, často mám pocit, že je mojou úlohou to vyriešiť.

**Decision:** Light edit.

Slightly more natural; same meaning.

**New**

> Keď sa niečo pokazí, často mám pocit, že to mám vyriešiť ja.

---

#### I02 — Achievement

**Original**

> Mám problém oddychovať, pokiaľ nemám pocit, že som si oddych zaslúžil.

**Decision:** Light edit.

Shorter, more spoken; same earned-rest construct.

**New**

> Oddych mi ide ťažko, kým nemám pocit, že som si ho zaslúžil.

---

#### I03 — External validation

**Original**

> Keď sa mi dlhšie nič výrazné nepodarí, začnem pochybovať sám o sebe.

**Decision:** Light edit.

Shorter; drop “výrazné” and “sám” without changing the self-doubt-after-stagnation construct.

**New**

> Keď sa mi dlhšie nedarí, začnem pochybovať o sebe.

---

#### I04 — Boundaries

**Original**

> Keď sa ma niekto opýta, čo chcem ja, často najskôr premýšľam nad potrebami ostatných.

**Decision:** Rewrite.

Decision moment; loss of own preference when others are in view — not only “others first.”

**New**

> Keď sa rozhodujem, čo chcem ja, niekedy ani neviem, čo by som si vybral bez ohľadu na ostatných.

---

#### I05 — Self-worth *(reverse)*

**Original**

> Aj bez neustálej produktivity mám pocit, že moja hodnota zostáva rovnaká.

**Decision:** Rewrite.

Avoid the abstract word “produktivita”; keep worth-independent-of-output.

**New**

> Aj bez toho, aby som stále niečo stíhal, mám pocit, že moja hodnota ostáva rovnaká.

---

#### I06 — Perfectionism

**Original**

> Často odkladám dokončenie vecí, pretože ešte nie sú podľa mojich predstáv.

**Decision:** Rewrite.

Rumination after falling short of standards — not only postponing completion.

**New**

> Keď niečo neurobím podľa svojich predstáv, dlho mi to ostáva v hlave.

---

### Dimension 3 — Energy

#### E01 — Recovery

**Original**

> Aj keď mám konečne voľný večer, trvá mi dlho, kým sa naozaj uvoľním.

**Decision:** Keep.

Strong situational item.

**New:** unchanged

---

#### E02 — Capacity

**Original**

> Už ráno mám niekedy pocit, že mám menej energie, než by som potreboval na celý deň.

**Decision:** Rewrite.

Shorter morning fatigue signal; avoid normative “než by som potreboval”.

**New**

> Ráno sa často zobudím unavenejší, než by som čakal.

---

#### E03 — Mental fatigue

**Original**

> Aj malé rozhodnutia ma občas vyčerpávajú viac než kedysi.

**Decision:** Light edit.

Shorter punch after the longer E02; same fatigue construct.

**New**

> Aj drobné rozhodnutia ma dnes unavia viac než kedysi.

---

#### E04 — Motivation

**Original**

> Veci, ktoré ma kedysi tešili, robím dnes skôr zo zvyku.

**Decision:** Keep.

Short, behavioral, already excellent.

**New:** unchanged

---

#### E05 — Recovery *(reverse)*

**Original**

> Po kvalitnom oddychu sa väčšinou cítim pripravený na nové výzvy.

**Decision:** Keep.

Clear reverse item; no moral pressure.

**New:** unchanged

---

#### E06 — Sustainable pace *(reverse)*

**Original**

> Mám pocit, že moje tempo života je dlhodobo udržateľné.

**Decision:** Light edit.

More natural spoken Slovak; same sustainability construct.

**New**

> Mám pocit, že tempo, akým žijem, zvládnem aj dlhodobo.

---

### Dimension 4 — Relationships

#### R01 — Presence

**Original**

> Pri rozhovoroch s blízkymi často myslím na to, čo ešte musím urobiť.

**Decision:** Rewrite.

Shared time without connection — less about thoughts during talk, more about missed bonding.

**New**

> Stáva sa mi, že čas s blízkymi ubehne bez toho, aby sme sa naozaj spojili.

---

#### R02 — Connection

**Original**

> Väčšina našich rozhovorov sa točí okolo povinností a organizovania bežného života.

**Decision:** Rewrite.

Mind elsewhere while with people who matter — presence gap over logistics talk.

**New**

> Aj keď som s ľuďmi, na ktorých mi záleží, myšlienkami bývam často pri tom, čo ešte musím urobiť.

---

#### R03 — Vulnerability

**Original**

> O tom, ako sa naozaj cítim, hovorím len zriedka.

**Decision:** Keep.

Short, clear; good rhythm.

**New:** unchanged

---

#### R04 — Reciprocity

**Original**

> Je pre mňa jednoduchšie pomáhať druhým, než požiadať o pomoc.

**Decision:** Keep.

Already behavioral and balanced.

**New:** unchanged

---

#### R05 — Communication *(reverse)*

**Original**

> Cítim, že ľudia, na ktorých mi záleží, skutočne vedia, čo prežívam.

**Decision:** Light edit.

Drop “Cítim, že” for a cleaner reverse statement; same meaning.

**New**

> Ľudia, na ktorých mi záleží, skutočne vedia, čo prežívam.

---

#### R06 — Emotional attention

**Original**

> Aj keď trávim čas s blízkymi, niekedy mám pocit, že tam nie som úplne prítomný.

**Decision:** Rewrite.

Deferred outreach to people who matter — concrete postponement, not abstract presence.

**New**

> Často odkladám, že sa ozvem ľuďom, na ktorých mi záleží.

---

## Summary of changes

| ID | Change |
| --- | --- |
| A01 | light edit |
| A02 | rewritten |
| A03 | rewritten |
| A04 | rewritten |
| A05 | rewritten *(reverse)* |
| A06 | rewritten |
| I01 | light edit |
| I02 | light edit |
| I03 | light edit |
| I04 | rewritten |
| I05 | rewritten *(reverse)* |
| I06 | rewritten |
| E01 | unchanged |
| E02 | rewritten |
| E03 | light edit |
| E04 | unchanged |
| E05 | unchanged *(reverse)* |
| E06 | light edit *(reverse)* |
| R01 | rewritten |
| R02 | rewritten |
| R03 | unchanged |
| R04 | unchanged |
| R05 | light edit *(reverse)* |
| R06 | rewritten |

**Unchanged:** 4 · **Light edit:** 7 · **Rewritten:** 13

---

## Rhythm check (sequence openings)

Approximate opening variety across the 24 items:

Keď… · Väčšinu… · Len… · Často… · To, čomu… · Keď… · Keď… · Oddych… · Keď… · Keď… · Aj bez… · Keď… · Aj keď… · Ráno… · Aj drobné… · Veci… · Po… · Mám pocit… · Stáva sa… · Aj keď… · O tom… · Je pre mňa… · Ľudia… · Často…

---

## Context prompts

`contextPrompt` for A03 updated to match the week/rhythm framing:

> Keď sa zamyslíte nad svojím bežným rytmom…

Other prompts remain valid with the new wording. No scoring impact.

---

## Out of scope

* Micro-insight copy
* Result / bottleneck texts
* Likert labels
* Scoring or tie-break rules
* Dimension labels shown to users
