# CLAUDE.md — Jo Færre Mates jo Bedre

## Projektresume
En dansk fan-udgave af tv-quizzen "Jo Færre Jo Bedre" (Pointless) til en vennegruppe.
Hele spillet kører på **én enhed** (computer eller telefon). Når et hold har tur, giver man
enheden videre, og holdet indtaster selv sit svar. Hold scorer point efter, hvor mange af
100 adspurgte der gav samme svar. Færrest point vinder.

**Scope v1:** Startskærm → opret hold → 1–2 eliminationsrunder → Head-to-Head → vinder.
**Ikke i v1:** Multi-device/Firebase (men arkitekturen skal gøre det let at tilføje), finale, jackpot, andre spørgsmålstyper end "Open-Ended", editor til spørgsmål.

**Vigtigste krav:** Det skal virke stabilt fra ende til anden på én enhed.

## Arbejdsregler for Claude Code
- Byg i små faser (se "Byggerækkefølge"). Test hver fase før den næste startes.
- Al **UI-tekst på dansk**. Kode, variabler og filnavne på engelsk. Kommentarer må være på dansk.
- Ingen frameworks, intet build-step og ingen eksterne afhængigheder.
- Ret kun det, der bliver bedt om. Omskriv ikke fungerende kode.
- `game-engine.js` og `matcher.js` skal være rene funktioner uden DOM og uden storage, så de kan testes isoleret og genbruges, når Firebase kommer på.

## Tech stack
- **Frontend:** Vanilla HTML/CSS/JS — én side, ingen framework nødvendig.
- **Script-loading:** Almindelige `<script>`-tags (ikke ES modules) i fast rækkefølge, med ét globalt namespace `window.JFM`. Det gør, at `index.html` kan åbnes direkte ved dobbeltklik (`file://`) og også virker på GitHub Pages.
- **Spørgsmål:** `data/questions.js`, der sætter `window.JFM_QUESTIONS = {...}`. Ikke JSON-fil med fetch, da fetch fejler via `file://`.
- **Storage:** `localStorage` gennem et `store`-lag, så et igangværende spil overlever genindlæsning.
- **Hosting:** Valgfrit. Kan køres lokalt som fil eller lægges på GitHub Pages under `github.com/EmilJustNCC`.

### Arkitekturprincip: klar til Firebase senere
Spillet er opdelt i tre lag, så synkronisering kan tilføjes uden at røre spillogikken:

1. **Engine** (`game-engine.js`): `reduce(state, action) → newState`. Al spillogik. Ved ingenting om UI eller storage.
2. **Store** (`store.js`): holder state og kalder engine. Fast interface:
   - `getState()`, `dispatch(action)`, `subscribe(callback)`, `reset()`
   - v1-implementering: `LocalStore` (hukommelse + localStorage).
   - Senere: `FirebaseStore` med samme interface. UI'et skal ikke ændres.
3. **UI** (`ui.js` + skærmfiler): renderer ud fra state og sender **actions** (fx `{ type: 'SUBMIT_ANSWER', teamId, text }`). UI må aldrig ændre state direkte.

Alle input går gennem `dispatch` som serialiserbare actions. Senere kan en telefon blot sende de samme actions via Firebase.

## Filstruktur
```
jo-faerre-mates/
├── index.html            # Hele appen (én side, skifter mellem skærme)
├── css/
│   └── style.css
├── js/
│   ├── matcher.js        # Normalisering + fuzzy matching
│   ├── game-engine.js    # Ren state machine: faser, rækkefølge, point, eliminering
│   ├── store.js          # LocalStore (localStorage). Interface til fremtidig FirebaseStore
│   ├── countdown.js      # Countdown-søjlen (animation)
│   ├── screens.js        # Render-funktioner pr. skærm
│   └── app.js            # Opstart: binder store, UI og events sammen
├── data/
│   └── questions.js
├── docs/reference/       # Brugerens referencebilleder af countdown og layout
├── tests.html            # Åbn i browser: kører konsoltests af matcher og engine
├── README.md
└── CLAUDE.md
```
Script-rækkefølge i `index.html`: `questions.js → matcher.js → game-engine.js → store.js → countdown.js → screens.js → app.js`.

