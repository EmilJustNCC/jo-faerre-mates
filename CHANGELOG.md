# Changelog

Alle væsentlige ændringer i projektet noteres her.
Formatet følger [Keep a Changelog](https://keepachangelog.com/da/1.1.0/), og versionsnumrene følger [SemVer](https://semver.org/lang/da/).

## [Ikke udgivet]

## [1.0.0] - 2026-10-27

### Tilføjet
- Startskærm med blinkende arkadetitel, menu og holddesigner til 2–6 hold med 1–2 spillere.
- Eliminationsrunder med to pas. Første runde har lodtrukket rækkefølge, de næste går efter stigende point. 2. pas tages i omvendt rækkefølge.
- Valg af spiller til 1. pas pr. hold. Et 1-mandshold tager begge pas.
- Overleveringsskærm, der skjuler spørgsmålet, indtil spilleren trykker *Jeg er klar*.
- Svar-matchning med normalisering (accenter og æøå), aliasser, fuzzy matching (Levenshtein), afvisning af tvetydige svar og dubletter.
- Countdown-søjle med animation, POINTLESS!-blink og rødt kryds ved forkert svar.
- Rundeopsummering med pointless-svar og de mest givne svar.
- Omspil ved uafgjort: først et ekstra svar på samme spørgsmål, derefter et nyt spørgsmål kun mellem de berørte hold.
- Head-to-Head, hvor første hold til 2 vundne spørgsmål vinder, og vinderskærm.
- Autogem i `localStorage` med rullende backup-slot og automatisk gendannelse ved beskadiget data.
- Eksport og import af spillet som backup-fil (`.json`).
- Responsivt layout til telefon.
- 33 automatiske tests (matcher, engine og store), der kører i browseren og i Node.
- Backup-script (`scripts/backup.ps1`) med zip og git bundle samt en pre-commit-hook, der kører testene.

[Ikke udgivet]: #
[1.0.0]: #
