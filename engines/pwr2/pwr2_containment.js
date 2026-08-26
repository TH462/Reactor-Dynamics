/* pwr2_containment.js — Layer 5: CONTAINMENT. (#479)
 *
 * Where a break discharges to. D4 §31.3 argued this was the WRONG system to build before
 * `pwr2_break.js` existed, because with nothing entering it a containment reports its initial
 * condition for ever — two constants where the condenser produced a coupling. The break landed, so
 * this is now worth having.
 *
 * ---------------------------------------------------------------------------------------
 * SOURCED, both Ginna UFSAR ch15 (ML20339A101) — the anchor plant:
 *   NET FREE VOLUME **1×10⁶ ft³**  — *"Containment net free volume, ft3 1E6"*
 *   PRE-ACCIDENT CONDITION **125 °F and 1.0 psig** — *"initial (pre-accident) containment
 *   conditions of 125ºF and 1.0 psig"*
 *
 * ⚠ THERE IS NO SOURCED DESIGN PRESSURE, and the near-miss is worth recording. The only hit in the
 * corpus is NUREG-1431 Rev 4 Bases: *"[44.1] psig results from the LOCA analysis… maximum peak
 * containment atmosphere temperature of [385]°F"* — both **bracketed template placeholders**, the
 * plant-specific number a licensee fills in. That is the trap #380 records, where a bracketed
 * "~30–32 %" SG lo-lo survived two evidence passes because both verdicted the mechanism and
 * inherited the figure. So this file has **no failure pressure and no design limit**, and it does
 * not invent one.
 *
 * ---------------------------------------------------------------------------------------
 * THE VOLUME BASIS, and it is deliberately NOT the power basis its neighbours use.
 *
 * `run_pwr2_bases.js` pins which system scales how and why: CVCS on VOLUME because charging moves
 * a fraction of inventory; ECCS and RHR on POWER because they carry decay heat; the condenser on
 * POWER because it rejects heat. **Containment is sized to hold the primary INVENTORY when it
 * flashes** — the mass and its stored energy, not a power — so it scales on VOLUME, with CVCS.
 * That is a third system on the volume basis and the first one added since the gate was written;
 * `run_pwr2_bases.js` should be extended to pin it.
 *
 * ---------------------------------------------------------------------------------------
 * THE MODEL — a lumped air/steam atmosphere over a liquid sump.
 *
 *     air     an IDEAL GAS of fixed mass, from the sourced initial condition
 *     steam   whatever the break has delivered and not condensed
 *     P       = P_air + P_steam, the partial pressures summed (Dalton)
 *     T       from the energy the break delivered against the atmosphere heat capacity
 *
 * ⚠ DECLARED, AND THE LIST IS LONG BECAUSE THE UNSOURCED HALF OF CONTAINMENT IS ITS HEAT REMOVAL:
 *   NO SPRAY. NO FAN COOLERS. NO RECOMBINERS. Their capacities are not in the corpus — searched,
 *   nothing numeric — so none is built and all their contract fields stay declared-missing. The
 *   consequence is direct: **this containment only ever heats and pressurises.** It has no way
 *   down, so it is a model of the first minutes of a LOCA and not of the recovery.
 *   NO SUMP GEOMETRY, so `containment_sump_pct` stays missing: the mass is tracked, but turning it
 *   into a level needs a sump map this engine does not have and the corpus does not give.
 *   NO STRUCTURAL HEAT SINK. Real containment walls absorb a large fraction of the blowdown energy
 *   in the first minute. Without them this OVERSTATES peak pressure and temperature — the same
 *   direction as the break's own 2x, so the two compound rather than cancel.
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  var W  = RD && RD.water;
  /* #514: the flash solve's residual pays P_sat on every evaluation — through the table
   * (pwr2_core's idiom) it is two array reads instead of pwr2_water's 80-iteration
   * bisection. Cold-started at 62 evaluations a step this module was 16 % of the whole
   * engine step (~174 us of 1090). */
  var VT = RD && RD.vtable;
  var PSAT = VT ? VT.P_sat_T : (W && W.P_sat);

  var FT3_PER_M3 = 35.3147;
  var PSI_PER_MPA = 145.0377;
  var R_AIR = 0.287;             /* kJ/kgK */
  var CV_AIR = 0.718;            /* kJ/kgK */

  var CTMT = {
    ginna_free_volume_ft3: 1.0e6,     /* [sourced] Ginna UFSAR ch15 */
    initial_temp_f:        125.0,     /* [sourced] pre-accident */
    initial_psig:          1.0,       /* [sourced] pre-accident */
    src: 'Ginna UFSAR ch15 (ML20339A101) — free volume and pre-accident conditions'
  };

  function f2c(f) { return (f - 32) * 5 / 9; }
  function psigToMpa(p) { return (p + 14.696) / PSI_PER_MPA; }

  /* VOLUME basis — see the header. Uses CVCS's scale so the two cannot drift apart. */
  function volumeScale() {
    return RD.cvcs ? RD.cvcs.volumeScale() : 1;
  }
  function freeVolumeM3() {
    return CTMT.ginna_free_volume_ft3 * volumeScale() / FT3_PER_M3;
  }

  function createContainment(opts) {
    opts = opts || {};
    var V = opts.free_volume_m3 === undefined ? freeVolumeM3() : opts.free_volume_m3;
    var T = opts.temp_c === undefined ? f2c(CTMT.initial_temp_f) : opts.temp_c;
    var P = opts.pressure_mpa === undefined ? psigToMpa(CTMT.initial_psig) : opts.pressure_mpa;
    /* AIR MASS IS DERIVED FROM THE SOURCED INITIAL CONDITION, not chosen. The atmosphere starts at
     * 125 degF and 1.0 psig, and the air that produces that in this volume is m = PV/RT. Steam
     * partial pressure at 125 degF is small but not zero, and it is subtracted rather than ignored
     * so the air mass is the air's. */
    var Pv0 = W.P_sat(T);
    var Pa0 = Math.max(0, P - Pv0);
    return {
      V_m3: V,
      T_c: T,
      m_air: Pa0 * 1000 * V / (R_AIR * (T + 273.15)),
      m_water: Pv0 * 1000 * V / (0.4615 * (T + 273.15)),   /* steam, R_v = 0.4615 kJ/kgK */
      /* ⚠ SEEDED WITH INTERNAL ENERGY, NOT ENTHALPY. The residual below works in u, and seeding
       * this with h_g overstated it by the flow-work term R_v*T -- about 150 kJ/kg, 6 % -- which
       * was enough to push the INITIAL condition past the solver bound and report 392 degF for a
       * containment the source says starts at 125. Incoming break flow IS added as enthalpy,
       * which is correct: what a stream carries in is h. Only the seed is a state. */
      U_water_kJ: (Pv0 * 1000 * V / (0.4615 * (T + 273.15))) *
                  (W.h_g(Pv0) - 0.4615 * (T + 273.15)),
      energy_in_kJ: opts.energy_in_kJ === undefined ? 0 : opts.energy_in_kJ,
      mass_in_kg: opts.mass_in_kg === undefined ? 0 : opts.mass_in_kg
    };
  }

  /* stepContainment(ct, dt, drivers) -> pressure and temperature.
   *
   *   drivers.mdot_kgs  mass arriving from the break
   *   drivers.h_kJkg    the enthalpy it carries
   */
  function stepContainment(ct, dt, drivers) {
    drivers = drivers || {};
    var mdot = drivers.mdot_kgs || 0;
    if (mdot > 0 && drivers.h_kJkg === undefined) {
      throw new Error('pwr2_containment: drivers.h_kJkg is REQUIRED when mass arrives — the ' +
                      'energy a discharge carries is the whole of what pressurises containment, ' +
                      'and this layer will not assume an enthalpy for it.');
    }
    var dm = mdot * dt;
    if (dm > 0) {
      ct.mass_in_kg += dm;
      ct.energy_in_kJ += dm * drivers.h_kJkg;
      ct.m_water += dm;
      ct.U_water_kJ += dm * drivers.h_kJkg;
    }

    /* ⚠ THE ATMOSPHERE IS SOLVED AS A FLASH EQUILIBRIUM, and the first version was not.
     *
     * That version heated a lumped capacity with the full incoming enthalpy and computed the
     * vapour split afterwards, from a temperature the split had not been allowed to influence.
     * Nothing ever condensed -- MEASURED, the sump stayed at 0 kg for the whole event -- so all
     * the latent heat went into sensible temperature and containment read **530 degF at 60 s**
     * against a real peak near 270. It was not a declared simplification; it was a missing
     * closure.
     *
     * The correct statement is that the incoming water FLASHES: it splits between vapour and sump
     * at whatever temperature makes the energy balance, and the vapour it can hold is capped by
     * saturation. So T is found by a bisection on the energy residual, using Layer 0's own
     * saturation properties -- the same shape of closure Layer 2 runs for the primary. */
    var m_vapour = 0, m_sump = 0, P_v = 0;
    (function solveT() {
      function residual(T) {
        var TK = T + 273.15;
        var Ps = PSAT(T);
        var mv_max = Ps * 1000 * ct.V_m3 / (0.4615 * TK);
        var mv = Math.min(ct.m_water, mv_max);
        var ml = ct.m_water - mv;
        /* internal energy: liquid at h_f, vapour at h_g less the flow work it no longer does */
        var U = mv * (W.h_g(Ps) - Ps * 1000 / (Ps * 1000 / (0.4615 * TK)))
              + ml * W.h_f(Ps);
        return U - ct.U_water_kJ;
      }
      /* ⚠ THE SEARCH IS BOUNDED AT 200 degC BECAUSE THE RESIDUAL IS NOT MONOTONE ABOVE IT.
       * h_g peaks near 235 degC and FALLS toward the critical point, so the energy residual rises
       * and then falls, and a bisection over the full range latches onto the wrong branch.
       * MEASURED with hi = 370: the INITIAL condition solved to 370 degC / 698 degF instead of the
       * sourced 125 degF -- the solver ran to its own upper bound on a state with almost no water
       * in it. 200 degC is above any pressure this containment can reach without the spray and fan
       * coolers that are declared missing, and reaching the clamp is REPORTED rather than hidden. */
      var lo = 20, hi = 200;
      if (residual(lo) > 0) { ct.T_c = lo; }
      else if (residual(hi) < 0) { ct.T_c = hi; }
      else {
        /* WARM-STARTED FROM LAST STEP'S SOLUTION (#514): containment temperature moves
         * ~nothing in 0.02 s, so the root is almost always inside a bracket a fraction of a
         * degree wide around ct.T_c — the same warm-start-tight reasoning as pwr2_core's
         * solveP. The bracket expands 4x on a miss and the cold full-range [20, 200] search
         * remains the fallback, so a violent transient (or the first call) behaves exactly
         * as before. The non-monotone-above-200 clamp above is untouched. */
        var k, span = 0.05;
        if (ct.T_c > lo && ct.T_c < hi) {
          for (k = 0; k < 6; k++) {
            var wlo = Math.max(lo, ct.T_c - span), whi = Math.min(hi, ct.T_c + span);
            if (residual(wlo) < 0 && residual(whi) >= 0) { lo = wlo; hi = whi; break; }
            span *= 4;
          }
        }
        for (k = 0; k < 60; k++) {
          var mid = 0.5 * (lo + hi);
          if (residual(mid) < 0) lo = mid; else hi = mid;
          if (hi - lo < 1e-7) break;
        }
        ct.T_c = 0.5 * (lo + hi);
      }
      var TK2 = ct.T_c + 273.15;
      var Ps2 = PSAT(ct.T_c);
      var mvmax = Ps2 * 1000 * ct.V_m3 / (0.4615 * TK2);
      m_vapour = Math.min(ct.m_water, mvmax);
      m_sump = ct.m_water - m_vapour;
      P_v = m_vapour * 0.4615 * TK2 / ct.V_m3 / 1000;
    })();

    var T_K = ct.T_c + 273.15;
    var P_a = ct.m_air * R_AIR * T_K / ct.V_m3 / 1000;             /* MPa */

    return {
      containment_pressure_mpa: P_a + P_v,
      containment_temp_c: ct.T_c,
      pressure_psig: (P_a + P_v) * PSI_PER_MPA - 14.696,
      /* the split, REPORTED so a reader can see why the pressure is what it is */
      P_air_mpa: P_a, P_steam_mpa: P_v,
      saturated: m_sump > 0,
      /* REPORTED: the solver hit its physical bound, which means this model is out of the range
       * it can speak to rather than that containment is at 200 degC. */
      solver_clamped: ct.T_c >= 199.999,
      m_air: ct.m_air, m_water: ct.m_water,
      m_vapour_kg: m_vapour, m_sump_kg: m_sump,
      V_m3: ct.V_m3,
      mass_in_kg: ct.mass_in_kg, energy_in_kJ: ct.energy_in_kJ
      /* NOTE there is no `containment_sump_pct` here. The sump MASS is known; turning it into a
       * level needs a geometry this engine does not have, and a percentage invented from the mass
       * would be a fabricated gauge. It stays declared-missing in pwr2_true_state.js. */
    };
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.containment = {
    CTMT: CTMT, freeVolumeM3: freeVolumeM3, volumeScale: volumeScale,
    createContainment: createContainment, stepContainment: stepContainment,
    PSI_PER_MPA: PSI_PER_MPA
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
