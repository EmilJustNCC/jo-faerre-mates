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
    if (r.type === 'h2h') {
      return 'Head-to-Head · Spørgsmål ' + r.number + (r.attempt > 1 ? ' · Nyt forsøg' : '');
    }
    var byPhaseLabel = { ROUND_SUMMARY: 'Resultat', TIEBREAK: 'Omspil', ELIMINATION: 'Eliminering' };
    var stage = byPhaseLabel[state.phase] || { pass1: '1. pas', pass2: '2. pas', tiebreak: 'Omspil' }[r.stage] || '';
    return 'Runde ' + r.number + (stage ? ' · ' + stage : '');
  }

  function playersText(team) { return team.players.map(h).join(' & '); }

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

  function podiums(state) {
    var r = state.round;
    var turn = E.currentTurn(state);
    var activeId = turn && ['HANDOFF', 'ANSWERING', 'REVEAL'].indexOf(state.phase) !== -1 ? turn.team.id : null;

    if (r && r.type === 'h2h') {
      var items = r.order.map(function (id) {
        var t = E.findTeam(state, id);
        var dots = '';
        for (var i = 0; i < E.H2H_WINS_NEEDED; i++) dots += '<span class="dot' + (i < t.h2hWins ? ' on' : '') + '"></span>';
        var score = r.scores[id];
        return '<li class="podium' + (id === activeId ? ' active' : '') + '">' +
          '<span class="podium-name">' + h(t.name) + '</span>' +
          '<span class="podium-players">' + playersText(t) + '</span>' +
          '<span class="podium-score">' + (score == null ? '–' : score) + '</span>' +
          '<span class="podium-dots" aria-label="' + t.h2hWins + ' vundne">' + dots + '</span>' +
        '</li>';
      }).join('');
      return '<ul class="podiums">' + items + '</ul>';
    }

    var list = state.teams.map(function (t) {
      var cls = 'podium' + (t.id === activeId ? ' active' : '') + (t.eliminated ? ' eliminated' : '');
      if (r && r.eliminatedId === t.id && state.phase === 'ELIMINATION') cls += ' out';
      var tb = r && r.tiebreak && r.tiebreak.scores[t.id] != null ? '<span class="podium-extra">Omspil: ' + r.tiebreak.scores[t.id] + '</span>' : '';
      return '<li class="' + cls + '">' +
        '<span class="podium-name">' + h(t.name) + '</span>' +
        '<span class="podium-players">' + playersText(t) + '</span>' +
        '<span class="podium-score">' + (t.eliminated && !(r && r.eliminatedId === t.id) ? 'UDE' : t.roundScore) + '</span>' +
        tb +
      '</li>';
    }).join('');
    return '<ul class="podiums">' + list + '</ul>';
  }

  function givenList(state) {
    var given = state.round.given;
    if (!given.length) return '<p class="muted small">Ingen svar endnu i denne runde.</p>';
    return '<ul class="chips">' + given.map(function (g) {
      var label = g.matched || g.input;
      return '<li class="chip' + (g.status === 'wrong' ? ' chip-wrong' : '') + '" title="' + h(teamName(state, g.teamId)) + '">' +
        h(label) + ' <b>' + g.score + '</b></li>';
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
    var rows = state.teams.map(function (t) {
      return '<li class="team-row' + (t.eliminated ? ' eliminated' : '') + '"><div><strong>' + h(t.name) + '</strong>' +
        '<span class="muted"> · ' + playersText(t) + '</span></div><span>' + (t.eliminated ? 'Ude' : 'Med') + '</span></li>';
    }).join('');
    return '<aside class="panel designer"><h2>Spil i gang</h2>' +
      '<p class="muted">' + h(stageLabel(state) || 'Spillet er startet') + '</p>' +
      '<ul class="team-list">' + rows + '</ul></aside>';
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
      '<p class="muted">Færrest point vinder. Find de svar, som ingen andre tænkte på!</p>' +
      nextButton('Lad spillet begynde!', ' style="animation-delay:' + (0.8 + state.teams.length * 0.25) + 's"') +
    '</div>';
  }

  function roundIntro(state) {
    var r = state.round;
    var rows = r.order.map(function (id, i) {
      var t = E.findTeam(state, id);
      var choice;
      if (t.players.length > 1) {
        choice = '<div class="choice" role="group" aria-label="Hvem tager 1. pas for ' + h(t.name) + '">' +
          t.players.map(function (p, idx) {
            var on = t.passPlayerIdx[0] === idx;
            return '<button class="btn btn-toggle' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-action="choose-pass" data-team="' + h(t.id) + '" data-idx="' + idx + '">' + h(p) + '</button>';
          }).join('') + '</div>';
      } else {
        choice = '<p class="muted small">' + h(t.players[0]) + ' tager begge pas.</p>';
      }
      return '<li class="order-row"><span class="order-num">' + (i + 1) + '</span>' +
        '<div class="order-team"><strong>' + h(t.name) + '</strong>' +
        (t.players.length > 1 ? '<span class="muted small">Hvem tager 1. pas?</span>' : '') + '</div>' + choice + '</li>';
    }).join('');

    var orderNote = r.number === 1 ? 'Rækkefølgen er trukket lod.' : 'Rækkefølgen går efter færrest point i sidste runde.';
    return '<div class="screen game">' + topBar(state) +
      '<section class="panel round-intro">' +
        '<h1 class="round-title">RUNDE ' + r.number + '</h1>' +
        '<p class="muted">' + orderNote + ' 2. pas tages i omvendt rækkefølge. Spørgsmålet vises først, når enheden er givet videre.</p>' +
        '<ol class="order-list">' + rows + '</ol>' +
        nextButton('Start runden') +
      '</section></div>';
  }

  function handoff(state) {
    var turn = E.currentTurn(state);
    var who = turn.playerName ?
      '<p class="handoff-player">' + h(turn.playerName) + '</p>' :
      '<p class="handoff-player">Hele holdet</p><p class="muted">I må gerne konferere.</p>';
    return '<div class="screen center handoff">' +
      '<p class="muted">' + h(stageLabel(state)) + '</p>' +
      '<p class="handoff-kicker">Giv enheden til</p>' +
      '<h1 class="handoff-team">' + h(turn.team.name) + '</h1>' + who +
      '<button class="btn btn-primary btn-big" data-action="ready">Jeg er klar</button>' +
      '<button class="btn btn-ghost btn-small" data-action="show-menu">☰ Menu</button>' +
    '</div>';
  }

  function answering(state) {
    var r = state.round;
    var turn = E.currentTurn(state);
    var fb = r.lastFeedback ? '<p class="feedback" role="alert">' + h(r.lastFeedback.message) + '</p>' : '';
    var who = h(turn.team.name) + (turn.playerName ? ' — ' + h(turn.playerName) : ' — hele holdet');
    var panel = questionHeader(question(state)) +
      '<p class="turn-label">Tur: <strong>' + who + '</strong></p>' +
      '<form class="answer-form" data-form="answer" autocomplete="off">' +
        '<label class="visually-hidden" for="answer-input">Dit svar</label>' +
        '<input id="answer-input" name="answer" placeholder="Skriv dit svar…" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="done">' +
        '<button class="btn btn-primary btn-big" type="submit">Gem svar</button>' +
      '</form>' + fb +
      '<h3 class="small-heading">Allerede givet</h3>' + givenList(state);
    return gameLayout(state, countdownEl(100), panel);
  }

  function resultText(entry) {
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

  function reveal(state) {
    var r = state.round;
    var entry = r.pending;
    var body = r.revealDone ?
      resultText(entry) + nextButton('Næste') :
      '<p class="result-waiting">Svar: <strong>“' + h(entry.input) + '”</strong></p><p class="muted">Lad os se, hvor mange der sagde det…</p>';
    var panel = questionHeader(question(state)) +
      '<p class="turn-label"><strong>' + h(teamName(state, entry.teamId)) + '</strong>' + (entry.player ? ' — ' + h(entry.player) : '') + '</p>' +
      '<div class="reveal-body" aria-live="polite">' + body + '</div>';
    var cd = r.revealDone ?
      countdownEl(entry.score, { wrong: entry.status === 'wrong' }) :
      countdownEl(100, { animate: true });
    return gameLayout(state, cd, panel);
  }

  function roundSummary(state) {
    var r = state.round;
    var q = question(state);
    var given = r.roundGiven || r.given;
    var givenNames = given.map(function (g) { return g.matched; });

    var rows = r.order.map(function (id) {
      var answers = given.filter(function (g) { return g.teamId === id; }).map(function (g) {
        return '<span class="chip' + (g.status === 'wrong' ? ' chip-wrong' : '') + '">' + h(g.matched || g.input) + ' <b>' + g.score + '</b></span>';
      }).join(' ');
      return '<tr><th scope="row">' + h(teamName(state, id)) + '</th><td>' + answers + '</td><td class="num">' + E.findTeam(state, id).roundScore + '</td></tr>';
    }).join('');

    var hasPointless = q.answers.some(function (a) { return a.score === 0; });
    var pointless = q.answers.filter(function (a) { return a.score === 0 && givenNames.indexOf(a.name) === -1; });
    var pointlessHtml = pointless.length ?
      pointless.slice(0, MAX_POINTLESS_SHOWN).map(function (a) { return '<li>' + h(a.name) + '</li>'; }).join('') +
      (pointless.length > MAX_POINTLESS_SHOWN ? '<li class="muted">… og ' + (pointless.length - MAX_POINTLESS_SHOWN) + ' flere</li>' : '') :
      '<li class="muted">' + (hasPointless ? 'I fandt dem alle!' : 'Dette spørgsmål har ingen pointless-svar.') + '</li>';

    var top = q.answers.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, TOP_ANSWERS_SHOWN)
      .map(function (a) { return '<li>' + h(a.name) + ' <b>' + a.score + '</b></li>'; }).join('');

    var panel = questionHeader(q) +
      '<h2 class="small-heading">Rundens svar</h2>' +
      '<div class="table-wrap"><table class="summary-table"><thead><tr><th>Hold</th><th>Svar</th><th class="num">Point</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="summary-cols">' +
        '<div><h3 class="small-heading">Pointless-svar</h3><ul class="answer-list pointless-list">' + pointlessHtml + '</ul></div>' +
        '<div><h3 class="small-heading">Mest givne svar</h3><ol class="answer-list">' + top + '</ol></div>' +
      '</div>' + nextButton('Hvem ryger ud?');
    return gameLayout(state, null, panel);
  }

  function tiebreak(state) {
    var tb = state.round.tiebreak;
    var names = tb.teamIds.map(function (id) { return '<strong>' + h(teamName(state, id)) + '</strong>'; }).join(' og ');
    var text = tb.sameQuestion ?
      '<p>' + names + ' står lige med flest point.</p><p>Hvert hold giver ét ekstra svar på samme spørgsmål — I må gerne konferere. Højeste score ryger ud.</p>' :
      '<p>Stadig lige mellem ' + names + '!</p><p>Nu kommer et helt nyt spørgsmål kun til jer. Højeste score ryger ud.</p>';
    var panel = '<h1 class="round-title">UAFGJORT!</h1>' + text + nextButton(tb.sameQuestion ? 'Start omspil' : 'Nyt spørgsmål');
    return gameLayout(state, null, panel);
  }

  function elimination(state) {
    var r = state.round;
    var out = E.findTeam(state, r.eliminatedId);
    var remaining = E.activeTeams(state).length;
    var panel = '<h1 class="round-title">FARVEL!</h1>' +
      '<p class="big-text"><strong>' + h(out.name) + '</strong> er ude af spillet med ' + out.roundScore + ' point.</p>' +
      '<p class="muted">' + remaining + ' hold er tilbage.</p>' +
      nextButton(remaining > 2 ? 'Næste runde' : 'Videre til Head-to-Head');
    return gameLayout(state, null, panel);
  }

  function h2hIntro(state) {
    var r = state.round;
    var a = E.findTeam(state, r.order[0]);
    var b = E.findTeam(state, r.order[1]);
    var panel = '<h1 class="round-title">HEAD-TO-HEAD</h1>' +
      '<div class="versus"><span>' + h(a.name) + '</span><span class="vs">VS</span><span>' + h(b.name) + '</span></div>' +
      '<p>Hvert hold konfererer og giver ét svar pr. spørgsmål. Laveste score vinder spørgsmålet. ' +
      'Første hold til <strong>' + E.H2H_WINS_NEEDED + ' vundne spørgsmål</strong> vinder spillet.</p>' +
      '<p class="muted">' + h(a.name) + ' svarer først på spørgsmål 1. Derefter skiftes I.</p>' +
      nextButton('Første spørgsmål');
    return gameLayout(state, null, panel);
  }

  function h2hResult(state) {
    var r = state.round;
    var answers = r.turns.map(function (turn) {
      var entry = r.given.filter(function (g) { return g.teamId === turn.teamId; }).pop();
      return '<li><strong>' + h(teamName(state, turn.teamId)) + '</strong>: ' + h(entry.matched || entry.input) +
        ' <b>' + entry.score + '</b></li>';
    }).join('');
    var finished = E.activeTeams(state).some(function (t) { return t.h2hWins >= E.H2H_WINS_NEEDED; });
    var outcome = r.outcome.tie ?
      '<p class="result">LIGE!</p><p>Begge hold giver et nyt svar på samme spørgsmål.</p>' :
      '<p class="result">' + h(teamName(state, r.outcome.winnerId)) + ' vinder spørgsmålet!</p>';
    var label = finished ? 'Se vinderen' : (r.outcome.tie ? 'Svar igen' : 'Næste spørgsmål');
    var panel = questionHeader(question(state)) + '<ul class="answer-list">' + answers + '</ul>' + outcome + nextButton(label);
    return gameLayout(state, null, panel);
  }

  function winner(state) {
    var t = E.findTeam(state, state.winnerId);
    var confetti = '';
    for (var i = 0; i < 24; i++) {
      confetti += '<i style="left:' + ((i * 37) % 100) + '%;animation-delay:' + ((i % 8) * 0.35) + 's"></i>';
    }
    return '<div class="screen center winner">' +
      '<div class="confetti" aria-hidden="true">' + confetti + '</div>' +
      '<p class="intro-kicker">Og vinderen er…</p>' +
      '<h1 class="winner-name">' + h(t.name) + '</h1>' +
      '<p class="big-text">' + playersText(t) + '</p>' +
      '<p class="muted">Vandt Head-to-Head ' + t.h2hWins + '–' + E.activeTeams(state).filter(function (x) { return x.id !== t.id; })[0].h2hWins + '</p>' +
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
    TIEBREAK: tiebreak,
    ELIMINATION: elimination,
    H2H_INTRO: h2hIntro,
    H2H_RESULT: h2hResult,
    WINNER: winner
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
