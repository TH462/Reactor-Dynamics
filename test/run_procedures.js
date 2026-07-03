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

[['pwr', ['pwr_config', 'pwr_protection', 'pwr_thermal', 'pwr_pressurizer', 'pwr_primary', 'pwr_steam_generator', 'pwr_instruments', 'pwr_engine']],
 ['rbmk', ['rbmk_protection', 'rbmk_config', 'rbmk_kinetics', 'rbmk_thermal', 'rbmk_rods', 'rbmk_instruments', 'rbmk_engine']],
 ['bwr', ['bwr_config', 'bwr_protection', 'bwr_vessel', 'bwr_recirculation', 'bwr_safety_systems', 'bwr_instruments', 'bwr_engine']]
].forEach(function (x) { x[1].forEach(function (f) { require('../engines/' + x[0] + '/' + f + '.js'); }); });
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

function runProcedure(prof, proc) {
  var P = PROFILES[prof];
  var e = new P.ctor(P.version ? { design_version: P.version } : {});
  e.reset({ plant_id: P.plant, initial_state: proc.from, design_version: P.version });
  var checks = [];
  var gNever = (proc.guard && proc.guard.never || []).map(function (c) { return { c: c, hit: false }; });
  var meltHit = false;
  function tick() { var ts = e.getTrueState(); if (ts.melted) meltHit = true; gNever.forEach(function (g) { if (pred(ts, g.c)) g.hit = true; }); }

  (proc.steps || []).forEach(function (st, idx) {
    if (st.cmd) { var cmd = {}; for (var k in st.cmd) cmd[k] = st.cmd[k];
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

var suites = 0, suitesPass = 0, total = 0, passed = 0, narr = 0;
Object.keys(RD.MANUAL_PROCEDURES).forEach(function (prof) {
  RD.MANUAL_PROCEDURES[prof].forEach(function (proc) {
    if (proc.narrative) { narr++; console.log(C + 'NARR' + X + '  ' + B + prof + ' · ' + proc.id + X + D + ' (' + proc.category + ' — narrative; engine flagship suite owns validation)' + X); return; }
    var r = runProcedure(prof, proc); suites++; if (r.pass) suitesPass++;
    console.log((r.pass ? G + 'PASS' : R + 'FAIL') + X + '  ' + B + prof + ' · ' + proc.id + X + D + ' (' + proc.category + ')' + X);
    r.checks.forEach(function (c) { total++; if (c.pass) passed++;
      console.log((c.pass ? G + '  ✓' : R + '  ✗') + X + ' ' + c.d + D + '  (' + (typeof c.obs === 'number' ? Math.round(c.obs * 100) / 100 : c.obs) + ')' + X); });
  });
});
console.log('\n' + B + '──────────' + X);
console.log(B + 'Procedures: ' + suitesPass + '/' + suites + X + '   Checks: ' + (passed === total ? G : R) + passed + '/' + total + X + '   (' + narr + ' narrative)');
process.exit(suitesPass === suites ? 0 : 1);
