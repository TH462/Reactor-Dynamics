/* run_pwr2_coredamage_stack.js — DOES THE PLANT A PLAYER IS HANDED REACH CORE DAMAGE? (#802)
 *
 * The full-stack counterpart to `run_pwr2_coredamage.js`, and the pair is the same split
 * `run_meltdown` / `run_meltdown_stack` draws on the retired engine. That gate is Layer 5,
 * library-direct: it wires a break, a reactor and a damage model by hand, with NO SECONDARY AT
 * ALL, and asks whether the oxidation feedback accelerates. It is right to be engine-direct.
 * What it cannot see is the half of this casualty that decides it on the shipped plant: THE HEAT
 * SINK — a steam generator, the auxiliary feedwater that keeps it wet, the atmospheric dump valve
 * that lets it boil down, and the electrical model that decides which pumps survive.
 *
 * NOBODY KNEW THIS PLANT GOT THERE (#802). Every measurement for months stopped at 1,200-1,800 s
 * and the secondary does not begin to dry until ~2,870 s, so the whole endgame sat past every
 * horizon anyone had ridden — and NOTHING asserted any part of it. This runner is that assertion.
 *
 * ---------------------------------------------------------------------------------------
 * ⚠ IT ASSERTS THE CHAIN, NEVER THE CLOCK (#543).
 *
 * `fuel_damaged` latching at ~5,450 s is a TRAJECTORY, not a constant — this casualty has taken
 * different endgame branches on different trees, and a check that says "damage happens at T" pins
 * whichever branch was live the day it was written. So every check below is an INVARIANT: a link
 * of the causal chain, bounded only by a generous horizon —
 *
 *     the secondary dries  ->  the heat sink fails  ->  the cladding reaches the 1800 degF
 *     oxidation on-ramp  ->  the zirconium-steam reaction ignites  ->  damage latches
 *
 * — and, as its own claim, THAT THE ORDER HOLDS. Measured times are printed in every note so a
 * later reader can watch the branch move; not one of them is a bound.
 *
 * ⚠ AND IT ASSERTS THE CONTRAST, because a one-sided claim here is weak. The SAME two hours with
 * the auxiliary feedwater failure REMOVED never dries out and never damages: the secondary parks
 * near 0.73 of nominal mass and the duty tracks decay at ratio ~1.01. The turbine-driven
 * auxiliary feed pump — the one pump a station blackout deliberately leaves running (WTSM 5.7.5,
 * and it carries a do-not-gate note for exactly this reason) — replaces the boil-off, and that
 * pump is the entire difference between a plant that rides out a large break with no alternating
 * current and a plant that melts. LEG B IS WHAT MAKES LEG A MEAN ANYTHING.
 *
 * ---------------------------------------------------------------------------------------
 * ⚠ WHAT IS NOT CLAIMED.
 *
 * TIMING IS NOT A CLAIM, for `run_pwr2_coredamage.js`'s reason retyped: when the cladding reaches
 * a given temperature depends on `pwr2_fuel.js`'s low-flow film coefficient, which is UNSOURCED.
 * Times here are RECORDED, never asserted.
 *
 * PROTOTYPICALITY IS NOT CLAIMED. Nothing here says a real unit does this on this casualty; no
 * evidence pass was run. The sourced constants it leans on are the ones `pwr2_damage.js` already
 * carries — the 1800 degF significance threshold and the 10 CFR 50.46 2200 degF peak-cladding
 * limit — and both are READ FROM THAT MODULE rather than retyped, so they cannot drift apart.
 *
 * THE SPIKY ENDGAME IS GRADED AT ENGINE-STEP RESOLUTION, DECLARED. A tick-sampled peak
 * understates the engine-step peak (#802 measured 3,357.8 degF sampled against 3,362.3 degF
 * seen — a 4.5 degF miss that initially hid why the oxidation went quiet), so the cladding, the
 * steam-generator duty, the decay load and the oxidation heat are read through PASS-THROUGH
 * OBSERVERS on `stepSG`, `stepReactor` and `stepDamage`. Each records and returns the real result
 * untouched, altering no argument and no return value; measured, a plant with the three
 * observers armed is identical to one without (peak cladding 1541.0 degF either way). They exist
 * because the tick snapshot is the wrong instrument for a quantity that moves this fast.
 *
 * ---------------------------------------------------------------------------------------
 * ⚠ NO MUTATION SELF-TEST IN THIS FILE, for `run_pwr2_endurance.js`'s reason: every mutation
 * would re-ride hours of plant. The sensing was proven OFFLINE instead, one injection per link,
 * each recorded in #802 with its output:
 *
 *   - unblock the auxiliary feedwater (drop `afw_failure`) -> ALL SIX RED. Nothing dries,
 *     nothing heats, nothing latches.
 *   - neuter the zirconium-steam reaction (`Q_ox_kW` and `zirc_heat_pct` forced to 0 in the
 *     damage model's return; the 2200 degF latch left free to fire on its own) -> LINK 4 RED
 *     and LINK 6 RED (no ignition to order); links 1, 2, 3 GREEN.
 *     ⚠ LINK 5 STAYS GREEN, and that is a RESULT, not a miss: without the oxidation feedback
 *     the cladding still reaches 2200 degF on decay heat alone, 1,075 s later (6,167.8 s
 *     against 5,092.6 s) and peaking at 2,624.6 degF against 3,362.3 degF. On this plant the
 *     reaction ACCELERATES the latch by ~18 minutes; it is not what causes it. The injection
 *     that reds link 5 is the auxiliary-feedwater one above.
 *   - cut the WHOLE secondary steam path (`stepRelief`'s safety, dump and atmospheric-dump
 *     flows all zeroed, so the generator has nowhere to boil to) -> LINK 1 RED.
 *     ⚠ CUTTING THE ATMOSPHERIC DUMP VALVE ALONE (`RELIEF.adv_kgs = 0`) LEAVES EVERY LINK
 *     GREEN — dryout slips only 274 s, to 2,893.4 s. #802 read the dump valve as the path the
 *     boil-down runs through, which is true of the unmitigated plant (the safeties never lift),
 *     but it is NOT load-bearing: take it away and secondary pressure rises to the main steam
 *     safety valves and they carry the boil-off instead. Measured, not argued.
 *
 * ⚠ #803 IS IN THIS RIDE'S PATH AND DOES NOT MOVE ANY CHECK. Once the generator reaches its 1 kg
 * mass floor (~6,000 s on leg A) `pwr2_sg.js`'s `h_hi` backstop clip binds every step and pegs
 * `P_sec` at exactly 17.0000 MPa, which lifts the saturation temperature the duty is computed
 * against. Leg A's duty/decay ratio there is ~0.002 — three orders of magnitude below the bar —
 * and every link has already resolved by then, so the defect changes no verdict. It is filed
 * separately and is NOT worked around here.
 *
 * Level: FULL STACK (M4+M5+M6) on the shipped free-play lineup, via `SimulationService`, 1x,
 * `svc.tick()` driven directly — the plant a player is actually handed. NEVER `svc.start()`.
 *
 * Run: node test/run_pwr2_coredamage_stack.js       (~5.5 min: two 2-hour rides)
 */
