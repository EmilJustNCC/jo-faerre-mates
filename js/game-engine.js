// Spillogik som ren state machine: reduce(state, action, bank) → newState.
// Ingen DOM og ingen storage. Tilfældighed kommer ind via action.seed, så reduce er deterministisk.
(function (JFM) {
  'use strict';

  // v2: 3 svar pr. hold i eliminationsrunder (erstatter 1. og 2. pas).
  var STATE_VERSION = 2;
  var MIN_TEAMS = 2;
  var MAX_TEAMS = 6;
  var MAX_NAME_LENGTH = 24;
  var H2H_WINS_NEEDED = 2;
  var WRONG_SCORE = 100;
  var ANSWERS_PER_TURN = 3;   // eliminationsrunder; omspil og Head-to-Head har 1 svar
  var PASS_WORD = 'pas';      // giver samme point som et forkert svar

  var PHASES = [
    'SETUP', 'INTRO', 'ROUND_INTRO', 'HANDOFF', 'ANSWERING', 'REVEAL',
    'ROUND_SUMMARY', 'TIEBREAK', 'ELIMINATION', 'H2H_INTRO', 'H2H_RESULT', 'WINNER'
  ];

  var MESSAGES = {
    empty: 'Skriv et svar — eller “pas” for 100 point.',
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

  function cleanTeam(team) {
    var players = (team.players || [])
      .map(function (p) { return String(p || '').trim(); })
      .filter(Boolean)
      .slice(0, 2);
    return {
      id: String(team.id),
      name: String(team.name || '').trim(),
      players: players,
      roundScore: 0,
      eliminated: false,
      h2hWins: 0
    };
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

  // Gemte spil fra ældre versioner: reglerne er ændret, så et igangværende spil kan ikke fortsættes,
  // men holdene bevares. Ukendte versioner returneres uændret (og afvises af isValidState).
  function migrateState(state) {
    if (state && state.version === 1 && Array.isArray(state.teams)) {
      return createInitialState(state.teams);
    }
    return state;
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

    state.teams.forEach(function (t) { t.roundScore = 0; });

    var questionId = pickQuestion(state, ctx.bank, ctx.rng);
    state.round = {
      type: 'elimination',
      number: number,
      questionId: questionId,
      originalQuestionId: questionId,
      stage: 'main',
      order: order,
      turns: [],
      turnIdx: 0,
      given: [],
      roundGiven: [],
      pending: null,
      revealIdx: 0,
      revealDone: false,
      lastFeedback: null,
      tiebreak: null,
      eliminatedId: null
    };
    state.phase = 'ROUND_INTRO';
    return state;
  }

  // Én tur pr. hold med 3 svar. Holdet konfererer, så der er ingen bestemt spiller.
  function beginMainTurns(state) {
    var round = state.round;
    round.stage = 'main';
    round.turns = round.order.map(function (teamId) {
      return { teamId: teamId, playerIdx: null, slots: ANSWERS_PER_TURN };
    });
    round.turnIdx = 0;
    state.phase = 'HANDOFF';
    return state;
  }

  function beginTiebreak(state) {
    var round = state.round;
    round.stage = 'tiebreak';
    round.turns = round.tiebreak.teamIds.map(function (teamId) {
      return { teamId: teamId, playerIdx: null, slots: 1 };  // holdet konfererer
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
      order: order,
      turns: [],
      turnIdx: 0,
      given: [],
      pending: null,
      revealIdx: 0,
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
    round.turns = [{ teamId: first, playerIdx: null, slots: 1 }, { teamId: second, playerIdx: null, slots: 1 }];
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
    round.revealIdx = 0;
    round.revealDone = false;
    round.turnIdx += 1;
    if (round.turnIdx < round.turns.length) {
      state.phase = 'HANDOFF';
      return state;
    }
    switch (round.stage) {
      case 'main':
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

    CONFIRM_READY: function (state) {
      if (state.phase !== 'HANDOFF') return null;
      state.round.lastFeedback = null;
      state.phase = 'ANSWERING';
      return state;
    },

    // action.texts: ét svar pr. felt i turen (3 i eliminationsrunder, 1 i omspil/H2H).
    // action.text accepteres også ved ture med ét felt.
    // Er ét felt tomt, tvetydigt eller en dublet, afvises hele turen, og felterne bevares i lastFeedback.inputs.
    SUBMIT_ANSWER: function (state, action, ctx) {
      if (state.phase !== 'ANSWERING') return null;
      var round = state.round;
      var turn = round.turns[round.turnIdx];
      if (action.teamId && action.teamId !== turn.teamId) return null;

      var slots = turn.slots || 1;
      var raw = Array.isArray(action.texts) ? action.texts : [action.text];
      if (raw.length !== slots) return null;
      var texts = raw.map(function (t) { return String(t == null ? '' : t).trim(); });

      var question = findQuestion(ctx.bank, round.questionId);
      var usedNames = round.given
        .filter(function (g) { return g.matched; })
        .map(function (g) { return g.matched; });
      var team = findTeam(state, turn.teamId);
      var player = turn.playerIdx == null ? null : team.players[turn.playerIdx];
      var entries = [];

      for (var i = 0; i < texts.length; i++) {
        var text = texts[i];
        var problem = null;
        var outcome = null;
        if (!text) {
          problem = 'empty';
        } else if (JFM.matcher.normalize(text) === PASS_WORD) {
          outcome = { status: 'pass', answer: null, score: WRONG_SCORE };
        } else {
          // usedNames indeholder også turens egne tidligere felter, så holdet ikke kan bruge samme svar to gange.
          var result = JFM.matcher.matchAnswer(text, question, usedNames);
          if (result.status === 'ambiguous' || result.status === 'duplicate') problem = result.status;
          else outcome = { status: result.status, answer: result.answer, score: result.status === 'correct' ? result.score : WRONG_SCORE };
        }
        if (problem) {
          round.lastFeedback = {
            type: problem,
            field: i,
            message: (slots > 1 ? 'Svar ' + (i + 1) + ': ' : '') + MESSAGES[problem],
            inputs: texts
          };
          return state;
        }
        if (outcome.answer) usedNames.push(outcome.answer);
        entries.push({
          teamId: turn.teamId,
          player: player,
          input: text,
          matched: outcome.answer,
          score: outcome.score,
          status: outcome.status,
          stage: round.stage
        });
      }

      round.given = round.given.concat(entries);
      round.pending = { teamId: turn.teamId, player: player, entries: entries };
      round.revealIdx = 0;
      round.revealDone = false;
      round.lastFeedback = null;
      state.phase = 'REVEAL';
      return state;
    },

    // Afslører ét svar ad gangen (round.revealIdx) og lægger dets point til.
    REVEAL_DONE: function (state) {
      if (state.phase !== 'REVEAL' || state.round.revealDone) return null;
      var round = state.round;
      var entry = round.pending.entries[round.revealIdx];
      if (round.stage === 'main') {
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
          return beginMainTurns(state);
        case 'REVEAL':
          if (!state.round.revealDone) return null;
          if (state.round.revealIdx + 1 < state.round.pending.entries.length) {
            state.round.revealIdx += 1;   // næste af holdets svar
            state.round.revealDone = false;
            return state;
          }
          return advanceTurn(state, ctx);
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
      playerName: turn.playerIdx == null ? null : team.players[turn.playerIdx],
      slots: turn.slots || 1
    };
  }

  // Svaret, der afsløres lige nu (REVEAL).
  function currentReveal(state) {
    var r = state.round;
    if (!r || !r.pending) return null;
    return { entry: r.pending.entries[r.revealIdx], index: r.revealIdx, total: r.pending.entries.length };
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
    ANSWERS_PER_TURN: ANSWERS_PER_TURN,
    PASS_WORD: PASS_WORD,
    PHASES: PHASES,
    reduce: reduce,
    createInitialState: createInitialState,
    migrateState: migrateState,
    isValidState: isValidState,
    validateTeam: validateTeam,
    findTeam: findTeam,
    findQuestion: findQuestion,
    activeTeams: activeTeams,
    currentTurn: currentTurn,
    currentReveal: currentReveal,
    canStart: canStart,
    isInProgress: isInProgress
  };
})(window.JFM = window.JFM || {});
