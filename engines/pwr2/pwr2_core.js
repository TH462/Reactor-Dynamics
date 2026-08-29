/* pwr2_core.js — Layer 2: node/junction conservation primitives for the PWR2 engine. (#479)
 *
 * GENERIC. This layer knows nothing about SLS-100 — no topology, no components, no plant.
 * It takes a set of rigid nodes and the fluxes between them and advances them one timestep,
 * conserving what must be conserved. The SLS-100 wiring is Layer 3.
 *
 * Reads Layer 0 (water properties) and nothing else. Blueprint/PWR2_DESIGN.md §7.
 *
 * ---------------------------------------------------------------------------------------
 * THE STEP, exactly as ruled (D2 §23.2):
 *
 *   1 GATHER     evaluate every flux from the state at time n. Write nothing.
 *   2 SOLVE P    F(P) = SUM V_i*rho(a_i + v_i*(P-P_n), P) + m_extra(P) - M_total = 0
 *                  a_i = h_i^n + dt*[mdot_in*(h_don - h_i^n) + Q_i] / m_i^n
 *                  v_i = V_i / m_i^n          <- THE SPECIFIC VOLUME. Exact, not a partial.
 *                BRACKETED root-find, warm-started at P_n, CAPPED (default 8 iterations)
 *   3 INTEGRATE  advance h_i, M_total to n+1
 *   4 JUNCTIONS  mdot_out,i = mdot_in,i - (V_i*rho_i^{n+1} - m_i^n)/dt   <- exact difference
 *
 * WHY `m` IS NOT A NODE STATE. A rigid node has one thermal degree of freedom. The reduction
 * comes from the ONE-PRESSURE ruling, which imposes N-1 constraints — not from rigid volumes;
 * §0's original argument for this was circular and §18.4 corrects it. Node mass is DERIVED,
 * `rho(h_i,P)*V_i`, every time it is wanted. That is what makes the closure residual a real
 * assertion instead of a tautology (D5 Layer 1).
 *
 * `d(rho)/dh` AND `d(rho)/dP` ARE NEVER COMPUTED. The saturation kink is real physics,
 * entailed by Clausius-Clapeyron and confirmed against steam tables; the defect was never the
 * kink, it was taking its derivative. A bracketed solve on a monotone F does not need one.
 *
 * WHY BRACKETED AND WHY CAPPED. Moving P at fixed a_i moves h along dh = v*dP, which IS the
 * isentrope, so dF/dP > 0 by thermodynamic stability: F is continuous and strictly monotone,
 * so a bracket always exists and the solve converges however violent the derivative jump is.
 * The CAP is what makes it real-time-safe — a bracketed solve on a monotone function is the
 * one iterative scheme whose worst case is bounded, because when the cap binds the BRACKET
 * WIDTH bounds the error. This is nearly-implicit in character, the row every real-time code
 * occupies. "Non-iterative" is dead.
 *
 * ⚠ THE CAP IS BELOW ITS OWN MOTIVATING MEASUREMENT, AND THAT IS UNRESOLVED (D2 §23.2).
 * §17.5 measured this solve in the adversarial water-solid case at 0/504 failures but a MEAN
 * of 10.4 iterations, against a ruled cap of ~8. Not a correctness failure — the bracket
 * bounds the error — but it means the cap binds more often than not in the regime that
 * justified bracketing. This module therefore REPORTS `capBound` and `bracketWidth` on every
 * step so the residual at cap 8 can be measured rather than argued. Do not raise the cap on
 * feel; the design owes two numbers first.
 *
 * ---------------------------------------------------------------------------------------
 * CONSERVATION — AND THE ONE THAT IS EASY TO GET WRONG.
 *
 * Mass is conserved BY CONSTRUCTION: `M_total` is a single integrated scalar moved only by
 * sources and sinks, and the pressure solve forces the node masses to sum to it. So a mass
 * check on a closed system is a SMOKE TEST, not evidence (D5 §6.2 says so).
 *
 * ENERGY IS THE REAL CHECK, and it must be INTERNAL energy, not enthalpy:
 *
 *     U = SUM m_i*h_i - P*V_total
 *
 * On a rigid closed system U is conserved and H IS NOT — compressing the fluid raises every
 * h_i by v_i*dP, adding exactly V_total*dP of enthalpy, which is flow work and not a gain.
 * A conservation gate written on SUM(m*h) would fail a correct solver and pass a wrong one.
 *
 * UNITS ARE SI. P MPa · h kJ/kg · rho kg/m3 · V m3 · m kg · Q kW · mdot kg/s · t s
 */
