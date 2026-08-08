/* perturb_sweep.js — WHICH CHECKS WILL BREAK IF I RETUNE THIS?
 *
 *   node tools/perturb_sweep.js                        # PWR §14 suite, default nudge set
 *   node tools/perturb_sweep.js --suite=behavior       # the behaviour battery instead
 *   node tools/perturb_sweep.js --suite=both
 *   node tools/perturb_sweep.js --nudge=thermal.h_sg*1.03 --nudge=thermal.h_fc*0.98
 *   node tools/perturb_sweep.js --seeds=6              # instrument-noise realisations too
 *   node tools/perturb_sweep.js --self-test            # prove the harness can detect anything
 *
 * WHY THIS EXISTS (#321, 2026-08-03)
 * ---------------------------------
 * `run_pwr`'s "drifting pressure diverges" check compared an indication against its own
 * value 40 s earlier. What that actually measured was the depth of a code-safety blowdown
 * the drift itself triggered — so a **3 % nudge to `thermal.h_sg`**, steam generator heat
 * transfer, with nothing to do with a drifting pressure gauge, flipped it PASS → FAIL. It
 * had been green for the life of the project because nobody ever nudged that constant.
 *
 * The question this answers is the one you want BEFORE a retune, not after a mystery red:
 * *which checks move when I touch a constant they never mention?* Two kinds of answer, and
 * they are different findings:
 *
 *   - a check that flips on a constant its claim does not name is measuring the wrong
 *     quantity (the #321 shape) — a defect in the check;
 *   - a check that flips because its BAND is narrower than the nudge is doing its job and
 *     is simply tight — a fact about the plant, and about where your next red comes from.
 *     `run_behavior`'s sourced ±5 °F duty checks sit 0.23–0.40 °F inside their band.
 *     Do NOT widen a sourced band to make this quiet: that is refitting the test (HR10).
 *
 * THE TRAP THIS TOOL IS BUILT AROUND
 * ----------------------------------
 * The first attempt at that sweep perturbed the instrument SEED — noise realisation, no
 * physics. Six seeds, 241 checks, zero flips, and the result was WORTHLESS, because the
 * known-defective check did not flip on noise either. **A sweep that finds nothing has
 * proved nothing until you show it could have found something.**
 *
 * So this tool never reports a bare "0 flips". Every perturbation is scored for
 * DISCRIMINATING POWER first — how many observed values it moved at all — and a
 * perturbation that moves nothing is reported as INERT rather than as a clean bill.
 * `--self-test` goes further and re-injects a synthetic fragile check to prove end to end
 * that the pipeline can see a flip.
 *
 * NOT A GATE. It lives in tools/ deliberately: `run_all.js` auto-discovers `test/run_*.js`
 * and `test/verify_*.js` and demands a baseline for each, and this has no stable score —
 * its output is a diff, and it is meant to be run against a change you are considering.
 * PWR only; RBMK/BWR are on hold.
 */
'use strict';
const cp = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Default nudge set. Chosen to touch DIFFERENT subsystems, so a check that moves under
// several of them is broadly coupled rather than specifically fragile. Sizes are small on
// purpose: a 20 % nudge moves everything and tells you nothing.
const DEFAULT_NUDGES = [
  'thermal.h_sg*1.03',                    // primary→secondary heat transfer
  'thermal.coolant_heat_capacity*1.03',   // coolant node time constant
  'thermal.h_fc*1.02',                    // fuel→coolant coupling
  'thermal.delta_T_rated*1.02',           // the leg split's calibration
  // #418 wave A2: K_sg_level retired into the mass ledger — the boil-dry clock is the
  // level-response knob now. K_steam_pressure added the same change (it was never swept,
  // which CLAUDE.md flagged when the A1 re-derivation moved it 6.7×).
  'steam_generator.sg_mass_boil_tau_s*1.03',   // SG inventory clock (level response)
  'steam_generator.K_steam_pressure*1.05',     // SG pressure clock
];

// ------------------------------------------------------------------ args
const argv = process.argv.slice(2);
const OPT = { nudges: [] };
const KNOWN = { suite: 1, nudge: 1, seeds: 1, only: 1, 'self-test': 1, help: 1, verbose: 1 };
argv.forEach((a) => {
  const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
  if (!m) die(`unrecognised argument "${a}"`);
  const k = m[1];
  if (!KNOWN[k]) die(`unknown option "--${k}" — options are --${Object.keys(KNOWN).join(' --')}`);
  if (k === 'nudge') OPT.nudges.push(m[2]);
  else OPT[k.replace(/-/g, '_')] = m[2] == null ? true : m[2];
});
if (OPT.help) { console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }

function die(msg) { console.error('\x1b[31mperturb_sweep: ' + msg + '\x1b[0m'); process.exit(2); }

const SUITE = OPT.suite || 'pwr';
if (!['pwr', 'behavior', 'both'].includes(SUITE)) die('--suite must be pwr | behavior | both');
const NUDGES = OPT.nudges.length ? OPT.nudges : DEFAULT_NUDGES;
const SEEDS = OPT.seeds ? [0x9E3779B9, 1, 7, 12345, 999, 42, 0x5bf03635, 2654435761].slice(0, +OPT.seeds) : [];

const C = '\x1b[36m', G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';

