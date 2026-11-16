# CLAUDE.md — Jo Færre Mates jo Bedre

## Projektresume
En dansk fan-udgave af tv-quizzen "Jo Færre Jo Bedre" (Pointless) til en vennegruppe.
Hele spillet kører på **én enhed** (computer eller telefon). Når et hold har tur, giver man
enheden videre, og holdet indtaster selv sit svar. Hold scorer point efter, hvor mange af
100 adspurgte der gav samme svar. Pointene lægges sammen; **første hold til 1000 point taber**.
**6 pointless-svar** i et spil giver automatisk sejr.

**Scope:** Startskærm → opret hold (maks 5, hver sin farve) → runde efter runde med samlet pointtavle → slutstilling.
**Tre kategorier:** *Jo Færre Jo Bedre* (åbne spørgsmål), *Anagrammer* og *Sammenhæng*. Kategorien bestemmes af en fast rundeplan (se "Rundeplan").
**Ikke med:** Multi-device/Firebase (men arkitekturen skal gøre det let at tilføje), finale, jackpot, andre kategorier end de tre, editor til spørgsmål. Eliminering og Head-to-Head blev fjernet i v2.0.0.

**Vigtigste krav:** Det skal virke stabilt fra ende til anden på én enhed.

## Arbejdsregler for Claude Code
- Byg i små faser. Test hver fase før den næste startes.
- Al **UI-tekst på dansk**. Kode, variabler og filnavne på engelsk. Kommentarer må være på dansk.
- Ingen frameworks, intet build-step og ingen eksterne afhængigheder.
- Ret kun det, der bliver bedt om. Omskriv ikke fungerende kode.
- `game-engine.js` og `matcher.js` skal være rene funktioner uden DOM og uden storage, så de kan testes isoleret og genbruges, når Firebase kommer på.
- Kør `node scripts/run-tests.js` før hver commit (pre-commit-hooken i `scripts/hooks/` gør det automatisk). Nye regler/bugfixes får en test i `tests/*.spec.js`.
- Versionering: én commit pr. afsluttet ændring, `CHANGELOG.md` opdateres, og releases tagges `vX.Y.Z` (SemVer) med `JFM.APP_VERSION` i `js/app.js` **og alle `?v=` i `index.html`** sat til samme version (cache-busting — GitHub Pages cacher i 10 min; testen i `scripts/run-tests.js` fejler ved uoverensstemmelse). Kør `scripts/backup.ps1` efter en release.

## Tech stack
- **Frontend:** Vanilla HTML/CSS/JS — én side, ingen framework.
- **Script-loading:** Almindelige `<script>`-tags (ikke ES modules) i fast rækkefølge, med ét globalt namespace `window.JFM`. Det gør, at `index.html` kan åbnes direkte ved dobbeltklik (`file://`) og også virker på GitHub Pages.
- **Data:** `data/questions.js` (`window.JFM_QUESTIONS`), `data/anagrams.js` (`window.JFM_ANAGRAMS`) og `data/connections.js` (`window.JFM_CONNECTIONS`). Ikke JSON-filer med fetch, da fetch fejler via `file://`.
- **Storage:** `localStorage` gennem et `store`-lag, så et igangværende spil og sessionens historik overlever genindlæsning.
- **Hosting:** GitHub Pages under `github.com/EmilJustNCC/jo-faerre-mates` (eller lokalt som fil).

### Arkitekturprincip: klar til Firebase senere
Spillet er opdelt i tre lag, så synkronisering kan tilføjes uden at røre spillogikken:

1. **Engine** (`game-engine.js`): `reduce(state, action, bank) → newState`. Al spillogik. Ved ingenting om UI eller storage.
2. **Store** (`store.js`): holder state og kalder engine. Fast interface:
   - `getState()`, `dispatch(action)`, `subscribe(callback)`, `reset()`
   - Implementering: `LocalStore` (hukommelse + localStorage).
   - Senere: `FirebaseStore` med samme interface. UI'et skal ikke ændres.
