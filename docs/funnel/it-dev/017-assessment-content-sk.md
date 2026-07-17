# 017 — Life Autopilot Assessment — Phase 0 Content (Slovak)

**Status:** Phase 0 complete — production-ready Slovak strings for v1 shell  
**Audience:** Implementers mapping copy into `src/config/assessmentAutopilot.js`  
**Language:** User-facing Slovak; field names / ids remain English

This document is the **canonical Slovak content pack** for v1. English drafts remain in `012` / `013` for methodology reference. Questions stay in `011`. Scoring rules stay in `014`.

Map every section below into the config exports listed in `016` §6 / `009` §9.

---

## 1. Product naming (UI)

| Role | Slovak |
|------|--------|
| Free assessment (short) | Diagnostika životného autopilota |
| Free assessment (with free) | Bezplatná diagnostika životného autopilota |
| Duration hint | približne 3–4 minúty |
| Paid offer | Diagnostika životného autopilota |
| Paid offer detail | 90-minútové individuálne stretnutie (online) |

Do not call the free flow a “test osobnosti” or “kvíz”. Prefer **diagnostika** / **hodnotenie životného systému**.

---

## 2. Likert labels

Values map to scores **1–5** (before reverse scoring).

| Value | Label (SK) | Short label (optional, mobile) |
|-------|------------|--------------------------------|
| 1 | Úplne nesúhlasím | Úplne nie |
| 2 | Nesúhlasím | Nie |
| 3 | Ani súhlasím, ani nesúhlasím | Neutrálne |
| 4 | Súhlasím | Áno |
| 5 | Úplne súhlasím | Úplne áno |

**Config:** `likertLabels: ['Úplne nesúhlasím', 'Nesúhlasím', 'Ani súhlasím, ani nesúhlasím', 'Súhlasím', 'Úplne súhlasím']`

Prefer full labels on desktop; short labels only if the layout forces truncation.

Also update `011` English scale list to include these SK strings as the production scale.

---

## 3. Dimensions & bottlenecks (labels)

### Dimensions (`dimensions`)

| id | labelSk | order |
|----|---------|-------|
| `autopilot` | Autopilot | 1 |
| `identity` | Identita | 2 |
| `energy` | Energia | 3 |
| `relationships` | Vzťahy | 4 |

### Bottlenecks (`bottlenecks`)

| dimensionId | resultId | titleSk |
|-------------|----------|---------|
| `autopilot` | `autopilot_loop` | Slučka autopilota |
| `identity` | `identity_loop` | Slučka identity |
| `energy` | `energy_drain` | Energetické vyčerpanie |
| `relationships` | `connection_gap` | Medzera v spojení |

Results UI chrome:

| Key | Slovak |
|-----|--------|
| System heading | Váš životný systém |
| Primary (single) | Primárne úzke miesto |
| Primary (dual) | Primárne úzke miesta |
| Secondary | Sekundárny vzorec |
| Closely accompanied by | Často sa objavuje spolu s |
| Score axis hint | Normalizované skóre (0–100 %) |

Cautious result lead-ins (use where a sentence needs hedging):

- Vaše odpovede naznačujú…
- Váš súčasný životný systém sa zdá byť najviac ovplyvnený…

Avoid: Ste… / Máte diagnózu… / Ste typ…

---

## 4. Landing (`landing`)

### Hero

**headline**

> Zistite, ktorá časť vášho životného systému ticho beží na autopilotovi.

**subhead**

> Bezplatné hodnotenie na 3–4 minúty. Ukáže skryté vzorce, ktoré ovplyvňujú energiu, identitu, vzťahy a bežný deň.

**cta**

> Spustiť diagnostiku

### Difference (optional block)

**diffTitle**

> Toto nie je test osobnosti.

**diffBody**

> Identifikuje aktuálne úzke miesta vo vašom životnom systéme. Cieľom je uvedomenie — nie nálepky.

### What you’ll receive

**receiveTitle**

> Čo získate

**receiveBullets**

1. primárne úzke miesto
2. sekundárny vzorec
3. ako sa vzorec prejavuje v bežnom dni
4. najväčší slepý uhol
5. jeden praktický prvý krok

### Credibility

**systemsTitle**

> Štyri prepojené oblasti životného systému

**systems**

1. Autopilot
2. Identita
3. Energia
4. Vzťahy

**durationNote**

> 24 otázok · jedna obrazovka naraz · môžete sa vrátiť späť

---

## 5. Assessment chrome (UI strings)

| Key | Slovak |
|-----|--------|
| Progress | Otázka {current} z {total} |
| Back | Späť |
| Continue (insight) | Pokračovať |
| Resume banner | Pokračujeme tam, kde ste prestali. |
| Resume CTA | Pokračovať |
| Restart | Začať odznova |

---

## 6. Micro-insights (`microInsights`)

