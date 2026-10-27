// Opstart: binder store, skærme og events sammen. UI'et ændrer aldrig state direkte — kun via dispatch.
(function (JFM) {
  'use strict';

  JFM.APP_VERSION = '2.0.1';   // skal matche ?v= i index.html

  var E = JFM.engine;
  var root;
  var store;
  var lastPhase = null;
  var lastPhaseChangeAt = 0;
  var animatingKey = null;
  // Klik lige efter et skærmskift ignoreres, så et dobbeltklik ikke springer en skærm over.
  var CLICK_GUARD_MS = 400;
  // Lokal UI-tilstand, som ikke er en del af spillet og derfor ikke gemmes.
  var ui = { view: 'menu', editId: null, notice: null, focusTeamForm: false };

  // Tilfældighed lægges på actionen, så engine forbliver deterministisk.
  function dispatch(action) {
    action.seed = Math.floor(Math.random() * 4294967296);
    return store.dispatch(action);
  }

  function newTeamId() {
    return 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  }

  // ---------- Rendering ----------

  function render() {
    var state = store.getState();
    root.innerHTML = JFM.screens.render(state, ui);
    if (state.phase !== lastPhase) {
      window.scrollTo(0, 0);
      lastPhase = state.phase;
      lastPhaseChangeAt = Date.now();
    }
    afterRender(state);
  }

  function afterRender(state) {
    var cds = root.querySelectorAll('[data-countdown]');
    for (var i = 0; i < cds.length; i++) {
      var el = cds[i];
      if (el.hasAttribute('data-animate')) startReveal(el, state);
      else JFM.countdown.render(el, Number(el.getAttribute('data-value')), { wrong: el.hasAttribute('data-wrong') });
    }

    // Fokus: feltet med fejl, ellers første tomme felt, ellers første felt.
    var fields = answerFields();
    if (fields.length && ui.view === 'game') {
      var fb = state.round && state.round.lastFeedback;
      var target = (fb && fields[fb.field]) || fields.filter(function (f) { return !f.value; })[0] || fields[0];
      target.focus();
      if (target.value) target.select();
    }

    if (ui.focusTeamForm) {
      ui.focusTeamForm = false;
      var name = root.querySelector('[data-form="team"] input[name="name"]');
      if (name) name.focus();
    }
  }

  function answerFields() {
    return Array.prototype.slice.call(root.querySelectorAll('[data-form="answer"] input[name="answer"]'));
  }

  function revealKey(state) {
    var r = state.round;
    return [r.number, r.questionId, r.turnIdx, r.given.length, r.revealIdx].join(':');
  }

  function startReveal(el, state) {
    var key = revealKey(state);
    if (animatingKey === key) {
      // Animationen kører allerede (fx efter Menu → Fortsæt). Vis blot søjlen; den igangværende afslutter reveal.
      JFM.countdown.render(el, 100);
      return;
    }
    animatingKey = key;
    var entry = E.currentReveal(state).entry;
    JFM.countdown.runCountdown(el, entry.score, { wrong: entry.status !== 'correct' }).then(function () {
      animatingKey = null;
      var s = store.getState();
      if (s.phase === 'REVEAL' && !s.round.revealDone && revealKey(s) === key) dispatch({ type: 'REVEAL_DONE' });
    });
  }

  // ---------- Backup-fil ----------

  function exportBackup() {
    var stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    var blob = new Blob([store.exportState()], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'jfm-backup-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    ui.notice = 'Backup-fil gemt.';
    render();
  }

  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var error = store.importState(String(reader.result));
      ui.notice = error || 'Backup indlæst. Vælg “Fortsæt spil” for at spille videre.';
      ui.view = 'menu';
      render();
    };
    reader.onerror = function () {
      ui.notice = 'Filen kunne ikke læses.';
      render();
    };
    reader.readAsText(file);
  }

  // ---------- Handlinger fra knapper ----------

  var actions = {
    'focus-team-form': function () {
      var designer = root.querySelector('#designer');
      if (designer && designer.scrollIntoView) designer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var name = root.querySelector('[data-form="team"] input[name="name"]');
      if (name) name.focus();
    },
    'start-game': function () {
      ui.view = 'game';
      dispatch({ type: 'START_GAME' });
    },
    'continue': function () {
      ui.view = 'game';
      render();
    },
    'abandon-game': function () {
      if (!window.confirm('Vil du afbryde det igangværende spil? Holdene bevares.')) return;
      ui.view = 'menu';
      dispatch({ type: 'NEW_GAME' });
    },
    'show-menu': function () {
      ui.view = 'menu';
      render();
    },
    'edit-team': function (el) {
      ui.editId = el.getAttribute('data-id');
      ui.focusTeamForm = true;
      render();
    },
    'cancel-edit': function () {
      ui.editId = null;
      render();
    },
    'remove-team': function (el) {
      var id = el.getAttribute('data-id');
      var team = E.findTeam(store.getState(), id);
      if (!team || !window.confirm('Slet holdet “' + team.name + '”?')) return;
      if (ui.editId === id) ui.editId = null;
      dispatch({ type: 'REMOVE_TEAM', teamId: id });
    },
    'ready': function () { dispatch({ type: 'CONFIRM_READY' }); },
    'next': function () { dispatch({ type: 'NEXT' }); },
    'new-game': function () {
      ui.view = 'menu';
      dispatch({ type: 'NEW_GAME' });
    },
    'export': exportBackup,
    'import': function () {
      var input = root.querySelector('[data-role="import-file"]');
      if (input) input.click();
    },
    'reset-all': function () {
      if (!window.confirm('Slet alle hold og det igangværende spil? (Den forrige version ligger stadig i backup-slottet.)')) return;
      ui.editId = null;
      ui.view = 'menu';
      store.reset();
    }
  };

  function onClick(event) {
    var el = event.target.closest('[data-action]');
    if (!el || el.disabled || !root.contains(el)) return;
    var handler = actions[el.getAttribute('data-action')];
    if (!handler) return;
    event.preventDefault();
    if (Date.now() - lastPhaseChangeAt < CLICK_GUARD_MS) return;
    ui.notice = null;
    handler(el);
  }

  // ---------- Formularer ----------

  function submitTeam(form) {
    var state = store.getState();
    var editing = ui.editId;
    var team = {
      id: editing || newTeamId(),
      name: form.elements.name.value,
      players: [form.elements.p1.value, form.elements.p2.value]
    };
    var error = E.validateTeam(state.teams, team, editing);
    if (!error && !editing && state.teams.length >= E.MAX_TEAMS) error = 'Der kan højst være ' + E.MAX_TEAMS + ' hold.';
    if (error) {
      var box = form.querySelector('[data-role="form-error"]');
      if (box) box.textContent = error;
      return;
    }
    ui.editId = null;
    ui.focusTeamForm = true;
    dispatch({ type: editing ? 'EDIT_TEAM' : 'ADD_TEAM', team: team });
  }

  // Afvises turen (tomt/tvetydigt/dublet), genrenderes skærmen med felterne udfyldt og fokus på fejlfeltet.
  function submitAnswer() {
    var turn = E.currentTurn(store.getState());
    var texts = answerFields().map(function (f) { return f.value; });
    dispatch({ type: 'SUBMIT_ANSWER', teamId: turn && turn.team.id, texts: texts });
  }

  function onSubmit(event) {
    var form = event.target;
    var kind = form.getAttribute('data-form');
    if (!kind) return;
    event.preventDefault();
    if (kind === 'team') submitTeam(form);
    if (kind === 'answer') submitAnswer();
  }

  function onChange(event) {
    var el = event.target;
    if (el.getAttribute('data-role') === 'import-file' && el.files && el.files[0]) importBackup(el.files[0]);
  }

  // Enter i et svarfelt hopper til næste felt; Enter i sidste felt gemmer.
  // Piletaster flytter markeringen i startmenuen (retro-stil).
  function onKeyDown(event) {
    if (event.key === 'Enter' && event.target.name === 'answer') {
      var fields = answerFields();
      var i = fields.indexOf(event.target);
      if (i !== -1 && i < fields.length - 1) {
        event.preventDefault();
        fields[i + 1].focus();
      }
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    var items = Array.prototype.slice.call(root.querySelectorAll('.menu .menu-item:not([disabled])'));
    if (!items.length) return;
    var idx = items.indexOf(document.activeElement);
    if (idx === -1 && document.activeElement && document.activeElement.tagName === 'INPUT') return;
    event.preventDefault();
    var next = event.key === 'ArrowDown' ? idx + 1 : idx - 1;
    items[(next + items.length) % items.length].focus();
  }

  // ---------- Opstart ----------

  function boot() {
    root = document.getElementById('app');
    if (!window.JFM_QUESTIONS || !window.JFM_QUESTIONS.questions || !window.JFM_QUESTIONS.questions.length) {
      root.innerHTML = '<p class="fatal">Spørgsmålene kunne ikke indlæses (data/questions.js).</p>';
      return;
    }
    store = JFM.createLocalStore({ engine: E, questions: window.JFM_QUESTIONS });
    if (store.restoredFrom() === 'backup') {
      ui.notice = 'Det gemte spil var beskadiget og er gendannet fra backup.';
    }
    // Genindlæst midt i en reveal: vis slutresultatet uden animation.
    var state = store.getState();
    if (state.phase === 'REVEAL' && !state.round.revealDone) dispatch({ type: 'REVEAL_DONE' });

    store.subscribe(render);
    root.addEventListener('click', onClick);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('change', onChange);
    document.addEventListener('keydown', onKeyDown);
    render();

    // Til fejlsøgning i konsollen.
    JFM.store = store;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.JFM = window.JFM || {});
