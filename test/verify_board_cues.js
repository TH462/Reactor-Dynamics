/* verify_board_cues.js — the board's three ROD/TRIP-BLOCK cues, measured in a real browser (#752).
 *
 * WHY THIS FILE EXISTS. `bd-refused` — the crossed-out rod button — shipped in `fc7fae62` with NO
 * GATE AT ALL, and the two gates that looked like they might cover it could not:
 *
 *   `verify_reduced_motion` iterates a HAND-MAINTAINED `SIGNALS` list, so a signal that is never
 *     added is invisible to both of its claims. The house trap, stated in CLAUDE.md: a gate that
 *     iterates a hand-maintained map tests the map. (That list is extended by this same change, so
 *     the reduced-motion half of these cues is covered THERE, not here.)
 *   `run_pwr2_board` never renders — it drives the driver's own functions in Node. It can see
 *     `rodBankDriven`; it cannot see whether a class reaches an element, what colour that element
 *     computes to, or whether the element has any DRAWN SIZE. On this board that last one matters:
 *     #745 shipped a ring on a 0x0 hidden element, which counts as present to a class check and is
 *     invisible to a player.
 *
 * SO EVERY CHECK HERE READS A RENDERED ELEMENT: the class that actually landed, the computed colour
 * or animation, and the bounding box. Source scans are not admissible for a cue — `/\(partial\)/`
 * once passed green on `(false ? ' (partial)' : '')` (#485).
 *
 * ⚠ THE NEGATIVE LEG IS NOT OPTIONAL, and on this board it is half the specification. "The cue
 * appears when the press is refused" is satisfied by a cue that is ALWAYS on; "the shutdown bank
 * takes no red" is a claim ONLY a negative can carry. Each positive here is paired.
 *
 * ⚠ A FAKE SNAPSHOT IS BUILT FROM THE LIVE ONE, NEVER FROM A LITERAL. The trip-block section drives
 * `RD.PwrBoard.render(s)` with a doctored snapshot to manufacture a revoke the plant would need
 * minutes of real pressure transient to produce. The doctored status is derived from the RUNNING
 * plant's own `trip_block_status` with exactly one row flipped — because the live broadcast keeps
 * arriving between the fake renders, and a fake that disagrees with the plant on some OTHER row
 * makes the next real broadcast look like a re-block and silently deletes the message under test.
 * MEASURED while writing this: a literal all-false status lost two of three messages that way, and
 * the runner read as a feature defect.
 *
 * Run: node test/verify_board_cues.js
 */
'use strict';
var path = require('path');
var http = require('http');
var fs = require('fs');

var ROOT = path.join(__dirname, '..');
var PORT = 0;
var B = '\x1b[1m', G = '\x1b[32m', R = '\x1b[31m', D = '\x1b[2m', X = '\x1b[0m';
var nPass = 0, nFail = 0;
function ck(name, cond, note) {
  if (cond) { nPass++; console.log(G + '  PASS' + X + '  ' + name + (note ? D + '  — ' + note + X : '')); }
  else { nFail++; console.log(R + '  FAIL' + X + '  ' + name + (note ? D + '  — ' + note + X : '')); }
}

var AMBER = 'rgb(255, 209, 102)';          // the board's one "moving / there is a message" yellow
var RED   = 'rgb(255, 107, 107)';          // .bd-refused / .bd-val-refused
var CTRL_READ = 'imrpk4pjcpd', SD_READ = 'imrpnzfsfcx';
var CTRL_OUT = 'imrpk6qzjq8', CTRL_IN = 'imrpk79mwng';
var SD_OUT = 'imrpnyaxsb3', SD_IN = 'imrpnyf37ju';
var TB_BTN = 'imrsk4xz2dm';

