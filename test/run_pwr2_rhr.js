/* run_pwr2_rhr.js — Layer 5 gate: residual heat removal. (#479)
 *
 * THE CENTRAL CHECK RUNS THE COOLDOWN AND TIMES IT. RHR's source states a RESULT rather than a
 * parameter — "designed to reduce the temperature of the reactor coolant from 350°F to 140°F
 * within 16 hours" — so the gate performs that cooldown on the real node network and measures how
 * long it takes.
 *
 * ⚠ WHAT THAT CHECK DOES AND DOES NOT PROVE, because deriving from a design basis is circular if
 * you are not careful about which computation is which:
 *
 *   IT DOES prove the derivation is consistent with the plant it was derived for. `derivedUA()`
 *   solves a LUMPED analytic model — one mass, one cp, an exponential approach to an offset floor.
 *   The check runs the DISTRIBUTED engine: eleven nodes, real IAPWS-based properties, the pressure
 *   closure, transport round the ring. Those are different computations, and their agreement is
 *   evidence that the lumped derivation did not quietly assume away something the plant does.
 *
 *   IT DOES NOT prove the sourced inputs. If the 95 °F component cooling water temperature is
 *   wrong — and it is marked [recalled], UNSOURCED — the cooldown still lands on 16 hours, because
 *   UA was derived to make it. **A design-basis derivation can only ever be checked for internal
 *   consistency against itself.** Breaking that needs a second, independent source for either the
 *   sink temperature or the duty, and this corpus has neither.
 *
 * Everything else is comparisons across boundaries, a construction section written first (D1 §31),
 * and a fixture that asserts it is a plant before anything reads from it (D1 §32).
 *
 * Run: node test/run_pwr2_rhr.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_rhr.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop',
 'pwr2_sources'].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, W = RD.water, S = RD.sources;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: RD.water, core: RD.core, geometry: RD.geometry,
                             loop: RD.loop, sources: RD.sources } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.rhr;';
  return new Function('RD_ROOT', body)(root);
}

/* THE SOURCE, RETYPED INDEPENDENTLY of the engine's copy — the ECCS discipline, extended.
 * WTSM §5.1 (ML11223A219) and Ginna TS Bases (ML20339A221). */
var DOC = { open_psig: 425, close_psig: 585, design_psig: 600,
            entry_f: 350, target_f: 140, cold_shutdown_f: 200, hours: 16 };

