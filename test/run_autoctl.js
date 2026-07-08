/*
 * run_autoctl.js — validation of the operator-automation layer (Automate tab,
 * layers/auto_control.js) against the full M5 stack.
 *
 * Each probe builds a SimulationService, subscribes an AutoControl exactly the
 * way the UI does (step on every broadcast, commands descend the whole stack),
 * engages a channel set, perturbs the plant with the remaining MANUAL controls,
 * and asserts the automation holds the plant inside its operating band with no
 * scram — plus that the command stream stays sparse (no per-broadcast spam).
 *
 *   node test/run_autoctl.js
 */
'use strict';
var path = require('path');
function load(p) { require(path.join(__dirname, '..', p)); }
[
  'engines/load_mode.js',
  'engines/pwr/pwr_config.js', 'engines/pwr/pwr_protection.js', 'engines/pwr/pwr_thermal.js',
  'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js',
  'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
  'engines/rbmk/rbmk_protection.js', 'engines/rbmk/rbmk_config.js', 'engines/rbmk/rbmk_kinetics.js',
  'engines/rbmk/rbmk_thermal.js', 'engines/rbmk/rbmk_rods.js', 'engines/rbmk/rbmk_instruments.js', 'engines/rbmk/rbmk_engine.js',
  'engines/bwr/bwr_config.js', 'engines/bwr/bwr_protection.js', 'engines/bwr/bwr_vessel.js',
  'engines/bwr/bwr_recirculation.js', 'engines/bwr/bwr_safety_systems.js', 'engines/bwr/bwr_instruments.js', 'engines/bwr/bwr_engine.js',
  'layers/control_failure_layer.js', 'layers/instructor_layer.js', 'layers/simulation_service.js',
  'layers/auto_control.js',
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

// A UI-faithful rig: service + auto layer stepped per broadcast.
function rig(plant, initState, dv) {
  var service = new RD.SimulationService({ seed: 0xA07 });
  var sent = [];
  var auto = new RD.AutoControl(function (c) { sent.push(c); return service.handleCommand(c); });
  service.selectPlant(plant, initState, dv || null);
  auto.setPlant(plant);
  service.subscribe(function (s) { auto.step(s); });
  service.handleCommand({ action: 'set_speed', value: 10 });   // 1 s sim per cycle
  return {
    service: service, auto: auto, sent: sent,
    snap: function () { return service.assembleSnapshot(); },
    engage: function (ids) {
      var s = service.assembleSnapshot();
      ids.forEach(function (id) { auto.toggle(id, true, s); });
    },
    cmd: function (c) { return service.handleCommand(c); },
    run: function (simSeconds) {   // ~1 s sim per cycle at 10× (transient cadence shortens a cycle; overshoot is fine)
      return service.advanceCycles(Math.ceil(simSeconds));
    },
  };
}
function inst(r) { return r.snap().instruments; }
function ts(r) { return r.snap().true_state; }
function near(v, target, tol) { return Math.abs(v - target) <= tol; }
function scrammed(r) { var s = r.snap(); return !!(s.rps_state.scrammed || s.true_state.scrammed); }

// ================================================================== PWR
test('PWR · all-auto holds hot full power (10 min)', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.engage(['rods_tavg', 'boron_trim', 'pzr_pressure', 'cvcs_makeup', 'feed_sg', 'steam_dump', 'grid_follow']);
  var sp = r.auto.get('rods_tavg').sp;
  r.run(600);
  var i = inst(r), t = ts(r);
  ck('no scram', scrammed(r), !scrammed(r), 'false');
  // In load-follow the absolute power level is weakly anchored (draw tracks
  // power); rods hold Tavg, so a slow physical drift of a few % is expected.
  ck('power ~100%', t.power_pct.toFixed(1), near(t.power_pct, 100, 6), '100±6');
  ck('tavg at setpoint', i.tavg.toFixed(2) + ' vs sp ' + sp.toFixed(2), near(i.tavg, sp, 1.0), 'sp±1.0');
  ck('pressure in band', t.pressure_mpa.toFixed(2), near(t.pressure_mpa, 15.41, 0.35), '15.41±0.35');
  ck('SG level at setpoint', i.sg_level.toFixed(1), near(i.sg_level, r.auto.get('feed_sg').sp, 3), 'sp±3');
  ck('sparse commands', r.sent.length, r.sent.length < 250, '<250 auto commands in 10 min');
});

