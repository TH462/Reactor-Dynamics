/* tools/glance_rung.js — WHAT RUNG IS THIS WALKTHROUGH STEP SAFE TO BE PLAYED AT? (#796)
 *
 * Since the walkthrough drives the speed control itself (ui/app.js `syncCklAutoSpeed`), a step
 * whose safe rate is not the one the 30 s rule derives from its `hold` has to say so, with
 * `wait_speed`. THIS IS HOW THAT NUMBER IS DERIVED, so the next one is a measurement rather than
 * a feel — picking a rung by eye is the HR12 failure, and #653 S-9 is the record of what it costs
 * (a hint offering 60x sent a layman's reactor 0 -> 12 % between two glances).
 *
 * THE YARDSTICK IS #753's, REUSED ON PURPOSE: the WORST change in REACTOR POWER inside one 2.5 s
 * GLANCE — 2.5 seconds of the player's wall clock, i.e. 2.5 x N plant-seconds at rung N. It is
 * the number that settled step 9 at 10x (1x 0.020 %, 5x 0.094 %, 10x 0.186 %, 60x 1.083 %), so a
 * new step is judged on the same scale instead of a fresh one nobody can compare against.
 *
 * ONE 1x TRACE ANSWERS EVERY PLAY RUNG EXACTLY, and that is not an approximation: PLAY
 * (1/5/10/60x) runs the identical 0.02 s physics step and only changes how much plant time passes
 * per wall second (`_applyTier`, #625). The rung therefore only sets the WIDTH of the sliding
 * window over this one trace. WARP (600/3600x) is a coarser physics step and is not a candidate
 * for a step anyone has to act on.
 *
 * READ THE `true` COLUMN, NOT `indicated`, ON A SETTLED STEP. The indicated channel carries this
 * plant's own noise (power range, sigma 0.3 %), which on a flat step swamps the signal: measured
 * on pwr_startup step 12, indicated says 0.150 % at 1x and 0.185 % at 60x — near-identical,
 * because all of it is noise — while true says 0.002 % and 0.038 %. Grading a rung on the
 * indicated column there would be grading the instrument.
 *
 * AND MIND WHICH WINDOW AUTO ACTUALLY ACCELERATES: `cklStepSpeed` drops the clock to 1x the
 * instant the step's acceptance is met, so everything after that is real time however long the
 * authored `hold` runs on. Measured on step 13, the acceptance lands 42 plant-seconds into a
 * 400 s dwell — grading the rung over the whole dwell would judge the walkthrough on plant it
 * never accelerates. The second table per step is the window that counts.
 *
 * AN ACTION STEP NEEDS THE THIRD TABLE. Where a step tells the player to HOLD a control, the
 * binding number is not a power delta at all — it is how long ONE ROD STEP takes on their wall
 * clock: 7.49 s at 1x, 1.50 s at 5x, 0.75 s at 10x, 0.12 s at 60x on step 13's SLOW pull. A
 * reaction window is what decides those.
 *
 * Route: the SHIPPED replay (`RD.ProceduresHarness`, the machinery `run_checklist_pwr2` gates)
 * drives the leg up to the first step asked for, so the plant arrives the way the leg really gets
 * there; then this file takes the clock down to 0.1 s samples and records.
 *
 * ⚠ IT MEASURES THE REPLAY'S ROUTE. A step can be satisfied ON ARRIVAL here and still be a
 * genuine wait for a player — step 12 is exactly that (the replay's step 11 dwell settles the
 * rate, so both acceptance entries hold at t=0). Read "0.0 plant-min in" as "the replay does not
 * wait here", never as "there is no wait".
 *
 * Run: node tools/glance_rung.js <procedure_id> <first step> [last step]
 *      node tools/glance_rung.js pwr_startup 12 13
 */
'use strict';
var path = require('path');
var ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'engines', 'load_mode.js'));
require(path.join(ROOT, 'engines', 'pwr', 'pwr_config.js'));
require(path.join(ROOT, 'layers', 'control', 'control_kernel.js'));
require(path.join(ROOT, 'layers', 'control', 'pwr_control.js'));
require(path.join(ROOT, 'engines', 'pwr', 'pwr_instruments.js'));
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_kinetics',
 'pwr2_fuel', 'pwr2_reactor', 'pwr2_sources', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief',
 'pwr2_condenser', 'pwr2_cvcs', 'pwr2_eccs', 'pwr2_afw', 'pwr2_damage', 'pwr2_protection',
 'pwr2_pressurizer', 'pwr2_dumpctl', 'pwr2_break', 'pwr2_containment', 'pwr2_rhr',
 'pwr2_true_state', 'pwr2_instruments', 'pwr2_feedwater', 'pwr2_engine', 'pwr2_shell'
].forEach(function (f) { require(path.join(ROOT, 'engines', 'pwr2', f + '.js')); });
require(path.join(ROOT, 'layers', 'simulation_service.js'));
require(path.join(ROOT, 'layers', 'instructor_layer.js'));
require(path.join(ROOT, 'ui', 'manual_procedures.js'));
require(path.join(ROOT, 'test', 'procedures_harness.js'));

