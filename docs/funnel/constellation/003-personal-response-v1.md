# 003 — Personal response (v1, human review)

**Status:** Implemented as internal workflow on top of Mapa situácie v0.1. **Not** a public product launch, paid offer, or nurture series.  
**Funnel:** `mapa` · test URL `/mapa-test`  
**Index:** [`README.md`](README.md)  
**Map as-built:** [`002-situation-map-v0.md`](002-situation-map-v0.md)

Working copy: `src/config/situationMap.js` (result page), `src/config/situationMapPersonalResponse.js` (email wrapper), `src/config/situationMapAiSummary.js` (AI prompt version). Prefer config when docs and code disagree on wording.

Marketing names (“Jedna osobná rada zdarma”, “poradenstvo”, …) are **not** locked. Map question IDs, answers, and `situation_map_submissions` stay independent of the proposition. Change result/email copy without a submission migration.

---

## Flow (v1)

```
Map v0.1 (unchanged Q1–Q8) → recap + pending personal response
  → situation_map_responses (pending)
  → admin review
  → optional internal AI/mock draft (write-once)
  → human summary + plain-text response
  → approved / sent
  → personal-response email (service, not marketing)
```

`offer` stays `null`. No checkout, scoring, paid recommendation, or nurture.

---

## Result page

After submit the user still gets the **full deterministic recap**. Additional configurable copy (`resultPage` in `src/config/situationMap.js`):

1. acknowledgement that the situation was received,
2. recap (existing),
3. pending personal-response status.

Placeholder meaning: thank-you + “I will look at this personally and send one response to the email you gave.”

---

## Data: `situation_map_responses`

Separate entity from the Map submission (migration `012`). One row per submission.

| Field | Role |
|-------|------|
| `status` | `pending` \| `drafting` \| `ready_for_review` \| `approved` \| `sent` |
| `ai_summary_draft` | Write-once internal draft. **Never** overwritten by the human version. |
| `ai_summary_prompt_version` / `ai_summary_source` | Compare prompt versions (`mock` \| `manual`) |
| `human_summary` | Editable |
| `response_draft` | Editable plain text (no locked sections like advice/cause) |
| `final_response` | Snapshot at approve/send — kept beside the AI draft |
| `internal_notes` | Operator only |
| `edited_by` / `reviewed_by` | Admin username string (single shared admin today) |
| `created_at` / `updated_at` / `reviewed_at` / `sent_at` | |

Research path: `AI draft → human summary/edits → final response`.

---

## Admin

Existing `/admin` session auth. Routes:

- `GET /admin/situation-map` — list + status filter
- `GET /admin/situation-map/:submissionId` — Q1–Q8, recap, AI draft, human fields, status, send

Priority is function, not polish.

---

## AI summary

**Off by default.** No third-party provider is wired (`SITUATION_MAP_AI_SUMMARY_MODE=off`).

`mock` (env) or the admin “faktický interný draft” button restates Map answers **in-process**. It must not diagnose, name a cause, claim a family/systemic pattern, recommend constellation, or generate a sales offer. It never emails the user.

Prompt/version: `src/config/situationMapAiSummary.js` (`ai-summary-v1`). Bump the version string when the prompt changes.

---

## Email

Template `situation-map-personal-response` via existing Resend (`src/email/provider.js`, `emailService.sendSituationMapPersonalResponse`).

- **Service delivery** for the free product. Marketing consent is **not** required and is not checked.
- Wrapper copy is in `src/config/situationMapPersonalResponse.js` (not locked).
- Body is the human `final_response` / `response_draft` as escaped plain text.
- If Resend is not configured, admin can mark `sent` without sending (operator-assisted).
- Nurture series is **not** implemented.

Logged in `email_sent_log` (`entity_type` = `situation_map_response`).

---

## Analytics

Existing Map funnel events are unchanged and still must not include Q2/Q7 text, name, email, AI summary, or response body.

Internal events on `situation_map_events` (not `lead_events`, not CAPI/Pixel):

- `personal_response_created`
- `personal_response_reviewed`
- `personal_response_sent`

Allowlisted properties only: `responseStatus`, `timeToResponseBucket`, `promptVersion`, `responseSource`. Campaign sits on the event row (`funnel_campaign`). Client `POST /api/situation-map/event` **cannot** emit these types.

Later join (not built): map completed → response sent → paid next step. Paid next step is not implemented.

---

## Privacy follow-up (when AI is enabled)

AI processing is **not** on. If a provider is later enabled, document purpose + processor on `/ochrana-udajov` (`src/views/ochrana-udajov.ejs` sections 2–4 — markers are already in that file) and in `emailGate.privacyNoteHtml`. Do not invent legal copy.

Q2/Q7 and response content stay out of web analytics and marketing event tools.

---

## Local check

1. `FUNNEL_MAPA_MODE=test`, `yarn db:migrate` (includes `012`)
2. Walk `/mapa-test`, submit, read recap + pending copy, no offer
3. `/admin/situation-map` → open the submission
4. Insert mock or manual AI draft; edit human summary + response; change status
5. Confirm AI draft still present after final snapshot
6. Send email if Resend is configured, or mark sent
