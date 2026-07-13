const { DateTime } = require('luxon');

/**
 * Round local DateTime up to the next interval boundary (e.g. :00, :15, :30, :45).
 * @param {import('luxon').DateTime} dt — local zone
 * @param {number} intervalMinutes
 */
function roundUpToInterval(dt, intervalMinutes) {
  if (!dt.isValid) throw new Error('Invalid DateTime');
  const step = Number(intervalMinutes);
  if (!Number.isInteger(step) || step < 1) throw new Error('Invalid intervalMinutes');

  const totalMinutes = dt.hour * 60 + dt.minute;
  const remainder = totalMinutes % step;
  const hasSubMinute = dt.second > 0 || dt.millisecond > 0;

  if (remainder === 0 && !hasSubMinute) {
    return dt.startOf('minute');
  }

  const addMinutes = remainder === 0 ? step : step - remainder;
  return dt.plus({ minutes: addMinutes }).startOf('minute');
}

/**
 * @param {import('luxon').DateTime} dtUtc
 * @param {number} intervalMinutes
 */
function isOnIntervalGrid(dtUtc, intervalMinutes, timezone) {
  const local = dtUtc.setZone(timezone);
  if (!local.isValid) return false;
  const total = local.hour * 60 + local.minute;
  const step = Number(intervalMinutes);
  return local.second === 0 && local.millisecond === 0 && total % step === 0;
}

/**
 * @param {object} config — webinar config slice
 * @param {import('luxon').DateTime} [nowUtc]
 * @returns {import('luxon').DateTime}
 */
function computeEarliestStartUtc(config, nowUtc = DateTime.utc()) {
  const tz = config.timezone;
  const localNow = nowUtc.setZone(tz);
  const afterLead = localNow.plus({ minutes: config.minLeadMinutes });
  const roundedLocal = roundUpToInterval(afterLead, config.intervalMinutes);
  return roundedLocal.toUTC();
}

/**
 * @param {object} config
 * @param {import('luxon').DateTime} startUtc
 * @param {import('luxon').DateTime} [nowUtc]
 */
function isStartBookable(config, startUtc, nowUtc = DateTime.utc()) {
  if (!startUtc.isValid) return false;
  if (!isOnIntervalGrid(startUtc, config.intervalMinutes, config.timezone)) return false;

  const earliest = computeEarliestStartUtc(config, nowUtc);
  if (startUtc < earliest) return false;

  const localStart = startUtc.setZone(config.timezone);
  const localNow = nowUtc.setZone(config.timezone);
  const maxLocal = localNow.startOf('day').plus({ days: config.maxDaysAhead }).endOf('day');
  if (localStart > maxLocal) return false;

  return true;
}

/**
 * @param {import('luxon').DateTime} localDt
 */
function formatOptionLabel(localDt) {
  const sk = localDt.setLocale('sk');
  const now = DateTime.now().setZone(localDt.zoneName).startOf('day');
  const day = localDt.startOf('day');
  const time = sk.toFormat('HH:mm');

  if (day.equals(now)) {
    return `Dnes o ${time}`;
  }
  if (day.equals(now.plus({ days: 1 }))) {
    return `Zajtra o ${time}`;
  }
  const datePart = sk.toLocaleString({ weekday: 'short', day: 'numeric', month: 'short' });
  return `${datePart} o ${time}`;
}

/**
 * @param {number} dayOffset — 0 = today, 1 = tomorrow (local)
 * @param {string} timeKey — HH:mm
 */
function presetLocalDateTime(config, dayOffset, timeKey, nowUtc = DateTime.utc()) {
  const tz = config.timezone;
  const localNow = nowUtc.setZone(tz);
  const [h, m] = timeKey.split(':').map(Number);
  return localNow.startOf('day').plus({ days: dayOffset }).set({ hour: h, minute: m, second: 0, millisecond: 0 });
}

/**
 * @param {object} config
 * @param {import('luxon').DateTime} [nowUtc]
 */
function buildPresetOptions(config, nowUtc = DateTime.utc()) {
  if (!config.presetOptionsEnabled) return [];

  const options = [];
  const offsets = [0, 1];

  for (const dayOffset of offsets) {
    for (const timeKey of config.presetTimes) {
      const localDt = presetLocalDateTime(config, dayOffset, timeKey, nowUtc);
      const startUtc = localDt.toUTC();
      if (!isStartBookable(config, startUtc, nowUtc)) continue;

      const id = `preset:${dayOffset}:${timeKey}`;
      options.push({
        id,
        type: 'preset',
        dayOffset,
        localTime: timeKey,
        label: formatOptionLabel(localDt),
        startAtUtc: startUtc.toISO(),
        localDate: localDt.toISODate(),
      });
    }
  }

  options.sort((a, b) => Date.parse(a.startAtUtc) - Date.parse(b.startAtUtc));
  return options;
}

/**
 * @param {object} config
 * @param {import('luxon').DateTime} [nowUtc]
 */
function buildEarliestOption(config, nowUtc = DateTime.utc()) {
  if (!config.earliestOptionEnabled) return null;

  const startUtc = computeEarliestStartUtc(config, nowUtc);
  const localDt = startUtc.setZone(config.timezone);

  return {
    id: 'earliest',
    type: 'earliest',
    label: `Najskôr možný — ${formatOptionLabel(localDt)}`,
    startAtUtc: startUtc.toISO(),
    localDate: localDt.toISODate(),
    localTime: localDt.toFormat('HH:mm'),
  };
}