var RD = globalThis.RD;
var ARG = process.argv.slice(2);
var PROC_ID = ARG[0] || 'pwr_startup';
var FIRST = +(ARG[1] || 1), LAST = +(ARG[2] || FIRST);
var PROC = (RD.MANUAL_PROCEDURES.pwr2 || []).filter(function (p) { return p.id === PROC_ID; })[0];
if (!PROC) {
  console.log('usage: node tools/glance_rung.js <procedure_id> <first step> [last step]');
  console.log('pwr2 procedures: ' + (RD.MANUAL_PROCEDURES.pwr2 || []).map(function (p) { return p.id; }).join(', '));
  process.exit(1);
}
if (!(FIRST >= 1 && LAST >= FIRST && LAST <= PROC.steps.length)) {
  console.log(PROC_ID + ' has ' + PROC.steps.length + ' steps; asked for ' + FIRST + '..' + LAST);
  process.exit(1);
}

var RUNGS = [1, 5, 10, 60];
var DT_SAMPLE = 0.1;                 // accel 1 x broadcastMs 100 ms = 0.1 s of plant per tick

function svcFresh() {
  var svc = new RD.SimulationService({ seed: 42 });
  svc.selectPlant('pwr2', PROC.from, null);
  svc.running = true;
  svc.timeAcceleration = 10;         // the replay's own rate (procedures_harness ACCEL)
  svc.attentionStops = false;        // headless: the dropout is a comfort feature for a human
  svc.speedHolds = false;
  return svc;
}

// Replay steps 1..n through the SHIPPED harness, on this service, and leave the plant there.
function replayTo(svc, nSteps) {
  if (nSteps < 1) return { checks: 0, failed: 0, names: [] };
  var trunc = {};
  Object.keys(PROC).forEach(function (k) { trunc[k] = PROC[k]; });
  trunc.steps = PROC.steps.slice(0, nSteps);
  trunc.guard = null;                // a truncated leg is not the whole leg; its end-guard does not apply
  var res = RD.ProceduresHarness.runProcedure('pwr2', trunc, { svc: svc });
  var all = (res && res.checks) || [];
  var bad = all.filter(function (c) { return c && c.pass === false; });
  return { checks: all.length, failed: bad.length,
           names: bad.slice(0, 6).map(function (c) { return c.d; }) };
}

// Sample REACTOR POWER every DT_SAMPLE plant-seconds for `secs`, issuing `cmd` first if given.
function trace(svc, secs, cmd) {
  svc.timeAcceleration = 1;
  if (cmd) { try { svc.handleCommand(cmd); } catch (e) { console.log('  cmd refused: ' + e.message); } }
  var out = [];
  var n = Math.round(secs / DT_SAMPLE);
  for (var i = 0; i < n; i++) {
    var s = svc.tick();
    out.push({ t: s.metadata.sim_time,
               ind: s.instruments.power_range,          // the channel the REACTOR POWER tile draws
               tru: s.true_state.power_pct,
               sur: s.instruments.startup_rate,
               rods: s.true_state.rod_steps });
  }
  return out;
}

// Worst change inside a window of `win` plant-seconds, anywhere in the trace.
function worstInWindow(rows, key, win) {
  var k = Math.max(1, Math.round(win / DT_SAMPLE));
  var worst = 0, at = null;
  for (var i = 0; i + k < rows.length; i++) {
    var d = Math.abs(rows[i + k][key] - rows[i][key]);
    if (d > worst) { worst = d; at = rows[i].t; }
  }
  return { worst: worst, at: at };
}

/* THE WINDOW AUTO ACTUALLY FAST-FORWARDS is not the whole step: `cklStepSpeed` drops the clock to
 * 1x the instant the step's acceptance is met, so everything after that is real time however long
 * the authored dwell runs on. Grading the rung over the full dwell would judge the walkthrough on
 * plant it never accelerates. */
function untilMet(rows, acc) {
  if (!acc || acc.p !== 'power_pct') return { rows: rows, note: 'whole step (no power acceptance)' };
  for (var i = 0; i < rows.length; i++) {
    var ok = acc.op === '>' ? rows[i].ind > acc.v : acc.op === '<' ? rows[i].ind < acc.v : false;
    if (ok) return { rows: rows.slice(0, i + 1),
                     note: 'up to acceptance (' + acc.p + ' ' + acc.op + ' ' + acc.v + ') at t=' +
                           rows[i].t.toFixed(1) + ' s, ' + ((rows[i].t - rows[0].t) / 60).toFixed(1) +
                           ' plant-min in' };
  }
  return { rows: rows, note: 'acceptance never met inside the dwell' };
}

