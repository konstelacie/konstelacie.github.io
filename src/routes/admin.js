const crypto = require('crypto');
const { DateTime } = require('luxon');
const express = require('express');
const config = require('../config');
const { SLOT_TIMEZONE, SLOT_TIMES, timeKeyForGridIndex } = require('../config/slotGrid');
const { getPool } = require('../db');
const auditRepo = require('../db/repositories/auditRepo');
const slotsRepo = require('../db/repositories/slotsRepo');
const reservationsRepo = require('../db/repositories/reservationsRepo');
const { groupAdminSlotsByDay, mapAdminSlotDetail } = require('../lib/adminSlotDisplay');
const { mapReservationListRow, mapAdminDetail } = require('../lib/adminReservationDisplay');
const {
  parseTimeKeysFromForm,
  parseExcludeWeekends,
  buildCandidateCells,
  partitionCells,
  mapBulkPreviewError,
  resolveBulkFormDateDefaults,
  MAX_BULK_RANGE_DAYS,
} = require('../lib/bulkSlotCandidates');
const { requireAdmin } = require('../middleware/requireAdmin');
const { MIN_SESSION_TOTAL_EUR } = require('../lib/bookingCheckoutAmounts');
const billingDocumentsRepo = require('../db/repositories/billingDocumentsRepo');
const locksRepo = require('../db/repositories/locksRepo');
const billingDeliveryService = require('../services/billingDeliveryService');
const { syncToKros } = require('../services/krosInvoiceService');
const { mapBillingListRow, mapBillingDetailRow, csvEscape } = require('../lib/adminBillingDisplay');
const { mysqlLocalDateToYmd } = require('../lib/slotApiMap');
const { resolveBalancePayAdminLink } = require('../lib/balancePayAdminLink');
const emailService = require('../services/emailService');
const { logLine } = require('../lib/structuredLog');

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

function formatDbInstantForAdmin(value) {
  if (value == null) return '';
  const asDate = value instanceof Date ? value : new Date(value);
  const d = DateTime.fromJSDate(asDate, { zone: 'utc' });
  if (!d.isValid) return String(value);
  return d.setZone(SLOT_TIMEZONE).setLocale('sk').toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS);
}

router.get('/maintenance', requireAdmin, async (req, res) => {
  const flash = req.session.adminFlash;
  if (flash) {
    delete req.session.adminFlash;
  }
  const pool = getPool();
  if (!pool) {
    return res.render('admin/maintenance', {
      layout: 'layouts/admin',
      title: 'Údržba — administrácia',
      adminSection: 'maintenance',
      dbConfigured: false,
      loadError: false,
      flash,
      stats: null,
      previewRows: [],
      oldestExpiredLabel: '',
      purgeBatchMax: locksRepo.EXPIRED_LOCK_PURGE_BATCH_MAX,
      slotStats: null,
      slotPreviewRows: [],
      oldestSlotEndLabel: '',
      slotPurgeBatchMax: slotsRepo.OLD_UNUSED_SLOT_PURGE_BATCH_MAX,
    });
  }
  try {
    const [stats, slotMaint] = await Promise.all([
      locksRepo.getSlotLocksMaintenanceStats(),
      slotsRepo.getOldUnusedSlotsMaintenanceStats(),
    ]);
    const [rawPreview, rawSlotPreview] = await Promise.all([
      locksRepo.listExpiredSlotLocksPreview(5),
      slotsRepo.listOldUnusedSlotsPreview(5),
    ]);
    const previewRows = rawPreview.map((row) => ({
      id: row.id,
      slot_id: row.slot_id,
      expiresLabel: formatDbInstantForAdmin(row.expires_at),
    }));
    const oldestExpiredLabel = stats.oldestExpiredAt ? formatDbInstantForAdmin(stats.oldestExpiredAt) : '';
    const slotPreviewRows = rawSlotPreview.map((row) => ({
      id: row.id,
      localDateLabel: mysqlLocalDateToYmd(row.local_date),
      timeKey: timeKeyForGridIndex(Number(row.grid_index)),
      status: row.status,
      endLabel: formatDbInstantForAdmin(row.end_at_utc),
    }));
    const oldestSlotEndLabel = slotMaint.oldestEndAt ? formatDbInstantForAdmin(slotMaint.oldestEndAt) : '';
    const slotStats = { deletable: slotMaint.deletable };
    return res.render('admin/maintenance', {
      layout: 'layouts/admin',
      title: 'Údržba — administrácia',
      adminSection: 'maintenance',
      dbConfigured: true,
      loadError: false,
      flash,
      stats,
      previewRows,
      oldestExpiredLabel,
      purgeBatchMax: locksRepo.EXPIRED_LOCK_PURGE_BATCH_MAX,
      slotStats,
      slotPreviewRows,
      oldestSlotEndLabel,
      slotPurgeBatchMax: slotsRepo.OLD_UNUSED_SLOT_PURGE_BATCH_MAX,
    });
  } catch (err) {
    console.error('[admin/maintenance]', err);
    return res.status(500).render('admin/maintenance', {
      layout: 'layouts/admin',
      title: 'Údržba — administrácia',
      adminSection: 'maintenance',
      dbConfigured: true,
      loadError: true,
      flash,
      stats: null,
      previewRows: [],
      oldestExpiredLabel: '',
      purgeBatchMax: locksRepo.EXPIRED_LOCK_PURGE_BATCH_MAX,
      slotStats: null,
      slotPreviewRows: [],
      oldestSlotEndLabel: '',
      slotPurgeBatchMax: slotsRepo.OLD_UNUSED_SLOT_PURGE_BATCH_MAX,
    });
  }
});

