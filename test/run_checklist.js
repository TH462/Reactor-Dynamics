/*
 * test/run_checklist.js — Path 3 auto-checklists (M5 `start_checklist` + M6
 * checklist runtime). A procedure run as a PASSIVE checklist against the live
 * plant: no reset, no gating; steps check themselves off the instruments
 * (acc debounced instrument-first, saw latched, or command family observed),
 * observation steps tick by hand (`checklist_check`), and the whole thing
 * survives save/load. Also pins the free-play invariants: commands are never
 * blocked while a checklist runs, and loading instructed content clears it.
 *   node test/run_checklist.js
 */
'use strict';
var C = '\x1b[36m', G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';

require('../engines/load_mode.js');
['engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js',
 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js', 'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
 'layers/control/control_kernel.js', 'layers/instructor_layer.js', 'layers/simulation_service.js'
].forEach(function (f) { require('../' + f); });
require('../ui/manual_procedures.js');
var RD = globalThis.RD;

var total = 0, passed = 0;
function ck(desc, pass, obs) {
  total++;
  if (pass) { passed++; console.log(G + '  ✓' + X + ' ' + desc + D + '  (' + obs + ')' + X); }
  else console.log(R + '  ✗ ' + desc + X + D + '  (' + obs + ')' + X);
}
function head(t) { console.log('\n' + B + C + t + X); }

function mkService() {
  var svc = new RD.SimulationService({ seed: 42, plant_id: 'pwr', initial_state: 'hot_full_power' });
  svc.running = true;                       // tests drive tick() directly
  return svc;
}
function run(svc, n) { var s = null; for (var i = 0; i < n; i++) s = svc.tick(); return s || svc.handleCommand({ action: 'noop' }); }
function ckl(snap) { return snap && snap.instructor ? snap.instructor.checklist : null; }
function ctlGroup(svc) {
  var gs = svc.engine.getControlState().rod_groups;
  for (var i = 0; i < gs.length; i++) if (gs[i].function === 'control' || gs[i].function === 'manual') return gs[i].id;
  return gs[0] && gs[0].id;
}

// ---------------------------------------------------------------- 1. lifecycle
head('1. Lifecycle — start against the LIVE plant, no reset');
var svc = mkService();
var bad = svc.handleCommand({ action: 'start_checklist', procedure_id: 'no_such_proc' });
ck('unknown procedure_id → error', bad && bad.type === 'error', bad && bad.code);

run(svc, 5);                                 // move sim time off zero
var t0 = svc.simTime;
var snap = svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_lower_power' });
var c = ckl(snap);
ck('checklist block in snapshot', !!c, c && c.procedure_id);
ck('step_total matches procedure', c && c.step_total === 2, c && c.step_total);
ck('starts at step 0, nothing done', c && c.step_index === 0 && !c.steps_done[0] && !c.steps_done[1], c && c.step_index);
ck('plant NOT reset (sim time kept)', svc.simTime >= t0, svc.simTime.toFixed(2) + ' >= ' + t0.toFixed(2));
var ts0 = svc.engine.getTrueState();
ck('plant still at power', ts0.power_pct > 90, ts0.power_pct.toFixed(1));

// ------------------------------------------------- 2. cmd-family auto-check
head('2. Auto-check — command family observed (step with cmd, no acc)');
snap = run(svc, 3);
c = ckl(snap);
ck('step 1 waits for its command', c.step_index === 0, 'idx ' + c.step_index);
svc.handleCommand({ action: 'set_steam_demand', mwe: 60 });
snap = run(svc, 2);
c = ckl(snap);
ck('step 1 checked off by the command', c.steps_done[0] === true && c.step_index === 1, 'done_by ' + c.done_by[0]);
ck('checked automatically, not by hand', c.done_by[0] === 'auto', c.done_by[0]);

