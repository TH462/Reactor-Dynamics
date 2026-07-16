/*
 * tools/gen_manual_reference.js — Operator's-manual REFERENCE generator (v2).
 *
 * Produces `ui/manual_data.js` (→ globalThis.RD.MANUAL): the reference half of the
 * single-voice operator's manual + the in-sim help panel. Reference sections are
 * GENERATED from the live engine configs + a settling run, so they cannot drift:
 *   setpoints/limits ← protection (trips/actuations/alarms); indications ← instrument
 *   set (ranges/lag) + linked alarms; failures ← failure catalog; normal values ←
 *   running each named state. A hand-authored, SINGLE INTEGRATED-VOICE layer supplies
 *   plant overviews, control effects, indication meanings, alarm response, and a
 *   glossary. Every term is spelled out with its acronym; there is no Learning/Industry
 *   split (one document). Internal command names are carried for a DEV appendix only.
 *
 * Re-run after any engine/config change:  node tools/gen_manual_reference.js
 * Procedures are authored + engine-validated separately (ui/manual_procedures.js).
 */
'use strict';

require('../engines/load_mode.js');
// Per-plant control-layer data (trips/actuations/alarms/failures) lives in
// layers/control/<plant>_control.js; RBMK's loads before its config (forVersion).
['engines/pwr/pwr_config.js', 'layers/control/pwr_control.js', 'engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js',
 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js', 'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
 'layers/control/rbmk_control.js', 'engines/rbmk/rbmk_config.js', 'engines/rbmk/rbmk_kinetics.js', 'engines/rbmk/rbmk_thermal.js',
 'engines/rbmk/rbmk_rods.js', 'engines/rbmk/rbmk_instruments.js', 'engines/rbmk/rbmk_engine.js',
 'engines/bwr/bwr_config.js', 'layers/control/bwr_control.js', 'engines/bwr/bwr_vessel.js', 'engines/bwr/bwr_recirculation.js',
 'engines/bwr/bwr_safety_systems.js', 'engines/bwr/bwr_instruments.js', 'engines/bwr/bwr_engine.js'
].forEach(function (f) { require('../' + f); });
var RD = globalThis.RD, fs = require('fs'), path = require('path');

// ============================================================ authored layer (single voice)
var OVERVIEW = {
  pwr: {
    name: 'Pressurized Water Reactor (PWR)',
    one_liner: 'The stable, intuitive reactor — the best place to start. ~1000 MWe; the primary loop runs ≈ 15.41 MPa (kept high so it cannot boil), average coolant ≈ 304 °C.',
    overview: 'Water in the primary loop is held under high pressure so it never boils; it carries heat to the Steam Generators (SG), which boil a separate secondary loop that spins the turbine. Strong negative feedbacks — the Doppler effect (hotter fuel absorbs more neutrons) and the Moderator Temperature Coefficient (MTC) — make the plant self-regulating: it pushes back on change. Reactivity is trimmed with Control Rods and dissolved boron, adjusted by the Chemical & Volume Control System (CVCS: charging adds boron, letdown removes it). The Pressurizer (PZR) sets primary pressure using heaters, spray, and a Power-Operated Relief Valve (PORV) with an upstream block (isolation) valve. This reactor hosts the Three Mile Island (TMI) accident — an accident of information, in which an indicator read "closed" while the PORV was stuck open.',
    authentic_units: 'Real US PWRs are read in psia / °F; this trainer is SI internally (MPa / °C) with a display unit toggle.',
  },
  rbmk: {
    name: 'RBMK-1000 (Chernobyl-type)',
    one_liner: 'The unstable reactor — where boiling RAISES power instead of lowering it. ~3200 MWt / ~1000 MWe; graphite-moderated, water-cooled pressure tubes, steam drum ≈ 7.0 MPa. Carries both the pre-1986 and post-1986 designs.',
    overview: 'Graphite (not water) slows the neutrons, and the cooling water mostly absorbs them — so when the water boils into steam (called "void"), reactivity RISES. This positive void coefficient, together with the pre-1986 control rods whose graphite tips briefly ADDED reactivity as they began to insert (the "positive scram effect"), is what turned an emergency shutdown into the Chernobyl explosion. There is no boron and no moderator-temperature coefficient; the graphite gives a slow, slightly-positive feedback. The Operating Reactivity Margin (ORM) — how much shutdown capacity is currently inserted — is the key safety parameter. Power is controlled by Control Rods and by Main Circulation Pump (MCP) flow. The emergency shutdown is the AZ-5 button.',
    authentic_units: 'The RBMK is read in SI (MPa / °C) — the trainer default.',
  },
  bwr: {
    name: 'Boiling Water Reactor (BWR)',
    one_liner: 'Stable like the PWR, but it boils water directly in the core and sends the steam straight to the turbine. ~1100 MWe; vessel ≈ 7.03 MPa. Power is controlled largely by recirculation flow.',
    overview: 'Water boils in the core and the steam goes directly to the turbine — there is no separate loop. Because the water both cools and moderates, boiling (void) LOWERS reactivity — a negative feedback that makes the plant stable and lets you control power with Recirculation (recirc) flow: more flow sweeps out steam bubbles and raises power. Its passive, steam-driven safety systems run without alternating-current (AC) power — Reactor Core Isolation Cooling (RCIC) and High-Pressure Coolant Injection (HPCI). To inject at low pressure you first depressurize with the Automatic Depressurization System (ADS) or manual relief valves, then use Low-Pressure Coolant Injection (LPCI) / core spray. This reactor hosts the Fukushima accident — an accident of sustained support.',
    authentic_units: 'The BWR is read in SI (MPa / °C) — the trainer default.',
  },
};