router.post('/maintenance/delete-expired-slot-locks', requireAdmin, async (req, res) => {
  const confirmOn = req.body && req.body.confirm === 'on';
  if (!confirmOn) {
    req.session.adminFlash = { level: 'error', message: 'Potvrďte akciu zaškrtnutím políčka.' };
    return res.redirect('/admin/maintenance');
  }
  try {
    const pool = getPool();
    if (!pool) {
      req.session.adminFlash = { level: 'error', message: 'Databáza nie je dostupná.' };
      return res.redirect('/admin/maintenance');
    }
    const deleted = await locksRepo.deleteExpiredSlotLocksBatch(locksRepo.EXPIRED_LOCK_PURGE_BATCH_MAX);
    const statsAfter = await locksRepo.getSlotLocksMaintenanceStats();
    await auditRepo.log(
      'slot_locks_expired_purged',
      'slot_lock',
      null,
      { deleted, expiredRemaining: statsAfter.expired },
      'admin'
    );
    let message = `Zmazaných ${deleted} expirovaných záznamov zámku.`;
    if (statsAfter.expired > 0) {
      message += ` Ešte ich ostáva ${statsAfter.expired} — môžete spustiť znova.`;
    } else if (deleted === 0) {
      message = 'Žiadne expirované zámky na zmazanie.';
    }
    req.session.adminFlash = { level: 'success', message };
  } catch (err) {
    console.error('[admin/maintenance/delete-expired-slot-locks]', err);
    req.session.adminFlash = { level: 'error', message: 'Operácia zlyhala. Skúste znova.' };
  }
  return res.redirect('/admin/maintenance');
});

