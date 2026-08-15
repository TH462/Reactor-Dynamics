/* pwr2_cvcs.js — Layer 5: CHARGING, LETDOWN AND BORON. (#479)
 *
 * Reads Layers 0-4. The second Layer 5 system, after the SG secondary.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS LAYER MAKES EXPRESSIBLE.
 *
 * Until now the loop's mass was closed: `stepPlant` took boundary sources but nothing produced
 * them, so **inventory could not be operated**. Charging and letdown are how a PWR operator
 * actually holds level, and boron is how reactivity is trimmed over a cycle. Both are Tier A
 * material and neither existed.
 *
 * Note what is NOT here: **boron does not yet DO anything.** Concentration is tracked as a mass
 * balance and published; the reactivity coupling (~8 pcm/ppm, sourced below) belongs to the
 * kinetics layer, which is not built. Publishing ppm without reactivity is honest — publishing a
 * reactivity effect computed here would put kinetics in the wrong layer.
 *
 * ---------------------------------------------------------------------------------------
 * SOURCES, AND THE SCALING BASIS IS DECLARED RATHER THAN ASSUMED.
 *
 *   Ginna UFSAR ch.15 (ML20339A101), the ANCHOR PLANT:
 *     "three positive displacement charging pumps can deliver a maximum of 180 gpm
 *      (charging flow is normally maintained at 46 gpm)"
 *     "The volume of reactor coolant is 5123 ft3"
 *   Westinghouse Technology Systems Manual §4.1, CVCS (ML11223A214), a generic 4-loop plant:
 *     "Normally operators establish a letdown flow of 75 gpm."
 *     "A flow balance is maintained on the VCT by the 75 gpm letdown and 12 gpm seal [return]"
 *   ML11223A220:  "Boron concentration in refueling water storage tank, ppm  2,000 - 2,500"
 *   ML11216A094:  "Boric acid worth: 8 pcm/ppm (BOL)"   <- recorded, NOT used here (kinetics)
 *                 "Maximum dilution rate: 120 gpm"
 *
 * **THE SCALING BASIS IS VOLUME, NOT POWER, AND THAT IS A CHOICE.** Every other scaled quantity in
 * this design set is power-scaled (SG inventory, heat-transfer area, pump casing). CVCS is not,
 * because what charging and letdown *do* is move a FRACTION OF INVENTORY PER MINUTE, and boration
 * moves PPM PER MINUTE — both are volume-normalised by definition. Power-scaling them would
 * preserve gpm and distort the only two numbers an operator reads.
 *
 * The two bases genuinely disagree here, and the size of the disagreement is the reason to state
 * the choice instead of burying it:
 *
 *     Ginna     145.07 m3 at ~1520 MWt = 0.0954 m3/MWt
 *     SLS-100    23.66 m3 at   300 MWt = 0.0789 m3/MWt      <- 17 % TIGHTER
 *
 *     charging max, volume-scaled   180 x 0.1631 = 29.4 gpm      <- USED
 *     charging max, power-scaled    180 x 0.1974 = 35.5 gpm      <- reported by the gate
 *
 * A tighter plant is a twitchier plant: the same gpm moves level faster. Volume-scaling keeps the
 * %/min an operator learns; power-scaling would keep the pump nameplate. This plant is for
 * teaching dynamics, so the operator-facing quantity wins. **The gate reports both.**
 *
 * ---------------------------------------------------------------------------------------
 * DECLARED OMISSIONS — stated here, not discovered later.
 *
 *   NO VOLUME CONTROL TANK. Charging draws from an infinite source at the selected boron
 *   concentration and letdown discharges to one. The VCT is a real inventory with a real level
 *   and a real gas space, and it is where "letdown isolated" actually bites. Not modelled.
 *
 *   NO SEAL INJECTION. WTSM gives 20 gpm nominal across four pumps. This plant has ONE pump, and
 *   a seal flow is a property of the SEAL, not of plant size — so it neither volume-scales nor
 *   power-scales cleanly, and 5 gpm on a 6,251 gal RCS is proportionally far larger than 20 gpm
 *   on a four-loop plant. That is a real modelling question and it is left OPEN rather than
 *   answered by picking whichever scaling looks tidy.
 *
 *   NO LETDOWN HEAT EXCHANGER, no ion exchange, no degasifier. This layer moves mass and boron.
 *
 * UNITS ARE SI INTERNALLY. P MPa · m kg · mdot kg/s · C ppm.  gpm appears only in the sourced
 * constants and their conversion, and the gate reports US customary first.
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  var W = RD && RD.water, GEO = RD && RD.geometry;

  var GAL_PER_M3 = 264.172;
  var FT3_TO_M3 = 0.0283168466;

  /* ---- THE SCALE FACTOR, DERIVED ONCE FROM GEOMETRY -------------------------------------
   * Computed from Layer 1 rather than written down, so it moves when the geometry does. That is
   * the same rule the SG's ratedU() follows and the reason §24's provisional geometry does not
   * silently strand a constant here. */
  var GINNA_RCS_M3 = 5123 * FT3_TO_M3;          // [sourced] Ginna UFSAR ch.15
  function rcsVolume() {
    var V = 0;
    GEO.NODES.forEach(function (n) { V += n.V; });
    return V;
  }
  function volumeScale() { return rcsVolume() / GINNA_RCS_M3; }

  var CVCS = {
    /* [derived] from the sourced Ginna figures by the declared volume basis */
    charging_max_gpm:    function () { return 180 * volumeScale(); },
    charging_normal_gpm: function () { return  46 * volumeScale(); },
    /* [sourced] concentrations. The boric acid tank is taken at the TOP of the sourced RWST band
     * because a boration source that cannot out-borate the RCS is not a boration source; 2,000 is
     * the bottom of the same band and the gate reports which end is used. */
    boric_acid_ppm: 2500,          // [sourced] ML11223A220, top of the 2,000-2,500 band
    primary_water_ppm: 0,          // [derived] demineralised makeup carries no boron
    /* [recorded, NOT used] the reactivity coupling belongs to the kinetics layer */
    boron_worth_pcm_per_ppm: 8.0,  // [sourced] ML11216A094, BOL
    /* Letdown backpressure — the orifice discharges to the letdown HX / VCT, not to atmosphere.
     * [derived]: WTSM §4.1 puts the low-pressure letdown line downstream of a pressure control
     * valve holding a few hundred psig to keep the coolant subcooled. Taken as 2.07 MPa (300 psi). */
    letdown_backpressure_mpa: 2.07
  };

  /* ---- LETDOWN IS AN ORIFICE, NOT A SETPOINT -------------------------------------------
   * Flow follows the orifice law, mdot ~ sqrt(dP), the same form `Manuals/12` §12.4b adopted for
   * break discharge under 10 CFR 50 App. K I.C.1.b -- "a discharge coefficient applied to the
   * postulated break area", i.e. a break (and an orifice) is an AREA, not a flow.
   *
   * THE CONSEQUENCE IS THE POINT, and it is a Tier A coupling in miniature: letdown WEAKENS as the
   * plant depressurises, so the same orifice lineup that balances charging at 2235 psi over-charges
   * at 1000 psi. An operator who set-and-forgot letdown during a cooldown fills the pressurizer.
   * A constant-flow letdown would teach the opposite.
   *
   * The coefficient is CALIBRATED ONCE so the orifice passes the normal letdown flow at normal
   * operating pressure -- an algebraic consequence of two derived numbers, not a fitted constant. */
  function orificeK(P_nop) {
    var dP = (P_nop === undefined ? 15.41 : P_nop) - CVCS.letdown_backpressure_mpa;
    return normalLetdownKgs() / Math.sqrt(dP);
  }

  function gpmToKgs(gpm, rho) {
    return gpm / GAL_PER_M3 / 60 * (rho === undefined ? 1000 : rho);
  }

  /* Normal letdown balances normal charging at steady state. With no seal injection and no VCT
   * modelled (see the omissions above) that balance is exactly one-to-one -- stated rather than
   * derived from a flow diagram this layer does not have. */
  function normalLetdownKgs() {
    return gpmToKgs(CVCS.charging_normal_gpm(), 1000);
  }

  function createCVCS(opts) {
    opts = opts || {};
    var P_nop = opts.P_nop === undefined ? 15.41 : opts.P_nop;
    return {
      /* charging DEMAND as a fraction of maximum, 0..1 -- the operator's control */
      chargingDemand: opts.chargingDemand === undefined ? null : opts.chargingDemand,
      /* letdown orifice lineup: 0 = isolated, 1 = normal. A real plant picks orifices A/B; this
       * layer carries an open AREA fraction, which is the same physics with fewer valves. */
      letdownOpen: opts.letdownOpen === undefined ? 1 : opts.letdownOpen,
      /* what the charging pumps are lined up to: 'borate' | 'dilute' | 'match' */
      makeupSource: opts.makeupSource === undefined ? 'match' : opts.makeupSource,
      boron_ppm: opts.boron_ppm === undefined ? 700 : opts.boron_ppm,
      K: opts.K === undefined ? orificeK(P_nop) : opts.K,
      isolated: !!opts.isolated
    };
  }

  /* stepCVCS(cv, sys, dt) -> {charging_kgs, letdown_kgs, net_kgs, boron_ppm, sources}
   *
   * `sources` is in the shape Layer 3 wants for `drivers.sources`, so the caller hands it straight
   * to stepPlant rather than unpacking it. Charging enters the COLD LEG and letdown leaves from it
   * -- both are cold-leg connections on a real plant, and putting them on the same node keeps this
   * layer from having an opinion about loop topology that Layer 3 already owns. */
  function stepCVCS(cv, sys, dt) {
    var node = null;
    for (var i = 0; i < sys.nodes.length; i++) if (sys.nodes[i].id === 'cold_leg') node = sys.nodes[i];
    var rho = node ? W.rho_from_h(node.h, sys.P) : 700;

    var demand = cv.chargingDemand === null
      ? CVCS.charging_normal_gpm() / CVCS.charging_max_gpm()
      : Math.max(0, Math.min(1, cv.chargingDemand));
    var charging = cv.isolated ? 0 : gpmToKgs(demand * CVCS.charging_max_gpm(), 1000);

    /* THE ORIFICE. Negative dP means the sink is above the plant -- letdown cannot run backwards
     * through it, so it stops rather than reversing sign under a square root. */
    var dP = sys.P - CVCS.letdown_backpressure_mpa;
    var letdown = (cv.letdownOpen <= 0 || dP <= 0) ? 0 : cv.letdownOpen * cv.K * Math.sqrt(dP);

    /* ---- BORON, AS A MASS BALANCE ON THE WHOLE RCS -----------------------------------
     * d(M*C)/dt = charging*C_in - letdown*C_rcs. Letdown carries the RCS concentration because it
     * is drawn from the RCS; charging carries whatever the pumps are lined up to. A dilution is
     * therefore SLOW at high boron and fast at low, which is the real shape and falls out of the
     * balance rather than being imposed. */
    var C_in = cv.makeupSource === 'borate' ? CVCS.boric_acid_ppm
             : cv.makeupSource === 'dilute' ? CVCS.primary_water_ppm
             : cv.boron_ppm;                              /* 'match' -- inventory only, no shift */
    var M = 0;
    for (var k = 0; k < sys.nodes.length; k++) {
      M += sys.nodes[k].V * W.rho_from_h(sys.nodes[k].h, sys.P);
    }
    if (M > 0) {
      var dC = (charging * C_in - letdown * cv.boron_ppm) / M;
      /* the inventory change itself re-concentrates what is left */
      var dM = charging - letdown;
      cv.boron_ppm = cv.boron_ppm + dt * (dC - cv.boron_ppm * dM / M);
      if (cv.boron_ppm < 0) cv.boron_ppm = 0;
    }

    var h_charge = W.h_l(Math.min(60, W.T_from_h(node ? node.h : 1250, sys.P)), sys.P);

    return {
      charging_kgs: charging,
      letdown_kgs: letdown,
      net_kgs: charging - letdown,
      boron_ppm: cv.boron_ppm,
      rho_coldleg: rho,
      /* Layer 3's boundary-source shape. Letdown leaves at the node's OWN enthalpy (it is RCS
       * water); charging arrives cold, which is a real and teachable effect -- charging into a
       * hot leg is a local cooldown. */
      sources: [
        { node: 'cold_leg', mdot: charging,  h: h_charge },
        { node: 'cold_leg', mdot: -letdown,  h: node ? node.h : 1250 }
      ]
    };
  }

  /* REPORTED, never asserted against a remembered band: how fast max charging with letdown
   * isolated moves inventory, as a fraction of RCS mass per minute. */
  function maxFillRateFracPerMin(sys) {
    var M = 0;
    for (var k = 0; k < sys.nodes.length; k++) M += sys.nodes[k].V * W.rho_from_h(sys.nodes[k].h, sys.P);
    return gpmToKgs(CVCS.charging_max_gpm(), 1000) * 60 / M;
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.cvcs = {
    CVCS: CVCS, createCVCS: createCVCS, stepCVCS: stepCVCS,
    volumeScale: volumeScale, rcsVolume: rcsVolume, orificeK: orificeK,
    normalLetdownKgs: normalLetdownKgs, gpmToKgs: gpmToKgs,
    maxFillRateFracPerMin: maxFillRateFracPerMin,
    GINNA_RCS_M3: GINNA_RCS_M3
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
