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
      !RD.instruments) {
    throw new Error('pwr2_engine: load the full pwr2 stack first (gate order, see any run_pwr2_*)');
  }
  var W = RD.water, S = RD.sources, R = RD.reactor, G = RD.sg, TB = RD.turbine, RL = RD.relief,
      CD = RD.condenser, CV = RD.cvcs, EC = RD.eccs, AW = RD.afw, DG = RD.damage,
      PT = RD.protection, PZ = RD.pressurizer, DC = RD.dumpctl, BK = RD.break_,
      CT = RD.containment, TS = RD.trueState, IN = RD.instruments;

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

  function createEngine(opts) {
    opts = opts || {};
    var pz = PZ.createPressurizer({});
    var sys = S.createPlant({ h: W.h_l(TREF, P0), P: P0, extraMass: PZ.extraMassFn(pz) });
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
      ins: IN.createInstruments(opts.instruments)
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
      case 'afw':            eng.aw.mdafwRunning = !!value; break;
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
        eng._manualTrip = false;   /* releasing the pushbutton is part of the reset */
        break;
      default:
        throw new Error('pwr2_engine: unknown command "' + name + '" — one door, spelled right');
    }
  }

  /* ---- THE STEP ------------------------------------------------------------------------------ */
  function step(eng, dt) {
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
    var sr = G.stepSG(eng.sg, tavg, dt, { feed: out, steam: out });
    var tr = TB.stepTurbine(eng.tb, dt, { steam_kgs: steam, P_mpa: sr.P_sec,
                                          h_feed: G.SG.h_feed });

    var cvr = CV.stepCVCS(eng.cv, sys, dt);
    var ecr = EC.stepECCS(eng.ec, sys, dt);
    var awr = AW.stepAFW(eng.aw, dt);

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
      pzr_level_frac: (rd.pzr_level !== undefined ? rd.pzr_level : 100 * pzr.level_frac) / 100,
      manual_trip: eng._manualTrip,
      /* P-9's inputs [sourced, TS Bases B 3.3.1]: the turbine's own tripped flag, and dump
       * availability = the condenser's (the dumps are condenser dumps; C-9 is the same fact
       * on the control side). One-step lag on cr, the house convention. */
      turbine_tripped: eng.tb.tripped,
      steam_dumps_available: eng._cdAvail !== false,
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

    /* containment receives the break AND the pressurizer relief (PORV/safety discharge ends
     * up there via the relief tank; the tank itself is unmodelled, declared) */
    var ctIn = (br ? br.mdot_kgs : 0) + (eng._pzRelief > 0 ? eng._pzRelief : 0);
    var ctH = br && br.mdot_kgs > 0 ? br.source.h : eng._pzReliefH;
    var ctr = CT.stepContainment(eng.ctm, dt,
      ctIn > 0 ? { mdot_kgs: ctIn, h_kJkg: ctH } : { mdot_kgs: 0 });

    eng.simTime += dt;
    eng._pzr = pzr; eng._dcr = dcr;

    var ts = TS.buildTrueState({
      sys: sys, reactor: rrx, sg: sr, turbine: tr, relief: rr, cvcs: cvr,
      rhr: {}, break_: br || {}, containment: ctr, condenser: cr,
      eccs: ecr, afw: awr, damage: dr, protection: ptr, pressurizer: pzr,
      boron_ppm: cvr.boron_ppm, rated_steam_kgs: eng.rated_steam,
      mdot_rated: 1630, natcirc_frac: 0.15, M_nominal: eng.M_nominal
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
    /* the instruments read THIS step's truth; every consumer sees them NEXT step */
    IN.stepInstruments(eng.ins, dt, ts);
    return ts;
  }

  root.RD.pwr2.engine = {
    createEngine: createEngine,
    command: command,
    step: step,
    MWE_RATED: MWE_RATED
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