// ------------------------------------------------------------------ child runner
// Each run is a fresh process: the engine modules are global-namespace scripts executed by
// require() into a shared global, so a config nudge cannot be undone in-process.
function runOnce(suite, nudge, seed, injectFragile) {
  const args = [path.join(__dirname, '_perturb_child.js'), suite, nudge || 'none',
    seed == null ? 'none' : String(seed), injectFragile ? 'inject' : 'no'];
  const out = cp.execFileSync(process.execPath, args, { cwd: ROOT, maxBuffer: 1 << 28, encoding: 'utf8' });
  return JSON.parse(out);
}

function sweep(suite) {
  console.log(`\n${B}${suite === 'pwr' ? 'PWR §14 scenario suite' : 'PWR behaviour battery'}${X}`);
  const base = runOnce(suite, null, null, false);
  const baseBy = {}; base.forEach((c) => { baseBy[c.k] = c; });
  console.log(D + `  baseline: ${base.length} checks, ${base.filter((c) => !c.pass).length} failing` + X);

  const perturbations = NUDGES.map((n) => ({ label: n, kind: 'nudge' }))
    .concat(SEEDS.map((s) => ({ label: 'seed=' + s, kind: 'seed', seed: s })));

  const rows = [];
  perturbations.forEach((p) => {
    const r = runOnce(suite, p.kind === 'nudge' ? p.label : null, p.kind === 'seed' ? p.seed : null, false);
    let moved = 0, flips = [];
    r.forEach((c) => {
      const b = baseBy[c.k];
      if (!b) return;
      if (b.observed !== c.observed) moved++;
      if (b.pass !== c.pass) flips.push({ k: c.k, from: b.observed, to: c.observed, was: b.pass });
    });
    rows.push({ p, moved, total: r.length, flips });
  });

  // DISCRIMINATING POWER FIRST. A perturbation that moved nothing has proved nothing, and
  // saying so is the whole point — see the header.
  console.log(`\n  ${B}discriminating power${X} ${D}(a perturbation that moves nothing proves nothing)${X}`);
  rows.forEach((row) => {
    const pct = row.total ? (100 * row.moved / row.total) : 0;
    const tag = row.moved === 0 ? `${R}INERT — proves nothing here${X}`
      : pct < 5 ? `${Y}weak${X}` : `${G}ok${X}`;
    console.log(`    ${row.p.label.padEnd(38)} moved ${String(row.moved).padStart(4)}/${row.total}  (${pct.toFixed(1)} %)  ${tag}`);
  });

  const all = rows.filter((r) => r.flips.length);
  console.log(`\n  ${B}verdict flips${X}`);
  if (!all.length) {
    const useful = rows.filter((r) => r.moved > 0).length;
    console.log(`    none — across ${useful} perturbation(s) with real discriminating power`);
    if (useful < rows.length) console.log(`    ${Y}(${rows.length - useful} were INERT; they are not part of that claim)${X}`);
  }
  all.forEach((row) => {
    console.log(`    ${C}${row.p.label}${X}`);
    row.flips.forEach((f) => {
      console.log(`      ${f.was ? R + 'PASS→FAIL' : G + 'FAIL→PASS'}${X}  ${f.k}`);
      console.log(`        ${D}${f.from}  →  ${f.to}${X}`);
    });
  });
  return rows;
}

// ------------------------------------------------------------------ self-test
// Proves the pipeline can see a flip at all, by injecting a check that is fragile BY
// CONSTRUCTION (it asserts a plant quantity sits within a hair of its current value).
// If this does not flip, nothing this tool reports is trustworthy.
if (OPT.self_test) {
  console.log(`\n${B}SELF-TEST${X} ${D}— can this harness detect a fragile check at all?${X}`);
  const base = runOnce('pwr', null, null, true);
  const b = base.filter((c) => /PERTURB-SELFTEST/.test(c.k))[0];
  if (!b) die('self-test check did not appear — the injection hook is broken');
  let detected = false;
  for (const n of NUDGES) {
    const r = runOnce('pwr', n, null, true);
    const c = r.filter((x) => /PERTURB-SELFTEST/.test(x.k))[0];
    const flip = c && c.pass !== b.pass;
    console.log(`  ${n.padEnd(38)} ${flip ? G + 'FLIPPED' + X : D + 'no change' + X}   ${D}${b.observed} → ${c ? c.observed : '?'}${X}`);
    if (flip) detected = true;
  }
  console.log(detected
    ? `  ${G}PASS${X} — the pipeline can see a flip, so a "no flips" result below means something.`
    : `  ${R}FAIL${X} — the pipeline detected nothing even on a check built to be fragile. Do not trust a negative result.`);
  process.exit(detected ? 0 : 1);
}

// ------------------------------------------------------------------ go
console.log(`${B}PERTURBATION SWEEP${X}  ${D}${NUDGES.length} nudge(s)${SEEDS.length ? ', ' + SEEDS.length + ' seed(s)' : ''}${X}`);
console.log(D + '  A flip on a constant the check never NAMES is a check measuring the wrong thing (#321).' +
  '\n  A flip because the BAND is narrower than the nudge is a tight band — a fact about the plant.' +
  '\n  Read every flip and decide which it is. Do not widen a SOURCED band to make this quiet.' + X);
if (SUITE === 'pwr' || SUITE === 'both') sweep('pwr');
if (SUITE === 'behavior' || SUITE === 'both') sweep('behavior');
console.log('');
