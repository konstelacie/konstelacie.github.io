/**
 * Life Autopilot Assessment — content + structure for funnel `autopilot`.
 * Copy source: docs/funnel/it-dev/017-assessment-content-sk.md
 * Questions: docs/funnel/it-dev/011-questionaire.md
 */

const dimensions = [
  { id: 'autopilot', labelSk: 'Autopilot', order: 1 },
  { id: 'identity', labelSk: 'Identita', order: 2 },
  { id: 'energy', labelSk: 'Energia', order: 3 },
  { id: 'relationships', labelSk: 'Vzťahy', order: 4 },
];

/** dimensionId → resultId */
const bottlenecks = {
  autopilot: 'autopilot_loop',
  identity: 'identity_loop',
  energy: 'energy_drain',
  relationships: 'connection_gap',
};

const bottleneckTitles = {
  autopilot_loop: 'Slučka autopilota',
  identity_loop: 'Slučka identity',
  energy_drain: 'Energetické vyčerpanie',
  connection_gap: 'Medzera v spojení',
};

const questions = [
  {
    id: 'A01',
    dimensionId: 'autopilot',
    order: 1,
    reverseScored: false,
    contextPrompt: 'Zamyslite sa nad posledným týždňom.',
    text: 'Keď sa obzriem za uplynulým týždňom, veľa dní mi splýva do jedného.',
  },
  {
    id: 'A02',
    dimensionId: 'autopilot',
    order: 2,
    reverseScored: false,
    text: 'Väčšina mojich dní sa odvíja skôr od povinností než od vedomých rozhodnutí.',
  },
  {
    id: 'A03',
    dimensionId: 'autopilot',
    order: 3,
    reverseScored: false,
    contextPrompt: 'Myslite na svoj bežný spôsob života — nie na výnimočné situácie.',
    text: 'Len zriedka sa zastavím a premýšľam, či mi môj súčasný spôsob života naozaj vyhovuje.',
  },
  {
    id: 'A04',
    dimensionId: 'autopilot',
    order: 4,
    reverseScored: false,
    text: 'Počas dňa väčšinou riešim to, čo práve prichádza, namiesto toho, aby som určoval smer ja.',
  },
  {
    id: 'A05',
    dimensionId: 'autopilot',
    order: 5,
    reverseScored: true,
    text: 'Mám pocit, že moje bežné dni odrážajú to, na čom mi skutočne záleží.',
  },
  {
    id: 'A06',
    dimensionId: 'autopilot',
    order: 6,
    reverseScored: false,
    text: 'Aj keď mám chvíľu pre seba, automaticky siaham po ďalšej úlohe alebo rozptýlení.',
  },
  {
    id: 'I01',
    dimensionId: 'identity',
    order: 7,
    reverseScored: false,
    contextPrompt: 'Zamyslite sa nad tým, ako reagujete, keď niečo zlyhá.',
    text: 'Keď sa niečo pokazí, často mám pocit, že je mojou úlohou to vyriešiť.',
  },
  {
    id: 'I02',
    dimensionId: 'identity',
    order: 8,
    reverseScored: false,
    text: 'Mám problém oddychovať, pokiaľ nemám pocit, že som si oddych zaslúžil.',
  },
  {
    id: 'I03',
    dimensionId: 'identity',
    order: 9,
    reverseScored: false,
    text: 'Keď sa mi dlhšie nič výrazné nepodarí, začnem pochybovať sám o sebe.',
  },
  {
    id: 'I04',
    dimensionId: 'identity',
    order: 10,
    reverseScored: false,
    contextPrompt: 'Spomeňte si na situáciu, keď ste mali povedať, čo chcete vy.',
    text: 'Keď sa ma niekto opýta, čo chcem ja, často najskôr premýšľam nad potrebami ostatných.',
  },
  {
    id: 'I05',
    dimensionId: 'identity',
    order: 11,
    reverseScored: true,
    text: 'Aj bez neustálej produktivity mám pocit, že moja hodnota zostáva rovnaká.',
  },
  {
    id: 'I06',
    dimensionId: 'identity',
    order: 12,
    reverseScored: false,
    text: 'Často odkladám dokončenie vecí, pretože ešte nie sú podľa mojich predstáv.',
  },
  {
    id: 'E01',
    dimensionId: 'energy',
    order: 13,
    reverseScored: false,
    contextPrompt: 'Všimnite si svoju energiu počas bežného dňa.',
    text: 'Aj keď mám konečne voľný večer, trvá mi dlho, kým sa naozaj uvoľním.',
  },
  {
    id: 'E02',
    dimensionId: 'energy',
    order: 14,
    reverseScored: false,
    text: 'Už ráno mám niekedy pocit, že mám menej energie, než by som potreboval na celý deň.',
  },
  {
    id: 'E03',
    dimensionId: 'energy',
    order: 15,
    reverseScored: false,
    text: 'Aj malé rozhodnutia ma občas vyčerpávajú viac než kedysi.',
  },
  {
    id: 'E04',
    dimensionId: 'energy',
    order: 16,
    reverseScored: false,
    text: 'Veci, ktoré ma kedysi tešili, robím dnes skôr zo zvyku.',
  },
  {
    id: 'E05',
    dimensionId: 'energy',
    order: 17,
    reverseScored: true,
    text: 'Po kvalitnom oddychu sa väčšinou cítim pripravený na nové výzvy.',
  },
  {
    id: 'E06',
    dimensionId: 'energy',
    order: 18,
    reverseScored: true,
    text: 'Mám pocit, že moje tempo života je dlhodobo udržateľné.',
  },
  {
    id: 'R01',
    dimensionId: 'relationships',
    order: 19,
    reverseScored: false,
    contextPrompt: 'Premyslite si posledné rozhovory s blízkymi.',
    text: 'Pri rozhovoroch s blízkymi často myslím na to, čo ešte musím urobiť.',
  },
  {
    id: 'R02',
    dimensionId: 'relationships',
    order: 20,
    reverseScored: false,
    text: 'Väčšina našich rozhovorov sa točí okolo povinností a organizovania bežného života.',
  },
  {
    id: 'R03',
    dimensionId: 'relationships',
    order: 21,
    reverseScored: false,
    contextPrompt: 'Zamyslite sa nad tým, čo zvyčajne zdieľate — a čo nie.',
    text: 'O tom, ako sa naozaj cítim, hovorím len zriedka.',
  },
  {
    id: 'R04',
    dimensionId: 'relationships',
    order: 22,
    reverseScored: false,
    text: 'Je pre mňa jednoduchšie pomáhať druhým, než požiadať o pomoc.',
  },
  {
    id: 'R05',
    dimensionId: 'relationships',
    order: 23,
    reverseScored: true,
    text: 'Cítim, že ľudia, na ktorých mi záleží, skutočne vedia, čo prežívam.',
  },
  {
    id: 'R06',
    dimensionId: 'relationships',
    order: 24,
    reverseScored: false,
    text: 'Aj keď trávim čas s blízkymi, niekedy mám pocit, že tam nie som úplne prítomný.',
  },
];

