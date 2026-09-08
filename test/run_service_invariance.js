/* run_service_invariance.js — IS THE PLANT THE SAME PLANT AT EVERY TIME ACCELERATION? (#588)
 *
 * `layers/simulation_service.js` makes this claim twice, in its own comments:
 *
 *   :333  "Automation channels run in-stack at physics rate (fixed sim-time cadence inside),
 *          reading the previous step's instruments — so controllers behave identically at any
 *          time acceleration."
 *   :337  "Protection is on a SIM-time cadence, not a per-broadcast one (#153): the reactor
 *          gets the same protection at 3600x as at 1x."
 *
 * NOTHING CHECKED EITHER OF THEM. This runner does.
 *
 * ⚠ AND IT SETTLED A QUESTION IN THE OPPOSITE DIRECTION TO THE ONE IT WAS BUILT FOR. #588 was
 * filed believing acceleration perturbed the plant ~1 % and that the perturbation picked the
 * branch at the blowdown cliff. Measured here at MATCHED SIM INSTANTS — before and after the
 * cadence fix — the trajectories are identical to 0.000e+0 at every shared instant. The "~1 %"
 * was an endpoint artefact (see the note on walk()/compare() below). What WAS real is narrower
 * and is now fixed: the protection EVALUATION RATE varied with acceleration, 10.85 per sim-s at
 * 1x in a transient against 10.00 above it. The browser/Node cliff difference #588 records is
 * therefore still UNEXPLAINED, and this gate is the instrument that rules acceleration out.
 *
 * ⚠ WHY THE CLAIM MATTERS RATHER THAN BEING A TIDINESS POINT. A player who fast-forwards a
 * casualty must be operating the SAME plant as one who watches it in real time. If not, the
 * gates (which run at 10x and above) certify a plant the 1x player never gets — the shape
 * CLAUDE.md already records for the protection cadence: "1x is byte-identical by construction,
 * which is why a divergence hides at the speed you are most likely to test at."
 *
 * Gate semantics (STRICT XFAIL, same as run_meltdown / run_behavior / run_procedures):
 *   - check passes, not in XFAIL  -> PASS   (green)
 *   - check fails,  in XFAIL      -> XFAIL  (yellow, known and tracked — gate stays green)
 *   - check fails,  NOT in XFAIL  -> FAIL   (red, a real regression)
 *   - check passes, in XFAIL      -> XPASS  (red — the gap closed; delete the XFAIL entry)
 *
 * Run: node test/run_service_invariance.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var MUT = require('./mut_flags.js');   /* --no-mutations / --mut= / --grp= (#602) */
var R = path.join(__dirname, '..');
var SRC = path.join(R, 'engines', 'pwr2');
if (typeof global.window === 'undefined') global.window = global;

var SVC_PATH = path.join(R, 'layers', 'simulation_service.js');
var SVC_SRC = fs.readFileSync(SVC_PATH, 'utf8').replace(/\r\n/g, '\n');

/* ---- THE KNOWN GAPS. Each names the issue, the measurement, and what closes it. --------- */
/* ---- NO KNOWN GAPS. All three xfails this file shipped with on 2026-08-28 are gone, and
 * the reasons differ — which is the point of having had them separately:
 *   SI-2 CLOSED BY A FIX. `tick()`'s `sinceEval` now carries on the instance and the post-loop
 *        evaluation obeys the cadence, so the rate is 10.00/sim-s at every acceleration (it was
 *        10.85 at 1x in a transient).
 *   SI-6 CLOSED BY THE SAME FIX — and its first form was itself defective: it scanned the raw
 *        source for `var sinceEval = 0;` and went on failing afterwards because the FIX'S OWN
 *        COMMENT quotes the line it replaced. Comments are stripped now and it asserts the
 *        positive.
 *   SI-4 WAS NEVER A REAL FAILURE. It compared the two legs at their STOPPING POINTS, which
 *        differ by up to one broadcast — 200.02 s against 200.00 s — and on a blowdown moving
 *        ~128 psi/s that reads as 267.31 vs 269.87 psi, "0.96 %". Measured at matched instants,
 *        before AND after the fix, the trajectories are identical to 0.000e+0. The service's
 *        trajectory-invariance claim was true all along; only the evaluation RATE was not.
 * A gap that closes for a reason is worth more than one that closes. */
var XFAIL = {};

