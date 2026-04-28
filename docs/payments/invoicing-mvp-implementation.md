# Invoicing MVP — implementation design (citimtedasom.sk)

**Audience:** Engineering and operations planning for a minimal internal invoicing layer.  
**Stack context:** Express 5, EJS, MySQL/MariaDB, Stripe Checkout + webhooks, Resend, existing `reservations`, `payments`, `users`, `slots`, `slot_locks`, `webhook_events` (see `docs/STRIPE-ARCHITECTURE.md`, `docs/DB-SCHEMA.md`).  
**This document:** System design, flows, data model, edge cases, rollout. **It is not** legal or tax advice. Some sections read as *proposal* for features not yet built (refund webhooks, line-item tables); the **live schema and services** are the other docs + `src/` below.

### Implementation status (repository)

| Area | Status |
|------|--------|
| **`billing_documents` / `billing_document_counters`** | **Shipped** in `src/db/migrations/001_initial.sql` — see `docs/DB-SCHEMA.md`. |
| **Insert on `checkout.session.completed`** | **Shipped** — `src/services/billingDocumentService.js` inside transaction in `src/routes/api/stripe.js`. |
| **PDF + document number + optional Resend** | **Shipped** — `src/services/billingDeliveryService.js`, `billingInvoicePdfService.js`; env in `src/config/index.js` (`billing`). |
| **Admin** | **Shipped** — `/admin/billing`, export CSV, detail, regenerate PDF, resend email, notes (`src/routes/admin.js`, `views/admin/billing-*.ejs`). |
| **KROS API migration preparation** | **In progress (Phase 0)** — env secrets `KROS_API_TOKEN`, `KROS_WEBHOOK_SECRET` added; KROS issuance/webhook processing not wired yet. |
| **`billing_document_lines`, refund/correction automation** | **Not implemented** — single header row + PDF; no `charge.refunded` pipeline yet (`docs/STRIPE-ARCHITECTURE.md` §11). |
| **Accountant gate** | Wording, numbering format on PDF, and VAT lines still need sign-off before treating customer PDFs as production-final — same as §14 **Gate**. |

**Canonical pointers:** `docs/STRIPE-ARCHITECTURE.md` §4–§8, `docs/EMAILING.md` (invoice templates), `docs/IMPLEMENTATION-SNAPSHOT.md`.

---

## 1. Purpose and scope

### Why Stripe’s receipt is not enough internally

- **Receipt vs. formal document:** Stripe issues payment receipts suitable for the payer and for Stripe’s role as payment processor. For a Slovak VAT-registered s.r.o., internal bookkeeping and handoff to an accountant typically require **issuer-side documents** that reflect *your* legal entity, VAT rate(s), line semantics (advance vs. settlement), and a **stable numbering sequence** under your control.
- **Reconciliation:** Accountants reconcile **bank/Stripe payouts**, **your issued documents**, and **service delivery**. Relying only on Stripe exports and ad hoc spreadsheets breaks traceability from **reservation/session business events** to **accounting lines**.
- **Product model:** This product mixes **reservation fee (10 €)**, **full upfront (≥ 45 €)**, and **later top-ups** against the same conceptual service. Stripe line items alone do not encode that lifecycle without extra internal structure.

### What this MVP is

- An **invoicing/document layer on top of** Stripe (source of payment truth) and the **existing application database** (reservations, payments, users).
- **In scope:** Own B2C-style services sold through the current booking funnel only; documents generated when payments succeed (or when corrections/refunds are recorded), PDF retained internally, email to customer where appropriate.
- **Out of scope:** Full general ledger, inventory, payroll, multi-currency complexity beyond EUR, automated OSS/IOSS for digital services outside SK (if ever needed), or replacing an accountant’s tools.

### What this MVP is not

- Not a full accounting system.
- Not a substitute for **accountant-confirmed** document types, wording, and sequences for SK VAT rules as applied to your exact service.

---

## 2. Supported payment scenarios

