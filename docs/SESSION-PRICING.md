# Session Pricing Model

**For AI assistants (Cursor, Copilot, etc.):** This document defines the product logic and UX for session payments. Use it when implementing pricing UI, copy, or payment flows. Do not infer technical implementation—this doc describes *what* to build, not *how*.

---

## Philosophy

The pricing model balances three goals:

1. **Accessibility** — People with lower income can still attend.
2. **Fair value** — The service is priced fairly for its value.
3. **Generous contribution** — Those who can afford more may contribute more.

To achieve this, the system combines:

- **Reservation option** — Low upfront commitment.
- **Flexible full payment option** — Pay what feels right within a clear minimum.

---

## Flow context

After selecting a slot and entering email, the user chooses one of the two payment paths below. Confirmation is shown only after successful payment (see `docs/RESERVATION-SYSTEM-ARCHITECTURE.md`).

---

## First Session Pricing

Users choose between two payment paths.

### Option 1 — Reservation

**Reservation fee:** 10 €

**Purpose:** Allows people to reserve a time slot with minimal commitment.

**Rules:**

- User pays 10 € to reserve the session.
- After the session, they may optionally pay more.
- To continue with future sessions, the total paid amount must reach at least **45 €**.

**UI copy:**

| Element | Text |
|---------|------|
| Option title | Reserve the session |
| Description | Pay a small reservation fee now and decide the final amount after the session. |
| Button | Reserve for 10 € |

---

### Option 2 — Pay Full Amount Now

Users may pay the full session amount immediately.

**Amounts:**

- **Minimum payment:** 45 €
- **Suggested amount:** 85 €
- **No product maximum** — tiers such as 65 €, 85 €, and 105 € are suggestions only; the user may pay more (including custom amounts above 105 €).

Users may select one of several suggested options or enter their own amount.

**Suggested options (exact labels):**

| Amount | Label |
|--------|-------|
| 45 € | reduced amount |
| 65 € | *(no label)* |
| 85 € | recommended amount |
| 105 € | supportive amount |

**Custom amount:** Allowed, with a minimum of 45 €. When the user selects custom, the input defaults to 125 €.

**UI copy:**

| Element | Text |
|---------|------|
| Minimum amount | Minimum amount: 45 € |
| Recommended amount | Recommended amount: 85 € |

---

## Future Sessions Pricing

For all sessions after the first one:

**Reservation amount:** 45 €

Users may optionally contribute more. There is **no product maximum** on the total paid for the session; suggested amounts below are guidance only.

**Suggested options (exact labels):**

| Amount | Label |
|--------|-------|
| 45 € | session reservation |
| 65 € | *(no label)* |
| 85 € | recommended amount |
| 105 € | supportive amount |

**Custom amount:** Allowed. When the user selects custom, the input defaults to 125 €.

---

## Supplementary payment (doplatok, same session)

This section covers an **optional** extra payment for **one** session after the **minimum session total** is already satisfied. Use it when designing the email-linked “pay more” page and related copy (see also `docs/EMAILING.md`, `docs/POST-PAYMENT-CLIENT-JOURNEY.md`).

### Minimum and maximum (totals)

- **Minimum total** paid toward the session (sum of completed payments for that reservation): **45 €**. Until that is reached, the user completes payment through the normal booking checkout, not the supplementary page.
- **No maximum total** — the product does not cap the session total at 105 € or any other amount. Values like 65 €, 85 €, and 105 € remain **suggested** targets for convenience and tone, not ceilings.

### When the supplementary flow applies

- **Cumulative completed payments ≥ 45 €** for that reservation. The page invites an **optional** additional amount (user may choose not to pay more).
- **Later booking variant (planned):** The user may pay **only 45 €** at booking to meet the minimum immediately, then **decide later** whether to contribute more. That optional “more” uses the **same** supplementary-payment rules as someone who reached 45 € via a smaller reservation fee plus earlier payments.

### One checkout per session (expectation)

- The product **expects at most one** intended supplementary payment checkout per session (one optional “doplatok” step), not a repeated ladder of follow-up payments. Implementation may still enforce idempotency or business rules as needed.

### Relating suggested totals to “how much to add now”

- For UX, optional radios can show **additional** amounts such that **paid so far + supplement** equals familiar totals (45 €, 65 €, 85 €, 105 €, or custom ≥ minimum). Because there is **no maximum**, **custom** should allow any **supplement** that keeps transparency (and any legal/accounting constraints) without treating 105 € as a required or maximum total.

---

## UI/UX Principles

The interface must feel:

- **Simple** — Clear choices, no clutter.
- **Transparent** — Rules and amounts are visible and understandable.
- **Non-pressuring** — No urgency or guilt.
- **Respectful** — Users can choose according to their situation.

**UX rules:**

1. The recommended amount (85 €) must be preselected.
2. The minimum price must not appear as the default.
3. Language must avoid pressure or guilt.
4. Users must feel free to choose according to their financial situation.

---

## Tone of Communication

Pricing text should emphasize:

- Freedom of choice
- Trust
- Fairness

**Avoid:**

- Sales pressure
- Scarcity language (e.g. "limited spots", "last chance")
- Manipulative framing

**Example tone:**

> "You can choose the amount that feels right for you."

---

## Quick Reference

| Context | Reservation | Minimum total | Recommended (suggestion, not cap) |
|---------|-------------|---------------|-------------------------------------|
| First session | 10 € | 45 € (full payment or cumulative) | 85 € |
| Future sessions | 45 € | 45 € | 85 € |
| Supplementary (same session) | — | 45 € cumulative before page applies | Optional; no max total |