const likertLabels = [
  'Úplne nesúhlasím',
  'Nesúhlasím',
  'Ani súhlasím, ani nesúhlasím',
  'Súhlasím',
  'Úplne súhlasím',
];

const likertLabelsShort = ['Úplne nie', 'Nie', 'Neutrálne', 'Áno', 'Úplne áno'];

const microInsights = [
  {
    afterQuestionIndex: 4,
    headline: 'Život na autopilotovi',
    paragraphs: [
      'Mnohí ľudia si vedome nevyberú život na autopilotovi.',
      'Zvyčajne to prichádza postupne.',
      'Malé rutiny sa stanú návykmi, návyky normou — a jedného dňa je ťažké spomenúť si, kedy ste sa naposledy zastavili a opýtali sa, či váš život stále odráža to, na čom vám naozaj záleží.',
    ],
  },
  {
    afterQuestionIndex: 8,
    headline: 'Výkon a identita',
    paragraphs: [
      'Byť spoľahlivý, produktívny a schopný sú cenné vlastnosti.',
      'Výzva začína vtedy, keď sa výkon potichu stane hlavným zdrojom sebahodnoty.',
      'Vtedy oddych začne pôsobiť menej ako zotavenie a viac ako niečo, čo si treba najprv zaslúžiť.',
    ],
  },
  {
    afterQuestionIndex: 12,
    headline: 'Energia nie je len oddych',
    paragraphs: [
      'Nízka energia nemusí vždy vznikať z toho, že robíte príliš veľa.',
      'Niekedy prichádza z dlhšieho odpojenia od toho, čo vás skutočne dopĺňa.',
      'Obnova nie je len o tom spať viac — je aj o spôsobe života, ktorý energiu vracia.',
    ],
  },
  {
    afterQuestionIndex: 16,
    headline: 'Spojenie vzniká pomaly',
    paragraphs: [
      'Vzťahy sa zriedka vzdialia cez noc.',
      'Častejšie praktické povinnosti postupne nahradia zvedavosť, prítomnosť a zmysluplné rozhovory.',
      'Vzťah ďalej funguje — no už nemusí pôsobiť hlboko spojený.',
    ],
  },
  {
    afterQuestionIndex: 20,
    headline: 'Život je systém',
    paragraphs: [
      'Rôzne časti života sa navzájom neustále ovplyvňujú.',
      'Keď sa jedna oblasť začne vychyľovať z rovnováhy, dôsledky sa často najprv ukážu niekde inde.',
      'Pochopiť vzorec je prvý krok k tomu, aby ste ho mohli zmeniť.',
    ],
  },
];

