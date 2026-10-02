/*
 * run_pwr2_fwi_stack.js — the post-trip feedwater isolation (P-4 + low Tavg, #818), FULL STACK.
 *
 * WHY THIS RUNNER EXISTS. run_pwr2_protection proves the SIGNAL (pwr2_protection, a pure module:
 * setpoint, the reactor-trip coincidence, unlatched). Nothing asserted what the signal DOES to the
 * plant the player drives — the engine's valve closure (pwr2_engine `if (ptr.fwi_lo_tavg) ...`) and
 * the shell's refusal of a main feed restore while it stands. This rides the shipped stack
 * (SimulationService + control kernel + PWR2 shell) from hot full power through a manual trip.
 *
 * WHAT IT ASSERTS (each the claim, not the output):
 *   1. a manual trip from full power isolates main feedwater on its own: the signal stands, the
 *      board's MFW ISOLATED indication is lit, and delivered main feed is under 5 % of rated;
 *   2. both auxiliary feedwater pumps run (the signal starts them — pwr2_protection's declared
 *      stand-in for the shrink-driven low-low start this steam generator does not reproduce);
 *   3. a RESTORE of main feed is refused BY NAME while the signal stands, and changes nothing;
 *   4. NON-LATCHING: once the reactor trip is reset the signal clears, the valves stay shut (no
 *      automatic restoration), and the operator's restore is then accepted and feed flows;
 *   5. the control: an untripped full-power plant never isolates.
 *
 * MEASURED 2026-10-02 (hot full power, manual trip at 10 s, 10x): indicated Tavg 577.9 degF at
 * +5 s, 554.8 at +30, 552.5 at +120 (setpoint 554 degF / 290.0 degC); delivered main feed 0.029
 * of rated at +30, 0.000 from +120; the restore after the trip reset delivers 0.262 within 30 s.
 *
 * MUTATIONS: each is replayed in a child process that loads the mutated source; a mutation the
 * clean checks do not turn red is a FAILED check here. `--no-mutations` skips them (forced
 * non-zero: never a baseline).
 *
 * Run: node test/run_pwr2_fwi_stack.js
 */
'use strict';
var path = require('path'), fs = require('fs'), cp = require('child_process');
var ROOT = path.join(__dirname, '..');
var FILES = ['engines/load_mode.js', 'engines/pwr/pwr_config.js',
  'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_pressurizer2.js',
  'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js', 'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
  'engines/pwr2/pwr2_water.js', 'engines/pwr2/pwr2_vtable.js', 'engines/pwr2/pwr2_geometry.js',
  'engines/pwr2/pwr2_core.js', 'engines/pwr2/pwr2_loop.js', 'engines/pwr2/pwr2_kinetics.js',
  'engines/pwr2/pwr2_fuel.js', 'engines/pwr2/pwr2_reactor.js', 'engines/pwr2/pwr2_sources.js',
  'engines/pwr2/pwr2_sg.js', 'engines/pwr2/pwr2_turbine.js', 'engines/pwr2/pwr2_relief.js',
  'engines/pwr2/pwr2_condenser.js', 'engines/pwr2/pwr2_cvcs.js', 'engines/pwr2/pwr2_eccs.js',
  'engines/pwr2/pwr2_afw.js', 'engines/pwr2/pwr2_damage.js', 'engines/pwr2/pwr2_protection.js',
  'engines/pwr2/pwr2_pressurizer.js', 'engines/pwr2/pwr2_dumpctl.js', 'engines/pwr2/pwr2_break.js',
  'engines/pwr2/pwr2_containment.js', 'engines/pwr2/pwr2_rhr.js', 'engines/pwr2/pwr2_true_state.js',
  'engines/pwr2/pwr2_instruments.js', 'engines/pwr2/pwr2_feedwater.js', 'engines/pwr2/pwr2_engine.js',
  'engines/pwr2/pwr2_shell.js',
  'layers/control/control_kernel.js', 'layers/instructor_layer.js', 'layers/simulation_service.js'];

var MUTATIONS = [
  ['the engine never closes the valves on the signal (the isolation line dropped)',
   'engines/pwr2/pwr2_engine.js', '    if (ptr.fwi_lo_tavg) eng.fw.isolated = true;', '    if (false) eng.fw.isolated = true;'],
  ['the shell lets a main feed restore through while the signal stands',
   'engines/pwr2/pwr2_shell.js', '        if (e.pt.fwi_lo_tavg) {\n          throw', '        if (false) {\n          throw'],
  ['the signal latches (never clears after the trip reset)',
   'engines/pwr2/pwr2_protection.js', 'pr.fwi_lo_tavg = !!(pr.reactor_trip && tavgOk', 'pr.fwi_lo_tavg = !!pr.fwi_lo_tavg || !!(pr.reactor_trip && tavgOk'],
  ['the signal no longer starts the motor-driven auxiliary feedwater pump',
   'engines/pwr2/pwr2_protection.js', "pr.afas_mdafw = true; pr.afas_mdafw_cause = 'fwi_lo_tavg';", "pr.afas_mdafw_cause = 'fwi_lo_tavg';"],
  ['the signal no longer starts the turbine-driven auxiliary feedwater pump',
   'engines/pwr2/pwr2_protection.js', "pr.afas_tdafw = true; pr.afas_tdafw_cause = 'fwi_lo_tavg';", "pr.afas_tdafw_cause = 'fwi_lo_tavg';"],
];

