/*
 * run_autoctl.js — validation of the in-stack operator automation (the channel
 * runtime in layers/control/control_kernel.js, defs in the per-plant control
 * modules) against the full M5 stack.
 *
 * Each probe builds a SimulationService, engages a channel set through the
 * command path exactly the way the UI does (set_auto_channel / set_auto_setpoint
 * descend the stack), perturbs the plant with the remaining MANUAL controls, and
 * asserts the automation holds the plant inside its operating band with no scram
 * — plus that the command stream stays sparse (period/deadband gating, no
 * per-evaluation spam). Channel state is asserted from snapshot.automation.
 *
 *   node test/run_autoctl.js
 */
'use strict';
var path = require('path');
function load(p) { require(path.join(__dirname, '..', p)); }
[
  'engines/load_mode.js',
  'engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js',
  'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js',
  'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
  'layers/control/rbmk_control.js', 'engines/rbmk/rbmk_config.js', 'engines/rbmk/rbmk_kinetics.js',
  'engines/rbmk/rbmk_thermal.js', 'engines/rbmk/rbmk_rods.js', 'engines/rbmk/rbmk_instruments.js', 'engines/rbmk/rbmk_engine.js',
  'engines/bwr/bwr_config.js', 'layers/control/bwr_control.js', 'engines/bwr/bwr_vessel.js',
  'engines/bwr/bwr_recirculation.js', 'engines/bwr/bwr_safety_systems.js', 'engines/bwr/bwr_instruments.js', 'engines/bwr/bwr_engine.js',
  'layers/control/control_kernel.js', 'layers/instructor_layer.js', 'layers/simulation_service.js',
].forEach(load);
var RD = globalThis.RD;

