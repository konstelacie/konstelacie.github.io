require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  env: process.env.NODE_ENV || 'development',
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
  cron: {
    secret: process.env.CRON_SECRET || '',
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