'use strict';
var path = require('path');
function load(p) { require(path.join(__dirname, '..', p)); }
/* The retired engine's control/instrument modules load first: PWR2 REUSES `pwr_control.js`'s
 * instrument contract, and `simulation_service.js` needs a plant registry to select from. Same
 * load order as `test/measure_stack.js --plant=pwr2`, copied rather than invented — load order
 * is load-bearing here (pwr2_water/pwr2_vtable first, pwr2_shell.js last). */
['engines/load_mode.js', 'engines/pwr/pwr_config.js', 'layers/control/pwr_control.js',
 'engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_pressurizer2.js',
 'engines/pwr/pwr_primary.js', 'engines/pwr/pwr_steam_generator.js', 'engines/pwr/pwr_instruments.js',
 'engines/pwr/pwr_engine.js',
 'engines/pwr2/pwr2_water.js', 'engines/pwr2/pwr2_vtable.js', 'engines/pwr2/pwr2_geometry.js',
 'engines/pwr2/pwr2_core.js', 'engines/pwr2/pwr2_loop.js', 'engines/pwr2/pwr2_kinetics.js',
 'engines/pwr2/pwr2_fuel.js', 'engines/pwr2/pwr2_reactor.js', 'engines/pwr2/pwr2_sources.js',
 'engines/pwr2/pwr2_sg.js', 'engines/pwr2/pwr2_turbine.js', 'engines/pwr2/pwr2_relief.js',
 'engines/pwr2/pwr2_condenser.js', 'engines/pwr2/pwr2_cvcs.js', 'engines/pwr2/pwr2_eccs.js',
 'engines/pwr2/pwr2_afw.js', 'engines/pwr2/pwr2_damage.js', 'engines/pwr2/pwr2_protection.js',
 'engines/pwr2/pwr2_pressurizer.js', 'engines/pwr2/pwr2_dumpctl.js', 'engines/pwr2/pwr2_break.js',
 'engines/pwr2/pwr2_containment.js', 'engines/pwr2/pwr2_rhr.js', 'engines/pwr2/pwr2_true_state.js',
 'engines/pwr2/pwr2_instruments.js', 'engines/pwr2/pwr2_feedwater.js', 'engines/pwr2/pwr2_engine.js',
 'engines/pwr2/pwr2_shell.js',
 'layers/control/control_kernel.js', 'layers/instructor_layer.js', 'layers/simulation_service.js'
].forEach(load);