// ---------------------------------------------------------------- harness
var T = [];
function test(name, fn) {
  var checks = [];
  var ck = function (desc, observed, pass, expected) {
    checks.push({ desc: desc, observed: observed, expected: expected, pass: !!pass });
  };
  try { fn(ck); } catch (e) { ck('threw: ' + (e && e.message), String(e && e.stack || e), false, 'no throw'); }
  T.push({ name: name, pass: checks.every(function (c) { return c.pass; }), checks: checks });
}
function report() {
  var passS = 0, failS = 0;
  T.forEach(function (t) {
    console.log((t.pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m') + '  \x1b[1m' + t.name + '\x1b[0m');
    t.checks.forEach(function (c) {
      if (!c.pass) console.log('\x1b[31m  ✗\x1b[0m ' + c.desc + '\x1b[2m  [expected ' + c.expected + ', observed ' + c.observed + ']\x1b[0m');
    });
    if (t.pass) passS++; else failS++;
  });
  console.log('\n' + passS + '/' + T.length + ' suites passed');
  if (failS) process.exit(1);
}

// A UI-faithful rig: everything through service.handleCommand; automation-issued
// commands are counted by hooking the layer's handleCommand while its _internal
// flag is up (channel outputs, trips, actuations — all plant-issued traffic).
// selectPlant engages the plant's DEFAULT lineup (e.g. the RBMK AR); the rig
// stands everything down for a clean baseline unless keepDefaults is set.
function rig(plant, initState, dv, keepDefaults) {
  var service = new RD.SimulationService({ seed: 0xA07 });
  service.selectPlant(plant, initState, dv || null);
  if (!keepDefaults) {
    service.handleCommand({ action: 'set_auto_channel', channel_id: 'all', engaged: false });
    // A neutral baseline for isolating automation dynamics: undo the free-play preset
    // letdown alignment (Orifice A) too — with CVCS make-up stood down there is no
    // charging to balance it, and an open letdown would drain the primary on its own.
    if (plant === 'pwr') service.handleCommand({ action: 'set_letdown_orifices', a: false, b: false });
  }
  var sent = [];
  var hook = function () {
    var layer = service.layer;
    if (layer._autoctlHooked) return;
    layer._autoctlHooked = true;
    var orig = layer.handleCommand.bind(layer);
    layer.handleCommand = function (c) { if (layer._internal) sent.push(c); return orig(c); };
  };
  hook();
  var intendedSpeed = 10;
  service.handleCommand({ action: 'set_speed', value: intendedSpeed });   // 1 s sim per cycle
  var self = {
    service: service, sent: sent, rehook: hook,
    snap: function () { return service.assembleSnapshot(); },
    chan: function (id) {
      var ch = service.assembleSnapshot().automation.channels;
      for (var i = 0; i < ch.length; i++) if (ch[i].id === id) return ch[i];
      return null;
    },
    engage: function (ids) {
      ids.forEach(function (id) { service.handleCommand({ action: 'set_auto_channel', channel_id: id, engaged: true }); });
    },
    setSp: function (id, v) { service.handleCommand({ action: 'set_auto_setpoint', channel_id: id, value: v }); },
    cmd: function (c) { if (c && c.action === 'set_speed') intendedSpeed = c.value; return service.handleCommand(c); },
    run: function (simSeconds) {
      // Runs simSeconds of SIM TIME. Driven off service.simTime, NOT a cycle count
      // (#261): one broadcast cycle is `broadcastMs`/1000 × acceleration of sim time,
      // and `broadcastMs` HALVES (NORMAL_MS 100 → TRANSIENT_MS 50) whenever the
      // service decides it is in a transient. The old form looped `simSeconds` cycles
      // and leaned on "~1 s per cycle at 10×", which is true only at the steady
      // cadence — measured across this suite it delivered 7858 s against 8565 s
      // requested (91.7 %), with 12 of 226 calls more than 5 % short, every shortfall
      // during exactly the transients the probes exist to watch. Same failure shape as
      // #245 (a gate silently running below its declared sim rate), reached through the
      // cadence instead of the acceleration.
      //
      // Re-assert the intended speed each cycle. The interactive attention-stop
      // (auto-decelerate to 1× on a new alarm/scram/failure — simulation_service
      // §_attentionStop) is a UI speed policy for a human at the board; a headless
      // automation probe must still get its full sim-time budget, so we override
      // the snap-back here. Automation correctness is independent of speed policy.
      var res, target = service.simTime + Math.ceil(simSeconds), guard = 0;
      while (service.simTime < target && guard++ < 2000000) {
        if (service.timeAcceleration !== intendedSpeed) service.handleCommand({ action: 'set_speed', value: intendedSpeed });
        res = service.advanceCycles(1);
      }
      return res;
    },
  };
  return self;
}
function inst(r) { return r.snap().instruments; }
function ts(r) { return r.snap().true_state; }
function near(v, target, tol) { return Math.abs(v - target) <= tol; }
// Mean true power over ~secs of further running — the rod channel's ±0.5 °C
// Tavg deadband spans several % power, so power breathes inside it and a
// point sample lands on an arbitrary phase; the mean is the honest measure.
function meanPower(r, secs) {
  var sum = 0, n = 0;
  for (var k = 0; k < secs; k++) { r.run(1); sum += ts(r).power_pct; n++; }
  return sum / n;
}
function scrammed(r) { var s = r.snap(); return !!(s.rps_state.scrammed || s.true_state.scrammed); }
// Control-bank position — what the `bang` channels arbitrate on (kernel rodGroup()).
function rodPos(r) {
  var g = r.snap().control_state.rod_groups || [];
  for (var i = 0; i < g.length; i++) if (/control/.test(g[i].id)) return g[i].position_pct;
  return null;
}
// Automation-issued commands only (exclude protection traffic for sparseness).
function autoCmds(r) {
  return r.sent.filter(function (c) {
    return c.action !== 'scram' && c.action !== 'open_porv' && c.action !== 'close_porv' &&
           c.action !== 'set_hpi' && c.action !== 'set_afw' && c.action !== 'set_lpi' && c.action !== 'set_rhr';
  });
}
// Automation traffic as a RATE — commands per minute of SIM TIME (#261).
//
// The sparseness checks below used to assert a raw COUNT against a window stated only
// in the check's own name ("<300 auto commands in 10 min"). Channel output is gated by
// period/deadband, so that count is a rate in disguise and scales with however much sim
// time the run actually got. Measured when run() was fixed to deliver its full budget:
// the BWR probe went 273 → 363 commands with the rate unmoved at 0.606 → 0.605 cmd/s,
// and its margin under `<500` halved from 45.4 % to 27.4 % — a gate that would redden on
// a pure timing change, with no change in controller behaviour. Thresholds below are the
// old ones divided by the 600 s window, so they mean exactly the same thing at 10 min and
// are now indifferent to the window.
function autoCmdRate(r) {
  var mins = r.service.simTime / 60;
  return mins > 0 ? autoCmds(r).length / mins : 0;
}

// ================================================================== PWR
test('PWR · all-auto holds hot full power (10 min)', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.engage(['rods_tavg', 'boron_trim', 'pzr_pressure', 'cvcs_makeup', 'feed_sg', 'steam_dump', 'grid_follow']);
  var sp = r.chan('rods_tavg').setpoint;
  r.run(600);
  var i = inst(r), t = ts(r);
  ck('no scram', scrammed(r), !scrammed(r), 'false');
  // In load-follow the absolute power level is weakly anchored (draw tracks
  // power); rods hold Tavg, so a slow physical drift of a few % is expected.
  ck('power ~100%', t.power_pct.toFixed(1), near(t.power_pct, 100, 6), '100±6');
  ck('tavg at setpoint', i.tavg.toFixed(2) + ' vs sp ' + sp.toFixed(2), near(i.tavg, sp, 1.0), 'sp±1.0');
  ck('pressure in band', t.pressure_mpa.toFixed(2), near(t.pressure_mpa, 15.41, 0.35), '15.41±0.35');
  ck('SG level at setpoint', i.sg_level.toFixed(1), near(i.sg_level, r.chan('feed_sg').setpoint, 3), 'sp±3');
  ck('sparse commands', autoCmdRate(r).toFixed(1) + '/min', autoCmdRate(r) < 30, '<30 auto commands per sim-minute');
});

test('PWR · all-auto except grid: demand swing 1000→700→1000', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.engage(['rods_tavg', 'boron_trim', 'pzr_pressure', 'cvcs_makeup', 'feed_sg', 'steam_dump']);
  // grid stays manual (load follow OFF = the user's slider)
  var sp = r.chan('rods_tavg').setpoint;
  r.cmd({ action: 'set_steam_demand', mwe: 70 });
  r.run(800);
  var pDown = meanPower(r, 100);
  var t = ts(r), i = inst(r);
  ck('no scram at 70 MW', scrammed(r), !scrammed(r), 'false');
  // Pressure-compensated governor (EHC load control): delivered steam tracks
  // the demand nearly 1:1 at any SG pressure — a 70 MW ask settles ~70%
  // mean (power breathes a few % inside the rod channel's Tavg deadband).
  ck('power followed demand down (mean)', pDown.toFixed(1), near(pDown, 71, 5), '71±5 (compensated governor delivers the ask)');
  // Sliding Tavg program (SS-2): Tref slides DOWN with load, and the rods walk Tavg
  // down to it — the old flat "tavg restored to the engage value" was the P4 defect.
  var spDown = r.chan('rods_tavg').setpoint;
  // Shallow program (297→304): a 30 % load drop slides Tref ~2.1 °C — assert > 1.5.
  ck('Tref slid down with load', spDown.toFixed(2) + ' vs full-load ' + sp.toFixed(2), spDown < sp - 1.5, '< full-load − 1.5 °C');
  ck('tavg tracked the program down', i.tavg.toFixed(2) + ' vs Tref ' + spDown.toFixed(2), near(i.tavg, spDown, 1.5), 'Tref±1.5');
  ck('SG level held', i.sg_level.toFixed(1), near(i.sg_level, r.chan('feed_sg').setpoint, 4), 'sp±4');
  r.cmd({ action: 'set_steam_demand', mwe: 100 });
  r.run(800);
  var pUp = meanPower(r, 100);
  i = inst(r);
  ck('no scram back at 100 MW', scrammed(r), !scrammed(r), 'false');
  ck('power followed demand up (mean)', pUp.toFixed(1), near(pUp, 100, 6), '100±6');
  var spUp = r.chan('rods_tavg').setpoint;
  ck('tavg back on program at full load', i.tavg.toFixed(2) + ' vs Tref ' + spUp.toFixed(2), near(i.tavg, spUp, 1.5), 'Tref±1.5');
});

test('PWR · secondary-on-auto while the operator moves rods', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.engage(['feed_sg', 'steam_dump', 'pzr_pressure', 'cvcs_makeup']);
  r.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: -60, speed: 'normal' });
  r.run(300);
  var i = inst(r);
  ck('no scram', scrammed(r), !scrammed(r), 'false');
  ck('SG level held through the power dip', i.sg_level.toFixed(1), near(i.sg_level, r.chan('feed_sg').setpoint, 4), 'sp±4');
  ck('pressure held', ts(r).pressure_mpa.toFixed(2), near(ts(r).pressure_mpa, 15.41, 0.4), '15.41±0.4');
});

