# 002 — Mapa situácie v0 (validation prototype)

**Status:** Implemented as internal prototype. **Not** a public ad launch.  
**Funnel:** `mapa` · test URL `/mapa-test` when `FUNNEL_MAPA_MODE=test` · prod `/mapa`  
**Index:** [`README.md`](README.md)

Working copy lives in `src/config/situationMap.js`. Prefer the config when docs and code disagree on wording.

---

## Flow

```
Intro → 8 screens (config order) → name + email → deterministic recap
```

Question **ids** (`Q1`…`Q8`) are stable analytics identities, not screen numbers. Semantic answer keys (`topic`, `situationDescription`, …) and DB columns are unchanged.

Current screen order:

1. `Q1` topic — oblasť
2. `Q3` situationType — jedna situácia / opakuje sa
3. `Q4` duration — ako dlho
4. `Q5` peopleInvolved — koho sa týka
5. `Q2` situationDescription — otvorený text (po jednoduchých klikoch); **soft skip** (`Radšej preskočím`)
6. `Q6` attempts — čo už skúšal/a
7. `Q7` desiredChange — čo by malo byť inak; **soft skip** (same UI, skip tracked separately)
8. `Q8` perceivedBarrier — prekážka (`experimental: true` / `enabled: true`; `enabled: false` drops it without a migration)

Single-choice screens auto-advance on tap (except **iné**, which still needs the extra field + Pokračovať). Multi and open text keep Pokračovať.

Open text is a **soft requirement**: Pokračovať still expects a few sentences. Skip is quieter, below the CTA, and does **not** label the field optional. Empty skip stores `''` in `situation_description` / `desired_change` (columns stay NOT NULL). Event `map_question_skipped` + `questionId` (`Q2` vs `Q7`) is how to measure skip rate after ~30–50 completions — not a guess in the UI.

No scoring, no AI, no paid offer in the Map core. Result page includes an empty `#situation-map-offer` slot for a later CTA component.

---

## Files

| Piece | Path |
|-------|------|
| Config / wording | `src/config/situationMap.js` |
| Recap | `src/lib/situationMapRecap.js` |
| Page | `src/views/funnels/mapa.ejs` |
| Client | `public/assets/js/situation-map.js`, `public/assets/css/situation-map.css` (plus `assessment.css` tokens) |
| API | `POST /api/situation-map/submit`, `POST /api/situation-map/event` |
| DB | migration `010_situation_map.sql` — `situation_map_submissions`, `situation_map_events` |
| Lead KPI | `situation_map_email_submitted` (email required; pre-email steps live in `situation_map_events`) |

Marketing consent is stored on the submission row only. v0 does **not** enroll Autopilot nurture or send a result email.

---

## Local check

1. `FUNNEL_MAPA_MODE=test` in `.env`
2. `yarn db:migrate`
3. Open `/mapa-test`
4. Walk all 8 screens (open text is step 5), skip Q2 once, back-edit, skip Q7, submit email, read recap without empty quotes

Next: content/UX testing on model situations — not ads.
