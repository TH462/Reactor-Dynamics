/* run_pwr2_pressurizer.js — Layer 5 gate: the pressurizer (stage 1, owner ruling 2026-08-18
 * "Option 1").
 *
 * WHAT THIS GATE PINS, in order: the sourced constants against their own documents (the WTSM
 * Fig 10.2-3 delta ladder is retyped HERE as independent literals — a drifted engine constant
 * cannot re-derive the reference); the construction round-trip identities; the projection's
 * COMPLIANCE (sign, and the water-solid regime collapse); the control ladder's actuation
 * points, exercised through a stub plant at exact pressures; and the plant-coupled behaviour —
 * a balanced plant SETTLES inside the declared proportional band, an overcooling transient
 * outsurges and recovers on heaters, and the vessel can be DRIVEN SOLID (the regime the TMI
 * curriculum depends on, D2 §25.3).
 *
 * The three formulation failures this file's header records were all found by probes of the
 * kinds below being run BEFORE the gate existed; the gate is those probes made permanent.
 *
 * Run: node test/run_pwr2_pressurizer.js
 */
'use strict';
var path = require('path');
var SRC = path.join(__dirname, '..', 'engines', 'pwr2');
var fs = require('fs');

function loadAll(pzSource) {
  ['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_sources',
   'pwr2_cvcs'
  ].forEach(function (f) {
    /* pwr2_water + pwr2_vtable stay CACHED across replays (#513): never this gate's
     * mutation target, and a re-execute discards the vtable's lazily-built ~0.5 s GRID
     * per replay. Kept as a pair (the vtable closes over RD.pwr2.water at load) —
     * see run_pwr2_engine.js's loadAll for the full note. */
    if (f !== 'pwr2_water' && f !== 'pwr2_vtable')
      delete require.cache[require.resolve(path.join(SRC, f + '.js'))];
    require(path.join(SRC, f + '.js'));
  });
  if (pzSource === undefined) {
    delete require.cache[require.resolve(path.join(SRC, 'pwr2_pressurizer.js'))];
    require(path.join(SRC, 'pwr2_pressurizer.js'));
  } else {
    /* eslint-disable no-eval */
    (0, eval)(pzSource);
  }
  return globalThis.RD.pwr2;
}