## Brugerflow
1. **Startskærm:** titlen "JO FÆRRE MATES JO BEDRE" i stor, blinkende retro-arkadeskrift. Menu: *Opret hold*, *Start spillet!* (inaktiv indtil mindst 2 hold) og *Fortsæt spil* (kun hvis et gemt spil findes).
2. **Opret hold:** holdnavn + 1 eller 2 spillernavne → holdet tilføjes i et "holddesigner"-sidepanel, hvor hold også kan redigeres eller slettes.
3. **"Start spillet!"** → kort intro-animation.
4. **Rundeintro:** hvert hold vælger, hvem der tager 1. pas (vælges på én samlet skærm, før spørgsmålet vises).
5. **Overleveringsskærm:** "Giv enheden til [HOLD] — [Spiller]" med knappen *Jeg er klar*. Spørgsmålet og svarfeltet vises først efter klik, så holdene ikke kan konferere.
6. **Svarskærm:** spørgsmål, instruktion, tidligere givne svar i runden, inputfelt og *Gem svar* → **countdown-animation** → resultat og opdateret score → *Næste*.
7. Efter runden: opsummering med pointless-svar og de mest givne svar → holdet med flest point elimineres. Gentag til 2 hold er tilbage → **Head-to-Head** → vinderskærm med *Nyt spil*.

## Spilleregler (implementeres i `game-engine.js`)

### Point
- Korrekt svar = svarets score (0–100). Score 0 = **POINTLESS**.
- Forkert svar = 100 point.
- Hvert svar må kun gives én gang pr. spørgsmål. Et svar, der allerede er givet, afvises med "Det svar er allerede brugt — prøv igen", og spilleren må svare igen.

### Eliminationsrunder
- Hver runde har ét spørgsmål og **to pas**. Hver spiller på et 2-mandshold tager ét pas. Et 1-mandshold tager begge pas.
- Rækkefølge 1. pas: Runde 1 = tilfældig lodtrækning. Runde 2 = stigende efter point i runde 1.
- 2. pas: omvendt rækkefølge af 1. pas.
- Runderne scores hver for sig (nulstilles mellem runder).
- Holdet med flest point i runden elimineres.
- **Uafgjort om højeste score:** de berørte hold må konferere og giver ét ekstra svar på samme spørgsmål i samme rækkefølge som 1. pas. Står det stadig lige, spilles et nyt spørgsmål kun mellem de berørte hold.
- Antal runder er dynamisk: elimineringsrunder fortsætter, til der er 2 hold tilbage. Starter man med 2 hold, går man direkte til Head-to-Head.

### Head-to-Head
- Hvert hold konfererer og giver ét svar pr. spørgsmål (overleveringsskærm pr. hold).
- Holdene skiftes til at svare først.
- Laveste score vinder spørgsmålet. Ved lighed giver begge hold et nyt svar på samme spørgsmål.
- Første hold til **2 vundne spørgsmål** vinder spillet.

### Spørgsmålsforbrug
- Et spørgsmål bruges kun én gang pr. spil. Hvis banken løber tør (nu kun 2 testspørgsmål), genbrug spørgsmål med en tydelig `console.warn`, så spillet kan testes fra ende til anden.

### Faser (state machine)
`SETUP → INTRO → ROUND_INTRO (vælg spillere) → HANDOFF → ANSWERING → REVEAL → (HANDOFF for næste | ROUND_SUMMARY) → (TIEBREAK) → ELIMINATION → … → H2H_INTRO → HANDOFF → ANSWERING → REVEAL → H2H_RESULT → … → WINNER`

### Actions (eksempler)
`ADD_TEAM`, `EDIT_TEAM`, `REMOVE_TEAM`, `START_GAME`, `CHOOSE_PASS_PLAYER`, `CONFIRM_READY`, `SUBMIT_ANSWER`, `REVEAL_DONE`, `NEXT`, `NEW_GAME`.
Engine kalder `matcher.js` ved `SUBMIT_ANSWER`. Tilfældighed (lodtrækning) modtages som en del af actionen (`seed` eller færdig rækkefølge), så `reduce` forbliver deterministisk.

## Svar-matchning (`matcher.js`)
1. **Normalisering:** små bogstaver, trim, fjern accenter (ş→s, ö→o, é→e), æ→ae, ø→oe, å→aa, fjern tegnsætning og bindestreger, saml mellemrum.
2. **Eksakt match** mod navn eller et af svarets `aliases`.
3. **Fuzzy match** med Levenshtein-afstand: ≤1 for ord på op til 5 tegn, ≤2 for 6–10 tegn, ≤3 for længere.
4. **Tvetydighed:** hvis flere svar matcher lige godt (fx "Manchester"), afvises inputtet med "Vær mere præcis" — det tæller ikke som forkert.
5. Intet match → forkert svar (100 point).
6. Returnér altid `{ status: 'correct' | 'wrong' | 'ambiguous' | 'duplicate', answer, score }`.

## Datamodel

