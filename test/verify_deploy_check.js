/* verify_deploy_check.js — RUN THE RELEASE DEPLOY CHECK'S OWN SELF-TEST.
 *
 *   node test/verify_deploy_check.js
 *
 * A thin wrapper: it shells out to `tools/verify_release_deploy.js --self-test` and mirrors the
 * score. No network, no wrangler, no Cloudflare — the self-test is pure functions over recorded
 * fixtures, which is why it can live in the aggregate gate at all.
 *
 * ------------------------------------------------------------------- why this runner exists
 * `verify_release_deploy.js` is the §5b gate: it decides whether a PRODUCTION deployment of the
 * commit being released is actually live. It has failed SIX times, and the thing all six have in
 * common is not a shared bug — it is that **nothing ran it except a person, at a release**:
 *
 *   (2) knew only Vercel after the move to Pages, and returned nothing for ever
 *   (3) read API field names against wrangler's TABLE output, so it could never PASS
 *   (4) read the deployment record and never the build OUTCOME, so it could never FAIL
 *   (5) took its auth from the shell, so it could not answer at all (#494)
 *   (6) let the deployment RECORD outrank the domain — LIVE, exit 0, for a commit the
 *       production domain had stopped serving six hours earlier (the Alpha 1.0.0 shape)
 *
 * Every one was found by accident, at the moment it was most expensive to find. That is what a
 * gate is for, so the self-test is now discovered by `run_all` like everything else.
 *
 * ---------------------------------------------------------------------- what it does NOT do
 * It proves the LOGIC still does what it was proved to do on 2026-08-19. It cannot prove the
 * check still works, because the fixtures are COPIES of wrangler's output and the site's version
 * stamp — if either format moves, these stay green and the real check breaks. That is failure (3)
 * exactly, and no offline test can see it. Only a real release can. The self-test says so in its
 * own closing line; do not let a green here retire the §5b step.
 */
'use strict';
const cp = require('child_process');
const path = require('path');

const TOOL = path.join(__dirname, '..', 'tools', 'verify_release_deploy.js');
const R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';

const r = cp.spawnSync(process.execPath, [TOOL, '--self-test'], { encoding: 'utf8' });
process.stdout.write(r.stdout || '');
if (r.stderr) process.stderr.write(r.stderr);

if (r.error || r.status === null) {
  console.log(B + R + 'DEPLOY CHECK SELF TEST: could not run' + X + D + '  ' +
    ((r.error && r.error.message) || 'no exit status') + X);
  process.exit(1);
}

// The tool prints its own tally; this runner only has to agree with its exit code. A wrapper that
// re-counted would be a second place for the number to be wrong.
process.exit(r.status === 0 ? 0 : 1);