// Controls: g=group, c=on-screen control name, u=what it does (integrated voice),
// cmd=internal command action (DEV appendix only), p=params (DEV).
var CTL = {
  rod_start:    { g: 'Reactivity', c: 'Rods — Raise / Lower (hold)', u: 'Hold to drive a rod group: Raise (withdraw) adds reactivity and raises power; Lower (insert) removes it. Release to stop.', cmd: 'rod_start', p: '{group_id,direction,speed}' },
  rod_nudge:    { g: 'Reactivity', c: 'Rods — Nudge', u: 'Move the rods a small, fixed amount (rate-limited, not instant) — for fine reactivity adjustments.', cmd: 'rod_nudge', p: '{group_id,steps,speed}' },
  rod_stop:     { g: 'Reactivity', c: 'Rods — Stop', u: 'Stop the selected rod group.', cmd: 'rod_stop', p: '{group_id}' },
  rod_stop_all: { g: 'Reactivity', c: 'Rods — Stop All', u: 'Stop all moving rod groups.', cmd: 'rod_stop_all', p: '' },
  scram:        { g: 'Safety', c: 'SCRAM', u: 'Emergency shutdown — drives every rod fully in at once. A two-click armed button.', cmd: 'scram', p: '' },
  manual_scram: { g: 'Safety', c: 'AZ-5 (SCRAM)', u: 'The RBMK emergency-shutdown button (the one pressed at Chernobyl) — full rod insertion.', cmd: 'manual_scram', p: '' },
  set_steam_demand:  { g: 'Turbine & Grid', c: 'Turbine Load', u: 'Sets how much electrical load the turbine/generator carries, in megawatts-electric (MWe). Raising it draws more steam.', cmd: 'set_steam_demand', p: '{mwe}' },
  set_feedwater_flow:{ g: 'Secondary', c: 'Feedwater Flow', u: 'Sets the make-up water flow to the boiler, as a percent of rated; used to control level. (On the PWR this is a deprecated alias for the Feed Pump Speed control.)', cmd: 'set_feedwater_flow', p: '{pct}' },
  set_feed_pump_speed:{ g: 'Secondary', c: 'Feed Pump Speed', u: 'Commands the main feed pump speed (0–120 %); delivered feedwater follows through the pump’s inertia. Manual use takes the pump off automatic (three-element control or load coupling).', cmd: 'set_feed_pump_speed', p: '{pct}' },
  feed_pump_nudge:   { g: 'Secondary', c: 'Feed Pump — Nudge', u: 'Nudges the feed pump commanded speed up or down a couple of percent — the manual fine control.', cmd: 'feed_pump_nudge', p: '{delta_pct}' },
  set_heater:        { g: 'Pressurizer', c: 'PZR Heaters', u: 'Pressurizer (PZR) heaters boil water to RAISE primary pressure.', cmd: 'set_heater', p: '{power_pct}' },
  set_spray:         { g: 'Pressurizer', c: 'PZR Spray', u: 'Pressurizer spray condenses steam to LOWER primary pressure.', cmd: 'set_spray', p: '{open}' },
  open_porv:         { g: 'Pressurizer', c: 'PORV — Open', u: 'Opens the Power-Operated Relief Valve (PORV) to drop primary pressure quickly.', cmd: 'open_porv', p: '' },
  close_porv:        { g: 'Pressurizer', c: 'PORV — Close', u: 'Commands the PORV shut. NOTE: it can stick open while its indicator reads closed (the TMI trap).', cmd: 'close_porv', p: '' },
  open_block_valve:  { g: 'Pressurizer', c: 'PORV Block Valve — Open', u: 'Opens the isolation (block) valve upstream of the PORV, restoring the relief path.', cmd: 'open_block_valve', p: '' },
  close_block_valve: { g: 'Pressurizer', c: 'PORV Block Valve — Close', u: 'Isolates the PORV line — stops the leak through a stuck-open PORV. The key TMI recovery action.', cmd: 'close_block_valve', p: '' },
  set_hpi:           { g: 'Safety', c: 'HPI/LPI (Emergency Injection)', u: 'Emergency injection — one merged High-Pressure/Low-Pressure Injection (HPI/LPI) system. Flow follows a two-segment pump curve: a high-head trickle against operating pressure, high volume once the plant depressurizes below the low-head shutoff (~4.5 MPa).', cmd: 'set_hpi', p: '{active}' },
  set_afw:           { g: 'Secondary', c: 'AFW (Aux Feedwater)', u: 'Auxiliary Feedwater (AFW) — the backup water supply to the Steam Generators when main feedwater is lost. Delivered flow = capacity × throttle × a built-in level hold (full flow below the hold target, tapering to zero just above it).', cmd: 'set_afw', p: '{active}' },
  set_afw_flow:      { g: 'Secondary', c: 'AFW Throttle', u: 'Throttles Auxiliary Feedwater delivery, 0–100 % of capacity. Throttling by hand takes the AFW system off its automatic arm (press Auto to re-arm).', cmd: 'set_afw_flow', p: '{pct}' },
  open_msiv:         { g: 'Secondary', c: 'MSIV — Open', u: 'Opens the Main Steam Isolation Valve, restoring the steam path from the Steam Generators to the turbine and the dump.', cmd: 'open_msiv', p: '' },
  close_msiv:        { g: 'Secondary', c: 'MSIV — Close', u: 'Isolates main steam. The turbine trips, the bottled Steam Generator pressurizes to its code safety valves, and with feed gone it boils down toward the low-level reactor trip — close it deliberately.', cmd: 'close_msiv', p: '' },
  set_sr_detector:   { g: 'Reactivity', c: 'Source Range Detector On/Off', u: 'Energizes/secures the Source Range (SR) startup counter. P-6 interlocked: it cannot be switched OFF until the Intermediate Range is on scale (you would go blind), and cannot be switched ON at high flux (detector protection). Its 1e5 cps high-flux trip protects a startup — secure it during the SR→IR handoff.', cmd: 'set_sr_detector', p: '{on}' },
  set_trip_block:    { g: 'Safety', c: 'Startup Trip Blocks (IR / PR low setpoint)', u: 'Blocks the Intermediate Range high-flux trip or the Power Range LOW-SETPOINT (25 %) trip during a power ascension. Permitted only above the P-10 at-power permissive (10 %); both blocks auto-reinstate when power falls back below it.', cmd: 'set_trip_block', p: '{trip_id, blocked}' },
  set_esf_auto:      { g: 'Safety', c: 'ESF Auto Re-arm (HPI/LPI, AFW)', u: 'Returns an engineered-safety system to AUTOMATIC: the system re-arms for its auto-actuation, and a still-standing start condition fires immediately. Any manual action on the system (on/off/throttle) puts it in MANUAL.', cmd: 'set_esf_auto', p: '{system, auto}' },
  set_dhr:           { g: 'Safety', c: 'Decay-Heat Removal', u: 'Decay-Heat Removal (DHR / RHR) — removes leftover heat after shutdown once cool and depressurized.', cmd: 'set_dhr', p: '{active}' },
  set_boron_adjust:  { g: 'Reactivity', c: 'Boron — Borate / Dilute (CVCS)', u: 'Chemical & Volume Control System (CVCS) boron: Borate raises boron (lowers power), Dilute lowers it (raises power). Needs the charging pump running.', cmd: 'set_boron_adjust', p: '{rate}' },
  set_charging_flow: { g: 'Reactivity', c: 'Charging Pump (CVCS)', u: 'Charging injects coolant into the cold leg — raises primary inventory and carries the boron. Manual % or auto make-up.', cmd: 'set_charging_flow', p: '{normalized}' },
  set_charging_pump: { g: 'Reactivity', c: 'Charging Pump On/Off (CVCS)', u: 'Runs or stops the charging pump. Boration/dilution and charging need it running.', cmd: 'set_charging_pump', p: '{running}' },
  set_letdown_flow:  { g: 'Reactivity', c: 'Letdown Valve (CVCS)', u: 'Letdown removes coolant from the Reactor Coolant System — lowers primary inventory.', cmd: 'set_letdown_flow', p: '{normalized}' },
  set_cvcs_auto:     { g: 'Reactivity', c: 'CVCS Inventory Control', u: 'Auto modulates charging to make up identified leakage and hold inventory; Manual = you set charging/letdown.', cmd: 'set_cvcs_auto', p: '{active}' },
  set_steam_dump:    { g: 'Turbine & Grid', c: 'Steam Dump / Bypass', u: 'Dumps steam straight to the condenser (bypassing the turbine) to control pressure on a load rejection.', cmd: 'set_steam_dump', p: '{mode|pct}' },
  set_channel_flow:  { g: 'Coolant', c: 'Coolant Flow (MCP)', u: 'Sets Main Circulation Pump (MCP) flow, percent of rated. In the RBMK, MORE flow sweeps out steam and LOWERS power; LESS flow raises it. The primary power control.', cmd: 'set_channel_flow', p: '{pct}' },
  set_eps_bypass:    { g: 'Safety', c: 'EPS Bypass', u: 'Disables the automatic Emergency Protection System (EPS) trips — as was done before Chernobyl. Dangerous; use only for an authorized test.', cmd: 'set_eps_bypass', p: '{active}' },
  set_eccs:          { g: 'Safety', c: 'Emergency Core Cooling (ECCS)', u: 'Emergency Core Cooling System — injects to the fuel channels on a pressure-tube rupture / loss of coolant: makes up steam-drum level and holds a cooling-flow floor to arrest dryout.', cmd: 'set_eccs', p: '{active}' },
  set_turbine_load:  { g: 'Turbine & Grid', c: 'Turbine Load', u: 'Sets how much steam the turbine draws (MWe); the steam it does not take is dumped or relieved.', cmd: 'set_turbine_load', p: '{mwe}' },
  set_recirc_flow:   { g: 'Reactivity', c: 'Recirculation Flow', u: 'Sets the recirculation (recirc) drive, percent. The main BWR power control: MORE flow → fewer steam bubbles → MORE power. Core flow is ≈ 2.5× the drive.', cmd: 'set_recirc_flow', p: '{pct}' },
  trigger_ads:       { g: 'Safety', c: 'ADS (Depressurize)', u: 'Automatic Depressurization System (ADS) — blows the vessel down fast so low-pressure pumps can inject.', cmd: 'trigger_ads', p: '' },
  start_lpci:        { g: 'Safety', c: 'LPCI (Low-Pressure Injection)', u: 'Low-Pressure Coolant Injection (LPCI) — large-capacity injection; works only once pressure is below ~1.03 MPa.', cmd: 'start_lpci', p: '' },
  set_rcic:          { g: 'Safety', c: 'RCIC', u: 'Reactor Core Isolation Cooling (RCIC) — a steam-driven pump that cools the core with no AC power. Auto-starts on low level.', cmd: 'set_rcic', p: '{active}' },
  set_ic:            { g: 'Safety', c: 'Isolation Condenser (IC)', u: 'Isolation Condenser — a passive heat sink that condenses reactor steam and returns the condensate by gravity, cooling the core with no AC and no fresh water (DC-powered valves). Fukushima Unit 1 relied on one.', cmd: 'set_ic', p: '{active}' },
  set_hpci:          { g: 'Safety', c: 'HPCI', u: 'High-Pressure Coolant Injection (HPCI) — a higher-capacity steam-driven pump, also needing no AC power.', cmd: 'set_hpci', p: '{active}' },
  initiate_slc:      { g: 'Safety', c: 'SLC (Boron Injection)', u: 'Standby Liquid Control (SLC) — injects boron to shut the reactor down even if the rods will not insert (the backup for a failure-to-scram).', cmd: 'initiate_slc', p: '' },
  stop_slc:          { g: 'Safety', c: 'SLC — Stop', u: 'Stops further boron injection; the boron already injected stays in the core.', cmd: 'stop_slc', p: '' },
  start_lpcs:        { g: 'Safety', c: 'Core Spray (LPCS)', u: 'Low-Pressure Core Spray (LPCS) — sprays water onto the fuel; a second low-pressure injection path.', cmd: 'start_lpcs', p: '' },
  stop_lpcs:         { g: 'Safety', c: 'Core Spray — Stop', u: 'Stops the core spray.', cmd: 'stop_lpcs', p: '' },
  open_srv_manual:   { g: 'Safety', c: 'Manual Relief Valve — Open', u: 'Opens a Safety/Relief Valve (SRV) by hand for a controlled depressurization (slower than ADS).', cmd: 'open_srv_manual', p: '' },
  close_srv_manual:  { g: 'Safety', c: 'Manual Relief Valve — Close', u: 'Closes the manually-opened relief valve.', cmd: 'close_srv_manual', p: '' },
  automate:          { g: 'Automation', c: 'Automate Tab (per-control automation)', u: 'Tools → Automate: an AUTO/MAN toggle per plant control (rod control, feedwater level control, pressure control, load follow, steam dump, …). Engaged channels read the INSTRUMENTS and issue these same commands for you — setpoints capture the current reading and are editable. A failed sensor fools the automation, interlocks block it, and while a channel is engaged it overrides your manual input for that control. Rod/power channels disengage themselves on a scram; controllers run inside the Control Layer at a fixed simulated-time cadence, so time acceleration does not change their behavior.', cmd: '(issues the commands above)', p: '' },
  ar_rods:           { g: 'Reactivity', c: 'AR Rods — Automatic Regulator', u: 'The RBMK’s fine power-regulation rod group (~2 pcm/step vs the manual bank’s ~35). AUTO holds power at the Automate-tab setpoint; MAN (or holding its drive buttons) takes manual control — the condition the Chernobyl operators were in. When it nears either travel limit, re-center it with the manual bank (or engage the re-center channel). Excluded from ORM: the margin you watch is the manual bank.', cmd: 'rod_start / rod_nudge', p: '{group_id: "auto_rods", …}' },
};
var CONTROL_SETS = {
  pwr: ['rod_start', 'rod_nudge', 'rod_stop', 'rod_stop_all', 'scram', 'set_boron_adjust', 'set_charging_pump',
        'set_charging_flow', 'set_letdown_flow', 'set_cvcs_auto',
        'set_heater', 'set_spray', 'open_porv', 'close_porv', 'open_block_valve', 'close_block_valve',
        'set_feed_pump_speed', 'feed_pump_nudge', 'set_afw', 'set_afw_flow', 'set_esf_auto', 'set_steam_demand', 'set_steam_dump', 'set_hpi', 'set_dhr', 'set_sr_detector', 'set_trip_block', 'open_msiv', 'close_msiv', 'automate'],
  rbmk: ['rod_start', 'rod_nudge', 'rod_stop', 'rod_stop_all', 'ar_rods', 'manual_scram', 'scram', 'set_channel_flow',
         'set_feedwater_flow', 'set_turbine_load', 'set_steam_dump', 'set_eccs', 'set_eps_bypass', 'automate'],
  bwr: ['rod_start', 'rod_nudge', 'rod_stop', 'rod_stop_all', 'scram', 'set_recirc_flow', 'set_feedwater_flow',
        'set_turbine_load', 'set_steam_dump', 'set_rcic', 'set_ic', 'set_hpci', 'trigger_ads', 'start_lpci', 'start_lpcs',
        'stop_lpcs', 'open_srv_manual', 'close_srv_manual', 'initiate_slc', 'stop_slc', 'automate'],
};