Handling below describes **target MVP behavior** aligned with today’s domain (`payments.payment_type`: `deposit`, `session`, `topup`; Stripe Checkout Session id in `provider_ref`; webhook idempotency via `webhook_events`). **Deposit / full / top-up** completion → **one `billing_documents` row per `payment_id`** is **implemented** on `checkout.session.completed`. Paths such as **automated refund webhooks** → correction/refund rows are **still to be added**; this section defines the full intended mapping.

| Scenario | Trigger | Invoicing intent (MVP) |
|----------|---------|------------------------|
| **Reservation fee (10 €)** | `checkout.session.completed` for `payment_type = deposit`, amount matches product rule | Create **internal billing document** linked to `payment_id` + `reservation_id`; classify as **deposit** (technical type). **To confirm with accountant:** whether this is legally an advance / záloha for the same service. |
| **Full payment upfront (≥ 45 €)** | `checkout.session.completed` for `payment_type = session` | **Full** (or **session_payment**) document for the paid gross; link reservation + user snapshot. |
| **Later top-up** | `checkout.session.completed` for `payment_type = topup` | **Top-up** document; must tie to same customer context (reservation and/or user) as implemented in `POST /api/payments/start`. |
| **Repeated future session payment** | Same as full or top-up on a **new** reservation/payment row | New `payments` row → new document; no automatic merge with prior reservation unless product rules require it (future). |
| **Expired Checkout Session** | `checkout.session.expired`; payment → `expired` | **No** revenue document; optional internal note only if you track abandoned checkouts for ops (not invoicing). |
| **Failed payment** | Stripe marks session/payment failed (if surfaced via API or future events) | **No** invoice; payment stays non-completed. |
| **Refunded payment** | Stripe refund (admin or API); ideally `charge.refunded` or payment-specific webhook after implementation | **Correction** or **refund** document (or **credit note**-equivalent per accountant); link to original billing document; update `refunded_at` / amounts. **To confirm with accountant:** exact document type and mandatory wording. |
| **Cancelled reservation** | Reservation `cancelled` (user/admin) | **No automatic new** positive invoice. If payment was completed: follow **refund** policy (may trigger refund + correction doc). If only pending: no document. |
| **Duplicate webhook / idempotency** | Same `evt_...` replayed | **Do not** create a second billing document: rely on existing `webhook_events.stripe_event_id` (or equivalent) **and** a **unique constraint** at the document layer (e.g. one document per `payment_id` for a given document class, or idempotency key = `payment_id` + `document_purpose`). Return success without duplicate email. |

**Principle:** One **completed** payment that should be booked as revenue should map to **at most one primary issued document** per MVP rule set; refunds/corrections are **separate** linked rows.

---

## 3. Assumptions and open accounting questions

All items below require **confirmation with your accountant** (and possibly a tax advisor). Do not treat the internal labels in this doc as final legal names.

- **Document type naming:** What are the correct Slovak/legal designations for: (a) payment on reservation, (b) payment for session before service, (c) supplementary payment after deposit, (d) final settlement after service (if ever issued), (e) storno / opravný doklad / dobropis for refunds? **To confirm with accountant.**
- **Reservation fee as advance:** Is the 10 € reservation fee treated as **záloha** on the eventual session fee, or another category? Affects text on the PDF and how “remaining balance” is explained. **To confirm with accountant.**
- **Final vs. partial documents:** After only a deposit, is a **second** document required at session completion, or is the service “closed” without a separate final invoice? **To confirm with accountant.**
- **Cross-reference between documents:** How must document B reference amounts already on document A ( záložný list vs. odkaz na zálohu)? **To confirm with accountant.**
- **VAT treatment and wording:** Standard rate vs. exemptions; text for **DPH** line; place of supply for your online session service model. **To confirm with accountant.**
- **Customer identification on issued document:** Today the funnel is **email-centric**; invoice law may require name/address for certain cases. Whether email-only on MVP documents is acceptable for your revenue level and service type. **To confirm with accountant.**
- **Refunds and corrections:** Whether each refund must produce a formal correction document, and timing relative to Stripe refund confirmation. **To confirm with accountant.**
- **Currency:** MVP assumes **EUR** only; if Stripe or future methods introduce FX, accounting treatment. **To confirm with accountant.**
- **Payout timing vs. invoice date:** Documents should follow **accrual/cash rules** as directed by accountant (typically tied to **payment received** for small B2C). **To confirm with accountant.**

