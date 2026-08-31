/* run_pwr2_endurance.js — LONG RIDES: the acceptance windows the #510 review proved missing.
 *
 * THE CLASS THIS RUNNER EXISTS FOR (owner directive, 2026-08-23: "Let's fix your acceptance
 * windows first."): every #510 high finding shipped under a green gate whose ride ended
 * before the failure began — the Mode 4 "HOLDS" check sampled the first 6 % of a monotone
 * 75-minute transient, the ATWS check rode 10 s of a divergence that starts at ~110 s, and
 * the settled-IC checks asserted POSITION bands where the honest claim is EQUILIBRIUM. This
 * runner rides past the horizons and asserts DERIVATIVES:
 *
 *   settled  =  the state's rates of change are ~zero over the ride's LAST window,
 *               not that a sampled value sits inside a band fitted to the first minutes.
 *
 * STRICT EXPECTED-FAILS (the run_meltdown convention, symmetric): every #510 defect this
 * runner can see is listed in XFAIL with its finding id. A check in that set that FAILS
 * counts as expected (the runner stays green); one that PASSES reds the runner with
 * "UNEXPECTED PASS — the fix landed, promote the xfail". So the fix batch cannot land
 * without acknowledging each flip, and the checks themselves are BORN FAILING — measured
 * red by the #510 review before they were written, which is stronger proof they can fail
 * than any injection self-test. (No mutation self-test here: each mutation would re-ride
 * hours of sim, and the live reds already prove the sensing.)
 *
 * Run: node test/run_pwr2_endurance.js          (~11 min alone; parallel-safe in run_all)
 */
'use strict';
var path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_sources',
 'pwr2_kinetics', 'pwr2_fuel', 'pwr2_reactor', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief',
 'pwr2_dumpctl', 'pwr2_condenser', 'pwr2_feedwater', 'pwr2_afw', 'pwr2_cvcs', 'pwr2_eccs',
 'pwr2_rhr', 'pwr2_pressurizer', 'pwr2_break', 'pwr2_containment', 'pwr2_damage',
 'pwr2_protection', 'pwr2_instruments', 'pwr2_true_state', 'pwr2_engine'
].forEach(function (f) { require(path.join(E, f + '.js')); });

var EN = globalThis.RD.pwr2.engine;
var DT = 0.02;

/* ---- THE EXPECTED-FAIL SET — one entry per #510 finding this runner sees ----------------- */
var XFAIL = {
  /* H-1 + H-2 PROMOTED (#510 batch 1, 2026-08-23): the dry-SG wet-fraction collapse +
   * outflow-limited ledger, the RHR low-pressure letdown path, the signed sgDuty and the
   * surge-line energy conservation — the four checks now run as ordinary PASSes above.
   * H-4/H-5/H-6/M-6 PROMOTED (#510 batch 2, 2026-08-24): the electrical completion sweep —
   * aux spray and the RHR pumps carry the vital-bus wire, the shed latch edges on each
   * actuating signal independently, and a dead condenser trips the turbine (sourced,
   * Ginna UFSAR ch.10 §10.1.3.1).
   * H-7 PROMOTED (#510 batch 3, 2026-08-24): the torque class rises toward the breakdown
   * class near synchronous speed — a cold start pulls in at 24.1 s instead of stalling.
   * EVERY #510 ENDURANCE DEFECT IS NOW FIXED — the map stays for the next born-failing
   * entry; strictness is unchanged (an entry that PASSES still reds until promoted). */
};

var rec = [], nPass = 0, nXfail = 0, nFail = 0, nUnexpected = 0;
function ck(id, name, cond, note) {
  var ok = !!cond, xf = XFAIL[id];
  var verdict;
  if (ok && !xf) { verdict = 'PASS'; nPass++; }
  else if (!ok && xf) { verdict = 'XFAIL'; nXfail++; }
  else if (!ok && !xf) { verdict = 'FAIL'; nFail++; }
  else { verdict = 'UNEXPECTED PASS'; nUnexpected++; }
  rec.push({ id: id, verdict: verdict });
  console.log('  ' + (verdict === 'PASS' ? 'PASS ' :
                      verdict === 'XFAIL' ? 'XFAIL' :
                      verdict === 'FAIL' ? 'FAIL ' : 'UNEXPECTED PASS') +
    '  ' + name + (note ? '  -- ' + note : '') +
    (verdict === 'XFAIL' ? '\n         [expected: ' + xf + ']' : '') +
    (verdict === 'UNEXPECTED PASS'
      ? '\n         [the fix for this landed — PROMOTE the xfail: ' + xf + ']' : ''));
}
function head(s) { console.log('\n' + s); }

