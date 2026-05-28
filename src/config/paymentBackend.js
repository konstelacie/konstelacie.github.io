const pageVisibility = require('./pageVisibility');

const BACKENDS = ['test', 'prod'];

function parseBackend(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  return BACKENDS.includes(s) ? s : null;
}

function envSuffix(backend) {
  return backend === 'prod' ? 'PROD' : 'TEST';
}

function stripeConfig(backend) {
  const suffix = envSuffix(backend);
  return {
    publicKey: (process.env[`STRIPE_PUBLIC_KEY_${suffix}`] || '').trim(),
    secretKey: (process.env[`STRIPE_SECRET_KEY_${suffix}`] || '').trim(),
    webhookSecret: (process.env[`STRIPE_WEBHOOK_SECRET_${suffix}`] || '').trim(),
  };
}

function krosSequencePrefix(backend) {
  const suffix = envSuffix(backend);
  return (process.env[`KROS_SEQUENCE_PREFIX_${suffix}`] || '').trim();
}

function stripeWebhookSecrets() {
  return BACKENDS.map((backend) => stripeConfig(backend).webhookSecret).filter(Boolean);
}

function backendForHomeBooking() {
  return pageVisibility.getHomeMode() === 'prod' ? 'prod' : 'test';
}

function backendForFunnel(funnelName) {
  return pageVisibility.getFunnelMode(funnelName) === 'prod' ? 'prod' : 'test';
}

/** Resolve Stripe/KROS backend from internal funnel attribution id. */
function backendForFunnelName(funnelName) {
  const name = funnelName && String(funnelName).trim();
  if (!name || name === 'site') return backendForHomeBooking();
  return backendForFunnel(name);
}

function backendFromStripeLivemode(livemode) {
  return livemode ? 'prod' : 'test';
}

function requireStripeSecret(backend) {
  const { secretKey } = stripeConfig(backend);
  if (!secretKey) {
    throw new Error(`STRIPE_SECRET_KEY_${envSuffix(backend)} is not configured`);
  }
  return secretKey;
}

module.exports = {
  BACKENDS,
  stripeConfig,
  krosSequencePrefix,
  stripeWebhookSecrets,
  backendForHomeBooking,
  backendForFunnel,
  backendForFunnelName,
  backendFromStripeLivemode,
  requireStripeSecret,
  parseBackend,
};
