/*
 * pwr_tmi2_common.js — the SINGLE master event timeline for the three-part
 * TMI-2 training module (Blueprint/M5 TMI2 Scenario Spec §2). Parts 1 and 3
 * play it blind (Realistic synoptic); Part 2 replays it with the truth showing
 * (Learning synoptic + physics overlay). The dialogue differs per part; the
 * physics choreography below is shared and MUST NOT be forked (Spec §9).
 *
 * Probed on the full stack (seed 42, 2026-07-08) — all trigger values below
 * are calibrated, not guessed:
 *   T+0    loss_of_feedwater injected (condensate polisher story beat).
 *          afw_failure is active from SCENARIO START (setup_commands): the
 *          discharge valves were tagged shut LAST SHIFT — true to history,
 *          and it lets Part 3's tag-pull clear it at any moment.
 *   T+~5   SG LVL LO alarm; M4 auto-starts AFW → pump demand latches, run
 *          lights read RUNNING, zero flow behind the shut valves.
 *   T+~14  scram on low SG level (this sim's trip path; 1979 tripped on high
 *          pressure — Part 2 owns that honesty note). The scram beat opens
 *          the PORV (the sim's lumped model makes no spike, so the scenario
 *          enacts the historical lift; the indicator honestly shows OPEN).
 *   +12 s  the "reseat" moment: close_porv is commanded and stuck_porv_open +
 *          porv_indicator_stuck_closed are injected in the same beat — the
 *          demand light goes dark exactly as the 1979 solenoid signal did.
 *   T+~40  subcooling_low; auto-HPI at 11.03 MPa (T+~45).
 *   T+~55  PZR LVL HI — the "going solid" read; the historical crew secured
 *          HPI here. PZR level then pegs 100 % while the core drains.
 *   T+~485 AFW discovery (historical ~8 min): clear afw_failure — flow
 *          resumes on the latched pump demand.
 *   T+~21m fuel passes 1300 °C (fuel_damaged latched at 1200) — the Part 1
 *          identification anchor. Isolation + HPI at this point recovers the
 *          plant fully (probed): stabilized, core damaged.
 *   Recovery: block valve closed → subcooling restored within seconds,
 *          pressure re-seats at 15.41 MPa. HPI-only (valve never closed)
 *          holds the core safe indefinitely but never restores subcooling.
 *
 * Attaches RD.TMI2 (physics fragments, calibrated triggers, shared lead-in
 * dialogue for the Part 1 / Part 3 parity rule — Spec §6).
 */
