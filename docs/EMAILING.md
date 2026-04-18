# Emailing — Architecture & status

**For AI assistants (Cursor, Copilot, etc.):** This document maps the emailing space. **Implemented delivery** is in `src/email/provider.js` (Resend), `src/services/emailService.js`, templates under `src/templates/emails/`, and logging via `email_sent_log` (`docs/DB-SCHEMA.md`). Sections below still include **planning** and **open questions** for operator-assisted and marketing mail—treat those as non-binding until built.

**Related docs:** `docs/RESERVATION-SYSTEM-ARCHITECTURE.md`, `docs/STRIPE-ARCHITECTURE.md`, `docs/SESSION-PRICING.md`, `docs/POST-PAYMENT-CLIENT-JOURNEY.md`, `docs/SCHEDULED-EMAILS-CRON.md`, `docs/API.md`, `docs/IMPLEMENTATION-SNAPSHOT.md`.

### Implementation snapshot (facts)

| Piece | Status |
|-------|--------|
| Provider | **Resend** (`resend` npm package); `sendEmail` skipped if API key/from not set (`skipped: true`). |
| Reservation confirmation | **Yes** — after `checkout.session.completed` webhook (`src/routes/api/stripe.js`), `sendReservationConfirmation`, template id `reservation-confirmation`. |
| Billing invoice (PDF email) | **Yes** — same webhook path triggers `billingDeliveryService.processBillingDocumentDelivery`, then `sendBillingInvoiceEmail` when enabled and recipient valid; template ids **`billing-invoice`** (initial) and **`billing-invoice-resend`** (admin). Disable outbound invoice mail with `BILLING_SEND_INVOICE_EMAIL=false` (PDF can still be generated). |
| Pre-session reminder | **Yes** — cron job `pre-session-reminder` (`src/jobs/preSessionReminder.js`), template id `pre-session-reminder`. |
| `email_sent_log` table | **Yes** — audit for sends with template id, entity link, `provider_message_id` when available. |
| Queue / worker | **No** — confirmation and invoice pipelines use fire-and-forget `async` from webhook or admin redirects (errors logged). |
| Operator manual send UI | **No** — still external / future. Admin **resend invoice** for an existing billing document: **`POST /admin/billing/:id/resend-email`**. |

### Implemented sends (parity with code)

| Template file | `email_sent_log.template_id` | Subject (fixed in code) | Trigger | `entity_type` / `entity_id` in log | `actor_type` in log |
|---------------|------------------------------|-------------------------|---------|-------------------------------------|---------------------|
| `reservation-confirmation.ejs` | `reservation-confirmation` | `Rezervácia potvrdená` | `checkout.session.completed` when payment has `reservation_id` (`sendConfirmationEmailAsync` in `stripe.js`) | `reservation` / reservation id | `system` |
| `billing-invoice.ejs` | `billing-invoice` | `Platobný doklad {documentNumber} — citimtedasom.sk` | After billing row exists + PDF on disk; `processBillingDocumentDelivery` (skipped if duplicate log, invalid email, or `BILLING_SEND_INVOICE_EMAIL` off) | `billing_document` / document id | `system` |
| `billing-invoice-resend.ejs` | `billing-invoice-resend` | `Platobný doklad {documentNumber} (znova) — citimtedasom.sk` | Admin **`resendBillingInvoiceEmailAdmin`** → **`POST /admin/billing/:id/resend-email`** | `billing_document` / document id | **`admin`** |
| `pre-session-reminder.ejs` | `pre-session-reminder` | `Pripomienka sedenia zajtra` | Cron **`pre-session-reminder`**: `confirmed` reservations whose slot **`start_at_utc`** falls in **`[NOW+23:30h, NOW+24:30h)`** (`reservationsRepo.findDueForPreSessionReminder`) | `reservation` / reservation id | `system` |

**Provider API:** `src/email/provider.js` — **`sendEmail(to, subject, html, metadata, options?)`**. If Resend is not configured (`RESEND_API_KEY` + `RESEND_FROM_EMAIL`), returns **`{ ok: false, skipped: true }`** and nothing is sent. **`options.attachments`** is used for billing PDFs. **`reply_to`** is set to the configured from address.

**Logging:** Rows are written to **`email_sent_log` only when** the provider returns **`ok: true`** and a **`messageId`** (`emailService`); failed sends are not logged there.

**Idempotency:** Pre-session and initial billing invoice use **`emailSentLogRepo.wasAlreadySent`** (template + entity) so cron/webhook retries do not double-send; reservation confirmation has no duplicate guard beyond business rules (one payment flow per reservation).

### Required env vars (Resend)

