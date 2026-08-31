/* run_pwr2_instruments.js — the instrument layer's gate (2026-08-20, owner ruling "Do option 1").
 *
 * WHAT IT PINS: the two SOURCED time constants (RTD 2.0 s, hot-leg filter 3.5 s — Table 15.0-6
 * footnote b) by measured step response, not by reading the constant back; the noise's
 * stationary sigma and band-limitedness; per-channel PRNG INDEPENDENCE (the design departure
 * from pwr_instruments.js's shared stream — adding/starving one channel must not move another
 * channel's noise); priming (a fresh plant does not climb from zero); all four failure modes,
 * including that a restore heals to NOW and not to the stale held value; and determinism.
 *
 * Run: node test/run_pwr2_instruments.js
 */
'use strict';
var path = require('path');
var fs = require('fs');
var SRC = path.join(__dirname, '..', 'engines', 'pwr2');

function loadIns(insSource) {
  /* pwr2_water + pwr2_vtable stay CACHED across replays (#513): never this gate's
   * mutation target, and a re-execute discards the vtable's lazily-built ~0.5 s GRID
   * per replay — see run_pwr2_engine.js's loadAll for the full note. The plain
   * require is a no-op once loaded, which is the point. */
  ['pwr2_water', 'pwr2_vtable'].forEach(function (f) {
    require(path.join(SRC, f + '.js'));
  });
  if (insSource === undefined) {
    delete require.cache[require.resolve(path.join(SRC, 'pwr2_instruments.js'))];
    require(path.join(SRC, 'pwr2_instruments.js'));
  } else {
    (0, eval)(insSource);
  }
  return globalThis.RD.pwr2.instruments;
}

var DT = 0.02;