// Indications: n=display name, m=what it measures (integrated), u=unit.
var IND = {
  power_range:       { n: 'Reactor Power', m: 'Reactor power (from neutron flux), as a percent of rated.', u: '%' },
  source_range:      { n: 'Source Range (SR) Counts', m: 'Startup neutron counter, counts per second on a log scale — the shutdown/startup flux indication. Reads the range floor when de-energized.', u: 'cps' },
  intermediate_range:{ n: 'Intermediate Range (IR) Current', m: 'Compensated ion chamber current, amperes on a log scale — carries the indication from the SR handoff up to ~10 % power.', u: 'A' },
  tavg:             { n: 'Average Coolant Temp (Tavg)', m: 'Average primary-coolant temperature.', u: '°C' },
  thot:             { n: 'Hot-Leg Temp (Thot)', m: 'Coolant temperature leaving the core.', u: '°C' },
  tcold:            { n: 'Cold-Leg Temp (Tcold)', m: 'Coolant temperature returning to the core.', u: '°C' },
  primary_pressure: { n: 'Primary Pressure', m: 'Primary-loop (Reactor Coolant System, RCS) pressure — kept high to prevent boiling.', u: 'MPa' },
  pzr_level:        { n: 'Pressurizer Level', m: 'Water level in the Pressurizer (PZR). Can rise misleadingly during a loss-of-coolant (the TMI trap).', u: '%' },
  sg_level:         { n: 'Steam Generator Level', m: 'Water level in the Steam Generators (SG). Briefly moves the "wrong way" on fast power changes (shrink/swell).', u: '%' },
  steam_flow:       { n: 'Steam Flow', m: 'Steam flow to the turbine (1.0 = rated).', u: '×rated' },
  fw_flow:          { n: 'Feedwater Flow', m: 'Feedwater flow (1.0 = rated).', u: '×rated' },
  mwe_output:       { n: 'Electrical Output', m: 'Gross electrical power to the grid.', u: 'MWe' },
  turbine_rpm:      { n: 'Turbine Speed', m: 'Turbine/generator speed; locked to the grid when synchronized.', u: 'RPM' },
  condenser_vacuum: { n: 'Condenser Vacuum', m: 'Condenser vacuum — needed for the turbine to run.', u: 'kPa' },
  subcooling_margin:{ n: 'Subcooling Margin', m: 'How far the coolant is from boiling (from indicated pressure & temperature). The truth-teller at TMI.', u: '°C' },
  porv_indicator:   { n: 'PORV Position Light', m: 'Relief-valve indicator. Shows the COMMANDED position, which can differ from reality (TMI).', u: '' },
  porv_tailpipe_temp:{ n: 'PORV Tailpipe Temperature', m: 'Temperature of the relief-valve discharge line. Runs warm (~80 °C) on normal seat leakage; a HOT line (~150 °C) behind a "closed" PORV means the valve is passing steam — the indication that finally revealed TMI.', u: '°C' },
  steam_pressure:   { n: 'Steam-Drum Pressure', m: 'Steam-drum pressure.', u: 'MPa' },
  drum_level:       { n: 'Steam-Drum Level', m: 'Water level in the steam drum.', u: '%' },
  channel_flow:     { n: 'Channel Flow', m: 'Coolant flow through the fuel channels, percent of rated.', u: '%' },
  void_fraction:    { n: 'Void Fraction', m: 'Fraction of the coolant that is steam bubbles — drives RBMK power.', u: 'frac' },
  fuel_temp:        { n: 'Fuel Temperature', m: 'Fuel temperature.', u: '°C' },
  orm_display:      { n: 'Operating Reactivity Margin (ORM)', m: 'Shutdown capacity currently in hand, in equivalent rods. The Chernobyl precondition when too low.', u: 'rods' },
  vessel_pressure:  { n: 'Vessel Pressure', m: 'Reactor-vessel pressure.', u: 'MPa' },
  vessel_level:     { n: 'Vessel Level', m: 'Water level in the vessel — the central safety parameter.', u: '%' },
  recirc_flow:      { n: 'Recirc / Core Flow', m: 'Core flow from the recirculation system, percent of rated.', u: '%' },
  core_void_fraction:{ n: 'Core Void Fraction', m: 'Steam-bubble fraction in the core.', u: 'frac' },
  rcic_status:      { n: 'RCIC Status', m: 'Whether the steam-driven RCIC pump is running.', u: '' },
};

