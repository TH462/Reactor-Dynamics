/* run_pwr2_shell.js — the PWR2Engine shell class's gate (Option B stage B2, 2026-08-20).
 *
 * WHAT IT PINS: the full RD.PWREngine-shaped surface; the REUSED pwr_instruments member fed
 * by the B1-completed contract; THE COMMAND PARTITION — every action in the CURRENT engine's
 * own applyCommand switch (parsed from its source, so a new old-engine action cannot appear
 * unaccounted) is in exactly one of MAPPED/REHOMED/REFUSED, refusals carry reasons and THROW;
 * and the save contract — schema pwr2-1.0 only (pwr-1.0 refused with the D4 §5 reason), with
 * BIT-EXACT round trips over both true_state and the instrument readings.
 *
 * Run: node test/run_pwr2_shell.js
 */
'use strict';
var path = require('path');
var fs = require('fs');
var SRC = path.join(__dirname, '..', 'engines', 'pwr2');

function loadAll(shellSource) {
  require(path.join(__dirname, '..', 'engines', 'load_mode.js'));
  require(path.join(__dirname, '..', 'engines', 'pwr', 'pwr_config.js'));
  require(path.join(__dirname, '..', 'layers', 'control', 'pwr_control.js'));
  require(path.join(__dirname, '..', 'engines', 'pwr', 'pwr_instruments.js'));
  ['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_kinetics',
   'pwr2_fuel', 'pwr2_reactor', 'pwr2_sources', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief',
   'pwr2_condenser', 'pwr2_cvcs', 'pwr2_eccs', 'pwr2_afw', 'pwr2_damage', 'pwr2_protection',
   'pwr2_pressurizer', 'pwr2_dumpctl', 'pwr2_break', 'pwr2_containment', 'pwr2_rhr',
   'pwr2_true_state', 'pwr2_instruments', 'pwr2_engine'].forEach(function (f) {
    delete require.cache[require.resolve(path.join(SRC, f + '.js'))];
    require(path.join(SRC, f + '.js'));
  });
  if (shellSource === undefined) {
    delete require.cache[require.resolve(path.join(SRC, 'pwr2_shell.js'))];
    require(path.join(SRC, 'pwr2_shell.js'));
  } else {
    (0, eval)(shellSource);
  }
  return globalThis.RD.pwr2.shell;
}

var DT = 0.02;

