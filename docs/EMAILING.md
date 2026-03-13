# Emailing — Architecture Input Document

**For AI assistants (Cursor, Copilot, etc.):** This document maps the emailing space for the project. It is an early input/thinking document—not a final architecture decision. Treat most things as open questions, options, and decision points. Do not prematurely lock the project into one exact implementation.

**Related docs:** `docs/RESERVATION-SYSTEM-ARCHITECTURE.md`, `docs/STRIPE-ARCHITECTURE.md`, `docs/SESSION-PRICING.md`, `docs/POST-PAYMENT-CLIENT-JOURNEY.md`, `docs/SCHEDULED-EMAILS-CRON.md` (timed emails, cron, newsletter, bulk).

### Required env vars (Resend)

Set in `.env` (or environment):

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | API key from [Resend Dashboard → API Keys](https://resend.com/api-keys). |
| `RESEND_FROM_EMAIL` | Sender address (must use verified domain in Resend). |
| `RESEND_FROM_NAME` | Sender display name (default: citimtedasom.sk). |

---

## 1. Purpose of This Document

- **Map the emailing space** — Clarify what email does and does not cover in this project.
- **Separate concerns** — Distinguish transactional, operator-assisted, and future marketing use cases.
- **Capture open questions** — Document risks, options, and likely directions without committing.
- **Stay implementation-aware** — Reference real flows (reservation, payment, post-session) without designing full implementation details.

This doc is a thinking input. Final decisions will be captured elsewhere once made.

---

## 2. Current Context and Assumptions

### What Exists Today

- **Reservation flow:** Slot → lock → email (user identity) → payment choice → Stripe Checkout → confirmation.
- **Success page:** `pilot-success.ejs` — "O ďalších krokoch ťa budeme informovať e-mailom."
- **No email sending yet** — No provider integration, no templates, no delivery.
- **Schema:** `users.email`, `reservations.email`; no `email_sent_log` or similar.

### Assumptions (Non-Final)

| Assumption | Notes |
|------------|-------|
| Email is a primary post-payment channel | Success page alone is insufficient; users may close the tab. |
| Operator (facilitator) will send some emails manually | Not everything is automated. |
| Slovak language for user-facing content | Matches site; see `docs/PRACTICES.md`. |
| Resend is a strong candidate | Prior personal experience; not yet a final decision. |
| Transactional and marketing must be separable | Legal and UX reasons; see Section 8. |

### Where This Doc Connects

- **Reservation flow:** Confirmation email after payment; see `docs/RESERVATION-SYSTEM-ARCHITECTURE.md` Flow A step 9.
- **Payment flow:** Webhook confirms payment; email can be triggered from there (or deferred to background); see `docs/STRIPE-ARCHITECTURE.md` Section 9.
- **Post-payment journey:** Confirmation, onboarding, reminders, follow-up; see `docs/POST-PAYMENT-CLIENT-JOURNEY.md`.
- **Future admin/CRM:** Operator needs to see history, send manual emails, possibly manage sequences.

---

## 3. Email Categories

### 3.1 Transactional Emails

**Definition:** Triggered by a system event. Content is largely fixed or parameterized. User expects them as part of a flow.

| Example | Trigger | Typical content |
|---------|---------|-----------------|
| Reservation confirmation | Payment webhook confirms reservation | Slot, date, amount, receipt reference, link to client zone |
| Payment receipt | Same webhook | Amount, date, Stripe receipt link (if applicable) |
| Slot lock reminder | Lock about to expire | "You have X minutes to complete your reservation" |
| Pre-session reminder | Cron / scheduled job | Date, time, how to join, preparation tips |

**Characteristics:**
- Automated; no human writes each one.
- High deliverability expectations (user is waiting).
- Usually no unsubscribe (or only a "stop all" for edge cases).
- Should be fast and reliable.

### 3.2 Customizable / Operator-Assisted Emails

**Definition:** Human writes or customizes content. May use templates with slots for personal message. Sent in response to a business event (e.g. after session) but content is not fully automated.

| Example | Trigger | Typical content |
|---------|---------|-----------------|
| Personal follow-up after session | Operator marks session done | Personal message + optional CTA (feedback, doplatok, rebook) |
| Doplatok request | Operator or system identifies unpaid remainder | Custom message + payment link |
| Ad-hoc support | Operator-initiated | Fully manual; no template required |

**Characteristics:**
- Operator chooses when and what to send.
- May combine fixed template (header, footer, CTA) with free-form body.
- Audit trail matters: who sent what, when, to whom.
- May reference reservation, payment, or user.

### 3.3 Possible Future Newsletter / Sequence Emails

**Definition:** Marketing or nurture emails. Sequences, broadcasts, campaigns. Not in scope for this document.

**Note:** Kept as a category for clarity. Do not design a full newsletter system now. If we add it later, it should be clearly separated from transactional and operator-assisted emails (different provider config, different consent, different unsubscribe handling).

---

## 4. Example Real-World Use Cases for This Project

### 4.1 Reservation Confirmation

**When:** Stripe webhook confirms payment; reservation status → `confirmed`.

**Content (options):**
- Single combined email: payment receipt + reservation details + "what happens next".
- Or two emails: receipt (immediate) + onboarding (short delay).

**Open:** One vs. multiple; exact content; timing. See `docs/POST-PAYMENT-CLIENT-JOURNEY.md` Section 2.

**First suggested format (Meet / how to join):**

```
Online sedenie prebehne cez Google Meet.

Link na pripojenie:
[meet link]

Môžete sa pripojiť 2–3 minúty pred začiatkom.

Ak chcete, môžete si spojenie pokojne otestovať aj skôr – 
otvorí sa vám náhľad kamery a mikrofónu.

Ak by Meet u vás nefungoval, môžeme použiť aj inú platformu.
```

### 4.2 Follow-Up After Session

**When:** Session has taken place (operator marks complete or system infers).

**Content:** Thank you, optional feedback link, invitation to rebook. May be automated (template only) or operator-customized.

**Open:** Automated vs. manual; timing (immediate vs. 1–2 days).

### 4.3 Personal Message After Session

**When:** Operator decides to send a personal note.

**Content:** Free-form message from operator. May include:
- Reflection on the session.
- Suggested next steps.
- Link to pay doplatok, rebook, or feedback.

**Open:** How much structure (template with slot vs. fully free-form); where operator composes (admin UI vs. external tool).

### 4.4 Optional Payment Follow-Up / Doplatok Request

**When:** User paid reservation fee (10 € first session, 45 € future); remainder may be paid after session. See `docs/SESSION-PRICING.md`.

**Content:** Polite request to complete payment; link to payment page; amount due.

**Open:** Automated (triggered by session completion + unpaid remainder) vs. manual (operator sends when appropriate); tone and timing.

---

## 5. Customizable Email Concept

### 5.1 Sending Fully Manual Emails

**Idea:** Operator composes and sends an email to a user from within the admin. No template; free-form subject and body.

**Use case:** Ad-hoc support, exceptional situations, personal outreach.

**Tradeoffs:**
- **Pro:** Maximum flexibility.
- **Con:** No consistency; harder to audit content; risk of errors (wrong recipient, typos).
- **Recommendation for now:** Support it for V1 if admin exists; keep it simple (e.g. "Send email" form with user pre-selected).

### 5.2 Attaching Custom Content Into a Shared Template

**Idea:** Template has fixed structure (header, footer, CTA) and a slot for operator-written content.

**Example (pseudocode):**
```
[Fixed header: logo, greeting]
[Operator-written personal message — required or optional]
[Fixed CTA: Pay remaining amount | Book again | Give feedback]
[Fixed footer: contact, unsubscribe]
```

**Use case:** Follow-up after session; doplatok request with personal touch.

**Tradeoffs:**
- **Pro:** Consistent branding and CTAs; operator adds human touch.
- **Con:** More complex to build; need template editor or at least placeholder definition.
- **Recommendation for now:** Defer full template system; start with "personal message + CTA" as a single template variant.

### 5.3 Combining Personal Message + CTA / Payment Request

**Idea:** Operator writes a short message; system appends payment link (or other CTA) based on context (reservation, amount due).

**Use case:** Doplatok request where operator adds context ("Thank you for the session. If you'd like to complete your contribution, you can do so here.") and system adds the link.

**Open:** Whether the link is always appended or operator can choose which CTA to include.

---

## 6. Key Architectural Considerations

### 6.1 Provider Layer

**Role:** Send emails via an external service. Abstract behind an interface so we can swap providers.

**Candidates:**
- **Resend** — Strong candidate (prior experience); transactional focus; simple API.
- **Others:** SendGrid, Postmark, Mailgun, AWS SES — all viable. Not evaluated here.

**Considerations:**
- Transactional vs. marketing: Some providers separate these (different API keys, domains). Resend supports both; we should still separate in our design.
- Deliverability: Domain verification, SPF/DKIM/DMARC.
- Rate limits, retries, error handling.

**Open:** Final provider choice; whether to support multiple (e.g. Resend for transactional, other for future newsletter).

### 6.2 Template Layer

**Role:** Define structure and content of emails. Variables for personalization (name, slot date, amount, links).

**Options:**
- **Code-level templates** — EJS, Handlebars, or similar. Templates live in repo.
- **Database-stored templates** — Admin can edit without deploy. More flexible; more complex.
- **Provider templates** — Some providers (e.g. Resend React Email) offer template hosting.

**Recommendation for now:** Start with code-level templates (EJS or similar). Easy to version, review, and deploy. Add database templates later if operator editing is required.

### 6.3 Business / Event Layer

**Role:** Decide *when* to send. Triggers from:
- Webhook (payment confirmed)
- Cron (reminder 24h before session)
- Admin action (operator clicks "Send follow-up")
- Future: session completion event

**Consideration:** Webhook handler must respond quickly. Defer email sending to a background job or queue. See `docs/STRIPE-ARCHITECTURE.md` Section 9.

**Open:** Queue choice (in-memory, Redis, DB-based, provider-native); retry strategy.

### 6.4 Logging / History / Audit Needs

**Role:** Know what was sent, when, to whom, and by whom.

**Needs:**
- **Transactional:** Log each send (template id, recipient, timestamp, provider message id). Link to reservation or payment if applicable.
- **Operator-assisted:** Log actor (admin user), recipient, timestamp, optional subject/body snapshot.
- **Delivery status:** Provider webhooks (delivered, bounced, opened) — nice to have; not required for V1.

**Open:** Storage (new table `email_sent_log` or similar); retention; what to store (full body vs. reference only).

### 6.5 Admin / Operator Usability

**Role:** Operator needs to send manual/customizable emails and possibly view history.

**Needs:**
- Select user (or reservation) as recipient.
- Compose or choose template.
- Send.
- View history (what was sent to this user).

**Open:** Admin UI scope for V1; whether manual email is in first release.

---

## 7. Data and State Considerations

### 7.1 What May Need to Be Stored

| Data | Purpose | Priority |
|------|---------|----------|
| Email send log | Audit, "what did we send" | High |
| Provider message ID | Link to provider dashboard; support | Medium |
| Delivery status | Bounce handling; analytics | Low for V1 |
| Template versions | Reproducibility; debugging | Medium (if DB templates) |

### 7.2 Email History

**Idea:** Per-user or per-reservation view of emails sent.

**Use case:** Operator checks "Did we send confirmation?" or "What follow-ups did we send?"

**Relation:** `email_sent_log` → `users` or `reservations`. Optional `entity_type` + `entity_id` for polymorphic link.

### 7.3 Delivery Status

**Options:**
- **None** — Rely on provider; no storage.
- **Basic** — Store provider message ID; check status in provider dashboard.
- **Full** — Webhook from provider; store delivered/bounced/opened. More complex.

**Recommendation for now:** Store provider message ID. Defer webhook-based status sync.

### 7.4 Relation to Reservation / Payment / User Records

- **Reservation confirmation** → `reservation_id`, `user_id` (or `email`).
- **Doplatok request** → `reservation_id`, `user_id`; may need payment context (amount due).
- **Manual email** → `user_id` at minimum; `reservation_id` optional for context.

**Open:** Schema for `email_sent_log`; exact columns.

---

## 8. Risks / Open Questions

### 8.1 Transactional vs. Marketing Separation

**Risk:** Mixing transactional and marketing in one system can cause legal (GDPR, consent) and deliverability issues. Marketing emails require explicit consent and unsubscribe.

**Recommendation:** Design with separation in mind. Transactional = no unsubscribe (or minimal). Marketing = separate consent, separate provider config if needed. Do not build marketing yet.

### 8.2 Unsubscribe Implications

**Transactional:** Generally no unsubscribe; user expects these. Exception: if we send "promotional" content in a transactional email, boundaries blur.

**Operator-assisted:** Gray area. Personal follow-up after session is arguably transactional. Doplatok request is transactional. Newsletter signup invite in same email = marketing.

**Open:** Clear policy: what requires unsubscribe, what does not.

### 8.3 Timing and Triggers

**Open questions:**
- Confirmation email: Immediate vs. batched?
- Reminder: 24h, 48h, 7 days? One or multiple?
- Follow-up: Immediate vs. 1–2 days after session?
- Doplatok: When to send? Automated vs. operator-triggered?

### 8.4 How Much Customization Is Needed

**Spectrum:** Fully automated templates ↔ fully manual free-form.

**Open:** For V1, do we need operator-customizable content at all, or is "send from template" enough? If we need it, how rich (one text slot vs. multiple)?

### 8.5 Whether Newsletter Belongs in Scope Now

**Recommendation:** No. Keep this doc focused on transactional and operator-assisted. Newsletter is a future, separate concern.

---

## 9. Recommended Near-Term Scope

### 9.1 Build First

| Item | Rationale |
|------|------------|
| **Reservation confirmation email** | Highest impact; user expects it. Triggered from webhook (deferred to background). |
| **Provider integration** | Resend (or chosen provider). Abstract behind interface. |
| **Code-level templates** | EJS or similar for confirmation. Simple, versioned. |
| **Basic send log** | Table to record sent emails; link to reservation/user. |
| **Defer email from webhook** | Don't block webhook response; queue or fire-and-forget. |

### 9.2 Postpone

| Item | Rationale |
|------|------------|
| **Operator manual email** | Can use external email initially; add admin UI when admin exists. |
| **Customizable templates** | Start with fixed templates; add slots for operator content later. |
| **Reminder emails** | Requires cron/scheduler; add after confirmation works. |
| **Follow-up / doplatok emails** | Depends on session completion flow; add when that exists. |
| **Delivery status webhooks** | Nice to have; not critical for V1. |
| **Newsletter / sequences** | Out of scope. |

---

## 10. Explicit Open Decisions List

1. **Provider** — Resend vs. others; final choice.
2. **Confirmation email** — One vs. multiple; exact content; timing.
3. **Template storage** — Code-level only for V1, or DB from start?
4. **Background job** — How to defer email from webhook (queue, worker, simple async).
5. **Email send log schema** — Table design; what to store.
6. **Operator manual email** — In V1 or deferred? If in V1, where does operator compose?
7. **Customizable content** — Needed for V1? If yes, how (template slot vs. free-form)?
8. **Reminder strategy** — Yes/no; count; timing; when to build.
9. **Doplatok email** — Automated vs. manual; when to build.
10. **Unsubscribe policy** — What requires it; where to link.

---

## 11. Proposed Initial Direction (Non-Final)

**Summary:** Start small, stay flexible.

1. **Provider:** Proceed with Resend as the default choice. Abstract behind a `sendEmail(to, subject, html, metadata)`-style interface. Revisit if requirements change.

2. **First email:** Reservation confirmation. Single email, sent asynchronously after webhook confirms payment. Content: reservation details, amount paid, link to client zone, brief "what happens next."

3. **Templates:** EJS (or similar) in repo. One template for confirmation. Add more as use cases appear.

4. **Logging:** New table `email_sent_log` with: `id`, `recipient_email`, `template_id`, `entity_type`, `entity_id`, `provider_message_id`, `sent_at`, `actor_type`, `actor_id`. Minimal for V1.

5. **Defer from webhook:** After webhook updates DB, enqueue or spawn async task to send email. Do not await in webhook handler.

6. **Operator emails:** Defer to post-V1. Use personal email or external tool until admin exists. Revisit when building admin.

7. **Reminders, follow-up, doplatok:** Defer. Implement after confirmation works and session completion flow exists.

8. **Newsletter:** Explicitly out of scope. Revisit only when there is a clear product need.

---

*This document is exploratory. Decisions will be captured elsewhere once made.*
