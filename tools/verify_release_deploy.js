/* verify_release_deploy.js — IS THE RELEASED COMMIT ACTUALLY LIVE?
 *
 *   node tools/verify_release_deploy.js            # checks HEAD
 *   node tools/verify_release_deploy.js <sha>
 *
 * Exit 0 = a PRODUCTION deployment exists for that commit, on whichever host serves the
 * site. Exit 1 = it does not, or could not be established. Never guesses.
 *
 * ---------------------------------------------------------------- why this is a script
 * The rule ("a release is not done until a Production deployment exists") has existed
 * since Alpha 1.0.0 shipped without going live — main was correct, the tag was correct,
 * CI was green, and the only deployment Vercel made for that commit was a Preview. The
 * production domain served the previous release for half an hour and nothing said so.
 *
 * The rule was written as prose plus a command to paste. It has since failed TWICE in
 * ways prose cannot prevent:
 *
 *   1. CLAUDE.md wrote the command as `?sha=<SHA>`. The GitHub API needs the FULL
 *      40-character sha — `?sha=c918667` returns ZERO deployments for a commit that has
 *      two. An empty result is indistinguishable from "production is missing", and the
 *      documented remedy for that is to go promote a deployment by hand. A false alarm
 *      whose fix is an unnecessary intervention.
 *
 *   2. It only ever knew about Vercel. Every GitHub deployment on this repo is created by
 *      `vercel[bot]`, so after the move to Cloudflare Pages the query returns nothing —
 *      and the procedure reads nothing as failure, for ever, on every release.
 *
 * A script cannot be pasted wrong, and it can ask both hosts. That is the whole argument.
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
const REPO = 'TH462/Reactor-Dynamics';

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

// ---------------------------------------------------------------- host A: Vercel
// Vercel's GitHub integration records deployments against the commit. `environment` is
// "Production" only for the real thing; a Preview satisfies the green commit status and
// is NOT evidence.
//
// NEITHER IS THE RECORD ITSELF. A deployment resource is created when the build is
// REQUESTED, and it keeps `environment: "Production"` whatever happens next — the
// outcome lives in /deployments/{id}/statuses, a second request. Measured on Alpha
// 1.5.1 (af48703): this half printed "vercel PRODUCTION" for a deployment whose only
// status is `failure — "Deployment was blocked"`, because Vercel's Git integration
// was still connected after the Cloudflare cutover and every build there now blocks.
// The verdict is ANY-host, so a Cloudflare failure plus that record would have read
// LIVE — a release certified by a dead host on the evidence of a build that never ran.
// The Cloudflare half below has always demanded a successful build; this one demanded
// nothing, and the asymmetry was the whole defect.
(function vercel() {
  // NO QUERY STRING AND NO --jq, both deliberately. These run through a shell on Windows,
  // where `&` in `?sha=..&per_page=..` is a command separator (cmd tried to execute
  // `per_page` as a program) and a --jq filter's `|` is a pipe. Pass parameters as -f
  // fields and do the filtering in Node, where neither character means anything.
  const r = run('gh', ['api', `repos/${REPO}/deployments`, '-X', 'GET',
    '-f', `sha=${sha}`, '-f', 'per_page=100']);
  if (!r.ok) {
    console.log(Y + '  vercel     ' + X + D + 'could not query GitHub deployments (' +
      (r.err.split('\n')[0] || 'unknown') + ')' + X);
    return;
  }
  let rows;
  try { rows = JSON.parse(r.out); } catch (e) {
    console.log(Y + '  vercel     ' + X + D + 'could not parse gh output' + X);
    return;
  }
  const prod = (rows || []).filter((d) => /^production$/i.test(d.environment || ''));
  if (!prod.length) {
    console.log(D + '  vercel     no production deployment (' + (rows || []).length +
      ' deployment(s) for this sha)' + X);
    return;
  }

  /* The build OUTCOME. Statuses come back newest-first and `inactive` is bookkeeping —
   * GitHub adds it when a later deployment supersedes this one, which says nothing
   * about whether this one built. Skip those and the first remaining status is the
   * terminal result. No statuses at all means the build was never reported on, which
   * is not a live site either.
   *
   * WHAT IS MEASURED AND WHAT IS NOT (2026-08-09). Measured: every deployment sampled
   * on this repo carries EXACTLY ONE status — Vercel posts a single terminal
   * `success`/`failure`, never a `pending` → `success` sequence — and no `inactive`
   * was observed at all. So on today's data `real[0]` is the only status there is.
   * Assumed: GitHub's documented reverse-chronological order, which is what makes
   * `real[0]` the newest if a multi-status deployment ever does arrive. The
   * skip-`inactive` filter is likewise defensive, not something a real row has
   * exercised. Both are the safe direction — get either wrong and this reports a good
   * release as NOT LIVE, which is loud, rather than a failed one as LIVE, which is the
   * defect being fixed here. */
  function outcome(d) {
    const s = run('gh', ['api', `repos/${REPO}/deployments/${d.id}/statuses`,
      '-X', 'GET', '-f', 'per_page=100']);
    if (!s.ok) return { state: null, why: 'could not query statuses' };
    let sts;
    try { sts = JSON.parse(s.out); } catch (e) { return { state: null, why: 'could not parse statuses' }; }
    const real = (sts || []).filter((x) => !/^inactive$/i.test(x.state || ''));
    if (!real.length) return { state: null, why: 'no build status reported' };
    return { state: String(real[0].state || '').toLowerCase(), why: real[0].description || '' };
  }

  const results = prod.map((d) => ({ d: d, o: outcome(d) }));
  const good = results.filter((r) => r.o.state === 'success');
  if (good.length) {
    found.push('vercel');
    console.log(G + '  vercel     PRODUCTION' + X + D + '  ' +
      (good[0].d.creator && good[0].d.creator.login) + '  ' + good[0].d.created_at + X);
  } else {
    const r0 = results[0];
    console.log(D + '  vercel     no SUCCESSFUL production deployment (' + prod.length +
      ' production record(s) for this sha; newest: ' +
      (r0.o.state || 'unknown') + (r0.o.why ? ' — ' + r0.o.why : '') + ')' + X);
    console.log(D + '             a deployment record is created when the build is REQUESTED;' +
      ' it is not evidence the build ran.' + X);
  }
}());

// ---------------------------------------------------------------- host B: Cloudflare Pages
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
  console.log(B + G + 'LIVE' + X + '  a production deployment exists for this commit — ' +
    found.join(' and ') + '\n');
  process.exit(0);
}
console.log(B + R + 'NOT LIVE' + X + '  no production deployment found for this commit on any host.\n');
console.log(D +
  'Before assuming the deploy failed, rule out the two things that look identical to it:\n' +
  '  1. It may still be building. A missing production deploy and a slow one are the same\n' +
  '     from outside, so WAIT and re-run rather than re-pushing.\n' +
  '  2. Neither host may have been reachable — a `gh` or `wrangler` auth failure prints a\n' +
  '     yellow line above and is NOT the same as "no deployment".\n' +
  'If it is genuinely missing: promoting the preview in the host dashboard is one click.\n' +
  'Do NOT push develop to the same commit to retrigger it — that is the suspected CAUSE of\n' +
  'the original Alpha 1.0.0 failure, not a remedy.' + X);
process.exit(1);
