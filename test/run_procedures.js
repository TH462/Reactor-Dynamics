/*
 * test/run_procedures.js — validates the authored operator procedures
 * (ui/manual_procedures.js) by driving each one through its engine from `from` and
 * checking each step's `acc`/`saw` predicate plus the proc-level `guard`. A
 * procedure that doesn't reach its stated outcomes FAILS — so nothing ships in the
 * manual unproven, and the same predicates the Instructor (M6) will gate on are the
 * ones proven here. Engine-direct (operator command sequences only).
 *   node test/run_procedures.js
 */
'use strict';
var C = '\x1b[36m', G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';

require('../engines/load_mode.js');
// Per-plant control-layer data (trips/actuations/alarms/failures) lives in
// layers/control/<plant>_control.js; RBMK's loads before its config (forVersion).
['engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_pressurizer2.js',
 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js', 'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
 'layers/control/rbmk_control.js', 'engines/rbmk/rbmk_config.js', 'engines/rbmk/rbmk_kinetics.js', 'engines/rbmk/rbmk_thermal.js',
 'engines/rbmk/rbmk_rods.js', 'engines/rbmk/rbmk_instruments.js', 'engines/rbmk/rbmk_engine.js',
 'engines/bwr/bwr_config.js', 'layers/control/bwr_control.js', 'engines/bwr/bwr_vessel.js', 'engines/bwr/bwr_recirculation.js',
 'engines/bwr/bwr_safety_systems.js', 'engines/bwr/bwr_instruments.js', 'engines/bwr/bwr_engine.js'
].forEach(function (f) { require('../' + f); });
require('../ui/manual_procedures.js');
var RD = globalThis.RD;

var PROFILES = {
  pwr: { ctor: RD.PWREngine, plant: 'pwr', version: null },
  rbmk_pre: { ctor: RD.RBMKEngine, plant: 'rbmk', version: 'pre_chernobyl' },
  rbmk_post: { ctor: RD.RBMKEngine, plant: 'rbmk', version: 'post_chernobyl' },
  bwr: { ctor: RD.BWREngine, plant: 'bwr', version: null },
};
function groupId(e, which) {
  var gs = e.getControlState().rod_groups;
  for (var i = 0; i < gs.length; i++) { var fn = gs[i].function;
    if (which === 'control' && (fn === 'control' || fn === 'manual')) return gs[i].id;
    if (which === 'shutdown' && fn === 'shutdown') return gs[i].id; }
  return gs[0] && gs[0].id;
}
function cmp(a, op, b, tol) {
  switch (op) { case '>': return a > b; case '<': return a < b; case '>=': return a >= b; case '<=': return a <= b;
    case '~': return Math.abs(a - b) <= (tol || 0); } return false;
}
function pred(ts, c) { return cmp(ts[c.p], c.op, c.v, c.tol); }

// Step commands that never reach an ENGINE, so this harness (which drives engines
// directly, without the M4 control layer above them) skips them. The step's
// `hold`/`acc`/`saw` still run; only the command is not issued.
//   plot_1m_point   — an operator observation consumed by the instructor layer
//                     (see handleCommand in layers/instructor_layer.js)
//   set_trip_block  — an M4 reactor-protection block; the trips themselves are
//                     control-layer, so an engine-only run has nothing to block
//   set_auto_channel — engages an M4 automation channel; below M4 there is no
//                     channel to engage (the engine's own coupled-feed fallback
//                     stands in, which is why the engine-only level still holds)
//   set_auto_setpoint — retargets an M4 automation channel (the board's boron
//                     target box is the `boron_conc` channel setpoint). Below M4
//                     there is no channel, so nothing borates — which is why
//                     PWR-N15 is `stack_only`; see that note below. A LAYER
//                     difference, not a plant defect.
var NON_ENGINE_ACTIONS = { plot_1m_point: true, set_trip_block: true, set_auto_channel: true,
                           set_auto_setpoint: true };

// RAMP steps (#310) — see the long note in run_procedures_stack.js for why the
// schema grew. Here `hold` is walked at 0.02 s per engine step, so the re-issue
// cadence is expressed in engine steps rather than sim-seconds.
var RAMP_EVERY_S = 10;    // sim-s between re-issues
function rampValue(points, f) {
  if (points.length === 1) return points[0];
  var x = Math.max(0, Math.min(1, f)) * (points.length - 1);
  var i = Math.min(points.length - 2, Math.floor(x));
  return points[i] + (points[i + 1] - points[i]) * (x - i);
}

