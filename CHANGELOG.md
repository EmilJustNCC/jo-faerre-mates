# Changelog

Alle væsentlige ændringer i projektet noteres her.
Formatet følger [Keep a Changelog](https://keepachangelog.com/da/1.1.0/), og versionsnumrene følger [SemVer](https://semver.org/lang/da/).

## [Ikke udgivet]

## [2.0.1] - 2026-10-27

### Rettet
- Browsere kunne køre gamle, cachede filer efter en opdatering. GitHub Pages cacher filer i 10 minutter, så fx "Martini" stadig blev godkendt som Martinez, selvom rettelsen var online. Alle css- og js-filer hentes nu med versionsnummer (`?v=2.0.1`), så en ny version altid giver nye filer.
- Ny test fejler, hvis `?v=` i `index.html` ikke matcher `APP_VERSION` i `js/app.js`.

## [2.0.0] - 2026-10-27

### Ændret — nyt spilforløb
- **Samlet pointtavle til 1.000:** Point lægges sammen fra spørgsmål til spørgsmål. Når et spørgsmål er færdigt, og et hold har mindst 1.000 point, slutter spillet. Holdet med flest point taber, og holdet med færrest vinder. Ved lige point deles pladsen.
- **2 svar pr. hold pr. spørgsmål, på skift:** A, B, A, B (A, B, C, A, B, C med 3 hold), og enheden går videre efter hvert svar. Det erstatter turen med 3 felter. Startholdet roterer fra spørgsmål til spørgsmål.
- Podierne nederst viser samlet point, "+X dette spørgsmål" og en bjælke mod 1.000. De opdateres efter hvert afsløret svar.
- Opsummeringen viser point for spørgsmålet, samlet point og stillingen. Slutskærmen viser vinder, taber og slutstilling.
- **Strammere stavefejl-tolerance:** Svar på op til 10 tegn må højst have 1 fejl, svar på 11–15 tegn højst 2 og længere svar højst 3. "Martini" blev tidligere godkendt som Martinez, og "Martini" er nu alias for Dry Martini.
- Gemte spil har fået nyt format (version 3). Gemte spil fra v1.x kan ikke fortsættes, men holdene bevares.

### Fjernet
- Eliminationsrunder, omspil og Head-to-Head. Med 2 hold sluttede spillet før efter 2 spørgsmål.

## [1.3.0] - 2026-10-27

### Tilføjet
- 20 nye spørgsmål fra den opdaterede `Spørgsmål.docx`, så der nu er 44 i alt: Kvinder med mindst fem Grammyer, Casper Christensen, Disney- og Pixar-film i ét ord, danskere i La Liga, byer med tre Michelin-stjerner, danskernes favoritkomponister, flyselskaber, sprog i Duolingo, verdens rigeste, hovedstæder med M, partier på stemmesedlen, Batman og skurkene, asiatiske biler og motorcykler, Bundesligaklubber, drinks, danske øer, vindere af Tour de France, Ringenes Herre, 90'er-bandmedlemmer og Nikolaj Lie Kaas.
- Aliasser til de nye spørgsmål, fx engelske Disney-titler, partiforkortelser (SF, DF, LA), engelske bynavne og komponistnavne.
- Tests for de nye aliasser og tvetydigheder, fx "München" i Bundesliga og "SD" ≠ SF.

- "Kvinder med mindst fem Grammyer" bruger kun nulsvar. Word-filen indeholder kun de 55 nulsvar, så de giver 0 point, og alle andre svar giver 100. Det står i instruktionen, og rundeopsummeringen skriver "Kun nulsvar tæller" i stedet for "Mest givne svar".

### Ændret
- Svar og aliasser under 4 tegn skal nu matches præcist. Ellers ville forkortelser som "SD" og "SF" matche hinanden.
- Stavefejl-tolerancen er strammet: Svar på op til 7 tegn må højst have 1 fejl. Før var grænsen 2 fejl fra 6 tegn, og så blev fx "Milano" godkendt som Malabo i "Hovedstæder med M".

### Rettet
- Tastefejl fra Word-filen: "Carf Orff" er rettet til Carl Orff, og "Ait Baltic" er rettet til Air Baltic.

## [1.2.0] - 2026-10-27

### Ændret
- **Nye regler i eliminationsrunderne:** Hvert hold får én tur med 3 svarfelter, og holdet må konferere. Point er summen af de 3 svar. Det erstatter 1. og 2. pas og spillervalget.
- Svarene afsløres ét ad gangen med countdown-søjlen ("Næste svar"), og til sidst vises turens samlede point.
- Omspil og Head-to-Head har stadig ét svar pr. hold.
- Gemte spil har fået nyt format (version 2). Et spil gemt med v1.1 kan ikke fortsættes, men holdene bevares automatisk.

### Tilføjet
- **"pas"** giver 100 point. Det virker i alle faser og må bruges flere gange i samme tur.
- Er ét felt tomt, tvetydigt eller en dublet, afvises hele turen med besked om feltet ("Svar 2: …"). De indtastede svar bevares, og fokus flyttes til fejlfeltet.
- Et hold kan ikke give samme svar to gange i samme tur.
- Enter i et svarfelt hopper til næste felt, og Enter i sidste felt gemmer.

### Fjernet
- Valg af spiller til 1. pas (`CHOOSE_PASS_PLAYER`).

## [1.1.0] - 2026-10-27

### Tilføjet
- 22 nye spørgsmål importeret fra `Spørgsmål.docx`, så der nu er 24 i alt. De har "Vi leder efter …"-instruktioner og aliasser, fx engelske filmtitler, forkortelser som KU og SMK og engelske besværgelser.
- Ord-match i begge retninger: "Riis" → Bjarne Riis, "Leeds United" → Leeds og "President Barack Obama" → Barack Obama.
- Bøjningsformer: "Lund" → Lunds Universitet og "Stockholm" → Stockholms universitet.
- Normalisering af ł, đ/ð, œ og þ.
- Test af, at hvert svar og alias i alle spørgsmål matcher sig selv, samt tests af de nye matchregler.

### Ændret
- Tal skal være ens ved fuzzy match: "Toy Story 4" godkendes ikke som Toy Story 3.
- Et svar på ét ord kan kun matches inde i et længere input, hvis de øvrige ord er fyldord som FC, United eller City. "Tom Selleck" bliver dermed ikke godkendt som "Tom".

### Rettet
- Et dobbeltklik kunne springe en skærm over, fx forbi elimineringen. Klik i de første 400 ms efter et skærmskift ignoreres nu.
- Rundeopsummeringen skrev "I fandt dem alle!" ved spørgsmål uden pointless-svar.
- Titelfejl fra Word-filen: "ONCERTER" er rettet til "KONCERTER", og "LANDE MED END" er rettet til "LANDE MED EN".

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
[2.0.1]: #
[2.0.0]: #
[1.3.0]: #
[1.2.0]: #
[1.1.0]: #
[1.0.0]: #
