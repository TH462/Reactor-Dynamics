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
  var ROD_SLEW_SPS = 1.0;        /* steps/s, manual motion — [derived], see header */
  var SCRAM_S = 2.0;             /* full insertion on a trip, [derived] class figure */

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
  function designHmap() {
    var hH = W.h_l(TREF + DT0_C / 2, P0), hC = W.h_l(TREF - DT0_C / 2, P0),
        hA = W.h_l(TREF, P0);
    return { downcomer: hC, lower_plenum: hC, core: hH, upper_plenum: hH, hot_leg: hH,
             sg_primary: hC, crossover: hC, rcp: hC, cold_leg: hC,
             vessel_heads: hA, pressurizer: hA };
  }

  function createEngine(opts) {
    opts = opts || {};
    var pz = PZ.createPressurizer({});
    var hmap = designHmap();
    var sys = S.createPlant({ h: hmap, P: P0, extraMass: PZ.extraMassFn(pz) });
    /* completeness is structural: a node the map misses falls back to Layer 3's 1250 kJ/kg
     * silently — refuse to build a plant with a mis-seeded node instead */
    sys.nodes.forEach(function (n) {
      if (hmap[n.id] === undefined) throw new Error('pwr2_engine: designHmap has no entry for node "' + n.id + '"');
    });
    var rx = R.createReactor({ P: 1.0, coolTemp_c: TREF });
    var boron0 = RD.kinetics.criticalBoron(rx.kin, TREF, P0, null,
      rx.kin.X / rx.kin.X_eq_full, rx.fuel.T_fuel_c);
    var sg = G.createSG({});
    var tb = TB.createTurbine({ load_target_mwe: MWE_RATED });
    var eng = {
      sys: sys, pz: pz, rx: rx, sg: sg, tb: tb,
      rl: RL.createRelief({}),
      cd: CD.createCondenser({}),
      dc: DC.createDumpCtl({}),
      cv: CV.createCVCS({ boron_ppm: boron0 }),
      ec: EC.createECCS({}),
      aw: AW.createAFW({}),
      fw: FWM.createFeedwater({}),
      dm: DG.createDamage({}),
      pt: PT.createProtection({ blockLowFlux: true }),   /* a plant AT POWER blocks it — #460 */
      brk: null,
      ctm: CT.createContainment({}),
      rated_steam: TB.steamDemand(tb, sg.P, G.SG.h_feed),
      M_nominal: sys.M_total,
      simTime: 0,
      /* command state */
      rodTarget: 200, rodSteps: 200, rodBank: [{ steps: 200, max_steps: 200, worth: 0.08 }],
      cwPumps: true,
      pzDrivers: {},              /* setpoint/manual/stick/block/aux — forwarded each step */
      dcDrivers: {},              /* mode / pressure setpoint */
      advDemand: 0, advBlock: true,
      /* one-step-lag carriers */
      _Qox: 0, _pzRelief: 0, _pzReliefH: 0, _pzr: null, _dcr: null, _lastTrip: false,
      _scramT: null, _manualTrip: false, _rodStopSig: false, _runbackSig: false,
      _rbT: 0, _rbActive: false,
      ins: IN.createInstruments(opts.instruments),
      rh: RD.rhr.createRHR({})
    };
    return eng;
  }

  /* ---- THE ONE DOOR ------------------------------------------------------------------------ */
  function command(eng, name, value) {
    switch (name) {
      case 'load_mwe':       eng.tb.load_target_mwe = Math.max(0, Math.min(MWE_RATED, +value)); break;
      case 'turbine_trip':   eng.tb.tripped = !!value; break;
      case 'rod_target':     eng.rodTarget = Math.max(0, Math.min(200, +value)); break;
      case 'scram':
        /* The pushbutton is an RPS INPUT, not a rod command — the trip latches in
         * pwr2_protection ('manual') and the trip edge below inserts the rods, so a manual
         * scram and an automatic one are the SAME mechanism. Routing it around the RPS was
         * measured (2026-08-19): scrammed stayed false, the turbine kept pulling 100 MWe from
         * a 2 % core, and the -240 F/min cooldown drained the pressurizer into a solver
         * discontinuity at 1724 psia (#499 thread). */
        eng._manualTrip = true; break;
      case 'makeup':         eng.cv.makeupSource = value; break;   /* 'borate'|'dilute'|'match' */
      case 'letdown':        eng.cv.letdownOpen = Math.max(0, Math.min(1, +value)); break;
      case 'pzr_setpoint_mpa':   eng.pzDrivers.setpoint_mpa = +value; break;
      case 'pzr_heaters_manual': eng.pzDrivers.heaters_manual = value === null ? undefined : +value; break;
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
      case 'break_open':
        /* value: {area_m2, node} — one break at a time, the gates' own shape */
        eng.brk = BK.createBreak({ area_m2: value.area_m2, cd: 1.0,
                                   node: value.node || 'cold_leg', open: true });
        break;
      case 'break_close':    if (eng.brk) eng.brk.open = false; break;
      case 'instrument_fail':
        /* value: {id, mode} — mode: stuck | low | high | noisy. Throws on a misspelling,
         * because a failure that silently does nothing reads like a plant surviving it. */
        IN.fail(eng.ins, value.id, value.mode); break;
      case 'instrument_restore':
        /* value: a channel id, or null/true for ALL */
        IN.restore(eng.ins, typeof value === 'string' ? value : null); break;
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

    /* rods: slew toward target; a scram overrides the slew */
    if (eng._scramT !== null) {
      eng._scramT += dt;
      /* MONOTONE-DOWN: min() with the current position, so a second trip edge restarting
       * the ramp can never move the rods OUT (200*(1-t/2) evaluated fresh from t=0 would
       * teleport a partially-withdrawn bank back toward 200). */
      eng.rodSteps = Math.max(0, Math.min(eng.rodSteps, 200 * (1 - eng._scramT / SCRAM_S)));
      if (eng.rodSteps === 0 && eng.rodTarget === 0) eng._scramT = null;
    } else if (eng.rodSteps !== eng.rodTarget) {
      var dS = ROD_SLEW_SPS * dt;
      var move = Math.max(-dS, Math.min(dS, eng.rodTarget - eng.rodSteps));
      /* THE ROD STOP [sourced, ch7 §7.2.3.2.1]: within 3 % of a delta-T trip setpoint,
       * outward motion is refused — inward is always allowed (it HELPS). One step old. */
      if (eng._rodStopSig && move > 0) move = 0;
      eng.rodSteps += move;
    }
    eng.rodBank[0].steps = eng.rodSteps;

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
      cw_pumps_running: eng.cwPumps
    });
    eng._cdAvail = cr.available;
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
      si_active: eng.pt.si
    });
    /* [sourced ch10]: "If both main feedwater pumps fail, the turbine will be tripped" —
     * level, not edge, same as the reactor-trip→turbine wiring; P-9 then decides whether
     * the reactor trips, which is the source's own ">50% of full power" clause. */
    if (fwr.main_feed_lost) eng.tb.tripped = true;
    /* AFW steps BEFORE the SG so its delivery lands in this step's balance — it is the SG's
     * second, COLD feed stream (stepAFW reads only its own state, so the hoist is free).
     * AFW is additive on top of main feed — the "merge, do not displace" rule the module's
     * own header requires of its caller. */
    var awr = AW.stepAFW(eng.aw, dt);
    var sr = G.stepSG(eng.sg, tavg, dt, { feed: fwr.feed_frac * eng.rated_steam, steam: out,
                                          afw_kgs: awr.total_kgs, afw_h: awr.h_kJkg });
    var tr = TB.stepTurbine(eng.tb, dt, { steam_kgs: steam, P_mpa: sr.P_sec,
                                          h_feed: G.SG.h_feed });

    var cvr = CV.stepCVCS(eng.cv, sys, dt);
    var ecr = EC.stepECCS(eng.ec, sys, dt);

    var br = eng.brk ? BK.stepBreak(eng.brk, sys, dt, {}) : null;

    var rrx = R.stepReactor(eng.rx, sys, dt,
      { boron_ppm: cvr.boron_ppm, rodGroups: eng.rodBank, Q_ox_kW: eng._Qox });
    var dr = DG.stepDamage(eng.dm, dt, { cladTemp_c: rrx.T_clad_c, fuelTemp_c: rrx.T_fuel_c });
    eng._Qox = dr.Q_ox_kW;

    var srcs = (cvr.sources || []).slice();
    if (ecr.sources) srcs = srcs.concat(ecr.sources);
    if (br) srcs.push(br.source);
    if (eng._pzRelief > 0) {
      srcs.push({ node: 'hot_leg', mdot: -eng._pzRelief, h: eng._pzReliefH });
    }
    var pr = S.stepPlant(sys, dt, { heats: rrx.heats, sgDuty: sr.duty_kW, sources: srcs });

    var pzr = PZ.stepPressurizer(eng.pz, sys, dt, Object.assign({
      /* HR1 (2026-08-20): the heater/spray/PORV ladder, the level PI and the 17 % low-level
       * cut read the INSTRUMENTS (one step old); the code safeties inside the module read
       * true P regardless — the module's own split note has the why. The level PROGRAM's
       * Tavg is the instrument channel too, same reason. */
      tavg_c: eng.ins.reading.tavg !== undefined ? eng.ins.reading.tavg : tavg,
      indicated_pressure_mpa: eng.ins.reading.primary_pressure,
      indicated_level_pct: eng.ins.reading.pzr_level,
      si_active: eng.pt.si
    }, eng.pzDrivers));
    eng._pzRelief = pzr.relief_kgs;
    eng._pzReliefH = pzr.relief_h;
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
    /* THE CALLER'S HALF of HR5: the RPS reports, the plant acts. */
    if (ptr.reactor_trip && !eng._lastTrip) { eng.rodTarget = 0; eng._scramT = 0; }
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
     * up there via the relief tank; the tank itself is unmodelled, declared) */
    var ctIn = (br ? br.mdot_kgs : 0) + (eng._pzRelief > 0 ? eng._pzRelief : 0);
    var ctH = br && br.mdot_kgs > 0 ? br.source.h : eng._pzReliefH;
    var ctr = CT.stepContainment(eng.ctm, dt,
      ctIn > 0 ? { mdot_kgs: ctIn, h_kJkg: ctH } : { mdot_kgs: 0 });

    eng.simTime += dt;
    eng._pzr = pzr; eng._dcr = dcr;

    /* the RHR exists and is REAL (run_pwr2_rhr, 39 checks) — at power its permissive holds
     * it shut and its duty is 0; an align command is future work (the #458-class refusal
     * belongs with it) */
    var rhrR = RH.stepRHR(eng.rh, sys, dt, {});
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
      tavg_rate_c_per_hr: eng._tavgRate
    });
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
    MWE_RATED: MWE_RATED
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
