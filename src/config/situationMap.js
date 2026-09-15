/**
 * Mapa situácie v0 — qualitative funnel `mapa`.
 * Wording is working copy; edit here after internal tests.
 * Spec: docs/funnel/constellation/002-situation-map-v0.md
 */

const FUNNEL_NAME = 'mapa';

const landing = {
  kicker: 'Mapa situácie',
  headline: 'Mapa situácie',
  paragraphs: [
    'Niekedy vieme, že sa v našom živote niečo deje, ale je ťažké presne pomenovať, čo je na tom pre nás podstatné.',
    'Táto krátka Mapa ti pomôže zachytiť situáciu tak, ako ju vnímaš dnes – čo sa deje, koho sa týka, čo si už skúšal/a a čo by si chcel/a mať inak.',
    'Nejde o psychologický test ani diagnózu. Na konci dostaneš prehľad vytvorený z tvojich vlastných odpovedí.',
  ],
  cta: 'Vytvoriť svoju Mapu',
};

/**
 * `id` is a stable question identity for analytics (not screen order).
 * `field` is the semantic answer key / DB column mapping.
 * Array order is presentation only.
 */
const questions = [
  {
    id: 'Q1',
    field: 'topic',
    type: 'single',
    otherValue: 'other',
    otherField: 'topicOther',
    text: 'Ktorej oblasti sa situácia, ktorú chceš preskúmať, týka najviac?',
    options: [
      { value: 'relationship', label: 'partnerský vzťah' },
      { value: 'parents', label: 'rodičia a pôvodná rodina' },
      { value: 'children', label: 'deti a rodičovstvo' },
      { value: 'extended_family', label: 'širšia rodina' },
      { value: 'work_money', label: 'práca a peniaze' },
      { value: 'loss_change', label: 'strata, odlúčenie alebo veľká zmena' },
      { value: 'recurring', label: 'niečo, čo sa mi v živote opakuje' },
      { value: 'other', label: 'iné' },
    ],
  },
  {
    id: 'Q3',
    field: 'situationType',
    type: 'single',
    text: 'Je to skôr jedna konkrétna situácia, alebo niečo, čo sa opakuje?',
    options: [
      { value: 'one_off', label: 'jedna konkrétna situácia' },
      { value: 'repeating', label: 'niečo, čo sa opakuje' },
      { value: 'both', label: 'oboje' },
      { value: 'unknown', label: 'neviem' },
    ],
  },
  {
    id: 'Q4',
    field: 'duration',
    type: 'single',
    text: 'Ako dlho túto situáciu vnímaš?',
    options: [
      { value: 'under_3_months', label: 'menej ako 3 mesiace' },
      { value: 'months_3_12', label: '3–12 mesiacov' },
      { value: 'years_1_3', label: '1–3 roky' },
      { value: 'over_3_years', label: 'viac ako 3 roky' },
      { value: 'much_of_life', label: 'sprevádza ma veľkú časť života' },
      { value: 'unknown', label: 'neviem' },
    ],
  },
  {
    id: 'Q5',
    field: 'peopleInvolved',
    type: 'multi',
    otherValue: 'other',
    otherField: 'peopleInvolvedOther',
    text: 'Koho sa táto situácia priamo týka?',
    hint: 'Vyber všetky možnosti, ktoré sedia. Nemusíš uvádzať mená.',
    options: [
      { value: 'self', label: 'mňa' },
      { value: 'partner', label: 'partnera alebo ex-partnera' },
      { value: 'mother', label: 'mamy' },
      { value: 'father', label: 'otca' },
      { value: 'children', label: 'dieťaťa alebo detí' },
      { value: 'sibling', label: 'súrodenca' },
      { value: 'other_family', label: 'iného člena rodiny' },
      { value: 'outside_family', label: 'človeka mimo rodiny' },
      { value: 'other', label: 'iné' },
    ],
  },
  {
    id: 'Q2',
    field: 'situationDescription',
    type: 'textarea',
    skippable: true,
    maxLength: 800,
    rows: 3,
    nudge: 'Už máš polovicu.',
    text: 'Skús pár vetami opísať, čo sa momentálne deje.',
    hint: 'Nemusíš zachádzať do detailov ani uvádzať mená. Stačí to, čo je pre teba v tejto situácii podstatné.',
  },
  {
    id: 'Q6',
    field: 'attempts',
    type: 'multi',
    otherValue: 'other',
    otherField: 'attemptsOther',
    constellationValue: 'constellation',
    text: 'Čo si už v súvislosti s touto situáciou skúšal/a?',
    options: [
      { value: 'conversation', label: 'rozhovor s daným človekom' },
      { value: 'own_behavior', label: 'zmenu vlastného správania' },
      { value: 'counselling', label: 'poradenstvo, koučing alebo inú formu sprevádzania' },
      { value: 'constellation', label: 'konšteláciu' },
      { value: 'books_courses', label: 'knihy, kurzy alebo vlastnú prácu' },
      { value: 'nothing_yet', label: 'zatiaľ nič konkrétne' },
      { value: 'other', label: 'iné' },
    ],
  },
  {
    id: 'Q7',
    field: 'desiredChange',
    type: 'textarea',
    skippable: true,
    maxLength: 500,
    text: 'Čo by si chcel/a, aby bolo inak?',
  },
  {
    id: 'Q8',
    field: 'perceivedBarrier',
    type: 'single',
    otherValue: 'other',
    otherField: 'perceivedBarrierOther',
    /** Drop or replace without a schema migration: set enabled false. */
    experimental: true,
    enabled: true,
    text: 'Čo ti dnes najviac bráni posunúť sa ďalej?',
    options: [
      { value: 'dont_know_what', label: 'neviem, čo urobiť' },
      { value: 'know_but_stuck', label: 'viem, čo by som chcel/a urobiť, ale nedarí sa mi to' },
      { value: 'depends_on_other', label: 'závisí to aj od druhého človeka' },
      { value: 'dont_understand', label: 'situácii nerozumiem' },
      { value: 'mixed_feelings', label: 'mám v sebe protichodné pocity' },
      { value: 'unknown', label: 'neviem' },
      { value: 'other', label: 'iné' },
    ],
  },
];

