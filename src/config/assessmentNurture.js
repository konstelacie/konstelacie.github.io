/**
 * Post-assessment nurture sequence config (marketing timing + copy).
 * Strategy: docs/funnel/it-dev/022–025. SK copy below is placeholder until marketing delivers finals.
 */

const SEQUENCE_NAME = 'assessment_post_nurture_v1';
const TIMEZONE = 'Europe/Bratislava';
const CONSENT_SOURCE_ASSESSMENT_UNLOCK = 'assessment_unlock';

/** Absolute delay from enrollment (Europe/Bratislava calendar), not from previous send. */
const STEPS = [
  { step: 1, delayDays: 0, templateId: 'assessment-nurture-e1' },
  { step: 2, delayDays: 2, templateId: 'assessment-nurture-e2' },
  { step: 3, delayDays: 5, templateId: 'assessment-nurture-e3' },
  { step: 4, delayDays: 8, templateId: 'assessment-nurture-e4' },
  { step: 5, delayDays: 12, templateId: 'assessment-nurture-e5' },
  { step: 6, delayDays: 16, templateId: 'assessment-nurture-e6' },
  { step: 7, delayDays: 21, templateId: 'assessment-nurture-e7' },
];

/**
 * CTA destinations are configurable so mailto can later become booking URLs
 * without editing every email template.
 */
const CTA = {
  primary: {
    label: 'Požiadať o informácie',
    type: 'mailto',
    subject: 'Diagnostika životného autopilota — záujem',
  },
  secondary: {
    label: 'Pridať sa na waitlist',
    type: 'mailto',
    subject: 'Diagnostika životného autopilota — waitlist',
  },
};

/** Placeholder footer — marketing replaces before production. */
const FOOTER = {
  whyReceiving:
    'Tento e-mail dostávate, pretože ste po dokončení hodnotenia Life Autopilot súhlasili s odberom tipov a noviniek.',
  companyLine: null, // filled from site legal config at send time when null
  unsubscribeLabel: 'Odhlásiť sa z odberu',
};

/**
 * Universal SK placeholder copy (marketing will replace).
 * `personalizedHtml` slots stay empty in v1 — templates still support injection.
 * @type {Record<number, { subject: string, preview: string, paragraphs: string[], closingParagraphs?: string[], showCta?: 'none'|'soft'|'medium'|'primary' }>}
 */