function runSuite(R, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(52) +
      'got ' + got.toFixed(3) + ' want ' + want.toFixed(3) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  var PSI = 145.038;
  /* A plant at a stated TEMPERATURE, subcooled at a stated pressure. D1 §32: P and h are not
   * independent, and the fixture asserts it is liquid before anything reads from it. */
  function plantAt(T_f, P_mpa) {
    return S.createPlant({ h: W.h_l(R.C(T_f), P_mpa), P: P_mpa });
  }
  function fixtureIsLiquid(sys) {
    for (var i = 0; i < sys.nodes.length; i++) {
      if (sys.nodes[i].h >= W.h_f(sys.P) - 1e-9) return false;
    }
    return isFinite(sys.M_total) && sys.M_total > 1000;
  }

  /* ---- 1. THE SOURCED FIGURES ARE THE DOCUMENT'S -------------------------------------- */
  if (!quiet) console.log('\nSOURCED FIGURES  [WTSM §5.1 + Ginna TS Bases, vs a retyped copy]');
  ck('the open permissive is the sourced 425 psig', R.RHR.permissive_open_psig, DOC.open_psig, 0, 'psig');
  ck('the auto-close interlock is the sourced 585 psig', R.RHR.permissive_close_psig, DOC.close_psig, 0, 'psig');
  ck('RHR entry temperature is the sourced 350 degF', R.RHR.entry_temp_f, DOC.entry_f, 0, 'degF');
  ck('the cooldown target is the sourced 140 degF', R.RHR.target_temp_f, DOC.target_f, 0, 'degF');
  ck('cold shutdown is the sourced 200 degF', R.RHR.cold_shutdown_f, DOC.cold_shutdown_f, 0, 'degF');
  ck('the design cooldown window is the sourced 16 hours', R.RHR.design_cooldown_hours, DOC.hours, 0, 'h');
  ckT('the interlock has HYSTERESIS, and it is the sourced gap',
      R.RHR.permissive_close_psig > R.RHR.permissive_open_psig,
      DOC.close_psig - DOC.open_psig + ' psig between "may open" and "must shut" -- a single ' +
      'setpoint would chatter, and the gap is in the document');
  ckT('the low-pressure side design pressure is above the close interlock',
      R.RHR.design_psig > R.RHR.permissive_close_psig,
      R.RHR.design_psig + ' psig design vs a ' + R.RHR.permissive_close_psig +
      ' psig auto-close -- the interlock protects the piping with margin');

  /* ---- 2. THE COOLDOWN, RUN AND TIMED ------------------------------------------------- */
  if (!quiet) console.log('\nTHE DESIGN BASIS, EXERCISED  [run the cooldown on the real network and time it]');
  var P_cd = (DOC.open_psig + 14.7) / PSI;          /* at the permissive, where RHR comes in */
  /* A COOLDOWN NEEDS THE PRESSURIZER SEAT OCCUPIED. Measured: a rigid loop drove pressure
   * 425 -> 2596 psig in twelve seconds and the solver gave up (D1 §32.3). The surrogate below is
   * MINE, not a model of #472's pressurizer -- it is a compressible volume stiff enough to hold
   * pressure while the plant shrinks, standing in for the pressure control a real cooldown has.
   * Declared because a reader would otherwise take it for physics. */
  function pzrSurrogate(p) { return 500 + 60000 * (p - P_cd); }
  /* dt = 0.3 s, INSIDE the 0.435 s Courant limit (§32). At 4 s this probe reported reaching its
   * target in 36 seconds while the cold leg oscillated to 1e8 -- smooth, plausible and wrong. */
  var DT = 0.3;
  /* THE MUTATION REPLAY RUNS A SHORT COOLDOWN, THE LIVE MEASUREMENT RUNS THE FULL ONE.
   *
   * A 0.3 s step inside the Courant limit means a 22-hour half-lineup cooldown is 268,800 plant
   * steps -- and the self-test replays the whole suite once per mutation, eighteen times. The
   * first version of this gate was minutes of compute per run, which is how a gate stops being
   * run at all.
   *
   * The asymmetry is the same one Layer 4 already uses and for the same reason: the LAW being
   * measured (does the full lineup reach the target, and is one train marginal) needs the real
   * horizon, while every mutation this suite defends against -- a moved setpoint, a lost suction
   * node, an unfloored availability, a sink that becomes a source -- shows up grossly within the
   * first hour. The bands widen in quiet mode to match, and the timing claim is asserted ONLY in
   * the full pass where it means something. */
  var MAX_H = quiet ? 4.0 : DOC.hours * 1.4;
  function cooldown(avail) {
    var sys = S.createPlant({ h: W.h_l(R.C(DOC.entry_f), P_cd), P: P_cd, extraMass: pzrSurrogate });
    var rh = R.createRHR({ valve_open: true, avail: avail }), o = null, hrs = null;
    var Qd = R.RHR.design_decay_fraction_20h * 300000;
    for (var n = 0; n < MAX_H * 3600 / DT; n++) {
      o = R.stepRHR(rh, sys, DT, {});
      S.stepPlant(sys, DT, { heats: o.heats, corePower: Qd });
      if (hrs === null && R.F(o.T_suction_c) <= DOC.target_f) { hrs = n * DT / 3600; break; }
    }
    return { hours: hrs, endF: R.F(o.T_suction_c), UA: o.UA_kW_per_K, sys: sys };
  }
  var full = cooldown(1);
  ckT('the cooldown FIXTURE is subcooled liquid at the entry condition',
      fixtureIsLiquid(S.createPlant({ h: W.h_l(R.C(DOC.entry_f), P_cd), P: P_cd })),
      'entry ' + DOC.entry_f + ' degF at ' + DOC.open_psig + ' psig');
  ckT('the full lineup REACHES the sourced 140 degF target', full.hours !== null,
      full.hours === null ? 'never, ended at ' + full.endF.toFixed(1) + ' degF'
                          : 'at ' + full.hours.toFixed(2) + ' h');
  /* THE SOURCE'S OWN WORD IS "WITHIN". A bound, not a time constant -- §32.3 measured why no UA
   * reproduces 16 hours as a time constant on this plant OR on Ginna. */
  ckT('...and does so WITHIN the sourced 16 hours  [a BOUND -- the document own word]',
      full.hours !== null && full.hours <= DOC.hours,
      (full.hours === null ? 'n/a' : full.hours.toFixed(2)) + ' h against a bound of ' + DOC.hours);
  if (!quiet) {
    console.log('        UA ' + full.UA.toFixed(0) + ' kW/K, derived from the HOLD constraint ' +
      'against decay heat AND pump heat (the source names both; pump heat measures 1,351 kW here ' +
      'against 1,200 kW of decay -- MORE than the core).');
  }

  /* ONE TRAIN IS MARGINAL BY CONSTRUCTION, and saying so is the honest reading.
   * UA is derived as the MINIMUM that lets one train HOLD the target, so one train asymptotes to
   * 140 degF and cannot cross it in finite time. A real plant has margin above the minimum; this
   * design set does not invent margin it cannot source. What the source promises for a degraded
   * lineup is that the ability to cool is "not compromised" and only the TIME changes -- so what
   * is checked is that one train still cools substantially, not that it reaches a target its
   * derivation places exactly at its own floor. */
  var half = cooldown(0.5);
  ckT('one train still cools the plant substantially',
      half.endF < DOC.entry_f - (quiet ? 60 : 100),
      half.endF.toFixed(1) + ' degF from ' + DOC.entry_f + ' -- the source says the ability to ' +
      'cool is not compromised, only the time');
  ckT('...but is MARGINAL by construction, asymptotic to the target it is sized to HOLD',
      half.hours === null && half.endF > DOC.target_f && half.endF < DOC.target_f + (quiet ? 120 : 40),
      'settles ' + half.endF.toFixed(1) + ' degF against a ' + DOC.target_f +
      ' degF target -- UA is the MINIMUM that holds, so a single train cannot go below it');
  ckT('the full lineup is decisively better than one train  [a COMPARISON]',
      full.hours !== null && half.hours === null,
      'full reaches the target; one train approaches and does not cross');

  /* ---- 3. THE INTERLOCK IS REPORTED, NOT ENFORCED ------------------------------------- */
  if (!quiet) console.log('\nINTERLOCK  [REPORTED, never enforced -- protection is the control layer (HR5)]');
  var below = R.stepRHR(R.createRHR({ valve_open: true }), plantAt(300, (400 + 14.7) / PSI), 1, {});
  var above = R.stepRHR(R.createRHR({ valve_open: true }), plantAt(300, (600 + 14.7) / PSI), 1, {});
  ckT('below 425 psig the permissive says it MAY open', below.permissive_may_open === true &&
      below.permissive_must_shut === false, '400 psig');
  ckT('above 585 psig it says it MUST shut', above.permissive_must_shut === true &&
      above.permissive_may_open === false, '600 psig');
  var mid = R.stepRHR(R.createRHR({ valve_open: true }), plantAt(300, (500 + 14.7) / PSI), 1, {});
  ckT('BETWEEN the two setpoints it may not open and need not shut  [the hysteresis band]',
      mid.permissive_may_open === false && mid.permissive_must_shut === false,
      '500 psig -- an already-open train stays open, a shut one stays shut');
  ckT('the engine does NOT enforce it: a train lined up above the interlock still removes heat',
      above.duty_kW > 0,
      above.duty_kW.toFixed(0) + ' kW at 600 psig -- doing this is a mistake the CONTROL layer ' +
      'must prevent, and an engine that silently refused would be making that decision here');

  /* ---- 4. IT IS A HEAT SINK, WITH THE RIGHT SUCTION ----------------------------------- */
  if (!quiet) console.log('\nDUTY  [a SINK, drawn from the HOT LEG -- sourced, and not a detail]');
  var hotP = plantAt(340, P_cd), coldP = plantAt(160, P_cd);
  var dHot = R.stepRHR(R.createRHR({ valve_open: true }), hotP, 1, {});
  var dCold = R.stepRHR(R.createRHR({ valve_open: true }), coldP, 1, {});
  ckT('duty FALLS as the plant cools  [why the last 40 degF take longest]',
      dCold.duty_kW < dHot.duty_kW * 0.6 && dCold.duty_kW > 0,
      dHot.duty_kW.toFixed(0) + ' kW at 340 degF against ' + dCold.duty_kW.toFixed(0) +
      ' kW at 160 degF');
  var colder = R.stepRHR(R.createRHR({ valve_open: true }), plantAt(80, P_cd), 1, {});
  ckT('below the cooling-water temperature it stops, and does not WARM the plant',
      colder.duty_kW === 0, 'sink at ' + R.F(R.RHR.ccw_temp_c).toFixed(0) +
      ' degF; a signed duty here would heat the plant through its own heat exchanger');
  ckT('a secured train removes nothing',
      R.stepRHR(R.createRHR({ running: false }), hotP, 1, {}).duty_kW === 0, 'running = false');
  /* THE AVAILABILITY FLOOR WAS MASKED BY THE NEGATIVE-DUTY GUARD -- two guards, either
   * sufficient, so mutating one is invisible. Same shape as ECCS's interp short-circuit (§32).
   * Distinguished by checking the floor at a POSITIVE-duty condition where the second guard
   * cannot fire: a negative availability there must give zero, not a negative removal. */
  /* THE ONLY CONDITION WHERE THE FLOOR IS DISTINGUISHABLE IS A PLANT COLDER THAN ITS OWN SINK,
   * and the mutation's own name says so: "negative avail HEATS the plant".
   *
   * On a WARM plant, (Thot - Tccw) is positive, so a negative availability gives a negative duty
   * and the downstream `if (duty < 0) duty = 0` clamp catches it -- the check passes whether the
   * floor exists or not. The first attempt at this check made exactly that mistake, described the
   * masking correctly in its own comment, and was still vacuous.
   *
   * Below the cooling-water temperature (Thot - Tccw) is NEGATIVE, so a negative availability
   * multiplies to a POSITIVE duty: the plant is heated through its own heat exchanger and the
   * clamp never fires. That is the case the floor exists for, and the only one that can fail. */
  var negWarm = R.stepRHR(R.createRHR({ valve_open: true, avail: -2 }), hotP, 1, {});
  var negCold = R.stepRHR(R.createRHR({ valve_open: true, avail: -2 }), plantAt(80, P_cd), 1, {});
  ckT('negative availability is FLOORED even below the sink, where the clamp cannot help',
      negCold.duty_kW === 0 && negWarm.duty_kW === 0 && dHot.duty_kW > 0,
      'avail -2 at ' + R.F(R.RHR.ccw_temp_c).toFixed(0) + ' degF sink: warm plant ' +
      negWarm.duty_kW.toFixed(0) + ' kW (clamp could catch this), COLD plant ' +
      negCold.duty_kW.toFixed(0) + ' kW (only the floor can)');
  /* AND THE RUNNING TOTAL. Its check was lost when section 2 was rewritten, and nothing else
   * reads removed_kJ -- so the accumulator could stop entirely and every other check would pass. */
  var acc = R.createRHR({ valve_open: true }), accSum = 0, accOut = null;
  for (var a = 0; a < 50; a++) {
    accOut = R.stepRHR(acc, hotP, 2, {});
    accSum += accOut.duty_kW * 2;
  }
  ckT('the removed-energy total ACCUMULATES, and matches the duty integrated by hand',
      accOut.removed_kJ > 0 && Math.abs(accOut.removed_kJ - accSum) / accSum < 1e-9,
      (accOut.removed_kJ / 1000).toFixed(0) + ' MJ over 100 s against ' +
      (accSum / 1000).toFixed(0) + ' MJ integrated independently');
  /* SUCTION IS THE HOT LEG -- AND THIS CHECK WAS VACUOUS ON A FRESH PLANT.
   * A plant straight out of createPlant is UNIFORM: every node holds the same enthalpy, so
   * hot_leg and cold_leg are identical and "which node does suction come from" has no answer.
   * The mutation swapping them passed, exactly as the SG-node check did before it was given a
   * settled plant. A distinguishing check needs the two ends to have COME APART first. */
  var sysDT = plantAt(340, P_cd);
  for (var w = 0; w < 400; w++) S.stepPlant(sysDT, 0.3, { corePower: 30000, sgDuty: 30000 });
  var hotH = null, coldH = null;
  sysDT.nodes.forEach(function (n) {
    if (n.id === 'hot_leg') hotH = W.T_from_h(n.h, sysDT.P);
    if (n.id === 'cold_leg') coldH = W.T_from_h(n.h, sysDT.P);
  });
  var dDT = R.stepRHR(R.createRHR({ valve_open: true }), sysDT, 1, {});
  ckT('the legs have actually come apart, so the next check can fail',
      Math.abs(hotH - coldH) > 2,
      'hot ' + R.F(hotH).toFixed(1) + ' degF vs cold ' + R.F(coldH).toFixed(1) +
      ' -- on a fresh uniform plant these are equal and the check below is VACUOUS');
  ckT('suction temperature is the HOT LEG, not the cold leg and not an average',
      Math.abs(dDT.T_suction_c - hotH) < 1e-9 && Math.abs(dDT.T_suction_c - coldH) > 1,
      R.F(dDT.T_suction_c).toFixed(1) + ' degF -- RHR takes suction from the hot leg (WTSM §5.1)');

  /* ---- 5. CONSTRUCTION  [written first -- D1 §31] ------------------------------------- */
  if (!quiet) console.log('\nCONSTRUCTION  [§31: written first, not acquired after an attack]');
  var opt = R.createRHR({ valve_open: true, hx_fraction: 0.7, avail: 0.5, ccw_temp_c: 40, UA: 123, removed_kJ: 7 });
  ckT('caller valve_open reaches the plant (running follows it on the first step)',
      opt.valve_open === true, '');
  ck('caller hx_fraction reaches the plant', opt.hx_fraction, 0.7, 1e-12, '');
  ck('caller avail reaches the plant', opt.avail, 0.5, 1e-12, '');
  ckT('the HX split SCALES duty (the cooldown-rate lever, #458: not an alignment)',
      (function () {
        var full = R.stepRHR(R.createRHR({ valve_open: true }), plantAt(340, P_cd), 1, {});
        var half = R.stepRHR(R.createRHR({ valve_open: true, hx_fraction: 0.5 }), plantAt(340, P_cd), 1, {});
        return full.duty_kW > 0 && Math.abs(half.duty_kW - 0.5 * full.duty_kW) < 1e-6;
      })(), 'hx 0.5 removes exactly half of hx 1.0');
  ck('caller ccw temperature reaches the plant', opt.ccw_temp_c, 40, 1e-12, 'degC');
  ck('caller UA reaches the plant', opt.UA, 123, 1e-12, 'kW/K');
  ck('caller removed_kJ reaches the plant', opt.removed_kJ, 7, 1e-12, 'kJ');
  ckT('a caller UA is USED rather than re-derived on the first step', (function () {
        var r = R.createRHR({ valve_open: true, UA: 1.0 });
        var o = R.stepRHR(r, plantAt(340, P_cd), 1, {});
        return Math.abs(o.UA_kW_per_K - 1.0) < 1e-12;
      })(), 'UA = 1 kW/K survives the first step');
  ckT('omitting UA derives one, and it is plant-sized rather than a placeholder', (function () {
        var o = R.stepRHR(R.createRHR({ valve_open: true }), plantAt(340, P_cd), 1, {});
        return o.UA_kW_per_K > 1 && o.UA_kW_per_K < 1000;
      })(), 'derived from the sourced 16-hour cooldown');
  ckT('the default lineup is SECURED, not running',
      R.stepRHR(R.createRHR({}), plantAt(340, P_cd), 1, {}).duty_kW === 0,
      'a default of "running" would make every probe that omits it cool a plant nobody aligned');
  /* THE PUMPS ARE MOTOR LOADS (#510 H-5): dead bus, no flow, no duty — WTSM 5.7.5's blackout
   * takes every decay-heat-removal system except the turbine-driven AFW pump. Absent means
   * powered, the house convention, so every fixture above is untouched. */
  ckT('the duty share lands ON-LOOP only (#510 M-11) — the stagnant vessel heads and the ' +
      'pressurizer get NONE, and the shares still sum to exactly the duty',
      (function () {
        var r = R.createRHR({ valve_open: true });
        var out = R.stepRHR(r, plantAt(340, P_cd), 1, {});
        var h = out.heats, sum = 0;
        if (!h || h.pressurizer !== undefined || h.vessel_heads !== undefined) return false;
        Object.keys(h).forEach(function (k) { sum += h[k]; });
        return out.duty_kW > 0 && Math.abs(sum + out.duty_kW) < 1e-6;
      })(), '22.5 % of shutdown-cooling duty used to land on water with no flow path to ' +
            'RHR — 15 % of it INSIDE the pressurizer');
  ckT('the exchanger UA is HARDWARE — identical whatever plant it boots against (#510 H-3)',
      (function () {
        var a = R.createRHR({ valve_open: true });
        R.stepRHR(a, plantAt(340, P_cd), 1, {});
        var b = R.createRHR({ valve_open: true });
        R.stepRHR(b, plantAt(60, 0.3), 1, {});
        return Math.abs(a.UA - b.UA) < 1e-12 && a.UA > 1;
      })(), 'was 208.76 kW/K on an at-power boot vs 96.00 on the shutdown boot — the ' +
            '100 degF/hr limit sat inside the boot-state spread');
  ckT('a dead bus stops the pumps — aligned, HX open, ZERO duty (#510 H-5)',
      (function () {
        var dead = R.stepRHR(R.createRHR({ valve_open: true }), plantAt(340, P_cd), 1,
                             { ac_available: false });
        var live = R.stepRHR(R.createRHR({ valve_open: true }), plantAt(340, P_cd), 1,
                             { ac_available: true });
        return dead.duty_kW === 0 && live.duty_kW > 0;
      })(), 'was 26.6 MMBtu/hr removed through a blackout before the gate');
  ckT('a caller cooling-water temperature actually changes the duty', (function () {
        var warm = R.stepRHR(R.createRHR({ valve_open: true, ccw_temp_c: 90 }), plantAt(340, P_cd), 1, {});
        var cold = R.stepRHR(R.createRHR({ valve_open: true, ccw_temp_c: 10 }), plantAt(340, P_cd), 1, {});
        return cold.duty_kW > warm.duty_kW * 1.2;
      })(), 'a colder ultimate heat sink removes more -- the argument is not cosmetic');
  /* ---- THE COOLDOWN MARGIN. drivers.decayHeat_kW was documented and INERT for the whole build:
   * the comment said it was waiting on kinetics. Kinetics exists now, and the right answer turned
   * out to be that it must NOT enter the duty -- a heat exchanger removes what its area and
   * temperatures allow, and the actual decay heat already reaches the plant through the reactor's
   * heats map, so adding it here would double-count. It is reported instead, answering the
   * question an operator actually asks during a cooldown: is RHR keeping up? */
  ckT('the margin is NULL when no decay heat is supplied, not a fabricated zero', (function () {
        var o = R.stepRHR(R.createRHR({ valve_open: true }), plantAt(340, P_cd), 1, {});
        return o.margin_kW === null && o.keeping_up === null && o.decay_heat_kW === null;
      })(), 'a margin against an ASSUMED decay heat would be a made-up operator-facing number');
  ckT('a supplied decay heat is reported back unchanged', (function () {
        var o = R.stepRHR(R.createRHR({ valve_open: true }), plantAt(340, P_cd), 1,
                          { decayHeat_kW: 4200 });
        return o.decay_heat_kW === 4200;
      })(), '');
  ckT('the margin is duty MINUS decay heat, and says whether RHR is keeping up', (function () {
        var win = R.stepRHR(R.createRHR({ valve_open: true }), plantAt(340, P_cd), 1,
                            { decayHeat_kW: 100 });
        var lose = R.stepRHR(R.createRHR({ valve_open: true }), plantAt(340, P_cd), 1,
                             { decayHeat_kW: 1e9 });
        return Math.abs(win.margin_kW - (win.duty_kW - 100)) < 1e-9 && win.keeping_up === true &&
               lose.keeping_up === false && lose.margin_kW < 0;
      })(), 'positive margin = cooling, negative = losing ground');
  ckT('the decay heat does NOT enter the duty (it would double-count the reactor heats map)',
      (function () {
        var a = R.stepRHR(R.createRHR({ valve_open: true }), plantAt(340, P_cd), 1, {});
        var b = R.stepRHR(R.createRHR({ valve_open: true }), plantAt(340, P_cd), 1,
                          { decayHeat_kW: 50000 });
        return Math.abs(a.duty_kW - b.duty_kW) < 1e-9;
      })(), '50 MW of decay heat must not move the duty by a single kW');
  ckT('negative availability is floored rather than trusted',
      R.stepRHR(R.createRHR({ valve_open: true, avail: -2 }), plantAt(340, P_cd), 1, {}).duty_kW === 0,
      'a negative availability would otherwise HEAT the plant');
}

