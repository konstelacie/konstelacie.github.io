# Constellation funnel — docs index

**Status:** Planning / validation. Do **not** implement the Map or a new funnel instance yet.

**Start here:** [`001-technical-foundation.md`](001-technical-foundation.md)

Working product: **Mapa situácie** — qualitative acquisition/research form (not Autopilot scoring). Next step is the Map design (questions, data model, result rules, events). That design is the technical spec.

Autopilot (`docs/funnel/it-dev/`) is **code infrastructure to reuse as patterns**, not a product this funnel must position against.

## Active

| Doc | Role |
|-----|------|
| [`001`](001-technical-foundation.md) | **Working brief** — accepted foundation, codebase constraints, what not to build |
| [`000`](000-brainstorming.md) | Earlier chat capture (offer pyramid, funnel sketch). Some open items superseded by `001` |

## Next (do not invent in code)

Map design covering `001` §12: questions, types, options, required/optional, branching, segments, open text, result data model + algorithm, analytics events.

Then: funnel name/URL, CTA layer (swappable offer), consent copy.

## Explicitly out of scope now

Membership, constellation circle, community, course, Autopilot clone, new DB tables before the Map data model exists.

## Related

| Doc | Role |
|-----|------|
| `docs/funnel/it-dev/` | Shipped Autopilot assessment (hidden by default) — patterns only for this pack |
| `docs/PAGE-VISIBILITY.md` | How to add a funnel page **after** Map spec |
| `docs/leads/assessment-conversion-events.md` | Why pre-email events are not free (`lead_events.email` required) |
| `docs/IMPLEMENTATION-PLAN.md` §7 | Funnel backlog (planning pointer) |
