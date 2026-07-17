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

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'set_spray', pct: 50 });
  step(s, 20);
  var sprayPct = s.engine.s.spray_flow_frac * 100;
  ck('PZR spray manual set reaches engine', sprayPct >= 45, sprayPct.toFixed(0), '>=45');

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

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'inject_failure', failure_id: 'sgtr', severity: 0.5 });
  var inv0 = s.engine.s.core_inventory_pct;
  s.handleCommand({ action: 'set_cvcs_auto', active: true });
  step(s, 400);
  ck('CVCS auto make-up holds inventory vs leak', s.engine.s.core_inventory_pct >= inv0 - 5, s.engine.s.core_inventory_pct.toFixed(1), '>=' + (inv0 - 5).toFixed(1));
  // §8.8: the charging_flow INDICATION (true modulated flow) rises above the operator
  // SETPOINT under AUTO make-up — the two are distinct snapshot fields for the UI.
  var snap = s.assembleSnapshot();
  ck('charging_flow indication > setpoint under AUTO', snap.instruments.charging_flow > snap.control_state.charging_flow_normalized + 0.005,
     'ind ' + snap.instruments.charging_flow.toFixed(4) + ' vs setpt ' + snap.control_state.charging_flow_normalized.toFixed(4), 'ind > setpt');

  // §8.8: large-break LOCA drives the ECCS — merged HPI/LPI auto-start at
  // 11.03 MPa, delivering along the two-segment curve as pressure falls; the
  // accumulator check documents a KNOWN physics gap: primary pressure floors
  // at Tsat of the hot voided core (~5.5 MPa), so the 1.5 MPa accumulator
  // arming pressure is unreachable in v1's blowdown model (tuning target).
  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'inject_failure', failure_id: 'large_loca', severity: 1.0 });
  s.handleCommand({ action: 'set_speed', value: 10 });
  var accumFired = false, injFired = false;
  for (var i = 0; i < 600; i++) { s.advanceCycles(1); var sn = s.assembleSnapshot();
    if (sn.instruments.accumulators_discharging && sn.instruments.accumulator_flow > 0) accumFired = true;
    if (sn.instruments.hpi_active && sn.instruments.hpi_flow > 0.2) injFired = true; }
  ck('large LOCA auto-starts merged HPI/LPI (hpi_active + delivering)', injFired, injFired, true);
  ck('large LOCA discharges accumulators (status + flow) [known blowdown-model gap]', accumFired, accumFired, true);
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