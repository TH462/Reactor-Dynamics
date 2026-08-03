/*
 * test/run_reachability.js — CAN THE PLANT ACTUALLY REACH ITS OWN SETPOINTS?
 *
 * WHY THIS EXISTS (2026-07-30, from the #249 / #273 pair)
 * ------------------------------------------------------
 * `pwr_mode3_to_mode5` asserted "arrived UNscrammed" and passed for months. It passed
 * because the by-the-book cooldown dumped all four accumulators, overfilled the RCS to
 * the `mass_max` clip — and indicated pressurizer level *physically could not reach its
 * own 97 % high-level trip*, because `level_prog_floor` (28) plus a clipped surplus term
 * pinned it at exactly 88.00 %. The check was not wrong. It was VACUOUS: an assertion
 * that a trip never fired is worth exactly what the gauge can reach.
 *
 * That is not a one-off shape. Every "never scrammed" / "no alarm" / "stayed clear of"
 * assertion in this repo carries the same hidden premise, and nothing checked it. This
 * runner checks it.
 *
 * TWO PARTS, deliberately different in kind:
 *
 *   A. STATIC — every protection/actuation/alarm setpoint must lie STRICTLY inside its
 *      instrument's declared `range`. `control_kernel.crossed()` is strict (`>` / `<`),
 *      so a setpoint sitting ON a range edge can never fire. This is the C1 lesson
 *      (`power_range` widened to [0,200] for exactly this) turned into a gate instead of
 *      a paragraph in the tuning log. Cheap, total coverage, no plant stepped.
 *
 *   B. DYNAMIC — for the claims where "it can't get there" is a real modelling risk,
 *      DRIVE the plant and watch the INDICATED channel cross. Static range checks would
 *      never have caught #249: pzr_level's range is [0,100] and the setpoint is 97, so
 *      part A is perfectly happy. Only stepping the plant finds a clamp.
 *
 * Part B is the expensive half and is deliberately SMALL. It is not "test everything
 * again" — it is the short list of thresholds whose unreachability would silently
 * hollow out an existing gate. Add to it when you write a "never tripped" assertion.
 *
 * PWR only. RBMK/BWR are on hold; their tables are not audited here.
 */
'use strict';

require('../engines/load_mode.js');
['engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js',
 'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js',
 'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
 'layers/control/control_kernel.js', 'layers/instructor_layer.js', 'layers/simulation_service.js'
].forEach(function (f) { require('../' + f); });
var RD = globalThis.RD;

var G = '\x1b[32m', R = '\x1b[31m', D = '\x1b[2m', B = '\x1b[1m', X = '\x1b[0m';
var checks = 0, failed = 0;
function ck(name, observed, ok, expected) {
  checks++;
  if (ok) { console.log('  ' + G + 'PASS' + X + '  ' + name + D + '  [' + observed + ']' + X); }
  else { failed++; console.log('  ' + R + 'FAIL' + X + '  ' + name + D + '  [expected ' + expected + ', observed ' + observed + ']' + X); }
}

// ---------------------------------------------------------------- Part A — static
console.log('\n' + B + 'A. Setpoint inside the instrument range (static)' + X);
console.log(D + '  crossed() is strict, so a setpoint ON a range edge can never fire.' + X);

var INS = RD.PWR_CONFIG.instruments || {};
var P = RD.PWR_PROTECTION;
var rows = []
  .concat((P.trips || []).map(function (t) { return { kind: 'trip', id: t.id || t.action, r: t }; }))
  .concat((P.actuations || []).map(function (a) { return { kind: 'actuation', id: a.id || a.system, r: a }; }))
  .concat((P.alarms || []).map(function (a) { return { kind: 'alarm', id: a.id, r: a }; }));

