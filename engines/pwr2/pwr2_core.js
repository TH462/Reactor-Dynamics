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

  /* createSystem(spec) — spec.nodes: [{id, V, h}]  (V m3, h kJ/kg initial)
   *                      spec.P: initial pressure MPa
   *                      spec.extraMass: optional f(P) -> kg, a compressible volume outside
   *                        the rigid nodes. Layer 5 plugs the pressurizer in here; at Layer 2
   *                        it is absent and the system is rigid.
   *                      spec.iterCap: default 8 (the ruled value) */
  function createSystem(spec) {
    var nodes = spec.nodes.map(function (n) {
      return { id: n.id, V: n.V, h: n.h };
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

    var clampedNodes = 0, discardedKJ = 0, wallHi = 0, wallLo = 0;
    var h_next = new Array(N);            /* #518 — staged; adopted only past the latches */
    for (i = 0; i < N; i++) {
      var h_raw = a[i] + v[i] * (sol.P - sys.P);
      var h_new = hClamp(h_raw);                 /* THE SAME function the solve used */
      if (h_new !== h_raw) { clampedNodes++; discardedKJ += (h_raw - h_new) * m_n[i]; }
      if (h_new === hHi) wallHi++; else if (h_new === hLo) wallLo++;
      h_next[i] = h_new;                                  /* #518 — STAGED, not written yet */
    }

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
     * clamp counts are still REPORTED, because what was rejected is the diagnostic. */
    if ((sol.flooredLow && clampedNodes > 0) || (wallHi > 0 && wallLo > 0)) {
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
      transfers: flows.length + sources.length             // vacuity guard, D5 §1
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
    solveP: solveP
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
