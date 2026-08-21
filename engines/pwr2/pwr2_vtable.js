/* pwr2_vtable.js — the ruled (quality, P) SPECIFIC-VOLUME table. (#479)
 *
 * Reads Layer 0 and nothing else. This is not a new layer — it is the optimisation D2 §23.4
 * ruled and nobody built, and D1 §26 measured the cost of not having it: **the whole stack
 * missed its own performance stop condition by 103x**, and the entire deficit was in one
 * function.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS ACTUALLY SLOW, because it is not what it looks like.
 *
 *   T_sat(P)         0.04 us    a polynomial
 *   h_l_sat(T)       0.02 us    a polynomial
 *   P_sat(T)         3.30 us    A 60-ITERATION BISECTION
 *   T_from_h(h,P)   32.50 us    Newton on h_l -> ~10 x P_sat
 *   rho_from_h(h,P) 31.50 us    THE HOT PATH, called ~132 times per step
 *
 * The node model is cheap. What cost 4.2 ms/step was evaluating water properties by ITERATING
 * ON AN ITERATION — a Newton inverse whose every residual paid a 60-step bisection.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A TABLE OF `v`, NOT OF `rho` — the ruling's actual reason, which is physics not speed.
 *
 * In the two-phase region specific volume mixes LINEARLY in quality and density does not:
 *     v = v_f + x*(v_g - v_f)      exact under HEM
 *     rho = 1/v                    strongly non-linear in x
 * So a v-table interpolates correctly between grid lines and a rho-table does not. D2 §23.4
 * records the size of that error: **a rho-table is 762 % wrong at 0.12 MPa**, where v_g/v_f is
 * ~1600. Tabulating the wrong variable would have been fast and wrong.
 *
 * WHY x = 0 AND x = 1 ARE EXACT GRID LINES. The saturation kink is real physics, entailed by
 * Clausius-Clapeyron. Putting the boundaries ON node lines makes the table REPRODUCE the kink
 * instead of averaging across it — which is the same reasoning that made the whole engine stop
 * differentiating the state equation (D2 §18).
 *
 * THE COORDINATE. The ruled grid is (quality, P), and quality is only defined inside the dome.
 * Extended, without changing what the ruling says: the table is on the REDUCED ENTHALPY
 *
 *     x = (h - h_f(P)) / h_fg(P)
 *
 * which is < 0 subcooled, exactly [0,1] in the dome, and > 1 superheated. One table, three
 * regimes, both saturation boundaries landing on x = 0 and x = 1 by construction.
 *
 * ---------------------------------------------------------------------------------------
 * BUILT AT LOAD, NOT STORED. The table is generated from Layer 0's correlations every time this
 * file loads (~0.2 s once). A stored table is a SECOND SOURCE OF TRUTH for the same curves and
 * would drift from them silently — the identical argument `P_sat` makes for being a Newton
 * inverse of `T_sat` rather than an independent fit. Generating it means the table and the
 * correlations cannot disagree, ever, and the accuracy claim below is a measurement of
 * INTERPOLATION error alone rather than of interpolation plus staleness.
 *
 * UNITS ARE SI. P MPa · h kJ/kg · v m3/kg · rho kg/m3
 */
