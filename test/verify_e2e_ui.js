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

/* PWR ONLY since #514 (owner-ruled): the shell no longer loads the RBMK/BWR scripts, and
 * app.js falls back to the PWR when an override names an absent engine — so an rbmk/bwr row
 * here would silently screenshot the PWR and certify nothing. The rows and their control
 * maps were deleted WITH the script tags; restoring the plants to the shell means restoring
 * both (git log this file). */
var ENGINES = ['pwr2'];   /* the plant the site runs since 2026-08-26 — see the note at REQUIRED_BOARD_LABELS */
var VIEWS = ['diagram', 'primary', 'secondary', 'all'];

/* THE PLANT & MISSION WINDOW OPENS ON EVERY LOAD since 2026-08-11 *(OWNER DIRECTIVE: "It
 * should always the the first thing someone sees when loading the sim.")*, so every gate
 * navigation has to dismiss it exactly as a player does.
 *
 * It is deliberately NOT exempted by a URL parameter. A bypass list is what hid the window
 * from every real visitor: it contained `engine=`, and the site links `?engine=pwr2` (`?engine=pwr` until 2026-08-26) from
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

/* Wait until the board is PAINTED and the sim has ticked — the condition most of this
 * file's fixed sleeps were approximating with wall time (#513: 44.45 s of waitForTimeout
 * against a 54 s runner). The predicate is the header clock leaving T+00:00:00, i.e. at
 * least one broadcast has landed and rendered (the overlay close auto-starts the plant —
 * owner ruling 2026-08-11). Ceiling ~3x the sleeps it replaces; every assertion still runs
 * AFTER the wait, so a conversion can only delay a red, never create a green. */
async function waitBoardLive(page, timeoutMs) {
  await page.waitForFunction(function () {
    var c = document.getElementById('clock');
    return !!c && /^T\+\d/.test(c.textContent || '') && c.textContent !== 'T+00:00:00';
  }, { timeout: timeoutMs || 7500, polling: 100 });
}

/* Recently-added controls that must render on the shipped UI (data-act wiring).
 * PWR has NO entries here on purpose: data-act buttons are emitted only by
 * populateControlBar() into #pdCtlRow (ui/app.js:374,379,384), and the PWR returns
 * before that path to mount the learning board instead (ui/app.js:3413, :3459-3460).
 * The PWR board is covered by REQUIRED_BOARD_LABELS below. */
var REQUIRED_ACTS = {
  /* rbmk/bwr rows removed with their shell script tags (#514) — see ENGINES above */
};

/* Board-rendered plants (PWR) expose controls through the label vocabulary rather
 * than data-act, so probe the same path Instructor highlights use:
 * RD.PwrBoard.revealControl(label) -> the tile to glow, or null if unreachable.
 * The board is one stage with no view bar, so every view must render all of these. */
/* KEYED BY ENGINE, AND BOTH PWR ENGINES WEAR THE SAME BOARD. That is not an accident of
 * naming: ui/app.js gives ENGINES.pwr2 `plant: 'pwr'`, so the profile tables, the synoptic
 * and this vocabulary are shared, and only the physics behind them differs. Listing them
 * separately rather than aliasing one to the other is deliberate — the day a control exists
 * on one engine and not the other, this table has somewhere to say so, and the reachability
 * sweep is exactly where that difference should surface. Today they are identical.
 *
 * ENGINES above drives which of these is actually swept, and it is pwr2: a screenshot of a
 * plant no published build contains is a screenshot of nothing anyone sees. */
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
REQUIRED_BOARD_LABELS.pwr2 = REQUIRED_BOARD_LABELS.pwr.slice();

var REQUIRED_LABELS = {
  /* rbmk/bwr rows removed with their shell script tags (#514) — see ENGINES above */
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
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&view=primary', { waitUntil: 'networkidle', timeout: 90000 });
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

  /* STAYS ON THE RETIRED ENGINE, deliberately. Walkthroughs are authored against it and
     ENGINES.pwr2 carries `freePlayOnly: true`, so ?engine=pwr2&follow=... would land on the
     Free-Play-only note and this half would assert against a panel instead of a procedure.
     It moves when the scenario-compatibility pass lifts that flag, not before. The engine
     still loads in the repo's ui/shell.html — only PUBLISHED builds drop it. */
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
    await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&init=hot_full_power&run=1' + qs,
      { waitUntil: 'networkidle', timeout: 90000 });
    await dismissMission(page);
    await waitBoardLive(page);                       /* was waitForTimeout(1200) — #513 */
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
      return { steam: t('ims3wm0d0bu'), feed: t('imrsgkz4lq0'), gov: t('imrppej8ulo'), dump: t('imsgunuyvon'), adv: t('imsguptyg16'),
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
  /* THE DECAY HEAT MUST BE GOING SOMEWHERE, and on this plant it is not the condenser dumps.
   * This read `num(tripped.dump) > 1` until 2026-08-26, when the gate moved to the engine the
   * site ships. MEASURED on both, t+600 s after a turbine trip from hot full power:
   *
   *     retired engine   gov 0 %   dump  2 %   adv  0 %   steam 22 gpm  feed 22 gpm
   *     PWR2             gov 0 %   dump  0 %   adv 61 %   steam 31 gpm  feed 33 gpm
   *
   * PWR2's dump reading 0 is the plant being RIGHT, not a regression: C-7 holds the condenser
   * dumps shut on a dispatch trip (sourced — PWR2_VALIDATION.md 47), so the atmospheric dump
   * carries it, which is the real-plant answer and the reason the ADV rung was built (#371).
   * Pinning the CONDENSER path would have made this gate demand the interlock be defeated.
   *
   * The claim is unchanged and so is the discriminant (HR10): with the governor at 0 %, a
   * steam path is open and carrying heat. It still fails on the defect this check exists for —
   * a readout wired to the governor-only `steam_flow` channel leaves both positions at 0 and
   * STEAM FLOW at ~0 — and it still passes on the retired engine, where the dump carries it. */
  if (!(num(tripped.dump) > 1 || num(tripped.adv) > 1)) {
    throw new Error('nothing is carrying decay heat with the turbine shut (dump=' +
      tripped.dump + ' adv=' + tripped.adv + ')');
  }
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
/* THE REFUSAL HAS TO REACH A FRAME (#558) — and this is the only place that can say so.
 * `run_pwr2_board` copies the try/catch into a Node harness that never renders a Scanner, and
 * this file counted disabled buttons without ever pressing one and reading the message back. So
 * the mechanism that turns every refusal in the sim into a dead button — the class the owner has
 * found by hand three times (#503, #506, #509) — had no gate at all, and #505 was CLOSED on a fix
 * that is true of `cmd()` and false of the board, which is the only control surface PWR2 has.
 *
 * THE DEFECT: `inspectFlash` writes the reason into `inspectCur`, then the BODY-LEVEL
 * click-to-inspect listener runs later in the SAME dispatch, resolves the button under the
 * pointer and overwrites it. Written and destroyed synchronously — measured at 0 of 426 frames
 * across four refused presses.
 *
 * SAMPLE ACROSS FRAMES, never once: a single read after the click cannot tell "painted then
 * replaced" from "never painted", and the whole defect lives in that difference. The press must
 * go to the <button> INSIDE the tile (pwr_board.js:374) — clicking the tile wrapper only bubbles
 * to the body inspector and sends no command, which reads as a pass. */
async function testRefusalReachesTheScanner(page) {
  var log = [];
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2',
    { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page);
  /* RHR ALIGN is the honest fixture: at power its refusal is the SOURCED suction-valve
   * permissive, i.e. a message the player is meant to LEARN from, and #558 measured it at
   * 0 frames. It is a refusal the plant will always raise at power, so the check cannot
   * silently stop exercising anything. */
  var r = await page.evaluate(async function () {
    var tile = document.querySelector('[data-item="ims3wg27iif"]');
    if (!tile) return { missing: true };
    var btn = tile.matches('button') ? tile : tile.querySelector('button');
    if (!btn || btn.disabled) return { unusable: true };
    function scan() {
      var p = document.querySelector('#scannerPanel');
      return p ? p.innerText.replace(/\s+/g, ' ').trim() : '';
    }
    btn.click();
    var frames = 0, hit = 0;
    await new Promise(function (res) {
      var t0 = performance.now();
      (function tick() {
        frames++;
        if (/Command error|Blocked/i.test(scan())) hit++;
        if (performance.now() - t0 < 1200) requestAnimationFrame(tick); else res();
      })();
    });
    return { frames: frames, hit: hit, text: scan().slice(0, 140) };
  });
  if (r.missing || r.unusable) {
    console.error('FAIL: the RHR ALIGN fixture is gone from the board — re-point this check');
    process.exitCode = 1;
    return 'refusal-scanner: FIXTURE MISSING' + String.fromCharCode(10);
  }
  log.push('frames ' + r.hit + '/' + r.frames + '  text: ' + r.text);
  if (!(r.frames > 10 && r.hit === r.frames)) {
    console.error('FAIL: a refused board press must put its reason on the Scanner and LEAVE it ' +
      'there — ' + r.hit + ' of ' + r.frames + ' frames carried it (#558). Text: ' + r.text);
    process.exitCode = 1;
  } else {
    console.log('  refusal reaches the Scanner and persists: ' + r.hit + '/' + r.frames + ' frames');
  }
  /* THE OTHER HALF: a later HOVER over something HINTED still clears it. The fix must not turn
   * the flash into a message that sticks for ever — the block's own documented behaviour is
   * that the next hover replaces it, and a guard scoped to time rather than to the dispatch
   * would break that.
   *
   * IT MUST BE A HINTED ELEMENT. A first draft moved the pointer to (12,12) and reddened: that
   * is bare page, `inspectResolve` returns null, and `inspectAt` returns early BY DESIGN —
   * "pointing at nothing keeps the last description on screen rather than blanking the block".
   * The check was asserting against the panel's own persistence rule, not against the guard. */
  /* RE-POINTED at #591 item 2: this hovered AFW START (`imrmsslj42u`), and that button was
   * REMOVED from the board by owner ruling. The check then reddened for a reason that had
   * nothing to do with its claim — `querySelector` returned null, no mouseover was ever
   * dispatched, and the refusal stayed on the Scanner because nothing asked it to move. It
   * hovers AFW STOP now (same card, still hinted). AND IT SAYS SO WHEN THE FIXTURE GOES: the
   * silent `if (other)` was the hollow half — a check that cannot tell "the guard broke" from
   * "my fixture left the board" is the class the RHR fixture guard above already covers. */
  var after = await page.evaluate(function () {
    var other = document.querySelector('[data-item="imrmssoa137"]');   /* AFW STOP, hinted */
    if (!other) return { missing: true };
    other.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    var p = document.querySelector('#scannerPanel');
    return { text: p ? p.innerText.replace(/\s+/g, ' ').trim() : '' };
  });
  if (after.missing) {
    console.error('FAIL: the hover fixture (AFW STOP) is gone from the board — re-point this check');
    process.exitCode = 1;
    after = { text: '' };
  }
  log.push('after hover: ' + after.text.slice(0, 100));
  if (/Command error/i.test(after.text)) {
    console.error('FAIL: the refusal outlived a hover — the dispatch guard has become a timer (#558)');
    process.exitCode = 1;
  }
  return log.join(String.fromCharCode(10)) + String.fromCharCode(10);
}

/* THE TRIP BLOCKS POPOVER MUST NEVER REACH THE BOARD (#670 operator pass, S-1).
 *
 * The popover is shrink-to-fit and one of its captions is 90 characters: a blocked trip whose
 * setpoint is crossed prints "RELEASING THIS WILL TRIP THE REACTOR NOW - the setpoint is
 * crossed. Press again to confirm." (pwr_board_wiring.js `tripBlockRows`). MEASURED at
 * 1600x1000 before the fix: the panel went 393.9 -> 519.0 rendered px on that one caption and
 * covered the PORV block valve's hit circle, so `document.elementFromPoint` at the valve centre
 * returned the panel's row and the click was SWALLOWED - while the System Scanner still hovered
 * the valve THROUGH the overlay, so the board said "this is the thing you want" and the press
 * did nothing. The RELEASE? button landed x 488-555 against the valve's x 466.7-506.9, i.e.
 * OVER it: a player hunting for the valve was one slip from a press that trips the reactor.
 *
 * THE CHECK ASSERTS THE EFFECT, NOT THE DECLARATION. A static "`.bd-pop` has a max-width" test
 * pins a CSS write and would pass on any number, including one that puts the panel back on the
 * board (CLAUDE.md's standing trap: assert the effect, never the write). This opens the real
 * popover, applies exactly the two DOM writes `refreshTripBlocks` makes on an armed row, and
 * hit-tests the valve. INJECTION-VERIFIED: with `max-width` removed from `.bd-pop` it reports
 * the panel at 519.0 px and elementFromPoint returning `bd-pop-row`, and fails.
 *
 * The step-6 -> step-14 gap in the TMI-2 walkthrough is what found it, but the defect is free
 * play's too - nothing about it needs a walkthrough. */
async function testTripBlockPopoverStaysOffTheBoard(page) {
  var log = [];
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2',
    { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page);
  var r = await page.evaluate(function () {
    var btn = null, w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) {
      if ((n.nodeValue || '').trim() === 'TRIP BLOCKS' && n.parentElement.matches('button')) {
        btn = n.parentElement; break;
      }
    }
    if (!btn) return { missing: 'the TRIP BLOCKS button' };
    btn.click();
    var pop = document.querySelector('.bd-pop');
    if (!pop) return { missing: 'the popover it opens' };
    var row = pop.querySelector('button[data-trip="si_trip"]');
    if (!row) return { missing: 'the SI REACTOR TRIP row' };
    var vlvs = [].slice.call(document.querySelectorAll('circle.vlv-hit')).map(function (c) {
      return c.getBoundingClientRect();
    }).filter(function (b) { return b.x > 400 && b.x < 600 && b.y < 300; });
    if (!vlvs.length) return { missing: 'the PORV block valve hit circle' };
    var v = vlvs[0];
    function probe() {
      var b = pop.getBoundingClientRect(), rb = row.getBoundingClientRect();
      var el = document.elementFromPoint(Math.round(v.x + v.width / 2), Math.round(v.y + v.height / 2));
      return { w: +b.width.toFixed(1), right: +b.right.toFixed(1),
               overlaps: b.right > v.x && b.x < v.right && b.bottom > v.y && b.y < v.bottom,
               btnOverValve: rb.right > v.x && rb.x < v.right && rb.bottom > v.y && rb.y < v.bottom,
               hitIsValve: !!(el && el.classList && el.classList.contains('vlv-hit')),
               hitTag: el ? (el.tagName + '.' + String(el.getAttribute('class') || '')) : 'null' };
    }
    var before = probe();
    // exactly what refreshTripBlocks writes when `will_trip` is true
    row.textContent = 'RELEASE?';
    row.className = 'bd-blocked bd-willtrip';
    var sub = row.previousSibling && row.previousSibling.querySelector
            ? row.previousSibling.querySelector('.sub') : null;
    if (!sub) return { missing: 'the row caption element' };
    sub.textContent = 'RELEASING THIS WILL TRIP THE REACTOR NOW — the setpoint is crossed. Press again to confirm.';
    return { valve: { x: +v.x.toFixed(1), right: +v.right.toFixed(1) }, before: before, after: probe() };
  });
  if (r.missing) {
    console.error('FAIL: the trip-block overlay fixture is gone (' + r.missing + ') — re-point this check');
    process.exitCode = 1;
    return 'trip-block-overlay: FIXTURE MISSING — ' + r.missing + String.fromCharCode(10);
  }
  log.push('valve hit circle x ' + r.valve.x + '–' + r.valve.right);
  log.push('normal captions: panel ' + r.before.w + ' px, right ' + r.before.right +
           ', hit ' + r.before.hitTag);
  log.push('armed caption:   panel ' + r.after.w + ' px, right ' + r.after.right +
           ', hit ' + r.after.hitTag);
  if (!r.before.hitIsValve) {
    console.error('FAIL: the PORV block valve is not clickable with the trip-block panel open ' +
      'and NO row armed — hit ' + r.before.hitTag + ' (#670 S-1)');
    process.exitCode = 1;
  }
  if (!r.after.hitIsValve || r.after.overlaps || r.after.btnOverValve) {
    console.error('FAIL: the trip-block popover grew onto the board when a row armed for ' +
      'release — panel ' + r.before.w + ' → ' + r.after.w + ' px, right edge ' + r.after.right +
      ' against the valve at ' + r.valve.x + '; elementFromPoint at the valve returns ' +
      r.after.hitTag + '. The click is swallowed while the Scanner still names the valve ' +
      'through the overlay (#670 S-1). Cap `.bd-pop` max-width — do not raise it.');
    process.exitCode = 1;
  } else {
    console.log('  trip-block popover stays off the board when armed: ' + r.before.w + ' → ' +
      r.after.w + ' px, valve still hit-tests (#670 S-1)');
  }
  return log.join(String.fromCharCode(10)) + String.fromCharCode(10);
}

/* THE TRIP BLOCKS POPOVER MUST GO AWAY ON A PRESS OUTSIDE IT (#690; owner playtest #675
 * section A, verbatim: "Trip block popup should disappear when clicking anywhere outside that
 * popup.").
 *
 * EVERY PRESS HERE IS A REAL POINTER PRESS (`page.mouse.click`), never `element.click()`.
 * That is not tidiness — it is the only way this check can see the mechanism at all: the
 * dismissal rides `pointerdown`, and `HTMLElement.click()` dispatches a bare `click` with no
 * pointer event in front of it, so a .click()-driven version of this check would pass on a
 * board that had no listener whatsoever.
 *
 * FIVE PRESSES, and the middle three are the ones that catch the two ways this can be built
 * wrong. A listener scoped too broadly (or without the `pop.contains` guard) eats press 2 and
 * the panel cannot be used at all; one that forgets the TRIP BLOCKS button is exempt closes on
 * press 3's pointerdown and then the button's own 'click' RE-OPENS it, so the panel becomes
 * un-closable from the very control an operator would reach for. Press 4 is the mirror: a
 * dismissal that swallows the button press leaves a panel that can never be opened a second
 * time. Only press 5 is the feature the owner asked for, and it is the easy one.
 *
 * The outside point is found by hit-test, not authored: the check walks the stage on a 17 px
 * grid and takes the first point where `elementFromPoint` returns the STAGE ITSELF, so the
 * press cannot land on a plant control and issue a command as a side effect.
 *
 * INJECTION-VERIFIED — see the note in run_all.js's BASELINES entry. */
async function testTripBlockPopoverDismissesOnOutsideClick(page) {
  var log = [];
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2',
    { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page);

  var btnPt = await page.evaluate(function () {
    var btn = null, w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) {
      if ((n.nodeValue || '').trim() === 'TRIP BLOCKS' && n.parentElement.matches('button')) {
        btn = n.parentElement; break;
      }
    }
    if (!btn) return { missing: 'the TRIP BLOCKS button' };
    var b = btn.getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  });
  if (btnPt.missing) {
    console.error('FAIL: the trip-block dismissal fixture is gone (' + btnPt.missing +
      ') — re-point this check');
    process.exitCode = 1;
    return 'trip-block-dismiss: FIXTURE MISSING — ' + btnPt.missing + String.fromCharCode(10);
  }
  var isOpen = function () {
    return page.evaluate(function () { return !!document.querySelector('.bd-pop'); });
  };

  // press 1 — open it
  await page.mouse.click(btnPt.x, btnPt.y);
  var openedAtAll = await isOpen();
  if (!openedAtAll) {
    console.error('FAIL: the trip-block dismissal fixture is gone (the popover did not open on ' +
      'a real pointer press) — re-point this check');
    process.exitCode = 1;
    return 'trip-block-dismiss: FIXTURE MISSING — popover would not open' + String.fromCharCode(10);
  }

  var pts = await page.evaluate(function () {
    var pop = document.querySelector('.bd-pop');
    var stage = document.querySelector('.pwr-board-stage');
    if (!pop || !stage) return { missing: pop ? 'the board stage' : 'the popover' };
    var head = pop.querySelector('h4') || pop;
    var hb = head.getBoundingClientRect();
    var sb = stage.getBoundingClientRect(), pb = pop.getBoundingClientRect();
    var out = null;
    for (var y = sb.top + 8; y < sb.bottom - 8 && !out; y += 17) {
      for (var x = sb.left + 8; x < sb.right - 8; x += 17) {
        if (x > pb.left - 6 && x < pb.right + 6 && y > pb.top - 6 && y < pb.bottom + 6) continue;
        if (document.elementFromPoint(x, y) !== stage) continue;   // bare board, no control under it
        out = { x: Math.round(x), y: Math.round(y) };
        break;
      }
    }
    if (!out) return { missing: 'a bare point on the board stage outside the popover' };
    return { inside: { x: Math.round(hb.x + hb.width / 2), y: Math.round(hb.y + hb.height / 2) },
             outside: out,
             pop: { x: +pb.x.toFixed(1), right: +pb.right.toFixed(1),
                    y: +pb.y.toFixed(1), bottom: +pb.bottom.toFixed(1) } };
  });
  if (pts.missing) {
    console.error('FAIL: the trip-block dismissal fixture is gone (' + pts.missing +
      ') — re-point this check');
    process.exitCode = 1;
    return 'trip-block-dismiss: FIXTURE MISSING — ' + pts.missing + String.fromCharCode(10);
  }
  log.push('popover x ' + pts.pop.x + '–' + pts.pop.right + ', y ' + pts.pop.y + '–' + pts.pop.bottom);
  log.push('press points: button ' + btnPt.x + ',' + btnPt.y + ' · inside ' + pts.inside.x + ',' +
           pts.inside.y + ' · outside (bare stage) ' + pts.outside.x + ',' + pts.outside.y);

  // press 2 — INSIDE the panel: it must stay up, or the panel cannot be used
  await page.mouse.click(pts.inside.x, pts.inside.y);
  var afterInside = await isOpen();
  // press 3 — the TRIP BLOCKS button while it is up: the button's own toggle must still shut it
  await page.mouse.click(btnPt.x, btnPt.y);
  var afterButtonWhileOpen = await isOpen();
  // press 4 — the button again: it must re-open (the dismissal must not swallow the press)
  await page.mouse.click(btnPt.x, btnPt.y);
  var afterReopen = await isOpen();
  // press 5 — OUTSIDE it, on bare board: the feature
  await page.mouse.click(pts.outside.x, pts.outside.y);
  var afterOutside = await isOpen();
  await page.evaluate(function () {   // hand the board back the way we found it
    var pop = document.querySelector('.bd-pop');
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
  });

  log.push('open ' + openedAtAll + ' → press inside ' + afterInside + ' → press button ' +
           afterButtonWhileOpen + ' → press button ' + afterReopen + ' → press outside ' + afterOutside);
  var bad = [];
  if (!afterInside) bad.push('a press INSIDE the popover (on its own TRIP BLOCKS heading) closed it — ' +
    'the listener is missing its `pop.contains(e.target)` guard, so the panel cannot be used at all');
  if (afterButtonWhileOpen) bad.push('a press on the TRIP BLOCKS button while the popover was up ' +
    'left it OPEN — the dismissal closed it on pointerdown and the button’s own click re-opened it, ' +
    'so the panel is un-closable from the control that opens it');
  if (!afterReopen) bad.push('the popover would not re-open on a press of the TRIP BLOCKS button — ' +
    'the dismissal is swallowing the opening press');
  if (afterOutside) bad.push('a press OUTSIDE the popover, on bare board at ' + pts.outside.x + ',' +
    pts.outside.y + ', left it open — that is the #690 defect itself');
  if (bad.length) {
    console.error('FAIL: trip-block popover outside-click dismissal (#690): ' + bad.join('; '));
    process.exitCode = 1;
  } else {
    console.log('  trip-block popover dismisses on an outside press and still toggles from its ' +
      'own button (#690)');
  }
  return log.join(String.fromCharCode(10)) + String.fromCharCode(10);
}