var RD = globalThis.RD, SG = RD.pwr2.sg, DG = RD.pwr2.damage, RX = RD.pwr2.reactor;

/* ================= THE BARS, and where each one came from ================================ */

/* THE HORIZON. The chain completes near 5,450 s; 7,200 s is 32 % headroom on top of that, which
 * is what "this chain completes" has to mean to be a claim about the plant rather than a clock. */
var HORIZON = 7200;
var INJECT_AT = 10;          /* 10 s of settled plant first, as run_meltdown_stack does */
var SEED = 0x1234;

/* THE ON-RAMP. `pwr2_damage.js`'s header quotes Ginna UFSAR ch15 (ML20339A101) §15.3.2.4.2
 * verbatim: "The zirconium-steam reaction can be significant above a clad temperature of 1800F."
 * That module carries 1200 degF (onset) and 2200 degF (10 CFR 50.46 criterion 1) as named
 * constants but 1800 lives only inside the quoted sentence, so it is spelled here with its
 * source — and BRACKETED BY THE TWO THAT ARE CONSTANTS below, so a retype cannot go unnoticed. */
var ONRAMP_F = 1800, ONRAMP_C = (ONRAMP_F - 32) * 5 / 9;
if (!(DG.TMI.onset_f < ONRAMP_F && ONRAMP_F < DG.LIM.pct_limit_f)) {
  console.error('run_pwr2_coredamage_stack: the retyped ' + ONRAMP_F + ' degF on-ramp no longer ' +
    'sits between pwr2_damage.js\'s own onset (' + DG.TMI.onset_f + ') and 10 CFR 50.46 limit (' +
    DG.LIM.pct_limit_f + ') — one of the three moved.');
  process.exit(1);
}

