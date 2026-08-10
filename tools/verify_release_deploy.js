/* verify_release_deploy.js — IS THE RELEASED COMMIT ACTUALLY LIVE?
 *
 *   node tools/verify_release_deploy.js            # checks HEAD
 *   node tools/verify_release_deploy.js <sha>
 *
 * Exit 0 = a successful PRODUCTION deployment of that commit exists on Cloudflare Pages,
 * the host that serves the site. Exit 1 = it does not, or could not be established.
 * Never guesses.
 *
 * ---------------------------------------------------------------- why this is a script
 * The rule ("a release is not done until a Production deployment exists") has existed
 * since Alpha 1.0.0 shipped without going live — main was correct, the tag was correct,
 * CI was green, and the only deployment Vercel made for that commit was a Preview. The
 * production domain served the previous release for half an hour and nothing said so.
 *
 * The rule was written as prose plus a command to paste, and it has now failed FOUR ways.
 * Three of them were in this file; all four are recorded because the shapes recur:
 *
 *   1. CLAUDE.md wrote the command as `?sha=<SHA>`. The GitHub API needs the FULL
 *      40-character sha — `?sha=c918667` returns ZERO deployments for a commit that has
 *      two. An empty result is indistinguishable from "production is missing", and the
 *      documented remedy for that is to go promote a deployment by hand. A false alarm
 *      whose fix is an unnecessary intervention.
 *
 *   2. It only knew Vercel, so after the move to Cloudflare Pages it returned nothing on
 *      every release — and the procedure read nothing as failure, for ever.
 *
 *   3. The Cloudflare half, added to fix (2), read API field names (`d.environment`,
 *      `d.deployment_trigger.metadata.commit_hash`) against wrangler's TABLE output. Every
 *      lookup was `undefined`, so it could never PASS. It surfaced only because the two
 *      hosts disagreed about a release known to be good.
 *
 *   4. The Vercel half could never FAIL: it filtered on `environment` and never read the
 *      build OUTCOME. A deployment resource is created when the build is REQUESTED and
 *      keeps `environment: "Production"` whatever happens next. Measured on Alpha 1.5.1,
 *      it reported PRODUCTION for a deployment whose only status was
 *      `failure — "Deployment was blocked"`.
 *
 * (3) and (4) are the same bug mirrored, and the pair is the lesson: a verifier with no
 * true-positive on record is not a verifier, and neither is one with no true-negative.
 * Exercise BOTH directions against real data before believing either.
 *
 * -------------------------------------------------------- one host, deliberately (2026-08-10)
 * The Vercel half is GONE. The owner disconnected Vercel's GitHub integration once the
 * Cloudflare cutover settled, so no `vercel[bot]` deployment record is created for any new
 * commit — verified before removing the code: `develop`'s tip had ZERO deployment records
 * where every earlier tip had one, and Vercel's own `latestDeployment` had stopped moving.
 * Keeping a branch that can only ever say "nothing here" would be the (2) failure again,
 * pointed at the other host. The Vercel project itself survives a while as the two-DNS-record
 * rollback; that does not need this check, because a rollback serves the LAST GOOD build
 * rather than the one being released.
 *
 * ------------------------------------------------------------------- what it does NOT do
 * It does not check that the deployed bytes are correct, that the site renders, or that
 * the version strings agree — `run_release.js` covers the bookkeeping and nothing covers
 * the rendering. It answers exactly one question: did a production deployment of THIS
 * commit happen. That is the question that was silently answered "no" once.
 */
'use strict';
const cp = require('child_process');
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';

const PROJECT = 'reactor-dynamics';          // Cloudflare Pages project