/* ---- LOAD ------------------------------------------------------------------------------ */
function loadAll(svcSrc) {
  ['engines/load_mode.js', 'engines/pwr/pwr_config.js', 'layers/control/control_kernel.js',
   'layers/control/pwr_control.js', 'engines/pwr/pwr_instruments.js'].forEach(function (f) {
    require(path.join(R, f));
  });
  ['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_sources',
   'pwr2_kinetics', 'pwr2_fuel', 'pwr2_reactor', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief',
   'pwr2_dumpctl', 'pwr2_condenser', 'pwr2_feedwater', 'pwr2_afw', 'pwr2_cvcs', 'pwr2_eccs',
   'pwr2_rhr', 'pwr2_pressurizer', 'pwr2_break', 'pwr2_containment', 'pwr2_damage',
   'pwr2_protection', 'pwr2_instruments', 'pwr2_true_state', 'pwr2_engine', 'pwr2_shell'
  ].forEach(function (f) { require(path.join(SRC, f + '.js')); });
  require(path.join(R, 'layers', 'instructor_layer.js'));
  /* the service comes from SOURCE so the injection self-test can mutate it */
  delete require.cache[require.resolve(SVC_PATH)];
  if (svcSrc === undefined) { require(SVC_PATH); }
  else { (0, eval)(svcSrc); }                                       // eslint-disable-line no-eval
  return globalThis.RD;
}

/* ---- THE DRIVE ------------------------------------------------------------------------- */
/* Drive off simTime, never a cycle count — CLAUDE.md's own rule, and the reason #194 filed a
 * plant defect that did not exist. `evals` counts what the invariance claim is ABOUT.
 *
 * ⚠⚠ AND COMPARE AT MATCHED SIM INSTANTS, NEVER AT THE ENDPOINT. `while (simTime < target)`
 * overshoots by up to one broadcast, and a broadcast is 0.02-0.1 s at 1x against 1 s at 10x.
 * Comparing the two stopping points therefore compares the plant at two DIFFERENT TIMES: on a
 * blowdown moving ~128 psi/s that reads as 267.31 psi against 269.87 — "0.96 % divergence" —
 * on trajectories that are in fact IDENTICAL. That artefact was filed as a defect on #588,
 * twice, and both times the number came from the endpoint. `walk()` below records every
 * instant and `compare()` intersects the two grids; the intersection size is asserted, so a
 * comparison that met nowhere cannot pass by having nothing to disagree about. */
/* every broadcast instant on the way to `target`, keyed by sim time */
function walk(RD, speed, target, casualty) {
  var svc = new RD.SimulationService({ seed: 0x1234 });
  svc.selectPlant('pwr2', 'hot_full_power', null, undefined);
  if (casualty) {
    casualty.forEach(function (id) {
      svc.handleCommand({ action: 'inject_failure', failure_id: id, severity: 1 });
    });
  }
  var evals = 0, _ev = svc.layer.evaluate.bind(svc.layer);
  svc.layer.evaluate = function (ins, dt) { evals++; return _ev(ins, dt); };
  svc.handleCommand({ action: 'set_speed', value: speed });
  var at = {}, guard = 0;
  while (svc.simTime < target && guard++ < 500000) {
    var s = svc.advanceCycles(1), ts = s.true_state;
    /* ⚠ THE COMPARED FIELDS DECIDE WHAT THIS GATE CAN SEE. Pressure, inventory and core
     * temperature are what a BREAK moves; `sg_level_pct` and `boron_ppm` are what the
     * AUTOMATION moves, and without them the "automation lumped into one call per broadcast"
     * mutation came back BLIND — the gate was measuring the plant the casualty drives and
     * calling it the plant. */
    at[svc.simTime.toFixed(2)] = { P: ts.pressure_mpa, inv: ts.core_inventory_pct,
                                   Tcore: ts.t_core_exit_c, sg: ts.sg_level_pct,
                                   boron: ts.boron_ppm,
                                   /* core THERMAL power, not fission power (CLAUDE.md: power_pct
                                    * != core_heat_pct once a scram happens) -- SI-0's own "still
                                    * steady" conjunct reads this, compare() does not */
                                   pw: (ts.core_heat_pct !== undefined ? ts.core_heat_pct : ts.power_pct) };
  }
  return { at: at, evals: evals, simTime: svc.simTime, rate: evals / svc.simTime };
}

/* the recorded instants, as key strings, in time order */
function order(w) {
  return Object.keys(w.at).sort(function (x, y) { return Number(x) - Number(y); });
}
/* the first and last recorded instant, with their pressures */
function ends(w) {
  var ks = order(w);
  if (!ks.length) return null;
  return { t0: Number(ks[0]), t1: Number(ks[ks.length - 1]),
           P0: w.at[ks[0]].P, P1: w.at[ks[ks.length - 1]].P };
}
/* WHEN THIS BLOWDOWN IS HALF DONE — measured off the trajectory, not typed. SI-5 uses it as
 * the depth its comparison must reach, so the bar moves WITH the physics instead of against
 * it: a faster blowdown pulls the bar earlier, exactly as it pulls the sampling earlier. */