function runSuite(SH, rec, quiet) {
  function ck(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }
  function run(e, secs) { var t; for (var i = 0; i < secs / DT; i++) t = e.step(DT); return t; }

  /* ---- 1. THE SURFACE ----------------------------------------------------------------------- */
  head('THE SURFACE  [every method the M4/M5 stack calls on an engine]');
  var eng = new SH.PWR2Engine({});
  var ts = run(eng, quiet ? 30 : 60);
  ck('step/getTrueState: the plant runs and publishes the completed contract',
     ts.pressure_mpa > 14 && ts.power_pct > 90 && ts.plant_mode === 1 &&
     ts.ac_available === true,
     (ts.pressure_mpa * 145.04).toFixed(0) + ' psia, ' + ts.power_pct.toFixed(1) + ' %');
  var rd = eng.getInstruments();
  ck('getInstruments()/instruments.reading are the SAME dict (control_kernel reads it directly)',
     rd === eng.instruments.reading && typeof rd === 'object', '');
  var nan = Object.keys(rd).filter(function (k) {
    return typeof rd[k] === 'number' && !isFinite(rd[k]);
  });
  ck('every reused-instrument reading is FINITE (reset() primes the lag buffers — measured ' +
     'NaN across all 45 channels without it)', nan.length === 0,
     nan.length ? 'NaN: ' + nan.slice(0, 5).join(', ') : Object.keys(rd).length + ' channels');
  ck('the indicated tavg TRACKS the plant through the reused layer',
     Math.abs(rd.tavg - ts.tavg_c) < 2.0,
     'ind ' + rd.tavg.toFixed(2) + ' vs true ' + ts.tavg_c.toFixed(2) + ' degC');
  var cs = eng.getControlState();
  ck('getControlState carries the board\'s shape: rod group, pressurizer, dumps, pumps',
     cs.rod_groups.length === 1 && typeof cs.rod_groups[0].position_pct === 'number' &&
     typeof cs.pressure_setpoint === 'number' && typeof cs.steam_dump_pct === 'number' &&
     cs.pumps.length === 1, Object.keys(cs).length + ' keys');
  ck('getProtectionConfig is the COURIER: it hands back RD.PWR_CONFIG.protection itself',
     eng.getProtectionConfig() === globalThis.RD.PWR_CONFIG.protection,
     'the inverted coupling D4 flags — M4 writes it, engines only carry it');
  ck('getStartupLineup/getActiveFailures exist and answer',
     Array.isArray(eng.getStartupLineup()) && Array.isArray(eng.getActiveFailures()) &&
     eng.getActiveFailures().length === 0, '');

  /* ---- 2. THE COMMAND PARTITION -------------------------------------------------------------- */
  head('THE PARTITION  [every old-engine action in exactly one registry, refusals reasoned]');
  var oldSrc = fs.readFileSync(path.join(__dirname, '..', 'engines', 'pwr', 'pwr_engine.js'), 'utf8');
  var actions = {}, m, re = /case '([a-z_0-9]+)'/g;
  while ((m = re.exec(oldSrc)) !== null) actions[m[1]] = true;
  var names = Object.keys(actions);
  var unhomed = names.filter(function (a) {
    return !SH.MAPPED[a] && !SH.REHOMED[a] && SH.REFUSED[a] === undefined;
  });
  ck('every action in the CURRENT engine\'s own switch is in exactly one registry (' +
     names.length + ' actions)', unhomed.length === 0,
     unhomed.length ? 'UNHOMED: ' + unhomed.join(', ') : '');
  var doubled = names.filter(function (a) {
    var n = (SH.MAPPED[a] ? 1 : 0) + (SH.REHOMED[a] ? 1 : 0) + (SH.REFUSED[a] !== undefined ? 1 : 0);
    return n > 1;
  });
  ck('...and in only one', doubled.length === 0, doubled.join(', '));
  var thin = Object.keys(SH.REFUSED).filter(function (a) { return SH.REFUSED[a].length < 20; });
  ck('every refusal carries a real reason', thin.length === 0, thin.join(', '));
  var threw = false;
  try { eng.applyCommand({ action: 'set_containment_spray', enabled: true }); }
  catch (e) { threw = /REFUSED/.test(e.message) && /unmodeled/.test(e.message); }
  ck('a REFUSED command THROWS with its reason — never a silent swallow', threw === true, '');
  var threwU = false;
  try { eng.applyCommand({ action: 'no_such_action' }); } catch (e) { threwU = /unknown/.test(e.message); }
  ck('an unknown action throws too', threwU === true, '');

  /* ---- 3. COMMANDS LAND THROUGH THE CLASS ---------------------------------------------------- */
  head('COMMANDS LAND  [the class is a real door, not a shape]');
  eng.applyCommand({ action: 'set_load_target', mwe: 80 });
  var t80 = run(eng, quiet ? 40 : 60);
  ck('set_load_target moves the plant', Math.abs(t80.mwe_output - 80) < 2,
     t80.mwe_output.toFixed(1) + ' MWe');
  ck('...and the reused gauges FOLLOW the maneuver (a frozen t=0 gauge reads the old point)',
     Math.abs(eng.getInstruments().tavg - t80.tavg_c) < 2.0,
     'ind ' + eng.getInstruments().tavg.toFixed(2) + ' vs true ' + t80.tavg_c.toFixed(2) +
     ' degC after the load change moved Tavg');
  eng.applyCommand({ action: 'set_instrument_failure', instrument: 'primary_pressure', mode: 'fail_low' });
  var tF = run(eng, 10);
  ck('an instrument failure through the CLASS reaches the internal RPS — the lying channel trips',
     tF.scrammed === true && eng.eng.pt.trip_cause === 'lo_pzr_press',
     'cause ' + eng.eng.pt.trip_cause + ' — the HR1 chain end to end through applyCommand');
  ck('...and getActiveFailures reports it', eng.getActiveFailures().length > 0,
     eng.getActiveFailures().join(', '));
  eng.applyCommand({ action: 'clear_all_failures' });
  ck('clear_all_failures clears the ledger', eng.getActiveFailures().length === 0, '');
  eng.reset();
  var tR = eng.getTrueState();
  ck('reset() is a fresh plant', tR.scrammed === false && tR.sim_time_s < 1,
     't = ' + tR.sim_time_s.toFixed(2) + ' s, scrammed ' + tR.scrammed);

  /* ---- 4. THE SAVE CONTRACT ------------------------------------------------------------------ */
  head('THE SAVE  [pwr2-1.0 only, and the round trip is BIT-EXACT]');
  var eng2 = new SH.PWR2Engine({});
  /* the save fixture settles 700 s — MEASURED, not guessed: at 400 s the plant is still in
   * its startup-dip recovery with the prop ladder RAILED full on truth and indication alike
   * (htr 157.8 kW, err -21 psi), so a mutant that hands the post-load step truth instead of
   * readings moves NOTHING and is blind. At 700 s the ladder is partial (26.9 kW, 2231 psia)
   * — the indicated-vs-truth difference is load-bearing and the same mutant diverges at
   * step 1. A fixture's operating point is part of what a check asserts. */
  run(eng2, 700);
  var refusedOld = false;
  try { eng2.loadState({ schema: 'pwr-1.0', state: {} }); }
  catch (e) { refusedOld = /pwr2-1\.0/.test(e.message) && /fabrication/.test(e.message); }
  ck('a pwr-1.0 save is REFUSED with the D4 §5 reason — inventing node state is fabrication',
     refusedOld === true, '');
  var save = eng2.saveState();
  ck('the save declares its schema and survives JSON (serializability is proven, not hoped)',
     save.schema === 'pwr2-1.0' && JSON.parse(JSON.stringify(save)).schema === 'pwr2-1.0', '');
  var N = quiet ? 250 : 500, A = [], B = [];
  for (var i = 0; i < N; i++) {
    var ta = eng2.step(DT);
    A.push(ta.pressure_mpa + '|' + ta.tavg_c + '|' + ta.pzr_level_pct + '|' +
           eng2.getInstruments().tavg + '|' + eng2.getInstruments().primary_pressure);
  }
  eng2.loadState(save);
  for (i = 0; i < N; i++) {
    var tb = eng2.step(DT);
    B.push(tb.pressure_mpa + '|' + tb.tavg_c + '|' + tb.pzr_level_pct + '|' +
           eng2.getInstruments().tavg + '|' + eng2.getInstruments().primary_pressure);
  }
  var firstDiff = -1;
  for (i = 0; i < N; i++) { if (A[i] !== B[i]) { firstDiff = i; break; } }
  ck('save -> run ' + N + ' steps -> load -> run again: BIT-EXACT, physics AND instruments',
     firstDiff === -1,
     firstDiff === -1 ? 'every sampled field identical over ' + N + ' steps'
                      : 'first divergence at step ' + firstDiff);
}