/* IGNITION — 0.5 % of rated thermal power, and the number was SWEPT, not rounded to taste.
 *
 * ⚠ `zirc_heat_pct` IS NOT ZERO ON A PLANT THAT NEVER DAMAGES, and that is the trap a round
 * number walks into here. Measured 2026-09-22: the early blowdown alone takes it to 0.1 % at
 * 532.0 s, and leg B — the ride that never dries and never damages — PEAKS AT 0.1106 %. So a
 * bar anywhere near 0.1 % would be satisfied by a healthy core and by the contrast leg, and
 * would say nothing.
 *
 * THE BAR HAS TO CLEAR THREE THINGS AT ONCE, and each was measured on the ride below (crossing
 * times, seed 0x1234): it must sit ABOVE everything a non-damaging ride reaches (leg B's
 * 0.1106 % peak), AFTER the on-ramp at 4,749.8 s, and BEFORE the latch at 5,092.6 s. The sweep:
 *
 *     0.1 %  ->   532.0 s   the blowdown transient — not the endgame at all
 *     0.2 %  -> 4,678.1 s   BEFORE the on-ramp; inverts the chain
 *     0.3 %  -> 4,779.8 s   30.0 s after the on-ramp — inside the noise of a branch move
 *     0.5 %  -> 4,902.1 s   152.3 s clear of the on-ramp, 190.5 s clear of the latch  <=
 *     0.75 % -> 4,986.5 s   106.1 s from the latch
 *     1.0 %  -> 5,037.1 s   55.5 s from the latch
 *     Q_ox >= decay heat -> 5,082.4 s   10.2 s before the latch — a tempting physical
 *                           criterion, and much too tight to be one
 *
 * 0.5 % MAXIMISES THE MINIMUM CLEARANCE to its neighbours (152.3 s) while sitting 4.5x above
 * leg B's peak, and it is 1,500 kW against a ~4,060 kW decay load — the cladding's own metal
 * producing a third of what the core is producing. The reaction goes on to peak at 50.1 % of
 * rated at 5,231.3 s, so the bar is nowhere near the top of the range either. */
var IGNITE_PCT = 0.5;

var RATED_KW = RX.RATED_THERMAL_KW;
var DRYOUT_MF = SG.SG.dryout_mass_frac;       /* read, never retyped */

/* ================= harness ============================================================== */
var rec = [];
function ck(name, cond, note) {
  var ok = !!cond;
  rec.push({ name: name, ok: ok });
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (note ? '\n         ' + note : ''));
}
function head(s) { console.log('\n' + s); }
function F(c) { return (c * 9 / 5 + 32).toFixed(1); }
function s1(x) { return x === null || x === undefined ? 'never' : x.toFixed(1) + ' s'; }

/* ride(failures) — the casualty, full stack, with the three pass-through observers armed.
 *
 * ⚠ EVERY TIME IS `svc.simTime`, NEVER A TICK COUNT x A CONSTANT. The service flips its
 * broadcast interval to the transient cadence during a casualty, so a ticks-times-0.1 clock
 * drifts against the plant — #802's own harness used one and its filed milestones read ~7 %
 * early against the engine's own clock. */
