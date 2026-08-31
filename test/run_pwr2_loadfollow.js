/* run_pwr2_loadfollow.js — THE ACCEPTANCE TEST. (#479)
 *
 * This is the bar the whole port was aimed at: Tier A coupling A1 — "power follows load" — with
 * the rods in MANUAL, driven entirely by temperature feedback. Nothing tells the reactor what
 * power to make. Steam demand falls, secondary pressure rises, primary temperature rises, and the
 * negative moderator and Doppler coefficients push power down until it matches the new demand.
 *
 * Every other pwr2 gate tests a piece. This one tests whether the pieces make a PLANT.
 *
 * ---------------------------------------------------------------------------------------
 * THE COMPARISON POINT IS THE CURRENT ENGINE AS IT IS TODAY, and which reference applies depends
 * entirely on the LINEUP. That is the lesson of #484, and it cost a retracted claim to learn.
 *
 *   MEASURED 2026-08-16, both plants, 100 -> 60 MWe, rods MANUAL, dump modulating on pressure:
 *
 *                        current engine      PWR2
 *       Tavg                593.0 degF     592.95 degF     <- 0.05 degF
 *       dump position        14.7 %         15.00 %        <- 0.3 points
 *       power                76.8 %         73.74 %        <- 3.1 points
 *       safety valves        shut           shut
 *
 * ⚠ THE PRE-#460 CURRICULUM FIGURE (57.5 %, 602.1 degF) IS RECORDED AND NOT ASSERTED. It was
 * measured with rods in AUTO: the controller walks Tavg back to program, secondary pressure falls,
 * the dump reseats. PWR2 has no rod controller and cannot get there.
 *
 * AN EARLIER VERSION OF THIS GATE DID MATCH IT, TO 0.4 POINTS — and that agreement depended on
 * PWR2 having no SAFETY VALVES. Once pwr2_relief.js modelled them they lift on the pressure
 * excursion and the closed-relief answer moved 57.9 -> 70.7 %. The check was passing for a reason
 * that had nothing to do with the mechanism it claimed to test, which is exactly what HR10 names.
 * D4 section 23 carries the full account.
 *
 * PWR2 is a from-scratch reformulation whose moderator coefficient reads real Layer 0 density
 * (-23.4 pcm/degC against -26.8) and whose fuel rise is derived rather than tuned (379.7 degC
 * against 389, from a gap conductance solved against a sourced Doppler defect). The two are NOT
 * expected to agree exactly, and a check forcing them to would be fitting PWR2 to the plant it was
 * built to replace.
 *
 * ⚠ READ AT t + 150 s, AND THE PLANT IS STILL MOVING THERE. The thermal transient settles in 60 s;
 * xenon runs for hours. 150 s is a DECLARED SAMPLE POINT, not an equilibrium — D4 section 20.6 on
 * why an untimed (power, Tavg) pair under-specifies A1.
 *
 * ---------------------------------------------------------------------------------------
 * ⚠ THE BORON TRIM MUST USE THE FUEL TEMPERATURE. `criticalBoron` defaults the fuel to the
 * moderator temperature, which is the ZERO-POWER case. Omitting it at rated is a 693 pcm error,
 * and it fails SILENTLY: the plant starts subcritical, dips to 43 %, buys the reactivity back by
 * cooling 16 degC, and settles stable and self-consistent at a Tavg 29 degF below design. Every
 * absolute temperature in this file would have been wrong with nothing red. See D1 and the note
 * in pwr2_kinetics.js.
 *
 * Run: node test/run_pwr2_loadfollow.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
/* THE MUTATION TARGET IS THE STEAM GENERATOR. The reactivity loop itself is covered by
 * run_pwr2_reactor; what is NEW in this configuration is the SG standing between steam demand and
 * primary temperature, so that is the file whose breakage this gate must be able to see. */
var LIB = path.join(E, 'pwr2_sg.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_sources',
 'pwr2_kinetics', 'pwr2_fuel', 'pwr2_reactor', 'pwr2_turbine', 'pwr2_relief',
 'pwr2_condenser', 'pwr2_pressurizer', 'pwr2_dumpctl'
].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, W = RD.water, S = RD.sources, K = RD.kinetics, R = RD.reactor,
    TB = RD.turbine, RL = RD.relief, CD = RD.condenser, FU = RD.fuel, PZ = RD.pressurizer,
    DC = RD.dumpctl;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: RD.water, vtable: RD.vtable, core: RD.core,
                             geometry: RD.geometry, loop: RD.loop, sources: RD.sources } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.sg;';
  return new Function('RD_ROOT', body)(root);
}

/* THE CURRENT ENGINE'S A1, RETYPED from CURRICULUM.md — comparison points, not targets. */
/* TWO reference points, and which one applies depends on the LINEUP -- that is the whole lesson
 * of #484 and of section 23 below.
 *   A1_NOW    the current engine MEASURED 2026-08-16, rods MANUAL, dump modulating: the state
 *             this plant is actually in today, and the only one PWR2 can be compared against
 *             without a rod controller.
 *   A1_DOC    CURRICULUM.md's pre-#460 figure, measured with rods in AUTO. Reproducing it needs
 *             rod control to walk Tavg back to program so the dump reseats -- PWR2 has no rod
 *             controller, so it is recorded here and NOT asserted. */
var A1_NOW = { power_to: 76.81, tavg_to_f: 593.00, dump_frac: 0.1475, sgP: 7.067 };
var A1_DOC = { power_to: 57.5, tavg_from_f: 579.3, tavg_to_f: 602.1 };
var A1 = A1_DOC;
/* The current engine's steady-state dump law, RETYPED from pwr_config: proportional across a band
 * above the Ginna 1005 psig no-load pressure. Commanding a dump position is control-layer work by
 * owner ruling and PWR2 has no control layer, so this gate stands in for one -- declared here
 * rather than smuggled into the engine. */
