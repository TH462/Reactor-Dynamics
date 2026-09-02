/* run_pwr2_eccs.js — Layer 5 gate: emergency core cooling. (#479)
 *
 * The educational claim this layer makes is that INJECTION IS CONDITIONAL ON PRESSURE, so that is
 * what gets tested hardest — and it is tested as COMPARISONS ACROSS BOUNDARIES rather than as
 * bands at points. A band would pass for a pump that always delivers, which is precisely the
 * model this layer exists to replace.
 *
 *   1. THE SOURCED CURVES ARE THE DOCUMENT'S. Every point of Ginna UFSAR Table 15.6-17 is checked
 *      against the table verbatim, UNSCALED, so the arithmetic of scaling cannot hide a transcription
 *      error. A curve nobody diffed against its source is a recalled curve.
 *   2. THE SHUTOFF HEAD IS REAL. Above 1389.7 psia HHSI delivers NOTHING. The check straddles the
 *      boundary — some flow just below, exactly zero just above — because "flow is small at high
 *      pressure" is satisfied by a pump that never shuts off at all.
 *   3. THE 215 psia REGIME STEP. Below the LHSI shutoff the low-head train delivers several times
 *      the high-head train. That step is why a procedure says "get below the cut-in", and it is
 *      checked as a ratio across the boundary.
 *   4. CONSTRUCTION, written first (D1 §31 — every layer that acquired this section later had
 *      blind spots in it, and CVCS's own physics checks were the ones that failed instead).
 *
 * Run: node test/run_pwr2_eccs.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var MUT = require('./mut_flags.js');   /* --no-mutations / --mut= / --grp= (#602) */
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_eccs.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop',
 'pwr2_sources'].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, W = RD.water, S = RD.sources;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: RD.water, core: RD.core, geometry: RD.geometry,
                             loop: RD.loop, sources: RD.sources } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.eccs;';
  return new Function('RD_ROOT', body)(root);
}

/* THE SOURCE, RETYPED FROM THE DOCUMENT INDEPENDENTLY OF THE ENGINE'S COPY.
 * Ginna UFSAR ch.15 Table 15.6-17. If this gate imported the engine's table it would be checking
 * that a copy equals itself -- the exact circularity Layer 0's 56 green checks turned out to have. */
var DOC_HHSI = [[14.7, 300], [114.7, 300], [214.7, 300], [314.7, 300], [414.7, 300], [514.7, 300],
                [614.7, 289], [714.7, 273], [814.7, 253], [914.7, 229], [1014.7, 201],
                [1114.7, 167], [1214.7, 125], [1314.7, 62], [1389.7, 0]];
var DOC_LHSI = [[14.7, 1200], [20, 1176], [40, 1083], [60, 980], [80, 866], [100, 735],
                [120, 570], [140, 220], [214.7, 0]];