Set in `.env` (or environment); see `src/config/index.js` and `.env.example`.

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | API key from [Resend Dashboard → API Keys](https://resend.com/api-keys). |
| `RESEND_FROM_EMAIL` | Sender address (verified domain in Resend). |
| `RESEND_FROM_NAME` | Display name (default in config: `citimtedasom.sk`). |

**Billing invoice email** also respects **`BILLING_SEND_INVOICE_EMAIL`** and supplier/PDF dirs under the **`billing`** config block — see `docs/STRIPE-ARCHITECTURE.md` (Billing / invoice env).

---

## 1. Purpose of This Document

- **Map the emailing space** — Clarify what email does and does not cover in this project.
- **Separate concerns** — Distinguish transactional, operator-assisted, and future marketing use cases.
- **Capture open questions** — Document risks, options, and likely directions without committing.
- **Stay implementation-aware** — Reference real flows (reservation, payment, post-session) without designing full implementation details.

This doc is a thinking input. Final decisions will be captured elsewhere once made.

---

## 2. Current context and assumptions

### What exists today (code)

- **Reservation flow:** Slot → lock → reservation (email) → Stripe Checkout → webhook confirms payment → **confirmation email** and (when configured) **billing invoice email** with PDF sent asynchronously.
- **Success page:** `src/views/funnels/_funnel-success.ejs` — thanks copy; details also loaded via `GET /api/payments/status` where implemented client-side.
- **Provider:** Resend; HTML from EJS templates in `src/templates/emails/`.
- **Schema:** `users.email`, `reservations.email`, **`email_sent_log`** for sends linked by `template_id`, `entity_type`, `entity_id`.

### Assumptions (non-final; planning sections below)

| Assumption | Notes |
|------------|-------|
| Email is a primary post-payment channel | Success page alone is insufficient; users may close the tab. |
| Operator (facilitator) will send some emails manually | Not everything is automated. |
| Slovak language for user-facing content | Matches site; see `docs/PRACTICES.md`. |
| Resend is a strong candidate | Prior personal experience; not yet a final decision. |
| Transactional and marketing must be separable | Legal and UX reasons; see Section 8. |

### Where This Doc Connects

- **Reservation flow:** Confirmation email after payment; see `docs/RESERVATION-SYSTEM-ARCHITECTURE.md` Flow A step 9.
- **Payment flow:** Webhook confirms payment; reservation confirmation + invoice pipeline run from there; see `docs/STRIPE-ARCHITECTURE.md` §8 (Post-payment emails).
- **Post-payment journey:** Confirmation, onboarding, reminders, follow-up; see `docs/POST-PAYMENT-CLIENT-JOURNEY.md`.
- **Future admin/CRM:** Operator needs to see history, send manual emails, possibly manage sequences.

---

## 3. Email Categories

### 3.1 Transactional Emails

**Definition:** Triggered by a system event. Content is largely fixed or parameterized. User expects them as part of a flow.

| Example | Trigger | Typical content |
|---------|---------|-----------------|
| Reservation confirmation | Payment webhook confirms reservation | Slot date/time, amount (see `reservation-confirmation.ejs`) |
| Platobný doklad (billing invoice) | Same webhook path + PDF pipeline (or admin resend) | Amount, document number; **PDF attachment** — internal doc, not Stripe’s receipt email |
| Slot lock reminder | *Not implemented* — no email before lock expiry | — |
| Pre-session reminder | Cron **~24h before** session (`pre-session-reminder` job) | Date, time (see template) |

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

**When:** Cumulative completed payments for the session are **≥ 45 €** (minimum already met). That can be after a reservation fee plus earlier payments, after **45 €** paid upfront when we offer “minimum now, optionally more later,” or similar. There is **no product maximum** total; any doplatok message is about **optional** contribution, not filling a gap to a fixed ceiling (e.g. 105 €). See **`docs/SESSION-PRICING.md`** (section *Supplementary payment*).

**Content:** Polite, non-pressuring invite to contribute optionally; link to payment page; clear display of already paid vs. optional supplement. Product expectation: **one** supplementary checkout per session.

**Implemented (operator-triggered):** On **`GET /admin/reservations/:id`**, when a balance link is eligible, the operator can **Odoslať e-mail** — optional **subject**, optional **plain-text message** (HTML escaped; empty message uses a short default intro), plus the signed **`/platba-doplatok`** link and slot summary in template **`balance-pay-invite`**. Logged as **`balance-pay-invite`** in `email_sent_log` with `actor_type` **admin**. Not sent automatically by cron.

**Open:** Fully automated reminder after session (cron) vs. keeping doplatok invite manual only; tone and timing for any future automation.

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
- Webhook (payment confirmed) — **implemented:** async sends after DB commit in `stripe.js` — reservation confirmation (if `reservation_id`) + billing delivery pipeline (not a separate queue worker).
- Cron (pre-session reminder) — **implemented:** `docs/SCHEDULED-EMAILS-CRON.md`.
- Admin action — **partially implemented:** **resend billing invoice** (`POST /admin/billing/:id/resend-email`). Free-form “send any email to client” from admin — **not implemented.**
- Future: session completion event.

**Consideration:** Stripe webhook returns quickly; confirmation send is `.catch`’d so failures do not block HTTP. A dedicated queue is still optional for future scale.

**Open:** Queue choice if volume grows; retry strategy for failed sends.

### 6.4 Logging / History / Audit Needs

**Role:** Know what was sent, when, to whom, and by whom.

**Needs:**
- **Transactional:** Log each send (template id, recipient, timestamp, provider message id). Link to reservation or payment if applicable.
- **Operator-assisted:** Log actor (admin user), recipient, timestamp, optional subject/body snapshot.
- **Delivery status:** Provider webhooks (delivered, bounced, opened) — nice to have; not required for V1.

**Open:** Retention policy; optional storage of full body vs. template id only (today: **no body** in DB — `email_sent_log` stores template id, recipient, entity link, provider message id, `actor_type`).

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

### 7.1 What may need to be stored

| Data | Purpose | Status |
|------|---------|--------|
| Email send log | Audit, "what did we send" | **Implemented:** `email_sent_log` |
| Provider message ID | Link to Resend dashboard | **Implemented** when Resend returns `messageId` |
| Delivery status | Bounce handling; analytics | Not stored (future) |
| Template versions | Reproducibility | Code-level templates only (git) |

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

**Schema:** See `docs/DB-SCHEMA.md` — `email_sent_log`.

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

## 9. Recommended near-term scope

### 9.1 Done (code)

| Item | Notes |
|------|--------|
| Reservation confirmation email | Stripe webhook → `sendReservationConfirmation`; template `reservation-confirmation.ejs`. |
| Billing invoice email | Webhook → `processBillingDocumentDelivery` → `sendBillingInvoiceEmail`; templates `billing-invoice.ejs`, `billing-invoice-resend.ejs`; entity `billing_document` in send log. |
| Provider integration | Resend via `src/email/provider.js`. |
| Code-level templates | EJS in `src/templates/emails/`. |
| Send log | `email_sent_log` + `emailSentLogRepo`. |
| Non-blocking webhook | Async send with `.catch` logging (confirmation + billing pipeline). |
| Pre-session reminder | Cron + `pre-session-reminder` template; see `SCHEDULED-EMAILS-CRON.md`. |

### 9.2 Still open / postponed

| Item | Rationale |
|------|------------|
| **Operator manual email** | Internal admin at `/admin` exists (`docs/ui-ux/admin-interface.md`), but there is **no** free-form compose/send-to-client action yet. **Resend billing invoice** for an existing document is available at `/admin/billing/:id/resend-email`. |
| **Customizable templates** | Fixed templates in repo for now. |
| **Follow-up / doplatok emails** | Needs session-completion flow + product rules. |
| **Delivery status webhooks** | Optional. |
| **Newsletter / sequences** | Out of scope until product asks. |

---

## 10. Explicit Open Decisions List

1. **Provider** — Resend vs. others; final choice.
2. **Confirmation email** — One vs. multiple; exact content; timing.
3. **Template storage** — Code-level only for V1, or DB from start?
4. **Background job** — **Current:** fire-and-forget `async` from webhook/admin; optional future queue if volume grows.
5. **Email send log schema** — **`email_sent_log` implemented** (`docs/DB-SCHEMA.md`); open: retention, whether to store body snapshots.
6. **Operator manual email** — In V1 or deferred? If in V1, where does operator compose?
7. **Customizable content** — Needed for V1? If yes, how (template slot vs. free-form)?
8. **Reminder strategy** — Yes/no; count; timing; when to build.
9. **Doplatok email** — Automated vs. manual; when to build.
10. **Unsubscribe policy** — What requires it; where to link.

---

## 11. Direction (updated to match code)

1. **Provider:** Resend; `sendEmail(to, subject, html, metadata, options?)` in `src/email/provider.js` — optional **`options.attachments`** for PDFs; returns **`{ ok: false, skipped: true }`** when API/from not configured.

2. **Confirmation email:** Sent after successful `checkout.session.completed` processing; template `reservation-confirmation.ejs`; subject `Rezervácia potvrdená`.

3. **Billing invoice email:** Same webhook after commit via `billingDeliveryService.processBillingDocumentDelivery`; templates `billing-invoice.ejs`, `billing-invoice-resend.ejs`; PDF attachment; subject includes document number. Optional env to suppress send: `BILLING_SEND_INVOICE_EMAIL=false`.

4. **Templates:** EJS under `src/templates/emails/` — `reservation-confirmation.ejs`, `pre-session-reminder.ejs`, `billing-invoice.ejs`, `billing-invoice-resend.ejs`.

5. **Logging:** `email_sent_log` as in `docs/DB-SCHEMA.md`.

6. **Webhook path:** `sendConfirmationEmailAsync` and `processBillingDocumentDelivery(...).catch(...)` — not `await`’d in the Stripe HTTP handler; errors logged.

7. **Operator-composed emails:** Still future — admin UI is present for slots/reservations, but **sending** ad-hoc mail to a client from the app is not implemented (`docs/IMPLEMENTATION-PLAN.md` §3C).

8. **Follow-up / doplatok / newsletter:** Still future or product-dependent.

---

*Exploratory sections (categories, risks, open decisions) remain for planning; **runtime behavior** is defined by the files above and `docs/STRIPE-ARCHITECTURE.md` / `docs/SCHEDULED-EMAILS-CRON.md`.*
