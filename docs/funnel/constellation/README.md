# Constellation funnel — docs index

**Start here:** [`002-situation-map-v0.md`](002-situation-map-v0.md) for the Map prototype; [`003-personal-response-v1.md`](003-personal-response-v1.md) for the human-review personal response layer; [`001-technical-foundation.md`](001-technical-foundation.md) for the working brief.

**Mapa situácie v0.1** is an internal validation prototype at `/mapa-test` (`FUNNEL_MAPA_MODE=test`). Do not treat it as a public campaign launch.

Autopilot (`docs/funnel/it-dev/`) remains separate infrastructure. This funnel does not reuse Autopilot questions, scoring, or nurture.

## Active

| Doc | Role |
|-----|------|
| [`003`](003-personal-response-v1.md) | **Personal response v1** — separate `response` entity, admin review, mock AI boundary, service email |
| [`002`](002-situation-map-v0.md) | **v0.1 Map as-built** — Q1–Q8, recap, offer slot (off) |
| [`001`](001-technical-foundation.md) | Working brief (Map vs offer layer, what not to build) |
| [`000`](000-brainstorming.md) | Earlier chat capture (offer pyramid) |

## Next (not in this slice)

Content/UX testing on model situations. Lock personal-response copy after human experiments. Paid next step and nurture remain off.

## Explicitly out of this slice

Automatic AI advice to the user, diagnosis, paid recommendation engine, scoring, nurture, 3-session offer, checkout, public ads, sending AI drafts without human review. No ads on `/mapa-test`.
