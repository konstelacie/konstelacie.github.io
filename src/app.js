const crypto = require('crypto');
const express = require('express');
const path = require('path');
const session = require('express-session');

const config = require('./config');
const securityHeaders = require('./middleware/securityHeaders');
const apiAccessLog = require('./middleware/apiAccessLog');
const indexRouter = require('./routes/index');
const legalRouter = require('./routes/legal');
const payBalancePageRouter = require('./routes/payBalance');
const funnelsRouter = require('./routes/funnels');
const staticRouter = require('./routes/static');
const healthRouter = require('./routes/health');
const apiRouter = require('./routes/api');
const adminRouter = require('./routes/admin');
const { router: krosRouter } = require('./routes/api/kros');
const { apiErrorHandler } = require('./middleware/apiError');

const app = express();

if (config.env === 'production') {
  app.set('trust proxy', 1);
}

app.use(securityHeaders);

app.use((req, res, next) => {
  const host = (req.get('host') || '').trim();
  if (!host.toLowerCase().startsWith('www.')) return next();

  const canonicalHost = host.slice(4);
  return res.redirect(308, `${req.protocol}://${canonicalHost}${req.originalUrl}`);
});

function resolveSessionSecret() {
  if (config.admin.sessionSecret) return config.admin.sessionSecret;
  if (config.env !== 'production') return 'dev-session-secret-change-in-prod';
  throw new Error('SESSION_SECRET is required in production');
}

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(require('express-ejs-layouts'));

// Stripe webhook: request id + access log + raw body + signature verification (see src/routes/api/stripe.js).
const stripeWebhookRouter = require('./routes/api/stripe');
function stripeWebhookRequestId(req, res, next) {
  req.id = req.get('X-Request-Id') || crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Request-Id', req.id);
  next();
}
app.use(
  '/api/stripe/webhook',
  stripeWebhookRequestId,
  apiAccessLog,
  express.raw({ type: 'application/json' }),
  stripeWebhookRouter
);

// KROS webhook: request id + access log + raw body + UTF-16LE HMAC signature verification (see src/routes/api/kros.js).
function krosWebhookRequestId(req, res, next) {
  req.id = req.get('X-Request-Id') || crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Request-Id', req.id);
  next();
}
app.use(
  '/api/kros',
  krosWebhookRequestId,
  apiAccessLog,
  express.raw({ type: 'application/json' }),
  krosRouter
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(require('cookie-parser')());

app.use(
  session({
    name: 'admin.sid',
    secret: resolveSessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.env === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

if (process.env.NODE_ENV !== 'production') {
  app.use(require('morgan')('dev'));
}

// Static assets
const projectRoot = path.join(__dirname, '..');
app.use('/assets', express.static(path.join(projectRoot, 'public', 'assets')));

app.use((req, res, next) => {
  res.locals.metaPixelId = config.metaPixelId || '';
  res.locals.showTestingBanner = Boolean(config.site && config.site.showTestingBanner);
  next();
});

// Routes (more specific first)
app.use('/api', apiRouter);
app.use('/admin', adminRouter);
app.use('/', payBalancePageRouter);
app.use('/', legalRouter);
app.use('/', funnelsRouter);
app.use('/', indexRouter);
app.use('/', staticRouter);
app.use('/', healthRouter);

app.use(apiErrorHandler);

module.exports = app;
