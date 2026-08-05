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
    var dP_ratio = Math.sqrt(Math.max(0, (s.pressure_mpa - p.P_containment) / p.P_flow_ref));
    // The PORV block (isolation) valve is upstream of the PORV. Closing it stops
    // ALL flow through the PORV line — relief AND inventory loss — regardless of
    // PORV position. This is the key TMI recovery action (isolate a stuck-open
    // PORV the indicator falsely reads "closed"). Default open.
    var isolated = (s.block_valve_open === false);
    s.porv_flow = (s.porv_open && !isolated) ? p.porv_flow_max * dP_ratio : 0;

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
    var leak_depress = saturated ? 0 : (p.K_leak_depressurize || 0) * (s.leak_flow || 0);
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
    var surge_rate = p.level_per_tavg * (s._dTavg_dt || 0)
                   + (dm_lvl < 0 ? p.level_per_mass : p.level_per_mass_surplus) * (s._dmass_dt || 0);
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
    var K_surge = solid ? (p.solid_bulk_mpa / p.level_per_mass_surplus) : p.K_surge_level;
    var dP = (s._heater_dp_frac != null ? s._heater_dp_frac : s.heater_power_frac) * p.K_heater
           - spray_eff * p.K_spray
           - s.porv_flow * p.K_porv_relief
           - s.safety_flow * p.K_safety_relief
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
      dP += p.K_sat_pull * (p_sat_tavg - s.pressure_mpa);
    } else {
      // Gentle self-restore toward the (slewed) operator setpoint (heaters/charging
      // holding pressure). Tracks the effective setpoint so a cold/depressurized
      // plant holds its low pressure instead of being dragged back to NOP — and a
      // raised setpoint pressurizes at the slew pace, not at restore-gain speed.
      dP += p.P_restore_rate_gain * (spEff - s.pressure_mpa);
    }
    s.pressure_mpa = Math.max(0.1, s.pressure_mpa + dP * dt);
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
  function levelBase(s, cfg) {
    var p = cfg.pressurizer;
    var tref = (s._tavg_fp != null) ? s._tavg_fp : 304.0;
    var base = p.pzr_level_nominal + p.level_per_tavg * (s.tavg_c - tref);
    return clip(base, p.level_prog_floor, 100);
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
    // Piecewise mass term: a DEFICIT draws down the whole loop (shallow); a
    // SURPLUS packs into the pressurizer steam space — the only compressible
    // volume — so it reads ~3× steeper (the "going solid" regime).
    var mass_term = dm < 0 ? p.level_per_mass * dm : p.level_per_mass_surplus * dm;
    return levelBase(s, cfg) + mass_term + p.level_per_void * (s.primary_void_fraction || 0);
  }

  // Step 8 (pzr part) — indicated pressurizer level: the line above, on span.
  function stepLevel(s, cfg, dt) {
    s.pzr_level_pct = clip(levelRaw(s, cfg), 0, 100);
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
