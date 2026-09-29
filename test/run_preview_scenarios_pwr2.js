/* run_preview_scenarios_pwr2.js — the two PREVIEW startup scenarios on the SHIPPED engine
 * (rc8f, 2026-09-27).
 *
 * WHY IT EXISTS. `pwr_chain_reaction` and `pwr_startup_challenge` (flag-gated `preview`,
 * site/flags.js) were only ever exercised by `run_campaign`, which loads the RETIRED engine. Under
 * the owner's 2026-09-26 ruling "B" (source-range high-flux trip at 1e5 cps, manual block at P-6)
 * the shipped engine refused chain reaction's `set_sr_detector` setup, an unblocked pull tripped
 * on SOURCE RANGE HIGH FLUX before its "power through 1 %" beat, and startup challenge's header
 * claimed P-6 was met at hot zero power (measured 1.6e-11 A against 1e-10 A). Nothing noticed.
 *
 * FULL STACK (M4+M5+M6): RD.SimulationService, plant 'pwr2', the scenario started through
 * `start_scenario` exactly as the UI does. Each scenario is registered a second time under a
 * `__pwr2` id with plant_id 'pwr2' — the only change — because the service resolves plant 'pwr' to
 * the retired engine (engineCtor), which is what `run_campaign` already covers.
 *
 * What it asserts, per scenario: every setup command is ACCEPTED (no error/blocked result), the
 * scenario's key beat is REACHED by a scripted player who takes the P-6 block, and the forgotten-
 * block route lands on the source-range ending rather than a softlock.
 *
 * Run: node test/run_preview_scenarios_pwr2.js
 */
'use strict';
var path = require('path');
var ROOT = path.join(__dirname, '..');
global.window = global;
require(path.join(ROOT, 'engines', 'load_mode.js'));
require(path.join(ROOT, 'engines', 'pwr', 'pwr_config.js'));
require(path.join(ROOT, 'layers', 'control', 'control_kernel.js'));
require(path.join(ROOT, 'layers', 'control', 'pwr_control.js'));
require(path.join(ROOT, 'engines', 'pwr', 'pwr_instruments.js'));
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_kinetics',
 'pwr2_fuel', 'pwr2_reactor', 'pwr2_sources', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief',
 'pwr2_condenser', 'pwr2_cvcs', 'pwr2_eccs', 'pwr2_afw', 'pwr2_damage', 'pwr2_protection',
 'pwr2_pressurizer', 'pwr2_dumpctl', 'pwr2_break', 'pwr2_containment', 'pwr2_rhr',
 'pwr2_true_state', 'pwr2_instruments', 'pwr2_feedwater', 'pwr2_engine', 'pwr2_shell'
].forEach(function (f) { require(path.join(ROOT, 'engines', 'pwr2', f + '.js')); });
require(path.join(ROOT, 'layers', 'simulation_service.js'));
require(path.join(ROOT, 'layers', 'instructor_layer.js'));
require(path.join(ROOT, 'scenarios', 'pwr_chain_reaction.js'));
require(path.join(ROOT, 'scenarios', 'pwr_startup_challenge.js'));
var RD = globalThis.RD;

