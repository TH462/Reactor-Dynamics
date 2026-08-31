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
  /* #514: leg temperatures through the table (pwr2_core's idiom). */
  var VT = RD && RD.vtable;
  var TFH = VT ? VT.T_from_h : (W && W.T_from_h);

  var SG = {
    mass_nominal: 12785,        // kg   [sourced] Ginna 85,359 lbm/SG, power-scaled
    area_m2: 18135 / 10.7639,   // m2   [derived] 18,135 ft2 from EPRI NP-1721 Model 51
    h_feed: 962.0,              // kJ/kg [sourced] 435.2 degF (224 degC) feedwater
    P_noload: 7.03,             // MPa  [sourced] Ginna 1005 psig no-load
    /* THE LEVEL MAP — mass fraction -> WIDE-RANGE level %, and it lives HERE because it is
     * steam-generator GEOMETRY, not an instrument choice. [adopted: `sg_mass_map`,
     * pwr_config.js — the same Ginna 85,359 lbm nominal serves both engines.]
     *
     * IT USED TO BE A LOCAL INSIDE pwr2_true_state.js's level block, with THIS file holding a
     * hand-copied `dryout_mass_frac: 0.38845` and a comment explaining which point of it that
     * number was. That is the second-copy-of-a-plant-constant shape #557/#556/#561 are the
     * record of, one layer in: two files would have had to be edited together for ever, and
     * the #562 overfill wall needed two MORE points off the same curve. One owner, three
     * readers (dryout below, the wall below that, true_state's gauge).
     *
     * THE POINTS THAT ARE LOAD-BEARING, named rather than left as indices:
     *   0.38845 -> 30 % wide   the bundle starts to uncover (DRYOUT, #510 H-1)
     *   0.5484  -> 37.65 %     = 17 % NARROW, the sourced lo-lo trip and AFW start
     *   1.32929 -> 75 % wide   = 100 % NARROW — the top of the narrow range, and where
     *                          CARRYOVER begins (#562)
     *   2.45    -> 100 % wide  the top of the instrument, taken as the vessel's water
     *                          capacity (#562) */
    LEVEL_MAP: [[0, 0], [0.38845, 30], [0.5484, 37.65], [1.0, 59.25], [1.32929, 75], [2.45, 100]],
    /* DRYOUT (#510 H-1). Heat transfer needs wetted tubes: below this mass fraction the
     * bundle progressively uncovers and U collapses linearly toward zero — a dry SG is NOT
     * a heat sink. [adopted]: the old engine's own shape (pwr_thermal.js `sg_dryout_wide_pct`
     * 30 % wide-range), read off LEVEL_MAP above rather than retyped. DECLARED divergence
     * from the old engine: no 5 % depleting steam-side residual — this lump goes linearly to
     * zero, one fewer state variable. The SG lo-lo trip (17 % narrow = mass fraction 0.5484)
     * sits ABOVE this threshold, so every protected transient trips before U moves at all. */
    dryout_mass_frac: 0.38845,
    /* THE WET WALL (#562, owner-ruled 2026-08-27 "Model it now"). Until this landed the lump
     * had NO volume limit at all: measured full-stack on a loss of offsite power with the
     * flow control valves left open, the generator reached 861.7 % of its own nominal
     * inventory (242,866 lbm in a shell rated for 28,186) at five hours and was still filling,
     * while both level gauges pegged at 100 % and the primary cooled 187 degF.
     *
     * SOURCED, and the source is emphatic that this is the hazard, not a curiosity:
     *   Ginna TS Bases (ML20339A221): high SG level *"could cause carryover of water into the
     *   steam lines and result in excessive cooldown of the primary system."*
     *   Ginna UFSAR ch15 (ML20339A101): *"there is also the possibility of steam generator
     *   overfill and damage to the turbine and steam piping."*
     *   WTSM 3.2 (ML11223A213): *"a high-high steam generator level turbine trip to protect
     *   the turbine against excessive moisture carryover."* — built in pwr2_protection.
     *
     * BOTH POINTS COME OFF LEVEL_MAP, so there is no new constant to keep in step:
     *   CARRYOVER BEGINS at the top of the NARROW range (1.32929 = 75 % wide = 100 % narrow).
     *     Above it the separators stop keeping up and the export carries liquid. The hi-hi
     *     turbine trip sits BELOW this at 90 % narrow, which is the whole point of it — the
     *     trip exists to get the machine off the line before the water arrives.
     *   SOLID at the top of the instrument (2.45 = 100 % wide). [adopted]: the model has no
     *     geometry above its own gauge, and the honest reading of "the level instrument tops
     *     out here" is "this is as much water as the shell is represented as holding". Above
     *     it the vessel passes what it takes, the mirror of the mass floor below. */
    carryover_mass_frac: 1.32929,
    mass_full_frac: 2.45,
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
    /* WARM-STARTED (#514): sg.P moves ~nothing in 0.02 s, so start the bracket a small span
     * around the previous solution and expand only if the root has left it — the same
     * warm-start-tight reasoning as pwr2_core's solveP. The cold full-range [0.1, 17]
     * bisection stays as the fallback and is byte-identical to the old behaviour when the
     * warm bracket fails (first call, load of an old save, a violent transient). */
    var lo = 0.1, hi = 17.0, i, mid;
    if (sg.P > lo && sg.P < hi) {
      var span = 0.01;
      var wlo = Math.max(lo, sg.P - span), whi = Math.min(hi, sg.P + span);
      for (i = 0; i < 8 && !(W.h_f(wlo) < sg.h && W.h_f(whi) >= sg.h); i++) {
        span *= 4;
        wlo = Math.max(lo, sg.P - span); whi = Math.min(hi, sg.P + span);
      }
      if (W.h_f(wlo) < sg.h && W.h_f(whi) >= sg.h) { lo = wlo; hi = whi; }
    }
    for (i = 0; i < 60; i++) {
      mid = 0.5 * (lo + hi);
      if (W.h_f(mid) < sg.h) lo = mid; else hi = mid;
      if (hi - lo < 1e-9) { mid = 0.5 * (lo + hi); break; }
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
     * plant HAS hot_leg and cold_leg nodes -- Layer 1 builds ten of them (eleven before #583). The first version of
     * this helper averaged the core and SG lumps instead, which are volume averages rather than
     * leg temperatures. Measured, it costs 0.14 degF (580.36 against 580.50), so it was not
     * material -- but it was the wrong pair, and `run_pwr2_sg`'s own tavg() helper had used the
     * legs all along. TWO HELPERS IN ONE LAYER DISAGREEING ABOUT WHAT Tavg MEANS is how a 0.14
     * degF nothing becomes a real divergence the first time the lumps and the legs come apart. */
    var hot = null, cold = null;
    for (var i = 0; i < sys.nodes.length; i++) {
      if (sys.nodes[i].id === 'hot_leg') hot = sys.nodes[i];
      else if (sys.nodes[i].id === 'cold_leg') cold = sys.nodes[i];
    }
    if (!hot || !cold) return null;
    return 0.5 * (TFH(hot.h, sys.P) + TFH(cold.h, sys.P));
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
    var h_lo = W.h_f(0.1), h_hi = W.h_f(17.0);
    var E_in = Q + feed * SG.h_feed + afw * h_afw + leak * h_leak;   // kW delivered this step
    var s_mass = (sg.mass - SG.mass_floor_kg) / dt + inflow;

    /* MOISTURE CARRYOVER — THE WET WALL'S FIRST HALF (#562). Below the top of the narrow
     * range the export is dry saturated vapour, exactly as before. Above it the separators
     * stop keeping up and liquid rides out with the steam, linearly to a water-solid vessel
     * at the top of the instrument. `x` is the export QUALITY, so h_out slides from h_g down
     * to h_f — it is the ENTHALPY that carries the physics, not a second mass stream, which
     * keeps this one line rather than a two-phase export the rest of Layer 5 would have to
     * learn about. DECLARED SIMPLIFICATION: real carryover is a steep function of level and
     * steaming rate, not a straight line, and the corpus gives no curve — this is the same
     * "no curve to read, so state the shape" position pwr2_afw.js takes on its pump.
     * At or below carryover_mass_frac this is IDENTICALLY the old behaviour (x = 1). */
    var mfNow = sg.mass / SG.mass_nominal;
    var x_out = mfNow <= SG.carryover_mass_frac ? 1
              : Math.max(0, (SG.mass_full_frac - mfNow) /
                            (SG.mass_full_frac - SG.carryover_mass_frac));
    var h_f_now = W.h_f(sg.P);
    var h_out = h_f_now + x_out * (h_g - h_f_now);

    /* ...NOR CAN IT EXPORT VAPOUR IT HAS NO ENERGY TO RAISE (#549). The mass limiter above
     * shipped WITHOUT AN ENERGY COUNTERPART, and the hole it left made a boiled-dry generator
     * an ABSORBING STATE. At the 1 kg floor `s_mass` reduces to `inflow`, so the vessel
     * exported exactly what was fed to it — 6,526 kg (14,387 lbm) in, 6,526 kg out, net
     * 0.000 kg over 1,200 s — and the latent heat to boil it came from the backstop clip
     * below, which its own comment says never binds and which measured 59,996 of 60,000
     * steps: 13.5 MW (46.2 MMBtu/hr) of energy from nowhere, against 0.374 MW of real
     * primary duty. Restoring auxiliary feedwater to a dry generator did NOTHING.
     *
     * THE LIMIT IS EXACT AND IT IS THE CLIP, SOLVED FOR `s` INSTEAD OF ABSORBED. Requiring
     * the post-step enthalpy to land at or above `h_lo`,
     *
     *     (m*h + dt*(E_in - s*h_g)) / (m + dt*(inflow - s))  >=  h_lo
     *
     * rearranges (both sides positive; the denominator is the new mass) to
     *
     *     s  <=  [ m*(h - h_lo) + dt*(E_in - h_lo*inflow) ] / [ dt*(h_g - h_lo) ]
     *
     * The first numerator term is the vessel's own energy above the property floor — its
     * remaining depressurization headroom — and the second is this step's net delivery
     * above what it costs to bring the inflow up to that floor. So this is NOT a new
     * conservatism: it binds where and only where the clip was binding, and everywhere else
     * `m*(h - h_lo)` is ~10.9 GJ at nominal and the term is unreachable. Referencing h_lo
     * rather than h_f(sg.P) is deliberate — h IS h_f(sg.P) by construction (updatePressure
     * inverts the saturated-liquid line), so an h_f(P) reference would make the export
     * heat-limited at every operating point and take the demand out of the model entirely.
     * MEASURED both ways before choosing; see PWR2_VALIDATION. */
    var s_energy = (sg.mass * (sg.h - h_lo) + dt * (E_in - h_lo * inflow)) /
                   (dt * Math.max(1e-6, h_out - h_lo));
    var steam_eff = Math.min(steam, Math.max(0, s_mass), Math.max(0, s_energy));

    /* THE WET WALL'S SECOND HALF — the SOLID limiter (#562), and it is the exact mirror of
     * the mass floor above. A vessel with nowhere left to put water passes what it takes:
     * once the shell is full the export is FORCED UP to the inflow, whatever the downstream
     * demand is, because the alternative is inventing volume. This is the line that ends the
     * unbounded fill — the energy limiter cannot, since exporting saturated LIQUID takes no
     * latent heat and x_out is already 0 up here.
     *
     * IT OVERRIDES the demand and the energy cap, deliberately and in that order: `steam` is
     * what the valves are asking for and this is what the vessel is physically pushing out.
     * It can never override the MASS cap, because it only engages when the vessel holds
     * 2.45x nominal and s_mass is then enormous. */
    var m_full = SG.mass_full_frac * SG.mass_nominal;
    var s_solid = inflow - (m_full - sg.mass) / dt;
    var solid = s_solid > steam_eff;
    if (solid) steam_eff = Math.max(0, s_solid);

    /* Energy and mass on the secondary. The export leaves at `h_out` — h_g while the vessel
     * is separating properly, sliding to h_f once it is carrying over; feed arrives at the
     * sourced feedwater enthalpy; AFW at its own cold enthalpy; a tube leak at the primary
     * donor node's own enthalpy. All DONOR-CELL, the Layer 2 rule. */
    var dH = E_in - steam_eff * h_out;                                               // kW
    var dM = inflow - steam_eff;                                                     // kg/s

    var m_new = sg.mass + dt * dM;                       // >= floor by construction
    if (m_new < SG.mass_floor_kg) m_new = SG.mass_floor_kg;   // float roundoff only
    sg.h = (sg.mass * sg.h + dt * dH) / m_new;
    sg.mass = m_new;
    /* BACKSTOP, expected never to bind (gated, not assumed): keep h inside the span the
     * pressure bisection inverts over, so updatePressure stays well-posed at both walls.
     *
     * WHAT #549 LEFT, MEASURED — the honest version of "expected never to bind". On the
     * fed transient that used to bind it 59,996 of 60,000 steps for 16,236 MJ (13.5 MW /
     * 46.2 MMBtu/hr), it now binds 3,872 of 60,000 for 0.4 MJ — 0.0003 MW, a 40,000x cut.
     * EVERY ONE of those steps is the SAME condition and it is not this limiter's: the
     * vessel is already AT the 0.1 MPa property floor and cold auxiliary feedwater is
     * arriving at 88.5 kJ/kg, below h_f(0.1 MPa) = 417.5. That makes the lump SUBCOOLED,
     * which a model whose pressure is the inverse of the saturated-liquid line cannot
     * represent, so the clip raises it to saturation. THAT IS THE PROPERTY FLOOR (#524 —
     * extend the water tables below 0.1 MPa), not the energy balance, and widening the clip
     * would not fix it. If the clip starts binding ABOVE the floor, the limiter is wrong. */
    var clipped = false;
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
      /* WHICH WALL the export hit, reported separately — a mass-starved vessel is empty, an
       * energy-starved one has water and no heat to boil it, and the operator's action is
       * different (#549). Both can stand at once at the floor. */
      mass_starved: steam_eff < steam - 1e-9 && s_mass <= s_energy,
      energy_starved: steam_eff < steam - 1e-9 && s_energy < s_mass,
      /* THE WET WALL, REPORTED (#562). `carryover_frac` is the LIQUID fraction of the export
       * — 0 while the vessel separates, 1 when it is solid — and `solid` says the shell has
       * run out of room and is passing its inflow whatever the valves ask. Reported, not
       * inferred from level: the consumer that needs to know the steam line is carrying water
       * should not have to re-derive the geometry. */
      carryover_frac: 1 - x_out,
      steam_out_h: h_out,
      solid: !!solid,
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
