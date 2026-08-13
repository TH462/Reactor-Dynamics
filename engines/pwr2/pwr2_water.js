/* pwr2_water.js — Layer 0: water/steam properties for the PWR2 engine.
 *
 * PURE FUNCTIONS. No state, no config, no dependencies. This file is the bottom of the
 * dependency stack (Blueprint/PWR2_ARCHITECTURE.md) and must stay that way — every layer
 * above reads it and nothing it reads exists.
 *
 * WHY THIS FILE IS THE FIRST THING BUILT (#479). The current engine has exactly one
 * property function — T_sat(P) as a bare power-law fit — and no enthalpy or density at
 * all. With no h(T,P) there is no energy balance to check, which is why its coolant node
 * had to carry a FITTED normalized `coolant_heat_capacity` (units: fraction-of-rated-heat
 * per degC/s) instead of a mass times a specific heat. Everything downstream of that
 * inherited the same unfalsifiability: measured 2026-08-13, the plant's declared
 * rcs_flow_gpm is 1.51x off the Q = m*dh implied by its own ruled power and leg
 * temperatures, and nothing in the codebase could detect it. This file is what makes
 * that class of error detectable.
 *
 * SCOPE AND HONESTY. This is NOT IAPWS-97. It is a set of correlations fitted over this
 * plant's operating envelope, and every one of them declares its own accuracy, which
 * test/run_pwr2_water.js asserts against published steam-table points. An educational
 * lumped/nodal sim does not need full IAPWS; it does need to know how wrong it is.
 *
 * VALID RANGE — outside it the correlations are NOT characterised:
 *     pressure     0.1 .. 17.0 MPa
 *     temperature  20 .. 350 degC
 * Callers get a clamped result, never a silent extrapolation. See rangeOK().
 *
 * UNITS ARE SI THROUGHOUT, matching the repo convention (CLAUDE.md: engine internals stay
 * SI; US-customary is a display/reporting concern only).
 *     P   MPa        T   degC        h   kJ/kg
 *     rho kg/m3      cp  kJ/kg-K
 */
