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
 *
 * Injection self-test: the tile condition and one payload mapper are reverted from source
 * and the matching checks must go red — a check born beside its fix is not green until it
 * has been made to fail (house rule).
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
  RD.PwrBoardDriver.onMount(global.document, { cmd: cmd, units: function (u) { return u; } }, {});
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
  return rec;
}

console.log('\nPWR2 x THE BOARD DRIVER — the #506 seams, pinned headless');
runSuite(null);

/* ---- injection self-test ------------------------------------------------------------------ */
console.log('\ninjection self-test (2 mutations):');
var WSRC = fs.readFileSync(WIRING_PATH, 'utf8').replace(/\r\n/g, '\n');
var SHPATH = path.join(SRC, 'pwr2_shell.js');
var SHSRC = fs.readFileSync(SHPATH, 'utf8').replace(/\r\n/g, '\n');
var KPATH = path.join(__dirname, '..', 'layers', 'control', 'control_kernel.js');
var KSRC = fs.readFileSync(KPATH, 'utf8').replace(/\r\n/g, '\n');
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
  ['set_hpi reads only c.running again (STOP starts the pump)', SHPATH, SHSRC,
   "    set_hpi:           function (e, c) { EN.command(e, 'hhsi', (c.active !== undefined ? c.active : c.running) !== false); },",
   "    set_hpi:           function (e, c) { EN.command(e, 'hhsi', c.running !== false); },"]
];
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
