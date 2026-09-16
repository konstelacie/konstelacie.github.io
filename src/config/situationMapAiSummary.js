/**
 * Internal AI summary experiment for Mapa situácie.
 * Version this file when the prompt changes so drafts stay comparable.
 *
 * Default mode is off: no third-party provider is wired.
 * `mock` restates user-provided facts in-process; it never sends data off-box.
 */

const { parseEnvFlag } = require('../lib/envFlag');

const PROMPT_VERSION = 'ai-summary-v1';

const MODES = new Set(['off', 'mock']);

function resolveMode(raw) {
  const mode = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (MODES.has(mode)) return mode;
  if (parseEnvFlag(raw, false)) return 'mock';
  return 'off';
}

const instructions = [
  'Úloha: stručne a neutrálne zosumarizuj situáciu výhradne z údajov, ktoré používateľ poskytol.',
  'Rozlišuj medzi tým, čo používateľ explicitne uviedol, a interpretáciou. Interpretácie nepíš.',
  'Nesmieš: diagnostikovať, určovať príčinu, používať terapeutické alebo medicínske tvrdenia,',
  'tvrdiť, že si identifikoval rodinný alebo systémový vzorec, odporúčať konšteláciu,',
  'generovať sales offer, ani formulovať text určený na automatické odoslanie používateľovi.',
  'Výstup je interný draft pre človeka. Píš v slovenčine.',
].join(' ');

function getAiSummaryConfig() {
  return {
    promptVersion: PROMPT_VERSION,
    mode: resolveMode(process.env.SITUATION_MAP_AI_SUMMARY_MODE),
    instructions,
  };
}

module.exports = {
  PROMPT_VERSION,
  MODES,
  instructions,
  resolveMode,
  getAiSummaryConfig,
};
