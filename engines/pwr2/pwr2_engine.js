/* pwr2_engine.js — THE FACADE: one object that assembles the PWR2 plant, steps every system in
 * the canonical order, routes commands, and reports through the true_state shim.
 *
 * WHY IT EXISTS (2026-08-19, owner ruling "A" on the preview-page route): every gate in
 * test/run_pwr2_* wires the plant BY HAND, each repeating the same assembly and step order —
 * which worked while the systems were being built one at a time, and stops scaling the moment
 * anything above the gates (a page, the eventual M5 integration) needs a plant. This file is
 * that wiring written ONCE, and the gates' hand wiring remains as the independent cross-check
 * that the facade does what they do.
 *
 * WHAT IT IS NOT: an M5-compatible engine. No snapshots, no instrument layer (every value
 * reported is TRUTH — HR1's instrumented reading does not exist here yet and every consumer
 * must say so), no rewind, no attention-stops. Those are the shell-integration milestone's,
 * deliberately not smuggled in.
 *
 * THE STEP ORDER is the gates' own, one-step-lag conventions included:
 *   condenser → dump control → relief (ADV/dump/safeties) → SG → turbine → CVCS → ECCS → AFW
 *   → break → reactor (+damage feedback) → damage → plant (Layer 4) → pressurizer → protection
 *   → containment → true_state.
 * Everything a system reports this step is wired to its consumers NEXT step (relief sinks,
 * charging demand, oxidation heat) — the same explicit lag every gate carries.
 *
 * THE FACADE IS THE CALLER the layer headers keep naming: pwr2_protection "reports
 * reactor_trip; the caller inserts the rods" — this file inserts them (a 2 s drop, [derived]
 * from the trip-to-full-insertion class figure); the ESFAS SI latch starts the ECCS lineup and
 * sheds the pressurizer heaters; relief discharge leaves through the hot-leg sink and arrives
 * in containment carrying its own enthalpy.
 *
 * COMMANDS go through command(eng, name, value) — one door, HR5's spirit at this scale. Rods
 * move at a slewed 1 step/s toward their target ([derived]: Ginna-class rod speed is tens of
 * steps per minute; instant motion would be a lever no real plant has), except a scram.
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  if (!RD || !RD.water || !RD.sources || !RD.reactor || !RD.sg || !RD.turbine || !RD.relief ||
      !RD.condenser || !RD.cvcs || !RD.eccs || !RD.afw || !RD.damage || !RD.protection ||
      !RD.pressurizer || !RD.dumpctl || !RD.break_ || !RD.containment || !RD.trueState ||
      !RD.instruments || !RD.feedwater) {
    throw new Error('pwr2_engine: load the full pwr2 stack first (gate order, see any run_pwr2_*)');
  }
  var W = RD.water, S = RD.sources, R = RD.reactor, G = RD.sg, TB = RD.turbine, RL = RD.relief,
      CD = RD.condenser, CV = RD.cvcs, EC = RD.eccs, AW = RD.afw, DG = RD.damage,
      PT = RD.protection, PZ = RD.pressurizer, DC = RD.dumpctl, BK = RD.break_,
      CT = RD.containment, TS = RD.trueState, IN = RD.instruments, RH = RD.rhr,
      FWM = RD.feedwater;

  var TREF = 304.5, P0 = 15.41, RATED_KW = 300000, MWE_RATED = 100;
  function tLeg(sys, id) {
    for (var i = 0; i < sys.nodes.length; i++) {
      if (sys.nodes[i].id === id) return W.T_from_h(sys.nodes[i].h, sys.P);
    }
    return NaN;
  }
  var DT0_C = 31.1;              /* full-power loop delta-T, [derived] — the settled design
                                  * point's own split (606 - 550 degF = 56 degF = 31.1 degC),
                                  * the delta-T pair's normalization */
  /* Manual rod motion by the operator's S/M/F selection (#506.4). The SPEEDS are the sourced
   * quantity (WTSM 8.1: 8-72 steps/min, normal 48 — the same class range pwr1's slow/normal/
   * fast descend from); these values are [derived] — pwr1's three rates mapped by fraction-of-
   * travel-per-second onto this plant's 200-step bank (0.0585 / 0.351 / 0.526 %/s). The old
   * single ROD_SLEW_SPS = 1.0 was ~pwr1's FAST, always. */
  var ROD_SPEEDS = { slow: 0.117, normal: 0.702, fast: 1.053 };   /* steps/s */
  /* THE ROD INSERTION LIMIT (#507 §B, wave 8) — [adopted tune] pwr1's power-dependent curve
   * on this bank: NO limit below 5 % power (a startup drives the bank deep; boron and the
   * shutdown bank hold the margin), then the %-withdrawn floor ramps linearly 5 → 70 % at
   * 100 %. Control bank ONLY (the shutdown bank's evolutions are deliberate). On this plant
   * it is DISPLAY AND ANNUNCIATOR only — no automatic rod channel exists to stop — and the
   * consumers are the shared ROD LIMIT LO / LO-LO rows [sourced WTSM 8.4 ML11223A256:
   * "Rod Limit Low setpoint = RIL + 10 steps", "Rod Limit Low-Low setpoint = RIL"; the
   * shell overrides the shared row's 40-fine-step setpoint to 10 of THIS bank's steps —
   * the same physical number in this bank's own currency]. */
  var RIL = { min_power_pct: 5.0, lo_pct: 5.0, hi_pct: 70.0 };
  function insertionLimitSteps(P_pct) {
    if (!(P_pct > RIL.min_power_pct)) return null;
    var f = Math.min((P_pct - RIL.min_power_pct) / (100 - RIL.min_power_pct), 1);
    return Math.round((RIL.lo_pct + (RIL.hi_pct - RIL.lo_pct) * f) / 100 * 200);
  }
  var SCRAM_S = 2.5;             /* control bank full insertion on a trip — [tune], adopted
                                  * with SD_SCRAM_S from pwr1's 2.5/2.0 pair (#506.3): the
                                  * shutdown bank inserts slightly FASTER, both are ramps */
  var SD_SCRAM_S = 2.0;          /* shutdown bank insertion on a trip, [tune] */

  /* THE DESIGN-POINT ENTHALPY MAP (#502). A scalar h booted every node isothermal at TREF —
   * zero loop delta-T at 100 % power — and the plant spent its first minute developing its
   * own split: measured, power rang 100 -> 76.6 % at t = 2.9 s with a 64 psi pressure sag
   * and a 7-point level dip on every free-play start. Seeding the split kills the ring:
   * same 120 s ride, power min 98.2 %, pressure min 2214 psia.
   *
   * DONOR-CELL: a node's h is its OUTLET state (measured at a 600 s settle), so `core` is a
   * HOT node and `sg_primary` a COLD one — not midpoints. Off-loop nodes are stagnant and
   * keep whatever they boot with; TREF is what the settled plant carries there.
   *
   * Derived from the config constants (TREF, DT0_C, P0), not from the measured settle
   * (287.45/318.98 degC) — the constants stay the authority (Hard Rule 9) and the ~1.3 degC
   * residual drift is bounded by the run_pwr2_engine no-command ride check.
   *
   * The kinetics REFERENCES stay at TREF: re-pointing createReactor's coolTemp_c and the
   * criticalBoron trim at the hot-leg temperature was measured (2026-08-21) to detonate —
   * power 928 % in one step, beyond-model latch — because TREF is the self-consistent
   * reference the reactivity chain is normalized against, not a wiring afterthought. */
  function designHmap(tavg_c, dt_c, P_mpa) {
    /* Generalized for the ICs (#507 §F, wave 7): the same donor-cell map about ANY settled
     * operating point — Tavg from the Tref program, the loop split scaling with power.
     * Wave 10 adds the pressure (the shutdown IC is depressurized). No-arg call = the
     * hot-full-power design point, byte-identical to the #502 original. */
    var Tm = tavg_c === undefined ? TREF : tavg_c;
    var dT = dt_c === undefined ? DT0_C : dt_c;
    var Pm = P_mpa === undefined ? P0 : P_mpa;
    var hH = W.h_l(Tm + dT / 2, Pm), hC = W.h_l(Tm - dT / 2, Pm),
        hA = W.h_l(Tm, Pm);
    return { downcomer: hC, lower_plenum: hC, core: hH, upper_plenum: hH, hot_leg: hH,
             sg_primary: hC, crossover: hC, rcp: hC, cold_leg: hC,
             vessel_heads: hA, pressurizer: hA };
  }

  /* THE INITIAL CONDITIONS (#507 §F, wave 7). Each is a SETTLED construction — the #502
   * lesson generalized: every state variable placed at ITS OWN equilibrium for the point,
   * so free play opens without a ring.
   *   - Tavg comes from the plant's own Tref program at the IC's dispatch (at power), or
   *     from the SG side at no load — Tsat of the sourced 1005 psig no-load pressure
   *     (Ginna's own 547 degF / 1005 psig pair; the plant's tavg_noload_c program anchor,
   *     557 degF, is the WTSM 4-loop figure and its saturation pressure, 1106 psia, sits
   *     ABOVE this plant's 1085 psig MSSV pop — MEASURED, which is why the no-load plant
   *     is anchored to its own steam side, and why the HZP dumps boot in PRESSURE mode at
   *     1005 psig: the sourced no-load lineup, and the thing that holds the plant there).
   *   - Kinetics/xenon/decay-heat seed at the IC's own power equilibrium (createKinetics'
   *     convention); boron is trimmed AT the IC's own moderator temperature.
   *   - hot_zero_power is SUBCRITICAL by the adopted 1000 pcm margin (+100 ppm at the
   *     10 pcm/ppm worth), control bank IN, shutdown bank OUT (WTSM 8.1.1: withdrawn
   *     prior to criticality) — pulling the control bank toward criticality IS the
   *     startup. Fission power seeds at 1e-6 (the old engine's source-level convention;
   *     point kinetics has no source term and an exact zero could never start). Decay
   *     heat ~0: a CLEAN core, declared — this is the before-first-startup state, not
   *     post-trip (the post-trip plant is reached by tripping, #468's produced-vs-preset
   *     lesson).
   * cold_shutdown is NOT here YET: the RCP restart it was blocked on exists since wave 9
   * (rcp_start below) — what remains is the cold state's OWN settled construction (a
   * depressurized RHR-held plant, the #468 bank/trim order on a real shutdown bank), the
   * next wave's work, recorded in #507. */
  var ICS = {
    hot_full_power: { pf: 1.0, load_mwe: 100 },
    '50_percent':   { pf: 0.5, load_mwe: 50 },
    hot_zero_power: { pf: 0,   load_mwe: 0, subcritical: true },
    /* THE SHUTDOWN IC (#507 wave 10) is MODE 4, HOT SHUTDOWN — 250 degF / 350 psig,
     * RHR-held, RCPs secured, both banks in, the P-11 blocks taken (the cooldown's own
     * lineup). It is deliberately NOT Mode 5: Layer 0's property floor is 0.1 MPa, whose
     * saturation temperature is 211 degF, so a secondary at or below Mode 5's 200 degF
     * boundary is UNREPRESENTABLE — an SG pinned at the floor would pour false heat into
     * a colder primary for ever (measured reasoning in PWR2_VALIDATION §74). Mode 5 waits
     * on a Layer-0 extension below the floor — a review call, recorded in #507.
     * The #468 order is STRUCTURAL here: boron trims with the shutdown bank OUT, the bank
     * inserts AFTER, so its 3676 pcm is margin in RODS, not boron. */
    /* pzr_level 0.25 (#510 H-2, owner-ruled 2026-08-23): the LEVEL PROGRAM's own value at
     * 250 degF (levelProgram clamps to 25 % there) — settled construction, every state at
     * its own equilibrium. The old 0.30 booted the controller 5 points above program, so
     * the untouched ride opened with a standing drain demand. */
    hot_shutdown:   { pf: 0, load_mwe: 0, subcritical: true, cold: true,
                      tavg_c: 121.1, P_mpa: 2.51, pzr_level: 0.25 }
  };

  function createEngine(opts) {
    opts = opts || {};
    var icName = opts.initial_state === undefined || opts.initial_state === null
                 ? 'hot_full_power' : opts.initial_state;
    var ic = ICS[icName];
    if (!ic) {
      throw new Error('pwr2_engine: unknown initial_state "' + icName + '" — this engine has ' +
                      Object.keys(ICS).join(' / '));
    }
    /* the IC's operating point: Tavg from the Tref program at power, from the sourced
     * no-load steam pressure at hot zero, from its own declared point when cold (the ICS
     * header); pressure is the design point except for the depressurized shutdown state */
    var tavg0 = ic.cold ? ic.tavg_c
              : ic.pf > 0 ? DC.tref(ic.load_mwe / MWE_RATED) : W.T_sat(G.SG.P_noload);
    var icP = ic.cold ? ic.P_mpa : P0;
    var dT0 = DT0_C * ic.pf;
    /* THE COLD LINEUP'S PRESSURE HOLD (#510 H-2). The heater ladder boots lined up AT the
     * shutdown pressure — constructor state, the operator's standing lineup, NOT a dialed
     * command (the pzr_setpoint_mpa command still clamps to the sourced 1700-2500 psig board
     * span, WTSM 10.2 — that span is the at-power PCS dial, and this seed does not touch it).
     * Below P-11 the real plant holds pressure by PROCEDURE — the operator jogging heaters —
     * and a preset is that procedure already performed (the #460 rods-in-MANUAL argument).
     * Without a hold the bubble bleeds down against the surge-line exchange (~16 kW measured)
     * at ~68 psi/hr, untouched. [declared] */
    var pz = PZ.createPressurizer({ P: icP,
      setpoint_mpa: ic.cold ? ic.P_mpa : undefined,
      level_frac: ic.cold ? ic.pzr_level : PZ.levelProgram(tavg0) });
    var hmap = designHmap(tavg0, dT0, icP);
    /* the shutdown IC boots with its RCPs SECURED and the loop still (natural circulation
     * on an isothermal loop is zero; the heatup's first act is the wave-9 rcp_start) */
    var sys = S.createPlant(ic.cold
      ? { h: hmap, P: icP, extraMass: PZ.extraMassFn(pz), omega: 0, pumpTripped: true, mdot: 0 }
      : { h: hmap, P: icP, extraMass: PZ.extraMassFn(pz) });
    /* completeness is structural: a node the map misses falls back to Layer 3's 1250 kJ/kg
     * silently — refuse to build a plant with a mis-seeded node instead */
    sys.nodes.forEach(function (n) {
      if (hmap[n.id] === undefined) throw new Error('pwr2_engine: designHmap has no entry for node "' + n.id + '"');
    });
    /* fission seeds at the IC's power (kinetics/xenon/decay at that power's own equilibrium
     * — the createKinetics convention); 1e-6 is the subcritical source level (ICS header).
     * The kinetics REFERENCES stay at their defaults — see the detonation note above. */
    var powf = ic.pf > 0 ? ic.pf : 1e-6;
    var rx = R.createReactor({ P: powf, coolTemp_c: tavg0 });
    /* TWO BANKS (#506.3, 2026-08-22): control + shutdown, worths from the kinetics module's
     * own gated pair (WTSM 2.2 Table 2.2-1: 4068 / 3676 pcm — the citation, ML11216A051, is
     * NOT in the corpus; the figures are cited-but-uncorroborated, recorded in
     * PWR2_VALIDATION). The old single-bank literal (worth 0.08 = 8000 pcm) was unsourced
     * and bypassed that pair. Both banks FULLY WITHDRAWN at the hot-full-power IC —
     * sourced practice (WTSM 8.1.1: shutdown banks withdrawn prior to criticality; Ginna
     * B 3.1.1: SDM held by the withdrawn bank, in corpus). The 200-step count is [derived],
     * unverified — no corpus document publishes a step total (Ginna TS defers to the COLR).
     * Withdrawn banks contribute exactly 0 pcm, so passing them to criticalBoron below is
     * numerically identical to the old `null` — measured, not assumed (#502's lesson). */
    var ctrlSteps = ic.subcritical ? 0 : 200;    /* HZP: control bank IN, the startup is
                                                  * pulling it; shutdown bank OUT (WTSM 8.1.1) */
    var rodBank = [
      { steps: ctrlSteps, max_steps: 200, worth: RD.kinetics.RODS.worth_control },
      { steps: 200, max_steps: 200, worth: RD.kinetics.RODS.worth_shutdown }
    ];
    /* boron trimmed AT the IC's own moderator temperature and rod lineup; the subcritical
     * margin is +100 ppm ON TOP of critical-with-rods-in, so criticality arrives partway up
     * the bank — a real startup. THE DECLARATION, CORRECTED (#510 M-14): the +100 ppm was
     * converted from "1,000 pcm" at the module's NOMINAL 10 pcm/ppm, but the LOCAL cold
     * worth at the shutdown point is 43.48 pcm/ppm (the moderator-density coupling adds to
     * the direct term), so the margin actually delivered is ~4,348 pcm — conservative, and
     * the ppm figure is what the construction holds; the old 1,000 pcm claim was the
     * nominal-worth arithmetic, not a measurement. */
    var boron0 = RD.kinetics.criticalBoron(rx.kin, tavg0, icP, rodBank,
      rx.kin.X / rx.kin.X_eq_full, rx.fuel.T_fuel_c);
    if (ic.subcritical) boron0 += 0.01 / RD.kinetics.BORON.worth_per_ppm;
    /* THE #468 ORDER, structural: the trim above ran with the shutdown bank OUT, so its
     * worth lands as MARGIN IN RODS on top of the boron — inserting it BEFORE the trim
     * would make the solver pay the bank's 3676 pcm in boron and hand back a cold plant
     * with LESS boron than a hot one (#468's measured 671-vs-857 ppm inversion). */
    if (ic.cold) rodBank[1].steps = 0;
    /* the secondary lands where the primary's duty puts it: Tsec = Tavg − pf·(the design
     * split), P = Psat(Tsec). The full-power path keeps the module's own default literal
     * (byte-identical construction, the save-replay bar). */
    var sg = ic.pf === 1 ? G.createSG({})
           : G.createSG({ P: W.P_sat(tavg0 - ic.pf * (TREF - W.T_sat(G.createSG({}).P))) });
    /* rated_steam is the RATED scale (every normalization's denominator) — computed at the
     * rated dispatch whatever the IC's own load is, then the turbine takes the IC's */
    var tb = TB.createTurbine({ load_target_mwe: MWE_RATED });
    var eng = {
      sys: sys, pz: pz, rx: rx, sg: sg, tb: tb,
      rl: RL.createRelief({}),
      cd: CD.createCondenser({}),
      dc: DC.createDumpCtl({}),
      cv: CV.createCVCS({ boron_ppm: boron0 }),
      ec: EC.createECCS({}),
      aw: AW.createAFW({}),
      fw: FWM.createFeedwater(ic.pf > 0 ? {} : { at_power: false }),
      dm: DG.createDamage({}),
      /* a plant AT POWER has the low-flux block requested (#460); below P-10 the request
       * would be revoked anyway, and HZP boots without it — blocking is the operator's
       * startup action (low_flux_block / the board's block button). The shutdown IC boots
       * with the P-11 pair TAKEN — the cooldown's own lineup ("Block SI is three actions",
       * and the third was the pressure setpoint coming down, already done). */
      pt: PT.createProtection({ blockLowFlux: ic.pf >= 0.1,
                                blockLoPress: !!ic.cold, blockSI: !!ic.cold }),
      brk: null,
      ctm: CT.createContainment({}),
      rated_steam: TB.steamDemand(tb, sg.P, G.SG.h_feed),
      M_nominal: sys.M_total,
      simTime: 0,
      /* command state */
      rodTarget: ctrlSteps, rodSteps: ctrlSteps,
      sdTarget: ic.cold ? 0 : 200, sdSteps: ic.cold ? 0 : 200, rodBank: rodBank,
      _rcpSecured: !!ic.cold,     /* the cooldown SECURED the pumps — the handswitch's word */
      rodSpeedSel: 'normal',
      /* failure levers (#507 wave 6) */
      scramBlocked: false,        /* ATWS — the RPS latches, the rods do not drop */
      runaway: null,              /* {rate steps/s} — continuous outward rod drive */
      cwPumps: true,
      /* THE ELECTRICAL STATE (#507 wave 4). Two booleans, not a bus model: `offsite` is the
       * grid, `blackout` is "the diesels did not answer" (10 CFR 50.2's SBO, the old engine's
       * reading). Derived each step: acAvail (vital buses, = !blackout — the diesels carry
       * them through a plain LOOP) and offsiteOk (nonvital buses, = offsite && !blackout).
       * No diesel start delay or failure probability is modeled — transfer is instantaneous,
       * DECLARED. Which load hangs on which bus is each module's own wire, sourced at the
       * wire (WTSM 3.2/5.7, NUREG-0737 II.E.3.1). */
      elec: { offsite: true, blackout: false },
      /* SHUTDOWN: heaters in AUTO about the boot setpoint (#510 H-2 — the constructor seeds
       * the ladder at the shutdown pressure; see the createPressurizer note above). The old
       * lineup was MANUAL-0 with "the bubble holds at its saturation, DECLARED" — measured
       * false twice over: the seal-injection insurge with no letdown path below 300 psia
       * condensed the bubble (364 → 29 psia in 75 min), and even with that loop closed the
       * surge-line exchange bleeds ~16 kW, −68 psi/hr. The RHR low-pressure letdown path
       * (pwr2_cvcs) closes the inventory balance; the AUTO ladder holds the bubble against
       * the bleed. The heatup's own act is still the operator's pzr_heaters_manual, which
       * overrides the ladder. */
      pzDrivers: {},
      /* HZP: the dumps boot in STEAM PRESSURE mode at the sourced 1005 psig no-load — the
       * prototypical no-load lineup, and what physically holds the plant there (in tavg
       * mode the pump-heated plant would ride the 1085 psig MSSVs instead — the ICS
       * header's measured note). At power: the operator's default (tavg, C-7 armed).
       * SHUTDOWN: the dumps are OFF — RHR is the heat sink at 350 psig, and the condenser
       * set is not the shutdown lineup. */
      dcDrivers: ic.pf > 0 ? {}
               : ic.cold ? { mode: 'off' }
               : { mode: 'pressure', pressure_setpoint_mpa: G.SG.P_noload },
      advDemand: 0, advBlock: true,
      /* one-step-lag carriers */
      _Qox: 0, _pzRelief: 0, _pzReliefH: 0, _pzSurgeHeat: 0, _eccsKgs: 0, _sgtrKgs: 0, _sgtrH: 0,
      _pzr: null, _dcr: null, _lastTrip: false,
      _scramT: null, _manualTrip: false, _rodStopSig: false, _runbackSig: false,
      _rbT: 0, _rbActive: false,
      ins: IN.createInstruments(opts.instruments),
      rh: RD.rhr.createRHR({})
    };
    /* the turbine takes the IC's own dispatch AFTER rated_steam froze the rated scale */
    eng.tb.load_target_mwe = ic.load_mwe;
    /* SHUTDOWN extras: rated_steam recomputed at the DESIGN steam pressure (a 30 psia cold
     * SG would otherwise become every normalization's denominator), and RHR ALIGNED — the
     * Mode 4 heat sink, openable because 350 psig sits under the 425 psig permissive */
    if (ic.cold) {
      eng.rated_steam = TB.steamDemand(tb, G.createSG({}).P, G.SG.h_feed);
      /* RHR ALIGNED (suction open — 350 psig sits under the 425 psig permissive) with the
       * HX THROTTLED SHUT: a HOLD, not a cooldown. Measured with hx 0.5: the HX pulled the
       * heat-free plant down 26 degC in 300 s (−560 degF/hr class) and drained the
       * pressurizer — a settled hold throttles the HX to match the (zero) decay heat, and
       * opening it IS the operator's cooldown lever. */
      eng.rh.valve_open = true;
      eng.rh.hx_fraction = 0;
    }
    /* the feed train at the IC's own operating point (the module's constructor knows only
     * at-power/no-load; a mid-load IC sets the delivered point so the boot does not spend
     * its first pump-tau finding it — the same settled-construction rule as the hmap) */
    if (ic.pf > 0 && ic.pf !== 1) {
      eng.fw.feed_frac = ic.pf;
      eng.fw.valve = ic.pf / (2 * FWM.FW.pump_frac_each);
    }
    return eng;
  }

  /* ---- THE ONE DOOR ------------------------------------------------------------------------ */
  function command(eng, name, value) {
    switch (name) {
      case 'load_mwe':       eng.tb.load_target_mwe = Math.max(0, Math.min(MWE_RATED, +value)); break;
      case 'turbine_trip':   eng.tb.tripped = !!value; break;
      case 'rod_target':
        /* a drive failure owns the bank; a silent acceptance would read like a plant that
         * obeyed (#505's surfaced-refusal rule) */
        if (eng.runaway) {
          throw new Error('pwr2_engine: rod command REFUSED — continuous withdrawal failure ' +
            'active; clear the failure first');
        }
        eng.rodTarget = Math.max(0, Math.min(200, +value)); break;
      case 'sd_target':      eng.sdTarget = Math.max(0, Math.min(200, +value)); break;
      case 'rod_speed':      eng.rodSpeedSel = (value in ROD_SPEEDS) ? value : 'normal'; break;
      /* THE P-11 PAIR (#507 wave 10) — the cooldown's "block SI" actions. ENGAGING is
       * refused above P-11 (the #295 F1 lesson: a block acceptable at power is a defeatable
       * trip); the permissive reads the INDICATED pressure like the RPS does. Disengaging
       * is always allowed, and climbing above P-11 revokes both requests automatically
       * (pwr2_protection owns that law). */
      case 'lo_press_trip_block':
        if (value) {
          var pInd1 = eng.ins.reading.primary_pressure !== undefined
                      ? eng.ins.reading.primary_pressure : eng.sys.P;
          if (pInd1 >= PT.P11.mpa) {
            throw new Error('pwr2_engine: low-pressure trip block REFUSED — above P-11 ' +
              '(the block is a shutdown lineup, not an at-power bypass)');
          }
        }
        eng.pt.blockLoPress = !!value; break;
      case 'si_block':
        if (value) {
          var pInd2 = eng.ins.reading.primary_pressure !== undefined
                      ? eng.ins.reading.primary_pressure : eng.sys.P;
          if (pInd2 >= PT.P11.mpa) {
            throw new Error('pwr2_engine: SI block REFUSED — above P-11 (the block is a ' +
              'shutdown lineup, not an at-power bypass)');
          }
        }
        eng.pt.blockSI = !!value; break;
      case 'low_flux_block':
        /* THE OPERATOR'S REQUEST to block the 35 % low-flux trip (#507 wave 7 — the HZP
         * startup's own action). A REQUEST, not a state: P-10 gates whether it takes
         * effect and auto-revokes it below 8 % (pwr2_protection owns that law). */
        eng.pt.blockLowFlux = !!value; break;
      case 'scram':
        /* The pushbutton is an RPS INPUT, not a rod command — the trip latches in
         * pwr2_protection ('manual') and the trip edge below inserts the rods, so a manual
         * scram and an automatic one are the SAME mechanism. Routing it around the RPS was
         * measured (2026-08-19): scrammed stayed false, the turbine kept pulling 100 MWe from
         * a 2 % core, and the -240 F/min cooldown drained the pressurizer into a solver
         * discontinuity at 1724 psia (#499 thread). */
        eng._manualTrip = true; break;
      case 'makeup':         eng.cv.makeupSource = value; break;   /* 'borate'|'dilute'|'match' */
      case 'boron_rate':     eng.cv.boron_rate_cmd = +value || 0; break;  /* ppm/s, signed — the
                                                                           * blender clamp is the
                                                                           * physical ceiling */
      case 'boron_sample':   CV.requestBoronSample(eng.cv); break;
      /* THE RHR SUCTION VALVE (#507 wave 2). Open honored only under the sourced 425 psig
       * permissive (the shell refuses ABOVE it with a reason — this guard is the harness's
       * defense in depth, pwr1's own silent-refusal convention); close always honored. The
       * 585 psig autoclose lives in stepInner — it is the valve hardware acting, not a
       * command. */
      case 'rhr_align':
        if (!value) eng.rh.valve_open = false;
        /* the permissive reads the INSTRUMENT (#510 M-2, the P-11 idiom — HR1): the
         * interlock is a pressure-channel function in the real plant, so a lying channel
         * misdrives it; absent means truth, the house fallback */
        else if ((eng.ins.reading.primary_pressure !== undefined
                  ? eng.ins.reading.primary_pressure : eng.sys.P) * 145.038 - 14.7
                 < RD.rhr.RHR.permissive_open_psig) eng.rh.valve_open = true;
        break;
      case 'rhr_hx':         eng.rh.hx_fraction = Math.max(0, Math.min(1, +value)); break;
      case 'letdown':        eng.cv.letdownOpen = Math.max(0, Math.min(1, +value)); break;
      case 'pzr_setpoint_mpa':   eng.pzDrivers.setpoint_mpa = +value; break;
      case 'pzr_heaters_manual':
        eng.pzDrivers.heaters_manual = value === null ? undefined : +value;
        /* touching the heater control IS the operator's post-shed re-load (NUREG-0737's
         * manual re-loading, the old engine's set_heater convention — #507 wave 4) */
        eng.pz.shedLatch = false;
        break;
      case 'pzr_spray_manual':   eng.pzDrivers.spray_manual = value === null ? undefined : +value; break;
      case 'aux_spray':      eng.pzDrivers.aux_spray = +value; break;
      case 'porv_stick':     eng.pzDrivers.porv_stick = !!value; break;
      case 'block_valve':    eng.pzDrivers.block_valve = !!value; break;
      case 'dump_mode':      eng.dcDrivers.mode = value; break;    /* 'tavg'|'pressure'|'off' */
      case 'dump_pressure_setpoint_mpa': eng.dcDrivers.pressure_setpoint_mpa = +value; break;
      case 'adv_demand':     eng.advDemand = Math.max(0, Math.min(1, +value)); break;
      case 'adv_block':      eng.advBlock = !!value; break;
      case 'hhsi':           eng.ec.hhsiRunning = !!value; break;
      case 'lhsi':           eng.ec.lhsiRunning = !!value; break;
      /* Manual initiation is PER PUMP [sourced] — Ginna TS Bases B 3.3.2 (a): "one switch for
       * each pump". 'afw' is the motor-driven switch (kept under its old name — the shell's
       * set_afw/set_afw_flow route here); 'afw_tdafw' is the turbine-driven pump's own. */
      case 'afw':            eng.aw.mdafwRunning = !!value; break;
      case 'afw_tdafw':      eng.aw.tdafwRunning = !!value; break;
      /* THE FEED TRAIN (2026-08-21) */
      case 'feed_auto':      eng.fw.auto = !!value; break;
      /* the overfeed SEAT (#510 M-12) — the regulating valve failed open; see pwr2_feedwater */
      case 'feed_overfeed':  eng.fw.overfeed = !!value; break;
      case 'feed_manual_frac':
        /* taking manual control IS leaving auto — the old engine's set_feed_pump_speed
         * convention (it clears feed_auto_coupled); 0..1.2 of rated, the two-pump ceiling */
        eng.fw.auto = false;
        eng.fw.manual_frac = Math.max(0, Math.min(1.2, +value));
        break;
      case 'feed_pump_a':    eng.fw.pumpA = !!value; break;
      case 'feed_pump_b':    eng.fw.pumpB = !!value; break;
      case 'isolate_feedwater':
        /* operator isolation AND the operator's reset; the SI-driven latch re-asserts on
         * the next step if the sourced 32 s condition still stands */
        eng.fw.isolated = !!value;
        break;
      case 'cw_pumps':       eng.cwPumps = !!value; break;
      case 'pump_trip':      eng.sys.pumpTripped = true; break;
      /* THE RCP START (#507 wave 9) — the one-way trip is RETIRED: the rotor the coastdown
       * decelerates can be motored back up (pwr2_sources' start branch). Gated on the
       * NONVITAL bus [sourced, WTSM 3.2 ML11223A213: the RCP motors "cannot be supplied
       * from the emergency diesel generators"] and REFUSED out loud without it. Nothing
       * auto-restarts — a cleared LOOP hands back a stopped pump and THIS is the operator's
       * restart. Real start permissives (seal injection, oil lift, anti-reverse) are
       * declared unmodeled in pwr2_sources. */
      case 'rcp_start':
        if (!(eng.elec.offsite && !eng.elec.blackout)) {
          throw new Error('pwr2_engine: RCP start REFUSED — no offsite power on the ' +
            'nonvital bus (WTSM 3.2: the RCP motors cannot be supplied from the ' +
            'emergency diesel generators)');
        }
        eng.sys.pumpTripped = false;
        break;
      /* THE GRID (#507 wave 4). Losing offsite power kills the NONVITAL buses; the RCPs are
       * on them [sourced, WTSM 3.2 ML11223A213: the RCP motors "cannot be supplied from the
       * emergency diesel generators"] so the trip is immediate. Restoring the grid
       * re-energizes the buses and NEVER restarts a pump or touches a selector (the #200
       * demand-heals-itself guard) — since wave 9 the operator restarts with rcp_start. */
      case 'offsite_power':
        eng.elec.offsite = !!value;
        if (!value) eng.sys.pumpTripped = true;
        break;
      /* STATION BLACKOUT [sourced, WTSM 5.7.5 ML11223A229: "A station blackout fails all ac
       * power except the vital Class IE ac busses from the dc invertors. All decay heat
       * removal systems, except the turbine-driven AFW pump, also fail."]. A blackout IS a
       * LOOP the diesels did not answer, so true forces offsite false. CLEARING RESTORES
       * ONLY WHAT THE BLACKOUT TOOK (#510 M-13): the old unconditional offsite=true made a
       * LOOP injected BEFORE the blackout vanish from the engine while the kernel's failure
       * ledger still carried it — the Failures tab drew an active LOOP on a restored grid,
       * and the diesels-answer-grid-still-down state was unexpressible. Selectors and
       * latched demands stay put either way. Old saves carry no _offsiteWasLost and land
       * undefined — falsy, the restore-both shape those saves were made under. */
      case 'station_blackout':
        if (value) {
          eng.elec._offsiteWasLost = !eng.elec.offsite;
          eng.elec.blackout = true;
          eng.elec.offsite = false;
          eng.sys.pumpTripped = true;
        } else {
          eng.elec.blackout = false;
          eng.elec.offsite = !eng.elec._offsiteWasLost;
          eng.elec._offsiteWasLost = false;
        }
        break;
      case 'break_open':
        /* value: {area_m2, node} — one break at a time, the gates' own shape */
        eng.brk = BK.createBreak({ area_m2: value.area_m2, cd: 1.0,
                                   node: value.node || 'cold_leg', open: true });
        break;
      case 'break_close':    if (eng.brk) eng.brk.open = false; break;
      case 'instrument_fail':
        /* value: {id, mode, value?} — mode: stuck | low | high | noisy; value freezes a
         * STUCK channel at it (#507 wave 3). Throws on a misspelling, because a failure
         * that silently does nothing reads like a plant surviving it. */
        IN.fail(eng.ins, value.id, value.mode, value.value); break;
      case 'instrument_restore':
        /* value: a channel id, or null/true for ALL */
        IN.restore(eng.ins, typeof value === 'string' ? value : null); break;
      /* ---- the wave-6 failure levers (#507): each a persistent physical state, never a
       * rewritten demand (#200) ---- */
      case 'afw_block':
        /* the TMI-2 tagged-shut discharge valves — dead-heads BOTH AFW trains */
        eng.aw.blocked = !!value; break;
      case 'scram_block':
        /* ATWS: the trip LATCHES (annunciators, turbine trip, the record) — only the rod
         * drop is failed, which is what a failure-to-scram IS */
        eng.scramBlocked = !!value; break;
      case 'pzr_heaters_failed':
        eng.pzDrivers.heaters_failed = value ? true : undefined; break;
      case 'spray_stick':
        eng.pzDrivers.spray_stick = !!value; break;
      case 'rod_runaway':
        /* value: steps/s outward, 0/false clears. Scale note: the old engine's 24 fine
         * steps/s ceiling is a fraction-of-travel rate (24/912); this bank's 200 steps make
         * the same fraction 5.26 steps/s [adopted]. The caller (shell) does that scaling. */
        eng.runaway = value && +value > 0 ? { rate: +value } : null; break;
      case 'reset_protection':
        /* the operator's reset — clears the latches so a recovered plant can run again */
        eng.pt.reactor_trip = false; eng.pt.trip_cause = null;
        eng.pt.si = false; eng.pt.si_cause = null;
        eng.pt.afas_mdafw = false; eng.pt.afas_mdafw_cause = null;
        eng.pt.afas_tdafw = false; eng.pt.afas_tdafw_cause = null;
        eng.pt.fwi = false; eng.pt.fwi_cause = null;
        /* the FWI valve state stays isolated through the reset — clearing a latch is not
         * re-opening a valve; isolate_feedwater false is the operator's restore */
        /* the AFW pumps KEEP RUNNING through the reset — clearing a latch is not securing a
         * pump; the operator stops each one with its own switch afterward */
        eng._manualTrip = false;   /* releasing the pushbutton is part of the reset */
        /* RE-ARM THE TRIP EDGE (#507 wave 6, found by the ATWS probe): _lastTrip lags one
         * step, so a reset followed IMMEDIATELY by a new trip (or the pushbutton) landed
         * with the stale true and the edge never fired — latch on, annunciators on, rods
         * standing. Clearing the latch is re-arming its edge detector. */
        eng._lastTrip = false;
        break;
      default:
        throw new Error('pwr2_engine: unknown command "' + name + '" — one door, spelled right');
    }
  }

  /* ---- THE STEP ------------------------------------------------------------------------------ */
  /* step(eng, dt) — the outer door WRAPS the physics in the beyond-model catch: any layer's
   * "state has been lost" throw (the pwr2_damage sentinel, the property-envelope errors)
   * LATCHES beyond_model and HOLDS the last published state instead of propagating. Under
   * the shell a propagated throw crashes the whole app mid-tick; the held-plant contract
   * (#487/#499) is the simulator-grade behavior, and the guards inside pwr2_core remain the
   * first line — this catch is the floor under them, added when the A/B pass found a
   * sequence-dependent escape the single-ride repros could not reproduce. Errors that do NOT
   * carry the beyond-model signature re-throw: a programming error must stay loud. */
  function step(eng, dt) {
    if (eng._dead) {
      eng.simTime += dt;
      if (eng._lastTs) { eng._lastTs.sim_time_s = eng.simTime; return eng._lastTs; }
    }
    try {
      var out = stepInner(eng, dt);
      /* THE THIRD GUARD FAMILY — kinetics/thermal runaway. The inner guards (root-jump,
       * both-walls, floor) watch the THERMODYNAMIC state; measured 2026-08-20g, a trajectory
       * can run the KINETICS to 7.5e51 % power while every node enthalpy sits inside the
       * envelope, so no inner guard fires. This screen is that family's latch, not merely a
       * sanity floor — and it also keeps the held snapshot SANE (a state can be numerically
       * wild while technically finite; measured power 2.6e54 passing isFinite). */
      if (out.power_pct < 500 && out.fuel_temp_c < 5000 && out.pressure_mpa < 25 &&
          out.pressure_mpa >= 0) {
        eng._lastTs = out;
      } else {
        eng._dead = true;
        eng._deadWhy = 'screen: power ' + out.power_pct + ', fuel ' + out.fuel_temp_c +
                       ', P ' + out.pressure_mpa;
        if (eng.sys) eng.sys.beyond_model = true;
        if (eng._lastTs) { eng._lastTs.sim_time_s = eng.simTime; return eng._lastTs; }
      }
      return out;
    } catch (e) {
      if (/NON-FINITE|beyond|characterised|envelope/i.test(String(e && e.message))) {
        eng._dead = true;
        eng._deadWhy = 'throw: ' + String(e.message).slice(0, 90);
        if (eng.sys) eng.sys.beyond_model = true;
        eng.simTime += dt;
        if (eng._lastTs) { eng._lastTs.sim_time_s = eng.simTime; return eng._lastTs; }
      }
      throw e;
    }
  }

  function stepInner(eng, dt) {
    var sys = eng.sys;

    /* THE TWO BUSES (#507 wave 4), derived before any consumer — each motor load below asks
     * its own bus by name, the old engine's ac_available idiom. The board and instruments
     * ride the battery inverters and are never gated (WTSM 5.7.5), and the TDAFW pump is
     * steam-driven — the sourced SBO survivor, DO NOT gate it. */
    var acAvail = !eng.elec.blackout;                       /* vital (diesel-backed) buses */
    var offsiteOk = eng.elec.offsite && !eng.elec.blackout; /* nonvital buses */

    /* rods: slew toward target; a scram overrides the slew. TWO BANKS since #506.3 —
     * both insert on a trip, shutdown slightly faster (the pwr1 2.5/2.0 pair). */
    if (eng._scramT !== null) {
      eng._scramT += dt;
      /* MONOTONE-DOWN: min() with the current position, so a second trip edge restarting
       * the ramp can never move the rods OUT (200*(1-t/2) evaluated fresh from t=0 would
       * teleport a partially-withdrawn bank back toward 200). */
      eng.rodSteps = Math.max(0, Math.min(eng.rodSteps, 200 * (1 - eng._scramT / SCRAM_S)));
      eng.sdSteps = Math.max(0, Math.min(eng.sdSteps, 200 * (1 - eng._scramT / SD_SCRAM_S)));
      if (eng.rodSteps === 0 && eng.rodTarget === 0) eng._scramT = null;
    } else if (eng.runaway) {
      /* CONTINUOUS ROD WITHDRAWAL (#507 wave 6): the drive faults OUTWARD at the failure's
       * rate — target ignored, and the rod stop too (the stop inhibits the demand path; a
       * drive fault is downstream of it, DECLARED). A working scram still wins: the branch
       * above runs first, and gravity beats a drive. NOTE the shipped hot-full-power IC
       * parks the bank at 200/200 (boron-trimmed), so at that IC the failure has no travel
       * to take — it bites on any plant whose rods are inserted (load-follow, recovery). */
      eng.rodSteps = Math.min(200, eng.rodSteps + eng.runaway.rate * dt);
      eng.rodTarget = eng.rodSteps;   /* the latched demand follows the fault, so clearing
                                       * the failure HOLDS position rather than snapping back */
    } else if (eng.rodSteps !== eng.rodTarget) {
      var dS = ROD_SPEEDS[eng.rodSpeedSel] * dt;
      var move = Math.max(-dS, Math.min(dS, eng.rodTarget - eng.rodSteps));
      /* THE ROD STOP [sourced, ch7 §7.2.3.2.1]: within 3 % of a delta-T trip setpoint,
       * outward motion is refused — inward is always allowed (it HELPS). One step old. */
      if (eng._rodStopSig && move > 0) move = 0;
      eng.rodSteps += move;
    }
    /* the shutdown bank's manual drive — a real evolution (post-scram re-withdrawal is
     * operator work, nothing auto-re-withdraws; the #468 lesson). The rod stop guards the
     * CONTROL bank's approach to the delta-T trip; the shutdown bank's outward motion is a
     * deliberate shutdown-margin evolution and is not guarded here. */
    if (eng._scramT === null && eng.sdSteps !== eng.sdTarget) {
      var dSd = ROD_SPEEDS[eng.rodSpeedSel] * dt;
      eng.sdSteps += Math.max(-dSd, Math.min(dSd, eng.sdTarget - eng.sdSteps));
    }
    eng.rodBank[0].steps = eng.rodSteps;
    eng.rodBank[1].steps = eng.sdSteps;

    var tavg = G.primaryTavg(sys);
    /* tavg_rate_c_per_hr (stage B1): filtered derivative, tau 60 s [open] — a heatup/cooldown
     * rate gauge, not physics */
    if (eng._tavgPrev === undefined) { eng._tavgPrev = tavg; eng._tavgRate = 0; }
    var rawRate = (tavg - eng._tavgPrev) / dt * 3600;
    eng._tavgPrev = tavg;
    eng._tavgRate += (dt / 60) * (rawRate - eng._tavgRate);
    /* THE TURBINE RUNBACK [sourced, ch7 §7.2.2.4.1]: "200%/min for 1.5 sec every 30 sec"
     * while the delta-T approach signal stands (one step old), "until [delta]T < [delta]T
     * (rod stop)" — i.e. the cycle repeats only while the signal persists, and the timer
     * resets when it clears. 200 %/min of rated = 3.333 MWe/s on this plant; one 1.5 s
     * nibble is 5 MWe. A tripped turbine has nothing to run back. */
    if (eng._runbackSig && !eng.tb.tripped) {
      eng._rbT += dt;
      if (eng._rbT >= 30.0) eng._rbT -= 30.0;
      if (eng._rbT < 1.5) {
        eng.tb.load_target_mwe = Math.max(0,
          eng.tb.load_target_mwe - (2.0 * MWE_RATED / 60) * dt);
        eng._rbActive = true;
      } else eng._rbActive = false;
    } else { eng._rbT = 0; eng._rbActive = false; }

    var steam = TB.steamDemand(eng.tb, eng.sg.P, G.SG.h_feed);

    var cr = CD.stepCondenser(eng.cd, dt, {
      duty_kW: steam * (W.h_g(eng.sg.P) - G.SG.h_feed) * (1 - TB.etaCycle()),
      /* CW pumps are NONVITAL loads (#507 wave 4) — the selector stays where the operator
       * put it; the bus takes the power (the #200 split, delivered vs demanded) */
      cw_pumps_running: eng.cwPumps && offsiteOk
    });
    eng._cdAvail = cr.available;
    /* TURBINE TRIP ON CONDENSER LOSS (#510 M-6) [sourced, Ginna UFSAR ch.10 §10.1.3.1 —
     * the turbine trips on "Loss of both circulating water pumps" and "Low condenser
     * vacuum"]. Level, not edge, the same shape as the sourced main-feed trip below; P-9
     * then decides whether the reactor follows (its own sourced clause). Availability IS
     * the vacuum at this fidelity: pwr2_condenser computes it from the saturation state,
     * and before this wire a plant at zero vacuum made 100.0000 MWe while the board lit
     * COND VAC TRIP. */
    if (!cr.available && !eng.tb.tripped) eng.tb.tripped = true;
    var dcr = DC.stepDumpCtl(eng.dc, dt, Object.assign({
      /* HR1 (2026-08-20): the dump controller's Tavg and steam pressure are INSTRUMENT
       * channels (one step old); the state signals stay direct. */
      tavg_c: eng.ins.reading.tavg !== undefined ? eng.ins.reading.tavg : tavg,
      load_frac: eng.tb.tripped ? 0 : eng.tb.load_target_mwe / MWE_RATED,
      turbine_tripped: eng.tb.tripped,
      condenser_available: cr.available,
      steam_pressure_mpa: eng.ins.reading.steam_pressure !== undefined
                          ? eng.ins.reading.steam_pressure : eng.sg.P
    }, eng.dcDrivers));
    var rr = RL.stepRelief(eng.rl, eng.sg.P, dt, {
      rated_steam_kgs: eng.rated_steam,
      dump_demand: dcr.dump_demand,
      condenser_available: cr.available,
      adv_demand: eng.advDemand,
      adv_block: eng.advBlock
    });
    var out = steam + rr.total_kgs;
    /* THE FEED TRAIN (2026-08-21) — feed ≡ steam is RETIRED. Main feed is the module's
     * delivered fraction of rated; the three-element controller reads the INDICATED
     * channels (HR1, the §55 split — one step old, the house convention), and the SG's
     * mass ledger is finally driven by a real imbalance. The A/B row this wins back is
     * R6 (PWR2_VALIDATION.md §60). */
    var rdF = eng.ins.reading;
    var fwr = FWM.stepFeedwater(eng.fw, dt, {
      sg_level_pct: rdF.sg_level,
      steam_flow_frac: rdF.steam_flow !== undefined ? rdF.steam_flow : out / eng.rated_steam,
      fw_flow_frac: rdF.fw_flow !== undefined ? rdF.fw_flow : eng.fw.feed_frac,
      si_active: eng.pt.si,
      /* main feed pumps are NONVITAL loads (#507 wave 4) — capacity dies with the grid,
       * the pump selectors stay where the operator left them */
      power_ok: offsiteOk
    });
    /* [sourced ch10]: "If both main feedwater pumps fail, the turbine will be tripped" —
     * level, not edge, same as the reactor-trip→turbine wiring; P-9 then decides whether
     * the reactor trips, which is the source's own ">50% of full power" clause. */
    if (fwr.main_feed_lost) eng.tb.tripped = true;
    /* AFW steps BEFORE the SG so its delivery lands in this step's balance — it is the SG's
     * second, COLD feed stream (stepAFW reads only its own state, so the hoist is free).
     * AFW is additive on top of main feed — the "merge, do not displace" rule the module's
     * own header requires of its caller. */
    /* the MDAFW pump is a VITAL load — it lives through a plain LOOP (diesels) and dies in
     * a blackout; the TDAFW pump is steam-driven and NEVER gated (WTSM 5.7.5) */
    var awr = AW.stepAFW(eng.aw, dt, { mdafw_power_ok: acAvail });
    var sr = G.stepSG(eng.sg, tavg, dt, { feed: fwr.feed_frac * eng.rated_steam, steam: out,
                                          afw_kgs: awr.total_kgs, afw_h: awr.h_kJkg,
                                          /* the SGTR stream, one step old (#507 wave 5):
                                           * stepBreak runs AFTER stepSG, so the discharge
                                           * lands next cycle — a 0.02 s transport lag, the
                                           * house instrument-lag convention, ~1 kg standing
                                           * inventory at full-rupture flow. DECLARED. */
                                          tube_leak_kgs: eng._sgtrKgs || 0,
                                          tube_leak_h: eng._sgtrH || 0 });
    /* A starving SG delivers less than the demand (#510 H-1): the turbine gets its prorated
     * share of what the vessel actually exported. The relief/dump share is NOT re-prorated
     * (their modules already stepped on demand this cycle) — a starving SG rides a tripped
     * turbine within seconds, so the one-step overstatement is report-side only, DECLARED.
     * The condenser duty at the stepCondenser call keeps the demand figure for the same
     * reason. */
    var steamShare = out > 0 ? sr.steam_delivered_kgs * (steam / out) : 0;
    var tr = TB.stepTurbine(eng.tb, dt, { steam_kgs: steamShare, P_mpa: sr.P_sec,
                                          h_feed: G.SG.h_feed });

    /* charging and the SI pumps are VITAL loads — diesel-carried through a LOOP, dead in a
     * blackout (WTSM 5.7.5's "all decay heat removal systems ... also fail"); the avail
     * fractions inside each module stay FAILURE seats, a different question than power */
    /* rhr_letdown_ok (#510 H-2): the RHR-to-CVCS cross-connect — low-pressure letdown is
     * available while the RHR pumps take suction (valve open AND powered since #510 H-5 —
     * rh.running, one step old: stepRHR and its autoclose run below), the house lag
     * convention. si_kgs/si_ppm (#510 M-1): safety injection is RWST water and the RWST is
     * BORATED — the flow is last step's (the ECCS steps after the CVCS), the house lag
     * convention again. */
    var cvr = CV.stepCVCS(eng.cv, sys, dt, { ac_available: acAvail, rhr_letdown_ok: eng.rh.running === true, si_kgs: eng._eccsKgs, si_ppm: EC.ECCS.rwst_boron_ppm });
    var ecr = EC.stepECCS(eng.ec, sys, dt, { ac_available: acAvail });
    eng._eccsKgs = ecr.total_kgs || 0;

    /* THE SGTR IS A BREAK WHOSE DESTINATION IS THE SG (#507 wave 5) — inferred from the
     * node: a break AT sg_primary is a ruptured tube, and a tube discharges into the
     * SECONDARY, not containment (Ginna UFSAR ch15 §15.6.3 — the containment-bypass fact
     * is the accident's diagnosis lesson). Its backpressure is the SG's own steam pressure
     * (same step — stepSG ran above), so the sourced EOP falls out of the ΔP: "reduce
     * reactor coolant system pressure to equilibrate with the ruptured steam generator
     * secondary side pressure to minimize the coolant discharge" (§15.6.3). Every other
     * break keeps the containment backpressure default. */
    var toSG = !!(eng.brk && eng.brk.node === 'sg_primary');
    var br = eng.brk ? BK.stepBreak(eng.brk, sys, dt,
                                    toSG ? { backpressure_mpa: sr.P_sec } : {}) : null;
    eng._sgtrKgs = toSG && br ? br.mdot_kgs : 0;
    eng._sgtrH = toSG && br && br.mdot_kgs > 0 ? br.source.h : 0;

    var rrx = R.stepReactor(eng.rx, sys, dt,
      { boron_ppm: cvr.boron_ppm, rodGroups: eng.rodBank, Q_ox_kW: eng._Qox });
    var dr = DG.stepDamage(eng.dm, dt, { cladTemp_c: rrx.T_clad_c, fuelTemp_c: rrx.T_fuel_c });
    eng._Qox = dr.Q_ox_kW;

    /* THE RHR, BEFORE THE PLANT STEP AND WIRED IN (#507 wave 2). It used to run after
     * stepPlant with its `heats` map consumed only by true_state — an aligned system would
     * have removed exactly zero heat, the Q4 orphan the #458 ruling names. The 585 psig
     * autoclose is enforced here (valve hardware, not a command); duty is 0 at power by the
     * permissive holding the valve shut, so this reorder is a no-op on an at-power plant —
     * asserted by gate, not assumed. Decay heat is passed REPORT-ONLY (the module's own
     * double-count guard). */
    /* the autoclosure interlock reads the INSTRUMENT too (#510 M-2 — it is a pressure-channel
     * function, same as the open permissive; absent means truth) */
    if (eng.rh.valve_open &&
        (eng.ins.reading.primary_pressure !== undefined
         ? eng.ins.reading.primary_pressure : sys.P) * 145.038 - 14.7
        >= RD.rhr.RHR.permissive_close_psig) eng.rh.valve_open = false;
    var rhrR = RH.stepRHR(eng.rh, sys, dt,
      { decayHeat_kW: rrx.decay_pct !== undefined ? rrx.decay_pct / 100 * RATED_KW : undefined,
        /* the RHR pumps are VITAL loads (#510 H-5) — diesel-carried through a LOOP, dead in
         * a blackout, same wire as charging/SI */
        ac_available: acAvail });
    /* RHR forced circulation (#510 H-2, see the constant's note): the pumps circulate the
     * coolant whenever they take suction — a floor on loop flow, so a Mode 4 plant with the
     * RCPs secured still mixes its legs instead of chilling a stagnant node on the CVCS
     * return. Inactive whenever the RCPs (or natural circulation) already flow more, and
     * NOT while SI runs — shutdown cooling and low-head injection are the SAME pumps (the
     * #458 ruling), so with SI actuated they are injecting, not circulating the loop — and
     * NOT unpowered (#510 H-5: rh.running carries the vital-bus gate). */
    if (eng.rh.running && !eng.pt.si && sys.mdot_loop < RD.rhr.RHR.circulation_kgs) {
      sys.mdot_loop = RD.rhr.RHR.circulation_kgs;
    }

    var srcs = (cvr.sources || []).slice();
    if (ecr.sources) srcs = srcs.concat(ecr.sources);
    if (br) srcs.push(br.source);
    if (eng._pzRelief > 0) {
      srcs.push({ node: 'hot_leg', mdot: -eng._pzRelief, h: eng._pzReliefH });
    }
    var heats = rrx.heats;
    if (rhrR.duty_kW > 0) {
      heats = Object.assign({}, rrx.heats);
      Object.keys(rhrR.heats).forEach(function (n) { heats[n] = (heats[n] || 0) + rhrR.heats[n]; });
    }
    /* the pressurizer's outsurge enthalpy difference lands on the hot leg (one step old, the
     * house lag convention) — energy conservation across the surge line (#510 batch 1) */
    if (eng._pzSurgeHeat > 0) {
      if (heats === rrx.heats) heats = Object.assign({}, rrx.heats);
      heats.hot_leg = (heats.hot_leg || 0) + eng._pzSurgeHeat;
    }
    var pr = S.stepPlant(sys, dt, { heats: heats, sgDuty: sr.duty_kW, sources: srcs });

    var pzr = PZ.stepPressurizer(eng.pz, sys, dt, Object.assign({
      /* HR1 (2026-08-20): the heater/spray/PORV ladder, the level PI and the 17 % low-level
       * cut read the INSTRUMENTS (one step old); the code safeties inside the module read
       * true P regardless — the module's own split note has the why. The level PROGRAM's
       * Tavg is the instrument channel too, same reason. */
      tavg_c: eng.ins.reading.tavg !== undefined ? eng.ins.reading.tavg : tavg,
      indicated_pressure_mpa: eng.ins.reading.primary_pressure,
      indicated_level_pct: eng.ins.reading.pzr_level,
      si_active: eng.pt.si,
      /* the heater banks are VITAL loads with their own NUREG-0737 shed — the module has
       * consumed ac_available since it was built; the facade finally supplies it (#507
       * wave 4: it was documented, read, and never passed — a wire that was dark).
       * offsite_ok arms the module's shed LATCH on a plain LOOP. */
      ac_available: acAvail,
      offsite_ok: offsiteOk
    }, eng.pzDrivers));
    eng._pzRelief = pzr.relief_kgs;
    eng._pzReliefH = pzr.relief_h;
    eng._pzSurgeHeat = pzr.surge_heat_kW || 0;
    /* the level controller drives charging unless the operator took it */
    if (eng.cv.chargingDemand === null || eng._plcsAuto !== false) {
      eng.cv.chargingDemand = pzr.charging_demand;
    }
    if (pzr.letdown_isolated) eng.cv.letdownOpen = 0;

    /* HR1: THE RPS READS THE INSTRUMENTS, NOT THE PLANT. Every analog driver below comes
     * from ins.reading — one step old (the instruments step at the END of each step, on that
     * step's true_state), which is the house lag convention. The one exception is the very
     * FIRST step, before any reading exists: truth fills in for 0.02 s so stepProtection's
     * REQUIRED-driver validation does not throw on a plant that has not energized its
     * channels yet. turbine_tripped / manual_trip / steam_dumps_available stay direct — they
     * are state signals (breaker positions, pushbuttons), not analog channels. */
    var rd = eng.ins.reading;
    var ptr = PT.stepProtection(eng.pt, dt, {
      pressure_mpa: rd.primary_pressure !== undefined ? rd.primary_pressure : sys.P,
      power_frac: (rd.power_range !== undefined ? rd.power_range : rrx.power_pct) / 100,
      flow_frac: (rd.loop_flow !== undefined ? rd.loop_flow : 100 * sys.mdot_loop / 1630) / 100,
      steam_pressure_mpa: rd.steam_pressure !== undefined ? rd.steam_pressure : sr.P_sec,
      steam_flow_frac: rd.steam_flow !== undefined ? rd.steam_flow : out / eng.rated_steam,
      /* no truth-fill here on purpose: sg_level_frac is an OPTIONAL driver (the hi_pzr_level
       * precedent), so on the pre-reading first step the lo-lo row reports available:false
       * for 0.02 s instead of borrowing truth */
      sg_level_frac: rd.sg_level !== undefined ? rd.sg_level / 100 : undefined,
      pzr_level_frac: (rd.pzr_level !== undefined ? rd.pzr_level : 100 * pzr.level_frac) / 100,
      manual_trip: eng._manualTrip,
      /* P-9's inputs [sourced, TS Bases B 3.3.1]: the turbine's own tripped flag, and dump
       * availability = the condenser's (the dumps are condenser dumps; C-9 is the same fact
       * on the control side). One-step lag on cr, the house convention. */
      turbine_tripped: eng.tb.tripped,
      steam_dumps_available: eng._cdAvail !== false,
      /* [sourced ch10] the loss-of-both-feed-pumps MDAFW start's input — a STATE signal
       * (breaker positions), the turbine_tripped convention, not an analog channel */
      main_feed_lost: fwr.main_feed_lost,
      /* [sourced ch10] the loss-of-offsite-power AFW start's input — the same state-signal
       * class (#507 wave 4; the deferred start pwr2_protection.js recorded is now built) */
      loss_of_offsite: !offsiteOk,
      /* the delta-T pair's inputs: loop delta-T normalized to full-power delta-T, and Tavg.
       * DT0_C is [derived]: the plant's own measured full-power split at the design point
       * (606/550 degF, PWR2_VALIDATION.md sec 43) — 31.1 degC. Protection converts to the
       * source's units itself. */
      delta_t_frac: rd.thot !== undefined ? (rd.thot - rd.tcold) / DT0_C
                    : (tLeg(sys, 'hot_leg') - tLeg(sys, 'cold_leg')) / DT0_C,
      tavg_c: rd.tavg !== undefined ? rd.tavg : G.primaryTavg(sys)
    });
    eng.rpsReport = ptr;      /* the full function report, for consumers (the page, the gate) */
    eng._rodStopSig = ptr.rod_stop; eng._runbackSig = ptr.runback;
    /* THE CALLER'S HALF of HR5: the RPS reports, the plant acts. scramBlocked (#507 wave 6)
     * is the ATWS: the latch above STANDS — annunciators, the turbine trip and the record
     * all fire — and only the rod drop is failed, because that is what a failure-to-scram
     * IS. A runaway is also released here: gravity beats a drive. */
    if (ptr.reactor_trip && !eng._lastTrip && !eng.scramBlocked) {
      eng.rodTarget = 0; eng._scramT = 0; eng.runaway = null;
    }
    /* the shutdown bank drops on the same edge (kept as its OWN line — the line above is a
     * run_pwr2_engine mutation anchor; its text moved WITH the wave-6 gate in one commit) */
    if (ptr.reactor_trip && !eng._lastTrip && !eng.scramBlocked) eng.sdTarget = 0;
    eng._lastTrip = ptr.reactor_trip;
    /* The turbine trips WITH the reactor [sourced] — Ginna UFSAR ch15 (ML20339A101): "The
     * turbine automatically trips following a reactor trip. Zero delay is assumed". Level,
     * not edge: while the trip is latched the operator cannot re-latch the turbine. */
    if (ptr.reactor_trip) eng.tb.tripped = true;
    if (ptr.si) { eng.ec.hhsiRunning = true; eng.ec.lhsiRunning = true; }
    /* The AFW starts, same caller's-half law: level-held while the latch stands, so the
     * operator cannot secure an actuated pump until reset_protection clears the latch —
     * after which the per-pump switches work again (the demand itself is never rewritten,
     * which is the demand-heals-itself trap's guard). */
    if (ptr.afas_mdafw) eng.aw.mdafwRunning = true;
    if (ptr.afas_tdafw) eng.aw.tdafwRunning = true;
    /* Hi-hi level feedwater isolation, same caller's-half law [sourced — protection's SGLL
     * block]: close the regulating valve AND trip the turbine ("to protect the turbine
     * against excessive moisture carryover", WTSM 3.2). Level-held while latched. */
    if (ptr.fwi) { eng.fw.isolated = true; eng.tb.tripped = true; }

    /* containment receives the break AND the pressurizer relief (PORV/safety discharge ends
     * up there via the relief tank; the tank itself is unmodelled, declared). An SGTR is
     * EXCLUDED — the tube discharges into the SG, a closed receiver, and containment seeing
     * nothing is the accident's containment-bypass signature (#507 wave 5). */
    var ctIn = (br && !toSG ? br.mdot_kgs : 0) + (eng._pzRelief > 0 ? eng._pzRelief : 0);
    var ctH = br && !toSG && br.mdot_kgs > 0 ? br.source.h : eng._pzReliefH;
    var ctr = CT.stepContainment(eng.ctm, dt,
      ctIn > 0 ? { mdot_kgs: ctIn, h_kJkg: ctH } : { mdot_kgs: 0 });

    eng.simTime += dt;
    eng._pzr = pzr; eng._dcr = dcr;

    /* rhrR computed BEFORE stepPlant (#507 wave 2) so its heat actually leaves the loop */
    var ts = TS.buildTrueState({
      sys: sys, reactor: rrx, sg: sr, turbine: tr, relief: rr, cvcs: cvr,
      rhr: rhrR, break_: br || {}, containment: ctr, condenser: cr,
      eccs: ecr, afw: awr, damage: dr, protection: ptr, pressurizer: pzr,
      feedwater: fwr,
      boron_ppm: cvr.boron_ppm, rated_steam_kgs: eng.rated_steam,
      mdot_rated: 1630, natcirc_frac: 0.15, M_nominal: eng.M_nominal,
      /* stage B1 ctx: contract-completion inputs */
      load_target_mwe: eng.tb.load_target_mwe,
      turbine_tripped: eng.tb.tripped,
      condenser_available: eng._cdAvail === true,
      pump_running: !eng.sys.pumpTripped,
      tavg_rate_c_per_hr: eng._tavgRate,
      /* the electrical truth — LIVE fields since #507 wave 4 (the registered static retired) */
      ac_available: acAvail,
      station_blackout: eng.elec.blackout
    });
    /* the rod insertion limit, recomputed every step off the plant's own power (#507 §B) —
     * null below its 5 % applicability floor, consumed by the shell's control-state and
     * instrument surfaces (the ROD LIMIT LO/LO-LO annunciators), never by an actuator.
     * NULL ON A SCRAM TOO (#510 LOW): the limit governs WITHDRAWN operation — during every
     * trip's decay seconds the rods drive to 0 while power is still above the 5 % floor,
     * and both annunciators fired on every scram as if a tripped reactor were violating
     * its insertion limit. */
    var ril = ts.scrammed === true ? null : insertionLimitSteps(ts.power_pct);
    eng._rilSteps = ril;
    eng._rodAtLimit = ril !== null && eng.rodSteps <= ril;
    eng._rodLimitMargin = ril === null ? 200 : Math.max(0, Math.round(eng.rodSteps - ril));
    /* facade extras a page needs and the contract does not carry */
    ts.sim_time_s = eng.simTime;
    ts.rod_steps = eng.rodSteps;
    ts.dump_controller = dcr.controller;
    ts.rod_stop = !!eng._rodStopSig;
    ts.runback_active = !!eng._rbActive;
    ts.runback_signal = !!eng._runbackSig;
    ts.dump_armed = dcr.armed;
    ts.dump_c7 = dcr.c7;
    ts.tref_c = dcr.tref_c;
    ts.adv_flow_kgs = rr.adv_kgs;
    ts.sg_safety_kgs = rr.safety_kgs;
    ts.pzr_surge_kgs = pzr.surge_kgs;
    ts.pzr_heater_kw = pzr.heater_kW;
    ts.oxidation_frac = dr.oxidation_frac;
    /* the instruments read THIS step's truth; every consumer sees them NEXT step.
     * The sg_level SHIFT is the downcomer shrink/swell — swell_factor × smoothed dPower/dt,
     * [adopted tune] the current engine's pwr_instruments term (0.8, 2.0 s smoother)
     * verbatim, which the A/B pre-registration A9 requires reproducing as an INSTRUMENT
     * effect (true_state stays the mass ledger; D3 §3's lumped-SG ruling stands). */
    if (dt > 0) {
      var rawRate = eng._prevPower === undefined ? 0 : (ts.power_pct - eng._prevPower) / dt;
      eng._pwrRate = (eng._pwrRate || 0) + (dt / (2.0 + dt)) * (rawRate - (eng._pwrRate || 0));
    }
    eng._prevPower = ts.power_pct;
    IN.stepInstruments(eng.ins, dt, ts, { shift: { sg_level: 0.8 * (eng._pwrRate || 0) } });
    return ts;
  }

  root.RD.pwr2.engine = {
    createEngine: createEngine,
    command: command,
    step: step,
    designHmap: designHmap,   /* exported so the equivalence fixture boots the SAME plant */
    ICS: ICS,                 /* the initial-condition registry — the shell/UI menu reads it */
    RIL: RIL, insertionLimitSteps: insertionLimitSteps,
    MWE_RATED: MWE_RATED
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