test('PWR · rod auto: T-ref on the load program, deadband lockup, manual motion → MAN', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.run(10);
  var tavgAtEngage = inst(r).tavg;
  r.engage(['rods_tavg']);
  var c = r.chan('rods_tavg');
  // Tref is programmed on load (SS-2), not captured; at full power the program value
  // equals the operating Tavg, so engaging here holds the plant where it sits.
  ck('T-ref = full-power program point ≈ operating Tavg', c.setpoint.toFixed(2) + ' vs tavg ' + tavgAtEngage.toFixed(2),
    near(c.setpoint, tavgAtEngage, 1.0), 'tavg ±1.0');
  // Steady plant inside the ±0.8 °C deadband: the channel locks up (no nudges).
  var before = r.sent.filter(function (x) { return x.action === 'rod_nudge'; }).length;
  r.run(120);
  var during = r.sent.filter(function (x) { return x.action === 'rod_nudge'; }).length - before;
  ck('deadband lockup — no rod motion at steady state', during, during <= 2, '≤2 nudges in 120 s');
  // Manual rod motion takes the channel to MAN (a rod command on its group).
  r.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: -8, speed: 'slow' });
  c = r.chan('rods_tavg');
  ck('manual rod motion disengaged the channel', c.engaged, c.engaged === false, 'false');
  ck('note says manual control taken', c.note, /manual/.test(c.note), 'mentions manual');
  // Motion on a DIFFERENT group must NOT disengage it.
  r.engage(['rods_tavg']);
  r.cmd({ action: 'rod_nudge', group_id: 'shutdown_rods', steps: -4, speed: 'slow' });
  ck('other-group motion leaves it engaged', r.chan('rods_tavg').engaged, r.chan('rods_tavg').engaged === true, 'true');
});

test('PWR · rod channel disengages itself on scram', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.engage(['rods_tavg']);
  r.run(10);
  r.cmd({ action: 'scram' });
  r.run(30);
  var c = r.chan('rods_tavg');
  ck('scrammed', scrammed(r), scrammed(r), 'true');
  ck('rod channel off', c.engaged, !c.engaged, 'false');
  ck('note explains why', c.note, /scram/.test(c.note), 'mentions scram');
});

// ---------------------------------------------------------------------------
// DISCRIMINATING per-channel probes (#154 item 10).
//
// The suite above engages SEVEN channels at once and asserts aggregate plant
// state — power, Tavg, pressure, SG level. Any one of those bands can be held by
// a channel that is not the one under test, so a dead channel hides. MEASURED by
// injection on 2026-07-31: with the kernel neutered so a channel reports
// `engaged` and does nothing, `cvcs_makeup`, `boron_trim`, `grid_follow`,
// `boron_conc` and (on the ENGAGE direction) `steam_dump` were each a complete
// no-op at a green 24/24. `boron_conc` is `defaultOn`, so it ships inert in every
// free-play preset lineup.
//
// Each probe below therefore engages ONE channel — plus only what it `requires` —
// and asserts an effect nothing else in the lineup can produce. Every check was
// verified to go RED against the neutered kernel; the dead-channel number is
// quoted beside each band so a future edit can tell a real regression from a
// re-fit. The expected values are what the plant does, not what the suite wanted:
// where automation cannot fully win (cvcs against both letdown orifices) the
// probe uses the case it can.
//
// If you repeat that injection, neuter the ENGAGE direction ONLY. Blanking a
// `mode` channel's disengage as well makes the probe LIE: the rig stands every
// channel down at t=0, and it is that disengage which puts the plant into manual,
// so blanking both leaves it in whatever AUTO the initial condition shipped with
// and the plant holds itself. Measured — with both directions blanked, the
// steam_dump and pzr_pressure probes below pass against a completely dead
// channel; with only engage blanked they fail on four and two checks.
test('PWR · cvcs_makeup HOLDS primary inventory against letdown (#154)', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.engage(['cvcs_makeup']);
  // One orifice is a deficit automatic make-up can actually carry; both together
  // exceed max charging and the level falls either way (55 → 44 auto / 16.9 dead),
  // which would assert "falls slower", not "holds".
  r.cmd({ action: 'set_letdown_orifices', a: true, b: false });
  var l0 = inst(r).pzr_level, lo = l0;
  for (var k = 0; k < 60; k++) { r.run(15); if (inst(r).pzr_level < lo) lo = inst(r).pzr_level; }
  ck('charging went to AUTO on engage', r.snap().control_state.cvcs_auto,
    r.snap().control_state.cvcs_auto === true, 'true');
  // Measured: 54.9 % held with the channel, 22.5 % with it dead.
  ck('level held against an open letdown orifice', inst(r).pzr_level.toFixed(1),
    near(inst(r).pzr_level, l0, 3), l0.toFixed(1) + ' ±3 % (dead channel: 22.5)');
  ck('and never dipped on the way', lo.toFixed(1), lo > l0 - 3, '> ' + (l0 - 3).toFixed(1) + ' %');
  ck('no scram', scrammed(r), !scrammed(r), 'false');
});