const emailGate = {
  headline: 'Kam ti môžeme poslať tvoju Mapu situácie?',
  subhead: 'Mapu uvidíš hneď na ďalšej obrazovke. E-mail slúži na doručenie a na to, aby sme Mapu vedeli spárovať s tebou.',
  nameLabel: 'Meno / oslovenie',
  namePlaceholder: 'Tvoje meno',
  emailLabel: 'E-mail',
  emailPlaceholder: 'vas@email.sk',
  consentOptional: 'Chcem dostávať e-maily o možnostiach ďalšej práce. (nepovinné)',
  privacyNoteHtml:
    'E-mail použijeme na poskytnutie tvojej Mapy. Marketingové správy posielame len so súhlasom. Viac v <a href="/ochrana-udajov">ochrane údajov</a>.',
  cta: 'Zobraziť moju Mapu',
  errorName: 'Zadaj meno alebo oslovenie.',
  errorRequired: 'Zadaj platný e-mail.',
  errorGeneric: 'Niečo sa nepodarilo. Skús to prosím znova.',
};

const ui = {
  progress: 'Krok {current} z {total}',
  back: '← Späť',
  continue: 'Pokračovať',
  skip: 'Radšej preskočím',
  otherPlaceholder: 'Stručne dopíš…',
  resumeBanner: 'Pokračujeme tam, kde si prestal/a.',
  resumeCta: 'Pokračovať',
  restart: 'Vytvoriť novú Mapu',
  requiredChoice: 'Vyber jednu možnosť.',
  requiredMulti: 'Vyber aspoň jednu možnosť.',
  requiredText: 'Toto pole je povinné.',
  requiredOther: 'Dopíš, čo znamená „iné“.',
};

const recapCopy = {
  situationTitle: 'Tvoja situácia',
  situationLead: 'Svoju situáciu opisuješ takto:',
  situationSkipped: 'Opis situácie si tentokrát nevyplnil/a.',
  perceptionTitle: 'Ako ju momentálne vnímaš',
  perceptionType: 'Uviedol/a si, že ide o {label}.',
  perceptionDuration: 'Situáciu vnímaš {label}.',
  perceptionPeople: 'Podľa tvojich odpovedí sa priamo týka {people}.',
  attemptsTitle: 'Čo už za tebou je',
  desiredTitle: 'Kam sa chceš dostať',
  desiredSkipped: 'Túto časť si tentokrát nevyplnil/a.',
  barrierLead: 'Ako hlavnú prekážku momentálne vnímaš: {label}.',
  disclaimer:
    'Táto Mapa nie je diagnózou ani vysvetlením príčiny tvojej situácie. Zachytáva to, ako svoju situáciu vnímaš dnes, na základe odpovedí, ktoré si uviedol/a.',
};

/** v0: no paid offer. Keep slot in the UI for a later config-only CTA. */
const offer = null;

function isQuestionEnabled(question) {
  return question && question.enabled !== false;
}

function getEnabledQuestions() {
  return questions.filter(isQuestionEnabled);
}

function getQuestionById(id) {
  return questions.find((q) => q.id === id) || null;
}

function getQuestionByField(field) {
  return questions.find((q) => q.field === field) || null;
}

function getClientConfig() {
  return {
    funnelName: FUNNEL_NAME,
    landing,
    questions: getEnabledQuestions(),
    emailGate,
    ui,
    recapCopy,
    offer,
  };
}

module.exports = {
  FUNNEL_NAME,
  landing,
  questions,
  emailGate,
  ui,
  recapCopy,
  offer,
  isQuestionEnabled,
  getEnabledQuestions,
  getQuestionById,
  getQuestionByField,
  getClientConfig,
};
