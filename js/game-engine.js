// Spillogik som ren state machine: reduce(state, action, bank) → newState.
// Ingen DOM og ingen storage. Tilfældighed kommer ind via action.seed, så reduce er deterministisk.
//
// Spilforløb (v3): spørgsmål efter spørgsmål. Pr. spørgsmål giver hvert hold ANSWERS_PER_TEAM svar,
// ét ad gangen og på skift (A, B, A, B …). Point lægges til holdets samlede score.
// Når et spørgsmål er færdigt og mindst ét hold har nået TARGET_SCORE, slutter spillet:
// holdet med flest point taber, holdet med færrest vinder.
(function (JFM) {
  'use strict';

  var STATE_VERSION = 3;
  var MIN_TEAMS = 2;
  var MAX_TEAMS = 6;
  var MAX_NAME_LENGTH = 24;
  var WRONG_SCORE = 100;
  var TARGET_SCORE = 1000;    // første hold hertil taber
  var ANSWERS_PER_TEAM = 2;   // svar pr. hold pr. spørgsmål, givet på skift
  var ANSWERS_PER_TURN = 1;   // felter pr. tur (motoren understøtter flere)
  var PASS_WORD = 'pas';      // giver samme point som et forkert svar

  var PHASES = [
    'SETUP', 'INTRO', 'ROUND_INTRO', 'HANDOFF', 'ANSWERING', 'REVEAL', 'ROUND_SUMMARY', 'GAME_OVER'
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
      totalScore: 0,      // samlet for hele spillet
      questionScore: 0    // for det aktuelle spørgsmål
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
      result: null
    };
  }

  // Gemte spil fra ældre versioner: reglerne er ændret, så et igangværende spil kan ikke fortsættes,
  // men holdene bevares. Ukendte versioner returneres uændret (og afvises af isValidState).
  function migrateState(state) {
    if (state && (state.version === 1 || state.version === 2) && Array.isArray(state.teams)) {
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

  // Hold sorteret efter samlet score (færrest først). Lige point: oprettelsesrækkefølge.
  function standings(state) {
    return state.teams.slice().sort(function (a, b) {
      return a.totalScore - b.totalScore || state.teams.indexOf(a) - state.teams.indexOf(b);
    });
  }

  // ---------- Spørgsmål ----------

  function startQuestion(state, ctx) {
    var previous = state.round;
    var ids = state.teams.map(function (t) { return t.id; });
    // Første spørgsmål: lodtrækning. Derefter roterer det hold, der starter.
    var order = previous ? previous.order.slice(1).concat(previous.order[0]) : shuffle(ids, ctx.rng);

    state.teams.forEach(function (t) { t.questionScore = 0; });
    var questionId = pickQuestion(state, ctx.bank, ctx.rng);

    // Holdene skiftes efter hvert svar: A, B, C, A, B, C …
    var turns = [];
    for (var n = 0; n < ANSWERS_PER_TEAM; n++) {
      order.forEach(function (teamId) {
        turns.push({ teamId: teamId, playerIdx: null, slots: ANSWERS_PER_TURN });
      });
    }

    state.round = {
      number: previous ? previous.number + 1 : 1,
      questionId: questionId,
      order: order,
      turns: turns,
      turnIdx: 0,
      given: [],
      pending: null,
      revealIdx: 0,
      revealDone: false,
      lastFeedback: null
    };
    state.phase = 'ROUND_INTRO';
    return state;
  }

  function finishQuestion(state) {
    var round = state.round;
    var scores = {};
    state.teams.forEach(function (t) { scores[t.id] = t.questionScore; });
    state.history.push({ number: round.number, questionId: round.questionId, scores: scores });

    if (!state.teams.some(function (t) { return t.totalScore >= TARGET_SCORE; })) return null;

    var max = Math.max.apply(null, state.teams.map(function (t) { return t.totalScore; }));
    var min = Math.min.apply(null, state.teams.map(function (t) { return t.totalScore; }));
    state.result = {
      loserIds: state.teams.filter(function (t) { return t.totalScore === max; }).map(function (t) { return t.id; }),
      winnerIds: state.teams.filter(function (t) { return t.totalScore === min; }).map(function (t) { return t.id; }),
      questions: round.number
    };
    state.phase = 'GAME_OVER';
    return state;
  }

  // Efter et afsluttet svar: næste tur eller opsummering af spørgsmålet.
  function advanceTurn(state) {
    var round = state.round;
    round.pending = null;
    round.revealIdx = 0;
    round.revealDone = false;
    round.turnIdx += 1;
    state.phase = round.turnIdx < round.turns.length ? 'HANDOFF' : 'ROUND_SUMMARY';
    return state;
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

    // action.texts: ét svar pr. felt i turen (action.text accepteres ved ture med ét felt).
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
          status: outcome.status
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

    // Afslører ét svar ad gangen (round.revealIdx) og lægger dets point til holdets score.
    REVEAL_DONE: function (state) {
      if (state.phase !== 'REVEAL' || state.round.revealDone) return null;
      var round = state.round;
      var entry = round.pending.entries[round.revealIdx];
      var team = findTeam(state, entry.teamId);
      team.questionScore += entry.score;
      team.totalScore += entry.score;
      round.revealDone = true;
      return state;
    },

    NEXT: function (state, action, ctx) {
      switch (state.phase) {
        case 'INTRO':
          return startQuestion(state, ctx);
        case 'ROUND_INTRO':
          state.phase = 'HANDOFF';
          return state;
        case 'REVEAL':
          if (!state.round.revealDone) return null;
          if (state.round.revealIdx + 1 < state.round.pending.entries.length) {
            state.round.revealIdx += 1;   // næste svar i samme tur
            state.round.revealDone = false;
            return state;
          }
          return advanceTurn(state);
        case 'ROUND_SUMMARY':
          return finishQuestion(state) || startQuestion(state, ctx);
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
      slots: turn.slots || 1,
      // Hvilket af holdets svar til spørgsmålet det er (1-baseret)
      answerNumber: Math.floor(round.turnIdx / round.order.length) + 1
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
    TARGET_SCORE: TARGET_SCORE,
    ANSWERS_PER_TEAM: ANSWERS_PER_TEAM,
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
    standings: standings,
    currentTurn: currentTurn,
    currentReveal: currentReveal,
    canStart: canStart,
    isInProgress: isInProgress
  };
})(window.JFM = window.JFM || {});
