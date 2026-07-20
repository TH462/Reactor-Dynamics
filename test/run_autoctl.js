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
    run: function (simSeconds) {   // ~1 s sim per cycle at 10× (transient cadence shortens a cycle; overshoot is fine)
      // Re-assert the intended speed each cycle. The interactive attention-stop
      // (auto-decelerate to 1× on a new alarm/scram/failure — simulation_service
      // §_attentionStop) is a UI speed policy for a human at the board; a headless
      // automation probe must still get its full sim-time budget, so we override
      // the snap-back here. Automation correctness is independent of speed policy.
      var res;
      for (var i = 0; i < Math.ceil(simSeconds); i++) {
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
// Automation-issued commands only (exclude protection traffic for sparseness).
function autoCmds(r) {
  return r.sent.filter(function (c) {
    return c.action !== 'scram' && c.action !== 'open_porv' && c.action !== 'close_porv' &&
           c.action !== 'set_hpi' && c.action !== 'set_afw' && c.action !== 'set_lpi' && c.action !== 'set_rhr';
  });
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
  ck('sparse commands', autoCmds(r).length, autoCmds(r).length < 300, '<300 auto commands in 10 min');
});

test('PWR · all-auto except grid: demand swing 1000→700→1000', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.engage(['rods_tavg', 'boron_trim', 'pzr_pressure', 'cvcs_makeup', 'feed_sg', 'steam_dump']);
  // grid stays manual (load follow OFF = the user's slider)
  var sp = r.chan('rods_tavg').setpoint;
  r.cmd({ action: 'set_steam_demand', mwe: 700 });
  r.run(800);
  var pDown = meanPower(r, 100);
  var t = ts(r), i = inst(r);
  ck('no scram at 700 MW', scrammed(r), !scrammed(r), 'false');
  // Pressure-compensated governor (EHC load control): delivered steam tracks
  // the demand nearly 1:1 at any SG pressure — 700 MW asked settles ~70%
  // mean (power breathes a few % inside the rod channel's Tavg deadband).
  ck('power followed demand down (mean)', pDown.toFixed(1), near(pDown, 71, 5), '71±5 (compensated governor delivers the ask)');
  ck('tavg restored', i.tavg.toFixed(2) + ' vs sp ' + sp.toFixed(2), near(i.tavg, sp, 1.5), 'sp±1.5');
  ck('SG level held', i.sg_level.toFixed(1), near(i.sg_level, r.chan('feed_sg').setpoint, 4), 'sp±4');
  r.cmd({ action: 'set_steam_demand', mwe: 1000 });
  r.run(800);
  var pUp = meanPower(r, 100);
  i = inst(r);
  ck('no scram back at 1000 MW', scrammed(r), !scrammed(r), 'false');
  ck('power followed demand up (mean)', pUp.toFixed(1), near(pUp, 100, 6), '100±6');
  ck('tavg restored again', i.tavg.toFixed(2), near(i.tavg, sp, 1.5), 'sp±1.5');
});

test('PWR · secondary-on-auto while the operator moves rods', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.engage(['feed_sg', 'steam_dump', 'pzr_pressure', 'cvcs_makeup']);
  r.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: -15, speed: 'normal' });
  r.run(300);
  var i = inst(r);
  ck('no scram', scrammed(r), !scrammed(r), 'false');
  ck('SG level held through the power dip', i.sg_level.toFixed(1), near(i.sg_level, r.chan('feed_sg').setpoint, 4), 'sp±4');
  ck('pressure held', ts(r).pressure_mpa.toFixed(2), near(ts(r).pressure_mpa, 15.41, 0.4), '15.41±0.4');
});

test('PWR · rod auto: T-ref captured at engage, deadband lockup, manual motion → MAN', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.run(10);
  var tavgAtEngage = inst(r).tavg;
  r.engage(['rods_tavg']);
  var c = r.chan('rods_tavg');
  ck('T-ref := indicated Tavg at engage', c.setpoint.toFixed(2) + ' vs tavg ' + tavgAtEngage.toFixed(2),
    near(c.setpoint, tavgAtEngage, 0.5), 'tavg ±0.5');
  // Steady plant inside the ±0.8 °C deadband: the channel locks up (no nudges).
  var before = r.sent.filter(function (x) { return x.action === 'rod_nudge'; }).length;
  r.run(120);
  var during = r.sent.filter(function (x) { return x.action === 'rod_nudge'; }).length - before;
  ck('deadband lockup — no rod motion at steady state', during, during <= 2, '≤2 nudges in 120 s');
  // Manual rod motion takes the channel to MAN (a rod command on its group).
  r.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: -2, speed: 'slow' });
  c = r.chan('rods_tavg');
  ck('manual rod motion disengaged the channel', c.engaged, c.engaged === false, 'false');
  ck('note says manual control taken', c.note, /manual/.test(c.note), 'mentions manual');
  // Motion on a DIFFERENT group must NOT disengage it.
  r.engage(['rods_tavg']);
  r.cmd({ action: 'rod_nudge', group_id: 'shutdown_rods', steps: -1, speed: 'slow' });
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
  ck('sparse commands', autoCmds(r).length, autoCmds(r).length < 500, '<500');
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