const EMAIL_COPY = {
  1: {
    subject: 'Vaše hodnotenie je len začiatok.',
    preview: 'Jedna vec vo výsledkoch zámerne chýba.',
    showCta: 'none',
    paragraphs: [
      'Ďakujeme, že ste dokončili hodnotenie.',
      'Ak vám výsledky prišli prekvapivo výstižné, nie ste sami.',
      'Mnohí účastníci čakali ďalší osobnostný test. Namiesto toho rozpoznali vzorce, ktoré prežívajú už roky.',
      'Toto rozpoznanie je dôležité. Nie preto, že hodnotenie dáva všetky odpovede — ale preto, že dáva jazyk zážitkom, ktoré sa ťažko pomenúvajú.',
      'Tu mnohí ľudia končia. My veríme, že tu rozhovor začína.',
    ],
    closingParagraphs: [
      'Hodnotenie odpovedalo na dôležitú otázku: Čo sa zdá, že sa deje?',
      'Ešte je tu ďalšia otázka. Prečo?',
      'K tomu sa vrátime.',
    ],
  },
  2: {
    subject: 'Vzorce nie sú vaša osobnosť.',
    preview: 'To, čo sa opakuje, nie ste „vy“.',
    showCta: 'none',
    paragraphs: [
      'Keď ľudia vidia svoje výsledky, často si povedia: „Taký som.“',
      'To znie pravdivo. Ale nie je to celý príbeh.',
      'To, čo ste rozpoznali, sú skôr vzorce — spôsoby, ako váš systém reaguje pod tlakom, pri rozhodnutí alebo v kontaktoch s inými.',
      'Vzorec môže byť veľmi silný. Nemusí však byť vašou pevnou identitou.',
      'Keď oddelíte „toto sa deje“ od „toto som ja“, vzniká priestor. A v tom priestore sa dá niečo zmeniť.',
    ],
    closingParagraphs: [
      'Nabudúce sa pozrieme na to, čo hodnotenie zámerne neodhalí.',
    ],
  },
  3: {
    subject: 'Čo hodnotenie zámerne nevyjaví.',
    preview: 'Mapa nie je územie.',
    showCta: 'soft',
    paragraphs: [
      'Hodnotenie je dobré v jednom: pomáha rozpoznať, čo sa deje.',
      'Má však limity. Zámerne.',
      'Neodpovedá na to, prečo sa tieto vzorce vytvorili. Neukáže, kde v systéme je skutočný uzol. A nenahradí hlbší rozhovor.',
      'To nie je chyba nástroja. Je to hranica medzi mapou a územím.',
      'Ak vo vás ostala otázka „prečo?“, nie ste mimo. Ste presne tam, kam hodnotenie malo viesť.',
    ],
    closingParagraphs: [
      'Ďalej si povieme, prečo sú symptómy často zavádzajúce.',
    ],
  },
  4: {
    subject: 'Prečo symptómy klámu.',
    preview: 'Systém je dôležitejší než jedna ťažkosť.',
    showCta: 'soft',
    paragraphs: [
      'Ľudia často riešia to, čo bolí najhlasnejšie: únavu, odkladanie, napätie vo vzťahoch, stratu smeru.',
      'Tieto veci sú skutočné. Často však nie sú koreňom.',
      'Keď sa zameriate iba na symptóm, systém, ktorý ho vytvára, ostáva nedotknutý.',
      'Preto sa rovnaké ťažkosti vracajú v novom obale.',
      'Porozumenie systému — nie len jedného pocitu — je to, čo mení otázku z „ako to prestane?“ na „odkiaľ to prichádza?“',
    ],
    closingParagraphs: [
      'Nabudúce vysvetlíme, čo robí platená diagnostika — a čo nerobí.',
    ],
  },
  5: {
    subject: 'Čo je Diagnostická relácia.',
    preview: 'Iná otázka. Iný typ rozhovoru.',
    showCta: 'medium',
    paragraphs: [
      'Hodnotenie odpovedá: Čo sa zdá, že sa deje?',
      'Diagnostická relácia odpovedá na inú otázku: Prečo sa tieto vzorce vytvorili — a čo s tým ďalej dáva zmysel?',
      'Nie je to ďalší test. Nie je to balík tipov. Je to štruktúrovaný rozhovor, ktorý ide za hranicu sebahodnotenia.',
      'Cieľom nie je vás „opraviť“. Cieľom je spoločne pochopiť systém, v ktorom žijete.',
      'Ak už máte jazyk pre svoje vzorce, diagnostika je prirodzený ďalší krok — nie nátlak.',
    ],
  },
  6: {
    subject: 'Časté otázky pred ďalším krokom.',
    preview: 'Bez tlaku. S jasnosťou.',
    showCta: 'medium',
    paragraphs: [
      'Je diagnostika pre každého? Nie. Je pre tých, ktorí chcú ísť za rozpoznanie do porozumenia pôvodu.',
      'Musím sa hneď rozhodnúť pre ďalšiu spoluprácu? Nie. Relácia má vlastný zmysel aj bez záväzku.',
      'Čo ak mi už hodnotenie stačilo? To je v poriadku. Vtedy netreba nič ďalšie.',
      'Čo ak mám stále neistotu? To je bežné. Neistota nie je dôvod na nátlak — je dôvod spýtať sa.',
      'Ak chcete vedieť viac o priebehu, formáte alebo cene, stačí požiadať o informácie. Bez deadline a bez „poslednej šance“.',
    ],
  },
  7: {
    subject: 'Kam ďalej — je to úplne na vás.',
    preview: 'Bez tlaku. Len ďalšia otázka.',
    showCta: 'primary',
    paragraphs: [
      'Strávili ste čas pozorovaním vlastných vzorcov. Dúfame, že s menej sebaobviňovania a s viac zvedavosťou.',
      'Či budete pokračovať, je úplne vaše rozhodnutie.',
      'Ak vám hodnotenie už dalo, čo ste potrebovali — sme radi.',
      'Ak vo vás ostala jedna pretrvávajúca otázka: „Prečo sa tieto vzorce vytvorili?“ — práve preto Diagnostická relácia existuje.',
      'Nič viac. Nič menej.',
    ],
    closingParagraphs: [
      'Porozumenie nezmení život cez noc. Často však zmení to, čo konečne začína dávať zmysel.',
    ],
  },
};

/**
 * Future personalization blocks keyed by bottleneck / profile.
 * v1: empty — universal copy only; missing block never blocks send.
 * @type {Record<string, Record<number, string>>}
 */
const PERSONALIZATION_BLOCKS = {
  // autopilot: { 1: '...', 2: '...' },
  // identity: {},
  // energy: {},
  // relationships: {},
  // dual_primary: {},
  // balanced: {},
  // low_overall: {},
};

function getStepConfig(stepNumber) {
  return STEPS.find((s) => s.step === stepNumber) || null;
}

function getNextStepAfter(currentStep) {
  const next = STEPS.find((s) => s.step === currentStep + 1);
  return next || null;
}

function getEmailCopy(stepNumber) {
  return EMAIL_COPY[stepNumber] || null;
}

/**
 * @param {{ primaryBottleneck?: string|null, isDualPrimary?: boolean, isBalanced?: boolean, isLowOverall?: boolean }} profile
 * @param {number} stepNumber
 * @returns {string|null}
 */
function resolvePersonalizationHtml(profile, stepNumber) {
  const byStep = (key) => {
    const block = PERSONALIZATION_BLOCKS[key];
    if (!block) return null;
    const html = block[stepNumber];
    return typeof html === 'string' && html.trim() ? html.trim() : null;
  };

  if (profile?.isLowOverall) {
    const html = byStep('low_overall');
    if (html) return html;
  }
  if (profile?.isBalanced) {
    const html = byStep('balanced');
    if (html) return html;
  }
  if (profile?.isDualPrimary) {
    const html = byStep('dual_primary');
    if (html) return html;
  }
  const bottleneck = profile?.primaryBottleneck;
  if (bottleneck) {
    const html = byStep(bottleneck);
    if (html) return html;
  }
  return null;
}

module.exports = {
  SEQUENCE_NAME,
  TIMEZONE,
  CONSENT_SOURCE_ASSESSMENT_UNLOCK,
  STEPS,
  CTA,
  FOOTER,
  EMAIL_COPY,
  PERSONALIZATION_BLOCKS,
  getStepConfig,
  getNextStepAfter,
  getEmailCopy,
  resolvePersonalizationHtml,
};
