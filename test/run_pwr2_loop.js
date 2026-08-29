/* run_pwr2_loop.js — Layer 3 gate for the PWR2 engine (#479).
 *
 * Layer 3 wires Layer 1's geometry into Layer 2's core as the actual SLS-100 loop. So this gate
 * asks three things a lower layer could not:
 *
 *   1. IS IT THE REAL PLANT? The loop must be built from `pwr2_geometry`, not from numbers
 *      invented here. A topology layer that quietly carries its own volumes would make Layer 1's
 *      whole provenance discipline pointless.
 *   2. DOES DERIVING THE JUNCTION FLOWS ACTUALLY HELP? Layer 2 left this open with a number:
 *      its conservation budget bottoms out because specified flows do not satisfy node mass
 *      balance. Layer 3 derives them instead (D2 §23.2 step 4). **The gate MEASURES derived
 *      against specified on the same plant with the same driver**, rather than asserting the
 *      design was right. If deriving ever stops helping, this check says so.
 *   3. DOES TRANSPORT GO THE RIGHT WAY ROUND A REAL LOOP? Conservation is integral and cannot
 *      localise anything — Layer 2 learned that the hard way when four blind spots appeared the
 *      moment its tolerances became a budget. Heat in the core must reach the hot leg and must
 *      NOT reach the cold leg.
 *
 * Run: node test/run_pwr2_loop.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_loop.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core'].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, C = RD.core, GEO = RD.geometry;
var VT = RD.vtable;                    /* #574 — the wall checks read a TEMPERATURE */

