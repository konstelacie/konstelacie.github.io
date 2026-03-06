/**
 * publicFlowConstellations – extends basePublicFlow for konstelácie offer.
 * Overrides welcome copy, cena/priebeh, adds FAQ items.
 */

export const publicFlowConstellations = {
  flowId: 'publicConstellations',
  version: '1.0',
  extends: 'basePublic',
  startNodeId: 'welcome',
  theme: { assistantName: 'Ľudmil' },
  nodes: {
    welcome: {
      messages: [
        'Ahoj, som Ľudmil. Pomôžem ti sa zorientovať v rodinných a systémových konsteláciách. Čo ťa zaujíma?',
      ],
      options: [
        { id: 'orientovat', label: 'Chcem sa nezáväzne zorientovať', next: 'faq' },
        { id: 'cena', label: 'Cena a priebeh', next: 'cenaPriebeh' },
        { id: 'termin', label: 'Termín / rezervácia', next: 'terminRezervacia' },
        { id: 'odkaz', label: 'Chcem zanechať odkaz', next: 'inputOdkaz' },
        { id: 'otazka', label: 'Mám konkrétnu otázku', next: 'inputOtazka' },
      ],
    },
    terminRezervacia: {
      type: 'action',
      messages: [
        'Môžeš si rezervovať termín priamo tu. Otvorí sa ti stránka s výberom dátumov.',
      ],
      options: [
        { id: 'otvorit', label: 'Otvoriť rezerváciu', next: 'welcome', action: 'OPEN_URL', actionPayload: { url: '/funnels/pilot/#booking' } },
        { id: 'spat', label: 'Späť', next: 'welcome' },
      ],
    },
    cenaPriebeh: {
      messages: [
        'Rodinné konstelácie: individuálne alebo v skupine. Cena závisí od formátu. Skupinové sedenia sú zvyčajne výhodnejšie.',
      ],
    },
    faq: {
      options: [
        { id: 'co_je', label: 'Čo to je?', next: 'faqCo' },
        { id: 'pre_koho', label: 'Pre koho je to?', next: 'faqPreKoho' },
        { id: 'ako_prebieha', label: 'Ako sedenie prebieha?', next: 'faqAkoPrebieha' },
        { id: 'cena_detail', label: 'Koľko to stojí?', next: 'cenaPriebeh' },
        { id: 'spat', label: 'Späť na menu', next: 'welcome' },
      ],
    },
    faqAkoPrebieha: {
      type: 'message',
      messages: ['Sedenie trvá cca 1–2 hodiny. Najprv krátky rozhovor, potom…'],
      options: [{ id: 'spat', label: 'Späť', next: 'faq' }],
    },
  },
};
