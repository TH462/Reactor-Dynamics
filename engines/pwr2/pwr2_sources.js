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
  /* [open] the induction motor's accelerating torque as a multiple of the rated hydraulic
   * torque (#507 wave 9) — the 1.5-2.5x class; no motor curve is in the corpus. With the
   * sourced inertia this gives a measured spin-up in the real RCP start class (seconds,
   * reported by the gate rather than asserted here). */
  var MOTOR_START_TORQUE = 1.5;
  /* [open] the induction motor's BREAKDOWN torque, same class family (#510 H-7) — the peak
   * of the torque curve near synchronous speed, 2.0-2.5x rated for the machine class; taken
   * at the bottom of the band. The start class alone stalled the rotor at 93 % in COLD
   * water: hydraulic torque runs as r^2 x densityRatio (1.306 at the Mode 4 point), so the
   * 1.5x flat curve found its equilibrium sub-rated and the "holds rated thereafter" the
   * comment declared was never reachable. The torque RISES toward breakdown as the rotor
   * approaches synchronous speed — the induction curve's own shape — so a cold start now
   * pulls in and the clamp holds rated, at bounded (not infinite) torque. */
  var MOTOR_BREAKDOWN_TORQUE = 2.0;

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

  /* THE DESIGN POINT, one copy (#509 item 3). tavg/P are the plant's design condition
   * (580 degF / 2235 psia); dt_c is the full-power loop split (606 - 550 degF = 56 degF),
   * [derived] — pwr2_engine's TREF/DT0_C/P0 consume THIS object, so the pair cannot drift
   * into two copies (the PROTECTION_DT trap class). */
  var DESIGN = { tavg_c: 304.5, dt_c: 31.1, P_mpa: 15.41 };

  /* Pump head, affinity-scaled from the rated point. H ~ w^2 at fixed flow coefficient. */
  /* THE RATED PUMP-SUCTION DENSITY, resolved once from the design condition rather than
   * typed. It is the denominator of the density ratio below, so it must be the density of
   * the fluid the pump actually works on at the design point — and `loopDensity` reads the
   * RCP NODE, which sits in the COLD leg. Pinning this at the loop-AVERAGE design state
   * (304.5 degC) put a standing ~1.05 factor into the equilibrium (rho(Tcold)/rho(Tavg)),
   * so rated speed at the design point delivered 105 % of mdot_rated BY CONSTRUCTION and
   * the board read RCP FLOW 105 on a healthy plant (#509 item 3, measured 1714.2 kg/s /
   * 105.16 %). The reference is the design COLD-LEG state, tavg - dt/2 = 288.95 degC
   * (552 degF): at the design point the ratio is ~1 and the equilibrium is mdot_rated.
   * Genuinely cold water still reads above 100 — denser suction moves more mass, honestly. */
  var _rhoRated = null;
  function rhoRated() {
    if (_rhoRated === null) {
      _rhoRated = RHO(W.h_l(DESIGN.tavg_c - DESIGN.dt_c / 2, DESIGN.P_mpa), DESIGN.P_mpa);
    }
    return _rhoRated;
  }

  /* densityRatio(sys) — the fluid the PUMP is actually working on, against the design fluid.
   *
   * ⚠ THIS TERM WAS MISSING AND THE PUMP KEPT RATED FLOW THROUGH STEAM. `pumpHead` returned
   * `dP_rated * r*r` — a pressure rise that depends only on shaft speed. A centrifugal pump does
   * not develop pressure, it develops HEAD: dP = rho*g*H, so the pressure rise scales with the
   * density of what is in the impeller. Friction runs the other way — for a given MASS flow,
   * dP_f goes as 1/rho, because the same kg/s of a lighter fluid moves far faster.
   *
   * MEASURED before this term existed, 0.0005 m2 (5 cm2) break at full power, no ECCS:
   * `mdot_loop` sat at **1630 kg/s for the whole 840 s blowdown** — unchanged to four figures
   * with the core at quality 1.0, superheated to 470 degC (878 degF), and 2.4 % of the plant's
   * inventory left. The plant was circulating rated mass flow of STEAM. Consequences: forced
   * convection never ends, so clad heat-up is 1 degC and core damage is unreachable; and natural
   * circulation, a Tier A behaviour, can never be observed because forced flow never stops.
   *
   * Same class as the two defects fixed alongside it (D4 §35): a term that silently assumes
   * single-phase liquid and has no way to notice the fluid changed.
   *
   * NO NEW CONSTANT, AND EXACTLY NEUTRAL AT RATED. Both factors are 1 when the loop is at its
   * design density, so `dP_rated`, `Kf` and their balance are untouched by construction — the
   * same "pin at rated" discipline the owner ruled for the film coefficient (2026-08-17). The
   * equilibrium that falls out is the textbook pump-affinity result: setting dPp = dPf gives
   * **mdot proportional to rho**, i.e. a centrifugal pump at fixed speed moves a roughly constant
   * VOLUME. At 0.2 kg/m3 that is 1630 * 0.2/716 = 0.46 kg/s rather than 1630.
   *
   * THE RCP NODE'S OWN DENSITY, not a loop average: the impeller works on its suction, and a loop
   * whose core has voided while the cold leg is still solid should keep pumping — which it does,
   * correctly, under this form. */
  function loopDensity(sys) {
    for (var i = 0; i < sys.nodes.length; i++) {
      if (sys.nodes[i].id === 'rcp') return RHO(sys.nodes[i].h, sys.P);
    }
    return rhoRated();                       /* no rcp node: a Layer 2 fixture, stay neutral */
  }
  function densityRatio(sys) {
    var d = loopDensity(sys) / rhoRated();
    return d > 0 ? d : 1e-9;                 /* never zero: it divides the friction term */
  }

  function pumpHead(sys) {
    if (sys.omega <= 0) return 0;
    var r = sys.omega / PUMP.w_rated;
    return PUMP.dP_rated * r * r * densityRatio(sys);
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

    /* BEYOND-MODEL HOLD (#487): the fluid state is frozen by pwr2_core's latch, so the rotor
     * and the momentum integration must freeze with it — a momentum state evolving against a
     * held density field would be motion the plant is not having. Time still flows; the held
     * step() reports itself. */
    if (sys.beyond_model) {
      var rHeld = LOOP.stepLoop(sys, dt, { heats: {}, sources: [], mdot: sys.mdot_loop });
      rHeld.omega = sys.omega;
      rHeld.rpm = sys.omega * 60 / (2 * Math.PI);
      rHeld.pumpHead = 0;
      rHeld.frictionDrop = 0;
      rHeld.buoyancy = 0;
      rHeld.pumpWork_kW = 0;
      return rHeld;
    }

    /* ---- rotor: coastdown derived from inertia, not fitted ---- */
    if (sys.pumpTripped && sys.omega > 0) {
      var hyd = pumpHead(sys) * 1e6 * (sys.mdot_loop / 700) / Math.max(sys.omega, 1e-6);  // N*m
      sys.omega = Math.max(0, sys.omega - dt * hyd / PUMP.inertia);
    }
    /* ---- rotor: START (#507 wave 9) — the motor accelerates the SAME rotor the coastdown
     * decelerates, against the same hydraulic load, with the same sourced inertia. The
     * accelerating torque is MOTOR_START_TORQUE x the rated hydraulic torque — [open] 1.5,
     * the induction-motor accelerating-torque class — RISING to the breakdown class near
     * synchronous speed (#510 H-7: the flat 1.5x curve stalled a COLD start at 93 %, where
     * r^2 x densityRatio met it; the rise is the induction curve's own shape and is what
     * makes "the motor HOLDS rated thereafter" true — the clamp then holds it at bounded
     * torque). No sourced motor curve exists in the corpus; both multiples are [open].
     * WHO may start it, and on which bus, is the caller's law (HR5) — this layer only spins
     * what it is told is untripped. Start permissives a real plant carries (seal injection,
     * oil lift, anti-reverse-rotation) are declared unmodeled. */
    else if (!sys.pumpTripped && sys.omega < PUMP.w_rated) {
      var Trated = PUMP.dP_rated * 1e6 * (PUMP.mdot_rated / 700) / PUMP.w_rated;      // N*m
      var ThydS = sys.omega > 1e-6
                  ? pumpHead(sys) * 1e6 * (sys.mdot_loop / 700) / sys.omega : 0;
      var rSpd = sys.omega / PUMP.w_rated;
      var Tmot = MOTOR_START_TORQUE + (rSpd > 0.9
                   ? (rSpd - 0.9) / 0.1 * (MOTOR_BREAKDOWN_TORQUE - MOTOR_START_TORQUE) : 0);
      sys.omega = Math.min(PUMP.w_rated,
                           sys.omega + dt * (Tmot * Trated - ThydS) / PUMP.inertia);
    }

    /* ---- loop momentum ---- */
    var dPp = pumpHead(sys);
    /* FRICTION IS THE OTHER HALF OF THE DENSITY COUPLING — see `densityRatio`. For a given MASS
     * flow, dP_f goes as 1/rho: the same kg/s of steam moves ~3500x faster than water and pays
     * for it quadratically. Dividing here rather than re-deriving Kf keeps Kf exactly the rated
     * calibration it has always been. */
    var dPf = sys.Kf * sys.mdot_loop * Math.abs(sys.mdot_loop) / densityRatio(sys);
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
    /* SIGNED, not Math.abs (#510 batch 1, measured). sgDuty is positive-removes by contract,
     * and a NEGATIVE duty is real physics — a secondary hotter than the primary transfers
     * heat INTO the loop (Mode 4's whole regime, and any cold-primary state). The old
     * Math.abs turned reverse transfer into primary REMOVAL, so both vessels cooled and
     * 2|Q| was destroyed: the untouched shutdown preset lost ~113 kW to it, most of the
     * −6.7 degF/hr Tavg drift that H-2's inventory fix alone could not close. */
    if (drivers.sgDuty) heats.sg_primary = (heats.sg_primary || 0) - drivers.sgDuty;
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

  /* mergeSources(a, b, c, ...) -> one `sources` array, concatenated.
   *
   * `pwr2_core.js`'s `step()` sums `mdot` per node with a plain `forEach`, so two entries at the
   * same node already accumulate correctly — CVCS proves it today, returning charging and letdown
   * as two separate `cold_leg` entries. What does NOT exist anywhere is the concatenation itself:
   * a caller combining break + ECCS + CVCS has to write `[a].concat(b, c)` by hand, and every
   * call site that needs it would otherwise re-invent it. One function, so it is written once. */
  function mergeSources() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i]) out = out.concat(arguments[i]);
    }
    return out;
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.sources = {
    PUMP: PUMP, REF: REF, DESIGN: DESIGN,
    createPlant: createPlant, stepPlant: stepPlant,
    loopInertia: loopInertia, pumpHead: pumpHead, buoyancy: buoyancy,
    densityRatio: densityRatio, rhoRated: rhoRated,
    mergeSources: mergeSources
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
