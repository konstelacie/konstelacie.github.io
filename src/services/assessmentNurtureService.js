/**
 * Post-assessment nurture sequence: enroll, send due steps, unsubscribe.
 * See docs/funnel/it-dev/023–025 and src/config/assessmentNurture.js.
 */

const { DateTime } = require('luxon');
const nurtureConfig = require('../config/assessmentNurture');
const config = require('../config');
const marketingConsentsRepo = require('../db/repositories/marketingConsentsRepo');
const emailSequenceEnrollmentsRepo = require('../db/repositories/emailSequenceEnrollmentsRepo');
const emailSentLogRepo = require('../db/repositories/emailSentLogRepo');
const emailService = require('./emailService');
const { scheduleLeadEvent } = require('../db/repositories/leadEventsRepo');
const {
  signMarketingUnsubscribeToken,
} = require('../lib/marketingUnsubscribeToken');

const ENTITY_TYPE = 'email_sequence_enrollment';

/**
 * @param {Date} enrolledAt
 * @param {number} delayDays
 * @returns {Date}
 */
function computeSendAt(enrolledAt, delayDays) {
  const tz = nurtureConfig.TIMEZONE;
  const base = DateTime.fromJSDate(enrolledAt instanceof Date ? enrolledAt : new Date(enrolledAt), {
    zone: 'utc',
  }).setZone(tz);
  const target = base.plus({ days: delayDays });
  return target.toUTC().toJSDate();
}

function buildMailtoHref(ctaEntry) {
  const to = (config.site?.supportEmail || '').trim();
  if (!to) return null;
  const subject = encodeURIComponent(ctaEntry.subject || '');
  return `mailto:${to}?subject=${subject}`;
}

/**
 * Resolve CTA URLs from config (mailto today; booking URL later).
 */
function resolveCtaLinks() {
  const primary = nurtureConfig.CTA.primary;
  const secondary = nurtureConfig.CTA.secondary;

  function resolveOne(entry) {
    if (!entry) return null;
    if (entry.type === 'url' && entry.href) {
      return { label: entry.label, href: entry.href };
    }
    const href = buildMailtoHref(entry);
    if (!href) return null;
    return { label: entry.label, href };
  }

  return {
    primary: resolveOne(primary),
    secondary: resolveOne(secondary),
  };
}

function absoluteUrl(pathAndQuery) {
  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  if (!base) return pathAndQuery;
  return `${base}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`;
}

function buildUnsubscribeUrl(enrollmentId) {
  const token = signMarketingUnsubscribeToken(enrollmentId);
  return absoluteUrl(`/odhlasenie-emailov?token=${encodeURIComponent(token)}`);
}

function companyLineFromConfig() {
  if (nurtureConfig.FOOTER.companyLine) return nurtureConfig.FOOTER.companyLine;
  const name = config.site?.legalCompanyName || '';
  const ico = config.site?.legalIco || '';
  const email = config.site?.legalEmail || '';
  const parts = [name, ico ? `IČO ${ico}` : '', email].filter(Boolean);
  return parts.join(' · ');
}

/**
 * Enroll after assessment unlock when marketing consent is granted.
 * Active enrollment: update assessment snapshot only (no restart).
 * UNSUBSCRIBED: do not re-enroll.
 * COMPLETED / CANCELLED: restart as a new cycle.
 *
 * @param {object} input
 * @returns {Promise<{ enrolled: boolean, enrollmentId?: number, reason?: string }>}
 */
