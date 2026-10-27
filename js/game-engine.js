// Spillogik som ren state machine: reduce(state, action, bank) → newState.
// Ingen DOM og ingen storage. Tilfældighed kommer ind via action.seed, så reduce er deterministisk.
(function (JFM) {
  'use strict';

  var STATE_VERSION = 1;
  var MIN_TEAMS = 2;
  var MAX_TEAMS = 6;
  var MAX_NAME_LENGTH = 24;
  var H2H_WINS_NEEDED = 2;
  var WRONG_SCORE = 100;

  var PHASES = [
    'SETUP', 'INTRO', 'ROUND_INTRO', 'HANDOFF', 'ANSWERING', 'REVEAL',
    'ROUND_SUMMARY', 'TIEBREAK', 'ELIMINATION', 'H2H_INTRO', 'H2H_RESULT', 'WINNER'
  ];

  var MESSAGES = {
    empty: 'Skriv et svar først.',
    ambiguous: 'Vær mere præcis.',
    duplicate: 'Det svar er allerede brugt — prøv igen.'
  };

  // ---------- Hjælpere ----------

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  // Mulberry32: lille deterministisk PRNG ud fra et seed.
  function createRng(seed) {
    var a = (Number(seed) >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rng) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function findTeam(state, teamId) {
    for (var i = 0; i < state.teams.length; i++) {
      if (state.teams[i].id === teamId) return state.teams[i];
    }
    return null;
  }

  function activeTeams(state) {
    return state.teams.filter(function (t) { return !t.eliminated; });
  }

  function findQuestion(bank, questionId) {
    var list = (bank && bank.questions) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === questionId) return list[i];
    }
    return null;
  }

  // Vælger et ubrugt spørgsmål. Er banken tom, genbruges et spørgsmål med en advarsel.
  function pickQuestion(state, bank, rng) {
    var all = (bank && bank.questions) || [];
    if (!all.length) throw new Error('JFM: Spørgsmålsbanken er tom.');
    var unused = all.filter(function (q) { return state.usedQuestionIds.indexOf(q.id) === -1; });
    var pool = unused;
    if (!pool.length) {
      console.warn('JFM: Alle spørgsmål er brugt — genbruger et spørgsmål.');
      var currentId = state.round && state.round.questionId;
      pool = all.length > 1 ? all.filter(function (q) { return q.id !== currentId; }) : all;
    }
    var question = pool[Math.floor(rng() * pool.length)];
    if (state.usedQuestionIds.indexOf(question.id) === -1) state.usedQuestionIds.push(question.id);
    return question.id;
  }

  function defaultPassPlayers(team) {
    return team.players.length > 1 ? [0, 1] : [0, 0];
  }

  function cleanTeam(team) {
    var players = (team.players || [])
      .map(function (p) { return String(p || '').trim(); })
      .filter(Boolean)
      .slice(0, 2);
    var cleaned = {
      id: String(team.id),
      name: String(team.name || '').trim(),
      players: players,
      roundScore: 0,
      eliminated: false,
      h2hWins: 0,
      passPlayerIdx: [0, 0]
    };
    cleaned.passPlayerIdx = defaultPassPlayers(cleaned);
    return cleaned;
  }

  /**
   * Validerer et hold. Returnerer en dansk fejltekst eller null.
   * Bruges både af reduceren og af UI'et, så reglerne kun findes ét sted.
   */
  function validateTeam(teams, team, ignoreId) {
    var name = String((team && team.name) || '').trim();
    var players = ((team && team.players) || [])
      .map(function (p) { return String(p || '').trim(); })
      .filter(Boolean);
    if (!name) return 'Holdet skal have et navn.';
    if (name.length > MAX_NAME_LENGTH) return 'Holdnavnet må højst være ' + MAX_NAME_LENGTH + ' tegn.';
    if (players.length < 1) return 'Holdet skal have mindst én spiller.';
    if (players.length > 2) return 'Et hold kan højst have to spillere.';
    for (var i = 0; i < players.length; i++) {
      if (players[i].length > MAX_NAME_LENGTH) return 'Spillernavne må højst være ' + MAX_NAME_LENGTH + ' tegn.';
    }
    var taken = (teams || []).some(function (t) {
      return t.id !== ignoreId && t.name.trim().toLowerCase() === name.toLowerCase();
    });
    if (taken) return 'Der findes allerede et hold med det navn.';
    return null;
  }

  function createInitialState(teams) {
    return {
      version: STATE_VERSION,
      phase: 'SETUP',
      teams: (teams || []).map(cleanTeam),
      usedQuestionIds: [],
      round: null,
      history: [],
      winnerId: null
    };
  }

  function isValidState(state) {
    return !!state &&
      typeof state === 'object' &&
      state.version === STATE_VERSION &&
      PHASES.indexOf(state.phase) !== -1 &&
      Array.isArray(state.teams) &&
      Array.isArray(state.usedQuestionIds) &&
      Array.isArray(state.history) &&
      (state.phase === 'SETUP' || state.phase === 'INTRO' || !!state.round);
  }

  // ---------- Runder ----------

  function lastEliminationRecord(state) {
    for (var i = state.history.length - 1; i >= 0; i--) {
      if (state.history[i].type === 'elimination') return state.history[i];
    }
    return null;
  }

  function startEliminationRound(state, ctx) {
    var previous = lastEliminationRecord(state);
    var number = state.history.filter(function (h) { return h.type === 'elimination'; }).length + 1;
    var ids = activeTeams(state).map(function (t) { return t.id; });

    var order;
    if (!previous) {
      order = shuffle(ids, ctx.rng);
    } else {
      // Stigende efter point i forrige runde. Ved lige point beholdes forrige rækkefølge.
      var prevOrder = previous.order || [];
      order = ids.slice().sort(function (a, b) {
        var diff = (previous.scores[a] || 0) - (previous.scores[b] || 0);
        return diff !== 0 ? diff : prevOrder.indexOf(a) - prevOrder.indexOf(b);
      });
    }

    state.teams.forEach(function (t) {
      t.roundScore = 0;
      t.passPlayerIdx = defaultPassPlayers(t);
    });

    var questionId = pickQuestion(state, ctx.bank, ctx.rng);
    state.round = {
      type: 'elimination',
      number: number,
      questionId: questionId,
      originalQuestionId: questionId,
      stage: 'pass1',
      pass: 1,
      order: order,
      turns: [],
      turnIdx: 0,
      given: [],
      roundGiven: [],
      pending: null,
      revealDone: false,
      lastFeedback: null,
      tiebreak: null,
      eliminatedId: null
    };
    state.phase = 'ROUND_INTRO';
    return state;
  }

  function beginPass(state, pass) {
    var round = state.round;
    var order = pass === 1 ? round.order.slice() : round.order.slice().reverse();
    round.stage = pass === 1 ? 'pass1' : 'pass2';
    round.pass = pass;
    round.turns = order.map(function (teamId) {
      var team = findTeam(state, teamId);
      return { teamId: teamId, playerIdx: team.passPlayerIdx[pass - 1] };
    });
    round.turnIdx = 0;
    state.phase = 'HANDOFF';
    return state;
  }

  function beginTiebreak(state) {
    var round = state.round;
    round.stage = 'tiebreak';
    round.turns = round.tiebreak.teamIds.map(function (teamId) {
      return { teamId: teamId, playerIdx: null };  // holdet konfererer
    });
    round.turnIdx = 0;
    state.phase = 'HANDOFF';
    return state;
  }

  function eliminate(state, teamId) {
    var round = state.round;
    var team = findTeam(state, teamId);
    team.eliminated = true;
    round.eliminatedId = teamId;
    var scores = {};
    round.order.forEach(function (id) { scores[id] = findTeam(state, id).roundScore; });
    state.history.push({
      type: 'elimination',
      number: round.number,
      questionId: round.originalQuestionId,
      order: round.order.slice(),
      scores: scores,
      tiebreaks: round.tiebreak ? round.tiebreak.attempt : 0,
      eliminatedId: teamId
    });
    state.phase = 'ELIMINATION';
    return state;
  }

  // Finder holdene med højeste værdi i en score-map.
  function highest(teamIds, scoreOf) {
    var max = -Infinity;
    var top = [];
    teamIds.forEach(function (id) {
      var s = scoreOf(id);
      if (s > max) { max = s; top = [id]; }
      else if (s === max) top.push(id);
    });
    return top;
  }

  function resolveRound(state, ctx) {
    var round = state.round;
    var top = highest(round.order, function (id) { return findTeam(state, id).roundScore; });
    if (top.length === 1) return eliminate(state, top[0]);
    round.tiebreak = { teamIds: top, scores: {}, sameQuestion: true, attempt: 1 };
    state.phase = 'TIEBREAK';
    return state;
  }

  function resolveTiebreak(state, ctx) {
    var round = state.round;
    var tb = round.tiebreak;
    var top = highest(tb.teamIds, function (id) { return tb.scores[id]; });
    if (top.length === 1) return eliminate(state, top[0]);
    // Stadig lige: nyt spørgsmål kun mellem de berørte hold, i samme rækkefølge som 1. pas.
    var ordered = round.order.filter(function (id) { return top.indexOf(id) !== -1; });
    round.questionId = pickQuestion(state, ctx.bank, ctx.rng);
    round.given = [];
    round.tiebreak = { teamIds: ordered, scores: {}, sameQuestion: false, attempt: tb.attempt + 1 };
    state.phase = 'TIEBREAK';
    return state;
  }

  // ---------- Head-to-Head ----------

  function startH2H(state, ctx) {
    var ids = activeTeams(state).map(function (t) { return t.id; });
    var previous = lastEliminationRecord(state);
    var order;
    if (previous) {
      // Holdet med færrest point i sidste runde svarer først.
      order = ids.slice().sort(function (a, b) {
        var diff = (previous.scores[a] || 0) - (previous.scores[b] || 0);
        return diff !== 0 ? diff : previous.order.indexOf(a) - previous.order.indexOf(b);
      });
    } else {
      order = shuffle(ids, ctx.rng);
    }
    state.teams.forEach(function (t) { t.h2hWins = 0; t.roundScore = 0; });
    state.round = {
      type: 'h2h',
      number: 0,
      questionId: null,
      stage: 'h2h',
      pass: 1,
      order: order,
      turns: [],
      turnIdx: 0,
      given: [],
      pending: null,
      revealDone: false,
      lastFeedback: null,
      attempt: 1,
      scores: {},
      outcome: null
    };
    state.phase = 'H2H_INTRO';
    return state;
  }

  function startH2HQuestion(state, ctx) {
    var round = state.round;
    round.number += 1;
    // Holdene skiftes til at svare først.
    var first = round.order[(round.number - 1) % 2];
    var second = round.order[round.number % 2];
    round.questionId = pickQuestion(state, ctx.bank, ctx.rng);
    round.given = [];
    round.attempt = 1;
    round.scores = {};
    round.outcome = null;
    round.turns = [{ teamId: first, playerIdx: null }, { teamId: second, playerIdx: null }];
    round.turnIdx = 0;
    state.phase = 'HANDOFF';
    return state;
  }

  function resolveH2HQuestion(state) {
    var round = state.round;
    var a = round.turns[0].teamId;
    var b = round.turns[1].teamId;
    var sa = round.scores[a];
    var sb = round.scores[b];
    if (sa === sb) {
      round.outcome = { tie: true, winnerId: null };
    } else {
      var winnerId = sa < sb ? a : b;
      findTeam(state, winnerId).h2hWins += 1;
      round.outcome = { tie: false, winnerId: winnerId };
    }
    state.phase = 'H2H_RESULT';
    return state;
  }

  function finishGame(state) {
    var winner = state.teams.filter(function (t) { return !t.eliminated && t.h2hWins >= H2H_WINS_NEEDED; })[0];
    state.winnerId = winner.id;
    var wins = {};
    activeTeams(state).forEach(function (t) { wins[t.id] = t.h2hWins; });
    state.history.push({ type: 'h2h', questions: state.round.number, wins: wins, winnerId: winner.id });
    state.phase = 'WINNER';
    return state;
  }

  // Efter et afsluttet svar: næste tur, næste pas eller afslutning af etapen.
  function advanceTurn(state, ctx) {
    var round = state.round;
    round.pending = null;
    round.revealDone = false;
    round.turnIdx += 1;
    if (round.turnIdx < round.turns.length) {
      state.phase = 'HANDOFF';
      return state;
    }
    switch (round.stage) {
      case 'pass1': return beginPass(state, 2);
      case 'pass2':
        round.roundGiven = round.given.slice();
        state.phase = 'ROUND_SUMMARY';
        return state;
      case 'tiebreak': return resolveTiebreak(state, ctx);
      case 'h2h': return resolveH2HQuestion(state);
    }
    return null;
  }

  // ---------- Action-handlere ----------
  // Hver handler får en kopi af state og returnerer ny state, eller null hvis actionen er ugyldig.

  var handlers = {
    ADD_TEAM: function (state, action) {
      if (state.phase !== 'SETUP' || !action.team || !action.team.id) return null;
      if (state.teams.length >= MAX_TEAMS) return null;
      if (findTeam(state, action.team.id)) return null;
      if (validateTeam(state.teams, action.team, null)) return null;
      state.teams.push(cleanTeam(action.team));
      return state;
    },

    EDIT_TEAM: function (state, action) {
      if (state.phase !== 'SETUP' || !action.team) return null;
      var team = findTeam(state, action.team.id);
      if (!team || validateTeam(state.teams, action.team, team.id)) return null;
      var cleaned = cleanTeam(action.team);
      team.name = cleaned.name;
      team.players = cleaned.players;
      team.passPlayerIdx = cleaned.passPlayerIdx;
      return state;
    },

    REMOVE_TEAM: function (state, action) {
      if (state.phase !== 'SETUP' || !findTeam(state, action.teamId)) return null;
      state.teams = state.teams.filter(function (t) { return t.id !== action.teamId; });
      return state;
    },

    START_GAME: function (state) {
      if (state.phase !== 'SETUP' || state.teams.length < MIN_TEAMS) return null;
      var fresh = createInitialState(state.teams);
      fresh.phase = 'INTRO';
      return fresh;
    },

    CHOOSE_PASS_PLAYER: function (state, action) {
      if (state.phase !== 'ROUND_INTRO') return null;
      var team = findTeam(state, action.teamId);
      if (!team || state.round.order.indexOf(team.id) === -1) return null;
      var idx = Number(action.playerIdx);
      if (!(idx >= 0 && idx < team.players.length)) return null;
      team.passPlayerIdx = team.players.length > 1 ? [idx, 1 - idx] : [0, 0];
      return state;
    },

    CONFIRM_READY: function (state) {
      if (state.phase !== 'HANDOFF') return null;
      state.round.lastFeedback = null;
      state.phase = 'ANSWERING';
      return state;
    },

    SUBMIT_ANSWER: function (state, action, ctx) {
      if (state.phase !== 'ANSWERING') return null;
      var round = state.round;
      var turn = round.turns[round.turnIdx];
      if (action.teamId && action.teamId !== turn.teamId) return null;

      var text = String(action.text == null ? '' : action.text).trim();
      if (!text) {
        round.lastFeedback = { type: 'empty', message: MESSAGES.empty };
        return state;
      }

      var question = findQuestion(ctx.bank, round.questionId);
      var givenNames = round.given
        .filter(function (g) { return g.matched; })
        .map(function (g) { return g.matched; });
      var result = JFM.matcher.matchAnswer(text, question, givenNames);

      if (result.status === 'ambiguous' || result.status === 'duplicate') {
        round.lastFeedback = { type: result.status, message: MESSAGES[result.status], input: text };
        return state;
      }

      var team = findTeam(state, turn.teamId);
      var entry = {
        teamId: turn.teamId,
        player: turn.playerIdx == null ? null : team.players[turn.playerIdx],
        input: text,
        matched: result.answer,
        score: result.status === 'correct' ? result.score : WRONG_SCORE,
        status: result.status,
        stage: round.stage
      };
      round.given.push(entry);
      round.pending = entry;
      round.revealDone = false;
      round.lastFeedback = null;
      state.phase = 'REVEAL';
      return state;
    },

    REVEAL_DONE: function (state) {
      if (state.phase !== 'REVEAL' || state.round.revealDone) return null;
      var round = state.round;
      var entry = round.pending;
      if (round.stage === 'pass1' || round.stage === 'pass2') {
        findTeam(state, entry.teamId).roundScore += entry.score;
      } else if (round.stage === 'tiebreak') {
        round.tiebreak.scores[entry.teamId] = entry.score;
      } else if (round.stage === 'h2h') {
        round.scores[entry.teamId] = entry.score;
      }
      round.revealDone = true;
      return state;
    },

    NEXT: function (state, action, ctx) {
      switch (state.phase) {
        case 'INTRO':
          return activeTeams(state).length > 2 ? startEliminationRound(state, ctx) : startH2H(state, ctx);
        case 'ROUND_INTRO':
          return beginPass(state, 1);
        case 'REVEAL':
          return state.round.revealDone ? advanceTurn(state, ctx) : null;
        case 'ROUND_SUMMARY':
          return resolveRound(state, ctx);
        case 'TIEBREAK':
          return beginTiebreak(state);
        case 'ELIMINATION':
          return activeTeams(state).length > 2 ? startEliminationRound(state, ctx) : startH2H(state, ctx);
        case 'H2H_INTRO':
          return startH2HQuestion(state, ctx);
        case 'H2H_RESULT':
          if (activeTeams(state).some(function (t) { return t.h2hWins >= H2H_WINS_NEEDED; })) {
            return finishGame(state);
          }
          if (state.round.outcome && state.round.outcome.tie) {
            // Lige: begge hold svarer igen på samme spørgsmål.
            state.round.attempt += 1;
            state.round.scores = {};
            state.round.outcome = null;
            state.round.turnIdx = 0;
            state.phase = 'HANDOFF';
            return state;
          }
          return startH2HQuestion(state, ctx);
      }
      return null;
    },

    // Afslutter (eller afbryder) et spil og går tilbage til opsætning med de samme hold.
    NEW_GAME: function (state) {
      return createInitialState(state.teams);
    }
  };

  /**
   * Ren reducer. Returnerer samme objekt, hvis actionen ikke ændrer noget.
   * @param {object} state
   * @param {{type: string, seed?: number}} action
   * @param {{questions: object[]}} bank - spørgsmålsbanken
   */
  function reduce(state, action, bank) {
    if (!action || !handlers.hasOwnProperty(action.type)) return state;
    var ctx = { bank: bank, rng: createRng(action.seed) };
    var next = handlers[action.type](clone(state), action, ctx);
    return next || state;
  }

  // ---------- Selectors (bruges af UI) ----------

  function currentTurn(state) {
    var round = state.round;
    if (!round || !round.turns || !round.turns[round.turnIdx]) return null;
    var turn = round.turns[round.turnIdx];
    var team = findTeam(state, turn.teamId);
    return {
      team: team,
      playerName: turn.playerIdx == null ? null : team.players[turn.playerIdx]
    };
  }

  function canStart(state) {
    return state.phase === 'SETUP' && state.teams.length >= MIN_TEAMS;
  }

  function isInProgress(state) {
    return !!state && state.phase !== 'SETUP';
  }

  JFM.engine = {
    STATE_VERSION: STATE_VERSION,
    MIN_TEAMS: MIN_TEAMS,
    MAX_TEAMS: MAX_TEAMS,
    MAX_NAME_LENGTH: MAX_NAME_LENGTH,
    H2H_WINS_NEEDED: H2H_WINS_NEEDED,
    PHASES: PHASES,
    reduce: reduce,
    createInitialState: createInitialState,
    isValidState: isValidState,
    validateTeam: validateTeam,
    findTeam: findTeam,
    findQuestion: findQuestion,
    activeTeams: activeTeams,
    currentTurn: currentTurn,
    canStart: canStart,
    isInProgress: isInProgress
  };
})(window.JFM = window.JFM || {});
