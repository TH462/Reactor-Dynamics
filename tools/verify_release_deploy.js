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
  if (prod.length) {
    found.push('vercel');
    console.log(G + '  vercel     PRODUCTION' + X + D + '  ' +
      (prod[0].creator && prod[0].creator.login) + '  ' + prod[0].created_at + X);
  } else {
    console.log(D + '  vercel     no production deployment (' + (rows || []).length +
      ' deployment(s) for this sha)' + X);
  }
}());

// ---------------------------------------------------------------- host B: Cloudflare Pages
// Uses wrangler, which carries its own OAuth — no API token needed, and nothing to put in
// an environment variable. A deployment counts only if it is BOTH environment=production
// AND finished successfully; a queued or failed build is not a live site.
(function cloudflare() {
  const r = run('npx', ['--yes', 'wrangler', 'pages', 'deployment', 'list',
    '--project-name', PROJECT, '--json']);
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
  const hit = (list || []).filter((d) => {
    const meta = (d.deployment_trigger && d.deployment_trigger.metadata) || {};
    const stage = d.latest_stage || {};
    return d.environment === 'production' && meta.commit_hash === sha &&
      stage.name === 'deploy' && stage.status === 'success';
  });
  if (hit.length) {
    found.push('cloudflare');
    console.log(G + '  cloudflare PRODUCTION' + X + D + '  ' + (hit[0].url || '') +
      '  ' + (hit[0].created_on || '') + X);
  } else {
    const anySha = (list || []).filter((d) =>
      ((d.deployment_trigger && d.deployment_trigger.metadata) || {}).commit_hash === sha);
    console.log(D + '  cloudflare no successful production deployment (' + anySha.length +
      ' deployment(s) for this sha, ' + (list || []).length + ' total)' + X);
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
