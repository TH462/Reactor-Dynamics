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
 *   5. It read wrangler's OAuth in a comment and the ENVIRONMENT in practice. Wrangler
 *      prefers `CLOUDFLARE_API_TOKEN` over its stored OAuth whenever that variable exists,
 *      and the token this project keeps there is the ANALYTICS ENGINE token from the ops
 *      runbook — no Pages permission. Measured on Alpha 1.6.1, same shell, one variable
 *      apart: with the variable set, `Authentication error [code: 10000]` and a yellow
 *      "could not query" line; with `env -u CLOUDFLARE_API_TOKEN`, PRODUCTION found.
 *      Same shape as (2) and (4): the check had no reachable state in which it could say
 *      NOT LIVE and mean it, for every agent who had followed the telemetry setup. #494.
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

function run(cmd, args, env) {
  const r = cp.spawnSync(cmd, args, {
    encoding: 'utf8', shell: process.platform === 'win32', env: env || process.env,
  });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

// The message this returns is the ONLY thing that tells the next reader whether "could not
// query" means an expired login, a wrong-scope token, or Cloudflare being down — and
// "could not query" is defined here as not-a-failure, so a useless message is how a real
// outage gets waved through. Two things a stderr scan for /error/ misses, both measured:
// wrangler prints part of the diagnosis on STDOUT, and its actual API failures carry no
// such word at all — the real line is `- Invalid format for Authorization header
// [code: 6111]`. So take a `[code: NNNN]` line first, and fall back to the word.
function firstError(r) {
  const lines = ((r.err || '') + '\n' + (r.out || '')).split('\n')
    .map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').replace(/^[\s-]+/, '').trim())
    .filter(Boolean);
  return lines.filter((l) => /\[code: \d+\]/.test(l))[0] ||
    lines.filter((l) => /error/i.test(l))[0] ||
    'wrangler not authenticated?';
}

// CREDENTIAL variables wrangler will use INSTEAD of its stored OAuth if they are present.
// `CLOUDFLARE_ACCOUNT_ID` is deliberately NOT here: it is a disambiguator, not a credential,
// and dropping it would make a multi-account OAuth session ambiguous in non-interactive mode.
const CREDENTIAL_VARS = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL',
  'CF_API_TOKEN', 'CF_API_KEY', 'CF_EMAIL'];

// CI=1 forces wrangler non-interactive: with no credentials at all it must ERROR rather than
// wait on a login prompt this script would never answer.
function wranglerEnv(keepCredentials) {
  const e = Object.assign({}, process.env, { CI: '1' });
  if (!keepCredentials) CREDENTIAL_VARS.forEach((k) => { delete e[k]; });
  return e;
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
// Uses wrangler, which carries its own OAuth — no API token needed. That sentence used to
// end "and nothing to put in an environment variable", which was a claim about the
// ENVIRONMENT dressed as a claim about this script (#494). Wrangler prefers a credential
// variable over its stored OAuth whenever one exists, so the OAuth path is now taken
// DELIBERATELY, by scrubbing those variables from the child env, with a credential retry
// behind it for an environment that genuinely has one and no OAuth.
//
// A deployment counts only if it is BOTH environment=production AND finished successfully;
// a queued or failed build is not a live site.
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
  const ARGS = ['--yes', 'wrangler', 'pages', 'deployment', 'list',
    '--project-name', PROJECT, '--environment', 'production', '--json'];
  const present = CREDENTIAL_VARS.filter((k) => process.env[k]);

  // OAuth FIRST, credentials scrubbed; the environment's own credentials only as a FALLBACK.
  // That ordering is the whole fix: a CI box with a properly scoped token and no OAuth still
  // works, while a wrong-scope token sitting in a developer's shell can no longer outvote a
  // working login. Reporting which path answered matters — "could not query" is defined here
  // as not-a-failure, so a silent degrade to it is the same hole as (2) and (4).
  let r = run('npx', ARGS, wranglerEnv(false));
  let via = 'oauth';
  if (!r.ok && present.length) {
    const oauthErr = firstError(r);
    r = run('npx', ARGS, wranglerEnv(true));
    via = 'credentials';
    if (!r.ok) {
      console.log(Y + '  cloudflare ' + X + D + 'could not query Pages — BOTH auth paths failed. ' +
        'oauth: ' + oauthErr + '  |  ' + present.join(', ') + ': ' + firstError(r) + X);
      return;
    }
  } else if (!r.ok) {
    console.log(Y + '  cloudflare ' + X + D + 'could not query Pages (' + firstError(r) + ')' + X);
    return;
  }
  if (via === 'credentials') {
    console.log(D + '  cloudflare  wrangler OAuth was unusable; answered via ' +
      present.join(', ') + X);
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

// ------------------------------------------------------- the live origin (HOST-INDEPENDENT)
// The deployment record above is evidence about Cloudflare's build queue. THIS is evidence
// about what the public domain actually serves, and it is the question the file's title asks.
//
// It exists because every previous failure of this check was the same mistake in a different
// costume: trusting one host's bookkeeping. (2) knew only Vercel after the move to Pages; (5)
// asked Pages with credentials that could not answer. As of 2026-08-19 the project ALSO builds
// as a Worker — `Workers Builds: reactor-dynamics` reports on every PR alongside
// `Cloudflare Pages`, and a Worker of that name has been deploying since 2026-08-12 — so
// "which product serves the site" is a live question with a moving answer.
//
// This check does not care. `site/version.js` is stamped at deploy with the COMMIT
// (`site/stamp_version.js`: `window.RD_VERSION = "alpha · <7-char sha>"`, and "alpha · dev"
// off the released channel), so fetching it from the production domain proves the released
// commit is what a visitor gets — whichever host got it there, and whether or not any
// deployment API can be reached.
//
// Cache: the file is served `Cache-Control: max-age=14400` (4 h, measured), so a plain GET can
// be answered from an edge or connection cache and report the PREVIOUS release. The sha in the
// query string plus `Cache-Control: no-cache` is what makes the answer about now.
const SITE = 'https://reactordynamics.com';          // the production domain
const https = require('https');

function liveOrigin(done) {
  const url = SITE + '/site/version.js?_=' + sha.slice(0, 12);
  const req = https.get(url, {
    headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
    timeout: 20000,
  }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      return https.get(res.headers.location, {
        headers: { 'Cache-Control': 'no-cache' }, timeout: 20000,
      }, (r2) => body(r2, done)).on('error', (e) => done({ err: e.message }));
    }
    body(res, done);
  });
  req.on('timeout', () => { req.destroy(new Error('timed out after 20 s')); });
  req.on('error', (e) => done({ err: e.message }));

  function body(res, cb) {
    let s = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { s += c; });
    res.on('end', () => {
      if (res.statusCode !== 200) return cb({ err: 'HTTP ' + res.statusCode });
      const m = /RD_VERSION\s*=\s*"([^"]*)"/.exec(s);
      if (!m) return cb({ err: 'no RD_VERSION in the response' });
      cb({ label: m[1], stamped: (m[1].split('·').pop() || '').trim() });
    });
  }
}

