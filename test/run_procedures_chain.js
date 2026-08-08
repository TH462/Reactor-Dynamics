/*
 * test/run_procedures_chain.js — the CONTINUOUS operating day (#395/#396).
 *
 * WHY THIS EXISTS. Both procedure gates reload each procedure's `from:` IC before
 * replaying it (run_procedures.js:77, run_procedures_stack.js via the harness), so
 * neither can see what happens when procedures run in sequence on ONE plant — and
 * that blindness is measured, not hypothetical: audit #344 ran the six Tier B
 * evolutions continuously and every one "completed" on a reactor that never went
 * critical, because the heatup→startup seam (#396) starves the startup of the
 * boron its steps assume. The heatup preserves cold-shutdown boron (~857 ppm);
 * the startup is authored at the estimated critical condition (~683 ppm), where
 * criticality sits at ~319 steps instead of ~561. The bank stops 215 steps short,
 * nothing measures how far it got, and the two at-power trip-block steps are
 * refused with the plant below P-10 — refusals the reloading gates never see
 * because the reloaded leg produces none.
 *
 * WHAT THIS GATE ASSERTS — the day, done the documented way, WORKS:
 *   1. pwr_heatup replays green on the chain (same checks as the stack gate) and
 *      arrives Mode 3 still at cold-shutdown boron — the seam's premise, pinned.
 *   2. The #395 precondition machinery SEES the seam: starting the startup
 *      checklist on the un-remedied plant flags exactly the boron row (UNMET),
 *      with the Mode-3 rows MET — the discriminating signature — and the
 *      instructor comment is raised.
 *   3. The documented remedy (PWR-N02 step 15: dilute to the ECC, ~683 ppm, via
 *      the boron_conc channel target — the board's actual boron surface) is
 *      performed and ARRIVES within its measured budget (~58 plant-min at
 *      ~3 ppm/min).
 *   4. After the remedy the same probe reads ALL rows MET and no comment.
 *   5. pwr_startup then replays green ON THE CONTINUOUS PLANT — zero refusals
 *      (the trip blocks are ACCEPTED, closing #396's two), no unexpected scram,
 *      every authored acc — and the day ends critical and at power (> 5 %, the
 *      Mode 1 boundary).
 *
 * DELIBERATELY NOT CHAINED: raise/lower/shutdown/cooldown. Their acc values are
 * authored against their own ICs (raise_power assumes ~50 % and no procedure
 * bridges the startup's ~10 % arrival to it — the known Tier B content gap,
 * #344 SUBJECTS TO TEST 9 / #319). Chaining them here would mean AUTHORING new
 * content inside a gate. Their entry mismatch is what the #395 preconditions now
 * surface at runtime, and run_checklist.js section 8 pins that machinery.
 *
 * INJECTION-VERIFIED at authoring time (2026-08-06, both re-runnable by hand):
 *   - dilution SKIPPED (DIL_BUDGET 0) → MEASURED 15 checks red, 35/50 —
 *     reproducing #396's exact signature: probe B reads yyyn (the boron row
 *     still unmet), the SR count curve stalls (195…293 cps against the 550…3500
 *     acc ladder — the bank stops short of criticality), power 0.000 %,
 *     plant_mode 3, and the two step-14/15 `set_trip_block` refusals with the
 *     issue's verbatim message ("the plant is not in the condition that allows
 *     this trip to be blocked").
 *   - precondition evaluation NEUTERED (the run_checklist injection, in
 *     _stepChecklist) → MEASURED 5 checks red, 45/50 — both seam probes go dark
 *     (verdicts null) while the plant itself still runs the day green.
 *
 *   node test/run_procedures_chain.js
 */
'use strict';
var C = '\x1b[36m', G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';

require('../engines/load_mode.js');
['engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js',
 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js', 'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
 'layers/control/control_kernel.js', 'layers/instructor_layer.js', 'layers/simulation_service.js'
].forEach(function (f) { require('../' + f); });
require('../ui/manual_procedures.js');
require('./procedures_harness.js');
var RD = globalThis.RD;
var PH = RD.ProceduresHarness;

var SEED = Number(process.env.RD_SEED) || 42;
var total = 0, passed = 0;
function ck(desc, pass, obs) {
  total++;
  if (pass) { passed++; console.log(G + '  ✓' + X + ' ' + desc + D + '  (' + obs + ')' + X); }
  else console.log(R + '  ✗ ' + desc + X + D + '  (' + obs + ')' + X);
}
function head(t) { console.log('\n' + B + C + t + X); }
function proc(id) { return RD.MANUAL_PROCEDURES.pwr.filter(function (x) { return x.id === id; })[0]; }
function reportChecks(r) {
  r.checks.forEach(function (c) {
    var obs = typeof c.obs === 'number' ? Math.round(c.obs * 100) / 100 : c.obs;
    ck(c.d, c.pass, obs);
  });
}

console.log(B + 'Continuous-chain procedure gate' + X + D + '  (one plant, free-play lineup, ' + PH.ACCEL + '× accel, seed ' + SEED + ')' + X);

