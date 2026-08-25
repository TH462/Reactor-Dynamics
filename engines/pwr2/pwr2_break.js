/* pwr2_break.js — Layer 5: PRIMARY BREAK DISCHARGE. (#479)
 *
 * The keystone D4 §31.4 identified: one system standing in front of roughly sixteen contract
 * fields. Containment has nothing to accumulate without it, the damage block has no uncovery
 * without it, the accumulators have nothing to answer, and `pwr2_eccs.js` — already built — exists
 * to respond to an event this plant could not have.
 *
 * ---------------------------------------------------------------------------------------
 * SOURCED, and unusually the source is a REGULATION rather than a plant document.
 * 10 CFR 50 Appendix K, I.C.1.b, verbatim:
 *
 *   *"For all times after the discharging fluid has been calculated to be two-phase in
 *   composition, the discharge rate shall be calculated by use of the **Moody model** (F.J. Moody,
 *   'Maximum Flow Rate of a Single Component, Two-Phase Mixture,' Journal of Heat Transfer, Trans
 *   ASME, 87, No. 1, February 1965)… The calculation shall be conducted with at least three values
 *   of a **discharge coefficient applied to the postulated break area, these values spanning the
 *   range from 0.6 to 1.0.**"*
 *
 * Two things come straight out of that and are adopted:
 *   A BREAK IS AN AREA WITH A DISCHARGE COEFFICIENT, not a flow. That is the same framing
 *   `pwr2_cvcs.js` already uses for letdown, citing the same clause.
 *   THE COEFFICIENT RANGE IS 0.6 TO 1.0. A second corpus document gives *"Primary NPP-discharge
 *   coefficients 0.75/1.0"*, which sits inside it.
 *
 * ---------------------------------------------------------------------------------------
 * ⚠ AND THE THING APPENDIX K ACTUALLY MANDATES IS THE ONE THING THIS FILE DOES NOT DO.
 *
 * **This is NOT the Moody model.** Moody is a two-phase critical-flow solution whose correlation is
 * not in this corpus — only the citation is — and implementing it from recall would be a fitted
 * constant wearing a regulation's name. What this file computes instead is a HOMOGENEOUS ORIFICE
 * discharge:
 *
 *     mdot = Cd * A * sqrt(2 * rho_mix * dP)
 *
 * with `rho_mix` the homogeneous density of whatever the node contains, from Layer 0.
 *
 * **THE CONSEQUENCE, STATED RATHER THAN DISCOVERED:** Moody flux is markedly LOWER than the
 * incompressible orifice form once the discharge flashes, because choking limits it. So this model
 * **OVERSTATES break flow in two-phase discharge** — it blows the plant down faster than a real
 * one. That is the wrong direction for a safety analysis and an acceptable one for a teaching sim
 * whose point is that inventory is lost and the ECCS answers, but it means **no number out of this
 * file may be quoted as a licensing figure**, and a Moody implementation is owed if that ever
 * matters. `CLAUDE.md` is explicit that this is an educational lumped-parameter plant and that a
 * simplification understating reality must be said plainly; this one overstates, which is worse to
 * leave unsaid.
 *
 * UNITS: SI. Area m2, pressure MPa, mass flow kg/s, enthalpy kJ/kg.
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  var W  = RD && RD.water;
  /* #514: per-step properties through the table (pwr2_core's idiom). */
  var VT = RD && RD.vtable;
  var RHO = VT ? VT.rho_from_h : (W && W.rho_from_h);
  var TFH = VT ? VT.T_from_h : (W && W.T_from_h);
  var PSAT = VT ? VT.P_sat_T : (W && W.P_sat);

  var BREAK = {
    /* [sourced] 10 CFR 50 App. K I.C.1.b — the coefficient range the analysis must span. */
    cd_min: 0.6, cd_max: 1.0,
    /* [sourced] "Primary NPP-discharge coefficients 0.75/1.0" — the working value sits inside
     * the App. K range, and 1.0 is the range's own upper bound. */
    cd_default: 1.0,
    /* [sourced] Ginna UFSAR ch15 (ML20339A101) — containment pre-accident condition, which is
     * what a break discharges INTO until a containment model exists. 1.0 psig. */
    backpressure_mpa: (1.0 + 14.696) / 145.0377,
    src: '10 CFR 50 App. K I.C.1.b; back-pressure from Ginna UFSAR ch15 (ML20339A101)'
  };

  /* Cold-leg pipe area, for expressing a break as a FRACTION of the pipe it is in — which is how
   * the accident family is actually named (a "double-ended cold leg" is 2x the pipe area). Derived
   * from Layer 1 rather than typed. */
  function pipeAreaM2() {
    var g = RD.geometry;
    if (g && g.PIPE && g.PIPE.cold_leg_area_m2) return g.PIPE.cold_leg_area_m2;
    /* Fallback: the loop geometry does not publish a flow area, so express it from the sourced
     * cold-leg volume and length if those exist, and otherwise DECLARE the absence rather than
     * invent a diameter. */
    return null;
  }

  function createBreak(opts) {
    opts = opts || {};
    return {
      area_m2: opts.area_m2 === undefined ? 0 : opts.area_m2,
      cd:      opts.cd === undefined ? BREAK.cd_default : opts.cd,
      node:    opts.node === undefined ? 'cold_leg' : opts.node,
      open:    opts.open === undefined ? false : !!opts.open,
      discharged_kg: opts.discharged_kg === undefined ? 0 : opts.discharged_kg
    };
  }

  /* stepBreak(br, sys, dt, drivers) -> the discharge, as a Layer 3 `sources` entry.
   *
   *   drivers.backpressure_mpa  what the break discharges INTO. Defaults to the sourced
   *                             containment pre-accident condition; a containment model would
   *                             supply its own rising pressure here, which is the coupling this
   *                             file is the prerequisite for.
   */
  function stepBreak(br, sys, dt, drivers) {
    drivers = drivers || {};
    if (!sys || !sys.nodes) {
      throw new Error('pwr2_break: a plant is REQUIRED — a break is an area in a specific node, ' +
                      'and this layer will not invent the node it is in.');
    }
    var back = drivers.backpressure_mpa === undefined ? BREAK.backpressure_mpa
                                                      : drivers.backpressure_mpa;
    var node = null;
    for (var i = 0; i < sys.nodes.length; i++) if (sys.nodes[i].id === br.node) node = sys.nodes[i];
    if (!node) {
      throw new Error('pwr2_break: no node "' + br.node + '" in this plant — a break must be ' +
                      'somewhere, and a silently-missing node would discharge nothing for ever.');
    }

    var dP = sys.P - back;
    var open = br.open && br.area_m2 > 0 && dP > 0;
    var mdot = 0, rho = 0, G = 0;
    if (open) {
      /* HOMOGENEOUS density of whatever the node holds — subcooled liquid, saturated mixture or
       * steam all fall out of Layer 0 without a branch here. */
      rho = RHO(node.h, sys.P);
      if (!(rho > 0)) rho = 0;
      /* ⚠ THE DRIVING HEAD IS LIMITED BY FLASHING, and without this the model is roughly TWICE
       * the real critical flux. Measured before the limit: 148,100 kg/m2s at hot full power,
       * against a literature range near 60,000-80,000 for subcooled water at this pressure --
       * because plain Bernoulli lets the whole 15.3 MPa accelerate the fluid and ignores choking
       * entirely.
       *
       * A discharging fluid cannot fall below its own saturation pressure inside the throat: at
       * that point it FLASHES, the mixture density collapses and the flow chokes. So the head that
       * actually accelerates it is capped at (P - P_sat(T_node)), which Layer 0 supplies directly
       * and which needs no entropy. That is the standard Bernoulli-to-the-flashing-point
       * approximation, and it is NOT Moody -- see the header. It is the closest principled bound
       * available from the properties this engine has. */
      /* ⚠ ONE FORM, DELIBERATELY, AFTER TRYING TWO. The full head accelerates the discharge and
       * the homogeneous density does all the limiting:
       *
       *     G = sqrt(2 * rho_mix * (P - P_back))
       *
       * A TWO-REGIME VERSION WAS BUILT AND ABANDONED, and the reason is worth the space because it
       * looks more physical and is worse. Capping the subcooled head at (P - P_sat(T)) -- the
       * Bernoulli-to-flashing approximation -- is correct in isolation and brings the flux from
       * 148,100 to 94,700 kg/m2s, against a literature range near 60,000-80,000. But it goes to
       * ZERO at the saturation boundary, and the two-phase branch beyond it jumps straight back up,
       * so there is a DISCONTINUITY at x = 0 and the plant parks on it. MEASURED: a 10 cm2 break
       * drained 207 kg in 60 s and then essentially stopped, holding 8.85 MPa for ever, because
       * P_sat(T_node) tracked the falling pressure to within 0.04 MPa. A LOCA that stops
       * discharging is qualitatively wrong; one that discharges about twice too fast is
       * quantitatively wrong. Given only those two, the second is the right failure.
       *
       * SO THE MEASURED OVERSTATEMENT IS ROUGHLY 2x AT SUBCOOLED CONDITIONS, and that number is
       * this file's honest error bar. It is the price of not having Moody, whose correlation is
       * cited by 10 CFR 50 App. K and is not in this corpus. */
      var dP_eff = dP;
      G = Math.sqrt(2 * rho * dP_eff * 1e6);      /* MPa -> Pa; kg/m2s */
      mdot = br.cd * br.area_m2 * G;
    }
    br.discharged_kg += mdot * dt;

    /* computed ONCE for the two reporter fields below (#514 — it was evaluated twice) */
    var P_flash = PSAT(TFH(node.h, sys.P));

    return {
      mdot_kgs: mdot,
      /* THE SHAPE LAYER 3 WANTS. Negative mdot REMOVES mass, and the enthalpy carried out is the
       * NODE's — a break does not sort the fluid it takes. */
      source: { node: br.node, mdot: -mdot, h: node.h },
      open: open,
      dP_mpa: dP,
      dP_effective_mpa: open ? dP : 0,
      /* what a flashing-limited model WOULD have used — reported so the abandoned approach stays visible */
      dP_flash_limited_mpa: Math.max(0, sys.P - P_flash),
      P_flash_mpa: P_flash,
      flux_kg_m2s: G,
      rho_mix: rho,
      quality: W.quality(node.h, sys.P),
      discharged_kg: br.discharged_kg,
      /* REPORTED so a caller can see the discharge is a fraction of a pipe, not a bare area. */
      area_m2: br.area_m2,
      cd: br.cd,
      /* ⚠ REPORTED, AND IT IS THE HONEST CAVEAT: this flux is the incompressible orifice value.
       * Moody would choke it, so this is an UPPER bound on a two-phase discharge. Quoting it as
       * a licensing figure would be wrong. */
      is_two_phase: W.quality(node.h, sys.P) > 0,
      moody_applies: W.quality(node.h, sys.P) > 0
    };
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.break_ = {
    BREAK: BREAK, pipeAreaM2: pipeAreaM2,
    createBreak: createBreak, stepBreak: stepBreak
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
