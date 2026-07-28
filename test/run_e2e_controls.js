/* Targeted E2E control verification — drives the real SimulationService stack
 * for recently-added operator controls per plant. Complements engine suites.
 *   node test/run_e2e_controls.js */
'use strict';
var path = require('path');
function load(p) { require(path.join(__dirname, '..', p)); }
[
  'engines/load_mode.js',
  'engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js',
  'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js',
  'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
  'layers/control/rbmk_control.js', 'engines/rbmk/rbmk_config.js', 'engines/rbmk/rbmk_kinetics.js',
  'engines/rbmk/rbmk_thermal.js', 'engines/rbmk/rbmk_rods.js', 'engines/rbmk/rbmk_instruments.js',
  'engines/rbmk/rbmk_engine.js',
  'engines/bwr/bwr_config.js', 'layers/control/bwr_control.js', 'engines/bwr/bwr_vessel.js',
  'engines/bwr/bwr_recirculation.js', 'engines/bwr/bwr_safety_systems.js', 'engines/bwr/bwr_instruments.js',
  'engines/bwr/bwr_engine.js',
  'layers/control/control_kernel.js', 'layers/instructor_layer.js', 'layers/simulation_service.js',
].forEach(load);
var RD = globalThis.RD;

var G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', X = '\x1b[0m';
var pass = 0, fail = 0;

function svc(plant, init, dv) {
  var s = new RD.SimulationService({ seed: 42 });
  s.selectPlant(plant, init, dv || null);
  return s;
}
function step(s, n) { for (var i = 0; i < (n || 50); i++) s.advanceCycles(1); }
function ck(desc, ok, obs, exp) {
  if (ok) { pass++; console.log(G + '  ✓' + X + ' ' + desc + ' (' + obs + ')'); }
  else { fail++; console.log(R + '  ✗' + X + ' ' + desc + ' [expected ' + exp + ', got ' + obs + ']'); }
}
function rodSteps(s) {
  return s.assembleSnapshot().control_state.rod_groups.filter(function (g) { return g.function === 'control'; })[0].steps;
}

console.log(B + 'PWR — recently-added controls' + X);
(function () {
  var s = svc('pwr', 'hot_full_power');
  var before = rodSteps(s);
  s.handleCommand({ action: 'scram' });
  step(s, 300);
  var after = rodSteps(s);
  ck('linear scram drives control rods to 0 steps', after === 0, after, 0);

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'set_heater', power_pct: 80 });
  step(s, 20);
  var heatPct = s.engine.s.heater_power_frac * 100;
  ck('PZR heater manual set reaches engine', heatPct >= 75, heatPct.toFixed(0), '>=75');

  // Spray has an owner-ruled FLOW CAP (CC-5, catalog v3 FG-6 / feel-plan P5):
  // pwr_config pressurizer.spray_flow_max, applied in pwr_pressurizer to the auto
  // demand AND the operator override alike. So a 50 % ask CANNOT reach 50 %.
  // This check used to assert ">= 45" and had been red ever since the cap landed —
  // read as a plumbing regression, but the command was arriving perfectly and
  // being clamped exactly as designed. Assert both halves instead: an ask below
  // the cap arrives untouched, and an ask above it is clamped to the cap.
  var sprayCap = RD.PWR_CONFIG.pressurizer.spray_flow_max * 100;
  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'set_spray', pct: sprayCap / 2 });
  step(s, 20);
  var sprayLo = s.engine.s.spray_flow_frac * 100;
  ck('PZR spray manual set below the cap reaches engine untouched',
    Math.abs(sprayLo - sprayCap / 2) < 0.5, sprayLo.toFixed(1), (sprayCap / 2).toFixed(1));

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'set_spray', pct: 50 });
  step(s, 20);
  var sprayPct = s.engine.s.spray_flow_frac * 100;
  ck('PZR spray manual set above the cap is clamped to it (CC-5)',
    Math.abs(sprayPct - sprayCap) < 0.5, sprayPct.toFixed(1), sprayCap.toFixed(1) + ' (cap)');

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'open_porv' });
  step(s, 10);
  ck('manual PORV open command', s.engine.s.porv_demand === 'open', s.engine.s.porv_demand, 'open');

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'close_block_valve' });
  ck('PORV block valve isolate', !s.engine.s.block_valve_open, s.engine.s.block_valve_open, false);

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'set_rhr', active: true });   // interlocked shut at operating pressure
  ck('RHR valve interlocked shut above 400 psi', s.engine.s.rhr_active === false, s.engine.s.rhr_active, false);

  s = svc('pwr', 'hot_full_power');
  s.engine.s.pressure_mpa = 2.0;                          // below the 400 psi (2.76 MPa) interlock
  s.handleCommand({ action: 'set_rhr', active: true });
  ck('RHR valve opens below interlock', s.engine.s.rhr_active === true, s.engine.s.rhr_active, true);
  ck('RHR valve-open flag set below interlock', s.engine.s.rhr_valve_open === true, s.engine.s.rhr_valve_open, true);

  s = svc('pwr', 'hot_full_power');
  s.engine.s.pressure_mpa = 2.0;
  s.handleCommand({ action: 'set_dhr', active: true });   // one-release alias → opens RHR valve
  ck('set_dhr alias still aligns RHR', s.engine.s.rhr_active === true, s.engine.s.rhr_active, true);

  s = svc('pwr', 'hot_full_power');
  s.engine.s.pressure_mpa = 2.0;
  s.handleCommand({ action: 'set_rhr_hx', pct: 40 });     // HX flow split (cooldown-rate throttle)
  ck('set_rhr_hx sets the HX flow split', Math.abs(s.engine.s.rhr_hx_fraction - 0.4) < 1e-9, s.engine.s.rhr_hx_fraction, 0.4);

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'set_lpi', active: true });   // deprecated alias → merged HPI/LPI
  ck('set_lpi alias drives the merged HPI/LPI system', s.engine.s.hpi_active === true, s.engine.s.hpi_active, true);

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'set_charging_pump', running: false });
  ck('charging pump off', s.engine.s.charging_pump_running === false, s.engine.s.charging_pump_running, false);

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'set_charging_pump', running: true });
  ck('charging pump on', s.engine.s.charging_pump_running === true, s.engine.s.charging_pump_running, true);

  s = svc('pwr', 'hot_full_power');
  var boron0 = s.engine.s.boron_ppm;
  s.handleCommand({ action: 'set_boron_adjust', rate: 5 });
  step(s, 50);
  ck('borate raises boron ppm (charging pump on)', s.engine.s.boron_ppm > boron0, s.engine.s.boron_ppm.toFixed(0), '>' + boron0.toFixed(0));

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'set_charging_pump', running: false });
  var boronOff = s.engine.s.boron_ppm;
  s.handleCommand({ action: 'set_boron_adjust', rate: 5 });
  step(s, 50);
  ck('borate inert with charging pump off', s.engine.s.boron_ppm === boronOff, s.engine.s.boron_ppm.toFixed(0), boronOff.toFixed(0));

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'set_charging_flow', normalized: 0.05 });
  ck('charging flow set', s.engine.s.charging_flow >= 0.04, s.engine.s.charging_flow.toFixed(3), '>=0.04');

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'set_letdown_orifices', a: true, b: false });
  step(s, 20);
  ck('letdown orifice A → pressure-driven flow', s.engine.s.letdown_flow >= 0.02, s.engine.s.letdown_flow.toFixed(3), '>=0.02');

  // §8.8 CVCS AUTO make-up vs a leak — DIFFERENTIAL, not an absolute band.
  //
  // This asserted "inventory holds >= inv0 - 2" against a severity-1.0 SGTR and had
  // been red for weeks. Two things were wrong with it, and the second is the worse:
  //
  //  1. It is not physical. Measured over the 400 s window, a severity-1.0 SGTR takes
  //     inventory 100 % -> 5.6 %. Make-up slows that by ~1.7 points; nothing "holds"
  //     it. (The old comment's "loses ~10 % over the window" was an order of magnitude
  //     out — 0.0024/s x 400 s is ~96 %.)
  //  2. It did not test the control. CVCS auto is ON in the free-play lineup, so
  //     `set_cvcs_auto {active:true}` was a no-op: the check behaved identically
  //     whether or not the command did anything at all.
  //
  // What is actually worth pinning here — this suite is control plumbing, not physics
  // tuning — is that the command MOVES the plant, in both directions, and that make-up
  // measurably slows the loss. Severity 0.2 gives the cleanest signal: charging is
  // saturated at its maximum, so the delta does not depend on servo gain.
  //
  // Letdown (the free-play Orifice A preset) is closed first so charging balances the
  // LEAK alone rather than leak + letdown make-up.
  function sgtrRun(cvcsAuto, severity) {
    var t = svc('pwr', 'hot_full_power');
    t.handleCommand({ action: 'set_letdown_orifices', a: false, b: false });
    t.handleCommand({ action: 'set_cvcs_auto', active: cvcsAuto });
    t.handleCommand({ action: 'inject_failure', failure_id: 'sgtr', severity: severity });
    step(t, 400);
    // AVERAGE the servo output over a window; do NOT sample it once at step 400.
    // charging_flow is driven by a filtered error on the INDICATED pzr level, so it carries
    // the level instrument's noise. A single sample was only ever the mean because the noise
    // was WHITE and the servo's 20 s filter annihilated it; once instrument noise became
    // physically correlated (#233) a single sample stopped being representative and this
    // check swung between 4 % and 14 % coverage on identical plants. Averaging measures the
    // quantity the assertions are actually about — and it is the stricter test under BOTH
    // noise models, which is why it is the right fixture rather than a workaround.
    var nAvg = 120, chgSum = 0, leakSum = 0;
    for (var q = 0; q < nAvg; q++) {
      step(t, 1);
      chgSum += t.engine.s.charging_flow || 0;
      leakSum += t.engine.s.leak_flow || 0;
    }
    return {
      svc: t, inv: t.engine.s.core_inventory_pct,
      chg: chgSum / nAvg, leak: leakSum / nAvg,
    };
  }
  var cvcsOn = sgtrRun(true, 0.2), cvcsOff = sgtrRun(false, 0.2);
  // The OFF leg is the one that discriminates: because the free-play lineup already
  // has CVCS auto ON, only turning it OFF can prove the command reaches the kernel.
  // Keep both legs — ON alone would pass against a no-op, which is the trap the
  // previous version of this check fell into.
  ck('set_cvcs_auto OFF stops automatic charging', cvcsOff.chg === 0, cvcsOff.chg.toFixed(4), '0');
  ck('set_cvcs_auto ON commands charging', cvcsOn.chg > 0, cvcsOn.chg.toFixed(4), '>0');
  ck('CVCS auto measurably slows the inventory loss',
    cvcsOn.inv > cvcsOff.inv + 1, cvcsOn.inv.toFixed(2) + ' vs ' + cvcsOff.inv.toFixed(2),
    'ON > OFF + 1');
  // ...and at a leak small enough to be inside its authority the servo MODULATES
  // rather than sitting on its stop — otherwise "auto" would just be a fixed pump.
  var small = sgtrRun(true, 0.008);
  ck('CVCS auto modulates below saturation on a small leak',
    small.chg > 0 && small.chg < cvcsOn.chg * 0.9, small.chg.toFixed(5),
    '0 < chg < ' + (cvcsOn.chg * 0.9).toFixed(5));
  // PROPORTIONAL DROOP. While unsaturated the servo's make-up scales with the leak
  // and covers a consistent FRACTION of it — it does not match it, because there is
  // no integral term, which is why a leak parks pzr level below setpoint (the droop
  // is quantified in pwr_config reactivity, ~2 % for a 2.4e-4 leak).
  //
  // This replaces a check that asserted charging_flow was 0.5x..3x leak_flow. Those
  // are DIFFERENT SCALES: charging enters the mass balance through
  // cvcs_inventory_gain (0.012) while the leak is 1:1 (pwr_primary.js:202). It was
  // comparing incommensurable numbers and passed only by coincidence at severity 1.0,
  // where charging sits at 2.6x the leak while pinned at its maximum. Compared in
  // mass terms, coverage is ~24 % across the whole unsaturated range — see #194.
  var gain = RD.PWR_CONFIG.reactivity.cvcs_inventory_gain;
  var leakA = sgtrRun(true, 0.004), leakB = sgtrRun(true, 0.008);
  var covA = leakA.chg * gain / leakA.leak, covB = leakB.chg * gain / leakB.leak;
  ck('CVCS make-up scales with the leak (proportional servo)',
    leakB.chg > leakA.chg * 1.8 && leakB.chg < leakA.chg * 2.2,
    leakA.chg.toFixed(5) + ' -> ' + leakB.chg.toFixed(5) + ' on a 2x leak', '~2x');
  ck('CVCS covers a consistent fraction of the leak, not all of it (droop)',
    Math.abs(covA - covB) < 0.03 && covA > 0.1 && covA < 0.5,
    (covA * 100).toFixed(0) + '% / ' + (covB * 100).toFixed(0) + '%', 'equal, 10..50%');

  // The charging_flow INDICATION reads the true modulated flow, not the operator
  // setpoint — the two are distinct snapshot fields for the UI. Average a few
  // samples to see past the instrument noise (σ 0.001 ≈ the signal here).
  s = cvcsOn.svc;
  var snap = s.assembleSnapshot(), indSum = 0, N = 20;
  for (var k = 0; k < N; k++) { s.advanceCycles(1); indSum += s.assembleSnapshot().instruments.charging_flow; }
  ck('operator setpoint untouched by AUTO', snap.control_state.charging_flow_normalized === 0,
     'setpt ' + snap.control_state.charging_flow_normalized.toFixed(4), '0');
  ck('charging_flow indication shows the modulated flow (not the setpoint)', indSum / N > 0.0005,
     'mean ind ' + (indSum / N).toFixed(4), '> 0.0005');

  // §8.8: large-break LOCA drives the ECCS — merged HPI/LPI auto-start at
  // 11.03 MPa, delivering along the two-segment curve as pressure falls; the
  // break blowdown model (096f574) cools the RCS so pressure falls through the
  // restored 4.14 MPa accumulator arming setpoint and the tanks dump.
  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'inject_failure', failure_id: 'large_loca', severity: 1.0 });
  s.handleCommand({ action: 'set_speed', value: 10 });
  var accumFired = false, injFired = false;
  for (var i = 0; i < 600; i++) { s.advanceCycles(1); var sn = s.assembleSnapshot();
    if (sn.instruments.accumulators_discharging && sn.instruments.accumulator_flow > 0) accumFired = true;
    if (sn.instruments.hpi_active && sn.instruments.hpi_flow > 0.2) injFired = true; }
  ck('large LOCA auto-starts merged HPI/LPI (hpi_active + delivering)', injFired, injFired, true);
  ck('large LOCA discharges accumulators (status + flow)', accumFired, accumFired, true);
})();

