/*
 * run_pwr2_board.js — the BOARD DRIVER over the PWR2 engine, headless (issue #506).
 *
 * The owner's second playtest reported ten systems of dead buttons, frozen pumps and a
 * power tile pinned red — and NO gate stood between the pwr board wiring and the pwr2
 * shell: verify_board_check mounts the board over pwr1 only, and the pwr2 gates stop at
 * the shell's own surface. This runner drives RD.PwrBoardDriver against a REAL pwr2
 * SimulationService with no browser (the run_inspect pattern: window = global, a tiny
 * document stub), so every seam #506 broke is pinned at the layer that broke:
 *
 *   1. THE NO-ORPHAN SWEEP (DESIGN_CRITERIA Q4 as a check): every button item on the doc
 *      either has a live press handler whose command is ACKNOWLEDGED (ok / blocked / error
 *      WITH a message — the app surfaces all three since the #505 fix), is a momentary rod
 *      drive, or reads DISABLED. A press that silently does nothing is the defect class.
 *   2. Pump props are NUMBERS — the RCP froze because a missing flow_pct made the spin
 *      speed NaN, and NaN froze the impeller AND darkened its pipe ports.
 *   3. The power tile carries the AUTHORED bands — the 25 % startup trip must not read as
 *      armed out of a kernel that carries no trips ("TRIP 25%" at 99.8 % power, measured).
 *   4. The payload fixes land THROUGH the stack: STOP secures HPI, heater MANUAL holds,
 *      letdown lamps latch, dump CLOSED reads, charging OFF reads.
 *   5. THE TRIP RIDE (#509/#512): an ENGINE-owned automatic trip must reach the kernel's
 *      rps latch (before the mirror, resetRps returned null for ever); a securing click
 *      inside the sourced 45-60 s reset window refuses OUT LOUD with the time remaining,
 *      and AFTER the relay ONE click resets the function and secures the pump — signal
 *      present or not (the WTSM 12.3.2.3 circuit; what keeps a deliberate TMI-style
 *      termination reachable). RPS RESET is trip-only. The AFW block valve round-trips;
 *      charging OFF zeroes the FLOW; the #511 valves (MSIV, accumulator) are OPERABLE
 *      machinery — the MSIV trips the turbine, the accumulator valve carries its
 *      at-power administrative lock.
 *
 * Injection self-test: the kernel merge/mirror, the reset snapshot patch and two payload
 * mappers are reverted from source and the matching checks must go red — a check born
 * beside its fix is not green until it has been made to fail (house rule).
 *
 *   node test/run_pwr2_board.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var SRC = path.join(__dirname, '..', 'engines', 'pwr2');

global.window = global;
/* the driver touches the DOM only inside mount/popup paths this gate never renders; the
 * stub answers just enough for load + closePop */
function el() {
  return { style: {}, classList: { add: function () {}, remove: function () {}, toggle: function () {} },
           setAttribute: function () {}, removeAttribute: function () {}, appendChild: function () {},
           removeChild: function () {}, addEventListener: function () {}, remove: function () {} };
}
global.document = {
  createElement: el, createElementNS: el,
  getElementById: function () { return null; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  addEventListener: function () {}, removeEventListener: function () {},
  body: el()
};

require(path.join(__dirname, '..', 'engines', 'load_mode.js'));
require(path.join(__dirname, '..', 'engines', 'pwr', 'pwr_config.js'));
require(path.join(__dirname, '..', 'layers', 'control', 'control_kernel.js'));
require(path.join(__dirname, '..', 'layers', 'control', 'pwr_control.js'));
require(path.join(__dirname, '..', 'engines', 'pwr', 'pwr_instruments.js'));
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_kinetics',
 'pwr2_fuel', 'pwr2_reactor', 'pwr2_sources', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief',
 'pwr2_condenser', 'pwr2_cvcs', 'pwr2_eccs', 'pwr2_afw', 'pwr2_damage', 'pwr2_protection',
 'pwr2_pressurizer', 'pwr2_dumpctl', 'pwr2_break', 'pwr2_containment', 'pwr2_rhr',
 'pwr2_true_state', 'pwr2_instruments', 'pwr2_feedwater', 'pwr2_engine', 'pwr2_shell'
].forEach(function (f) { require(path.join(SRC, f + '.js')); });
require(path.join(__dirname, '..', 'layers', 'instructor_layer.js'));
require(path.join(__dirname, '..', 'layers', 'simulation_service.js'));
require(path.join(__dirname, '..', 'ui', 'diagram', 'board', 'pwr_board_data.js'));
var WIRING_PATH = path.join(__dirname, '..', 'ui', 'diagram', 'board', 'pwr_board_wiring.js');
require(WIRING_PATH);

var RD = globalThis.RD;
var BOLD = '[1m', RED = '[31m', GREEN = '[32m', RST = '[0m';
var nPass = 0, nFail = 0;
function ck(name, cond, note) {
  var ok = !!cond;
  if (ok) nPass++; else nFail++;
  console.log((ok ? '  ' + GREEN + 'PASS' + RST + '  ' : '  ' + RED + 'FAIL' + RST + '  ') + name +
    (note ? '  -- ' + note : ''));
  return ok;
}
function head(s) { console.log('\n' + BOLD + s + RST); }

/* ---- the live plant + the app-shaped cmd path -------------------------------------------- */
function mkWorld() {
  var svc = new RD.SimulationService({ seed: 0xB0A2D });
  svc.selectPlant('pwr2', 'hot_full_power', null, undefined);
  svc.running = true; svc.timeAcceleration = 10; svc.attentionStops = false;
  var snap = null;
  var log = [];                                   /* every command's fate, app-cmd()-shaped */
  function cmd(c) {
    var r;
    try { r = svc.handleCommand(c); }
    catch (e) { r = { type: 'error', code: 'COMMAND_ERROR', message: String(e && e.message || e) }; }
    log.push({ action: c && c.action, result: r });
    return r;
  }
  function tick(n) { for (var i = 0; i < (n || 1); i++) snap = svc.tick(); return snap; }
  tick(10);                                       /* 10 s at 10x — the settled IC needs no more */
  RD.PwrBoard = { lastSnapshot: function () { return snap; } };
  /* `protection` is the RUNNING plant's config (#556) — the same accessor ui/app.js passes at
   * mount. Without it the board falls back on RD.PWR_CONTROL.protection, the retired plant's
   * table captured at script load, and the pressurizer tile's alarm edges are 8 points out. */
  RD.PwrBoardDriver.onMount(global.document, {
    cmd: cmd, units: function (u) { return u; },
    protection: function () { return svc.layer && svc.layer.config; }
  }, {});
  return { svc: svc, cmd: cmd, tick: tick, log: log, snap: function () { return snap; } };
}

