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
 * ⚠ SPRAY AND THE FAN COOLERS ARE BUILT (#784, 2026-09-21). THE PARAGRAPH THIS REPLACES WAS A
 *   PREMISE THAT HAD EXPIRED, and the expiry is the lesson. It read "NO SPRAY. NO FAN COOLERS.
 *   NO RECOMBINERS. Their capacities are not in the corpus — searched, nothing numeric". A
 *   `find_source` pass on 2026-09-21 turned up BOTH system capacities in the anchor plant's own
 *   documents — flow, temperature and response time, all quoted verbatim in the CS block below —
 *   so the sentence had been telling readers a search had failed for a month after it stopped
 *   being true. That is #460's trap, caught in this file's header exactly as `pwr2_protection.js`
 *   caught it in its own. What is genuinely still unsourced is ONE number: the fan coolers'
 *   heat-transfer coefficient, which is [fitted] and says so at its declaration.
 *   RECOMBINERS ARE STILL NOT BUILT and their contract fields stay static-false — the ruling
 *   authorising this work *(OWNER RULING, 2026-09-21: "Authorise it — auto-only (Recommended)")*
 *   named containment spray, the fan coolers and the steam-line isolation that goes with them,
 *   and nothing else.
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

  /* ---- ACTIVE HEAT REMOVAL (#784) — CONTAINMENT SPRAY AND THE RECIRCULATION FAN COOLERS ----
   *
   * SOURCED, and the sourcing is why the "no capacity exists in the corpus" declaration above
   * could be retired. Two documents, quoted:
   *
   *   Ginna UFSAR ch15 (ML20339A101) Table 15.6-18a, "PARAMETERS FOR CONTAINMENT PRESSURE —
   *   DRY CONTAINMENT DATA": *"Spray system / Number of pumps operating 2 / Runout flow rate
   *   1800 gpm each"*, *"Refueling water storage tank (RWST) temperature 50F"*, *"Service water
   *   temperature 30F"*, *"Safeguards containment recirculation fan coolers (CRFCs) / Number of
   *   fan coolers operating 4"*. The same chapter's Table 15.6-11 item H repeats the flow:
   *   *"Maximum Containment Spray Flow 1800 gpm per pump"*.
   *
   *   Ginna TS Bases B 3.6.6 (ML20339A221): *"The CS System consists of two redundant, 100%
   *   capacity trains"*; *"The CRFC System consists of four fan units"*, *"During normal
   *   operation, at least two fan units are typically operating"*, *"In post accident operation
   *   following a SI actuation signal, the CRFC System fans are designed to start automatically
   *   if not already running"*; *"The CS System total response time is 28.5 seconds for one pump
   *   to the upper spray header and 26.5 seconds for two pumps"*; *"The CRFC System total
   *   response time of 44 seconds, includes signal delay, DG startup (for loss of offsite
   *   power), and service water pump and CRFC unit startup times"*.
   *
   * ⚠ ONE SPRAY TRAIN, NOT TWO, AND IT IS A SOURCED CHOICE RATHER THAN A CONSERVATISM. Table
   * 15.6-18a is the MINIMUM-containment-pressure analysis — its whole purpose is to maximise
   * cooling (2 pumps, 4 fans, 50 degF RWST, 30 degF service water, "Fastest post accident
   * initiation of fan coolers 0 seconds"), because ECCS reflood performance improves with
   * BACKPRESSURE and that case is conservative in the other direction. The configuration the
   * plant is licensed to RESPOND with is the post-single-failure one, and B 3.6.6 states it:
   * *"a LOCA mass and energy event with a loss of offsite power, and a single failure of an EDG,
   * which causes the loss of one of two containment spray pumps and two of four fan coolers"*,
   * *"at least one CS train, the NaOH System, and two CRFC units operate, assuming the worst case
   * single active failure"*. HR9 — this sim models the plant as operated — so ONE spray train
   * and TWO fan units are carried, and the response time taken is the ONE-pump 28.5 s rather
   * than the two-pump 26.5 s or the min-pressure case's 9 s.
   *
   * ⚠ THE SCALE IS THE VOLUME BASIS, the same one the free volume above uses, NOT the power
   * basis. Spray and the fan coolers cool an ATMOSPHERE whose mass is set by the free volume, so
   * scaling them on anything else would give this plant a spray of a different effectiveness from
   * the plant it is sourced from. `run_pwr2_bases.js` pins which system scales how.
   *
   * ⚠ NO RWST INVENTORY NODE EXISTS on this plant (declared, `Manuals/12` §13.0, the same
   * omission `pwr2_eccs.js` carries), so spray runs for as long as it is demanded. The anchor
   * plant's *"Minimum Usable RWST Volume 184,950 gal"* would feed one 1800 gpm pump for about
   * 103 minutes before the switchover to sump recirculation this engine does not model.
   */
  var CS = {
    kind: '[sourced]',
    spray_gpm_per_pump:  1800.0,   /* ch15 Table 15.6-18a "Runout flow rate 1800 gpm each" */
    spray_trains:        1,        /* TS Bases B 3.6.6 — the credited post-single-failure train */
    rwst_temp_f:         50.0,     /* ch15 Table 15.6-18a */
    spray_response_s:    28.5,     /* TS Bases B 3.6.6, ONE pump to the upper spray header */
    crfc_units:          2,        /* TS Bases B 3.6.6 — credited post-single-failure */
    crfc_response_s:     44.0,     /* TS Bases B 3.6.6, CRFC total response time */
    /* ⚠ [fitted] — THE ONE NUMBER IN THIS BLOCK THAT IS NOT SOURCED, and it is isolated here so
     * a reader cannot mistake it for one that is. NO document in any lane's corpus gives a CRFC
     * heat-removal rate: `find_source` for "fan cooler", "Btu/hr.*fan", "heat removal rate" and
     * "recirculation fan" on 2026-09-21 returns the system description and no capacity. Two
     * sourced constraints bound the fit and both are recorded so it can be re-argued:
     *   ORDERING — GEND-061 (the TMI-2 hydrogen-burn report), verbatim: *"Heat transfer from the
     *   containment atmosphere to containment sprays is rapid compared to heat removal by
     *   containment coolers"*. So the fan term must be the SLOWER, diverse train. MEASURED at
     *   this value at the mitigated peak (141.6 degC / 286.9 degF): spray removes 9.2 MW against
     *   the fan coolers' 3.9 MW — a ratio of 2.3, spray ahead, as the source orders them.
     *   OUTCOME — TS Bases B 3.6.6: *"a minimum of two CRFC units and one CS train are required
     *   to maintain containment peak pressure and temperature below the design limits"*, with
     *   *"the highest peak containment pressure is 59.7 psig"*. MEASURED, this plant's large
     *   loss-of-coolant accident at severity 1.0, full stack, 600 s: 78.5 psig with neither
     *   system (the #778 figure), 70.0 psig on the fan coolers alone, 62.7 psig on spray and
     *   the isolation alone, 57.8 psig with both — and only the last TURNS OVER, peaking at
     *   402.7 s instead of still climbing at 600.
     * ⚠ DO NOT RETUNE THIS TO BUY MARGIN AGAINST THE 59.7 psig. The mitigated peak sits 1.9 psi
     * under it, which is thin, and the reason is NAMED four paragraphs up in this file's header:
     * there is no structural heat sink, which the header already declares OVERSTATES peak
     * pressure. Raising the fan coefficient until the number looks comfortable would hide a
     * declared-missing term behind a fitted one, and would break the sourced ordering above.
     * The term to build is the wall heat sink.
     * PER FAN UNIT, kW per K of atmosphere elevation, at the anchor plant's scale. */
    crfc_ua_kw_per_k_per_unit: 150.0,
    /* THE FANS' SINK TEMPERATURE IS THE PRE-ACCIDENT CONTAINMENT CONDITION, NOT SERVICE WATER,
     * and that is a deliberate modelling choice with its own reason. Driving the removal off the
     * sourced 30 degF service water would let a realigned fan drag a RECOVERED containment ~95
     * degF below the state the source says it normally sits in — because this engine has no
     * passive structural heat sink and no normal-mode ventilation model to hold it there, the
     * two things that make a real fan cooler park at 125 degF instead of at the service-water
     * temperature. Taking the sourced pre-accident 125 degF as the sink makes the term
     * self-limiting at exactly the condition the plant is documented to sit at, which is what
     * the missing models would have done. The realign is a ONE-SHOT with no automatic securing
     * (the retired engine's row is the same), so a term that did not self-limit would run for
     * ever. DECLARED as a simplification, not sourced. */
    fan_sink_temp_f:     125.0,
    src: 'Ginna UFSAR ch15 (ML20339A101) Table 15.6-18a + Table 15.6-11H; Ginna TS Bases ' +
         'B 3.6.6 (ML20339A221). CRFC UA is [fitted] — see its own comment.'
  };
  /* ONE PATCH POINT for the gate's A/B legs and its mutation set (`run_pwr2_ctmt_esf.js`). The
   * decomposition that proves spray and the fan coolers are SEPARATELY sufficient has to neuter
   * one at a time, and it must neuter them at the SAME line the mutations do or the two would be
   * measuring different plants. Inert in production — the marker is a comment. */
  /*__CS_PATCH__*/

  function f2c(f) { return (f - 32) * 5 / 9; }
  function psigToMpa(p) { return (p + 14.696) / PSI_PER_MPA; }

  /* VOLUME basis — see the header. Uses CVCS's scale so the two cannot drift apart. */
  function volumeScale() {
    return RD.cvcs ? RD.cvcs.volumeScale() : 1;
  }
  function freeVolumeM3() {
    return CTMT.ginna_free_volume_ft3 * volumeScale() / FT3_PER_M3;
  }

  /* SPRAY MASS FLOW, kg/s, on this plant's scale. gpm -> m3/s -> kg/s at the RWST's own sourced
   * temperature, the same convert-once-at-the-constant discipline `pwr2_afw.js` uses for gpm. */
  var GPM_PER_M3S = 15850.32;
  /* ⚠ THE TEMPERATURE-KEYED PROPERTIES, NOT THE PRESSURE-KEYED ONES — the #524 envelope-wall
   * trap. `W.P_sat(10 degC)` is 0.0012 MPa, an order of magnitude below Layer 0's own
   * `LIMITS.P_MIN` of 0.1, so routing 50 degF RWST water through `h_f(P_sat(T))` would evaluate
   * the whole liquid branch at a clipped pressure. `rho_l_sat(T)` / `h_l_sat(T)` take T
   * directly and are valid from 0 degC. */
  function sprayFlowKgs() {
    var v = CS.spray_gpm_per_pump * CS.spray_trains / GPM_PER_M3S;   /* m3/s at Ginna scale */
    return v * W.rho_l_sat(f2c(CS.rwst_temp_f)) * volumeScale();
  }
  /* The enthalpy the spray stream carries in, kJ/kg. */
  function sprayEnthalpy() { return W.h_l_sat(f2c(CS.rwst_temp_f)); }
  /* FAN-COOLER REMOVAL, kW, at an atmosphere temperature of T_c. Self-limiting at the sourced
   * pre-accident condition — see the CS block for why the sink is that and not service water. */
  function fanRemovalKW(T_c) {
    var dT = T_c - f2c(CS.fan_sink_temp_f);
    if (!(dT > 0)) return 0;
    return CS.crfc_ua_kw_per_k_per_unit * CS.crfc_units * dT * volumeScale();
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
    var m_air = Pa0 * 1000 * V / (R_AIR * (T + 273.15));
    return {
      V_m3: V,
      T_c: T,
      m_air: m_air,
      m_water: Pv0 * 1000 * V / (0.4615 * (T + 273.15)),   /* steam, R_v = 0.4615 kJ/kgK */
      /* ⚠ SEEDED WITH INTERNAL ENERGY, NOT ENTHALPY. The residual below works in u, and seeding
       * this with h_g overstated it by the flow-work term R_v*T -- about 150 kJ/kg, 6 % -- which
       * was enough to push the INITIAL condition past the solver bound and report 392 degF for a
       * containment the source says starts at 125. Incoming break flow IS added as enthalpy,
       * which is correct: what a stream carries in is h. Only the seed is a state.
       * ⚠ THE LEDGER IS THE WHOLE ATMOSPHERE'S, WATER AND AIR (#544). The 4,697 kg of air is
       * 3,372 kJ/K -- larger than the steam's own capacity for most of an event -- and a
       * residual that hands the solved T to the air without debiting it walks straight to the
       * solver bound: measured, a stuck-open PORV read 392.0 degF (the 200 degC clamp itself)
       * at 154.6 s and then FELL 229.8 degF as the sump formed, a first-law violation on a
       * sealed volume still gaining mass. Air energy is m_air*cv*T on the same absolute-Kelvin
       * reference here and in the residual -- the air mass never changes, so the reference
       * cancels and the seed still solves the sourced 125 degF exactly. */
      U_total_kJ: (Pv0 * 1000 * V / (0.4615 * (T + 273.15))) *
                  (W.h_g(Pv0) - 0.4615 * (T + 273.15)) +
                  m_air * CV_AIR * (T + 273.15),
      energy_in_kJ: opts.energy_in_kJ === undefined ? 0 : opts.energy_in_kJ,
      mass_in_kg: opts.mass_in_kg === undefined ? 0 : opts.mass_in_kg
    };
  }

  /* An old save's containment carries the water-only ledger under its old name (#544 renamed
   * it when the air's energy entered the residual). Reconstruct the total at the SAVED
   * temperature -- residual continuity is exact, so a migrated plant re-solves the T it was
   * saved at rather than stepping. Absent-tolerant, the #553-555/§95 pattern. */
  function migrateState(ct) {
    if (ct && ct.U_total_kJ === undefined && ct.U_water_kJ !== undefined) {
      ct.U_total_kJ = ct.U_water_kJ + ct.m_air * CV_AIR * (ct.T_c + 273.15);
      delete ct.U_water_kJ;
    }
    return ct;
  }

  /* stepContainment(ct, dt, drivers) -> pressure and temperature.
   *
   *   drivers.mdot_kgs      mass arriving from the break
   *   drivers.h_kJkg        the enthalpy it carries
   *   drivers.spray_active  containment spray is DELIVERING (#784) — the caller owns the
   *                         actuation, the response delay and the AC gate; this layer owns
   *                         only how much water that is and what it does to the atmosphere
   *   drivers.fan_active    the fan coolers are DELIVERING in the safety realign (#784)
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
      ct.U_total_kJ += dm * drivers.h_kJkg;
    }

    /* ---- ACTIVE HEAT REMOVAL (#784) ---------------------------------------------------------
     *
     * ⚠ SPRAY IS A MASS STREAM, NOT A SINK TERM, and that is the whole point. The retired engine
     * models spray as an extra 1/tau on a normalized steam inventory because its containment is
     * a one-state gain model with nowhere to put water. This one carries a real mass and energy
     * ledger closed by a flash equilibrium, so cold RWST water can be handed to it exactly the
     * way break discharge is — as kg/s at an enthalpy — and the existing solve does the physics:
     * the ledger's energy per unit mass falls, the solved temperature falls, the saturation
     * pressure falls with it, vapour condenses into the sump and BOTH partial pressures drop.
     * Nothing about the knockdown is fitted; it is the sourced flow at the sourced temperature
     * through the closure this file already had.
     *
     * DECLARED SIMPLIFICATION: the drops are assumed to reach thermal equilibrium with the
     * atmosphere, i.e. a spray efficiency of 1.0. Real drops fall a finite distance and leave a
     * little short of it, so this is OPTIMISTIC — the same direction as the absent structural
     * heat sink is pessimistic, and the two are not claimed to cancel.
     *
     * ⚠ THE FANS READ LAST STEP'S TEMPERATURE. One-step lag, the house convention, and here it
     * is also what keeps the explicit removal from fighting the implicit solve below: the
     * removal is booked into the ledger and the solver then finds the temperature that ledger
     * implies, rather than two terms chasing each other inside one step. */
    var spray_kgs = 0, fan_kW = 0;
    if (drivers.spray_active) {
      spray_kgs = sprayFlowKgs();
      var dms = spray_kgs * dt;
      ct.m_water += dms;
      ct.U_total_kJ += dms * sprayEnthalpy();
      ct.spray_mass_kg = (ct.spray_mass_kg || 0) + dms;
    }
    if (drivers.fan_active) {
      fan_kW = fanRemovalKW(ct.T_c);
      ct.U_total_kJ -= fan_kW * dt;
      ct.fan_energy_kJ = (ct.fan_energy_kJ || 0) + fan_kW * dt;
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
        /* internal energy: liquid at h_f, vapour at h_g less the flow work it no longer does,
         * and the AIR at m*cv*T on the same absolute reference the seed used (#544) — the
         * 3,372 kJ/K the first build handed the solved temperature without debiting */
        var U = mv * (W.h_g(Ps) - Ps * 1000 / (Ps * 1000 / (0.4615 * TK)))
              + ml * W.h_f(Ps)
              + ct.m_air * CV_AIR * TK;
        return U - ct.U_total_kJ;
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
      /* THE OTHER BOUND, REPORTED FOR THE SAME REASON (#784). The bisection's lower bound is
       * 20 degC and spray injects water at 10 degC (50 degF), so for the first time a run CAN
       * drive the ledger under the search range — at which point the reported temperature is the
       * bound and energy stops being conserved. Reported rather than hidden, the twin of the
       * clamp above. The bound itself is NOT moved: `run_pwr2_containment`'s mutation set names
       * the literal `var lo = 20, hi = 200;`, and a bound edited out from under an anchor makes
       * a caught mutation BLIND instead of failing loudly. Not reached on any ride measured for
       * #784 (spray auto-secures at 3.5 psig, decades above the state this would need). */
      solver_floored: ct.T_c <= 20.001,
      /* what the active systems did this step — the EFFECT, so a gate can assert the removal
       * rather than that a driver was passed (the dark-wire rule, #507 wave 6 / #540) */
      spray_kgs: spray_kgs, fan_kW: fan_kW,
      spray_mass_kg: ct.spray_mass_kg || 0, fan_energy_kJ: ct.fan_energy_kJ || 0,
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
    CTMT: CTMT, CS: CS, freeVolumeM3: freeVolumeM3, volumeScale: volumeScale,
    sprayFlowKgs: sprayFlowKgs, sprayEnthalpy: sprayEnthalpy, fanRemovalKW: fanRemovalKW,
    createContainment: createContainment, stepContainment: stepContainment,
    migrateState: migrateState,
    PSI_PER_MPA: PSI_PER_MPA
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
