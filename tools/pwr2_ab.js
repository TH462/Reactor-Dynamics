/*
 * pwr2_ab.js — THE A/B HARNESS. PWR2 against the reference engine. (#479)
 *
 * IT LIVES IN `tools/`, NOT `test/`, DELIBERATELY. `test/run_all.js` auto-discovers `run_*.js`
 * and fails on any runner it has no baseline for — but this harness reads ANOTHER WORKTREE and
 * calls the network, so its exit code tracks the state of `RD_workbench` and of GitHub rather
 * than the state of this repo. As a gate it would redden for reasons no change here could fix.
 * It is a measurement tool, the same class as `tools/perturb_sweep.js`.
 *
 *     node tools/pwr2_ab.js
 *
 * Blueprint/PWR2_DESIGN.md §25.1a owes this file four things, and they are the whole design:
 *
 *   1. RECORD THE REFERENCE SHA IN ITS OWN OUTPUT. "An A/B result that does not say which
 *      reference it ran against is not a result."
 *   2. REFUSE TO RUN AGAINST A DIRTY OR UNKNOWN REFERENCE TREE. Same reasoning as the vacuity
 *      guard: a comparison whose baseline you cannot name is indistinguishable from one you
 *      made up.
 *   3. TAKE THE FIRST BASELINE AFTER #472 LANDS, not before, so the pressurizer rebuild is
 *      inside the reference rather than straddling it.
 *   4. TREAT A REFERENCE MOVE AS A RE-BASELINE EVENT, NOT A REGRESSION. When the SHA changes,
 *      old divergences are void until re-measured — they were measured against a different plant.
 *
 * ---------------------------------------------------------------------------------------
 * THE REFERENCE TREE IS `workbench`, BY DIRECTIVE.
 *
 *   (OWNER DIRECTIVE, 2026-08-15: "For A/B testing, test it against the workshop worktree.")
 *
 * Read as C:\grok_build\RD_workbench — the only lane matching that name and the one carrying the
 * live engine work. §25.1a flags this reading rather than assuming it silently.
 *
 * WHY THAT IS THE RIGHT TREE AND NOT AN INCONVENIENCE: §25 exists because `engines/pwr/` is NOT
 * frozen and never could be — #472 is rebuilding the pressurizer inside it right now. Diffing
 * against workbench compares PWR2 to the NEWEST real plant instead of to a stale copy, and it
 * puts #472's work inside the reference by construction.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS HARNESS DOES **NOT** DO, AND WHY THAT IS THE POINT.
 *
 * IT DOES NOT WRITE A BASELINE WHILE #472 IS OPEN. That is item 3, and it is enforced in code
 * rather than left to whoever runs it. Until the pressurizer rebuild lands, every run here is
 * EXPLORATORY: it prints, it compares, it names its reference — and it records nothing. A number
 * recorded mid-rebuild would be a baseline straddling a moving plant, which is the precise defect
 * §25 was written about.
 *
 * IT DOES NOT COMPARE PRESSURE. PWR2 has no pressurizer (Layer 5 deliberately did not build one —
 * §25.3, the #472 race). Its loop is rigid, so its pressure is a closure result and the
 * reference's is a two-region bubble. Those are not the same quantity and diffing them would
 * produce a large, meaningless, confident number. The comparable set is the THERMAL-HYDRAULIC
 * one, which is what Layers 0-5 actually build.
 *
 * UNITS: the table prints US customary first per the house rule. Engine internals stay SI.
 */
'use strict';
var path = require('path');
var fs = require('fs');
var cp = require('child_process');

var REF_TREE = process.env.PWR2_AB_REF || 'C:/grok_build/RD_workbench';
var GREEN = '\x1b[32m', RED = '\x1b[31m', YEL = '\x1b[33m', DIM = '\x1b[2m',
    RST = '\x1b[0m', BOLD = '\x1b[1m';

function bail(msg) {
  console.log('\n' + RED + BOLD + '  A/B REFUSED' + RST + '  ' + msg + '\n');
  process.exit(2);
}

/* ---------------------------------------------------------------- §25.1a(2): name the reference
 * A tree we cannot interrogate, or one with uncommitted edits, is not a reference. Both are
 * refusals rather than warnings: a warning gets scrolled past and the number gets quoted anyway. */