const sectionHeadings = {
  whatItMeans: 'Čo to znamená',
  blindSpot: 'Skrytý slepý uhol',
  longTermRisk: 'Možné riziko v čase',
  firstStep: 'Prvý malý krok',
  transition: 'Kam to smeruje',
};

const bottleneckResults = {
  autopilot_loop: {
    title: bottleneckTitles.autopilot_loop,
    summary: [
      'Váš bežný deň sa postupne začal riadiť skôr rutinou než zámerom.',
      'Zvonka nemusí vyzerať, že je niečo dramaticky zle.',
      'Mnohé veci môžu fungovať dobre.',
      'Časom je však jednoduchšie reagovať na to, čo deň prinesie, než vedome voliť smer, ktorým chcete ísť.',
    ],
    whatItMeans: [
      'Pravdepodobne dobre zvládnete povinnosti.',
      'Veci dokončíte, riešite problémy a posúvate život dopredu.',
      'Výzvou je, že mnohé dni začnú pôsobiť prekvapivo podobne.',
      'Čas ubehne rýchlo — a chvíľ skutočnej prítomnosti je menej.',
      'Namiesto toho, aby ste život zámerne tvarovali, môžete mať pocit, že ho iba dobiehate.',
    ],
    blindSpot: [
      'Pretože vaše rutiny fungujú, zriedka pôsobia ako problém.',
      'Skutočná téma je, že efektivita môže potichu nahradiť reflexiu.',
      'Keď je málo priestoru na zastavenie, ťažko si všimnete, či život stále odráža to, na čom vám najviac záleží.',
    ],
    longTermRisk: [
      'Ak tento vzorec pokračuje, život môže zostať produktívny — a pritom postupne menej zmysluplný.',
      'Problémom zriedka býva nedostatok úspechu.',
      'Skôr rastúca vzdialenosť medzi každodennou aktivitou a osobným zámerom.',
    ],
    firstStep: [
      'Vyberte si tento týždeň jednu opakujúcu sa činnosť a urobte ju s plnou pozornosťou.',
      'Nie preto, aby ste zlepšili výkon.',
      'Len preto, aby ste si všimli, ako prítomní naozaj ste.',
    ],
    transition: [
      'Toto hodnotenie ukazuje, kde sa váš životný systém zdá bežať automaticky.',
      'Diagnostika životného autopilota skúma, ako tieto vzorce vznikli a kde majú zmeny najväčší pákový efekt.',
    ],
  },
  identity_loop: {
    title: bottleneckTitles.identity_loop,
    summary: [
      'Vaša sebahodnota sa zdá byť úzko spojená s tým, že ste produktívni, zodpovední alebo užitoční pre druhých.',
      'Výkon sa postupne stal viac než niečím, čo robíte.',
      'Stal sa súčasťou toho, ako sa hodnotíte.',
    ],
    whatItMeans: [
      'Pravdepodobne ste niekto, na koho sa ostatní spoľahnú.',
      'Zodpovednosť beriete vážne a prirodzene vstúpite, keď treba niečo vyriešiť.',
      'To sú silné stránky.',
      'Výzva nastáva vtedy, keď vlastné potreby konzistentne ustupujú do úzadia — a výkonom sa meria hodnota.',
    ],
    blindSpot: [
      'Môžete mať pocit, že ste jednoducho zodpovední.',
      'V skutočnosti môžete niesť očakávania, ktoré vám nikto výslovne neuložil.',
      'Časom sa identita viaže na to, čo pridávate — nie na to, kým ste.',
    ],
    longTermRisk: [
      'Výkon často prináša menej uspokojenia, pretože každý úspech sa rýchlo zmení na ďalšiu povinnosť.',
      'Oddych môže začať pôsobiť nepríjemne a osobné naplnenie sa stáva ťažšie dosiahnuteľným.',
    ],
    firstStep: [
      'Keď nabudúce budete mať voľný čas, odolajte nutkaniu najprv si ho zaslúžiť.',
      'Venujte pätnásť minút niečomu, čo neslúži ničomu inému než radosť.',
      'Všimnite si, aké myšlienky sa objavia.',
    ],
    transition: [
      'Toto hodnotenie ukazuje, že výkon môže aktuálne formovať váš život viac, než si uvedomujete.',
      'Diagnostika životného autopilota skúma, prečo tento vzorec vznikol a ako sa ďalej posilňuje.',
    ],
  },
  energy_drain: {
    title: bottleneckTitles.energy_drain,
    summary: [
      'Vaše súčasné tempo života sa zdá vyžadovať viac energie, než jej konzistentne vracia.',
      'Obnova už plne nestíha nároky, ktoré na vás kladie život.',
    ],
    whatItMeans: [
      'Zvonka môžete stále fungovať dobre.',
      'Povinnosti sú vybavené.',
      'Práca sa robí.',
      'Vnútorne však môže trvať dlhšie zotaviť sa, sústrediť sa alebo sa znova naozaj zapojiť.',
      'Nie je to len o tom, že ste zaneprázdnení.',
      'Ide o rovnováhu medzi energiou vydanou a energiou obnovenou.',
    ],
    blindSpot: [
      'Mnohí ľudia na nízku energiu reagujú snahou byť efektívnejší.',
      'Väčšia príležitosť často spočíva v tom, čo vás skutočne dopĺňa — nielen v tom, čo pomáha fyzicky sa spamätať.',
    ],
    longTermRisk: [
      'Ak nerovnováha pokračuje, bežné úlohy môžu vyžadovať čoraz viac úsilia — a motivácia aj nadšenie postupne klesajú.',
      'Problém býva jemný skôr, než sa stane zrejmým.',
    ],
    firstStep: [
      'Počas budúceho týždňa si všímajte, ktoré činnosti vás potom nechajú s viac energiou — nie len s pocitom produktivity.',
      'Jednu z nich si chráňte v kalendári.',
    ],
    transition: [
      'Toto hodnotenie poukazuje na miesto, kde môže byť váš energetický systém pod tlakom.',
      'Diagnostika životného autopilota skúma, prečo obnova zaostala a ktoré zmeny by mali najväčší dopad.',
    ],
  },
  connection_gap: {
    title: bottleneckTitles.connection_gap,
    summary: [
      'Vaše vzťahy sa zdajú dobre fungovať na praktickej úrovni — no emocionálne spojenie nemusí dostávať rovnakú pozornosť.',
      'Vzťah je aktívny.',
      'Spojenie môže slabnúť.',
    ],
    whatItMeans: [
      'Pravdepodobne trávite čas s ľuďmi, na ktorých vám záleží.',
      'Spoločne organizujete život, riešite problémy a plníte povinnosti.',
      'Zmysluplné rozhovory, zvedavosť a emocionálna prítomnosť však môžu byť menej časté než kedysi.',
    ],
    blindSpot: [
      'Vzťahy zriedka slabnú preto, že ľudia prestali stáť o seba.',
      'Častejšie bežný život postupne nahradí chvíle skutočného spojenia — bez toho, aby si to niekto všimol.',
    ],
    longTermRisk: [
      'Časom môžu vzťahy pôsobiť efektívne, ale emocionálne vzdialené.',
      'Zmena býva postupná, a preto ju ľahko prehliadnete, kým vzdialenosť nezačne pôsobiť výrazne.',
    ],
    firstStep: [
      'Tento týždeň položte jednej blízkej osobe neočakávanú otázku.',
      'Nie o práci ani o povinnostiach.',
      'Opýtajte sa na niečo, čo vám pomôže pochopiť, ako sa naozaj má.',
      'Potom počúvajte — bez snahy niečo hneď vyriešiť.',
    ],
    transition: [
      'Toto hodnotenie ukazuje, kde môže spojenie ustupovať rutine.',
      'Diagnostika životného autopilota skúma, ako tieto vzorce vznikli a ako dá obnoviť zmysluplné spojenie zámerne.',
    ],
  },
};

