/* run_pwr2_ab.js — THE A/B HARNESS (PWR2_ARCHITECTURE.md "The A/B harness", built at last:
 * Option B put both engines behind the same surface, which is the first moment matched
 * scenarios cost nothing).
 *
 * **A MEASUREMENT, NOT A GATE — the architecture doc's own words, and the distinction is
 * load-bearing.** The refactor precedent (#393) replayed frames under the claim "nothing
 * changed"; here THE CLAIM IS THE OPPOSITE — D4 §8's 41-agent classification pass upheld 19
 * fields as PROXIES, meaning divergence is PREDICTED, and pre-registered so it cannot be
 * rationalized afterward. This runner reports a divergence table per variable per scenario,
 * tags each field with its D4 class, computes the one falsifiable §2 prediction explicitly,
 * and EXITS 0 ALWAYS. Adjudication is Hard Rule 9 — the plant is ground truth, a [derived]
 * number outranks a fitted one — applied one divergence at a time, by a reader, in
 * PWR2_VALIDATION.md. A divergence table read as pass/fail would either bless every change
 * or reject every change, and both are wrong.
 *
 * THE PRE-REGISTERED PREDICTION (D4 §2, verbatim): "primary_void_fraction should track the
 * old value closely in a UNIFORM voiding transient and diverge sharply in a LOCALISED one
 * (a hot-leg break vs a cold-leg break at equal severity). If it does not diverge there,
 * either the topology is not doing its job or the old proxy was better than believed."
 *
 * MATCHED COMMANDS: both engines take the same applyCommand action; PWR2's REHOMED
 * primary_leak declares severity 1.0 = 20 cm² at the old implicit cold leg, which is the
 * equal-severity mapping this comparison rides.
 *
 * Run: node test/run_pwr2_ab.js            (~2-4 min; prints the table, writes nothing)
 */
'use strict';
var path = require('path');

function load(p) { require(path.join(__dirname, '..', p)); }
load('engines/load_mode.js');
load('engines/pwr/pwr_config.js');
load('layers/control/pwr_control.js');
load('layers/control/control_kernel.js');
load('engines/pwr/pwr_instruments.js');
load('engines/pwr/pwr_thermal.js');
load('engines/pwr/pwr_pressurizer.js');
load('engines/pwr/pwr_primary.js');
load('engines/pwr/pwr_steam_generator.js');
load('engines/pwr/pwr_engine.js');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_kinetics',
 'pwr2_fuel', 'pwr2_reactor', 'pwr2_sources', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief',
 'pwr2_condenser', 'pwr2_cvcs', 'pwr2_eccs', 'pwr2_afw', 'pwr2_damage', 'pwr2_protection',
 'pwr2_pressurizer', 'pwr2_dumpctl', 'pwr2_break', 'pwr2_containment', 'pwr2_rhr',
 'pwr2_true_state', 'pwr2_instruments', 'pwr2_feedwater', 'pwr2_engine', 'pwr2_shell'].forEach(function (f) {
  load('engines/pwr2/' + f + '.js');
});

var RD = globalThis.RD;
var DT = 0.02, SAMPLE_S = 1.0;

/* D4 §8's classification, retyped — the 19 upheld proxies (DIVERGENCE PREDICTED) and the 10
 * challenge-downgraded translations (AGREEMENT EXPECTED), plus naturals as the sanity floor. */
var FIELDS = {
  /* naturals — if these diverge on a benign ride, an ENGINE is wrong, not a proxy */
  pressure_mpa: 'natural', tavg_c: 'natural', power_pct: 'natural',
  /* the 19 upheld proxies */
  primary_void_fraction: 'PROXY', core_void_fraction: 'PROXY', pzr_level_pct: 'PROXY',
  pzr_mass_frac: 'PROXY', sg_level_pct: 'PROXY', sg_level_wide_pct: 'PROXY',
  leak_flow: 'PROXY', natural_circulation: 'PROXY', t_core_exit_c: 'PROXY',
  clad_temp_c: 'PROXY', core_uncovered_frac: 'PROXY', zirc_heat_pct: 'PROXY',
  rcp_cavitation_frac: 'PROXY', porv_tailpipe_temp_c: 'PROXY',
  afw_discharge_pressure_mpa: 'PROXY', hpi_discharge_pressure_mpa: 'PROXY',
  mwe_output: 'PROXY', containment_pressure_mpa: 'PROXY', containment_sump_pct: 'PROXY',
  /* downgraded on challenge — treat as translation, expect agreement */
  fuel_temp_c: 'translation', afw_flow_normalized: 'translation',
  spray_flow_pct: 'translation', accumulator_flow_normalized: 'translation',
  steam_pressure_mpa: 'translation', rcp_cavitating: 'translation',
  condenser_vacuum_kpa: 'translation', melted: 'translation',
  ctmt_h2_pct: 'translation', containment_temp_c: 'translation'
};
var FIELD_NAMES = Object.keys(FIELDS);

