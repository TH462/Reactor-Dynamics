/* run_pwr2_reactor.js — Layer 5 gate: kinetics and fuel, COUPLED. (#479)
 *
 * THE CLAIM THIS FILE MAKES IS THAT THE LOOP IS CLOSED — that temperature can move power without
 * anybody typing a number. Every other pwr2 gate can be satisfied by a component that is correct in
 * isolation; this one cannot, because the thing under test is the connection.
 *
 * So the checks are built as SELF-REGULATION tests rather than value comparisons:
 *
 *   1. THE PLANT MUST HOLD. A critical reactor with a matched heat sink stays at power and returns
 *      to zero net reactivity. A loop with a sign error passes a one-step check and diverges here.
 *   2. FEEDBACK MUST BE NEGATIVE, IN BOTH DIRECTIONS. Raise the sink and power must RISE to meet
 *      it; cut it and power must FALL. One direction alone is satisfied by a monotone drift.
 *   3. POWER MUST TRACK THE SINK, not merely move the right way. The reactor is not being told what
 *      power to make — it finds it. That is the A1 coupling in its simplest form.
 *   4. THE HEAT PATH MUST NOT DOUBLE-COUNT, and this is the trap the file exists around: Layer 4
 *      merges `heats` and `corePower` ADDITIVELY, so feeding both is silently survivable — the
 *      plant just settles hotter and still balances.
 *
 * ⚠ WHAT THIS GATE DOES NOT PROVE. It imposes the steam-generator duty as a NUMBER. That is the
 * right boundary condition for testing the reactivity loop in isolation, and it is the WRONG one
 * for the A1 load-follow coupling, where the temperature rise is the mechanism rather than a
 * consequence: a real load drop raises SG pressure, which raises primary temperature, which is what
 * pushes power down. With the duty imposed directly the SG is bypassed and the coolant temperature
 * barely moves — MEASURED, 0.28 degC across a 20 % power swing. A1 needs pwr2_sg in the loop and is
 * recorded as owed, not claimed here.
 *
 * Run: node test/run_pwr2_reactor.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_reactor.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_sources',
 'pwr2_kinetics', 'pwr2_fuel', 'pwr2_pressurizer'
].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, W = RD.water, S = RD.sources, K = RD.kinetics, F = RD.fuel,
    PZ = RD.pressurizer;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: RD.water, vtable: RD.vtable, core: RD.core,
                             geometry: RD.geometry, loop: RD.loop, sources: RD.sources,
                             kinetics: RD.kinetics, fuel: RD.fuel } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.reactor;';
  return new Function('RD_ROOT', body)(root);
}

var RATED = 300000, TREF = 304.5, P0 = 15.41;

function runSuite(R, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(56) +
      'got ' + got.toFixed(3) + ' want ' + want.toFixed(3) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }

  /* COST ASYMMETRY (D1 §31), budgeted as each check was written. A full ride is 15 000 steps of a
   * plant with the conservation core underneath; the mutation replay runs that per mutation. Every
   * mutation here shows itself within a few seconds of plant — a double-counted heat path, a lost
   * decay fraction, a wrong node — so the replay horizon is short and only the SETTLING claims get
   * the long one. MEASURED: 4 s clean, ~40 s for the replay. */
  var SETTLE = quiet ? 1500 : 15000;      /* 30 s vs 300 s */
  var STEP   = quiet ? 1500 : 6000;       /* 30 s vs 120 s */

  /* A reactor critical AT ITS OWN CONDITION. rho_excess puts the plant critical at the HZP anchor
   * with zero xenon; at rated power with equilibrium xenon present the boron must be trimmed, and
   * doing that here rather than assuming it is what keeps the fixture a PLANT rather than a
   * shutdown reactor being measured for dynamics it cannot show. */
  function fixture(opts) {
    opts = opts || {};
    /* THE PLANT HAS A PRESSURIZER (pwr2_pressurizer.js, owner ruling 2026-08-18 "Option 1") —
     * the rigid depressurised loop this file's own §486 notes documented is gone from the
     * default fixture. `opts.rigid` keeps the old plant available DELIBERATELY: the void-half
     * check below needs a boiling core to have a subject at all, and a rigid loop riding
     * saturation is the honest way to produce one. */
    var pz = opts.rigid ? null : PZ.createPressurizer({});
    var sys = S.createPlant({ h: W.h_l(TREF, P0), P: P0,
                              extraMass: pz ? PZ.extraMassFn(pz) : undefined });
    /* #514: trim at the temperature the ENGINE reads. stepReactor's coreTemp goes through
     * the vtable now, which differs from the analytic inverse by interpolation (~0.009 degC
     * here) — trimming at the analytic TREF left the "critical" plant ~0.3 pcm off and step
     * one read 0.09 dpm against a 0.000 claim. Reading the SAME thermometer makes the
     * criticality claim exact on both paths: with no table loaded this is W.T_from_h and
     * reproduces the old fixture verbatim (validated against the old behaviour, HR10). */
    var T0 = (RD.vtable ? RD.vtable.T_from_h : W.T_from_h)(W.h_l(TREF, P0), P0);
    var rx  = R.createReactor({ P: opts.P === undefined ? 1.0 : opts.P, coolTemp_c: T0 });
    /* ⚠ TRIM AT THE ACTUAL FUEL TEMPERATURE, NOT THE COOLANT'S. criticalBoron defaults the fuel
     * to the moderator temperature, which is the ZERO-POWER case; at rated the fuel is 277 degC
     * hotter and omitting it is a 693 pcm error. The first version of this fixture omitted it, and
     * nothing went red — the plant just started subcritical, dipped, and bought the reactivity
     * back by cooling, settling stable and self-consistent at a Tavg 29 degF below design. */
    var B   = K.criticalBoron(rx.kin, T0, P0, null, rx.kin.X / rx.kin.X_eq_full,
                              rx.fuel.T_fuel_c);
    return { sys: sys, rx: rx, B: B, pz: pz };
  }
  function ride(f, n, dutyOf, rods) {
    var last = null, t = 0;
    for (var i = 0; i < n; i++) {
      last = R.stepReactor(f.rx, f.sys, 0.02, { boron_ppm: f.B, rodGroups: rods || null });
      S.stepPlant(f.sys, 0.02, { heats: last.heats, sgDuty: dutyOf ? dutyOf(t) : RATED });
      if (f.pz) PZ.stepPressurizer(f.pz, f.sys, 0.02, {});
      t += 0.02;
    }
    return last;
  }

  /* ---- CONSTRUCTION, WRITTEN FIRST (D1 §31) ---------------------------------------------- */
  head('CONSTRUCTION  [a caller argument that never arrives is invisible to a physics check]');
  ck('caller initial power reaches the kinetics it builds',
     R.createReactor({ P: 0.25 }).kin.P, 0.25, 1e-12, '');
  ck('caller rated power reaches the reactor',
     R.createReactor({ rated_thermal_kW: 4242 }).rated_thermal_kW, 4242, 1e-12, 'kW');
  ckT('caller coolant temperature reaches the fuel it settles',
      Math.abs(R.createReactor({ coolTemp_c: 200 }).fuel.T_fuel_c -
               R.createReactor({ coolTemp_c: 300 }).fuel.T_fuel_c) > 50,
      'the fuel is settled AGAINST that coolant, so the two must differ');
  /* THE INITIAL CONDITION IS A SOLVE, NOT A GUESS. A reactor created at rated power with fuel at
   * some default temperature spends ~15 s dumping the difference into the coolant, which reads as
   * a physics defect and is purely an IC error. */
  ckT('fuel is initialised ON its steady solve, so the plant does not lurch at t=0',
      Math.abs(R.createReactor({ P: 1.0, coolTemp_c: TREF }).fuel.T_fuel_c -
               F.steadyFuelTemp(F.deriveGeometry(), RATED, TREF)) < 0.5,
      'created at ' + R.createReactor({ P: 1.0, coolTemp_c: TREF }).fuel.T_fuel_c.toFixed(1) +
      ' degC against a solve of ' + F.steadyFuelTemp(F.deriveGeometry(), RATED, TREF).toFixed(1));
  ckT('...and a reactor built at PART power settles its fuel lower',
      R.createReactor({ P: 0.5, coolTemp_c: TREF }).fuel.T_fuel_c <
      R.createReactor({ P: 1.0, coolTemp_c: TREF }).fuel.T_fuel_c - 100,
      'the IC follows the power it is built at, not a fixed number');

  /* ---- THE COOLANT REGIME (added 2026-08-17) ----------------------------------------------
   * `coreRegime` is what tells `pwr2_fuel.js` whether the rods are being cooled, and that layer
   * REFUSES to run without it rather than assume they are. It had no direct coverage when it
   * landed, and it could not have got any by accident: every fixture in this file runs at rated
   * flow on a subcooled core, so a version returning "fully cooled, no void" unconditionally
   * agrees with all of them. The mutations below are the point of this section. */
  head('COOLANT REGIME  [what pwr2_fuel refuses to assume, and no fixture here varies by itself]');
  /* THE DUPLICATED CONSTANT, PINNED. `MDOT_RATED` here and `PUMP.mdot_rated` in pwr2_sources are
   * the same physical number written down twice, which is the failure mode CLAUDE.md records for
   * the protection cadence: move one and not the other and the flow fraction silently rescales
   * while every gate stays green. A cross-module consistency claim belongs in the GATE — the same
   * place run_pwr2_kinetics ties its Doppler reference to pwr2_fuel's derivation. */
  ck('the flow reference is the SAME number pwr2_sources pumps to', R.MDOT_RATED,
     S.PUMP.mdot_rated, 0, 'kg/s');

  var rgP = S.createPlant({ h: W.h_l(TREF, P0), P: P0 });
  var rg0 = R.coreRegime(rgP);
  ckT('a subcooled core at rated flow reports no void and full flow',
      Math.abs(rg0.voidFrac) < 1e-12 && Math.abs(rg0.flowFrac - 1) < 1e-9,
      'void ' + rg0.voidFrac.toFixed(6) + ', flow ' + rg0.flowFrac.toFixed(6));
  /* IT MUST READ THE PLANT, not report a lineup. Two fixtures, each moving exactly one thing. */
  var rgV = S.createPlant({ h: W.h_l(TREF, P0), P: P0 });
  for (var q = 0; q < rgV.nodes.length; q++) {
    if (rgV.nodes[q].id === 'core') {
      rgV.nodes[q].h = W.h_f(P0) + 0.4 * (W.h_g(P0) - W.h_f(P0));
      break;
    }
  }
  ckT('a BOILING core node is seen -- the void fraction comes off the plant, not a default',
      R.coreRegime(rgV).voidFrac > 0.3,
      'void ' + R.coreRegime(rgV).voidFrac.toFixed(3) + ' from a 40 % quality core node');
  /* AND IT IS VOID FRACTION, NOT QUALITY. The 40 % fixture above cannot tell them apart (both
   * clear 0.3); the LOW-quality regime can — alpha and x differ 5-16x there, which is where the
   * shipped defect hid (#490, audit #488 D10.2: consumers read 1.5 % on a 15-20 %-void core).
   * The reference is independent algebra on Layer 0's saturated volumes, not W.voidFraction,
   * so a coreRegime and a voidFraction that are wrong TOGETHER still red here. */
  var rgQ = S.createPlant({ h: W.h_l(TREF, P0), P: P0 });
  for (var q2 = 0; q2 < rgQ.nodes.length; q2++) {
    if (rgQ.nodes[q2].id === 'core') {
      rgQ.nodes[q2].h = W.h_f(P0) + 0.0153 * (W.h_g(P0) - W.h_f(P0));
      break;
    }
  }
  var vfQ = 1 / W.rho_l(W.T_sat(P0), P0), vgQ = 1 / W.rho_v_sat(P0);
  var alphaQ = 0.0153 * vgQ / (0.0153 * vgQ + (1 - 0.0153) * vfQ);
  ckT('a 1.53 % QUALITY core reports the ~8 % VOID it is by volume, not the quality',
      Math.abs(R.coreRegime(rgQ).voidFrac - alphaQ) < 1e-9 && R.coreRegime(rgQ).voidFrac > 0.06,
      'void ' + (100 * R.coreRegime(rgQ).voidFrac).toFixed(2) + ' % against algebra ' +
      (100 * alphaQ).toFixed(2) + ' % -- a coreRegime handing quality onward reads 1.53 and reds');
  var rgF = S.createPlant({ h: W.h_l(TREF, P0), P: P0 });
  rgF.mdot_loop = S.PUMP.mdot_rated / 4;
  ckT('...and a COLLAPSING loop flow is seen too, as the fraction it actually is',
      Math.abs(R.coreRegime(rgF).flowFrac - 0.25) < 1e-9,
      'flow ' + R.coreRegime(rgF).flowFrac.toFixed(4) + ' at a quarter of rated');
  /* AND THE REGIME MUST REACH pwr2_fuel, not merely be computable. A film coefficient that never
   * moves is the defect this whole chain exists to have fixed. */
  /* ⚠ READ ON THE FIRST STEP AFTER THE INJECTION, and the reason is real physics rather than a
   * testing convenience. `ride()` calls stepReactor and then stepPlant, so one step reads the
   * flow that was injected — but ten steps do NOT, because stepPlant re-integrates the momentum
   * and a LIQUID-FULL loop with a running pump restores its flow in a fraction of a second. The
   * first version rode 10 steps and measured a factor of 2.8 rather than 10, which is the plant
   * being right and the fixture being wrong. That recovery is exactly why the pump fix mattered:
   * flow collapses when the FLUID changes, not when somebody perturbs it. */
  var rgHot = fixture();
  var rgCold = ride(rgHot, 1);
  rgHot.sys.mdot_loop = S.PUMP.mdot_rated * 0.01;
  var rgSlow = ride(rgHot, 1);
  ckT('the regime reaches the fuel -- collapsing the loop flow collapses the film coefficient',
      rgSlow.h_film_W_per_m2K < rgCold.h_film_W_per_m2K / 10,
      rgCold.h_film_W_per_m2K.toFixed(0) + ' -> ' + rgSlow.h_film_W_per_m2K.toFixed(0) +
      ' W/m2K when the loop drops to 1 % of rated -- a computed regime that never reached ' +
      'pwr2_fuel would leave this unmoved');

  /* ---- THE LOOP HOLDS --------------------------------------------------------------------- */
  head('THE LOOP HOLDS  [a sign error passes one step and diverges over three hundred seconds]');
  /* THE FIXTURE IS KEPT, not discarded. The checks below have to interrogate the PLANT the ride
   * left behind — its pressure, its core node quality — and `ride()` returns only the reactor's
   * own output, which cannot answer either. */
  var holdF = fixture();
  var hold = ride(holdF, SETTLE);
  function hold_core() {
    for (var i = 0; i < holdF.sys.nodes.length; i++) {
      if (holdF.sys.nodes[i].id === 'core') return holdF.sys.nodes[i];
    }
    return null;
  }
  function hold_P() { return holdF.sys.P; }
  /* VOID FRACTION BY VOLUME from static quality — alpha = (x/rho_g) / (x/rho_g + (1-x)/rho_f).
   * Written out rather than taken from the engine, so the normalisation the check depends on is
   * not supplied by the thing under test. */
  function hold_voidFrac() {
    var cn = hold_core(), P = holdF.sys.P, x = W.quality(cn.h, P);
    if (!(x > 0)) return 0;
    var rf = W.rho_l(W.T_sat(P), P), rg = W.rho_v_sat(P);
    return (x / rg) / ((x / rg) + ((1 - x) / rf));
  }
  function hold_voidPcm() {
    return K.voidReactivity(hold_core().h, holdF.sys.P, holdF.B) * 1e5;
  }
  ckT('a critical reactor with a matched sink stays at power',
      hold.power_pct > 95 && hold.power_pct < 105,
      hold.power_pct.toFixed(2) + ' % after ' + (SETTLE * 0.02) + ' s');
  ckT('...and settles at ZERO net reactivity, which is what critical MEANS',
      Math.abs(hold.rho_pcm) < 5, hold.rho_pcm.toFixed(2) + ' pcm');
  /* ⚠ RE-POINTED A THIRD TIME, 2026-08-18 — AND BACK TO ITS ORIGINAL FORM, WHICH IS THE POINT.
   *
   * The original check asserted the core node sits above TREF and below TREF+30. On 2026-08-17
   * that was found to be reading a SATURATION temperature (the rigid fixture settled at
   * 11.098 MPa and rode the dome, core boiling at 3.28 % void) and was re-pointed to assert
   * saturation, with the cause filed as #486: "the fixture having no pressure control". The
   * fixture NOW HAS pressure control — pwr2_pressurizer.js in the extraMass seat (owner ruling
   * 2026-08-18 "Option 1") — so the original assertion is finally true FOR THE RIGHT REASON:
   * the core node is a subcooled outlet a bounded distance above the reference, not a
   * saturation line wearing an outlet's name. Measured at the sample: ~2226 psia with ~45 degF
   * of core subcooling. The saturation-riding plant is kept alive below, deliberately, where
   * the void half needs it. */
  var holdSat = W.T_sat(hold_P());
  ckT('...with the fuel hot, and the core node a SUBCOOLED outlet — the #486 fixture, repaired',
      hold.T_fuel_c > 620 && hold.T_fuel_c < 760 &&
      hold.coolTemp_c > TREF - 2 && hold.coolTemp_c < TREF + 30 &&
      holdSat - hold.coolTemp_c > 10,
      'fuel ' + hold.T_fuel_c.toFixed(1) + ' degC, core node ' + hold.coolTemp_c.toFixed(2) +
      ' degC, ' + ((holdSat - hold.coolTemp_c) * 1.8).toFixed(1) + ' degF below saturation — ' +
      'the rigid fixture read the saturation line here and called it an outlet');
  /* THE VOID HALF OF THE DENSITY COUPLING, ASSERTED WHERE IT IS NON-ZERO — the flag-only-false
   * trap (run_pwr2_containment.js:110). A term that is only ever checked on a subcooled core is
   * a term nobody has seen work. ⚠ THE PRESSURIZED FIXTURE CAN NO LONGER PROVIDE THE SUBJECT —
   * its core is subcooled by design now — so this check rides the RIGID plant DELIBERATELY:
   * the depressurised saturation-riding loop that was this file's default fixture until
   * 2026-08-18 survives as the adversarial one, because a boiling core is exactly what it
   * honestly produces. Normalised on VOID FRACTION BY VOLUME rather than on quality: at 1.53 %
   * quality the volume void is 18.8 %, a 12x difference, and dividing by the wrong one puts
   * the coefficient outside every published range and invites "re-tuning" a correct term. */
  /* ⚠ #583 TOOK THIS CHECK'S SUBJECT AWAY, AND THAT IS THE PART WORTH KEEPING. It used to ride
   * `fixture({ rigid: true })` — a loop with no compressible volume — on the argument that "a
   * boiling core is exactly what it honestly produces". MEASURED 2026-08-28: that loop parked at
   * 8.55 MPa on the saturation line ONLY BECAUSE THE PHANTOM PRESSURIZER NODE WAS IN IT —
   * 3.5453 m3 of stagnant water at Tavg acting as thermal ballast. Delete the node (#583) and the
   * identical fixture runs to the 0.1 MPa property FLOOR with a 99 degC subcooled core, and the
   * check reports `0 pcm = NaN per % void`. Booting the rigid loop on the dome instead does not
   * help: 8.0, 8.5 and 9.0 MPa all collapse to the floor too. THE SUBJECT WAS MANUFACTURED BY
   * THE DEFECT, and no arrangement of an uncontrolled loop reproduces it.
   *
   * So the void state is now CONSTRUCTED AND NAMED: the settled plant's OWN pressure, with the
   * core node placed at a stated quality. It is the state a real casualty produces —
   * `run_pwr2_coredamage` drives the whole chain on the shipped engine — and it is the only
   * form of this check that is not an accident of where an uncontrolled loop lands. Normalised
   * on VOID FRACTION BY VOLUME, not quality: at 1.0 % quality the volume void is 5.65 %, and
   * dividing by the wrong one puts the coefficient outside every published range. */
  var voidP = hold_P(), voidX = 0.01, voidB = holdF.B;
  var voidH = W.h_f(voidP) + voidX * (W.h_g(voidP) - W.h_f(voidP));
  function voidFracAt(x) {
    var rf = W.rho_l(W.T_sat(voidP), voidP), rg = W.rho_v_sat(voidP);
    return (x / rg) / ((x / rg) + ((1 - x) / rf));
  }
  var voidFrac = voidFracAt(voidX);
  var voidPcm = K.voidReactivity(voidH, voidP, voidB) * 1e5;
  ckT('the VOID half of the density coupling is live, negative, and real-PWR sized',
      voidFrac > 0.02 && voidPcm < 0 &&
      (voidPcm / (voidFrac * 100)) > -250 && (voidPcm / (voidFrac * 100)) < -20,
      (voidFrac * 100).toFixed(2) + ' % void by volume at the plant\'s own ' +
      (voidP * 145.038).toFixed(0) + ' psia and ' + voidB.toFixed(0) + ' ppm, ' +
      voidPcm.toFixed(0) + ' pcm = ' + (voidPcm / (voidFrac * 100)).toFixed(1) +
      ' pcm per % void, against a real-PWR range of roughly -100 to -250');
  /* ...AND IT IS A FUNCTION OF THE VOID, not a constant that happens to be negative. A term
   * asserted at ONE state cannot tell those apart — the trap this file already names for the
   * subcooled case. Both ends, plus the exact-zero contract on the subcooled side. */
  var voidPcm2 = K.voidReactivity(
    W.h_f(voidP) + 2 * voidX * (W.h_g(voidP) - W.h_f(voidP)), voidP, voidB) * 1e5;
  ckT('...and it SCALES with the void and is EXACTLY zero without it',
      voidPcm2 < voidPcm * 1.7 &&
      K.voidReactivity(W.h_f(voidP) - 1, voidP, voidB) === 0,
      'twice the quality gives ' + voidPcm2.toFixed(0) + ' pcm against ' + voidPcm.toFixed(0) +
      '; one kJ/kg below h_f gives exactly 0');
  ckT('nothing in the ride is NaN — the coupling does not lose a value',
      isFinite(hold.power_pct) && isFinite(hold.T_fuel_c) && isFinite(hold.rho_pcm) &&
      isFinite(hold.heats.core), '');

  /* ---- FEEDBACK IS NEGATIVE, BOTH WAYS ---------------------------------------------------- */
  head('SELF-REGULATION  [both directions: one alone is satisfied by a monotone drift]');
  var up   = ride(fixture(), STEP, function (t) { return t < 20 ? RATED : RATED * 1.10; });
  var down = ride(fixture(), STEP, function (t) { return t < 20 ? RATED : RATED * 0.90; });
  ckT('raising the heat sink RAISES power', up.power_pct > 104,
      up.power_pct.toFixed(2) + ' % against a +10 % sink — the plant cools, reactivity goes up');
  ckT('cutting the heat sink LOWERS power', down.power_pct < 96,
      down.power_pct.toFixed(2) + ' % against a -10 % sink');
  /* NOT MERELY THE RIGHT DIRECTION — THE RIGHT SIZE. Nobody told the reactor what power to make. */
  ck('power TRACKS the raised sink rather than merely drifting up',
     up.core_heat_pct, 110, 2.0, '%');
  ck('power TRACKS the cut sink', down.core_heat_pct, 90, 2.0, '%');
  ckT('the fuel temperature moves WITH power, which is the Doppler lever arm',
      up.T_fuel_c > hold.T_fuel_c + 15 && down.T_fuel_c < hold.T_fuel_c - 15,
      up.T_fuel_c.toFixed(1) + ' / ' + hold.T_fuel_c.toFixed(1) + ' / ' +
      down.T_fuel_c.toFixed(1) + ' degC at +10 / 0 / -10 %');
  ckT('both excursions return to CRITICAL, not to some other reactivity',
      Math.abs(up.rho_pcm) < 15 && Math.abs(down.rho_pcm) < 15,
      'a self-regulating plant ends at rho = 0 whatever power it found; got ' +
      up.rho_pcm.toFixed(1) + ' and ' + down.rho_pcm.toFixed(1) + ' pcm');

  /* ---- THE HEAT PATH ---------------------------------------------------------------------- */
  head('HEAT PATH  [Layer 4 merges heats and corePower ADDITIVELY -- double-counting survives]');
  ckT('the reactor returns a heats map and NOT a corePower',
      hold.heats && typeof hold.heats.core === 'number' && hold.corePower === undefined,
      'supplying both would double the core power and merely settle hotter — silently');
  /* TOLERANCE 10 kW = 3e-5 of rating. MEASURED, the residual here is 2.4 kW and it is the fuel
   * storing or releasing energy as power drifts on the slow xenon timescale — the plant is at
   * rho = 0.03 pcm but not frozen. A 1 kW tolerance failed on that, which is a test asking for
   * exactness from a quantity that is still physically moving. The mutation this check exists for
   * — corePower supplied alongside heats — misses by ~300 000 kW. */
  ck('at steady state the heat delivered equals the heat generated',
     hold.heats.core, hold.Q_core_kW, 10.0, 'kW');
  ckT('the delivered heat is plant-sized, not a fraction or a duplicate',
      hold.heats.core > 0.9 * RATED && hold.heats.core < 1.15 * RATED,
      hold.heats.core.toFixed(0) + ' kW against a ' + RATED + ' kW rating');

  /* ---- THE SPLIT --------------------------------------------------------------------------- */
  head('FISSION vs TOTAL  [equal at steady state, APART the moment the rods drop]');
  ck('fission and total heat agree at steady state', hold.power_pct, hold.core_heat_pct, 0.5, '%');
  /* ⚠ `steps` IS STEPS WITHDRAWN, and the first version of this fixture had it backwards.
   * rodReactivity computes `withdrawn = steps/max_steps` and takes scruve(1 - withdrawn), so
   * 228 steps is ALL RODS OUT and worth ZERO, while 0 steps is fully inserted at -4068 pcm.
   * Driving "the scram" to 228 inserted nothing, and three checks reported that the reactor
   * ignored a scram when what they had actually measured was a fully withdrawn bank behaving
   * correctly. Read the convention at the site rather than assuming the intuitive direction. */
  var rods = [{ steps: 228, max_steps: 228, worth: 0.04068 }];   /* start ALL OUT */
  var f2 = fixture();
  ride(f2, 200, null, rods);                        /* settle briefly, rods out */
  rods[0].steps = 0;                                /* SCRAM: fully inserted */
  /* ⚠ A SHORT WINDOW, AND THE REASON IS A REAL COUPLING RATHER THAN A TEST CONVENIENCE.
   *
   * The first version rode 60 s after the rod drop with the heat sink still at RATED, and the
   * checks failed reporting the reactor had ignored the scram: fission back at 100 %, rho at
   * +15 pcm. It had not ignored it. Removing 300 MW from a plant that has stopped making 300 MW
   * cools it hard, and at -23.4 pcm/degC the moderator hands back positive reactivity faster than
   * the bank holds it down — 4068 pcm of rod worth is only 174 degC of cooling. THE PLANT
   * GENUINELY RETURNS TO CRITICAL, which is exactly why a real scram trips the turbine and is a
   * coupling worth being able to show rather than a defect to tune away.
   *
   * So the prompt behaviour is measured in the 10 s where it lives, and the recovery is asserted
   * separately below as the finding it is. */
  /* THREE SAMPLE POINTS, because the three claims live on three different timescales and reading
   * them all at one horizon is what made the first two versions fail. The recovery is FAST — the
   * bank is already down to -991 pcm by 10 s — so "the rods inserted" has to be read while they
   * are still holding, not after the moderator has taken most of it back. */
  /* ⚠ THE SINK IS CUT WITH THE RODS, because that is what a scram actually does. Holding a RATED
   * heat sink on a shut-down reactor over-cools it, and the stronger the Doppler the harder that
   * pushes back: after h_gap was solved against the sourced defect (D1 section 35) the fuel sits at
   * 699 degC instead of 597, so cooling it releases enough positive reactivity to drive the plant
   * back through critical to 127 % INSIDE FOURTEEN SECONDS. Measuring "a scram shuts the reactor
   * down" against that is measuring a scram plus an over-cooling accident.
   *
   * So the scram checks below trip the turbine too, and the over-cooling recovery is kept as its
   * own separate finding at the end, where it is the subject rather than a contaminant. */
  function tripped() { return RATED * 0.07; }
  var scrEarly = ride(f2, 50, tripped, rods);       /* 1 s — the insertion itself */
  /* WINDOW LENGTHENED 250/450 -> 400/700 steps. The fuel time constant grew 3.26 -> 4.50 s when
   * h_gap was solved against the sourced Doppler defect (D1 section 35), so at the old horizon
   * the plant had not decayed far enough for the split to open past this check's 3-point bar.
   * The horizon follows the physics; the BAR is what must not move. */
  var scr = ride(f2, quiet ? 400 : 700, tripped, rods);
  ckT('a scram makes fission and total DIVERGE, where steady state had them equal',
      scr.core_heat_pct - scr.power_pct > 3,
      'fission ' + scr.power_pct.toFixed(3) + ' % against total ' + scr.core_heat_pct.toFixed(3) +
      ' % — the difference is the decay tail, and a model reporting one number cannot show it');
  ckT('...and the decay tail is the reason', scr.decay_pct > 2 && scr.decay_pct < 8,
      scr.decay_pct.toFixed(2) + ' % decay heat');
  ckT('...and the fuel COOLS toward the decay-heat rise', scr.T_fuel_c < hold.T_fuel_c - 150,
      scr.T_fuel_c.toFixed(1) + ' degC against ' + hold.T_fuel_c.toFixed(1) + ' at power');
  ckT('rod insertion drives reactivity strongly negative', scrEarly.rho_pcm < -3000,
      scrEarly.rho_pcm.toFixed(0) + ' pcm one second after the drop, against a 4068 pcm bank');
  /* THE RECOVERY, asserted rather than avoided. Keep removing rated heat from a scrammed plant and
   * the cooling walks reactivity back up through the bank. This is the moderator coefficient doing
   * what it is for, and a plant that could NOT do it would have a feedback sign error. */
  var f3 = fixture(); var rods3 = [{ steps: 228, max_steps: 228, worth: 0.04068 }];
  ride(f3, 200, null, rods3); rods3[0].steps = 0;
  var recEarly = ride(f3, 50, null, rods3);
  var scrLong = ride(f3, quiet ? 700 : 1200, null, rods3);
  ckT('...and holding a RATED sink on a scrammed plant walks it back toward critical',
      scrLong.rho_pcm > recEarly.rho_pcm + 2000,
      'rho ' + recEarly.rho_pcm.toFixed(0) + ' -> ' + scrLong.rho_pcm.toFixed(0) + ' pcm — 4068 pcm ' +
      'of bank is only ~174 degC of cooling, which is why a scram trips the turbine. The CORE NODE ' +
      'temperature is not the witness here: it is one node in a circulating loop and recovers ' +
      'toward the loop average as the plant mixes, so it is not monotone.');

  /* ---- REACTOR PERIOD AND STARTUP RATE -----------------------------------------------------
   * MEASURED first (HR12), not assumed: a critical reactor at t=0 gives SUR = -2.1e-9 dpm (the
   * sign is roundoff, the magnitude is the point); after settling, 0.005 dpm. Riving the same
   * over-cooling recovery the section above already drives (rods scrammed, RATED sink held on)
   * gives -3.34 dpm at 1 s (power still falling), +12.5 dpm at 10 s (climbing back THROUGH
   * criticality -- "supercriticality is indicated by a constant positive startup rate",
   * ML11223A342), and 0.04 dpm at 24 s once the plant has re-settled near 100 %. */
  head('REACTOR PERIOD AND STARTUP RATE  [derived from the fission signal, no calibration needed]');
  var f0 = fixture();
  var step0 = R.stepReactor(f0.rx, f0.sys, 0.02, { boron_ppm: f0.B });
  ck('a reactor at its own critical IC reports essentially ZERO startup rate on step one',
     step0.startup_rate_dpm, 0, 1e-4, 'dpm');
  ckT('...and period is effectively infinite there, not some finite fitted number',
      !isFinite(step0.period_s) || Math.abs(step0.period_s) > 1e6, step0.period_s);
  ckT('SUR stays near zero once the plant SETTLES at steady state (the loop-holds fixture)',
      Math.abs(hold.startup_rate_dpm) < 0.5, hold.startup_rate_dpm.toFixed(4) + ' dpm');

  /* ⚠ SAMPLE TIMES RE-MEASURED 2026-08-18, because the fixture gained its pressurizer and the
   * recovery MOVED — deliberately, and in the physical direction. On the rigid plant the scram
   * cooldown depressurised the loop freely and the moderator-density insertion walked the core
   * back through criticality by 10 s (+12.28 dpm). The vessel now FIGHTS that depressurisation
   * (outsurge + full heaters), so the same insertion arrives ~8 s later: measured, SUR turns at
   * ~16.5 s, climbs at +12.0 dpm at 20 s (power 28 %), overshoots to ~139 %, and re-settles by
   * ~38 s. The MECHANISM is the invariant the checks hold — negative falling, positive through
   * criticality, zero re-settled — and the old sample times pass only on the old plant, which
   * is the fixture change speaking, not a refit. */
  /* ⚠ RE-MEASURED AGAIN when the LEVEL CONTROL landed (stage 2a): the sourced 17 % low-level
   * heater cut removes 158 kW of pressure support MID-OUTSURGE, and this unprotected
   * adversarial fixture (rated sink held on a scrammed plant, no RPS wired) now RINGS — a
   * second moderator-density excursion peaks at 477 % power at ~32 s before the plant settles
   * near 100 % by ~56 s. A real plant's power-range high-flux trip would have ended the ride at
   * the first spike; the fixture exists to exercise the feedback, not to survive review as an
   * operating transient. The settle sample moves 38 -> 60 s; the three-phase mechanism the
   * checks pin (negative falling, positive through criticality, zero settled) is unchanged. */
  var f4 = fixture(); var rods4 = [{ steps: 228, max_steps: 228, worth: 0.04068 }];
  ride(f4, 200, null, rods4); rods4[0].steps = 0;                 /* settle, then scram */
  var sur1s  = ride(f4, 50, null, rods4);                          /* 1 s: still falling */
  /* ⚠ RE-MEASURED A FOURTH TIME (#515 Build 3, 2026-08-26), and this one is the FIX SPEAKING, not
   * the fixture: the moderator term's two-phase REFERENCE (kinetics header, defect 1) put
   * +6,400..+9,700 pcm of invented positive reactivity into every plant below 9.145 MPa — and
   * this cooldown falls through 1,600 psia by 16 s. That insertion was the +12 dpm at 20 s and
   * the 477 % ring. With a LIQUID reference the recovery is gentle: SUR turns positive at ~16 s,
   * climbs at +3.2 dpm at 51 s (power 32 %), and settles at 100 % by ~100 s with NO overshoot
   * (measured 0.00 dpm at 120 s). The three-phase MECHANISM is unchanged; the sample moves to
   * 51 s and the climb bound to > 1 dpm — a physical startup rate, not the defect's. */
  var sur20s = ride(f4, 2500, null, rods4);                        /* +50 s = 51 s: climbing back */
  /* ⚠ RE-MEASURED A THIRD TIME (#514): the fixture's trim now reads the engine's own
   * table thermometer (see fixture()) and the ring shifts phase — a third excursion dips to
   * 2.7 % near 60 s and recovers through ~82 % at 70 s before settling at 100 % by ~90 s
   * (measured 0.00 dpm at 100 s, ±0.02 through 160 s). Same rule as the two re-measures
   * above: the sample time follows the fixture, the three-phase MECHANISM is the check. */
  /* ⚠ A FIFTH TIME (#524, 2026-08-31), and this one RETIRED the leg's old sink: the "settles
   * at 100 % by ~90 s" ending was partly the 0.1 MPa PROPERTY FLOOR's artifact. The rated
   * sink drags this unprotected plant's pressure through 0.12 MPa at ~130 s; pre-#524 the
   * solve PINNED there and the ring froze quiet (0.00 dpm read as "settled"), and with the
   * floor at 0.002 the same ride boils toward vacuum and rings ±600 dpm for ever — no settle
   * exists under a standing rated sink. The check's stated subject is the prevPower
   * BOOKKEEPING on a settled plant, so the settle leg now rides a DUTY-MATCHED sink (heat
   * out follows the core) — which settles honestly on BOTH floors (validated against the old
   * behaviour per HR10, not refit to the new): measured −0.75 dpm at 120 s, −0.5..−0.8
   * through 180 s, power gliding at ~0.5 %. The negative and positive phases keep the rated
   * sink and their samples, unchanged. */
  var dutyM = function () { return (f4.rx.kin.P || 1) * RATED; };  /* sink follows the core */
  var sur120s = ride(f4, 3450, dutyM, rods4);                      /* +69 s = 120 s: re-settled */
  ckT('SUR is clearly NEGATIVE while the scrammed core is still cooling down',
      sur1s.startup_rate_dpm < -1, sur1s.startup_rate_dpm.toFixed(2) + ' dpm at 1 s');
  ckT('...and clearly POSITIVE while it climbs back THROUGH criticality -- the sourced lesson',
      sur20s.startup_rate_dpm > 1,
      sur20s.startup_rate_dpm.toFixed(2) + ' dpm at 51 s, power ' + sur20s.power_pct.toFixed(1) + ' %');
  ckT('...and back near zero once it has RE-SETTLED -- proves prevPower tracks the LATEST step',
      Math.abs(sur120s.startup_rate_dpm) < 2, sur120s.startup_rate_dpm.toFixed(3) + ' dpm at 120 s');
  /* THE CONVERSION CONSTANT, AS A PURE IDENTITY. SUR = C/T by definition, so SUR*T recovers C
   * exactly whenever T is finite -- true no matter what the reactor is doing, which is what makes
   * it a mutation-sensitive check on the CONSTANT specifically rather than on plant behaviour. */
  ck('SUR * period recovers the sourced conversion constant exactly (60 / ln 10, not 26.06 typed)',
     sur1s.startup_rate_dpm * sur1s.period_s, 60 / Math.LN10, 1e-9, '');

  /* ---- THE LAYERS BELOW NO LONGER THROW ---------------------------------------------------- */
  head('THE CONNECTION  [both lower layers refuse to invent these; supplying them is the job]');
  ckT('kinetics is given a fuel temperature it did not have to invent', (function () {
        try { K.stepKinetics(K.createKinetics({}), S.createPlant({ h: W.h_l(TREF, P0), P: P0 }),
                             0.02, {}); return false; }
        catch (e) { return /fuelTemp_c/.test(e.message); }
      })(), 'it still throws when called bare — the reactor is what stops that happening');
  ckT('fuel is given a core power it did not have to invent', (function () {
        try { F.stepFuel(F.createFuel({}), 0.02, { coolTemp_c: TREF }); return false; }
        catch (e) { return /Q_core_kW/.test(e.message); }
      })(), '');
  ckT('the reactor reads the CORE node, not whichever node comes first',
      Math.abs(R.coreTemp(S.createPlant({ h: W.h_l(TREF, P0), P: P0 })) - TREF) < 2,
      'got ' + R.coreTemp(S.createPlant({ h: W.h_l(TREF, P0), P: P0 })).toFixed(2) + ' degC');
}