Source: `012`. Display after questions 4, 8, 12, 16, 20 (1-based index in UI = after those question numbers).

### Insight 1 — afterQuestionIndex: 4

**headline:** Život na autopilotovi

> Mnohí ľudia si vedome nevyberú život na autopilotovi.
>
> Zvyčajne to prichádza postupne.
>
> Malé rutiny sa stanú návykmi, návyky normou — a jedného dňa je ťažké spomenúť si, kedy ste sa naposledy zastavili a opýtali sa, či váš život stále odráža to, na čom vám naozaj záleží.

### Insight 2 — afterQuestionIndex: 8

**headline:** Výkon a identita

> Byť spoľahlivý, produktívny a schopný sú cenné vlastnosti.
>
> Výzva začína vtedy, keď sa výkon potichu stane hlavným zdrojom sebahodnoty.
>
> Vtedy oddych začne pôsobiť menej ako zotavenie a viac ako niečo, čo si treba najprv zaslúžiť.

### Insight 3 — afterQuestionIndex: 12

**headline:** Energia nie je len oddych

> Nízka energia nemusí vždy vznikať z toho, že robíte príliš veľa.
>
> Niekedy prichádza z dlhšieho odpojenia od toho, čo vás skutočne dopĺňa.
>
> Obnova nie je len o tom spať viac — je aj o spôsobe života, ktorý energiu vracia.

### Insight 4 — afterQuestionIndex: 16

**headline:** Spojenie vzniká pomaly

> Vzťahy sa zriedka vzdialia cez noc.
>
> Častejšie praktické povinnosti postupne nahradia zvedavosť, prítomnosť a zmysluplné rozhovory.
>
> Vzťah ďalej funguje — no už nemusí pôsobiť hlboko spojený.

### Insight 5 — afterQuestionIndex: 20

**headline:** Život je systém

> Rôzne časti života sa navzájom neustále ovplyvňujú.
>
> Keď sa jedna oblasť začne vychyľovať z rovnováhy, dôsledky sa často najprv ukážu niekde inde.
>
> Pochopiť vzorec je prvý krok k tomu, aby ste ho mohli zmeniť.

---

## 7. Analyzing (`analyzing`)

Timed interstitial (~2–3 s) before email gate.

**messages** (rotate or show sequentially):

1. Prechádzame vaše odpovede…
2. Hľadáme vzorce vo vašom životnom systéme…
3. Pripravujeme personalizovaný výsledok…

**fallback single line**

> Vyhodnocujeme vaše odpovede…

Do not claim certainty (“máme diagnózu”). Prefer process language.

---

## 8. Email gate (`emailGate`)

**headline**

> Vaše výsledky sú pripravené.

**subhead**

> Zadajte e-mail a odomknite personalizované vyhodnotenie štyroch oblastí životného systému.

**emailLabel**

> E-mail

**emailPlaceholder**

> vas@email.sk

**consentOptional**

> Chcem dostávať tipy, články a novinky o životnom autopilotovi. (nepovinné)

**privacyNote**

> Odoslaním súhlasíte so spracovaním e-mailu na doručenie výsledkov. Viac v [ochrane údajov](/ochrana-udajov).

**cta**

> Odomknúť výsledky

**errorRequired**

> Zadajte platný e-mail.

**errorGeneric**

> Niečo sa nepodarilo. Skúste to prosím znova.

---

## 9. Bottleneck results (`bottleneckResults`)

Six sections per bottleneck, matching `013`. Store as plain text paragraphs (UI splits on blank lines) or structured fields:

`summary` · `whatItMeans` · `blindSpot` · `longTermRisk` · `firstStep` · `transition`

Section headings (shared):

| Field | Heading SK |
|-------|------------|
| `summary` | *(shown as lead under title — no extra H)* |
| `whatItMeans` | Čo to znamená |
| `blindSpot` | Skrytý slepý uhol |
| `longTermRisk` | Možné riziko v čase |
| `firstStep` | Prvý malý krok |
| `transition` | Kam to smeruje |

---

### 9.1 `autopilot_loop` — Slučka autopilota

**summary**

Váš bežný deň sa postupne začal riadiť skôr rutinou než zámerom.

Zvonka nemusí vyzerať, že je niečo dramaticky zle.

Mnohé veci môžu fungovať dobre.

Časom je však jednoduchšie reagovať na to, čo deň prinesie, než vedome voliť smer, ktorým chcete ísť.

**whatItMeans**

Pravdepodobne dobre zvládnete povinnosti.

Veci dokončíte, riešite problémy a posúvate život dopredu.

Výzvou je, že mnohé dni začnú pôsobiť prekvapivo podobne.

Čas ubehne rýchlo — a chvíľ skutočnej prítomnosti je menej.

Namiesto toho, aby ste život zámerne tvarovali, môžete mať pocit, že ho iba dobiehate.