/* ride(eng, secs, sample) — steps the plant, sampling ts every `every` sim-seconds into a
 * trace the equilibrium law reads. Returns the last ts. */
function ride(eng, secs, trace, every) {
  var ts = null, next = 0;
  for (var t = 0; t < secs; t += DT) {
    ts = EN.step(eng, DT);
    if (trace && t >= next) {
      trace.push({ t: t, tavg: ts.tavg_c, P: ts.pressure_mpa, lvl: ts.pzr_level_pct,
                   pwr: ts.power_pct, M: eng.sys.M_total });
      next += (every || 30);
    }
  }
  return ts;
}

/* THE EQUILIBRIUM LAW: rates over the ride's LAST window plus POSITION against the boot
 * point. THE BANDS' PROVENANCE (2-hour HFP probe, 2026-08-23, five 10-min windows):
 * dTavg −1.0/+2.3/+0.3/−0.6/+0.5 degF/hr, dP −9.5/+17.1/−6.9/−1.2/+9.6 psi/hr, dLvl
 * −2.0/+0.9/−3.9/−1.2/+1.7 %/hr — the rates OSCILLATE IN SIGN about zero (a bounded
 * wander, net ~0 at 2 h: 2237.8 psia / 99.9 %), so the rate bands sit at that measured
 * wander floor, NOT fitted to a failure (the first draft's 2 %/hr level band was tighter
 * than the plant's own noise and reddened on wander phase). What the rate band then
 * excludes — a sustained drift smaller than the wander — is caught by the POSITION
 * clauses instead: a monotone walk cannot stay inside +/-10 level points, +/-60 psi and
 * +/-2.5 degC of the boot point for a 30-minute ride. H-2's 54 %/hr fill reds on the
 * rate band alone in any phase. */
/* RATE = the LEAST-SQUARES slope over every sample in the window, not the endpoint pair
 * (#510 batch 1). The endpoint estimator read a LIMIT CYCLE's phase as drift: the fixed
 * Mode 4 preset holds a flat ~361 psia mean under ~10-min heater cycling of +/-5 psi, and
 * two endpoints caught high-then-low read it as -39 psi/hr. A slope over all 30 samples
 * measures the same law with the cycle averaged out — and every HEAD defect stays red on
 * it: the 54 %/hr fill is monotone (slope = endpoint rate), and the pegged-at-the-wall
 * endings that read rate ~0 were always caught by the POSITION clauses, unchanged here. */
function lsSlopePerHr(w, get) {
  var n = w.length, st = 0, sy = 0, stt = 0, sty = 0;
  for (var i = 0; i < n; i++) {
    var t = w[i].t / 3600, y = get(w[i]);
    st += t; sy += y; stt += t * t; sty += t * y;
  }
  var d = n * stt - st * st;
  return d === 0 ? 0 : (n * sty - st * sy) / d;
}
function ratesPerHr(trace, windowS) {
  var tEnd = trace[trace.length - 1].t, t0 = tEnd - windowS;
  var w = trace.filter(function (s) { return s.t >= t0; });
  if (w.length < 2) w = trace.slice(-2);
  return { dTavg: lsSlopePerHr(w, function (s) { return s.tavg; }),           /* degC/hr */
           dP_psi: lsSlopePerHr(w, function (s) { return s.P; }) * 145.038,   /* psi/hr  */
           dLvl: lsSlopePerHr(w, function (s) { return s.lvl; }) };           /* %/hr    */
}
function settled(trace, windowS) {
  var r = ratesPerHr(trace, windowS);
  var boot = trace.filter(function (s) { return s.t >= 55 && s.t <= 95; })[0] || trace[0];
  var end = trace[trace.length - 1];
  return {
    r: r,
    rateOk: Math.abs(r.dTavg) < 3.0 && Math.abs(r.dP_psi) < 30 && Math.abs(r.dLvl) < 6.0,
    posOk: Math.abs(end.tavg - boot.tavg) < 2.5 &&
           Math.abs(end.P - boot.P) * 145.038 < 60 &&
           Math.abs(end.lvl - boot.lvl) < 10,
    note: 'dTavg ' + (r.dTavg * 9 / 5).toFixed(2) + ' degF/hr, dP ' + r.dP_psi.toFixed(1) +
          ' psi/hr, dLvl ' + r.dLvl.toFixed(2) + ' %/hr; pos drift ' +
          ((end.tavg - boot.tavg) * 9 / 5).toFixed(1) + ' degF / ' +
          ((end.P - boot.P) * 145.038).toFixed(0) + ' psi / ' +
          (end.lvl - boot.lvl).toFixed(1) + ' lvl-pts'
  };
}

