const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const WINDOW_MS = 60 * 1000;

function json429(req, res) {
  res.status(429).json({
    ok: false,
    error: 'RATE_LIMITED',
    message: 'Too many requests. Try again later.',
  });
}

const limiterOptions = {
  windowMs: WINDOW_MS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
};

/** GET /api/slots — public calendar read (doc: 30–60/min). */
const slotsListLimiter = rateLimit({
  ...limiterOptions,
  max: 60,
});

/** IP budget for write-style booking routes (lock, revoke, payment mutations). */
const bookingWriteLimiter = rateLimit({
  ...limiterOptions,
  max: 40,
});

/** Extra per-slot budget for POST /api/slots/:slotId/… (reduces hammering one slot). */
const slotPostBySlotLimiter = rateLimit({
  ...limiterOptions,
  max: 20,
  keyGenerator: (req) => {
    const ip = ipKeyGenerator(req.ip || req.socket?.remoteAddress || '', 56);
    const sid = req.params?.slotId != null ? String(req.params.slotId) : 'na';
    return `slot:${sid}:${ip}`;
  },
});

const revokeLimiter = rateLimit({
  ...limiterOptions,
  max: 40,
});

const paymentsStatusLimiter = rateLimit({
  ...limiterOptions,
  max: 120,
});

const paymentsMutationLimiter = rateLimit({
  ...limiterOptions,
  max: 25,
});

/** POST /api/payments/start — per IP + email (body must be JSON-parsed). */
const paymentStartEmailLimiter = rateLimit({
  ...limiterOptions,
  max: 12,
  keyGenerator: (req) => {
    const ip = ipKeyGenerator(req.ip || req.socket?.remoteAddress || '', 56);
    const body = req.body || {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    return email ? `paystart:${ip}:${email}` : `paystart:${ip}`;
  },
});

const reservationStatusLimiter = rateLimit({
  ...limiterOptions,
  max: 120,
});

/** Brute-force protection for cron auth (secret in header). */
const cronLimiter = rateLimit({
  ...limiterOptions,
  max: 30,
});

module.exports = {
  slotsListLimiter,
  bookingWriteLimiter,
  slotPostBySlotLimiter,
  revokeLimiter,
  paymentsStatusLimiter,
  paymentsMutationLimiter,
  paymentStartEmailLimiter,
  reservationStatusLimiter,
  cronLimiter,
};