console.log('\nPWR2 Layer 5 -- RHR: the design basis, exercised');
var R = loadFrom(SRC), rec = [];
runSuite(R, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['the open permissive moved off its sourced setpoint',
   'permissive_open_psig:  425,', 'permissive_open_psig:  300,'],
  ['the auto-close interlock moved off its sourced setpoint',
   'permissive_close_psig: 585,', 'permissive_close_psig: 425,'],
  ['the sourced cooldown window changed', 'design_cooldown_hours: 16,', 'design_cooldown_hours: 24,'],
  ['the cooldown target changed', 'target_temp_f: 140,', 'target_temp_f: 100,'],
  /* anchors re-pointed #510 H-3: UA is the design constant, derived once at construction */
  ['UA no longer derived from the design basis (a placeholder)',
   'return derivedUA(RHR.design_decay_fraction_20h * 300000 + RHR.design_rcp_heat_kW);',
   'return 50;'],
  ['PUMP HEAT dropped from the derivation (the source names it, and it exceeds decay heat)',
   'return derivedUA(RHR.design_decay_fraction_20h * 300000 + RHR.design_rcp_heat_kW);',
   'return derivedUA(RHR.design_decay_fraction_20h * 300000);'],
  ['suction taken from the cold leg instead of the hot leg',
   "if (sys.nodes[k].id === 'hot_leg') Thot = W.T_from_h(sys.nodes[k].h, sys.P);",
   "if (sys.nodes[k].id === 'cold_leg') Thot = W.T_from_h(sys.nodes[k].h, sys.P);"],
  ['the sink becomes a source below the cooling-water temperature',
   'if (duty < 0) duty = 0;   /* a heat SINK: it never warms the plant */', ''],
  ['availability no longer floored (negative avail heats the plant)',
   'Math.max(0, rh.avail) * rh.hx_fraction * rh.UA * (Thot - rh.ccw_temp_c)',
   'rh.avail * rh.hx_fraction * rh.UA * (Thot - rh.ccw_temp_c)'],
  ['the interlock gains no hysteresis (one setpoint, chattering)',
   'var mustShut = P_psig >= RHR.permissive_close_psig;',
   'var mustShut = P_psig >= RHR.permissive_open_psig;'],
  ['the engine ENFORCES the interlock instead of reporting it (protection in the wrong layer)',
   'if (rh.running) {', 'if (rh.running && mayOpen) {'],
  ['the removed-energy total stops accumulating', 'rh.removed_kJ += duty * dt;', ''],
  ['the vital-bus gate is severed (#510 H-5 re-armed: unpowered pumps keep cooling)',
   'rh.running = rh.valve_open && powered;', 'rh.running = rh.valve_open;'],
  ['the cooldown margin fabricates a zero instead of reporting NULL',
   'margin_kW: drivers.decayHeat_kW === undefined ? null : duty - drivers.decayHeat_kW,',
   'margin_kW: duty - (drivers.decayHeat_kW || 0),'],
  ['the margin loses its sign convention (reads keeping-up when losing ground)',
   'keeping_up: drivers.decayHeat_kW === undefined ? null : duty >= drivers.decayHeat_kW,',
   'keeping_up: drivers.decayHeat_kW === undefined ? null : duty <= drivers.decayHeat_kW,'],
  ['decay heat leaks into the DUTY, double-counting the reactor heats map',
   'rh.removed_kJ += duty * dt;',
   'duty += (drivers.decayHeat_kW || 0); rh.removed_kJ += duty * dt;'],
  ['duty stops following the suction temperature',
   'rh.UA * (Thot - rh.ccw_temp_c)', 'rh.UA * (200 - rh.ccw_temp_c)'],
  /* CONSTRUCTION */
  /* #507 wave 2: `running` is DERIVED from the valve every step, so the construction pair
   * moved to the field that now owns the lineup */
  ['caller valve_open ignored at construction',
   'valve_open: opts.valve_open === undefined ? false : !!opts.valve_open,', 'valve_open: false,'],
  ['caller hx_fraction ignored at construction',
   'hx_fraction: opts.hx_fraction === undefined ? 1 : Math.max(0, Math.min(1, opts.hx_fraction)),',
   'hx_fraction: 1,'],
  ['the HX split stops scaling duty (the cooldown-rate lever goes dead)',
   'duty = Math.max(0, rh.avail) * rh.hx_fraction * rh.UA * (Thot - rh.ccw_temp_c);',
   'duty = Math.max(0, rh.avail) * rh.UA * (Thot - rh.ccw_temp_c);'],
  ['caller avail ignored at construction',
   'avail: opts.avail === undefined ? 1 : opts.avail,', 'avail: 1,'],
  ['caller cooling-water temperature ignored at construction',
   'ccw_temp_c: opts.ccw_temp_c === undefined ? RHR.ccw_temp_c : opts.ccw_temp_c,',
   'ccw_temp_c: RHR.ccw_temp_c,'],
  ['caller UA ignored at construction (always re-derived)',
   'UA: opts.UA === undefined ? designUA() : opts.UA,   // the design constant (#510 H-3)',
   'UA: designUA(),'],
  ['the default lineup becomes ALIGNED instead of secured',
   'valve_open: opts.valve_open === undefined ? false : !!opts.valve_open,',
   'valve_open: opts.valve_open === undefined ? true : !!opts.valve_open,']
];