/**
 * @param {object} config
 * @param {import('luxon').DateTime} [nowUtc]
 */
function listSchedulingOptions(config, nowUtc = DateTime.utc()) {
  const earliest = buildEarliestOption(config, nowUtc);
  const presets = buildPresetOptions(config, nowUtc);

  const options = [];
  if (earliest) options.push(earliest);
  for (const preset of presets) {
    if (earliest && preset.startAtUtc === earliest.startAtUtc) continue;
    options.push(preset);
  }

  return {
    timezone: config.timezone,
    intervalMinutes: config.intervalMinutes,
    customTimeEnabled: Boolean(config.customTimeEnabled),
    earliestOptionEnabled: Boolean(config.earliestOptionEnabled),
    options,
    customBounds: buildCustomTimeBounds(config, nowUtc),
  };
}

/**
 * @param {object} config
 * @param {import('luxon').DateTime} [nowUtc]
 */
function buildCustomTimeBounds(config, nowUtc = DateTime.utc()) {
  if (!config.customTimeEnabled) {
    return null;
  }

  const earliest = computeEarliestStartUtc(config, nowUtc);
  const localNow = nowUtc.setZone(config.timezone);
  const maxLocal = localNow.startOf('day').plus({ days: config.maxDaysAhead }).endOf('day');

  return {
    minStartAtUtc: earliest.toISO(),
    maxStartAtUtc: maxLocal.toUTC().toISO(),
    minLocal: earliest.setZone(config.timezone).toFormat("yyyy-LL-dd'T'HH:mm"),
    maxLocal: maxLocal.toFormat("yyyy-LL-dd'T'HH:mm"),
    stepMinutes: config.intervalMinutes,
  };
}

/**
 * Resolve registration start time from selection payload.
 * @param {object} config
 * @param {{ type: string, optionId?: string, startAtUtc?: string }} selection
 * @param {import('luxon').DateTime} [nowUtc]
 * @returns {{ startUtc: import('luxon').DateTime, selectionType: string, selectionKey: string|null }}
 */
function resolveSelectionStart(config, selection, nowUtc = DateTime.utc()) {
  const type = typeof selection?.type === 'string' ? selection.type.trim() : '';

  if (type === 'earliest') {
    const startUtc = computeEarliestStartUtc(config, nowUtc);
    return { startUtc, selectionType: 'earliest', selectionKey: 'earliest' };
  }

  if (type === 'preset') {
    const optionId = typeof selection.optionId === 'string' ? selection.optionId.trim() : '';
    const match = optionId.match(/^preset:(\d+):(\d{2}:\d{2})$/);
    if (!match) {
      throw new Error('INVALID_PRESET');
    }
    const dayOffset = Number(match[1]);
    const timeKey = match[2];
    if (!Number.isInteger(dayOffset) || dayOffset < 0 || dayOffset > config.maxDaysAhead) {
      throw new Error('INVALID_PRESET');
    }
    const localDt = presetLocalDateTime(config, dayOffset, timeKey, nowUtc);
    return {
      startUtc: localDt.toUTC(),
      selectionType: 'preset',
      selectionKey: optionId,
    };
  }

  if (type === 'custom') {
    if (!config.customTimeEnabled) {
      throw new Error('CUSTOM_DISABLED');
    }
    const raw = typeof selection.startAtUtc === 'string' ? selection.startAtUtc.trim() : '';
    const startUtc = DateTime.fromISO(raw, { zone: 'utc' });
    if (!startUtc.isValid) {
      throw new Error('INVALID_START');
    }
    return { startUtc, selectionType: 'custom', selectionKey: null };
  }

  throw new Error('INVALID_SELECTION');
}

/**
 * Room phase for synced playback.
 * @param {object} config
 * @param {import('luxon').DateTime} startUtc
 * @param {import('luxon').DateTime} endUtc
 * @param {import('luxon').DateTime} [nowUtc]
 */
function resolveRoomPhase(config, startUtc, endUtc, nowUtc = DateTime.utc()) {
  const lobbyOpens = startUtc.minus({ minutes: config.lobbyOpenMinutes });
  if (nowUtc < lobbyOpens) return 'waiting';
  if (nowUtc < startUtc) return 'lobby';
  if (nowUtc < endUtc) return 'live';
  return 'ended';
}

/**
 * @param {import('luxon').DateTime} startUtc
 * @param {import('luxon').DateTime} [nowUtc]
 */
function computePlaybackOffsetSeconds(startUtc, nowUtc = DateTime.utc()) {
  const diff = nowUtc.diff(startUtc, 'seconds').seconds;
  return Math.max(0, Math.floor(diff));
}

module.exports = {
  roundUpToInterval,
  isOnIntervalGrid,
  computeEarliestStartUtc,
  isStartBookable,
  formatOptionLabel,
  presetLocalDateTime,
  buildPresetOptions,
  buildEarliestOption,
  listSchedulingOptions,
  buildCustomTimeBounds,
  resolveSelectionStart,
  resolveRoomPhase,
  computePlaybackOffsetSeconds,
};
