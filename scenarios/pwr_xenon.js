/*
 * pwr_xenon.js — Poisoned (campaign Act II, mission 6).
 *
 * Xenon-135 taught on the arc the engine reproduces faithfully: the
 * POST-SHUTDOWN transient. The instructor scrams the plant deliberately,
 * then compresses time while the poison builds to its crest (~+14% of
 * full-power equilibrium near +5 h in this engine) and begins to decay —
 * the classic "dead time" every real operator plans around, and the exact
 * trap that set the stage at Chernobyl.
 *
 * Demonstration mode: the physics is hours long and the lesson is watching
 * it, not fighting it. Xenon has no instrument twin (here or in practice),
 * so the beats trigger on documented true_state hooks while the commentary
 * tells the player how a crew infers it. Honesty beats: no RPS-reset path
 * is modeled (restart is "the next shift's problem"), and the trainer's
 * xenon is a lumped model of a spatially messy reality.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_xenon = {
    id: 'pwr_xenon',
    title: 'Poisoned',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'demonstration',
    description: 'Shut the reactor down, and a ghost rises in the core. Meet xenon-135 — and the dead time it enforces.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Full power, steady. Time to meet the strangest character in reactor physics. Some fission fragments decay into xenon-135 — the hungriest neutron-eater known. Right now the core destroys it as fast as it forms: the neutron flood burns it off, and the books balance. Watch what happens to that balance when the flood stops. I am going to scram the reactor — on purpose.',
          industry: 'Equilibrium Xe-135 at rated power: production (direct yield + I-135 decay) balanced by burnup + decay. Burnup requires flux. Demonstration: deliberate trip → observe the production/removal imbalance evolve.',
        },
        advance: 'wait_for_trigger' },

      { id: 'shutdown',
        trigger: { type: 'delay', value: 12.0 },
        commentary: {
          learning: 'SCRAM. The chain reaction is dead — but the fission fragments from the last weeks of operation are still in the fuel, still decaying, and a river of them decays INTO xenon. The furnace that used to burn the xenon off is out. Production continues; destruction has stopped. The poison can only rise. I am compressing hours into moments — watch.',
          industry: 'Manual trip. Xe burnup term → 0 with flux; I-135 inventory (6.6 h half-life) continues feeding Xe-135 production. Net accumulation is now unavoidable. Time compression engaged for the multi-hour transient.',
        },
        commands: [{ action: 'scram' }],
        speed: 300,
        advance: 'wait_for_trigger' },

      { id: 'xenon_builds',
        trigger: { type: 'true_state', field: 'xenon_pct_eq', direction: 'above', value: 106.0 },
        commentary: {
          learning: 'An hour in: the xenon is already well above its operating level and climbing. Here is the operational sting: if the grid called right now and begged for this reactor back, the crew could barely give it — the core is MORE poisoned than when it was running, and every rod of margin the poison eats makes restart harder. No gauge shows xenon directly — not here, not in a real control room. Crews infer it, from decay curves and from how much reactivity has gone missing.',
          industry: 'Xe >106% of full-power equilibrium, ~1 h post-trip. Shutdown margin is being consumed; a restart attempt now would fight rising poison with a shrinking rod bank. No direct Xe indication exists — inferred from reactivity balance and time-since-trip.',
        },
        speed: 600,
        advance: 'wait_for_trigger' },

      { id: 'peak',
        trigger: { type: 'true_state', field: 'xenon_pct_eq', direction: 'above', value: 113.0 },
        commentary: {
          learning: 'Five hours after shutdown, the poison crests — nearly a seventh more xenon than the reactor ran with. This valley of time is called the XENON DEAD TIME: for many hours, restarting is somewhere between hard and forbidden. In 1986, the crew at Chernobyl found their reactor deep in this pit — and instead of waiting, they pulled almost every rod to fight it. Hold that thought for Act V of your training. Now watch the other side of the mountain: with no flux making iodine, the supply line starves, and the xenon begins to decay away on its own clock.',
          industry: 'Xe peak (~113–114% eq, ~5 h post-trip in this model). Classic dead-time window: restart reactivity requirements may exceed available margin. Historical anchor: the Chernobyl xenon pit and rod-bank withdrawal. Post-peak: I-135 supply decaying, net Xe decay begins.',
        },
        speed: 600,
        advance: 'wait_for_trigger' },

      { id: 'complete',
        trigger: { type: 'true_state', field: 'xenon_pct_eq', direction: 'below', value: 112.0 },
        commentary: {
          learning: 'Past the crest and falling — in another day the core will be cleaner than it ever is while running, and restart becomes easy. Two honest notes: this trainer offers no restart after a trip (recovering the protection system is the next shift’s paperwork, not your physics lesson), and its xenon is one number for the whole core — the real poison also puckers and sloshes region by region. But the calendar you just watched is real: back off or shut down, and the ghost rises for hours before it fades. Reactor operators do not fight that clock. They respect it.',
          industry: 'Xe past peak and decaying. Model notes: no RPS reset/restart path post-trip; point-model Xe (no spatial oscillation). Operational takeaway: plan shutdowns and deep power reductions around the Xe timeline; never chase the pit with rod margin — the 1986 lesson.',
        },
        speed: 1,
        level_complete: {
          title: 'Poisoned — Understood',
          outcome_learning: 'You watched an invisible poison rise for five hours, crest, and start to fade — the clock every reactor crew lives by.',
          outcome_industry: 'Full post-trip Xe-135 transient observed: accumulation from I-135 decay, ~5 h peak, onset of decay. Dead-time concept established.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
