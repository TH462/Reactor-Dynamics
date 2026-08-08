/*
 * pwr_esf.js — Armed and Automatic (PWR safety-systems teaching scenario).
 *
 * The ESF AUTO/MAN arms, taught by watching one fire and then taking it over:
 * the Emergency Cooling card's HPI / AFW / RHR arms each hold an auto-actuation
 * in the control layer (AFW: loss of feed flow above P-9, plus the 17 % low-low
 * level start it shares with the reactor trip — single-signal, #380; HPI:
 * 12.4 MPa; RHR: 2.76 MPa (400 psi) + tripped). An operator command on an armed
 * system drops it to MANUAL; the AUTO button (set_esf_auto) re-arms it AND
 * clears the actuation latch so a standing condition re-fires.
 *
 * Probed trajectory (re-measured 2026-08-08, #380 pass): loss_of_feedwater at
 * full power collapses feed flow, so the AFW arm fires within seconds on the
 * PI-4 loss-of-feed start (level still ~65 %) — AFW (15 % capacity) cannot win
 * against a full-power boil-off, so the 17 % low-low trip at ~40 s is PART of
 * the demonstration (defense in depth: the flow start leads, the level signal
 * that scrams the reactor would start AFW too if it hadn't). Post-trip the AFW
 * proportional hold parks indicated level around ~37-40 %. Main feed never
 * returns (feed follows the near-zero post-trip steam demand), so the honest
 * ending is the stable AFW hold, not a recovery to 65 %. A zeroed throttle
 * drains the hold below 10 % on the honest decay-heat clock (the 'drained'
 * teaching branch) — and re-arming does NOT reopen a throttle the operator
 * shut (set_esf_auto re-fires set_afw pump demand only), which the drained
 * card states.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_esf = {
    id: 'pwr_esf',
    title: 'Armed and Automatic',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'demonstration',
    description: 'The switches the plant holds for itself — watch one fire, take it over, and hand it back.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Open the Emergency Cooling card: HPI, AFW, RHR — and beside each, a small arm that reads AUTO. Those arms mean the plant holds some of its own switches. Each system is ARMED: a watchdog in the control layer stares at one gauge, and the moment the reading crosses its setpoint, the system fires itself — no permission asked. Armed is not fired: right now every arm is quiet, because every reading is healthy. I am about to give the auxiliary feedwater arm a reason to act.',
          industry: 'ESF orientation: HPI / AFW / RHR each carry an AUTO/MAN arm (Emergency Cooling card). ARMED = the control-layer actuation evaluates its instrument (AFW: loss of feed flow above P-9, plus the 17 % low-low level start shared with the reactor trip; HPI: primary pressure < 12.4 MPa, plus an unblockable containment-pressure backup at 3.5 psig that no arm can gate; RHR: 2.76 MPa (400 psi) + trip permissive). Armed ≠ actuated. A feedwater upset follows to demonstrate the AFW actuation.',
        },
        highlight: { control_label: 'AFW', instrument_id: 'sg' },
        advance: 'wait_for_trigger' },

      // Exits ONLY via the branch: the AFW arm firing itself (within seconds of
      // the injection — the PI-4 loss-of-feed-flow start leads, level still
      // ~65 %; re-measured 2026-08-08). afw_active is a status boolean
      // instrument — a snapshot trigger reads it directly. Even a disobedient
      // early manual scram still collapses feed flow, so the branch always
      // fires.
      { id: 'break_it',
        trigger: { type: 'delay', value: 26.0 },
        commentary: {
          learning: 'Both main feed pumps just died — and your instruction is to DO NOTHING. Hands in your lap. The steam generator is boiling toward empty; watch the AFW arm on the Emergency Cooling card. It saw the feed flow collapse the moment you did.',
          industry: 'Loss of main feedwater injected. No operator action — observe only. Feed flow collapsing with the plant above P-9 — that is the AFW auto-start condition that leads here; the 17 % low-low level start behind it is shared with the reactor trip. Expect the actuation, then the RPS backstop.',
        },
        inject_failures: ['loss_of_feedwater'],
        branches: [
          { trigger: { type: 'instrument', instrument: 'afw_active', direction: 'is_true' }, goto: 'afw_fired' },
        ] },

      { id: 'afw_fired',
        trigger: { type: 'delay', value: 0.3 },
        commentary: {
          learning: 'There — the arm fired, and it did not wait for the level. Feed flow went to nothing and auxiliary feedwater started itself: the run light is on and the arm still reads AUTO, because the plant, not you, threw that switch. But keep watching the level. AFW is a small pump against a full-power boil-off, and it is losing. The next layer down is already reaching for the rods.',
          industry: 'AFW auto-actuation on the loss-of-feed-flow start (fw_flow collapsed above P-9) — pump running, arm still AUTO (no operator command has touched the system). AFW capacity ~15 % of rated feed: insufficient against 100 % steaming. Anticipate the low-low SG level reactor trip at 17 % — the same signal is AFW\'s own backstop start.',
        },
        advance: 'wait_for_trigger' },

      { id: 'tripped',
        trigger: { type: 'all', triggers: [
          { type: 'scram' },
          { type: 'delay', value: 18.0 },
        ] },
        commentary: {
          learning: 'SCRAM — the low-low level trip at 17 percent dropped every rod. That is defense in depth: the ESF arm fired the moment feed was lost to save the boiler, and when arithmetic said it could not win at full power, the protection system took the power away instead. Now the fight is fair: decay heat against a running AFW pump. I am compressing time — watch the level climb back to the hold.',
          industry: 'Reactor trip on SG level 17 % low-low — the RPS backstop behind the ESF actuation (defense in depth: the flow start led; this same low-low signal would have started AFW itself, single-signal design). Post-trip the balance inverts: decay heat vs AFW capacity — AFW wins. Time 8× through the refill to the AFW proportional hold.',
        },
        speed: 8,
        advance: 'wait_for_trigger' },

      // Prompt-with-branches: the takeover. Any AFW throttle command exits.
      { id: 'at_the_hold',
        trigger: { type: 'instrument', instrument: 'sg_level', direction: 'above', value: 22.0 },
        commentary: {
          learning: 'Real time again. The level is climbing back and settles in the high thirties: that is the AFW hold — full flow below its band, tapering off above it, a proportional grip the plant keeps all by itself. Now take it away from her. Touch the AFW throttle — ease it to 60 percent — and watch the arm on the Emergency Cooling card the moment you do.',
          industry: 'AFW proportional level hold establishing (settles ~37–40 % indicated at decay heat). Exercise: issue an AFW throttle command (set_afw_flow, suggest 60 %) and observe the ESF arm — an operator command on an armed system drops it to MANUAL.',
        },
        speed: 1,
        highlight: { control_label: 'AFW Throttle', instrument_id: 'sg' },
        branches: [
          { trigger: { type: 'operator_action', command: 'set_afw_flow' }, goto: 'went_manual' },
        ] },

      // The MAN drop is narrated here (no snapshot trigger can read the
      // automation arms — the branch graded the set_afw_flow command instead).
      // The drained branch is the teaching catch for a strangled throttle:
      // probed, a 0 % throttle drains the hold below 10 % in several hundred
      // seconds — the honest decay-heat boil-off rate on the derived secondary
      // clock (#418 wave A1, 2026-08-07; the old ~53 s sprint was the
      // compressed clock's).
      { id: 'went_manual',
        trigger: { type: 'delay', value: 1.0 },
        commentary: {
          learning: 'Look at the arm: MANUAL. One touch of the throttle and the plant let go — it will not auto-throttle a system you have claimed, even if the level falls. That is the contract: your hands or hers, never both. You own this pump now... so give it back. Press the AFW AUTO button to re-arm it.',
          industry: 'ESF arm AFW → MAN on the operator command (any set_afw / set_afw_flow flips it). While MANUAL the AFW auto-starts neither fire nor reset. Restore with set_esf_auto {system: afw} — the AUTO button on the card.',
        },
        highlight: { control_label: 'AFW', instrument_id: 'sg' },
        branches: [
          { trigger: { type: 'operator_action', command: 'set_esf_auto', params: { system: 'afw', auto: true } }, goto: 'rearmed' },
          { trigger: { type: 'instrument', instrument: 'sg_level', direction: 'below', value: 10.0 }, goto: 'drained' },
        ] },

      // Stability gate to the endpoint lives in the branches (a player who
      // re-armed with the throttle at zero still starves the boiler — re-arming
      // re-fires the PUMP demand, not the throttle — and must land on the
      // drained card, not a softlock).
      { id: 'rearmed',
        trigger: { type: 'delay', value: 1.0 },
        commentary: {
          learning: 'AUTO again — and one more subtlety worth keeping: re-arming also clears the actuation’s memory. If a start condition were standing right now — feed flow still gone, or level below the low-low — the arm would fire again immediately: a standing condition re-fires on a fresh arm. HPI and RHR carry exactly the same arms with their own setpoints, and they go MANUAL the same way the moment you touch them. You never drilled them today — you did not need to. One lesson, three switches.',
          industry: 'set_esf_auto re-arms AND clears the actuation latch — a standing condition re-actuates immediately on re-arm (the point of the button). Identical arm semantics on HPI (12.4 MPa) and RHR (2.76 MPa / 400 psi + tripped permissive). Stability check pending.',
        },
        branches: [
          { trigger: { type: 'all', triggers: [
              { type: 'delay', value: 24.0 },
              { type: 'instrument', instrument: 'sg_level', direction: 'above', value: 15.0 },
            ] }, goto: 'complete' },
          { trigger: { type: 'instrument', instrument: 'sg_level', direction: 'below', value: 10.0 }, goto: 'drained' },
        ] },

      { id: 'complete',
        trigger: { type: 'delay', value: 1.0 },
        commentary: {
          learning: 'Steady: decay heat, AFW holding its band, every arm back on AUTO. Take the honest ending with you — the main feed never came back, and the plant did not need it: the hold in the high thirties IS the safe state here. The machine fired its own switch, tripped its own reactor, and held its own level. Your job was knowing when to take a switch — and when to give it back.',
          industry: 'Stable at the AFW hold: decay heat, arms re-armed, no main feed required (feed follows the near-zero post-trip steam demand — the hold is the terminal state). ESF arm demonstration complete: auto-actuation, MAN on operator command, re-arm with latch clear.',
        },
        level_complete: {
          title: 'Armed and Automatic — Handed Back',
          outcome_learning: 'You watched an arm fire itself, took it to MANUAL with one touch, and handed it back armed. HPI and RHR work exactly the same way — now you know all three.',
          outcome_industry: 'AFW auto-actuation observed (loss-of-feed-flow start), ESF MAN drop on operator command exercised, re-arm with actuation-latch clear exercised. Terminal state: stable AFW hold at decay heat.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      { id: 'drained',
        trigger: { type: 'delay', value: 1.0 },
        commentary: {
          learning: 'The boiler ran dry. You strangled the AFW throttle, and the plant kept its word: a system on MANUAL is yours alone — the watchdog stood down, and even re-arming the switch does not reopen a throttle you shut. Nothing melted; the reactor was already down. But that empty gauge is the cost of taking a switch you did not mean to keep. Retry — and this time give the arm back with the throttle open.',
          industry: 'SG level < 10 % under a manually throttled AFW. MAN semantics honored: no auto-throttle override; set_esf_auto re-fires pump demand only, not the operator’s throttle setting. Teaching endpoint — retry and restore AUTO with usable flow.',
        },
        level_complete: {
          title: 'Armed and Automatic — Starved on Manual',
          outcome_learning: 'You took the throttle to MANUAL and the plant never overrode your hand — that is the contract, and this time it emptied the boiler.',
          outcome_industry: 'Manual AFW throttle reduction drained the SG below 10 %. ESF MAN discipline demonstrated the hard way: the actuation stands down while the operator holds the system.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