async function enrollAfterAssessment(input) {
  if (!input?.marketingConsent) {
    return { enrolled: false, reason: 'no_consent' };
  }

  const email = marketingConsentsRepo.normalizeEmail(input.email);
  if (!email) return { enrolled: false, reason: 'invalid_email' };

  const consentedAt = new Date();
  await marketingConsentsRepo.grantConsent({
    email,
    source: nurtureConfig.CONSENT_SOURCE_ASSESSMENT_UNLOCK,
    consentedAt,
  });

  const existing = await emailSequenceEnrollmentsRepo.findBySequenceAndEmail(
    nurtureConfig.SEQUENCE_NAME,
    email
  );

  const snapshot = {
    assessmentSubmissionId: input.submissionId,
    primaryBottleneck: input.primaryBottleneck || null,
    secondaryBottleneck: input.secondaryBottleneck || null,
    isDualPrimary: Boolean(input.isDualPrimary),
    isBalanced: Boolean(input.isBalanced),
    isLowOverall: Boolean(input.isLowOverall),
  };

  if (existing) {
    if (existing.status === 'ACTIVE' || existing.status === 'PAUSED') {
      await emailSequenceEnrollmentsRepo.updateAssessmentSnapshot(existing.id, snapshot);
      return { enrolled: false, enrollmentId: existing.id, reason: 'already_active' };
    }
    if (existing.status === 'UNSUBSCRIBED') {
      return { enrolled: false, enrollmentId: existing.id, reason: 'unsubscribed' };
    }
    // COMPLETED or CANCELLED → restart
    const enrolledAt = new Date();
    const step1 = nurtureConfig.getStepConfig(1);
    const nextSendAt = computeSendAt(enrolledAt, step1 ? step1.delayDays : 0);
    await emailSequenceEnrollmentsRepo.restartEnrollment(existing.id, {
      ...snapshot,
      enrolledAt,
      nextSendAt,
    });
    scheduleLeadEvent('sequence_enrolled', {
      email,
      formId: input.funnelName || 'autopilot',
      sourceUrl: input.sourceUrl || null,
      providerEventId: `sequence_enrolled:${nurtureConfig.SEQUENCE_NAME}:${existing.id}:${enrolledAt.toISOString()}`,
      consentMarketing: true,
      metadata: {
        sequenceName: nurtureConfig.SEQUENCE_NAME,
        enrollmentId: existing.id,
        submissionId: input.submissionId,
        restarted: true,
      },
    });
    // Best-effort immediate E1 if due
    await processEnrollment(existing.id).catch(() => {});
    return { enrolled: true, enrollmentId: existing.id, reason: 'restarted' };
  }

  const enrolledAt = new Date();
  const step1 = nurtureConfig.getStepConfig(1);
  const nextSendAt = computeSendAt(enrolledAt, step1 ? step1.delayDays : 0);
  const { id } = await emailSequenceEnrollmentsRepo.insertEnrollment({
    sequenceName: nurtureConfig.SEQUENCE_NAME,
    email,
    ...snapshot,
    enrolledAt,
    nextSendAt,
  });

  scheduleLeadEvent('sequence_enrolled', {
    email,
    formId: input.funnelName || 'autopilot',
    sourceUrl: input.sourceUrl || null,
    providerEventId: `sequence_enrolled:${nurtureConfig.SEQUENCE_NAME}:${id}`,
    consentMarketing: true,
    metadata: {
      sequenceName: nurtureConfig.SEQUENCE_NAME,
      enrollmentId: id,
      submissionId: input.submissionId,
    },
  });

  await processEnrollment(id).catch(() => {});
  return { enrolled: true, enrollmentId: id };
}

/**
 * Send the next due step for one enrollment (idempotent).
 * @param {number} enrollmentId
 * @param {Date} [now] - Clock for due checks and last_sent_at (test UI injects a fake now)
 * @returns {Promise<{ sent: boolean, skipped?: boolean, reason?: string, enrollmentId?: number, email?: string, step?: number, templateId?: string }>}
 */