3. **UI** (`screens.js` + `app.js`): renderer ud fra state og sender **actions** (fx `{ type: 'SUBMIT_ANSWER', teamId, texts }`). UI må aldrig ændre state direkte.

Alle input går gennem `dispatch` som serialiserbare actions. Tilfældighed (`seed`) og tid (`now`) lægges på actionen af `app.js`, så `reduce` er deterministisk.

## Filstruktur
```
Jo færre/
├── index.html            # Hele appen (én side, skifter mellem skærme)
├── css/style.css
├── js/
│   ├── matcher.js        # Normalisering + fuzzy matching (også anagram-matching)
│   ├── game-engine.js    # Ren state machine: rundeplan, rækkefølge, point, session, slutbetingelser
│   ├── store.js          # LocalStore (localStorage). Interface til fremtidig FirebaseStore
│   ├── countdown.js      # Countdown-søjlen (animation)
│   ├── timer.js          # Svartimer (Anagrammer og Sammenhæng)
│   ├── screens.js        # Render-funktioner pr. skærm
│   └── app.js            # Opstart: binder store, UI og events sammen
├── data/
│   ├── questions.js      # Jo Færre Jo Bedre (åbne spørgsmål)
│   ├── anagrams.js       # Anagrammer (30 stk.)
│   └── connections.js    # Sammenhæng (12 opgaver)
├── docs/reference/       # Brugerens referencebilleder af countdown og layout
├── tests.html            # Åbn i browser: kører tests af matcher, engine, store og kategorier
├── countdown-test.html   # Countdown-søjlen isoleret (85, 39, 0, forkert)
├── tests/                # runner.js + *.spec.js (deles af tests.html og Node)
├── scripts/
│   ├── run-tests.js      # node scripts/run-tests.js
│   ├── backup.ps1        # Zip-snapshot + git bundle i backups/ (gitignored, OneDrive-synkroniseret)
│   └── hooks/pre-commit  # Kører tests før commit (git config core.hooksPath scripts/hooks)
├── Spørgsmål.docx        # Brugerens kildedokument (gitignored — holdes lokalt)
├── CHANGELOG.md
├── README.md
└── CLAUDE.md
```
Script-rækkefølge i `index.html`: `questions.js → anagrams.js → connections.js → matcher.js → game-engine.js → store.js → countdown.js → timer.js → screens.js → app.js`.

### Backup-lag
1. **Git** — historik + tags pr. release.
2. **Zip-snapshots** — `scripts/backup.ps1` (filer + `repo.bundle`), nyeste 15 beholdes.
3. **Autogem** — `LocalStore` skriver spillet i `jfm-game-v1` og flytter forrige version til `jfm-game-v1-backup`. Ugyldigt hovedslot → gendannes fra backup. Sessionen (historik og brugte spørgsmål) ligger i `jfm-session-v1`.
4. **Backup-fil** — `exportState()`/`importState()` via startskærmens "Backup"-menu (inkl. sessionen).

## Brugerflow
1. **Startskærm:** titlen "JO FÆRRE MATES JO BEDRE" i stor, blinkende retro-arkadeskrift. Menu: *Opret hold*, *Start spillet!* (inaktiv indtil mindst 2 hold), *Fortsæt spil* / *Nyt spil* (når et spil er i gang) og **Nulstil alle spil**.
2. **Opret hold:** holdnavn + 1 eller 2 spillernavne + **farve** → holdet tilføjes i holddesigneren, hvor hold også kan redigeres eller slettes. Højst 5 hold ("Maks 5 hold").
3. **"Start spillet!"** → kort intro-animation.
4. **Rundeintro:** "RUNDE N — KATEGORI", reglerne for kategorien, rækkefølgen og stillingen. Spørgsmålet vises ikke endnu.
5. **Overleveringsskærm:** hele skærmen i holdets farve: "Giv enheden til [HOLD]" + spiller (1-mandshold) eller "Hele holdet" (2-mandshold) og *Jeg er klar*. Spørgsmålet vises først efter klik.
6. **Svarskærm:** farvet holdbjælke øverst, derefter kategoriens svarskærm (se "Kategorier") → countdown-animation → resultat → *Næste* → enheden går videre.
7. **Efter runden:** opsummering med alle svar (chips i holdets farve), point for runden, samlet point og stilling — for Jo Færre Jo Bedre også pointless-svar og mest givne svar. Har et hold nået 1000 → **slutskærm**; ellers næste runde.
8. **Pointtavle:** podierne nederst viser hvert holds samlede point, "+X denne runde", pointless-tælleren `★ n/6` og en bjælke mod 1000. Det aktive hold gløder i sin farve; de andre nedtones.