var DUMP_SP = 7.03, DUMP_BAND = 0.25, DUMP_MAX = 0.28;
/* ⚠ THE PROPORTIONAL TERM IS THE FLOW FRACTION, NOT A VALVE POSITION, and getting that backwards
 * cost a published false agreement. pwr_steam_generator.js:210 computes
 *     dump = clip((P - setpoint) / band, 0, 1)      then      dump = min(dump, steam_dump_max)
 * so the proportional output IS the share of RATED STEAM FLOW, and 0.28 CAPS it. The first version
 * here read it as a valve position and multiplied by 0.28 instead -- which is 3.57x shallower below
 * the cap, so the two plants settled at different secondary pressures and then agreed on dump
 * position (15.00 vs 14.75 %) BY COINCIDENCE at those different pressures.
 *
 * pwr2_relief takes a demand as a share of CAPACITY, hence the divide. With this corrected the
 * secondary pressures agree to 0.004 MPa (7.071 vs 7.067) and the power gap halves, 3.1 -> 1.7. */
/* ⚠ RETIRED 2026-08-19 — kept as the RECORD the A1_NOW literals were measured under. The ride
 * now uses pwr2_dumpctl (the sourced controller, ruled §42 criterion A); this function is dead
 * code by design and the `dumpLaw` ride parameter is ignored. */
function dumpLaw(P) {
  var d = (P - DUMP_SP) / DUMP_BAND;
  d = d < 0 ? 0 : (d > 1 ? 1 : d);
  return Math.min(d / DUMP_MAX, 1);
}
var TREF = 304.5, P0 = 15.41, RATED = 300000, MWE_RATED = 100.0, MWE_CUT = 60.0;
function degF(c) { return c * 9 / 5 + 32; }

