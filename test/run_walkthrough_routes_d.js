/* run_walkthrough_routes_d.js — part D of the walkthrough-routes gate (CI shard timeout,
 * 2026-10-14, CI run 38652572708). Owns the pwr_tmi2_incident leg whole (routes + mutations),
 * moved out of part A. The suite, the groups and the split's rationale all live in
 * run_walkthrough_routes.js — this file only selects that partition.
 *
 *   node test/run_walkthrough_routes_d.js          part D (this file)
 *   node test/run_walkthrough_routes.js --all      the unsplit whole, for local debugging
 */
'use strict';
globalThis.__WR_PART = 3;
require('./run_walkthrough_routes.js');
