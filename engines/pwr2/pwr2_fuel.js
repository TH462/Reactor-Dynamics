/* pwr2_fuel.js — Layer 5: THE LUMPED FUEL NODE. (#479)
 *
 * Doppler's lever arm. `pwr2_kinetics.js` REFUSES to run without a fuel temperature — it throws
 * rather than invent one — so this file is what makes the reactivity loop close.
 *
 * ---------------------------------------------------------------------------------------
 * THE MODEL
 *
 *     M_fuel * cp(T_f) * dT_f/dt = Q_fuel - UA * (T_f - T_cool)
 *
 * `T_f` is the VOLUME-AVERAGE fuel temperature, because that is what Doppler broadening integrates
 * over. It is NOT the centerline temperature, which is ~1.5x higher and is the number a real plant
 * quotes against its melt limit. Reported separately below so the two cannot be confused.
 *
 * ⚠ ADVANCED ANALYTICALLY, for the same reason kinetics is. With the coefficients frozen over a
 * step this is a first-order linear ODE with a closed form:
 *
 *     T_f(t+dt) = T_eq + (T_f - T_eq) * exp(-dt/tau),   T_eq = T_cool + Q/UA,  tau = M*cp/UA
 *
 * That is EXACT for constant coefficients, unconditionally stable at any dt, and costs one exp()
 * against Euler's one multiply. MEASURED tau = 3.70 s against PHYSICS_DT = 0.02, so Euler would
 * also be stable HERE — the analytic form is used because stability then does not depend on a
 * caller's timestep choice, and the Courant finding (D1 §32) is the record of what happens when a
 * timestep assumption goes unstated.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS SOURCED, WHAT IS BOUNDED, AND WHAT IS OPEN — the three are kept STRUCTURALLY APART so
 * that nothing can cite an unsourced number by accident. Same discipline as pwr2_kinetics.js.
 *
 * SOURCED — ML050910161 (WCAP-16009-NP-A Rev 0, January 2005), Figure 3-1, captioned verbatim
 * "FLECHT-SEASET Bundle (Westinghouse 17x17 Fuel Assembly Lattice)":
 *
 *     rod diameter   0.374 in  (9.50 mm)
 *     rod pitch      0.496 in  (12.6 mm)
 *     thimble        0.474 in  (12.0 mm)
 *
 * The page is OCR-mangled ("ROD DIAMfEtR", "10.374 hi.") and is readable ONLY because the metric
 * and US columns cross-check each other — D1 §34 records that a grep wanting clean text returns
 * zero on a document that has the number.
 *
 * BOUNDED — pellet diameter and clad thickness are in NO document in any lane (0 hits, 35 docs,
 * 3 lanes). But the rod OD is sourced, so they are not free: pellet = rod_OD - 2*(clad + gap).
 * Sweeping the whole plausible range moves M_fuel by +/-6 % and moves the STEADY-STATE RISE BY
 * NOTHING AT ALL, because M_fuel does not appear in T_f - T_cool = Q/UA. D1 §34.2 has the table.
 *
 * OPEN — the thermal properties. `find_source` returns ZERO for numeric gap conductance and for
 * UO2 specific heat; 10 CFR 50 App. K names MATPRO-11 Rev. 1 as the authority without our corpus
 * carrying it. These are the numbers an evidence pass owes, and they live in OPEN below.
 *
 * ---------------------------------------------------------------------------------------
 * THE ACTIVE HEIGHT IS DERIVED, NOT ASSUMED — and this is the check that makes the whole lattice
 * reading credible. From the SOURCED rod pitch, assembly pitch = 17 * 0.496 in = 8.432 in. Against
 * the core envelope already in pwr2_geometry.js (21 assemblies, 3.53 m3) that gives H = 12.02 ft.
 *
 * Two independent confirmations, neither constructed to agree:
 *   - the envelope basis reproduces the `core` node's stored coolant volume, 2.062 vs 2.061 m3;
 *   - assuming 12 ft instead and DERIVING assembly pitch gives 8.440 in, against 8.432 from the
 *     sourced rod pitch — 0.09 %. Two routes, one from a volume and one from a pitch, agree.
 * A real Westinghouse 17x17 assembly pitch is 8.466 in; the 0.034 in we are short of it is the
 * inter-assembly water gap, which this lattice-only arithmetic does not include. That the residual
 * has the right SIGN and MAGNITUDE for a known physical feature is the third check.
 */
