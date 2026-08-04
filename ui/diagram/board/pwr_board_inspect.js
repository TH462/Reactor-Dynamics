/* pwr_board_inspect.js — RD.PwrBoardInspect: what every object on the PWR board IS.
 *
 * The inspection system (GitHub #96). Hovering anything on the board writes a
 * one-line summary into the inspection block; expanding that block turns the same
 * hover into a fuller account. This file is the copy for both tiers, plus the
 * manual section each object is documented in.
 *
 * ---- two tiers, one entry -----------------------------------------------
 *   brief  — one sentence. What it is / what it does. Fits the collapsed block.
 *   detail — the paragraph a new operator needs: how it behaves, what it is
 *            wired to, and the trap that catches people. Shown when expanded.
 *
 * Both are AUTHORED, not generated: a summary derived from the item's label would
 * only ever say "SPRAY — spray", which teaches nothing.
 *
 * ---- fallback by containment --------------------------------------------
 * Board tiles are absolutely-positioned SIBLINGS, not nested DOM (pwr_board.js
 * buildStage), so "which card is this button on?" is a GEOMETRY question, not a
 * DOM one. `boxOf()` answers it from the generated doc: the smallest box item
 * whose rect contains the item's centre. An item with no entry of its own
 * inherits its card's entry, marked `inherited` so the UI can say so — which is
 * why the board is fully covered without an entry per authored text label.
 *
 * ---- ids are the fragile part -------------------------------------------
 * Keys are diagram item ids, the same contract as CONTROL_LABEL_MAP and
 * PIPE_TEMP in pwr_board_wiring.js: stable across a re-export for ITEMS, but a
 * deleted or re-drawn item leaves an orphan key that fails silently (the object
 * just stops describing itself). `test/run_inspect.js` and the driver selfTest
 * both assert every key resolves to a live item, and that every interactive
 * item resolves to some entry.
 *
 * ---- accuracy ------------------------------------------------------------
 * Numbers here are quoted from Manuals/03 + 09 and the wiring's own semantics,
 * NOT recalled: the manual is the operator-facing record of the same setpoints
 * the control layer holds. `sec` points at the manual section that owns the
 * object, so a reader can go from the board to the procedure in one click. When
 * a number moves in the engine, this text is stale in the same way the manual is
 * — fix both.
 *
 * Plain global-namespace script (CLAUDE.md, "Code conventions"): browser via
 * <script> in ui/shell.html, Node via require() in test/run_inspect.js.
 */