console.log('\nPWR2 — ENDURANCE: the long windows (#510). XFAIL = a tracked #510 defect;');
console.log('an UNEXPECTED PASS means a fix landed and its xfail must be promoted.\n');

/* ================= 1. EVERY IC, RIDDEN LONG, SETTLEDNESS AS DERIVATIVES ================= */
head('THE ICs, 30 sim-min each (Mode 4: 90 min — past its #510 failure horizon at ~75)');

[['hot_full_power', 1800], ['50_percent', 1800], ['hot_zero_power', 1800]].forEach(function (icd) {
  var name = icd[0], secs = icd[1];
  var eng = EN.createEngine({ initial_state: name });
  var trace = [];
  var ts = ride(eng, secs, trace, 30);
  var s = settled(trace, 900);
  ck('ic-' + name + '-clean', name + ': no trip, no SI, never beyond-model across ' +
     (secs / 60) + ' min',
     ts.scrammed === false && eng.pt.si === false && !eng.sys.beyond_model && !eng._dead,
     'pwr ' + ts.power_pct.toFixed(2) + ' %');
  ck('ic-' + name + '-settled', name + ': SETTLED — rates at the measured wander floor ' +
     'over the last 15 min AND position held against the boot point',
     s.rateOk && s.posOk, s.note);
});

(function () {
  var eng = EN.createEngine({ initial_state: 'hot_shutdown' });
  var trace = [];
  var ts = ride(eng, 5400, trace, 30);
  /* WINDOW = HALF THE RIDE, the same fraction the hot ICs use (900 of 1800 s). The fixed
   * Mode 4 hold is a heater LIMIT CYCLE — ~±5 psi at a ~10-min period about a flat mean —
   * and a 15-min window reads one arc of it as a rate (measured −34 psi/hr on a plant whose
   * 90-min position drift is −10 psi). 45 min averages the cycle; the bands are unchanged,
   * and the HEAD defect never reaches this check (it reds on the inventory check above, and
   * its pegged-at-the-wall ending was always the POSITION clauses' catch). */
  var s = settled(trace, 2700);
  ck('mode4-untouched-holds-inventory',
     'hot_shutdown: 90 min untouched holds level < 60 % and pressure > 200 psia',
     ts.pzr_level_pct < 60 && ts.pressure_mpa * 145.038 > 200 && !eng.sys.beyond_model,
     'level ' + ts.pzr_level_pct.toFixed(1) + ' %, P ' +
     (ts.pressure_mpa * 145.038).toFixed(1) + ' psia at 90 min');
  ck('mode4-settled-derivatives',
     'hot_shutdown: SETTLED — the same rate-plus-position law as the hot ICs',
     s.rateOk && s.posOk, s.note);
})();

