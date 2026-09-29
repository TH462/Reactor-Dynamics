/* run_walkthrough_routes_b.js — part B of the walkthrough-routes gate (CI shard timeout,
 * 2026-09-27, CI run 36319512542), on the run_pwr2_engine_b.js precedent (#637). Owns
 * pwr_cooldown's ROUTES plus the pwr_raise_power / pwr_lower_power / pwr_heatup / pwr_shutdown
 * legs whole. The suite, the groups and the split's rationale all live in
 * run_walkthrough_routes.js — this file only selects that partition.
 *
 *   node test/run_walkthrough_routes_b.js          part B (this file)
 *   node test/run_walkthrough_routes.js --all      the unsplit whole, for local debugging
 */
'use strict';
globalThis.__WR_PART = 1;
require('./run_walkthrough_routes.js');
