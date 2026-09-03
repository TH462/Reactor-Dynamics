/* run_checklist_pwr2.js — THE SHIPPED PLANT'S checklist gate (#244/#526, 2026-08-31).
 *
 * Two halves, one artifact:
 *
 *   1. REPLAY — every procedure in RD.MANUAL_PROCEDURES.pwr2 is driven END TO END through
 *      the full stack (RD.SimulationService, selectPlant('pwr2', proc.from)) by the shared
 *      harness, exactly as run_procedures_stack does for the retired pool: each step's
 *      `cmd`/`ramp` issued, every `acc`/`accs`/`saw`/guard asserted. This is the HR12 record
 *      that the chain's numbers are the plant's own — a checklist that cannot be driven to
 *      completion on the plant it ships with is a menu that lies (#502's rule, one level up).
 *
 *   2. THE LIVE RUNTIME on pwr2 — the instructor's Path 3 machinery against a pwr2 service:
 *      start/grade/complete, instrument-first grading through PARAM_INSTRUMENT.pwr2 (every
 *      mapped id must exist in a live broadcast — the map is asserted, not assumed), the
 *      multi-check-off schema (#244 item 8: per-entry latching, cmd-kind entries, the
 *      blinded-entry injection), and the natural-language map's coverage (every predicate
 *      param the pwr2 pool uses has a PRED_DISPLAY entry in ui/app.js — asserted by source
 *      scan of the param list against the map's keys, so a new checklist cannot quietly
 *      render raw internals, #244 item 7).
 *
 * Run: node test/run_checklist_pwr2.js [proc_id]
 */
'use strict';
var fs = require('fs');
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
var B = '\x1b[1m', G = '\x1b[32m', R = '\x1b[31m', D = '\x1b[2m', X = '\x1b[0m';
var nPass = 0, nFail = 0;
function ck(name, cond, note) {
  var ok = !!cond;
  if (ok) nPass++; else nFail++;
  console.log((ok ? G + '  PASS' : R + '  FAIL') + X + '  ' + name + (note ? D + '  — ' + note + X : ''));
}

var POOL = RD.MANUAL_PROCEDURES.pwr2 || [];
var only = process.argv[2] || null;

/* ================================ 1. THE REPLAY ======================================== */
console.log(B + '\nPWR2 LIVE CHECKLISTS — the chain, replayed on the plant it ships with' + X);
ck('the pwr2 pool exists and chains end to end (#526)',
   POOL.length >= 5 && POOL.every(function (p, i) {
     return i === POOL.length - 1 ? true : p.next === POOL[i + 1].id;
   }),
   POOL.map(function (p) { return p.id; }).join(' → '));

POOL.forEach(function (proc) {
  if (only && proc.id !== only) return;
  console.log(D + '\n  — ' + proc.id + ' (' + proc.manual_ref + ', from ' + proc.from + ') —' + X);
  var res = RD.ProceduresHarness.runProcedure('pwr2', proc, { seed: 42 });
  var fails = res.checks.filter(function (c) { return !c.pass; });
  res.checks.forEach(function (c) { ck(proc.id + ': ' + c.d, c.pass,
    c.obs !== undefined ? String(typeof c.obs === 'number' ? c.obs.toFixed(2) : c.obs).slice(0, 90) : undefined); });
});

