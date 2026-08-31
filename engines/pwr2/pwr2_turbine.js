/* pwr2_turbine.js — Layer 5: THE TURBINE AND GENERATOR. (#479)
 *
 * The last missing boundary condition. `pwr2_sg.js` takes `drivers.steam` as a mass flow somebody
 * supplies; this file is what supplies it, from an ELECTRICAL LOAD DEMAND — which is how a real
 * unit is actually driven, and the reason it had to exist before A1 could be compared with the
 * current engine at all.
 *
 * ---------------------------------------------------------------------------------------
 * ⚠ WHY THIS BLOCKED THE ACCEPTANCE TEST, recorded because it cost a retracted claim (D4 §20.7).
 *
 * `run_pwr2_loadfollow.js` cut steam MASS FLOW to 57.5 % and compared the result against
 * `CURRICULUM.md`'s A1, which cuts ELECTRICAL DEMAND to 60 MWe. Those are different experiments,
 * and the near-agreement of "57.5 %" with "54–56 %" was a coincidence of two similar-looking
 * percentages. Until a load demand can be given to this plant, the two engines cannot be handed
 * the same command.
 *
 * ---------------------------------------------------------------------------------------
 * THE MODEL, AND WHY IT IS NOT AN ISENTROPIC EXPANSION.
 *
 * Layer 0 has no ENTROPY — `pwr2_water.js` exports h, T, rho, P_sat and the saturation pair, and
 * nothing else. A proper isentropic expansion to a condenser pressure is therefore not available,
 * and faking one with a fitted pressure ratio would be a fitted constant wearing thermodynamic
 * clothing. So the cycle is expressed with the quantities that DO exist:
 *
 *     W_electrical = m_steam * (h_g(P_sg) - h_feed) * eta_cycle
 *
 * The bracket is exactly the heat the steam generator gives up per kg — the same expression
 * `pwr2_sg.js` uses for its own energy balance — so this says: the plant converts `eta_cycle` of
 * the heat it removes into electricity. That is a gross thermal efficiency, and it is a number a
 * source can speak to.
 *
 * ETA_CYCLE IS A SOLVE, not a tuning, and the algebra is one line: at rated the steam flow is
 * defined by 300 MWt / (h_g - h_feed), so W = 300 MW * eta_cycle, and this plant's identity is
 * 300 MWt -> 100 MWe. Hence eta_cycle = 1/3 EXACTLY. Nothing was fitted.
 *
 * SOURCED CORROBORATION, and it is close: Ginna UFSAR ch10 (ML20339A040) Table 10.1-1 gives
 * turbine "Maximum guaranteed, kW **585,000 @ 1775 MWt**" — **32.96 %** — and the text gives a
 * verified gross capability of **612,855 kW at 1775 MWt** (34.53 %). This plant's ruled identity
 * sits at 33.33 %, between the two. The efficiency was NOT chosen to land there; it fell out of a
 * rating that predates this file.
 *
 * ---------------------------------------------------------------------------------------
 * ⚠ WHAT THIS DELIBERATELY DOES NOT MODEL, stated rather than discovered:
 *
 *   NO PART-LOAD EFFICIENCY PENALTY. `eta_cycle` is constant, so output is LINEAR in steam flow.
 *   A real machine loses efficiency at part load. The current engine does not model it either —
 *   `pwr_steam_generator.js:575` computes `mwe_output` as `steam_flow_normalized * mwe_rated *
 *   (rpm/rpm_rated) * (vacuum/vacuum_rated)`, with no enthalpy and no efficiency term at all — so
 *   this is not a regression against it, but neither engine can teach the part-load penalty.
 *
 *   NO FEEDWATER HEATING OR EXTRACTION. Real units bleed steam from the turbine stages to heat
 *   feedwater, which is why Ginna's condenser is sized for 4,235,070 lb/hr (533.6 kg/s) against a
 *   full-power steam flow near 985 kg/s — the condenser sees only about HALF the steam. This model
 *   has one steam path and one feedwater enthalpy, so its condenser duty would be the whole flow.
 *   Nothing downstream reads that yet; it is recorded so that whoever adds a condenser knows the
 *   number cannot be scaled from Ginna's without accounting for extraction.
 *
 *   NO SHAFT DYNAMICS. Speed is reported at rated or zero. The current engine carries a
 *   torque/inertia coastdown; that belongs with a trip model, which is control-layer work.
 *
 * UNITS: SI internally — mass flow kg/s, enthalpy kJ/kg, power kW. `mwe` is MEGAwatts electrical
 * because that is what the operator's control is graduated in.
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  var W  = RD && RD.water;

  /* ---- SOURCED / RULED PLANT IDENTITY ------------------------------------------------------ */
  var TURB = {
    mwe_rated:    100.0,     /* [ruled] this plant's gross electrical rating */
    mwt_rated:    300.0,     /* [ruled] this plant's thermal rating */
    rpm_rated:    1800,      /* [sourced] Ginna UFSAR ch10 Table 10.1-1 "Turbine speed, rpm 1800" —
                              * a four-pole half-speed machine, which is what saturated-steam PWR
                              * turbines are. Reported only; there are no shaft dynamics here. */
    src: 'Ginna UFSAR ch10 (ML20339A040) Table 10.1-1 and §10.1.2.1'
  };

  /* THE SOLVE. eta = mwe_rated / mwt_rated, exactly — see the header. Written as the division
   * rather than as 0.3333 so that moving either rating re-solves it instead of silently
   * disagreeing with the plant it describes. */
  function etaCycle() { return TURB.mwe_rated / TURB.mwt_rated; }

  /* ---- THE SOURCED LOAD-FOLLOWING ENVELOPE ------------------------------------------------
   * Ginna UFSAR ch10 §10.1.2.1, verbatim: "load changes up to generation step load increases of
   * 10% of full power and ramp increases of 5% of full power per min within the load range of
   * 12.8% to 100% of full power without reactor trip… Similar step and ramp load reductions are
   * possible within the range of 100% to 12.8%."
   *
   * REPORTED, NOT ENFORCED (HR5). This layer says whether a demand is inside the envelope; it does
   * not refuse one. Rate limiting is a control-layer actuation — the current engine puts its
   * `load_rate_pct_per_min` in config and enforces it in `load_mode.js`, which is the control side,
   * and that division is the house rule. */
  var ENVELOPE = {
    min_load_pct: 12.8, max_load_pct: 100.0,
    step_pct: 10.0, ramp_pct_per_min: 5.0,
    src: 'Ginna UFSAR ch10 (ML20339A040) §10.1.2.1'
  };

  function createTurbine(opts) {
    opts = opts || {};
    return {
      load_target_mwe: opts.load_target_mwe === undefined ? TURB.mwe_rated : opts.load_target_mwe,
      tripped:         opts.tripped === undefined ? false : !!opts.tripped,
      mwe_rated:       opts.mwe_rated === undefined ? TURB.mwe_rated : opts.mwe_rated,
      generated_kJ:    opts.generated_kJ === undefined ? 0 : opts.generated_kJ
    };
  }

  /* steamDemand(tb, P_mpa, h_feed) — the mass flow the turbine must be admitted to make its
   * demanded load at the CURRENT steam conditions.
   *
   * This is the pressure compensation, and it is not cosmetic: as secondary pressure rises, h_g
   * falls slightly, so the SAME electrical demand needs slightly MORE steam. Inverting the output
   * expression is what makes the two consistent — a turbine whose demand and output used different
   * enthalpies would silently fail to deliver what it asked for. */
  function steamDemand(tb, P_mpa, h_feed) {
    if (tb.tripped) return 0;
    var dh = W.h_g(P_mpa) - h_feed;
    if (!(dh > 0)) return 0;
    return (tb.load_target_mwe * 1000) / (etaCycle() * dh);      /* kg/s */
  }

  /* stepTurbine(tb, dt, drivers) -> what the generator actually made.
   *
   *   drivers.steam_kgs  mass flow the SG ACTUALLY delivered (may differ from the demand: the SG
   *                      can be pressure-limited, isolated, or dry)
   *   drivers.P_mpa      secondary pressure the steam is delivered at
   *   drivers.h_feed     feedwater enthalpy, from the SG's own sourced value
   *
   * OUTPUT FOLLOWS THE STEAM ADMITTED, NOT THE LOAD DEMANDED. That distinction is the whole reason
   * the current engine's #284 exists: reading output off the demand meant a load rejection showed
   * full electrical output while the dump vented the difference — the operator asked for 50 MWe
   * and the gauge said 99. */
  function stepTurbine(tb, dt, drivers) {
    drivers = drivers || {};
    if (drivers.steam_kgs === undefined) {
      throw new Error('pwr2_turbine: drivers.steam_kgs is REQUIRED — output follows the steam the ' +
                      'turbine is ADMITTED, and this layer will not read it off the demand.');
    }
    if (drivers.P_mpa === undefined) {
      throw new Error('pwr2_turbine: drivers.P_mpa is REQUIRED — the enthalpy the steam carries ' +
                      'depends on the pressure it arrives at.');
    }
    var h_feed = drivers.h_feed === undefined ? 0 : drivers.h_feed;
    var dh = W.h_g(drivers.P_mpa) - h_feed;
    if (!(dh > 0)) dh = 0;

    var kW = tb.tripped ? 0 : drivers.steam_kgs * dh * etaCycle();
    if (kW < 0) kW = 0;
    tb.generated_kJ += kW * dt;

    var pct = (kW / 1000) / tb.mwe_rated * 100;
    return {
      mwe_output:      kW / 1000,
      load_target_mwe: tb.tripped ? 0 : tb.load_target_mwe,
      /* THE MISMATCH, reported. Positive means the turbine is being admitted less steam than its
       * demand needs — the plant is not delivering what the operator asked for, which is the
       * observable that makes a load rejection legible. */
      deficit_mwe:     (tb.tripped ? 0 : tb.load_target_mwe) - kW / 1000,
      steam_kgs:       drivers.steam_kgs,
      specific_work_kJ_per_kg: dh * etaCycle(),
      eta_cycle:       etaCycle(),
      rpm:             tb.tripped ? 0 : TURB.rpm_rated,
      generated_kJ:    tb.generated_kJ,
      load_pct:        pct,
      /* THE SOURCED ENVELOPE, reported and never enforced — see ENVELOPE. */
      within_envelope: pct >= ENVELOPE.min_load_pct - 1e-9 && pct <= ENVELOPE.max_load_pct + 1e-9
    };
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.turbine = {
    TURB: TURB, ENVELOPE: ENVELOPE, etaCycle: etaCycle,
    createTurbine: createTurbine, steamDemand: steamDemand, stepTurbine: stepTurbine
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