var MUT_IX = process.env.RD_FWI_MUT != null ? +process.env.RD_FWI_MUT : -1;
FILES.forEach(function (f) {
  var m = MUTATIONS[MUT_IX];
  if (m && m[1] === f) {
    var src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
    if (src.split(m[2]).length !== 2) { console.log('ANCHOR NOT FOUND EXACTLY ONCE: ' + m[0]); process.exit(3); }
    (0, eval)(src.replace(m[2], m[3]));
  } else {
    require(path.join(ROOT, f));
  }
});
var RD = globalThis.RD;

var nPass = 0, nFail = 0, quiet = MUT_IX >= 0;
function ck(name, ok, detail) {
  ok ? nPass++ : nFail++;
  if (!quiet) console.log((ok ? '\x1b[32mPASS' : '\x1b[31mFAIL') + '\x1b[0m  ' + name + (detail != null ? '\x1b[2m   (' + detail + ')\x1b[0m' : ''));
}
function boot() {
  var svc = new RD.SimulationService({ seed: 4242 });
  svc.selectPlant('pwr2', 'hot_full_power');
  svc.running = true; svc.timeAcceleration = 10; svc.attentionStops = false;
  svc.runTo = function (t) { var s = null; while (svc.simTime < t) s = svc.tick(); return s || svc.assembleSnapshot(); };
  return svc;
}
function F(c) { return (c * 9 / 5 + 32).toFixed(1) + ' degF'; }
function tryCmd(svc, c) { try { return { r: svc.handleCommand(c) }; } catch (e) { return { err: String(e && e.message || e) }; } }

// ---------------------------------------------------------------- 5. control: no trip, no isolation
(function () {
  var svc = boot(), e = svc.engine.eng, s = svc.runTo(70);
  ck('control: an untripped full-power plant does not isolate main feed (70 s)',
     e.pt.fwi_lo_tavg !== true && s.instruments.mfw_isolated !== true && e.fw.feed_frac > 0.9,
     'feed ' + e.fw.feed_frac.toFixed(3) + ' of rated');
})();

// ---------------------------------------------------------------- 1-4. manual trip from full power
(function () {
  var svc = boot(), e = svc.engine.eng;
  svc.runTo(10);
  svc.handleCommand({ action: 'scram' });
  var s = svc.runTo(10 + 120);
  ck('manual trip from full power: the P-4 + low Tavg signal stands by +120 s',
     e.pt.fwi_lo_tavg === true, 'indicated Tavg ' + F(s.instruments.tavg));
  ck('...and the board reads main feedwater ISOLATED', s.instruments.mfw_isolated === true, String(s.instruments.mfw_isolated));
  var f120 = e.fw.feed_frac;
  s = svc.runTo(10 + 300);
  ck('...and delivered main feed is under 5 % of rated (+120 s and +300 s)',
     f120 < 0.05 && e.fw.feed_frac < 0.05 && s.instruments.fw_flow < 0.05,
     'engine ' + f120.toFixed(3) + ' / ' + e.fw.feed_frac.toFixed(3) + ', indicated ' + s.instruments.fw_flow.toFixed(3));
  ck('...and BOTH auxiliary feedwater pumps run (the board lamp lit; motor-driven and turbine-driven)',
     s.instruments.afw_pump_running === true && e.aw.mdafwRunning === true && e.aw.tdafwRunning === true,
     'lamp ' + s.instruments.afw_pump_running + ', motor ' + e.aw.mdafwRunning + ', turbine ' + e.aw.tdafwRunning);

  var r = tryCmd(svc, { action: 'isolate_feedwater', active: false });
  s = svc.runTo(svc.simTime + 10);
  ck('a main feed RESTORE is refused by name while the signal stands, and nothing changes',
     !!r.err && /MFW RESTORE BLOCKED/.test(r.err) && /low\s+Tavg/.test(r.err) && e.fw.isolated === true && e.fw.feed_frac < 0.05,
     (r.err || 'accepted').slice(0, 90));

  var rr = tryCmd(svc, { action: 'reset_rps' });
  s = svc.runTo(svc.simTime + 5);
  ck('NON-LATCHING: the trip reset clears the signal; the valves stay shut until the operator restores',
     !rr.err && e.pt.reactor_trip !== true && e.pt.fwi_lo_tavg === false && e.fw.isolated === true,
     rr.err ? rr.err.slice(0, 90) : 'signal ' + e.pt.fwi_lo_tavg + ', isolated ' + e.fw.isolated);
  var r2 = tryCmd(svc, { action: 'isolate_feedwater', active: false });
  s = svc.runTo(svc.simTime + 30);
  ck('...and the operator\'s restore is then accepted and main feed flows again',
     !r2.err && e.fw.isolated === false && e.fw.feed_frac > 0.1,
     r2.err ? r2.err.slice(0, 90) : 'feed ' + e.fw.feed_frac.toFixed(3) + ' of rated');
})();

if (quiet) process.exit(nFail > 0 ? 1 : 0);

// ---------------------------------------------------------------- mutations
var NO_MUT = process.argv.indexOf('--no-mutations') >= 0;
if (!NO_MUT) {
  console.log('\nMUTATIONS (each replayed in a child process; each must turn a check red)');
  MUTATIONS.forEach(function (m, i) {
    var res = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { RD_FWI_MUT: String(i) }), encoding: 'utf8' });
    ck('mutation caught: ' + m[0], res.status === 1, 'child exit ' + res.status + (res.status === 3 ? ' (anchor missing)' : ''));
  });
} else {
  console.log('\n--no-mutations: mutations skipped. Forced non-zero; never a baseline.');
}

console.log('\n' + '='.repeat(74));
console.log('  run_pwr2_fwi_stack: ' + nPass + ' passed, ' + nFail + ' failed  (' + (nPass + nFail) + ' checks)');
console.log('='.repeat(74) + '\n');
process.exit(nFail > 0 || NO_MUT ? 1 : 0);
