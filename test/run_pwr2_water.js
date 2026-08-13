/* run_pwr2_water.js — Layer 0 gate for the PWR2 engine (#479).
 *
 * Asserts the water-property correlations against PUBLISHED STEAM-TABLE VALUES, not
 * against themselves. This is the HR10 distinction that matters: a test written from a
 * fit's own output can only confirm the fit, including the wrong parts. Every reference
 * value below is an external steam-table figure, and every tolerance is the accuracy the
 * source file CLAIMS in its own comments -- so if a correlation is loosened, this gate
 * reddens until the claim is corrected too.
 *
 * Run: node test/run_pwr2_water.js
 */
'use strict';
require('../engines/pwr2/pwr2_water.js');
var W = globalThis.RD.pwr2.water;

var pass = 0, fail = 0;
function check(name, got, want, tol, unit) {
  var d = Math.abs(got - want), ok = d <= tol;
  if (ok) pass++; else fail++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(46) +
    'got ' + got.toFixed(2) + ' want ' + want.toFixed(2) +
    ' (d ' + d.toFixed(2) + ' tol ' + tol + ') ' + (unit || ''));
}
function checkTrue(name, cond, note) {
  if (cond) pass++; else fail++;
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
}

console.log('\nPWR2 Layer 0 -- water properties vs published steam tables\n');

/* ---- saturation temperature. Reference: standard steam tables. Claim: +/-0.6 degC ---- */
console.log('T_sat(P)  [claim +/-0.6 degC over 0.1-17 MPa]');
[[0.1, 99.61], [0.5, 151.83], [1.0, 179.88], [2.0, 212.38], [5.0, 263.94],
 [7.0, 285.83], [10.0, 311.00], [15.41, 343.4], [17.0, 352.29]
].forEach(function (r) { check('T_sat(' + r[0] + ' MPa)', W.T_sat(r[0]), r[1], 0.6, 'degC'); });

/* ---- P_sat is the Newton inverse of T_sat: assert round-trip, not a second fit ---- */
console.log('\nP_sat(T) round-trip  [inverse of T_sat by construction]');
[1.0, 5.0, 10.0, 15.41].forEach(function (P) {
  check('P_sat(T_sat(' + P + '))', W.P_sat(W.T_sat(P)), P, 1e-4, 'MPa');
});

/* ---- saturated-liquid enthalpy. Claim: +/-5 kJ/kg ---- */
console.log('\nh_l_sat(T)  [claim +/-5 kJ/kg over 20-343 degC]');
[[20, 83.9], [100, 419.1], [150, 632.2], [200, 852.4], [250, 1085.8],
 [288, 1276.7], [300, 1345.0], [321, 1461.2], [343.4, 1610.0]
].forEach(function (r) { check('h_l_sat(' + r[0] + ' degC)', W.h_l_sat(r[0]), r[1], 5.0, 'kJ/kg'); });

/* ---- saturated-liquid density. Claim: +/-4 kg/m3 ---- */
console.log('\nrho_l_sat(T)  [claim +/-4 kg/m3 over 20-343 degC]');
[[20, 998.2], [100, 958.4], [200, 864.7], [288, 738.0], [300, 712.2], [321, 664.0]
].forEach(function (r) { check('rho_l_sat(' + r[0] + ' degC)', W.rho_l_sat(r[0]), r[1], 4.0, 'kg/m3'); });

/* ---- saturated-vapour enthalpy. Claim: +/-25 kJ/kg ---- */
console.log('\nh_v(P)  [claim +/-25 kJ/kg over 0.1-17 MPa]');
[[0.1, 2675.0], [1.0, 2777.1], [5.0, 2794.2], [7.0, 2772.6], [10.0, 2724.7], [15.41, 2596.0]
].forEach(function (r) { check('h_v(' + r[0] + ' MPa)', W.h_v(r[0]), r[1], 25.0, 'kJ/kg'); });

/* ---- latent heat: DERIVED (h_v - h_l_sat), so this tests the pair's consistency ---- */
console.log('\nh_fg(P)  [derived = h_v - h_l_sat; tol = the two claims summed]');
[[0.1, 2257.5], [1.0, 2014.6], [5.0, 1639.7], [10.0, 1317.7], [15.41, 985.0]
].forEach(function (r) { check('h_fg(' + r[0] + ' MPa)', W.h_fg(r[0]), r[1], 30.0, 'kJ/kg'); });