---

## 4. Proposed architecture

### Principles

1. **Stripe remains the source of payment truth:** amounts captured, refunds, PaymentIntent/Charge ids, Checkout Session ids, events timeline.
2. **Application DB stores billing documents:** issuer metadata, numbers, PDF location, links to `payments` and `reservations`, snapshots.
3. **Webhooks drive creation:** On `checkout.session.completed` (and later refund events), after existing payment/reservation updates commit, enqueue or run a **document pipeline** idempotently.
4. **PDF generation is internal:** Server-side render (HTML → PDF or template engine → PDF library); no reliance on Stripe for your statutory layout (Stripe may still send its own receipt).
5. **Email (Resend) delivers** customer-facing notification with attachment when policy allows; failures retried without duplicating documents.
6. **Idempotent processing:** Same Stripe event / same payment must not create duplicate billable documents or duplicate emails.

### Minimal component view

- **Webhook handler:** Verify signature, `webhook_events` guard, update `payments` / `reservation`, insert **`billing_documents`** — `src/routes/api/stripe.js`.
- **Document service (implemented):** **`billingDocumentService.insertBillingDocumentForCompletedPayment`** — payment row + Stripe session → insert `billing_documents` (`status = recorded`, VAT split via `BILLING_VAT_RATE`).
- **Delivery (implemented):** **`billingDeliveryService.processBillingDocumentDelivery`** — after HTTP 200 to Stripe, async: allocate **`document_number`** (`billing_document_counters`), write PDF under `storage/billing-pdfs` (or `BILLING_PDF_STORAGE_DIR`), optional **`sendBillingInvoiceEmail`** unless disabled / invalid recipient. Failures logged; no separate queue worker yet.
- **Storage:** Filesystem path; DB holds `pdf_storage_ref` (relative under project or absolute if configured).

### Dependencies on existing tables

- **Join key:** `payments.id`, `payments.provider_ref` (`cs_...`), `payments.reservation_id`, `payments.user_id`, `payments.payment_type`, `payments.amount_cents`, `payments.paid_at`, `payments.status`.

---

## 5. Data model (`billing_documents`)

**Source of truth:** `src/db/migrations/001_initial.sql` and `docs/DB-SCHEMA.md`. The field list below was the design checklist; **status** in DB is `recorded` → `issued` (not `draft` on insert).

### Primary table: `billing_documents`

Central table for each issuer-side document instance. Suggested fields:

| Field | Purpose |
|-------|---------|
| `id` | Surrogate PK |
| `document_number` | Human-visible sequential number (string to allow prefixes/year) |
| `internal_type` | Enum: `deposit`, `full`, `topup`, `final`, `correction`, `refund` (see §6) |
| `status` | **Implemented enum:** `recorded`, `issued`, `void`, `superseded` (row inserted as **`recorded`**; **`issued`** when number + PDF path assigned in delivery) |
| `user_id` | FK nullable; link when known |
| `customer_email_snapshot` | Required copy at issue time |
| `customer_name_snapshot` | Optional; for future profile fields |
| `reservation_id` | FK nullable |
| `payment_id` | FK to `payments`; nullable only for rare manual-only docs |
| `stripe_checkout_session_id` | Copy of `cs_...` for search/support |
| `stripe_payment_intent_id` | If populated from session (useful reconciliation) |
| `stripe_charge_id` | If available for refunds |
| `currency` | `EUR` |
| `amount_net_cents` / `amount_vat_cents` / `amount_gross_cents` | Integer cents; must match accountant rules for rounding |
| `vat_rate` | e.g. decimal or basis points; **to confirm with accountant** |
| `issued_at` | When document logically issued |
| `paid_at` | Mirror payment completion where applicable |
| `refunded_at` | When refund completed if applicable |
| `related_document_id` | Self-FK: correction/refund points to original |
| `pdf_storage_ref` | Path or key |
| `pdf_generated_at` | Audit |
| `email_sent_at` | Last successful send |
| `email_message_id` | Resend id if available |
| `metadata` | JSON: funnel name, line descriptions, raw Stripe snippet hashes |
| `notes` | Internal-only operator notes |