(function (root) {
  'use strict';

  var IN = 0.0254;                 /* in -> m */

  /* ---- SOURCED: ML050910161 Fig 3-1, Westinghouse 17x17 lattice ----------------------------
   * All three numbers verified against the page IMAGE, not just the OCR text layer (audit #488
   * B5 + follow-up): the pitch's last digit is OCR-ambiguous (the text layer reads "0.495") and
   * was settled by glyph comparison at 2400 dpi — the printed digit is the figure's own "6",
   * so 0.496 in / 12.6 mm stands 3-for-3 with the rod OD and thimble cross-checks.
   * ⚠ THE FIGURE IS A 161-ROD FLECHT-SEASET TEST BUNDLE. It sources the LATTICE (OD, pitch,
   * thimble); the full-assembly LAYOUT below (289 positions, 24 thimbles + 1 instrument tube)
   * is [recalled] — correct for a real W 17x17, but no document in the corpus states it, and it
   * shipped untagged in this block's sourced adjacency (audit B5.3). */
  var GEOM = {
    kind:        '[sourced]',      /* the three lattice dimensions; the 264-rod layout is [recalled] */
    rod_od_in:   0.374,            /* 9.50 mm */
    rod_pitch_in:0.496,            /* 12.6 mm */
    thimble_in:  0.474,            /* 12.0 mm */
    lattice_n:   17,
    src: 'ML050910161 (WCAP-16009-NP-A Rev 0, Jan 2005) Fig 3-1 "Westinghouse 17x17 Fuel Assembly Lattice"'
  };

  /* ---- BOUNDED: not in any lane's corpus, but constrained by the sourced rod OD ------------- */
  var SPLIT = {
    kind:          '[recalled]',
    clad_t_in:     0.0225,
    gap_t_in:      0.00325,        /* radial; pellet = rod_od - 2*(clad + gap) = 0.3225 in */
    why: 'Pellet diameter and clad thickness return 0 hits across 35 documents in 3 lanes. The ' +
         'sourced rod OD bounds them, but the bound is NARROWER than it used to claim (re-swept ' +
         'by audit #488 B6 after the clad became a thermal node): over clad 0.020-0.026 in the ' +
         'steady fuel rise moves ~2 % (was quoted 0 % -- clad thickness now participates in the ' +
         'stack), the damage timeline ~1 %, and -- the term the old bound never covered -- ' +
         'M_clad moves -10/+14 %, so TERMINAL HYDROGEN and every 50.46 criterion-3 figure carry ' +
         'a +/-12 % width (84.5-108.0 kg) from this unsourced 0.006-inch spread. Do not cite ' +
         'the old "M_fuel +/-6 %, rise 0 %" form for the damage chain.'
  };

  /* ---- OPEN: unsourced, and an evidence pass owes every one of these ------------------------ */
  var OPEN = {
    h_gap: {
      value: 3000,                 /* W/m2K — SOLVED, see below */
      why: 'Gap conductance. No STEADY-STATE value in the corpus (the categorical "zero hits" ' +
           'this used to claim was false -- Ginna ch15 sec 15.3.2.4.2 carries 10,000 ' +
           'Btu/hr-ft2-F (56,780 W/m2K) as a TRANSIENT bounding assumption, ~19x this steady ' +
           'value; audit #488 A1.4), and 10 CFR 50 App. K names MATPRO-11 Rev. 1 without our ' +
           'holding it. So it is SOLVED rather than recalled, the same pattern as rho_excess: ' +
           'it is whatever makes the DOPPLER DEFECT come out at the sourced figure. Ginna ' +
           'UFSAR ch15 (ML20339A101) rod-ejection table: "Doppler defect, pcm 1000 1000 950 ' +
           '950". 3000 W/m2K gives 981 pcm, mid-range. D1 section 35. TWO CAVEATS THE SOLVE ' +
           'CARRIES (audit #488 A1.2/A1.3): (1) the defect is alpha_D * dT_fuel, so ONE anchor ' +
           'pins the PRODUCT of two unknowns -- re-source alpha_D (itself an OPEN linear ' +
           'placeholder) and h_gap re-solves in inverse proportion, taking every fuel ' +
           'temperature with it; (2) the anchor is another plant\'s rod-ejection LICENSING ' +
           'input (post-uprate Ginna, 1811 MWt, 14x14, a conservative figure at a materially ' +
           'higher linear heat rate than this plant\'s 4.39 kW/ft) -- the quantity KIND is ' +
           'right, the NUMBER is a transplant.'
    },
    k_clad: {
      value: 16.0,                 /* W/mK, Zircaloy */
      why: 'Zircaloy thermal conductivity. UNSOURCED. Contributes 5.7 % of the total resistance, ' +
           'so a 20 % error here is a 1 % error in the fuel rise.'
    },
    h_film: {
      value: 30000,                /* W/m2K — the RATED value; see filmCoefficient() */
      why: 'Clad-to-coolant film coefficient AT RATED CONDITIONS. Still UNSOURCED as a level, ' +
           'but no longer a constant: filmCoefficient() scales it with the coolant the rods are ' +
           'actually sitting in. It is the anchor the regime factors multiply, and they are ' +
           'EXACTLY 1 at rated, so this number keeps the meaning it was solved alongside.'
    },
    /* ---- THE REGIME FACTORS. What used to be "h_film is a constant, and the consequence is that
     * the fuel rise does not grow when flow is lost" (this file's own words until 2026-08-17).
     * Three numbers, each doing a distinct job, none of them chosen to make anything come out. */
    dittus_exp: {
      value: 0.8,
      why: '[sourced-form] The Reynolds exponent in Dittus-Boelter, h ~ G^0.8 -- and the ' +
           'CORRELATION is named in the corpus: Ginna UFSAR ch15 (ML20339A101), verbatim, ' +
           '"FACTRAN uses the Dittus-Boelter or Jens-Lottes correlation to determine the film ' +
           'heat transfer before DNB". 0.8 is that correlation\'s defining exponent, so the ' +
           'form is sourced even though no document types the digit (this entry shipped ' +
           'claiming the corpus had nothing; audit #488 D12 refuted that). It is the term that ' +
           'carries the collapse of forced convection as the loop flow decays.'
    },
    vapor_ratio: {
      value: 0.5,
      why: '[derived] Film coefficient in pure vapour against pure liquid AT THE SAME MASS ' +
           'FLUX, from the Dittus-Boelter property group (k^0.6 * cp^0.4 * mu^-0.4)_g / (...)_f ' +
           '-- and since 2026-08-18 the properties are IN-CORPUS: WCAP-16009-NP-A ' +
           '(ML050910161) Table 10-3 "Vessel Component Saturated Water Thermal Properties" ' +
           '(90 saturation rows, read from the page image -- the OCR text layer is mangled). ' +
           'Evaluated on the table\'s own rows: 0.403 at 502 psia, 0.495 at 1050 psia, 0.535 ' +
           'at 1260 psia, 0.551 at 1334 psia -- so 0.5 is the representative constant of a ' +
           'sourced 0.40-0.55 band over the blowdown regime, not a recalled point. ' +
           'Cross-check: the same document\'s vapor correlations (eqs 10-20..10-23, ASME 1968 ' +
           'forms) reproduce the table\'s k_g at 300 degC to 3 % and mu_g to 0.3 %. The old ' +
           'claim here -- "the corpus has neither" conductivity nor viscosity -- was false ' +
           '(audit #488 D12). The real collapse on a voided core still comes from the FLOW ' +
           'term, not this one.'
    },
    h_stagnant: {
      value: 10,                   /* W/m2K */
      why: 'The floor when forced flow stops: natural convection from a rod to a gas, textbook ' +
           'range 5-25 W/m2K. UNSOURCED. It exists because h ~ G^0.8 goes to ZERO at zero flow ' +
           'and a rod with no heat sink at all has an infinite temperature rise, which is not ' +
           'physics, it is a missing regime. ⚠ AND IT ALMOST NEVER BINDS (audit #488 D11, ' +
           'refuting this file\'s original "decides whether core damage is reachable" claim): ' +
           'the pump-density equilibrium leaves a RESIDUAL forced flow, and the forced term ' +
           'evaluated there (min 23.1 W/m2K pump-on, 10.2 tripped) stays at or above this ' +
           'floor -- measured, the floor bound for 0.0 s of a 1200 s damage ride, and sweeping ' +
           'it 5-25 moved the timeline at most ~10 %. What actually sets the low-flow film ' +
           'coefficient is h_film * flowFrac^dittus_exp * phase at that residual flow -- i.e. ' +
           'dittus_exp, vapor_ratio and the pump density coupling, not this number.'
    },
    q_to_fuel: {
      value: 0.974,
      why: 'Fraction of fission energy deposited in the fuel; the balance is prompt gamma and ' +
           'neutron slowing-down deposited directly in the moderator. UNSOURCED (~2.6 % direct ' +
           'is the standard figure). Acts as a straight scale on the fuel rise.'
    }
  };

  /* ---- UO2 PROPERTIES -----------------------------------------------------------------------
   * Fink's correlations (J. Nucl. Mater. 279, 2000). RECALLED — not in the corpus — but unlike a
   * bare constant these are FALSIFIABLE, because a correlation has to reproduce anchor values at
   * more than one temperature. Both do, and the gate checks it:
   *
   *     cp   235 J/kgK at 300 K,  311 J/kgK at 1000 K
   *     k    7.6 W/mK  at 300 K,  3.5 W/mK  at 1000 K
   *
   * A recalled correlation that hits four independent anchors is stronger evidence than a recalled
   * scalar, which can only ever agree with itself. It is still not a source. */
  var M_MOL_UO2 = 0.270028;        /* kg/mol */
  var RHO_UO2   = 10410;           /* kg/m3 — 95 % of 10 960 theoretical density. RECALLED. */

  /* ---- ZIRCALOY PROPERTIES, for the clad THERMAL NODE ---------------------------------------
   * Both UNSOURCED and both in OPEN's spirit rather than under a `[recalled]` tag, which D1 §2
   * reserves for values the owner has ruled may stand and warns against extending. They sit here
   * beside RHO_UO2 because they play the same role: a density and a specific heat that set a
   * THERMAL MASS, i.e. a time constant, not a temperature.
   *
   * WHAT THEY BUY, and why the clad cannot stay algebraic: Baker-Just is an exponential in
   * temperature integrated over time, so a clad temperature that STEPS the instant cooling is
   * lost gives a badly wrong oxidation history. The clad's small heat capacity is precisely why
   * real clad temperatures ramp over tens of seconds rather than jumping, as at TMI-2.
   *
   * `RHO_ZR` is also the zirconium INVENTORY the metal/water reaction consumes, so it is one
   * number doing two jobs and it is cross-checkable: the clad-only mass it gives is 2136 kg
   * against 2554 kg from GEND-061's TMI-2 whole-core figure (23,600 kg at 2772 MWt) scaled on
   * power — 83.6 %, with the balance the guide thimbles and spacer grids a whole-core figure
   * includes and a clad-only calculation cannot. Right sign, right size, independent route. */
  var RHO_ZR = 6560;               /* kg/m3, Zircaloy-4. UNSOURCED. */
  var CP_ZR  = 330;                /* J/kg/K near 600 K. UNSOURCED; weakly temperature-dependent
                                    * and carried as a constant, which sets a time constant and
                                    * not a temperature. */

  function cp_uo2(T_k) {           /* J/kg/K */
    var t = T_k / 1000;
    var cp_mol = 52.1743 + 87.951 * t - 84.2411 * t * t + 31.542 * t * t * t
               - 2.6334 * t * t * t * t - 0.71391 / (t * t);
    return cp_mol / M_MOL_UO2;
  }

  function k_uo2(T_k) {            /* W/m/K */
    var t = T_k / 1000;
    return 100 / (7.5408 + 17.692 * t + 3.6142 * t * t)
         + 6400 / Math.pow(t, 2.5) * Math.exp(-16.35 / t);
  }

  /* ---- DERIVED GEOMETRY ---------------------------------------------------------------------
   * Everything below falls out of GEOM + SPLIT + the core envelope already in pwr2_geometry.js.
   * NOTHING here is a free parameter. */
  function deriveGeometry(opts) {
    opts = opts || {};
    var nAssy    = opts.n_assemblies === undefined ? 21   : opts.n_assemblies;
    var envelope = opts.envelope_m3  === undefined ? 3.53 : opts.envelope_m3;   /* all assemblies */

    var rod_od    = GEOM.rod_od_in * IN;
    var pellet_in = GEOM.rod_od_in - 2 * (SPLIT.clad_t_in + SPLIT.gap_t_in);
    var pellet    = pellet_in * IN;
    var clad_ri   = pellet / 2 + SPLIT.gap_t_in * IN;
    var clad_ro   = rod_od / 2;

    /* 17x17 = 289 positions, less 24 guide thimbles and 1 instrument tube = 264 fuel rods.
     * [recalled] — see the GEOM header: the sourced figure shows a 161-rod test bundle, and no
     * corpus document states the full-assembly layout. */
    var nRod = GEOM.lattice_n * GEOM.lattice_n - 25;

    /* ACTIVE HEIGHT — derived, see the header. Assembly pitch from the SOURCED rod pitch. */
    var assyPitch = GEOM.lattice_n * GEOM.rod_pitch_in * IN;
    var H = (envelope / nAssy) / (assyPitch * assyPitch);

    var nRodTotal = nRod * nAssy;
    var V_fuel    = Math.PI / 4 * pellet * pellet * H * nRodTotal;
    var rodLenTot = nRodTotal * H;

    /* THE CLAD AS A BODY, not just a resistance. Annulus area x total rod length gives its
     * volume; its outer surface is what the coolant touches and what the metal/water reaction
     * happens on. Nothing new is assumed — clad_ri and clad_ro are already fixed by the SOURCED
     * rod OD and the bounded split above. */
    var A_annulus = Math.PI * (clad_ro * clad_ro - clad_ri * clad_ri);   /* m2 per rod */
    var V_clad    = A_annulus * rodLenTot;
    var S_clad    = Math.PI * rod_od * rodLenTot;                        /* outer surface, m2 */

    return {
      rod_od_m: rod_od, pellet_m: pellet, pellet_in: pellet_in,
      clad_ri_m: clad_ri, clad_ro_m: clad_ro,
      n_rod_per_assy: nRod, n_rod_total: nRodTotal, n_assemblies: nAssy,
      assy_pitch_in: assyPitch / IN,
      H_m: H, H_ft: H / 0.3048,
      V_fuel_m3: V_fuel,
      M_fuel_kg: V_fuel * RHO_UO2,
      rod_length_total_m: rodLenTot,
      clad_annulus_m2: A_annulus,
      V_clad_m3: V_clad,
      M_clad_kg: V_clad * RHO_ZR,
      clad_surface_m2: S_clad
    };
  }

  /* filmCoefficient(flowFrac, voidFrac) -> W/m2K
   *
   * voidFrac is the homogeneous VOID FRACTION — the volume fraction, which is what a
   * (1-void) + void*ratio blend is written against. It shipped receiving QUALITY from
   * coreRegime (5-16x smaller in the two-phase range), which made the phase factor read 0.989
   * where the void form gives 0.906 at 18.8 % true void (#490, audit #488 D10.2).
   *
   * The clad-to-coolant coefficient, as a function of what the coolant is DOING rather than as a
   * constant. Two multiplicative factors on the rated anchor, plus a floor:
   *
   *     forced = h_rated * flowFrac^0.8 * [ (1-void) + void*vapor_ratio ]
   *     h      = max(h_stagnant, forced)
   *
   * ⚠ EXACTLY THE RATED VALUE AT RATED, by construction: flowFrac = 1 and voidFrac = 0 give
   * 30000 * 1 * 1, and the floor is far below it. That is what lets this be added to a resistance
   * stack whose gap conductance is SOLVED against a sourced Doppler defect without re-opening the
   * solve — the owner's "pin at rated" ruling, 2026-08-17.
   *
   * THE FLOW TERM DOES THE WORK, NOT THE PHASE TERM. Vapour at the same mass flux transfers about
   * half as well as liquid; what actually collapses cooling on a voided core is that the loop
   * STOPS — measured, `mdot_loop` falls 1630 -> 14 kg/s through a small-break blowdown once the
   * pump knows what it is pumping (D4 §36). At 14 kg/s and quality 1 the forced term is worth
   * ~340 W/m2K against 30,000 at rated.
   *
   * ⚠ DECLARED SIMPLIFICATION — NO DEPARTURE FROM NUCLEATE BOILING AND NO FILM-BOILING
   * CORRELATION. Ginna UFSAR ch15 (ML20339A101) NAMES Bishop-Sandberg-Tong as what VIPRE uses for
   * the peak-clad-temperature calculation, and does not give its form or its coefficients; the
   * corpus has neither. So this blends smoothly on void instead of switching at critical heat
   * flux. DIRECTION OF ERROR: optimistic — early clad heat-up is too slow — which means this
   * model may not claim oxidation ONSET TIMING, only that the reaction runs once the core is dry.
   * Having the document is not having the number.
   */
  function filmCoefficient(flowFrac, voidFrac) {
    var f = flowFrac > 0 ? flowFrac : 0;
    var v = voidFrac < 0 ? 0 : (voidFrac > 1 ? 1 : voidFrac);
    var phase  = (1 - v) + v * OPEN.vapor_ratio.value;
    var forced = OPEN.h_film.value * Math.pow(f, OPEN.dittus_exp.value) * phase;
    return forced > OPEN.h_stagnant.value ? forced : OPEN.h_stagnant.value;
  }

  /* ---- THE RESISTANCE STACK -----------------------------------------------------------------
   * Per unit length of one rod, volume-average fuel -> bulk coolant:
   *
   *   pellet  1/(8*pi*k_f)          <- volume-average to surface with UNIFORM generation.
   *                                    NOT 1/(4*pi*k_f), which is centerline-to-surface. Using the
   *                                    centerline form would overstate the average by exactly 2x
   *                                    on this term and is the easy mistake here.
   *   gap     1/(pi*d_pellet*h_gap)
   *   clad    ln(ro/ri)/(2*pi*k_c)
   *   film    1/(pi*d_rod*h_film)
   *
   * k_f is temperature-dependent, so UA is evaluated at the CURRENT fuel temperature each step. */
  function conductance(g, T_f_k, hFilm) {
    var k_f = k_uo2(T_f_k);
    var h_f = hFilm === undefined ? OPEN.h_film.value : hFilm;
    var r_pellet = 1 / (8 * Math.PI * k_f);
    var r_gap    = 1 / (Math.PI * g.pellet_m * OPEN.h_gap.value);
    var r_clad   = Math.log(g.clad_ro_m / g.clad_ri_m) / (2 * Math.PI * OPEN.k_clad.value);
    var r_film   = 1 / (Math.PI * g.rod_od_m * h_f);
    var r_total  = r_pellet + r_gap + r_clad + r_film;
    /* ---- THE STACK SPLIT AT THE CLAD, so the cladding can have a TEMPERATURE ----------------
     * The clad node sits at its own volume average, so HALF its conduction resistance is on the
     * fuel side and half on the coolant side. That is the standard lumping for a thin shell, and
     * the choice is free of consequence at steady state precisely because the two halves sum:
     *
     *     r_fc + r_cw = (r_pellet + r_gap + r_clad/2) + (r_clad/2 + r_film) = r_total
     *
     * ⚠ WHICH IS WHY ADDING A CLAD NODE MOVES NO STEADY STATE AT ALL. `r_total`, `UA_W_per_K`
     * and every fraction below are byte-identical to what this function returned before the
     * split, so `steadyFuelTemp`, the Doppler reference it derives, and the gap conductance
     * solved against the sourced Doppler defect are all untouched. The clad node changes the
     * PATH, never the destination -- which is the whole reason it can be added to a calibrated
     * model without re-solving anything. */
    var r_fc = r_pellet + r_gap + r_clad / 2;
    var r_cw = r_clad / 2 + r_film;
    return {
      UA_W_per_K: g.rod_length_total_m / r_total,
      UA_fc_W_per_K: g.rod_length_total_m / r_fc,     /* fuel  <-> clad  */
      UA_cw_W_per_K: g.rod_length_total_m / r_cw,     /* clad  <-> water */
      h_film: h_f,
      r_pellet: r_pellet, r_gap: r_gap, r_clad: r_clad, r_film: r_film, r_total: r_total,
      r_fc: r_fc, r_cw: r_cw,
      frac_pellet: r_pellet / r_total, frac_gap: r_gap / r_total,
      frac_clad: r_clad / r_total, frac_film: r_film / r_total
    };
  }

  /* steadyFuelTemp(g, Q_kW, T_cool_c) — the converged fuel temperature WITHOUT integrating.
   *
   * At steady state T_f = T_cool + Q_fuel/UA(T_f), and UA depends on T_f only through k_UO2, so a
   * fixed-point iteration converges in a handful of passes. It exists because THE DOPPLER
   * REFERENCE MUST BE THIS PLANT'S OWN FULL-POWER FUEL TEMPERATURE, not a number carried over.
   *
   * ⚠ THE CARRIED-OVER NUMBER IS WRONG FOR THIS PLANT. pwr2_kinetics.js used to default
   * `T_fuel_ref_c: 693.0`, inherited from the first engine. This model derives 684.2 C at rated
   * power at the solved h_gap of 3000 (an earlier h_gap derived 581.8, and this comment sat
   * stale at that figure for a day while the constant moved — audit #488 A1.5; the number here
   * is the SOLVE'S OUTPUT and rots the moment the stack moves, which is the point of the rule
   * below). Doppler is perturbative about the reference — rho_dop = alpha_D * (T_f - T_ref) —
   * so a reference off by 100 C puts alpha_D * 100 = ~250 pcm of phantom reactivity into the
   * core AT FULL POWER, a quarter of a rod bank's worth, from nothing but a stale default.
   *
   * Construct kinetics with `T_fuel_ref_c: steadyFuelTemp(...)`, and RE-SOLVE it whenever the
   * resistance stack or the pellet split moves. This is the same class of dependency as
   * `rho_excess`, which D1 records as a SOLVE and not a number. */
  function steadyFuelTemp(g, Q_kW, T_cool_c) {
    var T = T_cool_c + 300;                       /* any start; it converges from anywhere */
    var Q_fuel = Q_kW * OPEN.q_to_fuel.value;
    for (var i = 0; i < 60; i++) {
      var UA_kW = conductance(g, T + 273.15).UA_W_per_K / 1000;
      var next = T_cool_c + Q_fuel / UA_kW;
      if (Math.abs(next - T) < 1e-10) { T = next; break; }
      T = next;
    }
    return T;
  }

  /* steadyCladTemp — where the clad sits at steady state for a given power and coolant, at RATED
   * cooling. The initial-condition companion to steadyFuelTemp, and it exists for the same
   * reason: a reactor created with its cladding at some default temperature spends the first
   * seconds dumping the difference, which reads as a physics defect and is an IC error. */
  function steadyCladTemp(g, Q_kW, T_cool_c) {
    var T_f  = steadyFuelTemp(g, Q_kW, T_cool_c);
    var cond = conductance(g, T_f + 273.15);
    return T_cool_c + Q_kW * OPEN.q_to_fuel.value / (cond.UA_cw_W_per_K / 1000);
  }

  function createFuel(opts) {
    opts = opts || {};
    var g = deriveGeometry(opts);
    var Tf = opts.T_fuel_c === undefined ? 693.0 : opts.T_fuel_c;
    return {
      geom: g,
      T_fuel_c: Tf,
      /* Absent a caller value the clad starts AT the fuel temperature rather than at the
       * coolant's: it is the conservative end for an initial condition (no stored energy is
       * invented) and `pwr2_reactor` supplies the real one from `steadyCladTemp`. */
      T_clad_c: opts.T_clad_c === undefined ? Tf : opts.T_clad_c,
      rated_thermal_kW: opts.rated_thermal_kW === undefined ? 300000 : opts.rated_thermal_kW
    };
  }

  /* advance2(x0, y0, a, b, c, dt) -> [x, y]
   *
   * EXACT advance of the two-node deviation system, by the same argument the single node uses:
   * with coefficients frozen over a step it is a linear ODE with a closed form, so stability
   * cannot depend on a caller's timestep choice.
   *
   *     dx/dt = -a*x + a*y            a = UA_fc / C_fuel
   *     dy/dt =  b*x - (b+c)*y        b = UA_fc / C_clad,  c = UA_cw / C_clad
   *
   * The matrix exponential of a 2x2 with distinct eigenvalues is Sylvester's formula, which
   * needs no eigenvectors:
   *
   *     exp(A*dt) = [ e^(l1*dt)*(A - l2*I) - e^(l2*dt)*(A - l1*I) ] / (l1 - l2)
   *
   * ⚠ THE CLAD IS THE STIFF ONE AND THAT IS WHY THIS IS NOT EULER. Measured at rated, the clad
   * time constant is ~0.06 s against a house dt of 0.02 -- a ratio of 3, where explicit Euler is
   * stable but inaccurate. It gets STIFFER, not looser, the better the cooling. */
  function advance2(x0, y0, a, b, c, dt) {
    if (!(dt > 0)) return [x0, y0];
    var tr = -(a + b + c), det = a * c;
    var disc = tr * tr - 4 * det;
    if (disc < 0) disc = 0;                       /* both roots are real; guard roundoff only */
    var sq = Math.sqrt(disc);
    var l1 = 0.5 * (tr + sq), l2 = 0.5 * (tr - sq);
    var d11 = -a, d12 = a, d21 = b, d22 = -(b + c);
    var m11, m12, m21, m22;
    if (Math.abs(l1 - l2) > 1e-12 * (1 + Math.abs(l1))) {
      var e1 = Math.exp(l1 * dt), e2 = Math.exp(l2 * dt), k = 1 / (l1 - l2);
      m11 = k * (e1 * (d11 - l2) - e2 * (d11 - l1));
      m12 = k * (e1 * d12 - e2 * d12);
      m21 = k * (e1 * d21 - e2 * d21);
      m22 = k * (e1 * (d22 - l2) - e2 * (d22 - l1));
    } else {
      /* Repeated root: exp(A*dt) = e^(l*dt) * (I + (A - l*I)*dt). */
      var el = Math.exp(l1 * dt);
      m11 = el * (1 + (d11 - l1) * dt); m12 = el * (d12 * dt);
      m21 = el * (d21 * dt);            m22 = el * (1 + (d22 - l1) * dt);
    }
    return [m11 * x0 + m12 * y0, m21 * x0 + m22 * y0];
  }

  /* stepFuel(fuel, dt, drivers) -> { T_fuel_c, heats, ... }
   *
   *   drivers.Q_core_kW    TOTAL core heat (fission + decay), i.e. kinetics' Q_total_frac * rated.
   *   drivers.coolTemp_c   bulk coolant temperature of the `core` node.
   *
   * THE HEAT SPLIT. Only `q_to_fuel` of the core heat goes through the fuel; the rest is deposited
   * directly in the moderator and never sees the gap. Both halves reach the coolant, so total
   * energy is conserved exactly — the split changes only WHEN it arrives (through a 3.7 s time
   * constant, or immediately). */
  function stepFuel(fuel, dt, drivers) {
    drivers = drivers || {};
    if (drivers.Q_core_kW === undefined) {
      throw new Error('pwr2_fuel: drivers.Q_core_kW is REQUIRED — this layer will not invent a ' +
                      'core power.');
    }
    if (drivers.coolTemp_c === undefined) {
      throw new Error('pwr2_fuel: drivers.coolTemp_c is REQUIRED — this layer will not invent a ' +
                      'coolant temperature for the fuel to sit in.');
    }
    /* ⚠ THE COOLANT REGIME IS REQUIRED, and defaulting it would be the worst kind of wrong.
     * A default of "rated flow, no void" hands every caller that forgets it PERFECT COOLING —
     * the reassuring answer, unearned, and exactly the failure `pwr2_true_state.js` refuses when
     * it declines to report `scrammed: false` from an engine with no protection layer. There is
     * ONE production caller (`pwr2_reactor.stepReactor`) and it has the plant in hand. */
    if (drivers.flowFrac === undefined || drivers.voidFrac === undefined) {
      throw new Error('pwr2_fuel: drivers.flowFrac and drivers.voidFrac are REQUIRED — this ' +
                      'layer will not assume the rods are being cooled.');
    }

    var Q_total  = drivers.Q_core_kW;
    var Q_fuel   = Q_total * OPEN.q_to_fuel.value;          /* kW through the gap */
    var Q_direct = Q_total - Q_fuel;                        /* kW straight to the moderator */
    /* Metal/water reaction heat, deposited IN THE CLAD where the reaction happens. Optional and
     * zero by default: oxidation is a separate Layer 5 file and this layer will not invent a
     * reaction it cannot see. */
    var Q_ox     = drivers.Q_ox_kW === undefined ? 0 : drivers.Q_ox_kW;

    var T_f_k = fuel.T_fuel_c + 273.15;
    var hFilm = filmCoefficient(drivers.flowFrac, drivers.voidFrac);
    var cond  = conductance(fuel.geom, T_f_k, hFilm);
    var UA_kW = cond.UA_W_per_K / 1000;
    var UA_fc = cond.UA_fc_W_per_K / 1000;                  /* kW/K, fuel <-> clad  */
    var UA_cw = cond.UA_cw_W_per_K / 1000;                  /* kW/K, clad <-> water */
    var cp    = cp_uo2(T_f_k);
    var Ccap  = fuel.geom.M_fuel_kg * cp / 1000;            /* kJ/K */
    var Cclad = fuel.geom.M_clad_kg * CP_ZR / 1000;         /* kJ/K */
    var tau   = Ccap / UA_kW;                               /* s */

    /* THE TWO EQUILIBRIA. Heat leaving the clad to the coolant is everything generated in the
     * fuel plus everything generated by oxidation; heat crossing the gap is the fuel's alone. */
    var T_c_eq  = drivers.coolTemp_c + (Q_fuel + Q_ox) / UA_cw;
    var T_eq    = T_c_eq + Q_fuel / UA_fc;
    var T_f_old = fuel.T_fuel_c, T_c_old = fuel.T_clad_c;
    var adv     = advance2(T_f_old - T_eq, T_c_old - T_c_eq,
                           UA_fc / Ccap, UA_fc / Cclad, UA_cw / Cclad, dt);
    var T_new   = T_eq + adv[0];
    var T_cnew  = T_c_eq + adv[1];

    /* WHAT THE COOLANT ACTUALLY RECEIVES over the step: the direct deposition, plus everything
     * generated in fuel and clad that did not end up STORED in one of them. Taken from the two
     * nodes' own energy CHANGE rather than from UA*(T_c - T_cool) at either endpoint, so both
     * sides balance exactly and neither node can gain or lose energy through the integrator:
     *     Q_out * dt = (Q_fuel + Q_ox) * dt - C_f*(dT_f) - C_c*(dT_c) */
    var stored = Ccap * (T_new - T_f_old) + Cclad * (T_cnew - T_c_old);
    var Q_out  = dt > 0 ? (Q_fuel + Q_ox) - stored / dt : Q_fuel + Q_ox;
    fuel.T_fuel_c = T_new;
    fuel.T_clad_c = T_cnew;

    /* Centerline, REPORTED so it cannot be confused with the average the model integrates.
     * T_center - T_surface = q' / (4*pi*k_f).
     * ⚠ `T_surface_c` IS THE PELLET SURFACE, and the old comment called it "CLAD OUTER SURFACE".
     * The arithmetic always said pellet — it subtracts only the pellet term from the fuel average
     * — and the centerline identity this gate checks depends on that. So the NAME was corrected
     * and the quantity left exactly where it was. The clad's own temperature is now a STATE and
     * is reported as `T_clad_c`. */
    var qPrime  = Q_fuel * 1000 / fuel.geom.rod_length_total_m;     /* W/m */
    var T_surf  = fuel.T_fuel_c - qPrime * cond.r_pellet;
    var T_ctr   = T_surf + qPrime / (4 * Math.PI * k_uo2(T_f_k));

    return {
      T_fuel_c: fuel.T_fuel_c,
      T_fuel_rise_c: fuel.T_fuel_c - drivers.coolTemp_c,
      T_clad_c: fuel.T_clad_c,
      T_clad_rise_c: fuel.T_clad_c - drivers.coolTemp_c,
      T_clad_f: fuel.T_clad_c * 9 / 5 + 32,
      T_surface_c: T_surf,
      T_centerline_c: T_ctr,
      T_centerline_f: T_ctr * 9 / 5 + 32,
      heats: { core: Q_out + Q_direct },      /* kW INTO the core node */
      Q_through_gap_kW: Q_out,
      Q_direct_kW: Q_direct,
      Q_ox_kW: Q_ox,
      UA_kW_per_K: UA_kW,
      UA_fc_kW_per_K: UA_fc,
      UA_cw_kW_per_K: UA_cw,
      h_film_W_per_m2K: hFilm,
      tau_s: tau,
      tau_clad_s: Cclad / UA_cw,
      cp_J_per_kgK: cp,
      linear_heat_W_per_m: qPrime,
      resistance_split: {
        pellet: cond.frac_pellet, gap: cond.frac_gap,
        clad: cond.frac_clad, film: cond.frac_film
      }
    };
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.fuel = {
    GEOM: GEOM, SPLIT: SPLIT, OPEN: OPEN, RHO_UO2: RHO_UO2, M_MOL_UO2: M_MOL_UO2,
    RHO_ZR: RHO_ZR, CP_ZR: CP_ZR,
    cp_uo2: cp_uo2, k_uo2: k_uo2,
    deriveGeometry: deriveGeometry, conductance: conductance,
    filmCoefficient: filmCoefficient, advance2: advance2,
    steadyFuelTemp: steadyFuelTemp, steadyCladTemp: steadyCladTemp,
    createFuel: createFuel, stepFuel: stepFuel
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
