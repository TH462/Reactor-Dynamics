/* pwr_board_wiring.js — RD.PwrBoardDriver: the sim-specific half of the PWR board.
 *
 * Maps every named diagram item (from pwr_board_data.js) to an engine command and
 * every indication to a snapshot instrument. The renderer (pwr_board.js) calls into
 * this driver for all behavior — it holds no plant knowledge itself.
 *
 * Command + snapshot contract is documented in WIRING_REFERENCE.md (dumped from a live
 * hot_full_power snapshot). Items are keyed by their stable `id`.
 *
 * The board is authored in US customary units (psi / °F / gpm); the engine is SI, so
 * indication values convert on the way out. Controls that the engine has no field for
 * (boron target-seeking, condensate pump) are handled here as operator automation or
 * flagged in WIRING_REFERENCE.md §GAPS.
 */
(function () {
  'use strict';
  var RD = window.RD = window.RD || {};

  // ---- unit conversions (SI -> board US) ----
  function C2F(c) { return c * 9 / 5 + 32; }
  function F2C(f) { return (f - 32) * 5 / 9; }
  function Cd2F(c) { return c * 9 / 5; }
  function MPa2psi(p) { return p * 145.038; }
  function psi2MPa(p) { return p / 145.038; }
  function kPa2inHg(k) { return k * 0.2953; }
  function satTempC(pMPa) { return pMPa > 0 ? 180 * Math.pow(pMPa, 0.245) : 15; } // Tsat approx, 0.1–10 MPa
  // Feedwater temperature proxy (no direct instrument): the final-feedwater temperature is
  // set by the FW-heater train, which is heated by turbine extraction steam — so it scales
  // with LOAD, from condensate (~40 °C, no load) to ~220 °C at full power. Tying it to steam
  // pressure instead read hot even at hot standby (feed pump off, feedwater actually cold).
  function fwTemp(s) { return 40 + 1.8 * clamp((s.instruments || {}).power_range || 0, 0, 100); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  // Condenser hotwell / condensate temperature — cold (condensing under vacuum), rising
  // modestly with load (higher backpressure). Shared by the condenser and the condensate pipes.
  function condTemp(s) { return 33 + 0.12 * ((s.instruments || {}).power_range || 0); }
  function r0(v) { return Math.round(v); }
  function r1(v) { return (Math.round(v * 10) / 10); }

  // Nominal full-scale flows for indications the engine exposes only as normalized/pct.
  var GPM_HPI = 600, GPM_AFW = 640, GPM_CHARGING = 1000, GPM_LETDOWN = 1000, GPM_FEED_PER_PCT = 10;
  var GPM_FEED = 1000;   // full-rated feed flow, for the measured fw_flow indication (normalized 0-1)
  // Editable-input valid ranges [min, max], in the board's display (US) units — the
  // renderer clamps every setpoint box to these and auto-corrects an out-of-range entry
  // to the nearest bound (both min and max). Sourced from the engine limits so a retune
  // keeps the UI honest; the board is US-only, so these are the only unit the box shows.
  var _CFG = (typeof RD !== 'undefined' && RD.PWR_CONFIG) || {};
  var _RX = _CFG.reactivity || {}, _PZ = _CFG.pressurizer || {}, _ID = _CFG.identity || {};
  var _SG = _CFG.steam_generator || {}, _EM = _CFG.emergency || {}, _TB = _CFG.turbine || {};
  // Charging: the normal make-up band (reactivity.charging_max 0.06) on the gpm scale = 60.
  var CHARGING_MAX_GPM = GPM_CHARGING * (_RX.charging_max || 0.06);
  var NUM_BOUNDS = {
    imro8rmka2y: [0, _ID.mwe_rated || 100],                          // generator load, MW (rated)
    imro8xhy2me: [0, 120 * GPM_FEED_PER_PCT],                        // SG feed, gpm (feed pump 0-120%)
    imro929i738: [0, 100],                                           // pzr spray, %
    imro96mj15p: [0, 100],                                           // pzr heater, %
    imrpq29jo7t: [0, 2500],                                          // boron target, ppm (channel sp.max)
    imrpq48hn3t: [0, CHARGING_MAX_GPM],                              // charging, gpm (0-60)
    imrsg8b7b9o: [Math.ceil(MPa2psi(0.1)),                           // pressure setpoint, psi:
                  Math.floor(MPa2psi(_PZ.safety_open_mpa || 17.13))], //   engine band 0.1 MPa .. pzr safety
    // Steam dump SETPOINT, psi. The engine clips set_steam_dump_setpoint to
    // [0.2 MPa, sg_safety_open_mpa] — 29..1350 psi — so the box refuses anything the
    // engine would silently clamp. This is the secondary-cooldown control: lowering it
    // vents the SG down and cools the primary through it, and it also sets the no-load
    // bottom of the Tavg program (T_sat(steam_dump_setpoint), pwr_engine.js:1147).
    ims31tq7mgc: [Math.ceil(MPa2psi(0.2)),
                  Math.floor(MPa2psi(_SG.sg_safety_open_mpa || 9.31))],
    ims3xu86zm5: [0, 100],                                           // RHR HX flow split, %
    // Circulating-water inlet temperature, °F — the modelled range (engine clips to the
    // same band in °C, so the box refuses what the engine would clamp).
    ims3v42jghn: [Math.round(C2F(_TB.cw_inlet_min_c != null ? _TB.cw_inlet_min_c : 4.4)),
                  Math.round(C2F(_TB.cw_inlet_max_c != null ? _TB.cw_inlet_max_c : 37.8))]
  };
  // ▲/▼ nudge size overrides (the authored data step is a coarse default). Survives a
  // board-data regeneration, unlike editing the generated pwr_board_data.js by hand.
  var NUM_STEP = {
    imro8rmka2y: 1,    // generator load: nudge 1 MW per arrow press (authored default was 20)
    imrpq29jo7t: 1     // boron target: nudge 1 ppm per arrow press (authored default was 20)
  };

  // ---- driver-local UI state (things the engine has no field for) ----
  var rodSpeed = 'normal';           // S/M/F selection for rod nudges
  var refs = null, ctxRef = null;
  var pop = null;                    // active popover element

  function cmd(c) { if (ctxRef && ctxRef.cmd) ctxRef.cmd(c); }
  function CS(s) { return s.control_state || {}; }
  // ---- indicator damping (#234) -----------------------------------------------------
  // Every board reading goes through here. This is the PANEL INDICATOR's own damping, not
  // the transmitter's: one transmitter feeds both the control system and the meter, but the
  // meter is damped harder because a human reading it wants it steady while a controller
  // wants it responsive. Modelling it here rather than in the engine is the whole point —
  // it changes what you SEE without changing what any controller ACTS ON, which is what
  // went wrong in #234 when the correlation was applied at the instrument instead.
  //
  // A first-order filter on white noise PRODUCES correlated noise, so this delivers the
  // drifting look directly. It also shrinks the displayed amplitude — at dt = 1 s the
  // displayed sigma is sqrt(a/(2-a)) of the instrument's, a = dt/(tau+dt): about 0.45x at
  // tau 2 s and 0.38x at tau 3 s. Both were asked for ("still drifts a little", "the
  // amplitude may be too much"), and one knob per indication buys both.
  //
  // Time constants are per indication, by what the thing physically is — a single global
  // number was wrong in both directions. Anything not listed is undamped: booleans, status
  // flags, and the noise:0 instruments are already smooth.
  var DISPLAY_DAMP = {
    // RTDs in a damped bypass manifold — heaviest damping on the board
    tavg: 3.5, thot: 3.5, tcold: 3.5,
    subcooling_margin: 3,            // derived from tavg + pressure; damped in its own right
    primary_pressure: 2.5, pzr_level: 2.5,
    power_range: 2,                  // excore genuinely wanders — the liveliest of the calm ones
    sg_level: 1.5,                   // fast PROCESS noise (boiling); damp lightly, keep it alive
    steam_pressure: 3, steam_flow: 2, fw_flow: 2, sg_steam_flow: 2,
    charging_flow: 3, letdown_flow: 3,
    hpi_flow: 2, accumulator_flow: 2, primary_leak_flow: 2,
    mwe_output: 2, turbine_rpm: 2, governor_valve: 2, steam_dump_valve: 2,
    boron_analyzer: 6, startup_rate: 3, porv_tailpipe_temp: 5, condenser_vacuum: 4
  };
  // A damped indicator must never hide a real transient. Past this many sigma of change in
  // one step the filter is bypassed, so a scram, a trip or a break reads instantly — which
  // is also what a real meter does, since its damping is small against a step that size.
  var DAMP_STEP_SIGMA = 6;
  function _dampSigma(id) {
    var spec = (_CFG.instruments || {})[id];
    if (!spec) return 0;
    if (spec.noise > 0) return spec.noise;
    // Derived/noise-free indications still need a step threshold; use a slice of range.
    var r = spec.range;
    return (r && isFinite(r[1] - r[0])) ? (r[1] - r[0]) * 0.002 : 0;
  }
  var _damp = { t: null, vals: {}, snap: null, out: null };
  function IN(s) {
    var raw = (s && s.instruments) || {};
    if (_damp.snap === s) return _damp.out;      // once per snapshot, not once per reader
    var t = (s && s.metadata && s.metadata.sim_time != null) ? s.metadata.sim_time : null;
    // Rewind, reset or a fresh mount restarts the filters; a pause (no time advance) holds
    // them where they are rather than snapping back to the raw value.
    var reseed = (t == null || _damp.t == null || t < _damp.t);
    var dt = (!reseed && t != null && _damp.t != null) ? (t - _damp.t) : 0;
    var out = {}, k;
    for (k in raw) out[k] = raw[k];
    for (k in DISPLAY_DAMP) {
      var v = raw[k];
      if (v == null || typeof v !== 'number' || !isFinite(v)) { delete _damp.vals[k]; continue; }
      var prev = _damp.vals[k];
      if (reseed || prev == null) { _damp.vals[k] = v; out[k] = v; continue; }
      var sig = _dampSigma(k);
      if (sig > 0 && Math.abs(v - prev) > DAMP_STEP_SIGMA * sig) { _damp.vals[k] = v; out[k] = v; continue; }
      if (dt > 0) {
        // dt is SIM time, so under time acceleration a = dt/(tau+dt) → 1 and the indicator
        // settles the way a real one does when you look away for a minute.
        prev += (v - prev) * (dt / (DISPLAY_DAMP[k] + dt));
        _damp.vals[k] = prev;
      }
      out[k] = prev;
    }
    if (t != null) _damp.t = t;
    _damp.snap = s; _damp.out = out;
    return out;
  }
  // Automation channel by id (boron concentration seeking lives in the control layer).
  function chan(s, id) {
    var ch = s.automation && s.automation.channels;
    if (!ch) return null;
    for (var i = 0; i < ch.length; i++) if (ch[i].id === id) return ch[i];
    return null;
  }
  // ESF arm state by system id ('auto' | 'manual'); the AUTO buttons highlight when armed.
  function esfAuto(s, id) {
    var e = s.automation && s.automation.esf;
    return !!(e && e[id] === 'auto');
  }
  function rodGroup(s, id) {
    var g = (CS(s).rod_groups || []);
    for (var i = 0; i < g.length; i++) if (g[i].id === id) return g[i];
    return null;
  }
  function pumpRec(s, id) {
    var p = (CS(s).pumps || []);
    for (var i = 0; i < p.length; i++) if (p[i].id === id) return p[i];
    return null;
  }

  // ================================================================ BUTTONS
  // Each entry: press(s) issues command(s); active(s) -> selected highlight.
  var BUTTONS = {
    // --- HPI / ECCS ---
    // AUTO/ON/OFF is a mutually-exclusive triad: AUTO lights
    // when the ESF arm is 'auto'; ON/OFF light only while in MANUAL (arm !== 'auto').
    imrldymb837: { press: function () { cmd({ action: 'set_hpi', active: true }); }, active: function (s) { return !esfAuto(s, 'hpi') && IN(s).hpi_active; } },
    imrldz0wqds: { press: function () { cmd({ action: 'set_hpi', active: false }); }, active: function (s) { return !esfAuto(s, 'hpi') && !IN(s).hpi_active; } },
    imrle1mc0lk: { press: function () { cmd({ action: 'set_esf_auto', system: 'hpi', auto: true }); }, active: function (s) { return esfAuto(s, 'hpi'); } },
    // --- RHR (V2 board: its own card, separate from the ECCS pump triad) ---
    // RHR has NO pump of its own — it is a suction ALIGNMENT on the shared ECCS train
    // (rhr_active === rhr_valve_open, pwr_engine.js:319), which is why these are
    // ALIGN/ISOLATE rather than START/STOP. The hot-leg suction valve is interlocked at
    // emergency.rhr_valve_interlock_mpa (2.76 MPa / 400 psi): the engine REFUSES the open
    // above it and force-closes on repressurization, so active() reads the true valve
    // state — a refused press visibly fails to latch instead of lying about the lineup.
    // Same triad convention as HPI: AUTO lights when the ESF arm is armed; ALIGN/ISOLATE
    // light only while in MANUAL.
    ims3wg27iif: { press: function () { cmd({ action: 'set_rhr', active: true }); }, active: function (s) { return !esfAuto(s, 'rhr') && !!IN(s).rhr_valve_open; } },
    ims3xfeye1q: { press: function () { cmd({ action: 'set_rhr', active: false }); }, active: function (s) { return !esfAuto(s, 'rhr') && !IN(s).rhr_valve_open; } },
    ims3xfl3xn6: { press: function () { cmd({ action: 'set_esf_auto', system: 'rhr', auto: true }); }, active: function (s) { return esfAuto(s, 'rhr'); } },
    // --- AFW ---
    imrmsslj42u: { press: function () { cmd({ action: 'set_afw', active: true }); }, active: function (s) { return !esfAuto(s, 'afw') && (IN(s).afw_active || IN(s).afw_pump_running); } },
    imrmssoa137: { press: function () { cmd({ action: 'set_afw', active: false }); }, active: function (s) { return !esfAuto(s, 'afw') && !(IN(s).afw_active || IN(s).afw_pump_running); } },
    imrmssr9ihq: { press: function () { cmd({ action: 'set_esf_auto', system: 'afw', auto: true }); }, active: function (s) { return esfAuto(s, 'afw'); } },
    // --- Charging panel: AUTO / MAN / OFF (this panel is the charging pump's control;
    //     OFF stops the charging pump, AUTO/MAN run it in auto make-up / manual charging) ---
    imrmtg3r8ez: { press: function () { cmd({ action: 'set_charging_pump', running: true }); cmd({ action: 'set_cvcs_auto', active: true }); }, active: function (s) { return CS(s).charging_pump_running && CS(s).cvcs_auto; } },
    imrprbi6ui1: { press: function () { cmd({ action: 'set_charging_pump', running: true }); cmd({ action: 'set_cvcs_auto', active: false }); }, active: function (s) { return CS(s).charging_pump_running && !CS(s).cvcs_auto; } },
    imrqn630s3b: { press: function () { cmd({ action: 'set_charging_pump', running: false }); }, active: function (s) { return !CS(s).charging_pump_running; } },
    // RCP ON/OFF (the two buttons sit on the reactor coolant pump; the pump itself is
    // rendered art-only so these are its controls — not a redundant built-in toggle).
    imrsjy1m9g: { press: function () { cmd({ action: 'set_rcp', running: true }); }, active: function (s) { return IN(s).rcp_running; } },
    imrsjy59pnu: { press: function () { cmd({ action: 'set_rcp', running: false }); }, active: function (s) { return !IN(s).rcp_running; } },
    // --- Letdown orifices: CLOSED / A 3% / B 4% / A+B 7% ---
    imrmtin8wm3: { press: function () { cmd({ action: 'set_letdown_orifices', a: false, b: false }); }, active: function (s) { return !CS(s).letdown_orifice_a && !CS(s).letdown_orifice_b; } },
    imrmtimrch3: { press: function () { cmd({ action: 'set_letdown_orifices', a: true, b: false }); }, active: function (s) { return CS(s).letdown_orifice_a && !CS(s).letdown_orifice_b; } },
    imrmtimhz4g: { press: function () { cmd({ action: 'set_letdown_orifices', a: false, b: true }); }, active: function (s) { return !CS(s).letdown_orifice_a && CS(s).letdown_orifice_b; } },
    imrmtimyxef: { press: function () { cmd({ action: 'set_letdown_orifices', a: true, b: true }); }, active: function (s) { return CS(s).letdown_orifice_a && CS(s).letdown_orifice_b; } },
    // --- Boron control ON / OFF: engages the control-layer 'boron_conc' channel ---
    // Rod control AUTO (rods_tavg channel) — single toggle, lit when engaged. The channel
    // captures the CURRENT indicated Tavg as its reference on engage (control layer), so
    // the procedure guidance "engage it while Tavg is where you want it" is load-bearing.
    ims5glucngg: { press: function (s) { var c = chan(s, 'rods_tavg'); cmd({ action: 'set_auto_channel', channel_id: 'rods_tavg', engaged: !(c && c.engaged) }); }, active: function (s) { var c = chan(s, 'rods_tavg'); return !!(c && c.engaged); } },
    imrqp6com2b: { press: function () { cmd({ action: 'set_auto_channel', channel_id: 'boron_conc', engaged: true }); }, active: function (s) { var c = chan(s, 'boron_conc'); return !!(c && c.engaged); } },
    imrqp6avzkw: { press: function () { cmd({ action: 'set_auto_channel', channel_id: 'boron_conc', engaged: false }); }, active: function (s) { var c = chan(s, 'boron_conc'); return !(c && c.engaged); } },
    // --- Pressurizer spray: AUTO / MANUAL / OFF ---
    imro8zestdm: { press: function () { cmd({ action: 'set_spray', auto: true }); }, active: function (s) { return CS(s).spray_auto; } },
    imro900yzeq: { press: function (s) { cmd({ action: 'set_spray', pct: CS(s).spray_valve_pct || 50 }); }, active: function (s) { return !CS(s).spray_auto && (CS(s).spray_valve_pct || 0) > 0; } },
    imro901sddd: { press: function () { cmd({ action: 'set_spray', pct: 0 }); }, active: function (s) { return !CS(s).spray_auto && (CS(s).spray_valve_pct || 0) === 0; } },
    // --- Pressurizer heater: AUTO / MANUAL / OFF ---
    imro969lnex: { press: function () { cmd({ action: 'set_heater', auto: true }); }, active: function (s) { return CS(s).heater_auto; } },
    imro96ei9hd: { press: function (s) { cmd({ action: 'set_heater', power_pct: CS(s).heater_power_pct || 50 }); }, active: function (s) { return !CS(s).heater_auto && (CS(s).heater_power_pct || 0) > 0; } },
    imro96h8lip: { press: function () { cmd({ action: 'set_heater', power_pct: 0 }); }, active: function (s) { return !CS(s).heater_auto && (CS(s).heater_power_pct || 0) === 0; } },
    // --- Control rods: WITHDRAW / INSERT — momentary (tap-or-hold). A quick TAP
    // moves ONE step; HOLDING drives the bank at the selected speed until release
    // (rod_start / rod_stop). See the hold state machine in the driver API below. ---
    imrpk6qzjq8: { hold: { group: 'control_rods', direction: 1 } },
    imrpk79mwng: { hold: { group: 'control_rods', direction: -1 } },
    imrpk8169ds: { press: function () { rodSpeed = 'slow'; }, active: function () { return rodSpeed === 'slow'; } },
    imrpk8grvcz: { press: function () { rodSpeed = 'normal'; }, active: function () { return rodSpeed === 'normal'; } },
    imrpk8kjsjs: { press: function () { rodSpeed = 'fast'; }, active: function () { return rodSpeed === 'fast'; } },
    // --- Shutdown rods — LATCHED full-travel drive, not tap-or-hold (owner, 2026-07-28).
    // The shutdown bank is not a trim control: it is parked fully out or driven fully in,
    // so making the operator hold a button for the entire travel was the wrong affordance.
    // One click starts it, the button holds a yellow in-motion light while it travels, a
    // second click stops it wherever it is, and the latch clears itself at the limit. ---
    imrpnyaxsb3: { press: function () { toggleLatchRod('shutdown_rods', 1); }, warn: function () { return latchActive('shutdown_rods', 1); } },
    imrpnyf37ju: { press: function () { toggleLatchRod('shutdown_rods', -1); }, warn: function () { return latchActive('shutdown_rods', -1); } },
    // --- Steam dump: AUTO / OPEN / CLOSE ---
    imrppqg6mcc: { press: function () { cmd({ action: 'set_steam_dump', mode: 'auto' }); }, active: function (s) { return CS(s).steam_dump_auto; } },
    imrppquqg16: { press: function () { cmd({ action: 'set_steam_dump', mode: 'open' }); }, active: function (s) { return !CS(s).steam_dump_auto && (CS(s).steam_dump_pct || 0) > 50; } },
    imrppqxggbj: { press: function () { cmd({ action: 'set_steam_dump', mode: 'closed' }); }, active: function (s) { return !CS(s).steam_dump_auto && (CS(s).steam_dump_pct || 0) <= 50; } },
    // --- Generator load mode: FOLLOW / MAN / OFF ---
    // FOLLOW and MAN bring the turbine ONLINE — connect_grid clears a prior trip/
    // disconnect (if condenser vacuum permits) and closes the breaker; set_load_mode
    // alone never un-trips, which is why pressing FOLLOW used to do nothing after OFF.
    // Lit state tracks the ACTUAL online/offline state: OFF lights only when the machine
    // is truly offline, FOLLOW/MAN only while online in that mode.
    // OFF reads load_mode, NOT turbine_tripped. Since #230 `disconnect_grid` is a PLANNED
    // offline that does not trip the turbine, so keying the lamp on the trip flag left the
    // whole three-way selector dark after a normal disconnect. load_mode covers both ways
    // of being off line — the trip path sets it too (SG.tripTurbine) — which is what this
    // lamp is actually reporting. The FOLLOW/MAN pair still exclude a tripped machine:
    // a tripped turbine is not online in any mode, whatever load_mode last said.
    imro8ktzs3u: { press: function () { cmd({ action: 'connect_grid' }); }, active: function (s) { return !IN(s).turbine_tripped && CS(s).load_mode === 'follow'; } },
    imro8lddxi: { press: function () { cmd({ action: 'connect_grid' }); cmd({ action: 'set_load_mode', mode: 'manual' }); }, active: function (s) { return !IN(s).turbine_tripped && CS(s).load_mode === 'manual'; } },
    imro8len0oi: { press: function () { cmd({ action: 'disconnect_grid' }); }, active: function (s) { return !!IN(s).turbine_tripped || CS(s).load_mode === 'disconnected'; } },
    // --- SG feed pump: AUTO / MAN / OFF ---
    // AUTO = the three-element feedwater channel (feed_sg), which is the plant's real feed
    // automation and the free-play default. (The board used to read feed_auto_coupled, a
    // legacy load-coupling flag that is OFF at the preset start, so AUTO looked like MAN even
    // though feed_sg was running.) A manual pump command drops feed_sg to MAN via its override.
    imrsgjmrjfg: { press: function () { cmd({ action: 'set_auto_channel', channel_id: 'feed_sg', engaged: true }); }, active: function (s) { var c = chan(s, 'feed_sg'); return !!(c && c.engaged); } },
    imrsgjuh7l0: { press: function (s) { cmd({ action: 'set_feed_pump_speed', pct: CS(s).feed_pump_speed_pct || 100 }); }, active: function (s) { var c = chan(s, 'feed_sg'); return !(c && c.engaged) && (CS(s).feed_pump_speed_pct || 0) > 0; } },
    imrsgjwq1q0: { press: function () { cmd({ action: 'set_feed_pump_speed', pct: 0 }); }, active: function (s) { var c = chan(s, 'feed_sg'); return !(c && c.engaged) && (CS(s).feed_pump_speed_pct || 0) === 0; } },
    // --- TRIP BLOCKS popover ---
    imrsk4xz2dm: { press: function (item, btn) { toggleTripBlocks(btn); } },
    // --- 1/M startup plot launcher (driver-injected tile; opens the draggable window) ---
    bdOneOverM: { press: function () { if (window.RD && window.RD.OneOverM) window.RD.OneOverM.open(); } },
    // --- Source-range detector: single energize/secure toggle. P-6 interlocked in the
    //     control layer (de-energize refused until IR on scale; re-energize refused at high
    //     flux); the engine ignores a blocked switch, so active() reflects the true state
    //     either way. Lit = energized/monitoring. Secure it during the SR→IR handoff to
    //     clear the 1e5 cps high-flux trip (pwr_control 'sr_high') before it scrams the ascent. ---
    bdSrDetector: { press: function (s) { cmd({ action: 'set_sr_detector', on: !IN(s).sr_energized }); }, active: function (s) { return !!IN(s).sr_energized; } },
    // --- Boron grab sample (batch-dose rework): draws an RCS sample; the lab posts the
    //     authoritative ppm after the turnaround (instruments.boron_sample/_pending).
    //     Lit while the lab is working. Doses auto-sample on completion; this button is
    //     for when the books may be stale (post-ECCS, freehand Bor/Dil). ---
    bdBoronSample: { press: function () { cmd({ action: 'take_boron_sample' }); }, active: function (s) { return !!IN(s).boron_sample_pending; } }
  };

  // Driver-supplied tiles NOT in the generated board_data.js. EMPTY as of the V2 diagram
  // (2026-07-27): everything that used to live here is now authored in the builder, so the
  // driver no longer has to inject items or patch the generated doc at mount.
  //
  // What moved, and why it was ever here — the V1 board was generated from a diagram that
  // predated these controls, so the driver grafted them on to survive a re-export:
  //   bdOneOverM / bdSrDetector / bdBoronSample  → authored (same ids kept, so their
  //       BUTTONS entries above are unchanged; only the injection went away)
  //   bdBoronChem   → authored as ims2jva1ff5
  //   bdSteamFlow   → authored TWICE (ims31ngjkf8 at the SG head, ims3wm0d0bu on the feed
  //       card above FEED FLOW — the #206 three-element pairing, now authored rather than
  //       bolted on), so bdSteamFlowBox is gone too
  // The old extraItems() doc patches went with them: the '/912' rod-step units, the SCRAM
  // reposition, the BORON CONTROL box height, the 'ACTUAL'→'CHEM' relabel and the boron
  // analyzer splice are all either authored correctly now or refer to items V2 dropped.
  // Applying them against the V2 doc would MOVE things (the SCRAM patch forced top=335;
  // V2 authors it at 255), so they are deleted rather than kept "just in case".
  //   bdRodAuto     → authored as ims5glucngg (2026-07-28t re-export: the owner moved the
  //       rod-card buttons, and ROD AUTO / TRIP BLOCKS now sit as an authored row under the
  //       CONTROL and SHUTDOWN boxes, which were shortened to make room)
  //   bdPzrTempLbl/Val, bdPzrHtrLbl/Val → authored as ims5gp0aicx / ims5gq44zgr and
  //       ims5gpdv96m / ims5gprvl7n, beside the pressurizer where the injected pair sat
  //
  // EMPTY when possible — a driver-injected tile is invisible to the builder.
  // Period sits under the REACTIVITY readout (true-state teaching quantity, same
  // family as ρ pcm). Coordinates match the authored REACTIVITY / pcm pair.
  var EXTRA_ITEMS = [
    { id: 'bdRxPeriodLbl', kind: 'text', name: 'Reactor period label',
      left: 885, top: 490, text: 'PERIOD', fontSize: 12, color: '#8ba4b6', weight: 600, mono: true },
    { id: 'bdRxPeriod', kind: 'value', name: 'Reactor period  ·  sim: true_state.reactor_period_s',
      left: 960, top: 505, value: '∞', unit: 's', color: '#8ba4b6', fontSize: 14, rAnchor: true }
  ];

  // ================================================================ NUMBERS (editable)
  // set(v): issue command from the typed value; get(s): reflect current sim state.
  var NUMBERS = {
    imro8rmka2y: { set: function (v) { cmd({ action: 'set_load_target', mwe: v }); }, get: function (s) { return CS(s).load_target_mwe; } },              // Generator Load MW
    imro8xhy2me: { set: function (v) { cmd({ action: 'set_feed_pump_speed', pct: v / GPM_FEED_PER_PCT }); }, get: function (s) { return (CS(s).feed_pump_speed_pct || 0) * GPM_FEED_PER_PCT; } }, // SG Feed rate gpm
    imro929i738: { set: function (v) { cmd({ action: 'set_spray', pct: v }); }, get: function (s) { return CS(s).spray_valve_pct; } },                    // spray %
    imro96mj15p: { set: function (v) { cmd({ action: 'set_heater', power_pct: v }); }, get: function (s) { return CS(s).heater_power_pct; } },             // heater %
    imrpq29jo7t: { set: function (v) { cmd({ action: 'set_auto_setpoint', channel_id: 'boron_conc', value: v }); }, get: function (s) { var c = chan(s, 'boron_conc'); return c && c.setpoint != null ? c.setpoint : null; } }, // boron target ppm (control-layer channel setpoint)
    imrpq48hn3t: { set: function (v) { cmd({ action: 'set_charging_flow', normalized: v / GPM_CHARGING }); }, get: function (s) { return (CS(s).charging_flow_normalized || 0) * GPM_CHARGING; } }, // charging gpm (input clamped to NUM_BOUNDS)
    imrsg8b7b9o: { set: function (v) { cmd({ action: 'set_pressure_setpoint', mpa: psi2MPa(v) }); }, get: function (s) { return MPa2psi(CS(s).pressure_setpoint || 0); } }, // plant pressure setpoint psi
    // Steam dump setpoint, psi — the secondary-cooldown handle. Sits directly under the
    // STEAM PRESS indication on the card so the gap between the two is legible: at power
    // the SG runs ~819 psi against a 1194 psi setpoint, which is WHY the dump is shut.
    ims31tq7mgc: { set: function (v) { cmd({ action: 'set_steam_dump_setpoint', mpa: psi2MPa(v) }); }, get: function (s) { return MPa2psi(CS(s).steam_dump_setpoint || 0); } },
    // RHR heat-exchanger flow split, % — the cooldown-RATE knob (Q_rhr scales with it,
    // pwr_thermal.js:90-93). Deliberately NOT an alignment command: the control layer
    // excludes set_rhr_hx from the 'rhr' ESF arm's disarming command list, so trimming
    // the rate does not drop the auto-alignment (pwr_control.js:556-558). numberAuto()
    // therefore leaves this box editable even while RHR AUTO is lit.
    ims3xu86zm5: { set: function (v) { cmd({ action: 'set_rhr_hx', pct: v }); }, get: function (s) { var f = CS(s).rhr_hx_fraction; return f == null ? 100 : f * 100; } },
    // Circulating-water inlet temperature, °F. Board is US, engine is SI. Sits next to the
    // COND VAC readout because vacuum is the variable it moves: raise the water temperature
    // and the condenser can only pull down to a warmer saturation, so vacuum falls, output
    // falls at the same steam flow, and the 74.5 kPa turbine trip gets closer. It also
    // raises the RHR heat exchanger's sink, so a Mode 5 cooldown bottoms out warmer.
    ims3v42jghn: {
      set: function (v) { cmd({ action: 'set_condenser_cw_temp', c: F2C(v) }); },
      get: function (s) { var c = CS(s).cw_inlet_temp_c; return c == null ? null : C2F(c); }
    }
  };

  // ================================================================ VALUES (indications)
  // fn(s) -> display text (unit stays as authored on the item).
  var VALUES = {
    // --- ECCS (merged HPI/LPI): ONE pump on a dedicated RWST-sourced train (owner ruling
    //     2026-07-22, pwr_primary.js:56-60) — NOT the charging pump doing double duty, which
    //     is what justifies the two systems reading on different flow scales. ---
    ims3w1cb6jc: function (s) { return r0((IN(s).hpi_flow || 0) * GPM_HPI); },                          // ECCS flow gpm (true hpi_flow)
    ims3w1lj7n6: function (s) { return r0(MPa2psi(IN(s).hpi_discharge_pressure || 0)); },               // ECCS discharge psi (true pump head)
    // Which alignment that one pump is in: RHR when the hot-leg suction valve is open, else
    // HPI/LPI by pressure regime, else off (pwr_engine.js:320). This is the readout that
    // makes the single-pump/two-suctions arrangement legible on the board.
    // CS, not IN: the engine publishes eccs_mode in control_state only (pwr_engine.js:592) —
    // reading instruments here left the readout at 'OFF' forever, including the shipped
    // Mode 5 lineup that spawns RHR-aligned (#235).
    ims3w61jjbi: function (s) { return String(CS(s).eccs_mode || 'off').toUpperCase(); },
    imrmstovyli: function (s) { return r0((IN(s).afw_flow || 0) * GPM_AFW); },                          // AFW flow gpm (true afw_flow)
    imrmsu1bl4r: function (s) { return r0(MPa2psi(IN(s).afw_discharge_pressure || 0)); },               // AFW discharge psi (true pump head)
    // AFW pump state. The V2 board draws no AFW pump — the card is the pump — so this is
    // its run light, and it reads pump DEMAND (afw_pump_demand), not delivered flow. With
    // the block valve shut it says RUNNING while FLOW reads 0 and DISCG pins to the
    // 1500 psi shutoff head. That divergence is the TMI-2 lesson and HR1 forbids softening
    // it, so the word stays "RUNNING". STANDBY vs SECURED separates "armed, waiting on a
    // low-level signal" from "the operator stopped it and disarmed the auto-start".
    ims3xw3vue6: function (s) {
      if (IN(s).afw_pump_running) return 'RUNNING';
      return esfAuto(s, 'afw') ? 'STANDBY' : 'SECURED';
    },
    imrzp89wdfu: function (s) { return r0((IN(s).letdown_flow || 0) * GPM_LETDOWN); },                  // letdown flow gpm (readout)
    imrzp8qps6u: function (s) { return r0((IN(s).charging_flow || 0) * GPM_CHARGING); },                // charging flow gpm (readout)
    // PORV position light — the COMMANDED state, not the disc. This is the TMI-2 lie: it
    // reads CLOSED while a stuck valve keeps venting, and the tailpipe temperature below is
    // the only honest tell. The schematic PORV shows true disc position; this does not.
    ims2jf7fv7m: function (s) { return String(IN(s).porv_indicator || 'closed').toUpperCase(); },
    // PZR temperature + live heater power (EXTRA_ITEMS pair, #237). Heater reads the
    // engine's ACTUAL output (heater_power_frac) — under AUTO this is the proportional
    // controller's live demand, which the panel's editable % box shows greyed.
    ims5gq44zgr: function (s) { return r0(C2F(satTempC(IN(s).primary_pressure))); },
    ims5gprvl7n: function (s) { return r0(CS(s).heater_power_pct || 0); },
    imro6qpci2d: function (s) { return r0(Cd2F(IN(s).thot - IN(s).tcold)); },                           // dTavg °F
    imro6qsncb9: function (s) { var v = IN(s).startup_rate || 0; return (v >= 0 ? '+' : '') + v.toFixed(2); }, // SUR DPM
    imro6qutiht: function (s) {                                                                          // source range cps (amber at SR→IR handoff)
      var sr = IN(s).source_range;
      // Amber at the SR high-flux CAUTION (pwr_control 'sr_high_flux', 5e4 cps): the cue to
      // finish the SR→IR handoff and secure the SR detector before its 1e5 cps high-flux trip.
      var handoff = sr != null && isFinite(sr) && sr >= SR_HANDOFF_CPS;
      return { text: fmtExp(sr), color: handoff ? SR_HANDOFF_COLOR : SR_NORMAL_COLOR };
    },
    imro6rctcgm: function (s) { return fmtExp(IN(s).intermediate_range); },                              // IR amps (log scale, amps — like SR; was a mislabeled µA integer that read "0"/"1")
    imro6rdwwdn: function (s) { var r = (s.true_state && s.true_state.reactivity_pcm) || 0; return (r >= 0 ? '+' : '') + r0(r); }, // reactivity pcm
    // Reactor period (s) — teaching readout under REACTIVITY. ∞ when steady.
    bdRxPeriod: function (s) {
      var per = s.true_state && s.true_state.reactor_period_s;
      if (per == null) return { text: '—', unit: 's' };
      if (!isFinite(per) || Math.abs(per) > 9999) return { text: '∞', unit: 's' };
      return { text: String(Math.round(per)), unit: 's' };
    },
    imrpk4pjcpd: function (s) { var g = rodGroup(s, 'control_rods'); return g ? g.steps : 0; },         // control rod steps
    imrpnzfsfcx: function (s) { var g = rodGroup(s, 'shutdown_rods'); return g ? g.steps : 0; },        // shutdown rod steps
    imrppee04aj: function (s) { return r0(IN(s).turbine_rpm); },                                        // turbine rpm
    imrzmlyafa3: function (s) { return r0(IN(s).steam_dump_valve); },                                   // steam dump % (readout)
    imrppeh5hkb: function (s) { return r0(IN(s).mwe_output); },                                         // generator MW
    imrppej8ulo: function (s) { return r0(IN(s).governor_valve); },                                     // governor %
    imrppq5r7kw: function (s) { return CS(s).steam_dump_auto ? 'NORMAL' : ((CS(s).steam_dump_pct || 0) > 0 ? 'DUMPING' : 'MANUAL'); }, // steam dump status
    imrppyp0wfo: function (s) { return accN2Psi(s); },                                                  // accumulator N2 psig
    imrppztrng1: function (s) { return IN(s).accumulators_discharging ? 'INJECTING' : (accIsolated(s) ? 'ISOLATED' : 'ARMED'); }, // accumulator status
    imrpq0n2ujv: function (s) { return r0(accFill(s)); },                                               // accumulator fill %
    ims3wy5oym4: function (s) {                                                                          // boron status (+ dose countdown)
      var r = CS(s).boron_adjust || 0;
      var base = r > 0 ? 'BORATING' : (r < 0 ? 'DILUTING' : 'HOLD');
      // Batch-dose totalizer: append the metered ppm remaining while a channel dose runs.
      var c = chan(s, 'boron_conc'), rem = c && c.dose_remaining;
      if (r !== 0 && rem != null && Math.abs(rem) > 0.05) base += ' ' + Math.round(Math.abs(rem)) + '→';
      return base;
    },
    // Boron chem sample (lab result). The V1 item carried no unit so the text baked one in;
    // the V2 item is authored with unit 'ppm', which rendered "734 PPM ppm". Return the
    // unit explicitly instead: 'ppm' with a number, blank for the non-numeric states, so
    // "SAMPLING…" and "—" don't get a stray unit hung off them either.
    ims2jva1ff5: function (s) {
      if (IN(s).boron_sample_pending) return { text: 'SAMPLING…', unit: '' };
      var v = IN(s).boron_sample;
      return v != null ? { text: String(r0(v)), unit: 'ppm' } : { text: '—', unit: '' };
    },
    // Condensate polisher: there is no polisher model, so this cannot report resin condition.
    // It reports the one thing that IS modeled — whether condensate is flowing through it —
    // instead of the hard-coded 'NORMAL' it displayed until 2026-07-25.
    imrqrouhrdr: function (s) { return IN(s).condensate_pump_running ? 'IN SERVICE' : 'STANDBY'; },
    // Condenser vacuum, inHg. Two readouts on the V2 board: on the condenser itself, and
    // on the CONDENSER COOLING card next to the circulating-water temperature that drives
    // it — the pairing is the point, since vacuum is the variable that CW temperature moves.
    imrqzuhzre3: function (s) { return r0(kPa2inHg(IN(s).condenser_vacuum)); },                         // condenser vacuum inHg (mimic)
    ims3xp168iy: function (s) { return r0(kPa2inHg(IN(s).condenser_vacuum)); },                         // condenser vacuum inHg (cooling card)
    imrr1gwi93j: function (s) { return r0(MPa2psi(IN(s).steam_pressure)); },                            // SG pressure psi
    imrr1hecwq7: function (s) { return r0(C2F(satTempC(IN(s).steam_pressure))); },                      // steam temp °F (sat)
    imrr4fnxhlc: function (s) { return r0(C2F(IN(s).thot)); },                                          // T-hot °F
    imrr4g29a7c: function (s) { return r0(C2F(IN(s).tcold)); },                                         // T-cold °F
    imrsgch20pv: function (s) {                                                                          // PORV tailpipe °F
      // The one honest tell in the TMI-2 sequence: a seated PORV leaves the tailpipe at its
      // ~180 °F leaky-seat baseline; a passing (stuck-open) valve cooks it toward ~300 °F.
      // The 1979 crew had this reading and misread it — so make the elevation legible: amber
      // once it climbs clear of baseline (issue #105 #6). SR_NORMAL_COLOR is the authored green.
      var c = IN(s).porv_tailpipe_temp;
      if (c == null) return null;
      return { text: String(r0(C2F(c))), color: c > 100 ? SR_HANDOFF_COLOR : SR_NORMAL_COLOR };
    },
    // SG feed rate: MEASURED feed flow, not pump demand. This read control_state
    // feed_pump_speed_pct until 2026-07-25, so it showed what was asked for rather than what
    // the plant delivered — the indication stayed at demand through a feed-pump trip.
    imrsgkz4lq0: function (s) { return r0((IN(s).fw_flow || 0) * GPM_FEED); },                          // SG feed rate gpm
    // Main steam line flow — the TOTAL SG draw (turbine + dump + safeties), which is what
    // feed has to match. NOT the `steam_flow` instrument: that is governor/turbine flow only
    // and reads ~0 whenever the turbine is offline and the dump is carrying the plant — the
    // same blind spot that had the three-element channel commanding zero feed through a
    // turbine trip (#206). Same GPM_FEED scale as the feed indication above it. HR1: reads
    // the instrument, so a failed transmitter lies here exactly as it does to the channel.
    //   V2 shows it twice: at the SG steam head on the mimic, and — the one that matters —
    // directly above FEED FLOW on the STEAM GEN FEED card, so matching the two in MANUAL is
    // a visual comparison rather than arithmetic.
    ims31ngjkf8: steamFlowGpm,                                                                          // steam flow gpm (SG head)
    ims3wm0d0bu: steamFlowGpm                                                                           // steam flow gpm (feed card)
  };

  function steamFlowGpm(s) {
    var f = IN(s).sg_steam_flow;
    return f == null ? null : r0(f * GPM_FEED);
  }

  // SR→IR handoff cue: turn the source-range indication amber at the SR high-flux caution
  // (matches pwr_control 'sr_high_flux' = 5e4 cps), prompting the operator to secure the SR
  // before its 1e5 cps trip. SR_NORMAL_COLOR is the authored green on the SR indication item.
  var SR_HANDOFF_CPS = 5.0e4, SR_HANDOFF_COLOR = '#D9A441' /* --caution */, SR_NORMAL_COLOR = '#5aad7c';
  function fmtExp(v) { if (!v || v <= 0) return '0'; var e = Math.floor(Math.log10(v)); var m = v / Math.pow(10, e); return m.toFixed(1) + 'e' + e; }
  function accIsolated(s) { return CS(s).accumulator_valve_open === false; }
  function accFill(s) { var t = s.true_state || {}; return t.accumulator_volume_pct != null ? t.accumulator_volume_pct : 78; }
  // N2 cover-gas pressure. Older saves predate the engine field — show a dash rather than a
  // fabricated constant (this readout was pinned at a hard-coded 640 psig until 2026-07-25).
  function accN2Psi(s) { var t = s.true_state || {}; return t.accumulator_pressure_mpa != null ? r0(MPa2psi(t.accumulator_pressure_mpa)) : null; }

  // ================================================================ COMPONENTS
  // compProps(item, s) -> props for the component's update()
  function pumpProps(running, speed, temp) { return { running: !!running, speed: speed, temp: temp }; }
  // flowing (default true): when false the valve shows OPEN + water-filled but NOT flowing —
  // e.g. an aligned accumulator isolation valve held shut by its 600 psi check valve.
  function valveProps(openFrac, contents, temp, flowing) { return { openFrac: openFrac, contents: contents, temp: temp, flow: flowing !== false }; }

  var COMPPROPS = {
    reactorVessel: function (s) {
      var cr = rodGroup(s, 'control_rods'), sr = rodGroup(s, 'shutdown_rods');
      var t = s.true_state || {};
      var sub = IN(s).subcooling_margin;
      // Core boiling: primarily the real void fraction the engine tracks (0..~0.3), scaled
      // so even a few percent voids show light bubbling; plus a superheat kick if subcooling
      // actually goes negative. Zero voids + subcooled ⇒ no bubbles (normal PWR operation).
      var voidFrac = t.core_void_fraction != null ? t.core_void_fraction : 0;
      return {
        regFrac: cr ? cr.position_pct / 100 : 0.9,
        shutFrac: sr ? sr.position_pct / 100 : 1,
        power: (IN(s).power_range || 0) / 100,
        coreInv: t.core_inventory_pct != null ? t.core_inventory_pct : 100,
        boil: Math.min(100, Math.max(voidFrac * 400, (sub != null && sub < 0) ? -sub * 3 : 0)),
        // coolant water color = live leg temperatures (fuel/glow stay power-driven)
        tcold: IN(s).tcold, thot: IN(s).thot,
        glow: true, showFlow: IN(s).rcp_running
      };
    },
    steamGenerator: function (s) {
      // level = wide range (whole-vessel water column); narrowLevel = the working range on
      // the LVL gauge (with its alarm/trip zones). Two distinct engine instruments.
      // boil = boiling vigor, driven by live steam production (steam_flow, normalized ~0..1)
      // so the SG bubbles hard at power and goes calm when there's no steam demand.
      return { power: IN(s).power_range, level: IN(s).sg_level_wide, narrowLevel: IN(s).sg_level,
        boil: Math.min(100, (IN(s).steam_flow || 0) * 85),
        temp: satTempC(IN(s).steam_pressure),
        // U-tubes + channel-head reservoirs carry primary coolant — color by leg temps
        thot: IN(s).thot, tcold: IN(s).tcold, showFlow: true, glow: true };
    },
    pressurizer: function (s) {
      var c = CS(s);
      // Fluid color tracks the LIVE pressurizer temperature = saturation temp of the RCS
      // pressure (the pressurizer sits at saturation), so it runs red hot at operating
      // pressure and cools as the plant depressurizes — not a fixed 345 °C.
      return { level: IN(s).pzr_level, heaterPower: c.heater_power_pct,
        heaterOn: (c.heater_power_pct || 0) > 0 || (c.heater_auto && (IN(s).power_range || 0) > 0),
        spray: (c.spray_valve_pct || 0) > 2, temp: satTempC(IN(s).primary_pressure),
        // the spray runs carry COLD-LEG water — same live temp as the external spray pipe (#237)
        sprayTemp: IN(s).tcold, glow: true, showFlow: true };
    },
    // The PORV schematic shows the TRUE valve position (disc lift), not the demand-
    // signal light — that light is the TMI-2 lie, reading "closed" while the valve is
    // stuck open (issue #105 #5), while the operator's PORV *indicator* readout stays
    // wrong. The plume/flow, however, track ACTUAL DISCHARGE: closing the PORV block
    // valve isolates the line, so a stuck-open PORV keeps its disc lifted but vents
    // nothing — which is how the operator sees the block-valve isolation take effect.
    // Falls back to the indicator if a snapshot ever lacks true_state (defensive).
    porv: function (s) {
      var t = s.true_state || {};
      var open = t.porv_open != null ? !!t.porv_open : (IN(s).porv_indicator === 'open');
      var blockOpen = t.block_valve_open != null ? !!t.block_valve_open : (CS(s).porv_block_open !== false);
      return { open: open, flowing: open && blockOpen };
    },
    condenser: function (s) {
      // hotwell/condensate temperature rises modestly with load (higher backpressure) but
      // stays cold — the condensing side under vacuum, never primary-hot.
      return { steamLoad: IN(s).power_range, hotwellLevel: 55,
        coolingFlow: IN(s).condenser_cooling_available ? 80 : 0,
        temp: condTemp(s),
        vacuumInHg: kPa2inHg(IN(s).condenser_vacuum) };
    },
    coolingTower: function (s) {
      return { heatLoad: IN(s).power_range, coolingFlow: IN(s).condenser_cooling_available ? 80 : 0 };
    },
    turbineGenerator: function (s) {
      var gov = (IN(s).governor_valve || 0) / 100;
      return { flowFrac: IN(s).steam_demand_low ? 0 : gov };
    },
    // pumps — the fluid-color temperature is LIVE where the pump moves plant fluid whose
    // temperature changes with state (RCP on the cold leg; feed pump = feedwater); cold
    // make-up sources (HPI/RWST, charging/VCT, condensate/hotwell) stay near-constant cold.
    imrobnzlha1: function (s) { return pumpProps(IN(s).hpi_active, IN(s).hpi_flow || 0, 50); },                                  // eccs pump (RWST — cold)
    imrobph7xrq: function (s) { return pumpProps((CS(s).feed_pump_speed_pct || 0) > 0, (CS(s).feed_pump_speed_pct || 0) / 100, fwTemp(s)); }, // feed pump (feedwater — tracks load)
    imrobpq4a70: function (s) { var p = pumpRec(s, 'rcp'); return pumpProps(IN(s).rcp_running, p ? p.flow_pct / 100 : 1, IN(s).tcold); },  // rcp (cold-leg coolant — live)
    imrqp87ueqb: function (s) { return pumpProps(CS(s).charging_pump_running, CS(s).charging_pump_running ? 0.8 : 0, 50); },       // charging pump (VCT — cold)
    imrqvzbd9hd: function (s) { var on = IN(s).condensate_pump_running !== false; return pumpProps(on, on ? 1 : 0, 40); }, // condensate pump (hotwell — cool)
    // valves
    // AFW block/discharge valve — INDEPENDENT of the AFW START/STOP/AUTO (pump) buttons.
    // openFrac = block valve open (operator-set); it only shows FLOW when AFW is actually
    // delivering (pumps demanded AND valve open). Shut it with the pumps running to recreate
    // TMI-2: run lights on, discharge-pressure at shutoff, but no water reaching the SG.
    // Flow gates on MEASURED afw_flow, not the commanded afw_active — the feed tee's AFW
    // leg (ims31q71cmu legC) gates on delivery, and the two halves of one line must agree:
    // gating here on the command showed supply→valve running while valve→tee sat still
    // whenever AFW was demanded but not delivering (#236).
    imrpp2g2m8k: function (s) { return valveProps(IN(s).afw_block_open === false ? 0 : 1, 'water', 60, (IN(s).afw_flow || 0) > 1e-4); }, // afw block valve
    // Flow gates on total steam actually leaving the SG (turbine + dump) — an open MSIV on
    // a steamless plant (Mode 5: 0 flow, 15 psi) is open but NOT flowing (#236).
    imrpp99kx2y: function (s) { return valveProps(IN(s).msiv_open ? 1 : 0, 'steam', satTempC(IN(s).steam_pressure), (IN(s).sg_steam_flow || 0) > 0.01); },  // main steam isolation
    // Flow gates on the PORV actually relieving — same true-state open×blockOpen the porv
    // comp uses for its plume. The block valve is normally open, but a dead-ended relief
    // line has no flow while the PORV is seated: without the gate the pressurizer→block
    // segment animated steam into a shut valve in every state (#236). Body temp is live
    // RCS saturation, same source as the pipes either side of it (was a static 250).
    imrppb3kuav: function (s) {
      var t = s.true_state || {};
      var pOpen = t.porv_open != null ? !!t.porv_open : (IN(s).porv_indicator === 'open');
      return valveProps(CS(s).porv_block_open ? 1 : 0, 'steam', satTempC(IN(s).primary_pressure), pOpen && CS(s).porv_block_open !== false);
    },
    // accumulator shutoff (isolation) valve — normally OPEN/aligned, but the accumulators
    // only inject once RCS pressure falls below the 600 psi check-valve setpoint, so the
    // discharge only "flows" while accumulators_discharging (no flow into the Rx at power).
    imrppxt2aqd: function (s) { return valveProps(CS(s).accumulator_valve_open === false ? 0 : 1, 'water', 50, IN(s).accumulators_discharging); },
    imrprmm4u5q: function (s) { return valveProps((IN(s).steam_dump_valve || 0) / 100, (IN(s).steam_dump_valve || 0) > 2 ? 'steam' : 'empty', satTempC(IN(s).steam_pressure)); }, // steam dump valve
    // TCV (turbine control valve) — only shows steam FLOW when the turbine is actually taking
    // load; a tripped/unloaded turbine (steam_demand_low) closes the governor to a crack, so
    // the turbine-inlet pipe should go still even though the valve isn't fully shut.
    imrr45syy4v: function (s) { return valveProps((IN(s).governor_valve || 0) / 100, 'steam', satTempC(IN(s).steam_pressure), !IN(s).steam_demand_low && (IN(s).governor_valve || 0) > 5); },  // TCV

    // ---- pipe fittings (Tee / Cross) -------------------------------------------------
    // Art only, but their fluid colour and dash animation are LIVE: each fitting takes the
    // temperature of the run it sits on and only animates when that line is actually
    // moving, exactly like the PIPE_TEMP entries for the pipes they join. A fitting frozen
    // at its authored temp would show a hot cold-leg in Mode 5, which is the same defect
    // PIPE_TEMP exists to fix.
    // Fittings send `flowing` (does the RUN move?) plus PER-LEG states, never a numeric
    // `flow` — the diagram's flow sliders are authored so connected components animate at a
    // matching dash rate, and writing a flat number here would overwrite that.
    //
    // The per-leg states are what stop the board lying. Each branch is an independent
    // system: gating only the whole fitting made the ECCS branch animate whenever the RCP
    // was running, i.e. the board showed emergency injection into the cold leg with the
    // ECCS pump stopped and HPI off. A leg whose system is secured must read 'off', which
    // renders it empty and still. Legs are named by their authored direction, so 'off'
    // is the only value that ever changes here — the in/out sense stays as drawn.
    ims2k1rhzh3: function (s) {                       // cold-leg header; branch C = charging
      return coldLeg(s, { legC: CS(s).charging_pump_running && (IN(s).charging_flow || 0) > 1e-4 ? 'in' : 'off' });
    },
    ims2k3q7ehq: function (s) {                       // cold-leg header; branch C = letdown out
      return coldLeg(s, { legC: (IN(s).letdown_flow || 0) > 1e-4 ? 'in' : 'off' });
    },
    ims3x2n4o2p: function (s) {                       // cold-leg header; branch C = accumulators
      return coldLeg(s, { legC: IN(s).accumulators_discharging ? 'in' : 'off' });
    },
    // 4-way cross on the cold leg: run a↔b, branch C up to the pressurizer spray line,
    // branch D in from the ECCS pump discharge. Spray only flows when the valve is cracked;
    // ECCS only when the pump is actually injecting.
    ims3yt5oyp8: function (s) {
      return coldLeg(s, {
        legC: (CS(s).spray_valve_pct || 0) > 2 ? 'out' : 'off',
        legD: (IN(s).hpi_active && (IN(s).hpi_flow || 0) > 1e-4) ? 'in' : 'off'
      });
    },
    // Hot leg, at the point the pressurizer surge line branches off it. The surge line is
    // always open — it is how the pressurizer stays connected to the RCS.
    ims2kt7fu64: function (s) {
      return { temp: IN(s).thot, contents: 'water', flowing: !!IN(s).rcp_running };
    },
    // Feedwater: feed-pump discharge + the AFW branch, into the SG. Tracks the FW-heater
    // train temperature (load-dependent), not steam saturation — see fwTemp(). AFW is a
    // separate train, so its branch is gated on AFW actually delivering, not on main feed.
    ims31q71cmu: function (s) {
      return { temp: fwTemp(s), contents: 'water',
        flowing: (IN(s).fw_flow || 0) > 0.01,
        legC: (IN(s).afw_active && (IN(s).afw_flow || 0) > 1e-4) ? 'in' : 'off' };
    },
    // CVCS charging-pump suction: B from the VCT, C from the ECCS panel cross-tie.
    ims3x01kvp4: function (s) {
      var on = !!CS(s).charging_pump_running;
      return { temp: 50, contents: 'water', flowing: on, legC: on ? 'in' : 'off' };
    },

    // ---- vital-parameter tiles (Indicator Panel) -------------------------------------
    imrzl4b7g9m: tile('imrzl4b7g9m', function (s) { return IN(s).power_range; }),
    ims2immk7ks: tile('ims2immk7ks', function (s) { return IN(s).tavg == null ? null : C2F(IN(s).tavg); }),
    ims2immxl2s: tile('ims2immxl2s', function (s) { return IN(s).subcooling_margin == null ? null : Cd2F(IN(s).subcooling_margin); }),
    ims2immsvn6: tile('ims2immsvn6', function (s) { return IN(s).primary_pressure == null ? null : MPa2psi(IN(s).primary_pressure); }),
    ims2immon9z: tile('ims2immon9z', function (s) { return IN(s).pzr_level; }),
    ims2imn1nny: tile('ims2imn1nny', function (s) { return IN(s).sg_level; })
  };

  // Cold-leg header fitting: the straight run carries RCS flow (so it moves with the RCP),
  // plus whatever branch states the caller supplies for the system that taps in there.
  function coldLeg(s, legs) {
    var p = { temp: IN(s).tcold, contents: 'water', flowing: !!IN(s).rcp_running };
    if (legs) for (var k in legs) if (Object.prototype.hasOwnProperty.call(legs, k)) p[k] = legs[k];
    return p;
  }

  // ================================================== vital-parameter tile bands
  // The Indicator Panel paints seven regions (trip | alarm | acceptable | NORMAL |
  // acceptable | alarm | trip) behind the trace and across the gauge. Those bounds are
  // PLANT TRUTH, not decoration: they are read out of the live protection tables
  // (RD.PWR_CONTROL.protection) so a retune of a trip or alarm moves the tile with it,
  // and the tile agrees with what the annunciator is doing. Literals are fallbacks only,
  // for a load order where the control module hasn't attached yet.
  //
  // Bounds are in the tile's DISPLAY unit (US), so SI setpoints convert here.
  // A one-sided parameter collapses its unused side by pinning those bounds to min/max —
  // e.g. reactor power has no low-power alarm, so everything from 0 to rated reads normal.
  var _PROT = (RD.PWR_CONTROL && RD.PWR_CONTROL.protection) || RD.PWR_PROTECTION || {};
  // FIRST match in table order. Fine where a parameter has exactly one trip on that side;
  // where it has more than one, use tripBackstop() instead — `power_range high` carries two
  // (120 % and the 25 % low setpoint) and this quietly returned whichever was authored first.
  function tripSp(instrument, direction, fallback) {
    var t = _PROT.trips || [], i;
    for (i = 0; i < t.length; i++) if (t[i].instrument === instrument && t[i].direction === direction) return t[i].setpoint;
    return fallback;
  }
  // The LEAST limiting trip on a side — the backstop that is always armed. Order-independent,
  // so re-authoring the protection table cannot silently move a tile's static band.
  function tripBackstop(instrument, direction, fallback) {
    var t = _PROT.trips || [], out = null, i;
    for (i = 0; i < t.length; i++) {
      if (t[i].instrument !== instrument || t[i].direction !== direction || t[i].setpoint == null) continue;
      if (out == null) { out = t[i].setpoint; continue; }
      out = (direction === 'low') ? Math.min(out, t[i].setpoint) : Math.max(out, t[i].setpoint);
    }
    return out == null ? fallback : out;
  }
  // The most limiting trip on a side that is ARMED RIGHT NOW — blocked trips excluded.
  // Returns null when the snapshot carries no RPS section (load order, or a plant with no
  // control layer attached), so a caller can fall back to the authored band rather than
  // reading "nothing is blocked" out of an absent section.
  function limitingArmedTrip(instrument, direction, s) {
    if (!s || !s.rps_state) return null;
    var t = _PROT.trips || [], blocks = s.rps_state.trip_blocks || {}, out = null, i;
    for (i = 0; i < t.length; i++) {
      if (t[i].instrument !== instrument || t[i].direction !== direction || t[i].setpoint == null) continue;
      if (t[i].id && blocks[t[i].id]) continue;
      if (out == null) { out = t[i]; continue; }
      var better = (direction === 'low') ? (t[i].setpoint > out.setpoint) : (t[i].setpoint < out.setpoint);
      if (better) out = t[i];
    }
    return out;
  }
  function alarmSp(id, fallback) {
    var a = _PROT.alarms || [], i;
    for (i = 0; i < a.length; i++) if (a[i].id === id) return a[i].setpoint;
    return fallback;
  }
  var P_SET = _PZ.P_setpoint || 15.41;
  var TILE_BANDS = {
    // Reactor power, % rated. High side only — any power below rated is a legitimate state.
    // tripHi is the BACKSTOP (120 %); the 25 % power-range low setpoint is armed during a
    // startup and overrides it live — see powerBand().
    imrzl4b7g9m: { min: 0, max: 130, digits: 1,
      tripLo: 0, alarmLo: 0, normLo: 0,
      normHi: 100, alarmHi: alarmSp('high_flux', 108), tripHi: tripBackstop('power_range', 'high', 120) },
    // Tavg, °F. normHi is the top of the at-power Tavg program (~307 °C); below that covers
    // every mode down to cold shutdown, so the low side collapses.
    ims2immk7ks: { min: 50, max: 660, digits: 0,
      tripLo: 50, alarmLo: C2F(alarmSp('low_tavg', 289)), normLo: 50,
      normHi: 585, alarmHi: C2F(alarmSp('high_tavg', 312.2)), tripHi: C2F(tripSp('tavg', 'high', 335)) },
    // Subcooling margin, °F — a DELTA, so Cd2F (no 32° offset). More is better: the high
    // side collapses and the danger is all at the bottom, ending at 0 = coolant boiling.
    ims2immxl2s: { min: -20, max: 150, digits: 0,
      tripLo: Cd2F(alarmSp('subcooling_lost', 0)), alarmLo: Cd2F(alarmSp('subcooling_low', 11.1)), normLo: 40,
      normHi: 150, alarmHi: 150, tripHi: 150 },
    // Primary pressure, psi. NORMAL is the pressurizer control band itself — heaters come on
    // below setpoint, spray above — so the green band is exactly where the controller holds it.
    ims2immsvn6: { min: 0, max: 2600, digits: 0,
      tripLo: MPa2psi(tripSp('primary_pressure', 'low', 12.41)),
      alarmLo: MPa2psi(alarmSp('pzr_pressure_low', 14.82)),
      normLo: MPa2psi(P_SET - (_PZ.heater_band_mpa || 0.207)),
      normHi: MPa2psi(P_SET + (_PZ.spray_band_mpa || 0.345)),
      alarmHi: MPa2psi(alarmSp('pzr_pressure_high', 15.86)),
      tripHi: MPa2psi(tripSp('primary_pressure', 'high', 16.44)) },
    // Pressurizer level, %. No high-level trip exists, so the top region collapses at 100 —
    // above the 75 % alarm is caution territory all the way up, which is the truth.
    ims2immon9z: { min: 0, max: 100, digits: 0,
      tripLo: tripSp('pzr_level', 'low', 12), alarmLo: alarmSp('pzr_level_low', 25), normLo: 40,
      normHi: 70, alarmHi: alarmSp('pzr_level_high', 75), tripHi: 100 },
    // SG narrow-range level, %. Trips both ways: lo-lo scram and the P-14 high-level trip.
    ims2imn1nny: { min: 0, max: 100, digits: 0,
      tripLo: tripSp('sg_level', 'low', 17), alarmLo: alarmSp('sg_level_low', 20), normLo: 45,
      normHi: 80, alarmHi: 85, tripHi: 90 }
  };
  // How much of a tile's width each TRIP (red) region is allowed to occupy. The authored
  // scales were the parameter's full physical range, which is honest but useless to read:
  // primary pressure spans 0–2600 psi while the pressurizer holds a ~80 psi control band,
  // so "normal" was a 3 % sliver and almost the whole strip was red. Scaling to the trip
  // bounds instead — with a fixed red margin outside them — keeps every region legible and
  // makes the tiles comparable with each other. It changes only the DISPLAY window; the
  // band boundaries themselves are still the plant's setpoints.
  var RED_FRAC = 0.09;
  // Display window for a tile, derived from its bands. A one-sided parameter (reactor
  // power has no low-power trip) only gets the margin on the side that has a trip.
  function displayScale(b) {
    // An explicit window wins. Tavg needs one: it has a high trip but NO low trip, so the
    // derived scale ran from the meter's bottom (50 °F) to the trip and the green band was a
    // sliver in a sea of grey. A parameter whose meaningful range depends on the plant mode
    // cannot get a useful window from its protection setpoints alone.
    if (b.winLo != null && b.winHi != null && b.winHi > b.winLo) return { min: b.winLo, max: b.winHi };
    var loActive = b.tripLo > b.min, hiActive = b.tripHi < b.max;
    if (loActive && hiActive) {
      var pad = RED_FRAC * (b.tripHi - b.tripLo) / (1 - 2 * RED_FRAC);
      return { min: b.tripLo - pad, max: b.tripHi + pad };
    }
    if (hiActive) return { min: b.min, max: b.tripHi + RED_FRAC * (b.tripHi - b.min) / (1 - RED_FRAC) };
    if (loActive) return { min: b.tripLo - RED_FRAC * (b.max - b.tripLo) / (1 - RED_FRAC), max: b.max };
    return { min: b.min, max: b.max };
  }

  // ---- mode-aware tile bands (#233) ------------------------------------------------
  // The NORMAL (green) region of a tile is only useful if it says where the reading should
  // be RIGHT NOW. Two of the six have a reference that moves with the plant, and both read
  // as useless static bands without this: at power, Tavg's green band spanned 50–585 °F,
  // so the operating point sat at the very top of an enormous green region and the operator
  // could not tell what band they were holding.
  //   - Tavg follows the SLIDING TAVG PROGRAM — the same trefProgram() the rod controller
  //     drives to (exported from pwr_control.js), widened to a readable multiple of the
  //     controller's own ±0.8 °C deadband. Below Mode 3 there is no program: the plant is
  //     being cooled down, so the band becomes "cold-shutdown cold" instead.
  //   - Primary pressure follows the LIVE pressurizer setpoint, not the rated one, so a
  //     Mode 5 plant held at 2.8 MPa shows its own control band rather than the at-power one.
  // The other four do NOT move, and that is deliberate, not an omission: reactor power,
  // subcooling margin, pressurizer level and SG narrow-range level are held to the same
  // band in every mode the board can reach. Their references are the protection setpoints,
  // which is what TILE_BANDS already reads.
  var _CTL = (typeof RD !== 'undefined' && RD.PWR_CONTROL) || {};
  // Band edges are QUANTISED to whole display units. They are recomputed every render from
  // live signals (load for Tavg, the setpoint for pressure), and the tile rebuilds its gauge
  // whenever a band edge changes — so unquantised edges churned at the ~10 Hz render rate and
  // the whole strip flickered, worst exactly during a transient when load is moving. Rounding
  // means an edge steps once per display unit instead of every frame.
  function qz(v) { return Math.round(v); }
  function tavgBand(s) {
    var mode = (s.true_state && s.true_state.plant_mode) || null;
    var b = TILE_BANDS.ims2immk7ks;
    if (mode != null && mode >= 5) {
      // Mode 5/6: no Tavg program. Normal is "cold" — RHR territory, below 200 °F. The
      // window closes down with it, or a cold plant reads against an at-power scale.
      return { normLo: b.min, normHi: 200, alarmHi: 250, winLo: b.min, winHi: 350 };
    }
    var out = { winLo: 540, winHi: 645 };   // the hot operating window, not the whole meter
    if (!_CTL.trefProgram) { out.normLo = b.normLo; out.normHi = b.normHi; return out; }
    // Load reference is the same signal the rod channel uses (steam flow, 0..1).
    var load = Math.max(0, Math.min(1, IN(s).steam_flow || 0));
    var ref = _CTL.trefProgram(load);
    // 3.5x the controller's ±0.8 °C lockup band. The rods lock tighter than this, but Tavg
    // legitimately wanders wider than the lockup band while load is moving, and a band
    // narrower than ~10 °F is a hairline on a 105 °F window — unreadable is not useful.
    var halfC = (_CTL.TAVG_DEADBAND_C || 0.8) * 3.5;
    out.normLo = qz(C2F(ref - halfC));
    out.normHi = qz(C2F(ref + halfC));
    return out;
  }
  // Reactor power — the band follows WHICH POWER TRIP IS ARMED (#267).
  //
  // `power_range high` carries TWO trips: the 120 % backstop, and the 25 % POWER-RANGE LOW
  // SETPOINT, which is armed at every startup initial condition and blockable only above
  // P-10 (10 %). MEASURED on engine+M4 from `5_percent`: with the low setpoint armed,
  // 26 % scrams (`power_range high`) and 24 % does not; blocked, 26 % is clear and 121 %
  // scrams. The tile showed 120 % in every one of those cases, because tripSp() took the
  // first table match — so the operator climbing out of Mode 3 saw green all the way to a
  // scram at a fifth of the indicated trip.
  //
  // Armed, the tile reads as the startup ladder the plant actually enforces:
  //   green to P-10 (10 %) | amber P-10 → 25 % — block the startup trips HERE | red above.
  // The amber band is not decoration: it is the window in which blocking is permitted, so
  // its width is the operator's margin. Blocking the trip collapses it and the tile reopens
  // to the at-power scale; dropping back below P-10 auto-reinstates the block and the band
  // returns with it. displayScale() then rescales 0–131.9 % → 0–27.5 %, which is what makes
  // the low-power ascent legible on a linear meter at all.
  function powerBand(s) {
    var b = TILE_BANDS.imrzl4b7g9m;
    var lim = limitingArmedTrip('power_range', 'high', s);
    if (!lim || !(lim.setpoint < b.tripHi)) return null;   // backstop only → authored bands stand
    var p10 = (_PROT.trip_block_permissive || {}).setpoint;
    if (p10 == null || !isFinite(p10) || !(p10 < lim.setpoint)) p10 = lim.setpoint;
    // normHi === alarmHi collapses the grey "acceptable" band to nothing, so the region
    // above P-10 reads amber rather than as more headroom.
    // The note names the limit. Only shown while a lower trip is armed — at power the tile
    // is working to its authored 120 % band and has nothing exceptional to say.
    return { normHi: qz(p10), alarmHi: qz(p10), tripHi: qz(lim.setpoint),
             note: 'TRIP ' + qz(lim.setpoint) + '%' };
  }
  function pressureBand(s) {
    var sp = CS(s).pressure_setpoint;
    if (sp == null || !isFinite(sp)) sp = P_SET;
    return {
      normLo: qz(MPa2psi(sp - (_PZ.heater_band_mpa || 0.207))),
      normHi: qz(MPa2psi(sp + (_PZ.spray_band_mpa || 0.345)))
    };
  }
  function bandsFor(id, s) {
    var b = TILE_BANDS[id];
    var mv = id === 'ims2immk7ks' ? tavgBand(s)
           : (id === 'ims2immsvn6' ? pressureBand(s)
           : (id === 'imrzl4b7g9m' ? powerBand(s) : null));
    if (!mv) return b;
    var out = {}; for (var k in b) out[k] = b[k];
    if (mv.normLo != null) out.normLo = mv.normLo;
    if (mv.normHi != null) out.normHi = mv.normHi;
    if (mv.alarmHi != null) out.alarmHi = mv.alarmHi;
    // A live trip bound moves the RED edge, so it must move the display window with it —
    // displayScale() derives the window from tripLo/tripHi.
    if (mv.tripHi != null) out.tripHi = mv.tripHi;
    if (mv.tripLo != null) out.tripLo = mv.tripLo;
    if (mv.note != null) out.note = mv.note;
    if (mv.winLo != null) out.winLo = mv.winLo;
    if (mv.winHi != null) out.winHi = mv.winHi;
    // A moving normal band must stay inside its own alarm/trip envelope, or a setpoint the
    // operator typed could paint green over red.
    if (out.normLo < out.alarmLo) out.normLo = out.alarmLo;
    if (out.normHi > out.alarmHi) out.normHi = out.alarmHi;
    return out;
  }

  // Build a COMPPROPS entry for one tile: its bands plus the live reading.
  // The bands are resolved INSIDE the returned function, not captured here: tile() is
  // called while the COMPPROPS object literal is being evaluated, which runs before the
  // `var TILE_BANDS = {…}` assignment below it. `var` hoists the declaration but not the
  // value, so capturing eagerly read undefined and threw on the first render. (Since #233
  // they also have to be resolved per-snapshot anyway — see bandsFor.)
  function tile(id, read) {
    return function (s) {
      var b = bandsFor(id, s);
      var sc = displayScale(b);
      var v = read(s);
      return {
        value: (v == null || !isFinite(v)) ? null : v,
        // Display resolution, set so the last digit is SIGNAL, not noise. At whole units a
        // tile flips occasionally, the way a real control-room indicator does; at one decimal
        // the tenths place was pure jitter and flipped on every render (~220 changes/minute,
        // which is what made the strip unreadable). Reactor power keeps its decimal: NIS
        // power genuinely wanders and operators read it to a tenth.
        // Sigmas in display units, re-measured at steady full power after the #231 engine
        // pass (60 s, hot_full_power): power 0.21 %, Tavg 0.09 °F, subcooling 0.09 °F,
        // pressure 0.56 psi, PZR level 0.12 %, SG level 0.31 %. Tavg/subcooling/PZR level
        // are ~3x quieter than when this was written (0.2–0.45 across the board), but even
        // 0.09 is close to a full 0.1 display step, so whole units still hold — do not add a
        // decimal back without re-measuring the tile you are changing.
        decimals: b.digits,
        // sim clock drives the tile's 3-minute sampling window (see comp_indicator_panel)
        t: (s.metadata && s.metadata.sim_time != null) ? s.metadata.sim_time : null,
        min: sc.min, max: sc.max,
        normLo: b.normLo, normHi: b.normHi,
        alarmLo: b.alarmLo, alarmHi: b.alarmHi,
        tripLo: b.tripLo, tripHi: b.tripHi,
        // '' (not null) so the tile CLEARS a stale note rather than keeping the last one —
        // `undefined` means "leave alone" in the component's tri-state contract.
        note: b.note || ''
      };
    };
  }

  // Clickable-valve toggle targets (component onControl 'toggle')
  var VALVE_TOGGLE = {
    imrpp2g2m8k: function (open) { cmd({ action: 'set_afw_block', open: open }); },   // AFW block valve (independent of pump START/STOP)
    imrpp99kx2y: function (open) { cmd({ action: open ? 'open_msiv' : 'close_msiv' }); },
    imrppb3kuav: function (open) { cmd({ action: open ? 'open_block_valve' : 'close_block_valve' }); },
    imrppxt2aqd: function (open) { cmd({ action: open ? 'open_accumulator_valve' : 'close_accumulator_valve' }); }
  };
  // EVERY pump renders art-only (no built-in toggle) — pump control lives entirely in the
  // separate buttons/panels, so a pump's control space never shifts its art and bends pipes:
  //   RCP       -> on-pump ON/OFF buttons (imrsjy1m9g/imrsjy59pnu -> set_rcp)
  //   ECCS      -> HPI START/STOP/AUTO panel (set_hpi); the pump reflects hpi_active
  //   feed      -> SG FEED RATE panel (set_feed_pump_speed)
  //   charging  -> CHARGING panel AUTO/MAN/OFF (OFF = charging pump off)
  //   condensate-> no control (always running); it doesn't need to be operated
  var ART_ONLY_PUMPS = { imrobpq4a70: 1, imrobnzlha1: 1, imrobph7xrq: 1, imrqp87ueqb: 1, imrqvzbd9hd: 1 };

  // ================================================================ LIVE PIPE TEMPERATURES
  // The board pipes are authored with a STATIC temp (pwr_board_data.js) — a hot-leg run
  // baked at 339 °C shows red even in Mode 5 cold shutdown. These pipes instead take a
  // live fluid temperature (°C) each snapshot so their color tracks the plant: the primary
  // coolant loop reads the RCS leg temps, the secondary main-steam header reads the SG
  // saturation temperature. Pipe id → temp(s); any pipe not listed keeps its authored temp.
  // Keyed by the pwr_board_data.js pipe `id` (stable), same idiom as the item maps above.
  // WARNING — these keys are pipe ids, and a pipe id CHANGES whenever the run is re-drawn
  // in the builder. The V2 re-export re-drew every primary run through the new tees and the
  // cold-leg cross, which silently orphaned 12 of these entries: nothing errors, the pipes
  // just freeze at their authored temps again. selfTest() now asserts every key still
  // exists, so the next re-export fails loudly instead of quietly going stale.
  var PIPE_TEMP = {
    // --- RCS hot leg (RV hot-out → tee → SG hot-in), and the surge line off it
    pms2ktktnan: function (s) { return IN(s).thot; },                     // RV hot-out → surge tee
    pms2ktjq4ma: function (s) { return IN(s).thot; },                     // surge tee → SG hot-in
    pms2kupl3b2: function (s) { return IN(s).thot; },                     // pressurizer surge (ties to the hot leg)
    // --- RCS cold leg (SG cold-out → tee → RCP → tee → cross → tee → RV cold-in)
    pms2kovvgnh: function (s) { return IN(s).tcold; },                    // SG cold-out → tee
    pms2kozvu94: function (s) { return IN(s).tcold; },                    // tee → RCP discharge
    pms2kp1148p: function (s) { return IN(s).tcold; },                    // RCP suction → tee
    pms3yu50gqp: function (s) { return IN(s).tcold; },                    // tee → cold-leg cross
    pms3yu3x86i: function (s) { return IN(s).tcold; },                    // cold-leg cross → tee
    pms3x37ze9p: function (s) { return IN(s).tcold; },                    // tee → RV cold-in
    // Pressurizer spray is taken off the COLD leg (at the cross), which is why spraying
    // condenses steam in the pressurizer: it is the coldest water in the primary.
    pms3ytzwwqw: function (s) { return IN(s).tcold; },                    // cold-leg cross → pressurizer spray
    // --- main steam (saturated at SG pressure)
    pmrr0u4vgri: function (s) { return satTempC(IN(s).steam_pressure); }, // SG main steam-out (saturated)
    pmrr46n63pq: function (s) { return satTempC(IN(s).steam_pressure); }, // main steam header (MSIV → TCV)
    pmrr499yfkb: function (s) { return satTempC(IN(s).steam_pressure); }, // main steam → turbine (TCV out)
    pmrr0u9nib3: function (s) { return satTempC(IN(s).steam_pressure); }, // steam dump → condenser bypass
    pmrr46oahnx: function (s) { return satTempC(IN(s).steam_pressure); }, // steam dump branch
    // --- PORV relief path. NOTE V2 re-ordered this: the block valve is now UPSTREAM of the
    // PORV (pressurizer → block valve → PORV → quench drain), which is the prototypical
    // arrangement — the block valve exists to isolate a stuck-open PORV, so it has to be
    // between the pressurizer and the relief. Everything up to the PORV therefore carries
    // live RCS steam at saturation; only the line AFTER it is tailpipe.
    //   The tailpipe is the one honest tell in the TMI-2 sequence (~82 °C seated → ~150 °C
    // passing), so it tracks the instrument rather than sitting at an authored red (#105 #6).
    pms3tda86bw: function (s) { return satTempC(IN(s).primary_pressure); }, // pressurizer ↔ block valve
    pms3tcop5ni: function (s) { return satTempC(IN(s).primary_pressure); }, // block valve → PORV inlet
    pms3tdwi5n9: function (s) { return IN(s).porv_tailpipe_temp; },         // PORV → quench drain (tailpipe)
    // --- secondary condensate / feedwater loop. Feed pump and both its pipes carry the same
    // feedwater — one fwTemp so the pump's fluid colour matches the pipes into/out of it
    // (the cool→hot transition sits upstream, at the condensate pump / FW-heater junction).
    pms31qm4iqh: function (s) { return fwTemp(s); },      // feedwater: feed pump → tee
    pms31qjbqhy: function (s) { return fwTemp(s); },      // feedwater: tee → SG fw-in
    pmrr0ustj2z: function (s) { return fwTemp(s); },      // feedwater: polisher → feed pump suction
    pmrr0uryodr: function (s) { return condTemp(s); },    // condensate pump discharge → polisher
    pms2ihy5skm: function (s) { return condTemp(s); },    // condenser hotwell → condensate pump
    // --- circulating cooling-water loop (condenser ↔ cooling tower)
    pms3l89l83h: function (s) { return 25 + 0.14 * (IN(s).power_range || 0); }, // CW return (warm)
    pms3l83etan: function () { return 25; }                                     // CW supply (cold)
  };

  // ================================================================ TRIP BLOCKS menu (task #5)
  // Only the 4 blockable trips (owner ruling).
  var BLOCKABLE_TRIPS = [
    { id: 'lo_press', label: 'PZR PRESS LO-LO', sub: 'Reactor trip · 1800 psi (P-11 permissive)' },
    { id: 'lo_flow', label: 'RCS LOW FLOW', sub: 'Reactor trip · loss of flow (P-7 permissive)' },
    { id: 'ir_high', label: 'IR HIGH FLUX', sub: 'Startup trip · ~20% (P-10 permissive)' },
    { id: 'pr_low_setpoint', label: 'PR HIGH (LOW SETPT)', sub: 'Startup trip · 25% (P-10 permissive)' }
  ];

  function closePop() { if (pop && pop.parentNode) pop.parentNode.removeChild(pop); pop = null; }

  function toggleTripBlocks(btn) {
    if (pop) { closePop(); return; }
    var stage = refs && refs.stage;
    if (!stage) return;
    pop = document.createElement('div');
    pop.className = 'bd-pop bd-mono';
    // position just above the button within the stage (canvas coords)
    var item = null;
    (window.RD_PWR_BOARD_DOC.items || []).forEach(function (it) { if (it.id === 'imrsk4xz2dm') item = it; });
    if (item) { pop.style.left = (item.left - 90) + 'px'; pop.style.top = (item.top - 250) + 'px'; }
    pop.appendChild(mk('h4', null, 'TRIP BLOCKS'));
    var snap = RD.PwrBoard.lastSnapshot ? RD.PwrBoard.lastSnapshot() : null;
    BLOCKABLE_TRIPS.forEach(function (t) {
      var row = mk('div', 'bd-pop-row');
      var txt = mk('div', null);
      txt.appendChild(mk('div', 'lbl', t.label));
      txt.appendChild(mk('div', 'sub', t.sub));
      var b = mk('button', null, '');
      b.setAttribute('data-trip', t.id);
      b.addEventListener('click', function () {
        var blocked = isBlocked(RD.PwrBoard.lastSnapshot(), t.id);
        cmd({ action: 'set_trip_block', trip_id: t.id, blocked: !blocked });
      });
      row.appendChild(txt);
      row.appendChild(b);
      pop.appendChild(row);
    });
    stage.appendChild(pop);
    refreshTripBlocks(snap);
  }

  function isBlocked(s, id) { var tb = (s && s.rps_state && s.rps_state.trip_blocks) || {}; return !!tb[id]; }
  // How many of the blockable trips are currently blocked (drives the TRIP BLOCKS
  // button's yellow warning state + count badge).
  function blockedTripCount(s) {
    var n = 0;
    for (var i = 0; i < BLOCKABLE_TRIPS.length; i++) if (isBlocked(s, BLOCKABLE_TRIPS[i].id)) n++;
    return n;
  }

  // ============================================================ instructor highlight
  // Manual-procedure / campaign-beat control labels → the board item that hosts that
  // control. Glowing the enclosing box/panel lights the whole control group. This map
  // IS the highlight vocabulary: app.js resolves every beat highlight through
  // RD.PwrBoard.revealControl, and run_campaign validates campaign beats against
  // controlLabels() below — so deleting a key here reddens that gate. (It used to be
  // held in parity with the V1 synoptic's SYN_CONTROL_MAP, which was retired in #246.)
  var CONTROL_LABEL_MAP = {
    'Control Bank': 'imrpk3wvydp', 'Rod Speed': 'imrpk3wvydp', 'Rod motion': 'imrpk3wvydp',
    'Nudge': 'imrpk3wvydp', 'Shutdown Bank': 'imrpny66npx',
    'SCRAM': 'imrqr8ecji6',
    'Mode': 'imro8k5pzem', 'Load': 'imro8k5pzem', 'Turbine Load': 'imro8k5pzem', 'Main Breaker': 'imro8k5pzem',
    'Steam Dump': 'imrop5ouw7h',
    'Boron': 'imrmtlyf64y', 'Boron (Reactivity) — CVCS': 'imrmtlyf64y',
    'Charging Pump (CVCS)': 'imrmslginf9', 'CVCS Inventory Control': 'imrmslginf9',
    'Letdown Orifices (CVCS)': 'imrmslvu2c0',
    'Pressurizer Heaters (PZR)': 'imro94kec8b', 'Pressurizer Spray (PZR)': 'imro8ymb0jw',
    'Reactor Coolant Pumps (RCP)': 'imrobpq4a70',
    'Relief Valve (PORV)': 'porv', 'PORV Block Valve': 'imrppb3kuav',
    // V2 split the old combined ECCS/RHR box into two cards. HPI/LPI is the ECCS pump
    // triad; RHR is its own card (the suction alignment + HX rate), so the RHR label now
    // glows the RHR card rather than the shared box it used to share with HPI.
    'HPI': 'imrzpfd4qox', 'HPI/LPI': 'imrzpfd4qox', 'Residual Heat Removal (RHR)': 'ims3xf18pk8',
    'AFW': 'imrmssto6d', 'AFW Throttle': 'imrmssto6d',
    'Feed Pumps': 'imrqxsodu5j', 'Feed Reg': 'imrqxsodu5j', 'Feed Pump': 'imrqxsodu5j',
    'MSIV': 'imrpp99kx2y',
    'SR detector': 'imro6qutiht', 'NIS': 'imro6qutiht', '1/M Plot': 'imro6rctcgm',
    'Trip Blocks': 'imrsk4xz2dm',
    // Indication readouts — highlight vocabulary for checklist-step hover (glowLabels
    // in ui/app.js). Not named by campaign beats, so run_campaign never demands them.
    '1/M Plot Tool': 'bdOneOverM', 'Source Range': 'imro6qutiht', 'Intermediate Range': 'imro6rctcgm',
    'Reactivity': 'imro6rdwwdn', 'Reactor Period': 'bdRxPeriod', 'Startup Rate': 'imro6qsncb9',
    // Tavg, plant pressure and SG level are no longer standalone readouts on the mimic —
    // V2 promoted all three into the vital-parameter tile strip, so these labels glow the
    // tile. (Highlighting an indication is checklist hover-glow only; campaign beats
    // highlight controls, so run_campaign never names these.)
    'Tavg': 'ims2immk7ks', 'Plant Pressure': 'ims2immsvn6', 'SG Level': 'ims2imn1nny',
    'Steam Flow': 'ims3wm0d0bu', 'Feed Flow': 'imrsgkz4lq0',
    // Aliases for the `control` strings the checklist steps use (so the step-hover
    // fallback in ui/app.js resolves without authoring an explicit `hl` on each).
    'Boron control': 'imrmtlyf64y', 'RCP Run/Stop': 'imrobpq4a70', 'Dump SP': 'imrop5ouw7h',
    'Pressure SP': 'imrsg8b7b9o', 'Accumulator valve': 'imrppx5n1ay',
    'Turbine — Connect Grid': 'imro8k5pzem',
    // The rods_tavg channel toggle (EXTRA_ITEMS, #237) — the control the old
    // "Automate → Reactor" directives now point at.
    'Rod AUTO': 'ims5glucngg'
  };
  // The board item the maintenance tag hangs over (TMI-2 AFW discharge valve).
  var TAG_ITEM = 'imrpp2g2m8k';

  function refreshTripBlocks(s) {
    if (!pop || !s) return;
    var st = (s.rps_state && s.rps_state.trip_block_status) || {};
    var btns = pop.querySelectorAll('button[data-trip]');
    for (var i = 0; i < btns.length; i++) {
      var id = btns[i].getAttribute('data-trip');
      var ts = st[id] || {};
      var blocked = ts.blocked != null ? ts.blocked : isBlocked(s, id);
      btns[i].textContent = blocked ? 'BLOCKED' : 'BLOCK';
      btns[i].className = blocked ? 'bd-blocked' : '';
      // Manual rule (kernel-evaluated): block unless the trip is asserted; while blocked,
      // clearing is locked as long as the trip is asserted (removing it would scram now).
      btns[i].disabled = blocked ? (ts.can_clear === false) : (ts.can_block === false);
    }
  }

  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // ---- momentary rod drive (tap-or-hold), mirroring the classic control strip.
  // pointerdown arms a single-step nudge; if released within TAP_HOLD_MS it fires as
  // a 1-step nudge, otherwise the timer promotes it to a continuous hold-drive
  // (rod_start) that runs until release (rod_stop). Release is caught board-wide
  // (pointerup / pointercancel / blur) so dragging off the button still stops the rod.
  var TAP_HOLD_MS = 220;
  var holdingGroup = null, pendingRodTap = null;
  function startHoldRod(group, direction) { holdingGroup = group; cmd({ action: 'rod_start', group_id: group, direction: direction, speed: rodSpeed }); }
  function armRodTap(group, direction) {
    // Ignore a re-arm while a tap is already pending or a hold is already running.
    // A single physical press must produce exactly one tap-or-hold cycle. Keyboard
    // auto-repeat is meant to be filtered upstream by KeyboardEvent.repeat, but some
    // environments (remote desktop, on-screen keyboards, older browsers) don't set it,
    // and without this guard each repeat leaked a timer + a second rod_start while
    // leaving pendingRodTap set — so the release fired as a tap and NEVER sent rod_stop,
    // leaving the rods driving to the limit long after the key was let go.
    if (pendingRodTap || holdingGroup) return;
    pendingRodTap = { group: group, direction: direction, timer: setTimeout(function () {
      pendingRodTap = null; startHoldRod(group, direction);
    }, TAP_HOLD_MS) };
  }
  function endHoldRod() {
    if (pendingRodTap) {   // released before the hold threshold → a tap = one step
      clearTimeout(pendingRodTap.timer);
      cmd({ action: 'rod_nudge', group_id: pendingRodTap.group, steps: pendingRodTap.direction, speed: rodSpeed });
      pendingRodTap = null;
      return;
    }
    if (!holdingGroup) return;
    cmd({ action: 'rod_stop', group_id: holdingGroup });
    holdingGroup = null;
  }
  // ---- geometry corrections to the GENERATED diagram (#233) --------------------------
  // pwr_board_data.js is generated from the builder export and must not be hand-edited, but
  // a few runs are authored a pixel or two off and read as visibly crooked pipes. Each entry
  // sets an ABSOLUTE value, never a delta, so it is IDEMPOTENT: when the owner corrects one
  // in the builder and re-exports, the patch quietly becomes a no-op instead of doubling up.
  // Fold these back into the builder and delete them from here.
  // selfTest asserts every target still resolves, so a re-export that renames an id fails
  // loudly rather than silently dropping the correction.
  var DOC_PATCHES = {
    pipes: {
      // Turbine exhaust → condenser steam inlet. The route is authored orthogonally, but its
      // two waypoints sit 1 px and 2 px off the ports they line up with, so both "vertical"
      // legs lean. Pin them to the real port x.
      pmrr14xbt2h: { waypoints: [[1574, 340], [1553, 340]] },
      // RCP suction/discharge swap, pipe half (#236) — see the imrobpq4a70 item patch
      // below. Same geometric endpoints (the two nozzle positions are unchanged); only
      // the port NAMES they bind to change, so the loop enters at suction and leaves at
      // discharge. The authored flowDir:'fwd' on the outlet pipe existed solely to
      // overpower the backwards port semantics — with them corrected it is dropped and
      // the direction comes from the ports, like every other pipe.
      pms2kozvu94: { props: { to: 'imrobpq4a70/suction' } },
      pms2kp1148p: { props: { from: 'imrobpq4a70/discharge', flowDir: null } }
    },
    items: {
      // PORV discharge → quench-tank box. The box's top port is authored 2 px left of the
      // PORV outlet above it, so the drop leans instead of falling straight in.
      imrsi2svtgn: { ports: { ptmrsi3kjfr5: { off: 17 } } },
      // STEAM DUMP readout (#235): authored left 1410 / width 65 — 4 px under the dump
      // valve tile (ends 1414) and too narrow for its own label. 1416/72 clears the valve
      // and, with the .bd-ro-label letter-spacing fix, fits "STEAM DUMP" with room.
      imrzmlyafa3: { props: { left: 1416, width: 72 } },
      // NIS caption authored "d TEMP AVG" — the builder text lost its Δ (#235).
      imrsho1qu6t: { props: { text: 'Δ TEMP AVG' } },
      // (TRIP BLOCKS carried a top/height patch here until the 2026-07-28t re-export —
      // the builder now authors it at 425/30, so the patch was pinning what the diagram
      // already says. Dropped rather than kept: a patch that agrees with the doc is a
      // silent trap the day the doc changes.)
      // STEAM DUMP card: at ≥1000 psi the right-anchored STEAM PRESS value grew left
      // into its caption ("STEAM PRESS1194 psi", #235 comment / #237). Move the value
      // anchor to the panel edge (matching its 1845-1855 siblings) and the caption
      // 5 px left for ~15 px of clearance at 4 digits.
      imrr1gwi93j: { props: { left: 1850 } },
      ims3wu2kxnl: { props: { left: 1670 } },
      // RCP suction/discharge swap, item half (#236): the loop physically enters this
      // pump from the letdown tee on its RIGHT and leaves toward the charging tee on its
      // LEFT, but the nozzles were authored suction-left/discharge-right — water entered
      // at the discharge. Swapping the angles puts suction on the right and discharge on
      // the left at the SAME positions, and the discharge nozzle art now faces the way
      // the water actually goes.
      imrobpq4a70: { props: { suctionAngle: 0, dischargeAngle: 180 } }
    }
  };
  function applyDocPatches(doc) {
    if (!doc) return;
    function setProps(target, props) {
      for (var k in props) {
        if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
        if (props[k] === null) delete target[k];
        else target[k] = props[k];
      }
    }
    (doc.pipes || []).forEach(function (p) {
      var patch = DOC_PATCHES.pipes[p.id];
      if (!patch) return;
      if (patch.waypoints) p.waypoints = patch.waypoints.map(function (q) { return [q[0], q[1]]; });
      if (patch.props) setProps(p, patch.props);
    });
    (doc.items || []).forEach(function (it) {
      var patch = DOC_PATCHES.items[it.id];
      if (!patch) return;
      if (patch.props) setProps(it, patch.props);
      if (!patch.ports) return;
      (it.ports || []).forEach(function (pt) {
        var pp = patch.ports[pt.id];
        if (pp && pp.off != null) pt.off = pp.off;
      });
    });
  }

  // ---- latched full-travel rod drive (the shutdown bank) ----------------------------
  // Press once → the bank drives to that limit on its own; press again → it stops where it
  // is. `latchedRod` is the UI's memory of "I asked for this and it has not finished yet",
  // which is what the yellow light reports. It is deliberately NOT plant state: the engine
  // owns the motion, and clearLatchIfDone() below retires the latch as soon as the plant
  // says the travel is over — including a scram, which drives the bank in without the
  // operator asking and must not leave a stale light on the WITHDRAW button.
  var latchedRod = null;   // { group, direction } | null
  function rodAtLimit(s, group, direction) {
    var g = rodGroup(s, group);
    if (!g) return false;
    var pct = g.position_pct;
    if (pct == null) return false;
    return direction > 0 ? pct >= 99.9 : pct <= 0.1;
  }
  function toggleLatchRod(group, direction) {
    var wasSame = !!(latchedRod && latchedRod.group === group && latchedRod.direction === direction);
    if (latchedRod && latchedRod.group === group) {
      cmd({ action: 'rod_stop', group_id: group });
      latchedRod = null;
      if (wasSame) return;              // second press on the SAME button = stop here
    }
    latchedRod = { group: group, direction: direction };
    cmd({ action: 'rod_start', group_id: group, direction: direction, speed: rodSpeed });
  }
  function latchActive(group, direction) {
    return !!(latchedRod && latchedRod.group === group && latchedRod.direction === direction);
  }
  function clearLatchIfDone(s) {
    if (!latchedRod) return;
    var done = rodAtLimit(s, latchedRod.group, latchedRod.direction) || !!IN(s).rps_scrammed;
    if (!done) return;
    cmd({ action: 'rod_stop', group_id: latchedRod.group });
    latchedRod = null;
  }

  // The momentary WITHDRAW/INSERT button for a rod group + direction (for keyboard drive).
  function rodButtonId(group, direction) {
    for (var id in BUTTONS) {
      var b = BUTTONS[id];
      if (b && b.hold && b.hold.group === group && b.hold.direction === direction) return id;
    }
    return null;
  }

  // ================================================================ driver API
  RD.PwrBoardDriver = {
    onMount: function (doc, ctx, r) {
      ctxRef = ctx; refs = r; closePop();
    },
    onButton: function (item, btn) {
      var b = BUTTONS[item.id];
      if (b && b.press) b.press(RD.PwrBoard.lastSnapshot() || {}, btn);
    },
    // Momentary (press-and-hold) buttons — the rod drive. buttonMomentary tells the
    // board to route these through pointer/keyboard down+up instead of click.
    buttonMomentary: function (item) { var b = BUTTONS[item.id]; return !!(b && b.hold); },
    onButtonDown: function (item) {
      var b = BUTTONS[item.id];
      if (b && b.hold) armRodTap(b.hold.group, b.hold.direction);
    },
    onButtonUp: function () { endHoldRod(); },
    // Programmatic rod drive (keyboard ↑/↓) — mirrors the momentary buttons' tap-or-hold
    // (tap = 1 step, hold = drive at the S/M/F speed). down=true begins, down=false releases.
    // Returns false if the matching rod button is disabled (e.g. after a scram) so the
    // caller can no-op. Also reflects the button's pressed cue for parity with a click.
    driveRod: function (group, direction, down) {
      if (down) {
        var id = rodButtonId(group, direction);
        var btn = (refs && refs.buttons && id) ? refs.buttons[id] : null;
        if (btn && btn.disabled) return false;
        if (btn) btn.classList.add('bd-pressed');
        armRodTap(group, direction);
        return true;
      }
      if (refs && refs.buttons) Object.keys(refs.buttons).forEach(function (k) { refs.buttons[k].classList.remove('bd-pressed'); });
      endHoldRod();
      return true;
    },
    onNumber: function (item, value) {
      var n = NUMBERS[item.id];
      if (n && n.set) n.set(value);
    },
    // Valid [min, max] for an editable box, so the renderer clamps out-of-range entries.
    boundsFor: function (item) { return NUM_BOUNDS[item.id] || null; },
    // ▲/▼ step override for an editable number box (null = use the authored it.step).
    stepFor: function (item) { return NUM_STEP[item.id] != null ? NUM_STEP[item.id] : null; },
    onControl: function (item, action, value) {
      // Only clickable valves emit control now — every pump is rendered art-only.
      if (action === 'toggle' && VALVE_TOGGLE[item.id]) VALVE_TOGGLE[item.id](!!value);
    },
    onScram: function () { cmd({ action: 'scram' }); },
    onScramReset: function () { /* no engine reset command; visual only */ },
    scramFired: function (s) { return IN(s).rps_scrammed; },
    valueFor: function (item, s) {
      var f = VALUES[item.id];
      if (!f) return null;
      var v = f(s);
      if (v == null) return null;
      // A formatter may return { text, color, unit } to drive per-value colouring (e.g. the
      // SR indication going amber at the SR→IR handoff); otherwise it returns a plain value.
      return (typeof v === 'object') ? v : { text: String(v) };
    },
    numberFor: function (item, s) {
      var n = NUMBERS[item.id];
      if (!n || !n.get) return null;
      var v = n.get(s);
      return v == null ? null : v;
    },
    // True when a number box is currently AUTO-driven — the value is being set by an
    // automatic controller, so the operator can't meaningfully type into it. The renderer
    // greys these out (cyan = user-editable). The two SETPOINT boxes (boron target, pressure
    // setpoint) are always the operator's to set even under auto, so they stay editable.
    numberAuto: function (item, s) {
      var cs = CS(s);
      switch (item.id) {
        case 'imro8rmka2y': return cs.load_mode === 'follow';                         // generator load auto-tracks in FOLLOW
        case 'imro8xhy2me': var c = chan(s, 'feed_sg'); return !!(c && c.engaged);     // SG feed on the feed_sg auto channel
        case 'imro929i738': return !!cs.spray_auto;                                    // pressurizer spray AUTO
        case 'imro96mj15p': return !!cs.heater_auto;                                   // pressurizer heater AUTO
        case 'imrpq48hn3t': return !!cs.cvcs_auto;                                     // charging AUTO make-up
        default: return false;
      }
    },
    buttonActive: function (item, s) {
      var b = BUTTONS[item.id];
      return b && b.active ? !!b.active(s) : false;
    },
    // Neutral (grey) state: the TRIP BLOCKS button greys out while any trip is blocked —
    // a standing lineup note, not an alarm (green/yellow/red is reserved for real severity).
    buttonInfo: function (item, s) {
      return item.id === 'imrsk4xz2dm' && blockedTripCount(s) > 0;
    },
    // Count badge: how many trips are currently blocked, on the TRIP BLOCKS button.
    buttonBadge: function (item, s) {
      if (item.id !== 'imrsk4xz2dm') return null;
      var n = blockedTripCount(s);
      return n > 0 ? n : null;
    },
    // Yellow "in motion" light — currently the latched shutdown-rod drive. Distinct from
    // bd-active (a selected mode) and bd-info (a standing lineup note): this one means
    // something is MOVING right now because you asked it to.
    buttonWarn: function (item, s) {
      var b = BUTTONS[item.id];
      return b && b.warn ? !!b.warn(s) : false;
    },
    buttonDisabled: function () { return false; },
    // Control tiles to append to the board that aren't in the generated board_data.js.
    // No driver-injected items and no doc patching since V2 — see EXTRA_ITEMS above for
    // what used to be here and where each piece is authored now.
    extraItems: function () { return EXTRA_ITEMS; },
    // Absolute, idempotent geometry corrections to the generated doc — see DOC_PATCHES.
    docPatches: function (doc) { applyDocPatches(doc); },
    // Live fluid temperature (°C) for a pipe id, or null to keep its authored temp.
    // Lets the renderer repaint pipe fluid color each snapshot (see PIPE_TEMP).
    pipeTemp: function (id, s) { var f = PIPE_TEMP[id]; return f ? f(s) : null; },
    compProps: function (item, s) {
      var f = COMPPROPS[item.id] || COMPPROPS[item.comp === undefined ? item.id : item.id];
      // fall back to comp-name keyed entries for the singletons
      if (!f && item.comp) f = COMPPROPS[item.id];
      if (!f) return null;
      return f(s);
    },
    afterRender: function (s) {
      // Boron target-seeking now lives in the control/automation layer (the
      // 'boron_conc' channel) — the ON/OFF buttons and target number engage and set it.
      refreshTripBlocks(s);
      clearLatchIfDone(s);
    },
    // instructor highlight vocabulary (consumed by pwr_board.revealControl / highlightLabels)
    controlLabelItem: function (label) { return CONTROL_LABEL_MAP[label] || null; },
    controlLabels: function () { return Object.keys(CONTROL_LABEL_MAP); },
    // Inspection copy (#96) — what an item IS, in two tiers, resolved through the
    // registry's containment fallback so an unnamed sub-frame describes its card.
    // Kept in pwr_board_inspect.js rather than here: it is prose about the plant,
    // not wiring, and it is long enough to bury this file.
    inspectItem: function (id) {
      var I = RD.PwrBoardInspect;
      return (I && I.entry) ? I.entry(id) : null;
    },
    tagItem: function () { return TAG_ITEM; },
    // pumps rendered art-only (built-in control box suppressed) — see ART_ONLY_PUMPS
    suppressBuiltInControls: function (id) { return !!ART_ONLY_PUMPS[id]; },
    // exposed for the acceptance harness
    selfTest: function (ck, svc, sent) {
      var s = svc.assembleSnapshot();
      ck('driver: value map covers all value items', (function () {
        var miss = [];
        (window.RD_PWR_BOARD_DOC.items || []).forEach(function (it) {
          // `readout` is a labelled value (see buildReadout) and is driven through VALUES
          // exactly like `value`, so it has to be covered by the same assertion.
          if ((it.kind === 'value' || it.kind === 'readout') && !VALUES[it.id]) miss.push(it.id);
        });
        return miss.length === 0 ? true : miss.join(',');
      })() === true);
      // PIPE_TEMP is keyed by PIPE id, and a pipe id changes whenever its run is re-drawn
      // in the diagram builder. An orphaned key fails silently — the pipe just goes back to
      // its authored temp — which is exactly what happened to 12 of them in the V2 export.
      ck('driver: every PIPE_TEMP key is a live pipe id', (function () {
        var live = {};
        (window.RD_PWR_BOARD_DOC.pipes || []).forEach(function (p) { live[p.id] = 1; });
        var miss = Object.keys(PIPE_TEMP).filter(function (k) { return !live[k]; });
        return miss.length === 0 ? true : miss.join(',');
      })() === true);
      // ---- power tile follows the ARMED power trip (#267) --------------------------------
      // The tile used to read 120 % in every state, because tripSp() took the first
      // `power_range high` row and the table happens to author the backstop first. MEASURED
      // on engine+M4 from `5_percent`: with pr_low_setpoint armed, 26 % scrams and 24 % does
      // not — so the gauge was showing a limit ~5x above the one the plant enforces for the
      // whole of a startup. These pin the three states rather than the one that was wrong.
      function powerTile(blocks) {
        var t = { instruments: { power_range: 5 }, control_state: {}, true_state: { plant_mode: 3 },
                  metadata: { sim_time: 100 } };
        if (blocks) t.rps_state = { trip_blocks: blocks, scrammed: false };
        return COMPPROPS.imrzl4b7g9m(t);
      }
      var pArmed = powerTile({}), pBlocked = powerTile({ pr_low_setpoint: true }), pBare = powerTile(null);
      // Armed (every startup IC): green to P-10, amber P-10 -> 25 %, red above, and the
      // window closes down so the low-power ascent is legible on a linear meter.
      ck('driver: power tile trips at 25 % while pr_low_setpoint is armed',
        pArmed.tripHi === 25 && pArmed.alarmHi === 10 && pArmed.normHi === 10, pArmed.tripHi + '/' + pArmed.alarmHi + '/' + pArmed.normHi);
      ck('driver: power tile rescales to the armed trip', Math.round(pArmed.max) === 27, pArmed.max.toFixed(1));
      ck('driver: power tile names the armed trip', pArmed.note === 'TRIP 25%', JSON.stringify(pArmed.note));
      // Blocked above P-10: back to the authored at-power band, and the note clears rather
      // than sticking at its last value.
      ck('driver: power tile returns to 120 % when the low setpoint is blocked',
        pBlocked.tripHi === 120 && pBlocked.alarmHi === 108 && pBlocked.normHi === 100, pBlocked.tripHi + '/' + pBlocked.alarmHi + '/' + pBlocked.normHi);
      ck('driver: power tile clears its note when blocked', pBlocked.note === '', JSON.stringify(pBlocked.note));
      // No RPS section (load order / no control layer): fall back to the authored band.
      // Reading "nothing is blocked" out of an absent section would peg a full-power plant
      // against a 27 % scale.
      ck('driver: power tile falls back to authored bands with no rps_state',
        pBare.tripHi === 120 && pBare.note === '', pBare.tripHi + '/' + JSON.stringify(pBare.note));
      // tripBackstop must not depend on table order — the defect this fixes was order-dependent.
      ck('driver: power backstop is order-independent',
        tripBackstop('power_range', 'high', null) === 120, tripBackstop('power_range', 'high', null));
      // Same failure mode for the highlight vocabulary: a dead target silently stops
      // glowing, and the campaign/checklist gates only cover part of the label set.
      ck('driver: every highlight target exists', (function () {
        var live = {};
        (window.RD_PWR_BOARD_DOC.items || []).forEach(function (it) { live[it.id] = 1; });
        ['porv'].forEach(function (k) { live[k] = 1; });   // component singletons
        var miss = [];
        Object.keys(CONTROL_LABEL_MAP).forEach(function (label) {
          if (!live[CONTROL_LABEL_MAP[label]]) miss.push(label + '→' + CONTROL_LABEL_MAP[label]);
        });
        return miss.length === 0 ? true : miss.join(',');
      })() === true);
      // A DOC_PATCHES entry that no longer resolves is a silently-dropped correction: the
      // pipe just goes back to being crooked. Same failure mode as an orphaned PIPE_TEMP key.
      ck('driver: every DOC_PATCHES target resolves', (function () {
        var doc = window.RD_PWR_BOARD_DOC, miss = [];
        var livePipes = {}; (doc.pipes || []).forEach(function (p) { livePipes[p.id] = 1; });
        Object.keys(DOC_PATCHES.pipes).forEach(function (k) { if (!livePipes[k]) miss.push('pipe ' + k); });
        Object.keys(DOC_PATCHES.items).forEach(function (k) {
          var it = (doc.items || []).filter(function (i) { return i.id === k; })[0];
          if (!it) { miss.push('item ' + k); return; }
          Object.keys(DOC_PATCHES.items[k].ports || {}).forEach(function (pid) {
            if (!(it.ports || []).some(function (p) { return p.id === pid; })) miss.push(k + '/' + pid);
          });
        });
        return miss.length === 0 ? true : miss.join(',');
      })() === true);
      ck('driver: every button wired', (function () {
        var miss = [];
        (window.RD_PWR_BOARD_DOC.items || []).forEach(function (it) {
          if (it.kind === 'button' && !BUTTONS[it.id]) miss.push(it.id);
        });
        return miss.length === 0 ? true : miss.join(',');
      })() === true);
      ck('driver: every number wired', (function () {
        var miss = [];
        (window.RD_PWR_BOARD_DOC.items || []).forEach(function (it) {
          if (it.kind === 'number' && !NUMBERS[it.id]) miss.push(it.id);
        });
        return miss.length === 0 ? true : miss.join(',');
      })() === true);
      // Inspection registry (#96). Same silent-failure mode as PIPE_TEMP and the
      // highlight vocabulary: an orphaned key just stops describing anything, and
      // a NEW item nobody wrote copy for reads as its card's summary — which looks
      // deliberate. Assert both directions.
      ck('driver: every inspect key is a live item', (function () {
        var I = RD.PwrBoardInspect;
        if (!I) return 'RD.PwrBoardInspect not loaded';
        var live = {};
        (window.RD_PWR_BOARD_DOC.items || []).forEach(function (it) { live[it.id] = 1; });
        (EXTRA_ITEMS || []).forEach(function (it) { live[it.id] = 1; });   // empty today — see EXTRA_ITEMS
        var miss = I.ids().filter(function (k) { return !live[k]; });
        var al = I.aliases();
        Object.keys(al).forEach(function (k) { if (!live[k]) miss.push('alias ' + k); });
        return miss.length === 0 ? true : miss.join(',');
      })() === true);
      ck('driver: every board item inspects to something', (function () {
        var I = RD.PwrBoardInspect;
        if (!I) return 'RD.PwrBoardInspect not loaded';
        var miss = [];
        (window.RD_PWR_BOARD_DOC.items || []).forEach(function (it) {
          if (!I.entry(it.id)) miss.push(it.kind + ':' + it.id);
        });
        return miss.length === 0 ? true : miss.join(',');
      })() === true);
      // Every INTERACTIVE item gets copy of its own: inheriting the card's summary
      // is right for a caption, wrong for a control the player can press.
      ck('driver: every control has its own inspect entry', (function () {
        var I = RD.PwrBoardInspect;
        if (!I) return 'RD.PwrBoardInspect not loaded';
        var miss = [];
        (window.RD_PWR_BOARD_DOC.items || []).forEach(function (it) {
          if (['button', 'number', 'scram'].indexOf(it.kind) < 0) return;
          if (!I.own(it.id)) miss.push(it.kind + ':' + it.id);
        });
        return miss.length === 0 ? true : miss.join(',');
      })() === true);
      ck('driver: control-bearing components wired', (function () {
        var miss = [];
        (window.RD_PWR_BOARD_DOC.items || []).forEach(function (it) {
          if (it.kind !== 'component') return;
          if (!COMPPROPS[it.id] && !COMPPROPS[it.comp === undefined ? '' : it.id]) {
            // singletons keyed by their fixed id
            if (['steamGenerator','turbineGenerator','reactorVessel','pressurizer','porv','condenser','coolingTower'].indexOf(it.id) < 0) miss.push(it.id);
          }
        });
        return miss.length === 0 ? true : miss.join(',');
      })() === true);
    }
  };
})();
