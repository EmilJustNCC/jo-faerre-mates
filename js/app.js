// Opstart: binder store, skærme og events sammen. UI'et ændrer aldrig state direkte — kun via dispatch.
(function (JFM) {
  'use strict';

  JFM.APP_VERSION = '1.0.0';

  var E = JFM.engine;
  var root;
  var store;
  var lastPhase = null;
  var animatingKey = null;
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

    var answer = root.querySelector('#answer-input');
    if (answer && ui.view === 'game') answer.focus();

    if (ui.focusTeamForm) {
      ui.focusTeamForm = false;
      var name = root.querySelector('[data-form="team"] input[name="name"]');
      if (name) name.focus();
    }
  }

  function revealKey(state) {
    var r = state.round;
    return [r.type, r.number, r.stage, r.attempt || 0, r.questionId, r.given.length].join(':');
  }

  function startReveal(el, state) {
    var key = revealKey(state);
    if (animatingKey === key) {
      // Animationen kører allerede (fx efter Menu → Fortsæt). Vis blot søjlen; den igangværende afslutter reveal.
      JFM.countdown.render(el, 100);
      return;
    }
    animatingKey = key;
    var entry = state.round.pending;
    JFM.countdown.runCountdown(el, entry.score, { wrong: entry.status === 'wrong' }).then(function () {
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
    'choose-pass': function (el) {
      dispatch({ type: 'CHOOSE_PASS_PLAYER', teamId: el.getAttribute('data-team'), playerIdx: Number(el.getAttribute('data-idx')) });
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

  function submitAnswer(form) {
    var turn = E.currentTurn(store.getState());
    var input = form.elements.answer;
    dispatch({ type: 'SUBMIT_ANSWER', teamId: turn && turn.team.id, text: input.value });
    // Står vi stadig på svarskærmen (tvetydigt/dublet), bevares fokus i feltet.
    var again = root.querySelector('#answer-input');
    if (again) again.focus();
  }

  function onSubmit(event) {
    var form = event.target;
    var kind = form.getAttribute('data-form');
    if (!kind) return;
    event.preventDefault();
    if (kind === 'team') submitTeam(form);
    if (kind === 'answer') submitAnswer(form);
  }

  function onChange(event) {
    var el = event.target;
    if (el.getAttribute('data-role') === 'import-file' && el.files && el.files[0]) importBackup(el.files[0]);
  }

  // Piletaster flytter markeringen i startmenuen (retro-stil).
  function onKeyDown(event) {
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
