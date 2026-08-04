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
  function r0(v) { return Math.round(v); }
  function r1(v) { return (Math.round(v * 10) / 10); }

  // Nominal full-scale flows for indications the engine exposes only as normalized/pct.
  var GPM_HPI = 600, GPM_AFW = 640, GPM_CHARGING = 1000, GPM_LETDOWN = 1000, GPM_FEED_PER_PCT = 10;
  var GPM_FEED = 1000;   // full-rated feed flow, for the measured fw_flow indication (normalized 0-1)
  var _CFG = (typeof RD !== 'undefined' && RD.PWR_CONFIG) || {};
  var _RX = _CFG.reactivity || {}, _PZ = _CFG.pressurizer || {}, _ID = _CFG.identity || {};
  var _SG = _CFG.steam_generator || {}, _EM = _CFG.emergency || {}, _TB = _CFG.turbine || {};
  // Charging: the normal make-up band (reactivity.charging_max 0.06) on the gpm scale = 60.
  var CHARGING_MAX_GPM = GPM_CHARGING * (_RX.charging_max || 0.06);

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
    imrzp89wdfu: 'flow',  imrzp8qps6u: 'flow',   ims5gq44zgr: 'temp',  imro6qpci2d: 'tempd',
    imrppyp0wfo: 'press', imrqzuhzre3: 'vac',    ims3xp168iy: 'vac',   imrr1gwi93j: 'press',
    imrr1hecwq7: 'temp',  imrr4fnxhlc: 'temp',   imrr4g29a7c: 'temp',  imrsgch20pv: 'temp',
    imrsgkz4lq0: 'flow',  ims31ngjkf8: 'flow',   ims3wm0d0bu: 'flow'
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
    ims31tq7mgc: [0.2, _SG.sg_safety_open_mpa || 9.31],
    ims3xu86zm5: [0, 100],                                           // RHR HX flow split, %
    // Circulating-water inlet temperature — the modelled range (the engine clips to the
    // same band, so the box refuses what the engine would clamp).
    ims3v42jghn: [_TB.cw_inlet_min_c != null ? _TB.cw_inlet_min_c : 4.4,
                  _TB.cw_inlet_max_c != null ? _TB.cw_inlet_max_c : 37.8]
  };
  // Family per editable box, with optional per-mode overrides where the converted range
  // needs a different resolution than the family default. Charging is the one that does:
  // 0-60 gpm becomes 0-13.6 m³/h, and a whole-unit ▲▼ there would nudge 4.4 gpm at a time.
  var NUM_UNIT = {
    imro8xhy2me: { fam: 'flow' },
    imrpq48hn3t: { fam: 'flow', SI: { d: 1, step: 0.1 } },
    imrsg8b7b9o: { fam: 'press' },
    ims31tq7mgc: { fam: 'press' },
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
    bdRodStatus: 'rods_tavg',                                                  // the rod status word itself (#306)
    imrqp6com2b: 'boron_conc', imrqp6avzkw: 'boron_conc',                      // boron ON / OFF
    imrpq29jo7t: 'boron_conc',                                                 // boron target ppm
    imrsgjmrjfg: 'feed_sg', imrsgjuh7l0: 'feed_sg', imrsgjwq1q0: 'feed_sg',    // feed AUTO / MAN / OFF
    imro8xhy2me: 'feed_sg',                                                    // SG feed rate setpoint box
    bdFeedStatus: 'feed_sg'                                                    // the corner status word itself
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
  function feedStatus(s) {
    var c = chan(s, 'feed_sg');
    if (!c) return { text: '—', color: BD_WARN };
    if (!c.engaged) {
      if (c.stand_down === 'condition') return { text: 'ISOLATED', color: BD_WARN };
      if (c.stand_down === 'scram' || c.stand_down === 'dead') return { text: 'TRIPPED', color: BD_WARN };
      // No recorded stand-down: the operator is simply driving it. Distinguish a pump
      // that is actually stopped, because "MANUAL" over a dead pump reads as though
      // someone is holding a feed rate when nothing is being fed at all.
      return (CS(s).feed_pump_speed_pct || 0) <= 0
        ? { text: 'OFF', color: BD_WARN } : { text: 'MANUAL', color: BD_WARN };
    }
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

  // ---- the ROD status word (#306) --------------------------------------------------
  // Same shape and the same discipline as feedStatus above: switched on CODES
  // (`scrammed`, `engaged`, `at_insertion_limit`, `moving`/`direction`), never on the
  // channel's note, which is prose written for a human and would break silently the
  // first time someone reworded it.
  //
  // ORDER IS DELIBERATE, and AT LIMIT deliberately outranks motion. The bank can be
  // sitting on the insertion limit and withdrawing at the same time — the limit only
  // stops INWARD motion — so the two facts are not exclusive, and the limit is the one
  // that says the controller has run out of room in the direction it normally corrects.
  // Nothing is lost by ranking it first: the IN-OUT lamps on the WITHDRAW/INSERT buttons
  // report the motion at the same instant, which is exactly the division a real board
  // uses (the ROD LIMIT annunciators are independent of the in-out lamps, WTSM 8.4).
  //
  // AMBER for everything that is not "the controller has this and is regulating": a
  // tripped bank, an operator-driven one, and one pinned against its limit are all states
  // where nobody should read the green ROD AUTO lamp as "Tavg is being looked after".
  // Is a standing interlock refusing rod WITHDRAWAL right now? Reads the kernel's published
  // interlock state (#306) rather than re-deriving the latch from the instrument and the
  // config table — the block engages on `setpoint` and clears on `clears_below`, so a
  // board-side copy would be a second implementation of a hysteretic condition, which is
  // the #294/#303 defect shape. Matches on the BLOCKS list, not on prose or on an index.
  function rodWithdrawBlocked(s) {
    var ils = (s && s.interlocks) || [];
    for (var i = 0; i < ils.length; i++) {
      var il = ils[i];
      if (!il.active) continue;
      var b = il.blocks || [];
      if (b.indexOf('rod_start') >= 0 || b.indexOf('rod_nudge') >= 0) return true;
    }
    return false;
  }
  function rodStatus(s) {
    var g = rodGroup(s, 'control_rods');
    if (!g) return { text: '—', color: BD_WARN };
    if (g.scrammed) return { text: 'TRIPPED', color: BD_WARN };
    var c = chan(s, 'rods_tavg');
    if (!c || !c.engaged) return { text: 'MANUAL', color: BD_WARN };
    if (g.at_insertion_limit) return { text: 'AT LIMIT', color: BD_WARN };
    // A withdrawal block outranks motion for the same reason AT LIMIT does — both say the
    // controller has lost a direction — and it outranks AT LIMIT only in that it can be
    // true while the bank is nowhere near its floor. Ordered after, because being ON the
    // insertion limit is the more consequential of the two: the limit is a tech-spec floor,
    // the SUR block is a transient rate guard that clears itself.
    if (rodWithdrawBlocked(s)) return { text: 'BLOCKED', color: BD_WARN };
    if (g.moving && g.direction > 0) return { text: 'OUT', color: BD_OK };
    if (g.moving && g.direction < 0) return { text: 'IN', color: BD_OK };
    return { text: 'HOLDING', color: BD_OK };
  }
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
      left: 960, top: 505, value: '∞', unit: 's', color: '#8ba4b6', fontSize: 14, rAnchor: true },
    // Feed controller status, in the SG FEED card's top-right corner (#214). The AUTO/MAN
    // lamps say THAT the controller is off; nothing said WHY. Same shape as the steam dump
    // status (imrppq5r7kw): rAnchor, so `left` is the RIGHT edge.
    //
    // It fits only because DOC_PATCHES shortens the card title to 'SG FEED'. MEASURED: the
    // full 'STEAM GEN FEED' runs to x=1812, and the longest status word (ISOLATED, 73 px at
    // fontSize 15) has to start at 1782 — a 30 px overlap. Owner's call, 2026-07-31: "you
    // could shorten STEAM GEN to SG and fit it in the corner just like steam dump."
    { id: 'bdFeedStatus', kind: 'value',
      name: 'SG feed controller status  ·  sim: automation feed_sg engaged / stand_down / saturated',
      left: 1855, top: 548, value: 'HOLDING', unit: '', color: '#5aad7c', fontSize: 15, rAnchor: true },
    // Rod controller status, in the REACTOR CONTROL card's top-right corner (#306) — the
    // at-a-glance half of what `liveNote` already reported only on inspection. The ROD AUTO
    // lamp says the channel is engaged; it never said what it was DOING, so a player in AUTO
    // had nothing but the step count ticking to go on.
    //
    // It fits only because DOC_PATCHES shortens the card title to 'ROD CONTROL' — see the
    // measured widths there. Same trade #214 made on the SG FEED card.
    { id: 'bdRodStatus', kind: 'value',
      name: 'Rod controller status  ·  sim: automation rods_tavg engaged + control bank scrammed / at_insertion_limit / moving',
      left: 730, top: 243, value: 'HOLDING', unit: '', color: '#5aad7c', fontSize: 13, rAnchor: true },
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
      left: 990, top: 234, value: '—', unit: '', color: '#5aad7c', fontSize: 13, rAnchor: true }
  ];

  // ================================================================ NUMBERS (editable)
  // set(v): issue command from the typed value; get(s): reflect current sim state.
  // BOTH WORK IN THE BOX'S BASE UNIT (see NUM_BOUNDS_BASE) — the display-unit conversion
  // happens once, in the driver's onNumber/numberFor, so a formatter here never has to
  // know which unit the operator is looking at.
  var NUMBERS = {
    imro8rmka2y: { set: function (v) { cmd({ action: 'set_load_target', mwe: v }); }, get: function (s) { return CS(s).load_target_mwe; } },              // Generator Load MW
    imro8xhy2me: { set: function (v) { cmd({ action: 'set_feed_pump_speed', pct: v / GPM_FEED_PER_PCT }); }, get: function (s) { return (CS(s).feed_pump_speed_pct || 0) * GPM_FEED_PER_PCT; } }, // SG Feed rate gpm
    imro929i738: { set: function (v) { cmd({ action: 'set_spray', pct: v }); }, get: function (s) { return CS(s).spray_valve_pct; } },                    // spray %
    imro96mj15p: { set: function (v) { cmd({ action: 'set_heater', power_pct: v }); }, get: function (s) { return CS(s).heater_power_pct; } },             // heater %
    imrpq29jo7t: { set: function (v) { cmd({ action: 'set_auto_setpoint', channel_id: 'boron_conc', value: v }); }, get: function (s) { var c = chan(s, 'boron_conc'); return c && c.setpoint != null ? c.setpoint : null; } }, // boron target ppm (control-layer channel setpoint)
    imrpq48hn3t: { set: function (v) { cmd({ action: 'set_charging_flow', normalized: v / GPM_CHARGING }); }, get: function (s) { return (CS(s).charging_flow_normalized || 0) * GPM_CHARGING; } }, // charging, gpm base (clamped to NUM_BOUNDS_BASE)
    imrsg8b7b9o: { set: function (v) { cmd({ action: 'set_pressure_setpoint', mpa: v }); }, get: function (s) { return CS(s).pressure_setpoint || 0; } }, // plant pressure setpoint
    // Steam dump setpoint — the secondary-cooldown handle. Sits directly under the
    // STEAM PRESS indication on the card so the gap between the two is legible: at power
    // the SG runs ~819 psi against a 1194 psi setpoint, which is WHY the dump is shut.
    ims31tq7mgc: { set: function (v) { cmd({ action: 'set_steam_dump_setpoint', mpa: v }); }, get: function (s) { return CS(s).steam_dump_setpoint || 0; } },
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
    imrmstovyli: function (s) { return dQ((IN(s).afw_flow || 0) * GPM_AFW); },   // AFW flow (true afw_flow)
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
    imrzp89wdfu: function (s) { return dQ((IN(s).letdown_flow || 0) * GPM_LETDOWN); },  // letdown flow (readout)
    imrzp8qps6u: function (s) { return dQ((IN(s).charging_flow || 0) * GPM_CHARGING); },  // charging flow (readout)
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
    // SUR, DPM (#271). NOT a log channel and it has no trip — the limits are the `sur_high`
    // ALARM at 1.0 and the rod-withdrawal INTERLOCK at 1.5 (clearing below 0.8), which is a
    // command block rather than a scram. Red therefore means "the withdrawal block is on", not
    // "you are about to trip", and that is the more useful thing to say here.
    imro6qsncb9: function (s) {
      var v = IN(s).startup_rate || 0;
      var text = (v >= 0 ? '+' : '') + v.toFixed(2);
      var color = v >= surBlockDpm() ? NIS_TRIP_COLOR
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
    bdFeedStatus: function (s) { return feedStatus(s); },                                              // SG feed controller status (#214)
    bdRodStatus: function (s) { return rodStatus(s); },                                                // rod controller status (#306)
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
  function surBlockDpm() {
    var il = _PROT.interlocks || [];
    for (var i = 0; i < il.length; i++) {
      if (il[i].instrument === 'startup_rate' && il[i].direction === 'high' &&
          (il[i].blocks || []).indexOf('rod_start') >= 0) return il[i].setpoint;
    }
    return 1.5;
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
      var flow = !!CS(s).charging_pump_running && (IN(s).charging_flow || 0) > 1e-4;
      var eccs = !!IN(s).hpi_active && (IN(s).hpi_flow || 0) > 1e-4;
      return { temp: 50, contents: 'water', flowing: flow || eccs,
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
      normLo: P_SET - (_PZ.heater_band_mpa || 0.207),
      normHi: P_SET + (_PZ.spray_band_mpa || 0.345),
      alarmHi: alarmSp('pzr_pressure_high', 15.86),
      tripHi: tripSp('primary_pressure', 'high', 16.44) },
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
  function pressureBand(s) {
    var b = TILE_BANDS.ims2immsvn6;
    var sp = CS(s).pressure_setpoint;
    if (sp == null || !isFinite(sp)) sp = P_SET;
    var out = {
      normLo: sp - (_PZ.heater_band_mpa || 0.207),
      normHi: sp + (_PZ.spray_band_mpa || 0.345)
    };
    if (!s || !s.rps_state) return out;                                // no RPS section → authored
    if (limitingArmedTrip('primary_pressure', 'low', s)) return out;   // armed → authored, red intact
    out.tripLo = b.min;
    out.alarmLo = b.min;
    out.winLo = b.min;
    out.winHi = out.normHi + 0.15 * (out.normHi - b.min);
    // `ok`, not `trip`: bypassed-for-the-mode is a status indication, and a red note here would
    // say the opposite of what the reclassified alarms say.
    out.note = 'LO TRIP BLKD';
    out.noteKind = 'ok';
    return out;
  }
  function bandsFor(id, s) {
    var b = TILE_BANDS[id];
    var mv = id === 'ims2immk7ks' ? tavgBand(s)
           : (id === 'ims2immsvn6' ? pressureBand(s)
           : (id === 'imrzl4b7g9m' ? powerBand(s) : null));
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
  function tile(id, read) {
    return function (s) {
      var b = bandsFor(id, s);           // already in the active DISPLAY unit
      var sc = displayScale(b);
      var t = TILE_UNIT[id], m = t ? fam(t.fam) : null;
      var v = read(s);                   // …but the reading arrives in BASE units
      if (v != null && isFinite(v) && m) v = m.to(v);
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
        // sim clock drives the tile's 3-minute sampling window (see comp_indicator_panel)
        t: (s.metadata && s.metadata.sim_time != null) ? s.metadata.sim_time : null,
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
  // `sub` may be a function (s) -> string where the caption carries a unit — it is rendered
  // per popover open, so it follows the display mode like every other number on the board.
  // The pressure one also stops the setpoint being a hand-copied literal: it read a flat
  // "1800 psi" while the table said 12.41 MPa, which is 1799.9 and rounds there by luck.
  var BLOCKABLE_TRIPS = [
    { id: 'lo_press', label: 'PZR PRESS LO-LO',
      sub: function () { return 'Reactor trip · ' + dP(tripSp('primary_pressure', 'low', 12.41)) + ' ' + uStr('press', 'psi') + ' (P-11 permissive)'; } },
    { id: 'lo_flow', label: 'RCS LOW FLOW', sub: 'Reactor trip · loss of flow (P-7 permissive)' },
    // #314. Blockable, so it MUST be listed here or the player carries a reactor trip they
    // cannot see or manage — and it shares lo_flow's P-7 permissive because WTSM 12.2
    // §12.2.3.12 blocks ALL the loss-of-flow trips together below P-7.
    { id: 'rcp_breaker', label: 'RCP BREAKER', sub: 'Reactor trip · pump breaker open (P-7 permissive)' },
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
  var DOC_PATCHES = {
    pipes: {
      // Turbine exhaust → condenser steam inlet. The route is authored orthogonally, but its
      // two waypoints sit 1 px and 2 px off the ports they line up with, so both "vertical"
      // legs lean. Pin them to the real port x.
      // 1551, not 1553, since 2026-08-03: the CONDENSER item patch below moves the tile
      // 2 px left, and this waypoint IS `condenser/steam-in`'s x. The two must move together.
      pmrr14xbt2h: { waypoints: [[1574, 340], [1551, 340]] },
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
      ims5glucngg: { props: { color: '#5aad7c', top: 428 } },
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
      imrobpq4a70: { props: { suctionAngle: 0, dischargeAngle: 180 } },
      // SG FEED card title, shortened from 'STEAM GEN FEED' to free its top-right corner
      // for the feed controller status word (#214, bdFeedStatus in EXTRA_ITEMS). MEASURED:
      // the full title runs to x=1812 and the longest status word (ISOLATED, 73 px at
      // fontSize 15) starts at 1782 — a 30 px overlap. Owner's call, 2026-07-31: "you could
      // shorten STEAM GEN to SG and fit it in the corner just like steam dump." A patch
      // rather than a builder edit because pwr_board_data.js is REGENERATED — the same
      // change made in the builder is lost the next time anyone re-exports.
      imrqxsodu5j: { props: { title: 'SG FEED' } },
      // REACTOR/ROD CONTROL card title, shortened to free its top-right corner for the rod
      // controller status word (#306, bdRodStatus in EXTRA_ITEMS). A patch and not a builder
      // edit for the same reason as the SG FEED one above — pwr_board_data.js is REGENERATED.
      //
      // MEASURED headless in US mode, and the arithmetic was wrong TWICE before the ruler
      // settled it. The authored 'REACTOR/ROD CONTROL' renders 161 px at fontSize 12 in a
      // 195 px card — 34 px of corner, against 54 px for 'HOLDING'. 'REACTOR CONTROL' is
      // 127 px and looks like it leaves 68 px, but it does not: the widest word is
      // 'AT LIMIT' at 61 px, and an rAnchor item's rendered right edge sits 41 px inside its
      // authored `left`, so even pinned at the card edge the word starts 14 px INSIDE the
      // title. 'ROD CONTROL' is 93 px and clears it. Nothing is lost by dropping 'REACTOR/':
      // everything on this card is a rod action, SCRAM included — it drops the banks.
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
      imrpk8169ds: { props: { top: 402 } },
      imrpk8grvcz: { props: { top: 402 } },
      imrpk8kjsjs: { props: { top: 402 } },
      // (ROD AUTO's `top: 428` rides on its colour entry above — same key, one object.)
      imrsk4xz2dm: { props: { top: 428 } },

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
      pressurizer: { props: { top: 233 } },

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
      condenser: { props: { left: 1403 } },

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
      ims175lciah: { props: { title: 'NUC INSTR (NIS)' } }
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
      function fs(engaged, standDown, saturated, pumpPct) {
        return feedStatus({ automation: { channels: [ { id: 'feed_sg', engaged: engaged,
                              stand_down: standDown || null, saturated: saturated || null } ] },
                            control_state: { feed_pump_speed_pct: pumpPct == null ? 100 : pumpPct } });
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
      // The corner only exists because the card title was shortened. If a re-export or an
      // owner edit restores the long title, the status word overlaps it — silently, since
      // both still render. Pin the patch that makes the room.
      ck('driver: DOC_PATCHES shortened the SG FEED card title', (function () {
        var it = (window.RD_PWR_BOARD_DOC.items || []).filter(function (x) { return x.id === 'imrqxsodu5j'; })[0];
        return it && it.title === 'SG FEED' ? true : (it ? it.title : 'card missing');
      })() === true);
      // ---- the ROD status word and the IN-OUT lamps (#306) --------------------------------
      // Same discipline as the feed block above: switched on CODES. The ordering checks are
      // the load-bearing ones — AT LIMIT must outrank motion (the bank can be on its limit
      // and withdrawing at the same time, and the limit is the fact that says the controller
      // has run out of room), and SCRAM must outrank everything.
      function rs(opts) {
        opts = opts || {};
        return rodStatus({
          automation: { channels: [{ id: 'rods_tavg', engaged: opts.engaged !== false }] },
          interlocks: [{ active: !!opts.blocked, blocks: ['rod_start', 'rod_nudge'], withdrawal_only: true }],
          control_state: { rod_groups: [{ id: 'control_rods',
            scrammed: !!opts.scrammed, moving: !!opts.moving, direction: opts.direction || 0,
            at_insertion_limit: !!opts.atLimit }] }
        });
      }
      ck('driver: rod status HOLDING when engaged, still, and off its limit',
        rs().text === 'HOLDING', rs().text);
      ck('driver: rod status IN / OUT follows the drive direction',
        rs({ moving: true, direction: -1 }).text === 'IN' &&
        rs({ moving: true, direction: 1 }).text === 'OUT',
        rs({ moving: true, direction: -1 }).text + '/' + rs({ moving: true, direction: 1 }).text);
      ck('driver: rod status MANUAL when the operator has the bank',
        rs({ engaged: false }).text === 'MANUAL', rs({ engaged: false }).text);
      ck('driver: rod status TRIPPED outranks everything, including a disengaged channel',
        rs({ scrammed: true, engaged: false, moving: true, direction: -1 }).text === 'TRIPPED',
        rs({ scrammed: true, engaged: false, moving: true, direction: -1 }).text);
      ck('driver: rod status AT LIMIT outranks motion — the bank can withdraw off its limit',
        rs({ atLimit: true, moving: true, direction: 1 }).text === 'AT LIMIT',
        rs({ atLimit: true, moving: true, direction: 1 }).text);
      ck('driver: rod status BLOCKED on a standing withdrawal interlock (#306)',
        rs({ blocked: true }).text === 'BLOCKED' &&
        rs({ blocked: true, moving: true, direction: -1 }).text === 'BLOCKED',
        rs({ blocked: true }).text);
      ck('driver: an INACTIVE interlock is not a block — the flag is read, not its presence',
        rs({ blocked: false }).text === 'HOLDING', rs({ blocked: false }).text);
      ck('driver: AT LIMIT still outranks BLOCKED — a tech-spec floor beats a rate guard',
        rs({ blocked: true, atLimit: true }).text === 'AT LIMIT',
        rs({ blocked: true, atLimit: true }).text);
      ck('driver: rod status is GREEN only while the controller is actually regulating',
        rs().color === BD_OK && rs({ moving: true, direction: -1 }).color === BD_OK &&
        rs({ engaged: false }).color === BD_WARN && rs({ atLimit: true }).color === BD_WARN &&
        rs({ blocked: true }).color === BD_WARN && rs({ scrammed: true }).color === BD_WARN);
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
      // ---- NIS readouts show their thresholds (#271) --------------------------------------
      // The startup net is P-10 (10 %) < IR high (~20 %) < PR low setpoint (25 %). #267 made the
      // PR rung visible; these are the other two. Before this, SR went amber at its handoff
      // caution and NOTHING marked either trip — so on the channel whose whole job is to catch a
      // missed block, the caution and the scram looked identical, and IR looked like nothing.
      function nis(id, ins, blocks) {
        return RD.PwrBoardDriver.valueFor({ id: id }, {
          instruments: ins, control_state: {}, true_state: { plant_mode: 2 },
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
      // SUR has no trip: red means the ROD WITHDRAWAL BLOCK is on (1.5 DPM), amber the alarm (1.0).
      ck('driver: SUR readout marks the 1.0 alarm and the 1.5 withdrawal block',
        nis('imro6qsncb9', { startup_rate: 0.3 }).color === SR_NORMAL_COLOR &&
        nis('imro6qsncb9', { startup_rate: 1.1 }).color === SR_HANDOFF_COLOR &&
        nis('imro6qsncb9', { startup_rate: 1.6 }).color === NIS_TRIP_COLOR,
        [0.3, 1.1, 1.6].map(function (v) { return nis('imro6qsncb9', { startup_rate: v }).color; }).join(' '));
      // Both thresholds come from the protection tables, not literals — a retune must move them.
      ck('driver: SUR thresholds are read from the alarm and interlock tables',
        surAlarmDpm() === 1.0 && surBlockDpm() === 1.5, surAlarmDpm() + ' / ' + surBlockDpm());

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
