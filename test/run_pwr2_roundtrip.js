/*
 * run_pwr2_roundtrip.js — DOES A COMMAND MOVE ANYTHING THE PLAYER CAN READ BACK? (#570)
 *
 * THE CLASS THIS EXISTS FOR. #562 shipped a plant whose data contract, Indications tab and
 * operator manual all described an auxiliary-feedwater THROTTLE and a LEVEL HOLD — while the
 * engine had neither. Nothing caught it for as long as PWR2 was the plant the site runs, and the
 * reason is worth stating precisely: **both FIELDS existed**. `afw_throttle_pct` was published and
 * hard-coded `running ? 100 : 0`. A constant dressed as a variable reads exactly like a working
 * one, to a source scan and to every gate we had. #538 is the same shape with a scale error (the
 * heater's set and get were 4.34x apart); #567's five controls are the same shape at the board.
 *
 * So this runner asks the one question those gates could not: **press it, and does the plant's own
 * published control_state answer differently than if you had not?**
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL LEG IS THE WHOLE TEST, and the first two drafts of this file are why it says so.
 *
 *   DRAFT 1 snapshotted control_state on ONE engine, before and after, and asked "did anything
 *   move". **28 of 28 actions passed and 0 failed** — because the plant is RUNNING. Charging flow,
 *   feed pump speed, governor position and the pump list all move every step whatever you press.
 *   The check could not have failed, which is the hollow-check pattern this repo keeps cataloguing,
 *   written fresh into a gate whose entire purpose was to catch it.
 *
 *   DRAFT 2 added the control leg and discriminated (17 live / 11 not) — but 11 of the 11 were the
 *   FIXTURE, not the plant: idempotent verbs sent twice ({} -> {}), and manual levers that an
 *   automation channel owns and immediately overwrites. Both are the MANUAL-FIRST directive
 *   (2026-08-12) arriving as a test-design constraint: to test a manual lever you must take the
 *   automation off it, and to test a valve you must open it and then SHUT it.
 *
 * What survived draft 3 was one real defect (`set_steam_dump` swallowing `{mode:'manual'}` and
 * `{pct}` — accepted, inert, and documented in Manuals/03 §18 as a supported payload) plus one
 * finding this runner cannot make itself: the STEAM DUMP OPEN button raises its refusal INSIDE a
 * MAPPED handler, so no REFUSED-registry check could see a live board control that can only throw.
 * That half lives in `run_pwr2_board`'s no-orphan sweep, which now covers it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT AN EXEMPTION MEANS. `INERT` below is not a skip list — every entry names WHY the command
 * legitimately moves nothing, and an entry whose reason stops being true reds this runner by
 * PASSING (the strict-xfail convention). A command with no entry that moves nothing is the #562
 * defect and fails.
 *
 * Run: node test/run_pwr2_roundtrip.js
 */
'use strict';
var path = require('path');
var SRC = path.join(__dirname, '..', 'engines', 'pwr2');
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

var fs = require('fs');
var SHELL_PATH = path.join(SRC, 'pwr2_shell.js');
var SHELL_SRC = fs.readFileSync(SHELL_PATH, 'utf8').split(String.fromCharCode(13,10)).join(String.fromCharCode(10));
/* Re-execute the shell from (possibly mutated) source, the run_pwr2_shell idiom: the file
 * registers itself on RD.pwr2.shell, so eval REPLACES the module for the next suite run. */
function loadShell(src) { (0, eval)(src === undefined ? SHELL_SRC : src); return globalThis.RD.pwr2.shell; }
var SH = globalThis.RD.pwr2.shell;
var DT = 0.02;
var RED = '[31m', GREEN = '[32m', BOLD = '[1m', RST = '[0m';
var nPass = 0, nFail = 0, REC = null, QUIET = false;
function ck(name, cond, note) {
  var ok = !!cond;
  if (REC) { REC.push({ name: name, ok: ok }); return ok; }
  if (ok) nPass++; else nFail++;
  if (!QUIET) console.log((ok ? '  ' + GREEN + 'PASS' + RST + '  ' : '  ' + RED + 'FAIL' + RST + '  ') +
                          name + (note ? '  -- ' + note : ''));
  return ok;
}
function head(s) { if (!REC && !QUIET) console.log('\n' + BOLD + s + RST); }

