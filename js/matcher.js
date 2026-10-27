// Svar-matchning: normalisering, eksakt match, fuzzy match (Levenshtein) og ord-match.
// Rene funktioner: ingen DOM og ingen storage.
(function (JFM) {
  'use strict';

  var MIN_PARTIAL_LENGTH = 3;
  var MIN_FUZZY_WORD_LENGTH = 4;
  // Ekstra ord, der må stå omkring et svar på ét ord ("Leeds United", "FC Barcelona").
  // Uden denne grænse ville fx "Tom Selleck" blive godkendt som svaret "Tom".
  var FILLER_WORDS = ['the', 'fc', 'afc', 'cf', 'ac', 'sc', 'fk', 'bk', 'united', 'city', 'town', 'club'];

  function normalize(text) {
    return String(text == null ? '' : text)
      .toLowerCase()
      .replace(/æ/g, 'ae')
      .replace(/ø/g, 'oe')
      .replace(/å/g, 'aa')
      .replace(/ß/g, 'ss')
      .replace(/œ/g, 'oe')
      .replace(/ı/g, 'i')
      .replace(/ł/g, 'l')
      .replace(/[đð]/g, 'd')
      .replace(/þ/g, 'th')
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

  // Tal skal være ens for at fuzzy-matche, så "Toy Story 4" ikke bliver til "Toy Story 3".
  function numbersOf(text) {
    return (text.match(/\d+/g) || []).map(Number).join(',');
  }

  function sameNumbers(a, b) { return numbersOf(a) === numbersOf(b); }

  function isFuzzyMatch(input, key) {
    return sameNumbers(input, key) && levenshtein(input, key) <= maxDistance(key.length);
  }

  // Findes ordene i `needle` som en sammenhængende ordfølge i `haystack`?
  function containsSequence(haystack, needle, wordMatches) {
    for (var i = 0; i + needle.length <= haystack.length; i++) {
      var ok = true;
      for (var j = 0; j < needle.length && ok; j++) ok = wordMatches(haystack[i + j], needle[j]);
      if (ok) return true;
    }
    return false;
  }

  function sameWord(a, b) { return a === b; }

  // Bøjningsformer: det ene ord er det andet plus højst to bogstaver ("Lund" ≈ "Lunds", "Glyptoteket" ≈ "Glyptotek").
  // Bevidst ikke almindelige stavefejl pr. ord — det gav falske match som "Tiger" → "Moderne tider".
  function similarWord(keyWord, inputWord) {
    if (keyWord === inputWord) return true;
    var shorter = keyWord.length < inputWord.length ? keyWord : inputWord;
    var longer = shorter === keyWord ? inputWord : keyWord;
    return shorter.length >= MIN_FUZZY_WORD_LENGTH &&
      longer.length - shorter.length <= 2 &&
      longer.indexOf(shorter) === 0 &&
      sameNumbers(shorter, longer);
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
        if (!isFuzzyMatch(input, key)) return;
        var dist = levenshtein(input, key);
        if (dist < d) d = dist;
      });
      if (d < best) { best = d; fuzzy = [x.answer]; }
      else if (d === best && d !== Infinity) fuzzy.push(x.answer);
    });
    if (fuzzy.length) return fuzzy;

    if (input.length < MIN_PARTIAL_LENGTH) return [];
    var inputWords = input.split(' ');

    function matching(test) {
      return uniqueAnswers(indexed.filter(function (x) {
        return x.keys.some(function (key) { return test(key, key.split(' ')); });
      }).map(function (x) { return x.answer; }));
    }

    // 3. Ord-match begge veje:
    //    - input er hele ord i svaret: "Madrid" → Real Madrid + Atlético Madrid (= tvetydig), "Springsteen" → Bruce Springsteen …
    //    - svaret er hele ord i input:  "Leeds United" → Leeds, "President Barack Obama" → Barack Obama
    function onlyFillerAround(keyWords) {
      return keyWords.length > 1 || inputWords.every(function (w) {
        return w === keyWords[0] || FILLER_WORDS.indexOf(w) !== -1;
      });
    }
    var partial = matching(function (key, keyWords) {
      return containsSequence(keyWords, inputWords, sameWord) ||
        (key.length >= MIN_PARTIAL_LENGTH && sameNumbers(input, key) &&
          containsSequence(inputWords, keyWords, sameWord) && onlyFillerAround(keyWords));
    });
    if (partial.length) return partial;

    // 4. Ord-match med bøjningsformer: "Lund" → Lunds Universitet, "Stockholm" → Stockholms universitet
    if (input.length < MIN_FUZZY_WORD_LENGTH) return [];
    return matching(function (key, keyWords) {
      return containsSequence(keyWords, inputWords, similarWord);
    });
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