/* ---- saturated-vapour density. Claim: +/-2% ---- */
console.log('\nrho_v(P)  [claim +/-2%]');
[[0.1, 0.590], [1.0, 5.145], [5.0, 25.35], [10.0, 55.46], [15.41, 96.7]
].forEach(function (r) { check('rho_v(' + r[0] + ' MPa)', W.rho_v(r[0]), r[1], r[1] * 0.02, 'kg/m3'); });

/* ---- T_from_h is the Newton inverse of h_l: round-trip ---- */
console.log('\nT_from_h round-trip  [inverse of h_l by construction]');
[[288, 15.41], [321, 15.41], [100, 1.0], [250, 5.0]].forEach(function (r) {
  check('T_from_h(h_l(' + r[0] + ',' + r[1] + '),' + r[1] + ')',
    W.T_from_h(W.h_l(r[0], r[1]), r[1]), r[0], 0.05, 'degC');
});

/* ================================================================================
 * THE ONE THAT MATTERS -- the check the old engine cannot make in any form.
 *
 * The plant's RULED identity says: 300 MWt, hot leg 321 degC, cold leg 288 degC, at
 * 15.41 MPa. Those four numbers over-determine the primary mass flow. If the property
 * library is right, Q = m*dh must reproduce a flow whose loop transit time lands in the
 * real-PWR band -- and it must NOT reproduce the plant's declared rcs_flow_gpm: 24000,
 * which was measured 1.51x low on 2026-08-13 (#479).
 *
 * This assertion is deliberately written so that "the old declared flow" FAILS it. That
 * is the point: it is the defect made detectable, per Blueprint/PWR2_ARCHITECTURE.md.
 * ============================================================================== */
console.log('\nENERGY BALANCE on the ruled identity  [the check #479 exists for]');
var P_op = 15.41, T_h = 321, T_c = 288, Q_MWt = 300;
var dh = W.h_l(T_h, P_op) - W.h_l(T_c, P_op);
var mdot = Q_MWt * 1000 / dh;                       // kg/s
var rho = W.rho_l((T_h + T_c) / 2, P_op);
var gpm = (mdot / rho) * 15850.3;

console.log('    dh across core   ' + dh.toFixed(1) + ' kJ/kg');
console.log('    mdot             ' + mdot.toFixed(0) + ' kg/s');
console.log('    volumetric       ' + gpm.toFixed(0) + ' gpm');

check('dh(321,288 @15.41MPa)', dh, 183.0, 8.0, 'kJ/kg');
checkTrue('mdot in plausible band (1400-1800 kg/s)', mdot > 1400 && mdot < 1800,
  mdot.toFixed(0) + ' kg/s');

// Loop transit against the DERIVED RCS volume (Blueprint/PWR_DESIGN_BASIS.md sec 7).
var V_rcs_ft3 = 834.4, V_rcs_m3 = V_rcs_ft3 / 35.3147;
var transit = V_rcs_m3 / (mdot / rho);
console.log('    loop transit     ' + transit.toFixed(1) + ' s  (derived RCS 834 ft3)');
checkTrue('loop transit in real-PWR band (10-12 s)', transit >= 10 && transit <= 12,
  transit.toFixed(1) + ' s');

// The negative control. If this ever PASSES, the property library has drifted far enough
// to bless the very error #479 was filed over.
var gpm_declared = 24000;
var ratio = gpm / gpm_declared;
console.log('    vs declared rcs_flow_gpm 24000: ' + ratio.toFixed(2) + 'x');
checkTrue('declared 24,000 gpm is REJECTED by the energy balance', ratio > 1.25,
  'ratio ' + ratio.toFixed(2) + 'x -- this SHOULD disagree (#479)');

/* ---- range guard ---- */
console.log('\nrangeOK guard');
checkTrue('in-range accepted  (288 degC, 15.41 MPa)', W.rangeOK(288, 15.41) === true);
checkTrue('over-pressure rejected (288 degC, 20 MPa)', W.rangeOK(288, 20) === false);
checkTrue('over-temp rejected     (400 degC, 15 MPa)', W.rangeOK(400, 15) === false);
checkTrue('finite outside range (no divergent extrapolation)',
  isFinite(W.T_sat(25)) && isFinite(W.h_l_sat(400)) && isFinite(W.rho_v(21)));

console.log('\n' + '='.repeat(64));
console.log('  run_pwr2_water: ' + pass + ' passed, ' + fail + ' failed  (' +
  (pass + fail) + ' checks)');
console.log('='.repeat(64) + '\n');
process.exit(fail > 0 ? 1 : 0);
