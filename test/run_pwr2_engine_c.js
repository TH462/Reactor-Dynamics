/* run_pwr2_engine_c.js — part C of the engine-facade gate (#637), on the run_campaign A/B/C
 * precedent (#513). The suite, the mutation table and the split's rationale all live in
 * run_pwr2_engine.js — this file only selects the third partition.
 *
 *   node test/run_pwr2_engine_c.js           the groups PART_C names
 *   node test/run_pwr2_engine.js --all       the unsplit whole, for local debugging
 *   node test/run_pwr2_engine.js --groups=D  one group, to re-measure the cost table
 */
'use strict';
globalThis.__PWR2_ENGINE_PART = 2;
require('./run_pwr2_engine.js');