function boot() { return new SH.PWR2Engine({}); }   /* SH is rebound per suite run */
function ride(e, secs) { for (var i = 0, n = Math.round(secs / DT); i < n; i++) e.step(DT); }
function cmd(e, o) { try { return e.applyCommand(o); } catch (x) { return { threw: String(x.message || x) }; } }
function csSnap(e) { return JSON.stringify(e.getControlState()); }
function diffKeys(a, b) {
  var A = JSON.parse(a), B = JSON.parse(b), out = [];
  Object.keys(B).forEach(function (k) {
    if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) out.push(k);
  });
  return out;
}

/* MANUAL FIRST (the 2026-08-12 directive, as a fixture requirement): a lever an automation
 * channel owns is overwritten within a step, so the probe would be measuring the controller. */
var MANUAL = [{ action: 'set_cvcs_auto', active: false },
              { action: 'set_heater', power_pct: 50 },
              { action: 'set_spray', pct: 20 }];

/* [name, first payload, second payload]. BOTH legs get the first; only the test leg gets the
 * second, so the difference between the two engines is that one command and nothing else.
 * Idempotent verbs are paired open->shut rather than sent twice. */
var PROBES = [
  ['set_load_target',         { mwe: 80 },            { mwe: 40 }],
  ['set_afw_flow',            { pct: 100 },           { pct: 30 }],
  ['set_heater',              { power_pct: 60 },      { power_pct: 20 }],
  ['set_spray',               { pct: 40 },            { pct: 10 }],
  ['set_pressure_setpoint',   { mpa: 15.4 },          { mpa: 15.1 }],
  ['set_feed_pump_speed',     { pct: 90 },            { pct: 55 }],
  ['set_steam_dump_setpoint', { mpa: 6.9 },           { mpa: 6.4 }],
  ['set_rhr_hx',              { pct: 80 },            { pct: 30 }],
  ['set_boron_adjust',        { rate: 2 },            { rate: 8 }],
  ['set_adv',                 { pct: 50 },            { pct: 10 }],
  ['set_charging_pump',       { running: false },     { running: true }],
  ['set_cvcs_auto',           { active: false },      { active: true }],
  ['set_afw',                 { active: true },       { active: false }],
  ['set_rcp',                 { running: false },     { running: true }],
  ['set_letdown_orifices',    { a: true, b: true },   { a: false, b: false }],
  ['set_feed_coupled',        { active: false },      { active: true }],
  ['msiv',        { action: 'close_msiv' },           { action: 'open_msiv' }],
  ['block_valve', { action: 'close_block_valve' },    { action: 'open_block_valve' }],
  ['porv',        { action: 'open_porv_manual' },     { action: 'close_porv' }]
];

/* A command that legitimately moves nothing on THIS fixture, with the reason. Strict: an entry
 * that starts moving something reds the runner until it is promoted out. */
var INERT = {};

function cmdOf(name, v) { return v.action ? v : Object.assign({ action: name }, v); }

