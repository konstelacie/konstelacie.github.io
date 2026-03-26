const crypto = require('crypto');
const { DateTime } = require('luxon');
const express = require('express');
const config = require('../config');
const { SLOT_TIMEZONE, SLOT_TIMES } = require('../config/slotGrid');
const { getPool } = require('../db');
const auditRepo = require('../db/repositories/auditRepo');
const slotsRepo = require('../db/repositories/slotsRepo');
const reservationsRepo = require('../db/repositories/reservationsRepo');
const { groupAdminSlotsByDay } = require('../lib/adminSlotDisplay');
const { mapReservationListRow, mapAdminDetail } = require('../lib/adminReservationDisplay');
const {
  parseTimeKeysFromForm,
  parseExcludeWeekends,
  buildCandidateCells,
  partitionCells,
  mapBulkPreviewError,
} = require('../lib/bulkSlotCandidates');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

const ADMIN_RESERVATION_FILTERS = ['today', 'upcoming', 'unpaid', 'confirmed', 'expired'];

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

function parseSlotIdParam(raw) {
  const id = parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function parseReturnAnchor(body) {
  const view = body && body.view === 'week' ? 'week' : 'day';
  const raw = body && typeof body.date === 'string' ? body.date : '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? raw
    : DateTime.now().setZone(SLOT_TIMEZONE).toISODate();
  return { view, date };
}

function parseReturnQuery(body) {
  const { view, date } = parseReturnAnchor(body);
  return slotsQuery(view, date);
}

function sortCellsForDisplay(cells) {
  return [...cells].sort((a, b) => {
    if (a.localDate !== b.localDate) return a.localDate.localeCompare(b.localDate);
    return a.gridIndex - b.gridIndex;
  });
}

function parseCreateSlotBody(body) {
  const date = body && typeof body.slotDate === 'string' ? body.slotDate.trim() : '';
  const timeKey = body && typeof body.timeKey === 'string' ? body.timeKey.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, code: 'INVALID_DATE' };
  }
  const idx = SLOT_TIMES.indexOf(timeKey);
  if (idx === -1) {
    return { ok: false, code: 'INVALID_TIME' };
  }
  return { ok: true, localDate: date, gridIndex: idx };
}

