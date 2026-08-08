/*
 * pwr_pressurizer.js — pressurizer pressure, heater/spray, PORV + spring safety
 * valves, and the surge-line level behavior that produces the TMI deception
 * (M1 §6.4). Pure functions over the engine state `s` and config `cfg`.
 *
 * HR2: the engine makes no control decisions. The PORV reflects its COMMANDED
 * demand (set by open_porv/close_porv, which in the real stack come from M4's
 * actuation) and the stuck-open failure. The spring safety valves likewise
 * reflect commanded state (open_pzr_safety/close_pzr_safety — M4's actuation
 * reads the pressure INSTRUMENT against safety_open_mpa/safety_reseat_mpa):
 * per the 2026-07 design ruling, even mechanical relief logic lives in the
 * control layer so it can be manipulated and failed like everything else.
 * The engine keeps only the valve hydraulics (flow while open).
 *
 * Attaches RD.pwrPressurizer.
 */
;(function (RD) {
  'use strict';

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  // Inverse of T_sat: saturation pressure (MPa) for a temperature (°C).
  function P_sat_from_T(T_c) { return Math.pow(Math.max(T_c, 1e-6) / 179.47, 1 / 0.239); }

  // Effective control target: the operator setpoint (s.pressure_setpoint), but a
  // RAISED setpoint is slewed — the effective target (s._pressure_sp_eff) walks up
  // at setpoint_pressurize_slew_mpa_s so a big upward step pressurizes at the
  // plant's deliberate heatup pace instead of at full heater authority (~3 s for
  // 350→600 psi pre-fix). A LOWERED setpoint takes effect immediately. Disturbance
  // response at a fixed setpoint keeps the full proportional authority.
  function effectiveSetpoint(s, cfg, dt) {
    var p = cfg.pressurizer;
    var sp = (s.pressure_setpoint != null) ? s.pressure_setpoint : p.P_setpoint;
    var slew = p.setpoint_pressurize_slew_mpa_s;
    if (slew == null || dt == null) return sp;                    // no slew configured
    if (s._pressure_sp_eff == null) s._pressure_sp_eff = sp;      // seed (migrated save / first step)
    if (sp <= s._pressure_sp_eff) s._pressure_sp_eff = sp;        // down: immediate
    else {
      // Up: only the portion ABOVE current pressure slews — the target may catch
      // up to where pressure already is instantly (an operator freezing a
      // descent at "current + a little" must stop the pull-down NOW; only
      // commanding pressure to places it hasn't been is heater-paced).
      var base = Math.max(s._pressure_sp_eff, Math.min(sp, s.pressure_mpa));
      s._pressure_sp_eff = Math.min(sp, base + slew * dt);
    }
    return s._pressure_sp_eff;
  }

  // Heater/spray proportional auto-control (§6.4); operator/failure overrides win.
  // The control target is the (slewed) operator setpoint — normally NOP
  // (P_setpoint) but moved across the range on the Mode 5↔1 heatup/cooldown
  // path; falls back to the config NOP setpoint for pre-setpoint saves.
  function autoControl(s, cfg, setpointEff) {
    var p = cfg.pressurizer;
    var setpoint = (setpointEff != null) ? setpointEff
                 : (s.pressure_setpoint != null) ? s.pressure_setpoint : p.P_setpoint;
    var spCmd = (s.pressure_setpoint != null) ? s.pressure_setpoint : p.P_setpoint;
    if (s.heater_override != null) { s.heater_power_frac = s.heater_override; s._heater_dp_frac = s.heater_override; }
    else {
      // Indicated heater power reads against the COMMANDED setpoint (during a
      // slewed pressurization the heaters run hard, like a real pressurizer
      // heatup); the pressure-rate term uses the slewed effective target, so the
      // RATE stays at the heatup pace while the indication is honest.
      var errInd = spCmd - s.pressure_mpa;
      s.heater_power_frac = errInd > 0 ? clip(errInd / p.heater_band_mpa, 0, 1) : 0;
      var err = setpoint - s.pressure_mpa;
      s._heater_dp_frac = err > 0 ? clip(err / p.heater_band_mpa, 0, 1) : 0;
    }
    // NO AC, NO HEATERS. The pressurizer heaters are a ~1 MW resistance load on the
    // plant's AC switchgear, and a station blackout is DEFINED as not having any.
    // 10 CFR 50.2: station blackout is "the complete loss of alternating current (ac)
    // electric power to the essential and nonessential switchgear buses in a nuclear
    // power plant (i.e., loss of offsite electric power system concurrent with turbine
    // trip and unavailability of the onsite emergency ac power system)", and it "does
    // not include the loss of available ac power to buses fed by station batteries
    // through inverters" — that exclusion is the vital instrument AC, which is why the
    // board keeps reading through a blackout while the heater banks do not run off it.
    //
    // DELIBERATELY NOT LOSS OF OFFSITE POWER. NUREG-0578 Item 2.1.1 / NUREG-0737 Item
    // II.E.3.1 put the minimum heater group needed to hold pressure in Mode 3 on
    // redundant emergency diesel-backed buses precisely so it SURVIVES a LOOP; the
    // blackout is the event that takes the diesels with it. `loss_of_offsite_power`
    // carries effect `coast_down_pumps` and never sets this flag, so its heaters keep
    // working — which is the whole distinction between the two casualties.
    //
    // This is a PHYSICAL de-energization, not a value written into the operator's
    // demand. Setting `heater_override = 0` instead would be undone by the very next
    // set_heater — the HEATER AUTO button or the % box on the board — which is exactly
    // the defect #200 found in stuck_open_spray. The selector position (`heater_auto`)
    // and the operator's demand are left as the operator set them; what goes to zero is
    // the power actually delivered, so the board's heater % reads the honest zero amps.
    // Same class as the spray's `flow_frac` scaling in stepPressure: an electrical/
    // hydraulic reality, not a control decision (HR2).
    // Reads `ac_available` rather than `station_blackout` since #332 — same value, but
    // the heaters are off because there is no ELECTRICITY, not because a casualty flag is
    // set. pwr_engine step 0a derives it and lists everything else on that bus.
    // `=== false`, not `!s.ac_available` — autoControl is called directly with hand-built
    // state objects by the engine's selfTest and ad-hoc pressurizer rigs, and a bare
    // negation would de-energize every one of them. Absent means energized, same
    // convention as pwr_primary.acAvailable.
    if (s.ac_available === false) { s.heater_power_frac = 0; s._heater_dp_frac = 0; }
    // NO WATER, NO HEATERS — the 17 % low-level heater cutoff (#334, 2026-08-04).
    // SOURCED, and the setpoint is the source's: WTSM 10.3 *Pressurizer Level Control
    // System* (ML11223A290) §10.3.4.1 — "This bistable provides a low level interlock at
    // 17% level in the pressurizer. In addition to providing a low level alarm, this
    // interlock isolates the letdown from the chemical and volume control system by
    // closing one letdown isolation valve and all orifice isolation valves, and turns off
    // all pressurizer heaters. … the heater cutoff protects the heaters which would be
    // damaged if operated in a steam environment." They are damageable because they are
    // "replaceable, direct-immersion, tubular-sheath type heaters … located in the lower
    // portion of the pressurizer vessel" (WTSM 3.2, ML11223A213).
    //
    // WHAT IT COST TO NOT HAVE IT, measured full stack: a 5 %-of-max cold-leg LOCA
    // refilled on ECCS to 120 % inventory, quenched the loop to ~100 C, and then the
    // heaters — still at 92 % with pzr_level_pct reading a flat 0 — drove the RCS back to
    // 2207 psi (15.22 MPa) with the coolant 240 C subcooled. There is no thermodynamic
    // source for that pressure; it is heater power alone. At 15.5 MPa the pressure-driven
    // ECCS curve delivers 0.0034 frac/s against a 0.050 leak, so the injection is
    // DEADHEADED, the core drains and stays dry, and the equilibrium heater ~ break is
    // STABLE. A 10 % and a 15 % break both survived, so the outcome was non-monotonic in
    // break size — the symptom that got #334 filed.
    //
    // HR1: reads the INDICATED level (previous step's instrument — instruments are step
    // 15, this is step 7, the CONTEXT §11 explicit coupling), never `pzr_level_pct`. A
    // real bistable is fed by a level transmitter channel and WTSM 10.3 says so twice
    // over — "One channel is used for level control, letdown isolation, and pressurizer
    // heater cutoff, while the other channel is used for backup letdown isolation and
    // heater cutoff." So a failed level transmitter must fool this interlock exactly as
    // it fools the operator, and run_behavior CA-9 leg D is what asserts that.
    //
    // DECLARED SIMPLIFICATION, same one #332 declared for the letdown interlock: the gate
    // is LIVE, so the heaters come back when level recovers. On the real plant the
    // operator resets. One operator action, not a different behaviour.
    //
    // THE OTHER HALF OF THIS BISTABLE ALREADY EXISTED, ONE LAYER UP — corrected 2026-08-04d.
    // The #334 write-up first claimed the letdown-isolation half was missing. It is not:
    // `pwr_control.js` PWR_ACTUATIONS carries `pzr_level` low at the same 17.0 setpoint
    // firing `set_letdown_orifices {a:false, b:false}`, LATCHED with `reset_below: 20.0`.
    // The claim came from grepping `pwr_primary.letdownFlow` — the ENGINE — and finding no
    // level gate there, which is the "know which LAYER a gate runs at" trap: an interlock
    // that reads an instrument and commands a valve is an M4 actuation and was never going
    // to be in the engine. Injection-verified afterwards: deleting that actuation reddens
    // run_reachability (66→65), run_ops and run_behavior, so it is covered as well as built.
    //
    // The two halves therefore live in DIFFERENT LAYERS, deliberately. Letdown isolation
    // is a valve command, so it is an M4 actuation like every other. The heater cutoff
    // CANNOT be, because the only command that would express it is `set_heater`, and an
    // actuation writing the operator's own demand is undone by the next button press —
    // the #200 defect exactly. So it is a de-energization here, the same shape as #329's
    // AC guard eleven lines up, which is the house idiom for taking power away from a
    // load without touching what the operator asked for.
    //
    // Physical de-energization, not a written demand — the #200/#329 rule. The selector
    // and the operator's % stay where they were put; what goes to zero is delivered power.
    // IT LATCHES, with the reset differential its own sibling already has (#348). A bistable
    // with no deadband on a noisy, lagged channel does not cut out — it CHATTERS, and this one
    // did: measured on a 10 % break with a full manual demand standing, the indicated level
    // dithers across 17 % and the heater bank flickers on for **35 % of every sample below the
    // setpoint**, in runs of up to 8, all of them between 16.3 % and 17.0 %. That is ~1 MW of
    // resistance heating cycling at the evaluation cadence, which is the #306 alarm-chatter
    // defect one system over.
    //
    // The differential is NOT invented here: WTSM 10.3 §10.3.4.1 describes ONE bistable doing
    // two things at 17 % — cut the heaters AND isolate letdown — and this plant already models
    // the letdown half latched, `pzr_level` low 17.0 with `reset_below: 20.0` in
    // PWR_ACTUATIONS. Two outputs of one bistable cannot have different reset behaviour, so
    // the plant was inconsistent with itself and the heater half is brought into line.
    //
    // Engine-side rather than an M4 actuation for the reason #334 records: the only command
    // that expresses this is `set_heater`, and an actuation writing the operator's own demand
    // is undone by the next button press (#200). `_heater_cut` is the latch; it reads the
    // INDICATED level on both edges (HR1), so a stuck transmitter still defeats it — leg D.
    var lvlInd = (s._ins_pzr_level != null) ? s._ins_pzr_level : s.pzr_level_pct;
    var cutAt = (p.heater_cutoff_level_pct != null) ? p.heater_cutoff_level_pct : 17.0;
    var restoreAt = (p.heater_restore_level_pct != null) ? p.heater_restore_level_pct : 20.0;
    if (lvlInd != null) {
      if (lvlInd < cutAt) s._heater_cut = true;
      else if (lvlInd >= restoreAt) s._heater_cut = false;
    }
    if (s._heater_cut) { s.heater_power_frac = 0; s._heater_dp_frac = 0; }
    // A spray valve stuck open is mechanical: it beats BOTH the auto controller and
    // any operator demand, the way porv_stuck beats porv_demand in relief() (#200).
    if (s.spray_stuck) { s.spray_flow_frac = 1; }
    else if (s.spray_override != null) { s.spray_flow_frac = +s.spray_override; }  // fraction (or boolean → 0/1)
    else {
      var err2 = setpoint - s.pressure_mpa;
      s.spray_flow_frac = err2 < 0 ? clip(-err2 / p.spray_band_mpa, 0, 1) : 0;
    }
    // Physical spray capacity (CC-5): the spray line can only pass so much — the
    // cap binds auto demand and operator override alike, so a loss-of-heat-sink
    // repressurization outruns it (the PORV does its job) while a step insurge
    // is still arrested.
    if (p.spray_flow_max != null) s.spray_flow_frac = clip(s.spray_flow_frac, 0, p.spray_flow_max);
  }

  // Resolve actual valve positions and relief flows.
  function relief(s, cfg) {
    var p = cfg.pressurizer;
    // PORV actual position: commanded demand, unless stuck open (a command-level failure).
    s.porv_open = s.porv_stuck || (s.porv_demand === 'open');
    // Backpressure is the LIVE containment pressure since #386 stage 1 (it was the
    // P_containment constant, forever). Null-guarded fallback to the constant so
    // rig-built states without containment fields keep the old behaviour. The
    // P_flow_ref denominator stays fixed — the valve coefficient is a rated-flow
    // calibration; only the numerator Δp goes live. Reads LAST step's containment
    // pressure (stepContainment runs at 14c) — explicit coupling, CONTEXT §11.
    var pb_ctmt = s.containment_pressure_mpa != null ? s.containment_pressure_mpa : p.P_containment;
    var dP_ratio = Math.sqrt(Math.max(0, (s.pressure_mpa - pb_ctmt) / p.P_flow_ref));
    // The PORV block (isolation) valve is upstream of the PORV. Closing it stops
    // ALL flow through the PORV line — relief AND inventory loss — regardless of
    // PORV position. This is the key TMI recovery action (isolate a stuck-open
    // PORV the indicator falsely reads "closed"). Default open.
    var isolated = (s.block_valve_open === false);
    // #408: a PARTIALLY stuck PORV passes its stuck fraction of rated flow; an
    // operator demand for full-open still gets the whole valve. Absent field → 1
    // (legacy saves and every pre-#408 rig are byte-identical by construction).
    var stuckFrac = (s.porv_stuck && s.porv_stuck_frac != null) ? s.porv_stuck_frac : 1;
    // When STUCK, the fraction rules REGARDLESS of demand: a hung disc answers
    // neither an open nor a close (the stuck_porv_open failure also intercepts
    // close_porv into open_porv for the indicator story, which would otherwise
    // silently promote a 20 % stick to a full-open demand — measured, the TMI
    // flagship's partial stick drained at 4.8x its fraction through that path).
    var openFrac = s.porv_stuck ? stuckFrac : ((s.porv_demand === 'open') ? 1 : 0);
    s.porv_flow = (s.porv_open && !isolated) ? p.porv_flow_max * openFrac * dP_ratio : 0;

    // Spring safety valves: COMMANDED state (open_pzr_safety/close_pzr_safety —
    // the control layer's actuation pops them at safety_open_mpa and reseats at
    // safety_reseat_mpa, reading the pressure instrument). Flow is hydraulics.
    s.safety_flow = s.safety_open ? p.safety_flow_max * dP_ratio : 0;
  }

  // Step 7 — primary pressure.
  function stepPressure(s, cfg, dt) {
    var p = cfg.pressurizer;
    var spEff = effectiveSetpoint(s, cfg, dt);
    autoControl(s, cfg, spEff);
    relief(s, cfg);
    // Spray draws from the cold leg downstream of the Reactor Coolant Pump (RCP),
    // so its effectiveness scales with primary flow — no flow, no spray.
    // Spray condenses the pressurizer steam bubble to control pressure, but it cannot
    // pull the LOOP below the saturation pressure of the HOTTEST coolant (Thot, the
    // core exit): below that the exit flashes to steam (pwr_thermal clamps the leg
    // split at Tsat) and boiling — not pressure control — takes over. Taper the spray's
    // authority to zero across a band above Psat(thot), so full heaters vs. full spray
    // floors just at the onset of core-exit boiling instead of running the primary down
    // to the containment floor. This is self-limiting: once thot pins to Tsat(P) the
    // floor equals P and spray stops. On a real cooldown Thot falls too, so the floor
    // tracks down and spray keeps depressurizing as fast as the plant actually cools.
    var spray_floor = P_sat_from_T(s.thot_c != null ? s.thot_c : s.tavg_c);
    var spray_authority = clip((s.pressure_mpa - spray_floor) / (p.spray_floor_band || 1.0), 0, 1);
    var spray_eff = s.spray_flow_frac * clip(s.flow_frac != null ? s.flow_frac : 1, 0, 1) * spray_authority;
    // MERGE (#347 x #350): both sides add here and both are kept, in THIS order. develop's
    // `spray_flow_pct` is an INDICATION of delivered spray and is taken from `spray_eff` as it
    // stands — the solid-plant gate below removes the spray's PRESSURE authority, not the water
    // the nozzle passes, and zeroing the readout with it would tell the operator the valve had
    // shut when it has not. Gate after publish.
    // DELIVERED spray, as % of the spray line's maximum flow — the indication half (#350
    // item 1). It is a genuinely different quantity from `spray_valve_pct`, which is the
    // valve DEMAND: the two diverge whenever the loop cannot supply the line, and both of
    // the ways that happens are physics the operator has to be able to see. Stop the RCPs
    // and the demand is unchanged while delivered spray goes to zero (`flow_frac`, the
    // comment above says so in words); run the plant down toward Psat(Thot) and the
    // authority taper closes it out even with the pumps running.
    //
    // Scaled here rather than on the board, because `spray_flow_max` is the constant that
    // makes the number mean anything and it lives in this layer. A percentage copied into
    // the UI would not move when the constant is retuned (#315).
    s.spray_flow_pct = clip(spray_eff / (p.spray_flow_max || 1), 0, 1.1) * 100;
    // NO BUBBLE, NO SPRAY (#347). Spray controls pressure by CONDENSING the steam bubble —
    // the sentence three lines above says so, and it is the whole mechanism. A water-solid
    // pressurizer has no steam to condense, so the spray's pressure authority is not merely
    // reduced, it is gone; what the nozzle adds is cold water, i.e. more mass.
    //
    // THIS WAS LOAD-BEARING, not cosmetic, which is why it is a fix and not a refinement.
    // #346 declared it a simplification. Measured afterwards on the one path that change did
    // not exercise — a stuck-open PORV with the operator correctly ISOLATING the block valve
    // — spray pinned at its 0.120 cap held pressure at 2320 psi against a solid plant taking
    // safety injection, which is 164 psi BELOW the code-safety setpoint. So the safeties never
    // lifted, the fill was arrested by nothing, and inventory walked back to the 120.00 %
    // `mass_max` clip: #346's defect exactly, re-entered through the pressure controller.
    // With the bubble gone the ladder works — pressure reaches the safeties and they cycle.
    //
    // The HEATERS have the same physical argument (no bubble to flash) and are deliberately
    // NOT changed here: they are already zero in this regime because pressure is above
    // setpoint, so the term is unobservable, and their authority is a ruled declared
    // departure (F14, `Manuals/12` §12.15). Nothing measured moves if they stay.
    var pzr_solid = !(s.primary_void_fraction > 0) && levelRaw(s, cfg) >= 100;
    if (pzr_solid) spray_eff = 0;
    // Break blowdown depressurizes the RCS — but ONLY while subcooled. Subcooled blowdown
    // (liquid out, bubble collapse) drives pressure directly down to saturation; once the
    // primary voids, the break vents steam that decay heat re-boils, so further depressurization
    // is governed by how fast the coolant COOLS (thermal.blowdown_gain → Tavg → the sat-pull
    // below), NOT this direct term. Gating it to the subcooled regime keeps pressure slaved to
    // Psat(tavg) in two-phase — thermodynamically consistent — instead of forcing impossible
    // superheat (pressure far below Psat(tavg) while Tavg stays hot).
    // Saturated regime = the primary voids OR Tavg is at/above Tsat(P) (Psat(Tavg) ≥ P).
    // There, pressure is slaved to Psat(Tavg) by flashing (the sat-pull below), so the
    // subcooled-LIQUID terms — the break depressurization and the thermal expansion/
    // contraction surge — are suppressed: a rapid cooldown (e.g. an HPI cold quench)
    // must NOT crash pressure via the surge term below saturation; the vapour space compensates
    // and pressure just tracks Psat(Tavg) down as the coolant cools.
    var p_sat_tavg = P_sat_from_T(s.tavg_c);
    var saturated = s.primary_void_fraction > 0 || p_sat_tavg > s.pressure_mpa;
    // NO BUBBLE, NO BLOWDOWN DEPRESSURIZATION (#361, 2026-08-05). `leak_depress` is a
    // BUBBLED-PLANT mechanism: liquid leaves the break, the steam bubble expands to fill the
    // volume it vacated, and pressure falls with it. A water-solid RCS has no bubble to
    // expand, so that path does not exist — the only way mass can move pressure is through
    // the bulk modulus, which is exactly what the solid surge term below already does.
    //
    // IT WAS A DOUBLE COUNT, and the arithmetic is why the solid gain never arrested the
    // fill. The break's mass IS inside `_dmass_dt`: `stepInventory` adds RELIEF back out of
    // the surge driver (`dm_surge = dm + porv_flow + safety_flow`) and deliberately does not
    // add the leak back, so a leak is carried by the surge already. Counting it a second time
    // here put 10·leak against the surge's 1300/776·net-dm. MEASURED full stack before this,
    // `large_loca` 0.5: the solid regime engages correctly at ~9 min (level 100 %, void 0,
    // deeply subcooled) and is simply out-gunned — 0.938 MPa/s of leak_depress against
    // ~0.26 MPa/s of surge — so pressure sat at 327 psi (2.25 MPa), never reached the ECCS
    // shutoff head, injection never terminated, and inventory walked to the 120.00 %
    // `primary.mass_max` guard at 21 min and pinned there for the rest of the run with
    // 274 °F (152 °C) of subcooling.
    //
    // `Manuals/12` §12.4c DOES NOT FORBID THIS, and the distinction matters enough to write
    // down because the next reader will check. §12.4c records a REFUSAL to fold RELIEF into
    // the surge: that moved the relieving equilibrium DOWN ~145 psi, put the plant further
    // below the ECCS shutoff head and un-deadheaded injection — the defect by another road.
    // This removes a SUBTRACTIVE term when solid, so the equilibrium moves UP, toward the
    // relief ladder rather than away from it. And `leak_depress` is not one of §12.4c's three
    // deferred terms (relief, spray, heaters), all three of which keep their steam-space
    // gains here as that note requires.
    // `pzr_solid` is the one computed above for the spray gate — reused, not recomputed, so
    // the two cannot drift apart and `levelRaw` is called once.
    var leak_depress = (saturated || pzr_solid) ? 0 : (p.K_leak_depressurize || 0) * (s.leak_flow || 0);
    // SURGE — ONE LAW, TWO DRIVERS (#337). A surge is a VOLUME displacement of the
    // pressurizer, and the pressurizer does not know what caused it. WTSM 3.2
    // (ML11223A213, p. 3.2-8) states the mechanism without reference to the cause:
    // "Temperature changes produces changes in coolant density, which force water into
    // (insurge) or out of (outsurge) the pressurizer. … If the RCS temperature decreases,
    // the contraction of the coolant produces an outsurge from the pressurizer. This is
    // accommodated by an expansion of the steam bubble and a corresponding decrease in
    // steam density and pressure."
    //
    // Until #337 only the THERMAL driver was wired. Losing RCS inventory displaces the same
    // volume out of the same pressurizer — a subcooled loop is incompressible everywhere
    // else, so there is nowhere else for it to come from — and moved pressure by nothing at
    // all: measured full stack, an SGTR that took pzr level 55.0 → 15.7 % and scrammed the
    // plant moved pressure 5 psi (0.034 MPa) and subcooling 0.2 F (0.1 C).
    //
    // The conversion for both drivers is ALREADY in the level line (stepLevel): level_per_tavg
    // %/C for expansion, level_per_mass %/frac for inventory — the same geometry, stated once.
    // So the law is written in LEVEL-RATE units and both drivers convert into it, which is why
    // the constant is `K_surge_level` (%/s) and no longer `K_surge` (C/s). The mass slope is
    // taken piecewise on the CURRENT deviation exactly as stepLevel takes it, so the two
    // cannot drift apart (they are equal since #330; the piecewise is what keeps them tied).
    //
    // `_dmass_dt` is stepInventory's REALISED mass rate read ONE STEP LATE — inventory is
    // step 9 and this is step 7 (CONTEXT §11 explicit coupling).
    var dm_lvl = (s._mass != null ? s._mass : 1.0) - 1.0;
    var surge_thermal = p.level_per_tavg * (s._dTavg_dt || 0);
    // THE SURGE MUST READ THE SAME LINE THE LEVEL SHOWS (#384 stage 4, latent since
    // #337). `levelBase` FLOORS at `level_prog_floor` below ~293 °C (the #289
    // cold-modes bookkeeping stand-in), so on a cold plant the level line credits
    // NO room from thermal contraction — while this term, reading `_dTavg_dt` raw,
    // went on crediting it. Two accountings of one vessel (the #330/#337 trap):
    // measured on the post-stage-4 sev-0.5 LOCA, the ECCS refill now arrives with
    // Tavg still ~360 °F and falling, the phantom contraction room (−2.9 %/s)
    // out-credited the insurge (+2.4 %/s), the solid arrest never fired, and
    // inventory rode the cooldown to the 120.00 % `mass_max` clip — #361's
    // signature by a THIRD road. Suppressed only where the inconsistency lives:
    // SOLID, base ON its floor, and CONTRACTING — the narrowest predicate that
    // restores agreement. The deeper question (a cold solid RCS really does hold
    // more mass — the floor denies the capacity growth) is the pressurizer
    // inventory node's to answer (#385 follow-on), noted there.
    if (surge_thermal < 0 && pzr_solid
        && levelBase(s, cfg) <= p.level_prog_floor + 1e-9) surge_thermal = 0;
    var surge_rate = surge_thermal
                   + p.level_per_mass * (s._dmass_dt || 0);
    // WATER-SOLID — the surge meets LIQUID, not a bubble (#346). K_surge_level is the
    // gain of a pressurizer that still HAS a steam space: a surge is soft because the
    // bubble absorbs it. Once the level line reaches 100 % there is no bubble, the RCS is
    // incompressible everywhere, and the same displacement compresses water instead — so
    // the gain steps up to the bulk modulus. Same law, same currency (%/s of level
    // displacement), one factor; see `solid_bulk_mpa` in pwr_config for the number.
    //
    // Until #346 this was MISSING and the plant discarded the mass instead: `_mass` clipped
    // at `primary.mass_max` and the surge driver clipped with it, so a solid RCS taking
    // 0.024 frac/s of safety injection with no relief path reported ZERO surge and sat flat
    // at 15.39 MPa for 45 minutes while ECCS never terminated. The clip's comment named
    // the two options as "zero surge" or "a phantom insurge"; the physical answer is
    // neither — the plant RELIEVES.
    //
    // Gated on `!saturated` with the rest of the surge, and that gate is not a formality:
    // a two-phase RCS is compressible by definition, so "solid" and "saturated" cannot both
    // be true, and the sat-pull branch below owns that regime.
    //
    // THE GAIN IS THE ONLY THING THAT CHANGES. Relief keeps its own steam-space gains under
    // F15, and spray and the heaters keep theirs — none of which is strictly right in a
    // vessel with no bubble. Moving them is a coupled three-term regime plus a re-solve of
    // the relief gains, and taking only one term of it was measured to be WORSE than taking
    // none: see the F15 note in pwr_primary.stepInventory, and `Manuals/12` §12.4c.
    var solid = !saturated && pzr_solid;
    var K_surge = solid ? (p.solid_bulk_mpa / p.level_per_mass) : p.K_surge_level;
    // Computed BEFORE the regime branch — the containment floor below applies in BOTH
    // branches, and a `var` inside the saturated arm would read undefined on exactly
    // the flicker steps that need it (#384 stage 4). Keyed on the HOLE EXISTING
    // (`_leak_base`), not on flow: below the backpressure the √Δp law clips forward
    // flow to zero, so a `leak_flow > 0` key would disarm the floor at exactly the
    // pressure it exists to hold — measured, minP pinned on the 0.1 clamp that way.
    var loopBreak = (s._leak_base > 0) && !s._leak_to_sg;
    var pb_vent = s.containment_pressure_mpa != null ? s.containment_pressure_mpa : p.P_containment;
    // RELIEF AT SOLID JOINS THE BULK-MODULUS REGIME (2026-08-07, with the proportional
    // valve ruling). K_porv/K_safety_relief are steam-space gains — a bubble absorbs the
    // vent softly, so the fitted K is large per unit mass. A SOLID vessel has no bubble:
    // the pressure a vented mass releases is the same bulk-modulus stiffness the surge
    // uses, so the per-unit-mass gain switches to `solid_bulk_mpa` exactly as K_surge
    // does. This is the third term of the §12.4c coupled regime (spray was zeroed at
    // solid in #346, the surge stepped to the bulk modulus in #346, relief now follows).
    // It went unmeasured while the valve out-passed injection; at the plant-sized valve
    // the incoherence BOUND — the bubble-gain K (0.786 MPa/s authority) parked pressure
    // at the PORV band while the valve's real 2.5e-4 frac/s could not pass the 3.3e-4
    // of unterminated ECCS, and inventory walked to the mass_max clip (CA-12 red, the
    // #361 signature by a fourth road). With the switch, pressure honestly climbs to
    // the SAFETIES, whose 8e-4 passes the flow, and the fill arrests clear of the clip.
    // Relief mass is NOT in surge_rate (#361 adds it back out of dm_surge), so there is
    // no double count.
    var K_pv = solid ? p.solid_bulk_mpa : p.K_porv_relief;
    var K_sv = solid ? p.solid_bulk_mpa : p.K_safety_relief;
    var dP = (s._heater_dp_frac != null ? s._heater_dp_frac : s.heater_power_frac) * p.K_heater
           - spray_eff * p.K_spray
           - s.porv_flow * K_pv
           - s.safety_flow * K_sv
           - leak_depress
           + (saturated ? 0 : K_surge * surge_rate);   // subcooled liquid only
    if (saturated) {
      // Two-phase OR superheated: a liquid cannot superheat — as pressure falls to the
      // saturation pressure of Tavg the coolant flashes, and that flashing PINS pressure
      // AT Psat(Tavg) rather than letting it crash below (which would report impossible
      // negative subcooling). The operator depressurizes by COOLING (Tavg down → Psat
      // down), which this tracks. Also engages when the primary voids (TMI erosion). The
      // superheat branch is independent of the void bookkeeping, so a depressurization at
      // FULL/overfilled inventory (e.g. an SGTR EOP on HPI) still holds saturation without
      // touching primary_void_fraction (and thus the calibrated pressurizer void-surge).
      //
      // WITH A LOOP BREAK VENTING THE STEAM, THE PIN WEAKENS AND A VENT TERM JOINS IT
      // (#384 stage 4). The sat-pull models flashing REPLACING the pressure the break
      // removes — closed-system physics. A loop break is an open hole: the steam the
      // flash makes LEAVES, so as the loop approaches full void the pin approaches zero
      // authority and the vented RCS blows down toward the containment backpressure —
      // WTSM 5.0 §5.0.1.1: "In a short time the reactor coolant system has flashed to
      // steam and the pressure has equalized with the pressure inside the containment.
      // At this time the blowdown phase … has ended." Measured before this term, a
      // full-size break FLOORED at 9.4× saturation with the hole open (#384).
      //
      // BOTH scalings are PATH-SCOPED to a flowing loop break, and that is the fix the
      // 2026-08-06 revert taught: its terms were VOID-scoped, so they also weakened the
      // pin on the stuck-PORV path (relief is not a loop hole — the discharge is the
      // PORV's own metered flow, and the TMI erosion arc lives on the full pin) and on
      // the no-break boiling paths (CA-12's transit). `_leak_to_sg` is excluded — an
      // SGTR discharges into the SG, a closed receiver, not containment.
      //
      // The vent term is ·void TWICE over: scoped by loopBreak (leak_flow > 0) and
      // scaled by void, so it is IDENTICALLY ZERO when solid (void 0) — CA-19's
      // injection≈spillage equilibrium and CA-15's solid arrest cannot be reached by
      // it, which is what un-does the revert's overfill failure. Backpressure is the
      // LIVE containment pressure (#386 stage 1), one step late, CONTEXT §11.
      var vf = s.primary_void_fraction || 0;
      // The steam path at the break is max(THERMAL void, DRAINED fraction) — #408
      // wave 1, measured: an ECCS-quenched sev-0.1 break read void 0.000 at 55 %
      // inventory (the void line is subcooling-gated, and half the coolant being
      // GONE is not thermal voiding), which killed the ×void vent below and let the
      // restore/heater side repressurize a drained RCS to 6.9 MPa against a
      // 13-inch-class hole — clad ran to damage. A drained RCS has a steam space
      // at the break by construction, whatever the bulk subcooling reads.
      var vfVent = Math.max(vf, Math.min(1, Math.max(0, 1 - (s._mass != null ? s._mass : 1))));
      // (`loopBreak` / `pb_vent` computed above the branch, with the floor.)
      // The pull TARGET floors at the containment backpressure when vented: two
      // connected volumes equalize, they do not cross — without this floor the
      // weakened pin drags P toward Psat of the ECCS-quenched bulk (~1.5 psia),
      // BELOW the receiving building, and the run pins on the 0.1 numerical clamp
      // (measured in the K_break_vent sizing grid).
      var p_pin = loopBreak ? Math.max(p_sat_tavg, pb_vent) : p_sat_tavg;
      dP += p.K_sat_pull * (loopBreak ? (1 - vfVent) : 1) * (p_pin - s.pressure_mpa);
      if (loopBreak && p.K_break_vent) {
        dP -= p.K_break_vent * s.leak_flow * vfVent * Math.max(0, s.pressure_mpa - pb_vent);
      }
    } else {
      // Gentle self-restore toward the (slewed) operator setpoint (heaters/charging
      // holding pressure). Tracks the effective setpoint so a cold/depressurized
      // plant holds its low pressure instead of being dragged back to NOP — and a
      // raised setpoint pressurizes at the slew pace, not at restore-gain speed.
      // GATED OFF while a loop break flows, AND while the 17 % heater cutoff is in
      // force (#408 wave 1): this term is a stand-in for heater/charging authority.
      // With a hole open there is nothing physical behind it (measured: it balanced
      // leak_depress at 6.9 MPa and held a drained sev-0.1 RCS there until clad
      // damage); with the heaters CUT on low level, 60 gpm of charging cannot
      // restore RCS pressure either (measured: it parked a TMI-fraction stuck-PORV
      // plant at 10.93 MPa, 21 °F subcooled, FOREVER — the deception arc could
      // never reach saturation). The #334 heater-deadhead shape, third clothing.
      //
      // AND GATED OFF AT SOLID (2026-08-07, the fourth clothing, found the same day
      // the relief gains joined the bulk-modulus regime): with no bubble, pulling
      // pressure toward the setpoint without mass leaving is the discard class —
      // measured, at P 16.15 it soaked −0.015 MPa/s (over half the 1300 x 2.1e-5
      // repressurization from unterminated ECCS), so the PORV under-cycled ~50 %
      // and inventory crept 1.65e-5 frac/s to the mass_max clip anyway. Heaters
      // and spray are already stood down in this regime; their stand-in follows.
      if (!loopBreak && !s._heater_cut && !solid) dP += p.P_restore_rate_gain * (spEff - s.pressure_mpa);
    }
    s.pressure_mpa = Math.max(0.1, s.pressure_mpa + dP * dt);
    // TWO CONNECTED VOLUMES EQUALIZE, THEY DO NOT CROSS (#384 stage 4): with a loop
    // break open the RCS cannot end a step below the building it discharges into —
    // backflow through the hole holds it up. Applied in BOTH regime branches, because
    // the undershoot is not the vent/pin terms (both die at the backpressure): it is
    // the void bookkeeping's saturation-gate flicker dropping single steps into the
    // SUBCOOLED branch, where `leak_depress` is a constant-rate sink with no Δp in it
    // (#384's own mechanism-2 note; the full Δp re-solve of that term stays deferred
    // on #384's staging). A declared floor, not a silent clip: CA-20 asserts it — and
    // asserts the approach to it — so this line is load-bearing in a probe.
    if (loopBreak) s.pressure_mpa = Math.max(s.pressure_mpa, Math.min(pb_vent, 15.41));
  }

  // PORV tailpipe / quench-tank line temperature. First-order pull toward the
  // flowing-discharge temperature while ANY relief flow passes (PORV or code
  // safeties share the discharge header), and a slow decay back toward the
  // warm-baseline (leaky-seat) temperature once the line is isolated or the
  // valve reseats. This is the honest-but-unalarmed indication that revealed
  // the stuck-open PORV at TMI-2 (~80 min) and Davis-Besse (~20 min).
  function stepTailpipe(s, cfg, dt) {
    var p = cfg.pressurizer;
    if (s.tailpipe_temp_c == null) s.tailpipe_temp_c = p.tailpipe_ambient_c;
    var flowing = (s.porv_flow + s.safety_flow) > 1e-6;
    var target = flowing ? p.tailpipe_hot_c : p.tailpipe_ambient_c;
    var tau = flowing ? p.tailpipe_heat_tau : p.tailpipe_cool_tau;
    s.tailpipe_temp_c += (target - s.tailpipe_temp_c) * (dt / (tau + dt));
  }

  // The thermal-expansion base line: where TRUE level sits at nominal inventory
  // for a given Tavg. Anchored at pzr_level_nominal for the full-power equilibrium
  // Tavg (s._tavg_fp, stashed by the engine), floored below the program band —
  // the CVCS level program (pwr_primary) targets this same line, so setpoint and
  // physics agree by construction and thermal expansion never reads as a leak.
  //
  // UNBOUNDED UPWARD, because the coolant really does expand and there is nothing
  // physical at 100 to stop it — the vessel simply fills. It carried an UNDOCUMENTED
  // upper clip at 100 from v1 until 2026-08-05 (#362), which contradicted the stated
  // contract of BOTH consumers (levelProgram's "levelBase is unbounded upward", and
  // levelRaw's "a reading pinned at 100 cannot answer the water-solid question") and
  // disarmed the two regimes that read it. It bound at Tavg 611.6 F (322.0 C), which is
  // INSIDE the subcooled operating range at NOP — Tsat is 653.2 F (345.1 C).
  //
  // WHAT IT COST, measured full stack on a loss of heat sink (afw_failure +
  // loss_of_feedwater): the gauge sat DEAD FLAT at 61.5 % — `level_prog_ceiling`, the
  // number a healthy plant reads — for ten plant-minutes while Tavg rose 614.2 → 651.2 F
  // (323.4 → 344.0 C) and subcooling collapsed 39.0 → 6.2 F (21.7 → 3.4 C). Not pegged at
  // 100, which an operator would read as going solid: parked on normal. The CVCS servo
  // converged on the same false equilibrium, because program and indication rode the same
  // clip, so charging = letdown and inventory stopped moving at 95.04 %. With it,
  // #347's NO-BUBBLE-NO-SPRAY gate never armed (spray held 20–24 % authority in a vessel
  // with no steam to condense) and #346's bulk-modulus surge gain never armed (K_surge
  // 0.400 against the solid 1.675, a 4.19x understatement).
  //
  // The clip bound ONLY on the hot-and-drained family — measured incidence per sample:
  // loss of heat sink 95.7 %, station blackout 87.9 %, and 0.0 % on hot_full_power idle,
  // large LOCA 0.5, small LOCA 0.05, SGTR 0.25, stuck-open PORV, cold_shutdown and
  // hot_zero_power. A LOCA path drains and COOLS, so its base line runs the other way.
  //
  // THE LOWER CLIP STAYS and is deliberate (#289): the normalized mass bookkeeping does
  // not model the real cold-plant mass surplus, so `level_prog_floor` stands in for CVCS
  // keeping the pressurizer on span in the cold modes. `levelProgram` re-clips at BOTH
  // ends, so the program band is untouched by this; `stepLevel` clips the GAUGE to 0..100,
  // so indication now pegs at 100 (reads as going solid) instead of parking on 61.5.
  function levelBase(s, cfg) {
    var p = cfg.pressurizer;
    var tref = (s._tavg_fp != null) ? s._tavg_fp : 304.0;
    var base = p.pzr_level_nominal + p.level_per_tavg * (s.tavg_c - tref);
    return Math.max(base, p.level_prog_floor);
  }

  // The CVCS LEVEL PROGRAM — what the level controller holds, and what the deviation gauge
  // reads against. The same line as levelBase, clamped at BOTH ends the way the real program
  // is (#289; WTSM 10.3 Pressurizer Level Control System, ML11223A290: "both minimum and
  // maximum level limitations are placed on the level program", low 25 % / high 61.5 %).
  //
  // PROGRAM AND PHYSICS ARE DIFFERENT LINES ABOVE THE CEILING, and that is the whole point.
  // levelBase is unbounded upward because the coolant really does expand; the program stops,
  // so a Tavg parked high reads as level ABOVE program and the CVCS lets it down — which is
  // what stopped a load rejection with rods in MANUAL scramming on the 97 % going-solid trip.
  // Every consumer of "the program" must call THIS, not levelBase, or the controller and the
  // deviation gauge disagree about what the plant is being held to.
  function levelProgram(s, cfg) {
    var p = cfg.pressurizer;
    return clip(levelBase(s, cfg), p.level_prog_floor, p.level_prog_ceiling);
  }

  // The pressurizer level line, DERIVED from state (CC-10 rework) and UNCLIPPED:
  //   level = base(Tavg) + level_per_mass·(mass − 1) + level_per_void·void
  // No integrator: level and inventory cannot silently drift apart. The void term
  // pushes liquid INTO the pressurizer as the primary voids, raising indicated
  // level even as total inventory falls — the TMI deception (§6.4) — and it is
  // active ONLY when the primary actually saturates (primary_void_fraction is
  // saturation-gated in pwr_primary). Relief/leak/charging flows act on level
  // through the MASS balance (stepInventory), not through separate level terms.
  //
  // UNCLIPPED, and it has TWO consumers for that reason (#346). stepLevel clips it to
  // the 0–100 gauge span for indication; stepPressure needs it raw, because "is there
  // any steam space left" is exactly the water-solid question and a reading pinned at
  // 100 cannot answer it. ONE formula, because a copy in the second consumer would not
  // move when this one did.
  function levelRaw(s, cfg) {
    var p = cfg.pressurizer;
    var dm = (s._mass != null ? s._mass : 1.0) - 1.0;
    // Piecewise mass term — and THE TWO SLOPES ARE EQUAL (#330; both 776 %/frac), so
    // this branch is an identity today and the comment here used to say the opposite
    // ("a surplus reads ~3× steeper"), which is what #365 filed. It reads one way in
    // both directions because the pressurizer steam space is the ONLY compressible
    // volume in a subcooled loop: mass taken out comes out of the pressurizer and the
    // bubble grows to fill the space at exactly the rate a surplus packs into it. The
    // geometry does not know which way the flow is going.
    //
    // KEPT AS A BRANCH, NOT COLLAPSED, and that is a live decision rather than inertia
    // — the collapse is deferred behind the #361 solid-regime work, which reworks the
    // second consumer of this same piecewise (stepPressure's surge_rate). Until then a
    // future split is DELIBERATE rather than silent: CA-9 leg B pins the two against
    // each other through this very line, and a second check pins the surge branch.
    var mass_term = p.level_per_mass * dm;
    // PATH-AWARE VOID WEIGHTING (#385 stage 2). The void term models loop steam
    // displacing liquid UP THE SURGE LINE into the pressurizer — the TMI deception.
    // That displacement needs the surge line to be the discharge path. With a hole in
    // the LOOP, the displaced liquid splits between the hole and the surge line, and
    // on a large cold-leg break the pressurizer DISCHARGES instead: WCAP-16009-NP-A
    // (ML050910161) §11-4-5 — "the 2-phase discharge from the pressurizer surge line
    // … during the reverse flow period of blowdown" — and WTSM 5.0 (ML11223A218)
    // §5.0.1.1 has the loop flashed to steam, so there is no liquid reservoir to
    // displace anywhere. Unweighted, this term collapsed to base + 350·(1−m) on any
    // saturated drain and read EXACTLY 100 at the moment the core top uncovers, at
    // every board severity ≥ 0.15 (the #385 sweep, TUNING_LOG 2026-08-06-develop-e).
    //
    // The weight is a flow split, not a switch: w = ref/(ref + leak_flow), so
    // leak_flow == 0 (or absent — every rig-built state) gives w = 1.0 EXACTLY and
    // the stuck-PORV/safeties/loss-of-heat-sink families — the calibrated TMI arc,
    // whose breaks are at/above the pressurizer steam space — are byte-identical by
    // construction. CA-18 leg B pins the algebra, leg D pins the no-break fence.
    // *(OWNER RULING, 2026-08-06: selected "Term fix now + node follow-on" from three
    // options in plan review — a selection, not verbatim words.)*
    //
    // `leak_flow` is stepInventory's (step 9) read ONE STEP LATE — this is called
    // from steps 7/8 — the CONTEXT §11 explicit coupling, same as `_dmass_dt`.
    var wref = p.void_weight_surge_ref;
    var w = (wref != null) ? wref / (wref + (s.leak_flow || 0)) : 1;
    return levelBase(s, cfg) + mass_term + p.level_per_void * w * (s.primary_void_fraction || 0);
  }

  // Step 8 (pzr part) — indicated pressurizer level: the line above, on span.
  //
  // THE PRESSURIZER INVENTORY NODE (#385 follow-on, stage 1 — INERT). `pzr_mass_frac`
  // is the pressurizer's liquid content in RCS-mass-fraction units — the same currency
  // as `_mass`, of which it is a SHARE, never a second inventory (the #418 C_tube rule:
  // a node's capacity comes OUT of what it split from; the loop's share is the implicit
  // `_mass − pzr_mass_frac`). The geometry map is `level_per_mass`: 1 RCS-frac = 776
  // points of level, so nominal 55 % holds 55/776 ≈ 0.0709 and the vessel is full at
  // 100/776 ≈ 0.1289 — no new constant, the capacity IS the existing slope.
  //
  // STAGE 1 IS AN IDENTITY BY CONSTRUCTION: the node integrates the realized per-step
  // delta of the derived line, applied as a DELTA (`node = target`), not `flow·dt` —
  // `(Δ/dt)·dt` re-rounds in floats, and "reproduces today's level line" is the ruled
  // gate, not a goal. Indication still publishes from `levelRaw` directly, because
  // `level_per_mass·(lvl/level_per_mass)` can differ by an ulp and any movement in
  // stage 1 is a defect. Stage 2 replaces this integrator with the physical surge law
  // (pzrSurgeFlows) and flips publication to the node; the surge flow it realizes is
  // stashed on `_pzr_surge_flow` (frac/s, + = insurge) from day one so the pressure
  // consumer has the same quantity available when the rewire comes.
  function stepLevel(s, cfg, dt) {
    var p = cfg.pressurizer;
    var lvl = levelRaw(s, cfg);
    if (s.pzr_mass_frac == null) s.pzr_mass_frac = lvl / p.level_per_mass;  // lazy init — rig-built states (#418 idiom)
    var target = lvl / p.level_per_mass;
    s._pzr_surge_flow = dt > 0 ? (target - s.pzr_mass_frac) / dt : 0;
    s.pzr_mass_frac = target;
    s.pzr_level_pct = clip(lvl, 0, 100);
  }

  RD.pwrPressurizer = {
    P_sat_from_T: P_sat_from_T,
    effectiveSetpoint: effectiveSetpoint,
    autoControl: autoControl,
    relief: relief,
    stepPressure: stepPressure,
    levelBase: levelBase,
    levelProgram: levelProgram,
    levelRaw: levelRaw,
    stepLevel: stepLevel,
    stepTailpipe: stepTailpipe,
  };

})(globalThis.RD || (globalThis.RD = {}));
