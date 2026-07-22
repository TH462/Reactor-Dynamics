/*
 * pwr_control.js — the PWR's control layer, as data (HR1/HR3/HR8).
 *
 * Everything plant-specific the Control Layer kernel (control_kernel.js) runs
 * for the PWR: protection trips, engineered-safety actuation, alarms, failure
 * definitions, and interlocks (originally engines/pwr/pwr_protection.js, M1 §9).
 * The engine itself acts on none of it — it only exposes the instruments these
 * rules read and the controls they drive.
 *
 * All setpoints read INSTRUMENTS (HR1), in SI units (MPa / °C / % / normalized),
 * with the single documented exception `__true_flow__` (no flow instrument in v1).
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
    { instrument: 'sg_level',         direction: 'low',  setpoint: 17.0,   action: 'scram' }, // % lo-lo (AFW auto-starts just above, 20 %)
    // Low-flow reactor trip. Bypassable below the P-7 low-power permissive (5 %): the
    // RCPs are secured in cold shutdown (RHR provides circulation), so the trip is
    // blocked at a depressurized/low-power init and re-arms above P-7. At power it is
    // never blocked — a real RCP trip / loss of flow (pwr_lof) still scrams.
    { id: 'lo_flow', instrument: '__true_flow__', direction: 'low', setpoint: 0.25, action: 'scram', // HR1 exception
      blockable: true, block_permissive: { instrument: 'power_range', direction: 'low', setpoint: 5.0 } },
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

  // P-10, the nuclear at-power permissive: manual trip blocks are allowed only
  // above 10 % power-range power, and auto-clear (reinstate) below it.
  var PWR_TRIP_BLOCK_PERMISSIVE = { instrument: 'power_range', direction: 'high', setpoint: 10.0 };

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
      action: 'isolate_feedwater', params: { active: true }, reset_below: 85.0 },
    // (The old 2.76 MPa set_lpi actuation is gone: HPI/LPI is one merged system
    // armed by the 12.4 MPa set_hpi actuation above — the low-head/high-flow
    // regime follows physically from the two-segment pump curve.)
    // Residual Heat Removal permissive — auto-opens the RHR hot-leg suction valve
    // for cooldown once the reactor is tripped and depressurized below the 400 psi
    // (2.76 MPa) valve interlock. Setpoint matches emergency.rhr_valve_interlock_mpa
    // (the engine refuses the open above it). Armed via the 'rhr' ESF system so the
    // synoptic's RHR "Auto" button can re-arm it.
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
  var _pz = RD.PWR_CONFIG ? RD.PWR_CONFIG.pressurizer : {};
  var _sg = RD.PWR_CONFIG ? RD.PWR_CONFIG.steam_generator : {};
  var _tb = RD.PWR_CONFIG ? RD.PWR_CONFIG.turbine : {};
  PWR_ACTUATIONS.push(
    // Pressurizer spring safety valves: pop / reseat.
    { instrument: 'primary_pressure', direction: 'high', setpoint: _pz.safety_open_mpa || 17.13,
      action: 'open_pzr_safety', reset_below: _pz.safety_reseat_mpa || 16.55, reset_action: 'close_pzr_safety' },
    // SG code safety valves: pop / reseat (the bottled-SG backstop).
    { instrument: 'steam_pressure', direction: 'high', setpoint: _sg.sg_safety_open_mpa || 9.31,
      action: 'open_sg_safety', reset_below: _sg.sg_safety_reseat_mpa || 9.0, reset_action: 'close_sg_safety' },
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
  var PWR_ALARMS_A = [
    { id: 'reactor_trip',      instrument: 'rps_scrammed',     direction: 'is_true', setpoint: null,  priority: 'critical', panel: 'A', label_learning: 'Reactor Trip',                     label_industry: 'REACTOR TRIP' },
    { id: 'high_flux',         instrument: 'power_range',      direction: 'high',    setpoint: 108.0, priority: 'critical', panel: 'A', label_learning: 'High Neutron Flux',                label_industry: 'HI FLUX' },
    { id: 'high_tavg',         instrument: 'tavg',             direction: 'high',    setpoint: 312.2, priority: 'warning',  panel: 'A', label_learning: 'High Coolant Temperature',        label_industry: 'HI TAVG' },
    { id: 'pzr_pressure_high', instrument: 'primary_pressure', direction: 'high',    setpoint: 15.86, priority: 'warning',  panel: 'A', label_learning: 'Pressurizer Pressure High',       label_industry: 'PZR PRESS HI' },
    { id: 'pzr_pressure_low',  instrument: 'primary_pressure', direction: 'low',     setpoint: 14.82, priority: 'warning',  panel: 'A', label_learning: 'Pressurizer Pressure Low',        label_industry: 'PZR PRESS LO' },
    { id: 'pzr_pressure_lolo', instrument: 'primary_pressure', direction: 'low',     setpoint: 12.41, priority: 'critical', panel: 'A', label_learning: 'Pressurizer Pressure Very Low',   label_industry: 'PZR PRESS LO LO' },
    { id: 'porv_open',         instrument: 'porv_indicator',   direction: 'is_open', setpoint: null,  priority: 'warning',  panel: 'A', label_learning: 'Pressure Relief Valve Open',      label_industry: 'PORV OPEN' },
    { id: 'sur_high',          instrument: 'startup_rate',     direction: 'high',    setpoint: 2.0,   priority: 'caution',  panel: 'A', label_learning: 'Startup Rate High',               label_industry: 'SUR HI' },
    { id: 'sr_high_flux',      instrument: 'source_range',     direction: 'high',    setpoint: 5.0e4, priority: 'caution',  panel: 'A', label_learning: 'Source Range Count Rate High',    label_industry: 'SR HI FLUX' },
    { id: 'subcooling_low',    instrument: 'subcooling_margin', direction: 'low',    setpoint: 11.1,  priority: 'warning',  panel: 'A', label_learning: 'Low Subcooling Margin',           label_industry: 'LO SUBCOOL' },
    { id: 'subcooling_lost',   instrument: 'subcooling_margin', direction: 'low',    setpoint: 0.0,   priority: 'critical', panel: 'A', label_learning: 'Subcooling Lost — Coolant Boiling', label_industry: 'SUBCOOL LOST' },
    { id: 'pzr_level_high',    instrument: 'pzr_level',        direction: 'high',    setpoint: 75.0,  priority: 'caution',  panel: 'A', label_learning: 'Pressurizer Level High',          label_industry: 'PZR LVL HI' },
    { id: 'pzr_level_low',     instrument: 'pzr_level',        direction: 'low',     setpoint: 25.0,  priority: 'warning',  panel: 'A', label_learning: 'Pressurizer Level Low',           label_industry: 'PZR LVL LO' },
    { id: 'pzr_level_lolo',    instrument: 'pzr_level',        direction: 'low',     setpoint: 12.0,  priority: 'critical', panel: 'A', label_learning: 'Pressurizer Level Very Low',      label_industry: 'PZR LVL LO LO' },
    { id: 'rod_limit',         instrument: 'rod_at_limit',     direction: 'is_true', setpoint: null,  priority: 'warning',  panel: 'A', label_learning: 'Control Rods — Insertion Limit',  label_industry: 'ROD INS LIMIT' },
  ];
  var PWR_ALARMS_B = [
    { id: 'sg_level_hihi',  instrument: 'sg_level',         direction: 'high',     setpoint: 88.0, priority: 'critical', panel: 'B', label_learning: 'Steam Generator Level High-High (P-14)', label_industry: 'SG LVL HI HI' },
    { id: 'sg_level_high',  instrument: 'sg_level',         direction: 'high',     setpoint: 75.0, priority: 'caution',  panel: 'B', label_learning: 'Steam Generator Level High',     label_industry: 'SG LVL HI' },
    { id: 'sg_level_low',   instrument: 'sg_level',         direction: 'low',      setpoint: 30.0, priority: 'warning',  panel: 'B', label_learning: 'Steam Generator Level Low',      label_industry: 'SG LVL LO' },
    { id: 'sg_level_lolo',  instrument: 'sg_level',         direction: 'low',      setpoint: 17.0, priority: 'critical', panel: 'B', label_learning: 'Steam Generator Level Critical Low', label_industry: 'SG LVL LO LO' },
    { id: 'rcp_trip',       instrument: 'rcp_running',      direction: 'is_false', setpoint: null, priority: 'critical', panel: 'B', label_learning: 'Reactor Coolant Pump Trip',     label_industry: 'RCP TRIP' },
    { id: 'rcp_cavitation', instrument: 'rcp_cavitating',   direction: 'is_true',  setpoint: null, priority: 'warning',  panel: 'B', label_learning: 'Reactor Coolant Pump Cavitation', label_industry: 'RCP CAVITATION' },
    { id: 'hpi_active',     instrument: 'hpi_active',       direction: 'is_true',  setpoint: null, priority: 'status',   panel: 'B', label_learning: 'Emergency Injection Active',     label_industry: 'HPI/LPI ACTIVE' },
    { id: 'sbo',            instrument: 'station_blackout', direction: 'is_true',  setpoint: null, priority: 'critical', panel: 'B', label_learning: 'Station Blackout — AC Power Lost', label_industry: 'SBO' },
    { id: 'turbine_trip',   instrument: 'steam_demand_low', direction: 'is_true',  setpoint: null, priority: 'warning',  panel: 'B', label_learning: 'Turbine Trip / Low Steam Demand', label_industry: 'TURB TRIP' },
    { id: 'msiv_closed',    instrument: 'msiv_open',        direction: 'is_false', setpoint: null, priority: 'warning',  panel: 'B', label_learning: 'Main Steam Isolated (MSIV Shut)', label_industry: 'MSIV SHUT' },
    { id: 'sg_press_high',  instrument: 'steam_pressure',   direction: 'high',     setpoint: 9.0,  priority: 'caution',  panel: 'B', label_learning: 'Steam Generator Pressure High',   label_industry: 'SG PRESS HI' },
    { id: 'cond_vac_low',   instrument: 'condenser_vacuum', direction: 'low',      setpoint: 84.7, priority: 'caution',  panel: 'B', label_learning: 'Condenser Vacuum Low',           label_industry: 'COND VAC LO' },
    { id: 'cond_vac_trip',  instrument: 'condenser_vacuum', direction: 'low',      setpoint: 74.5, priority: 'warning',  panel: 'B', label_learning: 'Condenser Vacuum Trip Level',    label_industry: 'COND VAC TRIP' },
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
                                   severity_meta: { label: 'Withdrawal Rate', unit: 'steps/s', min: 0, max: 6, default: 3 }, display: 'Continuous Rod Withdrawal' },
    stuck_rod_on_scram:          { type: 'physics_parameter', category: 'reactivity', effect: 'stuck_control_rod', severity_scales: 'worth_fraction_held',
                                   severity_meta: { label: 'Rod Worth Held', unit: '% of total', min: 0, max: 40, default: 20 }, display: 'Control Rod Stuck on Scram' },
    steam_line_break:            { type: 'physics_parameter', category: 'power', effect: 'secondary_depressurize', severity_scales: 'break_size',
                                   severity_meta: { label: 'Break Size', unit: '% effective area', min: 0, max: 100, default: 30 }, display: 'Main Steam Line Break' },
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
  // stops behave exactly this way; here the setpoint (~0.55 $) also keeps a
  // hasty trainee out of prompt-critical territory.
  var PWR_INTERLOCKS = [
    { instrument: 'startup_rate', direction: 'high', setpoint: 2.5, clears_below: 1.5,
      blocks: ['rod_start', 'rod_nudge'], withdrawal_only: true,
      on_engage: { action: 'rod_stop_all' },
      message_learning: 'Rod withdrawal blocked — the reactor is already speeding up too fast (startup rate high). Let the rate settle below 1.5 DPM, then continue. You can always insert.',
      message_industry: 'ROD WITHDRAWAL BLOCK: SUR ≥ 2.5 DPM. Withdrawal inhibited until SUR < 1.5 DPM. Insertion available.' },
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
      action: 'isolate_feedwater', params: { active: true } },
    { instrument: 'tavg', direction: 'low', setpoint: TAVG_NOLOAD + 3, condition: 'rps_scrammed',
      action: 'set_afw', active: true, arm: 'afw' },
    { instrument: 'fw_flow', direction: 'low', setpoint: 0.10, condition: 'above_p9',
      action: 'set_afw', active: true, arm: 'afw' },
    { instrument: 'primary_pressure', direction: 'low', setpoint: SI_MPA,
      action: 'isolate_feedwater', params: { active: true }, arm: 'hpi' }
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
      trim: function (s) { return 1.25 * (s.instruments.steam_flow * 100 - s.instruments.power_range); },
      // ±0.8 °C (±1.5 °F) lockup band; error-proportional speed ladder [tune].
      speeds: [{ above: 0.8, speed: 'slow' }, { above: 2.0, speed: 'normal' }, { above: 4.0, speed: 'fast' }],
      gain: 0.4, db: 0.8, maxStep: 2, period: 5.0, fastAt: 4.0, kd: 5, spSlew: 0.05 },

    { id: 'boron_trim', kind: 'bang', group: 'Reactor',
      label: 'Boron → rod position trim',
      hint: 'CVCS chemistry trim — borates when the auto rods sit too deep, dilutes when they run out of travel, so rod control keeps its authority through xenon and load drifts. Needs the rod channel engaged and the charging pump running.',
      requires: 'rods_tavg', offOnScram: true,
      busyNote: function (s) { return s.control_state.charging_pump_running === false ? ' (charging pump OFF)' : ''; },
      hi: 96.0, lo: 55.0, hiStop: 90.0, loStop: 62.0, rate: 0.5 },

    { id: 'boron_conc', kind: 'conc', group: 'Reactor',
      label: 'Boron concentration (target)',
      hint: 'Seeks a target boron concentration — borates below the setpoint, dilutes above, holds inside a ±8 ppm deadband. Reads the boron analyzer, so a lagging/failed sample fools it like the operator. Needs the charging pump running. This is the board BORON CONTROL ON/OFF + target.',
      offOnScram: false,
      manual_overrides: ['set_boron_adjust'],   // an operator borate/dilute takes it to MAN
      // Free-play preset starts come up with boron control ON, holding whatever boron the
      // preset was trimmed to (sp.capture reads the current analyzer) — a sensible target per
      // mode without hardcoding. Instructed content (noDefaults) is unaffected.
      defaultOn: function () { return true; },
      pv: function (s) { return s.instruments.boron_analyzer; },
      sp: { capture: function (s) { return s.instruments.boron_analyzer; }, min: 0, max: 2500, unit: 'ppm', dp: 0, step: 10 },
      db: 8.0, rate: 0.5, pvTau: 5.0, period: 2.0 },

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
      offWhen: function (ctx) { return !!(ctx.true_state && ctx.true_state.feedwater_isolated); },
      offNote: 'off — main feedwater isolated (AFW has the SGs)',
      label: 'Feed pump → SG level (three-element)',
      hint: 'Three-element feedwater control — steam-generator level (element 1) plus the steam-flow vs feed-flow mismatch (elements 2 & 3) drive the feed pump speed. Engaging takes the pump off the load coupling; a manual pump command (nudge/set) takes the channel back to MAN.',
      pv: function (s) { return s.instruments.sg_level; },
      ff: function (s) { return clip(s.instruments.steam_flow * 100, 0, 120); },       // element 2: steam flow sets the base demand
      trim: function (s) { return 25 * (s.instruments.steam_flow - s.instruments.fw_flow); },   // element 3: steam−feed mismatch anticipation [tune]
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

  var PWR_PROTECTION = {
    trips: PWR_TRIPS,
    trip_block_permissive: PWR_TRIP_BLOCK_PERMISSIVE,
    actuations: PWR_ACTUATIONS,
    alarms: PWR_ALARMS_A.concat(PWR_ALARMS_B),
    alarms_panel_a: PWR_ALARMS_A,
    alarms_panel_b: PWR_ALARMS_B,
    failures: PWR_FAILURES,
    interlocks: PWR_INTERLOCKS,
    channels: PWR_CHANNELS,
    esf_systems: PWR_ESF_SYSTEMS,
  };

  RD.PWR_CONTROL = { protection: PWR_PROTECTION };
  RD.PWR_PROTECTION = PWR_PROTECTION;                              // legacy name
  if (RD.PWR_CONFIG) RD.PWR_CONFIG.protection = PWR_PROTECTION;    // engine failure dispatch reads this

})(globalThis.RD || (globalThis.RD = {}));
