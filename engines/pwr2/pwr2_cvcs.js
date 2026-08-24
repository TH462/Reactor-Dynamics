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
 * Boron DOES something now: the kinetics layer consumes `boron_ppm` every step
 * (pwr2_kinetics rho_bor, 10 pcm/ppm sourced there) — an earlier note here said the coupling
 * was not built, which went stale the day pwr2_kinetics landed. This layer owns the CHEMISTRY:
 * the mass balance, the blender-shaped rate actuator (#507 wave 1), and the lab sample.
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
 *   SEAL INJECTION IS NOW BUILT — 5 gpm, UNSCALED, by owner ruling 2026-08-15. See its own note
 *   at the constant. It was the open question this list used to record, and the answer is that a
 *   seal belongs to the pump rather than to the plant.
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
    letdown_backpressure_mpa: 2.07,

    /* ---- SEAL INJECTION — **UNSCALED, BY RULING** ------------------------------------
     * (OWNER RULING, 2026-08-15: chose "5 gpm per pump, unscaled, declared" from four options —
     * volume-scale, power-scale, unscaled, or omit.)
     *
     * SOURCED VERBATIM, Westinghouse Technology Systems Manual §4.1 (ML11223A214):
     *   "Five gpm per RCP are returned to the RCS via the hydraulic chambers of the RCPs, for an
     *    RCS total of 20 gpm. This flow, plus the 55 gpm normal charging, results in a total of
     *    75 gpm returning to the RCS, matching the letdown flow."
     *
     * FIVE GPM PER PUMP IS THE DOCUMENT'S OWN PER-PUMP FIGURE, not a division performed here —
     * 20 gpm is what it makes of four pumps. **This plant has ONE**, so it gets 5 gpm.
     *
     * WHY IT IS NOT SCALED, AND WHAT THAT COSTS. A seal flow is set by the SEAL — its clearance,
     * its differential pressure, its injection requirement — and a seal on a 300 MWt plant's pump
     * is not a fifth the size of one on a 3,400 MWt plant's. Neither the volume basis (which CVCS
     * uses) nor the power basis (which ECCS and RHR use) has any claim on it.
     *
     * **The consequence is real and is the point of declaring it.** 5 gpm into a 6,251 gal RCS is
     * 0.08 %/min, against 20 gpm into a four-loop plant's much larger inventory. Seal injection is
     * therefore PROPORTIONALLY LARGER here than on any plant it was sourced from — about 40 % of
     * normal makeup rather than a quarter of it. That is a declared departure, not an accident:
     * it follows from a one-pump plant keeping a real pump's seal. */
    seal_injection_gpm_per_pump: 5,   // [sourced] WTSM §4.1, verbatim
    rcp_count: 1,                     // [ruled] SLS-100 is a single-loop plant
    /* ---- THE REGENERATIVE HEAT EXCHANGER, AS AN EFFECTIVENESS --------------------------
     * (#510 H-2). Letdown gives its heat to the incoming charging stream before leaving the
     * CVCS boundary — a real, always-in-service device (WTSM §4.1's letdown path runs
     * through it; the old engine's letdown-isolation interlock comment exists because of
     * it). Without it, a closed charging/letdown loop stands a permanent parasitic cooling
     * on the RCS: ~12.5 gpm arriving at 60 degC against a 121 degC Mode 4 plant is ~200 kW,
     * 7.7 degC/hr — which is what made the shutdown preset's Tavg drift, not any modelled
     * loss. Effectiveness on the RECOVERABLE stream, min(charging+seal, letdown): [tune] 0.9
     * — real charging leaves the regen HX ~500 degF against a ~545 degF cold leg, i.e. the
     * cold-injection effect is real but ~10 % of the raw enthalpy gap, and 0.9 reproduces
     * that class figure. LUMPED, DECLARED: the seal stream rides the same recovery although
     * the physical seal-injection line bypasses the regen HX. */
    regen_effectiveness: 0.9,
    /* Lab turnaround for an RCS boron grab sample. [derived]: adopted from the old engine's
     * real-time figure (#419 wave 1 made it real time there); no corpus document states a
     * turnaround, so the number is a class figure, declared. */
    boron_sample_lab_s: 1800
  };

  /* Seal injection returns to the RCS through the pump's hydraulic chambers. It is NOT operator
   * demand — it runs whenever the charging pumps are lined up — so it is a property of the lineup
   * rather than a control, and `isolated` is the only thing that stops it. */
  function sealInjectionGpm() {
    return CVCS.seal_injection_gpm_per_pump * CVCS.rcp_count;
  }

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
    /* LETDOWN BALANCES CHARGING **PLUS SEAL INJECTION**, which is the balance the source states:
     * "This flow, plus the 55 gpm normal charging, results in a total of 75 gpm returning to the
     * RCS, matching the letdown flow." Seal injection is an inflow the operator does not command,
     * so letdown has to carry it or inventory climbs on its own. */
    return gpmToKgs(CVCS.charging_normal_gpm() + sealInjectionGpm(), 1000);
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
      /* THE RATE ACTUATOR (#507 wave 1): commanded ppm/s, signed; 0 = the makeupSource lineup.
       * Realized as a BLENDER (the sourced shape — Ginna UFSAR ch.15: "A boric acid blend
       * system allows the operator to match the concentration of reactor coolant makeup water
       * to that existing in the coolant … the composition is determined by the preset flow
       * rates"): the step inverts the mass balance for the blend concentration that meters the
       * commanded rate, clamped to [0, boric_acid_ppm]. THE CLAMP IS THE PHYSICAL CEILING —
       * no separate ppm/s constant: the achievable rate is inFlow*(C_in − C)/M, bounded by the
       * tank concentration and the charging lineup, so boration saturates near the tank and a
       * dilution stays slow at high boron (the module's own sourced shape). The gate reports
       * the achieved ceilings at both lineups; the old engine's flat 0.14 ppm/s clamp is the
       * contrast case. */
      boron_rate_cmd: opts.boron_rate_cmd === undefined ? 0 : opts.boron_rate_cmd,
      /* THE LAB SAMPLE. A plant handed over mid-shift has a standing lab number, so the
       * constructor seeds one (seq 1) — the old engine's preset-boot convention. NO MIXING
       * LAG: this plant's boron is lumped by ruling (pwr2_kinetics), so the sample reports
       * cv.boron_ppm directly where the old engine reports its 30 s boron_reactive lag — a
       * declared behavioural difference. */
      _sample_timer: 0,
      sample_ppm: opts.boron_ppm === undefined ? 700 : Math.round(opts.boron_ppm),
      sample_seq: 1,
      K: opts.K === undefined ? orificeK(P_nop) : opts.K,
      isolated: !!opts.isolated
    };
  }

  /* Draw an RCS grab sample; the result posts after the lab turnaround. A sample already in
   * the lab is not re-drawn (the old engine's rule, kept). */
  function requestBoronSample(cv) {
    if (!(cv._sample_timer > 0)) cv._sample_timer = CVCS.boron_sample_lab_s;
  }

  /* stepCVCS(cv, sys, dt) -> {charging_kgs, letdown_kgs, net_kgs, boron_ppm, sources}
   *
   * `sources` is in the shape Layer 3 wants for `drivers.sources`, so the caller hands it straight
   * to stepPlant rather than unpacking it. Charging enters the COLD LEG and letdown leaves from it
   * -- both are cold-leg connections on a real plant, and putting them on the same node keeps this
   * layer from having an opinion about loop topology that Layer 3 already owns. */
  function stepCVCS(cv, sys, dt, drivers) {
    var node = null;
    for (var i = 0; i < sys.nodes.length; i++) if (sys.nodes[i].id === 'cold_leg') node = sys.nodes[i];
    var rho = node ? W.rho_from_h(node.h, sys.P) : 700;

    /* THE VITAL BUS (#507 wave 4): the charging pump is a vital load — diesel-carried
     * through a LOOP, dead in a station blackout (WTSM 5.7.5). Absent means powered (the
     * acAvailable convention); the demand and lineup stay where the operator put them
     * (#200), so restored power gives the pump back at its standing demand. Seal injection
     * runs off the same pump suction and dies with it. Letdown is an orifice against system
     * pressure, not a motor load — it keeps flowing while its valve is open, DECLARED. */
    var powered = !drivers || drivers.ac_available !== false;
    var demand = cv.chargingDemand === null
      ? CVCS.charging_normal_gpm() / CVCS.charging_max_gpm()
      : Math.max(0, Math.min(1, cv.chargingDemand));
    var charging = (cv.isolated || !powered) ? 0 : gpmToKgs(demand * CVCS.charging_max_gpm(), 1000);
    /* SEAL INJECTION runs with the charging pumps and is not commanded. Only isolation stops it. */
    var seal = (cv.isolated || !powered) ? 0 : gpmToKgs(sealInjectionGpm(), 1000);

    /* THE ORIFICE. Negative dP means the sink is above the plant -- letdown cannot run backwards
     * through it, so it stops rather than reversing sign under a square root. */
    var dP = sys.P - CVCS.letdown_backpressure_mpa;
    var orifice = (cv.letdownOpen <= 0 || dP <= 0) ? 0 : cv.letdownOpen * cv.K * Math.sqrt(dP);
    /* THE RHR LOW-PRESSURE LETDOWN PATH (#510 H-2, owner-ruled 2026-08-23). With the plant on
     * shutdown cooling the orifice's 300 psi backpressure strands every inflow — which is how
     * the shipped Mode 4 preset went water-solid on its own 5 gpm of seal injection. The real
     * plant letdowns FROM THE RHR SYSTEM in exactly this regime:
     *   [sourced] WTSM ch.19 (ML11223A342): "Coolant removal is accomplished by letdown,
     *   primarily from the residual heat removal system (RHR)" … "Letdown is via the
     *   RHR-to-CVCS cross-connect valve HCV-128."
     *   [sourced] WTSM §4.1.4.5 (ML11223A214): "A connection from the RHR system … allows
     *   purification of the RCS while the plant is in cold shutdown."
     *   [sourced] NUREG-1431 Rev 4 Bases (ML12100A228): "During LTOP MODES, the RHR System is
     *   operated for decay heat removal and low pressure letdown control."
     * Modelled as the NORMAL letdown magnitude behind the operator's own letdown fraction,
     * available while the RHR suction is open (the driver; absent = shut, so every at-power
     * fixture is untouched — the 585 psig autoclose keeps it false at power). The cross-connect
     * pulls from RHR flow, not through the orifice, hence no sqrt(dP) — RHR pump head drives
     * it. The orifice keeps whichever flow is larger; they are parallel paths to the same VCT. */
    var rhrPath = (drivers && drivers.rhr_letdown_ok && cv.letdownOpen > 0)
                  ? cv.letdownOpen * normalLetdownKgs() : 0;
    var letdown = Math.max(orifice, rhrPath);

    /* ---- BORON, AS A MASS BALANCE ON THE WHOLE RCS -----------------------------------
     * d(M*C)/dt = charging*C_in - letdown*C_rcs. Letdown carries the RCS concentration because it
     * is drawn from the RCS; charging carries whatever the pumps are lined up to. A dilution is
     * therefore SLOW at high boron and fast at low, which is the real shape and falls out of the
     * balance rather than being imposed. */
    /* Seal injection is drawn from the SAME charging pump suction, so it carries the same
     * concentration as charging -- it is not a separate chemistry path. */
    var inFlow = charging + seal;
    var M = 0;
    for (var k = 0; k < sys.nodes.length; k++) {
      M += sys.nodes[k].V * W.rho_from_h(sys.nodes[k].h, sys.P);
    }
    var C_in;
    if (cv.boron_rate_cmd !== 0 && inFlow > 0 && M > 0) {
      /* THE BLENDER INVERSION. The balance below reduces to dC/dt = inFlow*(C_in - C)/M
       * (the letdown terms cancel exactly -- letdown removes at RCS concentration), so the
       * blend that meters the commanded rate is C + rate*M/inFlow, clamped to what the tanks
       * can supply. With zero inflow (isolated lineup) the blender has no stream to blend and
       * the command idles -- physically right, not a special case. */
      C_in = Math.max(0, Math.min(CVCS.boric_acid_ppm,
        cv.boron_ppm + cv.boron_rate_cmd * M / inFlow));
    } else {
      C_in = cv.makeupSource === 'borate' ? CVCS.boric_acid_ppm
           : cv.makeupSource === 'dilute' ? CVCS.primary_water_ppm
           : cv.boron_ppm;                            /* 'match' -- inventory only, no shift */
    }
    if (M > 0) {
      var dC = (inFlow * C_in - letdown * cv.boron_ppm) / M;
      /* the inventory change itself re-concentrates what is left */
      var dM = inFlow - letdown;
      cv.boron_ppm = cv.boron_ppm + dt * (dC - cv.boron_ppm * dM / M);
      if (cv.boron_ppm < 0) cv.boron_ppm = 0;
    }

    /* the lab clock runs on plant time */
    if (cv._sample_timer > 0) {
      cv._sample_timer -= dt;
      if (cv._sample_timer <= 0) {
        cv._sample_timer = 0;
        cv.sample_ppm = Math.round(cv.boron_ppm);
        cv.sample_seq = (cv.sample_seq || 0) + 1;
      }
    }

    var h_charge = W.h_l(Math.min(60, W.T_from_h(node ? node.h : 1250, sys.P)), sys.P);
    /* THE REGEN HX (#510 H-2, see the constant): the returning stream recovers heat from the
     * letdown it crosses. Recovery scales with min(inflow, letdown) -- no letdown, no recovery,
     * and charging then genuinely arrives cold (isolated-letdown lineups keep the old shape). */
    var h_node = node ? node.h : 1250;
    var h_in = h_charge;
    if (inFlow > 0 && letdown > 0 && h_node > h_charge) {
      h_in = h_charge + CVCS.regen_effectiveness
                        * (Math.min(inFlow, letdown) / inFlow) * (h_node - h_charge);
    }

    return {
      charging_kgs: charging,
      seal_kgs: seal,
      letdown_kgs: letdown,
      net_kgs: charging + seal - letdown,
      boron_ppm: cv.boron_ppm,
      rho_coldleg: rho,
      /* Layer 3's boundary-source shape. Letdown leaves at the node's OWN enthalpy (it is RCS
       * water); charging arrives at the regen-HX outlet -- still below the cold leg, so the
       * cold-injection effect survives at its real ~10 % scale rather than the raw gap. */
      sources: [
        { node: 'cold_leg', mdot: charging + seal,  h: h_in },
        { node: 'cold_leg', mdot: -letdown,  h: h_node }
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
    requestBoronSample: requestBoronSample,
    sealInjectionGpm: sealInjectionGpm,
    volumeScale: volumeScale, rcsVolume: rcsVolume, orificeK: orificeK,
    normalLetdownKgs: normalLetdownKgs, gpmToKgs: gpmToKgs,
    maxFillRateFracPerMin: maxFillRateFracPerMin,
    GINNA_RCS_M3: GINNA_RCS_M3
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
