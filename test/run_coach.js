/*
 * run_coach.js — the free-play debrief and the armed/fired failure cue (#818), FULL STACK.
 *
 * WHAT IT ASSERTS, AND WHY EACH IS THE CLAIM RATHER THAN THE OUTPUT
 *   1. Free play stays quiet until something happens: no debrief on a steady plant.
 *   2. After an injected Loss of Main Feedwater and a 100 % Large LOCA, the debrief appears
 *      within a few plant-seconds and names, from the indications, what actually happened on
 *      THIS plant: the trip and its recorded cause, the automatic systems that came on (safety
 *      injection only where it ran), the five readings with their live values.
 *   3. HARD RULE 1 by BEHAVIOUR, not only by source scan: with the pressurizer level channel
 *      failed low (reads 20 %), the debrief quotes 20 %, i.e. the instrument the player sees,
 *      not the plant behind it. The source scan beside it is the cheap second guard.
 *   4. A failure that waits for a trigger reports `armed` (PORV stick at full power, where the
 *      valve never lifts) and flips to fired when it does; the debrief says it has not acted.
 *   5. Retry: a checkpoint exists at the instant before the injection, and rewinding to it
 *      removes the failure and the debrief.
 *   6. "Steady" is only said when the readings are: a full-power plant with an armed PORV is
 *      called steady by 10 plant-minutes, a Loss of Main Feedwater is still changing at 10.
 *   7. A walkthrough owns the tab: the debrief is null while one runs.
 *   8-11 (#818 review): a FINISHED walkthrough is free play; "steady" is reached at 3600x; the
 *      debrief never reports a firing only the plant's truth knows; armed/fired is right in shutdown states.
 *
 * Every check here was made to go red by breaking the thing it guards (see the #818 report).
 * Run: node test/run_coach.js
 */
'use strict';
var path = require('path'), fs = require('fs');
var ROOT = path.join(__dirname, '..');
require('../engines/load_mode.js');
require('../engines/pwr/pwr_config.js');
['layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_pressurizer2.js',
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
 'layers/control/control_kernel.js', 'layers/instructor_layer.js', 'layers/simulation_service.js',
 'ui/manual_procedures.js'
].forEach(function (f) { require('../' + f); });
var RD = globalThis.RD;

var nPass = 0, nFail = 0;
function ck(name, ok, detail) {
  ok ? nPass++ : nFail++;
  console.log((ok ? '\x1b[32mPASS' : '\x1b[31mFAIL') + '\x1b[0m  ' + name + (detail != null ? '\x1b[2m   (' + detail + ')\x1b[0m' : ''));
}
function boot() {
  var svc = new RD.SimulationService({ seed: 4242 });
  svc.selectPlant('pwr2', 'hot_full_power');
  svc.running = true; svc.timeAcceleration = 10; svc.attentionStops = false;
  svc.runTo = function (t) { var s = null; while (svc.simTime < t) s = svc.tick(); return s || svc.assembleSnapshot(); };
  return svc;
}
function coach(s) { return s && s.instructor && s.instructor.coach; }
function line(c, kind) { var l = c && c.lines.filter(function (x) { return x.kind === kind; })[0]; return l ? l.text : ''; }
function watch(c, label) {
  var l = c && c.lines.filter(function (x) { return x.kind === 'watch'; })[0];
  var it = l && l.items.filter(function (i) { return i.label === label; })[0];
  return it ? it.value : null;
}

