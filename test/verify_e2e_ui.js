/* E2E UI verification: screenshots per plant×view, units toggle, ?follow= Instructor.
 * Run: node test/verify_e2e_ui.js
 * Evidence: GROK_GOAL_SCRATCH env or %TEMP%/grok-goal-e2e-ui */
'use strict';
var path = require('path');
var http = require('http');
var fs = require('fs');

var ROOT = path.join(__dirname, '..');
var SCRATCH = process.env.GROK_GOAL_SCRATCH || path.join(require('os').tmpdir(), 'grok-goal-e2e-ui');
var PORT = 9750 + Math.floor(Math.random() * 50);

var ENGINES = ['pwr', 'rbmk_pre', 'rbmk_post', 'bwr'];
var VIEWS = ['diagram', 'primary', 'secondary', 'all'];

/* THE PLANT & MISSION WINDOW OPENS ON EVERY LOAD since 2026-08-11 *(OWNER DIRECTIVE: "It
 * should always the the first thing someone sees when loading the sim.")*, so every gate
 * navigation has to dismiss it exactly as a player does.
 *
 * It is deliberately NOT exempted by a URL parameter. A bypass list is what hid the window
 * from every real visitor: it contained `engine=`, and the site links `?engine=pwr` from
 * both entry points, so the one path nobody took — a bare shell.html — was the only path
 * that showed it, and that was the path my own check had used. A gate that skipped the
 * window would be testing a front door no player has. */
async function dismissMission(page) {
  try {
    if (await page.isVisible('#missionOverlay')) {
      await page.click('#missionClose');
      await page.waitForTimeout(250);
    }
  } catch (e) { /* not mounted yet on some early navigations */ }
}

/* Recently-added controls that must render on the shipped UI (data-act wiring).
 * PWR has NO entries here on purpose: data-act buttons are emitted only by
 * populateControlBar() into #pdCtlRow (ui/app.js:374,379,384), and the PWR returns
 * before that path to mount the learning board instead (ui/app.js:3413, :3459-3460).
 * The PWR board is covered by REQUIRED_BOARD_LABELS below. */
var REQUIRED_ACTS = {
  'rbmk_pre-primary': ['rbmk-eccs-on'],
  'rbmk_pre-secondary': ['rbmk-turbine-set', 'dump-open'],
  'rbmk_post-primary': ['rbmk-eccs-on'],
  'bwr-secondary': ['dump-open', 'ic-on', 'stop-lpcs', 'slc-stop'],
};

/* Board-rendered plants (PWR) expose controls through the label vocabulary rather
 * than data-act, so probe the same path Instructor highlights use:
 * RD.PwrBoard.revealControl(label) -> the tile to glow, or null if unreachable.
 * The board is one stage with no view bar, so every view must render all of these. */
var REQUIRED_BOARD_LABELS = {
  pwr: [
    'Charging Pump (CVCS)', 'CVCS Inventory Control', 'Letdown Orifices (CVCS)', 'Boron',
    'Pressurizer Heaters (PZR)', 'Pressurizer Spray (PZR)', 'Pressure SP',
    'Relief Valve (PORV)', 'PORV Block Valve',
    'Reactor Coolant Pumps (RCP)', 'Residual Heat Removal (RHR)',
    'HPI', 'AFW', 'Feed Pumps', 'MSIV',
    'Steam Dump', 'Dump SP', 'Turbine Load',
    // #371 — the atmospheric dump. It is the only cooldown path once the condenser
    // is gone, so "is it reachable on the board at all" is worth a gate.
    'ADV', 'ADV SP',
    'Control Bank', 'Shutdown Bank', 'SCRAM',
  ],
};

var REQUIRED_LABELS = {
  'rbmk_pre-secondary': ['Electrical Output', 'Turbine RPM', 'Cond. Vacuum'],
  'rbmk_post-secondary': ['Electrical Output', 'Turbine RPM', 'Cond. Vacuum'],
  'bwr-secondary': ['Electrical Output', 'Turbine RPM', 'Cond. Vacuum'],
};

function mime(p) {
  if (p.endsWith('.html')) return 'text/html';
  if (p.endsWith('.js')) return 'application/javascript';
  if (p.endsWith('.css')) return 'text/css';
  return 'application/octet-stream';
}

