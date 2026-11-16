// Tests af rettelserne 16-11-2026: rotation (R1), rundeplan og kategorier (R2), tilfældige spørgsmål (R3),
// sessionshistorik (R4), knapper (R5), holdfarver (R6), nedtælling (R8) og pointless-sejr (R9).
(function () {
  'use strict';
  var T = window.JFM_TEST;
  var JFM = window.JFM;
  var E = JFM.engine;

  function makeQuestion(id) {
    var answers = [];
    for (var s = 0; s <= 100; s++) {
      answers.push({ name: 'n' + s, score: s, aliases: [] });
      answers.push({ name: 'm' + s, score: s, aliases: [] });
    }
    return { id: id, title: id.toUpperCase(), instruction: 'Test', answers: answers };
  }
  var testBank = {
    questions: [makeQuestion('q1'), makeQuestion('q2'), makeQuestion('q3'), makeQuestion('q4')],
    anagrams: [
      { id: 'a1', theme: 'Dyr', answer: 'Krokodille', aliases: [], scrambled: 'Oiolkkdlre' },
      { id: 'a2', theme: 'Dyr', answer: 'Pingvin', aliases: [], scrambled: 'Gvniinp' },
      { id: 'a3', theme: 'Fodbold', answer: 'Luis Suarez', aliases: ['Suarez'], scrambled: 'Iusl Rsaezu' },
      { id: 'a4', theme: 'Dyr', answer: 'Flodhest', aliases: [], scrambled: 'Deltfsho' }
    ],
    connections: [
      { id: 'c1', groupName: 'Planeter', correct: ['Merkur', 'Venus', 'Mars', 'Saturn'], decoys: ['Pluto', 'Månen', 'Solen', 'Twix', 'Afrodite', 'Kaffe', 'Stol', 'Bus'] },
      { id: 'c2', groupName: 'Kortspil', correct: ['Poker', 'Bridge', 'Whist', 'Kasino'], decoys: ['Golf', 'Bro', 'Hotel', 'Ruder', 'Sol', 'Brød', 'Cykel', 'Kat'] },
      { id: 'c3', groupName: 'Skak', correct: ['Konge', 'Dronning', 'Løber', 'Springer'], decoys: ['Prins', 'Sprinter', 'Hest', 'Bræt', 'Ur', 'Mælk', 'Vind', 'Plakat'] },
      { id: 'c4', groupName: 'Kaffe', correct: ['Espresso', 'Latte', 'Cappuccino', 'Americano'], decoys: ['Kakao', 'Fløjte', 'Hund', 'Rød', 'Tog', 'Sten', 'Kam', 'Ugle'] }
    ]
  };

  var seed = 1000;
  function d(state, action, bank) {
    if (action.seed == null) action.seed = seed++;
    return E.reduce(state, action, bank || testBank);
  }

  function quietly(fn) {
    var w = console.warn, i = console.info;
    console.warn = function () {};
    console.info = function () {};
    try { return fn(); } finally { console.warn = w; console.info = i; }
  }

  function setup(defs, bank) {
    var s = E.createInitialState();
    defs.forEach(function (t) { s = d(s, { type: 'ADD_TEAM', team: t }, bank); });
    return s;
  }
  function soloTeams(n) {
    var defs = [];
    for (var i = 0; i < n; i++) defs.push({ id: 's' + i, name: 'Solo ' + i, players: ['P' + i] });
    return defs;
  }
  function start(defs, bank) {
    return d(d(setup(defs, bank), { type: 'START_GAME' }, bank), { type: 'NEXT' }, bank);
  }

  // Et gyldigt svar for den aktuelle tur, der giver ca. `score` point.
  function answerFor(state, score, bank) {
    var r = state.round;
    var turn = r.turns[r.turnIdx];
    var b = bank || testBank;
    if (r.category === 'anagram') {
      var a = E.findItem(b, 'anagram', turn.itemId);
      return { texts: [score === 0 ? a.answer : 'zzzzz'] };
    }
    if (r.category === 'connections') {
      var c = E.findItem(b, 'connections', turn.itemId);
      var wrong = Math.round(score / 25);
      return { picks: c.correct.slice(0, 4 - wrong).concat(c.decoys.slice(0, wrong)) };
    }
    var q = E.findQuestion(b, r.questionId);
    var used = r.given.map(function (g) { return g.matched; });
    var pick = q.answers.filter(function (x) { return x.score === score && used.indexOf(x.name) === -1; })[0] ||
      q.answers.filter(function (x) { return x.score > 0 && used.indexOf(x.name) === -1; })[0];
    return { texts: [pick ? pick.name : 'pas'] };   // spørgsmål med kun nulsvar: pas
  }

  function playTurn(state, score, bank) {
    T.eq(state.phase, 'HANDOFF', 'før tur');
    state = d(state, { type: 'CONFIRM_READY' }, bank);
    var action = answerFor(state, score, bank);
    action.type = 'SUBMIT_ANSWER';
    state = d(state, action, bank);
    T.eq(state.phase, 'REVEAL', 'svar accepteret');
    state = d(state, { type: 'REVEAL_DONE' }, bank);
    return d(state, { type: 'NEXT' }, bank);
  }

  function playRound(state, score, bank) {
    if (state.phase === 'ROUND_INTRO') state = d(state, { type: 'NEXT' }, bank);
    while (state.phase === 'HANDOFF') state = playTurn(state, typeof score === 'function' ? score(state) : score, bank);
    return state;
  }

  // ---------- R1: rotation ----------

  T.test('R1: rotateRight', function () {
    T.eq(E.rotateRight(['A', 'B', 'C', 'D'], 0), ['A', 'B', 'C', 'D']);
    T.eq(E.rotateRight(['A', 'B', 'C', 'D'], 1), ['D', 'A', 'B', 'C']);
    T.eq(E.rotateRight(['A', 'B', 'C', 'D'], 2), ['C', 'D', 'A', 'B']);
    T.eq(E.rotateRight(['A', 'B', 'C', 'D'], 5), ['D', 'A', 'B', 'C']);
    T.eq(E.rotateRight([], 3), []);
  });

  T.test('R1: 4 hold à 1 spiller — 4 svar pr. runde og roterende rækkefølge over 5 runder', function () {
    quietly(function () {
      var s = start(soloTeams(4));
      var base = s.baseOrder.slice();
      var orders = [];
      for (var round = 1; round <= 5; round++) {
        T.eq(s.phase, 'ROUND_INTRO');
        T.eq(s.round.number, round);
        T.eq(s.round.turns.length, 4, 'runde ' + round + ': præcis 4 svar');
        T.eq(s.round.answersPerTeam, 1);
        T.eq(s.round.order, E.rotateRight(base, round - 1), 'runde ' + round);
        orders.push(s.round.order.slice());
        s = d(playRound(s, 5), { type: 'NEXT' });
      }
      var A = base[0], B = base[1], C = base[2], D = base[3];
      T.eq(orders[0], [A, B, C, D]);
      T.eq(orders[1], [D, A, B, C]);
      T.eq(orders[2], [C, D, A, B]);
      T.eq(orders[1][1], orders[0][0], 'startholdet fra runde 1 svarer som nr. 2 i runde 2');
    });
  });

  T.test('R1: med 2-mandshold er adfærden uændret (2 svar på skift, startholdet roterer)', function () {
    var s = start([
      { id: 'x', name: 'X', players: ['A', 'B'] },
      { id: 'y', name: 'Y', players: ['C'] }
    ]);
    var o = s.round.order;
    T.eq(s.round.answersPerTeam, 2);
    T.eq(s.round.turns.map(function (t) { return t.teamId; }), [o[0], o[1], o[0], o[1]]);
    s = d(playRound(s, 5), { type: 'NEXT' });
    T.eq(s.round.order, [o[1], o[0]]);
  });

  // ---------- R2: rundeplan ----------

  T.test('R2: categoryForRound følger rundeplanen', function () {
    var expected = { 1: 'pointless', 5: 'pointless', 6: 'anagram', 7: 'anagram', 8: 'pointless', 12: 'pointless',
      13: 'connections', 14: 'connections', 15: 'pointless', 30: 'pointless' };
    Object.keys(expected).forEach(function (n) {
      T.eq(E.categoryForRound(Number(n)), expected[n], 'runde ' + n);
    });
  });

  T.test('R2: runde 6 er anagrammer med eget anagram pr. tur; runde 13 sammenhæng med 12 brikker', function () {
    quietly(function () {
      var s = start(soloTeams(2));
      for (var i = 1; i < 6; i++) s = d(playRound(s, 3), { type: 'NEXT' });
      T.eq(s.round.number, 6);
      T.eq(s.round.category, 'anagram');
      T.eq(s.round.questionId, null);
      var ids = s.round.turns.map(function (t) { return t.itemId; });
      T.eq(ids.length, 2);
      T.assert(ids[0] !== ids[1], 'hver tur har sit eget anagram');
      for (; i < 13; i++) s = d(playRound(s, 3), { type: 'NEXT' });
      T.eq(s.round.number, 13);
      T.eq(s.round.category, 'connections');
      s.round.turns.forEach(function (t) {
        T.eq(t.tileOrder.length, 12);
        var c = E.findItem(testBank, 'connections', t.itemId);
        T.eq(t.tileOrder.slice().sort(), c.correct.concat(c.decoys).sort());
      });
    });
  });

  T.test('R2: et nyt spil starter igen i runde 1 med Jo Færre Jo Bedre', function () {
    quietly(function () {
      var s = start(soloTeams(2));
      for (var i = 1; i < 7; i++) s = d(playRound(s, 3), { type: 'NEXT' });
      T.eq(s.round.category, 'anagram');
      s = d(d(d(s, { type: 'NEW_GAME' }), { type: 'START_GAME' }), { type: 'NEXT' });
      T.eq(s.round.number, 1);
      T.eq(s.round.category, 'pointless');
    });
  });

  T.test('R2: anagram — korrekt 0, forkert 25, tom afvist, for sent 25', function () {
    quietly(function () {
      var s = start(soloTeams(2));
      for (var i = 1; i < 6; i++) s = d(playRound(s, 3), { type: 'NEXT' });
      s = d(d(s, { type: 'NEXT' }), { type: 'CONFIRM_READY', now: 1000 });
      T.eq(s.round.deadline, 1000 + E.ANAGRAM_SECONDS * 1000);
      var a = E.findItem(testBank, 'anagram', s.round.turns[0].itemId);

      var r = d(s, { type: 'SUBMIT_ANSWER', texts: [''], now: 2000 });
      T.eq(r.phase, 'ANSWERING');
      T.eq(r.round.lastFeedback.message, 'Skriv et svar.');

      r = d(s, { type: 'SUBMIT_ANSWER', texts: [a.answer.toUpperCase()], now: 2000 });
      T.eq([r.round.pending.entries[0].status, r.round.pending.entries[0].score], ['correct', 0]);

      r = d(s, { type: 'SUBMIT_ANSWER', texts: ['forkert'], now: 2000 });
      T.eq([r.round.pending.entries[0].status, r.round.pending.entries[0].score], ['wrong', 25]);
      T.eq(r.round.pending.entries[0].solution, a.answer, 'det rigtige svar gemmes til visning');

      r = d(s, { type: 'SUBMIT_ANSWER', texts: [a.answer], now: 1000 + 60000 });
      T.eq([r.round.pending.entries[0].status, r.round.pending.entries[0].score], ['timeout', 25], 'efter deadline');

      r = d(s, { type: 'SUBMIT_ANSWER', texts: [''], timeout: true });
      T.eq(r.round.pending.entries[0].status, 'timeout', 'timeren udløb i UI');
    });
  });

  T.test('R2: anagram-matching er stram (alias, én tastefejl fra 8 tegn)', function () {
    var M = JFM.matcher;
    var suarez = testBank.anagrams[2];
    var croc = testBank.anagrams[0];
    var ping = testBank.anagrams[1];
    T.assert(M.matchAnagram('luis suárez', suarez), 'accenter og store/små bogstaver');
    T.assert(M.matchAnagram('Suarez', suarez), 'alias');
    T.assert(M.matchAnagram('Krokodile', croc), 'én fejl i et ord på 10 tegn');
    T.assert(!M.matchAnagram('Krokdile', croc), 'to fejl afvises');
    T.assert(!M.matchAnagram('Pingvim', ping), 'ingen tastefejl under 8 tegn');
    T.assert(!M.matchAnagram('', ping));
  });

  T.test('R2: sammenhæng — korrekt (0) eller ikke korrekt (25), 10 sek. timer, ugyldige valg afvises', function () {
    quietly(function () {
      var s = start(soloTeams(2));
      for (var i = 1; i < 13; i++) s = d(playRound(s, 3), { type: 'NEXT' });
      s = d(d(s, { type: 'NEXT' }), { type: 'CONFIRM_READY', now: 5000 });
      T.eq(s.round.deadline, 5000 + E.CONNECTION_SECONDS * 1000, 'timeren starter ved "Jeg er klar"');
      var c = E.findItem(testBank, 'connections', s.round.turns[0].itemId);
      [0, 1, 2, 3, 4].forEach(function (wrong) {
        var picks = c.correct.slice(0, 4 - wrong).concat(c.decoys.slice(0, wrong));
        var e = d(s, { type: 'SUBMIT_ANSWER', picks: picks, now: 6000 }).round.pending.entries[0];
        T.eq([e.status, e.score], wrong ? ['wrong', 25] : ['correct', 0], wrong + ' forkerte');
      });
      // For sent: tæller som ikke korrekt, også med 4 rigtige og også med færre end 4 valgte
      var late = d(s, { type: 'SUBMIT_ANSWER', picks: c.correct.slice(), now: 5000 + 60000 }).round.pending.entries[0];
      T.eq([late.status, late.score], ['timeout', 25], 'efter deadline');
      var partial = d(s, { type: 'SUBMIT_ANSWER', picks: c.correct.slice(0, 2), timeout: true }).round.pending.entries[0];
      T.eq([partial.status, partial.score, partial.picks], ['timeout', 25, c.correct.slice(0, 2)], 'timeren udløb med 2 valgt');
      T.assert(d(s, { type: 'SUBMIT_ANSWER', picks: c.correct.slice(0, 3) }) === s, '3 valg afvises');
      T.assert(d(s, { type: 'SUBMIT_ANSWER', picks: [c.correct[0], c.correct[0], c.correct[1], c.correct[2]] }) === s, 'dubletter afvises');
      T.assert(d(s, { type: 'SUBMIT_ANSWER', picks: c.correct.slice(0, 3).concat(['Findes ikke']) }) === s, 'ord uden for opgaven afvises');
    });
  });

  // ---------- R3: tilfældigt ubrugt ----------

  T.test('R3: pickRandomUnused — ingen gentagelse før puljen er brugt (fast seed), derefter nulstilles puljen', function () {
    var pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    var rng = E.createRng(42);
    var used = [];
    var seen = [];
    for (var i = 0; i < 4; i++) {
      var p = E.pickRandomUnused(pool, used, rng);
      T.assert(seen.indexOf(p.item.id) === -1, p.item.id + ' valgt to gange');
      seen.push(p.item.id);
      used = p.usedIds;
      T.eq(p.wasReset, false);
    }
    T.eq(seen.slice().sort(), ['a', 'b', 'c', 'd']);
    var info = 0;
    var orig = console.info;
    console.info = function () { info++; };
    try {
      var again = E.pickRandomUnused(pool, used, rng, [seen[3]]);
      T.eq(again.wasReset, true);
      T.eq(again.usedIds, [again.item.id]);
      T.assert(again.item.id !== seen[3], 'det netop brugte undgås efter nulstilling');
      T.eq(info, 1, 'console.info ved nulstilling');
    } finally {
      console.info = orig;
    }
    T.eq(E.pickRandomUnused(pool, [], E.createRng(7)).item, E.pickRandomUnused(pool, [], E.createRng(7)).item, 'deterministisk');
  });

  T.test('R3: brugte spørgsmål gælder hele sessionen — nye spil starter ikke med samme spørgsmål', function () {
    quietly(function () {
      var s = start(soloTeams(2));
      var first = s.round.questionId;
      s = d(d(d(s, { type: 'NEW_GAME' }), { type: 'START_GAME' }), { type: 'NEXT' });
      T.assert(s.round.questionId !== first, 'spil 2 starter med et nyt spørgsmål');
      T.eq(s.session.usedIds.pointless.length, 2);
    });
  });

  // ---------- R4: historik ----------

  T.test('R4: svar gemmes pr. spørgsmål og vises i et senere spil', function () {
    quietly(function () {
      var s = start(soloTeams(2));
      T.eq(s.gameNumber, 1);
      var qid = s.round.questionId;
      s = d(playRound(s, 7), { type: 'NEXT' });
      var saved = s.session.answersByItem[qid];
      T.eq(saved.length, 2);
      T.eq(saved[0].game, 1);
      T.assert(saved[0].teamColor, 'holdfarve gemmes');
      T.eq(saved[0].score, 7);
      T.eq(E.previousAnswers(s, qid), [], 'svar fra det igangværende spil vises ikke i boksen');

      s = d(d(d(s, { type: 'NEW_GAME' }), { type: 'START_GAME' }), { type: 'NEXT' });
      T.eq(s.gameNumber, 2);
      T.eq(s.session.gamesPlayed, 2);
      if (s.round.questionId !== qid) s = d(s, { type: 'SWAP_QUESTION', questionId: qid });
      T.eq(s.round.questionId, qid, 'samme spørgsmål tvunget frem');
      var prev = E.previousAnswers(s, qid);
      T.eq(prev.length, 2);
      T.eq(prev[0].matched, saved[0].matched);
    });
  });

  // ---------- R5: knapper ----------

  T.test('R5: "Spørgsmål gentaget" skifter spørgsmål før første svar og afvises efter', function () {
    quietly(function () {
      var s = d(d(start(soloTeams(2)), { type: 'NEXT' }), { type: 'CONFIRM_READY' });
      var before = s.round.questionId;
      var number = s.round.number;
      var swapped = d(s, { type: 'SWAP_QUESTION' });
      T.assert(swapped.round.questionId !== before, 'nyt spørgsmål');
      T.eq(swapped.round.number, number, 'rundenummeret ændres ikke');
      T.assert(swapped.session.usedIds.pointless.indexOf(before) !== -1, 'det gamle er markeret som brugt');
      T.assert(swapped.session.usedIds.pointless.indexOf(swapped.round.questionId) !== -1, 'det nye er markeret som brugt');

      var answered = d(swapped, { type: 'SUBMIT_ANSWER', texts: ['n5'] });
      T.assert(d(answered, { type: 'SWAP_QUESTION' }) === answered, 'afvist efter første svar');
    });
  });

  T.test('R5: "Spørgsmål gentaget" virker ikke i Anagrammer og Sammenhæng', function () {
    quietly(function () {
      var s = start(soloTeams(2));
      for (var i = 1; i < 6; i++) s = d(playRound(s, 3), { type: 'NEXT' });
      s = d(s, { type: 'NEXT' });
      T.eq(s.round.category, 'anagram');
      T.assert(d(s, { type: 'SWAP_QUESTION' }) === s);
    });
  });

  T.test('R5: "Nyt spil" beholder hold og historik, nulstiller point, tællere og runder', function () {
    quietly(function () {
      var s = start(soloTeams(2));
      s = d(playRound(s, 0), { type: 'NEXT' });
      T.eq(s.teams[0].pointlessCount, 1);
      s = d(s, { type: 'NEW_GAME' });
      T.eq(s.phase, 'SETUP');
      T.eq(s.teams.length, 2);
      T.assert(s.teams.every(function (t) { return t.totalScore === 0 && t.pointlessCount === 0; }), 'point og tællere nulstillet');
      T.eq(s.session.gamesPlayed, 1);
      T.assert(Object.keys(s.session.answersByItem).length > 0, 'historikken bevares');
      s = d(d(s, { type: 'START_GAME' }), { type: 'NEXT' });
      T.eq(s.round.number, 1);
      T.assert(s.teams.every(function (t) { return t.pointlessCount === 0; }), 'tælleren er 0 i et nyt spil');
    });
  });

  // ---------- R6: farver ----------

  T.test('R6: 5 farver, én pr. hold, højst 5 hold', function () {
    T.eq(E.TEAM_COLORS.map(function (c) { return c.hex; }), ['#E63946', '#3A86FF', '#2DC653', '#FFBE0B', '#9B5DE5']);
    T.eq(E.MAX_TEAMS, 5);
    var s = setup(soloTeams(5));
    T.eq(s.teams.map(function (t) { return t.color; }), ['red', 'blue', 'green', 'yellow', 'purple'], 'første ledige farve');
    var six = d(s, { type: 'ADD_TEAM', team: { id: 'x', name: 'Sjette', players: ['P'] } });
    T.assert(six === s, 'det 6. hold kan ikke oprettes');
  });

  T.test('R6: en optaget farve kan ikke vælges', function () {
    var s = setup([{ id: 'a', name: 'A', players: ['P'], color: 'yellow' }]);
    T.eq(s.teams[0].color, 'yellow');
    T.eq(E.validateTeam(s.teams, { name: 'B', players: ['Q'], color: 'yellow' }, null), 'Den farve er allerede valgt af et andet hold.');
    T.assert(d(s, { type: 'ADD_TEAM', team: { id: 'b', name: 'B', players: ['Q'], color: 'yellow' } }) === s);
    s = d(s, { type: 'ADD_TEAM', team: { id: 'b', name: 'B', players: ['Q'], color: 'blue' } });
    T.eq(s.teams[1].color, 'blue');
    s = d(s, { type: 'EDIT_TEAM', team: { id: 'a', name: 'A', players: ['P'], color: 'green' } });
    T.eq(s.teams[0].color, 'green', 'farven kan skiftes til en ledig');
    T.eq(E.validateTeam(s.teams, { name: 'A', players: ['P'], color: 'green' }, 'a'), null, 'holdets egen farve er ikke "optaget"');
  });

  T.test('R6: gemte hold uden farve får den første ledige farve', function () {
    var old = {
      version: 3, phase: 'SETUP', usedQuestionIds: [], history: [], round: null, result: null,
      teams: [
        { id: 't1', name: 'Gammel 1', players: ['A'], totalScore: 0, questionScore: 0 },
        { id: 't2', name: 'Gammel 2', players: ['B', 'C'], totalScore: 0, questionScore: 0 }
      ]
    };
    var s = E.migrateState(old);
    T.assert(E.isValidState(s));
    T.eq(s.teams.map(function (t) { return t.color; }), ['red', 'blue']);
  });

  // ---------- R8: nedtælling ----------

  // R8 med det langsommere tempo (16-11-2026): delay(n) = 2 × (15 + 600 / (n + 2))
  T.test('R8: delay(n) = 2 × (15 + 600 / (n + 2)) — langsommere tæt på 0', function () {
    var delay = JFM.countdown.stepDelay;
    function near(a, b) { return Math.abs(a - b) < 0.01; }
    T.assert(near(delay(100), 2 * (15 + 600 / 102)), 'n=100: ' + delay(100));
    T.assert(near(delay(20), 2 * (15 + 600 / 22)), 'n=20: ' + delay(20));
    T.assert(near(delay(5), 2 * (15 + 600 / 7)), 'n=5: ' + delay(5));
    T.assert(near(delay(1), 430), 'n=1: ' + delay(1));
    T.eq(Math.round(delay(100)), 42);
    T.eq(Math.round(delay(20)), 85);
    T.eq(Math.round(delay(5)), 201);
    T.assert(delay(1) > delay(5) && delay(5) > delay(20) && delay(20) > delay(100), 'farten sættes ned tæt på 0');
    var full = 0, partial = 0;
    for (var n = 100; n > 0; n--) full += delay(n);
    for (n = 100; n > 39; n--) partial += delay(n);
    T.assert(full > 7000 && full < 8000, '100 → 0 tager ca. 7,5 sek. (' + Math.round(full) + ' ms)');
    T.assert(partial > 2600 && partial < 3200, '100 → 39 tager ca. 2,9 sek. (' + Math.round(partial) + ' ms)');
  });

  // ---------- R9: pointless-sejr ----------

  T.test('R9: 6. pointless-svar vinder straks — uanset point og før 1000-reglen', function () {
    quietly(function () {
      var s = d(start(soloTeams(2)), { type: 'NEXT' });
      var id = E.currentTurn(s).team.id;
      var other = s.teams.filter(function (t) { return t.id !== id; })[0].id;
      // Holdet har 5 pointless-svar og 990 point; det andet hold har færrest point.
      s.teams.forEach(function (t) {
        if (t.id === id) { t.pointlessCount = 5; t.totalScore = 990; } else { t.totalScore = 10; }
      });
      s = d(s, { type: 'CONFIRM_READY' });
      s = d(s, { type: 'SUBMIT_ANSWER', texts: ['n0'] });
      s = d(s, { type: 'REVEAL_DONE' });
      T.eq(E.findTeam(s, id).pointlessCount, 6);
      s = d(s, { type: 'NEXT' });
      T.eq(s.phase, 'GAME_OVER', 'slutter straks efter revealen, midt i runden');
      T.eq(s.result.reason, 'pointless');
      T.eq(s.result.winnerIds, [id]);
      T.assert(s.result.winnerIds.indexOf(other) === -1);
    });
  });

  T.test('R9: pointless-reglen vinder, når begge slutbetingelser rammes i samme svar', function () {
    quietly(function () {
      var s = d(start(soloTeams(2)), { type: 'NEXT' });
      var id = E.currentTurn(s).team.id;
      s.teams.forEach(function (t) { if (t.id === id) t.pointlessCount = 5; else t.totalScore = 1000; });
      s = playTurn(s, 0);
      T.eq(s.phase, 'GAME_OVER');
      T.eq(s.result.reason, 'pointless');
      T.eq(s.result.winnerIds, [id]);
    });
  });

  T.test('R9: korrekte anagrammer og fejlfri sammenhænge tæller ikke som pointless', function () {
    quietly(function () {
      var s = start(soloTeams(2));
      for (var i = 1; i < 6; i++) s = d(playRound(s, 3), { type: 'NEXT' });
      T.eq(s.round.category, 'anagram');
      s = playRound(s, 0);
      T.assert(s.round.given.every(function (g) { return g.status === 'correct' && g.score === 0; }), 'korrekte anagrammer');
      T.assert(s.teams.every(function (t) { return t.pointlessCount === 0; }), 'tæller ikke med');
      s = d(s, { type: 'NEXT' });
      for (i = 7; i < 13; i++) s = d(playRound(s, 3), { type: 'NEXT' });
      T.eq(s.round.category, 'connections');
      s = playRound(s, 0);
      T.assert(s.teams.every(function (t) { return t.pointlessCount === 0; }), 'fejlfri sammenhæng tæller ikke med');
    });
  });

  T.test('R9: pointless-svar i Jo Færre Jo Bedre tæller op', function () {
    quietly(function () {
      var s = playRound(start(soloTeams(2)), 0);
      T.assert(s.teams.every(function (t) { return t.pointlessCount === 1; }));
    });
  });

  // ---------- Data ----------

  function letters(word) { return word.toLowerCase().split('').sort().join(''); }

  T.test('data: anagrammer har samme bogstaver pr. ord som svaret, og id\'er er unikke', function () {
    var list = window.JFM_ANAGRAMS || [];
    T.assert(list.length >= 20, 'mindst 20 anagrammer (' + list.length + ')');
    var bad = list.filter(function (a) {
      var w1 = a.answer.split(' '), w2 = a.scrambled.split(' ');
      return w1.length !== w2.length || w1.some(function (w, i) { return letters(w) !== letters(w2[i]); });
    }).map(function (a) { return a.id; });
    T.eq(bad, [], 'anagrammer med forkerte bogstaver');
    var ids = list.map(function (a) { return a.id; });
    T.eq(ids.filter(function (x, i) { return ids.indexOf(x) !== i; }), [], 'dubletter');
  });

  T.test('data: sammenhængsopgaver har 4 rigtige + 8 afledere, alle forskellige', function () {
    var list = window.JFM_CONNECTIONS || [];
    T.assert(list.length >= 6, 'mindst 6 opgaver (' + list.length + ')');
    list.forEach(function (c) {
      var words = c.correct.concat(c.decoys);
      T.eq([c.correct.length, c.decoys.length], [4, 8], c.id);
      T.eq(words.filter(function (w, i) { return words.indexOf(w) !== i; }), [], c.id + ' har dubletter');
      T.assert(c.groupName, c.id + ' mangler gruppenavn');
    });
  });

  T.test('data: id\'er er unikke på tværs af alle tre puljer (historikken bruger id som nøgle)', function () {
    var ids = (window.JFM_QUESTIONS.questions || []).map(function (q) { return q.id; })
      .concat((window.JFM_ANAGRAMS || []).map(function (a) { return a.id; }))
      .concat((window.JFM_CONNECTIONS || []).map(function (c) { return c.id; }));
    T.eq(ids.filter(function (x, i) { return ids.indexOf(x) !== i; }), []);
  });

  // ---------- R10: testspil gennem runde 1–15 med de rigtige data ----------

  T.test('R10: 2 hold à 1 spiller gennem runde 1–15 med de rigtige data (kategoriskift)', function () {
    quietly(function () {
      var real = { questions: window.JFM_QUESTIONS.questions, anagrams: window.JFM_ANAGRAMS, connections: window.JFM_CONNECTIONS };
      var s = start(soloTeams(2), real);
      var cats = [];
      for (var round = 1; round <= 15; round++) {
        T.eq(s.phase, 'ROUND_INTRO', 'runde ' + round);
        T.eq(s.round.number, round);
        cats.push(s.round.category);
        // Lave point i Jo Færre Jo Bedre (ingen pointless), rigtige anagrammer, 1 forkert i sammenhæng
        s = playRound(s, function (st) {
          return st.round.category === 'connections' ? 25 : st.round.category === 'anagram' ? 0 : 1;
        }, real);
        T.eq(s.phase, 'ROUND_SUMMARY');
        T.eq(s.round.given.length, 2, 'runde ' + round + ': ét svar pr. hold');
        s = d(s, { type: 'NEXT' }, real);
      }
      T.eq(cats.join(','), 'pointless,pointless,pointless,pointless,pointless,anagram,anagram,pointless,pointless,' +
        'pointless,pointless,pointless,connections,connections,pointless');
      T.eq(s.round.number, 16);
      T.eq(s.history.length, 15);
      T.assert(s.teams.every(function (t) { return t.totalScore < E.TARGET_SCORE; }));
    });
  });
})();
