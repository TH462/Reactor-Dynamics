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
 *   SAFETY BANK    FOUR valves per steam line at STAGGERED setpoints — Ginna UFSAR ch10
 *                  §10.3.2.4 (ML20339A040). One at 1085 psig, three at 1140 psig, each with
 *                  +3 % accumulation. The full table and both of the source's own
 *                  cross-checks are at safety_stage2_psig below (#542).
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
    /* ---- THE STAGGERED BANK (#542, 2026-08-27) ---------------------------------------------
     * This replaced a [derived] `safety_full_lift_mpa: 0.35` lumped band. The evidence pass the
     * lump was standing in for found the arrangement in this plant's OWN anchor, so every figure
     * below is now sourced and the lump is retired.
     *
     * [sourced] Ginna UFSAR ch10 §10.3.2.4 (ML20339A040), verbatim: "There are four main steam
     * safety valves (MSSV) for each steam line. The first valve lifts at 1085 psig and the
     * remaining three valves are set to lift at 1140 psig. The minimum total relieving capacity
     * is 6.58 x 10^6 lbm/hr". The same chapter's equipment table gives the CAPACITIES and the
     * accumulation: "Main steam safety valves ... Number 8 ... Type Crosby ... Capacity (each),
     * lb/hr: 797,689: two valves at 1085 psig +3% accumulation / 837,600: six valves at
     * 1140 psig +3% accumulation". Eight valves is FOUR PER LINE on Ginna's two-line plant;
     * this single-loop plant models one line's worth, which is where the "two"/"six" become
     * one and three.
     *
     * [sourced] WHY the stagger exists — Ginna TS Bases B 3.7.1 (ML20339A221), verbatim: "The
     * MSSV design includes staggered setpoints so that only the needed valves will actuate.
     * Staggered setpoints reduce the potential for valve chattering that is due to steam
     * pressure insufficient to fully open all valves following a turbine/reactor trip."
     *
     * TWO CROSS-CHECKS FROM THE SOURCE ITSELF, both land:
     *   2 lines x (797,689 + 3 x 837,600) = 6,620,978 lb/hr against §10.3.2.4's own stated
     *     "minimum total relieving capacity is 6.58 x 10^6 lbm/hr" — 0.6 % apart.
     *   Full bank lift at 1140 x 1.03 = 1174.2 psig is 98.4 % of 110 % of the 1085 psig first
     *     lift (1193.5 psig), satisfying B 3.7.1's "limit the secondary system to <= 110% of
     *     design pressure when passing 100% of design flow".
     *
     * ⚠ STAGE 1's SETPOINT IS `safety_pop_psig` ABOVE — deliberately not retyped here. A
     * constant that is right for one plant is a second copy, and it goes wrong silently the day
     * the plant changes; there is exactly one 1085.0 in this file. */
    safety_stage2_psig:  1140.0,
    /* [sourced] "+3% accumulation" — the pressure rise above a stage's own setpoint that takes
     * it from first crack to full lift. Quoted on the SET pressure in psig, the convention the
     * table itself uses. */
    safety_accumulation: 0.03,
    /* [sourced] per-stage capacity, one steam line's worth, from the table above. The SHARES
     * are derived from these so the lb/hr figures stay the things a reader can check against
     * the document. */
    safety_stage1_lbhr:  797689.0,
    safety_stage2_lbhr:  3 * 837600.0,

    /* [sourced] Ginna ch10 §10.4 — 28 % of rated steam flow, eight valves. */
    dump_capacity_frac:  0.28,

    src: 'Ginna TS Bases ML20339A221 (1085 psig MSSV) and Ginna UFSAR ch10 ML20339A040 (28 % dump)'
  };

  /* ONE definition of blowdown, used by every stage AND by the exported bank figure — a second
   * copy is how a mutation goes blind on the half nobody re-anchored. */
  function reseatOf(setMpa) { return setMpa * (1 - RELIEF.safety_blowdown); }
  /* the BANK's reseat is stage 1's: the last valve to shut is the first to have opened. */
  function safetyReseatMpa() { return reseatOf(RELIEF.safety_pop_mpa); }

  /* The staggered bank, resolved once from the sourced table into the MPa/fraction form the
   * step uses. Constants: the step runs at 50 Hz and must not rebuild this. */
  var SAFETY_STAGES = (function () {
    var psig  = [RELIEF.safety_pop_psig,   RELIEF.safety_stage2_psig];
    var lbhr  = [RELIEF.safety_stage1_lbhr, RELIEF.safety_stage2_lbhr];
    var tot = 0, out = [], i;
    for (i = 0; i < lbhr.length; i++) tot += lbhr[i];
    for (i = 0; i < psig.length; i++) {
      var set = (psig[i] + 14.7) / PSI_PER_MPA;
      out.push({
        set_psig:   psig[i],
        set_mpa:    set,
        band_mpa:   RELIEF.safety_accumulation * psig[i] / PSI_PER_MPA,
        reseat_mpa: reseatOf(set),
        share:      lbhr[i] / tot
      });
    }
    return out;
  })();

  /* THE SAVE MIGRATION (#542), the `msiv` pattern from pwr2_shell.js. The shell saves `rl`
   * wholesale and restores it wholesale, so a save written before the staggered bank carries
   * `safety_open` and no `stages`. Seed stage 1 OPEN AT FULL LIFT when that flag was set — the
   * old model passed flow whenever it was set, and landing on a shut bank would silently drop a
   * relief path mid-transient. A shut legacy flag lands on a shut bank, which is the pre-#542
   * plant exactly. This is also the ONE path that seeds a bank constructed with safety_open. */
  function seedStages(rl) {
    var wasOpen = !!(rl && rl.safety_open), out = [];
    for (var i = 0; i < SAFETY_STAGES.length; i++) {
      out.push({ open: i === 0 && wasOpen, lift: (i === 0 && wasOpen) ? 1 : 0 });
    }
    return out;
  }

  function createRelief(opts) {
    opts = opts || {};
    return {
      /* Safety valves LATCH. Once lifted they stay lifted until pressure falls to the reseat
       * point — that is what blowdown IS, and a stateless "open if P > pop" model chatters. */
      safety_open:  opts.safety_open === undefined ? false : !!opts.safety_open,
      /* the per-stage latch and ratcheted lift (#542). Left null and seeded on the first step
       * by seedStages, so construction and a pre-#542 restore travel the SAME path. */
      stages:       null,
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
    /* `> 0`, not `!== undefined` (#539). The old guard refused to invent a MISSING plant and
     * then silently accepted a ZERO one — the same fabrication with a different spelling, and
     * it is what let Mode 4 ship with every capacity multiplied by nought: the safety-valve
     * latch says OPEN (it keys on pressure alone) while safety_kgs is 0.84 * 0. This is the
     * only hard refusal in the whole rated-scale chain and it did not fire on the case that
     * actually shipped. PWR2_VALIDATION.md:1021 states the house rule: "Every PWR2 layer so
     * far throws rather than fabricate a missing driver (fuelTemp_c, Q_core_kW,
     * rated_steam_kgs)." */
    if (!(drivers.rated_steam_kgs > 0)) {
      throw new Error('pwr2_relief: drivers.rated_steam_kgs must be > 0 — every capacity here is ' +
                      'a FRACTION of rated flow, and this layer will not invent the plant it is a ' +
                      'fraction of. Got: ' + drivers.rated_steam_kgs);
    }
    var rated = drivers.rated_steam_kgs;

    /* ---- SAFETY VALVES. No controller, no instrument, no permissive: pressure against a spring.
     * The latch is the point — lift at a setpoint, hold until that stage's own reseat.
     *
     * A STAGGERED BANK (#542), sourced — see safety_stage2_psig above. Each stage latches on its
     * OWN setpoint, ramps over its OWN +3 % accumulation, and reseats on its OWN 3.3 % blowdown.
     *
     * ⚠ THE RATCHET IS THE LOAD-BEARING LINE. A pop-type safety valve snaps open and stays open
     * until blowdown; it does not modulate back down as pressure falls. Holding the lift while
     * latched makes the flow INDEPENDENT of pressure below the setpoint, and THAT is what makes
     * a sub-setpoint equilibrium impossible.
     *
     * Before #542 the ramp was anchored at the RESEAT pressure, so 71.5 % of it lay below the
     * pop. Measured on the shipped plant, hot full power stepped to 12.8 MWe: the bank went from
     * shut to 98.93 kg/s = 60.2 % of rated in ONE 0.02 s step at first lift, then parked for an
     * hour at 24.2 % of rated and 1063.3 psig — 21 psi BELOW its own 1085 psig setpoint, where
     * no valve in a real bank has one — with 0 reseats and 750,078 lbm vented. Re-anchoring
     * alone only MOVES that park; the ratchet is what abolishes it. */
    if (!rl.stages || rl.stages.length !== SAFETY_STAGES.length) rl.stages = seedStages(rl);
    var safetyFrac = 0, anyOpen = false;
    for (var si = 0; si < SAFETY_STAGES.length; si++) {
      var S = SAFETY_STAGES[si], st = rl.stages[si];
      if (!st.open && P_mpa >= S.set_mpa) st.open = true;
      else if (st.open && P_mpa <= S.reseat_mpa) { st.open = false; st.lift = 0; }
      if (st.open) {
        var lift = (P_mpa - S.set_mpa) / S.band_mpa;
        if (lift < 0) lift = 0;
        if (lift > 1) lift = 1;
        if (lift > st.lift) st.lift = lift;          /* THE RATCHET */
        safetyFrac += st.lift * S.share;
        anyOpen = true;
      }
    }
    /* the published bank flag — pwr2_true_state's sg_safety_open and the board's "SG Safeties
     * Lifting". ANY stage open, which is what an operator sees: metal off its seat. */
    rl.safety_open = anyOpen;
    var safety = safetyFrac * RELIEF.safety_flow_frac * rated;

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
      pop_mpa: RELIEF.safety_pop_mpa, reseat_mpa: safetyReseatMpa(),
      /* which stage is off its seat and how far — the staircase a lumped flag cannot show
       * (#542). Copies, not the live objects: a caller must not be able to move the bank. */
      safety_stages: rl.stages.map(function (s) { return { open: s.open, lift: s.lift }; }),
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
    SAFETY_STAGES: SAFETY_STAGES,
    safetyReseatMpa: safetyReseatMpa,
    createRelief: createRelief, stepRelief: stepRelief
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