(function () {
  /* MODE 5 (#524, 2026-08-31) — the fifth IC, same acceptance law as Mode 4 one step
   * colder. Measured before this check was written: 90 min untouched holds Mode 5 at
   * +1.0 degC total, level flat at 25 %, final-45-min rates 0.79 degF/hr / 2.1 psi/hr /
   * 0.11 %/hr — the charging-exchange class, and NO fill-solid (the RHR low-pressure
   * letdown path closes the inventory loop here exactly as it does at Mode 4). */
  var eng = EN.createEngine({ initial_state: 'cold_shutdown' });
  var trace = [];
  var ts = ride(eng, 5400, trace, 30);
  var s = settled(trace, 2700);
  ck('mode5-untouched-holds',
     'cold_shutdown: 90 min untouched stays Mode 5 — level < 60 %, pressure > 200 psia, ' +
     'Tavg under the 93.3 degC boundary, never held',
     ts.pzr_level_pct < 60 && ts.pressure_mpa * 145.038 > 200 &&
     ts.tavg_c < 93.3 && ts.plant_mode === 5 && !eng.sys.beyond_model,
     'level ' + ts.pzr_level_pct.toFixed(1) + ' %, P ' +
     (ts.pressure_mpa * 145.038).toFixed(1) + ' psia, Tavg ' + ts.tavg_c.toFixed(1) +
     ' degC at 90 min');
  ck('mode5-settled-derivatives',
     'cold_shutdown: SETTLED — the same rate-plus-position law as the other ICs',
     s.rateOk && s.posOk, s.note);
})();

(function () {
  /* MODE 5 IS REACHED BY OPERATING, not only by loading (#524) — the integration claim the
   * floor extension exists for: the RHR heat exchanger pulls the WHOLE coupled plant (SG
   * attached, secondary FOLLOWING the primary below the old 211 degF wall instead of pouring
   * §74's ~61 MW of false heat back) across the Mode 5 boundary. Measured before writing:
   * hx 0.15 takes Mode 4 to Mode 5 in 0.56 plant-h. The HX split here is the operator's
   * rate lever — 15 % overshoots the 100 degF/hr administrative limit (worst 1-min −159),
   * which is the checklist's business, not this physics check's. */
  var eng = EN.createEngine({ initial_state: 'hot_shutdown' });
  eng.rh.hx_fraction = 0.15;
  var ts = null, m5at = null, t = 0;
  for (var i = 0; i < 135000 && m5at === null; i++) {           /* up to 45 plant-min */
    ts = EN.step(eng, DT); t += DT;
    if (ts.plant_mode === 5) m5at = t;
  }
  var sgTsec = globalThis.RD.pwr2.water.T_sat(eng.sg.P);
  ck('mode5-reached-by-cooldown',
     'hot_shutdown driven through the RHR HX crosses into Mode 5 on integrated physics, ' +
     'with the SG secondary tracking BELOW the retired 99.6 degC floor',
     m5at !== null && ts.plant_mode === 5 && sgTsec < 99.0 && !eng.sys.beyond_model,
     (m5at === null ? 'never reached in 45 min' : 'Mode 5 at ' + (m5at / 60).toFixed(1) +
      ' plant-min') + ', SG T_sec ' + sgTsec.toFixed(1) + ' degC (' +
     (sgTsec * 9 / 5 + 32).toFixed(1) + ' degF)');
})();

/* ================= 2. THE #510 WEDGES, RIDDEN PAST THEIR HORIZONS ======================= */
head('THE WEDGES  [each ride extends past where the old gate stopped]');

(function () {  /* H-1a: loss_of_feedwater + ATWS — the old check stopped at 10 s */
  var eng = EN.createEngine({});
  ride(eng, 30);
  EN.command(eng, 'scram_block', true);
  EN.command(eng, 'feed_pump_a', false); EN.command(eng, 'feed_pump_b', false);
  var ts = null, maxPwr = 0;
  for (var t = 0; t < 300; t += DT) {
    ts = EN.step(eng, DT);
    if (ts.power_pct > maxPwr) maxPwr = ts.power_pct;
  }
  ck('atws-lofw-stays-representable',
     'ATWS + loss of feed, 300 s: the plant stays REPRESENTABLE — power < 150 %, never ' +
     'beyond-model (a silently frozen plant is the worst verdict)',
     maxPwr < 150 && !eng.sys.beyond_model && !eng._dead,
     'max power ' + maxPwr.toFixed(1) + ' %, beyond_model ' + !!eng.sys.beyond_model +
     (eng._deadWhy ? ' (' + eng._deadWhy.slice(0, 60) + ')' : ''));
})();