// ---------------------------------------------------------------- 1 + 2. Loss of Main Feedwater
(function () {
  var svc = boot();
  var s = svc.runTo(10);
  ck('free play, steady plant: no debrief', coach(s) === null, JSON.stringify(coach(s)));
  var cps0 = svc.checkpoints.length;
  svc.handleCommand({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
  var tInj = svc.simTime;
  ck('injection lays the Retry checkpoint at the instant before it', svc.checkpoints.length === cps0 + 1 &&
     Math.abs(svc.checkpoints[svc.checkpoints.length - 1].metadata.sim_time - tInj) < 1e-9,
     cps0 + ' -> ' + svc.checkpoints.length);
  s = svc.runTo(tInj + 5);
  var c = coach(s);
  ck('LOFW: the debrief is up within 5 plant-seconds', !!c && c.lines.length === 4,
     c ? c.lines.map(function (l) { return l.kind; }).join(',') : 'none');
  s = svc.runTo(tInj + 30); c = coach(s);
  var h = line(c, 'happened'), a = line(c, 'auto');
  ck('LOFW: names the trip and the recorded cause (the turbine trip)', /reactor tripped/.test(h) && /on the turbine trip/.test(h), h);
  ck('LOFW: says main feedwater flow fell, from the indication', /Main feedwater flow has fallen from 100 %/.test(h), h);
  ck('LOFW: automatic actions include reactor trip and the auxiliary feedwater start', /reactor trip/.test(a) && /auxiliary feedwater pumps started/.test(a), a);
  ck('LOFW: no safety injection claimed (none ran)', !/safety injection/.test(a), a);
  ck('LOFW: five readings named, with US-first values', ['Core exit temperature', 'Subcooling margin', 'Reactor coolant pressure', 'Pressurizer level', 'Steam generator level']
     .every(function (k) { return watch(c, k) != null; }) && / °F \(/.test(watch(c, 'Core exit temperature')) && /^\d+ psi \(/.test(watch(c, 'Reactor coolant pressure')),
     line(c, 'watch'));
  ck('LOFW: the quoted pressure is the live instrument', watch(c, 'Reactor coolant pressure').indexOf(String(Math.round(s.instruments.primary_pressure * 145.038))) === 0,
     watch(c, 'Reactor coolant pressure') + ' vs ' + Math.round(s.instruments.primary_pressure * 145.038));
  ck('LOFW: no directive language (the instructor never directs, #212)', !!c && !/\b(you should|you must|now (open|close|start|stop|trip)|secure the|start the|stop the)\b/i.test(c.lines.map(function (l) { return l.text; }).join(' ')),
     'scanned all four lines');
  s = svc.runTo(tInj + 600); c = coach(s);
  ck('LOFW at 10 min: still changing, not called steady (steam generator level is falling)', c && !c.settled && /Still changing/.test(line(c, 'status')), line(c, 'status'));

  // 5. Retry
  var idx = -1, cps = svc.checkpoints;
  for (var i = cps.length - 1; i >= 0; i--) if (c && cps[i].metadata.sim_time <= c.before_t + 1e-6) { idx = i; break; }
  ck('Retry target exists at the moment before the injection', idx >= 0 && Math.abs(cps[idx].metadata.sim_time - tInj) < 1e-9,
     idx >= 0 ? cps[idx].metadata.sim_time : 'none');
  var r = svc.handleCommand({ action: 'rewind', steps: cps.length - idx, exact: true });
  s = svc.runTo(svc.simTime + 1);
  ck('Retry: the plant is back before the injection — no failure, no debrief, not tripped',
     r && r.type !== 'error' && s.active_failures.length === 0 && coach(s) === null && !s.rps_state.scrammed,
     JSON.stringify(s.active_failures) + ' coach=' + !!coach(s));
})();

// ---------------------------------------------------------------- 2. Large LOCA
(function () {
  var svc = boot(); svc.runTo(10);
  svc.handleCommand({ action: 'inject_failure', failure_id: 'large_loca', severity: 1.0 });
  var t0 = svc.simTime, s = svc.runTo(t0 + 120), c = coach(s);
  var h = line(c, 'happened'), a = line(c, 'auto');
  ck('Large LOCA: safety injection reported as an automatic action', /safety injection/.test(a), a);
  ck('Large LOCA: boiling and containment named from the indications', /Subcooling margin is gone/.test(h) && /Containment pressure is up/.test(h), h);
  ck('Large LOCA: the title is the injected failure', c && /LOCA/.test(c.title), c && c.title);
})();

// ---------------------------------------------------------------- 3. Hard Rule 1, by behaviour
(function () {
  var svc = boot(); svc.runTo(10);
  svc.handleCommand({ action: 'inject_failure', failure_id: 'pzr_level_sensor_low' });
  var s = svc.runTo(svc.simTime + 20), c = coach(s);
  var truth = s.true_state.pzr_level_pct;
  ck('HR1: with the level channel failed low, the debrief quotes the instrument (20 %), not the plant',
     watch(c, 'Pressurizer level') === '20 %' && Math.abs(truth - 20) > 10,
     'debrief ' + watch(c, 'Pressurizer level') + ', instrument ' + s.instruments.pzr_level.toFixed(1) + ', truth ' + (truth != null ? truth.toFixed(1) : '?'));
  var src = fs.readFileSync(path.join(ROOT, 'layers', 'instructor_layer.js'), 'utf8');
  var a = src.indexOf('// ================================================================ free-play debrief (#818)'), b = src.indexOf('// ================================================================ output (§7)');
  var sect = a >= 0 && b > a ? src.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '') : null;
  ck('HR1: the debrief section\'s code never reads true_state', !!sect && sect.indexOf('true_state') === -1,
     sect ? sect.length + ' chars of code scanned' : 'section markers not found');
})();

// ---------------------------------------------------------------- 4 + 6. armed / fired, and "steady"
(function () {
  var svc = boot(); svc.runTo(10);
  svc.handleCommand({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
  var t0 = svc.simTime, s = svc.runTo(t0 + 30);
  var af = s.active_failures.filter(function (f) { return f.id === 'stuck_porv_open'; })[0];
  ck('stuck PORV at full power: reported armed (the valve has not lifted)', af && af.armed === true, JSON.stringify(af));
  var c = coach(s);
  ck('stuck PORV: the debrief says it was armed when injected and leaves "has it acted" to the board',
     /armed when injected: it sticks open the next time pressure lifts the valve\. Whether it has acted shows only on the board\./.test(line(c, 'happened')), line(c, 'happened'));
  ck('stuck PORV: the catalog carries the plain line and the armed/fired wording', (function () {
    var f = svc.layer.getFailureCatalog().filter(function (x) { return x.id === 'stuck_porv_open'; })[0];
    return !!(f && f.blurb && /^Armed — /.test(f.armed_text) && /^Fired — /.test(f.fired_text));
  })());
  s = svc.runTo(t0 + 600); c = coach(s);
  ck('full power, PORV armed, 10 plant-minutes: called steady', c && c.settled === true && /held steady/.test(line(c, 'status')), line(c, 'status'));
  svc.handleCommand({ action: 'open_porv_manual' });
  s = svc.runTo(svc.simTime + 5);
  af = s.active_failures.filter(function (f) { return f.id === 'stuck_porv_open'; })[0];
  ck('stuck PORV: once the valve lifts, reported fired', af && af.armed === false, JSON.stringify(af));
  var cat = svc.layer.getFailureCatalog();
  /* DERIVED, not listed (#818 review): inject every failure on the menu into one plant and ask the
   * engine which ones it reports armed/fired — each of those must carry both lines */
  var svcAll = boot(); svcAll.runTo(10);
  cat.forEach(function (f) { try { svcAll.handleCommand({ action: 'inject_failure', failure_id: f.id }); } catch (e) { /* a refusal is not this check's business */ } });
  svcAll.runTo(svcAll.simTime + 2);
  var armIds = Object.keys(svcAll.engine.getFailureArming()).sort();
  ck('every failure the engine can report as armed has armed/fired wording (derived from getFailureArming, everything injected)',
     armIds.length >= 6 && armIds.every(function (id) { var f = cat.filter(function (x) { return x.id === id; })[0]; return f && /^Armed — /.test(f.armed_text) && /^Fired — /.test(f.fired_text); }),
     armIds.join(','));
  ck('every failure on the PWR menu has a one-line description', cat.every(function (f) { return f.blurb && f.blurb.split(/\s+/).length <= 18; }),
     cat.filter(function (f) { return !f.blurb || f.blurb.split(/\s+/).length > 18; }).map(function (f) { return f.id; }).join(',') || 'all');
})();

// ---------------------------------------------------------------- 7. a walkthrough owns the tab
(function () {
  var svc = boot(); svc.runTo(10);
  var procs = (RD.MANUAL_PROCEDURES && (RD.MANUAL_PROCEDURES.pwr2 || RD.MANUAL_PROCEDURES.pwr)) || [];
  var p = procs.filter(function (x) { return x.steps && x.steps.length; })[0];
  if (p) svc.instructor.loadChecklist(p, {});
  svc.handleCommand({ action: 'scram' });
  var s = svc.runTo(svc.simTime + 10);
  ck('a walkthrough is running: no free-play debrief', !!p && coach(s) === null, p ? p.id : 'no procedure found');
})();

// ---------------------------------------------------------------- 8. a FINISHED walkthrough is free play (#818 review)
(function () {
  var svc = boot(); svc.runTo(10);
  var procs = (RD.MANUAL_PROCEDURES && (RD.MANUAL_PROCEDURES.pwr2 || RD.MANUAL_PROCEDURES.pwr)) || [];
  var p = procs.filter(function (x) { return x.steps && x.steps.length; })[0];
  svc.instructor.loadChecklist(p, {});
  var s = svc.runTo(svc.simTime + 1);
  ck('a running walkthrough is not free play (the snapshot says so)', s.instructor.free_play === false, String(s.instructor.free_play));
  svc.instructor.checklist.complete = true;
  s = svc.runTo(svc.simTime + 1);
  ck('a finished walkthrough is free play', s.instructor.free_play === true, String(s.instructor.free_play));
  var n0 = svc.checkpoints.length;
  svc.handleCommand({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
  ck('after a finished walkthrough, an injection lays the Retry checkpoint', svc.checkpoints.length === n0 + 1, n0 + ' -> ' + svc.checkpoints.length);
  s = svc.runTo(svc.simTime + 10);
  ck('after a finished walkthrough, the debrief comes up', !!coach(s) && /Loss of Main Feedwater/.test(coach(s).title), coach(s) && coach(s).title);
})();

// ---------------------------------------------------------------- 9. "steady" at 3600x (#818 review)
(function () {
  /* broadcasts at 3600x are 360 plant-seconds apart; the settle window used to need 3 samples
   * inside 300 s and never got them. Measured after the fix, manual trip from full power: first
   * steady at 42.5 / 35.5 / 33.0 plant-minutes at 60x / 600x / 3600x. */
  var svc = boot(); svc.runTo(10); svc.timeAcceleration = 3600;
  svc.handleCommand({ action: 'scram' });
  var t0 = svc.simTime, first = null, s;
  while (svc.simTime < t0 + 90 * 60) { s = svc.tick(); var c = coach(s); if (c && c.settled && first == null) first = svc.simTime - t0; }
  ck('3600x, manual trip from full power: "steady" is said within 90 plant-minutes, not before 20',
     first != null && first >= 20 * 60 && first <= 90 * 60, first == null ? 'never' : (first / 60).toFixed(1) + ' plant-min');
})();

// ---------------------------------------------------------------- 10. HR1: the debrief never reports a firing the board cannot see
(function () {
  var svc = boot(); svc.runTo(10);
  svc.handleCommand({ action: 'inject_failure', failure_id: 'porv_indicator_stuck_closed' });
  svc.handleCommand({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
  var s = svc.runTo(svc.simTime + 20), before = line(coach(s), 'happened');
  svc.handleCommand({ action: 'open_porv_manual' });
  s = svc.runTo(svc.simTime + 5);
  svc.handleCommand({ action: 'close_porv' });
  s = svc.runTo(svc.simTime + 60);
  var af = s.active_failures.filter(function (f) { return f.id === 'stuck_porv_open'; })[0];
  var all = coach(s) ? coach(s).lines.map(function (l) { return l.text; }).join(' ') : '';
  ck('fixture: the valve really is stuck open (truth) and its light reads closed (indication)',
     af && af.armed === false && s.instruments.porv_indicator !== 'open', JSON.stringify(af) + ' light=' + s.instruments.porv_indicator);
  ck('the debrief does not reveal the stuck-open valve: no Fired, no "stuck open", no relief valve open, no change in its armed sentence',
     !!all && !/Fired|is stuck open|has lifted|relief valve (indicates )?open|PORV open/i.test(all) &&
     /armed when injected: it sticks open/.test(line(coach(s), 'happened')) && /armed when injected: it sticks open/.test(before),
     all.slice(0, 400));
  var src = fs.readFileSync(path.join(ROOT, 'layers', 'instructor_layer.js'), 'utf8');
  var a = src.indexOf('// ================================================================ free-play debrief (#818)'), b = src.indexOf('// ================================================================ output (§7)');
  var sect = a >= 0 && b > a ? src.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '') : '';
  ck('HR1: the debrief section\'s code never reads a failure\'s armed/fired state', !!sect && !/\.armed\b/.test(sect), sect.length + ' chars of code scanned');
})();

// ---------------------------------------------------------------- 11. armed/fired is not "fired" in a shutdown state (#818 review)
(function () {
  function armedAt(ic, id, pre) {
    var svc = new RD.SimulationService({ seed: 4242 });
    svc.selectPlant('pwr2', ic); svc.running = true; svc.timeAcceleration = 10; svc.attentionStops = false;
    var run = function (t) { var s = null; while (svc.simTime < t) s = svc.tick(); return s; };
    run(10); if (pre) { pre(svc); run(svc.simTime + 30); }
    svc.handleCommand({ action: 'inject_failure', failure_id: id });
    var s = run(svc.simTime + 30);
    var f = s.active_failures.filter(function (x) { return x.id === id; })[0];
    return f ? f.armed : undefined;
  }
  ck('anticipatory trip failure at hot zero power (turbine already offline, below P-9): Armed', armedAt('hot_zero_power', 'anticipatory_trip_failure') === true);
  ck('anticipatory trip failure at hot shutdown: Armed', armedAt('hot_shutdown', 'anticipatory_trip_failure') === true);
  ck('continuous rod withdrawal injected with the trip latched (rods in, no drive power): Armed',
     armedAt('hot_full_power', 'continuous_rod_withdrawal', function (svc) { svc.handleCommand({ action: 'scram' }); }) === true);
  ck('anticipatory trip failure, turbine trip at full power: Fired (the reactor stays up)',
     (function () {
       var svc = boot(); svc.runTo(10);
       svc.handleCommand({ action: 'inject_failure', failure_id: 'anticipatory_trip_failure' });
       svc.handleCommand({ action: 'inject_failure', failure_id: 'turbine_trip' });
       var s = svc.runTo(svc.simTime + 3), f = s.active_failures.filter(function (x) { return x.id === 'anticipatory_trip_failure'; })[0];
       return f && f.armed === false && !s.rps_state.scrammed;
     })());
})();

console.log('\n' + '='.repeat(74));
console.log('  run_coach: ' + nPass + ' passed, ' + nFail + ' failed  (' + (nPass + nFail) + ' checks)');
console.log('='.repeat(74) + '\n');
process.exit(nFail > 0 ? 1 : 0);
