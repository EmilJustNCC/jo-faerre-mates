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

  function bank() {
    return {
      questions: (window.JFM_QUESTIONS && window.JFM_QUESTIONS.questions) || [],
      anagrams: window.JFM_ANAGRAMS || [],
      connections: window.JFM_CONNECTIONS || []
    };
  }

  function question(state) {
    return state.round && state.round.questionId ? E.findQuestion(bank(), state.round.questionId) : null;
  }

  function item(category, id) { return E.findItem(bank(), category, id); }

  function teamName(state, id) {
    var t = E.findTeam(state, id);
    return t ? t.name : '?';
  }

  function categoryName(category) { return E.CATEGORY_NAMES[category] || ''; }

  function stageLabel(state) {
    var r = state.round;
    if (!r) return '';
    if (state.phase === 'GAME_OVER') return 'Slutstilling';
    return 'Runde ' + r.number + ' · ' + categoryName(r.category) + (state.phase === 'ROUND_SUMMARY' ? ' · Resultat' : '');
  }

  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  function progressPct(team) { return Math.min(100, Math.round(team.totalScore / E.TARGET_SCORE * 100)); }

  function playersText(team) { return team.players.map(h).join(' & '); }

  // Holdfarve som CSS-variabler: --team (farven) og --team-ink (tekst på farven).
  function colorVars(colorId) {
    var c = E.findColor(colorId) || { hex: '#67e8f9', ink: '#0b0f3a' };
    return '--team:' + c.hex + ';--team-ink:' + c.ink;
  }
  function teamStyle(team) { return ' style="' + colorVars(team && team.color) + '"'; }

  // Tekst for et givet svar: det matchede navn, "Pas" eller det indtastede (ved forkert svar).
  function entryLabel(entry) {
    if (entry.status === 'pass') return 'Pas';
    return entry.matched || entry.input;
  }

  function isMiss(entry) { return entry.status === 'wrong' || entry.status === 'pass' || entry.status === 'timeout'; }

  // Options til countdown-søjlen for et svar (bruges også af app.js ved animation).
  // Anagrammer og Sammenhæng tæller ikke ned: kun korrekt (KORREKT!) eller ikke korrekt (rødt kryds).
  function countdownOpts(state, entry) {
    var category = state.round && state.round.category;
    var binary = !!category && category !== 'pointless';
    return { wrong: isMiss(entry), zeroLabel: binary ? 'KORREKT!' : 'POINTLESS!', instant: binary };
  }

  function timerEl(seconds) {
    return '<div class="timer" data-timer>' +
      '<span class="timer-bar"><span data-timer-bar></span></span>' +
      '<span class="timer-number" data-timer-number>' + seconds + '</span>' +
    '</div>';
  }

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
      (o.zeroLabel ? ' data-zero-label="' + h(o.zeroLabel) + '"' : '') +
      (o.animate ? ' data-animate="1"' : '') + '></div></div>';
  }

  function questionHeader(q) {
    if (!q) return '';
    return '<div class="q-pill">' + h(q.title) + '</div>' +
      '<p class="q-instruction">' + h(q.instruction) + '</p>';
  }

  // Farvet bjælke øverst på svarskærmen: hvilket hold (og hvem) der har tur.
  function teamBar(state) {
    var turn = E.currentTurn(state);
    var t = turn.team;
    var sub = playersText(t) + (turn.answersTotal > 1 ? ' · svar ' + turn.answerNumber + ' af ' + turn.answersTotal : '');
    return '<div class="team-bar"' + teamStyle(t) + '>' +
      '<span class="team-bar-name">' + h(t.name) + '</span>' +
      '<span class="team-bar-sub">' + sub + '</span></div>';
  }

  function pointlessBadge(team) {
    return '<span class="podium-star" title="Pointless-svar — ' + E.POINTLESS_TO_WIN + ' giver sejr">★ ' +
      team.pointlessCount + '/' + E.POINTLESS_TO_WIN + '</span>';
  }

  // Podier i bunden af spilskærmen: samlet score (opdateres efter hvert afsløret svar),
  // point i denne runde, pointless-tæller og en bjælke mod 1000. Det aktive hold gløder i sin farve.
  function podiums(state) {
    var turn = E.currentTurn(state);
    var activeId = turn && ['HANDOFF', 'ANSWERING', 'REVEAL'].indexOf(state.phase) !== -1 ? turn.team.id : null;
    var list = state.teams.map(function (t) {
      var pct = progressPct(t);
      var cls = 'podium' + (t.id === activeId ? ' active' : (activeId ? ' inactive' : '')) + (pct >= 80 ? ' danger' : '');
      return '<li class="' + cls + '"' + teamStyle(t) + '>' +
        '<span class="podium-name">' + h(t.name) + '</span>' +
        '<span class="podium-players">' + playersText(t) + '</span>' +
        '<span class="podium-score">' + fmt(t.totalScore) + '</span>' +
        '<span class="podium-extra">' + (t.questionScore ? '+' + t.questionScore + ' denne runde' : '&nbsp;') + '</span>' +
        pointlessBadge(t) +
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
      return '<li class="' + cls + '"' + teamStyle(t) + '>' +
        '<span class="sb-rank">' + (i + 1) + '</span>' +
        '<span class="sb-name">' + h(t.name) + '</span>' +
        '<span class="sb-bar" aria-hidden="true"><span style="width:' + pct + '%"></span></span>' +
        '<span class="sb-total">' + fmt(t.totalScore) + '</span>' +
        (o.showQuestion ? '<span class="sb-delta">+' + t.questionScore + '</span>' : '') +
      '</li>';
    }).join('') + '</ol>';
  }

  // Chip i holdets farve: "Perth 39" eller "Melborne ✗".
  function chip(label, score, miss, colorId, tag) {
    var el = tag || 'li';
    return '<' + el + ' class="chip chip-team' + (miss ? ' chip-wrong' : '') + '" style="' + colorVars(colorId) + '">' +
      h(label) + (miss ? ' <b>✗</b>' : ' <b>' + score + '</b>') + '</' + el + '>';
  }

  function givenList(state) {
    // "Pas" vises ikke her — det er ikke et svar, andre kan bruge.
    var given = state.round.given.filter(function (g) { return g.status !== 'pass'; });
    if (!given.length) return '<p class="muted small">Ingen svar endnu i denne runde.</p>';
    return '<ul class="chips">' + given.map(function (g) {
      var t = E.findTeam(state, g.teamId);
      return chip(entryLabel(g), g.score, isMiss(g), t && t.color);
    }).join('') + '</ul>';
  }

  // "Svar fra tidligere spil": vises, når et Jo Færre Jo Bedre-spørgsmål er spillet før i sessionen.
  function previousAnswersBox(state) {
    var list = E.previousAnswers(state, state.round.questionId).filter(function (a) { return a.status !== 'pass'; });
    if (!list.length) return '';
    return '<section class="history-box" aria-label="Svar fra tidligere spil">' +
      '<h3 class="small-heading">Svar fra tidligere spil</h3>' +
      '<ul class="chips history-chips">' + list.map(function (a) {
        var miss = a.status !== 'correct';
        return '<li class="chip chip-team' + (miss ? ' chip-wrong' : '') + '" style="' + colorVars(a.teamColor) + '" title="' +
          h(a.teamName) + ' · spil ' + a.game + '">' +
          h(miss ? a.input : a.matched) + (miss ? ' ✗' : ' · ' + a.score) + '</li>';
      }).join('') + '</ul></section>';
  }

  // Spilskærmens grundlayout: countdown til venstre, panel til højre, podier i bunden.
  function gameLayout(state, cdHtml, panelHtml, panelAttrs) {
    return '<div class="screen game">' + topBar(state) +
      '<div class="game-main phase-' + state.phase.toLowerCase() + ' cat-' + (state.round ? state.round.category : '') +
        (cdHtml ? '' : ' no-cd') + '">' + (cdHtml || '') +
        '<section class="panel game-panel"' + (panelAttrs || '') + '>' + panelHtml + '</section>' +
      '</div>' + podiums(state) + '</div>';
  }

  function nextButton(label, extra) {
    return '<button class="btn btn-primary btn-big" data-action="next"' + (extra || '') + '>' + h(label) + '</button>';
  }

  // ---------- Startskærm og holddesigner ----------

  function colorPicker(state, editing) {
    var selected = editing ? editing.color : E.firstFreeColor(state.teams, null);
    return '<fieldset class="color-picker"><legend>Farve</legend><div class="swatches">' +
      E.TEAM_COLORS.map(function (c) {
        var owner = state.teams.filter(function (t) { return t.color === c.id && (!editing || t.id !== editing.id); })[0];
        return '<label class="swatch' + (owner ? ' taken' : '') + '" style="' + colorVars(c.id) + '" title="' +
          h(c.name + (owner ? ' — optaget af ' + owner.name : '')) + '">' +
          '<input type="radio" name="color" value="' + c.id + '"' + (c.id === selected ? ' checked' : '') + (owner ? ' disabled' : '') + '>' +
          '<span class="swatch-dot" aria-hidden="true"></span><span class="swatch-name">' + h(c.name) + '</span></label>';
      }).join('') + '</div></fieldset>';
  }

  function teamDesigner(state, ui) {
    var editing = ui.editId ? E.findTeam(state, ui.editId) : null;
    var full = state.teams.length >= E.MAX_TEAMS;
    var list = state.teams.length ? state.teams.map(function (t) {
      return '<li class="team-row"' + teamStyle(t) + '>' +
        '<div><span class="team-dot" aria-hidden="true"></span><strong>' + h(t.name) + '</strong><span class="muted"> · ' + playersText(t) + '</span></div>' +
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
        colorPicker(state, editing) +
        '<p class="form-error" data-role="form-error" role="alert"></p>' +
        '<div class="row">' +
          '<button class="btn btn-primary" type="submit">' + (editing ? 'Gem ændringer' : 'Tilføj hold') + '</button>' +
          (editing ? '<button class="btn btn-ghost" type="button" data-action="cancel-edit">Annullér</button>' : '') +
        '</div>' +
      '</form>' : '<p class="muted max-teams">Maks ' + E.MAX_TEAMS + ' hold</p>';

    return '<aside class="panel designer" id="designer">' +
      '<h2>Holddesigner <span class="muted small">' + state.teams.length + '/' + E.MAX_TEAMS + '</span></h2>' +
      '<ul class="team-list">' + list + '</ul>' + form + '</aside>';
  }

  function progressPanel(state) {
    return '<aside class="panel designer"><h2>Spil i gang</h2>' +
      '<p class="muted">' + h(stageLabel(state) || 'Spillet er startet') + '</p>' +
      scoreboard(state) + '</aside>';
  }

  function resetDialog() {
    return '<div class="modal-backdrop">' +
      '<div class="panel modal" role="alertdialog" aria-modal="true" aria-labelledby="reset-title">' +
        '<h2 id="reset-title">Nulstil alle spil</h2>' +
        '<p>Er du sikker? Alle hold, point og tidligere svar slettes.</p>' +
        '<div class="row center-row">' +
          '<button class="btn btn-primary btn-danger-fill" data-action="reset-confirm">Ja, nulstil</button>' +
          '<button class="btn btn-ghost" data-action="reset-cancel">Annullér</button>' +
        '</div>' +
      '</div></div>';
  }

  function menu(state, ui) {
    var inProgress = E.isInProgress(state);
    var items = inProgress ?
      '<button class="menu-item" data-action="continue">Fortsæt spil</button>' +
      '<button class="menu-item" data-action="abandon-game">Nyt spil</button>' :
      '<button class="menu-item" data-action="focus-team-form">Opret hold</button>' +
      '<button class="menu-item" data-action="start-game"' + (E.canStart(state) ? '' : ' disabled') + '>Start spillet!</button>';
    items += '<button class="menu-item menu-item-danger" data-action="reset-all">Nulstil alle spil</button>';

    var hint = inProgress ? '' : (E.canStart(state) ? '' :
      '<p class="muted small">Opret mindst ' + E.MIN_TEAMS + ' hold for at starte.</p>');

    var notice = ui.notice ? '<p class="notice" role="status">' + h(ui.notice) + '</p>' : '';
    var games = state.session.gamesPlayed;
    var sessionInfo = games ? '<p class="muted small session-info">' + games +
      ' spil siden sidste nulstilling — spørgsmål genbruges ikke, før puljen er brugt.</p>' : '';

    return '<div class="screen start">' +
      '<section class="start-main">' +
        '<h1 class="arcade-title" aria-label="Jo færre mates jo bedre">' +
          '<span>JO FÆRRE</span><span>MATES</span><span>JO BEDRE</span></h1>' +
        '<nav class="menu" aria-label="Hovedmenu">' + items + '</nav>' + hint + notice + sessionInfo +
        '<details class="backup-tools"><summary>Backup</summary>' +
          '<p class="muted small">Spillet gemmes automatisk i browseren. Her kan du gemme en kopi som fil eller indlæse en.</p>' +
          '<div class="row">' +
            '<button class="btn btn-ghost btn-small" data-action="export">Gem backup-fil</button>' +
            '<button class="btn btn-ghost btn-small" data-action="import">Indlæs backup-fil</button>' +
          '</div>' +
          '<input type="file" accept=".json,application/json" data-role="import-file" hidden>' +
        '</details>' +
        '<footer class="version muted small">v' + h(JFM.APP_VERSION || '') + '</footer>' +
      '</section>' +
      (inProgress ? progressPanel(state) : teamDesigner(state, ui)) +
      (ui.confirmReset ? resetDialog() : '') +
    '</div>';
  }

  // ---------- Spilfaser ----------

  function intro(state) {
    var teams = state.teams.map(function (t, i) {
      return '<li class="intro-team"' + teamStyle(t).replace('"', '"animation-delay:' + (0.6 + i * 0.25) + 's;') + '>' + h(t.name) + '</li>';
    }).join('');
    return '<div class="screen center intro">' +
      '<p class="intro-kicker">Velkommen til</p>' +
      '<h1 class="arcade-title small-title"><span>JO FÆRRE</span><span>MATES</span><span>JO BEDRE</span></h1>' +
      '<ul class="intro-teams">' + teams + '</ul>' +
      '<p class="muted">Find de svar, som ingen andre tænkte på! Første hold til ' + fmt(E.TARGET_SCORE) + ' point taber — ' +
        'men ' + E.POINTLESS_TO_WIN + ' pointless-svar giver automatisk sejr.</p>' +
      nextButton('Lad spillet begynde!', ' style="animation-delay:' + (0.8 + state.teams.length * 0.25) + 's"') +
    '</div>';
  }

  function roundRules(state) {
    var r = state.round;
    var per = r.answersPerTeam;
    var each = per === 1 ? 'ét svar' : per + ' svar — ét ad gangen, på skift';
    if (r.category === 'anagram') {
      return '<p>Hvert hold får <strong>sit eget anagram</strong>' + (per > 1 ? ' (' + per + ' pr. hold, på skift)' : '') +
        ' og har <strong>' + E.ANAGRAM_SECONDS + ' sekunder</strong> fra “Jeg er klar”. Temaet står som hint.</p>' +
        '<p class="muted">Korrekt = <strong>0 point</strong>. Ikke korrekt eller for sent = <strong>' + E.ANAGRAM_WRONG_SCORE + ' point</strong>.</p>';
    }
    if (r.category === 'connections') {
      return '<p>Hvert hold får <strong>sin egen opgave</strong>' + (per > 1 ? ' (' + per + ' pr. hold, på skift)' : '') +
        ': 12 ord, hvor <strong>4 hører sammen</strong>. Vælg de 4, og tryk “Indsend” inden for <strong>' +
        E.CONNECTION_SECONDS + ' sekunder</strong>. Ét forsøg.</p>' +
        '<p class="muted">Alle 4 rigtige = <strong>0 point</strong>. Ikke korrekt eller for sent = <strong>' +
        E.CONNECTION_WRONG_SCORE + ' point</strong>.</p>';
    }
    return '<p>Hvert hold giver <strong>' + each + '</strong>. Enheden går videre efter hvert svar. ' +
      'Kan I ikke komme på et svar, så skriv <strong>“pas”</strong> — det giver 100 point.</p>' +
      '<p class="muted">0 point = <strong>pointless</strong>. ' + E.POINTLESS_TO_WIN + ' pointless-svar i et spil giver automatisk sejr. ' +
      'Spørgsmålet vises først, når enheden er givet videre.</p>';
  }

  function roundIntro(state) {
    var r = state.round;
    var rows = r.order.map(function (id, i) {
      var t = E.findTeam(state, id);
      return '<li class="order-row"' + teamStyle(t) + '><span class="order-num">' + (i + 1) + '</span>' +
        '<div class="order-team"><strong>' + h(t.name) + '</strong>' +
        '<span class="muted small">' + playersText(t) + '</span></div></li>';
    }).join('');

    var orderNote = r.number === 1 ? 'Rækkefølgen er trukket lod.' :
      (r.answersPerTeam === 1 ? 'Rækkefølgen rykker én plads hver runde.' : 'Et nyt hold starter hver runde.');
    return '<div class="screen game">' + topBar(state) +
      '<section class="panel round-intro cat-' + r.category + '">' +
        '<h1 class="round-title">RUNDE ' + r.number + ' <span class="round-cat">— ' + h(categoryName(r.category).toUpperCase()) + '</span></h1>' +
        roundRules(state) +
        '<p class="muted small">' + orderNote + ' Første hold til <strong>' + fmt(E.TARGET_SCORE) + ' point</strong> taber.</p>' +
        '<ol class="order-list">' + rows + '</ol>' +
        (r.number > 1 ? '<h2 class="small-heading">Stilling</h2>' + scoreboard(state) : '') +
        nextButton('Start runden') +
      '</section></div>';
  }

  function handoff(state) {
    var turn = E.currentTurn(state);
    var who = turn.team.players.length === 1 ?
      '<p class="handoff-player">' + h(turn.team.players[0]) + '</p>' :
      '<p class="handoff-player">Hele holdet</p><p class="handoff-note">I må gerne konferere.</p>';
    return '<div class="screen center handoff"' + teamStyle(turn.team) + '>' +
      '<p class="handoff-meta">' + h(stageLabel(state)) +
        (turn.answersTotal > 1 ? ' · Svar ' + turn.answerNumber + ' af ' + turn.answersTotal : '') + '</p>' +
      '<p class="handoff-kicker">Giv enheden til</p>' +
      '<h1 class="handoff-team">' + h(turn.team.name) + '</h1>' + who +
      (E.TIMER_SECONDS[state.round.category] ? '<p class="handoff-note">Timeren på ' + E.TIMER_SECONDS[state.round.category] +
        ' sekunder starter, når I trykker.</p>' : '') +
      '<button class="btn btn-primary btn-big" data-action="ready">Jeg er klar</button>' +
      '<button class="btn btn-ghost btn-small" data-action="show-menu">☰ Menu</button>' +
    '</div>';
  }

  function answerFields(state, opts) {
    var r = state.round;
    var turn = E.currentTurn(state);
    var fb = r.lastFeedback;
    var multi = turn.slots > 1;
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
          ' placeholder="' + (multi ? 'Svar ' + (i + 1) + '…' : h(opts.placeholder)) + '"' +
          ' autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="' + (last ? 'done' : 'next') + '">' +
      '</div>';
    }
    return '<form class="answer-form' + (multi ? ' answer-form-multi' : '') + '" data-form="answer" autocomplete="off" novalidate>' +
        '<div class="answer-fields">' + fields + '</div>' +
        '<button class="btn btn-primary btn-big" type="submit">' + (multi ? 'Gem ' + turn.slots + ' svar' : 'Gem svar') + '</button>' +
      '</form>' + (fb ? '<p class="feedback" role="alert">' + h(fb.message) + '</p>' : '');
  }

  function answeringPointless(state) {
    var r = state.round;
    var turn = E.currentTurn(state);
    var swap = !r.given.length ?
      '<button class="btn btn-ghost btn-small swap-btn" data-action="swap-question" title="Vi har haft dette spørgsmål før — vælg et andet">↻ Spørgsmål gentaget</button>' : '';
    var panel = teamBar(state) + questionHeader(question(state)) +
      answerFields(state, { placeholder: 'Skriv jeres svar…' }) +
      '<p class="muted small answer-hint">Skriv “pas”, hvis I ikke kan komme på ' + (turn.slots > 1 ? 'flere' : 'et svar') + ' — det giver 100 point.</p>' +
      previousAnswersBox(state) +
      '<h3 class="small-heading">Allerede givet</h3>' + givenList(state) + swap;
    return gameLayout(state, countdownEl(100), panel);
  }

  function answeringAnagram(state) {
    var turn = E.currentTurn(state);
    var a = item('anagram', turn.itemId) || { theme: '', scrambled: '?' };
    var panel = teamBar(state) +
      '<div class="q-pill">ANAGRAM</div>' +
      '<p class="q-instruction">Tema: <strong>' + h(a.theme) + '</strong></p>' +
      '<p class="anagram-letters" aria-label="Anagram: ' + h(a.scrambled) + '">' + h(a.scrambled) + '</p>' +
      timerEl(E.ANAGRAM_SECONDS) +
      answerFields(state, { placeholder: 'Skriv det rigtige ord…' });
    return gameLayout(state, countdownEl(100), panel);
  }

  function answeringConnections(state, ui) {
    var turn = E.currentTurn(state);
    var picks = ui.picks || [];
    var tiles = (turn.tileOrder || []).map(function (word) {
      var on = picks.indexOf(word) !== -1;
      return '<button type="button" class="tile' + (on ? ' on' : '') + '" data-action="toggle-tile" data-word="' + h(word) + '"' +
        ' aria-pressed="' + on + '">' + h(word) + '</button>';
    }).join('');
    var panel = teamBar(state) +
      '<div class="q-pill">SAMMENHÆNG</div>' +
      '<p class="q-instruction">Find de <strong>' + E.CONNECTION_PICKS + ' ord, der hører sammen</strong>.</p>' +
      timerEl(E.CONNECTION_SECONDS) +
      '<div class="tiles">' + tiles + '</div>' +
      '<p class="tile-count muted">' + picks.length + ' af ' + E.CONNECTION_PICKS + ' valgt</p>' +
      '<button class="btn btn-primary btn-big" data-action="submit-tiles"' + (picks.length === E.CONNECTION_PICKS ? '' : ' disabled') + '>Indsend</button>';
    return gameLayout(state, countdownEl(100), panel);
  }

  function answering(state, ui) {
    if (state.round.category === 'anagram') return answeringAnagram(state);
    if (state.round.category === 'connections') return answeringConnections(state, ui);
    return answeringPointless(state);
  }

  function resultText(state, entry) {
    var category = state.round.category;
    if (category === 'anagram') {
      if (entry.status === 'correct') {
        return '<p class="result result-correct">KORREKT!</p><p class="result-answer">' + h(entry.solution) + ' — 0 point</p>';
      }
      return '<p class="result result-wrong">' + (entry.status === 'timeout' ? 'TIDEN ER GÅET' : 'IKKE KORREKT') + ' — ' + entry.score + ' point</p>' +
        '<p class="result-answer">Svaret var: ' + h(entry.solution) + '</p>' +
        (entry.input ? '<p class="muted">I skrev “' + h(entry.input) + '”</p>' : '');
    }
    if (category === 'connections') {
      // Gruppens navn og de 4 rigtige ord (✓ = valgt), plus forkert valgte ord overstreget.
      var c = item('connections', entry.itemId);
      var picks = entry.picks || [];
      var words = c ? c.correct.map(function (w) {
        var hit = picks.indexOf(w) !== -1;
        return '<li class="conn-word' + (hit ? ' hit' : '') + '">' + h(w) + (hit ? ' ✓' : '') + '</li>';
      }).join('') + picks.filter(function (p) { return c.correct.indexOf(p) === -1; }).map(function (p) {
        return '<li class="conn-word miss">' + h(p) + ' ✗</li>';
      }).join('') : '';
      var verdict = entry.status === 'correct' ? '<p class="result result-correct">KORREKT! — 0 point</p>' :
        '<p class="result result-wrong">' + (entry.status === 'timeout' ? 'TIDEN ER GÅET' : 'IKKE KORREKT') + ' — ' + entry.score + ' point</p>';
      return verdict + '<p class="result-answer">' + h(entry.solution) + '</p>' + '<ul class="conn-words">' + words + '</ul>';
    }
    if (entry.status === 'pass') {
      return '<p class="result result-wrong">PAS — 100 point</p>';
    }
    if (entry.status === 'wrong') {
      return '<p class="result result-wrong">FORKERT — 100 point</p>' +
        '<p class="muted">“' + h(entry.input) + '” er ikke på listen.</p>';
    }
    var corrected = entry.matched && entry.input.toLowerCase() !== entry.matched.toLowerCase() ?
      '<p class="muted">I skrev “' + h(entry.input) + '”</p>' : '';
    if (entry.score === 0) {
      return '<p class="result result-pointless">POINTLESS!</p><p class="result-answer">' + h(entry.matched) + ' — 0 point</p>' + corrected;
    }
    return '<p class="result">' + entry.score + ' point</p><p class="result-answer">' + h(entry.matched) + '</p>' + corrected;
  }

  // Reveal viser kun: countdown-søjlen, det afgivne svar og dets point, podierne og "Næste".
  function reveal(state) {
    var r = state.round;
    var rv = E.currentReveal(state);
    var entry = rv.entry;
    var team = E.findTeam(state, entry.teamId);
    var waitingLabel = r.category === 'connections' ? 'Valgt: ' : 'Svar: ';

    var body;
    if (r.revealDone) {
      var won = team.pointlessCount >= E.POINTLESS_TO_WIN;
      body = resultText(state, entry) +
        (won ? '<p class="feedback">' + h(team.name) + ' har ' + E.POINTLESS_TO_WIN + ' pointless-svar!</p>' : '') +
        nextButton(won ? 'Se resultatet' : (rv.total > 1 && rv.index < rv.total - 1 ? 'Næste svar' : 'Næste'));
    } else {
      body = '<p class="result-waiting"><span class="muted">' + h(team.name) + ' · ' + waitingLabel + '</span>' +
        '<strong>' + (entry.status === 'pass' ? 'Pas' : (entry.input ? '“' + h(entry.input) + '”' : '—')) + '</strong></p>';
    }
    var cd = r.revealDone ?
      countdownEl(entry.score, countdownOpts(state, entry)) :
      countdownEl(100, { animate: true });
    return gameLayout(state, cd, '<div class="reveal-body" aria-live="polite">' + body + '</div>', teamStyle(team).replace('style="', 'data-team-panel style="'));
  }

  function summaryPointless(state, q) {
    var r = state.round;
    var given = r.given;
    var givenNames = given.map(function (g) { return g.matched; });
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

    return '<div class="summary-cols">' +
      '<div><h3 class="small-heading">Pointless-svar</h3><ul class="answer-list pointless-list">' + pointlessHtml + '</ul></div>' +
      '<div><h3 class="small-heading">Mest givne svar</h3><ol class="answer-list">' + top + '</ol></div>' +
    '</div>';
  }

  function summaryChip(state, g, colorId) {
    var category = state.round.category;
    if (category === 'anagram') return chip(g.solution, g.score, g.status !== 'correct', colorId, 'span');
    if (category === 'connections') return chip(g.solution, g.score, isMiss(g), colorId, 'span');
    return chip(entryLabel(g), g.score, isMiss(g), colorId, 'span');
  }

  function roundSummary(state) {
    var r = state.round;
    var q = question(state);

    var rows = r.order.map(function (id) {
      var t = E.findTeam(state, id);
      var answers = r.given.filter(function (g) { return g.teamId === id; }).map(function (g) {
        return summaryChip(state, g, t.color);
      }).join(' ');
      return '<tr' + teamStyle(t) + '><th scope="row"><span class="team-dot" aria-hidden="true"></span>' + h(t.name) + '</th><td>' + answers + '</td><td class="num">+' + t.questionScore + '</td>' +
        '<td class="num total">' + fmt(t.totalScore) + '</td></tr>';
    }).join('');
    var gameEnds = state.teams.some(function (t) { return t.totalScore >= E.TARGET_SCORE; });

    var header = q ? questionHeader(q) : '<div class="q-pill">' + h(categoryName(r.category).toUpperCase()) + '</div>';
    var panel = header +
      '<h2 class="small-heading">Rundens svar</h2>' +
      '<div class="table-wrap"><table class="summary-table"><thead><tr><th>Hold</th><th>Svar</th>' +
        '<th class="num">Point</th><th class="num">I alt</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      (q ? summaryPointless(state, q) : '') +
      '<h2 class="small-heading">Stilling — første hold til ' + fmt(E.TARGET_SCORE) + ' point taber</h2>' + scoreboard(state, { showQuestion: true }) +
      (gameEnds ? '<p class="feedback">Et hold har nået ' + fmt(E.TARGET_SCORE) + ' point — spillet er slut!</p>' : '') +
      nextButton(gameEnds ? 'Se resultatet' : 'Næste runde');
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
    var headline;
    if (res.reason === 'pointless') {
      headline = '<p class="intro-kicker">Automatisk sejr!</p>' +
        '<h1 class="winner-name">' + names(state, res.winnerIds) + '</h1>' +
        '<p class="big-text">' + names(state, res.winnerIds) + ' vinder med ' + E.POINTLESS_TO_WIN + ' pointless-svar!</p>';
    } else {
      var loserTeam = E.findTeam(state, res.loserIds[0]);
      headline = '<p class="intro-kicker">' + (res.winnerIds.length > 1 ? 'Vinderne er…' : 'Og vinderen er…') + '</p>' +
        '<h1 class="winner-name">' + names(state, res.winnerIds) + '</h1>' +
        '<p class="big-text loser-line">' + names(state, res.loserIds) + ' nåede ' + fmt(loserTeam.totalScore) + ' point og taber 💥</p>';
    }
    return '<div class="screen center winner">' +
      '<div class="confetti" aria-hidden="true">' + confetti + '</div>' +
      headline +
      '<p class="muted">Efter ' + res.questions + (res.questions === 1 ? ' runde' : ' runder') + '</p>' +
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
   * @param {{view: 'menu'|'game', editId?: string, notice?: string, confirmReset?: boolean, picks?: string[]}} ui
   *   lokal UI-tilstand (gemmes ikke)
   */
  function render(state, ui) {
    if (ui.view === 'menu' || state.phase === 'SETUP') return menu(state, ui);
    var fn = byPhase[state.phase];
    return fn ? fn(state, ui) : menu(state, ui);
  }

  JFM.screens = { render: render, escapeHtml: h, countdownOpts: countdownOpts, bank: bank };
})(window.JFM = window.JFM || {});
