/*
 * pwr_control.js — the PWR's control layer, as data (HR1/HR3/HR8).
 *
 * Everything plant-specific the Control Layer kernel (control_kernel.js) runs
 * for the PWR: protection trips, engineered-safety actuation, alarms, failure
 * definitions, and interlocks (originally engines/pwr/pwr_protection.js, M1 §9).
 * The engine itself acts on none of it — it only exposes the instruments these
 * rules read and the controls they drive.
 *
 * All setpoints read INSTRUMENTS (HR1), in SI units (MPa / °C / % / normalized).
 * There is no longer any exception: the low-flow trip's `__true_flow__` sentinel was
 * retired 2026-07-29 when the `rcs_flow` elbow-tap channel was built (#247).
 * Attaches RD.PWR_CONTROL, plus the legacy names RD.PWR_PROTECTION and
 * RD.PWR_CONFIG.protection (the engine's failure dispatch reads the latter);
 * loads after pwr_config.js.
 */
;(function (RD) {
  'use strict';

  // Trips — { instrument, direction, setpoint, action }. Any trip scrams.
  // Optional: id (referenced by set_trip_block), condition (evaluates only
  // while it holds), blockable (manually blockable above the P-10 permissive).
  var PWR_TRIPS = [
    { instrument: 'power_range',      direction: 'high', setpoint: 120.0,  action: 'scram' }, // % rated
    { instrument: 'tavg',             direction: 'high', setpoint: 335.0,  action: 'scram' }, // °C
    { instrument: 'primary_pressure', direction: 'high', setpoint: 16.44,  action: 'scram' }, // MPa
    // Low-pressure reactor trip. Bypassable in the cold/shutdown regime (the real
    // P-11 permissive, ~1970 psig / 13.6 MPa): a plant that INITIALIZES depressurized
    // (cold_shutdown) starts with this trip blocked, and it AUTO-REINSTATES the moment
    // pressure climbs back above P-11 during heatup. At power the permissive is not
    // satisfied, so the trip is never blocked — a LOCA/TMI depressurization still trips.
    { id: 'lo_press', instrument: 'primary_pressure', direction: 'low', setpoint: 12.41, action: 'scram', // MPa
      blockable: true, block_permissive: { instrument: 'primary_pressure', direction: 'low', setpoint: 13.6 } },
    { instrument: 'pzr_level',        direction: 'low',  setpoint: 12.0,   action: 'scram' }, // %
    // SG lo-lo. AFW auto-starts 3 points ABOVE it, at 20 % — a DECLARED DEPARTURE
    // (§8.19, #220 claim 6). The real plant uses ONE signal at ONE setpoint for both:
    // *"1. Low-low water level in any single steam generator…"* is the first of the five
    // AFW auto-start conditions (WTSM §5.7, ML11223A229), and it is the same low-low
    // level function that trips the reactor (NUREG-1431 Tables 3.3.1-1 / 3.3.2-1). The
    // offset is ours, and it buys the operator a visible "AFW started, level still
    // falling" window that a single-setpoint plant does not give a lone trainee. Our
    // other two starts DO match the real list — loss of main feed above P-9 is their
    // condition 3, and the SI start is their condition 4.
    { instrument: 'sg_level',         direction: 'low',  setpoint: 17.0,   action: 'scram' }, // % lo-lo (AFW auto-starts just above, 20 %)
    // Low-flow reactor trip. Reads the `rcs_flow` ELBOW-TAP CHANNEL (% of rated) as of
    // 2026-07-29 (#247); until then it read true `pump_flow_pct` through a
    // `__true_flow__` sentinel, so it could not be lagged, fooled or drifted and the
    // trip was unteachable. Bypassable below the P-7 low-power permissive: the RCPs are
    // secured in cold shutdown (RHR provides circulation), so the trip is blocked at a
    // depressurized/low-power init and re-arms above P-7. At power it is never blocked —
    // a real RCP trip / loss of flow (pwr_lof) still scrams.
    //
    // SETPOINT: 90 % of rated, blocked below 10 % power (P-7). Both are the real
    // Westinghouse numbers — WTSM 12.2 Table 12.2-1 row 12 (ML11223A301): "Low Reactor
    // Coolant Flow · 2/3 per loop · < 90 % of rated flow", and "All the reactor coolant
    // low flow trips are automatically blocked below the P-7 setpoint (10 % power)".
    // Adopted 2026-07-29 (#248, owner ruling) replacing an unsourced 25 % / 5 % pair.
    //
    // MEASURED, not reasoned (HR12), on hot_full_power + RCP trip through the M5 stack:
    // the indication crosses 90 % at 1.8 s and 25 % at 16.2 s, and DNB onset
    // (core_void ≥ 0.02) is at 10.9 s. So 90 % trips ~9 s BEFORE the hot channel boils
    // and 25 % tripped ~5 s after it — the old setpoint's whole effect was to let DNB
    // happen. Scanned for spurious trips too: of the depressurizing casualties only the
    // large LOCA reaches 90 % (at 6 s, on RCP cavitation) and it has already scrammed at
    // 3 s on low pressure; small LOCA, stuck-open PORV (the TMI opener) and SGTR never
    // leave 100 %. The TMI flagship is untouched.
    //
    // ONE REMAINING IDENTITY DEPARTURE, recorded rather than quietly carried: this trip
    // is ONE channel, not 2/3 per loop (NUREG-1431 Bases B 3.3.1A Fn 10, ML12100A228:
    // "Each RCS loop has three flow detectors… The LCO requires three Reactor Coolant
    // Flow - Low channels per loop"). The plant is single-loop and every other protection
    // function here is single-channel, so 2/3 on flow alone would be inconsistent with
    // the whole instrument model — and 2/3 exists precisely to stop one lying transmitter
    // mattering, which would delete the stuck-high teaching case #247 built this for.
    { id: 'lo_flow', instrument: 'rcs_flow', direction: 'low', setpoint: 90.0, action: 'scram', // % of rated
      blockable: true, block_permissive: { instrument: 'power_range', direction: 'low', setpoint: 10.0 } },
    // RCP BREAKER POSITION reactor trip (#314). SOURCED, WTSM 12.2 §12.2.3.12 item 2
    // (ML11223A301): *"A contact associated with each reactor coolant pump power supply
    // breaker supplies a signal to the logic section of the reactor protection system.
    // The reactor trips if at least two reactor coolant pump breakers open."*
    //
    // WHY IT EXISTS ALONGSIDE lo_flow, and it is the whole point: this is a CONTACT, not
    // a process measurement. `lo_flow` is one elbow-tap channel and a stuck transmitter
    // defeats it completely — measured, `pwr_lof` rode 36 s of core boiling to peak void
    // 0.628 and fuel 1713 °F (934 °C) before an unrelated backstop caught it. A breaker
    // auxiliary contact cannot be fooled by that transmitter. Diverse protection paths,
    // which is why the real plant carries four loss-of-flow trips and not one.
    //
    // COINCIDENCE — 1/1, a DECLARED adaptation, not the real 2-of-4. The real rule means
    // "half the pumps are gone"; this plant is single-loop with one RCP, so its analog is
    // "the pump is gone". Inventing a second pump to vote with would be a fabricated
    // signal (the #220 class).
    //
    // BLOCKED BELOW P-7, and this half is sourced VERBATIM from the same section:
    // *"All the reactor coolant low flow trips are automatically blocked below the P-7
    // setpoint (10% power)."* It rides the identical permissive as `lo_flow` above, so
    // `_initialTripBlocks` auto-blocks it at any init where the pumps are legitimately
    // secured — Mode 5 cold shutdown ships `rcp_running` false and `rcs_flow` 0.0, and
    // would otherwise carry a standing trip.
    //
    // NOT BUILT, deliberately (DESIGN_COMPANION §8.24): the RCP bus UNDER-VOLTAGE (item 3)
    // and UNDER-FREQUENCY (item 4) trips. Both sense an RCP electrical bus this plant does
    // not model, so building them means inventing the signal rather than reading one.
    { id: 'rcp_breaker', instrument: 'rcp_running', direction: 'is_false', setpoint: null, action: 'scram',
      blockable: true, block_permissive: { instrument: 'power_range', direction: 'low', setpoint: 10.0 } },
    // Startup nuclear-instrumentation trips (the startup safety net):
    // SR high flux at shutdown — 1e5 cps ≈ 0.02 % power; live only while the
    // detector is energized (secure the SR during the SR→IR handoff or trip).
    { id: 'sr_high',         instrument: 'source_range',       direction: 'high', setpoint: 1.0e5,
      action: 'scram', condition: 'sr_energized' },
    // IR high flux — chamber current equivalent to ~20 % power (the chamber's
    // calibrated band tops out ~12 %; the trip sits in its over-range headroom).
    // The startup net ladders P-10 (10 %) < IR trip (20 %) < PR low setpoint
    // (25 %): stop the ascent above P-10, block both, then continue — miss the
    // blocks and the net trips you. Auto-reinstated below P-10.
    { id: 'ir_high',         instrument: 'intermediate_range', direction: 'high', setpoint: 1.67e-3,
      action: 'scram', blockable: true },
    // Power-range LOW SETPOINT — 25 % (vs the 120 % full-power trip); the
    // at-power backstop of the startup net, blockable above P-10.
    { id: 'pr_low_setpoint', instrument: 'power_range',        direction: 'high', setpoint: 25.0,
      action: 'scram', blockable: true },
    // High-high SG level (P-14) reactor trip — the reactor-trip half of P-14, via the
    // P-9 interlock: with the turbine tripped and main feed isolated at high power, the
    // lost heat sink would drive a rapid heatup/overpressure transient, so the reactor
    // trips too. Gated by the above_p9 power permissive (≥50 %); below it the SG hi-hi
    // isolates feed and trips the turbine but does NOT scram. Keyed on the SG-level cause
    // (not the turbine-trip status) so it stays scoped to the overfeed/level event — a
    // turbine trip from another cause (MSIV closure, overspeed, vacuum) does not scram here.
    { id: 'p14_reactor_trip', instrument: 'sg_level', direction: 'high', setpoint: 90.0,
      action: 'scram', condition: 'above_p9' },
  ];

  // ---- Reactor Trip on Turbine Trip (P-9) — the ANTICIPATORY trip. ON. ----
  // SOURCED (#220 evidence pass; every claim below is quoted, none is recalled).
  // Real Westinghouse PWRs trip the reactor whenever the turbine trips above P-9 (~50 %
  // power) — sensed from 4/4 stop valves closed or 2/3 low autostop oil pressure, armed
  // above P-9 (or above P-7 at ~10 % in units with no P-9 installed; WTSM §12.2,
  // ML11223A301). It is classed ANTICIPATORY: *"provided to anticipate probable plant
  // transients and to minimize the resulting thermal transient on the RCS"*, and it is
  // NOT credited in the safety analyses — *"No credit was taken in the accident analyses
  // for operation of these trips"* (Salem TS Bases, ML18093A272).
  //
  // THE REAL PLANT'S REASON NOW APPLIES HERE TOO, and for two days it did not. Theirs is
  // dump capacity: P-9 sits at 50 % because *"for turbine trips from 50% power or less,
  // sufficient steam dump capacity is available for excess energy removal"* (WTSM §12.2)
  // — above that a 40 % dump cannot take it. This plant's dump was 105 %, so it could,
  // and the interlock was something a student had to be TOLD rather than shown. The dump
  // is **0.40** as of 2026-07-31 *(OWNER RULING: "Let's change it to 40%.")*, so the
  // premise above is this plant's premise: drive a full rejection and watch the dump hit
  // its stop.
  //
  // Two justifications stand alongside it and are worth keeping in view, because they are
  // what make the trip defence-in-depth rather than arithmetic:
  //   • the dump depends on the CONDENSER (real interlock C-9: vacuum + a circ-water
  //     pump, or the valves lose their air), and a turbine trip's cause frequently
  //     removes it — TR-8 is exactly that case, and it trips on a genuine limit instead;
  //   • the trip is uncredited in the real safety analyses, so "the plant could survive
  //     without it" was never the test.
  // Owner's question that produced this note (2026-07-26): *"If the steam dump can handle
  // a full load do we need the turbine trip? I thought those were related for some
  // reason."* They are related, that IS the real justification, and the answer at the time
  // was "kept for the residual two". Resizing the dump made the question moot instead of
  // answered, which is the better outcome — see #220 and the config comment.
  //
  // THIS PLANT NOW HAS IT — `protection.turbine_trip_reactor_trip: true`
  // (`pwr_config.js:763`), adopted 2026-07-26f after the #216 audit. This header said
  // "currently OFF … THIS PLANT DOES NOT HAVE IT" for a day after that flag flipped,
  // which is worth a moment: the comment narrating how a stale claim hardened into
  // "by design" had gone stale in precisely the same way. Corrected 2026-07-27b.
  // Keep the history below — it is why the trip exists, and it is the worked example
  // behind HR9.
  //
  // The absence had a tangled history (#216):
  //   • 2026-07-18 — a general P-9 WAS implemented, it broke the `pwr_msiv` mission, and
  //     it was narrowed to the SG-level cause for that reason; the realistic version was
  //     deferred because "it would require re-authoring pwr_msiv around a reactor trip".
  //   • The absence then hardened into "this plant has no turbine-trip reactor trip BY
  //     DESIGN", and that claim was used to reject adding it (#215).
  //   • TR-8's genuine "physics, not anticipation" ruling (2026-07-21) POSTDATES the
  //     scoping by three days, so it rationalised the gap rather than causing it.
  // Under HR9 ("err toward what real plants do") the presumption was that it belongs, and
  // that is how it was ruled. It was built here DEFAULT-OFF first, so the blast radius
  // could be measured by flipping one flag rather than guessed at — then turned ON, and
  // `pwr_msiv` was re-authored around the trip instead of the trip being narrowed around
  // the mission (#218). That ordering is the point: content followed the plant (HR9).
  //
  // NOT `blockable`, deliberately. `condition: 'above_p9'` IS the P-9 bypass: below 50 %
  // power the trip is bypassed AUTOMATICALLY, because there the plant genuinely can ride
  // a turbine trip out on the dump. That is the whole of the interlock — P-9 is a power
  // permissive, not an operator-selectable bypass like P-11/P-7/P-10 (which really are
  // operator-selectable). There are FIVE trips carrying `blockable` — `lo_press` and
  // `si_trip` (both P-11, below 13.6 MPa), `ir_high` and `pr_low_setpoint` (the default
  // P-10 permissive, above 10 % power) and `lo_flow` (below 10 % power). This comment
  // said "four" until 2026-08-03: `si_trip` is pushed further down this file rather than
  // into the array literal above, so a reader counting the literal gets four and stops
  // (#312). Count `blockable` across the whole file, not the first table in it.
  //
  // It was briefly shipped `blockable` with a redundant `power_range < 50` permissive.
  // Measured, that produced three defects, and the middle one is the reason the rule
  // "one interlock, one mechanism" matters:
  //   1. At full power `can_block` was TRUE, so an operator could defeat a reactor trip
  //      from the board and a subsequent turbine trip did NOT scram. No real plant lets
  //      you do that at power.
  //   2. Below P-9 the trip auto-blocked ON TOP of already being bypassed by its
  //      condition, so the board would report it "blocked" when it was merely N/A.
  //   3. A block set during startup was recorded as a MANUAL block, and manual blocks
  //      survive auto-reinstate by design — so it silently carried a defeated reactor
  //      trip all the way up to full power.
  // Defeating this trip is an out-of-fiction INSTRUCTOR action (the trips page), not a
  // control-board control. See #216.
  if ((RD.PWR_CONFIG.protection_options || {}).turbine_trip_reactor_trip) {
    PWR_TRIPS.push({ id: 'turbine_trip_reactor_trip', instrument: 'turbine_tripped',
      direction: 'is_true', setpoint: null, action: 'scram', condition: 'above_p9' });
  }

  // P-10, the nuclear at-power permissive: manual trip blocks are allowed only
  // above 10 % power-range power, and auto-clear (reinstate) below it.
  var PWR_TRIP_BLOCK_PERMISSIVE = { instrument: 'power_range', direction: 'high', setpoint: 10.0 };

  // Operator-facing names for instrument channels (#75). Instrument ids are source
  // identifiers, not words to put in front of an operator: the first cut of the RPS-reset
  // refusal read *"turbine_tripped is still is_true"*, which is a sentence only a
  // programmer can parse. Measured on a hot-full-power scram — that really is the first
  // thing standing in the way of a reset, so it is the message an operator would have met.
  //
  // One map rather than a label per trip, because several trips share a channel
  // (`power_range` has two, `primary_pressure` three, `pzr_level` and `sg_level` two each)
  // and the channel is what the refusal is naming. Anything else that has to say an
  // instrument's name out loud should read this rather than inventing a second list.
  var PWR_INSTRUMENT_LABELS = {
    power_range:        'reactor power',
    source_range:       'source-range flux',
    intermediate_range: 'intermediate-range flux',
    tavg:               'average coolant temperature',
    primary_pressure:   'reactor coolant pressure',
    pzr_level:          'pressurizer level',
    sg_level:           'steam generator level',
    rcs_flow:           'reactor coolant flow',
    // No article and no trailing "trip" on any of these — the message template supplies
    // both, and a label carrying its own produced "the the turbine trip trip signal".
    turbine_tripped:    'turbine trip',
  };

  // RPS RESET PERMISSIVE (#75) — the conditions that must hold before the trip breakers
  // will re-close, as DATA so the shared kernel stays plant-agnostic (HR3). The kernel
  // evaluates these against instruments only (HR1) and exposes the result as state, so the
  // board can tell the operator whether a reset will be accepted BEFORE they press it —
  // rather than the operator pressing an inert button and learning nothing, which is what
  // the board did until this landed.
  //
  // Ordering is the message the operator gets when more than one condition fails, so the
  // physically-first one comes first: the rods drop in seconds, the trip signal may stand
  // for minutes. The standing-trip scan is separate and runs FIRST (it is derived from the
  // trip table itself, not listed here) — a breaker will not hold in against a live trip
  // signal, which is the more fundamental refusal.
  //
  // Prototypicality: a real reset is a two-part act — the trip signal must have cleared and
  // the operator then resets the RPS by hand; the rods stay in until deliberately withdrawn.
  // Rod bottom is the indication a crew checks before attempting it. NUREG-1431 Rev 4.0
  // Bases B 3.3.1 describes the reactor trip breakers and the manual reset; the rods-in
  // interlock is also enforced in the engine (`reset_rps`), which remains the authority —
  // this table is what makes it VISIBLE.
  var PWR_RPS_RESET_PERMISSIVE = [
    { instrument: 'rods_fully_in', direction: 'is_true', reason: 'RODS_NOT_INSERTED',
      message_learning: 'The control rods are not all the way in yet — wait for them to seat before resetting.',
      message_industry: 'RPS RESET BLOCKED — rods not at bottom' },
  ];

  // Main-feedwater isolation seals in: while ANY of the three actuating signals is still
  // present, the operator cannot restore main feed. SOURCED — WTSM 12.3.2.3
  // (ML11223A310): "The control room operator cannot interrupt any of the SI-initiated
  // functions until the reset logic is satisfied. This 'locking out' of the operator
  // prevents the interruption of a valid SI actuation."
  //
  // The three signals this plant models are exactly the three the primary lists. WTSM
  // 12.3.6.1 (ML11223A310): "Low Tavg (564°F) coincident with a reactor trip (permissive
  // P-4), High steam generator water level (permissive P-14) in any generator, and SI
  // actuation." WTSM 11.1.4 (ML11223A293) names the fourth override as "Manual control by
  // the operator" — which is the MFW RESTORE control this seal-in guards, added in the
  // same change (#341 / #319 item 2). They ship together on purpose: the guard alone would
  // protect a command no player can send, and the control alone would ship a defeatable
  // protection function.
  //
  // DEPARTURE, declared: the real reset also needs a 45-60 s time delay relay and P-4, and
  // is a separate pushbutton that removes the start signal WITHOUT realigning anything
  // ("Removing the 'ON' signal ... does not turn off any ESF equipment, realign any valves,
  // or change any functions"). This plant collapses that to one step — restore is refused
  // while the signal stands, allowed once it clears — because there is no SI-reset control
  // on this board at all, and adding a timer plus a second pushbutton for a two-step dance
  // is Q4 user complexity with no dynamics behind it. The refusal teaches the same fact.
  var FWI_SEAL_IN = {
    message_learning: 'Main feedwater is still being isolated automatically — the condition that closed it has not cleared yet.',
    message_industry: 'MFW RESTORE BLOCKED — feedwater isolation signal present',
  };

  // Auto-actuation — reads instruments, issues commands (which pass through M4
  // interception, so a stuck PORV defeats the reclose).
  var PWR_ACTUATIONS = [
    { instrument: 'primary_pressure', direction: 'high', setpoint: 16.20,
      action: 'open_porv', reset_below: 15.86, reset_action: 'close_porv' },
    // SI setpoint raised 11.03 → 12.4 MPa (owner ruling 2026-07-21, TMI-clock-
    // gated): the plant calls for injection earlier in a depressurization.
    // Sits just below the 12.41 low-pressure trip, so trip and SI arrive
    // together in a fast LOCA — real-plant-like. Keep = SI_MPA below.
    { instrument: 'primary_pressure', direction: 'low',  setpoint: 12.4,
      action: 'set_hpi', active: true, reset_action: 'set_hpi', reset_active: false, arm: 'hpi' },
    // SI on pressurizer level LO-LO (P1(b), closed with the P7 CVCS retune): real
    // ESFAS protects INVENTORY, not just pressure — without this, a leak the
    // heaters can out-muscle (post-retune SGTR, where K_leak_depressurize no
    // longer overwhelms them) drains the RCS at full pressure with zero auto
    // injection, because the high-head pump is a trickle against 15 MPa until
    // the operator depressurizes. Fires with the 12 % low-level reactor trip.
    // Latched (letdown-isolation pattern): reset_below re-arms the fire latch
    // once level recovers past 20 %; NO reset_action — securing SI is a
    // deliberate operator/termination decision, not automatic. Rides the 'hpi'
    // ESF arm, so the cold depressurized lineup (P-11 disarm) and an operator
    // taking manual SI control both gate it. At TMI the deceived level instrument
    // reads HIGH, so this path stays silent there — the deception is untouched.
    { instrument: 'pzr_level', direction: 'low', setpoint: 12.0,
      action: 'set_hpi', active: true, reset_below: 20.0, arm: 'hpi' },
    { instrument: 'sg_level',         direction: 'low',  setpoint: 20.0,
      action: 'set_afw', active: true, arm: 'afw' },
    // High-high SG level (P-14): moisture-carryover protection. Trip the turbine and
    // isolate MAIN feedwater (AFW is unaffected — it is added downstream of the
    // isolation gate and keeps feeding). The reactor then trips through the P-9
    // interlock above. reset_below re-arms the fire latch; there is no reset_action,
    // so the turbine stays tripped and feed stays isolated until an operator restore.
    { instrument: 'sg_level',         direction: 'high', setpoint: 90.0,
      action: 'trip_turbine', reset_below: 85.0 },
    { instrument: 'sg_level',         direction: 'high', setpoint: 90.0,
      action: 'isolate_feedwater', params: { active: true }, reset_below: 85.0,
      seal_in: FWI_SEAL_IN },
    // (The old 2.76 MPa set_lpi actuation is gone: HPI/LPI is one merged system
    // armed by the 12.4 MPa set_hpi actuation above — the low-head/high-flow
    // regime follows physically from the two-segment pump curve.)
    // Residual Heat Removal permissive — auto-opens the RHR hot-leg suction valve
    // for cooldown once the reactor is tripped and depressurized below the 400 psi
    // (2.76 MPa) valve interlock. Setpoint matches emergency.rhr_valve_interlock_mpa,
    // the BLOCK-OPEN permissive — the engine refuses the open above it. It does NOT
    // match the autoclosure interlock, which is the separate 600 psig (4.14 MPa)
    // emergency.rhr_autoclose_mpa (#288): the valve shuts on repressurization ~175 psi
    // higher than the pressure at which it may be opened, so this permissive and the
    // autoclose cannot fight each other across one boundary. Armed via the 'rhr' ESF
    // system so the synoptic's RHR "Auto" button can re-arm it.
    { instrument: 'primary_pressure', direction: 'low',  setpoint: 2.76,
      action: 'set_rhr', active: true, condition: 'rps_scrammed', arm: 'rhr' },
    // SR auto re-energize: when the IR falls below P-6 (deep shutdown) the
    // source-range detector comes back on so the operator keeps a count rate.
    { instrument: 'intermediate_range', direction: 'low', setpoint: 1.0e-10,
      action: 'set_sr_detector', params: { on: true } },
    // Letdown isolation on LOW pressurizer level (~17 %, real Westinghouse
    // interlock). Letdown is a bleed OUT of the RCS; if it keeps running while
    // level is falling it will empty the primary. Isolating both orifices here
    // makes it physically impossible to drain the plant through CVCS — the bleed
    // shuts before the 12 % pzr-level reactor trip, arresting the drop. Latched:
    // reset_below only re-arms the fire latch when level recovers past 20 %; there
    // is NO reset_action, so letdown stays isolated until the operator re-opens an
    // orifice (letdown restoration is a deliberate operator action, not automatic).
    { instrument: 'pzr_level', direction: 'low', setpoint: 17.0,
      action: 'set_letdown_orifices', params: { a: false, b: false }, reset_below: 20.0 },
  ];

  // Mechanical protections moved in-stack (2026-07 ruling): relief-valve pops
  // and turbine trips are CONTROL decisions reading instruments, so they can be
  // manipulated and failed like every other actuation. Setpoints derive from
  // the engine config (single source — the engine keeps the valve hydraulics).
  //
  // NARROWED by #369 (audit #297 F2): the SG CODE SAFETIES are no longer here.
  // A spring safety senses nothing — it is opened by the fluid itself — so an
  // instrument-actuated one meant a stuck steam_pressure transmitter removed
  // the SG's only overpressure protection (measured: MSIV closure to clad
  // melt). The pop/reseat now lives in pwr_steam_generator.js on true
  // pressure. The pzr spring safeties below share the structure; they are
  // slice-2/4 audit scope and deliberately NOT moved in this change.
  var _pz = RD.PWR_CONFIG ? RD.PWR_CONFIG.pressurizer : {};
  var _sg = RD.PWR_CONFIG ? RD.PWR_CONFIG.steam_generator : {};
  var _tb = RD.PWR_CONFIG ? RD.PWR_CONFIG.turbine : {};
  PWR_ACTUATIONS.push(
    // Pressurizer spring safety valves: pop / reseat.
    { instrument: 'primary_pressure', direction: 'high', setpoint: _pz.safety_open_mpa || 17.13,
      action: 'open_pzr_safety', reset_below: _pz.safety_reseat_mpa || 16.55, reset_action: 'close_pzr_safety' },
    // (SG code safeties were the next entry until #369 — engine-side now, see above.)
    // Turbine protection: low condenser vacuum, and overspeed. reset_below
    // re-arms the latch once the reading recovers (no reset command — a trip
    // is one-way; the operator restores the machine via connect_grid).
    { instrument: 'condenser_vacuum', direction: 'low', setpoint: _tb.vacuum_trip_kpa || 74.5,
      action: 'trip_turbine', reset_below: 84.7 },
    { instrument: 'turbine_rpm', direction: 'high', setpoint: _tb.rpm_overspeed_trip || 1980.0,
      action: 'trip_turbine', reset_below: _tb.rpm_rated || 1800.0 }
  );

  // Alarms — every alarm setpoint is less extreme than the matching trip so the
  // alarm warns first; lo_lo escalates lo. Panel A = reactor/primary, B = secondary/systems.
  // { id, instrument, direction, setpoint, priority, panel, label_learning, label_industry }
  //
  // ALARM CONDITION PROCESSING (#240, owner ruling 2026-07-28: "Go with #1
  // Mode-dependent severity/suppression and number 2"). Some conditions are the
  // planned lineup rather than a casualty: a Mode 5 plant IS cold, IS
  // depressurized, and its RCPs ARE stopped. Annunciating those as a
  // depressurization event with tripped pumps trains the operator to normalize a
  // standing alarm flood — the TMI habit this sim exists to break. The `reclassify`
  // rules below (resolved in control_kernel.getAlarms) drop such an alarm to
  // `status` and reword it to say WHY. The alarm still annunciates and still shows:
  // nothing is filtered, only reclassified. Mechanism, sources and the HR1 argument
  // are documented over ControlLayer.prototype._reclassify.
  //
  // Two scope decisions worth having on record:
  //   * MODE 4 IS INCLUDED with Mode 5 on the cold-side alarms. A cooldown crosses
  //     both pressure setpoints long before Tavg reaches 93 °C (RHR entry is at
  //     2.76 MPa), so a Mode-5-only rule would still bury a planned cooldown in
  //     critical alarms. Mode 6 is not modelled (plantModeOf never returns it), so
  //     it is not listed — an unreachable rule is dead code, not caution.
  //   * MODE 3 IS DELIBERATELY EXCLUDED, and that is what keeps the rules honest.
  //     Hot Standby is where a plant sits after a trip and where a genuine
  //     depressurization or loss of the pumps must read at full severity. It is
  //     also the mode a hot casualty stays in: primary Tavg pins near 300 °C for
  //     every modelled break, so a LOCA cannot demote its own alarms by dragging
  //     the plant "cold". Residual risk, stated rather than hidden: a real
  //     depressurization DURING a cooldown (Modes 4/5) does read as status on
  //     these five. The inventory alarms that distinguish it — subcooling lost,
  //     PZR level lo-lo — carry no reclassify rule and stay critical.
  // Modes in which the RCS is deliberately below the hot operating band: 4 (Hot
  // Shutdown) and 5 (Cold Shutdown). Named once so the four cold-side rules cannot
  // drift apart, and so widening or narrowing the window is one edit with one
  // rationale (see the scope note above). The rules pair it with the instrument
  // that carries the mode — the kernel names neither (HR3), it just resolves
  // `instrument`/`in` against whatever this file gives it.
  var COLD_MODES = [4, 5];

  var PWR_ALARMS_A = [
    { id: 'reactor_trip',      instrument: 'rps_scrammed',     direction: 'is_true', setpoint: null,  priority: 'critical', panel: 'A', category: 'safety_system', label_learning: 'Reactor Trip',                     label_industry: 'REACTOR TRIP' },
    { id: 'high_flux',         instrument: 'power_range',      direction: 'high',    setpoint: 108.0, priority: 'critical', panel: 'A', category: 'reactivity', label_learning: 'High Neutron Flux',                label_industry: 'HI FLUX' },
    { id: 'high_tavg',         instrument: 'tavg',             direction: 'high',    setpoint: 312.2, priority: 'warning',  panel: 'A', category: 'coolant', label_learning: 'High Coolant Temperature',        label_industry: 'HI TAVG' },
    // LOW Tavg (#233 playtest): the board had a high alarm and a high scram and NOTHING on
    // the cold side, so the tile's low region ran unbounded to the bottom of the meter and
    // an overcooling transient annunciated nothing. 289 °C is the P-12 line — the classic
    // low-Tavg permissive, ~8 °C below the no-load program anchor — so it is clear at hot
    // standby (Tavg parks at ~297 after a trip) and comes in as soon as you are genuinely
    // cooling below the hot operating band. It stands IN through a Mode 4/5 cooldown, which
    // is correct: you are deliberately outside the band, and a real board tells you so.
    // Deliberately an alarm and NOT a trip — a PWR does not scram on low Tavg. The real
    // cold-side protections are this interlock and low-temperature overpressure protection,
    // neither of which is a reactor trip.
    // …and once the plant is DELIBERATELY cold (Modes 4/5) it reads as the status
    // it is rather than a warning — the condition still stands in, exactly as the
    // comment above requires, but a cooldown is not a casualty (#240).
    { id: 'low_tavg',          instrument: 'tavg',             direction: 'low',     setpoint: 289.0, priority: 'warning',  panel: 'A', category: 'coolant', label_learning: 'Low Coolant Temperature',         label_industry: 'LO TAVG (P-12)',
      reclassify: [{ instrument: 'plant_mode', in: COLD_MODES, priority: 'status', label_learning: 'Coolant Temperature Low — expected, plant is cold', label_industry: 'LO TAVG (P-12) — EXPECTED' }] },
    { id: 'pzr_pressure_high', instrument: 'primary_pressure', direction: 'high',    setpoint: 15.86, priority: 'warning',  panel: 'A', category: 'coolant', label_learning: 'Pressurizer Pressure High',       label_industry: 'PZR PRESS HI' },
    { id: 'pzr_pressure_low',  instrument: 'primary_pressure', direction: 'low',     setpoint: 14.82, priority: 'warning',  panel: 'A', category: 'coolant', label_learning: 'Pressurizer Pressure Low',        label_industry: 'PZR PRESS LO',
      reclassify: [{ instrument: 'plant_mode', in: COLD_MODES, priority: 'status', label_learning: 'Pressurizer Pressure Low — expected, plant depressurized', label_industry: 'PZR PRESS LO — EXPECTED' }] },
    { id: 'pzr_pressure_lolo', instrument: 'primary_pressure', direction: 'low',     setpoint: 12.41, priority: 'critical', panel: 'A', category: 'coolant', label_learning: 'Pressurizer Pressure Very Low',   label_industry: 'PZR PRESS LO LO',
      reclassify: [{ instrument: 'plant_mode', in: COLD_MODES, priority: 'status', label_learning: 'Pressurizer Pressure Very Low — expected, plant depressurized', label_industry: 'PZR PRESS LO LO — EXPECTED' }] },
    { id: 'porv_open',         instrument: 'porv_indicator',   direction: 'is_open', setpoint: null,  priority: 'warning',  panel: 'A', category: 'coolant', label_learning: 'Pressure Relief Valve Open',      label_industry: 'PORV OPEN' },
    // 2.0 → 1.0 DPM (issue #134): the alarm sat above the rate a real startup
    // ever reaches, so it never warned before the withdrawal block. 1.0 is the
    // admin startup-rate limit the checklist teaches, and lands one step below
    // the 1.5 DPM rod-withdrawal block — caution first, then the physical stop.
    { id: 'sur_high',          instrument: 'startup_rate',     direction: 'high',    setpoint: 1.0,   priority: 'caution',  panel: 'A', category: 'reactivity', label_learning: 'Startup Rate High',               label_industry: 'SUR HI' },
    { id: 'sr_high_flux',      instrument: 'source_range',     direction: 'high',    setpoint: 5.0e4, priority: 'caution',  panel: 'A', category: 'reactivity', label_learning: 'Source Range Count Rate High',    label_industry: 'SR HI FLUX' },
    { id: 'subcooling_low',    instrument: 'subcooling_margin', direction: 'low',    setpoint: 11.1,  priority: 'warning',  panel: 'A', category: 'coolant', label_learning: 'Low Subcooling Margin',           label_industry: 'LO SUBCOOL' },
    { id: 'subcooling_lost',   instrument: 'subcooling_margin', direction: 'low',    setpoint: 0.0,   priority: 'critical', panel: 'A', category: 'coolant', label_learning: 'Subcooling Lost — Coolant Boiling', label_industry: 'SUBCOOL LOST' },
    { id: 'pzr_level_high',    instrument: 'pzr_level',        direction: 'high',    setpoint: 75.0,  priority: 'caution',  panel: 'A', category: 'coolant', label_learning: 'Pressurizer Level High',          label_industry: 'PZR LVL HI' },
    { id: 'pzr_level_low',     instrument: 'pzr_level',        direction: 'low',     setpoint: 25.0,  priority: 'warning',  panel: 'A', category: 'coolant', label_learning: 'Pressurizer Level Low',           label_industry: 'PZR LVL LO' },
    { id: 'pzr_level_lolo',    instrument: 'pzr_level',        direction: 'low',     setpoint: 12.0,  priority: 'critical', panel: 'A', category: 'coolant', label_learning: 'Pressurizer Level Very Low',      label_industry: 'PZR LVL LO LO' },
    // ---- the insertion-limit PAIR (#306) ---------------------------------------------
    // A real board carries two, and we shipped only the second, so the first thing a player
    // learned about the limit was hitting it. WTSM 8.4 (ML11223A256): *"Rod Limit Low
    // setpoint = RIL + 10 steps"*, *"Rod Limit Low-Low setpoint = RIL"* — and the Lo-Lo is
    // the tech-spec violation, not merely a deeper warning: *"If the ROD LIMIT Lo-Lo alarm
    // is alarming, the technical specification limit for rod insertion has been violated."*
    //
    // 40 fine steps IS the real 10. This drive is 912 fine steps against a real bank's 228
    // (pwr_config §rods), so the prototypical 10-step approach band is 40 here. Do NOT
    // "correct" it to 10: that is 2.5 real steps of warning on a bank the auto channel can
    // move at 24 equivalent steps a minute — no warning at all. It reads `rod_limit_margin`,
    // which is in the same fine steps.
    { id: 'rod_limit_approach', instrument: 'rod_limit_margin', direction: 'low',     setpoint: 40,    priority: 'warning',  panel: 'A', category: 'reactivity', label_learning: 'Control Rods — Approaching Insertion Limit', label_industry: 'ROD LIMIT LO' },
    { id: 'rod_limit',         instrument: 'rod_at_limit',     direction: 'is_true', setpoint: null,  priority: 'warning',  panel: 'A', category: 'reactivity', label_learning: 'Control Rods — Insertion Limit',  label_industry: 'ROD LIMIT LO-LO' },
    // ---- the small-leak cue pair (#262, owner ruling 2026-07-30) ----------------------
    // A leak inside CVCS make-up authority is HELD, and that is the problem: the plant
    // quietly loses inventory with charging near maximum and, before these two, nothing
    // annunciated. MEASURED full-stack across the whole holdable band, level parks between
    // 52.0 % and 54.1 % — the nearest existing alarm, `pzr_level_low`, is at 25 %, so it is
    // 27 to 29 points away and never fires. The exercise ("level drifting, charging has come
    // up to meet it, find your leak") had no cue at all.
    //
    // THE TWO DO DIFFERENT JOBS, and which does which was settled by measurement AGAINST the
    // recommendation that proposed them. The first cut set the deviation alarm at −2 % as the
    // small-leak cue. Measured full-stack, that is wrong: **a controller doing its job erases
    // the signal you wanted to alarm on.** With CVCS in AUTO holding level, the deviation
    // across the whole holdable band reaches only −1.77 %, against a −1.79 % settling excursion
    // with NO leak at all. Signal-to-noise ≈ 1:1. It is not a small-leak cue and cannot be made
    // into one by tightening, because tightening fires on the settle.
    //
    //   CHARGING FLOW is the small-leak cue — the sensitive channel by an order of magnitude.
    //   Measured at 30 min: 0.0383 / 0.0460 / 0.0585 across severities 0.0002 / 0.0004 / 0.0007,
    //   against 0.0297 steady and a 0.0323 maximum through a 100 → 90 MWe load change. 0.036
    //   (60 % of the 0.06 maximum) clears the load-change peak by 11 % and catches EVERY
    //   holdable leak including the smallest.
    //
    //   LEVEL DEVIATION says MAKE-UP IS NO LONGER HOLDING. It is useless while CVCS keeps up and
    //   unambiguous the moment it does not, because the gap either side is a factor of six:
    //       held, worst transient (sev 0.0007)   −4.42 %
    //       first unheld case  (sev 0.001)      −26.67 %
    //   −10.0 % sits in the middle of that gap — 2.3x clear of the worst held excursion, 2.7x
    //   below the first unheld one. It also beats `pzr_level_low` to it: at sev 0.001 the
    //   deviation is −26.7 while absolute level is still 28.0 %, above the 25 % alarm. And
    //   unlike an absolute setpoint it is load-independent: over 100 → 90 MWe indicated level
    //   moved 55.00 → 63.26 % while the program moved +8.25, leaving the deviation at 0.01.
    //
    // Together they are a diagnosis and not just a cue: charging high ALONE is a leak inside
    // make-up authority; both together mean make-up has lost it. Both `caution` — find-it-and-
    // fix-it conditions, not casualties. [tune]
    { id: 'pzr_level_dev_low', instrument: 'pzr_level_dev',    direction: 'low',     setpoint: -10.0, priority: 'caution',  panel: 'A', category: 'coolant', label_learning: 'Pressurizer Level Below Program — make-up is not holding', label_industry: 'PZR LVL DEV LO' },
    { id: 'charging_high',     instrument: 'charging_flow',    direction: 'high',    setpoint: 0.036, priority: 'caution',  panel: 'A', category: 'coolant', label_learning: 'Charging Flow High — make-up is working hard',            label_industry: 'CHG FLOW HI' },
  ];
  var PWR_ALARMS_B = [
    { id: 'sg_level_hihi',  instrument: 'sg_level',         direction: 'high',     setpoint: 88.0, priority: 'critical', panel: 'B', category: 'power', label_learning: 'Steam Generator Level High-High (P-14)', label_industry: 'SG LVL HI HI' },
    { id: 'sg_level_high',  instrument: 'sg_level',         direction: 'high',     setpoint: 75.0, priority: 'caution',  panel: 'B', category: 'power', label_learning: 'Steam Generator Level High',     label_industry: 'SG LVL HI' },
    { id: 'sg_level_low',   instrument: 'sg_level',         direction: 'low',      setpoint: 30.0, priority: 'warning',  panel: 'B', category: 'power', label_learning: 'Steam Generator Level Low',      label_industry: 'SG LVL LO' },
    { id: 'sg_level_lolo',  instrument: 'sg_level',         direction: 'low',      setpoint: 17.0, priority: 'critical', panel: 'B', category: 'power', label_learning: 'Steam Generator Level Critical Low', label_industry: 'SG LVL LO LO' },
    // RCP annunciator. Keyed on `rcp_running is_false`, so it comes in whenever the
    // pumps are stopped — but stopped BY COMMAND is a lineup, not a casualty, and
    // that distinction is not a mode question: securing the pumps in Mode 3 for
    // natural circulation is equally planned, and losing one in Mode 5 during a
    // heatup is equally a trip. So this rule reads the handswitch (`rcp_secured`,
    // cleared by every fault route in pwr_engine), not the plant mode (#240).
    { id: 'rcp_trip',       instrument: 'rcp_running',      direction: 'is_false', setpoint: null, priority: 'critical', panel: 'B', category: 'coolant', label_learning: 'Reactor Coolant Pump Trip',     label_industry: 'RCP TRIP',
      reclassify: [{ condition: 'rcp_secured', priority: 'status', label_learning: 'Reactor Coolant Pumps Secured', label_industry: 'RCP SECURED' }] },
    { id: 'rcp_cavitation', instrument: 'rcp_cavitating',   direction: 'is_true',  setpoint: null, priority: 'warning',  panel: 'B', category: 'coolant', label_learning: 'Reactor Coolant Pump Cavitation', label_industry: 'RCP CAVITATION' },
    { id: 'hpi_active',     instrument: 'hpi_active',       direction: 'is_true',  setpoint: null, priority: 'status',   panel: 'B', category: 'safety_system', label_learning: 'Emergency Injection Active',     label_industry: 'HPI/LPI ACTIVE' },
    // SI ACCUMULATORS STILL ALIGNED BELOW 1000 psi (6.895 MPa) — the cooldown cue (#273).
    //
    // Why it exists. A by-the-book cooldown used to walk straight through the tanks'
    // 600 psi (4.14 MPa) cover gas with the discharge valve open and dump all four into
    // the RCS — measured endpoint accum_vol 0.0 %, boron 2310 ppm against a 2500 ppm
    // charge, the plant arriving at Mode 5 water-solid. The board could show it (SIT fill
    // and N2 pressure are both wired) but nothing SAID it, so the mission beat was the
    // only thing that ever caught it and free play repeated the dump every time.
    //
    // Why it is an annunciator and NOT an interlock. Every automatic signal a real plant
    // puts on this valve is an OPEN signal, and the hazard the design guards is spurious
    // CLOSURE: "Each isolation valve is interlocked to remain open above a specified RCS
    // pressure value" and "control power is removed from the valves to prevent inadvertent
    // closure" (U.S. EPR FSAR Tier 2 §7.6.1.2.2, ML091671514); "Verification that power is
    // removed from each accumulator isolation valve operator when the RCS pressure is
    // >= [2000] psig ensures that an active failure could not result in the undetected
    // closure" (NUREG-1431 Rev 4.0 Bases B 3.5.1 SR 3.5.1.5, ML12100A228). The closure
    // itself stays the OPERATOR's, off this indication — B 3.3.3 names that decision
    // exactly: RCS pressure is used "to determine whether to close accumulator isolation
    // valves during a controlled cooldown/depressurization". An autoclose would also be
    // unsafe here rather than merely unprototypical: discharge is gated on
    // `aligned && p_coldleg < 4.14 MPa` (pwr_primary.stepAccumulators), so any
    // pressure-keyed autoclose must fire at or above the cover gas to beat it — the same
    // condition every modelled LOCA satisfies.
    //
    // Setpoint: 1000 psi (6.895 MPa), where LCO 3.5.1 stops requiring the accumulators
    // OPERABLE ("MODE 3 with RCS pressure > [1000] psig") and LTOP SR 3.4.12.3 starts
    // requiring them isolated. 400 psi (2.76 MPa) of margin above the cover gas.
    //
    // GATED ON THE LINEUP, not on pressure alone — `accum_valve_open`. Isolate and it
    // clears; a Mode 5 plant that is already isolated never sees it, which is why it
    // needs no mode reclassify rule. It DOES stand in during a LOCA, and that is correct
    // and deliberate: there the same fact means "passive injection is about to start".
    // The label is therefore stated as a lineup, not as an order — the operator decides
    // which of the two situations they are in, which is the whole point of the cue.
    { id: 'accum_aligned',  instrument: 'primary_pressure', direction: 'low',      setpoint: 6.895, priority: 'caution',  panel: 'B', category: 'safety_system',
      condition: 'accum_valve_open',
      label_learning: 'Accumulators Still Lined Up — RCS Below Their Isolation Pressure', label_industry: 'SI ACCUM ALIGNED < 1000 PSI' },
    // SHUTDOWN COOLING NOT IN SERVICE (#287) *(OWNER RULING, 2026-07-31: "Keep it and
    // enunciate")*. The RHR auto-entry permissive is deliberately ONE-SHOT — it fires on
    // the first crossing below the 400 psi (2.76 MPa) interlock and never re-arms — while
    // the engine AUTO-CLOSES the suction valve on any repressurization back above it. Both
    // halves are correct on their own and a real plant re-opens that valve deliberately,
    // not automatically; what was missing was any indication that it had gone. SOURCED
    // (evidence pass 2026-07-31, NUREG-0933 Issue 99, "RCS/RHR Suction Line Valve
    // Interlock on PWRs", Rev. 3): "Two basic features are incorporated in the interlock
    // design: (1) an automatic closure signal on high RCS pressure (typically 600 psig),
    // and (2) a block of the MANUAL OPEN SIGNAL at a lower RCS pressure (typically 425
    // psig)." A real plant has NO automatic open at all — the interlock only blocks the
    // operator's open — so this permissive is already more automatic than the real thing
    // and a one-shot is the closer of the two options. That issue's own resolution was
    // Generic Letter 88-17: improved INSTRUMENTATION, procedures and administrative
    // controls — i.e. tell the operator, which is what this annunciator does. Measured
    // before this: a cooldown whose pressure controller sat just above the interlock ended
    // scrammed at 1.95 MPa (283 psi) BELOW it with the arm still in AUTO, its permissive
    // condition still true, RHR shut — and the only tell on the board was the ECCS card
    // quietly reading LPI instead of RHR.
    //
    // Gated on the LINEUP plus the regime, like accum_aligned above: the reactor is
    // tripped and the RCS is below the entry pressure, so shutdown cooling is what should
    // be carrying decay heat, and it is not aligned. It stands in during a LOCA too, which
    // is true and deliberate — there it reads "you are on injection, not on shutdown
    // cooling", which is exactly what the operator needs to know before they stop injecting.
    { id: 'rhr_not_aligned', instrument: 'rhr_active', direction: 'is_false', setpoint: null, priority: 'warning', panel: 'B', category: 'safety_system',
      condition: { instrument: 'plant_mode', in: COLD_MODES },
      label_learning: 'Shutdown Cooling Not In Service — RCS Is Below the RHR Entry Pressure', label_industry: 'RHR NOT IN SERVICE' },
    { id: 'sbo',            instrument: 'station_blackout', direction: 'is_true',  setpoint: null, priority: 'critical', panel: 'B', category: 'safety_system', label_learning: 'Station Blackout — AC Power Lost', label_industry: 'SBO' },
    // Turbine trip / low steam demand. Reclassified in Modes 4/5 ONLY: below the
    // hot band the machine is secured by design and RHR is the heat sink, so zero
    // steam demand is the lineup. Mode 3 keeps the warning on purpose — that is
    // where the plant lands after a trip from power, and the annunciator is
    // carrying real news there.
    { id: 'turbine_trip',   instrument: 'steam_demand_low', direction: 'is_true',  setpoint: null, priority: 'warning',  panel: 'B', category: 'power', label_learning: 'Turbine Trip / Low Steam Demand', label_industry: 'TURB TRIP',
      reclassify: [{ instrument: 'plant_mode', in: COLD_MODES, priority: 'status', label_learning: 'Turbine Secured — no steam demand', label_industry: 'TURB SECURED' }] },
    // Reactor/turbine LOAD IMBALANCE — reactor power and turbine load have diverged by
    // more than 4 % of rated (load_mode.js IMBALANCE_FRAC, from INDICATED power). The SG
    // is filling or draining as a result. Manuals/09 §8 has documented this annunciator
    // since it was written; the control layer never implemented it, so the board stayed
    // silent while a rod-only power reduction in MANUAL dragged Tavg 304 → 130 °C with
    // no alarm and no trip anywhere (#211). Caution, not warning: on this ride-out plant
    // an imbalance is a cue to act, not a limit being approached.
    { id: 'load_imbalance', instrument: 'sg_imbalance_active', direction: 'is_true', setpoint: null, priority: 'caution', panel: 'B', category: 'power', label_learning: 'Reactor/Turbine Load Imbalance — SG filling or draining', label_industry: 'LOAD IMBAL' },
    { id: 'msiv_closed',    instrument: 'msiv_open',        direction: 'is_false', setpoint: null, priority: 'warning',  panel: 'B', category: 'power', label_learning: 'Main Steam Isolated (MSIV Shut)', label_industry: 'MSIV SHUT' },
    { id: 'sg_press_high',  instrument: 'steam_pressure',   direction: 'high',     setpoint: 9.0,  priority: 'caution',  panel: 'B', category: 'power', label_learning: 'Steam Generator Pressure High',   label_industry: 'SG PRESS HI' },
    { id: 'cond_vac_low',   instrument: 'condenser_vacuum', direction: 'low',      setpoint: 84.7, priority: 'caution',  panel: 'B', category: 'power', label_learning: 'Condenser Vacuum Low',           label_industry: 'COND VAC LO' },
    { id: 'cond_vac_trip',  instrument: 'condenser_vacuum', direction: 'low',      setpoint: 74.5, priority: 'warning',  panel: 'B', category: 'power', label_learning: 'Condenser Vacuum Trip Level',    label_industry: 'COND VAC TRIP' },
  ];

  // Failures (kind per HR7). physics_parameter → implemented in the engine;
  // command_override / block → intercepted in M4; instrument → applied by the
  // instrument model (§8). severity_meta is the M4 slider metadata; category
  // groups the failure for the UI Failures tab (M4 §10).
  var PWR_FAILURES = {
    stuck_porv_open:             { type: 'command_override', category: 'coolant', intercepts: ['close_porv'], override: 'open_porv', display: 'PORV Stuck Open' },
    porv_indicator_stuck_closed: { type: 'instrument', category: 'instrument', instrument_id: 'porv_indicator', mode: 'stuck', stuck_value: 'closed', display: 'PORV Indicator Stuck Closed' },
    loss_of_feedwater:           { type: 'command_override', category: 'power', intercepts: ['set_feedwater_flow', 'set_feed_pump_speed', 'feed_pump_nudge'], override_value: 0.0, display: 'Loss of Main Feedwater' },
    turbine_trip:                { type: 'command_override', category: 'power', intercepts: ['set_steam_demand', 'set_load_target', 'connect_grid'], override_value: 0.0, display: 'Turbine Trip' },
    loss_of_offsite_power:       { type: 'physics_parameter', category: 'power', effect: 'coast_down_pumps', display: 'Loss of Offsite Power' },
    station_blackout:            { type: 'physics_parameter', category: 'power', effect: 'full_blackout', display: 'Station Blackout' },
    // SGTR scale, re-derived for the P7 CVCS retune (2026-07-22; supersedes the
    // FG-6 "2× charging_max" anchor, whose premise — charging on the accident
    // inventory scale — the retune removed). A FULL-severity rupture is 0.03
    // inventory-frac/s = ½ the high-head SI rated flow: at pressure the leak
    // still outruns SI ~2× (forces the trip + SI + EOP — the FG-6 intent) and
    // dwarfs CVCS make-up authority (~40× charging_max·cvcs_inventory_gain),
    // while the subcooling-guarded EOP walk-down can WIN the inventory race it
    // lost at the old 0.12 (which silently leaned on AUTO charging doubling as
    // a second HPI — 0.06 frac/s of make-up that no longer exists post-retune).
    // leak_to_sg: the engine ΔP-modulates it (primary−SG pressure), so
    // depressurizing to SG pressure STOPS the leak — the single-SG EOP.
    sgtr:                        { type: 'physics_parameter', category: 'coolant', effect: 'primary_leak', severity_scales: 'leak_rate', leak_scale: 0.03, leak_to_sg: true,
                                   // Severity semantics, kept transparent: severity is a fraction
                                   // of a FULL double-ended rupture; full = meta.max/100 · leak_scale
                                   // = 0.03 normalized ≈ ½ HPI's high-head rated flow. The label
                                   // reads an honest 0–100 % of full rupture.
                                   severity_meta: { label: 'Rupture Severity', unit: '% of full rupture', min: 0, max: 100, default: 40 }, display: 'Steam Generator Tube Rupture' },
    // RCP SEAL LEAK — the everyday leak, and the only one CVCS can hold (#262).
    //
    // WHY IT EXISTS. Until this entry the catalog had exactly two `primary_leak` failures and
    // BOTH are casualties: `sgtr` (a tube rupture, which teaches the SGTR EOP) and `large_loca`
    // (a cold-leg break, correctly far beyond make-up). There was no containment-side
    // "identified leakage" case at all — the bread-and-butter CVCS lesson the charging system
    // exists for. Worse, it was UNREACHABLE rather than merely missing: the severity slider is
    // `<input type="range" min="0" max="100">` with step 1, so the finest injectable
    // `large_loca` is severity 0.01 = 5.0e-3 frac/s, about 7x beyond what charging can hold.
    // You could not get there by turning the LOCA down; the control has no such position.
    //
    // THE RANGE IS THE WHOLE POINT: every position on this slider is HOLDABLE. leak_flow is
    // `severity · (meta.max/100) · leak_scale`, so 0–100 maps onto 0 → 3.5e-4 inventory-frac/s.
    //
    // That ceiling is MEASURED, and it is half the figure #262 was filed with. The issue derived
    // authority as `charging_max · cvcs_inventory_gain` = 7.2e-4, which assumes letdown is
    // ISOLATED. In the normal lineup letdown sits at 0.03, so net make-up authority is
    // `(0.06 − 0.03) · 0.012` = 3.6e-4. Measured full-stack at 30 min, leak injected at t=30 s:
    //     3.5e-4  level 52.8 %, charging 0.0585 of 0.0600  — HELD, at the edge
    //     5.0e-4  level 28.6 %, charging SATURATED          — not held
    //     7.0e-4  level 18.7 %                              — not held; only stabilises once
    //                                                          letdown isolates on low level
    // Sizing this 0–7.2e-4 would therefore have left the top HALF of its own slider unholdable,
    // which is the exact defect the issue was opened about.
    //
    // NOT ΔP-modulated (no `leak_to_sg`): this is a containment-side leak, so unlike an SGTR it
    // does not stop when you depressurize to steam-generator pressure. You fix it by finding it.
    //
    // The slider unit is "% of make-up capacity" deliberately — self-referential, and no gpm.
    // The repo's gpm are display flavour that do not reconcile with the mass balance, so quoting
    // one here would invite exactly the real-Tech-Spec comparison #262 had to retract. What the
    // player sees instead is the board's own charging gauge climbing to meet it.
    //
    // Cue: `charging_high` (PWR-A30) comes in from about severity 0.2 up; `pzr_level_dev_low`
    // (PWR-A31) does NOT anywhere on the range, because make-up is holding — that is the lesson.
    // Measured at 30 min: 0.25 → charging 0.0367, 0.50 → 0.0439, 0.75 → 0.0519, 1.00 → 0.0585,
    // level 55.0 / 54.3 / 53.0 / 52.8. Every position is held.
    //
    // THE BOTTOM ~20 % IS DELIBERATELY BELOW THE ALARM. At severity 0.15 charging reaches only
    // 0.0344 against the 0.036 setpoint — elevated on the gauge, not annunciated. That is a real
    // condition (leakage below the alarm point, found by trending rather than by a horn) and not
    // a gap to close: the load-change peak is 0.0323, so a setpoint low enough to catch 0.15
    // would sit within 5 % of normal load manoeuvring and start crying wolf.
    rcp_seal_leak:               { type: 'physics_parameter', category: 'coolant', effect: 'primary_leak', severity_scales: 'leak_rate', leak_scale: 3.5e-4,
                                   severity_meta: { label: 'Leak Rate', unit: '% of make-up capacity', min: 0, max: 100, default: 40 }, display: 'Reactor Coolant Pump Seal Leak' },
    rcp_trip:                    { type: 'physics_parameter', category: 'coolant', effect: 'stop_pump', display: 'RCP Trip' },
    loss_of_condenser_vacuum:    { type: 'physics_parameter', category: 'power', effect: 'vacuum_decay', display: 'Loss of Condenser Vacuum' },
    // degraded_hpi and afw_failure are PHYSICS-side (HR7): both are persistent
    // physical states in the engine (a degraded pump curve; tagged-shut AFW
    // discharge valves), not command interceptions — the old command_override
    // typing intercepted nothing (self-flagged in M4 §7, now resolved).
    // severity_meta encodes the capacity↔severity inversion the way the BWR
    // battery meta does (min > max): severity 0 → 100 % capacity, 1 → 0 %.
    // The slider label then reads the true delivered capacity (was inverted —
    // "HPI Capacity: 100" used to mean zero flow; the old `invert` flag was
    // consumed by nothing).
    degraded_hpi:                { type: 'physics_parameter', category: 'safety_system', effect: 'degrade_hpi', severity_scales: 'hpi_flow_multiplier',
                                   severity_meta: { label: 'HPI Capacity', unit: '% rated', min: 100, max: 0, default: 50 }, display: 'Degraded HPI' },
    // set_afw still descends so the PUMP demand latches — the run lights honestly
    // show the pumps running while the shut valves deliver zero flow (TMI-2).
    afw_failure:                 { type: 'physics_parameter', category: 'safety_system', effect: 'block_afw', display: 'Auxiliary Feedwater Failure' },
    failure_to_scram:            { type: 'command_override', category: 'safety_system', intercepts: ['scram'], effect: 'block', display: 'Failure to Scram (ATWS)' },
    stuck_open_spray:            { type: 'command_override', category: 'coolant', intercepts: ['set_spray'], override_value: true, display: 'Pressurizer Spray Stuck Open' },
    failed_pzr_heaters:          { type: 'command_override', category: 'coolant', intercepts: ['set_heater'], override_value: 0.0, display: 'Pressurizer Heaters Failed' },
    sg_overfeed:                 { type: 'command_override', category: 'power', intercepts: ['set_feedwater_flow', 'set_feed_pump_speed'], override_value: 120, display: 'SG Overfeed / Overcooling' },   // 120 % pump speed (was 1.2 — a pct-units slip)
    large_loca:                  { type: 'physics_parameter', category: 'coolant', effect: 'primary_leak', severity_scales: 'leak_rate',
                                   severity_meta: { label: 'Break Size', unit: '% rated flow', min: 0, max: 50, default: 20 }, display: 'Large LOCA (Cold-Leg Break)' },
    continuous_rod_withdrawal:   { type: 'physics_parameter', category: 'reactivity', effect: 'rod_withdrawal_runaway', severity_scales: 'withdraw_rate',
                                   severity_meta: { label: 'Withdrawal Rate', unit: 'steps/s', min: 0, max: 24, default: 12 }, display: 'Continuous Rod Withdrawal' },
    stuck_rod_on_scram:          { type: 'physics_parameter', category: 'reactivity', effect: 'stuck_control_rod', severity_scales: 'worth_fraction_held',
                                   severity_meta: { label: 'Rod Worth Held', unit: '% of total', min: 0, max: 40, default: 20 }, display: 'Control Rod Stuck on Scram' },
    // Two steam-line breaks, distinguished by LOCATION relative to the MSIV (#199,
    // 2026-07-25). The plain id is the TURBINE-HALL break, downstream of the valve:
    // shutting the MSIV puts steel between the generator and the break and the
    // blowdown ends. The `_upstream` variant is inside containment, between SG and
    // valve, where no isolation this plant owns can reach it — the honest
    // single-loop answer to "isolate the faulted SG", which a one-generator plant
    // cannot do. Before the split the break ignored the MSIV entirely, so the
    // manual's "MSIV Close if it terminates break (as modeled)" hedge was a no-op.
    steam_line_break:            { type: 'physics_parameter', category: 'power', effect: 'secondary_depressurize', severity_scales: 'break_size',
                                   severity_meta: { label: 'Break Size', unit: '% effective area', min: 0, max: 100, default: 30 }, display: 'Main Steam Line Break (Downstream — MSIV Isolable)' },
    steam_line_break_upstream:   { type: 'physics_parameter', category: 'power', effect: 'secondary_depressurize_upstream', severity_scales: 'break_size',
                                   severity_meta: { label: 'Break Size', unit: '% effective area', min: 0, max: 100, default: 30 }, display: 'Main Steam Line Break (Upstream of MSIV — Not Isolable)' },
    tavg_sensor_failure:         { type: 'instrument', category: 'instrument', instrument_id: 'tavg', mode: 'drift', display: 'Tavg Sensor Drifting' },
    pzr_level_sensor_stuck:      { type: 'instrument', category: 'instrument', instrument_id: 'pzr_level', mode: 'stuck', display: 'Pressurizer Level Sensor Stuck' },
    // CA-4: fails LOW (reads 20 %) — auto make-up floods the plant chasing it, and
    // the single-channel PI-8 trip reads the same lie (the deception teaching point).
    pzr_level_sensor_low:        { type: 'instrument', category: 'instrument', instrument_id: 'pzr_level', mode: 'stuck', stuck_value: 20.0, display: 'Pressurizer Level Sensor Failed Low' },
  };

  // Interlocks (M4 §4b) — condition-latched command blocks, from instruments
  // (HR1). The rod-withdrawal block is the startup-forgiveness guard: when the
  // startup rate runs high the plant stops outward rod motion and refuses more
  // withdrawal until the rate settles — insertion always works. Real PWR rod
  // stops behave exactly this way.
  //
  // Setpoint 2.5 → 1.5 DPM (issue #134, 2026-07-25). At 2.5 the block was a
  // PROMPT-CRITICALITY backstop (~0.55 $) wearing a startup-rate label, and it
  // never fired on the evolution it exists for: a measured startup run to a
  // 19.8 % overshoot and an IR-high trip peaked at SUR 1.82 DPM — no block, no
  // alarm, zero refusals. SUR saturates near 1.4–1.8 DPM across a wide band of
  // positive reactivity (2.5 DPM ⇒ a ~10 s period ⇒ ρ ≈ +400 pcm), so the old
  // number sat above anything a startup reaches. 1.5 DPM / clear 0.8 makes it a
  // genuine rate control matching the ≤1 DPM the startup checklist already
  // teaches; the by-the-book ascent peaks at 0.92 DPM, so the block is real
  // margin, not a nuisance. [tune]
  //
  // SOURCED (#220 claim 7): the ≤1 DPM half is prototypical and procedurally binding —
  // *"Do not exceed a stable startup rate of 1 DPM."* (Duke McGuire OP/1/A/6100/05
  // Limits & Precautions 2.1, ML20077E732), echoed at Turkey Point (*"establish a steady
  // state SUR of 1.0 dpm or less"*, NRC Special Inspection ML20344A126). Our `sur_high`
  // alarm sits exactly there. But the WITHDRAWAL BLOCK below is OURS — a DECLARED
  // DEPARTURE (§8.18). Real plants have no automatic SUR trip or rate-based rod stop;
  // the administrative limit is enforced by the operator and the automatic backstop is a
  // flux level, not a rate. Turkey Point 2020 is the worked case: the crew went to 3.0
  // DPM indicated against the 1.0 limit and the plant tripped on SOURCE-RANGE HIGH FLUX
  // at 1e5 cps — which this plant also has. The block is a teaching aid that makes the
  // administrative limit enforceable by a single operator with no shift behind them.
  // Sustained setpoint drives held by a condition (#318). EMPTY unless the OTΔT/OPΔT trips
  // are enabled — the runback is half of their C-3/C-4 interlock and has nothing to hold
  // without them. Populated beside the rod stops below, where the source is quoted.
  var PWR_RUNBACKS = [];

  var PWR_INTERLOCKS = [
    { instrument: 'startup_rate', direction: 'high', setpoint: 1.5, clears_below: 0.8,
      blocks: ['rod_start', 'rod_nudge'], withdrawal_only: true,
      on_engage: { action: 'rod_stop_all' },
      message_learning: 'Rod withdrawal blocked — the reactor is already speeding up too fast (startup rate high). Let the rate settle below 0.8 DPM, then continue. You can always insert.',
      message_industry: 'ROD WITHDRAWAL BLOCK: SUR ≥ 1.5 DPM. Withdrawal inhibited until SUR < 0.8 DPM. Insertion available.' },
    // P-6 pair on the source-range detector switch (blocks_when picks the
    // guarded form of set_sr_detector):
    // (a) can't DE-energize the SR until the IR is on scale — you'd go blind.
    { instrument: 'intermediate_range', direction: 'low', setpoint: 1.0e-10,
      blocks: ['set_sr_detector'], blocks_when: { field: 'on', equals: false },
      message_learning: 'Source-range detector stays on — the intermediate range is not reading yet (below P-6). Switching it off now would leave you blind at low power.',
      message_industry: 'SR DE-ENERGIZE BLOCKED: IR < 1e-10 A (P-6 not satisfied).' },
    // (b) can't RE-energize the SR at high flux — it would damage the counter.
    { instrument: 'intermediate_range', direction: 'high', setpoint: 1.0e-6, clears_below: 1.0e-10,
      blocks: ['set_sr_detector'], blocks_when: { field: 'on', equals: true },
      message_learning: 'Source-range detector stays off — the flux is far above its range (past P-6); energizing the counter here would burn it out.',
      message_industry: 'SR ENERGIZE BLOCKED: IR ≥ 1e-6 A — flux above SR detector limits.' },
  ];

  // Automation channels (M4b automation) — operator-selectable controllers the
  // control layer runs at physics rate. Kinds: mode (passthrough to an
  // engine-internal auto), pid, rods, bang. Callbacks receive a snapshot-shaped
  // ctx { instruments, control_state, true_state, rps_state, metadata }; all
  // read INSTRUMENTS (HR1). Groups are display sections in the Automate tab.
  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  // Sliding Tavg program (SS-2, catalog §8.1). The rod controller's reference
  // temperature Tref is a LINEAR function of turbine load (steam flow), NOT a value
  // captured at engage: no-load Tref = Tsat(steam-dump setpoint) ≈ 292 °C, full-power
  // Tref = the full-power coolant equilibrium ≈ 304-306 °C. Endpoints derive from the
  // SAME config the engine's _buildState program uses, so channel and engine agree.
  // rods_tavg tracks this each step (control_kernel _trackChannel program hook), which
  // is what gives load-follow its real authority: as load falls, Tref falls and the
  // rods walk Tavg down the program (the old capture-and-hold froze Tavg flat — P4).
  function _tsat(P) { return 179.47 * Math.pow(Math.max(P, 1e-6), 0.239); }
  var _thm = RD.PWR_CONFIG ? RD.PWR_CONFIG.thermal : {};
  var TAVG_NOLOAD = _tsat((_sg && _sg.steam_dump_setpoint) || 8.23);
  var TAVG_FULLPOWER = _tsat((_sg && _sg.steam_p_rated) || 5.65)
    + (_thm.heat_gen_coeff * (1 + (_thm.pump_heat_frac || 0))) / _thm.h_sg;
  function trefProgram(loadFrac) { return TAVG_NOLOAD + (TAVG_FULLPOWER - TAVG_NOLOAD) * clip(loadFrac, 0, 1); }

  // Washout time constant for the rod channel's power-mismatch RATE comparator (#306).
  // TUNED, not sourced — WTSM 8.1.4.2 describes the circuit but publishes no time constant.
  //
  // SWEPT, 0.5 → 300 s, on the four load transients plus a 2 h soak (full table in
  // Diagnostic/TUNING_LOG.md 2026-08-02b). The usable band is 3–8 s and it is bounded at BOTH
  // ends, which is why this is not "as small as possible":
  //   - too LONG and the standing mismatch comes back — the 5 %/min ramp degrades steadily,
  //     6.25 °F at 45 s and 8.16 °F at 300 s against 12.55 °F for the old proportional term.
  //   - too SHORT and it differentiates instrument noise. At 1 s the bank travels **761 fine
  //     steps an hour** at a settled 75 % load (against 17 here) and the 50 % step gets WORSE
  //     than the term it replaced, 13.06 °F vs 10.59 °F. That is the cliff, and 5 s sits 5×
  //     above it.
  // At 5 s the 5 %/min ramp holds **4.77 °F**, inside the WTSM 8.1.1 ±5 °F duty, which the
  // proportional form missed by 2.5×. [tune]
  var TRIM_TAU_S = 5;
  function trefFromLoad(s) { return trefProgram(clip(s.instruments.steam_flow, 0, 1)); }

  // ---- Post-trip feedwater handoff + heat-sink protections (feel-plan P4) ----
  // P-4 analog (CC-3): with the reactor TRIPPED and Tavg down at the no-load
  // anchor, main feedwater isolates (cold 40 °C feed pumped against decay heat
  // overcools every post-trip) and AFW starts — the MFW→AFW handoff, a core TMI
  // teaching point. Latched (no reset_action): the operator restores feed.
  // PI-4: AFW also auto-starts on loss of main feed AT POWER (fw_flow collapsing
  // above P-9 means both MFW trains are gone) — heat-sink protection ahead of
  // the lo-lo level trip, so AFW is already coming in as the SG draws down.
  // PI-5: feedwater isolation on safety injection (an SI casualty is never one
  // where continued main feed is right); rides the 'hpi' ESF arm so the cold
  // P-11 lineup (SI disarmed) cannot spuriously isolate feed.
  var SI_MPA = 12.4;    // SI actuation pressure (raised 11.03 → 12.4, owner ruling, TMI-clock-gated) — shared by the ESF, PI-3 trip, and PI-5 FWI
  PWR_ACTUATIONS.push(
    { instrument: 'tavg', direction: 'low', setpoint: TAVG_NOLOAD + 3, condition: 'rps_scrammed',
      action: 'isolate_feedwater', params: { active: true }, seal_in: FWI_SEAL_IN },
    { instrument: 'tavg', direction: 'low', setpoint: TAVG_NOLOAD + 3, condition: 'rps_scrammed',
      action: 'set_afw', active: true, arm: 'afw' },
    { instrument: 'fw_flow', direction: 'low', setpoint: 0.10, condition: 'above_p9',
      action: 'set_afw', active: true, arm: 'afw' },
    { instrument: 'primary_pressure', direction: 'low', setpoint: SI_MPA,
      action: 'isolate_feedwater', params: { active: true }, arm: 'hpi', seal_in: FWI_SEAL_IN }
  );
  // PI-3: reactor trip on safety injection — SI actuating means a real casualty;
  // the reactor does not stay at power through it. Keyed on the same low-pressure
  // signal as the SI ESF; blockable in the cold/shutdown regime via the same P-11
  // permissive as lo_press (auto-blocked at a depressurized init, auto-reinstates
  // above 13.6 MPa on heatup).
  PWR_TRIPS.push(
    { id: 'si_trip', instrument: 'primary_pressure', direction: 'low', setpoint: SI_MPA, action: 'scram',
      blockable: true, block_permissive: { instrument: 'primary_pressure', direction: 'low', setpoint: 13.6 } },
    // PI-8 (feel-plan P4/P5, enabled by the MTC recalibration): high pressurizer
    // level trip — the going-solid backstop (CA-4: a sensed overfill trips before
    // the plant goes water-solid). 97 % clears the ride-out's thermal swell peak
    // (~94 %) so FG-4 keeps its no-scram character; the 75 % alarm warns first.
    // Single-channel honesty: a level sensor failed LOW defeats this trip too —
    // that deception is CA-4's teaching point, pinned in the battery.
    { id: 'pzr_hi_level', instrument: 'pzr_level', direction: 'high', setpoint: 97.0, action: 'scram' }
  );

  var PWR_CHANNELS = [
    { id: 'rods_tavg', kind: 'rods', group: 'Reactor',
      label: 'Rod control → Tavg (AUTO)',
      hint: 'Automatic rod control — the reference temperature Tref is PROGRAMMED on turbine load (a sliding ~297 °C no-load → ~304 °C full-power line), and the rods drive indicated Tavg to it: a Tavg−Tref mismatch (e.g. after a load change) computes the required rod direction and a Westinghouse-style variable speed (bigger error → faster drive), locking up inside a ±0.8 °C (±1.5 °F) deadband. As load changes Tref slides with it, so the rods walk Tavg along the program. Any manual rod motion takes it back to MAN.',
      group_id: 'control_rods', offOnScram: true,
      // Free-play preset starts come up with rod control in AUTO *(OWNER RULING, 2026-08-01:
      // "Let's start the rods in auto. Might as well, everything else starts in auto.")*, which
      // is also what a real unit runs at power. Instructed content (noDefaults) is unaffected.
      //
      // AT-POWER ONLY, and this half is NOT decorative — it is measured. A blanket `true`
      // engages the channel in Mode 5 and during `pwr_heatup`, where Tavg (~60 °C cold) is
      // hundreds of degrees below the no-load Tref the load program asks for, so the channel
      // withdraws rods to close the error and takes the plant critical: `run_procedures_stack`
      // `pwr_heatup` SCRAMMED at step 6 on `source_range high`, and `run_behavior` SS-9 (cold
      // shutdown hands-off) tripped the same way. Gated here it costs neither. A real plant
      // does not put rod control in automatic below the power range either.
      //
      // HR1: reads the POWER-RANGE INSTRUMENT, not `true_state.power_pct`. The first cut read
      // truth and `run_hardrules` failed it — the same defect class as #220, where the P-9
      // permissive read the plant instead of the gauge. This is the P-10 analogue and a real
      // one is a NIS power-range permissive, so the instrument is also the prototypical read.
      defaultOn: function (ctx) { return ((ctx.instruments || {}).power_range || 0) > 10; },
      manual_overrides: ['rod_nudge', 'rod_start'],   // operator rod motion on this group → MAN
      pv: function (s) { return s.instruments.tavg; },
      // T-ref := the load program (HR1: reads indicated steam flow). Re-evaluated each
      // step by the kernel's program hook, so it tracks load rather than a captured value.
      program: trefFromLoad,
      sp: { capture: trefFromLoad, min: 285, max: 315, dim: 'temp', unit: '°C', dp: 1, step: 0.5 },
      // Two-term control like a real rod controller: a DOMINANT steam-vs-power
      // mismatch term (power chases the turbine draw — fast, self-stable, the
      // real system's power-mismatch channel) with the Tavg−Tref error as the
      // slow trim. Tavg integrates the mismatch, so a Tavg-dominant loop
      // limit-cycles for minutes; mismatch-dominant glides.
      // The mismatch term is a RATE COMPARATOR (#306, 2026-08-02), which is what the real one
      // is — and WTSM 8.1.4.2 (ML11223A252) states the reason in as many words: *"The rate
      // comparator of the power mismatch circuit monitors the two power inputs and provides an
      // output if, and only if, there is a rate of change of the difference between the inputs.
      // **This rate comparator prevents the power mismatch circuit from responding to steady
      // state calibration differences between nuclear and turbine power.**"*
      //
      // Ours was PROPORTIONAL to the standing mismatch and the measured consequence was not
      // subtle: through a 5 %/min ramp the standing term grew until it CANCELLED the
      // temperature error outright — at t = 360 s the two were −4.64 and +4.41, leaving
      // eEff = −0.04, so the channel commanded ZERO rod steps with Tavg 8.6 °F off program.
      //
      // Implementation is a washout. `trimSlow` follows the standing part of the mismatch with
      // time constant TRIM_TAU_S; the controller sees only what is LEFT, i.e. the part that is
      // changing. A steady mismatch decays to nothing; a changing one passes through. Seeded on
      // the first evaluation — and re-seeded on engage and on restore — which outputs zero that
      // step: engaging mid-transient must not hand the controller a phantom rate signal.
      //
      // GAIN IS UNCHANGED at 1.25, deliberately. A STEP change in mismatch still produces the
      // same initial push it always did, so the step-change response every scenario is tuned
      // around is preserved; only the STANDING component is removed. TRIM_TAU_S is the one new
      // number, and it is TUNED, not sourced — WTSM describes the circuit but gives no time
      // constant. The sweep behind the value is in Diagnostic/TUNING_LOG.md 2026-08-02b.
      trim: function (s, c, dt) {
        var d = s.instruments.steam_flow * 100 - s.instruments.power_range;
        if (c.trimSlow == null) { c.trimSlow = d; return 0; }
        var a = dt / (TRIM_TAU_S + dt);
        c.trimSlow += a * (d - c.trimSlow);
        return 1.25 * (d - c.trimSlow);
      },
      // ±0.8 °C (±1.5 °F) lockup band; error-proportional speed ladder [tune].
      speeds: [{ above: 0.8, speed: 'slow' }, { above: 2.0, speed: 'normal' }, { above: 4.0, speed: 'fast' }],
      // gain/maxStep are in FINE steps (912-step drive, 2026-07-23): ×4 the old
      // 228-step values, so the channel's authority in %-of-travel is unchanged.
      gain: 1.6, db: 0.8, maxStep: 8, period: 5.0, fastAt: 4.0, kd: 5, spSlew: 0.05 },

    { id: 'boron_trim', kind: 'bang', group: 'Reactor',
      label: 'Boron → rod position trim',
      hint: 'CVCS chemistry trim — borates when the auto rods sit too deep, dilutes when they run out of travel, so rod control keeps its authority through xenon and load drifts. Needs the rod channel engaged and the charging pump running.',
      requires: 'rods_tavg', offOnScram: true,
      busyNote: function (s) { return s.control_state.charging_pump_running === false ? ' (charging pump OFF)' : ''; },
      // Read-back of what the PLANT currently holds, so the kernel can notice its output has
      // been cancelled and re-assert it (#306). A per-plant callback, like `busyNote` above,
      // because the kernel may not name a plant field (HR3) — `run_hr3` caught the first
      // version of this doing exactly that.
      output: function (s) { return s.control_state.boron_adjust; },
      // `rate` 0.5 → 0.05 ppm/s (#306, 2026-08-02). 0.5 was never actually delivered: the
      // kernel's bang step was EDGE-triggered, so the channel sent one `set_boron_adjust` on
      // the mode change and never again, and anything that wrote that setting afterwards
      // cancelled it silently while the note still read "dilute…". Once the kernel was made to
      // re-assert, the real 0.5 ppm/s ran continuously — 5 pcm/s — and SCRAMMED the plant.
      // Measured: 0.5 scrams, 0.1 / 0.05 / 0.02 all hold. 0.05 is the rate this repo already
      // calls the tuned makeup rate (run_autoctl's own probe borates by hand at 0.05 and calls
      // 0.5 "a firehose that scrams the plant"), and it leaves 2× margin under the first value
      // that still works. Both halves were hidden until the #306 rod change stopped masking
      // them — see the TUNING_LOG entry. [tune]
      hi: 96.0, lo: 55.0, hiStop: 90.0, loStop: 62.0, rate: 0.05 },

    { id: 'boron_conc', kind: 'conc', group: 'Reactor',
      label: 'Boron concentration (target)',
      hint: 'Meters boron changes as a BATCH DOSE, the way a real makeup panel does: a new target computes the change and delivers it at charging-flow pace, stopped by the flow totalizer. Chemistry confirms every completed dose (CHEM SAMPLE posts the authoritative ppm after the lab turnaround). Any target change executes, however small. Needs the charging pump running. This is the board BORON CONTROL ON/OFF + target.',
      offOnScram: false,
      manual_overrides: ['set_boron_adjust'],   // an operator borate/dilute takes it to MAN
      // Free-play preset starts come up with boron control ON, holding whatever boron the
      // preset was trimmed to (sp.capture reads the current analyzer) — a sensible target per
      // mode without hardcoding. Instructed content (noDefaults) is unaffected.
      defaultOn: function () { return true; },
      // The analyzer is UI-REMOVED (owner ruling 2026-07-23) but stays the channel's
      // INTERNAL seed/re-anchor source — "the makeup panel knows roughly what's in
      // the loop" — while pvDisplay:false keeps it off the Automate tab.
      pv: function (s) { return s.instruments.boron_analyzer; }, pvDisplay: false,
      sp: { capture: function (s) { return s.instruments.boron_analyzer; }, min: 0, max: 2500, unit: 'ppm', dp: 0, step: 10 },
      // The dose rides charging flow, so with the charging pump stopped the
      // totalizer pauses — mirroring the engine's own injection gate. The kernel
      // asks the plant this rather than reading the CVCS field itself (HR3).
      // The `s.control_state &&` guard is carried over verbatim from the kernel code
      // this replaced — a missing control_state read as "not paused", and moving the
      // check into the plant must not quietly turn that into a throw.
      pausedWhen: function (s) { return !!(s.control_state && s.control_state.charging_pump_running === false); },
      pausedNote: 'idle — charging pump OFF',
      // rate: real-plant scale — max RCS makeup (~150 gpm into ~90 000 gal) changes
      // concentration ~1.5 ppm/min ≈ 0.025 ppm/s; 0.05 is deliberately generous so a
      // dose lands in game-time (~0.5 pcm/s of reactivity at 10 pcm/ppm worth, gentle
      // enough for the MTC to ride). The old 0.5 was a firehose: ~5 pcm/s spiked
      // power ~10 % per 10 ppm asked (TUNING_LOG S9). [tune]
      // reAnchorPpm: a new target re-samples the analyzer for the dose books only
      // when they've drifted beyond this (e.g. ECCS boration) — beyond noise (±2σ≈4),
      // below any dose worth caring about.
      rate: 0.05, reAnchorPpm: 15, pvTau: 5.0, period: 2.0 },

    { id: 'pzr_pressure', kind: 'mode', group: 'Primary',
      label: 'Pressurizer pressure (heaters + spray)',
      hint: 'Returns the pressurizer heaters and spray to their proportional automatic control holding ~2235 psia. Manual = both freeze at their current output.',
      isOn: function (cs) { return !!(cs.heater_auto && cs.spray_auto); },
      engage: function () { return [{ action: 'set_heater', auto: true }, { action: 'set_spray', auto: true }]; },
      disengage: function (s) {
        var cs = s.control_state;
        return [{ action: 'set_heater', power_pct: cs.heater_power_pct }, { action: 'set_spray', pct: cs.spray_valve_pct }];
      } },

    { id: 'cvcs_makeup', kind: 'mode', group: 'Primary',
      label: 'CVCS make-up (inventory)',
      hint: 'Automatic make-up — charging modulates to hold primary inventory (compensates letdown and identified leakage).',
      isOn: function (cs) { return !!cs.cvcs_auto; },
      // Charging/CVCS make-up starts in AUTO on free-play preset starts (the charging pump
      // is already running); instructed content (noDefaults) sets its own lineup.
      defaultOn: function () { return true; },
      engage: function () { return [{ action: 'set_cvcs_auto', active: true }]; },
      disengage: function () { return [{ action: 'set_cvcs_auto', active: false }]; } },

    { id: 'feed_sg', kind: 'pid', group: 'Secondary',
      // CC-3: the channel stands down (visible note) when main feedwater is
      // isolated — P-4 post-trip handoff or P-14/SI isolation. AFW has the SGs.
      // Reads the MFIV POSITION INDICATION (HR1). It used to read
      // `ctx.true_state.feedwater_isolated`, which getTrueState() has never exposed —
      // so the value was always undefined and the stand-down never once fired (#247).
      offWhen: function (ctx) { return !!(ctx.instruments && ctx.instruments.mfw_isolated); },
      offNote: 'off — main feedwater isolated (AFW has the SGs)',
      label: 'Feed pump → SG level (three-element)',
      hint: 'Three-element feedwater control — steam-generator level (element 1) plus the steam-flow vs feed-flow mismatch (elements 2 & 3) drive the feed pump speed. Engaging takes the pump off the load coupling; a manual pump command (nudge/set) takes the channel back to MAN.',
      pv: function (s) { return s.instruments.sg_level; },
      // Elements 2 & 3 read `sg_steam_flow` — the MAIN STEAM LINE transmitter, which
      // sees turbine + dump + safeties — NOT `steam_flow`, which is governor/turbine
      // flow only. With the turbine offline (heatup, startup before sync) or tripped
      // (any ride-out where the dump carries decay heat) the dump is the entire steam
      // demand, so reading `steam_flow` left this controller commanding ZERO feed
      // while the generator boiled down. Measured on pwr_heatup: level fell 90 → 33 %
      // in 120 s with fw pinned at 0.000 and the channel still reporting "holding",
      // then scrammed on SG level low. The engine's own coupled-feed fallback already
      // matched steam_out_total (load_mode.js, FG-4) — this channel never got the
      // same fix. See pwr_steam_generator.js:139-143.
      ff: function (s) { return clip(s.instruments.sg_steam_flow * 100, 0, 120); },       // element 2: total steam draw sets the base demand
      trim: function (s) { return 25 * (s.instruments.sg_steam_flow - s.instruments.fw_flow); },   // element 3: steam−feed mismatch anticipation [tune]
      cmd: function (u) { return { action: 'set_feed_pump_speed', pct: u }; },
      manual_overrides: ['set_feed_pump_speed', 'feed_pump_nudge', 'set_feedwater_flow'],
      defaultOn: function () { return true; },   // the PWR's normal free-play lineup (replaces coupled feed as the level backbone)
      uMin: 0, uMax: 120, kp: 1.5, ki: 0.03, db: 0.3, minDelta: 1.0, period: 3.0, pvTau: 1.5,
      sp: { capture: function (s) { return s.instruments.sg_level; }, min: 30, max: 80, unit: '%', dp: 0, step: 1 } },

    { id: 'steam_dump', kind: 'mode', group: 'Secondary',
      label: 'Steam dump (turbine bypass)',
      hint: 'Automatic pressure-mode steam dump — opens proportionally above the no-load setpoint (carries a load rejection). Manual = freeze at the current valve position.',
      isOn: function (cs) { return !!cs.steam_dump_auto; },
      engage: function () { return [{ action: 'set_steam_dump', mode: 'auto' }]; },
      disengage: function (s) { return [{ action: 'set_steam_dump', pct: s.control_state.steam_dump_pct || 0 }]; } },

    { id: 'grid_follow', kind: 'mode', group: 'Secondary',
      label: 'Turbine / grid (load follow)',
      hint: 'Load-follow — turbine demand tracks reactor power (feedwater couples to load). Turn OFF to set grid demand yourself and let the other channels chase it.',
      isOn: function (cs) { return cs.load_mode === 'follow'; },
      engage: function () { return [{ action: 'set_load_mode', mode: 'follow' }]; },
      disengage: function () { return [{ action: 'set_load_mode', mode: 'manual' }]; } },
  ];

  // ESF AUTO/MAN arms (M4b ESF arms): each system is ARMED for its auto-actuation
  // by default; any of the listed OPERATOR commands flips it to MANUAL, and
  // set_esf_auto re-arms it (a standing condition then re-fires).
  var PWR_ESF_SYSTEMS = [
    { id: 'hpi', label: 'HPI/LPI emergency injection', commands: ['set_hpi', 'set_lpi'] },
    { id: 'afw', label: 'Auxiliary feedwater',         commands: ['set_afw', 'set_afw_flow'] },
    // set_rhr_hx (HX flow split) is a cooldown-rate adjustment, NOT an alignment
    // command — it deliberately does not disarm the RHR valve auto-open.
    { id: 'rhr', label: 'Residual heat removal',       commands: ['set_rhr', 'set_dhr'] },
  ];

  // ---- Overtemperature ΔT and Overpower ΔT (#311) — the two missing Westinghouse trips ----
  //
  // RULED IN, in reduced form *(OWNER RULING, 2026-08-02: "311: a.")* — selecting option (a),
  // "no axial-offset (ΔI) term", from the three put to him. A one-node core cannot produce an
  // honest axial offset, and synthesizing one would be a fabricated signal presented as an
  // instrument: the thing HR1 and HR9 exist to stop.
  //
  // WHAT THESE TWO ARE FOR, and why no single-parameter trip substitutes. OTΔT is the DNB
  // protection and OPΔT the linear-heat-rate protection. Both are computed from loop ΔT with
  // Tavg and pressure compensation, so they trip on COMBINATIONS that no single gauge sees.
  // The setpoint equations, what is measured in them and what is not, and the three declared
  // departures all live in one place — `otdt_opdt` in pwr_config.js. Read that before moving
  // any number here; this file only wires the channels the instrument model computes.
  //
  // MEASURED, AND IT REDREW THE ISSUE (HR12; full survey Diagnostic/TUNING_LOG.md 2026-08-03a).
  // #311 files these as a pair and argues the plant "can be walked into a DNB-limited condition
  // with every individual gauge in band". Measured across 13 casualties and 8 normal
  // evolutions, full stack, that is NOT reproducible on this plant and the pair is NOT
  // symmetric:
  //
  //   · OTΔT has NOTHING TO CATCH as the plant stands. Its DNB line sits at ~197–218 % of
  //     rated ΔT at nominal T and P, and no measured casualty gets near it. The three that
  //     reach DNB at all (large LOCA, stuck-open PORV, 100 % steam line break) get there by
  //     DEPRESSURIZING, and each has already scrammed on low pressure first — LOCA scram 6.0 s
  //     against DNB onset 6.5 s, PORV 12.5 s against 18.0 s. OTΔT is here for prototypicality
  //     and because it is the function that BECOMES binding the moment Tavg or pressure moves;
  //     it is not closing a demonstrated hole, and saying otherwise would be the #220 class of
  //     claim all over again.
  //
  //   · OPΔT has FOUR live cases, and they are not marginal. A 30 % steam line break parks the
  //     core at 114.2 % power with loop ΔT peaking at 117.8 % of rated and holds it there for the full
  //     30-minute run with NO REACTOR TRIP, because the power-range high trip is at 120 %. A
  //     15 % break holds 107.8 % the same way. A continuous rod withdrawal at full power peaks
  //     at 114.8 % for ~17 s and recovers only because the bank runs out of travel. #295 F6
  //     independently found the fixed 635 °F Tavg-high trip standing in for both functions;
  //     what it is actually standing in for is THIS, and it does not reach.
  //
  // So the honest ordering, recorded because the next person will ask: OPΔT is the one with
  // measured bite, OTΔT is the one with the prototypical case. Both ship together because they
  // are one instrument set and one ruling, not because both were shown to be load-bearing.
  //
  // DEFAULT OFF (`protection_options.otdt_opdt_trips`), for the reason the P-9 comment above
  // gives: built default-OFF first so the blast radius is measured by flipping one flag rather
  // than guessed at (#216). The additional reason here is that K1 and K4 could NOT be sourced —
  // the session that built this had no route to ML11223A301 (nrc.gov and every mirror blocked
  // by egress policy), so the evidence-pass SOP could not run and the two intercepts are fitted
  // to this plant's measurement instead. Fitted is defensible; sourced it is not. Flipping the
  // flag is the owner's call once the equation form and the two intercepts are checked.
  if ((RD.PWR_CONFIG.protection_options || {}).otdt_opdt_trips) {
    var _ot = RD.PWR_CONFIG.otdt_opdt, _stop = _ot.rod_stop_offset_pct;
    // The trip channels are MARGIN readings (setpoint − indicated ΔT), so the trip itself is
    // the same plain data shape as every other trip here: cross zero from above and scram.
    // Computing the setpoint inside an instrument rather than teaching the kernel a new
    // `setpoint_fn` keeps HR3 intact — the kernel still names no instrument and still knows
    // only "compare a reading to a number" — and it means the board can show the operator the
    // same three numbers the trip is using (ΔT, the setpoint, the margin between them).
    PWR_TRIPS.push(
      { id: 'otdt', instrument: 'otdt_margin', direction: 'low', setpoint: 0.0, action: 'scram' },
      { id: 'opdt', instrument: 'opdt_margin', direction: 'low', setpoint: 0.0, action: 'scram' }
    );
    // Rod stops at (trip setpoint − 3 %). SOURCED, and this half genuinely is: WTSM 8.1
    // §8.1.7.3 (ML11223A252) — *"OTΔT rod stop and runback, 2/4, loop ΔT > (OTΔT trip setpoint
    // − 3 %)"*, and the same entry for OPΔT. `withdrawal_only` is that section's closing
    // sentence, not an invention: *"These interlocks or rod stops only prevent OUTWARD rod
    // motion. The rods can always be inserted into the core using either manual or automatic
    // rod control."* Same mechanism as the SUR withdrawal block above, so a plant with two
    // rate-limiting stops expresses them one way rather than two.
    //
    // THE RUNBACK HALF IS NOT BUILT, deliberately, and it is the open item on #311. The real
    // signal reduces TURBINE LOAD as well as stopping the rods, and this plant has no runback
    // mechanism at all — an actuation here fires ONCE (`actuationFired`), so a ramped load
    // reduction is a new actuation class rather than a setpoint. The ruling explicitly left
    // "whether the rod stop + runback pair ships with the trips or after them" open; building
    // a new actuation class in the same change as two new trips, on constants that are not yet
    // sourced, is the wrong order. Rod stop now, runback tracked separately.
    PWR_INTERLOCKS.push(
      { instrument: 'otdt_margin', direction: 'low', setpoint: _stop, clears_above: _stop * 2,
        blocks: ['rod_start', 'rod_nudge'], withdrawal_only: true,
        on_engage: { action: 'rod_stop_all' },
        message_learning: 'Rod withdrawal blocked — the loop temperature rise is close to the overtemperature trip. Withdrawing further would take the core toward boiling in the hot channel. Reduce load or insert rods; insertion always works.',
        message_industry: 'ROD WITHDRAWAL BLOCK: OTΔT rod stop — loop ΔT within ' + _stop + ' % of the OTΔT trip setpoint. Withdrawal inhibited. Insertion available.' },
      { instrument: 'opdt_margin', direction: 'low', setpoint: _stop, clears_above: _stop * 2,
        blocks: ['rod_start', 'rod_nudge'], withdrawal_only: true,
        on_engage: { action: 'rod_stop_all' },
        message_learning: 'Rod withdrawal blocked — the loop temperature rise is close to the overpower trip. The core is already making more heat than it is rated for. Reduce load or insert rods; insertion always works.',
        message_industry: 'ROD WITHDRAWAL BLOCK: OPΔT rod stop — loop ΔT within ' + _stop + ' % of the OPΔT trip setpoint. Withdrawal inhibited. Insertion available.' }
    );
    // Annunciation. Set at the ROD STOP line, not the trip line: an annunciator that first
    // lights as the breakers open teaches nothing. Panel A (reactor), category `reactivity` —
    // both are power-distribution protection, not a coolant fault.
    PWR_ALARMS_A.push(
      { id: 'otdt_approach', instrument: 'otdt_margin', direction: 'low', setpoint: _stop,
        priority: 'warning', panel: 'A', category: 'reactivity',
        label_learning: 'Overtemperature Limit Approaching', label_industry: 'OTΔT ROD STOP' },
      { id: 'opdt_approach', instrument: 'opdt_margin', direction: 'low', setpoint: _stop,
        priority: 'warning', panel: 'A', category: 'reactivity',
        label_learning: 'Overpower Limit Approaching', label_industry: 'OPΔT ROD STOP' }
    );
    // TURBINE RUNBACK (#318) — the other half of C-3/C-4, and it arrives with the rod stop
    // because they are one interlock. SOURCED: WTSM 12.2 §12.2.3.7/.8, *"both automatic and
    // manual control rod withdrawal is inhibited, and a cyclic turbine runback is initiated,
    // as long as the overtemperature condition exists"*, and Table 12.2-2 rows C-3/C-4,
    // *"Stops control rod outward motion (manual & automatic) and initiates a turbine
    // runback."* Same 3 % line as the rod stop, by the same source.
    //
    // WHY THIS TEACHES DYNAMICS, which is why it is here at all *(OWNER, 2026-08-03: "I'm
    // not sure if I want to add another thing for the player to learn if it doesn't teach
    // dynamics.")*: it is the only protection function on this plant that works THROUGH a
    // Tier A coupling instead of around it. It never touches the reactor — it takes load
    // off, and A1 (power follows load, via the negative MTC) brings the core down. And it
    // makes A1's TIME CONSTANT visible, which nothing else does: measured, it saves the
    // 15 % steam line break (scram at 200 s → no scram, settling at 80 % load) and CANNOT
    // save the 30 % break or a continuous rod withdrawal — and a 5 %/2 s runback is no
    // better than 2 %/2 s on those, because the limit is how fast power follows load, not
    // the ramp rate. That is why WTSM classes both ΔT trips as "relatively slow transients".
    //
    // NO REFUSAL, NO CEILING — it just drives the load setpoint down, visibly, in the box
    // the player already uses *(OWNER RULING, 2026-08-03: "Go with your recommendation",
    // choosing the shape with zero new player-facing rules)*. A refusal message would teach an
    // interface rule rather than a coupling. If the operator types a higher load, the next
    // step reads it and walks it back down where they can watch it happen. `set_load_target`
    // also forces MANUAL, so a unit in FOLLOW visibly drops to MAN — the load-mode lamp and
    // the moving number carry the whole story between them, using two indications the player
    // already knows.
    //
    // DECLARED DEPARTURE: the real signal is *cyclic* (discrete pulses on the EHC load
    // reference); this is a continuous ramp. Same effect, and it reads better on a number
    // box that would otherwise jump. Rate 1.0 %/s of rated = the measured 2 %/2 s.
    // SOURCED LAW, WTSM 11.3 (ML11223A295): 5 % of rated delivered at 200 %/min (so 1.5 s),
    // then hold 28.5 s, then re-assess and repeat while the condition stands. The 3 % trigger
    // is the same C-3/C-4 line as the rod stop, from WTSM 12.2.
    ['otdt', 'opdt'].forEach(function (which) {
      PWR_RUNBACKS.push({
        id: which + '_runback',
        instrument: which + '_margin', direction: 'low',
        setpoint: _stop, clears_above: _stop * 2,
        step_pct_of_rated: 5.0,      // "a 5% load change"
        step_s: 1.5,                 // "at 200%/min for 1.5 sec"
        cycle_s: 30.0,               // "then holds the load constant for 28.5 sec" (1.5 + 28.5)
        // PERSISTENCE — and it is a SOURCED substitute, not the invention I twice called it.
        // The real signal needs *"dT in TWO OUT OF FOUR reactor coolant loops"* within 3 % of the
        // setpoint (WTSM 12.2 §12.2.3.7/.8). That 2/4 coincidence IS the law's noise immunity, and
        // a single-loop plant structurally cannot have it. A dwell requirement is the substitute
        // for the voting we cannot do — which makes it a declared ADAPTATION of a sourced feature
        // rather than a departure invented to paper over a tuning problem.
        //
        // I deleted this on the reasoning that the 10 %/min load rate limit "removes that
        // excursion at source, so the CYCLE is the only restraint". MEASURED, that is half right
        // and the wrong half is fatal: the rate limit shrinks the normal-ramp dwell below the
        // trigger from 6.40 s to 0.10 s — 64x — but it cannot remove the NOISE, and the engage
        // test fires on a single physics step below the line. One 0.1 s clip at margin 2.90 =
        // one permanent 5 % load cut, because `immediate` moves the operator's ask too and
        // nothing ramps it back. That is the whole of run_autoctl's 91.5 % (load parked at 91.6
        // MWe) and of run_ops SGTR's 53.7 % inventory (the runback engaged twice, not once).
        //
        // The rate limit still earns its place and the two are complements, not alternatives:
        // it takes the normal-ramp dwell from 6.40 s to 0.10 s against a worst-casualty dwell of
        // 10.58 s, so this constant sits in a gap two orders of magnitude wide instead of the
        // 4.18 s squeeze it was originally sized into.
        persist_s: 8.5,
        rated: RD.PWR_CONFIG.turbine.mwe_rated,
        floor: 0,
        // Per-plant callbacks keep the kernel plant-agnostic (HR3). `read` is command
        // READ-BACK of a setpoint the layer issues, so HR1 is untouched; re-reading it every
        // step is deliberate, so an operator who types a higher load has it walked back down.
        read: function (ctx) { return ctx.true_state ? ctx.true_state.load_target_mwe : null; },
        // `immediate`: the runback is 200 %/min by the source, far faster than the operator
        // load rate, so it must not be throttled by it. It moves the operator's ASK too, so
        // the ramp has nothing to undo — which is also why the number in the Generator Load
        // box is what the player sees falling.
        command: function (mwe) { return { action: 'set_load_target', mwe: mwe, immediate: true }; }
      });
    });
  }

  var PWR_PROTECTION = {
    trips: PWR_TRIPS,
    trip_block_permissive: PWR_TRIP_BLOCK_PERMISSIVE,
    rps_reset_permissive: PWR_RPS_RESET_PERMISSIVE,
    instrument_labels: PWR_INSTRUMENT_LABELS,
    actuations: PWR_ACTUATIONS,
    alarms: PWR_ALARMS_A.concat(PWR_ALARMS_B),
    // Annunciator MINIMUM ON-TIME, sim seconds. Once lit, an alarm stays lit at least this
    // long even if its condition has gone — the "fill" timer on a real annunciator cabinet.
    // See the measurement and the design argument over `_evalAlarms` in control_kernel.js.
    //
    // 2.0 s is chosen against READABILITY, not against the noise. The chatter it was measured
    // on has a median lit time of 0.06 s and a median DARK time of 0.10-0.20 s, so anything
    // comfortably above the dark gaps coalesces the burst into one steady indication; the
    // question is then only how long a genuinely momentary alarm should stay up to be read,
    // and 2 s is about the shortest that survives a glance away from the panel. It is the
    // WHOLE cost of the feature — nothing else changes — so it is cheap to retune.
    //
    // UPPER BOUND, and it is the real constraint: the hold delays the CLEAR, so an alarm that
    // has genuinely gone away stays lit for up to this long. Too long and the board lies in
    // the other direction — the operator fixes something and the annunciator does not
    // acknowledge it — which is worse than flicker because it breaks the feedback loop the
    // board exists to provide. Do not push this into the tens of seconds.
    alarm_min_on_s: 2.0,
    alarms_panel_a: PWR_ALARMS_A,
    alarms_panel_b: PWR_ALARMS_B,
    failures: PWR_FAILURES,
    interlocks: PWR_INTERLOCKS,
    runbacks: PWR_RUNBACKS,
    channels: PWR_CHANNELS,
    esf_systems: PWR_ESF_SYSTEMS,
  };

  // trefProgram is exported so the HMI can draw the SAME sliding Tavg program the rods are
  // driving to, instead of approximating it (#233). A tile whose green band disagreed with
  // the controller's reference would be worse than no band at all.
  RD.PWR_CONTROL = {
    protection: PWR_PROTECTION,
    trefProgram: trefProgram,
    TAVG_NOLOAD: TAVG_NOLOAD,
    TAVG_FULLPOWER: TAVG_FULLPOWER,
    TAVG_DEADBAND_C: 0.8   // rods_tavg lock-up band (±0.8 °C / ±1.5 °F)
  };
  RD.PWR_PROTECTION = PWR_PROTECTION;                              // legacy name
  if (RD.PWR_CONFIG) RD.PWR_CONFIG.protection = PWR_PROTECTION;    // engine failure dispatch reads this

})(globalThis.RD || (globalThis.RD = {}));