(function () {  /* H-1b: SBO + ATWS — the stable false equilibrium */
  var eng = EN.createEngine({});
  ride(eng, 30);
  EN.command(eng, 'scram_block', true);
  EN.command(eng, 'station_blackout', true);
  var ts = ride(eng, 400);
  var tcold = ts.tcold_c !== undefined ? ts.tcold_c : NaN;
  ck('atws-sbo-no-false-equilibrium',
     'ATWS + blackout, 400 s: no false equilibrium — power < 150 % and the cold leg ' +
     'stays above 200 degF (a 46 degF leg at pressure is not a plant)',
     ts.power_pct < 150 && (isNaN(tcold) || tcold * 9 / 5 + 32 > 200),
     'power ' + ts.power_pct.toFixed(1) + ' %, cold leg ' +
     (isNaN(tcold) ? '?' : (tcold * 9 / 5 + 32).toFixed(1)) + ' degF');
})();

(function () {  /* #515 Build 3: the severity-1 LOCA with the ECCS answering — 30 min */
  /* BORN FAILING (2026-08-26): on the unfixed kinetics this ride died at 160.4 s — power
   * 3.3e6 %, rho +1,239 pcm — when injection boron (2,500 ppm RWST water in a drained loop)
   * flipped the density terms positive; the 40 cm2 ride died at 79.9 s on the two-phase
   * reference alone. Landed as PASS in the same build, the pre-fix red recorded here. */
  var eng = EN.createEngine({});
  ride(eng, 30);
  EN.command(eng, 'break_open', { area_m2: 0.002, node: 'cold_leg' });
  var ts = null, maxRho = -1e9, maxPwr = 0, scr = false, tLatch = null, maxSH = 0;
  for (var t = 0; t < 1800; t += DT) {
    ts = EN.step(eng, DT);
    if (ts.core_superheat_c > maxSH) maxSH = ts.core_superheat_c;      /* #517 */
    if (eng._dead) break;
    if (tLatch === null && eng.sys.beyond_model) tLatch = t;
    if (ts.scrammed) scr = true;
    if (scr && t > 60 && ts.reactivity_pcm > maxRho) maxRho = ts.reactivity_pcm;
    if (scr && t > 60 && ts.power_pct > maxPwr) maxPwr = ts.power_pct;
  }
  /* MEASURED after the fix (2026-08-26): the kinetics never goes positive (max rho -1,411 pcm at
   * 5 s, then -16,000..-30,000 through the blowdown) — but the core's INNER guard latches at
   * 161.1 s (322 psia, quality 0.74, 100 % void, boron 2,393 ppm): the thermodynamic event the
   * kinetics death was riding. That is a HELD plant (the #487/#499 contract), pre-existing and
   * now visible; it is REPORTED here and filed, not asserted away — this ride's claim is the
   * reactivity chain's. */
  /* #517 — THE NEGATIVE CONTROL FOR THE SUPERHEAT WING, and it belongs here because this is the
   * only place the ride runs through the FACADE with injection answering. The wing was built on
   * the ruling that a voided core should be able to express superheat; it is INERT on this ride,
   * and that was measured BEFORE it was built (core quality 0.84-0.88 at the latch, never out of
   * the dome). Engine-direct with no ECCS the identical 0.002 m2 break reaches 138 degC of
   * superheat (run_pwr2_coredamage) — so injection is what holds this core two-phase, and the
   * contrast is the finding. If someone later tunes the superheat factor until THIS ride moves,
   * this check reds: that would be fitting a mechanism to a suite (Hard Rule 10). */
  ck('loca-sev1-eccs-superheat-inert',
     'the severity-1 LOCA with injection stays essentially IN THE DOME — the #517 superheat wing ' +
     'is inert here by measurement, not by hope (engine-direct without ECCS the same break ' +
     'reaches 138 degC)',
     /* BAND RE-MEASURED (#518, a DECLARED REFIT). 40 was fitted to a ride that FROZE at 161 s;
      * with the ring sub-stepped the same ride runs its full 1,800 s — 11x longer to superheat
      * in — and reads 46.0 degC. The claim is unchanged and so is its evidence: this core stays
      * essentially two-phase (the superheat factor is 0.954 here, a 4.6 % effect) against 138
      * degC engine-direct with no injection. Validated on the OLD behaviour too: the pre-#518
      * ride measured 18.6 degC and passes this band as well, so the check is not refitted to the
      * change — it is the same claim with the frozen horizon taken out of it. */
     maxSH < 70,
     'max core superheat ' + maxSH.toFixed(1) + ' degC (was 18.6 when this ride froze at 161 s; ' +
     '138 engine-direct without injection); the freeze on this ride was NOT a property-range ' +
     'event — it was the #518 transport instability, now fixed');

  ck('loca-sev1-eccs-30min',
     'a severity-1 LOCA with the ECCS answering, 30 min: no kinetics death — scrammed, the fuel ' +
     'finite, reactivity never positive after the scram (the void term flipped positive on ' +
     'injection boron and killed it at 160 s before #515 Build 3); the inner-guard latch is reported',
     !eng._dead && scr && maxRho <= 0 && isFinite(ts.fuel_temp_c),
     'dead ' + !!eng._dead + (eng._deadWhy ? ' (' + eng._deadWhy.slice(0, 50) + ')' : '') +
     ', max rho after scram ' + (maxRho === -1e9 ? '?' : maxRho.toFixed(0)) + ' pcm, max power ' +
     maxPwr.toFixed(2) + ' %, boron ' + ts.boron_ppm.toFixed(0) + ' ppm, void ' +
     (ts.core_void_fraction * 100).toFixed(0) + ' %; inner guard latched ' +
     (tLatch === null ? 'never' : 'at ' + tLatch.toFixed(1) + ' s (held, reported)'));
})();