function mime(p) {
  if (p.endsWith('.html')) return 'text/html';
  if (p.endsWith('.js')) return 'application/javascript';
  if (p.endsWith('.css')) return 'text/css';
  return 'application/octet-stream';
}
function startServer() {
  return new Promise(function (res) {
    var s = http.createServer(function (q, r) {
      var u = (q.url || '/').split('?')[0];
      if (u === '/') u = '/ui/shell.html';
      var fp = path.join(ROOT, decodeURIComponent(u.replace(/^\//, '').replace(/\//g, path.sep)));
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); r.end('nf'); return; }
      r.writeHead(200, { 'Content-Type': mime(fp) });
      r.end(fs.readFileSync(fp));
    });
    s.listen(0, '127.0.0.1', function () { PORT = s.address().port; res(s); });
  });
}

/* The page-side toolkit. Installed once; every evaluate below goes through it so that "what did the
 * player actually get" is read the same way everywhere. */
var TOOLKIT = [
  'window.__c = {',
  '  el: function (id) { return document.querySelector("[data-item=\\"" + id + "\\"]"); },',
  '  btn: function (id) { var t = window.__c.el(id); return t && t.querySelector("button"); },',
  /* Drawn size is read on the element the class is ON. A cue on a 0x0 box is not a cue (#745). */
  '  read: function (el) {',
  '    if (!el) return { err: "no element" };',
  '    var cs = getComputedStyle(el), r = el.getBoundingClientRect();',
  '    return { cls: el.className, color: cs.color, anim: cs.animationName, deco: cs.textDecorationLine,',
  '             outline: cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineOffset,',
  '             w: +r.width.toFixed(2), h: +r.height.toFixed(2), vis: cs.visibility,',
  '             text: (el.textContent || "").slice(0, 200) };',
  '  },',
  '  tile: function (id) { return window.__c.read(window.__c.el(id)); },',
  '  button: function (id) { return window.__c.read(window.__c.btn(id)); },',
  '  snap: function () { return JSON.parse(JSON.stringify(RD.PwrBoard.lastSnapshot())); },',
  /* Doctor ONE rod group on a clone of the live snapshot and render it through the production
   * path. `moving`/`direction`/`position_pct` are what rodDriving and rodPressRefused read. */
  '  rods: function (group, patch) {',
  '    var s = window.__c.snap();',
  '    (s.control_state.rod_groups || []).forEach(function (g) {',
  '      if (g.id === group) { Object.keys(patch).forEach(function (k) { g[k] = patch[k]; }); }',
  '    });',
  '    RD.PwrBoard.render(s);',
  '    return s;',
  '  },',
  /* The live status with a set of rows overridden — see the header for why it is not a literal. */
  '  tb: function (over) {',
  '    var s = window.__c.snap();',
  '    s.rps_state = s.rps_state || {};',
  '    var live = (s.rps_state.trip_block_status) || {};',
  '    var st = {}, blocks = {};',
  '    Object.keys(live).forEach(function (id) {',
  '      var b = Object.prototype.hasOwnProperty.call(over, id) ? !!over[id] : live[id].blocked === true;',
  '      st[id] = { blocked: b, permissive: true, asserted: false, can_block: true, can_clear: true };',
  '      if (b) blocks[id] = true;',
  '    });',
  '    s.rps_state.trip_block_status = st;',
  '    s.rps_state.trip_blocks = blocks;',
  '    RD.PwrBoard.render(s);',
  '    return Object.keys(st);',
  '  },',
  '  rows: function () {',
  '    return [].slice.call(document.querySelectorAll(".bd-pop .bd-pop-row")).map(function (r) {',
  '      var sub = r.querySelector(".sub"), bb = sub.getBoundingClientRect();',
  '      return { trip: r.querySelector("button[data-trip]").getAttribute("data-trip"),',
  '               cls: sub.className, color: getComputedStyle(sub).color,',
  '               w: +bb.width.toFixed(2), h: +bb.height.toFixed(2), text: sub.textContent };',
  '    });',
  '  },',
  '  row: function (id) { return window.__c.rows().filter(function (r) { return r.trip === id; })[0] || null; },',
  '  status: function () { var e = document.querySelector(".bd-pop-status"); return window.__c.read(e); },',
  '  anyRefused: function () { return document.querySelectorAll(".bd-refused, .bd-val-refused").length; },',
  '  tapDown: function (id) { window.__c.btn(id).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); },',
  '  tapUp: function () { document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })); },',
  '  click: function (id) { window.__c.btn(id).click(); },',
  /* ---- THE REAL-PLANT LEG (#755 item 17). `?dev=1` hands the harness the live service; these
   * three drive the ACTUAL plant through the ACTUAL command path, with no doctored snapshot
   * anywhere. `advanceCycles` ticks and BROADCASTS each cycle, so the board's afterRender —
   * which is where `noteTripBlockEvents` lives — sees every intermediate state exactly as it
   * does in play. See the section header below for why a fabricated revoke was not enough. */
  '  svc: function () { return RD.__dev.service(); },',
  '  cmd: function (c) { try { return window.__c.svc().handleCommand(c); } catch (e) { return { threw: String(e.message || e) }; } },',
  '  adv: function (n, sp) {',
  '    var s = window.__c.svc();',
  '    s.handleCommand({ action: "set_speed", value: sp || 60 });',
  '    s.advanceCycles(n);',
  '    s.handleCommand({ action: "set_speed", value: 1 });',
  /* ⚠ THE SERVICE'S SNAPSHOT, NOT `RD.PwrBoard.lastSnapshot()`. The board is painted from a
   * requestAnimationFrame, and `advanceCycles` runs its whole loop inside ONE JS turn — so no
   * frame is painted while it runs and the board's last snapshot is from BEFORE the commands.
   * MEASURED: both trip blocks read `blocked:false` immediately after the command that placed
   * them, and only the revoke they later produced proved they had ever been on. Plant facts come
   * from the plant here; the DOM reads below take their own settling time. */
  '    var q = s.assembleSnapshot();',
  '    return { mpa: q.true_state && q.true_state.pressure_mpa, st: (q.rps_state || {}).trip_block_status || {} };',
  '  }',
  '};'
].join('\n');

(async function () {
  var srv = await startServer();
  var playwright = require('playwright');
  var browser = await playwright.chromium.launch({ headless: true });
  var page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  var pageErrs = [];
  page.on('pageerror', function (e) { pageErrs.push(String(e.message)); });
  await page.goto('http://127.0.0.1:' + PORT + '/ui/shell.html?engine=pwr2&dev=1', { waitUntil: 'networkidle', timeout: 90000 });
  try { if (await page.isVisible('#missionOverlay')) { await page.click('#missionClose'); await page.waitForTimeout(300); } } catch (e) {}
  await page.waitForTimeout(900);
  await page.addScriptTag({ content: TOOLKIT });

  var CTRL_GREEN = await page.evaluate(function (id) { return window.__c.tile(id).color; }, CTRL_READ);

  // ============================================================ 1. the moving tint, control bank
  console.log(B + '\nROD STEP READINGS — yellow while the bank is driven (#752, both banks)' + X);

  var mov = await page.evaluate(function (a) {
    var s = window.__c.rods('control_rods', { moving: true, direction: 1, scrammed: false });
    return { read: window.__c.tile(a.CTRL_READ), other: window.__c.tile(a.SD_READ),
             lampOut: window.__c.button(a.CTRL_OUT), lampIn: window.__c.button(a.CTRL_IN),
             drv: RD.PwrBoardDriver.rodBankDriven(s, 'control_rods') };
  }, { CTRL_READ: CTRL_READ, SD_READ: SD_READ, CTRL_OUT: CTRL_OUT, CTRL_IN: CTRL_IN });

  ck('the CONTROL bank reading goes yellow while the bank is driven',
    /\bbd-val-moving\b/.test(mov.read.cls) && mov.read.color === AMBER,
    mov.read.cls + ' / ' + mov.read.color);
  /* #745: a class on a box with no area is not a cue. Read the box, not the class list. */
  ck('  …on an element the player can actually see (non-zero drawn box)',
    mov.read.w > 10 && mov.read.h > 5 && mov.read.vis === 'visible',
    mov.read.w + ' x ' + mov.read.h + ' px, ' + mov.read.vis);
  /* THE READING AND THE LAMP CANNOT DISAGREE, because the reading calls the lamp's own predicate
   * out of the BUTTONS table. Asserting the DOM consequence is what pins that: a future edit that
   * re-derives "moving" locally would light one and not the other, and nothing else here would
   * notice. */
  /* EQUALITY, not two separate assertions. "The lamp is lit" would stay green with the reading's
   * tint deleted outright — measured, that injection reddened three checks and not this one, which
   * is the check whose whole subject is that the two cannot disagree. */
  ck('  …in step with the bank\'s own IN-OUT lamp (one predicate, not two)',
    (/\bbd-val-moving\b/.test(mov.read.cls)) ===
      (/\bbd-warn\b/.test(mov.lampOut.cls) || /\bbd-warn\b/.test(mov.lampIn.cls)),
    'reading=' + mov.read.cls + ' · WITHDRAW=' + mov.lampOut.cls + ' · INSERT=' + mov.lampIn.cls);
  ck('  …and the SHUTDOWN reading stays untinted while only the control bank moves',
    !/\bbd-val-moving\b/.test(mov.other.cls), mov.other.cls + ' / ' + mov.other.color);

  var still = await page.evaluate(function (id) {
    window.__c.rods('control_rods', { moving: false, direction: 0 });
    return window.__c.tile(id);
  }, CTRL_READ);
  ck('  …and it CLEARS when the bank stops (a tint that never lifts is not a tint)',
    !/\bbd-val-moving\b/.test(still.cls) && still.color === CTRL_GREEN,
    still.cls + ' / ' + still.color + ' (authored ' + CTRL_GREEN + ')');

  // ---- the shutdown bank, driven for real: its lamp is the BOARD's latch, not the plant's flag
  await page.evaluate(function (id) { window.__c.click(id); }, SD_IN);   // it sits at the top stop
  await page.waitForTimeout(450);
  var sdMov = await page.evaluate(function (a) {
    return { read: window.__c.tile(a.SD_READ), lamp: window.__c.button(a.SD_IN),
             other: window.__c.tile(a.CTRL_READ),
             drv: RD.PwrBoardDriver.rodBankDriven(RD.PwrBoard.lastSnapshot(), 'shutdown_rods') };
  }, { SD_READ: SD_READ, SD_IN: SD_IN, CTRL_READ: CTRL_READ });
  ck('the SHUTDOWN bank reading goes yellow too — the 2026-09-14 narrowing, both banks',
    /\bbd-val-moving\b/.test(sdMov.read.cls) && sdMov.read.color === AMBER && sdMov.drv === true,
    sdMov.read.cls + ' / ' + sdMov.read.color + ' / rodBankDriven=' + sdMov.drv);
  ck('  …on a drawn box, and in step with ITS lamp (which is the board latch, not g.moving)',
    sdMov.read.w > 10 && sdMov.read.h > 5 && /\bbd-warn\b/.test(sdMov.lamp.cls),
    sdMov.read.w + ' x ' + sdMov.read.h + ' px · INSERT=' + sdMov.lamp.cls);

  await page.evaluate(function (id) { window.__c.click(id); }, SD_IN);   // second press = stop
  await page.waitForTimeout(450);
  var sdStop = await page.evaluate(function (id) { return window.__c.tile(id); }, SD_READ);
  ck('  …and clears when the latch is released',
    !/\bbd-val-moving\b/.test(sdStop.cls), sdStop.cls + ' / ' + sdStop.color);

  // ============================================================ 2. the refused-press flash
  console.log(B + '\nREFUSED PRESS — the button and the number it was about, together' + X);

  /* AT THE STOP. `rodPressRefused` reads `position_pct` off the snapshot, so the stop is planted on
   * a clone and the press is made in the SAME synchronous turn — the live broadcast is 100 ms away
   * and would put the real position back. */
  await page.evaluate(function (a) {
    window.__c.rods('control_rods', { position_pct: 100, moving: false, direction: 0 });
    window.__c.tapDown(a.CTRL_OUT);
    window.__c.tapUp();
  }, { CTRL_OUT: CTRL_OUT });
  /* ⚠ +300 ms, NOT SYNCHRONOUSLY. `.bd-btn` carries `transition: color 0.12s` (pwr_board.css:127),
   * so a colour read in the same turn as the press returns the OLD value — measured here: the class
   * and the strike-through were already correct while `color` still read the base grey
   * rgb(124, 147, 164). The cue stands for REFUSE_MS = 1100 ms, so 300 is inside it with room. */
  await page.waitForTimeout(300);
  var refused = await page.evaluate(function (a) {
    return { btn: window.__c.button(a.CTRL_OUT), read: window.__c.tile(a.CTRL_READ),
             sd: window.__c.tile(a.SD_READ) };
  }, { CTRL_OUT: CTRL_OUT, CTRL_READ: CTRL_READ, SD_READ: SD_READ });

  ck('a WITHDRAW press at the top stop crosses the button out in red',
    /\bbd-refused\b/.test(refused.btn.cls) && refused.btn.color === RED &&
      /line-through/.test(refused.btn.deco),
    refused.btn.cls + ' / ' + refused.btn.color + ' / ' + refused.btn.deco);
  ck('  …and flashes the STEP READING with it *(OWNER, 2026-09-14: "We could flash the step ' +
     'indication red as well to show the relationship.")*',
    /\bbd-val-refused\b/.test(refused.read.cls) && refused.read.color === RED,
    refused.read.cls + ' / ' + refused.read.color);
  ck('  …both animating the same finite flash, on drawn boxes',
    refused.btn.anim === 'bdRefusedFlash' && refused.read.anim === 'bdRefusedFlash' &&
      refused.read.w > 10 && refused.read.h > 5 && refused.btn.w > 10,
    'btn ' + refused.btn.anim + ' ' + refused.btn.w + 'x' + refused.btn.h +
      ' · read ' + refused.read.anim + ' ' + refused.read.w + 'x' + refused.read.h);
  /* The reading's non-colour channel. It is NOT line-through (a struck-out number reads as "this
   * value is void", which is false), so it must be the ring — and only a geometry read can say the
   * ring is there. Without this the reading is hue-only and #740's argument is unserved. */
  ck('  …and the reading carries a NON-COLOUR channel of its own (the ring, not a strike-through)',
    /^solid 1px/.test(refused.read.outline) && !/line-through/.test(refused.read.deco),
    refused.read.outline + ' · text-decoration ' + refused.read.deco);
  ck('  …and the SHUTDOWN reading is untouched by the control bank\'s refusal',
    !/\bbd-val-refused\b/.test(refused.sd.cls), refused.sd.cls);

  await page.waitForTimeout(1300);          // let REFUSE_MS (1100) expire

  /* THE NEGATIVE THE POSITIVE IS WORTHLESS WITHOUT: a press that the bank CAN honour. An
   * always-on cue satisfies every check above. */
  var allowed = await page.evaluate(function (a) {
    window.__c.rods('control_rods', { position_pct: 50, moving: false, direction: 0 });
    window.__c.tapDown(a.CTRL_OUT);
    var out = { btn: window.__c.button(a.CTRL_OUT), read: window.__c.tile(a.CTRL_READ) };
    window.__c.tapUp();
    return out;
  }, { CTRL_OUT: CTRL_OUT, CTRL_READ: CTRL_READ });
  ck('a WITHDRAW press the bank CAN honour flashes nothing (else the cue means nothing)',
    !/\bbd-refused\b/.test(allowed.btn.cls) && !/\bbd-val-refused\b/.test(allowed.read.cls),
    'btn ' + allowed.btn.cls + ' · read ' + allowed.read.cls);

  /* PRECEDENCE, and it is a real state rather than a contrived one: the bank reports `moving` while
   * the drive runs into its stop, so the tint and the flash are both on the element. The flash must
   * win — it is the answer to a question the player just asked. Source order in pwr_board.css is
   * what decides it, and nothing else in this repo would notice if that order were swapped. */
  var both = await page.evaluate(function (a) {
    window.__c.rods('control_rods', { position_pct: 100, moving: true, direction: 1, scrammed: false });
    window.__c.tapDown(a.CTRL_OUT);
    var out = window.__c.tile(a.CTRL_READ);
    window.__c.tapUp();
    return out;
  }, { CTRL_OUT: CTRL_OUT, CTRL_READ: CTRL_READ });
  ck('with the bank BOTH moving and refusing, RED wins over the yellow tint (source order)',
    /\bbd-val-moving\b/.test(both.cls) && /\bbd-val-refused\b/.test(both.cls) && both.color === RED,
    both.cls + ' / ' + both.color);
  await page.waitForTimeout(1300);

  /* THE RULING. *(OWNER RULING, 2026-09-14: "Do not alarm or color code the shutdown bank since
   * it's used differently")* — narrowed the same day to admit the YELLOW and nothing else. This is
   * the only check that can see the `rodCue` property coming back. */
  var sdRefuse = await page.evaluate(function (a) {
    window.__c.rods('shutdown_rods', { position_pct: 100, moving: false, direction: 0 });
    window.__c.click(a.SD_OUT);
    var out = { btn: window.__c.button(a.SD_OUT), read: window.__c.tile(a.SD_READ),
                anywhere: window.__c.anyRefused() };
    window.__c.click(a.SD_OUT);
    return out;
  }, { SD_OUT: SD_OUT, SD_READ: SD_READ });
  ck('the SHUTDOWN bank takes NO red — not on the button, not on the reading, nowhere on the board',
    !/\bbd-refused\b/.test(sdRefuse.btn.cls) && !/\bbd-val-refused\b/.test(sdRefuse.read.cls) &&
      sdRefuse.anywhere === 0,
    'btn ' + sdRefuse.btn.cls + ' · read ' + sdRefuse.read.cls + ' · .bd-refused on page: ' + sdRefuse.anywhere);

  // ============================================================ 3. the trip-block acknowledge
  console.log(B + '\nTRIP BLOCKS — the cue stops when it has been looked at, and comes back (#752/#738)' + X);
  await page.waitForTimeout(400);

  /* ⚠ DRIVE ROWS THE RUNNING PLANT HOLDS UNBLOCKED, and choose them from the live status rather
   * than naming them. A fabricated revoke leaves the row reading UNBLOCKED, and the very next real
   * broadcast puts the plant's own state back — so on a row the plant has BLOCKED, that broadcast
   * is a re-block and `noteTripBlockEvents` deletes the message under test. MEASURED: driving
   * `ir_high`, which this IC holds blocked, lost its message inside 400 ms and read as "the cue
   * never came back". Hard-coding the pair would also rot the day the IC's lineup changes. */
  var ids = await page.evaluate(function () {
    RD.PwrBoardDriver.__resetTripBlocks();
    var st = (RD.PwrBoard.lastSnapshot().rps_state || {}).trip_block_status || {};
    return { all: Object.keys(st), free: Object.keys(st).filter(function (k) { return st[k].blocked !== true; }) };
  });
  var ROW_A = ids.free[0], ROW_B = ids.free[1];
  ck('this plant offers two trip-block rows it is NOT already holding (the section needs two)',
    !!ROW_A && !!ROW_B, 'free: ' + ids.free.join(', ') + '  ·  all: ' + ids.all.join(', '));
  if (!ROW_A || !ROW_B) { console.log(R + '  (trip-block section skipped)' + X); ROW_A = ROW_B = null; }

  /* ⚠ THE BUTTON IS ONE RENDER BEHIND THE EVENT, BY CONSTRUCTION. `noteTripBlockEvents` runs in
   * `afterRender`, which pwr_board.js calls AFTER it has already toggled every button class for
   * that frame — so the message the second render creates reaches the button on the THIRD. A
   * synchronous read here returned `bd-btn bd-info` and read as a broken annunciator; the live
   * broadcast supplies the extra render. Anything asserting a button class off a fabricated render
   * has to let one more frame go by. */
  await page.evaluate(function (a) {
    window.__c.tb(JSON.parse('{"' + a.A + '":true}'));      // established: the player holds it
    window.__c.tb(JSON.parse('{"' + a.A + '":false}'));     // the plant took it
  }, { A: ROW_A });
  await page.waitForTimeout(400);
  var revoked = await page.evaluate(function (a) {
    return { msgs: RD.PwrBoardDriver.tripBlockMessages(), unacked: RD.PwrBoardDriver.tripBlockUnacked(),
             btn: window.__c.button(a.TB) };
  }, { TB: TB_BTN });
  ck('a revoke with the card SHUT flashes the button amber',
    /\bbd-msg\b/.test(revoked.btn.cls) && /\bbd-unack\b/.test(revoked.btn.cls) &&
      revoked.btn.anim === 'bdMsgFlash' && revoked.unacked === true,
    revoked.btn.cls + ' / ' + revoked.btn.anim);

  await page.evaluate(function (id) { window.__c.click(id); }, TB_BTN);
  await page.waitForTimeout(400);
  var opened = await page.evaluate(function (a) {
    return { btn: window.__c.button(a.TB), row: window.__c.row(a.A), status: window.__c.status(),
             msgs: RD.PwrBoardDriver.tripBlockMessages(), unacked: RD.PwrBoardDriver.tripBlockUnacked() };
  }, { TB: TB_BTN, A: ROW_A });
  /* THE OWNER'S RULE, LITERALLY: *(OWNER, 2026-09-14: "The yellow permissives button should stop
   * being yellow after being opened.")* — the OPEN, not the open-and-close it used to be. */
  ck('OPENING the card stops the button flashing (not open-and-close, which is what it used to be)',
    opened.unacked === false && !/\bbd-unack\b/.test(opened.btn.cls) && opened.btn.anim === 'none',
    opened.btn.cls + ' / ' + opened.btn.anim);
  /* ⚠ THIS CHECK USED TO ASSERT THE DEFECT. It read "the button keeps its amber state class",
   * pinning `bd-msg` as correct after the open — which is exactly what the owner then played:
   * *(OWNER, 2026-09-14, #755 item 17: "The TRIP BLOCKS button stayed yellow after opening and
   * closing the card.")*. The cue is the COLOUR as much as the motion; what must survive the
   * acknowledge is the FACT, and the fact lives in the card's row text, the count badge and
   * `bd-info`'s grey — not in a yellow button. #738 is still honoured: nothing is deleted. */
  ck('  …and stops being YELLOW, not just stops moving — the colour is the cue too (#755 item 17)',
    !/\bbd-msg\b/.test(opened.btn.cls) && opened.btn.color !== AMBER,
    opened.btn.cls + ' / ' + opened.btn.color);
  ck('  …while the FACT survives — the row keeps its text and the driver keeps the message',
    /RELEASED BY THE PLANT/.test(opened.row.text) &&
      opened.msgs.filter(function (m) { return m.id === ROW_A && m.msg; }).length === 1,
    opened.msgs.length + ' messages held · row: ' + opened.row.text.slice(-70));
  ck('  …and the row is still amber for the viewing that is READING it (drawn, not 0x0)',
    /\bbd-sub-msg\b/.test(opened.row.cls) && opened.row.color === AMBER &&
      opened.row.w > 20 && opened.row.h > 4,
    opened.row.cls + ' / ' + opened.row.color + ' / ' + opened.row.w + ' x ' + opened.row.h + ' px');
  ck('  …and so is the card\'s status line',
    /\bbd-pop-status-msg\b/.test(opened.status.cls) && opened.status.color === AMBER,
    opened.status.cls + ' / ' + opened.status.color);
  /* THE ROW IS NOT SCROLLED OUT OF SIGHT. "Viewed" is defined as "the open card rendered this row",
   * which would be a lie if the card could clip a row away. The panel is content-sized with four
   * rows; assert it, because a fifth blockable trip would silently break the definition. */
  var clip = await page.evaluate(function () {
    var p = document.querySelector('.bd-pop');
    var rows = [].slice.call(p.querySelectorAll('.bd-pop-row'));
    var pb = p.getBoundingClientRect();
    return { scrolls: p.scrollHeight > p.clientHeight + 1, n: rows.length,
             outside: rows.filter(function (r) {
               var b = r.getBoundingClientRect();
               return b.top < pb.top - 1 || b.bottom > pb.bottom + 1; }).length };
  });
  ck('  …and no row can be scrolled out of sight, so "rendered" really is "viewable"',
    !clip.scrolls && clip.outside === 0,
    clip.n + ' rows, none clipped, panel does not scroll');

  await page.evaluate(function (id) { window.__c.click(id); }, TB_BTN);   // close
  await page.waitForTimeout(250);
  await page.evaluate(function (id) { window.__c.click(id); }, TB_BTN);   // re-open
  await page.waitForTimeout(400);
  var reopened = await page.evaluate(function (a) {
    return { row: window.__c.row(a.A), status: window.__c.status(),
             msgs: RD.PwrBoardDriver.tripBlockMessages() };
  }, { A: ROW_A });
  /* *(OWNER, 2026-09-14: "The yellow warnings on the card should go away after being viewed.")* */
  ck('a row VIEWED and then closed comes back PLAIN on the next opening',
    !/\bbd-sub-msg\b/.test(reopened.row.cls) && reopened.row.color !== AMBER,
    reopened.row.cls + ' / ' + reopened.row.color);
  ck('  …with the message text still on it — the cue goes, the FACT does not',
    /RELEASED BY THE PLANT/.test(reopened.row.text) &&
      reopened.msgs.filter(function (m) { return m.id === ROW_A && m.msg; }).length === 1,
    reopened.row.text.slice(-70));
  ck('  …and the status line loses its amber but keeps its count',
    !/\bbd-pop-status-msg\b/.test(reopened.status.cls) && /RELEASED BY THE PLANT/.test(reopened.status.text),
    reopened.status.cls + ' · ' + reopened.status.text);

  await page.evaluate(function (id) { window.__c.click(id); }, TB_BTN);   // close
  await page.waitForTimeout(250);
  /* THE PROOF THAT MATTERS MOST. A cue that dismisses permanently is worse than one that nags: a
   * SECOND revoke, on a different row, after the player has dismissed the first, must light the
   * button again. It is a sequence rather than a window, so this holds however long they waited. */
  await page.evaluate(function (a) {
    window.__c.tb(JSON.parse('{"' + a.B + '":true}'));
    window.__c.tb(JSON.parse('{"' + a.B + '":false}'));
  }, { B: ROW_B });
  await page.waitForTimeout(400);          // one more render — see the note above
  var again = await page.evaluate(function (a) {
    return { btn: window.__c.button(a.TB), unacked: RD.PwrBoardDriver.tripBlockUnacked(),
             msgs: RD.PwrBoardDriver.tripBlockMessages() };
  }, { TB: TB_BTN });
  ck('a FRESH revoke after the dismissal lights the button again (dismissing is not disabling)',
    again.unacked === true && /\bbd-unack\b/.test(again.btn.cls) && again.btn.anim === 'bdMsgFlash',
    again.btn.cls + ' / ' + again.btn.anim + ' / ' + again.msgs.length + ' messages held');
  ck('  …and the row viewed earlier is still marked viewed, so only the NEW one is unviewed',
    again.msgs.filter(function (m) { return m.unviewed; }).length === 1 &&
      again.msgs.filter(function (m) { return m.unviewed; })[0].id === ROW_B,
    again.msgs.map(function (m) { return m.id + (m.unviewed ? ' UNVIEWED' : ' viewed'); }).join(' · '));

  // ============================================================ 4. the same, on a REAL transient
  /* ⚠ WHY THIS SECTION EXISTS, AND WHY THE ONE ABOVE WAS NOT ENOUGH (#755 item 17). Everything
   * above manufactures the revoke with `RD.PwrBoard.render(doctored)`. That is a legitimate way to
   * reach the RENDERER, and it is how the row/status/sequence claims are exercised cheaply — but
   * it proves nothing about the acknowledge a PLAYER meets, because the player's revoke arrives
   * through the engine, the control layer, the service broadcast and `afterRender`, and the button
   * he is looking at is painted by a chain none of those fake renders walk end to end. The #752
   * commit shipped with this whole section green and the defect live: the owner hit it inside
   * hours. A fabricated fixture certified the fix that did not work.
   *
   * SO THIS LEG DRIVES THE PLANT. A real depressurization below P-11 (13.6 MPa / 1972 psia), both
   * cooldown blocks placed through `handleCommand` exactly as the card's buttons place them, a
   * real repressurization back through P-11, and the engine's own revoke
   * (`pwr2_protection.js:658-661`) does the rest. Nothing here is a literal and nothing is
   * rendered by hand.
   *
   * IT IS BOUNDED AND IT FAILS LOUDLY IF THE PLANT DOES NOT COOPERATE: the two preconditions are
   * their own checks, so a future engine change that stops producing this revoke reddens the gate
   * saying so, rather than silently leaving the acknowledge untested. */
  console.log(B + '\nTRIP BLOCKS — the same acknowledge on a REAL P-11 revoke (#755 item 17)' + X);

  await page.evaluate(function () { RD.PwrBoardDriver.__resetTripBlocks(); });
  var down = null;
  await page.evaluate(function () { window.__c.cmd({ action: 'set_pressure_setpoint', mpa: 12.4 }); });
  for (var di = 0; di < 20 && !down; di++) {
    var dq = await page.evaluate(function () { return window.__c.adv(60, 60); });
    if (dq.st.lo_press && dq.st.lo_press.permissive === true) down = dq;
  }
  ck('a real depressurization brings the plant inside P-11 (the blocks become placeable at all)',
    !!down, down ? (down.mpa * 145.038).toFixed(0) + ' psia (' + down.mpa.toFixed(2) + ' MPa)'
                 : 'P-11 never came in — the transient did not run');

  /* The depressurization ALSO drops power through P-10 and revokes the two startup blocks — a
   * real event, and a real message, but not the one under test. Cleared so the section speaks
   * only for the P-11 pair. */
  var placed = down ? await page.evaluate(function () {
    RD.PwrBoardDriver.__resetTripBlocks();
    window.__c.cmd({ action: 'set_trip_block', trip_id: 'lo_press', blocked: true });
    window.__c.cmd({ action: 'set_trip_block', trip_id: 'si_trip', blocked: true });
    var q = window.__c.adv(6, 1);
    return { lo: q.st.lo_press.blocked, si: q.st.si_trip.blocked };
  }) : { lo: false, si: false };
  ck('  …and the player\'s two cooldown blocks land through the ordinary command path',
    placed.lo === true && placed.si === true,
    'lo_press=' + placed.lo + ' · si_trip=' + placed.si);

  var up = null;
  if (down) {
    await page.evaluate(function () { window.__c.cmd({ action: 'set_pressure_setpoint', mpa: 15.4 }); });
    for (var ui = 0; ui < 30 && !up; ui++) {
      var uq = await page.evaluate(function () { return window.__c.adv(30, 60); });
      if (uq.st.lo_press && uq.st.lo_press.blocked === false) up = uq;
    }
    await page.evaluate(function () { window.__c.adv(6, 1); });
  }
  /* ⚠ +320 ms BEFORE THE FIRST COLOUR READ TOO, and this one was MISSED in the first cut of this
   * section: the wait below (before the open) was there and this one was not, so the check read
   * rgb(184, 196, 205) — `.bd-btn`'s `transition: color 0.12s` caught part-way from the resting
   * grey to the amber — and the leg failed on a board that was behaving perfectly. The class and
   * the animation were already correct in the same read, which is exactly what makes a
   * mid-transition colour read a plausible-looking false red. `bdMsgFlash` animates OPACITY only
   * (pwr_board.css), so the colour is a constant #ffd166 once the transition lands and this wait
   * cannot land on the wrong half of a flash. */
  await page.waitForTimeout(320);
  var real = await page.evaluate(function (a) {
    return { btn: window.__c.button(a.TB),
             msgs: RD.PwrBoardDriver.tripBlockMessages(), unacked: RD.PwrBoardDriver.tripBlockUnacked() };
  }, { TB: TB_BTN });
  ck('the plant REVOKES them on the way back up, and the board says so unprompted',
    !!up && real.unacked === true &&
      real.msgs.filter(function (m) { return /P-11/.test(m.msg || ''); }).length === 2,
    up ? (up.mpa * 145.038).toFixed(0) + ' psia · ' +
         real.msgs.map(function (m) { return m.id; }).join(', ') : 'no revoke');
  ck('  …by flashing the button amber (the annunciator half, on a real event)',
    /\bbd-msg\b/.test(real.btn.cls) && /\bbd-unack\b/.test(real.btn.cls) &&
      real.btn.anim === 'bdMsgFlash' && real.btn.color === AMBER,
    real.btn.cls + ' / ' + real.btn.anim + ' / ' + real.btn.color);

  /* ⚠ +300 ms BEFORE READING A COLOUR. `.bd-btn` carries `transition: background 0.12s`, so a
   * computed colour read in the same tick as the class change is the OLD one part-way to the new.
   * MEASURED while writing this: the same read at ~0 ms returned rgb(244, 207, 117) — neither
   * amber nor the resting grey, and a strict comparison against either would have been a coin
   * flip between a false PASS and a false FAIL. */
  await page.evaluate(function () { window.__c.click('imrsk4xz2dm'); });
  await page.evaluate(function () { window.__c.adv(5, 1); });
  await page.waitForTimeout(320);
  var rOpen = await page.evaluate(function (a) {
    return { btn: window.__c.button(a.TB), row: window.__c.row('lo_press'),
             msgs: RD.PwrBoardDriver.tripBlockMessages() };
  }, { TB: TB_BTN });
  ck('OPENING the card takes the YELLOW off the button, not only the flashing (#755 item 17)',
    !/\bbd-msg\b/.test(rOpen.btn.cls) && !/\bbd-unack\b/.test(rOpen.btn.cls) &&
      rOpen.btn.color !== AMBER && rOpen.btn.anim === 'none',
    rOpen.btn.cls + ' / ' + rOpen.btn.color + ' / ' + rOpen.btn.anim);
  ck('  …and the row inside is amber and drawn, so the card still says WHICH row lost its block',
    /\bbd-sub-msg\b/.test(rOpen.row.cls) && rOpen.row.color === AMBER &&
      rOpen.row.w > 20 && rOpen.row.h > 4,
    rOpen.row.cls + ' / ' + rOpen.row.color + ' / ' + rOpen.row.w + ' x ' + rOpen.row.h + ' px');

  /* THE OWNER'S GESTURE, LITERALLY: open, then close. This is the read that was never taken. */
  await page.evaluate(function () { window.__c.click('imrsk4xz2dm'); });
  await page.evaluate(function () { window.__c.adv(10, 1); });
  await page.waitForTimeout(320);
  var rClosed = await page.evaluate(function (a) {
    return { btn: window.__c.button(a.TB), msgs: RD.PwrBoardDriver.tripBlockMessages() };
  }, { TB: TB_BTN });
  ck('…and CLOSING it leaves the button plain — the owner\'s open-then-close, measured',
    !/\bbd-msg\b/.test(rClosed.btn.cls) && !/\bbd-unack\b/.test(rClosed.btn.cls) &&
      rClosed.btn.color !== AMBER && rClosed.btn.anim === 'none',
    rClosed.btn.cls + ' / ' + rClosed.btn.color + ' / ' + rClosed.btn.anim);
  ck('  …with BOTH messages still held — the cue went, the fact did not',
    rClosed.msgs.filter(function (m) { return /P-11/.test(m.msg || ''); }).length === 2 &&
      rClosed.msgs.every(function (m) { return m.unviewed === false; }),
    rClosed.msgs.map(function (m) { return m.id + (m.unviewed ? ' UNVIEWED' : ' viewed'); }).join(' · '));

  await page.evaluate(function () { window.__c.click('imrsk4xz2dm'); });
  await page.evaluate(function () { window.__c.adv(5, 1); });
  var rAgain = await page.evaluate(function () { return { row: window.__c.row('lo_press') }; });
  ck('  …and the ROW comes back plain on the next opening, its text intact (the row half, real)',
    !/\bbd-sub-msg\b/.test(rAgain.row.cls) && rAgain.row.color !== AMBER &&
      /RELEASED BY THE PLANT/.test(rAgain.row.text),
    rAgain.row.cls + ' / ' + rAgain.row.color);
  await page.evaluate(function () { window.__c.click('imrsk4xz2dm'); });

  ck('the page raised no script error while all of that was driven',
    pageErrs.length === 0, pageErrs.length ? pageErrs.slice(0, 3).join(' | ') : 'clean');

  await browser.close();
  srv.close();

  console.log('\n' + B + (nFail ? R + 'BOARD CUES: FAIL' : G + 'BOARD CUES: PASS') + X +
    '   ' + nPass + '/' + (nPass + nFail) + ' checks');
  console.log(D + 'PASS means each cue REACHED a drawn element and its negative case did not. It says ' +
    'nothing about whether the colours are the right ones — that was decided by rendering them.' + X);
  process.exit(nFail > 0 ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });