// Store-laget: holder state og kalder engine. Fast interface, så en FirebaseStore senere kan erstatte LocalStore:
//   getState(), dispatch(action), subscribe(callback), reset()
//
// Backup i LocalStore:
//   - Hovedslot   `jfm-game-v1`         : seneste state.
//   - Backupslot  `jfm-game-v1-backup`  : forrige gemte state (rullende, én version tilbage).
//   Er hovedslottet korrupt eller ugyldigt ved opstart, gendannes fra backupslottet.
//   Ukendt `version` ignoreres (spillet starter forfra), jf. CLAUDE.md.
//   exportState()/importState() giver en manuel backup som JSON-fil.
(function (JFM) {
  'use strict';

  var DEFAULT_KEY = 'jfm-game-v1';
  var EXPORT_FORMAT = 'jfm-backup';

  // localStorage kan kaste (privat tilstand, fuld kvote, blokeret). Alle kald går gennem dette lag.
  function createSafeStorage(storage) {
    return {
      get: function (key) {
        try { return storage ? storage.getItem(key) : null; } catch (e) { return null; }
      },
      set: function (key, value) {
        try { if (storage) storage.setItem(key, value); return true; } catch (e) {
          console.warn('JFM: Kunne ikke gemme i localStorage.', e);
          return false;
        }
      },
      remove: function (key) {
        try { if (storage) storage.removeItem(key); } catch (e) { /* ignorér */ }
      }
    };
  }

  function defaultStorage() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  function createLocalStore(options) {
    var opts = options || {};
    var engine = opts.engine || JFM.engine;
    var bank = opts.questions;
    var key = opts.storageKey || DEFAULT_KEY;
    var backupKey = key + '-backup';
    var storage = createSafeStorage(opts.storage !== undefined ? opts.storage : defaultStorage());
    var listeners = [];
    var restoredFrom = 'none';

    function parse(raw) {
      if (!raw) return null;
      try {
        var parsed = JSON.parse(raw);
        return engine.isValidState(parsed) ? parsed : null;
      } catch (e) {
        return null;
      }
    }

    function load() {
      var mainRaw = storage.get(key);
      var main = parse(mainRaw);
      if (main) { restoredFrom = 'main'; return main; }
      // Backup bruges kun, når hovedslottet findes men er ødelagt — ikke efter en bevidst nulstilling.
      if (mainRaw) {
        var backup = parse(storage.get(backupKey));
        if (backup) {
          console.warn('JFM: Gemt spil var ugyldigt — gendannet fra backup.');
          restoredFrom = 'backup';
          return backup;
        }
      }
      restoredFrom = 'none';
      return engine.createInitialState();
    }

    function persist(next) {
      var previousRaw = storage.get(key);
      if (previousRaw && parse(previousRaw)) storage.set(backupKey, previousRaw);
      storage.set(key, JSON.stringify(next));
    }

    var state = load();

    function notify(action) {
      listeners.slice().forEach(function (cb) {
        try { cb(state, action); } catch (e) { console.error('JFM: Fejl i subscriber.', e); }
      });
    }

    function replaceState(next, action) {
      state = next;
      persist(state);
      notify(action);
      return state;
    }

    return {
      getState: function () { return state; },

      dispatch: function (action) {
        var next = engine.reduce(state, action, bank);
        if (next === state) return state;
        return replaceState(next, action);
      },

      subscribe: function (callback) {
        listeners.push(callback);
        return function unsubscribe() {
          listeners = listeners.filter(function (cb) { return cb !== callback; });
        };
      },

      // Sletter alt (også hold). Det gamle spil ligger stadig i backupslottet.
      reset: function () {
        var previousRaw = storage.get(key);
        if (previousRaw && parse(previousRaw)) storage.set(backupKey, previousRaw);
        storage.remove(key);
        state = engine.createInitialState();
        notify({ type: '@@RESET' });
        return state;
      },

      // Hvor state blev indlæst fra ved opstart: 'main' | 'backup' | 'none'.
      restoredFrom: function () { return restoredFrom; },

      exportState: function () {
        return JSON.stringify({ format: EXPORT_FORMAT, version: state.version, state: state }, null, 2);
      },

      // Returnerer null ved succes, ellers en dansk fejltekst.
      importState: function (json) {
        var data;
        try { data = JSON.parse(json); } catch (e) { return 'Filen er ikke gyldig JSON.'; }
        var candidate = data && data.format === EXPORT_FORMAT ? data.state : data;
        if (!engine.isValidState(candidate)) return 'Filen indeholder ikke et gyldigt spil fra denne version.';
        replaceState(candidate, { type: '@@IMPORT' });
        return null;
      }
    };
  }

  JFM.createLocalStore = createLocalStore;
})(window.JFM = window.JFM || {});
