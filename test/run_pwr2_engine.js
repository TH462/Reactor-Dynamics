/* run_pwr2_engine.js — the facade gate (2026-08-19, owner ruling "A": the preview-page route).
 *
 * THE CENTRAL CLAIM is equivalence: pwr2_engine assembles and steps the SAME plant the gates
 * wire by hand, so its settled state must match a hand-wired ride to tight tolerance — the
 * facade proven against the independent wiring, not against itself. After that: every command
 * reaches its system with an observable effect; the caller-half of HR5 (a protection trip
 * inserts the rods with no command; SI starts the ECCS lineup); and the wiring mutations a
 * facade makes possible for the first time (drop the relief sink, unhook the level controller,
 * delete the scram-on-trip) each red.
 *
 * Run: node test/run_pwr2_engine.js            part A (the default — see THE PARTITION below)
 *      node test/run_pwr2_engine_b.js          part B
 *      node test/run_pwr2_engine_c.js          part C
 *      node test/run_pwr2_engine.js --all      the unsplit whole, for local debugging
 */
'use strict';
var path = require('path');
var MUT = require('./mut_flags.js');   /* --no-mutations / --mut= / --grp= (#602) */
var SRC = path.join(__dirname, '..', 'engines', 'pwr2');
var fs = require('fs');

/* ---- THE PARTITION (#637, on the run_campaign A/B/C precedent of #513) ----------------------
 * SPLIT IN THREE 2026-09-05. This runner was the CI tail — #637 reads 1388 s from the green
 * #630 run and 2094.6 s from a red one, a 1.51x runner-class spread on the same commit list.
 * Measured here the same day: the whole file is 1550.9 s. Once `run_all` is sharded across
 * matrix jobs (Phase S of #637) the wall stops being total-CPU-over-lanes and becomes the
 * LONGEST RUNNER, so this file alone decided the gate's length. Measured after the split, each
 * part alone on the shipped file: A 321.4 s · B 326.5 s · C 830.2 s (a second sample of the
 * same three, taken an hour earlier, read 323.5 / 329.0 / 839.2 — within 1 %).
 *
 * A SCHEDULING CHANGE, NOT A TEST CHANGE: every check and every mutation still runs, in
 * exactly one part. Proved rather than asserted — the union of the three parts' check NAMES
 * was diffed against the unsplit run's and is identical, 156 for 156; the ownership audit at
 * the bottom fails the run if any mutation falls between the parts; and the split was
 * injection-tested by deleting the rod-stop line the group-I mutation anchors (part C reds 3
 * checks, parts A and B stay green at 79 and 61).
 *
 * THE COST IS THE MUTATION REPLAY, NOT THE CHECKS — 1312.4 s of 1550.9 s. The whole clean
 * pass is 218.9 s measured solo; the other 85 % is 86 scoped replays, and a replay costs
 * whatever ITS OWN GROUP'S rides cost. So a group's true cost is (its clean pass) + (its
 * mutations x that ride), which spans three orders of magnitude across the seventeen groups.
 * That is why this is a MEASURED-COST list and not a count split, the same finding as #513's,
 * where parity alternation landed 25 s / 229 s: a partition that cannot see cost cannot
 * balance it. Measured 2026-09-05 with `--groups=<g>`, `MUTTIME=1`, two concurrent streams on
 * a 12-core box at 12-34 % idle load (the I stream against the rest; group I's replays read
 * 92 s under contention against a 91.0 s solo clean pass, so contention is inside the noise):
 *
 *     grp  checks muts   clean    replays  mean/replay   TOTAL s   part
 *      I     16     9    94.8      768.6      85.4        863.4     C
 *      E     11     7    24.2      153.6      21.9        177.8     A
 *      K     19    10    18.5      133.7      13.4        152.2     B
 *      D     12     7    15.6       88.6      12.7        104.2     B
 *      F      9     6    13.7       37.8       6.3         51.5     A
 *      A     20     7     7.7       28.3       4.0         36.0     A
 *      R      6     3    16.2       18.6       6.2         34.8     B
 *      L      7     4     5.9       20.3       5.1         26.2     A
 *      Q      8     6     5.2       16.3       2.7         21.5     B
 *      N      8     4     6.4       11.0       2.8         17.4     A
 *      O      7     3    14.4        2.6       0.9         17.0     A
 *      H      7     5     3.3       11.4       2.3         14.7     B
 *      G     11     6     2.9       10.9       1.8         13.8     A
 *      B      5     5     3.8        8.4       1.7         12.2     B
 *      C      4     1     3.2        1.3       1.3          4.5     B
 *      M      2     1     1.6        0.6       0.6          2.2     A
 *      P      4     2     1.1        0.4       0.2          1.5     A
 *                                                        ------
 *   predicted from the cells:  A 343.4 s (79 checks, 40 mutations) · B 344.1 (61 / 37) ·
 *   C 863.4 (16 / 9).  Measured as three whole runs: 321.4 · 326.5 · 830.2 — each 4-6 % under
 *   its prediction, because a part pays ONE process start and one water/vtable build for all
 *   of its groups where seventeen separate --groups= runs paid seventeen.
 *
 * ⚠ GROUP I IS 56 % OF THE RUNNER ON ITS OWN, so the 830 s part C measures is the FLOOR for
 * any split that cuts on group boundaries, and #637's target of ~700 s per part — under
 * run_checklist_pwr2's 681 s, so that this stops being the tail — is NOT reachable this way. It is
 * in its own part rather than buried in a mixed one precisely so that stays visible in a
 * baseline. The cheap next move is NOT another partition: it is that each of I's nine
 * mutations re-rides the WHOLE group (85.4 s), so halving group I halves its replay bill.
 * That is a coverage-scoping change, not a scheduling one — a mutation whose only red check
 * lands in the other half goes BLIND, which this runner would say out loud — so it is filed
 * work, not something to do while re-balancing.
 *
 * PART A KEEPS EVERYTHING UNLISTED. A new grp() block lands in part A by default and moves
 * part A's check tally — so the partition cannot drift silently (the #513 property). GROUPS is
 * DERIVED from this file's own source, so a group letter in PART_B/PART_C that no longer
 * exists is an error, not a silence. */