console.log('\n' + B + 'RBMK — recently-added controls' + X);
(function () {
  var s = svc('rbmk', 'full_power', 'pre_chernobyl');
  s.handleCommand({ action: 'set_turbine_load', mwe: 400 });
  step(s, 30);
  var mwe = s.engine.s.steam_to_turbine * s.engine.cfg.turbine.mwe_rated;
  ck('turbine load set lowers demand', mwe <= 450, mwe.toFixed(0), '<=450');

  s = svc('rbmk', 'full_power', 'pre_chernobyl');
  step(s, 250);   // 5 s steady
  s.handleCommand({ action: 'inject_failure', failure_id: 'pressure_tube_rupture', severity: 0.5 });
  step(s, 400);   // 8 s drain (matches engine §14 eccs harness)
  var drumLow = s.engine.s.drum_level_pct;
  s.handleCommand({ action: 'set_eccs', active: true });
  step(s, 500);   // 10 s recovery
  ck('ECCS recovers drum level after rupture', s.engine.s.drum_level_pct > drumLow, s.engine.s.drum_level_pct.toFixed(1) + ' (was ' + drumLow.toFixed(1), 'higher');
  ck('ECCS active flag', s.engine.s.eccs_active === true, s.engine.s.eccs_active, true);
})();

console.log('\n' + B + 'BWR — recently-added controls' + X);
(function () {
  var s = svc('bwr', 'full_power');
  s.handleCommand({ action: 'set_steam_dump', mode: 'open' });
  step(s, 20);
  ck('steam dump open', s.engine.s.steam_dump_override >= 0.9, s.engine.s.steam_dump_override, '>=0.9');

  s = svc('bwr', 'post_scram_sbo');
  s.handleCommand({ action: 'set_ic', active: true });
  step(s, 200);
  ck('IC active on SBO', s.engine.s.ic_active === true, s.engine.s.ic_active, true);

  s = svc('bwr', 'full_power');
  s.handleCommand({ action: 'start_lpcs' });
  step(s, 20);
  s.handleCommand({ action: 'stop_lpcs' });
  ck('core spray stop', !s.engine.s.lpcs_running, s.engine.s.lpcs_running, false);

  s = svc('bwr', 'full_power');
  s.handleCommand({ action: 'initiate_slc' });
  step(s, 10);
  s.handleCommand({ action: 'stop_slc' });
  ck('SLC stop', !s.engine.s.slc_active, s.engine.s.slc_active, false);
})();

console.log('\n' + B + '──────────' + X);
console.log(B + 'E2E controls: ' + (fail ? R : G) + pass + '/' + (pass + fail) + X);
process.exit(fail ? 1 : 0);