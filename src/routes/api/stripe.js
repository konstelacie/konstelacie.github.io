const express = require('express');
const Stripe = require('stripe');
const { asyncHandler } = require('../../middleware/apiError');

const router = express.Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      return res.status(400).json({ ok: false, error: 'Missing signature or webhook secret' });
    }

    let event;
    try {
      event = Stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      return res.status(400).json({ ok: false, error: 'Invalid signature' });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('[Stripe webhook] checkout.session.completed', {
          eventId: event.id,
          sessionId: session.id,
          metadata: session.metadata,
        });
        // TODO: update payment by stripe_session_id, update reservation status
        break;
      }
      case 'checkout.session.expired': {
        const session = event.data.object;
        console.log('[Stripe webhook] checkout.session.expired', { eventId: event.id, sessionId: session.id });
        break;
      }
      default:
        console.log('[Stripe webhook] unhandled event', event.type, event.id);
    }

    res.status(200).json({ received: true });
  })
);

module.exports = router;
