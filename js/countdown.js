// Countdown-søjlen: lodret kapsel med vandrette striber og tallet øverst ved fyldniveauet.
// API:
//   JFM.countdown.render(el, value, { wrong, zeroLabel })                     – vis en værdi uden animation
//   JFM.countdown.runCountdown(el, target, { wrong, zeroLabel, instant }) → Promise – tæl ned fra 100 til target
//   JFM.countdown.stepDelay(n)                                                – ventetid (ms) før trinnet fra n til n-1
//
// Nedtællingen går ét point ad gangen og sætter farten ned tæt på 0:
//   delay(n) = SLOWNESS × (15 + 600 / (n + 2)) ms. Med SLOWNESS = 2 tager 100 → 0 ca. 7,5 sek. og 100 → 39 ca. 2,9 sek.
//   Justér SLOWNESS for at gøre det hele hurtigere eller langsommere.
// wrong: et forkert Jo Færre Jo Bedre-svar (target 100) står stille på 100 med rødt kryds efter en kort pause.
// instant: ingen nedtælling — efter en kort pause vises resultatet direkte (Anagrammer og Sammenhæng:
//          korrekt = tom søjle med "KORREKT!", ikke korrekt = rødt kryds).
(function (JFM) {
  'use strict';

  var STRIPES = 50;           // hver stribe = 2 point; ved ulige tal er den øverste stribe halvt tændt
  var SLOWNESS = 2;           // 1 = det oprindelige tempo fra RETTELSER (ca. 3,7 sek. for 100 → 0)
  var WRONG_SUSPENSE = 1200;  // kort spænding før det røde kryds / resultatet
  var REDUCED_MOTION_MS = 400;

  function stepDelay(n) { return SLOWNESS * (15 + 600 / (n + 2)); }

  function prefersReducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  function mount(el) {
    if (el.querySelector('.cd-track')) return el;
    var stripes = '';
    for (var i = STRIPES - 1; i >= 0; i--) stripes += '<span class="cd-stripe" data-i="' + i + '"></span>';
    el.classList.add('cd');
    el.innerHTML =
      '<div class="cd-track">' +
        '<div class="cd-stripes">' + stripes + '</div>' +
        '<div class="cd-level"><span class="cd-number">100</span></div>' +
        '<div class="cd-overlay cd-cross" aria-hidden="true">✕</div>' +
        '<div class="cd-overlay cd-pointless">POINTLESS!</div>' +
      '</div>';
    el.setAttribute('role', 'img');
    return el;
  }

  function setValue(el, value) {
    var v = Math.max(0, Math.min(100, Math.round(value)));
    var visible = Math.ceil(v / 2);
    var half = v % 2 === 1;
    var stripes = el.querySelectorAll('.cd-stripe');
    for (var i = 0; i < stripes.length; i++) {
      var idx = Number(stripes[i].getAttribute('data-i'));
      stripes[i].classList.toggle('off', idx >= visible);
      stripes[i].classList.toggle('half', half && idx === visible - 1);
    }
    el.querySelector('.cd-number').textContent = String(v);
    el.style.setProperty('--level', String(v));
    el.setAttribute('aria-label', 'Score ' + v);
  }

  function setOutcome(el, value, wrong, zeroLabel) {
    el.classList.toggle('is-wrong', !!wrong);
    el.classList.toggle('is-pointless', !wrong && value === 0);
    var label = el.querySelector('.cd-pointless');
    if (label) label.textContent = zeroLabel || 'POINTLESS!';
  }

  function render(el, value, opts) {
    var o = opts || {};
    var v = Math.max(0, Math.min(100, Number(value) || 0));
    mount(el);
    setValue(el, v);
    setOutcome(el, v, !!o.wrong, o.zeroLabel);
  }

  function runCountdown(el, targetScore, opts) {
    var o = opts || {};
    var wrong = !!o.wrong;
    var target = Math.max(0, Math.min(100, Math.round(Number(targetScore) || 0)));
    mount(el);
    setOutcome(el, 100, false, o.zeroLabel);
    setValue(el, 100);

    return new Promise(function (resolve) {
      function finish() {
        render(el, target, { wrong: wrong, zeroLabel: o.zeroLabel });
        resolve();
      }
      if (o.instant || (wrong && target >= 100)) {
        setTimeout(finish, prefersReducedMotion() ? 200 : WRONG_SUSPENSE);
        return;
      }
      if (prefersReducedMotion()) {
        setTimeout(finish, REDUCED_MOTION_MS);
        return;
      }

      // Akkumuleret tid: hvert billede tager alle de trin, hvis ventetid er gået, så tempoet er ens på alle enheder.
      var value = 100;
      var start = null;
      var nextAt = stepDelay(value);

      function frame(now) {
        // Stop pænt, hvis elementet er fjernet (fx ved genrendering).
        if (!el.isConnected) { resolve(); return; }
        if (start === null) start = now;
        var elapsed = now - start;
        while (value > target && elapsed >= nextAt) {
          value -= 1;
          nextAt += stepDelay(value);
        }
        setValue(el, value);
        if (value > target) requestAnimationFrame(frame);
        else finish();
      }
      requestAnimationFrame(frame);
    });
  }

  JFM.countdown = { mount: mount, render: render, runCountdown: runCountdown, stepDelay: stepDelay };
})(window.JFM = window.JFM || {});
