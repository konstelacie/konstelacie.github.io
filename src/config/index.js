require('dotenv').config();

/** Shared secret for the cron HTTP endpoint; undefined if env unset or blank (see routes/api/cron.js). */
const cronSecret = (() => {
  const raw = process.env.CRON_SECRET;
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw).trim();
  return s === '' ? undefined : s;
})();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  env: process.env.NODE_ENV || 'development',
  /** Meta / Facebook Pixel — loaded only after marketing cookie consent (see cookie-consent.js). */
  metaPixelId: (process.env.META_PIXEL_ID || '').trim(),
  pageVisibility: require('./pageVisibility'),
  paymentBackend: require('./paymentBackend'),
  site: {
    /** Optional imprint override (single paragraph); overrides structured company fields when set */
    legalEntity: (process.env.SITE_LEGAL_ENTITY || '').trim(),
    legalCompanyName: (
      process.env.SITE_LEGAL_COMPANY_NAME || 'enlightening.sk s.r.o.'
    ).trim(),
    legalIco: (process.env.SITE_LEGAL_ICO || '54864895').trim(),
    /** Contact for privacy/terms and support surfaces */
    legalEmail: (
      process.env.SITE_LEGAL_EMAIL ||
      process.env.SUPPORT_EMAIL ||
      'michal@enlightening.sk'
    ).trim(),
    /** Inbound support contact form (booking success page). */
    supportEmail: (
      process.env.SUPPORT_EMAIL ||
      process.env.SITE_LEGAL_EMAIL ||
      'michal@enlightening.sk'
    ).trim(),
    /**
     * Warning banner on test-mode surfaces. Set SITE_TESTING_BANNER=0 to hide globally.
     */
    testingBannerGloballyDisabled:
      process.env.SITE_TESTING_BANNER === '0' ||
      String(process.env.SITE_TESTING_BANNER || '').toLowerCase() === 'false',
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'citim_teda_som',
  },
  email: {
    resend: {
      apiKey: process.env.RESEND_API_KEY || '',
      fromEmail: process.env.RESEND_FROM_EMAIL || '',
      fromName: process.env.RESEND_FROM_NAME || 'citimtedasom.sk',
      webhookSecret: (process.env.RESEND_WEBHOOK_SECRET || '').trim(),
    },
    /** Minutes before slot start to send session-before-start email (cron retries until start). */
    sessionBeforeStartMinutes: (() => {
      const n = parseInt(String(process.env.SESSION_BEFORE_START_EMAIL_MINUTES ?? '20').trim(), 10);
      if (!Number.isInteger(n) || n < 1) return 20;
      return Math.min(n, 24 * 60);
    })(),
  },
  /**
   * Billing PDF / supplier block on invoices (see docs/payments/invoicing-mvp-implementation.md).
   * Wording is not legal advice; confirm with accountant before live use.
   */
  billing: {
    serviceName: (process.env.BILLING_SERVICE_NAME || 'Online sprevádzanie').trim() || 'Online sprevádzanie',
    iban: (process.env.BILLING_IBAN || '').trim(),
    swift: (process.env.BILLING_SWIFT || '').trim(),
    vatRate: (() => {
      const raw = String(process.env.BILLING_VAT_RATE ?? '').trim();
      if (!raw) return 23;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return 23;
      return n <= 1 ? n * 100 : n;
    })(),
    documentPrefix: (process.env.BILLING_DOCUMENT_PREFIX || 'CT').trim() || 'CT',
    pdfStorageDir: (process.env.BILLING_PDF_STORAGE_DIR || '').trim(),
    sendInvoiceEmail:
      process.env.BILLING_SEND_INVOICE_EMAIL !== '0' &&
      String(process.env.BILLING_SEND_INVOICE_EMAIL).toLowerCase() !== 'false',
    /** Customer email when KROS webhook is delayed (Phase 4). Default on. */
    delayedEmailEnabled:
      process.env.BILLING_DELAYED_EMAIL_ENABLED !== '0' &&
      String(process.env.BILLING_DELAYED_EMAIL_ENABLED || 'true').toLowerCase() !== 'false',
    supplier: {
      companyName: (process.env.BILLING_INVOICE_COMPANY_NAME || '').trim(),
      companyAddress: (process.env.BILLING_INVOICE_COMPANY_ADDRESS || '').trim(),
      ico: (process.env.BILLING_INVOICE_ICO || '').trim(),
      dic: (process.env.BILLING_INVOICE_DIC || '').trim(),
      icDph: (process.env.BILLING_INVOICE_IC_DPH || '').trim(),
    },
  },
  kros: {
    apiToken: (process.env.KROS_API_TOKEN || '').trim(),
    webhookSecret: (process.env.KROS_WEBHOOK_SECRET || '').trim(),
    enabled: String(process.env.KROS_ENABLED || '').toLowerCase() === 'true',
    /** Minutes after KROS accept before webhook-missing recovery runs (billing-deliver-stuck). */
    stuckThresholdMinutes: (() => {
      const n = parseInt(String(process.env.KROS_STUCK_THRESHOLD_MINUTES ?? '30').trim(), 10);
      if (!Number.isInteger(n) || n < 1) return 30;
      return Math.min(n, 24 * 60);
    })(),
  },
  cronSecret,
  /** Cron health: minutes without successful /api/cron/run before critical alert. */
  cronHealth: {
    staleThresholdMinutes: (() => {
      const n = parseInt(String(process.env.CRON_STALE_THRESHOLD_MINUTES ?? '60').trim(), 10);
      if (!Number.isInteger(n) || n < 1) return 60;
      return Math.min(n, 7 * 24 * 60);
    })(),
  },
  /** Stripe payment reconciliation (detector only — no auto-repair). */
  stripeReconciliation: {
    intervalHours: (() => {
      const n = parseInt(String(process.env.STRIPE_RECONCILIATION_INTERVAL_HOURS ?? '4').trim(), 10);
      if (!Number.isInteger(n) || n < 1) return 4;
      return Math.min(n, 24 * 7);
    })(),
    lookbackHours: (() => {
      const n = parseInt(String(process.env.STRIPE_RECONCILIATION_LOOKBACK_HOURS ?? '48').trim(), 10);
      if (!Number.isInteger(n) || n < 1) return 48;
      return Math.min(n, 24 * 14);
    })(),
    maxSessionsPerBackend: (() => {
      const n = parseInt(String(process.env.STRIPE_RECONCILIATION_MAX_SESSIONS ?? '100').trim(), 10);
      if (!Number.isInteger(n) || n < 1) return 100;
      return Math.min(n, 500);
    })(),
  },
  /**
   * Phase 3 security headers. Set ENABLE_SECURITY_CSP=0 to disable CSP in production if needed.
   */
  security: {
    enableCsp: process.env.ENABLE_SECURITY_CSP !== '0',
  },
  /**
   * Adaptive captcha (docs/security/captcha.md).
   * CAPTCHA_MODE=off | shadow | enforce (default off).
   * RECAPTCHA_SECRET_KEY — server-side secret for Google siteverify (required for enforce).
   */
  captcha: (() => {
    const raw = (process.env.CAPTCHA_MODE || 'off').trim().toLowerCase();
    const mode = raw === 'shadow' || raw === 'enforce' ? raw : 'off';
    const minScore = parseFloat(process.env.RECAPTCHA_MIN_SCORE || '0.5');
    function capInt(name, def, max) {
      const n = parseInt(String(process.env[name] ?? '').trim(), 10);
      if (!Number.isInteger(n) || n < 1) return def;
      return Math.min(n, max);
    }
    const DEFAULT_VELOCITY_MS = 5 * 60 * 1000;
    /** Sliding window for per-IP POST velocity (captcha tier). Min 1 min, max 60 min. */
    function velocityWindowMs() {
      const n = parseInt(String(process.env.CAPTCHA_VELOCITY_WINDOW_MS ?? '').trim(), 10);
      if (!Number.isInteger(n) || n < 60_000) return DEFAULT_VELOCITY_MS;
      return Math.min(n, 60 * 60 * 1000);
    }
    return {
      mode,
      secret: (process.env.RECAPTCHA_SECRET_KEY || '').trim(),
      /** Public site key (funnel pages only); pair with RECAPTCHA_SECRET_KEY. */
      siteKey: (process.env.RECAPTCHA_SITE_KEY || '').trim(),
      /** reCAPTCHA v3 score threshold (ignored for v2 responses without score). */
      minScore: Number.isFinite(minScore) ? Math.min(1, Math.max(0, minScore)) : 0.5,
      /** Per-IP POST count in sliding window to trigger captcha tier (see captcha.js). */
      lockThreshold: capInt('CAPTCHA_LOCK_THRESHOLD', 25, 100_000),
      paymentStartThreshold: capInt('CAPTCHA_PAYMENT_START_THRESHOLD', 20, 100_000),
      velocityWindowMs: velocityWindowMs(),
    };
  })(),
  admin: {
    /** Plain-text env credentials for the internal admin UI (single operator). */
    username: process.env.ADMIN_USERNAME || '',
    password: process.env.ADMIN_PASSWORD || '',
    /**
     * Required for signing the admin session cookie. In development, a dev fallback is used
     * if unset (see app.js). Production should always set SESSION_SECRET.
     */
    sessionSecret: process.env.SESSION_SECRET || '',
    isConfigured() {
      return Boolean(this.username && this.password);
    },
  },
  /**
   * Funnel lead_events analytics (migrations 002+, 003 for new types).
   * Defaults when unset or invalid: both true. See .env.example and src/lib/leadEventsGate.js.
   */
  leadEvents: (() => {
    const { parseEnvFlag } = require('../lib/envFlag');
    const {
      DEFAULT_WRITES_ENABLED,
      DEFAULT_ADMIN_ENABLED,
    } = require('../lib/leadEventsGate');
    return {
      writesEnabled: parseEnvFlag(process.env.LEAD_EVENTS_ENABLED, DEFAULT_WRITES_ENABLED),
      adminEnabled: parseEnvFlag(process.env.LEAD_EVENTS_ADMIN_ENABLED, DEFAULT_ADMIN_ENABLED),
      defaults: {
        writesEnabled: DEFAULT_WRITES_ENABLED,
        adminEnabled: DEFAULT_ADMIN_ENABLED,
      },
    };
  })(),
};
