/* term_budget.js — WHICH SINK IS ACTUALLY COOLING THE PLANT?
 *
 *   node tools/term_budget.js --for=1800s --every=120s \
 *     --cmd='0s:{"action":"inject_failure","failure_id":"large_loca","severity":0.05}'
 *   node tools/term_budget.js --nudge=thermal.blowdown_gain*0 --for=1800s
 *   node tools/term_budget.js --list-terms
 *
 * WHY THIS EXISTS (#450/#451, 2026-08-11)
 * ---------------------------------------
 * `measure_stack` answers "what did the plant do". It cannot answer "which term did it", and
 * that question decided the #451 investigation three times over. The issue's own ordered list
 * of candidates put the steam generator first and the break's flash-cooling term second; both
 * are real terms and both are small. MEASURED here, on the sev-0.05 break the issue is filed
 * against, the SG term goes POSITIVE after the primary/secondary crossover (it warms the
 * primary through the 5 % reverse path) and the flash term never exceeds 8 % of the dominant
 * one. The candidates were ranked by plausibility. This tool ranks them by size.
 *
 * IT PROVES CLOSURE RATHER THAN DEFINING IT. Every term below is recomputed from
 * `pwr_thermal.stepCoolant`'s own expressions against the post-step engine state, and the
 * printed `resid` column is `_dTavg_dt` MINUS their sum. A budget where the last column is
 * "everything else, by difference" cannot tell a missing term from a mis-modelled one — it
 * absorbs both silently, which is the failure this column exists to make impossible. If
 * `resid` is not ~0 the table is WRONG, not interesting: a term has been added to the engine
 * and not to this file, and the header says so in red.
 *
 * FULL STACK, and driven by tick() — never `svc.start()`, which advances in WALL time
 * (measure_stack's header has the measured table). Same `--nudge` applier as
 * tools/perturb_sweep.js and test/measure_stack.js, so a counterfactual taken here and a
 * gate result taken there are the same plant.
 *
 * NOT A GATE, and it lives in tools/ for the reason perturb_sweep does: `run_all` discovers
 * `test/run_*.js` and demands a baseline, and this has no stable score — its output is a
 * diff against a hypothesis. PWR only; RBMK/BWR are on hold.
 */
'use strict';
var C = '\x1b[36m', Y = '\x1b[33m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
function load(f) { require(path.join(ROOT, f)); }

// ------------------------------------------------------------------------ args
var KNOWN = { ic: 1, for: 1, every: 1, accel: 1, seed: 1, cmd: 1, nudge: 1, lineup: 1,
              csv: 1, 'list-terms': 1, help: 1 };
