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

  // ---- unit conversions ----
  function C2F(c) { return c * 9 / 5 + 32; }
  function F2C(f) { return (f - 32) * 5 / 9; }
  function Cd2F(c) { return c * 9 / 5; }
  function Fd2C(f) { return f * 5 / 9; }
  function MPa2psi(p) { return p * 145.038; }
  function psi2MPa(p) { return p / 145.038; }
  function kPa2inHg(k) { return k * 0.2953; }
  function inHg2kPa(i) { return i / 0.2953; }
  // 1 US gal/min = 0.2271247 m³/h. The gpm scales below are AUTHORED display flavour, not a
  // derived physical flow (Manuals/12 §646), so this is a scale factor on a scale factor —
  // which is exactly why the flow family's BASE unit is gpm and not an SI quantity.
  function gpm2m3h(g) { return g * 0.2271247; }
  function m3h2gpm(q) { return q / 0.2271247; }
  function sameUnit(v) { return v; }
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
  // RWST / SIT injection temperature — the engine's own constant, so a board pipe and the
  // quench term in pwr_thermal.stepCoolant cannot drift apart (#357). Also stands in for the
  // volume control tank and the condensate storage tank, which this plant does not model.
  function ECCS_T() { return _EM.eccs_temp_c != null ? _EM.eccs_temp_c : 40; }
  function r0(v) { return Math.round(v); }
  function r1(v) { return (Math.round(v * 10) / 10); }

  // #408 wave 1: ONE declared volume, ONE conversion. The plant's RCS is the
  // declared ~7,500 gal (1,000 ft3 at 300 MWt, sourced fleet ratio), so every
  // RCS-side gpm display is now LITERAL: gpm = frac/s x 7,500 gal x 60 s/min.
  // The old per-family full-scales (600/1000/1000) were display flavour over a
  // currency no single volume could make true — the config identity block used
  // to have to disclaim exactly that.
  var GPM_RCS_PER_FRAC = 450000;
  var GPM_AFW = 640, GPM_FEED_PER_PCT = 10;   // SECONDARY side — its own ledger, untouched by the re-clock
  var GPM_FEED = 1000;   // full-rated feed flow, for the measured fw_flow indication (normalized 0-1)
  var _CFG = (typeof RD !== 'undefined' && RD.PWR_CONFIG) || {};
  var _RX = _CFG.reactivity || {}, _PZ = _CFG.pressurizer || {}, _ID = _CFG.identity || {};
  var _PZ2 = _CFG.pressurizer2 || {};   /* the v2 vessel block — heater ELEVATION lives here */
  var _SG = _CFG.steam_generator || {}, _EM = _CFG.emergency || {}, _TB = _CFG.turbine || {};
  var GPM_CHARGING = 450000, GPM_LETDOWN = 450000;   // = GPM_RCS_PER_FRAC (literals: run_manual_units parses these statically)
  // ECCS full-scale = the RATED combined injection in real gpm (~324 on the declared
  // volume — the Ginna-scaled number), computed from config so a retune moves it.
  var GPM_HPI = Math.round(((_EM.hpi_flow_max || 2.0e-4) +
    (_EM.lpi_flow_max || 1.0) * (_EM.lpi_inventory_gain || 5.2e-4)) * GPM_RCS_PER_FRAC);
  var CHARGING_MAX_GPM = GPM_CHARGING * (_RX.charging_max || 60 / 450000);

  // ================================================== display-unit layer (#238)
  // The board used to render US customary at every readout, which is why the Settings SI
  // toggle was DISABLED while the PWR was active (#237): a global SI selection put SI chart
  // chips beside US board readouts, the one indefensible state. This is the layer that
  // closes it — ONE conversion point, keyed off the app's units mode, feeding every readout,
  // every setpoint box (value, bounds, ▲▼ step, decimals, range hint) and every tile band.
  //
  // A family declares, per mode: the conversion FROM the family's base unit, its inverse,
  // the unit string, display decimals, ▲▼ step, and `q` — the band-edge quantisation (see
  // qz(), which exists to stop the tile strip flickering at the render rate).
  //
  // BASE UNIT IS NOT ALWAYS SI. Pressure/temperature carry the engine's SI, but `flow`'s
  // base is GPM, because the gpm figures are an authored display scale over normalized
  // engine internals rather than a modelled flow (Manuals/12 §646). US is therefore the
  // identity on that family and SI is the converted one — the opposite of the others, and
  // deliberate: it keeps GPM_HPI and friends meaning exactly what they always meant.
  //
  // US MODE IS UNCHANGED BY CONSTRUCTION. Every US entry reproduces the arithmetic and the
  // rounding that was inline before, and the unit STRING in US mode comes from the authored
  // item (`item.unit`), never from this table — so the board's three authored spelling
  // quirks (`F` not `°F`, `GPM` uppercase on two items, `psig` on the accumulator) survive
  // untouched, and switching SI→US restores them rather than leaving this table's guess.
  // `u.US` below is documentation and the fallback for a caller with no authored string.
  //
  // SI flow is m³/h — the SI volumetric flow unit a real plant display carries
  // (OWNER RULING, 2026-08-01: selected "m³/h" from three options put to him — m³/h, L/min
  // and kg/s. A selection, not verbatim words, and recorded that way deliberately.)
  var UNIT_FAMILIES = {
    press: { US: { to: MPa2psi,  from: psi2MPa,  u: 'psi',  d: 0, step: 1,    q: 1    },
             SI: { to: sameUnit, from: sameUnit, u: 'MPa',  d: 2, step: 0.01, q: 0.01 } },
    // Absolute temperature. C2F carries the 32° offset...
    temp:  { US: { to: C2F,      from: F2C,      u: 'F',    d: 0, step: 1,    q: 1    },
             SI: { to: sameUnit, from: sameUnit, u: 'C',    d: 0, step: 1,    q: 0.5  } },
    // ...and a temperature DIFFERENCE must not (subcooling margin, leg ΔT). 41 °C of
    // subcooling is 73.8 °F, not 105.8 — and the wrong one reads as a HEALTHIER margin
    // than the plant has, which is the trap `run_manual_units` exists to catch in prose.
    tempd: { US: { to: Cd2F,     from: Fd2C,     u: 'F',    d: 0, step: 1,    q: 1    },
             SI: { to: sameUnit, from: sameUnit, u: 'C',    d: 0, step: 1,    q: 0.5  } },
    vac:   { US: { to: kPa2inHg, from: inHg2kPa, u: 'inHg', d: 0, step: 1,    q: 1    },
             SI: { to: sameUnit, from: sameUnit, u: 'kPa',  d: 0, step: 1,    q: 1    } },
    flow:  { US: { to: sameUnit, from: sameUnit, u: 'gpm',  d: 0, step: 1,    q: 1    },
             SI: { to: gpm2m3h,  from: m3h2gpm,  u: 'm³/h', d: 0, step: 1,    q: 1    } }
  };
  // The active display mode. Comes from the app (ctx.units), which owns the Settings
  // toggle; anything mounting the board without one — the board_check harness, a test
  // stub — gets US, the authored board. (`ctxRef` is declared below this block; that is
  // safe because U() is only ever CALLED from a render, long after onMount assigns it —
  // the same hoisting shape tile() documents for TILE_BANDS.)
  function U() {
    var m = (ctxRef && typeof ctxRef.units === 'function') ? ctxRef.units() : null;
    return m === 'SI' ? 'SI' : 'US';
  }
  function fam(name) { var f = UNIT_FAMILIES[name]; return f ? f[U()] : null; }
  // Round to `d` display decimals. At d = 0 this is String(Math.round(v)) and NOT
  // toFixed(0): they disagree on small negatives — Math.round(-0.18) is -0 and prints
  // "0", while (-0.18).toFixed(0) prints "-0". Leg ΔT genuinely sits there on a cold
  // plant, so the cheap-looking swap would have changed a US readout.
  function fmtNum(v, d) {
    if (v == null || !isFinite(v)) return null;
    return d > 0 ? v.toFixed(d) : String(Math.round(v));
  }
  // Format a base-unit value for display, in the active mode's unit and resolution.
  function fmtFam(name, v) {
    var m = fam(name);
    if (!m || v == null || !isFinite(v)) return null;
    return fmtNum(m.to(v), m.d);
  }
  // Shortest exact rendering of a display value, for prose (range hints, popover captions)
  // where a fixed decimal count would read as "0.0-13.6" or "1800.00 psi".
  function trimNum(v) {
    if (v == null || !isFinite(v)) return '';
    return String(Math.round(v * 1000) / 1000);
  }
  function dP(mpa) { return fmtFam('press', mpa); }          // pressure, MPa in
  function dT(c)   { return fmtFam('temp', c); }             // absolute temperature, °C in
  function dTd(c)  { return fmtFam('tempd', c); }            // temperature DIFFERENCE, °C in
  function dV(kpa) { return fmtFam('vac', kpa); }            // condenser vacuum, kPa in
  function dQ(gpm) { return fmtFam('flow', gpm); }           // flow, gpm in
  // The unit string for a family in the active mode. In US the AUTHORED string wins, so
  // this can never overwrite the board's own spelling — and switching back restores it.
  function uStr(name, authored) {
    var f = UNIT_FAMILIES[name];
    if (!f) return authored == null ? '' : authored;
    if (U() === 'SI') return f.SI.u;
    return authored == null ? f.US.u : authored;
  }

  // Which family each converting indication belongs to. Items absent from this map are
  // unit-neutral (%, ppm, MW, rpm, cps, DPM, pcm, A, rod steps) and never convert.
  var VALUE_UNIT = {
    ims3w1cb6jc: 'flow',  ims3w1lj7n6: 'press',  imrmstovyli: 'flow',  imrmsu1bl4r: 'press',
    imsgti1p0rm: 'flow',  imsgti0gnpf: 'flow',   ims5gq44zgr: 'temp',  imro6qpci2d: 'tempd',
    imrppyp0wfo: 'press', imrqzuhzre3: 'vac',    ims3xp168iy: 'vac',   imrr1gwi93j: 'press',
    imrr1hecwq7: 'temp',  imrr4fnxhlc: 'temp',   imrr4g29a7c: 'temp',  imrsgch20pv: 'temp',
    imrsgkz4lq0: 'flow',  ims31ngjkf8: 'flow',   ims3wm0d0bu: 'flow',
    imsgt98wjjc: 'temp'   /* SG sat temp — same family as its sibling imrr1hecwq7 */
  };

  // Editable-input valid ranges [min, max], in each box's family BASE unit — converted to
  // the active display unit by boundsFor(). The renderer clamps every setpoint box to these
  // and auto-corrects an out-of-range entry to the nearest bound (both min and max).
  // Sourced from the engine limits so a retune keeps the UI honest.
  var NUM_BOUNDS_BASE = {
    imro8rmka2y: [0, _ID.mwe_rated || 100],                          // generator load, MW (rated)
    imro8xhy2me: [0, 120 * GPM_FEED_PER_PCT],                        // SG feed, gpm (feed pump 0-120%)
    imro929i738: [0, 100],                                           // pzr spray, %
    imro96mj15p: [0, 100],                                           // pzr heater, %
    imrpq29jo7t: [0, 2500],                                          // boron target, ppm (channel sp.max)
    imrpq48hn3t: [0, CHARGING_MAX_GPM],                              // charging, gpm (0-60)
    imrsg8b7b9o: [0.1, _PZ.safety_open_mpa || 17.13],                // pressure setpoint: engine band
                                                                     //   0.1 MPa .. pzr safety (15..2484 psi)
    // Steam dump SETPOINT. The engine clips set_steam_dump_setpoint to
    // [0.2 MPa, sg_safety_open_mpa] — 30..1350 psi — so the box refuses anything the
    // engine would silently clamp. This is the secondary-cooldown control: lowering it
    // vents the SG down and cools the primary through it, and it also sets the no-load
    // bottom of the Tavg program (T_sat(steam_dump_setpoint), pwr_engine.js:1147).
    ims31tq7mgc: [0.2, _SG.sg_safety_open_mpa || 7.58],
    // ADV SP takes the SAME engine clip as the dump setpoint, and for the same
    // reason: set_adv_setpoint clamps to [0.2, sg_safety_open_mpa], so the box
    // refuses what the engine would silently clamp. Read from config, never a literal.
    bdAdvSp:     [0.2, _SG.sg_safety_open_mpa || 7.58],
    bdAfwThrottle: [0, 100],                                         // AFW flow control valves, % (#562)
    ims3xu86zm5: [0, 100],                                           // RHR HX flow split, %
    // Circulating-water inlet temperature — the modelled range (the engine clips to the
    // same band, so the box refuses what the engine would clamp).
    ims3v42jghn: [_TB.cw_inlet_min_c != null ? _TB.cw_inlet_min_c : 1.6667,
                  _TB.cw_inlet_max_c != null ? _TB.cw_inlet_max_c : 29.4444]
  };
  // Family per editable box, with optional per-mode overrides where the converted range
  // needs a different resolution than the family default. Charging is the one that does:
  // 0-60 gpm becomes 0-13.6 m³/h, and a whole-unit ▲▼ there would nudge 4.4 gpm at a time.
  var NUM_UNIT = {
    imro8xhy2me: { fam: 'flow' },
    imrpq48hn3t: { fam: 'flow', SI: { d: 1, step: 0.1 } },
    imrsg8b7b9o: { fam: 'press' },
    ims31tq7mgc: { fam: 'press' },
    bdAdvSp: { fam: 'press' },
    ims3v42jghn: { fam: 'temp' }
  };
  // The active display spec for an editable box: its family's mode entry, with any
  // per-box override applied. null for a unit-neutral box (%, ppm, MW).
  function numFam(item) {
    var n = NUM_UNIT[item && item.id];
    if (!n) return null;
    var base = UNIT_FAMILIES[n.fam][U()];
    var ov = n[U()];
    if (!ov) return base;
    var out = {}; for (var k in base) out[k] = base[k];
    for (var j in ov) out[j] = ov[j];
    return out;
  }
  // ▲/▼ nudge size overrides (the authored data step is a coarse default). Survives a
  // board-data regeneration, unlike editing the generated pwr_board_data.js by hand.
  // Both boxes here are unit-neutral, so these are absolute and outrank the family step.
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
    mwe_output: 2, turbine_rpm: 2, governor_valve: 2, steam_dump_valve: 2, adv_valve: 2,
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
  // Is FEED in automatic? Kernel channel when the plant has one; otherwise the engine's
  // own coupled-feed flag (PWR2's internal three-element controller, #506).
  function feedAutoOn(s) {
    var c = chan(s, 'feed_sg');
    if (!c && CS(s).feed_coupled !== undefined) return CS(s).feed_coupled === true;
    return !!(c && c.engaged);
  }
  // Automation channel by id (boron concentration seeking lives in the control layer).
  function chan(s, id) {
    var ch = s.automation && s.automation.channels;
    if (!ch) return null;
    for (var i = 0; i < ch.length; i++) if (ch[i].id === id) return ch[i];
    return null;
  }
  // ---- live channel status for the System Scanner (#214) --------------------------
  // Every automation channel carries a `note`: what it is doing, and when it stands
  // itself down, WHY. Nothing rendered it. The Automate tab that printed it was deleted
  // when the automations moved onto this board, so `ui/app.js`'s note line has been
  // unreachable ever since — and the notes are not decoration. MEASURED on the full
  // stack: press MAN on the feed card and feed_sg reads 'off — manual control taken';
  // isolate feedwater and it reads 'off — main feedwater isolated (AFW has the SGs)'
  // while the board shows nothing but a dark AUTO lamp and a lit MAN one. A player who
  // isolates feedwater watches their level controller drop out for no stated reason.
  //
  // Keyed by the board item that OWNS the channel, so hovering that control reports it.
  // Note the deleted line guarded on `on && c.note` — engaged only. That guard was
  // itself part of the defect: every note worth reading belongs to a channel that has
  // just stood DOWN. Disengaged channels are reported here deliberately.
  var ITEM_CHANNEL = {
    ims5glucngg: 'rods_tavg',                                                  // ROD AUTO
    imrqp6com2b: 'boron_conc', imrqp6avzkw: 'boron_conc',                      // boron ON / OFF
    imrpq29jo7t: 'boron_conc',                                                 // boron target ppm
    imrsgjmrjfg: 'feed_sg', imrsgjuh7l0: 'feed_sg', imrsgjwq1q0: 'feed_sg',    // feed AUTO / MAN / OFF
    imro8xhy2me: 'feed_sg',                                                    // SG feed rate setpoint box
    ims89lnqmip: 'feed_sg'                                                    // the corner status word itself
  };
  // ---- the SG FEED corner status word (#214) --------------------------------------
  // The one-word compression of what the scanner says in a sentence. Switched on CODES
  // (`stand_down`, `saturated`) rather than on the note's English — the note is prose
  // written for a human, and a UI that pattern-matched it would break silently the first
  // time someone reworded it.
  //
  // AMBER for everything that is not "the controller has this": a stood-down channel and
  // an operator-driven one are both states where nobody should assume level is being
  // regulated. SAT is the #210 case — engaged, at a rail, and unable to correct — which
  // reads AUTO on the lamp and is the most dangerous of the lot, because the lamp says
  // the controller has it and the controller does not.
  var BD_OK = '#5aad7c', BD_WARN = '#d8a657';
  // #358: TRUE when the feed DEMAND cannot be delivered — commanded pump speed is real
  // (> 10 %) while measured MAIN-FEED flow is ~zero. Reads `condensate_flow` (main feed
  // only, CONTEXT §6.3), NOT `fw_flow`, which is main + AFW — an AFW start would mask a
  // dead feed train behind its own delivery. The demand itself stays latched (#329: never
  // write the operator's demand); this only says the plant is not doing that number.
  // A cold pump start shows a brief honest amber (~8 s, feed_pump_tau) while flow ramps.
  function feedNoFlow(s) {
    var pct = CS(s).feed_pump_speed_pct || 0;
    var cond = IN(s).condensate_flow;
    return pct > 10 && cond != null && isFinite(cond) && cond < 0.02;
  }
  function feedStatus(s) {
    var c = chan(s, 'feed_sg');
    if (!c) {
      // No kernel channel: an ENGINE-OWNED feed controller (PWR2 — its three-element
      // SGWLCS lives in pwr2_feedwater). The corner used to read a permanent '—' here,
      // so a feedwater isolation and a working AUTO looked identical (#509 item 5).
      // Same words as the kernel path, read off the engine's own published state.
      var cs = CS(s);
      if (cs.mfw_isolated === true) return { text: 'ISOLATED', color: BD_WARN };
      if (cs.feed_coupled === true) {
        return feedNoFlow(s) ? { text: 'NO FLOW', color: BD_WARN }
                             : { text: 'HOLDING', color: BD_OK };
      }
      if (cs.feed_coupled === false) {
        return (cs.feed_pump_speed_pct || 0) <= 0
          ? { text: 'OFF', color: BD_WARN } : { text: 'MANUAL', color: BD_WARN };
      }
      return { text: '—', color: BD_WARN };   // an engine publishing neither: unknown
    }
    if (!c.engaged) {
      if (c.stand_down === 'condition') return { text: 'ISOLATED', color: BD_WARN };
      if (c.stand_down === 'scram' || c.stand_down === 'dead') return { text: 'TRIPPED', color: BD_WARN };
      // No recorded stand-down: the operator is simply driving it. Distinguish a pump
      // that is actually stopped, because "MANUAL" over a dead pump reads as though
      // someone is holding a feed rate when nothing is being fed at all.
      return (CS(s).feed_pump_speed_pct || 0) <= 0
        ? { text: 'OFF', color: BD_WARN } : { text: 'MANUAL', color: BD_WARN };
    }
    // #358, ahead of SAT: a dead train is the sharper fact than a railed controller. In a
    // blackout the channel spends ~10 minutes engaged, unsaturated and integrating against
    // a plant it cannot move — corner read HOLDING, box climbed 238 → 794 gpm, delivery
    // 1e-129. SAT HI still surfaces the #210 case whenever delivery is real.
    if (feedNoFlow(s)) return { text: 'NO FLOW', color: BD_WARN };
    if (c.saturated === 'hi') return { text: 'SAT HI', color: BD_WARN };
    if (c.saturated === 'lo') return { text: 'SAT LO', color: BD_WARN };
    return { text: 'HOLDING', color: BD_OK };
  }
  // ---- core ΔT margin (#311 observability) -----------------------------------------
  // Reports the BINDING limit — whichever of OTΔT / OPΔT is closest to zero — and names it.
  // Both channels are DERIVED instruments and are computed whether or not the trips are
  // installed, so this reads sensibly with `otdt_opdt_trips` off too: informational DNB /
  // overpower margin then, protection margin once the flag is on. It degrades to '—' rather
  // than throwing if the channels are absent, because a board that dies on a missing
  // instrument is worse than one that admits it.
  //
  // Colour is keyed to the ROD STOP line, not the trip line — amber means "the plant is
  // about to stop taking rods out", which is the thing the player can still act on. Red is
  // reserved for margin actually gone.
  function dtMargin(s) {
    var ot = IN(s).otdt_margin, op = IN(s).opdt_margin;
    if (ot == null || op == null || isNaN(ot) || isNaN(op)) return { text: '—', color: '#7f95a5' };
    var bindName = (op < ot) ? 'OPΔT' : 'OTΔT', bindVal = (op < ot) ? op : ot;
    var stop = ((RD.PWR_CONFIG && RD.PWR_CONFIG.otdt_opdt) || {}).rod_stop_offset_pct;
    if (stop == null) stop = 3.0;
    var col = bindVal <= 0 ? '#ff6a4d' : (bindVal < stop ? BD_WARN : BD_OK);
    return { text: bindName + ' ' + bindVal.toFixed(1), color: col };
  }

  // ---- the ROD status word: REMOVED, and why it is not coming back ------------------
  // #306 put a word in the ROD CONTROL card's top-right corner reading MANUAL / IN / OUT /
  // HOLDING / TRIPPED / AT LIMIT / BLOCKED. Withdrawn *(OWNER DIRECTIVE, 2026-08-03: "the
  // new rod control indication that says "manual", "in", "out, is redundant. when in rod
  // auto the withdraw or insert buttons glow amber when its automatically moving the rods.
  // remove it")*.
  //
  // It is redundant against indications that were ALREADY on the board, and the owner is
  // right about the mechanism: the IN-OUT lamps below light on `g.moving && g.direction`,
  // which is the identical predicate IN/OUT switched on — the same fact, twice, one of them
  // in a place the eye does not go. Every other state has its own home too:
  //
  //   MANUAL    the ROD AUTO lamp (ims5glucngg), dark when the channel is disengaged
  //   AT LIMIT  the ROD LIMIT LO / LO-LO annunciators (`rod_limit_approach`, `rod_limit`)
  //   BLOCKED   SUR HI (`sur_high`) for the 1.5 DPM startup-rate block, OTΔT/OPΔT ROD STOP
  //             (`otdt_approach`, `opdt_approach`) for the #311 rod stops, plus the
  //             interlock's own refusal message when the player presses WITHDRAW
  //   TRIPPED   the scram state and the rod bottom indication
  //   HOLDING   no lamp lit, which is what "holding" means
  //
  // So this is a DESIGN_CRITERIA Q4 removal — user complexity with no information behind
  // it. The card title stays shortened to 'ROD CONTROL' (DOC_PATCHES below): that patch was
  // made to free this corner, but it stands on its own and restoring 'REACTOR/' would be
  // churn for no gain.
  //
  // `rodWithdrawBlocked` went with it — it existed ONLY to compute the BLOCKED word. If a
  // future indication needs it, the shape worth restoring is the one that read the kernel's
  // published `interlocks` and matched on the BLOCKS list, rather than re-deriving the latch
  // from the instrument and the config table: the block engages on `setpoint` and clears on
  // `clears_below`, so a board-side copy would be a second implementation of a hysteretic
  // condition, which is the #294/#303 defect shape.
  // Module scope so selfTest can reach it — the driver object literal cannot call its
  // own methods from inside selfTest.
  function liveNoteFor(id, s) {
    var cid = ITEM_CHANNEL[id];
    if (!cid || !s) return null;
    var c = chan(s, cid);
    if (!c) return null;
    return { channel: cid, engaged: !!c.engaged, note: c.note || '',
             text: (c.engaged ? 'AUTO' : 'MANUAL') + (c.note ? ' — ' + c.note : '') };
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
  // ---- IN-OUT lamps and rod speed indication (#306) --------------------------------
  // A real Westinghouse board carries *"Rod speed indication and the IN-OUT lights"*
  // among its rod controls, and the lamps are the AUTOMATIC system's voice as much as
  // the operator's: *"In-and-out lamps on the control board indicate that rod motion has
  // been requested by either the IN-HOLD-OUT switch **or the reactor control unit**"*
  // (WTSM 8.1 §8.1.7.1/§8.1.7.2, ML11223A252). We had neither — the control WITHDRAW /
  // INSERT buttons carried no lit state at all, so with rod control in AUTO the only
  // evidence that anything was happening was the step count ticking.
  //
  // `direction` is +1 out / -1 in. SCRAM IS EXCLUDED DELIBERATELY: on a trip the rods
  // fall on gravity with the drive de-energized, which is not a demand from the switch
  // or from the reactor control unit, and lighting IN there would say the drive is
  // running when it has just been dropped.
  function rodDriving(s, dir) {
    var g = rodGroup(s, 'control_rods');
    return !!(g && g.moving && !g.scrammed && g.direction === dir);
  }
  // The speed the DRIVE is running at right now, or null when it is not driving. This is
  // the indication half of the SLOW/MED/FAST row; the row keeps its authored green for
  // the operator's own selection (`rodSpeed`) and takes the board's yellow "moving right
  // now" class for this. Two colours because they are two different facts: with the
  // channel in AUTO the speed it picks off its own error ladder is frequently NOT the one
  // the operator last selected, and painting the auto's choice green would read as though
  // their selection had been changed under them.
  function rodDrivingSpeed(s) {
    var g = rodGroup(s, 'control_rods');
    return (g && g.moving && !g.scrammed && g.speed) ? g.speed : null;
  }
  function pumpRec(s, id) {
    var p = (CS(s).pumps || []);
    for (var i = 0; i < p.length; i++) if (p[i].id === id) return p[i];
    return null;
  }

  // ================================================================ BUTTONS
  // Each entry: press(s) issues command(s); active(s) -> selected highlight.
  // ESF AUTO re-arm buttons by esf system id — consumed by buttonDisabled below (#503).
  var ESF_ARM_BUTTONS = { imrle1mc0lk: 'hpi', imrmssr9ihq: 'afw' };
  // The per-system latch lamps (#512): button id -> the control_state flag that holds it.
  // ECCS AUTO while safety injection is latched · AFW AUTO while the aux feed actuation is
  // latched · MFW RESTORE while feedwater isolation stands (either driver) · HEATER AUTO
  // while the NUREG-0737 shed latch stands.
  var ACTUATED_BUTTONS = { imrle1mc0lk: 'si_actuated', imrmssr9ihq: 'afas_actuated',
                           bdMfwRestore: 'fwi_actuated', imro969lnex: 'heaters_shed' };
  // Buttons that press an AUTOMATION CHANNEL by id — disabled when the running engine's
  // kernel carries no such channel (#506: the boron panel and rod AUTO on PWR2, whose
  // channels list is empty). Keyed off the snapshot, like every disable here.
  var CHANNEL_BUTTONS = { imrqp6com2b: 'boron_conc', imrqp6avzkw: 'boron_conc',
                          bdBoronSample: 'boron_conc', ims5glucngg: 'rods_tavg' };
  // Controls whose machinery is declared by a control_state field's PRESENCE: absent field =
  // the running engine has no such system (pwr always publishes these; #506).
  var RHR_BUTTONS = { ims3wg27iif: 1, ims3xfeye1q: 1 };

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
    // ALIGN/ISOLATE rather than START/STOP. The hot-leg suction valve has TWO interlock
    // setpoints (#288): the engine REFUSES the open above emergency.rhr_valve_interlock_mpa
    // (2.76 MPa / 400 psi) and force-closes a standing-open valve only above the separate
    // emergency.rhr_autoclose_mpa (4.14 MPa / 600 psig). active() reads the true valve
    // state — a refused press visibly fails to latch instead of lying about the lineup.
    // NOT the HPI triad — RHR is ALIGN/ISOLATE ONLY, with no AUTO (#453). RHR used to carry
    // an ESF arm because an actuation opened the suction valve by itself once the plant was
    // scrammed and depressurized. No plant does that (WTSM 5.1 §5.1.3.3: the interlocks
    // "prevent the valves from being opened unless…"; NUREG-1431 SR 3.4.14.2/.3 test
    // "prevents from being opened" and "causes to close" as separate functions), so the
    // actuation is gone — and with nothing left to arm, an AUTO button would light for a
    // state that gates nothing. That is the orphan control DESIGN_CRITERIA Q4 vetoes, so the
    // button is removed via DOC_REMOVE and the two survivors take its slot via DOC_PATCHES.
    // `active()` still reads the TRUE valve state, so a refused press visibly fails to latch
    // instead of lying about the lineup.
    ims3wg27iif: { press: function () { cmd({ action: 'set_rhr', active: true }); }, active: function (s) { return !!IN(s).rhr_valve_open; } },
    ims3xfeye1q: { press: function () { cmd({ action: 'set_rhr', active: false }); }, active: function (s) { return !IN(s).rhr_valve_open; } },
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
    // The IN-OUT lamps (#306): yellow while the bank is actually being driven that way,
    // whoever asked — an operator hold, a tap, or the rod channel in AUTO. See rodDriving.
    imrpk6qzjq8: { hold: { group: 'control_rods', direction: 1 },
                   warn: function (s) { return rodDriving(s, 1); } },
    imrpk79mwng: { hold: { group: 'control_rods', direction: -1 },
                   warn: function (s) { return rodDriving(s, -1); } },
    // SLOW/MED/FAST is now BOTH a selector and an indication (#306). Green = the speed the
    // operator selected for their own rod motion; yellow = the speed the drive is running
    // at this instant, which under AUTO comes off the channel's error ladder.
    imrpk8169ds: { press: function () { rodSpeed = 'slow'; }, active: function () { return rodSpeed === 'slow'; },
                   warn: function (s) { return rodDrivingSpeed(s) === 'slow'; } },
    imrpk8grvcz: { press: function () { rodSpeed = 'normal'; }, active: function () { return rodSpeed === 'normal'; },
                   warn: function (s) { return rodDrivingSpeed(s) === 'normal'; } },
    imrpk8kjsjs: { press: function () { rodSpeed = 'fast'; }, active: function () { return rodSpeed === 'fast'; },
                   warn: function (s) { return rodDrivingSpeed(s) === 'fast'; } },
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
    // --- ADV: AUTO / OPEN / CLOSE (#371). Same verbs as the dump above, because it
    // is the same kind of valve doing the same job to a different sink — one idiom
    // for both steam paths. Ships in AUTO, so AUTO is lit on a fresh plant — same as
    // the dump above (2026-08-06; it shipped SHUT, with CLOSE lit, until then).
    bdAdvAuto:  { press: function () { cmd({ action: 'set_adv', mode: 'auto' }); },   active: function (s) { return CS(s).adv_auto; } },
    bdAdvClose: { press: function () { cmd({ action: 'set_adv', mode: 'closed' }); }, active: function (s) { return !CS(s).adv_auto && (CS(s).adv_pct || 0) <= 50; } },
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
    // TURBINE LATCH / TRIP (#551/#559/#567) — this pair was FOLLOW / MAN, a dispatch-MODE
    // selector, and PWR2 publishes `load_modes: ['manual']`: one mode, always in it. FOLLOW was
    // already dark and MAN was LIVE and emitted TWO REFUSED commands per press (`connect_grid`
    // then `set_load_mode`), so the operator's only route back onto the grid after a trip was a
    // button that could do nothing but throw — while the real gap was that NO command in the
    // whole registry un-latched the turbine (896 combinations, measured).
    //
    // The pair now carries the two real operator actions, in the plant's own vocabulary [WTSM
    // 11.3, ML11223A295: "if the turbine is LATCHED (not tripped)"]. LATCH left, TRIP right —
    // the START/STOP order every other panel on this board uses.
    // `active()` reads the TRUE latch state, so a refused LATCH visibly fails to take rather
    // than lying about the lineup, and the refusal now names what is holding the trip.
    // *(OWNER RULING, 2026-08-27: selected "Replace the pair with LATCH / TRIP" over keeping
    // the dispatch pair darkened beside a third button — a menu selection, cited in that form.)*
    // FOLLOW comes back for free if #529 ever builds load following: it returns as its own
    // control gated on the same `load_modes` capability that used to darken this one.
    imro8ktzs3u: { press: function () { cmd({ action: 'latch_turbine' }); }, active: function (s) { return !IN(s).turbine_tripped; } },
    imro8lddxi: { press: function () { cmd({ action: 'trip_turbine' }); }, active: function (s) { return !!IN(s).turbine_tripped; } },
    imro8len0oi: { press: function () { cmd({ action: 'disconnect_grid' }); }, active: function (s) { return !!IN(s).turbine_tripped || CS(s).load_mode === 'disconnected'; } },
    // --- SG feed pump: AUTO / MAN / OFF ---
    // AUTO = the three-element feedwater channel (feed_sg), which is the plant's real feed
    // automation and the free-play default. (The board used to read feed_auto_coupled, a
    // legacy load-coupling flag that is OFF at the preset start, so AUTO looked like MAN even
    // though feed_sg was running.) A manual pump command drops feed_sg to MAN via its override.
    // With no feed_sg KERNEL channel but a published feed_coupled, the engine carries its
    // own three-element controller (PWR2's WTSM 11.1 build) — AUTO engages THAT, and the
    // lamp reads it. Without this fallback, PWR2's board had no route back to auto feed
    // (#506: set_auto_channel against an empty channels list is a refused no-op).
    imrsgjmrjfg: { press: function (s) {
        if (!chan(s, 'feed_sg') && CS(s).feed_coupled !== undefined) cmd({ action: 'set_feed_coupled', active: true });
        else cmd({ action: 'set_auto_channel', channel_id: 'feed_sg', engaged: true });
      }, active: feedAutoOn },
    imrsgjuh7l0: { press: function (s) { cmd({ action: 'set_feed_pump_speed', pct: CS(s).feed_pump_speed_pct || 100 }); }, active: function (s) { return !feedAutoOn(s) && (CS(s).feed_pump_speed_pct || 0) > 0; } },
    imrsgjwq1q0: { press: function () { cmd({ action: 'set_feed_pump_speed', pct: 0 }); }, active: function (s) { return !feedAutoOn(s) && (CS(s).feed_pump_speed_pct || 0) === 0; } },
    // MFW RESTORE (#341 / #319 item 2). Lights while main feed IS isolated — i.e. while it
    // is the control that has something to do — and is dark the rest of the time, which is
    // the whole board's idiom for "this is the live one".
    //
    // It is NOT disabled while the isolation signal still stands, and that is the point.
    // The control layer refuses it with a labelled SEAL_IN message (WTSM 12.3.2.3, "the
    // control room operator cannot interrupt … until the reset logic is satisfied"), and a
    // refusal the player can read teaches why they cannot restore feed yet. A greyed-out
    // button teaches nothing and is indistinguishable from a broken one — this repo's
    // recurring dead-control failure mode, which is what the ACTION_LOCKED refusal above
    // was written for.
    // WARN, not ACTIVE (#350 item 8). It lit green while main feedwater was isolated, and the
    // board's green means "this mode is SELECTED" — so a button whose whole job is to clear a
    // condition read as though the condition were the chosen lineup. Yellow is the board's
    // "needs attention", which is what an isolated main feed is.
    //
    // This is the visible half of item 8's *"could not place it in auto"*. MEASURED full
    // stack, turbine trip at 120 s: `mfw_isolated` latches by 4m00s, the SG FEED corner reads
    // ISOLATED, the `feed_sg` channel stands down on it and refuses AUTO — all correct, and
    // all of it unfixable from the card unless the operator notices that RESTORE is the way
    // out. The refusal is right; the signposting was not.
    bdMfwRestore: { press: function () { cmd({ action: 'isolate_feedwater', active: false }); },
                    warn: function (s) { return !!IN(s).mfw_isolated; } },
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
    // 455/470, the coordinates the deleted REACTIVITY pair occupied (see DOC_REMOVE) — item 5
    // asks for the readout to move UP into that slot, not for a gap where it used to be.
    // RCP FLOW, under the RCP card *(OWNER DIRECTIVE, 2026-08-04: "RCP needs flow indication.
    // place it under the RCP card.")*, #350 item 17. It reads the `rcs_flow` elbow-tap channel,
    // the same instrument the low-flow reactor trip acts on — so the player can watch the
    // number the trip is watching, which nothing on the board previously showed.
    //
    // It is not a duplicate of the RCP ON/OFF lamps: those are the BREAKER, this is FLOW, and
    // the whole of #325 lives in the gap between them — stop the pumps and the lamps go dark
    // while this settles at ~4 % of rated on natural circulation rather than at zero.
    //
    // GEOMETRY, measured off the doc: the RCP tile is 1125,570 112x86 and its inner box
    // 1140,585 85x95 (bottom 680); the CVCS LETDOWN readout below starts at 1150,725. So
    // 1140..1230 x 684..722 is empty, and a 90x38 readout at (1140, 684) sits in it.
    // PZR SPRAY flow *(OWNER DIRECTIVE, 2026-08-04: "Pressurizer needs a spray flow
    // indication.")*, #350 item 1. DELIVERED spray, not the valve demand the % box beside it
    // already carries — see `spray_flow_pct` in pwr_pressurizer.js for why they are different
    // quantities. MEASURED full stack: spray commanded to 100 % with the RCPs running reads
    // 100 % delivered; stop the RCPs and the demand is unchanged at 12.00 while this reads
    // 4.45, because the spray line draws its motive head from the loop.
    //
    // GEOMETRY, and the first placement was WRONG in exactly the way authored coordinates
    // always are here. It went in the PRESSURIZER SPRAY PANEL under the demand box, on the
    // arithmetic that three 25 px buttons end at 725 and a number is ~26 px tall. MEASURED,
    // the demand box renders 730..777 — 47 px, because it carries ▲▼ nudge arrows — so the
    // readout overlapped it by 80x20 px. Both elements still rendered; only a ruler finds it.
    //
    // It sits beside the pressurizer instead, as part of the PZR TEMP / HTR PWR stack, which
    // is where a pressurizer indication belongs anyway. #350 put it BELOW that stack at
    // 1065,510 and the owner moved it again *(OWNER, 2026-08-04, #357: "remove the pressurizer
    // spray flow indication from on top of the pressurizer card … put it above PZR TEMP
    // indication to the right of the pressurizer")* — at 510 it printed across the vessel's
    // lower dome, which a free-slot scan cannot see, because the pressurizer TILE is 108 px of
    // box around a much narrower piece of art and every scan treats the tile as solid. That is
    // also why the first scan for this new position returned ZERO slots: excluding `component`
    // tiles from the obstacle set (their art is caught by the path/polyline pass) is what makes
    // the column measurable at all. PZR TEMP and HTR PWR both live inside that same tile.
    //
    // 1088,348 at 90x38 — MEASURED clear, zero clashes against every rendered rect and every
    // art path. The band is genuinely tight: the quench-tank box ends at y 340, PZR TEMP starts
    // at 395, the surge-line pipe occupies x ≤ 1085 and the STEAM card box starts at x 1180.
    // 95 wide does NOT fit (it clips the STEAM card); 90 does, with 2 px to spare.
    // Feed controller status, in the SG FEED card's top-right corner (#214). The AUTO/MAN
    // lamps say THAT the controller is off; nothing said WHY. Same shape as the steam dump
    // status (imrppq5r7kw): rAnchor, so `left` is the RIGHT edge.
    //
    // It fits only because DOC_PATCHES shortens the card title to 'SG FEED'. MEASURED: the
    // full 'STEAM GEN FEED' runs to x=1812, and the longest status word (ISOLATED, 73 px at
    // fontSize 15) has to start at 1782 — a 30 px overlap. Owner's call, 2026-07-31: "you
    // could shorten STEAM GEN to SG and fit it in the corner just like steam dump."
    // MFW RESTORE (#341 / #319 item 2). Main feedwater isolation LATCHES — measured, a
    // turbine trip isolates it by 4m00s and it stays isolated with AFW as the only feed
    // for as long as you watch. Every one of the three isolation signals is automatic and
    // there was NO control anywhere in `ui/` to clear it, so the player could enter that
    // state and not leave it. WTSM 11.1.4 (ML11223A293) lists the four overrides of SG
    // level control and the first is "Manual control by the operator" — this is that one.
    //
    // The INDICATION already existed and this is deliberately not a second one: the SG FEED
    // corner status word reads ISOLATED, because the `feed_sg` channel stands down on
    // `mfw_isolated` (pwr_control.js offWhen). Adding an MFW lamp beside it would be Q4
    // duplicate authority for a fact already on the card.
    //
    // GEOMETRY, measured off the doc rather than eyeballed: the SG FEED card is
    // 1665,545 195x140; the row at y=600 holds only the feed-rate number, which is
    // rAnchor-free and starts at x=1740 with width 105. So 1670..1735 at y 600..625 is
    // empty, and a 55x25 button at (1670, 600) sits in it flush under AUTO and takes the
    // authored button idiom exactly. Nothing is moved to make room.
    // ---------------------------------------------------------- ADV card (#371)
    // ATMOSPHERIC DUMP VALVES — the steam path that does NOT need the condenser,
    // and the only way to cool down after a loss of vacuum or an SBO. It has to be
    // reachable on the board, not by command only.
    //
    // GEOMETRY — MEASURED, and the first attempt was rejected on sight. A 195x135
    // card below the right-hand column looked free to a scan (the canvas is a fixed
    // 2400x1600 while content ends at y 855) but it EXTENDED THE CONTENT BOUNDS, and
    // the board scales to fit its column, so every other tile shrank to make room
    // for it *(OWNER, 2026-08-05: "That atmos dump card is unacceptable. It is out of
    // bounds of the original diagram and now makes the whole diagram too small. We
    // need to fit it inside the current boundaries.")*. A free-rectangle scan over the
    // whole content box then found exactly ONE usable gap — 90x115 at (1575, 490),
    // under the cooling tower, between the condensate pump and the polisher status —
    // which is where the owner said to look.
    //
    // WHAT IT CARRIES, and what it deliberately does not. The triad + setpoint +
    // position + status the STEAM DUMP card uses does not fit in 90 px and does not
    // need to *(OWNER: "Does it need all those controls?")*. The SETPOINT is the
    // control that matters: a cooldown is walked DOWN by setpoint, and at full open
    // this valve cools about three times faster than the technical-specification
    // limit, so "just open it" is the wrong lesson to make easy. OPEN is therefore
    // dropped — lowering the setpoint is how you open it — and the status word is
    // dropped because the position readout beside it says the same thing. What is
    // left is AUTO / SHUT, the setpoint box, and position.
    // AUTO must be #5aad7c — selfTest asserts every button captioned AUTO carries the
    // standard green, so one colour keeps one meaning across the board.
    /* THE REACTIVITY / PERIOD CARD (#516 item 4, owner playtest 2026-08-29: "Move period
     * indication up a little so it looks intentional and put a card behind it").
     *
     * MEASURED off the doc, not eyeballed. The NUC INSTR (NIS) card is 530,190 255x225, so it
     * ENDS at y 415 — exactly where the REACTIVITY label begins. The reactivity and period
     * readouts were therefore floating on bare canvas immediately under a card, which is what
     * makes them read as unintentional. Its two inner boxes (535,345 and 660,345) are both
     * 120x65, so a 120-wide box at left 660 aligns with the right-hand one directly above it.
     *
     * 660,412 120x72 covers REACTIVITY (675,415), the reactivity value (right edge 750, top
     * 430), PERIOD (690,450) and the period value. Clear of PZR TEMP (880,440), the t-hot
     * value (745,505) and the surge component (830,520).
     *
     * IT MUST BE A `box`: pwr_board.js lifts value/text/number/button to z-index 1 and leaves
     * boxes at 0, so an appended box lands BEHIND the readouts. Any lifted kind here would
     * cover them. */
    { id: 'bdReactivityCard', kind: 'box', name: '',
      left: 660, top: 412, width: 120, height: 72,
      bg: '#0b1119', border: '#25333e', radius: 8, title: '', fontSize: 10, ports: [], stick: false },
    { id: 'bdAdvAuto', kind: 'button', name: 'ADV auto  ·  sim: set_adv mode:auto',
      left: 1351, top: 458, label: 'AUTO', width: 44, height: 22, color: '#5aad7c', fontSize: 11 },
    { id: 'bdAdvClose', kind: 'button', name: 'ADV shut  ·  sim: set_adv mode:closed',
      left: 1398, top: 458, label: 'SHUT', width: 44, height: 22, color: '#ffd166', fontSize: 11 },
    { id: 'bdAdvSp', kind: 'number', name: 'ADV SET POINT  ·  sim: set_adv_setpoint',
      // No `unit` on the tile: the derived range hint above the box already names it
      // ("29-1350 psi" / "0.2-9.31 MPa"), and in 90 px of card the suffix cost the
      // input 20 px it needed — measured, "1247" overflowed a 32 px field by 12 px.
      left: 1351, top: 488, label: 'ADV SP', width: 90, value: 1247, step: 1, digits: 0,
      editable: true, color: '#4fe3ff', fontSize: 12 },
    // AUX FEED THROTTLE (#562) — the flow control valves, the operator's own continuous
    // post-trip task. SOURCED, WAT 05 Transients (ML11216A094): "It is necessary to throttle
    // AFW flow to control RCS temperature at this point. One symptom that AFW flow needs to be
    // throttled is closure of all steam dump valves."
    //
    // THE BOARD HAD NO SURFACE FOR IT AT ALL, and the handler for one already existed:
    // ui/app.js's 'afw-flow-set' emits `set_afw_flow {pct}` and NO DOM element emitted it. The
    // plant had no throttle either, so the dead handler was matched by a dead command — measured
    // full-stack, a loss of offsite power reached 861.7 % of nominal SG inventory with the
    // player holding no lever at all.
    //
    // GEOMETRY, measured off the doc rather than authored: AUX FEED WATER (imrmssto6d) is
    // 1455,650 195x60 with its button row at 680..705, so the card is FULL and this row does
    // not fit in it. DOC_PATCHES below grows the card to h100 (ends 750) and moves CONDENSER
    // COOLING and its three children down 40 px (715->755, ends 825); nothing else lives in
    // that column below 785, measured. The row then mirrors the CONDENSER COOLING row exactly
    // — caption at 1464, 90 px number at 1550 — so the two cards read as one family.
    //
    // ONE CONTROL, NOT THREE. The engine has a switch per pump [sourced, Ginna TS Bases
    // B 3.3.2(a) "one switch for each pump"] and `set_afw {pump}` reaches either, but this
    // plant has ONE steam generator and the board has ONE aux feed panel: two more pump
    // buttons would be two controls the player cannot tell apart, which is the Q4 veto in
    // DESIGN_CRITERIA. STOP already secures both pumps since #541, which is what that issue
    // asked for. The per-pump discriminator stays a command-surface capability for the
    // instructor and scenarios.
    { id: 'bdAfwThrottle', kind: 'number',
      name: 'AUX FEED THROTTLE  ·  sim: set_afw_flow pct',
      left: 1550, top: 710, label: 'THROTTLE', width: 90, value: 100, step: 5, digits: 0,
      unit: '%', editable: true, color: '#4fe3ff', fontSize: 12 },
    { id: 'bdAdvPct', kind: 'value', name: 'ADV position  ·  sim: instruments.adv_valve, % open',
      // rAnchor — `left` is the RIGHT edge for a value tile. Measured the hard way:
      // left-anchored at 1579 it rendered 12 px OUTSIDE the card's left border.
      left: 1440, top: 540, value: '0', unit: '%', color: '#5aad7c', fontSize: 12, rAnchor: true },
    { id: 'bdMfwRestore', kind: 'button',
      name: 'Main feedwater restore  ·  sim: isolate_feedwater active:false',
      // WIDTH 68, not the 55 the row above uses (#357). MEASURED at the pinned 1400x900 harness
      // viewport: "RESTORE" renders 55.99 px against a 51.92 px box — it overflowed by 4.07 px,
      // i.e. 4.31 authored px, because it is the only caption on this card longer than four
      // characters and it inherited the AUTO/MAN/OFF button width. 68 authored px gives the 12 px
      // mono caption 64 px of content box against 59.3 px of text. The feed-rate number moves
      // right to 1750 with it (DOC_PATCHES below) — the other half of this fix, and the two must
      // stay together or the button lands on top of the number.
      //
      // 2026-08-05: (1670, 600) was inside the OLD SG FEED card, which spanned x 1595-1855.
      // The re-export moved that card to `imrqxsodu5j` at 1455-1650, leaving this button
      // 20 px off its right edge *(OWNER, 2026-08-05: "steam press indication, and restore
      // are off to the right")*. MEASURED for the new card: the AUTO/MAN/OFF row fills
      // 1460-1645 at y 535, the feed-rate number occupies 1530-1635 at y 560, and the STEAM
      // FLOW / FEED FLOW rows start at 595 — so the only rectangle that takes a 68x25 button
      // is 1460-1528 x 560-585, immediately LEFT of the feed-rate number. That is also where
      // it belongs: the note above says the button and the number must stay together, and
      // side by side is a stronger form of together than the stacked pair they were before.
      left: 1460, top: 560, label: 'RESTORE', width: 68, height: 25, color: '#8ba4b6', fontSize: 12 },
    // (The ROD CONTROL card's top-right corner held a rod controller status word here from
    // #306 until 2026-08-03, when the owner removed it as redundant against the IN-OUT
    // lamps. The reasoning, and where each of its states is still shown, is at the
    // `rodStatus` removal note above. The corner is free; the card title stays short.)
    // Core ΔT margin, in the NIS card's top-right corner (#311 observability). The OTΔT and
    // OPΔT trips are computed from a setpoint that MOVES with Tavg and pressure, so without
    // this the player carries two reactor trips and a rod-withdrawal block driven by a number
    // they cannot see — reachable on the board, but with nothing visible changing until the
    // 3 %-out annunciator. That is a DESIGN_CRITERIA Q3 observability failure.
    //
    // ONE readout, not the five channels that exist (ΔT, two setpoints, two margins), and the
    // board being FULL is only half the reason. Measured 2026-08-03: the diagram extent is
    // x 540..1945 / y 110..849 and it has NO free 150x60 slot — every candidate the scan
    // returned was an edge artifact running off the right boundary. But the Q3 argument is
    // independent of that: leg ΔT is ALREADY displayed (imro6qpci2d, °F), so `loop_delta_t`
    // in % of rated would be a second copy of one measurement, and each setpoint is implied
    // by its margin. A margin that moves while ΔT holds steady IS the moving trip line, which
    // is the whole OTΔT lesson.
    //
    // It names the BINDING limit rather than combining them, because the two protect
    // different things — OTΔT is DNB, OPΔT is linear heat rate — and which one is closing is
    // the diagnosis. Corner idiom and geometry copied from bdRodStatus/bdFeedStatus: rAnchor,
    // so `left` is the RIGHT edge, card right minus 5; `top` is card top plus 13.
    { id: 'bdDtMargin', kind: 'value',
      name: 'Core ΔT margin to the nearer of the OTΔT / OPΔT trip lines  ·  sim: in.otdt_margin / in.opdt_margin, % of rated ΔT',
      // top 234, NOT the 243 copied from bdRodStatus. MEASURED: at 243 the rendered box runs a
      // few px into the 'STARTUP RATE' label below it (870-966 x 260-277) — a real collision
      // that authored-coordinate arithmetic said could not happen, which is the rAnchor trap
      // CLAUDE.md documents. Both elements still render, so only the ruler in board_check
      // finds it. 234 sits in the card's title band, clear to the RIGHT of the title text
      // ('NUCLEAR INSTRUMENTATION (NIS)' ends near x=905 at fontSize 11).
      //
      // The unit is '%' *(OWNER DIRECTIVE, 2026-08-04: "Add unit to OP(delta)T indication")*,
      // #350 item 4. The number is a margin in PERCENT OF RATED ΔT — the same scale the trip
      // setpoint is authored on — and unlabelled it read as a bare figure that could as easily
      // have been °F or MW. See dtMargin() for why the readout names the binding limit.
      //
      // 2026-08-05: (990, 234) was the old NIS card's top-right corner. The re-export moved
      // that card from x 870-995 to `ims175lciah` at 530-785, leaving this tile stranded on
      // the schematic where it landed on the PORV tailpipe and saturation-temperature tags.
      // Re-derived from the SAME corner idiom rather than dragged to the nearest gap: card
      // right 785 minus 5 = 780, card top 190 plus 10 = 200. MEASURED clear both ways — the
      // 'NUC INSTR (NIS)' title is 15 characters of 11 px mono ending near x 637, and the
      // SOURCE RANGE / STARTUP RATE boxes below start at y 220.
      left: 780, top: 200, value: '—', unit: '%', color: '#5aad7c', fontSize: 13, rAnchor: true }
  ];

  // ================================================================ NUMBERS (editable)
  // set(v): issue command from the typed value; get(s): reflect current sim state.
  // BOTH WORK IN THE BOX'S BASE UNIT (see NUM_BOUNDS_BASE) — the display-unit conversion
  // happens once, in the driver's onNumber/numberFor, so a formatter here never has to
  // know which unit the operator is looking at.
  var NUMBERS = {
    /* GENERATOR LOAD — the spinner reads the operator's DEMAND, not the ramping reference
     * *(OWNER DIRECTIVE, 2026-08-11: "The generator load increase button doesn't let the
     * user go up more than one press due to the rate increase limit. Let the user raise to
     * the desired level before starting the climb/rate limit.")*.
     *
     * It used to read `load_target_mwe`, the EHC reference that climbs at
     * load_rate_pct_per_min. So each press computed "current + 1" from a number the ramp
     * was still moving, and a second press a moment later started from almost the same
     * place — the demand could never get ahead of the ramp, which is exactly what dialling
     * a target IS. Reading `load_cmd_mwe` lets the operator set 100 MW in ten presses and
     * then watch the machine walk there at its own rate, which is how a real EHC thumbwheel
     * behaves. The RATE LIMIT IS UNTOUCHED — this changes what the control reads, not how
     * fast the plant may move. Falls back to the reference before any load is set. */
    imro8rmka2y: { set: function (v) { cmd({ action: 'set_load_target', mwe: v }); },
      get: function (s) { var c = CS(s); return c.load_cmd_mwe != null ? c.load_cmd_mwe : c.load_target_mwe; } },   // Generator Load MW
    /* A SETPOINT BOX READS BACK THE SETPOINT, NOT THE DELIVERY (#516 item 1, 2026-08-29).
     * `feed_pump_speed_pct` is the DELIVERED feed fraction, behind the feed pump lag — the
     * retired engine published this channel as the COMMANDED value until 2026-07-25 and this
     * box was authored against that convention. Reading the delivery makes every arrow click
     * re-anchor the demand onto a lagging number: measured, eight +1 gpm clicks moved the box
     * +0.5 gpm. `feed_demand_pct` is the plant's own demand; the delivered channel stays where
     * it is for the five reader tiles, and is the fallback for anything not publishing it. */
    imro8xhy2me: { set: function (v) { cmd({ action: 'set_feed_pump_speed', pct: v / GPM_FEED_PER_PCT }); }, get: function (s) { var c = CS(s); var d = c.feed_demand_pct; return ((d != null && isFinite(d)) ? d : (c.feed_pump_speed_pct || 0)) * GPM_FEED_PER_PCT; } }, // SG Feed rate gpm
    imro929i738: { set: function (v) { cmd({ action: 'set_spray', pct: v }); }, get: function (s) { return CS(s).spray_valve_pct; } },                    // spray %
    imro96mj15p: { set: function (v) { cmd({ action: 'set_heater', power_pct: v }); }, get: function (s) { return CS(s).heater_power_pct; } },             // heater %
    imrpq29jo7t: { set: function (v) { cmd({ action: 'set_auto_setpoint', channel_id: 'boron_conc', value: v }); }, get: function (s) { var c = chan(s, 'boron_conc'); return c && c.setpoint != null ? c.setpoint : null; } }, // boron target ppm (control-layer channel setpoint)
    imrpq48hn3t: { set: function (v) { cmd({ action: 'set_charging_flow', normalized: v / GPM_CHARGING }); }, get: function (s) { return (CS(s).charging_flow_normalized || 0) * GPM_CHARGING; } }, // charging, gpm base (clamped to NUM_BOUNDS_BASE)
    imrsg8b7b9o: { set: function (v) { cmd({ action: 'set_pressure_setpoint', mpa: v }); }, get: function (s) { return CS(s).pressure_setpoint || 0; } }, // plant pressure setpoint
    // Steam dump setpoint — the secondary-cooldown handle. Sits directly under the
    // STEAM PRESS indication on the card so the gap between the two is legible: at power
    // the SG runs ~819 psi against a 1194 psi setpoint, which is WHY the dump is shut.
    ims31tq7mgc: { set: function (v) { cmd({ action: 'set_steam_dump_setpoint', mpa: v }); }, get: function (s) { return CS(s).steam_dump_setpoint || 0; } },
    bdAdvSp:     { set: function (v) { cmd({ action: 'set_adv_setpoint', mpa: v }); },        get: function (s) { return CS(s).adv_setpoint || 0; } },
    // AUX FEED THROTTLE (#562). `pct` is the field control_kernel declares for this action,
    // CONTEXT.md names (afw_throttle_pct) and the manual documents — and until 2026-08-27
    // pwr2_shell read only `c.normalized`, so `{pct: 0}` fell to its `: 1` default and
    // RE-STARTED the pump. The readback is the VALVE POSITION, not the delivered flow: the
    // AFW FLOW gauge on the other card is the delivery, and the two disagreeing is how the
    // player sees a shut block valve or a dead motor. Engine-agnostic by construction — any
    // engine publishing afw_throttle_pct gets the box, which is the buttonDisabled law.
    bdAfwThrottle: { set: function (v) { cmd({ action: 'set_afw_flow', pct: v }); },
                     get: function (s) { var v = CS(s).afw_throttle_pct; return v == null ? 100 : v; } },
    // RHR heat-exchanger flow split, % — the cooldown-RATE knob (Q_rhr scales with it,
    // pwr_thermal.js:90-93). Deliberately NOT an alignment command: the control layer
    // excludes set_rhr_hx from the 'rhr' ESF arm's disarming command list, so trimming
    // the rate does not drop the auto-alignment (pwr_control.js:556-558). numberAuto()
    // therefore leaves this box editable even while RHR AUTO is lit.
    ims3xu86zm5: { set: function (v) { cmd({ action: 'set_rhr_hx', pct: v }); }, get: function (s) { var f = CS(s).rhr_hx_fraction; return f == null ? 100 : f * 100; } },
    // Circulating-water inlet temperature. Sits next to the COND VAC readout because
    // vacuum is the variable it moves: raise the water temperature and the condenser can
    // only pull down to a warmer saturation, so vacuum falls, output falls at the same
    // steam flow, and the 74.5 kPa turbine trip gets closer. It also raises the RHR heat
    // exchanger's sink, so a Mode 5 cooldown bottoms out warmer.
    ims3v42jghn: {
      set: function (v) { cmd({ action: 'set_condenser_cw_temp', c: v }); },
      get: function (s) { var c = CS(s).cw_inlet_temp_c; return c == null ? null : c; }
    }
  };

  // ================================================================ VALUES (indications)
  // fn(s) -> display text (unit stays as authored on the item).
  var VALUES = {
    // --- ECCS (merged HPI/LPI): ONE pump on a dedicated RWST-sourced train (owner ruling
    //     2026-07-22, pwr_primary.js:56-60) — NOT the charging pump doing double duty, which
    //     is what justifies the two systems reading on different flow scales. ---
    ims3w1cb6jc: function (s) { return dQ((IN(s).hpi_flow || 0) * GPM_HPI); },   // ECCS flow (true hpi_flow)
    ims3w1lj7n6: function (s) { return dP(IN(s).hpi_discharge_pressure || 0); },  // ECCS discharge (true pump head)
    // Which alignment that one pump is in: RHR when the hot-leg suction valve is open, else
    // HPI/LPI by pressure regime, else off (pwr_engine.js:320). This is the readout that
    // makes the single-pump/two-suctions arrangement legible on the board.
    // CS, not IN: the engine publishes eccs_mode in control_state only (pwr_engine.js:592) —
    // reading instruments here left the readout at 'OFF' forever, including the shipped
    // Mode 5 lineup that spawns RHR-aligned (#235).
    ims3w61jjbi: function (s) { return String(CS(s).eccs_mode || 'off').toUpperCase(); },
    // AFW flow (true afw_flow). THE FULL SCALE COMES FROM THE PLANT (#557): `afw_flow` is
    // normalized 1.0 at the running plant's own AFW rating, and the two shipped plants do not
    // share a basis — the retired engine normalizes on RATED FEED (1.0 = 640 gpm, full AFW
    // being 0.15 of it = 96 gpm), PWR2 on AFW's own sourced rating (1.0 = 86.2 gpm). Holding
    // the retired basis as a literal here made the gauge read 213 gpm against 28.8 gpm
    // delivered on PWR2, 7.40x, with charging and letdown beside it literal to 1 % so nothing
    // cued the operator. GPM_AFW survives as the fallback for a snapshot that publishes no
    // scale — an old recording replayed through this driver, where the retired basis is right
    // by construction. An engine BRANCH here would have been the wrong shape: this file is
    // deliberately engine-agnostic and would rot again at the next plant.
    imrmstovyli: function (s) { return dQ((IN(s).afw_flow || 0) * (CS(s).afw_flow_gpm_full || GPM_AFW)); },
    imrmsu1bl4r: function (s) { return dP(IN(s).afw_discharge_pressure || 0); },  // AFW discharge (true pump head)
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
    // PORV position light — the COMMANDED state, not the disc. This is the TMI-2 lie: it
    // reads CLOSED while a stuck valve keeps venting, and the tailpipe temperature below is
    // the only honest tell. The schematic PORV shows true disc position; this does not.
    ims2jf7fv7m: function (s) { return String(IN(s).porv_indicator || 'closed').toUpperCase(); },
    // PZR temperature + live heater power (EXTRA_ITEMS pair, #237). Heater reads the
    // engine's ACTUAL output (heater_power_frac) — under AUTO this is the proportional
    // controller's live demand, which the panel's editable % box shows greyed.
    ims5gq44zgr: function (s) { return dT(satTempC(IN(s).primary_pressure)); },
    ims5gprvl7n: function (s) { return r0(CS(s).heater_power_pct || 0); },
    imro6qpci2d: function (s) { return dTd(IN(s).thot - IN(s).tcold); },   // leg dT (a DIFFERENCE - see the tempd family)
    // RCP FLOW, % of rated (#350 item 17). Colour is the LOW-FLOW TRIP ladder, not a generic
    // band: green above the trip, amber in the margin, red once the trip setpoint is crossed
    // — read out of the live protection table so a retune moves the readout with it. The
    // natural-circulation band (a few percent) therefore reads RED, which is correct: flow
    // that low IS a tripped plant, and saying otherwise would be the #236 class of lie.
    imsgteavgid: function (s) {
      var v = IN(s).rcs_flow;
      if (v == null || isNaN(v)) return { text: '—', color: '#7f95a5' };
      var sp = tripSp('rcs_flow', 'low', 90);
      var col = v <= sp ? '#ff6a4d' : (v < sp + 5 ? BD_WARN : BD_OK);
      return { text: v.toFixed(0), color: col };
    },
    // PZR SPRAY FLOW, % of maximum (#350 item 1). Amber whenever spray is being CALLED FOR
    // and is not arriving — the demand is up and the delivery is not — because that gap is
    // the whole reason this indication exists and it is invisible on the demand box alone.
    imsgt6qmdgx: function (s) {
      var v = IN(s).pzr_spray_flow;
      if (v == null || isNaN(v)) return { text: '—', color: '#7f95a5' };
      var asked = (CS(s).spray_valve_pct || 0) > 2;
      return { text: v.toFixed(0), color: (asked && v < 20) ? BD_WARN : BD_OK };
    },
    // SUR, DPM (#271). NOT a log channel and it has no trip. The `sur_high` ALARM at 1.0 is
    // amber on every plant. RED is the rod-withdrawal INTERLOCK — a command block rather than a
    // scram, so red means "the withdrawal block is on", not "you are about to trip" — and it is
    // drawn ONLY when the RUNNING plant actually has that interlock (#572). PWR1 does, at
    // 1.5 DPM. PWR2 does NOT and never did: the evidence pass found no startup-rate rod stop in
    // the corpus, and its sourced stops (power-range 103 %, intermediate-range 20 %, the delta-T
    // pair) are flux and temperature functions that this readout does not show. Painting red
    // there promised protection the plant does not have — measured, 10.00 DPM with 90
    // withdrawals accepted.
    imro6qsncb9: function (s) {
      var v = IN(s).startup_rate || 0;
      var text = (v >= 0 ? '+' : '') + v.toFixed(2);
      var blk = surBlockDpm(s);
      var color = (blk != null && v >= blk) ? NIS_TRIP_COLOR
                : v >= surAlarmDpm() ? SR_HANDOFF_COLOR : SR_NORMAL_COLOR;
      return { text: text, color: color };
    },
    imro6qutiht: function (s) {                                                                          // source range cps
      var sr = IN(s).source_range;
      // Amber at the SR high-flux CAUTION (pwr_control 'sr_high_flux', 5e4 cps): the cue to
      // finish the SR→IR handoff and secure the SR detector. RED at the 1e5 cps trip that ends
      // the ascent — which the readout never showed, so the caution and the scram looked alike.
      // Grey once the detector is secured: `sr_high` is `condition: 'sr_energized'`, so after
      // the handoff there is no live limit on this channel at all.
      var live = !!IN(s).sr_energized;
      var trip = nisArmed('source_range', 'high', s);
      var color = !live ? NIS_IDLE_COLOR
                : (sr != null && isFinite(sr) && trip != null && sr >= trip) ? NIS_TRIP_COLOR
                : (sr != null && isFinite(sr) && sr >= SR_HANDOFF_CPS) ? SR_HANDOFF_COLOR
                : SR_NORMAL_COLOR;
      return { text: fmtExp(sr), color: color };
    },
    // IR amps (log scale, like SR). The `ir_high` trip at 1.67e-3 A is the middle rung of the
    // startup net and was completely invisible: the readout was a plain number, so the trip that
    // catches a missed block gave no warning at all. Grey once blocked above P-10 (#271).
    imro6rctcgm: function (s) {
      var ir = IN(s).intermediate_range;
      var trip = nisArmed('intermediate_range', 'high', s);
      return { text: fmtExp(ir), color: nisLogColor(ir, trip, trip != null) };
    },
    // Reactor period (s) — teaching readout under REACTIVITY. ∞ when steady.
    ims89mkaj2r: function (s) {
      var per = s.true_state && s.true_state.reactor_period_s;
      if (per == null) return { text: '—', unit: 's' };
      if (!isFinite(per) || Math.abs(per) > 9999) return { text: '∞', unit: 's' };
      return { text: String(Math.round(per)), unit: 's' };
    },
    // Rod steps. The unit comes from the group's OWN max_steps rather than the authored
    // "/912": the scale is the engine's declaration, and the PWR2 shell publishes its native
    // 0..200 bank — printing 200 under a /912 label would claim a rod position that does not
    // exist. On the current engine max_steps IS 912, so the rendered unit is unchanged.
    imrpk4pjcpd: function (s) { var g = rodGroup(s, 'control_rods'); return g ? { text: String(g.steps), unit: '/' + (g.max_steps || 912) } : '0'; },
    imrpnzfsfcx: function (s) { var g = rodGroup(s, 'shutdown_rods'); return g ? { text: String(g.steps), unit: '/' + (g.max_steps || 912) } : '0'; },
    imrppee04aj: function (s) { return r0(IN(s).turbine_rpm); },                                        // turbine rpm
    // ---- steam-side indications, authored in the 2026-08-05 diagram (#371) ----
    // Read positionally off the board: each sits beside the valve it reports, and the
    // builder's copied names ("STEAM TURB FLOW" on three of them) do NOT identify them.
    imsguptyg16: function (s) { return r0(IN(s).adv_valve); },          // ADV position — beside the ADV valve, SG side of the MSIV
    imsgunuyvon: function (s) { return r0(IN(s).steam_dump_valve); },   // condenser-dump position — beside that valve, downstream
    imsgupfprkp: function (s) { return r0(IN(s).steam_flow * 100); },   // turbine steam flow, % of rated — at the TCV/turbine inlet
    // SG saturation temperature. dT(), NOT bare r0(): this returned raw °C under the item's
    // authored "F" unit from its 2026-08-05 birth — 274 °C rendered as "274 f" against the
    // sibling steam-temp tile (imrr1hecwq7, same arithmetic) reading a correct 525 °F. Found
    // on the PWR2 hookup, present on both engines.
    imsgt98wjjc: function (s) { return dT(satTempC(IN(s).steam_pressure)); },
    // The two CVCS flows the authored doc replaced (the old readouts were deleted).
    // gpm via GPM_CHARGING/GPM_LETDOWN like every RCS-side flow: these rendered the raw
    // frac/s (#408 real currency, ~6.8e-5 at NOP) through r0(), which rounded every CVCS
    // flow the plant can make to 0 — both boxes read zero always, at full charging too.
    imsgti1p0rm: function (s) { return dQ((IN(s).charging_flow || 0) * GPM_CHARGING); },
    imsgti0gnpf: function (s) { return dQ((IN(s).letdown_flow || 0) * GPM_LETDOWN); },
    imrppeh5hkb: function (s) { return r0(IN(s).mwe_output); },                                         // generator MW
    imrppej8ulo: function (s) { return r0(IN(s).governor_valve); },                                     // governor %
    imrppq5r7kw: function (s) { return CS(s).steam_dump_auto ? 'NORMAL' : ((CS(s).steam_dump_pct || 0) > 0 ? 'DUMPING' : 'MANUAL'); }, // steam dump status
    ims89lnqmip: function (s) { return feedStatus(s); },                                              // SG feed controller status (#214)
    bdDtMargin: function (s) { return dtMargin(s); },                                                  // core ΔT margin, OTΔT/OPΔT (#311)
    imrppyp0wfo: function (s) { return accN2Press(s); },   // accumulator N2 cover-gas pressure
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
    // ADV position (#371). No VALUE_UNIT entry — % is unit-neutral, and a conversion
    // layer that touched it would be worse than none (board_check pins that).
    bdAdvPct: function (s) { return r0(IN(s).adv_valve); },
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
    imrqzuhzre3: function (s) { return dV(IN(s).condenser_vacuum); },  // condenser vacuum (mimic)
    ims3xp168iy: function (s) { return dV(IN(s).condenser_vacuum); },  // condenser vacuum (cooling card)
    imrr1gwi93j: function (s) { return dP(IN(s).steam_pressure); },  // SG pressure
    imrr1hecwq7: function (s) { return dT(satTempC(IN(s).steam_pressure)); },  // steam temp (sat)
    imrr4fnxhlc: function (s) { return dT(IN(s).thot); },  // T-hot
    imrr4g29a7c: function (s) { return dT(IN(s).tcold); },  // T-cold
    imrsgch20pv: function (s) {                                                                          // PORV tailpipe temp
      // The one honest tell in the TMI-2 sequence: a seated PORV leaves the tailpipe at its
      // ~180 °F leaky-seat baseline; a passing (stuck-open) valve cooks it toward ~300 °F.
      // The 1979 crew had this reading and misread it — so make the elevation legible: amber
      // once it climbs clear of baseline (issue #105 #6). SR_NORMAL_COLOR is the authored green.
      var c = IN(s).porv_tailpipe_temp;
      if (c == null) return null;
      return { text: dT(c), color: c > 100 ? SR_HANDOFF_COLOR : SR_NORMAL_COLOR };
    },
    // SG feed rate: MEASURED feed flow, not pump demand. This read control_state
    // feed_pump_speed_pct until 2026-07-25, so it showed what was asked for rather than what
    // the plant delivered — the indication stayed at demand through a feed-pump trip.
    imrsgkz4lq0: function (s) { return dQ((IN(s).fw_flow || 0) * GPM_FEED); },   // SG feed rate
    // Main steam line flow — the TOTAL SG draw (turbine + dump + safeties), which is what
    // feed has to match. NOT the `steam_flow` instrument: that is governor/turbine flow only
    // and reads ~0 whenever the turbine is offline and the dump is carrying the plant — the
    // same blind spot that had the three-element channel commanding zero feed through a
    // turbine trip (#206). Same GPM_FEED scale as the feed indication above it. HR1: reads
    // the instrument, so a failed transmitter lies here exactly as it does to the channel.
    //   V2 shows it twice: at the SG steam head on the mimic, and — the one that matters —
    // directly above FEED FLOW on the STEAM GEN FEED card, so matching the two in MANUAL is
    // a visual comparison rather than arithmetic.
    ims31ngjkf8: steamFlowDisp,   // steam flow (SG head)
    ims3wm0d0bu: steamFlowDisp    // steam flow (feed card)
  };

  function steamFlowDisp(s) {
    var f = IN(s).sg_steam_flow;
    return f == null ? null : dQ(f * GPM_FEED);
  }

  // SR→IR handoff cue: turn the source-range indication amber at the SR high-flux caution
  // (matches pwr_control 'sr_high_flux' = 5e4 cps), prompting the operator to secure the SR
  // before its 1e5 cps trip. SR_NORMAL_COLOR is the authored green on the SR indication item.
  var SR_HANDOFF_CPS = 5.0e4, SR_HANDOFF_COLOR = '#D9A441' /* --caution */, SR_NORMAL_COLOR = '#5aad7c';
  var NIS_TRIP_COLOR = '#ff6a4d' /* --critical, the tiles' trip red */;
  var NIS_IDLE_COLOR = '#7f95a5' /* the tiles' "acceptable" grey — no live limit to run into */;

  // ---- NIS threshold indication (#271) ----------------------------------------------
  // The startup net ladders P-10 (10 %) < IR high (~20 %) < PR low setpoint (25 %). #267 made
  // the PR rung visible on the power tile; these are the other two, plus the startup rate.
  // They are `value` items — bare log-ranging numbers with no region model to paint a band on —
  // so the indication is the COLOUR OF THE NUMBER, on the same mechanism the SR readout has used
  // for the handoff cue since #105.
  //
  // Driven by ARMED protection, like the tiles: a blocked or non-live trip has no colour, because
  // there is nothing there to run into. `ir_high` is blockable above P-10 and the startup net
  // expects you to block it; `sr_high` carries `condition: 'sr_energized'` and dies with the
  // detector. Colouring a defeated trip would teach the opposite of what the block accomplished.
  //
  // On a LOG channel "approaching" cannot be a percentage — 50 % of 1.67e-3 A is half a decade
  // short and reads as nowhere near. NIS_NEAR_DECADES is how close in DECADES counts as amber.
  var NIS_NEAR_DECADES = 0.5;
  // Resolved LAZILY, not captured. `_PROT` is a `var` assigned further down the file, so reading
  // it at this point would take `undefined` — the same load-order trap tile() already documents.
  function surAlarmDpm() { return alarmSp('sur_high', 1.0); }
  /* THE STARTUP-RATE WITHDRAWAL BLOCK, IF THE RUNNING PLANT HAS ONE (#572).
   *
   * This read `_PROT.interlocks` and fell back to a literal `1.5`, and BOTH halves were wrong
   * for PWR2. `_PROT` resolves to the pwr table whichever plant is running (see its definition),
   * so the lookup did not miss and reach the fallback — it FOUND the retired plant's interlock
   * and drew its band. Measured on PWR2: the plant reached 10.00 DPM, 6.7x that band, across 90
   * consecutive withdrawal commands with none refused, because PWR2 has no startup-rate
   * interlock and never did. Exactly the #557 class — a constant right for one plant, read by a
   * board that is engine-agnostic by design.
   *
   * It reads the LIVE snapshot now: the kernel publishes each interlock's instrument, blocks
   * list, direction and (since this change) its setpoint. A plant with no such interlock
   * returns null and the readout draws no block band — which is the honest answer, not 1.5.
   *
   * PWR2 deliberately has none: the evidence pass behind #572 found NO startup-rate rod stop in
   * the corpus at all. Its sourced rod stops are the power-range 103 % and intermediate-range
   * 20 % flux stops plus the delta-T pair, and they live in the engine (pwr2_protection's
   * ROD_STOP block), where they refuse by name at the rod door. */
  function surBlockDpm(s) {
    var il = (s && s.interlocks) || [];
    for (var i = 0; i < il.length; i++) {
      if (il[i].instrument === 'startup_rate' && il[i].direction === 'high' &&
          (il[i].blocks || []).indexOf('rod_start') >= 0 &&
          il[i].setpoint != null && isFinite(il[i].setpoint)) return il[i].setpoint;
    }
    return null;
  }
  function nisArmed(instrument, direction, s) {
    var t = limitingArmedTrip(instrument, direction, s);
    return (t && t.setpoint != null && isFinite(t.setpoint)) ? t.setpoint : null;
  }
  // Colour a log-scaled reading against its armed trip: red at or past it, amber within
  // NIS_NEAR_DECADES below it, otherwise the authored green. Grey when nothing is armed.
  function nisLogColor(v, sp, live) {
    if (!live || sp == null) return NIS_IDLE_COLOR;
    if (!(v > 0) || !isFinite(v)) return SR_NORMAL_COLOR;
    if (v >= sp) return NIS_TRIP_COLOR;
    return (Math.log10(sp) - Math.log10(v) <= NIS_NEAR_DECADES) ? SR_HANDOFF_COLOR : SR_NORMAL_COLOR;
  }
  function fmtExp(v) { if (!v || v <= 0) return '0'; var e = Math.floor(Math.log10(v)); var m = v / Math.pow(10, e); return m.toFixed(1) + 'e' + e; }
  function accIsolated(s) { return CS(s).accumulator_valve_open === false; }
  function accFill(s) { var t = s.true_state || {}; return t.accumulator_volume_pct != null ? t.accumulator_volume_pct : 78; }
  // N2 cover-gas pressure. Older saves predate the engine field — show a dash rather than a
  // fabricated constant (this readout was pinned at a hard-coded 640 psig until 2026-07-25).
  function accN2Press(s) { var t = s.true_state || {}; return t.accumulator_pressure_mpa != null ? dP(t.accumulator_pressure_mpa) : null; }

  // ================================================================ COMPONENTS
  // compProps(item, s) -> props for the component's update()
  function pumpProps(running, speed, temp) { return { running: !!running, speed: speed, temp: temp }; }
  // flowing (default true): when false the valve shows OPEN + water-filled but NOT flowing —
  // e.g. an aligned accumulator isolation valve held shut by its 600 psi check valve.
  // `disabled` (optional): the running engine registers this valve as a STATIC (no
  // actuator behind the symbol) — the component drops its pointer affordance so the click
  // never happens, the #506 missing-machinery idiom instead of a refusal flash (#509 item 11).
  function valveProps(openFrac, contents, temp, flowing, disabled) { return { openFrac: openFrac, contents: contents, temp: temp, flow: flowing !== false, disabled: disabled === true }; }

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
      // THE HEATER BANK'S ELEVATION COMES FROM THE PLANT (#473). The drawn bank and the band
      // the model loses authority across are ONE pair of numbers, published through
      // getControlState so they cannot drift — the #557 shape. The fallback is the dev PWR
      // route's: `pwr_config.pressurizer2` carries the same pair for the v2 vessel (the
      // ELEVATION is in that block, the 17 % CUTOFF in `pressurizer` — two blocks, one fact,
      // so both are read by name). A plant that publishes neither leaves the component on its
      // own bare-mount default.
      var hev = c.heater_elev_pct ||
        (isFinite(_PZ2.heater_elev_bot_pct) && isFinite(_PZ2.heater_elev_top_pct)
          ? [_PZ2.heater_elev_bot_pct, _PZ2.heater_elev_top_pct] : null);
      return { level: IN(s).pzr_level, heaterPower: c.heater_power_pct, heaterElevPct: hev,
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
      //
      // `vacuumInHg` is deliberately left OUT of the #238 display-unit layer: the prop name
      // bakes the unit into the component's contract, and the only thing that renders it
      // (comp_condenser.js, its `showControls` text) is DORMANT — the board's condenser item
      // is authored `showControls: false`. Renaming a component prop to fix a readout nobody
      // can see would be the wrong trade. If that panel is ever turned on, it needs the
      // family treatment and a prop name that does not claim a unit.
      return { steamLoad: IN(s).power_range, hotwellLevel: 55,
        coolingFlow: IN(s).condenser_cooling_available ? 80 : 0,
        temp: condTemp(s),
        vacuumInHg: kPa2inHg(IN(s).condenser_vacuum) };
    },
    coolingTower: function (s) {
      return { heatLoad: IN(s).power_range, coolingFlow: IN(s).condenser_cooling_available ? 80 : 0 };
    },
    // flowFrac = steam admission (governor) — casing fill + steam ports stop with demand.
    // rpmFrac  = rotor speed / rated — blade scroll coasts with the plant (~40 s τ after
    // a trip or planned offline). Keying spin on steam_demand_low alone froze the art the
    // instant the turbine unloaded while the RPM readout was still coasting down.
    turbineGenerator: function (s) {
      var gov = (IN(s).governor_valve || 0) / 100;
      var rated = _TB.rpm_rated || 1800;
      var rpm = IN(s).turbine_rpm || 0;
      return {
        flowFrac: IN(s).steam_demand_low ? 0 : gov,
        rpmFrac: rated > 0 ? rpm / rated : 0
      };
    },
    // pumps — the fluid-color temperature is LIVE where the pump moves plant fluid whose
    // temperature changes with state (RCP on the cold leg; feed pump = feedwater); cold
    // make-up sources (HPI/RWST, charging/VCT, condensate/hotwell) stay near-constant cold.
    // EVERY PUMP HERE SPINS ON DELIVERED FLOW, NOT ON ITS RUN COMMAND (#350 items 7, 13, 15).
    // The run lights and the handswitch positions stay the operator's demand — that split is
    // the house idiom (#329/#332, `afw_pump_running` vs `afw_flow_normalized`) and it is what
    // keeps the board honest about what was ASKED FOR versus what HAPPENED. But the impeller
    // is not a demand: it is a picture of a rotor, and a de-energized rotor does not turn.
    //
    // MEASURED, full stack, hot full power with a station blackout injected at 120 s: the
    // condensate pump's `condensate_pump_running` reads TRUE for the whole event (correctly —
    // nobody stopped it) while `condensate_flow` is 0, the charging pump the same, and the
    // feed pump's COMMANDED `feed_pump_speed_pct` winds up 100 → 120 % as the level channel
    // chases a level it can no longer reach, against `fw_flow` of 1.5e-52. All three drew a
    // spinning pump on a dead bus, and the feed pump drew a pump spinning FASTER than it does
    // at power. Reading the delivered flow fixes both halves of item 7 at once: the impeller
    // now tracks feed rate during normal load-follow as well, which it never did — the
    // commanded speed sits at 100 whatever the plant is doing.
    imrobnzlha1: function (s) { return pumpProps((IN(s).hpi_flow || 0) > 1e-4, IN(s).hpi_flow || 0, 50); },   // eccs pump (RWST — cold)
    imrobph7xrq: function (s) { var f = IN(s).fw_flow || 0; return pumpProps(f > 1e-3, f, fwTemp(s)); },      // feed pump (feedwater — tracks load)
    imrobpq4a70: function (s) { var p = pumpRec(s, 'rcp'); return pumpProps(IN(s).rcp_running, p ? p.flow_pct / 100 : 1, IN(s).tcold); },  // rcp (cold-leg coolant — live)
    // Charging: the pump runs at a steady speed and the FLOW is set by the charging valve, so
    // the impeller keys on running-and-powered rather than on flow magnitude. `charging_flow`
    // is the powered evidence — it is zero on a dead bus and non-zero whenever the pump is
    // actually turning, including at the low end of the make-up modulation.
    imrqp87ueqb: function (s) { var on = !!CS(s).charging_pump_running && (IN(s).charging_flow || 0) > 1e-6; return pumpProps(on, on ? 0.8 : 0, 50); },
    imrqvzbd9hd: function (s) { var f = IN(s).condensate_flow || 0; return pumpProps(f > 1e-3, f, 40); },     // condensate pump (hotwell — cool)
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
    imrpp99kx2y: function (s) { return valveProps(IN(s).msiv_open ? 1 : 0, 'steam', satTempC(IN(s).steam_pressure), (IN(s).sg_steam_flow || 0) > 0.01, CS(s).msiv_fixed === true); },  // main steam isolation (non-operable on an engine with no MSIV model)
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
    imrppxt2aqd: function (s) { return valveProps(CS(s).accumulator_valve_open === false ? 0 : 1, 'water', 50, IN(s).accumulators_discharging, CS(s).accumulator_valve_fixed === true); },
    imrprmm4u5q: function (s) { return valveProps((IN(s).steam_dump_valve || 0) / 100, (IN(s).steam_dump_valve || 0) > 2 ? 'steam' : 'empty', satTempC(IN(s).steam_pressure)); }, // steam dump valve
    // ---- the ADV branch, SG side of the MSIV (#371) ------------------------
    // The valve is the throttling element; the Atmospheric Dump beyond it is the
    // discharge to air. Both read `adv_valve`, so the plume and the valve position
    // are the same signal — the plume cannot show steam a shut valve is not passing.
    imsgu6qi776: function (s) {
      var v = IN(s).adv_valve || 0;
      return valveProps(v / 100, v > 2 ? 'steam' : 'empty', satTempC(IN(s).steam_pressure));
    },
    imsgujvh6iw: function (s) {
      var v = IN(s).adv_valve || 0;
      return { openFrac: v / 100, contents: v > 2 ? 'steam' : 'empty', temp: satTempC(IN(s).steam_pressure) };
    },
    // The two steam-header tees. UPSTREAM (imsgu622dld) splits SG steam between the
    // MSIV and the ADV branch; DOWNSTREAM (imsgu024ehh) splits it between the turbine
    // and the condenser dump. Their legs gate on the branch that is actually passing
    // steam, so a shut ADV or a shut dump leaves its leg dark.
    imsgu622dld: function (s) {
      return { temp: satTempC(IN(s).steam_pressure), contents: 'steam',
        flowing: LF(s).steam > 0 || (IN(s).adv_valve || 0) > 2, speed: sysSpeed(s, 'steam'),
        legB: s.true_state && s.true_state.msiv_open === false ? 'off' : 'out',
        legC: (IN(s).adv_valve || 0) > 2 ? 'out' : 'off' };
    },
    imsgu024ehh: function (s) {
      return { temp: satTempC(IN(s).steam_pressure), contents: 'steam',
        flowing: LF(s).steam > 0 || LF(s).dump > 0, speed: sysSpeed(s, 'steam'),
        legB: (IN(s).steam_flow || 0) > 0.02 ? 'out' : 'off',
        legC: (IN(s).steam_dump_valve || 0) > 2 ? 'out' : 'off' };
    },
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
    // renders it full but STILL — secured is not drained; the old empty/black rendering
    // read as a drained line against the full pipe it joins (#509 item 2). Legs are named
    // by their authored direction, so 'off'
    // is the only value that ever changes here — the in/out sense stays as drawn.
    ims2k1rhzh3: function (s) {                       // cold-leg header; branch C = charging
      return coldLeg(s, { legC: CS(s).charging_pump_running && (IN(s).charging_flow || 0) > 1e-5 ? 'in' : 'off' });   // 1e-5 ≈ 4.5 gpm on the #408 real scale (was 1e-4, the old currency)
    },
    ims2k3q7ehq: function (s) {                       // cold-leg header; branch C = letdown out
      return coldLeg(s, { legC: (IN(s).letdown_flow || 0) > 1e-5 ? 'in' : 'off' });   // #408 real scale
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
      return { temp: IN(s).thot, contents: 'water', flowing: LF(s).primary > 0,
        speed: sysSpeed(s, 'primary') };
    },
    // Feedwater: feed-pump discharge + the AFW branch, into the SG. Tracks the FW-heater
    // train temperature (load-dependent), not steam saturation — see fwTemp(). AFW is a
    // separate train, so its branch is gated on AFW actually delivering, not on main feed.
    ims31q71cmu: function (s) {
      // The fitting moves if EITHER train is delivering — it is the point where they join —
      // so it reads `sgfeed`, the same system as the run out of it to the SG (item 9).
      return { temp: fwTemp(s), contents: 'water',
        flowing: LF(s).sgfeed > 0, speed: sysSpeed(s, 'sgfeed'),
        legB: (IN(s).fw_flow || 0) > 1e-3 ? 'in' : 'off',
        legC: (IN(s).afw_active && (IN(s).afw_flow || 0) > 1e-4) ? 'in' : 'off' };
    },
    // CVCS charging-pump suction: B from the VCT, C from the ECCS panel cross-tie.
    //
    // THE TWO LEGS HAVE DIFFERENT GATES, and giving them one was a board that lied
    // (owner, 2026-08-03: "the pipe coming out of the right of the ECCS shows flow when
    // the ECCS is off or not flowing"). MEASURED at hot full power with eccs_mode=off,
    // hpi_flow=0, hpi_active=false: `pms3xe4ia7n` (ECCS PANEL RIGHT → this leg C) came
    // back `running`. It has to — its OTHER endpoint is a plain box port, which carries
    // no `data-active` at all, so `portActive` returns true for it unconditionally and
    // this leg is the pipe's only gate. Whatever gates leg C gates that pipe.
    //
    // Leg C is the RWST cross-tie to the charging pump suction, i.e. the SI suction swap.
    // The charging pump runs continuously at power, so gating it on the PUMP showed
    // emergency suction lined up in every state of the plant. It follows the ECCS train
    // actually drawing instead — the same predicate the ECCS pump's own suction line
    // already uses, so the two lines out of that panel now agree with each other.
    // Normal make-up comes from the VCT on leg B, which is gated on charging FLOW.
    ims3x01kvp4: function (s) {
      var flow = !!CS(s).charging_pump_running && (IN(s).charging_flow || 0) > 1e-5;   // #408 real scale
      var eccs = !!IN(s).hpi_active && (IN(s).hpi_flow || 0) > 1e-4;
      return { temp: 50, contents: 'water', flowing: flow || eccs, speed: sysSpeed(s, 'chgsuct'),
        legB: flow ? 'in' : 'off', legC: eccs ? 'in' : 'off' };
    },

    // ---- vital-parameter tiles (Indicator Panel) -------------------------------------
    imrzl4b7g9m: tile('imrzl4b7g9m', function (s) { return IN(s).power_range; }),
    // The readings are in BASE units (°C, MPa) — tile() converts them with the same family
    // that converted the bands, so a reading can never be plotted against a band in a
    // different unit. That coupling is the point of routing both through TILE_UNIT.
    ims2immk7ks: tile('ims2immk7ks', function (s) { return IN(s).tavg; }),
    ims2immxl2s: tile('ims2immxl2s', function (s) { return IN(s).subcooling_margin; }),
    ims2immsvn6: tile('ims2immsvn6', function (s) { return IN(s).primary_pressure; }),
    ims2immon9z: tile('ims2immon9z', function (s) { return IN(s).pzr_level; }),
    ims2imn1nny: tile('ims2imn1nny', function (s) { return IN(s).sg_level; })
  };

  // Cold-leg header fitting: the straight run carries RCS flow (so it moves with the RCP),
  // plus whatever branch states the caller supplies for the system that taps in there.
  // `flowing` follows MEASURED RCS flow rather than `rcp_running` since #350 item 18 — with
  // the pumps stopped the loop still circulates on buoyancy, and a fitting frozen solid
  // between two crawling pipes is the #236 defect from the other side. `speed` is the primary
  // system's banded dash velocity, the same number the pipes either side of it read, which is
  // what keeps the dashes matched across the joint (#231).
  function coldLeg(s, legs) {
    var p = { temp: IN(s).tcold, contents: 'water', flowing: LF(s).primary > 0,
              speed: sysSpeed(s, 'primary') };
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
  //
  // A BLOCKABLE trip must also EXIST in the live kernel (#506.7). The bands come from the
  // STATIC pwr trip table but the arming came only from live `trip_blocks` — and a kernel
  // with an EMPTY trip list (PWR2 runs its protection inside the engine) has nothing
  // blockable, so the 25 % low-setpoint startup trip read as armed forever and pinned the
  // power tile red at full power (measured: max 27.5, "TRIP 25%", value 99.8).
  // `trip_block_status` is the presence signal: the kernel builds it from its own config's
  // blockable trips, so an id absent there is a trip the live plant does not carry — skip
  // it. A snapshot with NO trip_block_status at all (old recordings, minimal fixtures)
  // falls back to the old blocked-only rule, bit-identical.
  function limitingArmedTrip(instrument, direction, s) {
    if (!s || !s.rps_state) return null;
    var t = _PROT.trips || [], blocks = s.rps_state.trip_blocks || {}, out = null, i;
    var tbs = s.rps_state.trip_block_status;
    for (i = 0; i < t.length; i++) {
      if (t[i].instrument !== instrument || t[i].direction !== direction || t[i].setpoint == null) continue;
      if (t[i].id && blocks[t[i].id]) continue;
      if (t[i].blockable && t[i].id && tbs && !(t[i].id in tbs)) continue;
      /* THE ENGINE'S OWN SETPOINT WINS (#507 wave 7): an engine-owned RPS (PWR2) publishes
       * its block status THROUGH the kernel with the trip's own setpoint attached — its
       * low-flux setting is 35 %, not the static pwr1 table's 25 %. A status entry without
       * a setpoint (every kernel-owned trip, every old recording) changes nothing. */
      var row = t[i];
      if (row.id && tbs && tbs[row.id] && typeof tbs[row.id].setpoint === 'number') {
        row = Object.assign({}, row, { setpoint: tbs[row.id].setpoint });
      }
      if (out == null) { out = row; continue; }
      var better = (direction === 'low') ? (row.setpoint > out.setpoint) : (row.setpoint < out.setpoint);
      if (better) out = row;
    }
    return out;
  }
  function alarmSp(id, fallback) {
    var a = _PROT.alarms || [], i;
    for (i = 0; i < a.length; i++) if (a[i].id === id) return a[i].setpoint;
    return fallback;
  }
  /* THE RUNNING PLANT'S alarm setpoint, not the one captured at script load (#556). `_PROT`
   * above is `RD.PWR_CONTROL.protection` — the retired plant's table, frozen at load — and
   * TILE_BANDS is built from it ONCE, which is correct there and wrong on any other plant. The
   * two are the same object on the retired engine, so this changes nothing for it; on PWR2 the
   * shell rebuilds the alarms array with its own overrides and the tile was 8 points out.
   * (The example that used to sit here — pzr_level_low 25 -> 17 — is retired: #500 made that
   * row program-relative on BOTH plants, so it is no longer overridden. `rod_limit_approach`
   * 40 -> 10 is the one that remains, and the live-lookup rule is unchanged.)
   *
   * Live lookup, per call, deliberately: the plant can change under a mounted board. Falls back
   * to the static table when the host passed no accessor — board_check and the headless gates
   * mount with a partial ctx, and an old recording has no live plant at all. */
  function liveAlarmSp(id, fallback) {
    var r = liveAlarmRow(id);
    return r ? r.setpoint : alarmSp(id, fallback);
  }
  /* The WHOLE row, not just its number — a consumer that has to know which INSTRUMENT the
   * alarm watches needs it (#500 made `pzr_level_low` read `pzr_level_dev` on both plants, and
   * a deviation setpoint drawn on an absolute scale is a red edge in the wrong place). Same
   * live-lookup-with-static-fallback rule as liveAlarmSp; null when there is no live plant. */
  function liveAlarmRow(id) {
    var p = (ctxRef && typeof ctxRef.protection === 'function') ? ctxRef.protection() : null;
    var a = (p && p.alarms) || null, i;
    if (a) for (i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  }
  var P_SET = _PZ.P_setpoint || 15.41;
  // Family + per-mode display resolution for the three tiles that carry a convertible unit.
  // `us` is the AUTHORED unit string on the item, repeated here because tile() is keyed by
  // id and never sees the doc item — it is what US mode renders, unchanged.
  //
  // The DECIMALS are per-mode and not a free choice: the tile comment below records the
  // measured sigma in display units, and the rule is that the last digit must be signal.
  // Pressure needs 2 in MPa (0.0039 MPa sigma) where it needs 0 in psi (0.56 psi); Tavg and
  // subcooling stay whole units in °C, where they are QUIETER than in °F (0.05 vs 0.09).
  var TILE_UNIT = {
    ims2immk7ks: { fam: 'temp',  us: 'F',   d: { US: 0, SI: 0 } },
    ims2immxl2s: { fam: 'tempd', us: 'F',   d: { US: 0, SI: 0 } },
    ims2immsvn6: { fam: 'press', us: 'psi', d: { US: 0, SI: 2 } }
  };
  function tileUnit(id) {
    var t = TILE_UNIT[id];
    return t ? uStr(t.fam, t.us) : null;
  }
  function tileDigits(id, b) {
    var t = TILE_UNIT[id];
    return t ? t.d[U()] : b.digits;
  }
  // Band edges live in the family's BASE unit here (°C, MPa, % — the same unit the
  // protection tables publish), and bandsFor() converts the whole set to the active
  // display unit in one place at the end. Before #238 these converted inline and the
  // literals below were authored in °F/psi, which is what made the board US-only.
  var TILE_BANDS = {
    // Reactor power, % rated — unit-neutral. High side only: any power below rated is a
    // legitimate state. tripHi is the BACKSTOP (120 %); the 25 % power-range low setpoint
    // is armed during a startup and overrides it live — see powerBand().
    imrzl4b7g9m: { min: 0, max: 130, digits: 1,
      tripLo: 0, alarmLo: 0, normLo: 0,
      normHi: 100, alarmHi: alarmSp('high_flux', 108), tripHi: tripBackstop('power_range', 'high', 120) },
    // Tavg, °C. normHi is the top of the at-power Tavg program (307.2 °C / 585 °F); below
    // that covers every mode down to cold shutdown, so the low side collapses. The meter
    // bottom is 10 °C (50 °F) — the F2C() form is deliberate, so the US display it has
    // always shown round-trips back to exactly 50 rather than to a converted approximation.
    ims2immk7ks: { min: F2C(50), max: F2C(660), digits: 0,
      tripLo: F2C(50), alarmLo: alarmSp('low_tavg', 289), normLo: F2C(50),
      normHi: F2C(585), alarmHi: alarmSp('high_tavg', 312.2), tripHi: tripSp('tavg', 'high', 335) },
    // Subcooling margin, °C — a DIFFERENCE, so the `tempd` family (no 32° offset). More is
    // better: the high side collapses and the danger is all at the bottom, ending at
    // 0 = coolant boiling.
    ims2immxl2s: { min: Fd2C(-20), max: Fd2C(150), digits: 0,
      tripLo: alarmSp('subcooling_lost', 0), alarmLo: alarmSp('subcooling_low', 11.1), normLo: Fd2C(40),
      normHi: Fd2C(150), alarmHi: Fd2C(150), tripHi: Fd2C(150) },
    // Primary pressure, MPa. NORMAL is the pressurizer control band itself — heaters come on
    // below setpoint, spray above — so the green band is exactly where the controller holds it.
    ims2immsvn6: { min: 0, max: psi2MPa(2600), digits: 0,
      tripLo: tripSp('primary_pressure', 'low', 12.41),
      alarmLo: alarmSp('pzr_pressure_low', 14.82),
      /* the AUTHORED fallback — the retired plant's -30/+50 psi. pressureBand() overrides it
       * from the running plant's own published ladder where there is one (#576c). */
      normLo: P_SET - (_PZ.heater_band_mpa || 0.207),
      normHi: P_SET + (_PZ.spray_band_mpa || 0.345),
      alarmHi: alarmSp('pzr_pressure_high', 15.86),
      tripHi: tripSp('primary_pressure', 'high', 16.44) },
    // Pressurizer level, %. THE AUTHORED ROW IS THE RETIRED PLANT'S and is now a fallback only —
    // pzrLevelBand() arms it against the running plant (#556). The old comment here read "No
    // high-level trip exists, so the top region collapses at 100", which was already false when
    // written (pwr_control's own pzr_hi_level scrams at 97) and is false twice over on PWR2,
    // which scrams at 87 % and carries no low-level trip at all.
    ims2immon9z: { min: 0, max: 100, digits: 0,
      tripLo: tripSp('pzr_level', 'low', 12), alarmLo: alarmSp('pzr_level_low', 25), normLo: 40,
      normHi: 70, alarmHi: alarmSp('pzr_level_high', 75),
      tripHi: tripSp('pzr_level', 'high', 100) },
    // SG narrow-range level, %. Trips both ways: lo-lo scram and the P-14 high-level trip.
    ims2imn1nny: { min: 0, max: 100, digits: 0,
      tripLo: tripSp('sg_level', 'low', 17), alarmLo: alarmSp('sg_level_low', 30), normLo: 45,
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
  //   - Reactor power follows WHAT IS ARMED — the startup low-flux setting when it is armed,
  //     the 120 % backstop otherwise, and the engine's own setpoint where it publishes one.
  //   - Pressurizer level follows the RUNNING PLANT'S OWN protection rows (#556). It was in the
  //     "does not move" list below until PWR2 shipped, and that is exactly what went wrong: the
  //     list's reasoning — "their references are the protection setpoints, which is what
  //     TILE_BANDS already reads" — was true of the reference and false of the READING, because
  //     TILE_BANDS reads ONE plant's table, captured at script load, for whatever plant is
  //     running. A tile whose band never moves with the MODE can still need to move with the
  //     PLANT.
  // The other two do NOT move, and that is deliberate: subcooling margin and SG narrow-range
  // level are held to the same band in every mode this board can reach, and neither has been
  // MEASURED against PWR2's own table — which is a measurement owed, not a claim that they are
  // right. Their authored edges stand until someone takes that measurement.
  var _CTL = (typeof RD !== 'undefined' && RD.PWR_CONTROL) || {};
  // Band edges are QUANTISED to a whole step of the DISPLAY unit. They are recomputed every
  // render from live signals (load for Tavg, the setpoint for pressure), and the tile rebuilds
  // its gauge whenever a band edge changes — so unquantised edges churned at the ~10 Hz render
  // rate and the whole strip flickered, worst exactly during a transient when load is moving.
  // Rounding means an edge steps once per quantum instead of every frame.
  //
  // The QUANTUM is per family per mode (`q`), not a whole unit, because "whole display unit"
  // stops meaning anything once the unit changes: 1 psi is a sensible edge step and 1 MPa is
  // 145 of them — quantising the pressurizer's ~80 psi control band to whole MPa would erase
  // it. Pressure quantises at 0.01 MPa in SI (1.45 psi, comparable churn resistance) and
  // temperature at 0.5 °C (0.9 °F). qz() is applied AFTER conversion, in bandsFor().
  function qz(v, q) {
    if (v == null || !isFinite(v)) return v;
    if (!q || q === 1) return Math.round(v);
    return Math.round(v / q) * q;
  }
  // Everything the mode-aware helpers below return is in the tile's BASE unit and
  // UNQUANTISED — bandsFor() converts and quantises the merged set in one place.
  function tavgBand(s) {
    var mode = (s.true_state && s.true_state.plant_mode) || null;
    var b = TILE_BANDS.ims2immk7ks;
    if (mode != null && mode >= 5) {
      // Mode 5/6: no Tavg program. Normal is "cold" — RHR territory, below 200 °F. The
      // window closes down with it, or a cold plant reads against an at-power scale.
      return { normLo: b.min, normHi: F2C(200), alarmHi: F2C(250), winLo: b.min, winHi: F2C(350) };
    }
    var out = { winLo: F2C(540), winHi: F2C(645) };   // the hot operating window, not the whole meter
    if (!_CTL.trefProgram) { out.normLo = b.normLo; out.normHi = b.normHi; return out; }
    // Load reference is the same signal the rod channel uses (steam flow, 0..1).
    var load = Math.max(0, Math.min(1, IN(s).steam_flow || 0));
    var ref = _CTL.trefProgram(load);
    // 3.5x the controller's ±0.8 °C lockup band. The rods lock tighter than this, but Tavg
    // legitimately wanders wider than the lockup band while load is moving, and a band
    // narrower than ~10 °F is a hairline on a 105 °F window — unreadable is not useful.
    var halfC = (_CTL.TAVG_DEADBAND_C || 0.8) * 3.5;
    out.normLo = ref - halfC;
    out.normHi = ref + halfC;
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
  /* PRESSURIZER LEVEL — the fourth live-armed tile (#556), and the first to take its trip line
   * from the ENGINE'S OWN published protection rather than from a static table.
   *
   * WHAT WAS WRONG. TILE_BANDS is built once from `_PROT` = the retired plant's protection
   * table. On PWR2 that made this tile say three untrue things at once. MEASURED on the shipped
   * board: the reactor scrammed at indicated 87.70 % on `hi_pzr_level` while the tile put 87.7 in
   * its AMBER region with its red edge 12.3 points further up at 100 — the operator watches a
   * scram arrive out of a caution band with apparent headroom. Below, it painted red from the
   * meter bottom to 12 % for a low-level scram PWR2 does not carry, so a player defends a limit
   * the plant does not have during any drain or shrink transient. And its low alarm edge sat at
   * the retired table's 25 % while PWR2's own annunciator fires at 17 % (#500).
   *
   * THE RULE. A red edge is drawn only where the running plant publishes an ARMED row. `armed`
   * is the protection module's own flag, not a permissive re-tested here — re-testing P-7 on the
   * board would be the second copy of a threshold, which is the defect this whole change is
   * about. An unarmed high row (below the at-power permissive P-7, 10 % power) has no line to
   * draw, so the top region collapses at the meter top.
   *
   * NO NOTE, deliberately. pressureBand's "LO TRIP BLKD" is right there because an OPERATOR
   * blocked that trip; P-7 is a permissive nobody set, and its own comment records why claiming
   * "a bypass nobody set" is worse than saying nothing. The collapsed band is the indication.
   *
   * ABSENT ≠ NONE. `trip_setpoint_instruments` is what makes the low side readable: only when the
   * running plant says it speaks for `pzr_level` does a missing low row mean "this plant has no
   * low-level trip". Without that list — the retired engine, an old recording — the authored
   * trip edges stand untouched and only the alarm edges go live. */
  function pzrLevelBand(s) {
    var b = TILE_BANDS.ims2immon9z;
    /* The alarm edges are live on EVERY plant: they come from the running protection config,
     * which the retired engine and PWR2 both have, and they are what #500's override moved. */
    var out = { alarmLo: liveAlarmSp('pzr_level_low', b.alarmLo),
                alarmHi: liveAlarmSp('pzr_level_high', b.alarmHi) };
    /* ⚠ THE LOW ALARM IS PROGRAM-RELATIVE SINCE #500 (2026-08-29) and this tile's scale is
     * ABSOLUTE, so its setpoint is a DEVIATION and drawing it as a level would paint a red
     * edge at -20 %. Where the plant publishes its live level program, the edge is drawn where
     * that deviation actually lands — `program + setpoint` — and it therefore MOVES with Tavg,
     * which is the whole point of the change: on a Mode 3, Hot Standby plant programmed to
     * 25 % the warning edge sits at 5 %, and at full power's 61.5 % program it sits at 41.5 %.
     * A plant that publishes no program (the retired engine, an old recording) keeps its
     * authored absolute edge untouched. */
    var lowRow = liveAlarmRow('pzr_level_low');
    if (lowRow && lowRow.instrument === 'pzr_level_dev') {
      var prog = CS(s).pzr_level_program_pct;
      out.alarmLo = (prog != null && isFinite(prog)) ? qz(prog + lowRow.setpoint) : b.min;
    }
    if (!s || !s.rps_state) return out;
    var rows = s.rps_state.trip_setpoints;
    var speaks = s.rps_state.trip_setpoint_instruments;
    if (!rows || !speaks || speaks.indexOf('pzr_level') < 0) return out;
    var hi = null, lo = null, i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].instrument !== 'pzr_level') continue;
      if (rows[i].direction === 'high') hi = rows[i]; else lo = rows[i];
    }
    out.tripHi = (hi && hi.armed) ? qz(hi.setpoint) : b.max;
    out.tripLo = (lo && lo.armed) ? qz(lo.setpoint) : b.min;
    return out;
  }
  // Primary pressure — the low side follows WHAT IS ARMED, same rule as power (#270).
  //
  // `primary_pressure low` carries two reactor trips (`lo_press` 12.41 MPa / 1800 psi and
  // `si_trip` 12.4 MPa) and BOTH are blocked at a depressurized initial condition by the P-11
  // permissive, auto-reinstating above 13.6 MPa (1972 psi) during the heatup. The tile painted
  // the red band anyway, and the consequences were worse than a stale band. MEASURED at
  // `cold_shutdown` before this fix, with the plant correctly holding 363 psi:
  //   - the display window was 1736–2449 psi, so the marker sat at −192.6 % of scale — off the
  //     gauge entirely;
  //   - `normLo` clamped up to 2149 while `normHi` tracked the live setpoint at 413, an
  //     INVERTED normal band, so `regionAt()` fell through to the first region and painted a
  //     perfectly correct 363 psi in TRIP RED.
  //
  // Cold, there is no armed low-side boundary to draw: the trips are blocked, and the
  // `pzr_pressure_low` / `pzr_pressure_lolo` alarms already `reclassify` to `status` priority in
  // cold modes, so the annunciator is calling them expected while the tile called them a scram.
  // The low regions collapse and the window runs from 0 to just above the control band, which is
  // the range that actually means something on a plant being held on heaters.
  //
  // The window is keyed on ARMED PROTECTION, not on plant mode, and that is the point: a Mode 5
  // plant at 400 psi and a LOCA at 400 psi are the same reading and must not look the same. In a
  // LOCA the setpoint stays at NOP, P-11 is satisfied on the way down, the trips are armed, and
  // this returns the authored hot bands with the red band intact.
  /* THE HALF-WIDTHS, live off the running plant (#576c, 2026-08-29) — the last member of the
   * #556/#557 family still standing on the plant the site runs. `_PZ` is `RD.PWR_CONFIG.
   * pressurizer` CAPTURED AT SCRIPT LOAD, i.e. the RETIRED engine's -30/+50 psi, and the
   * SETPOINT beside it was already live, so the tile drew the right centre with the wrong
   * width. A plant that publishes `pressure_band_psi` gets its own band; everything else —
   * the retired engine, a partial mount, an old recording — falls back to the authored
   * config literals, byte-identical to what it drew before. */
  /* THIS PLANT'S CHARGING CEILING in gpm (#516 item 11, 2026-08-29) — the pressBandMpa shape,
   * one system over. `CHARGING_MAX_GPM` is `GPM_CHARGING * _RX.charging_max` where `_RX` is
   * `RD.PWR_CONFIG.reactivity` CAPTURED AT SCRIPT LOAD, i.e. the RETIRED engine's 60 gpm.
   * PWR2's own maximum is 30.14 gpm (180 gpm power-scaled by its declared volume basis), and
   * `pwr2_shell.set_charging_flow` clamps the demand to [0,1], so the top HALF of the box's
   * range was one value the player could not tell apart. A plant that publishes
   * `charging_max_gpm` gets its own ceiling; everything else — the retired engine, a partial
   * mount, an old recording — falls back to the authored literal, byte-identical. */
  function chargingMaxGpm(s) {
    var g = CS(s || {}).charging_max_gpm;
    return (g != null && isFinite(g) && g > 0) ? g : CHARGING_MAX_GPM;
  }
  function pressBandMpa(s) {
    var pb = CS(s).pressure_band_psi;
    if (pb && pb.length === 2 && isFinite(pb[0]) && isFinite(pb[1]))
      return [psi2MPa(Math.abs(pb[0])), psi2MPa(Math.abs(pb[1]))];
    return [(_PZ.heater_band_mpa || 0.207), (_PZ.spray_band_mpa || 0.345)];
  }
  function pressureBand(s) {
    var b = TILE_BANDS.ims2immsvn6;
    var sp = CS(s).pressure_setpoint;
    if (sp == null || !isFinite(sp)) sp = P_SET;
    var hw = pressBandMpa(s);
    var out = {
      normLo: sp - hw[0],
      normHi: sp + hw[1]
    };
    if (!s || !s.rps_state) return out;                                // no RPS section → authored
    if (limitingArmedTrip('primary_pressure', 'low', s)) return out;   // armed → authored, red intact
    out.tripLo = b.min;
    out.alarmLo = b.min;
    out.winLo = b.min;
    out.winHi = out.normHi + 0.15 * (out.normHi - b.min);
    // `ok`, not `trip`: bypassed-for-the-mode is a status indication, and a red note here would
    // say the opposite of what the reclassified alarms say.
    //
    // "BLKD" only when the trip EXISTS in the live kernel and is blocked (#506.7): on an
    // engine whose kernel carries no trips (PWR2 — its low-pressure trip lives in the
    // engine's own RPS) the word would claim a bypass nobody set. The absent case gets the
    // widened window with NO note.
    var tbsP = s.rps_state.trip_block_status;
    var lowExists = !tbsP || ('lo_press' in tbsP) || ('si_trip' in tbsP);
    if (lowExists) { out.note = 'LO TRIP BLKD'; out.noteKind = 'ok'; }
    return out;
  }
  function bandsFor(id, s) {
    var b = TILE_BANDS[id];
    var mv = id === 'ims2immk7ks' ? tavgBand(s)
           : (id === 'ims2immsvn6' ? pressureBand(s)
           : (id === 'imrzl4b7g9m' ? powerBand(s)
           : (id === 'ims2immon9z' ? pzrLevelBand(s) : null)));
    if (!mv) return toDisplayBands(id, b);
    var out = {}; for (var k in b) out[k] = b[k];
    if (mv.normLo != null) out.normLo = mv.normLo;
    if (mv.normHi != null) out.normHi = mv.normHi;
    if (mv.alarmHi != null) out.alarmHi = mv.alarmHi;
    // alarmLo was missing here until #270 — the only mode-aware helper that existed set alarmHi
    // and never its opposite, so a helper collapsing the LOW alarm silently kept the authored
    // one and the clamp below then dragged the normal band up to it.
    if (mv.alarmLo != null) out.alarmLo = mv.alarmLo;
    // A live trip bound moves the RED edge, so it must move the display window with it —
    // displayScale() derives the window from tripLo/tripHi.
    if (mv.tripHi != null) out.tripHi = mv.tripHi;
    if (mv.tripLo != null) out.tripLo = mv.tripLo;
    if (mv.note != null) out.note = mv.note;
    if (mv.noteKind != null) out.noteKind = mv.noteKind;
    if (mv.winLo != null) out.winLo = mv.winLo;
    if (mv.winHi != null) out.winHi = mv.winHi;
    // A moving normal band must stay inside its own alarm/trip envelope, or a setpoint the
    // operator typed could paint green over red.
    if (out.normLo < out.alarmLo) out.normLo = out.alarmLo;
    if (out.normHi > out.alarmHi) out.normHi = out.alarmHi;
    // …but the two clamps above are ONE-SIDED, and applied to a normal band that has moved a
    // long way they can cross it over itself. Measured in Mode 5 before #270: normLo clamped up
    // to 2149 while normHi tracked the setpoint at 413, and `regionAt()` — which returns the
    // first region whose top exceeds the reading — then fell through to the bottom TRIP region
    // and painted a correct 363 psi red. A tile must not be able to say that, whichever band
    // moves next, so the inversion is closed here rather than in each mode-aware helper.
    if (out.normHi < out.normLo) out.normHi = out.normLo;
    return toDisplayBands(id, out);
  }
  // The one place a tile band leaves base units (#238). Everything above works in °C / MPa /
  // % — the unit the protection tables publish — and this converts the finished set and
  // quantises it for the active display mode. A unit-neutral tile (reactor power, both
  // levels) has no family and falls through with only the quantisation applied, which is
  // exactly what it always had.
  //
  // Order matters and is safe in this direction only: the clamps above run in BASE units,
  // which is legitimate because every conversion here is strictly increasing, so it commutes
  // with a comparison. qz() is monotone non-decreasing, so an edge ordering established in
  // base cannot invert on the way out either — but quantising BEFORE the clamps could round
  // two edges onto each other and defeat the #270 inversion guard, so it happens last.
  var BAND_KEYS = ['min', 'max', 'tripLo', 'alarmLo', 'normLo', 'normHi', 'alarmHi', 'tripHi', 'winLo', 'winHi'];
  function toDisplayBands(id, b) {
    var t = TILE_UNIT[id];
    var m = t ? fam(t.fam) : null;
    var q = m ? m.q : 1;
    var out = {}, i, k, v;
    for (k in b) out[k] = b[k];
    for (i = 0; i < BAND_KEYS.length; i++) {
      k = BAND_KEYS[i]; v = b[k];
      if (v == null || !isFinite(v)) continue;
      out[k] = qz(m ? m.to(v) : v, q);
    }
    return out;
  }

  // Build a COMPPROPS entry for one tile: its bands plus the live reading.
  // The bands are resolved INSIDE the returned function, not captured here: tile() is
  // called while the COMPPROPS object literal is being evaluated, which runs before the
  // `var TILE_BANDS = {…}` assignment below it. `var` hoists the declaration but not the
  // value, so capturing eagerly read undefined and threw on the first render. (Since #233
  // they also have to be resolved per-snapshot anyway — see bandsFor.)
  //
  // FINE SUB-SAMPLES. Each tile shows one of the six quantities the strip chart already
  // samples between broadcasts, so the tiles can share that work rather than sprouting a
  // second sampler — and could not have one anyway: the service holds a SINGLE sampler slot
  // and `takeFine()` clears. app.js drains it into `RD.ChartFine` once per render (see the
  // drain site in renderNow); this maps tile → chart series so the rows can be read out.
  // Without it a tile gets one sample per broadcast, which at 3600x is one per 360 sim-s.
  var TILE_SERIES = {
    imrzl4b7g9m: 'power', ims2immk7ks: 'tavg',      ims2immxl2s: 'subcool',
    ims2immsvn6: 'pressure', ims2immon9z: 'pzr_level', ims2imn1nny: 'sg_level'
  };
  function tile(id, read) {
    return function (s) {
      var b = bandsFor(id, s);           // already in the active DISPLAY unit
      var sc = displayScale(b);
      var t = TILE_UNIT[id], m = t ? fam(t.fam) : null;
      var v = read(s);                   // …but the reading arrives in BASE units
      if (v != null && isFinite(v) && m) v = m.to(v);
      // Sub-samples go through the SAME `m.to()` as the reading above. That is the whole
      // safety property here: convert them anywhere else and a fine sample could land in a
      // different unit from the band it is plotted against, which is invisible until
      // someone flips to SI.
      // A fine row is PACKED — one Float64Array column per series, not an id-keyed dict
      // (see chartBuf in ui/app.js for the memory measurement that forced it). `RD.ChartCols`
      // is the id → column map app.js publishes alongside the rows; without a column this
      // tile simply falls back to broadcast-rate sampling, as it does when no sampler is set.
      // EVERY read is `isFinite`-guarded rather than `!= null`: an absent reading in a packed
      // row is NaN, and `NaN != null` is TRUE, so a null test would let it through.
      var fine = null, serId = TILE_SERIES[id], rows = RD.ChartFine;
      var col = (serId && RD.ChartCols) ? RD.ChartCols[serId] : null;
      if (col != null && rows && rows.length) {
        fine = [];
        for (var fi = 0; fi < rows.length; fi++) {
          var r = rows[fi];
          var fv = r.v ? r.v[col] : null;
          if (fv == null || !isFinite(fv)) continue;
          var flo = (r.lo && isFinite(r.lo[col])) ? r.lo[col] : fv;
          var fhi = (r.hi && isFinite(r.hi[col])) ? r.hi[col] : fv;
          fine.push(m ? { t: r.t, v: m.to(fv), lo: m.to(flo), hi: m.to(fhi) }
                      : { t: r.t, v: fv, lo: flo, hi: fhi });
        }
        if (!fine.length) fine = null;
      }
      return {
        value: (v == null || !isFinite(v)) ? null : v,
        // The tile's unit follows the display mode too. In US this is the authored string
        // (TILE_UNIT.us) and the write is a no-op; in SI it is what makes the tile agree
        // with the chart chip beside it, which is the whole of #237.
        unit: tileUnit(id),
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
        // decimal back without re-measuring the tile you are changing. Since #238 the
        // resolution is PER DISPLAY UNIT (TILE_UNIT.d): the sigma above is a property of
        // the instrument, but how many digits it hides behind is a property of the unit —
        // 0.56 psi and 0.0039 MPa are the same noise and want 0 and 2 decimals.
        decimals: tileDigits(id, b),
        // sim clock drives the tile's sampling window (see comp_indicator_panel)
        t: (s.metadata && s.metadata.sim_time != null) ? s.metadata.sim_time : null,
        // …and the SPEED sizes that window. A fixed 3 minutes of SIM time is ~0.05 s of
        // wall clock at 3600x: sim seconds per broadcast is accel x 0.1, so a 180 s window
        // held 3 samples at 600x and ONE at 3600x — the time-trim then deleted everything
        // but the newest and the trace collapsed to a single vertex. The six vital gauges
        // were simply BLANK above ~600x.
        //
        // DISCRETE, not accel x 180, for the reason CHART_WINDOWS is already a table: the
        // requested acceleration is a target the engine does not meet, so a window sized
        // off the number never fills. Capped an order of magnitude below the strip chart's
        // — the tile's job is "what has this been doing recently"; the history belongs to
        // the chart underneath it.
        speed: (s.metadata && s.metadata.time_acceleration) || 1,
        fine: fine,
        // Display unit, so the tile can drop a history recorded in the OTHER one. st.min /
        // st.max flip with the unit but `hist` does not, so without this the trace shows a
        // °F→°C step discontinuity. It was invisible while the axis re-fitted every paint;
        // with the axis now HELD it would paint a wrong band and keep it.
        unitKey: U(),
        min: sc.min, max: sc.max,
        normLo: b.normLo, normHi: b.normHi,
        alarmLo: b.alarmLo, alarmHi: b.alarmHi,
        tripLo: b.tripLo, tripHi: b.tripHi,
        // '' (not null) so the tile CLEARS a stale note rather than keeping the last one —
        // `undefined` means "leave alone" in the component's tri-state contract.
        note: b.note || '', noteKind: b.noteKind || 'trip'
      };
    };
  }

  // Clickable-valve toggle targets (component onControl 'toggle')
  var VALVE_TOGGLE = {
    imrpp2g2m8k: function (open) { cmd({ action: 'set_afw_block', open: open }); },   // AFW block valve (independent of pump START/STOP)
    imrpp99kx2y: function (open) { cmd({ action: open ? 'open_msiv' : 'close_msiv' }); },
    imrppb3kuav: function (open) { cmd({ action: open ? 'open_block_valve' : 'close_block_valve' }); },
    imrppxt2aqd: function (open) { cmd({ action: open ? 'open_accumulator_valve' : 'close_accumulator_valve' }); },
    // The PORV itself (#125). comp_porv has ALWAYS drawn a hit circle, a hover ring and a
    // pointer cursor and emitted onControl('toggle') — it was built to be operated and
    // then never wired, so the click landed on nothing. Opening uses the OPERATOR's
    // command (`open_porv_manual`), which a scenario can lock out; closing uses the shared
    // `close_porv`, deliberately, because that is the TMI-2 action and a stuck valve must
    // be able to defeat it. Do not route this around the failure.
    porv: function (open) { cmd({ action: open ? 'open_porv_manual' : 'close_porv' }); }
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
    pmrr499yfkb: function (s) { return satTempC(IN(s).steam_pressure); }, // main steam → turbine (TCV out)
    pmrr0u9nib3: function (s) { return satTempC(IN(s).steam_pressure); }, // steam dump → condenser bypass
    // Re-cut steam header (#371 diagram): SG → upstream tee → MSIV → downstream tee,
    // with the ADV branch off the upstream tee and the condenser dump off the downstream.
    pmsgu7y5cn4: function (s) { return satTempC(IN(s).steam_pressure); }, // SG steam-out → upstream tee
    pmsgu7yzs7q: function (s) { return satTempC(IN(s).steam_pressure); }, // upstream tee → MSIV
    pmsgu7mar1c: function (s) { return satTempC(IN(s).steam_pressure); }, // MSIV → downstream tee
    pmsgu156z57: function (s) { return satTempC(IN(s).steam_pressure); }, // downstream tee → TCV
    pmsgu16h63l: function (s) { return satTempC(IN(s).steam_pressure); }, // downstream tee → condenser dump
    pmsgugdumjc: function (s) { return satTempC(IN(s).steam_pressure); }, // upstream tee → ADV valve
    pmsgum4orcr: function (s) { return satTempC(IN(s).steam_pressure); }, // ADV valve → atmosphere
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
    pms3l83etan: function () { return 25; },                                    // CW supply (cold)
    // --- CVCS, ECCS, accumulators and AFW (#357 items 1 and 2). These eleven runs were the
    // last on the board still painting an AUTHORED temperature, and every one of them was
    // wrong in a way you can see: the letdown line rendered at 60 °C — cold-blue — while the
    // cold leg it takes suction from ran green at 292 °C, and the charging pair was authored
    // BACKWARDS, 102 °C on the pump SUCTION against 60 °C on the discharge that returns to the
    // RCS. (#350 gave all of them live FLOW; their colour was never revisited.)
    //
    // Two of the three groups tie to numbers this plant already owns, so they are not fits:
    //   letdown / charging discharge → `tcold`, because that is the node they connect to.
    //   ECCS + accumulators → `emergency.eccs_temp_c`, the RWST/SIT temperature the engine
    //     actually injects at (40 °C / 104 °F) — the same constant `stepCoolant`'s quench term
    //     reads, so the pipe cannot disagree with the physics.
    // The suction side is the third: the volume control tank and the condensate storage tank
    // are NOT modelled, so those runs take the RWST temperature as the nearest thing this
    // plant has to "a tank at containment ambient". DECLARED, not measured — what matters for
    // the board is that suction reads COOLER than discharge, which is the relationship that
    // was inverted.
    pms3l18h7og: function (s) { return IN(s).tcold; },      // letdown: cold leg → CVCS
    pms3l178g39: function (s) { return IN(s).tcold; },      // charging pump discharge → cold leg
    pms3x29yoq0: function () { return ECCS_T(); },          // charging pump SUCTION (tank-side)
    pms3x28fhhm: function () { return ECCS_T(); },          // VCT make-up leg → charging suction
    pms3xe4ia7n: function () { return ECCS_T(); },          // RWST cross-tie → charging line
    pms3x1rbkod: function () { return ECCS_T(); },          // RWST → ECCS pump suction
    pms3ytv6lm2: function () { return ECCS_T(); },          // ECCS pump discharge
    pms3l053p3x: function () { return ECCS_T(); },          // accumulator shutoff B
    pms3x3czo4r: function () { return ECCS_T(); },          // accumulators → cold leg
    pms31ro0qi0: function () { return ECCS_T(); },          // AFW valve A → feed line
    pms3kx59u4x: function () { return ECCS_T(); }           // CST → AFW valve B
  };

  // ================================================================ LIVE LINE FLOW (#350)
  // A pipe's dash VELOCITY, its RUN/STILL state and (on the relief line) its PHASE come from
  // the plant, not from the authored diagram *(OWNER, 2026-08-04, #350 item 10: "All dashed
  // lines rate of movement needs to scale with the flow rate.")*.
  //
  // ONE NUMBER PER SYSTEM, and that is the whole design. #231 already tried folding a
  // component's own 0–100 rate into its dash velocity and had to revert it, because every
  // fitting then ran at a different speed from the pipe it joins and the dashes stepped at
  // the joint. The fix is not to give up on live speed, it is to make the number a property
  // of the SYSTEM rather than of the element: `lineFrac` computes one fraction-of-rated per
  // train, and the pipes, tees, crosses, valves and pumps on that train all read it. Two
  // elements that meet are on the same train by construction, so they cannot disagree.
  //
  // Fractions are of RATED flow for that line, so 1.0 is the look the board has always had
  // and the whole board still reads 1.0 at hot full power — this changes nothing at the
  // operating point and everything on the way to and from it.
  // EVERY ENTRY IS ONE LINE'S OWN FLOW, not a whole plant area's — that distinction is what
  // lets the run-state below be AUTHORITATIVE rather than merely advisory. The first cut
  // lumped the steam dump in with main steam and would have drawn a shut dump valve passing
  // full flow at power, which is precisely the #236 class this board keeps re-learning.
  // #408 real scale: normal CVCS full-scale = orifice-A NOP flow (30 gpm on the
  // declared volume). The old 0.030 was the retired currency — dividing the real
  // 6.7e-5 frac/s by it quantized every CVCS line to dash-speed 0 (the #350/#364
  // ladder trap: a running system painted PAUSED).
  var CHG_RATED = 30 / 450000;
  var DUMP_CAP = 0.40;      // steam dump capacity, fraction of rated steam (the #220 40 %)
  var ADV_CAP = (_SG.adv_max != null ? _SG.adv_max : 0.10);   // #371, from engine config
  function lineFrac(s) {
    var i = IN(s), c = CS(s), t = s.true_state || {};
    var porvFlowing = (t.porv_open != null ? !!t.porv_open : (i.porv_indicator === 'open'))
      && c.porv_block_open !== false;
    var chg = (i.charging_flow || 0) / CHG_RATED;
    var eccs = i.hpi_flow || 0;
    return {
      // The RCS elbow-tap channel, NOT `rcp_running`. This is what makes item 18 fall out:
      // with the pumps stopped `rcs_flow` still reads the buoyancy-driven flow (#325 —
      // MEASURED 4.47 % two minutes into a station blackout), so the loop keeps a slow crawl
      // instead of freezing solid, and it does it from an INDICATION rather than from
      // `true_state.natural_circulation`, which #325 deliberately declined to put on the board.
      primary:  (i.rcs_flow || 0) / 100,
      surge:    surgeFrac(s),
      spray:    (c.spray_valve_pct || 0) / 100,
      relief:   porvFlowing ? 1 : 0,
      // SG outlet and the header up to the TCV carry EVERYTHING leaving the generator;
      // the two branches past it carry their own share.
      steam:    i.sg_steam_flow || 0,
      turbine:  i.steam_demand_low ? 0 : (i.steam_flow || 0),
      dump:     ((i.steam_dump_valve || 0) > 2) ? (i.steam_dump_valve / 100) * DUMP_CAP : 0,
      // ADV (#371) — scaled by its own capacity, which is a quarter of the condenser
      // dump's, so a fully-open ADV animates slower than a fully-open bypass. That is
      // the honest picture: it is the smaller valve.
      adv:      ((i.adv_valve || 0) > 2) ? (i.adv_valve / 100) * ADV_CAP : 0,
      feed:     i.fw_flow || 0,
      afw:      i.afw_flow || 0,
      // The one run downstream of the feed tee: it carries main feed AND auxiliary feed, so
      // it is still only when BOTH are — item 9, which no single-train gate could express.
      sgfeed:   (i.fw_flow || 0) + (i.afw_flow || 0),
      cond:     i.condensate_flow || 0,
      // Circulating water has no flow transmitter on this board; it runs or it does not,
      // and it stops with the circ pumps when the plant loses its cooling supply (item 14).
      cw:       i.condenser_cooling_available ? 1 : 0,
      charging: chg,
      letdown:  (i.letdown_flow || 0) / CHG_RATED,
      eccs:     eccs,
      // Charging-pump suction takes the VCT and the RWST cross-tie, so it moves for either.
      chgsuct:  Math.max(chg, eccs),
      accum:    i.accumulators_discharging ? Math.max(0.15, i.accumulator_flow || 0) : 0
    };
  }

  // ---- the speed ladder ------------------------------------------------------------
  // A dash-speed change is a visual DISCONTINUITY and cannot be made otherwise — CSS
  // computes progress as ((now − delay) / duration) mod 1 and `now` grows without bound, so
  // retiming an animation moves the dashes by an amount that depends on how long the page
  // has been open (std_pipe.setFlowSpeed carries the derivation). Quantising is what makes
  // that acceptable: a line only re-times when it genuinely changes flow band, the hop is at
  // most one dash period, and every element on the system hops together.
  //
  // Steps are fractions of rated. 0 means STILL (the line is paused outright, not crawled).
  // A 0.02 step was added for the #364 decay refit (2026-08-05). The bottom of this ladder
  // has to sit BELOW this plant's natural-circulation flow, or buoyancy-driven flow quantises
  // to 0 and the board paints a stopped loop — which is precisely the distinction item 18 and
  // the comment on `speedOf` say the board exists to show. Correcting decay heat moved that
  // flow 4.47 % -> 3.64 % (W ∝ Q^⅓, so a 2.4x cut in heat is a 1.34x cut in flow), which put
  // it under the old 0.04 floor: measured, `board_check` reported the primary loop, the RCP
  // discharge run and the RCP suction run all PAUSED during a blackout while `rcs_flow` read
  // 3.64 %. If natural circulation is ever re-tuned again, check this floor with it.
  var FRAC_STEPS = [0, 0.02, 0.04, 0.08, 0.15, 0.25, 0.40, 0.60, 0.80, 1.00, 1.25, 1.60, 2.00];
  var BAND_HYST = 0.15;      // overshoot past a boundary, as a fraction of the step gap
  var _band = {};
  function bandOf(key, frac) {
    if (!isFinite(frac) || frac < 0) frac = 0;
    var i = FRAC_STEPS.length - 1;
    while (i > 0 && frac < FRAC_STEPS[i]) i--;
    var prev = _band[key];
    // Hysteresis on ADJACENT bands only. A jump of two or more bands is a real transient
    // (a trip, a break, a pump start) and must not be held back by a deadband.
    if (prev != null && Math.abs(i - prev) === 1) {
      var lo = Math.min(i, prev), edge = FRAC_STEPS[lo + 1], gap = edge - FRAC_STEPS[lo];
      if (i > prev ? frac < edge + gap * BAND_HYST : frac > edge - gap * BAND_HYST) i = prev;
    }
    _band[key] = i;
    return FRAC_STEPS[i];
  }
  // Fraction of rated → dash speed multiplier. Linear, because the dash IS the fluid: twice
  // the flow through the same pipe is twice the velocity. Floored at 0.1 (StdPipe's own
  // minimum) so a trickle reads as a slow crawl rather than as a stopped line — the
  // difference between "no flow" and "4 % flow" is exactly what item 18 asks the board to show.
  function speedOf(frac) { return frac <= 0 ? 0 : Math.max(0.1, Math.min(4, frac)); }

  // Per-snapshot cache: lineFrac reads ~15 instruments and every pipe, fitting and pump asks
  // for it. Same once-per-snapshot idiom as IN().
  var _lf = { snap: null, out: null };
  function LF(s) {
    if (_lf.snap === s) return _lf.out;
    _lf.snap = s; _lf.out = lineFrac(s);
    return _lf.out;
  }
  // The banded speed for a system, for anything that draws on it.
  function sysSpeed(s, sys) { return speedOf(bandOf(sys, LF(s)[sys] || 0)); }

  // ---- pressurizer surge (#350 item 26) --------------------------------------------
  // The surge line is the one pipe on the board whose flow REVERSES in normal operation:
  // an insurge fills the pressurizer when the RCS expands, an outsurge drains it when the
  // RCS shrinks. It was drawn as a fixed one-way run, so it showed a permanent flow into a
  // pressurizer whose level was falling.
  //
  // Derived from the INDICATED level rate rather than from a published surge term, because
  // there is no published surge term — and level rate is exactly the quantity a surge IS
  // (#337 states the whole law per unit pressurizer level rate). Sign: rising level = insurge
  // = flow INTO the pressurizer = the authored direction.
  //
  // The rate is smoothed over SURGE_TAU seconds of SIM time. Two reasons, and the second is
  // the load-bearing one: the raw difference of a damped indication across one broadcast is
  // mostly quantisation, and an unsmoothed sign would flip the line's direction several times
  // a second on a plant that is merely holding level.
  var SURGE_TAU = 8;             // s — smoothing on the level derivative
  var SURGE_FULL = 0.60;         // %/s of pressurizer level that reads as a full-speed surge
  var SURGE_DEAD = 0.012;        // %/s below which the line is STILL (level is being held)
  var _surge = { t: null, level: null, rate: 0 };
  function surgeRate(s) {
    var lv = IN(s).pzr_level;
    var t = (s && s.metadata && s.metadata.sim_time != null) ? s.metadata.sim_time : null;
    if (lv == null || !isFinite(lv)) return 0;
    if (t == null || _surge.t == null || t < _surge.t) {   // fresh mount, reset or rewind
      _surge.t = t; _surge.level = lv; _surge.rate = 0; return 0;
    }
    var dt = t - _surge.t;
    if (dt > 0) {
      var raw = (lv - _surge.level) / dt;
      _surge.rate += (raw - _surge.rate) * (dt / (SURGE_TAU + dt));
      _surge.t = t; _surge.level = lv;
    }
    return _surge.rate;
  }
  function surgeFrac(s) {
    var r = surgeRate(s);
    return Math.abs(r) < SURGE_DEAD ? 0 : Math.abs(r) / SURGE_FULL;
  }
  // +1 = insurge (the authored direction, hot leg → pressurizer), −1 = outsurge.
  function surgeDir(s) { return surgeRate(s) < 0 ? -1 : 1; }

  // ---- pipe id → the system it belongs to ------------------------------------------
  // Same fragile contract as PIPE_TEMP: these are PIPE ids and a pipe id changes whenever
  // its run is re-drawn in the builder, so selfTest asserts every key is still live.
  var PIPE_SYSTEM = {
    // RCS loop — hot leg, cold leg, and the spray tap off the cold leg
    pms2ktktnan: 'primary', pms2ktjq4ma: 'primary',
    pms2kovvgnh: 'primary', pms2kozvu94: 'primary', pms2kp1148p: 'primary',
    pms3yu50gqp: 'primary', pms3yu3x86i: 'primary', pms3x37ze9p: 'primary',
    pms3ytzwwqw: 'spray',
    pms2kupl3b2: 'surge',
    // main steam — SG outlet and the header carry the total; the TCV and dump branches
    // carry their own share, which is why they are separate systems (see lineFrac).
    pmsgu7y5cn4: 'steam', pmsgu7yzs7q: 'steam', pmsgu7mar1c: 'steam', pmsgu156z57: 'steam',
    pmrr499yfkb: 'turbine', pmrr14xbt2h: 'turbine',
    pmsgu16h63l: 'dump', pmrr0u9nib3: 'dump',
    // The ADV branch is its own system — it must animate when the condenser dump is dead.
    pmsgugdumjc: 'adv', pmsgum4orcr: 'adv',
    // relief path — the whole run is either passing or dead-ended
    pms3tda86bw: 'relief', pms3tcop5ni: 'relief', pms3tdwi5n9: 'relief',
    // condensate / feedwater
    pms2ihy5skm: 'cond', pmrr0uryodr: 'cond', pmrr0ustj2z: 'feed',
    pms31qm4iqh: 'feed', pms31qjbqhy: 'sgfeed',
    pms31ro0qi0: 'afw', pms3kx59u4x: 'afw',
    // circulating water
    pms3l89l83h: 'cw', pms3l83etan: 'cw',
    // CVCS + ECCS. `pms3x28fhhm` is the VCT leg (normal make-up) and `pms3xe4ia7n` the RWST
    // cross-tie — the pair #236 spent a session separating, so they must NOT share a system.
    pms3l178g39: 'charging', pms3x28fhhm: 'charging', pms3x29yoq0: 'chgsuct',
    pms3xe4ia7n: 'eccs', pms3x1rbkod: 'eccs', pms3ytv6lm2: 'eccs',
    pms3l18h7og: 'letdown',
    pms3l053p3x: 'accum', pms3x3czo4r: 'accum'
  };

  // Live phase overrides. Only the relief path has one, and it is item 6.
  //
  // WHAT THE PORV IS PASSING IS THE POINT OF THE TMI-2 LESSON. The relief run was authored
  // `phase: "water"` on two of its three legs, so a stuck-open PORV vented blue water at
  // 2200 psi in every state of the plant. A PORV on a pressurizer with a steam bubble
  // relieves STEAM; it only passes water once the pressurizer goes SOLID, which is the
  // condition the operator has to recognise and is the reason the relief is worth watching.
  //
  // Solid is read off the INDICATED level against the going-solid trip setpoint, the same
  // number the protection uses, rather than a board-local literal.
  function pzrSolid(s) {
    var sp = tripSp('pzr_level', 'high', 97);
    return (IN(s).pzr_level || 0) >= sp - 3;
  }
  var PIPE_PHASE = {
    pms3tda86bw: function (s) { return pzrSolid(s) ? 'water' : 'steam'; },
    pms3tcop5ni: function (s) { return pzrSolid(s) ? 'water' : 'steam'; },
    pms3tdwi5n9: function (s) { return pzrSolid(s) ? 'water' : 'steam'; }
  };
  // Live direction overrides (+1 as drawn, −1 reversed).
  var PIPE_DIR = { pms2kupl3b2: surgeDir };

  function pipeFlowOf(id, s) {
    var sys = PIPE_SYSTEM[id];
    if (!sys) return null;
    var frac = bandOf(sys, LF(s)[sys] || 0);
    var ph = PIPE_PHASE[id], dr = PIPE_DIR[id];
    return {
      speed: speedOf(frac),
      active: frac > 0,
      phase: ph ? ph(s) : null,
      dir: dr ? dr(s) : 1
    };
  }

  // ================================================================ TRIP BLOCKS menu (task #5)
  // Only the 4 blockable trips (owner ruling).
  // `sub` may be a function (s) -> string where the caption carries a unit — it is rendered
  // per popover open, so it follows the display mode like every other number on the board.
  // The pressure one also stops the setpoint being a hand-copied literal: it read a flat
  // "1800 psi" while the table said 12.41 MPa, which is 1799.9 and rounds there by luck.
  // The captions are ALL CAPS *(OWNER DIRECTIVE, 2026-08-04: "All text should be in all caps
  // except units should follow standard unit conventions for capitalization.")*. Note the
  // pressure one interpolates its unit through `uStr`, so the exemption is structural here —
  // the caps live in the literal prose and the unit string is never touched by it.
  var BLOCKABLE_TRIPS = [
    { id: 'lo_press', label: 'PZR PRESS LO-LO',
      sub: function () { return 'REACTOR TRIP · ' + dP(tripSp('primary_pressure', 'low', 12.41)) + ' ' + uStr('press', 'psi') + ' (P-11 PERMISSIVE)'; } },
    { id: 'lo_flow', label: 'RCS LOW FLOW', sub: 'REACTOR TRIP · LOSS OF FLOW (P-7 PERMISSIVE)' },
    // #314. Blockable, so it MUST be listed here or the player carries a reactor trip they
    // cannot see or manage — and it shares lo_flow's P-7 permissive because WTSM 12.2
    // §12.2.3.12 blocks ALL the loss-of-flow trips together below P-7.
    { id: 'rcp_breaker', label: 'RCP BREAKER', sub: 'REACTOR TRIP · PUMP BREAKER OPEN (P-7 PERMISSIVE)' },
    { id: 'ir_high', label: 'IR HIGH FLUX', sub: 'STARTUP TRIP · ~20% (P-10 PERMISSIVE)' },
    { id: 'pr_low_setpoint', label: 'PR HIGH (LOW SETPT)', sub: 'STARTUP TRIP · 25% (P-10 PERMISSIVE)' }
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
      txt.appendChild(mk('div', 'sub', typeof t.sub === 'function' ? t.sub(snap) : t.sub));
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
  // SCRAM-button caption per RPS-reset refusal code (#75). Deliberately terse: the strip
  // under SCRAMMED is 9 px with wide tracking, so the full sentence goes to the scanner bar
  // on the press (the kernel's register-aware `message`) and this says only which condition
  // is holding. An unrecognised code falls back to a plain RESET BLOCKED rather than
  // rendering a raw enum at the operator.
  var SCRAM_RESET_NOTE = {
    RODS_NOT_INSERTED:   'RODS NOT AT BOTTOM',
    TRIP_SIGNAL_PRESENT: 'TRIP SIGNAL STANDING',
    PERMISSIVE_NOT_MET:  'PERMISSIVE NOT MET',
  };

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
    'Reactor Period': 'ims89mkaj2r', 'Startup Rate': 'imro6qsncb9',
    // Tavg, plant pressure and SG level are no longer standalone readouts on the mimic —
    // V2 promoted all three into the vital-parameter tile strip, so these labels glow the
    // tile. (Highlighting an indication is checklist hover-glow only; campaign beats
    // highlight controls, so run_campaign never names these.)
    'Tavg': 'ims2immk7ks', 'Plant Pressure': 'ims2immsvn6', 'SG Level': 'ims2imn1nny',
    'Steam Flow': 'ims3wm0d0bu', 'Feed Flow': 'imrsgkz4lq0',
    // Aliases for the `control` strings the checklist steps use (so the step-hover
    // fallback in ui/app.js resolves without authoring an explicit `hl` on each).
    'Boron control': 'imrmtlyf64y', 'RCP Run/Stop': 'imrobpq4a70', 'Dump SP': 'imrop5ouw7h',
    // ADV (#371) — both names point at the card, so highlighting either lights the
    // whole group, the same way 'Dump SP' points at the STEAM DUMP card above.
    // The ATMOS DUMP card is AUTHORED now (#371) — the driver-injected box it replaced
    // is gone, and both names point at the authored box so a highlight lights the group.
    'ADV': 'imsgt1ebv1d', 'Atmospheric Dump': 'imsgt1ebv1d', 'ADV SP': 'imsgt1ebv1d',
    'Pressure SP': 'imrsg8b7b9o', 'Accumulator valve': 'imrppx5n1ay',
    'Turbine — Connect Grid': 'imro8k5pzem',
    // The rods_tavg channel toggle (EXTRA_ITEMS, #237) — the control the old
    // "Automate → Reactor" directives now point at.
    'Rod AUTO': 'ims5glucngg',
    // #341 / #319 item 2 — the post-trip procedure's restore step points here.
    'MFW Restore': 'bdMfwRestore'
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
      // Manual rule (kernel-evaluated, see getRpsState): BLOCK is offered while the trip is
      // not yet asserted, or inside its permissive. CLEAR is never withheld — `can_clear` is
      // just "there is a block to clear", so this button will happily scram the plant when
      // the block it removes was the only thing holding an asserted trip off. That is
      // deliberate and prototypical; the earlier comment here claimed the reverse.
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
  // Authored items the driver DELETES at mount. Same contract as DOC_PATCHES — absolute and
  // idempotent — and the same reason for existing: the generated doc comes out of the builder
  // and cannot be hand-edited without being overwritten by the next re-export.
  //
  // REACTIVITY *(OWNER DIRECTIVE, 2026-08-04: "Remove reactivity and more period up to where
  // reactivity was.")*, #350 item 5. It is a true-state teaching overlay — real plants infer
  // reactivity from rate meters and rod worth curves rather than measuring it — and PERIOD,
  // which sat under it, carries the same information in the form an operator actually works
  // in: a short period IS positive reactivity, and it is the number the startup-rate block and
  // the 1/M plot are both written against. Two readouts for one fact is DESIGN_CRITERIA Q4.
  // PERIOD takes the vacated slot (see EXTRA_ITEMS) rather than leaving a hole.
  var DOC_REMOVE = {
    // RHR AUTO button (#453). The RHR auto-entry actuation it armed is gone — see the RHR
    // block in CONTROLS above and the sourced note in pwr_control.js — so the button armed
    // nothing. ALIGN and ISOLATE move up into its slot (DOC_PATCHES below) rather than
    // leaving a hole, the same treatment PERIOD got when REACTIVITY was removed.
    ims3xfl3xn6: 1,    // AUTO (RHR) — nothing left to arm
    imro6rdwwdn: 1,    // reactivity readout (pcm)
    imrshokxy4u: 1,    // its "REACTIVITY" caption
    // The labelled STEAM DUMP readout tile. The 2026-08-05 diagram re-export drags it to
    // (1247, 875) — clear of every card, 90 px below the lowest board content, and the sole
    // reason the board's bounding box extended into an empty band that shrank every other
    // tile. In the same export the owner added `imsgunuyvon` at (1235, 290): a right-anchored
    // % tag sitting beside the condenser dump valve, the same idiom as the new ADV tag beside
    // `imsgu6qi776` and the turbine-flow tag beside the TCV. Dragging a tile off the canvas
    // while placing its replacement on the schematic is as explicit as an export gets, so this
    // is a RETIREMENT, not a re-home: carrying both would put `steam_dump_valve` on the board
    // twice under two labels, which is the duplicate-authority shape the board rules forbid.
    imrzmlyafa3: 1
  };

  // The CVCS flow captions, enlarged *(OWNER DIRECTIVE, 2026-08-04: "Make the \"Charging\" and
  // \"letdown\" text larger. Try to match the \"BORON HOLD STATUS\" size. see if that fits.")*,
  // #350 item 27. A readout's caption is derived from its reading size (fontSize x 0.66), which
  // put these two at 11 px against the 14 px of the BORON STATUS caption a few tiles away —
  // so `labelSize` overrides the derivation for these two without enlarging the reading, and
  // without moving STEAM DUMP (the third readout, which is not part of the ask).
  // MEASURED to fit: 'CHARGING' is 8 characters, and IBM Plex Mono at 14 px is 8.4 px/char,
  // so 67 px inside a 95 px tile.
  var DOC_PATCHES = {
    pipes: {
      // Turbine exhaust → condenser steam inlet. The route is authored orthogonally, but its
      // two waypoints sit a pixel or two off the ports they line up with, so both "vertical"
      // legs lean. Pin each to the real port x — MEASURED off `RD.PwrBoard.ports()`, never
      // computed from the authored `left`: an rAnchor item's rendered edge is not its
      // authored one, and the whole point of this patch is that both x values track a port.
      //   wp[0] = `turbineGenerator/exhaust-out`.x = 1364
      //   wp[1] = `condenser/steam-in`.x           = 1341   (the condenser item patch below
      //                                                      moves it — always that left + 148)
      // y = 300 for both: the crossover leg has to clear the turbine tile's bottom (295) and
      // stay above the condenser's top (325), and 300 is the authored value that does.
      //
      // BOTH POINTS MUST BE GIVEN — `applyDocPatches` replaces the waypoint LIST wholesale,
      // so a patch that means to move one point still has to restate the other. That is
      // exactly how this went wrong: on 2026-08-05 the #371b re-export moved the turbine
      // 210 px left and 40 px up, the fix-up updated wp[1] (1551 → 1341) and left wp[0] at
      // its pre-export 1574,340 — which by then was INSIDE the TURBINE-GENERATOR card
      // (imro8k5pzem, x 1455–1650, y 190–360), so the exhaust run vanished under it.
      // Nothing caught it for a day: the selfTest below only checks that a patch's target id
      // still resolves, never that its coordinates still mean anything, and board_check
      // pinned only the LAST waypoint. The mirror pin on wp[0] was added with this fix.
      pmrr14xbt2h: { waypoints: [[1364, 300], [1341, 300]] },
      // RCP suction/discharge swap, pipe half (#236) — see the imrobpq4a70 item patch
      // below. Same geometric endpoints (the two nozzle positions are unchanged); only
      // the port NAMES they bind to change, so the loop enters at suction and leaves at
      // discharge. The authored flowDir:'fwd' on the outlet pipe existed solely to
      // overpower the backwards port semantics — with them corrected it is dropped and
      // the direction comes from the ports, like every other pipe.
      pms2kozvu94: { props: { to: 'imrobpq4a70/suction' } },
      pms2kp1148p: { props: { from: 'imrobpq4a70/discharge', flowDir: null } },
      // SG outlet → upstream steam tee, authored `phase: 'water'` in the 2026-08-05 re-export
      // *(OWNER, 2026-08-05: "the pipe coming off the SG is water green, it should be steam")*.
      // The other six runs the same export added are all authored steam; this one leaves the
      // steam nozzle, so it is a slip in the drawing rather than a claim about the plant. The
      // phase drives the pipe's COLOUR only — flow state comes from PIPE_SYSTEM — so this is
      // purely the fix the owner asked for, with nothing else riding on it.
      pmsgu7y5cn4: { props: { phase: 'steam' } }
    },
    items: {
      // PORV discharge → quench-tank box. The box's top port is authored 2 px left of the
      // PORV outlet above it, so the drop leans instead of falling straight in.
      imrsi2svtgn: { ports: { ptmrsi3kjfr5: { off: 17 } } },
      // STEAM DUMP readout (#235): authored left 1410 / width 65 — 4 px under the dump
      // valve tile (ends 1414) and too narrow for its own label. 1416/72 clears the valve
      // and, with the .bd-ro-label letter-spacing fix, fits "STEAM DUMP" with room.
      // CVCS flow captions to 14 px — #350 item 27, see the note above DOC_PATCHES.
      // NIS caption authored "d TEMP AVG" — the builder text lost its Δ (#235).
      imrsho1qu6t: { props: { text: 'Δ TEMP AVG' } },
      /* PERIOD readout: up 5 px and right-aligned with the reactivity value above it (#516
       * item 4). Both are `rAnchor`, so `left` is the RIGHT edge — they were authored at 750
       * and 735, a 15 px mismatch on two numbers stacked in the same card, which is half of
       * why the pair looked accidental. The 5 px lift also evens the label-to-value gaps
       * (REACTIVITY 415 -> 430 is 15; PERIOD was 450 -> 460, now 450 -> 455). Patched here
       * rather than in pwr_board_data.js, which is GENERATED — a re-export would undo it. */
      ims89mkaj2r: { props: { top: 455, left: 750 } },
      // RHR ALIGN / ISOLATE move up 30 px each into the slot the removed AUTO button
      // vacated (#453) — authored 665/695 under AUTO at 635. The card is 175 tall from
      // top 605; with AUTO gone, leaving them where they were would put a 30 px hole under
      // the card title. 30 is the authored button pitch, so the spacing is unchanged.
      ims3wg27iif: { props: { top: 635 } },
      ims3xfeye1q: { props: { top: 665 } },
      // SG FEED rate box: 1740 → 1750, the other half of the RESTORE widening (#357). With
      // RESTORE at 68 wide it ends at 1738, so the old 1740 left a 2 px gap; 1750 restores a
      // 12 px one, comparable to the 10 px between AUTO/MAN/OFF in the row above. It also
      // BALANCES the card, which is what the owner asked for: the box is 105 wide, so 1750 puts
      // its right edge on 1855 — flush with OFF's right edge above it and 5 px inside the card,
      // mirroring RESTORE's 5 px left margin. Patched here, not in `pwr_board_data.js`, because
      // that file is GENERATED and a re-export would silently undo the edit.
      // ---- ALL-CAPS board text -------------------------------------------------------
      // *(OWNER DIRECTIVE, 2026-08-04: "All text should be in all caps except units should
      // follow standard unit conventions for capitalization.")* Four turbine-side captions
      // were authored in title case and are the ONLY board text that was not already caps —
      // MEASURED by mounting the board headless and reading every rendered text node inside
      // `.pwr-board-stage`: 225 nodes, 34 not all-caps, and 30 of those 34 are UNITS
      // (`bd-unit` / `bd-num-unit` spans plus the three "0-2500 ppm"-style range captions),
      // which the directive explicitly exempts. Patched here rather than in
      // `pwr_board_data.js` because that file is GENERATED — a re-export would silently undo
      // an edit there, which is the whole reason DOC_PATCHES exists.
      // `board_check.html` asserts the policy over the rendered board, so a future re-export
      // that reintroduces title-case text reddens the gate instead of shipping quietly.
      // AUX FEED WATER makes room for the THROTTLE row (#562, see bdAfwThrottle in
      // EXTRA_ITEMS). The card grows 60 -> 115 and CONDENSER COOLING plus its three children
      // drop 55 px. MEASURED off the doc before authoring: AUX FEED WATER 1455,650 195x60
      // (buttons 680..705, so 705..710 is all the slack it had); CONDENSER COOLING 1455,715
      // 195x70 with children at 738/740/755; NOTHING in the 1430..1700 column below 785.
      //
      // THE FIRST NUMBERS WERE WRONG AND ONLY THE BROWSER SAID SO — the same trap the PZR
      // SPRAY readout above records. Authored at h100 / top 755 on the arithmetic that a
      // number tile is ~25 px like the buttons beside it; MEASURED in Edge, a number box
      // renders ~47 px because it carries the ▲▼ nudge arrows, so the box overran its own
      // card by 12 px and lapped CONDENSER COOLING by 6. h115 with the box at 710 puts it at
      // 710..757 inside a card ending 765, and the neighbour starts at 770.
      // Patched here, never in pwr_board_data.js — that file is GENERATED and a re-export
      // would silently undo an edit there.
      // The grid pair becomes the turbine LATCH / TRIP pair (#551/#559/#567). Labels patched
      // here because pwr_board_data.js is GENERATED — a re-export would silently restore
      // FOLLOW / MAN over controls that no longer do that.
      imro8ktzs3u: { props: { label: 'LATCH', name: 'Turbine latch  ·  sim: latch_turbine' } },
      imro8lddxi:  { props: { label: 'TRIP',  name: 'Turbine trip  ·  sim: trip_turbine' } },
      imrmssto6d:  { props: { height: 115 } },
      ims3v3lpw5v: { props: { top: 770 } },
      ims3xoryten: { props: { top: 793 } },
      ims3v42jghn: { props: { top: 795 } },
      ims3xp168iy: { props: { top: 810 } },
      imrppvnburd: { props: { text: 'LOAD' } },
      imrppilyy52: { props: { text: 'OUTPUT' } },
      imrppim9gdg: { props: { text: 'GOVERNOR' } },
      imrppgddg4e: { props: { text: 'TURBINE' } },
      // ROD AUTO active colour: authored #9fb3c4 (pale grey — reads WHITE when lit) against
      // #5aad7c on every other automation control *(OWNER, 2026-08-01: "the auto rod button
      // doesn't follow the color convention. Auto on it should be green not white.")*.
      // buildButton uses the authored item colour AS the active-state colour (--bd-color), so
      // this one control announced "the controller has it" in a different colour from BORON ON,
      // SG FEED AUTO and STEAM DUMP AUTO — and it is the control the #289 lineup change just
      // made matter, since rods now come up engaged. #5aad7c is the same green as BD_OK above.
      // Fold it into the builder and delete this entry; selfTest pins the value meanwhile.
      // `top` is the 2026-08-02 re-spacing below — DO NOT split these into two entries: this
      // is an object literal, so a second `ims5glucngg:` key silently REPLACES this one and
      // the colour patch disappears with no error. That is exactly what happened while writing
      // the re-spacing, and the two AUTO-green pins are what caught it.
      ims5glucngg: { props: { color: '#5aad7c', top: 388 } },
      // (TRIP BLOCKS carried a top/height patch here until the 2026-07-28t re-export —
      // the builder now authors it at 425/30, so the patch was pinning what the diagram
      // already says. Dropped rather than kept: a patch that agrees with the doc is a
      // silent trap the day the doc changes.)
      // STEAM DUMP card: at ≥1000 psi the right-anchored STEAM PRESS value grew left
      // into its caption ("STEAM PRESS1194 psi", #235 comment / #237). Move the value
      // anchor to the panel edge (matching its 1845-1855 siblings) and the caption
      // 5 px left for ~15 px of clearance at 4 digits.
      // RCP suction/discharge swap, item half (#236): the loop physically enters this
      // pump from the letdown tee on its RIGHT and leaves toward the charging tee on its
      // LEFT, but the nozzles were authored suction-left/discharge-right — water entered
      // at the discharge. Swapping the angles puts suction on the right and discharge on
      // the left at the SAME positions, and the discharge nozzle art now faces the way
      // the water actually goes.
      imrobpq4a70: { props: { suctionAngle: 0, dischargeAngle: 180 } },
      // SG FEED card title, shortened from 'STEAM GEN FEED' to free its top-right corner
      // for the feed controller status word (#214, bdFeedStatus in EXTRA_ITEMS). MEASURED:
      // the full title runs to x=1812 and the longest status word (ISOLATED, 73 px at
      // fontSize 15) starts at 1782 — a 30 px overlap. Owner's call, 2026-07-31: "you could
      // shorten STEAM GEN to SG and fit it in the corner just like steam dump." A patch
      // rather than a builder edit because pwr_board_data.js is REGENERATED — the same
      // change made in the builder is lost the next time anyone re-exports.
      imrqxsodu5j: { props: { title: 'SG FEED' } },
      // REACTOR/ROD CONTROL card title, shortened. A patch and not a builder edit for the
      // same reason as the SG FEED one above — pwr_board_data.js is REGENERATED.
      //
      // THE ORIGINAL REASON IS GONE and this comment is deliberately not left saying
      // otherwise: #306 shortened it to free the top-right corner for a rod controller
      // status word, and that word was removed 2026-08-03 as redundant (see the `rodStatus`
      // removal note). The corner is now empty. The short title is KEPT on the merit the
      // measurement already established — nothing is lost by dropping 'REACTOR/', since
      // everything on this card is a rod action, SCRAM included; it drops the banks. Keeping
      // it also avoids a re-measure: at the authored 'REACTOR/ROD CONTROL' the title renders
      // 161 px at fontSize 12 in a 195 px card, and any future corner item inherits that
      // 34 px problem the moment someone adds one.
      ims14ylw4az: { props: { title: 'ROD CONTROL' } },
      // The bottom of the rod card re-spaced *(OWNER, 2026-08-02: "Can you adjust the speed
      // buttons down so they have equal spacing above and below?", then "Shift the rod auto
      // and trip blocks down slightly to give equal spacing above and below them.")*.
      //
      // THE TWO ASKS INTERACT, which is why this is one patch and not two. Centring SLOW/MED/
      // FAST alone fixes its gaps at 5/5; centring ROD AUTO alone puts it at 427.5, which
      // re-opens the speed row's lower gap to 7.5 and un-centres what the first ask just
      // centred. Both are satisfied only by spacing the whole stack at once.
      //
      // MEASURED, as authored: INSERT ends at 395, the speed row was 395..415 (h 20), ROD AUTO
      // 425..455 (h 30), card bottom 465. So the speed row sat FLUSH against INSERT — 0 px
      // above, 10 below — and it STRADDLED the CONTROL/SHUTDOWN sub-boxes, whose bottom edge
      // is 400, half in and half out. ROD AUTO had 10 above and 10 below but the 10 above was
      // measured from a row that was itself in the wrong place.
      //
      // The band 395 → 465 is 70 px and holds 50 px of buttons, so the three gaps want 20/3 =
      // 6.67 px each. Integers cannot do that, so they are 7 / 6 / 7 — symmetric top and
      // bottom, one pixel tighter in the middle, which is the arrangement that reads level.
      //
      // RE-SOLVED 2026-08-05: the re-export moved the whole card up and shortened it, so the
      // band is now 356 → 425 — 69 px holding the same 50 px of buttons. The arithmetic is
      // the same shape and the answer is the same rhythm: 3g = 19, so 6 / 6 / 7. Only the
      // three tops move (402 → 362, 428 → 388); the reasoning above is unchanged, which is
      // why it is re-solved here rather than replaced.
      imrpk8169ds: { props: { top: 362 } },
      imrpk8grvcz: { props: { top: 362 } },
      imrpk8kjsjs: { props: { top: 362 } },
      // (ROD AUTO's `top: 388` rides on its colour entry above — same key, one object.)
      imrsk4xz2dm: { props: { top: 388 } },

      // ---- 2026-08-03, owner's board walk-round: three geometry corrections -----------
      //
      // 1. PRESSURIZER down 3 px, so the spray stub runs level *(OWNER, 2026-08-03: "the
      // top of the spray pipe is crooked going into the pressurizer. if you move the
      // pressurizer down a few pixles to make that pipe horizontal it would look
      // better.")*. MEASURED headless: `pressurizer/spray-in` scans at y=332 and the spray
      // run's first waypoint is authored at y=335, so the 17 px stub between them drops
      // 3 px — a 10° lean on the one segment the eye reads against the vessel top.
      //
      // The PRESSURIZER moves rather than the waypoint because its other three ports are
      // all on lines that stay plumb under a pure Y shift: surge and the PORV tap are
      // VERTICAL runs (the #231 plumb pins compare x, and x does not move), so they only
      // get 3 px longer. Verified by re-running board_check, not by arithmetic.

      // 2. CONDENSER left 2 px, so the drop into the condensate pump runs plumb *(OWNER,
      // 2026-08-03: "the line going into the condensate pump is not vertical. move the
      // condentate, feed pumps, and the polisher a few pixles to the right to make all
      // those pipes vertical.")*.
      //
      // MEASURED, and it is ONE pipe out of the three, not three: at the authored
      // positions `condenser/condensate-out` scans at x=1527 against a condensate-pump
      // suction at 1525, while pump-discharge↔polisher (both 1525) and
      // polisher↔feed-pump-suction (both 1455) were ALREADY plumb. So moving the three
      // tiles right would have straightened one drop and bent two that were fine.
      //
      // AND THE PUMPS CANNOT BE THE THING THAT MOVES. `Pump` is in NUDGE_KINDS
      // (pwr_board.js), so its flange faces are snapped onto the doc grid (5 px) — every
      // pump port lands on a multiple of 5, which 1527 is not. Measured on the attempt:
      // condensate pump left 1480→1482 moved its suction 1525→1530, a 5 px jump, not 2.
      // The condenser is NOT a nudged kind, so it is the tile that can land on 1525.
      //
      // Collateral, checked: `bypass-in` takes a horizontal run from the steam-dump valve
      // (just shorter), and both CW lines run horizontally to the cooling tower on the
      // right (just longer). Only `steam-in` is on a vertical leg, and its waypoint is
      // already pinned in DOC_PATCHES.pipes above — moved with it.

      // 3. NIS CARD TITLE shortened, to stop bdDtMargin printing on top of it *(OWNER,
      // 2026-08-03: "The OP(delta)T indication is on top of the 'NUCLEAR INSTRUMENTATION'
      // text.")*. Same trade, and the same reason, as the SG FEED and ROD CONTROL titles
      // above: an rAnchor status word in a card corner needs the corner.
      //
      // MEASURED, and the #311 comment that placed the readout had this wrong by 84 px —
      // it recorded the title as ending "near x=905" (authored) when it runs to x≈989, i.e.
      // essentially the full 255 px card. The readout's authored left is 927, so it landed
      // 62 px INSIDE the title and the overlap was 58.8 rendered px.
      //
      // WHY NOTHING CAUGHT IT: board_check's overlap pin skips `box` and `component` kinds
      // (a readout deliberately sits inside its card), and a card title is not an item — it
      // is rendered as a `.bd-box-title` child OF the box. So the one element it could
      // collide with was the one element the ruler was told to ignore. board_check now pins
      // the TITLE rect specifically.
      //
      // 'NUC INSTR (NIS)' and not something longer, sized against the WIDEST value rather
      // than the current one: 'OPΔT 8.3' renders 59.8 px but the field is
      // `bindName + ' ' + margin.toFixed(1)` over a [-500, 1500] instrument, so 11
      // characters ('OTΔT -125.4') is the bound — 74.7 px, left edge 859.8. Measured ends:
      // 'NUCLEAR INSTRUMENTATION' 887.1 (still overlaps), 'NUCLEAR INSTR (NIS)' 856.1
      // (3.7 px — one retune of the readout from clearing), 'NUC INSTR (NIS)' 825.1.
      ims175lciah: { props: { title: 'NUC INSTR (NIS)' } },

      // ---- 2026-08-05: two alignment nudges RE-DERIVED against the re-exported doc -------
      // Both of these were authored here as ABSOLUTE tops/lefts, and that is what made them
      // dangerous: the owner moved both tiles in the re-export, so the absolute values stopped
      // being small corrections and became large displacements *(OWNER, 2026-08-05: "The
      // condenser is shifted to the right. the pressurizer is shifted down.")* — 208 px and
      // 43 px respectively. The fix is not to delete them: each still corrects a real 2-3 px
      // lean that the re-export did not touch. They are re-derived from the NEW authored
      // position, and written as authored + delta so the next re-export makes the arithmetic
      // visible instead of silently re-displacing the tile.
      //
      // PRESSURIZER +3. `pressurizer/spray-in` sits 3 px above the spray run's first
      // waypoint (MEASURED: port y 292, waypoint y 295), so the 17 px stub leans about 10°
      // — the one segment the eye reads flat against the vessel top. Authored top 190 + 3.
      // Nudging the vessel rather than the waypoint keeps the surge, relief and PORV-tap
      // runs (all pinned plumb against this same tile) moving as one body.
      pressurizer: { props: { top: 193 } },
      // CONDENSER -2. `condenser/condensate-out` sits 2 px right of the condensate pump's
      // suction (MEASURED: outlet x 1317, suction 1315), and `Pump` is in NUDGE_KINDS so the
      // pump's flange snaps to the 5 px doc grid and can never meet it halfway. Authored
      // left 1195 - 2. The turbine-exhaust riser waypoint above rides on this number.
      condenser: { props: { left: 1193 } }
    }
  };
  function applyDocPatches(doc) {
    if (!doc) return;
    if (doc.items) {
      doc.items = doc.items.filter(function (it) { return !DOC_REMOVE[it.id]; });
    }
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
    // The operator types in the DISPLAY unit; NUMBERS.set works in the box's base unit.
    onNumber: function (item, value) {
      var n = NUMBERS[item.id];
      if (!n || !n.set) return;
      var m = numFam(item);
      n.set(m ? m.from(value) : value);
    },
    // Valid [min, max] for an editable box, in the ACTIVE display unit, so the renderer
    // clamps out-of-range entries. Rounded INWARD at the box's display resolution — ceil the
    // minimum, floor the maximum — so the box can never accept a value the engine would then
    // silently clamp. (In US this reproduces the old inline arithmetic exactly: the pressure
    // setpoint is still 15..2484 psi and the dump 30..1350.)
    boundsFor: function (item) {
      var b = NUM_BOUNDS_BASE[item.id];
      if (!b) return null;
      /* The charging box's ceiling is THE RUNNING PLANT'S, not the authored config's (#516
       * item 11). `lastSnapshot()` is the established idiom for a state-free callback here
       * (see the button press path); absent a snapshot chargingMaxGpm falls back to the
       * literal, so the retired engine and a cold board are unchanged. */
      if (item.id === 'imrpq48hn3t') {
        b = [b[0], chargingMaxGpm(RD.PwrBoard && RD.PwrBoard.lastSnapshot
                                  ? RD.PwrBoard.lastSnapshot() : null)];
      }
      var m = numFam(item);
      if (!m) return [b[0], b[1]];
      var p = Math.pow(10, m.d);
      return [Math.ceil(m.to(b[0]) * p) / p, Math.floor(m.to(b[1]) * p) / p];
    },
    // ▲/▼ step for an editable number box (null = use the authored it.step). NUM_STEP is an
    // absolute override and outranks the family — both boxes in it are unit-neutral.
    stepFor: function (item) {
      if (NUM_STEP[item.id] != null) return NUM_STEP[item.id];
      var m = numFam(item);
      return m ? m.step : null;
    },
    // Display decimals for an editable box (null = the authored it.digits). Only moves in
    // SI, and only where the converted range needs the resolution — a pressure setpoint
    // typed to whole MPa would be a 145 psi granularity on a box the operator trims.
    numberDigits: function (item) {
      var m = numFam(item);
      return m ? m.d : null;
    },
    // The unit string beside an editable box. Authored in US, converted in SI.
    numberUnit: function (item) {
      var n = NUM_UNIT[item.id];
      return n ? uStr(n.fam, item.unit) : (item.unit == null ? null : item.unit);
    },
    // The box's range HINT (the small caption above it), which bakes in a unit on the two
    // boxes that have one. In US the authored string stands verbatim — including the known
    // off-by-one on the dump box, which reads "29-1350 psi" against a real 30 psi minimum;
    // that is a board-data defect and correcting it here would put the fix somewhere nobody
    // would look for it. In SI the hint is DERIVED from boundsFor(), so it cannot drift from
    // the bounds it describes. A box with no authored hint stays without one in both modes.
    numberHint: function (item) {
      var lab = item.label == null ? '' : item.label;
      var n = NUM_UNIT[item.id];
      /* THE CHARGING CAPTION IS DERIVED IN BOTH MODES (#516 item 11). Its authored label is
       * the literal string "0-60 gpm" — the RETIRED plant's ceiling, baked into generated
       * board data, and the exact thing the owner read off the board while the box refused
       * anything over 30. This is NOT the dump box's case two comments down: that one is a
       * one-unit rounding slip in a caption that still describes its own plant, and leaving
       * it put the fix where someone would look. This caption describes a DIFFERENT PLANT,
       * `pwr_board_data.js` is generated so it cannot be hand-corrected, and the number moves
       * with the volume basis — so it is derived from boundsFor(), like the SI hints. */
      if (item.id === 'imrpq48hn3t' && n) {
        var cb = RD.PwrBoardDriver.boundsFor(item);
        if (cb) return trimNum(cb[0]) + '-' + trimNum(cb[1]) + ' ' + uStr(n.fam, item.unit);
      }
      if (!lab || !n || U() !== 'SI') return lab;
      var b = RD.PwrBoardDriver.boundsFor(item);
      if (!b) return lab;
      return trimNum(b[0]) + '-' + trimNum(b[1]) + ' ' + uStr(n.fam, item.unit);
    },
    onControl: function (item, action, value) {
      // Only clickable valves emit control now — every pump is rendered art-only.
      if (action === 'toggle' && VALVE_TOGGLE[item.id]) VALVE_TOGGLE[item.id](!!value);
    },
    onScram: function () { cmd({ action: 'scram' }); },
    // The button has drawn "PRESS TO RESET" since it was built, and until #75 this handler
    // was empty with a comment claiming no engine reset command existed. One does — the
    // engine has had `reset_rps` (with its rods-in interlock) and the kernel its permissive
    // for as long as the button has. Pressing it simply did nothing, silently, which is
    // worse than the button not offering the reset at all.
    onScramReset: function () { cmd({ action: 'reset_rps' }); },
    scramFired: function (s) { return IN(s).rps_scrammed; },
    // Caption under SCRAMMED: whether a reset will be accepted, and if not, why — read
    // from the kernel's permissive so the board never re-derives protection logic. The
    // operator should not have to press an inert button to discover the plant is not ready.
    scramResetNote: function (s) {
      var rps = (s && s.rps_state) || {};
      if (!rps.scrammed) return null;
      if (rps.reset_block) return { text: SCRAM_RESET_NOTE[rps.reset_block.reason] || 'RESET BLOCKED', ready: false };
      return { text: 'PRESS TO RESET', ready: true };
    },
    valueFor: function (item, s) {
      var f = VALUES[item.id];
      if (!f) return null;
      var v = f(s);
      if (v == null) return null;
      // A formatter may return { text, color, unit } to drive per-value colouring (e.g. the
      // SR indication going amber at the SR→IR handoff); otherwise it returns a plain value.
      var out = (typeof v === 'object') ? v : { text: String(v) };
      // #238: unless the formatter named its own unit (the boron sample's blank, the reactor
      // period's 's'), the unit follows the display mode — VALUE_UNIT for the convertible
      // indications, the AUTHORED string for everything else. Emitting the authored string
      // rather than nothing is what RESTORES it when the operator switches SI → US: the unit
      // span is a live text node, so leaving it alone would strand "MPa" over a psi reading.
      if (out.unit == null) {
        var famName = VALUE_UNIT[item.id];
        out.unit = famName ? uStr(famName, item.unit) : (item.unit == null ? '' : item.unit);
      }
      return out;
    },
    // Reflects sim state into the box, converted from the box's base unit to the display one.
    numberFor: function (item, s) {
      var n = NUMBERS[item.id];
      if (!n || !n.get) return null;
      var v = n.get(s);
      if (v == null) return null;
      var m = numFam(item);
      return m ? m.to(v) : v;
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
    // #358: a colour (or null) for a number box whose DEMAND is not being delivered —
    // it outranks both the grey auto tint and the cyan editable one, because "this
    // number is not happening" matters more than who is allowed to type. Today exactly
    // the SG feed rate box: a blackout winds the demand against a dead plant (no cue at
    // all for the first ~10 minutes), and after a LOOP the latched demand outlives the
    // isolation — 355 gpm on a plant with no main feed for 28 minutes. The corner word
    // carries NO FLOW for the engaged case; this marks the NUMBER, which is the thing
    // designed to look like a flow, in every case including MANUAL.
    numberWarn: function (item, s) {
      return item.id === 'imro8xhy2me' && feedNoFlow(s) ? BD_WARN : null;
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
    // ACTUATED (amber, #512 — owner design): a PROTECTION latch is holding this system.
    // The lamp sits on the panel's mode/reset button; the panel's own securing click is
    // the unlatch (the shell refuses it while the actuating signal is live, and resets
    // then executes once it clears). Keyed off published control_state flags, so any
    // engine that publishes them gets the lamps — the old engine publishes none today
    // and simply shows nothing new. The heater row is the idiom's in-house precedent
    // (the NUREG-0737 shed latch has always cleared on the operator's heater click).
    buttonActuated: function (item, s) {
      var f = ACTUATED_BUTTONS[item.id];
      return f ? CS(s)[f] === true : false;
    },
    // Disabled: an ESF AUTO re-arm button whose system the RUNNING ENGINE does not declare.
    // The kernel writes automation.esf keys only for config-listed systems, so a missing key
    // means set_esf_auto would be refused ('unknown esf system') with nothing visible — the
    // orphan-control case (#503: PWR2 declares only afw, and the HPI AUTO press ate the
    // owner's click in silence). Keyed off the snapshot, not the engine name, so any engine
    // that declares the arm gets the button back for free.
    buttonDisabled: function (item, s) {
      var sys = ESF_ARM_BUTTONS[item.id];
      if (sys) {
        var e = s.automation && s.automation.esf;
        return !(e && (sys in e));
      }
      // A channel button with no kernel channel behind it (#506: the boron panel / rod AUTO
      // on an engine whose channels list is empty — the press was a silent no-op).
      var chId = CHANNEL_BUTTONS[item.id];
      if (chId) return !chan(s, chId);
      // RHR align/isolate: the engine declares the system by publishing rhr_hx_fraction
      // (pwr always does); absent = the align command does not exist yet (#458 class).
      if (RHR_BUTTONS[item.id]) return CS(s).rhr_hx_fraction === undefined;
      // (The grid FOLLOW dispatch gate retired with the tile — imro8ktzs3u is the turbine
      //  LATCH now, #567. When #529 builds load following its control gates on `load_modes`
      //  the same way; the pattern is kept here, not the stale id.)
      // SR detector: the plant declares the channel has no operator lever (#567).
      if (item.id === 'bdSrDetector') return CS(s).sr_detector_fixed === true;
      // STEAM DUMP OPEN: no manual full-open lever on this plant (#570). Its refusal came from
      // INSIDE the MAPPED handler, not the REFUSED registry, which is why the #567 sweep missed
      // it — a live button that could only throw. AUTO and CLOSED beside it stay live.
      if (item.id === 'imrppquqg16') return CS(s).steam_dump_open_fixed === true;
      return false;
    },
    // The number-box mirror of buttonDisabled (#506): a setpoint box whose machinery the
    // running engine does not carry reads dark and refuses typing.
    numberDisabled: function (item, s) {
      if (item.id === 'imrpq29jo7t') return !chan(s, 'boron_conc');          /* boron ppm */
      if (item.id === 'ims3xu86zm5') return CS(s).rhr_hx_fraction === undefined; /* RHR HX % */
      if (item.id === 'bdAdvSp') return CS(s).adv_setpoint_fixed === true;   /* sourced constant */
      if (item.id === 'ims3v42jghn') return CS(s).condenser_cw_temp_fixed === true;  /* #567 */
      return false;
    },
    // Control tiles to append to the board that aren't in the generated board_data.js.
    // No driver-injected items and no doc patching since V2 — see EXTRA_ITEMS above for
    // what used to be here and where each piece is authored now.
    extraItems: function () { return EXTRA_ITEMS; },
    // Absolute, idempotent geometry corrections to the generated doc — see DOC_PATCHES.
    docPatches: function (doc) { applyDocPatches(doc); },
    // Live fluid temperature (°C) for a pipe id, or null to keep its authored temp.
    // Lets the renderer repaint pipe fluid color each snapshot (see PIPE_TEMP).
    pipeTemp: function (id, s) { var f = PIPE_TEMP[id]; return f ? f(s) : null; },
    // Live dash velocity / run-state / phase / direction for a pipe id, or null to leave the
    // pipe exactly as the diagram authored it (#350 — see PIPE_SYSTEM above).
    pipeFlow: function (id, s) { return pipeFlowOf(id, s); },
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
    // Board items the operator can actually WORK — a press handler or a tap-or-hold drive.
    // Introspection for run_manual_controls, which fails if a manual calls a control
    // "read-only" while this list says otherwise (#304). Entries carrying only `active`,
    // `warn` or `badge` are indication and are deliberately excluded: those decorate a
    // control, they are not one.
    pressableIds: function () {
      return Object.keys(BUTTONS).filter(function (k) {
        return !!(BUTTONS[k] && (BUTTONS[k].press || BUTTONS[k].hold));
      });
    },
    // Inspection copy (#96) — what an item IS, in two tiers, resolved through the
    // registry's containment fallback so an unnamed sub-frame describes its card.
    // Kept in pwr_board_inspect.js rather than here: it is prose about the plant,
    // not wiring, and it is long enough to bury this file.
    inspectItem: function (id) {
      var I = RD.PwrBoardInspect;
      return (I && I.entry) ? I.entry(id) : null;
    },
    // Live automation-channel status for an item, or null if it owns no channel (#214).
    // Returns the mode word plus the channel's own note, so the scanner can say
    // "MANUAL — off — main feedwater isolated (AFW has the SGs)" rather than leaving
    // the player to infer a stand-down from an unlit lamp. This is CONTROL state (what
    // the automation is doing), the same class as the AUTO lamp two pixels away — not
    // an instrument reading, so HR1's instruments-vs-truth line is not crossed here.
    liveNote: function (id, s) { return liveNoteFor(id, s); },
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
      // ---- live channel status for the scanner (#214) ------------------------------------
      // ITEM_CHANNEL is keyed by diagram item id, the same fragile contract as PIPE_TEMP
      // above: an item the owner deletes or re-draws leaves an orphan key that fails
      // SILENTLY — the control simply stops reporting its channel, which looks exactly
      // like a channel with nothing to say.
      ck('driver: every ITEM_CHANNEL key is a live item id', (function () {
        var live = {};
        (window.RD_PWR_BOARD_DOC.items || []).forEach(function (it) { live[it.id] = 1; });
        (EXTRA_ITEMS || []).forEach(function (it) { live[it.id] = 1; });
        var miss = Object.keys(ITEM_CHANNEL).filter(function (k) { return !live[k]; });
        return miss.length === 0 ? true : miss.join(',');
      })() === true);
      // …and every channel it names is a real channel, or the control reports nothing
      // while looking perfectly wired.
      ck('driver: every ITEM_CHANNEL target is a live channel', (function () {
        var have = {};
        ((s.automation && s.automation.channels) || []).forEach(function (c) { have[c.id] = 1; });
        var miss = Object.keys(ITEM_CHANNEL).filter(function (k) { return !have[ITEM_CHANNEL[k]]; });
        return miss.length === 0 ? true : miss.join(',');
      })() === true);
      // The note that MATTERS belongs to a channel that has just stood itself down —
      // 'off — main feedwater isolated (AFW has the SGs)' is the only account of why the
      // AUTO lamp went dark. The deleted Automate-tab line guarded on `engaged && note`,
      // which would have hidden precisely that case; this pins the disengaged branch.
      ck('driver: liveNote reports a DISENGAGED channel, not just an engaged one', (function () {
        var fake = { automation: { channels: [
          { id: 'feed_sg', engaged: false, note: 'off — main feedwater isolated (AFW has the SGs)' } ] } };
        var r = liveNoteFor('imrsgjmrjfg', fake);
        return r && r.text === 'MANUAL — off — main feedwater isolated (AFW has the SGs)'
          ? true : JSON.stringify(r);
      })() === true);
      ck('driver: liveNote is null for an item that owns no channel', liveNoteFor('imrppee04aj', s) === null);
      // ---- the SCRAM button's RESET half (#75) --------------------------------------------
      // The button drew "PRESS TO RESET" from the day it was built while onScramReset was an
      // empty stub, so an operator pressed it and nothing happened at all — no reset, no
      // refusal, no message. Nothing anywhere caught that, because a handler that does
      // nothing looks exactly like a handler that works. This pin is the one that would have.
      ck('driver: the SCRAM reset actually sends reset_rps', (function () {
        var sent = [], saved = ctxRef;
        ctxRef = { cmd: function (c) { sent.push(c && c.action); } };
        try { RD.PwrBoardDriver.onScramReset({}); } finally { ctxRef = saved; }
        return sent.length === 1 && sent[0] === 'reset_rps' ? true : JSON.stringify(sent);
      })() === true);
      // The caption is read off the kernel's permissive, never re-derived here. Three
      // states, and the blocked ones must say WHICH condition — "RESET BLOCKED" alone
      // tells the operator nothing they cannot already see.
      function srn(rpsState) { return RD.PwrBoardDriver.scramResetNote({ rps_state: rpsState }); }
      ck('driver: no reset caption on an unscrammed plant', srn({ scrammed: false }) === null);
      ck('driver: caption invites the reset when the permissive is satisfied', (function () {
        var n = srn({ scrammed: true, reset_permitted: true, reset_block: null });
        return n && n.ready === true && n.text === 'PRESS TO RESET' ? true : JSON.stringify(n);
      })() === true);
      ck('driver: caption names the condition holding the reset off', (function () {
        var a = srn({ scrammed: true, reset_block: { reason: 'RODS_NOT_INSERTED' } });
        var b = srn({ scrammed: true, reset_block: { reason: 'TRIP_SIGNAL_PRESENT' } });
        return a && a.ready === false && a.text === 'RODS NOT AT BOTTOM' &&
               b && b.ready === false && b.text === 'TRIP SIGNAL STANDING'
          ? true : JSON.stringify([a, b]);
      })() === true);
      // An unrecognised code must degrade to plain English, not render a raw enum at the
      // operator — the kernel may grow a reason this map has not learned yet.
      ck('driver: an unknown reset-block code falls back rather than leaking the enum', (function () {
        var n = srn({ scrammed: true, reset_block: { reason: 'SOMETHING_NEW' } });
        return n && n.ready === false && n.text === 'RESET BLOCKED' ? true : JSON.stringify(n);
      })() === true);
      // ---- the SG FEED corner status word (#214) -----------------------------------------
      // Switched on CODES, never on the note's English. These pin the mapping, including
      // the one that matters most: SAT reads AUTO on the lamp while the controller has no
      // authority left, so a green HOLDING there would be the board vouching for a
      // controller that has stopped controlling (#210).
      function fs(engaged, standDown, saturated, pumpPct, condFlow) {
        return feedStatus({ automation: { channels: [ { id: 'feed_sg', engaged: engaged,
                              stand_down: standDown || null, saturated: saturated || null } ] },
                            control_state: { feed_pump_speed_pct: pumpPct == null ? 100 : pumpPct },
                            instruments: { condensate_flow: condFlow == null ? 1.0 : condFlow } });
      }
      ck('driver: feed status HOLDING when engaged and off the rails', fs(true).text === 'HOLDING', fs(true).text);
      ck('driver: feed status is GREEN only when holding',
        fs(true).color === BD_OK && fs(true, null, 'hi').color === BD_WARN &&
        fs(false, 'condition').color === BD_WARN);
      ck('driver: feed status SAT HI / SAT LO at a rail while still ENGAGED',
        fs(true, null, 'hi').text === 'SAT HI' && fs(true, null, 'lo').text === 'SAT LO',
        fs(true, null, 'hi').text + '/' + fs(true, null, 'lo').text);
      ck('driver: feed status ISOLATED on a plant-condition stand-down',
        fs(false, 'condition').text === 'ISOLATED', fs(false, 'condition').text);
      ck('driver: feed status MANUAL when the operator has it and the pump is running',
        fs(false, 'manual', null, 100).text === 'MANUAL', fs(false, 'manual', null, 100).text);
      ck('driver: feed status OFF, not MANUAL, when the pump is actually stopped',
        fs(false, null, null, 0).text === 'OFF', fs(false, null, null, 0).text);
      // #358: the delivery predicate. NO FLOW is the engaged case where the channel is
      // commanding real speed and measured MAIN feed (condensate_flow — not fw_flow,
      // which AFW would mask) delivers nothing: the ten silent blackout minutes where
      // the lamp read AUTO, the corner read HOLDING and the gpm box climbed 238 → 794
      // against delivery of 1e-129.
      ck('driver: feed status NO FLOW — commanding real speed, main feed delivering nothing (#358)',
        fs(true, null, null, 100, 0.0).text === 'NO FLOW', fs(true, null, null, 100, 0.0).text);
      ck('driver: NO FLOW outranks SAT HI — a dead train is sharper than a railed controller',
        fs(true, null, 'hi', 120, 0.0).text === 'NO FLOW', fs(true, null, 'hi', 120, 0.0).text);
      ck('driver: healthy delivery under the same command still reads HOLDING',
        fs(true, null, null, 100, 1.0).text === 'HOLDING', fs(true, null, null, 100, 1.0).text);
      ck('driver: a commanded-zero pump is not NO FLOW — no demand, nothing undelivered',
        fs(true, null, null, 0, 0.0).text === 'HOLDING', fs(true, null, null, 0, 0.0).text);
      // The number-box half: the gpm DEMAND box goes amber on the same predicate, in
      // every mode including MANUAL (the LOOP case — corner reads ISOLATED while the
      // box still shows the 355 gpm the operator last had).
      ck('driver: numberWarn marks the gpm box amber on the predicate, and only then (#358)', (function () {
        var item = { id: 'imro8xhy2me' };
        function sn(pct, cond) {
          return { automation: { channels: [{ id: 'feed_sg', engaged: false, stand_down: 'condition' }] },
                   control_state: { feed_pump_speed_pct: pct }, instruments: { condensate_flow: cond } };
        }
        return RD.PwrBoardDriver.numberWarn(item, sn(35.5, 0.0)) === BD_WARN &&
               RD.PwrBoardDriver.numberWarn(item, sn(35.5, 0.5)) == null &&
               RD.PwrBoardDriver.numberWarn({ id: 'imro8rmka2y' }, sn(35.5, 0.0)) == null
          ? true : 'predicate/scoping mismatch';
      })() === true);
      // The corner only exists because the card title was shortened. If a re-export or an
      // owner edit restores the long title, the status word overlaps it — silently, since
      // both still render. Pin the patch that makes the room.
      ck('driver: DOC_PATCHES shortened the SG FEED card title', (function () {
        var it = (window.RD_PWR_BOARD_DOC.items || []).filter(function (x) { return x.id === 'imrqxsodu5j'; })[0];
        return it && it.title === 'SG FEED' ? true : (it ? it.title : 'card missing');
      })() === true);
      // ---- the IN-OUT lamps and rod speed indication (#306) --------------------------------
      // The nine ROD STATUS WORD checks that stood here went with the word itself on
      // 2026-08-03 (owner: redundant against these lamps). They are NOT re-homed onto
      // anything: each state they covered is asserted where it actually lives now — the ROD
      // AUTO lamp, the ROD LIMIT annunciators in `run_m4`, the OTΔT/OPΔT rod stops in
      // `run_otdt`, and the interlock refusals in `run_m4`. Re-adding a driver check here
      // for a thing the board no longer draws would be a test with no subject.
      //
      // What survives is the pair that is genuinely load-bearing, and the SCRAM one is the
      // reason: the lamps are now the ONLY indication of automatic rod motion, so the
      // failure mode they guard got more consequential, not less.
      // The IN-OUT lamps. A SCRAM must leave them DARK: the rods fall on gravity with the
      // drive de-energized, and a lit IN lamp there would say the drive is running when it
      // has just been dropped. This is the check that fails if someone "simplifies"
      // rodDriving to `g.moving && g.direction === dir`.
      function rd(opts, dir) {
        return rodDriving({ control_state: { rod_groups: [{ id: 'control_rods',
          moving: !!opts.moving, direction: opts.direction || 0, scrammed: !!opts.scrammed }] } }, dir);
      }
      ck('driver: IN-OUT lamps follow the commanded direction',
        rd({ moving: true, direction: -1 }, -1) === true && rd({ moving: true, direction: -1 }, 1) === false &&
        rd({ moving: true, direction: 1 }, 1) === true);
      ck('driver: IN-OUT lamps stay DARK on a scram — gravity is not a drive demand',
        rd({ moving: true, direction: -1, scrammed: true }, -1) === false);
      ck('driver: rod speed indication reports the DRIVE speed, and nothing while stopped',
        (function () {
          function sp(o) { return rodDrivingSpeed({ control_state: { rod_groups: [{ id: 'control_rods',
            moving: !!o.moving, scrammed: !!o.scrammed, speed: o.speed }] } }); }
          return sp({ moving: true, speed: 'fast' }) === 'fast' &&
                 sp({ moving: false, speed: 'fast' }) === null &&
                 sp({ moving: true, scrammed: true, speed: 'fast' }) === null;
        })());
      // The corner only exists because the card title was shortened — same trap as SG FEED.
      // MEASURED: at the authored 'REACTOR/ROD CONTROL' (161 px in a 195 px card) the widest
      // status word overlaps the title by 34 px and BOTH still render, so nothing else fails.
      ck('driver: DOC_PATCHES shortened the ROD CONTROL card title', (function () {
        var it = (window.RD_PWR_BOARD_DOC.items || []).filter(function (x) { return x.id === 'ims14ylw4az'; })[0];
        return it && it.title === 'ROD CONTROL' ? true : (it ? it.title : 'card missing');
      })() === true);
      // The bottom of the rod card is evenly spaced by a patch, so a re-export silently
      // un-spaces it (owner, 2026-08-02). Pin the RELATIONSHIP, not the numbers: the three
      // gaps below INSERT — to the speed row, to the AUTO row, and to the card's bottom edge —
      // must stay within a pixel of each other. That survives any of the five items moving
      // and states the thing that was actually asked for. As authored the first gap is 0 and
      // the last is 10, so this fails on the shipped board_data without the patch.
      ck('driver: the rod card bottom is evenly spaced (gaps equal within 1 px)', (function () {
        function it(id) { return (window.RD_PWR_BOARD_DOC.items || []).filter(function (x) { return x.id === id; })[0]; }
        var card = it('ims14ylw4az'), ins = it('imrpk79mwng');
        var spd = ['imrpk8169ds', 'imrpk8grvcz', 'imrpk8kjsjs'].map(it);
        var aut = ['ims5glucngg', 'imrsk4xz2dm'].map(it);
        if (!card || !ins || spd.concat(aut).some(function (r) { return !r; })) return 'item missing';
        function level(row, name) {
          return row.every(function (r) { return r.top === row[0].top; }) ? null
            : name + ' not level: ' + row.map(function (r) { return r.top; }).join('/');
        }
        var bad = level(spd, 'speed row') || level(aut, 'auto row');
        if (bad) return bad;
        var g1 = spd[0].top - (ins.top + ins.height);
        var g2 = aut[0].top - (spd[0].top + spd[0].height);
        var g3 = (card.top + card.height) - (aut[0].top + aut[0].height);
        var lo = Math.min(g1, g2, g3), hi = Math.max(g1, g2, g3);
        return (hi - lo) <= 1 ? true : 'gaps ' + g1 + '/' + g2 + '/' + g3;
      })() === true);
      // ---- ROD AUTO obeys the board's AUTO colour convention (2026-08-01) -----------------
      // `buildButton` uses the authored item colour AS the lit colour, so an off-convention
      // author value is invisible until the control is engaged — and since #289 the rods come
      // up engaged, so it is lit on every free-play start. Pinned two ways: the patch applied,
      // and the CONVENTION itself, so a re-export that re-authors ROD AUTO pale (or recolours
      // any other AUTO) fails here instead of shipping a board with two meanings for "green".
      ck('driver: ROD AUTO lights the standard AUTO green', (function () {
        var it = (window.RD_PWR_BOARD_DOC.items || []).filter(function (x) { return x.id === 'ims5glucngg'; })[0];
        return it ? it.color : 'ROD AUTO missing';
      })() === '#5aad7c');
      ck('driver: every AUTO button on the board shares that green', (function () {
        var bad = (window.RD_PWR_BOARD_DOC.items || []).filter(function (x) {
          return x.kind === 'button' && /\bAUTO\b/.test(String(x.label || '')) && x.color !== '#5aad7c';
        }).map(function (x) { return x.id + '=' + x.color; });
        return bad.length ? bad.join(',') : true;
      })() === true);
      // ---- power tile follows the ARMED power trip (#267) --------------------------------
      // The tile used to read 120 % in every state, because tripSp() took the first
      // `power_range high` row and the table happens to author the backstop first. MEASURED
      // on engine+M4 from `5_percent`: with pr_low_setpoint armed, 26 % scrams and 24 % does
      // not — so the gauge was showing a limit ~5x above the one the plant enforces for the
      // whole of a startup. These pin the three states rather than the one that was wrong.
      function powerTile(blocks, tbs) {
        var t = { instruments: { power_range: 5 }, control_state: {}, true_state: { plant_mode: 3 },
                  metadata: { sim_time: 100 } };
        if (blocks) t.rps_state = { trip_blocks: blocks, scrammed: false };
        if (blocks && tbs !== undefined) t.rps_state.trip_block_status = tbs;
        return COMPPROPS.imrzl4b7g9m(t);
      }
      // trip_block_status carries PRESENCE (#506.7): the pwr kernel always publishes its
      // blockable trips there, so the honest fixtures carry it; the tbs-less call below
      // pins the LEGACY branch (old recordings), and the empty-tbs call pins the pwr2 shape.
      var pArmed = powerTile({}, { ir_high: { blocked: false }, pr_low_setpoint: { blocked: false } }),
          pBlocked = powerTile({ pr_low_setpoint: true },
                               { ir_high: { blocked: false }, pr_low_setpoint: { blocked: true } }),
          pBare = powerTile(null),
          pLegacy = powerTile({}),
          pPwr2 = powerTile({}, {});
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
      // A snapshot with trip_blocks but NO trip_block_status is the legacy shape — the
      // blocked-only rule must hold bit-identical (old recordings replay unchanged).
      ck('driver: power tile keeps the legacy armed reading without trip_block_status',
        pLegacy.tripHi === 25 && pLegacy.note === 'TRIP 25%', pLegacy.tripHi + '/' + JSON.stringify(pLegacy.note));
      // The pwr2 shape: rps_state present, trip_block_status EMPTY — the live kernel carries
      // no blockable trips (protection lives inside the engine), so the static table's 25 %
      // startup trip must NOT read as armed. Pre-fix this pegged a 99.8 % plant on a 27.5
      // scale under "TRIP 25%" (#506.7, measured).
      ck('driver: power tile shows authored bands when the live kernel has no blockable trips (pwr2)',
        pPwr2.tripHi === 120 && pPwr2.note === '' && pPwr2.max > 100,
        pPwr2.tripHi + '/' + JSON.stringify(pPwr2.note) + '/max ' + pPwr2.max);
      // The ENGINE-owned RPS (#507 wave 7): PWR2's kernel snapshot now MERGES the engine's
      // block surface, and its status carries the trip's OWN setpoint — the tile must arm at
      // the engine's 35 %, never the static pwr1 table's 25 (the #506.7 shape, completed).
      var pPwr2Armed = powerTile({}, { pr_low_setpoint: { blocked: false, setpoint: 35 } });
      ck('driver: power tile arms at the ENGINE-carried setpoint (pwr2 startup: TRIP 35%)',
        pPwr2Armed.tripHi === 35 && pPwr2Armed.note === 'TRIP 35%',
        pPwr2Armed.tripHi + '/' + JSON.stringify(pPwr2Armed.note));
      // tripBackstop must not depend on table order — the defect this fixes was order-dependent.
      ck('driver: power backstop is order-independent',
        tripBackstop('power_range', 'high', null) === 120, tripBackstop('power_range', 'high', null));

      // ---- pressure tile follows the ARMED low trip (#270) -------------------------------
      // MEASURED at `cold_shutdown` before the fix, with the plant correctly holding 363 psi:
      // the marker sat at −192.6 % of scale and `normLo` clamped to 2149 while `normHi` tracked
      // the setpoint at 413 — an INVERTED band, so a correct reading painted TRIP RED.
      function pressTile(spMPa, blocks) {
        var t = { instruments: {}, control_state: { pressure_setpoint: spMPa },
                  true_state: { plant_mode: blocks ? 5 : 1 }, metadata: { sim_time: 100 } };
        if (blocks) t.rps_state = { trip_blocks: blocks, scrammed: false };
        else if (blocks === null) { /* no rps_state at all */ }
        else t.rps_state = { trip_blocks: {}, scrammed: false };
        return COMPPROPS.ims2immsvn6(t);
      }
      var qCold = pressTile(2.5, { lo_press: true, si_trip: true });
      var qHeat = pressTile(15.41, { lo_press: true, si_trip: true });   // setpoint at NOP, still blocked
      var qHot = pressTile(15.41, false);
      var qBare = pressTile(15.41, null);
      // Cold: no armed low boundary, so the low regions collapse and the NORMAL band is the
      // live control band — not the at-power one clamped on top of it.
      ck('driver: pressure tile collapses the low trip band when P-11 has blocked it',
        qCold.tripLo === 0 && qCold.alarmLo === 0, 'tripLo ' + qCold.tripLo + ', alarmLo ' + qCold.alarmLo);
      ck('driver: pressure tile shows the COLD control band, not the at-power one',
        qCold.normLo === 333 && qCold.normHi === 413, qCold.normLo + '..' + qCold.normHi + ' psi');
      ck('driver: pressure tile puts a Mode 5 plant on scale', Math.round(qCold.max) === 475,
        'window ' + qCold.min.toFixed(0) + '..' + qCold.max.toFixed(0) + ' psi (363 psi reads ' +
        (100 * (363 - qCold.min) / (qCold.max - qCold.min)).toFixed(0) + ' %)');
      // `ok`, not `trip`: bypassed-for-the-mode is a status indication, and the low pressure
      // alarms already reclassify to `status` priority in cold modes.
      ck('driver: pressure tile says the low trip is blocked, in the status colour',
        qCold.note === 'LO TRIP BLKD' && qCold.noteKind === 'ok', JSON.stringify(qCold.note) + '/' + qCold.noteKind);
      // Mid-heatup: the setpoint is at NOP but P-11 is not satisfied yet, so the reading must
      // still be on scale — this is the case a setpoint-keyed window would have got wrong.
      ck('driver: pressure tile keeps a depressurized plant on scale after the setpoint goes to NOP',
        qHeat.min === 0 && Math.round(qHeat.max) === 2628, 'window ' + qHeat.min + '..' + qHeat.max.toFixed(0));
      // Armed (at power, and through a LOCA — measured, the trips never block on the way down):
      // authored bands, red intact, no note. Pegged low IN RED is the correct LOCA reading.
      // Rounded: these are the SI setpoints converted, so 12.41 MPa is 1799.92 psi, not 1800.
      ck('driver: pressure tile keeps its red band while the low trip is ARMED',
        Math.round(qHot.tripLo) === 1800 && Math.round(qHot.alarmLo) === 2149 && qHot.note === '',
        qHot.tripLo.toFixed(0) + '/' + qHot.alarmLo.toFixed(0) + '/' + JSON.stringify(qHot.note));
      ck('driver: pressure tile falls back to authored bands with no rps_state',
        Math.round(qBare.tripLo) === 1800 && qBare.note === '',
        qBare.tripLo.toFixed(0) + '/' + JSON.stringify(qBare.note));
      // ---- pressurizer level: the trip line is the RUNNING plant's (#556) -------------------
      // Three fixtures, because the tile has three distinct answers and the shipped defect
      // looked correct in exactly one of them. An engine that publishes indication setpoints
      // (PWR2) arms the tile at its own number and collapses the side it has no trip on; an
      // engine that publishes none (the retired plant, and every old recording) keeps the
      // authored edges untouched. `armed` is the plant's own flag: an unarmed row — below the
      // at-power permissive P-7 — has no line to draw, so the top collapses at the meter top.
      function pzrTile(rows, speaks) {
        var t = { instruments: { pzr_level: 60 }, control_state: {},
                  true_state: { plant_mode: 1 }, metadata: { sim_time: 100 },
                  rps_state: { trip_blocks: {}, scrammed: false } };
        if (rows !== null) { t.rps_state.trip_setpoints = rows;
                             t.rps_state.trip_setpoint_instruments = speaks || ['pzr_level']; }
        return COMPPROPS.ims2immon9z(t);
      }
      var HI87 = { id: 'hi_pzr_level', instrument: 'pzr_level', direction: 'high', setpoint: 87, armed: true };
      var zArmed = pzrTile([HI87]);
      var zBelowP7 = pzrTile([Object.assign({}, HI87, { armed: false })]);
      var zLegacy = pzrTile(null);
      ck('driver: pzr level tile arms at the ENGINE-carried high setpoint (87 %), not the static edge',
        zArmed.tripHi === 87, 'tripHi ' + zArmed.tripHi);
      // The load-bearing negative: the plant SAYS it speaks for pzr_level and publishes no low
      // row, so the red band the authored table paints from the meter bottom to 12 % marks a
      // scram that cannot occur. Absent-and-spoken-for is a real absence; absent-and-silent is
      // not, which is what zLegacy pins.
      ck('driver: pzr level tile collapses the low trip band when the plant carries no low trip',
        zArmed.tripLo === 0, 'tripLo ' + zArmed.tripLo);
      ck('driver: pzr level tile draws NO high band while the row is unarmed (below P-7)',
        zBelowP7.tripHi === 100 && zBelowP7.tripLo === 0,
        'tripHi ' + zBelowP7.tripHi + ', tripLo ' + zBelowP7.tripLo);
      ck('driver: pzr level tile keeps the authored edges when the plant publishes no setpoints',
        zLegacy.tripHi === 97 && zLegacy.tripLo === 12,
        'tripHi ' + zLegacy.tripHi + ', tripLo ' + zLegacy.tripLo);
      // The authored high edge is now READ from the protection table instead of hard-coded to
      // 100 under the comment "No high-level trip exists" — which was false for this plant too:
      // pwr_control's own pzr_hi_level scrams at 97 % (PI-8, Manuals/09 §3.0).
      ck('driver: the authored high edge is the retired plant\'s REAL 97 % scram, not 100',
        TILE_BANDS.ims2immon9z.tripHi === 97, 'authored tripHi ' + TILE_BANDS.ims2immon9z.tripHi);
      // ---- NIS readouts show their thresholds (#271) --------------------------------------
      // The startup net is P-10 (10 %) < IR high (~20 %) < PR low setpoint (25 %). #267 made the
      // PR rung visible; these are the other two. Before this, SR went amber at its handoff
      // caution and NOTHING marked either trip — so on the channel whose whole job is to catch a
      // missed block, the caution and the scram looked identical, and IR looked like nothing.
      /* `ils` is the LIVE interlock list the kernel publishes (#572) — the SUR readout's block
       * band is drawn from it and from nothing else, so a plant without the interlock must be
       * expressible here. Defaults to EMPTY, which is PWR2's real state. */
      function nis(id, ins, blocks, ils) {
        return RD.PwrBoardDriver.valueFor({ id: id }, {
          instruments: ins, control_state: {}, true_state: { plant_mode: 2 },
          interlocks: ils || [],
          metadata: { sim_time: 10 }, rps_state: { trip_blocks: blocks || {}, scrammed: false }
        });
      }
      ck('driver: SR readout goes RED at its 1e5 cps trip, not just amber at the caution',
        nis('imro6qutiht', { source_range: 1.2e5, sr_energized: true }).color === NIS_TRIP_COLOR &&
        nis('imro6qutiht', { source_range: 6e4, sr_energized: true }).color === SR_HANDOFF_COLOR,
        'trip ' + nis('imro6qutiht', { source_range: 1.2e5, sr_energized: true }).color +
        ', caution ' + nis('imro6qutiht', { source_range: 6e4, sr_energized: true }).color);
      // `sr_high` is condition: 'sr_energized' — after the handoff there is no live limit here.
      ck('driver: SR readout goes neutral once the detector is secured',
        nis('imro6qutiht', { source_range: 6e4, sr_energized: false }).color === NIS_IDLE_COLOR,
        nis('imro6qutiht', { source_range: 6e4, sr_energized: false }).color);
      ck('driver: IR readout marks its trip and warns within half a decade',
        nis('imro6rctcgm', { intermediate_range: 2e-3 }).color === NIS_TRIP_COLOR &&
        nis('imro6rctcgm', { intermediate_range: 8e-4 }).color === SR_HANDOFF_COLOR &&
        nis('imro6rctcgm', { intermediate_range: 1e-8 }).color === SR_NORMAL_COLOR,
        [2e-3, 8e-4, 1e-8].map(function (v) { return nis('imro6rctcgm', { intermediate_range: v }).color; }).join(' '));
      // Blocked above P-10 by the startup net's own procedure — colouring a defeated trip would
      // teach the opposite of what the block accomplished.
      ck('driver: IR readout goes neutral once ir_high is blocked',
        nis('imro6rctcgm', { intermediate_range: 2e-3 }, { ir_high: true }).color === NIS_IDLE_COLOR,
        nis('imro6rctcgm', { intermediate_range: 2e-3 }, { ir_high: true }).color);
      // SUR has no trip: red means the ROD WITHDRAWAL BLOCK is on, amber the alarm (1.0). The
      // block band is drawn from the LIVE interlock list and from nothing else (#572).
      var SUR_IL = [{ instrument: 'startup_rate', direction: 'high', setpoint: 1.5,
                      blocks: ['rod_start', 'rod_nudge'], withdrawal_only: true }];
      ck('driver: SUR readout marks the 1.0 alarm and, on a plant that HAS the interlock, its ' +
         'withdrawal block',
        nis('imro6qsncb9', { startup_rate: 0.3 }, null, SUR_IL).color === SR_NORMAL_COLOR &&
        nis('imro6qsncb9', { startup_rate: 1.1 }, null, SUR_IL).color === SR_HANDOFF_COLOR &&
        nis('imro6qsncb9', { startup_rate: 1.6 }, null, SUR_IL).color === NIS_TRIP_COLOR,
        [0.3, 1.1, 1.6].map(function (v) { return nis('imro6qsncb9', { startup_rate: v }, null, SUR_IL).color; }).join(' '));
      // THE #572 CHECK, and the one that would have caught it. PWR2 publishes NO interlocks —
      // its rod stops are flux and delta-T functions inside the engine, and no startup-rate stop
      // exists in the corpus at all. The readout must not promise a block that is not there:
      // measured before the fix, the plant ran to 10.00 DPM (6.7x the band it was painting)
      // across 90 consecutive withdrawals with none refused.
      ck('driver: with NO startup-rate interlock published, SUR never paints the block colour — ' +
         'the band follows the plant, not a module-load table (#572)',
        surBlockDpm({ interlocks: [] }) === null &&
        surBlockDpm({}) === null &&
        nis('imro6qsncb9', { startup_rate: 9.9 }).color === SR_HANDOFF_COLOR,
        'blk ' + surBlockDpm({ interlocks: [] }) + ', 9.9 DPM -> ' +
        nis('imro6qsncb9', { startup_rate: 9.9 }).color);
      // The alarm setpoint still comes from the protection table — a retune must move it.
      ck('driver: the SUR alarm threshold is read from the alarm table, not a literal',
        surAlarmDpm() === 1.0 && surBlockDpm(null) === null,
        surAlarmDpm() + ' / ' + surBlockDpm(null));

      // The clamps in bandsFor are one-sided and CAN cross a moved band over itself.
      ck('driver: no tile can emit an inverted normal band', (function () {
        var bad = [];
        [qCold, qHeat, qHot, qBare, pArmed, pBlocked, pBare].forEach(function (p, i) {
          if (p.normHi < p.normLo) bad.push(i + ':' + p.normLo + '>' + p.normHi);
        });
        return bad.length === 0 ? true : bad.join(',');
      })() === true);
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