test('PWR · boron_trim buys back rod travel at the top of the bank (#154)', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.engage(['rods_tavg', 'boron_trim']);
  // Borate gently by hand (0.05 ppm/s — the tuned makeup rate; 0.5 is a firehose
  // that scrams the plant) until the auto rods have walked out past `hi` = 96 %.
  // From the HFP lineup they start at 92.0 %, so this is ~3 plant-minutes.
  r.cmd({ action: 'set_boron_adjust', rate: 0.05 });
  var guard = 0;
  while (rodPos(r) < 96 && guard++ < 60 && !scrammed(r)) r.run(60);
  r.cmd({ action: 'set_boron_adjust', rate: 0 });
  var posHigh = rodPos(r);
  ck('rods driven out past the dilute threshold', posHigh.toFixed(1), posHigh >= 96, '≥ 96 %');
  r.run(2400);
  var dilutes = r.sent.filter(function (c) { return c.action === 'set_boron_adjust' && c.rate < 0; });
  ck('the channel answered with a DILUTE', dilutes.length, dilutes.length >= 1, '≥ 1 dilute command');
  // Measured: rods recover to 88.6 % (inside hiStop = 90). With the channel dead
  // they keep going and park at 100.0 — out of travel, which is the exact loss of
  // control authority this channel exists to prevent.
  ck('rods walked back into band', rodPos(r).toFixed(1), rodPos(r) <= 90, '≤ 90 % (dead channel: 100.0)');
  ck('channel reports in band', JSON.stringify(r.chan('boron_trim').note),
    /in band/.test(r.chan('boron_trim').note), 'in band');
  ck('no scram', scrammed(r), !scrammed(r), 'false');
});

test('PWR · boron_conc delivers a metered dose and STOPS (#154)', function (ck) {
  // Mode 5, not at power: this is where a plant actually meters batch boron, and
  // at power the dose is a reactivity event rather than a chemistry one. Measured
  // with the control bank in manual (this channel does not engage the rods), even
  // a 10 ppm ask trips the plant — the test would then be asserting the trip.
  var r = rig('pwr', 'cold_shutdown');
  r.engage(['boron_conc']);
  var b0 = ts(r).boron_ppm, target = Math.round(b0) + 40;
  r.setSp('boron_conc', target);
  r.run(1800);
  // Measured: 857 → 897.0 against an 897 target. Dead channel: 856.8, i.e. the
  // ask is simply ignored.
  ck('dose delivered to target', ts(r).boron_ppm.toFixed(1),
    near(ts(r).boron_ppm, target, 3), target + ' ±3 ppm (dead channel: unmoved)');
  var bDone = ts(r).boron_ppm;
  r.run(1800);
  // The totalizer stops the dose — it does NOT close the loop on the analyzer, so
  // a delivered dose must not keep creeping. This half also fails on a channel
  // that seeks continuously.
  ck('and stops there — the totalizer is spent, not a servo', ts(r).boron_ppm.toFixed(1),
    near(ts(r).boron_ppm, bDone, 1), bDone.toFixed(1) + ' ±1 ppm after another 30 min');
  ck('no scram', scrammed(r), !scrammed(r), 'false');
});

test('PWR · grid_follow walks turbine demand off the pinned full-load ask (#154)', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.engage(['grid_follow']);
  ck('load mode is FOLLOW', r.snap().control_state.load_mode,
    r.snap().control_state.load_mode === 'follow', 'follow');
  r.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: -40, speed: 'normal' });
  r.run(900);
  var demand = r.snap().control_state.steam_demand_mwe, power = ts(r).power_pct;
  // In MANUAL the demand is a setpoint the operator owns: it sits at EXACTLY the
  // 100 MWe it was left at however far power falls (measured 100.0 with the
  // channel dead, against 96.2 in follow). A bigger insertion separates them
  // further but takes the manual case to a trip on the overcool, which would let
  // this pass for the wrong reason.
  ck('demand came off the full-load ask', demand.toFixed(1), demand < 99, '< 99 MWe (dead channel: 100.0)');
  ck('demand tracks reactor power', demand.toFixed(1) + ' vs power ' + power.toFixed(1),
    near(demand, power, 1.0), 'power ±1.0');
  ck('no scram', scrammed(r), !scrammed(r), 'false');
});

