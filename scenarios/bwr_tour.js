/*
 * bwr_tour.js — One Loop (BWR campaign, Act I mission 1).
 *
 * Orientation at full power: the direct cycle (steam made in the core
 * drives the turbine — radioactive steam and all), water as moderator AND
 * coolant giving a NEGATIVE void coefficient (the RBMK's mirror image),
 * recirculation flow as the throttle, and vessel level as the number that
 * rules everything. Observation mission; hands-on follows in "The Flow
 * Throttle".
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.bwr_tour = {
    id: 'bwr_tour',
    title: 'One Loop',
    plant_id: 'bwr',
    design_version: null,
    initial_state: 'full_power',
    mode: 'demonstration',
    description: 'The boldest simplification in reactor design: boil the water right in the core and send that steam to the turbine.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Third machine, third philosophy. The PWR kept its reactor water sealed away and made steam second-hand. The RBMK boiled in tubes and paid a terrible price in physics. This is the BOILING WATER REACTOR — and it asks the boldest question: why not just boil the water in the core and pipe that steam STRAIGHT to the turbine? One loop. No steam generators, no pressure tubes. The price: that steam has been through a reactor, so the turbine itself is radioactive while running, and the whole steam side is part of the nuclear plant.',
          industry: 'BWR orientation at rated power. Direct cycle: core boiling → steam separators/dryers → main steam lines → turbine. No SG barrier; N-16 activity makes the turbine building a radiation area at power. Vessel pressure ~7 MPa (half a PWR primary).',
        },
        advance: 'wait_for_trigger' },

      { id: 'void_negative',
        trigger: { type: 'delay', value: 26.0 },
        commentary: {
          learning: 'Now the physics — and after the RBMK, this will feel like coming home. Look at the void fraction: almost half the coolant at the top of this core is steam bubbles. But HERE, water does both jobs again: it cools AND it slows neutrons down. So when a bubble forms, the core loses moderator — and power goes DOWN. It is the RBMK\'s sentence with the sign flipped: in this machine, boiling is the brake. More void, less power; less void, more power. The reactor is self-damping, and the designers turned that into something beautiful — watch the next beat.',
          industry: 'Negative void coefficient: coolant = moderator, so void → under-moderation → −ρ. Self-stabilizing against power/void excursions — the design-defining contrast with the RBMK, and the enabler of flow-control (next).',
        },
        advance: 'wait_for_trigger' },

      { id: 'throttle',
        trigger: { type: 'delay', value: 26.0 },
        commentary: {
          learning: 'Because bubbles are the brake, the BWR has a throttle no other reactor has: the RECIRCULATION PUMPS. Spin them faster and they sweep bubbles out of the core — less brake, MORE power. Slow them and the core fills with foam — more brake, LESS power. The control rods mostly sit still at power; whole shifts go by where the only "reactivity control" is pump speed. You will drive it yourself in two missions.',
          industry: 'Recirculation flow control: flow ↑ → void sweep-out → +ρ → power ↑ (and inverse). Primary power-maneuvering method at power; rods (bottom-entry here) provide shaping and shutdown. Interactive demo follows.',
        },
        advance: 'wait_for_trigger' },

      { id: 'level_king',
        trigger: { type: 'delay', value: 24.0 },
        commentary: {
          learning: 'Last stop: the VESSEL LEVEL gauge — in a BWR, this is the king of the board. There is exactly one vessel, the fuel lives in it, and that water line is the distance between a normal Tuesday and a damaged core. Every emergency system on this plant — and it has a famous alphabet of them: RCIC, HPCI, ADS, LPCI — exists to answer one question: is there water over the fuel? Hold that thought; in Act III it becomes the whole story of Fukushima.',
          industry: 'Vessel level = the controlling parameter. ECCS lineup (RCIC/HPCI steam-driven high-pressure; ADS blowdown enabling LPCI/LPCS low-pressure) is level-centric by design. Level instrumentation caveats (shrink/swell) demonstrated in the isolation mission.',
        },
        advance: 'wait_for_trigger' },

      { id: 'complete',
        trigger: { type: 'delay', value: 22.0 },
        commentary: {
          learning: 'One loop, honest bubbles, a pump-speed throttle, and a single water line that everything defends. Simple to describe — which is exactly why its accidents are stories about SUPPORT: what happens when the pumps, the batteries, the diesels that defend that water line all fail at once. That story has a date: March 11, 2011. First, learn to drive.',
          industry: 'Orientation complete: direct cycle, negative void coefficient, recirc throttle, level-centric safety case. Proceed to startup and flow-control missions; Fukushima support-failure study in Act III.',
        },
        level_complete: {
          title: 'One Loop — Oriented',
          outcome_learning: 'You can read a BWR board: the bubbles brake, the pumps throttle, and the level line rules them all.',
          outcome_industry: 'BWR design rationale, void physics, and safety-case structure briefed at rated power.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