var audited = 0, skipped = [];
rows.forEach(function (row) {
  var r = row.r;
  // Boolean/status signals carry no threshold, and a derived signal (subcooling_margin)
  // has no declared range — neither can be range-checked, and saying so beats a silent pass.
  if (r.direction === 'is_true' || r.setpoint == null) return;
  var spec = INS[r.instrument];
  if (!spec || !spec.range) { skipped.push(row.kind + ' ' + row.id + ' → ' + r.instrument); return; }
  audited++;
  var lo = spec.range[0], hi = spec.range[1];
  var reachable = (r.direction === 'high') ? (r.setpoint < hi) : (r.setpoint > lo);
  ck(row.kind + ' ' + row.id + ' (' + r.instrument + ' ' + r.direction + ' ' + r.setpoint + ')',
    'range [' + lo + ', ' + hi + ']', reachable,
    r.direction === 'high' ? 'setpoint < ' + hi : 'setpoint > ' + lo);
});
ck('audited a meaningful number of thresholds', audited + ' thresholds', audited >= 30, '>= 30');
if (skipped.length) {
  console.log(D + '  no declared range (not range-checkable): ' + skipped.join(', ') + X);
}

// ---------------------------------------------------------------- Part B — dynamic
console.log('\n' + B + 'B. The plant can actually drive the channel there (dynamic, full stack)' + X);

function stack(ic) {
  var svc = new RD.SimulationService({ seed: 4242 });
  svc.selectPlant('pwr', ic || 'hot_full_power');
  svc.running = true; svc.timeAcceleration = 1; svc.attentionStops = false;
  return svc;
}
// Peak INDICATED value of `field` over `ticks`, driving whatever `each` does.
function peakIndicated(svc, field, ticks, each) {
  var peak = -Infinity, trough = Infinity;
  for (var i = 0; i < ticks; i++) {
    if (each) each(svc, i);
    svc.tick();
    var v = (svc.assembleSnapshot().instruments || {})[field];
    if (v != null) { if (v > peak) peak = v; if (v < trough) trough = v; }
  }
  return { peak: peak, trough: trough };
}

// B1 — THE #249 REGRESSION FENCE. Emergency injection into an intact RCS must be able to
// take the pressurizer SOLID, and therefore past the 97 % high-level trip. This is the
// check that was missing: it fails on the pre-#249 `level_per_mass_surplus` of 300
// (measured peak 88.00 %) and passes at the fitted 776. Verified by injection both ways.
// It is deliberately written against the INDICATED channel, because that is what the trip
// and the operator read (HR1) — truth reaching 100 % would not save the assertion.
var hiSp = null;
(P.trips || []).forEach(function (t) { if (t.instrument === 'pzr_level' && t.direction === 'high') hiSp = t.setpoint; });
ck('the pzr high-level trip setpoint is still where this probe thinks it is',
  hiSp == null ? 'not found' : hiSp + ' %', hiSp != null, 'a pzr_level high trip exists');

var svc1 = stack('hot_full_power');
var r1 = peakIndicated(svc1, 'pzr_level', 1500, function (s, i) {
  if (i === 10) s.handleCommand({ action: 'set_hpi', active: true });
});
ck('B1 — injection can take the pressurizer SOLID (indicated level reaches 100 %)',
  'peak ' + r1.peak.toFixed(2) + ' %', r1.peak >= 99.5, '>= 99.5 %');
ck('B1 — …and therefore PAST the ' + hiSp + ' % high-level trip, so "no high-level trip" means something',
  'peak ' + r1.peak.toFixed(2) + ' % vs setpoint ' + hiSp, hiSp != null && r1.peak > hiSp, '> ' + hiSp + ' %');

// B2 — the other end of the same channel: the 12 % pzr lo-lo scram.
//
// NOTE THE DRIVER, because the first draft of this probe got it wrong and the failure was
// informative. Draining with both letdown orifices CANNOT reach 12 % — measured, it stalls
// at 29.6 % — and that is CORRECT: `pwr_control.js:208` isolates letdown at 17 % precisely
// so it "shuts before the 12 % pzr-level reactor trip, arresting the drop". A reachability
// probe has to name the mechanism it expects to get there by, or it just re-discovers an
// interlock and calls it a defect. The mechanism that legitimately reaches this trip is an
// unisolable INVENTORY LOSS, so drive it with a break.
var svc2 = stack('hot_full_power');
var r2 = peakIndicated(svc2, 'pzr_level', 2000, function (s, i) {
  if (i === 10) s.handleCommand({ action: 'inject_failure', failure_id: 'large_loca', severity: 6 });
});
var loSp = null;
(P.trips || []).forEach(function (t) { if (t.instrument === 'pzr_level' && t.direction === 'low') loSp = t.setpoint; });
ck('B2 — an inventory loss can reach the ' + loSp + ' % pzr lo-lo scram',
  'trough ' + r2.trough.toFixed(2) + ' %', loSp != null && r2.trough < loSp, '< ' + loSp + ' %');

