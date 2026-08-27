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
  w.cmd({ action: 'set_afw', active: true });
  w.tick(30);
  var sAfw = w.snap();
  var GPM_PER_KGS = 264.172 * 60 / 1000;         /* rho 1000 — pwr2_afw's own convention */
  var eAfw = w.svc.engine.eng;
  var trueKgs = (eAfw.aw.mdafwRunning ? RD.pwr2.afw.mdafwRatedKgs() : 0) +
                (eAfw.aw.tdafwRunning ? RD.pwr2.afw.tdafwRatedKgs() : 0);
  var trueGpm = trueKgs * GPM_PER_KGS;
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
   * table's 25 % low alarm while PWR2's own annunciator fires at #500's sourced 17 %. */
  q('the low ALARM edge is the running plant\'s 17 %, not the retired table\'s 25 %',
    pz && pz.alarmLo === 17, pz && ('alarmLo ' + pz.alarmLo));

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
  var orphans = [], disabled = 0, momentary = 0, local = 0, unreasoned = [];
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
    });
    w.tick(1);
  });
  q('every enabled button press produces at least one command (' + buttons.length + ' buttons: ' +
    disabled + ' disabled, ' + momentary + ' momentary, ' + local + ' UI-local)',
    orphans.length === 0, orphans.slice(0, 5).join(', ') || 'no silent presses');
  q('every refused/errored press carries a MESSAGE the scanner bar can show',
    unreasoned.length === 0, unreasoned.slice(0, 5).join(', ') || 'all reasoned');
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

  /* reset under a STANDING signal is accepted and re-latches — not refused, not a wedge */
  var rRe = w3.cmd({ action: 'reset_rps' }); w3.tick(3);
  q('reset under a standing LOCA is accepted and the protection RE-LATCHES within 3 s',
    (rRe == null || !rRe.type) && w3.snap().rps_state.scrammed === true && e3.pt.si === true,
    'resp ' + JSON.stringify(rRe) + ', scrammed ' + w3.snap().rps_state.scrammed);

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
