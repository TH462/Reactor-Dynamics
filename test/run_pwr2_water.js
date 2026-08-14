/* run_pwr2_water.js — Layer 0 gate for the PWR2 engine (#479).
 *
 * REBUILT 2026-08-14. The previous version reported 56/56 GREEN while:
 *   - asserting a claim the design spine had RETRACTED (loop transit "10-12 s", recalled
 *     and later found circular — D1 §3);
 *   - checking against FOUR reference values that were themselves wrong by more than the
 *     tolerance asserted against them, two of which were the 15.0 MPa (2176 psia) steam
 *     table row used at the plant's 15.41 MPa (2235 psia);
 *   - leaving the compressed-liquid term, the compressibility term and cp_l so untested
 *     that DELETING them, or scaling cp_l by 1.5, kept it at 56/56.
 *
 * Three structural changes follow from that, and they are the point of this file:
 *
 *   1. EVERY reference value is IAPWS-95 from the NIST Chemistry WebBook (SRD 69), fetched
 *      2026-08-14, quoted to 8 figures, AT THE PRESSURE OR TEMPERATURE NAMED. No recalled
 *      numbers. The design's own rule — "a recalled band may REJECT, but may never CONFIRM"
 *      — is now satisfied by construction, because nothing here is recalled.
 *
 *   2. OFF-NODE checks. The fits were built on a 1 degC / 0.1 MPa grid, so this gate also
 *      asserts at deliberately awkward points (137.37 degC, 4.21 MPa, 320.5 degC) that no
 *      fit ever saw. Checking a fit only where it was fitted measures residual, not error.
 *
 *   3. AN INJECTION SELF-TEST. At the end, the whole suite is re-run against deliberately
 *      broken copies of the library. **A mutation that leaves the suite green is a GATE
 *      FAILURE**, reported as "BLIND TO". This is the repo's standing "prove a check by
 *      making it go red" rule, wired in so it runs every time rather than being a thing
 *      somebody remembers to do. It is what makes a sixth could-not-fail instance
 *      structurally impossible here.
 *
 * Run: node test/run_pwr2_water.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var LIB = path.join(__dirname, '..', 'engines', 'pwr2', 'pwr2_water.js');
var SRC = fs.readFileSync(LIB, 'utf8');

/* load a (possibly mutated) copy of the library into a private root */
function loadFrom(src) {
  var root = {};
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.water;';
  return new Function('RD_ROOT', body)(root);
}

/* ---------------------------------------------------------------- IAPWS-95 REFERENCE DATA
 * NIST Chemistry WebBook, SRD 69 (Wagner & Pruss 2002 formulation), fetched 2026-08-14.
 * Saturation by pressure: [P MPa, T_sat degC, h_f kJ/kg, h_g kJ/kg, rho_g kg/m3] */