## Spilleregler (implementeres i `game-engine.js`)

### Begreber
- **Spil:** fra *Start spillet!* til der er en vinder.
- **Runde:** ét spørgsmål/én opgave, hvor alle hold har svaret. Runder tælles fra 1 i hvert spil.
- **Session:** alle spil fra sidste *Nulstil alle spil* og frem.
- **Pointless-svar:** et svar med 0 point i *Jo Færre Jo Bedre*.

### Rundeplan (`categoryForRound(roundNumber)`)
| Runde | Kategori |
|---|---|
| 1–5 | Jo Færre Jo Bedre |
| 6–7 | Anagrammer |
| 8–12 | Jo Færre Jo Bedre |
| 13–14 | Sammenhæng |
| 15 og frem | Jo Færre Jo Bedre, indtil slutbetingelsen rammes |

Planen starter forfra ved hvert nyt spil. Mangler en pulje helt i datafilerne, spilles runden som Jo Færre Jo Bedre (med `console.warn`).

### Ture og rækkefølge
- **Alle hold har én spiller:** hvert hold svarer **én gang pr. runde**. Rækkefølgen roterer én plads til højre pr. runde: `order(r) = rotateRight(baseOrder, r - 1)`, hvor `baseOrder` er lodtrækningen ved spillets start (A,B,C,D → D,A,B,C → C,D,A,B …). Den, der startede, svarer som nr. 2 i næste runde.
- **Mindst ét hold har to spillere:** hvert hold giver **2 svar** (`ANSWERS_PER_TEAM`), ét ad gangen på skift (A, B, C, A, B, C). Startholdet roterer (forrige rækkefølge flyttet én plads til venstre). Holdet konfererer.
- Rotationen gælder alle kategorier. I Anagrammer og Sammenhæng får **hver tur sin egen opgave**.
- Motoren understøtter flere felter pr. tur (`slots`, `ANSWERS_PER_TURN`), men spillet bruger 1.

### Point (Jo Færre Jo Bedre)
- Korrekt svar = svarets score (0–100). Score 0 = **POINTLESS**.
- Forkert svar = 100 point. **"pas"** (store/små bogstaver ligegyldigt) = 100 point.
- Hvert svar må kun gives én gang pr. spørgsmål ("Det svar er allerede brugt — prøv igen").
- Tomt, tvetydigt eller dublet-svar afvises uden at tælle; holdet svarer igen.

### Slut
- Hvert afsløret svar lægges til holdets `questionScore` og `totalScore`.
- **Pointless-sejr (tjekkes først):** hvert hold har `pointlessCount` pr. spil. Den tæller op ved hvert 0-point-svar i *Jo Færre Jo Bedre* (ikke korrekte anagrammer eller sammenhænge). Når et hold når **6** (`POINTLESS_TO_WIN`), slutter spillet straks efter revealen, og holdet vinder uanset stillingen: "[Holdnavn] vinder med 6 pointless-svar!" (`state.result.reason = 'pointless'`). Rammer begge slutbetingelser i samme svar, vinder pointless-reglen.
- **1000 point:** når en runde er færdig og mindst ét hold har **≥ 1000 point** (`TARGET_SCORE`), slutter spillet — runden spilles altid færdig. Flest point taber, færrest vinder (`state.result = { reason: 'score', loserIds, winnerIds, questions }`).

