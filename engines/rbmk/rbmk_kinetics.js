/*
 * rbmk_kinetics.js — the RBMK's own copy of the six-group point-kinetics core
 * with the prompt-criticality fast-path (§3), the nonlinear amplified void
 * coefficient + ORM stability penalty (§5.3), xenon/iodine (§5.5), decay heat
 * (§3), and the prompt-excursion energy-deposition + two-path destruction (§11).
 *
 * Pure functions over the engine's true-physics state `s` and config `cfg`; the
 * engine calls them in the §6 dependency order. SI/Δk-k throughout (energy
 * deposition stays cal/g/s, §11).
 *
 * Attaches RD.rbmkKinetics.
 */
;(function (RD) {
  'use strict';

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  // ---- void coefficient: nonlinear, state-dependent (§5.3) ------------------
  // Amplifies under exactly the accident conditions — low power, high xenon,
  // high void — and the amplifications COMPOUND. (pre/post differ via cfg.)
  function alphaVoidEffective(P, xenon_fraction, void_fraction, cfg) {
    var r = cfg.reactivity;
    var alpha_base   = r.alpha_void_base;
    var power_factor = 1.0 + r.alpha_void_low_power_gain * Math.max(0, 0.20 - P) / 0.20;
    var xenon_factor = 1.0 + r.alpha_void_xenon_gain     * Math.max(0, xenon_fraction - 1.0);
    var void_factor  = 1.0 + r.alpha_void_high_void_gain * Math.max(0, void_fraction - 0.30);
    return alpha_base * power_factor * xenon_factor * void_factor;
  }

  // ORM stability penalty (§5.3): low ORM means lost capacity to oppose the
  // excursion AND amplifies the void feedback.
  function ormStabilityFactor(orm, cfg) {
    var r = cfg.reactivity, orm_rated = r.orm_rated, orm_min = r.orm_min;
    if (orm >= orm_rated) return 1.0;
    if (orm >= orm_min) {
      return 1.0 + r.orm_instability_gain * (orm_rated - orm) / orm_rated;
    }
    var deficit = orm_min - orm;
    return 1.0
      + r.orm_instability_gain * (orm_rated - orm_min) / orm_rated
      + r.orm_critical_gain * Math.pow(deficit, 1.5);
  }

  // ρ_void (§5.3) — the central mechanism. xenon_fraction = X / X_eq. void_ref is
  // the operating void PINNED at reset (M1 D2 / Flag F1 pattern): the amplified
  // coefficient then multiplies the void CHANGE from operating, not a large
  // standing offset (which, multiplied by the power-dependent amplification, is
  // itself a spurious positive feedback). Falls back to the config constant.
  function rhoVoid(P, xenon_fraction, void_fraction, orm, cfg, void_ref) {
    if (void_ref == null) void_ref = cfg.reactivity.void_ref;
    return alphaVoidEffective(P, xenon_fraction, void_fraction, cfg)
         * ormStabilityFactor(orm, cfg)
         * (void_fraction - void_ref);
  }

  // ---- point kinetics with the prompt fast-path (§3) ------------------------
  // When ρ > β the power rises on the prompt timescale; the standard Euler step
  // understates it (prompt doubling time < dt), so apply the prompt-jump growth,
  // capped to prevent numeric blowup. Precursors advance every step regardless.
  function stepKinetics(s, cfg, rho, dt) {
    var d = cfg.kinetics.delayed, Lambda = d.Lambda, beta = d.beta;
    if (rho > beta && !s._scram_complete) {
      var prompt_excess = rho - beta;
      var growth = Math.exp(prompt_excess / Lambda * dt);
      if (growth > cfg.kinetics.MAX_PROMPT_GROWTH) growth = cfg.kinetics.MAX_PROMPT_GROWTH;
      s._P = s._P * growth;
    } else {
      var sumLC = 0;
      for (var i = 0; i < 6; i++) sumLC += d.lambda_i[i] * s._C[i];
      var dP = ((rho - beta) / Lambda) * s._P + sumLC;
      s._P = Math.max(0.0, s._P + dP * dt);
    }
    for (var j = 0; j < 6; j++) {
      var dC = (d.beta_i[j] / Lambda) * s._P - d.lambda_i[j] * s._C[j];
      s._C[j] += dC * dt;
    }
    s.power_pct = s._P * 100;
  }

  // Decay heat — two-term, production toward the equilibrium fraction for current
  // power (so it builds while running and persists/decays after scram), exactly
  // as the PWR engine (CONTEXT §4 / M1 decay decision).
  function stepDecay(s, cfg, dt) {
    var dc = cfg.kinetics.decay;
    s._H1 += (dc.H1_0 * dc.lambda_1 * s._P - dc.lambda_1 * s._H1) * dt;
    s._H2 += (dc.H2_0 * dc.lambda_2 * s._P - dc.lambda_2 * s._H2) * dt;
    s.decay_heat_pct = (s._H1 + s._H2) * 100;
  }

  // Xenon / iodine (§5.5).
  function stepXenon(s, cfg, dt) {
    var x = cfg.kinetics.xenon, P = s._P;
    var dI = x.gamma_I * P - x.lambda_I * s._I;
    var dX = x.lambda_I * s._I + x.gamma_X * P - x.lambda_X * s._X - x.sigma_phi * P * s._X;
    s._I += dI * dt;
    s._X += dX * dt;
    s.xenon_pct_eq = (s._X / s._X_eq) * 100;
  }

  // X_eq (§5.5): equilibrium xenon at full power.
  function computeXeq(cfg) {
    var x = cfg.kinetics.xenon;
    var I_eq = x.gamma_I / x.lambda_I;
    return (x.lambda_I * I_eq + x.gamma_X) / (x.lambda_X + x.sigma_phi);
  }

  // ---- energy deposition + destruction (§11) --------------------------------
  // Rolling EMA of power so only a SUSTAINED, intense spike trips the steam-
  // explosion path. instant_rate folds the rated MWt into the scale.
  function stepEnergyDeposition(s, cfg, dt) {
    var dr = cfg.destruction;
    var instant_rate = s._P * dr.energy_deposition_scale;     // cal/g/s
    var alpha = dt / (dr.ema_tau + dt);
    s.energy_deposition_rate = alpha * instant_rate + (1 - alpha) * s.energy_deposition_rate;
  }

  // Check BOTH destruction mechanisms each step (§11). Returns true once melted.
  function checkDestruction(s, cfg) {
    if (s.melted) return true;
    var dr = cfg.destruction;
    // Path A — gradual thermal melt (loss of cooling / dryout over time).
    if (s.fuel_temp_c > dr.melt_threshold_c) {
      s.melted = true; s.destruction_cause = 'thermal_melt'; return true;
    }
    // Path B — prompt steam explosion (rapid, intense energy deposition).
    if (s.energy_deposition_rate > dr.steam_explosion_threshold) {
      s.melted = true; s.destruction_cause = 'steam_explosion'; s.steam_explosion_occurred = true; return true;
    }
    return false;
  }

  RD.rbmkKinetics = {
    alphaVoidEffective: alphaVoidEffective,
    ormStabilityFactor: ormStabilityFactor,
    rhoVoid: rhoVoid,
    stepKinetics: stepKinetics,
    stepDecay: stepDecay,
    stepXenon: stepXenon,
    computeXeq: computeXeq,
    stepEnergyDeposition: stepEnergyDeposition,
    checkDestruction: checkDestruction,
  };

})(globalThis.RD || (globalThis.RD = {}));
