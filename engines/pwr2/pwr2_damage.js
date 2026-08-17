/* pwr2_damage.js — Layer 5: CLAD OXIDATION AND CORE DAMAGE. (#479)
 *
 * The second heat source, and the one that makes core damage ACCELERATE rather than decay away
 * with the decay tail. Everything here waited on three things that landed the same day: a break to
 * lose inventory through (D4 §32), a pump that knows it is pumping steam so forced convection can
 * actually end (D4 §36), and a cladding with a TEMPERATURE rather than a resistance (D4 §37).
 *
 * ---------------------------------------------------------------------------------------
 * SOURCED, and unusually well for this engine — the evidence pass came back with the rate law,
 * its constants, its heat of reaction, its onset, and three independent acceptance criteria.
 *
 * THE RATE LAW — Ginna UFSAR ch15 (ML20339A101) §15.3.2.4.2, verbatim:
 *
 *     *"The zirconium-steam reaction can be significant above a clad temperature of 1800F. The
 *      Baker-Just parabolic rate equation shown below is used to define the rate of the
 *      zirconium-steam reaction:
 *          d(w2)/dt = 33.3 x 10^6 exp (-45500/1.986T)
 *      where: w = amount reacted (mg/cm2), t = time (seconds), T = temperature (Kelvin)
 *      The heat of reaction is 1510 cal/g."*
 *
 * It is not merely Ginna's choice: **10 CFR 50 Appendix K MANDATES it** (own copy in this lane's
 * corpus) — *"The rate of energy release, hydrogen generation, and cladding oxidation from the
 * metal/water reaction shall be calculated using the Baker-Just equation (… ANL-6548 …). The
 * reaction shall be assumed not to be steam limited."* That last sentence is why there is no
 * steam-availability term below: its absence is SOURCED, not an omission.
 *
 * THE STOICHIOMETRY — GEND-061 (TMI-2 hydrogen burn report) §4.3, stated in words so it can be
 * checked rather than assumed: *"Since 1 mol of zirconium reacting with 2 mol of water liberates
 * 2 mol of hydrogen, 230 kg-mol of hydrogen represents the oxidation of 115 kg-mol, or 10,500 kg
 * (23,000 lb), of zirconium."*  Zr + 2H2O -> ZrO2 + 2H2.
 *
 * THE ACCEPTANCE CRITERIA — 10 CFR 50.46, quoted verbatim in Ginna UFSAR ch15 §15.6.4.2.4.3:
 *   1. *"The calculated maximum fuel element cladding temperature shall not exceed 2200F."*
 *   2. *"The calculated total oxidation of the cladding shall nowhere exceed 0.17 times the total
 *       cladding thickness before oxidation."*
 *   3. *"The calculated total amount of hydrogen generated … shall not exceed 0.01 times the
 *       hypothetical amount that would be generated if all the metal in the cladding cylinders
 *       surrounding the fuel … were to react."*
 * All three are DIMENSIONLESS or a temperature, so all three are computable here without a single
 * unsourced scale — which is why they are the checks and not a band somebody chose.
 *
 * ONSET, two independent statements that bracket each other:
 *   - GEND-061 §4.3: *"very little hydrogen is generated until zirconium temperatures exceed
 *     1,200 °F (650 °C)"*
 *   - Ginna UFSAR ch15: *"can be significant above a clad temperature of 1800F"*
 * Neither is used as a THRESHOLD. The Arrhenius form self-gates — at 300 degC the rate integrates
 * to 0.07 mg/cm2 in a YEAR — so the onset figures are what the gate checks the law AGAINST rather
 * than switches it on with. A model with a hand-placed onset temperature would agree with them by
 * construction and prove nothing.
 *
 * FUEL MELT — GEND-061 §4.3: *"core temperatures approached 3,100 K (5,100 °F), the melting point
 * of uranium dioxide (Cook and Carlson 1985)"*.
 *
 * ---------------------------------------------------------------------------------------
 * THE ZIRCONIUM INVENTORY IS NOT A NEW NUMBER. `pwr2_fuel.js` already derives clad inner and outer
 * radii, 5,544 rods and 12.02 ft of active height from a SOURCED Westinghouse 17x17 lattice; one
 * density turns that into 2,136 kg of zirconium and 606.3 m2 of surface. Cross-checked against a
 * source it was not built from: GEND-061 gives TMI-2's whole core as 23,600 kg at 2772 MWt, which
 * power-scales to 2,554 kg here — the clad-only figure is 83.6 % of it, and it MUST land below,
 * because a whole-core figure includes guide thimbles and spacer grids this arithmetic cannot see.
 *
 * ---------------------------------------------------------------------------------------
 * ⚠ DECLARED SIMPLIFICATIONS — each with its direction of error.
 *
 * NO CLAD BALLOONING OR RUPTURE. 10 CFR 50 App. K requires that for rods calculated to rupture,
 * *"the inside of the cladding shall be assumed to react after the rupture"*, doubling the reacting
 * surface over ±1.5 inches of the burst. Not modelled: this engine has no rod-internal pressure and
 * no burst criterion. **Direction: OPTIMISTIC** — real oxidation past rupture is faster than this.
 *
 * NO GEOMETRY CHANGE FROM RELOCATION. GEND-061 lists *"Zircaloy melting and relocation to generally
 * colder regions and resulting reduced exposed-surface areas"* among the things that make TMI-2
 * hard to calculate. The surface here is constant. **Direction: both ways** — relocation reduces
 * area (slower) while cracking and flaking of the oxide *"expose more unoxidized metal"* (faster).
 *
 * ONE LUMPED NODE. `clad_temp_c` is a core AVERAGE, where 50.46's limit is a PEAK and its
 * oxidation criterion says *"shall nowhere exceed"*. **Direction: OPTIMISTIC**, since a real hot
 * channel runs above core average — so the criteria are checked here against an average and a real
 * plant would breach them sooner.
 *
 * These compound with `pwr2_fuel.js`'s own two optimistic declarations (no departure from nucleate
 * boiling, and a coolant clamped at the 800 degC property ceiling) rather than cancelling them.
 * **This model understates damage, and every declared simplification points the same way.**
 *
 * UNITS ARE SI INTERNALLY except `w`, which is carried in the SOURCE'S OWN mg/cm2 so the rate law
 * can be typed exactly as the document states it. Converted once, at the boundary.
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  var F  = RD && RD.fuel;

  /* ---- SOURCED: Baker-Just, Ginna UFSAR ch15 / 10 CFR 50 App. K ---------------------------- */
  var BJ = {
    kind: '[sourced]',
    A:    33.3e6,          /* mg2/cm4/s  — the pre-exponential, verbatim */
    E_R:  45500 / 1.986,   /* K — activation energy over the gas constant, written as the document
                            * writes it (45500/1.986T) rather than pre-divided, so a transcription
                            * error has two numbers to survive instead of one */
    heat_cal_per_g: 1510,  /* [sourced] Ginna UFSAR ch15, same passage */
    src: 'Ginna UFSAR ch15 (ML20339A101) §15.3.2.4.2; mandated by 10 CFR 50 Appendix K (ANL-6548)'
  };

  /* ---- SOURCED: 10 CFR 50.46 acceptance criteria, verbatim in Ginna UFSAR ch15 -------------- */
  var LIM = {
    kind: '[sourced]',
    pct_limit_f:        2200,    /* criterion 1 — peak cladding temperature */
    oxidation_frac:     0.17,    /* criterion 2 — of total cladding thickness before oxidation */
    hydrogen_frac:      0.01,    /* criterion 3 — of the hypothetical all-clad amount */
    src: '10 CFR 50.46, quoted verbatim in Ginna UFSAR ch15 (ML20339A101) §15.6.4.2.4.3'
  };

  /* ---- SOURCED: GEND-061 (TMI-2), the melt point and the stoichiometry --------------------- */
  var TMI = {
    kind: '[sourced]',
    uo2_melt_k:      3100,       /* "the melting point of uranium dioxide", 5100 degF */
    onset_f:         1200,       /* "very little hydrogen is generated until … 1,200 °F (650 °C)" */
    core_zr_kg:      23600,      /* "a calculated 23,600 kg (52,000 lb) of zirconium" */
    core_mwt:        2772,       /* TMI-2 rating, for the power scaling of the cross-check */
    src: 'GEND-061 (TMI-2 hydrogen burn report) §4.3'
  };

  /* ---- DERIVED: molar masses, for the stoichiometry the source states in words -------------- */
  var M_ZR = 91.224;             /* g/mol */
  var M_H2 = 2.016;              /* g/mol */
  var H2_PER_ZR = 2 * M_H2 / M_ZR;   /* [derived] 1 mol Zr -> 2 mol H2, GEND-061 §4.3 */
  var CAL_J = 4.184;             /* [sourced] the thermochemical calorie, exact by definition */

  /* rate(T_k) -> d(w^2)/dt in mg2/cm4/s. The law exactly as the document states it. */
  function rate(T_k) {
    if (!(T_k > 0)) return 0;
    return BJ.A * Math.exp(-BJ.E_R / T_k);
  }

  /* wMax(geom) -> mg/cm2, the areal density of the cladding: what `w` would be if every gram of
   * zirconium reacted.
   *
   * ⚠ TAKEN AS MASS OVER SURFACE, NOT AS density x thickness, and the difference is not
   * cosmetic. rho*t uses the outer radius for the area while the mass lives in an annulus whose
   * mean radius is smaller — 374.9 against 352.4 mg/cm2, a 6 % disagreement. M/S is the
   * MASS-CONSISTENT choice: it makes `w/wMax` exactly the fraction of the clad inventory
   * consumed, so the 50.46 hydrogen criterion and the oxidation criterion are computed off one
   * quantity that closes against `M_clad_kg` instead of two that nearly do. */
  function wMax(geom) {
    return geom.M_clad_kg / geom.clad_surface_m2 * 100;      /* kg/m2 -> mg/cm2 */
  }

  /* createDamage(opts) — the oxide starts at zero and the latches start clear.
   *   opts.geom              geometry from pwr2_fuel.deriveGeometry(); derived when absent
   *   opts.rated_thermal_kW  for zirc_heat_pct
   *   opts.w_mg_cm2          a pre-existing oxide layer, for a scenario that starts damaged */
  function createDamage(opts) {
    opts = opts || {};
    var g = opts.geom || F.deriveGeometry(opts);
    return {
      geom: g,
      rated_thermal_kW: opts.rated_thermal_kW === undefined ? 300000 : opts.rated_thermal_kW,
      w_mg_cm2:  opts.w_mg_cm2 === undefined ? 0 : opts.w_mg_cm2,
      fuel_damaged: false,
      melted: false,
      destruction_cause: 'none'
    };
  }

  /* stepDamage(dm, dt, drivers) -> the reaction over one step, and the damage state.
   *
   *   drivers.cladTemp_c   REQUIRED. The reaction happens ON THE CLAD, at the clad's temperature.
   *   drivers.fuelTemp_c   REQUIRED. The melt latch is a FUEL temperature against the UO2 melting
   *                        point; the damage latch is a CLAD temperature against 50.46's limit.
   *
   * ⚠ INTEGRATED IN w^2, NOT IN w, and that is the source's own form for a reason. Baker-Just is
   * parabolic: dw/dt = K/(2w), which is SINGULAR at w = 0 — a fresh core would take an infinite
   * first step. Advancing w^2 linearly is exact for constant K over the step, has no singularity,
   * and is monotone by construction, which is what the contract requires of the oxide state:
   * *"the OXIDE state behind it is monotonic and does not un-grow, but the heat release stops."*
   * The heat stopping needs no separate rule — the Arrhenius factor falls off a cliff on cooling.
   */
  function stepDamage(dm, dt, drivers) {
    drivers = drivers || {};
    if (drivers.cladTemp_c === undefined) {
      throw new Error('pwr2_damage: drivers.cladTemp_c is REQUIRED — the reaction happens on the ' +
                      'clad and this layer will not invent its temperature.');
    }
    if (drivers.fuelTemp_c === undefined) {
      throw new Error('pwr2_damage: drivers.fuelTemp_c is REQUIRED — the melt latch is a FUEL ' +
                      'temperature and this layer will not substitute the clad\'s.');
    }
    /* ⚠ A NON-FINITE TEMPERATURE MUST NOT LATCH DAMAGE, and this is not hypothetical. MEASURED,
     * 0.002 m2 (20 cm2) break with emergency injection running: the plant is held cool and
     * undamaged for 1250 s, then reaches the 0.1 MPa property floor with almost no inventory —
     * the condition issue #487 records — and the temperatures diverge and go NaN. The latches
     * then reported **fuel_damaged AND melted on a plant whose state had been LOST**, which is
     * the worst possible failure for an outcome-grading flag: it is the alarming answer, and it
     * is unearned in exactly the way `pwr2_true_state.js` refuses "not scrammed" from an engine
     * with no protection layer.
     *
     * `NaN >= x` is false, so NaN alone never latched — the latch fired on the DIVERGING finite
     * values on the way there. This refuses the non-finite case loudly, which is all this layer
     * can honestly do; the divergence itself belongs to #487 and is not papered over here. */
    if (!isFinite(drivers.cladTemp_c) || !isFinite(drivers.fuelTemp_c)) {
      throw new Error('pwr2_damage: a NON-FINITE temperature was supplied (clad ' +
                      drivers.cladTemp_c + ', fuel ' + drivers.fuelTemp_c + '). The plant has ' +
                      'left the range its property library is characterised over — see #487. ' +
                      'This layer will NOT latch core damage from a state that has been lost.');
    }

    var g     = dm.geom;
    var w_max = wMax(g);
    var T_k   = drivers.cladTemp_c + 273.15;

    var w0 = dm.w_mg_cm2;
    var w1 = Math.sqrt(w0 * w0 + rate(T_k) * (dt > 0 ? dt : 0));
    if (w1 > w_max) w1 = w_max;                 /* cannot oxidise metal that is no longer there */
    dm.w_mg_cm2 = w1;

    /* Mass consumed this step, and cumulatively. w [mg/cm2] * S [m2] / 100 = kg. */
    var dZr_kg  = (w1 - w0) * g.clad_surface_m2 / 100;
    var zr_kg   = w1 * g.clad_surface_m2 / 100;
    var h2_kg   = zr_kg * H2_PER_ZR;

    /* Heat: 1510 cal/g on the mass reacted. cal -> J -> kW. */
    var Q_ox_kW = dt > 0 ? dZr_kg * 1000 * BJ.heat_cal_per_g * CAL_J / 1000 / dt : 0;

    /* ---- THE LATCHES. Latched, never cleared: a core that has been damaged stays damaged. ---- */
    var pct_c = (LIM.pct_limit_f - 32) * 5 / 9;
    if (drivers.cladTemp_c >= pct_c) dm.fuel_damaged = true;
    if (drivers.fuelTemp_c >= TMI.uo2_melt_k - 273.15) {
      dm.melted = true;
      dm.destruction_cause = 'thermal_melt';
    }

    return {
      w_mg_cm2: w1,
      oxidation_frac: w1 / w_max,               /* against 50.46 criterion 2 (0.17) */
      zr_consumed_kg: zr_kg,
      h2_kg: h2_kg,
      h2_frac_hypothetical: zr_kg / g.M_clad_kg,   /* against 50.46 criterion 3 (0.01) */
      Q_ox_kW: Q_ox_kW,
      zirc_heat_pct: Q_ox_kW / dm.rated_thermal_kW * 100,
      rate_mg2_cm4_s: rate(T_k),
      fuel_damaged: dm.fuel_damaged,
      melted: dm.melted,
      destruction_cause: dm.destruction_cause,
      /* Margins, REPORTED so a consumer does not have to re-derive the criteria. */
      pct_margin_f: LIM.pct_limit_f - (drivers.cladTemp_c * 9 / 5 + 32),
      w_max_mg_cm2: w_max
    };
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.damage = {
    BJ: BJ, LIM: LIM, TMI: TMI,
    M_ZR: M_ZR, M_H2: M_H2, H2_PER_ZR: H2_PER_ZR, CAL_J: CAL_J,
    rate: rate, wMax: wMax,
    createDamage: createDamage, stepDamage: stepDamage
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
