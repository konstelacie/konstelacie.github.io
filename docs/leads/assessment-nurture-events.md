# Assessment nurture sequence events

Post-assessment marketing sequence (`assessment_post_nurture_v1`). Migration `009`. See `src/services/assessmentNurtureService.js`, `docs/funnel/it-dev/023-email-architecture.md`.

| Event code | When | Notes |
|------------|------|--------|
| `sequence_enrolled` | New or restarted enrollment after marketing consent | Not fired when an ACTIVE sequence already exists |
| `email_sent` | Provider accepted a nurture step | Metadata includes `step`, `templateId` |
| `sequence_completed` | Last step (E7) sent successfully | |
| `sequence_unsubscribed` | One-click unsubscribe (`/odhlasenie-emailov`) | Withdraws `marketing_consents` for that email |

Primary assessment KPI remains `assessment_email_unlocked` (see `assessment-conversion-events.md`).
