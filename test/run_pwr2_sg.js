/* run_pwr2_sg.js — Layer 5 gate: the lumped SG secondary. (#479)
 *
 * The point of this layer is one Tier A coupling, so the point of this gate is to prove it:
 *
 *   **A5 — "the steam generator is the only heat sink."** Until now the loop was HANDED a duty
 *   (`sgDuty`), so the sink could not be taken away and A5 was inexpressible. It now comes from
 *   a secondary with its own inventory, and cutting the feed makes the primary heat up because
 *   there is nowhere else for the energy to go. **That is the check.**
 *
 * A SECOND, GENUINELY INDEPENDENT CHECK LIVES HERE TOO. The overall heat-transfer coefficient is
 * DERIVED — what the sourced area must deliver to move the ruled power across the ruled
 * temperatures — and it can then be compared against a SOURCED band it was not fitted to. That
 * is one of the few non-circular cross-checks this design set has: the area comes from EPRI, the
 * band comes from a different source, and the ruled temperatures come from the owner. D3 §1a-v's
 * own earlier attempt at this landed at the ceiling of the band and was walked back the same day,
 * so the gate reports the number rather than just asserting a pass.
 *
 * Run: node test/run_pwr2_sg.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_sg.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_sources'].forEach(function (f) {
  require(path.join(E, f + '.js'));
});
var RD = globalThis.RD.pwr2, W = RD.water, SRCS = RD.sources;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: RD.water, core: RD.core, geometry: RD.geometry,
                             loop: RD.loop, sources: RD.sources } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.sg;';
  return new Function('RD_ROOT', body)(root);
}

function runSuite(G, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(50) +
      'got ' + got.toFixed(2) + ' want ' + want.toFixed(2) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function node(sys, id) {
    for (var i = 0; i < sys.nodes.length; i++) if (sys.nodes[i].id === id) return sys.nodes[i];
    return null;
  }
  /* Tavg of the primary, mass-weighted the way the shim will have to compute it. */
  function tavg(sys) {
    var mh = 0, m = 0;
    ['hot_leg', 'cold_leg'].forEach(function (id) {
      var n = node(sys, id), r = W.rho_from_h(n.h, sys.P), mm = r * n.V;
      mh += mm * W.T_from_h(n.h, sys.P); m += mm;
    });
    return mh / m;
  }

  /* ---- 1. THE DERIVED U, AGAINST A BAND IT WAS NOT FITTED TO ------------------------- */
  if (!quiet) console.log('\nOVERALL U  [DERIVED from sourced area + ruled duty; checked vs a SOURCED band]');
  var U = G.ratedU() * 1000;
  ckT('U lands inside the SOURCED 3,500-6,000 W/m2-K band', U > 3500 && U < 6000,
      U.toFixed(0) + ' W/m2-K  (D3 §1a-v computed 6,016 by an LMTD route and walked it back the ' +
      'same day; this uses the ruled Tavg difference)');
  ck('heat transfer area is the sourced EPRI figure', G.SG.area_m2, 18135 / 10.7639, 0.1, 'm2');
  ck('secondary inventory is the sourced Ginna figure', G.SG.mass_nominal, 12785, 1, 'kg');

  /* ---- 2. DUTY AT THE RULED POINT ---------------------------------------------------- */
  if (!quiet) console.log('\nDUTY  [300 MWt at the ruled temperatures -- TRUE BY CONSTRUCTION, labelled]');
  var d0 = G.stepSG(G.createSG(), 304.5, 0.02, {});
  ck('duty at the ruled Tavg  [by construction: U was derived from it]',
     d0.duty_kW / 1000, 300, 1.0, 'MWt');
  var dHot = G.stepSG(G.createSG(), 314.5, 0.02, {});
  ckT('duty RISES when the primary runs hotter', dHot.duty_kW > d0.duty_kW * 1.2,
      (dHot.duty_kW / 1000).toFixed(0) + ' MWt at +10 degC -- the coupling is live');
  /* 260 degC, genuinely BELOW the secondary's 272.1 degC saturation. The first draft used
   * 280 degC, which is still ABOVE it -- the check could not have gone the way it was asserting. */
  var dCold = G.stepSG(G.createSG(), 260, 0.02, {});
  ckT('and REVERSES when the primary is colder than the secondary', dCold.duty_kW < 0,
      (dCold.duty_kW / 1000).toFixed(1) + ' MWt at 260 degC (secondary Tsat ' +
      W.T_sat(G.createSG().P).toFixed(1) + ' degC)');

  /* ---- 3. INVENTORY AND THE SOURCED BOIL-DRY ----------------------------------------- */
  if (!quiet) console.log('\nINVENTORY  [the ledger, and the sourced boil-dry clock]');
  var sg = G.createSG();
  var hfg = W.h_g(sg.P) - W.h_f(sg.P), steamRated = 300000 / hfg;
  ckT('boil-dry from nominal is in the sourced family',
      G.boilDryTime(sg, steamRated) > 50 && G.boilDryTime(sg, steamRated) < 110,
      G.boilDryTime(sg, steamRated).toFixed(0) + ' s at rated steaming; Manuals/12 §8.1 sources ~78 s ' +
      'from the Ginna inventory');
  /* ---- THE DRIVING-TEMPERATURE CONTRACT ---------------------------------------------
   * `ratedU()` derives U at Tavg. Nothing forced a call site to PASS Tavg, and the first A/B run
   * passed the `sg_primary` node instead (#482, D1 §29.1/§29.5) -- 7.1 degC low, and the secondary
   * settled 89.5 psi off. An unstated contract is not a contract.
   *
   * This closes the loop end to end: build a primary, hold the secondary at its design pressure
   * the way the reference plant's control layer does, and check WHERE Tavg SETTLES. Driving on
   * Tavg lands the ruled 304.5 degC; driving on the SG node lands 15.3 degC high. The check is on
   * the plant's settled temperature rather than on which argument was passed, because an
   * argument-shaped check would pass for a helper that returned the wrong number. */
  if (!quiet) console.log('\nDRIVING TEMPERATURE  [ratedU derives at Tavg -- so a call site must PASS Tavg]');
  var S4 = SRCS, W4 = W;
  function settle(useTavg) {
    var sys = S4.createPlant({ h: W4.h_l(304.5, 15.41), P: 15.41 }), sg4 = G.createSG(), o = null;
    function nd(id) { for (var q = 0; q < sys.nodes.length; q++) if (sys.nodes[q].id === id) return sys.nodes[q]; }
    for (var t = 0; t < 45000; t++) {
      var Td = useTavg ? G.primaryTavg(sys) : W4.T_from_h(nd('sg_primary').h, sys.P);
      var duty = sg4.U * sg4.area * (Td - W4.T_sat(sg4.P));
      var st4 = duty / (W4.h_g(sg4.P) - G.SG.h_feed);
      o = G.stepSG(sg4, Td, 0.02, { feed: st4, steam: st4 });
      S4.stepPlant(sys, 0.02, { corePower: 300000, sgDuty: o.duty_kW });
    }
    return G.primaryTavg(sys);
  }
  var tavgOK = settle(true), tavgBad = settle(false);
  ck('driven on Tavg, the plant settles AT the ruled Tavg', tavgOK, 304.5, 0.5, 'degC');
  ckT('driven on the SG node instead, it does NOT  [the defect this contract prevents]',
      Math.abs(tavgBad - 304.5) > 5,
      'settles ' + tavgBad.toFixed(1) + ' degC, ' + (tavgBad - 304.5).toFixed(1) +
      ' degC off -- so the check above is not vacuous');
  ckT('primaryTavg() is the mean of the HOT and COLD LEGS, not one of them and not the lumps',
      (function () {
        /* THE LEGS MUST ACTUALLY HAVE COME APART, AND THE PLANT MUST STILL BE A PLANT.
         *
         * This fixture was wrong TWICE, in opposite directions, and both times it read as the
         * helper failing:
         *   - ONE 0.02 s step: the plant starts uniform, so every node still held the same
         *     enthalpy. |hot - cold| = 0 because nothing had propagated.
         *   - 3,000 steps at 300 MW in against 100 MW out: a 200 MW imbalance cooked the loop and
         *     BOTH legs pegged at 800 degC, the water library's ceiling. |hot - cold| = 0 again,
         *     for the opposite reason.
         *
         * An unphysical fixture does not announce itself -- it produces a clean, symmetric, very
         * believable zero. The drive is now BALANCED (300 in, 300 out), which differentiates the
         * legs by 31.7 degC in 60 s and leaves the plant inside its declared envelope. */
        var sy = S4.createPlant({ h: W4.h_l(304.5, 15.41), P: 15.41 });
        for (var w = 0; w < 3000; w++) S4.stepPlant(sy, 0.02, { corePower: 300000, sgDuty: 300000 });
        function nd2(id) { for (var q = 0; q < sy.nodes.length; q++) if (sy.nodes[q].id === id) return sy.nodes[q]; }
        var a = W4.T_from_h(nd2('hot_leg').h, sy.P), b = W4.T_from_h(nd2('cold_leg').h, sy.P);
        return Math.abs(G.primaryTavg(sy) - 0.5 * (a + b)) < 1e-9 && Math.abs(a - b) > 1e-6;
      })(), 'and the two nodes differ, so the mean is distinguishable from either');

  /* ---- CONSTRUCTION  [what an adversarial pass found this gate blind to] ------------------
   * Five layers were probed this way and every one had blind spots (D1 §31). Here the survivors
   * were `opts.mass` and `opts.U` -- and those two are not incidental: they are exactly the knobs
   * a CASUALTY is set up with. A degraded inventory is how you stage a boil-dry; a reduced U is
   * how you stage fouled or plugged tubes. A constructor that silently ignores them would make
   * every such probe quietly run a healthy generator while reporting that it had staged a sick
   * one. Same family as the pumpTripped blind spot in Layer 4. */
  if (!quiet) console.log('\nCONSTRUCTION  [the knobs a casualty is staged with]');
  var sgLow = G.createSG({ mass: 6000 });
  ck('caller inventory reaches the vessel  [staging a boil-dry]', sgLow.mass, 6000, 1e-9, 'kg');
  ckT('...and the boil-dry clock follows it',
      G.boilDryTime(sgLow, 100) < 0.55 * G.boilDryTime(G.createSG(), 100),
      G.boilDryTime(sgLow, 100).toFixed(0) + ' s against ' +
      G.boilDryTime(G.createSG(), 100).toFixed(0) + ' s at nominal -- a COMPARISON, not a band');
  var sgFoul = G.createSG({ U: G.ratedU() * 0.5 });
  ck('caller U reaches the tubes  [staging fouling]', sgFoul.U, G.ratedU() * 0.5, 1e-9, 'kW/m2-K');
  ckT('...and the duty follows it',
      Math.abs(G.stepSG(sgFoul, 304.5, 0.02, {}).duty_kW /
               G.stepSG(G.createSG(), 304.5, 0.02, {}).duty_kW - 0.5) < 1e-6,
      'half the coefficient moves half the heat -- so the argument is not cosmetic');

  var sgM = G.createSG(), M0 = sgM.mass;
  for (var k = 0; k < 500; k++) G.stepSG(sgM, 304.5, 0.02, { feed: 100, steam: 60 });
  ck('mass balance is exact on feed minus steam', sgM.mass - M0, 40 * 500 * 0.02, 1e-6, 'kg');
  /* THE THIRD STREAM (#507 wave 5): a ruptured tube's primary discharge — the overfill
   * hazard is the MASS landing (Ginna UFSAR §15.6.3), and it lands HOT. */
  var sgT = G.createSG(), MT0 = sgT.mass;
  for (var kt = 0; kt < 500; kt++) {
    G.stepSG(sgT, 304.5, 0.02, { feed: 60, steam: 100, tube_leak_kgs: 40, tube_leak_h: 1270 });
  }
  ck('the tube-leak stream lands in the mass ledger — feed 60 + leak 40 − steam 100 holds level',
     sgT.mass - MT0, 0, 1e-6, 'kg');
  var sgHot = G.createSG(), sgCold = G.createSG();
  for (var kh = 0; kh < 500; kh++) {
    G.stepSG(sgHot, 304.5, 0.02, { tube_leak_kgs: 40, tube_leak_h: 1270 });
    G.stepSG(sgCold, 304.5, 0.02, { afw_kgs: 40, afw_h: 90 });
  }
  ckT('...and it lands HOT: 40 kg/s at primary enthalpy pressurizes the secondary where the ' +
      'same flow of cold AFW water suppresses it',
      sgHot.P > sgCold.P + 0.05,
      sgHot.P.toFixed(3) + ' vs ' + sgCold.P.toFixed(3) + ' MPa after 10 s — the stream is ' +
      'energy, not just mass');
  var sgD = G.createSG(), lastD = null, clippedD = false;
  for (var kd = 0; kd < 5000; kd++) {
    lastD = G.stepSG(sgD, 304.5, 0.02, { steam: 200 });
    if (lastD.h_clipped) clippedD = true;
  }
  ckT('a generator with no feed goes DRY and stays bounded', sgD.dry !== false && sgD.mass >= 1,
      sgD.mass.toFixed(1) + ' kg after 100 s of steaming with no feed');

  /* ---- DRYOUT (#510 H-1). Before the fix a 1 kg secondary transferred rated UA against a
   * pressure pinned at the 0.1 MPa property floor — 1.88 GW out of the primary in one step,
   * the review's headline. Heat transfer now scales with the wetted fraction (the old
   * engine's own shape at the shared Ginna level map's 30 % wide point), and the vessel
   * cannot export steam it does not hold. ---- */
  ckT('DRY, the vessel STARVES its export — delivered ~0 with the demand standing',
      lastD.steam_starved === true && lastD.steam_delivered_kgs < 0.5,
      'delivered ' + lastD.steam_delivered_kgs.toFixed(3) + ' kg/s against 200 demanded');
  ckT('...and the dry secondary EQUILIBRATES toward the primary instead of pinning at the ' +
      'property floor as a 211 degF infinite sink',
      sgD.P > 1.0,
      'P ' + sgD.P.toFixed(2) + ' MPa after the boil-dry (the pre-fix defect pinned 0.1)');
  var sgDry = G.createSG({ mass: 1 });
  var dDry = G.stepSG(sgDry, 304.5, 0.02, {});
  ckT('a dry SG is a NEAR-ZERO heat sink — duty collapses with the wetted fraction',
      Math.abs(dDry.duty_kW) < 5000 && dDry.wet_frac < 0.001,
      'duty ' + dDry.duty_kW.toFixed(0) + ' kW at 1 kg (rated is 300,000); wet ' +
      dDry.wet_frac.toExponential(1));
  ckT('the wetted fraction is 1 above the threshold and proportional below it',
      Math.abs(G.stepSG(G.createSG(), 304.5, 0.02, {}).wet_frac - 1) < 1e-9 &&
      Math.abs(G.stepSG(G.createSG({ mass: 0.2 * 12785 }), 304.5, 0.02, {}).wet_frac -
               0.2 / G.SG.dryout_mass_frac) < 1e-6,
      'nominal reads 1; 20 % inventory reads 0.2/0.38845');
  ckT('the h backstop is a BACKSTOP — it never binds on a fed transient',
      (function () {
        var s5 = G.createSG(), hit = false;
        for (var k5 = 0; k5 < 500; k5++) {
          if (G.stepSG(s5, 304.5, 0.02, { feed: 100, steam: 60 }).h_clipped) hit = true;
        }
        return !hit;
      })(), 'clipping on a healthy vessel would mean the ledger left the saturation span');

  /* ---- 4. THE SECONDARY SITS ON ITS SATURATION LINE ---------------------------------- */
  if (!quiet) console.log('\nSATURATION  [a lumped boiling vessel is ON the line by construction]');
  [0.5, 2.0, 5.688, 7.03].forEach(function (P) {
    var s2 = G.createSG({ P: P });
    ck('P follows h_f at ' + P + ' MPa', s2.P, P, 1e-3, 'MPa');
  });
  var sgP = G.createSG();
  var P0 = sgP.P;
  for (var kp = 0; kp < 200; kp++) G.stepSG(sgP, 314.5, 0.02, { feed: 0, steam: 0 });
  ckT('bottling the generator raises its pressure', sgP.P > P0,
      P0.toFixed(3) + ' -> ' + sgP.P.toFixed(3) + ' MPa with heat in and no steam out');

  /* ---- 5. A5 -- THE COUPLING THIS LAYER EXISTS FOR ------------------------------------ */
  if (!quiet) console.log('\nA5: THE SG IS THE ONLY HEAT SINK  [inexpressible before this layer]');
  /* START AT THE DESIGN POINT. The first draft started the primary at h = 1250 kJ/kg, which is
   * 283 degC -- twenty degrees BELOW the ruled Tavg. The generator then could not take 300 MWt at
   * that dT, the secondary steamed itself down, and a depressurising secondary opened the dT until
   * it was ripping heat out of the primary. That runaway is real physics for a generator steamed
   * harder than the primary can supply; it was simply not the test I meant to write. */
  var H_RATED = W.h_l(304.5, 15.41);
  function ride(cutFeedAt, steps) {
    var plant = SRCS.createPlant({ h: H_RATED, P: 15.41 });
    var sg = G.createSG();
    var out = [];
    for (var i = 0; i < steps; i++) {
      var feeding = i < cutFeedAt;
      var d = G.stepSG(sg, tavg(plant), 0.02, {
        feed: feeding ? steamRated : 0, steam: feeding ? steamRated : steamRated * 0.3
      });
      SRCS.stepPlant(plant, 0.02, { corePower: 300000, sgDuty: d.duty_kW });
      if (i === cutFeedAt - 1 || i === steps - 1) out.push({ T: tavg(plant), m: sg.mass, P: plant.P });
    }
    return out;
  }
  var withFeed = ride(4000, 4000);          // fed the whole way
  var cutFeed = ride(400, 4000);            // feed lost at 8 s, then 80 s of boil-off
  ckT('with feed, primary temperature is held', Math.abs(withFeed[withFeed.length - 1].T - 304.5) < 25,
      'Tavg ' + withFeed[withFeed.length - 1].T.toFixed(1) + ' degC after 80 s at full power');
  ckT('LOSE THE FEED AND THE PRIMARY HEATS UP -- there is nowhere else for the energy to go',
      cutFeed[cutFeed.length - 1].T > withFeed[withFeed.length - 1].T + 3,
      'Tavg ' + withFeed[withFeed.length - 1].T.toFixed(1) + ' fed -> ' +
      cutFeed[cutFeed.length - 1].T.toFixed(1) + ' degC starved');
  ckT('...and the secondary inventory is what ran out',
      cutFeed[cutFeed.length - 1].m < withFeed[withFeed.length - 1].m * 0.9,
      'SG mass ' + cutFeed[cutFeed.length - 1].m.toFixed(0) + ' kg starved vs ' +
      withFeed[withFeed.length - 1].m.toFixed(0) + ' fed');
  ckT('...and primary PRESSURE follows the temperature up (A3 riding along)',
      cutFeed[cutFeed.length - 1].P > withFeed[withFeed.length - 1].P,
      withFeed[withFeed.length - 1].P.toFixed(3) + ' -> ' +
      cutFeed[cutFeed.length - 1].P.toFixed(3) + ' MPa');
}