router.post('/maintenance/delete-old-unused-slots', requireAdmin, async (req, res) => {
  const confirmOn = req.body && req.body.confirmUnusedSlots === 'on';
  if (!confirmOn) {
    req.session.adminFlash = { level: 'error', message: 'Potvrďte mazanie termínov zaškrtnutím políčka.' };
    return res.redirect('/admin/maintenance');
  }
  try {
    const pool = getPool();
    if (!pool) {
      req.session.adminFlash = { level: 'error', message: 'Databáza nie je dostupná.' };
      return res.redirect('/admin/maintenance');
    }
    const deleted = await slotsRepo.deleteOldUnusedSlotsBatch(slotsRepo.OLD_UNUSED_SLOT_PURGE_BATCH_MAX);
    const after = await slotsRepo.getOldUnusedSlotsMaintenanceStats();
    await auditRepo.log(
      'old_unused_slots_purged',
      'slot',
      null,
      { deleted, deletableRemaining: after.deletable },
      'admin'
    );
    let message = `Zmazaných ${deleted} nepoužitých minulých termínov.`;
    if (after.deletable > 0) {
      message += ` Ešte ich ostáva ${after.deletable} — môžete spustiť znova.`;
    } else if (deleted === 0) {
      message = 'Žiadne termíny zodpovedajúce podmienkam na zmazanie.';
    }
    req.session.adminFlash = { level: 'success', message };
  } catch (err) {
    console.error('[admin/maintenance/delete-old-unused-slots]', err);
    req.session.adminFlash = { level: 'error', message: 'Operácia zlyhala. Skúste znova.' };
  }
  return res.redirect('/admin/maintenance');
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

function parseSlotActionRedirect(body, slotId) {
  if (body && body.returnMode === 'detail' && slotId) {
    return `/admin/slots/${slotId}`;
  }
  return `/admin/slots${parseReturnQuery(body)}`;
}

function slotDetailBackHref(req) {
  const view = req.query.view === 'week' ? 'week' : 'day';
  const raw = typeof req.query.date === 'string' ? req.query.date : '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? raw
    : DateTime.now().setZone(SLOT_TIMEZONE).toISODate();
  return `/admin/slots${slotsQuery(view, date)}`;
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

function parseBillingIdParam(raw) {
  const id = parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function mapBillingActionError(code) {
  switch (code) {
    case 'NOT_FOUND':
      return 'Doklad sa nenašiel.';
    case 'NO_DB':
      return 'Databáza nie je dostupná.';
    case 'NO_NUMBER':
      return 'Doklad ešte nemá pridelené číslo.';
    case 'NO_PDF':
      return 'Chýba PDF. Skúste najprv znovu vygenerovať súbor.';
    case 'BAD_EMAIL':
      return 'E-mail odberateľa v zázname nie je platný.';
    case 'PDF_READ':
      return 'PDF sa nepodarilo načítať z úložiska.';
    case 'EMAIL_SKIPPED':
    case 'SEND_FAILED':
      return 'E-mail sa neodoslal (skontrolujte Resend / konfiguráciu).';
    default:
      return 'Akciu sa nepodarilo vykonať.';
  }
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
    case 'HAS_PENDING_PAYMENT':
      return 'Termín má rozbehnutú platbu Stripe. Počkajte alebo zrušte termín.';
    case 'ALREADY_CANCELLED':
      return 'Termín je už zrušený.';
    default:
      return 'Akciu sa nepodarilo vykonať.';
  }
}

async function handleSlotPost(req, res, actionFn, successMessage, auditAction) {
  const slotId = parseSlotIdParam(req.params.slotId);
  const returnTo = parseSlotActionRedirect(req.body, slotId);
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

router.post('/reservations/:id/send-balance-email', requireAdmin, async (req, res) => {
  const id = parseReservationIdParam(req.params.id);
  const redirect = id ? `/admin/reservations/${id}` : '/admin/reservations';
  if (!id) {
    req.session.adminFlash = { level: 'error', message: 'Neplatná rezervácia.' };
    return res.redirect('/admin/reservations');
  }

  const emailSubject =
    typeof req.body.emailSubject === 'string' ? req.body.emailSubject.trim().slice(0, 200) : '';
  const emailMessageRaw = typeof req.body.emailMessage === 'string' ? req.body.emailMessage : '';
  if (emailMessageRaw.length > emailService.MAX_BALANCE_PAY_INVITE_MESSAGE_LEN) {
    req.session.adminFlash = {
      level: 'error',
      message: `Správa je príliš dlhá (max. ${emailService.MAX_BALANCE_PAY_INVITE_MESSAGE_LEN} znakov).`,
    };
    return res.redirect(redirect);
  }

  try {
    const pool = getPool();
    if (!pool) {
      req.session.adminFlash = { level: 'error', message: 'Databáza nie je dostupná.' };
      return res.redirect(redirect);
    }

    const raw = await reservationsRepo.getAdminDetailById(id);
    if (!raw) {
      req.session.adminFlash = { level: 'error', message: 'Rezervácia sa nenašla.' };
      return res.redirect(redirect);
    }

    const balancePay = await resolveBalancePayAdminLink(pool, id);
    if (balancePay.state !== 'ready' || !balancePay.url) {
      req.session.adminFlash = {
        level: 'error',
        message: 'E-mail s doplatkom nie je v tomto stave možný (skontroluj stav rezervácie a platby).',
      };
      return res.redirect(redirect);
    }

    const to = typeof raw.reservation.email === 'string' ? raw.reservation.email.trim() : '';
    if (!to) {
      req.session.adminFlash = { level: 'error', message: 'Rezervácia nemá e-mail príjemcu.' };
      return res.redirect(redirect);
    }

    const result = await emailService.sendBalancePayInviteEmail(
      {
        to,
        subject: emailSubject || undefined,
        customMessagePlain: emailMessageRaw,
        balanceUrl: balancePay.url,
        slot: raw.slot,
      },
      { entity_type: 'reservation', entity_id: id, actorType: 'admin' }
    );

    if (result.skipped) {
      req.session.adminFlash = {
        level: 'error',
        message: 'E-mail sa neodoslal — skontrolujte konfiguráciu Resend (API kľúč a odosielateľa).',
      };
    } else if (!result.ok) {
      req.session.adminFlash = { level: 'error', message: 'Odoslanie e-mailu zlyhalo. Skúste znova.' };
    } else {
      await auditRepo.log(
        'balance_pay_invite_email_sent',
        'reservation',
        id,
        { to, subjectPreview: (emailSubject || emailService.DEFAULT_BALANCE_PAY_INVITE_SUBJECT).slice(0, 120) },
        'admin'
      );
      req.session.adminFlash = { level: 'success', message: `E-mail bol odoslaný na ${to}.` };
    }
    return res.redirect(redirect);
  } catch (err) {
    console.error('[admin/reservations/send-balance-email]', err);
    req.session.adminFlash = { level: 'error', message: 'Neznáma chyba pri odosielaní.' };
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
        balancePay: null,
        minSessionTotalEur: MIN_SESSION_TOTAL_EUR,
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
        balancePay: null,
        minSessionTotalEur: MIN_SESSION_TOTAL_EUR,
      });
    }

    const detail = mapAdminDetail(raw);
    const balancePay = await resolveBalancePayAdminLink(pool, id);
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
      balancePay,
      defaultBalancePayEmailSubject: emailService.DEFAULT_BALANCE_PAY_INVITE_SUBJECT,
      maxBalancePayEmailMessage: emailService.MAX_BALANCE_PAY_INVITE_MESSAGE_LEN,
      minSessionTotalEur: MIN_SESSION_TOTAL_EUR,
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
      balancePay: null,
      minSessionTotalEur: MIN_SESSION_TOTAL_EUR,
    });
  }
});