// B3 — THE ONE INVERTED CASE. Every other check here asserts a channel CAN reach its
// setpoint. This one asserts the opposite, on purpose, and it is a DEPARTURE FENCE rather
// than a reachability proof (#307, ruled 2026-08-03; declared at DESIGN_COMPANION §8.23).
//
// The 1980 rpm overspeed trip is UNREACHABLE on this plant and that is deliberate, because
// there is no turbine roll model. Measured 2026-08-03, peak TRUE rpm: 1800.00 on line in
// follow, 1800.00 in manual with a 2x-rated MWe ask, 1799.10 with the MSIVs shut and the
// breaker closed. The sync branch is `rpm += (rated - rpm)/sync_tau * dt` — monotone toward
// rated for dt < 2*sync_tau, so it cannot overshoot — and the off-line branch cannot start
// the rotor from rest at all (the `if (rpm < 1) rpm = 0` floor needs > 50 rpm/s at the
// shipped 0.02 s PHYSICS_DT, i.e. > 2500x rated admission; the first admission that clears
// it settles at 2000 rpm, past this very trip).
//
// Part A is happy — 1980 sits strictly inside turbine_rpm's [0, 2000] range — which is
// exactly the hollow-assertion shape this runner exists for, one instrument short of its
// own coverage.
//
// SO THIS CHECK IS WRITTEN TO GO RED WHEN THE PLANT GETS BETTER. Build the roll model
// (#307 / #238) and the rotor can pass 1980; this fails, and whoever built it must retire
// §8.23 rather than absorb the change silently. That is the §8.17 pattern — a departure is
// closed by fixing the gap, not by justifying it. Symmetric drift, same as BASELINES.
var ospSp = null;
(P.actuations || []).forEach(function (a) {
  if (a.instrument === 'turbine_rpm' && a.direction === 'high') ospSp = a.setpoint;
});
ck('the turbine overspeed setpoint is still where this probe thinks it is',
  ospSp == null ? 'not found' : ospSp + ' RPM', ospSp != null, 'a turbine_rpm high actuation exists');

var ratedRpm = (RD.PWR_CONFIG.turbine || {}).rpm_rated || 1800;
var svc3 = stack('hot_full_power');
var r3 = peakIndicated(svc3, 'turbine_rpm', 900, function (s, i) {
  // The hardest drivers measured: an above-rated load ask, then steam cut with the breaker
  // still closed. Neither can spin the machine past what the grid holds it at.
  if (i === 10) { s.handleCommand({ action: 'set_load_mode', mode: 'manual' }); }
  if (i === 20) { s.handleCommand({ action: 'set_load_target', mwe: 2 * (RD.PWR_CONFIG.turbine.mwe_rated || 100) }); }
  if (i === 500) { s.handleCommand({ action: 'close_msiv' }); }
});
ck('B3 — the ' + ospSp + ' RPM overspeed trip is UNREACHABLE (declared: no roll model, §8.23)',
  'peak indicated ' + r3.peak.toFixed(2) + ' RPM', ospSp != null && r3.peak < ospSp, '< ' + ospSp + ' RPM');
ck('B3 — …because the grid pins the rotor at rated, so nothing on line can overshoot it',
  'peak ' + r3.peak.toFixed(2) + ' vs rated ' + ratedRpm, r3.peak < ratedRpm * 1.02, '< rated + 2 %');

// ---------------------------------------------------------------- tally
// Tally line matches the run_reactivity / run_contract convention so run_all's score
// parser reads it ("N checks passed / M failed"), not a shape of my own invention.
console.log('\n' + B + '──────────────────────────────────────────' + X);
console.log(B + (failed ? R : G) + (checks - failed) + ' checks passed / ' + failed + ' failed' + X + '\n');
process.exit(failed ? 1 : 0);
