// Countdown-søjlen: lodret kapsel med vandrette striber og tallet øverst ved fyldniveauet.
// API:
//   JFM.countdown.render(el, value, { wrong })            – vis en værdi uden animation
//   JFM.countdown.runCountdown(el, target, { wrong }) → Promise – animér fra 100 ned til target
(function (JFM) {
  'use strict';

  var STRIPES = 50;           // hver stribe = 2 point
  var MIN_DURATION = 2500;
  var MAX_DURATION = 4000;
  var WRONG_SUSPENSE = 1200;  // kort spænding før det røde kryds

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
    var stripes = el.querySelectorAll('.cd-stripe');
    for (var i = 0; i < stripes.length; i++) {
      var idx = Number(stripes[i].getAttribute('data-i'));
      stripes[i].classList.toggle('off', idx >= visible);
    }
    el.querySelector('.cd-number').textContent = String(v);
    el.style.setProperty('--level', String(v));
    el.setAttribute('aria-label', 'Score ' + v);
  }

  function setOutcome(el, value, wrong) {
    el.classList.toggle('is-wrong', !!wrong);
    el.classList.toggle('is-pointless', !wrong && value === 0);
  }

  function render(el, value, opts) {
    var wrong = !!(opts && opts.wrong);
    mount(el);
    setValue(el, wrong ? 100 : value);
    setOutcome(el, value, wrong);
  }

  function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }

  function runCountdown(el, targetScore, opts) {
    var wrong = !!(opts && opts.wrong);
    var target = Math.max(0, Math.min(100, Number(targetScore) || 0));
    mount(el);
    setOutcome(el, 100, false);
    setValue(el, 100);

    return new Promise(function (resolve) {
      if (wrong) {
        setTimeout(function () { render(el, 100, { wrong: true }); resolve(); }, prefersReducedMotion() ? 200 : WRONG_SUSPENSE);
        return;
      }
      var drop = 100 - target;
      var duration = prefersReducedMotion() ? 400 : MIN_DURATION + (MAX_DURATION - MIN_DURATION) * (drop / 100);
      var start = null;

      function frame(now) {
        // Stop pænt, hvis elementet er fjernet (fx ved genrendering).
        if (!el.isConnected) { resolve(); return; }
        if (start === null) start = now;
        var t = Math.min(1, (now - start) / duration);
        setValue(el, 100 - drop * easeOutQuad(t));
        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          render(el, target, { wrong: false });
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  JFM.countdown = { mount: mount, render: render, runCountdown: runCountdown };
})(window.JFM = window.JFM || {});
