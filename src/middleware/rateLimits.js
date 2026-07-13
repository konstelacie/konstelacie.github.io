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

/** GET /api/payments/balance/context — signed token in query; cap per IP. */
const balancePayContextLimiter = rateLimit({
  ...limiterOptions,
  max: 60,
});

/** POST /api/payments/balance/start — supplementary checkout. */
const balancePayStartLimiter = rateLimit({
  ...limiterOptions,
  max: 15,
});

/** POST /api/payments/fix-confirmation-email — client email correction after bounce. */
const paymentFixConfirmationEmailLimiter = rateLimit({
  ...limiterOptions,
  max: 10,
});

/** GET /api/slots/:slotId/lock-challenge — cooldown-style cap per IP+slot. */
const lockChallengeGetLimiter = rateLimit({
  ...limiterOptions,
  max: 15,
  keyGenerator: (req) => {
    const ip = ipKeyGenerator(req.ip || req.socket?.remoteAddress || '', 56);
    const sid = req.params?.slotId != null ? String(req.params.slotId) : 'na';
    return `lockch:${sid}:${ip}`;
  },
});

/** POST /api/support/contact — public support form on booking success page. */
const supportContactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      ok: false,
      error: 'RATE_LIMITED',
      message: 'Príliš veľa správ. Skús to prosím neskôr.',
    });
  },
});

/** GET /api/webinar/options */
const webinarOptionsLimiter = rateLimit({
  ...limiterOptions,
  max: 60,
});

/** POST /api/webinar/register */
const webinarRegisterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = ipKeyGenerator(req.ip || req.socket?.remoteAddress || '', 56);
    const body = req.body || {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    return email ? `webinar-reg:${ip}:${email}` : `webinar-reg:${ip}`;
  },
  handler: (req, res) => {
    res.status(429).json({
      ok: false,
      error: 'RATE_LIMITED',
      message: 'Príliš veľa pokusov. Skús to prosím neskôr.',
    });
  },
});

/** GET /api/webinar/room/:token */
const webinarRoomLimiter = rateLimit({
  ...limiterOptions,
  max: 120,
});

module.exports = {
  slotsListLimiter,
  bookingWriteLimiter,
  slotPostBySlotLimiter,
  lockChallengeGetLimiter,
  revokeLimiter,
  paymentsStatusLimiter,
  paymentsMutationLimiter,
  paymentStartEmailLimiter,
  reservationStatusLimiter,
  cronLimiter,
  balancePayContextLimiter,
  balancePayStartLimiter,
  paymentFixConfirmationEmailLimiter,
  supportContactLimiter,
  webinarOptionsLimiter,
  webinarRegisterLimiter,
  webinarRoomLimiter,
};
