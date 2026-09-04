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

  /* the design point is ONE object, owned by pwr2_sources (its DESIGN — #509 item 3): the
   * pump's rated-density reference and these normalizations must be the same numbers, and
   * a second typed copy is the PROTECTION_DT trap class */
  var TREF = S.DESIGN.tavg_c, P0 = S.DESIGN.P_mpa, RATED_KW = 300000, MWE_RATED = 100;
  /* #514: per-step temperature through the table (pwr2_core's idiom) */
  var VT = RD.vtable;
  var TFH = VT ? VT.T_from_h : W.T_from_h;
  function tLeg(sys, id) {
    for (var i = 0; i < sys.nodes.length; i++) {
      if (sys.nodes[i].id === id) return TFH(sys.nodes[i].h, sys.P);
    }
    return NaN;
  }
  var DT0_C = S.DESIGN.dt_c;     /* full-power loop delta-T, [derived] — the settled design
                                  * point's own split (606 - 550 degF = 56 degF = 31.1 degC),
                                  * the delta-T pair's normalization */
  /* Manual rod motion by the operator's S/M/F selection (#506.4). The SPEEDS are the sourced
   * quantity (WTSM 8.1: 8-72 steps/min, normal 48 — the same class range pwr1's slow/normal/
   * fast descend from); these values are [derived] — pwr1's three rates mapped by fraction-of-
   * travel-per-second onto this plant's 200-step bank (0.0585 / 0.351 / 0.526 %/s). The old
   * single ROD_SLEW_SPS = 1.0 was ~pwr1's FAST, always. */
  var ROD_SPEEDS = { slow: 0.117, normal: 0.702, fast: 1.053 };   /* steps/s */
  /* THE BANK SCALE, read LIVE from the one place it is defined (#602 phase 1). A function, not
   * a captured local: `RODS` is the object a retune edits, and a consumer that snapshotted the
   * value at module load would keep answering with the old scale. */
  function BANK() { return RD.kinetics.RODS.max_steps; }
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
    return Math.round((RIL.lo_pct + (RIL.hi_pct - RIL.lo_pct) * f) / 100 * BANK());
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
    /* TEN nodes since #583 — there is no `pressurizer` key because there is no pressurizer
     * NODE; the vessel is Layer 5's and seeds itself in createPressurizer. */
    return { downcomer: hC, lower_plenum: hC, core: hH, upper_plenum: hH, hot_leg: hH,
             sg_primary: hC, crossover: hC, rcp: hC, cold_leg: hC,
             vessel_heads: hA };
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
   *     startup. Fission power seeds at THE SOURCE EQUILIBRIUM for the margin the trim
   *     actually landed — S·Lambda/(-rho), 1.93e-9 at hot zero power (#536); it used to
   *     seed the retired engine's 1e-6 literal, back when this plant had no source. Decay
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
    /* THE BEGINNING OF ASCENSION *(OWNER, 2026-09-04, #619 item 28 / #624: "50% power was an
     * arbitrary choice. Why don't we start at the beginning of ascension instead.")*.
     *
     * `pwr_raise_power` used to declare `from: '50_percent'`, and every at-power IC boots the
     * control bank FULLY OUT (see `ctrlSteps` below). So the leg began on the top stop and all
     * five of its "Withdraw N steps" instructions were NO-OPS — measured by injection, because
     * a source read cannot see it: wiring the withdrawals in as real rod_nudge commands left the
     * replay BYTE-IDENTICAL at power_pct 100.55, since rod_nudge adds to rod_target and the
     * target clamps at BANK(). No acceptance read the bank, so the replay certified an ascension
     * whose rods cannot move — while a player, arriving through the startup chain with the bank
     * at 227, was operating a different plant.
     *
     * These numbers are what `pwr_startup` actually hands over, measured through the same
     * harness: power 10.54 %, 10.0 MWe, control bank 227 of 627, boron 718.8 ppm, turbine
     * latched and on the grid. That start leaves 400 steps of travel for the leg to use.
     *
     * NOT IN THE FREE-PLAY PICKER, deliberately, like hot_shutdown (ui/app.js): it is the seam
     * between two checklists, not a state a player picks. Nothing enumerates ICS except the
     * unknown-name error message below, so adding an entry costs no gate. */
    low_power:      { pf: 0.105, load_mwe: 10, ctrl_steps: 227 },
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
                      tavg_c: 121.1, P_mpa: 2.51, pzr_level: 0.25 },
    /* MODE 5, COLD SHUTDOWN (#524, 2026-08-31) — representable since Layer 0's floor moved
     * 0.1 -> 0.002 MPa: the SG secondary lands at P_sat(50 degC) ~ 0.0124 MPa (1.8 psia), a
     * state the old floor pinned at 211 degF. 122 degF / 363 psia is the retired preset's
     * own point and what the manuals' cooldown procedures already print; construction is the
     * wave-10 Mode 4 lineup one step colder — RHR aligned HX-shut (the hold), RCPs SECURED,
     * heaters AUTO about the boot setpoint, dumps OFF, P-11 blocks taken, accumulators
     * isolated, and the #468 order pays the shutdown bank's worth in RODS, not boron. */
    cold_shutdown:  { pf: 0, load_mwe: 0, subcritical: true, cold: true,
                      tavg_c: 50.0, P_mpa: 2.5, pzr_level: 0.25 }
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
    /* `opts.dryWalls` builds the PRE-#574 plant — no metal anywhere — and exists so the metal
     * walls can be A/B'd against their own absence on the real engine. It is a TEST SEAM and is
     * declared as one: nothing in the shipped stack passes it, and zeroing the masses instead is
     * not a substitute (measured 2026-08-28: M -> 1e-9 divides the lump temperature by ~nothing,
     * the wall goes non-finite, and the "dry" plant then sits at a frozen Tavg through a scram —
     * an A/B that looked like a result and was an arithmetic failure). */
    var sys = S.createPlant(ic.cold
      ? { h: hmap, P: icP, extraMass: PZ.extraMassFn(pz), omega: 0, pumpTripped: true, mdot: 0,
          dryWalls: opts.dryWalls }
      : { h: hmap, P: icP, extraMass: PZ.extraMassFn(pz), dryWalls: opts.dryWalls });
    /* completeness is structural: a node the map misses falls back to Layer 3's 1250 kJ/kg
     * silently — refuse to build a plant with a mis-seeded node instead */
    sys.nodes.forEach(function (n) {
      if (hmap[n.id] === undefined) throw new Error('pwr2_engine: designHmap has no entry for node "' + n.id + '"');
    });
    /* fission seeds at the IC's power (kinetics/xenon/decay at that power's own equilibrium
     * — the createKinetics convention). A SUBCRITICAL IC gets a PROVISIONAL seed here and is
     * re-seeded at its own source equilibrium below, once the boron trim and the rod lineup are
     * settled and the reactivity is known — see the block after `if (ic.cold)`. The kinetics
     * REFERENCES stay at their defaults — see the detonation note above. */
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
    /* HZP: control bank IN, the startup is pulling it; shutdown bank OUT (WTSM 8.1.1).
     *
     * `ic.ctrl_steps` places the bank EXPLICITLY, and it is new (#624). Without it an at-power
     * IC could only ever be built on its top stop, which is both what hid the ascension defect
     * (see the low_power note in ICS) and not what a real plant looks like — Ginna UFSAR
     * §15.4.5.1.1 (ML20339A101): "the reactor is operated with the RCCAs inserted only far
     * enough to permit load follow." Boron is trimmed AT this bank position by the criticalBoron
     * call below, so the pair stays self-consistent if either number moves. */
    var ctrlSteps = ic.subcritical ? 0
                  : (ic.ctrl_steps != null ? Math.min(ic.ctrl_steps, BANK()) : BANK());
    var rodBank = [
      { steps: ctrlSteps, max_steps: BANK(), worth: RD.kinetics.RODS.worth_control },
      { steps: BANK(), max_steps: BANK(), worth: RD.kinetics.RODS.worth_shutdown }
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
    /* ---- THE SUBCRITICAL SEED IS THE SOURCE EQUILIBRIUM, NOT A LITERAL (#536) --------------
     * `powf` above is 1e-6 — the RETIRED engine's source level, carried over with a comment
     * that said point kinetics had no source term. It has one now, and a subcritical core does
     * not sit wherever it was placed: it settles at P = S·Lambda/(-rho) (WTSM 2.1 §2.1.10,
     * N = S/(1-Keff)). Seeding the literal would open free play with a five-minute ring down
     * three decades — the exact symptom #536 is about, just transient — so the state is BUILT
     * at its equilibrium instead, which is the ICS header's own settled-construction rule (#502).
     *
     * IT HAS TO RUN HERE and not beside `powf`, because the equilibrium depends on the plant's
     * OWN reactivity, and that is not known until the boron trim (which reads `rx.kin`) and the
     * #468 bank order above have both settled. Measured at the two subcritical initial
     * conditions: hot zero power -1137.2 pcm -> 1.93e-9 (502 cps), Mode 4 hot shutdown
     * -5634.9 pcm -> 3.90e-10 (101 cps). The rebuild also re-seeds the precursors, xenon and the
     * decay-heat ladder at that power, which is why it is a construction rather than an
     * assignment — a hand-set kin.P with the OLD precursor inventory jumps on the first step. */
    if (ic.subcritical) {
      var hCore0;
      for (var hn = 0; hn < sys.nodes.length; hn++) {
        if (sys.nodes[hn].id === 'core') { hCore0 = sys.nodes[hn].h; break; }
      }
      var rho0 = RD.kinetics.reactivity(rx.kin, tavg0, rx.fuel.T_fuel_c, boron0, rodBank,
                                        icP, hCore0);
      var pEq = RD.kinetics.sourceLevel(rho0);
      /* NaN means the trim landed at or above critical, which a subcritical IC by definition is
       * not — refuse rather than ship a plant seeded from a non-number (the designHmap rule two
       * blocks up: a mis-seeded state is worse than a build that stops). */
      if (!(pEq > 0)) {
        throw new Error('pwr2_engine: subcritical IC "' + icName + '" trimmed to rho = ' +
                        (rho0 * 1e5).toFixed(1) + ' pcm, which has no source equilibrium');
      }
      rx = R.createReactor({ P: pEq, coolTemp_c: tavg0 });
    }
    /* the secondary lands where the primary's duty puts it: Tsec = Tavg − pf·(the design
     * split), P = Psat(Tsec). The full-power path keeps the module's own default literal
     * (byte-identical construction, the save-replay bar). */
    var sgDesign = G.createSG({});            /* the DESIGN point: 825 psia, Ginna outlet class */
    var sg = ic.pf === 1 ? sgDesign
           : G.createSG({ P: W.P_sat(tavg0 - ic.pf * (TREF - W.T_sat(sgDesign.P))) });
    /* rated_steam is the RATED scale — every secondary normalization's denominator (main feed
     * is feed_frac × it, the dumps are 0.28 × it, the code safeties 0.84 × it, and the AFW
     * fraction divides by it). It is FROZEN ON BOTH AXES steamDemand reads: the RATED dispatch
     * (MWE_RATED, which is why `tb` is built with it below and only takes the IC's own dispatch
     * afterwards) AND the DESIGN steam pressure. Neither the IC's own load nor the IC's own SG
     * pressure may move this number — PWR2_VALIDATION.md:3808, "feed and turbine at the IC's own
     * dispatch with rated_steam still frozen at the RATED scale".
     *
     * #539: it was frozen on NEITHER axis. This line used the IC's own `sg.P`, so 50 % Power and
     * Hot Standby drifted +0.57 % / +0.88 %; and a second recompute in the cold branch below ran
     * AFTER the dispatch had been zeroed, so Mode 4 booted at 0.0000 kg/s — an inert feed train
     * behind a feed gauge reading back exactly what was dialled, and code safeties that indicated
     * OPEN while passing nothing. That recompute is now GONE rather than reordered: a reorder
     * leaves the same coupling for the next editor. (At Mode 4's own 0.2059 MPa this line alone
     * would have read 171.9449 kg/s, so the design pressure is load-bearing, not tidiness.) */
    var tb = TB.createTurbine({ load_target_mwe: MWE_RATED });
    var eng = {
      sys: sys, pz: pz, rx: rx, sg: sg, tb: tb,
      rl: RL.createRelief({}),
      cd: CD.createCondenser({}),
      dc: DC.createDumpCtl({}),
      /* THE COLD LINEUP BOOTS WITH THE ORIFICES OUT (#624 item 25, 2026-09-04). Mode 4 and
       * Mode 5 are the same RHR-held plant one step apart, and the source puts low-pressure
       * letdown on the RHR cross-connect in that regime, not on the orifices:
       *   [sourced] WTSM ch.19 (ML11223A342): "Coolant removal is accomplished by letdown,
       *   primarily from the residual heat removal system (RHR) … Letdown is via the
       *   RHR-to-CVCS cross-connect valve HCV-128."
       *   [sourced] NUREG-1431 Rev 4 Bases (ML12100A228): "During LTOP MODES, the RHR System
       *   is operated for decay heat removal and low pressure letdown control."
       * Every initial condition used to boot `letdownOpen = 1`, which is why the LETDOWN
       * selector had never changed anything a player could see — an orphan control on a board
       * whose plant was already lined up. The heatup checklist now has a step for it. */
      cv: CV.createCVCS({ boron_ppm: boron0, letdownOpen: ic.cold ? 0 : 1 }),
      ec: EC.createECCS({}),
      aw: AW.createAFW({}),
      fw: FWM.createFeedwater(ic.pf > 0 ? {} : { at_power: false }),
      dm: DG.createDamage({}),
      /* a plant AT POWER has BOTH startup-net blocks requested (#460, #601); below P-10 the
       * requests would be revoked anyway, and HZP boots without them — blocking is the
       * operator's startup action (ir_high_block then low_flux_block, the board's two block
       * buttons). The two travel together HERE and only here: an IC states a lineup, and an
       * at-power plant that had ascended through P-10 took both. During play they are
       * separate levers. The shutdown IC boots with the P-11 pair TAKEN — the cooldown's own
       * lineup ("Block SI is three actions", and the third was the pressure setpoint coming
       * down, already done). */
      pt: PT.createProtection({ blockLowFlux: ic.pf >= 0.1, blockIrHigh: ic.pf >= 0.1,
                                blockLoPress: !!ic.cold, blockSI: !!ic.cold }),
      brk: null,
      ctm: CT.createContainment({}),
      rated_steam: TB.steamDemand(tb, sgDesign.P, G.SG.h_feed),
      M_nominal: sys.M_total,
      simTime: 0,
      /* command state */
      rodTarget: ctrlSteps, rodSteps: ctrlSteps,
      sdTarget: ic.cold ? 0 : BANK(), sdSteps: ic.cold ? 0 : BANK(), rodBank: rodBank,
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
      /* THE MSIV (#511) — a real valve, sourced placement (Ginna TS Bases B 3.7.2): the MSIV
       * sits DOWNSTREAM of the MSSVs and the TDAFW steam supply, so closing it isolates the
       * turbine and the condenser dumps while the code safeties, the ADV and the
       * turbine-driven aux feed pump keep their steam. ~5 s stroke [derived, valve class];
       * `open` is the demanded position (the board lamp), `pos` the travel the flow sees. */
      msiv: { open: true, pos: 1 },
      /* one-step-lag carriers. _ctP starts UNDEFINED on purpose: pwr2_break falls to its
       * sourced 1.0 psig pre-accident default until containment has stepped once (#543). */
      _Qox: 0, _pzRelief: 0, _pzReliefH: 0, _pzSurgeHeat: 0, _eccsKgs: 0, _sgtrKgs: 0, _sgtrH: 0,
      _letdownKgs: 0,
      _ctP: undefined,
      _pzr: null, _dcr: null, _lastTrip: false,
      _scramT: null, _manualTrip: false, _rodStopSig: false, _runbackSig: false,
      _rbT: 0, _rbActive: false,
      ins: IN.createInstruments(opts.instruments),
      rh: RD.rhr.createRHR({})
    };
    /* the turbine takes the IC's own dispatch — and NOTE that `eng.tb` IS `tb`, the same
     * object the rated scale was read off above. That aliasing is what made #539: the cold
     * branch used to re-read `tb` AFTER this line zeroed it. rated_steam is now computed once,
     * in the literal above, and nothing below may touch it. */
    eng.tb.load_target_mwe = ic.load_mwe;
    /* AND THE SHAFT AT THE IC'S OWN SPEED (#598 item 1). A plant carrying load boots
     * SYNCHRONIZED — settled construction, the same rule as the heat map and the feed train:
     * a machine already making 100 MWe must not spend its first spin-up tau finding rated.
     * A plant carrying NO load boots STOPPED, which is the whole point of the fix: Mode 3,
     * Mode 4 and Mode 5 used to draw scrolling blades and print 1800 rpm on a cold reactor. */
    eng.tb.rpm = ic.load_mwe > 0 ? TB.TURB.rpm_rated : 0;
    /* SHUTDOWN extras: RHR ALIGNED — the Mode 4 heat sink, openable because 350 psig sits
     * under the 425 psig permissive. (The rated_steam recompute that lived here is GONE — see
     * the rated-scale note above; it was the #539 defect, not a shutdown extra.) */
    if (ic.cold) {
      /* RHR ALIGNED (suction open — 350 psig sits under the 425 psig permissive) with the
       * HX THROTTLED SHUT: a HOLD, not a cooldown. Measured with hx 0.5: the HX pulled the
       * heat-free plant down 26 degC in 300 s (−560 degF/hr class) and drained the
       * pressurizer — a settled hold throttles the HX to match the (zero) decay heat, and
       * opening it IS the operator's cooldown lever. */
      eng.rh.valve_open = true;
      eng.rh.hx_fraction = 0;
      /* AND IT IS RUNNING FROM t=0, not from the first step (#605). `rh.running` is recomputed by
       * stepRHR, but the loss-of-main-feed arming reads it ONE STEP OLD — so leaving it false here
       * armed the casualty chain on step 1 of a settled, RHR-held plant and latched AFAS before
       * stepRHR could say otherwise. Measured: AFAS `loss_of_main_feed` within 10 steps of boot on
       * cold_shutdown. This IS the settled state's own value: valve open, buses alive. */
      eng.rh.running = true;
      /* ACCUMULATOR ISOLATED (#511) [sourced — Ginna TS Bases B 3.5.1: "In MODE 3, with RCS
       * pressure <= 1600 psig, and in MODES 4, 5, and 6, the accumulator motor operated
       * isolation valves are closed ... This allows RCS cooldown and depressurization
       * without discharging the accumulators"] — the 364 psia shutdown boot sits far below
       * the 650 psig cover pressure, and an open valve would dump the tank at t=0. */
      eng.ec.acc.valve_open = false;
      /* THE MACHINE IS TRIPPED AND THE MAIN FEED PUMPS ARE SECURED *(OWNER, 2026-09-02 playtest,
       * M5->3 item 2: "In mode 5 it should start w/ turbine tripped, SG feed off"; the lineup
       * detail RULED the same day: "Feed pumps secured")*.
       *
       * Both were the RETIRED-BY-REFERENCE shape (#534's standing trap): `createTurbine` defaults
       * `tripped: false` and `createFeedwater({at_power:false})` defaults `auto: true` with both
       * pumps running, because those defaults were written for the one initial condition this
       * engine used to have — Hot Full Power. #598 item 1 fixed the visible half of the turbine
       * one (the shaft no longer prints 1800 rpm on a cold reactor) and left the LATCH, so a
       * Mode 5 plant sat with a latched machine that a load demand would have admitted steam to.
       * The feed half was worse: the three-element controller booted ENGAGED, which made the
       * heatup checklist's "put steam-generator level control in AUTO now" a step that changed
       * nothing.
       *
       * `valve` / `valveI` / `feed_frac` are already 0 at `at_power: false`, so this adds the
       * SELECTOR and the PUMPS, not the flow. The operator's route back is the FEED PUMPS card:
       * AUTO or a non-zero MAN demand starts them (pwr2_shell's feedSelect/startFeedPumps).
       *
       * MODE 4 GETS IT TOO, because this branch is `ic.cold` and Hot Shutdown is the same
       * lineup one step warmer — RHR is the heat sink there as well, main feed is secured, and
       * aux feed (eng.afw, untouched here) is the feed path. Booting Mode 4 with a latched
       * turbine and two running feed pumps would leave exactly the defect this fixes. */
      eng.fw.auto = false;
      eng.fw.manual_frac = 0;
      eng.fw.pumpA = false;
      eng.fw.pumpB = false;
    }
    /* THE TURBINE IS TRIPPED IN EVERY MODE THAT CARRIES NO LOAD *(OWNER, 2026-09-03, #619
     * item 11: "Mode 3 start: Turbine should start tripped, right?")* — so Mode 3, Hot Standby
     * joins Mode 4 and Mode 5, and it is a WIDER guard than the cold lineup above because a hot
     * subcritical plant is not a cold one in any other respect (its feed IS lined up, its dumps
     * hold the no-load anchor).
     *
     * TWO ROUTES TO MODE 3 GAVE TWO DIFFERENT PLANTS, which is the actual defect. `tb.tripped`
     * was set inside the `ic.cold` branch, so arriving by the heatup checklist — whose own
     * caution says "the turbine stays tripped for the whole heatup" — left it tripped, while
     * BOOTING Hot Standby left it latched.
     *
     * AND IT MADE AN AUTHORED STEP A NO-OP: `pwr_startup` step 15 presses LATCH on the
     * TURBINE-GENERATOR card, which does nothing to an already-latched machine. Same shape as
     * the ascension's rod withdrawals against a bank on its top stop (#624) — an instruction
     * the player is told to perform that the plant had already performed for them.
     *
     * Keyed on `load_mwe`, not on `subcritical` or `pf`: the new `low_power` IC is subcritical
     * by neither measure but IS on the grid at 10 MWe, and a tripped turbine there would be a
     * plant that cannot exist. */
    if (!(ic.load_mwe > 0)) eng.tb.tripped = true;
    /* the feed train at the IC's own operating point (the module's constructor knows only
     * at-power/no-load; a mid-load IC sets the delivered point so the boot does not spend
     * its first pump-tau finding it — the same settled-construction rule as the hmap) */
    if (ic.pf > 0 && ic.pf !== 1) {
      eng.fw.feed_frac = ic.pf;
      eng.fw.valve = ic.pf / (2 * FWM.FW.pump_frac_each);
    }
    return eng;
  }

  /* THE ROD DRIVE'S DOOR (#545) — a bank command REFUSES BY NAME while the reactor trip is
   * latched, because the trip breakers have taken the CRDMs' power away [sourced, Ginna TS
   * Bases B 3.3.1 ML20339A221 — the quote is on the level hold in stepInner]. The step block
   * would hold the rods anyway; this is the other half, and it is the half that matters:
   * an ACCEPTED command the next step overwrites is worse than a missing one (#551/#559,
   * §100), and the operator gets a reason on the screen instead of a dead button (#558).
   *
   * IT REFUSES MOTION, NOT THE PRESS. The board sends `rod_stop` on EVERY button release and
   * the shell's mapper implements that as "target := current position" — a flat refusal would
   * make letting go of the button an error. So the test is whether the command asks the bank
   * to MOVE, which `rod_stop` and `rod_stop_all` never do. */
  /* ROD STOP NAMES (#572) — one per contributor to `ptr.rod_stop_causes`, so the refusal below
   * says WHICH stop is standing. A lumped "a rod stop is active" would make the intermediate-
   * range one — the only stop a player meets during a startup — indistinguishable from the
   * delta-T pair they meet at power. */
  var ROD_STOP_WHY = {
    /* #601: this named the WRONG BLOCK. It said "block the low-setting flux trips" because the
     * stop rode `blockLowFlux` — the power-range lever — which is the mis-wiring #601 corrects.
     * WTSM 12.2's P-10 list pairs this stop with the INTERMEDIATE RANGE trip's block, item 1. */
    ir_high_flux: 'the INTERMEDIATE RANGE high flux rod stop is standing (above 20 % current ' +
      'equivalent power) [sourced, WTSM 8.1 §8.1.7.3 ML11223A252]. Block the INTERMEDIATE ' +
      'RANGE high flux trip above P-10 to clear it — one operator action takes the trip and ' +
      'the stop together, and it is the power-ascension step',
    pr_high_flux: 'the POWER RANGE high flux rod stop is standing (above 103 % power) ' +
      '[sourced, WTSM 8.1 §8.1.7.3 ML11223A252]. Reduce power',
    delta_t: 'an OVERTEMPERATURE / OVERPOWER delta-T rod stop is standing (within 3 % of the ' +
      'trip setpoint) [sourced, Ginna UFSAR ch7 §7.2.3.2.1]. The turbine is running back; let ' +
      'delta-T recover'
  };

  function rodDriveDoor(eng, value, steps) {
    var target = Math.max(0, Math.min(BANK(), value));
    var moving = Math.abs(target - steps) > 1e-9;
    if (eng.pt.reactor_trip) {
      if (!moving) return;
      throw new Error('ROD DRIVE BLOCKED: the reactor trip is LATCHED — the reactor trip ' +
        'breakers are open and power to the control rod drive mechanisms is interrupted ' +
        '[sourced, Ginna TS Bases B 3.3.1 ML20339A221]. Reset the RPS to restore rod drive ' +
        'power; the rods stay where they are until you deliberately withdraw them.');
    }
    /* THE ROD STOPS REFUSE OUTWARD MOTION ONLY, which is the source's own scope: *"These
     * interlocks or rod stops only prevent outward rod motion. The rods can always be inserted
     * into the core using either manual or automatic rod control."* (WTSM 8.1 §8.1.7.3). So the
     * test is direction, not motion — unlike the trip above, where the drive has no power at
     * all and INSERT is refused too.
     *
     * WHY IT REFUSES AT ALL, rather than being clamped in the step block as it was: the
     * integrator has zeroed outward `move` on `_rodStopSig` since the delta-T pair was built,
     * silently. That is an ACCEPTED command the next step discards — the #551/#559 law, and
     * exactly the dead-button class #545 fixed one system over. Shipping a NEW block with the
     * same silence would have recreated it on arrival. The clamp stays as the belt: a stop that
     * arrives mid-travel, with the demand already standing, is not a command and cannot be
     * refused at a door. */
    if (!(target > steps + 1e-9)) return;
    var causes = eng.rpsReport && eng.rpsReport.rod_stop_causes;
    if (!causes) return;
    var why = causes.ir_high_flux ? ROD_STOP_WHY.ir_high_flux
            : causes.pr_high_flux ? ROD_STOP_WHY.pr_high_flux
            : causes.delta_t      ? ROD_STOP_WHY.delta_t : null;
    if (!why) return;
    throw new Error('ROD WITHDRAWAL BLOCKED: ' + why + '. Inward motion is still available.');
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
        rodDriveDoor(eng, +value, eng.rodSteps);
        eng.rodTarget = Math.max(0, Math.min(BANK(), +value)); break;
      case 'sd_target':
        rodDriveDoor(eng, +value, eng.sdSteps);
        eng.sdTarget = Math.max(0, Math.min(BANK(), +value)); break;
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
      case 'ir_high_block':
        /* THE OTHER P-10 REQUEST (#601) — the 25 % intermediate-range high flux trip AND the
         * C-1 rod stop, which WTSM 12.2's P-10 list pairs on this one lever. Same law as
         * above (request, P-10-gated, auto-revoked below 8 %); a SEPARATE lever because the
         * source lists two operator actions and the ladder is taken in order — the IR trip at
         * 25 % arrives before the power-range low setting at 35 %. */
        eng.pt.blockIrHigh = !!value; break;
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
      /* THE OPERATOR'S RE-LINE IS WHAT CLEARS THE PROTECTIVE ISOLATE (#624 item 14) — and it is
       * REFUSED while the 17 % cut still stands, which is the interlock's own shape (WTSM
       * §4.1.3.1: the isolation valves close on low level; the level has to come back before
       * they will stay open). Above 20 % the latch has cleared and the re-line takes. */
      case 'letdown':
        eng.cv.letdownOpen = Math.max(0, Math.min(1, +value));
        if (eng.pz.lowLevelCut !== true) eng.cv.letdownIsolated = false;
        break;
      case 'pzr_setpoint_mpa':   eng.pzDrivers.setpoint_mpa = +value; break;
      case 'pzr_heaters_manual':
        eng.pzDrivers.heaters_manual = value === null ? undefined : +value;
        /* touching the heater control IS the operator's post-shed re-load (NUREG-0737's
         * manual re-loading, the old engine's set_heater convention — #507 wave 4) */
        eng.pz.shedLatch = false;
        break;
      case 'pzr_spray_manual':   eng.pzDrivers.spray_manual = value === null ? undefined : +value; break;
      case 'aux_spray':      eng.pzDrivers.aux_spray = +value; break;
      case 'porv_stick':     eng.pzDrivers.porv_stick = !!value; break;   /* ARMS the latch */
      case 'porv_manual':    eng.pzDrivers.porv_manual = !!value; break;  /* the operator's lift */
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
      /* THE FLOW CONTROL VALVES (#562) — 0..1, ONE valve downstream of both pumps. It is
       * the operator's continuous post-trip task on a real plant (WAT 05 Transients: "it is
       * necessary to throttle AFW flow to control RCS temperature at this point"), and until
       * this door existed the plant had no lever at all: `set_afw_flow` read only
       * `c.normalized`, so the board's own `{pct: 0}` evaluated `undefined !== undefined ?
       * ... : 1 > 0` = TRUE and RE-ASSERTED the pump. Throttling is DELIVERY, never demand —
       * a shut valve leaves the run lamps lit, the #200 split. */
      case 'afw_throttle':   eng.aw.throttle = Math.max(0, Math.min(1, +value)); break;
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
      /* PUMP AVAILABILITY, the casualty seat (#605) — 0..1 each, and NOT the operator's selector
       * above (#200: take the delivered capability away, leave the switch where the operator put
       * it). loss_of_feedwater drives these; `main_feed_lost` and its sourced turbine-trip/MDAFW
       * chain read them, so an operator securing the pumps in Mode 4/5 is a lineup and both pumps
       * failing is a casualty. Old saves carry no field and land at the constructor's 1. */
      case 'feed_pump_a_avail': eng.fw.pumpAAvail = Math.max(0, Math.min(1, +value)); break;
      case 'feed_pump_b_avail': eng.fw.pumpBAvail = Math.max(0, Math.min(1, +value)); break;
      case 'isolate_feedwater':
        /* operator isolation AND the operator's reset; the SI-driven latch re-asserts on
         * the next step if the sourced 32 s condition still stands */
        eng.fw.isolated = !!value;
        break;
      case 'cw_pumps':       eng.cwPumps = !!value; break;
      /* CIRCULATING-WATER INLET TEMPERATURE, degC (#591 item 1). NOT a plant control — it is
       * the heat sink the site is given, and the door exists so the coupling the condenser
       * module was built around is reachable rather than asserted. `pwr2_condenser` owns the
       * range; a null/non-finite value is ignored rather than clamped, so a malformed command
       * cannot silently move the sink. */
      case 'cw_inlet_temp':
        var cwc = CD.clampCwInlet(value);
        if (cwc !== null) eng.cd.cw_inlet_c = cwc;
        break;
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
      case 'msiv':
        /* #511 — demanded position; the step strokes eng.msiv.pos toward it (~5 s class).
         * WHO may close it and when is the caller's law (HR5) — this is the valve. */
        eng.msiv.open = !!value; break;
      case 'accumulator_valve':
        /* #511 — the motor-operated isolation valve. The sourced >1600 psig administrative
         * power-lock is the SHELL's refusal (it reads the INDICATED pressure); this door is
         * the motor. */
        eng.ec.acc.valve_open = !!value; break;
      case 'afw_block':
        /* the TMI-2 tagged-shut discharge valves — dead-heads BOTH AFW trains */
        eng.aw.blocked = !!value; break;
      case 'scram_block':
        /* ATWS: the trip LATCHES (annunciators, turbine trip, the record) — only the rod
         * drop is failed, which is what a failure-to-scram IS */
        eng.scramBlocked = !!value; break;
      case 'turbine_trip_failed':
        /* THE INJECTED TURBINE TRIP, as a SEAT (#551). The menu row has set `turbine_trip`
         * since it was built, but a bare state cannot be reported or cleared — the Failures
         * tab and clear_failure both read a detector, and a trip the plant reaches by itself
         * is indistinguishable from an injected one. A seat says WHO tripped it. It also holds
         * the latch: the operator cannot latch away the instructor's casualty. */
        eng.tbTripFailed = !!value;
        if (value) eng.tb.tripped = true;
        break;
      case 'p9_defeat':
        /* #515: the P-9 turbine-trip channel failed — the anticipatory trip reports nothing
         * (pwr2_protection); a persistent physical state, cleared only by the clear */
        eng.p9Defeated = !!value; break;
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
        /* NARROWED at #512 (owner design — per-system latches unlatch at their own panels):
         * the RPS RESET button clears the REACTOR TRIP only (breakers/rods, behind the
         * kernel's rods-in permissive). SI / AFAS / FWI have their own doors below, driven
         * by the panels' securing clicks through the shell. */
        eng.pt.reactor_trip = false; eng.pt.trip_cause = null;
        eng._manualTrip = false;   /* releasing the pushbutton is part of the reset */
        /* RE-ARM THE TRIP EDGE (#507 wave 6, found by the ATWS probe): _lastTrip lags one
         * step, so a reset followed IMMEDIATELY by a new trip (or the pushbutton) landed
         * with the stale true and the edge never fired — latch on, annunciators on, rods
         * standing. Clearing the latch is re-arming its edge detector. */
        eng._lastTrip = false;
        break;
      /* THE PER-SYSTEM RESETS (#512). Each clears one function's latch and sets its
       * RE-ARM BLOCK [sourced — after an SI reset "all automatic SI actuation signals are
       * blocked"; the block clears in pwr2_protection when the live signal drops]. WHEN a
       * reset is permitted (the 45-60 s time-delay relay + P-4) is the SHELL's, read off
       * pt.*_t (HR5 shape: the doors stay dumb). */
      case 'reset_si':
        eng.pt.si = false; eng.pt.si_cause = null; eng.pt.si_rearm_block = true; break;
      case 'reset_afas':
        eng.pt.afas_mdafw = false; eng.pt.afas_mdafw_cause = null;
        eng.pt.afas_tdafw = false; eng.pt.afas_tdafw_cause = null;
        eng.pt.afas_rearm_block = true; break;
      case 'reset_fwi':
        /* the FWI valve state stays isolated through the reset — clearing a latch is not
         * re-opening a valve; isolate_feedwater false is the operator's restore */
        eng.pt.fwi = false; eng.pt.fwi_cause = null; eng.pt.fwi_rearm_block = true; break;
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
  /* #517: the held snapshot must SAY it is held. `_lastTs` is by construction the last state that
   * PASSED the screen — i.e. a HEALTHY one — so replaying it verbatim republishes `model_held:
   * false` for ever, and the two _dead guard families stay exactly as invisible as they were
   * before the field existed. Stamped here rather than in buildTrueState because on this path
   * buildTrueState is never called again. */
  function stampHeld(eng) {
    if (!eng._lastTs) return;
    eng._lastTs.sim_time_s = eng.simTime;
    eng._lastTs.model_held = true;
    eng._lastTs.model_held_why = eng._deadWhy ||
      'the plant left the range the property library is characterised over';
  }

  function step(eng, dt) {
    /* #585 — THE HOLD IS THE WHOLE PLANT (owner-ruled 2026-08-29). `beyond_model` used to stop
     * only the primary's mass/energy solve while all 19 subsystems kept stepping around it — so
     * the break went on booking discharge into containment at ~49 kg/s and every accumulator
     * (AFW delivered_kg, CVCS, damage) kept its own clock against a frozen plant. Held means one
     * thing: the same short-circuit the runaway screen (_dead) already takes. */
    if (eng._dead || (eng.sys && eng.sys.beyond_model === true)) {
      eng.simTime += dt;
      if (eng._lastTs) { stampHeld(eng); return eng._lastTs; }
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
        if (eng._lastTs) { stampHeld(eng); return eng._lastTs; }
      }
      return out;
    } catch (e) {
      if (/NON-FINITE|beyond|characterised|envelope/i.test(String(e && e.message))) {
        eng._dead = true;
        eng._deadWhy = 'throw: ' + String(e.message).slice(0, 90);
        if (eng.sys) eng.sys.beyond_model = true;
        eng.simTime += dt;
        if (eng._lastTs) { stampHeld(eng); return eng._lastTs; }
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

    /* THE REACTOR TRIP BREAKERS TAKE THE DRIVE'S POWER AWAY (#545) [sourced] — Ginna TS
     * Bases B 3.3.1 (ML20339A221), Reactor Trip Switchgear: "The RTBs are in the electrical
     * power supply line from the control rod drive motor generator set power supply to the
     * control rod drive mechanisms (CRDMs). Opening of the RTBs interrupts power to the
     * CRDMs, which allows the shutdown rods and control rods to fall into the core by
     * gravity and shutdown the reactor."
     *
     * So a LATCHED reactor trip means no rod drive power AT ALL — neither bank, neither
     * direction — until the RPS reset re-closes the breakers. LEVEL-HELD while the latch
     * stands, which is the caller's-half law the turbine trip, the SI pumps, the AFW starts
     * and the feedwater isolation below already follow; the rods were the one consumer wired
     * to the latch's rising EDGE alone. MEASURED before this line existed: scram from
     * hot_full_power, then hold WITHDRAW on both banks, and the plant went 0/0 -> 200/200 and
     * 2.71 % -> 61.18 % true power with `scrammed` reading true on the true state, the
     * instrument AND the kernel at once, while hi_flux_lo sat asserted at 0.6170 against its
     * 0.350 setpoint, tripping, held 751.6 s, and could do nothing — the latch it would set
     * was already set. One step old, the house lag convention.
     *
     * The ATWS is where the BOTH-DIRECTIONS half is observable (under a normal trip the rods
     * are already at 0): with the drop failed the operator can no longer walk the rods back
     * in by hand, and the response is emergency boration, which is the prototypical one
     * *(OWNER RULING, 2026-08-28: selected "Refuse both directions" over allowing inward
     * motion — a menu selection, cited in that form)*. */
    var rodDrivePowered = !eng.pt.reactor_trip;

    /* rods: slew toward target; a scram overrides the slew. TWO BANKS since #506.3 —
     * both insert on a trip, shutdown slightly faster (the pwr1 2.5/2.0 pair). */
    if (eng._scramT !== null) {
      eng._scramT += dt;
      /* MONOTONE-DOWN: min() with the current position, so a second trip edge restarting
       * the ramp can never move the rods OUT (200*(1-t/2) evaluated fresh from t=0 would
       * teleport a partially-withdrawn bank back toward 200). */
      eng.rodSteps = Math.max(0, Math.min(eng.rodSteps, BANK() * (1 - eng._scramT / SCRAM_S)));
      eng.sdSteps = Math.max(0, Math.min(eng.sdSteps, BANK() * (1 - eng._scramT / SD_SCRAM_S)));
      if (eng.rodSteps === 0 && eng.rodTarget === 0) eng._scramT = null;
    } else if (!rodDrivePowered) {
      /* THE BREAKERS ARE OPEN — neither bank moves under drive. Ahead of the runaway branch
       * on purpose: a continuous-withdrawal DRIVE fault is downstream of the same power
       * supply, so it stops too. The scram edge below already clears `eng.runaway` ("gravity
       * beats a drive"), but the ATWS path never reaches that edge, and this is the branch
       * that catches it. The demands are NOT rewritten here — the demand-heals-itself trap
       * (#200/#329/#332): take the delivered motion away, leave the operator's latched
       * target where the operator put it. The RPS reset snaps them to position, which is the
       * only place a demand may legitimately be cleared (pwr2_shell's reset_rps). */
    } else if (eng.runaway) {
      /* CONTINUOUS ROD WITHDRAWAL (#507 wave 6): the drive faults OUTWARD at the failure's
       * rate — target ignored, and the rod stop too (the stop inhibits the demand path; a
       * drive fault is downstream of it, DECLARED). A working scram still wins: the branch
       * above runs first, and gravity beats a drive. NOTE the shipped hot-full-power IC
       * parks the bank at 200/200 (boron-trimmed), so at that IC the failure has no travel
       * to take — it bites on any plant whose rods are inserted (load-follow, recovery). */
      eng.rodSteps = Math.min(BANK(), eng.rodSteps + eng.runaway.rate * dt);
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
    if (eng._scramT === null && rodDrivePowered && eng.sdSteps !== eng.sdTarget) {
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

    /* THE MSIV STROKE (#511): ~5 s travel [derived, valve class] toward the demanded
     * position. Closing it at load TRIPS the turbine [sourced — Ginna TS Bases B 3.7.2:
     * "Closing the MSIVs isolates each SG from the other, and isolates the turbine, steam
     * dump system, and other auxiliary steam supplies"; §6.3's own close_msiv note: "trips
     * a loaded turbine; SG bottles to its code safeties"]. Level while shut, the same law
     * as the reactor-trip wire below — a shut steam line cannot carry a re-latched turbine. */
    var msivTgt = eng.msiv.open ? 1 : 0;
    if (eng.msiv.pos !== msivTgt) {
      var dMsiv = dt / 5.0;
      eng.msiv.pos += Math.max(-dMsiv, Math.min(dMsiv, msivTgt - eng.msiv.pos));
    }
    if (eng.msiv.pos < 0.9) eng.tb.tripped = true;

    /* turbine steam is gated by the MSIV; the MSSVs and the ADV are UPSTREAM of it and keep
     * flowing (stepRelief's msiv_frac gates only the dumps), as is the TDAFW steam supply
     * (pwr2_afw's turbine pump is deliberately ungated — WTSM 5.7.5 + B 3.7.2) */
    var steam = TB.steamDemand(eng.tb, eng.sg.P, G.SG.h_feed) * eng.msiv.pos;

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
      adv_block: eng.advBlock,
      /* the dumps are DOWNSTREAM of the MSIV (#511 — B 3.7.2); safeties/ADV are upstream */
      msiv_frac: eng.msiv.pos
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
      /* element 2 reads TOTAL steam leaving the SG (sg_steam_flow ← steam_out_total:
       * turbine + dumps + relief), NOT the turbine channel — post-trip the dumps carry
       * the steam and `steam_flow` reads ~0, so the three-element controller saw zero
       * demand and delivered nothing for ~3 min while level walked down (#509 item 5;
       * the exact defect pwr1's feed channel fixed for itself — see the SOURCE comment
       * in pwr_instruments.js and pwr_control's feed_sg input) */
      /* THE CHANNEL EXISTS SINCE #540 (2026-08-27) and this line finally takes its first
       * branch. For six days it did not: `pwr2_instruments.js` had no `sg_steam_flow`, so
       * the ternary took the `steam_flow` fallback on every step — the turbine-only channel
       * the comment above says not to read — and #509 item 5 was recorded fixed while the
       * pre-fix symptom stood. The FALLBACKS STAY: a Layer-5 fixture with no instrument
       * layer is a harness, not a plant, and `out / eng.rated_steam` is the same quantity
       * unlagged. Do not "simplify" them away; do not let this become an undefined read
       * again — run_pwr2_instruments now asserts the channel by id. */
      steam_flow_frac: rdF.sg_steam_flow !== undefined ? rdF.sg_steam_flow
                       : (rdF.steam_flow !== undefined ? rdF.steam_flow : out / eng.rated_steam),
      fw_flow_frac: rdF.fw_flow !== undefined ? rdF.fw_flow : eng.fw.feed_frac,
      si_active: eng.pt.si,
      /* main feed pumps are NONVITAL loads (#507 wave 4) — capacity dies with the grid,
       * the pump selectors stay where the operator left them */
      power_ok: offsiteOk
    });
    /* [sourced ch10]: "If both main feedwater pumps fail, the turbine will be tripped" —
     * level, not edge, same as the reactor-trip→turbine wiring; P-9 then decides whether
     * the reactor trips, which is the source's own ">50% of full power" clause.
     *
     * THE LOSS ONLY MATTERS WHERE MAIN FEED IS THE HEAT SINK (#605) [DECLARED SIMPLIFICATION,
     * UNVERIFIED — no source in any lane's corpus gives the mode conditions on this plant's
     * loss-of-main-feed chain: `node tools/find_source.js "loss of main feed.*MODE|MDAFW.*MODE 4"`
     * returns 0 hits across 39 documents in 3 lanes, 2026-09-02]. `main_feed_lost` itself
     * reads CAPACITY, selector included, and that is right: securing both pumps at power loses
     * the heat sink exactly as surely as a pump failure, and no real breaker-position signal can
     * tell intent apart. But the sourced sentence is written about a plant AT POWER, where the
     * steam generator IS the heat sink. In Mode 4 and Mode 5 the RCS is on RHR, main feed is
     * secured as the NORMAL lineup and the generator is not boiling — firing a casualty response
     * there starts aux feed into a generator nobody is using. MEASURED before this arming existed
     * (#605): the cold initial conditions actuated AFAS at t=0 and pulled the settled Mode 4
     * plant down 21 degF/hr. The first attempt made `main_feed_lost` availability-only instead,
     * and `run_pwr2_engine` caught what that cost — securing both pumps at 100 % power stopped
     * tripping the turbine. This is the same distinction made in the right place (HR5: the module
     * reports, the caller decides).
     *
     * `rh.running` is `valve_open && powered` — RHR actually in service, not merely alignable, so
     * a blackout that kills the RHR pumps re-arms the chain. It is read ONE STEP OLD here, the
     * same convention as the CVCS letdown gate below; `createRHR` seeds it so the first step of a
     * cold plant does not read `undefined` as "not on RHR".
     *
     * WHAT IS NOT GATED: lo-lo SG level, safety injection and loss of offsite power all stay
     * armed in every mode. This conditions ONE input — the one whose premise is "the secondary
     * is carrying the heat". */
    var mfLost = fwr.main_feed_lost === true && !eng.rh.running;
    if (mfLost) eng.tb.tripped = true;
    eng._mainFeedLost = mfLost;                        /* the latch permissive reads it (#551) */
    /* THE DEMAND, kept apart from the DELIVERY (#516 item 1, 2026-08-29). `feed_frac` is what
     * the pumps are actually putting into the SG, behind `pump_tau_s`; `demand_frac` is what
     * the valve is calling for. Five board tiles legitimately read the delivered figure, but
     * the SG FEED SETPOINT BOX was reading it too — so each up-arrow click re-anchored the
     * operator's demand onto a value still lagging the previous click. Measured: eight clicks
     * asking +1 gpm each moved the box +0.5 gpm total. A setpoint reads back the SETPOINT. */
    eng._fwDemandFrac = fwr.demand_frac;
    /* the injected trip level-holds like every other seat — an instructor's casualty does not
     * heal because the operator pressed LATCH (#551) */
    if (eng.tbTripFailed) eng.tb.tripped = true;
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
    /* THE STEPPED LETDOWN FLOW, for the board (#624 item 14). `letdownOpen x normal` is NOT
     * this number on either side of the split: on a cold plant the cross-connect carries the
     * full magnitude through a SHUT orifice lineup, and under the 17 % isolate the lineup still
     * reads open while nothing flows. The shell's `letdown_flow_normalized` reads this. */
    eng._letdownKgs = cvr.letdown_kgs;

    /* THE SGTR IS A BREAK WHOSE DESTINATION IS THE SG (#507 wave 5) — inferred from the
     * node: a break AT sg_primary is a ruptured tube, and a tube discharges into the
     * SECONDARY, not containment (Ginna UFSAR ch15 §15.6.3 — the containment-bypass fact
     * is the accident's diagnosis lesson). Its backpressure is the SG's own steam pressure
     * (same step — stepSG ran above), so the sourced EOP falls out of the ΔP: "reduce
     * reactor coolant system pressure to equilibrate with the ruptured steam generator
     * secondary side pressure to minimize the coolant discharge" (§15.6.3). Every other
     * break discharges against LIVE containment pressure (#543) — LAST step's, since
     * containment steps below this (one-step lag, the house convention; the retired engine's
     * pwr_primary.js carried the same coupling the same way). Undefined on the first step
     * (and on an old save) falls to the sourced 1.0 psig pre-accident default in pwr2_break.
     * Without this a large break kept discharging against a frozen 1.0 psig after containment
     * passed RCS pressure: measured, 12,857 kg moved UP a 19.6 psi adverse gradient and total
     * discharge ran 15 % high at 1800 s. */
    var toSG = !!(eng.brk && eng.brk.node === 'sg_primary');
    var br = eng.brk ? BK.stepBreak(eng.brk, sys, dt,
                                    toSG ? { backpressure_mpa: sr.P_sec }
                                         : { backpressure_mpa: eng._ctP }) : null;
    eng._sgtrKgs = toSG && br ? br.mdot_kgs : 0;
    eng._sgtrH = toSG && br && br.mdot_kgs > 0 ? br.source.h : 0;
    /* THE BACKPRESSURE THE BREAK ACTUALLY USED, recovered from its own reported dP (#574). It
     * is a DIAGNOSTIC, on the same `eng._*` shelf as the carriers above, and it exists because
     * the wiring one line up was UNOBSERVABLE from outside: the mutation that freezes the
     * backpressure at its default was caught for weeks only incidentally, by trajectory checks
     * that happened to diverge, and went BLIND the moment #574's metal walls moved the ride.
     * A wire nobody can see reads as a working feature — which is the whole subject of #574. */
    eng._brkBackP = br ? sys.P - br.dP_mpa : undefined;

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
      /* THE LOOP-SIDE SINK IS AT THE HOT LEG'S OWN ENTHALPY, NOT THE DISCHARGE'S (#563 item
       * 5). The pressurizer has ALREADY debited the discharged mass at its own enthalpy from
       * its regions, and the vessel refills from the loop — so the loop loses mass at the hot
       * leg's h (a source at the node's own h moves dM and zero dH, which is exactly "the
       * vessel refills from the loop") while `_pzReliefH` rides the CONTAINMENT inflow below,
       * the single correct debit. Booking this sink at `_pzReliefH` removed the discharge
       * enthalpy TWICE: measured, a stuck-open PORV at hot standby destroyed 2,782.6 MJ that
       * no mass carried out (control residual 0.3 MJ) and cooled 11.0 degF / 72 psi more in
       * 10 min than conservation allows. */
      for (var iHL = 0; iHL < sys.nodes.length; iHL++) {
        if (sys.nodes[iHL].id === 'hot_leg') {
          srcs.push({ node: 'hot_leg', mdot: -eng._pzRelief, h: sys.nodes[iHL].h });
          break;
        }
      }
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

    /* #585 — the break's ledger books only what the plant ACCEPTED. A mid-step latch integrates
     * part of the step before refusing the rest (Courant sub-stepping), and `dt_accepted` is the
     * plant's own report of that time; the ledger and containment's intake below both book
     * exactly it — 0 on a refused step, dt on a healthy one, the adopted fraction at the latch. */
    var dtAcc = pr.dt_accepted === undefined ? (pr.held === true ? 0 : dt) : pr.dt_accepted;
    if (br && dtAcc > 0) BK.book(eng.brk, br, dtAcc / dt);

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
    /* THE 17 % CUT ISOLATES; IT DOES NOT RE-LINE THE PLANT (#624 item 14, owner-ruled
     * 2026-09-04). This line used to read `eng.cv.letdownOpen = 0` — the protective action
     * written into the operator's own selection, which then never healed and destroyed what the
     * player had picked. SET ONLY, never cleared here: restoration is an operator act, and the
     * `letdown` command below is where it happens.
     *   [sourced] WTSM §4.1.3.1 (ML11223A214): "The letdown orifice isolation valves
     *   automatically close on low pressurizer level." — nothing in the chapter re-opens them.
     *   `Manuals/06_ALARM_RESPONSE.md` PWR-A13a already documents exactly this: "there is no
     *   automatic restoration — letdown stays shut until you re-open an orifice by hand."
     * The retired kernel's row (layers/control/pwr_control.js) was designed the same way. */
    if (pzr.letdown_isolated) eng.cv.letdownIsolated = true;

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
      p9_defeated: eng.p9Defeated === true,           /* #515: the failed channel */
      /* [sourced ch10] the loss-of-both-feed-pumps MDAFW start's input — a STATE signal
       * (breaker positions), the turbine_tripped convention, not an analog channel */
      main_feed_lost: mfLost,        /* armed only off RHR — see the block above `var mfLost` */
      /* [sourced ch10] the loss-of-offsite-power AFW start's input — the same state-signal
       * class (#507 wave 4; the deferred start pwr2_protection.js recorded is now built) */
      loss_of_offsite: !offsiteOk,
      /* the delta-T pair's inputs: loop delta-T normalized to full-power delta-T, and Tavg.
       * DT0_C is [derived]: the plant's own measured full-power split at the design point
       * (606/550 degF, PWR2_VALIDATION.md sec 43) — 31.1 degC. Protection converts to the
       * source's units itself. */
      delta_t_frac: rd.thot !== undefined ? (rd.thot - rd.tcold) / DT0_C
                    : (tLeg(sys, 'hot_leg') - tLeg(sys, 'cold_leg')) / DT0_C,
      tavg_c: rd.tavg !== undefined ? rd.tavg : tavg   /* stepInner's own — #514, was a
                                                        * third primaryTavg leg-inverse pair */
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
    /* THE HIGH-HIGH LEVEL TURBINE TRIP IS NOT WIRED HERE — it rides the FWI line below, and
     * it did so BEFORE #562. A duplicate consumer stood on this line for one commit
     * (`if (ptr.turbine_trip_hi_level) eng.tb.tripped = true;`) because #562 read
     * pwr2_protection's header — which says the function is "P-14 class: feedwater regulator
     * closure + turbine trip" — and concluded the trip half had no consumer WITHOUT grepping
     * this file for one. It had one: `if (ptr.fwi) { eng.fw.isolated = true; eng.tb.tripped =
     * true; }`, carrying the WTSM 3.2 citation in its own comment. Inherited claims are the
     * risky ones, and a module header is an inherited claim. */
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
     * nothing is the accident's containment-bypass signature (#507 wave 5).
     * EACH STREAM CARRIES ITS OWN ENTHALPY (#566): the relief is pressurizer steam or hot
     * saturated liquid, the break is its node's water, and picking one carrier for the pair
     * under-booked containment energy 8.3 % on a compound casualty. The mdot-weighted mean
     * is EXACT here, not an approximation — the containment ledger accumulates dm and dm*h
     * linearly, so one blended call equals two single-stream calls to the last bit. */
    /* #585: containment receives the streams over the time the primary actually LOST them —
     * `dtAcc`, the plant's own report. Mass the plant did not lose cannot arrive anywhere, so a
     * refused step delivers nothing and a mid-latch step delivers its accepted fraction. */
    var mBr = br && !toSG && br.mdot_kgs > 0 ? br.mdot_kgs : 0;
    var mPz = eng._pzRelief > 0 ? eng._pzRelief : 0;
    var ctIn = mBr + mPz;
    var ctr = CT.stepContainment(eng.ctm, dtAcc > 0 ? dtAcc : dt,
      ctIn > 0 && dtAcc > 0
        ? { mdot_kgs: ctIn,
            h_kJkg: (mBr * (mBr > 0 ? br.source.h : 0) + mPz * eng._pzReliefH) / ctIn }
        : { mdot_kgs: 0 });
    eng._ctP = ctr.containment_pressure_mpa;   /* next step's break backpressure (#543) */

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
      tavg: tavg,     /* #514: stepInner's own — buildTrueState no longer re-inverts the legs */
      /* stage B1 ctx: contract-completion inputs */
      load_target_mwe: eng.tb.load_target_mwe,
      turbine_tripped: eng.tb.tripped,
      condenser_available: eng._cdAvail === true,
      pump_running: !eng.sys.pumpTripped,
      tavg_rate_c_per_hr: eng._tavgRate,
      /* the electrical truth — LIVE fields since #507 wave 4 (the registered static retired) */
      ac_available: acAvail,
      station_blackout: eng.elec.blackout,
      /* the MSIV truth — LIVE since #511 (the 'steam lines' static retired); the DEMANDED
       * position, which is what the board lamp shows (the flow rides eng.msiv.pos) */
      msiv_open: eng.msiv.open === true,
      /* #517 — the held-plant condition, published so the board can say the model has stopped.
       * BOTH guard families: the inner thermodynamic latch (pwr2_core) and the facade's own
       * screen, because from the player's seat they are the same event — the plant froze. */
      beyond_model: sys.beyond_model === true || eng._dead === true,
      held_why: eng._deadWhy || (sys.beyond_model === true
        ? 'the plant left the range the property library is characterised over' : null)
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
    eng._rodLimitMargin = ril === null ? BANK() : Math.max(0, Math.round(eng.rodSteps - ril));
    /* THE ACCUMULATOR WINDOW, AND A HOLD ON THE CLOCK WHILE IT IS OPEN *(OWNER, 2026-09-03,
     * #619 item 13: "There is a point the user will get stuck between step 7 and 8 if they do
     * not open the accumulator valve in the window. if they miss the window they have to
     * restart, theers no way to go back. We need to find a way that the player cant get trapped
     * here. maybe have it kick out of warp at 665psi and refuse to go into warp again until the
     * accumulator valve is opened.")*.
     *
     * The window is real and it is the one irreversible trap in the heatup: it opens at the
     * 665 psia cover gas and shuts at the 1600 psig administrative lock, nothing annunciates
     * either edge, and the Pressure SP dial's own floor (1700 psig) sits ABOVE the lock — so a
     * player who rides past it at 600x cannot dial their way back and must restart the leg.
     *
     * `speed_hold` IS A GENERIC SEAM, not an accumulator special case: it is a reason string
     * the PLANT sets when it wants the clock held at 1x, and the service honours it without
     * knowing what it means (see _attentionStop). That keeps the pwr2 constants — cover gas and
     * lock — in the module that owns them instead of leaking into a plant-agnostic service, and
     * it is the shape #409's state-aware warp governor will want.
     *
     * RISING ONLY. A cooldown walks back down through the same band with the valve deliberately
     * shut (the cooldown checklist opens the accumulators at 1500 psi and isolates them later),
     * and holding the clock there would fight a correct procedure. */
    var accWinLo = EC.ACC.p0_mpa;                                  // EC = RD.eccs, this file's alias
    var accWinHi = (EC.ACC.admin_lock_psig + 14.7) / 145.0377;
    var accP = ts.pressure_mpa;
    var accShut = ts.accumulator_valve_open !== true;
    var accRising = eng._prevAccP != null && accP > eng._prevAccP;
    eng._prevAccP = accP;
    ts.speed_hold = (accShut && accRising && accP >= accWinLo && accP <= accWinHi)
      ? 'accumulator window open — arm the accumulators before accelerating again'
      : null;

    /* WHAT THE ELBOW TAP MEASURES *(OWNER RULING, 2026-09-04: selected "The engine publishes
     * what the tap measures, and the channel reads that", from three options on #624 —
     * #619 item 1, "RCP flowing over 100% seems odd.")*.
     *
     * [sourced] WTSM §3.2 (ML11223A213, p.3.2-5): RCS flow is an ELBOW TAP, a differential-
     * pressure device on the intermediate-leg elbow. "The correlation between changes in flow
     * and elbow tap indication ... dP/dP0 = (W/W0)^2", and "The full-flow reference point P0 is
     * established during initial plant startup" — so the reference is a dP frozen at hot
     * full-flow conditions, NOT a live mass-flow ratio. The chapter is explicit about what the
     * device is for: "to provide information as to whether or not a REDUCTION in flow has
     * occurred". It is a loss-of-flow detector and is not accurate above 100 %.
     *
     * THE ALGEBRA. An elbow tap sees dP = k·rho·V^2, and W = rho·A·V, so dP ∝ W^2/rho. An
     * uncompensated meter reports sqrt(dP/dP0), which is (W/W0)·sqrt(rho0/rho). This pump holds
     * roughly constant VOLUMETRIC flow (it makes head, not pressure — see pwr2_sources), so the
     * true mass ratio is itself rho/rho0 and the indication collapses to sqrt(rho/rho0).
     *
     * MEASURED, cold shutdown with the pumps running: true mass flow 132.3 % of rated, which is
     * CORRECT — 50 °C water is 1.31x the density of the design cold-leg reference. The board was
     * publishing that truth straight through a lag-and-noise channel whose authored range is
     * [0, 120], so it read a PEGGED 120.00 %: neither the truth nor an indication. The tap reads
     * ~115 %, inside the range — which is evidence that range was drawn for a plant whose
     * indication behaved this way.
     *
     * TRUE STATE, not an instrument value: the dP physically exists in the plant, and this is
     * the flow it corresponds to. The instrument layer then does what it always does on top —
     * lag, noise, failure (pwr_instruments' `rcs_flow`, which reads this field when a plant
     * publishes one and falls back to raw mass flow for the retired engine, which does not). */
    ts.rcs_flow_dp_pct = (ts.pump_flow_pct == null) ? null
      : ts.pump_flow_pct / Math.sqrt(S.densityRatio(sys));

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
    /* THE ENERGIZED BANK, NOT THE DELIVERED HEAT (#573). A heater kW indication is ELECTRICAL:
     * an uncovered bank is still drawing full current, it is simply not heating water. Two
     * reasons this is the right field, not a nicety:
     *   1. The shell derives `heater_power_pct` from here and the board's MANUAL button
     *      re-sends that readback as the new demand — publishing the DERATED number would walk
     *      the operator's demand down on every press over a partly-uncovered bank, which is
     *      #538 arriving by a new road.
     *   2. It is the HE-3 lesson: the gauge reads full, the level channel reads 55 %, and
     *      pressure falls anyway. A "heaters 40 % submerged" readout would hand the player the
     *      answer the failed-transmitter case exists to make them find.
     * `pzr.heater_kW` (delivered) is what the vessel's energy balance and run_pwr2_engine's
     * closed energy audit use — they read the module result directly, not this field. */
    ts.pzr_heater_kw = pzr.heater_energized_kW;
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

  /* turbineTripCauses(eng) -> [{ id, why }] — WHICH standing conditions are holding the turbine
   * latch open right now, in the operator's words. Empty means the machine can be latched.
   *
   * WHY THIS EXISTS (#551/#559). Nothing in the shipped command surface un-latched the turbine —
   * 896 command/payload combinations were fired at a tripped plant and none cleared `tb.tripped`,
   * so ONE SCRAM ENDED ELECTRICAL GENERATION FOR THE SESSION. But a bare un-latch verb would have
   * been WORSE THAN NOTHING, and the measurement says so: the facade lever restores 60.0 MWe
   * within the step on a clean manual trip, and after a scram it is silently overwritten on the
   * very next step, because `main_feed_lost` and `fwi` are both standing. An accepted-then-
   * overwritten command is the #509 §79 defect one layer deeper — the operator presses, the plant
   * agrees, and nothing happens.
   *
   * So the six sites that LEVEL-HOLD `eng.tb.tripped = true` are enumerated HERE, once, and the
   * shell's `latch_turbine` refuses against them by name. The level-holds themselves are correct
   * and are NOT weakened — a latch that could defeat a standing trip is #545's defect, which is
   * still open on the reactor side and must not be imported here. What changes is that the reason
   * is addressable instead of invisible.
   *
   * KEEP THIS IN STEP WITH THE SITES. Each entry names the line that holds it; adding a
   * seventh level-hold without an entry here re-creates the silent-overwrite defect, and
   * `run_pwr2_engine` counts the sites against this list so that cannot happen quietly. */
  function turbineTripCauses(eng) {
    var out = [];
    var ptr = eng.rpsReport || {};
    if (eng.msiv && eng.msiv.pos < 0.9)
      out.push({ id: 'msiv', why: 'the main steam isolation valve is not open (' +
        (eng.msiv.pos * 100).toFixed(0) + ' %) — the turbine has no steam supply' });
    if (eng._cdAvail === false)
      out.push({ id: 'condenser', why: 'the condenser is unavailable — there is nowhere for the ' +
        'exhaust to go' });
    if (eng._mainFeedLost === true)
      out.push({ id: 'main_feed', why: 'both main feedwater pumps are lost [sourced, Ginna UFSAR ' +
        'ch10: "if both main feedwater pumps fail, the turbine will be tripped"]' });
    if (ptr.reactor_trip === true)
      out.push({ id: 'reactor_trip', why: 'the reactor trip is LATCHED — reset the protection ' +
        'system first' });
    if (ptr.fwi === true)
      out.push({ id: 'hi_hi_level', why: 'the high-high steam generator level isolation is ' +
        'LATCHED — the steam lines may be carrying water [WTSM 3.2]' });
    if (eng.tbTripFailed === true)
      out.push({ id: 'injected', why: 'the turbine trip is an injected casualty and has not ' +
        'been cleared' });
    return out;
  }

  root.RD.pwr2.engine = {
    createEngine: createEngine,
    command: command,
    step: step,
    turbineTripCauses: turbineTripCauses,
    designHmap: designHmap,   /* exported so the equivalence fixture boots the SAME plant */
    ICS: ICS,                 /* the initial-condition registry — the shell/UI menu reads it */
    RIL: RIL, insertionLimitSteps: insertionLimitSteps,
    MWE_RATED: MWE_RATED
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