(function () {
  'use strict';
  var RD = (typeof window !== 'undefined' ? window : globalThis).RD =
           (typeof window !== 'undefined' ? window : globalThis).RD || {};

  // Manual documents these entries cite (ids from ui/manual_md.js).
  var CI = '03_controls_and_indications';   // controls + indications
  var NO = '04_normal_operations';
  var MT = '05_mode_transitions';
  var AE = '07_abnormal_emergency';
  var TMI = '08_accident_tmi';
  var SP = '09_setpoints_limits';

  // entry(title, brief, detail, manualDoc, manualSection)
  function e(t, b, d, doc, sec) {
    return { title: t, brief: b, detail: d, doc: doc || null, sec: sec || null };
  }

  // ==================================================================== ITEMS
  // Keyed by diagram item id. Grouped by board card, in roughly the order the
  // eye travels: reactor → NIS → pressurizer → relief → RCS → CVCS → ECCS →
  // steam generator/feed → secondary → the vital-parameter strip.
  var ITEMS = {

    // ------------------------------------------------------------ rod control
    ims14ylw4az: e('Reactor / Rod Control',
      'The reactivity station: both rod banks, rod speed, the Tavg auto channel and the SCRAM.',
      'Everything that moves neutrons by hand lives on this card. The control bank is the trim ' +
      'control, the shutdown bank is the protection group that is parked fully out at power, and ' +
      'SCRAM drives them all in. Reactivity you cannot see directly — you infer it from startup ' +
      'rate, power and Tavg on the NIS card beside it.', CI, '3.0'),

    imrpk3wvydp: e('Control Bank',
      'The operable rod group — the reactivity trim control. WITHDRAW adds reactivity, INSERT removes it.',
      'Position reads 0 steps fully inserted to 912 fully withdrawn, and sits near 92 % withdrawn ' +
      'at hot full power. A quick click steps one step (about 9 pcm near the startup band); holding ' +
      'drives continuously at the selected speed until you let go. Withdrawal is interlocked out ' +
      'when startup rate reaches 1.5 DPM and stays blocked until it falls below 0.8 DPM — insertion ' +
      'is never blocked.', CI, '3.1'),
    imrpk6qzjq8: e('WITHDRAW (control bank)',
      'Drives the control bank out — adds reactivity. Tap for one step, hold to drive.',
      'Tap-or-hold: a click is a single step, a press-and-hold runs the bank at the selected rod ' +
      'speed until release. This is the control you raise power with below rated load, and the one ' +
      'the startup-rate interlock blocks at 1.5 DPM. On approach to criticality use single taps at ' +
      'SLOW — held withdrawals are what push the rate past 1 DPM.', CI, '3.1'),
    imrpk79mwng: e('INSERT (control bank)',
      'Drives the control bank in — removes reactivity. Tap for one step, hold to drive.',
      'The mirror of WITHDRAW, and never interlocked: insertion is always available, whatever the ' +
      'startup rate is doing. Inserting is how you catch a rising rate before it becomes a trip, ' +
      'and how you trim Tavg down without touching boron.', CI, '3.1'),
    imrpk8169ds: e('SLOW (rod speed)',
      'Slowest rod drive speed — the approach-to-criticality and fine-trim setting.',
      'Rod speed applies to a HELD control-bank drive; a single tap is one step whatever the speed. ' +
      'SLOW is the setting for the final approach to criticality and for fine power trim, where the ' +
      'target is startup rate at or below 1 DPM and reactor period no shorter than 30 s.', CI, '3.2'),
    imrpk8grvcz: e('MED (rod speed)',
      'Middle rod drive speed — routine power manoeuvring.',
      'The everyday setting for load changes at power, where you are moving the bank tens of steps ' +
      'and watching Tavg rather than counting pcm.', CI, '3.2'),
    imrpk8kjsjs: e('FAST (rod speed)',
      'Fastest rod drive speed — large deliberate moves. Watch startup rate.',
      'Reserved for intentional large moves. At low power a fast held withdrawal will run the ' +
      'startup rate into the 1.5 DPM withdrawal block, which stops the drive and leaves you waiting ' +
      'for the rate to decay below 0.8 DPM.', CI, '3.2'),
    imrpk4pjcpd: e('Control Rod Position',
      'Control bank position in steps — 0 fully inserted, 912 fully withdrawn.',
      'Reads the rod group position from the control state, in drive steps rather than percent, ' +
      'because steps are what the operator commands. Roughly 92 % withdrawn is the normal full-power ' +
      'position; parked low it means the plant is holding power with rods instead of boron, which ' +
      'costs shutdown margin and trips the insertion-limit alarm.', CI, '3.1'),
    ims2hvqbvee: e('Control Rod Position',
      'The control bank\'s step-count indication.',
      'Frame around the control-bank step readout. See the Control Bank card for what the number ' +
      'means and where it should sit.', CI, '3.1'),

    imrpny66npx: e('Shutdown Bank',
      'The protection rod group — carries shutdown margin. Parked fully withdrawn at power.',
      'Not a trim control: one click drives the whole bank the whole way, at fast speed, and a ' +
      'second click stops it wherever it has got to (the button holds a yellow in-motion light ' +
      'while it travels). Normal position at power is fully withdrawn; parking it in gives up ' +
      'shutdown margin. A SCRAM drives it fully in and overrides any manual command.', CI, '3.3'),
    imrpnyaxsb3: e('WITHDRAW (shutdown bank)',
      'Drives the shutdown bank fully out — one click, full travel.',
      'A latched full-stroke command, not a step or a held drive: press once to start, press again ' +
      'to stop it part-way, and it clears itself at the limit. Withdrawing the shutdown bank is a ' +
      'startup step — it must be fully out before the control bank takes the plant critical.', CI, '3.3'),
    imrpnyf37ju: e('INSERT (shutdown bank)',
      'Drives the shutdown bank fully in — one click, full travel.',
      'The planned-shutdown direction. Inserting the shutdown bank at power is abnormal: it turns ' +
      'the group that exists to guarantee shutdown margin into a reactivity control. Do it as part ' +
      'of a shutdown, not as a substitute for control-bank trim.', CI, '3.3'),
    imrpnzfsfcx: e('Shutdown Rod Position',
      'Shutdown bank position in steps — should read fully withdrawn at power.',
      'Same scale as the control bank. Anything short of fully withdrawn during power operation is ' +
      'abnormal and shows red: the bank is meant to be banked out, ready to fall in.', CI, '3.3'),
    ims2hvv0wgo: e('Shutdown Rod Position',
      'The shutdown bank\'s step-count indication.',
      'Frame around the shutdown-bank step readout. See the Shutdown Bank card for what the number ' +
      'should read.', CI, '3.3'),

    ims5glucngg: e('ROD AUTO',
      'Hands the control bank to the Tavg automation channel — rods hold coolant temperature on the load program.',
      'The reference is PROGRAMMED on turbine load, not captured: Tref slides along a line from ' +
      '566.6 °F (297.0 °C) at no load to 579.2 °F (304.0 °C) at full power, and the rods drive indicated Tavg to ' +
      'it at variable speed, locking up inside a deadband of about ±1.4 °F (±0.8 °C). Drop load from 100 to ' +
      '60 MWe and the reference walks itself from 579.3 °F (304.07 °C) down to 574.2 °F (301.24 °C) — the ' +
      'rods answer a load change before you do. On a free-play start it engages itself above P-10 (10 % ' +
      'power), so at power it is already in. Any manual rod motion drops the channel to manual, and so ' +
      'does a scram.', CI, '14.3'),

    imrqr8ecji6: e('SCRAM',
      'Manual reactor trip — drives every rod in. Arm, then confirm.',
      'Two-press by design: the first press arms, the second inserts all rods. Power collapses in ' +
      'seconds, the turbine goes offline and decay heat remains — which is why the steps that follow ' +
      'a trip are about the heat sink (SG level, AFW) and inventory, not about the reactor. The ' +
      'REACTOR TRIP tile names the first-out cause.', CI, '3.5'),
    imrsk4xz2dm: e('TRIP BLOCKS',
      'Opens the startup trip-block panel — deliberately blocking a protection trip during startup.',
      'Above P-10 (10 % power) the intermediate-range high-flux trip and the 25 % power-range trip ' +
      'stand in the way of a normal ascent, so they are blocked on purpose and the badge counts how ' +
      'many are blocked. A block is an ENABLE, not a switch: it is accepted only while the plant is ' +
      'inside that trip\'s permissive — above P-10 for these two, below P-11 for the pressure trips ' +
      'on a cooldown — and refused anywhere else, whoever you are. That is why the reactor trips ' +
      'cannot be switched off at power. Clearing is never refused, so clearing a block that is ' +
      'holding a trip off scrams the plant on the spot. Every block reinstates itself the moment its ' +
      'permissive drops, including one you set by hand.', CI, '4.4'),

    // -------------------------------------------------- nuclear instrumentation
    ims175lciah: e('Nuclear Instrumentation (NIS)',
      'The flux instruments: source range, intermediate range, startup rate, ΔT and the 1/M plot.',
      'Three overlapping detector ranges cover twelve decades of neutron flux, because no single ' +
      'instrument can. Startup is a handoff up that chain — source range to intermediate range to ' +
      'power range — and this card is where you watch it happen. Everything here reads an ' +
      'instrument, so a failed detector lies here first.', CI, '4.0'),
    ims176nions: e('Source Range',
      'The lowest flux range — counts per second, the only instrument that reads a shutdown core.',
      'A proportional counter reading 1 to 1e6 cps. It is the instrument for approach to criticality ' +
      'and the input to the 1/M plot. It is also the one you must secure on the way up: it trips the ' +
      'reactor at 1e5 cps and turns amber at 5e4 cps to tell you the handoff is due.', CI, '4.3'),
    imro6qutiht: e('Source Range indication',
      'Neutron counts per second — the shutdown-core flux instrument. Amber at the SR→IR handoff.',
      'Logarithmic, 1 to 1e6 cps. Watch it double as rods come out: the doubling rate IS the ' +
      'approach to criticality, which is what the 1/M plot formalises. The number itself carries ' +
      'the limits: amber at 5e4 cps is the cue to complete the handoff, RED at 1e5 cps is the ' +
      'high-flux trip that ends the ascent, and once you secure the detector it goes grey — that ' +
      'trip is conditional on the detector being energized, so there is no live limit here ' +
      'afterwards.', CI, '4.3'),
    bdSrDetector: e('SR DET',
      'Energizes or secures the source-range detector. Interlocked both ways (P-6).',
      'Lit means energized and counting. You cannot secure it until the intermediate range is on ' +
      'scale (1e-10 A) — that would leave you blind at low power — and you cannot re-energize it ' +
      'above 1e-6 A, which would damage the counter. Secure it during the power ascent, before its ' +
      '1e5 cps high-flux trip reaches up and scrams you.', CI, '4.3'),
    ims176t4e8s: e('Intermediate Range',
      'The middle flux range — a compensated ion chamber reading in amps.',
      'Overlaps the source range at the bottom and the power range at the top, covering the gap ' +
      'between counting individual neutrons and measuring a current. It is the instrument that ' +
      'permits the source range to be secured (P-6, 1e-10 A).', CI, '4.3'),
    imro6rctcgm: e('Intermediate Range indication',
      'Intermediate-range detector current in amps — 1e-11 to 2e-3, logarithmic.',
      'Reads amps, not percent: the scale is logarithmic because flux is. Its high-flux trip is one ' +
      'of the two blocked deliberately during a startup, since a normal ascent walks straight ' +
      'through the setpoint below P-10. The number goes amber within half a decade of that trip ' +
      '(1.67e-3 A) and red at it — then grey once you block it above P-10, because a blocked trip ' +
      'is not a limit you can run into. This is the middle rung of the startup net: P-10 at 10 %, ' +
      'this at about 20 %, the power-range low setpoint at 25 %.', CI, '4.3'),
    ims175yp3k8: e('Startup Rate',
      'How fast power is changing, in decades per minute — the rate instrument for a startup.',
      'Startup rate is the operator\'s real-time reactivity feedback. Target 1 DPM or less on ' +
      'approach to criticality (reactor period 30 s or longer); the rod withdrawal interlock comes ' +
      'in at 1.5 DPM and releases below 0.8 DPM.', CI, '4.0'),
    imro6qsncb9: e('Startup Rate indication',
      'Startup rate in decades per minute — positive is rising power, negative falling.',
      'A 2-second lag sits between the core and this number, which is why a big held withdrawal is ' +
      'already too much by the time the meter shows it. Watch the trend, not the instant value. ' +
      'Amber at 1.0 DPM is the SUR HI alarm; red at 1.5 DPM means the rod WITHDRAWAL BLOCK is on — ' +
      'not a trip, a command block, and it releases below 0.8 DPM. Insertion is never blocked.', CI, '4.0'),
    ims175ay22g: e('ΔT Average',
      'Core temperature rise: hot leg minus cold leg. A direct read on thermal power.',
      'With flow constant, ΔT is proportional to core power — and unlike the flux instruments it ' +
      'measures the heat actually being removed. On natural circulation (RCPs stopped) it widens ' +
      'sharply, which is the tell that flow has fallen rather than that power has risen.', CI, '4.1'),
    imro6qpci2d: e('ΔT Average indication',
      'Thot − Tcold across the core — the rise the coolant picks up on its way through.',
      'Runs 59.4 °F (33.0 °C) at full power on this plant, near zero when the reactor is shut down and the ' +
      'pumps are running. Both legs carry a 4-second instrument lag, so ΔT lags a load change.', CI, '4.1'),
    imro6rdwwdn: e('Reactivity',
      'Net core reactivity in pcm — a computed diagnostic, not a plant instrument.',
      'This is the reactivity computer, and it reads TRUE state: real plants infer reactivity from ' +
      'rate meters and rod worth curves rather than measuring it. Treat it as the teaching overlay ' +
      'it is — positive means power is climbing, zero means critical and steady.', CI, '4.1'),
    bdRxPeriod: e('Reactor period',
      'Reactor period in seconds — time for power to change by a factor of e.',
      'Teaching readout under REACTIVITY (true state), not a field instrument. Near criticality ' +
      'you want a long period (tens of seconds or more); a short period means power is changing ' +
      'fast. ∞ means essentially steady.', CI, '4.1'),
    bdRxPeriodLbl: 'bdRxPeriod',
    bdOneOverM: e('1/M PLOT',
      'Opens the inverse-count-rate plot — the standard approach-to-criticality tool.',
      'Plot the inverse of source-range count rate against rod position: as the core approaches ' +
      'critical the curve extrapolates to zero, and that extrapolation is your estimate of the ' +
      'critical rod position before you get there. The fit uses the trailing points, so it tightens ' +
      'as you close in.', CI, '17.1'),

    // -------------------------------------------------------------- pressurizer
    ims1518jad4: e('Pressurizer Control',
      'The pressure station: heaters, spray and the pressure setpoint they work toward.',
      'The pressurizer is the only place in the primary where steam and water coexist, and pressure ' +
      'is set by what happens there: heaters boil water to raise pressure, spray condenses steam to ' +
      'lower it. Everything on this card is about holding the RCS well above saturation so the ' +
      'coolant stays liquid.', CI, '5.0'),
    imro94kec8b: e('Pressurizer Heaters',
      'Electric heaters in the pressurizer water space — the way you RAISE primary pressure.',
      'AUTO runs them proportionally when pressure is below the setpoint band; MANUAL holds the ' +
      'percentage you type; OFF removes heater power. Heaters are how you restore subcooling after ' +
      'an overcooling event and how you pressurize on a heatup. The % box shows live output — greyed ' +
      'while AUTO owns it.', CI, '5.2'),
    imro969lnex: e('AUTO (heaters)',
      'Heaters follow the pressure controller toward the setpoint.',
      'The normal lineup at power. The controller modulates heater power against the pressure ' +
      'setpoint box on this card, so raising that setpoint on a heatup makes the heaters pressurize ' +
      'the plant to the new target.', CI, '5.2'),
    imro96ei9hd: e('MANUAL (heaters)',
      'Heaters run at the percentage you set, ignoring pressure.',
      'A fixed-demand mode: the heaters do exactly what you asked and nothing else. Useful to force ' +
      'a pressure rise or hold a bubble in Mode 4/5, but it will happily drive pressure into the ' +
      'relief band if you leave it there.', CI, '5.2'),
    imro96h8lip: e('OFF (heaters)',
      'No heater power.',
      'Pressure then drifts with ambient losses and whatever spray or relief is doing. On a cooldown ' +
      'this is the deliberate setting; at power it means pressure control is one-sided.', CI, '5.2'),
    imro96mj15p: e('Heater power %',
      'Heater output demand, 0–100 %. Typing here takes the heaters to MANUAL.',
      'Under AUTO this box shows the controller\'s live demand, greyed, because it is an indication ' +
      'and not your command. Type a number and you take the heaters manual at that power.', CI, '5.2'),
    imrsg8b7b9o: e('Pressure Setpoint',
      'The primary pressure the AUTO heaters and spray drive toward.',
      'Normal operating pressure is 2235 psi (15.41 MPa). Raise the setpoint during a heatup ' +
      'and the heaters pressurize toward it; lower it on a cooldown and spray brings pressure down. ' +
      'The engine clamps the entry into the relief band, so you cannot set a target the safeties ' +
      'would immediately fight.', CI, '5.1a'),

    imro8ymb0jw: e('Pressurizer Spray',
      'Cold-leg water sprayed into the steam space — the way you LOWER primary pressure.',
      'AUTO sprays when pressure is above the setpoint band; MANUAL opens the valve to the percentage ' +
      'you set; OFF shuts it. Spray needs RCP flow to work — the driving head comes from the pump, so ' +
      'with the pumps stopped the spray does nothing. A spray valve stuck open depressurizes ' +
      'continuously.', CI, '5.3'),
    imro8zestdm: e('AUTO (spray)',
      'Spray follows the pressure controller — opens above the setpoint band.',
      'The normal lineup at power, and the half of pressure control that fights a pressure rise. ' +
      'Paired with the heaters in AUTO it holds the plant inside a narrow band around the setpoint.', CI, '5.3'),
    imro900yzeq: e('MANUAL (spray)',
      'Spray valve holds the percentage you set.',
      'Use it to bring pressure down deliberately — during a cooldown, or to restore the pressure ' +
      'band after heater overshoot. Return to AUTO once you are on target; manual spray with no ' +
      'attention is how plants overshoot into low-pressure alarms.', CI, '5.3'),
    imro901sddd: e('OFF (spray)',
      'Spray valve shut.',
      'The correct setting whenever you want pressure to rise, and the first thing to check if ' +
      'pressure is falling with no obvious leak.', CI, '5.3'),
    imro929i738: e('Spray valve %',
      'Spray valve position demand, 0–100 %. Typing here takes spray to MANUAL.',
      'Spray flow is proportional to this only while the RCPs are running. With no forced flow the ' +
      'valve opens and nothing happens — a genuine trap on a natural-circulation plant.', CI, '5.3'),

    pressurizer: e('Pressurizer',
      'The steam bubble that sets primary pressure. Water below, steam above, heaters and spray inside.',
      'Level here is inventory\'s most visible proxy, normally about 55 % at full power — but it is a ' +
      'proxy and it can lie: during a LOCA a void in the hot leg pushes water INTO the pressurizer, so ' +
      'level rises while the plant is emptying. That is the TMI-2 trap. The water colour tracks live ' +
      'saturation temperature at RCS pressure.', CI, '5.4'),
    ims5gq44zgr: e('Pressurizer Temperature',
      'Saturation temperature at current RCS pressure — how hot the pressurizer water is.',
      'Not a separate measurement: the pressurizer sits at saturation, so its temperature IS the ' +
      'saturation temperature of the pressure you are holding. It falls as the plant depressurizes ' +
      'and is the same source that colours the pressurizer water on the mimic.', CI, '5.0'),
    ims5gprvl7n: e('Heater Power',
      'Live heater output as a percentage — what the heaters are actually doing.',
      'This is the indication half of the heater panel: under AUTO it shows the controller\'s demand, ' +
      'under MANUAL it shows your setting. Read it against pressure trend to see whether the heaters ' +
      'are winning.', CI, '5.2'),

    // ------------------------------------------------------------ relief valves
    porv: e('PORV',
      'Power-operated relief valve — the pressurizer\'s controlled steam vent.',
      'Opens automatically near 2350 psi (16.20 MPa) and reseats about 2300 psi (15.86 MPa), relieving primary pressure ' +
      'into the relief line. The schematic shows TRUE disc position; the PORV status light beside it ' +
      'shows the COMMAND. At TMI-2 those two disagreed for over two hours — a stuck-open valve with a ' +
      'light reading closed drained the core.', CI, '6.1'),
    ims2jf7fv7m: e('PORV Status',
      'The PORV position light — it shows the COMMANDED position, not the disc.',
      'It reports what the valve was told to do, not what the disc did. A valve that fails to reseat ' +
      'leaves this reading CLOSED while steam keeps leaving the plant — so read it against what the ' +
      'plant is doing: pressure that will not come back up, and the tailpipe temperature next to it ' +
      'climbing. Indications and protection read instruments, not truth (HR1).', TMI, '4.0'),
    imrsgch20pv: e('PORV Tailpipe Temperature',
      'Discharge-line temperature downstream of the PORV — the tell that the valve is passing.',
      'A seated valve leaves the tailpipe at a leaky-seat baseline around 180 °F (82.2 °C); a passing ' +
      'valve cooks it toward 300 °F (148.9 °C) and it turns amber as it climbs. The TMI-2 crew had this reading and ' +
      'read it as normal residual heat. Compare it against the PORV light, never in isolation.', TMI, '4.0'),
    imrppb3kuav: e('PORV Block Valve',
      'Motor-operated isolation valve upstream of the PORV. Normally open.',
      'The recovery action when the PORV will not reseat: closing this stops all flow through the ' +
      'relief line even with the PORV stuck open. Closing it also removes the relief path, so ' +
      'pressure control falls to spray and the spring safeties — which this valve does NOT isolate. ' +
      'Two-press confirm on isolate.', CI, '6.2'),
    imrsi2svtgn: e('PORV Discharge',
      'Where the relief line goes — the pressurizer relief path downstream of the valves.',
      'The plant models the relief path, not a relief tank: there is no tank level or rupture disc ' +
      'here. What matters operationally is upstream — the tailpipe temperature and the block valve.', CI, '6.0'),

    // ------------------------------------------------------------- reactor / RCS
    reactorVessel: e('Reactor Vessel',
      'The core, its control rods and the coolant flowing through them.',
      'Coolant enters cold, is heated by fission and decay in the fuel, and leaves through the hot ' +
      'leg to the steam generator. The art is live: rod banks move with their groups, the water ' +
      'colour tracks leg temperatures, and bubbles appear when the core actually voids. Decay heat ' +
      'continues after a trip — a shut-down reactor still needs a heat sink.', CI, '4.0'),
    imrzl4b7g9m: e('Reactor Power',
      'Neutron power as a percentage of rated — the power-range instrument.',
      'The scale and the coloured bands follow WHICH POWER TRIP IS ARMED. Through a startup the ' +
      'power-range LOW SETPOINT trip sits at 25 %, so the meter reads to 27 % and shows green to ' +
      'P-10 (10 %), amber from there up to the trip, and red above — the amber band is the stretch ' +
      'you have to get the block in by, and above P-10 is the only place you are allowed to set it. ' +
      'Block it and the meter reopens to the at-power scale with the 120 % trip at the top — and the ' +
      '25 % band comes back the moment power falls under P-10 again, because the block reinstates ' +
      'itself down there. It measures FLUX, which leads thermal power — after a trip flux ' +
      'collapses while decay heat does not.', CI, '4.1'),
    imrobpq4a70: e('Reactor Coolant Pump',
      'The RCP — forced primary flow. One representative pump on this plant.',
      'Running, it circulates coolant through the core and steam generator and provides the driving ' +
      'head for pressurizer spray. Stopped, the plant falls back to natural circulation: flow drops, ' +
      'ΔT widens, and spray stops working. At power a loss of flow is an immediate trip condition.', CI, '8.1'),
    imrsjyqoq6t: e('RCP Control',
      'Start and stop the reactor coolant pump.',
      'ON starts the pump and clears an RCP trip failure; OFF secures it. Starting the RCPs is the ' +
      'first step of the Mode 5→3 heatup — pump heat alone will warm the plant. Do not stop them at ' +
      'power except under an emergency procedure.', CI, '8.1'),
    imrsjy1m9g: e('ON (RCP)',
      'Starts the reactor coolant pump.',
      'Also clears a previously injected RCP trip. Blocked while the station is blacked out — the ' +
      'pump needs AC power, which is exactly what a station blackout removes.', CI, '8.1'),
    imrsjy59pnu: e('OFF (RCP)',
      'Stops the reactor coolant pump.',
      'Deliberate on a cooldown (it decouples the steam generator once RHR is carrying the plant), ' +
      'catastrophic at power. Expect flow to coast down, ΔT to widen, and spray to stop working.', CI, '8.1'),
    imrr4fnxhlc: e('T-hot',
      'Hot-leg temperature — coolant leaving the core.',
      'The hotter half of the pair that makes Tavg and ΔT. It is the temperature closest to ' +
      'saturation, so it is the leg that flashes first when pressure falls — which is why subcooling ' +
      'margin is computed against it.', CI, '4.1'),
    imrr4g29a7c: e('T-cold',
      'Cold-leg temperature — coolant returning from the steam generator.',
      'Set by how much heat the secondary side is removing. On a load increase T-cold falls first, ' +
      'and the reactor answers through moderator feedback before you touch a rod.', CI, '4.1'),
    ims2kt7fu64: e('Surge Line Tee',
      'Where the pressurizer joins the hot leg — the surge line branch.',
      'Always open: this connection is how the pressurizer sees, and sets, RCS pressure. Surge flow ' +
      'in and out of it is what moves pressurizer level when the plant heats or cools.', CI, '5.0'),
    ims2k1rhzh3: e('Cold Leg — charging connection',
      'Where CVCS charging flow enters the cold leg.',
      'Make-up joins the reactor coolant here. The branch only animates when the charging pump is ' +
      'actually delivering — a secured pump leaves a still, empty branch rather than implying flow ' +
      'that is not there.', CI, '7.2'),
    ims2k3q7ehq: e('Cold Leg — letdown connection',
      'Where letdown leaves the cold leg for the CVCS.',
      'Letdown taps the cold leg and sends coolant to the letdown heat exchanger and volume control ' +
      'tank. Flow here is pressure-driven, so the branch quietens as the plant depressurizes.', CI, '7.3'),
    ims3x2n4o2p: e('Cold Leg — accumulator connection',
      'Where the accumulators discharge into the cold leg.',
      'Dry unless the accumulators are actually injecting — which happens on its own when cold-leg ' +
      'pressure falls below the check-valve setpoint. Nothing on the board commands it.', CI, '11.1'),
    ims3yt5oyp8: e('Cold Leg Cross — spray and ECCS',
      'The cold-leg junction that feeds pressurizer spray and takes ECCS injection.',
      'Two independent branches on one fitting: spray flows out to the pressurizer only when the ' +
      'spray valve is cracked, and ECCS flows in only when the pump is actually injecting. Each ' +
      'branch animates on its own system, so the board cannot imply injection that is not happening.', CI, '5.3'),

    // ------------------------------------------------------------------- CVCS
    ims3l6k3mb0: e('CVCS and Safety Injection Panel',
      'The four cards that own primary inventory: RHR, ECCS, charging and letdown.',
      'Inventory is a balance — charging in, letdown out, with ECCS and RHR as the emergency and ' +
      'shutdown-cooling paths on the same train. Grouped here because in practice you operate them ' +
      'against each other: what one adds, another removes.', CI, '7.0'),
    imrmslginf9: e('Charging',
      'The CVCS charging pump — make-up INTO the primary. Raises inventory and pressurizer level.',
      'AUTO runs the pump with inventory make-up modulating the flow; MAN runs it at the flow you set; ' +
      'OFF secures it. Charging is also the carrier for boron: a boration or dilution is only ' +
      'delivered while this pump runs. Normal band is 0–60 gpm (0–14 m³/h).', CI, '7.1'),
    imrmtg3r8ez: e('AUTO (charging)',
      'Charging pump runs with automatic inventory make-up.',
      'The controller modulates charging flow to hold inventory, which in practice holds pressurizer ' +
      'level against normal letdown. The everyday lineup at power.', CI, '7.4'),
    imrprbi6ui1: e('MAN (charging)',
      'Charging pump runs at the flow you set.',
      'You own the balance: set a charging flow against the letdown lineup and watch pressurizer ' +
      'level respond over minutes, not seconds.', CI, '7.4'),
    imrqn630s3b: e('OFF (charging)',
      'Stops the charging pump.',
      'Stops make-up AND stops any boron dose in progress — the dose pauses and resumes when the pump ' +
      'restarts. With letdown still lined up, securing charging is a net drain on the primary.', CI, '7.1'),
    imrpq48hn3t: e('Charging flow',
      'Charging flow setpoint — how fast make-up enters the cold leg.',
      'The normal make-up band runs to 60 gpm. Maximum charging is a lot of make-up: against an ' +
      'isolated letdown it raises pressurizer level about 33 % a minute, so from a normal 55 % it ' +
      'reaches the 97 % going-solid trip in a little over a minute. Against A+B letdown the same ' +
      'flow barely holds, losing about 0.7 % a minute. Typing here takes CVCS inventory control to ' +
      'manual.', CI, '7.2'),
    imrqp87ueqb: e('Charging Pump',
      'The positive-displacement pump that injects make-up into the primary.',
      'Drawn from the volume control tank, cold. Its art follows the pump\'s run state — the controls ' +
      'live on the CHARGING card rather than on the pump itself.', CI, '7.1'),
    ims3x01kvp4: e('Charging Pump Suction',
      'Where the charging pump takes suction — the volume control tank and the ECCS cross-tie.',
      'The cross-tie is why the CVCS and safety-injection trains appear on the same panel: they share ' +
      'water sources. The branch animates only when the pump is running.', CI, '7.1'),

    imrmslvu2c0: e('Letdown',
      'The letdown orifices — coolant OUT of the primary. Lowers inventory and pressurizer level.',
      'Two fixed orifices, each independently in or out, giving four lineups: CLOSED, A at about 3 %, ' +
      'B at about 4 %, A+B at about 7 % of rated. Flow is pressure-driven, not a throttled setpoint, ' +
      'so it tails off as RCS pressure falls during a cooldown. A+B uncompensated walks level down ' +
      'about 5 % a minute.', CI, '7.3'),
    imrmtin8wm3: e('CLOSED (letdown)',
      'Both orifices out — letdown isolated, no flow.',
      'The lineup for raising level quickly, and the automatic response to a low pressurizer level ' +
      '(17 %), which isolates letdown to protect inventory.', CI, '7.3'),
    imrmtimrch3: e('A 3% (letdown)',
      'Orifice A only — the smallest letdown lineup.',
      'Roughly 3 % of rated flow. Uncompensated by charging it walks pressurizer level down about ' +
      '2 % a minute — a controllable rate for trimming level.', CI, '7.3'),
    imrmtimhz4g: e('B 4% (letdown)',
      'Orifice B only — the middle letdown lineup.',
      'Roughly 4 % of rated flow. A and B are separate orifices, not a redundant pair: the point of ' +
      'having both is the four-step lineup they make together.', CI, '7.3'),
    imrmtimyxef: e('A+B 7% (letdown)',
      'Both orifices in — maximum letdown, a net drain against normal charging.',
      'About 7 % of rated flow, which exceeds normal charging: use it to reduce level or to ' +
      'depressurize the pressurizer deliberately, and watch it, because it will keep draining.', CI, '7.3'),
    imrmsjta95r: e('CVCS Flow Indications',
      'Letdown out, charging in, and the boron dose status — the primary inventory balance.',
      'Read as a pair: charging above letdown fills the plant, letdown above charging drains it, and ' +
      'pressurizer level is the slow integral of the difference. The boron status line tells you ' +
      'whether a dose is riding in on that charging flow.', CI, '7.0'),
    imrzp89wdfu: e('Letdown Flow',
      'Measured letdown flow — coolant leaving the primary.',
      'Pressure-driven flow: the number falls as RCS pressure falls, even with the same orifices ' +
      'lined up. Compare it against charging to know which way inventory is going.', CI, '7.3'),
    imrzp8qps6u: e('Charging Flow',
      'Measured charging flow — make-up entering the primary.',
      'What the pump is actually delivering, not what you asked for. If charging reads zero with the ' +
      'pump commanded on, the boron dose sitting on it is not being delivered either.', CI, '7.2'),

    // ------------------------------------------------------------------- boron
    imrmtlyf64y: e('Boron Control',
      'Sets the boron concentration target — the slow reactivity control. Borate down, dilute up.',
      'Raising the target BORATES (removes reactivity, adds shutdown margin); lowering it DILUTES ' +
      '(adds reactivity). Entering a target meters the change as a batch dose at about 0.05 ppm/s and ' +
      'stops itself on arrival. It needs the charging pump running to deliver. At full power dilution ' +
      'moves Tavg, not power — the reactor self-regulates back to rated.', CI, '7.5'),
    imrqp6com2b: e('ON (boron)',
      'Engages the boron channel — the target you set is delivered as a metered dose.',
      'The dose is stopped by a flow totalizer rather than by time, so it lands on the ppm you asked ' +
      'for without overshoot. Any change of target executes, however small.', CI, '7.5'),
    imrqp6avzkw: e('OFF (boron)',
      'Disengages the boron channel — no dose in progress.',
      'A running dose stops here; boron concentration stays wherever it got to. Direct borate/dilute ' +
      'commands from a procedure also take the channel out of automatic.', CI, '7.5'),
    imrpq29jo7t: e('Boron target',
      'Target RCS boron concentration in ppm. Setting it orders a batch dose.',
      'This is a target, not a measurement — there is no live boron meter in this control room, ' +
      'because real plants do not have one either. The authoritative number is the chemistry sample.', CI, '7.5'),
    ims3wy5oym4: e('Boron Status',
      'Whether a dose is running: BORATING, DILUTING or HOLD, with the ppm remaining.',
      'The arrow figure counts down the metered ppm still to deliver. It pauses if the charging pump ' +
      'stops and resumes when it restarts — a dose is a delivery, not a timer.', CI, '7.5'),
    bdBoronSample: e('SAMPLE',
      'Draws an RCS grab sample — the lab posts the authoritative boron concentration.',
      'Chemistry, not a gauge: the result arrives after a compressed ~60 s turnaround (real labs take ' +
      '30–60 minutes). Completed doses sample themselves; take a manual one when the books may be ' +
      'stale — after ECCS or accumulator injection, which borate the core outside the makeup system.', CI, '7.5'),
    ims2jva1ff5: e('CHEM Sample',
      'The lab result in ppm — the reference boron concentration.',
      'Reads SAMPLING… while the lab works, then posts the number. A fresh result with no dose ' +
      'running re-baselines the panel, so the next dose is computed from reality rather than from ' +
      'dose bookkeeping.', CI, '7.5'),

    // ---------------------------------------------------------- ECCS / SIT / RHR
    imrzpfd4qox: e('ECCS Control',
      'Starts, stops or arms emergency core cooling — high and low pressure injection on one train.',
      'START and STOP are manual operation; AUTO arms the system to actuate on its own when primary ' +
      'pressure falls to about 1799 psi (12.4 MPa). Manual action takes the system out of AUTO — press AUTO to ' +
      're-arm. The pump delivers a high-head trickle at operating pressure and real volume once the ' +
      'plant is below about 653 psi (4.5 MPa).', CI, '11.0'),
    imrldymb837: e('START (ECCS)',
      'Starts emergency injection by hand.',
      'Takes the system to MANUAL, which disarms the automatic actuation until you press AUTO again. ' +
      'On a small-break LOCA do not throttle injection just because pressurizer level is rising — ' +
      'check subcooling.', CI, '11.0'),
    imrldz0wqds: e('STOP (ECCS)',
      'Stops emergency injection by hand.',
      'Also takes the system to MANUAL. Stopping injection with subcooling eroding is the TMI-2 error ' +
      'in one button — the crew throttled injection on a rising level while the core was uncovering.', TMI, '5.5'),
    imrle1mc0lk: e('AUTO (ECCS)',
      'Arms automatic actuation on low primary pressure.',
      'Lit means armed and waiting. This is the standing lineup at power: the system does nothing ' +
      'visible until pressure falls to the actuation setpoint, and then it starts without being ' +
      'asked.', CI, '11.0'),
    ims3vqox0fc: e('ECCS Indications',
      'Injection flow, pump discharge pressure, and which alignment the train is in.',
      'One pump serves two suctions on this plant, so MODE is the readout that tells you what it is ' +
      'doing: HPI/LPI on the injection alignment, RHR when the hot-leg suction valve is open, OFF ' +
      'when it is neither.', CI, '11.0'),
    ims3w1cb6jc: e('ECCS Flow',
      'Emergency injection flow — a trickle at operating pressure, real volume once the plant is down.',
      'Not zero at operating pressure, which surprises people: the high-head segment still passes ' +
      'about 1.7 % of rated against 2235 psi (15.41 MPa), because its shutoff head is ' +
      '2384 psi (16.44 MPa). The curve is steep, so the number that matters arrives as the plant falls — near ' +
      '60 % of rated by 360 psi (2.48 MPa). That is what makes injection effective exactly when it is ' +
      'needed, and why a bare trickle here is not evidence the pump is failing.', CI, '11.0'),
    ims3w1lj7n6: e('ECCS Discharge Pressure',
      'Injection pump discharge pressure — the pump\'s head, not the plant\'s.',
      'A running pump against a closed system sits at its shutoff head. Discharge high with flow at ' +
      'zero means the pump is healthy and the plant is simply at higher pressure than it can inject ' +
      'against.', CI, '11.0'),
    ims3w61jjbi: e('ECCS Mode',
      'Which alignment the shared injection train is in: HPI, LPI, RHR or OFF.',
      'The single most useful ECCS readout on this plant, because one pump serves both the injection ' +
      'and the shutdown-cooling suctions. RHR here means the hot-leg suction valve is open and the ' +
      'system is carrying decay heat, not injecting.', CI, '11.2'),
    imrobnzlha1: e('ECCS Pump',
      'The emergency injection pump — drawn from the refuelling water storage tank, cold.',
      'A dedicated train, not the charging pump doing double duty, which is why ECCS and charging read ' +
      'on different flow scales. Its controls are on the ECCS card; the art follows delivery.', CI, '11.0'),

    imrppx5n1ay: e('Accumulators (SIT)',
      'Passive safety injection tanks — nitrogen-pressurized borated water. No pump, no command.',
      'They inject on their own when cold-leg pressure falls below the check-valve setpoint, and stop ' +
      'when they empty. Nothing on this panel starts them; the only operator action is the isolation ' +
      'valve. The water is cold and heavily borated, so a discharge cools Tavg as well as refilling ' +
      'the plant.', CI, '11.1'),
    imrppyp0wfo: e('Accumulator N₂ Pressure',
      'Cover-gas pressure in the accumulators — the driving head for passive injection.',
      'It falls as the tanks empty, because the nitrogen expands into the space the water leaves. ' +
      'A dash means the save predates the field rather than a pressure of zero.', CI, '11.1'),
    imrppztrng1: e('Accumulator Status',
      'ARMED, INJECTING or ISOLATED.',
      'ARMED is the normal standing state — lined up and waiting on pressure. ISOLATED means the ' +
      'discharge valve is shut and they cannot inject at any pressure, which is the correct lineup ' +
      'before a planned depressurization below the check-valve setpoint.', CI, '11.1'),
    imrpq0n2ujv: e('Accumulator Fill',
      'How much borated water is left in the tanks, as a percentage.',
      'A finite resource: once discharged they do not refill during the event. Watching this fall is ' +
      'watching a passive system spend itself.', CI, '11.1'),
    imrppxt2aqd: e('Accumulator Isolation Valve',
      'Motor-operated valve in series with the accumulator check valves. Normally open.',
      'Shut it before deliberately depressurizing below the check-valve setpoint on a normal cooldown, ' +
      'or the tanks will dump into a plant that does not need them. A shut valve blocks discharge at ' +
      'any pressure.', CI, '11.1'),

    ims3xf18pk8: e('RHR',
      'Residual heat removal — the shutdown cooling path. An alignment, not a separate pump.',
      'ALIGN opens the hot-leg suction valve and puts the shared train on decay-heat removal; ISOLATE ' +
      'shuts it; AUTO arms it to open itself after a trip once pressure allows. Two setpoints, not one: ' +
      'the valve will not open above 400 psi (2.76 MPa), and force-closes only if pressure comes back ' +
      'up past 600 psi (4.14 MPa) — the low-pressure piping cannot take RCS pressure. The gap between ' +
      'them is deliberate, so the valve does not chatter on a plant hunting around one number.', CI, '11.2'),
    ims3wg27iif: e('ALIGN (RHR)',
      'Opens the RHR hot-leg suction valve — puts the plant on shutdown cooling.',
      'Refused above the 400 psi (2.76 MPa) interlock; the button visibly fails to latch rather than lying about ' +
      'the lineup. Below it, aligning RHR is the step that carries the plant from Mode 4 to Cold ' +
      'Shutdown and holds it there.', MT, 'PWR-T21'),
    ims3xfeye1q: e('ISOLATE (RHR)',
      'Shuts the RHR suction valve — takes the train off shutdown cooling.',
      'Necessary before repressurizing: the interlock will force the valve shut anyway once you pass ' +
      '600 psi (4.14 MPa), but doing it deliberately is how a heatup starts.', MT, 'PWR-T20'),
    ims3xfl3xn6: e('AUTO (RHR)',
      'Arms the RHR valve to open itself when scrammed and pressure is below the interlock.',
      'Trimming the cooldown rate does NOT drop this arm — the rate knob is deliberately excluded from ' +
      'the commands that disarm it, so you can throttle the heat exchanger while RHR stays automatic.', CI, '11.2'),
    ims3xu86zm5: e('RHR HX Flow',
      'How much RHR flow goes through the heat exchanger rather than the bypass — the cooldown RATE knob.',
      'This sets cooling rate without disturbing inventory. Walk it up slowly: full heat-exchanger flow ' +
      'on a hot plant overshoots the 90 °F/h (50 °C/h) cooldown limit, and the primary temperature trend is the ' +
      'only rate instrument you have.', CI, '11.2'),

    // -------------------------------------------------- steam generator and feed
    steamGenerator: e('Steam Generator',
      'Where primary heat becomes steam — the plant\'s heat sink and the boundary between the loops.',
      'Primary water flows through the U-tubes; secondary water boils around them. The tube boundary ' +
      'is what keeps the two sides separate, and a tube rupture is what breaches it. Level, pressure ' +
      'and steam flow are the three numbers that say whether the heat sink is working.', CI, '9.0'),
    imrobjh73o5: e('Steam Generator Indications',
      'Steam temperature and steam flow at the generator outlet.',
      'Steam temperature is saturation at SG pressure — the secondary side boils, so pressure and ' +
      'temperature are the same measurement in two units. Steam flow is total draw from the ' +
      'generator, which is what feed has to match.', CI, '9.2'),
    imrr1gwi93j: e('SG Pressure',
      'Steam generator pressure — the secondary side\'s working pressure.',
      'About 819 psi (5.65 MPa) at full power. It rises when steam demand falls (a turbine trip bottles the ' +
      'generator) and falls when demand exceeds boiling. Its saturation temperature sets how much heat ' +
      'the primary can dump into it.', CI, '9.1'),
    imrr1hecwq7: e('Steam Temperature',
      'Saturation temperature at SG pressure — what the secondary side is boiling at.',
      'Not an independent measurement: on a boiling secondary side, temperature and pressure are one ' +
      'number. Its gap below T-hot is the temperature difference actually driving heat across the ' +
      'tubes.', CI, '9.1'),
    ims31ngjkf8: e('Steam Flow',
      'Total main-steam-line flow, on the same scale as feed flow — everything leaving the generator.',
      'Turbine plus steam dump plus any lifted safety, not turbine flow alone. Through a turbine trip ' +
      'the governor shuts and the dump opens, and this number barely moves — which is exactly why feed ' +
      'must follow it rather than the governor.', CI, '9.2'),

    imrqxsodu5j: e('Steam Generator Feed',
      'Main feedwater control — AUTO is the three-element controller, MAN is a fixed pump speed.',
      'AUTO regulates level on three inputs: level, steam flow and feed flow. MAN holds the speed you ' +
      'set, with no level feedback at all, which is safe only while you keep feed matched to steam. ' +
      'There is no speed that is safe at every power — matching flow is about 1000 gpm (227 m³/h) at full load ' +
      'and 50 gpm (11 m³/h) at 6 %.', CI, '9.2'),
    bdFeedStatus: e('SG FEED status',
      'What the feedwater controller is doing: HOLDING, SAT HI/LO, ISOLATED, MANUAL or OFF.',
      'The AUTO and MAN lamps tell you WHICH mode the controller is in; this tells you whether it is ' +
      'actually regulating. HOLDING (green) is the only state where level is being looked after for ' +
      'you. ISOLATED means the controller stood itself down because main feedwater shut — auxiliary ' +
      'feedwater has the generators and nobody is trimming level. SAT HI / SAT LO is the trap: the ' +
      'lamp still reads AUTO, but the pump is against a stop with no authority left to correct with, ' +
      'so level keeps going the way it is already going. Hover any feed control for the full ' +
      'sentence.', CI, '14.1'),
    // (A `bdRodStatus` entry stood here for the #306 rod status word, removed 2026-08-03 as
    // redundant against the IN-OUT lamps. This file is a THIRD independent copy of the
    // board's meaning — an orphan entry here describes an item nobody can click, which is
    // the rot `run_inspect` exists to catch, so it goes out with the item.)
    bdDtMargin: e('Core ΔT margin',
      'How much loop ΔT is left before the nearer of the two core-protection trips, and which one it is.',
      'The reactor has two trips computed from the temperature RISE across the core rather than from ' +
      'any single reading: OTΔT protects against departure from nucleate boiling, OPΔT against ' +
      'excessive heat rate in the fuel. Neither has a fixed setpoint — the trip line MOVES with ' +
      'average temperature and with reactor coolant pressure, so the same ΔT can be perfectly safe at ' +
      'one condition and a trip at another. That is exactly what no single-parameter gauge can show ' +
      'you, and it is why this number exists: it is the distance to whichever line is closer, so if it ' +
      'falls while ΔT holds steady, the LIMIT moved toward you. The name tells you which one is ' +
      'binding, and that is the diagnosis — OTΔT closing means you are heading toward boiling in the ' +
      'hot channel, OPΔT closing means the core is simply making more heat than it is rated for. It ' +
      'turns amber at the ROD STOP line, three percent out, where the plant refuses to withdraw rods ' +
      'any further and lights OTΔT or OPΔT ROD STOP on Panel A; insertion always works. Neither trip ' +
      'can be blocked.', CI, '9.0'),
    imrsgjmrjfg: e('AUTO (feed)',
      'Engages the three-element feedwater controller.',
      'It captures current level as its setpoint on engage, so engage it at a level you are happy to ' +
      'hold. This is the free-play default and the plant\'s real level backbone.', CI, '14.1'),
    imrsgjuh7l0: e('MAN (feed)',
      'Feed pump runs at the speed you set — no level feedback.',
      'A fixed-demand device: it does exactly what you asked and nothing else. Set it to match steam ' +
      'flow and level holds indefinitely; set it wrong and level ramps to a trip in whichever ' +
      'direction the error points.', CI, '9.2'),
    imrsgjwq1q0: e('OFF (feed)',
      'Stops main feedwater.',
      'Level then falls at whatever rate the generator is boiling. AFW is the backup path, and it ' +
      'auto-starts at about 20 % level if it is armed.', CI, '9.2'),
    imro8xhy2me: e('SG Feed Rate setpoint',
      'Commanded feed pump speed, shown as 0–1200 gpm (0–273 m³/h). Typing here takes feed to MANUAL.',
      'The scale is pump speed expressed as flow: 1200 gpm (273 m³/h) is 120 % speed. Arrows step by 20 gpm (4.5 m³/h). ' +
      'Compare your setting against the STEAM FLOW indication above — matching them is what stops ' +
      'level moving.', CI, '9.2'),
    imrsgkz4lq0: e('Feed Flow',
      'MEASURED feedwater flow — what is actually reaching the generator.',
      'Not pump demand. Through a feed pump trip the demand stays where you left it while this falls ' +
      'to zero, and that divergence is the point of having both numbers on the card.', CI, '9.2'),
    ims3wm0d0bu: e('Steam Flow',
      'Total steam leaving the generator, on the same scale as feed flow.',
      'Deliberately stacked above FEED FLOW so matching them in MANUAL is a visual comparison rather ' +
      'than arithmetic. Feed below steam means level is falling, whatever level currently reads.', CI, '9.2'),
    imrobph7xrq: e('Feed Pump',
      'The main feedwater pump — secondary-side water back into the generator.',
      'Its speed is what the SG FEED card commands, and its discharge temperature tracks load because ' +
      'the feedwater heater train is warmed by turbine extraction steam.', CI, '9.2'),
    ims31q71cmu: e('Feedwater Junction',
      'Where main feed and auxiliary feed join on the way to the generator.',
      'Two separate trains, one line into the generator. The AFW branch animates only when AFW is ' +
      'actually delivering — pumps running behind a shut block valve deliver nothing.', CI, '10.0'),

    imrmssto6d: e('Auxiliary Feedwater',
      'The emergency feed path — starts, stops or arms AFW to the steam generator.',
      'AFW is the heat sink of last resort after main feed is lost. AUTO arms it to start on low SG ' +
      'level (about 20 %); manual action takes it out of AUTO. It delivers far less than main feed — ' +
      'enough to remove decay heat, not enough to run the plant.', CI, '10.0'),
    imrmsslj42u: e('START (AFW)',
      'Starts auxiliary feedwater by hand.',
      'Takes AFW to MANUAL. Verify the level actually responds: run lights show pump DEMAND, and a ' +
      'shut block valve leaves them lit with no water reaching the generator.', CI, '10.0'),
    imrmssoa137: e('STOP (AFW)',
      'Stops auxiliary feedwater and disarms the auto-start.',
      'This is why the status readout distinguishes SECURED from STANDBY: a stopped AFW that is still ' +
      'armed will come back on its own, and one that is secured will not.', CI, '10.0'),
    imrmssr9ihq: e('AUTO (AFW)',
      'Arms AFW to auto-start on low steam generator level.',
      'The standing lineup at power — armed and idle. It is what makes a loss of main feed survivable ' +
      'without operator action for the first minutes.', CI, '10.0'),
    ims2k81zwi8: e('AFW Indications',
      'Auxiliary feed flow and pump discharge pressure.',
      'Read them together. Discharge at shutoff head with flow at zero is a pump running against a ' +
      'shut valve — the TMI-2 lineup, where the AFW block valves were closed and the crew had run ' +
      'lights but no water.', TMI, '4.0'),
    imrmstovyli: e('AFW Flow',
      'Measured auxiliary feed flow — what AFW is actually delivering.',
      'The honest number in the AFW system: it reads what is being delivered, not what was demanded. ' +
      'If this is zero with the pump running, water is not reaching the generator.', CI, '10.0'),
    imrmsu1bl4r: e('AFW Discharge Pressure',
      'AFW pump discharge pressure — read it against AFW FLOW, never alone.',
      'A pump with nowhere to send water pins at its shutoff head — around 1500 psi (10.34 MPa). High discharge ' +
      'with zero flow is the signature of a shut block valve.', CI, '10.0'),
    ims3xw3vue6: e('AFW Status',
      'RUNNING, STANDBY or SECURED.',
      'RUNNING reads pump demand, not delivery — deliberately, because that is the divergence the ' +
      'TMI-2 lesson turns on. STANDBY means armed and waiting for a low-level signal; SECURED means ' +
      'stopped and disarmed.', TMI, '4.0'),
    imrpp2g2m8k: e('AFW Block Valve',
      'The AFW discharge valve — independent of the pump start/stop buttons.',
      'Shut it with the pumps running and you recreate TMI-2: run lights on, discharge pressure at ' +
      'shutoff, and no water reaching the generator. It is the valve the 1979 crew found closed eight ' +
      'minutes into the accident.', TMI, '2.0'),

    // -------------------------------------------------------- steam and turbine
    imrpp99kx2y: e('MSIV',
      'Main steam isolation valve — the steam path from generator to turbine and dump.',
      'Open is the normal lineup. Closing isolates main steam: the turbine trips, the generator ' +
      'bottles up toward its safeties, and with feed lost the level can drain to a trip. As a casualty ' +
      'response it terminates a steam line break DOWNSTREAM of the valve — a break between generator ' +
      'and valve has no isolation on this single-generator plant. Two-press confirm.', CI, '9.2'),
    imrop5ouw7h: e('Steam Dump',
      'Dumps steam straight to the condenser, bypassing the turbine — the secondary heat sink.',
      'AUTO holds SG pressure at the dump setpoint; OPEN and CLOSE take it manual. The dump is what ' +
      'carries the plant after a turbine trip, and lowering its setpoint is how you cool the primary ' +
      'through the steam generator on a controlled cooldown.', CI, '12.3'),
    imrppqg6mcc: e('AUTO (steam dump)',
      'Dump follows SG pressure toward the dump setpoint.',
      'At power the generator sits about 819 psi (5.65 MPa) against a setpoint near 1194 psi (8.23 MPa), which is why the ' +
      'dump is shut: there is nothing to relieve. Drop the setpoint below actual pressure and it ' +
      'opens.', CI, '12.3'),
    imrppquqg16: e('OPEN (steam dump)',
      'Opens the dump manually.',
      'Fast secondary heat removal, at the cost of dumping steam that is not making electricity. It ' +
      'cools the primary — watch Tavg and the cooldown rate.', CI, '12.3'),
    imrppqxggbj: e('CLOSE (steam dump)',
      'Shuts the dump manually.',
      'Stops secondary heat removal through the bypass path. On a plant with the turbine offline, ' +
      'closing the dump with no other sink is how SG pressure climbs to the safeties.', CI, '12.3'),
    ims31tq7mgc: e('Dump Setpoint',
      'The SG pressure the AUTO dump holds.',
      'The cooldown handle: lower it and the dump vents the generator, pulling primary temperature ' +
      'down through the tubes; raise it back toward the no-load point on a heatup. The engine clamps ' +
      'the entry into the SG safety band.', MT, 'PWR-T21'),
    imrppq5r7kw: e('Dump Status',
      'NORMAL, DUMPING or MANUAL.',
      'NORMAL means the dump is in automatic and has nothing to do. DUMPING means it is passing steam. ' +
      'MANUAL means you own it, whatever pressure does.', CI, '12.3'),
    imrzmlyafa3: e('Steam Dump Position',
      'Dump valve position on a 0–100 % scale — but 40 % is the stop, because that is the whole dump capacity.',
      'A turbine trip drives it straight to that stop. It sits pinned at 40 % for about a minute while ' +
      'stored heat comes off, then backs down as decay heat falls — near 9 % three minutes in, 7.5 % ' +
      'after ten. Forty per cent is a real Westinghouse capacity, not a limitation of the model, which ' +
      'is why a full load rejection needs a rod step as well as the dump. Pinned at 40 % with SG ' +
      'pressure still climbing means the dump has run out and the safeties are next. Read it beside ' +
      'STEAM FLOW to see where the steam is going.', CI, '12.3'),
    imrprmm4u5q: e('Steam Dump Valve',
      'The bypass valve itself — steam from the main line to the condenser.',
      'Position follows the dump command. Its schematic fills and animates only when it is actually ' +
      'passing steam.', CI, '12.3'),
    imrr45syy4v: e('Turbine Control Valve',
      'The governor valve — how much steam the turbine is allowed to take.',
      'Position IS the turbine\'s load command. A tripped or unloaded turbine shuts it to a crack, so ' +
      'the inlet line goes still even though the valve is not fully closed.', CI, '12.4'),

    imro8k5pzem: e('Turbine-Generator',
      'The load station: FOLLOW, MAN or OFF, plus the MWe target the machine holds.',
      'FOLLOW makes electrical load track reactor power with about a 45-second lag; MAN holds the MWe ' +
      'you set; OFF disconnects from the grid. Both FOLLOW and MAN bring the machine online — they ' +
      'clear a prior trip or disconnect if condenser vacuum permits.', CI, '12.1'),
    imro8ktzs3u: e('FOLLOW',
      'Turbine load tracks reactor power automatically.',
      'The normal at-power lineup. It connects the grid as well as selecting the mode, which is why ' +
      'it works after an OFF: selecting a load mode alone never un-trips a machine.', CI, '12.1'),
    imro8lddxi: e('MAN',
      'You set the electrical load target; the turbine holds it.',
      'Load becomes a demand on the reactor rather than a consequence of it. Raise load and steam ' +
      'draw rises, T-cold falls, and the reactor answers through moderator feedback before you touch ' +
      'a rod.', CI, '12.2'),
    imro8len0oi: e('OFF',
      'Disconnects the turbine from the grid — a planned offline, not a trip.',
      'Load goes to zero and the steam dump takes over the generator\'s output. The lamp reads the ' +
      'actual offline state, so it lights for both a planned disconnect and a trip.', CI, '12.1'),
    imro8rmka2y: e('Generator Load',
      'Electrical load target in MWe, up to about 100 MWe rated. The plant will drive this number down itself if the core gets close to a ΔT limit.',
      'Setting a target forces MANUAL mode. Raise load before, or together with, adding reactivity — ' +
      'load and reactor power have to move together or Tavg walks off program. ' +
      'AND THE PLANT CAN MOVE THIS NUMBER WITHOUT YOU: if the core ΔT margin falls to the rod stop, ' +
      'a turbine runback starts walking load down and keeps walking it down until the margin ' +
      'recovers — so if you see the target falling on its own, check the ΔT margin on the NIS card ' +
      'and the OTΔT / OPΔT ROD STOP annunciators. It is not reducing reactor power directly; it is ' +
      'reducing LOAD, and the reactor follows the load down on its own through the moderator ' +
      'coefficient. That is why it works, and also why it is not instant. Type a higher number and ' +
      'it will be walked back down while the condition stands — fix the condition, not the number.', CI, '12.2'),
    turbineGenerator: e('Turbine and Generator',
      'Steam turbine driving the generator — where thermal power becomes electrical power.',
      'Steam admitted through the governor valve turns the rotor; the generator converts that to ' +
      'megawatts on the grid. Blade motion tracks shaft speed (~1800 rpm when synchronized), so after ' +
      'a trip or planned offline you can watch it coast down rather than freeze.', CI, '12.0'),
    imrppee04aj: e('Turbine RPM',
      'Turbine shaft speed.',
      'About 1800 rpm class when synchronized. On a trip it coasts down rather than stopping — the ' +
      'rotor carries a great deal of energy.', CI, '12.4'),
    imrppeh5hkb: e('Generator Output',
      'Gross electrical output in MWe.',
      'The plant\'s product, and the honest measure of how much heat the secondary side is removing. ' +
      'It is also the number the grid sees, so a load rejection is this number going away suddenly.', CI, '12.4'),
    imrppej8ulo: e('Governor Valve',
      'Steam admission valve position, 0–100 %.',
      'The turbine\'s throttle. It shuts on a trip and opens to take load; watching it against steam ' +
      'flow tells you whether the turbine or the dump is carrying the generator.', CI, '12.4'),

    // ------------------------------------------------------------- condenser
    condenser: e('Condenser',
      'Condenses turbine exhaust back to water under vacuum — the secondary side\'s cold end.',
      'The vacuum is what makes the turbine efficient: the lower the backpressure, the more work the ' +
      'steam does. Losing vacuum trips the turbine. The hotwell it collects into is the suction for ' +
      'the condensate pump.', CI, '13.0'),
    imrqzuhzre3: e('Condenser Vacuum',
      'Condenser vacuum — turbine backpressure.',
      'Deep vacuum is healthy. It degrades when circulating water warms or cooling is lost, and the ' +
      'turbine trips at the low-vacuum setpoint. It is also a slow instrument — about a 5-second lag.', CI, '13.0'),
    ims3v3lpw5v: e('Condenser Cooling',
      'Circulating water temperature and the vacuum it produces.',
      'Paired deliberately: circulating-water temperature is the variable that MOVES vacuum. Warmer ' +
      'water means the condenser can only pull down to a warmer saturation, so vacuum falls, output ' +
      'falls at the same steam flow, and the turbine trip gets closer.', CI, '13.0'),
    ims3v42jghn: e('CW Inlet Temperature',
      'Circulating-water inlet temperature — the ultimate heat sink\'s temperature.',
      'Raise it and vacuum falls, output falls, and the RHR heat exchanger\'s sink gets warmer too, so ' +
      'a Mode 5 cooldown bottoms out higher. It is the one number here that represents the weather.', CI, '13.0'),
    ims3xp168iy: e('Condenser Vacuum',
      'Condenser vacuum, beside the water temperature that drives it.',
      'The same instrument as on the condenser itself, repeated here so cause and effect sit together ' +
      'on one card.', CI, '13.0'),
    coolingTower: e('Cooling Tower',
      'Rejects the plant\'s waste heat to atmosphere — the end of the line for every joule.',
      'Roughly two thirds of the reactor\'s thermal power leaves here rather than through the ' +
      'generator; that is thermodynamics, not inefficiency in this plant. The plume follows heat ' +
      'load.', CI, '13.0'),
    imrqvzbd9hd: e('Condensate Pump',
      'Takes suction on the condenser hotwell and returns water to the feed train.',
      'The first pump in the secondary loop\'s return path. It has no board control — it runs with the ' +
      'plant.', CI, '13.0'),
    imrqrnclhn: e('Condensate Polisher',
      'Cleans condensate before it returns to the steam generator.',
      'Secondary chemistry protects the steam generator tubes from corrosion. There is no polisher ' +
      'model here, so the readout reports the one thing that IS modelled — whether condensate is ' +
      'flowing through it.', CI, '13.0'),
    imrqrouhrdr: e('Polisher Status',
      'IN SERVICE when condensate is flowing through the polisher, STANDBY when it is not.',
      'Deliberately not a resin-condition readout: the plant does not model polisher chemistry, and a ' +
      'hard-coded NORMAL would be an instrument that cannot ever tell you anything.', CI, '13.0'),

    // ------------------------------------------------- vital parameter tile strip
    ims2immk7ks: e('Average Coolant Temperature',
      'Tavg — the average of hot and cold leg. The plant\'s thermal state in one number.',
      'Tavg is programmed against load: it is what the rod controller holds and what tells you ' +
      'whether reactor power and turbine load are matched. The coloured bands behind the trace are ' +
      'the live alarm and trip setpoints, so the tile agrees with the annunciator.', CI, '4.1'),
    ims2immsvn6: e('Primary Pressure',
      'RCS pressure — normally about 2235 psi (15.41 MPa) at power.',
      'Pressure keeps the coolant liquid. Read it with temperature rather than alone: the same ' +
      'pressure is comfortable at 550 °F (287.8 °C) and boiling at 620 °F (326.7 °C), which is what the subcooling margin ' +
      'tile computes for you. The bands follow the protection that is actually in force: at power ' +
      'the low-pressure reactor trip sits at 1800 psi (12.41 MPa) in red, but on a depressurized plant the P-11 ' +
      'permissive has BLOCKED that trip and the SI signal with it, so the low band goes away, the ' +
      'tile reads LO TRIP BLKD and rescales to the pressure you are actually holding on heaters. ' +
      'Pressurize past 1972 psi (13.60 MPa) and the block reinstates itself and the red band comes back. This ' +
      'is why a cold plant at 363 psi (2.50 MPa) reads green and a LOCA at 363 psi (2.50 MPa) reads hard red — same ' +
      'number, opposite meanings, and the difference is which trips are armed.', CI, '5.1'),
    ims2immxl2s: e('Subcooling Margin',
      'How far the coolant is from boiling. The primary accident diagnostic.',
      'It combines pressure and temperature into the one question that matters during a LOCA: is the ' +
      'coolant still liquid? Green is healthy, amber is approaching saturation, and below zero the ' +
      'core is boiling. Do not throttle injection while this is eroding, whatever pressurizer level ' +
      'says.', TMI, '4.0'),
    ims2immon9z: e('Pressurizer Level',
      'Water level in the pressurizer — the usual inventory proxy, and the one that can lie.',
      'About 55 % at full power, controlled by charging and letdown. During a LOCA it can RISE while ' +
      'the plant empties, because voiding in the hot leg pushes water into the pressurizer. Confirm ' +
      'inventory against subcooling before you believe it.', TMI, '4.0'),
    ims2imn1nny: e('Steam Generator Level',
      'Narrow-range SG level — the heat sink, and the fastest way to lose one.',
      'About 65 % nominal. The ladder above and below matters: AFW auto-starts at 20 %, the reactor ' +
      'trips at 17 %, and at 90 % you get a turbine trip and feed isolation. On a fast load change ' +
      'indicated level briefly moves the WRONG way (shrink and swell) — do not chase it.', CI, '9.1')
  };

  // ==================================================================== ALIASES
  // A caption that sits OUTSIDE any card frame describes the reading beside it,
  // but containment cannot see that — the label's centre is in no box, so it
  // would resolve to nothing. Point it at the item it labels rather than
  // duplicating the copy. (Captions inside a card need no alias: they inherit
  // the card, which is the right answer.)
  var ALIASES = {
    imrshokxy4u: 'imro6rdwwdn',         // "REACTIVITY" caption on the mimic → the reactivity readout
    ims5gp0aicx: 'ims5gq44zgr',         // "PZR TEMP" caption beside the pressurizer
    ims5gpdv96m: 'ims5gprvl7n'          // "HTR PWR" caption beside the pressurizer
  };

  // ================================================================ containment
  // Item -> the smallest box item that geometrically contains its centre. Built
  // once, lazily, from the generated doc: the DOM cannot answer this (tiles are
  // absolutely-positioned siblings), and hard-coding parents would rot on the
  // next re-export while the geometry stays true by construction.
  var parent = null;
  function build() {
    if (parent) return parent;
    parent = {};
    var G = (typeof window !== 'undefined' ? window : globalThis);
    var doc = G.RD_PWR_BOARD_DOC;
    if (!doc) return parent;                 // board data not loaded — no fallback
    var items = (doc.items || []).slice();
    var extra = (RD.PwrBoardDriver && RD.PwrBoardDriver.extraItems) ? RD.PwrBoardDriver.extraItems() : [];
    items = items.concat(extra || []);
    var boxes = items.filter(function (i) { return i.kind === 'box'; });
    items.forEach(function (it) {
      var cx = it.left + (it.width || 0) / 2, cy = it.top + (it.height || 0) / 2;
      var best = null;
      boxes.forEach(function (b) {
        if (b.id === it.id) return;
        if (cx < b.left || cx > b.left + b.width || cy < b.top || cy > b.top + b.height) return;
        if (!best || (b.width * b.height) < (best.width * best.height)) best = b;
      });
      if (best) parent[it.id] = best.id;
    });
    return parent;
  }

  // ======================================================================= API
  RD.PwrBoardInspect = {
    // The entry an item shows, following containment when it has none of its own.
    // `inherited` is true when the text describes the CARD rather than the item —
    // the UI says so, so a group summary is never mistaken for a per-item one.
    entry: function (id) {
      if (!id) return null;
      if (ALIASES[id] && ITEMS[ALIASES[id]]) id = ALIASES[id];
      if (ITEMS[id]) return { title: ITEMS[id].title, brief: ITEMS[id].brief, detail: ITEMS[id].detail,
                              doc: ITEMS[id].doc, sec: ITEMS[id].sec, inherited: false, id: id };
      var p = build(), seen = {}, cur = p[id];
      while (cur && !seen[cur]) {
        seen[cur] = 1;
        if (ITEMS[cur]) return { title: ITEMS[cur].title, brief: ITEMS[cur].brief, detail: ITEMS[cur].detail,
                                 doc: ITEMS[cur].doc, sec: ITEMS[cur].sec, inherited: true, id: cur };
        cur = p[cur];
      }
      return null;
    },
    // Entry authored for this exact id (no containment walk) — used by the gates.
    own: function (id) { return ITEMS[id] || null; },
    ids: function () { return Object.keys(ITEMS); },
    aliases: function () { return ALIASES; },
    parentOf: function (id) { return build()[id] || null; }
  };

  // Node (test/run_inspect.js) reaches the registry the same way the browser does,
  // through globalThis.RD — no module exports (CLAUDE.md, "Code conventions").
})();
