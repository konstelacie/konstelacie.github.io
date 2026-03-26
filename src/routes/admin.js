const crypto = require('crypto');
const { DateTime } = require('luxon');
const express = require('express');
const config = require('../config');
const { SLOT_TIMEZONE } = require('../config/slotGrid');
const { getPool } = require('../db');
const slotsRepo = require('../db/repositories/slotsRepo');
const { groupAdminSlotsByDay } = require('../lib/adminSlotDisplay');
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

function parseView(raw) {
  return raw === 'week' ? 'week' : 'day';
}

function parseAnchorDate(raw) {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = DateTime.fromISO(raw, { zone: SLOT_TIMEZONE });
    if (d.isValid) return d.startOf('day');
  }
  return DateTime.now().setZone(SLOT_TIMEZONE).startOf('day');
}

function resolveDateRange(view, anchor) {
  if (view === 'week') {
    const monday = anchor.minus({ days: anchor.weekday - 1 });
    const sunday = monday.plus({ days: 6 });
    return { from: monday.toISODate(), to: sunday.toISODate() };
  }
  const d = anchor.startOf('day');
  return { from: d.toISODate(), to: d.toISODate() };
}

function slotsQuery(view, dateIso) {
  return `?view=${encodeURIComponent(view)}&date=${encodeURIComponent(dateIso)}`;
}

router.get('/slots', requireAdmin, async (req, res) => {
  const view = parseView(req.query.view);
  const anchor = parseAnchorDate(typeof req.query.date === 'string' ? req.query.date : '');
  const { from, to } = resolveDateRange(view, anchor);
  const dateIso = anchor.toISODate();

  const prevAnchor = anchor.plus({ days: view === 'week' ? -7 : -1 });
  const nextAnchor = anchor.plus({ days: view === 'week' ? 7 : 1 });

  const queryPrev = slotsQuery(view, prevAnchor.toISODate());
  const queryNext = slotsQuery(view, nextAnchor.toISODate());
  const queryDayToggle = slotsQuery('day', dateIso);
  const queryWeekToggle = slotsQuery('week', dateIso);

  let rangeLabel;
  if (view === 'week') {
    const fromDt = DateTime.fromISO(from, { zone: SLOT_TIMEZONE });
    const toDt = DateTime.fromISO(to, { zone: SLOT_TIMEZONE });
    rangeLabel = `${fromDt.setLocale('sk').toLocaleString(DateTime.DATE_MED)} — ${toDt.setLocale('sk').toLocaleString(DateTime.DATE_MED)}`;
  } else {
    rangeLabel = anchor.setLocale('sk').toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY);
  }

  try {
    const pool = getPool();
    if (!pool) {
      return res.render('admin/slots', {
        layout: 'layouts/admin',
        title: 'Termíny — administrácia',
        dbConfigured: false,
        loadError: false,
        view,
        anchorDate: dateIso,
        rangeLabel,
        days: [],
        queryPrev,
        queryNext,
        queryDayToggle,
        queryWeekToggle,
      });
    }

    const rows = await slotsRepo.listSlotsForAdmin(from, to);
    const days = groupAdminSlotsByDay(rows, from, to);

    return res.render('admin/slots', {
      layout: 'layouts/admin',
      title: 'Termíny — administrácia',
      dbConfigured: true,
      loadError: false,
      view,
      anchorDate: dateIso,
      rangeLabel,
      days,
      queryPrev,
      queryNext,
      queryDayToggle,
      queryWeekToggle,
    });
  } catch (err) {
    console.error('[admin/slots]', err);
    return res.status(500).render('admin/slots', {
      layout: 'layouts/admin',
      title: 'Termíny — administrácia',
      dbConfigured: !!getPool(),
      loadError: true,
      view,
      anchorDate: dateIso,
      rangeLabel,
      days: [],
      queryPrev,
      queryNext,
      queryDayToggle,
      queryWeekToggle,
    });
  }
});

module.exports = router;