router.get('/billing/export.csv', requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(503).type('text/plain').send('Database not configured');
    }
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const rows = await billingDocumentsRepo.searchForAdmin(q, 2000);
    const headers = [
      'id',
      'document_number',
      'internal_type',
      'status',
      'customer_email_snapshot',
      'reservation_id',
      'payment_id',
      'stripe_checkout_session_id',
      'stripe_payment_intent_id',
      'amount_gross_cents',
      'amount_net_cents',
      'amount_vat_cents',
      'currency',
      'vat_rate',
      'paid_at',
      'issued_at',
      'pdf_storage_ref',
      'email_sent_at',
      'email_message_id',
      'notes',
    ];
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(headers.map((h) => csvEscape(r[h])).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="billing-documents.csv"');
    res.send(`\ufeff${lines.join('\r\n')}`);
  } catch (err) {
    console.error('[admin/billing/export]', err);
    res.status(500).type('text/plain').send('Export failed');
  }
});

router.get('/billing', requireAdmin, async (req, res) => {
  const flash = req.session.adminFlash;
  if (flash) {
    delete req.session.adminFlash;
  }
  const q = typeof req.query.q === 'string' ? req.query.q : '';

  try {
    const pool = getPool();
    if (!pool) {
      return res.render('admin/billing-list', {
        layout: 'layouts/admin',
        title: 'Platobné doklady — administrácia',
        adminSection: 'billing',
        dbConfigured: false,
        loadError: false,
        flash,
        searchQ: q,
        documents: [],
      });
    }
    const raw = await billingDocumentsRepo.searchForAdmin(q, 150);
    const documents = raw.map(mapBillingListRow);
    return res.render('admin/billing-list', {
      layout: 'layouts/admin',
      title: 'Platobné doklady — administrácia',
      adminSection: 'billing',
      dbConfigured: true,
      loadError: false,
      flash,
      searchQ: q,
      documents,
    });
  } catch (err) {
    console.error('[admin/billing]', err);
    return res.status(500).render('admin/billing-list', {
      layout: 'layouts/admin',
      title: 'Platobné doklady — administrácia',
      adminSection: 'billing',
      dbConfigured: !!getPool(),
      loadError: true,
      flash,
      searchQ: q,
      documents: [],
    });
  }
});