const closingMessage = [
  'Žiadny život sa nedá úplne pochopiť krátkym hodnotením.',
  'Tento výsledok nie je diagnózou toho, kým ste.',
  'Je to momentka toho, ako sa váš životný systém aktuálne zdá fungovať.',
  'Často je jasné uvidenie vzorca prvým krokom k tomu, aby ste ho mohli zmeniť.',
  'Ak chcete pochopiť, prečo tieto vzorce vznikli — a ktoré zmeny by mali najväčší dopad — Diagnostika životného autopilota pokračuje tam, kde toto hodnotenie končí.',
];

const dualPrimary = {
  intro: 'Tieto dva vzorce sa často navzájom posilňujú.',
  body: 'Keď jedna oblasť životného systému zostáva pod dlhodobým tlakom, druhá ju zvyčajne začne kompenzovať — a obe sa časom uzamknú do spoločného cyklu.',
};

/**
 * Pair-specific dual-primary blurbs. Keys are sorted bottleneck ids joined by `|`.
 * Falls back to `dualPrimary` when a pair is missing.
 */
const dualPrimaryPairs = {
  'energy_drain|identity_loop': {
    intro: 'Tieto dva vzorce sa často navzájom posilňujú.',
    body: 'Keď je sebahodnota úzko viazaná na výkon, obnova sa často odsúva nabok. Nižšia energia potom môže zvyšovať pocit, že výkon je ešte potrebný — a cyklus sa zatvára.',
  },
  'autopilot_loop|identity_loop': {
    intro: 'Tieto dva vzorce sa často navzájom posilňujú.',
    body: 'Keď sa deň napĺňa rutinou bez vedomého výberu, výkon sa ľahko stane jedinou kotvou identity. Autopilot potom drží tempo — a otázka „kto som bez výkonu?“ ostáva neodpovedaná.',
  },
  'autopilot_loop|energy_drain': {
    intro: 'Tieto dva vzorce sa často navzájom posilňujú.',
    body: 'Rutina bez renewalu vyčerpáva zásoby energie. Nižšia energia zase sťažuje zastavenie a vedomé rozhodovanie — a život ostáva v režime „iba pokračovať“.',
  },
  'autopilot_loop|connection_gap': {
    intro: 'Tieto dva vzorce sa často navzájom posilňujú.',
    body: 'Keď bežný deň beží na autopilotovi, blízke vzťahy môžu ustúpiť do pozadia. Menej spojenia potom ešte viac posilňuje návyk zvládať všetko sám — bez spoločného rytmu.',
  },
  'connection_gap|identity_loop': {
    intro: 'Tieto dva vzorce sa často navzájom posilňujú.',
    body: 'Keď sa hodnota viaže na výkon, blízkosť môže pôsobiť ako ďalšia úloha alebo riziko. Menšie spojenie potom zvyšuje tlak „dokázať sa“ inde — mimo vzťahov.',
  },
  'connection_gap|energy_drain': {
    intro: 'Tieto dva vzorce sa často navzájom posilňujú.',
    body: 'Vyčerpanie často skracuje priestor na prítomnosť vo vzťahoch. Slabšie spojenie potom berie ďalší zdroj obnovy — a energia klesá ešte rýchlejšie.',
  },
};

