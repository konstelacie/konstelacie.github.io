/** Recognized truthy env flag values (case-insensitive, trimmed). */
const ENV_FLAG_TRUTHY = new Set(['1', 'true', 'yes', 'on']);

/** Recognized falsy env flag values (case-insensitive, trimmed). */
const ENV_FLAG_FALSY = new Set(['0', 'false', 'no', 'off']);

/**
 * Parse a boolean env flag safely.
 * Unset, blank, or unrecognized values fall back to `defaultEnabled` (never guess “on”).
 *
 * @param {string|undefined|null} raw
 * @param {boolean} defaultEnabled
 * @returns {boolean}
 */
function parseEnvFlag(raw, defaultEnabled) {
  if (raw === undefined || raw === null) return defaultEnabled;
  const s = String(raw).trim().toLowerCase();
  if (s === '') return defaultEnabled;
  if (ENV_FLAG_FALSY.has(s)) return false;
  if (ENV_FLAG_TRUTHY.has(s)) return true;
  return defaultEnabled;
}

module.exports = {
  ENV_FLAG_TRUTHY,
  ENV_FLAG_FALSY,
  parseEnvFlag,
};
