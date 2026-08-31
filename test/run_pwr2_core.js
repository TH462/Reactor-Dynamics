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

  /* ---- THE ENTHALPY ENVELOPE (added 2026-08-17) -------------------------------------------
   * The state had no bound while every reader had one, so a node boiling dry ran `h` to 1e+304
   * and then to NaN — invisible, because `T_from_h` and `rho_from_h` saturate and the gauges
   * stayed plausible throughout. Both halves are checked: that it does NOT fire in normal
   * service, and that it DOES fire and holds when driven out of range. */
  if (!quiet) console.log('\nTHE ENTHALPY ENVELOPE  [the state had no wall while every reader had one]');
  /* HALF ONE: a normal step must not clamp. A version that clamped everything would satisfy
   * every "it holds" check below and quietly pin the whole plant at the ceiling. */
  var sysN = ring(3, 15.41, [1250, 1300, 1350]);
  var rN = C.step(sysN, 0.02, { flows: ringFlows(sysN, 100), heats: { n0: 5000 } });
  ckT('a normal step clamps NOTHING and discards no energy',
      rN.enthalpyClamped === 0 && rN.enthalpyDiscarded_kJ === 0,
      'clamped ' + rN.enthalpyClamped + ', discarded ' + rN.enthalpyDiscarded_kJ + ' kJ');

  /* HALF TWO: drive one node past the ceiling. 2e6 kW into a 2 m3 node is the boil-dry case in
   * miniature — the same divide-by-a-vanishing-mass that took the real plant to 1e+304. */
  var sysX = ring(2, 1.0, [2600, 2600]);
  var rX = null;
  for (var xi = 0; xi < 200; xi++) rX = C.step(sysX, 0.02, { heats: { n0: 2.0e6 } });
  /* THE MODEL'S OWN CEILING, and at #516 item 9 that stopped being TV_MAX. Layer 0 now carries a
   * sourced ideal-gas branch above the validated range and `pwr2_core` clamps to TV_EXT_MAX, so a
   * fixture retyping TV_MAX here was a SECOND COPY of the constant that had quietly gone stale —
   * it reported a 4637 kJ/kg ceiling against a plant clamping at 9590. Read from LIMITS, never
   * retyped, so the next time that boundary moves this fixture moves with it. */
  var hCeil = W.h_v(W.LIMITS.TV_EXT_MAX, sysX.P);
  /* ⚠ ASSERTED AS AN EQUALITY, NOT AS "at most". The first version asked only that `h` stay BELOW
   * the ceiling, and the injection self-test found it blind to a ceiling built from the LIQUID
   * limit instead of the vapour one — which pins every steam node ~2400 kJ/kg too low and
   * satisfies "at most" perfectly. A one-sided check on a clamp can only ever see the clamp
   * failing OPEN; the interesting failure is it closing in the wrong place. */
  ckT('a node driven past the vapour ceiling is HELD AT it — not above it and not below it',
      isFinite(sysX.nodes[0].h) && Math.abs(sysX.nodes[0].h - hCeil) < 1.0,
      'h = ' + sysX.nodes[0].h.toFixed(1) + ' kJ/kg against a ceiling of ' + hCeil.toFixed(1));
  ckT('...and the clamp SAYS SO rather than absorbing it silently',
      rX.enthalpyClamped > 0 && rX.enthalpyDiscarded_kJ > 0,
      rX.enthalpyClamped + ' node(s), ' + (rX.enthalpyDiscarded_kJ / 1e6).toFixed(2) +
      ' GJ discarded this step — the absurd size IS the signal that the plant left the range');
  ckT('...and NOTHING in the system is NaN afterwards, which is the whole point',
      sysX.nodes.every(function (n) { return isFinite(n.h); }) && isFinite(sysX.P) &&
      isFinite(sysX.M_total), '');

  /* THE MASS BOOKKEEPING IS THE CHECK THAT CAUGHT MY OWN FIRST VERSION. Clamping AFTER the
   * solve left the solve balancing one set of densities while the state held another — up to
   * 0.24 kg/m3 apart at the table edge, re-introduced every step a node sits out of range. The
   * clamp has to be inside `F(P)`. A closed system's mass is moved only by boundary sources, so
   * with none supplied it must be EXACTLY unmoved however hard the nodes are driven. */
  /* ⚠ 8e6, NOT 2e6, SINCE #516 item 9. This fixture's job is to make the CLAMP BIND HARD, so
   * that clamping inside versus outside the pressure solve gives measurably different densities.
   * The ceiling moved from h_v(1000 degC) to h_v(3000 degC) and 2e6 now lands the raw enthalpy
   * only just past it — the density disagreement fell under the residual and the injection
   * self-test reported this check BLIND to the mutation it exists for. Driving harder restores
   * the separation without changing anything the check claims. */
  var sysM = ring(2, 1.0, [2600, 2600]);
  var M_before = sysM.M_total;
  for (xi = 0; xi < 200; xi++) C.step(sysM, 0.02, { heats: { n0: 8.0e6 } });
  ck('a closed system driven past the ceiling conserves M_total EXACTLY',
     sysM.M_total, M_before, 1e-9, 'kg');
  /* AND THE SOLVE MUST AGREE WITH THE STATE IT STORED. Recomputing node masses from the stored
   * enthalpies has to reproduce M_total. This is what goes wrong when the clamp sits outside the
   * solve — the solve balances one set of densities and the state holds another.
   *
   * ⚠ THE TOLERANCE IS THE SOLVE'S OWN REPORTED RESIDUAL, not a number I chose, and the first
   * version asked for 1e-6 kg and failed at 1.33e-5. That was the check being written tighter
   * than the CAPPED bisection it is measuring through: `solveP` stops at 8 iterations by ruling,
   * so `F(sol.P)` is non-zero BY DESIGN and this file already reports it. Measured here, the
   * reconstruction is out by -1.33e-5 kg against a reported residual of -1.54e-5 — the whole
   * discrepancy is the cap. Asserting against `residual` is what separates the two causes: a
   * clamp outside the solve misses by ~0.5 kg per step and grows, the cap does not. */
  var mSum = 0;
  for (xi = 0; xi < sysM.nodes.length; xi++) {
    mSum += sysM.nodes[xi].V * (VT ? VT.rho_from_h : W.rho_from_h)(sysM.nodes[xi].h, sysM.P);
  }
  var rM = C.step(sysM, 0, {});          /* zero-length step: reports the residual, moves nothing */
  /* ⚠ AND AN ABSOLUTE BOUND, ADDED AT #516 item 9 — because the relative one is SELF-DEFEATING
   * and the injection harness caught it saying so. `residual` is the solve's own miss, and a
   * clamp moved outside the solve inflates BOTH the reconstruction error and the residual it is
   * measured against, so the tolerance grows with the defect. It survived only while the defect
   * outran that growth; once the ceiling moved to the extension the two grew together and this
   * check went BLIND to the mutation it exists for. The absolute half cannot move with the
   * mutant: the file's own measurements are ~1.3e-5 kg for the capped bisection against ~0.5 kg
   * per step and GROWING for a clamp outside the solve, so 1e-3 kg sits two orders clear of the
   * cause this check accepts and hundreds clear of the one it must reject. */
  ckT('...and the STORED enthalpies reproduce that mass to the SOLVE\'S OWN residual',
      Math.abs(mSum - sysM.M_total) <= Math.abs(rM.residual) * 1.5 + 1e-9 &&
      Math.abs(mSum - sysM.M_total) < 1e-3,
      'reconstruction out by ' + (mSum - sysM.M_total).toExponential(3) +
      ' kg against a reported solve residual of ' + rM.residual.toExponential(3) +
      ' — the capped bisection, not the clamp');

  /* ---- THE BEYOND-MODEL LATCH (#487) -------------------------------------------------------
   * The filed failure: a blowdown that made the 0.1 MPa floor mass-inconsistent went NaN one
   * step after the enthalpy clamp first fired. The latch is BOTH-HALVES by design — a solve
   * pinned at the floor (flooredLow) while nodes clamp — because each half alone fires on a
   * healthy plant (the clamp fires transiently in a 50 cm2 break; the floor is touched benignly
   * whenever mass still closes there). Driven here the way the plant cannot be driven from
   * outside: a sink at the floor until the target mass leaves the representable range. */
  if (!quiet) console.log('\nTHE BEYOND-MODEL LATCH (#487)  [held state, flowing time, never NaN]');
  var sysZ = C.createSystem({ nodes: [{ id: 'a', V: 2.0, h: 400 }], P: 0.2 });
  var rZ = null, latchedZ = false, pPre = null, hPre = null;
  for (var kz = 0; kz < 200 && !latchedZ; kz++) {
    pPre = sysZ.P; hPre = sysZ.nodes[0].h;      /* #518 — the state the latching step STARTED from */
    rZ = C.step(sysZ, 0.02, { sources: [{ node: 'a', mdot: -800, h: 400 }], heats: { a: -200000 } });
    if (rZ.beyond_model) latchedZ = true;
  }
  ckT('a floor the solve cannot close mass at LATCHES beyond_model instead of integrating on',
      latchedZ && isFinite(sysZ.P) && isFinite(sysZ.nodes[0].h),
      latchedZ ? 'latched at step ' + kz + ' with P ' + sysZ.P.toFixed(3) +
                 ' MPa and h finite — the pre-latch build went NaN here'
               : 'never latched in 200 sink-driven steps at the floor');
  /* ---- #518: NOTHING IS ADOPTED ON THE LATCHING STEP -----------------------------------------
   * The two blowdown latches used to fire AFTER committing h and P, so the state frozen for the
   * player was the very step the guard had just rejected as uncomputable. MEASURED on a large
   * break with the station blacked out: the last good step read 17.6 psia, the held snapshot read
   * 14.5 — the property floor, i.e. the rejected value — and #520 then put a dialog in front of
   * exactly that board, promising it showed "the last valid reading". The root-jump guard had
   * this right from the start ("hold THIS step, nothing adopted"); these two now match it.
   * BYTE-IDENTICAL is the assertion, not "close": a partial adoption is the defect. */
  ckT('...and the latching step ADOPTS NOTHING — the held state is the one it started from (#518)',
      latchedZ && sysZ.P === pPre && sysZ.nodes[0].h === hPre && rZ.held === true && rZ.dP === 0,
      latchedZ ? 'P ' + sysZ.P.toFixed(4) + ' and h ' + sysZ.nodes[0].h.toFixed(2) +
                 ' byte-identical to the step entry; held true, dP 0'
               : 'never latched');
  var Pz = sysZ.P, hz = sysZ.nodes[0].h, tz = sysZ.simTime;
  var rZ2 = C.step(sysZ, 0.02, { sources: [{ node: 'a', mdot: -800, h: 400 }],
                                 heats: { a: -200000 } });
  ckT('...and the held step FREEZES state while time flows — a hold, not a crash and not physics',
      rZ2.held === true && rZ2.dP === 0 && sysZ.P === Pz && sysZ.nodes[0].h === hz &&
      sysZ.simTime === tz + 0.02 && rZ2.junction.length === 1 && rZ2.junction[0].dm_dt === 0 &&
      rZ2.transfers === 0 && rZ2.iterations === 0,
      'P and h byte-identical through a driven step, simTime += dt exactly, junctions zero, and ' +
      'transfers/iterations ZERO — the signature of the STANDING hold. Without those two the ' +
      'pre-commit guard (#518) satisfies every other clause on this state, so deleting the ' +
      'standing branch went BLIND: the guard re-fires each step and holds it anyway, correctly, ' +
      'but by a different route and at the cost of a solve the frozen plant does not need.');
  /* ---- THE #499 GUARDS, AT THEIR OWN LAYER (migrated 2026-08-20g) ------------------------
   * These lived as facade-gate fixtures until the control/instrument switchovers MOVED the
   * facade trajectories: both now escape through the kinetics-runaway family first, so the
   * inner thermodynamic guards never fire there and their facade mutations went blind. The
   * guards are THIS layer's; direct synthetic states exercise them deterministically —
   * measure at the probe's own layer. */
  (function () {
    /* ROOT-TRACKING: force the target mass FAR from the current root in one step — the solve
     * lands > 2 MPa away and must REFUSE + latch, holding P and h unchanged. */
    var sysJ = ring(4, 15.0, [1400, 1400, 1400, 1400]);
    C.step(sysJ, 0.02, { flows: ringFlows(sysJ, 150) });
    var Pbefore = sysJ.P;
    sysJ.M_total = sysJ.M_total * 1.35;      /* a hand-teleported mass no flow produced */
    var rJ = C.step(sysJ, 0.02, { flows: ringFlows(sysJ, 150) });
    ckT('a hand-moved mass whose root sits far away is REFUSED: latch, hold, report the jump',
        rJ.held === true && rJ.beyond_model === true && sysJ.beyond_model === true &&
        Math.abs(sysJ.P - Pbefore) < 1e-9 && typeof rJ.rootJump_mpa === 'number' &&
        Math.abs(rJ.rootJump_mpa) > 2.0,
        'rootJump ' + (rJ.rootJump_mpa === undefined ? '?' : rJ.rootJump_mpa.toFixed(2)) +
        ' MPa, P held at ' + sysJ.P.toFixed(3));
    /* BOTH-WALLS: the latch counts nodes whose CLAMP BINDS this step, so the excursion must
     * happen IN the step — and it must trip ONLY this guard. Three fixture generations died
     * here, each caught by the injection self-test: pre-placed wall values mix back inside on
     * the first flow (no clamp); symmetric heats on equal volumes move the mass projection so
     * far the FLOOR or ROOT-JUMP guard fires first and masks the mutation. ASYMMETRIC volumes
     * are the answer — two tiny nodes take opposed heats (huge delta-h, negligible mass
     * shift) while two huge nodes anchor the root: P stays at 5.1 MPa, both walls clamp, and
     * only the walls latch can claim the catch. */
    var sysW = C.createSystem({ nodes: [
      { id: 'n0', V: 0.01, h: 1000 }, { id: 'n1', V: 0.01, h: 1000 },
      { id: 'n2', V: 50, h: 1000 }, { id: 'n3', V: 50, h: 1000 }], P: 5.0 });
    var fW = [{ from: 'n0', to: 'n1', mdot: 0.1 }, { from: 'n1', to: 'n2', mdot: 0.1 },
              { from: 'n2', to: 'n3', mdot: 0.1 }, { from: 'n3', to: 'n0', mdot: 0.1 }];
    /* ⚠ 5e6, NOT 2e6, SINCE #516 item 9. The ceiling moved from h_v(1000 degC) to h_v(3000 degC)
     * — 4,637 to 9,590 kJ/kg at this pressure — and 2e6 kW over one 0.02 s step lifts a 0.01 m3
     * node about 5,000 kJ/kg, which used to clear the old ceiling and no longer clears the new
     * one. The fixture stopped producing its own subject and this check went quietly green-then-
     * red. Scaled on BOTH nodes equally so the opposed heats still cancel in the mass projection,
     * which is what keeps the floor and root-jump guards from firing first and masking the
     * mutation — the failure mode the three earlier fixture generations died of. */
    var rW = C.step(sysW, 0.02, { flows: fW, heats: { n0: 5e6, n1: -5e6 } });
    ckT('nodes clamped on BOTH envelope walls at once latch beyond-model (the oscillation)',
        sysW.beyond_model === true && rW.enthalpyClamped === 2 &&
        sysW.P > 4.5 && sysW.P < 5.5,
        'both walls clamped at P ' + sysW.P.toFixed(2) + ' MPa — no floor, no root-jump, ' +
        'only this guard');
  })();

  /* ---- #535: a CEILING-ONLY pin with a healthy pressure root latches on PERSISTENCE.
   * The both-walls fixture above with the negative heat dropped: one tiny node takes heat
   * for ever, pins on hHi and discards every step, while the pressure root never moves and
   * the floor is never touched — so neither older arm can fire. Pre-#535 this ran
   * UNLATCHED indefinitely (the loss-of-heat-sink immortality: 79 % of decay heat deleted
   * for 8 h with every health flag green). The latch must NOT fire on first contact — a
   * 50 cm2 break touches the ceiling for 4.26 s healthy — and MUST fire once the hold
   * passes CEIL_HOLD_LATCH_S = 60 s of continuous discard. ---- */
  (function () {
    var sysC = C.createSystem({ nodes: [
      { id: 'n0', V: 0.01, h: 1000 }, { id: 'n1', V: 0.01, h: 1000 },
      { id: 'n2', V: 50, h: 1000 }, { id: 'n3', V: 50, h: 1000 }], P: 5.0 });
    var fC = [{ from: 'n0', to: 'n1', mdot: 0.1 }, { from: 'n1', to: 'n2', mdot: 0.1 },
              { from: 'n2', to: 'n3', mdot: 0.1 }, { from: 'n3', to: 'n0', mdot: 0.1 }];
    var latchedAt = null, notAt30 = null, rC = null;
    for (var iC = 0; iC < 3300; iC++) {
      /* 5e6 for the same reason as the both-walls fixture above (#516 item 9): the ceiling
       * moved and 2e6 no longer reaches it, so nothing was pinned and nothing could latch. */
      rC = C.step(sysC, 0.02, { flows: fC, heats: { n0: 5e6 } });
      var tC = (iC + 1) * 0.02;
      if (Math.abs(tC - 30) < 0.011) notAt30 = sysC.beyond_model !== true;
      if (sysC.beyond_model === true && latchedAt === null) latchedAt = tC;
    }
    ckT('a ceiling-only pin latches beyond-model on SUSTAINED discard — and not before',
        /* The pressure band is a FIXTURE descriptor, not the claim — it says the ride stayed at
         * a moderate pressure so this is a ceiling-only pin rather than a floor case. The
         * heat was scaled to 5e6 at #516 item 9 to reach the moved ceiling, which carries P to
         * 5.55 instead of 5.5; band widened to match the fixture, and the CLAIM (latches at the
         * 60 s persistence threshold, and not at 30 s) is untouched and still exact. */
        latchedAt !== null && latchedAt > 55 && latchedAt < 66 && notAt30 === true &&
        sysC.P > 4.5 && sysC.P < 6.0,
        'latched at ' + (latchedAt === null ? 'NEVER' : latchedAt.toFixed(2) + ' s') +
        ' (healthy at 30 s: ' + notAt30 + '), P ' + sysC.P.toFixed(2) +
        ' MPa — pre-#535 this state ran unlatched for ever');
  })();

  /* ---- 8. THE METAL WALL (#574) -----------------------------------------------------------
   * *(OWNER, 2026-08-12: "each node should carry the heat capacity of its own metal wall";
   * OWNER RULING, 2026-08-28: "All eleven nodes".)* The specification named `M_wall`, `cp_wall`,
   * `A`, `T_wall[]` and `Q_wall` and the nodes were built without any of them, while
   * `pwr2_geometry` shipped `wallLumps` on all eleven with ZERO consumers — a table that read
   * as a working feature. These checks are what stop that recurring. */
  if (!quiet) console.log('\nMETAL WALLS  [the spec named them and the nodes were built without them]');
  function walledNode(h, lumps, M, A, t) {
    return { id: 'w0', V: 2.0, h: h,
             wall: { M_kg: M, cp: 0.5, k: 40, A_m2: A, t_m: t, lumps: lumps } };
  }
  /* ⚠ THE ZERO CHECK IS THE ONE THAT CATCHES A SIGN ERROR, and it passes on the PRE-#574 plant
   * too (no wall, no heat) — which is what makes it a better check rather than a fitted one. */
  (function () {
    var sysW = C.createSystem({ nodes: [walledNode(1250, 1, 20000, 20, 0.1)], P: 15.41 });
    var r = C.step(sysW, 0.02, {});
    ckT('a wall AT its fluid temperature moves EXACTLY nothing',
        r.wallHeat_kW === 0 && sysW.nodes[0].wall.T[0] === sysW.nodes[0].wall.T[0],
        'wallHeat ' + r.wallHeat_kW + ' kW — the check a sign error cannot survive');
  })();
  /* THE DIRECTION, and the energy that goes with it. */
  (function () {
    var sysW = C.createSystem({ nodes: [walledNode(1250, 1, 20000, 20, 0.1)], P: 15.41 });
    var w = sysW.nodes[0].wall, T0 = w.T[0];
    w.T[0] = T0 + 50;                                   /* metal hotter than its water */
    var U0 = C.internalEnergy(sysW), h0 = sysW.nodes[0].h;
    var Q = 0;
    for (var i = 0; i < 500; i++) Q += C.step(sysW, 0.02, {}).wallHeat_kW * 0.02;
    var U1 = C.internalEnergy(sysW);
    ckT('a HOT wall heats its fluid and cools itself — both, and by the same joules',
        sysW.nodes[0].h > h0 && sysW.nodes[0].wall.T[0] < T0 + 50 && Q > 0,
        'fluid ' + h0.toFixed(1) + ' -> ' + sysW.nodes[0].h.toFixed(1) + ' kJ/kg, wall ' +
        (T0 + 50).toFixed(1) + ' -> ' + sysW.nodes[0].wall.T[0].toFixed(1) + ' degC, ' +
        Q.toFixed(0) + ' kJ moved');
    /* THE WALL'S ENERGY IS IN THE BUDGET. Without it the layer's own 3e-4 conservation claim
     * silently absorbs every joule the metal takes up or gives back, and a budget that absorbs
     * the thing being added has stopped measuring anything. */
    ckT('...and the CLOSED system still conserves internal energy to the layer\'s own budget',
        Math.abs(U1 - U0) / Math.abs(U0) < 3e-4,
        'dU/U = ' + (Math.abs(U1 - U0) / Math.abs(U0)).toExponential(2) +
        ' with the wall counted; counting only the fluid it would read ' +
        (Math.abs(Q / U0)).toExponential(2));
  })();
  /* ⚠ THE LUMP CHAIN IS A CHAIN, AND THIS IS THE CHECK THAT CATCHES IT WIRED IN PARALLEL —
   * which behaves like one fat lump, responds too fast, and looks entirely reasonable from
   * outside. `wallLumps: 3` exists because the vessel shell is 114 mm and its own diffusion
   * time is ~1,080 s; a parallel wiring would throw that away silently. */
  (function () {
    var sysW = C.createSystem({ nodes: [walledNode(1250, 3, 30000, 20, 0.12)], P: 15.41 });
    var w = sysW.nodes[0].wall;
    for (var i = 0; i < 3; i++) w.T[i] += 60;           /* a hot wall, uniformly */
    var d0 = [], seen = [w.T[0], w.T[1], w.T[2]];
    for (i = 0; i < 2000; i++) C.step(sysW, 0.02, {});
    d0 = [seen[0] - w.T[0], seen[1] - w.T[1], seen[2] - w.T[2]];
    ckT('the lumps are a CHAIN: the inner one gives up its heat first, the outer one last',
        d0[0] > d0[1] && d0[1] > d0[2] && d0[2] > 0,
        'dropped ' + d0.map(function (x) { return x.toFixed(2); }).join(' / ') +
        ' degC inner->outer over 40 s — wired in PARALLEL all three would fall together');
    ckT('...and the OUTERMOST lump is adiabatic — no heat leaves the plant through the wall',
        w.T[2] > w.T[1],
        'outer ' + w.T[2].toFixed(2) + ' > middle ' + w.T[1].toFixed(2) +
        ' degC: it can only lose heat INWARD');
  })();
  /* THE FILM FOLLOWS THE FLOW, AND HAS A FLOOR. A stopped loop is exactly when stored wall heat
   * matters; a film that went to zero there would decouple the metal in the one regime the
   * feature exists for. */
  (function () {
    var full = C.wallFilm(1, 0), half = C.wallFilm(0.5, 0), dead = C.wallFilm(0, 0);
    ckT('the wall film scales with flow^0.8 and FLOORS at natural convection',
        Math.abs(full - C.WALL_FILM.h_rated_W_m2K) < 1e-9 &&
        Math.abs(half - C.WALL_FILM.h_rated_W_m2K * Math.pow(0.5, 0.8)) < 1e-9 &&
        dead === C.WALL_FILM.h_stagnant_W_m2K,
        full.toFixed(0) + ' / ' + half.toFixed(0) + ' / ' + dead.toFixed(0) +
        ' W/m2K at flow 1 / 0.5 / 0 — the floor is what keeps the metal coupled on a ' +
        'natural-circulation cooldown');
    /* ⚠ AND IT MUST FALL IN STEAM, WHICH THE FLOW HALF ABOVE CANNOT SEE. Leaving the phase term
     * out was a real defect in this feature's first cut: a dry, superheated core stayed coupled
     * to 88 t of metal through a LIQUID film, the metal absorbed 1,100 MJ, and an unmitigated
     * break with no emergency cooling stopped reaching the 10 CFR 50.46 clad limit at all.
     * BOTH branches need it and they need DIFFERENT factors — forced convection takes the
     * Dittus-Boelter group ratio (0.5), free convection takes the conductivity ratio (~0.1),
     * and using the forced one for the floor was the second half of the same defect. */
    var wetF = C.wallFilm(1, 0), dryF = C.wallFilm(1, 1);
    var wetS = C.wallFilm(0, 0), dryS = C.wallFilm(0, 1);
    ckT('...and it FALLS IN STEAM, on both branches and by different factors',
        Math.abs(dryF / wetF - C.WALL_FILM.vapor_ratio) < 1e-9 &&
        Math.abs(dryS / wetS - C.WALL_FILM.vapor_ratio_free) < 1e-9 &&
        C.WALL_FILM.vapor_ratio_free < C.WALL_FILM.vapor_ratio,
        'forced ' + wetF.toFixed(0) + ' -> ' + dryF.toFixed(0) + ' (x' +
        C.WALL_FILM.vapor_ratio + ', the Dittus-Boelter group), free ' + wetS.toFixed(0) +
        ' -> ' + dryS.toFixed(0) + ' (x' + C.WALL_FILM.vapor_ratio_free +
        ', the conductivity ratio) — one factor for both was worth 1,100 MJ');
  })();
  /* A NODE WITH NO WALL MUST BE UNTOUCHED — Layer 2's own fixtures are rigid and dry, and every
   * check above this section runs on one. If a wall-less node picked up a wall term by default,
   * all of them would be measuring a different plant than they say. */
  (function () {
    var sysD = C.createSystem({ nodes: [{ id: 'd0', V: 2.0, h: 1250 }], P: 15.41 });
    var r = C.step(sysD, 0.02, {});
    ckT('a node with NO wall stays rigid and dry — no wall is not a zero wall',
        sysD.nodes[0].wall === undefined && r.wallHeat_kW === 0, '');
  })();

}