var SAT_P = [
  [0.10,  99.605929,  417.50391, 2674.9477,   0.59034398],
  [0.37, 140.81943,   592.67721, 2734.5001,   2.0099438 ],   // off-node
  [0.50, 151.83108,   640.08513, 2748.1090,   2.6680480 ],
  [1.00, 179.87801,   762.51507, 2777.1086,   5.1450408 ],
  [1.73, 205.16163,   875.61541, 2794.9133,   8.7176981 ],   // off-node
  [2.00, 212.37723,   908.49808, 2798.2926,  10.041668  ],
  [4.21, 253.40687,  1102.4098,  2799.7297,  21.179371  ],   // off-node
  [5.00, 263.94072,  1154.6415,  2794.2053,  25.351198  ],
  [7.00, 285.82881,  1267.6593,  2772.6296,  36.525089  ],
  [8.63, 300.34727,  1346.9545,  2748.9681,  46.434400  ],   // off-node
  [10.00, 310.99715, 1408.0639,  2725.4924,  55.463085  ],
  [13.07, 331.27192, 1534.2850,  2661.0114,  78.838458  ],   // off-node
  [15.41, 344.32046, 1626.3303,  2598.7963, 100.97307   ],   // THE OPERATING POINT
  [16.42, 349.45913, 1666.4834,  2567.2641, 112.29492   ],   // off-node
  [17.00, 352.29271, 1690.0260,  2547.4993, 119.46079   ]
];
/* Saturation by temperature: [T degC, h_f kJ/kg, rho_f kg/m3, cp_f kJ/kg-K] */
var SAT_T = [
  [ 20.00,   83.914145, 998.16180, 4.1836000],
  [ 37.37,  156.53994,  993.15438, 4.1794925],   // off-node
  [100.00,  419.16616,  958.34905, 4.2151000],
  [137.37,  577.88925,  928.46371, 4.2767186],   // off-node
  [150.00,  632.17944,  917.00774, 4.3097000],
  [187.37,  795.71808,  878.99535, 4.4356894],   // off-node
  [200.00,  852.27129,  864.65810, 4.4952000],
  [237.37, 1025.0173,   817.04954, 4.7484904],   // off-node
  [250.00, 1085.7675,   798.89422, 4.8654000],
  [287.37, 1275.8899,   736.86220, 5.4349765],   // off-node
  [288.00, 1279.2662,   735.68332, 5.4383000],
  [300.00, 1345.0079,   712.13564, 5.7504000],
  [321.00, 1468.4072,   664.59816, 6.5860000],
  [337.37, 1575.8716,   619.03887, 7.8851790]    // off-node
];
/* Compressed liquid, all OFF-NODE: [P MPa, T degC, h kJ/kg, rho kg/m3] */
var COMP_L = [
  [15.41, 287.37, 1270.7142, 750.96430],
  [15.41, 320.50, 1456.3092, 678.62192],
  [10.50, 180.30,  769.24812, 892.88948],
  [ 5.50, 120.70,  510.50730, 945.17896],
  [17.00, 250.25, 1087.4941, 812.72440]
];
/* Superheated vapour, all OFF-NODE: [P MPa, T degC, h kJ/kg, rho kg/m3, cp kJ/kg-K] */
var SUP_V = [
  [ 0.37, 250, 2965.4956,  1.5524319, 2.0482428],
  [ 1.73, 400, 3252.7501,  5.6988864, 2.1812107],
  [ 4.21, 500, 3443.6492, 12.196847,  2.2974795],
  [ 8.63, 650, 3757.8225, 20.926872,  2.4098246],
  [15.41, 450, 3150.4958, 55.959993,  3.3179410],
  [ 7.00, 800, 4128.4449, 14.315272,  2.4216949]
];

/* ---------------------------------------------------------------- the suite
 * Written as a function of W so it can be re-run against mutated libraries. `rec` collects
 * results; when `quiet` it prints nothing (injection passes). */