function runSuite(quietRec) {
  var D = RD.PwrBoardDriver;
  var w = mkWorld();
  var rec = quietRec || null;
  function q(name, cond, note) { if (rec) { rec.push({ ok: !!cond }); return !!cond; } return ck(name, cond, note); }

  /* ---- 1. pump props are numbers ---------------------------------------------------------- */
  if (!rec) head('PUMP PROPS  [the spin speed must be a number — NaN froze the RCP, #506.5]');
  var pumpIds = ['imrobpq4a70', 'imrqvzbd9hd', 'imrobph7xrq', 'imrqp87ueqb', 'imrobnzlha1'];
  var badPump = [];
  pumpIds.forEach(function (id) {
    var p = D.compProps({ id: id }, w.snap());
    if (!p || typeof p.running !== 'boolean' ||
        (p.speed != null && !isFinite(p.speed))) badPump.push(id + '=' + JSON.stringify(p && p.speed));
  });
  q('every pump prop is finite (running boolean, speed number-or-null)', badPump.length === 0,
    badPump.join(',') || 'rcp speed ' + D.compProps({ id: 'imrobpq4a70' }, w.snap()).speed.toFixed(2));

  /* ---- 2. the power tile ------------------------------------------------------------------ */
  if (!rec) head('POWER TILE  [authored bands — the 25 % startup trip is not armed here, #506.7]');
  var tile = D.compProps({ id: 'imrzl4b7g9m' }, w.snap());
  q('power tile shows the authored at-power bands, not the startup window',
    tile && tile.tripHi === 120 && tile.max > 100 && tile.note !== 'TRIP 25%',
    tile && ('tripHi ' + tile.tripHi + ', max ' + tile.max.toFixed(0) + ', note ' + JSON.stringify(tile.note)));

  /* ---- 2b. THE SCALES AND BANDS COME FROM THIS PLANT (#557, #556) -------------------------
   * Both defects are the board holding its own second copy of a plant constant, and both were
   * invisible to every gate: nothing cross-checked a rendered gpm against delivered kg/s, and
   * the only band assertion in this file was on the power tile. */
  if (!rec) head('DNB / OTdT MARGIN  [the gauge and the trip are ONE equation, #561]');
  /* The reused pwr instrument layer drew this gauge from the retired plant's fitted DNB surface
   * (rated delta-T 33.0 degC, margin 8.0 degC, factor 0.60 — the last two UNVERIFIED) while this
   * plant's trip uses the sourced Ginna Table 15.0-7 coefficients on a 31.1 degC split. MEASURED
   * before the fix: board overtemperature setpoint 122.91 % against the plant's 132.21 %, and on
   * a depressurization the tile went RED 356 s before the trip with 13.70 margin points still
   * standing — while the OTdT ROD STOP annunciator, which reads this same channel, latched 436 s
   * early. Asserted at the SETPOINT, not the margin: the margin also carries instrument lag, and
   * a band loose enough to absorb lag would absorb the defect too.
   *
   * FIRST in this section, on the plant as mkWorld left it. A SECOND mkWorld() here would have
   * been the natural way to get a pristine plant and is a trap: onMount rebinds the driver's
   * single ctxRef, so every later press in the FIRST world routes its command into the second
   * world's log — measured, it reds the no-orphan sweep with five "silent" buttons that were
   * working fine. */
  var rpD = w.svc.engine.eng.rpsReport || {};
  var sD = w.snap(), otRow = null, opRow = null;
  (rpD.functions || []).forEach(function (f) {
    if (f.id === 'ot_delta_t') otRow = f; if (f.id === 'op_delta_t') opRow = f;
  });
  /* 2 points of slack, and it is INSTRUMENT LAG, not tolerance: the gauge is fed indicated Tavg
   * and pressure (HR1) and the trip reads true values, so on a settled plant they differ by the
   * RTD's residual only. The defect was 9.30 points on the overtemperature setpoint and 7.00 on
   * the overpower one — both far outside this. */
  q('the board\'s overtemperature setpoint is the PLANT\'s, not the retired DNB surface',
    otRow && Math.abs(sD.instruments.otdt_setpoint - otRow.setpoint * 100) < 2.0,
    otRow && ('board ' + sD.instruments.otdt_setpoint.toFixed(2) + ' vs trip ' +
      (otRow.setpoint * 100).toFixed(2)));
  q('the board\'s overpower setpoint is the PLANT\'s sourced K4, not the retired 108 %',
    opRow && Math.abs(sD.instruments.opdt_setpoint - opRow.setpoint * 100) < 2.0 &&
    Math.abs(sD.instruments.opdt_setpoint - 115) < 0.01,
    opRow && ('board ' + sD.instruments.opdt_setpoint.toFixed(2) + ' vs trip ' +
      (opRow.setpoint * 100).toFixed(2)));
  /* And the DENOMINATOR, which is the half a setpoint check cannot see: loop delta-T is
   * normalized on 31.1 degC here, not the retired 33.0, so the two channels agree in LEVEL too. */
  q('loop delta-T is normalized on THIS plant\'s rated split (31.1 degC), not the retired 33.0',
    otRow && Math.abs(sD.instruments.loop_delta_t - otRow.value * 100) < 2.0,
    otRow && ('board ' + sD.instruments.loop_delta_t.toFixed(2) + ' vs trip ' +
      (otRow.value * 100).toFixed(2)));

  if (!rec) head('PLANT-PUBLISHED SCALES  [the AFW full scale is this plant\'s, #557]');
  /* Start ONE pump. A single motor-driven pump is the discriminating fixture: at both pumps
   * running the indication is 1.0 and any full scale reads its own value back, so the ratio
   * check would pass against the wrong constant — the vacuous shape #477 records. */
  w.cmd({ action: 'set_afw', active: true, pump: 'mdafw' });
  /* THE THROTTLE MUST BE OPENED, AND THE FIXTURE MUST SAY SO (#562). Delivery stopped being a
   * function of pump state alone the day the flow control valves landed: the `afw_level`
   * channel ships engaged and holds the valve SHUT above its band, so at power this check saw
   * a board correctly rendering 0.0 gpm against an expectation of 86.20 and reddened. That is
   * the fixture being stale, not the board. Take the channel to MANUAL and open the valve so
   * there is a flow to scale at all — a zero indication would make the ratio vacuous. */
  w.cmd({ action: 'set_auto_channel', channel_id: 'afw_level', engaged: false });
  w.cmd({ action: 'set_afw_flow', pct: 100 });
  w.tick(30);
  var sAfw = w.snap();
  var GPM_PER_KGS = 264.172 * 60 / 1000;         /* rho 1000 — pwr2_afw's own convention */
  var eAfw = w.svc.engine.eng;
  /* READ THE PLANT'S OWN DELIVERED FLOW, do not re-derive it. The old form summed the RATED
   * flows of whichever pumps were running — a second copy of the delivery law, which went
   * wrong the moment the law gained a throttle term. That is the same class of defect #557 is
   * about, in the check rather than the board. */
  var trueKgs = (sAfw.true_state.afw_flow_normalized || 0) *
                (RD.pwr2.afw.mdafwRatedKgs() + RD.pwr2.afw.tdafwRatedKgs());
  var trueGpm = trueKgs * GPM_PER_KGS;
  /* ...and the fixture still has to be DISCRIMINATING: one pump only, so the indication is
   * 0.333 rather than 1.0 and a wrong full scale cannot read its own value back (#477). */
  q('the AFW fixture is discriminating — ONE pump, valve open, so the indication is not 1.0',
    Math.abs((sAfw.true_state.afw_flow_normalized || 0) - 1 / 3) < 0.02,
    'afw_flow_normalized ' + (sAfw.true_state.afw_flow_normalized || 0).toFixed(4));
  var rrAfw = D.valueFor({ id: 'imrmstovyli' }, sAfw);
  var shownGpm = rrAfw ? parseFloat(String(rrAfw.text).replace(/[^0-9.\-]/g, '')) : NaN;
  q('AUX FEED WATER FLOW renders the flow the plant DELIVERS, not the retired plant\'s scale',
    isFinite(shownGpm) && trueGpm > 0 && Math.abs(shownGpm / trueGpm - 1) < 0.05,
    'board ' + (isFinite(shownGpm) ? shownGpm.toFixed(1) : '??') + ' gpm vs true ' +
    trueGpm.toFixed(2) + ' gpm (' + trueKgs.toFixed(4) + ' kg/s) = ' +
    (shownGpm / trueGpm).toFixed(3) + 'x');
  q('the plant publishes its own AFW full scale, and it is the sourced rating',
    Math.abs((sAfw.control_state.afw_flow_gpm_full || 0) - RD.pwr2.afw.ratedGpm()) < 1e-9 &&
    Math.abs(RD.pwr2.afw.ratedGpm() - 86.197) < 0.01,
    'control_state.afw_flow_gpm_full = ' + sAfw.control_state.afw_flow_gpm_full);
  w.cmd({ action: 'set_afw', active: false });
  w.cmd({ action: 'set_auto_channel', channel_id: 'afw_level', engaged: true });
  w.tick(5);

  if (!rec) head('PZR LEVEL TILE  [the trip line is THIS plant\'s, #556]');
  /* AT POWER the at-power permissive P-7 is met, so the 87 % high-level scram is armed and the
   * tile must draw its red edge there — not at the retired table's 100, which put the measured
   * 87.7 % scram inside an AMBER band with 12.3 points of apparent headroom. */
  var pz = D.compProps({ id: 'ims2immon9z' }, w.snap());
  var setp = ((w.snap().rps_state.trip_setpoints || [])[0] || {}).setpoint;
  q('the tile arms at the ENGINE-carried high-level setpoint (87 %), not the static 100',
    pz && pz.tripHi === 87 && setp === 87,
    pz && ('tripHi ' + pz.tripHi + ', published setpoint ' + setp));
  /* THE LOW SIDE IS A REAL ABSENCE, not missing data: the plant says it speaks for pzr_level
   * and publishes no low row, so the red band the tile used to paint from the meter bottom to
   * 12 % marks a scram that cannot occur here. */
  q('no low-level trip band — PWR2 carries no low pressurizer-level scram',
    pz && pz.tripLo === 0 &&
    (w.snap().rps_state.trip_setpoint_instruments || []).indexOf('pzr_level') >= 0 &&
    (w.snap().rps_state.trip_setpoints || []).filter(function (r) {
      return r.instrument === 'pzr_level' && r.direction === 'low'; }).length === 0,
    pz && ('tripLo ' + pz.tripLo + ', speaks for ' +
      JSON.stringify(w.snap().rps_state.trip_setpoint_instruments)));
  /* The third edge, unfiled and found while fixing the other two: the tile read the retired
   * table's 25 % low alarm while PWR2's own annunciator fired somewhere else entirely.
   *
   * THE CLAIM CHANGED SHAPE AT #500 (2026-08-29) AND IS NOW STRONGER, not merely renumbered.
   * The old form pinned a NUMBER (17), which any fixed setpoint satisfies by existing; the
   * alarm is program-relative now, so the edge is `program + setpoint` and the thing worth
   * asserting is that it MOVES with the program — a claim the old form could not make and
   * which no static table can pass. */
  var progAtPower = w.svc.engine.getControlState().pzr_level_program_pct;
  var lowSp = (w.svc.layer.config.alarms.filter(function (a) {
    return a.id === 'pzr_level_low'; })[0] || {});
  q('the low ALARM edge is the running plant\'s PROGRAM plus its own deviation setpoint',
    pz && lowSp.instrument === 'pzr_level_dev' && progAtPower != null &&
    Math.abs(pz.alarmLo - (progAtPower + lowSp.setpoint)) < 0.51,
    pz && ('alarmLo ' + pz.alarmLo + ' vs program ' +
      (progAtPower == null ? '?' : progAtPower.toFixed(1)) + ' + ' + lowSp.setpoint));

  /* PRIMARY PRESSURE TILE (#576c). run_pwr2_board's only band assertion used to be the power
   * tile's, so nothing in the tree ever checked this one against a PWR2 plant — and the half
   * that was wrong is invisible to a source read, because the tile's CENTRE was already live
   * off `pressure_setpoint` while its two HALF-WIDTHS came from `RD.PWR_CONFIG.pressurizer`
   * captured at script load, i.e. the retired engine's -30/+50 psi. Right middle, wrong width.
   *
   * PWR2's ladder is sourced and asymmetric (pwr2_pressurizer CONTROL, WTSM Fig 10.2-3):
   * backup heaters in at -25 psi, spray starting at +25. The tile takes those two edges
   * because each is an actuation the player can see the plant take, which is what the tile's
   * own comment says NORMAL means. Asserted against the PLANT'S numbers, never retyped —
   * retyping them here would be the second copy this whole family of defects is made of. */
  if (!rec) head('PRIMARY PRESSURE TILE  [the control band is THIS plant\'s, #576c]');
  var pr = D.compProps({ id: 'ims2immsvn6' }, w.snap());
  var csP = w.svc.engine.getControlState();
  var PZC = globalThis.RD.pwr2.pressurizer.CONTROL;
  /* the tile's props arrive in its DISPLAY unit (psia); the control state is engine-internal
   * SI (MPa). Converting the setpoint once, here, keeps both sides in the tile's currency. */
  var PSI = 145.0377, spPsi = csP.pressure_setpoint * PSI;
  q('the NORMAL band is the running plant\'s own ladder, not the retired -30/+50 psi',
    pr && csP.pressure_band_psi &&
    Math.abs(pr.normLo - (spPsi + PZC.backup_on_psi)) < 0.1 &&
    Math.abs(pr.normHi - (spPsi + PZC.spray_start_psi)) < 0.1,
    pr && ('normLo/normHi ' + pr.normLo.toFixed(1) + '/' + pr.normHi.toFixed(1) +
      ' psia about a ' + spPsi.toFixed(1) + ' psia setpoint'));
  /* THE DISCRIMINATOR. Width, not position — the previous check would still pass if the band
   * were centred right and 30/50 wide, because both edges move with the setpoint. This one
   * fails on exactly that, and it is the shipped defect's own signature: SYMMETRIC at the
   * plant's 25 psi, against the retired plant's 30 below / 50 above. */
  q('and it is SYMMETRIC (+-25 psi), which the retired -30/+50 band is not',
    pr && Math.abs((spPsi - pr.normLo) - (pr.normHi - spPsi)) < 0.1 &&
    Math.abs((pr.normHi - pr.normLo) - 50) < 0.2,
    pr && ('below ' + (spPsi - pr.normLo).toFixed(1) +
      ' psi, above ' + (pr.normHi - spPsi).toFixed(1) + ' psi'));

  /* ---- 2b. THE CHARGING BOX'S CEILING (#516 item 11) --------------------------------------
   * The owner read "0-60 gpm" off the board and found the box refused anything over 30. Both
   * halves came from `RD.PWR_CONFIG.reactivity.charging_max` captured at script load — the
   * RETIRED engine — while `set_charging_flow` clamps the demand to [0,1] against THIS plant's
   * 30.14 gpm, so the top half of the range was one indistinguishable value. */
  if (!rec) head('CHARGING SETPOINT BOX  [the ceiling belongs to THIS plant, #516 item 11]');
  var CVC = globalThis.RD.pwr2.cvcs.CVCS;
  var chgMax = CVC.charging_max_gpm();
  var cb = D.boundsFor({ id: 'imrpq48hn3t', unit: 'gpm' });
  q('the bound is this plant CHARGING CAPACITY, not the retired 60 gpm',
    cb && Math.abs(cb[1] - chgMax) <= 1 && cb[0] === 0,
    cb ? (cb[0] + '-' + cb[1] + ' gpm against CVCS ' + chgMax.toFixed(2)) : 'no bounds');
  /* THE DISCRIMINATOR: a box that still carried the retired 60 would pass nothing here, and a
   * box bounded at some OTHER wrong number would pass the check above only if it happened to
   * sit within 1 gpm of the plant. This one names the defect's own signature — the shipped
   * ceiling was exactly 2x the plant's. */
  q('and it is NOT the retired 60 gpm, which is 2x what this plant can charge',
    cb && cb[1] < 45,
    cb ? ('max ' + cb[1] + ' gpm; retired board bound was 60') : 'no bounds');
  /* The CAPTION is the half the owner actually read. Its authored label is the literal string
   * "0-60 gpm" in generated board data, so a bound fixed without the caption leaves the lie on
   * the screen. */
  var chgHint = D.numberHint({ id: 'imrpq48hn3t', unit: 'gpm', label: '0-60 gpm' });
  q('the range caption is DERIVED, so it cannot still read the authored "0-60 gpm"',
    typeof chgHint === 'string' && chgHint.indexOf('60') === -1 &&
    chgHint.indexOf(String(Math.round(chgMax))) !== -1,
    'caption "' + chgHint + '"');

  /* ---- 2c. THE SG FEED BOX WALKS (#516 item 1) --------------------------------------------
   * The owner: the arrows "don't like to change the number". The box read back
   * `feed_pump_speed_pct` — the DELIVERED feed fraction, behind the feed pump lag — so each
   * click re-anchored the operator's demand onto a value still trailing the previous click.
   * Measured on the shipped plant: eight +1 gpm clicks moved the box +0.5 gpm in total.
   *
   * THIS DRIVES THE RENDERER'S OWN PATH, numberFor -> onNumber, not the NUMBERS map directly,
   * so it covers the unit layer and the driver seam the operator actually goes through. */
  if (!rec) head('SG FEED SETPOINT BOX  [an arrow click must move it one step, #516 item 1]');
  var fbItem = { id: 'imro8xhy2me', unit: 'gpm' };
  var fbStart = D.numberFor(fbItem, w.snap());
  var fbN = 8, fbStep = 1;
  for (var fbI = 0; fbI < fbN; fbI++) {
    D.onNumber(fbItem, D.numberFor(fbItem, w.snap()) + fbStep);
    w.tick(1);
  }
  var fbEnd = D.numberFor(fbItem, w.snap());
  var fbMoved = fbEnd - fbStart;
  q('eight +1 gpm arrow clicks move the box +8 gpm, not a fraction of one',
    fbStart != null && fbEnd != null && Math.abs(fbMoved - fbN * fbStep) < 0.5,
    'moved ' + fbMoved.toFixed(2) + ' gpm of ' + (fbN * fbStep) + ' asked');
  /* THE DISCRIMINATOR. A box reading the DELIVERY is not merely slow — it CONVERGES, because
   * each click's increment is eaten by the lag the previous click has not worked off. The
   * shipped defect moved 6 % of what was asked; anything reading a lagging channel lands far
   * below one step per click however long the ride. */
  q('and the walk is monotone per click (a delivery-reading box converges instead)',
    fbStart != null && fbEnd != null && fbMoved > fbN * fbStep * 0.9,
    'per click ' + (fbMoved / fbN).toFixed(3) + ' gpm (shipped defect: 0.06)');

  /* ---- 2b2. THE CIRCULATING-WATER BOX (#591 item 1) ---------------------------------------
   * The owner: "changing condenser cooling temp didn't affect anything notably." It could not:
   * the action sat in the shell's REFUSED registry carrying the RETIRED plant's reason, and the
   * board drew the box dark off the capability flag that refusal justified — while
   * pwr2_condenser has computed the vacuum from this temperature since it was written. Two
   * halves, and the second is the one a fix to the first would have left behind: the box's
   * BOUNDS came from `RD.PWR_CONFIG.turbine` (35-85 degF), which stops BELOW the C-9 removal
   * point at 93 degF, so a live box would still have hidden the casualty. */
  if (!rec) head('CW INLET TEMP BOX  [live, and bounded by THIS plant, #591 item 1]');
  var cwItem = { id: 'ims3v42jghn', unit: 'F' };
  var CDm = globalThis.RD.pwr2.condenser;
  q('the box is LIVE on the plant the site runs (it was dark behind a refusal)',
    D.numberDisabled(cwItem, w.snap()) === false, '');
  var cwB = D.boundsFor(cwItem);
  q('its bounds are the CONDENSER MODULE own band, not the retired config',
    cwB && Math.abs(cwB[0] - CDm.COND.cw_min_f) < 0.6 &&
    Math.abs(cwB[1] - CDm.COND.cw_max_f) < 0.6,
    cwB ? (cwB[0] + '-' + cwB[1] + ' degF against the module ' +
           CDm.COND.cw_min_f + '-' + CDm.COND.cw_max_f) : 'no bounds');
  /* THE DISCRIMINATOR. The band happens to be the same 35-85 degF the retired config carries, so
   * "the numbers match" proves nothing on its own — what is asserted is PROVENANCE: mutate what
   * the plant publishes and the box must follow it, which a board reading `_TB` at script load
   * cannot do. The ceiling itself is SOURCED (Ginna TS Bases B 3.7.8, service water OPERABLE at
   * <= 85 degF) and must not be widened to put the C-9 removal point in reach. */
  q('...and the bound FOLLOWS the plant, not a config captured at script load',
    (function () {
      var snap = w.snap();
      var moved = { true_state: snap.true_state, instruments: snap.instruments,
                    control_state: Object.assign({}, snap.control_state,
                                                 { cw_inlet_range_c: [0, 40] }),
                    rod_groups: [] };
      var saved = RD.PwrBoard.lastSnapshot;
      RD.PwrBoard.lastSnapshot = function () { return moved; };
      var b2 = D.boundsFor(cwItem);
      RD.PwrBoard.lastSnapshot = saved;
      return b2 && Math.abs(b2[1] - 104) < 1.5;   /* 40 degC = 104 degF */
    })(),
    'a plant publishing 0-40 degC must move the box to 32-104 degF');
  q('and the box READS BACK the running plant sink',
    Math.abs(D.numberFor(cwItem, w.snap()) - 50) < 1.0,
    'reads ' + D.numberFor(cwItem, w.snap()) + ' degF against the sourced 50 degF design inlet');

  /* ---- 2b3. THE PZR SPRAY BOX READS THE DEMAND (#564 item 1) -------------------------------
   * `control_state.spray_valve_pct` is DELIVERED flow on this plant, after the stuck-valve
   * override and the water-solid gate — and the board read it TWICE: as the operator's own
   * demand box and as the `asked` half of the SPRAY FLOW readout's "demanded and not arriving"
   * amber, which made that amber an identity that is always zero. Both directions measured on
   * the shipped plant: a standing 60 % demand read 0.0 in the box once the pressurizer went
   * solid, and with the operator demanding 0 a stuck valve read back 100 %. */
  if (!rec) head('PZR SPRAY BOX  [the operator DEMAND, never the delivery, #564 item 1]');
  function sprayView(demandPct, deliveredPct) {
    var snap = { true_state: {}, instruments: { pzr_spray_flow: deliveredPct }, control_state: {
      spray_demand_pct: demandPct, spray_valve_pct: deliveredPct }, rod_groups: [] };
    return { box: D.numberFor({ id: 'imro929i738', unit: '%' }, snap),
             read: D.valueFor({ id: 'imsgt6qmdgx' }, snap) };
  }
  var svGap = sprayView(60, 0), svStuck = sprayView(0, 100);
  q('a standing demand SURVIVES the plant refusing it (the box does not erase the player)',
    Math.abs(svGap.box - 60) < 0.01,
    'demand 60 %, delivery 0 % -> box reads ' + svGap.box);
  /* THE STATE THE READOUT EXISTS FOR. Reading the delivery made `asked && v < 20` an identity
   * that can never be true, so this rendered green — "nothing to see" — in the one case the
   * indication was built to flag. */
  q('...and SPRAY FLOW goes AMBER on demanded-and-not-arriving, which was unreachable',
    svGap.read && svGap.read.color !== '#5aad7c' &&
    svStuck.read && svGap.read.color !== svStuck.read.color,
    'gap ' + (svGap.read && svGap.read.color) + ' against healthy ' +
    (svStuck.read && svStuck.read.color) + ' — the colour constant itself lives in the ' +
    'wiring; the claim here is that the two states RENDER DIFFERENTLY, which they could not');
  /* THE OTHER DIRECTION, which the issue did not name: a stuck valve was attributed to the
   * player, their own box reading a 100 % they never asked for. */
  q('...and a STUCK valve is not attributed to the operator (box stays at their 0 %)',
    Math.abs(svStuck.box - 0) < 0.01 &&
    svStuck.read && svStuck.read.color === '#5aad7c',
    'demand 0 %, delivery 100 % -> box ' + svStuck.box + ', readout ' +
    (svStuck.read && svStuck.read.color));

  /* ---- 2b4. THE TRIP BLOCKS PANEL (#564 item 2, closed out by #600/#601) --------------------
   * The history, because it is the whole reason these checks are shaped the way they are.
   * FIVE rows were drawn against a plant publishing THREE blocks. `lo_flow`, `rcp_breaker` and
   * `ir_high` had no `trip_block_status` entry, so `ts.can_block === false` was false and all
   * three rendered ENABLED in every plant state — each press throwing. #564 made them go dark
   * and read N/A, which stopped the throw and left a different lie standing: a row offering an
   * action the plant does not have is still a claim about the plant. #600/#601 adjudicated them
   * one at a time and NONE of the three ends as a dark row:
   *   lo_flow, rcp_breaker  DELETED — WTSM 12.2 §12.2.3.12 makes the low-flow block AUTOMATIC
   *                         below P-7, so neither was ever an operator action anywhere.
   *   ir_high               BUILT — the sourced 25 % intermediate-range trip the row had been
   *                         drawing for a plant that did not carry it.
   * So on the shipped plant every drawn row is now a published one, and the SUPPORTED predicate
   * has no live subject. It is kept and PROVEN BY INJECTION below rather than deleted: the
   * preview channel still boots the retired engine, which publishes a different set, and this
   * predicate is the only thing between that mismatch and a button that throws on press. */
  if (!rec) head('TRIP BLOCKS PANEL  [the plant publishes, the board offers, #564/#600/#601]');
  var tbRows = D.tripBlockRows(w.snap()), tbById = {};
  tbRows.forEach(function (r) { tbById[r.id] = r; });
  var tbPub = (w.snap().rps_state && w.snap().rps_state.trip_block_status) || {};
  q('every row the panel draws IS one this plant publishes — no dark rows left (#600)',
    tbRows.length > 0 &&
    tbRows.every(function (r) {
      return Object.prototype.hasOwnProperty.call(tbPub, r.id) && r.supported === true;
    }) &&
    ['lo_flow', 'rcp_breaker'].every(function (id) { return !tbById[id]; }),
    'published ' + Object.keys(tbPub).sort().join(',') + ' — rows ' +
    tbRows.map(function (r) { return r.id + ':' + r.text; }).join(' '));
  /* THE PREDICATE STILL WORKS, and only an injection can say so now that nothing on the shipped
   * plant exercises it. A snapshot with one row's entry REMOVED must dark that row and leave
   * the others alone — the shape a preview-channel mismatch would produce. */
  var snapMiss = JSON.parse(JSON.stringify(w.snap()));
  delete snapMiss.rps_state.trip_block_status.ir_high;
  var missRows = D.tripBlockRows(snapMiss), missById = {};
  missRows.forEach(function (r) { missById[r.id] = r; });
  q('...and a row the plant STOPS publishing goes dark and reads N/A, its neighbours untouched',
    missById.ir_high && missById.ir_high.supported === false &&
    missById.ir_high.disabled === true && missById.ir_high.text === 'N/A' &&
    missById.pr_low_setpoint && missById.pr_low_setpoint.supported === true &&
    missById.lo_press && missById.lo_press.supported === true,
    'ir_high reads "' + (missById.ir_high ? missById.ir_high.text : 'NO ROW') +
    '" with its status entry removed — the guard is live even though the shipped plant no ' +
    'longer trips it');
  /* ---- THE CAPTIONS (#600) — every setpoint in one comes from the SNAPSHOT ------------------
   * `PR HIGH (LOW SETPT)` was the literal string "STARTUP TRIP · 25%" over a plant at 35 %, and
   * `PZR PRESS LO-LO` read the static pwr1 table's 12.41 MPa (1800 psi) over a published 1775.
   * The power TILE was already drawing 35 from this same snapshot, so the popover contradicted
   * the tile on the same board. Neither could be caught because the caption existed only as a
   * DOM write; it is a field on the row now, and these are the checks that were impossible. */
  q('the flux captions carry the PLANT setpoints, not a literal (#600)',
    / 35% · /.test(tbById.pr_low_setpoint.sub) && !/25%/.test(tbById.pr_low_setpoint.sub) &&
    / 25% · /.test(tbById.ir_high.sub),
    'PR "' + tbById.pr_low_setpoint.sub + '" | IR "' + tbById.ir_high.sub + '"');
  q('...and the pressure caption reads the published setpoint, not the retired table',
    /175[0-9]|17[0-8][0-9]/.test(tbById.lo_press.sub) && !/1800/.test(tbById.lo_press.sub),
    'lo_press "' + tbById.lo_press.sub + '" — the static table would say 1800 psi');
  /* AND A SNAPSHOT THAT PUBLISHES NO SETPOINT PRINTS NO NUMBER — never a hard-coded fallback.
   * That path is live: the retired engine's kernel publishes trip_block_status entries with no
   * `setpoint` field, and printing this plant's 35/25 there would be the #557 defect wearing
   * the fix's clothes. */
  var snapBare = JSON.parse(JSON.stringify(w.snap()));
  Object.keys(snapBare.rps_state.trip_block_status).forEach(function (k) {
    delete snapBare.rps_state.trip_block_status[k].setpoint;
  });
  var bareById = {};
  D.tripBlockRows(snapBare).forEach(function (r) { bareById[r.id] = r; });
  q('...and a plant that publishes NO setpoint gets no number at all, not a borrowed one',
    !/[0-9]+%/.test(bareById.pr_low_setpoint.sub) && !/[0-9]+%/.test(bareById.ir_high.sub) &&
    /P-10 PERMISSIVE/.test(bareById.ir_high.sub) && bareById.ir_high.supported === true,
    'IR reads "' + bareById.ir_high.sub + '" with no published setpoint');

  /* THE INTERMEDIATE RANGE ROW IS THE ONE #601 BUILT — supported, live, and carrying the
   * plant's own 25 %, not the retired plant's 20 % rod-stop number. */
  q('...and IR HIGH FLUX is a LIVE row now, at the plant\'s own 25 % (#601)',
    tbById.ir_high && tbById.ir_high.supported === true && tbById.ir_high.text !== 'N/A' &&
    tbPub.ir_high && tbPub.ir_high.setpoint === 25 &&
    tbById.pr_low_setpoint && tbById.pr_low_setpoint.supported === true,
    tbById.ir_high ? ('ir_high reads "' + tbById.ir_high.text + '", published setpoint ' +
                      (tbPub.ir_high && tbPub.ir_high.setpoint)) : 'NO ROW');
  q('and SI ACTUATION — a block this plant carries — now HAS a row, and it is live',
    tbById.si_trip && tbById.si_trip.supported === true && tbById.si_trip.text !== 'N/A',
    tbById.si_trip ? ('si_trip reads "' + tbById.si_trip.text + '", disabled ' +
                      tbById.si_trip.disabled) : 'NO ROW');
  /* A LEGACY snapshot — no trip_block_status at all — must say NOTHING about capability, or
   * every old recording and minimal fixture would render the whole panel dead. */
  q('a snapshot with no trip_block_status leaves every row live (the legacy shape)',
    D.tripBlockRows({ true_state: {}, instruments: {}, control_state: {},
                      rps_state: { trip_blocks: {} } })
     .every(function (r) { return r.supported === true; }), '');

  /* ---- 2b5. THE ROD STOP AND THE TURBINE RUNBACK ARE VISIBLE (#578) ------------------------
   * `pwr2_engine.js:1324-1325` has published `ts.rod_stop` and `ts.runback_active` since the
   * delta-T pair was built, and a tree-wide grep of `ui/diagram/board/` found NEITHER read —
   * lamps existed only on the dev page. The delta-T margin tile's amber came from comparing the
   * margin against `RD.PWR_CONFIG` (the RETIRED plant's constant) and was blind to both FLUX
   * rod stops and to the runback outright. It now reads the plant's own signals.
   *
   * THE FIXTURES ARE HAND-BUILT SNAPSHOTS, deliberately: the flux stops are what the derived
   * colour could never see, and holding the margin HEALTHY in every row is the only way to show
   * that the word comes from the signal rather than from the arithmetic. */
  if (!rec) head('ROD STOP / RUNBACK (#578)  [read from the plant, not re-derived]');
  function dtTile(ts) {
    return D.valueFor({ id: 'bdDtMargin' },
      { true_state: ts || {}, instruments: { otdt_margin: 31.2, opdt_margin: 40.0 },
        control_state: {}, rod_groups: [] });
  }
  var dtClear = dtTile({}), dtStop = dtTile({ rod_stop: true }),
      dtRb = dtTile({ rod_stop: true, runback_active: true });
  q('a healthy plant with a wide margin reads NORMAL',
    dtClear && dtClear.color === '#5aad7c',
    dtClear ? ('"' + dtClear.text + '" ' + dtClear.color) : 'no tile');
  /* THE DISCRIMINATOR, and the whole point: the margin is 31.2 % — nowhere near the 3 % rod-stop
   * line — in EVERY row here. A tile that still derives the state from the margin cannot tell
   * these three snapshots apart, which is exactly how both FLUX rod stops (which have no
   * delta-T margin at all) were invisible on this board. */
  q('a standing ROD STOP lights it with the delta-T margin wide open (31.2 %)',
    dtStop && dtStop.color !== dtClear.color,
    dtStop ? ('"' + dtStop.text + '" ' + dtStop.color) : 'no tile');
  q('...and so does a RUNBACK on its own signal',
    dtRb && dtRb.color === dtStop.color,
    dtRb ? ('"' + dtRb.text + '" ' + dtRb.color) : 'no tile');
  /* The margin NUMBER is untouched: it is what the player acts on, and this change is a colour
   * source, not a re-authoring of the readout. */
  q('...and the margin number itself is unchanged in every state',
    dtStop && /31\.2/.test(dtStop.text) && dtRb && /31\.2/.test(dtRb.text) &&
    dtClear && /31\.2/.test(dtClear.text), '');

  /* ---- 2d. THE VESSEL DRAWS A LEVEL, NOT A MASS FRACTION (#516 item 6) ----------------------
   * `core_inventory_pct` is `M_total / M_nominal` RCS-wide, and early in a blowdown the mass
   * collapses because the water FLASHES while the column does not fall anything like as fast.
   * Measured on a 20 cm2 break with injection secured: at 90 s the mass fraction read 17.3 %
   * against a core 69 % uncovered, and by 630 s it read 0.74 % — an essentially dry vessel —
   * while the plant said 9 % of the core was still covered. */
  if (!rec) head('REACTOR VESSEL LEVEL  [the art is fed a LEVEL, not an inventory, #516 item 6]');
  function vesselInv(unc, hlv, massPct) {
    return D.compProps({ id: 'reactorVessel' },
      { true_state: { core_uncovered_frac: unc, primary_void_fraction: hlv,
                      core_inventory_pct: massPct, core_void_fraction: 0 },
        instruments: {}, control_state: {}, rod_groups: [] }).coreInv;
  }
  var vFull = vesselInv(0, 0, 100), vHalf = vesselInv(0.5, 1, 0.5), vDry = vesselInv(1, 1, 0.5);
  q('a covered core with a full upper plenum draws a FULL vessel',
    Math.abs(vFull - 100) < 0.01, 'coreInv ' + vFull);
  /* THE DISCRIMINATOR: all three of these carry the SAME `core_inventory_pct`, so a vessel still
   * reading the mass fraction returns one identical number for a covered core and a dry one. */
  q('...and uncovery MOVES it while the RCS mass fraction is held constant — the old wiring ' +
    'returned the same number for a covered core and a dry one',
    vHalf > vDry && vDry < 1 && Math.abs(vHalf - 25) < 0.01,
    'half-uncovered ' + vHalf + ', fully uncovered ' + vDry + ', both at mass fraction 0.5');

  /* ---- 2e. THE PIPES SAY WHAT IS IN THEM (#516 item 7) --------------------------------------
   * The primary runs declared `contents: 'water'` unconditionally, so the board drew liquid
   * coolant through a voided loop — and temperature could not say otherwise, because once the
   * loop saturates BOTH legs sit at T_sat(P). That equality is CORRECT physics (measured: thot
   * and tcold equal to the decimal through a whole loss-of-coolant accident, legs differing by
   * 0.35 in quality); it is the reason the phase has to come from the void instead. */
  if (!rec) head('PRIMARY PIPE CONTENTS  [a voided loop must not draw as water, #516 item 7]');
  /* ⚠ BEHAVIOURAL, NOT A SOURCE SCAN. A first draft grepped the wiring for `legContents` and
   * `cold_leg_void_fraction`, which is the hollow shape the standing trap list names: a source
   * scan cannot tell you the rule is REACHED. `ims2kt7fu64` is the hot leg at the surge-line
   * branch and takes its contents from the hot-leg void; the plant end is asserted separately
   * below, because a rule keyed on a field nothing publishes is a rule that never fires. */
  function hotLegContents(v) {
    return D.compProps({ id: 'ims2kt7fu64' },
      { true_state: { primary_void_fraction: v }, instruments: {}, control_state: {},
        loop_flow: {} }).contents;
  }
  var cWet = hotLegContents(0.0), cVoid = hotLegContents(0.95);
  q('a water-solid loop draws WATER and a voided one draws STEAM — the run says what is in it',
    cWet === 'water' && cVoid === 'steam',
    'void 0.00 -> "' + cWet + '", void 0.95 -> "' + cVoid + '"');
  /* THE DISCRIMINATOR is the plant end: once the loop saturates, TEMPERATURE cannot separate the
   * legs (both sit at T_sat by definition), so the board needs a per-leg void — and the cold leg
   * published none. A rule keyed on a field nothing emits never fires. */
  var tsV = w.svc.engine.getTrueState();
  q('...and the plant publishes a COLD-leg void, which it did not before — the hot leg had one ' +
    'and the cold leg did not',
    typeof tsV.cold_leg_void_fraction === 'number' && isFinite(tsV.cold_leg_void_fraction),
    'cold_leg_void_fraction ' + tsV.cold_leg_void_fraction);

  /* ---- 3. the payload fixes, through the whole stack -------------------------------------- */
  if (!rec) head('ROUND TRIPS  [the #506.1 payload fixes land through service+kernel+shell]');
  /* WHITE-BOX on the pump switch: at 2235 psia a started HHSI pump is DEADHEADED (zero flow
   * against its shutoff head), so every published field (hpi_active, eccs_mode) keys on
   * flow and reads standby either way — the RUNNING state is the thing the STOP fix has to
   * move, and only the engine carries it */
  w.cmd({ action: 'set_hpi', active: true }); w.tick(1);
  var hpiOn = w.svc.engine.eng.ec.hhsiRunning === true;
  w.cmd({ action: 'set_hpi', active: false }); w.tick(1);
  q('HPI START starts the pump and STOP secures it (STOP used to START it)',
    hpiOn && w.svc.engine.eng.ec.hhsiRunning === false,
    'hhsiRunning ' + hpiOn + ' -> ' + w.svc.engine.eng.ec.hhsiRunning);
  w.cmd({ action: 'set_heater', power_pct: 40 }); w.tick(1);
  q('heater MANUAL 40 % lands (used to re-select AUTO)',
    w.snap().control_state.heater_auto === false,
    'heater_auto ' + w.snap().control_state.heater_auto);
  w.cmd({ action: 'set_heater', auto: true }); w.tick(1);
  w.cmd({ action: 'set_letdown_orifices', a: true, b: false }); w.tick(1);
  var csL = w.snap().control_state;
  q('letdown orifice lamps latch the commanded pair (were absent — CLOSED lit forever)',
    csL.letdown_orifice_a === true && csL.letdown_orifice_b === false,
    'a=' + csL.letdown_orifice_a + ' b=' + csL.letdown_orifice_b);
  w.cmd({ action: 'set_steam_dump', mode: 'closed' }); w.tick(1);
  var dumpOff = w.snap().control_state.steam_dump_auto === false;
  w.cmd({ action: 'set_steam_dump', mode: 'auto' }); w.tick(1);
  q('steam dump CLOSED/AUTO round-trips through the dump_mode door (was refused)',
    dumpOff && w.snap().control_state.steam_dump_auto === true,
    'closed ' + dumpOff + ' -> auto ' + w.snap().control_state.steam_dump_auto);
  w.cmd({ action: 'set_charging_pump', running: false }); w.tick(1);
  q('charging OFF lands and the lamp field follows (was refused; field was a constant)',
    w.snap().control_state.charging_pump_running === false,
    'charging_pump_running ' + w.snap().control_state.charging_pump_running);
  w.cmd({ action: 'set_cvcs_auto', active: true }); w.tick(1);

  /* rod speed reaches the engine: S/F selections give measurably different slew */
  w.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: -30, speed: 'slow' });
  w.tick(5);                                     /* 5 s at slow 0.117: ~0.6 steps */
  var slowPos = w.snap().control_state.rod_groups[0].steps;
  w.cmd({ action: 'rod_start', group_id: 'control_rods', direction: -1, speed: 'fast' });
  w.tick(5);                                     /* 5 s at fast 1.053: ~5 steps */
  var fastPos = w.snap().control_state.rod_groups[0].steps;
  w.cmd({ action: 'rod_stop', group_id: 'control_rods' });
  q('rod S/F speeds are DIFFERENT rates through the stack (selection was discarded)',
    (200 - slowPos) <= 2 && (slowPos - fastPos) >= 3,
    'slow moved ' + (200 - slowPos) + ' steps/5s, fast ' + (slowPos - fastPos) + ' steps/5s');

  /* ---- 4. the no-orphan sweep ------------------------------------------------------------- */
  if (!rec) head('NO ORPHANS  [every button: handled+acknowledged, momentary, or disabled — Q4]');
  var doc = JSON.parse(JSON.stringify(globalThis.RD_PWR_BOARD_DOC));
  D.docPatches(doc);
  var items = doc.items.concat(D.extraItems());
  /* deliberately UI-LOCAL presses — no service command is the correct behavior: the trip
   * popover OPENS a panel, S/M/F set the driver's rod-speed selection (it rides out on the
   * next rod command), and the scram tile is a renderer-managed press-to-arm confirm */
  var LOCAL = { imrsk4xz2dm: 1, imrpk8169ds: 1, imrpk8grvcz: 1, imrpk8kjsjs: 1,
                bdOneOverM: 1 /* opens the 1/M plot window */ };
  var buttons = items.filter(function (it) { return it.kind === 'button'; });
  var orphans = [], disabled = 0, momentary = 0, local = 0, unreasoned = [], refused = [];
  var alwaysThrows = [];
  var SH_REFUSED = (globalThis.RD.pwr2.shell && globalThis.RD.pwr2.shell.REFUSED) || {};
  /* CONDITIONAL REFUSALS — a press that refuses HERE, at hot full power, but works in a state the
   * player can reach. Each entry names the condition, because an entry without one is indis-
   * tinguishable from a control that can never work, which is the defect this list exists beside. */
  var CONDITIONAL = {
    ims3wg27iif: 'RHR ALIGN — the sourced 425 psig suction-valve permissive; works on a cooldown',
    ims3xfeye1q: 'RHR ISOLATE — the mirror of the above',
    imro8ktzs3u: 'TURBINE LATCH — refuses while any of the six trip conditions stands (#551)',
    imrmssoa137: 'AFW STOP — refuses inside the sourced actuation reset window / under a standing SI',
    /* #545. The reactor trip breakers are in the supply line to the control rod drive
     * mechanisms, so a LATCHED trip is rod drive power removed — both banks, both directions
     * [sourced, Ginna TS Bases B 3.3.1 ML20339A221]. Reset the RPS and both work again, which
     * is the state the player reaches on every post-trip recovery. Only the SHUTDOWN pair is
     * listed: the control bank's WITHDRAW/INSERT are `hold` buttons and this sweep classes
     * them momentary, so it never presses them. */
    imrpnyaxsb3: 'SHUTDOWN WITHDRAW — refuses while the reactor trip is LATCHED; works once the ' +
                 'RPS is reset (#545)',
    imrpnyf37ju: 'SHUTDOWN INSERT — the mirror of the above; the breakers take power off the ' +
                 'drive in BOTH directions (#545)'
  };
  buttons.forEach(function (it) {
    if (LOCAL[it.id]) { local++; return; }
    if (D.buttonDisabled(it, w.snap())) { disabled++; return; }
    if (D.buttonMomentary(it)) { momentary++; return; }
    var before = w.log.length;
    D.onButton(it, {});
    var burst = w.log.slice(before);
    if (!burst.length) { orphans.push(it.id + ' "' + (it.label || it.name || '') + '"'); return; }
    burst.forEach(function (b) {
      var r = b.result;
      if (r && (r.type === 'error' || r.type === 'blocked') && !r.message) {
        unreasoned.push(it.id + ':' + b.action);
      }
      /* A CONTROL THAT CAN ONLY THROW IS NOT A LIVE CONTROL (#567). This sweep used to accept
       * a press as acknowledged when the result was ok / blocked / ERROR WITH A MESSAGE, on the
       * reasoning that the app surfaces all three since #505 — and a button whose action is in
       * PWR2's REFUSED registry satisfies that third clause with developer jargon. Five did:
       * Grid MANUAL (twice per press), Grid FOLLOW, the SR detector toggle, the condenser CW
       * temp box and the ADV setpoint box. The sweep was doing what it said; what it said was
       * too weak for this class, which is the hollow-check pattern in the GATE rather than the
       * plant. A REFUSED action is fine — the plant is right to refuse it — but the control
       * that sends it must be DARK, and this loop only reaches enabled buttons. */
      if (SH_REFUSED[b.action] !== undefined) refused.push(it.id + ':' + b.action);
      /* ...AND THE REGISTRY IS NOT THE ONLY PLACE A REFUSAL COMES FROM (#570). The check above
       * asks whether the ACTION is in REFUSED; `set_steam_dump` is MAPPED and raises its refusal
       * INSIDE the handler for `mode:'open'`, so the STEAM DUMP OPEN button — live on the board —
       * could only ever throw and neither this sweep nor run_pwr2_kernel band 4 could see it. It
       * was found by a round-trip prototype, not by either gate that exists for the class.
       *
       * So: an enabled button that ERRORS is dead unless its refusal is CONDITIONAL — true now,
       * false in a state the player can reach. That distinction cannot be measured cheaply here
       * (it would mean driving the plant to each permissive), so it is DECLARED, with the
       * condition named. An entry with no condition is a control that can never work. */
      if (r && r.type === 'error') {
        var why = CONDITIONAL[it.id];
        if (!why) alwaysThrows.push(it.id + ':' + b.action);
      }
    });
    w.tick(1);
  });
  q('every enabled button press produces at least one command (' + buttons.length + ' buttons: ' +
    disabled + ' disabled, ' + momentary + ' momentary, ' + local + ' UI-local)',
    orphans.length === 0, orphans.slice(0, 5).join(', ') || 'no silent presses');
  q('every refused/errored press carries a MESSAGE the scanner bar can show',
    unreasoned.length === 0, unreasoned.slice(0, 5).join(', ') || 'all reasoned');
  q('no ENABLED button sends an action in the PWR2 REFUSED registry — a control that can only ' +
    'throw is a dead button wearing an error message (#567)',
    refused.length === 0, refused.slice(0, 6).join(', ') || 'no enabled button can only throw');
  q('...and no ENABLED button THROWS from inside a MAPPED handler either, unless its refusal is ' +
    'declared CONDITIONAL with the condition named (#570)',
    alwaysThrows.length === 0,
    alwaysThrows.slice(0, 6).join(', ') || 'every refusing button is conditional and says so');
  /* #507 waves 1-2 re-enabled the boron panel (a real channel now) and RHR ALIGN/ISOLATE
   * (a real align command) — the deliberate set is now HPI AUTO, FOLLOW, ROD AUTO */
  q('the disables are the deliberate set, not everything and not nothing',
    disabled >= 2 && disabled <= 6, disabled + ' disabled buttons');

  /* ---- 5. the ENGINE-OWNED block surface, merged through the kernel (#507 wave 7) --------
   * PWR2's RPS lives in the engine; the kernel's snapshot must carry its block state WITH
   * the trip's own 35 % setpoint (the power tile's armed band reads it), and the board's
   * set_trip_block must round-trip service -> kernel-forward -> shell -> engine. The
   * unblock-at-power leg is LAST on purpose: clearing a block that is holding a trip off
   * scrams on the spot (the kernel's own documented rule), which ends this world. */
  /* a FRESH world: the button sweep above scrammed this one (its RCP-stop press earns a
   * lo_flow trip), and an already-scrammed plant would satisfy the unblock leg vacuously */
  var w2 = mkWorld();
  var rpsS = w2.snap().rps_state;
  q('the kernel snapshot merges the engine-owned block (standing at power, setpoint 35)',
    rpsS && rpsS.trip_blocks && rpsS.trip_blocks.pr_low_setpoint === true &&
    rpsS.trip_block_status && rpsS.trip_block_status.pr_low_setpoint &&
    rpsS.trip_block_status.pr_low_setpoint.setpoint === 35,
    rpsS ? JSON.stringify(rpsS.trip_block_status && rpsS.trip_block_status.pr_low_setpoint)
         : 'no rps_state');
  var preUB = w2.snap().true_state.scrammed;
  var rUB = w2.cmd({ action: 'set_trip_block', trip_id: 'pr_low_setpoint', blocked: false });
  w2.tick(2);
  q('UNBLOCKING the low-flux trip at 100 % power scrams the plant on the spot (cause ' +
    'hi_flux_lo) — the whole button path is live (service -> kernel forward -> shell -> ' +
    'engine RPS)',
    preUB === false && (!rUB || rUB.type !== 'error') &&
    w2.snap().true_state.scrammed === true &&
    w2.svc.engine.eng.pt.trip_cause === 'hi_flux_lo',
    'pre ' + preUB + ', cause ' + (w2.svc.engine.eng.pt.trip_cause || '?'));

  /* ---- 6. the trip ride (#509 items 1/5/6/10/11) ------------------------------------------ */
  if (!rec) head('TRIP RIDE  [#509: the kernel learns an ENGINE trip; seal-ins refuse OUT LOUD; reset works]');
  var w3 = mkWorld();

  /* item 10: charging OFF zeroes the delivered FLOW — the old check read only the lamp, so
   * a physics path that kept pumping would have passed it */
  w3.cmd({ action: 'set_charging_pump', running: false }); w3.tick(30);
  var chgF = w3.snap().instruments.charging_flow;
  q('charging OFF zeroes the delivered flow (< 0.5 gpm within 30 s, not just the lamp)',
    chgF != null && isFinite(chgF) && chgF * 450000 < 0.5,
    'charging_flow ' + (chgF != null ? (chgF * 450000).toFixed(2) : '?') + ' gpm');
  w3.cmd({ action: 'set_cvcs_auto', active: true }); w3.tick(1);

  /* item 6: the AFW block valve round-trips BOTH ways off the board's own {open} payload
   * and the lamp is live (the mapper read a key nothing sends, its fallback tested the
   * payload OBJECT so every click shut the valve, and the lamp was pinned OPEN) */
  D.onControl({ id: 'imrpp2g2m8k' }, 'toggle', 0); w3.tick(1);
  var blkShut = w3.svc.engine.eng.aw.blocked === true &&
                w3.snap().instruments.afw_block_open === false;
  D.onControl({ id: 'imrpp2g2m8k' }, 'toggle', 1); w3.tick(1);
  q('AFW block valve: close click BLOCKS + the lamp follows, open click UNBLOCKS',
    blkShut && w3.svc.engine.eng.aw.blocked === false &&
    w3.snap().instruments.afw_block_open === true,
    'shut leg ' + blkShut + ' -> reopened ' + (w3.svc.engine.eng.aw.blocked === false));

  /* item 11 FLIPPED at #511: the MSIV and the accumulator are real machinery now, so all
   * four clickable valves read OPERABLE (the *_fixed flags retired exactly as designed) */
  var vMsiv = D.compProps({ id: 'imrpp99kx2y' }, w3.snap());
  var vAcc  = D.compProps({ id: 'imrppxt2aqd' }, w3.snap());
  var vAfw  = D.compProps({ id: 'imrpp2g2m8k' }, w3.snap());
  q('all four clickable valves read OPERABLE on PWR2 (#511 — the disabled statics retired)',
    vMsiv && vMsiv.disabled !== true && vAcc && vAcc.disabled !== true &&
    vAfw && vAfw.disabled !== true,
    'msiv ' + (vMsiv && vMsiv.disabled) + ', accum ' + (vAcc && vAcc.disabled) +
    ', afw ' + (vAfw && vAfw.disabled));

  /* #511: the MSIV round-trips from the diagram and closing it at power trips the turbine
   * (B 3.7.2; the ADV/MSSVs upstream keep the SG relievable — the engine gate measures) */
  D.onControl({ id: 'imrpp99kx2y' }, 'toggle', 0); w3.tick(8);
  var msivShut = w3.snap().control_state.msiv_open === false &&
                 w3.snap().true_state.turbine_tripped === true;
  D.onControl({ id: 'imrpp99kx2y' }, 'toggle', 1); w3.tick(8);
  q('MSIV: close click shuts it through the stack and trips the turbine; open click restores',
    msivShut && w3.snap().control_state.msiv_open === true,
    'shut leg ' + msivShut + ' -> reopened ' + (w3.snap().control_state.msiv_open === true));

  /* #511: the accumulator valve refuses AT POWER with the sourced administrative lock */
  var before511 = w3.log.length;
  D.onControl({ id: 'imrppxt2aqd' }, 'toggle', 0);
  var accBurst = w3.log.slice(before511);
  q('accumulator valve close AT POWER refuses with the >1600 psig power-removed lock (B 3.5.1)',
    accBurst.length === 1 && accBurst[0].result && accBurst[0].result.type === 'error' &&
    /power is removed/i.test(accBurst[0].result.message || ''),
    String(accBurst[0] && accBurst[0].result && accBurst[0].result.message).slice(0, 70));
  q('HPI AUTO reads disabled (PWR2 registers no hpi esf — the press was a silent error, #503)',
    D.buttonDisabled({ id: 'imrle1mc0lk' }, w3.snap()) === true,
    '');

  /* item 1 root: an ENGINE-owned AUTOMATIC trip must reach the kernel's rps latch */
  w3.cmd({ action: 'inject_failure', failure_id: 'large_loca' }); w3.tick(30);
  var e3 = w3.svc.engine.eng;
  var rs3 = w3.snap().rps_state;
  q('an engine-owned automatic trip reaches rps_state (scrammed true, reason = the cause)',
    e3.pt.reactor_trip === true && rs3.scrammed === true && !!rs3.last_trip_reason,
    'scrammed ' + (rs3 && rs3.scrammed) + ', reason ' + JSON.stringify(rs3 && rs3.last_trip_reason));

  /* item 1 (reworked at #512 — the owner's per-system unlatch, on the SOURCED reset
   * permissive): ECCS STOP inside the 45-60 s time-delay window refuses with the time
   * remaining, and the pump keeps running (precondition asserted — the pump IS on the
   * latch and the relay is still running, #510 lesson). The board lamp flags publish. */
  var pre3 = e3.ec.hhsiRunning === true && e3.pt.si === true && e3.pt.si_t < 60;
  var rStop = w3.cmd({ action: 'set_hpi', active: false }); w3.tick(1);
  q('ECCS STOP inside the reset time-delay window refuses with the time remaining',
    pre3 && rStop && rStop.type === 'error' &&
    /not yet satisfied/i.test(rStop.message || '') && e3.ec.hhsiRunning === true,
    'pre ' + pre3 + ' (si_t ' + e3.pt.si_t.toFixed(1) + ' s), msg ' +
    String(rStop && rStop.message).slice(0, 60));
  var csAct = w3.snap().control_state;
  q('the per-system ACTUATED lamps publish (#512: the panel buttons carry the latch color)',
    csAct.si_actuated === true && csAct.afas_actuated === true &&
    D.buttonActuated({ id: 'imrle1mc0lk' }, w3.snap()) === true &&
    D.buttonActuated({ id: 'imrmssr9ihq' }, w3.snap()) === true,
    'si ' + csAct.si_actuated + ', afas ' + csAct.afas_actuated);

  /* item 5: the held SI isolates feedwater (the module's own 32 s hold — MEASURED: it
   * lands ~65 s after the SI latch at this cadence, and pt.fwi never latches on this
   * path), and MFW RESTORE refuses out loud */
  w3.tick(80);
  q('feedwater is isolated by the held SI signal (the restore refusal\'s precondition)',
    e3.fw.isolated === true, 'isolated ' + e3.fw.isolated);
  var rMfw = w3.cmd({ action: 'isolate_feedwater', active: false });
  q('MFW RESTORE while the isolation signal stands REFUSES with the signal named',
    rMfw && rMfw.type === 'error' && /MFW RESTORE BLOCKED/.test(rMfw.message || ''),
    String(rMfw && rMfw.message).slice(0, 70));

  /* RESET UNDER A STANDING SIGNAL — REWRITTEN AT #571, and the original check's concern is
   * KEPT rather than dropped. It read "accepted and the protection RE-LATCHES within 3 s —
   * not refused, not a wedge", and the second half of that is the real requirement: a reset
   * that can never be satisfied is the #509 defect class, a button with no way out. The first
   * half was PINNING THE DEFECT. `control_kernel.rpsResetBlock` refuses against a live trip
   * signal by iterating `config.trips`, which PWR2 hands over EMPTY (§98), so the refusal
   * could never fire — and `Manuals/03` §3.5.1 documented it as one of TWO live permissives
   * with its own board caption. What the operator actually got was an accepted reset that
   * undid itself one 0.1 s protection step later: the SCRAMMED lamp blinking, and nothing
   * saying why.
   *
   * So the claim splits in two, and BOTH have to hold. Note that the pair fails on the old
   * build for the right reason — the refusal check reds because the reset was accepted — so
   * this is a strengthening, not a refit of the test to the change (HR10). */
  var rRe = w3.cmd({ action: 'reset_rps' }); w3.tick(3);
  q('#571: reset under a standing LOCA is REFUSED by name — the caption the board has had ' +
    'wired since #75 finally has a reason behind it',
    !!rRe && rRe.type === 'blocked' && rRe.reason === 'TRIP_SIGNAL_PRESENT' &&
    w3.snap().rps_state.scrammed === true && e3.pt.si === true,
    'resp ' + JSON.stringify(rRe && rRe.reason) + ', scrammed ' + w3.snap().rps_state.scrammed);
  q('...and the board can say so BEFORE the press — rps_state.reset_block carries the reason ' +
    'the SCRAM tile\'s caption maps to "TRIP SIGNAL STANDING"',
    !!(w3.snap().rps_state.reset_block &&
       w3.snap().rps_state.reset_block.reason === 'TRIP_SIGNAL_PRESENT') &&
    w3.snap().rps_state.reset_permitted === false,
    'reset_block ' + JSON.stringify((w3.snap().rps_state.reset_block || {}).reason));
  /* THE ORIGINAL CHECK'S OWN CONCERN, kept and now actually asserted rather than implied: it
   * must not be a WEDGE. The way out is the sourced cooldown action — block the low-pressure
   * reactor trip inside P-11 — and it works because the permissive reads each channel the way
   * the protection system does, gates included. A refusal with no reachable exit would be the
   * dead-button class this whole cluster (#503/#506/#509/#558) exists to kill. */
  w3.cmd({ action: 'set_trip_block', trip_id: 'lo_press', blocked: true }); w3.tick(2);
  var rRe2 = w3.cmd({ action: 'reset_rps' }); w3.tick(3);
  q('...and it is NOT A WEDGE: blocking the low-pressure trip (P-11) releases the permissive ' +
    'and the same press then takes',
    (rRe2 == null || !rRe2.type) && w3.snap().rps_state.scrammed === false,
    'resp ' + JSON.stringify(rRe2) + ', scrammed ' + w3.snap().rps_state.scrammed);

  /* items 1/5 recovery: manual scram -> blocked during the drop -> accepted at the seat */
  var w4 = mkWorld();
  w4.cmd({ action: 'scram' }); w4.tick(1);
  var rDrop = w4.cmd({ action: 'reset_rps' });
  q('reset DURING the rod drop refuses RODS_NOT_INSERTED (the permissive, live via the mirror)',
    rDrop && rDrop.type === 'blocked' && rDrop.reason === 'RODS_NOT_INSERTED',
    JSON.stringify(rDrop));
  w4.tick(15);
  var rOk = w4.cmd({ action: 'reset_rps' }); w4.tick(2);
  q('reset with rods seated is ACCEPTED and rps_state clears (the stale-snapshot lie retired)',
    rOk == null && w4.snap().rps_state.scrammed === false &&
    w4.svc.engine.eng.pt.reactor_trip === false,
    'resp ' + JSON.stringify(rOk) + ', scrammed ' + w4.snap().rps_state.scrammed);

  /* #512: with the reset permissive MET (the 45-60 s relay run down + P-4 standing), the
   * panel's own securing click is the unlatch — ONE click resets the function and secures
   * the pump, SIGNAL PRESENT OR NOT (the sourced circuit; this is what keeps a deliberate
   * TMI-style termination reachable — owner requirement, 2026-08-25). Hand-latched with
   * the reactor re-tripped for P-4; the timer accrues through REAL steps so the
   * timer-severed mutation cannot hide. RPS RESET is trip-only and must NOT clear SI. */
  var e4 = w4.svc.engine.eng;
  w4.cmd({ action: 'scram' }); w4.tick(2);              /* P-4: the trip contact made */
  e4.pt.si = true; e4.pt.si_cause = 'probe';
  var g512 = 0;
  while (e4.pt.si_t < 61 && g512++ < 400) w4.tick(2);   /* run the relay down in sim time */
  /* (RPS RESET's trip-only narrowing is pinned in the standing-LOCA leg above, where
   * e3.pt.si survives the accepted reset.) */
  var preHeld = e4.ec.hhsiRunning === true && e4.pt.reactor_trip === true && e4.pt.si_t >= 60;
  var rOne = w4.cmd({ action: 'set_hpi', active: false });
  var rearmSet = e4.pt.si_rearm_block === true;   /* read before the step — a clear live
                                                   * signal releases the block, correctly */
  w4.tick(2);
  q('relay met: ONE securing click resets SI and stops the pump; auto re-actuation blocks',
    preHeld && rOne && rOne.ok === true && rearmSet &&
    e4.pt.si === false && e4.ec.hhsiRunning === false,
    'held ' + preHeld + ' (si_t ' + e4.pt.si_t.toFixed(0) + ') -> si ' + e4.pt.si +
    ', running ' + e4.ec.hhsiRunning + ', re-arm blocked at reset ' + rearmSet);

  return rec;
}