async function processEnrollment(enrollmentId, now = new Date()) {
  const enrollment = await emailSequenceEnrollmentsRepo.findById(enrollmentId);
  if (!enrollment) return { sent: false, skipped: true, reason: 'not_found' };
  if (enrollment.status !== 'ACTIVE') {
    return { sent: false, skipped: true, reason: 'not_active', enrollmentId, email: enrollment.email };
  }

  const consentOk = await marketingConsentsRepo.hasActiveConsent(enrollment.email);
  if (!consentOk) {
    await emailSequenceEnrollmentsRepo.markUnsubscribed(enrollment.id);
    return { sent: false, skipped: true, reason: 'no_consent', enrollmentId, email: enrollment.email };
  }

  const clock = now instanceof Date ? now : new Date(now);
  if (enrollment.nextSendAt && new Date(enrollment.nextSendAt) > clock) {
    return { sent: false, skipped: true, reason: 'not_due', enrollmentId, email: enrollment.email };
  }

  const nextStep = nurtureConfig.getNextStepAfter(enrollment.currentStep);
  if (!nextStep) {
    await emailSequenceEnrollmentsRepo.markStepSent(enrollment.id, {
      sentStep: enrollment.currentStep,
      sentAt: clock,
      nextSendAt: null,
      completed: true,
    });
    return { sent: false, skipped: true, reason: 'already_complete', enrollmentId, email: enrollment.email };
  }

  const templateId = nextStep.templateId;
  const alreadySent = await emailSentLogRepo.wasAlreadySent(
    templateId,
    ENTITY_TYPE,
    enrollment.id
  );
  if (alreadySent) {
    // Heal state if log exists but step not advanced
    await advanceAfterSend(enrollment, nextStep, clock);
    return {
      sent: false,
      skipped: true,
      reason: 'already_logged',
      enrollmentId,
      email: enrollment.email,
      step: nextStep.step,
      templateId,
    };
  }

  const copy = nurtureConfig.getEmailCopy(nextStep.step);
  if (!copy) {
    return {
      sent: false,
      skipped: true,
      reason: 'missing_copy',
      enrollmentId,
      email: enrollment.email,
      step: nextStep.step,
      templateId,
    };
  }

  const personalizedHtml = nurtureConfig.resolvePersonalizationHtml(
    {
      primaryBottleneck: enrollment.primaryBottleneck,
      isDualPrimary: enrollment.isDualPrimary,
      isBalanced: enrollment.isBalanced,
      isLowOverall: enrollment.isLowOverall,
    },
    nextStep.step
  );

  const ctaLinks = resolveCtaLinks();
  const showCta = copy.showCta || 'none';
  let ctaPrimary = null;
  let ctaSecondary = null;
  if (showCta === 'soft' || showCta === 'medium') {
    ctaPrimary = ctaLinks.primary;
  } else if (showCta === 'primary') {
    ctaPrimary = ctaLinks.primary;
    ctaSecondary = ctaLinks.secondary;
  }

  const unsubscribeUrl = buildUnsubscribeUrl(enrollment.id);

  const result = await emailService.sendAssessmentNurtureEmail(
    {
      to: enrollment.email,
      templateId,
      subject: copy.subject,
      preview: copy.preview,
      paragraphs: copy.paragraphs,
      closingParagraphs: copy.closingParagraphs || [],
      personalizedHtml,
      ctaPrimary,
      ctaSecondary,
      whyReceiving: nurtureConfig.FOOTER.whyReceiving,
      companyLine: companyLineFromConfig(),
      unsubscribeLabel: nurtureConfig.FOOTER.unsubscribeLabel,
      unsubscribeUrl,
    },
    { entity_type: ENTITY_TYPE, entity_id: enrollment.id }
  );

  if (!result.ok) {
    return {
      sent: false,
      skipped: Boolean(result.skipped),
      reason: result.skipped ? 'provider_skipped' : 'send_failed',
      enrollmentId,
      email: enrollment.email,
      step: nextStep.step,
      templateId,
    };
  }

  await advanceAfterSend(enrollment, nextStep, clock);

  scheduleLeadEvent('email_sent', {
    email: enrollment.email,
    formId: 'assessment_nurture',
    providerEventId: `email_sent:${nurtureConfig.SEQUENCE_NAME}:${enrollment.id}:${nextStep.step}`,
    consentMarketing: true,
    metadata: {
      sequenceName: nurtureConfig.SEQUENCE_NAME,
      enrollmentId: enrollment.id,
      step: nextStep.step,
      templateId,
      messageId: result.messageId || null,
    },
  });

  const afterNext = nurtureConfig.getNextStepAfter(nextStep.step);
  if (!afterNext) {
    scheduleLeadEvent('sequence_completed', {
      email: enrollment.email,
      formId: 'assessment_nurture',
      providerEventId: `sequence_completed:${nurtureConfig.SEQUENCE_NAME}:${enrollment.id}`,
      consentMarketing: true,
      metadata: {
        sequenceName: nurtureConfig.SEQUENCE_NAME,
        enrollmentId: enrollment.id,
      },
    });
  }

  return {
    sent: true,
    enrollmentId: enrollment.id,
    email: enrollment.email,
    step: nextStep.step,
    templateId,
  };
}