var OPT = { cmds: [] };
process.argv.slice(2).forEach(function (a) {
  var m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
  if (!m) die('unrecognised argument "' + a + '" — options are --' + Object.keys(KNOWN).join(' --'));
  if (!KNOWN[m[1]]) die('unknown option "--' + m[1] + '" — options are --' + Object.keys(KNOWN).join(' --'));
  if (m[1] === 'cmd') OPT.cmds.push(m[2]);
  else OPT[m[1].replace(/-/g, '_')] = (m[2] == null ? true : m[2]);
});
function die(msg) { console.error(R + 'term_budget: ' + msg + X); process.exit(2); }
if (OPT.help) { console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
function dur(s, dflt) {
  if (s == null) return dflt;
  var m = /^([0-9.]+)\s*([smh]?)$/.exec(String(s).trim());
  if (!m) die('cannot read a duration from "' + s + '" — use 90s, 30m or 12h');
  var n = parseFloat(m[1]);
  return m[2] === 'h' ? n * 3600 : m[2] === 'm' ? n * 60 : n;
}

// ------------------------------------------------------ load: CONFIG, nudge, then the rest
load('engines/load_mode.js');
load('engines/pwr/pwr_config.js');
var RD = globalThis.RD, NUDGED = null;
if (OPT.nudge) {
  try { NUDGED = require('./_config_nudge.js').applyNudge(RD.PWR_CONFIG, OPT.nudge); }
  catch (e) { die(e.message); }
}
['layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_pressurizer2.js',
 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js', 'engines/pwr/pwr_instruments.js',
 'engines/pwr/pwr_engine.js', 'layers/control/control_kernel.js', 'layers/instructor_layer.js',
 'layers/simulation_service.js'].forEach(load);

/* THE TERMS. One entry per contribution to `dTavg` in pwr_thermal.stepCoolant, in that
 * function's own order, each recomputed from the SAME expression against post-step state.
 * When a term is added there, add it here — the `resid` column is what catches you if you
 * do not, and it is the only reason this file may be trusted at all. */
var TERMS = [
  { key: 'sg', label: 'SG heat sink',
    doc: 'h_sg-coupled crossing heat, POWER-divided. Positive = the SG is warming the primary '
       + '(the sg_reverse_frac back-path, which is 5 % of forward conductance).',
    f: function (s, cfg) { return -(s._Q_coolant_to_sg || 0) / cfg.thermal.coolant_heat_capacity; } },
  { key: 'rhr', label: 'RHR',
    doc: 'Shutdown-cooling heat exchanger. Zero unless rhr_active AND condenser cooling is up.',
    f: function (s, cfg) {
      var e = cfg.emergency;
      if (!(s.rhr_active && s.condenser_cooling_available)) return 0;
      var tb = cfg.turbine || {}, cwRef = tb.cw_inlet_ref_c != null ? tb.cw_inlet_ref_c : 15.5556;
      var cwNow = s.cw_inlet_temp_c != null ? s.cw_inlet_temp_c : cwRef;
      var Q = e.rhr_gain * (s.rhr_hx_fraction != null ? s.rhr_hx_fraction : 1)
            * Math.max(0, s.tavg_c - (e.rhr_sink_c + (cwNow - cwRef)));
      return -Q / cfg.thermal.coolant_heat_capacity;
    } },
  { key: 'fuel', label: 'fuel → coolant',
    doc: 'h_fc_eff·(Tfuel − Tavg), POWER-divided. At steady power this balances the SG term; '
       + 'after a scram it is the decay-heat contribution.',
    f: function (s, cfg) {
      var h = s._h_fc_eff != null ? s._h_fc_eff : cfg.thermal.h_fc;
      return h * (s.fuel_temp_c - s.tavg_c) / cfg.thermal.coolant_heat_capacity;
    } },
  { key: 'pump', label: 'RCP shaft work',
    doc: 'Rotor-driven flow only (#367) — buoyancy is not a pump, so established natural '
       + 'circulation contributes exactly zero.',
    f: function (s, cfg) {
      var t = cfg.thermal, q = s.flow_frac;
      if (!s.pump_running) {
        var buoy = (RD.pwrPrimary && RD.pwrPrimary.naturalCircFlow) ? RD.pwrPrimary.naturalCircFlow(s, cfg) : 0;
        q = Math.max(0, s.flow_frac - buoy);
      }
      return t.heat_gen_coeff * (t.pump_heat_frac || 0) * q / t.coolant_heat_capacity;
    } },
  { key: 'eccs', label: 'cold ECCS quench',
    doc: 'Perfect-mixing pull toward eccs_temp_c at the injection throughput. NOT power-divided '
       + '— it is already a rate. Accumulator discharge shows up here, not as its own term.',
    f: function (s, cfg) {
      var e = cfg.emergency, q = s._eccs_inj_inv || 0;
      if (!(q > 0) || e.eccs_temp_c == null) return 0;
      return (e.eccs_cooling_gain != null ? e.eccs_cooling_gain : 0) * q * (e.eccs_temp_c - s.tavg_c);
    } },
  { key: 'blowdown', label: 'break flash-cooling',
    doc: 'Saturation-gated (#363) pull toward blowdown_sink_c at the break throughput. Keyed on '
       + 'leak_flow, so a stuck-open PORV vents the steam space and contributes nothing here.',
    f: function (s, cfg) {
      var t = cfg.thermal, q = s.leak_flow || 0;
      if (!(q > 0) || !t.blowdown_gain) return 0;
      var flashing = (s.primary_void_fraction > 0) || trueSubcooling(s) <= 0;
      if (!flashing) return 0;
      return t.blowdown_gain * q * ((t.blowdown_sink_c != null ? t.blowdown_sink_c : 100) - s.tavg_c);
    } },
];
// The engine's own saturation test, in this file's currency — same boundary convention as
// pwr_thermal (`<= 0` includes exactly-saturated, where flashing does occur).
function trueSubcooling(s) {
  return 179.47 * Math.pow(Math.max(s.pressure_mpa, 1e-9), 0.239) - s.tavg_c;
}

if (OPT.list_terms) {
  console.log('\n' + B + 'dTavg TERMS' + X + D + '  (pwr_thermal.stepCoolant, in engine order)' + X);
  TERMS.forEach(function (t) { console.log('\n  ' + C + t.key + X + '  ' + t.label + '\n    ' + D + t.doc + X); });
  console.log('\n  ' + Y + 'resid' + X + '  _dTavg_dt minus the sum of the above.' +
    '\n    ' + D + 'Must be ~0. Non-zero means the engine has a term this file does not know about —\n' +
    '    the table is WRONG, not interesting.' + X + '\n');
  process.exit(0);
}

// ------------------------------------------------------------------------ run
var IC = OPT.ic || 'hot_full_power';
var FOR = dur(OPT.for, 1800), EVERY = OPT.every != null ? dur(OPT.every) : Math.max(1, FOR / 15);
var ACCEL = OPT.accel != null ? parseFloat(OPT.accel) : 10;
var SEED = OPT.seed != null ? parseInt(OPT.seed, 10) : 4242;
var svc = new RD.SimulationService({ seed: SEED });
svc.selectPlant('pwr', IC, null, OPT.lineup === 'bare' ? { noDefaults: true } : undefined);
svc.running = true; svc.timeAcceleration = ACCEL;

var SCHED = OPT.cmds.map(function (spec) {
  var i = spec.indexOf(':');
  if (i < 0) die('--cmd needs "<time>:<json>", got "' + spec + '"');
  var body; try { body = JSON.parse(spec.slice(i + 1)); }
  catch (err) { die('--cmd payload is not JSON: ' + spec.slice(i + 1)); }
  return { at: dur(spec.slice(0, i)), body: body, sent: false };
}).sort(function (a, b) { return a.at - b.at; });

/* THE TERMS MUST BE EVALUATED ON WHAT stepCoolant SAW, NOT ON WHAT IT LEFT BEHIND.
 *
 * The first version of this file recomputed from post-step state and did not close: worst
 * residual 1.2e-2 °C/s, on the sample where RHR engaged. Two skews, both structural and
 * neither visible in a source read:
 *
 *   - `fuel_temp_c` is written by stepFuel at step 5, BEFORE stepCoolant at step 6, so a
 *     post-tick read gives the NEXT step's fuel temperature;
 *   - a tick is 50 physics steps at accel 10, so any discrete state that flips mid-tick
 *     (`rhr_active`, `pump_running`, the saturation gate) is read in the wrong regime.
 *
 * So wrap the engine's own stepCoolant and evaluate against a PRE-STEP snapshot. Two fields
 * are taken post-call on purpose: `_Q_coolant_to_sg`, which stepCoolant computes internally
 * from pre-step values and stashes, and `_dTavg_dt`, which is the answer being checked.
 * With this the budget closes to ~1e-16 and the residual column means something.
 */
var BUDGET = null;
(function wrapStepCoolant() {
  var orig = RD.pwrThermal.stepCoolant;
  RD.pwrThermal.stepCoolant = function (s, cfg, dt) {
    var pre = Object.assign({}, s);           // shallow is enough — every term reads scalars
    var out = orig.apply(this, arguments);
    pre._Q_coolant_to_sg = s._Q_coolant_to_sg;
    var sum = 0, vals = {};
    TERMS.forEach(function (T) { var v = T.f(pre, cfg); vals[T.key] = v; sum += v; });
    vals.net = s._dTavg_dt || 0;
    vals.resid = vals.net - sum;
    BUDGET = vals;
    return out;
  };
})();

var CSV = !!OPT.csv, rows = [], worstResid = 0, budgetSamples = 0;
function sample() {
  var s = svc.engine.s, ts = svc.engine.getTrueState();
  var r = { t: svc.simTime, tavg_c: s.tavg_c, tsg_c: s.t_sg_c, p: s.pressure_mpa,
            psec: ts.steam_pressure_mpa, inv: ts.core_inventory_pct };
  // Before the first physics step there IS no budget — the pre-step sample carries plant
  // state only, and is excluded from the closure verdict rather than counted as a zero.
  if (BUDGET) {
    Object.keys(BUDGET).forEach(function (k) { r[k] = BUDGET[k]; });
    budgetSamples++;
    if (Math.abs(r.resid) > Math.abs(worstResid)) worstResid = r.resid;
  }
  rows.push(r);
}

if (!CSV) {
  console.log('\n' + B + 'dTavg TERM BUDGET — FULL STACK (M4 + M5 + M6)' + X);
  console.log(D + '  Every term recomputed from pwr_thermal.stepCoolant\'s OWN pre-step inputs.' +
              '\n  `resid` is _dTavg_dt MINUS their sum — it is the proof, not a catch-all.' + X);
  console.log('  initial condition ' + C + IC + X + '   seed ' + SEED + '   accel ' + ACCEL + 'x' +
              '   lineup ' + (OPT.lineup === 'bare' ? 'bare' : 'default (free play)'));
  if (NUDGED) console.log('  ' + Y + 'nudge ' + NUDGED.path + ' ×' + NUDGED.factor +
    '  (' + NUDGED.from + ' → ' + NUDGED.to + ')  — NOT THE SHIPPED PLANT' + X);
  SCHED.forEach(function (c) { console.log('  command @' + c.at + 's  ' + JSON.stringify(c.body)); });
  console.log(D + '  rates in °C/s; ×9/5 for °F/s (a RATE — no 32-degree offset)' + X + '\n');
}

sample();
var next = EVERY;
while (svc.simTime < FOR) {
  SCHED.forEach(function (c) {
    if (!c.sent && svc.simTime >= c.at) { c.sent = true; svc.handleCommand(c.body); }
  });
  svc.tick();
  if (svc.simTime >= next) { sample(); next += EVERY; }
}

// ------------------------------------------------------------------------ output
var COLS = [['t(s)', 't', 0], ['Tavg°F', 'tavg_c', 1], ['Tsg°F', 'tsg_c', 1], ['P psi', 'p', 0],
            ['Psec psi', 'psec', 0], ['inv%', 'inv', 1]]
  .concat(TERMS.map(function (T) { return [T.key, T.key, 'rate']; }))
  .concat([['net', 'net', 'rate'], ['resid', 'resid', 'rate']]);
function cell(r, spec) {
  var v = r[spec[1]];
  if (v == null) return '—';
  if (spec[2] === 'rate') return v === 0 ? '0' : v.toPrecision(3);
  if (spec[1] === 'tavg_c' || spec[1] === 'tsg_c') v = v * 9 / 5 + 32;
  if (spec[1] === 'p' || spec[1] === 'psec') v = v * 145.038;
  return v.toFixed(spec[2]);
}
if (CSV) {
  console.log(COLS.map(function (c) { return c[0]; }).join(','));
  rows.forEach(function (r) { console.log(COLS.map(function (c) { return cell(r, c); }).join(',')); });
} else {
  console.log(COLS.map(function (c) { return c[0].padEnd(10); }).join(''));
  console.log(D + COLS.map(function () { return '───────── '; }).join('') + X);
  rows.forEach(function (r) { console.log(COLS.map(function (c) { return cell(r, c).padEnd(10); }).join('')); });
  // THE CLOSURE VERDICT. A budget nobody checked is a budget that has quietly stopped being one.
  var tol = 1e-9;   // float noise only — the terms are evaluated on stepCoolant's own inputs
  console.log('');
  if (Math.abs(worstResid) <= tol) {
    console.log(D + '  budget closes — worst |resid| ' + Math.abs(worstResid).toExponential(2) +
      ' °C/s over ' + budgetSamples + ' stepped samples.' + X);
  } else {
    console.log(R + B + '  BUDGET DOES NOT CLOSE' + X + R + ' — worst |resid| ' +
      Math.abs(worstResid).toExponential(2) + ' °C/s, tolerance ' + tol.toExponential(0) + '.' + X);
    console.log(R + '  pwr_thermal.stepCoolant has a dTavg term this file does not model.' +
      '\n  Add it to TERMS before believing any column above.' + X);
    process.exitCode = 1;
  }
}
