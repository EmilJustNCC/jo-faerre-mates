// Tests af game-engine.js. Simulerer et helt spil med 4 hold inkl. uafgjort, omspil og Head-to-Head.
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

  var seed = 1;
  function d(state, action) {
    if (action.seed == null) action.seed = seed++;
    return E.reduce(state, action, bank);
  }

  // Finder et ubrugt svarnavn med den ønskede score i det aktuelle spørgsmål.
  function textFor(state, score) {
    if (score === WRONG) return 'zzzzzzzz';
    var used = state.round.given.map(function (g) { return g.matched; });
    return used.indexOf('n' + score) === -1 ? 'n' + score : 'm' + score;
  }

  function playOne(state, score) {
    T.eq(state.phase, 'HANDOFF', 'før tur');
    state = d(state, { type: 'CONFIRM_READY' });
    T.eq(state.phase, 'ANSWERING');
    state = d(state, { type: 'SUBMIT_ANSWER', text: textFor(state, score) });
    T.eq(state.phase, 'REVEAL');
    state = d(state, { type: 'REVEAL_DONE' });
    return d(state, { type: 'NEXT' });
  }

  // Spiller ture så længe der er overlevering; scoresByTeam = { teamId: [score, score, ...] }.
  function playTurns(state, scoresByTeam) {
    while (state.phase === 'HANDOFF') {
      var teamId = E.currentTurn(state).team.id;
      var queue = scoresByTeam[teamId];
      T.assert(queue && queue.length, 'mangler score til ' + teamId);
      state = playOne(state, queue.shift());
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

  function team(state, id) { return E.findTeam(state, id); }

  T.test('opsætning: tilføj, redigér og slet hold', function () {
    var s = setupTeams(2);
    T.eq(s.teams.length, 2);
    T.eq(s.teams[0].passPlayerIdx, [0, 1]);
    T.eq(s.teams[1].passPlayerIdx, [0, 0], '1-mandshold tager begge pas');

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

  T.test('svarskærm: tomt, tvetydigt og dublet afvises uden at tælle', function () {
    var s = setupTeams(3);
    s = d(s, { type: 'START_GAME' });
    s = d(s, { type: 'NEXT' });
    s = d(s, { type: 'NEXT' });
    s = playOne(s, 10);                  // første hold svarer n10
    s = d(s, { type: 'CONFIRM_READY' });

    s = d(s, { type: 'SUBMIT_ANSWER', text: '  ' });
    T.eq(s.phase, 'ANSWERING');
    T.eq(s.round.lastFeedback.type, 'empty');

    s = d(s, { type: 'SUBMIT_ANSWER', text: 'n10' });
    T.eq(s.phase, 'ANSWERING');
    T.eq(s.round.lastFeedback.type, 'duplicate');
    T.eq(s.round.lastFeedback.message, 'Det svar er allerede brugt — prøv igen.');

    s = d(s, { type: 'SUBMIT_ANSWER', text: 'zzzzzzzz' });
    T.eq(s.phase, 'REVEAL');
    T.eq(s.round.pending.score, 100, 'forkert = 100');
    T.eq(s.round.pending.status, 'wrong');
  });

  T.test('score lægges til ved REVEAL_DONE (én gang)', function () {
    var s = setupTeams(3);
    s = d(d(d(s, { type: 'START_GAME' }), { type: 'NEXT' }), { type: 'NEXT' });
    var id = E.currentTurn(s).team.id;
    s = d(s, { type: 'CONFIRM_READY' });
    s = d(s, { type: 'SUBMIT_ANSWER', text: 'n42' });
    T.eq(team(s, id).roundScore, 0);
    T.assert(d(s, { type: 'NEXT' }) === s, 'NEXT kræver at reveal er færdig');
    s = d(s, { type: 'REVEAL_DONE' });
    T.eq(team(s, id).roundScore, 42);
    T.assert(d(s, { type: 'REVEAL_DONE' }) === s, 'REVEAL_DONE er idempotent');
  });

  T.test('fuldt spil: 4 hold, uafgjort, omspil, nyt spørgsmål, H2H og vinder', function () {
    var s = setupTeams(4);
    s = d(s, { type: 'START_GAME' });
    s = d(s, { type: 'NEXT' });
    T.eq(s.phase, 'ROUND_INTRO');
    T.eq(s.round.number, 1);
    T.eq(s.round.order.slice().sort(), ['t1', 't2', 't3', 't4']);

    // Hold 1 lader spiller 2 (Jonas) tage 1. pas
    s = d(s, { type: 'CHOOSE_PASS_PLAYER', teamId: 't1', playerIdx: 1 });
    T.eq(team(s, 't1').passPlayerIdx, [1, 0]);
    var order1 = s.round.order.slice();

    s = d(s, { type: 'NEXT' });
    T.eq(s.phase, 'HANDOFF');
    T.eq(E.currentTurn(s).team.id, order1[0]);

    // 1. pas
    var firstPassPlayers = {};
    while (s.round.stage === 'pass1') {
      var turn = E.currentTurn(s);
      firstPassPlayers[turn.team.id] = turn.playerName;
      s = playOne(s, { t1: 10, t2: 30, t3: 50, t4: WRONG }[turn.team.id]);
    }
    T.eq(firstPassPlayers.t1, 'Jonas');
    T.eq(firstPassPlayers.t2, 'Ida');

    // 2. pas: omvendt rækkefølge, og den anden spiller
    T.eq(s.round.stage, 'pass2');
    T.eq(E.currentTurn(s).team.id, order1[3], '2. pas starter med sidste hold fra 1. pas');
    var secondPassPlayers = {};
    while (s.phase === 'HANDOFF') {
      var turn2 = E.currentTurn(s);
      secondPassPlayers[turn2.team.id] = turn2.playerName;
      s = playOne(s, { t1: 10, t2: 40, t3: 20, t4: 0 }[turn2.team.id]);
    }
    T.eq(secondPassPlayers.t1, 'Emil');
    T.eq(secondPassPlayers.t2, 'Ida', '1-mandshold tager begge pas');

    // t1=20, t2=70, t3=70, t4=100 → t4 skal ud? Nej: t4 har 100 og er alene højest.
    T.eq(s.phase, 'ROUND_SUMMARY');
    T.eq([team(s, 't1').roundScore, team(s, 't2').roundScore, team(s, 't3').roundScore, team(s, 't4').roundScore], [20, 70, 70, 100]);
    s = d(s, { type: 'NEXT' });
    T.eq(s.phase, 'ELIMINATION');
    T.eq(s.round.eliminatedId, 't4');
    T.assert(team(s, 't4').eliminated);

    // Runde 2: stigende efter point i runde 1 (t1=20, t2=70, t3=70 → lige mellem t2/t3 afgøres af forrige rækkefølge)
    s = d(s, { type: 'NEXT' });
    T.eq(s.phase, 'ROUND_INTRO');
    T.eq(s.round.number, 2);
    T.eq(s.round.order[0], 't1');
    T.eq(s.round.order.slice(1), order1.filter(function (id) { return id === 't2' || id === 't3'; }));
    T.eq(team(s, 't1').roundScore, 0, 'point nulstilles mellem runder');
    T.eq(team(s, 't1').passPlayerIdx, [0, 1], 'spillervalg nulstilles');
    var order2 = s.round.order.slice();
    var q2 = s.round.questionId;

    s = d(s, { type: 'NEXT' });
    s = playTurns(s, { t1: [5, 5], t2: [30, 30], t3: [40, 20] });
    // t1=10, t2=60, t3=60 → uafgjort mellem t2 og t3
    T.eq(s.phase, 'ROUND_SUMMARY');
    s = d(s, { type: 'NEXT' });
    T.eq(s.phase, 'TIEBREAK');
    T.eq(s.round.tiebreak.sameQuestion, true);
    T.eq(s.round.tiebreak.teamIds, order2.filter(function (id) { return id !== 't1'; }), 'samme rækkefølge som 1. pas');

    // Omspil på samme spørgsmål: begge 15 → stadig lige
    s = d(s, { type: 'NEXT' });
    T.eq(s.phase, 'HANDOFF');
    T.eq(E.currentTurn(s).playerName, null, 'holdet konfererer');
    s = playTurns(s, { t2: [15], t3: [15] });
    T.eq(s.phase, 'TIEBREAK');
    T.eq(s.round.tiebreak.sameQuestion, false);
    T.assert(s.round.questionId !== q2, 'nyt spørgsmål');
    T.eq(s.round.given, [], 'nyt spørgsmål har ingen givne svar');

    // Nyt spørgsmål: t3 svarer forkert → t3 ud
    s = d(s, { type: 'NEXT' });
    s = playTurns(s, { t2: [5], t3: [WRONG] });
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

    // Spørgsmål 3: t1 forkert, t2 50 → t2 vinder 2-1
    s = d(s, { type: 'NEXT' });
    s = playTurns(s, { t1: [WRONG], t2: [50] });
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
      var s = setupTeams(4);
      s = d(d(d(s, { type: 'START_GAME' }), { type: 'NEXT' }), { type: 'NEXT' });
      return playOne(s, 7);
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
      // Spil runden igennem med forkerte svar til ét hold, så det ryger ud
      s = E.reduce(s, { type: 'NEXT' }, tiny);
      while (s.phase === 'HANDOFF') {
        var id = E.currentTurn(s).team.id;
        s = E.reduce(s, { type: 'CONFIRM_READY' }, tiny);
        s = E.reduce(s, { type: 'SUBMIT_ANSWER', text: id === 'a' ? 'zzzzzzzz' : 'n' + (s.round.given.length + 1) }, tiny);
        s = E.reduce(s, { type: 'REVEAL_DONE' }, tiny);
        s = E.reduce(s, { type: 'NEXT' }, tiny);
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
    T.assert(!E.isValidState({ version: 1, phase: 'NOPE', teams: [] }));
  });
})();
