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
  var sysOk = mk({ h: 1250 }), everFlagged = false;
  for (var ko = 0; ko < 200; ko++) {
    if (L.stepLoop(sysOk, 0.02, { heats: { core: 300000, sg_primary: -300000 } }).envelopeExceeded) {
      everFlagged = true;
    }
  }
  ckT('a BALANCED plant at full power never trips the envelope flag', !everFlagged,
      'P ' + sysOk.P.toFixed(3) + ' MPa at 300 MWt with the SG removing it');
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
   'return { id: id, V: g.V,', 'return { id: id, V: 2.0,'],
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
  ['the shipped default loop flow is changed',
   'sys.mdot_loop = opts.mdot === undefined ? 1630 : opts.mdot;',
   'sys.mdot_loop = opts.mdot === undefined ? 1000 : opts.mdot;'],
  ['the shipped default node enthalpy is changed',
   'h: h === undefined ? 1250 : h };', 'h: h === undefined ? 1400 : h };'],
  ['junction flows seeded at ZERO (heals in one step, corrupts the first)',
   'RING.forEach(function (id) { sys.junctionFlow[id] = sys.mdot_loop; });',
   'RING.forEach(function (id) { sys.junctionFlow[id] = 0; });']
,
  ['extraMass NOT forwarded to Layer 2 (the pressurizer seat is unreachable)',
   'extraMass: opts.extraMass });', '});']];

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
