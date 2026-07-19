# 020 — Customer Journey v2 (návrh pokračovania)

**Status:** Planning only — návrh ďalšieho smerovania po Assessment v1. **Nie** je to implementačná špecifikácia assessmentu ani zdroj copy.

**Nadväzuje na:**
- [`006-funnel-it-dev.md`](006-funnel-it-dev.md)
- [`016-assessment-v1-summary.md`](016-assessment-v1-summary.md) (canonical v1 entry)
- [`017`](017-assessment-content-sk.md)–[`019`](019-question-wording.md) (Assessment v1)

**Assessment ops:** [`README.md`](README.md) · [`016`](016-assessment-v1-summary.md)

---

# Cieľ

Assessment v1 je hotový.

Ďalším cieľom už nie je vytvárať ďalšie funkcie, ale navrhnúť kompletnú zákaznícku cestu od prvého kontaktu až po dlhodobú spoluprácu.

Dôležitá zmena filozofie:

Assessment nie je produkt.

Assessment je vstup do diagnostiky.

Diagnostika nie je konzultácia.

Diagnostika je hlavný produkt.

Až po diagnostike vzniká priestor pre ďalšiu spoluprácu.

---

# Nová architektúra

Celý biznis stojí na troch produktoch.

| Fáza | Produkt | Otázka klienta |
|-------|----------|----------------|
| 1 | Bezplatná diagnostika | Čo sa deje? |
| 2 | Diagnostika životného autopilota | Prečo sa to deje? |
| 3 | Individuálna spolupráca | Ako to zmeniť? |

Každý produkt rieši inú otázku.

Nepreskakujeme ich.

---

# Customer Journey

```
Reklama / obsah

↓

Landing page

↓

Bezplatná diagnostika

↓

Výsledok

↓

Platená Diagnostika životného autopilota

↓

Diagnostická správa

↓

Rozhodnutie

├── nič viac netreba
├── ďalšie individuálne stretnutia
└── hlbší transformačný program
```

---

# Fáza 1 — Vytvorenie záujmu

Človek nehľadá rodinné konštelácie.

Nehľadá terapiu.

Nehľadá kouča.

Hľadá odpoveď na svoj problém.

Najčastejšie:

- mám dobrý život a necítim sa dobre
- fungujem už iba zo zvyku
- strácam energiu
- nič ma neteší
- všetko zvládam, ale nežijem

Marketing preto komunikuje problém.

Nie riešenie.

---

# Fáza 2 — Landing Page

Landing nemá pôsobiť ako psychologický test.

Má pôsobiť ako odborná diagnostika.

Komunikácia:

> Diagnostika životného autopilota

Podtitul:

> Za približne 5 minút zistíš,
> ktorá oblasť tvojho života spotrebúva najviac energie.

Landing predáva odpoveď.

Nie dotazník.

---

# Fáza 3 — Assessment

Táto časť je implementovaná.

Obsahuje:

- 24 otázok
- priebežné micro insights
- vyhodnotenie
- email unlock

Assessment odpovedá iba na otázku:

> Čo sa deje?

Nie:

> Prečo sa to deje?

To je zásadný rozdiel.

---

# Fáza 4 — Výsledok

Výsledok by mal mať štyri vrstvy.

## 1. Čo vidíme

Popis aktuálneho stavu.

Príklad:

> Tvoj najväčší problém momentálne pravdepodobne nie je práca.

---

## 2. Čo to znamená

Interpretácia.

Nie čísla.

Nie skóre.

Ale vysvetlenie.

---

## 3. Čo sa pravdepodobne deje

Najdôležitejšia časť.

Klient sa má spoznať.

Nie preto, že dostal výsledok.

Ale preto, že sa v ňom našiel.

Práve tu vzniká dôvera.

---

## 4. Čo ešte nevieme

Assessment má svoje limity.

Mal by ich otvorene priznať.

Príklad:

> Diagnostika ukázala,
> kde vzniká najväčší problém.

