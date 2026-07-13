const { DateTime } = require('luxon');
const webinarConfig = require('../config/webinar');
const webinarRegistrationsRepo = require('../db/repositories/webinarRegistrationsRepo');
const emailService = require('./emailService');
const { ApiError } = require('../middleware/apiError');
const {
  listSchedulingOptions,
  resolveSelectionStart,
  isStartBookable,
  resolveRoomPhase,
  computePlaybackOffsetSeconds,
} = require('../lib/webinarSchedule');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertWebinarEnabled() {
  if (!webinarConfig.isConfigured()) {
    throw new ApiError('WEBINAR_DISABLED', 'Webinár momentálne nie je dostupný.', 404);
  }
}

function validateEmail(raw) {
  const email = typeof raw === 'string' ? raw.trim() : '';
  if (!email) {
    throw new ApiError('VALIDATION_ERROR', 'E-mail je povinný.', 400);
  }
  if (email.length > 255) {
    throw new ApiError('VALIDATION_ERROR', 'E-mail môže mať najviac 255 znakov.', 400);
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new ApiError('VALIDATION_ERROR', 'E-mail má neplatný formát.', 400);
  }
  return email;
}

function toMysqlDatetime(dt) {
  return dt.toUTC().toFormat('yyyy-LL-dd HH:mm:ss.SSS');
}

function buildRoomUrl(accessToken, baseUrl) {
  const path = `/webinar/room/${encodeURIComponent(accessToken)}`;
  const base = (baseUrl || '').trim().replace(/\/+$/, '');
  return base ? `${base}${path}` : path;
}

function formatStartForDisplay(startAtUtc, timezone) {
  const local = DateTime.fromJSDate(
    startAtUtc instanceof Date ? startAtUtc : new Date(startAtUtc),
    { zone: 'utc' }
  ).setZone(timezone);
  return {
    date: local.setLocale('sk').toLocaleString({ day: 'numeric', month: 'long', year: 'numeric' }),
    time: local.toFormat('HH:mm'),
    weekday: local.setLocale('sk').toLocaleString({ weekday: 'long' }),
  };
}

function getSchedulingOptions() {
  assertWebinarEnabled();
  return listSchedulingOptions(webinarConfig);
}

/**
 * @param {object} input
 * @param {string} input.email
 * @param {object} input.selection
 * @param {string} [input.baseUrl]
 */
async function registerForWebinar(input) {
  assertWebinarEnabled();

  const email = validateEmail(input.email);
  const nowUtc = DateTime.utc();

  let resolved;
  try {
    resolved = resolveSelectionStart(webinarConfig, input.selection || {}, nowUtc);
  } catch (err) {
    const code = err.message || 'INVALID_SELECTION';
    const messages = {
      INVALID_PRESET: 'Vybraný termín už nie je dostupný.',
      INVALID_START: 'Neplatný vlastný termín.',
      CUSTOM_DISABLED: 'Vlastný termín nie je povolený.',
      INVALID_SELECTION: 'Vyber platný termín.',
    };
    throw new ApiError(code, messages[code] || messages.INVALID_SELECTION, 400);
  }

  if (!isStartBookable(webinarConfig, resolved.startUtc, nowUtc)) {
    throw new ApiError('START_NOT_BOOKABLE', 'Vybraný termín už nie je dostupný.', 400);
  }

  const startMysql = toMysqlDatetime(resolved.startUtc);
  const endUtc = resolved.startUtc.plus({ minutes: webinarConfig.durationMinutes });
  const endMysql = toMysqlDatetime(endUtc);

  let registration = await webinarRegistrationsRepo.findByEmailAndStart(email, startMysql);
  if (!registration) {
    registration = await webinarRegistrationsRepo.createRegistration({
      email,
      startAtUtc: startMysql,
      endAtUtc: endMysql,
      timezone: webinarConfig.timezone,
      selectionType: resolved.selectionType,
      selectionKey: resolved.selectionKey,
    });
  }

  const roomUrl = buildRoomUrl(registration.accessToken, input.baseUrl);
  const formatted = formatStartForDisplay(registration.startAtUtc, registration.timezone);

  emailService
    .sendWebinarConfirmation(
      {
        to: email,
        roomUrl,
        formattedStart: formatted,
        timezone: registration.timezone,
      },
      { entity_type: 'webinar_registration', entity_id: registration.id }
    )
    .catch((err) => {
      console.error('[webinar] confirmation email failed', registration.id, err);
    });

  return {
    id: registration.id,
    email: registration.email,
    startAtUtc: DateTime.fromJSDate(new Date(registration.startAtUtc), { zone: 'utc' }).toISO(),
    endAtUtc: DateTime.fromJSDate(new Date(registration.endAtUtc), { zone: 'utc' }).toISO(),
    timezone: registration.timezone,
    accessToken: registration.accessToken,
    roomUrl,
    formattedStart: formatted,
  };
}

/**
 * @param {string} accessToken
 */
function getRoomState(accessToken) {
  assertWebinarEnabled();
  return loadRoomState(accessToken);
}

async function loadRoomState(accessToken) {
  const registration = await webinarRegistrationsRepo.findByAccessToken(accessToken);
  if (!registration) {
    throw new ApiError('NOT_FOUND', 'Registrácia sa nenašla.', 404);
  }

  const nowUtc = DateTime.utc();
  const startUtc = DateTime.fromJSDate(new Date(registration.startAtUtc), { zone: 'utc' });
  const endUtc = DateTime.fromJSDate(new Date(registration.endAtUtc), { zone: 'utc' });
  const phase = resolveRoomPhase(webinarConfig, startUtc, endUtc, nowUtc);
  const offsetSeconds =
    phase === 'live' ? computePlaybackOffsetSeconds(startUtc, nowUtc) : 0;

  const formatted = formatStartForDisplay(registration.startAtUtc, registration.timezone);
  const lobbyOpensUtc = startUtc.minus({ minutes: webinarConfig.lobbyOpenMinutes });

  return {
    phase,
    serverNowUtc: nowUtc.toISO(),
    startAtUtc: startUtc.toISO(),
    endAtUtc: endUtc.toISO(),
    lobbyOpensAtUtc: lobbyOpensUtc.toISO(),
    timezone: registration.timezone,
    formattedStart: formatted,
    videoHashedId: webinarConfig.wistiaHashedId,
    offsetSeconds,
    durationMinutes: webinarConfig.durationMinutes,
    accessToken: registration.accessToken,
  };
}

module.exports = {
  assertWebinarEnabled,
  getSchedulingOptions,
  registerForWebinar,
  getRoomState,
  loadRoomState,
  buildRoomUrl,
  formatStartForDisplay,
};