test('PWR · steam_dump carries a turbine trip off the code safeties (#154)', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.engage(['steam_dump']);
  r.run(30);
  r.cmd({ action: 'inject_failure', failure_id: 'turbine_trip' });
  var peak = 0, dmax = 0, lifted = false;
  for (var k = 0; k < 600; k++) {
    r.run(1);
    var t = ts(r), c = r.snap().control_state;
    if (t.steam_pressure_mpa > peak) peak = t.steam_pressure_mpa;
    if ((c.steam_dump_pct || 0) > dmax) dmax = c.steam_dump_pct;
    if (t.sg_safety_open) lifted = true;
  }
  ck('dump went to AUTO on engage', r.snap().control_state.steam_dump_auto,
    r.snap().control_state.steam_dump_auto === true, 'true');
  ck('dump opened for the rejection', dmax.toFixed(1), dmax > 20, '> 20 % (measured 92.9)');
  // The whole point of the channel: the bypass takes the steam the turbine stopped
  // taking, so the generator never reaches its code safeties. Measured peak 7.73 MPa
  // (1121 psi) with the channel, 9.43 MPa (1368 psi) with it dead — and dead, the
  // safeties DO lift.
  ck('SG pressure stayed off the safeties', peak.toFixed(2) + ' MPa', peak < 9.0,
    '< 9.0 MPa / 1305 psi (dead channel: 9.43)');
  ck('code safeties never lifted', String(lifted), lifted === false, 'false (dead channel: true)');
});

test('PWR · pzr_pressure returns the plant to its pressure setpoint (#154)', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  // Manual spray is a fire-hose: any opening drops indicated pressure to ~7.5 MPa
  // and trips the plant on low pressure, so this is deliberately the POST-TRIP
  // pressure-restoration case rather than an at-power one.
  r.cmd({ action: 'set_spray', pct: 40 });
  // THE TROUGH, not a sample point (2026-08-04, #337). This read pressure once, at 90 s, and
  // called it the dip. Since #337 safety injection drives a pressurizer INSURGE, so the blast
  // no longer runs away: SI actuates and ARRESTS the fall at its own setpoint, then refills the
  // plant. Measured on this rig — trough **12.32 MPa (1787 psi)** at ~44 s, SI in at ~48 s, and
  // by the 90 s sample pressure is back UP at 15.89 MPa (2305 psi) with the pressurizer solid.
  // The old single sample was only ever the trough because injection could not push back.
  //
  // RE-BANDED 12.0 → 13.0 MPa, and that IS a loosening — say so rather than imply it is neutral
  // (HR10). The plant can no longer be sprayed below ~12.3 MPa at power, because SI catches it;
  // 13.0 still guarantees the ~350 psi of depressurization this probe needs for its recovery
  // check to mean anything, and it passes on the pre-#337 engine, which troughs near 7.5 MPa.
  var dip = ts(r).pressure_mpa;
  for (var d = 0; d < 90; d++) { r.run(1); if (ts(r).pressure_mpa < dip) dip = ts(r).pressure_mpa; }
  r.cmd({ action: 'set_spray', pct: 0 });
  r.engage(['pzr_pressure']);
  r.run(900);
  ck('spray blast dropped pressure', dip.toFixed(2) + ' MPa', dip < 13.0, '< 13.0 MPa');
  ck('heaters and spray both in AUTO', r.snap().control_state.heater_auto + '/' + r.snap().control_state.spray_auto,
    r.snap().control_state.heater_auto === true && r.snap().control_state.spray_auto === true, 'true/true');
  // Measured 15.41 MPa (2235 psi) — exactly the setpoint. With the channel dead the
  // plant self-repressurizes past it to 16.02 MPa (2323 psi) with nothing checking
  // the rise.
  ck('pressure recovered to setpoint', ts(r).pressure_mpa.toFixed(2) + ' MPa',
    near(ts(r).pressure_mpa, 15.41, 0.15), '15.41 ±0.15 MPa (dead channel: 16.02)');
});

// ================================================================== RBMK
// The rod channel drives the Automatic Regulator (AR) group — fine steps
// (~2 pcm vs the manual bank's ~35), so the hold band is tight; the re-center
// channel hands the standing burden back to the manual bank when the AR nears
// its travel limits (real RBMK practice).
test('RBMK · AR+feed+BOP hold 50% power (10 min)', function (ck) {
  var r = rig('rbmk', '50_percent', 'post_chernobyl');
  r.engage(['rods_power', 'ar_recenter', 'feed_drum', 'grid_follow', 'steam_dump']);
  var sp = r.chan('rods_power').setpoint;
  r.run(600);
  var t = ts(r), i = inst(r);
  ck('no scram', scrammed(r), !scrammed(r), 'false');
  ck('power at setpoint', t.power_pct.toFixed(1) + ' vs sp ' + sp.toFixed(1), near(t.power_pct, sp, 1.5), 'sp±1.5');
  ck('manual bank untouched (AR does the fine work)',
    r.sent.filter(function (c) { return c.action === 'rod_nudge' && c.group_id === 'control_rods'; }).length,
    r.sent.filter(function (c) { return c.action === 'rod_nudge' && c.group_id === 'control_rods'; }).length === 0, '0 manual-bank nudges');
  ck('drum level at setpoint', i.drum_level.toFixed(1), near(i.drum_level, r.chan('feed_drum').setpoint, 4), 'sp±4');
});

test('RBMK · auto power maneuver 50→60% on the AR setpoint', function (ck) {
  var r = rig('rbmk', '50_percent', 'post_chernobyl');
  r.engage(['rods_power', 'ar_recenter', 'feed_drum', 'grid_follow', 'steam_dump']);
  r.run(60);
  r.setSp('rods_power', 60);
  r.run(800);
  var t = ts(r);
  ck('no scram', scrammed(r), !scrammed(r), 'false');
  ck('power reached 60%', t.power_pct.toFixed(1), near(t.power_pct, 60, 2), '60±2');
});