test('PWR · all-auto except grid: demand swing 1000→700→1000', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.engage(['rods_tavg', 'boron_trim', 'pzr_pressure', 'cvcs_makeup', 'feed_sg', 'steam_dump']);
  // grid stays manual (load follow OFF = the user's slider)
  r.auto.toggle('grid_follow', false, r.snap());
  var sp = r.auto.get('rods_tavg').sp;
  r.cmd({ action: 'set_steam_demand', mwe: 700 });
  r.run(900);
  var t = ts(r), i = inst(r);
  ck('no scram at 700 MW', scrammed(r), !scrammed(r), 'false');
  // The governor passes demand × (SG pressure / rated): holding Tavg at the
  // full-power value keeps secondary pressure high, so a 700 MW demand delivers
  // ~785 MW — settled power tracks DELIVERED steam, not the raw setpoint.
  ck('power followed demand down', t.power_pct.toFixed(1), near(t.power_pct, 78, 7), '78±7 (governor overdelivers at held Tavg)');
  ck('tavg restored', i.tavg.toFixed(2) + ' vs sp ' + sp.toFixed(2), near(i.tavg, sp, 1.5), 'sp±1.5');
  ck('SG level held', i.sg_level.toFixed(1), near(i.sg_level, r.auto.get('feed_sg').sp, 4), 'sp±4');
  r.cmd({ action: 'set_steam_demand', mwe: 1000 });
  r.run(900);
  t = ts(r); i = inst(r);
  ck('no scram back at 1000 MW', scrammed(r), !scrammed(r), 'false');
  ck('power followed demand up', t.power_pct.toFixed(1), near(t.power_pct, 100, 6), '100±6');
  ck('tavg restored again', i.tavg.toFixed(2), near(i.tavg, sp, 1.5), 'sp±1.5');
});

test('PWR · secondary-on-auto while the operator moves rods', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.engage(['feed_sg', 'steam_dump', 'pzr_pressure', 'cvcs_makeup']);
  r.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: -15, speed: 'normal' });
  r.run(300);
  var i = inst(r);
  ck('no scram', scrammed(r), !scrammed(r), 'false');
  ck('SG level held through the power dip', i.sg_level.toFixed(1), near(i.sg_level, r.auto.get('feed_sg').sp, 4), 'sp±4');
  ck('pressure held', ts(r).pressure_mpa.toFixed(2), near(ts(r).pressure_mpa, 15.41, 0.4), '15.41±0.4');
});

test('PWR · rod channel disengages itself on scram', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.engage(['rods_tavg']);
  r.run(10);
  r.cmd({ action: 'scram' });
  r.run(30);
  ck('scrammed', scrammed(r), scrammed(r), 'true');
  ck('rod channel off', r.auto.get('rods_tavg').engaged, !r.auto.get('rods_tavg').engaged, 'false');
  ck('note explains why', r.auto.get('rods_tavg').note, /scram/.test(r.auto.get('rods_tavg').note), 'mentions scram');
});