(function (root) {
  'use strict';

  var W = root.RD && root.RD.pwr2 && root.RD.pwr2.water;

  /* ---- GRID ----
   * P: log-spaced, because every property in this envelope varies in ln(P) — that is the
   *    variable T_sat, h_v and rho_v are all fitted in.
   * x: three bands with DIFFERENT densities, because the physics is not uniform in x. The dome
   *    is where the interpolation has to be good, so it gets the most lines; the subcooled and
   *    superheated wings are nearly linear in x and need fewer. x = 0 and x = 1 are grid lines
   *    exactly, by construction of the band edges. */
  var P_MIN = 0.1, P_MAX = 18.0, NP = 110;
  /* THE SATURATION LINE GETS ITS OWN, MUCH FINER 1-D GRID, and the reason is a measurement.
   * With h_f shared on the coarse 60-point grid the dome read 0.23 % wrong AT x = 0.01 — where
   * v is essentially v_f and should have been near-exact. The sensitivity is through the
   * coordinate, not the value: x = (h - h_f)/h_fg, and at 17 MPa the dome edge is steep enough
   * (v_g/v_f ~ 6) that half a kJ/kg of error in h_f becomes 0.23 % in v.
   * 1-D arrays are almost free, so the saturation line is resolved 400 ways while the 2-D wing
   * table stays coarse in P — the wings' error is x-driven and refining P there did nothing
   * (measured: 1.116 -> 1.164 for 3x the pressure lines). */
  var NP1 = 400;
  var X_LO = -2.2, X_HI = 2.6, NSUB = 40, NDOME = 45, NSUP = 110;

  var Pg = new Float64Array(NP);
  var Xg = new Float64Array(NSUB + NDOME + NSUP - 1);
  var LNV = null;                                 // ln(v), used ONLY in the superheated wing
  /* ---- THE SUBCOOLED BRANCH IS NOT INTERPOLATED IN PRESSURE AT ALL ----
   * It was, as a ratio to v_f(P), and that destroyed d(rho)/dP: v_f moves strongly with pressure
   * through T_sat, so subcooled v came out as a product of two strongly P-dependent terms whose
   * derivatives nearly cancel — and the small residual difference IS the compressibility.
   * Differencing two large nearly-equal numbers to recover a small one is the classic way to lose
   * a derivative, and it measured -57 % (D1 §27).
   *
   * So the pressure dependence is now APPLIED ANALYTICALLY, exactly as `rho_l` does it:
   *     rho(h,P) = rho_sat(T) * (1 + (P - P_sat(T)) / B(T))
   * with T, rho_sat, P_sat and B all read from 1-D tables indexed by ENTHALPY. The derivative is
   * then closed-form — d(rho)/dP = rho_sat/B — rather than a difference of interpolants.
   * Tabulating a quantity whose derivative matters is a different problem from tabulating the
   * quantity itself; this branch solves the second by not tabulating the first. */
  /* NH -- THE SUBCOOLED TABLE'S RESOLUTION, AND IT IS **NOT** WHERE THE ACCURACY LIVES.
   *
   * This line used to read 2000 with the comment "it is where the accuracy lives". THAT WAS
   * FALSE, and it was falsified by an adversarial mutation that reduced it to 200 and reddened
   * NOTHING. A surviving mutation has two possible meanings -- the gate is blind, or the mutated
   * thing does not matter -- and here it was the second. Measured across the whole declared
   * envelope:
   *
   *     NH    operating   subcooled   superheat   deep-SH   worst d(rho)/dP    kB
   *     100    -0.0060     -0.0055      0.0877     0.4848        0.316 %        5
   *     200     0.0061      0.0068      0.0877     0.4848        0.146 %        9
   *     400     0.0070      0.0075      0.0877     0.4848        0.215 %       19
   *     600     0.0073      0.0077      0.0877     0.4848        0.126 %       28
   *    2000     0.0074      0.0079      0.0877     0.4848        0.146 %       94
   *    limits    0.06        0.12        0.12      1.0           6.0 %
   *
   * FLAT. Superheat is bit-identical because it never reads this table; operating and subcooled
   * move in the fourth decimal; the derivative wobbles NON-MONOTONICALLY (best at 600, worst at
   * 100), which is numerical noise rather than a trend. The accuracy is carried by the two
   * correction passes and the analytic compressibility form, exactly as the note on `rho_sub`
   * already said -- **the file contained both claims and they contradicted each other.**
   *
   * So 400, not 2000: past the sign flip between 100 and 200, on the asymptote, and 19 kB instead
   * of 94 for a browser-loaded engine. THE NUMBER IS NOW MEASURED RATHER THAN GENEROUS. */
  var NH = 400;
  var HL = new Float64Array(NH);      // saturated-liquid enthalpy grid (the index)
  var T_OF_H = new Float64Array(NH);  // T such that h_l_sat(T) = HL[i]
  var RHO_S = new Float64Array(NH);   // rho_l_sat(T)
  var PSAT_H = new Float64Array(NH);  // P_sat(T)
  var BULK_H = new Float64Array(NH);  // bulk_modulus(T)
  var KCMP_H = new Float64Array(NH);  // k_comp(T), for the one-step enthalpy correction

  var HF = new Float64Array(NP1), HG = new Float64Array(NP1);   // saturation enthalpies, FINE grid
  var LNVF = new Float64Array(NP1), LNVG = new Float64Array(NP1);  // ln v_f, ln v_g -- the dome's edges
  var NX = Xg.length;
  var lnPmin = Math.log(P_MIN), lnPmax = Math.log(P_MAX);

  function buildGrid() {
    var i;
    for (i = 0; i < NP; i++) Pg[i] = Math.exp(lnPmin + (lnPmax - lnPmin) * i / (NP - 1));
    var k = 0;
    for (i = 0; i < NSUB; i++) Xg[k++] = X_LO + (0 - X_LO) * i / NSUB;          // [X_LO, 0)
    for (i = 0; i < NDOME; i++) Xg[k++] = i / (NDOME - 1);                       // [0, 1] EXACT
    for (i = 1; i < NSUP; i++) Xg[k++] = 1 + (X_HI - 1) * i / (NSUP - 1);        // (1, X_HI]
    NX = k;
  }

  /* The reference evaluation the table is generated from and validated against. Layer 0's
   * direct path, unchanged — this is the "one source of truth" the table must not become a
   * second copy of. */
  function v_exact(x, P) {
    var hf = W.h_f(P), hfg = W.h_g(P) - hf;
    var h = hf + x * hfg;
    return 1 / W.rho_from_h(h, P);
  }

  function build() {
    buildGrid();
    /* 1-D subcooled tables, indexed by saturated-liquid enthalpy over the declared liquid range */
    var TA = 20, TB = 358;
    for (var q = 0; q < NH; q++) {
      var Tq = TA + (TB - TA) * q / (NH - 1);
      HL[q] = W.h_l_sat(Tq);
      T_OF_H[q] = Tq;
      RHO_S[q] = W.rho_l_sat(Tq);
      PSAT_H[q] = W.P_sat(Tq);
      BULK_H[q] = W.bulk_modulus(Tq);
      KCMP_H[q] = W.k_comp(Tq);
    }
    for (var q = 0; q < NP1; q++) {
      var Pq = Math.exp(lnPmin + (lnPmax - lnPmin) * q / (NP1 - 1));
      HF[q] = W.h_f(Pq);
      HG[q] = W.h_g(Pq);
      LNVF[q] = Math.log(v_exact(0, Pq));
      LNVG[q] = Math.log(v_exact(1, Pq));
    }
    LNV = new Float64Array(NP * NX);
    for (var i = 0; i < NP; i++) {
      /* h_f and h_g ON THE P GRID. Every lookup needs them to form x, and computing them live
       * was the whole remaining cost after the table went in: h_g calls h_fg_T, which carries a
       * Math.pow. Tabulated on the same grid, they are two linear reads. */
      /* THE WINGS ARE STORED AS A RATIO TO THEIR OWN SATURATION EDGE, not as raw v.
       * Same lesson as the dome, one step further out: v itself carries almost all of the
       * pressure dependence, so a coarse P grid cannot represent it — but v/v_f (subcooled) and
       * v/v_g (superheated) are nearly pressure-independent, because both numerator and
       * denominator move together. The steep part is then carried by the FINE 1-D saturation
       * tables and the 2-D grid only has to describe the mild remaining shape in x.
       * Measured before this: superheat 0.47 %, deep superheat 1.51 %. */
      var vf0 = v_exact(0, Pg[i]), vg0 = v_exact(1, Pg[i]);
      for (var j = 0; j < NX; j++) {
        var v = v_exact(Xg[j], Pg[i]);
        /* >= 1, NOT > 1. The point AT x = 1 belongs to the SUPERHEATED wing's normalisation, because
         * the interval [1, 1+dx] is read by the wing branch. Writing > 1 put a v/v_f value and a
         * v/v_g value at the two ends of one interval and interpolated between them: measured
         * -94 % at x = 1.00. The dome branch never reads this table, so x = 1 is unambiguously
         * the wing's. */
        var edge = Xg[j] >= 1 ? vg0 : vf0;
        LNV[i * NX + j] = Math.log(v / edge);
      }
    }
  }

  /* ---------------------------------------------------------------------------------------
   * THE STRUCTURE, and it is NOT a plain 2-D grid — that was the first attempt and it measured
   * 0.33 % INSIDE THE DOME, where the answer should have been exact.
   *
   * The tell: v is EXACTLY linear in quality under HEM, so a dome error cannot come from the x
   * direction. It came from the PRESSURE direction — near x = 1 the value is essentially v_g,
   * which varies like 1/P, and a straight line across a 9 % pressure step cuts that corner.
   *
   * So the dome is not tabulated in 2-D at all. It is computed the way the physics says:
   *
   *     v(x,P) = v_f(P) + x * (v_g(P) - v_f(P))        EXACT in x, for 0 <= x <= 1
   *
   * with v_f and v_g as 1-D tables in ln(P), interpolated in ln(v) because both span decades.
   * The 2-D grid is then only needed for the WINGS, where x-dependence is genuinely non-linear.
   * That is smaller, faster and exact where the ruling cared most — and it is what D2 §23.4
   * actually asks for, since "tabulate v on (quality, P) with x = 0 and x = 1 as exact grid
   * lines" is precisely the statement that the dome is spanned by its two edges. */
  function interp1(arrLn, P) {
    var lp = Math.log(P < P_MIN ? P_MIN : (P > P_MAX ? P_MAX : P));
    var fi = (lp - lnPmin) / (lnPmax - lnPmin) * (NP1 - 1);
    var i = fi | 0; if (i < 0) i = 0; if (i > NP1 - 2) i = NP1 - 2;
    var t = fi - i; if (t < 0) t = 0; if (t > 1) t = 1;
    return Math.exp(arrLn[i] + (arrLn[i + 1] - arrLn[i]) * t);
  }

  /* Linear read on the enthalpy grid. Returns the index fraction so several arrays share one
   * search — the grid is uniform in T, so h is monotone but not evenly spaced. */
  function hIndex(hs) {
    var lo = 0, hi = NH - 1, mid;
    if (hs <= HL[0]) return { i: 0, t: 0 };
    if (hs >= HL[NH - 1]) return { i: NH - 2, t: 1 };
    while (hi - lo > 1) { mid = (lo + hi) >> 1; if (HL[mid] <= hs) lo = mid; else hi = mid; }
    return { i: lo, t: (hs - HL[lo]) / (HL[hi] - HL[lo]) };
  }
  function lin(arr, ix) { return arr[ix.i] + (arr[ix.i + 1] - arr[ix.i]) * ix.t; }

  /* SUBCOOLED density, analytic in pressure. */
  function rho_sub(h, P) {
    var ix = hIndex(h);
    /* TWO FIXED CORRECTION PASSES, not iteration to convergence. The saturated-liquid enthalpy
     * corresponding to (h,P) is h minus the compressed-liquid departure, and that departure needs
     * T — which is what we are solving for. So: read T uncorrected, correct, read again, correct
     * again, stop.
     *
     * THE SECOND PASS IS LOAD-BEARING AND WAS ALMOST NOT WRITTEN. With one pass this reads
     * -0.0674 % against the ruled 0.06 % — a miss by 12 %, close enough to look like a resolution
     * problem. It is not: raising NH from 600 to 2000 did not clear it, because the residual is
     * the CORRECTION and not the grid. The second pass clears it ninefold to 0.0072 %. The place
     * this nearly went wrong was re-banding the threshold instead, which retires a target rather
     * than meeting it. A third pass measures no better and costs the same as the second. */
    var hs = h - lin(KCMP_H, ix) * (P - lin(PSAT_H, ix));
    ix = hIndex(hs);
    hs = h - lin(KCMP_H, ix) * (P - lin(PSAT_H, ix));
    ix = hIndex(hs);
    var rs = lin(RHO_S, ix), ps = lin(PSAT_H, ix), B = lin(BULK_H, ix);
    return rs * (1 + (P - ps) / B);
  }

  function v_from_x(x, P) {
    if (x >= 0 && x <= 1) {
      var vf = interp1(LNVF, P), vg = interp1(LNVG, P);
      return vf + x * (vg - vf);                       /* EXACT in x */
    }
    /* Wings: 2-D in (ln P, x), interpolating ln(v) in both directions because v spans decades
     * in the superheated wing and is only mildly curved in the subcooled one. */
    var lp = Math.log(P < P_MIN ? P_MIN : (P > P_MAX ? P_MAX : P));
    var fi = (lp - lnPmin) / (lnPmax - lnPmin) * (NP - 1);
    var i = fi | 0; if (i < 0) i = 0; if (i > NP - 2) i = NP - 2;
    var ti = fi - i; if (ti < 0) ti = 0; if (ti > 1) ti = 1;

    var lo = 0, hi = NX - 1, mid;
    if (x <= Xg[0]) { lo = 0; hi = 1; }
    else if (x >= Xg[NX - 1]) { lo = NX - 2; hi = NX - 1; }
    else { while (hi - lo > 1) { mid = (lo + hi) >> 1; if (Xg[mid] <= x) lo = mid; else hi = mid; } }
    var tj = (x - Xg[lo]) / (Xg[hi] - Xg[lo]);
    if (tj < 0) tj = 0; if (tj > 1) tj = 1;

    var la = LNV[i * NX + lo], lb = LNV[i * NX + hi];
    var lc = LNV[(i + 1) * NX + lo], ld = LNV[(i + 1) * NX + hi];
    var ratio = Math.exp((la + (lb - la) * tj) * (1 - ti) + (lc + (ld - lc) * tj) * ti);
    /* Reconstruct against the FINE saturation edge, so the steep pressure dependence comes from
     * the 400-point 1-D table rather than the 60-point 2-D one. */
    return ratio * interp1(x > 1 ? LNVG : LNVF, P);
  }

  /* h_f / h_g by linear read off the P grid — no polynomial, no Math.pow, no iteration. */
  function satPair(P) {
    var lp = Math.log(P < P_MIN ? P_MIN : (P > P_MAX ? P_MAX : P));
    var fi = (lp - lnPmin) / (lnPmax - lnPmin) * (NP1 - 1);
    var i = fi | 0; if (i < 0) i = 0; if (i > NP1 - 2) i = NP1 - 2;
    var t = fi - i; if (t < 0) t = 0; if (t > 1) t = 1;
    return { hf: HF[i] + (HF[i + 1] - HF[i]) * t, hg: HG[i] + (HG[i + 1] - HG[i]) * t };
  }

  function rho_from_h(h, P) {
    var s = satPair(P);
    if (h < s.hf) return rho_sub(h, P);          /* analytic in P -- see the note above */
    var hfg = s.hg - s.hf;
    return 1 / v_from_x((h - s.hf) / (hfg <= 0 ? 1e-9 : hfg), P);
  }
  function v_from_h(h, P) {
    var s = satPair(P), hfg = s.hg - s.hf;
    return v_from_x((h - s.hf) / (hfg <= 0 ? 1e-9 : hfg), P);
  }

  build();

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  /* The table's own memory footprint, in bytes — REPORTED so a gate can hold it to a measured
   * size rather than a generous one. NH was 2000 for no measured reason (see its note). */
  function footprintBytes() {
    return 8 * (NH * 6 + NP + Xg.length + NP1 * 6 + (LNV ? LNV.length : 0) +
                (LNVF ? LNVF.length : 0) + (LNVG ? LNVG.length : 0));
  }

  root.RD.pwr2.vtable = {
    footprintBytes: footprintBytes,
    rho_from_h: rho_from_h, v_from_h: v_from_h, v_from_x: v_from_x, v_exact: v_exact,
    satPair: satPair, rho_sub: rho_sub,
    build: build,
    GRID: { P: Pg, X: Xg, NP: NP, get NX() { return NX; } },
    bytes: function () { return NP * NX * 8 + NP1 * 4 * 8; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
