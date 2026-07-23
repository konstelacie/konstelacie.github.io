/**
 * Post-assessment nurture sequence config (marketing timing + copy).
 * Strategy: docs/funnel/it-dev/022–025.
 * Final SK production copy: docs/funnel/it-dev/027–030 (pack titled 026).
 * Inline emphasis: wrap in **bold** — rendered as <strong> at send time.
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
    subject: 'Záujem o Diagnostiku životného autopilota',
  },
  secondary: {
    label: 'Pridať sa na waitlist',
    type: 'mailto',
    subject: 'Záujem o waitlist Diagnostiky životného autopilota',
  },
};

const FOOTER = {
  whyReceiving:
    'Tento email dostávate, pretože ste po vyplnení Bezplatnej diagnostiky životného autopilota udelili súhlas so zasielaním tipov, článkov a noviniek o životnom autopilotovi.',
  companyLine: null, // filled from site legal config at send time when null
  unsubscribeLabel: 'Odhlásiť sa z odberu',
};

/**
 * Universal SK production copy (027–030).
 * `personalizedHtml` slots stay empty in v1 — templates still support injection.
 * @type {Record<number, { subject: string, preview: string, paragraphs: string[], closingParagraphs?: string[], showCta?: 'none'|'soft'|'medium'|'primary' }>}
 */