### Spørgsmålsforbrug (`pickRandomUnused(pool, usedIds, rng)`)
- Hvert spørgsmål/anagram/sammenhængsopgave vælges **tilfældigt** blandt de ubrugte i sin pulje.
- "Brugt" gælder hele **sessionen** (på tværs af spil), indtil *Nulstil alle spil*. Brugte id'er ligger i `session.usedIds` pr. kategori.
- Er en pulje tom, nulstilles netop den pulje (med `console.info`), og der vælges tilfældigt igen.

### Faser (state machine)
`SETUP → INTRO → ROUND_INTRO → (HANDOFF → ANSWERING → REVEAL) × ture → ROUND_SUMMARY → (ROUND_INTRO for næste runde | GAME_OVER)`
Pointless-sejren kan gå direkte fra `REVEAL` til `GAME_OVER`.

### Actions
`ADD_TEAM`, `EDIT_TEAM`, `REMOVE_TEAM`, `START_GAME`, `CONFIRM_READY` (starter timeren i Anagrammer/Sammenhæng ud fra `action.now`), `SWAP_QUESTION` ("Spørgsmål gentaget"; `questionId` kan tvinge et bestemt spørgsmål frem til test), `SUBMIT_ANSWER` (`texts` for Jo Færre Jo Bedre/Anagrammer, `picks` for Sammenhæng, `timeout: true` ved udløbet timer), `REVEAL_DONE`, `NEXT`, `NEW_GAME`.

## Kategorier

### 1. Jo Færre Jo Bedre (åbne spørgsmål)
Som beskrevet under "Spilleregler" og "Svar-matchning". Hele runden bruger ét spørgsmål.
- Svarskærmen viser spørgsmål, instruktion, svarfelt, "pas"-hint, tidligere givne svar i runden og evt. boksen **"Svar fra tidligere spil"** (se "Session").
- **"Spørgsmål gentaget"**: kun i denne kategori og kun, indtil rundens første svar er gemt. Markerer spørgsmålet som brugt og vælger et nyt tilfældigt ubrugt. Rundenummeret ændres ikke. (Ikke i Anagrammer og Sammenhæng: dér ser holdet opgaven, mens timeren løber.)

### 2. Anagrammer
- **Hver tur får sit eget anagram** fra `data/anagrams.js`.
- Svarskærmen viser temaet som hint (fx "Topscorere i Premier League") og de blandede bogstaver i stor skrift (fx "Iusl Rsaezu").
- **Timer: 10 sekunder** fra *Jeg er klar* (`timer.js`). Vises som nedtællingsbjælke + tal. Ved 0 låses inputfeltet, og svaret registreres automatisk som tidsoverskridelse.
- **Point:** korrekt = **0**, forkert = **25**, tiden løber ud = **25**. Tomt svar (før tiden er gået) afvises.
- **Matching** (`matcher.matchAnagram`): normalisering som i `matcher.js`, derefter eksakt match mod `answer` eller `aliases`, eller Levenshtein ≤1 for svar på 8+ tegn.
- Inputfeltet får autofokus, og Enter sender svaret.
- **Reveal:** ingen nedtælling — efter en kort pause vises "KORREKT!" (tom søjle) eller "IKKE KORREKT" med rødt kryds. Det rigtige svar vises altid.
- `round.deadline` (timestamp) gemmes i state. Genindlæses siden efter deadline, tæller det som tidsoverskridelse (motoren giver 1,5 sek. respit for svar sendt lige ved 0).

### 3. Sammenhæng
- **Hver tur får sin egen opgave** fra `data/connections.js`.
- Svarskærmen viser **12 ordbrikker** (4 kolonner × 3 rækker; 3 × 4 på telefon). Rækkefølgen blandes ved rundens start og gemmes i `turn.tileOrder`, så den er stabil ved genindlæsning.
- Holdet klikker præcis 4 brikker (kan fravælges) og trykker *Indsend* (inaktiv indtil 4 er valgt). Ét forsøg.
- **Timer: 10 sekunder** fra *Jeg er klar* (`CONNECTION_SECONDS`). Ved 0 låses brikkerne, og svaret registreres som tidsoverskridelse (med de brikker, der var valgt).
- **Point — korrekt eller ikke korrekt:** alle 4 rigtige = **0 point**. Mindst ét forkert ord eller for sent = **25 point** (`CONNECTION_WRONG_SCORE`).
- **Reveal:** ingen nedtælling — efter en kort pause vises "KORREKT!" (tom søjle) eller rødt kryds. Gruppens navn vises, og de 4 rigtige ord fremhæves (✓ = valgt), forkert valgte ord vises overstreget (✗).

