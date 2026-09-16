# 002 — Mapa situácie v0 (validation prototype)

**Status:** Implemented as internal prototype (v0.1 UX/analytics/offer-slot). **Not** a public ad launch.  
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

1. `Q1` topic — oblasť — **single-select, auto-advance** (`iné` still needs the extra field + Pokračovať)
2. `Q3` situationType — **single-select, auto-advance**
3. `Q4` duration — **single-select, auto-advance**
4. `Q5` peopleInvolved — **multi-select, Pokračovať**
5. `Q2` situationDescription — textarea; Pokračovať + quieter **Preskočiť**; help is on-screen microcopy, not an extra step
6. `Q6` attempts — **multi-select, Pokračovať**
7. `Q7` desiredChange — textarea; same skip UI as Q2
8. `Q8` perceivedBarrier — **single-select, auto-advance** (`experimental: true` / `enabled: true`; `enabled: false` drops it without a migration)

Q1 is method-agnostic intake (not a “čo sú konštelácie” test). Current `topic` codes for **new** submissions:

`relationship` · `family` · `children_parenting` · `work_business` · `money_finance` · `health_physical` · `loss_change_decision` · `recurring` · `other`

Retired codes stay on historical rows (`parents`, `children`, `extended_family`, `work_money`, `loss_change`). Recap/admin resolve them via `retiredOptions` in config. **No DB rewrite.** Health, work, money, and the other new categories do **not** branch — same Q2–Q8, no medical questionnaire, no extra scoring, no constellation recommendation. Recap shows only the chosen human label.

Join path for analysis is unchanged: `topic` on `situation_map_submissions` ↔ `situation_map_events` (`questionId = Q1`) via `session_id` / `submission_id`. Compare e.g. `topic × map_completed × personal_response_sent` (and later paid conversion) without a new analytics system.

Progress is **Krok X z 8**. Back keeps the previous answer and leaves it editable. No quote/info interstitial.

`map_question_answered` is written **before** the auto-advance animation/navigation so a fast tap does not drop the event.

Open text is a **soft requirement**: Pokračovať still expects a few sentences. Skip does **not** label the field optional. Empty skip stores `''` in `situation_description` / `desired_change` (columns stay NOT NULL). Event `map_question_skipped` + `questionId` (`Q2` vs `Q7`) is how to measure skip rate after ~30–50 completions.

No scoring, no AI, no paid offer in the Map core. Result page has a **generic nullable offer slot**: `offer = null` (or `enabled: false`) renders nothing; a later A/B/C config object can appear **below** the full recap + disclaimer without changing Map answers.

---

## Offer layer (prepared, not on)

Offer is a separate layer from the Map submission. Do **not** store `recommended_product` (or similar) on `situation_map_submissions`.

Config shape (`src/config/situationMap.js`): `id`, `variant`, `headline`, `body`, `ctaLabel`, `ctaUrl`, optional `price`, `enabled`.

When an offer is enabled, client fires `offer_viewed` / `offer_clicked` with `offerId`, `offerVariant`, campaign. `offer_converted` is an allowed event type for later — **not** wired, until conversion means booking, intro call, or purchase.

Join path for analysis: Map answers (e.g. `topic`) ↔ `situation_map_events` via `session_id` (and `submission_id` after email).

---

## Consent & email

Marketing consent is a snapshot on the submission row, **not** implied by capturing email:

- `marketing_consent` true/false
- `marketing_consent_at` (set only when granted)
- `marketing_consent_version` (checkbox copy version, stored even if unchecked)

v0.1 does **not** enroll nurture, send a result email, or create a permanent result link (access/token model is still open).

---

## Files

| Piece | Path |
|-------|------|
| Config / wording | `src/config/situationMap.js` |
| Recap | `src/lib/situationMapRecap.js` |
| Analytics allowlist | `src/lib/situationMapAnalytics.js` |
| Page | `src/views/funnels/mapa.ejs` |
| Client | `public/assets/js/situation-map.js`, `public/assets/css/situation-map.css` (plus `assessment.css` tokens) |
| API | `POST /api/situation-map/submit`, `POST /api/situation-map/event` |
| DB | migrations `010`, `011`, `012` — submissions, events, responses |
| Lead KPI | `situation_map_email_submitted` (email required; pre-email steps live in `situation_map_events`) |

---

## Local check

1. `FUNNEL_MAPA_MODE=test` in `.env`
2. `yarn db:migrate`
3. Open `/mapa-test`
4. Walk all 8 screens (open text is step 5): auto-advance on Q1/Q3/Q4/Q8, Pokračovať on Q5/Q6, skip Q2 once, back-edit, skip Q7, submit email, read recap without empty quotes and **without** an offer block

Web analytics must not include Q2/Q7 textarea content, name, or email — only `questionId`, `stepNumber`, `answered`, optional `answerLengthBucket`.

Result page copy (`resultPage` in config) now also acknowledges receipt and a pending personal response. Offer stays off. Human review: [`003-personal-response-v1.md`](003-personal-response-v1.md).

Next: content/UX testing on model situations — not ads, not a concrete paid product, not checkout/nurture.