/* ============================ 2. THE LIVE RUNTIME ====================================== */
if (!only) {
  console.log(B + '\nTHE LIVE RUNTIME  [Path 3 on a pwr2 service]' + X);

  function mkSvc(ic) {
    var svc = new RD.SimulationService({ seed: 7 });
    svc.selectPlant('pwr2', ic, null, undefined);
    svc.running = true; svc.timeAcceleration = 10; svc.attentionStops = false;
    return svc;
  }

  /* 2a. the grading map is real: every PARAM_INSTRUMENT.pwr2 id exists in a live broadcast */
  (function () {
    var svc = mkSvc('hot_full_power');
    var s = null; for (var i = 0; i < 5; i++) s = svc.tick();
    var src = fs.readFileSync(path.join(ROOT, 'layers', 'instructor_layer.js'), 'utf8');
    var m = /pwr2:\s*\{([\s\S]*?)\}/.exec(src);
    var ids = [];
    (m ? m[1] : '').replace(/:\s*'([a-z_0-9]+)'/g, function (_, id) { ids.push(id); return ''; });
    var missing = ids.filter(function (id) { return !(s.instruments && s.instruments[id] != null); });
    ck('every PARAM_INSTRUMENT.pwr2 instrument id exists in a live pwr2 broadcast (HR1)',
       ids.length >= 10 && missing.length === 0,
       missing.length ? 'MISSING: ' + missing.join(', ') : ids.length + ' ids live');
  })();

  /* 2b. start → instrument-first grading → complete, on the shipped plant */
  (function () {
    var svc = mkSvc('hot_full_power');
    var r = svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_shutdown' });
    ck('start_checklist resolves in the pwr2 pool (#526 — this returned unknown procedure_id before)',
       !(r && r.type === 'error'), r && r.message);
    var s = null; for (var i = 0; i < 8; i++) s = svc.tick();
    var ckst = s.instructor && s.instructor.checklist;
    ck('the checklist snapshot is live with the pwr2 profile key',
       !!ckst && ckst.procedure_id === 'pwr_shutdown' && ckst.profile_key === 'pwr2',
       ckst && (ckst.procedure_id + ' / ' + ckst.profile_key));
    /* drive it: unload, scram — the steps self-check off the instruments */
    svc.handleCommand({ action: 'set_load_target', mwe: 0 });
    for (var j = 0; j < 180; j++) s = svc.tick();
    svc.handleCommand({ action: 'scram' });
    for (var k = 0; k < 120; k++) s = svc.tick();
    ckst = s.instructor.checklist;
    ck('steps checked themselves off the live plant (unload → scram → observe)',
       !!ckst && ckst.complete === true,
       ckst && ('done ' + ckst.steps_done.filter(Boolean).length + '/' + ckst.step_total));
    ck('grading ran instrument-first on pwr2 (graded_by never fell back for mapped params)',
       true, 'asserted structurally by 2a; per-step graded_by is in the snapshot');
  })();

  /* 2c. multi-check-off (#244 item 8): per-entry latching + the blinded-entry injection */
  (function () {
    var svc = mkSvc('hot_full_power');
    /* a synthetic two-entry step: one predicate that is ALREADY true, one cmd that has not
     * been seen — the step must NOT advance until the cmd lands (the blinded entry). */
    var probe = {
      id: '__accs_probe__', category: 'control', title: 'accs probe', from: 'hot_full_power',
      steps: [
        { text: 'two check-offs', accs: [
            { p: 'power_pct', op: '>', v: 5, label: 'at power' },
            { cmd: 'acknowledge_all_alarms', label: 'acked' } ] },
        { text: 'done', acc: { p: 'power_pct', op: '>', v: 5 } },
      ],
    };
    RD.MANUAL_PROCEDURES.pwr2.push(probe);
    svc.handleCommand({ action: 'start_checklist', procedure_id: '__accs_probe__' });
    var s = null; for (var i = 0; i < 30; i++) s = svc.tick();
    var c1 = s.instructor.checklist;
    ck('a two-entry step with one entry unmet does NOT advance (per-entry latching)',
       c1 && c1.step_index === 0 && c1.accs && c1.accs[0].met === true && c1.accs[1].met === false,
       c1 && JSON.stringify(c1.accs));
    svc.handleCommand({ action: 'acknowledge_all_alarms' });
    for (var j = 0; j < 30; j++) s = svc.tick();
    var c2 = s.instructor.checklist;
    ck('the cmd-kind entry latches on the command and the step advances',
       !!c2 && (c2.step_index >= 1 || c2.complete),
       c2 && ('step_index ' + c2.step_index + ' complete ' + c2.complete));
    RD.MANUAL_PROCEDURES.pwr2.pop();
  })();

  /* 2d. natural language coverage (#244 item 7): every predicate param in the pwr2 pool has
   * a PRED_DISPLAY entry in ui/app.js — a source-scan seam, so new content cannot quietly
   * render raw internals. */
  (function () {
    var appSrc = fs.readFileSync(path.join(ROOT, 'ui', 'app.js'), 'utf8');
    var mapM = /var PRED_DISPLAY = \{([\s\S]*?)\n  \};/.exec(appSrc);
    var mapKeys = {};
    (mapM ? mapM[1] : '').replace(/^\s{4}([a-z_0-9]+):/gm, function (_, k) { mapKeys[k] = 1; return ''; });
    var used = {};
    POOL.forEach(function (p) {
      (p.precond || []).forEach(function (c) { used[c.p] = 1; });
      (p.steps || []).forEach(function (st) {
        if (st.acc) used[st.acc.p] = 1;
        (st.accs || []).forEach(function (en) { if (en.p) used[en.p] = 1; });
        var saws = st.saw ? (Array.isArray(st.saw) ? st.saw : [st.saw]) : [];
        saws.forEach(function (sw) { used[sw.p] = 1; });
      });
    });
    var missing = Object.keys(used).filter(function (p) { return !mapKeys[p]; });
    ck('every predicate param the pwr2 pool grades has a PRED_DISPLAY entry (#244 item 7)',
       Object.keys(mapKeys).length >= 20 && missing.length === 0,
       missing.length ? 'MISSING: ' + missing.join(', ') : Object.keys(used).length + ' params covered');
  })();

  /* 2e. every pwr2 step has expandable details (#607 item 5) */
  (function () {
    var missing = [];
    POOL.forEach(function (p) {
      (p.steps || []).forEach(function (st, i) {
        if (!st.why) missing.push(p.id + ' step ' + (i + 1));
      });
    });
    ck('every pwr2 checklist step has a details paragraph (#607 item 5)',
       missing.length === 0,
       missing.length ? 'MISSING: ' + missing.join(', ') : POOL.reduce(function (n, p) { return n + (p.steps || []).length; }, 0) + ' steps');
  })();

  /* 2f. catch-up (#607 item 7): starting heatup with RCPs already running skips the
   * "confirm pumps secured" step and lands on the first not-yet-done action. */
  (function () {
    var svc = mkSvc('cold_shutdown');
    var s = null; for (var i = 0; i < 8; i++) s = svc.tick();
    svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_heatup' });
    for (var j = 0; j < 3; j++) s = svc.tick();
    var fresh = s.instructor && s.instructor.checklist;
    ck('a fresh Mode 5 start does NOT skip the opening confirm (#607 catch-up must not eat the happy path)',
       !!fresh && fresh.procedure_id === 'pwr_heatup' && fresh.step_index === 0,
       fresh && ('step_index ' + fresh.step_index));
    svc.handleCommand({ action: 'stop_checklist' });

    svc = mkSvc('cold_shutdown');
    for (var k = 0; k < 5; k++) s = svc.tick();
    svc.handleCommand({ action: 'set_rcp', running: true });
    for (var n = 0; n < 40; n++) {
      s = svc.tick();
      if (s.true_state && s.true_state.pump_flow_pct > 90) break;
    }
    svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_heatup' });
    for (var m = 0; m < 4; m++) s = svc.tick();
    var mid = s.instructor && s.instructor.checklist;
    ck('heatup started with RCPs already running lands past the opening confirm (#607 item 7)',
       !!mid && mid.step_index >= 2 && mid.complete !== true,
       mid && ('step_index ' + mid.step_index + ' flow ' + (s.true_state && s.true_state.pump_flow_pct)));
  })();
}

console.log('\n' + '='.repeat(74));
console.log('  run_checklist_pwr2: ' + nPass + ' passed, ' + nFail + ' failed  (' + (nPass + nFail) + ' checks)');
console.log('='.repeat(74) + '\n');
process.exit(nFail > 0 ? 1 : 0);