## Session (historik på tværs af spil)
Gemmes i en **separat** localStorage-nøgle `jfm-session-v1` (i state som `state.session`, men store-laget gemmer den adskilt fra spillet):
```json
{
  "version": 1,
  "gamesPlayed": 3,
  "usedIds": { "pointless": [], "anagram": [], "connections": [] },
  "answersByItem": {
    "aus-nz-cities": [
      { "game": 2, "teamName": "Holdnavn", "teamColor": "blue", "input": "Perth", "matched": "Perth", "score": 39, "status": "correct" }
    ]
  }
}
```
- `gamesPlayed` tælles op ved *Start spillet!*; spillets nummer står i `state.gameNumber`.
- Hvert afsløret svar (alle kategorier) gemmes under spørgsmålets/opgavens id.
- Dukker et Jo Færre Jo Bedre-spørgsmål op, som er spillet i et tidligere spil i sessionen, viser svarskærmen boksen **"Svar fra tidligere spil"** med chips i holdets farve: `Perth · 39`, forkerte som `Melborne ✗`. Højst 3 linjer, ellers intern scroll. Svar fra det igangværende spil vises ikke i boksen.
- **Nyt spil** beholder hold og session; nulstiller point, pointless-tællere og rundeplan.
- **Nulstil alle spil** (startskærmen) kræver bekræftelse ("Er du sikker? Alle hold, point og tidligere svar slettes." → *Ja, nulstil* / *Annullér*) og sletter spillet, holdene og `jfm-session-v1`. Sker kun ved klik — aldrig automatisk ved opstart.

## Svar-matchning (`matcher.js`)
1. **Normalisering:** små bogstaver, trim, fjern accenter (ş→s, ö→o, é→e), æ→ae, ø→oe, å→aa, fjern tegnsætning og bindestreger, saml mellemrum.
2. **Eksakt match** mod navn eller et af svarets `aliases`.
3. **Fuzzy match** med Levenshtein-afstand: ≤1 for svar på op til 10 tegn, ≤2 for 11–15 tegn, ≤3 for længere (bevidst stramt, så fx "Milano" ≠ "Malabo" og "Martini" ≠ "Martinez"). Tal skal være ens ("Toy Story 4" ≠ "Toy Story 3"). Svar/aliasser under 4 tegn (forkortelser som SF, DF) skal matches præcist.
   - Derefter **ord-match**: input som hele ord i svaret ("Riis" → Bjarne Riis), svaret som hele ord i input når de øvrige ord er fyldord som FC/United/City ("Leeds United" → Leeds), og bøjningsformer ("Lund" → Lunds Universitet).
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

### `data/anagrams.js` og `data/connections.js`
```js
window.JFM_ANAGRAMS = [
  { id: "ana-01", theme: "Topscorere i Premier League", answer: "Luis Suarez", aliases: ["Suarez"], scrambled: "Iusl Rsaezu" }
];
window.JFM_CONNECTIONS = [
  { id: "con-02", groupName: "Dele af et kamera", correct: ["Linse","Blitz","Søger","Lukker"], decoys: ["Brille","Lampe", "...8 i alt"] }
];
```
- `scrambled` er forudgenereret og har samme bogstaver pr. ord som `answer` (testes i `tests/categories.spec.js`). Bland ikke igen ved runtime.
- Sammenhæng: præcis 4 + 8 forskellige ord (testes).
- Id'er skal være unikke på tværs af alle tre filer, fordi historikken bruger id som nøgle (testes).