### Supporting tables (optional but useful)

- **`billing_document_lines`:** Line no., description snapshot, qty, unit price, net, VAT, gross — keeps PDF and DB aligned; helps export.
- **`billing_document_events` (audit):** append-only `document_id`, `action`, `payload_json`, `created_at`, `actor` (system/admin).

### Why snapshot customer fields?

- **Immutability:** Names and emails change; the document must reflect **facts at issue time** for audit and disputes.
- **GDPR / consistency:** Clear record of what was communicated on the document without rewriting history when `users` updates.
- **Missing user row:** Email may exist only on `reservations`; snapshot preserves source.

### Uniqueness

- **Implemented:** **`UNIQUE (payment_id)`** on `billing_documents` — one primary row per completed payment on the MVP webhook path; correction/refund rows would need a follow-up design if `related_document_id` chains share payment context.

---

## 6. Recommended document types

These are **internal technical labels** for code and reports. **Accountant-facing** labels (faktúra, zálohová faktúra, daňový doklad, opravný doklad, etc.) should map 1:1 in config after accountant sign-off.

| Internal type | Typical use in this product |
|---------------|-----------------------------|
| `deposit` | Reservation fee (10 € path) |
| `full` | Single Checkout for full session amount (≥ 45 €) |
| `topup` | Additional payment after deposit or between sessions (same product rules) |
| `final` | Reserved if accountant requires a **closing** document after service (may be unused in MVP) |
| `correction` | Numeric/text adjustment to a prior document (storno chain) |
| `refund` | Mirrors refunded amount; linked via `related_document_id` |

**Separation:** Keep `internal_type` stable in code; store `display_label_sk` or derive from mapping table when generating PDF so wording can change without migrations.

---

## 7. Numbering strategy

### Goals

- **Globally unique** `document_number` in production.
- **Chronological** ordering for humans and exports (not necessarily identical to `id` order).
- **Predictable** for accountants (many practices want yearly sequences).

### Proposal

- Format: **`YYYY-NNNNN`** or prefix **`FA-YYYY-NNNNN`** — **to confirm with accountant** (legal format may constrain this).
- **Yearly reset:** Common in SK; optional continuous sequence. **To confirm with accountant.**
- **Allocation:** Use a **dedicated counter row** or `MAX+1` inside a transaction with row lock on counter table; avoid “SELECT MAX” without lock under concurrency.
- **Generation failure midway:** If DB insert succeeds but PDF fails, **do not** burn numbers: either (a) keep `status = draft` until PDF succeeds, then flip to `issued`, or (b) allocate number only at `issued`. Prefer **number at issue** with clear state machine so retries do not duplicate numbers.
- **Why not Stripe event order:** Webhooks can arrive **out-of-order** or **late**; numbering must follow **your issuance rule** (e.g. `paid_at` or transaction commit time), not `evt_...` arrival. Document sequence protects accounting narrative; Stripe ids remain cross-references.

---

## 8. Lifecycle flows

Each flow: **trigger → validation → DB → PDF → email → audit → failure handling**.

### 8.1 Reservation fee (deposit)

1. **Trigger:** `checkout.session.completed` after `payments` set to `completed`, reservation confirmed.
2. **Validation:** Amount matches configured deposit; `payment_type = deposit`; idempotency: no existing `billing_documents` for this `payment_id`.
3. **DB:** Insert `billing_documents` (`internal_type = deposit`, amounts from payment + VAT split per rules, `status = recorded`); **`issued`** when `document_number` allocated in delivery transaction.
4. **PDF:** Generate from template; store file; update `pdf_storage_ref`.
5. **Email:** Send Resend message with PDF attach (if policy says attach); subject e.g. payment confirmation + document reference (wording TBD).
6. **Audit:** Log `document_created`, `pdf_ok`, `email_sent` (or failures).
7. **Failure:** PDF fail → retry job; **no** duplicate document; email only after PDF ok unless policy allows “email without attach + link later” (**to confirm**). Email fail → retry with exponential backoff; same `email_message_id` check.

### 8.2 Full payment

