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
// Advance n BROADCAST CYCLES — 0.1 s of sim time each at the 10 Hz default, and only
// 0.05 s once the service decides it is in a transient. Named `cycles` and not `step`
// on purpose (#261): as `step(s, 400)` it read as seconds, and #194 was filed,
// cross-referenced from this file and owner-ruled on the strength of a "400 s" window
// that was really 40 s. If you want a DURATION, use secs() below.
function cycles(s, n) { for (var i = 0; i < (n || 50); i++) s.advanceCycles(1); }
// Advance a duration of SIM TIME — cadence- and acceleration-proof. Prefer this whenever
// the assertion is about how far a plant or a controller has actually got.
function secs(s, t) { var end = s.simTime + t; while (s.simTime < end) s.advanceCycles(1); }
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
  cycles(s, 300);
  var after = rodSteps(s);
  ck('linear scram drives control rods to 0 steps', after === 0, after, 0);

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'set_heater', power_pct: 80 });
  cycles(s, 20);
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
  cycles(s, 20);
  var sprayLo = s.engine.s.spray_flow_frac * 100;
  ck('PZR spray manual set below the cap reaches engine untouched',
    Math.abs(sprayLo - sprayCap / 2) < 0.5, sprayLo.toFixed(1), (sprayCap / 2).toFixed(1));

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'set_spray', pct: 50 });
  cycles(s, 20);
  var sprayPct = s.engine.s.spray_flow_frac * 100;
  ck('PZR spray manual set above the cap is clamped to it (CC-5)',
    Math.abs(sprayPct - sprayCap) < 0.5, sprayPct.toFixed(1), sprayCap.toFixed(1) + ' (cap)');

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'open_porv' });
  cycles(s, 10);
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
  cycles(s, 50);
  ck('borate raises boron ppm (charging pump on)', s.engine.s.boron_ppm > boron0, s.engine.s.boron_ppm.toFixed(0), '>' + boron0.toFixed(0));

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'set_charging_pump', running: false });
  var boronOff = s.engine.s.boron_ppm;
  s.handleCommand({ action: 'set_boron_adjust', rate: 5 });
  cycles(s, 50);
  ck('borate inert with charging pump off', s.engine.s.boron_ppm === boronOff, s.engine.s.boron_ppm.toFixed(0), boronOff.toFixed(0));

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'set_charging_flow', normalized: 0.05 });
  ck('charging flow set', s.engine.s.charging_flow >= 0.04, s.engine.s.charging_flow.toFixed(3), '>=0.04');

  s = svc('pwr', 'hot_full_power');
  s.handleCommand({ action: 'set_letdown_orifices', a: true, b: false });
  cycles(s, 20);
  ck('letdown orifice A → pressure-driven flow', s.engine.s.letdown_flow >= 0.02, s.engine.s.letdown_flow.toFixed(3), '>=0.02');

  // §8.8 CVCS AUTO make-up vs a leak — DIFFERENTIAL, not an absolute band.
  //
  // This asserted "inventory holds >= inv0 - 2" against a severity-1.0 SGTR and had
  // been red for weeks. Two things were wrong with it, and the second is the worse:
  //
  //  1. It is not physical. Measured over the 400-CYCLE window, a severity-1.0 SGTR takes
  //     inventory 100 % -> 5.6 %. Make-up slows that by ~1.7 points; nothing "holds"
  //     it. (The old comment's "loses ~10 % over the window" was an order of magnitude
  //     out.)
  //
  // MIND THE UNITS: `cycles()` advances BROADCAST CYCLES, and one cycle is 0.1 s of sim
  // time (NORMAL_MS 100 / PHYSICS_DT 0.02 = 5 physics steps). So 400 cycles is 40 s,
  // NOT 400 s. Earlier revisions of this comment block said "the 400 s window"
  // throughout, and that slip is the whole of #194: it made a 40 s reading of an 83 s
  // control loop look like a settled steady state, and got a non-defect filed and
  // ruled on. Anything here that talks about equilibrium must state its window in
  // BOTH units.
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
  // simSeconds is SIM TIME, driven through secs() — not a cycle count (#261). The
  // default 40 s is what the old `step(t, 400)` actually delivered, minus the cadence
  // shortfall; the equilibrium checks below pass an explicit, much longer window.
  function sgtrRun(cvcsAuto, severity, simSeconds, failureId) {
    var t = svc('pwr', 'hot_full_power');
    t.handleCommand({ action: 'set_letdown_orifices', a: false, b: false });
    t.handleCommand({ action: 'set_cvcs_auto', active: cvcsAuto });
    t.handleCommand({ action: 'inject_failure', failure_id: failureId || 'sgtr', severity: severity });
    secs(t, simSeconds || 40);
    // AVERAGE the servo output over a window; do NOT sample it once at the end.
    // charging_flow is driven by a filtered error on the INDICATED pzr level, so it carries
    // the level instrument's noise. A single sample was only ever the mean because the noise
    // was WHITE and the servo's 20 s filter annihilated it; once instrument noise became
    // physically correlated (#233) a single sample stopped being representative and this
    // check swung between 4 % and 14 % coverage on identical plants. Averaging measures the
    // quantity the assertions are actually about — and it is the stricter test under BOTH
    // noise models, which is why it is the right fixture rather than a workaround.
    var nAvg = 120, chgSum = 0, leakSum = 0, invStart = t.engine.s.core_inventory_pct;
    for (var q = 0; q < nAvg; q++) {
      cycles(t, 1);
      chgSum += t.engine.s.charging_flow || 0;
      leakSum += t.engine.s.leak_flow || 0;
    }
    return {
      svc: t, inv: t.engine.s.core_inventory_pct,
      chg: chgSum / nAvg, leak: leakSum / nAvg,
      // Inventory change across the 120-cycle (12 s) averaging window — how the
      // equilibrium checks below tell "parked" from "still falling slowly".
      drift: t.engine.s.core_inventory_pct - invStart,
      lvl: t.engine.s.pzr_level_pct, simTime: t.simTime,
    };
  }
  var cvcsOn = sgtrRun(true, 0.2), cvcsOff = sgtrRun(false, 0.2);
  // The OFF leg is the one that discriminates: because the free-play lineup already
  // has CVCS auto ON, only turning it OFF can prove the command reaches the kernel.
  // Keep both legs — ON alone would pass against a no-op, which is the trap the
  // previous version of this check fell into.
  ck('set_cvcs_auto OFF stops automatic charging', cvcsOff.chg === 0, cvcsOff.chg.toFixed(4), '0');
  ck('set_cvcs_auto ON commands charging', cvcsOn.chg > 0, cvcsOn.chg.toFixed(4), '>0');
  // THE INVENTORY LEG MOVED OFF THE SGTR FIXTURE (2026-08-04, #337) — the fixture picked up a
  // confound, the claim did not change. An SGTR leak is ΔP-MODULATED (`stepInventory`: it scales
  // with primary−secondary ΔP, which is the single-SG EOP's whole strategy), and since #337
  // make-up drives a pressurizer INSURGE, so charging now holds pressure up and thereby holds
  // the leak open. Measured on this exact fixture: ON parks at 2137 psi with a 4.690e-3 leak,
  // OFF at 2113 psi with 4.576e-3 — so the make-up buys back less than the extra leak it
  // sustains, and inventory lands 96.40 % ON against 96.56 % OFF. That is the right plant
  // (depressurising to stop the leak is the SGTR EOP) and the wrong test: this suite is control
  // PLUMBING, and the check wants to know the command moved the plant, not to adjudicate an EOP.
  //
  // `large_loca` is containment-side and NOT ΔP-modulated, so the feedback is structurally
  // absent. Severity 0.002 = 1.0e-3 frac/s, ~1.4× the CVCS authority of 7.2e-4, which keeps
  // charging on its stop (the reason the old fixture chose 0.2) while leaving the servo clearly
  // beaten. Measured **identical on both engines** — 97.42 % ON vs 94.80 % OFF, +2.62 points,
  // before and after #337 to two decimals — which is what says the new fixture is not a refit.
  var invOn = sgtrRun(true, 0.002, undefined, 'large_loca');
  var invOff = sgtrRun(false, 0.002, undefined, 'large_loca');
  ck('CVCS auto measurably slows the inventory loss (non-ΔP-modulated leak)',
    invOn.inv > invOff.inv + 1, invOn.inv.toFixed(2) + ' vs ' + invOff.inv.toFixed(2),
    'ON > OFF + 1');
  // ...and at a leak small enough to be inside its authority the servo MODULATES
  // rather than sitting on its stop — otherwise "auto" would just be a fixed pump.
  var small = sgtrRun(true, 0.008);
  ck('CVCS auto modulates below saturation on a small leak',
    small.chg > 0 && small.chg < cvcsOn.chg * 0.9, small.chg.toFixed(5),
    '0 < chg < ' + (cvcsOn.chg * 0.9).toFixed(5));
  // PROPORTIONAL DROOP, MEASURED AT EQUILIBRIUM (#194 — read this before shortening
  // the windows below).
  //
  // A P-only servo has a steady-state offset, not a permanent shortfall: it charges
  // until the level error is big enough to command make-up EQUAL to the leak, then
  // parks there. So for any leak inside its authority CVCS ends up covering ~100 % of
  // it, holding inventory at a fixed deficit, with pzr level parked below program —
  // that offset is the operator's leak cue, and it is what "identified leakage made up
  // by CVCS" means in a real plant.
  //
  // The equilibrium is derivable from config alone, which is why these checks assert it
  // rather than a recorded observation (HR10 — don't fit the test to the behaviour).
  // With letdown shut, mass balance gives dm/dt = charging*gain - leak, charging =
  // charge_per_level * err, and err = level_per_mass * deficit, so:
  //     deficit* = leak / (gain * charge_per_level * level_per_mass)
  //     level droop* = leak / (gain * charge_per_level)      [% of level]
  //     loop tau     = 1 / (gain * charge_per_level * level_per_mass)  = 83 s
  //
  // WHY THE WINDOW IS 400 SECONDS. tau is 83 s, so the 40 s the plumbing checks above
  // use is HALF A TIME CONSTANT — the servo has barely started. This is exactly what
  // #194 tripped over: a check here asserted coverage was "a consistent 10..50 % of the
  // leak, equal across leak sizes" and read ~24 % every time. Both halves of that were
  // artifacts of the window. Coverage was equal across severities because the loop is
  // LINEAR (every leak sits at the same fraction of its own approach at a given time),
  // and it was ~24 % because 40 s is 0.48 tau. Measured at 4.8 tau the same plant covers
  // 97-100 % and inventory is flat. The old check pinned a transient as a steady-state
  // property and put a non-defect ("no leak is ever held in equilibrium") into an issue
  // and an owner ruling.
  //
  // Windows here are SIM SECONDS, not cycles (#261) — the whole misreading came from a
  // cycle count that looked like seconds. Do not shorten these; if the loop is ever
  // retuned, scale them off tau.
  var rcv = RD.PWR_CONFIG.reactivity, gain = rcv.cvcs_inventory_gain;
  var cpl = rcv.cvcs_charge_per_level, lpm = RD.PWR_CONFIG.pressurizer.level_per_mass;
  // DERIVED FROM tau, which is what the paragraph above told the next person to do
  // ("if the loop is ever retuned, scale them off tau") — #330 is that retune.
  //
  // TWO WINDOWS, because the two things measured below settle on different clocks, and
  // holding one hard-coded 400 s for both is what broke when level_per_mass moved.
  //
  //  SETTLE — for a leak INSIDE CVCS authority, which parks at a droop equilibrium. The
  //    servo's error passes a first-order filter (cvcs_level_filter_tau, 20 s), so the
  //    settling clock is the LOOP PLUS ITS FILTER. That distinction did not matter at
  //    level_per_mass 100, where the loop was 83 s and swamped a 20 s filter; at 776 the
  //    loop is 10.7 s and the FILTER now dominates. Measured: at 4.8 loop-tau alone
  //    (51.5 s) coverage read 134 % and inventory was still drifting UP — the servo had
  //    overshot and not come back, and two equilibrium checks failed against a transient.
  //    That is #194's original mistake in a new place: a window quoted in tau, but the
  //    wrong tau.
  //
  //  SATURATE — for a leak BEYOND authority, where there is no equilibrium and inventory
  //    falls monotonically. This window has a CEILING rather than a floor: it must end
  //    before the plant's own protection intervenes. Held at 400 s it now spans a reactor
  //    trip — the leak outruns CVCS, the stiffer level line reaches the 12 % lo-lo scram
  //    inside the window, SI parks inventory at the mass ceiling, and the check read
  //    "charging 0.0000, drift 0.000" while asserting nothing about the servo it is named
  //    for. It scales on the LOOP tau alone, and the band is wide: charging saturates at
  //    4.0 loop-tau, the scram arrives at 23, so 4.8 clears both ends on both plants.
  var TAU = 1 / (cpl * gain * lpm);                       // level-loop time constant
  var TAU_F = rcv.cvcs_level_filter_tau != null ? rcv.cvcs_level_filter_tau : 20.0;
  var SETTLE = 4.8 * (TAU + TAU_F);        // equilibrium: loop + its error filter
  var SATURATE = 4.8 * TAU;                // pre-protection: loop only
  var leakA = sgtrRun(true, 0.004, SETTLE), leakB = sgtrRun(true, 0.008, SETTLE);
  var covA = leakA.chg * gain / leakA.leak, covB = leakB.chg * gain / leakB.leak;
  ck('CVCS make-up scales with the leak (proportional servo)',
    leakB.chg > leakA.chg * 1.8 && leakB.chg < leakA.chg * 2.2,
    leakA.chg.toFixed(5) + ' -> ' + leakB.chg.toFixed(5) + ' on a 2x leak', '~2x');
  // (1) The leak IS held: make-up converges on the leak in MASS terms.
  ck('CVCS make-up converges on a leak inside its authority (~100 % coverage)',
    covA > 0.95 && covA < 1.05 && covB > 0.95 && covB < 1.05,
    (covA * 100).toFixed(0) + '% / ' + (covB * 100).toFixed(0) + '% at ' +
    leakB.simTime.toFixed(0) + ' s', 'both 95..105%');
  // (2) ...and inventory is PARKED, not falling slowly. Over the 12 s averaging window
  //     an unheld leak of this size would take off >=0.02 %; measured drift is ~0.004.
  ck('CVCS parks inventory against a held leak (no residual drain)',
    Math.abs(leakA.drift) < 0.02 && Math.abs(leakB.drift) < 0.02,
    leakA.drift.toFixed(4) + ' / ' + leakB.drift.toFixed(4) + ' %/12 s', '|drift| < 0.02');
  // (3) The parked deficit matches the config-derived equilibrium — the number the
  //     droop law predicts, not one read off a run.
  var predA = 100 * (1 - leakA.leak / (gain * cpl * lpm));
  var predB = 100 * (1 - leakB.leak / (gain * cpl * lpm));
  ck('parked inventory matches the derived droop equilibrium',
    Math.abs(leakA.inv - predA) < 0.1 && Math.abs(leakB.inv - predB) < 0.1,
    leakA.inv.toFixed(2) + ' vs ' + predA.toFixed(2) + ' / ' +
    leakB.inv.toFixed(2) + ' vs ' + predB.toFixed(2), 'within 0.1 %');
  // (4) The DROOP CUE survives: a held leak still parks level visibly below program,
  //     and twice the leak parks it twice as far down. This is the half of the old
  //     check that was real — "CVCS holds it" must not mean "the board looks normal".
  ck('a held leak still parks pzr level below program (leak cue preserved)',
    leakA.lvl < 54.5 && leakB.lvl < leakA.lvl - 0.8,
    leakA.lvl.toFixed(2) + '% -> ' + leakB.lvl.toFixed(2) + '% on a 2x leak',
    '< 54.5, 2x leak parks >0.8 lower');
  // (5) The teaching limit: a leak BEYOND charging_max is NOT held, however long you
  //     wait. Authority is charging_max*gain = 7.2e-4 frac/s; severity 0.03 is ~92 % of
  //     it, which saturates the pump and still loses inventory.
  var beyond = sgtrRun(true, 0.03, SATURATE);
  ck('a leak beyond CVCS authority is NOT held (saturated, still draining)',
    beyond.chg > rcv.charging_max * 0.98 && beyond.drift < -0.05,
    'chg ' + beyond.chg.toFixed(4) + ' (max ' + rcv.charging_max + '), drift ' +
    beyond.drift.toFixed(3) + ' %/12 s', 'at max, drift < -0.05');

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
  cycles(s, 30);
  var mwe = s.engine.s.steam_to_turbine * s.engine.cfg.turbine.mwe_rated;
  ck('turbine load set lowers demand', mwe <= 450, mwe.toFixed(0), '<=450');

  s = svc('rbmk', 'full_power', 'pre_chernobyl');
  cycles(s, 250);   // 5 s steady
  s.handleCommand({ action: 'inject_failure', failure_id: 'pressure_tube_rupture', severity: 0.5 });
  cycles(s, 400);   // 8 s drain (matches engine §14 eccs harness)
  var drumLow = s.engine.s.drum_level_pct;
  s.handleCommand({ action: 'set_eccs', active: true });
  cycles(s, 500);   // 10 s recovery
  ck('ECCS recovers drum level after rupture', s.engine.s.drum_level_pct > drumLow, s.engine.s.drum_level_pct.toFixed(1) + ' (was ' + drumLow.toFixed(1), 'higher');
  ck('ECCS active flag', s.engine.s.eccs_active === true, s.engine.s.eccs_active, true);
})();