(function (root) {
  'use strict';

  var W = root.RD && root.RD.pwr2 && root.RD.pwr2.water;

  /* THE HOT PATH GOES THROUGH THE TABLE WHEN IT IS LOADED. D1 §26 measured this call at
   * 31,500 ns and the whole stack missing its performance stop condition because of it.
   * Resolved ONCE at load, not per call — a branch inside the one function this exercise was
   * about would be self-defeating. The fallback is not a convenience: it lets Layer 2 be run
   * against the DIRECT correlations when something disagrees, so "table or physics?" stays
   * answerable. */
  var VT = root.RD && root.RD.pwr2 && root.RD.pwr2.vtable;
  var RHO = VT ? VT.rho_from_h : W.rho_from_h;
  var TFH = VT ? VT.T_from_h : W.T_from_h;      /* #574 — the wall talks to a TEMPERATURE */

  /* ================================================================ METAL WALLS (#574)
   * *(OWNER, 2026-08-12: "each node should carry the heat capacity of its own metal wall, not
   * just the fluid it contains"; OWNER RULING, 2026-08-28: "All eleven nodes".)*
   *
   * Layer 1 owns the masses and areas, Layer 3 wires them onto the nodes, and THIS layer
   * integrates them — the same division the rest of the stack uses. A node with no `wall` is
   * untouched, so Layer 2's own fixtures stay rigid-and-dry exactly as they were.
   *
   * THE FILM COEFFICIENT is the one number here that is not geometry, and it follows the idiom
   * `pwr2_fuel.filmCoefficient` already established rather than inventing a second one: a RATED
   * value scaled by flowFrac^0.8 (Dittus-Boelter's Reynolds exponent, whose FORM is sourced —
   * Ginna UFSAR ch15 names the correlation) with a natural-convection FLOOR so it cannot go to
   * zero when the pumps stop. That floor is load-bearing: a stopped loop is exactly when stored
   * wall heat matters, and a wall that decouples then would be worse than no wall at all.
   *
   * ⚠ AND ITS UNCERTAINTY IS MOSTLY NOT LOAD-BEARING, which is why one open number is tolerable
   * here. Measured on the shipped geometry: for the vessel shell the CONDUCTION resistance of
   * the first lump is ~7x the film resistance, so a 30 % error in `h_rated` moves that wall's
   * time constant ~4 %. It matters for the steam-generator tubes, where the two are comparable —
   * and there the SOURCED overall-U band (3,500-6,000 W/m2K, "set by tube wall + both films",
   * D3 §1a-v) is the cross-check that the level is in the right decade. */
  var WALL_FILM = {
    h_rated_W_m2K:    15000,   /* [open] wall-side forced-convection film at rated flow */
    h_stagnant_W_m2K: 500,     /* [open] natural convection to water — the LIQUID floor */
    dittus_exp:       0.8,     /* [sourced-form] Dittus-Boelter's Reynolds exponent */
    /* ⚠ THE PHASE TERM, AND LEAVING IT OUT WAS A MEASURED DEFECT IN THIS FEATURE'S FIRST CUT.
     * `pwr2_fuel.filmCoefficient` takes BOTH halves — flow AND phase — and this took only the
     * flow half while its own comment claimed to be following that idiom. The consequence is
     * not small: on a 20 cm2 break the core goes 100 % void by 300 s and the steam superheats
     * past the metal, so the walls become a heat sink for it — legitimately, but through a
     * LIQUID film. MEASURED: the metal absorbed **1,100 MJ** by 600 s and held peak clad
     * temperature at 1,698 degF against 1,910 dry, i.e. this feature was quietly rewriting
     * every core-damage sequence through a coefficient that does not exist in steam.
     * 0.5 is `pwr2_fuel.OPEN.vapor_ratio`, [derived] from the Dittus-Boelter property group on
     * in-corpus properties (WCAP-16009-NP-A Table 10-3) — the same number, not a second one. */
    vapor_ratio:      0.5,
    /* ⚠ AND THE FLOOR NEEDS ITS OWN PHASE FACTOR, NOT THAT ONE — the second defect found in this
     * feature, by the same red. `vapor_ratio` is a FORCED-convection ratio: the Dittus-Boelter
     * group at the SAME MASS FLUX. The floor is a FREE-convection coefficient, and free
     * convection scales with the fluid's own conductivity (h ~ k·(Gr·Pr)^n / L), where steam's k
     * is about a tenth of water's at these conditions. Applying 0.5 to it left a stagnant, dry,
     * superheated core coupled to 88 tonnes of metal at 250 W/m2K.
     * MEASURED with that error standing: an unmitigated 20 cm2 break with no emergency cooling
     * NEVER REACHED the 10 CFR 50.46 clad limit — 4,000 s, peak 2,172 degF, plateaued. A real
     * one melts. That is the shape of a model being quietly rewritten by a coefficient, and it
     * is why the core-damage gate going red was worth adjudicating rather than re-baselining. */
    vapor_ratio_free: 0.10
  };
  function wallFilm(flowFrac, voidFrac) {
    var f = flowFrac > 0 ? flowFrac : 0;
    var v = voidFrac > 0 ? (voidFrac > 1 ? 1 : voidFrac) : 0;
    var forced = WALL_FILM.h_rated_W_m2K * Math.pow(f, WALL_FILM.dittus_exp) *
                 ((1 - v) + v * WALL_FILM.vapor_ratio);
    var floor  = WALL_FILM.h_stagnant_W_m2K * ((1 - v) + v * WALL_FILM.vapor_ratio_free);
    return forced > floor ? forced : floor;
  }

  /* buildWall(spec, T0) — the lump chain, precomputed once at construction.
   *   spec: { M_kg, cp, k, A_m2, t_m, lumps }   (Layer 3 assembles this from Layer 1)
   * EQUAL-MASS LUMPS in series, innermost first. Lump 0 sees the fluid; the outermost is
   * ADIABATIC — no heat leaves the plant through the vessel wall, which is a declared
   * simplification (real insulation is very good but not perfect) and the conservative one for
   * a cooldown, since it keeps the stored heat inside where the operator has to remove it. */
  function buildWall(spec, T0) {
    var n = spec.lumps > 0 ? spec.lumps : 1;
    var C = spec.M_kg * spec.cp / n;                       /* kJ/K per lump */
    /* conduction between lump centres: k*A / (t/n), W/K -> kW/K */
    var Gc = n > 1 ? spec.k * spec.A_m2 / (spec.t_m / n) / 1000 : 0;
    /* film path: fluid -> lump 0 CENTRE, so it carries half a lump of metal conduction in
     * series with the film. Omitting that half-lump is what makes a thick wall respond like a
     * thin one, and the vessel is where this model's biggest capacity sits. */
    var R_half = n > 0 ? (spec.t_m / n / 2) / (spec.k * spec.A_m2) : 0;   /* K/W */
    var T = [];
    for (var i = 0; i < n; i++) T.push(T0);
    return { n: n, C: C, Gc: Gc, A_m2: spec.A_m2, R_half_KW: R_half * 1000,   /* K/kW */
             M_kg: spec.M_kg, cp: spec.cp, k: spec.k, t_m: spec.t_m, T: T };
  }

  /* stepWall(w, T_fluid, flowFrac, dt) -> kW INTO THE FLUID. Explicit, once per plant step.
   *
   * ⚠ ONCE PER STEP, OUTSIDE THE PRESSURE SOLVE. `F(P)` is called ~10 times per step on the hot
   * path D1 §26 already carries a performance stop condition against, and the wall does not
   * depend on the candidate pressure — putting it inside would be paid ten times for nothing. */
  function stepWall(w, T_fluid, flowFrac, voidFrac, dt) {
    var i, hA = wallFilm(flowFrac, voidFrac) * w.A_m2 / 1000;   /* kW/K */
    /* film and half a lump of metal in series */
    var G0 = 1 / (1 / hA + w.R_half_KW);                   /* kW/K, fluid <-> lump 0 */
    var Q = G0 * (w.T[0] - T_fluid);                       /* kW, positive = metal heats fluid */
    var dT = new Array(w.n);
    for (i = 0; i < w.n; i++) {
      var net = 0;
      if (i === 0) net -= Q;
      if (i > 0) net += w.Gc * (w.T[i - 1] - w.T[i]);
      if (i < w.n - 1) net += w.Gc * (w.T[i + 1] - w.T[i]);
      dT[i] = net * dt / w.C;
    }
    for (i = 0; i < w.n; i++) w.T[i] += dT[i];
    return Q;
  }

  /* createSystem(spec) — spec.nodes: [{id, V, h}]  (V m3, h kJ/kg initial)
   *                      spec.P: initial pressure MPa
   *                      spec.extraMass: optional f(P) -> kg, a compressible volume outside
   *                        the rigid nodes. Layer 5 plugs the pressurizer in here; at Layer 2
   *                        it is absent and the system is rigid.
   *                      spec.iterCap: default 8 (the ruled value) */
  function createSystem(spec) {
    var nodes = spec.nodes.map(function (n) {
      var node = { id: n.id, V: n.V, h: n.h };
      /* #574 — THE WALL IS CONSTRUCTED AT ITS FLUID'S TEMPERATURE (#502's settled construction).
       * A wall seeded anywhere else makes every initial condition ring for minutes, which is the
       * defect wearing a transient's face. Absent `wall`, the node is rigid and dry as before. */
      if (n.wall) node.wall = buildWall(n.wall, TFH(n.h, spec.P));
      return node;
    });
    var V_total = nodes.reduce(function (a, n) { return a + n.V; }, 0);
    var sys = {
      nodes: nodes,
      V_total: V_total,
      P: spec.P,
      extraMass: spec.extraMass || null,
      iterCap: spec.iterCap === undefined ? 8 : spec.iterCap,
      simTime: 0,
      M_total: 0
    };
    sys.M_total = totalMass(sys, sys.P, nodes.map(function (n) { return n.h; }));
    return sys;
  }

  function totalMass(sys, P, hs) {
    var m = 0;
    for (var i = 0; i < sys.nodes.length; i++) m += sys.nodes[i].V * RHO(hs[i], P);
    if (sys.extraMass) m += sys.extraMass(P);
    return m;
  }

  /* Internal energy. THE conservation quantity for a rigid system — see the header. */
  function internalEnergy(sys) {
    var H = 0;
    for (var i = 0; i < sys.nodes.length; i++) {
      H += sys.nodes[i].V * RHO(sys.nodes[i].h, sys.P) * sys.nodes[i].h;
    }
    /* #574 — THE WALL'S STORED ENERGY IS PART OF THE SYSTEM'S. Without this line the layer's
     * own 3e-4 relative conservation budget silently absorbs every joule the metal takes up or
     * gives back, and a budget that absorbs the thing being added has stopped measuring. */
    for (i = 0; i < sys.nodes.length; i++) {
      var w = sys.nodes[i].wall;
      if (!w) continue;
      for (var j = 0; j < w.n; j++) H += w.C * w.T[j];
    }
    return H - sys.P * 1000 * sys.V_total;      // MPa*m3 -> kJ
  }

  /* step(sys, dt, drivers) — one timestep.
   *   drivers.flows: [{from, to, mdot}]  mdot kg/s, donor-cell upwinding
   *   drivers.heats: {nodeId: kW}
   *   drivers.sources: [{node, mdot, h}]  mass crossing the BOUNDARY (kg/s, kJ/kg)
   *
   * `step` ADVANCES THE PHYSICS BY EXACTLY dt (D2 §24.2). It never returns early, because
   * `simulation_service.js:370` credits `simTime += steps * PHYSICS_DT` unconditionally — an
   * early return makes the plant's clock run ahead of its physics silently, with nothing to
   * repay it. That is the exact inverse of the analysis-code pattern, where the right response
   * to trouble is to shorten and retry. Here the step is a contract with the clock and it
   * cannot be broken.
   *
   * ⚠ THE CONTRACT IS "EXACTLY dt", NOT "ONE INTERVAL" — this comment used to say `step` "never
   * sub-steps a partial interval", which is narrower than §24.2 actually rules and would read as
   * forbidding what Layer 3 now does. §24.2 verbatim: *"engine.step(dt) MUST advance the physics
   * by exactly dt, HOWEVER IT SUBDIVIDES INTERNALLY. A crossing sub-step must run to the boundary
   * and then continue to the end of the step. It may never return early."* Subdivision is
   * permitted; a short step is not. Since #518 `pwr2_loop.stepLoop` calls THIS function N times
   * with dt/N when the ring's Courant limit binds — each call still advancing exactly its own
   * interval, the sum still exactly dt. What stays forbidden here is rejecting a step and
   * retrying it shorter. */
  function step(sys, dt, drivers) {
    drivers = drivers || {};
    var flows = drivers.flows || [], heats = drivers.heats || {}, sources = drivers.sources || [];
    var N = sys.nodes.length, i;

    /* ---- BEYOND-MODEL HOLD (#487) ----------------------------------------------------------
     * Once the blowdown latch below has fired, the plant is HELD: state frozen, time flowing,
     * flag up. This is a SIMULATOR — it cannot reject the timestep and it must not integrate a
     * state the property library cannot represent. What the real plant is doing here is a slow
     * atmospheric boil-off of the last few percent of inventory on decay heat, and Layer 0 has
     * no physics below 0.1 MPa to compute it with; the honest continuation is a held state, not
     * a fabricated one. Measured before this hold existed: a 5 cm2 break ran clean for 840 s,
     * touched the floor with 2.4 % inventory, and went NaN in the reactor ONE step later. */
    if (sys.beyond_model) {
      sys.simTime += dt;
      return {
        P: sys.P, dP: 0, held: true, beyond_model: true,
        iterations: 0, capBound: false, bracketWidth: 0, unbracketed: false,
        envelopeExceeded: true, enthalpyClamped: 0, enthalpyDiscarded_kJ: 0, residual: 0,
        junction: sys.nodes.map(function (n) { return { id: n.id, dm_dt: 0 }; }),
        transfers: 0
      };
    }

    /* ---- 1. GATHER. Read the state at time n; write nothing. ---- */
    var m_n = new Array(N), a = new Array(N), v = new Array(N), dH = new Array(N);
    for (i = 0; i < N; i++) {
      m_n[i] = sys.nodes[i].V * RHO(sys.nodes[i].h, sys.P);
      dH[i] = heats[sys.nodes[i].id] || 0;                       // kW
    }
    var idx = {};
    for (i = 0; i < N; i++) idx[sys.nodes[i].id] = i;

    /* ---- 1a. THE METAL WALLS (#574), before anything else touches dH. ----
     * Evaluated at time-n temperatures and OUTSIDE the pressure solve — see stepWall's note.
     * `drivers.flowFrac` is Layer 3's loop flow over rated; absent, the wall assumes rated
     * (a Layer 2 fixture stepping a node by hand has no loop to be a fraction of). */
    var flowFrac = drivers.flowFrac === undefined ? 1 : drivers.flowFrac;
    var wallHeat = 0;
    for (i = 0; i < N; i++) {
      var wn = sys.nodes[i].wall;
      if (!wn) continue;
      /* THE NODE'S OWN VOID, not the loop's: a dry core and a full cold leg are the same
       * plant, and the wall of each talks to the fluid it is actually in contact with. */
      var Qw = stepWall(wn, TFH(sys.nodes[i].h, sys.P), flowFrac,
                        W.quality(sys.nodes[i].h, sys.P), dt);
      dH[i] += Qw;
      wallHeat += Qw;
    }

    /* ⚠ THE ENERGY BUDGET, MEASURED — AND THE DECLARED FIX DOES NOT WORK AS DECLARED.
     *
     * A closed ring conserves INTERNAL energy only to ~3e-4 relative, and the cause is exactly
     * quantified: over 400 steps a 5-node ring drifted 2712.9 kJ against SUM(h_i*dm_i) of
     * 2721.5 — the redistribution term explains 99.7 % of it.
     *
     * WHY. The h-form energy equation is EXACT provided each node's dm/dt equals its net
     * specified flow. It does not: flows are specified, densities then do what they do, and the
     * difference is real mass crossing a junction carrying real enthalpy that nothing accounts
     * for. D2 §18 declares the fix — "one new explicit lag on junction expansion flows" — and
     * prices it as a cost of scheme B.
     *
     * ⛔ IT WAS BUILT AND IT DIVERGES. Routing the previous step's expansion along the flow
     * graph, donor-cell, was tried in BOTH sign conventions: crediting the donor gave -2.97e+12
     * relative energy drift, crediting the receiver -4.42e+2. The correction feeds its own
     * expansion at the next step and the loop runs away. **An explicit lag on this term is not
     * merely lossy, it is unstable**, so the declared mechanism needs more than one lag — it
     * probably needs the junction flows SOLVED to balance node mass rather than specified, which
     * is D2 §23.2 step 4 used as a flow rather than as a diagnostic. That is a Layer 3 decision
     * and it is recorded, not guessed at here.
     *
     * SO CONSERVATION IS CARRIED AS A BUDGET, WHICH IS WHAT D5 §6.2 RULED IT SHOULD BE:
     * "Layer 1 becomes a conservation BUDGET with a stated number... The number is owed; it does
     * not yet exist." **This is that number, measured for the first time: 3e-4 relative internal
     * energy on a mixing ring at dt = 0.02.** It is asserted as a budget by this layer's gate,
     * not waved through, and it is a ceiling to be driven DOWN by Layer 3's flow solve — not a
     * tolerance to be widened when something else fails. */
    /* Donor-cell: a flow carries the enthalpy of the node it LEAVES. Upwinding is what keeps
     * a transported front from being smeared, and it is why the sign of mdot matters. */
    flows.forEach(function (f) {
      var A = idx[f.from], B = idx[f.to], md = f.mdot;
      if (A === undefined || B === undefined || !md) return;
      var don = md > 0 ? A : B, rec = md > 0 ? B : A, q = Math.abs(md);
      dH[rec] += q * sys.nodes[don].h;
      dH[rec] -= q * sys.nodes[rec].h;
    });
    /* Route each node's expansion imbalance out along its own outgoing flows, donor-cell.
     * Split evenly when a node has several — with one loop this is the loop junction, and at
     * Layer 3 the topology makes the split explicit. */
    var dM = 0;
    sources.forEach(function (s) {
      var A = idx[s.node];
      if (A === undefined) return;
      dH[A] += s.mdot * (s.h - sys.nodes[A].h);
      dM += s.mdot;
    });
    for (i = 0; i < N; i++) {
      a[i] = sys.nodes[i].h + dt * dH[i] / m_n[i];
      /* SPECIFIC VOLUME, CARRIED IN kJ/kg PER MPa — not m3/kg. dh = v*dP is a unit trap:
       * m3/kg x MPa = 10^6 J/kg = 10^3 kJ/kg, so the factor of 1000 is REQUIRED. Without it
       * the compression term is 1000x too small, which does not look wrong — it looks like a
       * nearly-incompressible fluid. Caught by this layer's own energy gate: heating a closed
       * system raised U by 7983 kJ against an expected 12000, and the 4011 kJ gap was exactly
       * V*dP, the flow work the term should have carried. */
      v[i] = 1000 * sys.nodes[i].V / m_n[i];
    }

    /* ---- 1b. THE ENTHALPY ENVELOPE. See the long note at step 3. ----
     *
     * ⚠ THE BOUND HAS TO BE INSIDE `F(P)`, NOT APPLIED AFTER THE SOLVE, and the first version of
     * this got it wrong. Clamping the stored `h` after `solveP` returned meant the solve balanced
     * mass against one set of densities and the state then held another: `RHO` saturates at the
     * table's own edge value, which differs from `RHO(h_ceiling)` by up to 0.24 kg/m3 at 15.41 MPa
     * — 0.5 kg on the core node, small, but re-introduced EVERY STEP a node sits out of range. The
     * solve and the integration must evaluate the same function or mass conservation is a fiction.
     *
     * EVALUATED ONCE PER STEP, at the time-n pressure, rather than per `F` call. The bounds move
     * only as fast as pressure does, and `F` is called ~10 times per step on the hot path that
     * D1 §26 already recorded a performance stop condition against. Fixed bounds also make the
     * clamp a pure function of `a` and `P` within the step, which is what keeps `F` monotone. */
    var hHi = W.h_v(W.LIMITS.TV_MAX, sys.P);     /* vapour at 800 degC — the envelope ceiling */
    var hLo = W.h_l(0, sys.P);                   /* liquid at 0 degC — the envelope floor */
    function hClamp(h) { return h > hHi ? hHi : (h < hLo ? hLo : h); }

    /* ---- 2. SOLVE P. Bracketed, warm-started, capped. ---- */
    var M_target = sys.M_total + dt * dM;
    function F(P) {
      var s = 0;
      for (var k = 0; k < N; k++) s += sys.nodes[k].V * RHO(hClamp(a[k] + v[k] * (P - sys.P)), P);
      if (sys.extraMass) s += sys.extraMass(P);
      return s - M_target;
    }
    var sol = solveP(F, sys.P, sys.iterCap);

    /* ---- 3. INTEGRATE ----
     *
     * ⚠ THE ENTHALPY STATE GETS THE SAME HARD WALL THE PRESSURE SEARCH ALREADY HAS, and it did
     * not have one until 2026-08-17. `solveP` below carries a long note about why the property
     * envelope has to bound the SEARCH — "a silent absurd answer is the exact failure mode this
     * engine exists to make impossible". The identical argument applies to `h`, and nothing was
     * applying it: `a[i] = h + dt*dH[i]/m_n[i]` divides by a node mass that a boil-off drives
     * toward zero, so a dry node's enthalpy grows without bound.
     *
     * MEASURED, 0.005 m2 (50 cm2) break at full power with no ECCS: the core node reaches
     * quality 1.0 at 0.4 kg of steam, `h` passes 1e+304 by t = 62 s, overflows to Infinity, and
     * NaN then propagates through the ring flows into every node, the kinetics precursors and
     * the fuel temperature. The whole plant is NaN 62 s into a large break.
     *
     * WHAT MADE IT INVISIBLE is that every READER already clamps. `T_from_h`, `rho_from_h` and
     * the vtable all saturate at the envelope, so a node at h = 1e+304 reports 800 degC and a
     * sane density — the state was absurd for tens of seconds while every gauge read plausibly.
     * That is why no gate caught it and why the clamp costs nothing: a node inside the envelope
     * is never touched, and a node outside it was ALREADY being read as clamped. The only
     * behaviour that changes is that the state stops running to infinity.
     *
     * ENERGY IS DISCARDED WHEN THE CLAMP BINDS, and it is REPORTED rather than absorbed —
     * `enthalpyDiscarded_kJ` is how much physics this step threw away. The physical reading is
     * `solveP`'s, verbatim: not "the solver failed" but "this plant left the range the property
     * library is characterised over", which is a real condition a caller must handle. A caller
     * modelling core damage needs exactly this, because the CLAD is a metal node with its own
     * properties and is not bounded by the water envelope at all. */
    /* ---- THE ROOT-TRACKING LIMIT (#499, second instance) --------------------------------
     * The physical pressure trajectory is CONTINUOUS, so the root the solve adopts must stay
     * near the root it adopted last step. When the near root VANISHES — measured 2026-08-19:
     * a pressurizer drained to 9.2 % level under a 54 kg/s outsurge, whose vapor-dominated
     * projection collapsed the system compliance — the bracket expansion happily lands on a
     * far root and one 0.02 s step "moved" 1724 -> 2611 psia with a +20,085 kg/s surge. That
     * is not a pressure the plant reached; it is a different solution branch, and adopting it
     * teleports the state. The limit is MEASURED, not guessed: the largest legitimate
     * per-step move is 0.67 MPa (a 500 cm2 guillotine-class break's first step; the 40 cm2
     * gate break peaks at 0.104, everything operational is < 0.001), the defect's jump was
     * 6.1 MPa. A solve landing further than P_JUMP_MAX from the previous step's root is the
     * compliance-collapse condition — hold THIS step (nothing adopted), latch beyond_model. */
    var CEIL_HOLD_LATCH_S = 60;   /* s of CONTINUOUS active ceiling discard [derived] — 14x the
     * longest healthy episode (4.26 s, 50 cm2 break flash), 16x under the loss-of-heat-sink
     * hold it exists to latch (#535); rationale at the latch below. */
    var P_JUMP_MAX = 2.0;   /* MPa per step [derived] — 3x above the worst measured legit move.
     * CAVEAT, measured: a PRESSURIZER-LESS rigid loop under a hand-pinned uniform h moves
     * 2.589 MPa/step at ~3,000 MW-equivalent forcing — a HARNESS idiom, not an engine
     * trajectory (run_pwr2_sources' affinity fixture ramps its pin for exactly this reason).
     * The limit is calibrated to the full plant's reachable dynamics, pressurizer seated. */
    if (Math.abs(sol.P - sys.P) > P_JUMP_MAX) {
      sys.beyond_model = true;
      sys.simTime += dt;
      return {
        P: sys.P, dP: 0, held: true, beyond_model: true,
        iterations: sol.iters, capBound: false, bracketWidth: sol.width, unbracketed: false,
        envelopeExceeded: true, enthalpyClamped: 0, enthalpyDiscarded_kJ: 0, residual: 0,
        rootJump_mpa: sol.P - sys.P,             /* the rejected move, for the post-mortem */
        junction: sys.nodes.map(function (n) { return { id: n.id, dm_dt: 0 }; }),
        transfers: flows.length + sources.length
      };
    }

    var clampedNodes = 0, discardedKJ = 0, wallHi = 0, wallLo = 0, ceilClamped = 0;
    var h_next = new Array(N);            /* #518 — staged; adopted only past the latches */
    for (i = 0; i < N; i++) {
      var h_raw = a[i] + v[i] * (sol.P - sys.P);
      var h_new = hClamp(h_raw);                 /* THE SAME function the solve used */
      if (h_new !== h_raw) { clampedNodes++; discardedKJ += (h_raw - h_new) * m_n[i]; }
      /* ACTIVE ceiling clamp THIS step (#535) — distinct from the sitting-at-wall census
       * below: a node parked exactly AT hHi with h_raw inside counts for wallHi but not
       * here, and it is the active discard that means physics is being deleted right now */
      if (h_new !== h_raw && h_raw > hHi) ceilClamped++;
      if (h_new === hHi) wallHi++; else if (h_new === hLo) wallLo++;
      h_next[i] = h_new;                                  /* #518 — STAGED, not written yet */
    }
    /* #535: consecutive seconds of active ceiling discard. Rides `sys` into every save;
     * absent on an old save reads 0, healthy. Reset by ANY step with no active ceiling
     * clamp, so only a SUSTAINED discard can accumulate to the latch below. */
    sys._ceilHold = ceilClamped > 0 ? (sys._ceilHold || 0) + dt : 0;

    /* ---- THE BLOWDOWN TERMINAL LATCHES, EVALUATED BEFORE ANYTHING IS ADOPTED (#487/#499/#518)
     * BOTH halves of the floor latch are required, because each alone fires on a plant that is
     * still fine: `enthalpyClamped` fires transiently in a 50 cm2 break at ~297 s with the plant
     * at ordinary pressure (audit #488 C9: 147 node-steps, 141 kJ, finite throughout), and the
     * solve touches the FLOOR benignly only if it can still close mass there. A solve pinned at
     * P_MIN that cannot shed its mass surplus WHILE nodes sit outside the enthalpy envelope is
     * the state the pressure search cannot make consistent — the issue's measured sequence is
     * clamp at t = 842.78 s, NaN one step later. Latch on the first, never reach the second.
     *
     * The second signature (#499, first instance) is the SAME h-oscillation NEAR the floor, where
     * flooredLow never asserts: nodes pinned on BOTH envelope walls at once (measured: core at
     * +4161 kJ/kg beside upper plenum at -5.4, at 0.115 MPa, ECCS fighting the blowdown). It
     * NEVER occurs on a legitimate ride — the benign 50 cm2 clamping episode has 45,087 clamped
     * steps over 1200 s and zero two-sided ones.
     *
     * ⚠ THEY USED TO LATCH *AFTER* COMMITTING, AND SO THE HELD PLANT WAS THE BLOWN-UP STEP (#518).
     * The state written for the player to stare at for ever was the one the guard had just
     * rejected as uncomputable. MEASURED on a large break with the station blacked out: the last
     * good step reads 17.6 psia and Tavg 393 degF, and the held snapshot reads 14.5 psia and
     * **221 degF — a 172 degF fall in one 0.02 s step**, which is not a temperature the plant ever
     * had. #520 then put a dialog in front of exactly that board, which is what made it worth
     * fixing rather than recording.
     *
     * The root-jump guard above had this right from the start — "hold THIS step (nothing
     * adopted)" — and these two now do the same thing, which is the ONLY behaviour that makes the
     * held state mean what the dialog says it means: the last readings that were valid. The
     * clamp counts are still REPORTED, because what was rejected is the diagnostic.
     *
     * THE THIRD ARM IS THE CEILING'S (#535), and it is a PERSISTENCE latch because the ceiling
     * has a benign mode the floor does not: a 50 cm2 break flashes nodes onto hHi transiently
     * during the blowdown — measured, 453 active-ceiling steps with the LONGEST run 4.26 s,
     * finite and healthy throughout — so latching on first contact would kill a legitimate
     * LOCA. What has no benign mode is a SUSTAINED discard: an unmitigated loss of heat sink
     * pins core/upper-plenum/hot-leg on the ceiling and holds them there for ever (measured:
     * first clamp 88.8 min, then a single 969 s-and-climbing run, 79 % of decay heat deleted,
     * 55.4 GJ over 8 h, peak clad 1,616 degF FALLING against a 2,200 degF damage latch —
     * an immortal plant with every health flag green). CEIL_HOLD_LATCH_S = 60 is 14x the
     * longest measured healthy episode and 16x under the defect's hold; a minute of
     * continuously deleting decay heat is not a state this property library can speak to. */
    if ((sol.flooredLow && clampedNodes > 0) || (wallHi > 0 && wallLo > 0) ||
        sys._ceilHold > CEIL_HOLD_LATCH_S) {
      sys.beyond_model = true;
      sys.simTime += dt;                                  // EXACTLY dt. Always.
      return {
        P: sys.P, dP: 0, held: true, beyond_model: true,
        iterations: sol.iters, capBound: !!sol.capBound, bracketWidth: sol.width,
        unbracketed: !!sol.unbracketed, envelopeExceeded: true,
        enthalpyClamped: clampedNodes,                    /* what was REJECTED, not adopted */
        enthalpyDiscarded_kJ: discardedKJ, residual: 0,
        junction: sys.nodes.map(function (n) { return { id: n.id, dm_dt: 0 }; }),
        transfers: flows.length + sources.length
      };
    }

    for (i = 0; i < N; i++) sys.nodes[i].h = h_next[i];   /* #518 — adopt, now that it is safe */
    var P_prev = sys.P;
    sys.P = sol.P;
    sys.M_total = M_target;
    sys.simTime += dt;                                    // EXACTLY dt. Always.

    /* ---- 4. JUNCTIONS — an exact mass DIFFERENCE, not a modelled flow ---- */
    var junction = new Array(N);
    var nextExp = new Array(N);
    for (i = 0; i < N; i++) {
      var m_new = sys.nodes[i].V * RHO(sys.nodes[i].h, sys.P);
      var rate = (m_new - m_n[i]) / dt;
      junction[i] = { id: sys.nodes[i].id, dm_dt: rate };
      nextExp[i] = rate;                    // carried forward as the explicit lag
    }
    sys.expansion = nextExp;

    return {
      P: sys.P, dP: sys.P - P_prev, held: false, beyond_model: !!sys.beyond_model,
      iterations: sol.iters, capBound: sol.capBound, bracketWidth: sol.width,
      unbracketed: !!sol.unbracketed, envelopeExceeded: !!sol.envelopeExceeded,
      enthalpyClamped: clampedNodes,                       // nodes outside the property envelope
      enthalpyDiscarded_kJ: discardedKJ,                   // energy the clamp threw away, kJ
      residual: F(sol.P),                                  // kg, after the solve
      junction: junction,
      transfers: flows.length + sources.length,            // vacuity guard, D5 §1
      /* #574 — net kW the METAL gave the fluid this step. REPORTED so a consumer can see
       * the wall working rather than infer it from a temperature that moved: a dark wire is
       * what this whole issue was about. */
      wallHeat_kW: wallHeat
    };
  }

  /* Bracketed root-find on a monotone F. Warm-started at P0, expanding outward until the
   * sign changes, then bisecting. Bisection rather than false position deliberately: the
   * bracket width is then a HARD error bound at every iteration count, which is the whole
   * property that makes a capped solve acceptable at a fixed frame. */
  function solveP(F, P0, cap) {
    /* THE PROPERTY ENVELOPE IS A HARD WALL ON THE SEARCH, and it must be.
     * Past P_MAX, Layer 0 CLAMPS density — so F(P) goes FLAT, the root disappears, and an
     * unbounded expansion happily runs to absurdity while reporting success. Measured before
     * this guard: 300 MW into a closed loop with no heat sink crossed 18 MPa in about a second
     * and the solve then returned P = 1.15e+15 MPa with `unbracketed: false`. A silent absurd
     * answer is the exact failure mode this engine exists to make impossible, so the search is
     * confined to the envelope and stepping outside it is REPORTED as `envelopeExceeded`.
     * The physical reading is not "the solver failed" — it is "this plant left the range the
     * property library is characterised over", which is a real condition a caller must handle. */
    var LIM = W.LIMITS, P_LO = LIM.P_MIN, P_HI = LIM.P_MAX;
    var flo, fhi, evals = 0;
    function f(P) { evals++; return F(P); }

    /* WARM START TIGHT. The step-to-step pressure move is small, so the first bracket
     * usually already contains the root and every one of the capped bisections is then spent
     * on precision rather than on finding the interval. Starting wide (0.05 MPa) wastes the
     * cap: 8 bisections of 0.05 leaves 2e-4 MPa of bracket, and the closure residual is that
     * width times dM/dP. Starting at 1e-3 leaves 4e-6. Same cap, 50x the precision. */
    var span = 1e-3;
    var lo = P0, hi = P0;
    flo = f(P0);
    if (flo === 0) return { P: P0, iters: 0, evals: evals, capBound: false, width: 0 };
    fhi = flo;

    /* Expand outward until the root is bracketed. F increases with P, so F(P0) > 0 means the
     * root lies below. Expansions are F evaluations too and are REPORTED — a frame-time budget
     * that counts only the bisections is not counting the work. */
    var k;
    for (k = 0; k < 60; k++) {
      if (flo > 0) { lo = Math.max(P_LO, lo - span); flo = f(lo); }
      else if (fhi < 0) { hi = Math.min(P_HI, hi + span); fhi = f(hi); }
      if (flo <= 0 && fhi >= 0) break;
      span *= 2;
      if (lo <= P_LO && flo > 0) break;                    // pinned at the floor
      if (hi >= P_HI && fhi < 0) break;                    // pinned at the ceiling
    }

    if (!(flo <= 0 && fhi >= 0)) {
      /* NO BRACKET ON A FUNCTION THAT IS SUPPOSED TO BE MONOTONE. Either the target mass is
       * outside the representable range, or dF/dP has gone negative — which would break the
       * theorem the whole solver rests on. Report it loudly rather than return a number that
       * looks converged; a silent wrong pressure is the failure mode this design exists to
       * make impossible. */
      return { P: flo > 0 ? lo : hi, iters: k, evals: evals, capBound: true,
               width: hi - lo, unbracketed: true,
               envelopeExceeded: (hi >= P_HI && fhi < 0) || (lo <= P_LO && flo > 0),
               /* The LOW side separately: `envelopeExceeded` fires on the ordinary initial
                * spike to the 18 MPa ceiling (t = 0.86 s in every large break) and is useless
                * as a terminal signal; a solve pinned at the FLOOR with mass it cannot shed
                * is the end-of-blowdown condition #487 latches on. */
               flooredLow: lo <= P_LO && flo > 0 };
    }

    var iters = 0, mid = 0.5 * (lo + hi);
    while (iters < cap) {
      mid = 0.5 * (lo + hi);
      var fm = f(mid);
      if (fm === 0) break;
      if (fm < 0) lo = mid; else hi = mid;
      iters++;
      if (hi - lo < 1e-12) break;
    }
    return { P: 0.5 * (lo + hi), iters: iters, evals: evals,
             capBound: iters >= cap && (hi - lo) >= 1e-12, width: hi - lo };
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.core = {
    createSystem: createSystem,
    step: step,
    totalMass: function (sys) {
      return totalMass(sys, sys.P, sys.nodes.map(function (n) { return n.h; }));
    },
    internalEnergy: internalEnergy,
    solveP: solveP,
    /* #574 — exported so the gate can drive one wall in isolation. The lump chain is the
     * part most likely to be built in PARALLEL by mistake, which behaves like one lump and
     * looks perfectly reasonable from outside. */
    buildWall: buildWall, stepWall: stepWall, wallFilm: wallFilm, WALL_FILM: WALL_FILM
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
