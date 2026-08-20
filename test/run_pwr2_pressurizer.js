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
  ck('the projection reproduces the constructed mass EXACTLY',
     PZ.extraMassFn(pz0)(15.41), pz0.m_pzr, 1e-9, 'kg');
  ck('...and the derived level reproduces the requested program level',
     100 * pz0.V_liq / pz0.V, 61.5, 1e-9, '%');
  var pz40 = PZ.createPressurizer({ level_frac: 0.40 });
  ck('a 40 % vessel round-trips too -- no hidden dependence on the program point',
     PZ.extraMassFn(pz40)(15.41), pz40.m_pzr, 1e-9, 'kg');
  ckT('h_bar sits inside the dome -- the constructed vessel is genuinely two-phase',
      pz0.h_bar > W.h_f(15.41) && pz0.h_bar < W.h_g(15.41),
      'h_bar ' + pz0.h_bar.toFixed(1) + ' kJ/kg between h_f ' + W.h_f(15.41).toFixed(1) +
      ' and h_g ' + W.h_g(15.41).toFixed(1));

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
  solid.h_bar = W.h_l(340, 15.41);            /* driven SOLID: subcooled liquid fills it */
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
        pzS2.h_bar = W.h_l(340, 15.41);
        PZ.stepPressurizer(pzS2, stub(15.41, 0), DT, {});   /* flags update on first step */
        return PZ.stepPressurizer(pzS2, stub(15.41, 0), DT, { aux_spray: 1.0 }).aux_spray_frac === 0;
      })(), '');
  ckT('SI SHEDS THE HEATERS (NUREG-0737 II.E.3.1 (7), the #447 requirement)',
      once(-40, { si_active: true }).heater_kW === 0 &&
      once(-40, { si_active: true }).heaters_shed === true,
      'a -40 psi error would otherwise demand every bank');
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
  rideT(quiet ? 40 : 120, { porv_stick: true });
  ckT('the PORV sticks: HALF the two-valve capacity flows and the tailpipe goes HOT',
      Math.abs(prT.relief_kgs - PZ.RELIEF.porv_kgs / 2) < 1e-9 &&
      prT.tailpipe_temp_c > 200 && prT.porv_stuck === true,
      prT.relief_kgs.toFixed(2) + ' kg/s (one valve of two), tailpipe ' +
      prT.tailpipe_temp_c.toFixed(0) + ' degC — the passing indication');
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
  var Psolid0 = sysS.P;
  for (var iS2 = 0; iS2 < 10 / DT; iS2++) {
    S.stepPlant(sysS, DT, { corePower: 300000, sgDuty: 300000 + pw,
      sources: [{ node: 'cold_leg', mdot: 3.0, h: W.h_l(288, sysS.P) }] });
    prS = PZ.stepPressurizer(pzS, sysS, DT, { spray_manual: 0, heaters_manual: 0 });
  }
  ckT('...and the SOLID plant pressurizes ~an order faster per kg -- the §25.3 collapse, live',
      (sysS.P - Psolid0) / 10 > 8 * dPmax / DT * DT,
      ((sysS.P - Psolid0) * PSI / 10).toFixed(1) + ' psi/s solid vs ' +
      (dPmax * PSI / DT * DT).toFixed(2) + ' psi/s max while the bubble lived');
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
console.log('\nPWR2 Layer 5 -- THE PRESSURIZER (stage 1): sourced ladder, compliance, regimes');
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

  ['the projection loses its P-dependence (a rigid vessel wearing a bubble\'s name)',
   'return function (P) { return pz.V * W.rho_from_h(pz.h_bar, P); };',
   'return function (P) { return pz.m_pzr; };'],
  ['the split uses the spaces\' own densities again (formulation 1, the level collapse)',
   'var rf = W.rho_l_sat(W.T_sat(P)), rg = W.rho_v_sat(P);\n    var Vl = (rf - rg) > 1e-9 ? (m - rg * V) / (rf - rg) : V;',
   'var rf = W.rho_from_h(1000, P), rg = W.rho_from_h(2800, P);\n    var Vl = (rf - rg) > 1e-9 ? (m - rg * V) / (rf - rg) : V;'],
  ['spray ignores the RCP (a stopped loop sprays anyway)',
   'if (SPRAY.needs_rcp && !(sys.mdot_loop > 100)) sprayFrac = 0;', ''],
  ['the SI heater shed is deleted (the #447 requirement, undone)',
   'pz.heatersShed = !!drivers.si_active || drivers.ac_available === false || pz.emptied ||\n                     pz.lowLevelCut;',
   'pz.heatersShed = drivers.ac_available === false || pz.emptied ||\n                     pz.lowLevelCut;'],
  ['backup heaters clear at their own on-point (the sourced -17 hysteresis flattened)',
   'else if (err_psi >= CONTROL.backup_off_psi && !backupOnLevel) pz.backupOn = false;',
   'else if (err_psi >= CONTROL.backup_on_psi && !backupOnLevel) pz.backupOn = false;'],
  ['the safeties reseat at the lift point (the sourced 5 % blowdown deleted)',
   'else if (pz.safetyOpen && P <= RELIEF.safety_open_mpa * RELIEF.safety_reseat_frac) {',
   'else if (pz.safetyOpen && P <= RELIEF.safety_open_mpa) {'],
  ['insurge enthalpy is dropped (mass arrives carrying nothing)',
   'H += surge_kgs * dt * (h_hot === undefined ? hf : h_hot);',
   'H += 0;'],
  ['the heaters never reach the energy ledger (a demand with no watts)',
   'H += dt * (Q_heat_kW - Q_spray_kW);',
   'H += dt * (0 - Q_spray_kW);'],
  ['the spray band opens at the backup-heater point (a sign confusion on the ladder)',
   'var sprayAuto = clip((err_psi - CONTROL.spray_start_psi) /',
   'var sprayAuto = clip((err_psi - CONTROL.backup_on_psi) /'],
  ['water-solid never flags (the regime transition clipped away)',
   'pz.waterSolid = pz.h_bar <= hf;',
   'pz.waterSolid = false;'],
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
  ['the stick lever is dead (drivers.porv_stick ignored)',
   'pz.porvStuck = !!drivers.porv_stick;',
   'pz.porvStuck = false;'],
  ['a stuck PORV flows BOTH valves\' capacity (one valve stuck is one valve)',
   ': (pz.porvStuck ? RELIEF.porv_kgs / 2 : 0));',
   ': (pz.porvStuck ? RELIEF.porv_kgs : 0));'],
  ['the block valve never isolates',
   'var porv_kgs = !pz.blockOpen ? 0',
   'var porv_kgs = false ? 0'],
  ['the tailpipe never heats (the passing indication is dead)',
   'pz.T_tail_c += dt * (W.T_sat(P) - pz.T_tail_c) / RELIEF.tail_tau_heat_s;',
   ''],
  ['the tailpipe cools as fast as it heats (the deceptive half deleted)',
   'pz.T_tail_c += dt * (amb - pz.T_tail_c) / RELIEF.tail_tau_cool_s;',
   'pz.T_tail_c += dt * (amb - pz.T_tail_c) / RELIEF.tail_tau_heat_s;'],
  ['the aux-spray command is dead',
   'var auxFrac = drivers.aux_spray === undefined ? 0 : clip(drivers.aux_spray, 0, 1);',
   'var auxFrac = 0;'],
  ['aux spray gated on the RCPs (its reason to exist, inverted)',
   'var auxFrac = drivers.aux_spray === undefined ? 0 : clip(drivers.aux_spray, 0, 1);',
   'var auxFrac = !(sys.mdot_loop > 100) ? 0 : (drivers.aux_spray === undefined ? 0 : clip(drivers.aux_spray, 0, 1));']
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
