# Jo Færre Mates jo Bedre

En dansk fan-udgave af tv-quizzen *Jo Færre Jo Bedre* (Pointless) til vennegruppen.
Hele spillet kører på én enhed. Den gives videre mellem holdene, og **færrest point vinder** — eller 6 pointless-svar.

**Version:** 3.0.0, med 44 spørgsmål, 30 anagrammer og 12 sammenhængsopgaver. Se [CHANGELOG.md](CHANGELOG.md).

## Sådan spiller I

1. Åbn `index.html` ved at dobbeltklikke på filen. Der er ingen installation og intet build-trin.
2. Opret 2–5 hold med 1–2 spillere hvert i holddesigneren. Hvert hold vælger sin egen farve.
3. Tryk **Start spillet!**
4. Kategorien følger en fast rundeplan: runde 1–5 *Jo Færre Jo Bedre*, 6–7 *Anagrammer*, 8–12 *Jo Færre Jo Bedre*, 13–14 *Sammenhæng* og derefter *Jo Færre Jo Bedre*.
5. Har alle hold én spiller, svarer hvert hold én gang pr. runde, og rækkefølgen rykker én plads hver runde. Har et hold to spillere, giver hvert hold 2 svar på skift (A, B, A, B) og må gerne konferere. Giv enheden videre efter hvert svar.
   - *Jo Færre Jo Bedre:* point = antal af 100 adspurgte. Forkert eller **"pas"** giver 100 point.
   - *Anagrammer:* 10 sekunder. Korrekt = 0, ikke korrekt eller for sent = 25.
   - *Sammenhæng:* 10 sekunder til at vælge de 4 af 12 ord, der hører sammen. Korrekt = 0, ikke korrekt eller for sent = 25.
6. Pointene lægges sammen, og pointtavlen nederst opdateres efter hvert svar.
7. Når en runde er færdig, og et hold har **1.000 point** eller mere, slutter spillet. Holdet med flest point taber, og holdet med færrest vinder. Et hold med **6 pointless-svar** (0 point i *Jo Færre Jo Bedre*) vinder straks.

**Nyt spil** beholder holdene og husker, hvilke spørgsmål I har haft. Kommer et spørgsmål igen, vises jeres tidligere svar. Er spørgsmålet kendt, kan I trykke **Spørgsmål gentaget** før første svar. **Nulstil alle spil** sletter hold, point og historik.

Spillet gemmes automatisk. Lukker I fanen, kan I trykke **Fortsæt spil** næste gang.

## Projektstruktur

```
index.html            Appen (én side)
css/style.css         Design
js/matcher.js         Normalisering + fuzzy matching af svar (ren logik)
js/game-engine.js     Spilregler som ren reducer (ren logik)
js/store.js           LocalStore: gemning, backup-slot, eksport/import
js/countdown.js       Countdown-søjlen
js/timer.js           Timer til anagrammer og sammenhæng
js/screens.js         Render-funktioner pr. skærm
js/app.js             Opstart og events
data/questions.js     Spørgsmålsbanken (Jo Færre Jo Bedre)
data/anagrams.js      Anagrammer
data/connections.js   Sammenhængsopgaver
tests.html            Tests i browseren
countdown-test.html   Countdown-søjlen isoleret (85 / 39 / 0 / forkert)
tests/                Testramme og specs (matcher, engine, store, kategorier)
scripts/              Testkørsel i Node, backup-script, git-hooks
docs/reference/       Referencebilleder af layout
```

## Tests

- **Browser:** Åbn `tests.html`.
- **Terminal:** `node scripts/run-tests.js`. Den afslutter med exit code 1, hvis en test fejler.

## Backup og versionering

Projektet er beskyttet i fire lag:

| Lag | Hvad | Hvordan |
|---|---|---|
| 1. Git | Hele kodehistorikken med en commit pr. ændring og et tag pr. release (`v1.0.0`) | `git log`, `git tag` |
| 2. Zip-snapshots | Tidsstemplede zip-filer med alle filer og hele git-historikken (`repo.bundle`). De ligger i `backups/` og synkroniseres med OneDrive | `powershell -ExecutionPolicy Bypass -File scripts\backup.ps1` |
| 3. Spillets autogem | Hvert træk gemmes i `localStorage`, og den forrige version ligger i et backup-slot. Er det gemte spil beskadiget, gendannes det automatisk | Sker af sig selv |
| 4. Backup-fil | Gem eller indlæs et spil som `.json`, fx for at flytte det til en anden enhed | Startskærm → **Backup** |

### Arbejdsgang ved ændringer

1. Lav ændringen.
2. Kør `node scripts/run-tests.js`. Pre-commit-hooken gør det også automatisk.
3. Commit med en beskrivende besked.
4. Ved en ny version: opdatér `CHANGELOG.md`, `JFM.APP_VERSION` i `js/app.js` og **alle `?v=` i `index.html`** til det nye nummer. `?v=` tvinger browsere til at hente de nye filer i stedet for gamle fra cachen, og testene fejler, hvis tallene ikke passer sammen. Lav derefter et tag med `git tag -a vX.Y.Z -m "..."`, og kør backup-scriptet.

Versionsnumre følger [SemVer](https://semver.org/lang/da/): MAJOR.MINOR.PATCH.

Pre-commit-hooken aktiveres én gang pr. klon:

```
git config core.hooksPath scripts/hooks
```

### Gendannelse

- **En fil ved en fejl:** `git restore <fil>` eller `git checkout v1.0.0 -- <fil>`.
- **Hele projektet fra zip:** pak zip-filen ud, og kør `git clone repo.bundle jo-faerre`.
- **Et spil:** Startskærm → Backup → **Indlæs backup-fil**.

## Tilføj spørgsmål

Kildelisten er `Spørgsmål.docx`. Den blev importeret i v1.1.0 og v1.3.0, og spørgsmålene ligger nu i `data/questions.js`. Nye spørgsmål tilføjes direkte i `window.JFM_QUESTIONS.questions`:

```js
{
  id: "unikt-id",
  title: "TITEL I VERSALER",
  instruction: "Vi leder efter …",
  answers: [
    { name: "Svar", score: 42, aliases: ["Alternativt navn"] }
  ]
}
```

Kør testene bagefter. De tjekker, at id'erne er unikke, at scorerne er gyldige, og at hvert svar og alias matcher sig selv. Får et alias fejl, rammer det typisk to svar på én gang.

## Hosting

**Spil online:** https://emiljustncc.github.io/jo-faerre-mates/

Spillet hostes på GitHub Pages fra `main`-branchen. Siden opdateres automatisk et minut eller to efter hver `git push`. Filen `.nojekyll` får GitHub til at servere filerne, som de er.

Spillet virker også direkte fra filsystemet (`file://`).

Repoet er offentligt. `Spørgsmål.docx` ligger derfor kun lokalt og er sat i `.gitignore`.
