/* run_campaign_b.js — part B of the campaign gate (#513): the rbmk_* and bwr_* mission
 * suites (the on-hold plants), split out of run_campaign.js so run_all can schedule the
 * two parts as parallel processes. The suites, the harness and the split's rationale all
 * live in run_campaign.js — this file only selects the other partition.
 *
 *   node test/run_campaign_b.js              run the rbmk + bwr suites
 *   node test/run_campaign.js <substring>    run any suite by name (ignores the split)
 */
'use strict';
globalThis.__CAMPAIGN_PART = 1;
require('./run_campaign.js');