> Nedokáže však určiť,
> prečo tento vzorec vznikol.

A práve preto existuje platená diagnostika.

---

# Fáza 5 — Platená Diagnostika

Toto je hlavný produkt.

Nie konzultácia.

Nie terapia.

Nie coaching.

Diagnostika.

Klient kupuje odpoveď.

Nie metódu.

---

# Cieľ Diagnostiky

Po 90 minútach má klient rozumieť:

- prečo sa opakovane dostáva do rovnakých situácií
- ktoré životné vzorce ho riadia
- čo ich vytvorilo
- čo ich dnes udržiava
- aký je prvý krok von

Výstupom nie je dobrý pocit.

Výstupom je pochopenie.

---

# Čo klient kupuje

Nie:

90 minút rozhovoru.

Kupuje:

- diagnostiku
- analýzu
- interpretáciu
- odporúčania
- prvý plán zmeny

To je výrazne hodnotnejšie.

---

# Štruktúra Diagnostiky (návrh)

## 1. Rekapitulácia výsledku

10 min

Čo ukázal assessment.

---

## 2. Mapa života

15 min

Práca

Vzťahy

Rodina

Detstvo

Energia

---

## 3. Hlavné životné vzorce

30 min

Hľadanie opakujúcich sa mechanizmov.

---

## 4. Hlbšie pochopenie

25 min

Čo vzorce vytvorilo.

Čo ich stále udržiava.

---

## 5. Prvé odporúčania

10 min

Jasné ďalšie kroky.

Bez zahltenia.

---

# Pred stretnutím

Klient dostane:

- výsledok assessmentu
- potvrdenie rezervácie
- krátke vysvetlenie priebehu
- prípravné otázky

Cieľ:

Nezačínať diagnostiku "od nuly".

---

# Po diagnostike

Klient dostane:

- stručné PDF zhrnutie
- hlavné vzorce
- odporúčania
- ďalšie kroky

Neodchádza iba s emóciou.

Odchádza s konkrétnym výstupom.

---

# Ďalšie rozhodnutie

Diagnostika nie je automatický predaj programu.

Existujú tri scenáre.

## Variant A

Klient nepotrebuje nič ďalšie.

Proces končí.

To je úplne v poriadku.

---

## Variant B

Stačí jedno alebo dve ďalšie individuálne stretnutia.

Ponuka vzniká prirodzene.

---

## Variant C

Ukáže sa hlbší problém.

Až vtedy vzniká ponuka dlhšej spolupráce.

Nie skôr.

---

# Dôležitý strategický princíp

Nepredávame rodinné konštelácie.

Nepredávame terapiu.

Nepredávame coaching.

Predávame pochopenie.

Metódy sú internou súčasťou procesu.

Nie marketingovým argumentom.

---

# Prečo je táto architektúra lepšia

Assessment zostáva jednoduchý.

Diagnostika sa stáva samostatným produktom.

Klient presne chápe rozdiel medzi:

- čo sa deje
- prečo sa to deje
- ako to zmeniť

To vytvára prirodzený postup bez nátlaku.

---

# Otvorené otázky

Pred implementáciou ďalšej fázy treba rozhodnúť:

- bude diagnostika obsahovať písomnú správu?
- bude obsahovať akčný plán?
- bude obsahovať nahrávku stretnutia?
- bude možné objednať diagnostiku okamžite po výsledku?
- bude booking cez Stripe + kalendár alebo najprv jednoduchý pilot?
- akým spôsobom sa bude ponúkať následná spolupráca?

---

# Navrhované ďalšie dokumenty

021 — Diagnostika životného autopilota (detail produktu)

022 — Landing page pre platenú diagnostiku

023 — Štruktúra 90-minútového stretnutia

024 — Diagnostická správa (PDF)

025 — Booking flow + Stripe + Calendar

026 — Post-diagnostický follow-up

027 — Long-term Transformation Program