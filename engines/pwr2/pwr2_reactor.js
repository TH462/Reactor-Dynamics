/* pwr2_reactor.js — Layer 5: THE REACTOR. Kinetics and fuel, COUPLED. (#479)
 *
 * This is the file that closes the reactivity loop. Until it existed, `pwr2_kinetics.js` and
 * `pwr2_fuel.js` were each correct and each inert: kinetics threw unless somebody handed it a fuel
 * temperature, fuel threw unless somebody handed it a power, and Layer 4 took `drivers.corePower`
 * as a number a caller invented. Nothing connected them, so temperature could not move power and
 * the A/B harness could only ever compare steady states.
 *
 * ---------------------------------------------------------------------------------------
 * THE COUPLING, AND WHY THE ORDER IS THE WAY IT IS
 *
 *     1. kinetics reads LAST step's fuel temperature   -> power
 *     2. fuel reads THIS step's power                  -> temperature, and the heat to coolant
 *     3. Layer 4 receives that heat as a `heats` map
 *
 * Step 1 uses a one-step-old fuel temperature. That is a deliberate explicit coupling and not an
 * oversight: making it implicit would need an iteration inside every step, and the error it saves
 * is bounded by dt/tau_fuel = 0.02/3.26 = 0.6 %, against a Doppler term that is itself built on an
 * UNSOURCED coefficient. Solving a 0.6 % lag exactly while alpha_D is a placeholder would be
 * precision in the wrong place. It is recorded here so the next person does not have to rediscover
 * that it was a choice.
 *
 * ⚠ THE HEAT REACHING THE COOLANT COMES FROM `pwr2_fuel` ALONE — never from `corePower` as well.
 * Fuel's `heats` map already carries BOTH halves: what came through the gap and the ~2.6 % deposited
 * directly in the moderator. Adding `drivers.corePower` on top would double-count the entire core
 * power, and it would do so INVISIBLY at steady state, because a plant fed twice its heat simply
 * settles hotter and still balances. `stepPlant` merges `heats` and `corePower` additively
 * (pwr2_sources.js), so this is a live trap, not a hypothetical one.
 *
 * ---------------------------------------------------------------------------------------
 * FUEL IS INITIALISED ON ITS STEADY SOLVE, not at an arbitrary temperature. A reactor created at
 * rated power with cold fuel spends the first ~15 s dumping the difference into the coolant, which
 * looks exactly like a physics defect and is purely an initial-condition error.
 *
 * UNITS ARE SI internally. Powers in kW, temperatures degC, reactivity dk/k.
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  var W  = RD && RD.water;
  var K  = RD && RD.kinetics;
  var F  = RD && RD.fuel;

  var RATED_THERMAL_KW = 300000;   /* 300 MWt — this plant's rating */

  function coreTemp(sys) {
    for (var i = 0; i < sys.nodes.length; i++) {
      if (sys.nodes[i].id === 'core') return W.T_from_h(sys.nodes[i].h, sys.P);
    }
    return NaN;
  }

  /* createReactor(opts)
   *   opts.P            initial fission power FRACTION of rated (default 1.0)
   *   opts.coolTemp_c   coolant temperature to settle the fuel against (default the mod reference)
   *   opts.rated_thermal_kW
   * Any other option is passed through to createKinetics, so rho_excess, the references and the
   * rod lineup stay callable from one place. */
  function createReactor(opts) {
    opts = opts || {};
    var rated = opts.rated_thermal_kW === undefined ? RATED_THERMAL_KW : opts.rated_thermal_kW;
    var kin   = K.createKinetics(opts);
    var geom  = F.deriveGeometry(opts);
    var cool  = opts.coolTemp_c === undefined ? kin.T_mod_ref_c : opts.coolTemp_c;
    /* Settle the fuel against the power it is actually starting at, INCLUDING the decay fraction —
     * kinetics reports Q_total = P*(1-f0) + sum(H_i), which equals P at any steady state. */
    var fuel  = F.createFuel({ rated_thermal_kW: rated,
                               T_fuel_c: F.steadyFuelTemp(geom, rated * kin.P, cool) });
    return { kin: kin, fuel: fuel, rated_thermal_kW: rated };
  }

  /* stepReactor(rx, sys, dt, drivers) -> the reactor's contribution to Layer 4.
   *
   *   drivers.rodGroups  [{ steps, max_steps, worth }]
   *   drivers.boron_ppm  lumped (owner ruling 2026-08-16)
   *   drivers.modTemp_c  optional override; kinetics derives a leg average when absent
   *
   * Note there is NO fuelTemp_c and NO Q_core_kW in that list. Those are the two arguments the
   * layers below refuse to invent, and supplying them is exactly this file's job. */
  function stepReactor(rx, sys, dt, drivers) {
    drivers = drivers || {};
    var cool = coreTemp(sys);

    var kr = K.stepKinetics(rx.kin, sys, dt, {
      fuelTemp_c: rx.fuel.T_fuel_c,          /* last step's — see the header on the explicit lag */
      boron_ppm:  drivers.boron_ppm,
      rodGroups:  drivers.rodGroups,
      modTemp_c:  drivers.modTemp_c
    });

    var fr = F.stepFuel(rx.fuel, dt, {
      Q_core_kW:  kr.Q_total_frac * rx.rated_thermal_kW,
      coolTemp_c: cool
    });

    return {
      /* THE SPLIT, CARRIED THROUGH. `power_pct` is FISSION; `core_heat_pct` is TOTAL. Equal at
       * every steady state, apart the moment the rods drop — CLAUDE.md and CONTEXT.md §6.3 both
       * carry this trap, and it is the reason both are reported rather than one. */
      power_pct:      kr.power * 100,
      core_heat_pct:  kr.Q_total_frac * 100,
      decay_pct:      kr.decay_frac * 100,
      rho_pcm:        kr.rho_pcm,
      xenon_pct_eq:   kr.xenon_pct_eq,
      T_fuel_c:       fr.T_fuel_c,
      T_fuel_rise_c:  fr.T_fuel_rise_c,
      T_centerline_c: fr.T_centerline_c,
      T_mod_c:        kr.T_mod_c,
      coolTemp_c:     cool,
      tau_fuel_s:     fr.tau_s,
      /* THE ONLY heat path. Do not add corePower alongside this — see the header. */
      heats:          fr.heats,
      Q_core_kW:      kr.Q_total_frac * rx.rated_thermal_kW
    };
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.reactor = {
    RATED_THERMAL_KW: RATED_THERMAL_KW,
    createReactor: createReactor, stepReactor: stepReactor, coreTemp: coreTemp
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
