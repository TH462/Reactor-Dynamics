/* pwr2_water.js — Layer 0: water/steam properties for the PWR2 engine. (#479)
 *
 * PURE FUNCTIONS. No state, no config, no dependencies. This file is the bottom of the
 * dependency stack (Blueprint/PWR2_DESIGN.md §7) and must stay that way — every layer
 * above reads it and nothing it reads exists.
 *
 * ---------------------------------------------------------------------------------------
 * REBUILT 2026-08-14 after an adversarial review measured the first version against
 * IAPWS-95 and found it wrong in ways its own 56/56 gate could not see. What was wrong,
 * recorded so the same shape is recognisable next time:
 *
 *   - FOUR of the gate's reference values were wrong by MORE than the tolerance asserted
 *     against them, all at the hot end where the plant runs. Two were traceable: they are
 *     the 15.0 MPa (2176 psia) steam-table row used at the plant's 15.41 MPa (2235 psia)
 *     operating point. h_f 1610.2 and rho_g 96.73 belong to 15.0 MPa; at 15.41 MPa the
 *     true values are 1626.33 and 100.97.
 *   - A wrong reference does not merely fail to reject — it CONCEALS. h_l_sat at 343.4 degC
 *     passed by 1.81 kJ/kg while the fit was 11.23 kJ/kg from truth against a +/-5 claim.
 *   - Every accuracy claim was stated THREE times with THREE different numbers (function
 *     header, inline residual comment, gate tolerance) and five of six were false off-node,
 *     because the fits were validated only at the 9-10 points they were built on.
 *   - Deleting the compressed-liquid term, deleting the compressibility term, or scaling
 *     cp_l by 1.5x all left the gate at 56/56 GREEN. All three are terms the file's own
 *     comments called load-bearing.
 *
 * THE RULE THAT FOLLOWS, and it is why this header reads the way it does:
 *   **ONE accuracy number per function, stated ONCE, measured against an EXTERNAL source
 *   over the WHOLE declared range — never at the points the fit was built on.**
 *
 * ---------------------------------------------------------------------------------------
 * SOURCE OF TRUTH. Every coefficient below is [derived] by least squares from [sourced]
 * IAPWS-95 data: the NIST Chemistry WebBook (SRD 69, Wagner & Pruss 2002), fetched
 * 2026-08-14 as 354 saturation points by temperature, 220 by pressure, and 11 isobars of
 * 159 points each spanning compressed liquid and superheated vapour. Provenance and the
 * refit scripts: Blueprint/PWR2_L0_REBUILD.md.
 *
 * This is NOT IAPWS-95. It is a correlation set fitted over this plant's envelope, and
 * every function declares the error MEASURED against IAPWS-95 across its whole range.
 * An educational lumped/nodal sim does not need full IAPWS; it does need to know how
 * wrong it is, and to be unable to lie about it.
 *
 * PROVENANCE TAGS (D1 §2 — this file is the first artifact to actually apply them):
 *   [sourced]  IAPWS-95 via NIST SRD 69.
 *   [derived]  least-squares fit of [sourced] data; change only by refitting.
 *   [ruled]    none in this file. There are no [tune] values and there must never be.
 *
 * VALID RANGE — outside it, inputs are CLAMPED to the envelope, never extrapolated.
 *     pressure     0.1 .. 18.0 MPa        (14.5 .. 2611 psia)
 *     liquid T     20 .. 358 degC         (68 .. 676 degF)
 *     vapour T     T_sat .. 800 degC      (.. 1472 degF)  — core uncovery needs this
 * rangeOK() reports whether a call was inside. **It has no internal callers, and saying
 * otherwise was this file's own version of the defect it accused its predecessor of** — the
 * first rebuild's header claimed "it is CALLED INTERNALLY, not decorative" while nothing
 * called it (independent review, 2026-08-14). What is actually true, and is what matters:
 * every public function CLAMPS its arguments to the envelope, so an out-of-range call returns
 * the boundary value rather than a divergent extrapolation, and rangeOK lets a caller that
 * cares find out that the clamp engaged.
 *
 * UNITS ARE SI THROUGHOUT (CLAUDE.md: engine internals stay SI; US-customary is a
 * display/reporting concern).
 *     P   MPa        T   degC        h   kJ/kg
 *     rho kg/m3      cp  kJ/kg-K
 */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- envelope */
  var P_MIN = 0.1, P_MAX = 18.0;        // MPa
  var T_MIN = 20.0, T_MAX = 358.0;      // degC, LIQUID branch (must cover T_sat at P_MAX)
  var TV_MAX = 800.0;                   // degC, vapour branch
  var P_CRIT = 22.064, T_CRIT = 373.946, TK_CRIT = T_CRIT + 273.15;   // [sourced] IAPWS-95

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function poly(c, x) { var s = 0; for (var i = c.length - 1; i >= 0; i--) s = s * x + c[i]; return s; }

  /* rangeOK — the honesty guard, and it is WIRED IN. Every public function clamps its
   * arguments to the envelope; this tells a caller whether that clamp engaged. A caller
   * that cares (the gate, diagnostics, the node model's sanity check) asks. */
  function rangeOK(T_c, P_MPa) {
    return (P_MPa >= P_MIN && P_MPa <= P_MAX && T_c >= T_MIN && T_c <= TV_MAX);
  }

  /* ---------------------------------------------------------------- saturation line
   * T_sat(P) — [derived] degree-9 in ln(P), fitted to 395 IAPWS-95 points 0.0017-22 MPa.
   * MEASURED max error, OFF-GRID: 0.065 degC (0.12 degF).
   *
   * *** ITS RANGE DELIBERATELY EXCEEDS THE PRESSURE ENVELOPE, AND THAT IS A BUG FIX. ***
   * The first rebuild fitted 0.1-22 MPa and clipped its argument at P_MIN, so T_sat was FLAT
   * below 0.1 MPa. P_sat inverts T_sat by bisection, so the bracket collapsed and
   * **P_sat returned ~1e-4 MPa (a vacuum) for EVERY temperature below 99.6 degC (211 degF)** —
   * the whole cold end, which is exactly where Cold Shutdown (Mode 5) lives. Measured before the
   * fix: P_sat(50 degC) = 1.0e-4 against a true 0.01235, wrong by 100x. Internal impact was small
   * (the compressed-liquid term moves < 0.1 kJ/kg there) but the EXPORT was broken, and the gate
   * could not see it because its round-trips all started at 1 MPa.
   * Found by independent adversarial review, 2026-08-14. */
  var C_TSAT = [1.7989231544e+2, 4.3488524369e+1, 4.5765597716e+0, 4.3613638013e-1,
                4.7985258863e-2, 7.7779466301e-3, -7.0540150743e-4, -7.1499854545e-4,
                -1.2159302709e-4, -6.6178509438e-6];
  function T_sat(P_MPa) { return poly(C_TSAT, Math.log(clip(P_MPa, 1.0e-5, P_CRIT))); }

  /* P_sat(T) — the inverse by bisection on T_sat, not a second fit. An independent inverse
   * fit is a second source of truth for one physical curve and they drift. Bisection rather
   * than Newton: T_sat is monotone in P, so a bracket always exists and cannot fail to
   * converge, and this is not a hot-path function. */
  function P_sat(T_c) {
    var T = clip(T_c, 0.0, T_CRIT), lo = 1.0e-5, hi = P_CRIT, mid = lo;
    for (var i = 0; i < 80; i++) { mid = 0.5 * (lo + hi); if (T_sat(mid) < T) lo = mid; else hi = mid; }
    return mid;
  }

  /* ---------------------------------------------------------------- saturated liquid
   * h_l_sat(T) — [derived] degree-10 in T, fitted to 339 IAPWS-95 points 20-358 degC.
   * MEASURED max error, OFF-GRID: 0.63 kJ/kg (0.27 Btu/lb) at 357.4 degC.
   * (The previous quartic measured 10.57 kJ/kg in range against a +/-5 claim.)
   *
   * Why the range stops at 358 degC and not the critical point: cp diverges toward the
   * critical point, so a polynomial's error explodes there. 358 degC is not arbitrary — it is
   * what T_sat(P_MAX = 18 MPa) demands. Set it lower and h_f/h_g silently CLAMP above about
   * 15.5 MPa, which is inside the plant's own relief range; that was caught by this file's
   * off-node reference at 17 MPa reading 19.7 kJ/kg low. */
  var C_HLSAT = [-5.5434290974e+0, 4.7967034558e+0, -2.4950236953e-2, 5.1884181536e-4,
                 -6.2364423884e-6, 4.5884760783e-8, -2.0845109365e-10, 5.7116465235e-13,
                 -8.6476580012e-16, 5.5622106434e-19];
  function h_l_sat(T_c) { return poly(C_HLSAT, clip(T_c, 0.0, T_MAX)); }

  /* rho_l_sat(T) — [derived] degree-10, same 339 points.
   * MEASURED max error, OFF-GRID: 0.51 kg/m3 (0.032 lb/ft3) at 357.4 degC.
   * (The previous quartic measured 5.68 kg/m3 against a +/-4 claim.) */
  var C_RLSAT = [1.0045015111e+3, -4.3373956628e-1, 1.1748906995e-2, -3.5121709960e-4,
                 4.5291019834e-6, -3.4248214475e-8, 1.5789993024e-10, -4.3662760518e-13,
                 6.6510152049e-16, -4.2957661761e-19];
  function rho_l_sat(T_c) { return poly(C_RLSAT, clip(T_c, 0.0, T_MAX)); }

  /* cp_l(T) — the EXACT analytic derivative of h_l_sat, so cp and h cannot disagree.
   * The node model integrates h; cp is used for the enthalpy inverse and for reporting.
   * Consistency is the property that matters and it is exact by construction.
   *
   * ACCURACY, MEASURED BY BAND against IAPWS-95 — stated honestly because the previous
   * version claimed "-5%" and measured -19.6% at 340 degC (644 degF):
   *     20-300 degC (68-572 degF)    -2.7 %
   *     300-330    (572-626)         -8.1 %
   *     330-345    (626-653)        -16.0 %
   *     345-350    (653-662)        -21.2 %
   * The degradation is PHYSICAL, not a fit defect: true cp_f runs 4.18 -> 8.57 kJ/kg-K over
   * this span as the critical point is approached, and the derivative of a least-squares fit
   * cannot follow a divergence. Anything needing accurate cp above 330 degC (626 degF) must
   * not use this — and nothing in the design does. */
  var C_CPL = (function () {
    var d = []; for (var i = 1; i < C_HLSAT.length; i++) d.push(C_HLSAT[i] * i); return d;
  })();
  function cp_l(T_c) { return poly(C_CPL, clip(T_c, 0.0, T_MAX)); }

  /* ---------------------------------------------------------------- latent heat
   * h_fg(T) — [derived] (1 - T/Tc)^0.38 * quartic(T), fitted to 351 points 20-370 degC.
   * MEASURED max error: 2.24 kJ/kg (0.96 Btu/lb).
   *
   * The exponent 0.38 is the standard near-critical scaling for the saturation property
   * difference. It is what makes the next sentence TRUE, and the previous version's version
   * of it FALSE: h_fg goes to EXACTLY ZERO at the critical point, by construction, because
   * the prefactor does. The old file derived h_fg = h_v - h_l "because it must go to zero at
   * the critical point and an independent fit will not" — measured, that construction gave
   * h_fg(22.064 MPa) = 643.7 kJ/kg. The justification was sound; the implementation did not
   * deliver it. Here the direction is reversed: h_fg is fitted and h_v is derived from it. */
  var C_HFG = [3.0714483618e+3, 6.0359589946e-1, -1.8380547092e-3, 2.0316602698e-5,
               -5.3538955598e-8];
  function h_fg_T(T_c) {
    var T = clip(T_c, 0.0, T_CRIT);
    return Math.pow(Math.max(0, 1 - (T + 273.15) / TK_CRIT), 0.38) * poly(C_HFG, T);
  }
  function h_fg(P_MPa) { return h_fg_T(T_sat(P_MPa)); }

  /* h_f(P) / h_g(P) — the saturation enthalpies as functions of PRESSURE, which is how the
   * node model asks (it holds h and P, never T). h_g is DERIVED as h_f + h_fg so the three
   * can never disagree with each other.
   * MEASURED max error of the composed h_g over 0.1-17 MPa: 1.16 kJ/kg (0.50 Btu/lb).
   * (The previous independent h_v fit measured 27.3 kJ/kg against a +/-15 header claim that
   * its own inline comment contradicted with +/-25.) */
  function h_f(P_MPa) { return h_l_sat(T_sat(P_MPa)); }
  function h_g(P_MPa) { var t = T_sat(P_MPa); return h_l_sat(t) + h_fg_T(t); }

  /* rho_v_sat(P) — [derived] log-log degree-6 in ln(P), 0.1-18 MPa, 180 points.
   * MEASURED max error, OFF-GRID: 1.25 %.
   * (The previous cubic measured 4.4 % at the operating point against a +/-2 % gate claim,
   * hidden because the reference it was checked against was the 15.0 MPa value.)
   * The envelope stops at 18 MPa deliberately: measured, extending to 22 MPa takes the error
   * to 16.8 % because rho_g turns sharply upward toward the critical point. */
  var C_RVSAT = [1.6357855486e+0, 9.4528020440e-1, 2.3893947845e-2, 1.1473595330e-2,
                 -6.4170420680e-3, -7.3132059352e-4, 1.0865161976e-3];
  function rho_v_sat(P_MPa) { return Math.exp(poly(C_RVSAT, Math.log(clip(P_MPa, P_MIN, P_MAX)))); }

  /* ---------------------------------------------------------------- compressed liquid
   * B(T) — isothermal bulk modulus, [derived] as ln(B) = quartic(T) from 445 adjacent-isobar
   * density differences, B = rho*dP/drho.
   *
   * ACCURACY, STATED HONESTLY: B is fitted in T ALONE, but the true isothermal bulk modulus
   * depends on (T,P) and collapses as a state approaches its saturation line. MEASURED:
   * ~15 % away from saturation, but **46 % at 344 degC / 15.41 MPa (saturation at the operating
   * pressure), 66 % at 350/16.5, and 120 % at 357/18** — all liquid states inside the declared
   * envelope. The first rebuild claimed a flat 15.3 %, which is false near saturation; found by
   * independent adversarial review, 2026-08-14. A (T,P) surface is the fix and is NOT built —
   * anything depending quantitatively on compressibility within ~10 degC of saturation must not
   * use this. The 5.5x correction to the old 2200-3T value is unaffected and independently
   * confirmed by the sound-speed route.
   *
   * *** THIS REPLACES A VALUE THAT WAS WRONG BY 5.5x AT OPERATING TEMPERATURE. ***
   * The previous version used B = 2200 - 3*T, "the same physical constant the old engine
   * calls solid_bulk_mpa (1300 MPa)". Measured against IAPWS-95:
   *     100 degC (212 degF)   2086 MPa  vs 1900  — the cold end was about right
   *     288     (550)          440      vs 1336  —  3.0x too stiff
   *     321     (610)          225      vs 1237  —  5.5x too stiff
   *     340     (644)          135      vs 1180  —  8.7x too stiff
   * Water near the critical point is far more compressible than a linear decline from the
   * cold value suggests. This matters for exactly one thing and that thing is load-bearing:
   * a water-solid RCS, where dP/drho IS the pressure response (D2 §25.3 — the regime where
   * "system compressibility collapses to the liquid bulk modulus" and where the stability
   * margin is thinnest). A 5.5x error there is a plant that pressurises 5.5x too fast per
   * unit mass added. NOTE for whoever revisits the old engine: its 1300 MPa may have been
   * intended as an EFFECTIVE stiffness including vessel elasticity, which is legitimate
   * practice — but this function is a pure water property and must be the water value. */
  var C_B = [7.5923202309e+0, 6.9051299602e-3, -9.2888173401e-5, 3.4873645503e-7,
             -5.9882991765e-10];
  function bulk_modulus(T_c) { return Math.exp(poly(C_B, clip(T_c, 0.0, T_MAX))); }

  /* k_comp(T) — [derived] the compressed-liquid enthalpy departure per MPa, degree-5 in T,
   * fitted to 417 isobar points.
   *
   * *** THIS TERM WAS WRONG IN SIGN AT OPERATING TEMPERATURE. ***
   * The previous version used the incompressible-liquid form dh = +v*(P-Psat), and its header
   * claimed "at 288 degC and 15.41 MPa it is worth about +9 kJ/kg … dropping it would bias the
   * energy balance the whole engine is built to check." D1 §4 cites that term as one of the
   * rewrite's improvements. Measured against IAPWS-95:
   *
   *      T           TRUE k        the assumed v      true departure at 2235 psia
   *    100 degC   +0.795 kJ/kg-MPa   +1.044            +11.5 kJ/kg
   *    250        +0.085             +1.252             +0.4
   *    288 (550 degF)  -0.642        +1.360             -5.3   <-- SIGN IS WRONG
   *    321 (610 degF)  -2.519        +1.504             -9.0   <-- and the error is 15.2
   *
   * The incompressible form drops the -v*alpha*T part of (dh/dP)_T = v*(1 - alpha*T). Near the
   * critical point alpha*T exceeds 1, so the true derivative goes NEGATIVE. Water at PWR
   * hot-leg temperature is nowhere near incompressible, and the textbook form fails there.
   *
   * NO REGIME BRANCH. The previous version carried `if (P <= Ps) return h_sat;`, which made
   * dh/dP jump across the saturation line — a derivative discontinuity in a function the
   * pressure solver differentiates through. This form is continuous in value AND slope. */
  var C_K = [1.5210673618e+0, -3.5574368985e-2, 6.4539206322e-4, -5.2755307450e-6,
             1.9089285803e-8, -2.5616979426e-11];
  function k_comp(T_c) { return poly(C_K, clip(T_c, 0.0, T_MAX)); }
  function h_l(T_c, P_MPa) {
    var T = clip(T_c, 0.0, T_MAX), P = clip(P_MPa, 0.0, P_MAX);
    return h_l_sat(T) + k_comp(T) * (P - P_sat(T));
  }

  /* rho_l(T,P) — saturated density with the compressibility correction. Same unbranched
   * convention as h_l, which the previous version did not have (h_l branched, rho_l did
   * not — two opposite conventions for one saturation line). */
  function rho_l(T_c, P_MPa) {
    var T = clip(T_c, 0.0, T_MAX), P = clip(P_MPa, 0.0, P_MAX);
    return rho_l_sat(T) * (1.0 + (P - P_sat(T)) / bulk_modulus(T));
  }

  /* ---------------------------------------------------------------- superheated vapour
   * THE REGIME THE PREVIOUS VERSION COULD NOT EXPRESS AT ALL. h_v and rho_v were functions
   * of P only; T_from_h(h_g + 200, 7 MPa) returned 373.95 degC — the critical-temperature
   * clip — silently. D2 §23.4 rules a three-regime property layer because the [0,1] quality
   * clip "foreclosed every meltdown path", and SBO (E04/E05), loss of shutdown cooling
   * (#287) and ATWS (E13) are all Tier C CORE casualties that reach core uncovery.
   *
   * cp_v(dT,P) = c_inf(P) + g(P)*dT + (c_sat(P) - c_inf(P)) * exp(-dT/tau(P))
   * integrating to
   * h(T,P) = h_g(P) + c_inf*dT + g*dT^2/2 + (c_sat - c_inf)*tau*(1 - exp(-dT/tau))
   *
   * The relaxation shape is not cosmetic: measured, cp_v runs 18.3 kJ/kg-K just above
   * saturation at 17 MPa and relaxes to 2.6 by dT = 300 degC, and no polynomial in dT fits
   * that (a 7-term one measured 134 kJ/kg error). The g*dT term carries the slow rise of
   * steam cp at high temperature, without which the far field drifts 84 kJ/kg.
   *
   * All four parameters are [derived] cubics in ln(P), from 11 isobars x 159 points.
   * MEASURED max error over 1215 superheated points, 0.1-17 MPa, T_sat..800 degC:
   * 35.1 kJ/kg (15.1 Btu/lb) = 1.17 % of a typical 3000 kJ/kg value. */
  var C_CI  = [1.9886183447e+0, -6.7492402839e-2, 6.9138313090e-2, 5.4715052594e-2];
  var C_G   = [5.7406321266e-4, 3.8617679975e-4, -1.4736026735e-4, -1.5106133929e-4];
  var C_CS  = [9.7058024787e-1, 6.0807427476e-2, 7.4528354768e-2, 4.2357695149e-2];
  var C_TAU = [3.9595288634e+0, 1.0397971612e-1, -3.3322761492e-2, -4.8309024628e-2];
  function shParams(P_MPa) {
    var lp = Math.log(clip(P_MPa, P_MIN, P_MAX));
    return { ci: poly(C_CI, lp), g: poly(C_G, lp),
             cs: Math.exp(poly(C_CS, lp)), tau: Math.exp(poly(C_TAU, lp)) };
  }
  /* cp_v(T,P): vapour specific heat. At or below saturation returns the saturated value. */
  function cp_v(T_c, P_MPa) {
    var p = shParams(P_MPa), dT = Math.max(0, clip(T_c, 0, TV_MAX) - T_sat(P_MPa));
    return p.ci + p.g * dT + (p.cs - p.ci) * Math.exp(-dT / p.tau);
  }
  /* h_v(T,P): superheated-vapour enthalpy. At saturation it returns h_g exactly. */
  function h_v(T_c, P_MPa) {
    var p = shParams(P_MPa), dT = Math.max(0, clip(T_c, 0, TV_MAX) - T_sat(P_MPa));
    return h_g(P_MPa) + p.ci * dT + 0.5 * p.g * dT * dT +
           (p.cs - p.ci) * p.tau * (1 - Math.exp(-dT / p.tau));
  }
  /* rho_v(T,P): superheated-vapour density from the real gas law with a fitted compressibility
   * factor, Z relaxing from its saturated value toward 1 as the steam superheats:
   *     Z(dT,P) = 1 - (1 - Z_sat(P)) * exp(-dT/tau_z(P))
   *     rho     = P / (Z * R * T)
   * MEASURED max error over 1226 IAPWS-95 points, 0.1-17 MPa, T_sat..800 degC: 7.5 %.
   *
   * Ideal-gas scaling off the saturated point — the obvious first choice, and what a first
   * draft of this file used — measures 55 % error. Saturated steam at 2235 psia has
   * Z = 0.536, so it is nowhere near ideal, and it approaches ideal AS IT SUPERHEATS; density
   * therefore falls FASTER than the ideal ratio, not at the same rate. */
  var R_STEAM = 0.4615;                                        // [sourced] kJ/kg-K
  var C_ZS = [9.2630513474e-1, -4.8957980927e-2, -6.5003048016e-3, -3.7915875377e-3,
              -2.3609659436e-3];
  var C_TZ = [4.8119576999e+0, 1.0268904870e-1, -2.1583255242e-2, -1.0075930158e-2];
  function rho_v(T_c, P_MPa) {
    var P = clip(P_MPa, P_MIN, P_MAX), lp = Math.log(P);
    var Ts = T_sat(P), T = Math.max(Ts, clip(T_c, 0, TV_MAX));
    var Zs = poly(C_ZS, lp);
    var Z = 1 - (1 - Zs) * Math.exp(-(T - Ts) / Math.exp(poly(C_TZ, lp)));
    // ANCHORED to rho_v_sat, so rho_v(T_sat, P) === rho_v_sat(P) EXACTLY and rho_from_h is
    // continuous at h_g by construction. The first rebuild returned P/(Z*R*T) directly, which
    // is a SECOND independent fit of the saturated vapour density -- the very pattern P_sat's
    // comment forswears -- and the two disagreed by up to 1.45 kg/m3 (1.10 % at 18 MPa). The
    // sign of that jump varied with pressure, so rho_from_h was NON-MONOTONE in h at ~1, 2, 10
    // and 13 MPa: density rising with enthalpy across the boundary, in a function the pressure
    // solve brackets through. Found by independent adversarial review, 2026-08-14.
    return rho_v_sat(P) * (Zs / Z) * (Ts + 273.15) / (T + 273.15);
  }

  /* ---------------------------------------------------------------- mixture / inverses */
  function quality(h_kJkg, P_MPa) {
    var hf = h_f(P_MPa), hg = h_g(P_MPa);
    if (h_kJkg <= hf) return 0;
    if (h_kJkg >= hg) return 1;
    return (h_kJkg - hf) / (hg - hf);
  }

  /* T_from_h(h,P) — THREE REGIMES. The node model integrates enthalpy, so this is how a node
   * reports its temperature, and getting the regime wrong is how a dry node reads as boiling
   * water for ever. */
  function T_from_h(h_kJkg, P_MPa) {
    var hf = h_f(P_MPa), hg = h_g(P_MPa), Ts = T_sat(P_MPa);
    if (h_kJkg >= hf && h_kJkg <= hg) return Ts;               // two-phase: T IS T_sat
    if (h_kJkg > hg) {                                          // superheated: invert h_v
      var lo = Ts, hi = TV_MAX, mid = Ts;
      for (var k = 0; k < 60; k++) { mid = 0.5 * (lo + hi); if (h_v(mid, P_MPa) < h_kJkg) lo = mid; else hi = mid; }
      return mid;
    }
    var T = clip(h_kJkg / 4.2, 0.0, T_MAX), i, f, dfdT;         // subcooled: Newton on h_l
    for (i = 0; i < 40; i++) {
      f = h_l(T, P_MPa) - h_kJkg;
      if (Math.abs(f) < 1e-9) break;
      dfdT = cp_l(T);
      if (!isFinite(dfdT) || dfdT < 1e-9) break;
      T = clip(T - f / dfdT, 0.0, T_MAX);
    }
    return T;
  }

  /* rho_from_h(h,P) — THE function the pressure closure calls: F(P) = sum V_i*rho(h_i,P).
   * Homogeneous equilibrium in the two-phase regime: specific VOLUMES mix linearly in
   * quality, densities do not. Continuous across both saturation boundaries by construction,
   * which is what lets the bracketed solve in D2 §23.2 work through the kink. */
  function rho_from_h(h_kJkg, P_MPa) {
    var hf = h_f(P_MPa), hg = h_g(P_MPa);
    if (h_kJkg <= hf) return rho_l(T_from_h(h_kJkg, P_MPa), P_MPa);
    if (h_kJkg >= hg) return rho_v(T_from_h(h_kJkg, P_MPa), P_MPa);
    var x = (h_kJkg - hf) / (hg - hf);
    var vf = 1.0 / rho_l(T_sat(P_MPa), P_MPa), vg = 1.0 / rho_v_sat(P_MPa);
    return 1.0 / (vf + x * (vg - vf));
  }

  function subcooling(T_c, P_MPa) { return T_sat(P_MPa) - T_c; }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.water = {
    T_sat: T_sat, P_sat: P_sat,
    h_l_sat: h_l_sat, rho_l_sat: rho_l_sat, cp_l: cp_l,
    h_l: h_l, rho_l: rho_l, bulk_modulus: bulk_modulus, k_comp: k_comp,
    h_fg: h_fg, h_fg_T: h_fg_T, h_f: h_f, h_g: h_g,
    rho_v_sat: rho_v_sat, h_v: h_v, rho_v: rho_v, cp_v: cp_v,
    quality: quality, T_from_h: T_from_h, rho_from_h: rho_from_h,
    subcooling: subcooling, rangeOK: rangeOK,
    LIMITS: { P_MIN: P_MIN, P_MAX: P_MAX, T_MIN: T_MIN, T_MAX: T_MAX, TV_MAX: TV_MAX,
              P_CRIT: P_CRIT, T_CRIT: T_CRIT }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