;(function (RD) {
  'use strict';

  var TMI2 = {};

  // ---------------------------------------------------------- physics fragments
  // Spread into per-part beats: Object.assign({id, trigger, dialogue}, PHYS.x).
  TMI2.PHYS = {
    // The AFW discharge valves went shut with the surveillance test last shift.
    setup: [{ action: 'inject_failure', failure_id: 'afw_failure' }],
    // T+0 — condensate polisher → condensate pumps → feed pumps → turbine.
    lofw: { inject_failures: ['loss_of_feedwater'] },
    // The trip transient lifts the PORV (enacted; the indicator shows OPEN).
    porvLift: { commands: [{ action: 'open_porv' }] },
    // The reseat that never happened: the close SIGNAL goes out (light off),
    // the valve stays open, and the indicator is locked on the signal.
    porvStick: {
      inject_failures: ['stuck_porv_open', 'porv_indicator_stuck_closed'],
      commands: [{ action: 'close_porv' }],
    },
    // The historical error — securing High-Pressure Injection on the rising
    // pressurizer level.
    hpiSecure: { commands: [{ action: 'set_hpi', active: false }] },
    // Restoring injection after the player has already isolated the relief path
    // by hand (Part 1 guided recovery) — the block valve is the player's action;
    // this just confirms full-flow injection back in service.
    hpiRestore: { commands: [{ action: 'set_hpi', active: true }] },
    // The 8-minute AFW discovery: valves reopened; latched pump demand
    // delivers flow immediately.
    afwRestore: { clear_failures: ['afw_failure'] },
    // The terminating action: isolate the relief path, restore injection.
    isolate: { commands: [{ action: 'close_block_valve' }, { action: 'set_hpi', active: true }] },
  };

  // ---------------------------------------------------------- calibrated triggers
  TMI2.TRIG = {
    scram:          { type: 'scram' },
    reseatMoment:   { type: 'delay', value: 12.0 },              // PORV open ~12 s (historical 13)
    subcoolAlarm:   { type: 'alarm', alarm_id: 'subcooling_low' },
    hpiAuto:        { type: 'true_state', field: 'hpi_active', direction: 'is_true' },
    pzrLevelHigh:   { type: 'alarm', alarm_id: 'pzr_level_high' },
    afwDiscovery:   { type: 'delay', value: 355.0 },             // ≈ T+8 min from the HPI beat
    identification: { type: 'true_state', field: 'fuel_temp_c', direction: 'above', value: 1300.0 },
    subcoolRestored:{ type: 'instrument', instrument: 'subcooling_margin', direction: 'above', value: 11.1 },
    isolated:       { type: 'true_state', field: 'block_valve_open', direction: 'is_false' },
    fuelDamaged:    { type: 'true_state', field: 'fuel_damaged', direction: 'is_true' },
  };

  // ---------------------------------------------------------- shared lead-in
  // Spec §6 baseline-parity rule: Part 3's lead-in dialogue is IDENTICAL to
  // Part 1's up to the first possible deviation. One copy, used by both.
  // Speakers: sup / supx (reacting) / aux / sys / player / chief.
  TMI2.LEADIN = {
    open: [
      { speaker: 'sup',
        learning: 'Morning. Or whatever you call four o\'clock. Coffee\'s on the hot plate, log\'s on the desk. Unit\'s at full power, steady as she goes — been a quiet one.',
        industry: 'Morning. 04:00, unit at 100 % steady-state, no evolutions in progress. Log\'s current. Quiet watch so far.' },
      { speaker: 'aux',
        learning: 'Quiet\'s the word. I\'ve walked the turbine deck twice just to stay awake. Marty, by the way — I don\'t think we\'ve shared a shift before.',
        industry: 'Concur — two turbine-deck tours completed, nothing to report. Marty. Don\'t believe we\'ve stood a watch together.' },
      { speaker: 'sup',
        learning: 'He\'s good people. Alright — turnover, so you\'re not flying blind. Take a look at the board while I run it down.',
        industry: 'He\'s solid. Turnover items, then the board is yours to watch.' },
    ],
    turnover: [
      { speaker: 'sup',
        learning: 'Off-going shift finished the surveillance test on the emergency feedwater system — that\'s the backup pumps that feed the steam generators if the normal feed ever quits. Paperwork\'s signed off. There\'s still a maintenance tag hanging down on that train from the test.',
        industry: 'Off-going crew completed the AFW surveillance — Auxiliary Feedwater, the emergency feed train. Test is signed off. A clearance tag is still hung on the train from the lineup.' },
      { speaker: 'aux',
        learning: 'Saw it on my tour. Tag\'s theirs, not ours. I left it be.',
        industry: 'Sighted it on tour. Their clearance, not ours — left it hung.' },
      { speaker: 'sup',
        learning: 'Right answer. Beyond that: condensate polishers have been fussy all week — the water-cleanup beds on the feed system. Day shift\'s been babying them. And that\'s honestly the whole list.',
        industry: 'Correct. Other item: condensate polishers have been temperamental all week — day shift has been cycling them by hand. That\'s the extent of the turnover.' },
    ],
    smalltalk: [
      { speaker: 'aux',
        learning: 'Fussy polishers and a signed-off test. If that\'s the worst this shift has, I\'ll take it.',
        industry: 'Polishers and closed paperwork. Acceptable problem set for a mid-shift.' },
      { speaker: 'sup',
        learning: 'Careful. Shifts hear that kind of talk.',
        industry: 'Don\'t advertise a quiet board. It listens.' },
      { speaker: 'aux',
        learning: 'Superstition, boss. This plant doesn\'t know what time it is. So — you follow the game last night, or were you asleep by the third inning like always?',
        industry: 'Noted, boss. Superstition regardless. Catch the game last night, or asleep by the third inning again?' },
      { speaker: 'sup',
        learning: 'Fourth inning, thank you. And it was a rerun of a loss, so I regret nothing. Top off your coffee — we\'ll do the panel checks at the top of the hour.',
        industry: 'Fourth inning. It was a losing rerun — no regrets. Panel checks at the top of the hour; square your coffee away first.' },
    ],
  };

  // ---------------------------------------------------------- shared event dialogue
  // The accident-sequence exchanges are identical in Parts 1 and 3 up to the
  // moment the player deviates (Spec §6 parity rule) — single-sourced here.
  // `throttlePrefix` is everything up to the supervisor's decision; each part
  // appends its own final line (Part 1: he acts; Part 3: he orders YOU).
  TMI2.EVENTS = {
    lofw: [
      { speaker: 'sys',
        learning: '*BUZZER* — CONDENSATE POLISHER TROUBLE · CONDENSATE PUMPS TRIP · FEEDWATER PUMPS TRIP · TURBINE TRIP',
        industry: '*BUZZER* — COND POLISHER TROUBLE · COND PUMPS TRIP · FW PUMPS TRIP · TURB TRIP' },
      { speaker: 'aux',
        learning: '—whoa. There go the polishers. Condensate pumps dropped… and the feed pumps followed them. Turbine\'s tripping.',
        industry: '—polishers. Condensate pumps tripped… feed pumps followed. Turbine trip.' },
      { speaker: 'sup',
        learning: 'And there\'s the excitement. Alright, no drama — we just lost normal feedwater. The plant knows this one: emergency feed pumps start themselves, reactor rides it out or trips. Watch the steam generator levels — that\'s the water boiling away on the secondary side.',
        industry: 'Loss of main feedwater. Trained sequence — AFW auto-starts, reactor trips on SG level if it gets there. Watch SG levels.' },
    ],
    cascade: [
      { speaker: 'sys',
        learning: '*BUZZER* — STEAM GENERATOR LEVEL LOW',
        industry: '*BUZZER* — SG LVL LO' },
      { speaker: 'aux',
        learning: 'Emergency feedwater pumps are up — both showing RUNNING. Generator levels still dropping, though. Dropping fast.',
        industry: 'AFW pumps running — both trains. SG levels still falling, fast.' },
      { speaker: 'sup',
        learning: 'They\'ll catch it. Boilers are small on the water side; they always look dramatic for a minute.',
        industry: 'AFW will arrest it. OTSG secondary inventory is small — steep-looking start is normal.' },
    ],
    scram: [
      { speaker: 'sys',
        learning: '*HORN* — REACTOR TRIP · STEAM GENERATOR LEVEL CRITICAL LOW',
        industry: '*HORN* — REACTOR TRIP · SG LVL LO LO' },
      { speaker: 'sup',
        learning: 'Reactor trip. Rods are in — chain reaction\'s done. Textbook so far: the plant protected itself, exactly like the simulator drills. What\'s left in the core now is decay heat — a few percent of full power that doesn\'t switch off, so we keep cooling it.',
        industry: 'Reactor trip, rods fully inserted. Per design. Load is decay heat now — cooling stays priority one.' },
      { speaker: 'sys',
        learning: '*chime* — PRESSURE RELIEF VALVE OPEN',
        industry: '*chime* — PORV OPEN' },
      { speaker: 'aux',
        learning: 'Relief valve\'s lifted off the top of the pressurizer — the power-operated relief valve, the PORV. Pressure spiked on the trip and it\'s burping it off.',
        industry: 'PORV lifted on the trip transient — relieving the pressure spike.' },
      { speaker: 'sup',
        learning: 'Also textbook. It opens, pressure comes down, it shuts. Machine\'s doing everything right.',
        industry: 'Designed response. It relieves, reseats on the close signal. Plant\'s performing to spec.' },
    ],
    reseat: [
      { speaker: 'aux',
        learning: 'Pressure\'s back under the reseat point… close signal\'s out — and the PORV light just went dark. Valve\'s shut.',
        industry: 'Pressure below reseat. Close signal sent — PORV light extinguished. Valve indicates shut.' },
      { speaker: 'sup',
        learning: 'Good. Log it: relief valve cycled on the trip, reseated clean.',
        industry: 'Log: PORV cycled on the transient, reseated.' },
      { speaker: 'aux',
        learning: 'You know that light\'s wired off the close *signal*, right? Solenoid, not the valve stem. Always thought that was a cheap way to build an indicator.',
        industry: 'For the record, that indication is off the solenoid demand, not stem position. Never loved that design.' },
      { speaker: 'sup',
        learning: 'Every plant I\'ve stood watch in does it that way. Signal goes out, valve follows. Next item.',
        industry: 'Standard design. Demand goes out, valve follows. Moving on.' },
    ],
    confusion: [
      { speaker: 'sys',
        learning: '*BUZZER* — PRESSURIZER PRESSURE VERY LOW · LOW SUBCOOLING MARGIN',
        industry: '*BUZZER* — PZR PRESS LO LO · LO SUBCOOL' },
      { speaker: 'aux',
        learning: 'Boss — pressure is *still* falling. We\'re way under normal and the subcooling margin alarm just came in. That\'s the how-far-from-boiling number. Something doesn\'t add up: valve\'s shut, feed transient\'s over — where\'s my pressure going?',
        industry: 'Pressure still trending down — subcooling margin alarming. Doesn\'t reconcile: PORV indicates shut, feed transient terminated. Where\'s the pressure going?' },
      { speaker: 'sup',
        learning: 'Cooldown from the trip, probably — the whole primary shrinks when it cools and pressure sags with it. Keep reading it to me. It\'ll turn around.',
        industry: 'Post-trip cooldown contraction, most likely. Keep calling the trend. It should recover.' },
    ],
    hpiAuto: [
      { speaker: 'sys',
        learning: '*chime* — EMERGENCY COOLING ACTIVE (HIGH-PRESSURE INJECTION)',
        industry: '*chime* — HPI ACTIVE (SI ACTUATION)' },
      { speaker: 'aux',
        learning: 'High-Pressure Injection just started itself — HPI, the emergency pumps that force water into the primary. Pressure got low enough to trip it automatically.',
        industry: 'HPI auto-initiated on low RCS pressure.' },
      { speaker: 'sup',
        learning: 'Fine. It\'s doing its job — putting water in while pressure\'s low. Watch the pressurizer level with me now. That tank\'s the only water gauge we\'ve got on the whole primary.',
        industry: 'As designed. Injection in service. Watch PZR level — it\'s our only inventory indication on the RCS.' },
    ],
    throttlePrefix: [
      { speaker: 'sys',
        learning: '*chime* — PRESSURIZER LEVEL HIGH',
        industry: '*chime* — PZR LVL HI' },
      { speaker: 'aux',
        learning: 'Now the pressurizer level\'s *climbing* — fast. Passing the high alarm and still going. With injection running full-bore, we\'re packing the primary full.',
        industry: 'PZR level rising rapidly through the high alarm, injection at full flow. We\'re filling the system.' },
      { speaker: 'sup',
        learning: 'That\'s the one thing I won\'t let happen. If that tank fills solid — water to the top, no steam cushion left — we lose all pressure control. Every instructor I ever had said the same thing: *never let it go solid.* A solid plant can burst pipes off a hiccup.',
        industry: 'Unacceptable trend. If the pressurizer goes solid we lose the steam bubble and all pressure control with it. Training is unambiguous: do not take the plant solid.' },
      { speaker: 'aux',
        learning: 'But the pressure\'s still *low*, boss. Level up, pressure down… those two usually move together. I don\'t love it.',
        industry: 'Countervailing point: pressure remains low. Level high with pressure low is a non-standard pair. It doesn\'t sit right.' },
    ],
  };

  RD.TMI2 = TMI2;

})(globalThis.RD || (globalThis.RD = {}));
