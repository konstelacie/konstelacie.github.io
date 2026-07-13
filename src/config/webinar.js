/**
 * Evergreen webinar configuration (scheduling options, video, room timing).
 * Env-driven so operators can tune offers without code changes.
 */

const { SLOT_TIMEZONE } = require('./slotGrid');

function parsePositiveInt(raw, fallback, max) {
  const n = parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function parseBool(raw, fallback) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const s = String(raw).trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  return fallback;
}

/** HH:mm wall-clock times for today/tomorrow preset rows. */
function parsePresetTimes(raw) {
  const src = String(raw ?? '').trim();
  if (!src) return ['20:00'];
  const parts = src
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const valid = [];
  for (const p of parts) {
    if (/^\d{1,2}:\d{2}$/.test(p)) {
      const [h, m] = p.split(':').map(Number);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59 && m % 15 === 0) {
        valid.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
  }
  return valid.length ? valid : ['20:00'];
}

const webinarConfig = {
  enabled: parseBool(process.env.WEBINAR_ENABLED, false),
  timezone: (process.env.WEBINAR_TIMEZONE || SLOT_TIMEZONE).trim() || SLOT_TIMEZONE,
  wistiaHashedId: (process.env.WEBINAR_WISTIA_HASHED_ID || '').trim(),
  /** Slot grid step and validation (minutes). */
  intervalMinutes: parsePositiveInt(process.env.WEBINAR_INTERVAL_MINUTES, 15, 60),
  /** Earliest bookable start = now + this many minutes, then rounded up to interval. */
  minLeadMinutes: parsePositiveInt(process.env.WEBINAR_MIN_LEAD_MINUTES, 15, 24 * 60),
  /** How long the synced room stays open after start. */
  durationMinutes: parsePositiveInt(process.env.WEBINAR_DURATION_MINUTES, 60, 24 * 60),
  /** Lobby opens this many minutes before start_at. */
  lobbyOpenMinutes: parsePositiveInt(process.env.WEBINAR_LOBBY_OPEN_MINUTES, 15, 24 * 60),
  /** Custom datetime picker: max days ahead from today (local). */
  maxDaysAhead: parsePositiveInt(process.env.WEBINAR_MAX_DAYS_AHEAD, 14, 90),
  earliestOptionEnabled: parseBool(process.env.WEBINAR_EARLIEST_OPTION, true),
  presetTimes: parsePresetTimes(process.env.WEBINAR_PRESET_TIMES),
  presetOptionsEnabled: parseBool(process.env.WEBINAR_PRESET_OPTIONS, true),
  customTimeEnabled: parseBool(process.env.WEBINAR_CUSTOM_TIME, true),
  /** Cron reminder when start is within this many minutes (retries until start). */
  reminderMinutesBefore: parsePositiveInt(process.env.WEBINAR_REMINDER_MINUTES, 15, 24 * 60),
  pageTitle: (process.env.WEBINAR_PAGE_TITLE || 'Bezplatný webinár').trim(),
};

function isConfigured() {
  return webinarConfig.enabled && Boolean(webinarConfig.wistiaHashedId);
}

module.exports = {
  ...webinarConfig,
  isConfigured,
};