const balancedScores = [
  'Vaše odpovede naznačujú, že žiadna oblasť nevyčnieva jednoznačne. Viaceré časti životného systému sa zdajú navzájom ovplyvňovať.',
  'Platená diagnostika skúma práve tieto interakcie — nie izolované kategórie.',
];

const lowScores = [
  'Vaše odpovede naznačujú, že váš životný systém momentálne pôsobí relatívne vyvážene.',
  'Aj dobre fungujúce systémy majú úžitok z pravidelnej reflexie, keď sa okolnosti menia.',
  'Toto hodnotenie hľadá vzorce — nie dokonalosť.',
];

const landing = {
  headline: 'Máte pocit, že všetko funguje… ale niečo nesedí?',
  leadLines: [
    'Možno nejde o motiváciu.',
    'Možno vás vedie vzorec, ktorý ste si už prestali uvedomovať.',
  ],
  leadClose:
    'Diagnostika Life Autopilot odhalí, ktorá časť vášho životného systému dnes najviac ovplyvňuje rozhodnutia, energiu, identitu a vzťahy.',
  cta: 'Chcem zistiť svoj výsledok',
  diffTitle: 'Toto nie je test osobnosti.',
  diffBody: 'Nehodnotí, kto ste. Odhaľuje skryté vzorce vo vašom bežnom dni.',
  recognizeTitle: 'Možno sa v tomto spoznáte',
  recognizeBullets: [
    'Dni vám často splývajú jeden do druhého',
    'Aj počas oddychu myslíte na povinnosti',
    'Večer ste unavení, ale neviete úplne vypnúť',
    'Potreby ostatných riešite skôr než svoje',
    'Vo vzťahoch všetko funguje, no niečo im chýba',
  ],
  recognizeClose: 'Stačí jeden bod — diagnostika pomôže odhaliť vzorec za ním.',
  trustBadges: ['3–4 minúty', '24 krátkych otázok', 'Personalizovaný výsledok'],
  privacyNote:
    'Vaše odpovede slúžia výlučne na vytvorenie vašej personalizovanej diagnostiky.',
  philosophyLine:
    'Najťažšie sa odhaľujú vzorce, ktoré nám pripadajú úplne normálne.',
  receiveTitle: 'Čo získate',
  receiveBullets: [
    'ktorý vzorec dnes najviac ovplyvňuje váš život',
    'ako sa prejavuje vo vašom bežnom dni',
    'jeden jednoduchý krok, ktorým môžete začať',
  ],
  systemsTitle: 'Štyri časti životného systému',
  systemsMoreLabel: 'Viac',
  systemsLessLabel: 'Menej',
  systems: [
    {
      id: 'autopilot',
      label: 'Autopilot',
      summary: 'Keď sa dni podobajú jeden na druhý a život sa viac deje, než tvorí.',
      detail: 'Rutiny postupne nahradia vedomé rozhodnutia.',
    },
    {
      id: 'identity',
      label: 'Identita',
      summary: 'Keď vlastnú hodnotu spájame s výkonom alebo zodpovednosťou.',
      detail: 'Výzva nastáva, keď výkon potichu prevezme úlohu zdroja sebahodnoty.',
    },
    {
      id: 'energy',
      label: 'Energia',
      summary: 'Keď tempo života spotrebúva viac energie, než dokáže vrátiť.',
      detail: 'Oddych existuje, no regenerácia nestíha.',
    },
    {
      id: 'relationships',
      label: 'Vzťahy',
      summary: 'Keď spolu fungujeme, ale prestávame sa skutočne spájať.',
      detail: 'Koordinácia beží — chýba však priestor na skutočné stretnutie.',
    },
  ],
  previewEyebrow: 'Ukážka výsledku',
  previewTitle: 'Váš životný systém',
  previewCaption: 'Ilustračný príklad personalizovanej diagnostiky.',
  previewRows: [
    { label: 'Identita', width: 88 },
    { label: 'Energia', width: 72 },
    { label: 'Autopilot', width: 58 },
    { label: 'Vzťahy', width: 45 },
  ],
  whyTitle: 'Prečo vznikla táto diagnostika?',
  whyParagraphs: [
    'Mnohí ľudia hľadajú viac motivácie alebo lepší time management.',
    'Často však nejde o nich — ale o vzorce, ktoré sa stali neviditeľnými.',
    'Táto diagnostika ich pomáha zviditeľniť.',
  ],
};