function halfExcursionTime(w) {
  var e = ends(w); if (!e) return null;
  var half = e.P0 + (e.P1 - e.P0) * 0.5, down = e.P1 < e.P0, ks = order(w);
  for (var i = 0; i < ks.length; i++) {
    var P = w.at[ks[i]].P;
    if (down ? P <= half : P >= half) return Number(ks[i]);
  }
  return null;
}
/* the LAST instant both legs landed on (null if they never met) */
function lastShared(a, b) {
  var last = null;
  Object.keys(a.at).forEach(function (k) {
    if (b.at[k] !== undefined && (last === null || Number(k) > last)) last = Number(k);
  });
  return last;
}
/* a copy of a leg with a difference PLANTED in every field — SI-5's own sensitivity proof.
 * `compare()` must see it, or the 0.000e+0 that SI-4 and SI-7 report means nothing. */
function planted(w, rel) {
  var at = {};
  Object.keys(w.at).forEach(function (k) {
    var s = w.at[k], d = {};
    Object.keys(s).forEach(function (f) {
      d[f] = (typeof s[f] === 'number') ? s[f] * (1 + rel) : s[f];
    });
    at[k] = d;
  });
  return { at: at };
}

/* worst relative difference over the instants BOTH legs actually landed on */
function compare(a, b) {
  var n = 0, worst = 0, at = null;
  Object.keys(a.at).forEach(function (k) {
    var x = a.at[k], y = b.at[k];
    if (!y) return;
    n++;
    [['P', x.P, y.P], ['inv', x.inv, y.inv], ['Tcore', x.Tcore, y.Tcore],
     ['sg_level', x.sg, y.sg], ['boron', x.boron, y.boron]].forEach(function (f) {
      if (typeof f[1] !== 'number' || typeof f[2] !== 'number') return;
      var d = Math.abs(f[1] - f[2]) / Math.max(1e-12, Math.abs(f[2]));
      if (d > worst) { worst = d; at = k + ' s (' + f[0] + ')'; }
    });
  });
  return { n: n, worst: worst, at: at };
}

/* the gap between the last two recorded instants of a leg — its own coarse-broadcast step.
 * SI-0's "met past the prologue" conjunct collapses to landing within this of T_WIN. */
function lastDelta(w) {
  var ks = order(w);
  return ks.length < 2 ? null : Number(ks[ks.length - 1]) - Number(ks[ks.length - 2]);
}
/* SI-0's "the fixture is still doing its job" conjunct for a STEADY leg: power stays near
 * rated and pressure does not wander, over the whole recorded window. Bounds and margins are
 * in the comment at SI-0's call site. */
var QUIET_POWER_BAND_PCT = 5;       /* +/- around rated 100 % core thermal power */
var QUIET_PRESSURE_DRIFT_MPA = 0.2; /* peak-to-peak allowed over the window, 29 psi */
function steady(w) {
  var pmin = Infinity, pmax = -Infinity, Pmin = Infinity, Pmax = -Infinity;
  order(w).forEach(function (k) {
    var s = w.at[k];
    if (typeof s.pw === 'number') { if (s.pw < pmin) pmin = s.pw; if (s.pw > pmax) pmax = s.pw; }
    if (typeof s.P === 'number') { if (s.P < Pmin) Pmin = s.P; if (s.P > Pmax) Pmax = s.P; }
  });
  return { ok: pmin >= 100 - QUIET_POWER_BAND_PCT && pmax <= 100 + QUIET_POWER_BAND_PCT &&
                (Pmax - Pmin) <= QUIET_PRESSURE_DRIFT_MPA,
           pmin: pmin, pmax: pmax, drift: Pmax - Pmin };
}

var LOCA = ['large_loca', 'station_blackout'];
/* the compared window, in sim seconds. NAMED because SI-5 asserts against it — "both legs
 * actually ran the window" is only unnudgeable if the bar IS the window. */
var T_WIN = 200;

