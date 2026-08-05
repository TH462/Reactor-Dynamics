/*
 * pwr_thermal.js — fuel and coolant temperatures, true subcooling, DNB, and the
 * fuel-damage / melt endpoint (M1 §6.1–6.3, §6.10). Pure functions over the
 * engine's true-physics state `s` and config `cfg`; the engine calls them in the
 * §5 dependency order. SI throughout (°C, MPa).
 *
 * Attaches RD.pwrThermal.
 */
;(function (RD) {
  'use strict';

  // Saturation temperature, °C from MPa. The M1 §6.3 snippet's /145.038 and
  // -273.15 were psia/Kelvin residue; 179.47·P^0.239 (P in MPa) returns °C and
  // matches steam tables to ±2 °C over 5–17 MPa (e.g. 15.41 MPa → 345 °C).
  function T_sat(P_MPa) { return 179.47 * Math.pow(Math.max(P_MPa, 1e-6), 0.239); }

  // True subcooling (physics) — drives voiding (§6.5). Uses TRUE P and Tavg.
  function trueSubcooling(s) { return T_sat(s.pressure_mpa) - s.tavg_c; }

  // Effective fuel→coolant coupling: degrades on DNB and on core uncovery (§6.1, §6.5).
  // DNB is judged at the CORE EXIT, on the MIXED-MEAN outlet — `_subcool_hot_c`, from
  // last step (explicit coupling, CONTEXT §11) — which is what makes DNB reachable at
  // power (steam-line-break / loss-of-flow), where the bulk Tavg never approaches
  // saturation. Falls back to the bulk margin before the first step.
  //
  // THE DATUM IS THE MIXED MEAN, NOT THE HOT CHANNEL, and this comment said otherwise
  // until 2026-08-05 (#368). `thot_raw = tavg + delta_T_rated·Q/flow / 2` (stepCoolant)
  // is the mixed core outlet; a real DNBR is evaluated at the LIMITING ASSEMBLY, which
  // runs hotter than the mixed mean by the nuclear enthalpy-rise hot-channel factor. So
  // this lumped datum reaches the threshold LATER than a real core's hot channel would,
  // for the same margin.
  //
  // That is not necessarily a physics error, and the difference was not resolved: the
  // threshold `dnb_margin_c` is `[tune]` and is arbitrated by the at-power scenarios, so
  // a margin set on the mixed mean plausibly ABSORBS the peaking factor implicitly. The
  // factor itself is UNSOURCED — WTSM 19 (ML11223A342) lists "Nuclear Enthalpy Rise Hot
  // Channel Factor" as a Tech Spec section heading with no value, WTSM 3.2 (ML11223A213)
  // gives the DNBR limit ("greater than 1.3") but no enthalpy-rise factor. Reopening
  // `dnb_margin_c` needs a retrieved factor first, and is a tuning question against those
  // scenarios rather than a bug fix. Measured negative result (#368): on the plant's
  // designed 100 % load rejection the hot-leg margin bottoms at 32.6 F (18.1 C) against
  // the 14.4 F (8.0 C) threshold — the mechanism does not fire when it should not.
  function hFcEffective(s, cfg) {
    var t = cfg.thermal;
    var margin = (s._subcool_hot_c != null) ? s._subcool_hot_c : trueSubcooling(s);
    var h = (margin <= t.dnb_margin_c) ? t.h_fc_dnb : t.h_fc;     // DNB near the exit saturation
    var mass = s.core_inventory_pct / 100;
    if (mass < cfg.primary.significant_uncover) {                  // < 0.50: heat transfer collapses → 0
      h = Math.min(h, t.h_fc * (mass / cfg.primary.significant_uncover));
    }
    return h;
  }

  // Step 5 — fuel temperature. Heat source is total heat (fission + decay), so
  // post-scram decay heat keeps the fuel hot (the TMI uncovery heatup).
  function stepFuel(s, cfg, dt) {
    var t = cfg.thermal;
    // PAST MELT THE INTEGRATION STOPS (#326, 2026-08-04). `melted` is the end of this
    // model's declared validity — CONTEXT.md and Manuals/12 §5.5 both say the simulation
    // ends at fuel damage — and BOTH core-material nodes run away without a termination
    // condition, in different ways. THIS one is a pure integrator: once the core is fully
    // uncovered `hFcEffective` returns 0 (h_fc x mass/significant_uncover, mass = 0), so
    // the line below loses its only sink and becomes `dTf = Q_total * heat_gen_coeff` with
    // nothing on the other side. Measured on an unmitigated large break, full stack:
    // 5032 C (9089 F) at 2 h and still climbing linearly on a decay tail of 1.87 %.
    // See stepCladding for the other half, which is worse and is not a follower of this.
    if (s.melted) return;
    var h_eff = hFcEffective(s, cfg);
    s._h_fc_eff = h_eff; // remembered for the coolant node (energy-consistent)
    var Q_total = s._Q_total; // P_fission + H_total, set by the engine (step 4)
    var dTf = Q_total * t.heat_gen_coeff - h_eff * (s.fuel_temp_c - s.tavg_c);
    s.fuel_temp_c += dTf * dt;
  }

  // Step 6 — coolant average temperature (two-node) and hot/cold legs.
  function stepCoolant(s, cfg, dt) {
    var t = cfg.thermal;
    var h_eff = s._h_fc_eff != null ? s._h_fc_eff : t.h_fc;
    var Q_fuel_to_coolant = h_eff * (s.fuel_temp_c - s.tavg_c);
    // Secondary temperature from the previous step (explicit coupling, CONTEXT §11).
    // Pure ΔT coupling, NO load gate: at no load the secondary saturates up until
    // tsec ≈ tavg (steam pressure rises to the no-load point, held by the steam
    // dump), so heat transfer dies away naturally; drawing steam lowers tsec and
    // opens the ΔT — the real PWR secondary characteristic. (The old binary
    // idle-gate slammed a rated-capacity sink onto the core at 1% power — the
    // quench-cooldown/pzr-level trip that made low-power work feel booby-trapped.)
    // SG tube-bundle uncovery (TR-3 / the TMI dryout mechanism, feel-plan P5):
    // heat transfer needs wetted tubes. As the WIDE-range level falls below the
    // uncovery threshold the bundle progressively dries and Q collapses toward a
    // small steam-side residual — a dry SG is NOT a heat sink, which is exactly
    // what turns a blocked-AFW loss of feed into the TMI repressurization. Normal
    // ops (wide ≈ 55-65) and the AFW hold (wide ≈ 40) sit above the threshold.
    // The steam-side residual itself DEPLETES when the bundle stays dry and unfed
    // (s.sg_dry_deplete, stepped by pwr_steam_generator; previous step — explicit
    // coupling): a sustained total loss of feed genuinely loses the heat sink
    // (MD-6), while a fed dry transit (TR-2, AFW running) keeps the full residual.
    var _wide = s.sg_level_wide_pct != null ? s.sg_level_wide_pct : 50;
    var _wet = _wide >= (t.sg_dryout_wide_pct || 30) ? 1
             : Math.max(0, _wide / (t.sg_dryout_wide_pct || 30));
    var _resid = (t.sg_dryout_residual || 0.05) * (1 - (s.sg_dry_deplete || 0));
    var _dry_factor = _resid + (1 - _resid) * _wet;
    var Q_coolant_to_sg = t.h_sg * s.flow_frac * _dry_factor * (s.tavg_c - s.t_secondary_c);
    // REVERSE flow (SG hotter than the primary — e.g. a cold RCS with the
    // secondary at atmospheric saturation ~100 °C) transfers poorly: the
    // boiling regime that gives the SG its rated conductance only exists
    // primary→secondary; backwards it is condensate-film/natural convection.
    // Without this, starting RCPs on a cold plant let the Tsat-floored
    // secondary back-heat the primary at ~1 °C/s forever (an infinite-
    // reservoir artifact the old fire-hose spray masked as a pressure spike).
    if (Q_coolant_to_sg < 0) Q_coolant_to_sg *= (t.sg_reverse_frac || 0.05);
    s._Q_coolant_to_sg = Q_coolant_to_sg;
    // Residual Heat Removal (RHR, §6.9): the low-pressure shutdown-cooling loop.
    // Active = the hot-leg suction valve is open (s.rhr_active; the valve interlock
    // already guarantees pressure is within the RHR band, so no pressure gate here).
    // Heat removed scales with the HX flow split (set_rhr_hx): the operator throttles
    // cooldown rate by routing more/less of the constant loop flow through the heat
    // exchanger vs. the bypass. Draws the coolant node toward the cooldown sink.
    var e = cfg.emergency, Q_rhr = 0;
    if (s.rhr_active && s.condenser_cooling_available) {
      var hxFrac = (s.rhr_hx_fraction != null ? s.rhr_hx_fraction : 1);
      // The RHR heat exchanger rejects to the same circulating water the condenser uses, so
      // its sink temperature moves with the CW inlet: warm circ water raises the floor a
      // cooldown can reach and slows the approach to it. Referenced to cw_inlet_ref_c so the
      // default is the calibrated rhr_sink_c exactly.
      var tbc = (cfg.turbine || {});
      var cwRef = tbc.cw_inlet_ref_c != null ? tbc.cw_inlet_ref_c : 26.7;
      var cwNow = s.cw_inlet_temp_c != null ? s.cw_inlet_temp_c : cwRef;
      var sink = e.rhr_sink_c + (cwNow - cwRef);
      Q_rhr = e.rhr_gain * hxFrac * Math.max(0, s.tavg_c - sink);
    }
    // RCP heat: pump shaft work deposited in the coolant, scaled by flow — the
    // real no-load heat source (heats the plant if the heat sink is isolated),
    // and its loss slightly speeds a post-trip cooldown.
    var Q_pump = t.heat_gen_coeff * (t.pump_heat_frac || 0) * s.flow_frac;
    var dTavg = (Q_fuel_to_coolant + Q_pump - Q_coolant_to_sg - Q_rhr) / t.coolant_heat_capacity;
    // Cold ECCS injection quench (§6.2/§6.3): HPI/LPI and the accumulators inject borated
    // RWST/SIT water well below Tavg, removing sensible heat as it mixes — the thermal
    // shock of a large-break accumulator dump. Perfect-mixing pull of Tavg toward
    // eccs_temp_c at the injection throughput rate stashed by stepInventory (inventory-
    // frac/s, PREVIOUS step — explicit coupling), scaled by eccs_cooling_gain. Added as a
    // direct °C/s contribution (already a fractional-throughput × ΔT rate, so NOT divided
    // by coolant_heat_capacity like the power terms). Self-limiting: cools no further than
    // eccs_temp_c, and is exactly 0 when no injection is flowing. RHR is not here — it is
    // recirculation (Q_rhr above), not cold make-up.
    var q_inj = s._eccs_inj_inv || 0;
    if (q_inj > 0 && e.eccs_temp_c != null) {
      dTavg += (e.eccs_cooling_gain != null ? e.eccs_cooling_gain : 0) * q_inj * (e.eccs_temp_c - s.tavg_c);
    }
    // Break blowdown FLASH-cooling (§6.2/§6.3): coolant leaving a primary break (s.leak_flow)
    // carries enthalpy, and the remaining inventory FLASHES to replace it, removing latent heat.
    // Self-limiting perfect-mixing pull of Tavg toward blowdown_sink_c (containment saturation)
    // at the break throughput rate, scaled by blowdown_gain — the SAME form as the ECCS quench
    // above. Keyed on leak_flow, so a stuck-open PORV vents the steam space with leak_flow = 0
    // and the flagship TMI path is untouched. Cannot cool below blowdown_sink_c.
    //
    // SATURATION-GATED (#363, 2026-08-05), AND IT IS THE SAME GATE THE PRESSURE SIDE ALREADY
    // HAD. Flashing removes latent heat only while the fluid is AT saturation. Once the residual
    // inventory is subcooled at RCS pressure nothing flashes and this term must stop — it was
    // keyed on `leak_flow > 0` alone, so it kept pulling bulk Tavg toward a fixed 230 F (110 C)
    // sink through a plant that had long since stopped boiling. MEASURED full stack before the
    // gate, a 2 % break at 20 min: Tavg 225.6 F (107.5 C) at 1583 psi (10.92 MPa) with void 0 —
    // 378.4 F (210.2 C) of subcooling with a break open, falling monotonically from 579.3 F
    // (304.1 C). Half of one break's physics was regime-aware and the other half was not:
    // `stepPressure` has gated `leak_depress` on `saturated` all along.
    //
    // `trueSubcooling(s) <= 0` IS THAT TEST, not a second opinion about it. stepPressure asks
    // `P_sat(Tavg) > P`; T_sat and P_sat_from_T are exact inverses (179.47·P^0.239 and its
    // reciprocal power), so `P_sat(Tavg) > P` <=> `Tavg > T_sat(P)` <=> `trueSubcooling < 0`.
    // Written in THIS file's own currency rather than importing the pressure spelling, which
    // would be a second copy of the formula. The one deliberate difference is the boundary:
    // `<= 0` includes exactly-saturated, where flashing does occur, against stepPressure's
    // strict `>` — a measure-zero disagreement, and the physical side of it.
    //
    // Both inputs are ONE STEP OLD and that is the house convention, not an oversight: this is
    // step 6, `pressure_mpa` is written by stepPressure (step 7) and `primary_void_fraction` by
    // stepInventory (step 9), so stepPressure reads the same stale void this does (CONTEXT §11
    // explicit coupling).
    var q_leak = s.leak_flow || 0;
    var flashing = (s.primary_void_fraction > 0) || trueSubcooling(s) <= 0;
    if (q_leak > 0 && flashing && t.blowdown_gain) {
      dTavg += t.blowdown_gain * q_leak * ((t.blowdown_sink_c != null ? t.blowdown_sink_c : 100) - s.tavg_c);
    }
    s.tavg_c += dTavg * dt;
    s._dTavg_dt = dTavg; // pressurizer surge uses this (thermal expansion)

    // Hot/cold leg split. The RAW enthalpy rise (∝ power/flow) can exceed what
    // subcooled liquid can carry — at very low flow it is nonphysically large. The
    // core exit therefore pins at saturation (Tsat): the split is capped at the value
    // that puts thot exactly there, keeping both legs consistent around tavg, while the
    // raw exit overshoot (below) is carried as the DNB / core-boiling driver.
    //
    // THE DRIVER IS TOTAL CORE HEAT (_Q_total), NOT power_pct (#315, 2026-08-03).
    // power_pct is FISSION power alone. In steady state the two are equal by
    // construction (engine step 4), so this read correctly at power for the life of
    // the project — and wrongly the instant the rods dropped. Measured, full stack,
    // three plant-minutes after a scram with full forced flow: the core was removing
    // 6.6 % of rated heat and the split computed 0.0 °F. Indicated, that put the COLD
    // leg above the HOT leg in 48.3 % of 1500 samples — the true signal was exactly
    // zero and instrument noise was all that was left. Under loss of flow it is worse:
    // 3.8 °F against the 44.4 °F the removed heat implies.
    //
    // This makes the split CONSISTENT WITH THE TWO LINES ABOVE IT rather than adding a
    // claim: stepFuel already runs on _Q_total, and the Tavg balance already runs on
    // the actual fuel→coolant flux. The split was the one line still reading flux.
    // At rated _Q_total is exactly 1.0, so delta_T_rated needs no recalibration and
    // no at-power behaviour moves — measured byte-identical over 10 min at HFP.
    //
    // NOT the instantaneous fuel→coolant flux — a RULED question now, not an open one
    // (#315 §6, closed 2026-08-03; owner: "Do as you recommend"). Three measured reasons:
    //
    //   1. SOURCED, against the primary. WTSM 12.2 (ML11223A301, USNRC HRTD Rev 0109)
    //      prints the whole OTΔT/OPΔT setpoint equations, and the ONLY dynamic
    //      compensation in either is on Tavg — "(1+τ₁S)/(1+τ₂S) = function generated by
    //      the lead-lag controller for Tavg dynamic compensation" and "τ₃S/(1+τ₃S) =
    //      function generated by the rate-lag controller for Tavg dynamic compensation".
    //      NOTHING compensates the measured ΔT, and the document contains no RTD,
    //      thermowell or transport-lag term at all. The real channel therefore treats
    //      loop ΔT as a DIRECT, uncompensated measure of core power — the document says
    //      so in as many words: "the calculated loop ΔT, a measure of reactor power".
    //      Putting a ~20 s fuel lag into that signal makes it a worse measure of core
    //      power, which is the one job the real design gives it.
    //   2. MEASURED COST. Corrected flux form (flux ALONE — see 3), full load rejection:
    //      the plant still rides out, but the OTΔT margin falls 18.4 % → 1.8 % of rated ΔT.
    //      Not fixable by speeding the fuel node up either: h_fc 0.05 → 0.10 with
    //      heat_gen_coeff doubled to hold 389 °C at rated gives run_otdt 21/39 and a scram
    //      at 1 s on `tavg high`. Those two constants are jointly calibrated.
    //   3. THE FIRST FLUX FORM WAS WRONG ANYWAY, and TR-7b caught it: it included Q_pump.
    //      Pump heat is deposited AT THE PUMP, between the SG outlet and the core inlet —
    //      it lifts both legs equally and creates no rise ACROSS THE CORE. Including it
    //      over-stated ΔT by exactly the pump-heat fraction (+8.9 % at t+3 min).
    var Tsat = T_sat(s.pressure_mpa);
    var delta_T_raw = t.delta_T_rated * (s._Q_total != null ? s._Q_total : s.power_pct / 100)
                    / Math.max(s.flow_frac, t.flow_floor);
    var thot_raw = s.tavg_c + delta_T_raw / 2.0;
    s._subcool_hot_c = Tsat - thot_raw;                     // exit margin to saturation (may go < 0)
    var delta_T = Math.min(delta_T_raw, Math.max(2 * (Tsat - s.tavg_c), 0));
    s.thot_c = s.tavg_c + delta_T / 2.0;                    // = min(thot_raw, Tsat)
    s.tcold_c = s.tavg_c - delta_T / 2.0;

    s.subcooling_c = trueSubcooling(s); // true diagnostic value (bulk; mirrors the instrument)
  }

  // Step 14a — partial-uncovery hot node (#213): peak cladding temperature of the
  // exposed (uppermost) fuel region. The bulk fuel node above averages the WHOLE
  // core, so a core held partially uncovered (inventory between significant_uncover
  // and core_top_uncover) read as fully cooled and could sit there forever — while
  // at TMI-2 exactly that condition (top ~half exposed under an hour) failed the
  // cladding and melted part of the core. Exposed clad is steam-cooled only: it
  // heats at the local decay-heat rate (lumped: total heat × uncovered fraction)
  // against weak convection toward Tsat. When the core re-covers, the node quenches
  // back to the wetted-core temperature on the reflood timescale. Below
  // significant_uncover the fraction saturates at 1 and this node keeps cooking
  // alongside the existing bulk h_fc collapse — one consistent story, no handoff.
  function stepCladding(s, cfg, dt) {
    var t = cfg.thermal, p = cfg.primary;
    if (s.clad_temp_c == null) s.clad_temp_c = (s.thot_c != null ? s.thot_c : s.tavg_c); // lazy init (new field; old saves)
    // PAST MELT THE INTEGRATION STOPS (#326, 2026-08-04) — see stepFuel for the rule.
    // This node's runaway is the OXIDATION term's, and the "self-limits, never needs a
    // cap" claim eleven lines down was measurably WRONG above melt. q_ox works out to
    // `q_ref * arr / w`: the oxide w self-limits only as fast as sqrt(integral), while
    // `arr` is Arrhenius in clad_temp_c itself, so once the node's own heat outruns the
    // sink the exponential beats the square root and there is no fixed point. Measured on
    // an unmitigated large break, full stack: oxidation heat reaches 1095 % OF RATED at
    // 30 min and clad_temp_c 355 618 C (640 144 F) at 2 h — eleven times the reactor's
    // full power out of a core making 4 % decay heat, which is not a plant number in any
    // regime. It is NOT a follower of the fuel node the way it is below melt: at 20 min it
    // measured 2308 C against fuel at 1852 C, 456 C clear of the `clad < fuel` clamp below.
    if (s.melted) return;
    var mass = s.core_inventory_pct / 100;
    var f_unc = (p.core_top_uncover - mass) / (p.core_top_uncover - p.significant_uncover);
    f_unc = f_unc < 0 ? 0 : (f_unc > 1 ? 1 : f_unc);
    // Published (#213/#238 observability, 2026-08-03). Both of these were LOCAL to this
    // function, and they are the two hidden drivers of the whole core-damage story: the
    // uncovered fraction is what exposes the hot node at all, and the oxidation heat is
    // what turns a hot core into a melting one. `clad_temp_c` and `fuel_damaged` were the
    // only visible parts, i.e. the symptom and the verdict with the mechanism missing.
    //
    // Published rather than re-derived in the Physics tab: f_unc reads three config
    // constants (`core_top_uncover`, `significant_uncover`, `core_inventory_pct`) and
    // q_ox reads five more, and a formula copied into a consumer does not move itself
    // when the constants are re-fitted.
    s.core_uncovered_frac = f_unc;
    if (f_unc > 0) {
      // ZIRCONIUM-STEAM OXIDATION (#238, 2026-08-03). The second heat source, and the one
      // that turns a hot core into a melting one: Zr + 2H2O -> ZrO2 + 2H2, Q = 190 kJ/mol
      // (Baker and Just). Without it this node heats on DECAY HEAT ALONE, so it heats more
      // SLOWLY as it climbs — measured before the change, MD-1 crossed 1200 -> 2800 °C in
      // 22.7 min while decay heat FELL 6.7 % -> 4.5 %. Real severe accidents accelerate.
      //
      // ARRHENIUS, not the linear multiplier the #238 entry sketched. Baker-Just gives
      // w^2 = 33.3e6 * t * exp(-45500/RT) (w mg/cm^2, R = 1.987 cal/mol/K), so E/R = 22898 K.
      // The exponential makes low temperatures negligible on its own, so this needs NO onset
      // constant and has no discontinuity at one — simpler than the sketch as well as more
      // prototypical.
      //
      // PARABOLIC, which is why there is an oxide STATE and not just a temperature factor:
      // the oxide layer is protective, so the rate falls as it thickens. Integrated as w^2
      // (stable from zero, unlike dw/dt = K/2w) in NORMALIZED units — w = 1 is the reference
      // oxide, reached in zirc_tau_ref_s at the reference temperature.
      //
      // CALIBRATION IS SOURCED, not fitted: "at approximately 2200 °F, the oxidation heat
      // equals the decay heat generated after 8 hours from reactor shutdown". 2200 °F is
      // also the 10 CFR 50.46(b)(1) limit. On THIS plant's decay curve the 8-hour figure is
      // 1.1243 % of rated, which is zirc_q_ref — and the algebra below makes Q_ox equal it
      // exactly at w = 1, T = T_ref, so the anchor holds by construction rather than by fit.
      var z = t.zirc || {}, q_ox = 0;
      if (z.q_ref) {
        var T_K = s.clad_temp_c + 273.15, Tref_K = (z.ref_temp_c || 1204) + 273.15;
        var tau = z.tau_ref_s || 80;
        // 1.0 at the reference temperature; ~3140x at the melt point. w grows with it, so
        // dw/dt self-limits — BELOW MELT. It does not self-limit above it, and this comment
        // used to claim "the term never needs a cap" full stop, which #326 measured false:
        // q_ox reduces to `q_ref * arr / w`, and w only grows as sqrt(integral) while arr is
        // exponential in T, so the exponential wins whenever the node's own heat outruns the
        // sink. It reaches 1095 % of rated on an unmitigated large break. What bounds it is
        // not a cap but the `melted` termination at the top of this function — the runaway
        // is entirely past the end of the model's declared validity, which is why stopping
        // there is the fix rather than clamping a number the trainer should not be showing.
        var arr = Math.exp((z.ea_over_r_k || 22898) * (1 / Tref_K - 1 / T_K));
        if (s._zr_ox2 == null) s._zr_ox2 = 0;          // lazy init (new field; old saves)
        var w_old = Math.sqrt(s._zr_ox2);
        s._zr_ox2 += (arr / tau) * f_unc * dt;          // d(w^2)/dt — MONOTONIC: oxide does not un-grow
        var dw_dt = (Math.sqrt(s._zr_ox2) - w_old) / dt;
        q_ox = z.q_ref * 2 * tau * dw_dt;               // = q_ref at w = 1, T = T_ref
      }
      // % of RATED, like decay_heat_pct — q_ox is a fraction here (q_ref is 0.011243).
      s.zirc_heat_pct = q_ox * 100;
      var heat = (t.clad_heat_gain || 0) * ((s._Q_total || 0) + q_ox) * f_unc;
      var cool = (t.clad_steam_h || 0) * (s.clad_temp_c - T_sat(s.pressure_mpa));
      s.clad_temp_c += (heat - cool) * dt;
    } else {
      s.zirc_heat_pct = 0;   // a covered core is not oxidising; the OXIDE (_zr_ox2) stays
      var wet = (s.thot_c != null ? s.thot_c : s.tavg_c);
      s.clad_temp_c += (wet - s.clad_temp_c) * dt / ((t.clad_quench_tau || 120) + dt);
    }
    // The bulk node can outrun the hot node on a fast deep uncovery (h_fc collapse
    // heats the average core directly) — the PEAK clad is never cooler than that.
    if (s.clad_temp_c < s.fuel_temp_c) s.clad_temp_c = s.fuel_temp_c;
    // ABOVE ~1900 °C THIS IS NO LONGER "CLADDING" IN ANY PHYSICAL SENSE (#238, 2026-08-03).
    // Zircaloy melts at 2030–2250 K (1757–1977 °C, depending on oxygen content) and molten
    // Zircaloy then DISSOLVES UO2, liquefying it "up to 300 K or even more" below its own
    // 3100 K melting point — OECD/NEA CSNI-R(2000)21 §2. This model has two thresholds and
    // nothing between them, so the node sails through clad melt, control-rod relocation
    // (Ag-In-Cd is molten at ~1100 K) and fuel dissolution as a SOLID, and reaches
    // fuel_melt_c — the PURE UO2 melting point — several hundred °C after a real core would
    // already have liquefied. Measured: 2.9–3.6 min above Zircaloy's melting point, ending
    // ~950 °C past it with the fuel node ~900 °C cooler than the "cladding" wrapped round it.
    //
    // So read this field as a PEAK CORE-MATERIAL temperature above ~1900 °C, not as a clad
    // temperature, and do not quote it as one. It is deliberately left that way: it drives
    // nothing but checkDamage and one Physics-tab readout, and everything above 1200 °C is
    // past the point where the trainer has anything left to teach (Manuals/12 §5.5 — "the
    // simulation ends at fuel damage"). Investigated and parked on #238 with the staging.
  }

  // Step 14 — fuel damage / melt endpoint (thresholds fixed). Judged at the PEAK
  // clad/fuel temperature: the hot node fails first on partial uncovery (#213),
  // the bulk node on whole-core loss of cooling — damage is local before it is
  // average, so the max of the two is the physical criterion.
  function checkDamage(s, cfg) {
    var t = cfg.thermal;
    var peak = (s.clad_temp_c != null && s.clad_temp_c > s.fuel_temp_c) ? s.clad_temp_c : s.fuel_temp_c;
    if (peak > t.fuel_damage_c) s.fuel_damaged = true;
    if (peak > t.fuel_melt_c) {
      s.melted = true;
      if (s.destruction_cause === 'none') s.destruction_cause = 'thermal_melt';
    }
  }

  RD.pwrThermal = {
    T_sat: T_sat,
    trueSubcooling: trueSubcooling,
    hFcEffective: hFcEffective,
    stepFuel: stepFuel,
    stepCoolant: stepCoolant,
    stepCladding: stepCladding,
    checkDamage: checkDamage,
  };

})(globalThis.RD || (globalThis.RD = {}));