console.log('\nPWR2 -- THE SHELL CLASS (Option B stage B2): the surface the stack holds');
var rec = [];
runSuite(loadAll(), rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var SHSRC = fs.readFileSync(path.join(SRC, 'pwr2_shell.js'), 'utf8').replace(/\r\n/g, '\n');
var MUTATIONS = [
  ['a REFUSED command is silently swallowed (reads exactly like a plant that survived it)',
   "    if (REFUSED[a] !== undefined) {\n      throw new Error('pwr2_shell: \"' + a + '\" REFUSED — ' + REFUSED[a]);\n    }",
   '    if (REFUSED[a] !== undefined) { return { ok: true, action: a }; }'],
  ['loadState accepts a pwr-1.0 save (node state invented from lumped values)',
   "    if (!saved || saved.schema !== 'pwr2-1.0') {",
   "    if (false) {"],
  ['the readings dict is not saved (one post-load step of truth-fed control)',
   '             reading: insReading },',
   '             reading: {} },'],
  ['the pressurizer seat is never re-linked on load (the vessel falls off the plant)',
   '    e.sys.extraMass = PZ.extraMassFn(e.pz);',
   ''],
  ['the shell instruments are never updated after construction (every gauge frozen at t=0)',
   '    this.instruments.update(this._ts, dt, {});',
   ''],
  ['the REFUSED registry is emptied (39 refusals become unknown-action errors with no reasons)',
   'var REFUSED = {',
   'var REFUSED = {}; var REFUSED_gone = {'],
  ['the instrument-failure command maps every mode to STUCK',
   "      var mode = c.mode === 'fail_low' ? 'low' : c.mode === 'fail_high' ? 'high'\n               : c.mode === 'noisy' ? 'noisy' : 'stuck';",
   "      var mode = 'stuck';"]
];

console.log('\ninjection self-test (' + MUTATIONS.length + ' mutations):');
var blind = 0;
MUTATIONS.forEach(function (mt) {
  var mutated = SHSRC.replace(mt[1], mt[2]);
  if (mutated === SHSRC) { console.log('  ANCHOR MISS ' + mt[0]); blind++; return; }
  var rec2 = [];
  try { runSuite(loadAll(mutated), rec2, true); } catch (e) { /* a crash counts as caught */ }
  var f2 = rec2.length ? rec2.filter(function (r) { return !r.ok; }).length : 1;
  if (f2 === 0) { console.log('  BLIND TO  ' + mt[0] + '   <-- THIS GATE CANNOT SEE IT'); blind++; }
  else console.log('  caught    ' + mt[0].padEnd(70) + f2 + ' red');
});
loadAll();

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_shell: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit(fail > 0 || blind > 0 ? 1 : 0);