// Safety limits (authored).
var SAFETY = {
  pwr: [
    { name: 'Fuel cladding damage', v: 1200, u: '°C', note: 'Cladding failure / fission-product release begins.' },
    { name: 'Fuel melt', v: 2800, u: '°C', note: 'Core melt.' },
    { name: 'PORV auto-open / reseat', v: '16.20 / 15.86', u: 'MPa', note: 'Power-operated relief.' },
    { name: 'Safety valves open / reseat', v: '17.13 / 16.55', u: 'MPa', note: 'Mechanical spring safeties.' },
    { name: 'Core-uncovery heat-transfer collapse', v: '< 0.50', u: 'inventory frac', note: 'Below 50% inventory the fuel-to-coolant coupling degrades → fuel heatup.' },
  ],
  rbmk: [
    { name: 'Fuel melt (thermal path)', v: 2800, u: '°C', note: 'Gradual-melt destruction path.' },
    { name: 'Steam-explosion energy deposition', v: 280, u: 'cal/g/s', note: 'Prompt-excursion destruction path (Chernobyl).' },
    { name: 'Drum relief valves open', v: 8.0, u: 'MPa', note: 'Overpressure relief.' },
    { name: 'ORM minimum (pre / post)', v: '15 / 43', u: 'rods', note: 'Below this the void feedback amplifies dangerously.' },
  ],
  bwr: [
    { name: 'Fuel cladding damage', v: 1200, u: '°C', note: 'Cladding failure begins.' },
    { name: 'Fuel melt', v: 2800, u: '°C', note: 'Core melt.' },
    { name: 'Relief/safety valves open', v: 7.58, u: 'MPa', note: 'SRV relief setpoint.' },
    { name: 'Core uncovery', v: '< 20', u: '% level', note: 'Below 20% level the core uncovers → fuel heatup.' },
    { name: 'Station-blackout battery window', v: 8.0, u: 'h', note: 'RCIC/HPCI DC control-power duration (v1 timed).' },
  ],
};