function runSuite(G, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(56) +
      'got ' + got.toFixed(2) + ' want ' + want.toFixed(2) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }

  /* COST, budgeted as each check was written (D1 §31). MEASURED: 3 600 s of plant costs 70 s of
   * wall clock. The A1 transient SETTLES IN 60 SECONDS — the slow crawl after that is xenon
   * burning out, which is A7 and not this gate's subject — so the ride is 90 s of baseline plus
   * 150 s after the cut, and the whole suite runs in ~5 s. Choosing the horizon from what the
   * CHECK needs rather than from what looks thorough is the whole of the cost discipline. */
  var BASE = quiet ? 3000 : 4500;      /* 60 s vs 90 s */
  var AFTER = quiet ? 4000 : 7500;     /* 80 s vs 150 s */

  function plant() {
    /* THE PLANT HAS A PRESSURIZER NOW (pwr2_pressurizer.js, owner ruling 2026-08-18 "Option 1")
     * — the fixture defect this block spent two days documenting (#486) is repaired at its
     * cause, not re-banded around. */
    var pz  = PZ.createPressurizer({});
    var sys = S.createPlant({ h: W.h_l(TREF, P0), P: P0, extraMass: PZ.extraMassFn(pz) });
    var rx  = R.createReactor({ P: 1.0, coolTemp_c: TREF });
    var sg  = G.createSG({});
    var tb  = TB.createTurbine({ load_target_mwe: MWE_RATED });
    var rl  = RL.createRelief({});
    var cd  = CD.createCondenser({});
    /* SEE THE HEADER: the fuel temperature is REQUIRED here, not optional. */
    var B   = K.criticalBoron(rx.kin, TREF, P0, null, rx.kin.X / rx.kin.X_eq_full, rx.fuel.T_fuel_c);
    return { sys: sys, rx: rx, sg: sg, tb: tb, rl: rl, cd: cd, B: B, pz: pz,
             dc: DC.createDumpCtl({}),
             /* the DESIGN pressure, not this harness's own sg.P (#539) — rated_steam is
              * frozen on both of steamDemand's axes in pwr2_engine, and a local harness that
              * kept the old convention would go on certifying against a scale the plant no
              * longer has. */
             rated_steam: TB.steamDemand(tb, G.createSG({}).P, G.SG.h_feed) };
  }
  /* ⚠ THE DEMAND IS IN MEGAWATTS ELECTRICAL, and that is the whole point of this revision.
   *
   * This gate used to cut steam MASS FLOW to a fraction of rated, and compare the result against
   * CURRICULUM.md's A1 — which cuts ELECTRICAL DEMAND. Those are different experiments, and the
   * near-agreement of "57.5 %" with a steam-fraction result was a coincidence of two
   * similar-looking percentages (D4 §20.7, where the quantitative claim was withdrawn). With
   * pwr2_turbine.js the two engines can finally be handed the SAME command. */
  function ride(pl, n, demandOf, dumpLaw, cwOn) {
    var r = null, sr = null, tr = null, t = 0, pzr = null, dcr = null;
    for (var i = 0; i < n; i++) {
      if (demandOf) pl.tb.load_target_mwe = demandOf(t);
      /* The turbine asks for the flow its load needs AT THE CURRENT SECONDARY PRESSURE; the SG
       * delivers it; the turbine's output is then read off what was actually admitted. */
      var steam = TB.steamDemand(pl.tb, pl.sg.P, G.SG.h_feed);
      /* RELIEF. `dumpLaw` is supplied by the CALLER because commanding a dump position is a
       * control-layer decision by owner ruling, and PWR2 has no control layer yet — so this gate
       * stands in for one, declared rather than smuggled. The law retyped here is the current
       * engine's steady-state form (pwr_config: setpoint 7.03 MPa = Ginna 1005 psig no-load,
       * band 0.25, max 0.28), so the two plants are given the same dump behaviour and not just
       * the same command. */
      /* THE CONDENSER GATES THE DUMP. Availability is no longer a boolean somebody asserts: it
       * comes from a computed backpressure, so losing circulating water removes the dump path the
       * way it does in a real plant. `cwOn` is the caller's, because tripping a pump is an
       * operator action and not something this layer decides. */
      var cr = CD.stepCondenser(pl.cd, 0.02, {
        duty_kW: steam * (W.h_g(pl.sg.P) - G.SG.h_feed) * (1 - TB.etaCycle()),
        cw_pumps_running: cwOn === undefined ? true : cwOn
      });
      /* ⚠ THE STAND-IN LAW IS GONE (2026-08-19): pwr2_dumpctl computes the demand now — the
       * sourced Tavg-mode controller with C-7/C-8/C-9 arming, built against the RULED §42
       * criterion A. The old retyped current-engine pressure law is what this gate carried
       * "because PWR2 has no control layer yet"; it has this much of one. */
      var dcr = DC.stepDumpCtl(pl.dc, 0.02, {
        tavg_c: G.primaryTavg(pl.sys),
        load_frac: pl.tb.tripped ? 0 : pl.tb.load_target_mwe / MWE_RATED,
        turbine_tripped: pl.tb.tripped,
        condenser_available: cr.available
      });
      var rr = RL.stepRelief(pl.rl, pl.sg.P, 0.02, {
        rated_steam_kgs: pl.rated_steam,
        dump_demand: dcr.dump_demand,
        condenser_available: cr.available
      });
      var out = steam + rr.total_kgs;
      sr = G.stepSG(pl.sg, G.primaryTavg(pl.sys), 0.02, { feed: out, steam: out });
      tr = TB.stepTurbine(pl.tb, 0.02, { steam_kgs: steam, P_mpa: sr.P_sec, h_feed: G.SG.h_feed });
      r  = R.stepReactor(pl.rx, pl.sys, 0.02, { boron_ppm: pl.B, rodGroups: pl.rods || null });
      S.stepPlant(pl.sys, 0.02, { heats: r.heats, sgDuty: sr.duty_kW });
      pzr = PZ.stepPressurizer(pl.pz, pl.sys, 0.02, {});
      t += 0.02;
    }
    /* CORE-NODE SUBCOOLING, so the BASELINE block can assert the condition it never checked.
     * The core node, not the leg average: it is the one the heat goes into and the first to
     * reach saturation. */
    var cn = null;
    for (var q = 0; q < pl.sys.nodes.length; q++) {
      if (pl.sys.nodes[q].id === 'core') { cn = pl.sys.nodes[q]; break; }
    }
    return { power: r.power_pct, tavg_c: G.primaryTavg(pl.sys), tavg_f: degF(G.primaryTavg(pl.sys)),
             subcool_c: W.T_sat(pl.sys.P) - W.T_from_h(cn.h, pl.sys.P),
             coreX: W.quality(cn.h, pl.sys.P), Pprim: pl.sys.P,
             coreHeatPct: r.core_heat_pct, coolTemp_c: r.coolTemp_c,
             sgP: sr.P_sec, duty: sr.duty_kW, fuel: r.T_fuel_c, rho: r.rho_pcm,
             mwe: tr.mwe_output, deficit: tr.deficit_mwe, steam: tr.steam_kgs,
             dumpFrac: rr.dump_kgs / pl.rated_steam, safetyOpen: rr.safety_open,
             backpressure: cr.backpressure_in_hg, condAvail: cr.available,
             pzrLevel: pzr ? pzr.level_pct : null, pzrErr: pzr ? pzr.err_psi : null,
             dumpC7: dcr.c7, dumpArmed: dcr.armed, safetyFrac: rr.safety_kgs / pl.rated_steam,
             trefC: dcr.tref_c };
  }

  /* ---- THE BASELINE, AND IT IS NOT THE DESIGN POINT -----------------------------------------
   *
   * ⚠ THIS BLOCK'S HEADING USED TO READ "THE PLANT IS AT ITS DESIGN POINT BEFORE ANYTHING IS
   * ASKED OF IT", and the plant has never been at its design point. The block checked Tavg,
   * secondary pressure and net reactivity — and never checked PRIMARY PRESSURE or SUBCOOLING,
   * which is where the departure is.
   *
   * MEASURED 2026-08-17, with the new void term disabled so the plant as it stood before today
   * is reproduced exactly:
   *
   *                        before today      with void feedback     design
   *       primary P        11.096 MPa          8.828 MPa           15.41 MPa
   *       core subcooling     0.0 degC          0.0 degC           ~30 degC
   *       core quality       0.0032            0.0152              0
   *       Tavg              577.98 degF       548.99 degF
   *
   * The baseline plant sits AT SATURATION at rated power in both. It always did. It passed a
   * 579.30 degF Tavg check because a depressurised plant happened to land near that number, not
   * because it was at design conditions — the check and the condition were independent.
   *
   * THE CAUSE IS THE FIXTURE. `S.createPlant` is a rigid loop with no pressure control, so it
   * depressurises to wherever its own energy balance puts it. The pressurizer that would hold
   * 15.41 MPa is issue #472's active work on the workbench lane and must not be built here.
   *
   * ⚠ AND THE HEADING'S CLAIM — "if the starting plant is not at its design point, nothing after
   * this means anything" — IS REFUTED BY MEASUREMENT. It is not at its design point, and A1 after
   * it is unchanged to 0.04 degF and still matches the current engine (71.1 % / 594.8 degF, both
   * plants, identical dump fraction). The reason is that the load cut REPRESSURISES the primary
   * to 18 MPa and the core goes subcooled — 32.7 degC of it — so the A1 sample is taken on a
   * subcooled plant whatever the baseline did. The A1 checks below are untouched. */
  head('BASELINE  [what the starting plant ACTUALLY is — it is not the design point]');
  var pl = plant();
  var base = ride(pl, BASE);
  ck('the steam generator is sized for its design duty at the design Tavg',
     G.ratedU() * G.createSG({}).area * (TREF - W.T_sat(G.createSG({}).P)) / 1000, 300, 3, 'MW');
  ckT('the plant holds full power', base.power > 95 && base.power < 105,
      base.power.toFixed(2) + ' %');
  /* ⚠ TURNED AROUND 2026-08-18 — this check used to pin the DEFECT: "NOT at its design
   * pressure, and the core is AT SATURATION — no pressurizer (#472)", measured at 11.096 MPa
   * with 0.0 degC subcooling on the rigid loop. pwr2_pressurizer.js now holds the plant (owner
   * ruling "Option 1"), so the check guards the REPAIR, on the same mechanism-not-number
   * principle: NEAR design pressure and genuinely SUBCOOLED. The sample rides past the
   * fixture's startup transient (the boron-trim settle outsurges ~1 m3 and the heaters
   * recover at ~0.33 psi/s — measured, 2140 -> 2218 psia over 50 -> 300 s), because a
   * design-point claim sampled mid-recovery asserts the transient, not the point. */
  var settled = ride(pl, quiet ? 3000 : 16500);
  ckT('...AT ITS DESIGN PRESSURE, core SUBCOOLED — the #486 fixture defect, repaired at cause',
      settled.Pprim > 14.7 && settled.subcool_c > 15,
      'primary ' + (settled.Pprim * 145.04).toFixed(0) + ' psia (' + settled.Pprim.toFixed(3) +
      ' MPa) vs design ' + (P0 * 145.04).toFixed(0) + ', core subcooling ' +
      (settled.subcool_c * 1.8).toFixed(1) + ' degF — the rigid loop read 11.096 MPa at ' +
      'SATURATION here, 490 psi below its own low-pressure reactor trip');
  /* ⚠ RE-BANDED FROM 5 TO 15 pcm, AND THE NUMBER IS THE FILE'S OWN, not one chosen to pass.
   * The A1 block below already uses `Math.abs(cut.rho) < 15` for exactly this claim — "it found
   * an equilibrium, it did not merely drift". The baseline is the weaker case of the two: it is
   * still converging at the sample point (20.6 pcm at 60 s, 8.5 at 90 s), because the pressure
   * the plant is settling toward moves as it cools. Using a tighter band here than for the
   * post-cut equilibrium was asserting more of the baseline than of the result. */
  ckT('...and critical to well inside a dollar, on the same band A1 uses for this claim',
      Math.abs(base.rho) < 15, base.rho.toFixed(2) + ' pcm, still converging at the sample point');
  ckT('...with the secondary BELOW its nominal pressure, which follows from the primary',
      base.sgP < G.createSG({}).P,
      base.sgP.toFixed(3) + ' MPa against a nominal ' + G.createSG({}).P.toFixed(3) +
      ' — a plant that cannot hold primary pressure cannot make design steam pressure');

  /* ---- A1 ---------------------------------------------------------------------------------- */
  head('A1 -- POWER FOLLOWS LOAD  [rods in MANUAL: nothing moves them, and nothing sets power]');
  var pl2 = plant();
  /* ⚠ THE BEFORE-AND-AFTER MUST BE THE SAME PLANT, and it was not. `base` above comes from `pl`,
   * ridden WITHOUT the dump law; every "X -> Y" claim below then compared one plant's baseline
   * against a DIFFERENT plant's post-cut state. The two baselines differ because the dump law
   * changes the secondary the primary is working against, and the error grew as soon as anything
   * moved the baseline — the fuel-drop check reads 88.9 degC on the continuous plant against
   * 73.9 degC across the two, which is the difference between passing and failing its 80 degC
   * threshold. A delta measured across two plants is not a delta.
   *
   * Capturing pl2's OWN pre-cut state costs one extra ride and makes every link below a real
   * before-and-after. MEASURED on both plants, it needed NO band changed: the fuel drop is
   * 110.0 degC before today's void term and 88.9 degC after, and the threshold stays at 80. */
  var pre = ride(pl2, BASE, null, dumpLaw);
  var cut = ride(pl2, AFTER, function () { return MWE_CUT; }, dumpLaw);
  /* THE CHAIN, LINK BY LINK. Asserting only the endpoint would pass for a plant that got there
   * by some other route, and the point of this gate is the MECHANISM. */
  ckT('cutting steam demand RAISES secondary pressure', cut.sgP > pre.sgP * 1.15,
      pre.sgP.toFixed(3) + ' -> ' + cut.sgP.toFixed(3) + ' MPa — less steam drawn, so it backs up');
  /* ⚠ BANDS RE-SIZED 2026-08-19 when the REAL dump controller replaced the stand-in law: a
   * 40 % cut is a load REJECTION, C-7 arms, and the sourced Tavg-mode dump absorbs what the
   * old pressure law did not — the Tavg excursion halves (+8.6 degF measured, was +15) and
   * the power drop shallows (14.3 points, was 22.6). The widened bands hold on BOTH plants
   * (both-sides rule): the stand-in-law build clears +5/-10 by miles. */
  ckT('...which RAISES primary Tavg', cut.tavg_f > pre.tavg_f + 5,
      pre.tavg_f.toFixed(2) + ' -> ' + cut.tavg_f.toFixed(2) + ' degF — a hotter sink removes less');
  ckT('...which LOWERS power, with no rod motion at all', cut.power < pre.power - 10,
      pre.power.toFixed(2) + ' -> ' + cut.power.toFixed(2) + ' % on temperature feedback alone');
  /* ⚠ THIS WAS A DELTA AND THE DELTA IS CONTAMINATED BY THE BASELINE. It asserted a drop of at
   * least 80 degC. MEASURED across the void-feedback change, on the same continuous plant:
   *
   *                    before today    after
   *       pre.fuel       698.5 degC    677.2 degC     <- the BASELINE moved (it is depressurised)
   *       cut.fuel       603.8 degC    603.3 degC     <- the RESULT did not, 0.5 degC apart
   *       drop            94.7 degC     73.9 degC     <- so the delta moved 21 degC
   *
   * The Doppler half of the feedback is unchanged; the number the check happened to be built on
   * was the baseline artifact. Re-banding 80 down to 60 would have been fitting the check to
   * whichever plant it was last run against — the thing this file's own header calls out about
   * the safety valves.
   *
   * SO IT IS RE-POINTED TO AN IDENTITY, which the baseline cannot contaminate: at the post-cut
   * state the fuel must sit where its OWN steady solve puts it for the core heat and coolant
   * temperature actually present. `steadyFuelTemp` is the function `pwr2_reactor` initialises
   * against, so this closes the loop on the model rather than on a remembered number, and it
   * holds on both plants. The DIRECTION — the fuel cools when power falls — is kept separately,
   * because an identity alone would be satisfied by a plant that never moved. */
  ckT('...and the fuel cools with it, which is the Doppler half of the feedback',
      cut.fuel < pre.fuel - 40,
      pre.fuel.toFixed(1) + ' -> ' + cut.fuel.toFixed(1) + ' degC, on ONE continuous plant');
  var fuelExpect = FU.steadyFuelTemp(FU.deriveGeometry(),
                                     RATED * cut.coreHeatPct / 100, cut.coolTemp_c);
  ck('...and it lands where its OWN steady solve puts it at the new power — an identity',
     cut.fuel, fuelExpect, 6.0, 'degC');
  ckT('...and the plant is CRITICAL again at the new power', Math.abs(cut.rho) < 15,
      cut.rho.toFixed(2) + ' pcm — it found an equilibrium, it did not merely drift');

  /* ---- ⚠ THE THREE "LANDS WHERE THE CURRENT ENGINE LANDS" COMPARISONS ARE RETIRED
   * (2026-08-19), and the reason is a RULING, not drift: A1_NOW was measured with BOTH plants
   * riding the same stand-in pressure law. PWR2 now carries the sourced dump controller the
   * ruled §42 criterion A demanded, and the current engine does not — the comparison's premise
   * (same dump behaviour, compare the plants) expired the moment the controller landed. The
   * A1_NOW literals stay above as the RECORD of what the stand-in produced. What replaces the
   * comparison is PWR2's own sourced behaviour: the armed dump holds the excursion NEAR TREF
   * rather than letting Tavg ride the old law's pressure band. */
  ckT('the ARMED dump holds Tavg within its own control authority of Tref',
      cut.tavg_f - (cut.trefC * 1.8 + 32) < 16.4 + 2,
      'Tavg-Tref ' + (cut.tavg_f - (cut.trefC * 1.8 + 32)).toFixed(1) + ' degF against the ' +
      '16.4 degF full-output point — the controller saturates before the plant runs away');
  ckT('...C-7 is ARMED, which a 40 % rejection must do',
      cut.dumpC7 === true && cut.dumpFrac > 0.05,
      'dump ' + (100 * cut.dumpFrac).toFixed(1) + ' % of rated steam');
  ckT('the safety valves stay SHUT, as they do on the current engine', cut.safetyOpen === false,
      'a dump doing its job keeps the secondary off the safeties — if they lift, the dump is ' +
      'either undersized or not being commanded');
  /* ---- ⚠ THE PRE-#460 CURRICULUM FIGURE IS NOT ASSERTED, AND THE REASON IS THE POINT.
   *
   * It records 57.5 % / 602.1 degF, measured when the shipped lineup had rods in AUTO: the
   * controller walks Tavg back to program, secondary pressure falls, and the dump reseats. PWR2
   * has NO ROD CONTROLLER, so it cannot get there.
   *
   * An earlier version of this gate DID match it, to 0.4 points — and that agreement turned out
   * to depend on PWR2 having no SAFETY VALVES either. Once pwr2_relief.js modelled them they lift
   * on the pressure excursion and the closed-relief answer moved 57.9 -> 70.7 %. The agreement was
   * an artifact of a missing model, which is exactly the failure HR10 names: a check can pass for
   * a reason that has nothing to do with the mechanism it claims to test. Recorded in D4 §23. */
  ckT('...and the plant is NOWHERE NEAR the pre-#460 figure, which needs rod control',
      Math.abs(cut.power - A1_DOC.power_to) > 8,
      'measured ' + cut.power.toFixed(2) + ' % against the pre-#460 ' + A1_DOC.power_to +
      ' % — asserting that number here would be asserting the absence of a rod controller');
  /* ⚠ THE DUTY IS NOT THE ELECTRICAL DEMAND, and this check used to assert it was. With a relief
   * path open the steam generator is unloading to the TURBINE AND THE DUMP, so its duty is the
   * sum. That is the whole mechanism behind #484's 76.8 % — the reactor matches total steam out,
   * not the load. What must still hold is that the TURBINE's share follows the demand. */
  ckT('turbine steam follows the ELECTRICAL demand, and the duty is turbine PLUS relief',
      Math.abs(cut.mwe - MWE_CUT) < 0.5 &&
      cut.duty / RATED > MWE_CUT / MWE_RATED + 0.05,
      'turbine ' + cut.mwe.toFixed(1) + ' MWe of a ' + MWE_CUT + ' MWe ask, while SG duty is ' +
      (cut.duty / 1000).toFixed(1) + ' MW = ' + (cut.duty / RATED * 100).toFixed(1) +
      ' % of rated — the difference is the dump at ' + (cut.dumpFrac * 100).toFixed(1) + ' %');

  /* ---- REVERSIBILITY ------------------------------------------------------------------------ */
  head('REVERSIBILITY  [a coupling that only works downward is a leak, not a feedback]');
  var pl3 = plant();
  ride(pl3, BASE);
  ride(pl3, AFTER, function () { return MWE_CUT; });
  var restored = ride(pl3, AFTER, function () { return MWE_RATED; });
  /* bands re-sized with the armed dump's halved excursion (see the A1 note); both plants clear */
  ckT('restoring demand brings power back up', restored.power > cut.power + 10,
      cut.power.toFixed(2) + ' -> ' + restored.power.toFixed(2) + ' %');
  ckT('...and Tavg back down', restored.tavg_f < cut.tavg_f - 5,
      cut.tavg_f.toFixed(2) + ' -> ' + restored.tavg_f.toFixed(2) + ' degF');
  ckT('...to near where it started, without anybody resetting anything',
      Math.abs(restored.power - base.power) < 6 && Math.abs(restored.tavg_f - base.tavg_f) < 6,
      'power ' + restored.power.toFixed(2) + ' % vs ' + base.power.toFixed(2) +
      ', Tavg ' + restored.tavg_f.toFixed(2) + ' vs ' + base.tavg_f.toFixed(2) + ' degF');

  /* ---- LOSS OF THE CONDENSER: THE RELIEF LADDER, DRIVEN BY A PHYSICAL CAUSE ----------------
   * Until pwr2_condenser.js existed, `condenser_available` was a boolean a scenario asserted, so
   * the dump could only be taken away by fiat. Now the vacuum is computed, and losing circulating
   * water removes the dump because the backpressure says so. This is the chain end to end. */
  head('LOSS OF CIRCULATING WATER  [the dump is removed by PHYSICS, not by a flag]');
  var plC = plant();
  ride(plC, BASE, null, dumpLaw);
  var withCw = ride(plC, AFTER, function () { return MWE_CUT; }, dumpLaw);
  var noCw   = ride(plC, AFTER, function () { return MWE_CUT; }, dumpLaw, false);
  ckT('with circulating water the condenser holds a vacuum and the dump is passing steam',
      withCw.backpressure < 5 && withCw.condAvail === true && withCw.dumpFrac > 0.05,
      withCw.backpressure.toFixed(2) + ' in Hg, dump ' + (withCw.dumpFrac * 100).toFixed(1) + ' %');
  ckT('losing the pumps destroys the vacuum', noCw.backpressure > 20 && noCw.condAvail === false,
      withCw.backpressure.toFixed(2) + ' -> ' + noCw.backpressure.toFixed(1) + ' in Hg');
  ckT('...which SHUTS THE DUMP, with nobody commanding it shut', noCw.dumpFrac < 1e-9,
      'the controller is still armed and asking; C-9 (the condenser) is what stops it');
  ckT('...and the secondary climbs onto the SAFETY VALVES instead',
      noCw.safetyOpen === true && noCw.sgP > withCw.sgP,
      withCw.sgP.toFixed(3) + ' -> ' + noCw.sgP.toFixed(3) + ' MPa, safeties LIFTED — dump to ADV ' +
      'to safeties is the ladder #484 measured on the current engine, now reachable here');

  /* ---- §42 CRITERION A — THE RULED ACCEPTANCE (OWNER RULING, 2026-08-19: "Defer. A.") ------
   * "Load-following is continuous with rods in MANUAL — reactor power is monotone in load
   * target over the dispatch range, with no plateau wider than the measurement noise." Met FOR
   * THE SOURCED REASON: dispatch-rate moves never satisfy C-7, so the dumps stay SHUT and
   * cannot become the hidden parallel sink that pinned the old engine at 76 % over a 15 MWe
   * span (#489). MEASURED on the 8 % dispatch schedule (loud mode): 99.5 / 91.3 / 83.1 / 74.9 %
   * at 100 / 92 / 84 / 76 MWe with dump 0.0 % throughout — 1:1 tracking on temperature
   * feedback alone. BELOW ~70 MWe the SG CODE SAFETIES lift (measured: 3.7 -> 26.1 % of rated
   * steam, 1066 -> 1079 psia) and become the visible ceiling: with the rods parked, the
   * secondary rides its own relief envelope, which is what a real PWR does when nobody inserts
   * rods — the flattening has a nameable, alarm-carrying cause, unlike the old engine's
   * unobservable equilibrium. (An ADV between dump and safeties is a known missing rung;
   * with one, this steam would pass the ADV instead.) */
  head('§42 CRITERION A  [dispatch moves never arm the dumps; power follows load 1:1]');
  var plA = plant();
  ride(plA, BASE);
  var swSteps = quiet ? [100, 84, 68] : [100, 92, 84, 76, 68];
  var swSettle = quiet ? 2400 : 15000;                    /* 48 s vs 300 s per point */
  var swPrev = null, swMono = true, swArmed = false, swTrack = true, last = null;
  swSteps.forEach(function (mwe) {
    last = ride(plA, swSettle, function () { return mwe; });
    if (swPrev !== null && last.power > swPrev + 0.3) swMono = false;
    if (last.dumpC7 || last.dumpFrac > 1e-9) swArmed = true;
    /* 1:1 tracking claim only where the safeties are shut (>= 76 MWe loud) */
    if (mwe >= 76 && Math.abs(last.power - mwe) > 4) swTrack = false;
    swPrev = last.power;
  });
  ckT('C-7 NEVER ARMS on the dispatch schedule — the dumps stay shut by their own interlock',
      swArmed === false, "the ruled criterion's mechanism: no arming event, no parallel sink");
  ckT('...and reactor power is MONOTONE in load target, rods in MANUAL',
      swMono === true, 'the #489 inversion (76.3 -> 88.4 % on a load DECREASE) cannot happen ' +
      'with the dump shut');
  ckT('...tracking 1:1 while the secondary is off its relief envelope',
      swTrack === true, "measured 99.5/91.3/83.1/74.9 % at 100/92/84/76 MWe — below ~70 MWe " +
      "the relief envelope caps Tavg VISIBLY: the ADV takes the overflow first (3.2 % alone " +
      "at 68 MWe, safeties SHUT) and the code safeties only what exceeds its capacity");

  /* THE DUMP'S REAL JOB, both sourced cases, same plant machinery: */
  head("THE DUMP'S REAL JOB  [a 50 % rejection and a turbine trip — C-7 and C-8]");
  var plR = plant();
  ride(plR, BASE);
  var rej = ride(plR, quiet ? 2400 : 9000, function () { return 50; });
  ckT('a 50 % rejection ARMS C-7 and the dump carries the excess — SG safeties stay SHUT',
      rej.dumpC7 === true && rej.dumpFrac > 0.2 && rej.safetyOpen === false,
      'dump ' + (100 * rej.dumpFrac).toFixed(1) + ' % of rated steam, safeties shut — ' +
      '"50% loss of load is accommodated by the steam dump capacity" (WTSM 11.2), here on ' +
      "Ginna's 28 % valves with the moderator carrying the rest");
  var plT = plant();
  ride(plT, BASE);
  plT.tb.tripped = true;
  /* SCRAMMED WITH THE TRIP, as the real plant is (the turbine-trip reactor trip above P-9 —
   * not yet in pwr2_protection, so the fixture plays the operator). An UNTRIPPED reactor
   * against a 28 % dump is the ATWS shape: measured, the plant self-limits HOT at 595.7 degF
   * with the dump saturated — physical, and not this check's subject. */
  plT.rods = [{ steps: 0, max_steps: 228, worth: 0.04068 }];
  /* sampled EARLY (5 s): the scrammed plant sheds its stored energy fast and the demand is
   * gone within ~30 s -- the arming/selection claim needs the window, not the aftermath */
  var trip1 = ride(plT, 250);
  ckT('a turbine trip auto-selects the TURBINE-TRIP controller and C-8 arms it',
      trip1.dumpArmed === true && trip1.dumpFrac > 0.1,
      'dump ' + (100 * trip1.dumpFrac).toFixed(1) + ' % against the no-load reference — no ' +
      'operator, no C-7 event, the trip relay itself');
  var trip2 = ride(plT, quiet ? 2250 : 15000);
  ckT('...and the dumps walk Tavg toward NO-LOAD and then CLOSE — the controller finishes its job',
      trip2.tavg_f < 565 && trip2.dumpFrac < 0.05,
      'Tavg ' + trip2.tavg_f.toFixed(1) + ' degF (no-load 557), dump ' +
      (100 * trip2.dumpFrac).toFixed(1) + " % — and the post-trip secondary settles on the ADV " +
      'band (~1057 psig, safeties SHUT), the rung built 2026-08-19');

  /* ---- SECONDARY INVENTORY -----------------------------------------------------------------
   * ⚠ ADDED BECAUSE A MUTATION WENT VACUOUS. The ride always sets feed = steam, so `dM = feed -
   * steam` is identically ZERO in every case above — and a mutation replacing it with 0 therefore
   * changed nothing and reported as caught by nobody. The injection self-test found it; no amount
   * of reading the ride would have.
   *
   * A balanced harness cannot test an imbalance. So this exercises the term directly, which is
   * also the physics behind boil-dry: steam out with no feed in is what empties a steam generator. */
  head('SECONDARY INVENTORY  [a balanced ride cannot test an imbalance]');
  var sgI = G.createSG({});
  var m0 = sgI.mass;
  G.stepSG(sgI, TREF, 10, { feed: 0, steam: 50 });
  ckT('drawing steam with no feed REMOVES inventory', sgI.mass < m0 - 400,
      m0.toFixed(0) + ' -> ' + sgI.mass.toFixed(0) + ' kg after 10 s at 50 kg/s out');
  var sgJ = G.createSG({});
  var m1 = sgJ.mass;
  G.stepSG(sgJ, TREF, 10, { feed: 50, steam: 0 });
  ckT('...and feeding with no draw ADDS it', sgJ.mass > m1 + 400,
      m1.toFixed(0) + ' -> ' + sgJ.mass.toFixed(0) + ' kg');
  var sgK = G.createSG({});
  var m2 = sgK.mass;
  G.stepSG(sgK, TREF, 10, { feed: 50, steam: 50 });
  ckT('...and a BALANCED flow leaves it unchanged, which is why the ride above could not see this',
      Math.abs(sgK.mass - m2) < 1e-9,
      'exactly the case every A1 ride runs, and exactly why the mutation was invisible');

  /* ---- A5: THE SG IS THE ONLY HEAT SINK ----------------------------------------------------- */
  head('A5 -- THE SG IS THE ONLY HEAT SINK  [take it away and the plant has nowhere to put heat]');
  var pl4 = plant();
  ride(pl4, BASE);
  var starved = ride(pl4, quiet ? 2000 : 4000, function () { return 0.0; });
  /* ⚠ A5 CHANGED MEANING WHEN RELIEF WAS MODELLED, and the new meaning is the prototypical one.
   * This check asked for pressure to run away (>1.5x nominal). It cannot now: the safety valves
   * lift at 1085 psig and CAP it, which is what they are for. A plant whose secondary ran away
   * past its safeties would be the defect. So A5 becomes "remove the turbine sink and the plant
   * climbs the relief ladder until the safeties carry it" — which is a better demonstration than
   * an unbounded pressure rise, and it is the coupling the ladder exists to teach. */
  ckT('with no steam drawn the secondary pressurises onto the SAFETY VALVES',
      starved.sgP > base.sgP * 1.25 && starved.safetyOpen === true,
      base.sgP.toFixed(3) + ' -> ' + starved.sgP.toFixed(3) + ' MPa, safeties LIFTED');
  ckT('...and the safeties CAP it rather than letting it run away',
      starved.sgP < 8.0,
      'capped at ' + starved.sgP.toFixed(3) + ' MPa — a secondary that ran past its own safeties ' +
      'would be the defect, not the demonstration');
  ckT('...primary temperature climbs', starved.tavg_f > base.tavg_f + 15,
      base.tavg_f.toFixed(2) + ' -> ' + starved.tavg_f.toFixed(2) + ' degF');
  ckT('...and the reactor now matches the SAFETIES, having lost the turbine',
      starved.power > 40 && starved.power < 90,
      starved.power.toFixed(2) + ' % — with the turbine shut the safety valves are the heat sink, ' +
      'and the core matches whatever leaves the SG. A real plant SCRAMS here (the source: ' +
      '"complete loss of load, when operating above 50%, will cause a reactor trip"); PWR2 has no ' +
      'protection layer, so it rides it out on relief. Declared gap, not a passing grade.');
}