(function () {  /* #582: the SMALL-BREAK PLATEAU — CA-20b's mechanism claims, re-derived on PWR2.
   * The retired engine drove the primary 266 psi BELOW its own heat sink and then drained the
   * secondary through the tubes to 202 psi (#451); CA-20b pinned that as a strict expected-fail
   * until the engine swap made it a gate on code no public build runs (owner ruling 2026-08-28:
   * retire it deliberately, build the PWR2 gate it never had). MEASURED here first (2026-08-29,
   * Hard Rule 12): on a 5 cm2 unmitigated cold-leg break the primary RIDES its heat sink — the
   * worst departure below the SG after the trip transient is -31.6 psi at 701 s, the late-ride
   * coupling is within ~10 psi, and the SG's inventory never falls below its initial 12,796 kg
   * (it ENDS at 17,117 kg with AFW throttled to 1/3). The bands below carry those numbers with
   * margin; the MECHANISM asserted is the same two legs CA-20b carried. */
  var eng = EN.createEngine({});
  ride(eng, 10);
  EN.command(eng, 'break_open', { area_m2: 0.0005, node: 'cold_leg' });
  var ts = null, worstGap = 0, sgM0 = eng.sg.mass, minSgM = 1e18, held = false;
  for (var t = 0; t < 1800; t += DT) {
    ts = EN.step(eng, DT);
    if (ts.model_held) { held = true; break; }
    if (eng.sg.mass < minSgM) minSgM = eng.sg.mass;
    var gap = (ts.pressure_mpa - eng.sg.P) * 145.038;
    if (t > 120 && gap < worstGap) worstGap = gap;
  }
  ck('loca-small-break-plateau-legA',
     'the small-break primary never falls a control band below its own heat sink — the plateau ' +
     'is the SG holding the primary, which is the mechanism CA-20b\'s leg A asserted (0.35 MPa ' +
     'band, the retired engine measured 266 psi below)',
     !held && worstGap > -50.8,
     'worst (P_rcs - P_sg) after 120 s: ' + worstGap.toFixed(1) + ' psi (measured -31.6 at ' +
     '701 s on the quench transient; late-ride coupling ~10 psi)');
  ck('loca-small-break-plateau-legB',
     'the heat sink is still a heat sink: the secondary is NOT drained through the tubes ' +
     '(CA-20b leg B — the retired engine pulled the SG to 202 psi through the 5 % reverse path)',
     minSgM > 0.9 * sgM0,
     'SG inventory min ' + minSgM.toFixed(0) + ' kg of ' + sgM0.toFixed(0) + ' initial (' +
     (100 * minSgM / sgM0).toFixed(1) + ' %), final ' + eng.sg.mass.toFixed(0) + ' kg, AFW ' +
     (ts.afw_flow_normalized === undefined ? '?' : ts.afw_flow_normalized.toFixed(2)) +
     ' of rated');
})();

