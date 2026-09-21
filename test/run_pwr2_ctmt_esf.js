/*
 * run_pwr2_ctmt_esf.js — THE CONTAINMENT ENGINEERED SAFETY FEATURES, ON THE PLANT. (#784)
 *
 * Containment spray, the containment recirculation fan coolers and the steam-line isolation that
 * shares their bistable, built as AUTO-ONLY systems inside the PWR2 engine
 * *(OWNER RULING, 2026-09-21: "Authorise it — auto-only (Recommended)")*. No board control, no
 * player lever, no new operator command: the only way this plant runs a spray pump is for the
 * plant to decide to, so the only way to test it is to ride a casualty.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS RUNNER IS SHAPED THE WAY IT IS. Four traps, each of which has cost this repo a
 * shipped defect, and each of which a containment-spray gate walks straight into:
 *
 * 1. **IT GATES THE EFFECT, NEVER THE WRITE.** A check that asserts `spray_active === true`, or
 *    that a driver was handed to the containment layer, is a DARK WIRE — #507 wave 6 shipped
 *    three that way and #540 a fourth for six days. Every actuation check here is paired with a
 *    PRESSURE check: containment psig at a fixed time, measured against the same ride with the
 *    mechanism neutered. The actuation timings are reported, but the thing that must move is the
 *    building.
 *
 * 2. **EACH HALF IS SEPARATELY SUFFICIENT TO FAIL** (#295, #545). Spray and the fan coolers both
 *    lower containment pressure, so a one-sided injection lies: break spray and the fans still
 *    bring the peak down, and a check on the peak alone stays green. Band 2 is therefore a
 *    FOUR-WAY decomposition — neither, fans only, spray only, both — and it asserts the ORDER of
 *    the four peaks, which no single half can satisfy on its own.
 *
 * 3. **THE DE-ENERGIZATION IS IN THE DELIVERY, NOT THE DEMAND** (#200/#329/#332). Band 3 rides a
 *    station blackout: the demand must STAND with nothing coming out of the nozzles. A model
 *    that un-actuated the signal on losing AC would look identical on the pressure trace and
 *    would heal itself the moment a bus came back.
 *
 * 4. **A "NOTHING HAPPENS ON A HEALTHY PLANT" CHECK PINS A NON-EVENT.** Band 4 is a
 *    BIFURCATION, not an absence: the same runner has already proved on band 1 that these
 *    systems CAN fire, so the healthy-plant leg is a second branch of a measurement rather than
 *    a claim nothing can falsify.
 *
 * ---------------------------------------------------------------------------------------------
 * THE MUTATION SELF-TEST IS A CHILD PROCESS, and that is not incidental. These are full-stack
 * rides through the service, so the mutation has to reach the ENGINE SOURCE — a runtime constant
 * nudge can prove a setpoint is read but cannot prove a wiring line exists. The runner copies
 * `engines/pwr2` to a temp directory, patches one line, and re-invokes itself with `--probe` so
 * the mutated tree is loaded from scratch in a clean process. A mutation whose anchor text no
 * longer matches is reported BLIND, not caught — an orphaned anchor is a mutation that stopped
 * testing anything (#501–#504).
 *
 *   node test/run_pwr2_ctmt_esf.js
 *   node test/run_pwr2_ctmt_esf.js --no-mutations     (checks only, ~40 s)
 */
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var ARGV = process.argv.slice(2);
var PROBE = (function () {
  for (var i = 0; i < ARGV.length; i++) if (ARGV[i] === '--probe') return ARGV[i + 1];
  return null;
})();
var NO_MUT = ARGV.indexOf('--no-mutations') >= 0;

var PSI_PER_MPA = 145.0377;
function psig(mpa) { return mpa * PSI_PER_MPA - 14.696; }
function degF(c) { return c * 9 / 5 + 32; }

/* ------------------------------------------------------------------ THE PROBE (child process) */
/* Loads a PWR2 engine tree (possibly mutated) through the real service and rides three
 * casualties, printing one JSON line. Everything the checks need is measured here; the parent
 * never re-derives a number the probe did not report. */
