// Minimal testramme uden afhængigheder. Virker både i browseren (tests.html) og i Node (scripts/run-tests.js).
(function (root) {
  'use strict';

  var tests = [];

  function test(name, fn) { tests.push({ name: name, fn: fn }); }

  function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion fejlede');
  }

  function eq(actual, expected, message) {
    var a = JSON.stringify(actual);
    var b = JSON.stringify(expected);
    if (a !== b) throw new Error((message ? message + ': ' : '') + 'forventede ' + b + ', fik ' + a);
  }

  function run() {
    var results = tests.map(function (t) {
      try {
        t.fn();
        return { name: t.name, ok: true };
      } catch (e) {
        return { name: t.name, ok: false, error: e && e.message ? e.message : String(e) };
      }
    });
    var failed = results.filter(function (r) { return !r.ok; }).length;
    return { results: results, passed: results.length - failed, failed: failed };
  }

  root.JFM_TEST = { test: test, assert: assert, eq: eq, run: run };
})(typeof window !== 'undefined' ? window : globalThis);
