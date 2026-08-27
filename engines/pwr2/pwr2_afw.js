/* pwr2_afw.js — Layer 5: AUXILIARY FEEDWATER, the TMI differentiator. (#479)
 *
 * `Blueprint/PWR2_VALIDATION.md` §31.4 named AFW as independently meaningful — it needs no break,
 * and CURRICULUM.md's Tier C reasoning for it is specific: **a drying steam generator stops
 * absorbing heat WHATEVER THE DUMP DOES**, which is the TMI lesson main feedwater alone cannot
 * teach, because a plant that still has main feed never gets there.
 *
 * ---------------------------------------------------------------------------------------
 * SOURCED, all Ginna UFSAR ch10 §10.4 / ch15 (ML20339A040 / ML20339A101) — the anchor plant:
 *
 *   *"Two motor driven auxiliary feedwater (MDAFW) pumps start to pump 170 gpm to each steam
 *   generator"* (ch15, transient analysis) — the per-pump rated point.
 *
 *   *"The turbine-driven auxiliary feedwater pump (TDAFW) can supply 200% of the required
 *   feedwater and one motor-driven auxiliary feedwater pump (MDAFW) can supply 100% of the
 *   required feedwater for removal of decay heat from the plant."* (ch10) — TDAFW is DOUBLE one
 *   MDAFW's rated point, and *"one MDAFW pump can supply sufficient feedwater for removal of decay
 *   heat from the plant"* on its own (ch10 §10.4, restated) — the sourced basis for giving this
 *   single-loop plant ONE of each rather than Ginna's two-MDAFW-plus-one-TDAFW lineup, the same
 *   "one loop, one pump" convention `pwr2_cvcs.js` and `pwr2_sources.js` already use.
 *
 *   *"Auxiliary feedwater temperature (F) 70 100 100"* (ch15 table) — the design-point 70 degF is
 *   used, the same figure ECCS's RWST anchors on for an unrelated tank, not reused from it.
 *
 * ---------------------------------------------------------------------------------------
 * SCALING: POWER, NOT VOLUME — the same reasoning ECCS and RHR use and CVCS explicitly does not.
 * AFW's duty is carrying away DECAY HEAT, a fraction of rated thermal power, not moving a fraction
 * of RCS inventory. `POWER_SCALE = 300 / 1775`.
 *
 * ---------------------------------------------------------------------------------------
 * DECLARED SIMPLIFICATIONS.
 *   NO PUMP CURVE. Real AFW pumps are centrifugal and their flow falls as SG pressure rises toward
 *   the shutoff head — the corpus gives a single rated point for each pump, not a curve, so this
 *   layer delivers RATED flow whenever a pump is running, independent of SG pressure. That is
 *   OPTIMISTIC at high SG pressure, the same direction pwr2_break.js's overstatement runs, and it
 *   is why `afw_discharge_pressure_mpa` is left declared-missing rather than invented — there is
 *   no curve to read a discharge pressure off.
 *   NO CST INVENTORY. Draws from an unlimited source, same declared omission ECCS makes for the
 *   RWST. A real CST can run dry; this model cannot represent that, so `afw_blocked` — which would
 *   report exactly that condition — stays declared-missing rather than reporting a permanent false.
 *   NO STEAM ADMISSION MODEL FOR THE TDAFW TRAIN. A real turbine-driven pump needs SG steam to
 *   spin it, which is a small extra draw this layer does not subtract. Declared, not modelled.
 *
 * UNITS ARE SI INTERNALLY. mdot kg/s, h kJ/kg. Sourced constants are gpm/degF and converted once.
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  var W = RD && RD.water;

  var GAL_PER_M3 = 264.172;

  var AFW = {
    /* [sourced] Ginna UFSAR ch15 -- the per-MDAFW-pump rated point. */
    mdafw_ginna_gpm: 170,
    /* [sourced, ratio] Ginna UFSAR ch10 -- TDAFW is 200% of one MDAFW's "required feedwater". */
    tdafw_ginna_gpm: 340,
    ginna_mwt: 1775,
    /* [derived] this plant against the anchor, on the POWER basis -- AFW removes decay HEAT */
    POWER_SCALE: 300 / 1775,
    /* [sourced] ch15 table: "Auxiliary feedwater temperature (F) 70 100 100" -- the design point */
    afw_temp_f: 70.0,
    src: 'Ginna UFSAR ch10 & ch15 (ML20339A040 / ML20339A101)'
  };

  function f2c(f) { return (f - 32) * 5 / 9; }
  function gpmToKgs(gpm, rho) { return gpm / GAL_PER_M3 / 60 * (rho === undefined ? 1000 : rho); }

  function mdafwRatedKgs() { return gpmToKgs(AFW.mdafw_ginna_gpm * AFW.POWER_SCALE, 1000); }
  function tdafwRatedKgs() { return gpmToKgs(AFW.tdafw_ginna_gpm * AFW.POWER_SCALE, 1000); }

  /* THE COMBINED RATING IN GPM — the denominator `afw_flow_normalized` is taken against
   * (stepAFW: `rated = mdafwRatedKgs() + tdafwRatedKgs()`), expressed in the unit the SOURCE
   * quotes and the board renders. Derived from the same two sourced points and the same power
   * scale, not retyped: 510 gpm x 300/1775 = 86.2 gpm.
   *
   * WHY IT IS PUBLISHED (#557). The board renders AFW flow as `indication x full_scale` and
   * held its own literal full scale — 640 gpm, which was the RETIRED plant's basis (its
   * `afw_flow_normalized` was a fraction of RATED FEED, full AFW being 0.15 of it, so
   * 0.15 x 640 = 96 gpm read correctly there). This plant renormalized the same instrument to
   * AFW's OWN rating, and the board constant did not move: measured on a loss of main feedwater,
   * 213 gpm shown against 28.8 gpm (1.81 kg/s) delivered, 7.40x. A second copy of a plant
   * constant, held by the consumer — the class control_kernel's getInterlockState comment
   * already names. The plant says its own number instead. */
  function ratedGpm() { return (AFW.mdafw_ginna_gpm + AFW.tdafw_ginna_gpm) * AFW.POWER_SCALE; }

  function createAFW(opts) {
    opts = opts || {};
    return {
      /* Lineup only. NOTHING here decides to start AFW -- Lo-Lo SG level, an SI signal, loss of
       * both main feed pumps, station blackout -- that is the control layer's (HR5), the same
       * split pwr2_eccs.js draws. Since 2026-08-20 pwr2_protection.js reports those starts
       * (the SGLL block: lo-lo + SI built, the other two declared deferred) and the engine
       * facade sets these booleans off its latches -- this file still decides nothing. */
      mdafwRunning: opts.mdafwRunning === undefined ? false : !!opts.mdafwRunning,
      tdafwRunning: opts.tdafwRunning === undefined ? false : !!opts.tdafwRunning,
      mdafwAvail: opts.mdafwAvail === undefined ? 1 : opts.mdafwAvail,
      tdafwAvail: opts.tdafwAvail === undefined ? 1 : opts.tdafwAvail,
      /* THE DISCHARGE BLOCK (#507 wave 6) — the TMI-2 tagged-shut valves: downstream of
       * BOTH pumps, so blocking dead-heads the whole system while every run flag stands.
       * The old engine's afw_failure shape; afw_blocked reports it on the contract. */
      blocked: opts.blocked === undefined ? false : !!opts.blocked,
      delivered_kg: opts.delivered_kg === undefined ? 0 : opts.delivered_kg
    };
  }

  /* stepAFW(af, dt, drivers) -> {mdafw_kgs, tdafw_kgs, total_kgs, mdafw_running, tdafw_running,
   *                     h_kJkg, delivered_kg, afw_flow_normalized}
   *
   * Returns a plain kg/s and enthalpy rather than a Layer 3 `sources` entry -- AFW feeds the
   * SECONDARY, and pwr2_sg.js's `drivers.feed` already takes exactly this shape (kg/s). A caller
   * adds this to whatever main feedwater is still running rather than replacing it, the same
   * "merge, do not displace" rule pwr2_sources.js's `heats` map follows for RHR.
   *
   * drivers.mdafw_power_ok (#507 wave 4): the MOTOR-driven pump is a vital load -- it rides
   * the diesels through a LOOP and dies in a station blackout. Absent means powered. The
   * TURBINE-driven pump is steam-driven and takes NO power driver -- WTSM 5.7.5's "all decay
   * heat removal systems, except the turbine-driven AFW pump, also fail" is the sourced
   * DO-NOT-GATE note this signature enforces by not having a td_power_ok at all. An unpowered
   * demanded pump is RUNNING with no flow (#200 split), never SECURED. */
  function stepAFW(af, dt, drivers) {
    var mdPowered = !drivers || drivers.mdafw_power_ok !== false;
    /* the tagged-shut discharge valves dead-head BOTH trains — delivery only, never demand */
    var open = !af.blocked;
    var md = (open && af.mdafwRunning && mdPowered) ? mdafwRatedKgs() * Math.max(0, af.mdafwAvail) : 0;
    var td = (open && af.tdafwRunning) ? tdafwRatedKgs() * Math.max(0, af.tdafwAvail) : 0;
    var total = md + td;
    af.delivered_kg += total * dt;
    var rated = mdafwRatedKgs() + tdafwRatedKgs();

    return {
      mdafw_kgs: md, tdafw_kgs: td, total_kgs: total,
      /* DEMAND, reported separately from delivery — the house split (#200/#329/#332): a
       * demanded pump with avail 0 is RUNNING with no flow, not SECURED. */
      mdafw_running: !!af.mdafwRunning, tdafw_running: !!af.tdafwRunning,
      blocked: !!af.blocked,
      h_kJkg: W.h_l(f2c(AFW.afw_temp_f), 0.1),      /* near-atmospheric CST, cold */
      delivered_kg: af.delivered_kg,
      afw_flow_normalized: rated > 0 ? total / rated : 0
    };
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.afw = {
    AFW: AFW, mdafwRatedKgs: mdafwRatedKgs, tdafwRatedKgs: tdafwRatedKgs, ratedGpm: ratedGpm,
    createAFW: createAFW, stepAFW: stepAFW, gpmToKgs: gpmToKgs
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