const EMAIL_COPY = {
  1: {
    subject: 'Vaše hodnotenie je len začiatok',
    preview: 'Možno ste vo výsledkoch spoznali viac, než ste čakali.',
    showCta: 'none',
    paragraphs: [
      'Ďakujeme, že ste si našli čas na vyplnenie Bezplatnej diagnostiky životného autopilota.',
      'Možno vás prekvapilo, ako presne výsledky pomenovali niečo, čo ste už dlhšie cítili, no nevedeli ste to úplne uchopiť.',
      'To býva jeden z najčastejších momentov, ktoré po diagnostike ľudia opisujú.',
      'Nie preto, že by diagnostika odhalila niečo nové.',
      'Ale preto, že dá pomenovanie vzorcom, ktoré sa často dlho dejú bez toho, aby sme si ich naplno uvedomovali.',
      'To je jej najväčšia hodnota.',
      'Nie je to test osobnosti.',
      'Nie je to nálepka.',
      'Je to prvý pohľad na spôsob, akým dnes funguje váš životný systém.',
      'Veľa ľudí sa v tomto bode zastaví.',
      'My si myslíme, že práve tu sa začína ten zaujímavejší rozhovor.',
    ],
    closingParagraphs: [
      'Bezplatná diagnostika odpovedá na jednu dôležitú otázku.',
      '**Čo sa vo vašom živote pravdepodobne deje.**',
      'Ostáva však ešte jedna.',
      '**Prečo sa to deje?**',
      'K nej sa dostaneme nabudúce.',
    ],
  },
  2: {
    subject: 'Čo ak to nie je vaša osobnosť?',
    preview: 'Nie všetko, čo sa opakuje, je súčasťou našej identity.',
    showCta: 'none',
    paragraphs: [
      'Po prečítaní výsledkov je prirodzené povedať si:',
      '„Taký jednoducho som.“',
      'Lenže medzi osobnosťou a vzorcom je veľký rozdiel.',
      'Niektoré spôsoby fungovania vznikajú postupne.',
      'Ako reakcia na prostredie.',
      'Na očakávania.',
      'Na skúsenosti.',
      'Na situácie, ktoré si vyžadovali určitý spôsob správania.',
      'V tom čase mohli byť užitočné.',
      'Pomohli zvládnuť náročné obdobie.',
      'Pomohli fungovať.',
      'Problém nastáva až vtedy, keď zostanú aktívne aj dlho potom, čo ich už nepotrebujeme.',
      'To, čo nás kedysi chránilo, nás dnes môže nevedomky obmedzovať.',
      'A práve preto má zmysel rozlišovať medzi tým, **kým ste**, a tým, **podľa akých vzorcov dnes fungujete**.',
    ],
    closingParagraphs: [
      'Ak je to pravda, objaví sa prirodzená otázka.',
      'Ak tieto vzorce nie sú mojou osobnosťou...',
      '**Odkiaľ sa vlastne vzali?**',
    ],
  },
  3: {
    subject: 'Na jednu otázku diagnostika neodpovedá',
    preview: 'A je to tak správne.',
    showCta: 'soft',
    paragraphs: [
      'Po výsledkoch sa niektorí ľudia pýtajú:',
      '**„Ak diagnostika pomenovala moje vzorce, prečo nepovie aj to, prečo vznikli?“**',
      'Je to dobrá otázka.',
      'A odpoveď je jednoduchá.',
      'Pretože by to bolo iba hádanie.',
      'Bezplatná diagnostika pracuje s tým, čo je možné rozpoznať z vašich odpovedí.',
      'Ukazuje súvislosti.',
      'Naznačuje vzorce.',
      'Pomáha pomenovať oblasti, ktoré si zaslúžia väčšiu pozornosť.',
      'Nepozná však váš príbeh.',
      'Nevie, aké rozhodnutia ste museli robiť.',
      'Nevie, v akom prostredí ste vyrastali.',
      'Nevie, čo ste sa počas života naučili, aby ste zvládali náročné situácie.',
      'A práve preto by nebolo poctivé tváriť sa, že vie povedať viac.',
      'Mnohé dnešné vzorce dávajú zmysel až vtedy, keď ich zasadíme do širšieho kontextu.',
      'Nie sú náhodné.',
      'Ale ani univerzálne.',
      'Každý človek má svoj vlastný príbeh.',
    ],
    closingParagraphs: [
      'Bezplatná diagnostika ukazuje **kde** sa dnes vzorce prejavujú.',
      'Otázka **prečo vznikli** si vyžaduje individuálny rozhovor.',
      'A práve tam začína ďalšia fáza.',
    ],
  },
  4: {
    subject: 'Problém nemusí byť tam, kde ho cítite',
    preview: 'Viditeľné prejavy sú často iba dôsledkom niečoho hlbšieho.',
    showCta: 'soft',
    paragraphs: [
      'Keď sa rozsvieti kontrolka v aute, málokto si myslí, že problémom je samotná kontrolka.',
      'Vnímame ju ako signál.',
      'Nie ako príčinu.',
      'Podobne fungujú aj naše životné vzorce.',
      'To, čo si všímame každý deň – únava, vnútorný tlak, opakujúce sa konflikty, pocit prázdnoty alebo neustále fungovanie na výkon – býva často iba viditeľnou časťou systému.',
      'Prirodzene sa snažíme odstrániť to, čo nás trápi.',
      'Hľadáme lepšiu organizáciu.',
      'Viac motivácie.',
      'Nové návyky.',
      'Oddych.',
      'Niektoré z týchto vecí môžu priniesť úľavu.',
      'Ak však nerozumieme tomu, čo celý systém udržiava v chode, často sa po čase ocitneme na rovnakom mieste.',
      'Nie preto, že by sme zlyhali.',
      'Ale preto, že sme riešili dôsledok namiesto príčiny.',
      'Životný autopilot nevzniká v jednej oblasti života.',
      'Vzorce sa navzájom ovplyvňujú.',
      'To, čo sa deje v práci, ovplyvňuje vzťahy.',
      'To, čo sa deje vo vzťahoch, ovplyvňuje energiu.',
      'A energia následne ovplyvňuje spôsob, akým robíme rozhodnutia.',
      'Preto sa pozeráme na systém ako na celok.',
      'Nie na izolované problémy.',
    ],
    closingParagraphs: [
      'Bezplatná diagnostika pomáha uvidieť mapu.',
      'Ďalším krokom je pochopiť, ako spolu jednotlivé časti tejto mapy súvisia.',
      'Práve v tom spočíva rozdiel medzi rozpoznaním vzorca a jeho skutočným pochopením.',
    ],
  },
  5: {
    subject: 'Prečo existuje ďalší krok po bezplatnej diagnostike',
    preview: 'Nejde o terapiu ani koučing. Odpovedá na inú otázku.',
    showCta: 'medium',
    paragraphs: [
      'Možno vám počas posledných dní napadla otázka:',
      '**„Keď už viem, čo sa vo mne deje, čo je vlastne ďalší krok?“**',
      'Mnohí v tej chvíli automaticky predpokladajú, že nasleduje koučing.',
      'Alebo terapia.',
      'Alebo séria odporúčaní, čo robiť inak.',
      'Diagnostika životného autopilota vznikla z iného dôvodu.',
      'Nezačíname riešením.',
      'Začíname porozumením.',
      'Počas 90-minútového individuálneho online stretnutia sa nesnažíme hľadať rýchle odpovede ani univerzálne návody.',
      'Spoločne sa pozeráme na to, ako sa váš súčasný spôsob fungovania postupne vytvoril.',
      'Aké skúsenosti mohli ovplyvniť vznik dnešných vzorcov.',
      'Ako sa jednotlivé oblasti vášho života navzájom ovplyvňujú.',
      'A kde má prípadná zmena najväčší zmysel.',
      'Nie preto, aby ste odchádzali s pocitom, že musíte všetko zmeniť.',
      'Ale preto, aby ste prvýkrát videli celý obraz.',
      'Veľmi často práve toto prinesie väčšiu úľavu než ďalší zoznam odporúčaní.',
    ],
    closingParagraphs: [
      'Bezplatná diagnostika odpovedá na otázku:',
      '**Čo sa deje?**',
      'Diagnostika životného autopilota skúma:',
      '**Prečo sa to deje.**',
      'Až keď rozumieme príčinám, má zmysel premýšľať nad tým, čo meniť.',
    ],
  },
  6: {
    subject: 'Možno vám ešte napadli tieto otázky',
    preview: 'Pred ďalším krokom býva prirodzené mať pochybnosti.',
    showCta: 'medium',
    paragraphs: [
      'Ak uvažujete nad Diagnostikou životného autopilota, možno ste si položili niektorú z týchto otázok.',
      '**Je to terapia?**',
      'Nie.',
      'Diagnostika neslúži na terapeutickú prácu ani na liečbu psychických ťažkostí.',
      'Jej cieľom je porozumieť tomu, ako vznikli vaše súčasné životné vzorce.',
      '**Je to koučing?**',
      'Tiež nie.',
      'Nebudeme spolu nastavovať ciele ani vytvárať akčný plán.',
      'Najskôr sa snažíme pochopiť systém, v ktorom dnes fungujete.',
      '**Dostanem konkrétne rady?**',
      'Ak by sme začali radami príliš skoro, mohli by sme riešiť dôsledky namiesto príčin.',
      'Preto je prvým výstupom diagnostiky porozumenie.',
      'Odporúčania dávajú zmysel až vo chvíli, keď vieme, z čoho vychádzajú.',
      '**Pre koho je diagnostika vhodná?**',
      'Pre ľudí, ktorí už nechcú iba skúšať ďalšie techniky alebo hľadať rýchle riešenia.',
      'Pre tých, ktorí chcú lepšie pochopiť vlastné fungovanie skôr, než začnú niečo meniť.',
      '**Pre koho vhodná nie je?**',
      'Ak hľadáte okamžité riešenie alebo očakávate, že vám niekto povie, čo máte robiť, pravdepodobne to nebude správny formát.',
      'Diagnostika nie je o radách.',
      'Je o porozumení.',
    ],
    closingParagraphs: [
      'Niekedy nie je najväčšou prekážkou nedostatok motivácie.',
      'Niekedy je to nedostatok jasnosti.',
      'A práve tú sa snažíme počas diagnostiky vytvoriť.',
    ],
  },
  7: {
    subject: 'Rozhodnutie nemusíte urobiť dnes',
    preview: 'Najdôležitejšie je, že už viete položiť správnu otázku.',
    showCta: 'primary',
    paragraphs: [
      'Za posledné tri týždne sme spolu prešli cestu od prvého rozpoznania až po pochopenie, prečo samotná bezplatná diagnostika nemôže dať všetky odpovede.',
      'Ak si z celej série odnesiete len jednu vec, budeme radi, ak to bude práve táto.',
      'To, že sa vo vašom živote opakujú určité vzorce, ešte neznamená, že je s vami niečo v neporiadku.',
      'Možno iba dlhodobo fungujete podľa systému, ktorý kedysi dával zmysel, ale dnes vás už viac obmedzuje, ako podporuje.',
      'A to je podstatný rozdiel.',
      'Nie preto, že by vám okamžite vyriešil život.',
      'Ale preto, že mení spôsob, akým sa pozeráte sami na seba.',
      'Možno vám bezplatná diagnostika stačila.',
      'Ak áno, sme radi, že vám pomohla lepšie pomenovať to, čo ste prežívali.',
      'Možno však vo vás zostala jedna otázka, ktorá sa počas celej série opakovala.',
      '**Prečo práve tieto vzorce?**',
      '**Prečo vznikli?**',
      '**A prečo sa stále opakujú, aj keď sa ich snažím zmeniť?**',
      'Ak je to práve táto otázka, na ktorú dnes hľadáte odpoveď, potom už nehľadáte ďalší článok.',
      'Ani ďalší test.',
      'Ani ďalší motivačný impulz.',
      'Hľadáte porozumenie.',
      'A presne na to vznikla Diagnostika životného autopilota.',
      'Počas 90-minútového individuálneho online stretnutia sa spolu pozrieme na váš konkrétny príbeh.',
      'Nie preto, aby sme vás zaradili do nejakej kategórie.',
      'Ale aby sme pochopili, ako vznikol systém, podľa ktorého dnes fungujete.',
      'Keď človek začne rozumieť príčinám, zrazu veľa vecí prestane pôsobiť náhodne.',
      'A práve vtedy môže začať robiť rozhodnutia s oveľa väčšou istotou.',
    ],
    closingParagraphs: [
      'Neexistuje správny čas pre každého.',
      'Ak cítite, že vám zatiaľ stačí to, čo ste sa dozvedeli z bezplatnej diagnostiky, je to úplne v poriadku.',
      'Ak však chcete ísť hlbšie a pochopiť, **prečo sa tieto vzorce vo vašom živote vytvorili**, radi vás spoznáme počas Diagnostiky životného autopilota.',
      'Ďakujeme, že ste nám venovali svoj čas aj dôveru.',
      'Držíme vám palce na ďalšej ceste.',
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