function run(cmd, args) {
  const r = cp.spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

// FULL sha, always. The short form is the trap this file exists to remove.
const sha = (process.argv[2] || run('git', ['rev-parse', 'HEAD']).out).trim();
if (!/^[0-9a-f]{40}$/.test(sha)) {
  console.error(R + 'Not a full 40-character sha: ' + JSON.stringify(sha) + X);
  console.error(D + 'The GitHub API returns ZERO deployments for an abbreviated sha, which reads\n' +
    'exactly like "production is missing". Pass the full one, or nothing at all.' + X);
  process.exit(1);
}

console.log(B + '\nRelease deploy check' + X + D + '  ' + sha.slice(0, 12) + '…' + X);

const found = [];

// ---------------------------------------------------------------- Cloudflare Pages
// Uses wrangler, which carries its own OAuth — no API token needed, and nothing to put in
// an environment variable. A deployment counts only if it is BOTH environment=production
// AND finished successfully; a queued or failed build is not a live site.
(function cloudflare() {
  // `wrangler pages deployment list --json` DOES NOT return the API shape. It returns the
  // TABLE it would have printed, with capitalised keys:
  //     { Id, Environment: "Production", Branch: "main", Source: "5df6315",
  //       Deployment: "https://…", Status: "8 minutes ago" | "Failure", Build: "https://…" }
  // The first version of this function read `d.environment` and
  // `d.deployment_trigger.metadata.commit_hash` — API field names that do not exist here —
  // so it found nothing, always, and reported "not live" for a deployment that was live.
  // A check that can never pass is worse than no check, because it looks like coverage.
  // Caught only because Vercel and Cloudflare disagreed on a release known to be good.
  //
  // Two consequences of the real shape, both counter-intuitive:
  //   * `Source` is the SHORT sha, so the full sha this script insists on must be
  //     truncated to compare. (Insisting on the full one is still right — it is what the
  //     GitHub half needs, and it makes the input unambiguous.)
  //   * `Status` is a RELATIVE TIME on success ("8 minutes ago") and the literal string
  //     "Failure" on failure. So success is "not Failure", not a status match.
  const r = run('npx', ['--yes', 'wrangler', 'pages', 'deployment', 'list',
    '--project-name', PROJECT, '--environment', 'production', '--json']);
  if (!r.ok) {
    console.log(Y + '  cloudflare ' + X + D + 'could not query Pages (' +
      (r.err.split('\n').filter((l) => /error|Error/.test(l))[0] || 'wrangler not authenticated?') + ')' + X);
    return;
  }
  let list;
  try {
    list = JSON.parse(r.out.slice(r.out.indexOf('[')));
  } catch (e) {
    console.log(Y + '  cloudflare ' + X + D + 'could not parse wrangler output' + X);
    return;
  }
  const short = sha.slice(0, 7);
  const forSha = (list || []).filter((d) => String(d.Source || '').slice(0, 7) === short);
  const good = forSha.filter((d) => !/^failure$/i.test(String(d.Status || '')));
  if (good.length) {
    found.push('cloudflare');
    console.log(G + '  cloudflare PRODUCTION' + X + D + '  ' + (good[0].Deployment || '') +
      '  ' + (good[0].Status || '') + X);
  } else {
    console.log(D + '  cloudflare no successful production deployment (' + forSha.length +
      ' for this sha' + (forSha.length ? ', all Failure' : '') +
      ', ' + (list || []).length + ' production deployment(s) total)' + X);
  }
}());

// ---------------------------------------------------------------- verdict
console.log('');
if (found.length) {
  console.log(B + G + 'LIVE' + X + '  a successful production deployment exists for this commit — ' +
    found.join(' and ') + '\n');
  process.exit(0);
}
console.log(B + R + 'NOT LIVE' + X + '  no successful production deployment found for this commit.\n');
console.log(D +
  'Before assuming the deploy failed, rule out the two things that look identical to it:\n' +
  '  1. It may still be building. A missing production deploy and a slow one are the same\n' +
  '     from outside, so WAIT and re-run rather than re-pushing.\n' +
  '  2. Cloudflare may not have been reachable — a `wrangler` auth failure prints a YELLOW\n' +
  '     line above and is NOT the same as "no deployment". Read which one you got.\n' +
  'If it is genuinely missing: promoting a deployment in the Pages dashboard is one click.\n' +
  'Do NOT push develop to the same commit to retrigger it — that is the suspected CAUSE of\n' +
  'the original Alpha 1.0.0 failure, not a remedy.' + X);
process.exit(1);