function runSuite(W, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol;
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(44) +
      'got ' + got.toFixed(3) + ' want ' + want.toFixed(3) +
      ' (d ' + d.toFixed(3) + ' tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }

  if (!quiet) console.log('\nT_sat(P)  [IAPWS-95, claim +/-0.09 degC over 0.1-22 MPa]');
  SAT_P.forEach(function (r) { ck('T_sat(' + r[0] + ' MPa)', W.T_sat(r[0]), r[1], 0.15, 'degC'); });

  if (!quiet) console.log('\nP_sat(T) round-trip  [bisection inverse of T_sat]');
  [1.0, 5.0, 10.0, 15.41].forEach(function (P) {
    ck('P_sat(T_sat(' + P + '))', W.P_sat(W.T_sat(P)), P, 1e-4, 'MPa');
  });

  if (!quiet) console.log('\nh_l_sat(T) / rho_l_sat(T)  [claims +/-0.54 kJ/kg, +/-0.42 kg/m3]');
  SAT_T.forEach(function (r) {
    ck('h_l_sat(' + r[0] + ' degC)', W.h_l_sat(r[0]), r[1], 0.8, 'kJ/kg');
    ck('rho_l_sat(' + r[0] + ' degC)', W.rho_l_sat(r[0]), r[2], 0.7, 'kg/m3');
  });

  /* cp_l -- ASSERTED, which the previous gate never did anywhere. Banded, because the
   * error is a physical divergence toward the critical point, not a fit defect. */
  if (!quiet) console.log('\ncp_l(T)  [derivative of h_l_sat; banded claim, see the source header]');
  SAT_T.forEach(function (r) {
    var band = r[0] <= 300 ? 0.04 : (r[0] <= 330 ? 0.10 : 0.25);
    ck('cp_l(' + r[0] + ' degC) rel', W.cp_l(r[0]) / r[3], 1.0, band, '(fraction)');
  });

  if (!quiet) console.log('\nh_f(P) / h_g(P) / rho_v_sat(P)  [h_g is DERIVED as h_f + h_fg]');
  SAT_P.forEach(function (r) {
    ck('h_f(' + r[0] + ' MPa)', W.h_f(r[0]), r[2], 1.5, 'kJ/kg');
    if (r[0] <= 17) ck('h_g(' + r[0] + ' MPa)', W.h_g(r[0]), r[3], 3.0, 'kJ/kg');
    if (r[0] <= 18) ck('rho_v_sat(' + r[0] + ' MPa) rel', W.rho_v_sat(r[0]) / r[4], 1.0, 0.02, '(frac)');
  });

  /* h_fg at the critical point -- the claim the previous file made and did not deliver. */
  ckT('h_fg -> 0 at the critical point (22.064 MPa)', Math.abs(W.h_fg_T(373.946)) < 1e-6,
      W.h_fg_T(373.946).toExponential(2) + ' kJ/kg (old file: 643.7)');

  if (!quiet) console.log('\nCOMPRESSED LIQUID h_l(T,P) / rho_l(T,P)  [all points OFF-NODE]');
  COMP_L.forEach(function (r) {
    ck('h_l(' + r[1] + ',' + r[0] + ')', W.h_l(r[1], r[0]), r[2], 2.5, 'kJ/kg');
    ck('rho_l(' + r[1] + ',' + r[0] + ')', W.rho_l(r[1], r[0]), r[3], 6.0, 'kg/m3');
  });
  /* The compressed-liquid correction must be present, material, AND THE RIGHT SIGN.
   * IAPWS-95 at 550 degF (288 degC) / 2235 psia: h = 1273.9927, h_f(288) = 1279.2662, so the
   * true departure is -5.27 kJ/kg. The previous library's incompressible form gave +9 and its
   * header advertised +9 as an improvement. A check that only asserted "present and material"
   * would pass on a sign error, so this asserts the VALUE. */
  var dcomp = W.h_l(288, 15.41) - W.h_l_sat(288);
  ck('compressed-liquid departure at 550 degF/2235 psia', dcomp, -5.27, 1.5, 'kJ/kg');
  ckT('...and it is NEGATIVE at operating temperature (the old form had it positive)',
      dcomp < 0, dcomp.toFixed(2) + ' kJ/kg -- incompressible v*dP would give +' +
      (1000 / W.rho_l_sat(288) * (15.41 - W.P_sat(288))).toFixed(2));
  /* The compressibility term likewise. */
  var dr = W.rho_l(288, 15.41) - W.rho_l_sat(288);
  ckT('compressibility term is present and material at 2235 psia',
      dr > 5.0 && dr < 30.0, dr.toFixed(2) + ' kg/m3 above the saturation value');
  ckT('bulk modulus at 610 degF (321 degC) is the WATER value, not the cold one',
      W.bulk_modulus(321) > 150 && W.bulk_modulus(321) < 320,
      W.bulk_modulus(321).toFixed(0) + ' MPa (IAPWS 225; the old 2200-3T gave 1237)');

  if (!quiet) console.log('\nSUPERHEATED VAPOUR  [the regime the previous library could not express]');
  SUP_V.forEach(function (r) {
    ck('h_v(' + r[1] + ' degC,' + r[0] + ' MPa)', W.h_v(r[1], r[0]), r[2], 40.0, 'kJ/kg');
    ck('cp_v(' + r[1] + ' degC,' + r[0] + ' MPa)', W.cp_v(r[1], r[0]), r[4], 0.35, 'kJ/kg-K');
    ck('rho_v(' + r[1] + ' degC,' + r[0] + ' MPa) rel', W.rho_v(r[1], r[0]) / r[3], 1.0, 0.10, '(frac)');
  });
  ckT('T_from_h ABOVE h_g returns superheat, not the critical clip',
      W.T_from_h(W.h_g(7.0) + 200, 7.0) > W.T_sat(7.0) + 20 &&
      W.T_from_h(W.h_g(7.0) + 200, 7.0) < 373.0,
      W.T_from_h(W.h_g(7.0) + 200, 7.0).toFixed(1) + ' degC, i.e. ' +
      (W.T_from_h(W.h_g(7.0) + 200, 7.0) - W.T_sat(7.0)).toFixed(1) +
      ' degC of superheat (old library: 373.95, the T_crit clip)');

  if (!quiet) console.log('\nREGIME CONTINUITY  [what the bracketed pressure solve depends on]');
  [1.0, 7.0, 15.41].forEach(function (P) {
    var hf = W.h_f(P), hg = W.h_g(P), e = 1e-6;
    ck('rho_from_h continuous at h_f (' + P + ' MPa)',
       W.rho_from_h(hf + e, P), W.rho_from_h(hf - e, P), 0.5, 'kg/m3');
    ck('rho_from_h continuous at h_g (' + P + ' MPa)',
       W.rho_from_h(hg + e, P), W.rho_from_h(hg - e, P), 0.5, 'kg/m3');
    ck('T_from_h in the two-phase region returns T_sat (' + P + ')',
       W.T_from_h(0.5 * (hf + hg), P), W.T_sat(P), 1e-6, 'degC');
    ck('quality at mid-dome (' + P + ' MPa)', W.quality(0.5 * (hf + hg), P), 0.5, 1e-6, '-');
  });
  /* Two-phase mixing must be linear in SPECIFIC VOLUME, not density (HEM). At x=0.5 the
   * two differ by a factor of ~5 at operating pressure, so this cannot pass by accident. */
  var Pm = 15.41, hm = 0.5 * (W.h_f(Pm) + W.h_g(Pm));
  var vf = 1 / W.rho_l(W.T_sat(Pm), Pm), vg = 1 / W.rho_v_sat(Pm);
  ckT('two-phase density mixes specific VOLUMES (HEM), not densities',
      Math.abs(W.rho_from_h(hm, Pm) - 1 / (0.5 * vf + 0.5 * vg)) < 0.5,
      'got ' + W.rho_from_h(hm, Pm).toFixed(2) + ', volume-mix ' + (1 / (0.5 * vf + 0.5 * vg)).toFixed(2) +
      ', density-mix would be ' + (0.5 / vf + 0.5 / vg).toFixed(2));

  /* SLOPE continuity of h_l across the saturation line. Added 2026-08-14 because this file's
   * own injection self-test reported BLIND TO "restore the h_l regime branch" — every other
   * compressed-liquid check asserts a VALUE at P > P_sat, and the defect the branch
   * reintroduces is a DERIVATIVE discontinuity, which no value check can see. The pressure
   * solver differentiates through h_l, so the slope is the property that matters. */
  if (!quiet) console.log('\nSLOPE CONTINUITY of h_l across saturation  [what the solver differentiates]');
  [150, 250, 300, 321].forEach(function (T) {
    var Ps = W.P_sat(T), e = 1e-4;
    var up = (W.h_l(T, Ps + e) - W.h_l(T, Ps)) / e;
    var dn = (W.h_l(T, Ps) - W.h_l(T, Ps - e)) / e;
    ck('dh_l/dP continuous at P_sat(' + T + ' degC)', up, dn, 1e-3, 'kJ/kg-MPa');
  });

  if (!quiet) console.log('\nrangeOK / clamping  [the honesty guard, now WIRED IN]');
  ckT('in-range accepted (288 degC, 15.41 MPa)', W.rangeOK(288, 15.41) === true);
  ckT('over-pressure rejected (288 degC, 20 MPa)', W.rangeOK(288, 20) === false);
  ckT('over-temp rejected (900 degC, 15 MPa)', W.rangeOK(900, 15) === false);
  ckT('out-of-range CLAMPS rather than extrapolating',
      Math.abs(W.h_l_sat(400) - W.h_l_sat(W.LIMITS.T_MAX)) < 1e-9 &&
      Math.abs(W.rho_l_sat(400) - W.rho_l_sat(W.LIMITS.T_MAX)) < 1e-9,
      'h_l_sat(400) = ' + W.h_l_sat(400).toFixed(1) + ' = h_l_sat(T_MAX)' +
      ' (old library extrapolated to 1828.8)');

  /* ================================================================================
   * THE ENERGY BALANCE — the check #479 exists for, and the one cross-check D1 §3 says
   * survives (topology-independent). Now asserted against the IAPWS-95 value rather than
   * a made-up target: the review found FIVE different numbers in play for this one
   * quantity and a +/-8 kJ/kg tolerance that could not separate any of them.
   * ============================================================================== */
  if (!quiet) console.log('\nENERGY BALANCE on the ruled identity  [300 MWt, 610/550 degF, 2235 psia]');
  var P_op = 15.41, T_h = 321, T_c = 288, Q_MWt = 300;
  var DH_IAPWS = 1459.4006 - 1273.9927;              // 185.408 kJ/kg, NIST isobar at 15.41 MPa
  var dh = W.h_l(T_h, P_op) - W.h_l(T_c, P_op);
  var mdot = Q_MWt * 1000 / dh;
  var rho = W.rho_l((T_h + T_c) / 2, P_op);
  var gpm = (mdot / rho) * 15850.3;
  if (!quiet) {
    console.log('    dh across core   ' + dh.toFixed(2) + ' kJ/kg  (IAPWS ' + DH_IAPWS.toFixed(2) + ')');
    console.log('    mdot             ' + mdot.toFixed(0) + ' kg/s (' + (mdot * 2.20462).toFixed(0) + ' lbm/s)');
    console.log('    volumetric       ' + gpm.toFixed(0) + ' gpm');
  }
  ck('dh(610/550 degF @2235 psia) vs IAPWS-95', dh, DH_IAPWS, 2.0, 'kJ/kg');
  ck('mdot vs the IAPWS-derived flow', mdot, Q_MWt * 1000 / DH_IAPWS, 20.0, 'kg/s');
  /* The negative control. Tightened: the previous form passed for ANY answer above
   * 30,000 gpm, so it was direction-only. */
  ckT('declared rcs_flow_gpm 24,000 is REJECTED by the energy balance',
      gpm / 24000 > 1.4 && gpm / 24000 < 1.7,
      'ratio ' + (gpm / 24000).toFixed(2) + 'x -- this SHOULD disagree (#479)');

  /* Loop transit is REPORTED, NOT ASSERTED. The "10-12 s" band the previous gate checked
   * was recalled, was RETRACTED by D1 §3, and the check it sat in was found CIRCULAR
   * (D3 §1). Reporting it keeps the number visible without a green tick certifying a
   * retracted claim. Nothing here may assert a transit band until D3 establishes one. */
  if (!quiet) {
    var V_rcs_m3 = 835.8 / 35.3147;
    console.log('    loop transit     ' + (V_rcs_m3 / (mdot / rho)).toFixed(1) +
      ' s  [REPORTED ONLY -- the 10-12 s band is RETRACTED, D1 §3; geometry unresolved, D1 §8(2)]');
  }
}