function runSuite(C, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(52) +
      'got ' + got.toFixed(3) + ' want ' + want.toFixed(3) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  var PSI = 145.038;
  var toGpm = function (kgs) { return kgs / 1000 * 264.172 * 60; };
  /* A DEPRESSURISED PLANT IS NOT A HOT PLANT AT LOW PRESSURE, and this fixture got that wrong.
   *
   * The first version built every plant at the nominal enthalpy and simply lowered P. At 1362
   * kJ/kg and 1.0 MPa the water is at QUALITY 0.298 -- thirty per cent steam -- because h_f is
   * 763 there. The "plant" held 493.6 kg instead of ~16,900, and the reconstruction went NaN off
   * the property table. Nothing about it was a plant.
   *
   * FIFTH unphysical fixture this session, and they all have the same shape: needing a
   * non-nominal state, I set the one variable I was thinking about and inherited the other.
   * **P AND h ARE NOT INDEPENDENT.** A cooled-down plant lined up for low-head injection is
   * SUBCOOLED at its pressure, so the enthalpy has to come down with it. */
  function plant(P) {
    var p = P === undefined ? 15.41 : P;
    /* ~60 degC of subcooling at whatever pressure is asked for -- a real cooldown lineup. */
    var T = Math.max(20.5, W.T_sat(p) - 60);
    return S.createPlant({ h: W.h_l(T, p), P: p });
  }
  /* AND THE FIXTURE IS ASSERTED, not assumed. A probe standing in a two-phase mixture it believes
   * to be water reports numbers that look ordinary. */
  function fixtureIsLiquid(sys) {
    for (var i = 0; i < sys.nodes.length; i++) {
      if (sys.nodes[i].h >= W.h_f(sys.P) - 1e-9) return false;
    }
    return isFinite(sys.M_total) && sys.M_total > 1000;
  }

  /* ---- 1. THE CURVES ARE THE DOCUMENT'S ----------------------------------------------- */
  if (!quiet) console.log('\nSOURCED CURVES  [every point of Ginna T15.6-17, UNSCALED, vs a retyped copy]');
  var badH = [], badL = [];
  DOC_HHSI.forEach(function (pt) {
    var gpm = toGpm(C.hhsiFlow(pt[0] / PSI, 1));
    if (Math.abs(gpm - pt[1]) > 0.05) badH.push(pt[0] + ':' + gpm.toFixed(1) + '!=' + pt[1]);
  });
  DOC_LHSI.forEach(function (pt) {
    var gpm = toGpm(C.lhsiFlow(pt[0] / PSI, 1));
    if (Math.abs(gpm - pt[1]) > 0.05) badL.push(pt[0] + ':' + gpm.toFixed(1) + '!=' + pt[1]);
  });
  ckT('every HHSI point matches the document', badH.length === 0,
      badH.length ? badH.join(' ') : DOC_HHSI.length + ' points, 300 gpm flat to 514.7 psia then falling');
  ckT('every LHSI point matches the document', badL.length === 0,
      badL.length ? badL.join(' ') : DOC_LHSI.length + ' points, 1200 gpm at 14.7 psia down to 0 at 214.7');
  ckT('the engine carries the same number of points as the document',
      C.ECCS.HHSI_PSIA_GPM.length === DOC_HHSI.length &&
      C.ECCS.LHSI_PSIA_GPM.length === DOC_LHSI.length,
      C.ECCS.HHSI_PSIA_GPM.length + ' HHSI, ' + C.ECCS.LHSI_PSIA_GPM.length + ' LHSI');
  /* Interpolation must land BETWEEN neighbours, not on one of them -- a lookup that snapped to the
   * nearest point would pass every check above and be wrong everywhere in between. */
  var mid = toGpm(C.hhsiFlow(964.7 / PSI, 1));
  ckT('it INTERPOLATES between points rather than snapping to one',
      mid < 229 - 1 && mid > 201 + 1,
      mid.toFixed(1) + ' gpm at 964.7 psia, strictly between the 914.7 (229) and 1014.7 (201) rows');

  /* ---- 2. THE SHUTOFF HEAD, ACROSS THE BOUNDARY --------------------------------------- */
  if (!quiet) console.log('\nSHUTOFF HEAD  [checked ACROSS the boundary -- a band would pass a pump that never stops]');
  var justBelow = C.hhsiFlow(1380 / PSI, 1), justAbove = C.hhsiFlow(1400 / PSI, 1);
  ckT('HHSI delivers something just BELOW its shutoff head', justBelow > 0,
      toGpm(justBelow).toFixed(1) + ' gpm at 1380 psia');
  ckT('...and EXACTLY nothing just above it', justAbove === 0,
      '0 gpm at 1400 psia against a sourced shutoff of ' + C.ECCS.hhsi_shutoff_psia + ' psia');
  ckT('at normal operating pressure the high-head pumps deliver NOTHING',
      C.hhsiFlow(15.41) === 0,
      '2235 psia is far above the 1389.7 psia shutoff -- an RCS that has not depressurised gets ' +
      'no emergency cooling, which is the lesson');
  var lhBelow = C.lhsiFlow(200 / PSI, 1), lhAbove = C.lhsiFlow(230 / PSI, 1);
  ckT('LHSI likewise stops at its own, much lower, shutoff', lhBelow > 0 && lhAbove === 0,
      toGpm(lhBelow).toFixed(1) + ' gpm at 200 psia, 0 at 230, sourced shutoff ' +
      C.ECCS.lhsi_shutoff_psia);
  /* MONOTONE. A curve that wandered would still pass the point checks. */
  var rising = 0, prev = Infinity;
  for (var p = 20; p <= 1400; p += 20) {
    var f = C.hhsiFlow(p / PSI, 1);
    if (f > prev + 1e-9) rising++;
    prev = f;
  }
  ckT('flow never RISES with pressure anywhere on the curve', rising === 0,
      '69 samples from 20 to 1400 psia, ' + rising + ' increases');

  /* ---- 3. THE REGIME STEP AT ~215 psia ------------------------------------------------ */
  if (!quiet) console.log('\nREGIME STEP  [why "get below the cut-in" is a procedure step]');
  var above = C.hhsiFlow(300 / PSI, 1) + C.lhsiFlow(300 / PSI, 1);
  var below = C.hhsiFlow(100 / PSI, 1) + C.lhsiFlow(100 / PSI, 1);
  ck('crossing the LHSI cut-in multiplies total injection', below / above, 3.45, 0.35, '(ratio)');
  ckT('...and above the cut-in the low-head train contributes exactly nothing',
      C.lhsiFlow(300 / PSI, 1) === 0 && C.hhsiFlow(300 / PSI, 1) > 0,
      'at 300 psia: HHSI ' + toGpm(C.hhsiFlow(300 / PSI, 1)).toFixed(0) + ' gpm, LHSI 0');

  /* ---- 4. SCALING IS DECLARED, AND BOTH BASES REPORTED -------------------------------- */
  if (!quiet) console.log('\nSCALING  [POWER here -- deliberately NOT the volume basis CVCS uses]');
  ck('the power basis is 300/1520 MWt', C.ECCS.POWER_SCALE, 300 / 1520, 1e-12, '');
  var hhScaled = toGpm(C.hhsiFlow(100 / PSI));
  ckT('the scaled HHSI curve is the sourced one times the power basis',
      Math.abs(hhScaled - 300 * (300 / 1520)) < 0.05,
      hhScaled.toFixed(1) + ' gpm from a sourced 300');
  if (!quiet) {
    console.log('        BASIS (D-ECCS): power x' + (300 / 1520).toFixed(4) + ' -> HHSI ' +
      hhScaled.toFixed(1) + ' gpm  |  volume x' + C.ECCS.VOLUME_SCALE_REF.toFixed(4) +
      ' (what CVCS uses) would give ' + (300 * C.ECCS.VOLUME_SCALE_REF).toFixed(1) + ' gpm');
  }

  /* ---- 5. IT DRIVES THE REAL LOOP ----------------------------------------------------- */
  if (!quiet) console.log('\nINVENTORY  [the LEDGER, and inside the envelope -- CVCS learned both]');
  var sysI = plant(1.0);                       /* depressurised, so both trains deliver */
  ckT('the depressurised FIXTURE is subcooled liquid, not a flashed mixture',
      fixtureIsLiquid(sysI),
      'h ' + sysI.nodes[0].h.toFixed(0) + ' kJ/kg against h_f ' + W.h_f(sysI.P).toFixed(0) +
      ' at ' + (sysI.P * PSI).toFixed(0) + ' psia, ledger ' + sysI.M_total.toFixed(0) +
      ' kg -- the first version sat at quality 0.298 and held 494 kg');
  var ec = C.createECCS({ hhsiRunning: true, lhsiRunning: true });
  var M0 = sysI.M_total, rI = null;
  for (var t = 0; t < 250; t++) {
    rI = C.stepECCS(ec, sysI, 0.02);
    S.stepPlant(sysI, 0.02, { corePower: 20000, sgDuty: 20000, sources: rI.sources });
  }
  var recon = 0; sysI.nodes.forEach(function (n) { recon += n.V * W.rho_from_h(n.h, sysI.P); });
  ckT('injection ADDS inventory through the loop', sysI.M_total > M0,
      (sysI.M_total - M0).toFixed(1) + ' kg in 5 s  [the LEDGER, not the reconstruction]');
  ckT('the ledger and the reconstruction still AGREE  [envelope guard]',
      Math.abs(sysI.M_total - recon) / sysI.M_total < 1e-3,
      'ledger ' + sysI.M_total.toFixed(1) + ' vs reconstructed ' + recon.toFixed(1) + ' kg');
  ckT('injected water is COLD compared with the node it enters', (function () {
        var cl = null; sysI.nodes.forEach(function (n) { if (n.id === 'cold_leg') cl = n.h; });
        return rI.sources[0].h < cl - 100;
      })(), 'RWST at ' + C.ECCS.rwst_temp_c + ' degC -- thermal shock is a real consequence and ' +
      'this layer does not decide what to do about it');
  ckT('the running total is accumulated, not recomputed', rI.injected_kg > 0 &&
      Math.abs(rI.injected_kg - (sysI.M_total - M0)) / rI.injected_kg < 0.02,
      rI.injected_kg.toFixed(1) + ' kg reported against ' + (sysI.M_total - M0).toFixed(1) +
      ' kg on the ledger');
  /* A SHUTOFF IS NOT A FAILURE, and the readout must say which it is. */
  var rHi = C.stepECCS(C.createECCS({ hhsiRunning: true, lhsiRunning: true }), plant(15.41), 0.02);
  ckT('at pressure, zero flow is REPORTED as shutoff rather than looking like a failed pump',
      rHi.total_kgs === 0 && rHi.hhsi_shutoff === true && rHi.lhsi_shutoff === true,
      'both trains lined up and running, both shut off, and both say so');
  ckT('a shut-off train contributes no boundary source at all',
      rHi.sources.length === 0, 'no zero-flow source handed to Layer 3');

  /* ---- 6. CONSTRUCTION  [written FIRST -- D1 §31] ------------------------------------- */
  if (!quiet) console.log('\nCONSTRUCTION  [§31: written first, not acquired after an attack]');
  var opt = C.createECCS({ hhsiRunning: true, lhsiRunning: true, hhsiAvail: 0.5,
                           lhsiAvail: 0.25, injected_kg: 42 });
  ckT('caller hhsiRunning reaches the plant', opt.hhsiRunning === true, '');
  ckT('caller lhsiRunning reaches the plant', opt.lhsiRunning === true, '');
  ck('caller hhsiAvail reaches the plant', opt.hhsiAvail, 0.5, 1e-12, '');
  ck('caller lhsiAvail reaches the plant', opt.lhsiAvail, 0.25, 1e-12, '');
  ck('caller injected_kg reaches the plant', opt.injected_kg, 42, 1e-12, 'kg');
  ckT('a PUMP train NOT lined up delivers nothing however low the pressure', (function () {
        var r0 = C.stepECCS(C.createECCS({}), plant(0.5), 0.02);
        /* REFIT with #511, declared: total_kgs now includes the PASSIVE accumulator, which
         * discharges at 0.5 MPa with no lineup at all — that is its sourced nature ("no
         * operator or control actions are required"), so the pump claim moves to the pump
         * fields and the accumulator's unprompted discharge is asserted alongside. */
        return r0.hhsi_kgs === 0 && r0.lhsi_kgs === 0 && r0.acc_kgs > 0;
      })(),
      'default lineup is BOTH PUMP TRAINS OFF; the accumulator needs no lineup and injects anyway');
  ckT('degraded availability scales the flow, and is not cosmetic', (function () {
        var full = C.stepECCS(C.createECCS({ hhsiRunning: true }), plant(1.0), 0.02).hhsi_kgs;
        var half = C.stepECCS(C.createECCS({ hhsiRunning: true, hhsiAvail: 0.5 }), plant(1.0), 0.02).hhsi_kgs;
        return full > 0 && Math.abs(half / full - 0.5) < 1e-9;
      })(), 'one train of two delivers exactly half');
  ckT('negative availability is floored rather than trusted',
      C.stepECCS(C.createECCS({ hhsiRunning: true, hhsiAvail: -2 }), plant(1.0), 0.02).hhsi_kgs === 0,
      'a negative availability would otherwise SUCK inventory out of the vessel');

  /* ---- THE VITAL BUS (#507 wave 4): the SI pumps die in a station blackout ---- */
  var rSbo = C.stepECCS(C.createECCS({ hhsiRunning: true, lhsiRunning: true }), plant(1.0), 0.02,
                        { ac_available: false });
  ckT('a dead vital bus stops BOTH SI trains at a pressure they would otherwise pump into',
      rSbo.hhsi_kgs === 0 && rSbo.lhsi_kgs === 0,
      'run flags stand (the #200 split); the avail fractions stay separate FAILURE seats');
  ckT('absent drivers mean POWERED -- every fixture above holds (acAvailable convention)',
      C.stepECCS(C.createECCS({ hhsiRunning: true }), plant(1.0), 0.02).hhsi_kgs > 0, '');

  /* ---- 7. THE ACCUMULATOR (#511) ------------------------------------------------------- */
  if (!quiet) console.log('\nTHE ACCUMULATOR  [#511: a tank under nitrogen, not a curve]');
  ck('cover pressure is the sourced 650 psig (WTSM Table 5.2-2)',
     C.ACC.p0_mpa * 145.038 - 14.7, 650, 0.5, 'psig');
  ckT('the tank is two-thirds water (WTSM 5.2.4.1: gas space = half the water volume)', (function () {
        var a = C.createAccumulator({});
        return Math.abs(a.vg0_m3 - a.w0_m3 / 2) < 1e-9 && a.w0_m3 > 5;
      })(), C.createAccumulator({}).w0_m3.toFixed(2) + ' m3 water (0.435 x RCS volume, the #408 identity)');
  ckT('AT PRESSURE the check valves hold — zero flow into 2235 psia', (function () {
        var r = C.stepECCS(C.createECCS({}), plant(15.41), 0.02);
        return r.acc_kgs === 0 && r.acc_water_frac === 1;
      })(), 'tank pressure 650 psig cannot beat the RCS');
  ckT('BELOW the cover pressure it discharges with NO lineup and NO power — passive', (function () {
        var r = C.stepECCS(C.createECCS({}), plant(1.0), 0.02, { ac_available: false });
        return r.acc_kgs > 0 && r.hhsi_kgs === 0 && r.lhsi_kgs === 0;
      })(), 'a station blackout does not touch it (sourced: "no operator or control actions are ' +
            'required"); the SI pumps beside it are dead');
  ckT('a SHUT isolation valve stops it completely', (function () {
        var r = C.stepECCS(C.createECCS({ acc: { valve_open: false } }), plant(1.0), 0.02);
        return r.acc_kgs === 0;
      })(), 'the one lever the system has');
  ckT('the driving head FALLS as the tank empties (expanding cover gas)', (function () {
        var ec7 = C.createECCS({});
        var sys7 = plant(0.5);
        var f0 = C.stepECCS(ec7, sys7, 0.02).acc_kgs;
        for (var i = 0; i < 500; i++) C.stepECCS(ec7, sys7, 0.02);   /* ~10 s of discharge */
        var f1 = C.stepECCS(ec7, sys7, 0.02).acc_kgs;
        var pNow = C.accPressure(ec7.acc);
        return f1 < f0 && pNow < C.ACC.p0_mpa && ec7.acc.water_m3 < ec7.acc.w0_m3;
      })(), 'flow and cover pressure both fall — a constant-head tank would be the curve this ' +
            'component exists not to be');
  ckT('it EMPTIES in the sourced discharge class and then stops', (function () {
        var ec8 = C.createECCS({});
        var sys8 = plant(0.2);
        var t = 0;
        while (ec8.acc.water_m3 > 0 && t < 300) { C.stepECCS(ec8, sys8, 0.05); t += 0.05; }
        var after = C.stepECCS(ec8, sys8, 0.05);
        if (!quiet) console.log('        measured empty time ' + t.toFixed(1) + ' s against the sourced ~36 s class');
        return t > 15 && t < 90 && after.acc_kgs === 0 && after.acc_water_frac === 0;
      })(), 'finite inventory: the flow coefficient is solved against Ginna\'s ~36 s dump, and an ' +
            'empty tank injects nothing (N2 injection declared unmodeled)');
  ckT('the published fields ride the return (the board card reads them)', (function () {
        var r = C.stepECCS(C.createECCS({}), plant(15.41), 0.02);
        return r.acc_pressure_mpa > 4 && r.acc_valve_open === true && r.acc_water_frac === 1;
      })(), '');
  /* #585 — a HELD plant accepts no injection, and the TANK is the observable: an accumulator
   * draining into a plant whose mass cannot move destroys the water it discharged. This lives
   * HERE and not in run_pwr2_loca because that fixture's tank is empty by the time its ride
   * latches — the joint gate structurally cannot see this guard. */
  ckT('a beyond_model plant gets zero flow and the tank keeps its water (#585)', (function () {
        var ec9 = C.createECCS({ hhsiRunning: true, lhsiRunning: true });
        var sys9 = plant(0.5);                      /* both trains WOULD flow at this pressure */
        sys9.beyond_model = true;
        var w0 = ec9.acc.water_m3, i0 = ec9.injected_kg;
        var r = C.stepECCS(ec9, sys9, 0.02);
        return r.total_kgs === 0 && r.sources.length === 0 && r.held === true &&
               ec9.acc.water_m3 === w0 && ec9.injected_kg === i0;
      })(), 'pumps refused, tank untouched, no source handed to Layer 3');
}

