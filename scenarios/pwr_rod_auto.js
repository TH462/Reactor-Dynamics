/*
 * pwr_rod_auto.js — The Steady Hand (PWR training, automatic rod control).
 *
 * The other control surface the campaign never isolates: the rods_tavg
 * channel. The player trims a Tavg excursion by hand (and feels the
 * fiddliness — strong bank, slow loop), engages AUTO and learns the T-ref
 * capture trap, watches the speed ladder carry a load restore into the ±0.8 °C
 * deadband, then proves manual override precedence with a single nudge.
 *
 * Probed physics (seed 42, hot_full_power): Tavg baseline 304.0 °C; a
 * 1000→900 MWe drop walks Tavg up ~1 °C/20 s, crossing 307 at ~40 s and the
 * 312.2 HI TAVG annunciator at ~135 s (equilibrium ~+11 °C unchecked). Manual
 * trim: ~15–18 single-step insertions paced 3-at-a-time with ~30 s waits
 * bring Tavg back under 305.5 without deep overshoot; a 28-step burst drove
 * power to 55% and Tavg to 298 — the overshoot lesson is real. rods_tavg
 * captures T-ref from the CURRENT indicated Tavg on engage; with a good
 * capture (~305) the 1000 MWe restore reaches mwe > 985 in well under a
 * minute and locks up "holding" (|Tavg−Tref| < 0.9). With a LOW capture
 * (~298) output tops out near 950 MWe — hence the delay-420 fallback on the
 * ride watch, and the setpoint-edit note in the commentary. One rod_nudge
 * drops the channel to MAN instantly ("off — manual control taken").
 *
 * Softlock-proofing: every player watch carries a scram catch; the AUTO ride
 * cannot strand on an unreachable megawatt number; the complete beat
 * re-asserts AUTO so an out-of-order override/re-engage cannot end the
 * mission with the channel down.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_rod_auto = {
    id: 'pwr_rod_auto',
    title: 'The Steady Hand',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'guided',
    description: 'Hold T-avg by hand through a load change, then hand the rods to the automatic channel — and learn exactly when to engage it, and how to take it back.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'At power, the control rods serve one number: T-avg, the average coolant temperature. Steam demand owns POWER — you have seen that feedback story — so when you move rods, the megawatts snap back to whatever the turbine draws, and what actually changes is the loop temperature. Look at the Reactor Control card: a Mode selector, AUTO and MAN, sitting in MAN. Behind that button lives a controller that holds T-avg all shift without getting bored. First you will do its job by hand — so you know exactly what you are handing over.',
          industry: 'At-power rod-control doctrine: power is slaved to steam demand; rod reactivity manifests as Tavg. Rod card Mode AUTO/MAN mirrors the rods_tavg channel (currently MAN). Exercise: manual Tavg trim, then automatic rod control through a load swing.',
        },
        highlight: { control_label: 'Control Bank', instrument_id: 'tavg' },
        advance: 'wait_for_trigger' },

      { id: 'off_program',
        trigger: { type: 'delay', value: 28.0 },
        commands: [{ action: 'set_load_target', mwe: 900 }],
        commentary: {
          learning: 'I am pulling the turbine back to 900 MW. Watch T-avg on the gauge strip: steam draw falls, the loop banks the surplus as heat, and the temperature starts walking up off its program — about a degree every twenty seconds, headed for the HI TAVG annunciator at 312. Hands off for now. Just watch it climb.',
          industry: 'Load to 900 MWe (instructor). Tavg rising off program, ~1 °C per 20 s (~+11 °C equilibrium if unchecked; HI TAVG warning 312.2 °C). Hold manipulations until tasked.',
        },
        highlight: { control_label: 'Control Bank', instrument_id: 'tavg' },
        advance: 'wait_for_trigger' },

      // Fires as Tavg crosses 307 (~40 s after the drop) — ~95 s of margin to
      // the HI TAVG annunciator, plenty for the paced-trim protocol (probed).
      { id: 'trim_task',
        trigger: { type: 'instrument', instrument: 'tavg', direction: 'above', value: 307.0 },
        commentary: {
          learning: 'Three degrees high and still climbing. Bring it home by hand: nudge the control bank IN, single steps. And here is the craft — three or four steps, then STOP and wait half a minute, because the loop takes that long to show you what you bought. The bank is strong, roughly a degree per step once things settle, and if you pour in ten at once the temperature will sail straight through the target and keep going. Get T-avg back within a degree and a half of 304. Beat the annunciator if you can; acknowledge it if you cannot.',
          industry: 'Manual trim: insert the control bank in 3–4 step increments with ~30 s settling between groups. Differential worth ~1 °C/step at equilibrium; burst insertion overshoots (probed: 28 steps → Tavg 298, power 55%). Target: Tavg ≤ 305.5 °C. HI TAVG annunciates at 312.2 if trailing.',
        },
        highlight: { control_label: 'Nudge', instrument_id: 'tavg' },
        branches: [
          { trigger: { type: 'scram' }, goto: 'tripped' },
          { trigger: { type: 'all', triggers: [
              { type: 'any', triggers: [
                { type: 'operator_action', command: 'rod_nudge', params: { group_id: 'control_rods' } },
                { type: 'operator_action', command: 'rod_start', params: { group_id: 'control_rods' } },
              ] },
              { type: 'instrument', instrument: 'tavg', direction: 'below', value: 305.5 },
            ] }, goto: 'engage_auto' },
        ] },

      { id: 'engage_auto',
        trigger: { type: 'delay', value: 3.0 },
        commentary: {
          learning: 'On target — you just did, in minutes, what the machine does all day. Now hand it over, but hear the trap first: the moment you press AUTO, the controller captures T-ref — its target — from whatever T-avg reads RIGHT THEN. Engage while the temperature sits where you want it, and it holds that number forever. Engage while it is still diving from your last correction, and it will faithfully hold your mistake. It is close to program right now — a fine moment. Press AUTO on the rod card, or engage "Rod control → Tavg" in the Automate tab.',
          industry: 'Tavg restored. Engage rods_tavg (rod card AUTO, or Automate → Reactor). T-ref captures the CURRENT indicated Tavg at engage — verify Tavg is on the desired value first; setpoint remains editable afterwards (set_auto_setpoint). Mismatch-dominant two-term controller, ±0.8 °C deadband, error-proportional speed ladder.',
        },
        highlight: { control_label: 'Control Bank', instrument_id: null },
        branches: [
          { trigger: { type: 'scram' }, goto: 'tripped' },
          { trigger: { type: 'operator_action', command: 'set_auto_channel',
                       params: { channel_id: 'rods_tavg', engaged: true } }, goto: 'auto_ride' },
        ] },

      // Payoff: the channel flies the restore. Probed: good T-ref → mwe > 985
      // inside a minute; LOW T-ref tops out ~950 MWe, so the delay-420 branch
      // guarantees an exit either way.
      { id: 'auto_ride',
        trigger: { type: 'delay', value: 3.0 },
        commands: [{ action: 'set_load_target', mwe: 1000 }],
        commentary: {
          learning: 'Engaged — T-ref captured, and the rod card shows it. Now the morning ask: I am running the turbine back up to 1000 MW, the mirror of the move you just fought by hand. Watch the bank. The controller senses steam running ahead of power and walks the rods OUT — small error, slow steps; bigger error, faster — and as T-avg closes on T-ref it slows, stops, and the status reads "holding". That lockup band is ±0.8 degrees: inside it, the rods do not move at all.',
          industry: 'Load restored to 1000 MWe under automatic rod control. Expect mismatch-term withdrawal on the speed ladder, then lockup inside ±0.8 °C of T-ref ("holding"). If T-ref was captured low, output tops out below rated — raise the channel setpoint from the Automate tab.',
        },
        branches: [
          { trigger: { type: 'scram' }, goto: 'tripped' },
          { trigger: { type: 'all', triggers: [
              { type: 'delay', value: 40.0 },
              { type: 'instrument', instrument: 'mwe_output', direction: 'above', value: 985 },
            ] }, goto: 'override' },
          { trigger: { type: 'delay', value: 420.0 }, goto: 'override' },
        ] },

      { id: 'override',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'Settled — and the rods found it without you. Last lesson, and it is the most important one: YOU always outrank the machine. Tap one rod nudge, either direction, one step. Watch the Mode lamp snap to MAN the instant your command lands — any manual motion on the bank means the operator wants it, and the channel steps aside without argument. No fighting over the controls, ever. Now put it back: press AUTO again, and this time leave it alone.',
          industry: 'Manual-override check: any operator rod command on the control group drops rods_tavg to MAN immediately (channel stands down — no contention). Nudge one step, observe MAN, re-engage AUTO. Note: re-engaging recaptures T-ref at the current Tavg.',
        },
        highlight: { control_label: 'Nudge', instrument_id: null },
        branches: [
          { trigger: { type: 'scram' }, goto: 'tripped' },
          { trigger: { type: 'all', triggers: [
              { type: 'any', triggers: [
                { type: 'operator_action', command: 'rod_nudge', params: { group_id: 'control_rods' } },
                { type: 'operator_action', command: 'rod_start', params: { group_id: 'control_rods' } },
              ] },
              { type: 'operator_action', command: 'set_auto_channel',
                params: { channel_id: 'rods_tavg', engaged: true } },
            ] }, goto: 'complete' },
        ] },

      { id: 'complete',
        trigger: { type: 'delay', value: 2.0 },
        // Belt-and-braces: if the player re-engaged BEFORE the nudge (both
        // actions seen, order unchecked), the channel would end the mission in
        // MAN — re-assert AUTO so the closing card tells the truth.
        commands: [{ action: 'set_auto_channel', channel_id: 'rods_tavg', engaged: true }],
        commentary: {
          learning: 'Shift handed over. This is how the plant actually runs: the rod channel holding T-avg against every little breath of the grid, and the operator supervising — engaging it at the right number, taking it back the moment judgment says so. Two more things it knows: if the reactor trips, the channel stands down on its own rather than fight a scram; and its setpoint is yours to edit in the Automate tab whenever the program calls for a different temperature. The steady hand is yours. It just does not get tired.',
          industry: 'Exercise complete: manual Tavg trim, AUTO engagement with T-ref capture, automatic load-follow response, manual-override precedence, re-engage. Channel is offOnScram; setpoint adjustable via set_auto_setpoint. Supervisory doctrine per the full-plant automation mission.',
        },
        level_complete: {
          title: 'The Steady Hand — Handed Over',
          outcome_learning: 'You held T-avg by hand, then taught yourself out of the job — and learned the rule that matters: engage automation when the number is where you want it.',
          outcome_industry: 'Manual Tavg trim and rods_tavg engagement validated through a 1000→900→1000 MWe swing; T-ref capture and manual-override precedence demonstrated.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      { id: 'tripped',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        commentary: {
          learning: 'The reactor tripped — with a bank this strong, a burst of steps is a real reactivity transient, and the protection does not wait to see whether you meant it. Notice one thing in the aftermath: if the rod channel was engaged, it has already stood down to MAN — automation never fights a scram. Rewind or Retry: small moves, long waits.',
          industry: 'Reactor trip during the rod exercise — rod motion exceeded protection margins (or manual trip). rods_tavg stands down on scram (offOnScram). Re-run with 3–4 step increments and settling time between groups.',
        },
        level_complete: {
          title: 'The Steady Hand — Tripped',
          outcome_learning: 'The bank is stronger than it looks and the loop is slower than it feels. Steps, then patience.',
          outcome_industry: 'Trip during the manual/auto rod-control exercise. Re-run with bounded rod increments.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
