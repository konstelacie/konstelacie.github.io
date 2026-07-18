# 019 — Life Autopilot Assessment — Question Wording Refactor (v1.1)

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

**Decision:** Keep.

Already situational, recognizable, and non-moralizing. Minor synonym (`posledným` / `uplynulým`) would not improve UX enough to justify churn.

**New:** unchanged

---

#### A02 — Intentionality

**Original**

> Väčšina mojich dní sa odvíja skôr od povinností než od vedomých rozhodnutí.

**Decision:** Rewrite.

“Vedomé rozhodnutia” hints at a preferred answer. Shift to describing what actually drives the week.

**New**

> Môj týždeň väčšinou určuje to, čo práve treba vybaviť.

---

#### A03 — Reflection

**Original**

> Len zriedka sa zastavím a premýšľam, či mi môj súčasný spôsob života naozaj vyhovuje.

**Decision:** Rewrite.

More behavioral pause; less self-evaluation tone; avoid stacking “deň”.

**New**

> Len málokedy si počas týždňa nájdem chvíľu, aby som sa spýtal, či mi môj spôsob života stále sedí.

---

#### A04 — Reactivity

**Original**

> Počas dňa väčšinou riešim to, čo práve prichádza, namiesto toho, aby som určoval smer ja.

**Decision:** Rewrite.

The contrast “aby som určoval smer ja” moralizes. Keep pure reactivity in a workday situation.

**New**

> Ľahko sa stane, že celý pracovný deň len reagujem na to, čo práve príde.

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

**Decision:** Light edit.

Opening variety (“Keď…”) while keeping the same automatic reach for task/distraction.

**New**

> Keď mám chvíľu voľna, automaticky siaham po ďalšej úlohe alebo rozptýlení.

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

**Decision:** Keep.

Already situational and clear.

**New:** unchanged

---

#### I04 — Boundaries

**Original**

> Keď sa ma niekto opýta, čo chcem ja, často najskôr premýšľam nad potrebami ostatných.

**Decision:** Light edit.

More behavioral (“prebehnem”) without changing the priority-of-others pattern.

**New**

> Keď sa ma niekto opýta, čo chcem ja, najprv prebehnem, čo potrebujú ostatní.

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

**Decision:** Keep.

Behavioral, clear, good length contrast after longer items.

**New:** unchanged

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

“Než by som potreboval” leans normative; re-anchor in morning + usual rhythm.

**New**

> Ráno sa niekedy zobudím s pocitom, že energie je menej, než si bežný rytmus žiada.

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

**Decision:** Keep.

Situational and recognizable.

**New:** unchanged

---

#### R02 — Connection

**Original**

> Väčšina našich rozhovorov sa točí okolo povinností a organizovania bežného života.

**Decision:** Light edit.

Situational opening; same logistics-over-connection pattern.

**New**

> Keď sa rozprávame, väčšinou riešime povinnosti a organizáciu bežného života.

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

“Prítomný” leans abstract; describe the behavior (mind elsewhere).

**New**

> Aj keď trávim čas s blízkymi, niekedy som myšlienkami inde.

---

## Summary of changes

| ID | Change |
| --- | --- |
| A01 | unchanged |
| A02 | rewritten |
| A03 | rewritten |
| A04 | rewritten |
| A05 | rewritten *(reverse)* |
| A06 | light edit |
| I01 | light edit |
| I02 | light edit |
| I03 | unchanged |
| I04 | light edit |
| I05 | rewritten *(reverse)* |
| I06 | unchanged |
| E01 | unchanged |
| E02 | rewritten |
| E03 | light edit |
| E04 | unchanged |
| E05 | unchanged *(reverse)* |
| E06 | light edit *(reverse)* |
| R01 | unchanged |
| R02 | light edit |
| R03 | unchanged |
| R04 | unchanged |
| R05 | light edit *(reverse)* |
| R06 | rewritten |

**Unchanged:** 9 · **Light edit:** 8 · **Rewritten:** 7

---

## Rhythm check (sequence openings)

Approximate opening variety across the 24 items:

Keď… · Môj… · Len… · Ľahko… · To, čomu… · Keď… · Keď… · Oddych… · Keď… · Keď… · Aj bez… · Často… · Aj keď… · Ráno… · Aj drobné… · Veci… · Po… · Mám pocit… · Pri… · Keď… · O tom… · Je pre mňa… · Ľudia… · Aj keď…

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
