// Render-funktioner pr. skærm. Returnerer HTML-strenge ud fra state + lokal UI-tilstand.
// Ingen ændring af state her — knapper bærer data-action, som app.js oversætter til actions.
(function (JFM) {
  'use strict';

  var E = JFM.engine;
  var MAX_POINTLESS_SHOWN = 10;
  var TOP_ANSWERS_SHOWN = 5;

  function h(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function question(state) {
    return state.round ? E.findQuestion(window.JFM_QUESTIONS, state.round.questionId) : null;
  }

  function teamName(state, id) {
    var t = E.findTeam(state, id);
    return t ? t.name : '?';
  }

  function stageLabel(state) {
    var r = state.round;
    if (!r) return '';
    if (state.phase === 'GAME_OVER') return 'Slutstilling';
    return 'Spørgsmål ' + r.number + (state.phase === 'ROUND_SUMMARY' ? ' · Resultat' : '');
  }

  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  function progressPct(team) { return Math.min(100, Math.round(team.totalScore / E.TARGET_SCORE * 100)); }

  function playersText(team) { return team.players.map(h).join(' & '); }

  // Tekst for et givet svar: det matchede navn, "Pas" eller det indtastede (ved forkert svar).
  function entryLabel(entry) {
    if (entry.status === 'pass') return 'Pas';
    return entry.matched || entry.input;
  }

  function isMiss(entry) { return entry.status === 'wrong' || entry.status === 'pass'; }

  // ---------- Fælles byggesten ----------

  function topBar(state) {
    return '<header class="topbar">' +
      '<button class="btn btn-ghost btn-small" data-action="show-menu" aria-label="Til menuen">☰ Menu</button>' +
      '<span class="topbar-label">' + h(stageLabel(state)) + '</span>' +
      '<span class="topbar-brand">JFMJB</span>' +
    '</header>';
  }

  function countdownEl(value, opts) {
    var o = opts || {};
    return '<div class="countdown-wrap"><div class="cd" data-countdown' +
      ' data-value="' + value + '"' +
      (o.wrong ? ' data-wrong="1"' : '') +
      (o.animate ? ' data-animate="1"' : '') + '></div></div>';
  }

  function questionHeader(q) {
    if (!q) return '';
    return '<div class="q-pill">' + h(q.title) + '</div>' +
      '<p class="q-instruction">' + h(q.instruction) + '</p>';
  }

  // Podier i bunden af spilskærmen: samlet score (opdateres efter hvert afsløret svar),
  // point i dette spørgsmål og en bjælke mod 1000.
  function podiums(state) {
    var turn = E.currentTurn(state);
    var activeId = turn && ['HANDOFF', 'ANSWERING', 'REVEAL'].indexOf(state.phase) !== -1 ? turn.team.id : null;
    var list = state.teams.map(function (t) {
      var pct = progressPct(t);
      var cls = 'podium' + (t.id === activeId ? ' active' : '') + (pct >= 80 ? ' danger' : '');
      return '<li class="' + cls + '">' +
        '<span class="podium-name">' + h(t.name) + '</span>' +
        '<span class="podium-players">' + playersText(t) + '</span>' +
        '<span class="podium-score">' + fmt(t.totalScore) + '</span>' +
        '<span class="podium-extra">' + (t.questionScore ? '+' + t.questionScore + ' dette spørgsmål' : '&nbsp;') + '</span>' +
        '<span class="podium-bar" aria-hidden="true"><span style="width:' + pct + '%"></span></span>' +
      '</li>';
    }).join('');
    return '<ul class="podiums" aria-label="Pointtavle — første hold til ' + fmt(E.TARGET_SCORE) + ' point taber">' + list + '</ul>';
  }

  // Stilling sorteret efter samlet score (færrest først) med bjælke mod 1000.
  function scoreboard(state, opts) {
    var o = opts || {};
    var result = state.result;
    return '<ol class="scoreboard">' + E.standings(state).map(function (t, i) {
      var pct = progressPct(t);
      var cls = 'sb-row' + (pct >= 80 ? ' danger' : '') +
        (result && result.loserIds.indexOf(t.id) !== -1 ? ' loser' : '') +
        (result && result.winnerIds.indexOf(t.id) !== -1 ? ' winner' : '');
      return '<li class="' + cls + '">' +
        '<span class="sb-rank">' + (i + 1) + '</span>' +
        '<span class="sb-name">' + h(t.name) + '</span>' +
        '<span class="sb-bar" aria-hidden="true"><span style="width:' + pct + '%"></span></span>' +
        '<span class="sb-total">' + fmt(t.totalScore) + '</span>' +
        (o.showQuestion ? '<span class="sb-delta">+' + t.questionScore + '</span>' : '') +
      '</li>';
    }).join('') + '</ol>';
  }

  function givenList(state) {
    // "Pas" vises ikke her — det er ikke et svar, andre kan bruge.
    var given = state.round.given.filter(function (g) { return g.status !== 'pass'; });
    if (!given.length) return '<p class="muted small">Ingen svar endnu til dette spørgsmål.</p>';
    return '<ul class="chips">' + given.map(function (g) {
      return '<li class="chip' + (isMiss(g) ? ' chip-wrong' : '') + '" title="' + h(teamName(state, g.teamId)) + '">' +
        h(entryLabel(g)) + ' <b>' + g.score + '</b></li>';
    }).join('') + '</ul>';
  }

  // Spilskærmens grundlayout: countdown til venstre, panel til højre, podier i bunden.
  function gameLayout(state, cdHtml, panelHtml) {
    return '<div class="screen game">' + topBar(state) +
      '<div class="game-main phase-' + state.phase.toLowerCase() + (cdHtml ? '' : ' no-cd') + '">' + (cdHtml || '') +
        '<section class="panel game-panel">' + panelHtml + '</section>' +
      '</div>' + podiums(state) + '</div>';
  }

  function nextButton(label, extra) {
    return '<button class="btn btn-primary btn-big" data-action="next"' + (extra || '') + '>' + h(label) + '</button>';
  }

  // ---------- Startskærm og holddesigner ----------

  function teamDesigner(state, ui) {
    var editing = ui.editId ? E.findTeam(state, ui.editId) : null;
    var full = state.teams.length >= E.MAX_TEAMS;
    var list = state.teams.length ? state.teams.map(function (t) {
      return '<li class="team-row">' +
        '<div><strong>' + h(t.name) + '</strong><span class="muted"> · ' + playersText(t) + '</span></div>' +
        '<div class="team-row-actions">' +
          '<button class="btn btn-ghost btn-small" data-action="edit-team" data-id="' + h(t.id) + '">Redigér</button>' +
          '<button class="btn btn-ghost btn-small btn-danger" data-action="remove-team" data-id="' + h(t.id) + '">Slet</button>' +
        '</div></li>';
    }).join('') : '<li class="muted">Ingen hold endnu. Opret mindst to.</li>';

    var showForm = editing || !full;
    var form = showForm ?
      '<form class="team-form" data-form="team" autocomplete="off" novalidate>' +
        '<h3>' + (editing ? 'Redigér hold' : 'Nyt hold') + '</h3>' +
        '<label>Holdnavn<input name="name" maxlength="' + E.MAX_NAME_LENGTH + '" value="' + h(editing ? editing.name : '') + '" required></label>' +
        '<label>Spiller 1<input name="p1" maxlength="' + E.MAX_NAME_LENGTH + '" value="' + h(editing ? editing.players[0] : '') + '" required></label>' +
        '<label>Spiller 2 <span class="muted">(valgfri)</span><input name="p2" maxlength="' + E.MAX_NAME_LENGTH + '" value="' + h(editing && editing.players[1] ? editing.players[1] : '') + '"></label>' +
        '<p class="form-error" data-role="form-error" role="alert"></p>' +
        '<div class="row">' +
          '<button class="btn btn-primary" type="submit">' + (editing ? 'Gem ændringer' : 'Tilføj hold') + '</button>' +
          (editing ? '<button class="btn btn-ghost" type="button" data-action="cancel-edit">Annullér</button>' : '') +
        '</div>' +
      '</form>' : '<p class="muted">Maks. ' + E.MAX_TEAMS + ' hold er nået.</p>';

    return '<aside class="panel designer" id="designer">' +
      '<h2>Holddesigner <span class="muted small">' + state.teams.length + '/' + E.MAX_TEAMS + '</span></h2>' +
      '<ul class="team-list">' + list + '</ul>' + form + '</aside>';
  }

  function progressPanel(state) {
    return '<aside class="panel designer"><h2>Spil i gang</h2>' +
      '<p class="muted">' + h(stageLabel(state) || 'Spillet er startet') + '</p>' +
      scoreboard(state) + '</aside>';
  }

  function menu(state, ui) {
    var inProgress = E.isInProgress(state);
    var items = inProgress ?
      '<button class="menu-item" data-action="continue">Fortsæt spil</button>' +
      '<button class="menu-item" data-action="abandon-game">Nyt spil</button>' :
      '<button class="menu-item" data-action="focus-team-form">Opret hold</button>' +
      '<button class="menu-item" data-action="start-game"' + (E.canStart(state) ? '' : ' disabled') + '>Start spillet!</button>';

    var hint = inProgress ? '' : (E.canStart(state) ? '' :
      '<p class="muted small">Opret mindst ' + E.MIN_TEAMS + ' hold for at starte.</p>');

    var notice = ui.notice ? '<p class="notice" role="status">' + h(ui.notice) + '</p>' : '';

    return '<div class="screen start">' +
      '<section class="start-main">' +
        '<h1 class="arcade-title" aria-label="Jo færre mates jo bedre">' +
          '<span>JO FÆRRE</span><span>MATES</span><span>JO BEDRE</span></h1>' +
        '<nav class="menu" aria-label="Hovedmenu">' + items + '</nav>' + hint + notice +
        '<details class="backup-tools"><summary>Backup</summary>' +
          '<p class="muted small">Spillet gemmes automatisk i browseren. Her kan du gemme en kopi som fil eller indlæse en.</p>' +
          '<div class="row">' +
            '<button class="btn btn-ghost btn-small" data-action="export">Gem backup-fil</button>' +
            '<button class="btn btn-ghost btn-small" data-action="import">Indlæs backup-fil</button>' +
            '<button class="btn btn-ghost btn-small btn-danger" data-action="reset-all">Slet alt</button>' +
          '</div>' +
          '<input type="file" accept=".json,application/json" data-role="import-file" hidden>' +
        '</details>' +
        '<footer class="version muted small">v' + h(JFM.APP_VERSION || '') + '</footer>' +
      '</section>' +
      (inProgress ? progressPanel(state) : teamDesigner(state, ui)) +
    '</div>';
  }

  // ---------- Spilfaser ----------

  function intro(state) {
    var teams = state.teams.map(function (t, i) {
      return '<li class="intro-team" style="animation-delay:' + (0.6 + i * 0.25) + 's">' + h(t.name) + '</li>';
    }).join('');
    return '<div class="screen center intro">' +
      '<p class="intro-kicker">Velkommen til</p>' +
      '<h1 class="arcade-title small-title"><span>JO FÆRRE</span><span>MATES</span><span>JO BEDRE</span></h1>' +
      '<ul class="intro-teams">' + teams + '</ul>' +
      '<p class="muted">Find de svar, som ingen andre tænkte på! Første hold til ' + fmt(E.TARGET_SCORE) + ' point taber.</p>' +
      nextButton('Lad spillet begynde!', ' style="animation-delay:' + (0.8 + state.teams.length * 0.25) + 's"') +
    '</div>';
  }

  function roundIntro(state) {
    var r = state.round;
    var rows = r.order.map(function (id, i) {
      var t = E.findTeam(state, id);
      return '<li class="order-row"><span class="order-num">' + (i + 1) + '</span>' +
        '<div class="order-team"><strong>' + h(t.name) + '</strong>' +
        '<span class="muted small">' + playersText(t) + '</span></div></li>';
    }).join('');

    var orderNote = r.number === 1 ? 'Rækkefølgen er trukket lod.' : 'Et nyt hold starter hvert spørgsmål.';
    return '<div class="screen game">' + topBar(state) +
      '<section class="panel round-intro">' +
        '<h1 class="round-title">SPØRGSMÅL ' + r.number + '</h1>' +
        '<p>Hvert hold giver <strong>' + E.ANSWERS_PER_TEAM + ' svar</strong> — ét ad gangen, på skift. Enheden går videre efter hvert svar. ' +
          'Kan I ikke komme på et svar, så skriv <strong>“pas”</strong> — det giver 100 point.</p>' +
        '<p class="muted">' + orderNote + ' Pointene lægges sammen, og første hold til <strong>' + fmt(E.TARGET_SCORE) +
          ' point</strong> taber. Spørgsmålet vises først, når enheden er givet videre.</p>' +
        '<ol class="order-list">' + rows + '</ol>' +
        (r.number > 1 ? '<h2 class="small-heading">Stilling</h2>' + scoreboard(state) : '') +
        nextButton('Start spørgsmålet') +
      '</section></div>';
  }

  function handoff(state) {
    var turn = E.currentTurn(state);
    var who = turn.playerName ?
      '<p class="handoff-player">' + h(turn.playerName) + '</p>' :
      '<p class="handoff-player">Hele holdet</p><p class="muted">I må gerne konferere.</p>';
    return '<div class="screen center handoff">' +
      '<p class="muted">' + h(stageLabel(state)) + ' · Svar ' + turn.answerNumber + ' af ' + E.ANSWERS_PER_TEAM + '</p>' +
      '<p class="handoff-kicker">Giv enheden til</p>' +
      '<h1 class="handoff-team">' + h(turn.team.name) + '</h1>' + who +
      '<button class="btn btn-primary btn-big" data-action="ready">Jeg er klar</button>' +
      '<button class="btn btn-ghost btn-small" data-action="show-menu">☰ Menu</button>' +
    '</div>';
  }

  function answering(state) {
    var r = state.round;
    var turn = E.currentTurn(state);
    var fb = r.lastFeedback;
    var multi = turn.slots > 1;
    var fbHtml = fb ? '<p class="feedback" role="alert">' + h(fb.message) + '</p>' : '';
    var who = h(turn.team.name) + (turn.playerName ? ' — ' + h(turn.playerName) : '') +
      ' · svar ' + turn.answerNumber + ' af ' + E.ANSWERS_PER_TEAM;

    var fields = '';
    for (var i = 0; i < turn.slots; i++) {
      var value = fb && fb.inputs ? fb.inputs[i] : '';
      var invalid = fb && fb.field === i;
      var last = i === turn.slots - 1;
      fields += '<div class="answer-field">' +
        (multi ? '<span class="answer-num" aria-hidden="true">' + (i + 1) + '</span>' : '') +
        '<label class="visually-hidden" for="answer-input-' + i + '">Svar ' + (i + 1) + '</label>' +
        '<input id="answer-input-' + i + '" name="answer" value="' + h(value) + '"' +
          (invalid ? ' class="invalid" aria-invalid="true"' : '') +
          ' placeholder="' + (multi ? 'Svar ' + (i + 1) + '…' : 'Skriv jeres svar…') + '"' +
          ' autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="' + (last ? 'done' : 'next') + '">' +
      '</div>';
    }

    var panel = questionHeader(question(state)) +
      '<p class="turn-label">Tur: <strong>' + who + '</strong></p>' +
      '<form class="answer-form' + (multi ? ' answer-form-multi' : '') + '" data-form="answer" autocomplete="off" novalidate>' +
        '<div class="answer-fields">' + fields + '</div>' +
        '<button class="btn btn-primary btn-big" type="submit">' + (multi ? 'Gem ' + turn.slots + ' svar' : 'Gem svar') + '</button>' +
      '</form>' + fbHtml +
      '<p class="muted small answer-hint">Skriv “pas”, hvis I ikke kan komme på ' + (multi ? 'flere' : 'et svar') + ' — det giver 100 point.</p>' +
      '<h3 class="small-heading">Allerede givet</h3>' + givenList(state);
    return gameLayout(state, countdownEl(100), panel);
  }

  function resultText(entry) {
    if (entry.status === 'pass') {
      return '<p class="result result-wrong">PAS — 100 point</p>';
    }
    if (entry.status === 'wrong') {
      return '<p class="result result-wrong">FORKERT — 100 point</p>' +
        '<p class="muted">“' + h(entry.input) + '” er ikke på listen.</p>';
    }
    var corrected = entry.matched && entry.input.toLowerCase() !== entry.matched.toLowerCase() ?
      '<p class="muted">Du skrev “' + h(entry.input) + '”</p>' : '';
    if (entry.score === 0) {
      return '<p class="result result-pointless">POINTLESS!</p><p class="result-answer">' + h(entry.matched) + ' — 0 point</p>' + corrected;
    }
    return '<p class="result">' + entry.score + ' point</p><p class="result-answer">' + h(entry.matched) + '</p>' + corrected;
  }

  // Oversigt over holdets svar i turen: afslørede med point, det aktuelle fremhævet, resten venter.
  function revealList(state, rv) {
    var r = state.round;
    return '<ol class="reveal-list">' + r.pending.entries.map(function (e, i) {
      var shown = i < rv.index || (i === rv.index && r.revealDone);
      var cls = (i === rv.index ? 'current' : '') + (shown && isMiss(e) ? ' miss' : '') + (shown && !isMiss(e) && e.score === 0 ? ' pointless' : '');
      return '<li class="' + cls.trim() + '"><span class="reveal-input">' + h(shown ? entryLabel(e) : e.input) + '</span>' +
        '<b class="reveal-score">' + (shown ? e.score : '?') + '</b></li>';
    }).join('') + '</ol>';
  }

  function reveal(state) {
    var r = state.round;
    var rv = E.currentReveal(state);
    var entry = rv.entry;
    var multi = rv.total > 1;
    var isLast = rv.index === rv.total - 1;
    var total = r.pending.entries.reduce(function (sum, e) { return sum + e.score; }, 0);

    var body;
    if (r.revealDone) {
      body = resultText(entry) +
        (multi && isLast ? '<p class="turn-total">I alt denne tur: <strong>' + total + ' point</strong></p>' : '') +
        nextButton(multi && !isLast ? 'Næste svar' : 'Næste');
    } else {
      body = '<p class="result-waiting">' + (multi ? 'Svar ' + (rv.index + 1) + ' af ' + rv.total + ': ' : 'Svar: ') +
        '<strong>“' + h(entry.input) + '”</strong></p>' +
        '<p class="muted">' + (entry.status === 'pass' ? 'Holdet passede…' : 'Lad os se, hvor mange der sagde det…') + '</p>';
    }
    var panel = questionHeader(question(state)) +
      '<p class="turn-label"><strong>' + h(teamName(state, entry.teamId)) + '</strong>' + (entry.player ? ' — ' + h(entry.player) : '') + '</p>' +
      (multi ? revealList(state, rv) : '') +
      '<div class="reveal-body" aria-live="polite">' + body + '</div>';
    var cd = r.revealDone ?
      countdownEl(entry.score, { wrong: isMiss(entry) }) :
      countdownEl(100, { animate: true });
    return gameLayout(state, cd, panel);
  }

  function roundSummary(state) {
    var r = state.round;
    var q = question(state);
    var given = r.given;
    var givenNames = given.map(function (g) { return g.matched; });

    var rows = r.order.map(function (id) {
      var answers = given.filter(function (g) { return g.teamId === id; }).map(function (g) {
        return '<span class="chip' + (isMiss(g) ? ' chip-wrong' : '') + '">' + h(entryLabel(g)) + ' <b>' + g.score + '</b></span>';
      }).join(' ');
      var t = E.findTeam(state, id);
      return '<tr><th scope="row">' + h(t.name) + '</th><td>' + answers + '</td><td class="num">+' + t.questionScore + '</td>' +
        '<td class="num total">' + fmt(t.totalScore) + '</td></tr>';
    }).join('');
    var gameEnds = state.teams.some(function (t) { return t.totalScore >= E.TARGET_SCORE; });

    var hasPointless = q.answers.some(function (a) { return a.score === 0; });
    var pointless = q.answers.filter(function (a) { return a.score === 0 && givenNames.indexOf(a.name) === -1; });
    var pointlessHtml = pointless.length ?
      pointless.slice(0, MAX_POINTLESS_SHOWN).map(function (a) { return '<li>' + h(a.name) + '</li>'; }).join('') +
      (pointless.length > MAX_POINTLESS_SHOWN ? '<li class="muted">… og ' + (pointless.length - MAX_POINTLESS_SHOWN) + ' flere</li>' : '') :
      '<li class="muted">' + (hasPointless ? 'I fandt dem alle!' : 'Dette spørgsmål har ingen pointless-svar.') + '</li>';

    // Spørgsmål med kun nulsvar har ingen "mest givne svar".
    var onlyZero = q.answers.every(function (a) { return a.score === 0; });
    var top = onlyZero ?
      '<li class="muted">Kun nulsvar tæller i dette spørgsmål.</li>' :
      q.answers.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, TOP_ANSWERS_SHOWN)
        .map(function (a) { return '<li>' + h(a.name) + ' <b>' + a.score + '</b></li>'; }).join('');

    var panel = questionHeader(q) +
      '<h2 class="small-heading">Spørgsmålets svar</h2>' +
      '<div class="table-wrap"><table class="summary-table"><thead><tr><th>Hold</th><th>Svar</th>' +
        '<th class="num">Point</th><th class="num">I alt</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="summary-cols">' +
        '<div><h3 class="small-heading">Pointless-svar</h3><ul class="answer-list pointless-list">' + pointlessHtml + '</ul></div>' +
        '<div><h3 class="small-heading">Mest givne svar</h3><ol class="answer-list">' + top + '</ol></div>' +
      '</div>' +
      '<h2 class="small-heading">Stilling — første hold til ' + fmt(E.TARGET_SCORE) + ' point taber</h2>' + scoreboard(state, { showQuestion: true }) +
      (gameEnds ? '<p class="feedback">Et hold har nået ' + fmt(E.TARGET_SCORE) + ' point — spillet er slut!</p>' : '') +
      nextButton(gameEnds ? 'Se resultatet' : 'Næste spørgsmål');
    return gameLayout(state, null, panel);
  }

  function names(state, ids) {
    return ids.map(function (id) { return h(teamName(state, id)); }).join(' og ');
  }

  function gameOver(state) {
    var res = state.result;
    var confetti = '';
    for (var i = 0; i < 24; i++) {
      confetti += '<i style="left:' + ((i * 37) % 100) + '%;animation-delay:' + ((i % 8) * 0.35) + 's"></i>';
    }
    var loserTeam = E.findTeam(state, res.loserIds[0]);
    return '<div class="screen center winner">' +
      '<div class="confetti" aria-hidden="true">' + confetti + '</div>' +
      '<p class="intro-kicker">' + (res.winnerIds.length > 1 ? 'Vinderne er…' : 'Og vinderen er…') + '</p>' +
      '<h1 class="winner-name">' + names(state, res.winnerIds) + '</h1>' +
      '<p class="big-text loser-line">' + names(state, res.loserIds) + ' nåede ' + fmt(loserTeam.totalScore) + ' point og taber 💥</p>' +
      '<p class="muted">Efter ' + res.questions + ' spørgsmål</p>' +
      '<section class="panel final-board"><h2 class="small-heading">Slutstilling</h2>' + scoreboard(state) + '</section>' +
      '<div class="row center-row">' +
        '<button class="btn btn-primary btn-big" data-action="new-game">Nyt spil</button>' +
      '</div>' +
    '</div>';
  }

  var byPhase = {
    INTRO: intro,
    ROUND_INTRO: roundIntro,
    HANDOFF: handoff,
    ANSWERING: answering,
    REVEAL: reveal,
    ROUND_SUMMARY: roundSummary,
    GAME_OVER: gameOver
  };

  /**
   * @param {object} state - game state
   * @param {{view: 'menu'|'game', editId?: string, notice?: string}} ui - lokal UI-tilstand (gemmes ikke)
   */
  function render(state, ui) {
    if (ui.view === 'menu' || state.phase === 'SETUP') return menu(state, ui);
    var fn = byPhase[state.phase];
    return fn ? fn(state, ui) : menu(state, ui);
  }

  JFM.screens = { render: render, escapeHtml: h };
})(window.JFM = window.JFM || {});
