# Post-Payment / Post-Booking Client Journey

**For AI assistants (Cursor, Copilot, etc.):** This document explores the client flow *after* successful payment. It is a planning and problem-space document—not an implementation spec, not a final architecture decision. Use it when discussing onboarding, confirmation flows, reminders, or lifecycle design. Do not treat open questions as decisions.

**Related docs:** `docs/SESSION-PRICING.md`, `docs/RESERVATION-SYSTEM-ARCHITECTURE.md`, `docs/STRIPE-ARCHITECTURE.md`.

---

## 1. Immediate Post-Payment Step

Payment success is technically confirmed by the Stripe webhook. The user is redirected to a success URL. What happens there is still open.

### What exactly should happen right after successful payment?

- The webhook updates the reservation and payment records. The user lands on a page.
- That page could be a generic “thank you” or a richer confirmation view.
- Timing: the webhook may complete before or after the user arrives. The success page may need to handle both “already confirmed” and “still processing” states.

### What is the role of the success page?

- **Reassurance** — Confirm that payment went through.
- **Information** — Show what was booked (slot, date, amount).
- **Next steps** — Point the user somewhere useful (client zone, email, calendar).
- **Actionability** — Possibly offer immediate next actions (e.g. add to calendar, fill intake).

### What should the user see there?

- At minimum: confirmation of payment and basic booking details.
- Possibly: link to client zone, “what happens next” summary, calendar add.
- Open: whether to show only info vs. actionable elements (forms, buttons).

### What should be only informational vs actionable?

- Informational: “Your session is on [date] at [time].”
- Actionable: “Add to calendar”, “Fill intake form”, “Go to client zone”.
- Tradeoff: more actions reduce bounce but may overwhelm. Fewer actions keep the page simple but may leave the user unsure what to do next.

---

## 2. Confirmation Communication

### What email(s) might be sent immediately after payment?

- One “payment received” email.
- One “reservation confirmed” email.
- Or a single combined email.
- Or none (rely on success page only)—though that is risky if the user closes the tab.

### What should such communication contain?

- Payment confirmation (amount, date, receipt reference).
- Reservation details (slot, date, time, timezone).
- Contact / cancellation policy (if any).
- Link to client zone or a “view booking” page.
- Possibly: “what happens next” and preparation instructions.

### What is merely payment confirmation vs actual reservation/onboarding communication?

- **Payment confirmation** — “We received your payment of X €.” Receipt-like, transactional.
- **Reservation confirmation** — “Your session is booked for [date].” Booking-centric.
- **Onboarding** — “Here’s how to prepare” or “Fill this form before the session.”
- Open: whether to merge these into one email or keep them separate (e.g. immediate receipt vs. follow-up onboarding).

---

## 3. Onboarding After Booking

### Should there be a “what happens next” step?

- Users may not know what to expect. A short “what happens next” reduces uncertainty.
- Could live on the success page, in an email, or both.

### Should there be a separate onboarding page, email, or both?

- **Page** — User can revisit; good for links from emails.
- **Email** — Reaches the user even if they leave the site.
- **Both** — Redundancy; may feel repetitive if content is identical.
- Open: which channel is primary and what is duplicated.

### What information may need to be communicated before the session?

- How to join (video link, phone, address).
- What to prepare (topic, questions, context).
- Cancellation / reschedule policy.
- What to expect during the session.
- Possibly: intake form or questionnaire.

---

## 4. Pre-Session Preparation

### Do we want a short intake form, questionnaire, topic selection, or free-text description?

- **Intake form** — Structured fields (e.g. goals, background, preferences).
- **Questionnaire** — Multiple-choice or short answers.
- **Topic selection** — Predefined options.
- **Free-text** — Open field for “What would you like to focus on?”
- Tradeoffs: structured data is easier to use; free-text is more flexible and less friction.

### Should preparation happen immediately after payment, later by email, or not at all?

- **Immediately** — On success page; higher completion, but may feel rushed.
- **Later** — Email with link; user can do it when ready; risk of forgetting.
- **Not at all** — Simpler; facilitator learns during the session.
- Open: whether preparation is required or optional.

### Which parts are optional vs potentially important?

- Some fields may be “nice to have” (e.g. preferred name).
- Others may matter for session quality (e.g. main topic, constraints).
- Business decision: what is truly optional vs. recommended vs. required.

---

## 5. Reservation Lifecycle After Confirmation

Current model: `draft`, `pending_payment`, `confirmed`, `cancelled`, `expired`. The journey does not end at `confirmed`.

### Possible later lifecycle states

| State | Meaning | Notes |
|-------|---------|------|
| `intake_pending` | Confirmed, but intake/preparation not yet done | Optional; only if we track intake. |
| `ready` | Confirmed and prepared (intake done, if applicable) | Optional. |
| `upcoming` | Session is within a defined window (e.g. next 7 days) | Derived from slot time; may not need a DB state. |
| `completed` | Session took place | Requires a completion trigger (manual or automated). |
| `no_show` | Client did not attend | Requires definition of “no show” and who sets it. |
| `cancelled` | Reservation cancelled | Already exists. |

