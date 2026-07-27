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
['engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js',
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
var NON_ENGINE_ACTIONS = { plot_1m_point: true, set_trip_block: true, set_auto_channel: true };

function runProcedure(prof, proc) {
  var P = PROFILES[prof];
  var e = new P.ctor(P.version ? { design_version: P.version } : {});
  e.reset({ plant_id: P.plant, initial_state: proc.from, design_version: P.version });
  var checks = [];
  var gNever = (proc.guard && proc.guard.never || []).map(function (c) { return { c: c, hit: false }; });
  var meltHit = false;
  function tick() { var ts = e.getTrueState(); if (ts.melted) meltHit = true; gNever.forEach(function (g) { if (pred(ts, g.c)) g.hit = true; }); }

  (proc.steps || []).forEach(function (st, idx) {
    if (st.cmd && !NON_ENGINE_ACTIONS[st.cmd.action]) { var cmd = {}; for (var k in st.cmd) cmd[k] = st.cmd[k];
      if (cmd.group_id === 'control' || cmd.group_id === 'shutdown') cmd.group_id = groupId(e, cmd.group_id);
      e.applyCommand(cmd); }
    var sawHit = false, n = Math.round((st.hold || 0) / 0.02);
    for (var i = 0; i < n; i++) { e.step(0.02); tick(); if (st.saw && pred(e.getTrueState(), st.saw)) sawHit = true; }
    if (st.saw) checks.push({ d: 'step ' + (idx + 1) + ' saw ' + st.saw.p + ' ' + st.saw.op + ' ' + st.saw.v, pass: sawHit, obs: sawHit });
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

var suites = 0, suitesPass = 0, total = 0, passed = 0, narr = 0, xfails = 0, xpassBad = 0;
var Y = '\x1b[33m';
Object.keys(RD.MANUAL_PROCEDURES).forEach(function (prof) {
  RD.MANUAL_PROCEDURES[prof].forEach(function (proc) {
    if (proc.narrative) { narr++; console.log(C + 'NARR' + X + '  ' + B + prof + ' · ' + proc.id + X + D + ' (' + proc.category + ' — narrative; engine flagship suite owns validation)' + X); return; }
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