/* A runs UNDER ITS CONTROL LAYER at the service's own PROTECTION_DT (0.1 s): the old
 * plant's trips/actuations live in M4, and a bare engine rides through a turbine trip at
 * power — measured on the first run as a ~95 % power divergence that was harness
 * architecture, not physics. No automation channels are engaged (engageDefaults is M5's),
 * which MATCHES B's posture: PWR2's config empties the M4 acting parts and its own
 * internal RPS/controls do that work. */
function mkA() {
  var e = new RD.PWREngine({ initial_state: 'hot_full_power', seed: 0xAB1 });
  e.__layer = new RD.ControlLayer(e, e.getProtectionConfig());
  e.__evalAcc = 0;
  return e;
}
function mkB() {
  var b = new RD.pwr2.shell.PWR2Engine({});
  for (var i = 0; i < 700 / DT; i++) b.step(DT);      /* the measured heater-recovery settle */
  return b;
}

/* ride(eng, secs, at) — step and sample; `at` maps t -> [command...] to apply at that second */
function ride(eng, secs, at) {
  var out = [], next = 0;
  for (var i = 0; i < secs / DT; i++) {
    var t = i * DT;
    if (at && at[Math.floor(t)] && Math.abs(t - Math.floor(t)) < DT / 2) {
      at[Math.floor(t)].forEach(function (c) {
        try { eng.applyCommand(c); } catch (e) { /* a REFUSED command on one side is itself data */ }
      });
    }
    eng.step(DT);
    if (eng.__layer) {
      eng.__evalAcc += DT;
      if (eng.__evalAcc >= 0.1 - DT / 2) { eng.__layer.evaluate(eng.getInstruments(), eng.__evalAcc); eng.__evalAcc = 0; }
    }
    var ts = eng.getTrueState();     /* the old engine's step() returns nothing; both classes
                                      * answer getTrueState() */
    if (t >= next) {
      var row = {};
      FIELD_NAMES.forEach(function (f) {
        var v = ts[f];
        row[f] = typeof v === 'boolean' ? (v ? 1 : 0) : (typeof v === 'number' ? v : NaN);
      });
      out.push(row);
      next += SAMPLE_S;
    }
  }
  return out;
}

function compare(rowsA, rowsB) {
  var n = Math.min(rowsA.length, rowsB.length), stats = {};
  FIELD_NAMES.forEach(function (f) {
    var maxD = 0, sum = 0, cnt = 0, aAbs = 0, bothFinite = 0;
    for (var i = 0; i < n; i++) {
      var a = rowsA[i][f], b = rowsB[i][f];
      if (!isFinite(a) || !isFinite(b)) continue;
      bothFinite++;
      var d = Math.abs(a - b);
      if (d > maxD) maxD = d;
      sum += d; cnt++; aAbs += Math.abs(a);
    }
    stats[f] = { maxD: maxD, meanD: cnt ? sum / cnt : NaN,
                 scale: cnt ? Math.max(aAbs / cnt, 1e-9) : NaN,
                 coverage: bothFinite / n };
  });
  return stats;
}

function table(title, stats) {
  console.log('\n=== ' + title + ' ' + '='.repeat(Math.max(1, 60 - title.length)));
  console.log('  field                        class        max|d|      mean|d|    rel');
  FIELD_NAMES.forEach(function (f) {
    var s = stats[f];
    if (!s || !isFinite(s.meanD)) { console.log('  ' + f.padEnd(29) + FIELDS[f].padEnd(12) + '   (no finite overlap)'); return; }
    var rel = s.meanD / s.scale;
    console.log('  ' + f.padEnd(29) + FIELDS[f].padEnd(12) +
      s.maxD.toExponential(2).padStart(9) + '  ' + s.meanD.toExponential(2).padStart(9) +
      '  ' + (isFinite(rel) ? (rel * 100).toFixed(1).padStart(6) + ' %' : '      -'));
  });
}

console.log('\nPWR2 A/B — THE DIVERGENCE MEASUREMENT (not a gate; adjudication is HR9, one at a time)');
console.log('A = engines/pwr (hot_full_power) · B = PWR2 via the shell class · sampled 1 Hz');

/* ---- 1. STEADY, 600 s -------------------------------------------------------------------- */
var sA = ride(mkA(), 600), sB = ride(mkB(), 600);
table('STEADY 600 s', compare(sA, sB));

/* ---- 2. LOAD 100 -> 70 MWe at t=30, 600 s ------------------------------------------------- */
var lA = ride(mkA(), 600, { 30: [{ action: 'set_load_target', mwe: 70 }] });
var lB = ride(mkB(), 600, { 30: [{ action: 'set_load_target', mwe: 70 }] });
table('LOAD 100->70 MWe', compare(lA, lB));