(function () {  /* H-4 + H-5: the un-carried blackout wires, one dead-plant ride */
  var eng = EN.createEngine({ initial_state: 'hot_shutdown' });
  EN.step(eng, DT);
  EN.command(eng, 'rhr_hx', 1.0);
  EN.command(eng, 'station_blackout', true);
  EN.command(eng, 'aux_spray', 1.0);
  var ts = ride(eng, 60);
  ck('blackout-kills-aux-spray',
     'a full blackout kills AUX SPRAY (charging-pump driven — its own header\'s law)',
     (eng._pzr.aux_spray_kgs || 0) === 0,
     'aux_spray ' + (eng._pzr.aux_spray_kgs || 0).toFixed(2) + ' kg/s with ac_available ' +
     ts.ac_available);
  var kJ0 = eng.rh.removed_kJ;
  ride(eng, 10);
  /* THE EFFECT, not a state flag (#510 M-10 re-target: rhr_active is the VALVE now, the
   * contract's own semantics, so it stays true through a blackout with the suction open —
   * the ledger is the honest observable). The first form of this check read a
   * field the contract does not publish (`rhr_flow_normalized`), so `undefined || 0`
   * passed it VACUOUSLY over 26.6 MMBtu/hr of unpowered cooling: the hollow-check class
   * this runner exists to kill, caught by its own strict convention on the first run. */
  ck('blackout-kills-rhr',
     'a full blackout kills the RHR pumps (WTSM 5.7.5: all DHR systems except the TDAFW) — ' +
     'an aligned, HX-open system removes ZERO heat unpowered (the removed-energy ledger ' +
     'stands still; the suction valve honestly stays open)',
     eng.rh.valve_open === true && eng.rh.removed_kJ === kJ0,
     'removed ' + (eng.rh.removed_kJ - kJ0).toFixed(1) + ' kJ over 10 s of blackout, valve ' +
     (eng.rh.valve_open ? 'OPEN' : 'shut'));
})();

(function () {  /* H-6: the shed-order hole — SI, recover, re-load, then LOOP.
  * FIXTURE PRECONDITIONS ARE ASSERTED (first-run lesson): the level must have RECOVERED
  * above the 20 % restore point and the re-load must be DELIVERING before the LOOP
  * arrives, or the 17 % low-level cut stands in for the latch and the check passes
  * vacuously — which is exactly what the first fixture did (5e-4 break, 120 s recovery). */
  var eng = EN.createEngine({});
  ride(eng, 30);
  EN.command(eng, 'break_open', { area_m2: 2e-4, node: 'cold_leg' });
  var ts = null;
  for (var t = 0; t < 180 && !(eng.pt.si); t += DT) ts = EN.step(eng, DT);
  EN.command(eng, 'break_close', true);
  /* SI keeps injecting (latched) — ride until level recovers past the restore point */
  for (t = 0; t < 900 && (eng.pz.lowLevelCut || eng.pz.emptied); t += DT) ts = EN.step(eng, DT);
  ride(eng, 60);
  EN.command(eng, 'pzr_heaters_manual', 1.0);   /* the operator re-load, latch cleared */
  ts = ride(eng, 10);
  var pre = { lowCut: eng.pz.lowLevelCut, kW: (eng._pzr.heater_kW) || 0 };
  ck('shed-fixture-preconditions',
     'fixture: SI standing, level recovered (no low-level cut), the re-load DELIVERING — ' +
     'the vacuity doors are shut before the claim is made',
     eng.pt.si === true && pre.lowCut === false && pre.kW > 100,
     'si ' + eng.pt.si + ', lowLevelCut ' + pre.lowCut + ', heater_kW ' + pre.kW.toFixed(1));
  EN.command(eng, 'offsite_power', false);      /* the SECOND signal */
  ts = ride(eng, 10);
  ck('shed-latches-on-loop-after-si',
     'a LOOP arriving AFTER an SI (heaters re-loaded between) SHEDS the banks — two ' +
     'independent actuating signals, not one OR\'d edge',
     eng.pz.heatersShed === true && ((eng._pzr.heater_kW) || 0) === 0,
     'shed ' + eng.pz.heatersShed + ', heater_kW ' + ((eng._pzr.heater_kW) || 0).toFixed(1));
})();