function ride(failures) {
  var obs = { duty: 0, wet: 1, decay: 0, cladNow: 0, cladPeak: -Infinity, zirc: 0, damaged: false };
  var realSG = SG.stepSG, realRX = RX.stepReactor, realDG = DG.stepDamage;
  SG.stepSG = function () {
    var r = realSG.apply(this, arguments); obs.duty = r.duty_kW; obs.wet = r.wet_frac; return r;
  };
  RX.stepReactor = function () {
    var r = realRX.apply(this, arguments); obs.decay = r.decay_pct / 100 * RATED_KW; return r;
  };
  DG.stepDamage = function (dm, dt, drivers) {
    var r = realDG.apply(this, arguments);
    obs.cladNow = drivers.cladTemp_c;
    if (drivers.cladTemp_c > obs.cladPeak) obs.cladPeak = drivers.cladTemp_c;
    obs.zirc = r.zirc_heat_pct; obs.damaged = r.fuel_damaged;
    return r;
  };

  var svc = new RD.SimulationService({ seed: SEED });
  svc.selectPlant('pwr2', 'hot_full_power', null);
  svc.running = true;
  svc.timeAcceleration = 1;
  /* Attention stops OFF: at 1x they change no physics (measured — peak cladding 1541.0 degF
   * either way), but a dropout rewrites `timeAcceleration` mid-ride and a later reader could
   * not then tell the clock from the plant. `run_checklist_pwr2` does the same, for the same
   * reason. The transient CADENCE flip is separate and is deliberately left alone. */
  svc.attentionStops = false;

  var M = {}, lastRatioAbove1 = null, minRatioLate = Infinity, minWet = 1;
  var maxZirc = 0, maxZircAt = null, cladLatePeak = -Infinity;
  var ratioEnd = null, wetEnd = 1, mfEnd = 1, cladEnd = 0, held = false;
  function mark(k, t) { if (M[k] === undefined) M[k] = t; }

  /* settle, then inject. The loop guard carries an epsilon because `simTime` accumulates in
   * 0.02 s steps and lands on 9.999999999999998 as readily as on 10. */
  while (svc.simTime < INJECT_AT - 1e-9) svc.tick();
  failures.forEach(function (f) {
    svc.handleCommand({ action: 'inject_failure', failure_id: f, severity: 1 });
  });
  var t_inj = svc.simTime;

  while (svc.simTime < HORIZON) {
    svc.tick();
    var t = svc.simTime;
    var ratio = obs.decay > 0 ? obs.duty / obs.decay : Infinity;
    if (obs.wet < 1) mark('dry', t);
    if (ratio >= 1.0) lastRatioAbove1 = t;
    if (obs.cladPeak >= ONRAMP_C) mark('onramp', t);
    if (obs.zirc >= IGNITE_PCT) mark('ignite', t);
    if (obs.damaged) mark('latch', t);
    if (obs.wet < minWet) minWet = obs.wet;
    if (obs.zirc > maxZirc) { maxZirc = obs.zirc; maxZircAt = t; }
    /* the post-transient window: the reactor trip's own dip is not a heat-sink failure, and
     * leg B's "the sink holds" claim must not be able to pass on it or fail on it. */
    if (t >= 1200 && ratio < minRatioLate) minRatioLate = ratio;
    if (t > HORIZON / 2 && obs.cladNow > cladLatePeak) cladLatePeak = obs.cladNow;
    ratioEnd = ratio; wetEnd = obs.wet; cladEnd = obs.cladNow;
    mfEnd = svc.engine.eng.sg.mass / SG.SG.mass_nominal;
    held = svc.engine.eng.sys.beyond_model === true;
  }
  SG.stepSG = realSG; RX.stepReactor = realRX; DG.stepDamage = realDG;
  return { M: M, t_inj: t_inj, lastRatioAbove1: lastRatioAbove1, minRatioLate: minRatioLate,
           minWet: minWet, maxZirc: maxZirc, maxZircAt: maxZircAt, cladPeak: obs.cladPeak,
           cladLatePeak: cladLatePeak, ratioEnd: ratioEnd, wetEnd: wetEnd, mfEnd: mfEnd,
           cladEnd: cladEnd, damaged: obs.damaged, held: held };
}

/* ================= LEG A — the three-failure ride ======================================== */
head('LEG A  large_loca + station_blackout + afw_failure, severity 1, ' + HORIZON + ' s ' +
     '[the chain, link by link]');
var A = ride(['large_loca', 'station_blackout', 'afw_failure']);
console.log('  injected at ' + A.t_inj.toFixed(2) + ' s   ' +
            'dry ' + s1(A.M.dry) + ' | sink ' + s1(A.lastRatioAbove1) + ' | on-ramp ' +
            s1(A.M.onramp) + ' | ignition ' + s1(A.M.ignite) + ' | latch ' + s1(A.M.latch));

