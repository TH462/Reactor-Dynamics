/* pwr2_sources.js — Layer 4: located sources/sinks and the integrated loop momentum. (#479)
 *
 * Reads Layers 0-3. Blueprint/PWR2_DESIGN.md §7: "core power, SG duty, pump work as a LOCATED
 * source". Layer 3 took the loop flow as GIVEN; this layer integrates it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY MOMENTUM IS INTEGRATED AT ALL — the ruling, and its honest price.
 *
 * NOT ONE educational simulator in the sourced survey solves transient loop momentum; IAEA
 * TCS-22 explicitly decouples it and everyone else uses W = K*sqrt(dP). D2 §23.3 keeps it as a
 * DECLARED departure, and the recorded reason is a means-of-derivation argument, not a
 * curriculum one: it makes **RCP coastdown derived from sourced pump inertia** rather than a
 * fitted exponential, and natural circulation emergent rather than a fitted scale. D1 §22.1
 * records the cost plainly — "none of the nine Tier A couplings strictly requires it".
 *
 * THE PAYOFF IS TESTABLE AND THIS LAYER'S GATE TESTS IT. A rotating pump coasting against
 * hydraulic torque does NOT decay exponentially:
 *
 *     I*dw/dt = -T_hyd,  and for a centrifugal pump T ~ w^2
 *     =>  w(t) = w0 / (1 + w0*t/tau)      HYPERBOLIC, not exponential
 *
 * The two shapes differ most in the tail, which is exactly when a reactor cares — flow at 4-5
 * time constants decides whether the core sees departure from nucleate boiling. A fitted
 * exponential cannot be made to match both the half-time and the tail; this one does not have
 * to be fitted at all.
 *
 * ---------------------------------------------------------------------------------------
 * THE MOMENTUM EQUATION, and what is and is not in it:
 *
 *     (SUM L_i/A_i) * dmdot/dt = dP_pump - dP_friction + dP_buoyancy
 *
 * ⚠ SUM(L/A) IS 94.7 % SOURCED AND THE REST IS DECLARED. Five ring nodes have sourced or
 * rule-derived flow lengths (hot leg, crossover, cold leg, core, SG tubes) giving 232.9 1/m.
 * Four do not — downcomer, both plena, the pump casing — and Layer 1 measures their omission
 * at ~5.3 %. They are LEFT OUT rather than invented, because a fabricated length is
 * indistinguishable from a sourced one six months later. Geometry evidence list, D3 §7.
 *
 * ⚠ FRICTION USES THE ONE [recalled] FAMILY IN THIS ENGINE — the form-loss coefficients, ruled
 * to stand unsourced (OWNER RULING 2026-08-14) after a dedicated evidence pass found nothing.
 * A 30 % error in them moves the derived pump head ~18 %. They are load-bearing HERE in a way
 * they were not in Layer 1, because friction sets the steady-state flow: the flow this layer
 * settles at is only as good as those numbers. Stated, not buried.
 *
 * UNITS ARE SI. P MPa · h kJ/kg · mdot kg/s · w rad/s · I kg*m2 · Q kW
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  var LOOP = RD && RD.loop, GEO = RD && RD.geometry, W = RD && RD.water;
  /* Same resolution as Layer 2, and it mattered more than it looks: buoyancy() called the DIRECT
   * path twice per step, measured at 63,000 ns against a 9,000 ns Layer 3 step. Layer 4 was SEVEN
   * TIMES the layer beneath it because two calls in one helper were missed when the table landed.
   * A hot path is only as fast as the slowest call still in it. */
  var VT = RD && RD.vtable;
  var RHO = VT ? VT.rho_from_h : (W && W.rho_from_h);

  /* ---- SOURCED PUMP DATA, D3 §1a-v (matched 4-loop Westinghouse RCP) ----
   * 100,400 gpm · 289 ft developed head · 1185 rpm · 7000 hp · casing water 80 ft3.
   * Inertia for the fleet 45,000-123,000 lbm*ft2, with GINNA at 80,000 lbm*ft2 — which is the
   * number that makes coastdown derivable instead of fitted (D2 §0.2). */
  var REF = {
    inertia_kgm2: 80000 * 0.0421401,      // [sourced] Ginna 80,000 lbm*ft2 = 3371 kg*m2
    rpm: 1185,                            // [sourced]
    scale: 300 / 852.75                   // [derived] SLS-100 / reference thermal power
  };
  /* Pump rotational inertia scales with the machine, not with power directly; the same power
   * ratio Layer 1 uses for the casing water is applied, and it is DECLARED as scaling rather
   * than sourcing — the reference pump is a 4-loop machine and SLS-100's is not built. */
  var PUMP = {
    inertia: REF.inertia_kgm2 * REF.scale,        // kg*m2, [derived] by power scaling
    w_rated: REF.rpm * 2 * Math.PI / 60,          // rad/s, [sourced] 1185 rpm
    mdot_rated: 1630,                             // kg/s, [derived] from the energy balance
    dP_rated: 0.58                                // MPa, [derived] loop dP at rated (D3 §1a-ii: 275 ft)
  };

  /* Loop inertia SUM(L/A), from Layer 1's sourced flow lengths only. */
  function loopInertia() {
    var sum = 0;
    Object.keys(GEO.LOOP).forEach(function (id) {
      var L = GEO.LOOP[id].L, V = null;
      GEO.NODES.forEach(function (n) { if (n.id === id) V = n.V; });
      if (V) sum += L / (V / L);        // L / A, with A = V/L
    });
    return sum;
  }

  function createPlant(opts) {
    opts = opts || {};
    var sys = LOOP.createLoop(opts);
    sys.LA = loopInertia();                                   // 1/m
    sys.omega = opts.omega === undefined ? PUMP.w_rated : opts.omega;
    sys.pumpTripped = !!opts.pumpTripped;
    sys.mdot_loop = opts.mdot === undefined ? PUMP.mdot_rated : opts.mdot;
    /* Friction coefficient CALIBRATED ONCE at the rated point so that the sourced pump head and
     * the derived rated flow are consistent: dP_fric(mdot_rated) == dP_rated. This is not a
     * fitted constant in the [tune] sense — it is the algebraic consequence of two numbers that
     * are themselves derived, and it moves whenever either of them does. */
    sys.Kf = PUMP.dP_rated / (PUMP.mdot_rated * PUMP.mdot_rated);
    return sys;
  }

  /* Pump head, affinity-scaled from the rated point. H ~ w^2 at fixed flow coefficient. */
  function pumpHead(sys) {
    if (sys.omega <= 0) return 0;
    var r = sys.omega / PUMP.w_rated;
    return PUMP.dP_rated * r * r;
  }

  /* Buoyancy: thermal centres set the natural-circulation driving head. Computed from Layer 1's
   * elevations and the CURRENT densities, so natural circulation is EMERGENT rather than a
   * fitted scale factor — which is the other half of what the momentum ruling bought. */
  /* Elevations resolved once — the inner scan made this O(N^2) for two lookups. */
  var Z = null;
  function elevations() {
    if (Z) return Z;
    Z = {}; GEO.NODES.forEach(function (x) { Z[x.id] = x.z; }); return Z;
  }
  function buoyancy(sys) {
    var g = 9.80665, dP = 0, z = elevations();
    var zc = null, zh = null, rc = null, rh = null;
    for (var i = 0; i < sys.nodes.length; i++) {
      var n = sys.nodes[i];
      if (n.id === 'core') { zc = z.core; rc = RHO(n.h, sys.P); }
      else if (n.id === 'sg_primary') { zh = z.sg_primary; rh = RHO(n.h, sys.P); }
    }
    if (zc === null || zh === null) return 0;
    /* SIGN: the DESCENDING leg is the dense one. Fluid heated in the core rises to the SG,
     * is cooled, and falls back — so the driving head is (rho_cold - rho_hot)*g*dz with the
     * SG (the sink, and the high point) supplying the cold column. Written the other way round
     * first, and natural circulation settled at exactly 0.0 kg/s in every case: the buoyancy
     * term was fighting the flow instead of driving it. A sign error here does not blow up,
     * it quietly produces a plant with no natural circulation at all. */
    dP = (rh - rc) * g * (zh - zc);                 // Pa
    return dP / 1e6;                                // MPa
  }

  /* stepPlant(sys, dt, drivers)
   *   drivers.corePower kW into the core node
   *   drivers.sgDuty    kW removed at the SG primary (positive = removed)
   *   drivers.pumpTrip  true to trip the pump this step
   *
   * PUMP WORK IS A LOCATED SOURCE. It is deposited at the RCP node, not smeared as a fraction
   * of core heat — D3 §2 calls that out specifically, and it matters because the pump is the
   * only heat source in the loop when the reactor is shut down. */
  function stepPlant(sys, dt, drivers) {
    drivers = drivers || {};
    if (drivers.pumpTrip) sys.pumpTripped = true;

    /* ---- rotor: coastdown derived from inertia, not fitted ---- */
    if (sys.pumpTripped && sys.omega > 0) {
      var hyd = pumpHead(sys) * 1e6 * (sys.mdot_loop / 700) / Math.max(sys.omega, 1e-6);  // N*m
      sys.omega = Math.max(0, sys.omega - dt * hyd / PUMP.inertia);
    }

    /* ---- loop momentum ---- */
    var dPp = pumpHead(sys);
    var dPf = sys.Kf * sys.mdot_loop * Math.abs(sys.mdot_loop) / (PUMP.mdot_rated ? 1 : 1);
    var dPb = buoyancy(sys);
    var net = dPp - dPf + dPb;                                     // MPa
    /* (L/A) dmdot/dt = dP  ->  dmdot = dt * dP * 1e6 / (L/A) */
    sys.mdot_loop = sys.mdot_loop + dt * net * 1e6 / sys.LA;
    if (sys.mdot_loop < 0) sys.mdot_loop = 0;                      // no reverse flow at this layer

    /* ---- pump work as a LOCATED heat source at the RCP node ---- */
    var pumpKW = dPp * 1e6 * (sys.mdot_loop / 700) / 1000;         // kW, hydraulic
    /* CALLER HEATS ARE MERGED, and they were silently DISCARDED until 2026-08-15.
     * Layer 3 documents `drivers.heats` as its interface. Layer 4 built its own map from
     * corePower/sgDuty and never forwarded the caller's -- so a system supplying a distributed
     * duty (RHR spreads its removal across the loop) had it thrown away, and the plant WARMED
     * while the readout said 13,600 kW was being removed.
     *
     * FOURTH caller-option-silently-dropped defect in this engine, after `createLoop(opts)`,
     * `extraMass`, and Layer 5's construction knobs -- and the third found by BUILDING a system
     * that needed the option rather than by auditing the layer that drops it (D1 §32.4).
     * Merged rather than replaced, so corePower/sgDuty and a heats map can coexist: a plant on
     * RHR still has pump heat and may still have a steam generator. */
    var heats = {};
    if (drivers.heats) {
      Object.keys(drivers.heats).forEach(function (id) { heats[id] = drivers.heats[id]; });
    }
    if (drivers.corePower) heats.core = (heats.core || 0) + drivers.corePower;
    if (drivers.sgDuty) heats.sg_primary = (heats.sg_primary || 0) - Math.abs(drivers.sgDuty);
    heats.rcp = (heats.rcp || 0) + pumpKW;

    var r = LOOP.stepLoop(sys, dt, { heats: heats, sources: drivers.sources, mdot: sys.mdot_loop });
    r.omega = sys.omega;
    r.rpm = sys.omega * 60 / (2 * Math.PI);
    r.pumpHead = dPp;
    r.frictionDrop = dPf;
    r.buoyancy = dPb;
    r.pumpWork_kW = pumpKW;
    return r;
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.sources = {
    PUMP: PUMP, REF: REF,
    createPlant: createPlant, stepPlant: stepPlant,
    loopInertia: loopInertia, pumpHead: pumpHead, buoyancy: buoyancy
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