function runProcedure(prof, proc) {
  var P = PROFILES[prof];
  var e = new P.ctor(P.version ? { design_version: P.version } : {});
  /* the RETIRED engine's IC vocabulary — see RD.RETIRED_ENGINE_IC's note in ui/manual_procedures.js */
  e.reset({ plant_id: P.plant, initial_state: RD.RETIRED_ENGINE_IC(proc.from),
           design_version: P.version });
  var checks = [];
  var gNever = (proc.guard && proc.guard.never || []).map(function (c) { return { c: c, hit: false }; });
  var meltHit = false;
  function tick() { var ts = e.getTrueState(); if (ts.melted) meltHit = true; gNever.forEach(function (g) { if (pred(ts, g.c)) g.hit = true; }); }

  (proc.steps || []).forEach(function (st, idx) {
    // A ramp step's `cmd` is the representative operator action, not the drive —
    // issuing it here would put the leg's END value on the plant at t=0.
    if (st.cmd && !st.ramp && !NON_ENGINE_ACTIONS[st.cmd.action]) { var cmd = {}; for (var k in st.cmd) cmd[k] = st.cmd[k];
      if (cmd.group_id === 'control' || cmd.group_id === 'shutdown') cmd.group_id = groupId(e, cmd.group_id);
      e.applyCommand(cmd); }
    // `saw` may be ONE predicate or a LIST of them (#348). A step can legitimately have more
    // than one claim that is only true DURING the hold — pwr_stuck_porv step 1 has two, and
    // they are the only claims it has that hold at both layers, because with the control layer
    // in, safety injection catches the transient and every END-of-hold value diverges (measured:
    // subcooling closes at −5.2 °C engine-direct and +36.6 °C under the stack).
    var sawList = st.saw ? (Array.isArray(st.saw) ? st.saw : [st.saw]) : [];
    var sawHits = [], n = Math.round((st.hold || 0) / 0.02), every = Math.round(RAMP_EVERY_S / 0.02);
    for (var i = 0; i < n; i++) {
      if (st.ramp && (i % every === 0)) {
        var f = i / Math.max(1, n - 1);
        st.ramp.forEach(function (r) { var c = { action: r.action }; c[r.arg] = rampValue(r.points, f); e.applyCommand(c); });
      }
      e.step(0.02); tick(); sawList.forEach(function (sw, k) { if (pred(e.getTrueState(), sw)) sawHits[k] = true; }); }
    if (st.ramp) st.ramp.forEach(function (r) { var c = { action: r.action }; c[r.arg] = r.points[r.points.length - 1]; e.applyCommand(c); });
    sawList.forEach(function (sw, k) {
      checks.push({ d: 'step ' + (idx + 1) + ' saw ' + sw.p + ' ' + sw.op + ' ' + sw.v, pass: !!sawHits[k], obs: !!sawHits[k] });
    });
    if (st.acc) { var ts = e.getTrueState(); checks.push({ d: 'step ' + (idx + 1) + ' ' + st.acc.p + ' ' + st.acc.op + ' ' + st.acc.v, pass: pred(ts, st.acc), obs: ts[st.acc.p] }); }
  });
  if (proc.guard && proc.guard.never_melted) checks.push({ d: 'guard: never melted', pass: !meltHit, obs: meltHit });
  gNever.forEach(function (g) { checks.push({ d: 'guard: never ' + g.c.p + ' ' + g.c.op + ' ' + g.c.v, pass: !g.hit, obs: g.hit }); });
  return { pass: checks.every(function (c) { return c.pass; }), checks: checks };
}

// Known-fails: documented tuning targets (Diagnostic/OPS_TUNING_REPORT.md) whose
// acceptance test lives here. An XFAIL reports but does not redden the gate; if
// the underlying finding gets FIXED the check XPASSes and the gate goes RED so
// this annotation must be removed (strict xfail — no silent staleness).
var KNOWN_FAILS = {
  // B3: RCIC/HPCI capacity loses to post-trip boiloff — SBO level cannot hold.
  'bwr·bwr_sbo_rcic': { 'step 3 vessel_level_pct > 40': 'B3' },
};

