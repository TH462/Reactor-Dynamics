/*
 * rbmk_rods.js — RBMK rod-reactivity functions, ORM computation, and rod-group
 * construction (M2 §5.4, §9, §12). Pure helpers over config + group objects; the
 * engine orchestrates motion and the version-specific reactivity sum.
 *
 * INTERNAL position convention (§9/§14.1): a group's `steps` is INSERTION depth
 * (0 = fully withdrawn, max_steps = fully inserted) — the OPPOSITE of the PWR's
 * withdrawn-based steps. The contract `position_pct` (100 = withdrawn) is derived
 * by the engine on the way out. Rod reactivity uses the per-rod functions below,
 * NOT the PWR/BWR SCRUVE.
 *
 * Attaches RD.rbmkRods.
 */
;(function (RD) {
  'use strict';

  // Insertion depth in metres from a group's INSERTION steps.
  function depthFromSteps(steps, cfg) {
    return (steps / cfg.rods.max_steps) * cfg.reactivity.rod_full_depth_m;
  }

  // pre_chernobyl per-rod reactivity vs depth z (§5.4). As a withdrawn rod begins
  // to insert, the graphite displacer enters the lower water column BEFORE the
  // absorber, displacing a neutron-absorbing water column and locally ADDING
  // reactivity — the positive scram effect — before the absorber arrives.
  function rhoDisplacerPre(z, cfg) {
    var r = cfg.reactivity, zw = r.z_water_m, k = r.k_disp;
    if (z <= zw) return k * Math.sin(Math.PI * z / zw);        // POSITIVE region
    return -k * (z - zw) / r.L_abs_m;                           // negative (absorber in core)
  }

  // post_chernobyl per-rod reactivity (§5.4): monotonic negative from the start —
  // modified rods / added absorbers, no positive region.
  function rhoRodPost(z, cfg) {
    var r = cfg.reactivity;
    return -r.k_abs * (z / r.L_abs_m);
  }

  // The version-appropriate per-rod function for the displacer-bearing (control)
  // rods. Shutdown/AZ rods are always pure absorbers (rhoRodPost), both versions.
  function perRodFor(version, cfg) {
    return (version === 'pre_chernobyl') ? rhoDisplacerPre : rhoRodPost;
  }

  // ORM (§9): equivalent withdrawn rods available to insert. INTERNAL steps =
  // insertion, so steps/max_steps is the INSERTED fraction — and ORM counts the
  // inserted reserve (control/manual groups only). Most rods WITHDRAWN ⇒ small
  // inserted fraction ⇒ low ORM (the Chernobyl precondition).
  function getOrm(groups, cfg) {
    var total_worth = 0, i, g;
    for (i = 0; i < groups.length; i++) {
      g = groups[i];
      if (g.function === 'control') total_worth += g.worth_pcm;   // (no 'manual' group exists — RBMK groups are control/auto/shutdown)
    }
    if (total_worth <= 0) return 0;
    var orm = 0;
    for (i = 0; i < groups.length; i++) {
      g = groups[i];
      if (g.function !== 'control') continue;
      var inserted_fraction = g.steps / g.max_steps;
      var group_equiv_rods = (g.worth_pcm / total_worth) * cfg.rods.total_rod_count;
      orm += inserted_fraction * group_equiv_rods;
    }
    return orm;
  }

  // Build the rod-group objects from config. `steps` (insertion) is positioned by
  // the engine per initial state; here they start fully withdrawn (steps = 0).
  function makeGroups(cfg) {
    return cfg.rods.groups.map(function (def) {
      return {
        id: def.id, name: def.name, function: def.function,
        steps: 0, max_steps: cfg.rods.max_steps,
        rod_count: def.rod_count, worth_pcm: def.worth_pcm, displacer: !!def.displacer,
        moving: false, direction: 0, speed: 'normal', scrammed: false,
        velocity: 0, step_accumulator: 0, nudge_target: null,
        insertion_limit_steps: null, at_insertion_limit: false,
      };
    });
  }

  RD.rbmkRods = {
    depthFromSteps: depthFromSteps,
    rhoDisplacerPre: rhoDisplacerPre,
    rhoRodPost: rhoRodPost,
    perRodFor: perRodFor,
    getOrm: getOrm,
    makeGroups: makeGroups,
  };

})(globalThis.RD || (globalThis.RD = {}));