console.log('\nPWR2 Layer 2 -- node/junction conservation core');
var C = loadFrom(SRC), rec = [];
runSuite(C, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  /* ---- THE METAL WALL (#574) ---- */
  ['the wall heat never reaches the fluid (the metal stores heat and nothing comes back)',
   '      dH[i] += Qw;', '      dH[i] += 0 * Qw;'],
  ['the wall heat has the wrong SIGN (a hot wall cools its fluid)',
   '    var Q = G0 * (w.T[0] - T_fluid);', '    var Q = G0 * (T_fluid - w.T[0]);'],
  ['the lumps are wired in PARALLEL — all of them see the fluid, none sees its neighbour',
   '      if (i === 0) net -= Q;\n      if (i > 0) net += w.Gc * (w.T[i - 1] - w.T[i]);\n' +
   '      if (i < w.n - 1) net += w.Gc * (w.T[i + 1] - w.T[i]);',
   '      net -= Q / w.n;'],
  ['the outermost lump leaks to ambient (heat leaves the plant through the vessel wall)',
   '      if (i < w.n - 1) net += w.Gc * (w.T[i + 1] - w.T[i]);',
   '      if (i < w.n - 1) net += w.Gc * (w.T[i + 1] - w.T[i]);\n' +
   '      else net += w.Gc * (20 - w.T[i]);'],
  ['the wall energy is left out of the conservation budget (the layer stops measuring)',
   '      for (var j = 0; j < w.n; j++) H += w.C * w.T[j];', ''],
  /* RE-ANCHORED when the film gained its PHASE term (#574) — the same two mutations, on the
   * lines the phase split moved them to. A third joins them: the phase term is what stops a
   * dry, superheated core being coupled to 88 t of metal through a LIQUID film, and leaving it
   * out cost 1,100 MJ of absorbed heat and made a core-melt sequence unreachable. */
  ['the film loses its natural-convection floor (a stopped loop decouples the metal)',
   '    return forced > floor ? forced : floor;', '    return forced;'],
  ['the film stops tracking flow (Dittus-Boelter\'s exponent dropped)',
   '                 ((1 - v) + v * WALL_FILM.vapor_ratio);',
   '                 ((1 - v) + v * WALL_FILM.vapor_ratio) * Math.pow(f, -WALL_FILM.dittus_exp);'],
  ['the film loses its PHASE term (steam coupled to the metal through a LIQUID film)',
   '    var floor  = WALL_FILM.h_stagnant_W_m2K * ((1 - v) + v * WALL_FILM.vapor_ratio_free);',
   '    var floor  = WALL_FILM.h_stagnant_W_m2K;'],
  ['the wall is constructed at a fixed temperature instead of its fluid\'s (every IC rings)',
   '      if (n.wall) node.wall = buildWall(n.wall, TFH(n.h, spec.P));',
   '      if (n.wall) node.wall = buildWall(n.wall, 20);'],
  ['the half-lump of metal in series with the film is dropped (a thick wall responds thin)',
   '    var G0 = 1 / (1 / hA + w.R_half_KW);', '    var G0 = hA;'],
  ['the root-tracking limit is deleted (a vanished root is ADOPTED as a teleport)',
   'var P_JUMP_MAX = 2.0;',
   'var P_JUMP_MAX = 1e9;'],
  /* ⚠ ANCHORS RE-CUT (#518). The two latches were separate post-commit statements; they are now
   * ONE pre-commit condition, because latching after adopting meant the held plant was the very
   * step the guard had just rejected. Each half is still mutated on its own. */
  ['the both-walls latch is deleted (the near-floor oscillation runs unlatched)',
   '(wallHi > 0 && wallLo > 0)', '(false)'],
  ['the ceiling persistence latch is deleted (#535 — loss of heat sink is immortal again)',
   '        sys._ceilHold > CEIL_HOLD_LATCH_S', '        false'],
  ['the ceiling hold never accumulates (#535 — the counter resets every step)',
   "    sys._ceilHold = ceilClamped > 0 ? (sys._ceilHold || 0) + dt : 0;",
   "    sys._ceilHold = 0;"],
  ['the beyond-model latch never fires (#487 — the pre-latch build, which went NaN)',
   '(sol.flooredLow && clampedNodes > 0)', '(false)'],
  /* The latch STAGES the new enthalpies and adopts them only past the guards (#518). Writing
   * them straight into the nodes is the pre-#518 behaviour: the held plant becomes the very step
   * the guard rejected. */
  ['the latch ADOPTS the rejected step before holding (#518 — the held plant is the blow-up)',
   'h_next[i] = h_new;                                  /* #518 — STAGED, not written yet */',
   'sys.nodes[i].h = h_new; h_next[i] = h_new;'],
  ['the held step keeps integrating (the hold is announced but not performed)',
   '    if (sys.beyond_model) {\n      sys.simTime += dt;', '    if (false) {\n      sys.simTime += dt;'],
  /* THE ENTHALPY ENVELOPE (2026-08-17). Three ways to get it wrong, and the third is the one
   * that actually happened to me: the clamp applied AFTER the solve instead of inside it. */
  ['the enthalpy state loses its ceiling (a dry node runs to 1e+304 and then NaN)',
   'var h_new = hClamp(h_raw);                 /* THE SAME function the solve used */',
   'var h_new = h_raw;'],
  ['the clamp binds SILENTLY — nothing is reported, so a caller cannot tell it left the range',
   'if (h_new !== h_raw) { clampedNodes++; discardedKJ += (h_raw - h_new) * m_n[i]; }',
   'if (h_new !== h_raw) { discardedKJ += 0; }'],
  /* ⚠ RETIRED at #516 item 9 (2026-08-29), and retired rather than quietly deleted, because the
   * REASON is the interesting part and it may reverse.
   *
   * This mutation moved `hClamp` out of the pressure solve's density sum — the defect whose fix
   * the check "the STORED enthalpies reproduce that mass" was written for, and which the file's
   * own comment measures at ~0.5 kg per step and growing. Once Layer 0's ceiling moved from
   * h_v(1000 degC) to h_v(3000 degC) it stopped being observable at all: MEASURED clean against
   * mutant, the reconstruction error and the solved pressure agree TO THE LAST DIGIT
   * (2.832e-6 kg, P 1.7559) across every fixture tried — 1, 3, 10 and 200 steps, drives from
   * 2e6 to 2e8 kW, and a floor-side cold drive. The clamp normalises each node's stored enthalpy
   * every step, so the next step's PROJECTION starts at the ceiling and never travels far enough
   * above it for the in-solve clamp to bind; at the old, much lower ceiling the density
   * derivative was steep enough that it did.
   *
   * THE GUARD STAYS IN THE CODE. It is correct, it is cheap, and it binds again the moment the
   * ceiling comes down or a node arrives from outside already far out of range. What is retired
   * is the CLAIM THAT THIS GATE COVERS IT — manufacturing a fixture that separates a
   * behaviourally-inert mutation would be coverage theatre, and a green blind-spot count that
   * was earned that way is worth less than an honest note. Restore this entry if TV_EXT_MAX is
   * ever lowered. */
  /* ⚠ ANCHOR RE-POINTED at #516 item 9, when the clamp moved to the extension ceiling. */
  ['the envelope ceiling becomes the LIQUID limit (every vapour node pinned far too low)',
   'var hHi = W.h_v(W.LIMITS.TV_EXT_MAX, sys.P);', 'var hHi = W.h_l(W.LIMITS.T_MAX, sys.P);'],
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
  else console.log('  caught    ' + m[0].padEnd(56) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_core: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