(function () {  /* H-7: the cold start's speed — the sources-gate fixture sat where 1.5x cannot bind */
  var eng = EN.createEngine({ initial_state: 'hot_shutdown' });
  EN.step(eng, DT);
  EN.command(eng, 'rcp_start', true);
  ride(eng, 60);
  var frac = eng.sys.omega / (1185 * 2 * Math.PI / 60);
  ck('rcp-start-reaches-rated-cold',
     'an RCP start in COLD dense water reaches rated speed within 60 s (the claim §73 ' +
     'makes; the hot fixture could not bind the 1.5x torque margin)',
     frac >= 0.99, (frac * 100).toFixed(2) + ' % of rated at +60 s');
})();

(function () {  /* M-6: the vacuum row must reach the turbine eventually */
  var eng = EN.createEngine({});
  ride(eng, 30);
  EN.command(eng, 'cw_pumps', false);
  var ts = ride(eng, 300);
  ck('vacuum-loss-reaches-the-turbine',
     'a dead condenser reaches the TURBINE within 300 s — output falls or the unit trips ' +
     '(100.0000 MWe at zero vacuum is a lamp with no plant behind it)',
     ts.mwe_output < 95 || eng.tb.tripped === true || ts.scrammed === true,
     'mwe ' + ts.mwe_output.toFixed(4) + ', turbine tripped ' + eng.tb.tripped);
})();

/* ================= 3. LONG-CASUALTY SANITY (windows that already pass, kept honest) ===== */
head('LONG CASUALTIES  [green today — the window is the point]');

(function () {  /* the wave-4 LOOP, ridden 30 min UNATTENDED. NOT an equilibrium claim —
  * both AFW pumps stay latched (nothing auto-secures them) and decay heat declines, so
  * the honest unattended shape is a slow AFW overcooling. The claim is BOUNDEDNESS: no
  * wedge, cooldown inside the 100 degF/hr limit class, the SG wet but not runaway.
  * First-run measurement: −69.3 degF/hr at 30 min, SG frac 1.74 and rising — an
  * equilibrium band here would be a band fitted against physics that is not settling. */
  var eng = EN.createEngine({});
  ride(eng, 30);
  EN.command(eng, 'offsite_power', false);
  var trace = [];
  var ts = ride(eng, 1800, trace, 30);
  var r = ratesPerHr(trace, 600);
  ck('loop-30min-bounded',
     'a LOOP ridden 30 min UNATTENDED stays bounded: no beyond-model, the latched-AFW ' +
     'cooldown under 100 degF/hr, the SG wet and below 2.45x nominal (the level map\'s ' +
     'own ceiling)',
     !eng.sys.beyond_model && !eng._dead &&
     Math.abs(r.dTavg * 9 / 5) < 100 &&
     ts.sg_mass_frac > 0.3 && ts.sg_mass_frac < 2.45 &&
     ts.scrammed === true,
     'tavg ' + ts.tavg_c.toFixed(1) + ' degC, SG frac ' + ts.sg_mass_frac.toFixed(2) +
     ', cooldown ' + (r.dTavg * 9 / 5).toFixed(1) + ' degF/hr (latched AFW — unattended)');
})();

(function () {  /* the seal leak at full severity, 30 min: holdable means HELD */
  var eng = EN.createEngine({});
  ride(eng, 30);
  EN.command(eng, 'break_open', { area_m2: 1.2e-5, node: 'rcp' });
  eng._plcsAuto = true;
  var ts = ride(eng, 1800);
  ck('seal-leak-30min-held',
     'the full-severity seal leak ridden 30 min is HELD (the row\'s teaching point, ' +
     'asserted at the horizon instead of the first minutes): level > 15 %, no SI',
     ts.pzr_level_pct > 15 && eng.pt.si === false && !eng.sys.beyond_model,
     'level ' + ts.pzr_level_pct.toFixed(1) + ' %, P ' +
     (ts.pressure_mpa * 145.038).toFixed(0) + ' psia at 30 min');
})();

/* ================= verdict ============================================================== */
console.log('\n' + '='.repeat(70));
console.log('  run_pwr2_endurance: ' + nPass + ' passed, ' + nXfail + ' xfail (tracked #510), ' +
            nFail + ' failed, ' + nUnexpected + ' unexpected-pass');
console.log('  strict: an xfail that PASSES reds this runner until it is promoted.');
console.log('='.repeat(70) + '\n');
process.exit((nFail > 0 || nUnexpected > 0) ? 1 : 0);
