/* pwr2_pressurizer.js — Layer 5: the pressurizer. Saturated-equilibrium two-phase vessel, the
 * plant's compressible volume, plugged into the ONE seat Layer 2 has carried for it since
 * 2026-08-15 (`extraMass`, D1 §25.3 — exercised by four gates before this file existed).
 *
 * BUILT UNDER AN OWNER RULING (2026-08-18: "Option 1", selecting "build PWR2's own pressurizer
 * now, staged — pressure control first, level machinery second — taking #472's measured findings
 * as design evidence, not its code" from three options put to him). That ruling SUPERSEDES the
 * wait-for-#472 posture D1 §25.3 and D3 §4 recorded — those sections said "must not race #472";
 * the owner was shown exactly that trade and chose to build here. #472's findings that shaped
 * this file: the level constants are ONE object (its four-authority dP was the failure), spray
 * needs RCP flow, heaters shed on SI (#447, NUREG-0737 II.E.3.1 (7)).
 *
 * THE VESSEL IS ONE HEM VOLUME AT ONE SPECIFIC ENTHALPY h̄ — exactly the machinery every loop
 * node already uses. The projection into the pressure solve is V·rho_from_h(h̄, P) with h̄
 * FROZEN for the step, the same gather-then-integrate discipline (and the same audit-validated
 * function) as the loop nodes' own h inside F(P): its P-dependence at fixed h carries the
 * phase-fraction shift, which IS the bubble's compliance. A vessel h̄ inside the dome is the
 * saturated two-phase pressurizer; h̄ below h_f is D2 §25.3's WATER-SOLID regime (compliance
 * collapses to the liquid bulk modulus — the plant can still go solid, which the TMI
 * curriculum depends on); h̄ above h_g is the EMPTIED regime (heaters shed). Regime
 * transitions, not clips, and all three fall out of one function.
 *
 * The LEVEL is then D2 §25.2's one-division split, DERIVED from mass and pressure:
 *
 *     V_liq = (m_pzr − ρ_g·V) / (ρ_f − ρ_g)          [saturation densities — §25.2 verbatim]
 *
 * This is the saturated-equilibrium REDUCTION of §25.2's three-state formulation, declared as
 * such: the independent h_liq/h_steam states (subcooled pooling, superheated steam space —
 * "spray acts on the steam and heaters on the liquid") are STAGE 2.
 *
 * ⚠ THREE FORMULATIONS WERE BUILT AND MEASURED BEFORE THIS ONE SURVIVED ITS OWN PROBES, and
 * the failure modes generalise:
 *   1. Two-space split derived from the SPACES' OWN ρ(h,P): under sustained spray the steam
 *      space's h fell into the dome, its density rose ~5x, and the derived V_liq collapsed —
 *      a DENSE steam space read as VANISHED liquid; level crashed 61.5 → 0 % during an insurge
 *      and the plant rode its own spray to the 18 MPa ceiling. A level must be monotone in
 *      mass, which §25.2's saturated-density split is and a self-density split is not.
 *   2. §25.2 split + independent fully-MIXED h_liq/h_steam: settled −0.5 psi, but a ±10 %
 *      duty step INVERTED the pressure response — a 35 degC-subcooled insurge mixed into
 *      2.7 m3 of liquid state densified it ~36 kg/m3 and pulled the plant to 1711 psia
 *      (−524 psi err). A fully-mixed liquid space hands the bubble's job to compressed-liquid
 *      density; real insurge water stratifies and the interface stays saturated.
 *   3. State (m, TOTAL H) projected at FROZEN H: the compliance came out INVERTED (∂m/∂P < 0
 *      — at fixed total energy, higher P supports less saturated liquid) and the solve ran
 *      to the floor in one step. Freezing an EXTENSIVE energy drops the compression work;
 *      the frozen variable must be INTENSIVE, which is what h̄ is — the same lesson as
 *      Layer 2's own "dh = v·dP" unit-trap comment, met from the other side.
 *
 * ⚠ SETPOINTS ARE CARRIED AS DELTAS ABOUT THE OPERATOR SETPOINT, and that is what the source
 * actually says: WTSM Figure 10.2-3 (ML11223A287, read from the PAGE IMAGE — the text layer
 * does not carry the figure) writes every control actuation as "(N psig above/below setpoint)".
 * The real plant's setpoint is 2235 psig; SLS-100's design point is 2235 psia (15.41 MPa) by
 * plant identity, and the ADOPTED content is the delta ladder about whatever the setpoint is:
 *
 *     +100  PORV opens                     −15  proportional heaters FULL ON
 *      +75  spray fully open (hi alarm)    −17  backup heaters OFF   (hysteresis)
 *      +25  spray starts to open           −25  backup heaters ON    (lo alarm)
 *      +15  proportional heaters OFF
 *
 * The controller is PROPORTIONAL ONLY, deliberately: the figure's own note says the ladder
 * "reflects only proportional output of master controller" and that integral/derivative action
 * shifts actuations. The measured cost: the plant parks within the ±15 psi proportional band
 * rather than exactly on setpoint — inside the real plant's ±25 psi alarm band.
 *
 * DIRECTION OF ERROR, declared per file convention:
 *   - Spray is an ENERGY sink (condensing duty m_spray·(h_f − h_cold)); its MASS stays in the
 *     loop. Optimistic on level during spray (real level rises slightly); neutral on pressure.
 *   - Saturated equilibrium means no superheated steam space during a fast outsurge — pressure
 *     falls somewhat TOO FAST on outsurge (no superheat reservoir), pessimistic for
 *     low-pressure trips; and no subcooled pool during insurge — suppression is energy-only.
 *   - Relief discharge is REPORTED (`relief_kgs`, at h_g) and must be wired by the caller as a
 *     negative source, the same one-step-lag convention as the break.
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  var W  = RD && RD.water;
  if (!W) throw new Error('pwr2_pressurizer: load pwr2_water.js first');

  var PSI = 145.037738;                  /* psi per MPa */
  var LB_HR = 1 / 7936.64;               /* kg/s per lb/hr */

  /* ---- SOURCED / DERIVED CONSTANTS --------------------------------------------------------- */
  var GEOM = {
    kind: '[derived from sourced anchors]',
    /* Ginna TS Bases (ML20339A221) B 3.4.9: "pressurizer water level is > 650 cubic feet, which
     * is equivalent to 87%" -> total = 650/0.87 = 747.1 ft3 at 1520 MWt = 0.4915 ft3/MWt.
     * Scaled per-MWt to 300 MWt: 147.5 ft3 = 4.176 m3. Cross-checks: D2 §25.2's worked example
     * used 4.13 m3 (1.1 % off); the 4-loop WTSM plant implies 0.526 ft3/MWt (7 %).
     * THE SCALING METHOD IS THE CLAIM — per-MWt from the anchor plant, declared, not recalled. */
    V_pzr_m3: 4.176,
    hi_level_trip_frac: 0.87,            /* Ginna TS Bases: the 650 ft3 / high-level-trip point */
    level_program_full: 0.615,           /* WTSM 10.3 (ML11223A290): "high level setpoint of 61.5%" */
    level_program_noload: 0.25           /* WTSM 10.3: "low level setpoint of 25%" */
  };

  var HEATERS = {
    kind: '[derived from sourced anchors]',
    /* WTSM 3.2 (ML11223A213): "78 heaters installed for a total capacity of 1794 kW ...
     * proportional heater group ... 414 kW and the backup heater group ... 1380 kW" at the
     * 3411 MWt reference plant -> 0.526 kW/MWt -> 157.8 kW at 300 MWt, split in the source's
     * own 414:1380 ratio. Floor check: Ginna TS Bases requires >= 100 kW at 1520 MWt for
     * natural circulation (0.0658 kW/MWt -> 19.7 kW here); the scaled bank clears it 8x. */
    prop_kW: 36.4,
    backup_kW: 121.4,
    /* Ginna TS Bases B 3.4.9 + NUREG-0737 II.E.3.1 (7) (#447): heaters shed on SI or loss of
     * offsite power, and shed when uncovered (D2 §25.3's emptied regime). */
    shed_on_si: true
  };

  var SPRAY = {
    kind: '[derived from sourced anchors]',
    /* WTSM 3.2: "maximum spray flow rate (840 gpm)" at 3411 MWt -> 0.246 gpm/MWt -> 73.9 gpm
     * at 300 MWt = 4.66e-3 m3/s of cold-leg water at the design cold-leg density (740 kg/m3)
     * -> 3.45 kg/s. The +25/+75 psi linear band is corroborated independently by Ginna ch15
     * (ML20339A101) Model 1: "actuated when ... exceeded the initial value by 25 psi ...
     * full-open ... by 75 psi. A linear increase ... between these points."
     * Spray needs a running RCP: the driving head is the loop dP the pump makes (WTSM 3.2,
     * and #472's measured lesson). Auxiliary spray from CVCS is stage 2. */
    max_kgs: 3.45,
    needs_rcp: true,
    /* AUXILIARY SPRAY (stage 2c, 2026-08-19) — WTSM 3.2: "A flow path from the CVCS to the
     * pressurizer spray line is also provided. This connection provides auxiliary spray to the
     * vapor space of the pressurizer during cool down if the reactor coolant pumps are not
     * operating." An OPERATOR command (drivers.aux_spray), never automatic — it is a cooldown
     * procedure action — and it deliberately does NOT need the RCPs: charging pumps drive it,
     * which is its whole reason to exist (#472 measured the old engine lacking exactly this:
     * RCPs secured, spray demanded 12 %, delivered 0).
     * aux_max_kgs is the CVCS charging maximum (29.4 gpm volume-scaled, at charging-water
     * density) — THE SAME PHYSICAL NUMBER pwr2_cvcs derives, written down twice, which is the
     * protection-cadence failure mode; the GATE ties the two together so they cannot drift
     * apart silently. aux_water_c is VCT-temperature charging water [derived ~55 degC]: the
     * per-kg condensing duty is h_f(P) − h_l(55, P), several times the loop-water spray's,
     * on a quarter of the flow. */
    aux_max_kgs: 1.83,
    aux_water_c: 55
  };

  var CONTROL = {
    kind: '[sourced]',                   /* the delta ladder, WTSM Fig 10.2-3, page image */
    setpoint_default_mpa: 15.41,         /* SLS-100 design point (plant identity) */
    setpoint_min_mpa: 11.72,             /* WTSM 10.2: operator span "1700 psig to 2500 psig", */
    setpoint_max_mpa: 17.24,             /*   adopted as the same span about this plant's scale */
    prop_full_on_psi:  -15,
    prop_off_psi:      +15,
    backup_on_psi:     -25,              /* also the low-pressure alarm */
    backup_off_psi:    -17,
    spray_start_psi:   +25,
    spray_full_psi:    +75,              /* also the high-pressure alarm */
    porv_open_psi:    +100,
    src: 'WTSM Fig 10.2-3 (ML11223A287); spray band corroborated by Ginna ch15 Model 1'
  };

  /* ---- THE LEVEL CONTROL SYSTEM (stage 2a, 2026-08-19) — WTSM 10.3 (ML11223A290) ----------
   * "The difference between the actual pressurizer level and the programmed reference level
   * signal is supplied to the master pressurizer level controller. If an error signal exists,
   * this PI (proportional plus integral) controller varies the chemical and volume control
   * system charging flow." Letdown is CONSTANT in the source's normal lineup; inventory is
   * maintained by charging alone, which is why the output here is a CHARGING DEMAND the caller
   * hands to pwr2_cvcs (cv.chargingDemand) — the same caller-wires-the-systems convention as
   * relief discharge.
   *
   * THE PROGRAM is a function of Tavg — "programmed ... as a function of auctioneered high
   * Tavg, so that it follows the natural expansion characteristics of the reactor coolant" —
   * from 25 % at the no-load Tavg to 61.5 % at full power. The source's no-load point is
   * 557 degF, which is EXACTLY this plant's own HZP anchor (291.67 degC, OSTI 1991715); the
   * full-power end is this plant's design Tavg (304.5 degC), the sourced percentages adopted
   * over the plant's own temperature span.
   *
   * THE PROTECTION LADDER, all sourced (WTSM 10.3.4): level > program + 5 % energises the
   * BACKUP HEATERS (anticipatory — the insurge water is cooler and will drop pressure);
   * level <= 17 % ISOLATES LETDOWN and CUTS ALL HEATERS (steam-environment damage); 70 % is
   * the high-level alarm. The 92 % high-level reactor trip is the 4-loop plant's; Ginna's is
   * the 87 % this file already carries, and the RPS FUNCTION itself is owed to
   * pwr2_protection (recorded, not smuggled in here). The 17 % cut's RESTORE deadband is
   * [open] — the source states the cut only — set at +3 % (restore above 20 %), the shape
   * #447 measured mattering in the old engine (a latch with no differential chatters). */
  var LEVEL = {
    kind: '[sourced percentages over this plant\'s own Tavg span]',
    tavg_noload_c: 291.67,               /* = the source's 557 degF, and the plant's HZP anchor */
    tavg_full_c: 304.5,
    backup_above_program_pct: 5,
    low_cut_pct: 17,
    low_cut_restore_pct: 20,             /* [open] deadband, see above */
    hi_alarm_pct: 70,
    /* PI gains — [open], plant-tuned quantities in the real system too. Sized so a 10 % level
     * deficit swings charging by ~half its range about the normal-balance point, and the
     * integral kills steady error on a ~5 min scale. The GATE pins the closed-loop behaviour
     * (holds program, restores after a drain), not these two numbers. */
    kp_per_pct: 0.05,
    ki_per_pct_s: 1 / 300,
    demand_bias: 46 / 180                /* the source's "normally maintained at 46 gpm" over
                                          * its 180 gpm max — the balance point the PI trims */
  };

  var RELIEF = {
    kind: '[derived from sourced anchors]',
    /* Ginna TS Bases: "two PORVs, each having a relief capacity of 179,000 lb/hr at 2335 psig";
     * Ginna ch15 Model 1: "PSV design relief rate was 288,000 lbm/hr per valve (2 valves)",
     * nominal setpoint 2485 psig, "did not reseat until the pressure dropped 5% below the
     * opening setpoint" (the reseat fraction is SOURCED). Capacities per-MWt scaled
     * 1520 -> 300 MWt. */
    porv_kgs:   2 * 179000 * LB_HR * (300 / 1520),    /* 8.90 kg/s, both valves */
    safety_kgs: 2 * 288000 * LB_HR * (300 / 1520),    /* 14.33 kg/s, both valves */
    safety_open_mpa: 17.24,              /* 2485 psig = 2500 psia */
    safety_reseat_frac: 0.95,
    porv_reseat_psi: +85,                /* reclose below +85: a 15 psi deadband, [open] — the
                                          * sources give the opening point only; zero deadband
                                          * chatters at the house cadence */
    /* the tailpipe's two time constants, [open] — the ASYMMETRY is the claim (fast heat from
     * live steam, slow cool through pipe lagging), not the numbers; see step 3b */
    tail_tau_heat_s: 30,
    tail_tau_cool_s: 600
  };

  /* ---- the level split (D2 §25.2 verbatim — saturation densities, from MASS) --------------- */
  function satSplit(P, m, V) {
    var rf = W.rho_l_sat(W.T_sat(P)), rg = W.rho_v_sat(P);
    var Vl = (rf - rg) > 1e-9 ? (m - rg * V) / (rf - rg) : V;
    return { Vl: Vl, rf: rf, rg: rg };
  }

  /* ---- construction ------------------------------------------------------------------------ */
  function createPressurizer(opts) {
    opts = opts || {};
    var P = opts.P === undefined ? CONTROL.setpoint_default_mpa : opts.P;
    var lvl = opts.level_frac === undefined ? GEOM.level_program_full : opts.level_frac;
    var V = GEOM.V_pzr_m3, Vl = lvl * V;
    var rf = W.rho_l_sat(W.T_sat(P)), rg = W.rho_v_sat(P);
    var m = rf * Vl + rg * (V - Vl);
    return {
      V: V,
      m_pzr: m,
      /* the HEM state: the specific enthalpy whose two-phase mixture at (P) has this mass —
       * volumes mix linearly in specific volume, so h̄ comes from the quality that mass ratio
       * implies. Round-trips exactly: V*rho_from_h(h_bar, P) === m by construction. */
      h_bar: (rf * Vl * W.h_f(P) + rg * (V - Vl) * W.h_g(P)) / m,
      V_liq: Vl,
      setpoint_mpa: opts.setpoint_mpa === undefined ? CONTROL.setpoint_default_mpa
                                                    : opts.setpoint_mpa,
      backupOn: false,
      porvOpen: false,
      safetyOpen: false,
      waterSolid: false,
      emptied: false,
      heatersShed: false,
      levErrInt: 0,                      /* the level PI's integral state, %*s */
      lowLevelCut: false,                /* the 17 % letdown-isolate / heater-cut latch */
      porvStuck: false,                  /* the TMI failure lever (drivers.porv_stick) */
      blockOpen: true,                   /* the PORV block valve — the operator's isolation */
      T_tail_c: opts.tail_c === undefined ? 50 : opts.tail_c
    };
  }

  /* levelProgram(Tavg_c) -> programmed level FRACTION (WTSM 10.3 Fig 10.3-2, the sourced
   * 25..61.5 % over this plant's own no-load..full-power Tavg span, clamped at both ends). */
  function levelProgram(Tavg_c) {
    var f = (Tavg_c - LEVEL.tavg_noload_c) / (LEVEL.tavg_full_c - LEVEL.tavg_noload_c);
    f = clip(f, 0, 1);
    return GEOM.level_program_noload +
           f * (GEOM.level_program_full - GEOM.level_program_noload);
  }

  /* extraMassFn(pz) -> f(P) for Layer 2's seat. h̄ frozen within the solve; only P varies —
   * the loop nodes' own discipline, through the same audit-validated function. */
  function extraMassFn(pz) {
    return function (P) { return pz.V * W.rho_from_h(pz.h_bar, P); };
  }

  /* stepPressurizer(pz, sys, dt, drivers) — call AFTER stepPlant, the same slot as the other
   * Layer 5 systems. Reads the solved pressure, reconciles mass (surge = the exact difference),
   * runs the sourced control ladder, integrates energy, reports.
   *
   *   drivers.si_active        heater shed (sourced; #447's NUREG-0737 requirement)
   *   drivers.ac_available     false sheds heaters too (TS Bases: ESF buses)
   *   drivers.offsite_ok       false = a LOOP (#507 wave 4) — arms the shed LATCH below even
   *                            though the diesels keep the buses up: NUREG-0737 II.E.3.1's
   *                            shed is a bus-loading action on SI-or-LOOP, and re-loading
   *                            the heaters is the OPERATOR's (the old engine's set_heater
   *                            convention — here, any pzr_heaters_manual command)
   *   drivers.heaters_manual   0..1 override — the operator's, not the controller's
   *   drivers.heaters_failed   true = the bank elements are DEAD (#507 wave 6) — a failure
   *                            seat, distinct from the manual override and the shed latch
   *   drivers.spray_manual     0..1 override
   *   drivers.spray_stick      true = the spray valve is latched OPEN (#507 wave 6) — the
   *                            porv_stick twin; the demand keeps moving and stays ineffective
   *   drivers.setpoint_mpa     operator setpoint (clamped to the sourced span)
   */
  function stepPressurizer(pz, sys, dt, drivers) {
    drivers = drivers || {};
    var P = sys.P, V = pz.V;

    if (drivers.setpoint_mpa !== undefined) {
      var sp = drivers.setpoint_mpa;
      pz.setpoint_mpa = sp < CONTROL.setpoint_min_mpa ? CONTROL.setpoint_min_mpa
                      : (sp > CONTROL.setpoint_max_mpa ? CONTROL.setpoint_max_mpa : sp);
    }

    /* ---- 1. MASS RECONCILIATION. The solve conserved the projection; adopt it, and the
     * change IS the surge (insurge positive, into the vessel). Energy follows the donor:
     * an insurge arrives at the HOT LEG's h; an outsurge leaves from the BOTTOM — liquid, at
     * h_f while a bubble exists, at h̄ once the vessel is single-phase. ---- */
    var m_new = V * W.rho_from_h(pz.h_bar, P);
    var surge_kgs = (m_new - pz.m_pzr) / dt;
    var hf = W.h_f(P), hg = W.h_g(P);
    var twoPhase = pz.h_bar > hf && pz.h_bar < hg;
    var H = pz.m_pzr * pz.h_bar;
    if (surge_kgs > 0) {
      var h_hot = nodeH(sys, 'hot_leg');
      H += surge_kgs * dt * (h_hot === undefined ? hf : h_hot);
    } else {
      H += surge_kgs * dt * (twoPhase ? hf : pz.h_bar);
    }
    pz.m_pzr = m_new;

    /* ---- 1b. THE LEVEL CONTROL SYSTEM (WTSM 10.3 — see the LEVEL block). Reads LAST step's
     * split (gather-then-integrate); outputs a charging demand for the caller to wire into
     * pwr2_cvcs, and the two sourced level protections. ---- */
    /* ---- HR1 SPLIT (2026-08-20, the instrument layer's control switchover) ----------------
     * CONTROL reads the INSTRUMENT; physics reads the plant. The heater/spray/PORV ladder,
     * the level PI, and the 17 % low-level cut are all instrument-actuated in the real plant,
     * so each takes its channel from drivers.indicated_* when the caller wires an instrument
     * layer — ABSENT means truth, which keeps every layer-local gate's fixture exactly what
     * it was. The CODE SAFETIES stay on TRUE pressure: spring-loaded metal has no instrument
     * in its loop, and that split is the whole TMI-relevant point — a lying pressure channel
     * can misdrive the heaters and the PORV, and can never hold a safety shut. Mass/energy
     * reconciliation, saturation properties and the emptied/solid regimes all stay on truth
     * (they are the vessel, not a reading of it). */
    var level_pct = 100 * pz.V_liq / V;
    var level_ctl = drivers.indicated_level_pct !== undefined ? drivers.indicated_level_pct
                                                              : level_pct;
    var program_pct = 100 * (drivers.tavg_c !== undefined ? levelProgram(drivers.tavg_c)
                                                          : GEOM.level_program_full);
    var levErr = program_pct - level_ctl;              /* positive = level LOW, charge more */
    /* ANTI-WINDUP: the integral's authority is capped at ±0.5 of demand (±150 %·s at this Ki)
     * — without the cap the startup transient wound it to the rail and the controller sat at
     * full charging with the level ABOVE program (measured, first closed-loop probe). The PI
     * "prevents the charging flow from reacting to small temporary level perturbations while
     * eliminating steady-state level errors" (WTSM 10.3) — a wound-up integral does neither. */
    pz.levErrInt = clip(pz.levErrInt + levErr * dt, -0.5 / LEVEL.ki_per_pct_s,
                                                     0.5 / LEVEL.ki_per_pct_s);
    var charging_demand = clip(LEVEL.demand_bias + LEVEL.kp_per_pct * levErr +
                               LEVEL.ki_per_pct_s * pz.levErrInt, 0, 1);
    if (!pz.lowLevelCut && level_ctl <= LEVEL.low_cut_pct) pz.lowLevelCut = true;
    else if (pz.lowLevelCut && level_ctl >= LEVEL.low_cut_restore_pct) pz.lowLevelCut = false;
    var backupOnLevel = levErr <= -LEVEL.backup_above_program_pct;   /* the +5 % anticipator */

    /* ---- 2. THE SOURCED CONTROL LADDER (proportional output only — see header). The error
     * is the CONTROL CHANNEL's — see the HR1 split note above. ---- */
    var P_ctl = drivers.indicated_pressure_mpa !== undefined ? drivers.indicated_pressure_mpa
                                                             : P;
    var err_psi = (P_ctl - pz.setpoint_mpa) * PSI;

    var prop = clip((CONTROL.prop_off_psi - err_psi) /
                    (CONTROL.prop_off_psi - CONTROL.prop_full_on_psi), 0, 1);
    if (err_psi <= CONTROL.backup_on_psi || backupOnLevel) pz.backupOn = true;
    else if (err_psi >= CONTROL.backup_off_psi && !backupOnLevel) pz.backupOn = false;

    /* Heater shed: SI / no AC (sourced), uncovered heaters (D2 §25.3's emptied regime), or
     * the 17 % low-level cut (WTSM 10.3 — a heater in a steam environment is a damaged one).
     * THE LATCH (#507 wave 4, NUREG-0737 II.E.3.1 (7) + Ginna TS Bases B 3.4.9 — the old
     * engine's rising-edge shape): an SI signal or a LOOP sheds the banks off the emergency
     * buses, and the GRID coming back does not re-load them — an operator does, by touching
     * the heater control (the caller clears pz.shedLatch on its heater command). Old saves
     * carry no latch fields and land healthy-false, the pre-wave-4 plant exactly. */
    var shedSig = !!drivers.si_active || drivers.ac_available === false ||
                  drivers.offsite_ok === false;
    if (shedSig && !pz._shedSigPrev) pz.shedLatch = true;
    pz._shedSigPrev = shedSig;
    /* the LATCH is the shed (the old engine's reading of the clarification: the source
     * "explicitly contemplates loading the heaters while the SI signal still stands", so a
     * standing signal does not re-shed past the operator's re-load). ac_available stays a
     * DIRECT term — a dead bus is physics, not a loading choice. */
    pz.heatersShed = !!pz.shedLatch || drivers.ac_available === false || pz.emptied ||
                     pz.lowLevelCut;
    var heatFrac = drivers.heaters_manual !== undefined ? clip(drivers.heaters_manual, 0, 1)
                                                        : prop;
    /* drivers.heaters_failed (#507 wave 6): the FAILURE seat — bank elements dead, output 0
     * whatever the demand or the shed state. A third seat, deliberately distinct from the
     * operator's manual override and the shed latch: a failure is not a lineup, and clearing
     * it must not touch either (the #200 split). */
    var Q_heat_kW = (pz.heatersShed || drivers.heaters_failed) ? 0
                  : heatFrac * HEATERS.prop_kW +
                    ((pz.backupOn && drivers.heaters_manual === undefined) ||
                     drivers.heaters_manual === 1 ? HEATERS.backup_kW : 0);

    var sprayAuto = clip((err_psi - CONTROL.spray_start_psi) /
                         (CONTROL.spray_full_psi - CONTROL.spray_start_psi), 0, 1);
    var sprayFrac = drivers.spray_manual !== undefined ? clip(drivers.spray_manual, 0, 1)
                                                       : sprayAuto;
    /* drivers.spray_stick (#507 wave 6): the porv_stick twin — a PHYSICAL valve latched
     * open regardless of the controller or the operator's demand, which keeps moving and
     * stays ineffective (writing the override into the demand is the #200 trap the old
     * engine's spray_stuck comment names). Still needs RCP head and steam to condense. */
    pz.sprayStuck = !!drivers.spray_stick;
    if (pz.sprayStuck) sprayFrac = 1;
    if (SPRAY.needs_rcp && !(sys.mdot_loop > 100)) sprayFrac = 0;   /* no RCP head, no spray */
    if (pz.waterSolid) sprayFrac = 0;                               /* no steam to condense */
    /* Auxiliary spray: operator-commanded, RCP-independent (see the SPRAY block). */
    var auxFrac = drivers.aux_spray === undefined ? 0 : clip(drivers.aux_spray, 0, 1);
    if (pz.waterSolid) auxFrac = 0;

    /* ---- 3. RELIEF: controller PORV at +100 psi, mechanical safeties at 2500 psia. Both act
     * on their own (HR5: plant hardware) and are REPORTED for the caller to wire as a sink.
     *
     * THE TMI LEVERS (stage 2b, 2026-08-19):
     *   drivers.porv_stick   ONE PORV latched open regardless of the controller — the TMI-2
     *                        failure (a legitimate lift that never reseated). Half the
     *                        two-valve capacity, because one valve stuck is one valve.
     *   drivers.block_valve  the motor-operated isolation upstream of the PORVs — the operator
     *                        action that ENDED the TMI-2 loss (closed at 142 min). One combined
     *                        valve for the pair, declared (Ginna has one per PORV). Default
     *                        OPEN; closing it zeroes PORV discharge, stuck or commanded, and
     *                        never touches the code safeties, which have no isolation by design.
     * The stick is a FAILURE STATE, not an extra command path: the controller logic above runs
     * untouched, so an un-stuck PORV still cycles on its own ladder. */
    if (!pz.porvOpen && err_psi >= CONTROL.porv_open_psi) pz.porvOpen = true;
    else if (pz.porvOpen && err_psi <= RELIEF.porv_reseat_psi) pz.porvOpen = false;
    if (!pz.safetyOpen && P >= RELIEF.safety_open_mpa) pz.safetyOpen = true;
    else if (pz.safetyOpen && P <= RELIEF.safety_open_mpa * RELIEF.safety_reseat_frac) {
      pz.safetyOpen = false;
    }
    pz.porvStuck = !!drivers.porv_stick;
    if (drivers.block_valve !== undefined) pz.blockOpen = !!drivers.block_valve;
    var porv_kgs = !pz.blockOpen ? 0
                 : (pz.porvOpen ? RELIEF.porv_kgs
                 : (pz.porvStuck ? RELIEF.porv_kgs / 2 : 0));
    var relief_kgs = porv_kgs + (pz.safetyOpen ? RELIEF.safety_kgs : 0);

    /* ---- 3b. THE TAILPIPE — the TMI indication. A pipe-metal temperature: heats toward the
     * discharge steam's own T_sat while the PORV passes, cools toward ambient when it does not
     * — SLOWLY, which is the deceptive half: TMI-2's operators read a hot tailpipe as "always
     * hot" because it had been passing for years of small lifts. Both taus [open]; the
     * asymmetry (fast heat, slow cool) is the physical claim, not the numbers. */
    if (porv_kgs > 0) {
      pz.T_tail_c += dt * (W.T_sat(P) - pz.T_tail_c) / RELIEF.tail_tau_heat_s;
    } else {
      var amb = drivers.ambient_c === undefined ? 50 : drivers.ambient_c;
      pz.T_tail_c += dt * (amb - pz.T_tail_c) / RELIEF.tail_tau_cool_s;
    }

    /* ---- 4. ENERGY. Heaters in; spray's condensing duty out; relief leaves at h_g (steam
     * relief — a SOLID vessel relieves liquid at h_f, the honest cheaper stream). ---- */
    var Q_spray_kW = 0, m_spray = sprayFrac * SPRAY.max_kgs;
    if (m_spray > 0) {
      var h_cold = nodeH(sys, 'cold_leg');
      if (h_cold !== undefined && h_cold < hf) {
        Q_spray_kW = m_spray * (hf - h_cold);              /* condensing duty, energy only */
      }
    }
    var m_aux = auxFrac * SPRAY.aux_max_kgs, Q_aux_kW = 0;
    if (m_aux > 0) {
      Q_aux_kW = m_aux * (hf - W.h_l(SPRAY.aux_water_c, P));   /* VCT-cold water, energy only */
      Q_spray_kW += Q_aux_kW;
    }
    H += dt * (Q_heat_kW - Q_spray_kW);
    if (relief_kgs > 0) {
      pz.m_pzr -= relief_kgs * dt;
      H -= relief_kgs * dt * (twoPhase || pz.h_bar >= hg ? hg : pz.h_bar);
    }
    pz.h_bar = pz.m_pzr > 1 ? H / pz.m_pzr : pz.h_bar;

    /* ---- 5. THE SPLIT AND THE REGIMES (D2 §25.2 / §25.3), for reporting and the flags. ---- */
    var s = satSplit(P, pz.m_pzr, V);
    pz.waterSolid = pz.h_bar <= hf;
    pz.emptied = pz.h_bar >= hg;
    pz.V_liq = pz.emptied ? 0 : (pz.waterSolid ? V : (s.Vl < 0 ? 0 : (s.Vl > V ? V : s.Vl)));

    return {
      P: P,
      level_frac: pz.V_liq / V,
      level_pct: 100 * pz.V_liq / V,
      m_pzr: pz.m_pzr,
      surge_kgs: surge_kgs,
      heater_kW: Q_heat_kW,
      heater_frac: heatFrac,
      backup_on: pz.backupOn,
      heaters_shed: pz.heatersShed,
      spray_frac: sprayFrac,
      spray_stuck: pz.sprayStuck === true,
      spray_kgs: m_spray,
      spray_duty_kW: Q_spray_kW,
      aux_spray_frac: auxFrac,
      aux_spray_kgs: m_aux,
      aux_spray_duty_kW: Q_aux_kW,
      porv_open: pz.porvOpen || (pz.porvStuck && pz.blockOpen),
      porv_stuck: pz.porvStuck,
      block_valve_open: pz.blockOpen,
      tailpipe_temp_c: pz.T_tail_c,
      safety_open: pz.safetyOpen,
      relief_kgs: relief_kgs,
      relief_h: pz.waterSolid ? hf : hg,
      water_solid: pz.waterSolid,
      emptied: pz.emptied,
      hi_level_trip: pz.V_liq / V >= GEOM.hi_level_trip_frac,
      err_psi: err_psi,
      /* the level control system (WTSM 10.3) */
      level_program_pct: program_pct,
      charging_demand: charging_demand,
      letdown_isolated: pz.lowLevelCut,
      low_level_cut: pz.lowLevelCut,
      level_hi_alarm: level_pct >= LEVEL.hi_alarm_pct
    };
  }

  function nodeH(sys, id) {
    for (var i = 0; i < sys.nodes.length; i++) {
      if (sys.nodes[i].id === id) return sys.nodes[i].h;
    }
    return undefined;
  }
  function clip(x, a, b) { return x < a ? a : (x > b ? b : x); }

  root.RD.pwr2.pressurizer = {
    GEOM: GEOM, HEATERS: HEATERS, SPRAY: SPRAY, CONTROL: CONTROL, RELIEF: RELIEF, LEVEL: LEVEL,
    createPressurizer: createPressurizer,
    extraMassFn: extraMassFn,
    stepPressurizer: stepPressurizer,
    levelProgram: levelProgram,
    _satSplit: satSplit
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
