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

// Cache-busting: alle ?v= i index.html skal være lig JFM.APP_VERSION, ellers kan browsere blande gamle og nye filer.
global.JFM_TEST.test('index.html: alle filer har ?v= lig APP_VERSION i app.js', function () {
  var appVersion = (fs.readFileSync(path.join(root, 'js/app.js'), 'utf8').match(/APP_VERSION = '([^']+)'/) || [])[1];
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var refs = html.match(/(?:src|href)="(?:css|js|data)\/[^"]+"/g) || [];
  global.JFM_TEST.assert(appVersion, 'APP_VERSION ikke fundet i js/app.js');
  global.JFM_TEST.eq(refs.length, 8, 'antal css/js-referencer');
  var wrong = refs.filter(function (r) { return r.indexOf('?v=' + appVersion + '"') === -1; });
  global.JFM_TEST.eq(wrong, [], 'referencer uden ?v=' + appVersion);
});

var summary = global.JFM_TEST.run();
summary.results.forEach(function (r) {
  console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '\n      ' + r.error));
});
console.log('\n' + summary.passed + ' bestået, ' + summary.failed + ' fejlet');
process.exit(summary.failed ? 1 : 0);