function startServer() {
  return new Promise(function (resolve) {
    var srv = http.createServer(function (req, res) {
      var url = (req.url || '/').split('?')[0];
      if (url === '/') url = '/ui/shell.html';
      var fp = path.join(ROOT, decodeURIComponent(url.replace(/^\//, '').replace(/\//g, path.sep)));
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': mime(fp) });
      res.end(fs.readFileSync(fp));
    });
    srv.listen(0, '127.0.0.1', function () { PORT = srv.address().port; resolve(srv); });
  });
}

async function screenshot(page, engine, view) {
  var url = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=' + engine + '&view=' + view;
  var errors = [];
  page.removeAllListeners('pageerror');
  page.on('pageerror', function (e) { errors.push(String(e)); });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await page.waitForTimeout(800);
  var file = path.join(SCRATCH, 'ui-' + engine + '-' + view + '.png');
  await page.screenshot({ path: file, fullPage: true });
  var key = engine + '-' + view;
  var controls = await page.evaluate(function (req) {
    var missing = [];
    (req.acts || []).forEach(function (a) {
      if (!document.querySelector('[data-act="' + a + '"]')) missing.push(a);
    });
    var labelMiss = [];
    (req.labels || []).forEach(function (l) {
      if (document.body.innerText.indexOf(l) < 0) labelMiss.push(l);
    });
    // Board plants: resolve each control label to a real tile via the reveal path.
    var board = globalThis.RD && globalThis.RD.PwrBoard;
    var boardMounted = !!(board && board.isMounted());
    var boardMiss = [];
    if (req.boardLabels && req.boardLabels.length) {
      if (!boardMounted) boardMiss = req.boardLabels.slice();
      else req.boardLabels.forEach(function (l) { if (!board.revealControl(l)) boardMiss.push(l); });
    }
    return {
      gauges: document.querySelectorAll('.gauge').length,
      ctlGroups: document.querySelectorAll('.cg').length,
      pdCtl: document.getElementById('pdCtlRow') ? document.getElementById('pdCtlRow').children.length : 0,
      boardTiles: document.querySelectorAll('.bd-tile').length,
      boardMounted: boardMounted,
      missingActs: missing,
      missingLabels: labelMiss,
      missingBoardLabels: boardMiss,
    };
  }, {
    acts: REQUIRED_ACTS[key] || [],
    labels: REQUIRED_LABELS[key] || [],
    boardLabels: REQUIRED_BOARD_LABELS[engine] || [],
  });
  if (errors.length) throw new Error(engine + '/' + view + ' page errors: ' + errors.join('; '));
  if (controls.gauges < 4) throw new Error(engine + '/' + view + ' gauges missing');
  if (controls.missingActs.length) throw new Error(engine + '/' + view + ' missing controls: ' + controls.missingActs.join(', '));
  if (controls.missingLabels.length) throw new Error(engine + '/' + view + ' missing BOP labels: ' + controls.missingLabels.join(', '));
  if (REQUIRED_BOARD_LABELS[engine] && !controls.boardMounted) throw new Error(engine + '/' + view + ' board did not mount');
  if (controls.missingBoardLabels.length) throw new Error(engine + '/' + view + ' board controls unreachable: ' + controls.missingBoardLabels.join(', '));
  return controls;
}

async function testUnitsAndInstructor(page) {
  var log = [];
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr&view=primary', { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await page.waitForTimeout(500);

  var usUnit = await page.locator('#gauge-press [data-val]').textContent();
  log.push('US gauge pressure: ' + usUnit);
  if (!/psi/i.test(usUnit)) throw new Error('US units expected psi in gauge, got: ' + usUnit);

  // The PWR manual is now the packed Manuals/*.md set (RD.MANUAL_MD), so the nav ids
  // are document ids — 'setpoints' became '09_setpoints_limits'. The old structured
  // MANUAL_SECTIONS path (mSetpoints etc.) survives only for plants without an md set.
  await page.click('#manualBtn');
  await page.click('#manualNav [data-msec="09_setpoints_limits"]');
  await page.waitForTimeout(400);
  var usDoc = await page.locator('#manualContent .mdoc').first().textContent();
  log.push('US manual setpoints doc length: ' + usDoc.length);
  if (usDoc.length < 500) throw new Error('setpoints document did not render (len ' + usDoc.length + ')');

  // Units toggle on the PWR, end to end (#238). History matters for reading this block:
  // it originally asserted the toggle converted the gauge to MPa; #237 replaced that with
  // "the SI button is DISABLED", because the board rendered US customary throughout and a
  // global SI selection produced SI chart chips beside US board readouts. #238 built the
  // board's display-unit layer, so the real assertion is back — and it is stronger than
  // the original, because it checks the BOARD, not just the (hidden) gauge strip.
  //
  // The point of doing it here rather than in board_check: this is the only gate that
  // drives the actual Settings control through app.js. board_check calls the driver with
  // its own ctx and would stay green if the button were never wired to it at all.
  var usBoard = await page.evaluate(function () {
    var t = document.querySelector('[data-item="imrr4fnxhlc"]');          // T-HOT readout
    var d = document.querySelector('[data-item="ims31tq7mgc"] .bd-num-unit'); // DUMP SETPOINT box
    return { thot: t && t.textContent.replace(/\s+/g, ' ').trim(), dump: d && d.textContent };
  });
  log.push('PWR board in US: T-hot "' + usBoard.thot + '", dump setpoint unit "' + usBoard.dump + '"');
  if (!/F$/.test(usBoard.thot || '')) throw new Error('expected the US board to read °F, got: ' + usBoard.thot);

  var siState = await page.evaluate(function () {
    var b = document.querySelector('#unitsSeg button[data-units="SI"]');
    if (!b) return null;
    var wasDisabled = b.disabled;
    b.click();
    return { wasDisabled: wasDisabled };
  });
  await page.waitForTimeout(400);
  if (!siState) throw new Error('SI units button not found');
  if (siState.wasDisabled) throw new Error('PWR SI toggle expected ENABLED since #238, got disabled');
  var siBoard = await page.evaluate(function () {
    var t = document.querySelector('[data-item="imrr4fnxhlc"]');
    var d = document.querySelector('[data-item="ims31tq7mgc"] .bd-num-unit');
    return { thot: t && t.textContent.replace(/\s+/g, ' ').trim(), dump: d && d.textContent };
  });
  log.push('PWR board in SI: T-hot "' + siBoard.thot + '", dump setpoint unit "' + siBoard.dump + '"');
  if (!/C$/.test(siBoard.thot || '')) throw new Error('PWR board expected to read °C in SI, got: ' + siBoard.thot);
  // The setpoint BOX is the half that needed new renderer code — its unit span is built at
  // mount and was never rewritten before #238, so a units change reached the readouts and
  // left the boxes lying.
  if (siBoard.dump !== 'MPa') throw new Error('PWR dump setpoint box expected MPa in SI, got: ' + siBoard.dump);
  var siUnit = await page.locator('#gauge-press [data-val]').textContent();
  log.push('PWR pressure gauge in SI: ' + siUnit);
  if (!/MPa/i.test(siUnit)) throw new Error('PWR gauge expected MPa in SI, got: ' + siUnit);

  // …and back, because a one-way conversion looks perfect until someone switches back.
  await page.evaluate(function () { document.querySelector('#unitsSeg button[data-units="US"]').click(); });
  await page.waitForTimeout(400);
  var backBoard = await page.evaluate(function () {
    var t = document.querySelector('[data-item="imrr4fnxhlc"]');
    var d = document.querySelector('[data-item="ims31tq7mgc"] .bd-num-unit');
    return { thot: t && t.textContent.replace(/\s+/g, ' ').trim(), dump: d && d.textContent };
  });
  if (!/F$/.test(backBoard.thot || '') || backBoard.dump !== usBoard.dump) {
    throw new Error('SI -> US did not restore the board: ' + JSON.stringify(backBoard) + ' vs ' + JSON.stringify(usBoard));
  }
  log.push('PWR board restored to US: T-hot "' + backBoard.thot + '", dump setpoint unit "' + backBoard.dump + '"');

  // The board/gauges honour the units toggle; the packed manual does NOT.
  // renderManualMd (ui/app.js) caches on `engineKey|docId` with no units key and
  // renders the markdown verbatim, which is authored in SI. So the manual reads
  // 1200 °C / 335 °C whichever way the toggle is set.
  //
  // STRICT XFAIL — was issue #111 ("units in the manual need to change with unit
  // selection"). RESOLVED 2026-07-29 by a different route than #111 assumed: the
  // manual now quotes BOTH systems inline, US customary first with SI in
  // parentheses (owner request), so it is correct at either toggle setting and has
  // no reason to re-render. The assertion below therefore still holds — and still
  // earns its keep, because a future attempt to make the manual convert on the
  // toggle would double-convert text that is already dual. `run_manual_units.js`
  // is what now guards the manual's numbers. Keep this pinned.
  var siDoc = await page.locator('#manualContent .mdoc').first().textContent();
  var manualConverts = usDoc !== siDoc;
  log.push('XFAIL #111 manual unit conversion: ' + (manualConverts ? 'CONVERTS' : 'static SI (expected gap)'));
  if (manualConverts) {
    throw new Error('XFAIL #111 unexpectedly passes: the manual now re-renders on the units ' +
      'toggle. Promote this to a real US-vs-SI assertion and close #111.');
  }
  if (!/1200\s*°C/.test(siDoc)) throw new Error('SI manual safety limit expected 1200 °C in the setpoints doc');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr&follow=pwr_loss_of_feedwater', { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await page.waitForFunction(function () {
    var el = document.getElementById('instrCurrent');
    if (!el || /Standing by/.test(el.textContent)) return false;
    var html = el.innerHTML;
    return html.indexOf('when') >= 0 || html.indexOf('not yet') >= 0 || html.indexOf('met') >= 0;
  }, { timeout: 15000 });
  var instr = await page.locator('#instrCurrent').textContent();
  log.push('Instructor follow text length: ' + instr.length);
  if (instr.length < 20) throw new Error('Instructor follow did not load procedure');

  var hasAcc = await page.evaluate(function () {
    var html = document.getElementById('instrCurrent').innerHTML;
    return html.indexOf('when') >= 0 || html.indexOf('not yet') >= 0 || html.indexOf('met') >= 0;
  });
  log.push('Instructor acceptance markup present: ' + hasAcc);
  if (!hasAcc) throw new Error('Instructor missing acceptance predicate markup');

  await page.click('#playBtn');
  await page.waitForTimeout(1500);
  var afterPlay = await page.locator('#instrCurrent').innerHTML();
  log.push('Instructor after play (chars): ' + afterPlay.length);

  return log.join('\n');
}

/* The three-element pair on the board: STEAM FLOW must sit beside SG FEED RATE, on the
 * SAME scale, reading TOTAL main-steam-line draw (issue #206).
 *
 * Why this is a gate and not just a screenshot: the obvious wiring for a "steam flow"
 * readout is the `steam_flow` instrument, which is governor/turbine flow ONLY. That reads
 * ~0 whenever the turbine is offline and the steam dump is carrying the plant — so the
 * board would show "no steam" while the SG boiled at 98 % dump, which is precisely the
 * blind spot that had the three-element feed channel commanding zero feed through a
 * turbine trip. The readout is worth nothing unless it survives THAT case, so the check
 * trips the turbine and asserts the number stays up. It also guards the pairing itself:
 * the indication is a driver EXTRA_ITEM, so a board re-export must not drop it. */
async function testSteamFeedPair(page) {
  var log = [];
  // PINNED TO hot_full_power, NOT the shipped default. Every timing in this check was
  // derived at full power (see the 240/420/600 s table below), and the 600 s sample point is
  // really measuring when AFW's proportional band opens: `afw_level_target` 32 % +
  // `afw_level_band` 8 % means AFW delivers NOTHING until SG level falls below 40 %, and how
  // long that takes is set by decay heat, i.e. by the power the plant tripped from. MEASURED
  // full-stack, turbine trip at t=60 s: from hot_full_power the SG reaches 40 % at ~9m20s so
  // feed is up at 600 s; from 50_percent it gets there at ~16m and reads exactly 0 gpm at
  // 600 s, then parks at 39.5 % and holds — the plant is correct, the sample point is not.
  // The shipped default became 50_percent on 2026-08-08, so this pins the IC the numbers
  // belong to rather than re-banding a threshold to whatever the default happens to be
  // (HR10 — the assertion is unchanged, and 0 gpm against a live steam draw still fails it).
  var read = async function (qs) {
    await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr&init=hot_full_power&run=1' + qs,
      { waitUntil: 'networkidle', timeout: 90000 });
    await dismissMission(page);
    await page.waitForTimeout(1200);
    return page.evaluate(function () {
      var t = function (id) {
        var e = document.querySelector('[data-item="' + id + '"]');
        return e ? e.textContent.trim() : null;
      };
      // Steam flow is read from the FEED-CARD instance (ims3wm0d0bu), not the one on the
      // SG head: #206 is about steam flow being comparable with feed flow at the feed
      // station, so that is the copy whose presence and scale this gate is asserting.
      // (V1 called it bdSteamFlow and injected it from the driver; V2 authors it in the
      // diagram. Same claim, new id.)
      var box = function (id) {
        var e = document.querySelector('[data-item="' + id + '"]');
        if (!e) return null;
        var r = e.getBoundingClientRect();
        return { right: Math.round(r.right), top: Math.round(r.top) };
      };
      return { steam: t('ims3wm0d0bu'), feed: t('imrsgkz4lq0'), gov: t('imrppej8ulo'), dump: t('imsgunuyvon'),
               steamBox: box('ims3wm0d0bu'), feedBox: box('imrsgkz4lq0') };
    });
  };
  var num = function (t) { return t == null ? null : Number(String(t).replace(/[^0-9.-]/g, '')); };

  var atPower = await read('&ff=30');
  log.push('at power: steam=' + atPower.steam + ' feed=' + atPower.feed + ' gov=' + atPower.gov);
  if (atPower.steam == null) throw new Error('STEAM FLOW readout (ims3wm0d0bu) is missing from the board');
  // #206 is a LAYOUT claim as much as a data one — steam flow only helps if it can be
  // compared with feed flow at a glance, which is why it lives at the feed station in the
  // same column rather than on the steam header. Assert the adjacency, not just presence,
  // so a future re-author that scatters them fails here instead of silently undoing the fix.
  // (This also held on the V1 board, where bdSteamFlow sat directly above imrsgkz4lq0 in
  // the same right-anchored column — so it is a stricter test of the same behaviour, not a
  // test refitted to the V2 layout.)
  if (atPower.steamBox && atPower.feedBox) {
    var dx = Math.abs(atPower.steamBox.right - atPower.feedBox.right);
    var dy = atPower.feedBox.top - atPower.steamBox.top;
    if (dx > 12 || dy < 0 || dy > 60) {
      throw new Error('STEAM FLOW must sit directly above SG FEED RATE in the same column ' +
        'for the three-element comparison (#206); got dx=' + dx + ' dy=' + dy);
    }
  }
  if (!/gpm/.test(atPower.steam) || !/gpm/.test(atPower.feed)) {
    throw new Error('STEAM FLOW and SG FEED RATE must share the gpm scale to be comparable, got ' +
      atPower.steam + ' vs ' + atPower.feed);
  }
  if (Math.abs(num(atPower.steam) - num(atPower.feed)) > 80) {
    throw new Error('at steady full power feed should match steam, got steam=' + atPower.steam + ' feed=' + atPower.feed);
  }

  // Sampled at ff=240, not 120 (#219). At 120 s the SG is still coming down off the
  // post-trip swell, so feed is legitimately at 0 for part of that window while the level
  // element unloads — which says nothing about what the channel is READING. Measured on
  // BOTH the old and new dump physics, 240 s is past the transient and feed is tracking
  // (old 67 vs steam 66; new 64 vs 64), so this is a settled point, not a refit to one of
  // them. At 120 s the old physics read feed 60 against steam 80 — it cleared the old
  // `> 30` bar without tracking at all, which is why that bar is replaced below.
  // ff=240 → 600 on 2026-07-31 (#135). The sample time is a FIXTURE, not the assertion,
  // and it was calibrated to a steam generator that drained 3.6× too fast: `K_sg_level`
  // went 5.0 → 1.37 to match Ginna UFSAR Table 15.2-4, so the post-trip level swell the
  // comment above describes now takes proportionally longer to unload and 240 s lands
  // inside it. Measured feed vs steam (gpm) after the trip:
  //     240 s   old: 63 vs 63 ✓     new:  0 vs 64 ✗   ← inside the transient
  //     420 s   old: 59 vs 63 ✓     new: 60 vs 63 ✓
  //     600 s   old: 53 vs 56 ✓     new: 57 vs 56 ✓
  // 600 s is past the transient on BOTH plants, which is what makes this a better sample
  // point rather than a refit to the new one (HR10): the check still passes on the old
  // drain rate, so nothing was weakened to accommodate the change. The ASSERTION below is
  // untouched — feed must track the TOTAL steam draw, and 0 gpm against 64 still fails.
  var tripped = await read('&inject=turbine_trip&ff=600');
  log.push('turbine tripped: steam=' + tripped.steam + ' feed=' + tripped.feed +
           ' gov=' + tripped.gov + ' dump=' + tripped.dump);
  if (!(num(tripped.gov) < 20)) throw new Error('turbine_trip did not shut the governor (gov=' + tripped.gov + ')');
  // Decay-heat scale since #216: above P-9 a turbine trip now SCRAMS the reactor, so the
  // dump carries DECAY HEAT rather than the ~98 % of the old ride-out. The check is unchanged
  // in purpose and if anything sharper — governor 0 % against a non-zero STEAM FLOW is a
  // cleaner demonstration that the readout is not governor-only.
  //
  // THRESHOLD RE-DERIVED FOR #364 (2026-08-05): was `> 3`, which came from the pre-refit
  // curve carrying ~7 % here. The sourced curve (ANS 5.1-1971 + actinides, un-multiplied)
  // puts t+600 s at ~2.4 % of rated and the dump reads 2 %. The claim is that the dump picks
  // decay heat up AT ALL, so the threshold tracks the heat there is to pick up.
  if (!(num(tripped.dump) > 1)) throw new Error('steam dump did not pick up decay heat (dump=' + tripped.dump + ')');
  // Floor 10, was 20, was 40. Both drops are the same story and neither touches the claim:
  // #372 put feedwater enthalpy in, so part of the decay heat goes to heating feed rather
  // than making steam (~64 -> ~39 gpm); #364 then corrected decay heat itself down ~2.4x in
  // this band, so there is simply less heat to carry (~39 -> 19 gpm measured). The check's
  // DISCRIMINANT is untouched and is what matters — a readout wired to the governor-only
  // `steam_flow` channel reads ~0 here, not tens of gpm, so 19 against 0 still separates
  // them by the full width of the defect (#206).
  if (!(num(tripped.steam) > 10)) {
    throw new Error('STEAM FLOW collapsed with the turbine (' + tripped.steam + ') — it is wired to the ' +
      'governor-only `steam_flow` instrument instead of `sg_steam_flow` (total SG draw). See #206.');
  }
  // Assert TRACKING, not just "nonzero": the #206 claim is that feed follows the TOTAL
  // steam draw when the turbine is offline and the dump is carrying the plant. A bare
  // `feed > 30` passes on a channel reading governor flow that happens to be mid-swing.
  // Floor 30 -> 10 with the steam floor above, same reason (#372 then #364 left less heat to
  // carry: feed reads 18 gpm against steam 19). The TOLERANCE is now RELATIVE rather than a
  // flat 15 gpm, which makes this a tighter test than it was: 15 gpm was a 23 % band when the
  // draw was 64 gpm and would have been a 79 % band at 19 — i.e. the absolute form quietly
  // loosened itself every time the plant carried less heat. 35 % of the steam draw holds the
  // same claim at any scale, and passes on the pre-#364 numbers too.
  if (!(num(tripped.feed) > 10) ||
      Math.abs(num(tripped.feed) - num(tripped.steam)) > 0.35 * num(tripped.steam)) {
    throw new Error('feed is not tracking the dump draw (feed=' + tripped.feed + ' vs steam=' +
      tripped.steam + ') — the three-element channel should match TOTAL steam flow with the ' +
      'turbine offline. See #206.');
  }
  return log.join('\n');
}