var rec = [];
function ck(name, cond, note) {
  rec.push(!!cond);
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
}
function onPwr2(id) {
  var sc = JSON.parse(JSON.stringify(RD.SCENARIOS[id]));
  sc.id = id + '__pwr2'; sc.plant_id = 'pwr2';
  RD.SCENARIOS[sc.id] = sc;
  return sc.id;
}
function start(id) {
  var s = new RD.SimulationService({ seed: 42 });
  s.selectPlant('pwr2', 'hot_zero_power', null);
  var setupRes = [];
  var orig = s.handleCommand.bind(s);
  /* record every setup command's result, the way start_scenario issues them */
  s.handleCommand = function (c) {
    var r;
    /* the shell THROWS on a refused action (pwr2_shell REFUSED) — record it as a refusal so the
     * check reads FAIL rather than the runner dying before it reports */
    try { r = orig(c); } catch (err) { r = { type: 'refused', message: err.message }; }
    if (s._recSetup) setupRes.push({ c: c, r: r });
    return r;
  };
  s._recSetup = true;
  var snap = s.handleCommand({ action: 'start_scenario', scenario_id: id });
  s._recSetup = false;
  s.handleCommand({ action: 'play' });
  return { s: s, snap: snap, setup: setupRes.slice(1) };
}
function bad(r) { return r && (r.type === 'error' || r.type === 'blocked' || r.type === 'refused'); }
function beat(sn) { return sn && sn.instructor && sn.instructor.current_beat_id; }
function lc(sn) { return sn && sn.instructor && sn.instructor.level_complete; }
/* drive in 1 s of sim at a time; `each` may issue commands; stop when `until` holds */
function ride(s, secs, each, until) {
  var end = s.simTime + secs, sn;
  while (s.simTime < end) {
    var t0 = s.simTime;
    while (s.simTime < t0 + 1) sn = s.advanceCycles(1);
    if (each) each(sn);
    if (until && until(sn)) return sn;
  }
  return until ? null : sn;
}
function pull(s, dir, speed) {
  return s.handleCommand({ action: 'rod_start', group_id: 'control_rods', direction: dir, speed: speed || 'normal' });
}
function stop(s) { return s.handleCommand({ action: 'rod_stop', group_id: 'control_rods' }); }
function blockSR(s) { return s.handleCommand({ action: 'set_trip_block', trip_id: 'sr_high', blocked: true }); }
function p6(sn) { return sn && sn.instruments && sn.instruments.intermediate_range >= 1e-10; }
function cause(s) { return s.engine && s.engine.eng && s.engine.eng.pt && s.engine.eng.pt.trip_cause; }

console.log('\nPREVIEW SCENARIOS ON THE SHIPPED ENGINE  [pwr2, full stack, ruling "B" P-6 block]');

/* ---- 1. THE CHAIN REACTION ------------------------------------------------------------------ */
(function () {
  var id = onPwr2('pwr_chain_reaction');
  var r = start(id);
  ck('chain reaction: every setup command is ACCEPTED on pwr2',
     r.setup.every(function (x) { return !bad(x.r); }) && !bad(r.snap),
     r.setup.length + ' setup command(s)' + r.setup.filter(function (x) { return bad(x.r); })
       .map(function (x) { return ' REFUSED ' + x.c.action + ': ' + (x.r.message || x.r.code); }).join(''));
  var s = r.s;
  var sn = ride(s, 120, null, function (x) { return beat(x) === 'p6_block'; });
  ck('the rod-pull prompt fires (p6_block pending)', !!sn, beat(sn));
  if (!sn) return;
  var tPull = s.simTime; pull(s, 1);
  var blockRes = null, tBlock = null;
  /* p6_block FIRES on P-6; its branches are then pending on the same id — so wait on the plant */
  sn = ride(s, 1500, null, function (x) { return p6(x) || (x.rps_state && x.rps_state.scrammed); });
  ck('P-6 comes in on the held pull, unscrammed', sn && p6(sn) && !sn.rps_state.scrammed,
     sn ? 'IR ' + sn.instruments.intermediate_range.toExponential(2) + ' A at ' + (s.simTime - tPull).toFixed(0) +
       ' s of pull, SR ' + (sn.instruments.source_range || 0).toFixed(0) + ' cps' : 'never');
  if (!sn || sn.rps_state.scrammed) return;
  sn = ride(s, 30, null, function (x) { return beat(x) === 'p6_taken' || beat(x) === 'critical'; });
  blockRes = blockSR(s); tBlock = s.simTime;
  ck('the P-6 block is ACCEPTED on pwr2', !bad(blockRes), blockRes ? (blockRes.message || blockRes.type) : 'ok');
  sn = ride(s, 1500, null, function (x) { return beat(x) === 'reinsert' || (x.rps_state && x.rps_state.scrammed); });
  ck('the "power through 1 %" beat is REACHED (reinsert pending) without a trip',
     sn && beat(sn) === 'reinsert' && !sn.rps_state.scrammed,
     sn ? 'power ' + sn.instruments.power_range.toFixed(2) + ' % at ' + (s.simTime - tPull).toFixed(0) + ' s of pull' +
       (sn.rps_state.scrammed ? ', TRIPPED on ' + cause(s) : '') : 'never');
  stop(s);
  if (!sn || sn.rps_state.scrammed) return;
  sn = ride(s, 600, null, function (x) { return beat(x) === 'complete' || lc(x); });
  pull(s, -1);
  sn = ride(s, 1200, null, function (x) { return !!lc(x); });
  stop(s);
  ck('...and reinsertion reaches the Mastered ending', sn && /Mastered/.test(lc(sn).title),
     sn ? lc(sn).title : 'no ending in 1200 s');

  /* the forgotten block: hold the pull, never block -> the source-range ending, not a softlock */
  var r2 = start(id), s2 = r2.s;
  ride(s2, 120, null, function (x) { return beat(x) === 'p6_block'; });
  pull(s2, 1);
  var tPull2 = s2.simTime;
  var sn2 = ride(s2, 1500, null, function (x) { return !!lc(x); });
  stop(s2);
  ck('never blocking lands on the SOURCE RANGE TRIP ending (no softlock), cause sr_high_flux',
     sn2 && /Source Range/.test(lc(sn2).title) && cause(s2) === 'sr_high_flux',
     sn2 ? lc(sn2).title + ', cause ' + cause(s2) + ', ending ' + (s2.simTime - tPull2).toFixed(0) + ' s into the pull'
         : 'no ending in 1500 s');
})();