console.log('\nPWR2 Layer 5 -- ECCS: sourced injection curves');
var C = loadFrom(SRC), rec = [];
runSuite(C, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['the SI power gate is severed (a blacked-out pump keeps injecting) -- #507 wave 4',
   'var powered = !drivers || drivers.ac_available !== false;',
   'var powered = true;'],
  ['the held-plant guard is removed — ECCS drains its tank into a frozen plant (#585)',
   '    if (sys.beyond_model === true) {', '    if (false) {'],
  /* THE SHUTOFF IS THE FALLTHROUGH, and it must be mutable on ONE line so an autocrlf checkout
   * cannot silently stop the anchor matching -- the trap CLAUDE.md records against multi-line
   * anchors, and one this file tripped while being written. */
  ['the fallthrough above the table stops returning zero (a pump that always delivers)',
   'return 0;                       /* above the table: THE SHUTOFF HEAD */',
   'return 999;                     /* above the table: THE SHUTOFF HEAD */'],
  ['the low-pressure clamp inverted (flow rises as pressure falls past the table)',
   'if (P_psia <= tbl[0][0]) return tbl[0][1];', 'if (P_psia <= tbl[0][0]) return 0;'],
  ['interpolation replaced by nearest-point lookup',
   'return a[1] + t * (b[1] - a[1]);', 'return a[1];'],
  ['a sourced HHSI point mistyped', '[1014.7, 201]', '[1014.7, 250]'],
  ['a sourced LHSI point mistyped', '[100, 735]', '[100, 900]'],
  /* Now testable: with the masking early-return gone, the document diff reads this row. */
  ['the HHSI shutoff row given a non-zero flow', '[1389.7, 0]', '[1389.7, 5]'],
  ['ECCS scaled by VOLUME instead of the declared power basis',
   'var POWER_SCALE = 300 / 1520;', 'var POWER_SCALE = 0.16312;'],
  ['injected water arrives hot instead of at RWST temperature',
   'var h_inj = W.h_l(ECCS.rwst_temp_c, P);', 'var h_inj = W.h_l(290, P);'],
  ['the running total stops accumulating',
   'ec.injected_kg += total * dt;', ''],
  ['a shut-off train still hands Layer 3 a zero-flow source',
   "    if (hh + lh > 0) srcs.push({ node: 'cold_leg', mdot: hh + lh, h: h_inj });",
   "    srcs.push({ node: 'cold_leg', mdot: hh + lh, h: h_inj });"],
  ['the shutoff FLAG stops tracking the sourced head',
   'hhsi_shutoff: P * PSI_PER_MPA >= ECCS.hhsi_shutoff_psia,', 'hhsi_shutoff: false,'],
  ['availability no longer floored (negative avail sucks the vessel dry)',
   'Math.max(0, ec.hhsiAvail)', 'ec.hhsiAvail'],
  /* CONSTRUCTION */
  ['caller hhsiRunning ignored at construction',
   'hhsiRunning: opts.hhsiRunning === undefined ? false : !!opts.hhsiRunning,',
   'hhsiRunning: false,'],
  ['caller lhsiRunning ignored at construction',
   'lhsiRunning: opts.lhsiRunning === undefined ? false : !!opts.lhsiRunning,',
   'lhsiRunning: false,'],
  ['caller hhsiAvail ignored at construction',
   'hhsiAvail: opts.hhsiAvail === undefined ? 1 : opts.hhsiAvail,', 'hhsiAvail: 1,'],
  ['caller injected_kg ignored at construction',
   'injected_kg: opts.injected_kg === undefined ? 0 : opts.injected_kg', 'injected_kg: 0'],
  ['the default lineup becomes RUNNING instead of secured',
   'hhsiRunning: opts.hhsiRunning === undefined ? false : !!opts.hhsiRunning,',
   'hhsiRunning: opts.hhsiRunning === undefined ? true : !!opts.hhsiRunning,'],
  /* ---- THE ACCUMULATOR (#511) ---- */
  ['the accumulator loses its passivity (a blackout stops it like a pump)',
   '    if (ac && ac.valve_open && ac.water_m3 > 0) {',
   '    if (ac && ac.valve_open && powered && ac.water_m3 > 0) {'],
  ['the cover gas stops expanding (a constant-head tank — the curve, not the state)',
   '      var Pg = accPressure(ac);',
   '      var Pg = ACC.p0_mpa;'],
  ['the check valves are removed (the tank "injects" into 2235 psia)',
   '      if (Pg > P) {',
   '      if (true) {'],
  ['the inventory stops depleting (an infinite accumulator)',
   '          ac.water_m3 = Math.max(0, ac.water_m3 - acFlow * dt / rho);',
   ''],
  ['the isolation valve stops isolating',
   "      valve_open: opts.valve_open === undefined ? true : !!opts.valve_open,",
   '      valve_open: true,']
];