function referenceState() {
  if (!fs.existsSync(REF_TREE)) bail('reference tree not found: ' + REF_TREE);
  var sha, dirty, subject;
  try {
    sha     = cp.execSync('git -C "' + REF_TREE + '" rev-parse HEAD', { encoding: 'utf8' }).trim();
    subject = cp.execSync('git -C "' + REF_TREE + '" log -1 --format=%s', { encoding: 'utf8' }).trim();
    dirty   = cp.execSync('git -C "' + REF_TREE + '" status --porcelain', { encoding: 'utf8' }).trim();
  } catch (e) {
    bail('cannot read git state of ' + REF_TREE + ' — ' + e.message.split('\n')[0]);
  }
  if (dirty) {
    bail('reference tree is DIRTY (' + dirty.split('\n').length + ' file(s)). A comparison whose\n' +
         '               baseline you cannot name is indistinguishable from one you made up.\n' +
         DIM + '               ' + dirty.split('\n').slice(0, 4).join('\n               ') + RST);
  }
  return { sha: sha, subject: subject, tree: REF_TREE };
}

/* ---------------------------------------------------------------- §25.1a(3): is the gate open?
 * Asks GitHub whether #472 has landed. NETWORK FAILURE IS NOT A PASS — if we cannot tell, we
 * assume it is still open, because the failure mode we are guarding against is recording a
 * baseline we should not have. Being wrong in that direction costs a re-run; the other direction
 * costs a wrong reference nobody notices. */
function pzrRebuildLanded() {
  try {
    var out = cp.execSync('gh issue view 472 --repo TH462/Reactor-Dynamics --json state -q .state',
                          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return { landed: out === 'CLOSED', known: true, state: out };
  } catch (e) {
    return { landed: false, known: false, state: 'UNKNOWN (gh failed)' };
  }
}

/* ---------------------------------------------------------------- the reference plant
 * Loaded from the REFERENCE TREE, not from here. That is the whole point — `engines/pwr/` in this
 * worktree is whatever this lane last merged, which is exactly the stale copy §25 objects to. */
function loadReference(tree) {
  ['engines/load_mode.js', 'engines/pwr/pwr_config.js', 'layers/control/pwr_control.js',
   'engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_primary.js',
   'engines/pwr/pwr_steam_generator.js', 'engines/pwr/pwr_instruments.js',
   'engines/pwr/pwr_engine.js'
  ].forEach(function (f) {
    var p = path.join(tree, f);
    if (!fs.existsSync(p)) bail('reference tree is missing ' + f);
    require(p);
  });
  return globalThis.RD;
}

function loadPWR2() {
  ['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_sources',
   'pwr2_sg'].forEach(function (f) {
    require(path.join(__dirname, '..', 'engines', 'pwr2', f + '.js'));
  });
  return globalThis.RD.pwr2;
}

/* ------------------------------------------------------------------------------- the comparison
 * Both plants are taken to a settled full-power condition and READ. No transient here: a
 * steady-state diff is the honest first A/B for a stack that has no control layer on one side.
 * Driving a transient would compare PWR2's absent controller against the reference's live one and
 * attribute the difference to physics. */
function runReference(RD) {
  var e = new RD.PWREngine();
  e.reset('full_power');
  for (var i = 0; i < 6000; i++) e.step(0.1);   /* 10 minutes of plant */
  return e.getTrueState();
}

function runPWR2(P2) {
  var W = P2.water, S = P2.sources, SG = P2.sg;
  var sys = S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41 });
  var sg = SG.createSG();
  var out = null;
  for (var i = 0; i < 30000; i++) {                /* 10 minutes at dt = 0.02 */
    var T_prim = W.T_from_h(node(sys, 'sg_primary').h, sys.P);
    out = SG.stepSG(sg, T_prim, 0.02, { feed: 165, steam: 165 });
    S.stepPlant(sys, 0.02, { corePower: 300000, sgDuty: out.duty_kW });
  }
  return { sys: sys, sg: out, W: W };
}

function node(sys, id) {
  for (var i = 0; i < sys.nodes.length; i++) if (sys.nodes[i].id === id) return sys.nodes[i];
  return null;
}

var C2F  = function (c) { return c * 9 / 5 + 32; };
var dC2F = function (c) { return c * 9 / 5; };           /* DIFFERENCES: x9/5, no offset */
var M2PSI = function (m) { return m * 145.038; };