// Alarm response (integrated voice), plant → alarm id → {means, response}. Others default by priority.
var ALARM_RESPONSE = {
  pwr: {
    reactor_trip:      { m: 'The reactor has shut down (Reactor Protection System actuation).', r: 'Confirm rods in and power dropping; establish decay-heat removal (AFW / DHR); verify inventory.' },
    high_flux:         { m: 'Reactor power (neutron flux) is above the high setpoint.', r: 'Insert Control Rods to lower power; if it keeps rising, SCRAM.' },
    subcooling_low:    { m: 'The coolant is getting close to boiling (low subcooling margin).', r: 'Restore margin: raise primary pressure and/or lower temperature; check for a leak.' },
    subcooling_lost:   { m: 'The coolant is boiling — a serious loss-of-coolant condition (subcooling ≤ 0).', r: 'Ensure High-Pressure Injection (HPI) is running; do NOT throttle it on a rising Pressurizer level; isolate a stuck PORV with its block valve.' },
    pzr_pressure_lolo: { m: 'Primary pressure is dangerously low.', r: 'Confirm HPI actuation; find the leak or stuck relief path.' },
    pzr_level_lolo:    { m: 'Pressurizer level is very low — inventory may be leaving the plant.', r: 'Confirm charging / HPI; investigate the inventory loss.' },
    sg_level_lolo:     { m: 'Steam Generator level is critically low — the heat sink is failing.', r: 'Start Auxiliary Feedwater (AFW) immediately; trip the reactor if not already tripped.' },
    rcp_trip:          { m: 'A Reactor Coolant Pump (RCP) has tripped — flow is reduced.', r: 'Verify the low-flow trip and rod insertion; watch temperatures.' },
    porv_open:         { m: 'The relief valve (PORV) is showing open.', r: 'If it should be shut, command it closed; if flow persists, isolate with the block valve. Cross-check subcooling — the light can lie.' },
    sbo:               { m: 'All alternating-current (AC) power is lost — station blackout.', r: 'Preserve direct-current (DC) power; establish AFW / natural circulation; work to restore AC.' },
  },
  rbmk: {
    reactor_trip:      { m: 'AZ-5 has fired — the reactor is shutting down.', r: 'Confirm rods inserting and power dropping; maintain coolant flow.' },
    high_power:        { m: 'Reactor power is above the setpoint.', r: 'Reduce power (raise flow / insert rods); AZ-5 if it keeps rising.' },
    orm_low:           { m: 'The Operating Reactivity Margin (ORM) is too low — the reactor is unstable and hard to shut down. THIS IS THE CHERNOBYL PRECONDITION.', r: 'Insert Control Rods to restore ORM; if it cannot be restored, shut down. Never bypass protection here.' },
    void_high:         { m: 'Too much steam (void) in the core — reactivity is rising.', r: 'Raise Main Circulation Pump (MCP) flow to collapse voids; reduce power.' },
    drum_level_lolo:   { m: 'Steam-drum level critically low.', r: 'Restore feedwater; shut down if it cannot be restored.' },
    eps_bypass:        { m: 'Automatic Emergency Protection (EPS) is switched OFF — the reactor is unprotected.', r: 'Re-enable EPS unless a specific authorized test requires otherwise.' },
  },
  bwr: {
    vessel_level_low:  { m: 'Vessel water level is low.', r: 'Confirm feedwater / RCIC; investigate the cause.' },
    vessel_level_lo_lo:{ m: 'Vessel level is critically low — the core could uncover.', r: 'Get injection in NOW: RCIC/HPCI, or depressurize (ADS / manual relief) and use LPCI / core spray. Keeping the core covered is the priority.' },
    vessel_press_hi:   { m: 'Vessel pressure is high.', r: 'Verify the relief valves lift; reduce power / open the turbine bypass.' },
    sbo:               { m: 'All AC power is lost — station blackout.', r: 'Start RCIC/HPCI (they need no AC); watch battery charge; plan to depressurize-and-inject before the batteries die.' },
    battery_low:       { m: 'Battery power is low — steam-driven cooling will soon fail.', r: 'Before the batteries die: depressurize (ADS / manual relief) and line up low-pressure injection (LPCI / core spray).' },
    rcic_running:      { m: 'RCIC is running and cooling the core (status).', r: 'Monitor level and battery charge; stage the depressurize-and-inject contingency.' },
  },
};
function defaultResp(priority) {
  if (priority === 'critical') return 'Act immediately — follow the emergency procedure for this condition.';
  if (priority === 'warning') return 'Investigate and correct the cause before it worsens.';
  return 'Monitor; no immediate action required.';
}

