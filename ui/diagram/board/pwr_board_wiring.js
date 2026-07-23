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
  // Editable-input valid ranges [min, max], in the board's display (US) units — the
  // renderer clamps every setpoint box to these and auto-corrects an out-of-range entry
  // to the nearest bound (both min and max). Sourced from the engine limits so a retune
  // keeps the UI honest; the board is US-only, so these are the only unit the box shows.
  var _CFG = (typeof RD !== 'undefined' && RD.PWR_CONFIG) || {};
  var _RX = _CFG.reactivity || {}, _PZ = _CFG.pressurizer || {}, _ID = _CFG.identity || {};
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
                  Math.floor(MPa2psi(_PZ.safety_open_mpa || 17.13))] //   engine band 0.1 MPa .. pzr safety
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
  function IN(s) { return s.instruments || {}; }
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
    // AUTO/ON/OFF is a mutually-exclusive triad (mirrors pwr_synoptic.js): AUTO lights
    // when the ESF arm is 'auto'; ON/OFF light only while in MANUAL (arm !== 'auto').
    imrldymb837: { press: function () { cmd({ action: 'set_hpi', active: true }); }, active: function (s) { return !esfAuto(s, 'hpi') && IN(s).hpi_active; } },
    imrldz0wqds: { press: function () { cmd({ action: 'set_hpi', active: false }); }, active: function (s) { return !esfAuto(s, 'hpi') && !IN(s).hpi_active; } },
    imrle1mc0lk: { press: function () { cmd({ action: 'set_esf_auto', system: 'hpi', auto: true }); }, active: function (s) { return esfAuto(s, 'hpi'); } },
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
    // --- Shutdown rods — same momentary tap-or-hold drive ---
    imrpnyaxsb3: { hold: { group: 'shutdown_rods', direction: 1 } },
    imrpnyf37ju: { hold: { group: 'shutdown_rods', direction: -1 } },
    // --- Steam dump: AUTO / OPEN / CLOSE ---
    imrppqg6mcc: { press: function () { cmd({ action: 'set_steam_dump', mode: 'auto' }); }, active: function (s) { return CS(s).steam_dump_auto; } },
    imrppquqg16: { press: function () { cmd({ action: 'set_steam_dump', mode: 'open' }); }, active: function (s) { return !CS(s).steam_dump_auto && (CS(s).steam_dump_pct || 0) > 50; } },
    imrppqxggbj: { press: function () { cmd({ action: 'set_steam_dump', mode: 'closed' }); }, active: function (s) { return !CS(s).steam_dump_auto && (CS(s).steam_dump_pct || 0) <= 50; } },
    // --- Generator load mode: FOLLOW / MAN / OFF ---
    // FOLLOW and MAN bring the turbine ONLINE — connect_grid clears a prior trip/
    // disconnect (if condenser vacuum permits) and closes the breaker; set_load_mode
    // alone never un-trips, which is why pressing FOLLOW used to do nothing after OFF.
    // Lit state tracks the ACTUAL online/offline state (turbine_tripped): OFF lights
    // only when the machine is truly offline, FOLLOW/MAN only while online in that mode.
    imro8ktzs3u: { press: function () { cmd({ action: 'connect_grid' }); }, active: function (s) { return !IN(s).turbine_tripped && CS(s).load_mode === 'follow'; } },
    imro8lddxi: { press: function () { cmd({ action: 'connect_grid' }); cmd({ action: 'set_load_mode', mode: 'manual' }); }, active: function (s) { return !IN(s).turbine_tripped && CS(s).load_mode === 'manual'; } },
    imro8len0oi: { press: function () { cmd({ action: 'disconnect_grid' }); }, active: function (s) { return !!IN(s).turbine_tripped; } },
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
    bdSrDetector: { press: function (s) { cmd({ action: 'set_sr_detector', on: !IN(s).sr_energized }); }, active: function (s) { return !!IN(s).sr_energized; } }
  };

  // Driver-supplied control tiles NOT in the generated board_data.js — kept here so they
  // survive a diagram re-export. The renderer appends these to doc.items at mount (deduped
  // by id) and wires them like any authored button (BUTTONS entry above). The 1/M plot is a
  // NIS/startup tool, so it sits with the startup net just under the TRIP BLOCKS button.
  var EXTRA_ITEMS = [
    { id: 'bdOneOverM', kind: 'button', name: '', left: 370, top: 890, width: 75, height: 40,
      label: '1/M PLOT', color: '#5aad7c', fontSize: 13 },
    // Source-range detector energize/secure switch. The generated board carries the SR
    // *indication* (id imro6qutiht) but no switch, so a startup can't secure the SR before
    // its high-flux trip scrams the ascent. Sits just under the SR indication and above the
    // SCRAM button (which extraItems() nudges down to make room). See BUTTONS.bdSrDetector.
    { id: 'bdSrDetector', kind: 'button', name: '', left: 505, top: 305, width: 110, height: 20,
      label: 'SR DET', color: '#5aad7c', fontSize: 12 }
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
    imrsg8b7b9o: { set: function (v) { cmd({ action: 'set_pressure_setpoint', mpa: psi2MPa(v) }); }, get: function (s) { return MPa2psi(CS(s).pressure_setpoint || 0); } } // plant pressure setpoint psi
  };

  // ================================================================ VALUES (indications)
  // fn(s) -> display text (unit stays as authored on the item).
  var VALUES = {
    imrmromyxdq: function (s) { return r0((IN(s).hpi_flow || 0) * GPM_HPI); },                          // ECCS flow gpm (true hpi_flow)
    imrmru52f8l: function (s) { return r0(MPa2psi(IN(s).hpi_discharge_pressure || 0)); },               // ECCS discharge psi (true pump head)
    imrmstovyli: function (s) { return r0((IN(s).afw_flow || 0) * GPM_AFW); },                          // AFW flow gpm (true afw_flow)
    imrmsu1bl4r: function (s) { return r0(MPa2psi(IN(s).afw_discharge_pressure || 0)); },               // AFW discharge psi (true pump head)
    imrmtkjxzm1: function (s) { return r0((IN(s).letdown_flow || 0) * GPM_LETDOWN); },                 // letdown flow gpm
    imrqn5m0oaj: function (s) { return r0((IN(s).charging_flow || 0) * GPM_CHARGING); },               // charging flow gpm
    imrmtp2alpy: function (s) { return r0(IN(s).boron_analyzer); },                                     // boron ppm
    imro6ohhdq3: function (s) { return r0(C2F(IN(s).tavg)); },                                          // Tavg °F
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
    imrpk4pjcpd: function (s) { var g = rodGroup(s, 'control_rods'); return g ? g.steps : 0; },         // control rod steps
    imrpnzfsfcx: function (s) { var g = rodGroup(s, 'shutdown_rods'); return g ? g.steps : 0; },        // shutdown rod steps
    imrppee04aj: function (s) { return r0(IN(s).turbine_rpm); },                                        // turbine rpm
    imrppeg6g16: function (s) { return r0(IN(s).steam_dump_valve); },                                   // steam dump %
    imrppeh5hkb: function (s) { return r0(IN(s).mwe_output); },                                         // generator MW
    imrppej8ulo: function (s) { return r0(IN(s).governor_valve); },                                     // governor %
    imrppq5r7kw: function (s) { return CS(s).steam_dump_auto ? 'NORMAL' : ((CS(s).steam_dump_pct || 0) > 0 ? 'DUMPING' : 'MANUAL'); }, // steam dump status
    imrppyp0wfo: function (s) { return accN2Psi(s); },                                                  // accumulator N2 psig
    imrppztrng1: function (s) { return CS(s).eccs_mode, IN(s).accumulators_discharging ? 'INJECTING' : (accIsolated(s) ? 'ISOLATED' : 'ARMED'); }, // accumulator status
    imrpq0n2ujv: function (s) { return r0(accFill(s)); },                                               // accumulator fill %
    imrqn8uo0z: function (s) { var r = CS(s).boron_adjust || 0; return r > 0 ? 'BORATING' : (r < 0 ? 'DILUTING' : 'HOLD'); }, // boron status
    imrqrouhrdr: function () { return 'NORMAL'; },                                                      // condensate polisher (behavioral)
    imrqzuhzre3: function (s) { return r0(kPa2inHg(IN(s).condenser_vacuum)); },                         // condenser vacuum inHg
    imrr1fmzzjp: function (s) { return r0(IN(s).sg_level); },                                           // SG level %
    imrr1gwi93j: function (s) { return r0(MPa2psi(IN(s).steam_pressure)); },                            // SG pressure psi
    imrr1hecwq7: function (s) { return r0(C2F(satTempC(IN(s).steam_pressure))); },                      // steam temp °F (sat)
    imrr1ixcqe3: function (s) { return r0(MPa2psi(IN(s).primary_pressure)); },                          // plant pressure psi
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
    imrsgkz4lq0: function (s) { return r0((CS(s).feed_pump_speed_pct || 0) * GPM_FEED_PER_PCT); }       // SG feed rate gpm
  };

  // SR→IR handoff cue: turn the source-range indication amber at the SR high-flux caution
  // (matches pwr_control 'sr_high_flux' = 5e4 cps), prompting the operator to secure the SR
  // before its 1e5 cps trip. SR_NORMAL_COLOR is the authored green on the SR indication item.
  var SR_HANDOFF_CPS = 5.0e4, SR_HANDOFF_COLOR = '#D9A441' /* --caution */, SR_NORMAL_COLOR = '#5aad7c';
  function fmtExp(v) { if (!v || v <= 0) return '0'; var e = Math.floor(Math.log10(v)); var m = v / Math.pow(10, e); return m.toFixed(1) + 'e' + e; }
  function accIsolated(s) { return CS(s).accumulator_valve_open === false; }
  function accFill(s) { var t = s.true_state || {}; return t.accumulator_volume_pct != null ? t.accumulator_volume_pct : 78; }
  function accN2Psi(s) { var t = s.true_state || {}; return t.accumulator_pressure_mpa != null ? r0(MPa2psi(t.accumulator_pressure_mpa)) : 640; }

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
        spray: (c.spray_valve_pct || 0) > 2, temp: satTempC(IN(s).primary_pressure), glow: true, showFlow: true };
    },
    // The PORV schematic shows the TRUE valve position (vent plume + discharge flow),
    // not the demand-signal light. That light is the TMI-2 lie — it reads "closed" while
    // the valve is stuck open — but the physical valve, its steam plume, and the flow down
    // the tailpipe are real, and the board depicts the plant, not the lamp. So a stuck-open
    // PORV visibly vents and drives flow through the discharge pipe (issue #105 #5), while
    // the operator's PORV *indicator* readout stays wrong. Falls back to the indicator if a
    // snapshot ever lacks true_state (defensive; real snapshots always carry it).
    porv: function (s) { var t = s.true_state || {}; return { open: t.porv_open != null ? !!t.porv_open : (IN(s).porv_indicator === 'open') }; },
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
    imrpp2g2m8k: function (s) { return valveProps(IN(s).afw_block_open === false ? 0 : 1, 'water', 60, IN(s).afw_active); }, // afw block valve
    imrpp99kx2y: function (s) { return valveProps(IN(s).msiv_open ? 1 : 0, 'steam', satTempC(IN(s).steam_pressure)); },            // main steam isolation
    imrppb3kuav: function (s) { return valveProps(CS(s).porv_block_open ? 1 : 0, 'steam', 250); },                                 // PORV block valve
    // accumulator shutoff (isolation) valve — normally OPEN/aligned, but the accumulators
    // only inject once RCS pressure falls below the 600 psi check-valve setpoint, so the
    // discharge only "flows" while accumulators_discharging (no flow into the Rx at power).
    imrppxt2aqd: function (s) { return valveProps(CS(s).accumulator_valve_open === false ? 0 : 1, 'water', 50, IN(s).accumulators_discharging); },
    imrprmm4u5q: function (s) { return valveProps((IN(s).steam_dump_valve || 0) / 100, (IN(s).steam_dump_valve || 0) > 2 ? 'steam' : 'empty', satTempC(IN(s).steam_pressure)); }, // steam dump valve
    // TCV (turbine control valve) — only shows steam FLOW when the turbine is actually taking
    // load; a tripped/unloaded turbine (steam_demand_low) closes the governor to a crack, so
    // the turbine-inlet pipe should go still even though the valve isn't fully shut.
    imrr45syy4v: function (s) { return valveProps((IN(s).governor_valve || 0) / 100, 'steam', satTempC(IN(s).steam_pressure), !IN(s).steam_demand_low && (IN(s).governor_valve || 0) > 5); }   // TCV
  };

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
  var PIPE_TEMP = {
    pmrr3mh0eqa: function (s) { return IN(s).thot; },                     // RCS hot leg  (RV hot-out → SG)
    pmrr0sdw3oe: function (s) { return IN(s).tcold; },                    // RCS cold leg (RV cold-in ← RCP)
    pmrr0sfz914: function (s) { return IN(s).tcold; },                    // RCS cold leg (RCP → SG cold-out)
    pmrr0whsee9: function (s) { return IN(s).tcold; },                    // pressurizer spray (taken off the cold leg)
    pmrr3zbmng6: function (s) { return IN(s).thot; },                     // pressurizer surge (ties to the hot leg)
    pmrr0u4vgri: function (s) { return satTempC(IN(s).steam_pressure); }, // SG main steam-out (saturated)
    pmrr46n63pq: function (s) { return satTempC(IN(s).steam_pressure); }, // main steam header (MSIV → TCV)
    pmrr499yfkb: function (s) { return satTempC(IN(s).steam_pressure); }, // main steam → turbine (TCV out)
    pmrr0u9nib3: function (s) { return satTempC(IN(s).steam_pressure); }, // steam dump → condenser bypass
    pmrr46oahnx: function (s) { return satTempC(IN(s).steam_pressure); }, // steam dump branch
    // PORV relief path — the discharge line heats with the tailpipe instrument (~82 °C
    // seated → ~150 °C passing) so a stuck-open PORV visibly cooks its tailpipe on the board
    // instead of sitting frozen at an authored red (issue #105 #6). The inlet line off the
    // pressurizer carries live RCS steam at saturation.
    pmrr0y2b78z: function (s) { return satTempC(IN(s).primary_pressure); }, // pressurizer → PORV inlet
    pmrr0wvtu7z: function (s) { return IN(s).porv_tailpipe_temp; },         // PORV → block valve (tailpipe)
    pmrsi3xy4ch: function (s) { return IN(s).porv_tailpipe_temp; },         // block valve → drain (tailpipe)
    // secondary condensate / feedwater loop — same water ramp as the pumps & vessels it links
    // Feed pump + both its pipes carry the same feedwater — one fwTemp so the pump's fluid
    // color matches the pipes into/out of it (the cool→hot transition sits upstream, at the
    // condensate pump / FW-heater junction).
    pmrr0uzf5ew: function (s) { return fwTemp(s); },      // feedwater: feed pump → SG
    pmrr0ustj2z: function (s) { return fwTemp(s); },      // feedwater: → feed pump suction
    pmrr0uryodr: function (s) { return condTemp(s); },    // condensate pump discharge
    pmrr4j7wa1o: function (s) { return condTemp(s); },    // condenser hotwell → condensate pump
    // circulating cooling-water loop (condenser ↔ cooling tower)
    pmrr0ujsja6: function (s) { return 25 + 0.14 * (IN(s).power_range || 0); }, // CW return (warm)
    pmrr0um0pv: function () { return 25; }                                       // CW supply (cold)
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
  // Manual-procedure / campaign-beat control labels (the vocabulary validated against
  // RD.PwrSynoptic.highlightLabels) → the board item that hosts that control. Glowing
  // the enclosing box/panel lights the whole control group. Keep this covering the same
  // label set as pwr_synoptic.js SYN_CONTROL_MAP or campaign highlights won't resolve.
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
    'HPI': 'imrldx4qme6', 'HPI/LPI': 'imrldx4qme6', 'Decay-Heat Removal (DHR)': 'imrldx4qme6',
    'AFW': 'imrmssto6d', 'AFW Throttle': 'imrmssto6d',
    'Feed Pumps': 'imrqxsodu5j', 'Feed Reg': 'imrqxsodu5j', 'Feed Pump': 'imrqxsodu5j',
    'MSIV': 'imrpp99kx2y',
    'SR detector': 'imro6qutiht', 'NIS': 'imro6qutiht', '1/M Plot': 'imro6rctcgm',
    'Trip Blocks': 'imrsk4xz2dm'
  };
  // The board item the maintenance tag hangs over (TMI-2 AFW discharge valve).
  var TAG_ITEM = 'imrpp2g2m8k';

  function refreshTripBlocks(s) {
    if (!pop || !s) return;
    var btns = pop.querySelectorAll('button[data-trip]');
    for (var i = 0; i < btns.length; i++) {
      var id = btns[i].getAttribute('data-trip');
      var blocked = isBlocked(s, id);
      btns[i].textContent = blocked ? 'BLOCKED' : 'BLOCK';
      btns[i].className = blocked ? 'bd-blocked' : '';
      // permissive gating: at power lo_press/lo_flow can't be blocked (permissive unmet);
      // the engine simply ignores the command, so reflect a disabled affordance.
      var permit = tripBlockPermitted(s, id);
      btns[i].disabled = !permit && !blocked;
    }
  }

  function tripBlockPermitted(s, id) {
    var INS = IN(s);
    // P-10 (10% power) gates ir_high / pr_low_setpoint; lo_press/lo_flow gate on their own
    // low-pressure / low-power permissive.
    if (id === 'ir_high' || id === 'pr_low_setpoint') return (INS.power_range || 0) > 10;
    if (id === 'lo_press') return (INS.primary_pressure || 99) < 13.6;
    if (id === 'lo_flow') return (INS.power_range || 0) < 5;
    return true;
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
    buttonDisabled: function () { return false; },
    // Control tiles to append to the board that aren't in the generated board_data.js.
    extraItems: function () {
      // Make room for the SR DET toggle between the SR indication and SCRAM: nudge the
      // authored scram button (imrqr8ecji6) down a little. Done here (not in the generated
      // board_data.js) so it survives a diagram re-export; idempotent — sets an absolute
      // top each mount. 335 + height 45 = 380, flush with the CONTROL/SHUTDOWN group boxes.
      var doc = window.RD_PWR_BOARD_DOC;
      if (doc && doc.items) {
        for (var i = 0; i < doc.items.length; i++) {
          if (doc.items[i].id === 'imrqr8ecji6') { doc.items[i].top = 335; }
          // Fine-step rod drive (228 → 912, 2026-07-23): the generated board data
          // carries a static '/228' unit suffix on both step readouts — patch it
          // here so it survives a diagram re-export.
          if (doc.items[i].id === 'imrpk4pjcpd' || doc.items[i].id === 'imrpnzfsfcx') { doc.items[i].unit = '/912'; }
        }
      }
      return EXTRA_ITEMS;
    },
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
    },
    // instructor highlight vocabulary (consumed by pwr_board.revealControl / highlightLabels)
    controlLabelItem: function (label) { return CONTROL_LABEL_MAP[label] || null; },
    controlLabels: function () { return Object.keys(CONTROL_LABEL_MAP); },
    tagItem: function () { return TAG_ITEM; },
    // pumps rendered art-only (built-in control box suppressed) — see ART_ONLY_PUMPS
    suppressBuiltInControls: function (id) { return !!ART_ONLY_PUMPS[id]; },
    // exposed for the acceptance harness
    selfTest: function (ck, svc, sent) {
      var s = svc.assembleSnapshot();
      ck('driver: value map covers all value items', (function () {
        var miss = [];
        (window.RD_PWR_BOARD_DOC.items || []).forEach(function (it) {
          if (it.kind === 'value' && !VALUES[it.id]) miss.push(it.id);
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
