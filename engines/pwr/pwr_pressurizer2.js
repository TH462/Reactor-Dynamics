/*
 * pwr_pressurizer2.js — THE PRESSURIZER REBUILD (#472), built ALONGSIDE the shipped model.
 *
 * WHAT THIS FILE IS
 * -----------------
 * A second pressurizer implementation plus the selector that swaps it in. It exists so the
 * rebuild can be A/B'd against v1 on the same tree, the same scenarios and the same
 * commit — the owner-approved method (`Blueprint/PWR_PRESSURIZER_REBUILD.md` §1.4: "Build
 * alongside, not in place. New module, switchable, A/B against the old on the same
 * scenarios"), because 23 runners and 11 scenarios are downstream and a big-bang cutover
 * produces dozens of simultaneous reds, which is the condition under which real defects
 * hide.
 *
 * THE SPEC IS `Blueprint/PWR_PRESSURIZER2_SPEC.md`. Read it before changing the physics
 * here; this header covers the SWITCH, which is the part that can silently lie to you.
 *
 * IT IS DISPOSABLE. At cutover this body moves INTO `pwr_pressurizer.js` (that filename
 * and its git history are the record), this file is deleted along with its ~28 load lines,
 * the `--pzr2` flags and the `pressurizer2:` config block. Nothing here should grow a
 * consumer that would have to be re-pointed.
 *
 * PHASE 3a — WHAT IS BUILT TODAY
 * ------------------------------
 * The plumbing ONLY. Every entry point delegates to v1, so flag-on and flag-off are the
 * same plant to the bit. That is deliberate and it is the phase's gate: it proves the
 * switch, the load order, the ~28 carriers and the A/B harness BEFORE any physics exists,
 * so that the first real red in phase 3b is about the model and not about the wiring.
 *
 * THE LOAD-ORDER TRAP, which is the whole reason the throw below exists
 * --------------------------------------------------------------------
 * `pwr_engine.js:22` caches its collaborators AT LOAD TIME:
 *
 *     var TH = RD.pwrThermal, PZ = RD.pwrPressurizer, PR = RD.pwrPrimary, ...
 *
 * so replacing `RD.pwrPressurizer` AFTER the engine file has been executed changes
 * nothing at all — the engine keeps calling v1 through its captured `PZ`, the flag reads
 * as on, and every measurement is silently v1 wearing a v2 label. `pwr_primary.js:304`,
 * `pwr_instruments.js:240` and `pwr_engine.js:2277` all late-bind through
 * `RD.pwrPressurizer.x` and would follow the swap, so the plant would run HALF of each
 * model. That is a worse failure than either model alone and it is invisible in a green
 * gate, so this file REFUSES to load after the engine rather than trying to cope.
 *
 * Ordering rule: load immediately after `pwr_pressurizer.js`, before `pwr_engine.js`.
 * `test/verify_pzr2_loadlists.js` gates that every carrier of v1 also carries v2.
 */
