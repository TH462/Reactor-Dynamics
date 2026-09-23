/* run_checklist_pwr2_b.js — part B of the checklist gate (CI shard timeout, run 35810480463,
 * 2026-09-22), on the run_pwr2_engine_b.js precedent (#637). THE LIVE RUNTIME (section 2); the
 * suite, the split's rationale and the one check that moved instead of the boundary all live
 * in run_checklist_pwr2.js.
 *
 *   node test/run_checklist_pwr2_b.js          part B (this file)
 *   node test/run_checklist_pwr2.js --all      the unsplit whole, for local debugging
 */
'use strict';
globalThis.__PWR2_CHECKLIST_PART = 1;
require('./run_checklist_pwr2.js');
