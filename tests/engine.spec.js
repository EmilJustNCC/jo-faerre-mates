// Tests af game-engine.js. Simulerer et helt spil med 4 hold inkl. pas, uafgjort, omspil og Head-to-Head.
(function () {
  'use strict';
  var T = window.JFM_TEST;
  var E = window.JFM.engine;

  // Kontrolleret testbank: hvert spørgsmål har svarene "n0".."n100" og "m0".."m100" med score = tallet.
  function makeQuestion(id) {
    var answers = [];
    for (var s = 0; s <= 100; s++) {
      answers.push({ name: 'n' + s, score: s, aliases: [] });
      answers.push({ name: 'm' + s, score: s, aliases: [] });
    }
    return { id: id, title: id.toUpperCase(), instruction: 'Test', answers: answers };
  }
  var bank = { questions: [makeQuestion('q1'), makeQuestion('q2'), makeQuestion('q3')] };
  var WRONG = 'wrong';
  var PASS = 'pass';

  var seed = 1;
  function d(state, action) {
    if (action.seed == null) action.seed = seed++;
    return E.reduce(state, action, bank);
  }

  // Finder ubrugte svarnavne med de ønskede scores i det aktuelle spørgsmål.
  function textsFor(state, scores) {
    var used = state.round.given.map(function (g) { return g.matched; });
    return scores.map(function (score) {
      if (score === WRONG) return 'zzzzzzzz';
      if (score === PASS) return 'pas';
      var name = used.indexOf('n' + score) === -1 ? 'n' + score : 'm' + score;
      T.assert(used.indexOf(name) === -1, 'testen mangler et ubrugt svar med score ' + score);
      used.push(name);
      return name;
    });
  }

  // Spiller én tur: overlevering → svar → afslør hvert svar → videre.
  function playTurn(state, scores) {
    var list = Array.isArray(scores) ? scores : [scores];
    T.eq(state.phase, 'HANDOFF', 'før tur');
    state = d(state, { type: 'CONFIRM_READY' });
    T.eq(state.phase, 'ANSWERING');
    state = d(state, { type: 'SUBMIT_ANSWER', texts: textsFor(state, list) });
    T.eq(state.phase, 'REVEAL', 'svar accepteret');
    while (state.phase === 'REVEAL') {
      state = d(state, { type: 'REVEAL_DONE' });
      state = d(state, { type: 'NEXT' });
    }
    return state;
  }

  // Spiller ture så længe der er overlevering; scoresByTeam = { teamId: [tur1, tur2, ...] }.
  function playTurns(state, scoresByTeam) {
    while (state.phase === 'HANDOFF') {
      var teamId = E.currentTurn(state).team.id;
      var queue = scoresByTeam[teamId];
      T.assert(queue && queue.length, 'mangler svar til ' + teamId);
      state = playTurn(state, queue.shift());
    }
    return state;
  }

  function setupTeams(n) {
    var s = E.createInitialState();
    var defs = [
      { id: 't1', name: 'Hold 1', players: ['Emil', 'Jonas'] },
      { id: 't2', name: 'Hold 2', players: ['Ida'] },
      { id: 't3', name: 'Hold 3', players: ['Anna', 'Bo'] },
      { id: 't4', name: 'Hold 4', players: ['Carl', 'Dorte'] }
    ];
    for (var i = 0; i < n; i++) s = d(s, { type: 'ADD_TEAM', team: defs[i] });
    return s;
  }

  // 3 hold, spillet frem til første overlevering i runde 1.
  function firstHandoff() {
    var s = setupTeams(3);
    return d(d(d(s, { type: 'START_GAME' }), { type: 'NEXT' }), { type: 'NEXT' });
  }

  function team(state, id) { return E.findTeam(state, id); }

  T.test('opsætning: tilføj, redigér og slet hold', function () {
    var s = setupTeams(2);
    T.eq(s.teams.length, 2);
    T.eq(s.teams[1].players, ['Ida']);

    var same = d(s, { type: 'ADD_TEAM', team: { id: 'x', name: 'hold 1', players: ['A'] } });
    T.assert(same === s, 'dubletnavn afvises og state er uændret');

    s = d(s, { type: 'EDIT_TEAM', team: { id: 't2', name: 'Nyt navn', players: ['Ida', 'Ole'] } });
    T.eq(team(s, 't2').name, 'Nyt navn');
    T.eq(team(s, 't2').players, ['Ida', 'Ole']);

    s = d(s, { type: 'REMOVE_TEAM', teamId: 't1' });
    T.eq(s.teams.map(function (t) { return t.id; }), ['t2']);
  });

  T.test('validering af hold', function () {
    T.assert(E.validateTeam([], { name: '', players: ['A'] }), 'tomt navn');
    T.assert(E.validateTeam([], { name: 'X', players: [] }), 'ingen spillere');
    T.assert(E.validateTeam([], { name: 'X', players: ['A', 'B', 'C'] }), 'for mange spillere');
    T.eq(E.validateTeam([], { name: 'X', players: ['A', ' '] }), null, 'tomt spillerfelt ignoreres');
  });

  T.test('højst 6 hold, mindst 2 for at starte', function () {
    var s = E.createInitialState();
    T.assert(d(s, { type: 'START_GAME' }) === s, 'kan ikke starte uden hold');
    for (var i = 1; i <= 7; i++) s = d(s, { type: 'ADD_TEAM', team: { id: 'h' + i, name: 'H' + i, players: ['P'] } });
    T.eq(s.teams.length, 6);
  });

  T.test('ugyldige actions returnerer samme state-objekt', function () {
    var s = setupTeams(3);
    T.assert(d(s, { type: 'SUBMIT_ANSWER', text: 'x' }) === s);
    T.assert(d(s, { type: 'NEXT' }) === s);
    T.assert(d(s, { type: 'UKENDT' }) === s);
  });

  T.test('2 hold går direkte til Head-to-Head', function () {
    var s = setupTeams(2);
    s = d(s, { type: 'START_GAME' });
    T.eq(s.phase, 'INTRO');
    s = d(s, { type: 'NEXT' });
    T.eq(s.phase, 'H2H_INTRO');
  });

  T.test('eliminationsrunde: én tur pr. hold med 3 felter, holdet konfererer', function () {
    var s = firstHandoff();
    T.eq(s.round.turns.length, 3, 'én tur pr. hold');
    var turn = E.currentTurn(s);
    T.eq(turn.slots, E.ANSWERS_PER_TURN);
    T.eq(turn.playerName, null);
    T.eq(E.currentTurn(s).team.id, s.round.order[0]);
  });

  T.test('3 svar: forkert antal felter afvises', function () {
    var s = d(firstHandoff(), { type: 'CONFIRM_READY' });
    T.assert(d(s, { type: 'SUBMIT_ANSWER', texts: ['n1', 'n2'] }) === s, '2 felter');
    T.assert(d(s, { type: 'SUBMIT_ANSWER', text: 'n1' }) === s, 'enkelt tekst');
  });

  T.test('3 svar: tomt felt, dublet i egne svar og tidligere brugt svar afviser hele turen', function () {
    var s = d(firstHandoff(), { type: 'CONFIRM_READY' });

    var r = d(s, { type: 'SUBMIT_ANSWER', texts: ['n1', '  ', 'n3'] });
    T.eq(r.phase, 'ANSWERING');
    T.eq(r.round.lastFeedback.type, 'empty');
    T.eq(r.round.lastFeedback.field, 1);
    T.eq(r.round.lastFeedback.message, 'Svar 2: Skriv et svar — eller “pas” for 100 point.');
    T.eq(r.round.lastFeedback.inputs, ['n1', '', 'n3'], 'felterne bevares');
    T.eq(r.round.given, [], 'intet er registreret');

    r = d(s, { type: 'SUBMIT_ANSWER', texts: ['n10', 'n11', 'n10'] });
    T.eq(r.round.lastFeedback.type, 'duplicate');
    T.eq(r.round.lastFeedback.field, 2);
    T.eq(r.round.lastFeedback.message, 'Svar 3: Det svar er allerede brugt — prøv igen.');

    // Første hold svarer n10; andet hold må ikke bruge n10
    s = d(s, { type: 'SUBMIT_ANSWER', texts: ['n10', 'n11', 'n12'] });
    while (s.phase === 'REVEAL') s = d(d(s, { type: 'REVEAL_DONE' }), { type: 'NEXT' });
    s = d(s, { type: 'CONFIRM_READY' });
    r = d(s, { type: 'SUBMIT_ANSWER', texts: ['n20', 'n10', 'n21'] });
    T.eq(r.round.lastFeedback.type, 'duplicate');
    T.eq(r.round.lastFeedback.field, 1);
  });

  T.test('"pas" giver 100 point, uanset store/små bogstaver, og må bruges flere gange', function () {
    var s = d(firstHandoff(), { type: 'CONFIRM_READY' });
    s = d(s, { type: 'SUBMIT_ANSWER', texts: ['Pas', ' PAS ', 'n7'] });
    T.eq(s.phase, 'REVEAL');
    var entries = s.round.pending.entries;
    T.eq(entries.map(function (e) { return e.status; }), ['pass', 'pass', 'correct']);
    T.eq(entries.map(function (e) { return e.score; }), [100, 100, 7]);
    T.eq(entries[0].matched, null);
  });

  T.test('svarene afsløres ét ad gangen, og point lægges til pr. svar', function () {
    var s = d(firstHandoff(), { type: 'CONFIRM_READY' });
    var id = E.currentTurn(s).team.id;
    s = d(s, { type: 'SUBMIT_ANSWER', texts: ['n42', 'pas', 'n8'] });
    T.eq(team(s, id).roundScore, 0);
    T.eq(E.currentReveal(s).index, 0);
    T.eq(E.currentReveal(s).total, 3);
    T.assert(d(s, { type: 'NEXT' }) === s, 'NEXT kræver at reveal er færdig');

    s = d(s, { type: 'REVEAL_DONE' });
    T.eq(team(s, id).roundScore, 42);
    T.assert(d(s, { type: 'REVEAL_DONE' }) === s, 'REVEAL_DONE er idempotent');

    s = d(s, { type: 'NEXT' });
    T.eq(s.phase, 'REVEAL', 'stadig reveal — næste svar');
    T.eq(E.currentReveal(s).index, 1);
    T.eq(s.round.revealDone, false);
    s = d(s, { type: 'REVEAL_DONE' });
    T.eq(team(s, id).roundScore, 142);

    s = d(d(s, { type: 'NEXT' }), { type: 'REVEAL_DONE' });
    T.eq(team(s, id).roundScore, 150, 'summen af alle 3');
    s = d(s, { type: 'NEXT' });
    T.eq(s.phase, 'HANDOFF', 'videre til næste hold');
    T.assert(E.currentTurn(s).team.id !== id);
  });

  T.test('fuldt spil: 4 hold, pas, uafgjort, omspil, nyt spørgsmål, H2H og vinder', function () {
    var s = setupTeams(4);
    s = d(s, { type: 'START_GAME' });
    s = d(s, { type: 'NEXT' });
    T.eq(s.phase, 'ROUND_INTRO');
    T.eq(s.round.number, 1);
    T.eq(s.round.order.slice().sort(), ['t1', 't2', 't3', 't4']);
    var order1 = s.round.order.slice();

    s = d(s, { type: 'NEXT' });
    T.eq(E.currentTurn(s).team.id, order1[0]);

    // Runde 1: t1=20, t2=70, t3=70, t4=100+100+0=200 → t4 alene højest
    s = playTurns(s, { t1: [[10, 5, 5]], t2: [[30, 40, 0]], t3: [[50, 19, 1]], t4: [[WRONG, PASS, 0]] });
    T.eq(s.phase, 'ROUND_SUMMARY');
    T.eq([team(s, 't1').roundScore, team(s, 't2').roundScore, team(s, 't3').roundScore, team(s, 't4').roundScore], [20, 70, 70, 200]);
    T.eq(s.round.roundGiven.length, 12, '4 hold × 3 svar');
    s = d(s, { type: 'NEXT' });
    T.eq(s.phase, 'ELIMINATION');
    T.eq(s.round.eliminatedId, 't4');
    T.assert(team(s, 't4').eliminated);

    // Runde 2: stigende efter point i runde 1 (t2/t3 lige → forrige rækkefølge)
    s = d(s, { type: 'NEXT' });
    T.eq(s.phase, 'ROUND_INTRO');
    T.eq(s.round.number, 2);
    T.eq(s.round.order[0], 't1');
    T.eq(s.round.order.slice(1), order1.filter(function (id) { return id === 't2' || id === 't3'; }));
    T.eq(team(s, 't1').roundScore, 0, 'point nulstilles mellem runder');
    var order2 = s.round.order.slice();
    var q2 = s.round.questionId;

    s = d(s, { type: 'NEXT' });
    s = playTurns(s, { t1: [[1, 4, 5]], t2: [[30, 30, 0]], t3: [[40, 20, 0]] });
    // t1=10, t2=60, t3=60 → uafgjort
    s = d(s, { type: 'NEXT' });
    T.eq(s.phase, 'TIEBREAK');
    T.eq(s.round.tiebreak.sameQuestion, true);
    T.eq(s.round.tiebreak.teamIds, order2.filter(function (id) { return id !== 't1'; }), 'samme rækkefølge som runden');

    // Omspil: 1 svar pr. hold på samme spørgsmål. Begge 15 → stadig lige
    s = d(s, { type: 'NEXT' });
    T.eq(E.currentTurn(s).slots, 1, 'omspil har ét felt');
    T.eq(E.currentTurn(s).playerName, null, 'holdet konfererer');
    s = playTurns(s, { t2: [15], t3: [15] });
    T.eq(s.phase, 'TIEBREAK');
    T.eq(s.round.tiebreak.sameQuestion, false);
    T.assert(s.round.questionId !== q2, 'nyt spørgsmål');
    T.eq(s.round.given, [], 'nyt spørgsmål har ingen givne svar');

    // Nyt spørgsmål: t3 passer (100) → t3 ud
    s = d(s, { type: 'NEXT' });
    s = playTurns(s, { t2: [5], t3: [PASS] });
    T.eq(s.phase, 'ELIMINATION');
    T.eq(s.round.eliminatedId, 't3');
    T.eq(s.history.length, 2);
    T.eq(s.history[1].tiebreaks, 2);

    // Head-to-Head mellem t1 og t2. t1 havde færrest point i sidste runde → svarer først.
    s = d(s, { type: 'NEXT' });
    T.eq(s.phase, 'H2H_INTRO');
    T.eq(s.round.order, ['t1', 't2']);
    s = d(s, { type: 'NEXT' });
    T.eq(E.currentTurn(s).team.id, 't1');
    T.eq(E.currentTurn(s).slots, 1, 'H2H har ét felt');

    // Spørgsmål 1: t1 10, t2 20 → t1 vinder
    s = playTurns(s, { t1: [10], t2: [20] });
    T.eq(s.phase, 'H2H_RESULT');
    T.eq(s.round.outcome.winnerId, 't1');
    T.eq(team(s, 't1').h2hWins, 1);

    // Spørgsmål 2: t2 svarer først. Lige → nyt svar på samme spørgsmål
    s = d(s, { type: 'NEXT' });
    T.eq(E.currentTurn(s).team.id, 't2', 'holdene skiftes til at svare først');
    var h2hQ2 = s.round.questionId;
    s = playTurns(s, { t2: [5], t1: [5] });
    T.eq(s.round.outcome.tie, true);
    s = d(s, { type: 'NEXT' });
    T.eq(s.phase, 'HANDOFF');
    T.eq(s.round.questionId, h2hQ2, 'samme spørgsmål ved lighed');
    T.eq(s.round.attempt, 2);
    T.eq(s.round.given.length, 2, 'tidligere svar er stadig brugt');
    s = playTurns(s, { t2: [0], t1: [30] });
    T.eq(s.round.outcome.winnerId, 't2');

    // Spørgsmål 3: t1 passer, t2 50 → t2 vinder 2-1
    s = d(s, { type: 'NEXT' });
    s = playTurns(s, { t1: [PASS], t2: [50] });
    T.eq(team(s, 't2').h2hWins, 2);
    s = d(s, { type: 'NEXT' });
    T.eq(s.phase, 'WINNER');
    T.eq(s.winnerId, 't2');
    T.eq(s.history[2].type, 'h2h');

    // Nyt spil beholder holdene
    s = d(s, { type: 'NEW_GAME' });
    T.eq(s.phase, 'SETUP');
    T.eq(s.teams.length, 4);
    T.assert(s.teams.every(function (t) { return !t.eliminated && t.roundScore === 0 && t.h2hWins === 0; }));
  });

  T.test('state er ren JSON og reduceren er deterministisk', function () {
    function playSome(startSeed) {
      seed = startSeed;
      return playTurn(d(d(d(setupTeams(4), { type: 'START_GAME' }), { type: 'NEXT' }), { type: 'NEXT' }), [7, 8, PASS]);
    }
    var a = playSome(100);
    var b = playSome(100);
    T.eq(a, b);
    T.eq(JSON.parse(JSON.stringify(a)), a);
    T.assert(E.isValidState(a));
  });

  T.test('spørgsmål genbruges med console.warn, når banken er tom', function () {
    var warned = 0;
    var original = console.warn;
    console.warn = function () { warned++; };
    try {
      var tiny = { questions: [bank.questions[0]] };
      var s = E.createInitialState();
      ['a', 'b', 'c'].forEach(function (id) {
        s = E.reduce(s, { type: 'ADD_TEAM', team: { id: id, name: id, players: ['P'] } }, tiny);
      });
      s = E.reduce(s, { type: 'START_GAME' }, tiny);
      s = E.reduce(s, { type: 'NEXT', seed: 1 }, tiny);
      T.eq(warned, 0);
      s = E.reduce(s, { type: 'NEXT' }, tiny);
      while (s.phase === 'HANDOFF') {
        var id = E.currentTurn(s).team.id;
        var n = s.round.given.length;
        s = E.reduce(s, { type: 'CONFIRM_READY' }, tiny);
        s = E.reduce(s, { type: 'SUBMIT_ANSWER', texts: id === 'a' ? ['pas', 'pas', 'pas'] : ['n' + (n + 1), 'n' + (n + 2), 'n' + (n + 3)] }, tiny);
        while (s.phase === 'REVEAL') {
          s = E.reduce(s, { type: 'REVEAL_DONE' }, tiny);
          s = E.reduce(s, { type: 'NEXT' }, tiny);
        }
      }
      s = E.reduce(s, { type: 'NEXT' }, tiny);            // → ELIMINATION
      s = E.reduce(s, { type: 'NEXT', seed: 2 }, tiny);   // → H2H_INTRO
      s = E.reduce(s, { type: 'NEXT', seed: 3 }, tiny);   // nyt spørgsmål → genbrug
      T.eq(s.phase, 'HANDOFF');
      T.assert(warned >= 1, 'advarsel ved genbrug');
    } finally {
      console.warn = original;
    }
  });

  T.test('ukendt version er ugyldig state', function () {
    var s = E.createInitialState();
    s.version = 99;
    T.assert(!E.isValidState(s));
    T.assert(!E.isValidState(null));
    T.assert(!E.isValidState({ version: 2, phase: 'NOPE', teams: [] }));
  });

  T.test('migrering: gemt spil fra v1 bliver til opsætning med de samme hold', function () {
    var old = {
      version: 1,
      phase: 'ANSWERING',
      teams: [
        { id: 't1', name: 'Hold 1', players: ['Emil', 'Jonas'], roundScore: 40, eliminated: false, h2hWins: 0, passPlayerIdx: [1, 0] },
        { id: 't2', name: 'Hold 2', players: ['Ida'], roundScore: 12, eliminated: true, h2hWins: 0, passPlayerIdx: [0, 0] }
      ],
      usedQuestionIds: ['q1'],
      round: { stage: 'pass1' },
      history: []
    };
    var s = E.migrateState(old);
    T.eq(s.version, E.STATE_VERSION);
    T.eq(s.phase, 'SETUP');
    T.eq(s.teams.map(function (t) { return t.name; }), ['Hold 1', 'Hold 2']);
    T.assert(s.teams.every(function (t) { return t.roundScore === 0 && !t.eliminated && !('passPlayerIdx' in t); }));
    T.assert(E.isValidState(s));
    var current = E.createInitialState();
    T.assert(E.migrateState(current) === current, 'aktuel version røres ikke');
  });
})();
