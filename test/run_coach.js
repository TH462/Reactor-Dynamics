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
     .every(function (k) { return watch(c, k) != null; }) && / °F \(/.test(watch(c, 'Core exit temperature')) && / psia \(/.test(watch(c, 'Reactor coolant pressure')),
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
  ck('stuck PORV: the debrief says it is armed and has not acted', /armed and has not acted yet \(sticks open the next time pressure lifts the valve\)/.test(line(c, 'happened')), line(c, 'happened'));
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
  var cat = svc.layer.getFailureCatalog(), withArm = cat.filter(function (f) { return f.armed_text; }).map(function (f) { return f.id; }).sort();
  ck('every failure the engine can report as armed has armed/fired wording',
     ['afw_failure', 'anticipatory_trip_failure', 'continuous_rod_withdrawal', 'degraded_hpi', 'failure_to_scram', 'stuck_porv_open']
       .every(function (id) { var f = cat.filter(function (x) { return x.id === id; })[0]; return f && f.armed_text && f.fired_text; }),
     withArm.join(','));
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

console.log('\n' + '='.repeat(74));
console.log('  run_coach: ' + nPass + ' passed, ' + nFail + ' failed  (' + (nPass + nFail) + ' checks)');
console.log('='.repeat(74) + '\n');
process.exit(nFail > 0 ? 1 : 0);