### Datakilde
Brugeren vedligeholder spørgsmålene i `Spørgsmål.docx` (gitignored). Jo Færre Jo Bedre-spørgsmålene er indtil videre importeret manuelt til `data/questions.js`; anagrammer og sammenhænge er leveret direkte som `data/anagrams.js` og `data/connections.js`.
**Ikke bygget endnu:** et importscript `tools/import-docx.js`, der genererer alle tre datafiler ud fra dokumentet. Når det bygges, er det aftalte format: tre sektioner efter hinanden, hvor en sektion starter med en fed linje `KATEGORI: ...` (alt før er *Jo Færre Jo Bedre*). Jo Færre Jo Bedre: fed titel, valgfri intro, svarlinjer `Navn - tal` (tag det sidste tal), støj som "Se mindre" ignoreres, spørgsmål med kun nulsvar uden tal rapporteres. Anagrammer: `Tema | Anagram | Svar` evt. `(også: alias1, alias2)`, valider bogstaverne. Sammenhæng: fed linje = gruppenavn, derefter `Rigtige: a, b, c, d` og `Afledere: e, f, … (8 stk.)`. Aliasser til Jo Færre Jo Bedre skal ligge i en separat `data/aliases.js`, der flettes ind, så de ikke overskrives.

### Game state (localStorage `jfm-game-v1`, sessionen i `jfm-session-v1`)
```json
{
  "version": 4,
  "phase": "REVEAL",
  "teams": [
    { "id": "t1", "name": "Holdnavn", "players": ["Emil"], "color": "blue", "totalScore": 439, "questionScore": 39, "pointlessCount": 2 }
  ],
  "gameNumber": 3,
  "baseOrder": ["t1", "t2"],
  "round": {
    "number": 6,
    "category": "anagram",
    "questionId": null,
    "answersPerTeam": 1,
    "order": ["t2", "t1"],
    "turns": [{ "teamId": "t2", "playerIdx": null, "slots": 1, "itemId": "ana-04" }, { "teamId": "t1", "playerIdx": null, "slots": 1, "itemId": "ana-17" }],
    "turnIdx": 0,
    "given": [
      { "teamId": "t2", "player": null, "itemId": "ana-04", "input": "Haaland", "matched": "Erling Haaland", "solution": "Erling Haaland", "score": 0, "status": "correct" }
    ],
    "pending": { "teamId": "t2", "player": null, "entries": ["…turens svar…"] },
    "revealIdx": 0,
    "revealDone": false,
    "deadline": 1763300000000,
    "lastFeedback": null
  },
  "history": [{ "number": 1, "category": "pointless", "questionId": "…", "scores": { "t1": 130 } }],
  "result": null,
  "session": { "…": "se Session — gemmes i jfm-session-v1" }
}
```
- `status`: `correct | wrong | pass` (Jo Færre Jo Bedre), `correct | wrong | timeout` (Anagrammer og Sammenhæng; ved Sammenhæng gemmes `picks` på svaret).
- Sammenhængsture har også `tileOrder` (de 12 ord i vist rækkefølge).
- Strukturen skal være ren JSON (ingen funktioner, ingen Date-objekter), så den senere kan synkroniseres via Firebase uændret.
- `engine.migrateState` løfter ældre versioner: et v1-, v2- eller v3-spil bliver til `SETUP` med de samme hold (som får den første ledige farve). Ved ukendt `version`: ignorér gemt spil og start forfra.

## UI og design

### Holdfarver
| Navn | Hex | Tekst på farven |
|---|---|---|
| Rød | `#E63946` | hvid |
| Blå | `#3A86FF` | hvid |
| Grøn | `#2DC653` | mørk |
| Gul | `#FFBE0B` | mørk |
| Lilla | `#9B5DE5` | hvid |

