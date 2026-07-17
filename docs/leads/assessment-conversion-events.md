# Assessment conversion events — Life Autopilot

**Scope:** Free assessment funnel (`autopilot` / `/autopilot`, `/autopilot-test`) only.  
**Reservation funnel events:** see [`conversion-events.md`](conversion-events.md).

## Primary KPI

| Event | When | Category |
|-------|------|----------|
| `assessment_email_unlocked` | Successful `POST /api/assessment/submit` (email + scored answers persisted) | acquisition |

This is the business lead for the free assessment: completed questionnaire + email unlock.

**Not wired in v1** (email is required on `lead_events`; anonymous mid-funnel beacons need a schema change or are deferred):

- `assessment_started`
- `assessment_completed`
- `results_viewed`
- `paid_diagnosis_cta_clicked`

See `docs/funnel/it-dev/009-questionnaire-implementation-plan.md` §11.2 and `010-decisions.md`.

## Payload

Written via `scheduleLeadEvent` (fire-and-forget; gated by `LEAD_EVENTS_ENABLED` / `leadEventsGate`).

| Field | Value |
|-------|--------|
| `email` | Normalized submit email |
| `formId` | Funnel name (`autopilot`) |
| `sourceUrl` | Body `sourceUrl` or `Referer` |
| `providerEventId` | `assessment_submission:{id}` (idempotent per submission row) |
| `consentMarketing` | Optional checkbox from submit body |
| `metadata` | See below |

**Metadata:**

```json
{
  "submissionId": 123,
  "funnelCampaign": "default",
  "scores": {
    "autopilot": { "raw": 22, "percent": 66.7 },
    "identity": { "raw": 28, "percent": 91.7 },
    "energy": { "raw": 19, "percent": 54.2 },
    "relationships": { "raw": 15, "percent": 37.5 }
  },
  "primaryBottleneck": "identity_loop",
  "secondaryBottleneck": "autopilot_loop",
  "isDualPrimary": false,
  "isBalanced": false,
  "isLowOverall": false
}
```

## Meta CAPI

On the same successful submit path, `scheduleCapiLead` sends a Meta Conversions API `Lead` with:

- `eventId`: `assessment_lead:{submissionId}`
- `content_type`: `assessment`
- `content_name`: funnel name (when present)

Respects marketing consent / `notrack` via `extractMetaAttribution` (same as booking email step).

## Migration

Type seeded in `008_assessment_lead_event.sql` (`is_active = 1`). Wired in `src/lib/leadEventsGate.js` → `WIRED_EVENT_TYPES`.

Admin label: `Odomknuté hodnotenie` (`adminLeadEventDisplay.js`).
