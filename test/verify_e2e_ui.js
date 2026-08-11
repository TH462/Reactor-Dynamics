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
/* The trend graphs open on a REAL 30 minutes, not a flat line *(OWNER, 2026-08-01: "when you
 * make preset starts, run them for 30 minutes to fill up the graph with real data before
 * saving")*.
 *
 * A preset start seeds the chart's 30-minute record window instantly with flat samples and
 * then swaps in a genuinely-run trace, computed in setTimeout slices off the main thread and
 * cached per plant+design-version+initial-state (ui/app.js `ensurePreseed`). Flat-first is
 * deliberate — the real run costs ~1.9 s, and paying that synchronously would freeze boot,
 * every reset, every plant switch and every mission start.
 *
 * THE CHECK IS THE SPREAD, and it discriminates hard. Measured by A/B on the real page,
 * neutering only the `ensurePreseed` call: with the swap the busiest plotted series has
 * **28 distinct y-values** across its 61 points; without it, **exactly 1** — a perfectly
 * horizontal line, which is the defect this was raised about. Anything > 1 means the swap
 * landed, so the band is wide but the negative control is unambiguous.
 *
 * Note what this canNOT be: an assertion about interesting SHAPE. The initial conditions are
 * constructed as true steady states, so 30 real minutes is a noisy flat line — the gain is
 * instrument texture and the genuine slow drifts (xenon, boron), not a different curve. */
async function testTrendPreseed(page) {
  var log = [];
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr',
    { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  // The run is sliced; give it room on a loaded CI box. It is ~1.9 s of work.
  await page.waitForTimeout(12000);
  var st = await page.evaluate(function () {
    var svg = document.getElementById('chartCanvas');
    if (!svg) return { found: false };
    var best = 0, pts = 0;
    Array.prototype.forEach.call(svg.querySelectorAll('polyline'), function (el) {
      var raw = (el.getAttribute('points') || '').trim();
      if (!raw) return;
      var ys = raw.split(/\s+/).map(function (p) { return parseFloat(p.split(',')[1]); })
                  .filter(function (y) { return isFinite(y); });
      var seen = {}, n = 0;
      ys.forEach(function (y) { var k = y.toFixed(3); if (!seen[k]) { seen[k] = 1; n++; } });
      if (n > best) { best = n; pts = ys.length; }
    });
    return { found: true, distinct: best, points: pts,
             series: svg.querySelectorAll('polyline').length };
  });
  if (!st.found) throw new Error('trend chart (#chartCanvas) did not render');
  if (!st.series) throw new Error('trend chart rendered no series');
  if (st.distinct <= 1) {
    throw new Error('the trend graph opened FLAT — ' + st.distinct + ' distinct y-value(s) across ' +
      st.points + ' points. The 30-minute preseed did not swap in real data (ui/app.js ensurePreseed).');
  }
  log.push('trend preseed: ' + st.series + ' series, busiest has ' + st.distinct +
           ' distinct y over ' + st.points + ' points (flat seed scores 1)');
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
    var rpLog = await testRewindPicker(page);
    fs.writeFileSync(path.join(SCRATCH, 'rewind-picker.log'), rpLog);
    var tpLog = await testTrendPreseed(page);
    fs.writeFileSync(path.join(SCRATCH, 'trend-preseed.log'), tpLog);
    var dbLog = await testDiagBundle(page);
    fs.writeFileSync(path.join(SCRATCH, 'diag-bundle.log'), dbLog);
    fs.writeFileSync(path.join(SCRATCH, 'ui-screenshot-summary.log'), summary.join('\n') + '\n');
    console.log('E2E UI verification: PASS (' + (ENGINES.length * VIEWS.length) + ' screenshots)');
  } finally {
    await browser.close();
    srv.close();
  }
}

main().catch(function (e) {
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, 'ui-screenshot-fallback.log'), String(e.stack || e));
  console.error('E2E UI verification FAILED:', e.message);
  process.exit(1);
});