// Glossary — shared base + per-plant extras.
var GLOSSARY_BASE = [
  ['AC / DC', 'Alternating-current / direct-current electrical power.'],
  ['SUR', 'Startup Rate — how fast power is changing, in decades (factors of ten) per minute (DPM).'],
  ['DPM', 'Decades Per Minute — the unit of startup rate (one decade = a factor of ten).'],
  ['MWe / MWt', 'Megawatts electric (grid output) / megawatts thermal (reactor heat).'],
  ['Reactor period', 'The time for power to change by a factor of e (~2.72); long period = slow change.'],
  ['SCRAM', 'A rapid full insertion of the control rods — emergency shutdown.'],
  ['Shutdown bank', 'The scram rods (the RBMK’s AZ / Emergency Protection group), normally parked fully withdrawn. Operable — hold Insert to add shutdown margin, Withdraw to park it back out — but a SCRAM always drives it fully in and overrides you.'],
  ['Decay heat', 'Heat from radioactive decay that continues after shutdown (~7% of rated, decaying).'],
  ['Xenon', 'Xenon-135, a neutron-absorbing fission product that builds in after a power drop.'],
  ['Reactivity', 'The tendency of the chain reaction to grow (+) or shrink (−); critical = steady.'],
  ['AUTO / MAN', 'Automatic / manual control of a plant control channel (Tools → Automate). AUTO reads the instruments and issues commands to hold a setpoint; MAN leaves the control to you.'],
  ['Setpoint (SP)', 'The value an automatic controller holds its parameter at. Automate channels capture the current reading when engaged; edit it to maneuver on automatic.'],
];
var GLOSSARY = {
  pwr: [['PWR', 'Pressurized Water Reactor.'], ['PZR', 'Pressurizer — sets primary pressure.'], ['SG', 'Steam Generator.'], ['PORV', 'Power-Operated Relief Valve.'], ['HPI/LPI', 'High-/Low-Pressure Injection — one merged emergency-injection system with a two-segment pump curve.'], ['ECCS', 'Emergency Core Cooling System (here, the merged HPI/LPI plus passive accumulators).'], ['AFW', 'Auxiliary Feedwater.'], ['CVCS', 'Chemical & Volume Control System (boron & inventory).'], ['MTC', 'Moderator Temperature Coefficient.'], ['RCP', 'Reactor Coolant Pump.'], ['DHR / RHR', 'Decay-Heat / Residual-Heat Removal.'], ['Tavg', 'Average coolant temperature.'], ['SR', 'Source Range — the startup neutron counter (counts per second).'], ['IR', 'Intermediate Range — compensated ion chamber (amperes) carrying the indication to ~10 % power.'], ['P-6', 'Permissive: IR on scale (≥ 1e-10 A) — allows securing the SR detector.'], ['P-10', 'Nuclear at-power permissive (10 %) — allows blocking the startup trips; they auto-reinstate below it.'], ['MSIV', 'Main Steam Isolation Valve — isolates the Steam Generators from the turbine.']],
  rbmk: [['RBMK', 'The Chernobyl-type graphite-moderated reactor.'], ['ORM', 'Operating Reactivity Margin — shutdown capacity in hand (counts the MANUAL bank; the AR group is excluded).'], ['AR', 'Automatic Regulator — the small, fine-stepped rod group that holds power automatically; switchable to manual (as the Chernobyl operators had it).'], ['MCP', 'Main Circulation Pump.'], ['AZ-5', 'The emergency-shutdown button.'], ['EPS', 'Emergency Protection System (auto-trips).'], ['ECCS', 'Emergency Core Cooling System — injects to the channels on a rupture / loss of coolant.'], ['Void', 'Steam bubbles in the coolant; in an RBMK they raise power.'], ['Positive scram effect', 'Pre-1986 rods briefly added reactivity as they began inserting.']],
  bwr: [['BWR', 'Boiling Water Reactor.'], ['RCIC', 'Reactor Core Isolation Cooling (steam-driven, no AC).'], ['IC', 'Isolation Condenser — passive heat sink (condenses steam, returns condensate; no AC). Fukushima Unit 1.'], ['HPCI', 'High-Pressure Coolant Injection (steam-driven, no AC).'], ['ADS', 'Automatic Depressurization System.'], ['LPCI', 'Low-Pressure Coolant Injection.'], ['LPCS', 'Low-Pressure Core Spray.'], ['SLC', 'Standby Liquid Control (boron; failure-to-scram backup).'], ['SRV', 'Safety/Relief Valve.'], ['MSIV', 'Main Steam Isolation Valve.'], ['Recirc', 'Recirculation flow — the main BWR power control.']],
};

