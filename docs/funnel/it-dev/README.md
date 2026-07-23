# Life Autopilot Assessment — docs index

**Start here:** [`016-assessment-v1-summary.md`](016-assessment-v1-summary.md)

**Live copy / structure in code:** `src/config/assessmentAutopilot.js`  
When docs and config disagree on shipped strings, **prefer the config** and update the docs.

## Active (v1 shipped)

| Doc | Role |
|-----|------|
| [`016`](016-assessment-v1-summary.md) | Canonical entry — decisions map, drift, DoD |
| [`009`](009-questionnaire-implementation-plan.md) | Architecture reference (API, DB, phases) |
| [`010`](010-decisions.md) | Locked product / UX decisions |
| [`011`](011-questionaire.md) | Questionnaire structure (ids, dimensions, reverse flags) |
| [`014-scoring.md`](014-scoring.md) | Scoring & dual-primary rules |
| [`015`](015-principles.md) | Methodology principles |
| [`017`](017-assessment-content-sk.md) | Slovak UI + results pack |
| [`018`](018-experience.md) | Experience / emotional journey (non-implementation) |
| [`019`](019-question-wording.md) | Question wording v1.1 (formulation only) |

## English methodology reference

| Doc | Role |
|-----|------|
| [`012`](012-insights.md) | Micro-insights — **prod SK in `017` §6** |
| [`013`](013-result-framework.md) | Result frameworks — **prod SK in `017` §9** |

## Business context

| Doc | Role |
|-----|------|
| [`006`](006-funnel-it-dev.md) | Offer / pilot framing (free §6, paid §7) |

## Planning only (not v1 ops)

| Doc | Role |
|-----|------|
| [`020`](020-customer-journey.md) | Customer journey v2 proposal — do not implement assessment from this |
| [`022`](022-marketing-architecture.md) | Messaging architecture (strategy) |
| [`023`](023-email-architecture.md) | Post-assessment email journey (strategy) |
| [`024`](024-email-copy-framework.md) | Copy framework |
| [`025`](025-email-sequence.md) | Sequence copy pack (EN reference) |
| [`027`](027-sk-copy-pack1.md)–[`030`](030-sk-copy-pack4.md) | Final SK production copy (pack titled 026; live in `src/config/assessmentNurture.js`) |

**Implemented nurture:** migration `009`, `assessmentNurtureService`, cron `assessment-nurture`, `/odhlasenie-emailov`, admin test UI `/admin/email-nurture-test`. Timing + final SK copy in `src/config/assessmentNurture.js` (v1 = universal only).

## Archive

Superseded drafts live in [`archive/`](archive/) (`000`–`005`, `007`–`008`). Do not implement from them.

Filenames keep the historical `questionaire` spelling where already used; do not rename for cosmetics.

## Project ops docs (outside this folder)

- `docs/IMPLEMENTATION-SNAPSHOT.md` — as-built assessment section  
- `docs/API.md` — `POST /api/assessment/submit`  
- `docs/leads/assessment-conversion-events.md`  
- `docs/DB-SCHEMA.md` — `assessment_submissions`  
- `docs/PAGE-VISIBILITY.md` — `FUNNEL_AUTOPILOT_MODE`