/* ---- 2. CRITICALITY, SOLO ------------------------------------------------------------------- */
(function () {
  var id = onPwr2('pwr_startup_challenge');
  var r = start(id), s = r.s;
  ck('startup challenge: every setup command is ACCEPTED on pwr2',
     r.setup.every(function (x) { return !bad(x.r); }) && !bad(r.snap), r.setup.length + ' setup command(s)');
  var sn0 = ride(s, 5);
  ck('the header\'s initial condition is TRUE: P-6 NOT met at hot zero power (IR under 1e-10 A)',
     sn0 && sn0.instruments.intermediate_range < 1e-10 && sn0.instruments.source_range > 100,
     'IR ' + sn0.instruments.intermediate_range.toExponential(2) + ' A, SR ' +
       sn0.instruments.source_range.toFixed(0) + ' cps');
  /* ...and the SCENARIO does not claim otherwise: the pre-rc8f briefing told the player "IR on
   * scale (P-6 satisfied)" and to "de-energize SR", neither of which the shipped board offers */
  var txt = JSON.stringify(RD.SCENARIOS[id].beats);
  ck('the briefing does not claim P-6 is met at hot zero power, nor offer an SR on/off switch',
     !/P-6 satisfied|already on scale|de-energize SR|secure it before/i.test(txt) && /BLOCK/.test(txt),
     (txt.match(/P-6 satisfied|already on scale|de-energize SR|secure it before/ig) || []).join(' | ') || 'clean');
  var sn = ride(s, 60, null, function (x) { return beat(x) === 'exam'; });
  ck('the exam watch arms', !!sn, beat(sn));
  pull(s, 1);
  var blocked = false;
  sn = ride(s, 1500, function (x) {
    if (!blocked && p6(x)) { blockSR(s); blocked = true; }
  }, function (x) { return x.instruments.power_range > 1.0 || x.rps_state.scrammed; });
  stop(s);
  ck('with the P-6 block taken, criticality is reached unscrammed (critical_marker)',
     sn && !sn.rps_state.scrammed && blocked,
     sn ? 'power ' + sn.instruments.power_range.toFixed(2) + ' %' + (sn.rps_state.scrammed ? ', TRIPPED on ' + cause(s) : '') : 'never');
  /* the forgotten block -> the source-range card */
  var s2 = start(id).s;
  ride(s2, 50);
  pull(s2, 1);
  var sn2 = ride(s2, 1500, null, function (x) { return !!lc(x); });
  stop(s2);
  ck('never blocking lands on the SOURCE RANGE TRIP card (the diagnose branch reads sr_energized)',
     sn2 && /Source Range/.test(lc(sn2).title) && cause(s2) === 'sr_high_flux',
     sn2 ? lc(sn2).title + ', cause ' + cause(s2) : 'no ending in 1500 s');
})();

var pass = rec.filter(Boolean).length, fail = rec.length - pass;
console.log('\n' + pass + '/' + rec.length + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
