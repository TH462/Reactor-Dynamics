/* run_behavior_b.js — part B (probe ids ≡ 1 mod 3) of the PWR behavior battery (#513).
 *
 * The battery, its strict-xfail semantics and the split's rationale all live in
 * run_behavior.js (part A) and test/behavior_pwr.js; this file only selects its third
 * so run_all can schedule the parts as parallel processes — the single 398.8 s runner
 * was the aggregate gate's wall-time floor. Writes the _B report pair
 * (Diagnostic/behavior_results_b.json, BEHAVIOR_GAP_REPORT_B.md).
 *
 *   node test/run_behavior_b.js          run part B
 *   node test/run_behavior.js <ID>       run ONE probe by id (any part's)
 */
'use strict';
globalThis.__BEHAVIOR_PART = 1;
require('./run_behavior.js');