// ---- one service for the whole day — the point of the runner ----
var svc = new RD.SimulationService({ seed: SEED });
svc.selectPlant('pwr', 'cold_shutdown', null, undefined);
svc.running = true;
svc.timeAcceleration = PH.ACCEL;
svc.attentionStops = false;   // headless gate — see the harness note (#245)

head('1. pwr_heatup on the chain (Mode 5 → Mode 3, ~12.3 plant-hours — #419 real rates)');
var rHeat = PH.runProcedure('pwr', proc('pwr_heatup'), { svc: svc });
reportChecks(rHeat);
var ts = rHeat.lastSnap.true_state;
ck('chain: arrived Mode 3 hot (Tavg ≈ 286 °C — the Ginna anchor, #419 wave 3)', Math.abs(ts.tavg_c - 286) < 8, ts.tavg_c.toFixed(1) + ' °C');
ck('chain: heatup preserves cold-shutdown boron — the #396 premise', ts.boron_ppm > 850 && ts.boron_ppm < 865, ts.boron_ppm.toFixed(1) + ' ppm');

head('2. Seam probe — the startup checklist flags the boron row (#395 machinery)');
var snap = svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_startup' });
var pcA = snap && snap.instructor && snap.instructor.checklist && snap.instructor.checklist.preconditions;
function row(pv, i) { return (pv && pv[i]) || {}; }
ck('probe A: 4 verdicts shipped', !!(pcA && pcA.length === 4), pcA && pcA.length);
ck('probe A: boron seam row UNMET at ~857 ppm', row(pcA, 3).met === false && Math.abs(row(pcA, 3).obs - 857) < 15,
  'obs ' + (row(pcA, 3).obs != null ? (+row(pcA, 3).obs).toFixed(1) : '—'));
ck('probe A: the Mode-3 rows are MET — exactly the seam is named',
  row(pcA, 0).met === true && row(pcA, 1).met === true && row(pcA, 2).met === true,
  'tavg/pressure/power all met');
ck('probe A: instructor comment raised', !!(snap.instructor && snap.instructor.message), 'raised');
svc.handleCommand({ action: 'stop_checklist' });

// 683 → 705 at #419 wave 3: the Ginna anchor + decoupled rho_excess put the estimated
// critical condition at ≈ 705 ppm (criticality back at ~step 319). Diluting to the old
// 683 on the new anchor overshoots criticality by ~22 ppm and the SR high-flux trip
// scrams the approach — measured, the first gate run after the re-anchor did exactly that.
head('3. The documented remedy — PWR-N02 step 15, dilute to the ECC (~705 ppm)');
var rem = svc.handleCommand({ action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 705 });
ck('remedy command accepted (boron_conc target — the board\'s boron surface)', !PH.refusal(rem), PH.refusal(rem) || 'accepted');
// ~58 plant-min at ~3 ppm/min measured (Manuals/04 PWR-N02); budget 90 plant-min.
var dilTicks = 0, DIL_BUDGET = 5400;
while (dilTicks < DIL_BUDGET) {
  var s = svc.tick(); dilTicks++;
  if (s && s.true_state.boron_ppm <= 712) break;
}
ts = svc.engine.getTrueState();
ck('dilution arrives at the ~705 ppm ECC inside the 90 plant-min budget', ts.boron_ppm <= 712 && dilTicks < DIL_BUDGET,
  ts.boron_ppm.toFixed(1) + ' ppm after ' + (dilTicks / 60).toFixed(1) + ' plant-min');
// Let the batch dose finish settling on the target before the probe re-reads it.
for (var i = 0; i < 120; i++) svc.tick();

head('4. Seam probe again — remedied, every row reads MET');
snap = svc.handleCommand({ action: 'start_checklist', procedure_id: 'pwr_startup' });
var pcB = snap && snap.instructor && snap.instructor.checklist && snap.instructor.checklist.preconditions;
var allMet = !!(pcB && pcB.length === 4 && pcB.every(function (p) { return p.met; }));
ck('probe B: all 4 rows MET after the remedy', allMet,
  pcB ? pcB.map(function (p) { return p.met ? 'y' : 'n'; }).join('') : 'none');
ck('probe B: no instructor comment', !(snap.instructor && snap.instructor.message),
  (snap.instructor && snap.instructor.message) ? 'raised' : 'none');
svc.handleCommand({ action: 'stop_checklist' });

head('5. pwr_startup on the continuous plant — the day goes critical');
var rStart = PH.runProcedure('pwr', proc('pwr_startup'), { svc: svc });
reportChecks(rStart);
ts = rStart.lastSnap.true_state;
ck('chain: the day ends critical and AT POWER (> 5 %, the Mode 1 boundary)', ts.power_pct > 5, ts.power_pct.toFixed(2) + ' %');

// ---------------------------------------------------------------- summary
console.log('\n' + B + '──────────' + X);
var ok = passed === total;
console.log(B + 'Procedures (chain): ' + (ok ? G : R) + passed + '/' + total + X +
  D + '   (' + (svc.simTime / 3600).toFixed(1) + ' plant-hours on one plant)' + X);
process.exit(ok ? 0 : 1);
