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
['engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_pressurizer2.js',
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
/* EVERY STEP WAITS FOR CONTINUE *(OWNER, 2026-09-08, #660 item 16)*: the command satisfies the
 * step (awaiting_ack) and the player's Continue advances it; the record stays 'auto'. */
ck('step 1 satisfied by the command, waiting for Continue', c.awaiting_ack === true && c.step_index === 0 && !c.steps_done[0], 'ack ' + c.awaiting_ack + ' idx ' + c.step_index);
snap = svc.handleCommand({ action: 'checklist_check', index: 0 });
c = ckl(snap);
ck('Continue checks it off', c.steps_done[0] === true && c.step_index === 1, 'done_by ' + c.done_by[0]);
ck('recorded as instrument-graded, not by hand', c.done_by[0] === 'auto', c.done_by[0]);

// ------------------------------------------------- 3. acc auto-check (debounced)
head('3. Auto-check — acceptance predicate, instrument-first, debounced');
svc.handleCommand({ action: 'rod_nudge', group_id: ctlGroup(svc), steps: -40, speed: 'normal' });
var lim = 0;
do { snap = run(svc, 1); c = ckl(snap); lim++; } while (c && !c.awaiting_ack && lim < 400);
ck('step 2 satisfied when power_pct < 98, waiting for Continue', c && c.awaiting_ack === true && !c.steps_done[1], 'after ' + lim + ' ticks');
snap = svc.handleCommand({ action: 'checklist_check', index: 1 });
c = ckl(snap);
ck('checklist complete on Continue', c && c.complete === true && c.steps_done[1] === true, c && c.complete);
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
  // TWO steps, and the second exists for the #619 item 3 checks below: the section needs a
  // state where the checklist is UNDERWAY but not complete, and a one-step probe cannot have
  // one. Neither step auto-checks — the section watches the banner, not the steps — so the
  // only thing that advances this is an explicit `checklist_check`.
  /* Each step carries an acceptance that CANNOT be met, so the only thing that advances this
   * probe is an explicit `checklist_check`. Without it these were bare observation steps, which
   * complete on OBSERVE_DWELL_S of SIM time — invisible at 1x across a few ticks, but at 600x a
   * single tick covers 60 s and the step checked itself off. That is the instructor working
   * correctly and the FIXTURE being non-deterministic, and it surfaced only when the warp
   * checks below started running this probe at speed. */
  steps: [{ text: 'observe (advances only by checklist_check; the section watches the banner)',
            acc: { p: 'power_pct', op: '>', v: 9e9 } },
          { text: 'observe again (the underway state for the entry-only checks)',
            acc: { p: 'power_pct', op: '>', v: 9e9 } }],
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
ck('re-breaking the condition re-raises the comment AT ENTRY (new episode)', !!(snap.instructor && snap.instructor.message), 'raised');

/* ENTRY ONLY, ONCE THE RUN IS MOVING (#619 item 3, owner: "The instructor block gets a 'before
 * you...' in the middle of mode 5>3 checklist. it doesnt make sense.").
 *
 * The latch is per EPISODE, so a checklist that CHANGES the plant walks its own preconditions
 * back out and re-raised the message mid-run — the heatup's entry rows are "plant cold" and
 * "depressurized", which heating up and pressurizing break by design.
 *
 * ⚠ THE CHECK ABOVE COULD NOT SEE THIS, and that is why it is worth writing this way: this
 * probe's steps never auto-check, so `idx` stayed 0 and the entry guard never engaged. It
 * passed before the fix AND after it. The step below advances the checklist by hand first,
 * which is the only state in which the two behaviours differ. Verified by injection: dropping
 * the `!cklMoving` term in instructor_layer.js turns the last check here red and nothing else
 * in this runner moves. */
svc3.handleCommand({ action: 'set_hpi', active: true });
snap = run(svc3, 2);
ck('entry guard fixture: the comment is down again before advancing',
  !(snap.instructor && snap.instructor.message), 'clear');
svc3.handleCommand({ action: 'checklist_check', index: 0 });
snap = run(svc3, 1);
c = ckl(snap);
ck('entry guard fixture: the checklist is UNDERWAY and not complete',
  !!(c && c.step_index > 0 && !c.complete), c && ('step_index ' + c.step_index + ', complete ' + c.complete));
svc3.handleCommand({ action: 'set_hpi', active: false });
snap = run(svc3, 3);
c = ckl(snap);
ck('MID-RUN the broken row is still graded and shown in the panel',
  pcv(c, 1).met === false, 'obs ' + pcv(c, 1).obs);
ck('...but the instructor comment does NOT re-raise once the run is moving (#619 item 3)',
  !(snap.instructor && snap.instructor.message), snap.instructor && String(snap.instructor.message).slice(0, 50));
/* CHECKING A STEP OFF DROPS THE CLOCK BACK TO 1x (#619 item 6, owner: "when a step is checked
 * off, drop out of warp."). Asserted here rather than on the command path because the service
 * reads the checklist's step INDEX, not the check-off command — most steps tick themselves off
 * the instruments and never issue one. The reason string matters as much as the speed: the UI
 * toasts off it and flashes the speed buttons (item 7). */
svc3.handleCommand({ action: 'stop_checklist' });
run(svc3, 1);
svc3.handleCommand({ action: 'start_checklist', procedure_id: 'zz_precond_probe' });
svc3.handleCommand({ action: 'set_speed', value: 600 });
snap = run(svc3, 2);
ck('warp fixture: the clock is at 600x with a checklist running',
  snap.metadata.time_acceleration === 600, 'accel ' + snap.metadata.time_acceleration);
// A NON-FINAL step, so this covers the ordinary case rather than completion. (Completion
// fires too — `idx` runs to steps.length — and gating it out made the last step of every
// checklist the one that kept racing.)
// `speed_snap` is stamped on the ONE snapshot where the drop happens, and handleCommand
// assembles its own — so the reason rides back on the check-off's return value, not on the
// next tick. Reading a later frame finds the speed at 1x and the reason already gone, which
// is exactly the "sampled the wrong frame" shape, so both are read from the same snapshot.
snap = svc3.handleCommand({ action: 'checklist_check', index: 0 });
ck('a step checking off drops the clock to 1x (#619 item 6)',
  snap.metadata.time_acceleration === 1, 'accel ' + snap.metadata.time_acceleration);
ck('...and says WHY, so the UI can toast it and flash the speed buttons',
  !!(snap.metadata.speed_snap && snap.metadata.speed_snap.reason === 'step'),
  snap.metadata.speed_snap ? snap.metadata.speed_snap.reason : 'no speed_snap');
// The clock must STAY down — a dropout that re-armed itself would be a phantom stop the next
// time anything advanced. One more broadcast with no step movement, no new snap.
snap = run(svc3, 2);
ck('the dropout does not re-fire while the step index sits still',
  !snap.metadata.speed_snap, snap.metadata.speed_snap ? snap.metadata.speed_snap.reason : 'none');

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

// ------------------------------------- 9. rewind readiness (#660 items 17-18)
head('9. "Rewind step" — lit only when this step\'s own checkpoint is on the ring');
/* The walkthrough lays a checkpoint at every step boundary and the board's Rewind sends
 * `rewind steps:2 exact`, so the button is a claim about the RING, not about step_index —
 * and the two come apart on a loaded save. Both gaps were measured on pwr2, 2026-09-08:
 *
 *   (A) the one-broadcast gap does NOT exist. `checklist_check` runs _assembleWithInstructor,
 *       which services the instructor's checkpoint request in the SAME call, so the snapshot
 *       the check-off returns already carries the new checkpoint: ring 3 → 4 with no tick, and
 *       a rewind issued immediately after landed at step_index 2 / simTime 2.00 — identical to
 *       the same rewind with a tick in between. Nothing to guard, so this section PINS that.
 *   (B) after a save/load the walkthrough survives and the ring does not: step_index 2 restored,
 *       checkpoints.length 0, the rewind refused "no checkpoint to rewind to" with step_index
 *       unmoved — under a button drawn lit on `step_index > 0`.
 *
 * A synthetic procedure, like section 7: four steps whose acceptance can never be met, so the
 * only thing that moves the index is an explicit `checklist_check` and the ring arithmetic is
 * exact rather than at the mercy of a step grading itself off a live plant. */
RD.MANUAL_PROCEDURES.pwr.push({
  id: 'zz_rewind_probe', category: 'control', title: 'rewind-ring mechanism probe',
  from: 'hot_full_power', prereq: ['test'],
  steps: [0, 1, 2, 3].map(function (i) {
    return { text: 'rewind probe step ' + i + ' (advances only by checklist_check)',
             acc: { p: 'power_pct', op: '>', v: 9e9 } };
  }),
});
var svc5 = mkService();
run(svc5, 3);
/* The player was in FREE PLAY before pressing Start, so the ring already holds the sandbox
 * cadence's own checkpoint — measured 1 here. It sits UNDER the walkthrough's checkpoint 0,
 * which is why `rewind_ready` cannot be "the ring has two entries": at step 0 that is true and
 * a rewind would land the player BEFORE the walkthrough began. */
var ringFree = svc5.checkpoints.length;
var s5 = svc5.handleCommand({ action: 'start_checklist', procedure_id: 'zz_rewind_probe' });
var c5 = ckl(s5);
var ring0 = svc5.checkpoints.length;
ck('start lays the walkthrough\'s checkpoint 0 on top of free play\'s',
   ring0 === ringFree + 1 && ringFree >= 1, 'ring ' + ringFree + ' → ' + ring0);
ck('step 0 is NOT rewind-ready even with an earlier checkpoint on the ring',
   c5.rewind_ready === false && c5.step_index === 0, 'ready ' + c5.rewind_ready + ', idx ' + c5.step_index + ', ring ' + ring0);
// --- step 0 → 1. The check-off's OWN snapshot must already be rewind-ready (measurement A).
s5 = svc5.handleCommand({ action: 'checklist_check', index: 0 });
c5 = ckl(s5);
var tStep1 = svc5.simTime;                    // the start of step 1 — where a later rewind lands
ck('the check-off lays its checkpoint in the SAME broadcast (no one-tick gap)',
   svc5.checkpoints.length === ring0 + 1, 'ring ' + ring0 + ' → ' + svc5.checkpoints.length);
ck('rewind_ready true on the snapshot the check-off returns',
   c5.rewind_ready === true && c5.step_index === 1, 'ready ' + c5.rewind_ready + ', idx ' + c5.step_index);
s5 = run(svc5, 2);
c5 = ckl(s5);
ck('...and still true after the next broadcast, ring unchanged',
   c5.rewind_ready === true && svc5.checkpoints.length === ring0 + 1, 'ready ' + c5.rewind_ready + ', ring ' + svc5.checkpoints.length);
// --- step 1 → 2, then rewind: exactly one step back, to the start of step 1.
s5 = svc5.handleCommand({ action: 'checklist_check', index: 1 });
run(svc5, 3);
ck('at step 2 with a checkpoint per boundary', ckl(s5).step_index === 2 && svc5.checkpoints.length === ring0 + 2,
   'idx ' + ckl(s5).step_index + ', ring ' + svc5.checkpoints.length + ' (expected ' + (ring0 + 2) + ')');
var rw5 = svc5.handleCommand({ action: 'rewind', steps: 2, scope: 'full', exact: true });
var cr5 = ckl(rw5);
ck('rewind steps:2 exact lands exactly ONE step back',
   rw5.type === 'state' && cr5 && cr5.step_index === 1 && cr5.steps_done[1] === false,
   'idx ' + (cr5 && cr5.step_index) + ', step1 done ' + (cr5 && cr5.steps_done[1]));
ck('...and the plant comes back with it, at the start of that step',
   Math.abs(svc5.simTime - tStep1) < 1e-9, svc5.simTime.toFixed(2) + ' vs ' + tStep1.toFixed(2));
/* Derived from the ring, not book-kept: _rewind TRUNCATES to the target, so a remembered
 * "checkpoint laid at step N" would now read stale and a second press would be dark. */
ck('the rewound-to step is itself rewind-ready (a second press works)',
   cr5.rewind_ready === true && svc5.checkpoints.length === ring0 + 1,
   'ready ' + cr5.rewind_ready + ', ring ' + svc5.checkpoints.length + ' (expected ' + (ring0 + 1) + ')');
// --- save/load mid-walkthrough: progress survives, the ring does not (measurement B).
var saved5 = JSON.parse(JSON.stringify(svc5.saveState()));
var svc6 = mkService();
/* THE LOADING SERVICE MUST HAVE A RING OF ITS OWN, or "loadState clears the ring" is pinned on
 * a NON-EVENT: a freshly constructed service starts with checkpoints [] anyway, and the probe
 * below passed unchanged with loadState's `this.checkpoints = []` deleted. Three free-play ticks
 * put a sandbox checkpoint on it first, which is also the player's real path (load from a game
 * already in progress). */
run(svc6, 3);
var ringPre6 = svc6.checkpoints.length;
var ld5 = svc6.loadState(saved5);
var c6 = ckl(ld5) || ckl(svc6.tick());
ck('a loaded save keeps the walkthrough\'s progress', !!c6 && c6.step_index === 1 && c6.procedure_id === 'zz_rewind_probe',
   c6 && ('idx ' + c6.step_index));
ck('...and clears the rewind ring', ringPre6 >= 1 && svc6.checkpoints.length === 0, 'ring ' + ringPre6 + ' → ' + svc6.checkpoints.length);
ck('so rewind_ready is FALSE — the button that used to sit lit here', c6.rewind_ready === false, 'ready ' + c6.rewind_ready);
var rw6 = svc6.handleCommand({ action: 'rewind', steps: 2, scope: 'full', exact: true });
ck('the rewind command refuses cleanly and moves nothing',
   rw6 && rw6.type === 'error' && svc6.instructor.checklist.idx === 1 && svc6.checkpoints.length === 0,
   (rw6 && rw6.message) + '; idx ' + svc6.instructor.checklist.idx);
svc5.handleCommand({ action: 'stop_checklist' });

// ------------------------- 10. behind-the-scenes failures + narrative (#670 Phase 1)
head('10. Incident walkthroughs — a step fires its own failures, and carries the history');
/* *(OWNER, 2026-09-08: "these ones will automatically trigger failures behind the scenes.")*
 *
 * A synthetic procedure, for the same reason sections 7 and 9 use one: every step's acceptance
 * is unmeetable, so nothing but an explicit `checklist_check` moves the index and the ring
 * arithmetic below is exact rather than at the mercy of a plant grading itself.
 *
 * `porv_indicator_stuck_closed` is the when-gated and cleared id on purpose — it is an INSTRUMENT
 * failure, so the plant stays quiet while the probe drives it, and a mechanism check does not turn
 * into a transient. `stuck_porv_open` is the one that actually does something, which is what makes
 * the rewind check below a claim about the PLANT and not only about a bookkeeping flag. */
RD.MANUAL_PROCEDURES.pwr.push({
  id: 'zz_inject_probe', category: 'control', title: 'behind-the-scenes failure mechanism probe',
  from: 'hot_full_power', prereq: ['test'],
  steps: [
    { text: 'step 0 — the PORV sticks open behind the scenes',
      inject: [{ failure: 'stuck_porv_open', severity: 1.0 }],
      acc: { p: 'power_pct', op: '>', v: 9e9 } },
    { text: 'step 1 — the indicator fails, but only once safety injection is running',
      inject: [{ failure: 'porv_indicator_stuck_closed', when: { p: 'hpi_active', op: '>', v: 0.5 } }],
      acc: { p: 'power_pct', op: '>', v: 9e9 } },
    { text: 'step 2 — both are cleared',
      clear: ['stuck_porv_open', 'porv_indicator_stuck_closed'],
      acc: { p: 'power_pct', op: '>', v: 9e9 } },
    { text: 'step 3 — a narrative step', crew: true,
      story: { clock: '04:00:37', saw: 'Every alarm on the board.', knew: 'Feedwater had been lost.',
               did: 'They read the turbine trip and looked for the reason.' },
      acc: { p: 'power_pct', op: '>', v: 9e9 } },
  ],
});
var svc7 = mkService();
run(svc7, 3);
function failIds(snap) { return (snap && snap.active_failures || []).map(function (f) { return f.id || f; }); }
function inj(snap) { var cc = ckl(snap); return (cc && cc.injected) || []; }

/* COUNT WHAT DESCENDS, not what the plant ends up with. "Fires once" is a claim about the
 * commands the instructor issues, and an idempotent failure table would hide a re-injection
 * completely — the plant looks identical either way. */
/* ⚠ AND RE-ARM IT AFTER A REWIND. `scope:'full'` REBUILDS THE PLANT and M5 re-points
 * `instructor.below` at the new ControlFailureLayer, so a wrapper installed once is silently
 * gone the moment the thing it exists to measure happens — measured here: the re-entry check
 * read "0 new inject_failure" beside a plant that plainly had the failure back. A counter that
 * cannot count during the event it is watching is the #286 shape, one layer down. */
var injCount = 0, wrappedBelow = null;
function armInjectCounter() {
  var b = svc7.instructor.below;
  if (!b || b === wrappedBelow) return;
  wrappedBelow = b;
  var real = b.handleCommand.bind(b);
  b.handleCommand = function (cmd) {
    if (cmd && cmd.action === 'inject_failure') injCount++;
    return real(cmd);
  };
}
armInjectCounter();

var s7 = svc7.handleCommand({ action: 'start_checklist', procedure_id: 'zz_inject_probe' });
/* THE ENTRY TICK IS DELIBERATELY NOT THE FIRING TICK — see `_checklistFire`. The step's start
 * checkpoint is laid in this very assemble, AFTER the instructor steps, so firing on entry would
 * bake the failure into the checkpoint Rewind restores. This check pins that ordering. */
ck('nothing fires on the step\'s ENTRY tick (the checkpoint is laid in this same broadcast)',
   failIds(s7).indexOf('stuck_porv_open') === -1 && inj(s7).length === 0,
   'active [' + failIds(s7).join(',') + '], injected [' + inj(s7).join(',') + ']');
s7 = run(svc7, 3);
ck('(a) the step\'s `inject` fires behind the scenes — the failure is active on the plant',
   failIds(s7).indexOf('stuck_porv_open') >= 0, 'active_failures [' + failIds(s7).join(',') + ']');
ck('(a) ...and the checklist snapshot reports what THIS step injected',
   inj(s7).length === 1 && inj(s7)[0] === 'stuck_porv_open', 'injected [' + inj(s7).join(',') + ']');
// (c) once per step entry, not once per tick.
var countAfterFirst = injCount;
s7 = run(svc7, 50);
ck('(c) it fires ONCE — 50 further broadcasts issue no second inject_failure',
   injCount === countAfterFirst && countAfterFirst === 1, injCount + ' inject_failure commands in all');

/* (g) A SAVE TAKEN MID-STEP CARRIES THE FIRED-SET. This is the check that makes the two
 * `getState`/`loadState` lines load-bearing rather than decorative — and it exists because the
 * REWIND probe below could not see them: a rewind in this probe lands on the checklist's own
 * step-boundary checkpoints, and those are laid immediately AFTER `_checklistCheckOff` clears
 * the set, so they are empty either way. Measured: deleting `fired`/`injected` from `getState`
 * reddened nothing at all until this check existed.
 *
 * The consequence it pins is a player's, not a harness's: load a saved game in the middle of an
 * incident walkthrough and the step must not break the plant a second time. With an idempotent
 * failure table the PLANT looks identical, which is exactly why the command count is what is
 * asserted here — the #542 shape, where the reading that could tell the two apart was the one
 * nobody took. */
var saved7 = JSON.parse(JSON.stringify(svc7.saveState()));
(function () {
  var svc8 = mkService();
  run(svc8, 3);
  var ld = svc8.loadState(saved7);
  var b8 = svc8.instructor.below, n8 = 0;
  var real8 = b8.handleCommand.bind(b8);
  b8.handleCommand = function (cmd) { if (cmd && cmd.action === 'inject_failure') n8++; return real8(cmd); };
  var s8 = run(svc8, 6);
  var c8 = ckl(s8);
  ck('(g) a save restored mid-step does NOT fire the step\'s injection a second time',
     n8 === 0, n8 + ' inject_failure commands after the restore');
  ck('(g) ...and the restored card still reports what the step injected',
     !!c8 && (c8.injected || []).indexOf('stuck_porv_open') >= 0 && c8.step_index === 0,
     c8 ? 'injected [' + (c8.injected || []).join(',') + '] at idx ' + c8.step_index : 'no checklist');
  ck('(g) ...on a plant that still carries it (the failure survived the save, so a re-fire would be a duplicate)',
     failIds(s8).indexOf('stuck_porv_open') >= 0, 'active [' + failIds(s8).join(',') + ']');
  b8.handleCommand = real8;
})();

// (b) a `when`-gated entry waits for its predicate, not for the step.
svc7.handleCommand({ action: 'checklist_check', index: 0 });
s7 = run(svc7, 6);
ck('(b) a `when`-gated inject does NOT fire on step entry',
   failIds(s7).indexOf('porv_indicator_stuck_closed') === -1 && inj(s7).length === 0,
   'active [' + failIds(s7).join(',') + ']');
svc7.handleCommand({ action: 'set_hpi', active: true });
s7 = run(svc7, 3);
ck('(b) ...and fires on the first tick the predicate holds',
   failIds(s7).indexOf('porv_indicator_stuck_closed') >= 0 && inj(s7).indexOf('porv_indicator_stuck_closed') >= 0,
   'active [' + failIds(s7).join(',') + '], injected [' + inj(s7).join(',') + ']');

/* (d) REWIND. The whole reason the fired-set rides in the checkpoint: the plant comes back to the
 * start of the step, so the step has to be able to break it again. A fired-set kept outside the
 * checkpoint would leave the player looking at a walkthrough that says the PORV stuck open beside
 * a PORV that is shut. `steps: 2, exact` is what the board's Rewind button sends. */
var rw7 = svc7.handleCommand({ action: 'rewind', steps: 2, scope: 'full', exact: true });
var cr7 = ckl(rw7);
ck('(d) Rewind lands back at the start of step 0',
   rw7.type === 'state' && cr7 && cr7.step_index === 0, 'idx ' + (cr7 && cr7.step_index));
ck('(d) ...the plant comes back WITHOUT the injected failure, and the fired-set with it',
   failIds(rw7).indexOf('stuck_porv_open') === -1 && (cr7.injected || []).length === 0,
   'active [' + failIds(rw7).join(',') + '], injected [' + (cr7.injected || []).join(',') + ']');
armInjectCounter();     // the rewind rebuilt the plant — see the note on the counter
var beforeRe = injCount;
s7 = run(svc7, 3);
ck('(d) ...and re-entering the step fires it again',
   failIds(s7).indexOf('stuck_porv_open') >= 0 && injCount === beforeRe + 1,
   'active [' + failIds(s7).join(',') + '], ' + (injCount - beforeRe) + ' new inject_failure');

// (e) `clear` takes it back off. Walk to step 2 — the rewind put us back at step 0.
svc7.handleCommand({ action: 'checklist_check', index: 0 });
run(svc7, 2);
svc7.handleCommand({ action: 'checklist_check', index: 1 });
s7 = run(svc7, 4);
ck('(e) a step\'s `clear` removes the failures it names',
   failIds(s7).indexOf('stuck_porv_open') === -1 && failIds(s7).indexOf('porv_indicator_stuck_closed') === -1,
   'active [' + failIds(s7).join(',') + ']');
ck('(e) ...and a cleared id is NOT reported as injected by this step',
   inj(s7).length === 0, 'injected [' + inj(s7).join(',') + ']');

// (f) the narrative block reaches the snapshot.
svc7.handleCommand({ action: 'checklist_check', index: 2 });
s7 = run(svc7, 2);
var c7 = ckl(s7);
ck('(f) a `story` step ships clock/saw/knew/did in the checklist snapshot',
   !!(c7 && c7.story) && c7.story.clock === '04:00:37' &&
   /alarm/i.test(c7.story.saw || '') && !!c7.story.knew && !!c7.story.did,
   c7 && c7.story ? JSON.stringify(c7.story).slice(0, 80) : String(c7 && c7.story));
ck('(f) ...and `crew: true`, the tag that says the step is history rather than advice',
   c7 && c7.crew === true, c7 && String(c7.crew));
/* THE SIX SHIPPED LEGS AUTHOR NONE OF THIS, and that claim is worth a check rather than a
 * sentence: it is what makes "nothing changes for the existing walkthroughs" measurable instead
 * of inherited. Read off the built pool, both plants. */
(function () {
  var n = 0, withStory = 0;
  ['pwr', 'pwr2'].forEach(function (k) {
    (RD.MANUAL_PROCEDURES[k] || []).forEach(function (p) {
      if (/^zz_|^__/.test(p.id)) return;
      (p.steps || []).forEach(function (st) {
        if (st.inject || st.clear) n++;
        if (st.story || st.crew) withStory++;
      });
    });
  });
  ck('the shipped pools author no inject/clear/story yet — Phase 1 is runtime only',
     n === 0 && withStory === 0, n + ' steps with inject/clear, ' + withStory + ' with story/crew');
})();
svc7.handleCommand({ action: 'stop_checklist' });

// ---------------------------------------------------------------- summary
console.log('\n' + B + '──────────' + X);
var ok = passed === total;
console.log(B + 'Checklists: ' + (ok ? G : R) + passed + '/' + total + X);
process.exit(ok ? 0 : 1);