async function advanceAfterSend(enrollment, sentStepConfig, sentAt) {
  const following = nurtureConfig.getNextStepAfter(sentStepConfig.step);
  if (!following) {
    await emailSequenceEnrollmentsRepo.markStepSent(enrollment.id, {
      sentStep: sentStepConfig.step,
      sentAt,
      nextSendAt: null,
      completed: true,
    });
    return;
  }
  const nextSendAt = computeSendAt(enrollment.enrolledAt, following.delayDays);
  await emailSequenceEnrollmentsRepo.markStepSent(enrollment.id, {
    sentStep: sentStepConfig.step,
    sentAt,
    nextSendAt,
    completed: false,
  });
}

/**
 * Cron / test UI: process all due enrollments.
 * @param {number} [limit=100]
 * @param {Date} [now] - Injected clock (defaults to real now)
 */
async function processDueEnrollments(limit = 100, now = new Date()) {
  const clock = now instanceof Date ? now : new Date(now);
  const due = await emailSequenceEnrollmentsRepo.findDue(clock, limit);
  let sent = 0;
  let skipped = 0;
  const errors = [];
  const results = [];

  for (const row of due) {
    try {
      const result = await processEnrollment(row.id, clock);
      results.push(result);
      if (result.sent) sent++;
      else skipped++;
    } catch (err) {
      errors.push(`enrollment ${row.id}: ${err.message || String(err)}`);
    }
  }

  return { due: due.length, sent, skipped, errors, results };
}

/**
 * One-click unsubscribe by enrollment token payload.
 * @param {number} enrollmentId
 */
async function unsubscribeByEnrollmentId(enrollmentId) {
  const enrollment = await emailSequenceEnrollmentsRepo.findById(enrollmentId);
  if (!enrollment) {
    return { ok: false, reason: 'not_found' };
  }

  const at = new Date();
  await marketingConsentsRepo.withdrawConsent(enrollment.email, at);
  const affected = await emailSequenceEnrollmentsRepo.unsubscribeAllForEmail(
    enrollment.email,
    at
  );

  if (enrollment.status === 'ACTIVE' || enrollment.status === 'PAUSED' || affected > 0) {
    scheduleLeadEvent('sequence_unsubscribed', {
      email: enrollment.email,
      formId: 'assessment_nurture',
      providerEventId: `sequence_unsubscribed:${nurtureConfig.SEQUENCE_NAME}:${enrollment.id}:${at.toISOString()}`,
      consentMarketing: false,
      metadata: {
        sequenceName: enrollment.sequenceName,
        enrollmentId: enrollment.id,
        sequencesUpdated: affected,
      },
    });
  }

  return { ok: true, email: enrollment.email, alreadyUnsubscribed: enrollment.status === 'UNSUBSCRIBED' };
}

/**
 * Manual cancel (admin / ops) — does not withdraw global marketing consent.
 */
async function cancelEnrollment(enrollmentId) {
  await emailSequenceEnrollmentsRepo.markCancelled(enrollmentId);
  return { ok: true };
}

module.exports = {
  enrollAfterAssessment,
  processEnrollment,
  processDueEnrollments,
  unsubscribeByEnrollmentId,
  cancelEnrollment,
  computeSendAt,
  resolveCtaLinks,
  ENTITY_TYPE,
};