/* ---- THE SUITE ------------------------------------------------------------------------- */
function runSuite(RD, rec, quiet) {
  function ck(id, name, cond, note) {
    rec.push({ id: id, name: name, ok: !!cond, note: note || '' });
    if (!quiet) {
      var v = cond ? 'PASS' : (XFAIL[id] ? 'XFAIL' : 'FAIL');
      console.log('  ' + v.padEnd(6) + id + '  ' + name + (note ? '  -- ' + note : ''));
    }
  }
  function head(s) { if (!quiet) console.log('\n' + s); }
  function rel(a, b) { return Math.abs(a - b) / Math.max(1e-12, Math.abs(a)); }

  /* ---- 1. A QUIET PLANT. The claim must hold where nothing is happening, or it holds
   * nowhere. Compared at MATCHED SIM INSTANTS — see the note on walk()/compare(). */
  head('QUIET PLANT  [200 s at power — the claim where nothing is moving]');
  var q1 = walk(RD, 1, T_WIN, null), q10 = walk(RD, 10, T_WIN, null), q60 = walk(RD, 60, T_WIN, null);
  var qc = compare(q1, q10);
  /* ⚠⚠ SI-0 USED TO BE A SAMPLE-COUNT FLOOR, `qc.n >= 100` of 200, THE SAME CLIFF SI-5 WAS
   * REBUILT OUT OF (#649). It was safe only by accident: a quiet plant never enters the
   * fine-cadence branch, so the legs always shared 200 of 200 -- a 2x margin nothing currently
   * perturbs. The mechanism is the #543/#588 shape SI-5 already names: the shared-instant count
   * is modular arithmetic on the broadcast cadence, not a statement about the plant, and the day
   * anything makes the quiet fixture twitch into fine cadence (a tuning change, a new alarm, a
   * transient-detector adjustment) it becomes the same integer lottery. Ported to the same
   * four-conjunct form, none of them a coincidence count:
   *   1. A LEG DID NOT RUN. Both legs must reach T_WIN -- the bar IS the window, nothing to nudge.
   *   2. THE FIXTURE STOPPED BEING STEADY. For a steady leg this is "the plant is actually at
   *      power and not drifting". Measured over both legs' full window: core THERMAL power
   *      (`core_heat_pct`, not fission `power_pct` -- CLAUDE.md) stays 99.549-99.997 % (worst
   *      0.451 points off rated 100 %), pressure wobbles 0.024-0.030 MPa (3.5-4.3 psi)
   *      peak-to-peak. Bounds: +/-5 percentage points of rated power (0.451 measured -> 11x
   *      margin) and 0.2 MPa / 29 psi of pressure drift (0.030 measured -> 6.7x margin) -- the
   *      same order as SI-5's 6x/15x, not sitting on today's values.
   *   3. THE LEGS ONLY MET IN THE PROLOGUE. No prologue exists on a steady leg (nothing pulls
   *      the legs apart the way a blowdown's cadence-halving does), so this collapses to: the
   *      last shared instant must land within one coarse broadcast (the slower leg's own step,
   *      1.0 s at 10x) of T_WIN. Measured: last shared instant is T_WIN itself, 200.00 of 200 s
   *      -- 0 s short of the 1.0 s tolerance, i.e. it lands exactly on the window end.
   *   4. `compare()` CANNOT SEE A DIFFERENCE. Same 1e-6 planted / 1e-9 SI-3-test proof as SI-5.
   * PROVEN ABLE TO FAIL, four injections, one per conjunct (2026-09-08, measured against this
   * tree at HEAD). Unlike SI-5 (whose "met past the prologue" bar sits early, at the blowdown's
   * OWN half-time), SI-0's conjunct 3 is anchored at the window's END — so a leg cut short of
   * T_WIN necessarily also lands short of "near T_WIN", and injections 1 and 2 honestly trip
   * BOTH the conjunct named and conjunct 3 (deep). Reported as measured, not trimmed to look
   * cleaner than it is (HR10):
   *   1. the 10x leg walked to T_WIN/4 (50 s) only      -> ran=false, deep=false; steady=true,
   *      sensitive=true  (deep entailed: a leg that stops at 50 s cannot land near T_WIN=200 s;
   *      conjunct 3's OWN standalone failure mode is proven clean by injection 3 below)
   *   2. large_loca+station_blackout injected into the   -> steady=false, deep=false; ran=true,
   *      "steady" legs (core power 76.9 -> 3.1 %,           sensitive=true  (deep also trips
   *      pressure 15.326 -> 2.359 MPa / 2223 -> 342 psia)   because a casualty is exactly the
   *                                                          #543/#588 cadence-shift mechanism —
   *                                                          the reason two conjuncts catch it)
   *   3. the 10x leg's instants past T_WIN/2 discarded   -> deep=false ALONE; ran, steady,
   *      sensitive all stay true                            -- clean isolation
   *   4. the planted relative difference forced to 0     -> sensitive=false ALONE; ran, steady,
   *      deep all stay true                                 -- clean isolation
   * No injection reddens any check OTHER than SI-0 (SI-1/SI-3/SI-5/SI-2/SI-4/SI-7/SI-6 all stay
   * green throughout, verified separately). */
  var qRan = Math.min(q1.simTime, q10.simTime) >= T_WIN;
  var s1 = steady(q1), s10 = steady(q10);
  var qSteady = s1.ok && s10.ok;
  var qLast = lastShared(q1, q10);
  var qCoarse = Math.max(lastDelta(q1) || 0, lastDelta(q10) || 0);
  var qDeep = qLast !== null && qLast >= T_WIN - qCoarse;
  var qSens = compare(q1, planted(q10, 1e-6)).worst >= 1e-9;
  ck('SI-0', 'the quiet-plant comparison CAN fail — both legs ran, the plant stayed steady, ' +
             'they met within one broadcast of the window end, and a planted difference is seen',
     qRan && qSteady && qDeep && qSens,
     'ran=' + qRan + ' steady=' + qSteady + ' (power ' + Math.min(s1.pmin, s10.pmin).toFixed(3) +
     '-' + Math.max(s1.pmax, s10.pmax).toFixed(3) + '%, pressure drift <= ' +
     Math.max(s1.drift, s10.drift).toFixed(4) + ' MPa) deep=' + qDeep + ' (last shared ' +
     (qLast === null ? 'never' : qLast.toFixed(2)) + ' s vs T_WIN ' + T_WIN + ' s) sensitive=' +
     qSens + ' -- shared instants, reported not asserted: ' + qc.n + ' of ' + q1.simTime.toFixed(2));
  ck('SI-1', 'protection is evaluated at the SAME rate per sim second at every acceleration',
     Math.abs(q1.rate - q10.rate) < 0.05 && Math.abs(q1.rate - q60.rate) < 0.05,
     q1.rate.toFixed(2) + ' / ' + q10.rate.toFixed(2) + ' / ' + q60.rate.toFixed(2) +
     ' per sim-s at 1x / 10x / 60x');
  ck('SI-3', 'the plant is BIT-FOR-BIT the same plant at 1x and 10x, at every shared instant',
     qc.worst < 1e-9,
     'worst relative difference ' + qc.worst.toExponential(3) +
     (qc.at ? ' at ' + qc.at : '') + ' over ' + qc.n + ' instants');

  /* ---- 2. A TRANSIENT. The regime the claim is FOR — nobody fast-forwards a steady plant,
   * and a quiet plant turned out to be too insensitive to catch a cadence mutation at all
   * (the injection self-test below is what showed that, not a guess). */
  head('TRANSIENT  [large break + station blackout — the regime the claim exists for]');
  var t1 = walk(RD, 1, T_WIN, LOCA), t10 = walk(RD, 10, T_WIN, LOCA),
      t60 = walk(RD, 60, T_WIN, LOCA);
  var tc = compare(t1, t10), tc6 = compare(t10, t60);
  /* ⚠⚠ SI-5 USED TO BE A SAMPLE-COUNT FLOOR, `tc.n >= 20 && tc6.n >= 20`, AND THAT NUMBER WAS A
   * CLIFF. It was moved 30 -> 20 on 2026-09-04 (#625) when the legs landed at 28/22; on
   * 2026-09-05 #633 (secondary relief flow made dependent on upstream steam pressure) took them
   * to 20/16 and it went red again. Second nudge in three days. It is not being nudged a third
   * time — the quantity itself is the defect, and the measurement below is why.
   *
   * MEASURED, four trees, this fixture, 200 s (`--- shared instants ---`):
   *     HEAD, neither change          1x/10x 28   10x/60x 22   last shared 178.00 / 177.00 s
   *     HEAD + #508 only              1x/10x 28   10x/60x 22   IDENTICAL — #508 moved NOTHING
   *     HEAD + #633 only              1x/10x 20   10x/60x 16   last shared 135.00 / 135.00 s
   *     HEAD + #633 + #508            1x/10x 20   10x/60x 16   identical to #633 alone
   * So #633 alone moved it. #508's no-load Tavg re-anchor (291.67 -> 286.11 degC, 557 -> 547
   * degF) changed not one instant in this fixture.
   *
   * AND IT IS GRID ALIGNMENT, NOT DIVERGENCE — the distinction the whole adjudication turns on:
   *   - every leg still runs the full window (1x to 200.06/200.08 s, 10x to 200.50, 60x to
   *     204.00 — unchanged by #633);
   *   - the trajectories are 0.000e+0 at EVERY shared instant in every one of the four trees;
   *   - the first 17 shared instants of the 1x/10x pair, and the first 15 of the 10x/60x pair,
   *     are the SAME TIMES before and after #633 (2.00 3.50 5.00 6.00 ... 75.50). Only the
   *     late ones differ.
   * THE MECHANISM IS MODULAR ARITHMETIC ON THE TRANSIENT CADENCE. In a transient the broadcast
   * halves: 0.100 -> 0.060 s at 1x, 1.000 -> 0.500 s at 10x, 6.000 -> 3.000 s at 60x. Each fine
   * broadcast shifts a leg's grid off the round numbers, and the legs can only meet while the
   * ACCUMULATED offset is back at zero mod the coarse step. #633 quiets the blowdown's tail —
   * the plant settles at 2.225 MPa (323 psia) instead of still falling through 2.98 MPa
   * (432 psia) — so the 1x leg takes 203 fine broadcasts where it took 391 (10x: 25 vs 39;
   * 60x: 6 vs 12). 0.06 x 391 mod 0.1 = 0.06; 0.06 x 203 mod 0.1 = 0.08. NEITHER is zero, so
   * in BOTH trees the legs stop meeting for good once the fine broadcasts stop, and which
   * windows align in between is a lottery on a fine-broadcast COUNT. Any physics change
   * reshuffles it. That is the #543/#588 shape exactly: one integer picks the branch.
   *
   * SO THE COUNT IS NOT ASSERTED ANY MORE. It is still REPORTED in the note, because the drift
   * is worth seeing — it is just not worth failing on. What the guard asserts instead is the
   * four ways this comparison could actually be worthless, none of them a lottery:
   *   1. A LEG DID NOT RUN. Both legs must reach T_WIN. Derived from the window itself.
   *   2. THE FIXTURE STOPPED BEING A CASUALTY. Pressure must at least HALVE across the run —
   *      measured 15.310 -> 2.225 MPa (2221 -> 323 psia), an 85 % fall, so the bar has a 6x
   *      margin and only reds if the break stops breaking.
   *   3. THE LEGS ONLY MET IN THE PROLOGUE. Every run starts aligned and drifts apart, so an
   *      intersection can be non-empty and still say nothing. The bar is the blowdown's OWN
   *      half-excursion time, read off the 1x trajectory (8.92 s here, 8.02 s at HEAD) — no
   *      typed constant, and it tracks the physics rather than fighting it. Last shared
   *      instant 135.00 s against 8.92 s is a 15x margin (HEAD: 178.00 vs 8.02, 22x).
   *   4. `compare()` CANNOT SEE A DIFFERENCE. A 1e-6 relative difference is PLANTED in every
   *      field of the second leg and compare() must report it against SI-4's own 1e-9 test.
   *      This is the conjunct that makes an EMPTY intersection fail, and the one that would
   *      have caught the walk() field list being emptied — the trap this file's own walk()
   *      comment records (sg_level and boron were added after a mutation came back blind).
   * WHY THIS CANNOT BE NUDGED THE SAME WAY: there is no longer a number standing next to the
   * measurement. 2's margin is 6x, 3's is 15x, and 1 and 4 are pass/fail with nothing to move.
   * A future physics change that halves the sharing window again changes NONE of them.
   *
   * PROVEN ABLE TO FAIL, five injections, one per conjunct (2026-09-05 — a guard that cannot go
   * red is worse than the cliff it replaced, so this is not optional):
   *   1. the 60x leg walked to T_WIN/4          -> ran=false             SI-5 red
   *   2. LOCA emptied, so nothing is injected   -> casualty=false        SI-5 red
   *   3. 10x/60x instants past 5 s discarded    -> deep=false            SI-5 red
   *   4. compare()'s field difference forced 0  -> sensitive=false       SI-5 red
   *   5. 10x/60x instants ALL discarded         -> deep+sensitive false  SI-5 red
   * ⚠ IN 3, 4 AND 5, SI-4 AND SI-7 STAYED GREEN — reporting "worst relative difference 0.000e+0
   * over 0 instants" in 5, and over a comparison that could not subtract in 4. That is the
   * vacuity this check exists to prevent, and it is the whole argument for the sensitivity
   * conjunct: the count floor could never have caught 4 at all.
   * ⚠ AND INJECTION 2 IS THE OLD FORM'S OWN INDICTMENT. With the casualty removed the legs
   * share 200 and 33 instants — TEN TIMES the floor that was failing. `tc.n >= 20` would have
   * passed, loudly, on a fixture that had stopped being a fixture. The count was not a weak
   * guard on the right quantity; it was a guard on the wrong one. */
  var half = halfExcursionTime(t1), e1 = ends(t1);
  var ls = lastShared(t1, t10), ls6 = lastShared(t10, t60);
  var ran = Math.min(t1.simTime, t10.simTime, t60.simTime) >= T_WIN;
  var isCasualty = !!e1 && e1.P1 < e1.P0 * 0.5;
  var deep = half !== null && ls !== null && ls6 !== null && ls > half && ls6 > half;
  var sens = compare(t1, planted(t10, 1e-6)).worst >= 1e-9 &&
             compare(t10, planted(t60, 1e-6)).worst >= 1e-9;
  ck('SI-5', 'the transient comparison CAN fail — the legs ran, the casualty developed, they ' +
             'met past the blowdown\'s half-point, and a planted difference is seen',
     ran && isCasualty && deep && sens,
     'ran=' + ran + ' casualty=' + isCasualty + ' (P ' + (e1 ? e1.P0.toFixed(3) + ' -> ' +
     e1.P1.toFixed(3) : '?') + ' MPa) deep=' + deep + ' (last shared ' +
     (ls === null ? 'never' : ls.toFixed(2)) + ' / ' + (ls6 === null ? 'never' : ls6.toFixed(2)) +
     ' s vs half-excursion ' + (half === null ? '?' : half.toFixed(2)) + ' s) sensitive=' + sens +
     ' -- counts, reported not asserted: 1x/10x ' + tc.n + ', 10x/60x ' + tc6.n);
  ck('SI-2', 'protection is evaluated at the same rate per sim second IN A TRANSIENT',
     Math.abs(t1.rate - t10.rate) < 0.05,
     t1.rate.toFixed(2) + ' vs ' + t10.rate.toFixed(2) + ' per sim-s — the broadcast cadence ' +
     'halves to 50 ms in a transient, which is BELOW PROTECTION_DT (0.1 s) at 1x');
  ck('SI-4', 'the plant is BIT-FOR-BIT the same plant at 1x and 10x THROUGH A CASUALTY',
     tc.worst < 1e-9,
     'worst relative difference ' + tc.worst.toExponential(3) + (tc.at ? ' at ' + tc.at : '') +
     ' over ' + tc.n + ' instants');
  ck('SI-7', '...and at 10x against 60x, through the same casualty',
     tc6.worst < 1e-9,
     'worst relative difference ' + tc6.worst.toExponential(3) + (tc6.at ? ' at ' + tc6.at : '') +
     ' over ' + tc6.n + ' instants');

  /* ---- 3. THE MECHANISM, NAMED. A trajectory check says something is wrong; this says
   * WHERE. `sinceEval` is a local in `tick()`, re-initialised to 0 every broadcast, so the
   * "sim-time cadence" cannot carry across broadcasts and degenerates to the broadcast rate
   * once a broadcast is shorter than PROTECTION_DT. Asserted against the SOURCE, because the
   * defect is structural and a trajectory can only ever be evidence for it. */
  head('THE MECHANISM  [named in the source, not inferred from a trajectory]');
  /* ⚠ COMMENTS ARE STRIPPED FIRST, and that is not fussiness — the first version of this check
   * matched `/var\s+sinceEval\s*=\s*0\s*;/` against the raw source and went on failing after the
   * fix landed, because the fix's OWN COMMENT quotes the defective line it replaced. A source
   * scan that cannot tell code from prose reports the thing it is describing. It also asserts
   * the POSITIVE now (the accumulator is read from the instance AND written back), because
   * "the bad line is absent" is satisfied by deleting the mechanism altogether. */
  var tickAt = SVC_SRC.indexOf('SimulationService.prototype.tick =');
  var tickBody = SVC_SRC.slice(tickAt, tickAt + 12000)
                        .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  var reads = /var\s+sinceEval\s*=\s*this\._sinceEval\s*\|\|\s*0\s*;/.test(tickBody);
  var writes = /this\._sinceEval\s*=\s*sinceEval\s*;/.test(tickBody);
  var perTick = /var\s+sinceEval\s*=\s*0\s*;/.test(tickBody);
  ck('SI-6', '`sinceEval` carries ACROSS broadcasts — a per-tick local cannot hold a sim-time cadence',
     reads && writes && !perTick,
     perTick ? 'still declared `var sinceEval = 0;` inside tick() — resets every broadcast (#588)'
             : (reads && writes ? 'read from the instance and written back'
                                : 'reads=' + reads + ' writes=' + writes + ' — the accumulator ' +
                                  'does not round-trip, so the cadence cannot carry'));
}