console.log('\nPWR2 Layer 5 -- REACTOR: the reactivity loop, closed');
var R = loadFrom(SRC), rec = [];
runSuite(R, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  /* THE COOLANT REGIME (2026-08-17). The first two are the failure this section exists for:
   * a regime that reports the rods are cooled whatever the plant is doing. Every fixture in
   * this file runs at rated flow on a subcooled core, so neither shows up without the
   * dedicated checks above. */
  ['the coolant regime reports FULL FLOW whatever the loop is doing',
   '    var f = sys.mdot_loop === undefined ? 1 : sys.mdot_loop / MDOT_RATED;',
   '    var f = 1;'],
  /* ⚠ ANCHORS RE-CUT (#517). coreRegime gained the superheat pair, which split the single
   * `if (id === 'core') { v = ...; break; }` line these two used to match. A mutation whose
   * anchor stops matching reports ANCHOR NOT FOUND and counts as a BLIND SPOT — it fails loudly
   * rather than silently passing, which is the only reason this was caught in the same change. */
  ['the coolant regime reports NO VOID whatever the core is doing',
   "        v  = W.voidFraction(sys.nodes[i].h, sys.P);",
   "        v  = 0;"],
  ['the coolant regime hands QUALITY onward as void fraction (the shipped defect, #490)',
   "        v  = W.voidFraction(sys.nodes[i].h, sys.P);",
   "        v  = W.quality(sys.nodes[i].h, sys.P);"],
  /* ---- #517, the superheat wing at this layer ---- */
  ['coreRegime reports NO SUPERHEAT, so the fuel is blind above h_g again',
   "        sh = W.superheat_c(sys.nodes[i].h, sys.P);",
   "        sh = 0;"],
  ['coreRegime reads the superheat off the HOT LEG instead of the core',
   "        sh = W.superheat_c(sys.nodes[i].h, sys.P);",
   "        sh = W.superheat_c(sys.nodes[0].h, sys.P);"],
  ['the flow reference drifts off the value pwr2_sources actually pumps to',
   '  var MDOT_RATED = 1630;', '  var MDOT_RATED = 2000;'],
  ['the heat path DOUBLE-COUNTS (corePower supplied alongside heats)',
   '      heats:          fr.heats,', '      heats: fr.heats, corePower: kr.Q_total_frac * rx.rated_thermal_kW,'],
  ['the decay fraction is lost — fuel driven by FISSION power instead of total core heat',
   '      Q_core_kW:  kr.Q_total_frac * rx.rated_thermal_kW,',
   '      Q_core_kW:  kr.power * rx.rated_thermal_kW,'],
  ['Doppler stops seeing the fuel (a constant temperature — the loop is cut)',
   '      fuelTemp_c: rx.fuel.T_fuel_c,', '      fuelTemp_c: 581.8,'],
  ['the coolant temperature handed to fuel is a constant (fuel cannot feel the plant)',
   '      coolTemp_c: cool', '      coolTemp_c: 304.5'],
  ['the reactor reads the wrong node for coolant temperature',
   /* anchor re-pointed #514: coreTemp goes through TFH (the vtable idiom) now */
   "      if (sys.nodes[i].id === 'core') return TFH(sys.nodes[i].h, sys.P);",
   "      if (sys.nodes[i].id === 'hot_leg') return TFH(sys.nodes[i].h, sys.P);"],
  ['fuel is NOT initialised on its steady solve (a 15 s lurch at t=0 that looks like physics)',
   '                               T_fuel_c: F.steadyFuelTemp(geom, rated * kin.P, cool),',
   '                               T_fuel_c: 693,'],
  /* THE CLAD IC MATTERS MORE THAN THE FUEL'S, not less: its heat capacity is ~1/50th, so a clad
   * started at the wrong temperature dumps or absorbs its error in a fraction of a second and
   * shows up as a spike in the heat reaching the coolant on step one. */
  ['the CLAD is not initialised on its steady solve (a heat spike into the coolant at t=0)',
   '                               T_clad_c: F.steadyCladTemp(geom, rated * kin.P, cool) });',
   '                               T_clad_c: 20 });'],
  ['the initial fuel solve ignores the power it is built at',
   'F.steadyFuelTemp(geom, rated * kin.P, cool)', 'F.steadyFuelTemp(geom, rated, cool)'],
  ['boron never reaches kinetics (the operator control is inert)',
   '      boron_ppm:  drivers.boron_ppm,', '      boron_ppm:  0,'],
  ['rods never reach kinetics (a scram does nothing)',
   '      rodGroups:  drivers.rodGroups,', '      rodGroups:  null,'],
  ['the reported split collapses — fission reported as total',
   '      core_heat_pct:  kr.Q_total_frac * 100,', '      core_heat_pct:  kr.power * 100,'],
  ['the rating is wrong, so every power is scaled',
   '  var RATED_THERMAL_KW = 300000;', '  var RATED_THERMAL_KW = 400000;'],
  /* CONSTRUCTION */
  ['caller rated power ignored at construction',
   '    var rated = opts.rated_thermal_kW === undefined ? RATED_THERMAL_KW : opts.rated_thermal_kW;',
   '    var rated = RATED_THERMAL_KW;'],
  ['caller coolant temperature ignored at construction',
   '    var cool  = opts.coolTemp_c === undefined ? kin.T_mod_ref_c : opts.coolTemp_c;',
   '    var cool  = kin.T_mod_ref_c;'],
  ['caller options never reach the kinetics it builds',
   '    var kin   = K.createKinetics(opts);', '    var kin   = K.createKinetics({});'],
  /* PERIOD / STARTUP RATE */
  ['the ratio is inverted (period and SUR come out with the wrong SIGN everywhere)',
   'var ratio = rx.prevPower > 0 ? kr.power / rx.prevPower : 1;',
   'var ratio = rx.prevPower > 0 ? rx.prevPower / kr.power : 1;'],
  ['prevPower is never updated (SUR compares every step against the INITIAL power forever)',
   '    rx.prevPower = kr.power;', ''],
  ['SUR is derived from TOTAL core heat instead of the fission signal (wrong physical quantity)',
   'var ratio = rx.prevPower > 0 ? kr.power / rx.prevPower : 1;',
   'var ratio = rx.prevPower > 0 ? kr.Q_total_frac / rx.prevPower : 1;'],
  ['the sourced conversion constant is wrong (60/ln10 replaced by a nearby-looking number)',
   'var sur_dpm = isFinite(period_s) ? (60 / Math.LN10) / period_s : 0;',
   'var sur_dpm = isFinite(period_s) ? 26 / period_s : 0;']
];

/* ---- THE CLEAN-RUN GUARD --------------------------------------------------------------
 * A MUTATION SELF-TEST IS ONLY MEANINGFUL IF THE UNMUTATED SUITE IS GREEN. If any check fails in
 * the clean run it fails in every mutant too, so `f2 > 0` holds unconditionally and EVERY mutation
 * is reported as caught. Coverage then reads 14/14 while the suite is measuring nothing. */
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
  else console.log('  caught    ' + m[0].padEnd(72) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_reactor: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
