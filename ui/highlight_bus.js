/* ui/highlight_bus.js — RD.Highlight, one shared highlight bus (#444, spec §7).
 *
 * Every surface that names a channel or a component participates: the synoptic board, the
 * merged indications list, the chart's lanes, the alarm tiles, the SOE markers. Point at one
 * and its relations light everywhere else.
 *
 * ------------------------------------------------- THE SPEC'S PREMISE WAS WRONG, ON PURPOSE
 * §7 says "the synoptic SVG already carries `data-highlight-id` hooks". It does not — that
 * attribute exists only in two Blueprint documents describing a `pwr_synoptic.js` that was
 * never built; the V2 board replaced that renderer. The real, GATE-VALIDATED vocabulary is
 * `CONTROL_LABEL_MAP` in ui/diagram/board/pwr_board_wiring.js (whose own header states it IS
 * the highlight vocabulary) resolved through `RD.PwrBoard.revealControl`. This file is built
 * on that. `ui/diagram/board/pwr_board_data.js` is GENERATED, so retrofitting attributes into
 * it was never an option either.
 *
 * ------------------------------------------------------------------- MANY-TO-MANY, NOT 1:1
 * One component has many channels — an SG has level, pressure, steam flow, feed flow,
 * temperature. One channel can involve several components: subcooling margin derives from the
 * loop bulk AND the core-exit thermocouple, so it lights both. Every entry is a SET in both
 * directions; a 1:1 lookup would silently drop the second half of exactly the relationships
 * worth teaching.
 *
 * ------------------------------------------------ SELF-HALO vs RELATION-HALO (the ruling)
 * OWNER DIRECTIVE 2026-07-28 (quoted at ui/app.js's Scanner section): moving over something
 * to show it in the System Scanner must NOT highlight the object moused over. OWNER SELECTION
 * 2026-08-10, from the options presented: that directive means **no SELF-halo on
 * NON-INTERACTIVE elements** — which is exactly what spec §7 asks for — and the board's
 * existing hover styling on CONTROLS (pwr_board.css) is the "existing behaviour, unchanged".
 *
 * So this file NEVER lights the element under the pointer. It lights that element's
 * RELATIONS. The emergent property is worth protecting: nothing lights under the cursor and
 * things light elsewhere means "this is a readout"; something lights under the cursor means
 * "this is a control". A beginner learns which parts of the board they can operate just by
 * moving the mouse — do not smooth that away by making everything light on hover.
 *
 * ------------------------------------------------------------------------------ TREATMENT
 * A soft CYAN halo, an outer glow, never a fill or a recolor. Cyan is the only board colour
 * that is NOT a plant state: green, amber and red all carry condition meaning, so a halo in
 * any of them could be read as a state change. The element's own colours stay untouched
 * underneath, so a haloed component in alarm still reads as in alarm. Hover is transient;
 * click PINS, and pinned differs by WEIGHT, not hue — a second colour would be a second
 * meaning nobody asked for.
 */