router.post('/billing/:id/regenerate-pdf', requireAdmin, async (req, res) => {
  const id = parseBillingIdParam(req.params.id);
  const redirect = id ? `/admin/billing/${id}` : '/admin/billing';
  if (!id) {
    req.session.adminFlash = { level: 'error', message: 'Neplatný doklad.' };
    return res.redirect('/admin/billing');
  }
  try {
    const pool = getPool();
    if (!pool) {
      req.session.adminFlash = { level: 'error', message: 'Databáza nie je dostupná.' };
      return res.redirect(redirect);
    }
    const result = await billingDeliveryService.regenerateBillingPdfAdmin(id);
    if (!result.ok) {
      req.session.adminFlash = { level: 'error', message: mapBillingActionError(result.code) };
    } else {
      await auditRepo.log('billing_pdf_regenerated', 'billing_document', id, null, 'admin');
      req.session.adminFlash = { level: 'success', message: 'PDF bolo znovu vygenerované.' };
    }
    return res.redirect(redirect);
  } catch (err) {
    console.error('[admin/billing/regenerate-pdf]', err);
    req.session.adminFlash = { level: 'error', message: 'Neznáma chyba.' };
    return res.redirect(redirect);
  }
});

router.post('/billing/:id/resend-email', requireAdmin, async (req, res) => {
  const id = parseBillingIdParam(req.params.id);
  const redirect = id ? `/admin/billing/${id}` : '/admin/billing';
  if (!id) {
    req.session.adminFlash = { level: 'error', message: 'Neplatný doklad.' };
    return res.redirect('/admin/billing');
  }
  try {
    const pool = getPool();
    if (!pool) {
      req.session.adminFlash = { level: 'error', message: 'Databáza nie je dostupná.' };
      return res.redirect(redirect);
    }

    const krosEnabled = String(process.env.KROS_ENABLED || '').toLowerCase() === 'true';
    const docRow = await billingDocumentsRepo.findById(id);
    if (!docRow) {
      req.session.adminFlash = { level: 'error', message: mapBillingActionError('NOT_FOUND') };
      return res.redirect(redirect);
    }

    let result;
    if (krosEnabled && docRow.kros_download_url) {
      logLine({
        level: 'info',
        tag: 'admin_resend_path',
        billingDocumentId: id,
        path: 'kros_link',
      });
      const emailResult = await emailService.sendBillingInvoiceKrosEmail(id, docRow.kros_download_url, {
        resend: true,
      });
      if (!emailResult.ok || emailResult.skipped) {
        result = { ok: false, code: emailResult.skipped ? 'EMAIL_SKIPPED' : 'SEND_FAILED' };
      } else {
        result = { ok: true, messageId: emailResult.messageId };
      }
    } else {
      if (krosEnabled && !docRow.kros_download_url) {
        logLine({
          level: 'info',
          tag: 'admin_resend_kros_url_missing',
          billingDocumentId: id,
          kros_status: docRow.kros_status ?? null,
        });
      }
      logLine({
        level: 'info',
        tag: 'admin_resend_path',
        billingDocumentId: id,
        path: 'internal_pdf',
      });
      result = await billingDeliveryService.resendBillingInvoiceEmailAdmin(id);
    }

    if (!result.ok) {
      req.session.adminFlash = { level: 'error', message: mapBillingActionError(result.code) };
    } else {
      await auditRepo.log('billing_invoice_resent', 'billing_document', id, null, 'admin');
      if (krosEnabled && !docRow.kros_download_url) {
        req.session.adminFlash = {
          level: 'success',
          message:
            `KROS webhook ešte nedobehol (kros_status: ${docRow.kros_status ?? '—'}). ` +
            `Email bol odoslaný cez interný PDF.`,
        };
      } else {
        req.session.adminFlash = { level: 'success', message: 'E-mail s dokladom bol odoslaný znova.' };
      }
    }
    return res.redirect(redirect);
  } catch (err) {
    console.error('[admin/billing/resend-email]', err);
    req.session.adminFlash = { level: 'error', message: 'Neznáma chyba.' };
    return res.redirect(redirect);
  }
});