function report(label, rows) {
  var first = rows[0], last = rows[rows.length - 1];
  console.log('\n' + label);
  console.log('  span ' + first.t.toFixed(1) + ' -> ' + last.t.toFixed(1) + ' s (' +
              ((last.t - first.t) / 60).toFixed(1) + ' plant-min), ' + rows.length + ' samples');
  console.log('  REACTOR POWER (indicated) ' + first.ind.toFixed(3) + ' % -> ' + last.ind.toFixed(3) + ' %' +
              '   STARTUP RATE ' + first.sur.toFixed(3) + ' -> ' + last.sur.toFixed(3) +
              '   rods ' + first.rods.toFixed(1) + ' -> ' + last.rods.toFixed(1));
  var lo = rows[0].ind, hi = rows[0].ind;
  rows.forEach(function (r) { if (r.ind < lo) lo = r.ind; if (r.ind > hi) hi = r.ind; });
  console.log('  range over the step: ' + lo.toFixed(3) + ' % to ' + hi.toFixed(3) + ' %');
  /* BOTH CHANNELS, because on a settled step they say different things. The INDICATED channel is
   * what the player reads and carries this plant's instrument noise; the TRUE value is what the
   * plant did. Where the two agree the step is genuinely moving; where indicated is large and true
   * is not, the glance metric is measuring noise and the rung is not the reason. */
  console.log('  rung | glance window | worst REACTOR POWER change in one 2.5 s glance');
  console.log('       |               |   indicated (what is read)   true (what the plant did)');
  RUNGS.forEach(function (n) {
    var wi = worstInWindow(rows, 'ind', 2.5 * n), wt = worstInWindow(rows, 'tru', 2.5 * n);
    console.log('  ' + String(n + 'x').padStart(4) + ' | ' + String((2.5 * n).toFixed(1) + ' plant-s').padStart(14) +
                ' | ' + (wi.worst.toFixed(3) + ' %').padStart(22) + (wt.worst.toFixed(3) + ' %').padStart(28));
  });
}

/* AN ACTION STEP'S GLANCE NUMBER IS ONLY HALF ITS ANSWER: the other half is how long the player
 * has to STOP what the step told them to start. Reported in the player's own wall clock, because
 * that is the clock their hand is on. */
function rodPull(rows) {
  var firstMove = null, lastMove = null;
  for (var i = 1; i < rows.length; i++) {
    if (rows[i].rods !== rows[i - 1].rods) { if (firstMove === null) firstMove = rows[i].t; lastMove = rows[i].t; }
  }
  if (firstMove === null) return;
  var pullS = lastMove - firstMove;
  var nSteps = Math.max(1, Math.abs(rows[rows.length - 1].rods - rows[0].rods));
  console.log('  rod pull: ' + rows[0].rods.toFixed(1) + ' -> ' + rows[rows.length - 1].rods.toFixed(1) +
              ' steps over ' + pullS.toFixed(1) + ' plant-seconds');
  console.log('  rung | the whole pull, in the player wall clock | one rod step');
  RUNGS.forEach(function (n) {
    console.log('  ' + String(n + 'x').padStart(4) + ' | ' + (pullS / n).toFixed(1) + ' s' +
                ' | ' + (pullS / nSteps / n).toFixed(2) + ' s');
  });
}

console.log('THE GLANCE MEASUREMENT — ' + PROC_ID + ' steps ' + FIRST + ' to ' + LAST);
console.log('seed 42, pwr2, full stack, IC ' + PROC.from + ', samples every ' + DT_SAMPLE + ' s');

var svc = svcFresh();
var r = replayTo(svc, FIRST - 1);
console.log('\nreplay of steps 1-' + (FIRST - 1) + ': ' + r.checks + ' checks, ' + r.failed + ' failed' +
            (r.failed ? ' — ' + r.names.join(' | ') : ''));
var s0 = svc.tick();
console.log('at the start of step ' + FIRST + ': REACTOR POWER ' + s0.instruments.power_range.toFixed(3) +
            ' %, STARTUP RATE ' + s0.instruments.startup_rate.toFixed(3) +
            ', rods ' + s0.true_state.rod_steps + ', t=' + s0.metadata.sim_time.toFixed(1) + ' s');

for (var n = FIRST; n <= LAST; n++) {
  var st = PROC.steps[n - 1];
  var rows = trace(svc, +st.hold || 0, st.cmd || null);
  if (!rows.length) { console.log('\nSTEP ' + n + ' holds 0 s — nothing to sample'); continue; }
  report('STEP ' + n + ' — "' + String(st.text || '').slice(0, 70) + '" (hold ' + st.hold + ' s' +
         (st.cmd ? ', cmd ' + JSON.stringify(st.cmd) : ', a pure wait, no command') + ')', rows);
  var m = untilMet(rows, st.acc || (st.accs || [])[0]);
  if (m.rows.length !== rows.length) report('  …and only the part auto fast-forwards: ' + m.note, m.rows);
  else console.log('  (auto fast-forwards the whole step: ' + m.note + ')');
  rodPull(rows);
}
