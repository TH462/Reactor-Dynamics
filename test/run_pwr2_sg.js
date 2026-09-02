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
var MUT = require('./mut_flags.js');   /* --no-mutations / --mut= / --grp= (#602) */
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

/* runSuite(G, rec, quiet, only) — `only` scopes a MUTATION REPLAY to the section group that
 * can see that mutation (#513, the run_pwr2_engine idiom): 'A' the sourced anchors, 'B' the
 * duty couplings, 'C1' inventory/construction/tube-leak/dryout, 'C2' the driving-temperature
 * settle pair (the expensive one — 2×45k steps; only the two mutations that need it pay it),
 * 'C3' the primaryTavg mean-of-legs contract, 'D' the saturation line. Section 5 (A5) runs
 * clean-pass only. Each named group is preflighted ALONE on the clean build. */
function runSuite(G, rec, quiet, only) {
  function grp(g) { return only === undefined || only === g; }
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
  /* hoisted from section 3 (#513): section 5's ride() reads steamRated too, and groups C2/C3
   * both read the S4/W4 aliases, so these live above the group seams rather than inside one */
  var hfg = W.h_g(G.createSG().P) - W.h_f(G.createSG().P), steamRated = 300000 / hfg;
  var S4 = SRCS, W4 = W;

  if (grp('A')) {
  /* ---- 1. THE DERIVED U, AGAINST A BAND IT WAS NOT FITTED TO ------------------------- */
  if (!quiet) console.log('\nOVERALL U  [DERIVED from sourced area + ruled duty; checked vs a SOURCED band]');
  var U = G.ratedU() * 1000;
  ckT('U lands inside the SOURCED 3,500-6,000 W/m2-K band', U > 3500 && U < 6000,
      U.toFixed(0) + ' W/m2-K  (D3 §1a-v computed 6,016 by an LMTD route and walked it back the ' +
      'same day; this uses the ruled Tavg difference)');
  ck('heat transfer area is the sourced EPRI figure', G.SG.area_m2, 18135 / 10.7639, 0.1, 'm2');
  ck('secondary inventory is the sourced Ginna figure', G.SG.mass_nominal, 12785, 1, 'kg');
  }

  if (grp('B')) {
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
  }

  if (grp('C1')) {
  /* ---- 3. INVENTORY AND THE SOURCED BOIL-DRY ----------------------------------------- */
  if (!quiet) console.log('\nINVENTORY  [the ledger, and the sourced boil-dry clock]');
  var sg = G.createSG();
  ckT('boil-dry from nominal is in the sourced family',
      G.boilDryTime(sg, steamRated) > 50 && G.boilDryTime(sg, steamRated) < 110,
      G.boilDryTime(sg, steamRated).toFixed(0) + ' s at rated steaming; Manuals/12 §8.1 sources ~78 s ' +
      'from the Ginna inventory');
  }

  if (grp('C2')) {
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
  }

  if (grp('C3')) {
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
  }

  if (grp('C1')) {
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
  /* THE CLAIM IS THE ENDPOINT, NOT A SAMPLE (#549, 2026-08-27). This read `sgD.P > 1.0` on
   * the state left by the loop above — a fixed t = 100 s sample of a climb that takes the
   * vessel from the floor to the primary's saturation in ~2 minutes. #549's energy limiter
   * slows the LAST seconds of the drain (dry at 99.24 s where the mass-only limiter went dry
   * at 63.92 s — correct: the final kilograms cannot leave as vapour without the heat to
   * raise them), so the same sample landed at 0.585 MPa mid-climb and the check reddened
   * while the mechanism it names was untouched. MEASURED ON BOTH: the pre-#549 mass-only
   * limiter and the current one BOTH equilibrate at 9.145 MPa = Psat(304.5 degC) exactly, so
   * this form passes on the old behaviour too — it is a better test, not a refitted one. */
  for (var kd2 = 0; kd2 < 15000; kd2++) G.stepSG(sgD, 304.5, 0.02, { steam: 200 });
  ckT('...and the dry secondary EQUILIBRATES toward the primary instead of pinning at the ' +
      'property floor as a 211 degF infinite sink',
      Math.abs(sgD.P - W.P_sat(304.5)) < 0.01 && sgD.P > 1.0,
      'P ' + sgD.P.toFixed(3) + ' MPa at equilibrium vs Psat(304.5 degC) = ' +
      W.P_sat(304.5).toFixed(3) + ' (the pre-fix defect pinned 0.1)');
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

  /* ---- #549: THE DRY WALL'S ENERGY LIMITER. The check above is the one that made the
   * defect invisible — it feeds a HEALTHY vessel (12,785 kg) at 100 kg/s against 60 kg/s of
   * demand, where the clip cannot bind and inflow > demand. The defect lived at the MASS
   * FLOOR with a standing demand, which no fixture here reached: `steam_eff` reduced to
   * `inflow`, so 6,526 kg went in and 6,526 kg came straight back out as steam, net 0.000,
   * and the clip supplied 96 % of the latent heat. The claim is RECOVERY: a dry generator
   * that is fed must gain mass even with the steam demand standing. ---- */
  if (!quiet) console.log('\nTHE DRY WALL  [#549 — a boiled-dry vessel must not be an absorbing state]');
  /* THE FIXTURE'S PRIMARY TEMPERATURE IS THE WHOLE TEST, and TWO drafts of these checks got it
   * wrong in the same way — worth recording, because the wrong fixture looked like a failed fix.
   * ANY constant primaryT finds a BOIL EQUILIBRIUM: the vessel accumulates until its wetted
   * fraction carries exactly the duty that boiling the inflow costs. At 304.5 degC that lands
   * at 37 kg; at 120 degC it lands at 370 kg, because 0.0745 of the wetted bundle across a
   * 20 degC approach is still 14.03 MW against the 14.07 MW that boiling 5.44 kg/s of 70 degF
   * water costs. Both are HONEST heat balances and neither is the defect. The defect is a
   * vessel exporting vapour THE HEAT DID NOT MAKE, so the fixture has to take the heat away
   * for real: build the vessel AT the property floor (where h IS h_lo, so the clip has
   * nothing left to give) and hold the primary at that pressure's own saturation, so the
   * duty is zero by construction rather than by hope.
   * RE-BASED 2026-08-31 (#524): the floor moved 0.1 -> 0.002 MPa and the fixture moved WITH
   * it — at 0.1 the old "zero-duty" primary (99.6 degC) now stands 82 degC PROUD of a
   * secondary that can finally cool below 211 degF, so the vessel boiled its inflow honestly
   * and the refill assertion read the fix as a defect. At the new floor the same claim holds
   * one step colder; the 70 degF CST inflow (88.5 kJ/kg) is now slightly ABOVE the floor
   * enthalpy (h_f(0.002) ~ 73 kJ/kg), so a small honest boil-off (~0.03 kg/s) rides along. */
  var P_FLOOR = W.LIMITS.P_MIN, T_FLOOR = W.T_sat(P_FLOOR), H_AFW = 88.5, AFW_KGS = 5.44;
  var sgR = G.createSG({ P: P_FLOOR, mass: 1 }), inR = 0, outR = 0, clipR = 0, nR = 0;
  for (var kr = 0; kr < 30000; kr++) {          /* 600 s of AFW into a dry, steaming vessel */
    var rr = G.stepSG(sgR, T_FLOOR, 0.02, { afw_kgs: AFW_KGS, afw_h: H_AFW, steam: 60 });
    inR += AFW_KGS * 0.02; outR += rr.steam_delivered_kgs * 0.02;
    nR++; if (rr.h_clipped) clipR++;
  }
  ckT('feeding a DRY generator with NO duty to boil it RE-FILLS it — mass in is not mass ' +
      'straight back out',
      sgR.mass > 3000 && (inR - outR) > 3000,
      'in ' + inR.toFixed(1) + ' kg, out ' + outR.toFixed(1) + ' kg, NET ' +
      (inR - outR).toFixed(1) + ' kg over 600 s; vessel ' + sgR.mass.toFixed(0) + ' kg ' +
      '(the pre-fix ledger gave NET 0.000 kg — it exported every kilogram fed to it)');
  ckT('...and the export is ENERGY-starved there, not mass-starved — the wall is NAMED, ' +
      'because the operator\'s action differs (no water vs no heat)',
      (function () {
        /* inflow AT the floor enthalpy for this probe — with the #524 floor below the 70 degF
         * CST temperature, 88.5 kJ/kg water carries a real (small) boil and the "delivers
         * 0.000" claim needs genuinely heat-free inflow to stay exact */
        var s6 = G.createSG({ P: P_FLOOR, mass: 1 });
        var r6 = G.stepSG(s6, T_FLOOR, 0.02, { afw_kgs: AFW_KGS, afw_h: W.h_f(P_FLOOR), steam: 60 });
        return r6.steam_starved === true && r6.energy_starved === true &&
               r6.mass_starved === false && r6.steam_delivered_kgs < 1e-9;
      })(), 'a vessel holding water it has no heat to boil reports energy_starved and ' +
            'delivers 0.000 kg/s; the pre-fix ledger delivered the whole 5.44 kg/s inflow');
  /* THE RESIDUAL IS RETIRED (#524, 2026-08-31). This check used to assert the clip's binding
   * was CONFINED to the subcooled-inflow-at-the-floor case (~2,996/30,000 steps here, 0.4 MJ
   * on the filed #549 transient) — the one state the pre-#524 library could not represent,
   * because 70 degF feedwater sat below h_f(0.1 MPa) = 417.5. With the floor at 0.002 MPa the
   * floor enthalpy is ~73 kJ/kg, BELOW every physical inflow this plant has, so that state is
   * representable and the clip must not bind AT ALL on this transient. A clip that binds now
   * is a new defect, not a declared residual. */
  ckT('...and the backstop clip no longer binds at all — the #524 subcooled-inflow residual ' +
      'is RETIRED with the floor extension',
      (function () {
        var s9 = G.createSG({ P: P_FLOOR, mass: 1 }), hits = 0;
        for (var k9 = 0; k9 < 30000; k9++) {
          if (G.stepSG(s9, T_FLOOR, 0.02, { afw_kgs: AFW_KGS, afw_h: H_AFW, steam: 60 }).h_clipped) hits++;
        }
        return hits === 0 && clipR === 0;
      })(),
      'clipR ' + clipR + '/' + nR + ' on the refill fixture — pre-#524 this read 2996, ' +
      'declared; now the floor is below every physical inflow and 0 is the only honest count');
  /* THE SHARPEST FORM: the ledger, not the trajectory. A trajectory check is satisfied by a
   * vessel that happens to sit at an equilibrium — which is exactly how the two wrong fixtures
   * above passed for the wrong reason on the old code's neighbours. This one asks whether the
   * CLIP is funding the export at all, and it holds on any fixture. Pre-fix it supplied 96 %
   * of the latent heat: 16,236 MJ = 13.5 MW against 0.374 MW of real primary duty. */
  ckT('the clip funds ~none of the exported latent heat — the energy comes from the primary',
      (function () {
        /* h_lo8 follows the #524 floor — measured against the retired h_f(0.1) reference this
         * check counted honest below-417 enthalpy as fabricated and reddened on the fix */
        var s8 = G.createSG({ mass: 1 }), fabMJ = 0, latMJ = 0, h_lo8 = W.h_f(W.LIMITS.P_MIN);
        for (var k8 = 0; k8 < 30000; k8++) {
          var m0 = s8.mass, hh0 = s8.h, P0 = s8.P;
          var r8 = G.stepSG(s8, 120, 0.02, { afw_kgs: AFW_KGS, afw_h: H_AFW, steam: 60 });
          latMJ += r8.steam_delivered_kgs * (W.h_g(P0) - H_AFW) * 0.02 / 1000;
          if (r8.h_clipped) {
            var hUn = (m0 * hh0 + 0.02 * (r8.duty_kW + AFW_KGS * H_AFW -
                       r8.steam_delivered_kgs * W.h_g(P0))) / s8.mass;
            if (hUn < h_lo8) fabMJ += (h_lo8 - hUn) * s8.mass / 1000;
          }
        }
        return fabMJ < 0.05 * Math.max(latMJ, 1) && fabMJ < 100;
      })(),
      'pre-fix the h_f(0.1 MPa) clip supplied 96 % of it — 16,236 MJ = 13.5 MW ' +
      '(46.2 MMBtu/hr) against 0.374 MW of real primary duty');
  ckT('the limiter is INERT on a healthy vessel — it must not make the plant heat-limited ' +
      'at every operating point (why h_lo, not h_f(P), is the reference)',
      (function () {
        var s7 = G.createSG(), starved = false;
        for (var k7 = 0; k7 < 3000; k7++) {
          if (G.stepSG(s7, 304.5, 0.02, { feed: 165, steam: 165 }).energy_starved) starved = true;
        }
        return !starved;
      })(), 'an h_f(P) reference would bind at steady full power, since h IS h_f(P) here');

  /* ---- #562: THE WET WALL. The mirror of everything above. The lump had NO volume limit:
   * measured full-stack on a loss of offsite power with the flow control valves left open,
   * the generator reached 861.7 % of nominal (242,866 lbm in a shell rated for 28,186) at
   * five hours and was still filling, with both gauges pegged. Both points of the wall come
   * off SG.LEVEL_MAP, so there is nothing here to keep in step by hand. ---- */
  if (!quiet) console.log('\nTHE WET WALL  [#562 — carryover, then a shell that cannot hold more]');
  ckT('the wall reads the plant\'s OWN level map — carryover at the top of the narrow range, ' +
      'solid at the top of the instrument',
      (function () {
        var M = G.SG.LEVEL_MAP, wide = {}, i;
        for (i = 0; i < M.length; i++) wide[M[i][1]] = M[i][0];
        return Math.abs(G.SG.carryover_mass_frac - wide[75]) < 1e-9 &&
               Math.abs(G.SG.mass_full_frac - wide[100]) < 1e-9 &&
               Math.abs(G.SG.dryout_mass_frac - wide[30]) < 1e-9;
      })(),
      'three constants, one curve — a second copy is the #557/#556/#561 shape and this is ' +
      'where it would start');
  ckT('a NORMAL vessel exports DRY steam — the wall is inert everywhere the plant lives',
      (function () {
        var r = G.stepSG(G.createSG(), 304.5, 0.02, { feed: 165, steam: 165 });
        return r.carryover_frac === 0 && r.solid === false &&
               Math.abs(r.steam_out_h - W.h_g(G.createSG().P)) < 1e-9;
      })(), 'at nominal the export enthalpy must be h_g exactly, as it was before #562');
  /* THE PRESSURE MUST BE READ BEFORE THE STEP. A first draft compared `steam_out_h` against
   * `W.h_g(sgC.P)` with sgC.P read AFTER stepSG had moved it, and the "carryover deleted"
   * mutation came back BLIND — the post-step pressure had shifted enough for h_g to land the
   * wrong side of the comparison. A check that reads its own reference from mutated state is
   * not a check. */
  ckT('above the top of the NARROW range the export starts carrying water',
      (function () {
        var mid = 0.5 * (G.SG.carryover_mass_frac + G.SG.mass_full_frac) * G.SG.mass_nominal;
        var sgC = G.createSG({ mass: mid }), P0 = sgC.P;
        var r = G.stepSG(sgC, 304.5, 0.02, { feed: 165, steam: 165 });
        return r.carryover_frac > 0.45 && r.carryover_frac < 0.55 &&
               r.steam_out_h < W.h_g(P0) - 100 && r.steam_out_h > W.h_f(P0) - 1e-6;
      })(),
      'halfway up the band the export is ~half liquid — the TS Bases\' "carryover of water ' +
      'into the steam lines"');
  /* ...AND THE LEDGER BOOKS IT. Separate check, because `carryover_frac` and `steam_out_h`
   * are REPORTED fields: a dH that kept using h_g would leave both of them correct and every
   * trajectory check above still passing, while the vessel quietly lost energy it was
   * carrying out as water. This is the ENERGY IDENTITY over one step, which nothing else
   * here asserts — the mutation that books the export at h_g was BLIND until it existed. */
  ckT('...and the ENERGY LEDGER books the export at that enthalpy, not at h_g',
      (function () {
        var mid = 0.5 * (G.SG.carryover_mass_frac + G.SG.mass_full_frac) * G.SG.mass_nominal;
        var sgC = G.createSG({ mass: mid });
        var m0 = sgC.mass, h0 = sgC.h, dt = 0.02, feed = 165, steam = 165;
        var r = G.stepSG(sgC, 304.5, dt, { feed: feed, steam: steam });
        var expect = (m0 * h0 + dt * (r.duty_kW + feed * G.SG.h_feed -
                      r.steam_delivered_kgs * r.steam_out_h)) / sgC.mass;
        return !r.h_clipped && Math.abs(sgC.h - expect) < 1e-6 * Math.abs(expect);
      })(),
      'closes m1*h1 = m0*h0 + dt*(Q + feed*h_feed - steam*h_out) exactly; booking at h_g ' +
      'over-drains a carrying-over vessel by (h_g - h_out) per kilogram');
  ckT('THE WALL ITSELF: a full shell passes what it takes, whatever the valves ask',
      (function () {
        var full = G.SG.mass_full_frac * G.SG.mass_nominal;
        var sgF = G.createSG({ mass: full });
        var r = G.stepSG(sgF, 304.5, 0.02, { feed: 50, afw_kgs: 5.44, afw_h: 88.5, steam: 0 });
        return r.solid === true && Math.abs(r.steam_delivered_kgs - 55.44) < 1e-6 &&
               sgF.mass <= full + 1e-6;
      })(),
      'demand ZERO and 55.44 kg/s arriving — the export is forced to 55.44, because the ' +
      'alternative is inventing volume');
  ckT('...and it holds against a LONG fill, monotone, from nominal',
      (function () {
        var sgL = G.createSG(), peak = 0;
        for (var kL = 0; kL < 200000; kL++) {           /* 4,000 s at 40 kg/s net inflow */
          G.stepSG(sgL, 304.5, 0.02, { feed: 90, steam: 50 });
          if (sgL.mass > peak) peak = sgL.mass;
        }
        return peak <= G.SG.mass_full_frac * G.SG.mass_nominal * 1.0001;
      })(),
      'peak inventory cannot pass the map\'s own 100 % wide-range point; the unwalled ' +
      'ledger reached 8.617x nominal full-stack');
  ckT('the wall does not FREEZE the vessel — a solid generator that stops being fed drains ' +
      'again (a one-way clamp would be a new absorbing state, the #549 mistake mirrored)',
      (function () {
        var sgD2 = G.createSG({ mass: G.SG.mass_full_frac * G.SG.mass_nominal });
        for (var kD = 0; kD < 5000; kD++) G.stepSG(sgD2, 304.5, 0.02, { steam: 50 });
        return sgD2.mass < G.SG.mass_full_frac * G.SG.mass_nominal * 0.98;
      })(), '');
  }

  if (grp('D')) {
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
  }

  if (grp('E')) {
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
}

console.log('\nPWR2 Layer 5 -- the lumped SG secondary');
var G = loadFrom(SRC), rec = [];
runSuite(G, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

/* Each entry's trailing { grp } names the section group that can SEE it (#513) — the replay
 * runs only that group, and the BLIND check still reds the runner if the tag is wrong. */
var MUTATIONS = [
  ['heat transfer decoupled from the primary temperature',
   'var Q = sg.U * wet * sg.area * (primaryT - T_sec);', 'var Q = 300000;', { grp: 'B' }],
  ['duty sign flipped (the SG heats the primary)',
   'var Q = sg.U * wet * sg.area * (primaryT - T_sec);',
   'var Q = -sg.U * wet * sg.area * (primaryT - T_sec);', { grp: 'B' }],
  ['the dryout wet fraction deleted (a dry SG transfers rated UA — #510 H-1 re-armed)',
   'var Q = sg.U * wet * sg.area * (primaryT - T_sec);',
   'var Q = sg.U * sg.area * (primaryT - T_sec);', { grp: 'C1' }],
  /* THE ANCHOR MOVED WITH #549 (2026-08-27) — the one line became three, and a mutation whose
   * anchor has been refactored away goes BLIND, which the runner reports but which is easy to
   * wave through. Re-pointed at the surviving `min`, and the two halves now have an anchor
   * each so deleting either one is caught separately. */
  ['the outflow limiter deleted (the vessel exports steam it does not hold — #510 H-1 re-armed)',
   'var steam_eff = Math.min(steam, Math.max(0, s_mass), Math.max(0, s_energy));',
   'var steam_eff = steam;', { grp: 'C1' }],
  ['the MASS half of the limiter deleted (#510 H-1 re-armed on its own)',
   'var steam_eff = Math.min(steam, Math.max(0, s_mass), Math.max(0, s_energy));',
   'var steam_eff = Math.min(steam, Math.max(0, s_energy));', { grp: 'C1' }],
  ['the ENERGY half deleted (a boiled-dry SG is an absorbing state again — #549 re-armed)',
   'var steam_eff = Math.min(steam, Math.max(0, s_mass), Math.max(0, s_energy));',
   'var steam_eff = Math.min(steam, Math.max(0, s_mass));', { grp: 'C1' }],
  ['the energy limiter loses the inflow-heating term (it over-permits the export)',
   'var s_energy = (sg.mass * (sg.h - h_lo) + dt * (E_in - h_lo * inflow)) /',
   'var s_energy = (sg.mass * (sg.h - h_lo) + dt * E_in) /', { grp: 'C1' }],
  ['the energy limiter is referenced at h_f(P) instead of the property floor (the plant goes ' +
   'heat-limited at every operating point)',
   'var s_energy = (sg.mass * (sg.h - h_lo) + dt * (E_in - h_lo * inflow)) /',
   'var s_energy = (sg.mass * (sg.h - W.h_f(sg.P)) + dt * (E_in - W.h_f(sg.P) * inflow)) /',
   { grp: 'C1' }],

  /* ---- #562: THE WET WALL ---------------------------------------------------------------- */
  ['the SOLID limiter deleted (the shell accepts unbounded water — #562 re-armed)',
   'if (solid) steam_eff = Math.max(0, s_solid);', '', { grp: 'C1' }],
  ['the vessel is declared full at TWICE its own level map (the wall moves off the geometry)',
   'mass_full_frac: 2.45,', 'mass_full_frac: 4.9,', { grp: 'C1' }],
  ['carryover deleted (an overfilled generator still exports DRY steam)',
   'var h_out = h_f_now + x_out * (h_g - h_f_now);', 'var h_out = h_g;', { grp: 'C1' }],
  ['carryover starts at the top of the WIDE range instead of the narrow (it never engages ' +
   'before the vessel is solid)',
   'carryover_mass_frac: 1.32929,', 'carryover_mass_frac: 2.44,', { grp: 'C1' }],
  ['the export enthalpy is not carried into the ledger (carryover reported, never booked)',
   'var dH = E_in - steam_eff * h_out;', 'var dH = E_in - steam_eff * h_g;', { grp: 'C1' }],
  ['the level map is repointed so dryout and the wall read different geometry',
   'LEVEL_MAP: [[0, 0], [0.38845, 30], [0.5484, 37.65], [1.0, 59.25], [1.32929, 75], [2.45, 100]],',
   'LEVEL_MAP: [[0, 0], [0.5, 30], [0.6, 37.65], [1.0, 59.25], [1.5, 75], [3.0, 100]],',
   { grp: 'C1' }],
  ['sourced area replaced by a round number', 'area_m2: 18135 / 10.7639,', 'area_m2: 1500,',
   { grp: 'A' }],
  ['sourced inventory replaced', 'mass_nominal: 12785,', 'mass_nominal: 40000,', { grp: 'A' }],
  ['feedwater arrives at steam enthalpy instead of the sourced 435 degF',
   'feed * SG.h_feed', 'feed * W.h_g(sg.P)', { grp: 'C2' }],
  ['the tube-leak stream is dropped from the MASS ledger (an SGTR that never overfills)',
   'var inflow = feed + afw + leak;', 'var inflow = feed + afw;', { grp: 'C1' }],
  /* RE-POINTED at E_in (#549, 2026-08-27): the enthalpy sum moved OUT of `dH` and above the
   * limiters, because the energy limiter needs the same number. The old anchor named the dH
   * line and went BLIND on the refactor — the runner said so, which is the only reason it was
   * caught. Read the self-test line, not just the checks tally. */
  ['the tube-leak stream carries no ENERGY (hot primary water arrives cold)',
   'var E_in = Q + feed * SG.h_feed + afw * h_afw + leak * h_leak;',
   'var E_in = Q + feed * SG.h_feed + afw * h_afw;', { grp: 'C1' }],
  ['steam leaves as liquid instead of vapour', 'var h_out = h_f_now + x_out * (h_g - h_f_now);',
   'var h_out = h_f_now;',
   { grp: 'C2' }],
  ['secondary mass not integrated (inventory frozen)',
   'var m_new = sg.mass + dt * dM;', 'var m_new = sg.mass;', { grp: 'C1' }],
  ['secondary pressure frozen (no saturation tracking)',
   'sg.P = mid;\n    return sg.P;', 'return sg.P;', { grp: 'D' }],
  ['U derived from the wrong power (breaks the sourced-band check)',
   'return 300000 / (SG.area_m2 * (T_prim - T_sec));', 'return 700000 / (SG.area_m2 * (T_prim - T_sec));',
   { grp: 'A' }],
  /* The contract itself: a helper that hands back one node instead of the mean is exactly the
   * defect #482 filed, so it must not survive. */
  ['primaryTavg returns the cold leg instead of the mean (the #482 defect, re-armed)',
   /* anchor re-pointed #514: primaryTavg reads TFH (the vtable idiom) now */
   'return 0.5 * (TFH(hot.h, sys.P) + TFH(cold.h, sys.P));',
   'return TFH(cold.h, sys.P);', { grp: 'C3' }],
  /* The LUMP-vs-LEG confusion, re-armed. It costs only 0.14 degF today, which is exactly why it
   * needs a mutation: nothing else in this gate would notice, and the two come apart the moment
   * the core and the hot leg stop sharing an enthalpy. */
  ['primaryTavg averages the core LUMP instead of the hot LEG',
   "if (sys.nodes[i].id === 'hot_leg') hot = sys.nodes[i];",
   "if (sys.nodes[i].id === 'core') hot = sys.nodes[i];", { grp: 'C3' }],
  /* The two an adversarial CONSTRUCTION pass found -- both of them casualty-staging knobs. */
  ['caller inventory ignored at construction (every boil-dry probe stages a healthy SG)',
   'mass: opts.mass === undefined ? SG.mass_nominal : opts.mass,', 'mass: SG.mass_nominal,',
   { grp: 'C1' }],
  ['caller U ignored at construction (every fouling probe stages clean tubes)',
   'U: opts.U === undefined ? ratedU() : opts.U,', 'U: ratedU(),', { grp: 'C1' }]
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

/* ---- SCOPED-CLEAN-PASS PREFLIGHT (#513) ------------------------------------------------
 * Every group a mutation names must be GREEN when run alone on the clean build. In the replay
 * loop a crash counts as caught, so a group whose checks lean on another section's setup would
 * crash there and silently stand in for coverage; here, on the clean module, it fails loudly. */
var scopeBad = 0;
MUTATIONS.map(function (m) { return m[3] && m[3].grp; })
  .filter(function (g, i, a) { return g && a.indexOf(g) === i; })
  .forEach(function (g) {
    var rg = [], threw = false;
    try { runSuite(G, rg, true, g); } catch (e) { threw = true; }
    var fg = rg.filter(function (r) { return !r.ok; }).length;
    if (threw || fg > 0) {
      scopeBad++;
      console.log('  SCOPE ' + g + (threw ? ' THREW' : ' RED (' + fg + ')') +
        ' on the CLEAN build -- the group cannot stand alone; GATE FAILS' +
        (fg ? ' -- ' + rg.filter(function (r) { return !r.ok; })
                         .map(function (r) { return r.name; }).join('; ') : ''));
    }
  });

console.log('\n' + '='.repeat(70));
console.log('  INJECTION SELF-TEST -- every mutation MUST redden at least one check');
console.log('='.repeat(70));
var blind = 0;
MUT.select(MUTATIONS).forEach(function (m) {
  var grpTag = (m[3] && m[3].grp) || undefined;
  if (SRC.indexOf(m[1]) === -1) { console.log('  ERROR   anchor not found: ' + m[0]); blind++; return; }
  var r2 = [], crashed = false;
  try { runSuite(loadFrom(SRC.split(m[1]).join(m[2])), r2, true, grpTag); }
  catch (e) { crashed = true; }
  /* A crash counts as caught no matter how many checks recorded first (the run_pwr2_engine
   * form) -- but a crash-only catch is REPORTED AS ITSELF rather than wearing a check's face. */
  var realReds = r2.filter(function (r) { return !r.ok; }).length;
  var f2 = crashed ? 1 : (r2.length ? realReds : 1);
  if (f2 === 0) { blind++; console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); }
  else if (crashed && realReds === 0) {
    console.log('  caught    ' + m[0].padEnd(58) + 'CRASH only -- no check red (coverage untested)');
  }
  else console.log('  caught    ' + m[0].padEnd(58) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots') +
  (scopeBad ? '  ** ' + scopeBad + ' GROUP(S) NOT SELF-STANDING **' : ''));
console.log('  run_pwr2_sg: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0 || scopeBad > 0) ? 1 : 0);