console.log('\nPWR2 Layer 5 -- the lumped SG secondary');
var G = loadFrom(SRC), rec = [];
runSuite(G, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['heat transfer decoupled from the primary temperature',
   'var Q = sg.U * wet * sg.area * (primaryT - T_sec);', 'var Q = 300000;'],
  ['duty sign flipped (the SG heats the primary)',
   'var Q = sg.U * wet * sg.area * (primaryT - T_sec);',
   'var Q = -sg.U * wet * sg.area * (primaryT - T_sec);'],
  ['the dryout wet fraction deleted (a dry SG transfers rated UA — #510 H-1 re-armed)',
   'var Q = sg.U * wet * sg.area * (primaryT - T_sec);',
   'var Q = sg.U * sg.area * (primaryT - T_sec);'],
  ['the outflow limiter deleted (the vessel exports steam it does not hold — #510 H-1 re-armed)',
   'var steam_eff = Math.min(steam, Math.max(0, (sg.mass - SG.mass_floor_kg) / dt + inflow));',
   'var steam_eff = steam;'],
  ['sourced area replaced by a round number', 'area_m2: 18135 / 10.7639,', 'area_m2: 1500,'],
  ['sourced inventory replaced', 'mass_nominal: 12785,', 'mass_nominal: 40000,'],
  ['feedwater arrives at steam enthalpy instead of the sourced 435 degF',
   'feed * SG.h_feed', 'feed * W.h_g(sg.P)'],
  ['the tube-leak stream is dropped from the MASS ledger (an SGTR that never overfills)',
   'var inflow = feed + afw + leak;', 'var inflow = feed + afw;'],
  ['the tube-leak stream carries no ENERGY (hot primary water arrives cold)',
   'afw * h_afw + leak * h_leak - steam_eff * h_g;', 'afw * h_afw - steam_eff * h_g;'],
  ['steam leaves as liquid instead of vapour', '- steam_eff * h_g;', '- steam_eff * W.h_f(sg.P);'],
  ['secondary mass not integrated (inventory frozen)',
   'var m_new = sg.mass + dt * dM;', 'var m_new = sg.mass;'],
  ['secondary pressure frozen (no saturation tracking)',
   'sg.P = mid;\n    return sg.P;', 'return sg.P;'],
  ['U derived from the wrong power (breaks the sourced-band check)',
   'return 300000 / (SG.area_m2 * (T_prim - T_sec));', 'return 700000 / (SG.area_m2 * (T_prim - T_sec));'],
  /* The contract itself: a helper that hands back one node instead of the mean is exactly the
   * defect #482 filed, so it must not survive. */
  ['primaryTavg returns the cold leg instead of the mean (the #482 defect, re-armed)',
   /* anchor re-pointed #514: primaryTavg reads TFH (the vtable idiom) now */
   'return 0.5 * (TFH(hot.h, sys.P) + TFH(cold.h, sys.P));',
   'return TFH(cold.h, sys.P);'],
  /* The LUMP-vs-LEG confusion, re-armed. It costs only 0.14 degF today, which is exactly why it
   * needs a mutation: nothing else in this gate would notice, and the two come apart the moment
   * the core and the hot leg stop sharing an enthalpy. */
  ['primaryTavg averages the core LUMP instead of the hot LEG',
   "if (sys.nodes[i].id === 'hot_leg') hot = sys.nodes[i];",
   "if (sys.nodes[i].id === 'core') hot = sys.nodes[i];"],
  /* The two an adversarial CONSTRUCTION pass found -- both of them casualty-staging knobs. */
  ['caller inventory ignored at construction (every boil-dry probe stages a healthy SG)',
   'mass: opts.mass === undefined ? SG.mass_nominal : opts.mass,', 'mass: SG.mass_nominal,'],
  ['caller U ignored at construction (every fouling probe stages clean tubes)',
   'U: opts.U === undefined ? ratedU() : opts.U,', 'U: ratedU(),']
];

/* ---- THE CLEAN-RUN GUARD --------------------------------------------------------------
 * A MUTATION SELF-TEST IS ONLY MEANINGFUL IF THE UNMUTATED SUITE IS GREEN. If any check fails in
 * the clean run it fails in every mutant too, so `f2 > 0` holds unconditionally and EVERY mutation
 * is reported as caught. Coverage then reads 25/25 while the suite is measuring nothing.
 *
 * MEASURED in run_pwr2_kinetics.js, 2026-08-16: a fixture producing NaN made one check fail in the
 * clean run. The self-test reported 23/25. Fixing that ONE check dropped it to 21/25 -- the two
 * extra "caught" mutations had never been caught by anything, and both were genuinely blind.
 *
 * So the tally is REFUSED, not annotated, when the clean run is red. */
if (fail > 0) {
  /* PRINT THE SCORE FIRST. run_all parses this line to report drift; exiting without it
   * makes a legitimately-failing gate read as `score ?`, which is LESS informative than
   * before the guard existed. The guard refuses the MUTATION TALLY, not the tally line. */
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
  else console.log('  caught    ' + m[0].padEnd(58) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_sg: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