test('RBMK · AR defaults to AUTO where the state parks it with authority', function (ck) {
  // The plant's normal lineup (free play / reset): AR in AUTO, capturing the
  // CURRENT power as its setpoint — never an authored number, which would
  // fight every non-full-power state. selectPlant engages defaults in-stack.
  [['full_power', true], ['50_percent', true], ['hot_startup', false], ['low_power_xenon', false]]
    .forEach(function (tc) {
      var r = rig('rbmk', tc[0], tc[0] === 'low_power_xenon' ? 'pre_chernobyl' : 'post_chernobyl', true);
      var c = r.chan('rods_power');
      ck(tc[0] + ' → AR ' + (tc[1] ? 'AUTO' : 'MAN'), c.engaged, c.engaged === tc[1], String(tc[1]));
      if (tc[1]) {
        ck(tc[0] + ' setpoint captured from current power', c.setpoint.toFixed(1),
          near(c.setpoint, r.snap().instruments.power_range, 2), 'current power ±2');
      }
    });
  // Scrammed plant: the default must NOT engage (nothing to hold).
  var rs = rig('rbmk', 'full_power', 'post_chernobyl');
  rs.cmd({ action: 'manual_scram' });
  rs.run(10);
  rs.service.layer.engageDefaults();
  ck('scrammed plant → AR stays MAN', rs.chan('rods_power').engaged,
    !rs.chan('rods_power').engaged, 'false');
});

test('RBMK · AR re-center: manual bank takes the burden at the travel limit', function (ck) {
  // Drive the AR toward its limit with a big setpoint swing and confirm the
  // re-center channel moves the MANUAL bank so the AR recovers authority.
  var r = rig('rbmk', '50_percent', 'post_chernobyl');
  r.engage(['rods_power', 'ar_recenter', 'feed_drum', 'grid_follow', 'steam_dump']);
  r.run(30);
  r.setSp('rods_power', 75);   // pulls the AR past its re-center band
  r.run(1500);
  var mb = r.sent.filter(function (c) { return c.action === 'rod_nudge' && c.group_id === 'control_rods'; });
  var ar = r.snap().control_state.rod_groups.filter(function (g) { return g.id === 'auto_rods'; })[0];
  ck('no scram', scrammed(r), !scrammed(r), 'false');
  ck('manual bank stepped in', mb.length, mb.length > 0, '>0 manual-bank nudges');
  ck('AR back inside its authority band', (100 - ar.position_pct).toFixed(0) + '% inserted',
    (100 - ar.position_pct) > 20 && (100 - ar.position_pct) < 80, '20–80% inserted');
  ck('power reached 75%', ts(r).power_pct.toFixed(1), near(ts(r).power_pct, 75, 2.5), '75±2.5');
});

// ================================================================== BWR
test('BWR · all-auto holds full power (10 min)', function (ck) {
  var r = rig('bwr', 'full_power');
  r.engage(['recirc_power', 'rods_trim', 'feed_level', 'turbine_pressure', 'steam_dump']);
  var sp = r.chan('recirc_power').setpoint;
  r.run(600);
  var t = ts(r), i = inst(r);
  ck('no scram', scrammed(r), !scrammed(r), 'false');
  ck('power at setpoint', t.power_pct.toFixed(1) + ' vs sp ' + sp.toFixed(1), near(t.power_pct, sp, 2.5), 'sp±2.5');
  ck('vessel level at setpoint', i.vessel_level.toFixed(1), near(i.vessel_level, r.chan('feed_level').setpoint, 4), 'sp±4');
  ck('sparse commands', autoCmdRate(r).toFixed(1) + '/min', autoCmdRate(r) < 50, '<50 auto commands per sim-minute');
});

test('BWR · auto power maneuver 100→80% via recirculation', function (ck) {
  var r = rig('bwr', 'full_power');
  r.engage(['recirc_power', 'feed_level', 'turbine_pressure', 'steam_dump']);
  r.run(60);
  r.setSp('recirc_power', 80);
  r.run(800);
  var t = ts(r), i = inst(r);
  ck('no scram', scrammed(r), !scrammed(r), 'false');
  ck('power reached 80%', t.power_pct.toFixed(1), near(t.power_pct, 80, 3), '80±3');
  ck('vessel level held', i.vessel_level.toFixed(1), near(i.vessel_level, r.chan('feed_level').setpoint, 4), 'sp±4');
});

test('BWR · feed-level auto keeps level while the operator trims recirc', function (ck) {
  // (An INSTANT deep recirc cut trips the bare plant on low vessel pressure —
  // verified without automation — so the manual perturbation here is a trim,
  // not a step to half flow.)
  var r = rig('bwr', 'full_power');
  r.engage(['feed_level', 'turbine_pressure', 'steam_dump']);
  r.cmd({ action: 'set_recirc_flow', pct: 34 });
  r.run(300);
  var t = ts(r), i = inst(r);
  ck('no scram', scrammed(r), !scrammed(r), 'false');
  ck('power dropped with recirc (manual lever still works)', t.power_pct.toFixed(1), t.power_pct < 92, '<92');
  ck('vessel level held', i.vessel_level.toFixed(1), near(i.vessel_level, r.chan('feed_level').setpoint, 4), 'sp±4');
});

// ============================================================ cross-cutting
test('Automation reads instruments, not truth (HR1 probe)', function (ck) {
  // Stick the SG-level instrument HIGH: the feed controller must throttle back
  // even though the TRUE level then falls — fooled exactly like an operator.
  var r = rig('pwr', 'hot_full_power');
  r.engage(['feed_sg']);
  r.run(30);
  var before = ts(r).sg_level_pct;
  r.cmd({ action: 'set_instrument_failure', instrument_id: 'sg_level', mode: 'stuck', value: 80 });
  r.run(240);
  var t = ts(r);
  ck('controller chased the lying instrument (true level fell)', t.sg_level_pct.toFixed(1) + ' from ' + before.toFixed(1), t.sg_level_pct < before - 3, 'true level drops >3%');
});

