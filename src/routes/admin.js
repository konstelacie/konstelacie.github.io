const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

function constantTimePasswordEq(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string') return false;
  try {
    const a = crypto.createHash('sha256').update(input, 'utf8').digest();
    const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Avoid open redirects: only same-origin admin paths. */
function safeAdminNext(raw) {
  if (!raw || typeof raw !== 'string') return '/admin/slots';
  if (!raw.startsWith('/admin')) return '/admin/slots';
  if (raw.startsWith('//')) return '/admin/slots';
  return raw;
}

router.get('/', (req, res) => {
  if (req.session && req.session.adminLoggedIn) {
    return res.redirect('/admin/slots');
  }
  return res.redirect('/admin/login');
});

router.get('/login', (req, res) => {
  if (req.session && req.session.adminLoggedIn) {
    return res.redirect('/admin/slots');
  }
  const nextParam = req.query.next;
  const nextUrl = safeAdminNext(typeof nextParam === 'string' ? nextParam : '');
  res.render('admin/login', {
    layout: 'layouts/admin',
    title: 'Prihlásenie — administrácia',
    error: null,
    nextUrl,
    notConfigured: !config.admin.isConfigured(),
  });
});

router.post('/login', (req, res) => {
  if (!config.admin.isConfigured()) {
    return res.status(503).render('admin/login', {
      layout: 'layouts/admin',
      title: 'Prihlásenie — administrácia',
      error: 'Administrácia nie je nakonfigurovaná.',
      nextUrl: '/admin/slots',
      notConfigured: true,
    });
  }

  const username = typeof req.body.username === 'string' ? req.body.username : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const nextRaw = typeof req.body.next === 'string' ? req.body.next : '';
  const nextUrl = safeAdminNext(nextRaw);

  const userOk = username === config.admin.username;
  const passOk = constantTimePasswordEq(password, config.admin.password);

  if (!userOk || !passOk) {
    return res.status(401).render('admin/login', {
      layout: 'layouts/admin',
      title: 'Prihlásenie — administrácia',
      error: 'Neplatné prihlasovacie údaje',
      nextUrl,
      notConfigured: false,
    });
  }

  req.session.adminLoggedIn = true;
  req.session.save((err) => {
    if (err) {
      return res.status(500).render('admin/login', {
        layout: 'layouts/admin',
        title: 'Prihlásenie — administrácia',
        error: 'Relácia sa nepodarila uložiť. Skúste znova.',
        nextUrl,
        notConfigured: false,
      });
    }
    return res.redirect(nextUrl);
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

router.get('/slots', requireAdmin, (req, res) => {
  res.render('admin/slots', {
    layout: 'layouts/admin',
    title: 'Termíny — administrácia',
  });
});

module.exports = router;