console.log('\n' + B + 'BWR — recently-added controls' + X);
(function () {
  var s = svc('bwr', 'full_power');
  s.handleCommand({ action: 'set_steam_dump', mode: 'open' });
  cycles(s, 20);
  ck('steam dump open', s.engine.s.steam_dump_override >= 0.9, s.engine.s.steam_dump_override, '>=0.9');

  s = svc('bwr', 'post_scram_sbo');
  s.handleCommand({ action: 'set_ic', active: true });
  cycles(s, 200);
  ck('IC active on SBO', s.engine.s.ic_active === true, s.engine.s.ic_active, true);

  s = svc('bwr', 'full_power');
  s.handleCommand({ action: 'start_lpcs' });
  cycles(s, 20);
  s.handleCommand({ action: 'stop_lpcs' });
  ck('core spray stop', !s.engine.s.lpcs_running, s.engine.s.lpcs_running, false);

  s = svc('bwr', 'full_power');
  s.handleCommand({ action: 'initiate_slc' });
  cycles(s, 10);
  s.handleCommand({ action: 'stop_slc' });
  ck('SLC stop', !s.engine.s.slc_active, s.engine.s.slc_active, false);
})();

// ---------------------------------------------------------------------------
// PWR — RPS RESET FROM THE BOARD (#75)
//
// The SCRAM button has drawn "PRESS TO RESET" since it was built and its handler was
// empty. The engine's `reset_rps` and the kernel's permissive both existed the whole
// time; what was missing was the wire between them and any way for the operator to see
// WHY a reset would be refused. Worse, the kernel's refusal used a `type: 'refused'`
// shape that nothing in the codebase read — not the service, not the UI, not a test —
// so an early press was swallowed in silence.
//
// These drive the FULL STACK, which is the only layer where this is real: the permissive
// is kernel state and reaches the board through the snapshot.
console.log('\n' + B + 'PWR — RPS reset from the board (#75)' + X);
(function () {
  function rps(s) { return s.assembleSnapshot().rps_state; }

  // --- the permissive is STATE, so the board can show it before the press ---------
  var s = svc('pwr', 'hot_full_power');
  secs(s, 10);
  ck('unscrammed plant offers no reset', rps(s).reset_permitted === false, rps(s).reset_permitted, false);

  s.handleCommand({ action: 'scram' });
  secs(s, 0.5);
  var early = rps(s);
  ck('immediately after the scram a reset is NOT permitted',
    early.reset_permitted === false && !!early.reset_block, early.reset_permitted, false);
  ck('…and the block names a machine-readable reason',
    early.reset_block.reason === 'TRIP_SIGNAL_PRESENT' || early.reset_block.reason === 'RODS_NOT_INSERTED',
    early.reset_block.reason, 'TRIP_SIGNAL_PRESENT|RODS_NOT_INSERTED');

  // --- pressing early is REFUSED, and refused in a shape the UI actually shows -----
  var r = s.handleCommand({ action: 'reset_rps' });
  ck('an early press is refused', !!r && r.type === 'blocked', r && r.type, 'blocked');
  // app.js cmd() flashes the scanner bar on type 'blocked' + code INTERLOCK. This is the
  // whole point of the change: the old 'refused' shape was read by nothing at all.
  ck('…in the shape app.js flashes to the operator',
    !!r && r.code === 'INTERLOCK' && !!r.message, r && r.code, 'INTERLOCK + message');
  ck('…and still carries the specific reason', !!r && !!r.reason, r && r.reason, 'a reason code');
  // Operator text, not source identifiers. The first cut read "turbine_tripped is still
  // is_true", which is a sentence only a programmer can parse.
  ck('the refusal names a channel, not an instrument id',
    !!r && !/_/.test(r.message) && r.message.indexOf('is_true') < 0, r && r.message, 'no ids, no enums');

  // --- the ROD-BOTTOM permissive has a window of its own --------------------------
  // Between the turbine-trip signal clearing and the rods seating there are a couple of
  // seconds where rod bottom is the only thing holding the reset off. Without a check
  // sitting IN that window the whole `rps_reset_permissive` config could be deleted and
  // every other check here would stay green — verified by injection, it did. Then the
  // board would invite a reset while the rods were still dropping and the engine's own
  // interlock would refuse it, which is the exact class of lie #75 exists to remove.
  // Measured on this seed: rods are at 11.3 %/0.0 % at t+2 s, trip signal already clear.
  secs(s, 1.5);   // t+0.5 s (the early press above) -> t+2 s
  var mid = rps(s);
  ck('while the rods are still dropping, rod bottom is what blocks the reset',
    mid.reset_permitted === false && !!mid.reset_block &&
    mid.reset_block.reason === 'RODS_NOT_INSERTED',
    mid.reset_block && mid.reset_block.reason, 'RODS_NOT_INSERTED');
  ck('…and the board is told so in words',
    !!mid.reset_block && /rods/i.test(mid.reset_block.message),
    mid.reset_block && mid.reset_block.message, 'mentions the rods');

  // --- rods seat, nothing is standing, the reset is accepted ----------------------
  secs(s, 10);
  var ready = rps(s);
  ck('with the rods in and nothing standing, a reset IS permitted',
    ready.reset_permitted === true && !ready.reset_block, ready.reset_permitted, true);
  var ok = s.handleCommand({ action: 'reset_rps' });
  ck('the press is accepted', ok === null, ok, 'null');
  ck('…and the latch clears', rps(s).scrammed === false, rps(s).scrammed, false);
  ck('…leaving nothing to reset', rps(s).reset_permitted === false, rps(s).reset_permitted, false);

  // --- rod bottom is an INSTRUMENT the permissive reads (HR1), not engine truth ----
  var s2 = svc('pwr', 'hot_full_power');
  secs(s2, 10);
  ck('rods_fully_in reads false at power', s2.engine.getInstruments().rods_fully_in === false,
    s2.engine.getInstruments().rods_fully_in, false);
  s2.handleCommand({ action: 'scram' });
  secs(s2, 10);
  ck('rods_fully_in reads true once the rods are seated',
    s2.engine.getInstruments().rods_fully_in === true, s2.engine.getInstruments().rods_fully_in, true);

  // --- THE TEACHING CASE: a standing trip signal holds the reset off ---------------
  // Recovery has to feel procedural. After a loss of feedwater the SG level trip stays
  // asserted, so the plant cannot be reset until the operator has actually fixed the
  // condition — and the board says which condition that is.
  var s3 = svc('pwr', 'hot_full_power');
  secs(s3, 10);
  s3.handleCommand({ action: 'inject_failure', failure_id: 'loss_of_feedwater', severity: 1.0 });
  secs(s3, 400);
  var stuck = rps(s3);
  ck('loss of feedwater scrams the plant', stuck.scrammed === true, stuck.scrammed, true);
  ck('…and the reset stays blocked on the standing trip signal',
    stuck.reset_permitted === false && stuck.reset_block &&
    stuck.reset_block.reason === 'TRIP_SIGNAL_PRESENT',
    stuck.reset_block && stuck.reset_block.reason, 'TRIP_SIGNAL_PRESENT');
  ck('…naming the channel the operator has to fix',
    !!stuck.reset_block && stuck.reset_block.message.indexOf('steam generator level') >= 0,
    stuck.reset_block && stuck.reset_block.message, 'names steam generator level');
  var r3 = s3.handleCommand({ action: 'reset_rps' });
  ck('…and pressing anyway is refused, not silently ignored',
    !!r3 && r3.type === 'blocked' && r3.reason === 'TRIP_SIGNAL_PRESENT', r3 && r3.reason, 'TRIP_SIGNAL_PRESENT');
  ck('…the plant stays latched', rps(s3).scrammed === true, rps(s3).scrammed, true);
})();

console.log('\n' + B + '──────────' + X);
console.log(B + 'E2E controls: ' + (fail ? R : G) + pass + '/' + (pass + fail) + X);
process.exit(fail ? 1 : 0);