function runSuite(IN, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(62) +
      'got ' + got.toFixed(4) + ' want ' + want.toFixed(4) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }

  /* a synthetic true_state: every channel's src present, controllable */
  function baseTs() {
    return { power_pct: 100, startup_rate_dpm: 0, tavg_c: 300, thot_c: 315, tcold_c: 285,
             pressure_mpa: 15.41, pzr_level_pct: 61.5, pump_flow_pct: 100, boron_ppm: 600,
             porv_tailpipe_temp_c: 50, steam_pressure_mpa: 5.7, steam_flow_normalized: 1.0,
             sg_level_pct: 65.0,
             mwe_output: 100, containment_pressure_mpa: 0.101 };
  }
  function quietIns() { return IN.createInstruments({ noise_scale: 0 }); }
  function run(ins, ts, secs) {
    for (var i = 0; i < secs / DT; i++) IN.stepInstruments(ins, DT, ts);
    return ins.reading;
  }

  /* ---- 0. THE ROSTER: the channel the protection layer now depends on ------------------- */
  head('ROSTER  [the AFAS/lo-lo trip reads sg_level — a dropped channel must not go quiet]');
  ckT('the sg_level channel exists, sourced from the narrow-range sg_level_pct',
      IN.CHANNELS.some(function (c) { return c.id === 'sg_level' && c.src === 'sg_level_pct'; }),
      'pwr2_protection\'s lo-lo function and both AFW starts read this channel (2026-08-20)');
  /* #540: pwr2_engine's element-2 wire reads `sg_steam_flow` and FALLS BACK SILENTLY when it
   * is missing — which is what it did for six days, onto the turbine-only channel the wire
   * exists to stop reading. A consumer that degrades quietly needs its channel asserted BY
   * ID here, because no engine gate can tell the fallback from the real thing. The SRC half
   * is load-bearing too: `steam_flow` would satisfy an id-only check and reintroduce the
   * defect exactly. */
  ckT('the sg_steam_flow channel exists, sourced from TOTAL steam out (not the turbine draw)',
      IN.CHANNELS.some(function (c) { return c.id === 'sg_steam_flow' && c.src === 'steam_out_total'; }) &&
      IN.CHANNELS.some(function (c) { return c.id === 'steam_flow' && c.src === 'steam_flow_normalized'; }),
      'the three-element controller\'s element 2 reads this; post-trip the dumps carry the ' +
      'steam and steam_flow reads ~0 (#540)');

  /* ---- 1. PRIMING + STEP RESPONSE: the sourced taus, MEASURED --------------------------- */
  head('STEP RESPONSE  [the sourced 2.0 s RTD and 3.5 s hot-leg filter, measured not retyped]');
  var ins = quietIns(), ts = baseTs();
  IN.stepInstruments(ins, DT, ts);
  ckT('a fresh plant reads TRUTH on its first step — no climb from zero',
      Math.abs(ins.reading.tavg - 300) < 1e-9 && Math.abs(ins.reading.thot - 315) < 1e-9,
      'tavg ' + ins.reading.tavg + ', thot ' + ins.reading.thot);
  ts.tavg_c = 310; ts.tcold_c = 295;             /* +10 degC step on both RTD channels */
  var t632 = null, tc632 = null;
  for (var i = 1; i <= 10 / DT; i++) {
    IN.stepInstruments(ins, DT, ts);
    if (t632 === null && ins.reading.tavg >= 300 + 10 * 0.632) t632 = i * DT;
    if (tc632 === null && ins.reading.tcold >= 285 + 10 * 0.632) tc632 = i * DT;
  }
  ck('tavg reaches 63.2 % of a step in tau = 2.0 s (RTD, 15.0-6 fn b)', t632, 2.0, 0.1, 's');
  ck('tcold likewise — the same sourced RTD', tc632, 2.0, 0.1, 's');
  var ins2 = quietIns(), ts2 = baseTs();
  IN.stepInstruments(ins2, DT, ts2);
  ts2.thot_c = 325;                              /* +10 degC step on the hot leg */
  var th632 = null;
  for (i = 1; i <= 20 / DT; i++) {
    IN.stepInstruments(ins2, DT, ts2);
    if (th632 === null && ins2.reading.thot >= 315 + 10 * 0.632) th632 = i * DT;
  }
  /* two cascaded first-order lags (2.0 then 3.5 s): 63.2 % lands at ~6.5 s — measured on the
   * shipped build, and the point of the check is the CASCADE exists (a single 2.0 s lag reads
   * 2.0; a single 3.5 s lag reads 3.5; only the pair lands here) */
  ckT('thot responds as the CASCADE — 63.2 % in ~6.5 s, not either single lag',
      th632 > 5.0 && th632 < 8.0, th632 + ' s (single-lag would read 2.0 or 3.5)');

  /* ---- 2. NOISE: stationary, band-limited, scalable, deterministic ----------------------- */
  head('NOISE  [band-limited AR(1), sigma as configured, per-channel deterministic]');
  var insN = IN.createInstruments({}), tsN = baseTs();
  var xs = [], n = Math.round(400 / DT);
  for (i = 0; i < n; i++) { IN.stepInstruments(insN, DT, tsN); if (i > 500) xs.push(insN.reading.tavg); }
  var mean = xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
  var sig = Math.sqrt(xs.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / xs.length);
  ck('tavg noise sigma matches the channel spec (0.15 degC)', sig, 0.15, 0.05, 'degC');
  /* ⚠ RE-EXPRESSED at #590 (2026-08-29), and it is a STRENGTHENING rather than a repair. This
   * asserted the autocorrelation at a hard-coded 8 s — the old GLOBAL NOISE_TAU_S retyped into
   * the fixture, so it pinned the constant rather than the claim. The correlation is now per
   * channel (tau_s x NOISE_TAU_FRAC), `tavg` sits at 0.5 s, and the old form read 0.041 at 8 s
   * and failed on a correct model.
   *
   * The CLAIM was always "band-limited, not white", and it is still true and still worth
   * asserting. It is now asserted at the channel's OWN correlation time, read from the module
   * via `IN.noiseTau` rather than retyped — so a moved correlation moves the check with it —
   * and PAIRED with a far-lag reading, which is the half that makes it discriminating: white
   * noise fails the near lag, and noise correlated far too SLOWLY (the #590 defect) passes the
   * near one and fails the far one. */
  var tauN = IN.noiseTau(IN.CHANNELS.filter(function (c) { return c.id === 'tavg'; })[0]);
  function autocorr(lagS) {
    var k = Math.round(lagS / DT), num = 0, den = 0, j;
    for (j = 0; j < xs.length - k; j++) num += (xs[j] - mean) * (xs[j + k] - mean);
    for (j = 0; j < xs.length; j++) den += (xs[j] - mean) * (xs[j] - mean);
    return num / den * (xs.length / (xs.length - k));
  }
  ck('...and it is BAND-LIMITED: autocorrelation at the CHANNEL OWN correlation time is ~1/e',
     autocorr(tauN), Math.exp(-1), 0.15, '(tau ' + tauN.toFixed(2) + ' s)');
  ckT('...and DECORRELATED well beyond it — noise that is still correlated 16x out is drift, ' +
      'which is what the feed controller was chasing (#590)',
      Math.abs(autocorr(16 * tauN)) < 0.15,
      'r(' + (16 * tauN).toFixed(1) + ' s) = ' + autocorr(16 * tauN).toFixed(4) +
      '; the shipped global 8 s read 0.37 here');
  var insZ = quietIns();
  run(insZ, baseTs(), 30);
  ckT('noise_scale 0 reads EXACT truth once settled', Math.abs(insZ.reading.tavg - 300) < 1e-9, '');
  var insD1 = IN.createInstruments({}), insD2 = IN.createInstruments({});
  run(insD1, baseTs(), 10); run(insD2, baseTs(), 10);
  ckT('two identical runs read identically — the streams are seeded, not wall-clock',
      insD1.reading.tavg === insD2.reading.tavg &&
      insD1.reading.primary_pressure === insD2.reading.primary_pressure, '');

  /* ---- 3. INDEPENDENCE: the pwr_instruments append-order trap, engineered away ----------- */
  head('INDEPENDENCE  [starving one channel must not move another channel\'s noise]');
  var insA = IN.createInstruments({}), insB = IN.createInstruments({});
  var tsFull = baseTs(), tsStarved = baseTs();
  delete tsStarved.containment_pressure_mpa;     /* one channel never gets a truth to read */
  var seqA = [], seqB = [];
  for (i = 0; i < 5 / DT; i++) {
    IN.stepInstruments(insA, DT, tsFull); seqA.push(insA.reading.tavg);
    IN.stepInstruments(insB, DT, tsStarved); seqB.push(insB.reading.tavg);
  }
  ckT('tavg\'s noise sequence is BIT-IDENTICAL with a sibling channel starved',
      seqA.every(function (v, k) { return v === seqB[k]; }),
      'the shared-stream design this replaces shifts every stream after the starved one');
  /* and two channels' streams are actually DIFFERENT streams */
  var za = [], zb = [];
  var insC = IN.createInstruments({});
  for (i = 0; i < 20 / DT; i++) {
    IN.stepInstruments(insC, DT, tsFull);
    za.push(insC.reading.tavg - 300); zb.push(insC.reading.tcold - 285);
  }
  var ma = za.reduce(function (a, b) { return a + b; }) / za.length;
  var mb = zb.reduce(function (a, b) { return a + b; }) / zb.length;
  var cov = 0, va = 0, vb = 0;
  for (i = 0; i < za.length; i++) {
    cov += (za[i] - ma) * (zb[i] - mb); va += (za[i] - ma) * (za[i] - ma); vb += (zb[i] - mb) * (zb[i] - mb);
  }
  ckT('two channels draw from DIFFERENT streams (|corr| < 0.5), not one stream shared',
      Math.abs(cov / Math.sqrt(va * vb)) < 0.5,
      'corr ' + (cov / Math.sqrt(va * vb)).toFixed(3));

  /* ---- 4. FAILURES ----------------------------------------------------------------------- */
  head('FAILURES  [stuck lies still, rails rail, noisy shouts, restore heals to NOW]');
  var insF = quietIns(), tsF = baseTs();
  run(insF, tsF, 10);
  IN.fail(insF, 'tavg', 'stuck');
  tsF.tavg_c = 320;
  run(insF, tsF, 30);
  ckT('STUCK holds the pre-failure reading while truth walks 20 degC away',
      Math.abs(insF.reading.tavg - 300) < 1e-6, 'reads ' + insF.reading.tavg.toFixed(2));
  IN.restore(insF, 'tavg');
  IN.stepInstruments(insF, DT, tsF);
  ckT('...and RESTORE heals toward NOW (within the lag), not to the stale buffer',
      insF.reading.tavg > 318, 'first post-restore reading ' + insF.reading.tavg.toFixed(2) +
      ' — the lag state stayed current through the failure');
  IN.fail(insF, 'primary_pressure', 'low');
  IN.stepInstruments(insF, DT, tsF);
  var railLo = insF.reading.primary_pressure;
  IN.fail(insF, 'primary_pressure', 'high');
  IN.stepInstruments(insF, DT, tsF);
  ckT('LOW and HIGH rail to the channel range ends', railLo === 0 &&
      insF.reading.primary_pressure === 20, railLo + ' / ' + insF.reading.primary_pressure);
  IN.restore(insF, null);
  var insY = IN.createInstruments({});
  IN.fail(insY, 'tavg', 'noisy');
  var ys = [];
  for (i = 0; i < 400 / DT; i++) { IN.stepInstruments(insY, DT, baseTs()); if (i > 500) ys.push(insY.reading.tavg); }
  var my = ys.reduce(function (a, b) { return a + b; }) / ys.length;
  var sy = Math.sqrt(ys.reduce(function (a, b) { return a + (b - my) * (b - my); }, 0) / ys.length);
  ckT('NOISY inflates sigma by ~NOISY_MULT (a failing transmitter, still roughly right)',
      sy > 0.15 * IN.NOISY_MULT * 0.6 && sy < 0.15 * IN.NOISY_MULT * 1.5,
      'sigma ' + sy.toFixed(3) + ' vs healthy 0.15');
  /* DRIFT and DEAD (#507 wave 6) — the current engine's other two modes, now honest here */
  var insD = quietIns(), tsD = baseTs();
  run(insD, tsD, 10);
  IN.fail(insD, 'tavg', 'drift');            /* default rate: the adopted 0.5 units/s */
  run(insD, tsD, 20);
  ckT('DRIFT walks the reading off truth at the adopted default 0.5/s (sim time, HR6)',
      Math.abs(insD.reading.tavg - (300 + 0.5 * 20)) < 0.5,
      'reads ' + insD.reading.tavg.toFixed(2) + ' after 20 s over a 300.00 truth');
  IN.restore(insD, 'tavg');
  IN.fail(insD, 'tavg', 'drift', -1.5);      /* explicit rate, signed */
  run(insD, tsD, 10);
  ckT('...and an explicit SIGNED rate is honored',
      Math.abs(insD.reading.tavg - (300 - 1.5 * 10)) < 0.5,
      'reads ' + insD.reading.tavg.toFixed(2) + ' at -1.5/s for 10 s');
  IN.fail(insD, 'primary_pressure', 'dead');
  IN.stepInstruments(insD, DT, tsD);
  ckT('DEAD bottoms out at range[0] — the current engine\'s semantic',
      insD.reading.primary_pressure === 0, '');
  var threw = false;
  try { IN.fail(insF, 'tavg', 'wobbly'); } catch (e) { threw = true; }
  var threw2 = false;
  try { IN.fail(insF, 'no_such_channel', 'stuck'); } catch (e) { threw2 = true; }
  ckT('a misspelled mode or channel THROWS — a failure that does nothing reads like survival',
      threw && threw2, '');

  /* ---- 5. THE MISSING-SOURCE GUARD ------------------------------------------------------- */
  head('MISSING SOURCE  [a wiring gap holds the last reading; it never emits NaN]');
  var insM = quietIns(), tsM = baseTs();
  run(insM, tsM, 5);
  var before = insM.reading.boron;
  delete tsM.boron_ppm;
  run(insM, tsM, 5);
  ckT('a vanished true field HOLDS the last reading, and nothing reads NaN',
      insM.reading.boron === before && isFinite(insM.reading.tavg), '');

  /* #555 — a RESTORED null is not a reading. pwr2_shell's save round-trips through JSON,
   * which writes a non-finite reading out as `null`, and `isFinite(null)` is TRUE — so a
   * channel with no true driver came back as a hard ZERO that every guard in the tree
   * accepted (the Mode 4 feed regulating valve was driven shut by it). The save now names
   * its non-finite ids, but this layer must not read a stray null as a number either.
   * Two arms, because "it holds a value" and "the value is not zero" are different claims. */
  var insN = quietIns(), tsN = baseTs();
  run(insN, tsN, 5);
  delete tsN.boron_ppm;                       /* the channel loses its driver, as at Mode 4 */
  insN.reading.boron = null;                  /* exactly what a pre-fix save installed */
  run(insN, tsN, 1);
  ckT('a restored NULL reading is treated as no-reading, not as zero',
      typeof insN.reading.boron === 'number' && isNaN(insN.reading.boron),
      'reading is ' + insN.reading.boron + ' (a 0 here is the #555 defect: isFinite(null) is true)');
}

