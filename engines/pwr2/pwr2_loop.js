/* pwr2_loop.js — Layer 3: the SLS-100 wiring. (#479)
 *
 * Takes Layer 1's geometry and Layer 2's conservation primitives and makes them one plant loop.
 * Reads Layers 0-2 and nothing above. Blueprint/PWR2_DESIGN.md §7.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE THING THIS LAYER CHANGES ABOUT HOW THE CORE IS DRIVEN, AND WHY IT MATTERS.
 *
 * Layer 2 takes junction flows as GIVEN. That is what a generic primitive must do, and it is
 * also why its conservation budget bottoms out at ~3e-4: specified flows do not satisfy each
 * node's mass balance once densities move, and the difference is real mass crossing a junction
 * carrying real enthalpy that nothing accounts for (SUM h_i*dm_i, 99.7 % of the drift).
 *
 * A ring HAS a topology, so Layer 3 does not have to specify them. D2 §23.2 step 4:
 *
 *     mdot_out,i = mdot_in,i - (V_i*rho_i^{n+1} - m_i^n)/dt
 *
 * ONE driving flow enters the ring — the loop momentum state — and every junction flow after it
 * FOLLOWS from the mass difference, sequentially around the loop. Node mass balance is then
 * satisfied BY CONSTRUCTION rather than by assumption.
 *
 * ⚠ WHY THIS IS NOT THE FIX THAT DIVERGED. Layer 2's header records that applying the expansion
 * as a CORRECTION on top of specified flows is unstable in both sign conventions. This is a
 * different thing: the derived flows ARE the transport, not an adjustment layered on top of it,
 * so there is nothing to double-count. Whether that is actually stable is a measurement, not an
 * argument — `run_pwr2_loop.js` makes it, against Layer 2's specified-flow baseline, and the
 * result is recorded there rather than claimed here.
 *
 * ---------------------------------------------------------------------------------------
 * THE LOOP ORDER is D3 §2's node table, nodes 1-9, closed cold leg -> downcomer:
 *
 *   downcomer -> lower_plenum -> core -> upper_plenum -> hot_leg
 *             -> sg_primary -> crossover -> rcp -> cold_leg -> (downcomer)
 *
 * OFF-LOOP, and deliberately NOT wired here:
 *   vessel_heads  a stagnant branch off the upper plenum — carried as volume, no transport
 *   pressurizer   hangs off the hot leg through the surge line. Its three-state model is
 *                 Layer 5 and #472 owns it; Layer 3 exposes the attachment point and stops.
 *
 * UNITS ARE SI, as Layer 2. P MPa · h kJ/kg · V m3 · mdot kg/s · Q kW
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  var CORE = RD && RD.core, GEO = RD && RD.geometry;
  /* #514: the per-step Courant report goes through the table — pwr2_core's idiom, resolved
   * once at load. On the direct correlations this DIAGNOSTIC was 20 % of the whole engine
   * step (~220 us of 1090). */
  var VT = RD && RD.vtable;
  var RHO = VT ? VT.rho_from_h : (RD && RD.water && RD.water.rho_from_h);

  /* The transport ring, in flow order. Names are Layer 1's node ids. */
  var RING = ['downcomer', 'lower_plenum', 'core', 'upper_plenum', 'hot_leg',
              'sg_primary', 'crossover', 'rcp', 'cold_leg'];
  /* Carried as volume, not transported. */
  var OFF_LOOP = ['vessel_heads', 'pressurizer'];

  function geoNode(id) {
    for (var i = 0; i < GEO.NODES.length; i++) if (GEO.NODES[i].id === id) return GEO.NODES[i];
    return null;
  }

  /* createLoop(opts)
   *   opts.h       initial enthalpy, kJ/kg (uniform) or a map by node id
   *   opts.P       initial pressure, MPa
   *   opts.mdot    initial loop mass flow, kg/s — the momentum state's value. Layer 3 does not
   *                INTEGRATE momentum (that needs pump curves and friction, which is Layer 4);
   *                it takes the loop flow as given and derives every junction from it.
   *   opts.includeOffLoop  default true — carry the stagnant volumes in the mass ledger */
  function createLoop(opts) {
    opts = opts || {};
    var P = opts.P === undefined ? 15.41 : opts.P;
    var ids = RING.slice();
    if (opts.includeOffLoop !== false) ids = ids.concat(OFF_LOOP);
    var nodes = ids.map(function (id) {
      var g = geoNode(id);
      if (!g) throw new Error('Layer 3: no geometry for node ' + id);
      var h = (opts.h && typeof opts.h === 'object') ? opts.h[id] : opts.h;
      return { id: id, V: g.V, h: h === undefined ? 1250 : h };
    });
    /* extraMass IS FORWARDED, and it was not until 2026-08-15. Layer 2 owns the compressible-volume
     * hook that the PRESSURIZER plugs into (D1 §25.3), but `createLoop` did not pass it through --
     * so no plant built at Layer 3 or above could have one, and every such plant was RIGID.
     * §25.3 said "the interface is ready and the physics can be consumed"; the seat existed and
     * was unreachable from every layer that would sit in it. Found by a CVCS inventory probe that
     * could not add 111 kg without pegging at 18 MPa. */
    var sys = CORE.createSystem({ nodes: nodes, P: P, iterCap: opts.iterCap,
                                  extraMass: opts.extraMass });
    sys.ring = RING.slice();
    sys.mdot_loop = opts.mdot === undefined ? 1630 : opts.mdot;
    /* Junction flows, one per ring segment, indexed by the node the segment LEAVES.
     * Seeded at the loop flow; from the first step on they are DERIVED. */
    sys.junctionFlow = {};
    RING.forEach(function (id) { sys.junctionFlow[id] = sys.mdot_loop; });
    return sys;
  }

  /* stepLoop(sys, dt, drivers)
   *   drivers.heats   {nodeId: kW}
   *   drivers.sources [{node, mdot, h}]  boundary mass
   *   drivers.mdot    optional new loop flow (Layer 4 will drive this from momentum)
   *
   * The ring's flows are the DERIVED junction flows from the previous step, with the driving
   * flow re-imposed at the ring's head. That is what makes node mass balance close. */
  /* ---- THE COURANT LIMIT, AND IT IS REPORTED RATHER THAN SILENT --------------------------
   *
   * Donor-cell transport is only stable while a timestep moves LESS than a node's contents. The
   * binding node is the smallest one on the ring divided by the loop flow -- for the SLS-100 that
   * is the cold leg at ~930 kg against 1630 kg/s, i.e. **0.435 s**.
   *
   * VIOLATING IT DOES NOT LOOK LIKE AN ERROR. Measured at dt = 4 s, the cold leg's enthalpy
   * oscillated with growing amplitude -- 749 -> 806 -> -30 -> 8,999 -> -41,000,000 -- while duty
   * and pressure went on reading entirely sane values, and a 16-hour cooldown probe reported
   * reaching its target in 36 seconds. **Smooth, plausible, and wrong**, which is the worst thing
   * a numerical instability can be.
   *
   * Every probe in this engine had used dt = 0.02 s and never approached the limit, so nothing
   * documented it and nothing checked it. It is now a REPORTED condition on the step's result:
   * this layer does not refuse the step -- a caller may legitimately want a coarse survey and know
   * what it is buying -- but it can no longer do so unknowingly. Same principle as the envelope
   * guard: the model says when it has left the regime it is valid in. */
  function courantLimit(sys) {
    var mMin = Infinity;
    for (var i = 0; i < sys.nodes.length; i++) {
      if (RING.indexOf(sys.nodes[i].id) === -1) continue;
      var m = sys.nodes[i].V * RHO(sys.nodes[i].h, sys.P);
      if (m < mMin) mMin = m;
    }
    var flow = Math.abs(sys.mdot_loop);
    return flow > 1e-9 ? mMin / flow : Infinity;
  }

  function stepLoop(sys, dt, drivers) {
    drivers = drivers || {};
    if (drivers.mdot !== undefined) sys.mdot_loop = drivers.mdot;

    /* Re-impose the driving flow at the head of the ring; the rest are last step's derived
     * values. The head is where the momentum state enters — everything downstream of it is
     * bookkeeping, not an independent degree of freedom. */
    sys.junctionFlow[RING[0]] = sys.mdot_loop;

    var flows = [];
    for (var i = 0; i < RING.length; i++) {
      flows.push({ from: RING[i], to: RING[(i + 1) % RING.length],
                   mdot: sys.junctionFlow[RING[i]] });
    }

    var r = CORE.step(sys, dt, {
      flows: flows, heats: drivers.heats || {}, sources: drivers.sources || []
    });

    /* ---- DERIVE the next step's junction flows, sequentially round the ring.
     * mdot_out,i = mdot_in,i - dm_i/dt. Walking the ring from the head propagates the driving
     * flow through every node's own mass change, so each junction carries what actually
     * crossed it rather than what was assumed to. */
    var dmdt = {};
    r.junction.forEach(function (j) { dmdt[j.id] = j.dm_dt; });
    var carry = sys.mdot_loop;
    for (var k = 0; k < RING.length; k++) {
      var id = RING[k];
      carry = carry - (dmdt[id] || 0);
      sys.junctionFlow[id] = carry;
    }

    /* The ring must close: after walking every node, the flow arriving back at the head must
     * equal what left it, to within the mass the ring gained or lost at its boundary. The gap
     * is REPORTED, because it is the honest measure of how well the sequential derivation
     * closed — not hidden inside a conserved total. */
    r.ringClosure = carry - sys.mdot_loop;
    /* REPORTED, every step. `courantOK` false means the numbers above are not to be trusted. */
    r.courantLimit_s = courantLimit(sys);
    r.courantOK = dt <= r.courantLimit_s;
    r.mdot_loop = sys.mdot_loop;
    r.headFlowUsed = flows[0].mdot;      // what the head junction actually carried THIS step
    r.junctionFlow = {};
    RING.forEach(function (id) { r.junctionFlow[id] = sys.junctionFlow[id]; });
    return r;
  }

  /* Loop transit time, s — REPORTED, never asserted against a band. The "10-12 s" figure was
   * recalled, is RETRACTED (D1 §3), and the check it sat in was found circular (D3 §1). */
  function transitTime(sys) {
    var V = 0, W = RD.water;
    sys.nodes.forEach(function (n) { if (RING.indexOf(n.id) !== -1) V += n.V; });
    var rho = W.rho_from_h(sys.nodes[0].h, sys.P);
    return V / (sys.mdot_loop / rho);
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.loop = {
    RING: RING, OFF_LOOP: OFF_LOOP,
    createLoop: createLoop, stepLoop: stepLoop, transitTime: transitTime,
    courantLimit: courantLimit
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