function runSuite(RD, rec, quiet) {
  var W = RD.water, S = RD.sources, PZ = RD.pressurizer, CV = RD.cvcs;
  var DT = 0.02, PSI = 145.037738;

  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(58) +
      'got ' + (typeof got === 'number' ? got.toFixed(4) : got) + ' want ' + want +
      ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }

  /* A stub plant at an exact pressure — stepPressurizer reads only P, node h and mdot_loop,
   * so the ladder can be exercised at the psi it actuates at rather than hoping a transient
   * passes through it. */
  function stub(P_mpa, mdot) {
    return { P: P_mpa,
             nodes: [{ id: 'hot_leg', h: W.h_l(310, P_mpa) },
                     { id: 'cold_leg', h: W.h_l(288, P_mpa) }],
             mdot_loop: mdot === undefined ? 1630 : mdot };
  }
  function at(err_psi) { return 15.41 + err_psi / PSI; }
  /* drive a constructed vessel WATER-SOLID by hand: no steam, one liquid pool of subcooled
   * water at T_c — the regime the two-region seat expresses as m_stm = 0 (2026-08-25) */
  function driveSolid(p, T_c) {
    p.m_sat += p.m_stm; p.m_stm = 0;
    p.h_sat = W.h_l(T_c, 15.41);
    p.v_sat = 1000 / W.rho_l(T_c, 15.41);
    p.m_pzr = p.m_sat + p.m_sub;
    return p;
  }

  /* ---- 1. THE SOURCED CONSTANTS, AGAINST THEIR DOCUMENTS ----------------------------------- */
  head('SOURCED CONSTANTS  [independent literals -- the engine cannot re-derive its reference]');
  /* WTSM Fig 10.2-3 (ML11223A287, page image), deltas about the setpoint: */
  ck('proportional heaters FULL ON at -15 psi', PZ.CONTROL.prop_full_on_psi, -15, 0, 'psi');
  ck('proportional heaters OFF at +15 psi', PZ.CONTROL.prop_off_psi, 15, 0, 'psi');
  ck('backup heaters ON at -25 psi (the low alarm)', PZ.CONTROL.backup_on_psi, -25, 0, 'psi');
  ck('backup heaters OFF at -17 psi (sourced hysteresis)', PZ.CONTROL.backup_off_psi, -17, 0, 'psi');
  ck('spray starts at +25 psi', PZ.CONTROL.spray_start_psi, 25, 0, 'psi');
  ck('spray full at +75 psi (the high alarm)', PZ.CONTROL.spray_full_psi, 75, 0, 'psi');
  ck('PORV opens at +100 psi', PZ.CONTROL.porv_open_psi, 100, 0, 'psi');
  /* Ginna TS Bases: 650 ft3 == 87 % -> 747.1 ft3 total, per-MWt to 300 MWt; 0.0283168 m3/ft3 */
  ck('V_pzr is the Ginna-derived, per-MWt-scaled volume',
     PZ.GEOM.V_pzr_m3, (650 / 0.87) * (300 / 1520) * 0.0283168, 0.01, 'm3');
  /* WTSM 3.2: 1794 kW total at 3411 MWt, split 414:1380 */
  ck('heater bank total is the WTSM per-MWt scaling',
     PZ.HEATERS.prop_kW + PZ.HEATERS.backup_kW, 1794 * 300 / 3411, 0.5, 'kW');
  ckT('...split in the source\'s own 414:1380 ratio',
      Math.abs(PZ.HEATERS.prop_kW / PZ.HEATERS.backup_kW - 414 / 1380) < 0.01,
      (PZ.HEATERS.prop_kW / PZ.HEATERS.backup_kW).toFixed(3) + ' vs 0.300');
  ckT('...and the scaled bank clears Ginna\'s 100 kW nat-circ floor, per-MWt',
      PZ.HEATERS.prop_kW + PZ.HEATERS.backup_kW > 100 * 300 / 1520,
      (PZ.HEATERS.prop_kW + PZ.HEATERS.backup_kW).toFixed(0) + ' kW vs the 19.7 kW scaled LCO');
  ck('safety valves open at 2500 psia', PZ.RELIEF.safety_open_mpa * PSI, 2500, 1, 'psia');
  ck('safety reseat is the SOURCED 5 % blowdown', PZ.RELIEF.safety_reseat_frac, 0.95, 0, '-');
  ck('PORV capacity is 2 x 179,000 lb/hr per-MWt scaled',
     PZ.RELIEF.porv_kgs, 2 * 179000 / 7936.64 * 300 / 1520, 0.01, 'kg/s');
  ck('level program full-power point is WTSM 10.3\'s 61.5 %', PZ.GEOM.level_program_full, 0.615, 0, '-');
  ck('high-level trip is Ginna\'s 87 %', PZ.GEOM.hi_level_trip_frac, 0.87, 0, '-');

  /* ---- 2. CONSTRUCTION ROUND-TRIPS --------------------------------------------------------- */
  head('CONSTRUCTION  [the state, the projection and the level must be ONE consistent object]');
  var pz0 = PZ.createPressurizer({});
  /* #514: the projection reads the vtable while construction uses the direct two-phase
   * split, so "EXACTLY" became "to the table's declared dome accuracy" — 0.005 % of this
   * 1693 kg vessel is 0.085 kg; measured 0.014. The claim (state, projection and level are
   * ONE object, no hidden transformation) is unchanged; a real hidden transformation is
   * kilograms-to-tonnes off, not hundredths. The engine itself is internally consistent:
   * the solve's seat and stepPressurizer's reconciliation read the SAME table function. */
  ck('the projection reproduces the constructed mass (table dome accuracy)',
     PZ.extraMassFn(pz0)(15.41), pz0.m_pzr, 0.1, 'kg');
  ck('...and the derived level reproduces the requested program level',
     100 * pz0.V_liq / pz0.V, 61.5, 1e-9, '%');
  var pz40 = PZ.createPressurizer({ level_frac: 0.40 });
  ck('a 40 % vessel round-trips too -- no hidden dependence on the program point',
     PZ.extraMassFn(pz40)(15.41), pz40.m_pzr, 0.1, 'kg');   /* tolerance: see the note above */
  /* REFIT 2026-08-25 (#515, the two-region vessel): the constructed vessel is TWO REGIONS —
   * saturated steam over a saturated pool, no stratified layer — where it used to be one HEM
   * enthalpy inside the dome. Same claim (genuinely two-phase, ONE consistent object). */
  ckT('the constructed vessel is two-region: saturated steam over a saturated pool, no bottom layer',
      pz0.m_stm > 0 && Math.abs(pz0.h_stm - W.h_g(15.41)) < 1e-9 &&
      pz0.m_sat > 0 && Math.abs(pz0.h_sat - W.h_f(15.41)) < 1e-9 && pz0.m_sub === 0,
      'steam ' + pz0.m_stm.toFixed(1) + ' kg at h_g over a pool of ' + pz0.m_sat.toFixed(1) +
      ' kg at h_f');

  /* ---- 3. COMPLIANCE ----------------------------------------------------------------------- */
  head('COMPLIANCE  [the bubble is soft, monotone -- and water-solid is STIFF, not clipped]');
  var f0 = PZ.extraMassFn(pz0);
  var mono = true, prev = f0(1.0);
  for (var Pm = 1.5; Pm <= 17.0; Pm += 0.5) {
    var mm = f0(Pm);
    if (mm < prev) mono = false;
    prev = mm;
  }
  ckT('the projection is MONOTONE in P across the envelope -- F(P) stays solvable',
      mono, 'formulation 3 in the header inverted this and ran the solve to the floor');
  var softSlope = (f0(15.51) - f0(15.31)) / 0.2;
  var solid = PZ.createPressurizer({ level_frac: 0.999999 });
  driveSolid(solid, 340);                     /* driven SOLID: subcooled liquid fills it */
  var solidSlope = (PZ.extraMassFn(solid)(15.51) - PZ.extraMassFn(solid)(15.31)) / 0.2;
  ckT('water-solid compliance COLLAPSES -- the regime transition, expressed not clamped',
      solidSlope > 0 && solidSlope < softSlope / 5,
      'dM/dP ' + softSlope.toFixed(1) + ' kg/MPa with a bubble vs ' + solidSlope.toFixed(2) +
      ' solid -- D2 §25.3\'s "system compressibility collapses to the liquid bulk modulus"');

  /* ---- 4. THE CONTROL LADDER, AT ITS OWN ACTUATION POINTS ---------------------------------- */
  head('THE LADDER  [each component at the psi the figure puts it, through a stub plant]');
  function once(err_psi, drivers, pzOpts) {
    var p = PZ.createPressurizer(pzOpts || {});
    return PZ.stepPressurizer(p, stub(at(err_psi)), DT, drivers || {});
  }
  ckT('at setpoint: proportional heaters at HALF output, nothing else',
      Math.abs(once(0).heater_frac - 0.5) < 0.01 && once(0).spray_frac === 0 &&
      !once(0).porv_open && !once(0).backup_on,
      'the mid-band idle the WTSM text describes (bypass spray + ambient losses in the real plant)');
  ckT('-15 psi: proportional heaters FULL', once(-15).heater_frac >= 1 - 1e-9, '');
  ckT('+15 psi: proportional heaters OFF', once(15).heater_frac <= 1e-9, '');
  ckT('-25 psi: backup heaters LATCH', once(-25.05).backup_on === true,
      once(-25.05).heater_kW.toFixed(0) + ' kW with the backup bank in  (probed a hundredth ' +
      'below the threshold -- the stub\'s MPa round-trip cannot land EXACTLY on it)');
  var pzHys = PZ.createPressurizer({});
  PZ.stepPressurizer(pzHys, stub(at(-25.05)), DT, {});
  PZ.stepPressurizer(pzHys, stub(at(-20)), DT, {});
  var hysMid = pzHys.backupOn;
  PZ.stepPressurizer(pzHys, stub(at(-16)), DT, {});
  ckT('...and clear at -17, not -25 -- the sourced hysteresis, not a mirrored threshold',
      hysMid === true && pzHys.backupOn === false,
      'still ON at -20 psi, OFF above -17 -- a symmetric band reds here');
  ck('+50 psi: spray HALF open (linear between +25 and +75)', once(50).spray_frac, 0.5, 1e-9, '-');
  ckT('+75 psi: spray full; +100: PORV OPEN',
      once(75).spray_frac >= 1 - 1e-9 && once(100.5).porv_open === true &&
      once(100.5).relief_kgs > 0, '');
  ckT('spray needs a running RCP -- stopped loop, no spray at any error',
      PZ.stepPressurizer(PZ.createPressurizer({}), stub(at(60), 0), DT, {}).spray_frac === 0,
      'the driving head is the pump\'s (WTSM 3.2, #472\'s measured lesson)');
  /* AUXILIARY SPRAY (stage 2c): the CVCS path that works EXACTLY when main spray cannot --
   * "auxiliary spray to the vapor space ... during cool down if the reactor coolant pumps are
   * not operating" (WTSM 3.2). Operator-commanded, never automatic. */
  var rAux = PZ.stepPressurizer(PZ.createPressurizer({}), stub(15.41, 0), DT, { aux_spray: 1.0 });
  ckT('AUX spray condenses with the RCPs STOPPED -- the capability #472 measured missing',
      rAux.spray_frac === 0 && rAux.aux_spray_frac === 1 && rAux.aux_spray_duty_kW > 1000,
      rAux.aux_spray_duty_kW.toFixed(0) + ' kW of VCT-cold condensing duty on ' +
      rAux.aux_spray_kgs.toFixed(2) + ' kg/s -- main spray dead at zero loop flow');
  /* THE DUPLICATED CONSTANT, PINNED (the protection-cadence / MDOT_RATED pattern): aux capacity
   * is the CVCS charging maximum written down twice; the gate owns the consistency claim. */
  var auxTie = CV.CVCS.charging_max_gpm() * 6.30902e-5 *
               W.rho_l(PZ.SPRAY.aux_water_c, 15.41);
  ck('aux capacity IS the CVCS charging maximum at charging-water density',
     PZ.SPRAY.aux_max_kgs, auxTie, 0.06, 'kg/s');
  ckT('...and a SOLID vessel zeroes aux spray too -- no steam space, nothing to condense',
      (function () {
        var pzS2 = PZ.createPressurizer({ level_frac: 0.999999 });
        driveSolid(pzS2, 340);
        PZ.stepPressurizer(pzS2, stub(15.41, 0), DT, {});   /* flags update on first step */
        return PZ.stepPressurizer(pzS2, stub(15.41, 0), DT, { aux_spray: 1.0 }).aux_spray_frac === 0;
      })(), '');
  ckT('SI SHEDS THE HEATERS (NUREG-0737 II.E.3.1 (7), the #447 requirement)',
      once(-40, { si_active: true }).heater_kW === 0 &&
      once(-40, { si_active: true }).heaters_shed === true,
      'a -40 psi error would otherwise demand every bank');
  /* THE VITAL BUS KILLS AUX SPRAY (#510 H-4): the charging pumps drive it, and they die on
   * the same wire pwr2_cvcs pulls — before the gate a blackout plant delivered 29 gpm from
   * a pump reporting zero flow, 541 psi of depressurization. */
  var rAuxB = PZ.stepPressurizer(PZ.createPressurizer({}), stub(15.41, 0), DT,
                                 { aux_spray: 1.0, ac_available: false });
  ckT('a BLACKOUT kills aux spray — the pump that drives it is a vital load (#510 H-4)',
      rAuxB.aux_spray_frac === 0 && rAuxB.aux_spray_kgs === 0,
      'commanded 1.0 on a dead bus: delivered ' + rAuxB.aux_spray_kgs.toFixed(2) + ' kg/s');
  /* EACH ACTUATING SIGNAL HAS ITS OWN EDGE (#510 H-6): a LOOP arriving AFTER an SI (the
   * operator re-loaded the heaters between) must shed AGAIN — the old OR'd single edge found
   * the OR already high and never fired, and 157.8 kW rode the diesels through the
   * design-basis LOCA+LOOP order. */
  ckT('a LOOP arriving AFTER an SI (operator re-load between) SHEDS the banks AGAIN',
      (function () {
        var pzE = PZ.createPressurizer({});
        var sysE = stub(15.41, 0);
        PZ.stepPressurizer(pzE, sysE, DT, { si_active: true });          /* the SI edge arms */
        if (pzE.shedLatch !== true) return false;
        pzE.shedLatch = false;                          /* the operator re-load (caller's clear) */
        var r1 = PZ.stepPressurizer(pzE, sysE, DT, { si_active: true });
        if (r1.heaters_shed !== false) return false;    /* a STANDING SI does not re-shed */
        var r2 = PZ.stepPressurizer(pzE, sysE, DT, { si_active: true, offsite_ok: false });
        return r2.heaters_shed === true && pzE.shedLatch === true;
      })(), 'the second signal is its own bus-loading action (NUREG-0737 II.E.3.1)');
  /* THE TWO WAVE-6 FAILURE SEATS (#507): a dead bank and a stuck spray valve — each distinct
   * from the operator's override and from the shed (three seats, three different recoveries) */
  var rHF = once(-40, { heaters_failed: true });
  ckT('FAILED heaters deliver 0 kW while the demand STANDS and nothing is shed',
      rHF.heater_kW === 0 && rHF.heater_frac > 0.9 && rHF.heaters_shed === false,
      'demand ' + rHF.heater_frac.toFixed(2) + ' with dead elements — clearing the failure ' +
      'restores output with no re-lineup (#200)');
  var rSS = PZ.stepPressurizer(PZ.createPressurizer({}), stub(15.41), DT,
                               { spray_stick: true, spray_manual: 0 });
  ckT('a STUCK-OPEN spray valve sprays FULL against a manual-zero demand (the porv_stick twin)',
      rSS.spray_frac === 1 && rSS.spray_stuck === true && rSS.spray_kgs > 0,
      rSS.spray_kgs.toFixed(2) + ' kg/s with the operator demanding 0 — the demand moves, ' +
      'the valve does not');
  ckT('...and the stick still obeys physics: no RCP head, no spray',
      PZ.stepPressurizer(PZ.createPressurizer({}), stub(15.41, 0), DT,
                         { spray_stick: true }).spray_frac === 0, '');
  ckT('safeties open at 2500 psia and reseat 5 % lower, not at the lift point',
      (function () {
        var p = PZ.createPressurizer({});
        var r1 = PZ.stepPressurizer(p, stub(17.25), DT, {});
        var r2 = PZ.stepPressurizer(p, stub(16.60), DT, {});   /* inside the blowdown */
        var r3 = PZ.stepPressurizer(p, stub(16.30), DT, {});   /* below 95 % of lift */
        return r1.safety_open && r2.safety_open && !r3.safety_open;
      })(), 'open at lift, HELD open through the blowdown band, reseat below it');

  /* ---- 5. PLANT-COUPLED BEHAVIOUR ---------------------------------------------------------- */
  head('THE PLANT  [settles in-band at the design point; transients move the right way]');
  var pz = PZ.createPressurizer({});
  var sys = S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41, extraMass: PZ.extraMassFn(pz) });
  var pw = 0, pr = null;
  function ride(secs, duty) {
    for (var i = 0; i < secs / DT; i++) {
      var r = S.stepPlant(sys, DT, { corePower: 300000, sgDuty: 300000 * duty + pw });
      pw = r.pumpWork_kW;
      pr = PZ.stepPressurizer(pz, sys, DT, {});
    }
    return pr;
  }
  ride(quiet ? 120 : 300, 1.0);
  ckT('a balanced plant SETTLES inside the proportional band -- #486\'s defect, gone',
      Math.abs(pr.err_psi) <= (quiet ? 60 : 15.5) && sys.P > (quiet ? 14.9 : 15.2) && sys.P < 15.6,
      (sys.P * PSI).toFixed(1) + ' psia, err ' + pr.err_psi.toFixed(1) + ' psi -- the plant ' +
      'without this vessel settled at 1285 psia, 490 psi below its own low-pressure trip');
  ckT('...with the level near the program point and the surge asleep',
      Math.abs(pr.level_pct - 61.5) < 8 && Math.abs(pr.surge_kgs) < (quiet ? 1.5 : 0.5),
      pr.level_pct.toFixed(1) + ' %, surge ' + pr.surge_kgs.toFixed(3) + ' kg/s');
  var subc = W.subcooling(W.T_from_h(coreH(sys), sys.P), sys.P);
  ckT('...and the CORE IS SUBCOOLED at power -- saturation is no longer the attractor',
      subc > 15, 'core subcooling ' + (subc * 9 / 5).toFixed(1) + ' degF (' + subc.toFixed(1) +
      ' degC) -- the audit\'s E18 finding was ZERO, by construction, before this vessel');
  var Pbefore = sys.P;
  ride(quiet ? 30 : 60, 1.10);
  ckT('OVERCOOLING outsurges and pressure FALLS -- and the heaters answer',
      pr.surge_kgs < -1 || (sys.P < Pbefore - 0.3 && pr.heater_kW > PZ.HEATERS.prop_kW),
      'P ' + (sys.P * PSI).toFixed(0) + ' psia, level ' + pr.level_pct.toFixed(1) + ' %, ' +
      pr.heater_kW.toFixed(0) + ' kW in -- formulation 2 in the header INVERTED this response');
  var Plow = sys.P;
  ride(quiet ? 60 : 240, 1.0);
  ckT('...and the heaters RECOVER pressure once the duty rebalances',
      sys.P > Plow + (quiet ? 0.05 : 0.2),
      (Plow * PSI).toFixed(0) + ' -> ' + (sys.P * PSI).toFixed(0) + ' psia over 4 minutes');
  function coreH(s) {
    for (var k = 0; k < s.nodes.length; k++) if (s.nodes[k].id === 'core') return s.nodes[k].h;
  }

  /* ---- 5b. THE LEVEL CONTROL SYSTEM (stage 2a — WTSM 10.3) --------------------------------- */
  head('LEVEL CONTROL  [PI on charging; the program follows Tavg; two sourced protections]');
  ck('the program runs 25 % at the no-load Tavg', 100 * PZ.levelProgram(291.67), 25, 1e-9, '%');
  ck('...to 61.5 % at the full-power Tavg', 100 * PZ.levelProgram(304.5), 61.5, 1e-9, '%');
  ckT('...and CLAMPS beyond both ends — a cooldown below no-load does not program a vacuum',
      Math.abs(PZ.levelProgram(280) - 0.25) < 1e-12 &&
      Math.abs(PZ.levelProgram(320) - 0.615) < 1e-12, '');
  ck('the low-level cut is the sourced 17 %', PZ.LEVEL.low_cut_pct, 17, 0, '%');
  ck('the high-level alarm is the sourced 70 %', PZ.LEVEL.hi_alarm_pct, 70, 0, '%');
  ck('the anticipatory backup-heater band is the sourced +5 %',
     PZ.LEVEL.backup_above_program_pct, 5, 0, '%');
  /* The +5 % anticipator: a vessel ABOVE program energises the backup heaters even with
   * pressure AT setpoint — "the insurge water is cooler ... automatically energizes the backup
   * heaters in an effort to offset that effect" (WTSM 10.3.4). */
  var pzHi = PZ.createPressurizer({ level_frac: 0.615 + 0.07 });
  var rHi = PZ.stepPressurizer(pzHi, stub(15.41), DT, { tavg_c: 304.5 });
  ckT('level 7 % ABOVE program energises the backup heaters at setpoint pressure',
      rHi.backup_on === true, 'the sourced anticipator, not the pressure ladder (err ' +
      rHi.err_psi.toFixed(1) + ' psi)');
  var pzLo = PZ.createPressurizer({ level_frac: 0.16 });
  var rLo = PZ.stepPressurizer(pzLo, stub(at(-40)), DT, { tavg_c: 304.5 });
  ckT('16 % level CUTS ALL HEATERS and ISOLATES LETDOWN, against a -40 psi error demanding them',
      rLo.heater_kW === 0 && rLo.letdown_isolated === true && rLo.low_level_cut === true,
      'a heater in a steam environment is a damaged one (WTSM 10.3.4)');
  var pzHys2 = PZ.createPressurizer({ level_frac: 0.16 });
  PZ.stepPressurizer(pzHys2, stub(15.41), DT, {});
  pzHys2.V_liq = 0.185 * pzHys2.V;                     /* between cut and restore */
  PZ.stepPressurizer(pzHys2, stub(15.41), DT, {});
  var stillCut = pzHys2.lowLevelCut;
  pzHys2.V_liq = 0.21 * pzHys2.V;
  PZ.stepPressurizer(pzHys2, stub(15.41), DT, {});
  ckT('...and the cut restores above 20 %, not at its own threshold — a latch needs a differential',
      stillCut === true && pzHys2.lowLevelCut === false,
      'still cut at 18.5 %, clear at 21 % — the #447 chatter shape, avoided by construction');
  ckT('a LOW vessel demands more charging than a vessel ON program',
      (function () {
        var a = PZ.createPressurizer({ level_frac: 0.45 });
        var b = PZ.createPressurizer({});
        return PZ.stepPressurizer(a, stub(15.41), DT, { tavg_c: 304.5 }).charging_demand >
               PZ.stepPressurizer(b, stub(15.41), DT, { tavg_c: 304.5 }).charging_demand + 0.2;
      })(), 'the PI\'s proportional half, in the direction the source states');

  /* CLOSED LOOP with the real CVCS: the plant holds its level near program, and a drain is
   * answered with full charging. Rides shortened in quiet mode; the loud run asserts the band. */
  var pzC = PZ.createPressurizer({});
  var sysC = S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41, extraMass: PZ.extraMassFn(pzC) });
  var cvC = CV.createCVCS({});
  var prC = null, pwC = 0;
  function rideC(secs, sink) {
    for (var i = 0; i < secs / DT; i++) {
      var cr = CV.stepCVCS(cvC, sysC, DT);
      var srcs = (cr.sources || []).slice();
      if (sink) srcs.push({ node: 'cold_leg', mdot: -sink, h: W.h_l(288, sysC.P) });
      var r = S.stepPlant(sysC, DT, { corePower: 300000, sgDuty: 300000 + pwC, sources: srcs });
      pwC = r.pumpWork_kW;
      prC = PZ.stepPressurizer(pzC, sysC, DT, { tavg_c: 304.5 });
      cvC.chargingDemand = prC.charging_demand;
      cvC.letdownOpen = prC.letdown_isolated ? 0 : 1;
    }
    return prC;
  }
  rideC(quiet ? 90 : 600, 0);
  ckT('closed-loop with the CVCS, the level HOLDS near program and the demand is off the rails',
      Math.abs(prC.level_pct - prC.level_program_pct) < (quiet ? 10 : 4) &&
      prC.charging_demand < 1 - 1e-9,
      prC.level_pct.toFixed(1) + ' % against program ' + prC.level_program_pct.toFixed(1) +
      ' %, demand ' + prC.charging_demand.toFixed(2) + ' — a railed demand is a wound-up ' +
      'integral, the first closed-loop probe\'s measured defect');
  var lvlPre = prC.level_pct;
  rideC(quiet ? 40 : 120, 6.0);
  var lvlDrained = prC.level_pct, demDrained = prC.charging_demand;
  rideC(quiet ? 80 : 300, 0);
  ckT('a 6 kg/s drain pulls the level down and the controller answers with FULL charging',
      lvlDrained < lvlPre - 10 && demDrained >= 1 - 1e-9 && prC.level_pct > lvlDrained + 1,
      lvlPre.toFixed(1) + ' -> ' + lvlDrained.toFixed(1) + ' % drained, demand ' +
      demDrained.toFixed(2) + ', recovering to ' + prC.level_pct.toFixed(1) +
      ' % — CVCS-scale recovery is SLOW, which is the real plant\'s shape too');

  /* ---- 5c. THE TMI LEVERS (stage 2b) — and the DECEPTION EMERGES --------------------------- */
  head('THE TMI LEVERS  [stuck PORV, block valve, tailpipe — nothing below is scripted]');
  var pzT = PZ.createPressurizer({});
  var sysT = S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41, extraMass: PZ.extraMassFn(pzT) });
  var cvT = CV.createCVCS({});
  var M0T = sysT.M_total, prT = null, pwT = 0, reliefT = 0, lostT = 0;
  function rideT(secs, drv) {
    for (var i = 0; i < secs / DT; i++) {
      var cr = CV.stepCVCS(cvT, sysT, DT);
      var srcs = (cr.sources || []).slice();
      if (reliefT > 0) {
        srcs.push({ node: 'hot_leg', mdot: -reliefT, h: prT.relief_h });
        lostT += reliefT * DT;
      }
      var r = S.stepPlant(sysT, DT, { corePower: 300000, sgDuty: 300000 + pwT, sources: srcs });
      pwT = r.pumpWork_kW;
      prT = PZ.stepPressurizer(pzT, sysT, DT, Object.assign({ tavg_c: 304.5 }, drv));
      reliefT = prT.relief_kgs;
      cvT.chargingDemand = prT.charging_demand;
      cvT.letdownOpen = prT.letdown_isolated ? 0 : 1;
    }
    return prT;
  }
  rideT(quiet ? 40 : 120, {});
  ckT('before the failure: tailpipe COLD, no discharge, stuck reads an earned false',
      prT.tailpipe_temp_c < 100 && prT.relief_kgs === 0 && prT.porv_stuck === false,
      'tailpipe ' + prT.tailpipe_temp_c.toFixed(0) + ' degC — a pipe that has never passed');
  /* THE STICK IS A LATCH (owner design, 2026-08-25). Armed alone it moves nothing — pinned,
   * because the pre-latch build opened the valve on arming and the plant never had to lift
   * it. Then ONE second of the operator's lift, released: the latch must hold what the
   * demand no longer asks for. */
  rideT(quiet ? 20 : 60, { porv_stick: true });
  ckT('ARMING the stick lifts nothing: shut, cold, stuck false, armed reported',
      prT.relief_kgs === 0 && prT.porv_stuck === false && prT.porv_stick_armed === true &&
      prT.tailpipe_temp_c < 100,
      'stuck ' + prT.porv_stuck + ', discharge ' + prT.relief_kgs.toFixed(2) + ' kg/s');
  rideT(1, { porv_stick: true, porv_manual: true });
  rideT(quiet ? 40 : 120, { porv_stick: true });
  /* RE-EXPRESSED 2026-08-26 (#515 Build 2): the flow is ONE valve's effective area times the
   * homogeneous critical flux of what the vessel offers it, at THIS pressure — the check tests
   * the LAW, not the rated number (which the constants section pins separately). */
  var lawOne = (PZ.reliefAreas().porv_m2 / 2) * PZ.criticalFlux(prT.relief_h, sysT.P);
  ckT('the PORV sticks: ONE valve\'s area times the choked flux flows, and the tailpipe goes HOT',
      Math.abs(prT.relief_kgs - lawOne) < 1e-9 && prT.relief_kgs > 0 &&
      prT.tailpipe_temp_c > 200 && prT.porv_stuck === true,
      prT.relief_kgs.toFixed(2) + ' kg/s (one valve of two, at ' + (sysT.P * PSI).toFixed(0) +
      ' psia; rated 4.45 at 2350), tailpipe ' + prT.tailpipe_temp_c.toFixed(0) + ' degC');
  var invMid = 100 * sysT.M_total / M0T;
  rideT(quiet ? 160 : 480, { porv_stick: true });
  var invLate = 100 * sysT.M_total / M0T;
  /* ⚠ THE MEASUREMENT THIS STAGE EXISTS FOR. Measured on the first probe: from 3 to 11 minutes
   * stuck, the LEVEL reads 100 % — high-level alarm in — while INVENTORY falls 96 -> 84 %
   * through the open valve. The depressurising loop saturates and swells into the vessel;
   * an operator "going by pressurizer level" throttles injection exactly as TMI-2's did.
   * Nothing here is scripted: the deception is the machinery. */
  ckT('THE TMI DECEPTION: the level reads HIGH while the inventory is LEAVING',
      prT.level_pct > 90 && invLate < invMid - 2 && lostT > 500,
      'level ' + prT.level_pct.toFixed(1) + ' % (hi alarm ' + prT.level_hi_alarm + ') with ' +
      lostT.toFixed(0) + ' kg gone through the valve and inventory ' + invLate.toFixed(1) +
      ' % — the level instrument is telling the truth about the vessel and lying about the plant');
  rideT(quiet ? 40 : 120, { porv_stick: true, block_valve: false });
  var lostAtIso = lostT;
  var tailAtIso = prT.tailpipe_temp_c;
  ckT('CLOSING THE BLOCK VALVE ends the loss — stuck or not',
      prT.relief_kgs === 0 && prT.block_valve_open === false,
      'discharge 0.00 with the PORV still stuck open behind the valve — the operator action ' +
      'that ended TMI-2, at minute 142');
  rideT(quiet ? 80 : 300, { porv_stick: true, block_valve: false });
  ckT('...the inventory loss is FROZEN and the tailpipe cools SLOWLY — the deceptive half',
      lostT === lostAtIso && prT.tailpipe_temp_c < tailAtIso - 20 &&
      prT.tailpipe_temp_c > 100,
      'lost held at ' + lostT.toFixed(0) + ' kg; tailpipe ' + tailAtIso.toFixed(0) + ' -> ' +
      prT.tailpipe_temp_c.toFixed(0) + ' degC — still hot minutes after isolation, which is ' +
      'why a hot pipe proves nothing about the valve');

  /* ---- 6. THE SOLID REGIME IS REACHABLE ---------------------------------------------------- */
  head('WATER SOLID  [drivable, flagged, and the plant stiffens -- the TMI curriculum\'s regime]');
  var pzS = PZ.createPressurizer({ level_frac: 0.90 });
  var sysS = S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41, extraMass: PZ.extraMassFn(pzS) });
  var prS = null, dPmax = 0, lastP = sysS.P;
  for (var iS = 0; iS < (quiet ? 150 : 400) / DT; iS++) {
    /* charging without letdown: a slow net mass ADD, the classic route to solid */
    var rS = S.stepPlant(sysS, DT, { corePower: 300000, sgDuty: 300000 + pw,
      sources: [{ node: 'cold_leg', mdot: 3.0, h: W.h_l(288, sysS.P) }] });
    prS = PZ.stepPressurizer(pzS, sysS, DT, { spray_manual: 0, heaters_manual: 0 });
    if (Math.abs(sysS.P - lastP) > dPmax) dPmax = Math.abs(sysS.P - lastP);
    lastP = sysS.P;
    if (prS.water_solid) break;
  }
  ckT('charging with no letdown DRIVES THE VESSEL SOLID -- the flag earns true',
      prS.water_solid === true && prS.level_pct > 99.9,
      'solid at t = ' + (iS * DT).toFixed(0) + ' s, ' + (sysS.P * PSI).toFixed(0) + ' psia');
  var Psolid0 = sysS.P, tSolidWin = 0;
  /* the window ends at the first RELIEF step: a solid vessel now passes WATER through the PORV
   * and safeties at the choked liquid flux (#515 Build 2), and a valve-limited rate is a
   * different claim from the liquid-compliance one this check makes */
  for (var iS2 = 0; iS2 < 10 / DT; iS2++) {
    S.stepPlant(sysS, DT, { corePower: 300000, sgDuty: 300000 + pw,
      sources: [{ node: 'cold_leg', mdot: 3.0, h: W.h_l(288, sysS.P) }] });
    prS = PZ.stepPressurizer(pzS, sysS, DT, { spray_manual: 0, heaters_manual: 0, block_valve: false });
    if (prS.relief_kgs > 0) break;
    tSolidWin += DT;
  }
  /* REFIT 2026-08-25 (#515): the old check asserted the solid rate > 8x "the max rate while
   * the bubble lived" (0.21 psi/s). That bubbled rate WAS THE DEFECT D5 §84 measured — the
   * equilibrium vessel could not spike — so the 8x ratio pinned the softness. A physical
   * bubble pressurizes at a few psi/s under 3 kg/s and the solid vessel in the liquid-
   * compliance class (3 kg/s into ~50 kg/MPa of liquid + loop ≈ 9 psi/s). Three claims
   * replace the ratio, each validated on the old build too (old: 10.1 psi/s solid, 0.21
   * bubbled — passes all three). */
  var rateSolid = (sysS.P - Psolid0) * PSI / Math.max(tSolidWin, DT);
  ckT('...and the SOLID plant pressurizes in the liquid-compliance class -- the §25.3 collapse, live',
      rateSolid > 4 && rateSolid < 25,
      rateSolid.toFixed(1) + ' psi/s solid under 3 kg/s over ' + tSolidWin.toFixed(1) +
      ' s with no relief (liquid + loop compliance ~50 kg/MPa)');
  var pzB = PZ.createPressurizer({});
  var sysB = S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41, extraMass: PZ.extraMassFn(pzB) });
  var Pb0 = sysB.P, prB = null;
  for (var iB = 0; iB < 10 / DT; iB++) {
    S.stepPlant(sysB, DT, { corePower: 300000, sgDuty: 300000 + pw,
      sources: [{ node: 'cold_leg', mdot: 3.0, h: W.h_l(288, sysB.P) }] });
    prB = PZ.stepPressurizer(pzB, sysB, DT, { spray_manual: 0, heaters_manual: 0 });
  }
  var rateBub = (sysB.P - Pb0) * PSI / 10;
  /* MEASURED 2026-08-25: 6.15 psi/s bubbled vs 7.5 solid — on a 10 s window a near-critical
   * steam bubble compresses nearly as stiffly as the liquid (the loop's own 0.24 m3/MPa is the
   * larger compliance); condensation softens it on tau_int's timescale, not in 10 s. The claim
   * is SOFTER, not a ratio: the first draft's "less than half" was a guess, not a source. */
  ckT('...while the same 3 kg/s into a BUBBLED 61.5 % vessel pressurizes more slowly (softer, not solid)',
      rateBub > 0 && rateBub < rateSolid && !prB.water_solid,
      rateBub.toFixed(2) + ' psi/s bubbled vs ' + rateSolid.toFixed(1) + ' solid');
  /* ---- 7. THE INSURGE COMPRESSES THE STEAM (2026-08-25, #515 — D5 §84/§85) ----------------
   * Ginna UFSAR ch15 Table 15.2-1: a loss of load with no anticipatory trip reaches the 2425
   * psia high-pressure trip in 5.4 s from 2190 (+235 psi). The equilibrium vessel answered the
   * same insurge with +0.6 psi on this harness (+10 on the plant). The two-region vessel:
   * P-ONLY HARNESS — one 1 m3 hot-leg node and the seat, a prescribed +37 kg/s of 316 degC
   * water (200 kg / ~8 level points in 5.4 s), spray/heaters manual 0, the PORV isolated. The
   * code safeties cannot be isolated (by design), so the rides stop at 3.0 s (111 kg), before
   * the isentropic ceiling reaches 2500 psia. tau_int = Infinity is that ceiling; the adopted
   * value must sit BELOW it (condensation does something) and well ABOVE the old vessel. ---- */
  head('THE INSURGE COMPRESSES THE STEAM  [Ginna 15.2-1: +235 psi in 5.4 s; the old vessel: +0.6]');
  var CORE = RD.core, tauSaved = PZ.STRATIFY.tau_int_s;
  function pOnly(mdot, secs, tau, extraDrv) {
    PZ.STRATIFY.tau_int_s = tau;
    var p = PZ.createPressurizer({});
    var s = CORE.createSystem({ nodes: [{ id: 'hot_leg', V: 1.0, h: W.h_l(316, 15.41) },
                                        { id: 'cold_leg', V: 1.0, h: W.h_l(288, 15.41) }],
                                P: 15.41, extraMass: PZ.extraMassFn(p) });
    s.mdot_loop = 1630;                                   /* spray needs RCP head */
    var drv = Object.assign({ spray_manual: 0, heaters_manual: 0, block_valve: false }, extraDrv || {});
    var r = PZ.stepPressurizer(p, s, DT, drv), P0 = s.P, L0 = r.level_pct, hh = W.h_l(316, 15.41);
    var lvlPrev = L0, mono = true, rainMax = 0, boilMax = 0, maxStep = 0, hfg;
    for (var t = 0; t < secs; t += DT) {
      var c = CORE.step(s, DT, { sources: mdot ? [{ node: 'hot_leg', mdot: mdot, h: hh }] : [] });
      if (Math.abs(c.dP) > maxStep) maxStep = Math.abs(c.dP);
      r = PZ.stepPressurizer(p, s, DT, drv);
      if (mdot > 0 && r.level_pct < lvlPrev - 1e-9) mono = false;
      lvlPrev = r.level_pct;
      if (r.rain_kgs > rainMax) rainMax = r.rain_kgs;
      if (r.boil_kgs > boilMax) boilMax = r.boil_kgs;
    }
    PZ.STRATIFY.tau_int_s = tauSaved;
    hfg = W.h_g(s.P) - W.h_f(s.P);
    return { dP_psi: (s.P - P0) * PSI, dLvl: r.level_pct - L0, mono: mono, rainMax: rainMax, boilMax: boilMax,
             maxStep: maxStep, rep: r, pz: p, sys: s,
             singlePhase: (p.m_sat <= 0 || p.h_sat <= W.h_f(s.P) + 1e-9) &&
                          (p.m_sub <= 0 || p.h_sub <= W.h_f(s.P) + 1e-9) &&
                          (p.m_stm <= 0 || p.h_stm >= W.h_g(s.P) - 1e-9) };
  }
  var iInf = pOnly(+37, 3.0, Infinity), iAdopt = pOnly(+37, 3.0, tauSaved), iOut = pOnly(-37, 3.0, tauSaved);
  ckT('tau -> Infinity is the ISENTROPIC CEILING: +37 kg/s for 3 s raises pressure > 120 psi ' +
      '(the equilibrium vessel: +0.4) and < 400 (a rigid steam space would give thousands)',
      iInf.dP_psi > 120 && iInf.dP_psi < 400,
      iInf.dP_psi.toFixed(1) + ' psi for ' + iInf.dLvl.toFixed(2) + ' level points');
  ckT('the ADOPTED tau_int sits below that ceiling and well above the old vessel: condensation ' +
      'does something, and the steam is still compressed',
      iAdopt.dP_psi > 0.5 * iInf.dP_psi && iAdopt.dP_psi < 0.97 * iInf.dP_psi,
      iAdopt.dP_psi.toFixed(1) + ' psi at tau ' + tauSaved + ' s vs ' + iInf.dP_psi.toFixed(1) +
      ' isentropic (' + (100 * iAdopt.dP_psi / iInf.dP_psi).toFixed(0) + ' %)');
  ckT('...at >= 10 psi per level point (was 0.06), the level rising MONOTONICALLY by 3-6 points',
      iAdopt.dP_psi / iAdopt.dLvl >= 10 && iAdopt.mono && iAdopt.dLvl > 3 && iAdopt.dLvl < 6,
      (iAdopt.dP_psi / iAdopt.dLvl).toFixed(1) + ' psi/pt, +' + iAdopt.dLvl.toFixed(2) + ' pts');
  ckT('the OUTSURGE mirror: -37 kg/s for 3 s LOWERS pressure and the expanding steam RAINS OUT',
      iOut.dP_psi < -30 && iOut.rainMax > 0 && iOut.dLvl < -3,
      iOut.dP_psi.toFixed(1) + ' psi, ' + iOut.dLvl.toFixed(2) + ' pts, rain-out up to ' +
      iOut.rainMax.toFixed(2) + ' kg/s');
  ckT('every region is SINGLE-PHASE at the step boundary after both rides (flash and rain-out ' +
      'at the solved P — formulation 1\'s killer, by construction)',
      iAdopt.singlePhase && iOut.singlePhase && iInf.singlePhase,
      'pool subcool ' + iAdopt.rep.pool_subcool_kJkg.toFixed(1) + ' kJ/kg, steam superheat ' +
      iAdopt.rep.steam_superheat_kJkg.toFixed(1) + ' kJ/kg after the insurge');
  ckT('no step of any ride approaches P_JUMP_MAX (2.0 MPa/step)',
      iInf.maxStep < 0.1 && iOut.maxStep < 0.1,
      'max |dP|/step ' + Math.max(iInf.maxStep, iOut.maxStep).toFixed(4) + ' MPa');
  /* MANUAL heaters and spray on the design vessel, no surge: the two authorities act on their
   * own regions (heaters boil the liquid, spray condenses the steam) */
  var iHeat = pOnly(0, 60, tauSaved, { heaters_manual: 1 });
  ckT('MANUAL heaters (full bank) RAISE pressure in the 0.2-1.5 psi/s class and BOIL the pool',
      iHeat.dP_psi / 60 > 0.2 && iHeat.dP_psi / 60 < 1.5 && iHeat.boilMax > 0,
      (iHeat.dP_psi / 60).toFixed(2) + ' psi/s, boiling up to ' + iHeat.boilMax.toFixed(3) + ' kg/s');
  var iSpray = pOnly(0, 60, tauSaved, { spray_manual: 1 });
  ckT('MANUAL spray (full) LOWERS pressure by CONDENSING steam into the pool',
      iSpray.dP_psi < -20 && iSpray.rep.spray_cond_kgs > 0 && iSpray.pz.m_stm < iInf.pz.m_stm,
      iSpray.dP_psi.toFixed(1) + ' psi over 60 s, condensing ' + iSpray.rep.spray_cond_kgs.toFixed(3) +
      ' kg/s of steam');
  /* the SAVE MIGRATION: a pre-#515 vessel (m_pzr / h_bar / V_liq) lands on the two-region
   * vessel it implied — same mass to table accuracy, same level */
  var oldPz = PZ.createPressurizer({ level_frac: 0.55 });
  var oldLike = { V: oldPz.V, m_pzr: oldPz.m_pzr, V_liq: 0.55 * oldPz.V,
                  h_bar: (oldPz.m_sat * W.h_f(15.41) + oldPz.m_stm * W.h_g(15.41)) / oldPz.m_pzr,
                  setpoint_mpa: 15.41, backupOn: false, porvOpen: false, safetyOpen: false,
                  waterSolid: false, emptied: false, heatersShed: false, levErrInt: 0,
                  lowLevelCut: false, porvStuck: false, porvManual: false, blockOpen: true, T_tail_c: 50 };
  var migrated = PZ.migrateState(oldLike, 15.41);
  ckT('an OLD save (m_pzr / h_bar / V_liq) migrates to the two-region vessel it implied: same ' +
      'mass to 0.1 kg, same level to 0.5 %, no h_bar left behind',
      migrated.m_stm !== undefined && Math.abs(PZ.extraMassFn(migrated)(15.41) - oldPz.m_pzr) < 0.1 &&
      Math.abs(100 * migrated.V_liq / migrated.V - 55) < 0.5 && migrated.h_bar === undefined,
      'seat ' + PZ.extraMassFn(migrated)(15.41).toFixed(2) + ' vs ' + oldPz.m_pzr.toFixed(2) +
      ' kg, level ' + (100 * migrated.V_liq / migrated.V).toFixed(2) + ' %');

  /* ---- 8. THE CHOKED RELIEF LAW (#515 Build 2, 2026-08-26) --------------------------------- */
  head('THE CHOKED RELIEF  [area from the rating, flux from Layer 0; steam, then flashing water]');
  var Ar = PZ.reliefAreas(), Pr = PZ.RELIEF.porv_rated_mpa;
  ck('a stuck PORV passes EXACTLY its rated mass of saturated steam AT the rating pressure',
     (Ar.porv_m2 / 2) * PZ.criticalFlux(W.h_g(Pr), Pr), PZ.RELIEF.porv_kgs / 2, 1e-9, 'kg/s');
  ck('...and the safeties theirs at 2500 psia',
     Ar.safety_m2 * PZ.criticalFlux(W.h_g(PZ.RELIEF.safety_rated_mpa), PZ.RELIEF.safety_rated_mpa),
     PZ.RELIEF.safety_kgs, 1e-9, 'kg/s');
  var gS16 = PZ.criticalFlux(W.h_g(16.2), 16.2), gS69 = PZ.criticalFlux(W.h_g(6.9), 6.9),
      gL69 = PZ.criticalFlux(W.h_f(6.9), 6.9), gS2 = PZ.criticalFlux(W.h_g(2.0), 2.0);
  var gIdeal = function (P) { var g = 1.3, R = 461.5, T = W.T_sat(P) + 273.15;
    return P * 1e6 * Math.sqrt(g / (R * T)) * Math.pow(2 / (g + 1), (g + 1) / (2 * (g - 1))); };
  ckT('saturated STEAM chokes within 25 % of ideal-gas choked flow at 16.2, 6.9 and 2.0 MPa',
      Math.abs(gS16 / gIdeal(16.2) - 1) < 0.25 && Math.abs(gS69 / gIdeal(6.9) - 1) < 0.25 &&
      Math.abs(gS2 / gIdeal(2.0) - 1) < 0.25,
      gS16.toFixed(0) + ' vs ' + gIdeal(16.2).toFixed(0) + ' kg/m2s at 16.2 MPa; ' +
      gS69.toFixed(0) + ' vs ' + gIdeal(6.9).toFixed(0) + ' at 6.9');
  ckT('...and the steam flux falls with pressure (choked flow ~ P): 6.9 MPa passes 35-50 % of 16.2',
      gS69 / gS16 > 0.35 && gS69 / gS16 < 0.50, (100 * gS69 / gS16).toFixed(0) + ' %');
  ckT('saturated LIQUID chokes at 2-4x the steam flux (flashing water, the Moody class) — and ' +
      'well below the orifice law\'s sqrt(2 rho dP), which overstates flashing flow 10x',
      gL69 / gS69 > 2 && gL69 / gS69 < 4 &&
      gL69 < 0.4 * Math.sqrt(2 * W.rho_l_sat(W.T_sat(6.9)) * 6.8e6),
      'liquid ' + gL69.toFixed(0) + ' vs steam ' + gS69.toFixed(0) + ' kg/m2s at 6.9 MPa; orifice ' +
      Math.sqrt(2 * W.rho_l_sat(W.T_sat(6.9)) * 6.8e6).toFixed(0));
  /* the SOLID vessel relieves WATER: drive the TMI vessel solid and read what leaves */
  var pzR = PZ.createPressurizer({ level_frac: 0.999999 });
  driveSolid(pzR, 330);
  var rR = PZ.stepPressurizer(pzR, stub(at(120), 1630), DT, { porv_stick: true, porv_manual: true });
  ckT('a SOLID vessel relieves LIQUID through the stuck valve — at the liquid flux, 2-4x the steam rate',
      rR.relief_h < W.h_f(at(120)) + 1e-6 && rR.water_solid &&
      rR.relief_kgs > 2 * (Ar.porv_m2 / 2) * PZ.criticalFlux(W.h_g(at(120)), at(120)),
      rR.relief_kgs.toFixed(2) + ' kg/s of water at ' + rR.relief_h.toFixed(0) + ' kJ/kg vs ' +
      ((Ar.porv_m2 / 2) * PZ.criticalFlux(W.h_g(at(120)), at(120))).toFixed(2) + ' of steam');

  /* ---- THE HR1 SPLIT (2026-08-20, the instrument layer's control switchover) --------------
   * CONTROL (heaters/spray/PORV ladder, level PI, 17 % cut) reads drivers.indicated_*;
   * the CODE SAFETIES read TRUE pressure. Both halves proven on LIES, because a healthy
   * indicated channel is indistinguishable from truth (#220). */
  head('THE HR1 SPLIT  [the ladder believes the instrument; the safeties believe the metal]');
  var pzH = PZ.createPressurizer({});
  var sysH = S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41, extraMass: PZ.extraMassFn(pzH) });
  for (var kH = 0; kH < 200; kH++) PZ.stepPressurizer(pzH, sysH, 0.02, {});
  var rLie = PZ.stepPressurizer(pzH, sysH, 0.02,
    { indicated_pressure_mpa: pzH.setpoint_mpa - 30 / 145.03774 });
  ckT('an indicated -30 psi lie drives the heaters FULL with true P at the setpoint',
      rLie.heater_frac === 1 && pzH.backupOn === true,
      'heater frac ' + rLie.heater_frac + ', backup ' + pzH.backupOn);
  var rLie2 = null;
  for (kH = 0; kH < 10; kH++) {
    rLie2 = PZ.stepPressurizer(pzH, sysH, 0.02,
      { indicated_pressure_mpa: pzH.setpoint_mpa + 120 / 145.03774 });
  }
  ckT('an indicated +120 psi lie opens the PORV -- and the code safety stays SHUT (true P fine)',
      pzH.porvOpen === true && pzH.safetyOpen === false,
      'porv ' + pzH.porvOpen + ', safety ' + pzH.safetyOpen);
  /* the mechanical half: true P past 2500 psia while the indicated channel lies LOW */
  sysH.P = 2510 / 145.03774;
  PZ.stepPressurizer(pzH, sysH, 0.02,
    { indicated_pressure_mpa: pzH.setpoint_mpa - 100 / 145.03774 });
  ckT('true P at 2510 psia lifts the CODE SAFETY though the indicated channel lies low',
      pzH.safetyOpen === true,
      'a spring-loaded valve has no instrument in its loop -- the split, both halves');
  var pzL = PZ.createPressurizer({});
  var sysL = S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41, extraMass: PZ.extraMassFn(pzL) });
  for (kH = 0; kH < 200; kH++) PZ.stepPressurizer(pzL, sysL, 0.02, {});
  var rLvl = PZ.stepPressurizer(pzL, sysL, 0.02, { indicated_level_pct: 10 });
  ckT('an indicated 10 % level lie latches the 17 % heater cut with the true level healthy',
      pzL.lowLevelCut === true && rLvl.heater_kW === 0,
      'cut ' + pzL.lowLevelCut + ', heaters ' + rLvl.heater_kW + ' kW');

}