**blindSpot**

Pretože vaše rutiny fungujú, zriedka pôsobia ako problém.

Skutočná téma je, že efektivita môže potichu nahradiť reflexiu.

Keď je málo priestoru na zastavenie, ťažko si všimnete, či život stále odráža to, na čom vám najviac záleží.

**longTermRisk**

Ak tento vzorec pokračuje, život môže zostať produktívny — a pritom postupne menej zmysluplný.

Problémom zriedka býva nedostatok úspechu.

Skôr rastúca vzdialenosť medzi každodennou aktivitou a osobným zámerom.

**firstStep**

Vyberte si tento týždeň jednu opakujúcu sa činnosť a urobte ju s plnou pozornosťou.

Nie preto, aby ste zlepšili výkon.

Len preto, aby ste si všimli, ako prítomní naozaj ste.

**transition**

Toto hodnotenie ukazuje, kde sa váš životný systém zdá bežať automaticky.

Diagnostika životného autopilota skúma, ako tieto vzorce vznikli a kde majú zmeny najväčší pákový efekt.

---

### 9.2 `identity_loop` — Slučka identity

**summary**

Vaša sebahodnota sa zdá byť úzko spojená s tým, že ste produktívni, zodpovední alebo užitoční pre druhých.

Výkon sa postupne stal viac než niečím, čo robíte.

Stal sa súčasťou toho, ako sa hodnotíte.

**whatItMeans**

Pravdepodobne ste niekto, na koho sa ostatní spoľahnú.

Zodpovednosť beriete vážne a prirodzene vstúpite, keď treba niečo vyriešiť.

To sú silné stránky.

Výzva nastáva vtedy, keď vlastné potreby konzistentne ustupujú do úzadia — a výkonom sa meria hodnota.

**blindSpot**

Môžete mať pocit, že ste jednoducho zodpovední.

V skutočnosti môžete niesť očakávania, ktoré vám nikto výslovne neuložil.

Časom sa identita viaže na to, čo pridávate — nie na to, kým ste.

**longTermRisk**

Výkon často prináša menej uspokojenia, pretože každý úspech sa rýchlo zmení na ďalšiu povinnosť.

Oddych môže začať pôsobiť nepríjemne a osobné naplnenie sa stáva ťažšie dosiahnuteľným.

**firstStep**

Keď nabudúce budete mať voľný čas, odolajte nutkaniu najprv si ho zaslúžiť.

Venujte pätnásť minút niečomu, čo neslúži ničomu inému než radosť.

Všimnite si, aké myšlienky sa objavia.

**transition**

Toto hodnotenie ukazuje, že výkon môže aktuálne formovať váš život viac, než si uvedomujete.

Diagnostika životného autopilota skúma, prečo tento vzorec vznikol a ako sa ďalej posilňuje.

---

### 9.3 `energy_drain` — Energetické vyčerpanie

**summary**

Vaše súčasné tempo života sa zdá vyžadovať viac energie, než jej konzistentne vracia.

Obnova už plne nestíha nároky, ktoré na vás kladie život.

**whatItMeans**

Zvonka môžete stále fungovať dobre.

Povinnosti sú vybavené.

Práca sa robí.

Vnútorne však môže trvať dlhšie zotaviť sa, sústrediť sa alebo sa znova naozaj zapojiť.

Nie je to len o tom, že ste zaneprázdnení.

Ide o rovnováhu medzi energiou vydanou a energiou obnovenou.

**blindSpot**

Mnohí ľudia na nízku energiu reagujú snahou byť efektívnejší.

Väčšia príležitosť často spočíva v tom, čo vás skutočne dopĺňa — nielen v tom, čo pomáha fyzicky sa spamätať.

**longTermRisk**

Ak nerovnováha pokračuje, bežné úlohy môžu vyžadovať čoraz viac úsilia — a motivácia aj nadšenie postupne klesajú.

Problém býva jemný skôr, než sa stane zrejmým.

**firstStep**

Počas budúceho týždňa si všímajte, ktoré činnosti vás potom nechajú s viac energiou — nie len s pocitom produktivity.

Jednu z nich si chráňte v kalendári.

**transition**

Toto hodnotenie poukazuje na miesto, kde môže byť váš energetický systém pod tlakom.

Diagnostika životného autopilota skúma, prečo obnova zaostala a ktoré zmeny by mali najväčší dopad.

---

### 9.4 `connection_gap` — Medzera v spojení

**summary**

Vaše vzťahy sa zdajú dobre fungovať na praktickej úrovni — no emocionálne spojenie nemusí dostávať rovnakú pozornosť.

Vzťah je aktívny.

Spojenie môže slabnúť.

**whatItMeans**

Pravdepodobne trávite čas s ľuďmi, na ktorých vám záleží.