- Same as deposit but `internal_type = full`, line description reflects full session payment; validation includes minimum amount rule (product: ≥ 45 €).

### 8.3 Top-up

- Same pattern; `internal_type = topup`; validate reservation/user linkage as enforced by API; **no document** if payment completed without valid context (see edge cases).

### 8.4 Refund

1. **Trigger:** Stripe refund success (webhook TBD) or admin-recorded refund after manual Stripe action.
2. **Validation:** Find original `billing_documents` by `payment_id` / charge id; ensure refund amount ≤ booked gross.
3. **DB:** Insert `correction` or `refund` row with `related_document_id`; update `payments.status = refunded` when Stripe authoritative.
4. **PDF:** Issuance rules **to confirm with accountant** (Correction document may be mandatory).
5. **Email:** Notify customer of refund/correction if required.
6. **Audit:** All state transitions logged; manual admin refund requires operator id in audit.

---

## 9. PDF requirements (MVP)

Lightweight one-page (or short) PDF, **subject to accountant template review**:

- **Supplier:** Company legal name, address, IČO, DIČ, IČ DPH (VAT ID), bank details if required on invoice-type docs. **To confirm with accountant** which fields are mandatory per document type.
- **Customer:** At MVP, likely **email** and optional name if collected later; footnote if identification is limited. **To confirm with accountant.**
- **Document title / type:** Use accountant-approved label mapping.
- **document_number**, **issue date**, **paid date** (tax point rules **to confirm with accountant**).
- **Line items:** Short service description (e.g. konzultácia / rezervácia termínu — final wording product/legal), quantity 1, unit price, net, VAT rate, VAT amount, gross.
- **Totals:** Net, VAT, gross in EUR; rounding consistent with DB.
- **Payment reference:** Stripe Checkout Session id or PaymentIntent id for support (clearly labeled as payment reference, not document number).
- **Legal/footer:** Static texts **supplied by accountant** (e.g. exempt text if any — **not assumed here**).

---

## 10. Email delivery rules

- **When:** After `billing_documents` reaches `issued` and PDF stored (unless accountant allows text-only — **to confirm**).
- **Subject style:** Include company name + short payment/document reference; avoid spam triggers; Slovak language aligned with brand.
- **Attachment:** PDF attached if generated; if **PDF fails**, do **not** send a “final” customer email that claims attachment — either retry pipeline or send **minimal** “payment received; document follows” only if honest. **To confirm with accountant** whether email must always carry the document.
- **Resend / retry:** Queue with idempotent `email_message_id`; persist state so retries do not double-send (check `email_sent_at` before send).
- **Duplicate avoidance:** Before send, verify no prior successful send for same `document_id`; use DB unique constraint on `document_id` + channel if needed.

---

## 11. Admin / backoffice needs

**Implemented** in `src/routes/admin.js` (see `docs/ui-ux/admin-interface.md` §5):

- **List/search** — `GET /admin/billing` (repo search + template filters).
- **Export CSV** — `GET /admin/billing/export.csv`.
- **Detail** — `GET /admin/billing/:id`.
- **Regenerate PDF** — `POST /admin/billing/:id/regenerate-pdf` (overwrites file; audit via `audit_logs` where logged in code).
- **Resend email** — `POST /admin/billing/:id/resend-email` (template `billing-invoice-resend`, `actor_type = admin` in `email_sent_log`).
- **Operator notes** — `POST /admin/billing/:id/note`.

**Still future:**

- **Mark manual correction** — operator creates linked `correction` / refund row from UI (strongly discouraged routine use); prefer automated refund webhook when built.
- **Export with line items** — CSV today reflects document header rows; **`billing_document_lines`** not in schema yet.

---

## 12. Edge cases