/* ---- run + injection self-test -------------------------------------------------------------- */
console.log('\nPWR2 Layer 5 -- THE PRESSURIZER: sourced ladder, the two-region vessel, regimes (#515)');
var rec = [];
runSuite(loadAll(), rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var PZSRC = fs.readFileSync(path.join(SRC, 'pwr2_pressurizer.js'), 'utf8').replace(/\r\n/g, '\n');
var MUTATIONS = [
  ['the code safeties read the INDICATED channel (a lying-low channel could hold them shut)',
   '    if (!pz.safetyOpen && P >= RELIEF.safety_open_mpa) pz.safetyOpen = true;',
   '    if (!pz.safetyOpen && P_ctl >= RELIEF.safety_open_mpa) pz.safetyOpen = true;'],
  ['the ladder reads TRUTH (the HR1 split undone -- no lie can misdrive the heaters)',
   "    var P_ctl = drivers.indicated_pressure_mpa !== undefined ? drivers.indicated_pressure_mpa\n                                                             : P;",
   '    var P_ctl = P;'],
  ['the level PI and 17 % cut read TRUE level (the level channel cannot lie)',
   "    var level_ctl = drivers.indicated_level_pct !== undefined ? drivers.indicated_level_pct\n                                                              : level_pct;",
   '    var level_ctl = level_pct;'],

  /* re-anchored 2026-08-25 (#515): the seat is the two-region m(P) now */
  ['the projection loses its P-dependence (a rigid vessel wearing a bubble\'s name)',
   'if (slack >= 0) return sum + slack * pz.rho_in;',
   'if (slack >= 0) return sum;'],
  ['the migration\'s split uses the spaces\' own densities (formulation 1 — an old save lands off-level)',
   'var rf = W.rho_l_sat(W.T_sat(P)), rg = W.rho_v_sat(P);\n    var Vl = (rf - rg) > 1e-9 ? (m - rg * V) / (rf - rg) : V;',
   'var rf = W.rho_from_h(1000, P), rg = W.rho_from_h(2800, P);\n    var Vl = (rf - rg) > 1e-9 ? (m - rg * V) / (rf - rg) : V;'],
  ['the steam region is not compressed (its volume ignores the solve\'s P — a rigid steam space)',
   'var V_stm = pz.m_stm > 0 ? pz.m_stm / RHO(pz.h_stm + pz.v_stm * dP, P) : 0;',
   'var V_stm = pz.m_stm > 0 ? pz.m_stm / RHO(pz.h_stm, pz.P_ref) : 0;'],
  ['the insurge lands in the POOL (formulation 2 re-armed: the bubble\'s job handed to liquid density)',
   'pz.h_sub = (pz.m_sub * pz.h_sub + dm * h_in) / (pz.m_sub + dm);\n        pz.m_sub += dm;',
   'addPool(pz, dm, h_in);'],
  ['the interface is deleted (tau -> Infinity: no condensation, no de-superheat)',
   'if (isFinite(tau) && tau > 0) {',
   'if (false) {'],
  ['the expanding steam never rains out (a wet steam region counts as no liquid)',
   'pz.m_stm -= ml; pz.h_stm = hg; addPool(pz, ml, hf); rain_kgs = ml / dt;',
   'rain_kgs = 0;'],
  ['the pool never flashes (a superheated liquid layer counts as liquid)',
   'mv = Math.min(1, (pz.h_sat - hf) / hfg) * pz.m_sat;',
   'mv = 0;'],
  ['spray condenses nothing (an energy sink with no mass transfer)',
   'var dmS = Math.min(Q_spray_kW * dt / Math.max(pz.h_stm - hf, 1), pz.m_stm);',
   'var dmS = 0;'],
  ['the migration returns an old save unreconstructed',
   'if (!pz || pz.m_stm !== undefined) return pz;',
   'if (true) return pz;'],
  ['spray ignores the RCP (a stopped loop sprays anyway)',
   'if (SPRAY.needs_rcp && !(sys.mdot_loop > 100)) sprayFrac = 0;', ''],
  ['the heater FAILURE seat is severed (a failed bank keeps heating) -- #507 wave 6',
   'var Q_heat_kW = (pz.heatersShed || drivers.heaters_failed) ? 0',
   'var Q_heat_kW = pz.heatersShed ? 0'],
  ['the spray stick is severed (a stuck-open valve obeys the demand) -- #507 wave 6',
   '    if (pz.sprayStuck) sprayFrac = 1;',
   ''],
  /* re-anchored #507 wave 4: the shed became a LATCH (armed by SI/LOOP/dead-bus, cleared by
   * the operator's heater command), so the SI term now lives in the ARMING signal — deleting
   * it there means an SI plant never sheds, which must red the shed check */
  /* re-anchored #510 batch 2: the arming signal split into per-signal edges */
  ['the SI heater shed is deleted (the #447 requirement, undone)',
   'var siSig = !!drivers.si_active;',
   'var siSig = false;'],
  ['the LOOP edge rides the SI edge again (#510 H-6 re-armed: LOOP-after-SI never sheds)',
   'if ((siSig && !pz._siPrev) || (loopSig && !pz._loopPrev)) pz.shedLatch = true;',
   'if ((siSig || loopSig) && !(pz._siPrev || pz._loopPrev)) pz.shedLatch = true;'],
  ['backup heaters clear at their own on-point (the sourced -17 hysteresis flattened)',
   'else if (err_psi >= CONTROL.backup_off_psi && !backupOnLevel) pz.backupOn = false;',
   'else if (err_psi >= CONTROL.backup_on_psi && !backupOnLevel) pz.backupOn = false;'],
  ['the safeties reseat at the lift point (the sourced 5 % blowdown deleted)',
   'else if (pz.safetyOpen && P <= RELIEF.safety_open_mpa * RELIEF.safety_reseat_frac) {',
   'else if (pz.safetyOpen && P <= RELIEF.safety_open_mpa) {'],
  ['insurge enthalpy is dropped (the stratified layer arrives SATURATED, not at the hot leg)',
   'var h_in = pz.h_fill;',
   'var h_in = hf;'],
  ['the heaters never reach the energy ledger (a demand with no watts)',
   'if (Q_heat_kW > 0) {',
   'if (false) {'],
  ['the spray band opens at the backup-heater point (a sign confusion on the ladder)',
   'var sprayAuto = clip((err_psi - CONTROL.spray_start_psi) /',
   'var sprayAuto = clip((err_psi - CONTROL.backup_on_psi) /'],
  ['water-solid never flags (the regime transition clipped away)',
   'if (pz.m_stm <= STRATIFY.m_stm_floor_kg) {',
   'if (false) {'],
  ['the level program is a constant (Tavg never reaches it)',
   'var f = (Tavg_c - LEVEL.tavg_noload_c) / (LEVEL.tavg_full_c - LEVEL.tavg_noload_c);',
   'var f = 1;'],
  ['the 17 % low-level cut is deleted (heaters boil in a steam space)',
   'if (!pz.lowLevelCut && level_ctl <= LEVEL.low_cut_pct) pz.lowLevelCut = true;',
   'if (false) pz.lowLevelCut = true;'],
  ['the level PI acts BACKWARD (a low level throttles charging)',
   'var levErr = program_pct - level_ctl;',
   'var levErr = level_ctl - program_pct;'],
  ['the +5 % anticipatory backup-heater signal is deleted',
   'var backupOnLevel = levErr <= -LEVEL.backup_above_program_pct;',
   'var backupOnLevel = false;'],
  ['the stick lever is dead (a lift never latches)',
   'else if (pz.porvOpen || pz.porvManual) pz.porvStuck = true;',
   'else if (false) pz.porvStuck = true;'],
  ['the stick OPENS the valve on arming (the pre-2026-08-25 build: no latch, no lift needed)',
   'else if (pz.porvOpen || pz.porvManual) pz.porvStuck = true;',
   'else pz.porvStuck = true;'],
  ['the clear does not release the latch',
   'if (!stickArmed) pz.porvStuck = false;',
   'if (false) pz.porvStuck = false;'],
  ['a stuck PORV flows BOTH valves\' capacity (one valve stuck is one valve)',
   '(pz.porvOpen ? 2 : (oneValve ? 1 : 0))',
   '(pz.porvOpen ? 2 : (oneValve ? 2 : 0))'],
  ['the block valve never isolates',
   'var nPorv = !pz.blockOpen ? 0',
   'var nPorv = false ? 0'],
  /* #515 Build 2: the choked law */
  ['the relief flow is PRESSURE-BLIND again (the flux evaluated at the rating pressure)',
   'var G_relief = (nPorv > 0 || pz.safetyOpen) ? criticalFlux(relief_h, P) : 0;',
   'var G_relief = (nPorv > 0 || pz.safetyOpen) ? criticalFlux(relief_h, RELIEF.porv_rated_mpa) : 0;'],
  ['a SOLID vessel relieves at the STEAM flux (the liquid regime, TMI\'s, denied)',
   'else if (pz.m_sat > 0) relief_h = pz.h_sat;',
   'else if (pz.m_sat > 0) relief_h = hg;'],
  ['the choked flux never chokes (the throat search returns the first sample)',
   'if (G > best) best = G; else if (i > 2) break;',
   'if (i === 1) best = G;'],
  ['the tailpipe never heats (the passing indication is dead)',
   'pz.T_tail_c += dt * (W.T_sat(P) - pz.T_tail_c) / RELIEF.tail_tau_heat_s;',
   ''],
  ['the tailpipe cools as fast as it heats (the deceptive half deleted)',
   'pz.T_tail_c += dt * (amb - pz.T_tail_c) / RELIEF.tail_tau_cool_s;',
   'pz.T_tail_c += dt * (amb - pz.T_tail_c) / RELIEF.tail_tau_heat_s;'],
  /* re-anchored #510 batch 2: auxFrac grew the vital-bus gate */
  ['the aux-spray command is dead',
   'var auxFrac = (drivers.aux_spray === undefined || drivers.ac_available === false)\n                  ? 0 : clip(drivers.aux_spray, 0, 1);',
   'var auxFrac = 0;'],
  ['aux spray gated on the RCPs (its reason to exist, inverted)',
   'var auxFrac = (drivers.aux_spray === undefined || drivers.ac_available === false)\n                  ? 0 : clip(drivers.aux_spray, 0, 1);',
   'var auxFrac = !(sys.mdot_loop > 100) ? 0 : ((drivers.aux_spray === undefined || drivers.ac_available === false) ? 0 : clip(drivers.aux_spray, 0, 1));'],
  ['the aux-spray vital-bus gate is severed (#510 H-4 re-armed: 29 gpm through a blackout)',
   'var auxFrac = (drivers.aux_spray === undefined || drivers.ac_available === false)\n                  ? 0 : clip(drivers.aux_spray, 0, 1);',
   'var auxFrac = drivers.aux_spray === undefined ? 0 : clip(drivers.aux_spray, 0, 1);']
];

console.log('\ninjection self-test (' + MUTATIONS.length + ' mutations):');
var blind = 0;
MUTATIONS.forEach(function (m) {
  var mutated = PZSRC.replace(m[1], m[2]);
  if (mutated === PZSRC) {
    console.log('  ANCHOR MISS ' + m[0] + '   <-- mutation did not apply');
    blind++;
    return;
  }
  var rec2 = [];
  try { runSuite(loadAll(mutated), rec2, true); } catch (e) { /* a crash is caught too */ }
  var f2 = rec2.length ? rec2.filter(function (r) { return !r.ok; }).length : 1;
  if (f2 === 0) { console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); blind++; }
  else console.log('  caught    ' + m[0].padEnd(70) + f2 + ' checks red');
});
loadAll();   /* restore the real module for whoever requires after us */

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_pressurizer: ' + pass + ' passed, ' + fail + ' failed  (' +
  rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit(fail > 0 || blind > 0 ? 1 : 0);
