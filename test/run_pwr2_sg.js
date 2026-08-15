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
  var sgM = G.createSG(), M0 = sgM.mass;
  for (var k = 0; k < 500; k++) G.stepSG(sgM, 304.5, 0.02, { feed: 100, steam: 60 });
  ck('mass balance is exact on feed minus steam', sgM.mass - M0, 40 * 500 * 0.02, 1e-6, 'kg');
  var sgD = G.createSG();
  for (var kd = 0; kd < 5000; kd++) G.stepSG(sgD, 304.5, 0.02, { steam: 200 });
  ckT('a generator with no feed goes DRY and stays bounded', sgD.dry !== false && sgD.mass >= 1,
      sgD.mass.toFixed(1) + ' kg after 100 s of steaming with no feed');

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
   'var Q = sg.U * sg.area * (primaryT - T_sec);', 'var Q = 300000;'],
  ['duty sign flipped (the SG heats the primary)',
   'var Q = sg.U * sg.area * (primaryT - T_sec);', 'var Q = -sg.U * sg.area * (primaryT - T_sec);'],
  ['sourced area replaced by a round number', 'area_m2: 18135 / 10.7639,', 'area_m2: 1500,'],
  ['sourced inventory replaced', 'mass_nominal: 12785,', 'mass_nominal: 40000,'],
  ['feedwater arrives at steam enthalpy instead of the sourced 435 degF',
   'feed * SG.h_feed', 'feed * W.h_g(sg.P)'],
  ['steam leaves as liquid instead of vapour', '- steam * h_g;', '- steam * W.h_f(sg.P);'],
  ['secondary mass not integrated (inventory frozen)',
   'var m_new = sg.mass + dt * dM;', 'var m_new = sg.mass;'],
  ['secondary pressure frozen (no saturation tracking)',
   'sg.P = mid;\n    return sg.P;', 'return sg.P;'],
  ['U derived from the wrong power (breaks the sourced-band check)',
   'return 300000 / (SG.area_m2 * (T_prim - T_sec));', 'return 700000 / (SG.area_m2 * (T_prim - T_sec));'],
  ['the dry floor removed (inventory goes negative)',
   'if (m_new < 1) m_new = 1;', '']
];

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
