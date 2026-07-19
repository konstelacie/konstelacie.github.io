# 014 — Life Autopilot Assessment — Scoring & Interpretation Framework (v1)

**Status:** Scoring & dual-primary rules (canonical)  
**Entry:** [`016`](016-assessment-v1-summary.md) · [`README`](README.md)  
**Code:** `src/lib/assessmentScoring.js` / `/assets/js/assessment-scoring.js`

## Purpose

This document defines how responses are converted into meaningful assessment results.

The goal is **not** mathematical complexity.

The goal is to produce results that feel:

* accurate
* understandable
* trustworthy
* actionable

The assessment should always communicate patterns—not certainty.

---

# Guiding Philosophy

The Life Autopilot Assessment does not measure personality.

It measures the current state of four interconnected life systems.

These systems naturally influence one another.

For this reason:

* multiple bottlenecks may exist simultaneously
* scores represent tendencies rather than facts
* results describe the present, not permanent identity

---

# Dimensions

The assessment measures four independent dimensions.

| Dimension     | Measures                                            |
| ------------- | --------------------------------------------------- |
| Autopilot     | Intentional living vs automatic functioning         |
| Identity      | Self-worth driven by achievement and responsibility |
| Energy        | Balance between demands and recovery                |
| Relationships | Emotional connection versus functional interaction  |

Each dimension is scored independently.

No overall score is calculated.

---

# Question Scoring

Likert values:

| Response                   | Score |
| -------------------------- | ----: |
| Strongly disagree          |     1 |
| Disagree                   |     2 |
| Neither agree nor disagree |     3 |
| Agree                      |     4 |
| Strongly agree             |     5 |

Reverse-scored questions are inverted.

Example:

1 → 5

2 → 4

3 → 3

4 → 2

5 → 1

---

# Dimension Score

Each dimension contains six questions.

Maximum score:

30

Minimum score:

6

The displayed result should be normalized to a percentage.

Formula:

```
(score - minimum) / (maximum - minimum)
```

Result:

0–100%

This makes future weighting and additional questions easier without changing the presentation.

---

# Primary Bottleneck

The highest normalized score becomes the Primary Bottleneck.

This represents the area where the user's life system currently appears to experience the greatest pressure.

The wording should remain intentionally cautious.

Preferred language:

> "Your responses suggest..."

> "Your current life system appears to be most affected by..."

Avoid:

> "You are..."

---

# Secondary Bottleneck

The second-highest score is always calculated.

If the difference from the highest score exceeds the tie threshold, it is displayed as:

Secondary Pattern

If the difference falls within the tie threshold, both dimensions are presented together.

Example:

Primary Bottlenecks

Identity Loop

Energy Drain

Accompanying text:

These two patterns often reinforce one another.

When self-worth becomes closely tied to achievement, recovery is frequently pushed aside.

Over time, reduced energy can make achievement feel increasingly necessary, creating a self-reinforcing cycle.

---

# Tie Threshold

Recommended threshold:

5%

Equivalent to approximately one response point across the six questions.

Future versions may adjust this threshold after analyzing real assessment data.

---

# Confidence Level

Version 1 does not display confidence levels.

Internally, confidence may later be estimated based on:

* score separation
* response consistency
* completion behavior
* future validation studies

This is reserved for future versions.

---

# Visual Representation

Results should always display all four dimensions.

Example:

```
Life Autopilot System

Identity        ██████████

Energy          ████████░░

Autopilot       ██████░░░░

Relationships   █████░░░░░
```

The visual reinforces that life consists of interconnected systems rather than isolated problems.

---

# Interpretation Rules

Results should describe:

* recurring tendencies
* everyday experiences
* observable patterns

Results should never claim:

* causes
* diagnoses
* personality traits
* certainty

The paid diagnosis explores the causes.

The assessment identifies the patterns.

---

# Handling Balanced Scores

Sometimes all four dimensions may score similarly.

This should not be treated as an error.

Instead, display:

> Your responses suggest that no single area clearly stands out. Several parts of your life system appear to be influencing one another.

This becomes an opportunity to explain that the paid diagnosis examines interactions between systems rather than focusing on a single bottleneck.

---

# Handling Low Scores

If all four dimensions remain relatively low, avoid implying that the user has "passed."

Suggested wording:

> Your responses suggest that your life system currently appears relatively balanced.

Even well-functioning systems benefit from regular reflection and adjustment as life circumstances change.

The assessment is designed to identify patterns, not perfection.

---

# Future Weighting

Version 1 assigns equal weight to every question.

Future versions may introduce weighting based on:

* predictive value
* client interviews
* score distributions
* longitudinal observations
* statistical validation

Weighting should only be introduced when supported by sufficient evidence.

---

# Version Evolution

Every completed assessment improves the methodology.

Recommended review cycle:

After the first 25 paid diagnoses:

* review score distributions
* identify frequently selected responses
* compare assessment results with diagnosis outcomes
* rewrite unclear questions
* adjust tie thresholds if necessary

After 100+ completed assessments:

* evaluate reliability
* identify weak questions
* refine wording
* consider weighting
* improve recommendations

After 500+ assessments:

* validate recurring bottleneck combinations
* identify additional system interactions
* improve interpretation rules
* explore segmentation by demographic or life stage

The methodology should evolve continuously while preserving the four-dimensional framework.

---

# Product Philosophy

The assessment should never pretend to know everything.

Its purpose is not to explain the whole person.

Its purpose is to identify where meaningful attention is most likely to create positive change.

The assessment answers:

> **What appears to be happening?**

The Life Autopilot Diagnosis answers:

> **Why is it happening?**

This distinction should remain central to every future version of the methodology.