/* ---- RUN ------------------------------------------------------------------------------- */
console.log('\nPWR2 service — TIME-ACCELERATION INVARIANCE (#588)');
var RD = loadAll(undefined), rec = [];
runSuite(RD, rec, false);

var nPass = 0, nXfail = 0, nFail = 0, nXpass = 0;
rec.forEach(function (r) {
  if (r.ok && !XFAIL[r.id]) nPass++;
  else if (!r.ok && XFAIL[r.id]) nXfail++;
  else if (!r.ok) nFail++;
  else nXpass++;
});

if (nXfail) {
  console.log('\nKNOWN GAPS (xfail) — tracked, not regressions:');
  rec.forEach(function (r) {
    if (!r.ok && XFAIL[r.id]) console.log('  ' + r.id + ': ' + XFAIL[r.id]);
  });
}
if (nXpass) {
  console.log('\n** XPASS — a gap closed and its XFAIL entry is now stale. Delete it. **');
  rec.forEach(function (r) { if (r.ok && XFAIL[r.id]) console.log('  ' + r.id); });
}

/* ---- INJECTION SELF-TEST ----------------------------------------------------------------
 * A check written beside its own subject is not green until it has been made to go red. The
 * mutations break the invariance DELIBERATELY; each must redden a check that is not already
 * an xfail, or this gate is measuring nothing. */
