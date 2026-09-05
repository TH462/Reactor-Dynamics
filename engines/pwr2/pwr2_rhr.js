/* pwr2_rhr.js — Layer 5: RESIDUAL HEAT REMOVAL. (#479)
 *
 * Reads Layers 0-4. Layer 5's fourth system, and the last that does not wait on #472.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MAKES THIS ONE DIFFERENT: **THE DESIGN BASIS IS A MEASURABLE OUTCOME.**
 *
 * Every other sourced number in PWR2 is a parameter — an area, a volume, a flow at a pressure.
 * RHR's source states a RESULT: *"the RHR system is designed to reduce the temperature of the
 * reactor coolant from 350°F to 140°F within 16 hours."* That is a claim the engine can be RUN
 * against, not merely fitted to — so the heat-transfer coefficient is DERIVED from it and the gate
 * then performs the cooldown and times it. A number that reproduces its own design basis when
 * exercised is a far stronger check than one that matches a table entry.
 *
 * ---------------------------------------------------------------------------------------
 * SOURCED, Westinghouse Technology Systems Manual §5.1 (ML11223A219), verbatim:
 *
 *   "These interlocks prevent the valves from being opened unless the reactor coolant system
 *    pressure is less than 425 psig ... another set of interlocks will cause the valves to
 *    automatically close when the reactor coolant system pressure increases to approximately
 *    585 psig."
 *
 *   "The RHR system is placed in operation approximately four hours after reactor shutdown, when
 *    the temperature and pressure of the RCS are approximately 350°F and 425 psig, respectively."
 *
 *   "Assuming that two heat exchangers and two RHR pumps are in service ... the RHR system is
 *    designed to reduce the temperature of the reactor coolant from 350°F to 140°F within 16
 *    hours. The design heat load is based on the decay heat fraction that exists at 20 hours
 *    following reactor shutdown from extended operations at full power."
 *
 *   Ginna Technical Specification Bases (ML20339A221): RHR entry at "Tavg < 350ºF"; cold shutdown
 *   is "< 200°F"; "low pressure portion of the RHR System is designed for 600 psig".
 *
 * ---------------------------------------------------------------------------------------
 * THE INTERLOCK IS **REPORTED, NOT ENFORCED** — same rule as ECCS (HR5).
 *
 * The 425/585 psig interlock is a protective function and belongs to the control layer. What this
 * file does is publish whether the permissive is satisfied, and — separately — what the system
 * would remove if lined up. **A model that silently refused to cool because a valve interlock was
 * unsatisfied would be making a protection decision inside the engine**, which is the boundary
 * HR5 draws. The distinction matters in exactly one place and it is the interesting one: an
 * operator who opens RHR above the permissive is doing something the plant should PREVENT, and
 * the layer that prevents it is not this one.
 *
 * ---------------------------------------------------------------------------------------
 * SCALING: **POWER**, with ECCS, and for the same reason. RHR's duty is decay heat, which is a
 * fraction of rated power. CVCS is the odd one out (volume) because its duty is inventory. Three
 * systems, two bases, each stated at its own definition — see pwr2_cvcs.js and pwr2_eccs.js.
 *
 * DECLARED OMISSIONS.
 *   NO COMPONENT COOLING WATER LOOP. The CCW side is a fixed sink temperature. A real CCW system
 *   has its own inventory, its own heat exchanger and its own ultimate heat sink, and its
 *   degradation is a casualty this layer cannot express.
 *   NO PUMP HYDRAULICS. RHR flow is a lineup fraction, not a curve — unlike ECCS, whose curve IS
 *   the lesson. The sourced 500/1000 gpm miniflow interlocks are recorded and not modelled.
 *   NO SHARED-PUMP COUPLING WITH ECCS. On a real plant the low-head injection and RHR pumps are
 *   often the same machines, so lining up one can cost the other. Recorded here because it is a
 *   real dependency that this layer's structure currently cannot represent.
 *
 * UNITS ARE SI INTERNALLY. P MPa · T degC · Q kW.  The sourced figures are psig/degF.
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  var W = RD && RD.water;
  /* #514: per-step temperature through the table (pwr2_core's idiom). */
  var VT = RD && RD.vtable;
  var TFH = VT ? VT.T_from_h : (W && W.T_from_h);

  var PSI_PER_MPA = 145.038;
  var F = function (c) { return c * 9 / 5 + 32; };
  var C = function (f) { return (f - 32) * 5 / 9; };
  var PSIG_TO_MPA = function (psig) { return (psig + 14.7) / PSI_PER_MPA; };

  var RHR = {
    /* [sourced] WTSM §5.1 interlocks, in the document's own units */
    permissive_open_psig:  425,
    permissive_close_psig: 585,
    design_psig:           600,      // [sourced] Ginna TS Bases, low-pressure portion
    /* [sourced] the entry and exit conditions of the second cooldown phase */
    entry_temp_f: 350,
    target_temp_f: 140,
    cold_shutdown_f: 200,            // [sourced] Ginna TS Bases
    design_cooldown_hours: 16,       // [sourced] WTSM §5.1
    /* [sourced] the design heat load is the decay fraction at 20 h after shutdown. ANS-5.1's
     * infinite-operation curve gives ~0.4 % of rated there; recorded as the DRIVER's expected
     * magnitude, not used as a constant — decay heat is supplied by the caller, because it is
     * kinetics and kinetics is not built. */
    design_decay_fraction_20h: 0.004,
    /* [derived] the RCP heat at the cooldown lineup — the pump-heat note's own measured
     * figure (1,351 kW against 1,200 kW of decay heat), frozen as the DESIGN load term so
     * the exchanger UA is hardware rather than a function of the boot state (#510 H-3). */
    design_rcp_heat_kW: 1351,
    /* ⚠ [recalled] UNSOURCED, AND QUEUED FOR AN EVIDENCE PASS.
     * (OWNER RULING, 2026-08-15: chose "leave it marked, queue it" over running an evidence pass
     * now or sourcing a document — no component-cooling document is in any lane's corpus, so the
     * pass would likely find nothing today.)
     *
     * 95 degF is the usual component cooling water design temperature and it is NOT sourced here.
     * It is an INPUT to the derived UA, and the cooldown check structurally cannot detect an error
     * in it, because UA was derived to produce that cooldown (see this gate's header). Breaking
     * that circularity needs a second, independent source for either this sink temperature or the
     * heat exchanger duty. Until one exists, the number stands MARKED. */
    ccw_temp_c: C(95),               // [recalled] UNSOURCED -- queued, see the note above
    POWER_SCALE: 300 / 1520,         // with ECCS; RHR's duty is decay heat, a power fraction
    /* RHR FORCED CIRCULATION (#510 H-2). The MECHANISM is sourced — Ginna TS Bases
     * (ML20339A221): "The RCPs and the RHR pumps circulate the coolant through the reactor
     * vessel and SGs at a sufficient rate to ensure proper heat transfer" — and without it a
     * Mode 4 plant with the RCPs secured has STAGNANT legs: the CVCS return chilled the small
     * cold-leg node at ~9 degF/hr while the bulk plant sat still (measured; Tavg is the leg
     * average, so the board read a cooldown that was a mixing artifact). The MAGNITUDE is
     * [derived]: no design flow is stated in WTSM 5.1 ("sized ... to meet the plant cooldown
     * requirements"), but its miniflow valves CLOSE above 1,000 gpm — a pump in service flows
     * above that band, so 1,000 gpm (63.1 kg/s) is a defensible FLOOR for one running pump,
     * not a fitted number. */
    circulation_kgs: 1000 / 264.172 / 60 * 1000
  };

  /* ---- UA IS DERIVED FROM THE **HOLD** CONSTRAINT, NOT FROM THE COOLDOWN TIME ----------
   *
   * The first version bisected for the UA that put the plant at 140 degF after exactly 16 hours.
   * **It found a DEGENERATE solution and the degeneracy was the physics telling me the question
   * was wrong.** The value it returned made the equilibrium FLOOR (T_ccw + Q_decay/UA) land
   * exactly on 140 degF -- so the plant arrived there in 0.46 h and sat, satisfying "140 degF
   * after 16 h" for entirely the wrong reason.
   *
   * MEASURED, and this is why no UA reproduces a 16-hour time constant: with ~1.2 MW of decay heat
   * in a ~22,000 kg plant, a UA large enough to REACH 140 degF has a time constant of about half
   * an hour, and a UA slow enough to take 16 hours has a floor near 270 degC and never gets there.
   * Ginna is no different -- the same arithmetic on its 137,000 kg and 6.1 MW gives ~0.7 h. **The
   * 16-hour figure is not a first-order thermal time constant of anything.**
   *
   * And the source agrees, in the word it actually uses: *"designed to reduce the temperature ...
   * from 350°F to 140°F **within** 16 hours"*. That is a BOUND. What actually sizes the system is
   * the requirement it must meet at the END of the cooldown:
   *
   *     UA_train >= Q_decay / (T_target - T_ccw)          it must HOLD 140 degF against decay heat
   *
   * PER TRAIN, because the source is explicit that half the system still gets there: *"If one of
   * the two pumps or one of the two heat exchangers is not operable, the ability to safely
   * cooldown the plant is not compromised; however, the time required..."* -- the time changes,
   * the OUTCOME does not. So one train alone must satisfy the hold, and the full lineup is twice
   * that.
   *
   * This is a stronger derivation than the one it replaces: it comes from a stated requirement
   * rather than from inverting a bound, it is not degenerate, and it makes the half-lineup case
   * meaningful instead of impossible. */
  /* SIGNATURE TRIMMED (#510 H-3): the old (M_kg, cp_kJkgK, Q_total_kW) took a mass and a
   * specific heat it never read — dead arithmetic at the call site that dressed a boot-state
   * read as a derivation. The hold constraint needs only the design load. */
  function derivedUA(Q_total_kW) {
    var Ttar = C(RHR.target_temp_f), Ts = RHR.ccw_temp_c;
    var perTrain = Q_total_kW / (Ttar - Ts);
    return 2 * perTrain;                    /* two trains, each able to hold the target alone */
  }
  /* THE DESIGN LOAD, AS A CONSTANT (#510 H-3). The UA is HARDWARE — tube area times a heat
   * transfer coefficient — and hardware does not change size with the state of the plant it
   * is bolted to. The old lazy first-step derivation read pump heat from the LIVE plant, so
   * the same exchanger measured 208.76 kW/K on an at-power boot and 96.00 on the shutdown
   * boot (pumps stopped, zero pump heat), and the same throttle cooled at 125.9 vs
   * 61.0 degF/hr — the sourced 100 degF/hr limit sat INSIDE the boot-state spread. The load
   * is still the source's own sentence (decay AND reactor coolant pump heat); the RCP term
   * is the measured cooldown-lineup figure the pump-heat note below has always quoted. */
  function designUA() {
    return derivedUA(RHR.design_decay_fraction_20h * 300000 + RHR.design_rcp_heat_kW);
  }

  /* THE HEAT LOAD IS DECAY HEAT **PLUS PUMP HEAT**, and the source says so in a sentence I had
   * read and not used: *"The heat load handled by the residual heat removal system during the
   * cooldown includes residual and decay heat from the core, AND REACTOR COOLANT PUMP HEAT."*
   *
   * It is not a rounding term. Measured on this plant at the cooldown lineup, the RCPs put in
   * 1,351 kW against 1,200 kW of decay heat -- MORE than the core. Derived against decay alone,
   * the equilibrium floor lands at 143 degF and the plant never reaches its 140 degF target; the
   * cooldown just asymptotes 3 degF short and looks like a slow approach rather than a wrong
   * number. Including it: 118 degF floor, and the target is reached with margin.
   *
   * Read from the PLANT rather than written down, so it follows the pump curve and the lineup --
   * a cooldown with the RCPs secured on natural circulation has a different load, which is a real
   * operational distinction this then represents for free. */
  function pumpHeat_kW(sys) {
    var SRC = RD.sources;
    if (!SRC || !SRC.pumpHead) return 0;
    return SRC.pumpHead(sys) * 1e6 * (sys.mdot_loop / 700) / 1000;
  }

  /* ---- SPREADING THE DUTY, AND WHY IT IS BY **VOLUME** RATHER THAN MASS -------------------
   *
   * The duty has to go somewhere other than one node -- 13.6 MW into the 930 kg cold leg is
   * 14.6 kW/kg, which overshoots inside a timestep and clamps at the property library's floor
   * (D1 §32.3). Spreading it is the lumped stand-in for the circulation a real RHR system has.
   *
   * MASS-weighting is the more obviously correct split and it was the first version. It cost
   * eleven density lookups and a fresh object EVERY STEP, and this gate replays a cooldown once
   * per mutation: the suite took **5m45s**, against ~2.5 minutes for the entire `--fast` run of
   * the whole repo. A gate that expensive stops being run, which is a worse failure than a
   * second-order weighting error.
   *
   * VOLUME fractions are FIXED, so they are computed once and cached, and the per-step cost is a
   * multiply. Conservation is identical -- the shares sum to exactly one either way, so the total
   * removed is exactly `duty` in both. What changes is only WHICH node gets how much, and across
   * a cooldown the node densities spread by ~10 %, so the two splits differ by that much on a
   * second-order detail of a lumped model that has already declared it does not resolve the
   * cold-leg excursion. Stated rather than silently traded. */
  var SHARE = null;
  function shareOut(sys, duty) {
    if (!SHARE || SHARE.n !== sys.nodes.length) {
      /* ON-LOOP NODES ONLY (#510 M-11): RHR circulates the RING — hot-leg suction, cold-leg
       * return — and the two OFF_LOOP nodes (vessel heads, the pressurizer) have NO flow
       * path to it: they are carried as volume, never transported (pwr2_loop's own split).
       * The old all-nodes split landed 22.5 % of shutdown-cooling duty on stagnant water,
       * 15 % of it INSIDE the pressurizer. */
      var off = {};
      ((RD.loop && RD.loop.OFF_LOOP) || []).forEach(function (id) { off[id] = true; });
      SHARE = { n: sys.nodes.length, ids: [], f: [] };
      var Vt = 0, i;
      for (i = 0; i < sys.nodes.length; i++) {
        if (!off[sys.nodes[i].id]) Vt += sys.nodes[i].V;
      }
      for (i = 0; i < sys.nodes.length; i++) {
        if (off[sys.nodes[i].id]) continue;
        SHARE.ids.push(sys.nodes[i].id);
        SHARE.f.push(Vt > 0 ? sys.nodes[i].V / Vt : 0);
      }
    }
    var h = {};
    for (var k = 0; k < SHARE.ids.length; k++) h[SHARE.ids[k]] = -duty * SHARE.f[k];
    return h;
  }

  function createRHR(opts) {
    opts = opts || {};
    return {
      /* Lineup only — NOT a decision to align. Fraction of nameplate: 1 = two pumps and two heat
       * exchangers, 0.5 = one of each, 0 = secured. The source is explicit that half the plant
       * still cools, only slower. */
      running: opts.running === undefined ? false : !!opts.running,
      /* THE SUCTION VALVE (#507 wave 2) — real state, commanded by the engine's align door
       * under the sourced 425/585 psig pair. `running` follows it (the pumps take suction
       * through it). This retires the old contract where true_state published the
       * PERMISSIVE as `rhr_valve_open` — a valve that read open on any depressurized plant
       * with the system secured. */
      valve_open: opts.valve_open === undefined ? false : !!opts.valve_open,
      /* `running` is recomputed every step (valve_open && powered) but must be a DEFINED
       * boolean from t=0: since #605 a consumer reads it BEFORE stepRHR runs in the same
       * step (the loss-of-main-feed arming in pwr2_engine, which is evaluated one step old
       * like the CVCS letdown gate above it), and `!undefined` is true — which on the first
       * step of a cold, RHR-held plant would read as "not on RHR" and arm the very casualty
       * chain the gate exists to hold off. Seeded from the valve; the powered half lands on
       * the first step. */
      running: opts.valve_open === undefined ? false : !!opts.valve_open,
      /* the HX flow split, 0..1 — the cooldown-rate lever (#458: adjusting it is NOT an
       * alignment command and never was) */
      hx_fraction: opts.hx_fraction === undefined ? 1 : Math.max(0, Math.min(1, opts.hx_fraction)),
      avail: opts.avail === undefined ? 1 : opts.avail,
      ccw_temp_c: opts.ccw_temp_c === undefined ? RHR.ccw_temp_c : opts.ccw_temp_c,
      UA: opts.UA === undefined ? designUA() : opts.UA,   // the design constant (#510 H-3)
      removed_kJ: opts.removed_kJ === undefined ? 0 : opts.removed_kJ
    };
  }

  /* stepRHR(rh, sys, dt, drivers) -> {duty_kW, permissive, ...}
   *   drivers.decayHeat_kW  what the core is still making. OPTIONAL, and REPORTED ONLY.
   *
   * ⚠ IT DOES NOT ENTER THE DUTY, and the comment here used to imply it would. The parameter was
   * documented when kinetics did not exist, with the note "supplied by the caller because it is
   * KINETICS, which is not built" — which reads as a wire waiting to be connected. Kinetics is
   * built now, and connecting it here would be WRONG TWICE:
   *
   *   - the duty is `UA * (T_hot - T_ccw)`. A heat exchanger removes what its area and its
   *     temperatures let it remove; it does not know what the core is making.
   *   - the actual decay heat already reaches the plant through the reactor's `heats` map. Adding
   *     it here as well would double-count it, the same trap pwr2_reactor.js's header describes
   *     for `corePower`.
   *
   * `UA` is sized against the DESIGN decay fraction at 20 h, which is a different quantity: a
   * design-basis number used once to size the exchanger, not a live one.
   *
   * What the live figure is genuinely good for is the question an operator actually asks during a
   * cooldown — **is RHR keeping up?** So it is reported as a margin and nothing more (HR5: this
   * layer reports, it does not act).
   *
   * Returns the duty as a POSITIVE number of kW REMOVED, in the shape Layer 4 wants for `sgDuty`,
   * so a caller can hand RHR the heat-sink role the steam generator plays at power. */
  function stepRHR(rh, sys, dt, drivers) {
    drivers = drivers || {};
    var P_psig = sys.P * PSI_PER_MPA - 14.7;

    /* THE PERMISSIVE IS REPORTED, NOT ENFORCED (HR5). Three states, because "can I open it" and
     * "must it shut" are different questions with different setpoints and a deliberate gap
     * between them — the gap IS the interlock's hysteresis and it is sourced. */
    var mayOpen  = P_psig < RHR.permissive_open_psig;
    var mustShut = P_psig >= RHR.permissive_close_psig;

    /* the lazy first-step UA derivation is RETIRED (#510 H-3) — see designUA(): it read the
     * live boot plant (pump heat 0 stopped, ~1.4 MW spinning) and sized the hardware from
     * whichever state the constructor happened to run in. Old saves carry a concrete UA and
     * are untouched; a legacy null (pre-#510 save shapes) lands on the design constant. */
    if (rh.UA === null || rh.UA === undefined) rh.UA = designUA();

    /* SUCTION IS THE HOT LEG — sourced, and it is not a detail: RHR draws from the hot leg and
     * returns to the cold leg, so it sees the hottest water in the loop and its duty follows the
     * hot-leg temperature rather than an average. */
    var Thot = null;
    for (var k = 0; k < sys.nodes.length; k++) {
      if (sys.nodes[k].id === 'hot_leg') Thot = TFH(sys.nodes[k].h, sys.P);
    }
    if (Thot === null) Thot = 0;

    /* the pumps take suction through the valve — no valve, no flow, no duty. `avail` stays
     * a separate lineup fraction (the negative-availability floor below owns its abuse).
     * AND THE PUMPS ARE MOTOR LOADS (#510 H-5): dead bus, no flow — WTSM 5.7.5's blackout
     * takes every decay-heat-removal system except the turbine-driven AFW pump, and this
     * module removed 26.6 MMBtu/hr through one before the gate. `drivers.ac_available`
     * absent means powered, the house convention (every layer-local fixture unchanged). */
    var powered = drivers.ac_available !== false;
    rh.running = rh.valve_open && powered;
    var duty = 0;
    if (rh.running) {
      duty = Math.max(0, rh.avail) * rh.hx_fraction * rh.UA * (Thot - rh.ccw_temp_c);
      if (duty < 0) duty = 0;   /* a heat SINK: it never warms the plant */
    }
    rh.removed_kJ += duty * dt;

    return {
      duty_kW: duty,
      valve_open: rh.valve_open,
      hx_fraction: rh.hx_fraction,
      /* WHERE THE HEAT LEAVES, as a Layer 3 `heats` map -- and it is DISTRIBUTED BY VOLUME
       * FRACTION (the return-site comment said "BY MASS" long after the mass version was
       * reverted for gate cost -- see shareOut's own note), a DECLARED SIMPLIFICATION rather
       * than the obvious choice.
       *
       * The obvious choice is the cold leg, because that is where RHR returns its cooled water.
       * Measured, it does not work at this fidelity: 13.6 MW into a 930 kg node is 14.6 kW/kg, so
       * the cold leg swings 3.4 K/s, overshoots inside one timestep and clamps at the property
       * library's floor. The 16-hour cooldown completed in 36 seconds of garbage.
       *
       * What a real plant does is circulate: RHR draws from the hot leg, cools, and returns to the
       * cold leg, and the loop MIXES that back over a transit time. Representing that properly
       * means an actual junction with its own flow -- which is Layer 3 structure, not a Layer 5
       * driver. Until that exists, spreading the duty by node mass is the honest lumped stand-in:
       * it conserves the energy exactly, it puts the cooling in the loop rather than in one small
       * volume, and IT UNDERSTATES the local cold-leg excursion, which is the direction that
       * matters because thermal shock at the cold leg is a real effect this therefore CANNOT
       * teach. Recorded as an omission rather than left to be discovered. */
      heats: shareOut(sys, duty),
      removed_kJ: rh.removed_kJ,
      /* THE COOLDOWN MARGIN — reported, never acted on. Positive means RHR is removing more than
       * the core is making, so the plant is cooling; negative means it is losing ground. `null`
       * when the caller supplies no decay heat, because a margin against an ASSUMED decay heat
       * would be a fabricated number wearing an operator-facing name. */
      decay_heat_kW: drivers.decayHeat_kW === undefined ? null : drivers.decayHeat_kW,
      margin_kW: drivers.decayHeat_kW === undefined ? null : duty - drivers.decayHeat_kW,
      keeping_up: drivers.decayHeat_kW === undefined ? null : duty >= drivers.decayHeat_kW,
      UA_kW_per_K: rh.UA,
      T_suction_c: Thot,
      /* the interlock, REPORTED */
      permissive_may_open: mayOpen,
      permissive_must_shut: mustShut,
      pressure_psig: P_psig,
      /* REPORTED, never asserted against a remembered band */
      in_cold_shutdown: F(Thot) < RHR.cold_shutdown_f
    };
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.rhr = {
    RHR: RHR, createRHR: createRHR, stepRHR: stepRHR, derivedUA: derivedUA,
    pumpHeat_kW: pumpHeat_kW,
    PSIG_TO_MPA: PSIG_TO_MPA, F: F, C: C
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