var STATE_SUMMARY = {
  hot_full_power: '100% power at equilibrium — the normal operating point.',
  hot_zero_power: 'Hot Standby: subcritical, hot, at NOP temperature/pressure — control bank fully inserted.',
  '50_percent': 'Stable partial power for maneuvering practice.',
  full_power: '100% power, all systems normal.',
  hot_startup: 'Hot Standby: subcritical, low power, flow established — the approach-to-criticality start.',
  low_power_xenon: 'The Chernobyl precondition: ~7% power, xenon ~135%, ORM ~7.5, protection bypassed.',
  post_scram_sbo: 'The Fukushima start: scrammed with a station blackout, RCIC just started.',
};

// Display labels for true_state fields (the CONTEXT §6.3 vocabulary): the
// manual's Normal Values tables must speak the board's language, not the
// snapshot's — raw field ids are internal. Units are NOT included; the UI's
// mval() converts and appends them per the active units setting. An unmapped
// field falls back to its raw id in the UI, so a new field without a label
// stays visible rather than vanishing.
var TS_LABELS = {
  // shared
  power_pct: 'Reactor power', fuel_temp_c: 'Fuel temperature', decay_heat_pct: 'Decay heat',
  xenon_pct_eq: 'Xenon (vs equilibrium)', mwe_output: 'Electrical output', turbine_rpm: 'Turbine speed',
  condenser_vacuum_kpa: 'Condenser vacuum', scrammed: 'Reactor scrammed', melted: 'Core destroyed',
  reactivity_pcm: 'Net reactivity', startup_rate_dpm: 'Startup Rate (SUR)', reactor_period_s: 'Reactor period',
  station_blackout: 'Station blackout', turbine_tripped: 'Turbine tripped',
  steam_flow_normalized: 'Steam flow', fw_flow_normalized: 'Feedwater flow',
  steam_pressure_mpa: 'Steam pressure', destruction_cause: 'Destruction cause',
  // PWR
  tavg_c: 'Average coolant temperature (Tavg)', thot_c: 'Hot-leg temperature', tcold_c: 'Cold-leg temperature',
  pressure_mpa: 'Primary pressure', pzr_level_pct: 'Pressurizer (PZR) level', sg_level_pct: 'Steam Generator (SG) level',
  subcooling_c: 'Subcooling margin', core_inventory_pct: 'Primary coolant inventory', boron_ppm: 'Boron concentration',
  porv_open: 'PORV open (actual)', porv_stuck: 'PORV stuck', porv_tailpipe_temp_c: 'PORV tailpipe temperature',
  hpi_active: 'Emergency injection (HPI/LPI) delivering', hpi_flow_normalized: 'HPI/LPI flow (of combined rated)',
  sr_counts_cps: 'Source Range counts', ir_amps: 'Intermediate Range current', sr_energized: 'SR detector energized',
  msiv_open: 'MSIV open', sg_safety_open: 'SG safety valves lifting',
  afw_active: 'Auxiliary Feedwater (AFW) delivering', afw_pump_running: 'AFW pump running',
  fuel_damaged: 'Fuel damaged', pump_running: 'Reactor Coolant Pump (RCP) running', pump_flow_pct: 'RCP flow',
  steam_demand_mwe: 'Steam demand', condenser_cooling_available: 'Condenser cooling available',
  governor_valve_pct: 'Turbine governor valve', charging_flow_actual: 'CVCS charging flow (actual)',
  letdown_flow_actual: 'CVCS letdown flow (actual)', leak_flow: 'Primary leak flow',
  steam_dump_valve_pct: 'Steam dump valve', accumulators_discharging: 'Accumulators discharging',
  accumulator_flow_normalized: 'Accumulator flow', accumulator_volume_pct: 'Accumulator volume',
  rhr_active: 'Residual Heat Removal (RHR) aligned',
  // RBMK
  void_fraction_avg: 'Core void fraction', drum_level_pct: 'Steam drum level', channel_flow_pct: 'Channel flow',
  graphite_temp_avg_c: 'Graphite temperature', orm_equiv_rods: 'Operational Reactivity Margin (ORM)',
  orm_alarm_active: 'ORM alarm', eps_bypassed: 'EPS bypassed', steam_explosion_occurred: 'Steam explosion occurred',
  energy_deposition_rate: 'Energy deposition rate', design_version: 'Design version', steam_to_turbine: 'Turbine steam load',
  // BWR
  core_void_fraction: 'Core void fraction', vessel_pressure_mpa: 'Vessel pressure', vessel_level_pct: 'Vessel water level',
  recirc_flow_pct: 'Recirculation flow', rcic_running: 'RCIC running', hpci_running: 'HPCI running',
  ads_open: 'ADS open', lpci_running: 'LPCI running', lpcs_running: 'Core spray (LPCS) running',
  srv_manual_open: 'SRV manually open', slc_active: 'Standby Liquid Control (SLC) injecting', slc_tank_pct: 'SLC tank level',
  battery_charge_pct: 'Battery charge',
};