### `data/questions.js`
```js
window.JFM_QUESTIONS = {
  questions: [
    {
      id: "aus-nz-cities",
      title: "BYER I AUSTRALIEN OG NEW ZEALAND",
      instruction: "Vi leder efter byer i Australien og New Zealand.",
      answers: [
        { name: "Sydney", score: 85, aliases: [] },
        { name: "Canberra-Queanbeyan", score: 32, aliases: ["Canberra", "Queanbeyan"] }
      ]
    }
  ]
};
```

### Game state (gemmes i localStorage under nøglen `jfm-game-v1`)
```json
{
  "version": 1,
  "phase": "ANSWERING",
  "teams": [
    {
      "id": "t1",
      "name": "Holdnavn",
      "players": ["Emil", "Jonas"],
      "roundScore": 0,
      "eliminated": false,
      "h2hWins": 0,
      "passPlayerIdx": [0, 1]
    }
  ],
  "usedQuestionIds": ["aus-nz-cities"],
  "round": {
    "type": "elimination",
    "number": 1,
    "questionId": "aus-nz-cities",
    "pass": 1,
    "order": ["t3", "t1", "t2"],
    "turnIdx": 1,
    "given": [
      { "teamId": "t3", "player": "Ida", "input": "Perth", "matched": "Perth", "score": 39 }
    ],
    "lastFeedback": null
  },
  "history": []
}
```
- Strukturen skal være ren JSON (ingen funktioner, ingen Date-objekter), så den senere kan synkroniseres via Firebase uændret.
- Ved ukendt `version` i localStorage: ignorér gemt spil og start forfra.

## UI og design

### Skærme
- **Startskærm:** mørk baggrund, blinkende titel som i et retro computerspil, menupunkter med "valgt"-markering. Holddesigner-panel i siden.
- **Spilskærm (se `docs/reference/`):**
  - Venstre: høj **countdown-søjle**.
  - Midt/højre: stort afrundet panel med spørgsmålets titel i en pille og instruktionen under.
  - Bund: et podie pr. hold med holdnavn og score. Aktivt hold fremhæves, eliminerede hold nedtones.
- **Overleveringsskærm:** fylder hele skærmen, viser kun hold, spiller og *Jeg er klar*. Ingen spørgsmålstekst.
- Responsivt: på smal skærm (telefon) stables søjle, spørgsmål og podier lodret. Inputfelt og knapper skal være store nok til tommelfingre.

### Countdown-søjlen (`countdown.js`)
Baseret på referencebillederne (lodret kapsel/søjle med tal øverst og vandrette striber):
- Starter fuld på **100** med tallet øverst i søjlen.
- Ved reveal tæller tallet ned, og striberne forsvinder oppefra og ned, til svarets score nås. Varighed ca. 2,5–4 sek. (proportional med faldet), let decelerende til sidst.
- **Score 0:** søjlen tømmes helt og "POINTLESS!" blinker.
- **Forkert svar:** søjlen bliver stående på 100 med et rødt kryds.
- API: `runCountdown(element, targetScore, { wrong: boolean }) → Promise`, der resolver, når animationen er færdig. Derefter dispatches `REVEAL_DONE`.
- Hvis siden genindlæses midt i en reveal, vises slutresultatet uden animation.

## Byggerækkefølge (test hver fase før næste)
1. `questions.js` med begge testspørgsmål + `matcher.js` + `tests.html` med tests af stavefejl, aliasser, dubletter og tvetydighed.
2. `game-engine.js` som ren reducer — simulér et helt spil med 4 hold (inkl. uafgjort) i `tests.html`.
3. `countdown.js` isoleret på en testside med knapper for 85, 39, 0 og forkert.
4. `store.js` (LocalStore) + startskærm og opret hold.
5. Spilskærm, overleveringsskærm og eliminationsrunder ende til ende.
6. Head-to-Head, vinderskærm, *Fortsæt spil* efter genindlæsning, responsiv tilpasning til telefon.

## Senere: Firebase (ikke i v1)
Når det skal udvides: tilføj `FirebaseStore` med samme interface som `LocalStore`, en rumkode og en `play.html` til telefoner, der sender de samme actions. Engine og matcher genbruges uændret. Byg intet til dette nu, men undgå valg der spærrer for det.

## Testspørgsmål (læg i `data/questions.js`)

### 1. BYER I AUSTRALIEN OG NEW ZEALAND
Instruktion: "Vi leder efter byer i Australien og New Zealand."

Sydney 85 · Melbourne 53 · Perth 39 · Canberra-Queanbeyan 32 (aliases: Canberra, Queanbeyan) · Auckland 31 · Wellington 25 · Adelaide 24 · Brisbane 21 · Christchurch 19 · Hobart 9 · Darwin 7 · Cairns 3 · Hamilton 2 · Gold Coast-Tweed Heads 1 (aliases: Gold Coast, Tweed Heads) · Newcastle-Maitland 1 (aliases: Newcastle, Maitland) · Tauranga 1 · Albury-Wodonga 0 (aliases: Albury, Wodonga) · Ballarat 0 · Bendigo 0 · Central Coast 0 · Dunedin 0 · Geelong 0 · Lower Hutt 0 · Sunshine Coast 0 · Toowoomba 0 · Townsville 0 · Wollongong 0

