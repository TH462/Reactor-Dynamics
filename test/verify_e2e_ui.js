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
  await page.click('#simStatus');
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
    var rfLog = await testRefusalReachesTheScanner(page);
    fs.writeFileSync(path.join(SCRATCH, 'refusal-scanner.log'), rfLog);
    var tbLog = await testTripBlockPopoverStaysOffTheBoard(page);
    fs.writeFileSync(path.join(SCRATCH, 'trip-block-overlay.log'), tbLog);
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
    var prLog = await testPauseResumeSpeed(page);
    fs.writeFileSync(path.join(SCRATCH, 'pause-resume-speed.log'), prLog);
    var ctLog = await testCssTransitions(page);
    fs.writeFileSync(path.join(SCRATCH, 'css-transitions.log'), ctLog);
    var pgLog = await testPzrGaugeFollowsProgram(page);
    fs.writeFileSync(path.join(SCRATCH, 'pzr-gauge-program.log'), pgLog);
    var phLog = await testPzrGaugeHighLevelCaution(page);
    fs.writeFileSync(path.join(SCRATCH, 'pzr-gauge-high-level.log'), phLog);
    var tgLog = await testTavgGaugeDeviationCaution(page);
    fs.writeFileSync(path.join(SCRATCH, 'tavg-gauge-deviation.log'), tgLog);
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
                     testHeldPlantDialog: testHeldPlantDialog, testHeldSpeedClick: testHeldSpeedClick,
                     testSaveLoadRefusal: testSaveLoadRefusal, testCssTransitions: testCssTransitions,
                     testPzrGaugeFollowsProgram: testPzrGaugeFollowsProgram,
                     testPzrGaugeHighLevelCaution: testPzrGaugeHighLevelCaution,
                     testTavgGaugeDeviationCaution: testTavgGaugeDeviationCaution,
                     testPauseResumeSpeed: testPauseResumeSpeed, testWalkthroughEventPause: testWalkthroughEventPause,
                     port: function () { return PORT; } };
} else {
  main().catch(function (e) {
    fs.mkdirSync(SCRATCH, { recursive: true });
    fs.writeFileSync(path.join(SCRATCH, 'ui-screenshot-fallback.log'), String(e.stack || e));
    console.error('E2E UI verification FAILED:', e.message);
    process.exit(1);
  });
}