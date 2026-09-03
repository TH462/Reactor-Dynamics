/* verify_ckl_relevance.js — THE CHECKLIST LIST DESCRIBES THE PLANT THE PLAYER IS IN (#606).
 *
 * Owner playtest, 2026-09-02: "when I started up in mode 5 the mode 5 checklist was greyed
 * out but some where white."
 *
 * The Checklists tab greys a procedure whose entry conditions the live plant does not meet
 * and prints the gate ("Requires RCS temperature near 547 degF"). The verdict itself was
 * always right — measured at Mode 5, only the heatup grades ready. What was wrong is WHEN it
 * was computed: `cklMenuKey` was `engineKey | active procedure id`, and NEITHER changes when
 * the player resets the plant to a different initial condition, so the list built at the
 * default hot_full_power boot survived the switch to Cold Shutdown verbatim — the Mode 5
 * heatup greyed, the at-power legs white, every gate sentence describing a plant that no
 * longer existed.
 *
 * IT NEEDS A BROWSER, which is why it is its own runner and not a check in
 * run_checklist_pwr2. The stale value lived in a closure variable in ui/app.js that Node
 * cannot reach, the rank itself was correct at both ends, and a source scan of either would
 * have read as working. The only thing that can see it is the rendered list before and after
 * the switch.
 *
 * THE DISCRIMINATOR IS THE FLIP, not the Mode 5 reading. Booting straight to
 * ?init=cold_shutdown builds the list once, correctly, and passes on the defect — so this
 * drives the player's own path: boot at the default Hot Full Power, read the list, then pick
 * Cold Shutdown (Mode 5) in the Plant & Mission window and read it again. Measured on the
 * pre-fix build, the second read is byte-identical to the first.
 *
 * Run: node test/verify_ckl_relevance.js
 */
'use strict';
var path = require('path');
var http = require('http');
var fs = require('fs');

var ROOT = path.join(__dirname, '..');
var PORT = 9700 + Math.floor(Math.random() * 40);
var C = { green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' };
var nPass = 0, nFail = 0;
function ck(name, cond, note) {
  var ok = !!cond;
  if (ok) nPass++; else nFail++;
  console.log((ok ? C.green + '  PASS' : C.red + '  FAIL') + C.off + '  ' + name +
    (note ? C.dim + '  — ' + note + C.off : ''));
}

var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
             '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
             '.md': 'text/plain', '.ico': 'image/x-icon' };

/* The list as the PLAYER sees it: one row per procedure, whether it is greyed, and the gate
 * sentence under it. Read off the rendered DOM — the point of the gate is that the render is
 * where the staleness lived. */
function readMenu(page) {
  return page.evaluate(function () {
    return [].map.call(document.querySelectorAll('#cklMenu button[data-ckl-start]'), function (b) {
      return { id: b.getAttribute('data-ckl-start'),
               gated: b.classList.contains('ckl-gated'),
               gate: ((b.querySelector('.ckl-gate') || {}).textContent || '') };
    });
  });
}
function sig(rows) {
  return rows.map(function (r) { return r.id + (r.gated ? '-' : '+') + r.gate; }).join(';');
}

