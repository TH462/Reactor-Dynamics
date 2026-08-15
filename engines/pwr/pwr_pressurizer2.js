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

  // T_sat_from_P — the inverse of v1's `P_sat_from_T`, in CLOSED FORM.
  //
  // Inverting our OWN correlation rather than tabulating Tsat independently is the point:
  // a second table would let the saturation line disagree with itself, and every regime
  // predicate in this model (flash, condense, solid, the sat-branch entry) tests one side
  // of that line against the other. v1's line is `P = (T/179.47)^(1/0.239)`, so the inverse
  // is `T = 179.47·P^0.239` exactly — no bracket, no tolerance.
  //
  // IT WAS A 60-STEP BISECTION UNTIL 2026-08-14, and the cost was not academic: the flash
  // solve calls this inside a fixed point inside a bisection, and the expense is what made
  // the fixed point run three passes and stop 6 % short of its own root (see solveFlash).
  // An exact form bought the iterations that made the answer right. `run_pzr2` A3 still
  // asserts the round trip against v1's forward correlation, so the closed form cannot
  // drift away from the line it inverts.
  function T_sat_from_P(P) {
    return 179.47 * Math.pow(Math.max(P, 1e-9), 0.239);
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
  // tables. It is the EXACT inverse of `rho_g_sat`, segment for segment, rather than a
  // bisection on it: the interpolation is a power law inside each segment, so inverting it
  // is the same algebra with the roles swapped. (It was a 50-step bisection until
  // 2026-08-14 — see T_sat_from_P for why the cost mattered.) The extrapolation and the
  // ideal-gas limit mirror the forward function branch for branch, so the round trip holds
  // outside the table as well as inside it; `run_pzr2` A2 asserts exactly that.
  function P_from_steam_density(rho) {
    if (!(rho > 0)) return 0.1;
    var n = RHO_G.length;
    if (rho <= RHO_G[0]) return PSAT_MPA[0] * (rho / RHO_G[0]);              // ideal-gas limit
    if (rho >= RHO_G[n - 1]) {
      var s = Math.log(RHO_G[n - 1] / RHO_G[n - 2]) / Math.log(PSAT_MPA[n - 1] / PSAT_MPA[n - 2]);
      return PSAT_MPA[n - 1] * Math.pow(rho / RHO_G[n - 1], 1 / s);
    }
    var i = 0;
    while (i < n - 2 && RHO_G[i + 1] < rho) i++;
    var f = Math.log(rho / RHO_G[i]) / Math.log(RHO_G[i + 1] / RHO_G[i]);
    return PSAT_MPA[i] * Math.pow(PSAT_MPA[i + 1] / PSAT_MPA[i], f);
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
  // SEED FROM INVENTORY, NOT FROM THE GAUGE. `pzr_mass_frac` is the pressurizer's liquid
  // content as a share of RCS mass — the #385 node's own currency — and it is what an IC, a
  // save and the migration path all carry. `pzr_level_pct` is a PUBLISHED READING that the
  // level step fills in, and the engine's initial state literally sets it to 0
  // (pwr_engine.js:1840) on the understanding that step 8 will overwrite it.
  //
  // Reading the gauge first was measured on 2026-08-14 and it seeds an EMPTY VESSEL: level
  // 0.0 at t=0, a reactor trip on pzr level low at six seconds, and CVCS then refilling a
  // plant that was supposed to start at 55 %. Nothing about the physics was wrong; the model
  // was handed a pressurizer with no water in it. The order below is the fix and it is also
  // the general rule — an inventory model seeds from an inventory quantity, never from a
  // display of one.
  function ensureRegions(s, cfg) {
    if (s.pzr_m_liq_kg != null) return;
    var p2 = cfg.pressurizer2;
    var P = s.pressure_mpa > 0 ? s.pressure_mpa : cfg.pressurizer.P_equilibrium;
    var Tsat = T_sat_from_P(P);
    var m_liq;
    if (s.pzr_mass_frac != null && s.pzr_mass_frac > 0) {
      m_liq = s.pzr_mass_frac * p2.M_rcs_kg;                       // the node's own currency
    } else {
      var lvl = (s.pzr_level_pct > 0 ? s.pzr_level_pct : cfg.pressurizer.pzr_level_nominal) / 100;
      m_liq = Math.max(0, Math.min(1, lvl)) * p2.V_pzr_m3 * rho_l_sat(Tsat);
    }
    var V_liq = Math.min(m_liq / rho_l_sat(Tsat), p2.V_pzr_m3);
    s.pzr_t_liq_c   = Tsat;                    // the pressurizer sits ON its saturation line
    s.pzr_m_liq_kg  = m_liq;
    s.pzr_m_stm_kg  = Math.max(1e-9, (p2.V_pzr_m3 - V_liq) * rho_g_sat(P));
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

    var P1 = settle(s, cfg);
    s.pzr_surge_kgps = io.surge_kgps || 0;
    return P1;
  }

  // settle — put the liquid ON its saturation line AND leave the state self-consistent.
  //
  // THE DEFECT THIS REPLACES, measured 2026-08-14 with the first gate this model ever had.
  // The line was `P1 = pressureFrom(s); s.pzr_t_liq_c = T_sat_from_P(P1)`, one pass. But
  // T_liq is an INPUT to the pressure: it sets rho_l, which sets V_liq, which sets the steam
  // volume. Assigning it after reading the pressure means the pressure returned is not the
  // pressure the state holds — off by 0.18 °C of saturation temperature on a relief step —
  // and the flash then chases it one step late. The signature was a two-step zigzag with
  // pressure RISING on alternate steps while steam was being drawn out:
  //
  //     t=1 2216.06 psia (Tl 344.523 vs Tsat 344.344) · t=2 2216.44 · t=3 2204.33
  //
  // A fixed point removes it: iterate T_liq = Tsat(P(T_liq)) until the temperature stops
  // moving. rho_l varies slowly with T, so it converges in three passes to ~1e-9 °C; the
  // loop is bounded at six and the tolerance is the exit. `run_pzr2.js` asserts the fixed
  // point directly (the pressure returned equals the pressure the state re-computes), which
  // is the check that would have caught the original — a numerical inconsistency is
  // invisible to any assertion about the physics being modelled.
  function settle(s, cfg) {
    var P = pressureFrom(s, cfg);
    for (var i = 0; i < 20; i++) {
      var T = T_sat_from_P(P);
      if (Math.abs(T - s.pzr_t_liq_c) < 1e-9) break;
      s.pzr_t_liq_c = T;
      P = pressureFrom(s, cfg);
    }
    return P;
  }

  function pressureFrom(s, cfg) {
    var V_liq = s.pzr_m_liq_kg / rho_l_sat(s.pzr_t_liq_c);
    var V_stm = Math.max(1e-6, cfg.pressurizer2.V_pzr_m3 - V_liq);
    return P_from_steam_density(s.pzr_m_stm_kg / V_stm);
  }

  // Solve the flash: how much mass crosses the interface so the books balance AT the
  // pressure that crossing produces.
  //
  //     E  =  m_flash · h_fg(P_new)  +  C · (Tsat(P_new) − Tsat(P_old))
  //
  // E is the node's departure from the OLD saturation line (heaters put it there). The
  // second term is what makes this implicit and is also what carries the OTHER driver:
  // when the mass phase alone has moved pressure — relief drawing steam, an outsurge
  // growing the bubble — Tsat(P_new) is already below Tsat(P_old) with E = 0, and the
  // liquid's sensible heat above the new saturation temperature is what boils.
  //
  // THE BRACKET WAS THE BUG, measured 2026-08-14. It was sized off |E| alone
  // (`span = |E|/h_fg · 1.5`), so with E = 0 the search interval was 1e-6 kg and the answer
  // was 1e-6 kg by construction. Thirty seconds of PORV flow drew 60 kg of steam and
  // flashed 0.2 kg of liquid — pressure fell 665 psi where a real pressurizer boils to hold
  // it up. That is the model's whole reason for existing (an outsurge flashes and partially
  // restores pressure — v1 spent `K_surge_level` to fake it), and it was disarmed by an
  // interval, not by a physics term. A bracket that cannot express the answer is
  // indistinguishable from a physics claim that the answer is zero.
  //
  // So: bracket by EXPANSION on the sign of the residual, capped at what the phases
  // physically hold, then bisect. R(mf) is monotone decreasing — more flash, more steam,
  // higher pressure, higher Tsat — so a sign change brackets the single root.
  function solveFlash(s, cfg, E, C, T0) {
    var p2 = cfg.pressurizer2;
    var mLiqCap = s.pzr_m_liq_kg * 0.9, mStmCap = s.pzr_m_stm_kg * 0.9;

    function resid(mf) {
      var mL = s.pzr_m_liq_kg - mf, mS = s.pzr_m_stm_kg + mf;
      if (mL <= 1e-6 || mS <= 1e-9) return -Infinity;
      // Price the candidate at the state it would actually produce — liquid volume at the
      // NEW saturation temperature, not the old one. Evaluating rho_l at T0 was the other
      // half of the zigzag `settle` fixes: the solve balanced its books against a pressure
      // the step then did not deliver. Same three-pass fixed point as `settle`.
      var Tn = T0, Vl, Pn = 15.41, Tp;
      for (var k = 0; k < 20; k++) {
        Vl = mL / rho_l_sat(Tn);
        Pn = P_from_steam_density(mS / Math.max(1e-6, p2.V_pzr_m3 - Vl));
        Tp = Tn; Tn = T_sat_from_P(Pn);
        if (Math.abs(Tn - Tp) < 1e-9) break;
      }
      return E - mf * h_fg(Pn) - C * (Tn - T0);
    }

    var r0 = resid(0);
    if (!isFinite(r0) || Math.abs(r0) < 1e-9) return 0;
    var lo, hi, step = Math.max(1e-4, Math.abs(E) / 1000), i;
    if (r0 > 0) {                       // needs flashing: walk the upper bound out
      lo = 0; hi = Math.min(step, mLiqCap);
      for (i = 0; i < 60 && resid(hi) > 0 && hi < mLiqCap; i++) hi = Math.min(hi * 2, mLiqCap);
    } else {                            // needs condensing: walk the lower bound out
      hi = 0; lo = -Math.min(step, mStmCap);
      for (i = 0; i < 60 && resid(lo) < 0 && -lo < mStmCap; i++) lo = Math.max(lo * 2, -mStmCap);
    }
    var mf = 0;
    for (i = 0; i < 60; i++) {
      mf = 0.5 * (lo + hi);
      if (hi - lo < 1e-9) break;                 // kg — far below anything the model resolves
      if (resid(mf) > 0) lo = mf; else hi = mf;
    }
    return mf;
  }

  // ======================================================== the surge line as a boundary
  //
  // WHAT THIS IS FOR (#474 must not be blocked). Today the pressurizer meets the loop at
  // three unnamed code sites: the identity `p_hotleg = pressure_mpa` (pwr_primary.js:30), a
  // one-step-late `_dmass_dt` in, and a WRITE-ONLY `_pzr_surge_flow` out. This function
  // replaces that with a named contract, so that when the loop becomes real nodes the surge
  // line is a SUBSTITUTION rather than a rewrite:
  //
  //   IN   `_surge_demand_m3s` / `_dmass_dt` / `_dTavg_dt`   the loop's displacement
  //        `_surge_t_c`                                       insurge enthalpy (hot leg)
  //        `p_hotleg`                                         tap pressure
  //   OUT  `pzr_surge_kgps`                                   realized flow, + = insurge
  //        `pressure_mpa`                                     the boundary's other half
  //        `pzr_tap_sat_margin_c`                             saturation margin AT THE TAP
  //
  // The margin is #474's addition (issue comment 5278211729): the board wants a derived
  // voided/liquid flag for the tap point, which needs the local margin rather than the
  // flow. It is computed here because here is where the tap pressure is known; when the
  // hot-leg node exists it becomes that node's property and this line is deleted.
  //
  // IT LIVES IN THIS FILE DURING THE BRIDGE, marked to move. Build-alongside means the
  // v1-path files stay untouched, so the lumped loop wears a node's interface until there
  // is a node — #474 inherits a CONTRACT, not a location.
  //
  // CURRENCY. v1 does all of this in LEVEL POINTS (%/s) because its level is a
  // reconstruction; v2 integrates liquid mass, so the demand has to come out in kg/s. The
  // conversion is the CV-3 identity and not a new constant: one point of level is
  // `M_rcs_kg / level_per_mass` = 25.5 kg, which is also 1 % of 4.292 m³ at 594 kg/m³. The
  // algebra above the conversion is v1's, term for term, so a TD-1/TD-2 drift during the
  // rebuild is a conversion bug and not a recalibration — which is the only reason the
  // ledger is ported rather than re-derived (spec §3.4: the void SOURCE is loop
  // bookkeeping, `pwr_primary.js:441`, and the loop is #474's scope).
  function voidCreditRate(s, cfg, dt) {
    var p = cfg.pressurizer;
    var v = s.primary_void_fraction || 0;
    var wref = p.void_weight_surge_ref;
    var w = (wref != null) ? wref / (wref + (s.leak_flow || 0)) : 1;
    var before = (s._pzr_void_lvl != null) ? s._pzr_void_lvl : p.level_per_void * w * v;
    if (!s._pzr_dep && (s.leak_flow || 0) > 0) s._pzr_dep = true;
    var c;
    if (!s._pzr_dep) {
      // NEVER-LEAKED: the state form, with w === 1 exactly. The stuck-PORV / safeties /
      // loss-of-heat-sink families — the calibrated TMI arc — keep v1's line exactly.
      c = p.level_per_void * w * v;
    } else {
      // ONCE A LEAK HAS FLOWED the credit is a FLOW: growth takes the admittance split
      // (the (1−w) share left through the hole and is not owed back), collapse returns
      // UNWEIGHTED (the condensing loop pulls its liquid back through the surge line — the
      // hole cannot supply it), floored at zero. Growth <= collapse keeps the credit under
      // level_per_void·void inductively, so there is no cap constant and no ratchet.
      var pv = (s._pzr_prev_void != null) ? s._pzr_prev_void : v;
      var dv = v - pv;
      c = before + p.level_per_void * (dv > 0 ? w * dv : dv);
      if (c < 0) c = 0;
    }
    s._pzr_void_lvl = c;
    s._pzr_prev_void = v;
    return dt > 0 ? (c - before) / dt : 0;      // level points per second
  }

  function surgeDemand(s, cfg, dt) {
    var p = cfg.pressurizer, p2 = cfg.pressurizer2;

    // THERMAL — the re-expression of `level_per_tavg`, keeping #384 stage 4's suppression.
    // `levelBase` floors below ~293 °C (the #289 cold-modes stand-in), so on a cold solid
    // plant the level line credits NO room from thermal contraction while a raw `_dTavg_dt`
    // reading goes on crediting it — two accountings of one vessel, and the road by which
    // inventory once rode a cooldown to the mass_max clip. Same narrow predicate as v1:
    // solid, base ON its floor, and contracting.
    var thermal = p.level_per_tavg * (s._dTavg_dt || 0);
    var solidNow = s.pzr_m_liq_kg != null &&
                   (s.pzr_m_liq_kg / rho_l_sat(s.pzr_t_liq_c)) >= p2.V_pzr_m3;
    if (thermal < 0 && solidNow && V1.levelBase(s, cfg) <= p.level_prog_floor + 1e-9) thermal = 0;

    // INVENTORY — `_dmass_dt` is the loop's realized rate, read ONE STEP LATE (inventory is
    // engine step 9, this is step 7 — the CONTEXT §11 explicit coupling). RELIEF IS ALREADY
    // ADDED BACK by `stepInventory` (`dm_surge = dm + porv_flow + safety_flow`,
    // pwr_primary.js:396), which is what makes "relief is not surge" true upstream of here;
    // adding it again would double-count it.
    var inventory = p.level_per_mass * (s._dmass_dt || 0);

    var lvl_rate = thermal + inventory + voidCreditRate(s, cfg, dt);
    return lvl_rate * (p2.M_rcs_kg / p.level_per_mass);        // kg/s, + = insurge
  }

  // The tap's local saturation margin — positive is subcooled. `p_hotleg` is the identity
  // `pressure_mpa` today (pwr_primary.js:30) and becomes the hot-leg node's own pressure at
  // #474; reading it through this accessor is what makes that a substitution.
  function tapSatMargin(s) {
    var P = (s.p_hotleg != null) ? s.p_hotleg : s.pressure_mpa;
    var T = (s.thot_c != null) ? s.thot_c : s.tavg_c;
    if (!(P > 0) || T == null) return null;
    return T_sat_from_P(P) - T;
  }

  // ========================================================== the step, and its three regimes
  //
  // v1's `stepPressure` is ~300 lines that sum four accreted authorities into one `dP` and
  // integrate it. v2 has three REGIMES, each owning its own physics, and the branch is the
  // structure rather than a patch:
  //
  //   SATURATED / BLOWDOWN   ported nearly verbatim from v1. Its subject is the LOOP
  //                          flashing wearing a pressurizer address (`K_sat_pull` pins
  //                          pressure at Psat(Tavg); `K_break_vent` and the containment
  //                          floor handle an open hole). Re-deriving it means modelling
  //                          loop flashing, which is #474. A DECLARED NARROWING of scope B,
  //                          spec §2.8.
  //   SOLID                  no bubble: dP = bulk modulus x (net volume change / volume).
  //                          Spray and heater flashing are zero BY CONSTRUCTION here, which
  //                          is the four separately-gated solid patches (#346, #347, #361,
  //                          2026-08-07) collapsing into one regime.
  //   BUBBLED                `stepRegions` — two regions, saturation between, pressure read
  //                          off the steam. This is the rebuild.
  //
  // WHAT IS GONE: `P_restore_rate_gain`. Nothing replaces it (spec §5). Its own comment
  // called it a stand-in for heater and charging authority; charging is CVCS's channel and
  // always was, and heater authority is now the heaters acting through real thermodynamics.
  // Pressure-holding becomes the automatic channel's job, which is what MO-2b asserts and
  // what Phase 1 showed the channel is not currently doing (heaters peak at 1.77 % on a trip
  // while the term holds 2235 psi flat). Removing it is what makes the controller's own
  // probes mean anything.
  //
  // THE SEAM. The two ported branches set pressure by a dP law rather than from the regions,
  // so on the way out they RE-SEED the regions to the state they just described — otherwise
  // a return to the bubbled branch would resume from stale masses. `reseed` is that, and it
  // is deliberately the same function `ensureRegions` uses, so a seam crossing and a fresh
  // start produce identical states. Seam flicker at the predicate boundary is the #384 class
  // of risk and CA-20's fences are what watch for it.
  function reseed(s, cfg, level_pct) {
    var p2 = cfg.pressurizer2;
    var P = Math.max(0.1, s.pressure_mpa);
    var Tsat = T_sat_from_P(P);
    var V_liq = Math.max(0, Math.min(1, level_pct / 100)) * p2.V_pzr_m3;
    s.pzr_t_liq_c = Tsat;
    s.pzr_m_liq_kg = V_liq * rho_l_sat(Tsat);
    s.pzr_m_stm_kg = Math.max(1e-9, (p2.V_pzr_m3 - V_liq) * rho_g_sat(P));
    s.pzr_mix_deficit_kj = 0;
  }

  function stepPressure(s, cfg, dt) {
    var p = cfg.pressurizer, p2 = cfg.pressurizer2;
    ensureRegions(s, cfg);

    // Control and hydraulics run first and are v1's, unchanged. 3b is the MANUAL-first half
    // (CLAUDE.md's standing testing-order directive): the acceptance rows fix heater and
    // spray demand by command, so what `autoControl` decides is not under test here. 3c is
    // where the channel is ported and asserted to hold what manual proved.
    var spEff = V1.effectiveSetpoint(s, cfg, dt);
    V1.autoControl(s, cfg, spEff);
    V1.relief(s, cfg);

    // DELIVERED spray — v1's authority taper kept verbatim, including the indication split
    // (#350): `spray_flow_pct` publishes what the nozzle passes, and the solid regime removes
    // the spray's pressure AUTHORITY without pretending the valve shut.
    var spray_floor = V1.P_sat_from_T(s.thot_c != null ? s.thot_c : s.tavg_c);
    var spray_authority = clip((s.pressure_mpa - spray_floor) / (p.spray_floor_band || 1.0), 0, 1);
    var spray_eff = (s.spray_flow_frac || 0) * clip(s.flow_frac != null ? s.flow_frac : 1, 0, 1) * spray_authority;
    s.spray_flow_pct = clip(spray_eff / (p.spray_flow_max || 1), 0, 1.1) * 100;

    // ---- REGIME. Same predicates as v1, so the seam sits where every probe expects it.
    var p_sat_tavg = V1.P_sat_from_T(s.tavg_c);
    var saturated = (s.primary_void_fraction > 0) || (p_sat_tavg > s.pressure_mpa);
    var V_liq = s.pzr_m_liq_kg / rho_l_sat(s.pzr_t_liq_c);
    var solid = !saturated && V_liq >= p2.V_pzr_m3;
    var surge_kgps = surgeDemand(s, cfg, dt);
    s.pzr_tap_sat_margin_c = tapSatMargin(s);

    if (saturated) {
      // ---- PORTED: the loop is two-phase and the loop decides. A liquid cannot superheat,
      // so flashing PINS pressure at Psat(Tavg) and the operator depressurizes by COOLING.
      // With a hole in the loop the pin weakens as void approaches 1 (the steam the flash
      // makes LEAVES) and a vent term takes the RCS down to containment backpressure —
      // WTSM 5.0 §5.0.1.1. Constants and comments live in v1's block during the bridge.
      var loopBreak = (s._leak_base > 0) && !s._leak_to_sg;
      var pb_vent = s.containment_pressure_mpa != null ? s.containment_pressure_mpa : p.P_containment;
      var vf = s.primary_void_fraction || 0;
      var vfVent = Math.max(vf, Math.min(1, Math.max(0, 1 - (s._mass != null ? s._mass : 1))));
      var p_pin = loopBreak ? Math.max(p_sat_tavg, pb_vent) : p_sat_tavg;
      var dP = p.K_sat_pull * (loopBreak ? (1 - vfVent) : 1) * (p_pin - s.pressure_mpa)
             - (s.porv_flow || 0) * p.K_porv_relief
             - (s.safety_flow || 0) * p.K_safety_relief;
      if (loopBreak && p.K_break_vent) {
        dP -= p.K_break_vent * (s.leak_flow || 0) * vfVent * Math.max(0, s.pressure_mpa - pb_vent);
      }
      s.pressure_mpa = Math.max(0.1, s.pressure_mpa + dP * dt);
      if (loopBreak) s.pressure_mpa = Math.max(s.pressure_mpa, Math.min(pb_vent, 15.41));
      // The vessel's own inventory still moves on the surge; level is the loop's story here.
      s.pzr_m_liq_kg = Math.max(1e-6, s.pzr_m_liq_kg + surge_kgps * dt);
      reseed(s, cfg, 100 * (s.pzr_m_liq_kg / rho_l_sat(T_sat_from_P(s.pressure_mpa))) / p2.V_pzr_m3);

    } else if (solid) {
      // ---- SOLID: no bubble, so the same displacement compresses water. dP is the bulk
      // modulus times the fractional volume change. Spray has NO pressure authority here and
      // the heaters cannot flash — both fall out of the branch rather than being fenced by a
      // patch, which is the point of having a regime at all. Relief draws LIQUID and pays the
      // same stiffness (the 2026-08-07 ruling: a vented mass releases bulk-modulus pressure
      // when there is no bubble to absorb it).
      var relief_kgps = ((s.porv_flow || 0) + (s.safety_flow || 0)) * p2.M_rcs_kg;
      var dV = (surge_kgps - relief_kgps) * dt / rho_l_sat(s.pzr_t_liq_c);      // m³ this step
      var dPs = p2.bulk_mod_eff_mpa * (dV / p2.V_pzr_m3);
      // SUB-STEP RATHER THAN SOFTEN THE GAIN. A ringing solid branch is an integrator
      // problem; lowering the stiffness to quiet it would be re-tuning the plant's
      // incompressibility to suit a time step (spec §2.7).
      var sub = Math.min(64, Math.max(1, Math.ceil(Math.abs(dPs) / 0.05)));
      for (var i = 0; i < sub; i++) {
        s.pressure_mpa = Math.max(0.1, s.pressure_mpa + dPs / sub);
      }
      s.pzr_m_liq_kg = Math.max(1e-6, s.pzr_m_liq_kg + (surge_kgps - relief_kgps) * dt);
      s.pzr_m_stm_kg = 1e-9;
      s.pzr_t_liq_c = T_sat_from_P(s.pressure_mpa);

    } else {
      // ---- BUBBLED: the rebuild. Spray is a MASS with an enthalpy, not a gain; relief is a
      // steam draw; the heaters put joules into the liquid and the metal. Nothing here is a
      // fitted authority and there is nowhere to put one.
      var relief_kg = ((s.porv_flow || 0) + (s.safety_flow || 0)) * p2.M_rcs_kg;
      s.pressure_mpa = stepRegions(s, cfg, dt, {
        surge_kgps: surge_kgps,
        surge_t_c: (s._surge_t_c != null) ? s._surge_t_c : (s.thot_c != null ? s.thot_c : s.tavg_c),
        spray_kgps: spray_eff * p2.spray_capacity_kgps,
        spray_t_c: (s.tcold_c != null) ? s.tcold_c : s.tavg_c,
        relief_kgps: relief_kg,
        heater_frac: (s._heater_dp_frac != null ? s._heater_dp_frac : s.heater_power_frac) || 0
      });

      // A HOLE IN THE LOOP DEPRESSURIZES THE BUBBLE, and leaving this out was a defect —
      // measured 2026-08-15, found by CA-15's leg and confirmed on a real break.
      //
      // The reasoning that dropped it was: the leak is already in `_dmass_dt`, so it arrives
      // as an outsurge and the bubble grows, so a separate term would double-count. The
      // first half is true and the conclusion is still wrong, because of what the regions
      // CANNOT do: steam has no way out of this vessel except the relief valves. So as the
      // loop empties, the pressurizer's liquid drains away and its steam simply stays,
      // holding pressure up — and pressure staying up keeps the loop SUBCOOLED, which keeps
      // `primary_void_fraction` at 0, which keeps the saturated/blowdown branch from ever
      // firing. Measured on a severity-0.8 large break: core inventory 0.0 %, void 0.0,
      // pressure PINNED at 1871 psi for fifteen minutes, accumulators never dumping.
      // Circular, and stable, and wrong.
      //
      // The physical version is steam venting DOWN THE SURGE LINE to the hole, which needs
      // the loop to be a node that can hold steam — #474. Until then this is v1's fitted
      // stand-in, ported with its constant, and it is declared as a stand-in rather than
      // dressed up: `K_leak_depressurize` is a gain, and the reason it survives the rebuild
      // is that the thing it stands for is outside the rebuild's scope.
      //
      // Gated to the bubbled branch exactly as v1 gates it — the saturated branch has its
      // own vent term and the solid branch has no bubble to depressurize.
      var leak_depress = (p.K_leak_depressurize || 0) * (s.leak_flow || 0);
      if (leak_depress > 0) {
        s.pressure_mpa = Math.max(0.1, s.pressure_mpa - leak_depress * dt);
        reseed(s, cfg, 100 * (s.pzr_m_liq_kg / rho_l_sat(s.pzr_t_liq_c)) / p2.V_pzr_m3);
      }
    }

    s.pzr_surge_kgps = surge_kgps;
    return s.pressure_mpa;
  }

  // stepLevel — LEVEL IS GEOMETRY NOW. v1 reconstructs it from a base line plus three fitted
  // slopes; v2 divides the liquid volume by the vessel's. `pzr_mass_frac` keeps its meaning
  // and its currency (a share of RCS mass, never a second inventory), so `ui/app.js:251-271`
  // and the migration path keep working.
  function stepLevel(s, cfg, dt) {
    var p2 = cfg.pressurizer2;
    ensureRegions(s, cfg);
    var lvl = 100 * (s.pzr_m_liq_kg / rho_l_sat(s.pzr_t_liq_c)) / p2.V_pzr_m3;
    s.pzr_mass_frac = s.pzr_m_liq_kg / p2.M_rcs_kg;
    s._pzr_surge_flow = s.pzr_surge_kgps != null ? s.pzr_surge_kgps / p2.M_rcs_kg : 0;
    s.pzr_level_pct = clip(lvl, 0, 100);
  }

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

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
    // the node boundary (#474 inherits this contract; the implementation moves)
    surgeDemand:      surgeDemand,
    voidCreditRate:   voidCreditRate,
    tapSatMargin:     tapSatMargin,
    pressureFromRegions: function (s, cfg) {
      var V_liq = s.pzr_m_liq_kg / rho_l_sat(s.pzr_t_liq_c);
      var V_stm = Math.max(1e-6, cfg.pressurizer2.V_pzr_m3 - V_liq);
      return P_from_steam_density(s.pzr_m_stm_kg / V_stm);
    },
    // step entry points (pwr_engine.js:508 / :540 / :542, and :1992 with dt=0)
    stepPressure:     stepPressure,
    stepLevel:        stepLevel,
    stepTailpipe:     function (s, cfg, dt)   { return V1.stepTailpipe(s, cfg, dt); },
    reseed:           reseed,
    // control + hydraulics — PORTED UNCHANGED in 3b. `relief()` is recent, sourced and not
    // implicated (block valve, porv_stuck_frac, sqrt-dp against live containment); the
    // control channel is 3c's, per the manual-first directive.
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