/* ------------------------------------------------------------------------------------- report */
var ref = referenceState();
var gate = pzrRebuildLanded();

console.log('\n' + '='.repeat(78));
console.log('  ' + BOLD + 'PWR2 A/B — against `engines/pwr/` at a NAMED COMMIT' + RST);
console.log('='.repeat(78));
console.log('  reference tree     ' + ref.tree);
console.log('  reference SHA      ' + BOLD + ref.sha + RST + DIM + '  (clean)' + RST);
console.log('  reference HEAD     ' + DIM + ref.subject + RST);
console.log('  pressurizer #472   ' + (gate.landed ? GREEN + 'LANDED' + RST
                                                   : YEL + gate.state + RST));

var RD = loadReference(ref.tree);
var P2 = loadPWR2();
var A = runReference(RD);
var B = runPWR2(P2);

/* THE HOT NODE IS `core` AND THE COLD NODE IS `sg_primary`, AND THIS HARNESS GOT IT BACKWARDS
 * ON ITS FIRST RUN. Mapping "hot leg" onto the node where heat is REMOVED printed a loop dT of
 * -57.7 degF against the reference's +59.4 — a -197 % divergence that was pure naming. Swapped,
 * the same numbers agree to 2.9 %.
 *
 * The lesson is not "be careful": it is that AN A/B HARNESS IS A MEASURING INSTRUMENT AND ITS
 * OWN ERRORS PRESENT AS PHYSICS FINDINGS. A -197 % number is loud enough that someone would have
 * checked; a 5 % one from the same mistake would have been filed as a divergence and chased into
 * the engine. Hence the assertion below rather than a fixed comment. */
var bTh = B.W.T_from_h(node(B.sys, 'core').h, B.sys.P);
var bTc = B.W.T_from_h(node(B.sys, 'sg_primary').h, B.sys.P);
if (!(bTh > bTc)) bail('the node the harness calls HOT is not hotter (' + bTh.toFixed(1) +
                       ' vs ' + bTc.toFixed(1) + ' degC). Labels are swapped, or the loop is dead.');
if (!(A.thot_c > A.tcold_c)) bail('the REFERENCE hot leg is not hotter than its cold leg — the ' +
                                  'reference did not reach power, so nothing below is a comparison.');

/* ---------------------------------------------------------------- THE SATURATION-PAIR GUARD
 * READ THIS BEFORE ADDING A ROW. §29.3 says an A/B harness's own errors present as physics
 * findings, and this file then made the SAME MISTAKE A SECOND TIME, quietly, in the table
 * directly below that warning.
 *
 * The secondary temperature row was taken from the reference's `t_sg_c`, which is NOT a
 * saturation temperature at all -- Blueprint/CONTEXT.md §6.3 calls it the SG TUBE-BUNDLE node,
 * a metal temperature computed as `Tavg - split*(Tavg - Tsec)`. It sits 29.0 degF above the real
 * saturation temperature, and comparing it against PWR2's T_sec reported a -7.6 % divergence
 * where the truth is -2.5 %.
 *
 * THE FIRST MISTAKE PRINTED -197 % AND WAS CAUGHT IN MINUTES. THIS ONE PRINTED -7.6 %, WHICH IS
 * EXACTLY THE "5 % DIVERGENCE THAT GETS FILED AND CHASED INTO THE ENGINE" §29.3 PREDICTED. The
 * prediction was right and the warning did not stop it, because a warning addressed to a careful
 * reader is not a check.
 *
 * WHAT WOULD HAVE CAUGHT IT, WITHOUT KNOWING ANY FIELD SEMANTICS: for saturated water, pressure
 * and temperature are LOCKED. A -10.8 % pressure divergence and an independent -7.6 % temperature
 * divergence cannot both be true of the same saturated secondary. The rows disagreed WITH EACH
 * OTHER, and that is checkable arithmetic rather than a judgement about what a field name means.
 *
 * So each side's secondary is now checked against its OWN saturation line before anything is
 * compared across plants. A field that fails is not the quantity the row claims it is. */