### Tradeoffs

- **More states** — Richer reporting and automation (reminders, follow-ups) but more complexity.
- **Fewer states** — Simpler; derive some states from slot time and payment status.
- **Derived vs stored** — `upcoming` can be computed; `completed` and `no_show` likely need explicit updates.
- Open: which states are necessary for V1 vs. deferred.

---

## 6. Reminder Flow

### Do we want reminder emails/messages before the session?

- Reduces no-shows; improves preparedness.
- Risk: too many emails feel spammy; too few may be forgotten.

### If yes, what timing options make sense?

- 24–48 hours before: common default.
- 7 days before: for first-time clients who need more context.
- 1 hour before: last-minute nudge.
- Open: one reminder vs. multiple; which timings for first vs. returning clients.

### What should reminders contain?

- Session date, time, timezone.
- How to join (link, dial-in, address).
- Short preparation reminder (if applicable).
- Cancellation/reschedule policy and link.
- Possibly: “Add to calendar” link.

---

## 7. Session Completion Follow-Up

### What could happen after the session?

- **Nothing** — User leaves; no automated follow-up.
- **Thank-you email** — Simple acknowledgment.
- **Feedback request** — Survey or rating.
- **Invitation to next booking** — Link to book again.
- **Doplatok flow** — For reservation path: prompt to pay remaining amount (see `docs/SESSION-PRICING.md`).

### Follow-up email?

- When: immediately after, or 1–2 days later.
- Content: thank you, optional feedback link, next steps.

### Feedback request?

- Improves service; may feel intrusive if poorly timed.
- Open: format (stars, NPS, free text), timing, optional vs. encouraged.

### Invitation to next booking?

- Supports retention; should feel helpful, not pushy.
- Link to client zone or booking page.

### Possible additional payment / doplatok flow?

- **Product rules** (authoritative detail: `docs/SESSION-PRICING.md`, *Supplementary payment*): minimum **total** for the session is **45 €**; **no maximum** total. The supplementary page applies when **cumulative completed payments ≥ 45 €** and offers **optional** extra payment; **one** such checkout per session is expected. A **future** booking path: pay **45 €** only at booking, then optionally more later via the same supplementary rules.
- **Need:** clear communication (optional contribution, not a mandatory “remainder to 105 €”); link to payment page.
- **Open:** automated email vs. manual follow-up; timing.

### Ongoing client journey?

- Beyond a single session: rebooking, loyalty, communication cadence.
- Out of scope for this document but worth noting as a future layer.

---

## 8. Separation of Concerns

Three concepts should be kept distinct in design and implementation:

### Payment status

- `pending`, `completed`, `failed`, `expired`, `refunded`.
- Answers: “Did we get the money?”
- Source: Stripe webhook; `payments` table.

### Reservation status

- `draft`, `pending_payment`, `confirmed`, `cancelled`, `expired`, and possibly `intake_pending`, `ready`, `completed`, `no_show`.
- Answers: “What is the state of this booking?”
- Source: business logic; `reservations` table.

### Broader client journey / onboarding status

- Has the user seen “what happens next”?
- Has intake been completed?
- Has the user received reminders?
- Answers: “Where is the user in the overall experience?”
- May live in separate tables (e.g. `intake_responses`, `email_sent_log`) or be derived.

### Why separate?

- Payment can succeed while reservation is still being confirmed (race conditions).
- Reservation can be confirmed while onboarding is incomplete.
- Different systems (Stripe, booking, email) own different parts.
- Clear separation avoids conflating “paid” with “ready for session” or “onboarded.”

---

## 9. Open Product / UX Questions

- **Success page depth** — Minimal (thank you + details) vs. rich (intake, calendar, next steps)?
- **Email cadence** — How many emails between payment and session? What is the right balance?
- **Intake necessity** — Required, recommended, or optional? What fields?
- **Lifecycle granularity** — Which states are needed for V1? Which can be derived?
- **Reminder strategy** — One or many? Which timings? Different for first vs. returning?
- **Post-session automation** — What is automated vs. manual? Doplatok communication flow?
- **Client zone role** — Is it the primary hub for post-payment actions, or is email sufficient?
- **Timezone and locale** — All times in Europe/Bratislava? Slovak only or multi-language?

---

## 10. Open Questions / To Be Decided

1. **Success page** — Content, actions, and handling of “webhook not yet processed” state.
2. **Confirmation email(s)** — One vs. multiple; content; timing.
3. **Onboarding** — Page vs. email vs. both; “what happens next” placement.
4. **Intake / preparation** — Existence, format, required vs. optional, timing.
5. **Reservation lifecycle** — Final set of states; derived vs. stored.
6. **Reminders** — Yes/no; count; timing; content.
7. **Post-session** — Thank-you, feedback, doplatok, rebooking; automation level.
8. **Separation of concerns** — How to model payment vs. reservation vs. journey in schema and code.
9. **Client zone** — Primary post-payment hub or supplementary to email.
10. **V1 scope** — Which of the above are in scope for first release vs. deferred.

---

*This document is exploratory. Decisions will be captured elsewhere once made.*