console.log('\nPWR2 ACCEPTANCE -- A1: POWER FOLLOWS LOAD, rods in MANUAL');
var G = loadFrom(SRC), rec = [];
runSuite(G, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  /* anchors re-pointed #510 batch 1: the SG grew the dryout wet fraction + outflow limiter */
  ['the SG duty stops following primary temperature (the link from primary to secondary is cut)',
   'var Q = sg.U * wet * sg.area * (primaryT - T_sec);', 'var Q = 300000;'],
  ['the secondary temperature stops tracking its pressure (no back-pressure on the duty)',
   'var T_sec = W.T_sat(sg.P);', 'var T_sec = 272.11;'],
  /* anchors re-pointed #507 wave 5: the SG ledger grew the tube-leak stream */
  /* RE-POINTED for #549/#562 (2026-08-27): the enthalpy sum moved out of `dH` into `E_in`
   * (the energy limiter needs the same number) and the export enthalpy became `h_out`, so both
   * anchors naming the old one-line `dH` went BLIND. The runner said ANCHOR MISS — read the
   * self-test line, not just the checks tally. */
  ['steam draw no longer removes energy (demand cannot be felt)',
   'var dH = E_in - steam_eff * h_out;', 'var dH = E_in - steam_eff * SG.h_feed;'],
  ['steam draw no longer removes mass',
   'var dM = inflow - steam_eff;', 'var dM = 0;'],
  ['the secondary pressure never updates', '    updatePressure(sg);', ''],
  ['the duty is allowed to run backwards into the primary',
   'var Q = sg.U * wet * sg.area * (primaryT - T_sec);',
   'var Q = sg.U * wet * sg.area * (T_sec - primaryT);'],
  /* A GENUINE HALVING, not a thrown error. The first version of this mutation called an undefined
   * helper, so it was "caught" by crashing — which tests nothing about the physics. A mutation
   * that throws is always caught and is therefore worthless as coverage. */
  ['the heat-transfer conductance is halved (the SG is undersized)',
   'return 300000 / (SG.area_m2 * (T_prim - T_sec)); // kW/m2-K',
   'return 150000 / (SG.area_m2 * (T_prim - T_sec)); // kW/m2-K'],
  ['feedwater arrives at steam enthalpy (the secondary cannot be cooled by feed)',
   'var E_in = Q + feed * SG.h_feed + afw * h_afw + leak * h_leak;',
   'var E_in = Q + feed * W.h_g(sg.P) + afw * W.h_g(sg.P) + leak * h_leak;']
];

if (fail > 0) {
  console.log('  ' + require('path').basename(__filename, '.js') + ': ' + pass +
              ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
  console.log('  MUTATION SELF-TEST SKIPPED -- ' + fail + ' check(s) failed in the CLEAN run.');
  console.log('  A failing check fails in every mutant too, so every mutation would report as');
  console.log('  caught and the coverage number would be a lie. Fix the check first.');
  process.exit(1);
}

console.log('\n' + '='.repeat(70));
console.log('  INJECTION SELF-TEST -- every mutation MUST redden at least one check');
console.log('='.repeat(70));
var blind = 0;
MUTATIONS.forEach(function (m) {
  if (SRC.indexOf(m[1]) === -1) { console.log('  ERROR   anchor not found: ' + m[0]); blind++; return; }
  var r2 = [];
  try { runSuite(loadFrom(SRC.split(m[1]).join(m[2])), r2, true); }
  catch (e) { r2.push({ name: 'threw', ok: false }); }
  var f2 = r2.filter(function (r) { return !r.ok; }).length;
  if (f2 === 0) { blind++; console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); }
  else console.log('  caught    ' + m[0].padEnd(74) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_loadfollow: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
