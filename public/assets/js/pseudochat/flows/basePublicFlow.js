/**
 * basePublicFlow – abstract base flow for public site.
 * Defines welcome, FAQ, cena/priebeh, login CTA, input nodes.
 */

export const basePublicFlow = {
  flowId: 'basePublic',
  version: '1.0',
  startNodeId: 'welcome',
  theme: { assistantName: 'Ľudmil' },
  nodes: {
    welcome: {
      type: 'menu',
      messages: ['Ahoj, som Ľudmil… vyber si:'],
      options: [
        { id: 'orientovat', label: 'Chcem sa nezáväzne zorientovať', next: 'faq' },
        { id: 'cena', label: 'Cena a priebeh', next: 'cenaPriebeh' },
        { id: 'termin', label: 'Termín / rezervácia', next: 'loginCta' },
        { id: 'odkaz', label: 'Chcem zanechať odkaz', next: 'inputOdkaz' },
        { id: 'otazka', label: 'Mám konkrétnu otázku', next: 'inputOtazka' },
      ],
    },
    faq: {
      type: 'menu',
      messages: ['Tu sú často kladené otázky. Čo ťa zaujíma?'],
      options: [
        { id: 'co_je', label: 'Čo to je?', next: 'faqCo' },
        { id: 'pre_koho', label: 'Pre koho je to?', next: 'faqPreKoho' },
        { id: 'spat', label: 'Späť na menu', next: 'welcome' },
      ],
    },
    faqCo: {
      type: 'message',
      messages: ['Konstelácie sú systémová metóda…'],
      options: [{ id: 'spat', label: 'Späť', next: 'faq' }],
    },
    faqPreKoho: {
      type: 'message',
      messages: ['Pre všetkých, ktorí…'],
      options: [{ id: 'spat', label: 'Späť', next: 'faq' }],
    },
    cenaPriebeh: {
      type: 'message',
      messages: ['Cena a priebeh: individuálne podľa typu a počtu…'],
      options: [
        { id: 'termin', label: 'Chcem termín', next: 'loginCta' },
        { id: 'spat', label: 'Späť', next: 'welcome' },
      ],
    },
    loginCta: {
      type: 'action',
      messages: [
        'Aby som ti mohol odpovedať osobne a aby si sa k tomu vedel vrátiť, prihlás sa do zony klienta.',
      ],
      options: [
        { id: 'login', label: 'Prihlásiť sa a pokračovať', next: 'welcome', action: 'OPEN_LOGIN' },
        { id: 'info', label: 'Radšej len všeobecné info', next: 'faq' },
      ],
    },
    inputOdkaz: {
      type: 'input',
      messages: ['Nechaj mi odkaz…'],
      input: {
        placeholder: 'Napíš svoj odkaz…',
        minLen: 3,
        maxLen: 500,
        storeKey: 'draft_question',
        submitLabel: 'Odoslať',
        onSubmitNext: 'loginCta',
      },
    },
    inputOtazka: {
      type: 'input',
      messages: [
        'Napíš svoju otázku – po prihlásení ti na ňu odpoviem v chate.',
      ],
      input: {
        placeholder: 'Tvoja otázka…',
        minLen: 3,
        maxLen: 500,
        storeKey: 'draft_question',
        submitLabel: 'Odoslať',
        onSubmitNext: 'loginCta',
      },
    },
    fallback: {
      type: 'message',
      messages: ['Niečo sa pokazilo. Skús znovu.'],
      options: [{ id: 'start', label: 'Začať znova', next: 'welcome' }],
    },
  },
};
