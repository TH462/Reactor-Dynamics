/* run_pwr2_engine_b.js — part B of the engine-facade gate (#637), on the run_campaign A/B/C
 * precedent (#513). The suite, the mutation table and the split's rationale all live in
 * run_pwr2_engine.js — this file only selects the other partition.
 *
 *   node test/run_pwr2_engine_b.js           the groups PART_B names
 *   node test/run_pwr2_engine.js --all       the unsplit whole, for local debugging
 *   node test/run_pwr2_engine.js --groups=I  one group, to re-measure the cost table
 */
'use strict';
globalThis.__PWR2_ENGINE_PART = 1;
require('./run_pwr2_engine.js');
