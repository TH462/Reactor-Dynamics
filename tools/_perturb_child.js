/* _perturb_child.js — one suite run under one perturbation, emitted as JSON.
 *
 *   node tools/_perturb_child.js <pwr|behavior> <path.to.const*factor|none> <seed|none> <inject|no>
 *
 * Called by tools/perturb_sweep.js — not meant to be run by hand. A fresh process per run
 * is not laziness: engine files are global-namespace scripts executed by require() into a
 * shared global, so a config nudge cannot be undone in-process.
 */
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
function load(f) { require(path.join(ROOT, f)); }

const [SUITE, NUDGE, SEED, INJECT, ANCHOR] = process.argv.slice(2);

// Config FIRST, so the nudge lands before anything reads it.
load('engines/load_mode.js');
load('engines/pwr/pwr_config.js');
const RD = globalThis.RD;

// The walker moved to tools/_config_nudge.js (2026-08-11) so measure_stack and term_budget
// can apply the SAME override — a nudge applied two ways is two different plants. Exit
// codes and messages are unchanged; the throw is caught here to preserve them.
if (NUDGE && NUDGE !== 'none') {
  try { require('./_config_nudge.js').applyNudge(RD.PWR_CONFIG, NUDGE); }
  catch (e) { console.error(e.message); process.exit(2); }
}

load('layers/control/pwr_control.js');
['engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js', 'engines/pwr/pwr_primary.js',
 'engines/pwr/pwr_steam_generator.js', 'engines/pwr/pwr_instruments.js', 'engines/pwr/pwr_engine.js',
 'layers/control/control_kernel.js'].forEach(load);

// Seed override. The suites build their own engines with the default seed; one §14
// scenario passes 999 on purpose (save/restore must override), so that one is left alone.
if (SEED && SEED !== 'none') {
  const want = parseInt(SEED, 10) >>> 0;
  const Real = RD.PWRInstruments;
  const Shim = function (cfg, seed) { return new Real(cfg, seed === 999 ? seed : want); };
  Shim.prototype = Real.prototype;
  RD.PWRInstruments = Shim;
}

const out = [];
function push(name, checks) {
  (checks || []).forEach((c) => out.push({ k: name + ' ‖ ' + c.desc, pass: !!c.pass, observed: String(c.observed) }));
}

if (SUITE === 'pwr') {
  RD.PWRScenarioTests.runAll().forEach((r) => push(r.name, r.checks));
  // Self-test hook: a check fragile BY CONSTRUCTION. It asserts steady-state Tavg sits
  // within 0.05 °C of the value this build happens to produce, so ANY perturbation with
  // real discriminating power moves it. Its only job is to prove the pipeline can see a
  // flip — if it does not, a "no flips" result from the real suite is worthless.
  //
  // THE ANCHOR IS PASSED IN BY THE PARENT — it is the BASELINE RUN'S OWN value, and it used
  // to be the literal `304.07`. Fixed 2026-08-11 (#450 tooling): steady Tavg has since moved
  // to 304.5291, so the check read FAIL on the unperturbed build *and* under every nudge —
  // and a check that is stuck at FAIL never FLIPS. `--self-test` therefore reported
  // "the pipeline detected nothing … do not trust a negative result" on a pipeline that
  // works perfectly (measured: `thermal.h_sg*1.03` moves this value 304.5291 → 303.5797,
  // 19x the band). The tool whose whole job is to certify that a null result means
  // something had been failing its own certification, silently, since the retune that moved
  // Tavg — and CLAUDE.md tells every agent to run this before touching a [tune] constant.
  //
  // A LITERAL BASELINE IN A FRAGILE CHECK IS A CONTRADICTION IN TERMS: the check is built to
  // move whenever the plant does, so pinning it to a hard-coded number guarantees it rots at
  // the first retune. The baseline run anchors on ITSELF (`none`) and so passes by
  // construction; every perturbed run is measured against what the baseline actually
  // produced, which is what this check's own description always claimed it did.
  if (INJECT === 'inject') {
    const h = new RD.PWREngine({ initial_state: 'hot_full_power' });
    for (let i = 0; i < 1500; i++) h.step(0.02);
    const tavg = h.getTrueState().tavg_c;
    const anchor = (ANCHOR && ANCHOR !== 'none') ? parseFloat(ANCHOR) : tavg;
    out.push({
      k: 'PERTURB-SELFTEST ‖ steady Tavg within 0.05 °C of the unperturbed build (fragile by construction)',
      pass: Math.abs(tavg - anchor) < 0.05,
      observed: tavg.toFixed(4),
    });
  }
} else if (SUITE === 'behavior') {
  load('test/ops_harness.js');
  load('test/behavior_pwr.js');
  Object.keys(RD.BehaviorPWR.probes).forEach((id) => {
    let r;
    try { r = RD.BehaviorPWR.probes[id](); }
    catch (e) { out.push({ k: id + ' ‖ THREW', pass: false, observed: String(e).slice(0, 80) }); return; }
    push(id, r.checks);
  });
} else {
  console.error('unknown suite: ' + SUITE);
  process.exit(2);
}

process.stdout.write(JSON.stringify(out));