/* The rewind PICKER is the only way back (#137, OWNER 2026-07-31: "I don't think
 * there should be a rewind one step button. Make the user pick from the checkpoints
 * on the graph.").
 *
 * Worth gating because all three halves of it are separately deletable and none of
 * them announces its own absence: the button can go back to issuing a one-step
 * `rewind` (the plant still rewinds, so nothing looks broken), drawChart's cp-marks
 * can be dropped by a chart refactor (pick mode still "works", you just cannot see
 * what you are aiming at), and the click inversion can drift off drawChart's time
 * base — which is exactly what it had done: the picker inverted chartBuf's full
 * 30-minute extent while the plot drew ui.window, so clicking the mark at T+19 s
 * landed the plant at T+0 (measured, headless Edge, both before and after).
 *
 * The MARK-CLICK is the load-bearing check. Pressing the button and counting marks
 * would pass on all three defects; only clicking a specific mark and reading back
 * the clock pins the mapping. It aims at the second-oldest mark on purpose — the
 * newest and the oldest are both reachable by a broken inversion that clamps. */
/* ESF AUTO re-arm buttons disable themselves when the running engine declares no such arm
 * (#503). The kernel writes automation.esf keys only for config-declared systems; PWR2
 * declares only afw (pwr2_shell.js), so its board must show the HPI AUTO pushbutton dark —
 * the alternative is the shipped defect: a pressed button answered by an invisible
 * COMMAND_ERROR. Counting `.bd-btn:disabled` per engine pins both directions: pwr2 gets
 * exactly ONE disabled button (labelled AUTO), pwr gets ZERO — so the guard cannot silently
 * disable everything, and cannot silently disable nothing. */