/* ⚠ EVERY MUTATION HERE IS A REAL DEFECT, and two that looked like defects were removed once
 * the gate showed they are not. Both came back BLIND and neither was a gate failure:
 *
 *   "automation stepped once per broadcast with the lumped dt" — EQUIVALENT. `stepAutomation`
 *   accumulates dt against its own sim-time cadence internally, exactly as `:333` claims, so
 *   delivering 5 x 0.02 s or 1 x 0.10 s produces the same plant. The mutation was testing the
 *   claim by breaking something that is not there to break.
 *
 *   "the post-loop call over-counts with PROTECTION_DT instead of the accrued time" — EQUIVALENT
 *   SINCE THE FIX. The post-loop call now only fires when `sinceEval >= PROTECTION_DT`, so the
 *   constant and the variable agree to the epsilon. It WAS a defect before the fix, and the fix
 *   is what retired it. Worth the four lines to say so: a mutation that stops being catchable
 *   because the code got better is the opposite of a blind spot, and it looks identical.
 *
 * The two replacements below re-introduce #588 itself, one half at a time — the strongest form
 * of regression guard there is for a fix, because each half alone must still be caught. */
var MUTATIONS = [
  ['the in-loop sim-time cadence is disabled (protection falls to the broadcast rate)',
   'if (sinceEval >= PROTECTION_DT - 1e-9 && i < steps - 1) {',
   'if (false && i < steps - 1) {'],
  ['#588 RETURNS, half one: the accumulator stops carrying across broadcasts',
   'this._sinceEval = sinceEval;', 'this._sinceEval = 0;'],
  ['#588 RETURNS, half two: the post-loop evaluation fires every broadcast again',
   'if (sinceEval >= PROTECTION_DT - 1e-9) {', 'if (true) {'],
  ['the fine-sample budget leaks into the step loop (a per-broadcast quantity reaching physics)',
   /* anchor re-pointed 2026-09-04 (#625): the loop steps at the TIER's `dt` local now */
   'this.engine.step(dt);',
   'this.engine.step(dt * (1 + 1e-9 * steps));']
];