function satPairOK(label, P_MPa, T_c) {
  var Tsat = P2.water.T_sat(P_MPa);
  if (Math.abs(T_c - Tsat) > 1.0) {
    bail(label + ' is not on its own saturation line: reports ' + C2F(T_c).toFixed(1) +
         ' degF at ' + M2PSI(P_MPa).toFixed(1) + ' psia, where T_sat is ' +
         C2F(Tsat).toFixed(1) + ' degF (' + dC2F(T_c - Tsat).toFixed(1) + ' degF off).\n' +
         '               That field is not a saturation temperature. Do not compare it as one.');
  }
  return Tsat;
}

/* The reference's secondary saturation temperature is DERIVED FROM ITS OWN PRESSURE rather than
 * read from a field, because deriving it cannot pick up the wrong field. */
var aTsec = P2.water.T_sat(A.steam_pressure_mpa);
satPairOK('PWR2 secondary', B.sg.P_sec, B.sg.T_sec);

var rows = [
  ['hot leg',            C2F(A.thot_c),              C2F(bTh),            '°F',  'abs'],
  ['cold leg',           C2F(A.tcold_c),             C2F(bTc),            '°F',  'abs'],
  ['loop dT',            dC2F(A.thot_c - A.tcold_c), dC2F(bTh - bTc),     '°F',  'diff'],
  ['SG steam pressure',  M2PSI(A.steam_pressure_mpa), M2PSI(B.sg.P_sec),  'psia','abs'],
  ['SG sat temperature', C2F(aTsec),                 C2F(B.sg.T_sec),     '°F',  'abs'],
  ['SG duty',            300.0,                       B.sg.duty_kW / 1000, 'MWt', 'abs']
];

console.log('\n  ' + BOLD + 'COMPARABLE — the thermal-hydraulic set Layers 0-5 build' + RST);
console.log('  ' + DIM + 'quantity              reference        PWR2       delta' + RST);
rows.forEach(function (r) {
  var a = r[1], b = r[2], d = b - a;
  var pct = Math.abs(a) > 1e-9 ? (100 * d / a) : 0;
  var col = Math.abs(pct) < 2 ? GREEN : (Math.abs(pct) < 10 ? YEL : RED);
  console.log('  ' + r[0].padEnd(20) +
              a.toFixed(1).padStart(9) + ' ' + r[3].padEnd(5) +
              b.toFixed(1).padStart(9) + '   ' +
              col + (d >= 0 ? '+' : '') + d.toFixed(1) + ' (' +
              (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%)' + RST);
});

console.log('\n  ' + BOLD + 'NOT COMPARABLE — stated, not silently omitted' + RST);
[['RCS pressure',   'PWR2 has no pressurizer (§25.3 — the #472 race). Its loop is rigid, so its',
                    'pressure is a closure result and the reference\'s is a two-region bubble.'],
 ['level',          'PWR2 publishes mass fraction only. A level is a GEOMETRY map and belongs to',
                    'the instrument layer (§28.3 / review F10), so there is nothing to diff.'],
 ['anything on a',  'PWR2 has no control layer. Diffing a transient would compare an absent',
  'transient',      'controller against a live one and call the difference physics.'],
 ['SG tube metal',  'the reference carries a tube-bundle node (t_sg_c, 29.0 degF above saturation);',
                    'PWR2 lumps its secondary and has no metal node. NOT the same quantity.']
].forEach(function (r) {
  console.log('  ' + YEL + r[0].padEnd(18) + RST + DIM + r[1] + '\n' + ' '.repeat(20) + r[2] + RST);
});

console.log('\n' + '='.repeat(78));
if (!gate.landed) {
  console.log('  ' + YEL + BOLD + 'EXPLORATORY RUN — NO BASELINE RECORDED' + RST);
  console.log('  ' + DIM + '§25.1a(3): the first baseline is taken AFTER #472 lands, so the pressurizer' + RST);
  console.log('  ' + DIM + 'rebuild is INSIDE the reference rather than straddling it. #472 is ' + gate.state + '.' + RST);
  if (!gate.known) console.log('  ' + DIM + 'gh could not be reached; assuming OPEN, because the costly error is recording.' + RST);
} else {
  console.log('  ' + GREEN + BOLD + 'BASELINE ELIGIBLE' + RST + ' — #472 has landed; this reference SHA may be recorded.');
}
console.log('  ' + DIM + 'A reference move is a RE-BASELINE event, not a regression: when the SHA' + RST);
console.log('  ' + DIM + 'changes, divergences above are VOID until re-measured (§25.1a(4)).' + RST);
console.log('='.repeat(78) + '\n');

process.exit(0);