// ------------------------------------------------- 3. acc auto-check (debounced)
head('3. Auto-check — acceptance predicate, instrument-first, debounced');
svc.handleCommand({ action: 'rod_nudge', group_id: ctlGroup(svc), steps: -40, speed: 'normal' });
var lim = 0;
do { snap = run(svc, 1); c = ckl(snap); lim++; } while (c && !c.complete && lim < 400);
ck('step 2 auto-checks when power_pct < 98', c && c.steps_done[1] === true, 'after ' + lim + ' ticks');
ck('checklist complete', c && c.complete === true, c && c.complete);
ck('graded off the instrument (HR1)', c && c.done_by[1] === 'auto', c && (c.graded_by || 'auto'));

// while complete, plant commands still descend
var r0 = svc.handleCommand({ action: 'set_heater', power_pct: 50 });
ck('commands never blocked by a checklist', !(r0 && r0.type === 'blocked'), r0 ? (r0.type || 'ok') : 'ok');

var snapStop = svc.handleCommand({ action: 'stop_checklist' });
ck('stop_checklist clears the block', ckl(snapStop) === null, 'null');

// ------------------------------------------------- 4. manual tick + wrong index
head('4. Manual tick — observation steps check by hand, active step only');
snap = svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_pressure_control' });
c = ckl(snap);
ck('obs step does not auto-check', c.step_index === 0, 'idx ' + c.step_index);
snap = svc.handleCommand({ action: 'checklist_check', index: 1 });     // not the active step
c = ckl(snap);
ck('wrong index refused', c.step_index === 0 && !c.steps_done[0], 'idx ' + c.step_index);
snap = svc.handleCommand({ action: 'checklist_check', index: 0 });
c = ckl(snap);
ck('active obs step ticks by hand', c.steps_done[0] === true && c.step_index === 1, 'done_by ' + c.done_by[0]);
ck('manual tick recorded as manual', c.done_by[0] === 'manual', c.done_by[0]);

// free-play invariant: unrelated commands forward unaltered mid-checklist
var r1 = svc.handleCommand({ action: 'set_heater', power_pct: 0 });
ck('mid-checklist command not blocked', !(r1 && r1.type === 'blocked'), r1 ? (r1.type || 'ok') : 'ok');

// ------------------------------------------------- 5. save / load round-trip
head('5. Save/load — checklist survives a state restore');
var saved = svc.saveState();
var svc2 = mkService();
svc2.loadState(saved);
var snap2 = svc2.tick() || svc2._assembleWithInstructor();
var c2 = ckl(snap2);
ck('checklist restored', !!c2 && c2.procedure_id === 'pwr_pressure_control', c2 && c2.procedure_id);
ck('progress restored (step 1 done)', c2 && c2.steps_done[0] === true && c2.step_index === 1, c2 && 'idx ' + c2.step_index);
ck('done_by restored', c2 && c2.done_by[0] === 'manual', c2 && c2.done_by[0]);

// ------------------------------------------------- 6. instructed content clears it
head('6. Instructed content owns the card — starting a follow clears the checklist');
var snap3 = svc2.handleCommand({ action: 'start_follow', procedure_id: 'pwr_lower_power' });
ck('follow loads', !!(snap3 && snap3.instructor && snap3.instructor.follow), snap3 && snap3.instructor && snap3.instructor.follow ? snap3.instructor.follow.procedure_id : 'none');
ck('checklist cleared by follow', ckl(snap3) === null, 'null');