liveOrigin((live) => {
  const short = sha.slice(0, 7);
  let served = null;                                  // true / false / null = could not tell
  if (live.err) {
    // Unreachable is NOT wrong — the same rule this file already applies to wrangler. Say so
    // and fall back to the deployment record, rather than reporting a release as dead because
    // the machine running the check has no network.
    console.log(Y + '  live origin ' + X + D + 'could not read ' + SITE +
      '/site/version.js (' + live.err + ')' + X);
  } else if (live.stamped === short) {
    served = true;
    console.log(G + '  live origin SERVING' + X + D + '  ' + SITE + ' → ' + live.label + X);
  } else {
    served = false;
    console.log(R + '  live origin ' + X + D + SITE + ' is serving ' + live.label +
      ', not ' + short + X);
  }

  console.log('');

  // The live origin OUTRANKS the deployment record when both spoke: a build that succeeded and
  // a domain that serves it are different claims, and only the second one is the release.
  if (served === true) {
    console.log(B + G + 'LIVE' + X + '  ' + SITE + ' is serving this commit' +
      (found.length ? ' — and a successful production deployment exists (' + found.join(', ') + ')' : '') + '\n');
    process.exit(0);
  }
  if (served === null && found.length) {
    console.log(B + G + 'LIVE' + X + '  a successful production deployment exists for this commit — ' +
      found.join(' and ') + '\n');
    console.log(D + 'The live origin could not be read, so this is the deployment RECORD, not\n' +
      'proof of what the domain serves. Re-run with a network, or curl ' + SITE +
      '/site/version.js.' + X + '\n');
    process.exit(0);
  }

  console.log(B + R + 'NOT LIVE' + X + '  ' + (served === false
    ? 'the production domain is not serving this commit.'
    : 'no successful production deployment found for this commit.') + '\n');
  console.log(D +
    'Before assuming the deploy failed, rule out the things that look identical to it:\n' +
    '  1. It may still be building. A missing production deploy and a slow one are the same\n' +
    '     from outside, so WAIT and re-run rather than re-pushing.\n' +
    '  2. Cloudflare may not have been reachable — a `wrangler` auth failure prints a YELLOW\n' +
    '     line above and is NOT the same as "no deployment". Read which one you got.\n' +
    '  3. A deployment record WITHOUT the live origin agreeing is the interesting case: the\n' +
    '     build succeeded and the domain still serves the previous release. That is the\n' +
    '     Alpha 1.0.0 shape, and it is what promoting a deployment fixes.\n' +
    'If it is genuinely missing: promoting a deployment in the Pages dashboard is one click.\n' +
    'Do NOT push develop to the same commit to retrigger it — that is the suspected CAUSE of\n' +
    'the original Alpha 1.0.0 failure, not a remedy.' + X);
  process.exit(1);
});