(async function () {
  var srv = http.createServer(function (rq, rs) {
    var u = decodeURIComponent(rq.url.split('?')[0]); if (u === '/') u = '/index.html';
    var f = path.join(ROOT, u);
    fs.readFile(f, function (e, d) {
      if (e) { rs.writeHead(404); rs.end(); return; }
      rs.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      rs.end(d);
    });
  });
  await new Promise(function (r) { srv.listen(PORT, r); });

  var playwright = require('playwright');
  var browser = await playwright.chromium.launch({ headless: true });
  var page = await browser.newPage();
  var url = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2';

  try {
    /* ---- 1. the default boot: Hot Full Power (Mode 1) ---------------------------------- */
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await page.click('[data-mfree]');                  // Free Play, the engine's own default IC
    await page.waitForTimeout(2500);
    await page.click('#tabbar [data-tab="checklists"]');
    await page.waitForTimeout(900);
    var atPower = await readMenu(page);
    var heatM1 = atPower.filter(function (r) { return r.id === 'pwr_heatup'; })[0];
    var raiseM1 = atPower.filter(function (r) { return r.id === 'pwr_raise_power'; })[0];
    ck('Mode 1 boot: the list is populated and the Mode 5 heatup is the greyed one',
       atPower.length >= 5 && heatM1 && heatM1.gated && raiseM1 && !raiseM1.gated,
       atPower.length + ' rows; heatup ' + (heatM1 && heatM1.gated ? 'grey' : 'WHITE') +
       ', raise_power ' + (raiseM1 && raiseM1.gated ? 'GREY' : 'white'));

    /* ---- 2. the player switches to Cold Shutdown (Mode 5) ------------------------------ */
    /* Through the Plant & Mission window, which is the only path a player has to a different
     * initial condition. A fresh load lands on that window, so reloading IS the player's
     * gesture — what matters to the defect is that the engine does not change across it. */
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await page.click('[data-mmode="free"]');
    await page.waitForTimeout(200);
    await page.click('[data-minit="cold_shutdown"]');
    await page.waitForTimeout(200);
    await page.click('[data-mfree]');
    await page.waitForTimeout(3000);
    await page.click('#tabbar [data-tab="checklists"]');
    await page.waitForTimeout(1200);
    var mode5 = await readMenu(page);

    ck('THE LIST RE-GRADES ON THE PLANT SWITCH (#606 — this was byte-identical before)',
       sig(mode5) !== sig(atPower),
       sig(mode5) === sig(atPower) ? 'IDENTICAL to the Mode 1 list' : 'verdict changed');

    /* THE ORDER IS THE OPERATING CYCLE *(OWNER, 2026-09-02, #606: "the checklists should be
     * in a logical order. ie, starting in mode 5 it should start with mode 5 to mode 3 and end
     * with mode 3 to mode 5")*.
     *
     * The within-category tiebreak was `title.localeCompare`, and these titles begin with the
     * mode they START FROM — so "Mode 3, Hot Standby -> Mode 1" sorted above "Mode 5, Cold
     * Shutdown -> Mode 3" and STARTUP listed its second leg first; POWER inverted the same way
     * ("load rampdown" above "power ascension"); SHUTDOWN was right by luck. Measured pre-fix:
     * startup, heatup, lower_power, raise_power, shutdown, cooldown.
     *
     * The expected sequence is written out LITERALLY rather than read back off the pool,
     * because reading it off the same array the renderer sorts by would assert nothing. It is
     * the pool's declaration order, which run_checklist_pwr2 independently gates against the
     * `next` chain — so if this list and that chain ever disagree, one of the two reddens. */
    var CYCLE = ['pwr_heatup', 'pwr_startup', 'pwr_raise_power', 'pwr_lower_power',
                 'pwr_shutdown', 'pwr_cooldown'];
    var order = mode5.map(function (r) { return r.id; });
    ck('the list runs the plant operating cycle: Mode 5 -> Mode 3 first, Mode 3 -> Mode 5 last',
       order.join(',') === CYCLE.join(','), order.join(' -> '));
    ck('and the same order at Mode 1 — it is a STANDARD order, not one recomputed from the plant',
       atPower.map(function (r) { return r.id; }).join(',') === order.join(','),
       atPower.map(function (r) { return r.id; }).join(' -> '));

    var heat = mode5.filter(function (r) { return r.id === 'pwr_heatup'; })[0];
    ck('Mode 5: the Mode 5 heatup is the WHITE row',
       heat && !heat.gated, heat ? (heat.gated ? 'greyed: ' + heat.gate : 'white') : 'row missing');
    ck('Mode 5: every other leg is greyed AND states its gate',
       mode5.filter(function (r) { return !r.gated; }).length === 1 &&
       mode5.every(function (r) { return r.gated ? !!r.gate : true; }),
       mode5.filter(function (r) { return !r.gated; }).map(function (r) { return r.id; }).join(',') + ' white');

    /* ---- 3. a greyed row is still startable, and says why ------------------------------ */
    /* WARN, NEVER BLOCK (owner ruling 2026-08-06) *(and OWNER, 2026-09-02: "you should still
     * be able to click on the non relevant checklist but it should say its not applicable to
     * the current mode at the top")*. The cooldown is the honest subject: it is greyed at
     * Mode 5 because the plant is already cold. */
    await page.click('#cklMenu button[data-ckl-start="pwr_cooldown"]');
    await page.waitForTimeout(2500);
    var banner = await page.evaluate(function () {
      var log = document.querySelector('#cklLog');
      var cau = log ? log.querySelector('.m-caution') : null;
      return { running: !!log, text: cau ? cau.textContent : null };
    });
    /* ---- 4. the running checklist fills its column, and owns the only scroller ---------- */
    /* #612, owner playtest 2026-09-03: "the right column scroll window should go to the bottom of
     * the column. There is currently an unused black space below it." #607 moved the running
     * checklist into the CHECKLISTS pane, which is a plain content-sized `.tabpane` — so it never
     * got the height treatment `.tabpane.instructor` has had since the transcript needed it.
     * Measured before the fix at 1600x950: the pane ended 189 px short of the viewport and the log
     * was capped at 456 px by `.ckl-log { max-height: 48vh }`.
     *
     * The threshold is a BAND, not the measured number: the gap is padding plus the tools card's
     * own chrome, so pinning 19 px would re-red on any spacing change. 60 px is comfortably below
     * the 189 px defect and comfortably above the chrome. */
    var lay = await page.evaluate(function () {
      var log = document.getElementById('cklLog');
      var pane = document.querySelector('.tabpane[data-pane="checklists"]');
      var chain = [], el = log;
      while (el && el !== document.documentElement) {
        var ov = getComputedStyle(el).overflowY;
        if ((ov === 'auto' || ov === 'scroll') && el.scrollHeight > el.clientHeight + 1) chain.push(el.id || el.className);
        el = el.parentElement;
      }
      var r = pane ? pane.getBoundingClientRect() : null;
      return { gap: r ? Math.round(window.innerHeight - r.bottom) : null,
               logH: log ? log.clientHeight : 0, scrollers: chain };
    });
    ck('the running checklist reaches the bottom of its column (#612)',
       lay.gap !== null && lay.gap < 60,
       'gap below the pane: ' + lay.gap + ' px (was 189 before the fix); log ' + lay.logH + ' px');
    /* A GUARD, NOT EVIDENCE. Measured: this passes on the PRE-FIX build too — `.tab-body`'s
     * content happened to fit, so the second scroller the layout permits never materialised.
     * It is kept because a nested scroller is what would make the log's saved scroll position
     * meaningless (only the log's is restored), and nothing else would notice. It can only ever
     * catch a FUTURE regression; it is not proof that anything was fixed. */
    ck('GUARD: the log is the only scroller in the column (#612 — passes pre-fix too)',
       lay.scrollers.length === 1,
       lay.scrollers.length ? lay.scrollers.join(' > ') : 'none scrollable');

    ck('a greyed checklist still STARTS when clicked (warn, never block)', banner.running);
    ck('and it names the mode the plant is actually in, at the top',
       !!banner.text && /Not applicable in Mode 5, Cold Shutdown/.test(banner.text),
       banner.text ? banner.text.slice(0, 80) : 'no caution banner');
  } catch (err) {
    ck('the gate ran to completion', false, String((err && err.message) || err).slice(0, 160));
  }

  await browser.close();
  srv.close();
  console.log(C.bold + '\nCHECKLIST RELEVANCE: ' + (nFail ? C.red + nFail + ' FAILED' : C.green + 'PASS') +
    C.off + '  ' + nPass + ' passed / ' + (nPass + nFail) + ' checks\n');
  process.exit(nFail ? 1 : 0);
})();
