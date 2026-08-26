/* pwr2_relief.js — Layer 5: SECONDARY RELIEF. (#479)
 *
 * The steam paths that are NOT the turbine. Without them PWR2 can only reproduce the current
 * engine's closed-relief behaviour (D4 §21.1): measured, a 100 → 60 MWe drop with rods in MANUAL
 * puts the current engine at 76.8 % with its dump ~14.7 % open, and PWR2 at 57.9 % because it has
 * nothing to open. #484 is the record of how much that one difference is worth.
 *
 * ---------------------------------------------------------------------------------------
 * ⚠ THE LAYER SPLIT, AND IT IS A RULING, NOT A PREFERENCE.
 *
 * *(OWNER RULING, recorded in the control-layer rework: relief-valve and turbine-trip LOGIC are
 * control-layer actuations on instruments; ENGINES KEEP THE HYDRAULICS.)*
 *
 * So this file answers only "given a valve position and a pressure, what flows?" — it does not
 * decide any position. The one exception is the SAFETY VALVES, and they are not an exception to
 * the rule so much as a case the rule does not reach: a spring-loaded safety valve has no
 * controller and no instrument. It lifts because the pressure under the disc exceeds the spring.
 * That is hydraulics, and it belongs here.
 *
 *     SAFETY VALVES   engine physics — pressure lifts them, this file models them completely
 *     STEAM DUMP      hydraulics HERE, position commanded by the caller
 *     ADV             NOT BUILT — see the note at the bottom
 *
 * ---------------------------------------------------------------------------------------
 * SOURCED, and all of it Ginna — this plant's anchor — so nothing needed re-anchoring. That is
 * worth stating because the first figures this pass turned up (1234 psig safety, 1185 psig design,
 * ML11223A213/A229) belong to a FOUR-LOOP plant whose secondary runs 85 psi higher, and adopting
 * them would have been #380's trap: citing a number from the wrong plant class because it was the
 * first one found.
 *
 *   SAFETY POP     1085 psig — Ginna TS Bases (ML20339A221): "the MSSVs will maintain the
 *                  secondary system pressure at approximately 1085 psig"
 *   SAFETY FLOW    0.84 x rated steam flow at full lift
 *   DUMP CAPACITY  28 % of rated steam flow — Ginna UFSAR ch10 §10.4 (ML20339A040): "eight steam
 *                  dump valves that are capable of passing up to approximately 28% rated steam
 *                  flow". The fleet-typical figure is 40 % (WTSM §11.2, ML11223A294) and this
 *                  plant is deliberately the Ginna-class 28 %.
 *
 * UNITS: SI. Pressure MPa absolute, flow kg/s.
 */
