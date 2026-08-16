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

  /* ---- SOURCED: ML050910161 Fig 3-1, Westinghouse 17x17 lattice ---------------------------- */
  var GEOM = {
    kind:        '[sourced]',
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
         'sourced rod OD bounds them: over the full plausible range (clad 0.020-0.026, gap ' +
         '0.002-0.0045) M_fuel moves +/-6 % and the steady-state fuel rise moves 0 %, because ' +
         'M_fuel is a TIME CONSTANT here and not a lever arm. D1 section 34.2 carries the sweep.'
  };

  /* ---- OPEN: unsourced, and an evidence pass owes every one of these ------------------------ */
  var OPEN = {
    h_gap: {
      value: 5700,                 /* W/m2K */
      why: 'Gap conductance. UNSOURCED — `find_source` finds no numeric value; 10 CFR 50 App. K ' +
           'requires it be varied with gap dimensions and names MATPRO-11 Rev. 1 (Hagrman, ' +
           'Reymann, Mason 1980) for the gap gas, and we do not hold that document. 5700 is a ' +
           'beginning-of-life figure. It is the SECOND-largest resistance in the stack (30 %), so ' +
           'it matters; burnup would raise it as the gap closes, which this model does not track.'
    },
    k_clad: {
      value: 16.0,                 /* W/mK, Zircaloy */
      why: 'Zircaloy thermal conductivity. UNSOURCED. Contributes 5.7 % of the total resistance, ' +
           'so a 20 % error here is a 1 % error in the fuel rise.'
    },
    h_film: {
      value: 30000,                /* W/m2K */
      why: 'Clad-to-coolant film coefficient. UNSOURCED, and a CONSTANT where it should fall out ' +
           'of the coolant flow (Dittus-Boelter on the real mass flux). Contributes 5.0 %. The ' +
           'consequence of freezing it: the fuel rise does not grow when flow is lost, so this ' +
           'model UNDERSTATES fuel heatup on a loss of forced circulation. Recorded, not hidden.'
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

    /* 17x17 = 289 positions, less 24 guide thimbles and 1 instrument tube = 264 fuel rods. */
    var nRod = GEOM.lattice_n * GEOM.lattice_n - 25;

    /* ACTIVE HEIGHT — derived, see the header. Assembly pitch from the SOURCED rod pitch. */
    var assyPitch = GEOM.lattice_n * GEOM.rod_pitch_in * IN;
    var H = (envelope / nAssy) / (assyPitch * assyPitch);

    var nRodTotal = nRod * nAssy;
    var V_fuel    = Math.PI / 4 * pellet * pellet * H * nRodTotal;

    return {
      rod_od_m: rod_od, pellet_m: pellet, pellet_in: pellet_in,
      clad_ri_m: clad_ri, clad_ro_m: clad_ro,
      n_rod_per_assy: nRod, n_rod_total: nRodTotal, n_assemblies: nAssy,
      assy_pitch_in: assyPitch / IN,
      H_m: H, H_ft: H / 0.3048,
      V_fuel_m3: V_fuel,
      M_fuel_kg: V_fuel * RHO_UO2,
      rod_length_total_m: nRodTotal * H
    };
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
  function conductance(g, T_f_k) {
    var k_f = k_uo2(T_f_k);
    var r_pellet = 1 / (8 * Math.PI * k_f);
    var r_gap    = 1 / (Math.PI * g.pellet_m * OPEN.h_gap.value);
    var r_clad   = Math.log(g.clad_ro_m / g.clad_ri_m) / (2 * Math.PI * OPEN.k_clad.value);
    var r_film   = 1 / (Math.PI * g.rod_od_m * OPEN.h_film.value);
    var r_total  = r_pellet + r_gap + r_clad + r_film;
    return {
      UA_W_per_K: g.rod_length_total_m / r_total,
      r_pellet: r_pellet, r_gap: r_gap, r_clad: r_clad, r_film: r_film, r_total: r_total,
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
   * ⚠ THE CARRIED-OVER NUMBER IS WRONG FOR THIS PLANT. pwr2_kinetics.js defaults
   * `T_fuel_ref_c: 693.0`, inherited from the first engine. This model derives 581.8 C at rated
   * power. Doppler is perturbative about the reference — rho_dop = alpha_D * (T_f - T_ref) — so
   * leaving 693 in place puts -2.5e-5 * (581.8 - 693) = +278 pcm of reactivity into the core AT
   * FULL POWER, which is a quarter of a rod bank's worth, from nothing but a stale default.
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

  function createFuel(opts) {
    opts = opts || {};
    var g = deriveGeometry(opts);
    return {
      geom: g,
      T_fuel_c: opts.T_fuel_c === undefined ? 693.0 : opts.T_fuel_c,
      rated_thermal_kW: opts.rated_thermal_kW === undefined ? 300000 : opts.rated_thermal_kW
    };
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

    var Q_total  = drivers.Q_core_kW;
    var Q_fuel   = Q_total * OPEN.q_to_fuel.value;          /* kW through the gap */
    var Q_direct = Q_total - Q_fuel;                        /* kW straight to the moderator */

    var T_f_k = fuel.T_fuel_c + 273.15;
    var cond  = conductance(fuel.geom, T_f_k);
    var UA_kW = cond.UA_W_per_K / 1000;
    var cp    = cp_uo2(T_f_k);
    var Ccap  = fuel.geom.M_fuel_kg * cp / 1000;            /* kJ/K */
    var tau   = Ccap / UA_kW;                               /* s */

    var T_eq  = drivers.coolTemp_c + Q_fuel / UA_kW;
    var decay = dt > 0 ? Math.exp(-dt / tau) : 1;
    var T_new = T_eq + (fuel.T_fuel_c - T_eq) * decay;

    /* WHAT THE COOLANT ACTUALLY RECEIVES over the step: the direct deposition, plus the heat that
     * left the fuel. The second is taken from the fuel's own energy CHANGE rather than from
     * UA*(T_f - T_cool) at either endpoint, so the two sides balance exactly and the node cannot
     * gain or lose energy through the integrator. Over a step:
     *     Q_out * dt = Q_fuel * dt - C * (T_new - T_old) */
    var Q_out = dt > 0 ? Q_fuel - Ccap * (T_new - fuel.T_fuel_c) / dt : Q_fuel;
    fuel.T_fuel_c = T_new;

    /* Centerline, REPORTED so it cannot be confused with the average the model integrates.
     * T_center - T_surface = q' / (4*pi*k_f); T_surface from the non-pellet resistances. */
    var qPrime  = Q_fuel * 1000 / fuel.geom.rod_length_total_m;     /* W/m */
    var T_surf  = drivers.coolTemp_c + qPrime * (cond.r_gap + cond.r_clad + cond.r_film);
    var T_ctr   = T_surf + qPrime / (4 * Math.PI * k_uo2(T_f_k));

    return {
      T_fuel_c: fuel.T_fuel_c,
      T_fuel_rise_c: fuel.T_fuel_c - drivers.coolTemp_c,
      T_surface_c: T_surf,
      T_centerline_c: T_ctr,
      T_centerline_f: T_ctr * 9 / 5 + 32,
      heats: { core: Q_out + Q_direct },      /* kW INTO the core node */
      Q_through_gap_kW: Q_out,
      Q_direct_kW: Q_direct,
      UA_kW_per_K: UA_kW,
      tau_s: tau,
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
    cp_uo2: cp_uo2, k_uo2: k_uo2,
    deriveGeometry: deriveGeometry, conductance: conductance,
    steadyFuelTemp: steadyFuelTemp,
    createFuel: createFuel, stepFuel: stepFuel
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