Spoločne organizujete život, riešite problémy a plníte povinnosti.

Zmysluplné rozhovory, zvedavosť a emocionálna prítomnosť však môžu byť menej časté než kedysi.

**blindSpot**

Vzťahy zriedka slabnú preto, že ľudia prestali stáť o seba.

Častejšie bežný život postupne nahradí chvíle skutočného spojenia — bez toho, aby si to niekto všimol.

**longTermRisk**

Časom môžu vzťahy pôsobiť efektívne, ale emocionálne vzdialené.

Zmena býva postupná, a preto ju ľahko prehliadnete, kým vzdialenosť nezačne pôsobiť výrazne.

**firstStep**

Tento týždeň položte jednej blízkej osobe neočakávanú otázku.

Nie o práci ani o povinnostiach.

Opýtajte sa na niečo, čo vám pomôže pochopiť, ako sa naozaj má.

Potom počúvajte — bez snahy niečo hneď vyriešiť.

**transition**

Toto hodnotenie ukazuje, kde môže spojenie ustupovať rutine.

Diagnostika životného autopilota skúma, ako tieto vzorce vznikli a ako dá obnoviť zmysluplné spojenie zámerne.

---

## 10. Closing message (`closingMessage`)

> Žiadny život sa nedá úplne pochopiť krátkym hodnotením.
>
> Tento výsledok nie je diagnózou toho, kým ste.
>
> Je to momentka toho, ako sa váš životný systém aktuálne zdá fungovať.
>
> Často je jasné uvidenie vzorca prvým krokom k tomu, aby ste ho mohli zmeniť.
>
> Ak chcete pochopiť, prečo tieto vzorce vznikli — a ktoré zmeny by mali najväčší dopad — Diagnostika životného autopilota pokračuje tam, kde toto hodnotenie končí.

---

## 11. Special result states (`014`)

### Dual primary reinforcement (`dualPrimary`)

Generic (ship first; pair-specific blurbs later):

**intro**

> Tieto dva vzorce sa často navzájom posilňujú.

**body**

> Keď jedna oblasť životného systému zostáva pod dlhodobým tlakom, druhá ju zvyčajne začne kompenzovať — a obe sa časom uzamknú do spoločného cyklu.

Example pair (Identity + Energy) — optional override:

> Keď je sebahodnota úzko viazaná na výkon, obnova sa často odsúva nabok. Nižšia energia potom môže zvyšovať pocit, že výkon je ešte potrebný — a cyklus sa zatvára.

### Balanced scores (`balancedScores`)

> Vaše odpovede naznačujú, že žiadna oblasť nevyčnieva jednoznačne. Viaceré časti životného systému sa zdajú navzájom ovplyvňovať.
>
> Platená diagnostika skúma práve tieto interakcie — nie izolované kategórie.

### Relatively low / balanced-low (`lowScores`)

> Vaše odpovede naznačujú, že váš životný systém momentálne pôsobí relatívne vyvážene.
>
> Aj dobre fungujúce systémy majú úžitok z pravidelnej reflexie, keď sa okolnosti menia.
>
> Toto hodnotenie hľadá vzorce — nie dokonalosť.

---

## 12. Soft paid CTA (`paidCta`) — Phase 4 option A stub

**title**

> Chcete pochopiť, prečo tieto vzorce vznikli?

**body**

> Diagnostika životného autopilota je 90-minútové individuálne stretnutie online. Spoločne prejdeme, ako vzorce vznikli a kde majú zmeny najväčší efekt.

**primaryCta**

> Požiadať o informácie

**secondaryCta**

> Pridať sa na waitlist

**contactHint**

> Ozveme sa s termínmi a detailmi. Bez záväzku.

*(Stripe / booking out of scope for v1.)*

---

## 13. Config checklist (for Phase 1)

When creating `src/config/assessmentAutopilot.js`, include:

- [ ] `dimensions` — §3
- [ ] `bottlenecks` — §3
- [ ] `questions` — from `011` (Slovak text + `reverseScored`)
- [ ] `likertLabels` — §2
- [ ] `microInsights` — §6
- [ ] `bottleneckResults` — §9
- [ ] `closingMessage` — §10
- [ ] `dualPrimary` / `balancedScores` / `lowScores` — §11
- [ ] `landing` — §4
- [ ] `emailGate` — §8
- [ ] `analyzing` — §7
- [ ] `ui` chrome — §5
- [ ] `paidCta` — §12 (can stay stub until Phase 4)

---

## 14. Tone check (`015`)

Before shipping copy changes, verify:

- diagnostic experience, not survey language
- patterns, not personality labels
- recognition over certainty
- free assessment = *what appears to be happening*; paid = *why*
- no fear-based or transformation-promise CTAs in results

---

*Phase 0 deliverable. Next: Phase 1 shell (`009` architecture + `016` overrides) using this pack.*
