require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  env: process.env.NODE_ENV || 'development',
  /** Meta / Facebook Pixel — loaded only after marketing cookie consent (see cookie-consent.js). */
  metaPixelId: (process.env.META_PIXEL_ID || '').trim(),
  site: {
    /** Optional imprint line, e.g. "Ján Novák, Žilina, IČO …" */
    legalEntity: (process.env.SITE_LEGAL_ENTITY || '').trim(),
    /** Contact for privacy/terms; falls back to transactional from-email if set */
    legalEmail: (
      process.env.SITE_LEGAL_EMAIL ||
      process.env.RESEND_FROM_EMAIL ||
      ''
    ).trim(),
    /**
     * Temporary warning banner for public pages during production tests.
     * Default: on in production, off elsewhere. Set SITE_TESTING_BANNER=0 to hide.
     */
    showTestingBanner:
      process.env.SITE_TESTING_BANNER === '1' ||
      (process.env.NODE_ENV === 'production' &&
        process.env.SITE_TESTING_BANNER !== '0' &&
        String(process.env.SITE_TESTING_BANNER || '').toLowerCase() !== 'false'),
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
    },
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
    supplier: {
      companyName: (process.env.BILLING_INVOICE_COMPANY_NAME || '').trim(),
      companyAddress: (process.env.BILLING_INVOICE_COMPANY_ADDRESS || '').trim(),
      ico: (process.env.BILLING_INVOICE_ICO || '').trim(),
      dic: (process.env.BILLING_INVOICE_DIC || '').trim(),
      icDph: (process.env.BILLING_INVOICE_IC_DPH || '').trim(),
    },
  },
  kros: {
    /** Prefix for KROS numbering sequences. Empty in production, e.g. TEST in non-prod. */
    sequencePrefix: (process.env.KROS_SEQUENCE_PREFIX || '').trim(),
  },
  cron: {
    secret: process.env.CRON_SECRET || '',
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
};