router.post('/billing/:id/sync-kros', requireAdmin, async (req, res) => {
  const id = parseBillingIdParam(req.params.id);
  const redirect = id ? `/admin/billing/${id}` : '/admin/billing';
  if (!id) {
    req.session.adminFlash = { level: 'error', message: 'Neplatný doklad.' };
    return res.redirect('/admin/billing');
  }
  try {
    const pool = getPool();
    if (!pool) {
      req.session.adminFlash = { level: 'error', message: 'Databáza nie je dostupná.' };
      return res.redirect(redirect);
    }
    await syncToKros(id);
    await auditRepo.log('billing_kros_sync_manual', 'billing_document', id, null, 'admin');
    req.session.adminFlash = { level: 'success', message: 'Synchronizácia do KROS bola spustená.' };
    return res.redirect(redirect);
  } catch (err) {
    console.error('[admin/billing/sync-kros]', err);
    req.session.adminFlash = {
      level: 'error',
      message: `KROS sync zlyhal: ${err?.message || 'Neznáma chyba.'}`,
    };
    return res.redirect(redirect);
  }
});

router.post('/billing/:id/note', requireAdmin, async (req, res) => {
  const id = parseBillingIdParam(req.params.id);
  const redirect = id ? `/admin/billing/${id}` : '/admin/billing';
  if (!id) {
    req.session.adminFlash = { level: 'error', message: 'Neplatný doklad.' };
    return res.redirect('/admin/billing');
  }
  const note = typeof req.body.note === 'string' ? req.body.note : '';
  try {
    const pool = getPool();
    if (!pool) {
      req.session.adminFlash = { level: 'error', message: 'Databáza nie je nakonfigurovaná.' };
      return res.redirect(redirect);
    }
    const ok = await billingDocumentsRepo.updateNotes(id, note);
    if (!ok) {
      req.session.adminFlash = { level: 'error', message: 'Doklad sa nenašiel.' };
    } else {
      await auditRepo.log(
        'billing_document_note_updated',
        'billing_document',
        id,
        { preview: note.slice(0, 120) },
        'admin'
      );
      req.session.adminFlash = { level: 'success', message: 'Interná poznámka bola uložená.' };
    }
    return res.redirect(redirect);
  } catch (err) {
    console.error('[admin/billing/note]', err);
    req.session.adminFlash = { level: 'error', message: 'Neznáma chyba.' };
    return res.redirect(redirect);
  }
});