async function testEsfArmButtons(page) {
  var log = [];
  var expect = { pwr: 0, pwr2: 1 };
  for (var i = 0; i < 2; i++) {
    var eng = ['pwr', 'pwr2'][i];
    await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=' + eng,
      { waitUntil: 'networkidle', timeout: 90000 });
    await dismissMission(page);
    await page.waitForTimeout(2500);
    var st = await page.evaluate(function () {
      var dis = Array.prototype.slice.call(document.querySelectorAll('.bd-btn:disabled'));
      return { total: document.querySelectorAll('.bd-btn').length,
               disabled: dis.map(function (b) { return (b.textContent || '').trim(); }) };
    });
    if (!st.total) throw new Error(eng + ': board rendered no buttons');
    if (st.disabled.length !== expect[eng]) {
      throw new Error(eng + ': expected ' + expect[eng] + ' disabled board button(s), found ' +
        st.disabled.length + ' [' + st.disabled.join(',') + ']');
    }
    if (eng === 'pwr2' && st.disabled[0] !== 'AUTO') {
      throw new Error('pwr2: the disabled button is "' + st.disabled[0] + '", not the ESF AUTO re-arm');
    }
    log.push(eng + ': ' + st.disabled.length + '/' + st.total + ' buttons disabled' +
      (st.disabled.length ? ' (' + st.disabled.join(',') + ')' : ''));
  }
  return log.join('\n') + '\n';
}

/* (testTrendPreseed deleted 2026-08-21 with the pre-seed itself, #501 — the chart now
 * deliberately opens empty and fills live, so a check demanding 30 minutes of opening
 * history would be asserting the removed behaviour.) */

/* THE CHART SETTINGS WINDOW (#454) — large, pausing, every channel with its live value, and
 * a per-row indication / physics / both choice.
 *
 * EVERY CHECK HERE IS A DEFECT THAT ALREADY SHIPPED, in this feature, in one day:
 *
 *   1. REACHABILITY. The anchored popover this replaces shipped TWICE with its channel list
 *      unreachable — first clipped by the chart, then below the fold — and both times a
 *      check that counted rows passed, because 120 rows existed and none could be seen. So
 *      this measures the modal's RECT against the viewport and the list's own height.
 *   2. PAUSE, ALL THREE CASES. Open must stop the plant; close must start it; and close must
 *      NOT start a plant the player had already stopped themselves. Only the third case
 *      tests the `pauseWhy` reason map, which is the thing that makes the rule expressible
 *      at all — a single boolean passes the first two and fails the third silently.
 *   3. 'BOTH' DRAWS TWO TRACES, and the lane floor still holds — MEASURED FROM THE DRAWN
 *      LANES. `plot / lanes` is not the lane height: that computation once reported 56 px
 *      where the truth was 38, which is how a floor gets certified while being violated.
 *   4. THE VALUES MATCH THE INDICATIONS TAB. They are supposed to come from the same
 *      functions; comparing the rendered text is what proves they still do.
 *   5. sideOf's TRUTH TABLE, in-page. ui/app.js is a browser IIFE and cannot be require()d,
 *      so the resolver's edge cases ride here rather than in a Node runner. */
