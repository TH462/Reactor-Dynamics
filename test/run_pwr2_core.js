/* run_pwr2_core.js — Layer 2 gate for the PWR2 engine (#479).
 *
 * D5's ladder calls this the assertion that justifies the rewrite: "A closed loop of N nodes
 * with arbitrary initial enthalpies, no sources, no sinks: total mass constant, total energy
 * constant. If that cannot be made to pass, nothing above it is worth building."
 *
 * FOUR THINGS THAT WOULD MAKE THIS GATE HOLLOW, AND WHAT IS DONE ABOUT EACH:
 *
 *  1. MASS CONSERVATION IS A SMOKE TEST, NOT EVIDENCE. `M_total` is one integrated scalar and
 *     the solve forces the nodes to sum to it, so mass conservation is true BY CONSTRUCTION.
 *     D5 §6.2 says to label it as such. It is asserted, and labelled.
 *  2. ENERGY MUST BE INTERNAL ENERGY. On a rigid system U = SUM(m*h) - P*V is conserved and
 *     enthalpy is NOT — compression adds V*dP of flow work to SUM(m*h). A gate written on
 *     enthalpy would fail a correct solver and pass a wrong one.
 *  3. A CONSERVATION CHECK ON A PLANT WHERE NOTHING MOVES PASSES TRIVIALLY. D5 §1 demands a
 *     vacuity guard, so every conservation case asserts that the replay actually MOVED mass
 *     and enthalpy between nodes, and by how much.
 *  4. THE SUITE ITSELF CAN BE BLIND. Layer 0's injection self-test was hardened after an
 *     independent review found 11 holes in it; the same mechanism runs here.
 *
 * Run: node test/run_pwr2_core.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var LIB = path.join(__dirname, '..', 'engines', 'pwr2', 'pwr2_core.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
require(path.join(__dirname, '..', 'engines', 'pwr2', 'pwr2_water.js'));
/* The table is loaded so this gate tests the PRODUCTION path. Testing the fallback while
 * shipping the table would gate a plant nobody runs. */
require(path.join(__dirname, '..', 'engines', 'pwr2', 'pwr2_vtable.js'));
var W = globalThis.RD.pwr2.water, VT = globalThis.RD.pwr2.vtable;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: W, vtable: VT } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.core;';
  return new Function('RD_ROOT', body)(root);
}

