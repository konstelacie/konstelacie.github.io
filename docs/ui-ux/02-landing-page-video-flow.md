# Landing Page and Video Flow

## Purpose of this document

This document defines the UX logic of the landing page and the role of the video in the citimtedasom.sk funnel. It specifies structure, sequencing, and design decisions to support a single clear path from ad click to reservation.

---

## Funnel recap

1. **Facebook ad** — Opens a specific problem, hints at a new perspective, invites the user to watch a video
2. **Landing page** — Hosts the video and provides a clear path to reservation
3. **Video** — Delivers value (explanation, insight), builds trust, then invites to session
4. **Reservation** — User reserves a session and pays 10 €

Traffic flows in one direction: ad → landing page → video → CTA → reservation. No secondary actions in v1.

---

## Role of the landing page

- **Host the video** — The video is the main content. The page should put it front and centre so users can immediately fulfil the ad’s promise.
- **Remove doubts** — Answer “How does it work?”, “Who is this for?”, “What does it cost?” so users can decide without leaving the page.
- **Provide a clear path to reservation** — One primary action, repeated at key points. No competing CTAs or distractions.

---

## Role of the video

- **Create trust** — Real person, real explanation. The video should feel genuine and aligned with the ad’s promise.
- **Explain the perspective or mechanism** — Deliver what the ad promised: a clear, useful explanation of the problem or pattern.
- **Give a small useful insight** — Something the viewer can take away even if they don’t reserve. Value first.
- **Transition naturally to the session invitation** — After delivering value, introduce the session as the next step for those who want to go deeper.

---

## Recommended video structure

| Section | Purpose | Approx. |
|---------|---------|---------|
| **Opening: the problem** | Reconnect with the ad. Restate the problem or pattern so the viewer feels “this is for me.” | 15–30 s |
| **Explanation of the mechanism** | Explain why the pattern exists or how it works. Core value. | 60–90 s |
| **Short perspective / insight** | One clear takeaway. A reframe or new angle they can use immediately. | 30–45 s |
| **Invitation to session** | Introduce the session as the next step for those who want to explore this further. | 30–45 s |
| **CTA** | Direct call to reserve. “If this resonates, reserve a session for 10 €.” | 15–30 s |

Total target: ~2–4 minutes.

---

## Video length guidelines

- **~2–4 minutes** works well because:
  - Long enough to deliver real value and build trust
  - Short enough to hold attention in a cold-traffic context
  - Fits the “value first, then offer” structure without feeling like a long sales pitch
  - Aligns with typical Facebook ad → landing page behaviour (users expect a quick answer)
- Shorter than ~2 min risks feeling thin; longer than ~5 min increases drop-off before the CTA.

---

## Transition from video to CTA

- The video should **end with a clear verbal CTA** — e.g. “Reserve a session for 10 €” or equivalent.
- The **CTA button** should be visible immediately below (or beside) the video player so the next action is obvious.
- Avoid a long scroll between video end and button. The transition should feel like one step: “I’ve watched → I click.”
- Optionally, the video can briefly point to the button (“Click below to reserve”) to reinforce the action.

---

## Landing page structure (v1)

Recommended order:

1. **Video** — Primary content. User lands and watches.
2. **Primary CTA** — “Reserve session – 10 €” — right after the video.
3. **How the session works** — What happens in the session, format, duration.
4. **Who this is for / not for** — Qualify the audience. Reduces wrong-fit reservations.
5. **Pricing explanation** — Why 10 €, what it includes, no hidden costs.
6. **FAQ** — Common objections and questions.
7. **CTA again** — Repeat the primary CTA at the bottom.

**Why this order reduces friction:**

- Video first = immediate delivery of the ad’s promise.
- CTA right after video = capitalise on post-video intent.
- “How it works” and “Who it’s for” = clarity before commitment.
- Pricing = transparency, fewer surprises.
- FAQ = handle objections in place.
- Final CTA = another chance for users who scrolled for more info.

---

## Primary CTA rules

- **Always the same wording** — One phrase across the page (e.g. “Rezervovať session – 10 €”). No variation that could confuse.
- **Visually dominant** — Button stands out. Clear hierarchy.
- **Repeated multiple times** — At least after the video and at the bottom; optionally after “How it works” or FAQ if the page is long.

---

## What we intentionally do NOT include in v1

- **Email capture** — No newsletter signup, lead magnet, or pop-up. Single action only.
- **Chatbot** — No chat widget. Reduces complexity and competing entry points.
- **Multiple alternative actions** — No “Learn more,” “Contact us,” or secondary buttons that compete with reservation.

**Reason:** Maintain one clear action and simplify the first release. Secondary actions (email, chatbot) are better suited to remarketing flows once we have data and a clearer picture of drop-off points.

---

## Common mistakes to avoid

- **Too much philosophy before the CTA** — Keep the video focused. Long intros or abstract theory before the offer increase drop-off.
- **Unclear price explanation** — 10 € must be explicit. No “from 10 €” or “starting at” if the price is fixed.
- **Multiple competing actions** — Every extra button or link dilutes the primary CTA.
- **Video buried below the fold** — Users arriving from the ad expect the video immediately.
- **CTA hidden or weak** — The button must be obvious and inviting.

---

## Open questions / future iterations

- Whether to introduce secondary actions (email capture, chatbot) in a later version, and where they fit in the funnel
- Whether to A/B test different video lengths (e.g. 2 min vs. 4 min)
- Whether to personalize landing pages by topic or ad variant (e.g. different videos for different problem angles)
- Whether to add social proof (testimonials, short quotes) in v2
- How to handle mobile vs. desktop layout differences for video and CTA placement
