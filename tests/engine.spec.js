// Tests af game-engine.js: 2 svar pr. hold pr. spørgsmål på skift, samlet score, spillet slutter ved 1000 point.
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

  // Et ubrugt svarnavn med den ønskede score i det aktuelle spørgsmål.
  function textFor(state, score) {
    if (score === WRONG) return 'zzzzzzzz';
    if (score === PASS) return 'pas';
    var used = state.round.given.map(function (g) { return g.matched; });
    var name = used.indexOf('n' + score) === -1 ? 'n' + score : 'm' + score;
    T.assert(used.indexOf(name) === -1, 'testen mangler et ubrugt svar med score ' + score);
    return name;
  }

  // Én tur: overlevering → svar → afslør → videre.
  function playTurn(state, score) {
    T.eq(state.phase, 'HANDOFF', 'før tur');
    state = d(state, { type: 'CONFIRM_READY' });
    state = d(state, { type: 'SUBMIT_ANSWER', texts: [textFor(state, score)] });
    T.eq(state.phase, 'REVEAL', 'svar accepteret');
    while (state.phase === 'REVEAL') state = d(d(state, { type: 'REVEAL_DONE' }), { type: 'NEXT' });
    return state;
  }

  // Spiller et helt spørgsmål; scoresByTeam = { teamId: [svar1, svar2] }. Slutter i ROUND_SUMMARY.
  function playQuestion(state, scoresByTeam) {
    if (state.phase === 'ROUND_INTRO') state = d(state, { type: 'NEXT' });
    var queues = {};
    Object.keys(scoresByTeam).forEach(function (k) { queues[k] = scoresByTeam[k].slice(); });
    while (state.phase === 'HANDOFF') {
      var id = E.currentTurn(state).team.id;
      T.assert(queues[id] && queues[id].length, 'mangler svar til ' + id);
      state = playTurn(state, queues[id].shift());
    }
    T.eq(state.phase, 'ROUND_SUMMARY');
    return state;
  }

  function setupTeams(n) {
    var s = E.createInitialState();
    var defs = [
      { id: 't1', name: 'Hold 1', players: ['Emil', 'Jonas'] },
      { id: 't2', name: 'Hold 2', players: ['Ida'] },
      { id: 't3', name: 'Hold 3', players: ['Anna', 'Bo'] }
    ];
    for (var i = 0; i < n; i++) s = d(s, { type: 'ADD_TEAM', team: defs[i] });
    return s;
  }

  // Spil startet og frem til første spørgsmåls intro.
  function started(n) {
    return d(d(setupTeams(n), { type: 'START_GAME' }), { type: 'NEXT' });
  }

  function team(state, id) { return E.findTeam(state, id); }

  function quietly(fn) {
    var original = console.warn;
    console.warn = function () {};
    try { return fn(); } finally { console.warn = original; }
  }

  T.test('opsætning: tilføj, redigér og slet hold', function () {
    var s = setupTeams(2);
    T.eq(s.teams.length, 2);
    T.eq(s.teams[0].totalScore, 0);
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

  T.test('spørgsmål: hvert hold svarer 2 gange, ét svar ad gangen på skift', function () {
    var s = started(3);
    T.eq(s.phase, 'ROUND_INTRO');
    T.eq(s.round.number, 1);
    var o = s.round.order;
    T.eq(s.round.turns.map(function (t) { return t.teamId; }), [o[0], o[1], o[2], o[0], o[1], o[2]]);
    T.assert(s.round.turns.every(function (t) { return t.slots === 1; }), 'ét felt pr. tur');
    s = d(s, { type: 'NEXT' });
    T.eq(E.currentTurn(s).answerNumber, 1);
    T.eq(E.currentTurn(s).playerName, null, 'holdet konfererer');
    s = playTurn(playTurn(playTurn(s, 1), 2), 3);
    T.eq(E.currentTurn(s).team.id, o[0], 'tilbage til første hold');
    T.eq(E.currentTurn(s).answerNumber, 2);
  });

  T.test('2 hold: A, B, A, B', function () {
    var s = started(2);
    var o = s.round.order;
    T.eq(s.round.turns.map(function (t) { return t.teamId; }), [o[0], o[1], o[0], o[1]]);
  });

  T.test('svar: forkert antal felter, tomt, dublet og "pas"', function () {
    var s = d(d(started(2), { type: 'NEXT' }), { type: 'CONFIRM_READY' });
    T.assert(d(s, { type: 'SUBMIT_ANSWER', texts: ['n1', 'n2'] }) === s, 'to felter afvises');

    var r = d(s, { type: 'SUBMIT_ANSWER', texts: ['  '] });
    T.eq(r.phase, 'ANSWERING');
    T.eq(r.round.lastFeedback.message, 'Skriv et svar — eller “pas” for 100 point.', 'ingen "Svar 1:" ved ét felt');

    r = d(s, { type: 'SUBMIT_ANSWER', text: 'PAS' });
    T.eq(r.round.pending.entries[0].status, 'pass');
    T.eq(r.round.pending.entries[0].score, 100);

    s = d(s, { type: 'SUBMIT_ANSWER', texts: ['n10'] });
    s = d(d(s, { type: 'REVEAL_DONE' }), { type: 'NEXT' });
    s = d(s, { type: 'CONFIRM_READY' });
    r = d(s, { type: 'SUBMIT_ANSWER', texts: ['n10'] });
    T.eq(r.round.lastFeedback.type, 'duplicate');
    T.eq(r.round.lastFeedback.message, 'Det svar er allerede brugt — prøv igen.');
  });

  T.test('point lægges til spørgsmålets og den samlede score ved REVEAL_DONE (én gang)', function () {
    var s = d(d(started(2), { type: 'NEXT' }), { type: 'CONFIRM_READY' });
    var id = E.currentTurn(s).team.id;
    s = d(s, { type: 'SUBMIT_ANSWER', texts: ['n42'] });
    T.eq(team(s, id).totalScore, 0);
    T.assert(d(s, { type: 'NEXT' }) === s, 'NEXT kræver at reveal er færdig');
    s = d(s, { type: 'REVEAL_DONE' });
    T.eq(team(s, id).questionScore, 42);
    T.eq(team(s, id).totalScore, 42);
    T.assert(d(s, { type: 'REVEAL_DONE' }) === s, 'REVEAL_DONE er idempotent');
  });

  T.test('point akkumuleres over spørgsmål; startholdet roterer', function () {
    var s = started(2);
    var o1 = s.round.order.slice();
    var q1 = s.round.questionId;
    s = playQuestion(s, { t1: [10, 20], t2: [PASS, 5] });
    T.eq([team(s, 't1').questionScore, team(s, 't2').questionScore], [30, 105]);
    T.eq([team(s, 't1').totalScore, team(s, 't2').totalScore], [30, 105]);

    s = d(s, { type: 'NEXT' });
    T.eq(s.phase, 'ROUND_INTRO', 'ingen har 1000 → næste spørgsmål');
    T.eq(s.round.number, 2);
    T.assert(s.round.questionId !== q1, 'nyt spørgsmål');
    T.eq(s.round.order, [o1[1], o1[0]], 'det andet hold starter nu');
    T.eq(team(s, 't1').questionScore, 0, 'spørgsmålsscore nulstilles');
    T.eq(team(s, 't1').totalScore, 30, 'samlet score bevares');
    T.eq(s.history.length, 1);
    T.eq(s.history[0].scores, { t1: 30, t2: 105 });

    s = playQuestion(s, { t1: [WRONG, 0], t2: [1, 2] });
    T.eq([team(s, 't1').totalScore, team(s, 't2').totalScore], [130, 108]);
  });

  T.test('spillet slutter først når spørgsmålet er færdigt; flest point taber, færrest vinder', function () {
    quietly(function () {
      // Find et seed hvor t1 starter. Med 2 hold roterer startholdet tilbage efter 4 spørgsmål,
      // så t1 starter også spørgsmål 5 og når 1000 med en tur tilbage til t2.
      var s;
      for (var tries = 0; tries < 50; tries++) {
        s = started(2);
        if (s.round.order[0] === 't1') break;
      }
      T.eq(s.round.order[0], 't1');
      // t1 passer alt (200 pr. spørgsmål), t2 svarer 0 → efter 5 spørgsmål har t1 1000
      for (var q = 1; q <= 4; q++) {
        s = d(playQuestion(s, { t1: [PASS, PASS], t2: [0, 0] }), { type: 'NEXT' });
        T.eq(s.phase, 'ROUND_INTRO', 'spørgsmål ' + q + ': spillet fortsætter');
      }
      T.eq(team(s, 't1').totalScore, 800);
      s = d(s, { type: 'NEXT' });
      // Spil til t1 har 1000, men t2 har stadig en tur tilbage
      var guard = 0;
      while (team(s, 't1').totalScore < 1000 && guard++ < 10) {
        s = playTurn(s, E.currentTurn(s).team.id === 't1' ? PASS : 0);
      }
      T.eq(team(s, 't1').totalScore, 1000);
      T.eq(s.phase, 'HANDOFF', 'spørgsmålet spilles færdigt');
      while (s.phase === 'HANDOFF') s = playTurn(s, E.currentTurn(s).team.id === 't1' ? PASS : 0);
      T.eq(s.phase, 'ROUND_SUMMARY');
      s = d(s, { type: 'NEXT' });
      T.eq(s.phase, 'GAME_OVER');
      T.eq(s.result.loserIds, ['t1']);
      T.eq(s.result.winnerIds, ['t2']);
      T.eq(s.result.questions, 5);
      T.eq(E.standings(s).map(function (t) { return t.id; }), ['t2', 't1']);
    });
  });

  T.test('slutresultat: lige point deler taber- og vinderpladsen', function () {
    quietly(function () {
      var s = started(3);
      for (var q = 0; q < 5; q++) {
        s = playQuestion(s, { t1: [PASS, PASS], t2: [PASS, PASS], t3: [0, 0] });
        s = d(s, { type: 'NEXT' });
      }
      T.eq(s.phase, 'GAME_OVER');
      T.eq(s.result.loserIds.slice().sort(), ['t1', 't2']);
      T.eq(s.result.winnerIds, ['t3']);
    });
  });

  T.test('nyt spil beholder holdene og nulstiller point', function () {
    var s = playQuestion(started(2), { t1: [10, 20], t2: [30, 40] });
    s = d(s, { type: 'NEW_GAME' });
    T.eq(s.phase, 'SETUP');
    T.eq(s.teams.length, 2);
    T.assert(s.teams.every(function (t) { return t.totalScore === 0 && t.questionScore === 0; }));
  });

  T.test('state er ren JSON og reduceren er deterministisk', function () {
    function playSome(startSeed) {
      seed = startSeed;
      return playTurn(d(started(3), { type: 'NEXT' }), 7);
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
      ['a', 'b'].forEach(function (id) {
        s = E.reduce(s, { type: 'ADD_TEAM', team: { id: id, name: id, players: ['P'] } }, tiny);
      });
      s = E.reduce(E.reduce(s, { type: 'START_GAME' }, tiny), { type: 'NEXT', seed: 1 }, tiny);
      T.eq(warned, 0);
      s = E.reduce(s, { type: 'NEXT' }, tiny);
      while (s.phase === 'HANDOFF') {
        s = E.reduce(s, { type: 'CONFIRM_READY' }, tiny);
        s = E.reduce(s, { type: 'SUBMIT_ANSWER', texts: ['pas'] }, tiny);
        s = E.reduce(E.reduce(s, { type: 'REVEAL_DONE' }, tiny), { type: 'NEXT' }, tiny);
      }
      s = E.reduce(s, { type: 'NEXT', seed: 2 }, tiny);
      T.eq(s.phase, 'ROUND_INTRO');
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
    T.assert(!E.isValidState({ version: E.STATE_VERSION, phase: 'NOPE', teams: [] }));
  });

  T.test('migrering: gemte spil fra v1 og v2 bliver til opsætning med de samme hold', function () {
    [1, 2].forEach(function (v) {
      var old = {
        version: v,
        phase: 'ANSWERING',
        teams: [
          { id: 't1', name: 'Hold 1', players: ['Emil', 'Jonas'], roundScore: 40, eliminated: false, h2hWins: 0 },
          { id: 't2', name: 'Hold 2', players: ['Ida'], roundScore: 12, eliminated: true, h2hWins: 1 }
        ],
        usedQuestionIds: ['q1'],
        round: { stage: 'main' },
        history: []
      };
      var s = E.migrateState(old);
      T.eq(s.version, E.STATE_VERSION);
      T.eq(s.phase, 'SETUP');
      T.eq(s.teams.map(function (t) { return t.name; }), ['Hold 1', 'Hold 2']);
      T.assert(s.teams.every(function (t) { return t.totalScore === 0 && !('eliminated' in t); }));
      T.assert(E.isValidState(s));
    });
    var current = E.createInitialState();
    T.assert(E.migrateState(current) === current, 'aktuel version røres ikke');
  });
})();
