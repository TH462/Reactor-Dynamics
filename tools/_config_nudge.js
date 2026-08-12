/* _config_nudge.js — apply one `path.to.const*factor` override to a loaded config.
 *
 *   const { applyNudge } = require('./_config_nudge.js');
 *   applyNudge(RD.PWR_CONFIG, 'pressurizer.K_heater*0.1818');
 *
 * WHY IT IS ITS OWN FILE (#450/#451, 2026-08-11). These thirteen lines were inline in
 * `_perturb_child.js` and nothing else could call them, so every "run the plant with one
 * constant moved" measurement was either a hand-edited config (which then has to be
 * remembered back) or a second copy of the walker. `measure_stack.js` and `term_budget.js`
 * now share this one, which is the point: a nudge applied two different ways is two
 * different plants, and the divergence would be invisible in the artifact.
 *
 * MUST RUN BEFORE ANY CONSUMER LOADS. Engine files are global-namespace scripts that read
 * their constants at require() time in places; the caller's job is to load the config file
 * FIRST, nudge, and only then load everything else. Both callers do it in that order and
 * say so at the call site.
 *
 * IT THROWS RATHER THAN WARNING, deliberately. A mistyped path that silently no-ops
 * produces a full run of numbers that look exactly like a real measurement and are the
 * unperturbed plant — the quiet-wrong-answer class `measure_stack`'s header rails against.
 * The callers catch and exit 2 with the message, preserving `_perturb_child`'s old contract.
 */
'use strict';

// `spec` is `a.b.c*1.03`. Returns { path, factor, from, to } so the caller can STAMP the
// realised numbers in its header — "what did the nudge actually do" is not answerable from
// the spec alone once a default value moves.
function applyNudge(root, spec) {
  const m = /^([\w.]+)\*([\d.]+)$/.exec(spec);
  if (!m) throw new Error('bad nudge spec: ' + spec + ' — expected path.to.const*factor');
  const parts = m[1].split('.');
  let o = root;
  for (let i = 0; i < parts.length - 1; i++) {
    o = o[parts[i]];
    if (!o) throw new Error('no such config path: ' + m[1]);
  }
  const k = parts[parts.length - 1];
  if (typeof o[k] !== 'number') throw new Error('not a number: ' + m[1]);
  const from = o[k], factor = parseFloat(m[2]);
  o[k] = from * factor;
  return { path: m[1], factor: factor, from: from, to: o[k] };
}

module.exports = { applyNudge: applyNudge };