/* ---- THE CLEAN-RUN GUARD --------------------------------------------------------------
 * A MUTATION SELF-TEST IS ONLY MEANINGFUL IF THE UNMUTATED SUITE IS GREEN. If any check fails in
 * the clean run it fails in every mutant too, so `f2 > 0` holds unconditionally and EVERY mutation
 * is reported as caught. Coverage then reads 25/25 while the suite is measuring nothing.
 *
 * MEASURED in run_pwr2_kinetics.js, 2026-08-16: a fixture producing NaN made one check fail in the
 * clean run. The self-test reported 23/25. Fixing that ONE check dropped it to 21/25 -- the two
 * extra "caught" mutations had never been caught by anything, and both were genuinely blind.
 *
 * So the tally is REFUSED, not annotated, when the clean run is red. */
if (fail > 0) {
  /* PRINT THE SCORE FIRST. run_all parses this line to report drift; exiting without it
   * makes a legitimately-failing gate read as `score ?`, which is LESS informative than
   * before the guard existed. The guard refuses the MUTATION TALLY, not the tally line. */
  console.log('  ' + require('path').basename(__filename, '.js') + ': ' + pass +
              ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
  console.log('  MUTATION SELF-TEST SKIPPED -- ' + fail + ' check(s) failed in the CLEAN run.');
  console.log('  A failing check fails in every mutant too, so every mutation would report as');
  console.log('  caught and the coverage number would be a lie. Fix the check first.');
  process.exit(1);
}

console.log('\n' + '='.repeat(70));
console.log('  INJECTION SELF-TEST -- every mutation MUST redden at least one check');
console.log('='.repeat(70));
var blind = 0;
MUT.select(MUTATIONS).forEach(function (m) {
  if (SRC.indexOf(m[1]) === -1) { console.log('  ERROR   anchor not found: ' + m[0]); blind++; return; }
  var r2 = [];
  try { runSuite(loadFrom(SRC.split(m[1]).join(m[2])), r2, true); }
  catch (e) { r2.push({ name: 'threw', ok: false }); }
  var f2 = r2.filter(function (r) { return !r.ok; }).length;
  if (f2 === 0) { blind++; console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); }
  else console.log('  caught    ' + m[0].padEnd(58) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_eccs: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
