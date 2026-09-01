#!/usr/bin/env node
/* verify_worker_deploy.js — is the LIVE telemetry Worker running the code in this tree?
 *
 *   node tools/verify_worker_deploy.js
 *   node tools/verify_worker_deploy.js --name=reactor-dynamics-telemetry
 *
 * ------------------------------------------------------------------------------ why it exists
 * `test/run_dashboard_time.js` has been green since 2026-08-17 and proves the SOURCE is right.
 * Nothing proved the source was ever SHIPPED. The #485 fix (dd4cefd, 2026-08-17) sat committed
 * and undeployed for fifteen days; the issue was closed `status-work-complete` on 2026-08-30
 * while the live dashboard still answered its 7-day traffic window from Cloudflare's coarse
 * tier for four hours every night — and the owner reported the identical symptom a second time
 * on 2026-08-31. Two entries in `Diagnostic/TUNING_LOG.md` said "NOT DEPLOYED" the whole time.
 *
 * The Worker ships BY HAND (`cd worker && wrangler deploy`) and nothing in the repo build
 * touches it — `worker/wrangler.toml` says so in its own header. So "committed" and "live" are
 * two independent facts and only one of them had a check.
 *
 * ------------------------------------------------------------------------ what it will not do
 * NOT a `run_all` gate, and deliberately not named `verify_*.js` under `test/`: run_all
 * discovers that pattern and would fail on a runner CI cannot execute. Reading the live
 * deployment needs wrangler's OAuth login, which CI does not have. This is a manual command and
 * a step in the `release-to-main` skill.
 *
 * IT NEVER EXITS 0 ON "DON'T KNOW". A check that quietly passes when it cannot reach its
 * credential is a green light for an unknown — the hollow-check failure mode CLAUDE.md lists.
 * No answer exits 2, exactly like a stale deployment.
 *
 * THE SCOPED TOKEN SHADOWS THE OAUTH LOGIN. `CLOUDFLARE_API_TOKEN` in the environment is an
 * Account-Analytics-Read token; wrangler picks it up in preference to its OAuth session and
 * then has no Workers permission at all. It is deleted from the child environment below — do
 * not "simplify" that away (`memory/wrangler-token-shadows-oauth.md`, `worker/README.md`).
 *
 * ---------------------------------------------------------------------------------- the check
 * newest commit touching `worker/`  vs  newest deployment's Created: timestamp.
 * Commit newer than deployment  ->  exit 2, naming every commit that has not shipped.
 *
 * Committer date, not author date: a cherry-pick or a rebase moves the code without moving the
 * author stamp, and it is the code reaching the tree that decides whether a deploy is owed.
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const val = (f, d) => {
  const a = args.find((x) => x.startsWith(f + '='));
  return a ? a.slice(f.length + 1) : d;
};
const NAME = val('--name', 'reactor-dynamics-telemetry');
const REPO = path.resolve(__dirname, '..');
/* ONLY WHAT THE DEPLOY ACTUALLY CARRIES. `worker/` as a whole is the wrong pathspec: the first
 * commit made after this file existed touched `worker/README.md`, and the check duly reported a
 * deploy was owed for a documentation edit. A check that cries wolf on prose is a check people
 * learn to ignore, which is worse than not having one. `main` is `src/index.js` and the bindings
 * are in the toml, so those two paths are the bundle. */
const PATHS = val('--paths', 'worker/src,worker/wrangler.toml').split(',').filter(Boolean);
const DIR = PATHS.join(' ');

const C = process.stdout.isTTY
  ? { b: '\x1b[1m', d: '\x1b[2m', g: '\x1b[32m', r: '\x1b[31m', x: '\x1b[0m' }
  : { b: '', d: '', g: '', r: '', x: '' };

function fail(msg, detail) {
  console.error(`${C.r}FAIL${C.x} ${msg}`);
  if (detail) console.error(detail);
  process.exit(2);
}