function probe(engDir) {
  global.window = global;
  var LAYERS = path.join(ROOT, 'layers');
  require(path.join(ROOT, 'engines', 'load_mode.js'));
  require(path.join(ROOT, 'engines', 'pwr', 'pwr_config.js'));
  require(path.join(LAYERS, 'control', 'control_kernel.js'));
  require(path.join(LAYERS, 'control', 'pwr_control.js'));
  ['pwr_thermal', 'pwr_pressurizer', 'pwr_pressurizer2', 'pwr_primary', 'pwr_steam_generator',
   'pwr_instruments', 'pwr_engine'].forEach(function (f) {
    require(path.join(ROOT, 'engines', 'pwr', f + '.js'));
  });
  ['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_kinetics',
   'pwr2_fuel', 'pwr2_reactor', 'pwr2_sources', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief',
   'pwr2_condenser', 'pwr2_cvcs', 'pwr2_eccs', 'pwr2_afw', 'pwr2_damage', 'pwr2_protection',
   'pwr2_pressurizer', 'pwr2_dumpctl', 'pwr2_break', 'pwr2_containment', 'pwr2_rhr',
   'pwr2_true_state', 'pwr2_instruments', 'pwr2_feedwater', 'pwr2_engine', 'pwr2_shell'
  ].forEach(function (f) { require(path.join(engDir, f + '.js')); });
  require(path.join(LAYERS, 'instructor_layer.js'));
  require(path.join(LAYERS, 'simulation_service.js'));
  var RD = globalThis.RD, P2 = RD.pwr2;

  /* ⚠ NEVER svc.start() — it arms setTimeout(broadcastMs) and advances in WALL time. */
  function ride(opts) {
    var svc = new RD.SimulationService({ seed: 0xC7E84 });
    svc.selectPlant('pwr2', opts.ic || 'hot_full_power', null, undefined);
    svc.running = true; svc.timeAcceleration = 1; svc.attentionStops = false;
    var k;
    for (k = 0; k < 20; k++) svc.tick();
    (opts.inject || []).forEach(function (inj) {
      svc.handleCommand({ action: 'inject_failure', failure_id: inj.id, severity: inj.sev });
    });
    var o = { peak: 0, peak_t: 0, peak_T: 0, at_end: 0, at_end_T: 0, end_t: 0,
              cross_si: null, cross_hihi: null, si: null, msiv: null,
              spray_demand: null, spray: null, fan_demand: null, fan: null,
              spray_kgs_max: 0, fan_kW_max: 0, spray_mass: 0, fan_energy: 0,
              demand_no_delivery_s: 0, floored: false, clamped: false,
              si_row: null, hihi_row: null, si_blocked_but_armed: null };
    var N = Math.round((opts.secs || 300) / 0.1);
    for (k = 0; k < N; k++) {
      svc.tick();
      var ts = svc.engine.getTrueState(), t = svc.simTime, eng = svc.engine.eng;
      var p = ts.containment_pressure_mpa;
      if (p > o.peak) { o.peak = p; o.peak_t = t; }
      if (ts.containment_temp_c > o.peak_T) o.peak_T = ts.containment_temp_c;
      if (o.cross_si === null && p >= P2.protection.CTMT_ESF.si_mpa) o.cross_si = t;
      if (o.cross_hihi === null && p >= P2.protection.CTMT_ESF.hihi_mpa) o.cross_hihi = t;
      if (o.si === null && (eng.pt && eng.pt.si === true)) o.si = t;
      if (o.msiv === null && ts.msiv_open === false) o.msiv = t;
      if (o.spray_demand === null && ts.ctmt_spray_demand === true) o.spray_demand = t;
      if (o.spray === null && ts.ctmt_spray_active === true) o.spray = t;
      if (o.fan_demand === null && ts.ctmt_fan_safety === true) o.fan_demand = t;
      if (o.fan === null && ts.ctmt_fan_active === true) o.fan = t;
      /* THE EFFECT the two systems are actually having, off the containment result itself */
      var cr = eng._lastCtr || null;
      if (cr) {
        if (cr.spray_kgs > o.spray_kgs_max) o.spray_kgs_max = cr.spray_kgs;
        if (cr.fan_kW > o.fan_kW_max) o.fan_kW_max = cr.fan_kW;
        o.spray_mass = cr.spray_mass_kg; o.fan_energy = cr.fan_energy_kJ;
        if (cr.solver_floored) o.floored = true;
        if (cr.solver_clamped) o.clamped = true;
      }
      /* the #200 split, MEASURED as a duration rather than sampled once */
      if (ts.ctmt_spray_demand === true && ts.ctmt_spray_active === false) o.demand_no_delivery_s += 0.1;
      o.at_end = p; o.at_end_T = ts.containment_temp_c; o.end_t = t;
    }
    var rows = (svc.engine.eng.rpsReport || {}).functions || [];
    rows.forEach(function (r) {
      if (r.id === 'si_hi_ctmt_press') o.si_row = { sp: r.setpoint, avail: r.available, armed: r.armed };
      if (r.id === 'ctmt_hihi_press') o.hihi_row = { sp: r.setpoint, avail: r.available, armed: r.armed };
    });
    return o;
  }

  var out = {
    scale: P2.cvcs.volumeScale(),
    CS: P2.containment.CS,
    CTMT_ESF: P2.protection.CTMT_ESF,
    spray_kgs: P2.containment.sprayFlowKgs(),
    spray_h: P2.containment.sprayEnthalpy(),
    fan_kW_at_140: P2.containment.fanRemovalKW(140),
    fan_kW_at_sink: P2.containment.fanRemovalKW((P2.containment.CS.fan_sink_temp_f - 32) * 5 / 9),
    fan_kW_below_sink: P2.containment.fanRemovalKW((P2.containment.CS.fan_sink_temp_f - 32) * 5 / 9 - 20),
    rows: (function () {
      var ids = {};
      /* the table as DECLARED, read through a constructed plant rather than the source */
      var pr = P2.protection.createProtection({});
      var rep = P2.protection.stepProtection(pr, 0.02, {
        pressure_mpa: 15.4, power_frac: 1.0, flow_frac: 1.0, containment_pressure_mpa: 0.1082 });
      rep.functions.forEach(function (r) { ids[r.id] = { kind: r.kind, sp: r.setpoint, unit: r.unit, avail: r.available }; });
      return ids;
    })(),
    /* the sourced "cannot be blocked by the operator": P-11 takes the other ESFAS rows and
     * not this one. Both legs measured on ONE protection object. */
    blockSI: (function () {
      var pr = P2.protection.createProtection({});
      pr.blockSI = true;
      var rep = P2.protection.stepProtection(pr, 0.02, {
        pressure_mpa: 5.0, power_frac: 0.0, flow_frac: 0.0,
        steam_pressure_mpa: 1.0, containment_pressure_mpa: 0.40 });
      var m = {};
      rep.functions.forEach(function (r) {
        if (r.kind === 'esfas') m[r.id] = { armed: r.armed, asserted: r.asserted, would: r.would_assert };
      });
      return { rows: m, si: rep.si, si_cause: rep.si_cause };
    })(),
    /* no containment reading at all -> BOTH rows unavailable, never a silent not-asserted */
    no_reading: (function () {
      var pr = P2.protection.createProtection({});
      var rep = P2.protection.stepProtection(pr, 0.02, {
        pressure_mpa: 15.4, power_frac: 1.0, flow_frac: 1.0 });
      var m = {};
      rep.functions.forEach(function (r) {
        if (r.id === 'si_hi_ctmt_press' || r.id === 'ctmt_hihi_press') m[r.id] = r.available;
      });
      return m;
    })(),
    /* ⚠ 450 s ON THE LOCA IS NOT PADDING. The mitigated ride TURNS OVER at ~403 s and the
     * unmitigated one is still climbing at 600; a 300 s window measures both mid-climb and
     * `eff-turns-over` cannot be asked at all. The other two rides are cut to what their own
     * checks need so the total sim time stays under the 300 s version's. */
    loca: ride({ inject: [{ id: 'large_loca', sev: 1.0 }], secs: 450 }),
    sbo: ride({ inject: [{ id: 'large_loca', sev: 1.0 }, { id: 'station_blackout', sev: 1.0 }], secs: 150 }),
    healthy: ride({ secs: 60 })
  };
  process.stdout.write('@@JSON@@' + JSON.stringify(out) + '\n');
}