| Case | Handling |
|------|----------|
| **Webhook retried** | `webhook_events` short-circuit; document creation uses `payment_id` unique rule — second run no-ops safely. |
| **Payment exists but no reservation link** | Do not issue customer-facing document until linkage resolved or policy defines anonymous receipt; log alert; admin resolution path. |
| **Invoice generated, email failed** | Document remains valid; retry email; show in admin “email failed”. |
| **Email sent, PDF storage failed** | Avoid inconsistent state: prefer transactional order **PDF first**, then mark ready for email; if email sent without durable PDF, admin regenerate + attach in resend. |
| **Refund after invoice** | Create linked `refund`/`correction`; never delete original. |
| **Customer pays twice** | Two `payments` rows → two documents if both completed; support may refund one — triggers refund flow. |
| **Top-up without valid reservation/user context** | Block at API if possible; if data anomaly reaches webhook, **no** document or **manual** review queue — **to confirm** policy. |
| **Historical Stripe payments before invoicing MVP** | Backfill job: list `payments WHERE status = completed` without `billing_documents`; generate documents with **issue_at = paid_at** only after accountant approves backdating rules; or mark “historical import” in metadata. |

---

## 13. Security and auditability

- **Immutable snapshots:** Monetary documents should not silently change customer or amounts; corrections are **new** rows or formal reversals. Prevents fraud and simplifies disputes.
- **Audit logs:** Who/what created, regenerated PDF, resent email, voided (if ever), manual edits.
- **Actions to log:** Webhook received, idempotency hit, document insert, number allocated, PDF path, email attempt result, admin overrides.
- **Manual edits:** Minimize; if unavoidable, require **reason**, **operator id**, and optional **two-step** confirmation for production DB.

---

## 14. Rollout plan

Historical phasing below describes how the work was **planned**; **in the current codebase**, Phases 1–3 **core** items are implemented (tables, webhook insert, PDF + optional email, admin list/detail/export/regenerate/resend). Remaining work: refund/correction automation, optional line-item tables, hardened retries/queues, accountant-approved PDF copy.

### Migration update — KROS rollout

- **Phase 0 (completed):** keep internal `billing_documents` + PDF flow as source for issued documents; KROS credentials are prepared in environment (`KROS_API_TOKEN`, `KROS_WEBHOOK_SECRET`).
- **Phase 1 (in progress):** add immutable customer/supplier snapshots, KROS lifecycle columns, booking-time billing input capture, and document typing (`advance`, `settlement`, `standard`).
- **Document model in this phase:** deposit payment creates **zálohová faktúra** (`advance`); later top-up/session can create **vyúčtovacia faktúra** (`settlement`) linked to the prior advance.
- **Deferred to Phase 2:** `krosClient` implementation and `advancePaymentDeduction` mapping in outgoing KROS payload.
- **Next phases (planned):** introduce KROS API issuance for new documents, verify incoming KROS webhooks, then gradually switch operator workflows and reconciliation to KROS-backed documents.
- **Safety rule during migration:** never block successful Stripe webhook payment processing on KROS integration readiness; payment confirmation remains first-class and invoice issuance migration is layered on top.

### Phase 1 — Model + webhook mapping (no customer PDF email)

- ~~Add `billing_documents` (+ optional lines) and idempotency rules.~~ **Done** (no line table).
- ~~On `checkout.session.completed`, after current logic, create document rows~~ **Done**.

### Phase 2 — PDF + email

- ~~PDF generation + storage; Resend with attachment.~~ **Done** (`billingDeliveryService`, templates under `src/templates/emails/`).
- **Still light:** dedicated retry queue / dashboards — today **console logs** + manual admin resend.

### Phase 3 — Admin and export

- ~~List/search UI; regenerate/resend; CSV export.~~ **Done**.
- **Manual correction workflow** — not implemented.

**Gate:** Accountant sign-off on document types, wording, numbering, and VAT lines **before** sending customer-facing PDFs in production.

---

## 15. Final recommendation

- **Keep the system small:** One focused module: map **completed payments** (and later **refunds**) to **internal billing documents** with stable numbers and PDFs.
- **Do not build accounting software:** Avoid stock, multi-entity, or full double-entry in-app; export enough for the accountant’s tools.
- **Confirm tax and legal labels early:** Treat internal enums (`deposit`, `full`, etc.) as engineering convenience; replace display/PDF naming with **accountant-approved** Slovak terminology before go-live.
- **Treat Stripe as payment truth, DB documents as issuer truth** for your s.r.o.’s issued paperwork — with **idempotency** and **snapshots** so the story stays consistent under webhooks, retries, and refunds.