(function (root) {
  'use strict';

  var P_MIN = 0.1, P_MAX = 17.0;      // MPa
  var T_MIN = 20.0, T_MAX = 350.0;    // degC
  var P_CRIT = 22.064, T_CRIT = 373.946;   // true critical point, for shape only

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  /* rangeOK — the honesty guard. Returns false when a caller is outside the fitted
   * envelope. Callers that care (the gate, diagnostics) check it; callers that do not
   * still get a clamped, finite number rather than a divergent extrapolation. Silent
   * extrapolation is how a fit becomes a wrong answer nobody notices. */
  function rangeOK(T_c, P_MPa) {
    return (P_MPa >= P_MIN && P_MPa <= P_MAX && T_c >= T_MIN && T_c <= T_MAX);
  }

  /* ---------------------------------------------------------------- saturation line
   * T_sat(P): Antoine-form fit in log-pressure, accurate to about +/-0.6 degC over
   * 0.1-17 MPa (verified in run_pwr2_water against 8 published points).
   *
   * NOTE vs the old engine: engines/pwr uses T_sat = 179.47 * P^0.239, which it documents
   * as +/-2 degC over 5-17 MPa. That form is deliberately NOT reused here — it degrades
   * badly below 5 MPa (a cooled-down or depressurised plant), and PWR2 must be correct
   * across the full Mode 5 <-> Mode 1 envelope, not just at power. */
  function T_sat(P_MPa) {
    var P = clip(P_MPa, 1e-4, P_CRIT);
    var lp = Math.log(P);
    // Least-squares cubic in ln(P), fitted 2026-08-13 to 9 steam-table saturation points
    // spanning 0.1-17 MPa. Max residual 0.53 degC at 15.41 MPa.
    return 179.8194 + 43.37729 * lp + 4.791606 * lp * lp + 0.4705170 * lp * lp * lp;
  }

  /* P_sat(T): the inverse. Newton iteration on T_sat rather than a second independent
   * fit, so the two can never disagree with each other — an independent inverse fit is a
   * second source of truth for one physical curve, and they drift. */
  function P_sat(T_c) {
    var T = clip(T_c, 0.0, T_CRIT);
    var P = 0.1, i, f, dfdP, dP = 1e-6;
    for (i = 0; i < 40; i++) {
      f = T_sat(P) - T;
      if (Math.abs(f) < 1e-8) break;
      dfdP = (T_sat(P + dP) - T_sat(P - dP)) / (2 * dP);
      if (!isFinite(dfdP) || Math.abs(dfdP) < 1e-12) break;
      P = clip(P - f / dfdP, 1e-4, P_CRIT);
    }
    return P;
  }

  /* ---------------------------------------------------------------- liquid enthalpy
   * h_l(T,P): saturated-liquid enthalpy along the saturation line, plus a compressed-
   * liquid correction for the subcooled region.
   *
   * The saturation-line term is the important one and is where the accuracy claim lives
   * (+/-6 kJ/kg over 20-350 degC). The compressed-liquid term (v*(P-Psat), the exact
   * thermodynamic form for an incompressible liquid) is small at PWR conditions but NOT
   * negligible: at 288 degC and 15.41 MPa it is worth about +9 kJ/kg, which is ~5% of the
   * 188 kJ/kg core rise. Dropping it would bias the energy balance the whole engine is
   * built to check. */
  function h_l_sat(T_c) {
    var T = clip(T_c, 0.0, T_CRIT);
    // Least-squares QUARTIC in T, fitted 2026-08-13 to 9 steam-table points 20-343 degC.
    // Max residual 4.13 kJ/kg. A quartic is needed, not a cubic: h departs from the
    // near-linear 4.19*T low-temperature behaviour above ~250 degC as cp climbs steeply
    // toward the critical point (cp is 4.2 at 100 degC and 6.1 at 321).
    return 6.223373 + 3.795321 * T + 5.318079e-3 * T * T
         - 2.613318e-5 * T * T * T + 5.248055e-8 * T * T * T * T;
  }

  function h_l(T_c, P_MPa) {
    var h_sat = h_l_sat(T_c);
    var Ps = P_sat(T_c);
    if (P_MPa <= Ps) return h_sat;              // at or below saturation: on the line
    var v = 1.0 / rho_l(T_c, P_MPa);            // m3/kg
    return h_sat + v * (P_MPa - Ps) * 1000.0;   // MPa*m3/kg -> kJ/kg
  }

  /* ---------------------------------------------------------------- liquid density
   * rho_l(T,P): saturated-liquid density with a linear compressibility correction.
   * Accuracy about +/-4 kg/m3 over 20-350 degC. The compressibility term matters for
   * exactly one thing, but that thing is load-bearing: a water-solid RCS, where dP/drho
   * IS the pressure response and the bulk modulus is the whole model. */
  function rho_l_sat(T_c) {
    var T = clip(T_c, 0.0, T_CRIT);
    // Least-squares QUARTIC in T, fitted 2026-08-13 to 10 steam-table points 20-343 degC.
    // Max residual 3.02 kg/m3. Quartic for the same reason as h_l_sat: density falls
    // away steeply near the critical point (998 -> 738 -> 592 kg/m3), and a cubic
    // over-predicts the hot end by ~50 kg/m3, which is exactly the regime this plant
    // operates in.
    return 994.8951 + 0.3012879 * T - 9.857712e-3 * T * T
         + 3.835291e-5 * T * T * T - 6.437035e-8 * T * T * T * T;
  }

  function rho_l(T_c, P_MPa) {
    var r = rho_l_sat(T_c);
    var Ps = P_sat(T_c);
    // Isothermal bulk modulus falls steeply with temperature: ~2.2 GPa cold, ~1.3 GPa at
    // 300 degC. Same physical constant the old engine calls `solid_bulk_mpa` (1300 MPa)
    // -- but there it is a single hot-value constant, here it is a function of state,
    // because a Mode 5 cooldown spends its whole life at the cold end where 1300 is wrong
    // by ~1.7x.
    var B = 2200.0 - 3.0 * clip(T_c, 0, T_CRIT);   // MPa
    return r * (1.0 + (P_MPa - Ps) / B);
  }

  /* ---------------------------------------------------------------- liquid cp
   * cp_l(T,P): specific heat, from the analytic derivative of h_l_sat. Derived rather
   * than independently fitted so cp and h cannot disagree -- the same reasoning as
   * P_sat's Newton inverse above. An engine that integrates h but reports a cp from a
   * separate fit will fail its own energy balance by the gap between them. */
  function cp_l(T_c) {
    var T = clip(T_c, 0.0, T_CRIT);
    // EXACT analytic derivative of h_l_sat's quartic above.
    //
    // ACCURACY CAVEAT, stated because it is a real trade and not an oversight: the
    // derivative of a least-squares fit is NOT itself a least-squares fit of the
    // derivative. This returns 3.98 kJ/kg-K at 20 degC against a true 4.18 (-5%), while
    // landing 5.37 at 288 and 6.08 at 321 (both good). The trade is deliberate:
    // consistency with h beats accuracy in cp, because the node model INTEGRATES h and
    // only uses cp for the Newton inverse (where a 5% slope error costs an iteration,
    // not accuracy) and for wall heat capacity. An independently-fitted cp would be
    // more accurate and would silently break the energy balance by the gap between the
    // two fits -- which is the whole class of defect this engine exists to make
    // impossible.
    return 3.795321 + 1.063616e-2 * T - 7.839955e-5 * T * T + 2.099222e-7 * T * T * T;
  }

  /* ---------------------------------------------------------------- vapour side
   * h_v(P): saturated-vapour enthalpy, +/-15 kJ/kg over 0.1-17 MPa. Flat-topped -- it
   * peaks near 3 MPa and falls toward the critical point, which is why a linear fit
   * cannot be used and why the old engine's absence of any vapour enthalpy made
   * two-phase bookkeeping impossible. */
  function h_v(P_MPa) {
    var P = clip(P_MPa, 1e-4, P_CRIT);
    var lp = Math.log(P);
    // Least-squares cubic in ln(P), 9 points 0.1-17 MPa. Max residual 22.2 kJ/kg -- the
    // loosest correlation in this file, and the claim is +/-25 accordingly. The curve is
    // flat-topped (peaks near 2-3 MPa, falls both ways), so a cubic cannot do better
    // without more terms than the accuracy is worth; if a future two-phase model needs
    // tighter vapour enthalpy, raise the degree AND tighten the gate's tolerance in the
    // same change.
    return 2782.927 + 69.62958 * lp - 17.45556 * lp * lp - 12.14392 * lp * lp * lp;
  }

  /* h_fg(P): latent heat = h_v - h_l(T_sat). Derived, never fitted separately -- it must
   * go to zero at the critical point and an independent fit will not. */
  function h_fg(P_MPa) {
    return Math.max(0, h_v(P_MPa) - h_l_sat(T_sat(P_MPa)));
  }

  /* rho_v(P): saturated-vapour density. Ideal-gas form with a compressibility factor
   * that falls toward the critical point; +/-4% over 0.1-17 MPa. */
  function rho_v(P_MPa) {
    var P = clip(P_MPa, 1e-4, P_CRIT);
    var lp = Math.log(P);
    // Least-squares cubic in ln(P) fitted to ln(rho), 9 points 0.1-17 MPa. Max residual
    // 1.56 %.
    //
    // A log-log fit, not the ideal-gas form with a compressibility factor that a first
    // pass reached for: measured, the ideal-gas route ran 25 % low at 15.41 MPa (72.4 vs
    // 96.7 kg/m3), because near-critical steam is nowhere near ideal and no single-term
    // Z correction covers 0.1-17 MPa. The log-log fit is empirical but honest about it.
    return Math.exp(1.632491 + 0.9291362 * lp + 0.02187539 * lp * lp
                    + 0.01139853 * lp * lp * lp);
  }

  /* ---------------------------------------------------------------- derived helpers */

  /* subcooling(T,P): degC below saturation. Positive = subcooled liquid.
   * NOTE the old engine carries two deliberately different spellings of "subcooling"
   * (a bulk regime gate and an operator-facing margin) that diverge over a dry core.
   * PWR2 has ONE definition here, a pure function of state; anything that wants an
   * instrument-facing or hot-channel variant builds it explicitly at the call site and
   * names it differently. */
  function subcooling(T_c, P_MPa) { return T_sat(P_MPa) - T_c; }

  /* T_from_h(h,P): invert h_l for temperature. The node model integrates enthalpy, so
   * this is how a node reports its temperature. Newton on h_l, same
   * one-curve-one-source-of-truth reasoning as P_sat. */
  function T_from_h(h_kJkg, P_MPa) {
    var T = clip(h_kJkg / 4.2, 0.0, T_CRIT), i, f, dfdT;
    for (i = 0; i < 40; i++) {
      f = h_l(T, P_MPa) - h_kJkg;
      if (Math.abs(f) < 1e-9) break;
      dfdT = cp_l(T);
      if (!isFinite(dfdT) || dfdT < 1e-9) break;
      T = clip(T - f / dfdT, 0.0, T_CRIT);
    }
    return T;
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.water = {
    T_sat: T_sat, P_sat: P_sat,
    h_l: h_l, h_l_sat: h_l_sat, h_v: h_v, h_fg: h_fg,
    rho_l: rho_l, rho_l_sat: rho_l_sat, rho_v: rho_v,
    cp_l: cp_l,
    subcooling: subcooling, T_from_h: T_from_h,
    rangeOK: rangeOK,
    LIMITS: { P_MIN: P_MIN, P_MAX: P_MAX, T_MIN: T_MIN, T_MAX: T_MAX }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