// ============================================================ extraction
function round(x) { if (typeof x !== 'number' || !isFinite(x)) return (typeof x === 'number' ? null : x); var a = Math.abs(x); if (a !== 0 && a < 0.01) return Number(x.toExponential(2)); return Math.round(x * 1000) / 1000; }
function sanitize(o) { var out = {}; for (var k in o) { var v = o[k]; if (typeof v === 'number') out[k] = round(v); else if (typeof v === 'boolean' || typeof v === 'string') out[k] = v; } return out; }
function combine(a, b) { return (a || '') + (b ? ' (' + b + ')' : ''); }

function buildControls(plant) {
  return (CONTROL_SETS[plant] || []).map(function (id) {
    var c = CTL[id] || { g: 'Other', c: id, u: '', cmd: id, p: '' };
    return { control: c.c, group: c.g, uses: c.u, command: c.cmd, params: c.p };
  });
}
function buildIndications(cfg, prot) {
  var out = [], specs = cfg.instruments;
  for (var id in specs) {
    if (id === 'status') continue; var s = specs[id]; if (!s || typeof s !== 'object') continue;
    var d = IND[id] || { n: id, m: id, u: '' };
    out.push({ id: id, name: d.n, measures: d.m, unit: d.u, range: s.range || null, lag_s: s.lag != null ? s.lag : null,
      derived: !!s.computed, boolean: !!s.boolean, alarms: prot.alarms.filter(function (a) { return a.instrument === id; }).map(function (a) { return a.id; }) });
  }
  return out;
}
function buildSetpoints(prot) {
  return {
    trips: prot.trips.map(function (t) { return { instrument: t.instrument, direction: t.direction, setpoint: t.setpoint, action: t.action }; }),
    actuations: (prot.actuations || []).map(function (a) { return { instrument: a.instrument, direction: a.direction, setpoint: a.setpoint, action: a.action, reset_below: a.reset_below, condition: a.condition }; }),
    alarms: prot.alarms.map(function (a) { return { id: a.id, name: combine(a.label_learning, a.label_industry), instrument: a.instrument, direction: a.direction, setpoint: a.setpoint, priority: a.priority, panel: a.panel }; }),
  };
}
function buildFailures(prot) { var out = []; for (var id in prot.failures) { var f = prot.failures[id]; out.push({ id: id, display: f.display, category: f.category || null, type: f.type, severity_meta: f.severity_meta || null }); } return out; }
function buildAlarmResponse(plant, prot) {
  var map = ALARM_RESPONSE[plant] || {};
  return prot.alarms.map(function (a) {
    var r = map[a.id] || {};
    return { id: a.id, name: combine(a.label_learning, a.label_industry), priority: a.priority, panel: a.panel,
      means: r.m || null, response: r.r || defaultResp(a.priority) };
  });
}
function captureNormals(makeEngine, cfg, plantId, dv) {
  var out = {};
  Object.keys(cfg.initial_states).forEach(function (name) {
    var e = makeEngine(); e.reset({ plant_id: plantId, initial_state: name, design_version: dv });
    var steady = (name === 'full_power' || name === 'hot_full_power' || name === '50_percent');
    var n = Math.round((steady ? 60 : 5) / 0.02);
    for (var i = 0; i < n; i++) e.step(0.02);
    out[name] = { label: STATE_SUMMARY[name] || name, settled_s: steady ? 60 : 5, true_state: sanitize(e.getTrueState()), instruments: sanitize(e.getInstruments()) };
  });
  return out;
}
function buildProfile(plant, Ctor, dv) {
  var e = new Ctor(dv ? { design_version: dv } : {}), cfg = e.cfg, prot = e.getProtectionConfig(), ov = OVERVIEW[plant];
  return {
    id: dv ? plant + '_' + dv.replace('_chernobyl', '') : plant, plant: plant, design_version: dv || null,
    name: ov.name + (dv ? (dv === 'pre_chernobyl' ? ' — pre-1986' : ' — post-1986') : ''),
    one_liner: ov.one_liner, overview: ov.overview, authentic_units: ov.authentic_units,
    controls: buildControls(plant), indications: buildIndications(cfg, prot), setpoints: buildSetpoints(prot),
    safety_limits: SAFETY[plant] || [], alarm_response: buildAlarmResponse(plant, prot), failures: buildFailures(prot),
    glossary: GLOSSARY_BASE.concat(GLOSSARY[plant] || []).map(function (g) { return { acronym: g[0], term: g[1] }; }),
    normal_values: captureNormals(function () { return new Ctor(dv ? { design_version: dv } : {}); }, cfg, plant, dv),
    ts_labels: TS_LABELS,
  };
}

var MANUAL = {
  _generated: 'by tools/gen_manual_reference.js — do not hand-edit; re-run after engine/config changes',
  pwr: buildProfile('pwr', RD.PWREngine, null),
  rbmk_pre: buildProfile('rbmk', RD.RBMKEngine, 'pre_chernobyl'),
  rbmk_post: buildProfile('rbmk', RD.RBMKEngine, 'post_chernobyl'),
  bwr: buildProfile('bwr', RD.BWREngine, null),
};
var body = ';(function (RD) {\n  "use strict";\n  RD.MANUAL = ' + JSON.stringify(MANUAL, null, 2).replace(/\n/g, '\n  ') + ';\n})(globalThis.RD || (globalThis.RD = {}));\n';
fs.writeFileSync(path.join(__dirname, '..', 'ui', 'manual_data.js'), body);
console.log('Wrote ui/manual_data.js (' + (body.length / 1024).toFixed(1) + ' KB)');
['pwr', 'rbmk_pre', 'rbmk_post', 'bwr'].forEach(function (k) { var p = MANUAL[k]; console.log('  ' + k + ': ' + p.controls.length + ' controls, ' + p.indications.length + ' indications, ' + p.alarm_response.length + ' alarms, ' + p.failures.length + ' failures, ' + p.glossary.length + ' glossary'); });
