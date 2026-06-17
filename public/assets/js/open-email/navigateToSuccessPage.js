import { guessEmailProviderId } from './guessEmailProviderId.js';

/** sessionStorage keys — must match `/email-subscribe-success/index.html`. */
export const OPEN_EMAIL_SESSION_KEYS = {
  params: 'emailSubscribeSuccessParams',
  returnUrl: 'emailSubscribeSuccessReturnUrl',
  allowBackButton: 'emailSubscribeSuccessAllowBackButton',
};

const DEFAULT_SUPPORTED_LANGS = new Set(['en', 'es', 'de', 'fr', 'it', 'cs', 'sk']);

/**
 * @param {string} lang
 * @param {ReadonlySet<string>} [supportedLangs]
 */
export function normalizeSuccessPageLang(lang, supportedLangs = DEFAULT_SUPPORTED_LANGS) {
  const base = lang.toLowerCase().split('-')[0] ?? 'sk';
  return supportedLangs.has(base) ? base : 'sk';
}

/**
 * Full navigation to the static subscribe-success page (same tab).
 * Persists `lang` / `provider` in sessionStorage so the page can restore them if the query string is dropped.
 *
 * @param {{
 *   lang: string;
 *   email: string;
 *   returnUrl?: string;
 *   baseUrl?: string;
 *   successPagePath?: string;
 *   supportedLangs?: ReadonlySet<string>;
 *   sessionKeys?: typeof OPEN_EMAIL_SESSION_KEYS;
 * }} options
 */
export function navigateToSuccessPage(options) {
  const {
    lang,
    email,
    returnUrl = window.location.href,
    baseUrl = '/',
    successPagePath = 'email-subscribe-success/index.html',
    supportedLangs = DEFAULT_SUPPORTED_LANGS,
    sessionKeys = OPEN_EMAIL_SESSION_KEYS,
  } = options;

  const normalizedLang = normalizeSuccessPageLang(lang, supportedLangs);
  const provider = guessEmailProviderId(email) ?? '';

  try {
    sessionStorage.setItem(sessionKeys.params, JSON.stringify({ lang: normalizedLang, provider }));
    sessionStorage.setItem(sessionKeys.returnUrl, returnUrl);
    sessionStorage.setItem(sessionKeys.allowBackButton, '0');
  } catch {
    /* ignore quota / private mode */
  }

  const params = new URLSearchParams({ lang: normalizedLang });
  if (provider) params.set('provider', provider);

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const path = `${normalizedBase}${successPagePath.replace(/^\//, '')}?${params.toString()}`;
  const url = new URL(path, window.location.origin);

  window.location.assign(url.href);
}
