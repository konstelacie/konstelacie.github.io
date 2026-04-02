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
  cron: {
    secret: process.env.CRON_SECRET || '',
  },
  /**
   * Phase 3 security headers. Set ENABLE_SECURITY_CSP=0 to disable CSP in production if needed.
   */
  security: {
    enableCsp: process.env.ENABLE_SECURITY_CSP !== '0',
  },
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
