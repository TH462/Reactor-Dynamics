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

  /* ================================================================ THE PRIMARY-SIDE FILM (#588)
   * *(OWNER RULING, 2026-09-22: "Ship it and build the SG term now")* — taken knowing it retunes
   * every cooldown, every natural-circulation number and every steam-generator duty.
   *
   * WHAT WAS WRONG. `Q = U*wet*area*(primaryT - T_sec)` had a DRYOUT term on the SECONDARY
   * (`wet`) and NOTHING AT ALL on the primary: no flow term, no phase term. A tube bundle full
   * of stagnant steam transferred heat as if it were full of subcooled water at rated flow.
   * MEASURED on HEAD, `hot_full_power` + `large_loca` + `station_blackout`, seed 0x1234, 1x,
   * at 1,800 s: loop flow 4.1 kg/s (0.25 % of rated), `sg_primary` void fraction 0.998, core
   * 100 % UNCOVERED — and the exchanger removing 5,239 kW against a 5,114 kW decay load, ratio
   * 1.024. The steam generator was the heat sink that kept an uncovered core at 968 degF.
   *
   * ⚠ THE FORM IS SOURCED, IN A STEAM GENERATOR, EXPLICITLY. Ginna UFSAR ch15 (ML20339A101)
   * §15.3.2.1, the locked-rotor accident, verbatim: *"heat transfer to the shell side of the
   * steam generator is reduced: first, because the reduced RCS flow results in a decreased
   * tube-side film coefficient; second, because the reactor coolant in the tubes cools down
   * while the shell-side temperature increases."* That is the flow half of this term, named as
   * a tube-side film coefficient, in the component this file models. The CORRELATION behind the
   * 0.8 exponent is named in the same document (§15.6, FACTRAN): *"the Dittus-Boelter or
   * Jens-Lottes correlation to determine the film heat transfer before DNB."*
   *
   * ⚠ IT IS A SERIES RESISTANCE, NOT A MULTIPLIER ON U — and that distinction is the whole
   * design. `sg.U` is an OVERALL coefficient: tube-side film, tube wall, fouling and shell-side
   * boiling in series. Scaling all of it by the primary film's factor would say a half-flow
   * plant has half the overall U, which is wrong by a factor of two in exactly the regime a
   * natural-circulation cooldown lives in. So the primary film is SPLIT OUT of the rated
   * resistance, degraded alone, and the stack re-summed — which is literally `wallG0`'s shape
   * (`1/(1/hA + R_half)`), one layer up.
   *
   * ⚠ THE PHASE TERM TAKES THE VOID FRACTION, NOT THE QUALITY, and the difference is not small:
   * at the measurement above the `sg_primary` node is 0.645 QUALITY and 0.998 VOID. A film
   * coefficient blends on the fraction of the wall the vapour is against, which is a VOLUME
   * fraction — `pwr2_fuel.filmCoefficient`'s header records this as a measured defect (#490,
   * audit #488 D10.2) from when it was handed quality by `coreRegime`. Layer 5 passes
   * `W.voidFraction`, and the engine's call site is the only one that can. */
  var PRIMARY_FILM = {
    /* [open] THE ONE NEW OPEN NUMBER IN THIS CHANGE, and it is deliberately the SAME anchor
     * `pwr2_fuel.OPEN.h_film` carries: forced convection from a metal surface to subcooled
     * primary water at rated flow is the identical physical situation on a fuel rod and on the
     * inside of a steam-generator tube. Reusing it rather than typing a second one means the
     * resistance SPLIT below is derived, not asserted — and it is the only thing here that a
     * sweep can move (§ the gate's sensitivity table). Carried in kW/m2-K, this file's unit. */
    h_prim_rated: 30.0,
    /* [sourced-form] Dittus-Boelter's Reynolds exponent — ML20339A101 §15.6 names the
     * correlation; `pwr2_fuel.OPEN.dittus_exp` is the same 0.8, same provenance. */
    dittus_exp: 0.8,
    /* [derived] film coefficient in pure vapour against pure liquid AT THE SAME MASS FLUX,
     * from the Dittus-Boelter property group on WCAP-16009-NP-A (ML050910161) Table 10-3.
     * THE SAME NUMBER as `pwr2_fuel.OPEN.vapor_ratio` and `pwr2_core.WALL_FILM.vapor_ratio`,
     * not a third one — this file cannot read either (Layer 5 may read Layer 2, but not
     * Layer 4's fuel model), so the value is retyped and the GATE ties the three together. */
    vapor_ratio: 0.5,
    /* [open] the free-convection floor, tube inside to a stagnant fluid. `pwr2_core.WALL_FILM`'s
     * pair, for the same reason it exists there: h ~ G^0.8 goes to ZERO at zero flow, and a
     * bundle with literally no coupling is a missing regime rather than physics. */
    h_stagnant: 0.5,
    /* [derived] free convection scales with the fluid's own conductivity, and steam's k is about
     * a tenth of water's here — so the FLOOR needs its own phase factor and must NOT reuse
     * `vapor_ratio`, which is a forced-convection ratio at equal mass flux.
     * `pwr2_core.WALL_FILM.vapor_ratio_free`, same value, same argument (#574's second defect). */
    vapor_ratio_free: 0.10
  };

  /* primaryFilmFactor(flowFrac, voidFrac) -> h_prim / h_prim_rated, dimensionless.
   *
   * ⚠ EXACTLY 1 AT RATED by construction — flowFrac 1, voidFrac 0 — so `ratedU()`'s derivation
   * and every number solved alongside it keep their meaning, and a caller that declares neither
   * gets the pre-#588 plant to the last bit (see `stepSG`: an UNDECLARED flow fraction is RATED,
   * never zero — the same honest default as Layer 2's undeclared conductance). */
  function primaryFilmFactor(flowFrac, voidFrac) {
    var f = flowFrac > 0 ? flowFrac : 0;
    var v = voidFrac > 0 ? (voidFrac > 1 ? 1 : voidFrac) : 0;
    var forced = Math.pow(f, PRIMARY_FILM.dittus_exp) *
                 ((1 - v) + v * PRIMARY_FILM.vapor_ratio);
    var floor = (PRIMARY_FILM.h_stagnant / PRIMARY_FILM.h_prim_rated) *
                ((1 - v) + v * PRIMARY_FILM.vapor_ratio_free);
    return forced > floor ? forced : floor;
  }

  /* effectiveU(U_rated, factor) -> the overall coefficient with the tube-side film degraded.
   *
   *     1/U_rated = 1/h_prim_rated + R_rest          (the split, taken at rated)
   *     1/U_eff   = 1/(h_prim_rated*factor) + R_rest (the same stack, primary film degraded)
   *
   * R_rest — tube wall, fouling and the shell-side boiling film — does NOT move: nothing on the
   * primary side changes any of them. `R_rest` is floored at 0 so a fixture that hands this a
   * `U` at or above the rated tube-side film (physically impossible for an OVERALL coefficient,
   * but `createSG` accepts `opts.U`) degrades continuously instead of returning a negative
   * resistance. The factor's own floor is strictly positive, so there is no division by zero. */
  function effectiveU(U_rated, factor) {
    var r_prim0 = 1 / PRIMARY_FILM.h_prim_rated;
    var r_rest = 1 / U_rated - r_prim0;
    if (!(r_rest > 0)) r_rest = 0;
    return 1 / (r_prim0 / factor + r_rest);
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
    /* #524: the bracket floor follows Layer 0's P_MIN (0.1 -> 0.002), or a cold secondary
     * pins at 0.1 MPa / 211 degF and pours false heat into a colder primary — §74's wall. */
    var lo = W.LIMITS.P_MIN, hi = 17.0, i, mid;
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
   *   drivers.flowFrac  loop flow over rated (#588) — get it from `RD.loop.flowFrac(sys)`, never
   *                   by retyping `|mdot|/1630`. UNDECLARED MEANS RATED, not zero.
   *   drivers.voidFrac  the `sg_primary` node's HOMOGENEOUS VOID FRACTION (#588), not its
   *                   quality — `W.voidFraction(node.h, sys.P)`. Undeclared means 0 (liquid).
   *                   At the measured endgame those two differ by 0.645 against 0.998, so
   *                   passing the wrong one is not a rounding difference; see PRIMARY_FILM.
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
    /* THE PRIMARY SIDE (#588). `wet` is the SECONDARY's degradation — the wetted fraction of the
     * bundle, an AREA effect, so it stays a multiplier on the whole UA. The primary film is a
     * RESISTANCE IN SERIES inside U and is degraded there; see PRIMARY_FILM above.
     *
     * ⚠ AN UNDECLARED FLOW FRACTION IS RATED, NEVER ZERO. A Layer 5 fixture stepping this
     * generator by hand has no loop to be a fraction of and no node to read a void from — the
     * same reasoning, and the same default, as `pwr2_core.step`'s `drivers.flowFrac`. So
     * `primary_factor` is exactly 1 for every caller that does not declare, and this line is
     * bit-identical to the pre-#588 form for them. */
    var pf = primaryFilmFactor(drivers.flowFrac === undefined ? 1 : drivers.flowFrac,
                               drivers.voidFrac === undefined ? 0 : drivers.voidFrac);
    /* ⚠ ONE-SIDED: THE TERM MAY DEGRADE, NEVER CREDIT — and the cap is not cosmetic, it is what
     * keeps a healthy at-power plant BIT-IDENTICAL. This plant's loop runs slightly ABOVE its
     * rated 1,630 kg/s (measured, `hot_full_power`: 1,637.6 kg/s at 600 s, flow fraction 1.0046),
     * so an uncapped Dittus-Boelter term would hand the exchanger +0.07 % of U for free — a real
     * retune of every at-power number, bought by extrapolating an [open] rated anchor upward past
     * the point it was solved at. `pwr2_fuel`'s superheat factor takes the identical position for
     * the identical reason ("may DEGRADE cooling, never improve it"), and `>= 1` rather than
     * `=== 1` is also what makes the undeclared-caller path exactly the pre-#588 expression
     * rather than one float rounding away from it. */
    var U_eff = pf >= 1 ? sg.U : effectiveU(sg.U, pf);
    var Q = U_eff * wet * sg.area * (primaryT - T_sec);  // kW, positive = into the secondary

    var feed = drivers.feed || 0, steam = drivers.steam || 0;
    var afw = drivers.afw_kgs || 0, h_afw = drivers.afw_h || 0;
    var leak = drivers.tube_leak_kgs || 0, h_leak = drivers.tube_leak_h || 0;
    var h_g = W.h_g(sg.P);

    /* THE VESSEL CANNOT EXPORT STEAM IT DOES NOT HOLD (#510 H-1). Outflow is limited so the
     * mass floor is never crossed — which also makes the mixing below mass-consistent (the
     * old clamp kept subtracting steam*h_g from a numerator whose mass had stopped falling,
     * and sg.h ran to −11,594 kJ/kg). Consumers get the delivered flow reported back. */
    var inflow = feed + afw + leak;
    /* #524: h_lo follows the extended floor. AFW at 88.5 kJ/kg is now ABOVE h_f(P_MIN)
     * (= h_f(0.002) ~ 73 kJ/kg), so the cold-AFW subcooled-lump condition that used to bind
     * the backstop clip 3,872/60,000 steps (§99.6) is representable instead of clipped. */
    var h_lo = W.h_f(W.LIMITS.P_MIN), h_hi = W.h_f(17.0);
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
     * WHAT #549 LEFT IS NOW RETIRED (#524, 2026-08-31). The residual this comment used to
     * declare — 3,872 of 60,000 steps for 0.4 MJ, all of them cold AFW (88.5 kJ/kg) arriving
     * below h_f at the OLD 0.1 MPa floor (417.5) — was the property floor's, not this
     * ledger's, and it left with the floor: h_f(0.002 MPa) ~ 73 kJ/kg sits below every
     * physical inflow this plant has, so the subcooled-inflow state is representable and the
     * clip reports ZERO material bindings on the same transient (gated in run_pwr2_sg). If
     * this clip ever reports binding again, it is a defect, not a declared residual. */
    /* The flag reports MATERIAL corrections only. When the #549 energy limiter binds it
     * lands the post-step h exactly AT h_lo by construction, and float roundoff puts the
     * recomputed value a ulp either side — the restore then moves ~1e-12 kJ/kg and no
     * energy. That is the mass floor's "float roundoff only" case one line up, not the
     * ledger leaving the saturation span, so it does not raise h_clipped (#524 — measured:
     * 3,966/30,000 flag ticks on the refill fixture, every one at h == h_lo exactly,
     * 0.000 MJ moved). */
    var clipped = false;
    if (sg.h < h_lo) { clipped = sg.h < h_lo - 1e-9; sg.h = h_lo; }
    else if (sg.h > h_hi) { clipped = sg.h > h_hi + 1e-9; sg.h = h_hi; }
    updatePressure(sg);

    return {
      duty_kW: Q, T_sec: T_sec, P_sec: sg.P, mass: sg.mass,
      /* #588 — THE CONDUCTANCE THE DUTY WAS COMPUTED THROUGH, kW/K. `Q = UA*(primaryT - T_sec)`
       * and `UA = U_eff*wet*area`, so this is the same three factors one line apart rather than a
       * second copy of them. ⚠ `U_eff`, NOT `sg.U`: once the primary-side film degrades (#588,
       * same issue, second half) the duty is computed through a SMALLER conductance, and a
       * limiter handed the rated one would be bounding a term at a stiffness the term never had
       * — the dark-wire failure in a new place, which is the exact thing this field exists to
       * stop. Layer 5 hands it to Layer 2's maximum-principle limiter, which
       * cannot bound a relaxation whose conductance it has not been told — and which must never
       * back one out of `Q/dT`, because that ratio is a 0/0 wherever the plant is near
       * equilibrium (the limiter's own note has the 1.753e+6 kg/s measurement). Reported whether
       * or not the duty is 0. */
      UA_kW_per_K: U_eff * wet * sg.area,
      /* #588 — the primary-side film factor and the overall coefficient it produced, REPORTED.
       * A term whose only evidence is that a duty came out smaller is a dark wire; these are
       * what the gate asserts against, and what a reader watches collapse on a voided bundle. */
      primary_factor: pf,
      U_eff: U_eff,
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
    ratedU: ratedU, boilDryTime: boilDryTime, updatePressure: updatePressure,
    /* #588 — exported so the gate can drive the primary-side film and the series solve in
     * ISOLATION rather than inferring them from a duty that moved. */
    PRIMARY_FILM: PRIMARY_FILM, primaryFilmFactor: primaryFilmFactor, effectiveU: effectiveU
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