/* This list held one mutation while SI-2/SI-4 were xfail, because the only checks that could
 * see it were the ones already declared failing. Both are live now and it has been PROMOTED
 * into MUTATIONS above. Kept as an empty seam with its history, because the rule it encodes is
 * the point: a blind spot the gate creates for ITSELF is a gate failure; a blind spot an open,
 * named gap creates is a fact about the gap, and it must be named rather than scored. */
var MUTATIONS_BLOCKED = [];

/* ---- THE CLEAN-RUN GUARD (#644) -------------------------------------------------------------
 * REFUSE TO SCORE on a red clean run. The replay below counts ABSOLUTE non-xfail reds in the
 * mutant, so an already-red check is red in every mutant too and EVERY mutation reads as caught —
 * the coverage instrument reporting full coverage exactly when the runner is not green. The xfails
 * are a side MAP here rather than a `verdict` field, so they are filtered out on the way in: a
 * KNOWN gap must not refuse the scoring, only an unexpected red. Ruling and the measured case:
 * mut_flags.requireCleanRun's header. */
MUT.requireCleanRun(rec.filter(function (r) { return !r.ok && !XFAIL[r.id]; }),
  '  run_service_invariance: ' + nPass + ' passed, ' + nXfail + ' xfail, ' + nFail +
  ' failed, ' + nXpass + ' unexpected-pass  (' + rec.length + ' checks)');