var SELF_SRC = fs.readFileSync(__filename, 'utf8');
var GROUPS = (function () {
  /* the `if (` is load-bearing: a bare /grp\('X'\)/ also matches the PROSE in this file (the
   * note at the head of the audit below, and the group-order note inside group A), and a
   * letter mentioned in a comment would become a group nothing runs */
  var seen = {}, re = /if \(grp\('([A-Z])'\)/g, m;
  while ((m = re.exec(SELF_SRC)) !== null) seen[m[1]] = true;
  return Object.keys(seen).sort();
})();
/* PART_B / PART_C: the groups those parts OWN; part A is everything else. Longest-processing-
 * time greedy over the table above, with I taken out first because nothing balances it.
 * The rule for moving one: re-measure with --groups=, do not guess. */
var PART_B = ['B', 'C', 'D', 'H', 'K', 'Q', 'R'];
var PART_C = ['I'];
var PART_NAMES = ['A', 'B', 'C'];
function partOf(g) {
  return PART_B.indexOf(g) >= 0 ? 1 : PART_C.indexOf(g) >= 0 ? 2 : 0;
}
/* the lists are hand-written, so they are CHECKED against the derived groups — a letter that
 * names no block, or one claimed by both parts, would quietly move checks out of every part
 * or run them twice, and either way `run_all` would go on scoring three green baselines. */
PART_B.concat(PART_C).forEach(function (g) {
  if (GROUPS.indexOf(g) < 0)
    throw new Error('run_pwr2_engine: PART_B/PART_C names group ' + g +
      ', which no `if (grp(...))` block in this file defines (groups: ' + GROUPS.join(' ') + ')');
  if (PART_B.indexOf(g) >= 0 && PART_C.indexOf(g) >= 0)
    throw new Error('run_pwr2_engine: group ' + g + ' is claimed by BOTH part B and part C');
});
var PART = globalThis.__PWR2_ENGINE_PART || 0;
/* `--mut=<substring>` widens to the whole file, the same reasoning as --grp= below: the
 * substring names a mutation the caller wants replayed, and in a part that does not own its
 * group the answer would be "0 of 86" — a flag that silently does nothing. The run is forced
 * non-zero by mut_flags either way, so scoping is a convenience question, not a correctness one. */
var ALL = process.argv.indexOf('--all') >= 0 || process.env.RD_PWR2_ALL === '1' ||
          (!!MUT.mutTag() && !MUT.grpTag());
/* --groups=A,D  — the DEV flag that produced the cost table and is how the next re-balance
 * re-measures it. It overrides the partition, so like every mut_flags filter it can never be
 * a baseline: the exit is forced non-zero for the rest of the process.
 * `--grp=X` (mut_flags, #602) implies it: that flag replays one group's mutations, and in a
 * PART that does not own X it would otherwise replay nothing and silently look like a fast
 * clean run. Scoping the clean pass to X as well is also what the flag is for — iterating. */
var GROUPS_FLAG = process.argv.filter(function (s) { return s.indexOf('--groups=') === 0; });
var GROUP_OVERRIDE = GROUPS_FLAG.length
  ? GROUPS_FLAG[0].slice(9).split(',').map(function (s) { return s.trim(); })
  : (MUT.grpTag() ? [MUT.grpTag()] : null);
var MY = {};
GROUPS.forEach(function (g) {
  if (GROUP_OVERRIDE) { if (GROUP_OVERRIDE.indexOf(g) >= 0) MY[g] = true; }
  else if (ALL || partOf(g) === PART) MY[g] = true;
});
if (GROUPS_FLAG.length) {   /* --grp= arms mut_flags' own guard already; do not banner twice */
  var _realExit = process.exit.bind(process);
  process.exit = function (c) { _realExit(c ? c : 1); };
  process.on('exit', function () {
    console.log('\n' + '!'.repeat(70));
    console.log('  PARTIAL RUN — --groups= OVERRODE THE PARTITION. Forced non-zero; never a baseline.');
    console.log('!'.repeat(70));
  });
}
var MY_GROUPS = GROUPS.filter(function (g) { return MY[g]; });
var ORDER = ['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop',
  'pwr2_kinetics', 'pwr2_fuel', 'pwr2_reactor', 'pwr2_sources', 'pwr2_sg', 'pwr2_turbine',
  'pwr2_relief', 'pwr2_condenser', 'pwr2_cvcs', 'pwr2_eccs', 'pwr2_afw', 'pwr2_damage',
  'pwr2_protection', 'pwr2_pressurizer', 'pwr2_dumpctl', 'pwr2_break', 'pwr2_containment', 'pwr2_rhr',
  'pwr2_true_state', 'pwr2_instruments', 'pwr2_feedwater'];

function loadAll(engSource, coreSource) {
  ORDER.forEach(function (f) {
    if (f === 'pwr2_core' && coreSource !== undefined) { (0, eval)(coreSource); return; }
    /* pwr2_water + pwr2_vtable stay CACHED across replays (#513): neither is ever this
     * gate's mutation target, and re-executing pwr2_vtable throws away its lazily-built
     * ~0.5 s GRID once per replay (56 passes here ≈ 28 s). Kept as a PAIR — the vtable
     * closes over RD.pwr2.water at its own load (pwr2_vtable.js:57), so a fresh water
     * must never meet a stale vtable. run_pwr2_vtable.js owns mutations of those two
     * and replays via new Function, which this does not touch. */
    if (f !== 'pwr2_water' && f !== 'pwr2_vtable')
      delete require.cache[require.resolve(path.join(SRC, f + '.js'))];
    require(path.join(SRC, f + '.js'));
  });
  if (engSource === undefined) {
    delete require.cache[require.resolve(path.join(SRC, 'pwr2_engine.js'))];
    require(path.join(SRC, 'pwr2_engine.js'));
  } else {
    (0, eval)(engSource);
  }
  return globalThis.RD.pwr2;
}

/* runSuite(RD, rec, quiet, only) — `only` scopes a MUTATION REPLAY to the section group that
 * can see that mutation: 'A' equivalence/door/pushbutton (one engine chain), 'B' the
 * P-9/lying-channel family (eng4-6), 'C' the runback (eng7), 'D' the break + drain (eng2-3),
 * 'E' the AFW starts, 'F' the feed train, 'G' the electrical pair (#507 wave 4), 'H' the
 * SGTR (#507 wave 5), 'I' the failure levers (#507 wave 6), 'K' the initial conditions
 * (#507 §F, wave 7), 'L' the rod insertion limit (#507 §B, wave 8), 'M' the RCP restart
 * (#507 wave 9), 'N' the shutdown IC (#507 wave 10), 'O' the neutron-source construction
 * (#536), 'P' the heater-elevation seam (#573), 'Q' the letdown split (#624 items 14/25),
 * 'R' the Mode 5 pressure-control lineup (#624 / #619 item 14).
 * The CLEAN pass runs THIS PART'S groups (#637 — it ran everything until the split; the
 * union of the three parts is still every group, and `--all` still is one process). Measured
 * before the `only` scoping existed: 17 mutations x the whole suite = 1074 s of contention in
 * the aggregate gate — the replay cost scales with every fixture ever added, and a mutation
 * only needs the checks built to see it. The same arithmetic is what the parts divide. */
function runSuite(RD, rec, quiet, only) {
  /* THE BANK'S OWN CURRENCY (#602 phase 2). Every step count below used to be a literal that
   * happened to equal a fraction of a 200-step bank; when the scale moved to the sourced 627
   * they all became wrong at once — sixteen checks in this file, and every one of them was a
   * FRACTION spelled as an absolute. `bank()` is the scale, `frac()` turns the fraction the
   * check always meant into this plant's steps. A literal here is now a claim that the number
   * does NOT scale, which is true of exactly none of them. */
  var bank = function () { return RD.kinetics.RODS.max_steps; };
  var frac = function (f) { return Math.round(f * bank()); };
  /* A RIDE THAT WALKS THE BANK scales with the bank. `walk(seconds)` converts a duration
   * that was measured on the 200-step bank into this one's. Durations set by a THERMAL or
   * CONTROL process (settling, xenon, a dump ramp) are NOT scaled — they have nothing to do
   * with rod travel, and putting them through here would launder an unrelated number. */
  var walk = function (secs) { return Math.round(secs * bank() / 200); };
  var EN = RD.engine, W = RD.water, S = RD.sources, G = RD.sg, TB = RD.turbine,
      RL = RD.relief, CD = RD.condenser, DC = RD.dumpctl, PZ = RD.pressurizer,
      K = RD.kinetics, R = RD.reactor;
  var DT = 0.02;

  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(58) +
      'got ' + (typeof got === 'number' ? got.toFixed(3) : got) + ' want ' + want +
      ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }
  /* SET MEMBERSHIP, not a scalar compare (#637). The CLEAN pass runs the groups THIS PART
   * owns; a mutation REPLAY still runs exactly the one group that can see it, and a part only
   * ever replays mutations tagged with a group it owns — so `only` is always in MY here. */
  function grp(g) { return only === undefined ? MY[g] === true : only === g; }
  function run(eng, secs) {
    var ts = null;
    for (var i = 0; i < secs / DT; i++) ts = EN.step(eng, DT);
    return ts;
  }

  var SETTLE = quiet ? 120 : 300;

  if (grp('A')) {
  /* ---- 1. EQUIVALENCE: the facade against the gates' own hand wiring ----------------------- */
  head('EQUIVALENCE  [the facade must BE the hand wiring, proven against it]');
  var eng = EN.createEngine({});
  var tsE = run(eng, SETTLE);
  /* the hand-wired plant, retyped from run_pwr2_loadfollow's ride() — the independent copy.
   * The IC comes from the facade's own designHmap (#502): the equivalence claim is about the
   * WIRING, so both sides must boot the same plant — a hand-typed scalar here would re-create
   * the isothermal-boot defect on one side only and turn the check into an IC comparison. */
  var pz = PZ.createPressurizer({});
  var sys = S.createPlant({ h: EN.designHmap(), P: 15.41, extraMass: PZ.extraMassFn(pz) });
  var rx = R.createReactor({ P: 1.0, coolTemp_c: 304.5 });
  var B = K.criticalBoron(rx.kin, 304.5, 15.41, null, rx.kin.X / rx.kin.X_eq_full,
                          rx.fuel.T_fuel_c);
  var sg = G.createSG({}), tb = TB.createTurbine({ load_target_mwe: 100 });
  var rl = RL.createRelief({}), cd = CD.createCondenser({}), dc = DC.createDumpCtl({});
  var rated = TB.steamDemand(tb, sg.P, G.SG.h_feed);
  var rH = null;
  for (var i = 0; i < SETTLE / DT; i++) {
    var steam = TB.steamDemand(tb, sg.P, G.SG.h_feed);
    var cr = CD.stepCondenser(cd, DT, {
      duty_kW: steam * (W.h_g(sg.P) - G.SG.h_feed) * (1 - TB.etaCycle()),
      cw_pumps_running: true });
    var dcr = DC.stepDumpCtl(dc, DT, { tavg_c: G.primaryTavg(sys), load_frac: 1,
      turbine_tripped: false, condenser_available: cr.available });
    var rr = RL.stepRelief(rl, sg.P, DT, { rated_steam_kgs: rated,
      dump_demand: dcr.dump_demand, condenser_available: cr.available });
    var out = steam + rr.total_kgs;
    var sr = G.stepSG(sg, G.primaryTavg(sys), DT, { feed: out, steam: out });
    TB.stepTurbine(tb, DT, { steam_kgs: steam, P_mpa: sr.P_sec, h_feed: G.SG.h_feed });
    rH = R.stepReactor(rx, sys, DT, { boron_ppm: B, rodGroups: null });
    S.stepPlant(sys, DT, { heats: rH.heats, sgDuty: sr.duty_kW });
    PZ.stepPressurizer(pz, sys, DT, {});
  }
  /* ⚠ NOT EXACT, and the differences are DECLARED, each one a facade feature: the facade runs
   * CVCS (letdown/charging/seal reshape the inventory), a 200-step rod bank at its own worth,
   * and its boron trim solves against that lineup. The claim is same-plant-same-regime, bands
   * a facade wiring error (a dropped system, a doubled heat) blows through. */
  ckT('the settled facade sits in the hand-wired plant\'s regime',
      Math.abs(tsE.pressure_mpa - sys.P) < 0.15 &&
      Math.abs(tsE.tavg_c - G.primaryTavg(sys)) < 1.5 &&
      Math.abs(tsE.power_pct - rH.power_pct) < 2.0,
      'P ' + tsE.pressure_mpa.toFixed(3) + ' vs ' + sys.P.toFixed(3) + ' MPa, Tavg ' +
      tsE.tavg_c.toFixed(2) + ' vs ' + G.primaryTavg(sys).toFixed(2) + ' degC, power ' +
      tsE.power_pct.toFixed(1) + ' vs ' + rH.power_pct.toFixed(1) + ' %');
  ckT('...critical, at pressure, subcooled, level near program — the §43 plant through one door',
      Math.abs(tsE.reactivity_pcm) < 15 && tsE.pressure_mpa > 15.2 &&
      tsE.subcooling_c > 10 && Math.abs(tsE.pzr_level_pct - 61.5) < 8,
      tsE.reactivity_pcm.toFixed(1) + ' pcm, ' + (tsE.pressure_mpa * 145.04).toFixed(0) +
      ' psia, subcool ' + (tsE.subcooling_c * 1.8).toFixed(1) + ' degF, level ' +
      tsE.pzr_level_pct.toFixed(1) + ' %');
  ckT('the true_state passes through whole — the shim fields a page will read are all present',
      typeof tsE.thot_c === 'number' && typeof tsE.steam_pressure_mpa === 'number' &&
      typeof tsE.mwe_output === 'number' && tsE.scrammed === false &&
      tsE.porv_stuck === false && typeof tsE.core_void_fraction === 'number',
      '');

  /* ---- 1b. THE IC IS SETTLED (#502) --------------------------------------------------------- */
  /* A FRESH engine, NO commands, 60 s. Before the design-point enthalpy map this red at
   * power min 76.6 % (t = 2.9 s) with Thot 580 -> 622 degF and a 64 psi sag — the isothermal
   * boot developing its own loop split on every free-play start. The bounds are the ring's
   * absence, not the design point itself (the settle drifts ~1.3 degC below the constants —
   * declared in designHmap's header). */
  head('SETTLED IC  [a no-command ride from construction does not ring]');
  var engIC = EN.createEngine({});
  var icMin = 1e9, icPMin = 1e9, icTs = null;
  for (var ici = 0; ici < 60 / DT; ici++) {
    icTs = EN.step(engIC, DT);
    if (icTs.power_pct < icMin) icMin = icTs.power_pct;
    if (icTs.pressure_mpa < icPMin) icPMin = icTs.pressure_mpa;
  }
  ckT('60 s untouched: power holds, legs near settled, pressure inside the park',
      icMin >= 97.0 && icPMin > 15.17 &&
      Math.abs(icTs.thot_c - 319.0) < 2.5 && Math.abs(icTs.tcold_c - 287.6) < 2.5,
      'power min ' + icMin.toFixed(1) + ' %, P min ' + (icPMin * 145.04).toFixed(0) +
      ' psia, legs ' + (icTs.thot_c * 1.8 + 32).toFixed(1) + '/' +
      (icTs.tcold_c * 1.8 + 32).toFixed(1) + ' degF');

  /* ---- 2. EVERY COMMAND REACHES ITS SYSTEM -------------------------------------------------- */
  head('THE ONE DOOR  [each command lands with an observable effect]');
  EN.command(eng, 'load_mwe', 80);
  var t80 = run(eng, quiet ? 60 : 120);
  ckT('load_mwe moves the turbine and the plant follows',
      Math.abs(t80.mwe_output - 80) < 1 && t80.power_pct < 97, 'MWe ' +
      t80.mwe_output.toFixed(1) + ', power ' + t80.power_pct.toFixed(1) + ' %');
  EN.command(eng, 'rod_target', frac(0.95));
  var tRod = run(eng, 5);
  ckT('rod_target SLEWS — five seconds at normal speed moves ~3.5 steps, not the whole demand',
      /* 0.702 steps/s = the sourced WTSM 8.1 normal class rate mapped onto the 200-step
       * bank (#506.4); the pre-#506 single rate (1.0 = always FAST) read ~5 here */
      Math.abs(tRod.rod_steps - (bank() - 0.702 * 5)) < 1.0,
      tRod.rod_steps.toFixed(1) + ' steps, from ' + bank() + ' toward ' + frac(0.95) +
      ' — instant rods are a lever no real plant has');
  EN.command(eng, 'rod_target', bank()); run(eng, quiet ? 20 : 40);
  EN.command(eng, 'aux_spray', 0.5);
  var tAux = run(eng, 1);
  ckT('aux_spray reaches the vessel', tAux.spray_flow_pct !== undefined &&
      eng._pzr.aux_spray_frac === 0.5, 'aux frac ' + eng._pzr.aux_spray_frac);
  EN.command(eng, 'aux_spray', 0);
  /* THE STICK IS A LATCH (owner design, 2026-08-25): arming it moves nothing; the first lift
   * latches it; a manual close then does nothing; only the clear releases it. Each clause
   * pinned, because the pre-latch build opened the valve on arming. */
  EN.command(eng, 'porv_stick', true);
  var tArm = run(eng, 1);
  ckT('porv_stick ARMS without lifting: a shut valve stays shut, stuck reads false',
      tArm.porv_stuck === false && tArm.porv_open === false && eng._pzr.relief_kgs === 0,
      'stuck ' + tArm.porv_stuck + ', open ' + tArm.porv_open);
  EN.command(eng, 'porv_manual', true);
  var tStick = run(eng, 1);
  ckT('the operator lift LATCHES the armed stick and the contract reports it',
      tStick.porv_stuck === true && tStick.porv_open === true, '');
  EN.command(eng, 'porv_manual', false);
  var tHeld = run(eng, 1);
  var PZL = globalThis.RD.pwr2.pressurizer;
  var lawHeld = (PZL.reliefAreas().porv_m2 / 2) * PZL.criticalFlux(eng._pzr.relief_h, eng.sys.P);
  ckT('a manual close does NOT move a latched valve (one valve still passing, at the choked law)',
      tHeld.porv_stuck === true && tHeld.porv_open === true &&
      Math.abs(eng._pzr.relief_kgs - lawHeld) < 1e-9 && eng._pzr.relief_kgs > 0,
      eng._pzr.relief_kgs.toFixed(2) + ' kg/s at ' + (eng.sys.P * 145.04).toFixed(0) + ' psia');
  EN.command(eng, 'block_valve', false);
  var tBlock = run(eng, 1);
  ckT('block_valve isolates the stuck valve', tBlock.block_valve_open === false &&
      eng._pzr.relief_kgs === 0, '');
  EN.command(eng, 'porv_stick', false); EN.command(eng, 'block_valve', true);
  var tClr = run(eng, 1);
  ckT('clearing the failure is the only release: unlatched, shut, no discharge',
      tClr.porv_stuck === false && tClr.porv_open === false && eng._pzr.relief_kgs === 0, '');
  ckT('an unknown command THROWS — one door, spelled right',
      (function () { try { EN.command(eng, 'porv_stik', true); return false; }
                     catch (e) { return /unknown command/.test(e.message); } })(), '');

  /* ---- 2b. A MANUAL SCRAM IS A REACTOR TRIP -------------------------------------------------
   * Both checks REDDED on the pre-fix build (measured 2026-08-19): 'scram' bypassed the RPS
   * (scrammed stayed false, cause null), the turbine kept pulling 100 MWe from a 2 % core, the
   * -240 F/min cooldown drained the pressurizer at 1724 psia and the plant NaN'd at t=54.5 s
   * (#499 thread). Sources: manual trip = Ginna TS Bases B 3.3.1 Fn 1 (ML20339A221); turbine
   * trip on reactor trip = Ginna UFSAR ch15 (ML20339A101), "zero delay is assumed". */
  head('THE PUSHBUTTON  [a manual scram latches the RPS and trips the turbine]');
  EN.command(eng, 'scram', true);
  var tsS = run(eng, 10);
  ckT('scram latches the RPS (cause: manual) and the turbine trips with it, zero delay',
      tsS.scrammed === true && eng.pt.trip_cause === 'manual' &&
      tsS.turbine_tripped === true && tsS.rod_steps === 0,
      'cause ' + eng.pt.trip_cause + ', turbine_tripped ' + tsS.turbine_tripped +
      ', rods ' + tsS.rod_steps);
  tsS = run(eng, quiet ? 120 : 240);
  ckT('...and the tripped plant rides to no-load on the steam dumps, finite',
      isFinite(tsS.pressure_mpa) && tsS.power_pct < 1.0 &&
      Math.abs((tsS.tavg_c * 1.8 + 32) - 557) < 6,
      'Tavg ' + (tsS.tavg_c * 1.8 + 32).toFixed(1) + ' degF vs no-load 557, power ' +
      tsS.power_pct.toFixed(2) + ' %, P ' + (tsS.pressure_mpa * 145.04).toFixed(0) + ' psia');

  /* ---- 1c. THE QUIET WIRES (#502 follow-through) --------------------------------------------
   * Three group-A mutations went BLIND the day the IC settled: the relief sink, the
   * level-controller charging hook and the dump-to-relief wire were only ever exercised by
   * the STARTUP RING — the defect's own transient was doing the gate's sensing. A settled
   * plant never lifts a relief, never corrects level, never opens a dump in these rides, so
   * each wire gets a deliberate probe. Bands from a measured healthy/mutated A/B
   * (2026-08-21): dM -136 vs -11 kg · |dDemand| 0.074 vs 0.000 · dump 75.7 vs 0.0 %.
   * (This block's first landing was inside the FIRST grp('D') section — the group order in
   * this file is A, D, B, C, D — where the three grp('A')-scoped replays never ran it and
   * they stayed blind; the group tag on the mutation and the block hosting its probe have
   * to agree, and the blind count is what says so.) */
  head('THE QUIET WIRES  [relief sink, level-to-charging, dump-to-relief — probed, not ridden]');
  var engQ1 = EN.createEngine({});
  run(engQ1, 30);
  var mQ0 = engQ1.sys.M_total;
  EN.command(engQ1, 'porv_stick', true); EN.command(engQ1, 'porv_manual', true);   /* arm + lift */
  run(engQ1, 30);
  ckT('a stuck PORV takes REAL mass out of the loop (the relief sink is connected)',
      engQ1.sys.M_total - mQ0 < -80,
      'M_total ' + (engQ1.sys.M_total - mQ0).toFixed(1) + ' kg over 30 s (sink dropped: -11)');

  /* #563 item 5 — THE RELIEF DEBITS THE LOOP ONCE. The pressurizer removes the discharge
   * from its own regions at the discharge's enthalpy; the loop-side sink then removes the
   * refill mass at the HOT LEG's h. Booked at the discharge enthalpy instead, the energy
   * left twice: measured pre-fix, |residual + relief energy| = 1,062.7 MJ over 300 s of
   * hot-standby relief (post-fix 265.2 MJ — the h-basis audit's own flow-work term, see the
   * band note below). The ride is
   * HOT ZERO POWER on purpose — there the PORV passes ~2,750 kJ/kg steam against a
   * ~1,240 kJ/kg hot leg; at full power the two enthalpies nearly agree and the defect
   * (and this check) go blind. The claim: energy leaves the plant ONLY with the mass
   * that carries it, so the ledger residual must equal minus the relieved stream's own
   * energy. */
  var eaA = { heats: 0, sg: 0, srcOther: 0, pump: 0, heater: 0, spray: 0, surge: 0,
              reliefKg: 0, reliefE: 0, sinkN: 0, sinkAtHot: 0, sinkVsRelief_min: 1e9 };
  var eaRho = (RD.vtable && RD.vtable.rho_from_h) || W.rho_from_h;
  var eaEtot = function (e) {
    var E = 0, sy = e.sys;
    for (var ei = 0; ei < sy.nodes.length; ei++)
      E += sy.nodes[ei].V * eaRho(sy.nodes[ei].h, sy.P) * sy.nodes[ei].h;
    return E + (e.pz.m_stm || 0) * (e.pz.h_stm || 0) + (e.pz.m_sub || 0) * (e.pz.h_sub || 0) +
           (e.pz.m_sat || 0) * (e.pz.h_sat || 0);
  };
  var engEA = EN.createEngine({ initial_state: 'hot_zero_power' });
  run(engEA, 30);
  EN.command(engEA, 'porv_stick', true); EN.command(engEA, 'porv_manual', true);
  var eaPlant = S.stepPlant, eaPzStep = PZ.stepPressurizer;
  S.stepPlant = function (sy, dt, d) {
    var k; for (k in (d.heats || {})) eaA.heats += d.heats[k] * dt;
    eaA.sg += (d.sgDuty || 0) * dt;
    (d.sources || []).forEach(function (s) {
      if (s.node === 'hot_leg' && s.mdot < 0) {
        /* the wire half: the sink's booked h vs the hot leg's own, at call time */
        eaA.sinkN++;
        for (var ni = 0; ni < sy.nodes.length; ni++) {
          if (sy.nodes[ni].id === 'hot_leg') {
            if (s.h === sy.nodes[ni].h) eaA.sinkAtHot++;
            break;
          }
        }
      } else {
        eaA.srcOther += (s.mdot || 0) * (s.h || 0) * dt;
      }
    });
    var r = eaPlant(sy, dt, d);
    eaA.pump += (r.pumpWork_kW || 0) * dt;
    return r;
  };
  PZ.stepPressurizer = function (pz, sy, dt, d) {
    var r = eaPzStep(pz, sy, dt, d);
    eaA.heater += (r.heater_kW || 0) * dt;
    eaA.spray += ((r.spray_duty_kW || 0) + (r.aux_spray_duty_kW || 0)) * dt;
    eaA.surge += (r.surge_heat_kW || 0) * dt;
    eaA.reliefKg += (r.relief_kgs || 0) * dt;
    eaA.reliefE += (r.relief_kgs || 0) * (r.relief_h || 0) * dt;
    return r;
  };
  var eaE0 = eaEtot(engEA);
  try { run(engEA, 60); }
  finally { S.stepPlant = eaPlant; PZ.stepPressurizer = eaPzStep; }
  var eaAcc = eaA.heats - eaA.sg + eaA.srcOther + eaA.pump + eaA.heater - eaA.spray - eaA.surge;
  var eaResid = (eaEtot(engEA) - eaE0) - eaAcc;
  ckT('the relief sink is booked at the HOT LEG\'s own enthalpy, every push',
      eaA.sinkN > 100 && eaA.sinkAtHot === eaA.sinkN,
      eaA.sinkAtHot + ' of ' + eaA.sinkN + ' sink pushes at the hot leg\'s h — booked at the ' +
      'DISCHARGE h (~2,700 vs ~1,240 kJ/kg here) the discharge enthalpy leaves twice');
  /* the band carries the h-basis ledger's own flow-work term (sum m*h is not sum m*u, and this
   * ride drops P ~6 MPa across ~45 m3 — a ~200 MJ book-keeping term the audit cannot see), so
   * it is a COARSE guard: measured 145.1 MJ fixed vs 430.6 MJ double-debited on this exact
   * ride (2026-08-28). */
  ckT('the relief debits the loop ONCE — the ledger gap stays at the flow-work scale',
      eaA.reliefKg > 50 && Math.abs(eaResid + eaA.reliefE) < 250000,
      'residual ' + (eaResid / 1000).toFixed(1) + ' MJ vs -reliefE ' +
      (-eaA.reliefE / 1000).toFixed(1) + ' MJ (gap ' +
      (Math.abs(eaResid + eaA.reliefE) / 1000).toFixed(1) +
      ' MJ; fixed 145.1, double-debit 430.6), relief ' + eaA.reliefKg.toFixed(1) + ' kg');
  var engQ2 = EN.createEngine({});
  run(engQ2, 30);
  var cdQ0 = engQ2.cv.chargingDemand;
  EN.command(engQ2, 'letdown', 1.0);
  run(engQ2, 60);
  /* the note is NULL-SAFE on purpose: under the wire-cut mutation chargingDemand stays at
   * its construction value null, and a .toFixed on it THROWS — which aborts the replay with
   * every already-recorded check green, and the harness reads that as BLIND ("a crash counts
   * as caught" is only true when the crash lands before the first check records) */
  var cdFmt = function (v) { return v === null || v === undefined ? String(v) : v.toFixed(3); };
  ckT('the level controller MOVES charging when letdown drains the vessel (the hook exists)',
      engQ2.cv.chargingDemand !== null && cdQ0 !== null &&
      Math.abs(engQ2.cv.chargingDemand - cdQ0) > 0.03,
      'demand ' + cdFmt(cdQ0) + ' -> ' + cdFmt(engQ2.cv.chargingDemand) +
      ' — the claim is the WIRE, not the control law (that is run_pwr2_pressurizer\'s)');
  var engQ3 = EN.createEngine({});
  run(engQ3, 30);
  EN.command(engQ3, 'turbine_trip', true);
  var dumpQ = 0, steamQ = 0, tsQ = null;
  for (var q3 = 0; q3 < 30 / DT; q3++) {
    tsQ = EN.step(engQ3, DT);
    if (tsQ.steam_dump_valve_pct > dumpQ) dumpQ = tsQ.steam_dump_valve_pct;
    if (tsQ.steam_pressure_mpa > steamQ) steamQ = tsQ.steam_pressure_mpa;
  }
  ckT('a turbine trip OPENS the dumps — demand reaches the relief valves, steam stays bounded',
      dumpQ > 30 && steamQ < 7.75,
      'dump max ' + dumpQ.toFixed(1) + ' %, steam max ' + (steamQ * 145.04).toFixed(0) + ' psia');

  }

  if (grp('D')) {
  /* ---- 3. THE CALLER-HALF OF HR5 ------------------------------------------------------------ */
  head('THE CALLER\'S HALF  [the RPS reports; THIS file inserts the rods]');
  var eng2 = EN.createEngine({});
  run(eng2, quiet ? 60 : 120);
  EN.command(eng2, 'break_open', { area_m2: 0.004, node: 'cold_leg' });
  /* 30 s: the trip (lo_pzr 1775 psia) and SI (1715) both latch inside ~5 s on a 40 cm2 break —
   * the CALLER-HALF claim needs the latching window, not the endgame. Riding deeper finds a
   * REAL engine defect outside this gate's subject: with the FULL lineup (ECCS + CVCS fighting
   * the blowdown) the plant oscillates h between the envelope walls near-but-not-AT the floor
   * (~0.115 MPa) and NaNs at ~68 s — the #487 class at a pressure the beyond-model latch's
   * flooredLow condition cannot see. Filed as #499; not this gate's to fix. */
  var tsB = run(eng2, 30);
  ckT('a 40 cm2 break trips the plant and the FACADE scrams the rods, uncommanded',
      tsB.scrammed === true && tsB.rod_steps === 0 && eng2.pt.trip_cause !== null,
      'trip on ' + eng2.pt.trip_cause + ', rods ' + tsB.rod_steps + ' — pwr2_protection only ' +
      'reports; the caller half lived nowhere until this file');
  /* ⚠ #543's BACKPRESSURE WIRING, ASSERTED DIRECTLY (added #574). Two mutations that had been
   * caught for weeks — the frozen-constant backpressure and the severed containment stash —
   * went BLIND when the metal walls moved the ride's trajectory: they were only ever caught
   * incidentally, by trajectory checks that happened to diverge. That is the standing trap
   * about a NEIGHBOUR's change blinding a mutation, and the repair is not to restore the old
   * trajectory but to assert the WIRING, which no trajectory can take away.
   * The break sees LIVE containment pressure, one step behind, and containment is pressurising:
   * a frozen constant or a severed stash both fail this outright. */
  ckT('the break sees LIVE containment pressure, one step behind — not a frozen constant (#543)',
      eng2._ctP !== undefined && eng2._ctP > 0.1082 &&
      Math.abs(eng2._ctP - tsB.containment_pressure_mpa) < 1e-9,
      'stash ' + (eng2._ctP === undefined ? 'UNDEFINED' : eng2._ctP.toFixed(5)) +
      ' MPa against containment ' + tsB.containment_pressure_mpa.toFixed(5) +
      ', up from the 0.1082 initial condition — the coolant climbs a REAL gradient');
  /* ⚠ ONE STEP BEHIND, NOT EQUAL — the stash is a one-step-lag carrier by design, so the break
   * used the PREVIOUS step's containment pressure and an exact comparison fails by 8e-5. The
   * claim is that it used a LIVE one: far off the 0.1082 MPa default it falls back to, and
   * within a single step's containment rise of the current value. */
  ckT('...and the break ACTUALLY USED it — the stash reaching the door, not just existing',
      eng2._brkBackP !== undefined && eng2._brkBackP > 0.15 &&
      Math.abs(eng2._brkBackP - eng2._ctP) < 5e-3,
      'break discharged against ' +
      (eng2._brkBackP === undefined ? 'NOTHING' : eng2._brkBackP.toFixed(5)) + ' MPa, stash ' +
      eng2._ctP.toFixed(5) + ', default 0.10820 — a stash that is set and never passed is the ' +
      'dark wire again');

  /* ---- #543: THE BREAK SEES LIVE CONTAINMENT PRESSURE. Against the frozen 1.0 psig
   * constant, a sev-1 LOCA's containment passed RCS pressure at 995 s and the hole KEPT
   * FLOWING — 12,857 kg moved up a 19.6 psi adverse gradient by 1800 s. Coupled, the two
   * approach equilibrium and the gradient never inverts. The invariant is checked every
   * step because it is the effect, not the wire: both the reverted ternary and a severed
   * stash reproduce the adverse flow well inside this ride. ---- */
  var engBP = EN.createEngine({});
  run(engBP, quiet ? 10 : 30);
  EN.command(engBP, 'break_open', { area_m2: 0.002, node: 'cold_leg' });
  var bpN = Math.round(1200 / DT), bpAdverse = 0, bpWorst = 0, bpTs = null;   /* adverse hit at 995 s pre-fix */
  for (var bpI = 0; bpI < bpN; bpI++) {
    bpTs = EN.step(engBP, DT);
    var bpGap = bpTs.containment_pressure_mpa - bpTs.pressure_mpa;
    if (bpGap > 1e-6 && engBP.brk && bpTs.leak_flow > 0) {
      bpAdverse++;
      if (bpGap > bpWorst) bpWorst = bpGap;
    }
  }
  ckT('a full LOCA blowdown NEVER discharges up the pressure gradient (live backpressure)',
      bpAdverse === 0 && bpTs.containment_pressure_mpa > 0.5 &&
      bpTs.pressure_mpa >= bpTs.containment_pressure_mpa - 1e-6,
      bpAdverse + ' adverse-flow steps of ' + bpN + ' (worst +' +
      (bpWorst * 145.038).toFixed(1) + ' psi); ends RCS ' +
      (bpTs.pressure_mpa * 145.038).toFixed(1) + ' vs ctmt ' +
      (bpTs.containment_pressure_mpa * 145.038).toFixed(1) +
      ' psia — the frozen constant gave 88.0 vs 95.6 at 1200 s with the hole still flowing');
  ckT('...and the SI latch STARTS the ECCS lineup, uncommanded',
      eng2.pt.si === true && eng2.ec.hhsiRunning === true && eng2.ec.lhsiRunning === true,
      'SI on ' + eng2.pt.si_cause);
  ckT('...and the plant is finite through the latching window, ECCS answering',
      isFinite(tsB.pressure_mpa) && isFinite(tsB.fuel_temp_c) &&
      tsB.core_inventory_pct > 30,
      (tsB.pressure_mpa * 145.04).toFixed(0) + ' psia, inventory ' +
      tsB.core_inventory_pct.toFixed(1) + ' % at 30 s');
  /* #499 first instance, now GUARDED: ridden deeper, the near-floor h-oscillation (nodes
   * pinned on BOTH envelope walls at once) must latch beyond_model and hold — the pre-guard
   * build threw NaN out of pwr2_damage at t = 68.5 s. Measured post-guard: latches 46.9 s. */
  var latchA = false, threwA = null, qoxSeen = false, nonFiniteA = 0;
  try {
    for (var kk = 0; kk < 180 / DT; kk++) {
      /* ⚠ THE EMERGENCY INJECTION IS STOPPED FOR THIS RIDE (#518), and it has to be for the
       * check below to mean what it says. Until #518 this fixture reached the 0.1 MPa floor
       * WITH injection running — but that blowdown was a donor-cell transport instability, not
       * a plant running out of water, and once the ring sub-steps the injection does its job:
       * measured, the same break now sits at 62.9 psia and alive at 600 s. A latch check that
       * passed only because the transport was unstable was testing the defect, not the guard.
       * Stop the injection and the plant genuinely runs dry — latch at 171.8 s at the floor,
       * finite — so the guard is still reachable, still tested, and now for the right reason. */
      eng2.ec.hhsiRunning = false; eng2.ec.lhsiRunning = false;
      if (eng2.ec.acc) eng2.ec.acc.valve_open = false;
      tsB = EN.step(eng2, DT);
      /* EVERY STEP, not just the last (2026-08-28) — the filed defect's NaN appeared MID-RIDE
       * at 68.5 s, so an end-of-ride finiteness test could only ever see it by luck. */
      if (!isFinite(tsB.pressure_mpa) || !isFinite(tsB.fuel_temp_c)) nonFiniteA++;
      /* the oxidation WIRING's designed observable: once the damage layer reports heat, the
       * reactor must RECEIVE it next step (eng._Qox is that wire). Chaos used to catch the
       * zeroed-wire mutation incidentally; this sees it deterministically. */
      if (eng2.dm && eng2._Qox > 0) qoxSeen = true;
      if (eng2.sys.beyond_model) { latchA = true; break; }
    }
  } catch (eA) { threwA = eA.message; }
  ckT('...ridden deeper the plant DECLARES beyond-model and holds — no NaN (#499)',
      /* EITHER guard family may latch. Measured (2026-08-20g): since the RPS moved to
       * instruments this trajectory's escape is a KINETICS RUNAWAY (power 7.5e51 while every
       * node h sits inside the envelope — no clamp, no floor pin, so no inner latch), and the
       * facade screen is the guard family that covers it. A `!_dead` condition here asserted
       * inner-only and redded on the clean build. The guard MUTATIONS stay discriminated by
       * their other observables (maxStep pins the root-jump; the SI/finite checks move).
       * RE-MEASURED 2026-08-26 (#515 Build 3): the runaway was the two-phase moderator
       * REFERENCE (+6,400..6,800 pcm at 700 ppm) riding a thermodynamic event; with the
       * reference liquid the reactivity stays at -20,000 pcm and the INNER guard latches with
       * the blowdown at the 0.1 MPa floor (this fixture 199.6 s, P 14.5 psia; the facade probe
       * with a 120 s settle 79.6 s) — the latch stands, the family moved.
       * RE-MEASURED AGAIN 2026-08-26 (#518): that blowdown was the transport instability. With
       * the ring sub-stepped the plant no longer reaches the floor on injection at all (600 s,
       * 62.9 psia, alive), so the fixture now stops the injection above and latches at 171.8 s
       * on a plant that has actually run out of water. THE CHECK IS UNCHANGED — only the
       * condition it is asserted under, which is the point: the guard was never the defect. */
      /* RE-SCOPED 2026-08-28 (#543): the claim is NEVER NaN, NOT "latches by second 180".
       * This fixture BIFURCATES, and it is a cliff rather than a drift — perturbing the break
       * area by 1..16 ulp latches at exactly 160.0 s every time, and by 32 ulp the plant never
       * latches at all and stabilizes finite at 100.6 psia out to 900 s. A last-bit difference
       * therefore decides the BRANCH, which is why this passed here at 160.0 s and failed on
       * the CI runner (a different platform and Node build) at the full window with the plant
       * sitting finite at 110.9 psia — the other side of the same cliff. Neither branch is a
       * defect: one runs dry and says so, one equilibrates against a containment that is now
       * allowed to push back (that is #543's fix). What the filed defect DID do is go
       * non-finite mid-ride at 68.5 s, so finiteness at every step is the discriminating
       * claim and is strictly stronger than the old end-of-ride test. The latch MECHANISM is
       * pinned deterministically, with its own mutations, on hand-built fixtures in
       * run_pwr2_core — it does not need a chaotic full-plant ride to be tested. */
      threwA === null && nonFiniteA === 0 &&
      isFinite(tsB.pressure_mpa) && isFinite(tsB.fuel_temp_c),
      threwA ? ('THREW: ' + threwA.slice(0, 60)) :
      (nonFiniteA + ' non-finite steps; ' +
       (latchA ? 'latched at ' + tsB.sim_time_s.toFixed(1) + ' s' : 'stabilized, no latch') +
       ', P ' + (tsB.pressure_mpa * 145.04).toFixed(1) + ' psia — the pre-guard build went ' +
       'NaN out of pwr2_damage at 68.5 s, which is what this reds on'));
  ckT('...and the oxidation heat the damage layer reported REACHED the reactor on the way down',
      qoxSeen, 'eng._Qox > 0 observed during the ride — the wiring, seen directly');

  /* ---- 3c. THE RHR ALIGN, THROUGH THE PLANT (#507 wave 2) -----------------------------------
   * A 20 cm2 cold-leg break depressurizes below the sourced 425 psig suction permissive; the
   * align door opens the valve and the module's heats map MERGES into stepPlant (it used to
   * feed only true_state — an aligned system removed exactly zero heat, the Q4 orphan the
   * #458 ruling names). TRAJECTORY RE-MEASURED (#510 batch 1): with reverse SG transfer
   * signed instead of |Q|-removed, the hot secondary now SLOWS the blowdown — real
   * small-break physics — so the permissive crossing moved ~74 s → 187.5 s. Measured A/B at
   * t = 200.0 s: aligned tavg 205.7 degC vs secured 257.0 — the 51 degC gap is the wiring,
   * and the pinned band below is what the merge-dropped mutation reds against (its
   * removed_kJ ledger still climbs; only the PLANT tells the truth). */
  head('THE RHR ALIGN  [below the 425 psig permissive, the heat actually leaves the loop]');
  var engR = EN.createEngine({});
  run(engR, 10);
  /* ISOLATE THE ACCUMULATOR FIRST (#511) — the sourced cooldown step (Ginna TS Bases
   * B 3.5.1: the isolation valves are closed for "RCS cooldown and depressurization
   * without discharging the accumulators"). Left open, the tank dumps into this fixture's
   * blowdown at ~650 psig, re-pressurizes the loop and breaks the alignment — which is
   * EXACTLY why the real procedure closes it, so the fixture does what the operator does.
   * The engine door is used directly: at this point the fixture is still >1600 psig and
   * the shell's administrative lock would (correctly) refuse the shell command. */
  engR.ec.acc.valve_open = false;
  EN.command(engR, 'break_open', { area_m2: 0.002, node: 'cold_leg' });
  var tsR = null, tR = 0, alignedR = false;
  while (tR < 200.001) {
    tsR = EN.step(engR, DT); tR += DT;
    /* RETRY until the valve lands (#510 M-2): the door reads the INDICATED channel now,
     * which lags ~0.5 s behind a fast blowdown — a one-shot command exactly at the true
     * 420 psig crossing met an indicated ~425 and was silently refused for ever. An
     * operator holds the switch; so does the probe. */
    if (!alignedR && (engR.sys.P * 145.038 - 14.7) < 420) {
      EN.command(engR, 'rhr_align', true); alignedR = engR.rh.valve_open === true;
    }
    if (engR.sys.beyond_model) break;
  }
  ckT('aligned below the permissive: valve open, mode rhr, real energy removed, plant COOLER',
      alignedR && engR.rh.valve_open === true && tsR.eccs_mode === 'rhr' &&
      engR.rh.removed_kJ > 50000 && tsR.tavg_c < 230,
      'tavg ' + tsR.tavg_c.toFixed(1) + ' degC at t=200 (secured measures 257.0), removed ' +
      (engR.rh.removed_kJ / 1000).toFixed(0) + ' MJ, mode ' + tsR.eccs_mode);
  /* the door refuses an at-power align (the 425 psig permissive), and the autoclose is the
   * valve hardware: a valve forced open above 585 psig shuts on the next step */
  var engR2 = EN.createEngine({});
  run(engR2, 2);
  EN.command(engR2, 'rhr_align', true);
  var refusedAtPower = engR2.rh.valve_open === false;
  engR2.rh.valve_open = true;
  EN.step(engR2, DT);
  ckT('the door refuses an at-power align, and the 585 psig autoclose shuts a forced valve',
      refusedAtPower && engR2.rh.valve_open === false,
      'align at ~2220 psig refused (permissive 425); forced-open valve autoclosed in one step');

  }

  if (grp('B')) {
  /* ---- 2c. P-9 THROUGH THE DOOR --------------------------------------------------------------
   * The setpoint logic (50 %/8 % by dump availability, the no-trip band) is gated at the
   * protection layer's own gate; THIS check is the wiring claim — turbine_tripped and dump
   * availability actually reach the RPS from the facade. */
  head('P-9 THROUGH THE DOOR  [a commanded turbine trip at power IS a reactor trip]');
  var eng4 = EN.createEngine({});
  run(eng4, quiet ? 60 : 120);   /* the boron/xenon regime settle. (An older note here said
                                  * the margin check needed this to ride OUT the startup ring
                                  * — margin 0.013 at t = 5 s; since #502 the IC opens on its
                                  * split and the margin reads ~0.31 from the first seconds) */
  /* the delta-T pair's WIRING half (their setpoint logic is run_pwr2_protection's): the
   * facade computes delta_t_frac and tavg_c, so the rows must be AVAILABLE with a sane
   * at-power margin — measured 0.305 at the settled design point, ~0.29 this early. */
  var fRep = null;
  eng4.rpsReport.functions.forEach(function (f) { if (f.id === 'ot_delta_t') fRep = f; });
  /* the NOTE tolerates an unavailable row (#510 LOW): with the delta-T wire cut the row
   * reads available:false and margin undefined — the old note's .toFixed(3) THREW while
   * formatting, so the wire-cut mutation was "caught" by a TypeError with zero checks
   * recorded instead of by THIS check going red (the 2026-08-21 note-string crash class,
   * back for a second visit) */
  ckT('overtemperature delta-T is LIVE through the facade wiring, margin at power ~0.3',
      fRep !== null && fRep.available === true &&
      typeof fRep.margin === 'number' && fRep.margin > 0.15 && fRep.margin < 0.45,
      fRep === null ? 'row missing'
        : fRep.margin === undefined ? ('available ' + fRep.available + ', margin undefined')
        : ('margin ' + fRep.margin.toFixed(3)));

  EN.command(eng4, 'turbine_trip', true);
  var ts4 = run(eng4, 5);
  ckT('the turbine trip reaches the RPS and the reactor trips with it (TS Bases B 3.3.1 Fn 14)',
      ts4.scrammed === true && eng4.pt.trip_cause === 'turbine_trip',
      'cause ' + eng4.pt.trip_cause + ', scrammed ' + ts4.scrammed);
  /* ---- 2d. HARD RULE 1'S PAYOFF: THE RPS BELIEVES THE INSTRUMENTS ---------------------------
   * Fail the pressure channel LOW on a HEALTHY plant: the RPS must trip and inject on the
   * lying channel (measured: lo_pzr_press + SI within seconds, true pressure untouched at
   * ~2224 psia until the trip's own contraction moves it). To test an HR1 wiring you have to
   * FAIL the channel — a healthy instrument is indistinguishable from truth (#220's lesson,
   * and the reads-truth mutation is exactly the wiring this check exists to red). */
  head('THE LYING CHANNEL  [a failed-low pressure channel trips a healthy plant]');
  /* a FRESH plant — eng4 is post-trip by now, and this check's whole point is that the
   * PLANT is healthy while the channel lies */
  var eng5 = EN.createEngine({});
  run(eng5, quiet ? 20 : 60);
  /* THE LADDER'S WIRE, probed with a HIGH lie. A LOW lie cannot discriminate whenever true
   * pressure sits at or below the setpoint — the truth-fed ladder has the heaters
   * legitimately full there too, which kept the wire-cut mutation blind through two fixture
   * attempts (originally via the startup dip's ~330 s at −72 psi; the settled IC (#502)
   * still parks a few psi under the setpoint, so the asymmetry stands). Spray and the PORV
   * answer only a HIGH error: on the lie they open; on truth they cannot. */
  EN.command(eng5, 'instrument_fail', { id: 'primary_pressure', mode: 'high' });
  var tsH = run(eng5, 1);
  ckT('...and SPRAY + PORV open on a HIGH lie, pre-trip (the ladder reads the instrument)',
      tsH.spray_flow_pct > 50 && tsH.porv_open === true,
      'spray ' + tsH.spray_flow_pct.toFixed(0) + ' %, PORV ' + tsH.porv_open +
      ' — true P below the setpoint the whole time');
  EN.command(eng5, 'instrument_restore', 'primary_pressure');
  EN.command(eng5, 'reset_protection', true);   /* hi_pzr may have latched on the railed lie */
  run(eng5, quiet ? 5 : 10);
  var trueP = eng5.sys.P;
  EN.command(eng5, 'instrument_fail', { id: 'primary_pressure', mode: 'low' });
  run(eng5, 10);
  ckT('the RPS trips and injects on the LYING channel, the plant itself healthy',
      eng5.pt.reactor_trip === true && eng5.pt.trip_cause === 'lo_pzr_press' &&
      eng5.pt.si === true && trueP > 14.5,
      'cause ' + eng5.pt.trip_cause + ', SI ' + eng5.pt.si + ', true P was ' +
      (trueP * 145.04).toFixed(0) + ' psia when the channel failed');

  /* the DUMP side of the switchover: a lying-high Tavg opens the dumps on a healthy plant —
   * and the common-mode tail is DECLARED, not hidden: the same lumped channel feeds OTdT,
   * whose setpoint collapses on the railed reading, so the plant also trips (the TS Bases'
   * own control/protection-interaction discussion; a real plant's 2/4 channel logic keeps a
   * single failure from doing this, and this model has one lumped channel per parameter). */
  /* The dump controller's wire, seen through a STUCK channel — measured: a fail-high lie
   * cannot discriminate here (OTdT trips on the same railed channel within 2 s and the C-8
   * controller then opens the dumps with or without the Tavg wire; the pre-trip window is
   * shorter than C-7's arming). A STUCK channel through a turbine trip is the clean case:
   * C-8 chases the stuck 578 degF reading and drags the TRUE plant to 406 degF — 150 degF
   * past the no-load program, an instrument-driven overcooling casualty — where the wire-cut
   * mutant walks honestly to ~555 and closes the dumps. */
  var eng6 = EN.createEngine({});
  run(eng6, quiet ? 20 : 60);
  EN.command(eng6, 'instrument_fail', { id: 'tavg', mode: 'stuck' });
  EN.command(eng6, 'turbine_trip', true);
  var ts6 = run(eng6, quiet ? 180 : 240);
  ckT('a STUCK Tavg channel makes the dumps OVERCOOL the true plant far past the program',
      (ts6.tavg_c * 1.8 + 32) < 500 && ts6.steam_dump_valve_pct > 30,
      'true Tavg ' + (ts6.tavg_c * 1.8 + 32).toFixed(1) + ' degF vs the 557 program, dumps ' +
      ts6.steam_dump_valve_pct.toFixed(0) + ' % chasing a reading stuck at ' +
      (eng6.ins.reading.tavg * 1.8 + 32).toFixed(1));

  }

  if (grp('C')) {
  /* ---- 2e. THE RUNBACK AND THE ROD STOP (ch7 sec 7.2.3.2.1, the full sourced loop) ---------
   * A quasi-static dilution (-1 ppm per 5 s of the CVCS's own boron field — a STEP of any
   * size prompt-jumps power into the hi-flux trip, measured at -15 ppm already) walks the
   * OTdT margin into the 3 % band at ~+193 s. Then the sourced sequence: the runback nibbles
   * the turbine, the rod stop refuses OUTWARD motion, the operator's "appropriate
   * adjustments" (rods IN — always allowed) recover the margin, the signal clears, and NO
   * trip comes. Measured plant identity, recorded: WITHOUT the operator, this rods-MANUAL
   * plant trips ~51 s after onset anyway — the runback's load cut raises Tavg ~1.1 degF/MWe
   * (the load-follow character) and erodes the setpoint via K3 faster than the delta-T term
   * recovers. The runback buys the operator TIME on this plant; it does not buy an
   * equilibrium. That is the source's own framing, measured. */
  head('THE RUNBACK  [3 % from the OTdT trip: nibble the turbine, hold the rods, no trip]');
  var eng7 = EN.createEngine({});
  run(eng7, quiet ? 30 : 60);
  var onset7 = false, ts7 = null;
  for (var d7 = 0; d7 < 120 && !onset7; d7++) {
    eng7.cv.boron_ppm -= 1;         /* quasi-static: -1 ppm per 2.5 s. The old -2 ppm block
                                     * overshot the 3 % band WITHIN the detection block, so
                                     * the signal asserted with the OTdT margin already at
                                     * ~0 — on the settled IC (#502) that standing condition
                                     * matured its trip delay during the rod-stop test below,
                                     * which is a statement about the SCRIPT's dilution rate,
                                     * not the plant (a bigger step prompt-jumps power toward
                                     * the hi-flux trip; a finer one enters the band with the
                                     * margin the band is FOR) */
    for (var k7 = 0; k7 < 2.5 / DT; k7++) {
      ts7 = EN.step(eng7, DT);
      if (ts7.runback_signal) { onset7 = true; break; }
    }
  }
  ckT('the approach signal asserts on a slow dilution, before any trip',
      onset7 && ts7.scrammed === false, 'after ' + d7 + ' ppm of dilution');
  /* TIMING [measured]: with no operator action this rods-MANUAL plant trips within about a
   * minute of onset (the runback's load cut RAISES Tavg ~1.1 degF/MWe — the load-follow
   * character — and erodes the setpoint via K3 faster than the delta-T term recovers; the
   * runback buys TIME here, not an equilibrium). So: rod-stop test in the first ~3 s,
   * rods-in right after. */
  EN.command(eng7, 'rod_target', bank() - 1);    /* one step IN from full out */
  run(eng7, 2);                                  /* inward: always allowed */
  var rodsIn = eng7.rodSteps;
  /* OUTWARD IS REFUSED — and since #572 it is refused OUT LOUD, at the door, rather than
   * silently clamped in the step block. The check's claim is unchanged and its name was always
   * "refused"; what changed is that the plant now says so. Before, this command returned
   * normally and the rods simply did not move, which is the accepted-then-discarded shape
   * #545/#558 spent two days removing everywhere else. */
  var thr7 = null;
  try { EN.command(eng7, 'rod_target', bank()); } catch (e7x) { thr7 = e7x.message; }
  run(eng7, 1);                                  /* one second shows zero motion; three bought
                                                  * nothing but trip-delay maturity */
  ckT('the ROD STOP: inward moves, outward is REFUSED BY NAME while the signal stands',
      rodsIn < bank() - 0.5 && eng7.rodSteps <= rodsIn + 1e-9 &&
      thr7 !== null && /ROD WITHDRAWAL BLOCKED/.test(thr7) &&
      /Inward motion is still available/.test(thr7),
      'in to ' + rodsIn.toFixed(1) + ', then held at ' + eng7.rodSteps.toFixed(1) +
      '; refusal: ' + (thr7 ? thr7.slice(22, 80) : 'NONE — accepted silently'));
  /* the operator's half [sourced: "appropriate adjustments"]: rods IN, at FAST, 18 steps.
   * Re-scripted with the two-bank build (#506.3): the control bank now carries its real
   * 4068 pcm worth — HALF the old lumped 8000 — so the pre-#506 "12 steps at the old
   * always-fast rate" buys half the reactivity and (measured, dt 0.02 only) the standing
   * OTdT condition matured its delay before the margin recovered. Same physical action,
   * real units: FAST (the sourced 72 steps/min class — what an operator staring at an
   * approach alarm selects) and ~2x the steps for the same pcm. Measured: clears at
   * +6.3 s (dt 0.02) / +2.8 s (0.05), no trip, both dt values. */
  var load0 = eng7.tb.load_target_mwe;
  EN.command(eng7, 'rod_speed', 'fast');
  EN.command(eng7, 'rod_target', 182);
  var clear7 = false, trip7 = false, minLoad7 = 1e9;
  for (k7 = 0; k7 < (quiet ? 120 : 240) / DT; k7++) {
    ts7 = EN.step(eng7, DT);
    if (eng7.tb.load_target_mwe < minLoad7) minLoad7 = eng7.tb.load_target_mwe;
    if (!ts7.runback_signal) clear7 = true;
    if (ts7.scrammed) { trip7 = true; break; }
  }
  ckT('the RUNBACK nibbled the turbine: 200 %/min for 1.5 s per 30 s window',
      minLoad7 <= 100 - 4,
      '100 -> ' + minLoad7.toFixed(1) + ' MWe (load0 at rods-in ' + load0.toFixed(1) + ')');
  ckT('rods in + the runback recover the margin: the signal CLEARS and no trip comes',
      clear7 && !trip7,
      'the sourced purpose verbatim: "gives the operator the opportunity to make ' +
      'appropriate adjustments before a reactor trip occurs"');

  }

  if (grp('D')) {
  /* ---- 3b. THE DRAIN ROOT-JUMP (#499 second instance) ---------------------------------------
   * The pre-fix facade let a scram leave the turbine loaded; the -240 F/min cooldown drained
   * the pressurizer at 54 kg/s and ONE step teleported the solve 1724 -> 2611 psia (surge
   * +20,085 kg/s). The facade fix makes that unreachable through the door, so this fixture
   * FORCES the pre-fix wiring (tb.tripped = false every step) to keep the trajectory reachable
   * — the subject is pwr2_core's root-tracking limit, which must REFUSE the far root and
   * declare beyond_model. maxStep pins the teleport itself: with the limit deleted, some step
   * moves > 2 MPa whether or not a later latch fires. */
  head('THE DRAIN ROOT-JUMP  [a vanished near root is declared, never adopted]');
  var eng3 = EN.createEngine({});
  run(eng3, 36);
  EN.command(eng3, 'scram', true);
  var latch3 = false, threw3 = null, ts3 = null, maxStep = 0, Pp3 = eng3.sys.P;
  try {
    for (kk = 0; kk < 120 / DT; kk++) {
      eng3.tb.tripped = false;                 /* the PRE-FIX wiring, forced */
      ts3 = EN.step(eng3, DT);
      var d3 = Math.abs(eng3.sys.P - Pp3); if (d3 > maxStep) maxStep = d3;
      Pp3 = eng3.sys.P;
      if (eng3.sys.beyond_model) { latch3 = true; break; }
    }
  } catch (e3) { threw3 = e3.message; }
  /* REFIT 2026-08-25 (#515, the two-region pressurizer): the near root no longer VANISHES on
   * this drain — the equilibrium vessel's vapour-dominated projection collapsed its
   * compliance at ~9 % level; the two-region seat's regimes are continuous (measured: latched
   * false, max |dP|/step 0.038 MPa, P 1037 psia at 120 s). The core's root-tracking guard keeps
   * its own unit test (run_pwr2_core, the hand-built root jump); THIS fixture's claim is now
   * representability under the drain: finite, no throw, no step near P_JUMP_MAX. The old
   * clause `latch3` is reported, not asserted. */
  ckT('a fast drain rides FINITE and representable — never teleported (max |dP|/step < 2.0), no throw',
      threw3 === null && maxStep < 2.0 &&
      ts3 !== null && isFinite(ts3.pressure_mpa) && ts3.power_pct < 500,
      threw3 ? ('THREW: ' + threw3.slice(0, 60)) :
      ('latched ' + latch3 + ' (reported), max |dP|/step ' + maxStep.toFixed(3) + ' MPa, P ' +
       (ts3 === null ? '?' : (ts3.pressure_mpa * 145.04).toFixed(0)) + ' psia'));

  /* ---- THE HOLD IS THE WHOLE PLANT (#585, owner-ruled 2026-08-29) --------------------------
   * Once beyond_model latches, the facade must stop stepping EVERY subsystem — before this,
   * only the primary froze while the 19-system ladder kept its own clocks: the break booked
   * ~49 kg/s into containment out of nothing, and AFW went on feeding a frozen plant (measured
   * on this ride with the short-circuit reverted: +18 kg of delivered_kg in 10 held seconds —
   * AFW is the ONE ledger only the facade guard protects, since break/ECCS carry their own
   * held-plant doors and the containment intake rides dt_accepted). Clock still runs; the
   * held snapshot stays stamped. */
  var engH = EN.createEngine({});
  EN.command(engH, 'break_open', { area_m2: 0.008, node: 'cold_leg' });
  var tsH = null, tH = 0;
  while (tH < 300) { tsH = EN.step(engH, DT); tH += DT; if (tsH.model_held) break; }
  var hDis = engH.brk.discharged_kg, hCtm = engH.ctm.mass_in_kg, hAfw = engH.aw.delivered_kg,
      hAcc = engH.ec.acc.water_m3, hM = engH.sys.M_total, hSim = engH.simTime;
  for (var hh = 0; hh < 500; hh++) tsH = EN.step(engH, DT);
  var hDrift = Math.max(
    Math.abs(engH.brk.discharged_kg - hDis), Math.abs(engH.ctm.mass_in_kg - hCtm),
    Math.abs(engH.aw.delivered_kg - hAfw), Math.abs(engH.ec.acc.water_m3 - hAcc),
    Math.abs(engH.sys.M_total - hM));
  ckT('a latched plant is held WHOLE: 500 more steps move no ledger, and the clock still runs',
      tsH !== null && tsH.model_held === true && hDrift === 0 &&
      Math.abs(engH.simTime - hSim - 500 * DT) < 1e-9,
      'latched t=' + tH.toFixed(1) + ' s; max ledger drift ' + hDrift.toFixed(6) +
      ' kg over 10 held s (break, containment, AFW, accumulator, M_total) — exact zero required');
  }

  if (grp('E')) {
  /* ---- 4. THE AFW STARTS (2026-08-20) — protection latch to pump to SG water ---------------
   * The layer gate proves the latches; THIS section proves the caller's half: the latch starts
   * the real pumps, the pumps' water reaches the real SG, and the operator's switches obey the
   * latch discipline. The lying-gauge route is the only one that can reach lo-lo today — the
   * feed ≡ steam construction freezes true SG mass, a DECLARED gap the feed-train work order
   * owns — which is also why it is the right probe: HR1's both-ways payoff, same as eng5. */
  head('THE AFW STARTS  [a lying gauge starts real pumps; the cold water is real water]');
  var eng8 = EN.createEngine({});
  run(eng8, quiet ? 20 : 60);
  ckT('settled: both pumps secured, nothing latched',
      eng8.aw.mdafwRunning === false && eng8.aw.tdafwRunning === false &&
      eng8.pt.afas_mdafw === false && eng8.pt.afas_tdafw === false, '');
  var sgM0 = eng8.sg.mass;
  EN.command(eng8, 'instrument_fail', { id: 'sg_level', mode: 'low' });
  var ts8 = run(eng8, 5);
  ckT('a failed-LOW SG level channel starts BOTH pumps and trips the reactor, all on the lie',
      eng8.aw.mdafwRunning === true && eng8.aw.tdafwRunning === true &&
      eng8.pt.reactor_trip === true && eng8.pt.trip_cause === 'sg_lolo_level' &&
      ts8.afw_pump_running === true && ts8.afw_flow_normalized > 0.99,
      'cause ' + eng8.pt.trip_cause + ', flow ' + ts8.afw_flow_normalized.toFixed(2) +
      ', true level was healthy the whole time');
  /* isolate MAIN feed for the mass window: since the feed train landed (2026-08-21) the
   * three-element controller believes the same lying gauge and drives the valve full open —
   * measured +11,558 kg in 60 s with main feed swamping the AFW term this check names.
   * (That response is itself correct physics — the controller-believes-the-lie payoff.) */
  EN.command(eng8, 'isolate_feedwater', true);
  /* 5 pump taus: the valve was RAILED open on the lie (capacity 1.2 = 198 kg/s), and a 20 s
   * drain left a ~130 kg decaying tail inside the window — measured as "AFW delivered 440
   * of 326". The tail is the module's own 8 s lag working; the fixture just has to outwait it. */
  run(eng8, 40);
  var sgMafter5 = eng8.sg.mass, steamKg = 0, ts8x = null;
  for (var k8 = 0; k8 < 60 / DT; k8++) {
    ts8x = EN.step(eng8, DT);
    steamKg += (ts8x.steam_out_total || 0) * eng8.rated_steam * DT;   /* the dump draw */
  }
  var dM60 = eng8.sg.mass - sgMafter5;
  EN.command(eng8, 'isolate_feedwater', false);
  /* rated AFW: (170 + 340) gpm x 300/1775 = 86.2 gpm = 5.44 kg/s -> ~326 kg in 60 s. The
   * window measures NET mass, and post-trip the dumps still draw (measured +144 net under
   * ~180 kg of dump steam), so the AFW term is net + steam — asserted directly. */
  ckT('...and the AFW water is REAL: net mass + the dump draw equals the rated delivery',
      Math.abs(dM60 + steamKg - 326) < 60,
      'net +' + dM60.toFixed(0) + ' kg, dumps drew ' + steamKg.toFixed(0) +
      ' kg -> AFW delivered ~' + (dM60 + steamKg).toFixed(0) + ' of ~326 expected');
  EN.command(eng8, 'afw', false);
  run(eng8, 1);
  ckT('the operator CANNOT secure an actuated pump while the latch stands',
      eng8.aw.mdafwRunning === true, 'the level-held SI pattern, same law');
  EN.command(eng8, 'instrument_restore', 'sg_level');
  run(eng8, quiet ? 5 : 10);
  /* RE-POINTED at #512 (per-system resets): reset_protection is TRIP-ONLY now — the AFW
   * start latches clear through their own door, reset_afas, which the shell's securing
   * click drives behind the sourced 45-60 s permissive. Driven directly here (this is the
   * engine gate; the permissive is the shell's) — the CLAIM is unchanged: clearing a
   * latch is not securing a pump. */
  EN.command(eng8, 'reset_afas', true);
  run(eng8, 1);
  ckT('reset_afas clears the start latches but does NOT secure the pumps',
      eng8.pt.afas_mdafw === false && eng8.pt.afas_tdafw === false &&
      eng8.aw.mdafwRunning === true && eng8.aw.tdafwRunning === true,
      'clearing a latch is not securing a pump');
  EN.command(eng8, 'afw', false);
  var threwT = null;
  try { EN.command(eng8, 'afw_tdafw', false); } catch (eT) { threwT = eT.message; }
  var ts8b = run(eng8, 5);
  /* THIS CHECK PROVED THE WRONG LAYER FOR MONTHS (#541). It drives the FACADE doors `afw` and
   * `afw_tdafw` directly and passed green — while pwr2_shell exposed only the first, so
   * `afw_tdafw` was in NO registry and `applyCommand` threw "unknown action". The board's one
   * AFW panel sent `set_afw`, which returned {ok:true}, cleared both actuation latches and
   * secured only the motor-driven pump: measured on a loss of offsite power, the generator held
   * 52,643 lbm (186.8 % of nominal) an hour AFTER the operator pressed STOP, run lamp lit. A
   * green check on a control the player does not have — CLAUDE.md's trap 4 exactly.
   *
   * It stays HERE because the facade doors are this gate's subject, but the claim is narrowed
   * to what an engine-direct fixture can honestly make: the two doors exist and each secures
   * its own pump. THE REACHABILITY CLAIM IS run_pwr2_shell's, where the shell's registry is,
   * and it is asserted there against `set_afw {pump}`. Do not re-broaden this wording. */
  ckT('...then each pump\'s own FACADE DOOR secures it (TS Bases: one switch per pump). ' +
      'REACHABILITY through the shell is run_pwr2_shell\'s claim, not this one — #541',
      threwT === null && eng8.aw.mdafwRunning === false && eng8.aw.tdafwRunning === false &&
      ts8b.afw_pump_running === false && eng8.pt.afas_mdafw === false,
      threwT ? ('THREW: ' + threwT.slice(0, 60)) : 'secured, and no re-latch on the healed gauge');
  /* SI's start, through the facade: the eng5 lying-pressure casualty gains its sourced AFW leg */
  var eng9 = EN.createEngine({});
  run(eng9, quiet ? 20 : 40);
  EN.command(eng9, 'instrument_fail', { id: 'primary_pressure', mode: 'low' });
  run(eng9, 10);
  ckT('a safety injection starts the motor-driven pump ONLY (ch10\'s distinction, kept)',
      eng9.pt.si === true && eng9.aw.mdafwRunning === true && eng9.aw.tdafwRunning === false,
      'si ' + eng9.pt.si + ', mdafw ' + eng9.aw.mdafwRunning + ', tdafw ' + eng9.aw.tdafwRunning);
  /* ...and the same SI, held the sourced 32 s, ISOLATES main feed (Table 15.0-6; the delay
   * itself is pinned at the module gate — here the WIRE) */
  run(eng9, 40);
  ckT('...and the held SI isolates main feedwater through the facade wire',
      eng9.fw.isolated === true && eng9.fw.feed_frac < 0.05,
      'isolated ' + eng9.fw.isolated + ', delivered ' + eng9.fw.feed_frac.toFixed(3));
  }

  if (grp('F')) {
  /* ---- 5. THE FEED TRAIN (2026-08-21) — feed ≡ steam retired, the casualties end to end ----
   * The R6 arc: real feed dynamics move the TRUE mass ledger. Rides are long because a
   * boil-down is long; the quiet replays shorten the settle, not the casualty. */
  head('THE FEED TRAIN  [the mass ledger is finally driven; the feed casualties run whole]');
  var engA = EN.createEngine({});
  var tsA = run(engA, SETTLE);
  ckT('the three-element controller HOLDS the ruled 65 % program at power',
      Math.abs(tsA.sg_level_pct - 65) < 3 && Math.abs(tsA.fw_flow_normalized - 1.0) < 0.06 &&
      engA.fw.valve > 0.6 && engA.fw.valve < 1.0,
      'level ' + tsA.sg_level_pct.toFixed(1) + ' %, fw ' + tsA.fw_flow_normalized.toFixed(2) +
      ', valve ' + engA.fw.valve.toFixed(2));
  /* THE LOAD SWING — the exact A/B ride (100 -> 70 MWe). The TRUE level must transient and
   * return: the R6 divergence PWR2 used to suppress by construction. */
  EN.command(engA, 'load_mwe', 70);
  var lmin = 100, lmax = 0, tsw = null;
  for (var kf = 0; kf < (quiet ? 300 : 600) / DT; kf++) {
    tsw = EN.step(engA, DT);
    if (tsw.sg_level_pct < lmin) lmin = tsw.sg_level_pct;
    if (tsw.sg_level_pct > lmax) lmax = tsw.sg_level_pct;
  }
  /* ⚠ THE FLOOR WAS RE-ANCHORED AT #516 item 2 (2026-08-29) AND THE REASON MATTERS. It was
   * `> 3`, fitted to a feed controller whose flow loop was a pure INTEGRATOR — the module
   * header says the source gives two PI controllers and only the integral half of the second
   * was built. Building the proportional half is what a three-element controller is FOR, and a
   * tighter flow loop means a SMALLER level excursion on a load change. Measured both ways on
   * the same ride: kp_flow 0 spans 3.56 points, kp_flow 1.6 spans 1.95, and BOTH settle at
   * 64.5 %.
   *
   * So this is a re-anchor, not a refit, and the distinction is testable: the CLAIM here has
   * always been that the true level TRANSIENTS AND RETURNS rather than reading the flat line
   * `feed ≡ steam` produced (that was ~0 points). `> 1.2` passes on the OLD build and the NEW
   * one and still fails a flat line — which is what makes it a better check than the number it
   * replaces, since `> 3` would have RED-flagged a controller improvement. */
  ckT('a 30 MWe swing moves the TRUE level and the controller brings it home (not the flat ' +
      'line feed ≡ steam read; > 1.2 pts passes both the pure-I and the PI flow controller)',
      (lmax - lmin) > 1.2 && Math.abs(tsw.sg_level_pct - 65) < 4,
      'range ' + lmin.toFixed(1) + '-' + lmax.toFixed(1) + ' %, settled ' +
      tsw.sg_level_pct.toFixed(1) + ' — feed ≡ steam read a flat line here');
  /* ONE PUMP: the ch10 60 % ceiling against 100 % steaming — a real boil-down to the lo-lo
   * bistable, the trip + both AFW starts arriving on PHYSICS for the first time (until now
   * only a lying gauge could reach 17 %). */
  var engB = EN.createEngine({});
  run(engB, SETTLE);
  EN.command(engB, 'feed_pump_a', false);
  var tTripB = null, tsB = null;
  for (var kb = 0; kb < 200 / DT; kb++) {
    tsB = EN.step(engB, DT);
    if (tTripB === null && engB.pt.reactor_trip) { tTripB = kb * DT; }
  }
  ckT('one feed pump at full power boils the SG down to a REAL lo-lo trip + both AFW starts',
      tTripB !== null && engB.pt.trip_cause === 'sg_lolo_level' &&
      engB.pt.afas_mdafw === true && engB.aw.mdafwRunning === true &&
      engB.aw.tdafwRunning === true,
      'trip at ' + (tTripB === null ? 'never' : tTripB.toFixed(1) + ' s') + ' (measured 97.6 s ' +
      'from the settled plant), cause ' + engB.pt.trip_cause);
  run(engB, quiet ? 100 : 200);
  ckT('...and the recovery does NOT overfill — the anti-windup pair holds the refill honest',
      engB.sg.mass < 15000,
      'SG mass ' + engB.sg.mass.toFixed(0) + ' kg (the pre-fix windup refilled to 17,033)');
  /* BOTH PUMPS: the sourced chain whole — "the turbine will be tripped and the MDAFW will
   * start automatically. If the reactor is operating above 50% of full power at this time,
   * the reactor will trip" — turbine trip, P-9 reactor trip, MDAFW on the loss. */
  var engC = EN.createEngine({});
  run(engC, quiet ? 60 : SETTLE);
  EN.command(engC, 'feed_pump_a', false); EN.command(engC, 'feed_pump_b', false);
  var tsC = run(engC, 5);
  ckT('loss of BOTH pumps: turbine trips, P-9 trips the reactor, the MDAFW starts on the loss',
      engC.tb.tripped === true && engC.pt.reactor_trip === true &&
      engC.pt.trip_cause === 'turbine_trip' &&
      engC.pt.afas_mdafw === true && engC.pt.afas_mdafw_cause === 'loss_of_main_feed',
      'the whole ch10 sentence, executed');
  /* ...AND THE SAME LINEUP ON RHR IS NOT A CASUALTY (#605). The check above drives the operator's
   * SELECTORS, deliberately: no real breaker-position signal can tell a securing from a failure,
   * so at power both must fire the chain. What decides it is whether main feed is the heat sink.
   * Mode 4 and Mode 5 boot with the pumps secured and the RCS on RHR — the NORMAL lineup — and
   * the chain must stay quiet there. Measured before the arming existed: AFAS actuated at t=0 and
   * pulled the settled Mode 4 plant down 21 degF/hr (run_pwr2_endurance saw it).
   * BOTH DIRECTIONS ARE ASSERTED, here and above, because either one alone is satisfiable by a
   * chain that never fires at all — the #605 first attempt passed this half and broke that one. */
  var engC5 = EN.createEngine({ initial_state: 'cold_shutdown' });
  var tsC5 = run(engC5, 60);
  ckT('a cold plant on RHR with its main feed pumps secured does NOT fire the ch10 chain',
      engC5.rh.running === true && engC5.fw.pumpA === false && engC5.fw.pumpB === false &&
      engC5.pt.afas_mdafw === false && engC5.aw.mdafwRunning !== true,
      'RHR running ' + engC5.rh.running + ', pumps ' + engC5.fw.pumpA + '/' + engC5.fw.pumpB +
      ', AFAS ' + engC5.pt.afas_mdafw + ', Tavg ' + tsC5.tavg_c.toFixed(1) + ' degC');
  /* And securing RHR re-arms it: the arming is the HEAT SINK, not the mode label. */
  EN.command(engC5, 'rhr_align', false);
  run(engC5, 5);
  ckT('...and taking RHR out of service re-arms it on the same standing loss',
      engC5.rh.running === false && engC5.pt.afas_mdafw === true &&
      engC5.pt.afas_mdafw_cause === 'loss_of_main_feed',
      'AFAS ' + engC5.pt.afas_mdafw + ' cause ' + engC5.pt.afas_mdafw_cause);
  /* HI-HI: an overfeed walks the level to the P-14 class function — main feed isolated AND
   * the turbine tripped (moisture carryover), while the AFW path stays open. */
  var engD = EN.createEngine({});
  run(engD, quiet ? 60 : SETTLE);
  EN.command(engD, 'feed_manual_frac', 1.2);
  var tFwi = null, tsD = null;
  for (var kd = 0; kd < 400 / DT; kd++) {
    tsD = EN.step(engD, DT);
    if (tFwi === null && engD.pt.fwi) { tFwi = kd * DT; break; }
  }
  ckT('a manual overfeed reaches hi-hi: fwi latches, main feed isolates, the turbine trips',
      tFwi !== null && engD.fw.isolated === true && engD.tb.tripped === true &&
      engD.pt.fwi_cause === 'hi_hi_sg_level',
      tFwi === null ? 'never reached hi-hi in 400 s'
                    : 'fwi at ' + tFwi.toFixed(1) + ' s, indicated level ' +
                      (engD.ins.reading.sg_level || 0).toFixed(1) + ' %');
  /* THE SHRINK, on the indicated channel only: at engC's trip the power collapse shifts the
   * INDICATED level below TRUE (swell_factor x power rate, the adopted instrument-side
   * term) — the mass ledger does not move that fast. */
  var engE2 = EN.createEngine({});
  run(engE2, quiet ? 60 : 120);
  EN.command(engE2, 'scram', true);
  var maxGap = 0;
  for (var ke = 0; ke < 10 / DT; ke++) {
    var tsE2 = EN.step(engE2, DT);
    var gap = tsE2.sg_level_pct - engE2.ins.reading.sg_level;
    if (gap > maxGap) maxGap = gap;
  }
  ckT('a scram SHRINKS the indicated level below true — the downcomer effect, instrument-side',
      maxGap > 3,
      'max true-minus-indicated ' + maxGap.toFixed(1) + ' points in the first 10 s — A9\'s ' +
      'effect reproduced on PWR2\'s own channel');
  }

  if (grp('G')) {
  /* ---- 6. THE ELECTRICAL PAIR (#507 wave 4) — every wire its own probe (the 2026-08-21
   * lesson: fix the defect, and give each orphaned wire a probe of its own). Measured
   * fixture values 2026-08-22: LOOP at 120 s reads afw_flow_normalized 1.000 (both pumps),
   * SBO reads 0.667 — exactly the TDAFW-only fraction, which makes the ratio itself the
   * MDAFW power wire's gauge. ---- */
  head('THE ELECTRICAL PAIR  [LOOP: nonvital dead, vital alive; SBO: the TDAFW carries it]');
  var engL = EN.createEngine({});
  run(engL, quiet ? 20 : 30);
  EN.command(engL, 'offsite_power', false);
  var tsL = run(engL, 120);
  ckT('a LOOP kills every NONVITAL load with its selectors standing: RCPs tripped, feed 0 ' +
      'with both pumps selected, condenser lost — and ac_available stays TRUE (diesels)',
      engL.sys.pumpTripped === true && engL.fw.feed_frac < 0.01 &&
      engL.fw.pumpA === true && engL.fw.pumpB === true &&
      engL._cdAvail === false && tsL.ac_available === true && tsL.station_blackout === false,
      'feed ' + engL.fw.feed_frac.toFixed(4) + ', cd ' + engL._cdAvail);
  ckT('...starts BOTH AFW pumps on the sourced ch10 condition, delivering rated flow — and ' +
      'the MDAFW cause is loss_of_main_feed (the same-step race: the dead feed train reports ' +
      'first, which is ALSO the feed grid wire\'s own gauge)',
      engL.pt.afas_tdafw === true && engL.pt.afas_tdafw_cause === 'loss_of_offsite_power' &&
      engL.pt.afas_mdafw_cause === 'loss_of_main_feed' &&
      engL.aw.mdafwRunning === true && tsL.afw_flow_normalized > 0.99,
      'td cause ' + engL.pt.afas_tdafw_cause + ', md cause ' + engL.pt.afas_mdafw_cause +
      ', afw ' + tsL.afw_flow_normalized.toFixed(3));
  ckT('...and SHEDS the heaters on the NUREG-0737 latch, vital bus notwithstanding',
      engL.pz.shedLatch === true && (engL._pzr.heater_kW || 0) === 0, '');
  /* the operator re-loads the heaters DURING the LOOP: the vital bus carries them — this
   * pair (with the SBO twin below) is the ac_available wire's own gauge */
  EN.command(engL, 'pzr_heaters_manual', 1.0);
  var tsLh = run(engL, 5);
  ckT('the heater re-load during a LOOP delivers real watts — the vital bus is ALIVE',
      engL.pz.shedLatch === false && engL._pzr.heater_kW > 100,
      engL._pzr.heater_kW.toFixed(0) + ' kW on manual full');
  /* the charging pump through the facade wire, demand forced non-zero (the PLCS wants 0
   * here — level sits above the post-trip program, measured 40 % vs 25 — so the demand is
   * taken manual to make the probe non-vacuous) */
  engL._plcsAuto = false; engL.cv.chargingDemand = 1.0;
  var tsLc = run(engL, 2);
  ckT('...and full manual charging DELIVERS during the LOOP (vital bus, ~1.8 kg/s)',
      engL.cv.chargingDemand === 1.0 && tsLc.charging_flow_actual > 3e-5,
      'charging ' + tsLc.charging_flow_actual.toExponential(2) + ' frac/s');

  var engS = EN.createEngine({});
  run(engS, quiet ? 20 : 30);
  EN.command(engS, 'station_blackout', true);
  var tsS = run(engS, 120);
  ckT('an SBO reads on the contract (ac_available false, station_blackout true) and the ' +
      'demanded MDAFW delivers NOTHING while the steam-driven TDAFW carries the plant',
      tsS.ac_available === false && tsS.station_blackout === true &&
      engS.aw.mdafwRunning === true && engS.aw.tdafwRunning === true &&
      Math.abs(tsS.afw_flow_normalized - 2 / 3) < 0.01,
      'afw ' + tsS.afw_flow_normalized.toFixed(3) + ' = the TDAFW-only fraction');
  EN.command(engS, 'pzr_heaters_manual', 1.0);
  engS._plcsAuto = false; engS.cv.chargingDemand = 1.0;
  var tsSh = run(engS, 5);
  ckT('the SAME re-load and charging lineup under SBO delivers zero — the vital bus is DEAD',
      engS.pz.shedLatch === false && (engS._pzr.heater_kW || 0) === 0 &&
      engS.cv.chargingDemand === 1.0 && tsSh.charging_flow_actual === 0,
      'heaters 0 kW, charging 0 at full manual demand');
  EN.command(engS, 'station_blackout', false);
  var tsSr = run(engS, 5);
  ckT('clearing the SBO restores both buses: heaters live (latch was re-loaded), charging ' +
      'delivers at the standing demand, RCPs stay tripped',
      tsSr.ac_available === true && engS._pzr.heater_kW > 100 &&
      tsSr.charging_flow_actual > 3e-5 && engS.sys.pumpTripped === true, '');

  /* SI under blackout, on a plant whose pressure would otherwise take injection: the ECCS
   * wire's own probe — the module gate proves the module, THIS proves the facade passes it */
  var engB = EN.createEngine({});
  run(engB, quiet ? 20 : 30);
  EN.command(engB, 'break_open', { area_m2: 0.002, node: 'cold_leg' });
  var tsB = null, tSI = null;
  for (var kb = 0; kb < 240 / DT; kb++) {
    tsB = EN.step(engB, DT);
    if (tSI === null && tsB.hpi_flow_normalized > 0.05) { tSI = (kb + 1) * DT; break; }
  }
  ckT('fixture: the 20 cm2 break brings SI flow on its own', tSI !== null,
      tSI !== null ? ('flowing at t=' + tSI.toFixed(1) + ' s') : 'no SI flow in 240 s');
  EN.command(engB, 'station_blackout', true);
  var tsB2 = run(engB, 2);
  ckT('a station blackout STOPS the safety injection mid-LOCA (the facade\'s ECCS wire)',
      tsB2.hpi_flow_normalized === 0 && engB.ec.hhsiRunning === true,
      'flow 0 with the run flag standing');
  EN.command(engB, 'station_blackout', false);
  var tsB3 = run(engB, 2);
  ckT('...and restoring the buses resumes it at the standing lineup',
      tsB3.hpi_flow_normalized > 0.05, 'flow ' + tsB3.hpi_flow_normalized.toFixed(2));
  }

  if (grp('H')) {
  /* ---- 7. THE SGTR (#507 wave 5) — a break whose destination is the SG. Area [UNVERIFIED]
   * (no tube geometry in any lane's corpus): typical Westinghouse 0.75 in OD x 0.048 in wall,
   * double-ended 4.33e-4 m2. Measured 2026-08-22 at sev 0.4: initial 20.9 kg/s, 6.3 at
   * 300 s tracking the sqrt(dP) drive; OTdT trip 55.2 s, SI (lo pzr press) 69.7 s;
   * containment NEVER moves — the bypass signature. ---- */
  head('THE SGTR  [primary mass lands in the SG; containment sees nothing; the dP is the EOP]');
  var engT = EN.createEngine({});
  run(engT, quiet ? 20 : 30);
  var ctP0 = EN.step(engT, DT).containment_pressure_mpa;
  var dP0 = engT.sys.P - engT.sg.P;
  EN.command(engT, 'break_open', { area_m2: 0.4 * 4.33e-4, node: 'sg_primary' });
  run(engT, 1);
  var leak0 = engT._sgtrKgs;
  ckT('a 40 % double-ended tube rupture leaks primary water at the sourced-shape rate',
      leak0 > 15 && leak0 < 30, leak0.toFixed(1) + ' kg/s initial (full DER measures ~52; ' +
      'the "1982 Ginna ~48" comparison is RECALLED and in no corpus — UNVERIFIED, #510 M-15 ' +
      '— the declared ~2x break-model overstatement is the honest error bar)');
  var tsT = run(engT, 300);
  var leak300 = engT._sgtrKgs, dP300 = engT.sys.P - engT.sg.P;
  ckT('the SG OVERFILLS on the leak — the sourced hazard (§15.6.3), mass frac > 1.1 at 300 s',
      tsT.sg_mass_frac > 1.1, 'mass frac ' + tsT.sg_mass_frac.toFixed(2));
  ckT('the plant answers unscripted: reactor trip and safety injection both latched',
      tsT.scrammed === true && engT.pt.si === true,
      'trip ' + engT.pt.trip_cause + ', SI ' + engT.pt.si_cause);
  ckT('CONTAINMENT NEVER MOVES — the bypass signature that diagnoses an SGTR',
      Math.abs(tsT.containment_pressure_mpa - ctP0) < 1e-6,
      'ctmt ' + (ctP0 * 145.038).toFixed(2) + ' psia before and after ' +
      engT.brk.discharged_kg.toFixed(0) + ' kg discharged');
  ckT('the leak TAPERS on the sqrt(dP) drive — depressurizing toward the ruptured SG is ' +
      'the sourced EOP, and the physics rewards it',
      Math.abs(leak300 / leak0 - Math.sqrt(dP300 / dP0)) < 0.1,
      'leak ratio ' + (leak300 / leak0).toFixed(3) + ' vs sqrt(dP ratio) ' +
      Math.sqrt(dP300 / dP0).toFixed(3));
  /* the one-break slot: a LOCA REPLACES the SGTR (declared — one break at a time) */
  EN.command(engT, 'break_open', { area_m2: 2e-4, node: 'cold_leg' });
  var tsT2 = run(engT, 5);
  ckT('a new break REPLACES the tube rupture (one-break slot, declared): the SGTR stream ' +
      'stops and containment starts receiving',
      engT.brk.node === 'cold_leg' && engT._sgtrKgs === 0 &&
      tsT2.containment_pressure_mpa > ctP0 + 1e-5,
      'ctmt now ' + (tsT2.containment_pressure_mpa * 145.038).toFixed(2) + ' psia');

  /* ---- #566: TWO STREAMS, EACH AT ITS OWN ENTHALPY. A small break plus a lifted PORV is
   * the compound casualty (seal leak + feed-and-bleed); reconstruct containment's energy
   * ledger from each stream's OWN carrier and require the module's ledger to match. Under
   * the pick-one form the relief (~2,700 kJ/kg steam) is booked at the break's ~1,240 and
   * the tallies diverge by MJ within seconds. ---- */
  var engCT = EN.createEngine({});
  run(engCT, 10);
  EN.command(engCT, 'porv_stick', true); EN.command(engCT, 'porv_manual', true);
  EN.command(engCT, 'break_open', { area_m2: 2e-5, node: 'cold_leg' });
  var ctBK = RD.break_, ctRawBreak = ctBK.stepBreak, ctRawPz = PZ.stepPressurizer;
  var ctExp = 0, ctBoth = 0, ctSteps = 0, ctBrH = 0, ctPzH = 0;
  ctBK.stepBreak = function (bk, sy, dt, d) {
    var r = ctRawBreak(bk, sy, dt, d);
    ctBrH = r.mdot_kgs > 0 ? r.mdot_kgs * r.source.h * dt : 0;
    return r;
  };
  PZ.stepPressurizer = function (pz, sy, dt, d) {
    var r = ctRawPz(pz, sy, dt, d);
    ctPzH = (r.relief_kgs || 0) * (r.relief_h || 0) * dt;
    ctSteps++;
    if (ctBrH > 0 && ctPzH > 0) ctBoth++;
    ctExp += ctBrH + ctPzH;
    return r;
  };
  var ctE0 = engCT.ctm.energy_in_kJ;
  try { run(engCT, 60); }
  finally { ctBK.stepBreak = ctRawBreak; PZ.stepPressurizer = ctRawPz; }
  var ctGot = engCT.ctm.energy_in_kJ - ctE0;
  ckT('containment books the break AND the relief at their OWN enthalpies (both flowing)',
      ctBoth > 0.9 * ctSteps && ctExp > 0 &&
      Math.abs(ctGot - ctExp) < 1e-6 * ctExp,
      'ledger ' + (ctGot / 1000).toFixed(2) + ' MJ vs reconstructed ' +
      (ctExp / 1000).toFixed(2) + ' MJ over 60 s, both streams live on ' + ctBoth + '/' +
      ctSteps + ' steps (pick-one books the relief at the break\'s h and diverges in MJ)');
  }

  if (grp('I')) {
  /* ---- 8. THE FAILURE LEVERS (#507 wave 6): the two that live in THIS file's caller's-half
   * and rod-drive logic — ATWS and the withdrawal runaway. The rows themselves ride the
   * shell gate; here the MECHANISM is pinned. ---- */
  head('THE FAILURE LEVERS  [ATWS: the latch stands, the rods do not; gravity beats a drive]');
  var engI = EN.createEngine({});
  run(engI, quiet ? 20 : 30);
  EN.command(engI, 'scram_block', true);
  EN.command(engI, 'scram');
  var tsI = run(engI, 5);
  ckT('a blocked scram LATCHES the trip — annunciated, turbine tripped — with the rods at 200',
      engI.pt.reactor_trip === true && engI.pt.trip_cause === 'manual' &&
      engI.tb.tripped === true && engI.rodSteps === bank() && tsI.scrammed === true,
      'the failure is the DROP, not the logic — which is what an ATWS is');
  EN.command(engI, 'scram_block', false);
  EN.command(engI, 'reset_protection', true);
  EN.command(engI, 'scram');
  run(engI, 5);
  ckT('...and after the block clears, reset + scram drops the rods (a fresh edge — the ' +
      'spent one is not retroactive, declared)',
      engI.rodSteps < 100 && engI.pt.reactor_trip === true, '');

  /* the fixture is the SHELL gate's measured one — 60 MWe, a shallow 25-step insert. The
   * first draft inserted 50 steps at FULL load and the RPS terminated the excursion mid-ride
   * (150 -> 0.0 measured): the plant answering an uncontrolled withdrawal is UFSAR 15.4's
   * own credited story, but it is a different claim than "the drive moves", and this check
   * asserts the drive. */
  var engJ = EN.createEngine({});
  run(engJ, quiet ? 20 : 30);
  EN.command(engJ, 'load_mwe', 60);
  run(engJ, 120);
  EN.command(engJ, 'rod_target', 175);
  run(engJ, 60);
  var sJ0 = engJ.rodSteps;
  EN.command(engJ, 'rod_runaway', 2.63);
  run(engJ, 10);
  var thrJ = false;
  try { EN.command(engJ, 'rod_target', 100); } catch (eJ) { thrJ = /REFUSED/.test(eJ.message); }
  ckT('a rod runaway drives OUTWARD at its own rate, target ignored, rod commands REFUSED',
      engJ.rodSteps > sJ0 + 20 && thrJ === true,
      sJ0.toFixed(0) + ' -> ' + engJ.rodSteps.toFixed(1) + ' steps in 10 s at 2.63/s');
  EN.command(engJ, 'scram');
  run(engJ, 5);
  ckT('...and a WORKING scram beats the drive: rods drop, the runaway clears',
      engJ.rodSteps < 50 && engJ.runaway === null, 'gravity wins');

  /* ---- 8b. THE TRIP BREAKERS TAKE THE DRIVE'S POWER (#545) ----------------------------------
   * [sourced] Ginna TS Bases B 3.3.1 (ML20339A221): "Opening of the RTBs interrupts power to
   * the CRDMs, which allows the shutdown rods and control rods to fall into the core by
   * gravity". So a LATCHED trip means no drive power, either bank, either direction.
   *
   * WHAT THIS REPLACES. Measured on the pre-fix tree, full facade: scram from hot_full_power,
   * rods 0/0 and 2.71 % at t+10 s, then `rod_start {direction:1}` ACCEPTED on both groups and
   * the plant back at 61.18 % true power / 61.93 % core heat / 598.4 degF at t+910 s, rods
   * 200/200 — with `scrammed` true on the true state, on the instrument and in the kernel at
   * once, while hi_flux_lo sat at 0.6170 against its 0.350 setpoint, asserted, TRIPPING, held
   * 751.6 s, and could not act because the latch it would set was already set. The rods were
   * the one trip consumer wired to the latch's rising EDGE; every other one below it is
   * level-held.
   *
   * THE POWER CHECK IS THE POINT, not the step count: a hold that stopped the rods but left a
   * critical core would read identically at 0/0 for the first minute. */
  head('THE TRIP BREAKERS  [a latched trip is rod drive power removed, both banks, both ways]');
  var engT = EN.createEngine({});
  run(engT, quiet ? 20 : 60);
  EN.command(engT, 'scram');
  var tsT10 = run(engT, 10);
  var sT0 = engT.rodSteps, sdT0 = engT.sdSteps;
  var thrTc = false, thrTs = false;
  try { EN.command(engT, 'rod_target', bank()); } catch (eT1) { thrTc = /ROD DRIVE BLOCKED/.test(eT1.message); }
  try { EN.command(engT, 'sd_target', 200); } catch (eT2) { thrTs = /ROD DRIVE BLOCKED/.test(eT2.message); }
  ckT('under a latched trip BOTH bank doors refuse by name — not silently clamped (#551 law)',
      thrTc === true && thrTs === true && engT.rodTarget === 0 && engT.sdTarget === 0,
      'targets untouched at ' + engT.rodTarget + '/' + engT.sdTarget);
  /* THE DEMAND IS PLANTED PAST THE DOOR, AND IT HAS TO BE. The hold and the door are each
   * SUFFICIENT for the operator's own sequence, so a one-sided injection lies (#295): with the
   * door refusing, `rodTarget` never reaches 200, so deleting the level hold moves nothing and
   * its mutation goes blind. Measured — that is exactly what the first draft of this section
   * did. Writing the field directly is the honest reproduction of the OTHER arrival: a standing
   * withdrawal demand already latched when the trip lands (the operator holding WITHDRAW, or an
   * ATWS, where the trip edge never zeroes the targets). */
  engT.rodTarget = 200; engT.sdTarget = 200;
  var tsT = run(engT, 900);
  ckT('...and 900 s of standing withdrawal demand moves neither bank and the core stays down',
      engT.rodSteps === sT0 && engT.sdSteps === sdT0 &&
      tsT.power_pct < 0.5 && tsT.scrammed === true,
      'rods ' + engT.rodSteps.toFixed(1) + '/' + engT.sdSteps.toFixed(1) + ' against a 200/200 ' +
      'demand, power ' + tsT10.power_pct.toFixed(2) + ' -> ' + tsT.power_pct.toFixed(2) +
      ' % (pre-fix: 0/0 -> 200/200 and 2.71 -> 61.18 %)');
  engT.rodTarget = engT.rodSteps; engT.sdTarget = engT.sdSteps;
  /* the RELEASE verbs must survive the guard: the board sends rod_stop on EVERY button
   * release and its mapper sets target := current position. A flat refusal would make
   * letting go of the button an error, which is why the door tests for MOTION. */
  var thrStop = null;
  try { EN.command(engT, 'rod_target', engT.rodSteps); EN.command(engT, 'sd_target', engT.sdSteps); }
  catch (eT3) { thrStop = eT3.message; }
  ckT('...while rod_stop / rod_stop_all still take — the door refuses MOTION, not the press',
      thrStop === null, thrStop ? ('THREW: ' + thrStop.slice(0, 50)) : 'target := position accepted');
  /* THE RESET IS THE WAY OUT, and it must leave no standing motion demand behind — Manuals/03
   * §3.5.1: "The rods stay where they are until you deliberately withdraw them." */
  EN.command(engT, 'reset_protection', true);
  engT.rodTarget = engT.rodSteps; engT.sdTarget = engT.sdSteps;   /* the shell's reset does this */
  EN.command(engT, 'rod_target', 40);
  run(engT, 60);
  ckT('...and after the reset the drive works again — 60 s at normal speed is ~40 steps out',
      engT.rodSteps > 35 && engT.rodSteps <= 42 && engT.pt.reactor_trip === false,
      engT.rodSteps.toFixed(1) + ' steps (0.702/s x 60 s, capped by the 40-step demand)');

  /* THE ATWS IS WHERE THE BOTH-DIRECTIONS HALF IS OBSERVABLE — under a normal trip the rods
   * are already at 0, so in/out cannot be told apart. With the drop failed the operator can no
   * longer walk the bank back in by hand and the response is emergency boration, which is the
   * prototypical one *(OWNER RULING, 2026-08-28: selected "Refuse both directions" over
   * allowing inward motion — a menu selection, cited in that form)*. */
  var engU = EN.createEngine({});
  run(engU, quiet ? 20 : 30);
  EN.command(engU, 'scram_block', true);
  EN.command(engU, 'scram');
  run(engU, 5);
  var thrU = false, thrBoron = null;
  try { EN.command(engU, 'rod_target', 0); } catch (eU) { thrU = /ROD DRIVE BLOCKED/.test(eU.message); }
  try { EN.command(engU, 'boron_rate', 0.05); } catch (eU2) { thrBoron = eU2.message; }
  ckT('ATWS: the INWARD command is refused too — the breakers are open, not the drive selective',
      thrU === true && engU.rodSteps === bank(), 'rods held at ' + engU.rodSteps.toFixed(0));
  ckT('...and emergency boration is still reachable, which is the response that is left',
      thrBoron === null, thrBoron ? ('THREW: ' + thrBoron.slice(0, 50)) : 'boron_rate accepted, ' + engU.cv.boron_rate_cmd + ' ppm/s');
  /* a continuous-withdrawal DRIVE fault is downstream of the same power supply. The scram edge
   * clears eng.runaway ("gravity beats a drive"), but the ATWS path never reaches that edge —
   * this is the branch that catches it. Measured 175.0 -> 175.1 steps over 120 s: one step of
   * the house one-step lag, against an uncapped 200. */
  var engV = EN.createEngine({});
  run(engV, quiet ? 20 : 30);
  EN.command(engV, 'load_mwe', 60);
  run(engV, 120);
  EN.command(engV, 'rod_target', 175);
  run(engV, 60);
  EN.command(engV, 'scram_block', true);
  EN.command(engV, 'rod_runaway', 5.0);
  var sV0 = engV.rodSteps;
  EN.command(engV, 'scram');
  run(engV, 120);
  ckT('ATWS + rod runaway: the latch stops the DRIVE FAULT too, one step of lag and no further',
      engV.runaway !== null && engV.rodSteps - sV0 < 0.3 && engV.pt.reactor_trip === true,
      sV0.toFixed(1) + ' -> ' + engV.rodSteps.toFixed(1) + ' steps in 120 s at 5.0/s ' +
      '(unheld it caps at 200)');

  /* ---- 8c. THE INTERMEDIATE-RANGE ROD STOP HOLDS A STARTUP (#572) ---------------------------
   * The protection suite pins the SIGNAL; this pins what the plant does with it, which is the
   * claim that matters: a rod stop that reports and does not hold is the wiring gap this file's
   * header exists to catch.
   *
   * THE REGIME IS THE POINT. At FAST the excursion is steep enough that a flux trip terminates
   * it anyway — which is correct and prototypical, and is exactly why a rod stop is not a
   * substitute for a trip. The stop's own regime is a CONTROLLED withdrawal.
   *
   * ⚠ RE-AIMED FOR #601, AND THE RE-AIM IS ITSELF A MEASUREMENT. This block used to
   * ride ONE PRESS HELD TO 200 and assert the stop parked the bank "short of the trip" for
   * 900 s. That passed because the next trip above the 20 % stop was the 35 % low setting — a
   * 15-point gap. The sourced intermediate-range trip sits at 25 %, so the gap is 5 points, and
   * the standing reactivity already in the core when the stop asserts carries the flux straight
   * through it.
   *
   * MEASURED, with the trip's own setpoint pushed aside so the STOP could be watched alone
   * (blocking the request would have cleared the stop too — that is the #601 pairing):
   *   the stop asserts at 20.08 % / 88.1 steps, the bank goes 88.1 -> 88.2 (the one-step lag)
   *   and STAYS there for 1200 s — the hold is real — while the flux coasts up to a peak of
   *   28.24 % and settles at 27.13 %.
   * So on THIS core the stop holds the rods and does not hold the power, and the 25 % trip is
   * what ends a held press. That is the sources' own framing rather than a defect — Ginna TS
   * Bases B 3.3.1 Fn 3: limiting further withdrawal *"MAY terminate the transient and eliminate
   * the need to trip the reactor"* — but it is tight: measured, an 86-step target settles at
   * 22.59 % (peak 24.28) and does NOT trip, and 88 steps does. Two steps of bank is the whole
   * margin, because this core's step worth is large against a 5-point window.
   *
   * Both halves are pinned below: the stop's OWN regime (it holds, and the plant survives), and
   * the held press (it holds the bank, and the trip ends it anyway). */
  var engW = EN.createEngine({ initial_state: 'hot_zero_power' });
  run(engW, 120);
  EN.command(engW, 'rod_speed', 'slow');
  EN.command(engW, 'rod_target', frac(0.43));     /* the stop's own regime — an operator step */
  var onsetW = null, tsW = null;
  for (var kW = 0; kW < walk(2400) / DT; kW++) {
    tsW = EN.step(engW, DT);
    if (!onsetW && engW.rpsReport.rod_stop_causes.ir_high_flux) {
      onsetW = { pwr: engW.ins.reading.power_range, steps: engW.rodSteps };
    }
    if (tsW.scrammed) break;
  }
  ckT('the IR rod stop asserts ON its sourced 20 % setpoint during a controlled withdrawal',
      !!onsetW && Math.abs(onsetW.pwr - 20.0) < 1.5,
      onsetW ? ('asserted at ' + onsetW.pwr.toFixed(2) + ' % indicated, ' +
                onsetW.steps.toFixed(1) + ' steps — the gap is the one-step channel lag')
             : 'NEVER ASSERTED');
  ckT('...and in its OWN regime the plant rides it out UNTRIPPED — the stop earns its keep',
      tsW.scrammed === false && engW.pt.reactor_trip === false &&
      engW.ins.reading.power_range > 20 && engW.ins.reading.power_range < 25,
      'settled ' + engW.ins.reading.power_range.toFixed(2) + ' % under the 25 % ' +
      'intermediate-range trip, bank at ' + engW.rodSteps.toFixed(1) + ' steps');
  var thrW = null;
  try { EN.command(engW, 'rod_target', bank()); } catch (eW) { thrW = eW.message; }
  var thrWin = null;
  try { EN.command(engW, 'rod_target', engW.rodSteps - 5); } catch (eW2) { thrWin = eW2.message; }
  ckT('...outward REFUSES by name and INWARD still takes — the source\'s own scope',
      thrW !== null && /INTERMEDIATE RANGE/.test(thrW) && thrWin === null,
      thrW ? ('out: ' + thrW.slice(22, 70) + ' | in: accepted') : 'outward was ACCEPTED');

  /* THE HELD PRESS — and since #602 phase 2 the answer DEPENDS ON THE RATE, which is what a rod
   * stop is supposed to be sensitive to. On the 200-step bank one step spanned the whole
   * 20 %->25 % flux window, so no pull rate could sit inside it and this was a single check.
   * Measured on the 627-step bank, one press held from hot_zero_power:
   *
   *     slow    stop at 254 st / 19.8 %  ->  NO TRIP, settles 21.7 %   the stop HOLDS
   *     normal  stop at 269 st / 20.7 %  ->  coasts to 26.8 %, trips on ir_high_flux
   *     fast    stop at 273 st / 20.3 %  ->  coasts to 29.3 %, trips on ir_high_flux
   *
   * Both halves are pinned. That pair IS the sourced relationship — WTSM has the stop act first
   * and the trip catch what it does not hold, and Ginna TS Bases B 3.3.1 Fn 3 says limiting
   * withdrawal *"MAY terminate the transient and eliminate the need to trip the reactor"*. A stop
   * that held at every rate would make the trip behind it unreachable; one that held at no rate
   * would be decoration. The bank freeze is asserted in both, so a stop that REPORTS and does not
   * HOLD — the wiring gap this section exists for — still reds either way. */
  function heldPress(speed, secs) {
    var e2 = EN.createEngine({ initial_state: 'hot_zero_power' });
    run(e2, 120);
    EN.command(e2, 'rod_speed', speed);
    EN.command(e2, 'rod_target', bank());       /* one press, held — the board's own idiom */
    var atStop = null, tgt = null, t = null;
    for (var q = 0; q < secs / DT; q++) {
      t = EN.step(e2, DT);
      if (atStop === null && e2.rpsReport.rod_stop_causes.ir_high_flux) {
        atStop = e2.rodSteps; tgt = e2.rodTarget;   /* the demand AT the stop: a scram zeroes
                                                     * rodTarget, so reading it afterwards reads
                                                     * the trip, not the operator */
      }
      if (t.scrammed) break;
    }
    return { e: e2, ts: t, atStop: atStop, tgt: tgt,
             /* THE TOLERANCE IS THE FLUX CHANNEL'S LAG, and it grew with the flatter curve
              * (#602 phase 2): measured 1.081 steps of run-on at Slow, against 0.1 on the
              * old bank. Indicated flux crosses 20 % later in STEPS when each step is worth
              * less, so the stop bites a step further out. 2.0 is the lag with room; the
              * claim is that the bank FREEZES rather than running on to the demanded 627,
              * and 1 step against 373 remaining is a freeze by any reading. */
             held: atStop !== null && e2.rodSteps - atStop < 2.0,
             pw: e2.ins.reading.power_range };
  }
  var hpSlow = heldPress('slow', 9000);
  ckT('a HELD press at SLOW: the stop parks the bank and the plant rides it out UNTRIPPED',
      hpSlow.held && hpSlow.tgt === bank() && hpSlow.ts.scrammed === false &&
      hpSlow.pw > 20 && hpSlow.pw < 25,
      'bank frozen at ' + (hpSlow.atStop === null ? '--' : hpSlow.atStop.toFixed(1)) +
      ' of a demanded ' + bank() + ', settled ' + hpSlow.pw.toFixed(1) +
      ' % under the 25 % trip — the stop earns its keep at this rate');
  var hpNorm = heldPress('normal', 3000);
  ckT('...and at NORMAL the withdrawal OUTRUNS it — the bank still freezes, the 25 % rung ends it',
      hpNorm.held && hpNorm.tgt === bank() && hpNorm.ts.scrammed === true &&
      hpNorm.e.pt.trip_cause === 'ir_high_flux',
      'bank frozen at ' + (hpNorm.atStop === null ? '--' : hpNorm.atStop.toFixed(1)) +
      ', tripped on ' + hpNorm.e.pt.trip_cause + ' — the standing reactivity carries the flux ' +
      'through a window the stop cannot close by holding the rods');
  }

  if (grp('K')) {
  /* ---- 8d. THE BANK SCALE IS ONE CONSTANT, AND EVERY CONSUMER FOLLOWS IT (#602 phase 1) ----
   *
   * ⚠ THIS IS A FUNCTIONAL CHECK, NOT A SOURCE SCAN, and the difference is the point.
   * `200` was TWENTY-TWO bare literals across pwr2_engine.js and pwr2_shell.js — the
   * rod-insertion-limit percent-to-steps map, the initial conditions, BOTH target clamps, the
   * scram insertion profile for each bank, the runaway cap, the rod-limit margin default, the
   * published rod_groups, and two `(24 / 912) * 200` rate conversions where the number reads
   * as arithmetic. A grep cannot tell those from an unrelated 200, and a check that counted
   * them would be testing the grep.
   *
   * So this MOVES THE CONSTANT and rides the plant. Every assertion below is a consumer that
   * used to hold its own copy: leave one behind and its literal disagrees with the scale and
   * this reds. Measured before the hoist — a harness that patched three sites and missed the
   * target clamp held the bank at 200 of a demanded 627 and reported "never critical",
   * silently, on three plants in a row. That is what an unhoisted scale buys.
   *
   * The scale is RESTORED in a `finally`, so nothing downstream in this file sees a moved
   * plant even if an assertion throws. */
  head('THE BANK SCALE  [one constant, and every consumer reads it — #602]');
  (function () {
    var RODS = RD.kinetics.RODS, was = RODS.max_steps, PROBE = 313;   /* deliberately not 200 */
    ckT('the scale is declared ONCE, in RODS, beside the worths it has to be solved with',
        typeof was === 'number' && was > 0,
        'RODS.max_steps = ' + was + ' (worths ' + (RODS.worth_control * 1e5).toFixed(0) +
        ' / ' + (RODS.worth_shutdown * 1e5).toFixed(0) + ' pcm)');
    try {
      RODS.max_steps = PROBE;
      var eB = EN.createEngine({ initial_state: 'hot_full_power' });
      EN.step(eB, DT);
      ckT('...the at-power INITIAL CONDITION opens on the new scale, both banks',
          eB.rodSteps === PROBE && eB.sdSteps === PROBE && eB.rodTarget === PROBE,
          'control ' + eB.rodSteps + ', shutdown ' + eB.sdSteps + ', target ' + eB.rodTarget);
      ckT('...and the rod GROUPS the reactivity solve reads carry it too',
          eB.rodBank && eB.rodBank[0].max_steps === PROBE && eB.rodBank[1].max_steps === PROBE,
          eB.rodBank ? ('max_steps ' + eB.rodBank[0].max_steps + ' / ' + eB.rodBank[1].max_steps)
                     : 'NO rodBank');
      /* THE TARGET CLAMP — the site the harness missed, and the one that fails silently. */
      EN.command(eB, 'rod_target', 99999);
      ckT('...the rod target CLAMPS at the new scale, not at a stale 200',
          eB.rodTarget === PROBE,
          'demanded 99999, clamped to ' + eB.rodTarget + ' (a stale literal would say 200)');
      /* THE SCRAM PROFILE — a CEILING of `scale * (1 - t/T)` per bank, so what a stale copy
       * breaks is the FIRST INSTANT, not the endpoint. Measured: with a literal 200 against a
       * 313-step bank the ceiling already sits below the rods at t=0, so the bank TELEPORTS
       * 113 steps on the first tick and then ramps normally to zero. Sampling at 20 s reads
       * 0.00 either way — the first form of this check did exactly that, and the gate reported
       * the mutation BLIND. That is the hollow-check trap catching itself. Sample tick one. */
      EN.command(eB, 'scram');
      /* TWO ticks, not one, and the difference is measured not assumed: tick 1 reads 313.0 on
       * BOTH builds because the ramp has not engaged yet, and the divergence is at tick 2 —
       * clean 310.5, stale-ceiling 198.4. The one-tick form of this check sampled the frame
       * where the two are identical by construction and the gate reported the mutation BLIND. */
      EN.step(eB, DT); EN.step(eB, DT);
      var firstC = eB.rodSteps, firstS = eB.sdSteps;
      for (var i = 0; i < 20 / DT; i++) EN.step(eB, DT);
      ckT('...the scram RAMPS from the new scale rather than teleporting to a stale ceiling',
          firstC > PROBE * 0.98 && firstS > PROBE * 0.97,
          'two ticks after the trip: control ' + firstC.toFixed(1) + ', shutdown ' +
          firstS.toFixed(1) + ' of ' + PROBE + ' — a stale 200 ceiling drops both to 200 at ' +
          'once, ' + (PROBE - 200) + ' steps of free fall in a single tick');
      ckT('...and still drives BOTH banks fully in',
          eB.rodSteps < 0.5 && eB.sdSteps < 0.5,
          'after 20 s: control ' + eB.rodSteps.toFixed(2) + ', shutdown ' + eB.sdSteps.toFixed(2));
      /* THE ROD INSERTION LIMIT — a percent-of-withdrawn floor mapped onto steps. */
      var eR = EN.createEngine({ initial_state: 'hot_full_power' });
      EN.step(eR, DT);
      ckT('...and the rod insertion limit maps its percent floor onto the new scale',
          eR._rodLimitMargin !== undefined && eR._rodLimitMargin > 0 &&
          eR._rodLimitMargin < PROBE,
          'margin ' + eR._rodLimitMargin + ' steps of a ' + PROBE +
          '-step bank (the limit is a percentage, so it must scale)');
    } finally {
      RODS.max_steps = was;
    }
    var eZ = EN.createEngine({ initial_state: 'hot_full_power' });
    EN.step(eZ, DT);
    ckT('...and restoring the constant restores the plant — nothing latched the probe value',
        eZ.rodSteps === was && eZ.sdSteps === was,
        'back to ' + eZ.rodSteps + '/' + eZ.sdSteps);
  })();

  /* ---- 9. THE INITIAL CONDITIONS (#507 §F, wave 7) — each a SETTLED construction, each
   * ride measured 2026-08-22 before these checks were written. ---- */
  head('THE INITIAL CONDITIONS  [50 % and Hot Standby open settled; the startup is real]');
  var engK = EN.createEngine({ initial_state: '50_percent' });
  var tsK = EN.step(engK, DT);
  ckT('50 % opens ON its point: power 50, Tavg at the program\'s own 298.08 degC, 50 MWe, ' +
      'the secondary landed where the duty puts it',
      Math.abs(tsK.power_pct - 50) < 0.5 && Math.abs(tsK.tavg_c - 298.08) < 0.15 &&
      Math.abs(tsK.mwe_output - 50) < 1 &&
      engK.sg.P * 145.038 > 945 && engK.sg.P * 145.038 < 975 &&
      Math.abs(tsK.pzr_level_pct - 43.2) < 1.5,
      tsK.power_pct.toFixed(1) + ' %, ' + tsK.tavg_c.toFixed(2) + ' degC, SG ' +
      (engK.sg.P * 145.038).toFixed(0) + ' psia, level ' + tsK.pzr_level_pct.toFixed(1) + ' %');
  var minK = 101;
  for (var kk = 0; kk < (quiet ? 60 : 120) / DT; kk++) {
    tsK = EN.step(engK, DT);
    if (tsK.power_pct < minK) minK = tsK.power_pct;
  }
  ckT('...and rides untouched without a ring (measured 120 s: min 48.79 %, Tavg -0.9 degC)',
      minK > 48 && Math.abs(tsK.tavg_c - 298.08) < 1.8 && tsK.scrammed === false,
      'min ' + minK.toFixed(2) + ' %, Tavg ' + tsK.tavg_c.toFixed(2));

  var engH = EN.createEngine({ initial_state: 'hot_zero_power' });
  var tsH = EN.step(engH, DT);
  ckT('Hot Standby opens at the plant\'s OWN no-load point — Tsat of the sourced 1005 psig ' +
      '(547.9 degF, the Ginna pair; the 557 degF program anchor saturates ABOVE the 1085 ' +
      'psig MSSV pop, measured — the ICS header), level at the 25 % no-load program',
      tsH.power_pct < 1e-3 && Math.abs(tsH.tavg_c - 286.11) < 0.15 &&
      engH.sg.P * 145.038 > 1012 && engH.sg.P * 145.038 < 1028 &&
      Math.abs(tsH.pzr_level_pct - 25) < 1.0,
      tsH.tavg_c.toFixed(2) + ' degC, SG ' + (engH.sg.P * 145.038).toFixed(0) + ' psia, ' +
      'level ' + tsH.pzr_level_pct.toFixed(1) + ' %');
  ckT('...with the sourced no-load LINEUP: control bank IN, shutdown bank OUT (WTSM 8.1.1), ' +
      'dumps in STEAM PRESSURE mode at 1005 psig, feed at no-load, subcritical boron',
      engH.rodSteps === 0 && engH.sdSteps === bank() &&
      engH.dcDrivers.mode === 'pressure' &&
      Math.abs(engH.dcDrivers.pressure_setpoint_mpa - 7.03) < 1e-9 &&
      engH.fw.feed_frac === 0 && tsH.boron_ppm > 700 && tsH.boron_ppm < 740,
      'boron ' + tsH.boron_ppm.toFixed(0) + ' ppm (the 1000 pcm margin = +100 ppm)');
  var driftH = 0, tsH2 = tsH;
  for (kk = 0; kk < (quiet ? 60 : 120) / DT; kk++) {
    tsH2 = EN.step(engH, DT);
    if ((tsH2.sg_safety_kgs || 0) > driftH) driftH = tsH2.sg_safety_kgs;
  }
  ckT('...and HOLDS: power stays at source level, Tavg drift measured +0.05 degC/120 s ' +
      '(pump heat, the dumps carry it), the MSSVs never lift',
      tsH2.power_pct < 1e-2 && Math.abs(tsH2.tavg_c - 286.11) < 0.4 &&
      driftH === 0 && tsH2.scrammed === false,
      'Tavg ' + tsH2.tavg_c.toFixed(2) + ', safeties ' + driftH);

  /* the startup ACCIDENT: a continuous fast pull is uncontrolled withdrawal from subcritical,
   * and the startup net's FIRST rung terminates it. Since #601 that is the 25 % INTERMEDIATE
   * RANGE trip, not the 35 % power-range low setting — and it is the Function the sources
   * credit for exactly this event (Ginna TS Bases B 3.3.1 Fn 3: *"ensures that protection is
   * provided against an uncontrolled RCCA bank rod withdrawal accident from a subcritical
   * condition"*). Measured: peak 91.9 % indicated at the trip, against 100.8 % when the 35 %
   * setting was the first rung — the earlier setpoint buys back ~9 points of overshoot, and
   * what remains is the sourced 0.5 s analysis delay at a fast period. */
  var engA2 = EN.createEngine({ initial_state: 'hot_zero_power' });
  EN.command(engA2, 'rod_speed', 'fast');
  EN.command(engA2, 'rod_target', bank());
  var tsA2 = null;
  for (kk = 0; kk < walk(200) / DT && !(tsA2 && tsA2.scrammed); kk++) tsA2 = EN.step(engA2, DT);
  ckT('a continuous fast pull from subcritical IS the startup accident, and the startup ' +
      'net FIRST rung answers it',
      tsA2.scrammed === true && engA2.pt.trip_cause === 'ir_high_flux',
      'cause ' + engA2.pt.trip_cause + ' at ' + tsA2.power_pct.toFixed(1) + ' % (the ' +
      'overshoot is the sourced 0.5 s delay at a fast period)');

  /* THE CONTROLLED STARTUP — a MEASURED operator profile, RE-DERIVED for the 627-step bank
   * (#602 phase 2) and NOT rescaled from the old one. Scaling it by the bank ratio produced a
   * fixture that scrammed mid-ladder and threw, because criticality is set by boron against rod
   * worth and the worth CURVE moved too (curve_flatten 0.8 -> 0.36): the same FRACTION of travel
   * is now a different amount of reactivity. A measured profile has to be re-measured.
   *
   * Measured settled at Normal from hot_zero_power, 719 ppm:
   *   224 -> 0.36 %  (critical, below P-10) · 232 -> 10.75 % (P-10 MET) · 235 -> 12.97 %
   *   250 -> 20.80 % (IR rod stop asserts) · 258 -> 24.13 % · 261 -> SCRAM on ir_high_flux
   *   and with both blocks taken, 295 -> 38.0 % untripped, past the 35 % power-range setting. */
  var engS2 = EN.createEngine({ initial_state: 'hot_zero_power' });
  EN.command(engS2, 'rod_speed', 'normal');
  EN.command(engS2, 'rod_target', 224);
  var tsS2 = run(engS2, walk(180) + 400);   /* + SETTLING: on the flatter curve power lags
                                             * the bank by minutes, and the old holds were sized
                                             * for a bank 3x shorter. Measured: 224 steps settles
                                             * at 0.36 %, and it takes ~400 s to get there. */
  var p84 = tsS2.power_pct;
  EN.command(engS2, 'rod_target', 235);
  tsS2 = run(engS2, walk(30) + 400);
  /* BOTH P-10 blocks, in the order the procedure takes them (#601). The intermediate-range one
   * first: it clears the 20 % C-1 rod stop as well as its own 25 % trip, and without it the
   * `rod_target 96` below is REFUSED by the stop — measured, this fixture threw on arrival. */
  EN.command(engS2, 'ir_high_block', true);      /* above P-10 here — measured 18.2 % */
  EN.command(engS2, 'low_flux_block', true);
  var pBlk = tsS2.power_pct;
  tsS2 = run(engS2, walk(90));
  EN.command(engS2, 'rod_target', 295);
  tsS2 = run(engS2, walk(180) + 600);
  ckT('a CONTROLLED startup works end to end: critical partway up the bank, the block ' +
      'taken above P-10, and the ascension passes the 35 % setpoint UNTRIPPED',
      /* ⚠ THE LOWER BOUND WAS PINNED TO A CLIFF (#590, 2026-08-29), and #602 moved it again —
       * 0.05 -> 0.005, because the critical leg on this bank measures 0.02 %. The CLAIM has not
       * changed and neither has the trap: pin the claim, not the number. Original note follows.
       * It read `p84 > 0.2` while
       * the fixture measured 0.2115 — passing by 5 % on a quantity instrument NOISE moves. The
       * #590 noise re-derivation shifted it to 0.1994 and this reddened, on a plant whose
       * startup is unchanged in every way the check claims to be about: the block still comes
       * at 17.8 % above P-10, the ascension still passes 35 % untripped, and the ordering is
       * intact. The standing trap in one line — a check can pin a NUMBER instead of a CLAIM.
       * The claim is that the critical leg is measurably above zero and far below the block
       * point; 0.05 says that and holds on both builds (0.2115 and 0.1994). */
      p84 > 0.005 && p84 < 8 && pBlk > 8 &&
      tsS2.power_pct > 36 && tsS2.scrammed === false &&
      engS2.rpsReport.low_flux_blocked === true && engS2.rpsReport.ir_high_blocked === true,
      'critical leg ' + p84.toFixed(2) + ' %, blocked at ' + pBlk.toFixed(1) +
      ' %, now ' + tsS2.power_pct.toFixed(1) + ' % unscrammed');

  /* P-10 owns the request: a block taken at source level is revoked on the next step */
  var engR2 = EN.createEngine({ initial_state: 'hot_zero_power' });
  EN.step(engR2, DT);
  EN.command(engR2, 'low_flux_block', true);
  var reqAt = engR2.pt.blockLowFlux;
  EN.step(engR2, DT);
  ckT('below P-10 the block request is AUTO-REVOKED (the sourced asymmetric gate)',
      reqAt === true && engR2.pt.blockLowFlux === false, '');

  /* RE-AIMED 2026-08-31 (#524): `cold_shutdown` EXISTS now — the old form of this check
   * pinned the refusal to that name and flipped red the day the IC landed. The claim is the
   * refusal MECHANISM (#502: an accepted-then-ignored preset is a menu that lies), so it is
   * asserted with a name no registry will ever carry — and the flip side is asserted too:
   * the five real names all construct. */
  var threwIC = null;
  try { EN.createEngine({ initial_state: '5_percent' }); }
  catch (eIC) { threwIC = /unknown initial_state/.test(eIC.message); }
  ckT('an IC this engine does not carry THROWS (5_percent is the retired engine\'s — ' +
      'declared refusal, not silently hot-full-power)',
      threwIC === true, '');
  ckT('cold_shutdown CONSTRUCTS — Mode 5 exists (#524; it threw here until 2026-08-31)',
      (function () {
        var e5 = EN.createEngine({ initial_state: 'cold_shutdown' });
        var t5 = EN.step(e5, DT);      /* step returns the true state directly */
        return t5.plant_mode === 5 && /Cold Shutdown/.test(t5.plant_mode_name) &&
               Math.abs(t5.tavg_c - 50) < 2;
      })(), 'boots Mode 5 at ~122 degF');

  /* ---- THE RATED SCALE IS FROZEN (#539) --------------------------------------------------
   * `rated_steam` is every secondary normalization's denominator, and PWR2_VALIDATION.md:3808
   * declares it "frozen at the RATED scale" whatever the IC's own dispatch is. It was frozen
   * on NEITHER of steamDemand's two axes: the literal read each preset's OWN sg.P (50 % and
   * Hot Standby drifted +0.57 % / +0.88 %) and a second recompute in the cold branch ran after
   * the dispatch had been zeroed, so Mode 4 booted at 0.0000 kg/s.
   *
   * THIS ASSERTS THE INVARIANT ITSELF, not one of its consequences — which is why the defect
   * lived through 93 green runners: every existing check measured a consequence at a single
   * preset, and a denominator that is wrong at every preset in a DIFFERENT way is invisible
   * that way. Four presets, one number, and the number is re-derived here from the rated
   * dispatch and the design pressure rather than read back off the engine. */
  var RATED_ICS = ['hot_full_power', '50_percent', 'hot_zero_power', 'hot_shutdown',
                   'cold_shutdown'];
  var ratedVals = RATED_ICS.map(function (n) {
    return EN.createEngine({ initial_state: n }).rated_steam;
  });
  var ratedRef = TB.steamDemand(TB.createTurbine({ load_target_mwe: TB.TURB.mwe_rated }),
                                G.createSG({}).P, G.SG.h_feed);
  var ratedSpread = Math.max.apply(null, ratedVals) - Math.min.apply(null, ratedVals);
  ckT('the RATED SCALE is FROZEN: all five presets carry one rated_steam, and it is ' +
      'steamDemand at the rated dispatch and the DESIGN steam pressure',
      ratedSpread === 0 && ratedVals.every(function (v) { return v === ratedRef; }) &&
      ratedVals[0] > 0,
      ratedVals.map(function (v) { return v.toFixed(4); }).join(' / ') +
      ' kg/s, spread ' + ratedSpread.toExponential(1) + ', reference ' + ratedRef.toFixed(4));
  }

  if (grp('L')) {
  /* ---- 10. THE ROD INSERTION LIMIT (#507 §B, wave 8) — display/annunciator only on this
   * plant. THE CURVE RECEDES WITH POWER by design (deep insertion is legal at low power),
   * so a plain insertion never closes the margin — measured: the honest approach is rods
   * IN while power is RESTORED (dilution), which is exactly the operational story the RIL
   * exists for. ---- */
  head('THE ROD INSERTION LIMIT  [null below 5 %; 70 % floor at rated; the margin closes on dilution]');
  /* THE CURVE IS PERCENTAGES, AND ONLY ITS RENDERING MOVED (#602 phase 2). This asserted
   * `=== 140` and `~72`, which were 70 % and 35.8 % of a 200-step bank spelled as absolutes
   * — so the check reddened on a scale change that left the curve itself untouched. RIL is
   * `(lo_pct + (hi_pct - lo_pct) * f) / 100 * BANK()` and always was; the percentages are
   * the claim. 35.79 % at 50 % power is the curve's own arithmetic: f = 45/95. */
  ckT('the curve is the adopted pwr1 shape: null at and below 5 %, a 70 %-withdrawn floor ' +
      'at rated, monotone between',
      EN.insertionLimitSteps(0) === null && EN.insertionLimitSteps(5) === null &&
      EN.insertionLimitSteps(100) === frac(0.70) &&
      EN.insertionLimitSteps(50) > EN.insertionLimitSteps(20) &&
      Math.abs(EN.insertionLimitSteps(50) - frac(0.3579)) <= 1,
      'rated -> ' + EN.insertionLimitSteps(100) + ' of ' + bank() + ' steps (70 %); ' +
      '50 %% -> ' + EN.insertionLimitSteps(50) + ' (35.8 %)');
  var engL = EN.createEngine({});
  var tsL = run(engL, 20);
  ckT('at hot full power the limit is LIVE and generous: the floor near 70 % withdrawn, a ' +
      'margin near 30 % of the bank, not at limit',
      engL._rilSteps / bank() > 0.66 && engL._rilSteps / bank() < 0.71 &&
      engL._rodLimitMargin / bank() > 0.27 && engL._rodAtLimit === false,
      'RIL ' + engL._rilSteps + ' (' + (100 * engL._rilSteps / bank()).toFixed(1) +
      ' %), margin ' + engL._rodLimitMargin + ' (' +
      (100 * engL._rodLimitMargin / bank()).toFixed(1) + ' %)');
  var engZ = EN.createEngine({ initial_state: 'hot_zero_power' });
  EN.step(engZ, DT);
  ckT('at Hot Standby the limit does NOT APPLY — a bank parked at 0 stands NO limit alarm ' +
      '(the 5 % floor is what keeps every startup from opening annunciated)',
      engZ._rilSteps === null && engZ._rodAtLimit === false && engZ._rodLimitMargin === bank(),
      '');
  /* #510 LOW: a SCRAM exempts too — during every trip's decay seconds the rods drive to 0
   * while power is still above the 5 % floor, and both ROD LIMIT annunciators fired on
   * every scram as if a tripped reactor were violating its insertion limit */
  ckT('a SCRAM exempts the limit — mid-decay (rods driving in, power still above 5 %) the ' +
      'limit reads null and no ROD LIMIT alarm stands on a tripped reactor',
      (function () {
        var engS = EN.createEngine({});
        run(engS, 5);
        EN.command(engS, 'scram', true);
        var okAll = true, sawBand = false;
        for (var q = 0; q < Math.round(8 / DT); q++) {
          var tsS = EN.step(engS, DT);
          if (tsS.scrammed === true && tsS.power_pct > 5) {
            sawBand = true;
            if (engS._rilSteps !== null || engS._rodAtLimit !== false) okAll = false;
          }
        }
        return sawBand && okAll;
      })(), 'the pre-fix ladder read atLimit TRUE through the decay band of every trip');
  /* ---- THE LIMIT TRACKS POWER (#602 phase 2, re-aimed) --------------------------------------
   * This pair used to ride a bigger story: insert, power sags a long way, the limit recedes and
   * the margin opens wide, then dilute — power recovers, the limit climbs, the margin closes past
   * RIL+10 to the limit itself. That needed an insert that could sag power to ~85.8 %, which the
   * 200-step bank at curve_flatten 0.8 could deliver. On the sourced 627-step bank at 0.36 there
   * is very little worth in the TOP of the travel: the same fractional insert reaches only 98.3 %,
   * and inserting deep enough to sag power that far TRIPS on the way (measured: 66 % -> 87.6 %
   * and scram, 67 % -> 91.7 % and scram). That is not a regression — it is the reason a real
   * bank D sits near 210 of 231 and boron carries the bulk.
   *
   * ⚠ AND THE DILUTION IS NOT BROKEN, which is exactly what this looked like at first. Measured
   * over 600 s at -0.10 ppm/s from a 72 %-withdrawn insert:
   *     t=0    boron 625.8  power  98.32  Tavg 272.1  RIL 432  margin 19
   *     t=60   boron 620.9  power 100.66  Tavg 273.3  RIL 439  margin 12
   *     t=600  boron 611.8  power  96.16  Tavg 278.6  RIL 422  margin 29
   * Boron falls and power RISES first — the dilution lands. It then settles near 96 % while boron
   * keeps dropping, because at a HELD LOAD the negative moderator coefficient takes the added
   * reactivity as TEMPERATURE (Tavg 272 -> 279), not as power. A rods-manual plant at fixed load
   * reaches equilibrium where dilution buys degrees. Correct physics — and the reason the old
   * assertion has no window, rather than a reason to go looking for a defect.
   *
   * SO THE SURVIVING CLAIM IS THE ONE THE INTERLOCK IS ACTUALLY ABOUT: the limit CHASES POWER.
   * It is read from the same ride, and it never depended on how far an insert could sag the
   * plant. */
  EN.command(engL, 'rod_speed', 'fast');
  EN.command(engL, 'rod_target', frac(0.72));
  tsL = run(engL, walk(70));
  var rilIns = engL._rilSteps, marginIns = engL._rodLimitMargin, pwrIns = tsL.power_pct;
  ckT('the limit is LIVE under a deep insert: the bank is inside it, the margin is finite',
      rilIns > 0 && marginIns > 0 && marginIns < 60 && engL._rodAtLimit === false &&
      tsL.scrammed === false,
      'RIL ' + rilIns + ', margin ' + marginIns + ' at ' + pwrIns.toFixed(1) + ' % power');
  /* DILUTE, and watch the LIMIT follow the power — up while power rises, down as it settles. */
  EN.command(engL, 'boron_rate', -0.10);
  tsL = run(engL, 60);
  var rilHi = engL._rilSteps, pwrHi = tsL.power_pct;
  tsL = run(engL, 540);
  var rilLo = engL._rilSteps, pwrLo = tsL.power_pct;
  ckT('...and the LIMIT CHASES POWER — it rises with the dilution\'s power peak and recedes ' +
      'again as the negative MTC settles the plant at a lower power',
      pwrHi > pwrIns && rilHi > rilIns &&
      pwrLo < pwrHi && rilLo < rilHi && tsL.scrammed === false,
      'power ' + pwrIns.toFixed(1) + ' -> ' + pwrHi.toFixed(1) + ' -> ' + pwrLo.toFixed(1) +
      ' %, RIL ' + rilIns + ' -> ' + rilHi + ' -> ' + rilLo +
      ' — the limit is a FUNCTION of power, which is the whole interlock');
  /* ⚠ AT-LIMIT ITSELF, and this check exists because the MUTATION HARNESS CAUGHT ITS ABSENCE.
   * The re-aim above dropped the only ride that ever drove `_rodAtLimit` TRUE — the old story's
   * final "five more steps reaches the limit" — and `at-limit is never computed` immediately
   * came back BLIND. That flag is the ROD LIMIT LO-LO annunciator's whole basis, so losing its
   * coverage while re-aiming the checks around it would have been a silent trade.
   *
   * Driven DIRECTLY instead of through the dilution story that no longer has a window: put the
   * bank under the live limit and read the flag. The fact does not need the story. */
  var rilNow = engL._rilSteps;
  EN.command(engL, 'boron_rate', 0);
  EN.command(engL, 'rod_target', rilNow - 5);
  var tAL = 0;
  while (tAL < 300 && !engL._rodAtLimit && !tsL.scrammed) { tsL = run(engL, 5); tAL += 5; }
  ckT('...and AT-LIMIT is a real computed fact: park the bank under the live limit and the ' +
      'flag sets (the ROD LIMIT LO-LO row reads it)',
      engL._rodAtLimit === true && engL.rodSteps <= engL._rilSteps && tsL.scrammed === false,
      'bank ' + engL.rodSteps.toFixed(0) + ' <= RIL ' + engL._rilSteps + ' at ' +
      tsL.power_pct.toFixed(1) + ' % (t=+' + tAL + ' s)');
  }

  if (grp('M')) {
  /* ---- 11. THE RCP RESTART (#507 wave 9) — the one-way trip retired. Measured: from rest,
   * rated speed at +13 s, flow >90 % at +10 s — the real RCP start class. ---- */
  head('THE RCP RESTART  [the motor spins the coasted rotor back; the grid gates the start]');
  var engM = EN.createEngine({});
  run(engM, quiet ? 20 : 30);
  EN.command(engM, 'pump_trip', true);
  run(engM, 60);
  var flowLow = engM.sys.mdot_loop;
  EN.command(engM, 'rcp_start', true);
  var tM = 0;
  while (tM < 60 && engM.sys.mdot_loop < 0.9 * 1630) { run(engM, 1); tM += 1; }
  ckT('a coasted pump RESTARTS on the operator command: flow back above 90 % of rated ' +
      'inside the start class',
      flowLow < 0.5 * 1630 && engM.sys.mdot_loop > 0.9 * 1630 && tM <= 30,
      'coasted to ' + flowLow.toFixed(0) + ' kg/s, recovered at +' + tM + ' s');
  var engN = EN.createEngine({});
  run(engN, 2);
  EN.command(engN, 'station_blackout', true);
  EN.step(engN, DT);
  var thrM = false;
  try { EN.command(engN, 'rcp_start', true); } catch (eM) { thrM = /REFUSED/.test(eM.message); }
  EN.command(engN, 'station_blackout', false);
  EN.command(engN, 'rcp_start', true);
  ckT('the start is REFUSED out loud on a dead nonvital bus (WTSM 3.2 — no diesel feed) ' +
      'and LANDS once the grid is back: recovery hands back a stopped pump, the operator ' +
      'starts it',
      thrM === true && engN.sys.pumpTripped === false, '');
  }

  if (grp('N')) {
  /* ---- 12. THE SHUTDOWN IC (#507 wave 10) — Mode 4, Hot Shutdown: 250 degF / 350 psig,
   * RHR-held, RCPs secured, both banks in, the P-11 blocks taken. Mode 5 is deliberately
   * unbuilt (Layer 0's 0.1 MPa floor — Tsat 211 degF — see the ICS header). ---- */
  head('THE SHUTDOWN IC  [Mode 4 opens held; the #468 boron inversion cannot return; the heatup is real]');
  var engC = EN.createEngine({ initial_state: 'hot_shutdown' });
  var tsC = EN.step(engC, DT);
  ckT('opens ON its point: Mode 4 at 250 degF / 350 psig class, level 25 % (#510 batch 1, ' +
      'owner-ruled: the level PROGRAM\'s own value at 250 degF — the old 30 booted the ' +
      'controller 5 points above program), RCPs SECURED, ' +
      'RHR aligned with the HX throttled (a HOLD), the P-11 blocks taken, nothing latched',
      tsC.plant_mode === 4 && /Hot Shutdown/.test(tsC.plant_mode_name) &&
      Math.abs(tsC.tavg_c - 121.1) < 0.2 &&
      tsC.pressure_mpa * 145.038 > 358 && tsC.pressure_mpa * 145.038 < 370 &&
      Math.abs(tsC.pzr_level_pct - 25) < 1.5 &&
      engC.sys.pumpTripped === true && engC.sys.omega === 0 &&
      engC.rh.valve_open === true && engC.rh.hx_fraction === 0 &&
      engC.pt.blockLoPress === true && engC.pt.blockSI === true &&
      tsC.scrammed === false && engC.pt.si === false,
      tsC.tavg_c.toFixed(1) + ' degC / ' + (tsC.pressure_mpa * 145.038).toFixed(0) + ' psia');
  var bCold = tsC.boron_ppm;
  var engZ3 = EN.createEngine({ initial_state: 'hot_zero_power' });
  var bHzp = EN.step(engZ3, DT).boron_ppm;
  /* the DIRECT discriminator: what the INVERTED order would have produced is criticalBoron
   * at the AS-BUILT lineup (shutdown bank IN) + the margin — the bank's boron-equivalent at
   * cold is only ~84 ppm through the density coupling, which slid under this check's first
   * (+100 vs hot standby) form and made the inversion mutation BLIND; measured 999 correct
   * vs 915 inverted, so the gap is asserted against the model's own arithmetic, not a
   * remembered threshold */
  var K10 = globalThis.RD.pwr2.kinetics;
  var bInverted = K10.criticalBoron(engC.rx.kin, 121.1, 2.51, engC.rodBank,
                    engC.rx.kin.X / engC.rx.kin.X_eq_full, engC.rx.fuel.T_fuel_c) +
                  0.01 / K10.BORON.worth_per_ppm;
  ckT('THE #468 ORDER HOLDS: the cold boron is the trim-with-bank-OUT figure — measurably ' +
      'ABOVE what trimming with the bank IN would give (999 vs 915 measured), and above ' +
      'hot standby\'s (719): the bank\'s worth is margin in RODS, not paid in boron',
      bCold > bInverted + 40 && bCold > bHzp + 100,
      bCold.toFixed(0) + ' vs inverted-order ' + bInverted.toFixed(0) + ' vs HZP ' +
      bHzp.toFixed(0) + ' ppm');
  var tsC2 = run(engC, quiet ? 120 : 300);
  /* ⚠ THIS IS A BOOT CHECK, NOT A SETTLEDNESS CLAIM (#510 M-7): its first form was named
   * "HOLDS" off a 300 s Tavg band — the first 6 % of a monotone 75-minute transient the
   * band could never see. Settledness is run_pwr2_endurance's (equilibrium DERIVATIVES
   * over the ride's last window, ridden past the failure horizon); this window only pins
   * that the construction opens quiet. */
  ckT('...and the BOOT is quiet for 300 s: no trips, no SI, Mode 4 (settledness is ' +
      'run_pwr2_endurance\'s claim, not this window\'s)',
      Math.abs(tsC2.tavg_c - 121.1) < 2.5 && tsC2.scrammed === false &&
      engC.pt.si === false && tsC2.plant_mode === 4,
      'tavg ' + tsC2.tavg_c.toFixed(2));
  EN.command(engC, 'rcp_start', true);
  var tHeat0 = tsC2.tavg_c;
  var tsC3 = run(engC, quiet ? 300 : 600);
  var ratePerHr = (tsC3.tavg_c - tHeat0) * 9 / 5 * (3600 / (quiet ? 300 : 600));
  /* RE-BANDED, #510 H-7 (2026-08-24): the honest rate at the RATED rotor is 113.7 degF/hr —
   * the old 87.9 "under the 100 degF/hr limit" was the STALLED 93 % rotor's artifact (the
   * review's prediction, confirmed). The claim here is PHYSICS — pump heat warms the held
   * plant in its class, untripped — and the 100 degF/hr ADMINISTRATIVE limit is the
   * OPERATOR's to manage (RHR trim is on the same board); PWR2_VALIDATION §77 carries the
   * story and the §74 compliance sentence is retired there. */
  ckT('the HEATUP is real: pump heat alone warms the held plant in the sourced class ' +
      '(113.7 degF/hr at the rated rotor — ABOVE the 100 degF/hr admin limit, which is now ' +
      'the operator\'s procedure, not the plant\'s accident), untripped, no SI',
      ratePerHr > 40 && ratePerHr < 150 && tsC3.scrammed === false &&
      engC.pt.si === false && engC.sys.beyond_model !== true,
      ratePerHr.toFixed(1) + ' degF/hr, flow ' + engC.sys.mdot_loop.toFixed(0) + ' kg/s');
  /* the unblock cascade: clearing the SI block at shutdown pressure INJECTS — the mirror
   * of the board's unblock-at-power scram, and the reason the blocks are procedure */
  var engU = EN.createEngine({ initial_state: 'hot_shutdown' });
  EN.step(engU, DT);
  EN.command(engU, 'si_block', false);
  EN.command(engU, 'lo_press_trip_block', false);
  var tsU = run(engU, 10);
  ckT('clearing the P-11 blocks at 350 psig CASCADES: the low-pressure trip and SI both ' +
      'latch and the pumps start — protection working, and why the blocks are a procedure',
      tsU.scrammed === true && engU.pt.si === true && engU.ec.hhsiRunning === true, '');
  var thrP11 = false;
  try { EN.command(EN.createEngine({}), 'si_block', true); }
  catch (eP) { thrP11 = /P-11/.test(eP.message); }
  ckT('engaging either block ABOVE P-11 is REFUSED (the #295 defeatable-trip lesson)',
      thrP11 === true, '');

  /* ---- MODE 4's SECONDARY IS REAL (#539) -------------------------------------------------
   * Both checks assert the EFFECT — kilograms into the vessel, kilograms out of the valve —
   * never the demand. That distinction is the whole defect: the feed gauge read back exactly
   * what was dialled (25.1 / 50.1 / 100.0 %) while 0.0000 kg/s crossed the tube bundle, and
   * the code-safety annunciator lit OPEN while nothing left. A check on either indication
   * would have passed on the broken plant. */
  var engF = EN.createEngine({ initial_state: 'hot_shutdown' });
  var mF0 = engF.sg.mass;
  EN.command(engF, 'feed_auto', false);
  /* THE PUMPS ARE SECURED IN THIS INITIAL CONDITION SINCE #605, so start them — a demand with no
   * pump running correctly delivers nothing, and asserting flow without this line would be
   * asserting that a secured train feeds. (The shell's FEED PUMPS selector does this for the
   * player: AUTO or a non-zero MAN demand starts them.) */
  EN.command(engF, 'feed_pump_a', true); EN.command(engF, 'feed_pump_b', true);
  EN.command(engF, 'feed_manual_frac', 0.5);
  for (var ff = 0; ff < (quiet ? 60 : 120) / DT; ff++) EN.step(engF, DT);
  ckT('Mode 4 MAIN FEED DELIVERS: 50 % manual demand puts real mass in the steam generator ' +
      '(it delivered 0.0000 kg/s at every demand while rated_steam was 0)',
      engF.sg.mass - mF0 > 500 && isFinite(engF.ins.reading.steam_flow),
      'SG mass +' + (engF.sg.mass - mF0).toFixed(0) + ' kg (+' +
      ((engF.sg.mass - mF0) * 2.20462).toFixed(0) + ' lbm), steam_flow reading ' +
      engF.ins.reading.steam_flow);

  /* the code safeties, with the ADV isolated so it cannot mask them. Hot Standby is the
   * CONTROL arm: it always lifted to 0.84 x rated, so a Mode 4 that now matches it is the
   * scale being right rather than the valve being re-tuned. */
  function safetyPeak(icName) {
    var e = EN.createEngine({ initial_state: icName });
    EN.step(e, DT);
    e.advBlock = true;
    var pk = 0, op = false, t;
    for (var i = 0; i < 50; i++) {
      /* 8.3 MPa = 1189.1 psig, ABOVE the sourced 1174.2 psig at which the bank's top three
       * valves reach full lift (#542, Ginna UFSAR ch10 §10.3.2.4 + table: 1140 psig +3 %
       * accumulation). It was 8.2 MPa = 1174.6 psig, which clears that point by 0.4 psi —
       * measured green, but a fixture standing 0.4 psi from the thing it asserts is a fixture
       * waiting to go red on a rounding change. Measured on BOTH the pre-#542 lumped ramp and
       * the staggered bank, 8.3 MPa reads 0.84 x rated, so this is a better fixture rather than
       * one refitted to the change (HR10). */
      e.sg.P = 8.3;
      t = EN.step(e, DT);
      if (t.sg_safety_open) op = true;
      if (t.sg_safety_kgs > pk) pk = t.sg_safety_kgs;
    }
    return { peak: pk, open: op, rated: e.rated_steam };
  }
  var sfM4 = safetyPeak('hot_shutdown'), sfHZP = safetyPeak('hot_zero_power');
  ckT('Mode 4 CODE SAFETIES PASS FLOW at the designed 0.84 x rated — the annunciator used to ' +
      'light OPEN while 0.0000 kg/s left',
      sfM4.open && sfHZP.open &&
      Math.abs(sfM4.peak - 0.84 * sfM4.rated) < 0.5 &&
      Math.abs(sfM4.peak - sfHZP.peak) < 1e-6,
      'Mode 4 ' + sfM4.peak.toFixed(4) + ' kg/s vs Hot Standby ' + sfHZP.peak.toFixed(4) +
      '; 0.84 x rated = ' + (0.84 * sfM4.rated).toFixed(2));
  }

  if (grp('O')) {
  /* ---- 13. THE NEUTRON SOURCE, ON THE REAL PLANT (#536) ------------------------------------
   * `pwr2_kinetics` owns the term and its own gate proves the physics. What THIS gate owns is
   * everything the term touches once a plant is built around it: the subcritical initial
   * conditions are CONSTRUCTED at their own source equilibrium rather than at a literal, the
   * approach to criticality reads forwards, and a tripped plant stops falling.
   *
   * WHAT IT LOOKED LIKE BEFORE (measured on the shipped shell): hot standby untouched for 300 s
   * fell 3.6031e-5 % -> 6.3798e-8 % with the board reading -0.341 dpm and -76 s; pulling the
   * bank from there took the neutron level DOWN for another 60 s and 42 of the first 200 steps
   * before it turned; and an hour after a scram the board still read -0.322 dpm / -81 s. */
  head('THE NEUTRON SOURCE  [a subcritical plant HOLDS; the approach reads forwards; a trip levels off]');
  var SUBHOLD = quiet ? 60 : 300;
  function subLevel(eng) {          /* the equilibrium THIS plant's own reactivity implies */
    return K.sourceLevel(EN.step(eng, DT).reactivity_pcm / 1e5);
  }
  /* O1. SETTLED CONSTRUCTION (#502's bar). The seed used to be the retired engine's 1e-6 —
   * three decades above where this plant's source holds it — so free play opened with a
   * five-minute ring down, which is the defect's own symptom wearing a transient's face. */
  var engNS = EN.createEngine({ initial_state: 'hot_zero_power' });
  var nsEq = subLevel(engNS), nsOpen = EN.step(engNS, DT).power_pct / 100;
  var nsHeld = run(engNS, SUBHOLD).power_pct / 100;
  ckT('hot standby OPENS at its own source equilibrium — no ring, no literal',
      Math.abs(nsOpen / nsEq - 1) < 0.02,
      'opened at ' + nsOpen.toExponential(4) + ' against S·Lambda/(-rho) = ' +
      nsEq.toExponential(4) + '; the old seed was 1e-6, three decades high');
  ckT('...and HOLDS it untouched, instead of decaying to nothing',
      Math.abs(nsHeld / nsOpen - 1) < 0.02,
      nsOpen.toExponential(4) + ' -> ' + nsHeld.toExponential(4) + ' over ' + SUBHOLD +
      ' s; the sourceless plant fell by a factor of 568 over 300 s here');
  /* O2. THE LEVEL IS THE PLANT'S, NOT A CONSTANT. Mode 4 sits ~4,500 pcm deeper than hot
   * standby, so it must indicate LOWER — and by the ratio of the two reactivities. A hard-coded
   * seed passes O1 and fails this; that is the whole point of asserting two initial conditions. */
  var engNS4 = EN.createEngine({ initial_state: 'hot_shutdown' });
  var ns4Eq = subLevel(engNS4), ns4Open = EN.step(engNS4, DT).power_pct / 100;
  var ns4Held = run(engNS4, SUBHOLD);
  ckT('Mode 4 sits DEEPER and therefore indicates LOWER — the level tracks reactivity',
      Math.abs(ns4Open / ns4Eq - 1) < 0.02 && ns4Open < nsOpen * 0.5 &&
      Math.abs(ns4Held.power_pct / 100 / ns4Open - 1) < 0.02,
      'Mode 4 ' + ns4Open.toExponential(3) + ' (' + ns4Held.sr_counts_cps.toFixed(0) +
      ' cps) against hot standby ' + nsOpen.toExponential(3) + ' — a seeded literal would ' +
      'give both the same number');
  /* O3. THE APPROACH READS FORWARDS. The symptom a player meets: pulling rods while the meter
   * falls. Counted over the whole withdrawal, not sampled — a sample can straddle the dip. */
  var engAP = EN.createEngine({ initial_state: 'hot_zero_power' });
  run(engAP, 30);
  EN.command(engAP, 'rod_target', bank());
  var apFell = 0, apPrev = EN.step(engAP, DT).power_pct, apTs = null, apSteps = 0;
  for (var ap = 0; ap < Math.round((quiet ? 60 : 200) / DT); ap++) {
    apTs = EN.step(engAP, DT); apSteps++;
    if (apTs.power_pct < apPrev * 0.999999) apFell++;
    apPrev = apTs.power_pct;
    if (apTs.power_pct > 1) break;
  }
  ckT('the approach to criticality RISES from the first rod step — the meter never runs backwards',
      apFell === 0,
      apFell + ' of ' + apSteps + ' withdrawal steps fell; the sourceless plant took the level ' +
      'DOWN for 60 s and 42 of its first 200 steps before turning');
  ckT('...and the source range climbs with it, which is what makes 1/M readable',
      apTs.power_pct > 100 * nsOpen,
      'from ' + (nsOpen * 100).toExponential(2) + ' % to ' + apTs.power_pct.toExponential(2) +
      ' % over the withdrawal');
  /* O4. THE TRIPPED PLANT LEVELS OFF — WTSM 2.1 §2.1.10: the level "begins to decrease
   * exponentially with a startup rate of -1/3 decade per minute", which this plant already did,
   * and then "the neutron population eventually levels off". It was the levelling that was
   * missing: -0.322 dpm and -81 s at every sample of a 20 h ride, until kin.P underflowed to
   * exactly 0.0 at 16.62 h and the board read "steady" on a core with no neutrons in it.
   *
   * ⚠ LIVE-PASS ONLY, BY COST, AND SAYING SO. The decay from rated to source level is ~25 min of
   * plant — 90,000 steps — and running it inside every group-O mutation replay would put minutes
   * on this gate for a claim the three checks above already carry at the construction end. The
   * MUTATION-VISIBLE half of #536 is O1-O3; this is the end-to-end witness. */
  if (!quiet) {
    var engTR = EN.createEngine({});
    run(engTR, 60);
    EN.command(engTR, 'scram');
    var trMid = run(engTR, 540);                      /* 600 s: still on the decade rate */
    var trEnd = run(engTR, 1200);                     /* 1800 s: levelled */
    var trEq = K.sourceLevel(trEnd.reactivity_pcm / 1e5);
    ckT('a tripped plant falls at the sourced -1/3 decade per minute and THEN LEVELS OFF',
        trMid.startup_rate_dpm < -0.25 && trMid.startup_rate_dpm > -0.40 &&
        Math.abs(trEnd.startup_rate_dpm) < 0.02 &&
        Math.abs(trEnd.power_pct / 100 / trEq - 1) < 0.05,
        'SUR ' + trMid.startup_rate_dpm.toFixed(3) + ' dpm at 600 s (WTSM -1/3), ' +
        trEnd.startup_rate_dpm.toFixed(5) + ' dpm at 1800 s, holding ' +
        (trEnd.power_pct / 100).toExponential(3) + ' against S·Lambda/(-rho) = ' +
        trEq.toExponential(3) + ' — the board read -0.322 dpm and -81 s here for ever');
    ckT('...and the source range reads it, in the hundreds of counts rather than pinned at zero',
        trEnd.sr_counts_cps > 50 && trEnd.sr_counts_cps < 200 && trEnd.sr_energized === true,
        trEnd.sr_counts_cps.toFixed(0) + ' cps on a tripped plant');
  }
  }

  if (grp('P')) {
  /* ---- 14. HEATER ELEVATION, END TO END (#573) ---------------------------------------------
   * `pwr2_pressurizer`'s gate owns the derate itself. What THIS gate owns is the seam: the
   * plant publishes the ENERGIZED bank as `pzr_heater_kw` while the vessel receives the
   * DELIVERED heat, and the two are different numbers the moment the bank uncovers.
   *
   * ⚠ PUBLISHING THE DERATED NUMBER LOOKS RIGHT AND IS #538 ARRIVING BY A NEW ROAD: the shell
   * turns this field into `heater_power_pct` and the board's MANUAL button re-sends that
   * readback as the new demand, so the operator's demand would halve on every press over a
   * half-dry bank. A heater kW indication is ELECTRICAL — an uncovered element still draws
   * full current — so the energized value is also the prototypical one. */
  head('HEATER ELEVATION  [the plant publishes the BUS LOAD; the vessel receives the wetted heat]');
  var engHE = EN.createEngine({});
  run(engHE, 20);
  EN.command(engHE, 'pzr_heaters_manual', 1.0);
  var tsCov = run(engHE, 2);
  var covKw = engHE._pzr.heater_kW, covEn = engHE._pzr.heater_energized_kW;
  ckT('covered, the two agree — which is why nothing before this could tell them apart',
      Math.abs(covKw - covEn) < 1e-9 && covEn > 100 &&
      Math.abs(tsCov.pzr_heater_kw - covEn) < 1e-9,
      covEn.toFixed(2) + ' kW energized and delivered, wetted ' +
      engHE._pzr.heater_wetted_frac.toFixed(3));
  /* HE-3: stick the level channel HIGH so the 17 % bistable is fooled, then put the TRUE level
   * in the band. Straight into the state deliberately — draining through the CVCS would take
   * plant-minutes and would be measuring the charging controller, not this seam. */
  EN.command(engHE, 'instrument_fail',
             { id: 'pzr_level', mode: 'stuck', value: 55 });
  var HEB2 = RD.pressurizer.HEATERS.elev_bot_pct, HET2 = RD.pressurizer.HEATERS.elev_top_pct;
  /* ⚠ TWO TRAPS IN GETTING THE PLANT INTO THIS STATE, BOTH OF WHICH THIS PROBE WALKED INTO.
   *
   * FIRST: scale the vessel's LIQUID MASS, not `V_liq`. `V_liq` is DERIVED at the end of every
   * step from m_sub/m_sat and their densities, so an assignment to it survives one step and the
   * check then measures a COVERED bank while printing the level it had asked for — it passed
   * against a plant with no derate at all.
   *
   * SECOND: THE STATE DOES NOT HOLD, and that is physics rather than a fixture defect. Taking
   * ~1,400 kg out of the vessel drops RCS pressure, the subcooled loop expands, and the
   * pressurizer refills within a couple of steps. A pressurizer genuinely sitting in the heater
   * band means a genuinely drained RCS — which is the LOCA regime, and far more plant than this
   * seam needs. So the probe ADVANCES UNTIL THE STATE ARRIVES and asserts THERE, bounded, and
   * fails loudly if it never does. That is robust to the propagation delay changing; a hard
   * "step exactly twice" was not. */
  var lvlRatio = ((HEB2 + HET2) / 2) / (100 * engHE.pz.V_liq / RD.pressurizer.GEOM.V_pzr_m3);
  engHE.pz.m_sub *= lvlRatio; engHE.pz.m_sat *= lvlRatio;
  var tsDry = null, wetSeen = 1;
  for (var kHE = 0; kHE < 20 && tsDry === null; kHE++) {
    var rHE = EN.step(engHE, DT);
    if (engHE._pzr.heater_wetted_frac < 0.9) { tsDry = rHE; wetSeen = engHE._pzr.heater_wetted_frac; }
  }
  ckT('the bank really does uncover (the premise, MEASURED — the level is derived state)',
      tsDry !== null && wetSeen > 0.05 && wetSeen < 0.9,
      'wetted ' + wetSeen.toFixed(3) + (tsDry === null ? ' — NEVER REACHED' : ''));
  ckT('uncovered with the latch FOOLED: the BUS LOAD published, the WETTED heat delivered',
      tsDry !== null && engHE.pz.lowLevelCut === false && engHE.pz.heatersShed === false &&
      Math.abs(engHE._pzr.heater_energized_kW - covEn) < 1e-6 &&
      Math.abs(tsDry.pzr_heater_kw - covEn) < 1e-6 &&
      Math.abs(engHE._pzr.heater_kW - wetSeen * covEn) < 1e-6 &&
      engHE._pzr.heater_kW < 0.9 * covEn,
      'published ' + (tsDry ? tsDry.pzr_heater_kw.toFixed(2) : '?') + ' kW (the full bank), ' +
      'delivered ' + engHE._pzr.heater_kW.toFixed(2) + ' kW at wetted ' + wetSeen.toFixed(3) +
      ', cut ' + engHE.pz.lowLevelCut + ' — the gauge reads full and the pressure does not ' +
      'follow it, which is the whole of HE-3');
  /* THE OTHER END OF THE SAME FIELD, and without it "publish the energized bank" is satisfied
   * by publishing the INSTALLED bank — a constant, which reads full through a shed. The
   * published number has to be able to reach zero, and a bus-loading shed is what takes it
   * there (NUREG-0737 II.E.3.1, the latch group G exercises on the module side). */
  EN.command(engHE, 'offsite_power', false);
  var tsShed = run(engHE, 1);
  ckT('...and a SHED bank publishes zero — the field is the bus load, not the installed rating',
      engHE.pz.heatersShed === true && tsShed.pzr_heater_kw === 0 &&
      engHE._pzr.heater_energized_kW === 0,
      'shed ' + engHE.pz.heatersShed + ', published ' + tsShed.pzr_heater_kw + ' kW');
  }

  if (grp('Q')) {
  /* ---- 15. THE LETDOWN SPLIT (#624 items 14/25, owner-ruled 2026-09-04) --------------------
   * THREE THINGS USED TO BE ONE FIELD, and every fixture in this tree booted `letdownOpen = 1`,
   * so nothing could tell them apart:
   *   · the OPERATOR'S ORIFICE LINEUP (`cv.letdownOpen`) — the board's four-button selector;
   *   · the RHR-to-CVCS CROSS-CONNECT (HCV-128), which the source has FULLY OPEN whenever the
   *     plant is on shutdown cooling and which is not an orifice at all;
   *   · the 17 % low-pressurizer-level PROTECTIVE ISOLATE, which used to be written INTO the
   *     operator's selection — a de-energization in the demand, which never heals (#200).
   * The cold initial conditions now boot with the orifices OUT, which is what makes the
   * selector a control the player has a reason to touch (item 25: it was an orphan).
   *
   * ⚠ THE 17 % CUT CANNOT BE REACHED BY SCALING THE VESSEL — measured, and it is the HE-3 trap
   * one door along. Scaling `m_sub`/`m_sat` to a 12 % level at hot full power reddens nothing:
   * the subcooled loop expands into the drained vessel and the TRUE level was back at 58.3 %
   * before the instrument's lag had moved, so `lowLevelCut` never latched in 120 s. It takes a
   * SUSTAINED DRAIN, so this group opens a 2 cm2 cold-leg break and advances until the latch
   * arrives, bounded, failing loudly if it never does. */
  head('THE LETDOWN SPLIT  [lineup, cross-connect and protective isolate are three things]');
  var CVQ = RD.cvcs;

  /* 1. THE COLD BOOT. Orifices OUT, and the inventory balance still closes — on the
   * cross-connect, which is where the source puts low-pressure letdown. */
  var engQ = EN.createEngine({ initial_state: 'cold_shutdown' });
  var tsQ0 = run(engQ, 1);
  ckT('Mode 5 boots with the letdown orifices OUT (item 25: the selector had no job before)',
      engQ.cv.letdownOpen === 0 && engQ.cv.letdownIsolated === false,
      'letdownOpen ' + engQ.cv.letdownOpen + ' — WTSM ch.19 puts shutdown letdown on the ' +
      'RHR cross-connect HCV-128, not on the orifices');
  ckT('...and letdown still flows, at the NORMAL magnitude, through the cross-connect',
      Math.abs(engQ._letdownKgs - CVQ.normalLetdownKgs()) < 1e-12 && engQ.rh.running === true,
      engQ._letdownKgs.toFixed(4) + ' kg/s against a normal ' +
      CVQ.normalLetdownKgs().toFixed(4) + ' — a SHUT orifice lineup passing full letdown, ' +
      'which is the whole of the split');
  /* THE INVENTORY CLAIM, and the one that would have caught the shipped defect. On the
   * pre-split engine this same lineup (letdownOpen 0) passes NOTHING and the plant fills on its
   * own seal injection: measured 25.0 -> 35.3 % of pressurizer level in 20 plant-minutes, the
   * #510 H-2 water-solid path. Here it must sit still. */
  var lvlQ0 = tsQ0.pzr_level_pct;
  /* 10 plant-min loud, 5 quiet — NOT 20: the 20-min loud ride put this runner at 1708 s under
   * run_all contention (a 420 s hint) and made it the aggregate gate's tail. The fill is seal
   * injection at a fixed rate, so the pre-split figure scales: +10.2 points in 20 min is ~+5 in
   * 10 [extrapolated from the 20-min measurement, not re-measured] against a 1.0-point band,
   * while the split plant moves 0.02. */
  var tsQ1 = run(engQ, quiet ? 300 : 600);
  ckT('the cold plant\'s inventory CLOSES — level sits where it booted, not climbing to solid',
      Math.abs(tsQ1.pzr_level_pct - lvlQ0) < 1.0,
      lvlQ0.toFixed(2) + ' -> ' + tsQ1.pzr_level_pct.toFixed(2) + ' % over ' +
      (quiet ? 5 : 10) + ' plant-min (pre-split, same lineup: 25.0 -> 35.3 % in 20 min)');

  /* 2. THE 17 % CUT ISOLATES AND LEAVES THE SELECTION ALONE. */
  var engQ2 = EN.createEngine({});
  run(engQ2, 20);
  EN.command(engQ2, 'break_open', { area_m2: 0.0002, node: 'cold_leg' });
  var cutAtQ = null;
  for (var kQ = 0; kQ < Math.round(600 / DT) && cutAtQ === null; kQ++) {
    EN.step(engQ2, DT);
    if (engQ2.pz.lowLevelCut === true) cutAtQ = kQ * DT;
  }
  /* one more step: the CVCS steps BEFORE the pressurizer, so the flow on the latching step is
   * still last step's — the isolate reaches the flow on the next one (the house lag) */
  EN.step(engQ2, DT);
  ckT('a sustained drain reaches the 17 % cut (the premise, MEASURED — a scaled vessel refills)',
      cutAtQ !== null, cutAtQ === null ? 'NEVER REACHED in 600 s' :
      'latched at ' + cutAtQ.toFixed(1) + ' s on a 2 cm2 cold-leg break');
  ckT('the cut ISOLATES letdown and leaves the operator\'s orifice lineup exactly where it was',
      cutAtQ !== null && engQ2._letdownKgs === 0 && engQ2.cv.letdownIsolated === true &&
      engQ2.cv.letdownOpen === 1,
      'flow ' + engQ2._letdownKgs.toFixed(5) + ' kg/s, isolated ' + engQ2.cv.letdownIsolated +
      ', letdownOpen ' + engQ2.cv.letdownOpen + ' — the pre-split engine wrote 0 into the ' +
      'selection here and the player\'s A+B lineup was gone for good');

  /* 3. AND IT IS REFUSED WHILE THE CUT STANDS — the interlock's own shape. */
  EN.command(engQ2, 'break_close');
  EN.command(engQ2, 'letdown', 1);
  EN.step(engQ2, DT);
  ckT('an operator re-line while the cut still stands is REFUSED (WTSM §4.1.3.1 interlock)',
      engQ2.pz.lowLevelCut === true && engQ2.cv.letdownIsolated === true &&
      engQ2._letdownKgs === 0,
      'cut ' + engQ2.pz.lowLevelCut + ', still isolated, flow ' + engQ2._letdownKgs.toFixed(5));

  /* 4. NO AUTOMATIC RESTORATION. The latch clears at 20 %; letdown does not come back. */
  var clearAtQ = null;
  for (var jQ = 0; jQ < Math.round(900 / DT) && clearAtQ === null; jQ++) {
    EN.step(engQ2, DT);
    if (engQ2.pz.lowLevelCut === false) clearAtQ = jQ * DT;
  }
  EN.step(engQ2, DT);
  ckT('the latch clears at 20 % and letdown STAYS SHUT — there is no automatic restoration',
      clearAtQ !== null && engQ2.cv.letdownIsolated === true && engQ2._letdownKgs === 0,
      clearAtQ === null ? 'the latch never cleared in 900 s' :
      'cleared ' + clearAtQ.toFixed(1) + ' s after the break shut; still isolated, flow ' +
      engQ2._letdownKgs.toFixed(5) + ' — `Manuals/06` PWR-A13a: "letdown stays shut until you ' +
      're-open an orifice by hand"');

  /* 5. THE OPERATOR'S RE-LINE IS WHAT RESTORES IT. */
  EN.command(engQ2, 'letdown', 1);
  EN.step(engQ2, DT); EN.step(engQ2, DT);
  ckT('...and the operator\'s own re-line restores it, once the latch has gone',
      engQ2.cv.letdownIsolated === false && engQ2._letdownKgs > 0,
      'isolated ' + engQ2.cv.letdownIsolated + ', flow ' + engQ2._letdownKgs.toFixed(5) +
      ' kg/s — restoration is an ACT, which is the ruling');
  }

  if (grp('R')) {
  /* ---- 16. THE COLD PRESSURE-CONTROL LINEUP (#624 / #619 item 14, 2026-09-04) ---------------
   * *(OWNER, 2026-09-04: "next", to the recommendation "measure the heaters-OFF drift from
   * cold_shutdown and land item 14's remaining halves"; Mode 4 followed the same hour —
   * coordinator's call, 2026-09-04, on the measured Mode 4 numbers below.)*
   *
   * BOTH COLD INITIAL CONDITIONS boot with the pressurizer HEATERS OFF and the SPRAY IN HAND AND
   * SHUT — the lineup `pwr_cooldown` leaves behind, so the boot IC and a player's own
   * cooled-down plant now agree. Before this the engine set `pzDrivers: {}` for every initial
   * condition, i.e. heaters AUTO and spray AUTO on a plant whose reactor coolant pumps are
   * secured (the spray has no head: `SPRAY.needs_rcp` is true, and `rcp_gate_enforced: false` is
   * a declared deviation that lets the one lever stand in for auxiliary spray).
   *
   * ⚠ THIS GROUP WAS BUILT WITH MODE 4 ON THE OTHER SIDE OF THE LINE, and the reversal is worth
   * keeping in view: R1b asserted `hot_shutdown` in AUTO as a deliberate scope boundary, because
   * the ruling named the Mode 5 lineup. Then Mode 4 was measured — +12.2 psi/hr in AUTO against
   * +0.2 psi/hr off, the same defect at the same size — and the boundary went. A boundary drawn
   * from the WORDING of a ruling rather than from a measurement is the thing to distrust here.
   *
   * ⚠ THE CLAIM THE OLD NOTE MADE IS FALSE ON THIS ENGINE AND THESE CHECKS SAY SO. It read
   * "the surge-line exchange bleeds ~16 kW, -68 psi/hr", and the build plan for this change
   * asked for a check that pressure FALLS. Measured 2026-09-04, 60 plant-minutes from the boot
   * with the heaters off: 362.59 -> 362.85 psia, i.e. +0.3 psi/hr, RISING by a whisker. It is
   * structural: `surge_heat_kW` in pwr2_pressurizer is a MASS-TRANSPORT term (an outsurge
   * debiting its donor enthalpy to the hot leg) and this model carries no standing conduction
   * path out of the vessel, so a still isothermal plant has nothing to bleed. The claim asserted
   * below is therefore the one that is true and the one that matters — THE BUBBLE SURVIVES —
   * not the direction somebody expected it to move. */
  head('THE COLD PRESSURE-CONTROL LINEUP  [both cold ICs: heaters OFF, spray in hand; the ' +
       'bubble survives; the setpoint is inert until AUTO]');

  /* R1. THE BOOT LINEUP, AND THE SCOPE IN THE SAME BREATH: BOTH cold initial conditions follow,
   * at-power does NOT. The `ic.cold` predicate is what makes that true, and it is asserted from
   * both sides — a check on Mode 5 alone passes on the `icName === 'cold_shutdown'` form this
   * group shipped with for an hour, and a check on at-power alone passes on a plant that boots
   * every IC with the heaters off. */
  var engR5 = EN.createEngine({ initial_state: 'cold_shutdown' });
  var engR4 = EN.createEngine({ initial_state: 'hot_shutdown' });
  var engR1 = EN.createEngine({});
  var tsR5 = EN.step(engR5, DT);
  var tsR4 = EN.step(engR4, DT);
  ckT('Mode 5 boots HEATERS OFF and SPRAY IN HAND, SHUT — the lineup pwr_cooldown leaves',
      engR5.pzDrivers.heaters_manual === 0 && engR5.pzDrivers.spray_manual === 0 &&
      tsR5.pzr_heater_kw === 0,
      'heaters_manual ' + engR5.pzDrivers.heaters_manual + ', spray_manual ' +
      engR5.pzDrivers.spray_manual + ', ' + tsR5.pzr_heater_kw.toFixed(1) + ' kW on the bus — ' +
      'the AUTO boot delivered 18.2 kW at zero error and crept the IC off its own point');
  ckT('...and so does MODE 4 — both cold ICs follow, at-power does not (the cooldown turns the ' +
      'heaters off BEFORE the RHR align that makes the plant Mode 4)',
      engR4.pzDrivers.heaters_manual === 0 && engR4.pzDrivers.spray_manual === 0 &&
      tsR4.pzr_heater_kw === 0 &&
      engR1.pzDrivers.heaters_manual === undefined &&
      engR1.pzDrivers.spray_manual === undefined,
      'Mode 4 ' + JSON.stringify(engR4.pzDrivers) + ' at ' + tsR4.pzr_heater_kw.toFixed(1) +
      ' kW, hot full power ' + JSON.stringify(engR1.pzDrivers) + ' — Mode 4 in AUTO walked ' +
      '364.04 -> 376.28 psia in 60 min (+12.2 psi/hr), which is why the scope boundary went');

  /* R2. THE BUBBLE SURVIVES THE ALIGNMENT WINDOW. 15 plant-minutes is roughly where the heatup
   * checklist's heater step lands (pump start 30 s + the shutdown-bank withdrawal 660 s + the
   * small holds), so this is the question a player's plant actually asks: is there still a
   * pressurizer when I get there? Measured on the new boot: +0.012 psi over 15 min and
   * -0.026 points of level. On the OLD heaters-AUTO boot the same window reads +9.02 psi
   * (362.59 -> 371.62 psia), which the 3-psi band excludes — this check catches the revert. */
  var pR0 = tsR5.pressure_mpa * 145.0377, lR0 = tsR5.pzr_level_pct;
  var tsR15 = run(engR5, (quiet ? 300 : 900) - DT);
  var pR15 = tsR15.pressure_mpa * 145.0377;
  ckT('the bubble SURVIVES the alignment window: pressure holds, stays clear of the 300 psia ' +
      'orifice backpressure, level sits still and the 17 % cut never comes near',
      Math.abs(pR15 - pR0) < 3.0 && pR15 > 300 &&
      Math.abs(tsR15.pzr_level_pct - lR0) < 3.0 && engR5.pz.lowLevelCut === false,
      pR0.toFixed(2) + ' -> ' + pR15.toFixed(2) + ' psia over ' + (quiet ? 5 : 15) +
      ' plant-min (' + ((pR15 - pR0) * 60 / (quiet ? 5 : 15)).toFixed(2) + ' psi/hr; 60-min ' +
      'measurement 362.59 -> 362.85, +0.3 psi/hr), level ' + lR0.toFixed(2) + ' -> ' +
      tsR15.pzr_level_pct.toFixed(2) + ' %');

  /* R2b. AND SO DOES MODE 4's, WHICH IS THE CLAIM THAT MOVED THE SCOPE. Asserted separately
   * rather than folded into R2 with a loop: the two states differ in temperature by 128 degF
   * and their bubbles are at different saturation points, so "cold plants hold" is two
   * measurements, not one generalised from the colder. Measured on the new boot: 364.04 ->
   * 364.05 psia over 15 plant-min, 364.21 at 60 min (+0.2 psi/hr). On the AUTO boot the same
   * window reads 373.10 psia, +9.06 psi — outside this band, so this check catches the revert
   * from the Mode 4 side just as R2 does from the Mode 5 side. */
  var engR4b = EN.createEngine({ initial_state: 'hot_shutdown' });
  var ts4b0 = EN.step(engR4b, DT);
  var p4b0 = ts4b0.pressure_mpa * 145.0377, l4b0 = ts4b0.pzr_level_pct;
  var ts4b1 = run(engR4b, (quiet ? 300 : 900) - DT);
  var p4b1 = ts4b1.pressure_mpa * 145.0377;
  ckT('...and MODE 4\'s bubble survives its own window on the same lineup — the measurement ' +
      'that took hot_shutdown across the scope line',
      Math.abs(p4b1 - p4b0) < 3.0 && p4b1 > 300 &&
      Math.abs(ts4b1.pzr_level_pct - l4b0) < 3.0 && engR4b.pz.lowLevelCut === false,
      p4b0.toFixed(2) + ' -> ' + p4b1.toFixed(2) + ' psia over ' + (quiet ? 5 : 15) +
      ' plant-min (' + ((p4b1 - p4b0) * 60 / (quiet ? 5 : 15)).toFixed(2) + ' psi/hr; 60-min ' +
      'measurement 364.04 -> 364.21, +0.2 psi/hr, against +12.2 psi/hr in AUTO), level ' +
      l4b0.toFixed(2) + ' -> ' + ts4b1.pzr_level_pct.toFixed(2) + ' %');

  /* R3. THE NEXT CHECKLIST STEP IS INERT UNTIL THE HEATERS ARE IN AUTO — which is the whole
   * reason the heatup gains a step, and the claim its deletion-injection proves at the replay
   * level. Both arms, because either alone passes on the wrong plant: "the setpoint does
   * nothing" is satisfied by a plant whose heaters are broken, and "AUTO pressurizes" is
   * satisfied by the old boot, where the heaters were in AUTO all along. */
  function spRide(pressAuto) {
    var e = EN.createEngine({ initial_state: 'cold_shutdown' });
    var a = EN.step(e, DT);
    if (pressAuto) {
      EN.command(e, 'pzr_heaters_manual', null);   /* the board's AUTO button on PZR HEATERS */
      EN.command(e, 'pzr_spray_manual', null);     /* ...and on PZR SPRAY */
    }
    /* 11.72 MPa is 1700 psig, the floor of the dial's sourced span (WTSM 10.2) and exactly what
     * the heatup's next step asks for. A lower entry clamps to it — see pwr2_shell's span note. */
    EN.command(e, 'pzr_setpoint_mpa', 11.72);
    var b = run(e, quiet ? 300 : 600);
    return { d: (b.pressure_mpa - a.pressure_mpa) * 145.0377, kw: b.pzr_heater_kw,
             hm: e.pzDrivers.heaters_manual, sm: e.pzDrivers.spray_manual, shed: e.pz.shedLatch };
  }
  var spOff = spRide(false), spOn = spRide(true);
  ckT('the Pressure SP alone is INERT with the heaters off — dialling 1700 psig on the cold ' +
      'board moves nothing, which is why the heatup needs a step and not a comment',
      Math.abs(spOff.d) < 1.0 && spOff.kw === 0,
      spOff.d.toFixed(3) + ' psi over ' + (quiet ? 5 : 10) + ' plant-min at ' +
      spOff.kw.toFixed(1) + ' kW');
  ckT('...and pressing AUTO puts the ladder back in service: full bank, and the plant climbs',
      spOn.hm === undefined && spOn.sm === undefined && spOn.shed === false &&
      spOn.kw > 150 && spOn.d > 40,
      '+' + spOn.d.toFixed(1) + ' psi over ' + (quiet ? 5 : 10) + ' plant-min at ' +
      spOn.kw.toFixed(1) + ' kW (measured +63.9 psi at 5 min, +133.4 at 10), heaters_manual ' +
      spOn.hm + ' — the AUTO press clears the shed latch on its way through');
  }

  /* ⚠ SKIPPED IN MUTATION REPLAY UNLESS TARGETED, and that is a COST decision with a number.
   * These are two 35-minute rides, ~20 s of wall. A mutation with no `grp` tag replays EVERY
   * group, so the untagged entries in this file were each paying for both rides: measured, the
   * gate went 478 s -> 983 s when this group landed. No mutation targets group E (see the note
   * in MUTATIONS), so in replay it can only cost. `only === 'E'` keeps the door open for one. */
  if (grp('E') && (!quiet || only === 'E')) {
  /* ---- STEADY STATE: THE PLANT MUST SIT STILL WHEN NOTHING IS HAPPENING (#590) -------------
   * NOTHING IN THIS TREE ASSERTED THIS, on any variable, which is why the feed loop shipped
   * limit-cycling. The RETIRED engine carried a whole family of such checks for its own limit
   * cycles (#378, #394, #418 — see `test/behavior_pwr.js`, "…and STAYS settled — 25-35 min p2p
   * <= 6 pts"); PWR2 inherited none of them. That is the gap, and it is the same shape as every
   * other thing this plant inherited by reference and never re-measured.
   *
   * *(OWNER RULING, 2026-08-29: selected "0.5 % peak-to-peak narrow range" from options I wrote
   * — a selection, not verbatim words.)* The number is a judgement: WTSM 11.1 gives only the
   * TRANSIENT bounds the level program exists to satisfy (shrink on a 50 % load reduction must
   * not trip low-low; swell on a 10 % step must not back water into the separators) and says
   * nothing about steady state.
   *
   * ⚠ DETRENDED, AND THAT IS NOT A REFINEMENT. A plain peak-to-peak cannot tell a limit cycle
   * from a DRIFT, and the manual control below is almost entirely drift — reading it with a raw
   * span reports 1.6 % of "oscillation" on a plant whose level is flat to three decimals. That
   * mistake made my first reading of #590 wrong, in the direction of blaming the steam generator
   * instead of the controller. */
  head('STEADY STATE  [a plant doing nothing must LOOK like it, #590]');
  function detrendP2P(a) {
    var N = a.length, sx = 0, sy = 0, sxx = 0, sxy = 0, i;
    for (i = 0; i < N; i++) { sx += i; sy += a[i]; sxx += i * i; sxy += i * a[i]; }
    var b = (N * sxy - sx * sy) / (N * sxx - sx * sx), a0 = (sy - b * sx) / N;
    var lo = Infinity, hi = -Infinity;
    for (i = 0; i < N; i++) { var r = a[i] - (a0 + b * i); if (r < lo) lo = r; if (r > hi) hi = r; }
    return hi - lo;
  }
  /* 35 min, sampled at 1 Hz, and the claim is read off the LAST TEN MINUTES — a window far
   * enough from the boot that a settling transient cannot be mistaken for a cycle. Measured
   * cost: ~10 s of wall for the ride, which is why this is affordable at all. */
  function quietRide(manualPct) {
    var e = EN.createEngine({}), lvl = [], pwr = [], t;
    var N = Math.round(2100 / DT), s1 = Math.round(1 / DT);
    for (var i = 1; i <= N; i++) {
      t = EN.step(e, DT);
      if (i === Math.round(300 / DT) && manualPct !== undefined)
        EN.command(e, 'feed_manual_frac', manualPct / 100);
      if (i % s1 === 0) { lvl.push(t.sg_level_pct); pwr.push(t.power_pct); }
    }
    return { lvl: detrendP2P(lvl.slice(1500)), pwr: detrendP2P(pwr.slice(1500)) };
  }
  var ssAuto = quietRide(undefined);
  ckT('SG level sits still at constant full power — <= 0.5 % peak-to-peak over the 25-35 min ' +
      'window, detrended (owner-ruled criterion; 1.975 % before #590)',
      ssAuto.lvl <= 0.5,
      'level ' + ssAuto.lvl.toFixed(3) + ' % p2p');
  ckT('...and so does reactor power, with the rods STATIC — a plant with no automatic rod ' +
      'control (#528) has nothing that should be moving it',
      ssAuto.pwr <= 0.25,
      'power ' + ssAuto.pwr.toFixed(3) + ' % p2p');
  /* THE CONTROL, and it is what makes the two above mean anything. A quiet plant and a DEAD
   * plant look identical from a p2p reading; this one proves the ride is live and that the
   * feed CONTROLLER is the energy source, because the same plant with the valve pinned is
   * flat to three decimals. Without it the checks could be satisfied by an engine that had
   * stopped integrating. */
  var ssMan = quietRide(100);
  ckT('...and the MANUAL ride is quieter still, which is what says the loop is the source',
      ssMan.lvl < ssAuto.lvl && ssMan.lvl < 0.05,
      'manual ' + ssMan.lvl.toFixed(4) + ' % p2p against auto ' + ssAuto.lvl.toFixed(3));
  }
}

