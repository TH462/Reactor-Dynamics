/*
 * pwr_tmi.js — Three Mile Island (1979), the PWR flagship scenario (M6 §14.1).
 *
 * An accident of INFORMATION: a relief valve sticks open while its indicator
 * reads closed. The lesson is that the plant's own couplings — pressure against
 * temperature, subcooling margin above all — keep telling the truth after one
 * indication stops, and reading them is what resolves the contradiction. It is
 * a Tier C payoff of the dynamics curriculum, NOT a lesson about distrusting
 * gauges: you cannot see that an instrument is lying without already knowing
 * what the plant should be doing (`Blueprint/DESIGN_CRITERIA.md` §6.3).
 *
 * Beats follow the M6 §14.1 outline and the trajectory proven by the engine's
 * own TMI flagship suite: loss of feedwater with AFW blocked (the historical
 * closed discharge valves) → trip on low SG level → the PORV stick injected on
 * a short delay after the trip. Injecting stuck_porv_open both opens and holds
 * the valve (the pressurizer models "stuck" as held open) — the same play the
 * engine suite makes, since the lumped physics does not produce the brief
 * post-trip pressure spike naturally. Later beats trigger on the plant's real
 * response (the subcooling alarm, true inventory). Branch endpoints carry
 * level_complete and advance:"end" so a finished path never falls through into
 * the other path's beats.
 *
 * Honesty acknowledgments voiced (M6 §13): single-sensor vulnerability at the
 * moment it matters, and the authentic-units note (§13.1) in the intro.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_tmi = {
    id: 'pwr_tmi',
    title: 'Three Mile Island',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'demonstration',
    description: 'The 1979 partial meltdown — a failure of information.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'This is a pressurized water reactor running normally at full power. Take a moment to look at the gauges — especially the pressurizer pressure and the subcooling margin, which tells you how far the coolant is from boiling. One note: this is a US plant, and its real control room read pressure in psia and temperature in °F. Your display shows whichever units you have chosen — both are fine.',
          industry: 'PWR at 100% power, steady state. Note your key parameters: PZR pressure/level, Tavg, subcooling margin. Plant-authentic units are US customary (psia, °F); the display follows your Units setting.',
        },
        advance: 'wait_for_trigger' },

      { id: 'feedwater_lost',
        trigger: { type: 'time', value: 30.0 },
        commentary: {
          learning: 'The pumps feeding water to the steam generators have just stopped — and the emergency feedwater pumps cannot help, because their discharge valves were left closed after maintenance. That really happened in 1979. With no water reaching the steam generators, the reactor cannot shed its heat. Watch the steam generator level fall — the plant will protect itself soon.',
          industry: 'Loss of main feedwater; AFW unavailable — discharge valves left closed post-maintenance (the historical lineup error). SG heat sink degrading. Expect reactor trip on low SG level.',
        },
        inject_failures: ['loss_of_feedwater', 'afw_failure'],
        advance: 'wait_for_trigger' },

      { id: 'reactor_trips',
        trigger: { type: 'scram' },
        commentary: {
          learning: 'The reactor shut itself down automatically — a scram. The chain reaction has stopped, but the fuel is still very hot and still making decay heat, and the pressure upset is working on the relief valve at the top of the pressurizer. Watch its indicator light on the board.',
          industry: 'Reactor trip on low SG level. Decay heat is now the load. Watch the PZR relief path — PORV action imminent.',
        },
        advance: 'wait_for_trigger' },

      { id: 'porv_sticks',
        trigger: { type: 'delay', value: 10.0 },
        commentary: {
          learning: 'The relief valve opened to let off pressure — and it has jammed open. Worse: its indicator light in front of you shows CLOSED. There is only one indicator for that valve, and it is lying. Meanwhile the crew has found the closed valves and restored emergency feedwater, so the steam generators are recovering — the real problem now is the hole at the top of the pressurizer that the board says is shut. From here on, the gauges that cannot lie are pressure and the subcooling margin. Watch them.',
          industry: 'PORV lifted on the pressure spike and failed to reseat. Position indication reads CLOSED — single, unvoted indication, now stuck. AFW restored (historical: ~8 min). The trap is set: track PZR pressure and subcooling margin; the PORV indication is no longer information.',
        },
        // stuck_porv_open opens AND holds the valve (engine semantics); the
        // indicator failure begins the lie at the same moment. AFW is restored
        // here — historically the crew found the closed valves ~8 minutes in —
        // which also gives the recovery branch its heat sink.
        inject_failures: ['stuck_porv_open', 'porv_indicator_stuck_closed'],
        clear_failures: ['afw_failure'],
        commands: [{ action: 'set_afw', active: true }],
        advance: 'wait_for_trigger' },

      { id: 'injection_decision',
        trigger: { type: 'alarm', alarm_id: 'subcooling_low' },
        commentary: {
          learning: 'Your subcooling margin is falling — the coolant is getting close to boiling, which means water is escaping somewhere. The valve indicator still says CLOSED, but THIS number is the truth. You can start High-Pressure Injection (HPI) to put water back in. What will you do?',
          industry: 'Subcooling margin eroding despite a CLOSED PORV indication — inventory is leaving through the pressurizer. HPI is available. Decision point.',
        },
        branches: [
          { trigger: { type: 'operator_action', command: 'set_hpi', params: { active: true } }, goto: 'recovery_path' },
          { trigger: { type: 'inaction', window: 120.0 }, goto: 'damage_path' },
        ] },

      // ---- recovery branch --------------------------------------------------
      // The beat also closes the PORV block valve — the action that actually
      // terminated the 1979 event (~06:22). HPI alone cannot outrun the open
      // relief path in this engine (margin plateaus below the restoration
      // setpoint), so isolation is both the honest history and the physics.
      { id: 'recovery_path',
        trigger: { type: 'delay', value: 5.0 },
        commands: [{ action: 'close_block_valve' }],
        commentary: {
          learning: 'You started injection — and now that the crew believes the physics, they finish the job: the PORV BLOCK VALVE, the backup gate behind the stuck valve, is driven CLOSED. The leak is plugged; cold water refills what drained away. Recovery takes a while, so I am running time at 30× — watch the subcooling margin climb back, and I will drop us to real time when it is restored. (You can adjust the speed control yourself any time.)',
          industry: 'HPI injecting; PORV block valve closed — the historical terminating action (~06:22). Makeup now exceeds losses; subcooling recovering. Time acceleration 30× for the recovery phase — reverts to 1× on margin restoration. Speed control remains available.',
        },
        speed: 30,
        advance: 'wait_for_trigger' },

      { id: 'recovered',
        trigger: { type: 'instrument', instrument: 'subcooling_margin', direction: 'above', value: 11.1 },
        commentary: {
          learning: 'Back to real time: subcooling margin restored — the coolant is safely below boiling again and the core is covered. You beat Three Mile Island by believing the physics instead of one broken light.',
          industry: 'Time 1×. Subcooling margin restored above the alarm setpoint. Inventory trend recovered; core covered. Event terminated by early HPI.',
        },
        speed: 1,
        level_complete: {
          title: 'Three Mile Island — Averted',
          outcome_learning: 'You read the truth in the subcooling margin and injected in time. The core never uncovered.',
          outcome_industry: 'Early HPI on eroding subcooling terminated the event before inventory loss reached the core.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      // ---- damage branch ----------------------------------------------------
      // The plant's automatic injection starts by itself on low pressure — just
      // as it did in 1979. The historical error was SECURING it: the operators,
      // misled by a full-looking pressurizer (the level rises as water flashes
      // to the stuck valve), shut the injection off. Hesitation here replays
      // their mistake, enacted by the beat.
      { id: 'damage_path',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'You hesitated — and now the trap closes. The automatic injection started on its own, and the pressurizer level gauge is reading high, as if the system were overfull. In 1979 the operators believed that gauge and shut the injection OFF. Watch: the same hands now turn it off here. The draining takes time, so I am running the clock at 30× — the subcooling margin knew the truth all along, and the water is boiling away.',
          industry: 'Auto-HPI initiated on low pressure, as in 1979. PZR level reads high — the classic misleading indication with a stuck-open PORV. Replaying the historical action: HPI secured. Time acceleration 30× through the boil-off; reverts to 1× at core uncovery.',
        },
        commands: [{ action: 'set_hpi', active: false }],
        // 10× (not 30): this card explains WHY the operators secured injection
        // — at 30× it was replaced in ~7 s, well under its read time (playtest).
        speed: 10,
        advance: 'wait_for_trigger' },

      { id: 'core_damage',
        trigger: { type: 'true_state', field: 'core_inventory_pct', direction: 'below', value: 70.0 },
        commentary: {
          learning: 'Back to real time: the core is uncovering and overheating — this is what happened in 1979. Two honest notes: in the real plant a single stuck indicator would be cross-checked against redundant sensors that this simulator deliberately does not model, and this simulation ends at fuel damage — the containment consequences that followed are described, not simulated. Press Rewind — each press steps one checkpoint further back; walk it to the injection decision and change history.',
          industry: 'Time 1×. Core uncovery in progress — the 1979 outcome. Model notes: single-sensor indication (no redundancy/voting modeled) makes the failure starker than a real voted plant; simulation terminates at fuel damage, containment response not modeled. Rewind steps back one checkpoint per press — return to the injection decision to retry.',
        },
        speed: 1,
        level_complete: {
          title: 'Three Mile Island — The 1979 Outcome',
          outcome_learning: 'The stuck valve drained the core while its indicator said CLOSED. The subcooling margin knew the truth all along.',
          outcome_industry: 'Uncorrected inventory loss through the stuck PORV led to core uncovery. Indication failure masked the LOCA; subcooling margin was the recoverable signal.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
