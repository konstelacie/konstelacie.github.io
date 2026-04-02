const config = require('../config');

/**
 * Security headers (docs/security/booking.md Phase 3).
 * Set ENABLE_SECURITY_CSP=0 to disable CSP in production if something breaks.
 */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (config.env === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    if (config.security.enableCsp) {
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' https://connect.facebook.net https://www.google.com https://www.gstatic.com",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: https:",
          "font-src 'self' data:",
          "connect-src 'self' https://www.facebook.com https://connect.facebook.net",
          "frame-src 'self' https://www.google.com",
          "frame-ancestors 'self'",
        ].join('; ')
      );
    }
  }

  next();
}

module.exports = securityHeaders;