/* `stack_only` — a procedure whose OPERATOR ACTIONS include an M4-only command that
 * the rest of it depends on, so replaying it engine-direct does not test a weaker
 * version of the same evolution: it tests a different plant.
 *
 * PWR-N15 is the case that forced this. The board's only boron control is the
 * `boron_conc` channel's target box (`set_auto_setpoint` — there is no manual
 * borate/dilute on the board at all), and below M4 there is no channel, so the
 * cooldown runs UNBORATED. That is not a smaller failure, it is the physics the
 * boration step exists to prevent: measured engine-direct, the MTC takes the core
 * critical as it cools and the plant HEATS BACK UP to 558.7 °F (292.6 °C) after
 * arriving in the 400s, with subcooling lost and RHR refused at 555 psi
 * (3.83 MPa) — nine reds describing one missing layer.
 *
 * KEPT over the alternative *(OWNER RULING, 2026-08-02: "1 keep. 2. Keep. 3. Keep.")*.
 * The option weighed against it was dropping the flag and carrying nine xfail strings in
 * KNOWN_FAILS, all of them saying "no M4 below M4" — strictly more machinery.
 *
 * NOT A GENERAL ESCAPE HATCH, and the check below is what keeps it that way: the
 * flag is only honoured if the procedure really does carry a NON_ENGINE_ACTION
 * command, so it cannot be pinned onto a procedure that engine-direct could run.
 * `run_procedures_stack.js` runs PWR-N15 in full (28 checks). */
function stackOnlyJustified(proc) {
  return (proc.steps || []).filter(function (st) { return st.cmd && NON_ENGINE_ACTIONS[st.cmd.action]; })
    .map(function (st) { return st.cmd.action; });
}

var suites = 0, suitesPass = 0, total = 0, passed = 0, narr = 0, xfails = 0, xpassBad = 0;
var Y = '\x1b[33m';
Object.keys(RD.MANUAL_PROCEDURES).forEach(function (prof) {
  /* pwr2 is the SHIPPED plant's pool (#526) and replays full-stack in its own runner
   * (run_checklist_pwr2.js) — this engine-direct runner drives the RETIRED constructors
   * and has no pwr2 row in PROFILES, so it skips the key rather than crashing on it. */
  if (!PROFILES[prof]) return;
  RD.MANUAL_PROCEDURES[prof].forEach(function (proc) {
    if (proc.narrative) { narr++; console.log(C + 'NARR' + X + '  ' + B + prof + ' · ' + proc.id + X + D + ' (' + proc.category + ' — narrative; engine flagship suite owns validation)' + X); return; }
    if (proc.stack_only) {
      var m4 = stackOnlyJustified(proc);
      suites++; total++;
      var ok = m4.length > 0;
      if (ok) { suitesPass++; passed++; }
      console.log((ok ? G + 'PASS' : R + 'FAIL') + X + '  ' + B + prof + ' · ' + proc.id + X +
        D + ' (' + proc.category + ' — stack_only; run_procedures_stack.js owns it)' + X);
      console.log('  ' + (ok ? G + '✓' : R + '✗') + X + ' stack_only is justified — an M4-only command is load-bearing' +
        D + '  (' + (ok ? m4.join(', ') : 'NO NON_ENGINE_ACTION in any step — this procedure runs engine-direct, drop the flag') + ')' + X);
      return;
    }
    var known = KNOWN_FAILS[prof + '·' + proc.id] || {};
    var r = runProcedure(prof, proc);
    var effectivePass = true;
    r.checks.forEach(function (c) {
      var tag = known[c.d];
      if (tag && !c.pass) { c.xfail = tag; }
      else if (tag && c.pass) { c.xpass = tag; effectivePass = false; }
      else if (!c.pass) effectivePass = false;
    });
    suites++; if (effectivePass) suitesPass++;
    console.log((effectivePass ? G + 'PASS' : R + 'FAIL') + X + '  ' + B + prof + ' · ' + proc.id + X + D + ' (' + proc.category + ')' + X);
    r.checks.forEach(function (c) { total++;
      if (c.xfail) { xfails++; passed++;  // counted as expected
        console.log(Y + '  ✗(known ' + c.xfail + ')' + X + ' ' + c.d + D + '  (' + (typeof c.obs === 'number' ? Math.round(c.obs * 100) / 100 : c.obs) + ' — documented tuning target)' + X); return; }
      if (c.xpass) { xpassBad++;
        console.log(R + '  ✓(XPASS ' + c.xpass + '!)' + X + ' ' + c.d + D + '  (finding fixed — remove the KNOWN_FAILS entry)' + X); return; }
      if (c.pass) passed++;
      console.log((c.pass ? G + '  ✓' : R + '  ✗') + X + ' ' + c.d + D + '  (' + (typeof c.obs === 'number' ? Math.round(c.obs * 100) / 100 : c.obs) + ')' + X); });
  });
});
console.log('\n' + B + '──────────' + X);
console.log(B + 'Procedures: ' + suitesPass + '/' + suites + X + '   Checks: ' + (passed === total ? G : R) + passed + '/' + total + X +
  '   (' + narr + ' narrative' + (xfails ? ', ' + xfails + ' known-fail' : '') + (xpassBad ? ', ' + xpassBad + ' STALE XFAIL' : '') + ')');
process.exit(suitesPass === suites ? 0 : 1);
