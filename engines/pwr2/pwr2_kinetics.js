/* pwr2_kinetics.js — Layer 5: POINT KINETICS, DECAY HEAT AND XENON. (#479)
 *
 * Reads Layers 0-4. Produces the core power Layer 4 has been taking as a driver since it was built.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS MAKES EXPRESSIBLE, AND WHY IT IS THE LARGEST GAP CLOSED SO FAR.
 *
 * `stepPlant` has always taken `drivers.corePower` as a number somebody hands it. So the plant had
 * NO REACTIVITY FEEDBACK: rods did nothing, boron was tracked and inert, temperature could not move
 * power — and the A/B harness could only ever compare STEADY STATES. Five of the nine Tier A
 * couplings depend on this file existing (A1, A2, A6, A7, A8).
 *
 * ---------------------------------------------------------------------------------------
 * ⚠ THE INTEGRATION IS ANALYTIC, NOT EXPLICIT, AND NOT SUB-STEPPED. This is RULED —
 * `PWR2_PHYSICS.md` §15, which supersedes its own §4:
 *
 *   "Explicit Euler at dt = 0.02 with no sub-steps returns n = 0.000e+0 — it diverges to zero. It
 *    needs 250 sub-steps per 0.02 s step to be stable. ... With rho frozen over the step, point
 *    kinetics is a LINEAR system with constant coefficients. It has a closed-form solution — a 7x7
 *    matrix exponential ... analytic gives n = 0.865167, stable, in one step, with no sub-steps at
 *    all."
 *
 * REPRODUCED INDEPENDENTLY BEFORE THIS FILE WAS WRITTEN, which is the only reason to trust it:
 *
 *     prompt eigenvalue, rho = 0        -325 /s      (§15: -323)
 *     prompt eigenvalue, scrammed      -2825 /s      (§15: -2,820), dt/tau = 57  (§15: 56)
 *     EXPLICIT Euler, one 0.02 s step   n = 0.000e+0   <- diverges, exactly as §15 states
 *     ANALYTIC,        one 0.02 s step  n = 1.000000 at rho = 0 — critical STAYS critical
 *     ANALYTIC at rho = -101 pcm        n = 0.864935 with the SHIPPED beta = 0.006502
 *
 * ⚠ §15's quoted 0.865167 was computed at beta = 0.00645 and this header claimed to reproduce
 * it "to 6 decimals" — as built the fourth decimal differs (audit #488 C7.2), because the
 * validation table was not re-measured after the group data moved. The integrator itself is
 * exact for the stated model (audit C7.1: independent RK4, rel err <= 9e-15 per step, 8.3e-12
 * over a 500-step scram); it is the CLAIM that was stale. Re-measure this line whenever
 * DELAYED moves.
 *
 * **DO NOT SUB-STEP.** `PWR2_TURNOVER.md` records that a sub-step returning early makes the service
 * clock run ahead of the physics silently — `simulation_service.js` credits `simTime += steps *
 * PHYSICS_DT` unconditionally.
 *
 * AND THE OLD ENGINE'S `Lambda = 0.01 s` IS NOT A CONSTANT, IT IS A CRUTCH. It is marked "fixed",
 * which reads as sourced; it is 500-1000x the physical value, and the old explicit-Euler integrator
 * is stable ONLY because of it. Consequence of using the real Lambda here: a prompt insertion rises
 * on a millisecond timescale where the old engine takes ~1.5 s. That is the physics, not a defect.
 *
 * ---------------------------------------------------------------------------------------
 * THE MODERATOR FEEDBACK READS REAL DENSITY FROM LAYER 0 — the one substantive improvement.
 * `PWR2_PLANT.md`: "the current engine's `_modDensity` is its own cubic density fit; PWR2's
 * moderator coefficient reads real density from L0, so the moderator feedback and the coolant it
 * feeds back from are the same water."
 *
 * ---------------------------------------------------------------------------------------
 * ⚠ WHAT IS NOT FINISHED, DECLARED LOUDLY RATHER THAN HIDDEN:
 *
 *   DOPPLER READS A CALLER-SUPPLIED FUEL TEMPERATURE. `pwr2_fuel.js` does not exist yet — its
 *   `M_fuel` needs a pellet diameter and clad thickness that are in NEITHER the corpus NOR the
 *   design set, and that is an owner decision rather than something to guess. Until it lands,
 *   `drivers.fuelTemp_c` is required and this file will NOT invent one.
 *
 *   THREE CONSTANTS ARE OPEN — see `OPEN` below. They carry the old engine's `[tune]` values as
 *   PLACEHOLDERS, in a structurally separate object so they cannot be mistaken for sourced ones.
 *
 *   BORON IS LUMPED, by owner ruling 2026-08-16. `PWR2_INTERFACE.md` calls for a transported scalar
 *   per node; that is Layer 2/3 work. A8 is therefore not demonstrable yet and is recorded as owed.
 *
 * UNITS ARE SI. T degC · P MPa · rho_reactivity dk/k (x1e5 = pcm) · power FRACTION of rated.
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  var W = RD && RD.water;
  var VT = RD && RD.vtable;
  /* Resolved ONCE at load, never per call — `pwr2_sources.js` records what two missed direct calls
   * cost: Layer 4 ran seven times the cost of Layer 3. */
  var RHO_W = VT ? VT.rho_from_h : (W && W.rho_from_h);

  /* ================================================================ SOURCED CONSTANTS */

  /* SIX DELAYED GROUPS — the standard U-235 thermal-fission set. [sourced]
   * beta is stored pre-summed AND checked against sum(beta_i) by the gate, because a redundant
   * total that silently disagrees with its own parts is a defect waiting to happen. */
  /* SIX DELAYED GROUPS — [recalled]. These are the standard U-235 thermal-fission group data
   * (Keepin's), and the tag matters: `find_source` returns ZERO hits for them across all three
   * lanes' corpora, and the only delayed-neutron figures the corpus does hold are Ginna ch15's
   * BOUNDING beta_eff of 0.49 %/0.43 % — deliberately low licensing values, not group data.
   * This block shipped tagged "[sourced] typical PWR value"; "typical" is not a source, which
   * is this engine's own rule (audit #488 C7.3). An evidence pass owes the group data a real
   * document. */
  var DELAYED = {
    kind:     '[recalled]',
    beta_i:   [0.000215, 0.001424, 0.001274, 0.002568, 0.000748, 0.000273],
    lambda_i: [0.0124,   0.0305,   0.111,    0.301,    1.14,     3.01],
    beta:     0.006502,
    /* PROMPT NEUTRON GENERATION TIME — the REAL one, [recalled] like the groups above, and the
     * whole reason this file integrates analytically. `PWR2_PHYSICS.md` §15 measures with
     * 2.0e-5 s. */
    Lambda:   2.0e-5
  };

  /* FOUR DECAY-HEAT GROUPS — [sourced], and this block is already provenance-complete: a documented
   * least-squares fit to ANSI/ANS 5.1-1971 fission products (NRC ML050910161 Table 8-3) plus an
   * actinide power law (ML021720702), divided by the 1.2 Appendix-K licensing margin. Fit window
   * 1 s - 1e5 s, 4.86 % max relative error; DO NOT QUOTE PAST ~28 h.
   * Sum = 0.06248 = f0, the equilibrium decay fraction — and f0 is what makes the power split
   * below identically consistent at steady state. Ported unchanged. */
  var DECAY = {
    H0:     [0.0268319,  0.0193747,   0.00772324,  0.00855037],
    lambda: [0.0303948,  0.00130630,  0.0000794659, 0.00000287062]
  };
  function f0() { return DECAY.H0[0] + DECAY.H0[1] + DECAY.H0[2] + DECAY.H0[3]; }

  /* IODINE / XENON — the decay constants are physical and [sourced]; the yields are standard
   * fission-product data. lambda_I = ln2/6.57 h, lambda_X = ln2/9.21 h. */
  var XENON = {
    gamma_I:  0.061,
    gamma_X:  0.003,
    lambda_I: 2.87e-5,     // s^-1  [sourced] I-135 half-life 6.57 h
    lambda_X: 2.09e-5      // s^-1  [sourced] Xe-135 half-life 9.21 h
  };

  /* MODERATOR — [sourced]. A least-squares fit to THREE MEASURED BEAVRS / Watts Bar Unit 1 hot
   * zero-power isothermal temperature coefficients (OSTI 1991715 Table IV): ARO 975 ppm at
   * -1.75 pcm/degF, D-in 902 ppm at -4.65, C-in 810 ppm at -8.01.
   *
   * NOTE ON PROVENANCE: the old engine's config marks this block `[tune]`. That marker is STALE —
   * it labels a paragraph that two later rulings overturned, and the two constants below are the
   * fit, not a tuning. Relabelled `[sourced]` here on that basis. */
  var MOD = {
    boron_zero_ppm:   986.0,     // ppm at which moderator feedback is driven to zero
    anchor_pcm_per_F: -31.43,    // at the anchor temperature, zero boron
    anchor_temp_F:    500.0
  };

  /* BORON — [sourced]. 10 pcm/ppm, verbatim and independently in TWO NRC primaries, one of them
   * this plant's anchor:
   *
   *   Ginna TS Bases (ML20339A221):        "If a boron worth of 10 pcm/ppm is assumed, this
   *   NUREG-1431 Rev 4 Vol 2 (ML12100A228)  combination of parameters will increase the SDM by
   *                                         1% k/k."
   *
   * HONEST CAVEAT: both say "is ASSUMED". It is a bounding figure used in a shutdown-margin
   * calculation, not a measured differential worth for a specific core — Ginna's own bases note
   * that the fuel vendor "does not utilize the measured differential boron worth for design
   * validation". So it is sourced as a DESIGN-BASIS number and should not be quoted as a
   * measurement. It is the right magnitude and it is citable, which is more than recall gives.
   *
   * ⚠ THIS TERM WAS MISSING, AND THE FILE'S OWN COMMENT SAID SO. `moderatorReactivity` carries the
   * note "BORON APPEARS TWICE and porting one half is wrong: the direct worth term, and the
   * density coupling inside the moderator term" — and only the density coupling was implemented.
   * MEASURED before the fix: at the reference temperature, where the plant actually operates,
   * boron changed reactivity by 0.00 pcm at 0, 500, 975 AND 2000 ppm. Boron was inert. Away from
   * the reference the apparent worth was -0.98 pcm/ppm, a tenth of the real figure, and it was an
   * artifact of the moderator coefficient's boron dependence rather than boron worth at all.
   *
   * The kinetics gate scored 50/50 with 25/25 mutations against that. IT COULD NOT HAVE CAUGHT IT:
   * mutation testing perturbs code that EXISTS, and this was a missing term. HR10, exactly. */
  var BORON = {
    worth_per_ppm: 1.0e-4,       /* 10 pcm/ppm */
    src: 'ML20339A221 (Ginna TS Bases) and ML12100A228 (NUREG-1431 Rev 4 Vol 2 Bases), both ' +
         '"If a boron worth of 10 pcm/ppm is assumed" — a design-basis figure, not a measurement'
  };

  /* THE HZP CRITICAL-BORON ANCHOR — the one real startup measurement this engine is pinned to.
   * BEAVRS / Watts Bar Unit 1 Cycle 1 HZP physics tests (OSTI 1991715): ARO critical boron
   * 975 ppm at BOL with zero xenon, measured at the WBN HZP temperature of 557 degF = 291.67 degC.
   *
   * ⚠ THE QUOTE TEMPERATURE IS WATTS BAR'S, NOT THIS PLANT'S. They are different numbers and
   * conflating them is a real trap the first engine fell into and had to correct: it evaluated the
   * solve at its own then-anchor and only split the two when the Ginna re-anchor forced it. The
   * 975 ppm belongs to 291.67 degC; this plant's own no-load anchor is a separate quantity and the
   * initial conditions trim against that instead. */
  var HZP = { boron_ppm: 975.0, temp_c: 291.67, P_mpa: 15.5,
              src: 'BEAVRS / Watts Bar U1 Cycle 1 HZP physics tests, OSTI 1991715' };

  /* THE FEEDBACK REFERENCES. Both feedbacks are zero at these by construction, so they are
   * perturbative about the rated condition rather than absolute.
   *
   * ⚠ THE FUEL REFERENCE IS DERIVED, AND IT MOVED — TWICE. It was 693 degC, inherited from the
   * first engine, whose fuel rise came out of two `[tune]` constants. pwr2_fuel.js derives the
   * rise from sourced rod geometry and a real resistance stack: 581.8 degC at an early h_gap,
   * 684.2 degC at the solved h_gap of 3000 that ships (this comment quoted 581.8 for a day
   * after the solve moved — audit #488 A1.5). Doppler is perturbative about this number, so a
   * stale reference injects alpha_D * (T_fuel - T_ref) AT FULL POWER out of nothing at all.
   *
   * This is `pwr2_fuel.steadyFuelTemp(geom, rated_kW, T_mod_ref)`. It is written here as a literal
   * rather than imported so that Layer 5 files stay independent of each other — but it is a DERIVED
   * value with a computation behind it, and the fuel gate pins the two together so they cannot
   * drift apart silently. RE-DERIVE IT if the resistance stack or the pellet split moves. */
  var DEFAULT_T_FUEL_REF = 684.2;   /* [derived] pwr2_fuel.steadyFuelTemp at 300 MWt, 304.5 degC */
  var DEFAULT_T_MOD_REF  = 304.5;   /* rated Tavg */

  /* ROD WORTH — [sourced] WTSM 2.2 (ML11216A051) Table 2.2-1. Already sourced in the old engine's
   * comment and mis-marked `[tune]`; relabelled on the strength of that citation. */
  var RODS = {
    worth_control:  0.04068,
    worth_shutdown: 0.03676,
    /* The S-curve flattening is NOT sourced and is NOT physics — it is a feel adjustment the owner
     * made for low-power startup. [ruled] is the only honest tag; K = 1 is the unflattened curve. */
    curve_flatten:  0.8
  };

  /* ================================================================ ⚠ OPEN CONSTANTS
   * STRUCTURALLY SEPARATE so they cannot be mistaken for the sourced set above. Each carries the
   * old engine's `[tune]` value as a PLACEHOLDER ONLY. `[tune]` does not exist in PWR2 — these are
   * the residue of the port and the evidence pass owed on them is a tracked work item.
   *
   * The gate asserts this object is non-empty and that every entry is flagged, so the gap cannot be
   * quietly forgotten: when the pass lands, entries move UP into the sourced blocks and the count
   * falls. A green gate with items still here means "known incomplete", not "fine". */
  var OPEN = {
    alpha_D: {
      value: -2.5e-5,          // K^-1
      why: 'DOPPLER COEFFICIENT. Needs a source, AND a decision on functional form: this is LINEAR ' +
           'in fuel temperature, where real Doppler goes as d/dsqrt(T). Sourcing the coefficient ' +
           'without settling the form buys a sourced number in the wrong equation.'
    },
    xenon_worth: {
      value: 0.025,            // dk/k at full-power equilibrium
      why: 'Equilibrium xenon worth. ~2700 pcm is a standard figure and should be sourceable.'
    },
    sigma_phi: {
      value: 2.0e-5,           // s^-1
      why: 'Xe-135 burnout rate at rated flux. DERIVABLE from sigma_Xe (~2.6e6 b) and rated flux ' +
           'rather than sourced — the derivation is the deliverable.'
    }
  };

  /* ================================================================ THE ANALYTIC ADVANCE */

  var N = 7;   /* power + six precursors */

  /* SCRATCH BUFFERS, ALLOCATED ONCE. The first version allocated a fresh Float64Array inside
   * matmul, which runs ~25 times per exponential and twice per plant step: measured 31.7 us per
   * advance() call, which made a 300 s scram probe take 525 s of wall clock. Preallocating is not a
   * micro-optimisation here — it is the difference between an engine that can run a transient and
   * one that cannot. Single-threaded and non-reentrant by construction, like every other layer. */
  var _M1 = new Float64Array(N * N), _M2 = new Float64Array(N * N),
      _E  = new Float64Array(N * N), _T = new Float64Array(N * N),
      _A  = new Float64Array(N * N), _v = new Float64Array(N), _o = new Float64Array(N);

  function matmulInto(A, B, C) {
    var i, j, k;
    for (i = 0; i < N * N; i++) C[i] = 0;
    for (i = 0; i < N; i++) {
      for (k = 0; k < N; k++) {
        var a = A[i * N + k];
        if (a === 0) continue;
        for (j = 0; j < N; j++) C[i * N + j] += a * B[k * N + j];
      }
    }
    return C;
  }

  /* Matrix exponential by SCALING AND SQUARING with a Taylor core, writing into `out`.
   * §15 notes scaling-and-squaring is "ample" here — 7x7, and the norm is bounded by the prompt
   * eigenvalue. After scaling to a norm <= 0.5 the Taylor series converges to double precision in
   * far fewer than 18 terms; 12 is measured to be exact to 1e-16 at this norm and is what runs. */
  function expmInto(A, out) {
    var nrm = 0, i, j, q;
    for (i = 0; i < N; i++) {
      var r = 0;
      for (j = 0; j < N; j++) r += Math.abs(A[i * N + j]);
      if (r > nrm) nrm = r;
    }
    /* ⚠ A NON-FINITE NORM MUST NOT HANG THE PROCESS, AND THE FIRST VERSION DID.
     * `Math.log2(Infinity / 0.5)` is Infinity, so `sPow` became Infinity and the squaring loop
     * below never terminated. Measured: the gate locked with no output and no error.
     *
     * This is reachable physics, not a pathological input. A prompt-supercritical excursion — a
     * rod ejection, a dilution accident — drives power toward Infinity in a few steps at the real
     * Lambda, reactivity follows it, and the matrix inherits it. **A HANG IS WORSE THAN A WRONG
     * ANSWER**: a wrong answer reaches a check, a hang reaches nobody. So a non-finite input
     * returns NaN, which propagates visibly, and a merely enormous one is clamped to a squaring
     * count that terminates. */
    if (!isFinite(nrm)) {
      for (q = 0; q < N * N; q++) out[q] = NaN;
      return out;
    }
    var sPow = nrm > 0.5 ? Math.ceil(Math.log2(nrm / 0.5)) : 0;
    if (!(sPow >= 0)) sPow = 0;
    if (sPow > 64) sPow = 64;    /* 2^64 scaling is far past any physical reactivity */
    var sc = Math.pow(2, -sPow);
    for (q = 0; q < N * N; q++) _M1[q] = A[q] * sc;
    for (q = 0; q < N * N; q++) { out[q] = 0; _T[q] = 0; }
    for (var d = 0; d < N; d++) { out[d * N + d] = 1; _T[d * N + d] = 1; }
    for (var k = 1; k <= 12; k++) {
      matmulInto(_T, _M1, _M2);
      for (q = 0; q < N * N; q++) _T[q] = _M2[q] / k;
      for (q = 0; q < N * N; q++) out[q] += _T[q];
    }
    for (var p = 0; p < sPow; p++) { matmulInto(out, out, _M2); for (q = 0; q < N * N; q++) out[q] = _M2[q]; }
    return out;
  }

  /* Kept as the allocating form for callers and gates that want a plain matrix. */
  function expm(A) {
    var out = new Float64Array(N * N);
    var copy = new Float64Array(N * N);
    for (var q = 0; q < N * N; q++) copy[q] = A[q];
    expmInto(copy, out);
    var r = new Float64Array(N * N);
    for (var z = 0; z < N * N; z++) r[z] = out[z];
    return r;
  }

  /* Advance (P, C[6]) exactly over dt with rho held constant. */
  function advance(P, C, rho, dt) {
    var i, q;
    for (q = 0; q < N * N; q++) _A[q] = 0;
    _A[0] = (rho - DELAYED.beta) / DELAYED.Lambda;
    for (i = 0; i < 6; i++) {
      _A[0 * N + (1 + i)] = DELAYED.lambda_i[i];
      _A[(1 + i) * N + 0] = DELAYED.beta_i[i] / DELAYED.Lambda;
      _A[(1 + i) * N + (1 + i)] = -DELAYED.lambda_i[i];
    }
    for (q = 0; q < N * N; q++) _A[q] *= dt;
    expmInto(_A, _E);
    _v[0] = P;
    for (i = 0; i < 6; i++) _v[1 + i] = C[i];
    for (var r = 0; r < N; r++) {
      var acc = 0;
      for (var c = 0; c < N; c++) acc += _E[r * N + c] * _v[c];
      _o[r] = acc;
    }
    return { P: Math.max(0, _o[0]), C: [_o[1], _o[2], _o[3], _o[4], _o[5], _o[6]] };
  }

  /* ================================================================ REACTIVITY */

  /* Moderator coefficient, calibrated ONCE against the sourced anchor but evaluated on REAL water
   * density. The old engine differentiated its own cubic fit; this differentiates Layer 0. */
  var _modK = null;
  function modCoeff(P_mpa) {
    if (_modK !== null) return _modK;
    var Ta = (MOD.anchor_temp_F - 32) * 5 / 9;
    var e = 0.5;
    var dRhodT = (RHO_W(W.h_l(Ta + e, P_mpa), P_mpa) - RHO_W(W.h_l(Ta - e, P_mpa), P_mpa)) / (2 * e);
    _modK = (MOD.anchor_pcm_per_F * 9 / 5 * 1e-5) / dRhodT;
    return _modK;
  }

  /* BORON APPEARS TWICE and porting one half is wrong: the direct worth term, and the density
   * coupling inside the moderator term. Their sum is the differential worth an operator sees, and
   * it is larger cold than at power. */
  function moderatorReactivity(T_c, T_ref_c, B_ppm, P_mpa) {
    var dD = RHO_W(W.h_l(T_c, P_mpa), P_mpa) - RHO_W(W.h_l(T_ref_c, P_mpa), P_mpa);
    return modCoeff(P_mpa) * (1 - B_ppm / MOD.boron_zero_ppm) * dD;
  }

  /* voidReactivity(h_core, P_mpa, B_ppm) — THE OTHER HALF OF THE DENSITY COUPLING, and it was
   * missing in exactly the way the direct boron term was.
   *
   * ⚠ THE FILE'S OWN HEADER OVERSTATED WHAT WAS BUILT. Line 42 claims *"PWR2's moderator
   * coefficient reads real density from L0, so the moderator feedback and the coolant it acts on
   * cannot disagree"*. That is true only while the coolant is SUBCOOLED LIQUID. `moderatorReactivity`
   * above takes a TEMPERATURE and reconstructs a density with `W.h_l(T, P)` — the liquid branch —
   * so it reports the density of liquid water at that temperature whether or not any liquid water
   * is there. A boiling core is invisible to it. There is no void coefficient.
   *
   * MEASURED, 0.005 m2 (50 cm2) break at full power, no ECCS: as the plant depressurises the
   * coolant follows saturation DOWN, so at t = 60 s the core node is at 241 degC and 92.5 % steam
   * while the moderator term sees "liquid water at 241 degC" — DENSER than the 304.5 degC
   * reference — and reports **+3433 pcm**. That is five times prompt critical. Power went from
   * 0.8 % to 4.7e+12 in ONE step and the fuel temperature followed it. **PWR2 had a positive
   * reactivity excursion on every large break**, which is the exact inverse of the defining safety
   * characteristic of an undermoderated PWR: voiding a PWR core shuts it down.
   *
   * THE FIX USES NO NEW CONSTANT. `modCoeff` already converts a density difference into
   * reactivity and is calibrated against the sourced BEAVRS/Watts Bar isothermal coefficients.
   * What was missing is not a coefficient but the DENSITY DEFICIT — the gap between the density
   * the moderator term ASSUMES and the density that is actually in the core:
   *
   *     rho_void = modCoeff * (1 - B/B0) * ( rho(h_core, P) - rho_l_sat(P) ),   0 if subcooled
   *
   * ⚠ IT IS IDENTICALLY ZERO ON A SUBCOOLED CORE, which is what makes it safe to add to a
   * calibrated reactivity balance. `rho_excess`, the critical-boron solve and every existing
   * single-phase gate are untouched BY CONSTRUCTION, not by re-tuning — the same discipline the
   * film coefficient was ruled to follow (owner ruling 2026-08-17, "pin at rated").
   *
   * ⚠ THE REFERENCE IS SATURATED LIQUID AT THE NODE'S PRESSURE, and the first version got this
   * wrong in a way that only showed up at the bottom of a blowdown. It differenced against
   * `rho(h_l(T(h_core), P), P)` — "liquid at the node's own temperature" — which is exact while
   * the node is subcooled and MEANINGLESS once it is not: `T_from_h` clamps a dry node to 800
   * degC, `h_l` then clamps that back to its own 358 degC liquid limit, and at 0.1 MPa the
   * resulting enthalpy is itself two-phase. MEASURED at the state that exposed it — 0.1 MPa,
   * quality 1.0, 0.2022 kg/m3 — the term reported **-7.6 pcm** where the physical deficit is
   * ~958 kg/m3, i.e. about -10,300 pcm. A void coefficient that switches itself off in a fully
   * voided core is worse than none, because it is invisible.
   *
   * Against saturated liquid the deficit is exactly `alpha * (rho_g - rho_f)` for a two-phase
   * node — the textbook definition of what voiding removes — it stays correct for a superheated
   * one, and the subcooled case is an EXACT branch returning zero rather than zero-to-roundoff.
   *
   * ⚠ AND IT IS A LARGE EXTRAPOLATION, DECLARED. The coefficient is fitted over a few degrees of
   * hot zero-power isothermal data, i.e. tens of kg/m3, and this applies it across a deficit of up
   * to ~958 kg/m3. The MAGNITUDE past a few hundred kg/m3 is therefore indicative, not predictive.
   * What survives the extrapolation is the SIGN and the ORDER: a fully voided core reads about
   * -11,500 pcm, so the reactor is held deeply subcritical by any plausible nonlinearity. The
   * alternative is not a better number, it is +3433 pcm and a prompt excursion.
   *
   * CORE NODE, not the leg average, deliberately: the coolant that moderates neutrons is the
   * coolant in the core, and a voided hot leg does not remove moderator from the fuel. The
   * TEMPERATURE term above keeps its leg average untouched. */
  function voidReactivity(h_core, P_mpa, B_ppm) {
    if (h_core === undefined || h_core === null || !isFinite(h_core)) return 0;
    if (h_core <= W.h_f(P_mpa)) return 0;        /* subcooled: no void, EXACTLY zero */
    var D_real = RHO_W(h_core, P_mpa);
    var D_liq  = W.rho_l_sat(W.T_sat(P_mpa));    /* what a liquid-full core would have */
    return modCoeff(P_mpa) * (1 - B_ppm / MOD.boron_zero_ppm) * (D_real - D_liq);
  }

  /* Integral rod worth: the classic sinusoid-corrected ramp. scruve(0)=0 and scruve(1)=1 for ANY K,
   * so the flattening changes only the mid-core differential peak, never total worth.
   * EXPORTED DELIBERATELY: the control layer schedules its rod-channel loop gain on the differential
   * worth, so dropping these breaks the gain schedule. The dependency runs control -> engine. */
  function scruve(pos, K) {
    if (K == null) K = 1;
    return pos - K * Math.sin(2 * Math.PI * pos) / (2 * Math.PI);
  }
  function scruveSlope(pos, K) {
    if (K == null) K = 1;
    return 1 - K * Math.cos(2 * Math.PI * pos);
  }
  function rodReactivity(groups) {
    var rho = 0;
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i], withdrawn = g.steps / g.max_steps;
      rho += -g.worth * scruve(1.0 - withdrawn, RODS.curve_flatten);
    }
    return rho;
  }

  /* ================================================================ STATE */

  function xenonEq(P) {
    var I_eq = XENON.gamma_I * P / XENON.lambda_I;
    return (XENON.lambda_I * I_eq + XENON.gamma_X * P) /
           (XENON.lambda_X + OPEN.sigma_phi.value * P);
  }

  function createKinetics(opts) {
    opts = opts || {};
    var P0 = opts.P === undefined ? 1.0 : opts.P;
    /* PRECURSORS START AT EQUILIBRIUM WITH P0, INCLUDING THE 1/Lambda SCALING. Get that convention
     * wrong and every initial condition jumps on the first step — the production term below is
     * beta_i/Lambda, so the equilibrium state must carry the matching 1/Lambda. */
    var C = [];
    for (var i = 0; i < 6; i++) {
      C.push((DELAYED.beta_i[i] / DELAYED.lambda_i[i]) * P0 / DELAYED.Lambda);
    }
    var H = [];
    for (var j = 0; j < 4; j++) H.push(DECAY.H0[j] * P0);
    return {
      P: P0,
      C: opts.C === undefined ? C : opts.C,
      H: opts.H === undefined ? H : opts.H,
      I: opts.I === undefined ? XENON.gamma_I * P0 / XENON.lambda_I : opts.I,
      X: opts.X === undefined ? xenonEq(P0) : opts.X,
      X_eq_full: xenonEq(1.0),          /* the FULL-POWER normaliser, fixed */
      /* Feedback references. Both feedbacks are zero at these by construction, so they are
       * perturbative about the reference condition rather than absolute. */
      T_fuel_ref_c: opts.T_fuel_ref_c === undefined ? DEFAULT_T_FUEL_REF : opts.T_fuel_ref_c,
      T_mod_ref_c:  opts.T_mod_ref_c  === undefined ? DEFAULT_T_MOD_REF  : opts.T_mod_ref_c,
      /* DEFAULTS TO THE SOLVE, not to zero. A zero default is a plant with ~9 750 pcm of
       * unopposed boron holddown that cannot be made critical at any boron concentration, which
       * is a silent way to ship a core that will not start up. */
      rho_excess:   opts.rho_excess === undefined
                      ? solveRhoExcess({ T_fuel_ref_c: opts.T_fuel_ref_c,
                                         T_mod_ref_c:  opts.T_mod_ref_c })
                      : opts.rho_excess,
      rho_last:     0,
      rho_valid:    false
    };
  }

  /* stepKinetics(kin, sys, dt, drivers) -> { power, Q_total_frac, rho, ... }
   *   drivers.fuelTemp_c  REQUIRED until pwr2_fuel.js exists. This file will NOT invent one.
   *   drivers.boron_ppm   lumped, from CVCS (owner ruling 2026-08-16)
   *   drivers.rodGroups   [{ steps, max_steps, worth }]
   *
   * rho is evaluated at the step MIDPOINT per §15's error analysis, which measured frozen-start-of-
   * step rho at 2.2e-1 relative error for a 0.1 dk/s ramp; a real scram is 0.016-0.024 dk/s. */
  function reactivity(kin, T_mod_c, T_fuel_c, B_ppm, rodGroups, P_mpa, h_core) {
    var rho_rods = rodGroups ? rodReactivity(rodGroups) : 0;
    var rho_dop  = OPEN.alpha_D.value * (T_fuel_c - kin.T_fuel_ref_c);
    var rho_mod  = moderatorReactivity(T_mod_c, kin.T_mod_ref_c, B_ppm, P_mpa);
    /* THE VOID HALF of the density coupling. Omitted when the caller has no core enthalpy to
     * offer — `critical()` and `boronWorth()` are single-phase by definition — and zero to
     * roundoff whenever the core is subcooled, so it can never move a calibration. */
    var rho_void = voidReactivity(h_core, P_mpa, B_ppm);
    /* THE DIRECT BORON TERM — the half that was missing. Boron is a poison, so it is strictly
     * negative and it acts AT ANY TEMPERATURE, including the reference where the density coupling
     * above contributes exactly nothing. */
    var rho_bor  = -BORON.worth_per_ppm * B_ppm;
    var rho_xe   = -OPEN.xenon_worth.value * (kin.X / kin.X_eq_full);
    return kin.rho_excess + rho_rods + rho_dop + rho_mod + rho_void + rho_bor + rho_xe;
  }

  /* solveRhoExcess(opts) — rho_excess is a SOLVE, not a number, and this is the algebra.
   *
   * It has no direct observable, so it is whatever makes the plant critical at the one startup
   * condition we hold a real measurement for: all rods out, no xenon, 975 ppm, 291.67 degC. Set
   * rho = 0 there and everything else is known:
   *
   *   0 = rho_excess + 0(ARO) + alpha_D*(T - T_fuel_ref) + rho_mod(T, B) - worth*B + 0(no xenon)
   *
   * At zero power the fuel sits at the moderator temperature — there is no heat to drive a rise —
   * so the SAME T goes into both feedbacks.
   *
   * ⚠ RE-SOLVE IT whenever the Doppler coefficient, the moderator block, the boron worth or either
   * reference temperature moves. All four have moved in this port: the moderator coefficient now
   * reads real Layer 0 density, the boron term did not previously exist, and the fuel reference
   * came down from 693 to the value pwr2_fuel derives. A stale rho_excess is invisible — it just
   * puts the plant critical at the wrong boron. */
  function solveRhoExcess(opts) {
    opts = opts || {};
    var T      = opts.temp_c   === undefined ? HZP.temp_c   : opts.temp_c;
    var B      = opts.boron_ppm === undefined ? HZP.boron_ppm : opts.boron_ppm;
    var P      = opts.P_mpa    === undefined ? HZP.P_mpa    : opts.P_mpa;
    var TfRef  = opts.T_fuel_ref_c === undefined ? DEFAULT_T_FUEL_REF : opts.T_fuel_ref_c;
    var TmRef  = opts.T_mod_ref_c  === undefined ? DEFAULT_T_MOD_REF  : opts.T_mod_ref_c;
    var rho_dop = OPEN.alpha_D.value * (T - TfRef);
    var rho_mod = moderatorReactivity(T, TmRef, B, P);
    var rho_bor = -BORON.worth_per_ppm * B;
    return -(rho_dop + rho_mod + rho_bor);
  }

  /* criticalBoron(kin, T_c, P_mpa) — the inverse, and the check that the solve actually landed.
   * Reactivity is LINEAR in boron (a direct term plus a density coupling that scales as 1 - B/B0),
   * so this is a quadratic-free closed solve rather than an iteration: evaluate rho at two boron
   * concentrations and interpolate to zero. */
  /* ⚠ XENON IS AN EXPLICIT ARGUMENT, NOT INHERITED FROM `kin`. The first version called
   * `reactivity()`, which reads the kinetics object's live xenon inventory — and a kinetics object
   * built at rated power carries equilibrium xenon worth ~2 500 pcm. The anchor it is being
   * compared against is BOL ZERO XENON, so the check returned 747 ppm against a 975 ppm target and
   * looked like a failed solve. It was a failed COMPARISON: the two sides were at different xenon.
   * Defaulting to the object's own state would make that mistake the easy one to repeat. */
  /* ⚠ THE FUEL TEMPERATURE IS A SEPARATE ARGUMENT, AND OMITTING IT MEANS ZERO POWER.
   *
   * The first version had no such argument and evaluated Doppler at `T_c` — the moderator
   * temperature — for both feedbacks. That is correct ONLY at zero power, where there is no heat
   * to drive a fuel-to-coolant rise, and it is the condition the 975 ppm anchor is measured at.
   * Used at RATED power it is wrong by alpha_D * (T_fuel_hfp - 304.5) — 693 pcm as measured
   * below on the then-current stack (T_fuel 581.8; the shipped h_gap solve puts it at 684.2,
   * making the error ~949 pcm today) — because the fuel is hundreds of degC above the coolant
   * and the function assumed it was not.
   *
   * MEASURED, using it to trim boron at rated: the plant started 693 pcm subcritical, power fell
   * to 43 %, and it then bought the reactivity back by COOLING 16 degC — settling at a Tavg of
   * 551 degF where the design point is 580. Every absolute temperature downstream of that was
   * wrong, and nothing was red: the plant was self-consistent, critical, and stable at the wrong
   * place. A zero-power function used at power fails QUIETLY, which is why the argument is now
   * explicit and this comment is this long. */
  function criticalBoron(kin, T_c, P_mpa, rodGroups, xeFrac, T_fuel_c) {
    if (xeFrac === undefined) xeFrac = 0;
    if (T_fuel_c === undefined) T_fuel_c = T_c;      /* zero power: fuel sits at the moderator */
    var base = kin.rho_excess
             + (rodGroups ? rodReactivity(rodGroups) : 0)
             + OPEN.alpha_D.value * (T_fuel_c - kin.T_fuel_ref_c)
             - OPEN.xenon_worth.value * xeFrac;
    var r0 = base + moderatorReactivity(T_c, kin.T_mod_ref_c, 0, P_mpa);
    var r1 = base + moderatorReactivity(T_c, kin.T_mod_ref_c, 1000, P_mpa)
                  - BORON.worth_per_ppm * 1000;
    if (r1 === r0) return NaN;
    return 1000 * r0 / (r0 - r1);
  }

  function stepKinetics(kin, sys, dt, drivers) {
    drivers = drivers || {};
    if (drivers.fuelTemp_c === undefined) {
      throw new Error('pwr2_kinetics: drivers.fuelTemp_c is REQUIRED — pwr2_fuel.js is not built ' +
                      'and this layer will not invent a fuel temperature for Doppler to read.');
    }
    var P_mpa = sys.P;
    var T_mod = drivers.modTemp_c;
    if (T_mod === undefined) {
      /* mass-weighted primary average over the LEGS, the same pair pwr2_sg.primaryTavg uses */
      var hot = null, cold = null;
      for (var i = 0; i < sys.nodes.length; i++) {
        if (sys.nodes[i].id === 'hot_leg') hot = sys.nodes[i];
        else if (sys.nodes[i].id === 'cold_leg') cold = sys.nodes[i];
      }
      T_mod = 0.5 * (W.T_from_h(hot.h, P_mpa) + W.T_from_h(cold.h, P_mpa));
    }
    var B = drivers.boron_ppm === undefined ? 0 : drivers.boron_ppm;

    /* THE CORE NODE'S ACTUAL ENTHALPY, for the void half of the density coupling. Read from the
     * plant rather than reconstructed from a temperature — that reconstruction is precisely the
     * blind spot `voidReactivity` exists to close. A system with no `core` node (Layer 2 fixtures
     * name their nodes freely) leaves it undefined and the void term is simply absent. */
    var h_core;
    for (var ci = 0; ci < sys.nodes.length; ci++) {
      if (sys.nodes[ci].id === 'core') { h_core = sys.nodes[ci].h; break; }
    }

    /* ---- MIDPOINT rho, AND THE FIRST ATTEMPT AT IT WAS A NO-OP THAT COST HALF THE RUNTIME.
     *
     * It took a trial half-step and re-evaluated reactivity from the result. But WITH EVERY DRIVER
     * FROZEN, rho CANNOT MOVE WITHIN A STEP: fuel and moderator temperature, boron and rod position
     * are all supplied by the caller and constant across the call, and xenon is updated after the
     * advance. The trial step's own line gave it away —
     *
     *     X: half.P >= 0 ? kin.X : kin.X          both branches identical
     *
     * so rhoMid was identically rho0, the extra matrix exponential was discarded, and the midpoint
     * §15 asked for was never implemented. MEASURED: 72.8 us per step, 63 of it in two advance()
     * calls where one was doing nothing.
     *
     * WHAT §15 ACTUALLY WANTS is protection against a RAMPING rho — it measures frozen-start-of-step
     * rho at 2.2e-1 relative error for a 0.1 dk/s ramp, against a real scram at 0.016-0.024 dk/s.
     * A ramp is a property of the SEQUENCE of steps, not of anything inside one, so the midpoint is
     * estimated by extrapolating the rate the caller is actually driving:
     *
     *     rho_mid = rho_now + 0.5 * (rho_now - rho_prev)
     *
     * That costs nothing, captures the ramp §15 was worried about, and degrades to rho_now on the
     * first step and whenever rho is steady — which is exactly right, because then there is no ramp
     * to correct for. */
    var rhoNow = reactivity(kin, T_mod, drivers.fuelTemp_c, B, drivers.rodGroups, P_mpa, h_core);
    var rhoMid = kin.rho_valid ? rhoNow + 0.5 * (rhoNow - kin.rho_last) : rhoNow;
    kin.rho_valid = true;

    var adv = advance(kin.P, kin.C, rhoMid, dt);
    kin.P = adv.P;
    kin.C = adv.C;
    kin.rho_last = rhoNow;   /* the RAW value, so the next step's ramp estimate is honest */

    /* XENON — explicit is fine: the fastest constant here is ~2.9e-5 /s against dt = 0.02. */
    var dI = XENON.gamma_I * kin.P - XENON.lambda_I * kin.I;
    var dX = XENON.lambda_I * kin.I + XENON.gamma_X * kin.P
           - XENON.lambda_X * kin.X - OPEN.sigma_phi.value * kin.P * kin.X;
    kin.I += dI * dt;
    kin.X += dX * dt;

    /* DECAY HEAT — four groups relaxing toward H_i0 * P. */
    for (var j = 0; j < 4; j++) {
      kin.H[j] += (DECAY.H0[j] * DECAY.lambda[j] * kin.P - DECAY.lambda[j] * kin.H[j]) * dt;
    }
    var Hsum = kin.H[0] + kin.H[1] + kin.H[2] + kin.H[3];

    /* THE SPLIT, AND IT MUST STAY HONEST. Total core heat is fission scaled by (1 - f0) plus the
     * tracked decay inventory. At ANY steady state P*(1-f0) + f0*P = P exactly, so no calibration
     * moves; after a scram it reduces to the decay tail with no discontinuity.
     *
     * `power` is FISSION ALONE. `Q_total_frac` is TOTAL. They are equal at every steady state and
     * diverge the moment the rods drop — CLAUDE.md and CONTEXT.md §6.3 both carry this trap,
     * because reading fission power as core heat is wrong from the instant of a scram. */
    var Q_total = kin.P * (1 - f0()) + Hsum;

    return {
      power: kin.P,
      Q_total_frac: Q_total,
      decay_frac: Hsum,
      rho: rhoMid,
      rho_pcm: rhoMid * 1e5,
      xenon_pct_eq: (kin.X / kin.X_eq_full) * 100,
      T_mod_c: T_mod,
      /* REPORTED so a caller can see the split without recomputing it. */
      fission_frac: kin.P
    };
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.kinetics = {
    DELAYED: DELAYED, DECAY: DECAY, XENON: XENON, MOD: MOD, RODS: RODS, OPEN: OPEN,
    BORON: BORON, HZP: HZP,
    solveRhoExcess: solveRhoExcess, criticalBoron: criticalBoron,
    createKinetics: createKinetics, stepKinetics: stepKinetics,
    advance: advance, expm: expm, reactivity: reactivity,
    modCoeff: modCoeff, moderatorReactivity: moderatorReactivity,
    voidReactivity: voidReactivity,
    rodReactivity: rodReactivity, scruve: scruve, scruveSlope: scruveSlope,
    xenonEq: xenonEq, f0: f0
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