/* the tally line names the FILE that was run, because run_all scores each part against its own
 * BASELINES entry and a human reading a red needs to know which one to re-run */
var RUNNER_NAME = 'run_pwr2_engine' + (PART && !ALL && !GROUP_OVERRIDE ?
  '_' + PART_NAMES[PART].toLowerCase() : '');
var PART_LABEL = GROUP_OVERRIDE ? '--groups=' + MY_GROUPS.join(',')
               : ALL ? 'the UNSPLIT whole (--all)'
               : 'part ' + PART_NAMES[PART] + ' of 3 (#637)';
console.log('\nPWR2 -- THE ENGINE FACADE: one door, the gates\' wiring written once');
console.log('  ' + PART_LABEL + ' -- groups ' + MY_GROUPS.join(' ') +
  ' of ' + GROUPS.join(' '));
var rec = [];
runSuite(loadAll(), rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var ENSRC = fs.readFileSync(path.join(SRC, 'pwr2_engine.js'), 'utf8').replace(/\r\n/g, '\n');
var MUTATIONS = [
  /* ⚠ THE STEADY-STATE CHECKS (group E, #590) CARRY NO MUTATION, DELIBERATELY, and the reason
   * belongs here rather than in a silence. This harness can only mutate `pwr2_engine.js` and
   * `pwr2_core.js`; the constants those checks are about live in `pwr2_instruments.js` and
   * `pwr2_feedwater.js`, so any entry here would ANCHOR MISS and read as a blind spot.
   *
   * They have the stronger proof instead: **they were RED on the pre-fix build and are green on
   * the fix** — level 1.975 % and power 0.567 % against 0.361 % and 0.141 % now, with the
   * criterion unchanged between the two runs. A check that failed on the real defect and passes
   * on the real repair has been injection-verified by the defect itself, which is worth more
   * than a synthetic revert. The mutation that DOES pin the cause lives where the cause lives:
   * `run_pwr2_instruments`'s "the noise correlation reverts to a flat 8 s". */
  ['the facade hold is unwired — every subsystem keeps stepping a held plant (#585)',
   'if (eng._dead || (eng.sys && eng.sys.beyond_model === true)) {',
   'if (eng._dead) {', { grp: 'D' }],
  ['the pressurizer relief sink is dropped (mass relieves without leaving)',
   "srcs.push({ node: 'hot_leg', mdot: -eng._pzRelief, h: sys.nodes[iHL].h });",
   '', { grp: 'A' }],
  ['the relief sink is booked at the DISCHARGE enthalpy again (#563 item 5 — the double debit)',
   "srcs.push({ node: 'hot_leg', mdot: -eng._pzRelief, h: sys.nodes[iHL].h });",
   "srcs.push({ node: 'hot_leg', mdot: -eng._pzRelief, h: eng._pzReliefH });",
   { grp: 'A' }],
  ['the level controller is unhooked from charging',
   'eng.cv.chargingDemand = pzr.charging_demand;',
   '', { grp: 'A' }],
  /* anchor moved with the wave-6 ATWS gate (#507): the caller's half grew !scramBlocked */
  ['the scram-on-trip is deleted (the RPS reports into a void)',
   "if (ptr.reactor_trip && !eng._lastTrip && !eng.scramBlocked) {\n      eng.rodTarget = 0; eng._scramT = 0; eng.runaway = null;\n    }",
   '', { grp: 'A' }],
  ['SI never starts the ECCS',
   'if (ptr.si) { eng.ec.hhsiRunning = true; eng.ec.lhsiRunning = true; }',
   '', { grp: 'D' }],
  ['the oxidation heat is never fed back',
   'eng._Qox = dr.Q_ox_kW;',
   'eng._Qox = 0;', { grp: 'D' }],
  ['the RHR heats merge is dropped (an aligned system removes zero heat — the #458 orphan)',
   "    var heats = rrx.heats;\n    if (rhrR.duty_kW > 0) {\n      heats = Object.assign({}, rrx.heats);\n      Object.keys(rhrR.heats).forEach(function (n) { heats[n] = (heats[n] || 0) + rhrR.heats[n]; });\n    }",
   '    var heats = rrx.heats;', { grp: 'D' }],
  /* anchor re-pointed #510 M-2: the door reads the INSTRUMENT with the truth fallback */
  ['the align door ignores the 425 psig permissive (a valve that opens at power)',
   "        else if ((eng.ins.reading.primary_pressure !== undefined\n                  ? eng.ins.reading.primary_pressure : eng.sys.P) * 145.038 - 14.7\n                 < RD.rhr.RHR.permissive_open_psig) eng.rh.valve_open = true;",
   '        else eng.rh.valve_open = true;', { grp: 'D' }],
  ['the rod slew is deleted (commands teleport the bank)',
   '      eng.rodSteps += move;',
   '      eng.rodSteps = eng.rodTarget;', { grp: 'A' }],
  /* #545, the three halves of the trip-breaker hold. The level hold and the door are
   * SEPARATELY sufficient for the normal-trip case — a one-sided injection would lie (#295) —
   * so each is anchored on its own and the checks discriminate them: kill the level hold and
   * the standing-demand ride moves the bank; kill the door and the refusal checks go quiet. */
  ['the control bank ignores the open trip breakers (the #545 rising-edge plant)',
   '    } else if (!rodDrivePowered) {',
   '    } else if (false) {', { grp: 'I' }],
  ['the SHUTDOWN bank ignores them (the half a control-bank-only check cannot see)',
   'if (eng._scramT === null && rodDrivePowered && eng.sdSteps !== eng.sdTarget) {',
   'if (eng._scramT === null && eng.sdSteps !== eng.sdTarget) {', { grp: 'I' }],
  /* anchor RE-POINTED at #572: rodDriveDoor grew the rod-stop branch, so the one-line trip
   * guard this named no longer exists. It went ANCHOR MISS rather than blind, which is the
   * louder of the two failures and the reason the runner reports them separately. */
  ['the rod drive door accepts silently instead of refusing by name',
   "    if (eng.pt.reactor_trip) {\n      if (!moving) return;",
   "    if (false) {\n      if (!moving) return;", { grp: 'I' }],
  /* #572: the ROD STOP half of the same door. Separate anchor because it fails separately —
   * the trip branch above refuses BOTH directions and this one refuses OUTWARD only, and a
   * single mutation could not tell the two apart. */
  ['the rod stop is clamped silently again (accepted, then discarded by the integrator)',
   '    if (!(target > steps + 1e-9)) return;',
   '    return;', { grp: 'I' }],
  ['the rod stop refuses INWARD motion too (the source says it never may)',
   '    if (!(target > steps + 1e-9)) return;',
   '    if (!(Math.abs(target - steps) > 1e-9)) return;', { grp: 'I' }],
  ['the dump controller never reaches the relief valves',
   'dump_demand: dcr.dump_demand,',
   'dump_demand: 0,', { grp: 'A' }],
  ['the manual-trip pushbutton wire is cut before the RPS',
   'manual_trip: eng._manualTrip',
   'manual_trip: false', { grp: 'A' }],
  ['the turbine flag never reaches the RPS (P-9 watches a wire that is not connected)',
   /* the SAME line exists in the dumpctl drivers EARLIER in the file, and a bare anchor cut
    * THAT one for two sessions while the full-suite replay's side effects hid it — the
    * scoped replay exposed the mis-anchor. Two-line anchor, unique to the RPS block. */
   "turbine_tripped: eng.tb.tripped,\n      steam_dumps_available: eng._cdAvail !== false,",
   "turbine_tripped: false,\n      steam_dumps_available: eng._cdAvail !== false,", { grp: 'B' }],
  ['the runback never reaches the turbine (the RPS warns into a void)',
   "        eng.tb.load_target_mwe = Math.max(0,\n          eng.tb.load_target_mwe - (2.0 * MWE_RATED / 60) * dt);",
   '', { grp: 'C' }],
  /* ⚠ RE-GROUPED C -> I at #574. The checks that catch this live in group I (the IR rod stop
   * during a controlled withdrawal); the tag said C, so the grp:-scoped replay ran a group with
   * no opinion about rod motion and reported BLIND. Verified by applying the mutation to the
   * engine by hand: it reddens TWO group-I checks. A wrong group tag is a mutation that scores
   * as uncovered while being covered — the mirror of one that scores as covered while not. */
  ['the rod stop never blocks (outward motion continues at 3 % from the trip)',
   '      if (eng._rodStopSig && move > 0) move = 0;',
   '', { grp: 'I' }],
  ['the pressurizer ladder wire is cut (control reads truth again; no lie can drive the heaters)',
   'indicated_pressure_mpa: eng.ins.reading.primary_pressure,',
   '', { grp: 'B' }],
  ['the dump controller wire is cut (a lying Tavg can no longer open the dumps)',
   "      tavg_c: eng.ins.reading.tavg !== undefined ? eng.ins.reading.tavg : tavg,\n      load_frac:",
   '      tavg_c: tavg,\n      load_frac:', { grp: 'B' }],
  ['the loop delta-T never reaches the RPS (both delta-T trips silently unavailable)',
   /* the first version replaced only the ternary CONDITION, leaving the truth branch live —
    * it built a truth-wire, not an absence, and nothing can see a truth-wire at steady state */
   "      delta_t_frac: rd.thot !== undefined ? (rd.thot - rd.tcold) / DT0_C\n                    : (tLeg(sys, 'hot_leg') - tLeg(sys, 'cold_leg')) / DT0_C,",
   '      delta_t_frac: undefined,', { grp: 'B' }],
  ['the RPS reads TRUTH, not the instruments (a failed channel can no longer lie to it)',
   'pressure_mpa: rd.primary_pressure !== undefined ? rd.primary_pressure : sys.P,',
   'pressure_mpa: sys.P,', { grp: 'B' }],
  /* The two INNER-GUARD core mutations MIGRATED to run_pwr2_core (2026-08-20g): the
   * control/instrument switchovers moved this gate's trajectories — both now escape through
   * the kinetics-runaway family first, so the inner thermodynamic guards never fire here and
   * the mutations went blind. The guards are pwr2_core's; they are now exercised there on
   * direct synthetic states (measure at the probe's own layer). The loadAll coreSource
   * machinery stays for future core mutations. */
  /* THE AFW STARTS (2026-08-20) */
  ['the facade never consumes the MDAFW start latch (the RPS reports, nobody acts)',
   '    if (ptr.afas_mdafw) eng.aw.mdafwRunning = true;',
   '', { grp: 'E' }],
  ['the facade never consumes the TDAFW start latch',
   '    if (ptr.afas_tdafw) eng.aw.tdafwRunning = true;',
   '', { grp: 'E' }],
  ['the AFW stream never reaches the SG — reported, hydraulically inert (the pre-build wiring)',
   /* anchor re-pointed #507 wave 5: the SG drivers grew the tube-leak pair after afw_h */
   'afw_kgs: awr.total_kgs, afw_h: awr.h_kJkg,',
   'afw_kgs: 0, afw_h: 0,', { grp: 'E' }],
  ['the protection never sees the SG level channel',
   '      sg_level_frac: rd.sg_level !== undefined ? rd.sg_level / 100 : undefined,',
   '      sg_level_frac: undefined,', { grp: 'E' }],
  ['reset_protection leaves the AFW-start latches standing (the pumps can never be secured)',
   '        eng.pt.afas_mdafw = false; eng.pt.afas_mdafw_cause = null;\n        eng.pt.afas_tdafw = false; eng.pt.afas_tdafw_cause = null;',
   '', { grp: 'E' }],
  ['the TDAFW switch is disconnected (one switch per pump, minus one)',
   "      case 'afw_tdafw':      eng.aw.tdafwRunning = !!value; break;",
   '', { grp: 'E' }],
  /* THE FEED TRAIN (2026-08-21) */
  ['feed ≡ steam quietly restored (the module computed, the SG fed what leaves it)',
   'var sr = G.stepSG(eng.sg, tavg, dt, { feed: fwr.feed_frac * eng.rated_steam, steam: out,',
   'var sr = G.stepSG(eng.sg, tavg, dt, { feed: out, steam: out,', { grp: 'F' }],
  ['loss of both pumps no longer trips the turbine (half the ch10 sentence)',
   '    if (mfLost) eng.tb.tripped = true;',
   '', { grp: 'F' }],
  /* #605: the arming, both ways. Severing it re-ships the defect that started this — a normal
   * Mode 4/5 lineup firing a casualty chain — and welding it ON re-ships the one the first fix
   * caused: a securing at power that never trips the turbine. An anchor on the arming expression
   * itself, so a refactor that moves the condition goes LOUD rather than blind. */
  ['the loss-of-main-feed chain is armed in every mode (a Mode 4/5 lineup fires the casualty)',
   '    var mfLost = fwr.main_feed_lost === true && !eng.rh.running;',
   '    var mfLost = fwr.main_feed_lost === true;', { grp: 'F' }],
  ['the loss-of-main-feed chain is never armed (securing both pumps at power does nothing)',
   '    var mfLost = fwr.main_feed_lost === true && !eng.rh.running;',
   '    var mfLost = false;', { grp: 'F' }],
  ['the fwi latch is never consumed (hi-hi reports into a void)',
   '    if (ptr.fwi) { eng.fw.isolated = true; eng.tb.tripped = true; }',
   '', { grp: 'F' }],
  /* anchor re-pointed #507 wave 4: the drivers object grew power_ok after si_active */
  ['the SI wire to the feed module is cut (no isolation ever arrives)',
   '      si_active: eng.pt.si,\n      /* main feed pumps are NONVITAL loads',
   '      si_active: false,\n      /* main feed pumps are NONVITAL loads',
   { grp: 'E' }],
  ['the shrink/swell shift is dropped from the internal channel',
   "    IN.stepInstruments(eng.ins, dt, ts, { shift: { sg_level: 0.8 * (eng._pwrRate || 0) } });",
   '    IN.stepInstruments(eng.ins, dt, ts);', { grp: 'F' }],
  /* THE ELECTRICAL PAIR (#507 wave 4) — one mutation per wire */
  ['the AFAS LOOP-start driver is cut (the sourced ch10 start never fires)',
   '      loss_of_offsite: !offsiteOk,',
   '      loss_of_offsite: false,', { grp: 'G' }],
  ['the feed train\'s grid wire is cut (blacked-out feed pumps keep feeding)',
   '      power_ok: offsiteOk\n    });',
   '      power_ok: true\n    });', { grp: 'G' }],
  ['the condenser\'s grid wire is cut (CW pumps spin with no electricity)',
   '      cw_pumps_running: eng.cwPumps && offsiteOk',
   '      cw_pumps_running: eng.cwPumps', { grp: 'G' }],
  /* anchor re-pointed #510 batches 1-3: the CVCS call grew rhr_letdown_ok + the SI boron pair */
  ['the CVCS and ECCS vital-bus wires are cut (charging and SI survive the blackout)',
   "    var cvr = CV.stepCVCS(eng.cv, sys, dt, { ac_available: acAvail, rhr_letdown_ok: eng.rh.running === true, si_kgs: eng._eccsKgs, si_ppm: EC.ECCS.rwst_boron_ppm });\n    var ecr = EC.stepECCS(eng.ec, sys, dt, { ac_available: acAvail });",
   '    var cvr = CV.stepCVCS(eng.cv, sys, dt, { rhr_letdown_ok: eng.rh.running === true, si_kgs: eng._eccsKgs, si_ppm: EC.ECCS.rwst_boron_ppm });\n    var ecr = EC.stepECCS(eng.ec, sys, dt);', { grp: 'G' }],
  ['the pressurizer\'s electrical drivers are cut (the wire that was dark before wave 4)',
   '      ac_available: acAvail,\n      offsite_ok: offsiteOk\n    }, eng.pzDrivers));',
   '    }, eng.pzDrivers));', { grp: 'G' }],
  ['the MDAFW power wire is cut (a blacked-out motor pump keeps pumping)',
   "    var awr = AW.stepAFW(eng.aw, dt, { mdafw_power_ok: acAvail });",
   '    var awr = AW.stepAFW(eng.aw, dt, {});', { grp: 'G' }],
  /* NO blackout-forgets-offsite mutation: `offsiteOk = offsite && !blackout` already makes
   * that write redundant, so the mutation could never red — the hollow-mutation trap the
   * house rule forbids. The write stays in the command as documented intent. */
  /* THE SGTR (#507 wave 5) — one mutation per seam */
  ['the SGTR backpressure driver is cut (the tube discharges against containment pressure)',
   'toSG ? { backpressure_mpa: sr.P_sec }\n                                         : { backpressure_mpa: eng._ctP }) : null;',
   '{ backpressure_mpa: eng._ctP }) : null;', { grp: 'H' }],
  ['the break backpressure is the frozen constant again (#543 — coolant climbs the gradient)',
   'toSG ? { backpressure_mpa: sr.P_sec }\n                                         : { backpressure_mpa: eng._ctP }) : null;',
   'toSG ? { backpressure_mpa: sr.P_sec } : {}) : null;', { grp: 'D' }],
  ['the containment-pressure stash is severed (#543 — the pass reads undefined for ever)',
   'eng._ctP = ctr.containment_pressure_mpa;',
   '', { grp: 'D' }],
  ['the SGTR stash is severed (primary water leaves and never reaches the SG)',
   '    eng._sgtrKgs = toSG && br ? br.mdot_kgs : 0;',
   '    eng._sgtrKgs = 0;', { grp: 'H' }],
  ['the SG never consumes the stream (the old engine\'s own defect: mass landed nowhere)',
   '                                          tube_leak_kgs: eng._sgtrKgs || 0,',
   '                                          tube_leak_kgs: 0,', { grp: 'H' }],
  ['the containment exclusion is dropped (a tube rupture pressurizes containment)',
   '    var mBr = br && !toSG && br.mdot_kgs > 0 ? br.mdot_kgs : 0;',
   '    var mBr = br && br.mdot_kgs > 0 ? br.mdot_kgs : 0;',
   { grp: 'H' }],
  ['the containment inlet books ONE enthalpy again (#566 — the relief rides at the break\'s h)',
   'h_kJkg: (mBr * (mBr > 0 ? br.source.h : 0) + mPz * eng._pzReliefH) / ctIn }',
   'h_kJkg: mBr > 0 ? br.source.h : eng._pzReliefH }',
   { grp: 'H' }],
  /* THE FAILURE LEVERS (#507 wave 6) */
  ['the ATWS gate is severed (a blocked scram drops the rods anyway)',
   'if (ptr.reactor_trip && !eng._lastTrip && !eng.scramBlocked) {\n      eng.rodTarget = 0; eng._scramT = 0; eng.runaway = null;\n    }',
   'if (ptr.reactor_trip && !eng._lastTrip) {\n      eng.rodTarget = 0; eng._scramT = 0; eng.runaway = null;\n    }',
   { grp: 'I' }],
  ['the runaway never drives (an injected withdrawal fault does nothing)',
   '      eng.rodSteps = Math.min(BANK(), eng.rodSteps + eng.runaway.rate * dt);',
   '', { grp: 'I' }],
  ['the rod-command refusal is severed (a faulted drive quietly obeys the lever)',
   "        if (eng.runaway) {\n          throw new Error('pwr2_engine: rod command REFUSED — continuous withdrawal failure ' +\n            'active; clear the failure first');\n        }",
   '', { grp: 'I' }],
  /* THE INITIAL CONDITIONS (#507 §F, wave 7) */
  /* re-pointed 2026-08-27 (#539): the anchor quoted the whole two-line `sg` expression, and
   * hoisting `sgDesign` out of it orphaned the mutation — a green 94/94 with a blind spot.
   * It now quotes the ONE line that carries the claim (the non-full-power branch). */
  ['the 50 % secondary lands at the full-power literal (an IC whose SG fights its plant)',
   "           : G.createSG({ P: W.P_sat(tavg0 - ic.pf * (TREF - W.T_sat(sgDesign.P))) });",
   '           : sgDesign;', { grp: 'K' }],
  /* THE RATED SCALE (#539) — one revert per axis steamDemand reads, because the shipped
   * defect got BOTH wrong and either alone is enough to break the invariant. */
  ['the rated scale reads the PRESET\'s own SG pressure again (the 0.57 / 0.88 % drift)',
   '      rated_steam: TB.steamDemand(tb, sgDesign.P, G.SG.h_feed),',
   '      rated_steam: TB.steamDemand(tb, sg.P, G.SG.h_feed),', { grp: 'K' }],
  /* scoped to K, not N: under this mutation Mode 4's rated_steam is 0 again, and pwr2_relief's
   * tightened `> 0` guard THROWS the moment such a plant is stepped — so in a stepping group it
   * scores "CRASH only, coverage untested". K's frozen-scale check only CONSTRUCTS, so the
   * mutation reds the claim itself. (The crash is the guard working; it is just not a test of
   * the check.) */
  ['the cold branch recomputes the rated scale after the dispatch is zeroed (Mode 4 back to 0)',
   '    if (ic.cold) {',
   '    if (ic.cold) {\n      eng.rated_steam = TB.steamDemand(tb, sgDesign.P, G.SG.h_feed);', { grp: 'K' }],
  ['the kinetics seed at full power regardless of the IC (the SS-6 class, re-armed)',
   '    var powf = ic.pf > 0 ? ic.pf : 1e-6;',
   '    var powf = 1.0;', { grp: 'K' }],
  ['the subcritical margin is dropped (an HZP that detonates on the first pull)',
   '    if (ic.subcritical) boron0 += 0.01 / RD.kinetics.BORON.worth_per_ppm;',
   '', { grp: 'K' }],
  /* anchor grew the cold branch in wave 10 */
  ['the no-load anchor reverts to the program\'s 557 degF (saturates above the MSSV pop)',
   "    var tavg0 = ic.cold ? ic.tavg_c\n              : ic.pf > 0 ? DC.tref(ic.load_mwe / MWE_RATED) : W.T_sat(G.SG.P_noload);",
   '    var tavg0 = ic.cold ? ic.tavg_c : DC.tref(ic.load_mwe / MWE_RATED);', { grp: 'K' }],
  /* anchor grew the cold branch in wave 10 */
  ['the HZP dump lineup is dropped (nothing holds the no-load plant)',
   "      dcDrivers: ic.pf > 0 ? {}\n               : ic.cold ? { mode: 'off' }\n               : { mode: 'pressure', pressure_setpoint_mpa: G.SG.P_noload },",
   "      dcDrivers: ic.cold ? { mode: 'off' } : {},", { grp: 'K' }],
  /* THE ROD INSERTION LIMIT (#507 §B, wave 8) */
  ['the RIL curve is deleted (no limit at any power)',
   '    if (!(P_pct > RIL.min_power_pct)) return null;',
   '    return null;\n    if (!(P_pct > RIL.min_power_pct)) return null;', { grp: 'L' }],
  ['the applicability floor is deleted (a Hot Standby bank at 0 stands LO-LO forever)',
   '    if (!(P_pct > RIL.min_power_pct)) return null;',
   '    if (false) return null;', { grp: 'L' }],
  ['at-limit is never computed (the LO-LO fact pinned false)',
   '    eng._rodAtLimit = ril !== null && eng.rodSteps <= ril;',
   '    eng._rodAtLimit = false;', { grp: 'L' }],
  ['the margin is pinned wide (the LO approach can never annunciate)',
   "    eng._rodLimitMargin = ril === null ? BANK() : Math.max(0, Math.round(eng.rodSteps - ril));",
   '    eng._rodLimitMargin = BANK();', { grp: 'L' }],
  /* THE HOIST ITSELF (#602 phase 1) — put a stale literal back at the site the ride harness
   * actually missed, and see whether anything notices. This is the mutation that makes the
   * bank-scale block above evidence rather than decoration: a clamp frozen at 200 does not
   * throw, it silently holds a longer bank part-withdrawn and hands back a plausible plant. */
  ['a bank-scale consumer keeps its own stale 200 (the clamp the ride harness missed)',
   '        eng.rodTarget = Math.max(0, Math.min(BANK(), +value)); break;',
   '        eng.rodTarget = Math.max(0, Math.min(200, +value)); break;', { grp: 'K' }],
  ['the scram insertion profile keeps its own stale 200 (a long bank strands part-out)',
   '      eng.rodSteps = Math.max(0, Math.min(eng.rodSteps, BANK() * (1 - eng._scramT / SCRAM_S)));',
   '      eng.rodSteps = Math.max(0, Math.min(eng.rodSteps, 200 * (1 - eng._scramT / SCRAM_S)));',
   { grp: 'K' }],
  /* THE RCP RESTART (#507 wave 9) */
  ['the start\'s electrical gate is severed (a blacked-out bus starts a 6,000 hp motor)',
   '        if (!(eng.elec.offsite && !eng.elec.blackout)) {',
   '        if (false) {', { grp: 'M' }],
  /* THE SHUTDOWN IC (#507 wave 10) */
  ['the #468 order is INVERTED (the bank inserts before the trim; the margin is paid in boron)',
   '    var boron0 = RD.kinetics.criticalBoron(rx.kin, tavg0, icP, rodBank,',
   '    if (ic.cold) rodBank[1].steps = 0;\n    var boron0 = RD.kinetics.criticalBoron(rx.kin, tavg0, icP, rodBank,',
   { grp: 'N' }],
  ['the cold boot forgets the P-11 blocks (the shutdown plant injects at construction)',
   '      pt: PT.createProtection({ blockLowFlux: ic.pf >= 0.1, blockIrHigh: ic.pf >= 0.1,\n                                blockLoPress: !!ic.cold, blockSI: !!ic.cold }),',
   '      pt: PT.createProtection({ blockLowFlux: ic.pf >= 0.1, blockIrHigh: ic.pf >= 0.1 }),',
   { grp: 'N' }],
  /* #601: the at-power ICs must take the INTERMEDIATE RANGE block too, or a 50 %/100 %
   * plant boots with the 25 % trip armed and scrams on arrival. The mutation drops that
   * half only, so it cannot be caught by anything the P-11 anchor above covers. */
  ['an at-power IC boots WITHOUT the intermediate-range block (it scrams on arrival)',
   '      pt: PT.createProtection({ blockLowFlux: ic.pf >= 0.1, blockIrHigh: ic.pf >= 0.1,',
   '      pt: PT.createProtection({ blockLowFlux: ic.pf >= 0.1, blockIrHigh: false,',
   { grp: 'K' }],
  ['the RHR hold throttle is dropped (the "held" plant cools at 560 degF/hr and drains)',
   '      eng.rh.hx_fraction = 0;',
   '      eng.rh.hx_fraction = 0.5;', { grp: 'N' }],
  ['the P-11 engage refusal is severed on the SI block (an at-power bypass)',
   "          if (pInd2 >= PT.P11.mpa) {",
   '          if (false) {', { grp: 'N' }],
  /* THE NEUTRON SOURCE'S CONSTRUCTION HALF (#536). The term itself lives in pwr2_kinetics and
   * is mutated there; what these three guard is that the plant is BUILT at the level it holds. */
  ['the subcritical seed reverts to the retired engine\'s 1e-6 literal (free play opens ringing)',
   '    if (ic.subcritical) {\n      var hCore0;', '    if (false) {\n      var hCore0;',
   { grp: 'O' }],
  ['the seed is taken BEFORE the boron trim, so it is built at the wrong margin',
   '      var rho0 = RD.kinetics.reactivity(rx.kin, tavg0, rx.fuel.T_fuel_c, boron0, rodBank,\n' +
   '                                        icP, hCore0);',
   '      var rho0 = RD.kinetics.reactivity(rx.kin, tavg0, rx.fuel.T_fuel_c, 0, rodBank,\n' +
   '                                        icP, hCore0);',
   { grp: 'O' }],
  ['the seed ignores the plant and uses a fixed reactivity (both ICs get the same level)',
   '      var pEq = RD.kinetics.sourceLevel(rho0);',
   '      var pEq = RD.kinetics.sourceLevel(-0.011372);', { grp: 'O' }],
  /* THE HEATER SEAM (#573). The one that matters is the first: it is the change a reasonable
   * editor makes on purpose, and it re-opens #538 from the other end. */
  ['the DERATED heater power is published, so the board\'s MANUAL capture walks the demand down',
   '    ts.pzr_heater_kw = pzr.heater_energized_kW;',
   '    ts.pzr_heater_kw = pzr.heater_kW;', { grp: 'P' }],
  ['the published heater power is pinned to the installed bank (the shed reads full)',
   '    ts.pzr_heater_kw = pzr.heater_energized_kW;',
   '    ts.pzr_heater_kw = 157.8;', { grp: 'P' }],
  /* THE LETDOWN SPLIT (#624 items 14/25). The first is the SHIPPED DEFECT restored, and it is
   * the one that matters: a protective action written into the operator's own demand. */
  ['the 17 % cut writes itself into the operator\'s lineup again (the demand-rewrite defect)',
   '    if (pzr.letdown_isolated) eng.cv.letdownIsolated = true;',
   '    if (pzr.letdown_isolated) eng.cv.letdownOpen = 0;', { grp: 'Q' }],
  ['the cut never isolates anything (the 17 % protection reports into a void)',
   '    if (pzr.letdown_isolated) eng.cv.letdownIsolated = true;',
   '', { grp: 'Q' }],
  ['the operator\'s re-line no longer clears the isolate (letdown can never come back)',
   '        if (eng.pz.lowLevelCut !== true) eng.cv.letdownIsolated = false;',
   '', { grp: 'Q' }],
  ['the re-line ignores the standing latch (a bypass of the interlock that closed the valves)',
   '        if (eng.pz.lowLevelCut !== true) eng.cv.letdownIsolated = false;',
   '        eng.cv.letdownIsolated = false;', { grp: 'Q' }],
  ['the cold boot opens the orifices again (item 25: the selector goes back to being an orphan)',
   'cv: CV.createCVCS({ boron_ppm: boron0, letdownOpen: ic.cold ? 0 : 1 }),',
   'cv: CV.createCVCS({ boron_ppm: boron0, letdownOpen: 1 }),', { grp: 'Q' }],
  ['the stepped letdown flow is never stashed (the board reads a permanent zero)',
   '    eng._letdownKgs = cvr.letdown_kgs;',
   '', { grp: 'Q' }],
  /* THE COLD PRESSURE-CONTROL LINEUP (#624 / #619 item 14). The first is the SHIPPED form
   * restored — heaters AUTO and spray AUTO on plants whose pumps are secured — and it is the
   * one that matters, because it looks like a working plant: the ladder holds a pressure, it
   * just holds it by doing the operator's job for him and creeping the IC off its own point
   * (+11.7 psi/hr at Mode 5, +12.2 at Mode 4). The second is the SCOPE BOUNDARY this group
   * shipped with for an hour — `icName === 'cold_shutdown'`, which drops Mode 4 back to AUTO
   * and is invisible to any check that only looks at Mode 5. */
  ['both cold ICs boot with the heaters in AUTO again (the ladder does the operator\'s job)',
   '      pzDrivers: ic.cold ? { heaters_manual: 0, spray_manual: 0 } : {},',
   '      pzDrivers: {},', { grp: 'R' }],
  ['MODE 4 drops back to AUTO (the Mode-5-only scope this group shipped with for an hour)',
   '      pzDrivers: ic.cold ? { heaters_manual: 0, spray_manual: 0 } : {},',
   '      pzDrivers: icName === \'cold_shutdown\' ? { heaters_manual: 0, spray_manual: 0 } : {},',
   { grp: 'R' }],
  ['the spray is left in AUTO on the cold plants (a valve armed with no pump head behind it)',
   '      pzDrivers: ic.cold ? { heaters_manual: 0, spray_manual: 0 } : {},',
   '      pzDrivers: ic.cold ? { heaters_manual: 0 } : {},', { grp: 'R' }]
];
var CORESRC = fs.readFileSync(path.join(SRC, 'pwr2_core.js'), 'utf8').replace(/\r\n/g, '\n');

/* ---- THE OWNERSHIP AUDIT (#637) -------------------------------------------------------------
 * The split's ONE new way to lose coverage: a mutation whose `grp` no part owns would simply
 * never replay, in any process, and every part would still print a green "no blind spots".
 * That is the #513 partition property applied to mutations, and it is asserted rather than
 * trusted — EVERY part evaluates it over the FULL list (not its own subset) and fails on it,
 * so the hole cannot hide in whichever part you did not run. Two ways to fall through: no
 * `grp` tag at all (the pre-split default replayed EVERY group, which the split cannot do),
 * and a tag naming a group that no `grp('X')` block in this file defines any more — the
 * mirror of the ANCHOR MISS the replay already reports, one level up. */
var unowned = [];
MUTATIONS.forEach(function (m) {
  var o = m[m.length - 1];
  var t = (o && typeof o === 'object' && o.grp) || null;
  if (!t) unowned.push(['NO grp TAG', m[0]]);
  else if (GROUPS.indexOf(t) < 0) unowned.push(['grp ' + t + ' IS NOT A GROUP IN THIS FILE', m[0]]);
});
var mine = MUT.select(MUTATIONS).filter(function (m) {
  var o = m[m.length - 1];
  var t = (o && typeof o === 'object' && o.grp) || null;
  return t !== null && MY[t] === true;
});
var ownedTotal = MUTATIONS.filter(function (m) {
  var o = m[m.length - 1];
  var t = (o && typeof o === 'object' && o.grp) || null;
  return t !== null && GROUPS.indexOf(t) >= 0;
}).length;

console.log('\ninjection self-test (' + mine.length + ' of ' + MUTATIONS.length +
  ' mutations — this part owns groups ' + MY_GROUPS.join(' ') + '):');
var blind = 0;
var MUTTIME = !!process.env.MUTTIME;
mine.forEach(function (m) {
  var _t0 = Date.now();
  var isCore = m[3] === 'core';
  var opts = m[m.length - 1];
  var grpTag = (opts && opts.grp) || undefined;
  var base = isCore ? CORESRC : ENSRC;
  var mutated = base.replace(m[1], m[2]);
  if (mutated === base) { console.log('  ANCHOR MISS ' + m[0]); blind++; return; }
  var rec2 = [], crashed = false;
  try {
    runSuite(isCore ? loadAll(undefined, mutated) : loadAll(mutated), rec2, !process.env.MUTDBG, grpTag);
  } catch (e) { crashed = true; }
  /* A crash counts as caught NO MATTER how many checks recorded first. The old form
   * (`rec2.length ? fails : 1`) was only right for a crash BEFORE the first check: a
   * mutation that crashed mid-group left every already-recorded check green and read as
   * BLIND — measured 2026-08-21, a null-crash in a probe's own note string wore the
   * blind-spot verdict through two full reruns. */
  var realReds = rec2.filter(function (r) { return !r.ok; }).length;
  var f2 = crashed ? 1 : (rec2.length ? realReds : 1);
  if (f2 === 0) { console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); blind++; }
  /* a crash-only catch is REPORTED AS ITSELF (#510 LOW): by this suite's own principle a
   * mutation that throws is worthless as coverage — the verdict stays "caught" (the crash
   * rationale above holds), but the label no longer lets it wear a physics check's face */
  else if (crashed && realReds === 0) {
    console.log('  caught    ' + m[0].padEnd(64) + 'CRASH only — no check red (coverage untested)');
  }
  else console.log('  caught    ' + m[0].padEnd(64) + f2 + ' checks red');
  if (MUTTIME) console.log('            [MUTTIME] ' + ((Date.now() - _t0) / 1000).toFixed(1) +
    ' s  grp ' + grpTag + '  ' + m[0].slice(0, 50));
});
loadAll();

if (unowned.length) {
  console.log('\n' + '!'.repeat(70));
  unowned.forEach(function (u) { console.log('  UNOWNED MUTATION (' + u[0] + '): ' + u[1]); });
  console.log('  A mutation no part owns NEVER REPLAYS — in this process or any other.');
  console.log('!'.repeat(70));
}

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (mine.length - blind) + '/' + mine.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
/* the partition's own arithmetic, printed every run: this part's share + the other parts' =
 * the whole list, with nothing unowned. `mine` is filtered by mut_flags too, so this line is
 * about OWNERSHIP and reads off the unfiltered totals. */
console.log('  partition: ' + ownedTotal + ' of ' + MUTATIONS.length +
  ' mutations owned by a part' + (unowned.length ? '  ** ' + unowned.length +
  ' UNOWNED -- GATE FAILS **' : '') + '; this part owns ' +
  MUTATIONS.filter(function (m) {
    var o = m[m.length - 1]; return o && o.grp && MY[o.grp] === true;
  }).length);
console.log('  ' + RUNNER_NAME + ': ' + pass + ' passed, ' + fail + ' failed  (' +
  rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit(fail > 0 || blind > 0 || unowned.length > 0 ? 1 : 0);