function parseReservationIdParam(raw) {
  const id = parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function mapReservationActionError(code) {
  switch (code) {
    case 'NOT_FOUND':
      return 'Rezervácia sa nenašla.';
    case 'INVALID_STATE':
      return 'Táto akcia nie je v aktuálnom stave dostupná.';
    case 'EMPTY_NOTE':
      return 'Zadajte text poznámky.';
    default:
      return 'Akciu sa nepodarilo vykonať.';
  }
}

function mapCreateError(code) {
  switch (code) {
    case 'INVALID_DATE':
      return 'Vyberte platný dátum.';
    case 'INVALID_TIME':
      return 'Vyberte platný čas zo zoznamu.';
    case 'DUPLICATE':
      return 'Tento termín už existuje (rovnaký dátum a čas).';
    default:
      return 'Termín sa nepodarilo vytvoriť.';
  }
}

function mapSlotActionError(code) {
  switch (code) {
    case 'NOT_FOUND':
      return 'Termín sa nenašiel.';
    case 'INVALID_STATE':
      return 'Táto akcia nie je v aktuálnom stave dostupná.';
    case 'HAS_RESERVATION':
      return 'Termín má aktívnu rezerváciu. Zablokovať sa dá len voľný termín.';
    case 'ALREADY_CANCELLED':
      return 'Termín je už zrušený.';
    default:
      return 'Akciu sa nepodarilo vykonať.';
  }
}

async function handleSlotPost(req, res, actionFn, successMessage, auditAction) {
  const returnTo = `/admin/slots${parseReturnQuery(req.body)}`;
  const slotId = parseSlotIdParam(req.params.slotId);
  if (!slotId) {
    req.session.adminFlash = { level: 'error', message: 'Neplatný termín.' };
    return res.redirect(returnTo);
  }
  try {
    const pool = getPool();
    if (!pool) {
      req.session.adminFlash = { level: 'error', message: 'Databáza nie je dostupná.' };
      return res.redirect(returnTo);
    }
    const result = await actionFn(slotId);
    if (!result.ok) {
      req.session.adminFlash = { level: 'error', message: mapSlotActionError(result.code) };
    } else {
      await auditRepo.log(auditAction, 'slot', slotId, null, 'admin');
      req.session.adminFlash = { level: 'success', message: successMessage };
    }
    return res.redirect(returnTo);
  } catch (err) {
    console.error(`[admin/${auditAction}]`, err);
    req.session.adminFlash = { level: 'error', message: 'Neznáma chyba.' };
    return res.redirect(returnTo);
  }
}

router.post('/slots/create', requireAdmin, async (req, res) => {
  const returnTo = `/admin/slots${parseReturnQuery(req.body)}`;
  const parsed = parseCreateSlotBody(req.body);
  if (!parsed.ok) {
    req.session.adminFlash = { level: 'error', message: mapCreateError(parsed.code) };
    return res.redirect(returnTo);
  }
  try {
    const pool = getPool();
    if (!pool) {
      req.session.adminFlash = { level: 'error', message: 'Databáza nie je dostupná.' };
      return res.redirect(returnTo);
    }
    const result = await slotsRepo.insertOpenSlot(parsed.localDate, parsed.gridIndex);
    if (!result.ok) {
      req.session.adminFlash = { level: 'error', message: mapCreateError(result.code) };
    } else {
      await auditRepo.log(
        'slot_created',
        'slot',
        result.id,
        { localDate: parsed.localDate, gridIndex: parsed.gridIndex },
        'admin'
      );
      req.session.adminFlash = { level: 'success', message: 'Termín bol vytvorený.' };
    }
    return res.redirect(returnTo);
  } catch (err) {
    console.error('[admin/slots/create]', err);
    req.session.adminFlash = { level: 'error', message: 'Neznáma chyba.' };
    return res.redirect(returnTo);
  }
});

router.post('/slots/bulk/preview', requireAdmin, async (req, res) => {
  const returnTo = `/admin/slots${parseReturnQuery(req.body)}`;
  const from = req.body && typeof req.body.dateFrom === 'string' ? req.body.dateFrom.trim() : '';
  const to = req.body && typeof req.body.dateTo === 'string' ? req.body.dateTo.trim() : '';
  const excludeWeekends = parseExcludeWeekends(req.body);
  const timeKeys = parseTimeKeysFromForm(req.body);

  const built = buildCandidateCells(from, to, excludeWeekends, timeKeys);
  if (!built.ok) {
    req.session.adminFlash = { level: 'error', message: mapBulkPreviewError(built.code) };
    return res.redirect(returnTo);
  }

  try {
    const pool = getPool();
    if (!pool) {
      req.session.adminFlash = { level: 'error', message: 'Databáza nie je dostupná.' };
      return res.redirect(returnTo);
    }

    const { view, date } = parseReturnAnchor(req.body);
    req.session.bulkSlotPreview = {
      from,
      to,
      excludeWeekends,
      timeKeys,
      returnView: view,
      returnDate: date,
    };

    return res.redirect('/admin/slots/bulk-preview');
  } catch (err) {
    console.error('[admin/slots/bulk/preview]', err);
    req.session.adminFlash = { level: 'error', message: 'Nepodarilo sa pripraviť náhľad.' };
    return res.redirect(returnTo);
  }
});

router.get('/slots/bulk-preview', requireAdmin, async (req, res) => {
  const d = req.session.bulkSlotPreview;
  if (!d) {
    return res.redirect('/admin/slots');
  }

  try {
    const pool = getPool();
    if (!pool) {
      delete req.session.bulkSlotPreview;
      req.session.adminFlash = { level: 'error', message: 'Databáza nie je dostupná.' };
      return res.redirect(`/admin/slots${slotsQuery(d.returnView, d.returnDate)}`);
    }

    const built = buildCandidateCells(d.from, d.to, d.excludeWeekends, d.timeKeys);
    if (!built.ok) {
      delete req.session.bulkSlotPreview;
      req.session.adminFlash = { level: 'error', message: mapBulkPreviewError(built.code) };
      return res.redirect(`/admin/slots${slotsQuery(d.returnView, d.returnDate)}`);
    }

    const existing = await slotsRepo.listSlotsCellsInRange(d.from, d.to);
    const { newCells, skippedCells } = partitionCells(built.cells, existing);

    return res.render('admin/slots-bulk-preview', {
      layout: 'layouts/admin',
      title: 'Náhľad — hromadné termíny',
      adminSection: 'slots',
      from: d.from,
      to: d.to,
      excludeWeekends: d.excludeWeekends,
      timeKeys: d.timeKeys,
      returnView: d.returnView,
      returnDate: d.returnDate,
      newCells: sortCellsForDisplay(newCells),
      skippedCells: sortCellsForDisplay(skippedCells),
      backHref: `/admin/slots/bulk-cancel`,
    });
  } catch (err) {
    console.error('[admin/slots/bulk-preview]', err);
    delete req.session.bulkSlotPreview;
    return res.redirect('/admin/slots');
  }
});

router.post('/slots/bulk/confirm', requireAdmin, async (req, res) => {
  const d = req.session.bulkSlotPreview;
  const fallback = d ? `/admin/slots${slotsQuery(d.returnView, d.returnDate)}` : '/admin/slots';

  if (!d) {
    req.session.adminFlash = { level: 'error', message: 'Relácia vypršala. Pripravte náhľad znova.' };
    return res.redirect('/admin/slots');
  }

  try {
    const pool = getPool();
    if (!pool) {
      req.session.adminFlash = { level: 'error', message: 'Databáza nie je dostupná.' };
      return res.redirect(fallback);
    }

    const built = buildCandidateCells(d.from, d.to, d.excludeWeekends, d.timeKeys);
    if (!built.ok) {
      delete req.session.bulkSlotPreview;
      req.session.adminFlash = { level: 'error', message: mapBulkPreviewError(built.code) };
      return res.redirect(fallback);
    }

    const existing = await slotsRepo.listSlotsCellsInRange(d.from, d.to);
    const { newCells, skippedCells } = partitionCells(built.cells, existing);

    if (newCells.length === 0) {
      delete req.session.bulkSlotPreview;
      req.session.adminFlash = {
        level: 'success',
        message: `Žiadne nové termíny (${skippedCells.length} už v databáze).`,
      };
      return res.redirect(fallback);
    }

    const { created } = await slotsRepo.bulkInsertOpenSlots(newCells);
    await auditRepo.log(
      'bulk_slots_created',
      'slot',
      null,
      {
        created,
        skipped: skippedCells.length,
        from: d.from,
        to: d.to,
        excludeWeekends: d.excludeWeekends,
        timeKeys: d.timeKeys,
      },
      'admin'
    );

    delete req.session.bulkSlotPreview;
    req.session.adminFlash = {
      level: 'success',
      message: `Vytvorených ${created} termínov. Preskočených (už existovalo): ${skippedCells.length}.`,
    };
    return res.redirect(fallback);
  } catch (err) {
    console.error('[admin/slots/bulk/confirm]', err);
    req.session.adminFlash = { level: 'error', message: 'Hromadné vytvorenie zlyhalo.' };
    return res.redirect(fallback);
  }
});

router.get('/slots/bulk-cancel', requireAdmin, (req, res) => {
  const d = req.session.bulkSlotPreview;
  delete req.session.bulkSlotPreview;
  const q = d ? slotsQuery(d.returnView, d.returnDate) : '';
  res.redirect(`/admin/slots${q}`);
});

router.get('/reservations', requireAdmin, async (req, res) => {
  const flash = req.session.adminFlash;
  if (flash) {
    delete req.session.adminFlash;
  }

  const rawFilter = typeof req.query.filter === 'string' ? req.query.filter : '';
  let filter = ADMIN_RESERVATION_FILTERS.includes(rawFilter)
    ? rawFilter
    : ADMIN_RESERVATION_FILTERS.includes(req.session.adminReservationFilter)
      ? req.session.adminReservationFilter
      : 'upcoming';
  req.session.adminReservationFilter = filter;

  const now = DateTime.now().setZone(SLOT_TIMEZONE);
  const todayStartUtc = now.startOf('day').toUTC().toJSDate();
  const todayEndUtc = now.endOf('day').toUTC().toJSDate();

  try {
    const pool = getPool();
    if (!pool) {
      return res.render('admin/reservations', {
        layout: 'layouts/admin',
        title: 'Rezervácie — administrácia',
        adminSection: 'reservations',
        dbConfigured: false,
        loadError: false,
        flash,
        filter,
        reservations: [],
      });
    }

    const rows = await reservationsRepo.listForAdmin({
      filter,
      todayStartUtc,
      todayEndUtc,
    });
    const reservations = rows.map((r) => mapReservationListRow(r));

    return res.render('admin/reservations', {
      layout: 'layouts/admin',
      title: 'Rezervácie — administrácia',
      adminSection: 'reservations',
      dbConfigured: true,
      loadError: false,
      flash,
      filter,
      reservations,
    });
  } catch (err) {
    console.error('[admin/reservations]', err);
    return res.status(500).render('admin/reservations', {
      layout: 'layouts/admin',
      title: 'Rezervácie — administrácia',
      adminSection: 'reservations',
      dbConfigured: !!getPool(),
      loadError: true,
      flash,
      filter,
      reservations: [],
    });
  }
});

router.post('/reservations/:id/confirm', requireAdmin, async (req, res) => {
  const id = parseReservationIdParam(req.params.id);
  const redirect = id ? `/admin/reservations/${id}` : '/admin/reservations';
  if (!id) {
    req.session.adminFlash = { level: 'error', message: 'Neplatná rezervácia.' };
    return res.redirect('/admin/reservations');
  }
  try {
    const pool = getPool();
    if (!pool) {
      req.session.adminFlash = { level: 'error', message: 'Databáza nie je dostupná.' };
      return res.redirect(redirect);
    }
    const result = await reservationsRepo.adminConfirmReservation(id);
    if (!result.ok) {
      req.session.adminFlash = { level: 'error', message: mapReservationActionError(result.code) };
    } else {
      await auditRepo.log('reservation_confirmed_admin', 'reservation', id, null, 'admin');
      req.session.adminFlash = { level: 'success', message: 'Rezervácia bola potvrdená.' };
    }
    return res.redirect(redirect);
  } catch (err) {
    console.error('[admin/reservations/confirm]', err);
    req.session.adminFlash = { level: 'error', message: 'Neznáma chyba.' };
    return res.redirect(redirect);
  }
});

router.post('/reservations/:id/cancel', requireAdmin, async (req, res) => {
  const id = parseReservationIdParam(req.params.id);
  const redirect = id ? `/admin/reservations/${id}` : '/admin/reservations';
  if (!id) {
    req.session.adminFlash = { level: 'error', message: 'Neplatná rezervácia.' };
    return res.redirect('/admin/reservations');
  }
  try {
    const pool = getPool();
    if (!pool) {
      req.session.adminFlash = { level: 'error', message: 'Databáza nie je dostupná.' };
      return res.redirect(redirect);
    }
    const result = await reservationsRepo.adminCancelReservation(id);
    if (!result.ok) {
      req.session.adminFlash = { level: 'error', message: mapReservationActionError(result.code) };
    } else {
      await auditRepo.log('reservation_cancelled_admin', 'reservation', id, null, 'admin');
      req.session.adminFlash = { level: 'success', message: 'Rezervácia bola zrušená.' };
    }
    return res.redirect(redirect);
  } catch (err) {
    console.error('[admin/reservations/cancel]', err);
    req.session.adminFlash = { level: 'error', message: 'Neznáma chyba.' };
    return res.redirect(redirect);
  }
});

router.post('/reservations/:id/external', requireAdmin, async (req, res) => {
  const id = parseReservationIdParam(req.params.id);
  const redirect = id ? `/admin/reservations/${id}` : '/admin/reservations';
  if (!id) {
    req.session.adminFlash = { level: 'error', message: 'Neplatná rezervácia.' };
    return res.redirect('/admin/reservations');
  }
  const note = typeof req.body.note === 'string' ? req.body.note : '';
  try {
    const pool = getPool();
    if (!pool) {
      req.session.adminFlash = { level: 'error', message: 'Databáza nie je dostupná.' };
      return res.redirect(redirect);
    }
    const result = await reservationsRepo.adminAppendExternalNote(id, note);
    if (!result.ok) {
      req.session.adminFlash = { level: 'error', message: mapReservationActionError(result.code) };
    } else {
      await auditRepo.log('reservation_external_note', 'reservation', id, { preview: note.slice(0, 80) }, 'admin');
      req.session.adminFlash = { level: 'success', message: 'Externé vybavenie bolo zaznamenané.' };
    }
    return res.redirect(redirect);
  } catch (err) {
    console.error('[admin/reservations/external]', err);
    req.session.adminFlash = { level: 'error', message: 'Neznáma chyba.' };
    return res.redirect(redirect);
  }
});

router.post('/reservations/:id/note', requireAdmin, async (req, res) => {
  const id = parseReservationIdParam(req.params.id);
  const redirect = id ? `/admin/reservations/${id}` : '/admin/reservations';
  if (!id) {
    req.session.adminFlash = { level: 'error', message: 'Neplatná rezervácia.' };
    return res.redirect('/admin/reservations');
  }
  const note = typeof req.body.note === 'string' ? req.body.note : '';
  try {
    const pool = getPool();
    if (!pool) {
      req.session.adminFlash = { level: 'error', message: 'Databáza nie je dostupná.' };
      return res.redirect(redirect);
    }
    const result = await reservationsRepo.adminSetNote(id, note);
    if (!result.ok) {
      req.session.adminFlash = { level: 'error', message: mapReservationActionError(result.code) };
    } else {
      await auditRepo.log('reservation_note_updated', 'reservation', id, null, 'admin');
      req.session.adminFlash = { level: 'success', message: 'Poznámka bola uložená.' };
    }
    return res.redirect(redirect);
  } catch (err) {
    console.error('[admin/reservations/note]', err);
    req.session.adminFlash = { level: 'error', message: 'Neznáma chyba.' };
    return res.redirect(redirect);
  }
});

router.get('/reservations/:id', requireAdmin, async (req, res) => {
  const id = parseReservationIdParam(req.params.id);
  if (!id) {
    return res.redirect('/admin/reservations');
  }
  const flash = req.session.adminFlash;
  if (flash) {
    delete req.session.adminFlash;
  }

  try {
    const pool = getPool();
    if (!pool) {
      return res.render('admin/reservation-detail', {
        layout: 'layouts/admin',
        title: `Rezervácia #${id}`,
        adminSection: 'reservations',
        dbConfigured: false,
        loadError: false,
        notFound: false,
        flash,
        detail: null,
        reservationId: id,
      });
    }

    const raw = await reservationsRepo.getAdminDetailById(id);
    if (!raw) {
      return res.status(404).render('admin/reservation-detail', {
        layout: 'layouts/admin',
        title: 'Rezervácia',
        adminSection: 'reservations',
        dbConfigured: true,
        loadError: false,
        notFound: true,
        flash,
        detail: null,
        reservationId: id,
      });
    }

    const detail = mapAdminDetail(raw);
    return res.render('admin/reservation-detail', {
      layout: 'layouts/admin',
      title: `Rezervácia #${id}`,
      adminSection: 'reservations',
      dbConfigured: true,
      loadError: false,
      notFound: false,
      flash,
      detail,
      reservationId: id,
    });
  } catch (err) {
    console.error('[admin/reservations/:id]', err);
    return res.status(500).render('admin/reservation-detail', {
      layout: 'layouts/admin',
      title: `Rezervácia #${id}`,
      adminSection: 'reservations',
      dbConfigured: !!getPool(),
      loadError: true,
      notFound: false,
      flash,
      detail: null,
      reservationId: id,
    });
  }
});

router.post('/slots/:slotId/block', requireAdmin, async (req, res) => {
  await handleSlotPost(req, res, slotsRepo.adminBlockSlot, 'Termín bol zablokovaný.', 'slot_blocked');
});

router.post('/slots/:slotId/unblock', requireAdmin, async (req, res) => {
  await handleSlotPost(req, res, slotsRepo.adminUnblockSlot, 'Blokovanie bolo zrušené, termín je voľný.', 'slot_unblocked');
});

router.post('/slots/:slotId/cancel', requireAdmin, async (req, res) => {
  await handleSlotPost(req, res, slotsRepo.adminCancelSlot, 'Termín bol zrušený.', 'slot_cancelled');
});

router.get('/slots', requireAdmin, async (req, res) => {
  const flash = req.session.adminFlash;
  if (flash) {
    delete req.session.adminFlash;
  }

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
        adminSection: 'slots',
        dbConfigured: false,
        loadError: false,
        flash,
        slotTimes: SLOT_TIMES,
        view,
        anchorDate: dateIso,
        bulkDateFrom: from,
        bulkDateTo: to,
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
      adminSection: 'slots',
      dbConfigured: true,
      loadError: false,
      flash,
      slotTimes: SLOT_TIMES,
      view,
      anchorDate: dateIso,
      bulkDateFrom: from,
      bulkDateTo: to,
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
      adminSection: 'slots',
      dbConfigured: !!getPool(),
      loadError: true,
      flash,
      slotTimes: SLOT_TIMES,
      view,
      anchorDate: dateIso,
      bulkDateFrom: from,
      bulkDateTo: to,
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
