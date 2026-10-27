// Tests af matcher.js mod de rigtige testspørgsmål.
(function () {
  'use strict';
  var T = window.JFM_TEST;
  var M = window.JFM.matcher;
  var qs = window.JFM_QUESTIONS.questions;
  var aus = qs.filter(function (q) { return q.id === 'aus-nz-cities'; })[0];
  var cl = qs.filter(function (q) { return q.id === 'cl-advancement'; })[0];

  function match(q, text, given) { return M.matchAnswer(text, q, given || []); }

  T.test('normalize: små bogstaver, trim, accenter, æøå, tegnsætning', function () {
    T.eq(M.normalize('  Beşiktaş  '), 'besiktas');
    T.eq(M.normalize('Fenerbahçe'), 'fenerbahce');
    T.eq(M.normalize('Atlético Madrid'), 'atletico madrid');
    T.eq(M.normalize('Bodø/Glimt'), 'bodoe glimt');
    T.eq(M.normalize('FC København'), 'fc koebenhavn');
    T.eq(M.normalize('Århus'), 'aarhus');
    T.eq(M.normalize('Canberra-Queanbeyan'), 'canberra queanbeyan');
    T.eq(M.normalize('Zenit St.  Petersborg'), 'zenit st petersborg');
  });

  T.test('levenshtein', function () {
    T.eq(M.levenshtein('sydney', 'sydny'), 1);
    T.eq(M.levenshtein('kitten', 'sitting'), 3);
    T.eq(M.levenshtein('', 'abc'), 3);
  });

  T.test('eksakt match giver svarets score', function () {
    T.eq(match(aus, 'Sydney'), { status: 'correct', answer: 'Sydney', score: 85 });
    T.eq(match(aus, 'perth'), { status: 'correct', answer: 'Perth', score: 39 });
    T.eq(match(cl, 'Barcelona'), { status: 'correct', answer: 'Barcelona', score: 60 });
  });

  T.test('aliasser matcher hovednavnet', function () {
    T.eq(match(aus, 'Canberra').answer, 'Canberra-Queanbeyan');
    T.eq(match(aus, 'gold coast').answer, 'Gold Coast-Tweed Heads');
    T.eq(match(cl, 'PSG').answer, 'Paris Saint-Germain');
    T.eq(match(cl, 'Man Utd').answer, 'Manchester United');
    T.eq(match(cl, 'FC Copenhagen').answer, 'FCK');
    T.eq(match(cl, 'Milan').answer, 'AC Milan');
    T.eq(match(cl, 'Inter Milan').answer, 'Inter');
  });

  T.test('accenter og æøå kan udelades', function () {
    T.eq(match(cl, 'Besiktas').answer, 'Beşiktaş');
    T.eq(match(cl, 'Fenerbahce').answer, 'Fenerbahçe');
    T.eq(match(cl, 'Bayern Munchen').answer, 'Bayern München');
    T.eq(match(cl, 'Bodo Glimt').answer, 'Bodø/Glimt');
    T.eq(match(cl, 'Kobenhavn').answer, 'FCK');
    T.eq(match(cl, 'Malaga').answer, 'Málaga');
  });

  T.test('stavefejl inden for tærsklen accepteres', function () {
    T.eq(match(aus, 'Sydny').answer, 'Sydney');            // 1 fejl, 6 tegn
    T.eq(match(aus, 'Melborne').answer, 'Melbourne');      // 1 fejl
    T.eq(match(aus, 'Cristchurch').answer, 'Christchurch');
    T.eq(match(aus, 'Wolongong').answer, 'Wollongong');
    T.eq(match(cl, 'Juventis').answer, 'Juventus');
    T.eq(match(cl, 'Kaiserlautern').answer, 'Kaiserslautern');
  });

  T.test('stavefejl over tærsklen er forkerte', function () {
    T.eq(match(aus, 'Prth').status, 'correct');  // 1 fejl på 5 tegn er ok
    T.eq(match(aus, 'Pxrtx').status, 'wrong');   // 2 fejl på 5 tegn er for meget
    T.eq(match(aus, 'Sxdnxx').status, 'wrong'); // 3 fejl på 6 tegn
  });

  T.test('forkert svar giver 100 point', function () {
    T.eq(match(aus, 'London'), { status: 'wrong', answer: null, score: 100 });
    T.eq(match(cl, 'Brøndby'), { status: 'wrong', answer: null, score: 100 });
  });

  T.test('tvetydige svar afvises (tæller ikke som forkert)', function () {
    T.eq(match(cl, 'Madrid').status, 'ambiguous');
    T.eq(match(cl, 'Manchester').status, 'ambiguous');
    T.eq(match(cl, 'Real').status, 'ambiguous');
    T.eq(match(cl, 'Moskva').status, 'ambiguous');
    T.eq(match(cl, 'Borussia').status, 'ambiguous');
  });

  T.test('allerede givne svar er dubletter', function () {
    T.eq(match(aus, 'Sydney', ['Sydney']).status, 'duplicate');
    T.eq(match(aus, 'canbera', ['Canberra-Queanbeyan']).status, 'duplicate');
    T.eq(match(cl, 'Man United', ['Manchester United']).status, 'duplicate');
    T.eq(match(aus, 'Perth', ['Sydney']).status, 'correct');
  });

  T.test('matching sker pr. spørgsmål (Newcastle)', function () {
    T.eq(match(aus, 'Newcastle').answer, 'Newcastle-Maitland');
    T.eq(match(aus, 'Newcastle').score, 1);
    T.eq(match(cl, 'Newcastle').answer, 'Newcastle');
    T.eq(match(cl, 'Newcastle').score, 4);
  });

  T.test('pointless-svar giver 0', function () {
    T.eq(match(aus, 'Dunedin').score, 0);
    T.eq(match(cl, 'Rangers').score, 0);
  });

  T.test('tom input er forkert', function () {
    T.eq(match(aus, '   ').status, 'wrong');
  });

  function byId(id) {
    var q = qs.filter(function (x) { return x.id === id; })[0];
    T.assert(q, 'spørgsmål findes ikke: ' + id);
    return q;
  }

  T.test('alle svar og aliasser i alle spørgsmål matcher sig selv', function () {
    var failures = [];
    qs.forEach(function (q) {
      q.answers.forEach(function (a) {
        [a.name].concat(a.aliases).forEach(function (text) {
          var r = M.matchAnswer(text, q, []);
          if (r.status !== 'correct' || r.answer !== a.name) {
            failures.push(q.id + ': "' + text + '" → ' + r.status + (r.answer ? ' (' + r.answer + ')' : ''));
          }
        });
      });
    });
    T.eq(failures, []);
  });

  T.test('ord-match: svarets ord i input og omvendt', function () {
    T.eq(match(cl, 'Leeds United').answer, 'Leeds');
    T.eq(match(cl, 'FC Barcelona').answer, 'Barcelona');
    var friends = byId('vennernes-kaerester');
    T.eq(match(friends, 'Tom Selleck').status, 'wrong', 'skuespiller ≠ svaret "Tom"');
    T.eq(match(friends, 'Paul Rudd').status, 'wrong');
    T.eq(match(friends, 'Richard Burke').answer, 'Richard');
    T.eq(match(byId('praesidenter-flere-perioder'), 'President Barack Obama').answer, 'Barack Obama');
    T.eq(match(byId('tour-de-france-90erne'), 'Riis').answer, 'Bjarne Riis');
    T.eq(match(byId('landsholdenes-klub-100'), 'Schmeichel').status, 'ambiguous');
    T.eq(match(byId('grand-slam-kvinder'), 'Williams').status, 'ambiguous');
    T.eq(match(byId('kattedyr'), 'Kat').status, 'ambiguous');
  });

  T.test('ord-match med bøjningsformer, men ikke løse stavefejl pr. ord', function () {
    var uni = byId('universiteter-skandinavien');
    T.eq(match(uni, 'Lund').answer, 'Lunds Universitet');
    T.eq(match(uni, 'Stockholm').answer, 'Stockholms universitet');
    T.eq(match(byId('danske-museer'), 'Naturhistorisk').answer, 'Statens Naturhistoriske Museum');
    var imdb = byId('imdb-top-100');
    T.eq(match(imdb, 'Tiger').status, 'wrong', 'Tiger ≠ Moderne tider');
    T.eq(match(imdb, 'Emil').status, 'wrong', 'Emil ≠ Den grønne mil');
    T.eq(match(byId('mange-maal-premier-league'), 'Kate').status, 'wrong', 'Kate ≠ Harry Kane');
    T.eq(match(byId('harry-potter-besvaergelser'), 'Lauren').status, 'wrong');
  });

  T.test('tal skal passe: Toy Story 4 er ikke Toy Story 3', function () {
    var imdb = byId('imdb-top-100');
    T.eq(match(imdb, 'Toy Story').answer, 'Toy Story');
    T.eq(match(imdb, 'Toy Story 3').answer, 'Toy Story 3');
    T.eq(match(imdb, 'Toy Story 4').status, 'wrong');
    T.eq(match(imdb, 'Godfather 2').answer, 'The Godfather 2. del');
    T.eq(match(imdb, 'The Godfather').answer, 'Godfather');
    T.eq(match(byId('breddeidraetten'), 'Motorsport').answer, 'Motorsport (2 hjul)');
  });

  T.test('specialtegn: ł, ś, ą og engelske stavemåder', function () {
    T.eq(match(byId('tour-de-france-90erne'), 'Zenon Jaskula').answer, 'Zenon Jaskuła');
    T.eq(match(byId('grand-slam-kvinder'), 'Iga Swiatek').answer, 'Iga Świątek');
    T.eq(match(byId('natos-fonetiske-alfabet'), 'Alpha').answer, 'Alfa');
    T.eq(match(byId('natos-fonetiske-alfabet'), 'X-ray').answer, 'Xray');
  });

  T.test('korte forkortelser skal matches præcist (SD ≠ SF)', function () {
    var partier = byId('partier-paa-stemmesedlen');
    T.eq(match(partier, 'SF').answer, 'Socialistisk Folkeparti');
    T.eq(match(partier, 'DF').answer, 'Dansk Folkeparti');
    T.eq(match(partier, 'SD').status, 'wrong');
    T.eq(match(partier, 'Radikale').answer, 'Det Radikale Venstre');
    T.eq(match(partier, 'Venstre').answer, 'Venstre');
    T.eq(match(byId('disney-pixar-et-ord'), 'Op').answer, 'Op');
    T.eq(match(byId('disney-pixar-et-ord'), 'Ok').status, 'wrong');
  });

  T.test('spørgsmål fra v1.3.0: aliasser og tvetydigheder', function () {
    var bl = byId('bundesligaklubber');
    T.eq(match(bl, 'Köln').answer, '1. FC Köln');
    T.eq(match(bl, 'Leipzig').answer, 'RB Leipzig');
    T.eq(match(bl, 'München').status, 'ambiguous', 'Bayern og 1860');
    T.eq(match(bl, 'Berlin').status, 'ambiguous');
    T.eq(match(byId('danskernes-favoritkomponister'), 'Tchaikovsky').answer, 'Pjotr Ilitj Tjajkovskij');
    T.eq(match(byId('danskernes-favoritkomponister'), 'Mozart').answer, 'Wolfgang Amadeus Mozart');
    T.eq(match(byId('danskernes-favoritkomponister'), 'Carl Orff').answer, 'Carl Orff');
    T.eq(match(byId('ringenes-herre-karakterer'), 'Frodo Baggins').answer, 'Frodo');
    T.eq(match(byId('drinks'), 'White Russian').answer, 'Black Russian/White Russian');
    T.eq(match(byId('flyselskaber'), 'Air Baltic').answer, 'Air Baltic');
    T.eq(match(byId('byer-tre-michelin-stjerner'), 'Rome').answer, 'Rom');
    T.eq(match(byId('casper-christensen'), 'Klovn').answer, 'Klovn');
    T.eq(match(byId('casper-christensen'), 'Klovn 2').status, 'wrong');
  });

  T.test('stavefejl-tolerance: højst 1 fejl op til 7 tegn (Milano ≠ Malabo)', function () {
    var m = byId('hovedstaeder-med-m');
    T.eq(match(m, 'Milano').status, 'wrong', 'Milano er ikke en hovedstad');
    T.eq(match(m, 'Malta').status, 'wrong');
    T.eq(match(m, 'Madril').answer, 'Madrid', '1 fejl er stadig ok');
    T.eq(match(byId('byer-tre-michelin-stjerner'), 'Milano').score, 18, 'Milano giver 18 i Michelin-spørgsmålet');
    T.eq(match(aus, 'Melborne').answer, 'Melbourne', '2 fejl ok fra 8 tegn');
  });

  T.test('Grammy-spørgsmålet: kun nulsvar tæller, alt andet er forkert', function () {
    var g = byId('kvinder-fem-grammyer');
    T.eq(g.answers.length, 55);
    T.assert(g.answers.every(function (a) { return a.score === 0; }), 'alle svar giver 0');
    T.assert(g.instruction.indexOf('Kun nulsvar tæller') !== -1, 'instruktionen siger det');
    T.eq(match(g, 'Donna Summer'), { status: 'correct', answer: 'Donna Summer', score: 0 });
    T.eq(match(g, 'H.E.R.').answer, 'H.E.R');
    T.eq(match(g, 'Beyoncé'), { status: 'wrong', answer: null, score: 100 });
    T.eq(match(g, 'Naomi').status, 'ambiguous');
  });

  T.test('nye spørgsmål: forkerte svar forbliver forkerte', function () {
    T.eq(match(byId('kattedyr'), 'Huskat').status, 'wrong');
    T.eq(match(byId('praesidenter-flere-perioder'), 'Joe Biden').status, 'wrong');
    T.eq(match(byId('koncerter-parken-boxen'), 'Simon & Garfunkel').status, 'wrong');
    T.eq(match(byId('landsholdsspillere-hjulmand'), 'Peter Schmeichel').status, 'wrong');
  });

  T.test('spørgsmålsdata: unikke id\'er, gyldige scores', function () {
    var ids = qs.map(function (q) { return q.id; });
    T.eq(ids.length, new Set(ids).size, 'unikke id');
    qs.forEach(function (q) {
      q.answers.forEach(function (a) {
        T.assert(a.score >= 0 && a.score <= 100, q.id + ': ' + a.name + ' har ugyldig score');
        T.assert(Array.isArray(a.aliases), q.id + ': ' + a.name + ' mangler aliases');
      });
    });
  });
})();