// ---------------------------------------------------------------- RPS reset (#228)
// The kernel has always SENT `reset_rps` and only the PWR engine had a handler. It also
// DISCARDED the engine's response and reached RODS_NOT_INSERTED by inference from
// `scrammed` still being true — so on RBMK and BWR the operator was refused with "trip
// breakers reset only with all rods inserted" while every rod read 0.0 %. A refusal that
// names a satisfied precondition is worse than no reset at all: it sends you hunting a
// rod fault that does not exist.
//
// Run for ALL THREE plants deliberately. The defect was invisible for months precisely
// because every test that touched reset_rps was PWR-only (ops_pwr.js), which is the same
// wrong-layer/wrong-plant blind spot CLAUDE.md warns about.
[['pwr', 'hot_full_power', null], ['rbmk', '50_percent', 'post_chernobyl'], ['bwr', 'full_power', null]]
.forEach(function (P) {
  test(P[0].toUpperCase() + ' · RPS reset works, and refuses for the RIGHT reason (#228)', function (ck) {
    var r = rig(P[0], P[1], P[2]);
    r.run(10);
    ck('not scrammed to begin with', scrammed(r), !scrammed(r), 'false');

    r.cmd({ action: 'scram' });
    r.run(5);
    ck('scram latched', scrammed(r), scrammed(r), 'true');

    // Rods are still travelling: the interlock must hold, and it must be the ROD
    // interlock talking — not an engine that simply has no handler.
    var early = r.cmd({ action: 'reset_rps' });
    var rods = r.snap().control_state.rod_groups || [];
    var allIn = rods.every(function (g) { return g.position_pct <= 2.0; });
    if (!allIn) {
      // Assert the INTENT, not the envelope. #228 wrote this against `{type:'refused',
      // code:'RODS_NOT_INSERTED'}`; #75 then normalised every RPS refusal to
      // `{type:'blocked', code:'INTERLOCK', reason:'RODS_NOT_INSERTED'}` on purpose, and
      // this check went red on the merge for pinning the old shape rather than the claim.
      // What it actually cares about: the plant said no, and it named the ROD interlock
      // when it did. Both spellings satisfy that, and neither is COMMAND_ERROR.
      var named = early && (early.code === 'RODS_NOT_INSERTED' || early.reason === 'RODS_NOT_INSERTED');
      ck('reset refused while the rods are still out, naming the rod interlock',
        early && ((early.code || '') + '/' + (early.reason || '')),
        !!(early && (early.type === 'refused' || early.type === 'blocked') && named),
        'refused|blocked + RODS_NOT_INSERTED');
    }
    ck('a refusal is never COMMAND_ERROR — the engine must implement the reset',
      early ? (early.code || early.type) : 'null', !(early && early.code === 'COMMAND_ERROR'),
      'not COMMAND_ERROR');

    r.run(180);                                  // let every group drive fully in
    rods = r.snap().control_state.rod_groups || [];
    ck('all rods inserted after the scram',
      rods.map(function (g) { return g.id + '=' + g.position_pct.toFixed(1); }).join(' '),
      rods.length > 0 && rods.every(function (g) { return g.position_pct <= 2.0; }), 'all <= 2 %');

    var resp = r.cmd({ action: 'reset_rps' });
    r.run(2);
    // The claim: with the stated precondition satisfied, the reset is ACCEPTED. Before
    // #228 this returned RODS_NOT_INSERTED on rbmk/bwr with the rods measurably in.
    ck('reset accepted once the rods are in', JSON.stringify(resp), resp == null, 'null');
    ck('scram latch cleared', scrammed(r), !scrammed(r), 'false');
  });
});

// A stand-down note is the ONLY statement of why a channel switched itself off, and
// #214 put it on screen (the System Scanner). That makes its lifetime load-bearing:
// stepAutomation skips disengaged channels, so before this the note was write-once and
// went on asserting a condition that had since cleared. MEASURED on the old code —
// isolate feedwater, restore it, and feed_sg still read 'off — main feedwater isolated
// (AFW has the SGs)' forever. These assert the note is retired with its cause, and that
// clearing it does NOT quietly re-engage the channel: standing back up is the operator's
// call, which is the entire point of a stand-down.
test('A stand-down note is retired when its cause clears (#214)', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.engage(['feed_sg']);
  r.run(30);
  var c = function () { return r.snap().automation.channels.filter(function (x) { return x.id === 'feed_sg'; })[0]; };
  ck('engaged before the isolation', c().engaged, c().engaged === true, 'true');

  r.cmd({ action: 'isolate_feedwater', active: true });
  r.run(15);
  var iso = c();
  ck('isolation stands the channel down', iso.engaged, iso.engaged === false, 'false');
  ck('…and says why', JSON.stringify(iso.note), /main feedwater isolated/.test(iso.note), 'names the isolation');

  r.cmd({ action: 'isolate_feedwater', active: false });
  r.run(15);
  var back = c();
  // The claim under test. Without the standDown bookkeeping this string persists.
  ck('note is retired once feedwater is restored', JSON.stringify(back.note), back.note === '', '""');
  ck('but the channel stays OFF — re-engaging is the operator\'s call', back.engaged, back.engaged === false, 'false');

  // A manual takeover is NOT a plant condition: nothing clears it but the operator.
  r.cmd({ action: 'set_auto_channel', channel_id: 'feed_sg', engaged: true });
  r.run(10);
  r.cmd({ action: 'set_feed_pump_speed', pct: 100 });   // what the board's MAN button issues
  r.run(30);
  var man = c();
  ck('manual takeover notes itself', JSON.stringify(man.note), /manual control taken/.test(man.note), 'names the takeover');
  ck('…and does not time out on its own', man.engaged, man.engaged === false, 'false');
});