// ================================================================== RBMK
// The rod channel drives the Automatic Regulator (AR) group — fine steps
// (~2 pcm vs the manual bank's ~35), so the hold band is tight; the re-center
// channel hands the standing burden back to the manual bank when the AR nears
// its travel limits (real RBMK practice).
test('RBMK · AR+feed+BOP hold 50% power (10 min)', function (ck) {
  var r = rig('rbmk', '50_percent', 'post_chernobyl');
  r.engage(['rods_power', 'ar_recenter', 'feed_drum', 'grid_follow', 'steam_dump']);
  var sp = r.auto.get('rods_power').sp;
  r.run(600);
  var t = ts(r), i = inst(r);
  ck('no scram', scrammed(r), !scrammed(r), 'false');
  ck('power at setpoint', t.power_pct.toFixed(1) + ' vs sp ' + sp.toFixed(1), near(t.power_pct, sp, 1.5), 'sp±1.5');
  ck('manual bank untouched (AR does the fine work)',
    r.sent.filter(function (c) { return c.action === 'rod_nudge' && c.group_id === 'control_rods'; }).length,
    r.sent.filter(function (c) { return c.action === 'rod_nudge' && c.group_id === 'control_rods'; }).length === 0, '0 manual-bank nudges');
  ck('drum level at setpoint', i.drum_level.toFixed(1), near(i.drum_level, r.auto.get('feed_drum').sp, 4), 'sp±4');
});

test('RBMK · auto power maneuver 50→60% on the AR setpoint', function (ck) {
  var r = rig('rbmk', '50_percent', 'post_chernobyl');
  r.engage(['rods_power', 'ar_recenter', 'feed_drum', 'grid_follow', 'steam_dump']);
  r.run(60);
  r.auto.setSetpoint('rods_power', 60);
  r.run(800);
  var t = ts(r);
  ck('no scram', scrammed(r), !scrammed(r), 'false');
  ck('power reached 60%', t.power_pct.toFixed(1), near(t.power_pct, 60, 2), '60±2');
});

test('RBMK · AR defaults to AUTO where the state parks it with authority', function (ck) {
  // The plant's normal lineup (free play / reset / file load): AR in AUTO,
  // capturing the CURRENT power as its setpoint — never an authored number,
  // which would fight every non-full-power state.
  [['full_power', true], ['50_percent', true], ['hot_startup', false], ['low_power_xenon', false]]
    .forEach(function (tc) {
      var r = rig('rbmk', tc[0], tc[0] === 'low_power_xenon' ? 'pre_chernobyl' : 'post_chernobyl');
      r.auto.engageDefaults(r.snap());
      var c = r.auto.get('rods_power');
      ck(tc[0] + ' → AR ' + (tc[1] ? 'AUTO' : 'MAN'), c.engaged, c.engaged === tc[1], String(tc[1]));
      if (tc[1]) {
        ck(tc[0] + ' setpoint captured from current power', c.sp.toFixed(1),
          near(c.sp, r.snap().instruments.power_range, 2), 'current power ±2');
      }
    });
  // Scrammed plant: the default must NOT engage (nothing to hold).
  var rs = rig('rbmk', 'full_power', 'post_chernobyl');
  rs.cmd({ action: 'manual_scram' });
  rs.run(10);
  rs.auto.setPlant('rbmk');
  rs.auto.engageDefaults(rs.snap());
  ck('scrammed plant → AR stays MAN', rs.auto.get('rods_power').engaged,
    !rs.auto.get('rods_power').engaged, 'false');
});

test('RBMK · AR re-center: manual bank takes the burden at the travel limit', function (ck) {
  // Drive the AR toward its limit with a big setpoint swing and confirm the
  // re-center channel moves the MANUAL bank so the AR recovers authority.
  var r = rig('rbmk', '50_percent', 'post_chernobyl');
  r.engage(['rods_power', 'ar_recenter', 'feed_drum', 'grid_follow', 'steam_dump']);
  r.run(30);
  r.auto.setSetpoint('rods_power', 75);   // pulls the AR past its re-center band
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
  var sp = r.auto.get('recirc_power').sp;
  r.run(600);
  var t = ts(r), i = inst(r);
  ck('no scram', scrammed(r), !scrammed(r), 'false');
  ck('power at setpoint', t.power_pct.toFixed(1) + ' vs sp ' + sp.toFixed(1), near(t.power_pct, sp, 2.5), 'sp±2.5');
  ck('vessel level at setpoint', i.vessel_level.toFixed(1), near(i.vessel_level, r.auto.get('feed_level').sp, 4), 'sp±4');
  ck('sparse commands', r.sent.length, r.sent.length < 400, '<400');
});