function runSuite(C, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(48) +
      'got ' + got.toExponential(3) + ' want ' + want.toExponential(3) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }

  /* A closed ring of N nodes at ONE pressure with DIFFERENT enthalpies, flow going round. */
  function ring(n, P, hs, V) {
    var nodes = [];
    for (var i = 0; i < n; i++) nodes.push({ id: 'n' + i, V: V || 2.0, h: hs[i] });
    return C.createSystem({ nodes: nodes, P: P });
  }
  function ringFlows(sys, mdot) {
    var f = [], n = sys.nodes.length;
    for (var i = 0; i < n; i++) f.push({ from: 'n' + i, to: 'n' + ((i + 1) % n), mdot: mdot });
    return f;
  }

  /* ---- 1. CLOSED SYSTEM: mass and INTERNAL ENERGY conserved --------------------------- */
  if (!quiet) console.log('\nCLOSED SYSTEM  [D5 Layer 1 -- the assertion that justifies the rewrite]');
  [[5, 15.41, [1200, 1250, 1300, 1350, 1280]],
   [8, 7.00,  [900, 1000, 1100, 1150, 1050, 980, 1020, 1120]],
   [3, 1.00,  [500, 700, 640]]].forEach(function (cse) {
    var sys = ring(cse[0], cse[1], cse[2]);
    var M0 = C.totalMass(sys), U0 = C.internalEnergy(sys);
    var hSpread0 = Math.max.apply(null, sys.nodes.map(function (x) { return x.h; })) -
                   Math.min.apply(null, sys.nodes.map(function (x) { return x.h; }));
    var moved = 0, maxIter = 0, maxResid = 0;
    for (var k = 0; k < 400; k++) {
      var r = C.step(sys, 0.02, { flows: ringFlows(sys, 120) });
      moved += r.transfers;
      maxIter = Math.max(maxIter, r.iterations);
      maxResid = Math.max(maxResid, Math.abs(r.residual));
    }
    var tag = cse[0] + ' nodes @ ' + cse[1] + ' MPa';
    ck('mass conserved, ' + tag + '  [SMOKE TEST -- true by construction]',
       (C.totalMass(sys) - M0) / M0, 0, 1e-4, '(rel)');
    /* CONSERVATION AS A BUDGET, not machine precision — D5 §6.2 ruled this and said the number
     * was owed. Measured here for the first time: the drift is SUM(h_i*dm_i), the enthalpy
     * carried by mass redistribution the specified flows do not account for (99.7 % explained).
     * 5e-4 is a CEILING to be driven down by Layer 3's flow solve, NOT a tolerance to widen. */
    /* THE BUDGET IS PRESSURE-DEPENDENT, DELIBERATELY. One loose band would hide the fact that
     * the drift TRIPLES from 15.41 MPa to 1 MPa — and that degradation is not noise, it is
     * D2 §26.3's declared structural limit showing up as a number: "below roughly 1-2 MPa
     * PWR2 resolves the liquid/two-phase transition at the limit of its timestep". Banding each
     * regime separately keeps the limit measurable instead of absorbed. */
    var budget = cse[1] >= 10 ? 5e-4 : (cse[1] >= 5 ? 8e-4 : 1.2e-3);
    ck('INTERNAL ENERGY within the conservation budget (' + budget.toExponential(0) + '), ' + tag,
       (C.internalEnergy(sys) - U0) / Math.abs(U0), 0, budget, '(rel)');
    ck('closure residual after solve, ' + tag, maxResid / M0,
       0, cse[1] >= 5 ? 1e-5 : 5e-4, '(rel)');
    /* VACUITY GUARD (D5 §1): the replay must have MOVED something. */
    var hSpread1 = Math.max.apply(null, sys.nodes.map(function (x) { return x.h; })) -
                   Math.min.apply(null, sys.nodes.map(function (x) { return x.h; }));
    ckT('VACUITY GUARD: the replay moved mass and enthalpy, ' + tag,
        moved >= 400 && hSpread0 > 10 && hSpread1 < hSpread0 * 0.98,
        moved + ' transfers; enthalpy spread ' + hSpread0.toFixed(0) + ' -> ' + hSpread1.toFixed(0) +
        ' kJ/kg (mixing, as it must)');
    ckT('iterations stayed under the ruled cap, ' + tag, maxIter <= 8, 'max ' + maxIter);
  });

  /* ---- 2. HEAT IN AND OUT: energy accounted, not merely conserved -------------------- */
  if (!quiet) console.log('\nHEAT BALANCE  [energy must MOVE correctly, not just stay constant]');
  var sysH = ring(4, 15.41, [1250, 1250, 1250, 1250]);
  var U0h = C.internalEnergy(sysH), Q = 3000;            // kW into one node, out of another
  for (var k2 = 0; k2 < 200; k2++) {
    C.step(sysH, 0.02, { flows: ringFlows(sysH, 150), heats: { n0: Q, n2: -Q } });
  }
  ck('balanced heat in/out leaves U unchanged', (C.internalEnergy(sysH) - U0h) / Math.abs(U0h), 0, 5e-4, '(rel)');
  var sysQ = ring(4, 15.41, [1250, 1250, 1250, 1250]);
  var U0q = C.internalEnergy(sysQ);
  for (var k3 = 0; k3 < 200; k3++) C.step(sysQ, 0.02, { flows: ringFlows(sysQ, 150), heats: { n0: Q } });
  ck('net heat in raises U by Q*t within the budget', C.internalEnergy(sysQ) - U0q, Q * 200 * 0.02, 30.0, 'kJ');
  ckT('and it raised the pressure', sysQ.P > 15.41, sysQ.P.toFixed(3) + ' MPa');

  /* ---- 3. BOUNDARY MASS: sources and sinks are the ONLY thing that moves M_total ----- */
  if (!quiet) console.log('\nBOUNDARY MASS  [M_total moves only by sources/sinks]');
  var sysS = ring(4, 15.41, [1250, 1250, 1250, 1250]);
  var M0s = C.totalMass(sysS);
  for (var k4 = 0; k4 < 100; k4++) {
    C.step(sysS, 0.02, { flows: ringFlows(sysS, 150), sources: [{ node: 'n1', mdot: 5.0, h: 1200 }] });
  }
  ck('injected mass appears exactly', C.totalMass(sysS) - M0s, 5.0 * 100 * 0.02, 1e-3, 'kg');
  ckT('and injection raised the pressure', sysS.P > 15.41, sysS.P.toFixed(3) + ' MPa');

  /* ---- 4. THE CONTRACT WITH THE CLOCK (D2 §24.2) -------------------------------------- */
  if (!quiet) console.log('\nEXACTLY-dt  [the step is a contract with the clock, D2 §24.2]');
  var sysT = ring(4, 15.41, [1200, 1300, 1250, 1280]);
  var t = 0;
  for (var k5 = 0; k5 < 50; k5++) { C.step(sysT, 0.02, { flows: ringFlows(sysT, 150) }); t += 0.02; }
  ck('simTime advanced by exactly the sum of dt', sysT.simTime, t, 1e-12, 's');
  /* A violent transient must ALSO advance exactly dt -- that is where an analysis code would
   * shorten and retry, and where this one may not. */
  var sysV = ring(4, 7.0, [1200, 1300, 1250, 1280]);
  var tv = 0;
  for (var k6 = 0; k6 < 50; k6++) { C.step(sysV, 0.02, { flows: ringFlows(sysV, 400), heats: { n0: 50000 } }); tv += 0.02; }
  ck('simTime exact through a violent transient too', sysV.simTime, tv, 1e-12, 's');

  /* ---- 5. MONOTONICITY -- the property the whole solver rests on ---------------------- */
  if (!quiet) console.log('\nF(P) MONOTONICITY  [the theorem the bracketed solve depends on]');
  [[15.41, [1200, 1626, 1300]], [7.0, [1267, 1500, 2600]], [1.0, [762, 1500, 2400]]].forEach(function (cse) {
    var sys = ring(3, cse[0], cse[1]);
    var bad = 0, prev = null, samples = 0;
    for (var P = Math.max(0.2, cse[0] - 3); P <= cse[0] + 3; P += 0.02) {
      var m = C.totalMass({ nodes: sys.nodes, V_total: sys.V_total, extraMass: null, P: P });
      if (prev !== null && m < prev - 1e-9) bad++;
      prev = m; samples++;
    }
    ckT('mass rises monotonically with P at ' + cse[0] + ' MPa', bad === 0,
        bad + ' non-monotone of ' + samples + ' samples');
  });

  /* ---- 6. THE CAP -- reported, so the design's owed number can be measured ------------ */
  if (!quiet) console.log('\nITERATION CAP  [D2 §23.2 owes a residual-at-cap number]');
  var sysC = ring(6, 15.41, [1626, 1626, 1626, 1626, 1626, 1626]);   // near-saturated, stiff
  var bound = 0, worstW = 0, worstR = 0, n = 0;
  for (var k7 = 0; k7 < 300; k7++) {
    var rc = C.step(sysC, 0.02, { flows: ringFlows(sysC, 200), heats: { n0: 8000, n3: -8000 } });
    n++; if (rc.capBound) bound++;
    worstW = Math.max(worstW, rc.bracketWidth);
    worstR = Math.max(worstR, Math.abs(rc.residual));
  }
  ckT('cap-bound fraction and bracket width are REPORTED', isFinite(worstW),
      (100 * bound / n).toFixed(1) + ' % of steps bound the cap; worst bracket ' +
      worstW.toExponential(2) + ' MPa; worst residual ' + worstR.toExponential(2) + ' kg');
  ckT('even when the cap binds, the residual stays small', worstR / C.totalMass(sysC) < 1e-4,
      (worstR / C.totalMass(sysC)).toExponential(2) + ' relative');

  /* ---- 6b. DIRECTIONAL / LOCAL CHECKS ------------------------------------------------
   * ADDED after this file's own injection self-test reported four BLIND SPOTS the moment the
   * conservation tolerances became a BUDGET rather than machine precision. That is the honest
   * cost of a budget and it generalises: **a conservation check is INTEGRAL, so it can never
   * localise a defect.** Reversed upwinding, heat on the wrong node, a source arriving with the
   * wrong enthalpy and a dead junction diagnostic all conserve energy perfectly while being
   * completely wrong. Each needs a check that asks WHERE, not HOW MUCH. */
  if (!quiet) console.log('\nDIRECTIONAL  [conservation is integral; these ask WHERE]');
  /* Upwinding: a hot slug must move DOWNSTREAM. */
  var sysU = ring(4, 15.41, [1400, 1250, 1250, 1250]);
  C.step(sysU, 0.02, { flows: ringFlows(sysU, 200) });
  ckT('a hot slug moves DOWNSTREAM, not upstream',
      sysU.nodes[1].h > 1250.2 && Math.abs(sysU.nodes[3].h - 1250) < 0.05,
      'n1 ' + sysU.nodes[1].h.toFixed(2) + ' (downstream, must rise), n3 ' +
      sysU.nodes[3].h.toFixed(2) + ' (upstream, must not)');
  /* Heat lands on the node it was addressed to. */
  var sysHl = ring(4, 15.41, [1250, 1250, 1250, 1250]);
  C.step(sysHl, 0.02, { heats: { n2: 20000 } });
  ckT('heat lands on the node it was addressed to',
      sysHl.nodes[2].h > 1250.1 &&
      Math.abs(sysHl.nodes[0].h - 1250) < 0.05 && Math.abs(sysHl.nodes[1].h - 1250) < 0.05,
      'n2 ' + sysHl.nodes[2].h.toFixed(3) + ', others unmoved');
  /* A source arrives carrying ITS OWN enthalpy, not the receiving node's. */
  var sysSr = ring(4, 15.41, [1250, 1250, 1250, 1250]);
  var h0sr = sysSr.nodes[1].h;
  for (var ks = 0; ks < 50; ks++) C.step(sysSr, 0.02, { sources: [{ node: 'n1', mdot: 20, h: 400 }] });
  ckT('injected COLD mass actually cools the node it enters',
      sysSr.nodes[1].h < h0sr - 5,
      'n1 ' + h0sr.toFixed(0) + ' -> ' + sysSr.nodes[1].h.toFixed(1) + ' kJ/kg on 400 kJ/kg injection');
  /* The junction diagnostic must be a live mass difference, not a stub. */
  var sysJ = ring(4, 15.41, [1250, 1250, 1250, 1250]);
  var rj = C.step(sysJ, 0.02, { flows: ringFlows(sysJ, 150), heats: { n0: 20000 } });
  var jsum = rj.junction.reduce(function (a, x) { return a + x.dm_dt; }, 0);
  var jmax = Math.max.apply(null, rj.junction.map(function (x) { return Math.abs(x.dm_dt); }));
  ckT('junction flows are a LIVE mass difference, and they balance',
      jmax > 1e-3 && Math.abs(jsum) < 0.01 * jmax,
      'max |dm/dt| ' + jmax.toExponential(2) + ' kg/s, sum ' + jsum.toExponential(2));

  /* ---- 7. A COMPRESSIBLE VOLUME (the pressurizer's seat) ------------------------------ */
  if (!quiet) console.log('\nEXTRA COMPRESSIBLE MASS  [the m_pzr(P) term §23.2 was missing]');
  var sysE = C.createSystem({
    nodes: [{ id: 'a', V: 2.0, h: 1250 }, { id: 'b', V: 2.0, h: 1250 }],
    P: 15.41,
    extraMass: function (P) { return 400 + 8.0 * (P - 15.41); }   // steam bubble: denser as P rises
  });
  var M0e = C.totalMass(sysE), U0e = C.internalEnergy(sysE);
  for (var k8 = 0; k8 < 100; k8++) C.step(sysE, 0.02, { flows: [{ from: 'a', to: 'b', mdot: 50 }], heats: { a: 500 } });
  ck('closed system with a compressible volume still conserves mass',
     (C.totalMass(sysE) - M0e) / M0e, 0, 1e-4, '(rel)');
  /* THIS CHECK IS NAMED AFTER A COMPARISON AND DID NOT MAKE ONE. It asserted
   * `0 < dP < 3.0 MPa`, a band wide enough to accept the RIGID case too -- so dropping
   * `extraMass` at construction passed it, and an adversarial mutation pass found exactly that.
   * `extraMass` is the seat the pressurizer plugs into (D1 §25.3), so a gate blind to its
   * absence is blind to the pressurizer never connecting.
   *
   * It now builds the rigid twin and compares, which is what the name always claimed. */
  var sysR = C.createSystem({
    nodes: [{ id: 'a', V: 2.0, h: 1250 }, { id: 'b', V: 2.0, h: 1250 }], P: 15.41
  });
  for (var k9 = 0; k9 < 100; k9++) C.step(sysR, 0.02, { flows: [{ from: 'a', to: 'b', mdot: 50 }], heats: { a: 500 } });
  ckT('the compressible volume made pressure softer than a rigid one',
      sysE.P > 15.41 && (sysE.P - 15.41) < 0.5 * (sysR.P - 15.41),
      'dP ' + (sysE.P - 15.41).toFixed(4) + ' MPa with the bubble vs ' +
      (sysR.P - 15.41).toFixed(4) + ' rigid -- a COMPARISON, not a band');
  ckT('...and the caller-supplied extraMass is the one actually used',
      Math.abs(sysE.extraMass(16.41) - 408) < 1e-9,
      'extraMass(16.41 MPa) = ' + sysE.extraMass(16.41).toFixed(1) +
      ' kg -- dropping it at construction would leave null here');

  /* THE SOLVER'S ITERATION CAP MUST BE THE CALLER'S. `iterCap` is how a probe trades accuracy for
   * speed, and how the envelope guard gets exercised; a construction that ignores it silently
   * pins every plant at 8 while appearing to accept the argument. Found by the same pass. */
  var sysI = C.createSystem({ nodes: [{ id: 'a', V: 2.0, h: 1250 }], P: 15.41, iterCap: 3 });
  ck('a caller-supplied iterCap reaches the solver', sysI.iterCap, 3, 0, 'iterations');
  ck('...and omitting it gives the documented default of 8',
     C.createSystem({ nodes: [{ id: 'a', V: 2.0, h: 1250 }], P: 15.41 }).iterCap, 8, 0, 'iterations');
}

