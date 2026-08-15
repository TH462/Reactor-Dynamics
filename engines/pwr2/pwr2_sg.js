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
    P_noload: 7.03              // MPa  [sourced] Ginna 1005 psig no-load
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

  /* stepSG(sg, primaryT, dt, drivers) -> heat REMOVED from the primary, kW
   *   drivers.feed  kg/s of feedwater
   *   drivers.steam kg/s of steam drawn
   *
   * Returns the duty so Layer 4 can stop being handed one. */
  function stepSG(sg, primaryT, dt, drivers) {
    drivers = drivers || {};
    var T_sec = W.T_sat(sg.P);
    var Q = sg.U * sg.area * (primaryT - T_sec);        // kW, positive = into the secondary

    var feed = drivers.feed || 0, steam = drivers.steam || 0;
    var h_g = W.h_g(sg.P);

    /* Energy and mass on the secondary. Steam leaves at h_g; feed arrives at the sourced
     * feedwater enthalpy. Both are DONOR-CELL, the same rule Layer 2 uses. */
    var dH = Q + feed * SG.h_feed - steam * h_g;        // kW
    var dM = feed - steam;                              // kg/s

    var m_new = sg.mass + dt * dM;
    if (m_new < 1) m_new = 1;                           // dry: the vessel cannot go negative
    sg.h = (sg.mass * sg.h + dt * dH) / m_new;
    sg.mass = m_new;
    updatePressure(sg);

    return {
      duty_kW: Q, T_sec: T_sec, P_sec: sg.P, mass: sg.mass,
      /* Level as a MASS FRACTION only. D3 §3 lumps the secondary, so there is no geometry here
       * to turn inventory into a gauge reading — the level-geometry map is an instrument-layer
       * concern and inventing one here would be the "gauge-shaped quantity published inside
       * true_state" the review's F10 objected to. */
      mass_frac: sg.mass / SG.mass_nominal,
      dry: sg.mass <= 1.01
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
    SG: SG, createSG: createSG, stepSG: stepSG,
    ratedU: ratedU, boilDryTime: boilDryTime, updatePressure: updatePressure
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
