const express = require('express');
const config = require('../config');
const emailProvider = require('../email/provider');
const { getPool } = require('../db');
const { requireAdmin } = require('../middleware/requireAdmin');
const situationMapSubmissionsRepo = require('../db/repositories/situationMapSubmissionsRepo');
const situationMapResponseService = require('../services/situationMapResponseService');
const { RESPONSE_STATUSES } = require('../lib/situationMapAnalytics');
const { formatDateTimeSkForAdmin } = require('../lib/adminLeadEventDisplay');

const router = express.Router();

router.use(requireAdmin);

const STATUS_FILTERS = ['all', ...RESPONSE_STATUSES];

const STATUS_LABELS = {
  pending: 'Čaká',
  drafting: 'Rozpracované',
  ready_for_review: 'Na kontrolu',
  approved: 'Schválené',
  sent: 'Odoslané',
};

const ACTION_ERRORS = {
  not_found: 'Záznam sa nenašiel.',
  invalid_status: 'Neplatný stav odpovede.',
  already_sent: 'Odpoveď už bola odoslaná.',
  empty_draft: 'Draft je prázdny.',
  empty_response: 'Najprv napíš osobnú odpoveď.',
  ai_draft_immutable: 'AI draft sa neprepíše. Zostáva pôvodná verzia.',
  email_not_configured: 'E-mailový poskytovateľ nie je nakonfigurovaný (Resend).',
  send_failed: 'Odoslanie e-mailu zlyhalo.',
};

function adminActor(req) {
  const fromSession = req.session && req.session.adminUsername;
  if (fromSession) return String(fromSession).slice(0, 80);
  return (config.admin && config.admin.username) || 'admin';
}

function takeFlash(req) {
  const flash = req.session.adminFlash;
  if (flash) delete req.session.adminFlash;
  return flash || null;
}

function setFlash(req, level, message) {
  req.session.adminFlash = { level, message };
}

function parseId(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function statusFilter(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return STATUS_FILTERS.includes(value) ? value : 'pending';
}

function mapListRow(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    funnelPath: [row.funnelName, row.funnelCampaign].filter(Boolean).join(' / ') || 'mapa',
    topic: row.topic,
    marketingConsent: row.marketingConsent,
    createdAtLabel: formatDateTimeSkForAdmin(row.createdAt),
    responseStatus: row.responseStatus || 'pending',
    responseStatusLabel: STATUS_LABELS[row.responseStatus] || row.responseStatus || 'Čaká',
    hasAiDraft: Boolean(row.hasAiDraft),
    sentAtLabel: row.responseSentAt ? formatDateTimeSkForAdmin(row.responseSentAt) : '—',
  };
}

function detailRedirect(id) {
  return `/admin/situation-map/${id}`;
}

router.get('/situation-map', async (req, res) => {
  const flash = takeFlash(req);
  const filter = statusFilter(req.query.status);

  try {
    const pool = getPool();
    if (!pool) {
      return res.render('admin/situation-map-list', {
        layout: 'layouts/admin',
        title: 'Mapa situácie — administrácia',
        adminSection: 'situation-map',
        dbConfigured: false,
        loadError: false,
        flash,
        filter,
        statusFilters: STATUS_FILTERS,
        statusLabels: STATUS_LABELS,
        rows: [],
      });
    }

    const rows = (await situationMapSubmissionsRepo.listForAdmin({ status: filter })).map(mapListRow);
    return res.render('admin/situation-map-list', {
      layout: 'layouts/admin',
      title: 'Mapa situácie — administrácia',
      adminSection: 'situation-map',
      dbConfigured: true,
      loadError: false,
      flash,
      filter,
      statusFilters: STATUS_FILTERS,
      statusLabels: STATUS_LABELS,
      rows,
    });
  } catch (err) {
    console.error('[admin/situation-map]', err);
    return res.status(500).render('admin/situation-map-list', {
      layout: 'layouts/admin',
      title: 'Mapa situácie — administrácia',
      adminSection: 'situation-map',
      dbConfigured: !!getPool(),
      loadError: true,
      flash,
      filter,
      statusFilters: STATUS_FILTERS,
      statusLabels: STATUS_LABELS,
      rows: [],
    });
  }
});

router.get('/situation-map/:id', async (req, res) => {
  const flash = takeFlash(req);
  const id = parseId(req.params.id);
  if (!id) return res.redirect('/admin/situation-map');

  try {
    const pool = getPool();
    if (!pool) {
      return res.status(503).render('admin/situation-map-detail', {
        layout: 'layouts/admin',
        title: 'Mapa situácie — administrácia',
        adminSection: 'situation-map',
        dbConfigured: false,
        loadError: false,
        flash,
        bundle: null,
        statusLabels: STATUS_LABELS,
        emailConfigured: emailProvider.isConfigured(),
      });
    }

    const bundle = await situationMapResponseService.getReviewBundle(id);
    if (!bundle) {
      setFlash(req, 'error', ACTION_ERRORS.not_found);
      return res.redirect('/admin/situation-map');
    }

    return res.render('admin/situation-map-detail', {
      layout: 'layouts/admin',
      title: `Mapa #${id} — administrácia`,
      adminSection: 'situation-map',
      dbConfigured: true,
      loadError: false,
      flash,
      bundle,
      statusLabels: STATUS_LABELS,
      emailConfigured: emailProvider.isConfigured(),
      createdAtLabel: formatDateTimeSkForAdmin(bundle.submission.createdAt),
      reviewedAtLabel: formatDateTimeSkForAdmin(bundle.response.reviewedAt),
      sentAtLabel: formatDateTimeSkForAdmin(bundle.response.sentAt),
      updatedAtLabel: formatDateTimeSkForAdmin(bundle.response.updatedAt),
    });
  } catch (err) {
    console.error('[admin/situation-map/:id]', err);
    return res.status(500).render('admin/situation-map-detail', {
      layout: 'layouts/admin',
      title: 'Mapa situácie — administrácia',
      adminSection: 'situation-map',
      dbConfigured: !!getPool(),
      loadError: true,
      flash,
      bundle: null,
      statusLabels: STATUS_LABELS,
      emailConfigured: emailProvider.isConfigured(),
    });
  }
});