// ------------------------------------------------- 7. preconditions (#395)
head('7. Preconditions — graded live, WARN and never block');
// Mechanism probe with a SYNTHETIC procedure so this section does not depend on
// which real procedures carry `precond`. Two rows: one met at hot_full_power,
// one deliberately unmet but FIXABLE by a single command (hpi_active coerces to
// 1/0 under the ~ op), which is what lets the live-clear path be observed.
RD.MANUAL_PROCEDURES.pwr.push({
  id: 'zz_precond_probe', category: 'control', title: 'precondition mechanism probe',
  from: 'hot_full_power', prereq: ['test'],
  precond: [
    { p: 'power_pct', op: '>', v: 90, text: 'reactor at power' },
    { p: 'hpi_active', op: '~', v: 1, tol: 0.5, text: 'safety injection running (test row)' },
  ],
  steps: [{ text: 'observe (never auto-checks; the section watches the banner, not the steps)' }],
});
var svc3 = mkService();
run(svc3, 3);
snap = svc3.handleCommand({ action: 'start_checklist', procedure_id: 'zz_precond_probe' });
c = ckl(snap);
// _assembleWithInstructor steps the instructor on the snapshot it returns, so
// the verdicts are graded in the SAME snapshot the start command hands back —
// the operator never sees a bannerless frame first.
ck('verdicts graded in the start snapshot itself', !!(c && c.preconditions), c && (c.preconditions ? 'graded' : String(c.preconditions)));
snap = run(svc3, 2);
c = ckl(snap);
// pcv(): null-safe row accessor so a neutered evaluation (the injection this
// section is verified against) produces clean reds, not a TypeError.
function pcv(cc, i) { return (cc && cc.preconditions && cc.preconditions[i]) || {}; }
ck('verdicts in snapshot after a tick, order-parallel', !!(c && c.preconditions && c.preconditions.length === 2), c && c.preconditions && c.preconditions.length);
ck('met row graded true', pcv(c, 0).met === true, 'power obs ' + pcv(c, 0).obs);
ck('unmet row graded false, observation shipped', pcv(c, 1).met === false && pcv(c, 1).obs !== undefined, 'obs ' + pcv(c, 1).obs);
ck('instructor comment raised while unmet', !!(snap.instructor && snap.instructor.message), snap.instructor && String(snap.instructor.message).slice(0, 40) + '…');
var r2 = svc3.handleCommand({ action: 'set_heater', power_pct: 40 });
ck('commands not blocked while unmet (warn, never block)', !(r2 && r2.type === 'blocked'), r2 ? (r2.type || 'ok') : 'ok');
svc3.handleCommand({ action: 'set_hpi', active: true });
snap = run(svc3, 2);
c = ckl(snap);
ck('fixing the plant clears the row live', pcv(c, 1).met === true, 'obs ' + pcv(c, 1).obs);
ck('all rows met → the comment comes down', !(snap.instructor && snap.instructor.message), snap.instructor && String(snap.instructor.message));
svc3.handleCommand({ action: 'set_hpi', active: false });
snap = run(svc3, 2);
ck('re-breaking the condition re-raises the comment (new episode)', !!(snap.instructor && snap.instructor.message), 'raised');
snap = svc3.handleCommand({ action: 'stop_checklist' });
snap = run(svc3, 1);
ck('stop takes the standing comment down with the banner', !(snap.instructor && snap.instructor.message), snap.instructor && String(snap.instructor.message));

// ------------------------------------------------- 8. real content (#395/#396)
head('8. Tier B content — pwr_startup\'s seam row discriminates');
// cold_shutdown carries the SAME 857 ppm a pump-heat heatup preserves (#396's
// seam), so starting the startup checklist there must flag the boron row — plus
// the cold rows — while the own-IC case (measured in batch 2, all 16 rows MET on
// their six from: ICs) stays banner-free.
var svc4 = new RD.SimulationService({ seed: 42, plant_id: 'pwr', initial_state: 'cold_shutdown' });
svc4.running = true;
run(svc4, 10);
snap = svc4.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_startup' });
c = ckl(snap);
ck('startup ships 4 precondition rows', !!(c && c.preconditions && c.preconditions.length === 4), c && c.preconditions && c.preconditions.length);
ck('the #396 boron seam row reads UNMET at ~857 ppm', pcv(c, 3).met === false && Math.abs(pcv(c, 3).obs - 857) < 15, 'obs ' + (pcv(c, 3).obs != null ? (+pcv(c, 3).obs).toFixed(1) : '—'));
ck('the temperature row reads UNMET on a cold plant', pcv(c, 0).met === false, 'obs ' + (pcv(c, 0).obs != null ? (+pcv(c, 0).obs).toFixed(1) : '—'));
ck('instructor comment raised for the seam', !!(snap.instructor && snap.instructor.message), 'raised');
svc4.handleCommand({ action: 'stop_checklist' });

// ---------------------------------------------------------------- summary
console.log('\n' + B + '──────────' + X);
var ok = passed === total;
console.log(B + 'Checklists: ' + (ok ? G : R) + passed + '/' + total + X);
process.exit(ok ? 0 : 1);
