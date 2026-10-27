// Tests af store.js (LocalStore) med en falsk storage, inkl. backup og gendannelse.
(function () {
  'use strict';
  var T = window.JFM_TEST;
  var JFM = window.JFM;
  var bank = window.JFM_QUESTIONS;
  var KEY = 'jfm-test';

  function fakeStorage() {
    var data = {};
    return {
      data: data,
      getItem: function (k) { return data.hasOwnProperty(k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; }
    };
  }

  function makeStore(storage) {
    return JFM.createLocalStore({ engine: JFM.engine, questions: bank, storageKey: KEY, storage: storage });
  }

  function addTeam(store, id) {
    store.dispatch({ type: 'ADD_TEAM', team: { id: id, name: 'Hold ' + id, players: ['P'] } });
  }

  T.test('store: interface og notifikation', function () {
    var store = makeStore(fakeStorage());
    var calls = 0;
    var unsubscribe = store.subscribe(function () { calls++; });
    addTeam(store, 'a');
    T.eq(calls, 1);
    store.dispatch({ type: 'NEXT' });  // ugyldig i SETUP → ingen notifikation
    T.eq(calls, 1);
    unsubscribe();
    addTeam(store, 'b');
    T.eq(calls, 1);
    T.eq(store.getState().teams.length, 2);
  });

  T.test('store: state overlever genindlæsning', function () {
    var storage = fakeStorage();
    var store = makeStore(storage);
    addTeam(store, 'a');
    addTeam(store, 'b');
    store.dispatch({ type: 'START_GAME' });
    var reloaded = makeStore(storage);
    T.eq(reloaded.getState(), store.getState());
    T.eq(reloaded.restoredFrom(), 'main');
  });

  T.test('store: backupslot holder forrige version', function () {
    var storage = fakeStorage();
    var store = makeStore(storage);
    addTeam(store, 'a');
    addTeam(store, 'b');
    var backup = JSON.parse(storage.data[KEY + '-backup']);
    T.eq(backup.teams.length, 1);
  });

  T.test('store: korrupt hovedslot gendannes fra backup', function () {
    var storage = fakeStorage();
    var store = makeStore(storage);
    addTeam(store, 'a');
    addTeam(store, 'b');
    storage.data[KEY] = '{ødelagt json';
    var reloaded = makeStore(storage);
    T.eq(reloaded.restoredFrom(), 'backup');
    T.eq(reloaded.getState().teams.length, 1);
  });

  T.test('store: ukendt version ignoreres', function () {
    var storage = fakeStorage();
    var old = JFM.engine.createInitialState();
    old.version = 0;
    storage.data[KEY] = JSON.stringify(old);
    var store = makeStore(storage);
    T.eq(store.getState().version, JFM.engine.STATE_VERSION);
    T.eq(store.getState().teams, []);
  });

  T.test('store: gemt spil fra v1 migreres ved indlæsning (holdene bevares)', function () {
    var storage = fakeStorage();
    storage.data[KEY] = JSON.stringify({
      version: 1, phase: 'ROUND_INTRO', usedQuestionIds: [], history: [], round: {},
      teams: [{ id: 'a', name: 'Gammelt hold', players: ['P'], roundScore: 3, eliminated: false, h2hWins: 0, passPlayerIdx: [0, 0] }]
    });
    var store = makeStore(storage);
    T.eq(store.restoredFrom(), 'main');
    T.eq(store.getState().phase, 'SETUP');
    T.eq(store.getState().teams[0].name, 'Gammelt hold');
  });

  T.test('store: reset rydder spillet, men gendanner ikke fra backup bagefter', function () {
    var storage = fakeStorage();
    var store = makeStore(storage);
    addTeam(store, 'a');
    store.reset();
    T.eq(store.getState().teams, []);
    T.assert(storage.data[KEY + '-backup'], 'det slettede spil ligger i backup');
    var reloaded = makeStore(storage);
    T.eq(reloaded.getState().teams, [], 'reset er bevidst — ingen automatisk gendannelse');
  });

  T.test('store: eksport og import af backup-fil', function () {
    var store = makeStore(fakeStorage());
    addTeam(store, 'a');
    addTeam(store, 'b');
    var json = store.exportState();
    var other = makeStore(fakeStorage());
    T.eq(other.importState(json), null);
    T.eq(other.getState(), store.getState());
    T.assert(typeof other.importState('ikke json') === 'string');
    T.assert(typeof other.importState('{"format":"jfm-backup","state":{"version":99}}') === 'string');
  });

  T.test('store: virker selvom storage kaster fejl', function () {
    var broken = {
      getItem: function () { throw new Error('blokeret'); },
      setItem: function () { throw new Error('fuld'); },
      removeItem: function () { throw new Error('blokeret'); }
    };
    var original = console.warn;
    console.warn = function () {};
    try {
      var store = makeStore(broken);
      addTeam(store, 'a');
      T.eq(store.getState().teams.length, 1);
    } finally {
      console.warn = original;
    }
  });
})();
