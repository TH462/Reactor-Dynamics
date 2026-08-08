/*
 * pwr_primary.js — primary coolant inventory and voiding, reactor coolant pumps
 * and flow coastdown, and high-pressure injection (M1 §6.5–6.6, §6.9). Pure
 * functions over engine state `s` and config `cfg`.
 *
 * Inventory is tracked as a fraction (1.0 = full) in s._mass and mirrored to the
 * contract field s.core_inventory_pct (0–120 %).
 *
 * Attaches RD.pwrPrimary.
 */
;(function (RD) {
  'use strict';

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function T_sat(P) { return 179.47 * Math.pow(Math.max(P, 1e-6), 0.239); }

  // Loop pressure distribution (M1 §6.5; loop-pressure rework 2026-07). The RCS is
  // incompressible liquid outside the pressurizer bubble, so there is ONE dynamic
  // pressure state (s.pressure_mpa, the pressurizer/hot-leg reference) plus a
  // QUASI-STATIC ΔP field: pump head vs. friction, both ∝ flow_frac² (form loss),
  // collapsing to a single pressure when the RCPs coast down. Writes the three node
  // pressures onto s each step; the systems tied into the loop read the node they
  // physically connect to (cold leg = ECCS/accumulators/letdown; hot leg = RHR
  // suction; suction = RCP cavitation). Called by the engine after stepPressure and
  // by _buildState so getTrueState is valid before the first step. NOT a new dynamic
  // state — pure algebra over pressure_mpa and flow_frac (no integration, no stiffness).
  function computeNodePressures(s, cfg) {
    var pr = cfg.primary;
    var ff2 = s.flow_frac * s.flow_frac;
    s.p_hotleg = s.pressure_mpa;                                    // surge line taps the hot leg
    s.p_pumpsuction = Math.max(0, s.pressure_mpa - pr.loop_dp_sg_rated * ff2);   // between SG and RCP (lowest); floored at 0 — absolute pressure, and cavitation already floors into T_sat's guard
    s.p_coldleg = s.pressure_mpa + pr.loop_dp_core_rated * ff2;     // RCP→RX pump discharge (highest)
  }

  // RCP cavitation (loop-pressure rework 2026-07). The pump suction is the
  // lowest-pressure node and sees cold-leg-temperature water, so it reaches
  // saturation first as the loop voids/depressurizes. suction_subcool_c =
  // Tsat(p_pumpsuction) − tcold is the NPSH-like margin; when it falls to
  // cavitation_onset_c the running pump begins to cavitate (severity ramps to
  // full over cavitation_band_c more), losing head/flow — the mechanical bite
  // applied in stepFlow. A stopped pump does not cavitate. Kept separate from the
  // bulk subcooling_margin instrument (the TMI deception). Called after
  // computeNodePressures; uses this step's p_pumpsuction and tcold.
  function stepCavitation(s, cfg) {
    var pr = cfg.primary;
    var psuc = (s.p_pumpsuction != null) ? s.p_pumpsuction : s.pressure_mpa;
    s.suction_subcool_c = T_sat(psuc) - (s.tcold_c != null ? s.tcold_c : s.tavg_c);
    var cav = 0;
    if (s.pump_running) {
      cav = clip((pr.cavitation_onset_c - s.suction_subcool_c) / pr.cavitation_band_c, 0, 1);
    }
    s.rcp_cavitation_frac = cav;
    s.rcp_cavitating = cav > (pr.cavitation_indicate_frac != null ? pr.cavitation_indicate_frac : 0.05);
  }

  // Emergency injection — ONE merged HPI/LPI system on a DEDICATED ECCS pump
  // train (this plant's ECCS has its OWN pump, RWST-sourced — NOT the CVCS
  // charging pump doing double duty; owner ruling 2026-07-22). That is what
  // justifies HPI and CVCS charging on different flow scales: charging is a
  // small make-up pump (see cvcs_inventory_gain), the ECCS pump is a large SI
  // train. One command, one flag, one pump curve: a high-head/low-flow segment
  // (shutoff 16.44 MPa — head coincides with the classic centrifugal-charging
  // curve) plus a low-head/high-flow segment (shutoff 4.5 MPa —
  // the LPI/RHR-pump head). Flow rises as pressure falls: at TMI
  // pressures only the high-head segment is in play (numerically identical to
  // the old standalone HPI — the flagship is untouched); in a large LOCA the
  // low-head segment dominates. degraded_hpi scales the whole curve.
  // Returns inventory-fraction/s for the mass balance; the exposed
  // s.hpi_flow_normalized is this over the combined rated total.
  function injectionFlowInv(s, cfg) {
    if (!s.hpi_active) return 0;
    // NO AC, NO SAFETY INJECTION (#332). Both segments of this curve are motor-driven
    // pumps on the vital buses — on a real Westinghouse plant the high-head segment IS
    // the centrifugal charging pump ("The centrifugal charging pumps also serve as the
    // high head safety injection pumps of the emergency core cooling systems", WTSM
    // 4.1.3.4, ML11223A214 p. 4.1-16; this plant gives ECCS its own train by the
    // 2026-07-22 owner ruling, which changes the flow scale, not the power supply).
    // WTSM 5.7.5 (ML11223A229, p. 5.7-6) states the general case: a blackout fails "all
    // decay heat removal systems, except the turbine-driven AFW pump".
    //
    // MEASURED before this guard, full stack: SBO at 60 s, `set_hpi active:true` at
    // 300 s, and the dead pump injected the RCS from 100 % to 120 % inventory — solid —
    // inside five minutes. The ACCUMULATORS deliberately keep working through all of
    // this (stepAccumulators below): they are pressurized N2 behind a check valve and
    // owe nothing to the switchgear, which is the contrast worth teaching.
    if (!acAvailable(s)) return 0;
    var e = cfg.emergency;
    // ECCS discharges into the COLD leg (pump discharge), so injection works against
    // the cold-leg node — higher than the pressurizer reference at power, converging
    // on it as the RCPs coast down (when a LOCA has usually tripped them).
    var p_inj = (s.p_coldleg != null) ? s.p_coldleg : s.pressure_mpa;
    var q_hh = e.hpi_flow_max * clip((e.hpi_pressure_ref - p_inj) / e.hpi_pressure_ref, 0, 1);
    var q_lh = e.lpi_flow_max * e.lpi_inventory_gain * clip((e.lpi_pressure_ref - p_inj) / e.lpi_pressure_ref, 0, 1);
    return (q_hh + q_lh) * (s.hpi_flow_multiplier != null ? s.hpi_flow_multiplier : 1.0);
  }
  function injectionRatedInv(cfg) {
    var e = cfg.emergency;
    return e.hpi_flow_max + e.lpi_flow_max * e.lpi_inventory_gain;
  }

  // Passive accumulators: discharge into the cold leg once primary pressure drops
  // below the N2 cover pressure; finite borated capacity depletes as they inject
  // (accumulator_volume_pct → 0). Pressure-driven (the passive check valve), but ALSO
  // gated by the motor-operated discharge isolation valve in series with it: when the
  // operator has isolated the accumulators (accumulator_valve_open === false) nothing
  // flows at any pressure. That is how a normal cooldown depressurizes below the
  // check-valve setpoint without a spurious dump. Default aligned (valve open).
  function stepAccumulators(s, cfg, dt) {
    var e = cfg.emergency;
    var flow = 0;
    // Accumulators also discharge into the cold leg — pressure-driven off the cold-leg node.
    var aligned = (s.accumulator_valve_open !== false);   // isolation valve; default open
    var p_inj = (s.p_coldleg != null) ? s.p_coldleg : s.pressure_mpa;
    if (aligned && p_inj < e.accumulator_trip_mpa && s._accum_remaining > 1e-6) {
      var frac = clip((e.accumulator_trip_mpa - p_inj) / e.accumulator_trip_mpa, 0, 1);
      flow = e.accumulator_flow_max * frac;
      // Deplete finite capacity by the delivered inventory; do not overdraw the tank.
      var delivered = flow * e.accumulator_inventory_gain * dt;
      if (delivered > s._accum_remaining) { delivered = s._accum_remaining; flow = delivered / (e.accumulator_inventory_gain * dt); }
      s._accum_remaining = Math.max(0, s._accum_remaining - delivered);
    }
    s.accumulator_flow_normalized = flow;
    s.accumulators_discharging = flow > 1e-6;
    s.accumulator_volume_pct = clip(s._accum_remaining / e.accumulator_capacity * 100, 0, 100);
    // N2 cover-gas pressure for the tank indication: the gas space expands isothermally into
    // the volume the discharged water vacated, so P = P0·Vg0/(Vg0 + Vwater_discharged). Falls
    // with fill, which is why a real accumulator's injection tails off as it empties.
    var gasFrac = e.accumulator_gas_frac != null ? e.accumulator_gas_frac : 0.35;
    var emptied = 1 - s.accumulator_volume_pct / 100;
    s.accumulator_pressure_mpa = e.accumulator_trip_mpa * gasFrac / (gasFrac + emptied);
    return flow * e.accumulator_inventory_gain;   // inventory-fraction rate for the mass balance
  }

  // AC availability predicates (#332). The engine derives s.ac_available once per step
  // (pwr_engine step 0a, which also carries the bus description and the source); these
  // are the READ side, and they live here because pwr_primary owns three of the four
  // loads that consult them.
  //
  // BOTH DEFAULT TO POWERED when the field is absent. That is deliberate: these functions
  // are called directly with hand-built state objects by the engine's own selfTest and by
  // ad-hoc physics rigs, and `!undefined` would silently de-energize the plant in every
  // one of them — an isolated-physics rig would start reporting zero letdown and no
  // injection with nothing in the fixture to explain it. Absent means energized.
  function acAvailable(s) { return s.ac_available !== false; }
  // The charging pump turns iff the operator has it selected AND the bus is alive.
  function chargingPumpPowered(s) { return s.charging_pump_running !== false && acAvailable(s); }

  // Two-orifice letdown flow: a pressure-driven bleed from the cold leg through
  // the in-service orifice(s) to the letdown HX / VCT. Each orifice passes
  // C·√(p_coldleg − backpressure); s.letdown_flow is the TRUE flow (what the
  // letdown_flow instrument reads), recomputed each step from the orifice lineup
  // and the current cold-leg pressure — so it tails off as RCS pressure falls
  // toward the backpressure on a cooldown, unlike the old commanded constant.
  function letdownFlow(s, cfg) {
    var rc = cfg.reactivity;
    // NO CHARGING PUMP, NO LETDOWN (#332). The orifice needs no pump — that is exactly
    // why letdown used to run through a station blackout and drain the plant — but the
    // orifice ISOLATION valves are interlocked to the charging pumps, and that interlock
    // is sourced, not inferred. WTSM 4.1.3.1 (ML11223A214, p. 4.1-7), letdown orifice
    // isolation valve interlock 2: "At least one charging pump must be running in order
    // to open any letdown orifice isolation valve. If the running charging pump(s) is
    // lost, then the letdown orifice isolation valves close. This interlock ensures that
    // cooling water (charging) is available to the regenerative heat exchanger prior to
    // the establishment of letdown flow."
    //
    // Gating on the PUMP rather than on the blackout flag directly is what makes this one
    // guard cover two defects. The blackout case is #332's headline; the other is that
    // securing the charging pump with the grid up ALSO left letdown flowing — measured,
    // that bled 100 → 79.5 % inventory in 13 minutes before the low-pzr-level isolation
    // (the OTHER real interlock, in pwr_control) caught it at 17 %.
    //
    // DECLARED SIMPLIFICATION: the real valves CLOSE and stay closed — restoring the pump
    // does not reopen them, the operator does. Here the gate is live, so letdown returns
    // with the pump. One operator action, not a different behaviour.
    if (!chargingPumpPowered(s)) return 0;
    var pd = (s.p_coldleg != null) ? s.p_coldleg : s.pressure_mpa;
    var sq = Math.sqrt(Math.max(0, pd - rc.letdown_backpressure_mpa));
    return (s.letdown_orifice_a ? rc.letdown_orifice_a_coeff : 0) * sq
         + (s.letdown_orifice_b ? rc.letdown_orifice_b_coeff : 0) * sq;
  }

  // Step 9 — primary inventory and voiding (CVCS charging/letdown + HPI/LPI/accumulator/SI − losses).
  function stepInventory(s, cfg, dt) {
    // Every primary leak is a DISCHARGE, driven by the pressure difference across
    // whatever it is leaking through. Two paths, differing only in what is on the far
    // side of the hole.
    //
    // SGTR leaks primary→secondary through the ruptured tube (feel-plan P5): full rate
    // at the rated ΔP (~9.8 MPa), tapering to ZERO as the primary is depressurized to SG
    // pressure — the single-SG EOP's whole strategy.
    //
    // A LOCA discharges to CONTAINMENT, and until #334 it did not taper at all: the rate
    // was fixed when the failure was injected, so the same break flowed identically at
    // 2235 psi and at 14.5 psi and an RCS clipped at zero mass went on "leaking" at full
    // rate indefinitely. 10 CFR 50 Appendix K I.C.1.b requires the discharge to be a
    // critical-flow function of the upstream state with "a discharge coefficient applied
    // to the postulated break area" — an AREA, not a flow. See pwr_config.primary for the
    // quote and for why the form here is the √Δp orifice law rather than Moody itself.
    //
    // Referenced to break_p_ref_mpa so a break's configured size still means its rated
    // flow at nominal RCS pressure: at 15.41 MPa the factor is exactly 1 and every
    // existing severity keeps the calibration it was tuned with. Only the depressurized
    // end of the curve is new.
    if (s._leak_base) {
      if (s._leak_to_sg) {
        var dp_ref = cfg.primary.sgtr_dp_ref || 9.8;
        s.leak_flow = s._leak_base * clip((s.pressure_mpa - s.steam_pressure_mpa) / dp_ref, 0, 1.2);
        s._leak_dp = Math.max(s.pressure_mpa - s.steam_pressure_mpa, 0);
      } else {
        // Backpressure is the LIVE containment pressure since #386 stage 1 (it was
        // this constant, forever). Null-guarded fallback to the config constant so
        // rig-built states without containment fields keep the old behaviour — the
        // acAvailable "absent means energized" pattern. The SPAN stays config-fixed:
        // the orifice coefficient is a rated-flow-at-rated-Δp calibration and must
        // not drift as containment pressurizes; only the numerator Δp goes live.
        // Note this reads LAST step's containment pressure (stepContainment runs at
        // 14c, after this) — explicit coupling, CONTEXT §11.
        var pb0 = cfg.primary.break_backpressure_mpa != null ? cfg.primary.break_backpressure_mpa : 0.1;
        var pb = s.containment_pressure_mpa != null ? s.containment_pressure_mpa : pb0;
        var pr = cfg.primary.break_p_ref_mpa != null ? cfg.primary.break_p_ref_mpa : 15.41;
        var span = Math.max(pr - pb0, 1e-6);
        s.leak_flow = s._leak_base * Math.sqrt(clip((s.pressure_mpa - pb) / span, 0, 1.5));
        s._leak_dp = Math.max(s.pressure_mpa - pb, 0);
      }
    }
    // Discharge COMPOSITION (#408 wave 1): what leaves the hole is the fluid that is
    // there, and that has TWO regimes (the lumped shadow of Appendix K's Moody quality
    // dependence — the √Δp law above has no quality input, so this factor carries it):
    //   ENTRAINMENT — while blowdown Δp lasts, the high-velocity discharge carries
    //     liquid/two-phase regardless of elevation (this is what empties a vessel in
    //     tens of seconds), keyed clip(Δp/break_entrain_ref_mpa, 0, 1);
    //   SPILL — once Δp has collapsed, elevation rules: the cold-leg nozzle sits ABOVE
    //     the core top, so the vessel refills to the spill band and the break passes
    //     liquid only for inventory above it, keyed clip((mass−lo)/(hi−lo), 0, 1).
    //     Below the band a drained RCS sends a STEAM trickle (break_steam_mass_frac),
    //     which is why real-scale ECCS can reflood a vessel with a full-bore hole in
    //     it — measured without this split: DEG endInv 0.0 % with the accumulators
    //     fully discharged (phantom liquid-density mass from an empty vessel), or a
    //     standing near-dry equilibrium at ~10 % with clad parked near 1000 °C.
    // liquidFrac = max(entrain, spill): each regime alone is sufficient to carry
    // liquid. The MASS ledger discharges the reduced flow; `s.leak_flow` itself stays
    // the full open-area flow because the pressure half (K_break_vent, leak_depress)
    // and the CA-18 level weight are area/venting physics, not mass transport. An
    // SGTR always runs at multi-MPa Δp, so entrain ≈ 1 and its calibrations are
    // untouched by construction; all constants absent → factor 1 (legacy states).
    var bsf = cfg.primary.break_steam_mass_frac != null ? cfg.primary.break_steam_mass_frac : 1.0;
    var er = cfg.primary.break_entrain_ref_mpa || 0;
    var slo = cfg.primary.break_spill_lo, shi = cfg.primary.break_spill_hi;
    // entrain is QUADRATIC in Δp: entrained carry-off scales with discharge velocity
    // squared, and the linear form's tail was measured to matter — at Δp ~0.1 MPa it
    // still credited ~5 % liquid carry-off, which balanced the whole real-scale ECCS
    // and parked the plant at 61 % inventory, uncovered, clad creeping, forever.
    // It is ALSO weighted by liquid availability (mass/spill_lo): entrainment can only
    // carry off liquid that reaches the break, and without the weight a small break
    // holding Δp ~2.4 MPa entrained phantom liquid from below its own elevation and
    // parked sev 0.1 at 36 % inventory with clad at 890 °C forever (measured) — a
    // real SBLOCA recovers exactly because the drained break passes steam.
    // Availability window [break_entrain_floor, spill_lo]: a small-to-medium break
    // HOLDS Δp indefinitely, so Δp weighting alone can never retire the entrainment
    // credit — measured, sev 0.1 parked at 40 % inventory / 2.9 MPa with the liquid
    // credit (0.33) out-running HPI forever. Standing entrainment from below the
    // break elevation is not physical; the window lets the violent early drain
    // carry liquid down through the band and then dies, which is what turns a
    // medium break from a permanent drain into the drain → steam → refill arc.
    var efl = cfg.primary.break_entrain_floor != null ? cfg.primary.break_entrain_floor : 0;
    var avail = (slo != null && slo > efl) ? clip((s._mass - efl) / (slo - efl), 0, 1) : 1;
    var entrain = er > 0 ? clip((s._leak_dp || 0) / er, 0, 1) : 1;
    entrain = entrain * entrain * avail;
    var spill = (slo != null && shi != null && shi > slo) ? clip((s._mass - slo) / (shi - slo), 0, 1) : 1;
    s._leak_mass_flow = s.leak_flow * (bsf + (1 - bsf) * Math.max(entrain, spill));
    // Letdown first — the auto make-up law and the mass balance below both read it.
    s.letdown_flow = letdownFlow(s, cfg);
    var inj_inv = injectionFlowInv(s, cfg);
    s.hpi_flow_normalized = inj_inv / injectionRatedInv(cfg);   // 0–1 of combined HPI/LPI rated
    var accum_inv = stepAccumulators(s, cfg, dt);
    var rc = cfg.reactivity;
    // CVCS charging: AUTO make-up (opt-in) modulates the TRUE flow to track letdown
    // + an inventory deficit, up to charging_max, compensating identified leakage;
    // MANUAL tracks the operator setpoint. Either way s.charging_flow is the true
    // flow (what the charging_flow instrument reads); charging_setpoint is the command.
    if (s.cvcs_auto) {
      // AUTO make-up holds PROGRAMMED PZR LEVEL (real CVCS level control):
      // charging = letdown + level-servo (charging above/below letdown per % level
      // error, reading last step's indicated level). Capped at charging_max.
      // Pure pressurizer-level control, exactly like the real CVCS: charging modulates
      // above/BELOW letdown to hold the programmed level, reading only the INDICATED level
      // (HR1 — no peeking at true mass or leak flow). A leak makes ITSELF up because it
      // lowers the level (see stepLevel: leak_flow is now an inventory-out term on the
      // level, as it physically is), so the servo charges up to hold level — no leak
      // detection needed. A HIGH level drives charging below letdown to bring it back down.
      // PROGRAMMED level setpoint (catalog v3 FG-3): the thermal-expansion base line the
      // derived level rides, CLAMPED at both ends (pwr_pressurizer.levelProgram), computed
      // from the INDICATED Tavg (HR1 — the program card reads a plant instrument, not truth).
      // Through the normal band setpoint and physics are the SAME line, so a heat-up raises
      // level AND setpoint together: the old #34 failure mode (auto charging draining the RCS
      // to chase a thermally-high level) is structurally gone, and with DERIVED level
      // draining genuinely lowers level, so no mass floor is needed either.
      // ABOVE THE CEILING THEY DIVERGE ON PURPOSE (#289) — physics keeps expanding, the
      // program stops at level_prog_ceiling, and the resulting level-above-program is exactly
      // what the CVCS is supposed to let down. That is what stops a load rejection with rod
      // control in MANUAL from riding the program into the 97 % going-solid trip.
      var tavg_ind = (s._ins_tavg != null) ? s._ins_tavg : s.tavg_c;
      var tref = (s._tavg_fp != null) ? s._tavg_fp : 304.0;
      var level_sp = RD.pwrPressurizer.levelProgram({ tavg_c: tavg_ind, _tavg_fp: tref }, cfg);
      // Sense the INDICATED pzr level (previous-step instrument, HR1) — NOT true level — so a
      // lagged/failed level sensor fools the level control like the operator. Falls back to
      // true level only before the first instrument reading exists.
      var level_ind = (s._ins_pzr_level != null) ? s._ins_pzr_level
                    : (s.pzr_level_pct != null ? s.pzr_level_pct : level_sp);
      // Damped level error (the M/A station's damping, P7 retune): first-order
      // filter on (setpoint − indicated) so the servo can be stiff enough to park
      // a leak near program WITHOUT amplifying gauge noise into a visible charging
      // chase (CA-3). Reseeded whenever AUTO is (re)engaged.
      var err_raw = level_sp - level_ind;
      var ftau = rc.cvcs_level_filter_tau != null ? rc.cvcs_level_filter_tau : 20.0;
      if (s._cvcs_err_f == null) s._cvcs_err_f = err_raw;
      s._cvcs_err_f += (err_raw - s._cvcs_err_f) * (dt / (ftau + dt));
      var level_demand = (rc.cvcs_charge_per_level || 0.001) * s._cvcs_err_f;
      var target = (s.letdown_flow || 0) + level_demand;
      s.charging_flow = clip(target, 0, rc.charging_max != null ? rc.charging_max : 1.33333e-4);
    } else {
      // MANUAL honors the pump's run-out too (#421). This clip covers the two paths
      // the applyCommand clip cannot reach: a pre-#408 save restoring its retired-
      // currency setpoint verbatim (no migration default exists), and crafted rig
      // states that write charging_setpoint directly.
      s.charging_flow = clip(s.charging_setpoint, 0, rc.charging_max != null ? rc.charging_max : 1.33333e-4);
      s._cvcs_err_f = null;   // stale in MANUAL; reseed on the next AUTO engage
    }
    // Charging requires the charging pump. CVCS flows are normalized to the
    // gauge/lineup scale (orifice A ≈ 0.030 ≡ 20 gpm) — tens of gpm against the
    // whole RCS — so they enter the mass balance through cvcs_inventory_gain
    // (frac/s per unit normalized flow, P7 retune) instead of 1:1 like the
    // accident-scale flows (leak/ECCS/relief keep the lumped fast scale).
    // `chargingPumpPowered` = the operator has it selected AND the 1E bus is alive
    // (pwr_engine step 0a). The centrifugal charging pumps are ac motor loads: WTSM
    // 4.1.3.4 (ML11223A214, p. 4.1-16) — "Two of the pumps are single-speed, horizontal
    // centrifugal pumps powered from vital (Class 1E) ac power" — so a blackout stops
    // them, and #332 measured them pumping for three hours without it.
    var charging = chargingPumpPowered(s) ? s.charging_flow : 0;
    var g_cvcs = rc.cvcs_inventory_gain != null ? rc.cvcs_inventory_gain : 1.0;
    var dm = (charging * g_cvcs + inj_inv + accum_inv)
           - (s.letdown_flow * g_cvcs + s.porv_flow + s.safety_flow + s._leak_mass_flow);
    var m_before = s._mass;
    s._mass = clip(s._mass + dm * dt, 0.0, cfg.primary.mass_max);
    s.core_inventory_pct = s._mass * 100;
    // The PRESSURIZER SURGE driver (#337). Inventory leaving a subcooled RCS comes out of
    // the pressurizer — it is the only place there is a free surface — so the bubble grows
    // and pressure falls, exactly as a cooldown contraction does. pwr_pressurizer.stepPressure
    // (step 7) reads this ONE STEP LATE, the CONTEXT §11 explicit coupling, same as
    // stepCoolant reads `_eccs_inj_inv`. Taken as the REALISED change (post-clip, / dt) rather
    // than the raw balance, so a genuine clip cannot inject a surge the plant never took.
    //
    // THAT USED TO BE JUSTIFIED THE WRONG WAY ROUND, and #346 is the correction. This comment
    // read: "so a plant pinned at mass_max — an ECCS overfill holding 120 % — reports zero
    // surge instead of a phantom insurge it has nowhere to put." Both of those options are
    // wrong. A water-solid RCS being injected into with no relief path does not absorb the
    // mass and does not ignore it — it RELIEVES, and it could not, because the surge gain in
    // force was the one for a pressurizer that still had a steam bubble. `mass_max` is a
    // far-away NUMERICAL GUARD (#330's words for it) and the solid regime in
    // pwr_pressurizer.stepPressure is what keeps the plant away from it: measured, the fill
    // now arrests at 109.35 % against the 120.00 % ceiling. CA-12 leg C asserts exactly that.
    //
    // RELIEF IS EXCLUDED — F15, ruled *(OWNER RULING, 2026-08-04: "Do f15 how you recommend.")*.
    //
    // The PORV and the code safety valves discharge from the pressurizer STEAM SPACE. That mass
    // never crosses the surge line and never displaces loop liquid, so it is not a surge: it
    // shrinks the bubble directly, which is what `K_porv_relief` / `K_safety_relief` are for.
    // Sourced — WTSM 3.2 (ML11223A213, p. 3.2-10/11): the three code safeties are "totally
    // enclosed pop-open-type valves … spring loaded, and self actuating", and the PORVs sit on
    // the pressurizer and "release steam from the steam space".
    //
    // WHY IT MATTERS, and the arithmetic is the trap: `K_surge_level · level_per_mass` = 310 and
    // both relief gains were 300, so routing relief through the surge as well carried a relief
    // valve's authority TWICE — near enough exactly, which is itself the tell that those two
    // constants were always this same coupling, fitted per path. Measured with the double count
    // live, the TMI-2 flagship blew the RCS down to 69 psi (0.48 MPa) by 681 s.
    //
    // The gains were RE-SOLVED in the same change rather than merely left alone: they were fitted
    // to a plant where ECCS could not push back on pressure, and since #337 injection is an
    // insurge, so the same valve achieves less depressurization. See `K_porv_relief` in
    // pwr_config for the sourced criterion it is now solved against.
    // F15 HOLDS IN THE SOLID REGIME TOO — MEASURED, NOT ASSUMED (#346). The obvious
    // objection is that F15's premise is the valves "release steam from the steam space",
    // and a water-solid pressurizer has none, so relief there passes LIQUID and is a genuine
    // surge. That variant was BUILT: relief folded into `dm_surge` whenever solid and the
    // steam-space gains stood down in stepPressure to avoid the double count. It is more
    // physically honest and it is REFUSED, because it does not stand alone. Measured on the
    // #346 rig, it moves the relieving equilibrium down about 145 psi (1 MPa), which puts the
    // plant further below the ECCS shutoff head, and injection then out-runs the PORV: the
    // fill stops arresting and inventory walks back to the 120.00 % clip — the very defect.
    // The reason is that the same argument applies to SPRAY (nothing to condense) and to the
    // HEATERS (no bubble to flash) at solid, and taking only the relief third of it leaves an
    // unbalanced pressure controller. Doing it properly is a three-term regime plus a
    // re-solve of `K_porv_relief`/`K_safety_relief`, which is a separate change; declared at
    // `Manuals/12` §12.4c and left to it.
    var dm_surge = dm + (s.porv_flow || 0) + (s.safety_flow || 0);   // relief is not a surge
    var m_surge = clip(m_before + dm_surge * dt, 0.0, cfg.primary.mass_max);
    s._dmass_dt = dt > 0 ? (m_surge - m_before) / dt : 0;

    // Boron transport on the emergency-injection path (HPI/LPI + accumulators carry
    // heavily borated RWST/SIT water at eccs_boron_ppm). Perfect-mixing update of the
    // core concentration: dC/dt = q_inj·(C_eccs − C)/m, so injected inventory raises
    // s.boron_ppm (negative reactivity) — the ECCS shutdown-margin role during a LOCA.
    // Losses (letdown/break/relief) leave at the current concentration and so do not
    // change it, and they already cancel in the mixing balance. CVCS borate/dilute is
    // a separate idealized channel added in pwr_engine step 13. Boil-off boron
    // concentration (steam carries no boron) is deliberately not modeled — the loss
    // term is lumped and does not distinguish boil-off from leakage.
    var eccs_inv = inj_inv + accum_inv;
    // Stash the cold-injection throughput (HPI/LPI + accumulators, inventory-frac/s) for
    // pwr_thermal.stepCoolant's quench term — it runs earlier in the step and reads this
    // one step late (explicit coupling, CONTEXT §11). RHR is not included (recirculation,
    // not cold make-up). Set every step so it falls to 0 when injection stops.
    s._eccs_inj_inv = eccs_inv;
    var c_eccs = cfg.emergency.eccs_boron_ppm;
    if (eccs_inv > 0 && c_eccs != null && s.boron_ppm != null) {
      var m_mix = s._mass > 0.05 ? s._mass : 0.05;   // floor to bound the mixing rate as inventory → 0
      s.boron_ppm += eccs_inv * (c_eccs - s.boron_ppm) / m_mix * dt;
    }

    // Two void mechanisms, kept in SEPARATE state (they have different physical effects
    // and calibrations, and TMI's erosion phase transiently drives the exit to saturation
    // — so combining them would let the flux term corrupt the TMI pressurizer deception):
    //
    //  (1) Inventory-driven (TMI) — primary_void_fraction: the bulk reaches saturation as
    //      inventory is lost (post-scram, low power). Void scales with the inventory deficit.
    //      This is the SOLE driver of the pressurizer sat-pull / void-surge (pwr_pressurizer),
    //      the calibrated TMI deception.
    var true_subcooling = T_sat(s.pressure_mpa) - s.tavg_c;
    // Onset band widens to +1.0 °C ON A FLOWING RELIEF PATH (#408 wave 1): at real
    // relief scale a stuck-valve draindown rides QUASI-STATICALLY just above the
    // sat line (measured: +0.4..+2.5 °C for tens of minutes — the sat-pull holds P
    // at Psat(Tavg) from below and the bulk never crosses), so the strict <= 0 gate
    // parked the TMI arc one coin-edge above its own deception forever (#363's
    // boundary note, met as an equilibrium). Physically, the venting flow entrains
    // two-phase up the surge line while the RCS is AT saturation — that is the TMI
    // pressurizer swell — so relief-path saturation-riding IS the voided regime.
    // No-relief paths keep the strict gate (CC-10b's subcooled-drain fence).
    var reliefFlowing = (s.porv_flow || 0) > 0 || (s.safety_flow || 0) > 0;
    var onset_c = reliefFlowing ? 1.0 : 0;
    s.primary_void_fraction = (true_subcooling <= onset_c && s._mass < 1.0)
      ? clip((1.0 - s._mass) * cfg.primary.void_gain, 0, 1) : 0;
    //  (2) Flux-driven core boiling (steam-line-break / loss-of-flow AT POWER) —
    //      core_void_fraction: the core exit passes saturation and boils even at full
    //      inventory. Driven by the raw exit overshoot (pwr_thermal), relaxed with a time
    //      constant. Its physical bite is the DNB heat-transfer collapse (pwr_thermal
    //      hFcEffective); it is deliberately NOT wired into the pressurizer couplings above.
    //      Exposed for indication / scenario triggers; a dedicated pressure coupling is
    //      deferred to at-power-scenario tuning.
    var th = cfg.thermal;
    var overshoot = -(s._subcool_hot_c != null ? s._subcool_hot_c : 1);   // °C past saturation at the exit
    var core_void_eq = clip(overshoot * (th.void_flux_gain || 0), 0, th.void_flux_max != null ? th.void_flux_max : 0.8);
    s.core_void_fraction = clip((s.core_void_fraction || 0)
      + (core_void_eq - (s.core_void_fraction || 0)) / (th.void_flux_tau || 3.0) * dt, 0, 1);
  }

  // Natural-circulation flow, fraction of rated (#325). Zero until 2026-08-04, when
  // `natural_circ_flow: 0.0` was replaced by this; DESIGN_COMPANION §8.6 was the
  // departure it declared, and §8.6 is retired rather than justified.
  //
  // W = C·√ΔT with ΔT = delta_T_rated·Q/W, solved: W = (C²·delta_T_rated·Q)^⅓. The
  // derivation, the source (WTSM 3.2.6.3) and why the fixed-point form is NOT used are in
  // the `natural_circ_coeff` comment in pwr_config — read that before touching this.
  //
  // Q IS TOTAL CORE HEAT, not fission power (#315). Post-trip that IS the decay tail, and
  // decay heat is the entire point of this function: reading `power_pct` here would compute
  // zero circulation for a scrammed core, which is the exact defect #315 found in the leg
  // split one function away.
  function naturalCircFlow(s, cfg) {
    var pr = cfg.primary, t = cfg.thermal;
    if (!pr.natural_circ_coeff) return 0;          // 0 restores the pre-#325 plant exactly
    var Q = (s._Q_total != null) ? s._Q_total : (s.power_pct || 0) / 100;
    if (!(Q > 0)) return 0;
    var w = Math.pow(pr.natural_circ_coeff * pr.natural_circ_coeff * t.delta_T_rated * Q, 1 / 3);
    // A voided loop has no continuous liquid column to drive: ramp to zero across the
    // cutoff. This is the TMI-2 discriminator — pumps off into a voided loop circulates
    // nothing — and it is also how losing the heat sink stops circulation, since that
    // route runs Tavg up, boils the core and voids the loop.
    var voidf = s.primary_void_fraction || 0;
    var cut = pr.natural_circ_void_cutoff || 0.25;
    w *= clip(1 - voidf / cut, 0, 1);
    return clip(w, 0, pr.natural_circ_max != null ? pr.natural_circ_max : 0.08);
  }

  // Step 10 — reactor coolant pumps and flow.
  function stepFlow(s, cfg, dt) {
    var pr = cfg.primary;
    if (s.pump_running) {
      // A cavitating pump loses head/flow: the delivered-flow target drops from
      // rated by cavitation_flow_loss × severity (the mechanical bite of a two-phase
      // suction). Uses this step's cavitation severity (stepCavitation, step 7c).
      var target = 1.0 - pr.cavitation_flow_loss * (s.rcp_cavitation_frac || 0);
      s.flow_frac += (target - s.flow_frac) / pr.pump_spinup_tau * dt;
    } else {
      // Coasting down TOWARD natural circulation, not toward zero. WTSM 3.2 (ML11223A213,
      // p. 3.2-17) says the flywheel is there for exactly this handover — the coastdown
      // "assures adequate heat removal during a plant trip and loss of power to the RCPs"
      // and "also assists in INITIATING natural circulation flow" — so the same τ carrying
      // the coastdown carrying it into the buoyancy-driven regime is the real sequence.
      s.flow_frac += (naturalCircFlow(s, cfg) - s.flow_frac) / pr.pump_coastdown_tau * dt;
    }
    s.flow_frac = clip(s.flow_frac, 0.0, 1.0);
    s.pump_flow_pct = s.flow_frac * 100;
    // Published so the board and the probes can tell buoyancy-driven flow from a coasting
    // rotor: same number of percent, completely different plant state. Keyed on what the
    // BUOYANCY LAW is producing, not on `flow_frac` — during a coastdown flow_frac is still
    // mostly rotor inertia, and in a voided loop it is decaying residue. Both would read
    // true off flow_frac and neither is natural circulation.
    s.natural_circulation = !s.pump_running
      && naturalCircFlow(s, cfg) > (pr.natural_circ_indicate_frac || 0.01);
  }

  // Step 14c — the containment building as a lumped receiving volume (#386 stage 1).
  // Model, sizing measurements and sources: the `containment` section header in
  // pwr_config.js. Runs AFTER inventory/pressure/cladding, so every source term it
  // reads (leak_flow from step 9, porv_flow/safety_flow from step 7, tavg_c from
  // step 6) is same-step fresh; its two CONSUMERS — the break law in stepInventory
  // and relief() in pwr_pressurizer — read the pressure it writes one step LATE
  // (explicit coupling, CONTEXT §11), which is what breaks the algebraic loop
  // break flow → containment pressure → break flow.
  function stepContainment(s, cfg, dt) {
    var c = cfg.containment;
    if (!c) return;   // config without the section (hand-built rigs) — containment stays absent
    if (s._ctmt_steam == null) s._ctmt_steam = 0;    // lazy init: old saves, rig states
    if (s._ctmt_sump == null) s._ctmt_sump = 0;
    var pNow = s.containment_pressure_mpa != null ? s.containment_pressure_mpa : c.ambient_pressure_mpa;
    // Break source: containment-side leaks ONLY. An SGTR discharges into the
    // steam generator — the one break that BYPASSES containment, which is the
    // diagnosis lesson (probe CT-1 asserts this exclusion).
    // The building receives the MASS that actually left (#408 wave 1: the
    // composition-reduced flow — a voided RCS sends a steam trickle, not
    // liquid-density phantom mass; conservation with stepInventory's ledger).
    var q_break = (s._leak_to_sg ? 0 : (s._leak_mass_flow != null ? s._leak_mass_flow : (s.leak_flow || 0)));
    // Flash fraction of the break liquid: cp·(T − T_sat(P_ctmt))/h_fg. Liquid at or
    // below the containment saturation temperature rains into the sump and moves
    // pressure not at all — the gate that makes sustained cold ECCS spill benign.
    var flash = clip((s.tavg_c - T_sat(pNow)) / (c.flash_span_c || 540), 0, 1);
    // Relief source: the PORV/safety lines vent the pressurizer STEAM SPACE, so the
    // discharge is steam already, weight 1.0. No pressurizer relief tank is modeled
    // (declared, Manuals/12 §13.0) — relief lands directly in the atmosphere.
    var q_relief = (s.porv_flow || 0) + (s.safety_flow || 0);
    // Upstream-SLB source (#386 stage 2): a steam-line break INSIDE containment
    // blows the SG down into the building — the sourced HELB case behind the
    // 3.5 psig backup signal (WTSM 12.3). steam_break_flow is secondary currency
    // (fraction of rated steam flow); slb_ctmt_gain converts. Already steam,
    // weight 1.0 — no flash gate. Downstream breaks discharge outside: zero here.
    var q_slb = (s._fail && s._fail.steam_break && s._fail.steam_break.active
                 && s._fail.steam_break.upstream)
      ? (s.steam_break_flow || 0) * (c.slb_ctmt_gain || 0) : 0;
    var steam_in = q_break * flash + q_relief + q_slb;
    // Heat sinks (#386 stage 2): passive condensation on the structures, plus the
    // ACTIVE trains as additive rate terms when delivering. Demand vs delivery is
    // the #200/#329 split — the casualty takes the POWER, never the lineup: a
    // blackout stops both trains with the demand standing, and they return with
    // the bus. Normal-mode fan cooling stays folded in passive_sink_tau_s
    // (declared, config header); ctmt_fan_safety is only the SI realign.
    s.ctmt_spray_active = !!s.ctmt_spray_demand && acAvailable(s);
    s.ctmt_fan_active = !!s.ctmt_fan_safety && acAvailable(s);
    // Passive-sink enhancement (#425): wall condensation grows with the saturation
    // elevation over the (fixed) structure temperature, and the growth arrives on a
    // LAG — a blowdown pulse spends 20-40 s above the knee and never charges it; a
    // boil-off's relief-duty climb spends minutes there and feels it fully. TIME is
    // the only separator between those families (their pressures overlap), which is
    // why this is a lagged state and not a static curve — the static form was
    // measured infeasible (TUNING_LOG 2026-08-08-develop-d). Constants + sizing:
    // the passive_sink_dt_* comment block in pwr_config. gain 0 (or absent config)
    // pins enh at exactly 1 and restores the pre-#425 plant bitwise.
    var dTarget = clip(1 + (c.passive_sink_dt_gain || 0)
                * Math.max(0, T_sat((c.press_gain || 0) * s._ctmt_steam) - c.ambient_temp_c
                              - (c.passive_sink_dt_knee_c != null ? c.passive_sink_dt_knee_c : 999)), 1, 25);
    if (s._ctmt_sink_enh == null) s._ctmt_sink_enh = 1;  // lazy init: old saves, rig states
    s._ctmt_sink_enh += (dTarget - s._ctmt_sink_enh) * Math.min(1, dt / (c.passive_sink_dt_lag_s || 90));
    var sink = s._ctmt_sink_enh / (c.passive_sink_tau_s || 1800)
             + (s.ctmt_spray_active ? 1 / (c.spray_sink_tau_s || 240) : 0)   // active trains NOT enhanced
             + (s.ctmt_fan_active ? 1 / (c.fan_sink_tau_s || 750) : 0);
    var cond = s._ctmt_steam * sink;
    s._ctmt_steam = Math.max(0, s._ctmt_steam + (steam_in - cond) * dt);
    s._ctmt_sump += (q_break * (1 - flash) + cond
                   + (s.ctmt_spray_active ? (c.spray_sump_rate || 0) : 0)) * dt;
    // ---- Hydrogen (#386 stage 3). Ledger currency is v/o OF CONTAINMENT FREE VOLUME
    // (the one sourced denominator: Ginna UFSAR ch15, 1.0e6 ft^3). Generated in
    // stepCladding (_rcs_h2, exactly proportional to the oxidation heat) and moved here
    // only while a containment-side path EXISTS — geometry, not flow: a flow-keyed gate
    // would stall on the burn's own backpressure spike (√Δp clips to zero for a step)
    // and alias the safety-valve duty cycle. SGTR-only discharge keeps its H2 in the
    // RCS — what the SG carries away is declared untracked (§12.4e) — so the
    // SGTR-reads-nothing fence (CA-16 leg B) holds for hydrogen too, and a closed block
    // valve HOLDS the inventory (the isolation lesson survives).
    if (s._rcs_h2 == null) s._rcs_h2 = 0;      // lazy init: old saves, rig states
    if (s._ctmt_h2 == null) s._ctmt_h2 = 0;
    var h2PathOpen = (s._leak_base > 0 && !s._leak_to_sg)
                  || (s.porv_open && s.block_valve_open !== false)
                  || !!s.safety_open;
    if (h2PathOpen && s._rcs_h2 > 0) {
      var h2_xfer = s._rcs_h2 * Math.min(1, dt / (c.h2_transport_tau_s || 60));
      s._rcs_h2 -= h2_xfer; s._ctmt_h2 += h2_xfer;
    }
    // Recombiners — auto-only combustible-gas control. Existence is sourced (WTSM 5.0,
    // NUREG-0737 II.E.4.1); capacity is NOT in any lane's corpus, so recomb_tau_s is
    // fitted SLOW — they manage the DBA tail and cannot stop a TMI-scale rise, which is
    // the prototypical shape. Demand vs delivery is the #200/#329 split: a blackout
    // stops the trains with the demand standing.
    s.ctmt_recomb_active = !!s.ctmt_recomb_demand && acAvailable(s);
    if (s.ctmt_recomb_active && s._ctmt_h2 > 0) {
      s._ctmt_h2 = Math.max(0, s._ctmt_h2 - s._ctmt_h2 / (c.recomb_tau_s || 1800) * dt);
    }
    // THE BURN — the ruled shape (OWNER RULING 2026-08-05: TMI-2-style, one-time
    // deflagration pressure spike + latched event, containment holds; OWNER RULING
    // 2026-08-08: peak sized ABOVE the 30 psig spray hi-hi, so the ESF answers it).
    // Physics-side trigger on TRUE concentration — a chemical event, not an instrument
    // decision (the self-actuating SG-safeties precedent). 2H2 + O2 -> 2H2O: a burn
    // MAKES steam and heat, so depositing into _ctmt_steam rides the existing
    // press_gain/T_sat/sink machinery and produces the GEND-061 shape — a single sharp
    // spike, then sink-rate decay. The latch is one-time FOREVER and stands in for O2
    // depletion/ignition stochastics (no O2 ledger, declared): H2 may re-accumulate
    // past the threshold afterward with no second burn — TMI-2 burned once.
    if (!s.ctmt_h2_burned && s._ctmt_h2 >= (c.h2_ignition_pct || 8.0)) {
      var h2_burned = s._ctmt_h2 * (c.h2_burn_consumed_frac != null ? c.h2_burn_consumed_frac : 0.85);
      s._ctmt_h2 -= h2_burned;
      s._ctmt_steam += (c.h2_burn_gain || 0) * h2_burned;
      s.ctmt_h2_burned = true;
    }
    s.ctmt_h2_pct = clip(s._ctmt_h2, 0, 100);
    var p_steam = (c.press_gain || 0) * s._ctmt_steam;
    s.containment_pressure_mpa = c.ambient_pressure_mpa + p_steam;
    // Atmosphere temperature: a steam/air mixture sits at the steam partial
    // pressure's saturation temperature, floored at ambient.
    s.containment_temp_c = Math.max(c.ambient_temp_c, T_sat(p_steam));
    s.containment_sump_pct = clip(s._ctmt_sump / (c.sump_ref || 300) * 100, 0, 100);
  }

  RD.pwrPrimary = {
    computeNodePressures: computeNodePressures,
    stepCavitation: stepCavitation,
    letdownFlow: letdownFlow, naturalCircFlow: naturalCircFlow,
    acAvailable: acAvailable, chargingPumpPowered: chargingPumpPowered,   // #332 — see step 0a
    injectionFlowInv: injectionFlowInv,
    stepInventory: stepInventory,
    stepFlow: stepFlow,
    stepContainment: stepContainment,
  };

})(globalThis.RD || (globalThis.RD = {}));