/** Shown once after landing CTA, before question 1. */
const prepare = {
  headline: 'Začíname',
  paragraphs: [
    'Počas nasledujúcich 24 krátkych otázok odpovedajte podľa toho, ako veci zažívate najčastejšie — nie podľa výnimočných situácií.',
    'Neexistujú správne ani nesprávne odpovede.',
  ],
  rewardTitle: 'Za približne 4 minúty získate:',
  rewardItems: [
    'hlavný vzorec',
    'sekundárny vzorec',
    'personalizované vysvetlenie',
    'odporúčaný prvý krok',
  ],
  cta: 'Začať diagnostiku',
};

const analyzing = {
  headline: 'Analyzujeme vaše odpovede…',
  body: 'Skúmame vzťahy medzi jednotlivými oblasťami vášho životného systému.',
  /** Timed interstitial before email gate (018: ~1.5–2.5 s). */
  durationMs: 2000,
};

const emailGate = {
  headline: 'Vaše personalizované hodnotenie je pripravené.',
  subhead:
    'Zadajte e-mail a odomknite personalizované vyhodnotenie štyroch oblastí životného systému.',
  emailLabel: 'E-mail',
  emailPlaceholder: 'vas@email.sk',
  consentOptional:
    'Chcem dostávať tipy, články a novinky o životnom autopilotovi. (nepovinné)',
  privacyNoteHtml:
    'Odoslaním súhlasíte so spracovaním e-mailu na doručenie výsledkov. Viac v <a href="/ochrana-udajov">ochrane údajov</a>.',
  cta: 'Odomknúť výsledky',
  errorRequired: 'Zadajte platný e-mail.',
  errorGeneric: 'Niečo sa nepodarilo. Skúste to prosím znova.',
};