ck('LINK 1 — THE SECONDARY DRIES. The wetted fraction of the tube bundle falls below 1, which ' +
   'is `pwr2_sg.js` reporting that the generator has boiled below its ' +
   DRYOUT_MF.toFixed(5) + ' dryout mass fraction and the bundle is uncovering',
   A.M.dry !== undefined && A.M.dry < HORIZON,
   'wet < 1 first at ' + s1(A.M.dry) + ', reaching ' + A.minWet.toFixed(4) +
   ' (mass fraction ' + A.mfEnd.toFixed(4) + ' at the horizon)');

ck('LINK 2 — THE HEAT SINK FAILS, AND DOES NOT COME BACK. Steam-generator duty divided by the ' +
   'decay load crosses below 1.0 AFTER dryout has begun, and is still below it at the horizon ' +
   '— the generator stops carrying the core\'s heat',
   A.lastRatioAbove1 !== null && A.M.dry !== undefined &&
   A.lastRatioAbove1 > A.M.dry && A.lastRatioAbove1 < HORIZON && A.ratioEnd < 1.0,
   'last at or above 1.0 at ' + s1(A.lastRatioAbove1) + ' (dryout began ' +
   (A.M.dry !== undefined ? (A.lastRatioAbove1 - A.M.dry).toFixed(1) + ' s earlier' : 'never') +
   '); ratio ' + (A.ratioEnd === null ? '-' : A.ratioEnd.toFixed(4)) + ' at the horizon');

ck('LINK 3 — THE CLADDING REACHES THE OXIDATION ON-RAMP. It crosses ' + ONRAMP_F + ' degF (' +
   ONRAMP_C.toFixed(1) + ' degC), the temperature Ginna UFSAR ch15 names as where the ' +
   'zirconium-steam reaction "can be significant"',
   A.M.onramp !== undefined && A.M.onramp < HORIZON && A.cladPeak >= ONRAMP_C,
   'crossed at ' + s1(A.M.onramp) + '; engine-step peak ' + F(A.cladPeak) + ' degF (' +
   A.cladPeak.toFixed(1) + ' degC)');

ck('LINK 4 — THE REACTION IGNITES. Oxidation heat reaches ' + IGNITE_PCT + ' % of rated thermal ' +
   'power (' + (IGNITE_PCT / 100 * RATED_KW).toFixed(0) + ' kW) — ~1,000x the level it idles at ' +
   'on an intact core, so this is the metal burning, not the background',
   A.M.ignite !== undefined && A.M.ignite < HORIZON && A.maxZirc >= IGNITE_PCT,
   'crossed at ' + s1(A.M.ignite) + '; peaks at ' + A.maxZirc.toFixed(3) + ' % of rated at ' +
   s1(A.maxZircAt));

ck('LINK 5 — DAMAGE LATCHES. `fuel_damaged` goes true, which in `pwr2_damage.js` is 10 CFR ' +
   '50.46 criterion 1: the peak cladding temperature reaches ' + DG.LIM.pct_limit_f + ' degF',
   A.M.latch !== undefined && A.M.latch < HORIZON && A.damaged === true,
   'latched at ' + s1(A.M.latch) + ', ' + ((HORIZON - (A.M.latch || 0)) / 60).toFixed(1) +
   ' min inside the ' + (HORIZON / 60).toFixed(0) + '-minute horizon');

ck('LINK 6 — THE ORDER HOLDS, and the plant is still being STEPPED when it does. Dryout precedes ' +
   'the heat-sink failure, which precedes the on-ramp, which precedes ignition, which precedes ' +
   'the latch — the chain is causal, not five things that happened to occur',
   A.M.dry !== undefined && A.lastRatioAbove1 !== null && A.M.onramp !== undefined &&
   A.M.ignite !== undefined && A.M.latch !== undefined &&
   A.M.dry < A.lastRatioAbove1 && A.lastRatioAbove1 < A.M.onramp &&
   A.M.onramp < A.M.ignite && A.M.ignite < A.M.latch && A.M.latch < HORIZON && !A.held,
   s1(A.M.dry) + ' -> ' + s1(A.lastRatioAbove1) + ' -> ' + s1(A.M.onramp) + ' -> ' +
   s1(A.M.ignite) + ' -> ' + s1(A.M.latch) + '; beyond_model ' + (A.held ? 'LATCHED' : 'never'));