(function (root) {
  'use strict';

  var PSI_PER_MPA = 145.0377;

  var RELIEF = {
    /* [sourced] Ginna 1085 psig first lift. Stored in MPa ABSOLUTE, converted here rather than
     * typed, so the psig figure in the comment is the thing that can be checked against the
     * document and the MPa is derived from it. */
    safety_pop_psig:     1085.0,
    safety_pop_mpa:      (1085.0 + 14.7) / PSI_PER_MPA,
    /* [derived] 3.3 % blowdown class — a safety valve reseats BELOW its pop pressure, and without
     * that hysteresis it chatters at the setpoint. The blowdown fraction is a valve-class figure,
     * not a Ginna measurement, so it is derived and marked as such. */
    safety_blowdown:     0.033,
    /* [sourced] full-lift capacity as a fraction of rated steam flow. */
    safety_flow_frac:    0.84,
    /* ---- THE ATMOSPHERIC RELIEF VALVE (the ladder's middle rung, 2026-08-19) --------------
     * Ginna TS Bases B 3.7.4 (ML20339A221), verbatim: one ARV per SG main steam header, "a
     * relief capacity of 329,000 lbm/hr each (approximately 4% of RTP)", "normally closed,
     * fail closed", "equipped with pneumatic controllers to permit control of the cooldown
     * rate", with an upstream BLOCK VALVE "to isolate a failed open ARV". Two sourced
     * functions: "(a) provide secondary system overpressure protection below the setpoint of
     * the main steam safety valves; and (b) provide a method for cooling the plant should the
     * preferred heat sink via the steam dump system to the condenser not be available." The
     * SGTR event is its design basis. It discharges to ATMOSPHERE -- no condenser, which is
     * function (b)'s whole point.
     * CAPACITY: one valve on this single-loop plant, per-MWt from Ginna's two-loop figure:
     * 329,000 x 300/1520 = 64,934 lb/hr = 8.18 kg/s. The source's own cross-check lands:
     * 8.18 kg/s x h_fg at the setpoint is ~12.3 MW = 4.1 % of 300 MWt against the stated
     * "approximately 4% of RTP".
     * SETPOINT [derived]: B 3.7.4 places the auto function "below the setpoint of the MSSVs"
     * without a number; the WAT 05 plant sets its ARV 45 psi below its lowest safety (1125 vs
     * 1170 psig), and the same margin below Ginna's 1085 psig pop gives 1040 psig. The
     * modulating band [derived, 25 psi] keeps it fully open before the safeties pop. */
    adv_setpoint_psig:   1040.0,
    adv_setpoint_mpa:    (1040.0 + 14.7) / PSI_PER_MPA,
    adv_band_mpa:        25.0 / PSI_PER_MPA,
    adv_kgs:             329000.0 / 7936.64 * (300.0 / 1520.0),
    /* [derived] the pressure band from first lift to FULL lift. A real bank is several valves at
     * staggered setpoints, which together look like a ramp; this lumps them into one. Declared,
     * because a single valve popping to full flow at one pressure would be a step and would make
     * the secondary ring. */
    safety_full_lift_mpa: 0.35,

    /* [sourced] Ginna ch10 §10.4 — 28 % of rated steam flow, eight valves. */
    dump_capacity_frac:  0.28,

    src: 'Ginna TS Bases ML20339A221 (1085 psig MSSV) and Ginna UFSAR ch10 ML20339A040 (28 % dump)'
  };

  function safetyReseatMpa() { return RELIEF.safety_pop_mpa * (1 - RELIEF.safety_blowdown); }

  function createRelief(opts) {
    opts = opts || {};
    return {
      /* Safety valves LATCH. Once lifted they stay lifted until pressure falls to the reseat
       * point — that is what blowdown IS, and a stateless "open if P > pop" model chatters. */
      safety_open:  opts.safety_open === undefined ? false : !!opts.safety_open,
      relieved_kg:  opts.relieved_kg === undefined ? 0 : opts.relieved_kg
    };
  }

  /* stepRelief(rl, P_mpa, dt, drivers) -> the steam leaving by every path that is not the turbine.
   *
   *   drivers.rated_steam_kgs      the plant's rated steam flow; capacities are fractions of it
   *   drivers.dump_demand          0..1, COMMANDED position. This layer does not compute it.
   *   drivers.condenser_available  the dump discharges to the CONDENSER, so it is unavailable on a
   *                                loss of vacuum or a blackout. Defaults TRUE; a caller modelling
   *                                that loss must say so.
   */
  function stepRelief(rl, P_mpa, dt, drivers) {
    drivers = drivers || {};
    if (drivers.rated_steam_kgs === undefined) {
      throw new Error('pwr2_relief: drivers.rated_steam_kgs is REQUIRED — every capacity here is a ' +
                      'FRACTION of rated flow, and this layer will not invent the plant it is a ' +
                      'fraction of.');
    }
    var rated = drivers.rated_steam_kgs;

    /* ---- SAFETY VALVES. No controller, no instrument, no permissive: pressure against a spring.
     * The latch is the point — lift at pop, hold until reseat. */
    var reseat = safetyReseatMpa();
    if (!rl.safety_open && P_mpa >= RELIEF.safety_pop_mpa) rl.safety_open = true;
    else if (rl.safety_open && P_mpa <= reseat) rl.safety_open = false;

    var safety = 0;
    if (rl.safety_open) {
      /* Lift fraction ramps from first lift to full lift, standing in for a staggered bank. */
      var lift = (P_mpa - reseat) / RELIEF.safety_full_lift_mpa;
      if (lift < 0) lift = 0;
      if (lift > 1) lift = 1;
      safety = lift * RELIEF.safety_flow_frac * rated;
    }

    /* ---- THE ADV: auto overpressure relief below the safeties, PLUS the operator's cooldown
     * lever (drivers.adv_demand, 0..1 -- the pneumatic controller is the operator's per the
     * source; nothing here automates a cooldown). The block valve isolates both. Atmospheric
     * discharge: deliberately NOT gated on the condenser. */
    var advBlock = drivers.adv_block === undefined ? true : !!drivers.adv_block;
    var advAuto = (P_mpa - RELIEF.adv_setpoint_mpa) / RELIEF.adv_band_mpa;
    if (advAuto < 0) advAuto = 0;
    if (advAuto > 1) advAuto = 1;
    var advMan = drivers.adv_demand === undefined ? 0 : drivers.adv_demand;
    if (advMan < 0) advMan = 0;
    if (advMan > 1) advMan = 1;
    var advFrac = advBlock ? Math.max(advAuto, advMan) : 0;
    var adv = advFrac * RELIEF.adv_kgs;

    /* ---- STEAM DUMP. Hydraulics only. The position is the CALLER'S — this file has no Tavg
     * error, no setpoint and no permissive, by the layer ruling in the header. */
    var demand = drivers.dump_demand === undefined ? 0 : drivers.dump_demand;
    if (demand < 0) demand = 0;
    if (demand > 1) demand = 1;
    var avail = drivers.condenser_available === undefined ? true : !!drivers.condenser_available;
    /* the MSIV sits UPSTREAM of the dumps and the turbine, DOWNSTREAM of the safeties and
     * the ADV (#511 — Ginna TS Bases B 3.7.2: closing it "isolates the turbine, steam dump
     * system, and other auxiliary steam supplies" while "the MSSVs prevent overpressure").
     * Absent means open — the pre-#511 plants never pass it. */
    var msivFrac = drivers.msiv_frac === undefined ? 1 : Math.max(0, Math.min(1, drivers.msiv_frac));
    var dump = avail ? demand * RELIEF.dump_capacity_frac * rated * msivFrac : 0;

    var total = safety + dump + adv;
    rl.relieved_kg += total * dt;

    return {
      safety_kgs: safety, dump_kgs: dump, adv_kgs: adv, total_kgs: total,
      adv_frac: advFrac, adv_auto: advAuto, adv_block_open: advBlock,
      safety_open: rl.safety_open,
      /* REPORTED so a caller can see WHY the dump is passing nothing — a commanded-open dump with
       * no condenser is a different plant state from a shut one, and they must not look alike. */
      dump_available: avail,
      dump_demand: demand,
      relieved_kg: rl.relieved_kg,
      pop_mpa: RELIEF.safety_pop_mpa, reseat_mpa: reseat,
      /* Fraction of rated flow going out through relief — the number that says how far the plant
       * is from balancing on the turbine alone. */
      total_frac: rated > 0 ? total / rated : 0
    };
  }

  /* ---- ⚠ WHAT IS NOT BUILT ------------------------------------------------------------------
   * THE ATMOSPHERIC DUMP VALVES. The current engine has them, and #484 measured them carrying
   * ~9 % of rated flow when the condenser dump was disarmed — so they are not decorative: they are
   * the second rung of the ladder (dump → ADV → safeties) and the reason a secondary cannot be
   * held closed.
   *
   * They are NOT built here because their CAPACITY is not sourced. `find_source` turns up the ADV
   * mechanism and its role but no percentage-of-rated figure for a Ginna-class plant, and inventing
   * one would put an unsourced constant in the middle of the relief ladder — precisely where an
   * error is least visible, because the three paths substitute for one another and the plant
   * balances either way.
   *
   * Consequence, stated rather than left to be discovered: with the dump commanded shut, THIS model
   * holds pressure until the safety valves lift, where the real plant would modulate on the ADVs
   * well below that. So PWR2 currently overstates secondary pressure in exactly the band between
   * the dump's range and 1085 psig. Recorded as owed. */

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.relief = {
    RELIEF: RELIEF, PSI_PER_MPA: PSI_PER_MPA,
    safetyReseatMpa: safetyReseatMpa,
    createRelief: createRelief, stepRelief: stepRelief
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