function runSuite() {
head('CONTROL LEG  [two engines, same IC, stepped identically — one gets the command]');

/* The control leg is only a control if two untouched engines agree exactly. If this fails,
 * every result below is noise and the runner says so rather than reporting differences. */
var dA = boot(), dB = boot();
ride(dA, 90); ride(dB, 90);
var deterministic = csSnap(dA) === csSnap(dB);
ck('two untouched engines are BIT-IDENTICAL after 90 s — without this the control leg is noise',
   deterministic, deterministic ? 'control_state matches exactly' : 'THE PLANT IS NOT DETERMINISTIC');

if (deterministic) {
  head('THE SWEEP  [a command whose readback never differs is dead, or reporting a constant]');
  PROBES.forEach(function (p) {
    var name = p[0], first = cmdOf(name, p[1]), second = cmdOf(name, p[2]);
    var test = boot(), ctrl = boot();
    [test, ctrl].forEach(function (e) {
      ride(e, 60);
      MANUAL.forEach(function (c) { cmd(e, c); });
      ride(e, 10);
      cmd(e, first);
      ride(e, 10);
    });
    var r = cmd(test, second);
    if (r.threw) {
      ck(name + ': the second command REFUSED, so the round trip is untestable here',
         false, r.threw.slice(0, 90));
      return;
    }
    ride(test, 10); ride(ctrl, 10);
    var moved = diffKeys(csSnap(ctrl), csSnap(test));
    var why = INERT[name];
    if (why) {
      ck(name + ': declared INERT — ' + why, moved.length === 0,
         moved.length ? 'IT MOVED NOW (' + moved.slice(0, 3).join(', ') + ') — promote the entry'
                      : 'still inert, as declared');
    } else {
      ck(name + ': the readback answers the command',
         moved.length > 0,
         moved.length ? moved.slice(0, 3).join(', ')
                      : 'NOTHING in control_state differs from the untouched plant — this is the ' +
                        '#562 shape (a published field that is really a constant)');
    }
  });
}
}

console.log('\n' + BOLD + 'PWR2 — THE ROUND TRIP: does a command move anything the player can read back?' + RST);
SH = loadShell();
runSuite();

/* ---- INJECTION SELF-TEST -------------------------------------------------------------------
 * A check written beside its own subject is not green until it has been made to fail. The
 * mutation IS the #562 defect, restored verbatim: publish the throttle readback as the RUN LAMP
 * (`running ? 100 : 0`) instead of the valve. That is what shipped, what three documents
 * described as a working throttle, and what no gate could see — so if this runner cannot go red
 * on it, it is decoration. */
var MUTATIONS = [
  ['the AFW throttle readback is the RUN LAMP again (#562, verbatim)',
   'afw_throttle_pct: 100 * (e.aw.throttle === undefined ? 1 : e.aw.throttle),',
   'afw_throttle_pct: (e.aw.mdafwRunning || e.aw.tdafwRunning) ? 100 : 0,'],
  ['the pressurizer setpoint readback is frozen at its boot value',
   'pressure_setpoint: e.pz.setpoint_mpa,',
   'pressure_setpoint: 15.41,']
];
console.log('\n' + BOLD + 'injection self-test (' + MUTATIONS.length + ' mutations)' + RST);
var blind = 0;
MUTATIONS.forEach(function (m) {
  if (SHELL_SRC.indexOf(m[1]) === -1) { console.log('  ERROR   anchor not found: ' + m[0]); blind++; return; }
  REC = []; QUIET = true;
  try { SH = loadShell(SHELL_SRC.split(m[1]).join(m[2])); runSuite(); }
  catch (e) { REC.push({ name: 'threw', ok: false }); }
  var reds = REC.filter(function (r) { return !r.ok; }).length;
  REC = null; QUIET = false;
  if (reds === 0) { blind++; console.log('  ' + RED + 'BLIND TO' + RST + '  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); }
  else console.log('  caught    ' + m[0] + '   ' + reds + ' red');
});
SH = loadShell();                        /* leave the real module installed */
if (blind) nFail++;

console.log('\n' + '='.repeat(74));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
            ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS — GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_roundtrip: ' + nPass + ' passed, ' + nFail + ' failed  (' +
            (nPass + nFail) + ' checks)');
console.log('='.repeat(74) + '\n');
process.exit(nFail > 0 ? 1 : 0);