function handleActionResult(req, res, id, result, successMessage) {
  if (!result || !result.ok) {
    setFlash(req, 'error', ACTION_ERRORS[result && result.reason] || 'Akcia sa nepodarila.');
  } else {
    setFlash(req, 'success', successMessage);
  }
  return res.redirect(detailRedirect(id));
}

router.post('/situation-map/:id/save', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.redirect('/admin/situation-map');
  try {
    const bundle = await situationMapResponseService.getReviewBundle(id);
    if (!bundle) {
      setFlash(req, 'error', ACTION_ERRORS.not_found);
      return res.redirect('/admin/situation-map');
    }
    const result = await situationMapResponseService.saveEditorFields(
      bundle.response.id,
      {
        humanSummary: req.body.humanSummary,
        responseDraft: req.body.responseDraft,
        internalNotes: req.body.internalNotes,
        status: req.body.status,
      },
      adminActor(req)
    );
    return handleActionResult(req, res, id, result, 'Úpravy sú uložené.');
  } catch (err) {
    console.error('[admin/situation-map save]', err);
    setFlash(req, 'error', 'Uloženie zlyhalo.');
    return res.redirect(detailRedirect(id));
  }
});

router.post('/situation-map/:id/ai-mock', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.redirect('/admin/situation-map');
  try {
    const bundle = await situationMapResponseService.getReviewBundle(id);
    if (!bundle) {
      setFlash(req, 'error', ACTION_ERRORS.not_found);
      return res.redirect('/admin/situation-map');
    }
    const result = await situationMapResponseService.insertAiSummaryDraft(
      bundle.response.id,
      { useMock: true },
      adminActor(req)
    );
    return handleActionResult(req, res, id, result, 'Interný faktický draft je vložený. AI draft sa ďalej neprepíše.');
  } catch (err) {
    console.error('[admin/situation-map ai-mock]', err);
    setFlash(req, 'error', 'Vloženie draftu zlyhalo.');
    return res.redirect(detailRedirect(id));
  }
});

router.post('/situation-map/:id/ai-draft', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.redirect('/admin/situation-map');
  try {
    const bundle = await situationMapResponseService.getReviewBundle(id);
    if (!bundle) {
      setFlash(req, 'error', ACTION_ERRORS.not_found);
      return res.redirect('/admin/situation-map');
    }
    const result = await situationMapResponseService.insertAiSummaryDraft(
      bundle.response.id,
      { draft: req.body.aiSummaryDraft, source: 'manual' },
      adminActor(req)
    );
    return handleActionResult(req, res, id, result, 'AI / interný draft je uložený. Ďalej sa neprepíše.');
  } catch (err) {
    console.error('[admin/situation-map ai-draft]', err);
    setFlash(req, 'error', 'Uloženie AI draftu zlyhalo.');
    return res.redirect(detailRedirect(id));
  }
});

router.post('/situation-map/:id/approve', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.redirect('/admin/situation-map');
  try {
    const bundle = await situationMapResponseService.getReviewBundle(id);
    if (!bundle) {
      setFlash(req, 'error', ACTION_ERRORS.not_found);
      return res.redirect('/admin/situation-map');
    }
    const result = await situationMapResponseService.approveResponse(bundle.response.id, adminActor(req));
    return handleActionResult(req, res, id, result, 'Odpoveď je označená ako schválená.');
  } catch (err) {
    console.error('[admin/situation-map approve]', err);
    setFlash(req, 'error', 'Schválenie zlyhalo.');
    return res.redirect(detailRedirect(id));
  }
});

router.post('/situation-map/:id/send', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.redirect('/admin/situation-map');
  try {
    const bundle = await situationMapResponseService.getReviewBundle(id);
    if (!bundle) {
      setFlash(req, 'error', ACTION_ERRORS.not_found);
      return res.redirect('/admin/situation-map');
    }
    const result = await situationMapResponseService.sendPersonalResponse(
      bundle.response.id,
      adminActor(req)
    );
    return handleActionResult(
      req,
      res,
      id,
      result,
      'Osobná odpoveď bola odoslaná na e-mail (služba, nie marketing).'
    );
  } catch (err) {
    console.error('[admin/situation-map send]', err);
    setFlash(req, 'error', 'Odoslanie zlyhalo.');
    return res.redirect(detailRedirect(id));
  }
});

router.post('/situation-map/:id/mark-sent', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.redirect('/admin/situation-map');
  try {
    const bundle = await situationMapResponseService.getReviewBundle(id);
    if (!bundle) {
      setFlash(req, 'error', ACTION_ERRORS.not_found);
      return res.redirect('/admin/situation-map');
    }
    const result = await situationMapResponseService.sendPersonalResponse(
      bundle.response.id,
      adminActor(req),
      { markSentOnly: true }
    );
    return handleActionResult(req, res, id, result, 'Stav je označený ako odoslané (mimo systému).');
  } catch (err) {
    console.error('[admin/situation-map mark-sent]', err);
    setFlash(req, 'error', 'Označenie zlyhalo.');
    return res.redirect(detailRedirect(id));
  }
});

module.exports = router;
