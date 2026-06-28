/* ============================================================================
 * shell.js — interactivity for the M8 visual shell (mock only).
 *
 * No engine wiring: this just makes the prototype feel alive so layout/look can
 * be judged — tab switching, the SCRAM guard cover, the System Scanner hover,
 * segmented-button toggles, speed selection + fast-forward badge, and live
 * slider labels. All state here is cosmetic.
 * ========================================================================== */
(function () {
  'use strict';

  // ---- Tools Block tabs ----
  var tabbar = document.getElementById('tabbar');
  tabbar.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]');
    if (!b) return;
    tabbar.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
    document.querySelectorAll('.tabpane').forEach(function (p) {
      p.classList.toggle('on', p.getAttribute('data-pane') === b.getAttribute('data-tab'));
    });
  });

  // ---- Generic segmented button groups (one active at a time) ----
  document.querySelectorAll('.seg').forEach(function (seg) {
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      // preserve the run/warn flavor classes already on a button
      seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
    });
  });

  // ---- Speed selector + fast-forward badge ----
  var speed = document.getElementById('speed');
  var clock = document.getElementById('clock');
  var ffBadge = document.getElementById('ffBadge');
  speed.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var v = b.textContent.trim();
    var n = parseInt(v, 10);
    clock.classList.toggle('accel', n > 1);
    var fast = n >= 600;
    ffBadge.style.display = fast ? 'block' : 'none';
    if (fast) ffBadge.textContent = '⚡ ' + v;
  });

  // ---- Play / Pause ----
  var playBtn = document.getElementById('playBtn');
  var paused = false;
  playBtn.addEventListener('click', function () {
    paused = !paused;
    playBtn.textContent = paused ? '▶' : '⏸';
    playBtn.classList.toggle('paused', paused);
    clock.classList.toggle('running', !paused);
  });

  // ---- SCRAM guard cover: click cover → arm (3s) → click SCRAM → fired ----
  var wrap = document.getElementById('scramWrap');
  var cover = document.getElementById('scramCover');
  var btn = document.getElementById('scramBtn');
  var armTimer = null, arc = null;
  function disarm() {
    wrap.classList.remove('open');
    if (arc) { arc.remove(); arc = null; }
    if (armTimer) { clearTimeout(armTimer); armTimer = null; }
  }
  cover.addEventListener('click', function () {
    if (btn.classList.contains('fired')) return;
    wrap.classList.add('open');
    arc = document.createElement('div');
    arc.className = 'scram-arc';
    wrap.appendChild(arc);
    armTimer = setTimeout(disarm, 3000); // auto-close after 3s
  });
  btn.addEventListener('click', function () {
    if (!wrap.classList.contains('open') || btn.classList.contains('fired')) return;
    disarm();
    wrap.classList.add('open');
    btn.classList.add('fired');
    btn.textContent = 'SCRAMMED';
  });

  // ---- System Scanner: show last-hovered element's hint (persists) ----
  var scanner = document.getElementById('scanner');
  document.querySelectorAll('[data-scanner-hint]').forEach(function (el) {
    el.addEventListener('mouseover', function (e) {
      e.stopPropagation();
      var hint = el.getAttribute('data-scanner-hint');
      var dash = hint.indexOf(' — ');
      // Bold the lead term (text before the em-dash) when present.
      scanner.innerHTML = dash > -1
        ? '<strong>' + hint.slice(0, dash) + '</strong>' + hint.slice(dash)
        : hint;
    });
  });

  // ---- Failures-tab sliders: live engineering-unit labels ----
  document.querySelectorAll('.fail-slider').forEach(function (row) {
    var input = row.querySelector('input[type=range]');
    var out = row.querySelector('.sv');
    if (!input || !out) return;
    var base = out.textContent.replace(/[\d.]+/, '%%');
    input.addEventListener('input', function () {
      out.textContent = base.replace('%%', input.value);
    });
  });

  // ---- A faint alarm tint on the gauge strip while unacked alarms exist (§8.6) ----
  if (document.querySelector('.alarm-tile.unack')) {
    document.getElementById('gaugeStrip').classList.add('alarm-tint');
  }
})();
