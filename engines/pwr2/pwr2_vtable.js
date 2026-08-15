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
    var s = satPair(P), hfg = s.hg - s.hf;
    return 1 / v_from_x((h - s.hf) / (hfg <= 0 ? 1e-9 : hfg), P);
  }
  function v_from_h(h, P) {
    var s = satPair(P), hfg = s.hg - s.hf;
    return v_from_x((h - s.hf) / (hfg <= 0 ? 1e-9 : hfg), P);
  }

  build();

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.vtable = {
    rho_from_h: rho_from_h, v_from_h: v_from_h, v_from_x: v_from_x, v_exact: v_exact,
    satPair: satPair,
    build: build,
    GRID: { P: Pg, X: Xg, NP: NP, get NX() { return NX; } },
    bytes: function () { return NP * NX * 8 + NP1 * 4 * 8; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