function loadFrom(src) {
  var root = { RD: { pwr2: { water: RD.water, core: RD.core, geometry: RD.geometry } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.loop;';
  return new Function('RD_ROOT', body)(root);
}

var H0 = { downcomer: 1240, lower_plenum: 1245, core: 1290, upper_plenum: 1300, hot_leg: 1300,
           sg_primary: 1270, crossover: 1245, rcp: 1245, cold_leg: 1240,
           vessel_heads: 1280, pressurizer: 1600 };

function runSuite(L, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(48) +
      'got ' + got.toExponential(3) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function mk(o) {
    o = o || {};
    return L.createLoop({ h: o.h || H0, P: o.P || 15.41, mdot: o.mdot || 1630,
                          includeOffLoop: o.includeOffLoop });
  }
  function node(sys, id) {
    for (var i = 0; i < sys.nodes.length; i++) if (sys.nodes[i].id === id) return sys.nodes[i];
    return null;
  }

  /* ---- 1. IT IS THE REAL PLANT ------------------------------------------------------- */
  if (!quiet) console.log('\nBUILT FROM LAYER 1  [not from numbers invented here]');
  var sys = mk();
  ckT('the ring is the documented loop order', L.RING.join('>') ===
      'downcomer>lower_plenum>core>upper_plenum>hot_leg>sg_primary>crossover>rcp>cold_leg',
      L.RING.length + ' nodes');
  var mismatched = [];
  sys.nodes.forEach(function (n) {
    var g = null;
    GEO.NODES.forEach(function (x) { if (x.id === n.id) g = x; });
    if (!g || Math.abs(g.V - n.V) > 1e-12) mismatched.push(n.id);
  });
  ckT('EVERY node volume comes from Layer 1 geometry', mismatched.length === 0,
      mismatched.length ? mismatched.join(', ') : sys.nodes.length + ' nodes matched exactly');
  var ringV = 0, totV = 0;
  sys.nodes.forEach(function (n) { totV += n.V; if (L.RING.indexOf(n.id) !== -1) ringV += n.V; });
  ckT('off-loop volumes are CARRIED but not transported',
      totV > ringV && L.OFF_LOOP.length === 2,
      'ring ' + (ringV * 35.3147).toFixed(1) + ' ft3 of ' + (totV * 35.3147).toFixed(1) + ' ft3 total');

  /* ---- THE METAL WALLS ARE WIRED ON (#574) --------------------------------------------------
   * This is the layer where the dark wire was. Layer 1 has shipped `wallLumps` on all eleven
   * nodes since it was written and NOTHING read it, so the table looked like a working feature.
   * These checks are about the WIRING — Layer 2 owns the physics and has its own. */
  if (!quiet) console.log('\nMETAL WALLS WIRED  [Layer 1 had them, nothing read them]');
  var noW = sys.nodes.filter(function (n) { return !n.wall; }).map(function (n) { return n.id; });
  var wrongM = sys.nodes.filter(function (n) {
    return n.wall && Math.abs(n.wall.M_kg - GEO.WALLS[n.id].M_kg) > 1e-9;
  }).map(function (n) { return n.id; });
  ckT('EVERY node carries Layer 1\'s own metal mass — the whole point of the ruling',
      noW.length === 0 && wrongM.length === 0,
      noW.length ? 'no wall: ' + noW.join(', ')
                 : (wrongM.length ? 'wrong mass: ' + wrongM.join(', ')
                                  : sys.nodes.length + ' nodes wired'));
  ckT('...and the lump COUNT is Layer 1\'s too — `wallLumps` finally has a consumer',
      sys.nodes.every(function (n) {
        var g = null; GEO.NODES.forEach(function (x) { if (x.id === n.id) g = x; });
        return n.wall && n.wall.n === g.wallLumps;
      }), 'downcomer ' + node(sys, 'downcomer').wall.n + ' lumps, sg_primary ' +
          node(sys, 'sg_primary').wall.n);
  /* THE ESCAPE HATCH IS REAL — Layer 2's own fixtures and any A/B against the pre-#574 plant
   * need a dry loop, and a flag that silently did nothing would be worse than none. */
  ckT('`dryWalls` builds the pre-#574 plant, with no wall anywhere',
      L.createLoop({ h: H0, P: 15.41, dryWalls: true })
       .nodes.every(function (n) { return n.wall === undefined; }), '');
  /* A MISSING GEOMETRY WALL IS REFUSED, NOT DEFAULTED. A node quietly getting 1 kg of metal is
   * the same dark wire in a new place, and it is the failure this whole issue is about. */
  (function () {
    var keep = GEO.WALLS.rcp;
    delete GEO.WALLS.rcp;
    var threw = false;
    try { L.createLoop({ h: H0, P: 15.41 }); } catch (e) { threw = /no metal wall for node rcp/.test(e.message); }
    GEO.WALLS.rcp = keep;
    ckT('a node with no geometry wall is REFUSED at construction, not given a default',
        threw, 'a silent default here is exactly the dark wire #574 exists to close');
  })();
  /* THE FILM SEES THE LOOP FLOW, and floors when the pumps stop — the regime stored wall heat
   * matters in. Asserted as the EFFECT (heat delivered), not as the coefficient. */
  (function () {
    function heatAt(mdot) {
      var s2 = L.createLoop({ h: H0, P: 15.41, mdot: mdot });
      node(s2, 'hot_leg').wall.T[0] += 40;              /* a hot wall, one node */
      return L.stepLoop(s2, 0.02, {}).wallHeat_kW;
    }
    var fast = heatAt(1630), slow = heatAt(30);
    ckT('the wall film follows the loop flow — a stopped pump delivers LESS, but never nothing',
        fast > slow && slow > 0,
        fast.toFixed(1) + ' kW at rated against ' + slow.toFixed(1) +
        ' kW at 2 % flow: the natural-convection floor is what keeps the metal coupled');
  })();
  /* ---- THE EFFECT, WHICH IS THE ONLY THING THAT MATTERS -------------------------------------
   * *(OWNER, 2026-08-12: "...RPV wall stored heat during a cooldown.")* Assert the CONSEQUENCE,
   * not the constant: at a FIXED duty out of the ring, a cooldown takes measurably longer with
   * the metal in it, because the metal's stored heat has to come out too.
   *
   * ⚠ THE FIXTURE MUST BE DUTY-LIMITED, AND THE FIRST ONE WAS NOT. An engine-level cooldown
   * driven by walking the steam-dump SETPOINT down measured a ratio of 1.000x — because the
   * pace was set by the setpoint ramp, not by the thermal mass, and the dumps simply passed more
   * steam. A probe whose pace is set by the operator cannot see thermal mass at all. Fixed duty
   * is what makes this a measurement.
   *
   * MEASURED, 20 degC fall: at 3 MW **1.391x** (407 -> 567 s), at 10 MW **1.270x** — the slower
   * the cooldown the more of the thick vessel wall has time to participate, approaching the
   * 1.46 capacity ratio. Both directions of that trend are physics, and a single-point band
   * would not have shown it. */
  (function () {
    function cool(dry, Q, dropC, cap) {
      var s2 = L.createLoop({ h: H0, P: 15.41, dryWalls: dry });
      var T0 = VT.T_from_h(s2.nodes[0].h, s2.P), t = 0;
      for (var i = 0; i < cap / 0.02; i++) {
        L.stepLoop(s2, 0.02, { heats: { sg_primary: -Q } });
        t += 0.02;
        if (VT.T_from_h(s2.nodes[0].h, s2.P) < T0 - dropC) return t;
      }
      return -1;
    }
    var drop = quiet ? 8 : 20, cap = quiet ? 200 : 400;
    var dry = cool(true, 10000, drop, cap), wet = cool(false, 10000, drop, cap);
    ckT('a fixed-duty cooldown takes LONGER with the metal in it — the stored heat comes out too',
        dry > 0 && wet > 0 && wet / dry > 1.15,
        'dry ' + dry.toFixed(1) + ' s against ' + wet.toFixed(1) + ' s with walls, ' +
        (wet / dry).toFixed(3) + 'x for a ' + drop + ' degC fall at 10 MW — at 3 MW it is 1.391x, ' +
        'because a slower cooldown reaches more of the vessel wall');
  })();

  /* ---- 2. THE MEASUREMENT LAYER 2 LEFT OPEN ------------------------------------------ */
  if (!quiet) console.log('\nDERIVED vs SPECIFIED JUNCTION FLOWS  [the open question, measured]');
  function drift(derived) {
    var s = mk(), U0 = C.internalEnergy(s), M0 = C.totalMass(s), worst = 0;
    for (var k = 0; k < 400; k++) {
      if (derived) { worst = Math.max(worst, Math.abs(L.stepLoop(s, 0.02, {}).ringClosure)); }
      else {
        var f = [];
        for (var i = 0; i < L.RING.length; i++) {
          f.push({ from: L.RING[i], to: L.RING[(i + 1) % L.RING.length], mdot: 1630 });
        }
        C.step(s, 0.02, { flows: f });
      }
    }
    return { U: (C.internalEnergy(s) - U0) / Math.abs(U0),
             M: (C.totalMass(s) - M0) / M0, close: worst };
  }
  var spec = drift(false), der = drift(true);
  ckT('DERIVING the junction flows beats specifying them',
      Math.abs(der.U) < Math.abs(spec.U),
      'energy drift ' + spec.U.toExponential(2) + ' specified -> ' + der.U.toExponential(2) +
      ' derived  (' + (Math.abs(spec.U) / Math.abs(der.U)).toFixed(1) + 'x better)');
  ckT('and it is STABLE, unlike the correction-on-top that diverged at Layer 2',
      isFinite(der.U) && Math.abs(der.U) < 1e-3,
      'Layer 2 measured -2.97e+12 and -4.42e+2 for the two correction sign conventions');
  ck('derived-flow energy drift is inside the budget', der.U, 0, 1e-4, '(rel)');
  ck('derived-flow mass drift', der.M, 0, 1e-6, '(rel)');
  /* Both halves matter: the gap must be SMALL, and it must be LIVE. A closure diagnostic
   * hard-wired to zero would pass the smallness test forever -- the self-test proved it. */
  ckT('the ring closes on itself', der.close / 1630 < 1e-3,
      der.close.toExponential(2) + ' kg/s gap on a 1630 kg/s loop (' +
      (100 * der.close / 1630).toFixed(3) + ' %)');
  var sysRC = mk({ h: 1250 }), sawClosure = 0;
  for (var krc = 0; krc < 40; krc++) {
    sawClosure = Math.max(sawClosure,
      Math.abs(L.stepLoop(sysRC, 0.02, { heats: { core: 200000, sg_primary: -200000 } }).ringClosure));
  }
  ckT('...and ring closure is a LIVE diagnostic, not a hard-wired zero', sawClosure > 1e-6,
      'peak ' + sawClosure.toExponential(2) + ' kg/s during a 200 MW transient');

  /* ---- 3. TRANSPORT GOES THE RIGHT WAY ROUND THE REAL LOOP --------------------------- */
  if (!quiet) console.log('\nDIRECTIONAL THROUGH THE REAL TOPOLOGY  [conservation cannot localise]');
  /* Core heat BALANCED by the steam generator, which is what a plant does. Driving 300 MW into
   * a closed loop with no sink was the first draft of this check, and it is not a plant -- it
   * crosses the property envelope in about a second. That mistake was worth making: it exposed
   * a solver that expanded to 1e+15 MPa while reporting success, now guarded. */
  var sysD = mk({ h: 1250 });
  for (var kd = 0; kd < 60; kd++) {
    L.stepLoop(sysD, 0.02, { heats: { core: 300000, sg_primary: -300000 } });
  }
  var hot = node(sysD, 'hot_leg').h, cold = node(sysD, 'cold_leg').h, up = node(sysD, 'upper_plenum').h;
  ckT('core heat reaches the HOT leg', hot > 1250.5, 'hot leg ' + hot.toFixed(1) + ' kJ/kg');
  ckT('...through the upper plenum, which is between them', up > 1250.5 && up >= hot - 1e-6,
      'upper plenum ' + up.toFixed(1) + ' >= hot leg ' + hot.toFixed(1));
  ckT('and does NOT reach the COLD leg (it is downstream of the SG)', cold < hot,
      'cold leg ' + cold.toFixed(1) + ' vs hot leg ' + hot.toFixed(1));
  ckT('the core-to-cold-leg rise is a real plant-scale dT', hot - cold > 5,
      (hot - cold).toFixed(1) + ' kJ/kg across the loop after 1.2 s');

  /* ---- 3b. THE ENVELOPE IS REPORTED, NOT SILENTLY EXCEEDED --------------------------- */
  if (!quiet) console.log('\nENVELOPE  [leaving the characterised range is a REPORTED condition]');
  var sysX = mk({ h: 1250 }), flagged = -1, Pmax = 0;
  for (var kx = 0; kx < 60; kx++) {
    var rx = L.stepLoop(sysX, 0.02, { heats: { core: 300000 } });   // no sink: unphysical on purpose
    if (rx.envelopeExceeded && flagged < 0) flagged = kx;
    Pmax = Math.max(Pmax, sysX.P);
  }
  ckT('running past the property envelope is FLAGGED', flagged >= 0,
      'envelopeExceeded first set at step ' + flagged);
  ckT('...and pressure is CLAMPED to the envelope, not run away', Pmax <= 18.0 + 1e-9,
      'max P ' + Pmax.toFixed(3) + ' MPa (before the guard this reached 2.8e+16)');
  /* ⚠ THIS NEGATIVE CONTROL WAS PINNING A NEAR-MISS, and #574 is what exposed it.
   *
   * It drove 300 MWt through a RIGID loop — no pressurizer, no free surface — and asserted the
   * envelope flag never set. It passed, by **0.024 MPa** of an 18.0 MPa envelope: the fixture
   * ran to 17.976 and stopped just short. "Balanced" was never true of it either; the heats sum
   * to zero but a rigid ring redistributing enthalpy between a hot node and a cold one moves
   * pressure, and this one moved it +2.57 MPa.
   *
   * A negative control standing 0.024 MPa from the thing it denies is not a control — it is the
   * standing "a check can pin a BIFURCATION, not a claim" trap, and ANY change that pressurises
   * this fixture slightly more reddens it while telling you nothing. #574's metal walls do
   * exactly that, and correctly: the steam-generator tube metal resists the SG's cooling and
   * feeds it back, so the ring's average temperature is higher at every instant.
   *   MEASURED, 200 steps at 300 MWt:  dry 17.976 MPa (flag clear, 0.024 to spare) ·
   *   with walls 18.000 (flagged, clamped).
   *
   * REPAIRED, not refitted: the same claim, at a duty this rigid fixture can actually hold, and
   * asserting the MARGIN so a near-miss cannot come back silently. It passes on BOTH plants —
   * dry 16.046 MPa, walls 16.785 — which is what makes it a better check rather than a
   * re-fitted one (HR10). The 300 MWt runaway is still covered: the two checks above assert
   * that going past the envelope IS flagged and IS clamped. */
  var sysOk = mk({ h: 1250 }), everFlagged = false, PmaxOk = 0;
  for (var ko = 0; ko < 200; ko++) {
    if (L.stepLoop(sysOk, 0.02, { heats: { core: 150000, sg_primary: -150000 } }).envelopeExceeded) {
      everFlagged = true;
    }
    PmaxOk = Math.max(PmaxOk, sysOk.P);
  }
  ckT('a driven loop at a duty it can hold stays OFF the envelope flag, with margin',
      !everFlagged && (18.0 - PmaxOk) > 0.5,
      'peak ' + PmaxOk.toFixed(3) + ' MPa, ' + (18.0 - PmaxOk).toFixed(3) +
      ' MPa of margin (the 300 MWt form this replaces passed by 0.024)');
  /* Heat removed at the SG must show up downstream of it, not upstream. */
  var sysS = mk({ h: 1250 });
  for (var ks = 0; ks < 60; ks++) L.stepLoop(sysS, 0.02, { heats: { core: 300000, sg_primary: -300000 } });
  ckT('SG heat removal cools DOWNSTREAM of the SG, not upstream',
      node(sysS, 'crossover').h < node(sysS, 'hot_leg').h,
      'crossover ' + node(sysS, 'crossover').h.toFixed(1) + ' < hot leg ' +
      node(sysS, 'hot_leg').h.toFixed(1));
  /* PRESSURE MOVES A LOT HERE, AND THAT IS CORRECT. Net heat is zero, so internal energy is
   * conserved — but the enthalpy DISTRIBUTION changes, density is non-linear in h, and a rigid
   * all-liquid loop must move pressure to keep the mass ledger closed. Measured 1.06 MPa for
   * this redistribution. The first draft asserted "holds roughly steady, < 0.5 MPa" and was
   * simply wrong about the plant.
   * THE REASON IT IS WRONG IS THE POINT: there is no pressurizer in this loop. A bubble is
   * exactly what makes a real RCS soft, and Layer 5 adds it. Asserting the STIFFNESS, and that
   * a compressible volume relieves it, is the honest version of this check — and it is the
   * measured argument for why the pressurizer is not optional. */
  ckT('a rigid loop with NO pressurizer is STIFF (this is why plants have one)',
      Math.abs(sysS.P - 15.41) > 0.3 && sysS.P < 18.0,
      sysS.P.toFixed(3) + ' MPa after 1.2 s of balanced core/SG duty, zero net heat');
  var stiff = Math.abs(sysS.P - 15.41);
  var sysB = L.createLoop({ h: 1250, P: 15.41, mdot: 1630 });
  sysB.extraMass = function (P) { return 2000 + 300 * (P - 15.41); };   // a bubble, Layer 5's seat
  sysB.M_total = C.totalMass(sysB);
  for (var kb = 0; kb < 60; kb++) {
    L.stepLoop(sysB, 0.02, { heats: { core: 300000, sg_primary: -300000 } });
  }
  ckT('...and a compressible volume RELIEVES that stiffness',
      Math.abs(sysB.P - 15.41) < stiff * 0.5,
      'with a bubble: ' + Math.abs(sysB.P - 15.41).toFixed(3) + ' MPa vs ' + stiff.toFixed(3) +
      ' rigid (' + (stiff / Math.max(1e-9, Math.abs(sysB.P - 15.41))).toFixed(1) + 'x softer)');

  /* ---- 4. THE DRIVING FLOW IS THE ONLY INDEPENDENT ONE -------------------------------- */
  if (!quiet) console.log('\nTHE DRIVING FLOW  [one momentum state; the rest is bookkeeping]');
  var sysF = mk();
  var r1 = L.stepLoop(sysF, 0.02, {});
  /* Assert the flow the head junction ACTUALLY CARRIED this step, not the derived value stored
   * after it -- the derivation restarts from mdot_loop, so reading it back cannot tell whether
   * the driver was re-imposed. Caught by this file's own self-test as a blind spot. */
  ckT('the head junction carries the driving flow EXACTLY, this step',
      Math.abs(r1.headFlowUsed - 1630) < 1e-9,
      r1.headFlowUsed.toFixed(6) + ' kg/s used at the head');
  var r2 = L.stepLoop(sysF, 0.02, { mdot: 900 });
  ckT('changing the loop flow changes the junctions', Math.abs(r2.mdot_loop - 900) < 1e-9);
  /* THE CHECK THAT ACTUALLY TESTS RE-IMPOSITION. On step 1 the head is still the seeded value,
   * so asserting there cannot tell whether the driver is being re-imposed -- the self-test
   * proved that. After the derivation has moved the head AND the driver has changed, only a
   * live re-imposition puts 900 on the head junction. */
  ckT('a CHANGED driver reaches the head junction immediately',
      Math.abs(r2.headFlowUsed - 900) < 1e-9,
      r2.headFlowUsed.toFixed(6) + ' kg/s carried at the head on the step the driver changed');
  var spread = 0;
  L.RING.forEach(function (id) { spread = Math.max(spread, Math.abs(r2.junctionFlow[id] - 900)); });
  ckT('junction flows track the driver, differing only by node mass change',
      spread < 50, 'max deviation ' + spread.toFixed(2) + ' kg/s from the 900 kg/s driver');

  /* ---- 5. TRANSIT IS REPORTED, NEVER ASSERTED ---------------------------------------- */
  if (!quiet) console.log('\nTRANSIT  [REPORTED -- the 10-12 s band is RETRACTED, D1 §3]');
  var sysT = mk(), tt = L.transitTime(sysT);
  /* Transit must be over the RING only. Including the stagnant off-loop volumes inflates it,
   * and "finite and positive" cannot tell the difference -- another blind spot the self-test
   * found. Recompute both here and require the ring answer. */
  var Vring = 0, Vall = 0;
  sysT.nodes.forEach(function (n) { Vall += n.V; if (L.RING.indexOf(n.id) !== -1) Vring += n.V; });
  var rho = RD.water.rho_from_h(sysT.nodes[0].h, sysT.P);
  ck('transit uses the RING volume, not the whole plant', tt, Vring / (1630 / rho), 1e-9, 's');
  ckT('...and the two genuinely differ, so that check can fail', Vall > Vring * 1.05,
      'ring ' + Vring.toFixed(2) + ' m3 vs plant ' + Vall.toFixed(2) + ' m3');
  ckT('loop transit is REPORTED, never banded', isFinite(tt) && tt > 0,
      tt.toFixed(2) + ' s -- NO BAND ASSERTED; geometry is declared provisional (D1 §24)');

  /* ---- 6. WHAT THE FIRST EIGHT MUTATIONS COULD NOT SEE --------------------------------
   * This section exists because the question "is 8 mutations enough?" was ASKED and then
   * MEASURED rather than assumed. Eight adversarial mutations were written against this gate;
   * four of them survived. All four are closed here, and each keeps the mutation that found it.
   *
   * The finding worth carrying: EVERY BLIND SPOT WAS AN INITIAL CONDITION OR AN ALIAS -- never
   * the physics. The curated eight all attacked the STEP (ring order, derivation, closure,
   * transit), because that is what the layer is interesting for. Nothing attacked what the plant
   * is HANDED before the first step, so nothing defended it. A mutation set written from "what
   * is this layer about?" inherits that question's blind spot. */
  if (!quiet) console.log('\nCONSTRUCTION  [the four blind spots the adversarial pass found]');

  /* (a) THE ALIAS. `sys.ring = RING` instead of `RING.slice()` hands every plant a reference to
   * the module constant, so one plant mutating its ring silently re-plumbs every plant made
   * after it -- including in the same process, which is exactly how these gates run. */
  var sysA = mk(), sysB = mk();
  sysA.ring.push('BOGUS');
  ckT('each plant owns its ring -- mutating one does not re-plumb the next',
      sysB.ring.indexOf('BOGUS') === -1 && L.RING.indexOf('BOGUS') === -1,
      'pushed a node onto plant A; plant B has ' + sysB.ring.length + ' and the module has ' +
      L.RING.length);

  /* (b,c) THE SHIPPED DEFAULTS. A caller that omits mdot/h gets these, and nothing pinned them.
   * 1630 kg/s is the rated loop flow and 1250 kJ/kg is the operating enthalpy -- both are the
   * numbers a probe silently inherits when it does not say otherwise, which is most probes. */
  var sysD = L.createLoop({});
  ck('default loop flow is the rated 1630 kg/s', sysD.mdot_loop, 1630, 1e-9, 'kg/s');
  ck('default node enthalpy is 1250 kJ/kg', sysD.nodes[0].h, 1250, 1e-9, 'kJ/kg');

  /* (d) THE SEED, and it is the subtle one. Junction flows are seeded at the loop flow and
   * DERIVED from the first step onward -- so a seed of zero HEALS ITSELF within one step and is
   * invisible to every settled-state check in this file. What it corrupts is the FIRST step,
   * where eight of nine junctions would carry nothing while the head carried full flow. The
   * check therefore reads the ring BEFORE stepping, which is the only place the seed exists.
   *
   * Same family as the de-energization traps in CLAUDE.md: a wrong initial condition that the
   * next update repairs is not benign, it is unobservable. */
  var sysS = mk(), seeded = 0;
  L.RING.forEach(function (id) { if (sysS.junctionFlow[id] === sysS.mdot_loop) seeded++; });
  ck('every junction is seeded at the loop flow BEFORE the first step',
     seeded, L.RING.length, 0, 'junctions');

  /* (e) THE PRESSURIZER'S SEAT MUST BE REACHABLE FROM HERE. Layer 2 owns the `extraMass` hook a
   * compressible volume plugs into, and D1 §25.3 said "the interface is ready and the physics can
   * be consumed" -- but `createLoop` did not forward `opts.extraMass`, so the seat existed and
   * NOTHING ABOVE LAYER 2 COULD SIT IN IT. Every plant built at Layer 3 or above was rigid, and
   * the doc asserted otherwise for a fortnight.
   *
   * Found by a CVCS probe that could not add 111 kg without pegging at the property table's
   * 18 MPa ceiling. Checked here, at the layer that drops it, and by its EFFECT rather than by
   * the option's presence -- an option that arrives and is never read is the same defect wearing
   * a passing check. */
  var bubble = function (P) { return 400 + 8.0 * (P - 15.41); };
  var sysPz = L.createLoop({ h: 1250, P: 15.41, extraMass: bubble });
  ckT('a compressible volume passed to createLoop REACHES Layer 2',
      typeof sysPz.extraMass === 'function' && Math.abs(sysPz.extraMass(16.41) - 408) < 1e-9,
      'extraMass(16.41 MPa) = ' + (sysPz.extraMass ? sysPz.extraMass(16.41).toFixed(1) : 'ABSENT') +
      ' kg -- the seat #472 plugs into');
  var rigid = L.createLoop({ h: 1250, P: 15.41 });
  var pSoft = null, pHard = null;
  for (var pz = 0; pz < 100; pz++) {
    pSoft = L.stepLoop(sysPz, 0.02, { heats: { core: 5000 } }).P || sysPz.P;
    pHard = L.stepLoop(rigid, 0.02, { heats: { core: 5000 } }).P || rigid.P;
  }
  /* (f) THE COURANT LIMIT IS REPORTED. Donor-cell transport is stable only while a step moves
   * less than a node's contents, and the binding node is the smallest on the ring. Nothing in
   * this engine documented that, because every probe used dt = 0.02 s and never went near it.
   *
   * VIOLATING IT DOES NOT LOOK LIKE AN ERROR -- measured at dt = 4 s the cold leg's enthalpy
   * oscillated 749 -> 806 -> -30 -> 8,999 -> -41,000,000 while duty and pressure read entirely
   * sane values, and an RHR cooldown probe reported reaching its 16-hour target in 36 seconds.
   * Smooth, plausible and wrong. Checked ACROSS the boundary, because "a limit exists" is
   * satisfied by one that is always true. */
  var sysCo = mk();
  var lim = L.courantLimit(sysCo);
  ckT('the Courant limit is a real, plant-sized number', lim > 0.05 && lim < 5,
      lim.toFixed(3) + ' s -- the smallest ring node divided by the loop flow');
  ckT('a step INSIDE the limit reports courantOK', L.stepLoop(mk(), lim * 0.5, {}).courantOK === true,
      'dt = ' + (lim * 0.5).toFixed(3) + ' s');
  ckT('...and a step OUTSIDE it reports NOT ok  [the boundary, not a band]',
      L.stepLoop(mk(), lim * 2, {}).courantOK === false,
      'dt = ' + (lim * 2).toFixed(3) + ' s -- the layer still STEPS; it just stops doing so silently');
  /* THE OFF-LOOP FILTER IS CORRECT AND CURRENTLY INERT, and that was measured rather than
   * assumed. Deleting `if (RING.indexOf(...) === -1) continue;` changes nothing today, because
   * both off-loop nodes -- vessel heads 1.78 m3 and the pressurizer 3.55 m3 -- are LARGER than
   * the cold leg at 0.99 m3, so the minimum does not move. It carries no mutation for the same
   * reason NH and the boron floor carry none (D1 §31.1d): a mutation that cannot fail is noise in
   * a self-test that exists to prove things can. The filter STAYS because it is correct -- an
   * off-loop node is not on the transport path and its residence time is meaningless there -- not
   * because anything exercises it. */
  ckT('the binding node is a RING node, and the off-loop filter is retained though inert',
      (function () {
        var mm = Infinity, id = null;
        sysCo.nodes.forEach(function (n) {
          if (L.RING.indexOf(n.id) === -1) return;
          var m = n.V * RD.water.rho_from_h(n.h, sysCo.P);
          if (m < mm) { mm = m; id = n.id; }
        });
        return id !== null && L.OFF_LOOP.indexOf(id) === -1;
      })(), 'binds on a ring node; both off-loop volumes are larger, so excluding them is inert ' +
      'TODAY and would not be if one ever shrank');

  ckT('the limit tightens when the loop runs faster', (function () {
        var slow = L.createLoop({ h: H0, P: 15.41, mdot: 400 });
        return L.courantLimit(slow) > lim * 2;
      })(), 'a quarter of the flow buys about four times the step -- so it is the FLOW that binds, ' +
      'not a constant somebody wrote down');

  /* ---- #518: THE CANARY MEASURES THE FLOW THAT ACTUALLY TRANSPORTS -----------------------------
   * For nine days this divided by `sys.mdot_loop` -- the HEAD flow, one number for the whole ring
   * -- while donor-cell moves `sys.junctionFlow[id]`, DERIVED per node. Identical on a healthy
   * plant, nothing alike late in a blowdown: measured on the severity-1 LOCA, derived flows reach
   * 990 -> 13,697 -> 124,675 kg/s against a head flow of 76-87, the true per-junction Courant
   * number reaches 2,745, and `courantOK` reported ZERO violations on every step of that ride.
   *
   * ⚠ THE OLD CHECKS ABOVE COULD NOT HAVE CAUGHT IT, and that is the point of this pair. Every
   * one of them runs on a plant whose junction flows equal the head flow, where the two forms are
   * the SAME NUMBER -- the defect lived exactly where nothing stood. So this constructs the
   * divergence directly: one node carrying far more than the head flow. */
  ckT('the limit binds on the DERIVED junction flow, not on the head flow (#518)',
      (function () {
        var s = mk(), before = L.courantLimit(s);
        /* one junction running 100x the head flow -- the late-blowdown signature, hand-built */
        s.junctionFlow[L.RING[4]] = s.mdot_loop * 100;
        var after = L.courantLimit(s);
        return after < before / 50 && after > 0;
      })(),
      'a junction at 100x the head flow tightens the limit ~100x; on the head-flow form it moved ' +
      'NOTHING, which is how a 2,745 Courant ride reported 0 violations');
  ckT('...so courantOK can now actually FIRE on that state — the canary was dead, not quiet',
      (function () {
        var s = mk();
        s.junctionFlow[L.RING[4]] = s.mdot_loop * 100;
        /* a dt comfortably inside the HEAD-flow limit but far outside the real one */
        return L.stepLoop(s, 0.02, {}).courantOK === false;
      })(),
      'dt = 0.02 s is 18x inside the head-flow limit and outside the junction one');

  /* ---- #518: THE SUB-STEP ----------------------------------------------------------------------
   * D2 §17.5 ADOPTED sub-stepping and it was never built. It is built in Layer 3, so Layer 2's
   * own "exactly dt" contract stays exact on every call. THREE claims, and the third is the one
   * that matters: the interval must still sum to exactly dt (D2 §24.2), because the service
   * credits the clock unconditionally and a deficit is silent forever. */
  ckT('N is 1 in the healthy regime — the sub-step costs nothing where nothing is wrong (#518)',
      L.stepLoop(mk(), 0.02, {}).subSteps === 1 &&
      L.stepLoop(mk(), lim * 0.5, {}).subSteps === 1,
      'at the house dt and at half the limit; a term that engaged everywhere would be a tax');
  ckT('...and it ENGAGES past the limit, scaling with how far past',
      (function () {
        var a = L.stepLoop(mk(), lim * 2, {}).subSteps;
        var b = L.stepLoop(mk(), lim * 8, {}).subSteps;
        return a >= 2 && b > a;
      })(),
      'N ' + L.stepLoop(mk(), lim * 2, {}).subSteps + ' at 2x the limit, ' +
      L.stepLoop(mk(), lim * 8, {}).subSteps + ' at 8x');
  ckT('...and however it subdivides, the clock advances EXACTLY dt (D2 §24.2)',
      (function () {
        var worst = 0;
        [[0.02, 500], [1.0, 50], [5.0, 20]].forEach(function (c) {
          var s = L.createLoop({ h: H0, P: 15.41, mdot: 1630 }), t0 = s.simTime;
          for (var i = 0; i < c[1]; i++) L.stepLoop(s, c[0], {});
          var e = Math.abs((s.simTime - t0) - c[1] * c[0]);
          if (e > worst) worst = e;
        });
        return worst < 1e-9;
      })(),
      'worst drift over 500 steps at dt = 0.02, 50 at 1.0 and 20 at 5.0 s is floating-point ' +
      'accumulation, not a systematic deficit — the failure D1 §8 calls silent');
  /* THE SEMANTIC THE FIX MUST NOT BREAK. If courantOK went true because the layer sub-stepped,
   * the canary would be asleep again — which is the whole defect #518 is about. It reports the
   * OUTER dt the caller asked for, always. */
  /* ⚠ THE INVARIANT THAT MAKES THE SUB-STEP MEAN ANYTHING, and the first version of this section
   * did not have it: the frozen-flow mutation was BLIND to every check above. Sub-stepping a
   * FROZEN flow set N times is not sub-stepping — it advances the same wrong transport N times in
   * smaller pieces and arrives at the same wrong answer. The flows must be re-walked off each
   * sub-step's own dm/dt, and the claim that says so is an EQUIVALENCE: one call that subdivides
   * into N must land where N calls of dt/N land. Driven with a heat imbalance so the junction
   * flows actually MOVE between sub-steps — on a flat plant they do not, and the check would be
   * vacuous exactly the way the ones above turned out to be. */
  ckT('one call sub-stepping N times lands where N calls of dt/N land (#518)',
      (function () {
        var D = { heats: { core: 250000, sg_primary: -250000 } };
        var big = L.createLoop({ h: H0, P: 15.41, mdot: 1630 });
        var rB = L.stepLoop(big, 1.0, D);
        if (!(rB.subSteps > 1)) return false;              /* precondition: it MUST subdivide */
        var many = L.createLoop({ h: H0, P: 15.41, mdot: 1630 });
        for (var i = 0; i < rB.subSteps; i++) L.stepLoop(many, 1.0 / rB.subSteps, D);
        var worst = 0;
        L.RING.forEach(function (id) {
          var a = big.junctionFlow[id], b = many.junctionFlow[id];
          var d = Math.abs(a - b) / Math.max(1, Math.abs(b));
          if (d > worst) worst = d;
        });
        var dP = Math.abs(big.P - many.P);
        return worst < 1e-6 && dP < 1e-6;
      })(),
      'N = ' + L.stepLoop(L.createLoop({ h: H0, P: 15.41, mdot: 1630 }), 1.0,
        { heats: { core: 250000, sg_primary: -250000 } }).subSteps +
      '; junction flows and pressure agree to 1e-6 — a frozen flow set diverges here');

  /* ---- #518: TIMESTEP CONVERGENCE — the claim that the freeze was NUMERICAL ------------------
   * This is the assertion the whole fix rests on. If the house dt and a quarter of it disagree,
   * the answer at the house dt is not a plant trajectory, it is a discretisation artefact — and
   * that is exactly what the pre-#518 blowdown was: dt = 0.02 froze at 160.8 s while dt = 0.01,
   * 0.005 and 0.0025 all ran on and agreed to 0.2 % (207.8 / 207.6 / 207.4 psia). Asserted here
   * on the LOOP, at Layer 3, where the transport lives, rather than through the whole engine:
   * driven hard enough that the house dt would violate the limit without the sub-step.
   *
   * ⚠ WHAT THIS DOES NOT CLAIM: accuracy. D2 §26.3 declares the low-pressure regime structurally
   * coarse — "Sub-stepping and the bracketed closure keep it stable and conservative; they do not
   * make it accurate" — and this check is agreement between two discretisations of the SAME
   * model, which is stability, not truth. */
  ckT('the house dt agrees with dt/4 where the limit binds — the answer is CONVERGED (#518)',
      (function () {
        var D = { heats: { core: 400000, sg_primary: -400000 } };
        var coarse = L.createLoop({ h: H0, P: 15.41, mdot: 1630 });
        var fine   = L.createLoop({ h: H0, P: 15.41, mdot: 1630 });
        var engaged = false;
        for (var i = 0; i < 40; i++) {
          if (L.stepLoop(coarse, 0.5, D).subSteps > 1) engaged = true;
          for (var j = 0; j < 4; j++) L.stepLoop(fine, 0.125, D);
        }
        if (!engaged) return false;                 /* precondition: the sub-step must have run */
        var dP = Math.abs(coarse.P - fine.P) / Math.abs(fine.P);
        var dh = 0;
        coarse.nodes.forEach(function (n, k) {
          var e = Math.abs(n.h - fine.nodes[k].h) / Math.max(1, Math.abs(fine.nodes[k].h));
          if (e > dh) dh = e;
        });
        return dP < 5e-3 && dh < 5e-3;
      })(),
      'dt = 0.5 s sub-stepped against 4x dt = 0.125 s over 20 s of forced transient — pressure ' +
      'and every node enthalpy agree to 0.5 %; without the sub-step the coarse run diverges');

  ckT('courantOK still reports the OUTER dt — sub-stepping does not silence the canary (#518)',
      (function () {
        var r = L.stepLoop(mk(), lim * 4, {});
        return r.subSteps >= 4 && r.courantOK === false;
      })(),
      'N >= 4 and courantOK STILL false — the caller is told what it asked for was too coarse');

  ckT('...and it actually SOFTENS the loop, so the hook is not cosmetic',
      (sysPz.P - 15.41) < 0.9 * (rigid.P - 15.41) && (rigid.P - 15.41) > 0,
      'dP ' + (sysPz.P - 15.41).toFixed(4) + ' MPa with the bubble against ' +
      (rigid.P - 15.41).toFixed(4) + ' rigid, over 2 s of heating');
}

console.log('\nPWR2 Layer 3 -- the SLS-100 loop');
var L = loadFrom(SRC), rec = [];
runSuite(L, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['ring order reversed (flow runs backwards)',
   "var RING = ['downcomer', 'lower_plenum', 'core', 'upper_plenum', 'hot_leg',\n              'sg_primary', 'crossover', 'rcp', 'cold_leg'];",
   "var RING = ['downcomer', 'cold_leg', 'rcp', 'crossover', 'sg_primary',\n              'hot_leg', 'upper_plenum', 'core', 'lower_plenum'];"],
  ['the core dropped out of the ring',
   "'downcomer', 'lower_plenum', 'core', 'upper_plenum'", "'downcomer', 'lower_plenum', 'upper_plenum'"],
  ['node volumes invented instead of read from Layer 1',
   /* RE-ANCHORED at #574: the node literal became a var so the metal wall could be attached to
    * it. Same mutation — Layer 3 inventing volumes instead of reading Layer 1. */
   'var node = { id: id, V: g.V,', 'var node = { id: id, V: 2.0,'],
  ['junction flows no longer derived (revert to specified)',
   'carry = carry - (dmdt[id] || 0);', 'carry = carry - 0;'],
  ['the driving flow stops being re-imposed at the head',
   'sys.junctionFlow[RING[0]] = sys.mdot_loop;', ''],
  ['ring closure silently zeroed', 'r.ringClosure = carry - sys.mdot_loop;', 'r.ringClosure = 0;'],
  ['off-loop volumes dropped from the ledger',
   'if (opts.includeOffLoop !== false) ids = ids.concat(OFF_LOOP);', ''],
  ['transit time computed on the whole plant, not the ring',
   'if (RING.indexOf(n.id) !== -1) V += n.V;', 'V += n.V;'],
  /* The four the adversarial pass found. Each is kept so the check that closed it cannot rot. */
  ['sys.ring ALIASES the module constant instead of copying it',
   'sys.ring = RING.slice();', 'sys.ring = RING;'],
  /* RE-ANCHORED at #574: the bare 1630 became MDOT_RATED when the wall film needed a second
   * reader of it. The mutation moves the CONSTANT now, which is strictly stronger — it moves the
   * default AND the film's flow fraction together, which is what "one copy" is supposed to mean. */
  ['the shipped default loop flow is changed',
   '  var MDOT_RATED = 1630;', '  var MDOT_RATED = 1000;'],
  ['the shipped default node enthalpy is changed',
   'h: h === undefined ? 1250 : h }', 'h: h === undefined ? 1400 : h }'],
  /* ---- THE METAL WALL WIRING (#574) ---- */
  ['Layer 3 stops wiring the walls on (Layer 1\'s masses go back to being dead data)',
   '      if (!opts.dryWalls) {', '      if (false) {'],
  ['a node silently gets a DEFAULT wall instead of a refusal when geometry has none',
   "        if (!gw) throw new Error(\x27Layer 3: no metal wall for node \x27 + id + \x27 — #574 puts one \x27 +\n" +
   "                                 \x27on every node; a missing entry is a defect, not a default\x27);",
   '        if (!gw) gw = { M_kg: 1, A_m2: 1, t_m: 0.01, mat: \'cs\' };'],
  ['the wall film stops seeing the loop flow (it is pinned at rated for ever)',
   '        flowFrac: Math.abs(sys.mdot_loop) / MDOT_RATED',
   '        flowFrac: 1'],
  ['junction flows seeded at ZERO (heals in one step, corrupts the first)',
   'RING.forEach(function (id) { sys.junctionFlow[id] = sys.mdot_loop; });',
   'RING.forEach(function (id) { sys.junctionFlow[id] = 0; });']
,
  /* ⚠ ANCHOR RE-CUT (#518). This was verbatim `return flow > 1e-9 ? mMin / flow : Infinity;` —
   * the exact line the fix rewrote — so it reported ANCHOR NOT FOUND and blinded the gate the
   * moment the change landed. Loudly, which is the good case. */
  ['the Courant limit reported as a constant instead of from the plant',
   '      var t = q > 1e-9 ? m / q : Infinity;', '      var t = 999;'],
  /* ---- #518, the per-junction canary and the sub-step ---- */
  ['the canary goes back to the HEAD flow (the dead-canary defect, restored)',
   'var q = Math.abs(sys.junctionFlow && sys.junctionFlow[id] !== undefined\n                       ? sys.junctionFlow[id] : sys.mdot_loop);',
   'var q = Math.abs(sys.mdot_loop);'],
  ['the sub-step is disabled — N pinned at 1 whatever the Courant number says',
   '      nSub = Math.ceil(dt / lim0);', '      nSub = 1;'],
  ['the sub-intervals do not sum to dt (the silent clock deficit D2 §24.2 names)',
   'var h = (s === nSub - 1) ? (dt - spent) : hSub;', 'var h = hSub * 0.9;'],
  ['courantOK reads the SUB-step, putting the canary back to sleep',
   'r.courantOK = dt <= r.courantLimit_s;',
   'r.courantOK = (dt / nSub) <= r.courantLimit_s;'],
  ['the junction flows are NOT re-derived between sub-steps (sub-stepping a frozen flow set)',
   '      carry = sys.mdot_loop;\n      for (var k = 0; k < RING.length; k++) {',
   '      carry = sys.mdot_loop;\n      for (var k = 0; k < RING.length && s === 0; k++) {'],
  ['courantOK always true (the instability goes back to being silent)',
   'r.courantOK = dt <= r.courantLimit_s;', 'r.courantOK = true;'],
  ['extraMass NOT forwarded to Layer 2 (the pressurizer seat is unreachable)',
   'extraMass: opts.extraMass });', '});']];

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
console.log('  run_pwr2_loop: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