;(function (RD) {
  'use strict';

  var V1 = RD.pwrPressurizer;
  if (!V1) throw new Error('pwr_pressurizer2.js: load AFTER pwr_pressurizer.js (v1 is the phase-3a delegate)');

  // ================================================================== correlations
  //
  // v1 needed exactly ONE property of steam: `P_sat_from_T`. A two-region model needs the
  // steam side as well, because pressure is no longer a gain — it is the state of the
  // bubble, `rho_g_sat(P) = m_stm / V_stm`. These are the two functions that make the
  // difference between computing a pressure and fitting one.
  //
  // PROVENANCE, stated plainly: the table below is RECALLED IAPWS saturated-vapour
  // density, not a sourced document. That is the same standing the config's own rho/cp
  // figures have (see the `eccs_cooling_gain` block, which flags its 700 kg/m³ and
  // 5.7 kJ/kg·K the same way), and it is flagged here for the same reason — so a later
  // reader knows which numbers would move if a steam-table reference entered the corpus.
  // Nothing structural depends on the third digit: what the model needs is the SHAPE
  // (rho_g rising ~linearly in P at low pressure and steepening toward the critical
  // point), and that shape is what the table carries.
  //
  // A TABLE RATHER THAN A FIT, deliberately. A log-log power law through the endpoints
  // reads 18 % high at 7 MPa — the curve is not straight in any simple coordinates, and a
  // closed form accurate across 0.1–22 MPa would be a correlation nobody in this repo
  // could check by eye. Twenty-three points with log-space interpolation is <1 % across
  // the whole range, and every entry is independently verifiable against any steam table.
  var PSAT_MPA = [0.1, 0.2, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0,
                  11.0, 12.0, 13.0, 14.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0];
  var RHO_G    = [0.5903, 1.129, 2.668, 5.145, 10.04, 15.00, 20.09, 25.35, 30.82, 36.53,
                  42.51, 48.79, 55.43, 62.48, 70.01, 78.14, 87.00, 96.71, 107.4, 119.3,
                  132.6, 147.8, 165.3];

  // rho_g_sat(P) — saturated vapour density [kg/m³] at pressure P [MPa].
  // Interpolated in LOG-LOG space: both quantities span two-plus decades, and a linear
  // interpolation on the raw values is visibly wrong between the widely-spaced low-P
  // entries (0.1 → 0.2 → 0.5).
  function rho_g_sat(P) {
    if (!(P > 0)) return RHO_G[0];
    if (P <= PSAT_MPA[0]) return RHO_G[0] * (P / PSAT_MPA[0]);          // ideal-gas limit
    var n = PSAT_MPA.length;
    if (P >= PSAT_MPA[n - 1]) {
      // Above the table the curve is steepening toward the critical point; extrapolating
      // the last log-log segment is the least-wrong option and the regime is guarded
      // elsewhere (the code safeties lift at 17.13).
      var s = Math.log(RHO_G[n - 1] / RHO_G[n - 2]) / Math.log(PSAT_MPA[n - 1] / PSAT_MPA[n - 2]);
      return RHO_G[n - 1] * Math.pow(P / PSAT_MPA[n - 1], s);
    }
    var i = 0;
    while (i < n - 2 && PSAT_MPA[i + 1] < P) i++;
    var f = Math.log(P / PSAT_MPA[i]) / Math.log(PSAT_MPA[i + 1] / PSAT_MPA[i]);
    return RHO_G[i] * Math.pow(RHO_G[i + 1] / RHO_G[i], f);
  }

  // T_sat_from_P — the inverse of v1's `P_sat_from_T`, by bisection ON THAT FUNCTION.
  //
  // Inverting our OWN correlation rather than tabulating Tsat independently is the point:
  // a second table would let the saturation line disagree with itself, and every regime
  // predicate in this model (flash, condense, solid, the sat-branch entry) tests one side
  // of that line against the other. 60 bisections over a 100–374 °C bracket converge to
  // ~2e-7 °C, and the whole call costs less than one `Math.pow`.
  function T_sat_from_P(P) {
    var lo = 100, hi = 374, m;
    for (var i = 0; i < 60; i++) {
      m = 0.5 * (lo + hi);
      if (V1.P_sat_from_T(m) < P) lo = m; else hi = m;
    }
    return 0.5 * (lo + hi);
  }

  // dTsat/dP [°C/MPa] — the slope that converts heat into pressure rate. This is the term
  // that makes heater authority an OUTPUT: dP/dt = Q / (C · dTsat/dP). Central difference
  // on the inverse above, clamped so the step cannot cross into the extrapolated region.
  function dTsat_dP(P) {
    var h = Math.min(0.05, Math.max(0.001, P * 0.005));
    return (T_sat_from_P(P + h) - T_sat_from_P(P - h)) / (2 * h);
  }

  // rho_l_sat(T) — saturated LIQUID density [kg/m³] at temperature T [°C]. Same provenance
  // and same reason as the vapour table: recalled IAPWS, flagged. The pressurizer's liquid
  // lives between ~250 °C (cold-plant bubble) and 355 °C (code-safety saturation), and its
  // density falls 25 % across that span — which is why level cannot be a mass proxy in a
  // model that claims to be geometric.
  var TL_C   = [100, 150, 200, 250, 275, 300, 320, 330, 340, 345, 350, 360, 370];
  var RHO_L  = [958.4, 917.0, 864.7, 799.2, 758.6, 712.1, 667.1, 640.4, 610.3, 594.0, 574.7, 528.1, 451.4];

  function rho_l_sat(T) {
    if (T <= TL_C[0]) return RHO_L[0];
    var n = TL_C.length;
    if (T >= TL_C[n - 1]) return RHO_L[n - 1];
    var i = 0;
    while (i < n - 2 && TL_C[i + 1] < T) i++;
    var f = (T - TL_C[i]) / (TL_C[i + 1] - TL_C[i]);
    return RHO_L[i] + f * (RHO_L[i + 1] - RHO_L[i]);
  }

  // h_fg(P) — latent heat [kJ/kg]. It is NOT a constant over this plant's range: 1000 at
  // operating pressure, 2258 at atmospheric. A model that flashes and condenses with a
  // fixed h_fg gets the cold end of a cooldown wrong by 2×.
  var HFG_P   = [0.1, 0.5, 1.0, 2.0, 5.0, 7.0, 10.0, 12.0, 15.0, 16.0, 17.0, 18.0, 20.0];
  var HFG_KJ  = [2257.5, 2108.0, 2014.6, 1889.8, 1639.7, 1505.1, 1317.1, 1193.6, 1000.0, 930.0, 856.9, 777.1, 583.4];

  function h_fg(P) {
    if (P <= HFG_P[0]) return HFG_KJ[0];
    var n = HFG_P.length;
    if (P >= HFG_P[n - 1]) return HFG_KJ[n - 1];
    var i = 0;
    while (i < n - 2 && HFG_P[i + 1] < P) i++;
    var f = (P - HFG_P[i]) / (HFG_P[i + 1] - HFG_P[i]);
    return HFG_KJ[i] + f * (HFG_KJ[i + 1] - HFG_KJ[i]);
  }

  // P_from_steam_density — the pressure solve, and the sentence that replaces `K_surge_level`.
  //
  // v1 asked "how many MPa per unit of level rate?" and answered with a fitted gain. v2 asks
  // "what pressure has a saturated vapour of THIS density?" and answers with the steam
  // tables. Bisection on the monotone rho_g_sat, bracketed to the model's own range.
  function P_from_steam_density(rho) {
    if (!(rho > 0)) return 0.1;
    var lo = 0.05, hi = 20.0, m;
    for (var i = 0; i < 50; i++) {
      m = 0.5 * (lo + hi);
      if (rho_g_sat(m) < rho) lo = m; else hi = m;
    }
    return 0.5 * (lo + hi);
  }

  // ============================================================ the two regions
  //
  // ONE LUMPED THERMAL NODE FOR LIQUID + VESSEL METAL, declared. The metal is carried for
  // its HEAT CAPACITY (41 % of the total, and the difference between 5.8 and 3.4 psi/s of
  // heater authority — the reason the spec retracted its "wall node is second-order" call),
  // but it is held AT the liquid temperature rather than given its own state and time
  // constant. A second node needs a heat-transfer coefficient nothing in this repo sources,
  // and no catalog row bands on the metal's LAG. Capacity is the load-bearing half and it
  // is captured exactly; the lag is the declared approximation.
  function capacity_mj_per_c(s, cfg) {
    var p2 = cfg.pressurizer2;
    var cp_l = 6.0;                                   // kJ/kg·K, saturated liquid near 345 °C
    return (s.pzr_m_liq_kg * cp_l + p2.pzr_vessel_mass_kg * p2.pzr_vessel_cp_kj_kgk) / 1000;
  }

  // Seed the region state from whatever the plant already is. v2 has to be able to take over
  // a plant mid-run (the A/B switch, a loaded save, a scenario IC), so the regions are
  // RECONSTRUCTED from the two published quantities that always exist — pressure and level —
  // rather than requiring an initialiser nobody would remember to call.
  function ensureRegions(s, cfg) {
    if (s.pzr_m_liq_kg != null) return;
    var p2 = cfg.pressurizer2;
    var P = s.pressure_mpa > 0 ? s.pressure_mpa : cfg.pressurizer.P_equilibrium;
    var lvl = (s.pzr_level_pct != null ? s.pzr_level_pct : cfg.pressurizer.pzr_level_nominal) / 100;
    lvl = Math.max(0, Math.min(1, lvl));
    var Tsat = T_sat_from_P(P);
    var V_liq = lvl * p2.V_pzr_m3;
    s.pzr_t_liq_c   = Tsat;                    // the pressurizer sits ON its saturation line
    s.pzr_m_liq_kg  = V_liq * rho_l_sat(Tsat);
    s.pzr_m_stm_kg  = (p2.V_pzr_m3 - V_liq) * rho_g_sat(P);
    s.pzr_surge_kgps = 0;
  }

  var CP_LIQ = 6.0;   // kJ/kg·K, saturated liquid near 345 °C

  // stepRegions — ONE step of the two-region pressurizer. Mass and energy in, pressure out.
  //
  // The order is the physics, not a convention: mass moves first (surge, spray, relief),
  // then energy is accounted at the new masses, then the state is returned to the
  // saturation line by an implicit flash/condense, and pressure is READ OFF the steam
  // region. Nothing in here is a gain, and there is nowhere to put one.
  //
  // `surge_kgps` is the loop-side demand — POSITIVE is an insurge. It is computed by the
  // caller from the same displacement law v1 uses (thermal + inventory), because that half
  // is loop bookkeeping and belongs to #474; what changes here is the RESPONSE, which is
  // the whole point of the rebuild.
  function stepRegions(s, cfg, dt, io) {
    var p2 = cfg.pressurizer2;
    ensureRegions(s, cfg);

    var P0 = pressureFrom(s, cfg);
    var T0 = T_sat_from_P(P0);
    var C  = (s.pzr_m_liq_kg * CP_LIQ + p2.pzr_vessel_mass_kg * p2.pzr_vessel_cp_kj_kgk); // kJ/°C

    // ---- 1. MASS. Insurge arrives at the hot-leg temperature and MIXES; an outsurge
    // leaves at the pressurizer's own temperature and changes no temperature at all. That
    // asymmetry is real and is the reason an insurge is a cooling event for the bubble.
    // A PRESSURIZER IS STRATIFIED, AND ASSUMING OTHERWISE INVERTS THE PLANT'S MOST BASIC
    // BEHAVIOUR. Measured 2026-08-12, and this is the correction that earned the iteration:
    // mixing the insurge instantly through the whole liquid node makes a load reduction
    // DROP pressure 43 psi, because 265 kg of 311.7 °C water cools 14 MJ/°C of node and
    // condenses more bubble than the volume displaces. Every PWR text has it the other way
    // — an insurge RAISES pressure, which is precisely why spray exists as the countermeasure.
    //
    // The physical reason the naive form is wrong: surge water enters BELOW the liquid
    // surface through the surge line and stays there. It displaces steam volume immediately;
    // it reaches the saturated interface only as it mixes, over minutes. Spray is the
    // opposite by construction — it is injected INTO the steam space, which is why it
    // condenses on contact and why the two cannot share a code path (they did, one revision
    // ago, and that was the defect).
    //
    // So an insurge displaces volume NOW and cools the node LATER: the enthalpy deficit is
    // banked and released with a mixing time constant. That also produces the shape an
    // operator actually sees — pressure spikes on the insurge, then decays back as the cold
    // water works in.
    var m_surge = (io.surge_kgps || 0) * dt;
    if (m_surge > 0) {
      var T_in = (io.surge_t_c != null ? io.surge_t_c : s.pzr_t_liq_c);
      s.pzr_mix_deficit_kj = (s.pzr_mix_deficit_kj || 0) + m_surge * CP_LIQ * (s.pzr_t_liq_c - T_in);
      s.pzr_m_liq_kg += m_surge;
    } else if (m_surge < 0) {
      // An outsurge carries away liquid at the pressurizer's OWN temperature, so it removes
      // banked deficit in proportion rather than concentrating it.
      var frac = Math.min(1, -m_surge / Math.max(1e-6, s.pzr_m_liq_kg));
      s.pzr_mix_deficit_kj = (s.pzr_mix_deficit_kj || 0) * (1 - frac);
      s.pzr_m_liq_kg = Math.max(0, s.pzr_m_liq_kg + m_surge);
    }
    // Release the banked deficit toward the bulk on the mixing time constant.
    if (s.pzr_mix_deficit_kj) {
      var rel = s.pzr_mix_deficit_kj * dt / (p2.surge_mix_tau_s + dt);
      s.pzr_t_liq_c -= rel / C;
      s.pzr_mix_deficit_kj -= rel;
    }

    // Spray: cold water into the steam space. It joins the liquid region AND drags the
    // node temperature down, which is what actually condenses the bubble — v1 spent a
    // `K_spray` gain to say this.
    var m_spray = (io.spray_kgps || 0) * dt;
    if (m_spray > 0) {
      var T_sp = (io.spray_t_c != null ? io.spray_t_c : s.pzr_t_liq_c);
      C = (s.pzr_m_liq_kg * CP_LIQ + p2.pzr_vessel_mass_kg * p2.pzr_vessel_cp_kj_kgk);
      s.pzr_t_liq_c = (C * s.pzr_t_liq_c + m_spray * CP_LIQ * T_sp) / (C + m_spray * CP_LIQ);
      s.pzr_m_liq_kg += m_spray;
    }

    // Relief draws STEAM from the steam space. Structurally, not by exemption: this is why
    // a PORV lift does not move the liquid level, which v1 had to fence with an admittance
    // split (the `w` term) and which TD-5 asserts.
    var m_relief = (io.relief_kgps || 0) * dt;
    if (m_relief > 0) s.pzr_m_stm_kg = Math.max(1e-6, s.pzr_m_stm_kg - m_relief);

    // ---- 2. ENERGY. Heaters into the liquid+metal node, scaled by the wetted fraction of
    // the bank (§2.6 — physics, on TRUE level; the 17 % bistable is protection and lives in
    // autoControl on the INDICATED level).
    C = (s.pzr_m_liq_kg * CP_LIQ + p2.pzr_vessel_mass_kg * p2.pzr_vessel_cp_kj_kgk);
    var lvl = 100 * (s.pzr_m_liq_kg / rho_l_sat(s.pzr_t_liq_c)) / p2.V_pzr_m3;
    var wet = (p2.heater_elev_top_pct > p2.heater_elev_bot_pct)
      ? Math.max(0, Math.min(1, (lvl - p2.heater_elev_bot_pct) /
                                (p2.heater_elev_top_pct - p2.heater_elev_bot_pct)))
      : (lvl > p2.heater_elev_top_pct ? 1 : 0);
    var Q = (io.heater_frac || 0) * p2.heater_power_mw * 1000 * wet * dt;   // kJ
    if (Q) s.pzr_t_liq_c += Q / C;
    s.pzr_heater_wetted_frac = wet;

    // ---- 3. RETURN TO SATURATION — implicit, and this is the 4× trap (spec §2.5).
    // Q·dt = m_flash·h_fg(P_new) + C·(Tsat(P_new) − Tsat(P_old)). Flashing against the OLD
    // Tsat puts all the energy into latent heat and over-predicts pressure rate 4×.
    var E = C * (s.pzr_t_liq_c - T0);          // kJ of departure from the old saturation line
    var mf = solveFlash(s, cfg, E, C, T0);
    s.pzr_m_liq_kg = Math.max(1e-6, s.pzr_m_liq_kg - mf);
    s.pzr_m_stm_kg = Math.max(1e-9, s.pzr_m_stm_kg + mf);

    var P1 = pressureFrom(s, cfg);
    s.pzr_t_liq_c = T_sat_from_P(P1);          // the pressurizer sits ON its saturation line
    s.pzr_surge_kgps = io.surge_kgps || 0;
    return P1;
  }

  function pressureFrom(s, cfg) {
    var V_liq = s.pzr_m_liq_kg / rho_l_sat(s.pzr_t_liq_c);
    var V_stm = Math.max(1e-6, cfg.pressurizer2.V_pzr_m3 - V_liq);
    return P_from_steam_density(s.pzr_m_stm_kg / V_stm);
  }

  // Bisect on the flashed mass until the energy books balance at the RESULTING pressure.
  // Bracket is signed: E < 0 is a condensing (subcooled) node and mf comes out negative.
  function solveFlash(s, cfg, E, C, T0) {
    var p2 = cfg.pressurizer2, hfg0 = h_fg(T0 > 0 ? V1.P_sat_from_T(T0) : 15.41);
    var span = Math.abs(E) / Math.max(1, hfg0) * 1.5 + 1e-6;
    var lo = E >= 0 ? 0 : -Math.min(span, s.pzr_m_stm_kg * 0.9);
    var hi = E >= 0 ? Math.min(span, s.pzr_m_liq_kg * 0.9) : 0;
    var mf = 0;
    for (var i = 0; i < 50; i++) {
      mf = 0.5 * (lo + hi);
      var mL = s.pzr_m_liq_kg - mf, mS = s.pzr_m_stm_kg + mf;
      if (mL <= 0 || mS <= 0) { hi = mf; continue; }
      var Vl = mL / rho_l_sat(T0);
      var Pn = P_from_steam_density(mS / Math.max(1e-6, p2.V_pzr_m3 - Vl));
      var resid = E - mf * h_fg(Pn) - C * (T_sat_from_P(Pn) - T0);
      if (resid > 0) lo = mf; else hi = mf;
    }
    return mf;
  }

  // ------------------------------------------------------------------ the model
  //
  // PHASE 3a: pure delegation. Each function is listed explicitly rather than copied with
  // a loop, because the export list IS the interface contract with the engine — a spread
  // would let v1 grow a function that silently appears here without anyone deciding it
  // belongs in the rebuilt model.
  var PZ2 = {
    // correlations — P_sat_from_T is v1's (one saturation line, see T_sat_from_P);
    // the rest are new and are what a two-region model needs that v1 never did.
    P_sat_from_T:     function (T_c)          { return V1.P_sat_from_T(T_c); },
    rho_g_sat:        rho_g_sat,
    rho_l_sat:        rho_l_sat,
    h_fg:             h_fg,
    T_sat_from_P:     T_sat_from_P,
    dTsat_dP:         dTsat_dP,
    P_from_steam_density: P_from_steam_density,
    // two-region internals, exported so probes can drive them WITHOUT stepping a plant —
    // the CV fences need to assert geometry and closure at a state, not over a run.
    ensureRegions:    ensureRegions,
    capacity_mj_per_c: capacity_mj_per_c,
    levelFromRegions: function (s, cfg) {
      return 100 * (s.pzr_m_liq_kg / rho_l_sat(s.pzr_t_liq_c)) / cfg.pressurizer2.V_pzr_m3;
    },
    stepRegions:      stepRegions,
    solveFlash:       solveFlash,
    pressureFromRegions: function (s, cfg) {
      var V_liq = s.pzr_m_liq_kg / rho_l_sat(s.pzr_t_liq_c);
      var V_stm = Math.max(1e-6, cfg.pressurizer2.V_pzr_m3 - V_liq);
      return P_from_steam_density(s.pzr_m_stm_kg / V_stm);
    },
    // step entry points (pwr_engine.js:508 / :540 / :542, and :1992 with dt=0)
    stepPressure:     function (s, cfg, dt)   { return V1.stepPressure(s, cfg, dt); },
    stepLevel:        function (s, cfg, dt)   { return V1.stepLevel(s, cfg, dt); },
    stepTailpipe:     function (s, cfg, dt)   { return V1.stepTailpipe(s, cfg, dt); },
    // control + hydraulics
    effectiveSetpoint: function (s, cfg, dt)  { return V1.effectiveSetpoint(s, cfg, dt); },
    autoControl:      function (s, cfg, sp)   { return V1.autoControl(s, cfg, sp); },
    relief:           function (s, cfg)       { return V1.relief(s, cfg); },
    // level laws. levelProgram is a CONTROL law (the CVCS setpoint and the deviation
    // gauge both call it — pwr_primary.js:304, pwr_instruments.js:240) and survives the
    // rebuild near-verbatim; levelBase is its input.
    levelBase:        function (s, cfg)       { return V1.levelBase(s, cfg); },
    levelProgram:     function (s, cfg)       { return V1.levelProgram(s, cfg); },
    // v1-only, PRESENT FOR DELEGATION AND NOT PART OF THE V2 SURFACE. `levelRaw` is the
    // frozen pre-node line and `pzrNodeLevel` is v1's live law; the spec retires both
    // (§4). They are forwarded so phase 3a is bit-identical, and they are the first
    // things to disappear in 3b — the probes that call them are refit territory.
    levelRaw:         function (s, cfg)       { return V1.levelRaw(s, cfg); },
    pzrNodeLevel:     function (s, cfg)       { return V1.pzrNodeLevel(s, cfg); },
  };

  RD.pwrPressurizer2 = PZ2;

  // ------------------------------------------------------------------ the selector
  //
  // Three ways in, all equivalent, none of them the default:
  //   config  RD.PWR_CONFIG.pressurizer2.enabled = 1   (the shipped switch)
  //   Node    RD_PZR2=1                                (measure_stack/_perturb_child A/B)
  //   browser ?pzr2=1                                  (drive the real board on v2)
  var cfg2 = (RD.PWR_CONFIG && RD.PWR_CONFIG.pressurizer2) || {};
  var sel = (cfg2.enabled === 1)
         || (typeof process !== 'undefined' && process.env && process.env.RD_PZR2 === '1')
         || (typeof location !== 'undefined' && /[?&]pzr2=1/.test(location.search || ''));

  if (sel) {
    // See the load-order trap in the header. This is not defensive programming; it is the
    // difference between "the flag did nothing" and "the flag did half of something".
    if (RD.PWREngine) {
      throw new Error('pwr_pressurizer2.js: ?pzr2/RD_PZR2/enabled is set, but pwr_engine.js ' +
        'is ALREADY LOADED — it cached RD.pwrPressurizer at load time (pwr_engine.js:22), ' +
        'so the swap would be half-applied and every measurement would be a lie. Move this ' +
        'file ABOVE pwr_engine.js in the load list.');
    }
    RD.pwrPressurizer = PZ2;
    RD.PWR_PZR_MODEL = 'v2';
  } else {
    RD.PWR_PZR_MODEL = 'v1';
  }

})(globalThis.RD || (globalThis.RD = {}));