router.get('/billing/:id', requireAdmin, async (req, res) => {
  const id = parseBillingIdParam(req.params.id);
  if (!id) {
    return res.redirect('/admin/billing');
  }
  const flash = req.session.adminFlash;
  if (flash) {
    delete req.session.adminFlash;
  }

  try {
    const pool = getPool();
    if (!pool) {
      return res.render('admin/billing-detail', {
        layout: 'layouts/admin',
        title: `Doklad #${id}`,
        adminSection: 'billing',
        dbConfigured: false,
        loadError: false,
        notFound: false,
        flash,
        detail: null,
        documentId: id,
      });
    }
    const raw = await billingDocumentsRepo.findByIdWithPayment(id);
    if (!raw) {
      return res.status(404).render('admin/billing-detail', {
        layout: 'layouts/admin',
        title: 'Platobný doklad',
        adminSection: 'billing',
        dbConfigured: true,
        loadError: false,
        notFound: true,
        flash,
        detail: null,
        documentId: id,
      });
    }
    const detail = mapBillingDetailRow(raw);
    return res.render('admin/billing-detail', {
      layout: 'layouts/admin',
      title: `Doklad ${detail.document_number || '#' + id}`,
      adminSection: 'billing',
      dbConfigured: true,
      loadError: false,
      notFound: false,
      flash,
      detail,
      documentId: id,
    });
  } catch (err) {
    console.error('[admin/billing/:id]', err);
    return res.status(500).render('admin/billing-detail', {
      layout: 'layouts/admin',
      title: `Doklad #${id}`,
      adminSection: 'billing',
      dbConfigured: !!getPool(),
      loadError: true,
      notFound: false,
      flash,
      detail: null,
      documentId: id,
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

router.get('/slots/:slotId', requireAdmin, async (req, res) => {
  const slotId = parseSlotIdParam(req.params.slotId);
  if (!slotId) {
    return res.redirect('/admin/slots');
  }
  const flash = req.session.adminFlash;
  if (flash) {
    delete req.session.adminFlash;
  }
  const backHref = slotDetailBackHref(req);

  try {
    const pool = getPool();
    if (!pool) {
      return res.render('admin/slot-detail', {
        layout: 'layouts/admin',
        title: `Termín #${slotId}`,
        adminSection: 'slots',
        dbConfigured: false,
        loadError: false,
        notFound: false,
        flash,
        detail: null,
        slotId,
        backHref,
      });
    }

    const raw = await slotsRepo.getAdminDetailById(slotId);
    if (!raw) {
      return res.status(404).render('admin/slot-detail', {
        layout: 'layouts/admin',
        title: 'Termín',
        adminSection: 'slots',
        dbConfigured: true,
        loadError: false,
        notFound: true,
        flash,
        detail: null,
        slotId,
        backHref,
      });
    }

    const detail = mapAdminSlotDetail(raw);
    return res.render('admin/slot-detail', {
      layout: 'layouts/admin',
      title: `Termín #${slotId} — ${detail.sessionLabel}`,
      adminSection: 'slots',
      dbConfigured: true,
      loadError: false,
      notFound: false,
      flash,
      detail,
      slotId,
      backHref,
    });
  } catch (err) {
    console.error('[admin/slots/:slotId]', err);
    return res.status(500).render('admin/slot-detail', {
      layout: 'layouts/admin',
      title: `Termín #${slotId}`,
      adminSection: 'slots',
      dbConfigured: !!getPool(),
      loadError: true,
      notFound: false,
      flash,
      detail: null,
      slotId,
      backHref,
    });
  }
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

  const computeBulkFormDates = async () => {
    const pool = getPool();
    if (!pool) return resolveBulkFormDateDefaults([]);
    const scanFrom = DateTime.now().setZone(SLOT_TIMEZONE).startOf('day').plus({ days: 1 }).toISODate();
    const scanTo = DateTime.fromISO(scanFrom, { zone: SLOT_TIMEZONE })
      .plus({ days: MAX_BULK_RANGE_DAYS - 1 })
      .toISODate();
    const busy = await slotsRepo.listLocalDatesWithAnySlot(scanFrom, scanTo);
    return resolveBulkFormDateDefaults(busy);
  };

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
    const { bulkDateFrom, bulkDateTo } = await computeBulkFormDates();
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
        bulkDateFrom,
        bulkDateTo,
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
      bulkDateFrom,
      bulkDateTo,
      rangeLabel,
      days,
      queryPrev,
      queryNext,
      queryDayToggle,
      queryWeekToggle,
    });
  } catch (err) {
    console.error('[admin/slots]', err);
    let bulkDateFrom = from;
    let bulkDateTo = to;
    try {
      const fallback = resolveBulkFormDateDefaults([]);
      bulkDateFrom = fallback.bulkDateFrom;
      bulkDateTo = fallback.bulkDateTo;
    } catch (_) {
      /* keep calendar range */
    }
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
      bulkDateFrom,
      bulkDateTo,
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
