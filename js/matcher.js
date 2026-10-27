// Svar-matchning: normalisering, eksakt match, fuzzy match (Levenshtein) og ord-match.
// Rene funktioner: ingen DOM og ingen storage.
(function (JFM) {
  'use strict';

  var MIN_PARTIAL_LENGTH = 3;

  function normalize(text) {
    return String(text == null ? '' : text)
      .toLowerCase()
      .replace(/æ/g, 'ae')
      .replace(/ø/g, 'oe')
      .replace(/å/g, 'aa')
      .replace(/ß/g, 'ss')
      .replace(/ı/g, 'i')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')  // fjern accenter (ş→s, ö→o, é→e)
      .replace(/[^a-z0-9]+/g, ' ')       // tegnsætning og bindestreger → mellemrum
      .replace(/\s+/g, ' ')
      .trim();
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = new Array(b.length + 1);
    var curr = new Array(b.length + 1);
    for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (var k = 1; k <= b.length; k++) {
        var cost = a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1;
        curr[k] = Math.min(prev[k] + 1, curr[k - 1] + 1, prev[k - 1] + cost);
      }
      var tmp = prev; prev = curr; curr = tmp;
    }
    return prev[b.length];
  }

  // Tilladt afstand afhænger af længden på det svar, der sammenlignes med.
  function maxDistance(length) {
    if (length <= 5) return 1;
    if (length <= 10) return 2;
    return 3;
  }

  function keysFor(answer) {
    var keys = [normalize(answer.name)];
    (answer.aliases || []).forEach(function (alias) {
      var key = normalize(alias);
      if (key && keys.indexOf(key) === -1) keys.push(key);
    });
    return keys;
  }

  // Input matcher hele ord i nøglen, fx "madrid" i "real madrid".
  function containsWords(key, input) {
    return (' ' + key + ' ').indexOf(' ' + input + ' ') !== -1;
  }

  function uniqueAnswers(list) {
    var seen = [];
    return list.filter(function (a) {
      if (seen.indexOf(a) !== -1) return false;
      seen.push(a);
      return true;
    });
  }

  function findCandidates(input, answers) {
    var indexed = answers.map(function (a) { return { answer: a, keys: keysFor(a) }; });

    // 1. Eksakt match
    var exact = uniqueAnswers(indexed.filter(function (x) {
      return x.keys.indexOf(input) !== -1;
    }).map(function (x) { return x.answer; }));
    if (exact.length) return exact;

    // 2. Fuzzy match — kun svarene med den laveste afstand
    var best = Infinity;
    var fuzzy = [];
    indexed.forEach(function (x) {
      var d = Infinity;
      x.keys.forEach(function (key) {
        var dist = levenshtein(input, key);
        if (dist <= maxDistance(key.length) && dist < d) d = dist;
      });
      if (d < best) { best = d; fuzzy = [x.answer]; }
      else if (d === best && d !== Infinity) fuzzy.push(x.answer);
    });
    if (fuzzy.length) return fuzzy;

    // 3. Ord-match (fx "Madrid" → Real Madrid og Atlético Madrid = tvetydig)
    if (input.length >= MIN_PARTIAL_LENGTH) {
      return uniqueAnswers(indexed.filter(function (x) {
        return x.keys.some(function (key) { return containsWords(key, input); });
      }).map(function (x) { return x.answer; }));
    }
    return [];
  }

  /**
   * Matcher et indtastet svar mod et spørgsmål.
   * @param {string} text - spillerens input
   * @param {object} question - spørgsmål med answers[]
   * @param {string[]} alreadyGiven - navne på svar, der allerede er givet til spørgsmålet
   * @returns {{status: 'correct'|'wrong'|'ambiguous'|'duplicate', answer: string|null, score: number|null}}
   */
  function matchAnswer(text, question, alreadyGiven) {
    var input = normalize(text);
    var given = alreadyGiven || [];
    if (!input) return { status: 'wrong', answer: null, score: 100 };

    var candidates = findCandidates(input, question.answers || []);
    if (candidates.length > 1) return { status: 'ambiguous', answer: null, score: null };
    if (candidates.length === 0) return { status: 'wrong', answer: null, score: 100 };

    var answer = candidates[0];
    if (given.indexOf(answer.name) !== -1) {
      return { status: 'duplicate', answer: answer.name, score: null };
    }
    return { status: 'correct', answer: answer.name, score: answer.score };
  }

  JFM.matcher = {
    normalize: normalize,
    levenshtein: levenshtein,
    maxDistance: maxDistance,
    matchAnswer: matchAnswer
  };
})(window.JFM = window.JFM || {});
