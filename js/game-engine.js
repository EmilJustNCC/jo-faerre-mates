// Spillogik som ren state machine: reduce(state, action, bank) → newState.
// Ingen DOM og ingen storage. Tilfældighed kommer ind via action.seed og tid via action.now, så reduce er deterministisk.
//
// Spilforløb (v4): runde efter runde. Kategorien følger en fast rundeplan (categoryForRound):
// Jo Færre Jo Bedre, Anagrammer og Sammenhæng. Pr. runde svarer hvert hold på skift:
//   - alle hold har én spiller → ét svar pr. hold, og rækkefølgen roterer én plads til højre pr. runde
//   - ellers → ANSWERS_PER_TEAM svar pr. hold (A, B, A, B …), og startholdet roterer
// Point lægges til holdets samlede score. Spillet slutter, når en runde er færdig og et hold har nået
// TARGET_SCORE (flest point taber, færrest vinder) — eller straks, når et hold når POINTLESS_TO_WIN
// pointless-svar i Jo Færre Jo Bedre (holdet vinder).
//
// state.session holder det, der deles på tværs af spil (brugte spørgsmål, tidligere svar). Store-laget
// gemmer den i en separat localStorage-nøgle, så den overlever "Nyt spil", men ikke "Nulstil alle spil".
(function (JFM) {
  'use strict';

  var STATE_VERSION = 4;
  var SESSION_VERSION = 1;
  var MIN_TEAMS = 2;
  var MAX_TEAMS = 5;          // én farve pr. hold
  var MAX_NAME_LENGTH = 24;
  var WRONG_SCORE = 100;
  var TARGET_SCORE = 1000;    // første hold hertil taber
  var ANSWERS_PER_TEAM = 2;   // svar pr. hold pr. runde, når et hold har to spillere
  var ANSWERS_PER_TURN = 1;   // felter pr. tur (motoren understøtter flere)
  var PASS_WORD = 'pas';      // giver samme point som et forkert svar
  var POINTLESS_TO_WIN = 6;   // pointless-svar i Jo Færre Jo Bedre, der giver automatisk sejr

  var ANAGRAM_SECONDS = 10;
  var ANAGRAM_WRONG_SCORE = 25;
  var TIMEOUT_GRACE_MS = 1500;        // netværk/rendering må ikke koste et svar, der er sendt lige ved 0
  var CONNECTION_SECONDS = 10;
  var CONNECTION_WRONG_SCORE = 25;    // ikke korrekt (mindst ét forkert ord) eller for sent
  var CONNECTION_PICKS = 4;
  // Kategorier med svartimer: sekunder fra "Jeg er klar"
  var TIMER_SECONDS = { anagram: ANAGRAM_SECONDS, connections: CONNECTION_SECONDS };

  var CATEGORIES = ['pointless', 'anagram', 'connections'];
  var CATEGORY_NAMES = { pointless: 'Jo Færre Jo Bedre', anagram: 'Anagrammer', connections: 'Sammenhæng' };
  var BANK_KEYS = { pointless: 'questions', anagram: 'anagrams', connections: 'connections' };

  // Holdfarver. ink = tekstfarve på farvet baggrund (mørk på gul og grøn for kontrast).
  var TEAM_COLORS = [
    { id: 'red', name: 'Rød', hex: '#E63946', ink: '#ffffff' },
    { id: 'blue', name: 'Blå', hex: '#3A86FF', ink: '#ffffff' },
    { id: 'green', name: 'Grøn', hex: '#2DC653', ink: '#0b0f1a' },
    { id: 'yellow', name: 'Gul', hex: '#FFBE0B', ink: '#0b0f1a' },
    { id: 'purple', name: 'Lilla', hex: '#9B5DE5', ink: '#ffffff' }
  ];

  var PHASES = [
    'SETUP', 'INTRO', 'ROUND_INTRO', 'HANDOFF', 'ANSWERING', 'REVEAL', 'ROUND_SUMMARY', 'GAME_OVER'
  ];

  var MESSAGES = {
    empty: 'Skriv et svar — eller “pas” for 100 point.',
    emptyAnagram: 'Skriv et svar.',
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

  // Roterer en liste n pladser til højre: rotateRight([A,B,C,D], 1) → [D,A,B,C].
  function rotateRight(list, n) {
    var len = list.length;
    if (!len) return [];
    var k = ((n % len) + len) % len;
    return list.slice(len - k).concat(list.slice(0, len - k));
  }

  // Rundeplan: 1–5 Jo Færre Jo Bedre, 6–7 Anagrammer, 8–12 Jo Færre Jo Bedre, 13–14 Sammenhæng, derefter Jo Færre Jo Bedre.
  function categoryForRound(roundNumber) {
    if (roundNumber >= 6 && roundNumber <= 7) return 'anagram';
    if (roundNumber >= 13 && roundNumber <= 14) return 'connections';
    return 'pointless';
  }

  /**
   * Vælger et tilfældigt, ubrugt element fra en pulje. Er alle brugt, nulstilles netop denne pulje.
   * @param {object[]} pool - elementer med id
   * @param {string[]} usedIds - brugte id'er (ændres ikke)
   * @param {function} rng - () → [0,1)
   * @param {string[]} [avoidIds] - id'er, der helst ikke skal vælges igen lige nu (fx det aktuelle spørgsmål)
   * @returns {{item: object, usedIds: string[], wasReset: boolean}}
   */
  function pickRandomUnused(pool, usedIds, rng, avoidIds) {
    if (!pool || !pool.length) throw new Error('JFM: Puljen er tom.');
    var used = (usedIds || []).slice();
    var avoid = avoidIds || [];
    var candidates = pool.filter(function (x) { return used.indexOf(x.id) === -1; });
    var wasReset = false;
    if (!candidates.length) {
      console.info('JFM: Alle i puljen er brugt — puljen nulstilles.');
      wasReset = true;
      used = [];
      candidates = pool.filter(function (x) { return avoid.indexOf(x.id) === -1; });
      if (!candidates.length) candidates = pool.slice();
    }
    var item = candidates[Math.floor(rng() * candidates.length)];
    used.push(item.id);
    return { item: item, usedIds: used, wasReset: wasReset };
  }

  // Rækkefølgen i runde r med 1-mandshold: baseOrder roteret r-1 pladser til højre,
  // så holdet, der startede, svarer som nr. 2 i næste runde.
  function orderForRound(baseOrder, roundNumber) {
    return rotateRight(baseOrder, roundNumber - 1);
  }

  function findTeam(state, teamId) {
    for (var i = 0; i < state.teams.length; i++) {
      if (state.teams[i].id === teamId) return state.teams[i];
    }
    return null;
  }

  function findIn(list, id) {
    for (var i = 0; i < (list || []).length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function poolFor(bank, category) {
    var list = bank && bank[BANK_KEYS[category]];
    return Array.isArray(list) ? list : [];
  }

  function findQuestion(bank, questionId) { return findIn(poolFor(bank, 'pointless'), questionId); }
  function findItem(bank, category, id) { return findIn(poolFor(bank, category), id); }

  function findColor(colorId) {
    for (var i = 0; i < TEAM_COLORS.length; i++) {
      if (TEAM_COLORS[i].id === colorId) return TEAM_COLORS[i];
    }
    return null;
  }

  // Første farve, som ingen af holdene (bortset fra ignoreId) bruger.
  function firstFreeColor(teams, ignoreId) {
    var taken = (teams || []).filter(function (t) { return t.id !== ignoreId; }).map(function (t) { return t.color; });
    for (var i = 0; i < TEAM_COLORS.length; i++) {
      if (taken.indexOf(TEAM_COLORS[i].id) === -1) return TEAM_COLORS[i].id;
    }
    return null;
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
      color: findColor(team.color) ? team.color : null,
      totalScore: 0,      // samlet for hele spillet
      questionScore: 0,   // for den aktuelle runde
      pointlessCount: 0   // pointless-svar i Jo Færre Jo Bedre i dette spil
    };
  }

  // Hold uden (gyldig eller unik) farve får den første ledige.
  function assignMissingColors(teams) {
    var seen = [];
    teams.forEach(function (t) {
      if (!findColor(t.color) || seen.indexOf(t.color) !== -1) t.color = null;
      if (t.color) seen.push(t.color);
    });
    teams.forEach(function (t) {
      if (!t.color) {
        t.color = firstFreeColor(teams, t.id);
      }
    });
    return teams;
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
    if (team && team.color != null) {
      if (!findColor(team.color)) return 'Vælg en farve.';
      var colorTaken = (teams || []).some(function (t) { return t.id !== ignoreId && t.color === team.color; });
      if (colorTaken) return 'Den farve er allerede valgt af et andet hold.';
    }
    return null;
  }

  // ---------- Session (på tværs af spil) ----------

  function createSession() {
    return {
      version: SESSION_VERSION,
      gamesPlayed: 0,
      usedIds: { pointless: [], anagram: [], connections: [] },
      answersByItem: {}
    };
  }

  function isValidSession(session) {
    return !!session && typeof session === 'object' &&
      session.version === SESSION_VERSION &&
      typeof session.gamesPlayed === 'number' &&
      !!session.usedIds && CATEGORIES.every(function (c) { return Array.isArray(session.usedIds[c]); }) &&
      !!session.answersByItem && typeof session.answersByItem === 'object';
  }

  function createInitialState(teams, session) {
    return {
      version: STATE_VERSION,
      phase: 'SETUP',
      teams: assignMissingColors((teams || []).map(cleanTeam)),
      gameNumber: 0,
      baseOrder: null,
      round: null,
      history: [],
      result: null,
      session: session && isValidSession(session) ? clone(session) : createSession()
    };
  }

  // Gemte spil fra ældre versioner: reglerne er ændret, så et igangværende spil kan ikke fortsættes,
  // men holdene bevares (og får en farve). Ukendte versioner returneres uændret (og afvises af isValidState).
  function migrateState(state) {
    if (state && (state.version === 1 || state.version === 2 || state.version === 3) && Array.isArray(state.teams)) {
      return createInitialState(state.teams.slice(0, MAX_TEAMS));
    }
    if (state && state.version === STATE_VERSION && !isValidSession(state.session)) {
      var copy = clone(state);
      copy.session = createSession();
      return copy;
    }
    return state;
  }

  function isValidState(state) {
    return !!state &&
      typeof state === 'object' &&
      state.version === STATE_VERSION &&
      PHASES.indexOf(state.phase) !== -1 &&
      Array.isArray(state.teams) &&
      Array.isArray(state.history) &&
      isValidSession(state.session) &&
      (state.phase === 'SETUP' || state.phase === 'INTRO' || !!state.round);
  }

  // Hold sorteret efter samlet score (færrest først). Lige point: oprettelsesrækkefølge.
  function standings(state) {
    return state.teams.slice().sort(function (a, b) {
      return a.totalScore - b.totalScore || state.teams.indexOf(a) - state.teams.indexOf(b);
    });
  }

  // 1 svar pr. hold pr. runde, når alle hold har præcis én spiller; ellers ANSWERS_PER_TEAM.
  function answersPerTeam(teams) {
    return teams.length && teams.every(function (t) { return t.players.length === 1; }) ? 1 : ANSWERS_PER_TEAM;
  }

  // ---------- Runder ----------

  // Kategorien for en runde. Mangler puljen helt (fx i tests), spilles Jo Færre Jo Bedre i stedet.
  function playableCategory(bank, roundNumber) {
    var category = categoryForRound(roundNumber);
    if (category !== 'pointless' && !poolFor(bank, category).length) {
      console.warn('JFM: Ingen ' + CATEGORY_NAMES[category] + ' i datafilerne — runde ' + roundNumber + ' spilles som Jo Færre Jo Bedre.');
      return 'pointless';
    }
    return category;
  }

  function pickFor(state, bank, category, rng, avoidIds) {
    var picked = pickRandomUnused(poolFor(bank, category), state.session.usedIds[category], rng, avoidIds);
    state.session.usedIds[category] = picked.usedIds;
    return picked.item;
  }

  function startQuestion(state, ctx) {
    var previous = state.round;
    var number = previous ? previous.number + 1 : 1;
    var perTeam = answersPerTeam(state.teams);
    var ids = state.teams.map(function (t) { return t.id; });
    if (!state.baseOrder || state.baseOrder.length !== ids.length) state.baseOrder = shuffle(ids, ctx.rng);

    var order;
    if (perTeam === 1) {
      // Én spiller pr. hold: rækkefølgen roterer én plads til højre pr. runde (A,B,C,D → D,A,B,C).
      order = orderForRound(state.baseOrder, number);
    } else {
      // 2-mandshold (uændret): første runde = lodtrækning, derefter starter næste hold.
      order = previous ? previous.order.slice(1).concat(previous.order[0]) : state.baseOrder.slice();
    }

    state.teams.forEach(function (t) { t.questionScore = 0; });
    var category = playableCategory(ctx.bank, number);
    var questionId = category === 'pointless' ? pickFor(state, ctx.bank, 'pointless', ctx.rng).id : null;

    // Holdene skiftes efter hvert svar: A, B, C, A, B, C …
    // Anagrammer og Sammenhæng: hver tur får sin egen opgave, så holdene ikke kan lære af hinanden.
    var turns = [];
    for (var n = 0; n < perTeam; n++) {
      order.forEach(function (teamId) {
        var turn = { teamId: teamId, playerIdx: null, slots: ANSWERS_PER_TURN };
        if (category !== 'pointless') {
          var item = pickFor(state, ctx.bank, category, ctx.rng);
          turn.itemId = item.id;
          if (category === 'connections') turn.tileOrder = shuffle(item.correct.concat(item.decoys), ctx.rng);
        }
        turns.push(turn);
      });
    }

    state.round = {
      number: number,
      category: category,
      questionId: questionId,
      answersPerTeam: perTeam,
      order: order,
      turns: turns,
      turnIdx: 0,
      given: [],
      pending: null,
      revealIdx: 0,
      revealDone: false,
      deadline: null,
      lastFeedback: null
    };
    state.phase = 'ROUND_INTRO';
    return state;
  }

  function recordHistory(state) {
    var round = state.round;
    var scores = {};
    state.teams.forEach(function (t) { scores[t.id] = t.questionScore; });
    state.history.push({ number: round.number, category: round.category, questionId: round.questionId, scores: scores });
  }

  function finishQuestion(state) {
    var round = state.round;
    recordHistory(state);

    if (!state.teams.some(function (t) { return t.totalScore >= TARGET_SCORE; })) return null;

    var max = Math.max.apply(null, state.teams.map(function (t) { return t.totalScore; }));
    var min = Math.min.apply(null, state.teams.map(function (t) { return t.totalScore; }));
    state.result = {
      reason: 'score',
      loserIds: state.teams.filter(function (t) { return t.totalScore === max; }).map(function (t) { return t.id; }),
      winnerIds: state.teams.filter(function (t) { return t.totalScore === min; }).map(function (t) { return t.id; }),
      questions: round.number
    };
    state.phase = 'GAME_OVER';
    return state;
  }

  // Et hold har nået POINTLESS_TO_WIN pointless-svar: spillet slutter straks, og holdet vinder uanset stillingen.
  function finishByPointless(state, team) {
    recordHistory(state);
    state.round.pending = null;
    state.result = {
      reason: 'pointless',
      loserIds: [],
      winnerIds: [team.id],
      questions: state.round.number
    };
    state.phase = 'GAME_OVER';
    return state;
  }

  // Efter et afsluttet svar: næste tur eller opsummering af runden.
  function advanceTurn(state) {
    var round = state.round;
    round.pending = null;
    round.revealIdx = 0;
    round.revealDone = false;
    round.deadline = null;
    round.turnIdx += 1;
    state.phase = round.turnIdx < round.turns.length ? 'HANDOFF' : 'ROUND_SUMMARY';
    return state;
  }

  // ---------- Svar pr. kategori ----------

  function rejectTurn(round, type, message, texts, field) {
    round.lastFeedback = { type: type, field: field || 0, message: message, inputs: texts };
  }

  function scorePointless(state, round, turn, team, player, texts, ctx) {
    var slots = turn.slots || 1;
    var question = findQuestion(ctx.bank, round.questionId);
    var usedNames = round.given
      .filter(function (g) { return g.matched; })
      .map(function (g) { return g.matched; });
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
        rejectTurn(round, problem, (slots > 1 ? 'Svar ' + (i + 1) + ': ' : '') + MESSAGES[problem], texts, i);
        return null;
      }
      if (outcome.answer) usedNames.push(outcome.answer);
      entries.push({
        teamId: turn.teamId,
        player: player,
        itemId: round.questionId,
        input: text,
        matched: outcome.answer,
        score: outcome.score,
        status: outcome.status
      });
    }
    return entries;
  }

  // Tiden er gået, hvis UI'et melder det (timeren nåede 0), eller hvis svaret kommer efter deadline (+ respit).
  function isTimedOut(round, action) {
    return action.timeout === true ||
      (round.deadline != null && action.now != null && action.now > round.deadline + TIMEOUT_GRACE_MS);
  }

  // Anagram: stram matching, fordi bogstaverne er givet. Korrekt = 0, forkert/for sent = 25.
  function scoreAnagram(round, turn, player, texts, action, ctx) {
    var item = findItem(ctx.bank, 'anagram', turn.itemId);
    var text = texts[0];
    var timedOut = isTimedOut(round, action);
    if (!text && !timedOut) {
      rejectTurn(round, 'empty', MESSAGES.emptyAnagram, texts, 0);
      return null;
    }
    var status = timedOut ? 'timeout' : (JFM.matcher.matchAnagram(text, item) ? 'correct' : 'wrong');
    return [{
      teamId: turn.teamId,
      player: player,
      itemId: item.id,
      input: text,
      matched: status === 'correct' ? item.answer : null,
      solution: item.answer,
      score: status === 'correct' ? 0 : ANAGRAM_WRONG_SCORE,
      status: status
    }];
  }

  // Antal forkert valgte ord i en sammenhængsopgave.
  function connectionWrongCount(item, picks) {
    return picks.filter(function (p) { return item.correct.indexOf(p) === -1; }).length;
  }

  // Sammenhæng: præcis 4 forskellige ord fra opgavens brikker, inden timeren løber ud.
  // Korrekt eller ikke korrekt: alle 4 rigtige = 0 point, ellers (eller for sent) = 25 point.
  function scoreConnections(round, turn, player, action, ctx) {
    var item = findItem(ctx.bank, 'connections', turn.itemId);
    var tiles = turn.tileOrder || item.correct.concat(item.decoys);
    var raw = Array.isArray(action.picks) ? action.picks.map(String) : [];
    var picks = raw.filter(function (p, i) { return raw.indexOf(p) === i && tiles.indexOf(p) !== -1; });
    var timedOut = isTimedOut(round, action);
    if (!timedOut && (raw.length !== CONNECTION_PICKS || picks.length !== CONNECTION_PICKS)) return null;
    var correct = !timedOut && connectionWrongCount(item, picks) === 0;
    return [{
      teamId: turn.teamId,
      player: player,
      itemId: item.id,
      input: picks.join(', '),
      picks: picks,
      matched: correct ? item.groupName : null,
      solution: item.groupName,
      score: correct ? 0 : CONNECTION_WRONG_SCORE,
      status: correct ? 'correct' : (timedOut ? 'timeout' : 'wrong')
    }];
  }

  function recordAnswer(state, entry) {
    var team = findTeam(state, entry.teamId);
    var key = entry.itemId;
    if (!key) return;
    var list = state.session.answersByItem[key] || (state.session.answersByItem[key] = []);
    list.push({
      game: state.gameNumber,
      teamName: team.name,
      teamColor: team.color,
      input: entry.input,
      matched: entry.matched,
      score: entry.score,
      status: entry.status
    });
  }

  // ---------- Action-handlere ----------
  // Hver handler får en kopi af state og returnerer ny state, eller null hvis actionen er ugyldig.

  var handlers = {
    ADD_TEAM: function (state, action) {
      if (state.phase !== 'SETUP' || !action.team || !action.team.id) return null;
      if (state.teams.length >= MAX_TEAMS) return null;
      if (findTeam(state, action.team.id)) return null;
      if (validateTeam(state.teams, action.team, null)) return null;
      var team = cleanTeam(action.team);
      if (!team.color) team.color = firstFreeColor(state.teams, team.id);
      state.teams.push(team);
      return state;
    },

    EDIT_TEAM: function (state, action) {
      if (state.phase !== 'SETUP' || !action.team) return null;
      var team = findTeam(state, action.team.id);
      if (!team || validateTeam(state.teams, action.team, team.id)) return null;
      var cleaned = cleanTeam(action.team);
      team.name = cleaned.name;
      team.players = cleaned.players;
      if (cleaned.color) team.color = cleaned.color;
      return state;
    },

    REMOVE_TEAM: function (state, action) {
      if (state.phase !== 'SETUP' || !findTeam(state, action.teamId)) return null;
      state.teams = state.teams.filter(function (t) { return t.id !== action.teamId; });
      return state;
    },

    START_GAME: function (state) {
      if (state.phase !== 'SETUP' || state.teams.length < MIN_TEAMS) return null;
      var fresh = createInitialState(state.teams, state.session);
      fresh.session.gamesPlayed += 1;
      fresh.gameNumber = fresh.session.gamesPlayed;
      fresh.phase = 'INTRO';
      return fresh;
    },

    CONFIRM_READY: function (state, action) {
      if (state.phase !== 'HANDOFF') return null;
      state.round.lastFeedback = null;
      // Anagram-timeren starter, når holdet trykker "Jeg er klar".
      var seconds = TIMER_SECONDS[state.round.category];
      state.round.deadline = seconds && action.now != null ? action.now + seconds * 1000 : null;
      state.phase = 'ANSWERING';
      return state;
    },

    // "Spørgsmål gentaget": kun i Jo Færre Jo Bedre og kun før rundens første svar.
    // Det aktuelle spørgsmål er allerede markeret som brugt; der vælges et nyt tilfældigt ubrugt.
    // action.questionId kan tvinge et bestemt spørgsmål frem (til test).
    SWAP_QUESTION: function (state, action, ctx) {
      var round = state.round;
      if (!round || round.category !== 'pointless' || round.given.length) return null;
      if (['ROUND_INTRO', 'HANDOFF', 'ANSWERING'].indexOf(state.phase) === -1) return null;
      var nextId;
      if (action.questionId) {
        if (!findQuestion(ctx.bank, action.questionId) || action.questionId === round.questionId) return null;
        nextId = action.questionId;
        if (state.session.usedIds.pointless.indexOf(nextId) === -1) state.session.usedIds.pointless.push(nextId);
      } else {
        if (poolFor(ctx.bank, 'pointless').length < 2) return null;
        nextId = pickFor(state, ctx.bank, 'pointless', ctx.rng, [round.questionId]).id;
        if (nextId === round.questionId) return null;
      }
      round.questionId = nextId;
      round.lastFeedback = null;
      return state;
    },

    // Jo Færre Jo Bedre / Anagrammer: action.texts (ét svar pr. felt; action.text accepteres ved ét felt).
    // Anagrammer og Sammenhæng: action.timeout = true (eller action.now efter deadline) registrerer tidsoverskridelse.
    // Sammenhæng: action.picks = præcis 4 ord fra opgavens brikker (ved tidsoverskridelse de valgte indtil da).
    // Er et svar tomt, tvetydigt eller en dublet, afvises turen, og felterne bevares i lastFeedback.inputs.
    SUBMIT_ANSWER: function (state, action, ctx) {
      if (state.phase !== 'ANSWERING') return null;
      var round = state.round;
      var turn = round.turns[round.turnIdx];
      if (action.teamId && action.teamId !== turn.teamId) return null;
      var team = findTeam(state, turn.teamId);
      var player = turn.playerIdx == null ? null : team.players[turn.playerIdx];

      var entries;
      if (round.category === 'connections') {
        entries = scoreConnections(round, turn, player, action, ctx);
        if (!entries) return null;
      } else {
        var slots = turn.slots || 1;
        var raw = Array.isArray(action.texts) ? action.texts : [action.text];
        if (raw.length !== slots) return null;
        var texts = raw.map(function (t) { return String(t == null ? '' : t).trim(); });
        entries = round.category === 'anagram' ?
          scoreAnagram(round, turn, player, texts, action, ctx) :
          scorePointless(state, round, turn, team, player, texts, ctx);
        if (!entries) return state;   // afvist med feedback
      }

      round.given = round.given.concat(entries);
      round.pending = { teamId: turn.teamId, player: player, entries: entries };
      round.revealIdx = 0;
      round.revealDone = false;
      round.lastFeedback = null;
      state.phase = 'REVEAL';
      return state;
    },

    // Afslører ét svar ad gangen (round.revealIdx), lægger dets point til holdets score og gemmer det i historikken.
    REVEAL_DONE: function (state) {
      if (state.phase !== 'REVEAL' || state.round.revealDone) return null;
      var round = state.round;
      var entry = round.pending.entries[round.revealIdx];
      var team = findTeam(state, entry.teamId);
      team.questionScore += entry.score;
      team.totalScore += entry.score;
      // Kun 0-point-svar i Jo Færre Jo Bedre tæller som pointless (ikke korrekte anagrammer/sammenhænge).
      if (round.category === 'pointless' && entry.status === 'correct' && entry.score === 0) team.pointlessCount += 1;
      recordAnswer(state, entry);
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
          // Pointless-sejren tjekkes før alt andet — også før 1000-point-reglen.
          var champion = state.teams.filter(function (t) { return t.pointlessCount >= POINTLESS_TO_WIN; })[0];
          if (champion) return finishByPointless(state, champion);
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

    // Afslutter (eller afbryder) et spil og går tilbage til opsætning med de samme hold og samme session.
    NEW_GAME: function (state) {
      return createInitialState(state.teams, state.session);
    }
  };

  /**
   * Ren reducer. Returnerer samme objekt, hvis actionen ikke ændrer noget.
   * @param {object} state
   * @param {{type: string, seed?: number, now?: number}} action
   * @param {{questions: object[], anagrams?: object[], connections?: object[]}} bank
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
      itemId: turn.itemId || null,
      tileOrder: turn.tileOrder || null,
      // Hvilket af holdets svar i runden det er (1-baseret) og hvor mange holdet giver i alt
      answerNumber: Math.floor(round.turnIdx / round.order.length) + 1,
      answersTotal: round.answersPerTeam || ANSWERS_PER_TEAM
    };
  }

  // Svaret, der afsløres lige nu (REVEAL).
  function currentReveal(state) {
    var r = state.round;
    if (!r || !r.pending) return null;
    return { entry: r.pending.entries[r.revealIdx], index: r.revealIdx, total: r.pending.entries.length };
  }

  // Svar på et spørgsmål fra tidligere spil i sessionen (ikke det igangværende spil).
  function previousAnswers(state, itemId) {
    var list = (state.session && state.session.answersByItem[itemId]) || [];
    return list.filter(function (a) { return a.game < state.gameNumber; });
  }

  function canStart(state) {
    return state.phase === 'SETUP' && state.teams.length >= MIN_TEAMS;
  }

  function isInProgress(state) {
    return !!state && state.phase !== 'SETUP';
  }

  JFM.engine = {
    STATE_VERSION: STATE_VERSION,
    SESSION_VERSION: SESSION_VERSION,
    MIN_TEAMS: MIN_TEAMS,
    MAX_TEAMS: MAX_TEAMS,
    MAX_NAME_LENGTH: MAX_NAME_LENGTH,
    TARGET_SCORE: TARGET_SCORE,
    ANSWERS_PER_TEAM: ANSWERS_PER_TEAM,
    ANSWERS_PER_TURN: ANSWERS_PER_TURN,
    PASS_WORD: PASS_WORD,
    POINTLESS_TO_WIN: POINTLESS_TO_WIN,
    ANAGRAM_SECONDS: ANAGRAM_SECONDS,
    ANAGRAM_WRONG_SCORE: ANAGRAM_WRONG_SCORE,
    CONNECTION_SECONDS: CONNECTION_SECONDS,
    TIMER_SECONDS: TIMER_SECONDS,
    CONNECTION_WRONG_SCORE: CONNECTION_WRONG_SCORE,
    CONNECTION_PICKS: CONNECTION_PICKS,
    CATEGORIES: CATEGORIES,
    CATEGORY_NAMES: CATEGORY_NAMES,
    TEAM_COLORS: TEAM_COLORS,
    PHASES: PHASES,
    reduce: reduce,
    createInitialState: createInitialState,
    createSession: createSession,
    isValidSession: isValidSession,
    migrateState: migrateState,
    isValidState: isValidState,
    validateTeam: validateTeam,
    findTeam: findTeam,
    findQuestion: findQuestion,
    findItem: findItem,
    findColor: findColor,
    firstFreeColor: firstFreeColor,
    rotateRight: rotateRight,
    orderForRound: orderForRound,
    categoryForRound: categoryForRound,
    pickRandomUnused: pickRandomUnused,
    connectionWrongCount: connectionWrongCount,
    createRng: createRng,
    standings: standings,
    currentTurn: currentTurn,
    currentReveal: currentReveal,
    previousAnswers: previousAnswers,
    canStart: canStart,
    isInProgress: isInProgress
  };
})(window.JFM = window.JFM || {});
