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
 *
 * ⚠ THE PRESSURIZER IS NOT A NODE (#583, 2026-08-28). It hangs off the hot leg through the
 * surge line, but its volume lives ENTIRELY in Layer 5 (`pwr2_pressurizer`, three regions,
 * plugged into Layer 2's `extraMass` seat below). This list carried a second `pressurizer`
 * here for a fortnight after Layer 5 landed, so the plant modelled 983 ft3 of RCS against its
 * own declared 835.8 — 2,539 kg of RIGID water that no break, ECCS, CVCS or RHR path could
 * reach, stiffening the pressure solve and inflating `M_nominal`. Layer 3's job at the surge
 * line is the ATTACHMENT POINT (`hot_leg`), not a volume.
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
  /* Carried as volume, not transported. ONE member since #583 — the pressurizer left because
   * it was never a volume this layer owned; see the header. */
  var OFF_LOOP = ['vessel_heads'];

  /* THE RATED LOOP FLOW, ONE COPY. It was a bare 1630 inside createLoop, and #574 needed a
   * second reader — the wall film scales with flow over rated — which is exactly how the
   * PROTECTION_DT trap starts. Layer 4's `pwr2_sources.PUMP.mdot_rated` is the same number and
   * is the one Layer 4 uses; this layer cannot read upward, so the two are tied by a gate check
   * rather than by an import. */
  var MDOT_RATED = 1630;

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
      var node = { id: id, V: g.V, h: h === undefined ? 1250 : h };
      /* ---- THE METAL WALL (#574) --------------------------------------------------------
       * Layer 1 owns the mass and the area, Layer 2 owns the integration, and THIS is the
       * wiring between them — the same division as everywhere else in the stack. `wallLumps`
       * has been on every node in the geometry table since it was written, with ZERO consumers
       * until now; this line is what stops it reading as a working feature to the next person
       * who opens that file.
       *
       * REFUSED, not defaulted, when the geometry has no wall for a node: a node that silently
       * got zero metal would be the same dark wire in a new place, and the whole point is that
       * every node has one. `opts.dryWalls` is the deliberate escape for Layer 2/3 fixtures
       * that want the old rigid-and-dry plant to compare against. */
      if (!opts.dryWalls) {
        var gw = GEO.WALLS && GEO.WALLS[id];
        if (!gw) throw new Error('Layer 3: no metal wall for node ' + id + ' — #574 puts one ' +
                                 'on every node; a missing entry is a defect, not a default');
        var mat = GEO.WALL_MAT[gw.mat];
        node.wall = { M_kg: gw.M_kg, cp: mat.cp, k: mat.k,
                      A_m2: gw.A_m2, t_m: gw.t_m, lumps: g.wallLumps };
      }
      return node;
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
    sys.mdot_loop = opts.mdot === undefined ? MDOT_RATED : opts.mdot;
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
   * binding node is the smallest one on the ring divided by the flow through it -- for the SLS-100
   * that is the **RCP node at 603 kg** against 1630 kg/s, i.e. **0.370 s**.
   *
   * (This line said "the cold leg at ~930 kg ... 0.435 s" until #518 -- wrong node and wrong
   * number, while D1 §32.1 had it right all along at "~600 kg ... dt <= 0.370 s". The CODE always
   * returned 0.370; only the prose was stale, which is the worse of the two ways to be wrong,
   * because a number in a comment is what the next person sizing a timestep will read.)
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
   * guard: the model says when it has left the regime it is valid in.
   *
   * ⛔ AND FOR NINE DAYS IT MEASURED THE WRONG FLOW (#518). The divisor was `sys.mdot_loop` -- the
   * HEAD flow, one number for the whole ring -- while what actually transports across a junction
   * is `sys.junctionFlow[id]`, DERIVED per node by the walk at the bottom of stepLoop. Those are
   * the same number on a healthy plant and nothing like it late in a blowdown: at ~7 % inventory
   * the ring nodes hold single-digit kilograms, a small node's large relative dm/dt amplifies the
   * derived flows, and the two diverge by four orders of magnitude.
   *
   * MEASURED on the severity-1 LOCA that #517 filed as a freeze: derived junction flows reach
   * 990 -> 13,697 -> 124,675 kg/s while mdot_loop sits at 76-87, the true per-junction Courant
   * number reaches 2,745 -- and `courantOK` reported **0 violations on every step of that ride**.
   * The one diagnostic built to name this instability was reporting a number about a different
   * quantity, so the instability stayed exactly as silent as it was before the diagnostic existed.
   *
   * PER JUNCTION now: each ring node's mass against the flow LEAVING it, minimum over the ring.
   * Still a scalar in seconds, still the same meaning, still ~0.435 s on a rated plant (junction
   * flows equal the head flow there, which is why nine days of green probes agreed). */
  function courantLimit(sys) {
    var lim = Infinity;
    for (var i = 0; i < sys.nodes.length; i++) {
      var id = sys.nodes[i].id;
      if (RING.indexOf(id) === -1) continue;
      var m = sys.nodes[i].V * RHO(sys.nodes[i].h, sys.P);
      /* the flow LEAVING this node -- what donor-cell actually moves out of it. Seeded to
       * mdot_loop at construction, so this is callable on a never-stepped system. */
      var q = Math.abs(sys.junctionFlow && sys.junctionFlow[id] !== undefined
                       ? sys.junctionFlow[id] : sys.mdot_loop);
      var t = q > 1e-9 ? m / q : Infinity;
      if (t < lim) lim = t;
    }
    return lim;
  }

  /* ---- THE RING SUB-STEP (#518) ---------------------------------------------------------------
   * D2 §17.5 ADOPTED sub-stepping — "ADOPT. Crossing time is linear in tau" — and priced it
   * ("Cost: all five schemes within 4 % of each other. Branch-freezing and sub-stepping are
   * free."). It was never built: nothing in this engine subdivided anything until now.
   *
   * WHY IT IS BUILT HERE AND NOT IN LAYER 2. `CORE.step` is generic and its header forbids
   * sub-stepping a partial interval; the ring, its donor-cell transport and its derived junction
   * flows are Layer 3's. Calling CORE.step N times with dt/N leaves Layer 2's own contract exact
   * on every call, and Layer 3's sub-intervals sum to exactly dt — which is D2 §24.2's rule
   * verbatim: "engine.step(dt) MUST advance the physics by exactly dt, however it subdivides
   * internally... It may never return early." No reject-and-retry: that is the analysis-code
   * pattern §24.2 explicitly forswears, because simulation_service credits the clock regardless.
   *
   * ⚠ THE FLOWS ARE RE-DERIVED BETWEEN SUB-STEPS, AND THAT IS THE WHOLE POINT. Sub-stepping a
   * FROZEN flow set N times buys nothing — the instability is the flows themselves running away,
   * so each sub-step must re-walk the ring off its own dm/dt. That is why the derivation moved
   * inside the loop below.
   *
   * MEASURED (#518, on the converged trajectory): 83 extra inner solves across 90,001 outer steps
   * — 0.09 % — worst case N = 3, first engaged at 160.0 s of a 1,800 s severity-1 LOCA. It costs
   * nothing anywhere the plant is healthy, because N is 1 there by construction.
   *
   * ⚠ A DECLARED DEPARTURE, not an oversight: D1 §32.2 ruled this limit "REPORTED, not enforced
   * ... the layer still takes the step ... and does not decide what to do about it". Choosing N
   * from that number IS the layer deciding. The defence, and it is why the ruling survives in
   * spirit: this still TAKES the step and still advances exactly dt. It subdivides rather than
   * refuses, so a caller wanting a coarse survey still gets the interval it asked for, and
   * `courantOK` below still reports the OUTER dt against the limit — it never reads true merely
   * because the layer sub-stepped. The caller is told what it bought; it is just no longer handed
   * an unstable answer to go with it. (D1 §32.2 is agent-authored design text, advisory under
   * CONTEXT.md §3 rule 4 — weighed, departed from, and declared here rather than quietly.)
   *
   * ⚠ WHAT THIS DOES NOT BUY: accuracy. D2 §26.3 declares the low-pressure limit STRUCTURAL —
   * "Below roughly 1-2 MPa (150-290 psia), PWR2 resolves the liquid/two-phase transition at the
   * limit of its timestep ... Sub-stepping (§17.5) and the bracketed closure (§23.2) keep it
   * stable and conservative; they do not make it accurate" — and "Declare it; do not engineer
   * around it." This claims STABILITY ONLY. Late-blowdown numbers remain quantitatively coarse. */
  var NSUB_MAX = 16;   /* [derived] — the measured worst case is 3; 16 is >5x that and bounds the
    * per-frame cost at a hard ceiling, which is what makes the sub-step real-time-safe. Hitting
    * the cap is not an error and is not silent: courantOK still reports the outer dt honestly,
    * so a step the cap could not resolve says so exactly as it did before this existed. */

  function stepLoop(sys, dt, drivers) {
    drivers = drivers || {};
    if (drivers.mdot !== undefined) sys.mdot_loop = drivers.mdot;

    /* N from the state as it stands, BEFORE the step — the same quantity the caller is about to
     * be told about. Sub-second arithmetic only; no solve, no iteration. The head is re-imposed
     * first so lim0 sees the flow this step will actually run, not last step's derived head. */
    sys.junctionFlow[RING[0]] = sys.mdot_loop;
    var lim0 = courantLimit(sys);
    var nSub = 1;
    if (dt > lim0 && lim0 > 0 && isFinite(lim0)) {
      nSub = Math.ceil(dt / lim0);
      if (!(nSub >= 1)) nSub = 1;                 /* NaN-safe */
      if (nSub > NSUB_MAX) nSub = NSUB_MAX;
    }
    /* EXACTLY dt. The last sub-interval takes the remainder rather than dt/N, so N floating-point
     * divisions cannot leave the clock short — §24.2's contract is with the accumulator, and a
     * 1e-16 deficit per step is still a deficit nothing repays. */
    var hSub = dt / nSub, spent = 0;
    /* #585 — the time this step actually INTEGRATED, reported to the caller as `dt_accepted`.
     * A mid-step latch adopts the substeps before it and refuses the rest, so a ledger that
     * books all-or-nothing on the outer step is wrong by the accepted fraction (measured:
     * 0.966 kg — one of two substeps — on the 40 cm2 accumulator fixture's latching step).
     * The plant reports what it took; every boundary ledger books exactly that. */
    var accepted = 0;

    var r = null, flows = null, headFlowFirst = 0, carry = 0;
    for (var s = 0; s < nSub; s++) {
      var h = (s === nSub - 1) ? (dt - spent) : hSub;
      spent += h;

      /* Re-impose the driving flow at the head of the ring; the rest are last step's derived
       * values. The head is where the momentum state enters — everything downstream of it is
       * bookkeeping, not an independent degree of freedom. */
      sys.junctionFlow[RING[0]] = sys.mdot_loop;

      flows = [];
      for (var i = 0; i < RING.length; i++) {
        flows.push({ from: RING[i], to: RING[(i + 1) % RING.length],
                     mdot: sys.junctionFlow[RING[i]] });
      }
      if (s === 0) headFlowFirst = flows[0].mdot;

      r = CORE.step(sys, h, {
        flows: flows, heats: drivers.heats || {}, sources: drivers.sources || [],
        /* #574 — the wall's film coefficient scales with loop flow, and the FLOOR under it is
         * what keeps the metal coupled when the pumps stop. That is the regime the stored heat
         * matters in, so the fraction has to be the plant's real one, not a constant 1. */
        flowFrac: Math.abs(sys.mdot_loop) / MDOT_RATED
      });
      if (r.held !== true) accepted += h;   /* #585 — a refused substep integrated nothing */

      /* ---- DERIVE the next step's junction flows, sequentially round the ring.
       * mdot_out,i = mdot_in,i - dm_i/dt. Walking the ring from the head propagates the driving
       * flow through every node's own mass change, so each junction carries what actually
       * crossed it rather than what was assumed to. */
      var dmdt = {};
      r.junction.forEach(function (j) { dmdt[j.id] = j.dm_dt; });
      carry = sys.mdot_loop;
      for (var k = 0; k < RING.length; k++) {
        var id = RING[k];
        carry = carry - (dmdt[id] || 0);
        sys.junctionFlow[id] = carry;
      }

      /* A latched plant is HELD — CORE.step froze it and returned early-shaped output. Running
       * the remaining sub-steps would only re-freeze it N times and bill the clock N times for
       * the same dt. Credit the rest of the interval and stop. */
      if (sys.beyond_model) { sys.simTime += (dt - spent); break; }
    }

    /* The ring must close: after walking every node, the flow arriving back at the head must
     * equal what left it, to within the mass the ring gained or lost at its boundary. The gap
     * is REPORTED, because it is the honest measure of how well the sequential derivation
     * closed — not hidden inside a conserved total. */
    r.ringClosure = carry - sys.mdot_loop;
    /* REPORTED, every step, AGAINST THE OUTER dt. This is deliberately NOT "dt/nSub <= limit":
     * the caller asked for dt and is entitled to know that dt violates the limit, whatever this
     * layer did internally to stay stable. A courantOK that read true because the layer
     * sub-stepped would put the canary back to sleep, which is the defect #518 is about.
     *
     * ⚠ AND IT IS THE PRE-STEP LIMIT (#518), WHICH IT WAS NOT BEFORE. This used to re-evaluate
     * `courantLimit(sys)` on the state AFTER the step — a different plant from the one the step
     * was taken on, and by then the junction flows have been re-derived, so a step taken on a
     * violating state could report `courantOK: true` about a state that no longer existed. It
     * also made `subSteps` and `courantLimit_s` describe different plants: "I needed 6 sub-steps"
     * beside "you were comfortably inside the limit". Found by writing the canary's own check
     * (#518) — the hand-planted junction flow was wiped by the re-derivation before the report
     * read it. The binding condition is the state the step STARTED from, so that is what is
     * reported, and it is the same number `nSub` was chosen from. */
    /* #585 — the plant's own report of how much of `dt` it integrated: `dt` on a healthy step,
     * 0 on an already-held one, the adopted-substep sum on the step the latch fires mid-way.
     * The break/containment/ECCS ledgers book THIS, never the outer dt. */
    r.dt_accepted = accepted;
    r.courantLimit_s = lim0;
    r.courantOK = dt <= r.courantLimit_s;
    r.subSteps = nSub;                   /* #518 — 1 in every healthy regime; REPORTED */
    r.mdot_loop = sys.mdot_loop;
    r.headFlowUsed = headFlowFirst;      // what the head junction actually carried THIS step
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