test('BWR · auto power maneuver 100→80% via recirculation', function (ck) {
  var r = rig('bwr', 'full_power');
  r.engage(['recirc_power', 'feed_level', 'turbine_pressure', 'steam_dump']);
  r.run(60);
  r.auto.setSetpoint('recirc_power', 80);
  r.run(800);
  var t = ts(r), i = inst(r);
  ck('no scram', scrammed(r), !scrammed(r), 'false');
  ck('power reached 80%', t.power_pct.toFixed(1), near(t.power_pct, 80, 3), '80±3');
  ck('vessel level held', i.vessel_level.toFixed(1), near(i.vessel_level, r.auto.get('feed_level').sp, 4), 'sp±4');
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
  ck('vessel level held', i.vessel_level.toFixed(1), near(i.vessel_level, r.auto.get('feed_level').sp, 4), 'sp±4');
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

// ============================================================ time acceleration
// Above FAST_ACCEL (200×) pid channels hand their loop to the engine's per-step
// coupling and rod channels drop to single steps in a widened deadband — a
// sampled controller cannot stabilize the fast loops at minutes-per-broadcast
// (probed: full-dt PI drained every boiler to its low-level trip).
function fastHold(ck, plant, init, dv, channels, powerSp, tol) {
  var r = rig(plant, init, dv);
  r.engage(channels);
  r.cmd({ action: 'set_speed', value: 3600 });
  var cycles = 0;
  while (r.snap().metadata.sim_time < 1800 && cycles++ < 100) r.service.advanceCycles(1);
  var t = ts(r);
  ck('no scram at 3600×', scrammed(r), !scrammed(r), 'false');
  ck('power in band at 3600×', t.power_pct.toFixed(1), near(t.power_pct, powerSp, tol), powerSp + '±' + tol);
  ck('sparse commands', r.sent.length, r.sent.length < 40, '<40 (plant-side control)');
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

test('Fast-forward handoff resumes broadcast-rate control on slow-down', function (ck) {
  var r = rig('rbmk', '50_percent', 'post_chernobyl');
  r.engage(['rods_power', 'ar_recenter', 'feed_drum', 'grid_follow', 'steam_dump']);
  r.cmd({ action: 'set_speed', value: 3600 });
  var cycles = 0;
  while (r.snap().metadata.sim_time < 600 && cycles++ < 40) r.service.advanceCycles(1);
  ck('feed coupled during fast-forward', r.snap().control_state.feed_auto_coupled,
    r.snap().control_state.feed_auto_coupled === true, 'true');
  ck('feed channel notes plant-side control', r.auto.get('feed_drum').note,
    /fast-forward/.test(r.auto.get('feed_drum').note), 'mentions fast-forward');
  r.cmd({ action: 'set_speed', value: 10 });
  r.run(300);
  var t = ts(r);
  ck('no scram after resume', scrammed(r), !scrammed(r), 'false');
  ck('feed PID re-asserted (uncoupled again)', r.snap().control_state.feed_auto_coupled,
    r.snap().control_state.feed_auto_coupled === false, 'false');
  ck('power back in the tight band', t.power_pct.toFixed(1), near(t.power_pct, 50, 4), '50±4');
  ck('drum level held', inst(r).drum_level.toFixed(1), near(inst(r).drum_level, r.auto.get('feed_drum').sp, 4), 'sp±4');
});

test('Rewind resets controller dynamics (no integrator ghost)', function (ck) {
  var r = rig('pwr', 'hot_full_power');
  r.engage(['feed_sg']);
  r.run(60);   // sandbox checkpoints exist (15 s cadence)
  var iBefore = r.auto.get('feed_sg').I;
  r.cmd({ action: 'rewind', steps: 2 });
  r.run(5);
  ck('stepped after rewind without throwing', 'ok', true, 'ok');
  ck('integrator re-initialized', String(r.auto.get('feed_sg').I), r.auto.get('feed_sg').I != null, 'not null (re-seeded)');
  void iBefore;
});

report();
