const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const {
  roundUpToInterval,
  computeEarliestStartUtc,
  isOnIntervalGrid,
  isStartBookable,
  buildPresetOptions,
  buildEarliestOption,
  listSchedulingOptions,
  resolveSelectionStart,
  resolveRoomPhase,
  computePlaybackOffsetSeconds,
} = require('../src/lib/webinarSchedule');

const baseConfig = {
  timezone: 'Europe/Bratislava',
  intervalMinutes: 15,
  minLeadMinutes: 15,
  durationMinutes: 60,
  lobbyOpenMinutes: 15,
  maxDaysAhead: 14,
  earliestOptionEnabled: true,
  presetTimes: ['20:00'],
  presetOptionsEnabled: true,
  customTimeEnabled: true,
};

test('roundUpToInterval snaps to 15-minute grid', () => {
  const local = DateTime.fromObject(
    { year: 2026, month: 7, day: 13, hour: 14, minute: 7 },
    { zone: 'Europe/Bratislava' }
  );
  const rounded = roundUpToInterval(local, 15);
  assert.equal(rounded.hour, 14);
  assert.equal(rounded.minute, 15);
});

test('computeEarliestStartUtc adds lead then rounds', () => {
  const now = DateTime.fromISO('2026-07-13T12:00:00.000Z', { zone: 'utc' });
  const start = computeEarliestStartUtc(baseConfig, now);
  const local = start.setZone('Europe/Bratislava');
  assert.equal(local.minute % 15, 0);
  assert.ok(start > now);
});

test('isOnIntervalGrid validates local wall clock', () => {
  const dt = DateTime.fromISO('2026-07-13T18:00:00.000Z', { zone: 'utc' });
  assert.equal(isOnIntervalGrid(dt, 15, 'Europe/Bratislava'), true);
  const bad = DateTime.fromISO('2026-07-13T18:07:00.000Z', { zone: 'utc' });
  assert.equal(isOnIntervalGrid(bad, 15, 'Europe/Bratislava'), false);
});

test('buildPresetOptions includes today and tomorrow 20:00 when bookable', () => {
  const now = DateTime.fromObject(
    { year: 2026, month: 7, day: 13, hour: 10, minute: 0 },
    { zone: 'Europe/Bratislava' }
  ).toUTC();

  const presets = buildPresetOptions(baseConfig, now);
  assert.ok(presets.length >= 2);
  assert.ok(presets.some((p) => p.id === 'preset:0:20:00'));
  assert.ok(presets.some((p) => p.id === 'preset:1:20:00'));
});

test('listSchedulingOptions dedupes earliest matching preset', () => {
  const now = DateTime.fromObject(
    { year: 2026, month: 7, day: 13, hour: 19, minute: 40 },
    { zone: 'Europe/Bratislava' }
  ).toUTC();

  const data = listSchedulingOptions(baseConfig, now);
  const earliest = data.options.find((o) => o.type === 'earliest');
  const presetToday = data.options.find((o) => o.id === 'preset:0:20:00');
  if (earliest && presetToday && earliest.startAtUtc === presetToday.startAtUtc) {
    assert.equal(presetToday, undefined);
  }
});

test('resolveSelectionStart handles earliest preset and custom', () => {
  const now = DateTime.fromObject(
    { year: 2026, month: 7, day: 13, hour: 10, minute: 0 },
    { zone: 'Europe/Bratislava' }
  ).toUTC();

  const earliest = resolveSelectionStart(baseConfig, { type: 'earliest' }, now);
  assert.equal(earliest.selectionType, 'earliest');

  const preset = resolveSelectionStart(
    baseConfig,
    { type: 'preset', optionId: 'preset:1:20:00' },
    now
  );
  assert.equal(preset.selectionType, 'preset');
  assert.equal(preset.startUtc.setZone('Europe/Bratislava').hour, 20);

  const customStart = DateTime.fromObject(
    { year: 2026, month: 7, day: 15, hour: 11, minute: 30 },
    { zone: 'Europe/Bratislava' }
  ).toUTC();
  const custom = resolveSelectionStart(
    baseConfig,
    { type: 'custom', startAtUtc: customStart.toISO() },
    now
  );
  assert.equal(custom.selectionType, 'custom');
});

test('resolveRoomPhase and playback offset', () => {
  const start = DateTime.fromISO('2026-07-13T18:00:00.000Z', { zone: 'utc' });
  const end = start.plus({ minutes: 60 });

  assert.equal(
    resolveRoomPhase(baseConfig, start, end, start.minus({ minutes: 20 })),
    'waiting'
  );
  assert.equal(
    resolveRoomPhase(baseConfig, start, end, start.minus({ minutes: 5 })),
    'lobby'
  );
  assert.equal(resolveRoomPhase(baseConfig, start, end, start.plus({ minutes: 10 })), 'live');
  assert.equal(resolveRoomPhase(baseConfig, start, end, end.plus({ minutes: 1 })), 'ended');

  assert.equal(computePlaybackOffsetSeconds(start, start.plus({ minutes: 5 })), 300);
});

test('isStartBookable rejects off-grid and too-soon starts', () => {
  const now = DateTime.fromISO('2026-07-13T12:00:00.000Z', { zone: 'utc' });
  const tooSoon = now.plus({ minutes: 5 });
  assert.equal(isStartBookable(baseConfig, tooSoon, now), false);

  const valid = computeEarliestStartUtc(baseConfig, now);
  assert.equal(isStartBookable(baseConfig, valid, now), true);
});