(function (G) {
  'use strict';
  var RD = G.RD = G.RD || {};

  var CLS = 'hl-glow', CLS_PIN = 'hl-pin';

  /* series id -> the board items and instruments it relates to. Seeded from the three maps
   * that already exist rather than invented: TILE_SERIES (tile -> series) inverted,
   * ITEM_CHANNEL (item -> automation channel), and the CONTROL_LABEL_MAP labels themselves.
   * Anything absent simply does not light — a missing relation is a gap, never an error. */
  var SERIES_ITEMS = {
    power: ['Control Bank'], tavg: ['Tavg'], pressure: ['Plant Pressure'],
    sg_level: ['SG Level'], pzr_level: ['Pressurizer Heaters (PZR)'],
    // Subcooling derives from the loop bulk AND the core-exit thermocouple — the spec's own
    // example of why an entry has to be a set.
    subcool: ['Tavg', 'Plant Pressure'],
    boron: ['Boron'], mwe: ['Turbine Load'], load_tgt: ['Turbine Load'],
    steam_flow: ['Steam Flow'], fw_flow: ['Feed Flow'], sg_press: ['Steam Dump'],
    porv: ['Relief Valve (PORV)'], relief_act: ['Relief Valve (PORV)'],
    msiv: ['MSIV'], rcp_run: ['Reactor Coolant Pumps (RCP)'],
    rcp_secured: ['Reactor Coolant Pumps (RCP)'], rcp_cav: ['Reactor Coolant Pumps (RCP)'],
    afw_act: ['AFW'], afw_pump: ['AFW'], afw_block: ['AFW'],
    hpi_on: ['HPI'], rhr_on: ['Residual Heat Removal (RHR)'],
    rhr_valve: ['Residual Heat Removal (RHR)'], accum_valve: ['Accumulator valve'],
    accum_disch: ['Accumulator valve'], scrammed: ['SCRAM'], rod_limit: ['Control Bank'],
    rods_in: ['Control Bank'], turb_trip: ['Turbine Load'], demand_lo: ['Steam Dump'],
    sr: ['Source Range'], ir: ['Intermediate Range'], period: ['Reactor Period'],
    sur: ['Startup Rate'], sr_on: ['SR detector'],
    spray_flow: ['Pressurizer Spray (PZR)'], htr_pwr: ['Pressurizer Heaters (PZR)'],
    // #447's shed indication, added at the develop x backshop merge: a new channel with a
    // board presence and no entry here simply fails to light, which is a gap rather than
    // an error — but it is the gap a merge exists to close.
    htr_shed: ['Pressurizer Heaters (PZR)'], heater: ['Pressurizer Heaters (PZR)'],
    charging: ['Charging Pump (CVCS)'], letdown: ['Letdown Orifices (CVCS)']
  };

  /* ============================================== TARGETS THAT ARE NOT BOARD ITEMS (#735)
   * *(OWNER, #724 items 4 and 5: "the plot point in the 1/5 plot window should be glowing
   * since the step asks the user to press it"; "the 1/m plot button that opens the plot
   * should not be glowing, the plot point button on the plot window should be glowing.")*
   *
   * `revealControl` can only return a BOARD item, and the board's 1/M entry (`bdOneOverM`) is
   * the little button that OPENS the plot — both `1/M Plot Tool` and `Plot point` resolved to
   * it, so a step asking for the plot-point press glowed the opener, which is the owner's
   * report verbatim. The button he means lives in the 1/M PANEL, which is shell chrome, and so
   * does the time-compression speed bar.
   *
   * KEYED ON IDENTITY, NEVER ON POSITION. The 1/M panel is being relocated (#713) and its
   * buttons moved above the plot; `[data-oom="plot"]` is the button's own handle — the same
   * attribute `ui/panels/one_over_m.js` dispatches its click on — so it survives the move.
   * NOT a child index and NOT `.oom-foot > .btn:first-child`: the button bar was a side COLUMN
   * and is now a ROW above the plot, so sibling order and geometry both moved (workbench,
   * #713 — INHERITED, not measured here). Nor is the window's PARENT stable: `#oomWin` docks
   * at the foot of `.right-col` above 1200 px and FLOATS on `document.body` at 1200 px and
   * below, so the selector is rooted at the window's own id and nothing above it.
   * A selector that matches nothing (panel closed, feature off) resolves to null and glows
   * nothing, exactly as an unknown board label does.
   *
   * A SHELL TARGET WINS OVER THE BOARD MAP for the same label, and FALLS BACK TO IT when the
   * selector matches nothing. That combination is the whole behaviour for `Plot point`: the
   * board label stays in CONTROL_LABEL_MAP (deleting it would red `run_manual_controls` for
   * every step that names it), so with the 1/M window OPEN the ring lands on the plot-point
   * button and with it CLOSED it lands on `bdOneOverM` — the button you have to press to open
   * the window, which is the right target in that state. Not a fallback that glows nothing. */
  var SHELL_TARGETS = {
    'Plot point': '#oomWin [data-oom="plot"]',
    'Speed control': '#speed'
  };
  function shellTarget(label) {
    var sel = SHELL_TARGETS[label];
    if (!sel || typeof document === 'undefined') return null;
    return document.querySelector(sel);
  }

  function Bus() {
    this.pinned = null;      // { labels: [...] } or null
    this.hover = null;
  }

  function board() {
    return (RD.PwrBoard && RD.PwrBoard.isMounted && RD.PwrBoard.isMounted()) ? RD.PwrBoard : null;
  }
  function clearClass(cls) {
    var els = document.querySelectorAll('.' + cls);
    for (var i = 0; i < els.length; i++) els[i].classList.remove(cls);
  }

  /* Light a SET of labels. Returns how many resolved, so a caller can tell "nothing related"
   * from "the map is wrong" — the difference matters because the second is a defect and the
   * first is ordinary. */
  Bus.prototype.paint = function (labels, cls) {
    var b = board();
    var n = 0;
    (labels || []).forEach(function (lab) {
      var el = shellTarget(lab) || ((b && b.revealControl) ? b.revealControl(lab) : null);
      if (el) { el.classList.add(cls); n++; }
    });
    return n;
  };

  /* HOVER — transient, and it never lights the source. */
  Bus.prototype.enter = function (labels) {
    if (!labels || !labels.length) return;
    this.clearHover();
    this.hover = labels;
    this.paint(labels, CLS);
  };
  Bus.prototype.clearHover = function () {
    if (!this.hover) return;
    this.hover = null;
    clearClass(CLS);
    // A pinned set survives a hover leaving — that is the whole point of pinning.
    if (this.pinned) this.paint(this.pinned, CLS_PIN);
  };

  /* CLICK PINS, so the user can look away, scroll, or talk about it — essential for
   * classroom use and for the Instructor referring to a component. Clicking the same set
   * again releases it: a pin with no obvious release is a trap. */
  Bus.prototype.pin = function (labels) {
    if (!labels || !labels.length) return;
    var same = this.pinned && this.pinned.join('|') === labels.join('|');
    this.clearPin();
    if (same) return;
    this.pinned = labels.slice();
    this.paint(this.pinned, CLS_PIN);
  };
  Bus.prototype.clearPin = function () {
    if (!this.pinned) return;
    this.pinned = null;
    clearClass(CLS_PIN);
  };
  Bus.prototype.hasPin = function () { return !!this.pinned; };

  // What a series relates to. Unknown ids return [] rather than throwing — the registry has
  // 119 entries and the map covers the ones with a board presence.
  Bus.prototype.forSeries = function (id) { return SERIES_ITEMS[id] || []; };
  // What an SOE event relates to: its `ref` is already a CONTROL_LABEL_MAP label (#437).
  Bus.prototype.forEvent = function (ev) { return (ev && ev.ref) ? [ev.ref] : []; };

  RD.Highlight = new Bus();
  RD.Highlight.SERIES_ITEMS = SERIES_ITEMS;
  /* ONE RESOLVER for every surface that glows a label (#735): the checklist's three appliers
   * in ui/app.js call this so the board map and the shell overrides cannot disagree about
   * where a label points. */
  RD.Highlight.SHELL_TARGETS = SHELL_TARGETS;
  RD.Highlight.resolve = function (label) {
    var b = board();
    return shellTarget(label) || ((b && b.revealControl) ? b.revealControl(label) : null);
  };
  RD.Highlight.CLS = CLS;
  RD.Highlight.CLS_PIN = CLS_PIN;
}(typeof globalThis !== 'undefined' ? globalThis : this));