/* ---- THE CLEAN-RUN GUARD --------------------------------------------------------------
 * A MUTATION SELF-TEST IS ONLY MEANINGFUL IF THE UNMUTATED SUITE IS GREEN. If any check fails in
 * the clean run it fails in every mutant too, so `f2 > 0` holds unconditionally and EVERY mutation
 * is reported as caught. Coverage then reads 25/25 while the suite is measuring nothing.
 *
 * MEASURED in run_pwr2_kinetics.js, 2026-08-16: a fixture producing NaN made one check fail in the
 * clean run. The self-test reported 23/25. Fixing that ONE check dropped it to 21/25 -- the two
 * extra "caught" mutations had never been caught by anything, and both were genuinely blind.
 *
 * So the tally is REFUSED, not annotated, when the clean run is red. */
if (fail > 0) {
  /* PRINT THE SCORE FIRST. run_all parses this line to report drift; exiting without it
   * makes a legitimately-failing gate read as `score ?`, which is LESS informative than
   * before the guard existed. The guard refuses the MUTATION TALLY, not the tally line. */
  console.log('  ' + require('path').basename(__filename, '.js') + ': ' + pass +
              ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
  console.log('  MUTATION SELF-TEST SKIPPED -- ' + fail + ' check(s) failed in the CLEAN run.');
  console.log('  A failing check fails in every mutant too, so every mutation would report as');
  console.log('  caught and the coverage number would be a lie. Fix the check first.');
  process.exit(1);
}

console.log('\n' + '='.repeat(70));
console.log('  INJECTION SELF-TEST -- every mutation MUST redden at least one check');
console.log('='.repeat(70));
var blind = 0;
MUTATIONS.forEach(function (m) {
  if (SRC.indexOf(m[1]) === -1) { console.log('  ERROR   anchor not found: ' + m[0]); blind++; return; }
  var r2 = [];
  try { runSuite(loadFrom(SRC.split(m[1]).join(m[2])), r2, true); }
  catch (e) { r2.push({ name: 'threw', ok: false }); }
  var f2 = r2.filter(function (r) { return !r.ok; }).length;
  if (f2 === 0) { blind++; console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); }
  else console.log('  caught    ' + m[0].padEnd(58) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_rhr: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
