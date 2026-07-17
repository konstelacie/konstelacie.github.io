# Life Autopilot Assessment — Implementation Decisions (v1)

This document captures the agreed implementation decisions for Version 1 of the Life Autopilot Assessment. It supplements the main implementation plan and serves as the product decision reference for development.

---

# Decision 1 — Assessment Length

**Decision:** 24 questions

**Rationale**

The assessment is positioned as a professional diagnostic experience rather than a quick quiz.

Twenty-four questions allow each of the four dimensions to be measured with sufficient reliability while still keeping completion time around 3–4 minutes.

Because the interface presents one question at a time, the experience remains lightweight despite the total number of questions.

---

# Decision 2 — Back Navigation

**Decision:** Allow users to go back to previous questions.

**Rationale**

Users occasionally misread a question or accidentally select the wrong answer.

Allowing back navigation increases trust and improves response accuracy.

Back navigation should be disabled once the assessment has been submitted and results are being generated.

---

# Decision 3 — Session Recovery

**Decision:** Enable automatic resume using sessionStorage.

**Rationale**

If the page reloads or the user temporarily leaves the assessment, they should continue where they left off.

This reduces abandonment and improves the overall user experience.

---

# Decision 4 — Primary KPI

**Primary KPI**

assessment_email_unlocked

This represents a completed assessment and a qualified lead.

Additional analytics events should include:

* assessment_started
* assessment_completed
* assessment_email_unlocked
* results_viewed
* paid_diagnosis_cta_clicked
* paid_diagnosis_booked (future)

---

# Decision 5 — Paid Diagnosis CTA

**Version 1**

If online booking is unavailable:

* Join Waitlist
* Request Information
* Contact to Book

**Future Version**

Replace with direct booking:

> Book Your Life Autopilot Diagnosis

The assessment should naturally transition from identifying **what is happening** to offering a diagnosis explaining **why it is happening**.

---

# Decision 6 — Tie Handling

**Decision:** Do not hard-code a priority order.

Previous proposal:

Identity > Energy > Autopilot > Relationships

This approach has been rejected.

Instead:

If the two highest dimension scores fall within the configured threshold (recommended: within 5% or one scoring point), present both as equally important.

Example:

Primary Bottleneck

Identity Loop

Closely accompanied by

Energy Drain

The accompanying explanation should describe how the two patterns reinforce one another.

This better reflects the Life Autopilot philosophy that life operates as an interconnected system rather than a single dominant category.

---

# Decision 7 — Emailing Results

**Version 1**

No automated results email.

Results are displayed immediately after email unlock.

**Future Version**

Automatically email the personalized report.

Benefits:

* increases long-term engagement
* provides a shareable reference
* enables educational follow-up sequences
* supports conversion into the paid diagnosis

---

# Decision 8 — Marketing Consent

**Decision**

Do not require marketing consent to receive assessment results.

Instead:

Required:

* Email address (to unlock or deliver results)

Optional:

* I would like to receive future insights, articles and updates.

This creates greater trust while remaining flexible for future compliance requirements.

---

# Additional Decision 9 — Show All Four Scores

**Decision:** Yes.

Users should always see the complete Life Autopilot System rather than only the primary bottleneck.

Example:

Identity

██████████

Energy

████████░░

Autopilot

██████░░░░

Relationships

█████░░░░░

This reinforces that the assessment measures an interconnected system rather than assigning people to fixed categories.

---

# Additional Decision 10 — Success Metrics

The assessment should be monitored using a complete conversion funnel.

Recommended initial targets:

Landing Page → Assessment Started

Target:

40–60%

Assessment Started → Assessment Completed

Target:

80%+

Assessment Completed → Email Unlock

Target:

70–90%

Email Unlock → Results Viewed

Target:

95%+

Results Viewed → Paid Diagnosis CTA Click

Target:

15–30%

These benchmarks provide the basis for future optimization and A/B testing.

---

# Product Principles

The implementation should consistently support the following principles:

* The assessment is a diagnostic experience, not a survey.
* People are not labeled; their current life system is analyzed.
* Multiple bottlenecks may coexist.
* Recognition is more important than scoring.
* The results should create clarity rather than fear.
* The paid diagnosis naturally continues the journey by explaining why the identified patterns exist.

Every implementation decision should reinforce these principles.
