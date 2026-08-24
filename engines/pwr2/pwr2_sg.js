/* pwr2_sg.js — Layer 5 (first system): the LUMPED steam-generator secondary. (#479)
 *
 * Reads Layers 0-4. Blueprint/PWR2_DESIGN.md §7.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS SYSTEM FIRST, AND WHY NOT THE PRESSURIZER.
 *
 * The pressurizer is Layer 5's obvious opener and it is DELIBERATELY NOT BUILT HERE. #472 is
 * rebuilding the pressurizer right now on another lane — 447 lines into `engines/pwr/` in one
 * session — and D1 §6's risk register says of it: "D3 consumes its design; must not race it."
 * Building a second pressurizer in parallel is precisely that race. Layer 2's `extraMass` hook
 * already holds the seat, and Layer 3 measured what it is worth (a rigid loop is 1.06 MPa stiff
 * without a bubble), so the interface is ready and the physics can be consumed. D1 §25.
 *
 * The SG secondary is the right thing to build instead, because it is the one system the loop
 * cannot run without: Layer 4 still takes `sgDuty` as an EXTERNAL DRIVER, a number handed to the
 * plant rather than computed by it. That makes Tier A coupling **A5 — "the SG is the only heat
 * sink" — inexpressible**, because nothing can take the sink away. After this layer it can.
 *
 * ---------------------------------------------------------------------------------------
 * LUMPED, BY RULING. D3 §3 answers Q6 "the secondary is LUMPED" — one node, not a nodalised
 * shell. What that costs is stated rather than discovered: no recirculation ratio, no downcomer,
 * no separator, and therefore **no shrink/swell from the secondary side** (Tier A coupling A9 is
 * an INSTRUMENT effect and stays with the instrument layer — D5 §3, and the review's F5 flagged
 * that this boundary is exactly where the design contradicted itself, so it is worth being
 * explicit: nothing in this file models level swell).
 *
 * SOURCED ANCHORS, all named at their definition:
 *   secondary inventory  Ginna 85,359 lbm/SG power-scaled -> 12,785 kg
 *   heat transfer area   18,135 ft2 at 300 MWt, from EPRI NP-1721 Model 51 tube geometry
 *   feedwater enthalpy   435.2 degF (224 degC) — top of Ginna's sourced 390-435 degF band
 *   no-load steam        1005 psig, Tsat 546.8 degF — Ginna's own no-load point
 *
 * UNITS ARE SI. P MPa · h kJ/kg · m kg · mdot kg/s · Q kW · A m2 · U kW/m2-K
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  var W = RD && RD.water, SRC = RD && RD.sources;

  var SG = {
    mass_nominal: 12785,        // kg   [sourced] Ginna 85,359 lbm/SG, power-scaled
    area_m2: 18135 / 10.7639,   // m2   [derived] 18,135 ft2 from EPRI NP-1721 Model 51
    h_feed: 962.0,              // kJ/kg [sourced] 435.2 degF (224 degC) feedwater
    P_noload: 7.03,             // MPa  [sourced] Ginna 1005 psig no-load
    /* DRYOUT (#510 H-1). Heat transfer needs wetted tubes: below this mass fraction the
     * bundle progressively uncovers and U collapses linearly toward zero — a dry SG is NOT
     * a heat sink. [adopted]: the old engine's own shape (pwr_thermal.js `sg_dryout_wide_pct`
     * 30 % wide-range), mapped through the shared Ginna level map (pwr2_true_state's
     * SG_LEVEL_MAP puts 30 % wide at mass fraction 0.38845). DECLARED divergence from the
     * old engine: no 5 % depleting steam-side residual — this lump goes linearly to zero,
     * one fewer state variable. The SG lo-lo trip (17 % narrow = mass fraction 0.5484) sits
     * ABOVE this threshold, so every protected transient trips before U moves at all. */
    dryout_mass_frac: 0.38845,
    mass_floor_kg: 1            // kg   the vessel cannot go negative; see stepSG's floor
  };

  /* OVERALL U — [derived], and the derivation is the whole point.
   * It is NOT fitted to make anything pass: it is what the sourced area must deliver to move the
   * ruled 300 MWt across the ruled temperatures. Primary Tavg 304.5 degC against a secondary
   * saturated at the ruled full-power steam pressure. Computed once here so that if the area,
   * the power or the temperatures move, U moves with them.
   *
   * IT LANDS INSIDE THE SOURCED BAND, and that is a genuine check rather than a coincidence:
   * D3 §1a-v records a SOURCED overall-U band of 3,500-6,000 W/m2-K ("set by tube wall +
   * fouling"), and this derivation gives ~5,480. D3's own earlier figure of 6,016 sat at the
   * ceiling of that band and was walked back the same day — the difference is that this one uses
   * the ruled Tavg difference rather than an LMTD whose secondary temperature was itself
   * recalled. Reported by the gate, not asserted here. */
  function ratedU() {
    var T_prim = 304.5;                              // degC, ruled Tavg
    var P_steam = 825 / 145.038;                     // MPa, [sourced] Ginna 810 psig outlet class
    var T_sec = W.T_sat(P_steam);
    return 300000 / (SG.area_m2 * (T_prim - T_sec)); // kW/m2-K
  }

  function createSG(opts) {
    opts = opts || {};
    var P = opts.P === undefined ? 825 / 145.038 : opts.P;
    return {
      mass: opts.mass === undefined ? SG.mass_nominal : opts.mass,
      h: opts.h === undefined ? W.h_f(P) : opts.h,     // saturated liquid at the steam pressure
      P: P,
      U: opts.U === undefined ? ratedU() : opts.U,
      area: SG.area_m2
    };
  }

  /* Secondary pressure follows its own saturation state. A lumped boiling vessel sits ON the
   * saturation line by construction — the enthalpy above h_f is quality, not superheat. */
  function updatePressure(sg) {
    var lo = 0.1, hi = 17.0, mid = sg.P;
    for (var i = 0; i < 60; i++) {
      mid = 0.5 * (lo + hi);
      if (W.h_f(mid) < sg.h) lo = mid; else hi = mid;
    }
    sg.P = mid;
    return sg.P;
  }

  /* THE PRIMARY TEMPERATURE THAT DRIVES THIS SG **MUST** BE Tavg. Use this to get it.
   *
   * `ratedU()` above derives U at Tavg = 304.5 degC. If a call site passes anything else, U is
   * correct for a temperature the plant never sees and the secondary settles wherever the
   * mismatch puts it. THAT IS NOT HYPOTHETICAL -- it is what the first A/B run measured (#482,
   * D1 §29.1): the harness passed the `sg_primary` node, 7.1 degC below Tavg, and the secondary
   * sat 89.5 psi low.
   *
   * MEASURED, with a secondary held at its design pressure (D1 §29.5):
   *
   *     drive = sg_primary node    Tavg settles 607.79 degF   ruled 580.1, reference 580.3
   *     drive = Tavg               Tavg settles 580.36 degF   +0.06 degF -- both, to 0.01 %
   *
   * So the choice is not a matter of taste between Tavg, primary outlet and LMTD, which is how
   * #482 first framed it. Tavg is the one that reproduces this plant's ruled temperature AND the
   * reference engine, and it is the one U is already derived at. The other two are wrong here.
   *
   * The helper exists so no call site has to know that. A contract that lives only in a comment
   * gets broken by the next person who writes `stepSG(sg, someTemperature, ...)`. */
  function primaryTavg(sys) {
    /* THE LEGS, not `core` and `sg_primary`. Tavg IS (Thot + Tcold)/2 by definition, and this
     * plant HAS hot_leg and cold_leg nodes -- Layer 1 builds eleven of them. The first version of
     * this helper averaged the core and SG lumps instead, which are volume averages rather than
     * leg temperatures. Measured, it costs 0.14 degF (580.36 against 580.50), so it was not
     * material -- but it was the wrong pair, and `run_pwr2_sg`'s own tavg() helper had used the
     * legs all along. TWO HELPERS IN ONE LAYER DISAGREEING ABOUT WHAT Tavg MEANS is how a 0.14
     * degF nothing becomes a real divergence the first time the lumps and the legs come apart. */
    var W2 = RD && RD.water, hot = null, cold = null;
    for (var i = 0; i < sys.nodes.length; i++) {
      if (sys.nodes[i].id === 'hot_leg') hot = sys.nodes[i];
      else if (sys.nodes[i].id === 'cold_leg') cold = sys.nodes[i];
    }
    if (!hot || !cold) return null;
    return 0.5 * (W2.T_from_h(hot.h, sys.P) + W2.T_from_h(cold.h, sys.P));
  }

  /* stepSG(sg, primaryT, dt, drivers) -> heat REMOVED from the primary, kW
   *   primaryT        degC -- Tavg. Get it from primaryTavg(sys); see the note above.
   *   drivers.feed    kg/s of feedwater (arrives at the sourced SG.h_feed)
   *   drivers.steam   kg/s of steam drawn
   *   drivers.afw_kgs kg/s of auxiliary feedwater, optional -- a SECOND, COLD stream. AFW
   *                   arrives at ~70 degF (21 degC) CST water, not the 435 degF (224 degC)
   *                   main-feed enthalpy, and folding it into `feed` would erase exactly the
   *                   cold-injection steam-pressure suppression the stream exists to model.
   *   drivers.afw_h   kJ/kg of that stream (pwr2_afw.js's stepAFW returns it as h_kJkg)
   *   drivers.tube_leak_kgs / tube_leak_h  a THIRD stream, HOT (#507 wave 5): a ruptured
   *                   tube's primary-side discharge, arriving at the donor node's enthalpy.
   *                   The mass addition is the SGTR accident's whole hazard -- "overfilling
   *                   of the ruptured steam generator" (Ginna UFSAR ch15 sec 15.6.3) -- and
   *                   the old engine never landed it anywhere.
   *
   * Returns the duty so Layer 4 can stop being handed one. */
  function stepSG(sg, primaryT, dt, drivers) {
    drivers = drivers || {};
    var T_sec = W.T_sat(sg.P);
    /* Wetted-bundle degradation (#510 H-1): before the fix, a 1 kg secondary transferred
     * rated UA forever — the pressure bisection pinned at the 0.1 MPa property floor and the
     * "sink" ran 1.88 GW at 211 degF. See dryout_mass_frac above for the adopted shape. */
    var mf = sg.mass / SG.mass_nominal;
    var wet = mf >= SG.dryout_mass_frac ? 1 : Math.max(0, mf / SG.dryout_mass_frac);
    var Q = sg.U * wet * sg.area * (primaryT - T_sec);  // kW, positive = into the secondary

    var feed = drivers.feed || 0, steam = drivers.steam || 0;
    var afw = drivers.afw_kgs || 0, h_afw = drivers.afw_h || 0;
    var leak = drivers.tube_leak_kgs || 0, h_leak = drivers.tube_leak_h || 0;
    var h_g = W.h_g(sg.P);

    /* THE VESSEL CANNOT EXPORT STEAM IT DOES NOT HOLD (#510 H-1). Outflow is limited so the
     * mass floor is never crossed — which also makes the mixing below mass-consistent (the
     * old clamp kept subtracting steam*h_g from a numerator whose mass had stopped falling,
     * and sg.h ran to −11,594 kJ/kg). Consumers get the delivered flow reported back. */
    var inflow = feed + afw + leak;
    var steam_eff = Math.min(steam, Math.max(0, (sg.mass - SG.mass_floor_kg) / dt + inflow));

    /* Energy and mass on the secondary. Steam leaves at h_g; feed arrives at the sourced
     * feedwater enthalpy; AFW at its own cold enthalpy; a tube leak at the primary donor
     * node's own enthalpy. All DONOR-CELL, the Layer 2 rule. */
    var dH = Q + feed * SG.h_feed + afw * h_afw + leak * h_leak - steam_eff * h_g;   // kW
    var dM = inflow - steam_eff;                                                     // kg/s

    var m_new = sg.mass + dt * dM;                       // >= floor by construction
    if (m_new < SG.mass_floor_kg) m_new = SG.mass_floor_kg;   // float roundoff only
    sg.h = (sg.mass * sg.h + dt * dH) / m_new;
    sg.mass = m_new;
    /* BACKSTOP, expected never to bind (gated, not assumed): keep h inside the span the
     * pressure bisection inverts over, so updatePressure stays well-posed at both walls. */
    var h_lo = W.h_f(0.1), h_hi = W.h_f(17.0), clipped = false;
    if (sg.h < h_lo) { sg.h = h_lo; clipped = true; }
    else if (sg.h > h_hi) { sg.h = h_hi; clipped = true; }
    updatePressure(sg);

    return {
      duty_kW: Q, T_sec: T_sec, P_sec: sg.P, mass: sg.mass,
      /* Level as a MASS FRACTION only. D3 §3 lumps the secondary, so there is no geometry here
       * to turn inventory into a gauge reading — the level-geometry map is an instrument-layer
       * concern and inventing one here would be the "gauge-shaped quantity published inside
       * true_state" the review's F10 objected to. */
      mass_frac: sg.mass / SG.mass_nominal,
      wet_frac: wet,
      steam_delivered_kgs: steam_eff,
      steam_starved: steam_eff < steam - 1e-9,
      h_clipped: clipped,
      dry: sg.mass <= SG.mass_floor_kg * 1.01
    };
  }

  /* Boil-dry time at a given steaming rate with no feed — REPORTED. The sourced figure is
   * ~78 s at rated steaming from nominal (Manuals/12 §8.1, from the Ginna inventory). */
  function boilDryTime(sg, steam_kgs) {
    return steam_kgs > 0 ? sg.mass / steam_kgs : Infinity;
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.sg = {
    SG: SG, createSG: createSG, stepSG: stepSG, primaryTavg: primaryTavg,
    ratedU: ratedU, boilDryTime: boilDryTime, updatePressure: updatePressure
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