/* ================= LEG B — the contrast ================================================= */
head('LEG B  large_loca + station_blackout ONLY, same seed, same horizon ' +
     '[the auxiliary feedwater failure is the whole difference]');
var B = ride(['large_loca', 'station_blackout']);

ck('CONTRAST 1 — IT NEVER DRIES. The wetted fraction never leaves 1 and the generator holds a ' +
   'mass fraction far above the ' + DRYOUT_MF.toFixed(5) + ' dryout threshold: the turbine-driven ' +
   'auxiliary feed pump a blackout leaves running replaces the boil-off',
   B.minWet >= 1 && B.M.dry === undefined && B.mfEnd > DRYOUT_MF * 1.5,
   'minimum wetted fraction ' + B.minWet.toFixed(4) + '; mass fraction ' + B.mfEnd.toFixed(4) +
   ' at the horizon against a ' + DRYOUT_MF.toFixed(5) + ' threshold');

ck('CONTRAST 2 — THE HEAT SINK HOLDS. Past the reactor trip\'s own transient the duty never ' +
   'falls below the decay load, for the whole ride: an equilibrium, not a slow loss',
   B.minRatioLate >= 1.0 && B.ratioEnd >= 1.0,
   'lowest duty/decay after 1,200 s is ' + B.minRatioLate.toFixed(4) + '; ' +
   B.ratioEnd.toFixed(4) + ' at the horizon');

ck('CONTRAST 3 — THE CLADDING NEVER REACHES THE ON-RAMP, and is COOLING. Its engine-step peak ' +
   'stays under ' + ONRAMP_F + ' degF and the second half of the ride is cooler than the peak ' +
   '— the positive half of the claim, so this is not a bare absence',
   B.cladPeak < ONRAMP_C && B.cladLatePeak < B.cladPeak,
   'peak ' + F(B.cladPeak) + ' degF; hottest after ' + (HORIZON / 2 / 60).toFixed(0) + ' min is ' +
   F(B.cladLatePeak) + ' degF, ending at ' + F(B.cladEnd) + ' degF');

ck('CONTRAST 4 — NOTHING DAMAGES. `fuel_damaged` never latches, and the oxidation stays at its ' +
   'intact-core background rather than merely failing to be measured',
   B.damaged === false && B.M.latch === undefined && B.maxZirc < IGNITE_PCT,
   'fuel_damaged ' + B.damaged + '; oxidation peaks at ' + B.maxZirc.toExponential(3) +
   ' % of rated, ' + (IGNITE_PCT / B.maxZirc).toFixed(0) + 'x under the ignition bar');

ck('CONTRAST 5 — ONE FAILURE IS THE WHOLE DIFFERENCE. Same initial condition, same seed, same ' +
   'horizon, same two casualties; adding `afw_failure` is what turns a plant that holds its ' +
   'heat sink for two hours into one that reaches core damage',
   A.M.dry !== undefined && A.damaged === true &&
   B.M.dry === undefined && B.damaged === false,
   'leg A dried at ' + s1(A.M.dry) + ' and latched at ' + s1(A.M.latch) +
   '; leg B did neither in ' + (HORIZON / 60).toFixed(0) + ' minutes');

/* ================= verdict ============================================================== */
console.log('\n' + '='.repeat(70));
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;
console.log('  run_pwr2_coredamage_stack: ' + pass + ' passed, ' + fail + ' failed  (' +
            rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit(fail > 0 ? 1 : 0);
