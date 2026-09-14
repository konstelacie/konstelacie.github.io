# 002 — Mapa situácie v0 (validation prototype)

**Status:** Implemented as internal prototype. **Not** a public ad launch.  
**Funnel:** `mapa` · test URL `/mapa-test` when `FUNNEL_MAPA_MODE=test` · prod `/mapa`  
**Index:** [`README.md`](README.md)

Working copy lives in `src/config/situationMap.js`. Prefer the config when docs and code disagree on wording.

---

## Flow

```
Intro → Q1–Q8 (one screen each) → name + email → deterministic recap
```

No scoring, no AI, no paid offer in the Map core. Result page includes an empty `#situation-map-offer` slot for a later CTA component.

Q8 is `experimental: true` / `enabled: true` in config. Set `enabled: false` to drop it without a DB migration (`perceived_barrier` is nullable).

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
4. Walk Q1–Q8, back-edit, submit email, read recap

Next: content/UX testing on model situations — not ads.
