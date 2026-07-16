/* ============================================================================
 * pwr_synoptic.js — PWR full-plant animated synoptic + margin cards
 * (Blueprint/new_diagram_controls.md, Appendix A).
 *
 * One integrated schematic is the sole PWR plant-control surface: 12 margin
 * cards, two diagram-embedded panels (pwCvcsPanel, pwAccumulatorPanel), sensor
 * taps, leaders, hover/highlight, "what matters now", pause freeze.
 *
 * HR1 / Animation HR1: in Realistic mode every number and every motion reads
 * snapshot.instruments, the §8.8 status booleans, or control_state (commanded
 * valve pose only) — never true_state. Learning mode adds the teaching layers
 * (contextual cues, deception duals, Physics Overlay fields, glows).
 *
 * app.js mounts this via RD.PwrSynoptic.mount(host, ctx) and forwards every
 * snapshot to render(s). Commands ride the existing [data-act]/[data-hold]
 * delegation in app.js; ctx = { cmd, conv, unit, dispP, dispT, dispTd, dispV,
 * mode(), overlay() }.
 * ========================================================================== */
;(function (RD) {
  'use strict';

  var VBW = 1200, VBH = 640;   // SVG viewBox
  var ctx = null, host = null, stage = null, svgEl = null, leadersEl = null;
  var refs = {};               // data-f name -> element
  var cardEls = {};            // card key -> element
  var mounted = false;
  var prev = { rcp: null, xe: null, xeT: null, xeSlope: 0, fuelSeen: false };
  var emTabUser = null, emTabAuto = 'hpi';
  var secUser = {};            // section key -> user open/closed override
  var nisUser = false, nisAutoOpen = null;   // NIS section: user toggle wins over the startup auto-open
  var armTimer = null;
  var resizeObs = null;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  // ------------------------------------------------------------ SVG builders
  function valve(id, x, y, lbl, opts) {
    opts = opts || {};
    var h = '<g id="' + id + '" class="valve' + (opts.closed ? ' closed' : '') + '"' +
      (opts.hint ? ' data-scanner-hint="' + esc(opts.hint) + '"' : '') + '>' +
      '<circle class="seat" cx="' + x + '" cy="' + y + '" r="9"/>' +
      '<g class="valve-sym" style="transform-origin:' + x + 'px ' + y + 'px">' +
      '<polygon points="' + (x - 9) + ',' + (y - 5) + ' ' + (x - 9) + ',' + (y + 5) + ' ' + x + ',' + y + '"/>' +
      '<polygon points="' + (x + 9) + ',' + (y - 5) + ' ' + (x + 9) + ',' + (y + 5) + ' ' + x + ',' + y + '"/>' +
      '</g>' +
      '<rect class="throttle" x="' + (x - 8) + '" y="' + (y + 10) + '" width="16" height="2.2" rx="1"/>' +
      (lbl ? '<text class="valve-lbl" x="' + x + '" y="' + (y - 13) + '" text-anchor="middle">' + lbl + '</text>' : '') +
      '</g>';
    return h;
  }
  function pump(id, x, y, r, lbl) {
    var v = r - 3;
    return '<g id="' + id + '" class="pump">' +
      '<circle class="pump-body" cx="' + x + '" cy="' + y + '" r="' + r + '"/>' +
      '<g id="' + id + 'Rotor" class="rotor" style="transform-origin:' + x + 'px ' + y + 'px">' +
      '<line class="pump-vane" x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + (y - v) + '"/>' +
      '<line class="pump-vane" x1="' + x + '" y1="' + y + '" x2="' + (x + v * 0.87) + '" y2="' + (y + v * 0.5) + '"/>' +
      '<line class="pump-vane" x1="' + x + '" y1="' + y + '" x2="' + (x - v * 0.87) + '" y2="' + (y + v * 0.5) + '"/>' +
      '</g><circle cx="' + x + '" cy="' + y + '" r="2.4" fill="#3a5870"/>' +
      (lbl ? '<text class="comp-sub" x="' + x + '" y="' + (y + r + 11) + '" text-anchor="middle">' + lbl + '</text>' : '') +
      '</g>';
  }
  function anchor(id, x, y) { return '<circle id="' + id + '" class="anchor" cx="' + x + '" cy="' + y + '" r="2" fill="none" stroke="none"/>'; }
  // ------------------------------------------------------------ the plant SVG
  function buildSvg() {
    var h = '<svg id="pwLoop" class="pw-loop" data-plant="pwr" viewBox="0 0 ' + VBW + ' ' + VBH + '" preserveAspectRatio="xMidYMid meet">';
    h += '<defs>' +
      '<linearGradient id="pwGradTube" x1="0" y1="470" x2="0" y2="300" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#c98a5a"/><stop offset="0.6" stop-color="#8a8a84"/><stop offset="1" stop-color="#6a9dc0"/></linearGradient>' +
      '<clipPath id="pwPzrClip"><rect x="442" y="207" width="56" height="108" rx="26"/></clipPath>' +
      '<clipPath id="pwSgClip"><path d="M682,470 V292 A58 42 0 0 1 798,292 V470 A58 50 0 0 1 682,470 Z"/></clipPath>' +
      '<clipPath id="pwCondClip"><rect x="822" y="397" width="116" height="111" rx="8"/></clipPath>' +
      '<clipPath id="pwTurbClip"><path d="M840,275 L950,258 L950,355 L840,338 Z"/></clipPath>' +
      '</defs>';

    // ---- primary pipes (cases first, flows over) ----
    // spray line — hot leg (RCP discharge / high-pressure side), drawn under hot leg
    h += '<g id="gSpray" class="diagram-node" data-highlight-id="pzr-pressurizer">' +
      '<path class="pipe hair" d="M618,320 V350 H480 V214"/>' +
      valve('pwPzrSprayValve', 618, 335, 'spray', { hint: 'Pressurizer spray valve — taps the hot leg on the RCP discharge (high-pressure) side; needs RCP flow to work.' }) +
      '</g>';
    // hot leg / cold leg (hot enters the SG shell; cold returns from the outlet-plenum side)
    h += '<g id="gHotLeg" class="diagram-node" data-highlight-id="reactor-temperature">' +
      '<path id="pwHotLeg" class="pipe" d="M395,320 H680"/>' +
      '<path id="pwHotLegFlow" class="flow" d="M395,320 H680" stroke="var(--syn-warm)"/>' +
      anchor('pwHotLegAnchor', 470, 320) + '</g>';
    h += '<g id="gColdLeg" class="diagram-node" data-highlight-id="primary-inventory">' +
      '<path id="pwColdLeg" class="pipe" d="M680,470 H395"/>' +
      '<path id="pwColdLegFlow" class="flow" d="M680,470 H395" stroke="var(--syn-cool)"/>' +
      anchor('pwColdLegAnchor', 480, 470) + '</g>';

    // ---- reactor pressure vessel: domed head + hemispherical bottom (ref. schematic) ----
    h += '<g id="gCore" class="diagram-node" data-highlight-id="reactor-power" data-scanner-hint="Reactor pressure vessel — domed head with the rod drives on top; fuel rods in the core barrel. Cold in low, hot out high.">' +
      '<path class="vessel" d="M285,480 V280 A55 44 0 0 1 395,280 V480 A55 26 0 0 1 285,480 Z"/>' +
      '<ellipse id="pwCoreGlow" class="cherenkov" cx="340" cy="400" rx="40" ry="76"/>' +
      '<ellipse id="pwFuelGlow" class="fuel-glow" cx="340" cy="400" rx="30" ry="62"/>' +
      '<rect class="vessel-inner" x="302" y="330" width="76" height="145" rx="3"/>';
    for (var fx = 308; fx <= 372; fx += 8) h += '<line class="fuel" x1="' + fx + '" y1="338" x2="' + fx + '" y2="468"/>';
    h += '<text class="comp-label" x="340" y="312" text-anchor="middle">Reactor</text>' +
      anchor('pwRpvAnchor', 287, 360) + anchor('pwCoreAnchor', 340, 400) + '</g>';
    // control-rod drives enter through the head (fill depth = inserted fraction)
    h += '<g id="gRods" class="diagram-node" data-highlight-id="reactor-rods" data-scanner-hint="Rod drives — control rods (green) and shutdown rods (violet) enter through the vessel head; length below the bridge = inserted depth.">' +
      '<rect id="pwRodCap" x="306" y="182" width="68" height="5" rx="2" fill="#3a5870"/>' +
      '<line x1="322" y1="187" x2="322" y2="196" stroke="#2c3e4e" stroke-width="1"/>' +
      '<g id="pwRodFill">' +
      '<rect class="rod-fill" x="312" y="187" width="3.5" height="72" rx="1"/>' +
      '<rect class="rod-fill" x="324" y="187" width="3.5" height="72" rx="1"/>' +
      '<rect class="rod-fill" x="336" y="187" width="3.5" height="72" rx="1"/></g>' +
      '<g id="pwRodShutdown">' +
      '<rect class="rod-fill shut" x="352" y="187" width="3.5" height="72" rx="1"/>' +
      '<rect class="rod-fill shut" x="364" y="187" width="3.5" height="72" rx="1"/></g>' +
      '<text class="comp-sub" x="340" y="176" text-anchor="middle">rod drives</text></g>';

    // ---- pressurizer (capsule on the hot leg) + relief ----
    h += '<g id="gPzr" class="diagram-node" data-highlight-id="pzr-pressurizer" data-scanner-hint="Pressurizer — steam bubble over water sets primary pressure. Heaters raise it, spray lowers it.">' +
      '<path class="pipe hair" d="M470,315 V320"/>' +
      '<rect class="vessel" x="440" y="205" width="60" height="112" rx="28"/>' +
      '<g clip-path="url(#pwPzrClip)">' +
      '<rect class="steam-space" x="442" y="207" width="56" height="108"/>' +
      '<rect id="pwPzrWater" class="water" x="442" y="258" width="56" height="58"/>' +
      '<path id="pwPzrSurface" class="surface" d="M442,258 H498"/>' +
      '<g id="pwPzrHeater"><path class="heater-coil" d="M448,298 h10 m4,0 h10 m4,0 h10 m4,0 h6"/><path class="heater-coil" d="M448,303 h10 m4,0 h10 m4,0 h10 m4,0 h6"/></g>' +
      '<g id="pwPzrSprayMist"><line class="spray-mist" x1="470" y1="214" x2="458" y2="232"/><line class="spray-mist" x1="470" y1="214" x2="470" y2="234"/><line class="spray-mist" x1="470" y1="214" x2="482" y2="232"/></g>' +
      '</g>' +
      '<text class="comp-sub" x="506" y="216" style="fill:#52687c">PZR</text>' +
      anchor('pwPzrAnchor', 470, 260) + '</g>';
    // relief paths: PZR top -> block valve -> PORV -> relief tank (tucked in the
    // RPV/PZR gap); parallel mechanical-safety path above
    h += '<g id="gRelief" class="diagram-node" data-highlight-id="pzr-relief" data-scanner-hint="Relief paths — PORV (with upstream block valve) and mechanical safety valves discharge to the relief tank.">' +
      '<path class="pipe hair" d="M470,205 V188 H420 V244"/>' +
      '<path class="pipe hair" d="M492,205 V174 H408 V244"/>' +
      '<path id="pwReliefFlow" class="relief-flow" d="M470,205 V188 H420 V244"/>' +
      '<path id="pwReliefGhost" class="relief-flow ghost lrn-only" d="M470,205 V188 H420 V244"/>' +
      '<path id="pwSafetyFlow" class="relief-flow" d="M492,205 V174 H408 V244"/>' +
      valve('pwPorvBlock', 456, 188, '', { hint: 'PORV block (isolation) valve — closing it isolates a stuck-open PORV even when the indicator lies. The key TMI recovery action.' }) +
      valve('pwPorv', 432, 188, '', { hint: 'PORV — power-operated relief valve. Its indicator shows the COMMANDED position, not reality (the TMI trap).' }) +
      valve('pwSafetyValve', 475, 174, '', { closed: true, hint: 'Code safety valves — mechanical, lift and reseat on pressure alone. No operator command.' }) +
      '<text class="valve-lbl" x="432" y="172" text-anchor="middle">PORV</text>' +
      '<rect class="vessel" x="398" y="244" width="44" height="48" rx="6"/>' +
      '<text class="comp-sub" x="420" y="264" text-anchor="middle">relief</text><text class="comp-sub" x="420" y="274" text-anchor="middle">tank</text>' +
      '<g id="pwTapPorv" class="sensor"><circle class="tap" cx="432" cy="188" r="2.4"/><circle class="tap-ring" cx="432" cy="188" r="5"/></g>' +
      anchor('pwPorvAnchor', 432, 182) + '</g>';

    // ---- steam generator: domed shell, tube sheet, divided plena, nested U-tubes ----
    h += '<g id="gSg" class="diagram-node" data-highlight-id="sg-level" data-scanner-hint="Steam generator — U-tube boiler. Primary rises through the inverted-U bundle; secondary boils around it. Level is the indicated (shrink/swell) level.">' +
      '<path class="vessel" d="M680,470 V292 A60 44 0 0 1 800,292 V470 A60 52 0 0 1 680,470 Z"/>' +
      '<g clip-path="url(#pwSgClip)">' +
      '<rect class="steam-space" x="682" y="246" width="116" height="276"/>' +
      '<rect id="pwSgWater" class="water" x="682" y="355" width="116" height="170"/>' +
      '<path id="pwSgSurface" class="surface" d="M682,355 H798"/>' +
      '<g id="pwSgTubes"></g>' +
      '<line id="pwSgUtubeRef" x1="688" y1="290" x2="792" y2="290" stroke="#5a7488" stroke-width="1" stroke-dasharray="4 4" opacity=".8"/>' +
      '<line x1="682" y1="470" x2="798" y2="470" stroke="#3a5870" stroke-width="2"/>' +
      '<line x1="740" y1="472" x2="740" y2="520" stroke="#3a5870" stroke-width="1.2"/>' +
      '</g>' +
      '<line class="band" x1="675" y1="313" x2="675" y2="351" stroke="#35704a"/>' +
      '<text class="comp-label" x="740" y="278" text-anchor="middle">Steam Gen</text>' +
      anchor('pwSgAnchor', 682, 380) + '</g>';

    // ---- main steam: SG top-right shoulder -> right -> down through governor -> turbine ----
    h += '<g id="gSteamHeader" class="diagram-node" data-highlight-id="sg-steam" data-scanner-hint="Main steam header — SG top outlet, right then down through the governor valve into the turbine.">' +
      '<path class="pipe thin" d="M782,254 V216 H828 V306 H840"/>' +
      '<path id="pwSgSteamHeader" class="flow steam-dash" d="M782,254 V216 H828 V306 H840" stroke="var(--syn-steam)"/>' +
      anchor('pwSgSteamOutletAnchor', 782, 230) + '</g>';
    h += '<g id="gGov" class="diagram-node" data-highlight-id="turbine-generator">' +
      valve('pwGovValve', 828, 258, '', { hint: 'Turbine governor valve — modulates steam admission to match generator load. Position from the governor instrument.' }) +
      '<text class="valve-lbl" x="806" y="250" text-anchor="middle">gov</text>' +
      anchor('pwGovValveAnchor', 828, 258) + '</g>';
    h += '<g id="gDump" class="diagram-node" data-highlight-id="turbine-generator">' +
      '<path class="pipe hair" d="M828,306 V385 H855 V395"/>' +
      '<path id="pwSteamDumpFlow" class="flow steam-dash" d="M828,306 V385 H855 V395" stroke="var(--syn-steam)"/>' +
      valve('pwSteamDump', 828, 348, '', { hint: 'Steam dump / turbine bypass — vents steam to the condenser to hold SG pressure on load rejection. AUTO opens on high SG pressure.' }) +
      '<text class="valve-lbl" x="804" y="340" text-anchor="middle">dump</text></g>';

    // ---- turbine over condenser, generator beside on a short shaft ----
    h += '<g id="gTurbine" class="diagram-node" data-highlight-id="turbine-generator" data-scanner-hint="Turbine-generator — steam in from the left, exhaust drops straight into the condenser below.">' +
      '<path class="vessel" d="M840,275 L950,258 L950,355 L840,338 Z"/>' +
      '<line x1="840" y1="306" x2="950" y2="306" stroke="#3a5870" stroke-width="1.3"/>' +
      '<g clip-path="url(#pwTurbClip)"><g id="pwTurbineRotor"></g></g>' +
      '<text class="comp-label" x="895" y="250" text-anchor="middle">Turbine</text>' +
      '<line id="pwShaft" x1="950" y1="306" x2="962" y2="306" stroke="#4a6680" stroke-width="4"/>' +
      '<rect id="pwGenerator" class="vessel" x="962" y="282" width="63" height="48" rx="6"/>' +
      '<text class="comp-sub" x="993" y="309" text-anchor="middle" style="fill:#52687c">GEN</text>' +
      '<text class="comp-sub" x="993" y="273" text-anchor="middle">⚡ to grid</text>' +
      anchor('pwTurbineAnchor', 895, 306) + anchor('pwGeneratorAnchor', 993, 306) + '</g>';

    // ---- condenser (square) + hotwell + CW + cooling tower ----
    h += '<g id="gCondenser" class="diagram-node" data-highlight-id="condenser" data-scanner-hint="Condenser — turbine exhaust and steam-dump flow condense here; hotwell pool below (decorative).">' +
      '<path class="pipe thin" d="M895,355 V395"/>' +
      '<path id="pwExhaustFlow" class="flow steam-dash" d="M895,355 V395" stroke="var(--syn-cond)"/>' +
      '<rect id="pwCondenser" class="vessel" x="820" y="395" width="120" height="115" rx="8"/>' +
      '<g clip-path="url(#pwCondClip)">' +
      '<rect class="steam-space" x="822" y="397" width="116" height="111"/>' +
      '<line x1="826" y1="440" x2="934" y2="440" stroke="#3a5460" stroke-width="3"/>' +
      '<line x1="826" y1="455" x2="934" y2="455" stroke="#3a5460" stroke-width="3"/>' +
      '<rect id="pwCondWater" class="water" x="822" y="488" width="116" height="20"/>' +
      '<path class="surface" d="M822,488 q29,-2 58,0 t58,0"/>' +
      '</g>' +
      '<text class="comp-label" x="880" y="412" text-anchor="middle">Condenser</text>' +
      anchor('pwCondenserAnchor', 880, 452) + '</g>';
    h += '<g id="gTower" class="diagram-node" data-highlight-id="cooling-tower" data-scanner-hint="Cooling tower — the ultimate heat sink for the condenser cooling water.">' +
      '<path class="pipe hair" d="M940,435 H986"/><path class="pipe hair" d="M986,478 H940"/>' +
      '<path id="pwCwFlow" class="flow" d="M940,435 H986" stroke="var(--syn-cw)"/>' +
      '<path id="pwCwFlowRet" class="flow" d="M986,478 H940" stroke="var(--syn-cw)"/>' +
      '<g id="pwCoolingTower"><path class="vessel" d="M975,530 C987,478 983,455 993,415 H1032 C1042,455 1038,478 1050,530 Z"/>' +
      '<path d="M993,408 q8,-8 18,-4 q10,-6 16,4" fill="none" stroke="#3d4c5c" stroke-width="1.4" opacity=".7"/>' +
      '<text class="comp-sub" x="1012" y="545" text-anchor="middle">cooling tower</text></g></g>';

    // ---- feed train: hotwell -> condensate pump -> feed pump -> SG; AFW joins ----
    h += '<g id="gFeed" class="diagram-node" data-highlight-id="sg-steam" data-scanner-hint="Feed train — condensate and feed pumps return water to the SG downcomer. Loss of feedwater stops this animation.">' +
      '<path class="pipe hair" d="M905,510 V560 H815 V430 H800"/>' +
      '<path id="pwFwFlow" class="flow" d="M905,510 V560 H815 V430 H800" stroke="var(--syn-cond)"/>' +
      pump('pwCondPump', 880, 560, 10, 'cond') + pump('pwFeedPump', 842, 560, 10, 'feed') + '</g>';
    h += '<g id="gAfw" class="diagram-node" data-highlight-id="emergency-cooling" data-scanner-hint="Auxiliary feedwater — emergency feed to the SG after a loss of main feedwater.">' +
      '<path id="pwAfwLine" class="pipe hair" d="M862,578 V560" stroke="#4a3c1c"/>' +
      '<path id="pwAfwFlow" class="flow em" d="M862,578 V560"/>' +
      valve('pwAfwValve', 862, 566, '', { hint: 'AFW discharge valve — pump flow reaches the SG only when this valve is open.' }) +
      '<rect class="vessel" x="846" y="578" width="32" height="26" rx="4"/>' +
      '<text class="comp-sub" x="862" y="617" text-anchor="middle" style="fill:#7a6a3a">AFW</text></g>';

    // ---- RHR loop: SG -> condenser (low-pressure cooldown) ----
    h += '<g id="gRhr" class="diagram-node" data-highlight-id="emergency-cooling" data-scanner-hint="RHR — residual heat removal cooldown loop from the SG to the condenser, once cool and depressurized.">' +
      '<path id="pwRhrLoop" class="pipe hair" d="M765,519 V632 H930 V510" stroke="#4a3c1c"/>' +
      '<path id="pwRhrFlow" class="flow em" d="M765,519 V632 H930 V510"/>' +
      '<text class="comp-sub" x="800" y="628" text-anchor="middle" style="fill:#7a6a3a">RHR</text></g>';

    // ---- ECCS injection: HPI, LPI, accumulators into the cold leg ----
    h += '<g id="gHpi" class="diagram-node" data-highlight-id="emergency-cooling" data-scanner-hint="High-pressure injection — ECCS charging into the cold leg. AUTO actuates on low pressure.">' +
      '<path id="pwHpiLine" class="pipe hair" d="M446,540 V470" stroke="#4a3c1c"/>' +
      '<path id="pwHpiFlow" class="flow em" d="M446,540 V470"/>' +
      '<circle class="pump-body" cx="446" cy="549" r="8"/>' +
      '<text class="comp-sub" x="446" y="572" text-anchor="middle" style="fill:#7a6a3a">HPI</text>' +
      anchor('pwHpiLineAnchor', 446, 505) + '</g>';
    h += '<g id="gLpi" class="diagram-node" data-highlight-id="emergency-cooling" data-scanner-hint="Low-pressure injection — high-volume ECCS, effective once primary pressure falls low enough.">' +
      '<path id="pwLpiLine" class="pipe hair" d="M408,470 V492 H310" stroke="#4a3c1c"/>' +
      '<path id="pwLpiFlow" class="flow em" d="M310,492 H408 V470"/>' +
      '<text class="comp-sub" x="298" y="505" text-anchor="middle" style="fill:#7a6a3a">LPI</text>' +
      anchor('pwLpiLineAnchor', 408, 480) + '</g>';
    h += '<g id="gAccum" class="diagram-node" data-highlight-id="accumulators" data-scanner-hint="N₂ accumulators — passive. Below the arming pressure they discharge through the check valve into the cold leg; no operator command.">' +
      '<path class="pipe hair" d="M312,548 V538 H428 V470"/><path class="pipe hair" d="M364,548 V538"/>' +
      '<path id="pwAccumulatorFlow" class="flow em" d="M312,538 H428 V470"/>' +
      valve('pwAccumulatorCheckValve', 428, 505, '', { hint: 'Accumulator check valve — opens passively when primary pressure falls below tank pressure.' }) +
      '<g id="pwAccumulatorTanks">' +
      '<rect class="vessel" x="292" y="548" width="40" height="74" rx="12"/>' +
      '<rect class="vessel" x="344" y="548" width="40" height="74" rx="12"/>' +
      '<text class="comp-sub" x="338" y="634" text-anchor="middle">N₂ accumulators</text></g>' +
      '<circle id="pwAccumulatorInjection" cx="428" cy="470" r="4" fill="#3a5870"/>' +
      anchor('pwAccumulatorsAnchor', 338, 585) + anchor('pwAccumulatorInjectionAnchor', 428, 462) + '</g>';

    // ---- CVCS: letdown branch -> box (panel on face); charging pump -> cold leg ----
    h += '<g id="gCvcs" class="diagram-node" data-highlight-id="cvcs" data-scanner-hint="CVCS — chemical &amp; volume control. Letdown out of the cold leg upstream of the RCP; charging back in downstream. Boron rides the charging flow.">' +
      '<path id="pwCvcsLetdownBranch" class="pipe hair" d="M615,470 V512"/>' +
      '<path id="pwCvcsLetdownFlow" class="flow" d="M615,470 V512" stroke="var(--syn-cool)"/>' +
      '<rect id="pwCvcsBox" class="vessel" x="465" y="512" width="180" height="120" rx="8"/>' +
      '<text class="comp-sub" x="638" y="524" text-anchor="end" style="fill:#52687c">CVCS</text>' +
      '<path id="pwCvcsChargeLeg" class="pipe hair" d="M505,512 V470"/>' +
      '<path id="pwCvcsChargeFlow" class="flow" d="M505,512 V470" stroke="var(--syn-cool)"/>' +
      pump('pwCvcsChargePump', 505, 492, 9, '') +
      '<text class="comp-sub" x="522" y="486" style="fill:#52687c">chg</text>' +
      anchor('pwCvcsBoxAnchor', 555, 572) + anchor('pwCvcsChargePumpAnchor', 505, 492) + anchor('pwCvcsLetdownBranchAnchor', 615, 490) + '</g>';

    // ---- RCP ----
    h += '<g id="gRcp" class="diagram-node" data-highlight-id="rcp" data-scanner-hint="Reactor coolant pump — forces primary flow. Impeller spins from the running status (Animation HR1).">' +
      pump('pwRcp', 550, 470, 15, 'RCP') + anchor('pwRcpAnchor', 550, 470) + '</g>';

    // ---- sensor taps (compact backed labels at the tap) ----
    h += '<g id="pwTapThot" class="sensor" data-scanner-hint="T-hot — hot-leg RTD downstream of the core outlet; reads the instrument.">' +
      '<circle class="tap" cx="418" cy="320" r="2.6"/><circle class="tap-ring" cx="418" cy="320" r="5"/>' +
      '<path class="s-leader" d="M418,320 V330"/>' +
      '<rect class="lbl-box" x="392" y="330" width="52" height="26" rx="3"/>' +
      '<text class="lbl-name" x="397" y="339">T-hot</text>' +
      '<text class="lbl-val" x="397" y="352" style="font-size:11px"><tspan data-f="tapThot">—</tspan><tspan class="lbl-unit" data-f="tapThotU"> °C</tspan></text></g>';
    h += '<g id="pwTapTcold" class="sensor" data-scanner-hint="T-cold — cold-leg RTD near the vessel inlet; reads the instrument.">' +
      '<circle class="tap" cx="458" cy="470" r="2.6"/><circle class="tap-ring" cx="458" cy="470" r="5"/>' +
      '<path class="s-leader" d="M458,470 V478"/>' +
      '<rect class="lbl-box" x="432" y="478" width="52" height="26" rx="3"/>' +
      '<text class="lbl-name" x="437" y="487">T-cold</text>' +
      '<text class="lbl-val" x="437" y="500" style="font-size:11px"><tspan data-f="tapTcold">—</tspan><tspan class="lbl-unit" data-f="tapTcoldU"> °C</tspan></text></g>';
    h += '<g id="pwTapSubcool" class="sensor" data-scanner-hint="Subcooling reference — hot-leg RTD; the margin to saturation reads on the Power &amp; Reactivity card bar.">' +
      '<circle class="tap" cx="665" cy="320" r="2.6"/><circle class="tap-ring" cx="665" cy="320" r="5"/></g>';

    // ---- leak sprays (break-flow instrument drives visibility) ----
    h += '<g id="pwLeakLoca" class="leak-site"><path class="leak-spray" d="M420,478 q-6,14 -14,20 M425,478 q0,16 -4,24 M430,478 q6,14 12,22"/></g>';
    h += '<g id="pwLeakSgtr" class="leak-site"><path class="leak-spray" d="M715,390 q-8,10 -16,14 M721,394 q-2,14 -8,20"/></g>';

    // ---- maintenance tag (scenario prop, hidden unless a scenario shows it) ----
    // Hangs over the AFW discharge valve, occluding its position indication —
    // the pump run lights stay visible and normal (TMI-2 M5). Clickable.
    h += '<g id="pwMaintTag" class="pw-tag" data-syn="tmitag" style="display:none" ' +
      'data-scanner-hint="Maintenance tag — hung during last shift\'s surveillance test. It covers the valve position indication.">' +
      '<path class="tag-cord" d="M862,560 q4,6 1,12" fill="none"/>' +
      '<g transform="rotate(7 866 572)">' +
      '<rect class="tag-body" x="848" y="556" width="36" height="26" rx="3"/>' +
      '<circle class="tag-hole" cx="866" cy="561" r="1.8"/>' +
      '<text class="tag-txt" x="866" y="569" text-anchor="middle">DO NOT</text>' +
      '<text class="tag-txt" x="866" y="577" text-anchor="middle">OPERATE</text>' +
      '</g></g>';

    h += '</svg>';
    return h;
  }

  // ------------------------------------------------------------ margin cards
  // Placement per Appendix A.1b anchor zones, tuned at 1280×800 so no card
  // overlaps equipment. Percentages are of .synoptic-stage.
  // Card anchor zones in SVG user units — positionCards() maps them through the
  // same viewBox transform as the diagram, so cards hug their equipment at any
  // window size (negative x = the left margin band beside the vessel).
  var PLACE = {
    power:     { sx: -140, sy: 6,   w: 188 },
    rod:       { sx: -140, sy: 230, w: 188 },
    emergency: { sx: -140, sy: 487, w: 188 },
    relief:    { sx: 190,  sy: 6,   w: 152 },
    pzr:       { sx: 473,  sy: 6,   w: 168 },
    steam:     { sx: 790,  sy: 6,   w: 150 },
    status:    { sx: 1090, sy: 6,   w: 128 },
    turbgen:   { sx: 1090, sy: 122, w: 128 },
    condenser: { sx: 1090, sy: 371, w: 128 },
    priminv:   { sx: 1090, sy: 499, w: 128 },
    sglevel:   { sx: 508,  sy: 205, w: 88 },
    rcp:       { sx: 508,  sy: 335, w: 88 },
  };

  function row(k, f, opts) {
    opts = opts || {};
    return '<div class="row' + (opts.ov ? ' ov-only' : '') + (opts.lrn ? ' lrn-only' : '') + '"' +
      (opts.hl ? ' data-hl="' + opts.hl + '"' : '') + (opts.hint ? ' data-scanner-hint="' + esc(opts.hint) + '"' : '') + '>' +
      '<span class="k">' + k + '</span><span class="v' + (opts.big ? ' big' : '') + '" data-f="' + f + '">—</span></div>';
  }
  function seg(btns, hint) {
    var h = '<div class="seg"' + (hint ? ' data-scanner-hint="' + esc(hint) + '"' : '') + '>';
    btns.forEach(function (b) {
      var attr = b.hold ? 'data-hold="' + b.hold + '"' : 'data-act="' + b.act + '"';
      h += '<button ' + attr + (b.f ? ' data-f="' + b.f + '"' : '') + ' class="' + (b.on ? 'on ' : '') + (b.warn ? 'warn' : '') + '">' + b.l + '</button>';
    });
    return h + '</div>';
  }
  function numSet(id, min, max, val, act, lbl) {
    return '<input class="num-in" id="' + id + '" type="number" min="' + min + '" max="' + max + '" value="' + val + '">' +
      '<button class="btn-set" data-act="' + act + '">' + (lbl || 'Set') + '</button>';
  }
  function loadSlider(min, max, val) {
    return '<input type="range" class="load-slider" id="mweSlider" data-syn-slider="load" min="' + min + '" max="' + max + '" value="' + val + '" step="10"/>' +
      '<span class="load-slider-val" data-f="mweSliderVal">' + val + '</span> MW';
  }
  function card(key, hlId, title, body, opts) {
    opts = opts || {};
    var p = PLACE[key];
    return '<div class="plant-card' + (opts.em ? ' emergency' : '') + '" data-card="' + key + '" data-highlight-id="' + hlId + '"' +
      ' data-anchor="' + (opts.anchor || '') + '" style="width:' + p.w + 'px"' +
      (opts.hint ? ' data-scanner-hint="' + esc(opts.hint) + '"' : '') + '>' +
      '<div class="pc-head"><span>' + title + '</span>' + (opts.head || '') + '</div>' +
      '<div class="pc-body">' + body + '</div></div>';
  }

  function buildCards() {
    var h = '';

    // -- Power & Reactivity ------------------------------------------------
    h += card('power', 'reactor-power', 'Power &amp; Reactivity',
      row('Reactor Power', 'power', { big: 1, hl: 'gCore', hint: 'Reactor power — power-range flux instrument.' }) +
      '<div class="row lrn-only" data-hl="gCore" data-scanner-hint="Startup rate — decades per minute; the operator-facing reactivity proxy."><span class="k">Startup Rate</span><span class="v" data-f="sur">—</span></div>' +
      row('T-avg', 'tavg', { hl: 'gHotLeg gColdLeg', hint: 'Average coolant temperature — mean of the hot- and cold-leg RTDs.' }) +
      row('Leg ΔT', 'dt', { hl: 'gHotLeg gColdLeg', hint: 'Hot-leg minus cold-leg temperature — proportional to core power at flow.' }) +
      row('Reactivity ρ', 'rho', { ov: 1, hint: 'Net reactivity (physics overlay) — not a plant instrument.' }) +
      row('Period', 'period', { ov: 1, hint: 'Reactor period (physics overlay) — not a plant instrument.' }) +
      // Nuclear instrumentation (startup ranges) — a collapsible section so the
      // power card stays compact at power (it auto-opens at a startup lineup).
      '<div class="csec" data-sec="nis" id="pwNisSec">' +
      '<div class="sec-h" data-syn="nissec" data-scanner-hint="Nuclear instrumentation — the startup detector ranges: Source Range counts, Intermediate Range chamber current, the SR switch (P-6), the startup-trip blocks (P-10), and the 1/M plot."><span>NIS · startup ranges</span><span class="sec-v" data-f="nisHead"></span><span class="car">▸</span></div>' +
      '<div class="sec-b">' +
      '<div class="ctl" data-scanner-hint="Source Range (SR) counter, counts per second (log detector), and its high-voltage switch. Energized at shutdown/startup; secure it once the Intermediate Range is on scale (P-6) — its high-flux trip at 1e5 cps sits at ~0.02 % power. P-6 interlocks guard the switch both ways.">' +
      '<span class="k">SR</span><span class="v mono" data-f="nisSr">—</span>' +
      seg([{ l: 'On', act: 'sr-on', f: 'srOnB' }, { l: 'Off', act: 'sr-off', f: 'srOffB' }]) + '</div>' +
      row('Intermediate rng', 'nisIr', { hint: 'Intermediate Range (IR) compensated ion chamber, amperes (log). On scale from ~1e-10 A (P-6); calibrated band tops out ~1e-3 A ≈ 12 % power — the power range takes over from there.' }) +
      '<div class="ctl" data-scanner-hint="Startup-net trip blocks — block the IR high-flux and power-range low-setpoint (25 %) trips during the ascent (permitted only above P-10, 10 %; auto-reinstate below it) — and the 1/M startup plot, the inverse-multiplication scratchpad for predicting the critical rod position.">' +
      '<span class="k">Blocks</span>' + seg([
        { l: 'IR', act: 'block-ir', f: 'blkIrB' }, { l: 'PR-25', act: 'block-pr25', f: 'blkPrB' },
      ]) +
      '<button class="btn" data-act="one-over-m">1/M plot</button></div>' +
      '</div></div>' +
      '<div class="subcool-wrap" id="pwSubcoolBar" data-hl="pwTapSubcool gHotLeg" data-scanner-hint="Subcooling margin — distance to saturation. Green &gt; 11 °C, yellow 11–0, red below 0 (boiling). THE TMI diagnostic.">' +
      '<div class="subcool-bar">' +
      '<div class="zone g" style="top:0;height:58%"></div><div class="zone y" style="top:58%;height:22%"></div><div class="zone r" style="top:80%;height:20%"></div>' +
      '<div class="zline" style="top:80%"></div>' +
      '<div class="ghost" data-f="scGhost"></div><div class="cursor" data-f="scCursor"></div>' +
      '</div>' +
      '<div class="subcool-info"><span class="scv" data-f="subcool">—</span><span class="scl">Subcool margin</span><span class="sat" data-f="scSat"></span></div>' +
      '</div>' +
      '<div class="lrn-only" data-f="chips"></div>',
      { anchor: 'pwCoreAnchor', hint: 'Power &amp; Reactivity — reactor-centric aggregates. The subcooling bar is the primary TMI diagnostic.' });

    // -- Rod Control ---------------------------------------------------------
    h += card('rod', 'reactor-rods', 'Rod Control',
      '<div class="rodbank">' +
      '<div class="bank" data-hl="gRods"><div class="bar"><div class="fill" data-f="cbFill"></div><div class="lim" data-f="cbLim" style="top:85%"></div></div>' +
      '<div class="bsteps" data-f="cbSteps">—</div><div class="blbl">control bank</div></div>' +
      '<div class="bank" data-hl="gRods"><div class="bar shut"><div class="fill" data-f="sbFill"></div></div>' +
      '<div class="bsteps" data-f="sbSteps">—</div><div class="blbl">shutdown bank</div></div>' +
      '</div>' +
      '<div class="ctl"><span class="k">Mode</span>' + seg([
        { l: 'Auto', act: 'prod-auto', f: 'prodAutoB' }, { l: 'Man', act: 'prod-man', f: 'prodManB' },
      ], 'Rod control mode — AUTO captures T-ref from the current Tavg and drives the bank to hold it (variable speed on the mismatch); any manual rod motion drops it back to MAN.') +
      '<span class="v mono" data-f="prodTref"></span></div>' +
      '<div class="ctl">' + seg([
        { l: 'Raise', hold: 'rod-withdraw' }, { l: 'Stop', act: 'rod-stop' }, { l: 'Lower', hold: 'rod-insert' },
      ], 'Rod motion — HOLD Raise / Lower to drive the control bank at the selected speed; release (or Stop) to halt. Manual motion takes rod control to MAN.') +
      seg([{ l: '+1', act: 'rod-nudge-out' }, { l: '−1', act: 'rod-nudge-in' }], 'Nudge — move the control bank one step.') + '</div>' +
      '<div class="ctl"><span class="k">Speed</span>' + seg([
        { l: 'Slow', act: 'rodspeed-slow' }, { l: 'Norm', act: 'rodspeed-normal', on: 1 }, { l: 'Fast', act: 'rodspeed-fast' },
      ], 'Rod speed — slow / normal / fast drive rate (manual drive; AUTO picks its own speed from the mismatch).') + '</div>' +
      row('Status', 'rodStat', { hint: 'Rod/trip status — REACTOR TRIP from the protection system, or rod insertion limit when the bank is too deep for this power.' }) +
      '<div class="sub lrn-only" data-f="rodLimNote"></div>' +
      '<button class="pw-scram" data-syn="scram" data-scanner-hint="SCRAM — two-step: first click arms (CONFIRM), second click trips the reactor.">SCRAM</button>',
      { anchor: 'pwRpvAnchor', hint: 'Rod Control — control bank drive, read-only shutdown bank, insertion limit, and SCRAM.' });

    // -- Primary Flow & Inventory -------------------------------------------
    h += card('priminv', 'primary-inventory', 'Primary Flow &amp; Inventory',
      row('RCP', 'pinvRcp', { hl: 'gRcp gColdLeg gHotLeg', hint: 'Reactor coolant pump running status — loop flow animation keys off this.' }) +
      row('Core inventory', 'pinvInv', { ov: 1, hint: 'True core inventory (physics overlay) — infer it from PZR level + CVCS + subcooling on the real board.' }) +
      row('Void fraction', 'pinvVoid', { ov: 1, hint: 'True primary void fraction (physics overlay).' }),
      { anchor: 'pwColdLegAnchor', hint: 'Primary Flow &amp; Inventory — loop status; inventory/void numbers only with the Physics Overlay.' });

    // -- Emergency Cooling (tabbed) -------------------------------------------
    h += card('emergency', 'emergency-cooling', 'Emergency Cooling',
      '<div class="tabs">' +
      '<button data-syn="emtab" data-tab="hpi" data-f="tabHpi">HPI/LPI</button>' +
      '<button data-syn="emtab" data-tab="afw" data-f="tabAfw">AFW</button>' +
      '<button data-syn="emtab" data-tab="rhr" data-f="tabRhr">RHR</button></div>' +
      '<div class="tabpane" data-pane="hpi" data-hl="pwHpiLine pwLpiLine gColdLeg">' +
      '<div class="ctl">' + seg([{ l: 'Auto', act: 'eccs-auto', on: 1, f: 'hpiAutoB' }, { l: 'On', act: 'eccs-on', f: 'hpiOnB' }, { l: 'Off', act: 'eccs-off', f: 'hpiOffB' }],
        'Emergency injection (one merged HPI/LPI system) — AUTO arms the low-pressure actuation; taking it On/Off by hand disarms it (press Auto to re-arm). Flow follows the two-segment pump curve: high-head trickle at pressure, high volume once depressurized.') + '</div>' +
      row('HPI/LPI', 'emHpi', { hl: 'pwHpiLine pwLpiLine' }) + '</div>' +
      '<div class="tabpane" data-pane="afw" data-hl="pwAfwLine gSg">' +
      '<div class="ctl">' + seg([{ l: 'Auto', act: 'afw-auto', on: 1, f: 'afwAutoB' }, { l: 'Start', act: 'afw-start', f: 'afwStartB' }, { l: 'Stop', act: 'afw-stop', f: 'afwStopB' }],
        'Auxiliary feedwater — backup feed to the SG after a loss of main feedwater. AUTO arms the low-SG-level pump start; manual Start/Stop or throttling disarms it (press Auto to re-arm).') + '</div>' +
      '<div class="ctl"><span class="k">Throttle</span><span data-hl="pwAfwValve">' + numSet('afwFlowSet', 0, 100, 100, 'afw-flow-set', '%') + '</span></div>' +
      row('AFW', 'emAfw', { hl: 'pwAfwLine' }) + '</div>' +
      '<div class="tabpane" data-pane="rhr" data-hl="pwRhrLoop">' +
      '<div class="ctl"><span class="k">RHR</span>' + seg([{ l: 'Auto', act: 'rhr-auto', on: 1 }, { l: 'On', act: 'rhr-on' }, { l: 'Off', act: 'rhr-off' }],
        'Residual heat removal — low-pressure cooldown loop, SG to condenser.') + '</div>' +
      row('RHR', 'emRhr', { hl: 'pwRhrLoop' }) + '</div>',
      { em: 1, anchor: 'pwHpiLineAnchor', hint: 'Emergency Cooling — HPI/LPI | AFW | RHR. The active tab follows ECCS actuation.' });

    // -- PZR Pressurizer (merged pressure + level sections) --------------------
    h += card('pzr', 'pzr-pressurizer', 'PZR Pressurizer',
      '<div class="csec open" data-sec="press"><div class="sec-h" data-syn="sec" data-sec="press"><span>Pressure</span><span class="sec-v" data-f="pzrPh"></span><span class="car">▸</span></div>' +
      '<div class="sec-b">' +
      row('Primary pressure', 'pzrP', { big: 1, hl: 'gPzr', hint: 'Primary (RCS reference) pressure — one system pressure, set by the pressurizer.' }) +
      '<div class="ctl"><span class="k">Heater</span>' + seg([{ l: 'Auto', act: 'heat-auto', on: 1 }, { l: 'On', act: 'heat-on' }, { l: 'Off', act: 'heat-off' }],
        'Pressurizer heaters — raise pressure. Auto holds the setpoint.') +
      '<span data-hl="pwPzrHeater">' + numSet('heatSet', 0, 100, 0, 'heat-set', '%') + '</span></div>' +
      '<div class="ctl"><span class="k">Spray</span>' + seg([{ l: 'Auto', act: 'spray-auto', on: 1 }, { l: 'Open', act: 'spray-open' }, { l: 'Off', act: 'spray-off' }],
        'Pressurizer spray — lowers pressure; taps the hot leg (RCP discharge side); needs RCP flow.') +
      '<span data-hl="pwPzrSprayMist gSpray">' + numSet('spraySet', 0, 100, 0, 'spray-set', '%') + '</span></div>' +
      '</div></div>' +
      '<div class="csec" data-sec="level"><div class="sec-h" data-syn="sec" data-sec="level"><span>Level</span><span class="sec-v" data-f="pzrLh"></span><span class="car">▸</span></div>' +
      '<div class="sec-b">' +
      row('PZR level', 'pzrL', { big: 1, hl: 'pwPzrWater', hint: 'Pressurizer level — the only inventory window on the primary. TMI: it can RISE while core inventory falls (void surge).' }) +
      '<div class="dual lrn-only" data-f="pzrLDual"></div>' +
      '</div></div>',
      { anchor: 'pwPzrAnchor', hint: 'PZR Pressurizer — pressure section (heaters/spray) and level section (auto-expands in inventory transients).' });

    // -- Relief Valves ----------------------------------------------------------
    h += card('relief', 'pzr-relief', 'Relief Valves',
      row('PORV indicator', 'porvInd', { hl: 'pwPorv', hint: 'PORV indicator — reports the COMMANDED position, not the actual valve (M1 §8.5, the TMI deception).' }) +
      '<div class="dual lrn-only" data-f="porvDual"></div>' +
      '<div class="ctl"><span class="k">PORV</span>' + seg([{ l: 'Open', act: 'porv-open', warn: 1 }, { l: 'Close', act: 'porv-close', on: 1 }],
        'Manual PORV command — in addition to automatic pressure relief.') + '</div>' +
      '<div class="ctl"><span class="k">Block</span>' + seg([{ l: 'Open', act: 'porv-block-open', on: 1, f: 'blkOpen' }, { l: 'Isolate', act: 'porv-block-close', warn: 1, f: 'blkIso' }],
        'PORV block valve — upstream isolation. Closing it stops a stuck-open PORV even when the indicator lies.') + '</div>' +
      row('Block valve', 'porvBlk', { hl: 'pwPorvBlock' }) +
      row('Safety valves', 'safety', { hl: 'pwSafetyValve', hint: 'Code safety valves — mechanical lift/reseat on pressure setpoints; no operator command.' }) +
      row('Tailpipe temp', 'tailT', { hl: 'gRelief', hint: 'PORV discharge-line temperature — steam passing the relief valves heats this pipe. Runs a little warm on normal seat leakage.' }),
      { anchor: 'pwPorvAnchor', hint: 'Relief Valves — PORV (indicator reads commanded), upstream block valve, mechanical safeties, discharge-line temperature.' });

    // -- Steam & Flow -----------------------------------------------------------
    h += card('steam', 'sg-steam', 'Steam &amp; Flow',
      row('Steam flow', 'stmFlow', { hl: 'gSteamHeader', hint: 'Main steam flow — SG outlet to the turbine.' }) +
      row('Feedwater flow', 'fwFlow', { hl: 'gFeed', hint: 'Main feedwater flow into the SG.' }) +
      '<div class="ctl" id="pwFeedCtl"><span class="k">Feed pump</span>' +
      seg([{ l: '▼', act: 'feed-nudge-dn', f: 'fpDn' }, { l: '▲', act: 'feed-nudge-up', f: 'fpUp' }],
        'Feed pump manual control — nudge the commanded pump speed down/up (takes the pump off automatic).') +
      '<span data-hl="gFeed">' + numSet('feedSet', 0, 120, 100, 'feed-set', '%') + '</span></div>' +
      row('Pump speed', 'fwSpd', { hint: 'Commanded feed-pump speed — delivered flow follows it through the pump\'s inertia.' }) +
      row('Feed control', 'fwCoupled', { hint: 'Who is driving the feed pump: the three-element controller (AUTO, Automate tab), the load coupling, or your manual speed.' }) +
      '<div class="ctl"><span class="k">MSIV</span>' + seg([
        { l: 'Open', act: 'msiv-open', f: 'msivOpenB' }, { l: 'Close', act: 'msiv-close', warn: 1, f: 'msivCloseB' },
      ], 'Main Steam Isolation Valve — closing it bottles the steam generator (turbine trips; SG pressure rises to the code safeties; the SG then boils down toward the level scram). Two-press confirm on Close.') +
      '<span class="v" data-f="msivStat"></span></div>',
      { anchor: 'pwSgSteamOutletAnchor', hint: 'Steam &amp; Flow — steam and feedwater flows, and the feed pump (manual nudge/set or three-element automatic).' });

    // -- Plant Status (compact corner card) ---------------------------------------
    h += card('status', 'plant-status', 'Plant Status',
      row('Station power', 'sbo', { hint: 'Station blackout annunciation — loss of AC power.' }) +
      row('Reactor', 'scrStat', { hint: 'Scram / trip status.' }) +
      '<div class="row lrn-only"><span class="k">Core</span><span class="v" data-f="coreStat">—</span></div>',
      { hint: 'Plant Status — blackout, trip, and (Learning) true core condition.' });

    // -- SG Heat Transfer & Level ---------------------------------------------------
    h += card('sglevel', 'sg-level', 'SG Heat &amp; Level',
      row('SG level', 'sgL', { big: 1, hl: 'pwSgWater', hint: 'SG level — indicated level, including shrink/swell error on fast power changes.' }) +
      row('Balance', 'sgImb', { hint: 'Steam/feed imbalance — reactor thermal power vs turbine load target.' }) +
      row('Steam press', 'sgP', { hl: 'gSg', hint: 'SG secondary steam pressure.' }) +
      row('P–S ΔT', 'psDt', { ov: 1, hint: 'Primary-to-secondary ΔT (physics overlay) — SG heat-transfer driving force.' }),
      { anchor: 'pwSgAnchor', hint: 'SG Heat Transfer &amp; Level — secondary level and pressure.' });

    // -- RCP card ----------------------------------------------------------------------
    h += card('rcp', 'rcp', 'RCP',
      row('RCP', 'rcpStat', { hl: 'gRcp', hint: 'RCP running status.' }) +
      '<div class="ctl">' + seg([{ l: 'Run', act: 'rcp-run', on: 1 }, { l: 'Stop', act: 'rcp-stop' }],
        'Reactor coolant pumps — stopping them collapses forced flow (spray and charging mixing degrade too).') + '</div>' +
      row('Loop flow', 'rcpFlow', { ov: 1, hint: 'True loop flow (physics overlay) — no flow instrument exists on the board.' }),
      { anchor: 'pwRcpAnchor', hint: 'Reactor Coolant Pumps — status and start/stop. Impeller and loop dashes key off the running status.' });

    // -- Turbine-Generator ---------------------------------------------------------------
    h += card('turbgen', 'turbine-generator', 'Turbine-Generator',
      '<div class="ctl"><span class="k">Mode</span>' + seg([
        { l: 'Follow', act: 'load-follow', on: 1, f: 'lmFollow' },
        { l: 'Manual', act: 'load-manual', f: 'lmManual' },
        { l: 'Off', act: 'load-disconnect', warn: 1, f: 'lmDisc' },
      ], 'Load mode — Follow tracks reactor power; Manual uses the slider; Off disconnects from grid (0 MWe).') + '</div>' +
      '<div class="ctl" id="pwLoadSliderRow"><span class="k">Load</span><span data-hl="gGov gTurbine">' + loadSlider(0, 1100, 1000) + '</span></div>' +
      row('Turbine', 'tgRpm', { hl: 'gTurbine', hint: 'Turbine speed (RPM).' }) +
      row('Output', 'tgMw', { hl: 'gTurbine', hint: 'Electrical output (MWe).' }) +
      row('Target', 'tgTarget', { hint: 'Load setpoint vs actual output.' }) +
      row('Governor', 'tgGov', { hl: 'gGov', hint: 'Governor valve position — modulates steam admission to match load.' }) +
      '<div class="ctl"><span class="k">Dump</span>' + seg([{ l: 'Auto', act: 'dump-auto', on: 1, f: 'dumpAuto' }, { l: 'Open', act: 'dump-open' }, { l: 'Close', act: 'dump-close' }],
        'Steam dump / bypass — AUTO opens on high SG pressure.') +
      '<span data-hl="gDump">' + numSet('dumpSet', 0, 100, 0, 'dump-set', '%') + '</span></div>' +
      row('Dump valve', 'tgDump', { hl: 'gDump' }) +
      row('Trip', 'tgTrip', { hint: 'Turbine trip / low steam demand status.' }),
      { anchor: 'pwTurbineAnchor', hint: 'Turbine-Generator — load, governor, steam dump, trip status.' });

    // -- Condenser -----------------------------------------------------------------------
    h += card('condenser', 'condenser', 'Condenser',
      row('Vacuum', 'cvVac', { big: 1, hl: 'gCondenser', hint: 'Condenser vacuum — the turbine trips on sustained low vacuum.' }) +
      row('Cooling', 'cvCw', { hl: 'gTower', hint: 'Circulating-water cooling availability (cooling tower loop).' }) +
      '<div class="sub">turbine trips on LO-LO vacuum</div>',
      { anchor: 'pwCondenserAnchor', hint: 'Condenser — vacuum and cooling-water availability.' });

    return h;
  }

  // ------------------------------------------------------------ embedded panels
  function buildPanels() {
    var h = '';
    h += '<div class="diagram-panel" id="pwCvcsPanel" data-highlight-id="cvcs" data-anchor="pwCvcsBoxAnchor"' +
      ' data-scanner-hint="CVCS panel — charging, letdown, make-up mode, and boron chemistry, mounted on the CVCS enclosure. Setpoint boxes apply on Enter.">' +
      '<div class="dp-head">CVCS · charging / letdown / boron</div><div class="dp-body">' +
      '<div class="prow" data-hl="pwCvcsChargePump">' +
      seg([{ l: 'Start', act: 'charge-pump-on', on: 1, f: 'cpOn' }, { l: 'Stop', act: 'charge-pump-off', f: 'cpOff' }],
        'Charging pump — injects into the cold leg downstream of the RCP; carries boron changes.') +
      seg([{ l: 'Auto', act: 'cvcs-auto', f: 'cvcsAuto' }, { l: 'Man', act: 'cvcs-manual', f: 'cvcsMan' }],
        'CVCS make-up mode — AUTO modulates charging to hold inventory.') + '</div>' +
      '<div class="prow" data-hl="pwCvcsChargeLeg pwCvcsChargePump pwPzrWater gColdLeg"><span class="k">Chg</span>' +
      '<input class="num-in" id="chargeSet" data-synset="charge" type="number" min="0" max="100" value="0"' +
      ' data-scanner-hint="Charging setpoint (‰ of rated) — applies on Enter or when you click away.">' +
      '<span class="v" data-f="cvcsChg">—</span></div>' +
      '<div class="prow" data-hl="pwCvcsLetdownBranch pwPzrWater"><span class="k">Ltd</span>' +
      '<input class="num-in" id="letdownSet" data-synset="letdown" type="number" min="0" max="100" value="0"' +
      ' data-scanner-hint="Letdown setpoint (‰ of rated) — applies on Enter or when you click away.">' +
      '<button class="btn-set" data-act="letdown-isolate" data-scanner-hint="Letdown isolate — drives letdown flow to zero.">Iso</button>' +
      '<span class="v" data-f="cvcsLtd">—</span></div>' +
      '<div class="prow"><span class="k">B</span>' +
      seg([{ l: 'Bor', act: 'borate', f: 'bor' }, { l: 'Hold', act: 'boron-hold', on: 1, f: 'borHold' }, { l: 'Dil', act: 'dilute', f: 'dil' }],
        'Boron — Borate adds absorber (power down), Dilute removes it. Needs the charging pump running.') +
      '<span class="v" data-f="cvcsBoron" data-scanner-hint="Boron analyzer — slow chemistry sample (ppm), not the live core concentration.">—</span>' +
      '<span class="dual lrn-only" data-f="cvcsBoronDual"></span></div>' +
      '</div></div>';

    h += '<div class="diagram-panel" id="pwAccumulatorPanel" data-highlight-id="accumulators" data-anchor="pwAccumulatorsAnchor"' +
      ' data-scanner-hint="Accumulators — passive N₂-precharged tanks; discharge through the check valve when primary pressure falls below arming pressure. No operator command.">' +
      '<div class="dp-head">Accumulators</div><div class="dp-body">' +
      '<div class="prow"><span class="k">Passive N₂</span><span class="ann" data-f="accAnn" style="display:none">DISCHARGING</span></div>' +
      '<div class="prow" data-f="accFlowRow" style="display:none"><span class="k">Inj flow</span><span class="v" data-f="accFlow">—</span></div>' +
      '</div></div>';
    return h;
  }

  // ------------------------------------------------------------ mount / unmount
  function mount(hostEl, context) {
    if (mounted) unmount();
    ctx = context; host = hostEl;
    host.innerHTML =
      '<div class="synoptic-stage" id="pwStage" data-mode="learning" data-overlay="off">' +
      buildSvg() +
      '<svg class="pw-leaders" id="pwCardLeaders"></svg>' +
      '<div class="pw-card-overlay">' + buildCards() + buildPanels() + '</div>' +
      '<div class="pw-paused-overlay"><span>Simulation Paused</span></div>' +
      '<div class="ff-badge" style="display:none" id="ffBadge">⚡ 600×</div>' +
      '</div>';
    stage = host.querySelector('#pwStage');
    svgEl = stage.querySelector('#pwLoop');
    leadersEl = stage.querySelector('#pwCardLeaders');
    refs = {};
    stage.querySelectorAll('[data-f]').forEach(function (el) { refs[el.getAttribute('data-f')] = el; });
    refs.pwFeedCtl = stage.querySelector('#pwFeedCtl');
    refs.pwLoadSliderRow = stage.querySelector('#pwLoadSliderRow');
    refs.mweSlider = stage.querySelector('#mweSlider');
    stage.querySelectorAll('.plant-card').forEach(function (el) { cardEls[el.getAttribute('data-card')] = el; });
    buildSgTubes(); buildTurbineBlades();
    bindEvents();
    setEmTab('hpi');
    if (resizeObs) resizeObs.disconnect();
    resizeObs = new ResizeObserver(function () { positionCards(); positionPanels(); drawLeaders(); });
    resizeObs.observe(stage);
    mounted = true;
    prev = { rcp: null, xe: null, xeT: null, xeSlope: 0, fuelSeen: false };
    positionCards(); positionPanels(); drawLeaders();
  }
  function unmount() {
    if (!mounted) return;
    if (resizeObs) { resizeObs.disconnect(); resizeObs = null; }
    if (armTimer) { clearTimeout(armTimer); armTimer = null; }
    document.body.removeEventListener('mouseover', alarmHoverOn, true);
    document.body.removeEventListener('mouseout', alarmHoverOff, true);
    if (host) host.innerHTML = '';
    mounted = false; refs = {}; cardEls = {}; stage = null; svgEl = null; leadersEl = null;
    emTabUser = null; secUser = {};
    nisUser = false; nisAutoOpen = null;
  }

  function buildSgTubes() {
    var g = svgEl.querySelector('#pwSgTubes'); if (!g) return;
    var ns = 'http://www.w3.org/2000/svg', cx = 740, sheet = 470;
    // nested inverted-U tubes rising from the tube sheet (ref. schematic)
    [[48, 296], [36, 306], [24, 316], [12, 326]].forEach(function (t) {
      var w = t[0], apex = t[1], yTop = apex + w;
      var d = 'M' + (cx - w) + ',' + sheet + ' V' + yTop +
        ' A' + w + ' ' + w + ' 0 0 1 ' + (cx + w) + ',' + yTop + ' V' + sheet;
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d); p.setAttribute('fill', 'none');
      p.setAttribute('stroke', '#243140'); p.setAttribute('stroke-width', '3.4');
      g.appendChild(p);
      var f = document.createElementNS(ns, 'path');
      f.setAttribute('class', 'flow tube'); f.setAttribute('d', d);
      f.setAttribute('stroke', 'url(#pwGradTube)'); f.setAttribute('stroke-width', '2.6'); f.setAttribute('fill', 'none');
      g.appendChild(f);
    });
  }
  function buildTurbineBlades() {
    var g = svgEl.querySelector('#pwTurbineRotor'); if (!g) return;
    var ns = 'http://www.w3.org/2000/svg';
    for (var bx = 826; bx <= 966; bx += 14) {
      var t = Math.max(0, Math.min(1, (bx - 840) / 110)), half = 14 + t * 20;
      var ln = document.createElementNS(ns, 'line');
      ln.setAttribute('class', 'turbine-blade');
      ln.setAttribute('x1', bx); ln.setAttribute('y1', (306 - half).toFixed(0));
      ln.setAttribute('x2', bx); ln.setAttribute('y2', (306 + half).toFixed(0));
      g.appendChild(ln);
    }
  }

  // ------------------------------------------------------------ geometry helpers
  function svgScale() {
    var r = stage.getBoundingClientRect();
    var sc = Math.min(r.width / VBW, r.height / VBH);
    return { sc: sc, ox: (r.width - VBW * sc) / 2, oy: (r.height - VBH * sc) / 2, rect: r };
  }
  function positionCards() {
    if (!stage) return;
    var m = svgScale();
    Object.keys(cardEls).forEach(function (key) {
      var p = PLACE[key], el = cardEls[key]; if (!p || !el) return;
      var x = m.ox + p.sx * m.sc, y = m.oy + p.sy * m.sc;
      x = Math.max(2, Math.min(x, m.rect.width - el.offsetWidth - 2));
      y = Math.max(2, Math.min(y, m.rect.height - el.offsetHeight - 2));
      el.style.left = x.toFixed(0) + 'px'; el.style.top = y.toFixed(0) + 'px';
    });
  }
  function positionPanels() {
    if (!stage) return;
    var m = svgScale();
    var cv = stage.querySelector('#pwCvcsPanel');
    if (cv) {
      cv.style.left = (m.ox + 467 * m.sc) + 'px';
      cv.style.width = Math.max(128, 176 * m.sc) + 'px';
      // sit on the box face; clamp up only if the stage is too short (1280×800)
      cv.style.top = Math.min(m.oy + 514 * m.sc, m.rect.height - cv.offsetHeight - 4) + 'px';
    }
    var ac = stage.querySelector('#pwAccumulatorPanel');
    if (ac) {
      ac.style.left = (m.ox + 292 * m.sc) + 'px';
      ac.style.minWidth = Math.max(80, 92 * m.sc) + 'px';
      ac.style.top = Math.min(m.oy + 548 * m.sc, m.rect.height - ac.offsetHeight - 4) + 'px';
    }
  }
  function drawLeaders() {
    if (!stage || !leadersEl) return;
    var m = svgScale(), h = '';
    leadersEl.setAttribute('viewBox', '0 0 ' + m.rect.width + ' ' + m.rect.height);
    leadersEl.setAttribute('width', m.rect.width); leadersEl.setAttribute('height', m.rect.height);
    stage.querySelectorAll('[data-anchor]').forEach(function (el) {
      var aid = el.getAttribute('data-anchor'); if (!aid) return;
      var a = svgEl.querySelector('#' + aid); if (!a) return;
      var ar = a.getBoundingClientRect();
      var ax = ar.left + ar.width / 2 - m.rect.left, ay = ar.top + ar.height / 2 - m.rect.top;
      var cr = el.getBoundingClientRect();
      var cx0 = cr.left - m.rect.left, cy0 = cr.top - m.rect.top, cw = cr.width, ch = cr.height;
      // exit from the card edge facing the anchor
      var sx, sy;
      if (ax < cx0) { sx = cx0; sy = cy0 + ch / 2; }
      else if (ax > cx0 + cw) { sx = cx0 + cw; sy = cy0 + ch / 2; }
      else if (ay > cy0 + ch) { sx = cx0 + cw / 2; sy = cy0 + ch; }
      else { sx = cx0 + cw / 2; sy = cy0; }
      var em = el.classList.contains('emergency') ? ' em' : '';
      var card = el.getAttribute('data-card') || el.id;
      h += '<path class="lead' + em + '" data-lead="' + card + '" d="M' + sx.toFixed(1) + ',' + sy.toFixed(1) +
        ' L' + ax.toFixed(1) + ',' + ay.toFixed(1) + '"/>';
    });
    leadersEl.innerHTML = h;
  }

  // ------------------------------------------------------------ events
  function bindEvents() {
    stage.addEventListener('click', function (e) {
      var scram = e.target.closest('[data-syn="scram"]');
      if (scram) { scramClick(scram); return; }
      var mtag = e.target.closest('[data-syn="tmitag"]');
      if (mtag && tagState.id && ctx) { ctx.cmd({ action: 'instructor_interact', interaction_id: tagState.id }); return; }
      var tab = e.target.closest('[data-syn="emtab"]');
      if (tab) { emTabUser = tab.getAttribute('data-tab'); setEmTab(emTabUser); drawLeaders(); return; }
      var nsec = e.target.closest('[data-syn="nissec"]');
      if (nsec) {
        var nc = nsec.closest('.csec');
        nc.classList.toggle('open');
        nisUser = true;   // user choice wins over the startup auto-open
        drawLeaders();
        return;
      }
      var sec = e.target.closest('[data-syn="sec"]');
      if (sec) {
        var key = sec.getAttribute('data-sec');
        var open = sec.closest('.csec').classList.contains('open');
        var target = open ? (key === 'press' ? 'level' : 'press') : key;
        setPzrOpen(target);
        secUser.pin = target;   // user choice wins until the priority episode changes
        return;
      }
    });
    // CVCS panel setpoints apply on change (compact panel has no Set buttons)
    stage.addEventListener('change', function (e) {
      var inp = e.target.closest('[data-synset]'); if (!inp) return;
      var v = Math.max(0, Math.min(100, +inp.value || 0)) / 1000;   // ‰ -> normalized
      if (inp.getAttribute('data-synset') === 'charge') ctx.cmd({ action: 'set_charging_flow', normalized: v });
      else ctx.cmd({ action: 'set_letdown_flow', normalized: v });
    });
    stage.addEventListener('input', function (e) {
      var sl = e.target.closest('[data-syn-slider="load"]'); if (!sl || !ctx) return;
      var mw = +sl.value || 0;
      txt('mweSliderVal', mw.toFixed(0));
      ctx.cmd({ action: 'set_load_target', mwe: mw });
    });
    // hover: cards/panels -> leader + linked node; [data-hl] -> listed svg targets
    stage.addEventListener('mouseover', function (e) {
      var hl = e.target.closest('[data-hl]');
      if (hl) setHl(hl.getAttribute('data-hl'), true);
      var surf = e.target.closest('.plant-card, .diagram-panel');
      if (surf) surfaceHl(surf, true);
      var sensor = e.target.closest('.sensor');
      if (sensor) { sensor.classList.add('hl'); sensorPipeHl(sensor, true); }
      if (!surf) { var node = e.target.closest('g.diagram-node'); if (node) nodeHl(node, true); }
    });
    stage.addEventListener('mouseout', function (e) {
      var hl = e.target.closest('[data-hl]');
      if (hl) setHl(hl.getAttribute('data-hl'), false);
      var surf = e.target.closest('.plant-card, .diagram-panel');
      if (surf && !surf.contains(e.relatedTarget)) surfaceHl(surf, false);
      var sensor = e.target.closest('.sensor');
      if (sensor && !sensor.contains(e.relatedTarget)) { sensor.classList.remove('hl'); sensorPipeHl(sensor, false); }
      var node2 = e.target.closest('g.diagram-node');
      if (node2 && !node2.contains(e.relatedTarget)) nodeHl(node2, false);
    });
    // active-alarm hover -> diagram + card highlight (bound on body; alarm panel lives outside the stage)
    document.body.addEventListener('mouseover', alarmHoverOn, true);
    document.body.addEventListener('mouseout', alarmHoverOff, true);
  }

  var CARD_BY_HL = { 'reactor-rods': 'rod', 'reactor-power': 'power', 'primary-inventory': 'priminv',
    'emergency-cooling': 'emergency', 'pzr-pressurizer': 'pzr', 'pzr-relief': 'relief', rcp: 'rcp',
    'sg-level': 'sglevel', 'sg-steam': 'steam', 'turbine-generator': 'turbgen', condenser: 'condenser' };
  function nodeHl(g, on) {
    g.classList.toggle('hl', on);
    var key = CARD_BY_HL[g.getAttribute('data-highlight-id')];
    if (key && cardEls[key]) {
      cardEls[key].classList.toggle('hl-card', on);
      var lead = leadersEl.querySelector('[data-lead="' + key + '"]');
      if (lead) lead.classList.toggle('hl', on);
    }
  }
  function setHl(list, on) {
    if (!list) return;
    list.split(/\s+/).forEach(function (id) {
      var el = svgEl.querySelector('#' + id) || stage.querySelector('#' + id);
      if (el) el.classList.toggle('hl', on);
    });
  }
  var HL_NODES = {   // card highlight-id -> diagram groups
    'reactor-rods': 'gRods', 'reactor-power': 'gCore', 'primary-inventory': 'gHotLeg gColdLeg',
    'emergency-cooling': 'gHpi gAfw gRhr gLpi', 'pzr-pressurizer': 'gPzr', 'pzr-relief': 'gRelief',
    rcp: 'gRcp', 'sg-level': 'gSg', 'sg-steam': 'gSteamHeader gFeed', 'turbine-generator': 'gTurbine gGov gDump',
    condenser: 'gCondenser gTower', cvcs: 'gCvcs', accumulators: 'gAccum', 'plant-status': '',
  };
  function surfaceHl(surf, on) {
    var hid = surf.getAttribute('data-highlight-id');
    if (hid && HL_NODES[hid]) setHl(HL_NODES[hid], on);
    var card = surf.getAttribute('data-card') || surf.id;
    var lead = leadersEl.querySelector('[data-lead="' + card + '"]');
    if (lead) lead.classList.toggle('hl', on);
  }
  function sensorPipeHl(sensor, on) {
    var map = { pwTapThot: 'gHotLeg', pwTapTcold: 'gColdLeg', pwTapSubcool: 'gHotLeg', pwTapPorv: 'gRelief' };
    var t = map[sensor.id]; if (t) setHl(t, on);
    if (sensor.id === 'pwTapSubcool') { var bar = stage.querySelector('#pwSubcoolBar'); if (bar) bar.classList.toggle('wm-hint', on); }
  }
  var ALARM_HL = {   // alarm id -> { n: svg nodes, c: card keys }
    reactor_trip: { n: 'gRods', c: 'rod' }, high_flux: { n: 'gCore', c: 'power' }, high_tavg: { n: 'gHotLeg', c: 'power' },
    tavg: { n: 'gHotLeg', c: 'power' },
    pzr_pressure_high: { n: 'gPzr', c: 'pzr' }, pzr_pressure_low: { n: 'gPzr', c: 'pzr' }, pzr_pressure_lolo: { n: 'gPzr', c: 'pzr' },
    porv_open: { n: 'gRelief', c: 'relief' },
    subcooling_low: { n: 'gCore', c: 'power' }, subcooling_lost: { n: 'gCore', c: 'power' },
    pzr_level_high: { n: 'gPzr', c: 'pzr' }, pzr_level_low: { n: 'gPzr', c: 'pzr' }, pzr_level_lolo: { n: 'gPzr', c: 'pzr' },
    rod_limit: { n: 'gRods', c: 'rod' },
    sg_level_high: { n: 'gSg', c: 'sglevel' }, sg_level_low: { n: 'gSg', c: 'sglevel' }, sg_level_lolo: { n: 'gSg', c: 'sglevel' },
    rcp_trip: { n: 'gRcp', c: 'rcp' }, hpi_active: { n: 'gHpi', c: 'emergency' }, sbo: { n: '', c: 'status' },
    turbine_trip: { n: 'gTurbine', c: 'turbgen' }, cond_vac_low: { n: 'gCondenser', c: 'condenser' }, cond_vac_trip: { n: 'gCondenser', c: 'condenser' },
  };
  function alarmHover(e, on) {
    if (!mounted) return;
    var tile = e.target.closest('.alarm-tile[data-ack]'); if (!tile) return;
    var map = ALARM_HL[tile.getAttribute('data-ack')]; if (!map) return;
    if (map.n) setHl(map.n, on);
    if (map.c && cardEls[map.c]) {
      cardEls[map.c].classList.toggle('hl-card', on);
      var lead = leadersEl.querySelector('[data-lead="' + map.c + '"]');
      if (lead) lead.classList.toggle('hl', on);
      cardEls[map.c].style.borderColor = on ? 'var(--syn-hl)' : '';
    }
  }
  function alarmHoverOn(e) { alarmHover(e, true); }
  function alarmHoverOff(e) { alarmHover(e, false); }

  // two-step SCRAM cover
  function scramClick(btn) {
    if (btn.classList.contains('fired')) return;
    if (btn.classList.contains('armed')) {
      btn.classList.remove('armed'); if (armTimer) clearTimeout(armTimer);
      btn.textContent = 'SCRAM'; ctx.cmd({ action: 'scram' }); return;
    }
    btn.classList.add('armed'); btn.textContent = 'CONFIRM';
    armTimer = setTimeout(function () {
      if (!btn.classList.contains('fired')) { btn.classList.remove('armed'); btn.textContent = 'SCRAM'; }
    }, 3000);
  }

  function setEmTab(tab) {
    if (!cardEls.emergency) return;
    cardEls.emergency.querySelectorAll('[data-syn="emtab"]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === tab);
    });
    cardEls.emergency.querySelectorAll('.tabpane').forEach(function (p) {
      p.classList.toggle('on', p.getAttribute('data-pane') === tab);
    });
  }

  // ------------------------------------------------------------ render helpers
  function txt(f, v) { var el = refs[f]; if (el && el.textContent !== String(v)) el.textContent = v; }
  function vcls(f, cls) { var el = refs[f]; if (el) el.className = el.className.replace(/\b(dim|warn|alarm|run)\b/g, '').replace(/\s+$/, '') + (cls ? ' ' + cls : ''); }
  function setOn(el, on) { if (el) el.classList.toggle('on', !!on); }
  function segSync(f, on) { var el = refs[f]; if (el) el.classList.toggle('on', !!on); }
  function flowOn(id, on, dur) {
    var el = svgEl.querySelector('#' + id); if (!el) return;
    el.classList.toggle('on', !!on);
    if (on && dur) { var d = dur.toFixed(2) + 's'; if (el._d !== d) { el._d = d; el.style.setProperty('--dur', d); } }
  }
  function rotorOn(id, on, spin) {
    var el = svgEl.querySelector('#' + id + 'Rotor'); if (!el) return;
    el.classList.toggle('on', !!on);
    if (on && spin) { var d = spin.toFixed(2) + 's'; if (el._d !== d) { el._d = d; el.style.setProperty('--spin', d); } }
  }
  function valvePose(id, open, throttleFrac) {
    var el = svgEl.querySelector('#' + id); if (!el) return;
    el.classList.toggle('closed', !open);
    el.classList.toggle('throttled', !!(open && throttleFrac != null && throttleFrac > 0.02 && throttleFrac < 0.98));
    var t = el.querySelector('.throttle');
    if (t && throttleFrac != null) t.setAttribute('width', (16 * Math.max(0, Math.min(1, throttleFrac))).toFixed(1));
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function fmtPct(v, dp) { return v == null ? '—' : v.toFixed(dp == null ? 0 : dp) + ' %'; }
  function Tsat(P) { return 179.47 * Math.pow(Math.max(P, 1e-6), 0.239); }
  function activeFail(s, id) { return s.active_failures.some(function (f) { return f.id === id; }); }

  // levels: rect fill inside a clip, 0..1 from bottom
  function setLevel(rectId, surfId, frac, yTop, yBot, x0, x1) {
    frac = clamp(frac, 0, 1);
    var y = yBot - frac * (yBot - yTop);
    var r = svgEl.querySelector('#' + rectId);
    if (r) { r.setAttribute('y', y.toFixed(1)); r.setAttribute('height', (yBot + 6 - y).toFixed(1)); }
    var sp = svgEl.querySelector('#' + surfId);
    if (sp) {
      var w = (x1 - x0) / 2;
      sp.setAttribute('d', 'M' + x0 + ',' + y.toFixed(1) + ' q' + (w / 2) + ',-2 ' + w + ',0 t' + w + ',0');
    }
  }

  // RCP coastdown: on running -> stopped, spin/dashes slow for ~4 s, then freeze.
  function coastable(onNow, key, applyFn) {
    if (onNow) { if (prev[key + '_t']) { clearTimeout(prev[key + '_t']); prev[key + '_t'] = null; } applyFn(true, false); }
    else if (prev[key] && !onNow) {
      applyFn(true, true);   // coasting: slower animation
      prev[key + '_t'] = setTimeout(function () { applyFn(false, false); }, 4000);
    } else if (!prev[key + '_t']) applyFn(false, false);
    prev[key] = onNow;
  }

  // ------------------------------------------------------------ render
  function render(s) {
    if (!mounted) return;
    var ins = s.instruments, ts = s.true_state, cs = s.control_state;
    var learning = ctx.mode() === 'learning';
    var overlay = learning && ctx.overlay();
    stage.setAttribute('data-mode', learning ? 'learning' : 'realistic');
    stage.setAttribute('data-overlay', overlay ? 'on' : 'off');
    stage.classList.toggle('paused', s.metadata.running === false);

    var cg = null, sg = null;
    cs.rod_groups.forEach(function (g) { if (g.function === 'control') cg = g; if (g.function === 'shutdown') sg = g; });

    // ---- Power & Reactivity ----
    txt('power', ins.power_range.toFixed(1) + ' %');
    txt('tavg', ctx.dispT(ins.tavg));
    txt('dt', ctx.dispTd(ins.thot - ins.tcold));
    if (learning) txt('sur', (ts.startup_rate_dpm != null ? ts.startup_rate_dpm.toFixed(2) : '—') + ' dpm');
    if (overlay) {
      txt('rho', (ts.reactivity_pcm >= 0 ? '+' : '') + ts.reactivity_pcm.toFixed(0) + ' pcm');
      var per = ts.reactor_period_s;
      txt('period', (per == null || !isFinite(per) || Math.abs(per) > 9999) ? '∞' : per.toFixed(0) + ' s');
    }
    // ---- NIS (startup ranges) ----
    var srOn = !!ins.sr_energized;
    var cps = ins.source_range || 0;
    if (!srOn) { txt('nisSr', 'de-energized'); vcls('nisSr', 'dim'); }
    else {
      txt('nisSr', (cps >= 1e4 ? cps.toExponential(1) : Math.round(cps)) + ' cps');
      vcls('nisSr', cps > 5e4 ? 'warn' : 'run');
    }
    segSync('srOnB', srOn); segSync('srOffB', !srOn);
    var irA = ins.intermediate_range;
    txt('nisIr', irA != null ? irA.toExponential(1) + ' A' : '—');
    vcls('nisIr', irA != null && irA > 1e-10 ? 'run' : 'dim');
    var blocks = (s.rps_state && s.rps_state.trip_blocks) || {};
    segSync('blkIrB', !!blocks.ir_high); segSync('blkPrB', !!blocks.pr_low_setpoint);
    // Header summary + startup auto-open (once, unless the user has toggled it).
    txt('nisHead', srOn ? Math.round(cps) + ' cps' : (irA != null ? irA.toExponential(0) + ' A' : ''));
    var nisSec = stage.querySelector('#pwNisSec');
    if (nisSec && !nisUser && srOn !== nisAutoOpen) {
      nisSec.classList.toggle('open', srOn);   // SR energized = a startup lineup → show the block
      nisAutoOpen = srOn;
    }

    renderSubcool(s, learning, overlay);
    renderChips(s, learning);

    // ---- Rod card ----
    if (cg) {
      var insPct = clamp(100 - cg.position_pct, 0, 100);
      refs.cbFill.style.height = insPct.toFixed(1) + '%';
      var mv = cg.scrammed ? ' · SCRAM' : (cg.moving ? (cg.direction > 0 ? ' ↑' : ' ↓') : '');
      txt('cbSteps', cg.steps + '/' + cg.max_steps + mv);
    }
    if (sg) {
      var sIns = clamp(100 - sg.position_pct, 0, 100);
      refs.sbFill.style.height = sIns.toFixed(1) + '%';
      var atPower = ins.power_range > 5, parked = sg.position_pct >= 99.5;
      txt('sbSteps', sg.steps + '/' + sg.max_steps + (sg.scrammed ? ' · SCRAM' : parked ? ' · out' : ''));
      refs.sbSteps.className = 'bsteps ' + (sg.scrammed ? '' : parked && atPower ? 'ok' : (!parked && atPower && !ins.rps_scrammed) ? 'alarm' : '');
    }
    var atLim = !!ins.rod_at_limit;
    var tripped = !!ins.rps_scrammed;
    txt('rodStat', tripped ? 'REACTOR TRIP' : atLim ? 'ROD INS LIMIT' : 'normal');
    vcls('rodStat', tripped ? 'alarm' : atLim ? 'warn' : 'dim');
    // Rod control AUTO/MAN — mirrors the rods_tavg channel (a second face of it).
    var rodCh = null, chansR = (s.automation && s.automation.channels) || [];
    for (var rci = 0; rci < chansR.length; rci++) if (chansR[rci].id === 'rods_tavg') { rodCh = chansR[rci]; break; }
    var rodAuto = !!(rodCh && rodCh.engaged);
    segSync('prodAutoB', rodAuto); segSync('prodManB', !rodAuto);
    if (refs.prodTref) refs.prodTref.textContent =
      rodAuto && rodCh.setpoint != null ? 'T-ref ' + ctx.dispT(rodCh.setpoint) : '';
    if (refs.cbLim) refs.cbLim.style.borderTopColor = atLim ? 'var(--critical)' : 'var(--caution)';
    if (refs.rodLimNote) refs.rodLimNote.textContent = atLim ? 'Bank too deep for this power — withdraw or borate.' : '';
    var scramBtn = stage.querySelector('[data-syn="scram"]');
    if (scramBtn) {
      scramBtn.classList.toggle('fired', tripped);
      if (tripped) { scramBtn.classList.remove('armed'); scramBtn.textContent = 'SCRAMMED'; }
      else if (!scramBtn.classList.contains('armed') && scramBtn.textContent !== 'SCRAM') scramBtn.textContent = 'SCRAM';
    }

    // ---- Primary inventory ----
    txt('pinvRcp', ins.rcp_running ? 'running' : 'STOPPED'); vcls('pinvRcp', ins.rcp_running ? 'run' : 'alarm');
    if (overlay) {
      txt('pinvInv', ts.core_inventory_pct.toFixed(0) + ' %');
      txt('pinvVoid', ts.primary_void_fraction != null ? (ts.primary_void_fraction * 100).toFixed(1) + ' %' : '—');
    }

    // ---- Emergency card ----
    txt('emHpi', ins.hpi_active
      ? 'INJECTING ' + Math.round((ins.hpi_flow || 0) * 100) + ' %'
      : 'standby');
    vcls('emHpi', ins.hpi_active ? 'run' : 'dim');
    // ESF AUTO/MAN arms: the Auto lamp reads snapshot.automation.esf; On/Off
    // (Start/Stop) light from the system's actual state when disarmed.
    var esf = (s.automation && s.automation.esf) || {};
    segSync('hpiAutoB', esf.hpi === 'auto');
    segSync('hpiOnB', esf.hpi !== 'auto' && ins.hpi_active);
    segSync('hpiOffB', esf.hpi !== 'auto' && !ins.hpi_active);
    // AFW row shows the PUMP run status (honest: the pumps really start); the
    // pipe-flow animation below keys off delivered flow — at TMI-2 the two
    // disagree behind the tagged-shut discharge valve.
    var afwPump = ins.afw_pump_running != null ? ins.afw_pump_running : ins.afw_active;
    segSync('afwAutoB', esf.afw === 'auto');
    segSync('afwStartB', esf.afw !== 'auto' && afwPump);
    segSync('afwStopB', esf.afw !== 'auto' && !afwPump);
    txt('emAfw', afwPump ? 'RUNNING' : 'off'); vcls('emAfw', afwPump ? 'run' : 'dim');
    txt('emRhr', ins.rhr_active ? 'COOLING' : 'off'); vcls('emRhr', ins.rhr_active ? 'run' : 'dim');
    ['tabHpi', 'tabAfw', 'tabRhr'].forEach(function (f, i) {
      var act = [ins.hpi_active, ins.afw_active, ins.rhr_active || ins.accumulators_discharging][i];
      var b = refs[f]; if (b) b.innerHTML = ['HPI/LPI', 'AFW', 'RHR'][i] + (act ? '<span class="dot"></span>' : '');
    });

    // ---- PZR card ----
    txt('pzrP', ctx.dispP(ins.primary_pressure));
    txt('pzrL', ins.pzr_level.toFixed(0) + ' %');
    txt('pzrPh', ctx.dispP(ins.primary_pressure));
    txt('pzrLh', ins.pzr_level.toFixed(0) + ' %');
    if (refs.pzrLDual) refs.pzrLDual.textContent =
      (learning && activeFail(s, 'pzr_level_sensor_stuck')) ? 'Actual ' + ts.pzr_level_pct.toFixed(0) + ' % (sensor failed)' : '';

    // ---- Relief card ----
    var indOpen = ins.porv_indicator === 'open';
    txt('porvInd', indOpen ? 'OPEN' : 'closed'); vcls('porvInd', indOpen ? 'alarm' : 'dim');
    if (refs.porvDual) refs.porvDual.innerHTML = learning ?
      'Actual: <b>' + (ts.porv_open ? 'OPEN' : 'closed') + '</b>' + (ts.porv_open !== indOpen ? ' — indicator disagrees' : '') : '';
    var blk = cs.porv_block_open;
    txt('porvBlk', blk ? 'open' : 'ISOLATED'); vcls('porvBlk', blk ? 'dim' : 'warn');
    segSync('blkOpen', blk); segSync('blkIso', !blk);
    var sfty = !!ins.safety_relief_active;
    txt('safety', sfty ? 'LIFTED' : 'seated'); vcls('safety', sfty ? 'alarm' : 'dim');
    if (ins.porv_tailpipe_temp != null) {
      txt('tailT', Math.round(ctx.conv(ins.porv_tailpipe_temp, 'temp')) + ' ' + ctx.unit('temp'));
    }

    // ---- SG / steam / turbine / condenser cards ----
    txt('sgL', ins.sg_level.toFixed(0) + ' %');
    var imb = cs.sg_imbalance || 'balanced';
    txt('sgImb', imb === 'filling' ? '▲ filling' : imb === 'draining' ? '▼ draining' : 'matched');
    vcls('sgImb', imb !== 'balanced' ? 'warn' : 'dim');
    txt('sgP', ctx.dispP(ins.steam_pressure));
    if (overlay) txt('psDt', ctx.dispTd(ts.tavg_c - Tsat(ts.steam_pressure_mpa)));
    txt('stmFlow', fmtPct(ins.steam_flow * 100));
    txt('fwFlow', fmtPct(ins.fw_flow * 100));
    // Feed pump: speed readout + who's driving it (three-element channel /
    // load coupling / manual). The channel state comes from snapshot.automation.
    txt('fwSpd', (cs.feed_pump_speed_pct != null ? cs.feed_pump_speed_pct : cs.feedwater_flow_pct).toFixed(0) + ' %');
    var feedCh = null, chansA = (s.automation && s.automation.channels) || [];
    for (var fci = 0; fci < chansA.length; fci++) if (chansA[fci].id === 'feed_sg') { feedCh = chansA[fci]; break; }
    var feedMode = (feedCh && feedCh.engaged) ? 'AUTO — three-element'
      : (cs.feed_auto_coupled !== false ? 'coupled (tracks load)' : 'MANUAL');
    txt('fwCoupled', feedMode);
    vcls('fwCoupled', (feedCh && feedCh.engaged) ? 'run' : (cs.feed_auto_coupled !== false ? '' : 'warn'));
    // MSIV + SG safeties
    var msivOpen = ins.msiv_open !== false;
    segSync('msivOpenB', msivOpen); segSync('msivCloseB', !msivOpen);
    txt('msivStat', msivOpen ? '' : (ins.sg_safety_open ? 'SHUT · safeties lifting' : 'SHUT'));
    vcls('msivStat', msivOpen ? 'dim' : 'alarm');
    txt('rcpStat', ins.rcp_running ? 'running' : 'STOPPED'); vcls('rcpStat', ins.rcp_running ? 'run' : 'alarm');
    if (overlay) txt('rcpFlow', (ts.pump_flow_pct || 0).toFixed(0) + ' %');
    txt('tgRpm', ins.turbine_rpm.toFixed(0) + ' rpm');
    txt('tgMw', ins.mwe_output.toFixed(0) + ' MW');
    var lm = cs.load_mode || 'follow';
    segSync('lmFollow', lm === 'follow');
    segSync('lmManual', lm === 'manual');
    segSync('lmDisc', lm === 'disconnected');
    if (refs.pwLoadSliderRow) {
      refs.pwLoadSliderRow.style.opacity = lm === 'manual' ? '1' : '0.45';
      var sl = refs.mweSlider;
      if (sl) {
        sl.disabled = lm !== 'manual';
        if (Math.abs(+sl.value - cs.load_target_mwe) > 5) sl.value = Math.round(cs.load_target_mwe);
        txt('mweSliderVal', cs.load_target_mwe.toFixed(0));
      }
    }
    txt('tgTarget', (cs.load_target_mwe != null ? cs.load_target_mwe : cs.steam_demand_mwe).toFixed(0) + ' → ' + ins.mwe_output.toFixed(0));
    txt('tgGov', ins.governor_valve.toFixed(0) + ' %');
    txt('tgDump', ins.steam_dump_valve.toFixed(0) + ' %' + (cs.steam_dump_auto ? ' auto' : ' man'));
    segSync('dumpAuto', cs.steam_dump_auto);
    var ttrip = !!ins.steam_demand_low;
    txt('tgTrip', ttrip ? 'TURB TRIP / LOW DEMAND' : 'normal'); vcls('tgTrip', ttrip ? 'alarm' : 'dim');
    txt('cvVac', ctx.dispV(ins.condenser_vacuum));
    var cw = !!ins.condenser_cooling_available;
    txt('cvCw', cw ? 'available' : 'LOST'); vcls('cvCw', cw ? 'dim' : 'alarm');

    // ---- Plant status ----
    var sbo = !!ins.station_blackout;
    txt('sbo', sbo ? 'BLACKOUT' : 'normal'); vcls('sbo', sbo ? 'alarm' : 'dim');
    txt('scrStat', tripped ? 'TRIPPED' : 'at power'); vcls('scrStat', tripped ? 'warn' : 'dim');
    if (learning) {
      var core = ts.melted ? 'MELTED' : (ts.fuel_temp_c > fuelDamageC() ? 'FUEL DAMAGE' : 'intact');
      txt('coreStat', core); vcls('coreStat', ts.melted || ts.fuel_temp_c > fuelDamageC() ? 'alarm' : 'dim');
    }

    // ---- CVCS panel ----
    var pumpOn = cs.charging_pump_running !== false;
    segSync('cpOn', pumpOn); segSync('cpOff', !pumpOn);
    txt('cvcsChg', (cs.charging_flow_normalized * 100).toFixed(1) + '→' + (ins.charging_flow * 100).toFixed(1) + '%');
    txt('cvcsLtd', ((cs.letdown_flow_normalized || 0) * 100).toFixed(1) + '→' + (ins.letdown_flow * 100).toFixed(1) + '%');
    segSync('cvcsAuto', cs.cvcs_auto); segSync('cvcsMan', !cs.cvcs_auto);
    txt('cvcsBoron', ins.boron_analyzer.toFixed(0));
    if (refs.cvcsBoronDual) refs.cvcsBoronDual.textContent = learning ? '·true ' + ts.boron_ppm.toFixed(0) : '';
    segSync('bor', cs.boron_adjust > 0); segSync('borHold', !cs.boron_adjust); segSync('dil', cs.boron_adjust < 0);
    ['bor', 'dil'].forEach(function (f) { if (refs[f]) refs[f].disabled = !pumpOn; });

    // ---- Accumulator panel (flow UI only while discharging) ----
    var accOn = !!ins.accumulators_discharging;
    if (refs.accAnn) refs.accAnn.style.display = accOn ? '' : 'none';
    if (refs.accFlowRow) refs.accFlowRow.style.display = accOn ? '' : 'none';
    if (accOn) txt('accFlow', (ins.accumulator_flow * 100).toFixed(0) + ' %');

    // ---- taps ----
    txt('tapThot', Math.round(ctx.conv(ins.thot, 'temp'))); txt('tapThotU', ' ' + ctx.unit('temp'));
    txt('tapTcold', Math.round(ctx.conv(ins.tcold, 'temp'))); txt('tapTcoldU', ' ' + ctx.unit('temp'));

    renderDiagram(s, learning, overlay);
    renderPriority(s, learning);
  }

  function fuelDamageC() { return (RD.PWR_CONFIG && RD.PWR_CONFIG.thermal && RD.PWR_CONFIG.thermal.fuel_damage_c) || 1200; }

  // subcooling bar: −10 … +40 °C scale, cursor from the INSTRUMENT (HR1)
  function renderSubcool(s, learning, overlay) {
    var v = s.instruments.subcooling_margin;
    var fr = 1 - (clamp(v, -10, 40) + 10) / 50;   // 0 at top (+40), 1 at bottom (−10)
    refs.scCursor.style.top = 'calc(' + (fr * 100).toFixed(1) + '% - 1px)';
    txt('subcool', ctx.dispTd(v));
    refs.subcool.className = 'scv' + (v <= 0 ? ' alarm' : v <= 11 ? ' warn' : '');
    txt('scSat', v <= 0 ? 'SATURATED' : '');
    // ghost at true subcooling: Learning + overlay + failed P/T sensor lesson only
    var ptFail = ['tavg_sensor_failure'].some(function (id) { return activeFail(s, id); }) ||
      s.active_failures.some(function (f) { return /pressure|thot|tcold|tavg/.test(f.id) && /sensor|instrument/.test(f.id); });
    var g = refs.scGhost;
    if (g) {
      var on = learning && overlay && ptFail;
      g.classList.toggle('on', on);
      if (on) g.style.top = 'calc(' + ((1 - (clamp(s.true_state.subcooling_c, -10, 40) + 10) / 50) * 100).toFixed(1) + '% - 1px)';
    }
  }

  // contextual xenon / fuel chips (Learning only, hidden unless relevant)
  function renderChips(s, learning) {
    var box = refs.chips; if (!box) return;
    if (!learning) { if (box.innerHTML) box.innerHTML = ''; return; }
    var ts = s.true_state, t = s.metadata.sim_time;
    var xe = ts.xenon_pct_eq;
    if (prev.xe != null && t > prev.xeT) {
      var slope = (xe - prev.xe) / (t - prev.xeT);
      prev.xeSlope = prev.xeSlope + 0.2 * (slope - prev.xeSlope);
    }
    prev.xe = xe; prev.xeT = t;
    var h = '';
    var moving = Math.abs(prev.xeSlope) > 0.0015, off = Math.abs(xe - 100) > 10;
    if (off || moving || priorityHasXenon) {
      var chip = prev.xeSlope > 0.0015 ? ['amber', 'Xenon: Building ↑'] :
        prev.xeSlope < -0.0015 ? ['green', 'Xenon: Burning Off ↓'] : ['yellow', 'Xenon: Peaking ↔'];
      h += '<span class="chip ' + chip[0] + '" id="pwXenonChip" data-scanner-hint="Xenon — fission-product poison; builds after a power drop, burns off on a rise.">' + chip[1] + '</span>';
    }
    var dmg = fuelDamageC(), ft = ts.fuel_temp_c;
    var fuel = ts.melted ? ['red', 'Fuel melting in progress'] :
      ft > dmg ? ['red', 'Fuel damage occurring'] :
      ft > dmg * 0.85 ? ['amber', 'Fuel damage imminent'] :
      (prev.fuelSeen ? ['green', 'Fuel stable'] : null);
    if (ft > dmg * 0.85 || ts.melted) prev.fuelSeen = true;
    if (ft < dmg * 0.6) prev.fuelSeen = false;   // recovery complete — drop the chip
    if (fuel) h += '<span class="chip ' + fuel[0] + '" id="pwFuelStatus" data-scanner-hint="Fuel status — plain-language fuel condition; the board has no fuel thermocouple.">' + fuel[1] + '</span>';
    if (box.innerHTML !== h) box.innerHTML = h;
  }
  var priorityHasXenon = false;

  // ------------------------------------------------------------ diagram animation
  // Animation HR1: Realistic motion comes ONLY from instruments, status booleans,
  // or control_state commanded pose. Learning may add teaching animation.
  function renderDiagram(s, learning, overlay) {
    var ins = s.instruments, ts = s.true_state, cs = s.control_state;

    // rod fills on the vessel (control_state — commanded/actual bank position)
    var cg = null, sg = null;
    cs.rod_groups.forEach(function (g) { if (g.function === 'control') cg = g; if (g.function === 'shutdown') sg = g; });
    if (cg) {
      var hC = (72 + 2.1 * clamp(100 - cg.position_pct, 0, 100)).toFixed(1);
      svgEl.querySelectorAll('#pwRodFill rect').forEach(function (r) { r.setAttribute('height', hC); });
    }
    if (sg) {
      var hS = (72 + 2.1 * clamp(100 - sg.position_pct, 0, 100)).toFixed(1);
      svgEl.querySelectorAll('#pwRodShutdown rect').forEach(function (r) { r.setAttribute('height', hS); });
    }

    // primary loop dashes + RCP impeller: rcp_running STATUS only (fixed speed,
    // brief coastdown on the true->false edge)
    coastable(!!ins.rcp_running, 'rcp', function (on, coasting) {
      var dur = coasting ? 3.2 : 1.2;
      flowOn('pwHotLegFlow', on, dur); flowOn('pwColdLegFlow', on, dur);
      rotorOn('pwRcp', on, coasting ? 2.4 : 0.8);
      svgEl.querySelectorAll('#pwSgTubes .flow').forEach(function (f) {
        f.classList.toggle('on', on);
        var d = (coasting ? 3.2 : 1.4) + 's'; if (f._d !== d) { f._d = d; f.style.setProperty('--dur', d); }
      });
    });

    // leg temperature coloring — from leg instruments (smooth warm/cool tint)
    var warm = clamp((ins.thot - 286) / 60, 0, 1);
    var wc = 'rgb(' + Math.round(170 + warm * 70) + ',' + Math.round(150 - warm * 45) + ',' + Math.round(100 - warm * 25) + ')';
    var hf = svgEl.querySelector('#pwHotLegFlow'); if (hf && hf._c !== wc) { hf._c = wc; hf.setAttribute('stroke', wc); }

    // PZR: level instrument; heater/spray from control_state (commanded/auto pose)
    setLevel('pwPzrWater', 'pwPzrSurface', ins.pzr_level / 100, 212, 313, 442, 498);
    var heat = cs.heater_power_pct || 0;
    svgEl.querySelectorAll('#pwPzrHeater .heater-coil').forEach(function (c) { c.classList.toggle('hot', heat > 5); });
    // spray mist needs BOTH a spray command and RCP flow (acceptance #12)
    var spraying = (cs.spray_valve_pct || 0) > 2 && !!ins.rcp_running;
    valvePose('pwPzrSprayValve', (cs.spray_valve_pct || 0) > 2, (cs.spray_valve_pct || 0) / 100);
    svgEl.querySelectorAll('#pwPzrSprayMist .spray-mist').forEach(function (m) { m.classList.toggle('on', spraying); });

    // Relief: PORV bow-tie + relief animation from the INDICATOR in Realistic.
    // Learning adds true-position relief animation (ghost) when the indicator lies.
    var indOpen = ins.porv_indicator === 'open';
    valvePose('pwPorv', indOpen);
    valvePose('pwPorvBlock', !!cs.porv_block_open);
    flowOn('pwReliefFlow', indOpen && cs.porv_block_open, 0.5);
    var ghost = svgEl.querySelector('#pwReliefGhost');
    if (ghost) ghost.classList.toggle('on', learning && ts.porv_open && !indOpen && cs.porv_block_open);
    var sfty = !!ins.safety_relief_active;
    valvePose('pwSafetyValve', sfty);
    flowOn('pwSafetyFlow', sfty, 0.5);

    // SG secondary level — INDICATED level (shrink/swell rides the instrument)
    setLevel('pwSgWater', 'pwSgSurface', ins.sg_level / 100, 265, 455, 682, 798);

    // steam path: header dashes ∝ steam-flow instrument; governor from instrument
    var stm = Math.max(0, ins.steam_flow);
    flowOn('pwSgSteamHeader', stm > 0.03, clamp(1.0 / Math.max(stm, 0.05), 0.4, 6));
    valvePose('pwGovValve', ins.governor_valve > 2, ins.governor_valve / 100);
    // steam dump: bypass dashes from the steam-dump INSTRUMENT (Animation HR1)
    var dump = ins.steam_dump_valve;
    valvePose('pwSteamDump', dump > 2, dump / 100);
    flowOn('pwSteamDumpFlow', dump > 2, clamp(60 / Math.max(dump, 5), 0.5, 4));

    // turbine blades ∝ RPM instrument; exhaust with steam flow
    var rpm = ins.turbine_rpm;
    var tr = svgEl.querySelector('#pwTurbineRotor');
    if (tr) {
      tr.classList.toggle('on', rpm > 30);
      var bd = clamp(700 / Math.max(rpm, 40), 0.12, 3).toFixed(2) + 's';
      if (tr._d !== bd) { tr._d = bd; tr.style.setProperty('--blade', bd); }
    }
    flowOn('pwExhaustFlow', stm > 0.03 || dump > 2, 1.2);

    // feed train: pumps + dashes ∝ fw-flow instrument (loss of feedwater stops it)
    var fw = Math.max(0, ins.fw_flow);
    flowOn('pwFwFlow', fw > 0.03, clamp(1.0 / Math.max(fw, 0.05), 0.4, 6));
    rotorOn('pwCondPump', fw > 0.03, clamp(0.7 / Math.max(fw, 0.1), 0.25, 3));
    rotorOn('pwFeedPump', fw > 0.03, clamp(0.7 / Math.max(fw, 0.1), 0.25, 3));

    // CW loop: dashes only while cooling is INDICATED available
    var cw = !!ins.condenser_cooling_available;
    flowOn('pwCwFlow', cw, 1.6); flowOn('pwCwFlowRet', cw, 1.6);

    // emergency paths: status booleans + flow instruments only
    flowOn('pwHpiFlow', !!ins.hpi_active, 0.9);
    flowOn('pwAfwFlow', !!ins.afw_active, 0.9);
    valvePose('pwAfwValve', !!ins.afw_active);
    flowOn('pwRhrFlow', !!ins.rhr_active, 1.2);
    // Merged HPI/LPI: the low-pressure line animates once the low-head segment
    // of the injection curve carries real flow (hpi_flow well above the
    // high-head-only ceiling of ~0.38 of combined rated).
    flowOn('pwLpiFlow', !!ins.hpi_active && ins.hpi_flow > 0.4, clamp(0.8 / Math.max(ins.hpi_flow, 0.1), 0.4, 3));
    var accOn = !!ins.accumulators_discharging;
    flowOn('pwAccumulatorFlow', accOn && ins.accumulator_flow > 0.02, clamp(0.8 / Math.max(ins.accumulator_flow, 0.1), 0.4, 3));
    valvePose('pwAccumulatorCheckValve', accOn);

    // CVCS: dashes/impeller ∝ charging/letdown flow INSTRUMENTS
    var chg = ins.charging_flow, ltd = ins.letdown_flow;
    flowOn('pwCvcsChargeFlow', chg > 0.004, clamp(0.08 / Math.max(chg, 0.008), 0.4, 4));
    rotorOn('pwCvcsChargePump', chg > 0.004, clamp(0.06 / Math.max(chg, 0.008), 0.3, 3));
    flowOn('pwCvcsLetdownFlow', ltd > 0.004, clamp(0.08 / Math.max(ltd, 0.008), 0.4, 4));

    // leak spray — primary_leak_flow INSTRUMENT gates it; failure id picks the site
    var leak = ins.primary_leak_flow > 0.02;
    var sgtr = activeFail(s, 'sgtr');
    svgEl.querySelectorAll('#pwLeakLoca .leak-spray').forEach(function (p) { p.classList.toggle('on', leak && !sgtr); });
    svgEl.querySelectorAll('#pwLeakSgtr .leak-spray').forEach(function (p) { p.classList.toggle('on', leak && sgtr); });

    // Learning-only glows: Cherenkov ∝ power instrument; amber fuel glow from truth
    if (learning) {
      var cg2 = svgEl.querySelector('#pwCoreGlow');
      if (cg2) cg2.style.opacity = (clamp(ins.power_range / 100, 0, 1.2) * (overlay ? 0.5 : 0.35)).toFixed(2);
      var fg = svgEl.querySelector('#pwFuelGlow');
      if (fg) {
        var hotness = clamp((ts.fuel_temp_c - 700) / (fuelDamageC() * 2 - 700), 0, 1);
        fg.style.opacity = (hotness * 0.7 + clamp(ts.decay_heat_pct / 20, 0, 0.15)).toFixed(2);
      }
    }
  }

  // ------------------------------------------------------------ what matters now
  // Priority tiers from active failures / actuations: soft pulse + auto-expand.
  function renderPriority(s, learning) {
    var ins = s.instruments;
    var pulseCards = {}, pulseNodes = {}, pulseEls = {};
    priorityHasXenon = false;

    // TMI-class stuck PORV + lying indicator: subcool bar + PZR level + relief trio
    var tmi = activeFail(s, 'stuck_porv_open') && activeFail(s, 'porv_indicator_stuck_closed');
    if (tmi !== prev.tmi) { secUser.pin = null; prev.tmi = tmi; }   // new episode — auto resumes
    if (tmi) {
      pulseCards.pzr = pulseCards.relief = true;
      pulseNodes.gRelief = true;
      pulseEls.pwSubcoolBar = true;
      autoPzrSection('level');
    } else autoPzrSection((ins.pzr_level > 80 || ins.pzr_level < 25) ? 'level' : 'press');

    // ECCS actuation drives the Emergency card tab + pulse
    var emAct = ins.hpi_active ? 'hpi' : ins.afw_active ? 'afw' :
      (ins.rhr_active || ins.accumulators_discharging) ? 'rhr' : null;
    if (emAct) {
      pulseCards.emergency = true;
      if (emTabAuto !== emAct && emTabUser == null) setEmTab(emAct);
      emTabAuto = emAct;
    } else { emTabAuto = 'hpi'; if (!emAct && emTabUser == null) {} }
    if (!emAct) emTabUser = null;   // priority cleared — resume auto selection

    // xenon priority after big power moves (chip auto-show hook)
    if (learning && Math.abs(s.true_state.xenon_pct_eq - 100) > 25) priorityHasXenon = true;

    // apply pulses
    Object.keys(cardEls).forEach(function (k) { cardEls[k].classList.toggle('wm', !!pulseCards[k]); });
    ['gRelief', 'gPzr', 'gHpi', 'gAfw', 'gRhr', 'gLpi', 'gCore'].forEach(function (id) {
      var el = svgEl.querySelector('#' + id); if (el) el.classList.toggle('wm', !!pulseNodes[id]);
    });
    var bar = stage.querySelector('#pwSubcoolBar');
    if (bar) bar.classList.toggle('wm', !!pulseEls.pwSubcoolBar);
    if (bar && pulseEls.pwSubcoolBar) bar.classList.add('wm');
    // PZR water + PORV node pulse during TMI
    var gp = svgEl.querySelector('#gPzr'); if (gp) gp.classList.toggle('wm', !!tmi);
    var lead;
    ['pzr', 'relief', 'emergency'].forEach(function (k) {
      lead = leadersEl.querySelector('[data-lead="' + k + '"]');
      if (lead) lead.classList.toggle('wm', !!pulseCards[k]);
    });
  }
  // PZR card is a strict accordion (pressure | level) so its height stays
  // bounded and it never slides over the SG card below it.
  function setPzrOpen(key) {
    if (!cardEls.pzr) return;
    var changed = false;
    cardEls.pzr.querySelectorAll('.csec').forEach(function (el) {
      var want = el.getAttribute('data-sec') === key;
      if (el.classList.contains('open') !== want) { el.classList.toggle('open', want); changed = true; }
    });
    if (changed) drawLeaders();
  }
  function autoPzrSection(target) {
    if (secUser.pin) return;   // user pin wins
    setPzrOpen(target);
  }

  // ------------------------------------------------------ Instructor reveal (F8)
  // Manual-procedure control labels (the vocabulary of RD.MANUAL_PROCEDURES and
  // test/manual_ui_map.js) → where that control lives in the synoptic: a card,
  // an Emergency Cooling tab, a PZR accordion section, or an embedded panel.
  // Pure data, so scenario/procedure authors never touch synoptic internals.
  var SYN_CONTROL_MAP = {
    'Control Bank':                { card: 'rod' },
    'Rod Speed':                   { card: 'rod' },
    'Rod motion':                  { card: 'rod' },       // campaign-beat aliases (playtest:
    'Nudge':                       { card: 'rod' },       // these labels glowed nothing)
    'Mode':                        { card: 'turbgen' },
    'Load':                        { card: 'turbgen' },
    'Boron':                       { panel: 'pwCvcsPanel' },
    'Shutdown Bank':               { card: 'rod' },
    'SCRAM':                       { card: 'rod', sel: '[data-syn="scram"]' },
    'Boron (Reactivity) — CVCS':   { panel: 'pwCvcsPanel' },
    'Charging Pump (CVCS)':        { panel: 'pwCvcsPanel' },
    'Letdown Valve (CVCS)':        { panel: 'pwCvcsPanel' },
    'CVCS Inventory Control':      { panel: 'pwCvcsPanel' },
    'Pressurizer Heaters (PZR)':   { card: 'pzr', sec: 'press' },
    'Pressurizer Spray (PZR)':     { card: 'pzr', sec: 'press' },
    'Reactor Coolant Pumps (RCP)': { card: 'rcp' },
    'Relief Valve (PORV)':         { card: 'relief' },
    'PORV Block Valve':            { card: 'relief' },
    'HPI':                         { card: 'emergency', emtab: 'hpi' },
    'HPI/LPI':                     { card: 'emergency', emtab: 'hpi' },
    'AFW':                         { card: 'emergency', emtab: 'afw' },
    'AFW Throttle':                { card: 'emergency', emtab: 'afw' },
    'Decay-Heat Removal (DHR)':    { card: 'emergency', emtab: 'rhr' },
    'Feed Pumps':                  { card: 'steam' },
    'Feed Reg':                    { card: 'steam' },
    'Feed Pump':                   { card: 'steam' },
    'MSIV':                        { card: 'steam' },
    'SR detector':                 { card: 'power', nis: 1 },
    'NIS':                         { card: 'power', nis: 1 },
    'Trip Blocks':                 { card: 'power', nis: 1 },
    '1/M Plot':                    { card: 'power', nis: 1 },
    'Steam Dump':                  { card: 'turbgen' },
    'Turbine Load':                { card: 'turbgen' },
    'Main Breaker':                { card: 'turbgen' },
  };

  // Reveal the synoptic home of a control: auto-switch the Emergency tab or PZR
  // section it hides behind (the Flag-F8 fix) and return the element to glow —
  // or null for an unknown label (callers glow nothing; never throws).
  function revealControl(label) {
    var m = SYN_CONTROL_MAP[label];
    if (!m || !mounted || !stage) return null;
    if (m.emtab) { emTabUser = m.emtab; setEmTab(m.emtab); }
    if (m.sec) { secUser.pin = m.sec; setPzrOpen(m.sec); }
    if (m.nis) {
      var ns = stage.querySelector('#pwNisSec');
      if (ns) { ns.classList.add('open'); nisUser = true; }
    }
    var el = m.panel ? stage.querySelector('#' + m.panel)
                     : stage.querySelector('.plant-card[data-card="' + m.card + '"]');
    if (el && m.sel) el = el.querySelector(m.sel) || el;
    return el || null;
  }

  // ------------------------------------------------------------ scenario props
  // The maintenance tag (TMI-2 M5): a scenario-driven clickable prop that
  // occludes the AFW discharge-valve indication. setTag is idempotent — the
  // app calls it every render with the scenario's ui_policy state.
  var tagState = { id: null, visible: false };
  function setTag(interactionId, visible) {
    tagState.id = interactionId || null;
    tagState.visible = !!(interactionId && visible);
    if (!mounted || !svgEl) return;
    var el = svgEl.querySelector('#pwMaintTag');
    if (el) el.style.display = tagState.visible ? '' : 'none';
  }

  // ------------------------------------------------------------ export
  RD.PwrSynoptic = {
    mount: mount,
    unmount: unmount,
    render: render,
    isMounted: function () { return mounted; },
    refreshLayout: function () { if (mounted) { positionCards(); positionPanels(); drawLeaders(); } },
    revealControl: revealControl,
    setTag: setTag,
    // Test hook (run_campaign structural check): the labels revealControl can
    // resolve — every PWR beat highlight must name one, or nothing will glow.
    highlightLabels: Object.keys(SYN_CONTROL_MAP),
  };
})(globalThis.RD || (globalThis.RD = {}));