### 2. AVANCEMENT I CHAMPIONS LEAGUE
Instruktion: "Vi leder efter fodboldklubber, der er gået videre fra det indledende gruppe- eller ligaspil i mændenes Champions League siden turneringen blev relanceret under det navn i 1992."

Barcelona 60 · Manchester United 55 (aliases: Man United, Man Utd) · Real Madrid 52 · Bayern München 39 (aliases: Bayern Munich, Bayern) · FCK 38 (aliases: FC København, København, FC Copenhagen) · Liverpool 35 · Arsenal 29 · Manchester City 28 (aliases: Man City) · Chelsea 24 · AC Milan 22 (aliases: Milan) · Inter 22 (aliases: Inter Milan, Internazionale) · Paris Saint-Germain 19 (aliases: PSG) · Juventus 17 · Tottenham 16 (aliases: Spurs) · Dortmund 14 (aliases: Borussia Dortmund, BVB) · Roma 11 (aliases: AS Roma) · Atlético Madrid 10 · Bayer Leverkusen 8 (aliases: Leverkusen) · Ajax Amsterdam 6 (aliases: Ajax) · Bodø/Glimt 6 (aliases: Bodø Glimt, Glimt) · Napoli 6 · Porto 6 (aliases: FC Porto) · Benfica 5 · Newcastle 4 · Sevilla 4 · Lazio 3 · Lyon 3 (aliases: Olympique Lyon) · PSV Eindhoven 3 (aliases: PSV) · Sporting Lissabon 3 (aliases: Sporting, Sporting Lisbon) · Atalanta 2 · Celtic 2 · Club Brugge 2 (aliases: Brugge) · Leeds 2 · Rosenborg 2 · Valencia 2 · Villarreal 2 · Wolfsburg 2 · Bordeaux 1 · Feyenoord 1 · Fiorentina 1 · Hertha Berlin 1 (aliases: Hertha) · IFK Göteborg 1 (aliases: Göteborg) · Leicester 1 · Marseille 1 · Monaco 1 · Panathinaikos 1 · Qarabag 1 · Schalke 04 1 (aliases: Schalke) · Werder Bremen 1 (aliases: Bremen) · Anderlecht 0 · APOEL 0 · Aston Villa 0 · Auxerre 0 · Basel 0 · Beşiktaş 0 · Boavista 0 · Borussia Mönchengladbach 0 (aliases: Gladbach, Mönchengladbach) · Brest 0 · Celta Vigo 0 · CSKA Moskva 0 (aliases: CSKA Moscow) · Deportivo La Coruña 0 (aliases: Deportivo) · Dynamo Kyiv 0 (aliases: Dynamo Kiev) · Eintracht Frankfurt 0 (aliases: Frankfurt) · Fenerbahçe 0 · Galatasaray 0 · Gent 0 · Glasgow Rangers 0 (aliases: Rangers) · Hajduk Split 0 · Kaiserslautern 0 · Legia Warszawa 0 (aliases: Legia Warsaw) · Lille 0 · Lokomotiv Moskva 0 (aliases: Lokomotiv Moscow) · Málaga 0 · Nantes 0 · Olympiakos 0 · RB Leipzig 0 (aliases: Leipzig) · Real Sociedad 0 · Red Bull Salzburg 0 (aliases: Salzburg) · Shakhtar Donetsk 0 (aliases: Shakhtar) · Sparta Prag 0 (aliases: Sparta Prague) · Spartak Moskva 0 (aliases: Spartak Moscow) · Sturm Graz 0 · Stuttgart 0 · Zenit St. Petersborg 0 (aliases: Zenit)

**Bemærk ved aliasser:** "Madrid" matcher både Real og Atlético → tvetydig. "Newcastle" findes i begge spørgsmål, men det er uproblematisk, da matching sker pr. spørgsmål.

## Kerne-antagelser (kan rettes af brugeren)
- Én enhed, der gives videre mellem holdene. Overleveringsskærmen beskytter mod at se spørgsmålet før tid.
- Der er ingen svartimer i v1. Flowet styres med *Næste*-knapper.
- 2–6 hold pr. spil, 1–2 spillere pr. hold.
- Et allerede givet svar afvises, og spilleren svarer igen.
- Kun ét gemt spil ad gangen i localStorage.
