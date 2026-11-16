// Svartimer til Anagrammer: nedtællingsbjælke + tal ud fra en deadline (timestamp i state).
// API:
//   JFM.timer.remaining(deadline, now) → ms tilbage (aldrig negativ)
//   JFM.timer.start(el, deadline, totalMs, onExpire) → stop()  – opdaterer el og kalder onExpire én gang ved 0
// Er deadline allerede passeret (fx efter genindlæsning), kaldes onExpire med det samme.
(function (JFM) {
  'use strict';

  function remaining(deadline, now) {
    return Math.max(0, deadline - now);
  }

  function start(el, deadline, totalMs, onExpire) {
    var stopped = false;
    var fired = false;
    var number = el.querySelector('[data-timer-number]');
    var bar = el.querySelector('[data-timer-bar]');

    function tick() {
      if (stopped) return;
      if (!el.isConnected) { stopped = true; return; }
      var left = remaining(deadline, Date.now());
      if (number) number.textContent = String(Math.ceil(left / 1000));
      if (bar) bar.style.width = (left / totalMs * 100).toFixed(2) + '%';
      el.classList.toggle('urgent', left <= 3000);
      if (left <= 0) {
        if (!fired) { fired = true; onExpire(); }
        return;
      }
      requestAnimationFrame(tick);
    }
    tick();
    return function stop() { stopped = true; };
  }

  JFM.timer = { remaining: remaining, start: start };
})(window.JFM = window.JFM || {});