console.log('\nPWR2 x THE BOARD DRIVER — the #506 seams, pinned headless');
runSuite(null);

/* ---- injection self-test ------------------------------------------------------------------ */
var WSRC = fs.readFileSync(WIRING_PATH, 'utf8').replace(/\r\n/g, '\n');
var SHPATH = path.join(SRC, 'pwr2_shell.js');
var SHSRC = fs.readFileSync(SHPATH, 'utf8').replace(/\r\n/g, '\n');
var KPATH = path.join(__dirname, '..', 'layers', 'control', 'control_kernel.js');
var KSRC = fs.readFileSync(KPATH, 'utf8').replace(/\r\n/g, '\n');
var PTPATH = path.join(SRC, 'pwr2_protection.js');
var PTSRC = fs.readFileSync(PTPATH, 'utf8').replace(/\r\n/g, '\n');
var MUTS = [
  /* RETIRED (#507 wave 7): the tile-presence mutation went blind the day the kernel began
   * MERGING the engine-owned block status — the live pwr2 snapshot always carries
   * pr_low_setpoint now (with its own 35 % setpoint overriding the static row), so deleting
   * the presence skip changes nothing this ride can see. The defect class it guarded — the
   * static table's 25 % painted over the engine's RPS — is carried by verify_board_check's
   * TRIP-35 fixture check, the shell gate's setpoint-dropped mutation, and the merge
   * mutation below. */
  ['the kernel merge is severed (the board reads an RPS with no block surface)', KPATH, KSRC,
   '      if (engTB && engTB.trip_block_status) Object.assign(status, engTB.trip_block_status);',
   ''],
  /* #557: the board goes back to holding the retired plant's AFW full scale as a literal —
   * the exact shipped defect, 213 gpm rendered against 28.8 gpm delivered */
  ['the AFW full scale is a board literal again (7.4x the flow the plant delivers)', WIRING_PATH, WSRC,
   '(CS(s).afw_flow_gpm_full || GPM_AFW)',
   'GPM_AFW'],
  /* #556: the tile's live-arming branch is severed, so it falls back on the retired plant's
   * static table — red edge at 100 for an 87 % scram, red band to 12 % for no scram at all */
  ['the pzr level tile loses its live-arming path (static bands: 100 / 12 / 25)', WIRING_PATH, WSRC,
   "           : (id === 'ims2immon9z' ? pzrLevelBand(s) : null)));",
   '           : null));'],
  /* #500, the ENGINE end: the plant stops publishing its live level program, so the tile has
   * nothing to hang the deviation edge on. Distinct from the branch mutation above and from
   * the setpoint mutation below, for the same reason those two are distinct — this one proves
   * the edge is computed from the PLANT'S program and not from a number the board happens to
   * agree with. Falls to the meter bottom, which is the honest failure. */
  ['the plant stops publishing its live level program (the deviation edge has no anchor)',
   SHPATH, SHSRC,
   /* ⚠ the field is killed OUTRIGHT, not gated. A first attempt falsified the ternary's
    * condition — and went BLIND, because the else-branch is the working `PZ.levelProgram`
    * fallback, so "breaking" it just selected the equivalent path. A mutation has to remove
    * the CAPABILITY, not pick between two spellings of it. */
   '      pzr_level_program_pct: (e._pzr && e._pzr.level_program_pct !== undefined)\n                             ? e._pzr.level_program_pct : 100 * PZ.levelProgram(ts.tavg_c),',
   '      pzr_level_program_pct: undefined,'],
  /* #576c: the plant stops publishing its pressure control band, so the primary-pressure tile
   * falls back on the RETIRED engine's -30/+50 psi against PWR2's sourced -25/+25 — the exact
   * shipped defect, and invisible to a source read because the fallback IS the old code. */
  ['the plant stops publishing its pressure control band (the tile reverts to -30/+50 psi)',
   SHPATH, SHSRC,
   '      pressure_band_psi: [PZ.CONTROL.backup_on_psi, PZ.CONTROL.spray_start_psi],',
   '      pressure_band_psi: undefined,'],
  /* #516 item 11: the plant stops publishing its charging ceiling, so the setpoint box falls
   * back on the RETIRED engine's 60 gpm against PWR2's 30.14 — the exact shipped defect, and
   * invisible to a source read for the same reason #576c was: the fallback IS the old code. */
  ['the plant stops publishing its charging ceiling (the box reverts to 60 gpm)',
   SHPATH, SHSRC,
   '      charging_max_gpm: RD.cvcs.CVCS.charging_max_gpm(),',
   '      charging_max_gpm: undefined,'],
  /* #516 item 1: the SG feed setpoint box goes back to reading the DELIVERED feed fraction —
   * the shipped defect exactly. Not a severed publication but a swapped READ, because that is
   * the shape the defect had: `feed_demand_pct` can be published perfectly and the box still
   * ignore it. Falls to the old channel, which is the working fallback, so a source read sees
   * nothing wrong — the arrows just stop walking. */
  ['the SG feed box reads DELIVERED flow again (the arrows stop walking)', WIRING_PATH, WSRC,
   "var d = c.feed_demand_pct; return ((d != null && isFinite(d)) ? d : (c.feed_pump_speed_pct || 0)) * GPM_FEED_PER_PCT;",
   'return (c.feed_pump_speed_pct || 0) * GPM_FEED_PER_PCT;'],
  /* #516 item 6: the vessel goes back to reading the RCS-wide mass fraction, so its water level
   * is a mass number and stops tracking uncovery — the shipped defect. */
  ['the vessel reads the RCS mass fraction again (its level stops tracking uncovery)',
   WIRING_PATH, WSRC,
   '          if (unc == null) return t.core_inventory_pct != null ? t.core_inventory_pct : 100;',
   '          return t.core_inventory_pct != null ? t.core_inventory_pct : 100;'],
  /* #516 item 7: the primary runs go back to declaring liquid water unconditionally, so a
   * voided loop draws as coolant — the shipped defect. Not a severed publication but a swapped
   * READ, the #516-item-1 shape: the void can be published perfectly and the pipe ignore it. */
  ['the primary pipes declare WATER again (a voided loop draws as coolant)', WIRING_PATH, WSRC,
   "  function legContents(v) { return (v != null && isFinite(v) && v > 0.5) ? 'steam' : 'water'; }",
   "  function legContents(v) { return 'water'; }"],
  /* #561: the plant stops handing its own delta-T equation to the reused instrument layer, so
   * the gauge falls back on the retired plant's fitted DNB surface — the shipped defect */
  ['the plant stops publishing its delta-T setpoint form (the gauge reverts to the DNB surface)',
   SHPATH, SHSRC,
   '    ex.otdt_form = {',
   '    ex.otdt_form = ex.otdt_form || null; if (0) ex.otdt_form = {'],
  /* #556, the engine end: the plant stops publishing its indication setpoints. Distinct from
   * the branch mutation above — it proves the board is reading the PLANT and not a constant it
   * happens to agree with, which is the failure a single mutation here would miss. */
  ['the plant stops publishing its indication setpoints (the board has nothing to arm on)',
   SHPATH, SHSRC,
   "      if (f.id !== 'hi_pzr_level') return;",
   '      return;'],
  /* RE-ANCHORED at #512 (the guard moved into eccsStop/afwUnlatch): the payload misread
   * hits every stop's `on` line at once — same defect class, same red (the round trip) */
  ['the stop payload is misread again (STOP starts the pump)', SHPATH, SHSRC,
   "    var on = (c.active !== undefined ? c.active : c.running) !== false;",
   "    var on = c.running !== false;"],
  /* #509 item 1/5 root: the kernel never learns an ENGINE-owned automatic trip */
  ['the scram mirror is severed (an automatic trip never reaches rps_state)', KPATH, KSRC,
   '      var engScram = this.lastInstruments.rps_scrammed === true;',
   '      var engScram = false;'],
  /* #509 item 1: the reset is judged against the PREVIOUS step\'s snapshot */
  ['the reset snapshot patch is severed (a good reset reports "rods not inserted")', SHPATH, SHSRC,
   "      if (a === 'reset_rps' && this._ts) this._ts.scrammed = this.eng.pt.reactor_trip === true;",
   ''],
  /* #509 item 6: the mapper reads a key nothing sends; its fallback is always-truthy */
  ['set_afw_block reads c.blocked again (every click shuts the valve)', SHPATH, SHSRC,
   "      EN.command(e, 'afw_block', (c && c.open !== undefined ? c.open : c) === false);",
   "      EN.command(e, 'afw_block', (c && c.blocked !== undefined ? c.blocked : c) !== false);"],
  /* #512: the reset time-delay relay deleted — ECCS securable at t=0 of a valid SI (the
   * un-resisted defeat); the in-window refusal check must red */
  ['the reset time-delay relay is deleted (delay 0 — securable at actuation)', PTPATH, PTSRC,
   '    delay_s: 60,',
   '    delay_s: 0,'],
  /* NO timer-accrual mutation, and the absence is deliberate: this harness re-evals a
   * module into RD, but pwr2_engine CAPTURES the protection module at ITS load (PT = ...),
   * so a stepProtection mutation never reaches the running plant — measured BLIND here.
   * The timer wire is defended by the relay-met check itself, whose fixture only turns
   * green after REAL si_t accrual (a zeroed timer reds the CLEAN run). The delay-0
   * mutation above works because the SHELL reads RESET.delay_s through a live lookup. */
  /* #512: the one-click unlatch severed — the securing click stops but never resets, so
   * the level-held latch restarts the pump one tick later */
  ['the securing click stops resetting (stop accepted, pump re-asserted next tick)', SHPATH, SHSRC,
   "      EN.command(e, 'reset_si', true);   /* permissive met: reset + secure, one click */",
   '']
,
  /* #591 item 1, the BOARD end: the box goes back to the retired config's 35-85 degF band.
   * Deliberately NOT a severed publication — the box stays live and the sink still moves, so
   * every other check here is happy; what is lost is the ten degrees containing the C-9
   * removal point, which is exactly how a fix to the refusal alone would have shipped. */
  ['the CW box takes the retired 35-85 degF band (the turbine trip falls outside it)',
   WIRING_PATH, WSRC,
   "    var r = CS(s || {}).cw_inlet_range_c;",
   '    var r = null; if (0) r = CS(s || {}).cw_inlet_range_c;'],
  /* #591 item 1, the DARKENING end: the board reverts to the #567 capability flag, which the
   * shell no longer publishes — so `=== true` is false and the box would stay live. It must
   * therefore be mutated to the shape that DOES darken it, or the mutation proves nothing. */
  ['the CW box is darkened again (the control the owner found inert)', WIRING_PATH, WSRC,
   "      if (item.id === 'ims3v42jghn') return CS(s).cw_inlet_temp_c === undefined;",
   "      if (item.id === 'ims3v42jghn') return true;"],
  /* #564 item 1: the spray box reads DELIVERED flow again. A swapped READ, not a severed
   * publication — the same shape as the SG feed mutation above, and the reason the defect was
   * invisible to a source scan: the fallback IS the old code. */
  ['the PZR spray box reads DELIVERED flow again (the demand is erased from the player)',
   WIRING_PATH, WSRC,
   "    var d = CS(s).spray_demand_pct;\n    return (d != null && isFinite(d)) ? d : CS(s).spray_valve_pct;",
   '    return CS(s).spray_valve_pct;'],
  /* #564 item 2: presence stops gating the rows, so the three the plant does not publish go
   * live again — the shipped defect, three BLOCK buttons that could only throw. */
  ['the trip rows stop asking whether the plant carries them (three inert BLOCKs return)',
   WIRING_PATH, WSRC,
   "    return Object.prototype.hasOwnProperty.call(st, id);",
   '    return true;'],
  /* #578: the delta-T tile goes back to DERIVING the stop from the margin, so both flux rod
   * stops and the runback are invisible again — the shipped state. */
  ['the delta-T tile derives the rod stop from the margin again (the flux stops go dark)',
   WIRING_PATH, WSRC,
   "    var held = t.rod_stop === true || t.runback_active === true;",
   '    var held = false;']
];
/* Counted, not written down: the number went stale the first time a mutation was added. */
console.log('\ninjection self-test (' + MUTS.length + ' mutations):');
var blind = 0;
MUTS.forEach(function (m) {
  var mutated = m[2].replace(m[3], m[4]);
  if (mutated === m[2]) { console.log('  ANCHOR MISS ' + m[0]); blind++; return; }
  (0, eval)(mutated);                             /* re-evals the module, reassigning its RD entry */
  var rec = runSuite([]);
  var reds = rec.filter(function (r) { return !r.ok; }).length;
  if (reds === 0) { console.log('  BLIND TO  ' + m[0]); blind++; }
  else console.log('  caught    ' + m[0].padEnd(70) + reds + ' checks red');
  /* restore the real module before the next mutation */
  (0, eval)(m[2]);
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTS.length - blind) + '/' + MUTS.length + ' mutations caught' +
  (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_board: ' + nPass + ' passed, ' + nFail + ' failed  (' + (nPass + nFail) + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit(nFail > 0 || blind > 0 ? 1 : 0);