/* ---- 3. TURBINE TRIP at t=30, 600 s ------------------------------------------------------- */
var tA = ride(mkA(), 600, { 30: [{ action: 'trip_turbine' }] });   /* A's name for it */
var tB = ride(mkB(), 600, { 30: [{ action: 'turbine_trip' }] });
table('TURBINE TRIP', compare(tA, tB));

/* ---- 4. STUCK PORV at t=30, 900 s — the TMI ride ------------------------------------------ */
var pA = ride(mkA(), 900, { 30: [{ action: 'inject_failure', failure_id: 'stuck_porv_open', severity: 1 }] });
var pB = ride(mkB(), 900, { 30: [{ action: 'inject_failure', failure_id: 'stuck_porv_open', severity: 1 }] });
table('STUCK PORV (TMI), 900 s', compare(pA, pB));

/* ---- 5. LOSS OF FLOW at t=30, 600 s ------------------------------------------------------- */
var fA = ride(mkA(), 600, { 30: [{ action: 'inject_failure', failure_id: 'rcp_trip', severity: 1 }] });   /* A's pump trip is a failure id */
var fB = ride(mkB(), 600, { 30: [{ action: 'inject_failure', failure_id: 'rcp_trip', severity: 1 }] });
table('LOSS OF FLOW', compare(fA, fB));

/* ---- 6. THE PRE-REGISTERED TOPOLOGY PREDICTION (D4 §2) ------------------------------------
 * A cannot represent break LOCATION (the point). Run A once with its location-less leak;
 * run B twice at the same 20 cm² — cold leg (the old implicit location) and hot leg. */
/* A has no location-less small-break id at this size; its nearest is large_loca. A's ride is
 * CONTEXT here — the pre-registered verdict is B-vs-B (cold vs hot at the same area). */
var leakA  = ride(mkA(), 600, { 30: [{ action: 'inject_failure', failure_id: 'large_loca', severity: 0.2 }] });
var leakBc = ride(mkB(), 600, { 30: [{ action: 'primary_leak', severity: 1.0 }] });   /* B: 20 cm2 at the old implicit cold leg */
var bHot = mkB();
var leakBh = (function () {
  var out = [], next = 0;
  for (var i = 0; i < 600 / DT; i++) {
    var t = i * DT;
    if (Math.abs(t - 30) < DT / 2) {
      RD.pwr2.engine.command(bHot.eng, 'break_open', { area_m2: 0.002, node: 'hot_leg' });
    }
    bHot.step(DT);
    var ts = bHot.getTrueState();
    if (t >= next) {
      var row = {};
      FIELD_NAMES.forEach(function (f) {
        var v = ts[f];
        row[f] = typeof v === 'boolean' ? (v ? 1 : 0) : (typeof v === 'number' ? v : NaN);
      });
      out.push(row); next += SAMPLE_S;
    }
  }
  return out;
})();
table('SBLOCA 20 cm2 COLD LEG (A leak vs B cold)', compare(leakA, leakBc));
table('SBLOCA 20 cm2 HOT LEG  (A leak vs B hot)', compare(leakA, leakBh));

/* the prediction, computed explicitly: B's OWN cold-vs-hot spread on primary_void_fraction
 * is the locality signal A cannot produce */
var loc = compare(leakBc, leakBh);
var pv = loc.primary_void_fraction, cv = loc.core_void_fraction;
console.log('\n=== THE PRE-REGISTERED PREDICTION (D4 sec 2) ' + '='.repeat(28));
console.log('  B cold-leg vs B hot-leg at the SAME 20 cm2 — the locality A cannot represent:');
console.log('    primary_void_fraction  max|d| ' + pv.maxD.toExponential(2) +
            '   mean|d| ' + pv.meanD.toExponential(2));
console.log('    core_void_fraction     max|d| ' + cv.maxD.toExponential(2) +
            '   mean|d| ' + cv.meanD.toExponential(2));
console.log('  VERDICT (mechanical half only — the reading is the adjudicator\'s): ' +
  (pv.maxD > 0.05 ? 'the hot-leg and cold-leg breaks READ DIFFERENTLY on B — topology is doing its job'
                  : 'B reads the two locations NEARLY ALIKE — either the topology is not doing its ' +
                    'job or the old proxy was better than believed (the prediction\'s own words)'));

console.log('\n' + '='.repeat(70));
console.log('  run_pwr2_ab measurement complete');
console.log('  (this runner never fails; adjudication is HR9, one divergence at a time,');
console.log('   recorded in Blueprint/PWR2_VALIDATION.md)');
console.log('='.repeat(70) + '\n');
console.log('7 rides ' + FIELD_NAMES.length + ' checks');
process.exit(0);
