We need to redesign the booking flow after selecting a time slot.

Current problem:
After selecting a slot, a bottom panel with email input appears, but the user can still interact with the page freely. This breaks focus and reduces conversion.

Goal:
Create a focused, high-conversion flow using a modal and split time-hold logic.

---

IMPLEMENTATION SPEC

1. Replace bottom email panel with modal dialog

Trigger:
- On slot click (after successful lock)

Modal behavior:
- Centered modal
- Background dimmed
- No interaction with page behind

Content:
- Headline (SK):
  "Ešte jeden krok a termín máš rezervovaný"
- Input: email
- CTA button: "Pokračovať"

Optional:
- Small "×" close button in top-right (low emphasis)

---

2. Split hold logic into two phases

PHASE A – BEFORE EMAIL
- Lock duration: 5 minutes
- Message (SK):
  "Tento termín pre teba držíme, kým zadáš email."
- Countdown:
  - Optional small countdown OR none
  - Must NOT show 15-minute countdown here

PHASE B – AFTER EMAIL
- On email submit:
  - Extend lock to 15 minutes
- Message (SK):
  "Termín je rezervovaný. Dokonči platbu do 15 minút."
- Countdown:
  - Visible and clear (15:00)

---

3. State transitions

slotSelected → lockCreated (5 min)
→ showEmailModal
→ emailSubmitted
→ extendLock (15 min)
→ proceed to payment

---

4. UX constraints

- No scrolling or background interaction while modal is open
- Email step must feel quick and lightweight
- No unnecessary text or distractions
- Countdown must not create false urgency

---

5. Remove old behavior

- Remove bottom email panel entirely
- Remove 15-minute countdown before email step

---

Focus on clean UX, minimal UI, and strong conversion flow.