async function testChartSettings(page) {
  var log = [];
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr',
    { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await page.waitForTimeout(1500);

  // ---- 1. it opens, and the list is actually on screen -------------------------------
  await page.click('#chartOptsBtn');
  await page.waitForTimeout(400);
  var geo = await page.evaluate(function () {
    var ov = document.getElementById('chartOverlay');
    var modal = ov ? ov.querySelector('.mission-modal') : null;
    var list = document.getElementById('coList');
    if (!ov || !modal || !list) return { missing: true };
    var m = modal.getBoundingClientRect(), l = list.getBoundingClientRect();
    return {
      hidden: ov.hidden,
      m: { l: m.left, t: m.top, r: m.right, b: m.bottom },
      vw: window.innerWidth, vh: window.innerHeight,
      listH: l.height, listScroll: list.scrollHeight,
      rows: list.querySelectorAll('.cs-row').length,
      picks: list.querySelectorAll('.cs-pick input').length,
    };
  });
  if (geo.missing) throw new Error('#chartOverlay / .mission-modal / #coList did not render');
  if (geo.hidden) throw new Error('⚙ did not open the chart settings window (#chartOverlay still hidden)');
  if (geo.m.l < 0 || geo.m.t < 0 || geo.m.r > geo.vw + 1 || geo.m.b > geo.vh + 1) {
    throw new Error('the chart settings window is OUTSIDE the viewport: modal ' +
      JSON.stringify(geo.m) + ' against ' + geo.vw + 'x' + geo.vh + '. This is the defect the ' +
      'anchored popover shipped with twice — see #454.');
  }
  if (!(geo.listH > 100)) {
    throw new Error('the channel list has no usable height (' + Math.round(geo.listH) + ' px) — ' +
      'it rendered ' + geo.rows + ' rows nobody can see. Counting rows is what missed this before.');
  }
  if (!(geo.rows > 50) || geo.picks !== geo.rows * 2) {
    throw new Error('expected every channel listed with TWO selectors: ' + geo.rows + ' rows, ' +
      geo.picks + ' selectors (want ' + (geo.rows * 2) + ').');
  }
  log.push('window: modal ' + Math.round(geo.m.r - geo.m.l) + 'x' + Math.round(geo.m.b - geo.m.t) +
    ' inside ' + geo.vw + 'x' + geo.vh + '; list ' + Math.round(geo.listH) + ' px tall, ' +
    Math.round(geo.listScroll) + ' px of content, ' + geo.rows + ' rows, ' + geo.picks + ' selectors');

  // ---- 2a. opening PAUSED the plant, closing starts it again ------------------------
  var paused = await page.evaluate(function () { return document.getElementById('playBtn').classList.contains('paused'); });
  if (!paused) throw new Error('opening the chart settings window did NOT pause the plant (#454 requirement 2)');
  await page.click('#chartOptsClose');
  await page.waitForTimeout(500);
  var after = await page.evaluate(function () {
    return { hidden: document.getElementById('chartOverlay').hidden,
             paused: document.getElementById('playBtn').classList.contains('paused') };
  });
  if (!after.hidden) throw new Error('✕ Close did not close the chart settings window');
  if (after.paused) throw new Error('closing the chart settings window did not resume the plant');
  log.push('pause: open stops the plant, close starts it');

  // ---- 2b. …but NOT a plant the player had already stopped --------------------------
  // The case a single boolean cannot express. `user` and `modal` are separate holds, so
  // closing releases only the modal's and finds `user` still standing.
  await page.click('#playBtn');
  await page.waitForTimeout(300);
  await page.click('#chartOptsBtn');
  await page.waitForTimeout(300);
  await page.click('#chartOptsClose');
  await page.waitForTimeout(500);
  var stillPaused = await page.evaluate(function () { return document.getElementById('playBtn').classList.contains('paused'); });
  if (!stillPaused) {
    throw new Error('closing the chart settings window RESUMED a plant the player had paused ' +
      'themselves — the `user` hold was dropped. See the pauseWhy reason map in ui/app.js.');
  }
  await page.click('#playBtn');                    // hand the plant back running
  await page.waitForTimeout(300);
  log.push('pause: a player-paused plant stays paused through open/close');

  // ---- 3. a row set to BOTH draws two traces, and the lane floor still holds --------
  var before = await page.evaluate(function () { return document.querySelectorAll('#chartCanvas polyline').length; });
  await page.click('#chartOptsBtn');
  await page.waitForTimeout(300);
  await page.evaluate(function () {
    var row = document.querySelector('.cs-row[data-cs="tavg"]');
    if (!row) throw new Error('no Tavg row in the channel list');
    ['ind', 'phys'].forEach(function (s) {
      var b = row.querySelector('[data-cs-side="' + s + '"]');
      if (!b.checked) b.click();
    });
  });
  await page.click('#chartOptsClose');
  await page.waitForTimeout(900);
  var both = await page.evaluate(function () {
    var polys = Array.prototype.slice.call(document.querySelectorAll('#chartCanvas polyline'));
    var canvas = document.getElementById('chartCanvas');
    var chrome = Array.prototype.slice.call(document.querySelectorAll('#chartFloats .lane-chrome'));
    /* LANE HEIGHT FROM THE DRAWN LANES. Consecutive lane-chrome tops in real px, plus the
     * last lane's extent taken from the canvas bottom (or from the numeric strip, which is
     * what eats into the lanes). NOT plot/lanes — see the header. */
    var tops = chrome.map(function (c) { return c.getBoundingClientRect().top; })
                     .sort(function (a, b) { return a - b; });
    var nums = document.querySelector('#chartFloats .lane-nums');
    var floor = nums ? nums.getBoundingClientRect().top : canvas.getBoundingClientRect().bottom;
    var heights = [];
    for (var i = 1; i < tops.length; i++) heights.push(tops[i] - tops[i - 1]);
    if (tops.length) heights.push(floor - tops[tops.length - 1]);
    return {
      polys: polys.length,
      dashed: polys.filter(function (p) { return p.getAttribute('stroke-dasharray'); }).length,
      lanes: chrome.length,
      minLane: heights.length ? Math.min.apply(null, heights) : 0,
      paired: document.querySelectorAll('#chartFloats .lane-value.paired').length,
      physFig: document.querySelectorAll('#chartFloats .lane-value-phys').length,
    };
  });
  if (both.polys !== before + 1 || both.dashed !== 1) {
    throw new Error('setting Tavg to BOTH should add exactly one dashed trace: polylines ' +
      before + ' -> ' + both.polys + ', dashed=' + both.dashed);
  }
  if (both.paired !== 1 || both.physFig !== 1) {
    throw new Error('a BOTH lane must print both readings in its value column (paired=' +
      both.paired + ' physFigures=' + both.physFig + ')');
  }
  if (!(both.minLane >= 36)) {
    throw new Error('lane height fell below the 36 px floor: ' + both.minLane.toFixed(1) +
      ' px, MEASURED from the drawn lanes. (#440 §14-7a — and note this is measured, not ' +
      'computed as plot/lanes, which once reported 56 where the truth was 38.)');
  }
  log.push('both: ' + both.lanes + ' lanes, ' + both.polys + ' traces (1 dashed), smallest lane ' +
    both.minLane.toFixed(1) + ' px against a 36 px floor');

  // ---- 4. the values are the Indications tab's values -------------------------------
  await page.click('[data-tab="indications"]');
  await page.waitForTimeout(600);
  await page.click('#chartOptsBtn');
  await page.waitForTimeout(500);
  var match = await page.evaluate(function () {
    var out = [], want = ['tavg', 'thot', 'pressure'];
    var lines = Array.prototype.slice.call(document.querySelectorAll('#indicationsList .num-line'));
    want.forEach(function (id) {
      var row = document.querySelector('.cs-row[data-cs="' + id + '"]');
      if (!row) { out.push({ id: id, err: 'no settings row' }); return; }
      // The Indications list is in profile order and carries no id, so find it by label.
      var label = row.querySelector('.cs-name').textContent;
      var line = null;
      lines.forEach(function (l) { if (!line && l.querySelector('.nk').textContent === label) line = l; });
      if (!line) { out.push({ id: id, err: 'no indications row for "' + label + '"' }); return; }
      out.push({ id: id, label: label,
        csInd: (row.querySelector('[data-cs-val="ind"]') || {}).textContent,
        tabInd: (line.querySelector('.nv') || {}).textContent,
        csPhys: (row.querySelector('[data-cs-val="phys"]') || {}).textContent,
        tabPhys: (line.querySelector('.nv-true') || {}).textContent });
    });
    return out;
  });
  match.forEach(function (m) {
    if (m.err) throw new Error('value cross-check: ' + m.id + ' — ' + m.err);
    if (m.csInd !== m.tabInd || m.csPhys !== m.tabPhys) {
      throw new Error('the chart settings window disagrees with the Indications tab for "' +
        m.label + '": ind "' + m.csInd + '" vs "' + m.tabInd + '", phys "' + m.csPhys +
        '" vs "' + m.tabPhys + '". They are supposed to share seriesLive()/seriesTrue().');
    }
  });
  log.push('values match the Indications tab: ' + match.map(function (m) {
    return m.label + ' ' + m.csInd + '/' + m.csPhys;
  }).join(', '));

  // ---- 5. sideOf's truth table -------------------------------------------------------
  // A physics-only quantity has no instrument selector to tick; a demand has no physics one.
  // Both are DISABLED rather than absent, so the columns stay readable down a 120-row list.
  var avail = await page.evaluate(function () {
    function row(id) {
      var r = document.querySelector('.cs-row[data-cs="' + id + '"]');
      if (!r) return null;
      return { ind: !r.querySelector('[data-cs-side="ind"]').disabled,
               phys: !r.querySelector('[data-cs-side="phys"]').disabled,
               indVal: r.querySelector('[data-cs-val="ind"]').textContent };
    }
    return { decay: row('decay'), rho: row('rho'), tavg: row('tavg') };
  });
  if (!avail.decay || avail.decay.ind || !avail.decay.phys || avail.decay.indVal !== '—') {
    throw new Error('Decay Heat is physics-only: its indication selector must be disabled and ' +
      'its indication value a dash — got ' + JSON.stringify(avail.decay));
  }
  if (!avail.rho || avail.rho.ind) throw new Error('Reactivity has no instrument; its indication selector must be disabled');
  if (!avail.tavg || !avail.tavg.ind || !avail.tavg.phys) throw new Error('Tavg is a paired channel; both selectors must be live');
  log.push('sideOf: physics-only channels offer no instrument side (decay, rho); paired channels offer both (tavg)');

  await page.click('#chartOptsClose');
  return log.join('\n') + '\n';
}

/* THE MONITOR LIST (#477) — the Indications tab's tick, repurposed.
 *
 * *(OWNER, 2026-08-12: "the check boxes select what you see in the [strip chart] which is
 * redundant because now the strip chart has its own menu… they are going to be used for
 * indications that I want to monitor… they place a duplicate at the top of the indications
 * panel above all the other indications.")*
 *
 * WRITTEN TO FAIL ON THE OLD BEHAVIOUR TOO (HR10). The easy version of this check — "a
 * duplicate row appears" — would pass on a build that ALSO still plotted the channel, and the
 * plot side is the half nothing in the list can show you. So the trace count is recorded
 * across the tick: a leftover `drawChart()`/`ui.series` write in the row handler moves it, and
 * that assertion is the one that says the repurpose actually happened. Conversely a build with
 * the OLD handler and no block fails on the first assertion. Neither half passes alone.
 *
 * The other four are the cases the feature is only useful if it holds: the copy carries BOTH
 * values and they equal the source's (a watch list printing a different number from the row it
 * copies is worse than no watch list); the copy is the FIRST row in the panel; a row-type chip
 * cannot hide it; and the selection survives a reload, which is the only reason to curate one.
 *
 * It cleans up after itself — `rd_monitor` is real localStorage and the rest of this gate
 * shares the browser context. */
async function testMonitorList(page) {
  var log = [];
  var URL = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr';
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await page.evaluate(function () { try { localStorage.removeItem('rd_monitor'); } catch (e) {} });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await page.click('[data-tab="indications"]');
  await page.waitForTimeout(900);

  /* THE SUBJECT MUST BE AN UNPLOTTED CHANNEL, and this asserts it rather than assuming it.
   * The first version of this check ticked `tavg` — which is in `PROFILES.pwr.defaultSeries`
   * and therefore ALREADY on the chart, so "the trace count did not move" was true no matter
   * what the handler did. Re-injecting the old `ui.series[id] = checked; drawChart()` passed
   * it green. A red that cannot go red is worse than no check, so the precondition is
   * measured: `thot` carries no trace and no swatch before the tick. */
  var start = await page.evaluate(function () {
    var src = document.querySelector('#indicationsList .ind-grp:not(.ind-monitor) .num-line[data-ser="thot"]');
    return { polys: document.querySelectorAll('#chartCanvas polyline').length,
             mon: document.querySelectorAll('#indMonitor .num-line').length,
             head: !!document.querySelector('#indMonitor .ind-monitor'),
             plotted: !!(src && src.querySelector('.ser-swatch')) };
  });
  if (start.mon !== 0 || start.head) {
    throw new Error('the Monitoring block must render NOTHING when nothing is ticked — got ' +
      start.mon + ' rows, heading=' + start.head);
  }
  if (start.plotted) {
    throw new Error('Hot Leg is already plotted, so "the tick did not touch the chart" cannot ' +
      'fail — pick a channel outside PROFILES.pwr.defaultSeries. This precondition exists ' +
      'because the check was once written on `tavg`, which IS in the defaults, and it passed ' +
      'with the old plot-on-tick handler injected straight back in.');
  }

  /* ---- 1. a tick copies the row to the top, and does NOT touch the chart --------------
   *
   * EVERY SOURCE-ROW SELECTOR BELOW CARRIES `:not(.ind-monitor)`, and it is load-bearing.
   * The block keeps `.ind-grp` for its row metrics, so `.ind-grp .num-line[data-ser=x]`
   * matches the COPY first (it is earlier in the document) and every "did the source row
   * do Y?" check would silently be asking about the duplicate instead. That is how this
   * check first ran red on a build where the CSS was correct. */
  await page.click('#indicationsList .ind-grp:not(.ind-monitor) .num-line[data-ser="thot"] input[data-monitor]');
  await page.waitForTimeout(700);
  var one = await page.evaluate(function () {
    var list = document.getElementById('indicationsList');
    var dup = document.querySelector('#indMonitor .num-line[data-ser="thot"]');
    var src = document.querySelector('#indicationsList .ind-grp:not(.ind-monitor) .num-line[data-ser="thot"]');
    return {
      dup: !!dup,
      first: list.querySelector('.num-line') === dup,
      polys: document.querySelectorAll('#chartCanvas polyline').length,
      plotted: !!src.querySelector('.ser-swatch'),
      dupInd: dup ? dup.querySelector('.nv').textContent : null,
      srcInd: src ? src.querySelector('.nv').textContent : null,
      dupPhys: dup ? dup.querySelector('.nv-true').textContent : null,
      srcPhys: src ? src.querySelector('.nv-true').textContent : null,
      srcChecked: !!src.querySelector('input[data-monitor]').checked,
      count: (document.querySelector('.ind-mon-n') || {}).textContent,
    };
  });
  if (!one.dup) throw new Error('ticking a row did not copy it into #indMonitor');
  if (!one.first) throw new Error('the monitored copy is not the FIRST row in the panel');
  if (one.polys !== start.polys || one.plotted) {
    throw new Error('ticking an Indications row CHANGED THE CHART: ' + start.polys + ' -> ' +
      one.polys + ' traces, swatch=' + one.plotted + '. Since #477 the tick curates the ' +
      'monitor list and nothing else; the chart is chosen in its own settings window. (Two ' +
      'assertions, not one: the swatch catches a `ui.series` write even in a state where the ' +
      'trace count happens not to move.)');
  }
  if (!one.srcChecked) throw new Error('the source row\'s own box did not end up ticked');
  if (one.dupInd !== one.srcInd || one.dupPhys !== one.srcPhys) {
    throw new Error('the monitored copy disagrees with the row it copies: ind "' + one.dupInd +
      '" vs "' + one.srcInd + '", phys "' + one.dupPhys + '" vs "' + one.srcPhys + '"');
  }
  if (one.dupInd === '—' || one.dupPhys === '—') {
    throw new Error('the monitored copy is not being painted (ind "' + one.dupInd + '", phys "' +
      one.dupPhys + '") — a new row must not wait for the next broadcast to read');
  }
  if (one.count !== '1') throw new Error('the block heading counts wrong: "' + one.count + '"');
  log.push('tick: Hot Leg copied to the top reading ' + one.dupInd + ' / ' + one.dupPhys +
    ', chart unchanged at ' + one.polys + ' traces');

  // ---- 2. profile order, not tick order ---------------------------------------------
  // `core_exit` precedes `thot` in PROFILES.pwr.series and sits in a different group, so
  // ticking it SECOND must place it FIRST — and the block must flatten the grouping.
  await page.click('#indicationsList .ind-grp:not(.ind-monitor) .num-line[data-ser="core_exit"] input[data-monitor]');
  await page.waitForTimeout(500);
  var order = await page.evaluate(function () {
    return Array.prototype.slice.call(document.querySelectorAll('#indMonitor .num-line'))
      .map(function (l) { return l.getAttribute('data-ser'); });
  });
  if (order.join(',') !== 'core_exit,thot') {
    throw new Error('the block is in tick order, not profile order: [' + order.join(', ') + ']');
  }
  log.push('order: [' + order.join(', ') + '] — profile order, not the order they were ticked');

  // ---- 3. a row-type chip cannot hide a monitored row --------------------------------
  await page.click('#indFilters [data-indfilter="phys"]');
  await page.waitForTimeout(400);
  var filtered = await page.evaluate(function () {
    var vis = function (el) { return !!(el && el.getBoundingClientRect().height); };
    return { src: vis(document.querySelector('#indicationsList .ind-grp:not(.ind-monitor) .num-line[data-ser="thot"]')),
             dup: vis(document.querySelector('#indMonitor .num-line[data-ser="thot"]')) };
  });
  if (filtered.src) throw new Error('the "Physics only" chip did not hide the paired Hot Leg row');
  if (!filtered.dup) throw new Error('a row-type chip hid a MONITORED row — the block is an explicit selection and outranks the filter');
  await page.click('#indFilters [data-indfilter="all"]');
  await page.waitForTimeout(300);
  log.push('filter: "Physics only" hides the source row and leaves the monitored copy standing');

  // ---- 4. it survives a reload -------------------------------------------------------
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await page.click('[data-tab="indications"]');
  await page.waitForTimeout(900);
  var kept = await page.evaluate(function () {
    return { rows: Array.prototype.slice.call(document.querySelectorAll('#indMonitor .num-line'))
               .map(function (l) { return l.getAttribute('data-ser'); }),
             box: !!(document.querySelector('#indicationsList .ind-grp:not(.ind-monitor) .num-line[data-ser="thot"] input[data-monitor]') || {}).checked };
  });
  if (kept.rows.join(',') !== 'core_exit,thot' || !kept.box) {
    throw new Error('the monitor list did not survive a reload: [' + kept.rows.join(', ') +
      '], source box checked=' + kept.box);
  }
  log.push('persistence: both channels came back after a reload with their boxes ticked');

  // ---- 5. unticking FROM THE COPY clears both ----------------------------------------
  await page.click('#indMonitor .num-line[data-ser="thot"] input[data-monitor]');
  await page.waitForTimeout(500);
  var gone = await page.evaluate(function () {
    return { dup: !!document.querySelector('#indMonitor .num-line[data-ser="thot"]'),
             box: !!(document.querySelector('#indicationsList .ind-grp:not(.ind-monitor) .num-line[data-ser="thot"] input[data-monitor]') || {}).checked,
             left: document.querySelectorAll('#indMonitor .num-line').length };
  });
  if (gone.dup) throw new Error('unticking from the copy left the copy in place');
  if (gone.box) throw new Error('unticking from the copy left the SOURCE row still ticked');
  if (gone.left !== 1) throw new Error('unticking one row took ' + (2 - gone.left) + ' rows with it');
  log.push('untick: clearing the copy clears the source row too, and leaves the other alone');

  // Leave the browser context as we found it — this is real localStorage.
  await page.click('#indMonitor .num-line[data-ser="core_exit"] input[data-monitor]');
  await page.waitForTimeout(300);
  await page.evaluate(function () { try { localStorage.removeItem('rd_monitor'); } catch (e) {} });
  return log.join('\n') + '\n';
}

/* CLOSING PLANT & MISSION LEAVES THE PLANT RUNNING *(OWNER, 2026-08-11: "When i close the
 * plant menu after starting the sim the sim should start playing. it currently starts
 * paused. it should start running after closing the plant & mission menu.")*.
 *
 * THE FREE-PLAY PATH IS THE ONE THAT WAS BROKEN, and the plain ✕ was not — which is why this
 * checks BOTH. `closeMissionSelect(); switchEngine(...)` released the `modal` hold and started
 * the plant, then took `plant_change` for the rebuild and never released it. A check that only
 * pressed ✕ would have passed on the defect, because ✕ alone never calls switchEngine.
 *
 * The third case is the one that keeps the fix honest: a plant the PLAYER stopped must stay
 * stopped through a plant change. `releaseHold` drops one named hold, so `user` survives —
 * and if someone ever "simplifies" it back to clearing the map, this is what catches it. */
async function testMissionCloseResumes(page) {
  var log = [];
  var running = function () {
    return page.evaluate(function () { return !document.getElementById('playBtn').classList.contains('paused'); });
  };
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr',
    { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(1200);

  // The window opens on every load, so this is the very first thing a player does.
  if (!(await page.isVisible('#missionOverlay'))) throw new Error('Plant & Mission did not open on load');
  await page.click('#missionClose');
  await page.waitForTimeout(700);
  if (!(await running())) throw new Error('closing Plant & Mission with ✕ left the plant PAUSED');
  log.push('✕ Close: plant runs');

  // The reported path: pick a starting condition and press Free Play.
  await page.click('#simStatus');
  await page.waitForTimeout(400);
  if (!(await page.isVisible('#missionOverlay'))) throw new Error('could not reopen Plant & Mission');
  await page.click('[data-mfree]');
  await page.waitForTimeout(1200);
  if (await page.isVisible('#missionOverlay')) throw new Error('Free Play did not close the window');
  if (!(await running())) {
    throw new Error('starting Free Play left the plant PAUSED — switchEngine took the ' +
      '`plant_change` hold for its rebuild and never released it. This is the reported bug; ' +
      'note that pressing ✕ alone passes on it, because ✕ never calls switchEngine.');
  }
  log.push('Free Play: plant runs after the window closes');

  // …but a plant the PLAYER paused stays paused through the same path.
  await page.click('#playBtn');
  await page.waitForTimeout(300);
  if (await running()) throw new Error('⏸ did not stop the plant');
  await page.click('#simStatus');
  await page.waitForTimeout(400);
  if (!(await page.isVisible('#missionOverlay'))) throw new Error('could not reopen Plant & Mission (2nd)');
  await page.click('[data-mfree]');
  await page.waitForTimeout(1200);
  if (await running()) {
    throw new Error('a plant the PLAYER paused started itself on a plant change — the `user` ' +
      'hold was dropped. releaseHold() must clear ONE named reason, not the map.');
  }
  log.push('a player-paused plant stays paused through a plant change');
  return log.join('\n') + '\n';
}

/* THE RUN-START MARK — sim time zero *(OWNER, 2026-08-11: "The strip chart should have a
 * line to show the start of the sim at time=0.")*.
 *
 * Since the pre-seed removal (#501) the chart opens empty, so the line marks where the
 * record begins on an otherwise-bare axis rather than a join with synthetic history — the
 * geometry being gated (position from chartExtent's t0/window mapping) is unchanged.
 *
 * THE OVERLAP CHECK IS THE ONE THAT EARNED ITS PLACE. The tag first rendered at the TOP of
 * the plot and landed inside the first lane's range label — "40% T+0 %" on screen. Every
 * element existed, every count was right, and only the screenshot showed it. Comparing the
 * tag's RECT against the lane chrome turns that into something a gate can hold. */
async function testRunStartMark(page) {
  var log = [];
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr',
    { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await page.waitForTimeout(2500);

  var st = await page.evaluate(function () {
    var line = document.querySelector('#chartCanvas .run-start');
    var tag = document.querySelector('.run-start-tag');
    var svg = document.getElementById('chartCanvas');
    if (!line || !tag) return { line: !!line, tag: !!tag };
    var tr = tag.getBoundingClientRect(), pr = svg.getBoundingClientRect();
    // Every piece of lane chrome the tag could land on top of.
    var hits = [];
    Array.prototype.forEach.call(document.querySelectorAll('#chartFloats .lane-rng, #chartFloats .lane-name, #chartFloats .lane-value'), function (el) {
      var r = el.getBoundingClientRect();
      if (tr.left < r.right && tr.right > r.left && tr.top < r.bottom && tr.bottom > r.top) {
        hits.push((el.className || '') + ' "' + el.textContent.trim().slice(0, 24) + '"');
      }
    });
    return {
      line: true, tag: true, text: tag.textContent,
      x1: parseFloat(line.getAttribute('x1')),
      inside: tr.left >= pr.left - 1 && tr.right <= pr.right + 1 && tr.top >= pr.top - 1 && tr.bottom <= pr.bottom + 1,
      overlaps: hits,
    };
  });
  if (!st.line) throw new Error('no run-start line on the chart at T+0 (#chartCanvas .run-start)');
  if (!st.tag) throw new Error('the run-start line has no label (.run-start-tag)');
  if (!st.inside) throw new Error('the run-start tag is drawn outside the plot');
  if (st.overlaps.length) {
    throw new Error('the run-start tag overlaps lane chrome: ' + st.overlaps.join(' | ') +
      '. It rendered over the first lane\'s range label ("40% T+0 %") before it was moved to ' +
      'the bottom strip — element counts all passed on that.');
  }
  // The mark is at t=0, not merely somewhere: with the window entirely ahead of the run
  // start, x must land in the right-hand part of the plot and short of the gutter.
  if (!(st.x1 > 0 && st.x1 < 400 * 0.86)) {
    throw new Error('the run-start line is off the plot area: x1=' + st.x1);
  }
  log.push('run start: line at x=' + st.x1.toFixed(1) + ', tag "' + st.text + '" clear of lane chrome');

  /* NEGATIVE CONTROL — it must SCROLL OFF. An "always drawn" line would pass everything
   * above, and a mark that never leaves is not marking a moment. Drive sim time forward at
   * 600x, then drop to 1x (whose ladder offers a 60 s rung) so the run is far older than the
   * window. */
  await page.click('#speed [data-speed="600"]');
  await page.waitForTimeout(6000);
  await page.click('#speed [data-speed="1"]');
  await page.waitForTimeout(600);
  await page.click('#graphWindow [data-win="60"]');
  await page.waitForTimeout(700);
  var gone = await page.evaluate(function () {
    return {
      clock: (document.getElementById('clock') || {}).textContent,
      line: !!document.querySelector('#chartCanvas .run-start'),
      tag: !!document.querySelector('.run-start-tag'),
    };
  });
  if (gone.line || gone.tag) {
    throw new Error('the run-start mark is still drawn at ' + gone.clock + ' on a 60 s window — ' +
      'it is being drawn unconditionally rather than only when t=0 is in frame ' +
      '(line=' + gone.line + ' tag=' + gone.tag + ')');
  }
  log.push('run start: gone at ' + gone.clock + ' on a 60 s window — it marks a moment, not an axis');
  return log.join('\n') + '\n';
}

async function testRewindPicker(page) {
  var log = [];
  var VBW = 400, PLOT_FRAC = 0.86;                 // mirror ui/app.js drawChart
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr&run=1',
    { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await page.waitForTimeout(800);

  // Drive M5's wall clock instead of waiting on it. The cadence is 20 REAL seconds
  // now, so laying the four or five marks this needs would otherwise cost 80-100 s
  // of gate time. `_now` is a prototype method precisely so it can be substituted;
  // seeding from the page's own Date.now() keeps it monotonic with what the service
  // has already stamped. Sim time still advances for real, at 60x, so the marks land
  // far enough apart to aim between.
  await page.evaluate(function () {
    globalThis.__wall = Date.now();
    globalThis.RD.SimulationService.prototype._now = function () { return globalThis.__wall; };
  });
  await page.click('#speed [data-speed="60"]');
  for (var k = 0; k < 5; k++) {
    await page.evaluate(function () { globalThis.__wall += 20000; });
    await page.waitForTimeout(700);                // ~42 sim s per slot at 60x
  }

  var clockSec = async function () {
    var t = await page.textContent('#clock');
    var m = /T\+(\d+):(\d+):(\d+)/.exec(t || '');
    return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : NaN;
  };
  var tLive = await clockSec();
  log.push('live clock: T+' + tLive + ' s');
  if (!(tLive > 0)) throw new Error('sim clock never advanced (T+' + tLive + ') — cannot test rewind');

  if (await page.evaluate(function () { return document.getElementById('chartRewindBtn').disabled; })) {
    throw new Error('⏪ Rewind is disabled after ' + tLive + ' s of free play — no checkpoint was laid');
  }
  await page.click('#chartRewindBtn');
  await page.waitForTimeout(300);

  var st = await page.evaluate(function () {
    var r = document.querySelector('.chart-plot').getBoundingClientRect();
    return {
      picking: document.querySelector('.strip-chart').classList.contains('rewind-pick'),
      hint: !document.getElementById('rewindHint').hidden,
      paused: document.getElementById('playBtn').classList.contains('paused'),
      marks: Array.from(document.querySelectorAll('#chartCanvas .cp-mark'))
        .map(function (m) { return parseFloat(m.getAttribute('x1')); })
        .sort(function (a, b) { return a - b; }),
      axis0: (document.querySelectorAll('#chartXAxis span')[0] || {}).textContent || '',
      left: r.left, top: r.top, w: r.width, h: r.height,
    };
  });
  // The button must open pick mode, NOT rewind on its own — a one-step press would
  // have moved the clock and left rewind-pick off.
  if (!st.picking || !st.hint) {
    throw new Error('⏪ Rewind did not open pick mode (picking=' + st.picking + ' hint=' + st.hint +
      ') — it is still issuing a one-step rewind. See #137.');
  }
  if (!st.paused) throw new Error('pick mode must pause the clock — picking a moment on a moving graph is a carnival game');
  // NOT "the clock is unchanged" — the plant is running at 60x, so it legitimately
  // advances several sim-seconds between the read above and the press. That form
  // passed on one branch and failed on the merge for pure timing reasons, which is
  // the tell that it was never asserting what it claimed. What a one-step rewind
  // does, and pick mode cannot, is move the clock BACKWARDS.
  var tAfterPress = await clockSec();
  if (tAfterPress < tLive) {
    throw new Error('pressing ⏪ rewound the plant (T+' + tLive + ' → T+' + tAfterPress +
      ') instead of opening the picker (#137)');
  }
  if (st.marks.length < 4) throw new Error('the plot shows ' + st.marks.length + ' checkpoint marks after 5 cadence ' +
    'intervals — the free-play ring is not filling on the wall clock (#137)');
  log.push('pick mode: ' + st.marks.length + ' marks, axis starts ' + st.axis0);

  // Invert drawChart's own placement: x = (t - t0)/span * PW.
  var m = /(\d+):(\d+):(\d+)/.exec(st.axis0);
  var span = m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (/(\d+)s/.exec(st.axis0) ? +(/(\d+)s/.exec(st.axis0)[1]) : 0);
  if (!(span > 0)) throw new Error('could not read the plotted span from the x-axis ("' + st.axis0 + '")');
  // t1 is the moment the plot was DRAWN at — i.e. after pick mode froze the clock —
  // not the reading from before the press. They differ by however much sim elapsed
  // while the click was in flight, and using the earlier one shifts every mark's
  // expected time by that amount.
  var t0 = tAfterPress - span, PW = VBW * PLOT_FRAC;
  var mx = st.marks[1];
  var expected = t0 + (mx / PW) * span;
  log.push('aiming at mark x=' + mx.toFixed(1) + ' → expected T+' + expected.toFixed(1) + ' s');

  await page.mouse.click(st.left + (mx / VBW) * st.w, st.top + st.h * 0.5);
  await page.waitForTimeout(600);
  var landed = await clockSec();
  log.push('landed T+' + landed + ' s (error ' + (landed - expected).toFixed(1) + ' s)');
  if (Math.abs(landed - expected) > 6) {
    throw new Error('clicking the checkpoint mark at T+' + expected.toFixed(0) + ' s landed the plant at T+' +
      landed + ' s — the picker is not inverting the same time base drawChart plotted the marks against. See #137.');
  }
  // …and that it went back at all. A picker that lands on the newest checkpoint for
  // every click satisfies the tolerance above whenever the aim happens to be near
  // the right edge, so pin the direction separately.
  if (!(landed < tAfterPress - 10)) {
    throw new Error('the pick did not rewind: clock T+' + tAfterPress + ' → T+' + landed);
  }
  if (await page.evaluate(function () { return document.querySelector('.strip-chart').classList.contains('rewind-pick'); })) {
    throw new Error('pick mode stayed open after the pick');
  }
  return log.join('\n');
}

/* THE BUG REPORT'S RECORDING, THROUGH THE REAL WIRING (#432).
 *
 * `test/run_diag_bundle.js` drives ui/diag_recorder.js directly and cannot execute ui/app.js,
 * so it cannot see whether the app actually FEEDS it. That gap is not hypothetical: the first
 * working version of the fix passed all 31 of those checks while the shipped page recorded 35
 * samples where it should have had 2040, because the fine sub-samples were drained inside the
 * rAF paint — one animation frame after the broadcast — and reached the recorder only after it
 * had already advanced past their timestamps. Rows in, nothing recorded. Only a browser can
 * catch that, so it is asserted here: run the plant at 600x, press the app's own download
 * button, and read the file it produces.
 */
async function testDiagBundle(page) {
  var log = [];
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr',
    { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await page.waitForTimeout(1500);
  // SPEED FIRST, THEN PLAY. Ticks taken at 1x produce no fine rows at all — a 1x broadcast
  // carries 0.1 s of sim against the service's 0.2 s fine grid — so a single tick between
  // pressing play and the speed landing latches `sampling.source` to "mixed" for the rest of
  // the session. Ordering it this way makes the run deterministic instead of a race the
  // parallel gate loses on a loaded box.
  await page.evaluate(function () {
    var b = document.querySelector('#speedSeg [data-speed="600"], [data-speed="600"]');
    if (b) b.click();
  });
  await page.click('#playBtn');
  await page.waitForTimeout(6000);

  // ONE CLICK, from the header (#438/#439). This used to be `Settings tab -> #fbBtn`,
  // which is the path that no longer exists: Settings is a modal off the header now, and
  // Feedback got its own header button precisely because three levels down was a plausible
  // cause of the near-zero report volume. Using the shorter path is not a refit — it is the
  // route a player actually takes, and the old one was two clicks through a surface that
  // now pauses the plant, which would change what this test is measuring.
  await page.click('#fbHeaderBtn');
  await page.waitForTimeout(200);
  var dl = (await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#fbDiag')]))[0];
  var out = path.join(SCRATCH, 'diag-bundle.json');
  await dl.saveAs(out);

  var b = JSON.parse(fs.readFileSync(out, 'utf8'));
  var ts = b.timeseries || {};
  if (b.schema_version !== '1.1') throw new Error('diag bundle schema is ' + b.schema_version + ', expected 1.1');
  if ('sample_hz' in (b.manifest || {})) throw new Error('diag manifest still carries sample_hz');
  if (!ts.fields || !ts.t || !ts.lo || !ts.hi) throw new Error('diag timeseries is not columnar with extremes');

  // THE ONE THAT CATCHES THE DRAIN BEING IN THE WRONG PLACE. At 600x a broadcast carries 60 s
  // of plant, so the broadcast-only fallback yields ~1 row a minute; the fine seam yields one
  // a second. Asserting the SOURCE alone is not enough — that reads 'mixed' on a page feeding
  // the recorder two rows an hour.
  var dts = [];
  for (var i = 1; i < ts.t.length; i++) dts.push(ts.t[i] - ts.t[i - 1]);
  var worst = dts.length ? Math.max.apply(null, dts) : Infinity;
  var span = ts.t.length ? ts.t[ts.t.length - 1] - ts.t[0] : 0;
  log.push('rows=' + ts.t.length + ' span=' + span.toFixed(0) + 's worst dt=' + worst.toFixed(1) +
    's source=' + (b.manifest.sampling || {}).source);
  // `source` must show the fine seam was reached at all — but "mixed" is a LEGITIMATE answer
  // and asserting "fine" was wrong. It latches on a single tick taken below ~20x, which every
  // real session has, and this check duly passed twice and failed on the third parallel run
  // before the ordering above fixed the cause. THE SPACING IS THE REAL TEST: the broadcast-only
  // fallback gives ~1 row a minute at 600x where the fine seam gives one a second, so a page
  // feeding the recorder two rows an hour fails below whatever `source` happens to say.
  if (b.manifest.sampling.source === 'broadcast') {
    throw new Error('the recorder never reached the fine seam: source=broadcast');
  }
  if (worst > 2) throw new Error('rows are ' + worst.toFixed(1) + ' s apart at 600x — expected ~1 s');
  if (ts.t.length < span / 2) throw new Error('only ' + ts.t.length + ' rows for ' + span.toFixed(0) + ' s of plant');
  return log.join('\n');
}

async function main() {
  fs.mkdirSync(SCRATCH, { recursive: true });
  var fallback = path.join(SCRATCH, 'ui-screenshot-fallback.log');
  if (fs.existsSync(fallback)) fs.unlinkSync(fallback);

  var playwright = require('playwright');
  var srv = await startServer();
  var browser = await playwright.chromium.launch({ headless: true });
  // acceptDownloads: testDiagBundle presses the app's own "Download session diagnostics"
  // button and reads the file, which is the only way to see the recorder through the real
  // wiring — see the comment on that function.
  var page = await browser.newPage({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  var summary = [];

  try {
    for (var i = 0; i < ENGINES.length; i++) {
      for (var j = 0; j < VIEWS.length; j++) {
        var c = await screenshot(page, ENGINES[i], VIEWS[j]);
        var miss = (REQUIRED_ACTS[ENGINES[i] + '-' + VIEWS[j]] || []).length;
        summary.push(ENGINES[i] + '/' + VIEWS[j] + ': gauges=' + c.gauges + ' cg=' + c.ctlGroups + ' pdCtl=' + c.pdCtl +
          (miss ? ' acts=ok(' + miss + ')' : ''));
      }
    }
    var iuLog = await testUnitsAndInstructor(page);
    fs.writeFileSync(path.join(SCRATCH, 'instructor-units.log'), iuLog);
    var sfLog = await testSteamFeedPair(page);
    fs.writeFileSync(path.join(SCRATCH, 'steam-feed-pair.log'), sfLog);
    var csLog = await testChartSettings(page);
    fs.writeFileSync(path.join(SCRATCH, 'chart-settings.log'), csLog);
    var mlLog = await testMonitorList(page);
    fs.writeFileSync(path.join(SCRATCH, 'monitor-list.log'), mlLog);
    var mcLog = await testMissionCloseResumes(page);
    fs.writeFileSync(path.join(SCRATCH, 'mission-close-resumes.log'), mcLog);
    var rsLog = await testRunStartMark(page);
    fs.writeFileSync(path.join(SCRATCH, 'run-start-mark.log'), rsLog);
    var rpLog = await testRewindPicker(page);
    fs.writeFileSync(path.join(SCRATCH, 'rewind-picker.log'), rpLog);
    var ebLog = await testEsfArmButtons(page);
    fs.writeFileSync(path.join(SCRATCH, 'esf-arm-buttons.log'), ebLog);
    var dbLog = await testDiagBundle(page);
    fs.writeFileSync(path.join(SCRATCH, 'diag-bundle.log'), dbLog);
    fs.writeFileSync(path.join(SCRATCH, 'ui-screenshot-summary.log'), summary.join('\n') + '\n');
    console.log('E2E UI verification: PASS (' + (ENGINES.length * VIEWS.length) + ' screenshots)');
  } finally {
    await browser.close();
    srv.close();
  }
}

/* THE GATE ALWAYS RUNS EVERYTHING. There is deliberately NO --only flag: a gate that can be
 * told to skip a test is the shape that let CI run red for 32 consecutive runs (--fast still
 * ran a Playwright gate that was not marked `slow`, and nobody noticed). What IS exported —
 * only when this file is require()d rather than run — is the individual test functions plus
 * the server, so a fault can be INJECTED and one check driven to red in seconds instead of
 * re-running all 16 screenshots. Running the file directly is unaffected. */
if (require.main !== module) {
  module.exports = { startServer: startServer, dismissMission: dismissMission,
                     testChartSettings: testChartSettings, testMonitorList: testMonitorList,
                     testMissionCloseResumes: testMissionCloseResumes, testRunStartMark: testRunStartMark, port: function () { return PORT; } };
} else {
  main().catch(function (e) {
    fs.mkdirSync(SCRATCH, { recursive: true });
    fs.writeFileSync(path.join(SCRATCH, 'ui-screenshot-fallback.log'), String(e.stack || e));
    console.error('E2E UI verification FAILED:', e.message);
    process.exit(1);
  });
}