console.log('\n' + '='.repeat(70));
console.log('  INJECTION SELF-TEST — every mutation MUST redden a check that is not an xfail');
console.log('='.repeat(70));
var blind = 0;
MUT.select(MUTATIONS).forEach(function (m) {
  if (SVC_SRC.indexOf(m[1]) === -1) { console.log('  ERROR   anchor not found: ' + m[0]); blind++; return; }
  var r2 = [];
  try {
    var RD2 = loadAll(SVC_SRC.split(m[1]).join(m[2]));
    runSuite(RD2, r2, true);
  } catch (e) { r2.push({ id: 'threw', ok: false }); }
  var reddened = r2.filter(function (r) { return !r.ok && !XFAIL[r.id]; }).length;
  if (reddened === 0) { blind++; console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); }
  else console.log('  caught    ' + m[0].padEnd(62) + reddened + ' red');
});
MUTATIONS_BLOCKED.forEach(function (m) {
  console.log('  blocked   ' + m[0]);
  console.log('            (' + m[1] + ')');
});
loadAll(undefined);                                    /* restore the shipped service */

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS — GATE FAILS **' : ', no blind spots'));
console.log('  run_service_invariance: ' + nPass + ' passed, ' + nXfail + ' xfail, ' +
  nFail + ' failed' + (nXpass ? ', ' + nXpass + ' XPASS' : '') + '  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((nFail > 0 || nXpass > 0 || blind > 0) ? 1 : 0);