if (PROBE) { probe(PROBE); return; }

/* ------------------------------------------------------------------------- the parent runner */
function runProbe(engDir) {
  var r = cp.spawnSync(process.execPath,
    [__filename, '--probe', engDir], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  var line = (r.stdout || '').split('\n').filter(function (l) { return l.indexOf('@@JSON@@') === 0; })[0];
  if (!line) return { error: ((r.stderr || '') + (r.stdout || '')).slice(-700) || 'no output' };
  return JSON.parse(line.slice(8));
}

var TMP = path.join(os.tmpdir(), 'rd784_' + process.pid);
var MUT_N = 0;
var rec = [];
function ck(id, name, cond, got) {
  rec.push({ id: id, ok: !!cond });
  console.log((cond ? '  PASS  ' : '  FAIL  ') + id.padEnd(22) + name + (got ? '  -- ' + got : ''));
}
function head(s) { console.log('\n' + s); }

console.log('PWR2 — CONTAINMENT ENGINEERED SAFETY FEATURES (#784)');
var B = runProbe(path.join(ROOT, 'engines', 'pwr2'));
if (B.error) { console.log('  PROBE FAILED:\n' + B.error); process.exit(1); }

/* ---------------------------------------------------------- band 0: the sourced declarations */
head('0 -- THE SOURCED NUMBERS, read off the BUILT plant (not the file)');
var DOC = {
  /* retyped from the documents, so a constant edited in the engine reds here rather than
   * agreeing with itself. WTSM 12.3 (ML11223A310); Ginna TS Bases B 3.6.6 + UFSAR ch15
   * Tables 15.6-18a / 15.6-11H (ML20339A221 / ML20339A101). */
  si_psig: 3.5, hihi_psig: 30.0,
  spray_gpm: 1800.0, rwst_f: 50.0, spray_response_s: 28.5, crfc_response_s: 44.0
};
ck('src-setpoints', 'the two containment setpoints are the SOURCED psig values',
   B.CTMT_ESF.si_psig === DOC.si_psig && B.CTMT_ESF.hihi_psig === DOC.hihi_psig,
   B.CTMT_ESF.si_psig + ' / ' + B.CTMT_ESF.hihi_psig + ' psig');
ck('src-converted', '...converted ONCE to absolute MPa, and they agree with the psig',
   Math.abs(psig(B.CTMT_ESF.si_mpa) - DOC.si_psig) < 1e-6 &&
   Math.abs(psig(B.CTMT_ESF.hihi_mpa) - DOC.hihi_psig) < 1e-6,
   psig(B.CTMT_ESF.si_mpa).toFixed(4) + ' / ' + psig(B.CTMT_ESF.hihi_mpa).toFixed(4) + ' psig');
ck('src-capacities', 'spray flow, RWST temperature and both response times are the SOURCED values',
   B.CS.spray_gpm_per_pump === DOC.spray_gpm && B.CS.rwst_temp_f === DOC.rwst_f &&
   B.CS.spray_response_s === DOC.spray_response_s && B.CS.crfc_response_s === DOC.crfc_response_s,
   B.CS.spray_gpm_per_pump + ' gpm, ' + B.CS.rwst_temp_f + ' degF, ' +
   B.CS.spray_response_s + ' s / ' + B.CS.crfc_response_s + ' s');
/* THE SOURCED FLOW ACTUALLY REACHES A MASS FLOW. 1800 gpm of 50 degF water is 113.5 kg/s at the
 * anchor plant's scale; this plant is volume-scaled, so the check is the SCALED figure and the
 * unscaled one it came from — a scale silently dropped would leave the second right and the
 * first 6.8x too big. */
var UNSCALED = B.spray_kgs / B.scale;
ck('src-spray-mass', 'the sourced gpm becomes a real mass flow, scaled on the VOLUME basis',
   Math.abs(UNSCALED - 113.5) < 1.5 && Math.abs(B.spray_kgs - 113.5 * B.scale) < 0.2,
   B.spray_kgs.toFixed(2) + ' kg/s on this plant (' + UNSCALED.toFixed(1) +
   ' kg/s at the anchor plant, scale ' + B.scale.toFixed(4) + ')');
ck('src-spray-enthalpy', 'spray enters at the RWST\'s own sourced temperature, not at ambient',
   B.spray_h > 30 && B.spray_h < 55,
   B.spray_h.toFixed(1) + ' kJ/kg (liquid at ' + DOC.rwst_f + ' degF)');
/* THE FAN TERM IS SELF-LIMITING AT THE SOURCED PRE-ACCIDENT CONDITION. A term that did not go to
 * zero there would drag a recovered containment below the state the source says it sits at, and
 * the realign is a one-shot with no automatic securing. */
ck('fan-self-limit', 'the fan-cooler term is ZERO at and below the sourced pre-accident 125 degF',
   B.fan_kW_at_sink === 0 && B.fan_kW_below_sink === 0 && B.fan_kW_at_140 > 1000,
   'at 125 degF ' + B.fan_kW_at_sink.toFixed(1) + ' kW, at 89 degF ' +
   B.fan_kW_below_sink.toFixed(1) + ' kW, at 284 degF ' +
   (B.fan_kW_at_140 / 1000).toFixed(2) + ' MW');
/* GEND-061, verbatim: "Heat transfer from the containment atmosphere to containment sprays is
 * rapid compared to heat removal by containment coolers". The ORDERING is sourced even though
 * the fan coefficient is fitted, so it is asserted. */
ck('src-ordering', 'spray outruns the fan coolers, as the source orders them',
   B.loca.spray_kgs_max > 0 && B.loca.fan_kW_max > 0 &&
   B.loca.spray_kgs_max * 550 > B.loca.fan_kW_max * 1.5,
   'spray ~' + (B.loca.spray_kgs_max * 550 / 1000).toFixed(1) + ' MW vs fans ' +
   (B.loca.fan_kW_max / 1000).toFixed(1) + ' MW at their peaks');
ck('rows-declared', 'both rows are in the protection table, on the containment channel',
   B.rows.si_hi_ctmt_press && B.rows.ctmt_hihi_press &&
   B.rows.si_hi_ctmt_press.kind === 'esfas' && B.rows.ctmt_hihi_press.kind === 'cse' &&
   B.rows.si_hi_ctmt_press.avail === true && B.rows.ctmt_hihi_press.avail === true,
   'si kind ' + (B.rows.si_hi_ctmt_press || {}).kind + ', hi-hi kind ' +
   (B.rows.ctmt_hihi_press || {}).kind);
ck('rows-unavailable', 'with NO containment reading both rows report unavailable, not not-asserted',
   B.no_reading.si_hi_ctmt_press === false && B.no_reading.ctmt_hihi_press === false,
   'si ' + B.no_reading.si_hi_ctmt_press + ', hi-hi ' + B.no_reading.ctmt_hihi_press);

/* ------------------------------------------------- band 1: the actuation, on a real casualty */
head('1 -- THE ACTUATION, ridden: large loss-of-coolant accident, severity 1.0, 450 s');
var L = B.loca;
ck('act-si-backup', 'safety injection latches when containment crosses the sourced 3.5 psig',
   L.cross_si !== null && L.si !== null && L.si <= L.cross_si + 1.5,
   'crossed 3.5 psig at ' + fmt(L.cross_si) + ', SI latched at ' + fmt(L.si));
ck('act-hihi-msiv', 'the main steam isolation valve SHUTS on the sourced 30 psig high-high',
   L.cross_hihi !== null && L.msiv !== null && L.msiv > L.cross_hihi && L.msiv < L.cross_hihi + 8,
   'crossed 30 psig at ' + fmt(L.cross_hihi) + ', valve shut at ' + fmt(L.msiv));
ck('act-hihi-spray', '...and containment spray is DEMANDED on the same bistable',
   L.spray_demand !== null && Math.abs(L.spray_demand - L.msiv) < 3,
   'spray demanded at ' + fmt(L.spray_demand) + ', valve at ' + fmt(L.msiv));
/* THE SOURCED RESPONSE TIMES, asserted as the DELAY between demand and delivery — not as
 * absolute clock times, which would pin the casualty's own pacing instead of the system's. */
ck('resp-spray', 'spray delivers ' + DOC.spray_response_s + ' s after the demand [sourced B 3.6.6]',
   L.spray !== null && L.spray_demand !== null &&
   Math.abs((L.spray - L.spray_demand) - DOC.spray_response_s) < 1.0,
   (L.spray === null || L.spray_demand === null ? 'never' :
    (L.spray - L.spray_demand).toFixed(2) + ' s') + ' (want ' + DOC.spray_response_s + ')');
ck('resp-fan', 'the fan coolers deliver ' + DOC.crfc_response_s + ' s after the safety injection [sourced B 3.6.6]',
   L.fan !== null && L.fan_demand !== null &&
   Math.abs((L.fan - L.fan_demand) - DOC.crfc_response_s) < 1.0,
   (L.fan === null || L.fan_demand === null ? 'never' :
    (L.fan - L.fan_demand).toFixed(2) + ' s') + ' (want ' + DOC.crfc_response_s + ')');
ck('act-fan-on-si', 'the fan realign keys on the SAFETY INJECTION, not on containment pressure',
   L.fan_demand !== null && L.si !== null && Math.abs(L.fan_demand - L.si) < 0.3 &&
   L.fan_demand < L.cross_hihi,
   'realign demanded at ' + fmt(L.fan_demand) + ', SI at ' + fmt(L.si) +
   ', high-high not reached until ' + fmt(L.cross_hihi));
/* THE EFFECT, not the flag: water and joules actually left the building. */
ck('eff-spray-mass', 'spray puts REAL WATER into containment while it runs',
   L.spray_mass > 100 && Math.abs(L.spray_kgs_max - B.spray_kgs) < 0.01,
   L.spray_mass.toFixed(0) + ' kg delivered at ' + L.spray_kgs_max.toFixed(2) + ' kg/s');
ck('eff-fan-energy', 'the fan coolers remove REAL ENERGY while they run',
   L.fan_energy > 1e5 && L.fan_kW_max > 1000,
   (L.fan_energy / 1e6).toFixed(2) + ' GJ removed, peak ' + (L.fan_kW_max / 1000).toFixed(2) + ' MW');
ck('solver-sane', 'the containment solver sits on neither of its bounds through all of it',
   L.floored === false && L.clamped === false,
   'floored ' + L.floored + ', clamped ' + L.clamped);

/* ---------------------------------- band 2: THE EFFECT — a four-way peak decomposition (A/B) */
/* ⚠ THIS BAND IS THE ONE THAT CANNOT BE SATISFIED BY ONE HALF. It rides the same casualty four
 * times with the mechanism neutered in three different ways, and asserts the ORDER of the four
 * containment peaks. Break spray and legs 2 and 4 collapse onto legs 1 and 3; break the fan
 * coolers and 1 and 3 collapse onto 2 and 4. Either way an ordering check reds. */
head('2 -- THE EFFECT: containment pressure, four ways (the separately-sufficient decomposition)');
var LEGS = null;
if (NO_MUT) {
  console.log('  SKIPPED (--no-mutations) — band 2 spawns probes');
} else {
  LEGS = {};
  [['none',  { crfc_ua_kw_per_k_per_unit: 0, spray_gpm_per_pump: 0 }],
   ['fans',  { spray_gpm_per_pump: 0 }],
   ['spray', { crfc_ua_kw_per_k_per_unit: 0 }]
  ].forEach(function (leg) {
    var d = mutate([['/*__CS_PATCH__*/', csPatch(leg[1])]], 'pwr2_containment.js');
    LEGS[leg[0]] = d.error ? d : runProbe(d.dir);
  });
  LEGS.both = B;
  var P = {};
  ['none', 'fans', 'spray', 'both'].forEach(function (k) {
    P[k] = LEGS[k] && LEGS[k].loca ? psig(LEGS[k].loca.at_end) : NaN;
  });
  console.log('    at 450 s:  neither ' + P.none.toFixed(1) + ' psig | fan coolers only ' +
    P.fans.toFixed(1) + ' | spray+isolation only ' + P.spray.toFixed(1) + ' | both ' +
    P.both.toFixed(1));
  ck('eff-fans-alone', 'the FAN COOLERS ALONE lower containment pressure',
     isFinite(P.fans) && isFinite(P.none) && P.none - P.fans > 1.0,
     (P.none - P.fans).toFixed(2) + ' psi lower than with neither');
  ck('eff-spray-alone', 'SPRAY ALONE lowers containment pressure',
     isFinite(P.spray) && isFinite(P.none) && P.none - P.spray > 1.0,
     (P.none - P.spray).toFixed(2) + ' psi lower than with neither');
  ck('eff-ordered', 'and BOTH is below EITHER, which no single half can satisfy',
     P.both < P.fans - 0.5 && P.both < P.spray - 0.5 && P.fans < P.none && P.spray < P.none,
     'both ' + P.both.toFixed(2) + ' < fans ' + P.fans.toFixed(2) + ' and < spray ' +
     P.spray.toFixed(2) + ' < neither ' + P.none.toFixed(2) + ' psig');
  ck('eff-turns-over', 'with both running the ride TURNS OVER; with neither it is still climbing',
     B.loca.peak_t < B.loca.end_t - 5 && LEGS.none.loca.peak_t > LEGS.none.loca.end_t - 5,
     'mitigated peak at ' + B.loca.peak_t.toFixed(0) + ' s of ' + B.loca.end_t.toFixed(0) +
     '; unmitigated peak at ' + LEGS.none.loca.peak_t.toFixed(0) + ' s');
}

/* ------------------------------------------- band 3: the AC gate and the #200 demand/delivery */
head('3 -- STATION BLACKOUT: the demand STANDS, the delivery stops, the building does not move');
var S = B.sbo;
ck('sbo-no-delivery', 'neither system delivers with no AC',
   S.spray === null && S.fan === null,
   'spray ' + fmt(S.spray) + ', fans ' + fmt(S.fan));
ck('sbo-demand-stands', '...but the DEMAND stands — de-energize the delivery, never the demand',
   S.spray_demand !== null && S.demand_no_delivery_s > 50,
   'demanded at ' + fmt(S.spray_demand) + ', standing unsatisfied for ' +
   S.demand_no_delivery_s.toFixed(1) + ' s');
ck('sbo-msiv-still-shuts', 'the steam-line isolation still shuts — it is not a motor load',
   S.msiv !== null && S.cross_hihi !== null && S.msiv > S.cross_hihi,
   'crossed 30 psig at ' + fmt(S.cross_hihi) + ', valve shut at ' + fmt(S.msiv));
if (!NO_MUT && LEGS && LEGS.none && LEGS.none.sbo) {
  ck('sbo-unchanged', 'and the blacked-out containment ride is UNCHANGED by this whole build (#588)',
     Math.abs(S.peak - LEGS.none.sbo.peak) < 1e-9,
     'peak ' + psig(S.peak).toFixed(2) + ' psig vs ' + psig(LEGS.none.sbo.peak).toFixed(2) +
     ' with neither system built');
}

/* --------------------------------------------------------- band 4: the healthy-plant branch */
head('4 -- THE OTHER BRANCH: a healthy plant actuates nothing (bifurcation, not an absence)');
var H = B.healthy;
ck('quiet-nothing', 'nothing actuates on a plant with no casualty',
   H.si === null && H.msiv === null && H.spray_demand === null && H.spray === null &&
   H.fan_demand === null && H.fan === null && H.spray_mass === 0,
   'containment held ' + psig(H.at_end).toFixed(2) + ' psig at ' + degF(H.at_end_T).toFixed(0) + ' degF');
ck('quiet-vs-fired', '...on the same plant that fired all four on band 1',
   L.si !== null && L.msiv !== null && L.spray !== null && L.fan !== null,
   'the absence above is one branch of a measurement, not a non-event');

/* -------------------------------------------------- band 5: "cannot be blocked by the operator" */
head('5 -- WTSM 12.3: the containment SI "cannot be blocked by the operator"');
var BK = B.blockSI.rows;
var blockedOthers = Object.keys(BK).filter(function (k) {
  return k !== 'si_hi_ctmt_press' && BK[k].armed === false;
}).length;
ck('p11-others-blocked', 'P-11 disarms the other safety-injection rows',
   blockedOthers >= 2, blockedOthers + ' of ' + (Object.keys(BK).length - 1) + ' disarmed');
ck('p11-ctmt-exempt', '...and does NOT reach the containment row, which stays armed and fires',
   BK.si_hi_ctmt_press && BK.si_hi_ctmt_press.armed === true &&
   BK.si_hi_ctmt_press.asserted === true && B.blockSI.si === true &&
   B.blockSI.si_cause === 'si_hi_ctmt_press',
   'armed ' + (BK.si_hi_ctmt_press || {}).armed + ', latched ' + B.blockSI.si +
   ' by ' + B.blockSI.si_cause);

function fmt(t) { return t === null || t === undefined ? 'never' : t.toFixed(2) + ' s'; }

/* ------------------------------------------------------------------- mutation plumbing */
/* The containment constants are patched through ONE marker line so band 2's legs and the
 * mutation list below share a mechanism — a leg that patched a different line from the one the
 * mutations patch would be testing a different plant. */
function csPatch(fields) {
  return Object.keys(fields).map(function (k) {
    return 'CS.' + k + ' = ' + fields[k] + ';';
  }).join(' ');
}
function mutate(pairs, file) {
  var dir = path.join(TMP, 'm' + (MUT_N++));
  fs.mkdirSync(dir, { recursive: true });
  var srcDir = path.join(ROOT, 'engines', 'pwr2');
  fs.readdirSync(srcDir).forEach(function (f) {
    fs.copyFileSync(path.join(srcDir, f), path.join(dir, f));
  });
  var p = path.join(dir, file);
  var s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  for (var i = 0; i < pairs.length; i++) {
    if (s.indexOf(pairs[i][0]) < 0) return { error: 'BLIND — anchor not found: ' + pairs[i][0] };
    s = s.replace(pairs[i][0], pairs[i][1]);
  }
  fs.writeFileSync(p, s);
  return { dir: dir };
}

var MUTATIONS = [
  /* engine wiring — the lines a refactor deletes */
  ['the steam-line isolation line is deleted', 'pwr2_engine.js',
   'if (ptr.msli_ctmt) eng.msiv.open = false;', '',
   ['act-hihi-msiv', 'sbo-msiv-still-shuts']],
  ['the fan realign stops keying on the safety injection', 'pwr2_engine.js',
   'if (ptr.si) eng.ctmtFanDemand = true;', '',
   ['act-fan-on-si', 'eff-fan-energy', 'resp-fan', 'eff-ordered']],
  ['the spray demand never reaches the plant', 'pwr2_engine.js',
   'eng.ctmtSprayDemand = !!ptr.ctmt_spray_demand;', 'eng.ctmtSprayDemand = false;',
   ['act-hihi-spray', 'resp-spray', 'eff-spray-mass', 'eff-ordered', 'sbo-demand-stands']],
  ['the drivers stop reaching the containment layer (the DARK WIRE)', 'pwr2_engine.js',
   'ctDrv.spray_active = sprayActive;', 'ctDrv.spray_active = false;',
   ['eff-spray-mass', 'eff-ordered', 'eff-turns-over']],
  ['the AC gate is removed, so a blackout sprays anyway', 'pwr2_engine.js',
   "var sprayActive = eng.ctmtSprayDemand && eng._spray_t >= CT.CS.spray_response_s && acAvail;",
   "var sprayActive = eng.ctmtSprayDemand && eng._spray_t >= CT.CS.spray_response_s;",
   ['sbo-no-delivery', 'sbo-unchanged']],
  ['the sourced spray response time is skipped (demand = delivery)', 'pwr2_engine.js',
   'eng._spray_t >= CT.CS.spray_response_s', 'true',
   ['resp-spray']],
  /* the containment physics */
  ['spray adds its mass but not its COLDNESS (the energy term is dropped)', 'pwr2_containment.js',
   'ct.U_total_kJ += dms * sprayEnthalpy();', 'ct.U_total_kJ += dms * W.h_l_sat(ct.T_c);',
   ['eff-ordered', 'eff-turns-over']],
  ['the fan removal is booked and never subtracted', 'pwr2_containment.js',
   'ct.U_total_kJ -= fan_kW * dt;', '',
   ['eff-ordered']],
  ['the fan term stops self-limiting at the sourced pre-accident condition', 'pwr2_containment.js',
   'var dT = T_c - f2c(CS.fan_sink_temp_f);', 'var dT = T_c - f2c(30.0);',
   ['fan-self-limit']],
  /* the protection rows */
  ['the sourced 3.5 psig safety-injection backup moves out of reach', 'pwr2_protection.js',
   'si_psig:   3.5,', 'si_psig:   990.0,',
   ['src-setpoints', 'act-si-backup', 'p11-ctmt-exempt']],
  ['the sourced 30 psig high-high moves out of reach', 'pwr2_protection.js',
   'hihi_psig: 30.0,', 'hihi_psig: 990.0,',
   ['src-setpoints', 'act-hihi-msiv', 'act-hihi-spray', 'eff-ordered']],
  ['P-11 is allowed to block the containment safety injection', 'pwr2_protection.js',
   'read: \'containment_pressure_mpa\', delay: DELAY.si_hi_ctmt_press, unblockable: true },',
   'read: \'containment_pressure_mpa\', delay: DELAY.si_hi_ctmt_press },',
   ['p11-ctmt-exempt']],
  ['the two rows no longer share ONE bistable (the high-high gets its own latch)',
   'pwr2_protection.js', "if (anyCse && !pr.cse && !pr.cse_rearm_block) { pr.cse = true;",
   "if (false && anyCse && !pr.cse && !pr.cse_rearm_block) { pr.cse = true;",
   ['act-hihi-msiv', 'act-hihi-spray', 'eff-ordered']]
];

var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;
var NAME = path.basename(__filename, '.js');

if (NO_MUT) {
  console.log('\n  ' + NAME + ': ' + pass + ' passed, ' + fail + ' failed  (' + rec.length +
              ' checks)   MUTATIONS SKIPPED');
  process.exit(fail ? 1 : 0);
}
if (fail > 0) {
  console.log('\n  ' + NAME + ': ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
  console.log('  MUTATION SELF-TEST SKIPPED -- ' + fail + ' check(s) failed in the CLEAN run.');
  process.exit(1);
}

head('MUTATION SELF-TEST — break the mechanism, the named checks must go RED');
var caught = 0, blind = 0;
MUTATIONS.forEach(function (m) {
  var d = mutate([[m[2], m[3]]], m[1]);
  if (d.error) { console.log('  BLIND  ' + m[0] + '  -- ' + d.error); blind++; return; }
  var r = runProbe(d.dir);
  if (r.error) { console.log('  caught (THREW) ' + m[0]); caught++; return; }
  /* re-grade ONLY the checks this mutation names, on the mutated probe */
  var reds = regrade(r, m[4]);
  if (reds.length) { console.log('  caught ' + m[0] + '  -- red: ' + reds.join(', ')); caught++; }
  else { console.log('  BLIND  ' + m[0] + '  -- nothing went red'); blind++; }
});
console.log('\n  ' + NAME + ': ' + pass + ' passed, ' + fail + ' failed  (' + rec.length +
            ' checks)   mutations ' + caught + '/' + MUTATIONS.length +
            (blind ? '  BLIND ' + blind : '  no blind spots'));
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* temp */ }
process.exit(fail || blind ? 1 : 0);

/* Re-evaluate a named subset of the checks against a mutated probe. Deliberately a SECOND
 * implementation of the predicates rather than a replay of `rec`: a mutation self-test that
 * re-ran the same closure would be proving the closure runs, not that the check discriminates. */
function regrade(r, ids) {
  var out = [], L2 = r.loca, S2 = r.sbo;
  function no(id, cond) { if (ids.indexOf(id) >= 0 && !cond) out.push(id); }
  no('src-setpoints', r.CTMT_ESF.si_psig === DOC.si_psig && r.CTMT_ESF.hihi_psig === DOC.hihi_psig);
  no('fan-self-limit', r.fan_kW_at_sink === 0 && r.fan_kW_below_sink === 0 && r.fan_kW_at_140 > 1000);
  no('act-si-backup', L2.cross_si !== null && L2.si !== null && L2.si <= L2.cross_si + 1.5);
  no('act-hihi-msiv', L2.cross_hihi !== null && L2.msiv !== null && L2.msiv > L2.cross_hihi &&
                      L2.msiv < L2.cross_hihi + 8);
  no('act-hihi-spray', L2.spray_demand !== null && L2.msiv !== null &&
                       Math.abs(L2.spray_demand - L2.msiv) < 3);
  no('resp-spray', L2.spray !== null && L2.spray_demand !== null &&
                   Math.abs((L2.spray - L2.spray_demand) - DOC.spray_response_s) < 1.0);
  no('resp-fan', L2.fan !== null && L2.fan_demand !== null &&
                 Math.abs((L2.fan - L2.fan_demand) - DOC.crfc_response_s) < 1.0);
  no('act-fan-on-si', L2.fan_demand !== null && L2.si !== null &&
                      Math.abs(L2.fan_demand - L2.si) < 0.3 && L2.fan_demand < L2.cross_hihi);
  no('eff-spray-mass', L2.spray_mass > 100);
  no('eff-fan-energy', L2.fan_energy > 1e5 && L2.fan_kW_max > 1000);
  no('sbo-no-delivery', S2.spray === null && S2.fan === null);
  no('sbo-demand-stands', S2.spray_demand !== null && S2.demand_no_delivery_s > 50);
  no('sbo-msiv-still-shuts', S2.msiv !== null && S2.cross_hihi !== null && S2.msiv > S2.cross_hihi);
  no('sbo-unchanged', LEGS && LEGS.none && LEGS.none.sbo &&
                      Math.abs(S2.peak - LEGS.none.sbo.peak) < 1e-9);
  no('p11-ctmt-exempt', r.blockSI.rows.si_hi_ctmt_press &&
                        r.blockSI.rows.si_hi_ctmt_press.armed === true &&
                        r.blockSI.si === true && r.blockSI.si_cause === 'si_hi_ctmt_press');
  /* THE BAND-2 ORDERING, re-asked of the mutated plant against the CLEAN legs. This is the
   * check no single half can satisfy: break spray and the mutated ride collapses onto the
   * fans-only leg, break the fans and it collapses onto the spray-only leg — either way one
   * of the two inequalities fails. */
  if (LEGS && LEGS.none && LEGS.fans && LEGS.spray) {
    var pf = psig(LEGS.fans.loca.at_end), ps = psig(LEGS.spray.loca.at_end),
        pb = psig(L2.at_end);
    no('eff-ordered', pb < pf - 0.5 && pb < ps - 0.5);
    no('eff-turns-over', L2.peak_t < L2.end_t - 5);
  }
  return out;
}
