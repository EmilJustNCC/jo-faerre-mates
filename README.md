# Jo Færre Mates jo Bedre

En dansk fan-udgave af tv-quizzen *Jo Færre Jo Bedre* (Pointless) til vennegruppen.
Hele spillet kører på én enhed. Den gives videre mellem holdene, og **færrest point vinder**.

**Version:** 1.1.0, med 24 spørgsmål. Se [CHANGELOG.md](CHANGELOG.md).

## Sådan spiller I

1. Åbn `index.html` ved at dobbeltklikke på filen. Der er ingen installation og intet build-trin.
2. Opret 2–6 hold med 1–2 spillere hvert i holddesigneren.
3. Tryk **Start spillet!**
4. I hver runde vælger holdene, hvem der tager 1. pas. Giv enheden videre, når skærmen siger det.
5. Holdet med flest point i runden ryger ud. Står det lige, er der omspil.
6. De to sidste hold mødes i **Head-to-Head**. Første hold til 2 vundne spørgsmål vinder.

Spillet gemmes automatisk. Lukker I fanen, kan I trykke **Fortsæt spil** næste gang.

## Projektstruktur

```
index.html            Appen (én side)
css/style.css         Design
js/matcher.js         Normalisering + fuzzy matching af svar (ren logik)
js/game-engine.js     Spilregler som ren reducer (ren logik)
js/store.js           LocalStore: gemning, backup-slot, eksport/import
js/countdown.js       Countdown-søjlen
js/screens.js         Render-funktioner pr. skærm
js/app.js             Opstart og events
data/questions.js     Spørgsmålsbanken
tests.html            Tests i browseren
countdown-test.html   Countdown-søjlen isoleret (85 / 39 / 0 / forkert)
tests/                Testramme og specs (matcher, engine, store)
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
4. Ved en ny version: opdatér `CHANGELOG.md` og `JFM.APP_VERSION` i `js/app.js`, lav et tag med `git tag -a vX.Y.Z -m "..."`, og kør backup-scriptet.

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

Kildelisten er `Spørgsmål.docx`. Den blev importeret i v1.1.0, og spørgsmålene ligger nu i `data/questions.js`. Nye spørgsmål tilføjes direkte i `window.JFM_QUESTIONS.questions`:

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

Spillet virker direkte fra filsystemet (`file://`). Det kan også lægges på GitHub Pages under `github.com/EmilJustNCC`. Det kræver ingen ændringer.
