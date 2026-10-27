// Kører de samme tests som tests.html, men i Node: `node scripts/run-tests.js`
// Afslutter med exit code 1, hvis en test fejler (kan bruges før commit/release).
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
global.window = global;

[
  'data/questions.js',
  'js/matcher.js',
  'js/game-engine.js',
  'js/store.js',
  'tests/runner.js',
  'tests/matcher.spec.js',
  'tests/engine.spec.js',
  'tests/store.spec.js'
].forEach(function (file) {
  var full = path.join(root, file);
  vm.runInThisContext(fs.readFileSync(full, 'utf8'), { filename: full });
});

var summary = global.JFM_TEST.run();
summary.results.forEach(function (r) {
  console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '\n      ' + r.error));
});
console.log('\n' + summary.passed + ' bestået, ' + summary.failed + ' fejlet');
process.exit(summary.failed ? 1 : 0);
