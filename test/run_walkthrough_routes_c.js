/* run_walkthrough_routes_c.js — part C of the walkthrough-routes gate (CI shard timeout,
 * 2026-09-27, CI run 36319512542), on the run_pwr2_engine_b.js precedent (#637). Owns
 * pwr_cooldown's own MUTATIONS plus the chain (the base chain run and its four mutations) —
 * the tail: chain alone runs all six legs on one plant. The suite, the groups and the split's
 * rationale all live in run_walkthrough_routes.js — this file only selects that partition.
 *
 *   node test/run_walkthrough_routes_c.js          part C (this file)
 *   node test/run_walkthrough_routes.js --all      the unsplit whole, for local debugging
 */
'use strict';
globalThis.__WR_PART = 2;
require('./run_walkthrough_routes.js');