test('Instructed content gets a clean board + its authored preset (M5)', function (ck) {
  // start_scenario must not inherit free-play channel state: defaults are
  // skipped, then the scenario's auto_channels engage.
  if (!RD.SCENARIOS) { ck('scenarios loaded elsewhere (run_campaign covers this)', 'skip', true, 'skip'); return; }
  ck('covered by run_campaign functional probes', 'ok', true, 'ok');
});

// ============================================================ time acceleration
// Channels run in-stack at a fixed sim-time cadence, so time acceleration no
// longer changes controller behavior at all — no fast-forward handoff, no
// plant-side fallback. The same channel set must hold the same bands at 3600×.
function fastHold(ck, plant, init, dv, channels, powerSp, tol) {
  var r = rig(plant, init, dv);
  r.engage(channels);
  r.cmd({ action: 'set_speed', value: 3600 });
  var cycles = 0;
  while (r.snap().metadata.sim_time < 1800 && cycles++ < 100) r.service.advanceCycles(1);
  var t = ts(r);
  ck('no scram at 3600×', scrammed(r), !scrammed(r), 'false');
  ck('power in band at 3600×', t.power_pct.toFixed(1), near(t.power_pct, powerSp, tol), powerSp + '±' + tol);
}
test('PWR · all-auto survives 30 min at 3600×', function (ck) {
  fastHold(ck, 'pwr', 'hot_full_power', null,
    ['rods_tavg', 'boron_trim', 'pzr_pressure', 'cvcs_makeup', 'feed_sg', 'steam_dump', 'grid_follow'], 100, 6);
});
test('RBMK · all-auto survives 30 min at 3600× (xenon drift)', function (ck) {
  fastHold(ck, 'rbmk', '50_percent', 'post_chernobyl',
    ['rods_power', 'ar_recenter', 'feed_drum', 'grid_follow', 'steam_dump'], 50, 6);
});
test('BWR · all-auto survives 30 min at 3600×', function (ck) {
  fastHold(ck, 'bwr', 'full_power', null,
    ['recirc_power', 'rods_trim', 'feed_level', 'turbine_pressure', 'steam_dump'], 100, 4);
});

test('3600× keeps the PID engaged — no plant-side handoff (feed stays uncoupled)', function (ck) {
  var r = rig('rbmk', '50_percent', 'post_chernobyl');
  r.engage(['rods_power', 'ar_recenter', 'feed_drum', 'grid_follow', 'steam_dump']);
  r.cmd({ action: 'set_speed', value: 3600 });
  var cycles = 0;
  while (r.snap().metadata.sim_time < 600 && cycles++ < 40) r.service.advanceCycles(1);
  ck('feed channel still engaged at 3600×', r.chan('feed_drum').engaged, r.chan('feed_drum').engaged === true, 'true');
  ck('feed NOT handed to load coupling', r.snap().control_state.feed_auto_coupled,
    r.snap().control_state.feed_auto_coupled === false, 'false');
  r.cmd({ action: 'set_speed', value: 10 });
  r.run(300);
  var t = ts(r);
  ck('no scram after slow-down', scrammed(r), !scrammed(r), 'false');
  ck('power in the tight band', t.power_pct.toFixed(1), near(t.power_pct, 50, 4), '50±4');
  ck('drum level held', inst(r).drum_level.toFixed(1), near(inst(r).drum_level, r.chan('feed_drum').setpoint, 4), 'sp±4');
});

// ============================================================ save / rewind
test('Automation state survives save/load (engaged + setpoint + dynamics)', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.engage(['feed_sg', 'rods_tavg']);
  r.setSp('feed_sg', 70);
  r.run(120);
  var save = r.service.saveState();
  var iSaved = save.control_failure.automation.channels.feed_sg.I;
  ck('save carries automation state', !!save.control_failure.automation, !!save.control_failure.automation, 'present');
  // Perturb: disengage everything, move the plant on manual.
  r.cmd({ action: 'set_auto_channel', channel_id: 'all', engaged: false });
  r.cmd({ action: 'set_feedwater_flow', pct: 40 });
  r.run(60);
  // Restore: channels come back engaged with their setpoints and integrators.
  r.cmd({ action: 'load_state', state: save });
  r.rehook();   // load rebuilds the layer — re-attach the command counter
  var c = r.chan('feed_sg');
  ck('feed channel re-engaged', c.engaged, c.engaged === true, 'true');
  ck('setpoint restored', c.setpoint, c.setpoint === 70, '70');
  ck('integrator restored', String(r.service.layer.byId.feed_sg.I), r.service.layer.byId.feed_sg.I === iSaved, String(iSaved));
  ck('rod channel re-engaged', r.chan('rods_tavg').engaged, r.chan('rods_tavg').engaged === true, 'true');
  r.run(120);
  ck('holds level after restore', inst(r).sg_level.toFixed(1), near(inst(r).sg_level, 70, 4), '70±4');
});

test('Rewind restores controller dynamics exactly (no integrator ghost)', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.engage(['feed_sg']);
  r.run(60);   // sandbox checkpoints exist (15 s cadence)
  r.cmd({ action: 'rewind', steps: 2 });
  r.rehook();  // rewind rebuilds the layer
  var c = r.chan('feed_sg');
  ck('channel still engaged after rewind', c.engaged, c.engaged === true, 'true');
  r.run(5);
  ck('stepped after rewind without throwing', 'ok', true, 'ok');
  ck('integrator restored (not null)', String(r.service.layer.byId.feed_sg.I), r.service.layer.byId.feed_sg.I != null, 'not null');
});

report();
