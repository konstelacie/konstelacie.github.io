const { DateTime } = require('luxon');
const { SLOT_TIMEZONE, SLOT_TIMES, timeKeyForGridIndex } = require('../config/slotGrid');

const MAX_BULK_RANGE_DAYS = 120;
const MAX_BULK_CELLS = 2500;

/**
 * @param {object} body - express req.body (timeKeys may be string | string[])
 */
function parseTimeKeysFromForm(body) {
  let raw = body.timeKeys;
  if (raw == null) raw = [];
  if (typeof raw === 'string') raw = [raw];
  if (!Array.isArray(raw)) raw = [];

  const fromBoxes = raw.filter((x) => typeof x === 'string' && SLOT_TIMES.includes(x));

  const manual = typeof body.manualTimes === 'string' ? body.manualTimes : '';
  const manualParts = manual
    .split(/[,;\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const fromManual = manualParts.filter((p) => SLOT_TIMES.includes(p));

  const merged = [...new Set([...fromBoxes, ...fromManual])];
  merged.sort((a, b) => SLOT_TIMES.indexOf(a) - SLOT_TIMES.indexOf(b));
  return merged;
}

function parseExcludeWeekends(body) {
  const v = body.excludeWeekends;
  return v === 'on' || v === '1' || v === 'true' || v === true;
}

/**
 * @returns {{ ok: true, cells: Array<{ localDate: string, gridIndex: number, timeKey: string }> } | { ok: false, code: string }}
 */
function buildCandidateCells(fromStr, toStr, excludeWeekends, timeKeys) {
  if (!fromStr || !toStr || !/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
    return { ok: false, code: 'INVALID_DATES' };
  }

  let cursor = DateTime.fromISO(fromStr, { zone: SLOT_TIMEZONE }).startOf('day');
  const end = DateTime.fromISO(toStr, { zone: SLOT_TIMEZONE }).startOf('day');
  if (!cursor.isValid || !end.isValid) {
    return { ok: false, code: 'INVALID_DATES' };
  }
  if (cursor > end) {
    return { ok: false, code: 'INVALID_ORDER' };
  }

  const spanDays = Math.floor(end.diff(cursor, 'days').days) + 1;
  if (spanDays > MAX_BULK_RANGE_DAYS) {
    return { ok: false, code: 'RANGE_TOO_LARGE' };
  }

  const gridIndices = [
    ...new Set(timeKeys.map((tk) => SLOT_TIMES.indexOf(tk)).filter((i) => i >= 0)),
  ].sort((a, b) => a - b);

  if (gridIndices.length === 0) {
    return { ok: false, code: 'NO_TIMES' };
  }

  const cells = [];
  while (cursor <= end) {
    const wd = cursor.weekday;
    const isWeekend = wd === 6 || wd === 7;
    if (!excludeWeekends || !isWeekend) {
      const dateStr = cursor.toISODate();
      for (const gi of gridIndices) {
        cells.push({
          localDate: dateStr,
          gridIndex: gi,
          timeKey: timeKeyForGridIndex(gi),
        });
      }
    }
    cursor = cursor.plus({ days: 1 });
  }

  if (cells.length > MAX_BULK_CELLS) {
    return { ok: false, code: 'TOO_MANY_CELLS' };
  }

  return { ok: true, cells };
}

/**
 * @param {Array<{ localDate: string, gridIndex: number, timeKey?: string }>} cells
 * @param {Set<string>} existingKeys - keys `YYYY-MM-DD|gridIndex`
 */
function partitionCells(cells, existingKeys) {
  const newCells = [];
  const skippedCells = [];
  for (const c of cells) {
    const key = `${c.localDate}|${c.gridIndex}`;
    if (existingKeys.has(key)) {
      skippedCells.push({
        localDate: c.localDate,
        gridIndex: c.gridIndex,
        timeKey: c.timeKey ?? timeKeyForGridIndex(c.gridIndex),
      });
    } else {
      newCells.push({
        localDate: c.localDate,
        gridIndex: c.gridIndex,
        timeKey: c.timeKey ?? timeKeyForGridIndex(c.gridIndex),
      });
    }
  }
  return { newCells, skippedCells };
}

function mapBulkPreviewError(code) {
  switch (code) {
    case 'INVALID_DATES':
      return 'Vyberte platný dátum „od“ a „do“.';
    case 'INVALID_ORDER':
      return 'Dátum „od“ musí byť pred alebo rovnaký ako „do“.';
    case 'RANGE_TOO_LARGE':
      return `Rozsah môže byť najviac ${MAX_BULK_RANGE_DAYS} dní.`;
    case 'NO_TIMES':
      return 'Vyberte aspoň jeden čas (zaškrtnite alebo zadajte platné časy zo zoznamu).';
    case 'TOO_MANY_CELLS':
      return 'Príliš veľa termínov v jednom kroku. Skráťte rozsah alebo menej časov.';
    default:
      return 'Skontrolujte údaje a skúste znova.';
  }
}

module.exports = {
  MAX_BULK_RANGE_DAYS,
  MAX_BULK_CELLS,
  SLOT_TIMES,
  parseTimeKeysFromForm,
  parseExcludeWeekends,
  buildCandidateCells,
  partitionCells,
  mapBulkPreviewError,
};
