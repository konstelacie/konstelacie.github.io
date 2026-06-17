/**
 * Product config for the email subscribe success page.
 * Loaded by `index.html` before the inline page script.
 */
window.OPEN_EMAIL_SUCCESS_CONFIG = {
  /** sessionStorage keys — must match `public/assets/js/open-email/navigateToSuccessPage.js`. */
  sessionKeys: {
    params: 'emailSubscribeSuccessParams',
    returnUrl: 'emailSubscribeSuccessReturnUrl',
    allowBackButton: 'emailSubscribeSuccessAllowBackButton',
  },

  /** Fallback when no return URL was stored (e.g. direct visit). */
  defaultReturnUrl: '/',

  /** Privacy policy link; `{lang}` is replaced with the active locale code when present. */
  privacyPolicyUrlTemplate: '/ochrana-udajov',

  /** Optional hero image; set to empty string to hide the mascot block. */
  mascotImageUrl: '',

  /**
   * Webmail deep links keyed by provider id from `guessEmailProviderId`.
   * Keep in sync with `public/assets/js/open-email/guessEmailProviderId.js`.
   */
  providerMap: {
    gmail: {
      url: 'https://mail.google.com/mail/u/0/#search/from:citimtedasom.sk',
      icon: 'https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_48dp.png',
    },
    outlook: { url: 'https://outlook.live.com/mail', icon: '' },
    hotmail: { url: 'https://outlook.live.com/mail', icon: '' },
    live: { url: 'https://outlook.live.com/mail', icon: '' },
    yahoo: { url: 'https://mail.yahoo.com', icon: '' },
    centrum: { url: 'https://mail.centrum.sk', icon: '' },
    azet: { url: 'https://mail.centrum.sk', icon: '' },
    zoznam: { url: 'https://mail.zoznam.sk', icon: '' },
    seznam: { url: 'https://email.seznam.cz/?q=citimtedasom', icon: '' },
    proton: { url: 'https://mail.proton.me', icon: '' },
    icloud: { url: 'https://www.icloud.com/mail', icon: '' },
    me: { url: 'https://www.icloud.com/mail', icon: '' },
    mac: { url: 'https://www.icloud.com/mail', icon: '' },
  },
};