// ------------------------------------------------------------------- the tree side
const log = spawnSync('git', ['log', '-1', '--format=%H %cI %s', '--', ...PATHS],
  { cwd: REPO, encoding: 'utf8' });
if (log.status !== 0 || !String(log.stdout).trim()) {
  fail(`could not read git history for ${DIR}`, log.stderr);
}
const [sha, committed, ...rest] = String(log.stdout).trim().split(' ');
const subject = rest.join(' ');
const committedMs = Date.parse(committed);

// ------------------------------------------------------------------- the live side
// wrangler prints a human list; the machine-readable flag is not stable across versions, so
// this reads every `Created:` stamp and takes the newest rather than trusting the ordering.
const env = Object.assign({}, process.env);
delete env.CLOUDFLARE_API_TOKEN;              // see the header — it shadows the OAuth login

// `shell` is NOT optional on Windows: npx is a .cmd, and Node >= 18.20 / >= 20.12 refuses to
// spawn one without a shell (EINVAL) — the fix for CVE-2024-27980. Every argument here is a
// bare token, so there is nothing for the shell to re-split.
const wr = spawnSync('npx',
  ['--yes', 'wrangler@latest', 'deployments', 'list', '--name', NAME],
  { cwd: path.join(REPO, 'worker'), encoding: 'utf8', env, timeout: 300000,
    shell: process.platform === 'win32' });

const out = String(wr.stdout || '') + String(wr.stderr || '');
if (wr.error) fail(`could not run wrangler (${wr.error.message})`, out.slice(0, 400));

const stamps = (out.match(/Created:\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/g) || [])
  .map((s) => Date.parse(s.replace(/^Created:\s*/, '')))
  .filter((n) => Number.isFinite(n));

if (!stamps.length) {
  fail(`wrangler returned no deployment for "${NAME}" — cannot tell whether it is current.`,
    `${C.d}This is exit 2, not a skip: an unreadable deployment is an unknown, and an unknown\n`
    + `is what let #485 sit undeployed for fifteen days.\n\n`
    + `If it is an auth problem, log in in YOUR OWN terminal:\n`
    + `  env -u CLOUDFLARE_API_TOKEN npx wrangler login${C.x}\n\n${out.slice(0, 600)}`);
}

const liveMs = Math.max(...stamps);
const live = new Date(liveMs).toISOString();

// ------------------------------------------------------------------------- verdict
console.log(`${C.b}worker${C.x}      ${NAME}`);
console.log(`${C.b}deployed${C.x}    ${live}   ${C.d}(newest of ${stamps.length} deployments)${C.x}`);
console.log(`${C.b}newest ${DIR}${C.x} ${committed}   ${sha.slice(0, 7)} ${subject}`);

if (committedMs <= liveMs) {
  console.log(`\n${C.g}PASS${C.x} the live Worker is at or ahead of ${DIR} in this tree.`);
  process.exit(0);
}

const behind = spawnSync('git',
  ['log', `--since=${live}`, '--format=%h %cs %s', '--', ...PATHS],
  { cwd: REPO, encoding: 'utf8' });

/* The hint names the config by ABSOLUTE path rather than saying `cd worker` first. Run from the
 * repo root, `wrangler deploy` finds the PAGES project instead, warns about it, AUTO-ANSWERS THE
 * CONFIRMATION "yes" in a non-interactive shell, and invents a Worker name from the directory —
 * measured 2026-08-31, "eactor--ynamics". Only the missing entry-point stopped it. A one-line
 * command that cannot be run from the wrong directory is cheaper than the warning about it. */
fail(`the live Worker is BEHIND this tree — ${DIR} has commits that were never deployed.`,
  `\n${String(behind.stdout || '').trimEnd()}\n\n`
  + `${C.d}Ship them:  env -u CLOUDFLARE_API_TOKEN npx wrangler deploy \\\n`
  + `              --config ${path.join(REPO, 'worker', 'wrangler.toml').replace(/\\/g, '/')}${C.x}`);