/* ---------------------------------------------------------------- run for real */
console.log('\nPWR2 Layer 0 -- water properties vs IAPWS-95 (NIST SRD 69, fetched 2026-08-14)');
var W = loadFrom(SRC), rec = [];
runSuite(W, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length;
var fail = rec.length - pass;

/* ---------------------------------------------------------------- INJECTION SELF-TEST
 * Each mutation MUST redden at least one check. One that does not is a hole in this gate,
 * and is reported as a failure OF THE GATE. Every mutation below corresponds to a defect
 * the previous version of this file could not see. */
var MUTATIONS = [
  ['delete the compressed-liquid correction',
   'return h_l_sat(T) + k_comp(T) * (P - P_sat(T));', 'return h_l_sat(T);'],
  ['revert to the WRONG-SIGN incompressible compressed-liquid form',
   'return h_l_sat(T) + k_comp(T) * (P - P_sat(T));',
   'return h_l_sat(T) + (1.0 / rho_l(T, P)) * (P - P_sat(T)) * 1000.0;'],
  ['delete the compressibility correction',
   'return rho_l_sat(T) * (1.0 + (P - P_sat(T)) / bulk_modulus(T));', 'return rho_l_sat(T);'],
  ['revert the bulk modulus to the old 2200-3T',
   'return Math.exp(poly(C_B, clip(T_c, 0.0, T_MAX)));', 'return 2200.0 - 3.0 * clip(T_c, 0, T_MAX);'],
  ['scale cp_l by 1.5',
   'function cp_l(T_c) { return poly(C_CPL, clip(T_c, 0.0, T_MAX)); }',
   'function cp_l(T_c) { return 1.5 * poly(C_CPL, clip(T_c, 0.0, T_MAX)); }'],
  ['bias T_sat by +0.5 degC',
   'function T_sat(P_MPa) { return poly(C_TSAT, Math.log(clip(P_MPa, P_MIN, P_CRIT))); }',
   'function T_sat(P_MPa) { return 0.5 + poly(C_TSAT, Math.log(clip(P_MPa, P_MIN, P_CRIT))); }'],
  ['scale h_l_sat by 1.005',
   'function h_l_sat(T_c) { return poly(C_HLSAT, clip(T_c, 0.0, T_MAX)); }',
   'function h_l_sat(T_c) { return 1.005 * poly(C_HLSAT, clip(T_c, 0.0, T_MAX)); }'],
  ['scale rho_l_sat by 1.005',
   'function rho_l_sat(T_c) { return poly(C_RLSAT, clip(T_c, 0.0, T_MAX)); }',
   'function rho_l_sat(T_c) { return 1.005 * poly(C_RLSAT, clip(T_c, 0.0, T_MAX)); }'],
  ['scale rho_v_sat by 1.05',
   'return Math.exp(poly(C_RVSAT, Math.log(clip(P_MPa, P_MIN, P_MAX))));',
   'return 1.05 * Math.exp(poly(C_RVSAT, Math.log(clip(P_MPa, P_MIN, P_MAX))));'],
  ['scale h_fg by 1.02',
   'return Math.pow(Math.max(0, 1 - (T + 273.15) / TK_CRIT), 0.38) * poly(C_HFG, T);',
   'return 1.02 * Math.pow(Math.max(0, 1 - (T + 273.15) / TK_CRIT), 0.38) * poly(C_HFG, T);'],
  ['break h_fg -> 0 at the critical point (the old file\'s actual behaviour)',
   'return Math.pow(Math.max(0, 1 - (T + 273.15) / TK_CRIT), 0.38) * poly(C_HFG, T);',
   'return poly(C_HFG, T) * 0.21;'],
  ['remove superheat -- h_v collapses to h_g (the old library)',
   'return h_g(P_MPa) + p.ci * dT + 0.5 * p.g * dT * dT +\n           (p.cs - p.ci) * p.tau * (1 - Math.exp(-dT / p.tau));',
   'return h_g(P_MPa);'],
  ['mix two-phase density LINEARLY instead of by specific volume',
   'return 1.0 / (vf + x * (vg - vf));',
   'return (1 - x) / vf + x / vg;'],
  ['restore the h_l regime branch (derivative discontinuity at saturation)',
   'return h_l_sat(T) + k_comp(T) * (P - P_sat(T));',
   'var Ps0 = P_sat(T); if (P <= Ps0) return h_l_sat(T);\n    return h_l_sat(T) + k_comp(T) * (P - Ps0);'],
  ['revert vapour density to ideal-gas scaling off the saturated point',
   'var Z = 1 - (1 - poly(C_ZS, lp)) * Math.exp(-(T - Ts) / Math.exp(poly(C_TZ, lp)));\n    return (P * 1000) / (Z * R_STEAM * (T + 273.15));',
   'return rho_v_sat(P) * (Ts + 273.15) / (T + 273.15);'],
  ['rangeOK always true', 'return (P_MPa >= P_MIN && P_MPa <= P_MAX && T_c >= T_MIN && T_c <= TV_MAX);',
   'return true;'],
  ['stop clamping -- let out-of-range extrapolate',
   'function h_l_sat(T_c) { return poly(C_HLSAT, clip(T_c, 0.0, T_MAX)); }',
   'function h_l_sat(T_c) { return poly(C_HLSAT, T_c); }']
];

console.log('\n' + '='.repeat(70));
console.log('  INJECTION SELF-TEST -- every mutation MUST redden at least one check');
console.log('  (a mutation that stays green is a hole in THIS FILE, not in the library)');
console.log('='.repeat(70));
var blind = 0;
MUTATIONS.forEach(function (m) {
  if (SRC.indexOf(m[1]) === -1) {
    console.log('  ERROR   anchor not found for: ' + m[0]);
    blind++; return;
  }
  var r2 = [];
  try { runSuite(loadFrom(SRC.split(m[1]).join(m[2])), r2, true); }
  catch (e) { r2.push({ name: 'threw', ok: false }); }
  var f2 = r2.filter(function (r) { return !r.ok; }).length;
  if (f2 === 0) { blind++; console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); }
  else console.log('  caught    ' + m[0].padEnd(58) + f2 + ' checks red');
});

/* ORDER MATTERS HERE. run_all.js scrapes the LAST score-shaped line as this runner's score,
 * so the check tally must come last — with the self-test line above it, the recorded score
 * became "17/17" (the mutation count) and the 164-check tally stopped being tracked at all.
 * Blind spots are still gated: they force exit 1, and BASELINES pins `code: 0`. */
console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_water: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