- En farve kan kun bruges af ét hold (optagne farver vises nedtonet og kan ikke vælges) → **højst 5 hold**. Det 6. hold kan ikke oprettes ("Maks 5 hold").
- Farven bruges på podiet (kant + baggrundsnuance), holdkortet i holddesigneren, hele baggrunden på overleveringsskærmen, holdbjælken øverst på svarskærmen, chips i svarlister/opsummering/historik og kanten på reveal-panelet.
- Det aktive hold gløder (pulserende kant) på podierne; de andre nedtones.
- I CSS sættes `--team` og `--team-ink` inline pr. element.

### Skærme
- **Startskærm:** mørk baggrund, blinkende titel som i et retro computerspil, menupunkter med "valgt"-markering. Holddesigner-panel i siden.
- **Spilskærm (se `docs/reference/`):** venstre: høj **countdown-søjle**. Midt/højre: stort afrundet panel med spørgsmålets titel i en pille. Bund: et podie pr. hold.
- **Overleveringsskærm:** fylder hele skærmen i holdets farve, viser kun hold, spiller og *Jeg er klar*. Ingen spørgsmålstekst.
- **Reveal (efter svar)** viser **kun** countdown-søjlen, det afgivne svar og dets point (stort), holdpodierne og *Næste*. Ingen instruktion, svarlister eller historik. Skal kunne være der uden scroll ved 1280×720 og 390×844 (på telefon står søjle og resultat side om side, og podierne er kompakte).
- Responsivt: på smal skærm (telefon) stables søjle, spørgsmål og podier lodret; på svarskærmen kommer inputfeltet først. Inputfelt og knapper skal være store nok til tommelfingre.

### Countdown-søjlen (`countdown.js`)
- Starter fuld på **100** med tallet øverst i søjlen. 50 striber à 2 point; ved ulige tal er den øverste stribe halvt tændt.
- Ved reveal (kun Jo Færre Jo Bedre) tælles der **ét point ad gangen**. Ventetiden før hvert trin afhænger af den aktuelle værdi `n`: `delay(n) = SLOWNESS × (15 + 600 / (n + 2))` ms (`countdown.stepDelay`, `SLOWNESS = 2` — brugeren ønskede det langsommere for spændingens skyld). 100 → 0 tager ca. 7,5 sek., 100 → 39 ca. 2,9 sek. Akkumuleret tid med `requestAnimationFrame`, så tempoet er ens på alle enheder.
- **Score 0:** søjlen tømmes, og "POINTLESS!" blinker.
- **Forkert svar i Jo Færre Jo Bedre (100):** ingen nedtælling — søjlen står på 100 med rødt kryds efter en kort pause.
- **Anagrammer og Sammenhæng (`instant`):** ingen nedtælling. Efter en kort pause vises resultatet direkte: korrekt = tom søjle med "KORREKT!", ikke korrekt = rødt kryds (ved 25).
- API: `runCountdown(element, targetScore, { wrong, zeroLabel, instant }) → Promise`, der resolver, når animationen er færdig. Derefter dispatches `REVEAL_DONE`. Med `prefers-reduced-motion` springes animationen over (400 ms).
- Hvis siden genindlæses midt i en reveal, vises slutresultatet uden animation.

## Senere: Firebase (ikke bygget)
Tilføj `FirebaseStore` med samme interface som `LocalStore`, en rumkode og en `play.html` til telefoner, der sender de samme actions. Engine og matcher genbruges uændret. Byg intet til dette nu, men undgå valg der spærrer for det.

## Kerne-antagelser (kan rettes af brugeren)
- Én enhed, der gives videre mellem holdene. Overleveringsskærmen beskytter mod at se spørgsmålet før tid.
- Ingen svartimer i Jo Færre Jo Bedre. Anagrammer og Sammenhæng har 10 sekunder.
- 2–5 hold pr. spil, 1–2 spillere pr. hold.
- Rundeplanen gentages ikke efter runde 14; derefter er det kun Jo Færre Jo Bedre.
- Kun Jo Færre Jo Bedre-svar med 0 point tæller mod de 6 pointless-svar.
- "Nulstil alle spil" sletter også holdene.
- Kun ét gemt spil ad gangen i localStorage (plus sessionen).