const ui = {
  progress: 'Otázka {current} z {total}',
  remainingMinutesFew: '≈ {minutes} minúty zostávajú',
  remainingMinutesMany: '≈ {minutes} minút zostáva',
  remainingMinuteOne: '≈ 1 minúta zostáva',
  remainingAlmost: 'Už skoro koniec.',
  reassurance:
    'Nie sú správne ani nesprávne odpovede. Vyberte možnosť, ktorá najlepšie vystihuje vašu každodennú skúsenosť.',
  back: '← Späť',
  continue: 'Pokračovať',
  insightKicker: 'Krátke zamyslenie',
  resumeBanner: 'Pokračujeme tam, kde ste prestali.',
  resumeCta: 'Pokračovať',
  restart: 'Začať odznova',
  systemHeading: 'Váš životný systém',
  primarySingle: 'Primárne úzke miesto',
  primaryDual: 'Primárne úzke miesta',
  secondary: 'Sekundárny vzorec',
  accompaniedBy: 'Často sa objavuje spolu s',
  scoreHint: 'Normalizované skóre (0–100 %)',
};

const paidCta = {
  title: 'Chcete pochopiť, prečo tieto vzorce vznikli?',
  body: 'Diagnostika životného autopilota je 90-minútové individuálne stretnutie online. Spoločne prejdeme, ako vzorce vznikli a kde majú zmeny najväčší efekt.',
  primaryCta: 'Požiadať o informácie',
  secondaryCta: 'Pridať sa na waitlist',
  contactHint: 'Ozveme sa s termínmi a detailmi. Bez záväzku.',
  /** Option A (009 §15): static mailto — no Stripe/booking in v1 */
  mailtoSubject: 'Diagnostika životného autopilota — záujem',
  waitlistMailtoSubject: 'Diagnostika životného autopilota — waitlist',
};

/**
 * Browser-safe payload (no functions).
 * @returns {object}
 */
function getClientConfig() {
  return {
    dimensions,
    bottlenecks,
    bottleneckTitles,
    questions,
    likertLabels,
    likertLabelsShort,
    microInsights,
    sectionHeadings,
    bottleneckResults,
    closingMessage,
    dualPrimary,
    dualPrimaryPairs,
    balancedScores,
    lowScores,
    landing,
    prepare,
    analyzing,
    emailGate,
    ui,
    paidCta,
  };
}

module.exports = {
  dimensions,
  bottlenecks,
  bottleneckTitles,
  questions,
  likertLabels,
  likertLabelsShort,
  microInsights,
  sectionHeadings,
  bottleneckResults,
  closingMessage,
  dualPrimary,
  dualPrimaryPairs,
  balancedScores,
  lowScores,
  landing,
  prepare,
  analyzing,
  emailGate,
  ui,
  paidCta,
  getClientConfig,
};