console.log('\nPWR2 Layer 2 -- node/junction conservation core');
var C = loadFrom(SRC), rec = [];
runSuite(C, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['energy check fooled: drop the flow-work term from U',
   'return H - sys.P * 1000 * sys.V_total;', 'return H;'],
  ['donor-cell upwinding reversed (front smears backwards)',
   'var don = md > 0 ? A : B, rec = md > 0 ? B : A', 'var don = md > 0 ? B : A, rec = md > 0 ? A : B'],
  ['node mass integrated instead of derived (the over-determination)',
   'm_n[i] = sys.nodes[i].V * RHO(sys.nodes[i].h, sys.P);', 'm_n[i] = sys.nodes[i].V * 700;'],
  ['the isentropic term dropped from the closure',
   'a[k] + v[k] * (P - sys.P)', 'a[k]'],
  ['specific volume halved (the unit trap, at half strength)',
   'v[i] = 1000 * sys.nodes[i].V / m_n[i];', 'v[i] = 500 * sys.nodes[i].V / m_n[i];'],
  ['M_total moved by internal flows, not just boundary sources',
   'var M_target = sys.M_total + dt * dM;', 'var M_target = sys.M_total + dt * dM + 1e-4;'],
  ['simTime credited before the solve, not after (clock drifts)',
   'sys.simTime += dt;', 'sys.simTime += dt * 1.000001;'],
  ['iteration cap ignored',
   'while (iters < cap) {', 'while (iters < cap * 8) {'],
  ['bracket expansion gives up early (silent non-convergence)',
   'for (k = 0; k < 60; k++) {', 'for (k = 0; k < 1; k++) {'],
  ['heat applied to the wrong node',
   "dH[i] = heats[sys.nodes[i].id] || 0;", "dH[i] = heats[sys.nodes[(i + 1) % N].id] || 0;"],
  ['source enthalpy ignored (mass arrives with the wrong energy)',
   'dH[A] += s.mdot * (s.h - sys.nodes[A].h);', 'dH[A] += 0;'],
  ['junction flow reported as a modelled value, not a mass difference',
   'var rate = (m_new - m_n[i]) / dt;', 'var rate = 0;']
,
  /* The two an adversarial CONSTRUCTION pass found. Layers 3 and 4 had six more of the same
   * shape (D1 §31): every blind spot in this engine so far has been an initial condition, an
   * alias, or a dropped option -- never the physics the curated mutations were aimed at. */
  ['the extraMass hook silently dropped at construction (the pressurizer never connects)',
   'extraMass: spec.extraMass || null,', 'extraMass: null,'],
  ['a caller-supplied iterCap ignored (every plant pinned at the default)',
   'iterCap: spec.iterCap === undefined ? 8 : spec.iterCap,', 'iterCap: 8,']];

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
  else console.log('  caught    ' + m[0].padEnd(56) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_core: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