console.log('\nPWR2 -- THE INSTRUMENT LAYER: what the plant SAYS (HR1), gated');
var rec = [];
runSuite(loadIns(), rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var INSRC = fs.readFileSync(path.join(SRC, 'pwr2_instruments.js'), 'utf8').replace(/\r\n/g, '\n');
var MUTATIONS = [
  ['the sg_level channel is DELETED (the AFAS/lo-lo trip loses its gauge silently)',
   "    { id: 'sg_level',         src: 'sg_level_pct',             tau_s: 1.0,  sigma: 0.3,  range: [0, 100] },",
   ''],
  ['the sg_steam_flow channel is DELETED (element 2 silently falls back to the turbine draw — #540)',
   "    { id: 'sg_steam_flow',    src: 'steam_out_total',          tau_s: 1.0,  sigma: 0.01, range: [0, 2.5] },",
   ''],
  ['sg_steam_flow is repointed at the TURBINE channel (the #540 defect, wearing the right id)',
   "    { id: 'sg_steam_flow',    src: 'steam_out_total',",
   "    { id: 'sg_steam_flow',    src: 'steam_flow_normalized',"],
  ['the lag is deleted (every reading is instant truth)',
   '      var a1 = dt / Math.max(c.tau_s, dt);\n      ch.lag1 += a1 * (truth - ch.lag1);',
   '      ch.lag1 = truth;'],
  ['the hot-leg cascade is dropped (thot is a single 2.0 s lag)',
   '      if (c.tau2_s) {',
   '      if (false) {'],
  ['priming is removed (a fresh plant climbs from zero)',
   "      if (ch.lag1 === null) { ch.lag1 = truth; ch.lag2 = truth; }",
   '      if (ch.lag1 === null) { ch.lag1 = 0; ch.lag2 = 0; }'],
  /* ⚠ ANCHOR RE-POINTED at #590, when the global NOISE_TAU_S became a per-channel noiseTau(). */
  ['the noise is WHITE (the band limit dropped)',
   '        var rho = Math.exp(-dt / noiseTau(c));',
   '        var rho = 0;'],
  /* #590: the correlation goes back to the global 8 s — noise correlated 16x slower than the
   * sensing lag, which the feed controller cannot tell from a real disturbance and integrates.
   * The near-lag check still passes on this; the FAR-lag check is what catches it. */
  ['the noise correlation reverts to a flat 8 s (drift the controller chases)',
   '  var NOISE_TAU_FRAC = 0.25;',
   '  var NOISE_TAU_FRAC = 8.0;'],
  ['every channel shares ONE seed (the streams collapse into each other)',
   /* repointed after the B2 PRNG-state rework — and the ORIGINAL anchor miss shipped in the
    * B2 commit itself, hidden for a day by tail-piping the runner output (the self-test line
    * scrolled past while the checks tally read clean). Read the whole verdict. */
   '        rngState: fnv1a(c.id) | 0',
   '        rngState: 12345'],
  /* ANCHORED ON THE TWO CODE LINES ONLY, not the whole block. The first form quoted the
   * guard's comment as well, so adding a line to that comment (#555, 2026-08-27) sent this
   * mutation to ANCHOR MISS — a green 20/20 with a blind spot. An anchor that includes prose
   * rots on the next prose edit; this one keeps the block and its braces and only replaces
   * the body, which is the same injected defect. */
  ['a restored null is read as a number again (#555 — isFinite(null) is true, so it is a 0)',
   '=== undefined || ins.reading[c.id] === null)',
   '=== undefined)'],
  ['a starved channel still draws from its stream via a fallback truth of 0',
   "        if (ins.reading[c.id] === undefined || ins.reading[c.id] === null) ins.reading[c.id] = NaN;\n        return;",
   "        truth = 0;"],
  ['STUCK is ignored (the failed channel keeps reporting)',
   "        if (f.mode === 'stuck') value = f.held;",
   ''],
  ['DRIFT never accumulates (a drifting channel reads healthy for ever) -- #507 wave 6',
   "        else if (f.mode === 'drift') { f.offset += f.rate * dt; value = sensed + f.offset; }",
   "        else if (f.mode === 'drift') { value = sensed; }"],
  ['DEAD rails HIGH instead of bottoming out -- #507 wave 6',
   "        else if (f.mode === 'dead') value = c.range[0];",
   "        else if (f.mode === 'dead') value = c.range[1];"],
  ['restore heals to the STALE buffer (the lag state froze with the failure)',
   '      if (ch.lag1 === null) { ch.lag1 = truth; ch.lag2 = truth; }\n      var a1',
   "      if (ch.lag1 === null) { ch.lag1 = truth; ch.lag2 = truth; }\n      if (ins.failure[c.id] && ins.failure[c.id].mode === 'stuck') { ins.reading[c.id] = ins.failure[c.id].held; return; }\n      var a1"]
];

console.log('\ninjection self-test (' + MUTATIONS.length + ' mutations):');
var blind = 0;
MUTATIONS.forEach(function (m) {
  var mutated = INSRC.replace(m[1], m[2]);
  if (mutated === INSRC) { console.log('  ANCHOR MISS ' + m[0]); blind++; return; }
  var rec2 = [];
  try { runSuite(loadIns(mutated), rec2, true); } catch (e) { /* a crash counts as caught */ }
  var f2 = rec2.length ? rec2.filter(function (r) { return !r.ok; }).length : 1;
  if (f2 === 0) { console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); blind++; }
  else console.log('  caught    ' + m[0].padEnd(66) + f2 + ' red');
});
loadIns();

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_instruments: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit(fail > 0 || blind > 0 ? 1 : 0);