async function testEsfArmButtons(page) {
  var log = [];
  /* pwr disables NOTHING; pwr2 disables the DELIBERATE set: the HPI AUTO re-arm (#503),
   * ROD AUTO (#506 honest-absent) and the SR DET toggle (#567). The boron panel and RHR came
   * back with #507 waves 1-2 (a real kernel channel and a real align command). Count pins both
   * directions (cannot silently disable everything or nothing); membership pins identity.
   *
   * THE SET CHANGED WITH #567 AND WAS RE-DERIVED, NOT BUMPED. Grid FOLLOW LEFT it — that tile
   * is the turbine LATCH now (#551/#559), an enabled control with a real command behind it —
   * and SR DET JOINED it, because the plant publishes `sr_detector_fixed` and the board reads
   * it. Net 3 either way, which is exactly why a count alone would have missed the swap;
   * `mustInclude` is what pins identity, and it is the half that moved.
   *
   * AND AGAIN WITH #570: STEAM DUMP **OPEN** joined. It was a live button that could ONLY
   * throw — the dump is controller-driven and has no manual full-open lever — and its refusal
   * is raised INSIDE the MAPPED `set_steam_dump` handler, so neither the #567 registry sweep
   * nor run_pwr2_kernel band 4 could see it. AUTO and CLOSED beside it stay live, which is why
   * the label here is OPEN and not the whole dump panel.
   *
   * 4 -> 2 WITH #598 items 7 and 9/10, AND THE DIRECTION IS THE POINT. SR DET and ROD AUTO both
   * LEFT this set by being DELETED FROM THE BOARD, not by being made to work. A control that can
   * never be pressed is a DESIGN_CRITERIA Q4 orphan whether it is grey or not — the owner had to
   * ask what each of them was for, which is that test failing — and drawing it dark was only
   * ever the second-best answer to "the plant has no lever here". The two that remain are
   * different in kind: the HPI AUTO re-arm and STEAM DUMP OPEN are controls whose refusal is
   * CONDITIONAL or whose neighbours are live, so the button has to stay and read dark.
   *
   * ⚠ IF THIS COUNT DROPS AGAIN, ASK WHICH WAY. A disabled button becoming ENABLED is a fix; a
   * disabled button DISAPPEARING is a board change and wants the owner's eye. Both look like
   * "expected N, found N-1" from here, which is what `mustInclude` is for. */
  var expect = { pwr: 0, pwr2: 2 };
  var mustInclude = ['AUTO', 'OPEN'];
  for (var i = 0; i < 2; i++) {
    var eng = ['pwr', 'pwr2'][i];
    await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=' + eng,
      { waitUntil: 'networkidle', timeout: 90000 });
    await dismissMission(page);
    await waitBoardLive(page);                       /* was waitForTimeout(2500) — #513 */
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
    if (eng === 'pwr2') {
      var missing = mustInclude.filter(function (m) { return st.disabled.indexOf(m) === -1; });
      if (missing.length) {
        throw new Error('pwr2: deliberate disables missing [' + missing.join(',') +
          '] from [' + st.disabled.join(',') + ']');
      }
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
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2',
    { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page);                         /* was waitForTimeout(1500) — #513 */

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
  var URL = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2';
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

/* THE MISSION DOOR IS "MAIN MENU", BESIDE SETTINGS (#689, owner playtest #675 section A,
 * 2026-09-09: "Add a Main Menu button to the right of settings. Change the SELECT PLANT,
 * MISSION & RESET menu to this button and get rid of the old button.")
 *
 * FOUR CLAIMS, and the last two are the ones nothing else in the tree can see.
 *
 *  1. The button exists, reads "Main Menu", and sits in .sim-tools IMMEDIATELY AFTER Settings.
 *     "To the right of settings" is a position, not "somewhere in the row" — and ⛶ (board
 *     focus) was already the row's last child, so "append it" and "put it where he asked" are
 *     different answers. The check reads DOM order inside .sim-tools.
 *  2. The old full-width .sim-status bar is gone — the id, the class and #simStatusText.
 *  3. IT ACTUALLY OPENS THE WINDOW, and the window's own ✕ still closes it. A renamed id with
 *     the listener left on the old one is a button that looks right and does nothing.
 *  4. NOTHING POINTS AT A NODE THAT NO LONGER EXISTS. Two consumers named #simStatus by
 *     string: the COACH map (`session`) and the quick tour's step list. BOTH FAIL SILENTLY —
 *     applyCoachMarks() does `if (el)` and skips, and a tour step with a dead selector just
 *     highlights empty space. So the tour is DRIVEN to the Main Menu step and its highlight
 *     rect is measured on the button, and the coach dot is forced on by clearing its
 *     localStorage key and read off the rendered ::after. A source scan cannot do either. */
async function testMainMenuButton(page) {
  var log = [];
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2',
    { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForSelector('#mainMenuBtn', { timeout: 8000 }).catch(function () {
    throw new Error('#689: there is no #mainMenuBtn on the page — the owner asked for a Main ' +
      'Menu button to the right of Settings and nothing answers to that id');
  });

  var row = await page.evaluate(function () {
    var b = document.getElementById('mainMenuBtn');
    var tools = document.querySelector('.sim-tools');
    var kids = tools ? Array.prototype.slice.call(tools.children) : [];
    var r = b.getBoundingClientRect(), sr = null;
    var st = document.getElementById('settingsBtn');
    if (st) sr = st.getBoundingClientRect();
    return {
      order: kids.map(function (k) { return k.id || k.tagName.toLowerCase(); }),
      inTools: !!(tools && tools.contains(b)),
      text: (b.textContent || '').trim(),
      w: Math.round(r.width), h: Math.round(r.height),
      leftOfMe: sr ? Math.round(r.left - sr.right) : null,
      sameRow: sr ? Math.abs(r.top - sr.top) < 4 : false,
      oldBar: !!document.getElementById('simStatus'),
      oldBarClass: document.querySelectorAll('.sim-status').length,
      oldReadout: !!document.getElementById('simStatusText')
    };
  });
  if (!row.inTools) throw new Error('#689: #mainMenuBtn is not inside .sim-tools — order was ' + row.order.join(' , '));
  if (row.text !== 'Main Menu') throw new Error('#689: the button reads "' + row.text + '", not "Main Menu"');
  if (row.w < 20 || row.h < 10) throw new Error('#689: #mainMenuBtn paints ' + row.w + 'x' + row.h + ' px');
  var iS = row.order.indexOf('settingsBtn'), iM = row.order.indexOf('mainMenuBtn');
  if (iS < 0 || iM !== iS + 1) {
    throw new Error('#689: Main Menu is not immediately to the RIGHT of Settings — .sim-tools ' +
      'order is [' + row.order.join(', ') + ']. Appending it to the row puts the ⛶ board-focus ' +
      'toggle between the two, which is not where the owner asked for it.');
  }
  if (!row.sameRow || !(row.leftOfMe >= 0 && row.leftOfMe < 40)) {
    throw new Error('#689: Main Menu is in DOM order but not painted beside Settings — same row: ' +
      row.sameRow + ', gap: ' + row.leftOfMe + ' px');
  }
  /* THE WHOLE ROW MUST BE ONE LINE, not just Main Menu's half of it (quality pass, 2026-09-11).
   * #689 tightened .sim-tools to fit six controls in 338 px with 19 px of headroom and its comment
   * promises that "a seventh named tool wraps it again, and verify_e2e_ui's testMainMenuButton reds
   * on the PAINTED row and gap rather than letting it go quiet."
   *
   * IT DID NOT. PROVED by injection: adding a seventh `.btn.text-btn` to the row took .sim-tools
   * from 27 px to 55 px on TWO lines — [manual, help, feedback, settings, mainMenu] at y 45 and
   * [the new tool, demoBtn] at y 75 — and this check stayed GREEN. `flex-wrap` pushes the OVERFLOW
   * to the end, and Main Menu is fifth of six, so the two assertions above (same row as Settings,
   * 4 px gap) are both still satisfied while the ⛶ board-focus toggle silently drops below the row
   * it is supposed to end. The measurement nobody had taken is the one the comment described.
   *
   * The row's painted height against its tallest child is the claim, and it reds for whichever
   * control wraps. Measured one-line: 27 px row, 27 px tallest child. */
  var wrap = await page.evaluate(function () {
    var t = document.querySelector('.sim-tools');
    var kids = Array.prototype.slice.call(t.children);
    var tallest = 0, lines = {};
    kids.forEach(function (k) {
      var r = k.getBoundingClientRect();
      if (r.height > tallest) tallest = r.height;
      var band = Math.round(r.top / 5) * 5;
      (lines[band] = lines[band] || []).push(k.id || k.tagName.toLowerCase());
    });
    return { rowH: Math.round(t.getBoundingClientRect().height), tallest: Math.round(tallest),
             nLines: Object.keys(lines).length, lines: lines };
  });
  if (wrap.rowH > wrap.tallest + 6) {
    throw new Error('#689: the .sim-tools row has WRAPPED — it paints ' + wrap.rowH + ' px against a ' +
      'tallest control of ' + wrap.tallest + ' px, on ' + wrap.nLines + ' lines: ' +
      JSON.stringify(wrap.lines) + '. Six controls fit 338 px with 19 px of headroom; a seventh ' +
      'named tool does not, and the control that drops is whichever is last in the row rather than ' +
      'the one you added. Either shorten the row or retune .sim-tools deliberately.');
  }
  log.push('.sim-tools is one line: ' + wrap.rowH + ' px row, ' + wrap.tallest + ' px tallest control');
  if (row.oldBar || row.oldBarClass || row.oldReadout) {
    throw new Error('#689: the old SELECT PLANT, MISSION & RESET bar is still there — #simStatus ' +
      row.oldBar + ', .sim-status x' + row.oldBarClass + ', #simStatusText ' + row.oldReadout +
      '. "Get rid of the old button" is half the item.');
  }
  log.push('.sim-tools order: ' + row.order.join(' , '));
  log.push('Main Menu ' + row.w + 'x' + row.h + ' px, ' + row.leftOfMe + ' px right of Settings; ' +
           'no #simStatus, no .sim-status, no #simStatusText');

  // 3 — it opens the window, and ✕ still closes it.
  /* THE FIRST CLOSE IS ALSO THE ONE THAT FIRES THE COACH TIP, so the ▲ is measured here and
   * nowhere else: `missionTipArmed` is set once by boot and spent by this press, which is the
   * player's own route (#689 moved the bubble up under .sim-tools for exactly this reason).
   *
   * THE AIM IS THE ASSERTION, not the presence. #689 moved the bubble to the right ROW and left
   * it centre-aligned, which put its ▲ 128 px to the LEFT of the button it names — over the
   * middle of the speed bar — because the bubble spans the whole panel row while Main Menu sits
   * at the right end of it. A presence check passes on that; so does a class check. The arrow's
   * painted centre has to land inside the button's painted box, and the glyph's rect is taken
   * with a Range over the text node rather than from the span's layout box, because an absolutely
   * positioned inline span can report a box while painting off-target. */
  await dismissMission(page);
  await page.waitForTimeout(250);
  var aim = await page.evaluate(function () {
    var t = document.getElementById('mainMenuTip'), b = document.getElementById('mainMenuBtn');
    if (!t || !b) return { missing: !t ? '#mainMenuTip' : '#mainMenuBtn' };
    var a = t.querySelector('.mm-arrow');
    if (!a || !a.firstChild) return { noArrow: true, hidden: t.hidden, html: t.innerHTML.slice(0, 60) };
    var rg = document.createRange(); rg.setStart(a.firstChild, 0); rg.setEnd(a.firstChild, 1);
    var ar = rg.getBoundingClientRect(), br = b.getBoundingClientRect(), tr = t.getBoundingClientRect();
    return { hidden: t.hidden, glyph: (a.textContent || '').trim(),
             ax: +((ar.left + ar.right) / 2).toFixed(1), ay: +((ar.top + ar.bottom) / 2).toFixed(1),
             bl: +br.left.toFixed(1), br: +br.right.toFixed(1), bb: +br.bottom.toFixed(1),
             tipL: +tr.left.toFixed(1), tipR: +tr.right.toFixed(1), tipTop: +tr.top.toFixed(1) };
  });
  if (aim.missing) throw new Error('#689: the coach tip fixture is gone — no ' + aim.missing);
  if (aim.noArrow) {
    throw new Error('#689: #mainMenuTip carries no .mm-arrow glyph to aim — ' + JSON.stringify(aim) +
      '. The ▲ has to be its own node, or it cannot be positioned independently of the centred text.');
  }
  if (aim.hidden) {
    throw new Error('#689 control: the coach tip did not appear on the first close of the Plant & ' +
      'Mission window, so its aim cannot be measured — missionTipArmed never fired');
  }
  if (!(aim.ax >= aim.bl && aim.ax <= aim.br)) {
    throw new Error('#689: #mainMenuTip\'s ▲ points ' + Math.round(Math.min(Math.abs(aim.ax - aim.bl),
      Math.abs(aim.ax - aim.br))) + ' px away from the Main Menu button it names — arrow centre x ' +
      aim.ax + ', button box ' + aim.bl + '–' + aim.br + ', bubble ' + aim.tipL + '–' + aim.tipR +
      '. The bubble spans the whole tools row and the button sits at its right end, so a CENTRED ' +
      'arrow lands over the speed bar; aimMainMenuTip() has to set --mm-arrow-x from the button.');
  }
  if (aim.ay < aim.bb) {
    throw new Error('#689: the tip\'s ▲ (y ' + aim.ay + ') is drawn ABOVE the button\'s bottom edge (' +
      aim.bb + ') — the bubble is not below the row it points at');
  }
  log.push('coach tip ▲ at x ' + aim.ax + ', inside the Main Menu box ' + aim.bl + '–' + aim.br +
           ' (bubble ' + aim.tipL + '–' + aim.tipR + ')');
  await page.evaluate(function () { var t = document.getElementById('mainMenuTip'); if (t) t.hidden = true; });
  if (await page.isVisible('#missionOverlay')) throw new Error('#689: could not get the window shut to start from');
  await page.click('#mainMenuBtn');
  await page.waitForSelector('#missionOverlay', { state: 'visible', timeout: 4000 })
    .catch(function () { /* the throw below carries the message */ });
  if (!(await page.isVisible('#missionOverlay'))) {
    throw new Error('#689: pressing Main Menu did not open the Plant & Mission window — the ' +
      'openMissionSelect listener is still bound to the deleted #simStatus');
  }
  log.push('Main Menu opens the window');

  // 4a — the quick tour's step for this button lands ON the button.
  await page.click('#missionClose');
  await page.waitForTimeout(300);
  /* renderTour() SKIPS a step whose selector resolves to nothing ("Skip missing targets rather
   * than stalling the tour") and moves straight to the next one — so a dead selector costs a
   * whole step and raises nothing. The probe therefore walks the tour to its end and demands
   * that a step titled "Main Menu" both EXISTS and lands its spotlight on the button: a
   * missing step and a mis-aimed one are different defects and both are invisible otherwise. */
  var tour = await page.evaluate(async function () {
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    var help = document.getElementById('helpBtn');
    var starter = document.getElementById('helpTourBtn');
    if (!help || !starter) return { err: 'no #helpBtn / #helpTourBtn to start the tour from' };
    help.click();
    await sleep(250);
    starter.click();
    await sleep(400);
    var root = document.getElementById('tourRoot');
    if (!root || root.hidden) return { err: 'the tour did not open (#tourRoot still hidden)' };
    var seen = [], guard = 0;
    while (guard++ < 40) {
      var title = (document.getElementById('tourTitle') || {}).textContent || '';
      var spot = document.getElementById('tourSpot');
      var live = document.querySelector('.tour-target-live');
      var sr = spot ? spot.getBoundingClientRect() : null;
      seen.push({
        title: title.trim(),
        prog: ((document.getElementById('tourProg') || {}).textContent || '').trim(),
        liveId: live ? (live.id || live.className) : null,
        spot: sr ? { x: Math.round(sr.x), y: Math.round(sr.y), w: Math.round(sr.width), h: Math.round(sr.height) } : null
      });
      var next = document.getElementById('tourNext');
      if (!next || /done/i.test(next.textContent || '')) break;
      next.click();
      await sleep(260);
    }
    var b = document.getElementById('mainMenuBtn').getBoundingClientRect();
    var close = document.getElementById('tourSkip'); if (close) close.click();
    return { steps: seen,
             btn: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } };
  });
  if (tour.err) throw new Error('#689: could not drive the quick tour — ' + tour.err);

  /* #720 — THE TOUR MUST WALK EVERY STEP IT DECLARES, and this is the general form of the
   * defect, not a check pinned to one step.
   *
   * renderTour()'s skip branch ("Skip missing targets rather than stalling the tour") costs a
   * whole step and, until #720, printed nothing: `#tourProg` simply jumped. Measured on the
   * shipped board before the fix — 1/11, then 3/11 — because step 2 pointed at `#gaugeStrip`,
   * which is `display: none` on the PWR, so `tourElVisible()` rejected it. Ten of eleven steps
   * ran and the tour read as complete. Nothing in the suite could see it: every existing
   * assertion was about a step that DID render.
   *
   * The claim is the whole sequence, taken off `#tourProg`'s own denominator so it cannot go
   * stale when a step is added or removed: the walk must report 1/N, 2/N … N/N with no gap.
   * Any step whose selector is absent, hidden or zero-sized reds here by name.
   *
   * PROVED RED BY INJECTION (2026-09-12), at BOTH shapes, because "absent" and "present but
   * invisible" reach tourElVisible() by different routes. Pointing the Alarms step (3 of 11) at
   * `#rd720InjectionAbsent`, which matches nothing, and then at `#gaugeStrip`, which exists with
   * six children and is display:none, each gave: "walked 10 of 11 and the progress readout went
   * 1 -> 2 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11. Never rendered: 3 / 11". Selector restored,
   * green at 11 of 11. */
  var walk = (tour.steps || []).map(function (s) {
    var m = /^(\d+)\s*\/\s*(\d+)$/.exec(s.prog || '');
    return m ? { i: +m[1], n: +m[2] } : null;
  });
  if (walk.some(function (w) { return !w; })) {
    throw new Error('#720: a tour step reported no readable progress — #tourProg values were ' +
      JSON.stringify(tour.steps.map(function (s) { return s.prog; })));
  }
  var total = walk[0].n;
  if (walk.some(function (w) { return w.n !== total; })) {
    throw new Error('#720: the tour changed its own step total mid-walk — ' +
      JSON.stringify(walk.map(function (w) { return w.i + '/' + w.n; })));
  }
  var missing = [];
  for (var wi = 1; wi <= total; wi++) {
    if (!walk.some(function (w) { return w.i === wi; })) missing.push(wi + ' / ' + total);
  }
  if (missing.length || walk.length !== total) {
    throw new Error('#720: the quick tour SILENTLY SKIPPED ' + missing.length + ' of its ' +
      total + ' steps — it walked ' + walk.length + ' of ' + total + ' and the progress ' +
      'readout went ' + walk.map(function (w) { return w.i; }).join(' -> ') + '. Never ' +
      'rendered: ' + (missing.join(', ') || '(none — the walk repeated a step instead)') +
      '. renderTour() skips a step whose `sel`/`sels` resolve to nothing visible and says ' +
      'nothing, so a step pointing at an element that is absent, hidden or display:none on ' +
      'this plant costs the player the whole step. Fix the selector — do NOT relax this check.');
  }
  log.push('quick tour walks every declared step: ' + walk.map(function (w) { return w.i; }).join(', ') +
           ' of ' + total + ', titles ' + JSON.stringify(tour.steps.map(function (s) { return s.title; })));

  var named = (tour.steps || []).filter(function (s) { return /main menu/i.test(s.title || ''); });
  if (!named.length) {
    throw new Error('#689: the quick tour walked ' + tour.steps.length + ' steps and none is ' +
      'titled "Main Menu" — titles were ' +
      JSON.stringify(tour.steps.map(function (s) { return s.title; })) + '. renderTour() SKIPS a ' +
      'step whose selector resolves to nothing, so a stale sel is exactly this shape.');
  }
  var st = named[0];
  if (st.liveId !== 'mainMenuBtn') {
    throw new Error('#689: the tour\'s Main Menu step highlighted "' + st.liveId + '", not ' +
      '#mainMenuBtn — its `sel` points somewhere else');
  }
  var cx = st.spot ? st.spot.x + st.spot.w / 2 : -1, cy = st.spot ? st.spot.y + st.spot.h / 2 : -1;
  var inside = cx >= tour.btn.x - 12 && cx <= tour.btn.x + tour.btn.w + 12 &&
               cy >= tour.btn.y - 12 && cy <= tour.btn.y + tour.btn.h + 12;
  if (!inside) {
    throw new Error('#689: the tour\'s Main Menu spotlight is not over the button — spotlight ' +
      JSON.stringify(st.spot) + ', button ' + JSON.stringify(tour.btn));
  }
  log.push('quick tour: ' + tour.steps.length + ' steps; the "' + st.title + '" step (' + st.prog +
           ') spotlights #' + st.liveId + ' at ' + JSON.stringify(st.spot));

  // 4b — the coach dot resolves to this button. Forced on by clearing its seen key.
  await page.evaluate(function () {
    try { localStorage.removeItem('rd_seen_session'); } catch (e) { /* private mode */ }
  });
  await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForSelector('#mainMenuBtn', { timeout: 8000 });
  var dot = await page.evaluate(function () {
    var b = document.getElementById('mainMenuBtn');
    var after = getComputedStyle(b, '::after');
    return { marked: b.classList.contains('unvisited'),
             w: after.width, h: after.height, pos: after.position,
             anyElse: Array.prototype.map.call(document.querySelectorAll('.unvisited'),
               function (e) { return e.id || e.className; }) };
  });
  if (!dot.marked) {
    throw new Error('#689: the coach dot does not reach the Main Menu button — COACH.session ' +
      'still names a deleted element, and applyCoachMarks() skips a missing node in silence. ' +
      'Elements carrying .unvisited: ' + JSON.stringify(dot.anyElse));
  }
  if (dot.pos !== 'absolute' || parseFloat(dot.w) < 4 || parseFloat(dot.h) < 4) {
    throw new Error('#689: #mainMenuBtn carries .unvisited but the dot paints nothing — ' +
      '::after is ' + dot.w + ' x ' + dot.h + ' at position ' + dot.pos +
      ' (.unvisited::after needs a positioned parent)');
  }
  log.push('coach dot reaches Main Menu: ::after ' + dot.w + ' x ' + dot.h);

  // …and it retires on first use, on the new element.
  await dismissMission(page);
  await page.waitForTimeout(250);
  await page.click('#mainMenuBtn');
  await page.waitForTimeout(350);
  var gone = await page.evaluate(function () {
    return document.getElementById('mainMenuBtn').classList.contains('unvisited');
  });
  if (gone) throw new Error('#689: the coach dot did not retire when Main Menu was pressed — ' +
    "markSeen('session') is still bound to the deleted #simStatus");
  log.push('coach dot retires on first press');
  await page.click('#missionClose');
  await page.waitForTimeout(300);
  return log.join('\n') + '\n';
}

/* THE PLANT & MISSION WINDOW'S SHAPE (#688, owner playtest #675 section A, 2026-09-09:
 * "Put a green [NEW] next to the Walkthroughs tab in the plant and mission menu. Remove the
 * plant selection column from the plant and mission menu.")
 *
 * TWO CLAIMS, AND BOTH ARE READ OFF THE RENDERED DOM rather than the source, because a
 * source scan for a rendered string cannot tell you the string is reachable (#485). The
 * column was BUILT IN JS into #mpPlants, so "the div left shell.html" is not the claim — the
 * claim is that no plant card reaches the screen and the body no longer reserves the 260 px
 * track one would have sat in. Measured on a dev build before the change: five cards, `pwr`
 * and `pwr2` selectable and three greyed COMING SOON, in a 260px|678px grid.
 *
 * The badge is asserted on its COMPUTED COLOUR and its painted rect, never on the class name.
 * "Green" is the owner's word for it and it is the half a class-name check cannot see: a
 * badge whose .mp-new rule never loaded still carries the class and still reads NEW.
 *
 * The third assertion is the one that makes the removal safe. All four content builders read
 * `msel.engine`, which the deleted [data-mplant] handler used to write; it is now only ever
 * seeded from ui.engineKey in openMissionSelect(), and a tab that renders empty is how a
 * broken seed would surface. Driven through the dev door (?mmode=) so campaign and scenarios
 * are swept as well — the player's window offers only the first two tabs (#660 item 19).
 * `dev=1` arms RD.__dev so the last assertion can name the engine the Start button actually
 * constructed; it does NOT move the flags channel, which site/flags.js reads from
 * `channel=`/`flags=`/RD_CHANNEL, so the tab list under test is still the dev-door one. */
async function testMissionMenuShape(page) {
  var log = [];
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&mmode=free&dev=1',
    { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForSelector('#missionOverlay', { state: 'visible', timeout: 8000 });

  var shape = await page.evaluate(function () {
    var body = document.querySelector('#missionOverlay .mission-body');
    var cols = getComputedStyle(body).gridTemplateColumns;
    return {
      column: !!document.getElementById('mpPlants'),
      cards: document.querySelectorAll('[data-mplant]').length,
      cols: cols,
      tracks: cols.trim().split(/\s+/).length
    };
  });
  if (shape.column || shape.cards) {
    throw new Error('#688: the plant selection column is still on screen — #mpPlants ' +
      (shape.column ? 'exists' : 'gone') + ', ' + shape.cards + ' [data-mplant] card(s) rendered');
  }
  if (shape.tracks !== 1) {
    throw new Error('#688: the plant column is gone but .mission-body still reserves its track — ' +
      'grid-template-columns is "' + shape.cols + '". The Plant & Mission body needs .mp-body; ' +
      'the 260px|1fr default stays because the chart-settings window reuses this class with a ' +
      'real left column.');
  }
  log.push('no plant column: 0 cards, body is one ' + shape.cols + ' track');

  var badge = await page.evaluate(function () {
    var out = { badges: [], walkthroughTab: null };
    var btns = document.querySelectorAll('#mpModes [data-mmode]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i], s = b.querySelector('.mp-new');
      if (b.getAttribute('data-mmode') === 'walkthroughs') out.walkthroughTab = (b.textContent || '').trim();
      if (!s) continue;
      var r = s.getBoundingClientRect(), c = getComputedStyle(s);
      out.badges.push({ tab: b.getAttribute('data-mmode'), text: (s.textContent || '').trim(),
                        color: c.color, w: Math.round(r.width), h: Math.round(r.height) });
    }
    return out;
  });
  if (badge.badges.length !== 1 || badge.badges[0].tab !== 'walkthroughs') {
    throw new Error('#688: expected exactly one NEW badge and it belongs on the Walkthroughs ' +
      'tab — got ' + JSON.stringify(badge.badges) + ' (the Walkthroughs tab reads "' +
      badge.walkthroughTab + '")');
  }
  var nb = badge.badges[0];
  if (!/^NEW$/.test(nb.text)) throw new Error('#688: the badge reads "' + nb.text + '", not NEW');
  if (nb.w < 4 || nb.h < 4) {
    throw new Error('#688: the NEW badge is in the DOM but paints ' + nb.w + 'x' + nb.h + ' px');
  }
  var rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(nb.color);
  if (!rgb) throw new Error('#688: could not read the badge colour ("' + nb.color + '")');
  var R = +rgb[1], G = +rgb[2], B = +rgb[3];
  if (!(G > R + 30 && G > B + 30)) {
    throw new Error('#688: the badge is not GREEN — computed colour ' + nb.color + '. The owner ' +
      'asked for a green [NEW], and the colour is the half a class-name check cannot see.');
  }
  log.push('NEW badge on Walkthroughs only: ' + nb.w + 'x' + nb.h + ' px, ' + nb.color);

  var tabs = await page.$$eval('#mpModes [data-mmode]', function (els) {
    return els.map(function (e) { return e.getAttribute('data-mmode'); });
  });
  var thin = [];
  for (var i = 0; i < tabs.length; i++) {
    await page.click('[data-mmode="' + tabs[i] + '"]');
    await page.waitForTimeout(250);
    var chars = await page.evaluate(function () {
      var c = document.getElementById('mpContent');
      return ((c && c.textContent) || '').trim().length;
    });
    log.push('tab ' + tabs[i] + ': ' + chars + ' chars of content');
    if (chars < 40) thin.push(tabs[i] + '=' + chars);
  }
  if (thin.length) {
    throw new Error('#688: a mode tab built (nearly) nothing once the plant column was ' +
      'removed — ' + thin.join(', ') + '. All four builders read msel.engine, which the ' +
      'deleted [data-mplant] handler used to write.');
  }

  // …and Start still boots the plant, with no plant card left to have selected it.
  await page.click('[data-mmode="free"]');
  await page.waitForTimeout(200);
  await page.click('[data-mfree]');
  await waitBoardLive(page, 20000);
  var boot = await page.evaluate(function () {
    var pid = null;
    try { pid = RD.__dev.service().activePlantId; } catch (e) { pid = null; }
    return { hidden: !!document.getElementById('missionOverlay').hidden,
             paused: document.getElementById('playBtn').classList.contains('paused'),
             plant: pid, clock: (document.getElementById('clock').textContent || '').trim() };
  });
  if (!boot.hidden || boot.paused || boot.plant !== 'pwr2') {
    throw new Error('#688: Free Play no longer boots the plant after the column was removed — ' +
      JSON.stringify(boot));
  }
  log.push('Free Play starts: plant_id=' + boot.plant + ', running at ' + boot.clock);
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
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2',
    { waitUntil: 'networkidle', timeout: 90000 });
  /* was waitForTimeout(1200): the predicate is the assertion one line down (#513) */
  await page.waitForSelector('#missionOverlay', { state: 'visible', timeout: 5000 })
    .catch(function () { /* the throw below carries the real message */ });

  // The window opens on every load, so this is the very first thing a player does.
  if (!(await page.isVisible('#missionOverlay'))) throw new Error('Plant & Mission did not open on load');
  await page.click('#missionClose');
  await page.waitForTimeout(700);
  if (!(await running())) throw new Error('closing Plant & Mission with ✕ left the plant PAUSED');
  log.push('✕ Close: plant runs');

  // The reported path: pick a starting condition and press Free Play.
  await page.click('#mainMenuBtn');
  await page.waitForTimeout(400);
  if (!(await page.isVisible('#missionOverlay'))) throw new Error('could not reopen Plant & Mission');
  await page.click('[data-mfree]');
  /* was waitForTimeout(1200): wait on the two states the assertions read — closed AND
   * running (#513). On the defect it waits the ceiling and reds as before. NOTE the
   * player-paused twin below keeps its fixed sleep DELIBERATELY: it asserts a negative
   * (the plant must NOT resume after the rebuild), and a shortened window would weaken it. */
  await page.waitForFunction(function () {
    var ov = document.getElementById('missionOverlay');
    var closed = !ov || ov.style.display === 'none' || ov.hidden || !ov.offsetParent;
    return closed && !document.getElementById('playBtn').classList.contains('paused');
  }, { timeout: 3600, polling: 100 }).catch(function () { /* assertions below carry the message */ });
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
  await page.click('#mainMenuBtn');
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
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2',
    { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  /* was waitForTimeout(2500): the predicate is the thing the check reads (#513) */
  await page.waitForFunction(function () {
    return !!document.querySelector('#chartCanvas .run-start') &&
           !!document.querySelector('.run-start-tag');
  }, { timeout: 7500, polling: 100 });

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
  /* was waitForTimeout(6000): the point is SIM time, not wall time — the run start only
   * needs to be far older than the 60 s window the negative control uses (#513). At 600x
   * this crosses in well under a second of wall clock. */
  await page.waitForFunction(function () {
    var m = /^T\+(\d+):(\d+):(\d+)/.exec((document.getElementById('clock') || {}).textContent || '');
    return !!m && (+m[1] * 3600 + +m[2] * 60 + +m[3]) > 300;
  }, { timeout: 18000, polling: 100 });
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
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&run=1',
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
  /* ⛔ WAIT FOR PICK MODE TO SETTLE, THEN READ EVERYTHING IN ONE GO (#521). This was a fixed
   * 300 ms sleep followed by TWO separate round trips — the marks and the x-axis span from one
   * evaluate, the clock from another. Entering pick mode WIDENS the plot to show every reachable
   * mark, so those two reads can straddle the redraw: the span belongs to one frame and the clock
   * to the next, `t0 = tAfterPress - span` mixes them, and if a checkpoint appeared in between
   * `marks[1]` is a different checkpoint altogether. That is not jitter — it is a whole mark of
   * error, and it is why CI once read "expected T+7 s, landed T+175 s" on a commit that touched
   * none of this and passed on a re-run of the same job (#521). */
  await page.waitForFunction(function () {
    return document.querySelector('.strip-chart').classList.contains('rewind-pick') &&
           document.getElementById('playBtn').classList.contains('paused');
  }, { timeout: 5000, polling: 50 }).catch(function () { /* the throws below carry the message */ });
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
      /* #521 — the clock is read HERE, in the same evaluate as the marks and the span, so the
       * three cannot come from different frames. Reading it separately is the whole defect. */
      clock: (document.getElementById('clock').textContent || '').trim(),
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
  var tAfterPress = (function (txt) {          /* #521 — from st, NOT a second round trip */
    var m = /(\d+):(\d+):(\d+)/.exec(txt || '');
    return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : NaN;
  })(st.clock);
  if (!isFinite(tAfterPress)) throw new Error('could not read the clock from the pick-mode frame ("' + st.clock + '")');
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
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2',
    { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page);                         /* was waitForTimeout(1500) — #513 */
  // THE PLANT IS ALREADY RUNNING — closing the boot mission overlay auto-starts it
  // *(OWNER DIRECTIVE, 2026-08-11: "Sim should start running not paused.")*, so an
  // unconditional #playBtn press PAUSES it. This test carried that press from before the
  // ruling and passed for ten days on an accident: the plant raced at 600x for the
  // ~100 ms between the speed click and the play click, and those few broadcasts held
  // enough fine rows to satisfy the spacing check. The #501 pre-seed removal shortened
  // boot enough to shrink that window below one broadcast, which is what exposed it.
  // Press play only if the clock is actually stopped; `source` will read "mixed" (the 1x
  // prefix), which the check below accepts — the spacing is the real test.
  await page.evaluate(function () {
    var b = document.querySelector('#speedSeg [data-speed="600"], [data-speed="600"]');
    if (b) b.click();
  });
  var clockAt = function () { return page.evaluate(function () { return (document.querySelector('#clock, .clock') || {}).textContent; }); };
  var c0 = await clockAt();
  await page.waitForTimeout(400);
  if (await clockAt() === c0) await page.click('#playBtn');
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
  if (b.schema_version !== '1.2') throw new Error('diag bundle schema is ' + b.schema_version + ', expected 1.2');
  if ('sample_hz' in (b.manifest || {})) throw new Error('diag manifest still carries sample_hz');
  if (!ts.fields || !ts.t || !ts.lo || !ts.hi) throw new Error('diag timeseries is not columnar with extremes');
  // AND THE ROUNDING IS ON THE BROWSER'S OWN PATH (#681). This is the DOWNLOAD button's bundle,
  // built by the shipped app, so it is the one place outside Node that proves build() rounds at
  // all — the report was 2,939 KB of 17-significant-figure doubles against a 2 MB wire cap.
  var over = null;
  ['v', 'lo', 'hi'].forEach(function (side) {
    (ts[side] || []).forEach(function (col) {
      col.forEach(function (x) {
        if (over || typeof x !== 'number' || Math.abs(x) < 1) return;
        var m = /\.(\d+)$/.exec(String(x));
        if (m && m[1].length > 4) over = x;
      });
    });
  });
  if (over !== null) throw new Error('diag timeseries is not rounded: ' + over);

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


/* ---- #520: THE SIMULATION-HALTED DIALOG ------------------------------------------------------
 * The new-physics engine HOLDS when the plant leaves the range its property library is
 * characterised over — state frozen, clock running, every control still accepted and doing
 * nothing. #517 published `model_held` so it COULD be seen; nothing displayed it, so a player
 * still got a plausible, internally consistent, completely static plant (measured on the Three
 * Mile Island timeline: 160 minutes of it).
 *
 * ⚠ WHY THIS DRIVES A REAL HALT RATHER THAN FAKING ONE. #517's first attempt at board rows for
 * these fields passed every gate in the suite AND WAS INERT — the rows were keyed to chart series
 * that did not exist, so nothing rendered them, and only driving the board found it. So this rides
 * a genuine casualty: a large break with the station blacked out AND NO AUXILIARY FEED has nothing
 * to answer it and the plant actually runs dry.
 *
 * ⚠ `afw_failure` IS LOAD-BEARING, and #583 is how that was found. Until 2026-08-28 the driver was
 * `large_loca,station_blackout` alone, and it held. After #583 removed 2,539 kg of phantom
 * pressurizer water from the reactor coolant system, the SAME casualty stops holding IN THE
 * BROWSER: measured at ff=7200 (6,807 s of plant time) the primary parks at **83 psia against
 * containment backpressure**, 0 % pressurizer level, and sits there — a wrecked plant that never
 * leaves the property library's range, because the steam generators still have auxiliary feed and
 * keep taking the decay heat. Block AFW and it runs dry and goes out of range: **22 psia, held,
 * dialog up**, at ff=1500 and again at ff=3000.
 *
 * ⚠ AND NOTE WHICH LAYER SAID WHAT. The identical service, seed, initial condition, injections and
 * fast-forward driven in NODE reports `model_held: true` on the two-failure casualty; the browser
 * does not. That divergence is unexplained and is NOT what this check is for — the three-failure
 * casualty holds on both. If this check ever goes red again, measure the plant before touching the
 * budget: a driver that only just reached the envelope edge is the shape that rots.
 *
 * ⚠ AND IT DOES NOT DISMISS THE MISSION WINDOW FIRST. The halt dialog sits above it at z-index
 * 214, so `click('#missionClose')` times out once the dialog is up — which is the feature working.
 * Wait for the dialog on its own terms.
 *
 * ⚠ `?ff=` BUYS LESS SIM TIME THAN IT SAYS IN A TRANSIENT. ff=500 bought 261 s here, because a
 * broadcast cycle shrinks once the plant is moving. The figure below is empirical, not arithmetic. */
async function testHeldPlantDialog(page) {
  var log = [];
  var base = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&run=1';

  await page.goto(base, { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);
  if (!(await page.isHidden('#haltOverlay'))) {
    throw new Error('#520: the halt dialog is showing on a HEALTHY plant — it must not greet you');
  }
  if (await page.evaluate(function () {
        return document.getElementById('clock').classList.contains('clk-held'); })) {
    throw new Error('#520: the clock claims HELD on a healthy plant');
  }
  log.push('healthy plant: dialog hidden, clock unmarked');

  /* THE FIXTURE CARRIES failure_to_scram, AND THAT IS THE WHOLE FIX (#588/#589).
   *
   * The three-failure casualty this used to drive is MARGINAL, and marginal here does not mean
   * "close to a threshold" — it means the blowdown endgame has sensitive dependence and ONE ULP
   * picks the branch. Measured 2026-08-30 by nudging the initial pressure by single ulps (a
   * relative perturbation of 1e-16, the smallest a double can carry) through the app's verbatim
   * ff=1500 burst:
   *
   *   nudge   delivered   model_held      final
   *   +0      1164 s      YES at 399 s    19.2 psia
   *   +1      1092 s      NEVER           87.1 psia     <- and this IS the Linux branch
   *   +2      1092 s      NEVER           87.1 psia
   *   +8      1236 s      YES at 273 s    158.1 psia
   *
   * Three outcomes from four adjacent bit patterns. Windows and Linux were never disagreeing
   * about physics — every Math primitive and all 3,600 water-table evaluations hash BIT-IDENTICAL
   * across the two — they were landing on different branches of a chaotic trajectory, which is
   * what #588 spent nine hypotheses hunting as a mechanism. There is no mechanism. There is a
   * bifurcation, and this check was pinning it.
   *
   * That is the standing trap in CLAUDE.md, one level up from where #543 found it:
   *   "A check can pin a BIFURCATION, not a claim ... one bit picks the branch (green here, red
   *    on CI). Assert the invariant the defect violated."
   *
   * So the fixture moves off the cliff instead of the budget moving. Adding the ATWS drives the
   * plant unambiguously outside the property library's range, and it holds on EVERY branch —
   * measured at ulp +0/+1/+3/+8/+32 on BOTH platforms, ten runs, ten holds:
   *
   *   Windows   YES 243 / 228 / 411 / 273 / 273 s
   *   Linux     YES 267 / 270 / 345 / 366 / 273 s
   *
   * ⚠ THE LATCH TIME IS NOT A CLAIM — it spans 228-411 s across those ten runs. Assert THAT it
   * holds and that the dialog follows; never WHEN. A check that pins the second is this defect
   * again wearing a number. */
  /* ⚠ THE PHYSICAL LATCH IS RETIRED FROM THIS FIXTURE (#524, 2026-08-31). The ulp study above
   * is history now in a second way: with the property floor at 0.002 MPa and the #586/#516
   * ceiling work, the extended envelope CONTAINS this casualty — measured at the shell layer,
   * the same four failures ride 8,000 s LIVE through clad damage at 1,667 degC with no hold on
   * ANY branch, and no menu-injectable combo reaches `beyond_model` inside a testable window.
   * That is the engine getting better, not the dialog losing its subject: the hold still
   * exists (run_pwr2_core unit-tests the arms; run_pwr2_loca rides one manually), and #520's
   * claim was always about the UI CONTRACT — a held plant must SHOW the dialog. So the fixture
   * now latches the flag DIRECTLY through the ?dev=1 hook, at `sys.beyond_model` — the exact
   * flag every consumer checks — mid-casualty, the same manual-latch adjudication
   * run_pwr2_loca's hold section made. The ulp cliff goes with it: no branch to land on. */
  await page.goto(base + '&dev=1&inject=large_loca,station_blackout,afw_failure,failure_to_scram&ff=120',
                  { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(1500);
  var latched = await page.evaluate(function () {
    try {
      var svc = globalThis.RD.__dev.service();
      svc.engine.eng.sys.beyond_model = true;                /* the latch, at the flag itself */
      /* the casualty's attention-stop PAUSES the service (measured: frozen at 66 s with no
       * broadcasts, so the held state never rendered) — resume so a broadcast carries it */
      svc.attentionStops = false;
      if (!svc.running) svc.start();
      return { ok: true, running: svc.running };
    } catch (e) { return { ok: false, err: String(e) }; }
  });
  if (!latched.ok) {
    throw new Error('#520 fixture: the ?dev=1 latch hook failed — ' + latched.err +
      '. This is the harness door, not the dialog: check RD.__dev in ui/app.js.');
  }
  var plantHeld = true;
  await page.waitForFunction(function () {
    var c = document.getElementById('clock');
    return !!c && c.classList.contains('clk-held');
  }, { timeout: 30000, polling: 200 }).catch(function () { plantHeld = false; });
  if (!plantHeld) {
    var never = await page.evaluate(function () {
      var c = document.getElementById('clock');
      return { clock: c ? c.textContent.replace(/\s+/g, ' ').trim() : '(no clock)',
               overlay: !!(document.getElementById('haltOverlay') || {}).hidden };
    });
    throw new Error('#520: the plant was LATCHED at the flag and the clock never read HELD — ' +
      'clock ' + never.clock + '. The latch was set, so this IS the display half failing (#589\'s ' +
      'two-wait split still holds: this wait is the render, not the physics).');
  }
  await page.waitForFunction(function () {
    var o = document.getElementById('haltOverlay');
    return !!o && !o.hidden;
  }, { timeout: 15000, polling: 200 }).catch(function () { /* the throws below carry the message */ });
  await page.waitForTimeout(400);

  var st = await page.evaluate(function () {
    var o = document.getElementById('haltOverlay');
    var m = o ? o.querySelector('.mission-modal') : null;
    if (!o || !m) return { missing: true };
    var r = m.getBoundingClientRect();
    return {
      hidden: o.hidden,
      why: (document.getElementById('haltWhy') || {}).textContent || '',
      body: ((o.querySelector('.halt-body') || {}).textContent || '').length,
      reset: !!document.getElementById('haltReset'),
      clk: document.getElementById('clock').classList.contains('clk-held'),
      rect: { l: r.left, t: r.top, r: r.right, b: r.bottom, h: r.height },
      vw: window.innerWidth, vh: window.innerHeight
    };
  });
  if (st.missing) throw new Error('#520: #haltOverlay / .mission-modal did not render at all');
  if (st.hidden) {
    throw new Error('#520: the plant HELD and the dialog stayed hidden — the player is back to a ' +
                    'frozen board with no indication, which is the whole defect');
  }
  if (st.body < 300) throw new Error('#520: the dialog does not EXPLAIN anything (' + st.body + ' chars)');
  if (!/property library|screen:/.test(st.why)) {
    throw new Error('#520: the dialog does not name the cause — got "' + st.why.slice(0, 60) + '"');
  }
  if (!st.reset) throw new Error('#520: no reset button — the player has no way out');
  if (!st.clk) {
    throw new Error('#520: the clock carries no HELD marker. Dismissing the dialog would then ' +
                    'lose the only indication, re-creating the defect this issue is about');
  }
  /* The #454 lesson: counting elements missed a window drawn outside the viewport. */
  if (st.rect.l < 0 || st.rect.t < 0 || st.rect.r > st.vw + 1 || st.rect.b > st.vh + 1 || st.rect.h < 120) {
    throw new Error('#520: the halt dialog is off-viewport or collapsed: ' + JSON.stringify(st.rect) +
                    ' against ' + st.vw + 'x' + st.vh);
  }
  log.push('held plant: dialog open, cause named, clock marked, rect ' + Math.round(st.rect.h) + 'px');

  /* THE BUTTON MUST ACTUALLY RECOVER THE PLANT — a dialog that explains and cannot fix is half
   * the feature. The latch cannot be cleared in place, so this exercises the full rebuild. */
  await page.click('#haltReset');
  await page.waitForTimeout(2500);
  var after = await page.evaluate(function () {
    return { hidden: document.getElementById('haltOverlay').hidden,
             clk: document.getElementById('clock').classList.contains('clk-held'),
             clock: (document.getElementById('clock').textContent || '').trim() };
  });
  if (!after.hidden) throw new Error('#520: Reset left the dialog open');
  if (after.clk) {
    throw new Error('#520: Reset did not recover the plant — the clock still reads HELD at ' +
                    after.clock + '. The latch cannot be cleared in place, so this means the ' +
                    'rebuild did not happen');
  }
  log.push('reset: dialog closed, HELD cleared, clock ' + after.clock);
  return log.join('\n');
}

/* #553 — THE LOAD BUTTON'S HONESTY. SimulationService.loadState signals a refusal by
 * RETURNING {type:'error'}; it does not throw. ui/app.js discarded that return and toasted
 * "State loaded" regardless, so 4 of the 5 reject classes measured on a public build
 * announced a save that had loaded NOTHING — including the common one after the #523
 * cutover, a save from the retired engine whose constructor a published build no longer
 * carries. Only the browser can see this: the defect is between the service's return value
 * and a toast, and every Node gate hands loadState a good payload.
 *
 * Both arms matter. Without the POSITIVE control a handler that error-toasts everything
 * would pass, which is the same class of hollow check as a negative assertion with no
 * reachability proof — so the control drives the app's OWN Save button and feeds the file
 * it produced straight back in. */
async function testSaveLoadRefusal(page) {
  var log = [];
  var base = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&run=1';
  await page.goto(base, { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);

  async function toast() {
    return await page.evaluate(function () {
      var t = document.getElementById('appToast');
      if (!t) return { missing: true };
      return { text: t.textContent || '', error: t.className.indexOf('error') >= 0,
               shown: t.className.indexOf('show') >= 0 };
    });
  }
  // the toast auto-hides (2.5 s, 5 s for an error) — clear it so each arm reads its own
  async function clearToast() {
    await page.evaluate(function () {
      var t = document.getElementById('appToast');
      if (t) { t.className = 'app-toast'; t.textContent = ''; }
    });
  }

  // --- POSITIVE CONTROL: the app's own Save, fed back through the app's own Load ---------
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsOverlay [data-act="save"]', { timeout: 10000 });
  var dl = (await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.click('#settingsOverlay [data-act="save"]'),
  ]))[0];
  var goodPath = path.join(SCRATCH, 'e2e-save-good.json');
  await dl.saveAs(goodPath);
  var goodBytes = fs.statSync(goodPath).size;
  if (goodBytes < 1000) throw new Error('#553 control: the Save button produced ' + goodBytes + ' bytes');
  await clearToast();
  await page.setInputFiles('#loadFile', goodPath);
  await page.waitForFunction(function () {
    var t = document.getElementById('appToast');
    return !!t && t.className.indexOf('show') >= 0;
  }, { timeout: 10000, polling: 100 });
  var okT = await toast();
  if (okT.error || !/State loaded/.test(okT.text)) {
    throw new Error('#553 control: the app\'s OWN save must load — toast was "' + okT.text +
                    '" (error=' + okT.error + ')');
  }
  log.push('control: Save -> Load round trip through the real buttons -> "' + okT.text.trim() + '"');

  // --- THE CASE: a file loadState REFUSES BY RETURN, not by throwing ---------------------
  // {"hello":"world"} is valid JSON with no metadata, so it lands on the first return guard
  // (simulation_service: 'bad save state'). This is the app's own diagnostics-bundle class:
  // the other .json a player can download from this very UI.
  var badPath = path.join(SCRATCH, 'e2e-save-nometa.json');
  fs.writeFileSync(badPath, JSON.stringify({ hello: 'world' }));
  await clearToast();
  await page.setInputFiles('#loadFile', badPath);
  await page.waitForFunction(function () {
    var t = document.getElementById('appToast');
    return !!t && t.className.indexOf('show') >= 0;
  }, { timeout: 10000, polling: 100 });
  var badT = await toast();
  if (!badT.error) {
    throw new Error('#553: a save that loaded NOTHING was toasted as a success — "' + badT.text + '"');
  }
  if (/State loaded/.test(badT.text)) {
    throw new Error('#553: the refusal toast still reads "State loaded": "' + badT.text + '"');
  }
  log.push('refused-by-return: "' + badT.text.trim() + '" (error class set)');

  // and an unknown plant_id — the second return guard, and the post-cutover legacy-save case
  var legacyPath = path.join(SCRATCH, 'e2e-save-legacy.json');
  fs.writeFileSync(legacyPath, JSON.stringify({
    schema_version: '1.0', metadata: { plant_id: 'bwr', sim_time: 0, time_acceleration: 1 },
    engine: {}, control_failure: {}, instructor: {},
  }));
  await clearToast();
  await page.setInputFiles('#loadFile', legacyPath);
  await page.waitForFunction(function () {
    var t = document.getElementById('appToast');
    return !!t && t.className.indexOf('show') >= 0;
  }, { timeout: 10000, polling: 100 });
  var legT = await toast();
  if (!legT.error || /State loaded/.test(legT.text)) {
    throw new Error('#553: a save naming a plant this build has no constructor for was toasted "' +
                    legT.text + '"');
  }
  log.push('unknown plant_id: "' + legT.text.trim() + '"');
  return log.join('\n');
}

/* THE ADVANCED INSTRUMENT-FAILURE PANEL (#564 item 3) — the Hard Rule 1 teaching tool that
 * physics.html sells: fail one gauge, watch the plant behind it stay real. On the plant the
 * site runs it had lost BOTH halves of being usable, and only a browser can see either.
 *
 *   1. THE LABELS. `manualProfile()` was `(RD.MANUAL||{})[ui.engineKey]` with no `|| [ui.plant]`
 *      fallback — the one `manualRef()` fifty lines away has always had. `RD.MANUAL` is keyed
 *      pwr / rbmk_pre / rbmk_post / bwr and has no `pwr2`, so the lookup came back undefined and
 *      the panel fell through to `Object.keys(latest.instruments)`: 85 rows of raw internal ids
 *      (`power_range`, `thot`, `primary_pressure`) where the retired engine showed 50 named
 *      indications.
 *   2. THE PAINT. `advFailAction` ran `cmd(c)` and then recorded `advFailed[id] = mode`
 *      UNCONDITIONALLY, so a REFUSED injection flashed a command error AND listed itself as
 *      "Failed: <id>" — an error, a claim of success and a healthy gauge from one press.
 *
 * A SOURCE SCAN CANNOT SEE EITHER. Both are live-lookup fallbacks that read as working code,
 * which is why this is a browser check and not a grep. */
async function testAdvFailPanel(page) {
  var log = [];
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&run=1',
                  { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);

  var r = await page.evaluate(function () {
    var t = document.getElementById('advExpToggle');
    if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    var sel = document.getElementById('advInstr');
    if (!sel) return { err: 'the advanced panel did not build' };
    var rows = [];
    for (var i = 0; i < sel.options.length; i++)
      rows.push({ v: sel.options[i].value, t: sel.options[i].text });
    function apply() {
      var b = document.getElementById('advApply');
      if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    function active() {
      var el = document.getElementById('advActive');
      return el ? el.textContent.trim() : '';
    }
    sel.value = 'tavg'; apply();
    var afterGood = active();
    /* a channel this plant does not have — the refusal path, which no dropdown row can reach
     * now that every offered row is injectable (#563 item 1 fixed that half) */
    var o = document.createElement('option');
    o.value = 'not_a_channel'; o.text = 'bogus';
    sel.appendChild(o); sel.value = 'not_a_channel'; apply();
    return { rows: rows.length,
             named: rows.filter(function (x) { return x.t !== x.v; }).length,
             raw: rows.filter(function (x) { return x.t === x.v; }).map(function (x) { return x.v; }).slice(0, 6),
             afterGood: afterGood, afterRefused: active() };
  });

  if (r.err) throw new Error('#564 item 3: ' + r.err);
  if (r.named !== r.rows || r.rows < 40) {
    throw new Error('#564 item 3: the instrument dropdown must be HUMAN-NAMED — ' + r.named +
      ' of ' + r.rows + ' named; raw ids still offered: ' + r.raw.join(', '));
  }
  log.push('dropdown: ' + r.rows + ' rows, all human-named (the defect offered 85 raw ids)');

  if (!/tavg/.test(r.afterGood)) {
    throw new Error('#564 item 3 control: an ACCEPTED injection must be listed — active read "' +
                    r.afterGood + '"');
  }
  /* THE CASE. Without the guard the refused id is appended to the list beside the good one. */
  if (r.afterRefused !== r.afterGood || /not_a_channel/.test(r.afterRefused)) {
    throw new Error('#564 item 3: a REFUSED injection was listed as an active failure — ' +
      'before "' + r.afterGood + '", after "' + r.afterRefused + '"');
  }
  log.push('refusal: the active list is unchanged by a refused injection ("' + r.afterRefused + '")');
  return log.join('\n') + '\n';
}

/* A HELD-CLOCK REFUSAL STAYS ON THE CHECKLISTS TAB (#627, owner playtest 2026-09-04: "when gated
 * and i click on a warp button, it closes the checklist"). `set_speed` under a plant-declared
 * hold returns blocked/SPEED_HELD, and cmd() routed every non-interlock block to the Instructor
 * tab — which, with the running checklist in the Checklists pane since #607, IS closing the
 * checklist. Only a browser can see it: the routing is in cmd(), the tab is DOM.
 *
 * The hold is PLANTED at the service's edge state (`_prevSpeedHold`, the very field set_speed
 * consults) through the ?dev=1 seam: reaching the real one is a 75-plant-minute heatup, and the
 * click path is the same whichever plant reason stands. Positive control first: with no hold the
 * same click LANDS and the tab is likewise untouched — so a page that ignored speed clicks
 * altogether could not pass. Dropouts are switched off for the fixture so a checklist step
 * settling cannot snap the control click back to 1x between click and read; the hold ignores
 * that switch by design (#622). */
async function testHeldSpeedClick(page) {
  var log = [];
  var base = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&run=1&dev=1';
  await page.goto(base, { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);
  var started = await page.evaluate(function () {
    try {
      var svc = globalThis.RD.__dev.service();
      svc.attentionStops = false;
      var r = svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_heatup' });
      return { ok: !(r && r.type === 'error'), msg: r && r.message };
    } catch (e) { return { ok: false, msg: String(e) }; }
  });
  if (!started.ok) throw new Error('#627 fixture: start_checklist failed — ' + started.msg);
  await page.waitForFunction(function () {
    var b = document.querySelector('#tabbar button.on');
    return !!b && b.getAttribute('data-tab') === 'instructor' && !!document.querySelector('.ckl-step');
  }, { timeout: 15000, polling: 200 });
  await page.waitForTimeout(1200);
  async function read() {
    return await page.evaluate(function () {
      var b = document.querySelector('#tabbar button.on');
      var svc = globalThis.RD.__dev.service();
      return { tab: b ? b.getAttribute('data-tab') : null, accel: svc.timeAcceleration,
               steps: document.querySelectorAll('.ckl-step').length,
               scanner: ((document.getElementById('scanner') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 160) };
    });
  }
  /* control: no hold — the click lands (600x, or 60x when WARP refuses a fresh plant) */
  await page.click('#speed [data-speed="600"]');
  await page.waitForTimeout(300);
  var ctl = await read();
  if (ctl.tab !== 'instructor' || !(ctl.accel > 1)) {
    throw new Error('#627 control: an unheld 600x click must land above 1x with the Instructor tab kept — ' +
                    'tab ' + ctl.tab + ', accel ' + ctl.accel);
  }
  log.push('control: 600x click landed at ' + ctl.accel + 'x, tab ' + ctl.tab);
  /* PAUSE BEFORE PLANTING. `_prevSpeedHold` is edge state that every broadcast rewrites from
   * the plant's own `true_state.speed_hold` (null here), so on a running service the planted
   * value lived for at most one 100 ms broadcast and the click found it gone — measured: the
   * first cut of this fixture reported "the held click was NOT refused, accel 600" on the
   * FIXED tree. Paused, nothing rewrites it, and cmd() still assembles and renders a snapshot
   * after every command, which is the path under test. */
  await page.evaluate(function () {
    var svc = globalThis.RD.__dev.service();
    svc.handleCommand({ action: 'set_speed', value: 1 });
    svc.handleCommand({ action: 'pause' });
    svc._prevSpeedHold = 'accumulator window open — arm the accumulators before accelerating again';
  });
  await page.click('#speed [data-speed="600"]');
  await page.waitForTimeout(300);
  var held = await read();
  await page.evaluate(function () { globalThis.RD.__dev.service()._prevSpeedHold = null; });
  if (held.accel !== 1) {
    throw new Error('#627: the held click was NOT refused — accel ' + held.accel +
                    ' (the fixture plants the hold at _prevSpeedHold; check set_speed in the service)');
  }
  if (held.tab !== 'instructor' || held.steps === 0) {
    throw new Error('#627: a refused speed click under a plant hold left the Instructor tab — tab ' +
                    held.tab + ', ' + held.steps + ' steps visible (this is the "closes the checklist" report)');
  }
  if (!/Held/.test(held.scanner)) {
    throw new Error('#627: the refusal did not reach the scanner bar — it read "' + held.scanner + '"');
  }
  log.push('held: click refused at 1x, tab ' + held.tab + ', scanner "' + held.scanner.slice(0, 90) + '"');

  /* #686 (OWNER RULING 2026-09-11, "option A" on the held-at-real-time question): the line
   * PERSISTING under the speed bar — not just the per-click scanner flash above — must still
   * carry this message. The #686 replacement deletes the other three `warpNote` reasons
   * (momentary drops already toasted + flashed) but keeps this one, because the accumulator
   * window is a genuine, multi-minute refusal (#675 §E measured the rate-based refusals at a
   * 2.0 plant-second maximum; this one is not that). A literal reading of the #686 ruling
   * would have deleted this too, which is exactly the regression ruling 3 exists to block.
   *
   * PROVED THROUGH THE REAL PIPELINE, NOT THE DOM: `_prevSpeedHold` alone (planted above) never
   * reaches `syncWarpInfo` — the persistent line is only ever set from a `speed_snap`, which
   * `_assembleWithInstructor` stamps ONLY on the RISING edge of `true_state.speed_hold` (and
   * only while `timeAcceleration > 1`, `layers/simulation_service.js` :781). Reaching that state
   * for real is the same 75-plant-minute heatup, so this plants the ONE upstream fact —
   * `true_state.speed_hold` — behind a one-shot override of `assembleSnapshot`, then runs it
   * through the unmodified `_assembleWithInstructor` -> `_attentionStop` -> `snap.metadata.
   * speed_snap` -> `_broadcast` -> `syncSpeedUI`/`syncWarpInfo` chain exactly as a real hold
   * would. A source scan of `syncWarpInfo` cannot prove this string reaches the player;
   * only a broadcast that the client actually renders can (CLAUDE.md's standing trap: a
   * source scan cannot prove a string is reachable). */
  await page.evaluate(function () {
    var svc = globalThis.RD.__dev.service();
    svc._prevSpeedHold = null;                                  // unheld, so this set_speed lands
    svc.handleCommand({ action: 'set_speed', value: 600 });     // must land above 1x for the stamp
    var orig = svc.assembleSnapshot;
    svc.assembleSnapshot = function () {
      var snap = orig.call(this);
      snap.true_state = Object.assign({}, snap.true_state,
        { speed_hold: 'accumulator window open — arm the accumulators before accelerating again' });
      return snap;
    };
    var out;
    try { out = svc._assembleWithInstructor(); } finally { svc.assembleSnapshot = orig; }
    svc._broadcast(out);   // render() schedules its DOM work on the next rAF — read it after a wait
  });
  await page.waitForTimeout(300);
  var warpLine = await page.evaluate(function () {
    var svc = globalThis.RD.__dev.service();
    var el = document.getElementById('warpInfo');
    return { text: el ? el.textContent : null, hidden: el ? el.hidden : null, accel: svc.timeAcceleration };
  });
  if (warpLine.hidden || !/Held at real time/.test(warpLine.text || '') || warpLine.accel !== 1) {
    throw new Error('#686: the accumulator hold must still print under the speed bar on a real ' +
      'rising edge — accel ' + warpLine.accel + ', warpInfo "' + warpLine.text + '" (hidden=' + warpLine.hidden + ')');
  }
  log.push('warp line: "' + warpLine.text + '" (accel ' + warpLine.accel + 'x)');
  await page.evaluate(function () { globalThis.RD.__dev.service()._prevSpeedHold = null; });

  await page.evaluate(function () { globalThis.RD.__dev.service().handleCommand({ action: 'stop_checklist' }); });
  return log.join('\n') + '\n';
}

/* #694 — A WALKTHROUGH EVENT STEP FIRES A FAILURE AND PAUSES THE SIM SO THE PLAYER CAN SEE IT.
 *
 * *(OWNER, 2026-09-09: "have a step that explains what will happen. Then when the user presses
 * continue they can see it happening ... sim pauses.")* `_checklistFire` (instructor_layer.js)
 * and firing-on-Continue were already built (#670); the pause had NO PATH at all — flagged in
 * this issue's own investigation as a HOLLOW-CHECK RISK, because `SimulationService.
 * advanceCycles` forces `running = true` around every tick, so a Node harness driving the
 * service directly cannot see a service-level pause. A gate written there could only assert
 * that the snapshot carries the REQUEST, never that the clock actually stopped or the board
 * actually froze. Only a browser, running the real setTimeout-driven loop, can see either.
 *
 * NO SHIPPED STEP AUTHORS `pause` YET (#693 is the first content consumer) — driven from a
 * fixture here, on the live `pwr_heatup` checklist, and said so per CLAUDE.md's own rule
 * against a dark wire (a capability nothing exercises reading as a working feature).
 * `porv_indicator_stuck_closed` is a benign, real pwr2 failure id (an instrument sticks; no
 * hydraulics move) so the fixture cannot itself trip the plant into an unrelated failure mode.
 *
 * POSITIVE CONTROL FIRST: the clock is read advancing normally before the fixture is armed, so
 * a page that could not tick at all would not pass this by accident. Then, in order: the fixture
 * step is armed with `inject`+`pause`; the NEXT broadcast (the tick after entry — see the
 * ordering note in `_checklistFire`) fires the failure AND stops the clock; the sim_time is read
 * again after a wait to prove no further ticks land (not just that `svc.running` reads false);
 * the board carries `.bd-frozen`; Continue is lit; the failure actually landed in the control
 * layer (`getActiveFailures()`), proving the event half of the path, not only the pause half;
 * Continue is pressed, which must both resume ticking and advance the checklist off the step.
 *
 * PROVED RED BY INJECTION, 2026-09-10 (`inbox/694/inject_pause.js a|b`): with `st.pause`'s
 * early return in `_stepChecklist` neutered, the event still lands (a fresh, non-lagged read
 * confirms it) but Continue never lights and the board never freezes — every assertion from
 * "svc.running never went false" onward fails, correctly. Separately, with
 * `_serviceInstructorRequests`'s `this.stop()` call removed, THIS test still PASSES — measured,
 * not assumed: `ui/app.js`'s own `render()` detects `checklist.paused` and calls
 * `pauseSim('walkthrough')`, which stops the service anyway (the SAME defense-in-depth pattern
 * already established for `metadata.running` staleness, right above this block). That is a
 * real UI safety net, not a bug in the test — but it means THIS gate alone cannot tell "the
 * service stops itself" from "the UI compensates for a service that doesn't", which is exactly
 * why `_serviceInstructorRequests` calling `stop()` is proved by `test/run_checklist.js`
 * section 11 instead: that harness drives `tick()` directly with no UI, no `app.js`, no
 * `render()` loaded at all, and DOES go red under the same injection (`svc.running` stays
 * `true`). The two gates are not redundant; each is blind to what the other proves. Both
 * injections restored before this file was committed. */
async function testWalkthroughEventPause(page) {
  var log = [];
  var base = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&run=1&dev=1';
  await page.goto(base, { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);

  var started = await page.evaluate(function () {
    try {
      var svc = globalThis.RD.__dev.service();
      svc.attentionStops = false;   // a step-boundary dropout must not snap speed under the fixture
      var r = svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_heatup' });
      return { ok: !(r && r.type === 'error'), msg: r && r.message };
    } catch (e) { return { ok: false, msg: String(e) }; }
  });
  if (!started.ok) throw new Error('#694 fixture: start_checklist failed — ' + started.msg);
  /* The run card is drawn behind `cklState.view === 'run'` (ui/app.js :3771,
   * `cur.hidden = cklState.view !== 'run'`) — a UI-local flag `startChecklist()` sets, which
   * driving the command straight through `svc.handleCommand` (above, matching #627) never
   * touches. So the Continue button EXISTS in the DOM (a raw querySelector finds it and #627
   * never needed more) but is not VISIBLE, and Playwright's .click() below would hang on
   * "element is not visible" — measured. Reach it exactly the way a player would after
   * starting a checklist from elsewhere: open the Walkthroughs tab and click the
   * already-running procedure's own entry, which hits `startChecklist`'s "already running"
   * branch (sets the view to 'run' and switches to the Instructor tab) rather than restarting it. */
  await page.click('#tabbar [data-tab="checklists"]');
  await page.waitForSelector('[data-ckl-start="pwr_heatup"]', { timeout: 10000 });
  await page.click('[data-ckl-start="pwr_heatup"]');
  // The Continue button must be ON SCREEN (not just in the DOM) for the click below to
  // land — same wait #627 uses: the Instructor tab active, with the checklist rendered.
  await page.waitForFunction(function () {
    var b = document.querySelector('#tabbar button.on');
    return !!b && b.getAttribute('data-tab') === 'instructor' && !!document.querySelector('.ckl-step');
  }, { timeout: 15000, polling: 200 });

  async function read() {
    return await page.evaluate(function () {
      var svc = globalThis.RD.__dev.service();
      var mk = document.querySelector('[data-ckl-check]');
      return {
        running: svc.running,
        simTime: svc.simTime,
        frozen: !!document.querySelector('.pwr-board-stage.bd-frozen'),
        continueReady: !!(mk && !mk.disabled),
        activeFailures: (svc.layer.getActiveFailures() || []).map(function (f) { return f.id; }),
        idx: svc.instructor.checklist ? svc.instructor.checklist.idx : null,
      };
    });
  }

  // ---- positive control: the plant is genuinely ticking before the fixture is armed ----
  var t0 = await read();
  await page.waitForTimeout(600);
  var t1 = await read();
  if (!(t1.simTime > t0.simTime) || !t1.running) {
    throw new Error('#694 control: the plant was not ticking before the fixture armed — ' +
      JSON.stringify(t0) + ' -> ' + JSON.stringify(t1));
  }
  log.push('control: ticking normally, sim_time ' + t0.simTime.toFixed(2) + ' -> ' + t1.simTime.toFixed(2));

  // ---- arm the fixture on the ACTIVE step (idx already past its own entry tick) --------
  await page.evaluate(function () {
    var c = globalThis.RD.__dev.service().instructor.checklist;
    var st = c.proc.steps[c.idx];
    st.inject = [{ failure: 'porv_indicator_stuck_closed' }];
    st.pause = true;
  });

  // ---- the fire+pause lands within one broadcast; wait well past it, then prove the
  // clock has ACTUALLY stopped — not merely that one read caught it mid-tick ----------------
  await page.waitForTimeout(500);
  var paused1 = await read();
  await page.waitForTimeout(700);
  var paused2 = await read();
  if (paused1.running || paused2.running) {
    throw new Error('#694: svc.running never went false — ' + JSON.stringify(paused1) + ' / ' + JSON.stringify(paused2));
  }
  if (paused2.simTime !== paused1.simTime) {
    throw new Error('#694: sim_time still advancing while paused (' + paused1.simTime + ' -> ' +
      paused2.simTime + ') — the browser timer loop is still rescheduling');
  }
  if (!paused2.frozen) {
    throw new Error('#694: the board never carried .bd-frozen while the walkthrough paused it — ' + JSON.stringify(paused2));
  }
  if (!paused2.continueReady) {
    throw new Error('#694: Continue never lit after the paused event fired — ' + JSON.stringify(paused2));
  }
  if (paused2.activeFailures.indexOf('porv_indicator_stuck_closed') < 0) {
    throw new Error('#694: the step\'s own inject never reached the control layer — active failures [' +
      paused2.activeFailures.join(',') + ']');
  }
  log.push('paused: running=false across ' + (700) + ' ms, sim_time held at ' + paused2.simTime.toFixed(2) +
    ', .bd-frozen present, Continue lit, active_failures ' + JSON.stringify(paused2.activeFailures));

  // ---- Continue: must resume ticking AND advance the checklist off the event step ------
  await page.click('[data-ckl-check]');
  await page.waitForTimeout(600);
  var resumed = await read();
  if (!resumed.running) {
    throw new Error('#694: pressing Continue on a walkthrough-paused step did not resume the clock — ' + JSON.stringify(resumed));
  }
  if (!(resumed.simTime > paused2.simTime)) {
    throw new Error('#694: sim_time did not advance after Continue resumed the clock — ' +
      paused2.simTime + ' -> ' + resumed.simTime);
  }
  if (resumed.idx <= paused2.idx) {
    throw new Error('#694: Continue did not advance the checklist off the paused step — idx ' +
      paused2.idx + ' -> ' + resumed.idx);
  }
  if (resumed.frozen) throw new Error('#694: the board stayed .bd-frozen after Continue resumed the sim');
  log.push('resumed: running=true, sim_time ' + paused2.simTime.toFixed(2) + ' -> ' + resumed.simTime.toFixed(2) +
    ', checklist idx ' + paused2.idx + ' -> ' + resumed.idx + ', .bd-frozen cleared');

  await page.evaluate(function () { globalThis.RD.__dev.service().handleCommand({ action: 'stop_checklist' }); });
  return log.join('\n') + '\n';
}

/* #711 — THE WALKTHROUGH HOLD SURVIVES RESET, A PLANT SWITCH, AND A NEW CHECKLIST.
 *
 * `render()`'s own `.paused` check above (the #694 take) never had a matching release: Reset
 * (`doReset`), a plant switch (`switchEngine`) and picking a different walkthrough
 * (`startChecklist`) all end or replace the running checklist without ever naming
 * `'walkthrough'` to `releaseHold`, so the next plant loaded FROZEN with no caution on screen —
 * silently fixed only by the player happening to press ▶ (`resumeSim` clears every hold).
 *
 * THE FIX IS THE SAME LIVE CHECK RUN BACKWARDS, not three new `releaseHold` calls (the #710
 * shape): `render()` now also lets go the instant `checklist.paused` reads false while the hold
 * is still standing, which is true whether the checklist was cleared entirely (Reset, a plant
 * switch — both go through `simulation_service.js` `selectPlant` -> `instructor.unload()`) or
 * replaced by a fresh one (`instructor_layer.js` `loadChecklist` always starts `paused: false`).
 *
 * WHY A BROWSER GATE: same reason as #694 immediately above — `SimulationService.advanceCycles`
 * forces `running = true` around its own loop, so a Node harness can never see a service-level
 * pause fail to lift.
 *
 * THE PROOF IS BEHAVIOURAL, NOT A FLAG READ. Each of the three exits is driven through the
 * real UI (the Session menu's Reset, its Free Play button, the Checklists tab's own start
 * button) and then the CLOCK is read twice with a wait between — not just `service.running`
 * once, which a stale read or a one-tick flicker could pass by accident — to prove sim_time is
 * genuinely advancing again, the same standard #694's own positive control holds itself to. A
 * fix that left the hold PINNED (never lifted at all) fails every one of these; a fix that
 * over-corrected into clearing the whole map would still pass here — that half is `deliberate`
 * (a `user` hold surviving a plant switch is `testMissionCloseResumes`'s own regression pin
 * immediately above in this file, for `plant_change`; this fix touches no other reason).
 *
 * PROVED RED BY INJECTION, 2026-09-12: with the `else if (pausedFor('walkthrough'))
 * releaseHold('walkthrough')` line removed (i.e. back to the #694-only take with no release),
 * all three sections below fail — the plant stays `.bd-frozen` and `sim_time` never advances
 * past the fixture's pause, through Reset, the plant switch, and the new checklist alike.
 * Restored before this file was committed. */
async function testWalkthroughHoldReleasedOnExit(page) {
  var log = [];
  var base = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&run=1&dev=1';

  // Load a fresh plant, start `pwr_heatup`, and arm the same benign fixture #694 uses
  // (an instrument-only failure so arming it cannot itself trip the plant) on a `pause`
  // step — then confirm the freeze actually landed before touching any exit.
  async function armPausedWalkthrough() {
    await page.goto(base, { waitUntil: 'networkidle', timeout: 90000 });
    await dismissMission(page);
    await waitBoardLive(page, 20000);
    var started = await page.evaluate(function () {
      try {
        var svc = globalThis.RD.__dev.service();
        svc.attentionStops = false;
        var r = svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_heatup' });
        return { ok: !(r && r.type === 'error'), msg: r && r.message };
      } catch (e) { return { ok: false, msg: String(e) }; }
    });
    if (!started.ok) throw new Error('#711 fixture: start_checklist failed — ' + started.msg);
    await page.evaluate(function () {
      var c = globalThis.RD.__dev.service().instructor.checklist;
      var st = c.proc.steps[c.idx];
      st.inject = [{ failure: 'porv_indicator_stuck_closed' }];
      st.pause = true;
    });
    await page.waitForTimeout(900);   // the fire+pause lands within one broadcast (#694)
    var f = await read();
    if (f.running || !f.frozen || !f.playPaused) {
      throw new Error('#711 fixture: pwr_heatup never froze the plant before the exit was tried — ' + JSON.stringify(f));
    }
  }

  async function read() {
    return await page.evaluate(function () {
      var svc = globalThis.RD.__dev.service();
      return {
        running: svc.running,
        simTime: svc.simTime,
        frozen: !!document.querySelector('.pwr-board-stage.bd-frozen'),
        playPaused: !!(document.getElementById('playBtn') && document.getElementById('playBtn').classList.contains('paused')),
      };
    });
  }

  // Read twice with a wait between and require sim_time to have actually moved — the
  // behavioural proof the comment above calls for, not a one-shot flag read.
  async function assertGenuinelyRunning(tag) {
    var a = await read();
    await page.waitForTimeout(600);
    var b = await read();
    if (a.frozen || b.frozen || a.playPaused || b.playPaused || !a.running || !b.running) {
      throw new Error('#711: ' + tag + ' left the walkthrough hold standing — ' + JSON.stringify(a) + ' / ' + JSON.stringify(b));
    }
    if (!(b.simTime > a.simTime)) {
      throw new Error('#711: ' + tag + ' reported running but sim_time never advanced (' +
        a.simTime + ' -> ' + b.simTime + ') — the release did not actually resume ticking');
    }
    return b;
  }

  // ---- gap 1: Session Reset (doReset, ui/app.js ~9423) --------------------------------
  await armPausedWalkthrough();
  await page.click('#mainMenuBtn');
  await page.waitForSelector('#missionOverlay', { state: 'visible', timeout: 5000 });
  await page.click('[data-mreset]');   // arm
  await page.click('[data-mreset]');   // confirm -> doReset(true)
  await page.waitForTimeout(500);
  var r1 = await assertGenuinelyRunning('Session Reset out of a paused walkthrough');
  log.push('Reset: plant runs again, sim_time advancing past ' + r1.simTime.toFixed(2) + ', .bd-frozen cleared');

  // ---- gap 2: a plant switch (switchEngine, ui/app.js ~9362, via Free Play) -----------
  await armPausedWalkthrough();
  await page.click('#mainMenuBtn');
  await page.waitForSelector('#missionOverlay', { state: 'visible', timeout: 5000 });
  await page.click('[data-mfree]');
  await page.waitForTimeout(500);
  var r2 = await assertGenuinelyRunning('a plant switch out of a paused walkthrough');
  log.push('Plant switch: plant runs again, sim_time advancing past ' + r2.simTime.toFixed(2) + ', .bd-frozen cleared');

  // ---- gap 3: picking a DIFFERENT walkthrough (startChecklist, ui/app.js ~4805) -------
  await armPausedWalkthrough();
  await page.click('#tabbar [data-tab="checklists"]');
  await page.waitForSelector('[data-ckl-start="pwr_startup"]', { timeout: 10000 });
  await page.click('[data-ckl-start="pwr_startup"]');
  await page.waitForTimeout(500);
  var r3 = await assertGenuinelyRunning('starting a different walkthrough over a paused one');
  log.push('New walkthrough: plant runs again, sim_time advancing past ' + r3.simTime.toFixed(2) + ', .bd-frozen cleared');

  await page.evaluate(function () { globalThis.RD.__dev.service().handleCommand({ action: 'stop_checklist' }); });
  return log.join('\n') + '\n';
}

/* THE RECOMMENDED SPEED RUNG LIGHTS AND THE STRIP DOES NOT (#743).
 *
 * *(OWNER, 2026-09-13 playtest: "instead of highlighting all the speed controls, just highlight the
 * one that is suggested.")*
 *
 * THIS IS A DARK-WIRE PROOF AND THE WIRE WAS ACTUALLY DARK FOR A DAY. `applyCklSpeedGlow` shipped
 * on 2026-09-12 adding `.ckl-speed-rung` to the recommended button with NO CSS RULE BEHIND IT — the
 * class was applied, every source read agreed the rung was "marked", and the rung was not painted.
 * So this check asserts the PAINTED EFFECT, never the class: `getComputedStyle(rung).boxShadow` has
 * to carry something, and it has to be an INSET, because `.speed` is `overflow: hidden` and an
 * outer ring on a rung is clipped away to nothing while the class and the rule both still read
 * correctly. Reading the class alone would pass on the exact defect this fixes.
 *
 * THE NEGATIVE HALF IS THE OWNER'S ACTUAL COMPLAINT: the strip itself must carry NO glow. Without
 * it this passes on the old behaviour, which also put a class on the rung.
 *
 * Injection-proven three ways: dropping the `.speed button.ckl-speed-rung` rule from shell.css
 * leaves the class applied and reds the painted-shadow assertion; changing the rule's `inset` to an
 * outer ring reds the inset assertion; re-adding `bar.classList.add('ckl-step-glow')` in app.js
 * reds the strip assertion and nothing else.
 */
async function testSpeedRungGlowRendered(page) {
  var log = [];
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&run=1&dev=1',
                  { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);

  var started = await page.evaluate(function () {
    try {
      var svc = globalThis.RD.__dev.service();
      svc.attentionStops = false;
      var r = svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_heatup' });
      return { ok: !(r && r.type === 'error'), msg: r && r.message };
    } catch (e) { return { ok: false, msg: String(e) }; }
  });
  if (!started.ok) throw new Error('#743 fixture: start_checklist failed — ' + started.msg);
  await page.click('#tabbar [data-tab="checklists"]');
  await page.waitForSelector('[data-ckl-start="pwr_heatup"]', { timeout: 10000 });
  await page.click('[data-ckl-start="pwr_heatup"]');
  await page.waitForFunction(function () {
    var b = document.querySelector('#tabbar button.on');
    return !!b && b.getAttribute('data-tab') === 'instructor' && !!document.querySelector('.ckl-step');
  }, { timeout: 15000, polling: 200 });

  /* Land on a step that actually asks for a long hold. Chosen from the procedure rather than typed
   * here, so a re-authored checklist cannot leave this pointing at a step with no recommendation. */
  var jumped = await page.evaluate(function () {
    var c = globalThis.RD.__dev.service().instructor.checklist;
    var target = -1;
    for (var i = 0; i < c.proc.steps.length; i++) {
      var s = c.proc.steps[i];
      if ((+s.hold || 0) >= 180 && s.wait_hint !== false) { target = i; break; }
    }
    if (target < 0) return { ok: false };
    c.idx = target; c.stepAt = null; c.awaitingAck = false;
    return { ok: true, idx: target, hold: +c.proc.steps[target].hold };
  });
  if (!jumped.ok) throw new Error('#743 fixture: pwr_heatup authors no step with hold >= 180');

  /* THE ONE UPSTREAM FACT THIS CHECK IS ABOUT: is the step's criterion met yet? (#796.) Jumping
   * the index lands on a step the plant may ALREADY satisfy — measured on pwr_heatup, it does, so
   * the card read "Wait complete" and no rung was cued, which is the correct behaviour for a
   * satisfied step and useless as a fixture for an unsatisfied one. `awaitingAck` cannot be poked
   * directly (`c.awaitingAck = !!met` is rewritten every `_stepChecklist` tick), so the flag is
   * planted on the SNAPSHOT and the real `_assembleWithInstructor` → `_broadcast` → `render`
   * chain carries it — #686's held-speed shape. Installed once, flipped by `window.__wtMet`, so
   * the same wrapper serves the "still waiting" half and the "wait satisfied" half below. */
  await page.evaluate(function () {
    var svc = globalThis.RD.__dev.service();
    window.__wtMet = false;
    var orig = svc._instructorBlock.bind(svc);
    svc._instructorBlock = function () {
      var b = orig();
      if (b && b.checklist) { b.checklist.acc_met = window.__wtMet; b.checklist.awaiting_ack = window.__wtMet; }
      return b;
    };
  });
  await page.waitForTimeout(2500);

  var seen = await page.evaluate(function () {
    var bar = document.getElementById('speed');
    var rung = bar ? bar.querySelector('.ckl-speed-rung') : null;
    var barCs = bar ? getComputedStyle(bar) : null;
    return {
      nRungs: bar ? bar.querySelectorAll('.ckl-speed-rung').length : -1,
      nButtons: bar ? bar.querySelectorAll('button').length : -1,
      speed: rung ? rung.getAttribute('data-speed') : null,
      rungShadow: rung ? getComputedStyle(rung).boxShadow : null,
      rungAnim: rung ? getComputedStyle(rung).animationName : null,
      barGlowClass: bar ? bar.classList.contains('ckl-step-glow') : null,
      barShadow: barCs ? barCs.boxShadow : null,
      rungOn: rung ? rung.classList.contains('on') : null,                       /* #796 */
      accel: globalThis.RD.__dev.service().timeAcceleration,                     /* #796 */
      note: (document.querySelector('.warp-info') || {}).textContent || ''
    };
  });

  if (seen.nRungs !== 1) {
    throw new Error('#743: expected exactly ONE recommended rung on a step with hold ' +
      jumped.hold + ' s, found ' + seen.nRungs + ' of ' + seen.nButtons + ' — ' + JSON.stringify(seen));
  }
  /* THE PAINTED EFFECT, not the class. A marker class with no rule behind it is what #743 fixes. */
  if (!seen.rungShadow || seen.rungShadow === 'none' || !/\d/.test(seen.rungShadow)) {
    throw new Error('#743 DARK WIRE: the rung carries .ckl-speed-rung but paints no box-shadow — ' +
      JSON.stringify(seen));
  }
  if (!/inset/.test(seen.rungShadow)) {
    throw new Error('#743: the rung glow is an OUTER shadow, which `.speed { overflow: hidden }` ' +
      'clips away to nothing — it must be an inset. ' + JSON.stringify(seen));
  }
  /* #796: THE WALKTHROUGH HAS ALREADY PRESSED IT, so the rung arrives `.on` and NOT pulsing —
   * `.ckl-speed-rung.on { animation: none }` is what turns the cue off, the same rule that used to
   * fire only after the player's own click. The MARK must survive (it is the one thing on the bar
   * that says which rung belongs to this step); the PULSE must not, because there is nothing left
   * to act on. The pulse's own assertion moved down to the override block, which is now the only
   * state where a press is still owed. */
  if (!seen.rungOn) {
    throw new Error('#796: the walkthrough did not take the clock to its own recommended rung — ' +
      'expected ' + seen.speed + '× selected, ' + JSON.stringify(seen));
  }
  if (+seen.speed !== seen.accel) {
    throw new Error('#796: the clock is at ' + seen.accel + '× on a step whose rung is ' +
      seen.speed + '× — the walkthrough is meant to set it. ' + JSON.stringify(seen));
  }
  if (seen.rungAnim !== 'none') {
    throw new Error('#796: the rung is PULSING while the plant is already on it (' + seen.rungAnim +
      ') — an "act on this" cue with nothing to act on. ' + JSON.stringify(seen));
  }
  /* THE OWNER'S COMPLAINT, ASSERTED. Without this the check passes on the old whole-strip form. */
  if (seen.barGlowClass || (seen.barShadow && seen.barShadow !== 'none')) {
    throw new Error('#743: the speed STRIP is still lit ("instead of highlighting all the speed ' +
      'controls, just highlight the one that is suggested") — ' + JSON.stringify(seen));
  }
  log.push('step ' + (jumped.idx + 1) + ' (hold ' + jumped.hold + ' s): rung ' + seen.speed +
    '× of ' + seen.nButtons + ' marked, walkthrough took the clock to ' + seen.accel +
    '×, animation=' + seen.rungAnim + ' (nothing left to press)');

  /* A PAUSE MUST NOT STRAND THE STEP AT 1× (#796, quality pass 2026-09-20). THE FIRST CUT DID:
   * the act-once latch was set and kept across the pause, `pauseSim` stops the broadcasts so the
   * driver does not run, and `resumeSim` forces 1× outside it (#691) — so the first broadcast
   * back matched the latch, returned, and left the clock at real time for the rest of a step the
   * walkthrough was meant to be fast-forwarding. Silent, and reachable by the single most ordinary
   * interaction there is.
   *
   * REAL PRESSES OF THE REAL BUTTON (`#playBtn` toggles on `service.running`), never `service.stop()`
   * — the defect lives in the UI's own pause path and a direct service call skips `pauseWhy`,
   * which is half of what the driver reads. */
  await page.click('#playBtn');
  await page.waitForTimeout(400);
  var paused = await page.evaluate(function () {
    var svc = globalThis.RD.__dev.service();
    return { running: svc.running, accel: svc.timeAcceleration };
  });
  if (paused.running) throw new Error('#796 fixture: #playBtn did not pause — ' + JSON.stringify(paused));
  await page.click('#playBtn');
  await page.waitForTimeout(1500);
  var resumed = await page.evaluate(function (sp) {
    var b = document.querySelector('#speed [data-speed="' + sp + '"]');
    return { running: globalThis.RD.__dev.service().running,
             accel: globalThis.RD.__dev.service().timeAcceleration,
             on: b ? b.classList.contains('on') : null };
  }, seen.speed);
  if (resumed.accel !== +seen.speed) {
    throw new Error('#796: a pause/resume stranded the step at ' + resumed.accel + '× — the ' +
      'walkthrough must re-take its own rung (' + seen.speed + '×) on resume. ' +
      JSON.stringify(resumed));
  }
  log.push('  pause + resume: clock back to ' + resumed.accel + '× (the step\'s rung, not the ' +
    'player\'s last selection — #691 is about a stale player choice, not the step\'s rate)');

  /* THE PLAYER TAKES THE BAR BACK, AND KEEPS IT (#796). A REAL CLICK on 1×, so the app's own
   * speed handler runs. Two claims, and both are the feature rather than styling:
   *   - the recommended rung PULSES AGAIN. This is #743's original assertion, moved to the only
   *     state that can still produce it — the cue means "act on this", and after an override
   *     there genuinely is something to press. It is CSS (`.ckl-speed-rung.on { animation: none }`)
   *     with no second JavaScript path, so no source read of app.js can see it and a broken `.on`
   *     selector would leave the rung pulsing for ever with every other check green.
   *   - the override STANDS. `syncCklAutoSpeed` acts once per (step, wanted speed, hold), so the
   *     clock must still read 1× several broadcasts later. Without that guard the walkthrough
   *     re-presses its rung on the next broadcast and the player cannot slow anything down — the
   *     worst way to build this, and invisible to a single-sample read. */
  var pressed = await page.evaluate(function () {
    var b = document.querySelector('#speed [data-speed="1"]');
    if (!b) return { err: '1× rung missing' };
    b.click();
    return { ok: true };
  });
  if (pressed.err) throw new Error('#796 fixture: ' + pressed.err);
  await page.waitForTimeout(1500);
  var after = await page.evaluate(function (sp) {
    var b = document.querySelector('#speed [data-speed="' + sp + '"]');
    return { accel: globalThis.RD.__dev.service().timeAcceleration,
             on: b ? b.classList.contains('on') : null,
             rung: b ? b.classList.contains('ckl-speed-rung') : null,
             anim: b ? getComputedStyle(b).animationName : null };
  }, seen.speed);
  if (after.accel !== 1) {
    throw new Error('#796: the walkthrough overrode the player — clock back to ' + after.accel +
      '× after a deliberate 1× press. Auto-speed must act ONCE per step. ' + JSON.stringify(after));
  }
  if (!after.rung || after.anim !== 'cklRungGlow') {
    throw new Error('#743/#796: the recommended rung must be marked and PULSING once the player ' +
      'is off it (owner: pulsing for a user control) — ' + JSON.stringify(after));
  }
  log.push('  player pressed 1×: clock stays ' + after.accel + '×, rung ' + seen.speed +
    '× marked=' + after.rung + ' and pulsing again (' + after.anim + ')');

  /* …AND THE OVERRIDE SURVIVES A PAUSE, which is the other half of the fix above and the reason
   * it needed a second memory rather than the latch. Dropping the latch on a stopped clock (so a
   * pause cannot strand the step) would, on its own, ALSO throw away a rung the player chose —
   * resume would re-apply the walkthrough's 60× over their deliberate 1×. `cklAuto.over` is
   * keyed on the same step, so it outlives the pause the latch does not. */
  await page.click('#playBtn');
  await page.waitForTimeout(400);
  await page.click('#playBtn');
  await page.waitForTimeout(1500);
  var overHeld = await page.evaluate(function () {
    return { running: globalThis.RD.__dev.service().running,
             accel: globalThis.RD.__dev.service().timeAcceleration };
  });
  if (overHeld.accel !== 1) {
    throw new Error('#796: a pause/resume threw away the player\'s override — clock went to ' +
      overHeld.accel + '× over a deliberate 1× press. ' + JSON.stringify(overHeld));
  }
  log.push('  pause + resume after the override: clock still ' + overHeld.accel + '× (theirs)');

  /* AND IT COMES BACK DOWN WHEN THE WAIT IS SATISFIED (#796) — the half the owner asked for
   * ("it should auto drop down to the speed the step should be played at"). Poked the same way
   * the step index is poked above: `awaitingAck` is what the instructor sets when the criterion
   * is met and it is holding for Continue, and the snapshot carries it as `awaiting_ack`.
   * The clock has to be ABOVE 1× first or this proves nothing, so the rung is re-pressed. */
  await page.evaluate(function (sp) {
    var b = document.querySelector('#speed [data-speed="' + sp + '"]');
    if (b) b.click();
  }, seen.speed);
  await page.waitForTimeout(600);
  var metSetup = await page.evaluate(function () {
    var svc = globalThis.RD.__dev.service();
    var before = svc.timeAcceleration;
    window.__wtMet = true;          // the wrapper installed above starts reporting the step met
    return { before: before };
  });
  if (metSetup.before <= 1) {
    throw new Error('#796 fixture: re-pressing rung ' + seen.speed + '× left the clock at ' +
      metSetup.before + '× — the drop assertion below would prove nothing');
  }
  await page.waitForTimeout(1500);
  var dropped = await page.evaluate(function () {
    var bar = document.getElementById('speed');
    return { accel: globalThis.RD.__dev.service().timeAcceleration,
             nRungs: bar ? bar.querySelectorAll('.ckl-speed-rung').length : -1,
             note: (document.querySelector('.warp-info') || {}).textContent || '' };
  });
  if (dropped.accel !== 1) {
    throw new Error('#796: the wait is satisfied and the clock is still at ' + dropped.accel +
      '× — every plant-second past the criterion is overshoot. ' + JSON.stringify(dropped));
  }
  if (dropped.nRungs !== 0) {
    throw new Error('#796: a rung is still cued on a satisfied step — it points at a ' +
      'fast-forward that would now be overshoot. ' + JSON.stringify(dropped));
  }
  log.push('  criterion met: clock ' + metSetup.before + '× → ' + dropped.accel + '×, ' +
    dropped.nRungs + ' rungs cued; line reads "' + dropped.note.trim() + '"');
  log.push('  rung box-shadow: ' + seen.rungShadow);
  log.push('  strip: class ' + seen.barGlowClass + ', box-shadow ' + seen.barShadow);
  log.push('  note under the strip: ' + seen.note.trim());

  /* ENDING THE WALKTHROUGH HANDS THE CLOCK BACK (#796, quality pass 2026-09-20). `stop_checklist`
   * tears the checklist down and never touches `timeAcceleration`, so a leg ended mid-wait left
   * the plant running at a rung AUTO chose with nothing tracking it any more — before #796 that
   * took a deliberate 600× press by the player, so it is a runaway the change itself made easy to
   * reach. The step is put back into its waiting state first so auto re-takes the rung: a
   * hand-back asserted from a clock already at 1× would prove nothing. */
  /* A FRESH RUN OF THE LEG, because the flow above has spent this step's override: the player
   * pressed a rung on it, `cklAuto.over` is keyed on (step, wanted speed, hold), and auto
   * correctly stands down for the rest of that step. Tearing the checklist down is what clears
   * that memory — which is itself the behaviour being relied on here. */
  await page.evaluate(function () {
    var svc = globalThis.RD.__dev.service();
    window.__wtMet = false;
    svc.handleCommand({ action: 'stop_checklist' });
    svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_heatup' });
  });
  await page.waitForTimeout(800);
  await page.evaluate(function (idx) {
    var c = globalThis.RD.__dev.service().instructor.checklist;
    c.idx = idx; c.stepAt = null; c.awaitingAck = false;
  }, jumped.idx);
  await page.waitForTimeout(2000);
  var beforeStop = await page.evaluate(function () { return globalThis.RD.__dev.service().timeAcceleration; });
  if (beforeStop <= 1) {
    throw new Error('#796 fixture: the step did not go back to fast-forwarding (' + beforeStop +
      '×) — the hand-back assertion below would prove nothing');
  }
  await page.evaluate(function () { globalThis.RD.__dev.service().handleCommand({ action: 'stop_checklist' }); });
  await page.waitForTimeout(1500);
  var handedBack = await page.evaluate(function () {
    return { accel: globalThis.RD.__dev.service().timeAcceleration,
             ckl: !!globalThis.RD.__dev.service().instructor.checklist };
  });
  if (handedBack.ckl) throw new Error('#796 fixture: stop_checklist left a checklist running');
  if (handedBack.accel !== 1) {
    throw new Error('#796: the walkthrough ended at ' + beforeStop + '× and left the plant running ' +
      'at ' + handedBack.accel + '× with nothing tracking it. ' + JSON.stringify(handedBack));
  }
  log.push('  walkthrough ended at ' + beforeStop + '×: clock handed back to ' + handedBack.accel + '×');
  return log.join(String.fromCharCode(10)) + String.fromCharCode(10);
}

/* #685 — THE "WATCH THIS" GLOW, PROVED TO REACH THE BOARD FROM A REAL STEP'S `hl_watch`.
 *
 * WHY A BROWSER GATE AND NOT A SOURCE SCAN. `run_manual_controls` checks that every `hl_watch`
 * label is in the board's vocabulary; it cannot check that anything ever APPLIES the class.
 * This repo's standing trap is the DARK WIRE — a field authored, documented, read by a gate,
 * and never passed to the renderer (#507 wave 6 shipped three, #540 a fourth for six days) —
 * and `applyCklWatchGlow` is exactly that shape: one caller, in a render path no Node harness
 * enters. So the claim asserted here is the EFFECT: a DOM element on the board wearing the
 * class, put there by the step's own list.
 *
 * REWRITTEN 2026-09-13 ON THE #743/#744 SEAM, and the rewrite is the point. The old form had a
 * "control" half that asserted `0 rings painted` on whatever step the checklist happened to be
 * sitting on when the run card opened — step 4, which authored no `hl_watch` when #743 wrote the
 * check. #744 gave that step two, the board correctly painted two, and the check reddened with a
 * message that said "a step that authors none" beside a payload reading `authored: 2`. The
 * message was the liar: the check never read `authored` at all, and its comment's claim that the
 * landing step was the FIRST step was already false when it shipped. A fixture is what that was —
 * an incidental property of one step pool, in a gate whose whole subject is the step pool.
 *
 * WHAT IS ASSERTED NOW IS THE INVARIANT, ON EVERY STEP OF THE LEG: the number of elements wearing
 * each class equals the number of labels the step authors for it. That is strictly stronger than
 * counting one step's rings, and it catches the class of defect #744 had to find BY HAND —
 * `run_manual_controls` reddens when one LABEL appears in both lists and says nothing at all when
 * two DIFFERENT labels resolve to the same board id, which silently drops the ring for the
 * control the step names first. `applyCklWatchGlow` skips any element the press list already
 * took, and `classList.add` is idempotent, so both of those defects land as `painted < authored`
 * and nothing else in the tree can see them.
 *
 * ONE LEG, NAMED, NOT ALL SIX — AND THE REASON HAS CHANGED, SO READ THIS BEFORE CITING IT. Until
 * 2026-09-14 the other legs were held out because eight of their steps still carried the
 * collision and would have reddened the sweep on content neither #743 nor #744 touched. **#745
 * fixed all eleven remaining sites in both pools and `run_manual_controls` now holds the SOURCE
 * side at zero**, so what keeps this constant at one leg is COST and the startLeg preconditions
 * of the other five, not known-red content. Widening it to a list is open work, not a blocker.
 *
 * KEEP THE TWO CORRECTIONS #745 WAS BUILT ON. The first sweep resolved through the board map and
 * produced one FALSE POSITIVE (`pwr_startup` 4): `RD.Highlight.resolve` consults the shell
 * overrides first and lands `1/M Plot Tool` and `Plot point` on different elements — in BOTH
 * panel states, measured here 2026-09-14, because `#oomWin` is built at init and merely
 * `display:none` and `querySelector` matches hidden elements, so the documented fallback to the
 * board map never fires for this label. It also MISSED `pwr_raise_power` 9, which authors no `hl`
 * at all and collided its `control` with its `hl_watch` — the sub-class `landOn` below already
 * handles correctly, and the reason it recomputes the press list rather than reading `hl`.
 *
 * ⚠ THE BLIND SPOT THIS SWEEP SHARES WITH THE STATIC GATE: it counts elements WEARING a class,
 * and a ring on the 1/M panel's plot button while that panel is `display:none` is counted and
 * invisible. Neither half can currently tell those apart.
 *
 * `pwr_tmi2_incident` is UNMEASURED by any DOM method: it carries `pause` steps, the panel stops
 * re-rendering with the clock, and a fixed-sleep harness reads the PREVIOUS step's DOM — which is
 * exactly why `landOn` below waits for the panel to match the model instead of sleeping. The list
 * is a constant so the gap is visible and one line wide, not an omission.
 *
 * THE NEGATIVE HALF IS LOAD-BEARING and now comes from another leg, because since #744 every
 * `pwr_heatup` step authors `hl_watch`: a step with press labels and no `hl_watch` must paint no
 * ring at all. Without it this passes on a renderer that puts one treatment on both lists, which
 * is the defect the whole issue is about. */
var WATCH_GLOW_LEG = 'pwr_heatup';

async function testWatchGlowRendered(page) {
  var log = [];

  /* ONE HELPER FOR BOTH LEGS: start a procedure and get the RUN CARD drawn. The two clicks are
   * #694's fixture verbatim — the card is behind `cklState.view === 'run'`, a UI-local flag that
   * `svc.handleCommand` never sets. */
  async function startLeg(pid, viaCard) {
    var started = await page.evaluate(function (p) {
      try {
        var svc = globalThis.RD.__dev.service();
        svc.attentionStops = false;
        var r = svc.handleCommand({ action: 'start_checklist', procedure_id: p });
        return { ok: !(r && r.type === 'error'), msg: r && r.message };
      } catch (e) { return { ok: false, msg: String(e) }; }
    }, pid);
    if (!started.ok) throw new Error('#685 fixture: start_checklist ' + pid + ' failed — ' + started.msg);
    /* THE CARD CLICKS ONLY WORK FOR THE FIRST LEG, and it is not a choice: a procedure whose
     * preconditions the plant does not meet is drawn `.ckl-gated` and HIDDEN, so waiting for its
     * launcher to be visible times out (measured on `pwr_startup`, 2026-09-13). They are needed
     * once, to put `cklState.view` into 'run'; the flag then stays put across a second
     * `start_checklist`, so every later leg is reached by the command alone. */
    if (viaCard) {
      await page.click('#tabbar [data-tab="checklists"]');
      await page.waitForSelector('[data-ckl-start="' + pid + '"]', { timeout: 10000 });
      await page.click('[data-ckl-start="' + pid + '"]');
    }
    await page.waitForFunction(function (p) {
      var b = document.querySelector('#tabbar button.on');
      var c = globalThis.RD.__dev.service().instructor.checklist;
      return !!b && b.getAttribute('data-tab') === 'instructor' &&
             !!document.querySelector('.ckl-step') && !!c && c.proc && c.proc.id === p;
    }, pid, { timeout: 15000, polling: 200 });
  }

  /* LAND ON A STEP AND WAIT FOR THE PANEL TO AGREE WITH THE MODEL, rather than sleeping. Only the
   * ACTIVE step is drawn (`data-ckl-step`), and `applyCklStepGlow` / `applyCklWatchGlow` run in
   * the same render pass that writes it — so the panel carrying the checklist's own index is
   * proof the glow pass for THIS step has run, which a fixed sleep can never say. It is also why
   * the read trusts the checklist's live `idx` over the index it asked for: on a running plant a
   * step whose acceptance is already met is advanced past, and asserting against the index we
   * TYPED would be asserting against a step that is not on the board. */
  async function landOn(i) {
    await page.evaluate(function (i) {
      var c = globalThis.RD.__dev.service().instructor.checklist;
      c.idx = i; c.stepAt = null; c.awaitingAck = false;
    }, i);
    await page.waitForFunction(function () {
      var c = globalThis.RD.__dev.service().instructor.checklist;
      var el = document.querySelector('.ckl-step[data-ckl-step]');
      return !!el && +el.getAttribute('data-ckl-step') === c.idx;
    }, { timeout: 15000, polling: 100 });
    return await page.evaluate(function () {
      var c = globalThis.RD.__dev.service().instructor.checklist;
      var st = c.proc.steps[c.idx];
      /* THE TWO LISTS AS `ui/app.js` BUILDS THEM (`stepHlLabels` / `stepWatchLabels`): the
       * authored array when it has entries, else the step's own `control`, never an "(observe)"
       * pseudo-control — and since the 2026-09-15 ring ruling (#653 S-3b) the `control` goes to the
       * PULSING list only when the step asks for a press, to the STEADY one when it does not.
       * Recomputed from the step rather than imported, so a change to that rule reddens this gate
       * instead of being mirrored into it. IT DID: this block is what went red when the rule
       * moved, and updating it is the maintenance the comment is asking for. */
      var ctl = (st.control && !/^\(observe/i.test(st.control)) ? st.control : null;
      var asks = !!(st.cmd || st.press_expected || (st.acc && st.acc.cmd) ||
                    (st.accs || []).some(function (e) { return e && e.cmd; }));
      var press = (st.hl && st.hl.length) ? st.hl.slice()
                : (ctl && asks) ? [ctl] : [];
      var watch = (st.hl_watch && st.hl_watch.length) ? st.hl_watch.slice()
                : (st.hl && st.hl.length) ? []
                : (ctl && !asks) ? [ctl] : [];
      return { idx: c.idx, watchLabels: watch, pressLabels: press,
               watch: document.querySelectorAll('.ckl-watch-glow').length,
               painted: document.querySelectorAll('.ckl-step-glow').length };
    });
  }

  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&run=1&dev=1',
                  { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);
  await startLeg(WATCH_GLOW_LEG, true);

  /* ---- THE INVARIANT, ON EVERY STEP OF THE LEG ------------------------------------------- */
  var n = await page.evaluate(function () {
    return globalThis.RD.__dev.service().instructor.checklist.proc.steps.length;
  });
  var seenIdx = {}, tw = 0, tp = 0;
  for (var i = 0; i < n; i++) {
    var r = await landOn(i);
    seenIdx[r.idx] = true; tw += r.watch; tp += r.painted;
    if (r.watch !== r.watchLabels.length) {
      throw new Error('#685: ' + WATCH_GLOW_LEG + ' step ' + (r.idx + 1) + ' authors ' +
        r.watchLabels.length + ' hl_watch labels (' + r.watchLabels.join(', ') + ') and the board ' +
        'painted ' + r.watch + ' .ckl-watch-glow elements. Every authored label must land on its ' +
        'OWN element: two labels resolving to one board id, or a label the press list already ' +
        'took, paints fewer rings than the step promises and nothing else in the tree can see it.');
    }
    if (r.painted !== r.pressLabels.length) {
      throw new Error('#685/#744: ' + WATCH_GLOW_LEG + ' step ' + (r.idx + 1) + ' authors ' +
        r.pressLabels.length + ' press labels (' + r.pressLabels.join(', ') + ') and the board ' +
        'painted ' + r.painted + ' .ckl-step-glow elements — when two labels share a board id the ' +
        'control the step names FIRST is the one that glows nothing (#744 found three by hand).');
    }
  }
  var missing = [];
  for (var j = 0; j < n; j++) if (!seenIdx[j]) missing.push(j + 1);
  if (missing.length) {
    throw new Error('#685: steps ' + missing.join(', ') + ' of ' + WATCH_GLOW_LEG + ' were never ' +
      'the active step during the sweep, so the invariant was not asserted on them — a gate that ' +
      'silently skips rows tests the rows it happened to reach.');
  }
  log.push(WATCH_GLOW_LEG + ': ' + n + '/' + n + ' steps, every authored label painted its own ' +
    'element (' + tw + ' .ckl-watch-glow and ' + tp + ' .ckl-step-glow over the leg)');

  /* THE WATCH RING'S PAINTED STYLE, READ HERE AND ASSERTED AT THE BOTTOM (#755 items 7/10). It has
   * to be taken on THIS leg: the negative leg below is chosen precisely because it authors no
   * `hl_watch`, so a read down there would find nothing and the assertion would pass vacuously —
   * which is how a check about a treatment ends up testing that an element is absent. */
  var watchTreat = await page.evaluate(function () {
    var w = document.querySelector('.ckl-watch-glow'); if (!w) return null;
    var cs = getComputedStyle(w), r = w.getBoundingClientRect();
    return { anim: cs.animationName, shadow: cs.boxShadow, outlineStyle: cs.outlineStyle,
             w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  });

  /* ---- THE NEGATIVE, ON REAL CONTENT ------------------------------------------------------
   * The step is found in the POOL, never typed here, so re-authoring moves the fixture instead of
   * breaking it — which is exactly what happened to the form this replaces. */
  var neg = await page.evaluate(function () {
    var procs = (globalThis.RD.MANUAL_PROCEDURES || {}).pwr2 || [];
    for (var a = 0; a < procs.length; a++) {
      for (var b = 0; b < (procs[a].steps || []).length; b++) {
        var st = procs[a].steps[b];
        if (st.hl_watch && st.hl_watch.length) continue;
        /* …and the watch fallback too (#653 S-3b): a step with no `hl_watch`, no `hl` and a
         * press-free `control` now paints a STEADY ring off that `control`, so it is no
         * longer a "0 watch rings" negative. Same mirror as `landOn` above. */
        var ctl = (st.control && !/^\(observe/i.test(st.control)) ? st.control : null;
        var asks = !!(st.cmd || st.press_expected || (st.acc && st.acc.cmd) ||
                      (st.accs || []).some(function (e) { return e && e.cmd; }));
        if (!(st.hl && st.hl.length) && ctl && !asks) continue;
        var press = (st.hl && st.hl.length) ? st.hl.slice()
                  : (ctl && asks) ? [ctl] : [];
        if (press.length) return { ok: true, pid: procs[a].id, idx: b, press: press };
      }
    }
    return { ok: false };
  });
  if (!neg.ok) {
    throw new Error('#685 fixture: no pwr2 step anywhere authors press labels and no hl_watch, so ' +
      '"authors none paints none" cannot be asserted on real content — re-point this half.');
  }
  await startLeg(neg.pid, false);
  var nr = await landOn(neg.idx);
  if (nr.idx !== neg.idx) {
    throw new Error('#685 fixture: ' + neg.pid + ' advanced off step ' + (neg.idx + 1) + ' to step ' +
      (nr.idx + 1) + ' before it could be read');
  }
  if (nr.watch !== 0) {
    throw new Error('#685: ' + nr.watch + ' watch ring(s) painted on ' + neg.pid + ' step ' +
      (nr.idx + 1) + ', which authors NO hl_watch (press labels: ' + nr.pressLabels.join(', ') +
      ') — the two treatments are not distinct.');
  }
  if (nr.painted === 0) {
    throw new Error('#685 fixture: ' + neg.pid + ' step ' + (nr.idx + 1) + ' painted no ' +
      '.ckl-step-glow either, so "0 rings" proves nothing about the lists being distinct — the ' +
      'step may simply not be reachable on the board.');
  }
  log.push('negative: ' + neg.pid + ' step ' + (nr.idx + 1) + ' authors 0 hl_watch and ' +
    nr.pressLabels.length + ' press labels (' + nr.pressLabels.join(', ') + ') -> 0 watch rings, ' +
    nr.painted + ' pulsing');

  /* ================================================================ THE TWO TREATMENTS THEMSELVES
   * (#755 items 7/10/19, OWNER RULING 2026-09-14, chosen from drawn options: "Both glow; pulse +
   * one static cue" —
   *     PRESS BUTTON      ((( soft pulsing glow )))   -> after press: steady glow, no pulse
   *     WATCH INDICATION  [ steady glow + 2px solid ring ]  (no dash, no motion)  )
   *
   * ⚠ EVERYTHING ABOVE COUNTS RINGS AND CANNOT SEE WHAT THEY LOOK LIKE. The counting invariant was
   * green for the whole life of the DASHED watch ring the owner then asked to have removed, and it
   * would be just as green if both treatments rendered identically — which is the one thing the
   * ruling is about. So read the PAINTED style off the real elements: `animationName`, the
   * box-shadow, and the outline the dash lived in.
   *
   * THE PRESS IS A REAL POINTER PRESS AT REAL COORDINATES, not `element.click()` and not a class
   * poked in by hand. `ui/app.js`'s `cklNotePress` matches the press GEOMETRICALLY — it has to,
   * because the ring is a `pointer-events: none` halo in a different subtree from the control
   * (measured; the DOM-relation forms of that handler both failed) — so a synthetic click with no
   * clientX/clientY would exercise nothing the player does. */
  var treat = await page.evaluate(function () {
    var p = document.querySelector('.ckl-step-glow'); if (!p) return { press: null };
    var cs = getComputedStyle(p), r = p.getBoundingClientRect();
    return { press: { anim: cs.animationName, shadow: cs.boxShadow, outlineStyle: cs.outlineStyle,
                      done: p.classList.contains('ckl-step-done'),
                      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
                      x: r.left + r.width / 2, y: r.top + r.height / 2 } };
  });
  treat.watch = watchTreat;
  if (!treat.watch || !treat.watch.w) {
    throw new Error('#755 items 7/10 fixture: no drawn .ckl-watch-glow was captured on ' +
      WATCH_GLOW_LEG + ' — the watch treatment cannot be asserted');
  }
  if (!treat.press || !treat.press.w) {
    throw new Error('#755 item 19 fixture: no drawn .ckl-step-glow on ' + neg.pid + ' step ' +
      (nr.idx + 1) + ' — the press treatment cannot be read');
  }
  if (treat.press.anim !== 'cklGlow') {
    throw new Error('#755 item 7: the press cue is not pulsing — animationName "' + treat.press.anim +
      '". The ruling is "((( soft pulsing glow )))" for a control to act on; a steady press cue is ' +
      'indistinguishable from the watch ring.');
  }
  log.push('press cue: animation ' + treat.press.anim + ', ' + treat.press.w + 'x' + treat.press.h + ' px');

  /* ---- item 19: the press stands the pulse down and the GLOW STAYS -------------------------- */
  await page.mouse.move(treat.press.x, treat.press.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);
  var pressed = await page.evaluate(function () {
    var p = document.querySelector('.ckl-step-glow'); if (!p) return null;
    var cs = getComputedStyle(p);
    return { anim: cs.animationName, shadow: cs.boxShadow, done: p.classList.contains('ckl-step-done') };
  });
  if (!pressed) {
    throw new Error('#755 item 19: the ring went away entirely on the press — the ruling is ' +
      '"steady glow, no pulse", and a cue that vanishes says the player is on the wrong control ' +
      'while the step it belongs to is still the active step');
  }
  if (pressed.anim !== 'none') {
    throw new Error('#755 item 19 (OWNER: "when a hightighted button the glow should stop ' +
      'pulsing"): the pulse is still running after a real pointer press inside the ring — ' +
      'animationName "' + pressed.anim + '"');
  }
  /* THE SECOND HALF, AND IT IS THE HALF A "stop the pulse" FIX GETS WRONG: the glow must still be
   * PAINTED. `animation: none` with the box-shadow dropped satisfies the sentence and deletes the
   * cue. */
  if (!pressed.shadow || pressed.shadow === 'none') {
    throw new Error('#755 item 19: the pulse stopped and took the glow with it (box-shadow "' +
      pressed.shadow + '") — the ruling is "after press: steady glow, no pulse", not "no cue"');
  }
  log.push('after a real press: animation ' + pressed.anim + ', glow still painted (' +
    pressed.shadow.slice(0, 60) + '…)');

  /* ⚠ AND IT MUST SURVIVE THE RE-RENDER, which is the whole reason `ui/app.js` remembers the press
   * against the STEP instead of writing the class on the element. `applyCklStepGlow` re-runs on
   * every checklist render-key change — the acceptance flags and the rounded precondition
   * observations move most broadcasts on a live plant — and a naive fix is swept seconds later,
   * which a read taken 300 ms after the press cannot see. 2 s is ~20 broadcasts at 1x. */
  await page.waitForTimeout(2000);
  var stillDone = await page.evaluate(function () {
    var p = document.querySelector('.ckl-step-glow'); if (!p) return null;
    var cs = getComputedStyle(p);
    return { anim: cs.animationName, shadow: cs.boxShadow, done: p.classList.contains('ckl-step-done') };
  });
  if (!stillDone || stillDone.anim !== 'none' || !stillDone.shadow || stillDone.shadow === 'none') {
    throw new Error('#755 item 19: the stood-down cue did not survive the panel re-render — ' +
      JSON.stringify(stillDone) + '. The "already pressed" memory must be keyed on the step and ' +
      're-applied by applyCklStepGlow, not written once onto the element.');
  }
  log.push('and it survives ~20 broadcasts of panel re-render (animation ' + stillDone.anim + ')');

  /* ---- and the NEXT step pulses again: a stand-down that never re-arms is a dead cue ---------- */
  var nxt = await page.evaluate(function () {
    var c = globalThis.RD.__dev.service().instructor.checklist, st = c.proc.steps;
    for (var i = 0; i < st.length; i++) {
      if (i === c.idx) continue;
      var press = (st[i].hl && st[i].hl.length) ? st[i].hl.slice()
                : (st[i].control && !/^\(observe/i.test(st[i].control)) ? [st[i].control] : [];
      if (press.length) return i;
    }
    return -1;
  });
  if (nxt >= 0) {
    var nr2 = await landOn(nxt);
    var rearm = await page.evaluate(function () {
      var p = document.querySelector('.ckl-step-glow'); if (!p) return null;
      return { anim: getComputedStyle(p).animationName, done: p.classList.contains('ckl-step-done') };
    });
    if (rearm && (rearm.anim !== 'cklGlow' || rearm.done)) {
      throw new Error('#755 item 19: step ' + (nr2.idx + 1) + ' did not re-arm the pulse after the ' +
        'previous step was pressed (' + JSON.stringify(rearm) + ') — the "already pressed" set is ' +
        'scoped to one step and must be dropped when the step changes');
    }
    log.push('step ' + (nr2.idx + 1) + ' re-arms: animation ' + (rearm ? rearm.anim : 'n/a'));
  }

  /* ---- the watch ring: SOLID, STEADY, and not the same thing as the press cue ---------------- */
  if (treat.watch) {
    if (/dashed|dotted/.test(treat.watch.outlineStyle)) {
      throw new Error('#755 items 7/10 (OWNER: "I dont like the dashed line look for the ' +
        'walkthrough highlights"): the watch ring is drawn with outline-style "' +
        treat.watch.outlineStyle + '"');
    }
    if (treat.watch.anim !== 'none') {
      throw new Error('#755 item 7: the watch ring is animating ("' + treat.watch.anim + '") — ' +
        'steady is what separates "watch this" from "press this"');
    }
    log.push('watch ring: outline-style ' + treat.watch.outlineStyle + ', animation ' +
      treat.watch.anim + ', shadow ' + treat.watch.shadow.slice(0, 40) + '…');
  }

  await page.evaluate(function () { globalThis.RD.__dev.service().handleCommand({ action: 'stop_checklist' }); });
  return log.join(String.fromCharCode(10)) + String.fromCharCode(10);
}

/* #691 — A PAUSED PLANT KEPT THE PREVIOUSLY-SELECTED SPEED BUTTON LIT, AND PLAY-FROM-PAUSE
 * RESUMED AT THE OLD SPEED (owner: "When pausing the sim the previously selected warp button
 * shouldn't still be highlighted. Pressing play from a pause should play at 1x.").
 *
 * ROOT CAUSE, both halves. `syncSpeedUI`'s repaint of `[data-speed].on` is guarded on
 * `v !== lastSpeedSync` (`ui/app.js`) — pausing never touches `time_acceleration`, so a
 * pause's own `syncPlayBtn()` call left the guard short-circuited and the lit button was
 * never told to go dark. Separately, `resumeSim` called only `service.start()`: nothing
 * resets `timeAcceleration` (its one mutator besides init is `_setSpeed`), so whatever speed
 * survived the pause untouched is exactly what the plant resumed at.
 *
 * A NODE GATE CANNOT SEE THIS. `SimulationService.prototype.advanceCycles` forces
 * `running = true` for the duration of its own loop and restores the prior value afterwards,
 * so a Node harness that pauses and then steps the plant to check can never observe the
 * pause holding — the very mechanism it would use to advance the plant defeats the pause it
 * is trying to verify. This has to drive the real play/pause button and the service's own
 * timer path, which only a browser gate does. */
async function testPauseResumeSpeed(page) {
  var log = [];
  var base = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&run=1&dev=1';
  await page.goto(base, { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);

  async function read() {
    return await page.evaluate(function () {
      var svc = globalThis.RD.__dev.service();
      var lit = Array.prototype.map.call(
        document.querySelectorAll('#speed [data-speed].on'),
        function (b) { return b.getAttribute('data-speed'); });
      return { accel: svc.timeAcceleration, running: svc.running,
               paused: document.getElementById('playBtn').classList.contains('paused'), lit: lit };
    });
  }

  // ---- 1. select a non-1x speed: it lights and the plant accelerates ----------------
  await page.click('#speed [data-speed="600"]');
  await page.waitForTimeout(400);
  var afterClick = await read();
  if (!(afterClick.accel >= 600) || afterClick.lit.indexOf('600') < 0) {
    throw new Error('#691 fixture: selecting 600x did not light the button or accelerate — ' + JSON.stringify(afterClick));
  }
  log.push('600x selected: accel ' + afterClick.accel + ', lit [' + afterClick.lit.join(',') + ']');

  // ---- 2. pause: the 600x button must go dark, even though accel never changed ------
  await page.click('#playBtn');
  await page.waitForTimeout(300);
  var afterPause = await read();
  if (!afterPause.paused || afterPause.running) {
    throw new Error('#691: #playBtn did not pause the plant — ' + JSON.stringify(afterPause));
  }
  if (afterPause.lit.indexOf('600') >= 0) {
    throw new Error('#691: the 600x speed button is still lit while the plant is PAUSED — lit [' +
      afterPause.lit.join(',') + ']');
  }
  log.push('paused: lit [' + afterPause.lit.join(',') + '] (600x cleared)');

  /* ---- 2b. AND IT STAYS DARK WHEN THE PLAYER TOUCHES ANYTHING (2026-09-13) -------------
   * The clear above is done by hand in `syncPlayBtn`, but `time_acceleration` is still 600
   * and `lastSpeedSync` was nulled to force the next repaint — so the NEXT render lit the
   * rung straight back up, and `cmd()` renders synchronously whenever the service is stopped.
   * Any control pressed while paused therefore undid the fix this test is named for. Found
   * because it reddened this gate intermittently (whatever produced a render inside the
   * paused window won the race); reproduced deterministically here in one command.
   * `set_attention_stops` is chosen because it moves nothing in the plant — the point is the
   * RENDER, not the command. Injection-proven: restoring the unconditional
   * `b.classList.toggle('on', +b.getAttribute('data-speed') === v)` in `syncSpeedUI` reds this
   * and nothing else. */
  await page.evaluate(function () {
    globalThis.RD.__dev.service().handleCommand({ action: 'set_attention_stops', value: false });
  });
  await page.click('#speed [data-speed="600"]');   // the same press, now against a held plant
  await page.waitForTimeout(400);
  var stillHeld = await read();
  if (!stillHeld.paused || stillHeld.running) {
    throw new Error('#691 fixture: the plant resumed during the held-press probe, so the ' +
      'assertion below would prove nothing — ' + JSON.stringify(stillHeld));
  }
  if (stillHeld.lit.length) {
    throw new Error('#691: a speed rung is lit again on a PAUSED plant after the player ' +
      'touched a control — lit [' + stillHeld.lit.join(',') + ']. syncPlayBtn cleared it; the ' +
      'next render repainted it from time_acceleration, which pausing never changed.');
  }
  log.push('pressed 600x while held: lit [' + stillHeld.lit.join(',') + '] (stays dark)');

  // ---- 3. resume: must land at 1x, with the 1x button (not 600x) lit ----------------
  await page.click('#playBtn');
  await page.waitForTimeout(300);
  var afterResume = await read();
  if (afterResume.paused || !afterResume.running) {
    throw new Error('#691: #playBtn did not resume the plant — ' + JSON.stringify(afterResume));
  }
  if (afterResume.accel !== 1) {
    throw new Error('#691: play-from-pause resumed at ' + afterResume.accel + 'x, not 1x — ' + JSON.stringify(afterResume));
  }
  if (afterResume.lit.indexOf('1') < 0 || afterResume.lit.indexOf('600') >= 0) {
    throw new Error('#691: after resume the lit speed button(s) are [' + afterResume.lit.join(',') + '], want just 1');
  }
  log.push('resumed: accel ' + afterResume.accel + ', lit [' + afterResume.lit.join(',') + ']');
  return log.join('\n') + '\n';
}

/* #710 — RESUME-FROM-PAUSE CLEARED THE ACCUMULATOR-HELD SPEED-BAR MESSAGE WHILE THE HOLD STILL
 * STOOD (filed by the #686 agent, out of scope there). `resumeSim()` (and two siblings — the
 * speed-button click handler, the walkthrough rewind handler) nulled `warpNote` unconditionally
 * on the theory that any player act means the plant-declared hold is over. It is not: the
 * accumulator arming window (`true_state.speed_hold`) can stand for plant-minutes, and
 * `set_speed(1)` — what a resume always sends — always succeeds under it (only `> 1` is
 * refused), so nothing stopped a pause/resume from happening WHILE still inside the window.
 * That silently re-created the #619 item 13 trap: the plant refuses every speed press above 1x
 * and the ONLY standing explanation on screen (`#warpInfo`'s persistent line, #686 ruling 3)
 * disappeared on an ordinary pause/resume.
 *
 * THE FIX (`retireWarpNote` in ui/app.js) reads the LIVE state — `latest.true_state.speed_hold`
 * — instead of assuming an act means the hold is over: keep the note while the hold still
 * stands, retire it once the act happens with the hold genuinely gone.
 *
 * WHY A ONE-SHOT PLANT DOES NOT PROVE THIS (learned from #686's own check, `testHeldSpeedClick`
 * above): its `assembleSnapshot` override is restored immediately after ONE manual broadcast, so
 * by the time `resumeSim()`'s own `cmd()` calls `assembleSnapshot()` again, the injected
 * `speed_hold` is gone — which would make retirement look CORRECT even with the #710 defect
 * still in place, because the live state genuinely no longer shows a hold. This override stays
 * installed (`__710hold`, toggled rather than restored) so every subsequent broadcast — the one
 * `resumeSim()` triggers, and the real interval ticks around it — keeps reporting the hold for as
 * long as the test says it stands, exactly like a real 75-plant-minute arming window would.
 *
 * PROVED THROUGH THE REAL PIPELINE, NOT THE DOM, same shape as `testHeldSpeedClick`: the rising
 * edge is produced by one manual `_assembleWithInstructor()` + `_broadcast()` call while running
 * at >1x (the drop-to-1x-and-stamp branch only fires when `timeAcceleration > 1`,
 * `layers/simulation_service.js` :781), then the pause/resume cycle is driven through the real
 * `#playBtn` exactly as a player would click it. render() schedules DOM work on the next
 * `requestAnimationFrame`, so every read below is preceded by a wait for a broadcast/paint to
 * land — reading `#warpInfo` synchronously races the paint and reads empty text, which looks
 * like a pass (the #686 agent's finding, `read()`'s own `waitForTimeout` avoids it).
 *
 * BOTH HALVES: POSITIVE — pause/resume while the hold still stands must keep the message.
 * NEGATIVE — once the hold is actually cleared (`__710hold = false`, then a real broadcast lands
 * it), the next pause/resume must retire the message, or this only pins a message that can
 * never go away. */
async function testHeldNotePauseResume(page) {
  var log = [];
  var base = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&run=1&dev=1';
  await page.goto(base, { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);

  async function read() {
    return await page.evaluate(function () {
      var svc = globalThis.RD.__dev.service();
      var el = document.getElementById('warpInfo');
      return { accel: svc.timeAcceleration, running: svc.running,
               paused: document.getElementById('playBtn').classList.contains('paused'),
               warp: el ? el.textContent : null, warpHidden: el ? el.hidden : null };
    });
  }

  // ---- establish a STANDING hold, with the fabricated fact left installed rather than
  // one-shot (see header comment for why a one-shot plant cannot prove this). ----
  await page.evaluate(function () {
    var svc = globalThis.RD.__dev.service();
    svc.handleCommand({ action: 'set_speed', value: 600 });   // must be >1x for the drop-and-stamp
    var orig = svc.assembleSnapshot;
    globalThis.__710orig = orig;
    globalThis.__710hold = true;
    svc.assembleSnapshot = function () {
      var snap = orig.call(this);
      if (globalThis.__710hold) {
        snap.true_state = Object.assign({}, snap.true_state,
          { speed_hold: 'accumulator window open — arm the accumulators before accelerating again' });
      }
      return snap;
    };
    var out = svc._assembleWithInstructor();   // the rising edge: stamps speed_snap, drops to 1x
    svc._broadcast(out);
  });
  await page.waitForTimeout(400);
  var afterHold = await read();
  if (afterHold.warpHidden || !/Held at real time/.test(afterHold.warp || '') || afterHold.accel !== 1) {
    throw new Error('#710 fixture: the standing hold did not print under the speed bar — ' + JSON.stringify(afterHold));
  }
  log.push('hold established: "' + afterHold.warp + '", accel ' + afterHold.accel);

  // ---- THE CASE (positive): pause and resume through the real button WHILE THE HOLD STILL
  // STANDS. Pre-fix, resumeSim() nulled `warpNote` unconditionally here. ----
  await page.click('#playBtn');
  await page.waitForTimeout(300);
  var afterPause = await read();
  if (!afterPause.paused || afterPause.running) {
    throw new Error('#710 fixture: #playBtn did not pause — ' + JSON.stringify(afterPause));
  }
  await page.click('#playBtn');
  await page.waitForTimeout(400);
  var afterResume = await read();
  if (afterResume.paused || !afterResume.running || afterResume.accel !== 1) {
    throw new Error('#710 fixture: #playBtn did not resume at 1x — ' + JSON.stringify(afterResume));
  }
  if (afterResume.warpHidden || !/Held at real time/.test(afterResume.warp || '')) {
    throw new Error('#710: resume cleared the held-at-real-time message while the hold still ' +
      'stands — warpInfo "' + afterResume.warp + '" (hidden=' + afterResume.warpHidden + ')');
  }
  log.push('resumed under a standing hold: message survives ("' + afterResume.warp + '")');

  // ---- THE NEGATIVE HALF: the hold genuinely lifts, a real broadcast reports it, THEN the
  // player acts again — the message must clear, or this only pins a message that never goes
  // away. ----
  await page.evaluate(function () { globalThis.__710hold = false; });
  await page.waitForTimeout(400);   // the service is running: let a real broadcast drop speed_hold
  await page.click('#playBtn');
  await page.waitForTimeout(300);
  await page.click('#playBtn');
  await page.waitForTimeout(400);
  var afterLifted = await read();
  if (/Held at real time/.test(afterLifted.warp || '')) {
    throw new Error('#710: the held-at-real-time message survived a pause/resume after the hold ' +
      'genuinely lifted — warpInfo "' + afterLifted.warp + '"');
  }
  log.push('hold lifted, then resumed: message cleared (warpInfo "' + (afterLifted.warp || '') + '")');

  await page.evaluate(function () {
    var svc = globalThis.RD.__dev.service();
    svc.assembleSnapshot = globalThis.__710orig;
    delete globalThis.__710orig; delete globalThis.__710hold;
  });
  return log.join('\n') + '\n';
}

/* NO CSS TRANSITION MAY RIDE A BROADCAST-CADENCE VALUE (#613 wave 3, 2026-09-04).
 *
 * THE INVARIANT: a CSS transition may exist only on a property that changes on a DISCRETE
 * EVENT — a valve rotating open, a stroke turning red. Never on a value the board rewrites
 * every broadcast (level rects, surface lines, level markers, rod groups, a modulating
 * valve's needle). A 150 ms transition restarted every ~100 ms never finishes, so the
 * element is never idle and the compositor draws at the DISPLAY rate for a board that
 * paints ~10 times a second.
 *
 * WHY IT NEEDS A GATE RATHER THAN A COMMENT: the defect is invisible to a source read and to
 * every Node runner. `std_pipe.js`'s `tickAnimations` pauses ~90 keyframe animations and
 * deliberately SKIPS CSSTransition ("short, one-shot") — so the class it excluded by design
 * was the entire frame producer, and three waves of animation throttling never touched it.
 * MEASURED at 10x on a settled board (`tools/perf_trace.js`): 6-7 running CSSTransitions at
 * every sampled instant, ZERO running keyframe animations, 870 compositor draws per 15 s
 * (60 Hz) against ~300 app paints. Removing exactly the broadcast-cadence declarations took
 * frames to 339, -61 %, compositor busy -32 %, GPU busy -25 %. After the fix the compositor
 * draws ~1.03 times per app paint.
 *
 * WHAT IT ASSERTS, and why in this shape:
 *  - TEN SAMPLES ~200 ms APART, not one. A transition is 150 ms long; a single sample can
 *    fall in a gap and certify a board that is transitioning continuously. Round 2's
 *    five-instant sweep is what proved the 6-7 were ALWAYS running.
 *  - A COUNT CEILING of 2 catches a broadcast-cadence declaration anywhere, including one
 *    added outside `.pwr-board-stage`.
 *  - A TARGET RULE (no rect/line/g in `.pwr-board-stage` transitioning height/y/transform)
 *    names the exact shape that was removed, so the red says WHAT, not just "too many".
 *
 * PROVED BY INJECTION, 2026-09-04 (`inbox/613/inject_css_transition.js`, which drives this one
 * check through the module export). Temporarily restoring ONE declaration —
 * `style: { transition: 'y 0.15s linear, height 0.15s linear' }` on the pressurizer's
 * waterRect (`comp_pressurizer.js`, the `data-role: pzr-water` element) — took the samples from
 * `0,0,0,0,0,0,0,0,0,0` to `2,2,2,2,2,2,2,2,2,2` (one declaration, two properties, running at
 * EVERY sample) and the check failed with "a broadcast-cadence CSS transition is live on the
 * board: height @ rect [board], y @ rect [board]". Removed again, green.
 *
 * NOTE WHICH HALF CAUGHT IT: at 2 running the COUNT ceiling was still satisfied — the TARGET
 * rule is what went red. The ceiling is the backstop for a declaration outside the board or on
 * a tag this rule does not name; it is not the primary assertion, and a future edit that
 * loosens the target rule to "count only" would re-open exactly this defect. */
/* THE VITAL-FEW PRESSURIZER LEVEL GAUGE MUST NOT CAUTION ON A PLANT THAT IS ON PROGRAM (#676).
 *
 * The authored `caution_lo: 25` in ui/app.js is a FOSSIL — it is the retired plant's
 * `pzr_level_low` setpoint from before #500 made that row a deviation. The level program is
 * scheduled on Tavg and IS 25 % at the no-load anchor, so in Mode 5, Cold Shutdown, Mode 4,
 * Hot Shutdown and Mode 3, Hot Standby the needle sits ON the edge, the instrument noise
 * crosses it, and `gaugeState`'s latch pins the gauge amber for the whole run — on a plant
 * holding its setpoint to within 1.0 point. Measured before the fix, 20 plant-minutes per
 * initial condition: CAUTION 100.0 % of the time in all three. Those three states begin every
 * startup walkthrough, so the first thing a new player is taught is to ignore a vital gauge.
 *
 * WHY IT IS CHECKED HERE and not in a Node runner: ui/app.js does not load headless (it wants
 * a real DOM at script scope), and the vital strip publishes no thresholds — only the CLASS
 * they produce. So the only place the rendered band can be observed is a browser.
 *
 * TWO HALVES, because either alone passes on a bug:
 *   1. THE CLASS, sampled on the live plant at three initial conditions. This is the defect.
 *   2. THE RULE, called directly through `RD.PwrGaugeBands` — including the DISCRIMINATOR that
 *      the edge MOVES (17 % cold against 51.5 % at power). Half 1 alone would go green on an
 *      edge hard-coded to 0; half 2 alone cannot tell you the gauge reads it.
 *
 * PROVED BY INJECTION, 2026-09-10: restoring the plain `caution_lo: 25` (dropping the gauge's
 * `autorange`) fails half 1 at cold_shutdown with 40/40 samples amber, and restoring the
 * absolute form of `pzrGaugeCautionLo` fails half 2's discriminator. */
async function testPzrGaugeFollowsProgram(page) {
  var log = [];
  /* Mode 4, Hot Shutdown is deliberately off the free-play menu — the ruling and the measured
   * Mode 4 / Mode 5 diff are recorded at the pwr2 registry in ui/app.js — so the browser cannot
   * reach it; it carries the same 25 % program as Mode 5 and was measured in Node instead.
   * These three are what the player can actually select. */
  var ICS = [['cold_shutdown', 'Mode 5, Cold Shutdown'],
             ['hot_zero_power', 'Mode 3, Hot Standby'],
             ['hot_full_power', 'Mode 1, At Power']];
  var edges = {};
  for (var i = 0; i < ICS.length; i++) {
    var ic = ICS[i][0], name = ICS[i][1];
    await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&init=' + ic +
                    '&run=1&dev=1', { waitUntil: 'networkidle', timeout: 90000 });
    await dismissMission(page);
    await waitBoardLive(page, 20000);
    if (await page.$('#speed [data-speed="10"]')) await page.click('#speed [data-speed="10"]');
    await page.waitForTimeout(1200);
    /* 40 samples over ~4 s of wall at 10x — the noise that latched the band is per-broadcast,
     * so this spans hundreds of plant-seconds of it. */
    var r = await page.evaluate(async function () {
      function sleep(ms) { return new Promise(function (f) { setTimeout(f, ms); }); }
      var g = document.getElementById('gauge-pzr'), warn = 0, alarm = 0, n = 0, i;
      for (i = 0; i < 40; i++) {
        if (g.classList.contains('alarm')) alarm++;
        else if (g.classList.contains('warn')) warn++;
        n++;
        await sleep(100);
      }
      var svc = window.RD.__dev.service();
      var prog = svc.engine.getControlState().pzr_level_program_pct;
      var rows = (svc.layer && svc.layer.config && svc.layer.config.alarms) || [];
      function sp(id) { for (var k = 0; k < rows.length; k++) if (rows[k].id === id) return rows[k]; return null; }
      var dev = sp('pzr_level_dev_low'), cut = sp('pzr_level_cutoff');
      return {
        warn: warn, alarm: alarm, n: n,
        val: (document.querySelector('#gauge-pzr [data-val]') || {}).textContent,
        program: prog,
        devSp: dev && dev.setpoint, cutSp: cut && cut.setpoint,
        edge: window.RD.PwrGaugeBands.pzrLevelCautionLo({ control_state: { pzr_level_program_pct: prog } }, 25),
        noProgram: window.RD.PwrGaugeBands.pzrLevelCautionLo({ control_state: {} }, 25),
        nullProgram: window.RD.PwrGaugeBands.pzrLevelCautionLo({ control_state: { pzr_level_program_pct: null } }, 25)
      };
    });
    edges[ic] = r;
    log.push(name + ': program ' + r.program.toFixed(1) + ' %, gauge reads ' + r.val +
             ', caution edge ' + r.edge.toFixed(1) + ' % — ' + r.warn + ' warn / ' + r.alarm +
             ' alarm of ' + r.n + ' samples');
    if (r.warn || r.alarm) {
      throw new Error('pzr gauge banded on an on-program plant at ' + name + ': ' + r.warn +
                      ' warn / ' + r.alarm + ' alarm of ' + r.n + ' samples, program ' +
                      r.program.toFixed(1) + ' %, gauge ' + r.val);
    }
    /* The green must be EARNED: a plant that had drifted off program would also be a plant
     * whose amber was correct, and this check would then be asserting nothing. */
    if (r.devSp == null || r.cutSp == null) throw new Error('pzr level alarm ladder missing from the running config at ' + name);
    var want = Math.max(r.cutSp, r.program + r.devSp);
    if (Math.abs(r.edge - want) > 1e-9) {
      throw new Error('pzr caution edge at ' + name + ' is ' + r.edge + ', not the plant\'s own ' +
                      'max(' + r.cutSp + ', program ' + r.program.toFixed(1) + ' + ' + r.devSp + ') = ' + want);
    }
    /* …and a plant publishing no program keeps the authored edge, so the retired engine and
     * old recordings are unchanged. `isFinite(null)` is TRUE, so null is checked separately. */
    if (r.noProgram !== 25 || r.nullProgram !== 25) {
      throw new Error('a snapshot with no level program must keep the authored 25 %, got ' +
                      r.noProgram + ' / ' + r.nullProgram);
    }
  }
  /* THE DISCRIMINATOR. An absolute edge — the shipped bug, or any fixed replacement — gives the
   * SAME number in Mode 5 and at power. The program spans 25 -> 61.5 %, so these must not. */
  var cold = edges.cold_shutdown.edge, hot = edges.hot_full_power.edge;
  if (!(hot - cold > 20)) {
    throw new Error('the pzr caution edge did not follow the program: Mode 5 ' + cold +
                    ' %, Mode 1 ' + hot + ' % — an absolute edge reads the same in both');
  }
  log.push('edge follows the program: Mode 5 ' + cold.toFixed(1) + ' % (the 17 % letdown-isolate ' +
           'cut) -> Mode 1 ' + hot.toFixed(1) + ' % (program - 10)');
  return log.join('\n') + '\n';
}

/* THE VITAL-FEW PRESSURIZER GAUGE MUST CAUTION WHEN LEVEL RUNS ABOVE ITS PROGRAM (#706) — the
 * same gap as #703's, on the other end of the same gauge. The strip carried NO high-side band at
 * all, so a player watching the board through the shipped Mode 5 -> Mode 3 heatup got no cue of
 * any kind while level ran **+20.4 points above a 25.00 % program (peak 45.37 %) for 11.6 of the
 * leg's 13.4 plant-hours** (#706's measurement). The plant's own absolute PZR LVL HI sits at 75 %,
 * thirty points away, and never fired.
 *
 * MEASURED (full stack, svc.tick() driven, ACCEL=10, seed 7): the worst LEGITIMATE upward
 * deviation of pzr_level above its program is +7.53 points, a momentary spike on the power
 * ascension (pwr_raise_power spends 0.0 % of the leg above +8). Steady state at all four
 * free-play initial conditions is +1.07..+1.17; a 100 -> 90 -> 100 MWe load change +5.98/+2.45;
 * +-15 ppm boration/dilution +1.62/+1.30. Against the faults: pwr_heatup +21.34, pwr_shutdown
 * +21.19, pwr_cooldown +43.07, the TMI-2 leg +75.00. The chosen edge, program + 10 points, is
 * the mirror of the `pzr_level_dev_low` rung that already exists, and NOTHING measured sits
 * between +7.53 and +21.19.
 *
 * TWO HALVES PLUS A FAULT LEG, same reasons as the two tests above: ui/app.js does not load
 * headless and the vital strip publishes no thresholds, only the class they produce.
 *   1. THE CLASS, sampled on the live plant at the three reachable on-program initial
 *      conditions. A gauge that banded here would be a false warn on a healthy plant.
 *   2. THE RULE, through `RD.PwrGaugeBands.pzrLevelCautionHi` — that it is the plant's own
 *      min(PZR LVL HI, program + PZR LVL DEV HI) read live rather than a retyped number, that a
 *      snapshot with no program keeps the authored 75, and the DISCRIMINATOR that the edge MOVES
 *      between Mode 5 and full power (35.0 -> 71.5 %). A fixed absolute edge — the shipped bug,
 *      or any naive replacement — reads the same in both.
 *   3. THE FAULT LEG: drive level far above a 25 % program on the live plant (charging out of
 *      AUTO at 9 gpm) and confirm the gauge actually goes amber — AND that it did so while level
 *      was still BELOW the absolute 75 % fallback, which is what makes it the program-relative
 *      edge rather than the old literal doing the work.
 *
 * PROVED BY INJECTION, 2026-09-11: reverting the gauge to its shipped form (no `caution` key,
 * autorange returning only `caution_lo`) leaves the fault leg at 0/40 warn where the fix reads
 * 40/40, and a FIXED absolute edge (a literal 75, or `caution: 75` with no autorange) fails the
 * discriminator and the fault leg both. */
async function testPzrGaugeHighLevelCaution(page) {
  var log = [];
  var ICS = [['cold_shutdown', 'Mode 5, Cold Shutdown'],
             ['hot_zero_power', 'Mode 3, Hot Standby'],
             ['hot_full_power', 'Mode 1, At Power']];
  var edges = {};
  for (var i = 0; i < ICS.length; i++) {
    var ic = ICS[i][0], name = ICS[i][1];
    await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&init=' + ic +
                    '&run=1&dev=1', { waitUntil: 'networkidle', timeout: 90000 });
    await dismissMission(page);
    await waitBoardLive(page, 20000);
    if (await page.$('#speed [data-speed="10"]')) await page.click('#speed [data-speed="10"]');
    await page.waitForTimeout(1200);
    var r = await page.evaluate(async function () {
      function sleep(ms) { return new Promise(function (f) { setTimeout(f, ms); }); }
      var g = document.getElementById('gauge-pzr'), warn = 0, alarm = 0, n = 0, i;
      for (i = 0; i < 40; i++) {
        if (g.classList.contains('alarm')) alarm++;
        else if (g.classList.contains('warn')) warn++;
        n++;
        await sleep(100);
      }
      var svc = window.RD.__dev.service();
      var prog = svc.engine.getControlState().pzr_level_program_pct;
      var rows = (svc.layer && svc.layer.config && svc.layer.config.alarms) || [];
      function sp(id) { for (var k = 0; k < rows.length; k++) if (rows[k].id === id) return rows[k]; return null; }
      var dev = sp('pzr_level_dev_high'), hi = sp('pzr_level_high');
      return {
        warn: warn, alarm: alarm, n: n,
        val: (document.querySelector('#gauge-pzr [data-val]') || {}).textContent,
        program: prog, devSp: dev && dev.setpoint, devInstr: dev && dev.instrument, hiSp: hi && hi.setpoint,
        edge: window.RD.PwrGaugeBands.pzrLevelCautionHi({ control_state: { pzr_level_program_pct: prog } }, 75),
        noProgram: window.RD.PwrGaugeBands.pzrLevelCautionHi({ control_state: {} }, 75),
        nullProgram: window.RD.PwrGaugeBands.pzrLevelCautionHi({ control_state: { pzr_level_program_pct: null } }, 75)
      };
    });
    edges[ic] = r;
    log.push(name + ': program ' + r.program.toFixed(1) + ' %, gauge reads ' + r.val +
             ', high caution edge ' + r.edge.toFixed(1) + ' % — ' + r.warn + ' warn / ' + r.alarm +
             ' alarm of ' + r.n + ' samples');
    if (r.warn || r.alarm) {
      throw new Error('pzr gauge banded on an on-program plant at ' + name + ': ' + r.warn +
                      ' warn / ' + r.alarm + ' alarm of ' + r.n + ' samples, program ' +
                      r.program.toFixed(1) + ' %, gauge ' + r.val);
    }
    /* The green must be EARNED — the rung has to be in the RUNNING config, on the DEVIATION
     * channel, or this leg is asserting nothing. */
    if (r.devSp == null || r.hiSp == null) throw new Error('pzr level high ladder missing from the running config at ' + name);
    if (r.devInstr !== 'pzr_level_dev') throw new Error('pzr_level_dev_high is on ' + r.devInstr + ', not the deviation channel');
    var want = Math.min(r.hiSp, r.program + r.devSp);
    if (Math.abs(r.edge - want) > 1e-9) {
      throw new Error('pzr high caution edge at ' + name + ' is ' + r.edge + ', not the plant\'s own ' +
                      'min(' + r.hiSp + ', program ' + r.program.toFixed(1) + ' + ' + r.devSp + ') = ' + want);
    }
    if (r.noProgram !== 75 || r.nullProgram !== 75) {
      throw new Error('a snapshot with no level program must keep the authored 75 %, got ' +
                      r.noProgram + ' / ' + r.nullProgram);
    }
  }
  /* THE DISCRIMINATOR. An absolute edge — the shipped state's 75, or any fixed replacement —
   * gives the SAME number in Mode 5 and at power. The program spans 25 -> 61.5 %, so these
   * must not. */
  var cold = edges.cold_shutdown.edge, hot = edges.hot_full_power.edge;
  if (!(hot - cold > 20)) {
    throw new Error('the pzr high caution edge did not follow the program: Mode 5 ' + cold +
                    ' %, Mode 1 ' + hot + ' % — an absolute edge reads the same in both');
  }
  log.push('edge follows the program: Mode 5 ' + cold.toFixed(1) + ' % -> Mode 1 ' + hot.toFixed(1) +
           ' % (program + 10 in each; the 75 % absolute cap never binds, because the program ' +
           'clamps at 61.5 %)');

  /* THE FAULT LEG. Reconstruct the #706 shape on the live plant: a 25 % program with level far
   * above it. Charging out of AUTO at 9 gpm at Mode 3 reaches program + 30 or so inside an hour
   * and a half of plant time, which WARP covers in a few wall-seconds. */
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&init=hot_zero_power' +
                  '&run=1&dev=1', { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);
  await page.evaluate(function () {
    var svc = window.RD.__dev.service();
    svc.handleCommand({ action: 'set_cvcs_auto', active: false });
    svc.handleCommand({ action: 'set_charging_flow', normalized: 9 / 450000 });
  });
  if (await page.$('#speed [data-speed="600"]')) await page.click('#speed [data-speed="600"]');
  /* 6.5 s of wall at 600x is a bit over an hour of plant time, which takes the deviation to about
   * +36 points. The settle is deliberately SHORT of the 75 % absolute alarm — 61.5 % on three
   * consecutive runs, 13.5 points clear — because the check below asserts that the amber came from
   * the program-relative edge and not from the authored literal, and that assertion is only
   * available while level stays under 75. */
  await page.waitForTimeout(6500);
  var faultR = await page.evaluate(async function () {
    function sleep(ms) { return new Promise(function (f) { setTimeout(f, ms); }); }
    var g = document.getElementById('gauge-pzr'), warn = 0, n = 0, i;
    for (i = 0; i < 40; i++) {
      if (g.classList.contains('warn') || g.classList.contains('alarm')) warn++;
      n++;
      await sleep(100);
    }
    var svc = window.RD.__dev.service();
    var snap = svc.assembleSnapshot();
    var prog = snap.control_state.pzr_level_program_pct;
    var lit = (snap.alarms || []).filter(function (a) { return a.id === 'pzr_level_dev_high'; })[0];
    return { warn: warn, n: n, lvl: snap.instruments.pzr_level, program: prog,
             annunciator: lit ? lit.state : '(absent)' };
  });
  log.push('fault leg (charging MANUAL 9 gpm at Mode 3, WARP settle): level ' +
           faultR.lvl.toFixed(1) + ' % against a ' + faultR.program.toFixed(1) + ' % program (+' +
           (faultR.lvl - faultR.program).toFixed(1) + ' points) — ' + faultR.warn + ' warn of ' +
           faultR.n + ' samples, PZR LVL DEV HI ' + faultR.annunciator);
  if (!faultR.warn) {
    throw new Error('pzr gauge never banded on the reconstructed high-level excursion: level ' +
                    faultR.lvl.toFixed(1) + ' % against a ' + faultR.program.toFixed(1) + ' % program');
  }
  /* …and it has to be the PROGRAM-RELATIVE edge that did it. Amber at a level ABOVE 75 % would
   * be satisfied by the authored literal alone, which is the state this whole fix replaces. */
  if (!(faultR.lvl < 75)) {
    throw new Error('the fault leg ran past the 75 % absolute alarm (' + faultR.lvl.toFixed(1) +
                    ' %), so the amber proves nothing about the program-relative edge — the ' +
                    'excursion is too large, shorten the WARP settle');
  }
  if (faultR.annunciator === 'clear' || faultR.annunciator === '(absent)') {
    throw new Error('the gauge banded but PZR LVL DEV HI did not: ' + faultR.annunciator +
                    ' at level ' + faultR.lvl.toFixed(1) + ' % against program ' + faultR.program.toFixed(1) + ' %');
  }
  return log.join('\n') + '\n';
}

/* THE VITAL-FEW Tavg GAUGE MUST CAUTION ON A COLD-AT-POWER PLANT AND STAY SILENT ON ONE
 * TRACKING ITS PROGRAM (#703) — the opposite gap from #676's: the strip carried NO low edge
 * on Tavg at all, so a plant running 105 °F (58.3 °C) cold at 96.5 % power had no vital-few
 * cue until the reactor tripped (measured during the #676 fix, 2026-09-10).
 *
 * MEASURED (full stack, svc.tick() driven, ACCEL=10, rods MANUAL): the worst LEGITIMATE
 * downward deviation of Tavg below its sliding program (a +15 ppm boration at full power) is
 * 9.5 °F; the ascension climb, a load transient, the post-ascension xenon swing and steady
 * state at all four initial conditions are all under 2 °F. The chosen edge, program − 20 °F,
 * clears every legitimate case by 2x or more and fires about 5x before the fault's own 105 °F.
 *
 * TWO HALVES, same reason as testPzrGaugeFollowsProgram: ui/app.js does not load headless and
 * the vital strip publishes no thresholds, only the class they produce.
 *   1. THE CLASS, sampled on the live plant at two on-program initial conditions (Mode 1 at
 *      power and Mode 3, Hot Standby — both HI-RANGE, where the edge is live).
 *   2. THE RULE, called through `RD.PwrGaugeBands.tavgCautionLo` — including the
 *      DISCRIMINATOR that the edge MOVES with load (the no-load anchor vs the full-power
 *      point), that LOW RANGE nulls it exactly as caution/danger already are, and that a
 *      snapshot with no program falls back to the plant's own LO TAVG (P-12) annunciator.
 *
 * PROVED BY INJECTION, 2026-09-10: restoring the pre-#703 gauge (no `caution_lo` at all) never
 * warns no matter how cold Tavg reads — fails half 1's fault-reproduction leg with 0/40 warn
 * where the fix reads 40/40; and a FIXED absolute edge (e.g. a literal 278) fails the
 * discriminator, since it gives the same number at every load. */
async function testTavgGaugeDeviationCaution(page) {
  var log = [];
  var ICS = [['hot_full_power', 'Mode 1, At Power'], ['hot_zero_power', 'Mode 3, Hot Standby']];
  var edges = {};
  for (var i = 0; i < ICS.length; i++) {
    var ic = ICS[i][0], name = ICS[i][1];
    await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&init=' + ic +
                    '&run=1&dev=1', { waitUntil: 'networkidle', timeout: 90000 });
    await dismissMission(page);
    await waitBoardLive(page, 20000);
    if (await page.$('#speed [data-speed="10"]')) await page.click('#speed [data-speed="10"]');
    await page.waitForTimeout(1200);
    var r = await page.evaluate(async function () {
      function sleep(ms) { return new Promise(function (f) { setTimeout(f, ms); }); }
      var g = document.getElementById('gauge-tavg'), warn = 0, n = 0, i;
      for (i = 0; i < 40; i++) {
        if (g.classList.contains('warn')) warn++;
        n++;
        await sleep(100);
      }
      var svc = window.RD.__dev.service();
      var snap = svc.assembleSnapshot();
      var tavgC = snap.instruments.tavg, loadFrac = snap.instruments.steam_flow;
      var CTL = window.RD.PWR_CONTROL;
      var refC = (CTL && CTL.trefProgram) ? CTL.trefProgram(Math.max(0, Math.min(1, loadFrac || 0))) : null;
      return {
        warn: warn, n: n,
        val: (document.querySelector('#gauge-tavg [data-val]') || {}).textContent,
        tavgC: tavgC, refC: refC,
        edge: window.RD.PwrGaugeBands.tavgCautionLo(snap, 278)
      };
    });
    edges[ic] = r;
    log.push(name + ': Tavg ' + r.tavgC.toFixed(1) + ' degC, ref ' + (r.refC != null ? r.refC.toFixed(1) : '?') +
             ' degC, edge ' + (r.edge != null ? r.edge.toFixed(1) : 'null') + ' degC, gauge reads ' + r.val +
             ' — ' + r.warn + ' warn of ' + r.n + ' samples');
    if (r.warn) {
      throw new Error('tavg gauge cautioned on a plant tracking its program at ' + name + ': ' +
                      r.warn + '/' + r.n + ' samples, Tavg ' + r.tavgC.toFixed(1) + ' degC vs ref ' +
                      (r.refC != null ? r.refC.toFixed(1) : '?') + ' degC');
    }
    if (r.refC == null || r.edge == null) throw new Error('tavg gauge published no live program/edge at ' + name);
    if (Math.abs(r.edge - (r.refC - 20 * 5 / 9)) > 1e-6) {
      throw new Error('tavg caution edge at ' + name + ' is ' + r.edge + ', not ref-20degF = ' + (r.refC - 20 * 5 / 9));
    }
  }
  /* THE DISCRIMINATOR. An absolute edge gives the SAME number at no load and at full power. */
  var cold = edges.hot_zero_power.edge, hot = edges.hot_full_power.edge;
  if (!(hot - cold > 5)) {
    throw new Error('the tavg caution edge did not follow the program: Hot Standby ' + cold +
                    ' degC, Mode 1 ' + hot + ' degC — an absolute edge reads the same in both');
  }
  log.push('edge follows the program: Hot Standby ' + cold.toFixed(1) + ' degC -> Mode 1 ' +
           hot.toFixed(1) + ' degC (program - 20 degF in each)');

  /* THE FAULT LEG: reconstruct 105 degF (58.3 degC) cold at power directly on the live plant
   * (boron forced back up after the ascension, exactly the pre-#683-fix scenario) and confirm
   * the gauge actually warns — half 1's positive case, the one a "no low edge at all" gauge
   * (the pre-#703 shipped defect) can never produce. */
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&init=hot_full_power' +
                  '&run=1&dev=1', { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);
  await page.evaluate(function () {
    window.RD.__dev.service().handleCommand({ action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 750 });
  });
  // WARP tier (the real speed buttons, not a direct property poke — a manual svc.tick() loop
  // here would race the app's own running interval): 750 ppm pins the level program on its
  // floor (the #683 pin point is 670 ppm) and settles Tavg well below the no-load anchor
  // within a couple of plant-hours, which WARP's coarser step covers in a few wall-seconds.
  if (await page.$('#speed [data-speed="3600"]')) await page.click('#speed [data-speed="3600"]');
  await page.waitForTimeout(20000);
  var faultR = await page.evaluate(async function () {
    function sleep(ms) { return new Promise(function (f) { setTimeout(f, ms); }); }
    var g = document.getElementById('gauge-tavg'), warn = 0, n = 0, i;
    for (i = 0; i < 40; i++) {
      if (g.classList.contains('warn')) warn++;
      n++;
      await sleep(100);
    }
    var svc = window.RD.__dev.service();
    var snap = svc.assembleSnapshot();
    return { warn: warn, n: n, tavgC: snap.instruments.tavg, power: snap.instruments.power_range };
  });
  log.push('fault leg (boron forced to 750 ppm, WARP settle): Tavg ' + faultR.tavgC.toFixed(1) +
           ' degC, power ' + faultR.power.toFixed(1) + ' % — ' + faultR.warn + ' warn of ' + faultR.n + ' samples');
  if (!faultR.warn) {
    throw new Error('tavg gauge never cautioned on the reconstructed cold-at-power fault: Tavg ' +
                    faultR.tavgC.toFixed(1) + ' degC, power ' + faultR.power.toFixed(1) + ' %');
  }
  return log.join('\n') + '\n';
}

/* THE ROD LANES ARE DRAWN TO THE ENGINE'S OWN BANK, AND THE SCALE IS READ LIVE (#707).
 *
 * THE DEFECT. `ui/app.js` declared three chart lanes — Control Rod Steps, Shutdown Rod Steps
 * and Rod Limit Margin — with a full scale of 912 steps: the RETIRED engine's fine drive
 * (`RD.PWR_CONFIG.rods.max_steps`). The shipped plant's bank is 627
 * (`RD.pwr2.kinetics.RODS.max_steps`, the sourced four-bank 131-step overlap program —
 * Westinghouse Technology Systems Manual chapter 8.1 section 8.1.5.4, ADAMS ML11223A252), so a
 * bank sitting ON ITS STOP drew at 69 % of its lane: "fully withdrawn" was a height the chart
 * could not reach, and the same was true of the rod-limit margin's own full-scale reading.
 *
 * AN AXIS IS A RENDERING CLAIM, so this reads the DRAWN lane chrome (`.lane-rng`, the text the
 * player sees beside each lane's name) rather than the literal in the profile table. Four
 * checks, and NO bank number is typed here — every bound is read back out of the page:
 *
 *   1. A CHANNEL PARKED ON THE STOP REACHES THE TOP OF ITS LANE. The shutdown bank is parked
 *      fully out at power, so its lane's fitted top must land exactly ON the bank the plant
 *      publishes. On the defect it lands at 700 — holdRange's minSpan is a tenth of full
 *      scale, so the 912 lane fits a flat 627 into a 50-step ladder band 550–700 and the 912
 *      clamp never binds. On the fix it lands at 627, which is the clamp.
 *   2. NO LANE'S TOP MAY EXCEED THE BANK THE PLANT PUBLISHES — the general form of 1, applied
 *      to the control bank, which sits at its at-power design point (606 of 627, #704) rather
 *      than on the stop.
 *   3. THE SCALE FOLLOWS A CHANGE. `pwr2_engine.js`'s BANK() accessor is a function precisely
 *      because "a consumer that captures the value at load cannot follow a change", so a
 *      parse-time capture of 627 would satisfy 1 and 2 and still be the wrong mechanism. The
 *      bank is moved UNDER the running chart and the drawn top has to move with it.
 *   4. THE ROD-LIMIT MARGIN, at the one initial condition where its top is a claim about the
 *      bank at all — see below.
 *
 * Check 3 is why the poke is UPWARD. holdRange's clamp is a preference that must never beat
 * the data (chart_math.js), so shrinking the bank under a trace already at 627 would leave the
 * band where it is and the check would pass on a captured value too — it would be sampling the
 * side of the mechanism the defect cannot reach. Raising it widens minSpan, the flat trace then
 * sits well inside its band, and the shrink dwell (CHART_SHRINK_FRAMES, 40 frames) re-fits.
 *
 * Check 4 needs its OWN initial condition: the margin only reads full scale where the insertion
 * limit does not apply (below 5 % power the engine publishes BANK() outright), so at power it
 * sits near 167 steps and no clamp binds at either scale.
 */
async function testRodLaneBankScale(page) {
  var log = [];

  /* Put exactly the wanted channels in the lane stack. Everything else has to come OFF: the
   * stack demotes the overflow to numeric rows, which carry a value and no range, so a lane
   * left in the crowd would report `null` rather than a wrong bound. */
  async function pinLanes(ids) {
    await page.click('#chartOptsBtn');
    await page.waitForTimeout(400);
    await page.evaluate(function (want) {
      var boxes = Array.prototype.slice.call(document.querySelectorAll('.cs-row input[data-cs-side]'));
      boxes.forEach(function (b) { if (b.checked && !b.disabled) b.click(); });
      want.forEach(function (id) {
        var row = document.querySelector('.cs-row[data-cs="' + id + '"]');
        if (!row) throw new Error('no chart-settings row for series "' + id + '"');
        var box = row.querySelector('input[data-cs-side]:not([disabled])');
        if (!box) throw new Error('series "' + id + '" has no selectable side');
        if (!box.checked) box.click();
      });
    }, ids);
    await page.click('#chartOptsClose');
    await page.waitForTimeout(1500);
  }

  /* The DRAWN range, parsed out of the lane's own chrome. A channel demoted to a numeric row
   * has no `.lane-rng` at all and comes back null, which every caller treats as a failure
   * rather than as an absent bound. */
  function readLanes() {
    return page.evaluate(function () {
      var out = {};
      Array.prototype.slice.call(document.querySelectorAll('#chartFloats .lane-chrome')).forEach(function (c) {
        var rng = c.querySelector('.lane-rng'), t = rng ? (rng.textContent || '') : '';
        var nums = t.match(/-?[\d.]+/g);
        out[c.getAttribute('data-ser')] = (nums && nums.length >= 2)
          ? { lo: parseFloat(nums[0]), hi: parseFloat(nums[1]), text: t } : null;
      });
      var snap = window.RD.__dev.service().assembleSnapshot();
      var gs = (snap.control_state || {}).rod_groups || [], banks = {};
      gs.forEach(function (g) { banks[g.id] = { steps: g.steps, max_steps: g.max_steps }; });
      return {
        lanes: out, banks: banks,
        margin: snap.instruments.rod_limit_margin,
        power: snap.instruments.power_range,
        /* BOTH published scales, so "the lane is not on the retired bank" is a comparison
         * between two numbers the page itself supplies, not against a literal in this file. */
        shipped: ((((window.RD.pwr2 || {}).kinetics || {}).RODS) || {}).max_steps,
        retired: (((window.RD.PWR_CONFIG || {}).rods) || {}).max_steps
      };
    });
  }

  // ---- leg A: the two bank lanes at power -----------------------------------------------
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&init=hot_full_power' +
                  '&run=1&dev=1', { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);
  await pinLanes(['rod_steps', 'sd_steps']);
  var a = await readLanes();

  var bank = (a.banks.shutdown_rods || {}).max_steps;
  if (!(bank > 0)) throw new Error('the plant published no shutdown-bank max_steps to draw against');
  if (!(a.retired > 0) || a.retired === bank) {
    throw new Error('this check cannot discriminate: the retired engine bank (' + a.retired +
      ') and the shipped one (' + bank + ') are the same number, so a stale literal would pass');
  }
  if (a.shipped !== bank) {
    throw new Error('the snapshot rod group (' + bank + ') disagrees with RD.pwr2.kinetics.RODS.max_steps (' +
      a.shipped + ') — the two published copies of the bank have drifted');
  }
  log.push('banks: shipped ' + bank + ' steps, retired engine ' + a.retired + ' steps');

  var sd = a.lanes.sd_steps, ctl = a.lanes.rod_steps;
  if (!sd || !ctl) throw new Error('the rod lanes did not draw as LANES (sd=' + JSON.stringify(sd) +
    ', ctl=' + JSON.stringify(ctl) + ') — demoted to numeric rows?');
  var sdSteps = (a.banks.shutdown_rods || {}).steps;
  if (sdSteps !== bank) {
    throw new Error('precondition: the shutdown bank is meant to be parked on its stop at power, ' +
      'and reads ' + sdSteps + ' of ' + bank + ' — check 1 asserts a lane top against a channel ' +
      'sitting at full scale and cannot be run against a bank somewhere else');
  }
  log.push('at power: control bank ' + (a.banks.control_rods || {}).steps + '/' + bank +
           ', shutdown bank ' + sdSteps + '/' + bank + ', lanes "' + ctl.text + '" / "' + sd.text + '"');

  if (sd.hi !== bank) {
    throw new Error('a bank parked ON ITS STOP does not reach the top of its lane: Shutdown Rod ' +
      'Steps reads ' + sdSteps + ' of ' + bank + ' and its lane is drawn to ' + sd.hi +
      '. (#707 — the lane was declared to the RETIRED engine ' + a.retired + '-step bank, so ' +
      'full scale was a height this plant cannot produce.)');
  }
  if (ctl.hi > bank) {
    throw new Error('the Control Rod Steps lane is drawn to ' + ctl.hi + ' steps on a plant whose ' +
      'bank stops at ' + bank + ' — the top of that lane does not exist (#707)');
  }
  log.push('check 1+2: the stop IS full scale (shutdown lane top ' + sd.hi + ' = bank ' + bank +
           '), control lane top ' + ctl.hi + ' <= ' + bank);

  // ---- leg A, check 3: the scale FOLLOWS the bank ---------------------------------------
  /* Raise the one place the bank is defined and let the chart's own shrink dwell re-fit. The
   * shell republishes max_steps off it every broadcast (bankSteps()), so this is the same path
   * a retune takes — and it is the half a parse-time capture cannot follow. */
  var moved = await page.evaluate(function (factor) {
    var R = window.RD.pwr2.kinetics.RODS, was = R.max_steps;
    R.max_steps = Math.round(was * factor);
    return { was: was, now: R.max_steps };
  }, 2.5);
  await page.waitForTimeout(9000);      /* > CHART_SHRINK_FRAMES (40 frames) */
  var b = await readLanes();
  var sd2 = b.lanes.sd_steps;
  if (!sd2) throw new Error('the shutdown-bank lane stopped drawing after the bank moved');
  log.push('check 3: bank ' + moved.was + ' -> ' + moved.now + ' steps under the running chart; ' +
           'shutdown lane "' + sd.text + '" -> "' + sd2.text + '", published max_steps ' +
           (b.banks.shutdown_rods || {}).max_steps);
  if ((b.banks.shutdown_rods || {}).max_steps !== moved.now) {
    throw new Error('the shell did not republish the moved bank (' +
      (b.banks.shutdown_rods || {}).max_steps + ' vs ' + moved.now + ') — check 3 cannot run');
  }
  if (sd2.hi === sd.hi) {
    throw new Error('the rod lane full scale did NOT follow the bank: it stayed at ' + sd.hi +
      ' while the plant own max_steps went ' + moved.was + ' -> ' + moved.now +
      '. That is a scale CAPTURED once, which is the mechanism #707 forbids — pwr2_engine.js ' +
      'BANK() is a function for this exact reason.');
  }
  if (sd2.hi > moved.now) {
    throw new Error('the rod lane followed the bank past it: top ' + sd2.hi + ' on a ' +
      moved.now + '-step bank');
  }

  // ---- leg B: the rod-limit margin, where its full scale is a claim ----------------------
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&init=hot_zero_power' +
                  '&run=1&dev=1', { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);
  await pinLanes(['rod_margin']);
  var c = await readLanes();
  var bankB = (c.banks.control_rods || {}).max_steps;
  var mar = c.lanes.rod_margin;
  if (!mar) throw new Error('the Rod Limit Margin lane did not draw as a LANE');
  log.push('Hot Standby: power ' + c.power.toFixed(3) + ' %, margin ' + c.margin.toFixed(1) +
           ' steps of a ' + bankB + '-step bank, lane "' + mar.text + '"');
  if (Math.abs(c.margin - bankB) > 0.5) {
    throw new Error('precondition: below the 5 % applicability floor the engine publishes the ' +
      'margin as the whole bank, and it reads ' + c.margin + ' against ' + bankB +
      ' — this leg asserts a lane top against a channel at full scale');
  }
  if (mar.hi !== bankB) {
    throw new Error('Rod Limit Margin reads its full scale (' + c.margin.toFixed(1) + ' of ' +
      bankB + ') and its lane is drawn to ' + mar.hi + ' — the reading cannot reach the top of ' +
      'its own lane (#707; the lane was declared to the retired ' + c.retired + '-step bank)');
  }
  log.push('check 4: margin at full scale reaches the lane top (' + mar.hi + ' = bank ' + bankB + ')');

  return log.join('\n') + '\n';
}

/* THE ROD LIMIT MARGIN INDICATIONS-TAB ROW MUST READ THE ENGINE'S OWN BANK, LIVE (#707) — the
 * same fix as testRodLaneBankScale's, on a DIFFERENT rendering path. That check reads the rod
 * TREND-CHART lane's drawn top; this one reads the Rod Limit Margin ROW's own scanner-detail
 * prose in the Indications tab ("Indicating range 0 steps to 627 steps."), built by
 * indicationFacts() (ui/app.js) through bankScale() rather than the generated manual
 * reference's static [0, 912] (ui/manual_data.js — the RETIRED engine's 912-fine-step drive).
 * A one-off Playwright probe proved the fix at the time — reading the row's
 * data-scanner-detail attribute, "0 steps to 912 steps" before, "0 steps to 627 steps" after —
 * but was never committed, so nothing gates this string and it can regress silently: the same
 * `/\(partial\)/` shape CLAUDE.md records, where a source scan cannot prove a rendered string
 * is reachable.
 *
 * TWO CHECKS, and #707's own ruling makes the SECOND the one that matters — hard-coding the
 * new literal is exactly how the old one got here, so "it says 627" is not enough:
 *   1. NOT the retired engine's 912-step literal.
 *   2. THE STRING FOLLOWS THE ENGINE. `RD.pwr2.kinetics.RODS.max_steps` is moved under the
 *      running plant (the same poke testRodLaneBankScale's check 3 uses), then a Free Play
 *      reset re-triggers buildIndications() — the row's text is built once per plant rebuild,
 *      not per broadcast, so the poke alone changes nothing on screen until the plant rebuilds.
 *      A captured 627 passes check 1 and fails this one.
 *
 * PROVED BY INJECTION, 2026-09-11: pointing indicationFacts() at `ind.range` (the generated
 * static [0, 912]) instead of bankScale() reds check 1, reading "0 steps to 912 steps"; a
 * literal 627 in bankScale()'s place passes check 1 and reds check 2 — the string never moves
 * when the bank does.
 */
async function testRodLimitMarginIndicationRange(page) {
  var log = [];
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&init=hot_full_power' +
                  '&run=1&dev=1', { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);
  await page.click('[data-tab="indications"]');
  await page.waitForTimeout(600);

  function readDetail() {
    return page.evaluate(function () {
      var row = document.querySelector('#indicationsList .num-line[data-ser="rod_margin"]');
      return row ? row.getAttribute('data-scanner-detail') : null;
    });
  }

  var before = await readDetail();
  if (!before) {
    throw new Error('no Rod Limit Margin row (data-ser="rod_margin") in the Indications tab, or it carries no data-scanner-detail');
  }
  if (/\b912\b/.test(before)) {
    throw new Error('Rod Limit Margin\'s indicating range still reads the retired engine\'s 912-step literal: "' + before + '"');
  }
  var m = /Indicating range 0 steps to (\d+) steps/.exec(before);
  if (!m) {
    throw new Error('Rod Limit Margin\'s scanner detail carries no "Indicating range 0 steps to N steps." sentence: "' + before + '"');
  }
  var shipped = parseFloat(m[1]);
  if (!(shipped > 0)) throw new Error('parsed a non-positive bank (' + shipped + ') from: "' + before + '"');
  log.push('shipped: "' + before + '" (bank ' + shipped + ' steps)');

  /* ---- the discriminator: move the ONE place the bank is defined, let a broadcast publish
   * it (indicationFacts() reads `latest`, not a live function, so the row text will not move
   * until the NEXT rebuild sees a `latest` that already carries the moved bank), then rebuild
   * the tab through a real Free Play reset — the path a player's own Reset takes, not a
   * synthetic hook. */
  var moved = await page.evaluate(function (factor) {
    var R = window.RD.pwr2.kinetics.RODS, was = R.max_steps;
    R.max_steps = Math.round(was * factor);
    return { was: was, now: R.max_steps };
  }, 2.5);
  await page.waitForTimeout(1500);      // >= one broadcast, so `latest` carries the moved bank
  await page.click('#mainMenuBtn');
  await page.waitForTimeout(400);
  if (!(await page.isVisible('#missionOverlay'))) throw new Error('could not reopen Plant & Mission to reset the plant');
  await page.click('[data-mfree]');
  await waitBoardLive(page, 20000);
  await page.click('[data-tab="indications"]');
  await page.waitForTimeout(600);

  var after = await readDetail();
  log.push('bank ' + moved.was + ' -> ' + moved.now + ' steps, plant reset through Free Play: "' + after + '"');
  var m2 = /Indicating range 0 steps to (\d+) steps/.exec(after || '');
  if (!m2) {
    throw new Error('Rod Limit Margin lost its indicating-range sentence after the bank moved: "' + after + '"');
  }
  var movedRead = parseFloat(m2[1]);
  if (movedRead === shipped) {
    throw new Error('the indicating range did NOT follow the bank: it stayed at ' + shipped +
      ' steps while RD.pwr2.kinetics.RODS.max_steps went ' + moved.was + ' -> ' + moved.now +
      '. That is a range CAPTURED once (a hard-coded 627), the exact mechanism #707 forbids.');
  }
  if (movedRead !== moved.now) {
    throw new Error('the indicating range followed the bank to the wrong number: row reads ' +
      movedRead + ', plant published ' + moved.now);
  }
  log.push('range follows the engine: ' + shipped + ' -> ' + movedRead + ' steps, matching the moved bank exactly');
  return log.join('\n') + '\n';
}

async function testCssTransitions(page) {
  var log = [];
  var url = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&init=hot_full_power&run=1&dev=1';
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);
  /* 10x through the SHIPPED segment, so the cadence under test is a player's. */
  if (await page.$('#speed [data-speed="10"]')) await page.click('#speed [data-speed="10"]');
  await page.waitForTimeout(1500);

  var counts = [], offenders = [], census = {};
  for (var i = 0; i < 10; i++) {
    var s = await page.evaluate(function () {
      if (!document.getAnimations) return { unsupported: true, rows: [] };
      var run = document.getAnimations().filter(function (a) {
        return a.playState === 'running' && a.constructor && a.constructor.name === 'CSSTransition';
      });
      return { unsupported: false, rows: run.map(function (a) {
        var el = a.effect && a.effect.target;
        var tag = el ? String(el.tagName || '?').toLowerCase() : '?';
        return { prop: String(a.transitionProperty || '?'), tag: tag,
                 stage: !!(el && el.closest && el.closest('.pwr-board-stage')) };
      }) };
    });
    if (s.unsupported) throw new Error('#613: document.getAnimations() is unavailable — this check cannot run');
    counts.push(s.rows.length);
    s.rows.forEach(function (r) {
      var k = r.prop + ' @ ' + r.tag + (r.stage ? ' [board]' : '');
      census[k] = (census[k] || 0) + 1;
      if (r.stage && /^(rect|line|g)$/.test(r.tag) && /^(height|y|transform)$/.test(r.prop)) {
        if (offenders.indexOf(k) < 0) offenders.push(k);
      }
    });
    await page.waitForTimeout(200);
  }
  var top = Object.keys(census).sort(function (a, b) { return census[b] - census[a]; }).slice(0, 6);
  log.push('running CSSTransitions across 10 samples: ' + counts.join(', '));
  log.push(top.length ? 'targets: ' + top.map(function (k) { return census[k] + 'x ' + k; }).join(' | ') : 'targets: none');

  if (offenders.length) {
    throw new Error('#613: a broadcast-cadence CSS transition is live on the board: ' + offenders.join(', ') +
      ' — a transition may only ride a property that changes on a DISCRETE event ' +
      '(see std_pipe.js tickAnimations). Samples: ' + counts.join(','));
  }
  var worst = Math.max.apply(null, counts);
  if (worst > 2) {
    throw new Error('#613: ' + worst + ' CSS transitions were running at once (ceiling 2) — samples ' +
      counts.join(',') + '; targets ' + top.join(' | ') +
      '. Something is transitioning a value rewritten every broadcast.');
  }
  return log.join('\n') + '\n';
}

/* START A WALKTHROUGH AND LAND ON ITS CARD — the three-step dance every walkthrough check in
 * this file repeats. `start_checklist` alone is not enough: the run card is drawn behind
 * `cklState.view === 'run'`, a UI-local flag only `startChecklist()` sets, so the Walkthroughs
 * tab's own entry has to be clicked. It is clicked THROUGH THE PAGE rather than by
 * `page.click`, because a leg whose preconditions are unmet wears `.ckl-gated` and is HIDDEN —
 * Playwright's actionability check waits for visibility and times out, while the delegated
 * `data-ckl-start` listener at document.body does not care (measured: pwr_startup, 26 polls
 * against a hidden button). */
async function startWalkthrough(page, procId) {
  var started = await page.evaluate(function (p) {
    try {
      var svc = globalThis.RD.__dev.service();
      svc.attentionStops = false;
      svc.handleCommand({ action: 'stop_checklist' });
      var r = svc.handleCommand({ action: 'start_checklist', procedure_id: p });
      return { ok: !(r && r.type === 'error'), msg: r && r.message };
    } catch (e) { return { ok: false, msg: String(e) }; }
  }, procId);
  if (!started.ok) throw new Error('fixture: start_checklist ' + procId + ' failed — ' + started.msg);
  await page.click('#tabbar [data-tab="checklists"]');
  await page.waitForSelector('[data-ckl-start="' + procId + '"]', { timeout: 15000, state: 'attached' });
  await page.evaluate(function (p) { document.querySelector('[data-ckl-start="' + p + '"]').click(); }, procId);
  await page.waitForFunction(function () {
    var b = document.querySelector('#tabbar button.on');
    return !!b && b.getAttribute('data-tab') === 'instructor' && !!document.querySelector('.ckl-step.ckl-active');
  }, { timeout: 20000, polling: 200 });
}

/* #687 — THE WALKTHROUGH PANEL'S CHROME. Four owner complaints (2026-09-09 playtest sheet §A),
 * every one of them a claim about what is DRAWN and WHERE, so every one of them invisible to
 * every Node runner in this repo.
 *
 * ON THE FLICKER, SAID PLAINLY: the filed mechanism — `renderInstructorInner` falling through to
 * a later branch on a broadcast with no `s.instructor.checklist` — DID NOT REPRODUCE.
 * `s.instructor.checklist` was non-null on 308 of 308 broadcasts across a full ride (step
 * advances, five speed changes, pause/resume cycles) and `#instrRole` read "Walkthrough" on all
 * 1108 sampled frames with its opacity, visibility and box unmoved. What the same sweep DID
 * measure is below, and both halves are pinned here:
 *
 *   - `#instrRole`'s TEXT NODE was destroyed and recreated on EVERY broadcast — 207 records
 *     against 208 broadcasts — because `setInstrRole` assigned `textContent` unguarded. That is
 *     a 10 Hz (20 Hz on the transient cadence) rebuild of the exact node the owner reports
 *     blinking, and it is the only per-broadcast writer in that header. Change-guarded now.
 *   - `#clock` carried `animation: pulse 2s infinite` (opacity 1.0 <-> 0.6) for as long as the
 *     plant ran: 576 opacity transitions over 50 s, sampled per animation frame. THAT is "other
 *     UI elements like the time keep doing the same", and it is not a walkthrough defect at all.
 *
 * A source scan cannot settle any of this: the heading's absence is a computed `display`, the
 * button order is two rectangles, and an animation is a resolved `animationName`. */
async function testWalkthroughPanelChrome(page) {
  var log = [];
  var base = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&run=1&dev=1';
  await page.goto(base, { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);

  /* THE CLOCK FIRST, BEFORE ANY WALKTHROUGH — it is a free-play defect and pinning it inside a
   * walkthrough would let a future change hide it behind the checklist branch. */
  var clk = await page.evaluate(function () {
    var c = document.getElementById('clock');
    var out = { running: c.classList.contains('running'), accel: c.classList.contains('accel'),
                anim: getComputedStyle(c).animationName, opacity: getComputedStyle(c).opacity,
                color: getComputedStyle(c).color };
    /* the SAME element with `running` taken off, so "the running clock is coloured" is a
     * difference rather than a reading of whatever the clock is coloured anyway */
    c.classList.remove('running');
    out.offColor = getComputedStyle(c).color;
    if (out.running) c.classList.add('running');
    /* --running resolved through the cascade, so the assertion names the token the fix chose
     * rather than a hex literal copied into a test */
    var probe = document.createElement('span');
    probe.style.color = 'var(--running)';
    document.body.appendChild(probe);
    out.runningToken = getComputedStyle(probe).color;
    probe.remove();
    return out;
  });
  if (!clk.running) throw new Error('#687 control: the clock is not marked running, so this check would pass on a stopped plant');
  if (clk.anim !== 'none') {
    throw new Error('#687: the running clock is animating ("' + clk.anim + '") — an indefinite ' +
      'opacity fade on a always-on readout is the "the time keeps appearing and disappearing" report');
  }
  /* AND THE THING THAT REPLACED THE FADE IS ASSERTED, not just the fade's absence (quality pass,
   * 2026-09-11). PROVED HOLLOW by injection: with only the `animationName !== 'none'` test above,
   * deleting `.clock.running { color: var(--running) }` left this check GREEN — so the running
   * plant's only remaining cue on the clock could go silently and the gate would agree. #687's
   * own argument for removing the animation is that "a steady colour carries the same fact with
   * no motion"; that colour is half the fix and it now reds if it goes. `.accel` legitimately
   * wins by source order, so the token is only demanded when the clock is not accelerated —
   * either way the running clock must not read the same as a stopped one. */
  if (clk.color === clk.offColor) {
    throw new Error('#687: the running clock is not distinguished from a stopped one — both read ' +
      clk.color + '. The pulse animation was removed in favour of a steady colour; with the colour ' +
      'gone too there is no running cue on the clock at all.');
  }
  if (!clk.accel && clk.color !== clk.runningToken) {
    throw new Error('#687: the running clock reads ' + clk.color + ', not the board\'s --running ' +
      'green (' + clk.runningToken + ') — .clock.running lost the colour that replaced the fade');
  }
  log.push('clock: running, animationName ' + clk.anim + ', opacity ' + clk.opacity +
           ', colour ' + clk.color + ' (--running ' + clk.runningToken + '; stopped reads ' + clk.offColor + ')');

  /* ---- setInstrRole's change guard, MEASURED WHERE THE FUNCTION IS ACTUALLY CALLED --------
   *
   * Not during the walkthrough, and that is the whole point: the walkthrough branch no longer
   * calls setInstrRole at all (it goes headerless), so a churn assertion taken there is HOLLOW —
   * PROVED by injection, 2026-09-11: reverting the guard to the unconditional write left this
   * check GREEN at 0 mutations, because nothing was writing. The FOLLOW branch
   * (`setInstrRole(prF.title)`) runs once per broadcast for as long as a procedure is followed,
   * which is the state the unguarded write was measured in (207 records / 208 broadcasts). */
  var followed = await page.evaluate(function () {
    var svc = globalThis.RD.__dev.service();
    svc.attentionStops = false;
    var r = svc.handleCommand({ action: 'start_follow', procedure_id: 'pwr_startup' });
    return { ok: !(r && r.type === 'error'), msg: r && r.message };
  });
  if (!followed.ok) throw new Error('#687 fixture: start_follow pwr_startup failed — ' + followed.msg);
  await page.waitForTimeout(700);
  await page.evaluate(function () {
    var W = globalThis.__wtChrome = { mut: 0, bc: 0, role: null };
    var r = document.getElementById('instrRole');
    W.role = r.textContent;
    new MutationObserver(function (recs) { W.mut += recs.length; })
      .observe(r, { childList: true, characterData: true, subtree: true });
    globalThis.RD.__dev.service().subscribe(function () { W.bc++; });
  });
  await page.waitForTimeout(2200);
  var churn = await page.evaluate(function () { return globalThis.__wtChrome; });
  if (churn.bc < 8) {
    throw new Error('#687 control: only ' + churn.bc + ' broadcasts landed in 2.2 s — the plant is ' +
      'not ticking, so the churn check could not fail');
  }
  if (!churn.role || churn.role === 'Instructor') {
    throw new Error('#687 control: the follow branch did not name the procedure in the header ' +
      '("' + churn.role + '"), so setInstrRole is not the per-broadcast writer this measures');
  }
  if (churn.mut > 2) {
    throw new Error('#687: the persona role node was rewritten ' + churn.mut + ' times over ' +
      churn.bc + ' broadcasts (ceiling 2) — setInstrRole is writing textContent unguarded');
  }
  log.push('role node under follow ("' + churn.role + '"): ' + churn.mut + ' mutations over ' +
           churn.bc + ' broadcasts');
  await page.evaluate(function () { globalThis.RD.__dev.service().handleCommand({ action: 'stop_follow' }); });
  await page.waitForTimeout(400);

  await startWalkthrough(page, 'pwr_heatup');
  await page.waitForTimeout(900);

  var r = await page.evaluate(function () {
    function box(sel) {
      var el = document.querySelector(sel); if (!el) return null;
      var rc = el.getBoundingClientRect();
      return { top: Math.round(rc.top), bottom: Math.round(rc.bottom), h: Math.round(rc.height),
               text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) };
    }
    var persona = document.querySelector('#instructorCard .persona');
    return {
      role: (document.getElementById('instrRole') || {}).textContent,
      personaDisplay: persona ? getComputedStyle(persona).display : null,
      instrBody: box('#instructorCard .instr-body'),
      instrLog: box('#instrLog'),
      cklBtns: box('#cklBtns'),
      stopInBtns: !!document.querySelector('#cklBtns [data-ckl-stop]'),
      stopInCard: !!document.querySelector('#cklRun [data-ckl-stop]'),
      why: box('.ckl-active .ckl-why'),
      whyLbl: box('.ckl-active .ckl-why-lbl'),
      ackRow: box('.ckl-active .ckl-ack-row'),
      stepTxt: box('.ckl-active .ckl-txt'),
    };
  });
  /* positive control: the card really is drawn, with a why on the active step — without this
   * every "is A below B" test below passes vacuously on a panel that rendered nothing */
  if (!r.stepTxt || !r.why || !r.ackRow || !r.instrBody) {
    throw new Error('#687 control: the active walkthrough step did not render its text/why/buttons — ' +
                    JSON.stringify(r));
  }

  /* ---- item 1a: no "Walkthrough" heading, and no empty strip left behind ---------------- */
  if (/walkthrough/i.test(r.role || '') || r.personaDisplay !== 'none') {
    throw new Error('#687 item 1: the persona header is still drawn during a walkthrough — role "' +
      r.role + '", display ' + r.personaDisplay);
  }
  log.push('header: persona display ' + r.personaDisplay + ' (role text parked at "' + r.role + '")');

  /* ---- item 2: End walkthrough at the bottom of the SPACE, not of the card -------------- */
  if (!r.cklBtns || !r.stopInBtns || r.stopInCard) {
    throw new Error('#687 item 2: the End-walkthrough row is not in #cklBtns — ' +
      'inBtns=' + r.stopInBtns + ' inCard=' + r.stopInCard);
  }
  if (r.cklBtns.top < r.instrLog.bottom) {
    throw new Error('#687 item 2: the End-walkthrough row (top ' + r.cklBtns.top + ') is ABOVE the ' +
      'transcript (bottom ' + r.instrLog.bottom + ') — it is at the bottom of the card, not of the space');
  }
  /* THE EFFECT IS THE ASSERTION, AND TWO MECHANISMS CAN DELIVER IT (quality pass, 2026-09-11).
   * This test is right and stays; only its error message was wrong, because it blamed
   * `margin-top: auto` — which it cannot see.
   *
   * MEASURED THREE WAYS, each restored:
   *   - `margin-top: auto` deleted            -> GREEN, IDENTICAL numbers (921 / 931 / 889). The
   *     row is at the floor because `.instr-log` is `flex: 1 1 0` and eats every free pixel; auto
   *     margins only take what flex-grow left over, and computed marginTop is `0px` at viewport
   *     heights 950, 1200, 760 and 640.
   *   - `.instr-log` dropped to `flex: 0 0 auto` -> GREEN. Now the auto margin DOES absorb the
   *     free space (96 / 282 / 14 px at those heights) and holds the row down on its own.
   *   - BOTH removed                          -> RED, "floats 97 px above the panel floor".
   *
   * So this reds when NEITHER reaches the row, which is the right bar: the owner asked for the
   * button at the bottom of the space, not for a particular declaration. Do not narrow it to one
   * mechanism — that is how a check starts pinning a stylesheet instead of a layout. */
  if (r.instrBody.bottom - r.cklBtns.bottom > 24) {
    throw new Error('#687 item 2: the End-walkthrough row floats ' +
      (r.instrBody.bottom - r.cklBtns.bottom) + ' px above the panel floor (ceiling 24) — ' +
      'nothing is pushing it down any more: #instrLog above it has stopped being the growing ' +
      'child of .instr-body AND the row is not absorbing the free space with margin-top:auto ' +
      '(either one alone holds it at the floor; measured, both do)');
  }
  log.push('End walkthrough: bottom ' + r.cklBtns.bottom + ' vs panel floor ' + r.instrBody.bottom +
           ', below the transcript (' + r.instrLog.bottom + ')');

  /* ---- item 3: Rewind + Continue BELOW the why, not above it ---------------------------- */
  if (r.ackRow.top < r.why.bottom) {
    throw new Error('#687 item 3: Rewind/Continue (top ' + r.ackRow.top + ') is drawn ABOVE the ' +
      'why block (bottom ' + r.why.bottom + ')');
  }
  if (r.ackRow.top < r.stepTxt.bottom) {
    throw new Error('#687 item 3: Rewind/Continue is drawn above the numbered step text');
  }
  log.push('buttons: step text ends ' + r.stepTxt.bottom + ' -> why ends ' + r.why.bottom +
           ' -> Rewind/Continue at ' + r.ackRow.top);

  /* ---- item 4: the why is LABELLED (landed at #692; pinned here so it cannot silently go) */
  if (!r.whyLbl || !r.whyLbl.text) {
    throw new Error('#687 item 4: the why block carries no visible label — it reads as another step');
  }
  log.push('why label: "' + r.whyLbl.text + '"');

  /* ---- the header comes back, and the row goes, when the run ends ----------------------- */
  await page.evaluate(function () { document.querySelector('#cklBtns [data-ckl-stop]').click(); });
  await page.waitForTimeout(700);
  var after = await page.evaluate(function () {
    var b = document.getElementById('cklBtns'), p = document.querySelector('#instructorCard .persona');
    return { personaDisplay: p ? getComputedStyle(p).display : null,
             role: (document.getElementById('instrRole') || {}).textContent,
             btnsH: b ? Math.round(b.getBoundingClientRect().height) : null,
             btnsHtml: b ? b.innerHTML.length : null };
  });
  if (after.personaDisplay === 'none' || !after.role) {
    throw new Error('#687 item 1: the persona header did not come back when the walkthrough ended — ' +
      JSON.stringify(after));
  }
  if (after.btnsH !== 0 || after.btnsHtml !== 0) {
    throw new Error('#687 item 2: the End-walkthrough row outlived the run (' + after.btnsH + ' px, ' +
      after.btnsHtml + ' chars) — it is a sibling of the card now and has to be torn down by name');
  }
  log.push('teardown: header back as "' + after.role + '", button row emptied');
  return log.join('\n') + '\n';
}

/* #656 — THE ACKNOWLEDGE BUTTON ON A STEP WITH NO PREDICATE.
 *
 * Reported from the third layman playthrough (2026-09-07): an observation step that completes on
 * its dwell showed no done-when line, no Acknowledge and no Next, and `[data-ckl-check]` returned
 * ZERO until the player pressed "Show all details" — an unrelated button. From the player's seat
 * the leg could not be finished.
 *
 * IT DOES NOT REPRODUCE ON THIS TREE, and the reason is dated: #660 items 17-18 (2026-09-08, the
 * day after the report) made Rewind + Continue unconditional on every active step, where the card
 * used to draw the acknowledge row only while `ck.awaiting_ack`. Swept 2026-09-11 in headless
 * Edge over 53 steps of three legs (pwr_raise_power, pwr_startup, pwr_tmi2_incident), including
 * the six steps in the pwr2 pool that carry NO acceptance predicate at all: the button is drawn
 * 86x23 on every one of them, outside any collapsible block.
 *
 * So this check exists to keep it that way, and it is deliberately written against the WORST
 * case the report names rather than against a convenient step: a step whose acceptance list is
 * empty, read with the details at their default state, before anything is expanded. The
 * pre-#660 conditional is what turns it red. */
async function testObservationStepAckButton(page) {
  var log = [];
  var base = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&run=1&dev=1';
  await page.goto(base, { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);
  await startWalkthrough(page, 'pwr_tmi2_incident');

  /* Find the step the report is about — NO predicate, so nothing can grade it and the only way
   * off it is the button. Derived from the running pool, never a hand-written index: the legs
   * are re-authored constantly (#692 rewrote this one), and a pinned index would quietly drift
   * onto a step with an acceptance and stop testing the class. */
  var target = await page.evaluate(function () {
    var steps = globalThis.RD.__dev.service().instructor.checklist.proc.steps;
    for (var i = 0; i < steps.length; i++) {
      var st = steps[i];
      if (!st.acc && !(st.accs && st.accs.length)) return { i: i, text: String(st.text).slice(0, 60) };
    }
    return null;
  });
  if (!target) {
    throw new Error('#656 control: pwr_tmi2_incident carries no predicate-free step any more — ' +
      'repoint this check at a leg that does, or the class is untested');
  }
  log.push('target: step ' + (target.i + 1) + ' (no acceptance predicate) — "' + target.text + '"');

  await page.evaluate(function (i) {
    var c = globalThis.RD.__dev.service().instructor.checklist;
    c.idx = i;
    for (var k = 0; k < c.done.length; k++) c.done[k] = k < i;
  }, target.i);
  await page.waitForTimeout(800);

  var r = await page.evaluate(function () {
    var c = globalThis.RD.__dev.service().instructor.checklist;
    var mk = document.querySelector('.ckl-step.ckl-active [data-ckl-check]');
    var rc = mk ? mk.getBoundingClientRect() : null;
    return {
      idx: c.idx,
      anyCheck: document.querySelectorAll('[data-ckl-check]').length,
      inActive: !!mk,
      w: rc ? Math.round(rc.width) : 0, h: rc ? Math.round(rc.height) : 0,
      disp: mk ? getComputedStyle(mk).display : null,
      inCollapsible: !!(mk && mk.closest('details')),
      text: mk ? mk.textContent.trim() : null,
    };
  });
  if (r.idx !== target.i) {
    throw new Error('#656 control: the card is not on the target step (' + r.idx + ' vs ' + target.i + ')');
  }
  if (!r.inActive || r.w <= 0 || r.h <= 0 || r.disp === 'none') {
    throw new Error('#656: a step with no acceptance predicate drew NO usable Acknowledge/Continue ' +
      'button before any details were expanded — ' + JSON.stringify(r) +
      ' (this is "from a player\'s seat the leg had no way to finish")');
  }
  if (r.inCollapsible) {
    throw new Error('#656: the Acknowledge/Continue button is inside a collapsible details block — ' +
      'it is only reachable once the player expands something unrelated');
  }
  log.push('drawn on first paint: "' + r.text + '" ' + r.w + 'x' + r.h + ', ' + r.anyCheck +
           ' check target(s) in the DOM, not inside a collapsible');

  await page.evaluate(function () { globalThis.RD.__dev.service().handleCommand({ action: 'stop_checklist' }); });
  return log.join('\n') + '\n';
}

/* #713/#712: the 1/M plot's geometry — the letterbox, the axis gutters, and #712's
 * general risk that this repo has no gate for, a caption or readout overflowing its own box. The
 * panel's longest string is the prediction readout, so that is the one to stress.
 *
 * THE FIXTURE HAS TO BE THE PANEL'S OWN READOUT, NOT A STRING POKED INTO `#oomPred` (#724
 * quality pass, finding 1). It used to be the latter, and after #724 item 7 that silently stopped
 * testing anything: the panel now re-renders when a sibling row's height moves, and render()
 * REWRITES the readout from the live fit — which, on a plant with no plotted points, is the empty
 * string. MEASURED at the old fixture's own measurement moment: `#oomPred` empty, `display:none`,
 * height 0, so the overflow check compared `0 > 0 + 1` (false for ever) and the letterbox check
 * measured the geometry of a panel with NO readout at all. Both green, neither looking at the
 * state they were written for.
 *
 * So this boots a SUBCRITICAL plant and plots two real points with a rod withdrawal between them,
 * which is the only way to make the panel author a prediction itself. Everything downstream then
 * measures the panel a player actually gets. The readout being non-empty is asserted, not assumed
 * — that is the specific way this check went hollow, and it must not do it again quietly.
 *
 * `hot_zero_power`, not `hot_full_power`: above ~1e5 cps the source range secures itself and the
 * panel refuses to plot (#641), so the old initial condition could never have produced a point. */
async function testOneOverMGeometry(page) {
  var log = [];
  var url = 'http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&init=hot_zero_power&dev=1';
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);

  /* Two real points: baseline, withdraw, settle, plot again. The withdrawal is what makes the
   * count rate move, and without a moving count rate the second point lands on top of the first
   * and no fit exists. */
  await page.evaluate(function () {
    if (!(window.RD && RD.OneOverM)) return;
    RD.OneOverM.open();
    var b = document.querySelector('[data-oom="plot"]');
    if (b) b.click();
    RD.__dev.service().handleCommand({ action: 'rod_nudge', group_id: 'control', steps: 140, speed: 'fast' });
  });
  await page.waitForTimeout(3000);
  await page.evaluate(function () {
    var b = document.querySelector('[data-oom="plot"]');
    if (b) b.click();
  });
  await page.waitForTimeout(600);

  var geo = await page.evaluate(function () {
    function rect(sel) {
      var el = document.querySelector(sel);
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    }
    if (!(window.RD && RD.OneOverM)) return { error: 'RD.OneOverM missing' };
    function overflowOf(sel) {
      var el = document.querySelector(sel);
      if (!el) return null;
      return { scrollW: el.scrollWidth, clientW: el.clientWidth, scrollH: el.scrollHeight, clientH: el.clientHeight };
    }
    var btnOverflow = Array.prototype.map.call(document.querySelectorAll('.oom-foot .btn'), function (b) {
      return { text: b.textContent, over: b.scrollWidth > b.clientWidth + 1 };
    });
    var svgEl = document.querySelector('.oom-svg');
    return {
      floating: !document.querySelector('.oom-win.oom-docked') &&
                (document.getElementById('oomWin') || {}).parentNode === document.body &&
                getComputedStyle(document.getElementById('oomWin')).position === 'fixed',
      headCursor: getComputedStyle(document.querySelector('.oom-head')).cursor,
      svg: rect('.oom-svg'),
      /* The plotted-DATA rectangle, in CSS px: .oom-frame is the rect render() draws at
       * (L, T, W-L-R, H-T-B), so measuring it measures the letterbox and the axis gutters
       * together, in the one number the owner actually sees. */
      frame: rect('.oom-frame'),
      viewBox: svgEl ? svgEl.getAttribute('viewBox') : null,
      pred: overflowOf('#oomPred'),
      predText: (document.querySelector('#oomPred') || {}).textContent || '',
      predRect: rect('#oomPred'),
      win: overflowOf('.oom-win'),
      btnOverflow: btnOverflow,
    };
  });

  if (geo.error) throw new Error('#713: ' + geo.error);
  /* FLOATING AND DRAGGABLE, ALWAYS *(OWNER RULING, 2026-09-13: "let's make the card floating and
   * dragable like it was originally")*. This assertion used to require the OPPOSITE — that the
   * panel had docked — under #724 item 7, and before that #660 item 13 docked it into the bottom
   * row. Both are superseded. It is asserted three ways because "not docked" alone would pass on a
   * panel that had simply failed to mount: parented to <body>, position:fixed, and a title bar
   * whose cursor still says `move`. THE CURSOR IS THE HALF THE OWNER NAMED — "dragable" — and it is
   * the half a re-dock would silently take away, because the dock's own rule set
   * `.oom-head { cursor: default }` and its pointerdown handler returned early. */
  if (!geo.floating) {
    throw new Error('#713: the 1/M panel is not a floating window — it must be parented to <body> ' +
      'with position:fixed and no dock class (OWNER RULING 2026-09-13: "let\'s make the card ' +
      'floating and dragable like it was originally"). Do not re-add a dock without a newer ruling.');
  }
  if (geo.headCursor !== 'move') {
    throw new Error('#713: the 1/M title bar reads cursor:' + geo.headCursor + ', not `move` — the ' +
      'window is not advertising that it can be dragged, which is the half of the ruling the owner ' +
      'named explicitly. The retired dock set `cursor: default` here; check nothing has re-added it.');
  }

  /* THE PRECONDITION, AND IT IS THE POINT (#724 quality pass, finding 1). Every check below reads
   * a panel whose readout is supposed to be the longest string it draws. When the readout is
   * EMPTY it is `display:none` with a zero box, and each of those checks then passes on a state
   * it was not written for — the overflow test compares 0 against 0, and the letterbox test
   * measures a cell 47 px taller than the one a player with a prediction on screen is looking at.
   * That is exactly how this check went hollow once. Assert it rather than hoping. */
  if (!/predicted criticality|insufficient trend/.test(geo.predText) ||
      !(geo.predRect && geo.predRect.h > 0)) {
    throw new Error('#713/#712: the 1/M readout is empty (' + JSON.stringify(geo.predText) +
      ', height ' + (geo.predRect ? Math.round(geo.predRect.h) : 'null') + ') — the two points this ' +
      'fixture plots did not produce one, so every geometry check below would be measuring a panel ' +
      'with NO readout row. Check that the rod withdrawal moved the source-range count rate and ' +
      'that the plot button was accepted; do NOT satisfy this by writing #oomPred directly, which ' +
      'is the no-op this assertion exists to prevent (render() rewrites it from the live fit).');
  }
  log.push('oom-svg box: ' + Math.round(geo.svg.w) + 'x' + Math.round(geo.svg.h) +
           ', readout "' + geo.predText + '" ' + Math.round(geo.predRect.h) + 'px tall');

  geo.btnOverflow.forEach(function (b) {
    if (b.over) throw new Error('#713/#712: button "' + b.text + '" overflows its box in the 1/M panel');
  });
  if (geo.pred && geo.pred.scrollW > geo.pred.clientW + 1) {
    throw new Error('#713/#712: the prediction readout overflows its box horizontally: scrollWidth ' +
      geo.pred.scrollW + ' > clientWidth ' + geo.pred.clientW);
  }
  if (geo.win && geo.win.scrollW > geo.win.clientW + 1) {
    throw new Error('#713/#712: the 1/M panel overflows its own box horizontally: scrollWidth ' +
      geo.win.scrollW + ' > clientWidth ' + geo.win.clientW);
  }

  // Regression floor: measured 177px at the default --bottomrow-h (230px) after #713; was
  // ~141px before it (300px-wide dock, buttons in a footer below the svg). Set well below
  // the measurement so ordinary tuning doesn't retrip it.
  if (geo.svg.h < 160) {
    throw new Error('#713: the 1/M plot is only ' + Math.round(geo.svg.h) + 'px tall ' +
      'height — expected >= 160px (measured 177px after #713; ~141px before it)');
  }
  log.push('no overflow in the 1/M panel; plot height ' + Math.round(geo.svg.h) + 'px >= 160px floor');

  /* PASS 2 (#713). Two things pass 1 left on the table, and one invariant each.
   *
   * (a) THE LETTERBOX. Kept, though the mechanism that caused it is retired: the DOCKED svg was
   * stretched into a grid cell of the column's aspect, and preserveAspectRatio then padded whatever
   * the viewBox did
   * not match: 33.2px of dead width at the default row height before this, and the waste SWAPS
   * AXIS as the operator drags (96.5px of dead HEIGHT at --bottomrow-h 350px). So the viewBox
   * now follows the cell (one_over_m.js syncViewBox) and the assertion is on the waste itself,
   * not on a width — a width floor would have passed happily on a box whose gain went into a
   * taller letterbox instead. Measured after: 0.2px x 0.0px. 24px is a long way below the
   * 33.2px this replaces and a long way above rounding. */
  /* Absence is a RED here, not a skip. Both assertions below read elements render() draws, so
   * "no .oom-frame" and "no viewBox" are exactly the states in which a guarded `if` would have
   * reported a clean pass over nothing. */
  var vb = (geo.viewBox || '').trim().split(/\s+/).map(Number);
  if (!geo.svg || vb.length !== 4 || !vb.every(isFinite)) {
    throw new Error('#713 pass 2: the 1/M svg has no usable viewBox (' + geo.viewBox + ') — ' +
      'the letterbox check cannot run, which is not the same as passing.');
  }
  if (!geo.frame || !(geo.frame.w > 0)) {
    throw new Error('#713 pass 2: .oom-frame (the plotted-data rectangle render() draws) is absent or ' +
      'zero-width — the geometry checks below have nothing to measure. render() is not drawing.');
  }
  {
    var scale = Math.min(geo.svg.w / vb[2], geo.svg.h / vb[3]);
    var waste = { x: geo.svg.w - vb[2] * scale, y: geo.svg.h - vb[3] * scale };
    if (waste.x > 24 || waste.y > 24) {
      throw new Error('#713 pass 2: the 1/M plot is letterboxed inside its own box — ' +
        Math.round(waste.x) + 'px of dead width and ' + Math.round(waste.y) + 'px of dead height ' +
        '(svg box ' + Math.round(geo.svg.w) + 'x' + Math.round(geo.svg.h) + ', viewBox ' + geo.viewBox +
        '). The viewBox must follow the cell aspect; ceiling 24px, measured 0.2x0.0 after the fix ' +
        'and 33.2x0.0 before it.');
    }
    log.push('letterbox waste ' + waste.x.toFixed(1) + 'x' + waste.y.toFixed(1) + 'px (ceiling 24)');
  }

  /* (b) THE AXIS GUTTERS. L/R/T/B are viewBox units reserved for the tick and axis text and
   * were 15.3% of the width. .oom-frame is the rectangle the data is actually drawn in, so it
   * is the one measurement neither failure fools: a wider box whose gain went to the
   * letterbox, or a filled box whose gain went to margins. 291px measured after pass 2, 212px
   * after pass 1; the 250px floor sat between them with room for ordinary tuning.
   *
   * PASS 3 (#713 CI red) gave width back to the alarm panel — see the dock-width comment in
   * ui/shell.css — and .oom-frame fell with it: 291px -> 243px, measured (same 1500x950
   * viewport this gate uses). 220px is the new floor: below pass 3's real value (243px, room
   * for ordinary tuning) and still above pass 1's 212px, so a regression all the way back to
   * pass 1's un-adaptive viewBox still reddens here. Do not raise this back toward 250
   * without the SAME Linux-metrics alarm-panel measurement pass 3 did — that is the whole
   * reason it moved. */
  if (geo.frame.w < 220) {
    throw new Error('#713 pass 3: the 1/M plot draws its data in only ' + Math.round(geo.frame.w) +
      'px of width at the default row height — expected >= 220px (measured 243px after #713 pass 3; ' +
      '291px after pass 2; 212px after pass 1). Check the letterbox AND the L/R gutters in one_over_m.js, ' +
      'or ui/shell.css\'s .oom-win.oom-docked dock width if the alarm panel needs it back.');
  }
  log.push('plotted data rect ' + Math.round(geo.frame.w) + 'x' + Math.round(geo.frame.h) + 'px (width floor 220)');

  /* (c) THE ALARM PANEL UNDER LOAD. Pass 2 takes width back off this panel and hands it to the
   * plot, which is only safe if the panel still renders every tile at a real alarm load — and
   * pass 1's numbers were all taken on a plant showing "— no active alarms —", which is not a
   * state anyone operates in. So: raise them for real (a large LOCA through the app's own
   * ?inject= path; 18 tiles when this was written), then push EVERY label the registry can
   * produce through a live tile and check it fits the column the layout gives it.
   *
   * Reading the labels off RD.PWR_PROTECTION.alarms rather than listing them here is the point.
   * A hand-maintained list of "the long ones" is a gate that tests the list, and it goes
   * quietly stale the first time someone writes a longer alarm. The binding string when this
   * landed was "Overtemperature Limit Approaching" at 179.3px of min-content, against the
   * 184px track minimum in ui/shell.css.
   *
   * PASS 3 (#713, the CI-red this pass fixes): the registry sweep above only ever measures RAW
   * labels, but the board does not always render one raw — the `reactor_trip` tile COMPOSES
   * `label + ' — ' + tripCauseLabel(reason)` at runtime (ui/app.js ~line 3075), and that
   * composed string is not a member of RD.PWR_PROTECTION.alarms at all, so the sweep above
   * could never generate it. It caught the CI overflow ("Reactor Trip — Overtemperature
   * Delta-T (OTΔT)", widest word "Overtemperature") only because a DIFFERENT raw registry
   * label — "Overtemperature Limit Approaching" — happens to share that same widest word by
   * coincidence; a metrics change or a registry edit that removed that one label would have
   * left this gate silently trusting an unmeasured string. So: read the real cause map off
   * `RD.__dev.tripCauses()` (the ?dev=1 hook added alongside this fix, not a hand-copy of
   * ui/app.js's TRIP_CAUSE table — a copy is exactly the staleness this comment is about) and
   * push every `reactor_trip` label × every cause, composed exactly the way app.js composes
   * it, into the same sweep as the raw labels below. */
  await page.goto(url + '&inject=large_loca&ff=300&run=1', { waitUntil: 'networkidle', timeout: 90000 });
  await dismissMission(page);
  await waitBoardLive(page, 20000);
  /* NO DOCK TO RE-OPEN ANY MORE, and the alarm panel is the better for it. This leg used to have
   * to open the 1/M dock before measuring, because the dock took 370px out of this row and an
   * alarm panel measured without it was 652px against the 392px a player actually got. The
   * 2026-09-13 ruling made the plot a floating window, so it takes nothing from this row at any
   * time and the panel measured here is the only width there is. */
  await page.waitForFunction(function () {
    return document.querySelectorAll('.alarm-tile').length >= 8;
  }, { timeout: 20000, polling: 200 }).catch(function () { /* the throws below carry the state */ });
  if (await page.evaluate(function () { return !!document.querySelector('.oom-win.oom-docked'); })) {
    throw new Error('#713: something re-docked the 1/M panel — it is a floating window by owner ' +
      'ruling (2026-09-13) and must never take width from the alarm row again.');
  }

  var al = await page.evaluate(function () {
    var tiles = document.querySelectorAll('.alarm-tile');
    if (!tiles.length) return { n: 0 };
    var defs = (window.RD && RD.PWR_PROTECTION && RD.PWR_PROTECTION.alarms) || [];
    var labels = [];
    var nComposed = 0;
    defs.forEach(function (d) {
      if (d.label_learning) labels.push(d.label_learning);
      if (d.label_industry) labels.push(d.label_industry);
      // #713 pass 3: the reactor_trip tile is the one case app.js appends live text to a
      // registry label (' — ' + the first-out trip cause) rather than rendering the label
      // alone — mirror that composition here, off the SAME map the board renders from
      // (RD.__dev.tripCauses(), the ?dev=1 hook), so the sweep measures what the board can
      // actually put in a tile instead of only what the registry states verbatim.
      if (d.id === 'reactor_trip') {
        var causes = (window.RD && RD.__dev && RD.__dev.tripCauses && RD.__dev.tripCauses()) || {};
        Object.keys(causes).forEach(function (k) {
          if (d.label_learning) { labels.push(d.label_learning + ' — ' + causes[k]); nComposed++; }
          if (d.label_industry) { labels.push(d.label_industry + ' — ' + causes[k]); nComposed++; }
        });
      }
    });
    function over(el) { return el ? el.scrollWidth - el.clientWidth : 0; }
    var organic = [];
    Array.prototype.forEach.call(tiles, function (t) {
      var d = Math.max(over(t), over(t.querySelector('.label')), over(t.querySelector('.meta')));
      if (d > 1) organic.push({ txt: (t.querySelector('.label') || {}).textContent, d: d });
    });
    var t0 = tiles[0], lab0 = t0.querySelector('.label');
    var keep = lab0 ? lab0.textContent : null;
    var worst = { d: -1, txt: '' }, widest = 0;
    if (lab0) {
      labels.forEach(function (str) {
        lab0.textContent = str;
        void t0.offsetWidth;
        var d = Math.max(over(t0), over(lab0));
        if (t0.scrollWidth > widest) widest = t0.scrollWidth;
        if (d > worst.d) worst = { d: d, txt: str };
      });
      lab0.textContent = keep;
    }
    var stack = document.querySelector('.alarm-stack'), panel = document.querySelector('.alarm-panel');
    return {
      n: tiles.length, nLabels: labels.length, nComposed: nComposed, organic: organic, worst: worst,
      widestTile: widest,
      tileW: Math.round(t0.getBoundingClientRect().width),
      panelW: Math.round(panel.getBoundingClientRect().width),
      stackOver: over(stack), panelOver: over(panel),
    };
  });

  /* A count guard, because everything below it is vacuously green on a quiet board — the
   * "assert an absence and pin a non-event" trap. 18 tiles when written; 8 is the floor. */
  if (!al.n || al.n < 8) {
    throw new Error('#713 pass 2: the alarm-load check ran against ' + (al.n || 0) + ' alarm tiles — ' +
      'the large-LOCA injection is meant to raise >= 8 (18 when this was written). The check is ' +
      'vacuous until that is fixed; it is not evidence the panel fits its content.');
  }
  /* A second count guard for pass 3's own half: `RD.__dev.tripCauses()` missing (dev hook
   * renamed, or the check run without &dev=1) would silently drop back to raw-labels-only —
   * the exact "caught it by accident" state this pass exists to end — with no other symptom.
   * 46 composed strings (23 causes x 2 registers) when this landed. */
  if (!al.nComposed) {
    throw new Error('#713 pass 3: zero composed reactor_trip strings were swept — RD.__dev.tripCauses() ' +
      'returned nothing. The check has fallen back to raw registry labels only, which is the coincidence ' +
      'this pass was written to remove.');
  }
  if (al.organic.length) {
    throw new Error('#713 pass 2: ' + al.organic.length + ' of ' + al.n + ' live alarm tiles overflow their ' +
      'box at a ' + al.panelW + 'px alarm panel — worst "' + al.organic[0].txt + '" by ' + al.organic[0].d + 'px');
  }
  if (al.worst.d > 1) {
    throw new Error('#713 pass 2: alarm label "' + al.worst.txt + '" overflows its tile by ' + al.worst.d +
      'px at a ' + al.panelW + 'px alarm panel (' + al.tileW + 'px columns). Either the panel gave up too ' +
      'much width to the 1/M dock, or the .alarm-stack track minimum is below this label min-content.');
  }
  if (al.stackOver > 1 || al.panelOver > 1) {
    throw new Error('#713 pass 2: the alarm panel overflows HORIZONTALLY with ' + al.n + ' alarms up ' +
      '(stack +' + al.stackOver + 'px, panel +' + al.panelOver + 'px) at ' + al.panelW + 'px wide — the ' +
      'two-column stack is meant to fall back to one column, not scroll sideways.');
  }
  log.push(al.n + ' live alarms, ' + al.nLabels + ' registry labels + ' + al.nComposed +
    ' composed reactor_trip strings swept through a tile: none overflow at a ' +
    al.panelW + 'px panel (' + al.tileW + 'px columns, widest label ' + al.widestTile + 'px)');
  return log.join('\n') + '\n';
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
    var mbLog = await testMainMenuButton(page);
    fs.writeFileSync(path.join(SCRATCH, 'main-menu-button.log'), mbLog);
    var msLog = await testMissionMenuShape(page);
    fs.writeFileSync(path.join(SCRATCH, 'mission-menu-shape.log'), msLog);
    var mcLog = await testMissionCloseResumes(page);
    fs.writeFileSync(path.join(SCRATCH, 'mission-close-resumes.log'), mcLog);
    var rsLog = await testRunStartMark(page);
    fs.writeFileSync(path.join(SCRATCH, 'run-start-mark.log'), rsLog);
    var rpLog = await testRewindPicker(page);
    fs.writeFileSync(path.join(SCRATCH, 'rewind-picker.log'), rpLog);
    var ebLog = await testEsfArmButtons(page);
    fs.writeFileSync(path.join(SCRATCH, 'esf-arm-buttons.log'), ebLog);
    var rfLog = await testRefusalReachesTheScanner(page);
    fs.writeFileSync(path.join(SCRATCH, 'refusal-scanner.log'), rfLog);
    var tbLog = await testTripBlockPopoverStaysOffTheBoard(page);
    fs.writeFileSync(path.join(SCRATCH, 'trip-block-overlay.log'), tbLog);
    var tdLog = await testTripBlockPopoverDismissesOnOutsideClick(page);
    fs.writeFileSync(path.join(SCRATCH, 'trip-block-dismiss.log'), tdLog);
    var dbLog = await testDiagBundle(page);
    fs.writeFileSync(path.join(SCRATCH, 'diag-bundle.log'), dbLog);
    var hpLog = await testHeldPlantDialog(page);
    fs.writeFileSync(path.join(SCRATCH, 'held-plant-dialog.log'), hpLog);
    var slLog = await testSaveLoadRefusal(page);
    fs.writeFileSync(path.join(SCRATCH, 'save-load-refusal.log'), slLog);
    var afLog = await testAdvFailPanel(page);
    fs.writeFileSync(path.join(SCRATCH, 'adv-fail-panel.log'), afLog);
    var hsLog = await testHeldSpeedClick(page);
    fs.writeFileSync(path.join(SCRATCH, 'held-speed-click.log'), hsLog);
    var wpLog = await testWalkthroughEventPause(page);
    fs.writeFileSync(path.join(SCRATCH, 'walkthrough-event-pause.log'), wpLog);
    var whLog = await testWalkthroughHoldReleasedOnExit(page);
    fs.writeFileSync(path.join(SCRATCH, 'walkthrough-hold-released-on-exit.log'), whLog);
    var wgLog = await testWatchGlowRendered(page);
    fs.writeFileSync(path.join(SCRATCH, 'watch-glow-rendered.log'), wgLog);
    var srLog = await testSpeedRungGlowRendered(page);
    fs.writeFileSync(path.join(SCRATCH, 'speed-rung-glow.log'), srLog);
    var prLog = await testPauseResumeSpeed(page);
    fs.writeFileSync(path.join(SCRATCH, 'pause-resume-speed.log'), prLog);
    var hnLog = await testHeldNotePauseResume(page);
    fs.writeFileSync(path.join(SCRATCH, 'held-note-pause-resume.log'), hnLog);
    var ctLog = await testCssTransitions(page);
    fs.writeFileSync(path.join(SCRATCH, 'css-transitions.log'), ctLog);
    var pgLog = await testPzrGaugeFollowsProgram(page);
    fs.writeFileSync(path.join(SCRATCH, 'pzr-gauge-program.log'), pgLog);
    var phLog = await testPzrGaugeHighLevelCaution(page);
    fs.writeFileSync(path.join(SCRATCH, 'pzr-gauge-high-level.log'), phLog);
    var tgLog = await testTavgGaugeDeviationCaution(page);
    fs.writeFileSync(path.join(SCRATCH, 'tavg-gauge-deviation.log'), tgLog);
    var rlLog = await testRodLaneBankScale(page);
    fs.writeFileSync(path.join(SCRATCH, 'rod-lane-bank-scale.log'), rlLog);
    var rmLog = await testRodLimitMarginIndicationRange(page);
    fs.writeFileSync(path.join(SCRATCH, 'rod-limit-margin-indication-range.log'), rmLog);
    var wcLog = await testWalkthroughPanelChrome(page);
    fs.writeFileSync(path.join(SCRATCH, 'walkthrough-panel-chrome.log'), wcLog);
    var oaLog = await testObservationStepAckButton(page);
    fs.writeFileSync(path.join(SCRATCH, 'observation-step-ack-button.log'), oaLog);
    var oomLog = await testOneOverMGeometry(page);
    fs.writeFileSync(path.join(SCRATCH, 'one-over-m-geometry.log'), oomLog);
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
                     testMissionCloseResumes: testMissionCloseResumes, testRunStartMark: testRunStartMark,
                     testMissionMenuShape: testMissionMenuShape,
                     testMainMenuButton: testMainMenuButton,
                     testHeldPlantDialog: testHeldPlantDialog, testHeldSpeedClick: testHeldSpeedClick,
                     testSaveLoadRefusal: testSaveLoadRefusal, testCssTransitions: testCssTransitions,
                     testPzrGaugeFollowsProgram: testPzrGaugeFollowsProgram,
                     testPzrGaugeHighLevelCaution: testPzrGaugeHighLevelCaution,
                     testTavgGaugeDeviationCaution: testTavgGaugeDeviationCaution,
                     testRodLaneBankScale: testRodLaneBankScale,
                     testRodLimitMarginIndicationRange: testRodLimitMarginIndicationRange,
                     testWalkthroughPanelChrome: testWalkthroughPanelChrome,
                     testObservationStepAckButton: testObservationStepAckButton,
                     startWalkthrough: startWalkthrough,
                     testPauseResumeSpeed: testPauseResumeSpeed, testWalkthroughEventPause: testWalkthroughEventPause,
                     testTripBlockPopoverDismissesOnOutsideClick: testTripBlockPopoverDismissesOnOutsideClick,
                     waitBoardLive: waitBoardLive,
                     testWalkthroughHoldReleasedOnExit: testWalkthroughHoldReleasedOnExit,
                     testHeldNotePauseResume: testHeldNotePauseResume,
                     /* Renamed by #713 when the 1/M dock was retired; the old name stayed here and
                      * made `require()` of this file throw, which is the ONLY way the injection
                      * harness this block exists for is reached. The gate runs the file directly
                      * and never noticed. Found adjudicating #743/#744 (2026-09-13). */
                     testOneOverMGeometry: testOneOverMGeometry,
                     testWatchGlowRendered: testWatchGlowRendered,
                     testSpeedRungGlowRendered: testSpeedRungGlowRendered,
                     port: function () { return PORT; } };
} else {
  main().catch(function (e) {
    fs.mkdirSync(SCRATCH, { recursive: true });
    fs.writeFileSync(path.join(SCRATCH, 'ui-screenshot-fallback.log'), String(e.stack || e));
    console.error('E2E UI verification FAILED:', e.message);
    process.exit(1);
  });
}