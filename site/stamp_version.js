/* Deploy build step: stamp WHICH BUILD this is (site/version.js) and WHO IT IS FOR
 * (site/channel.js), plus a robots.txt that keeps non-production hosts out of search.
 *
 * Runs on Vercel and on Cloudflare Pages, and is correct off both. Kept under site/
 * (not tools/) so .vercelignore still ships it at build time. See vercel.json.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS HOST-AGNOSTIC, AND WHY THAT IS NOT COSMETIC (2026-08-07)
 *
 * It used to read VERCEL_ENV and nothing else. Cloudflare Pages does not set that
 * variable — it sets CF_PAGES / CF_PAGES_BRANCH / CF_PAGES_COMMIT_SHA — so on
 * Cloudflare the old code fell through to its 'dev' default. MEASURED before the
 * fix, with the Vercel variables absent:
 *
 *     RD_CHANNEL : dev
 *       on(campaign)     = true    (stage: preview)
 *       on(scenarios)    = true    (stage: preview)
 *       on(checklists)   = true    (stage: preview)
 *       on(walkthroughs) = true    (stage: preview)
 *
 * That is the PUBLIC site. site/flags.js resolves preview-stage content as
 * `channel() !== 'public'`, so 'dev' is the most PERMISSIVE value, not the safest
 * one — the four areas the owner declared placeholders (#241: "I consider them
 * placeholders until I have gone through them") would all have gone live, silently,
 * on a host migration. Nothing fails, no gate reddens, the site just quietly starts
 * offering unvetted content. RD_VERSION degrades to "alpha · dev" in the same breath,
 * so every bug report loses the SHA that identifies its build.
 *
 * The lesson is in the DEFAULT, not the variable name: an unrecognised environment
 * must not land on the permissive answer. See the `CI` branch below.
 *
 * test/run_channel.js pins the whole matrix, which is why `resolve()` is a pure
 * function of an env object and the file writes happen only under `require.main`.
 * That gate exists because this defect is otherwise only observable at deploy time,
 * on someone else's machine, where nobody is looking.
 * --------------------------------------------------------------------------- */
'use strict';
const fs = require('fs');
const path = require('path');

/* The branch that IS the released website. Cloudflare Pages calls this the project's
 * production branch and reports it in CF_PAGES_BRANCH; Vercel reports the same thing
 * as VERCEL_ENV=production. If the Pages project is ever pointed at a different
 * production branch, this comparison fails CLOSED — the apex would serve a build
 * stamped 'preview', which over-gates (hides unvetted content) rather than
 * under-gates. That is the direction to be wrong in. */
const PRODUCTION_BRANCH = 'main';

/* Pure: env in, decision out. No I/O, so the gate can ask it anything. */
function resolve(env) {
  env = env || {};
  let host, branch, sha, channel, why;

  if (env.CF_PAGES) {
    // Cloudflare Pages. CF_PAGES is set to "1" on every build there and nowhere else,
    // so it identifies the host without depending on branch naming.
    host = 'cloudflare';
    branch = env.CF_PAGES_BRANCH || '';
    sha = env.CF_PAGES_COMMIT_SHA || '';
    channel = branch === PRODUCTION_BRANCH ? 'public' : 'preview';
    why = 'CF_PAGES_BRANCH=' + JSON.stringify(branch) +
      (channel === 'public' ? ' is the production branch' : ' is not ' + PRODUCTION_BRANCH);
  } else if (env.VERCEL_ENV) {
    // Vercel. VERCEL_ENV is production | preview | development.
    host = 'vercel';
    branch = env.VERCEL_GIT_COMMIT_REF || '';
    sha = env.VERCEL_GIT_COMMIT_SHA || '';
    channel = env.VERCEL_ENV === 'production' ? 'public'
      : env.VERCEL_ENV === 'preview' ? 'preview' : 'dev';
    why = 'VERCEL_ENV=' + JSON.stringify(env.VERCEL_ENV);
  } else if (env.CI) {
    // A BUILD ON A HOST WE DO NOT RECOGNISE — the case that caused this rewrite,
    // arriving next time under a third provider's variable names. Land on 'public',
    // the RESTRICTIVE answer: the site then offers only vetted content. The cost of
    // being wrong here is a dev site that is uselessly conservative; the cost of the
    // permissive default is unvetted content on the public one. Loud about it below,
    // because a silently conservative deploy is still a misconfiguration.
    host = 'unknown-ci';
    branch = env.GITHUB_REF_NAME || '';
    sha = env.GITHUB_SHA || '';
    channel = 'public';
    why = 'CI is set but no host recognised — defaulting to the restrictive channel';
  } else {
    // A clone, file://, or a local static server. 'dev' shows everything on purpose:
    // this is the author's machine, and hiding half the app from the person building
    // it would be the wrong trade.
    host = 'local';
    branch = '';
    sha = '';
    channel = 'dev';
    why = 'no CI environment — a local checkout';
  }

  const short = (sha || 'dev').slice(0, 7);
  return {
    host: host,
    branch: branch,
    channel: channel,
    sha: short,
    label: 'alpha · ' + short,
    why: why,
    // A build that could not name its host is a configuration problem even when the
    // channel it picked is safe. Surfaced so main() can say so in the deploy log.
    suspect: host === 'unknown-ci',
  };
}

function main() {
  const r = resolve(process.env);

  fs.writeFileSync(path.join(__dirname, 'version.js'),
    '/* Generated at deploy by site/stamp_version.js. Repo copy is a placeholder. */\n' +
    'window.RD_VERSION = ' + JSON.stringify(r.label) + ';\n');

  fs.writeFileSync(path.join(__dirname, 'channel.js'),
    '/* Generated at deploy by site/stamp_version.js — ' + r.host + ': ' + r.why + ' */\n' +
    'window.RD_CHANNEL = ' + JSON.stringify(r.channel) + ';\n');

  /* KEEP THE TEST SITE OUT OF SEARCH. dev.reactordynamics.com serves the same pages
   * as the live domain, so without this it competes with production in results and
   * can surface half-finished copy under the project's name. The rel=canonical tags
   * on every page already point at the live domain, which discourages indexing; this
   * is the belt to that pair of braces. Generated rather than committed so it cannot
   * disagree with the channel it is supposed to follow — and gitignored for the same
   * reason site/version.js's real value is. */
  const robots = r.channel === 'public'
    ? 'User-agent: *\nAllow: /\n'
    : '# ' + r.channel + ' build (' + r.host + '): not the released site — keep it out of search.\n' +
      'User-agent: *\nDisallow: /\n';
  fs.writeFileSync(path.join(__dirname, '..', 'robots.txt'), robots);

  console.log('stamp: host=' + r.host + '  branch=' + (r.branch || '<none>') +
    '  channel=' + r.channel + '  version=' + JSON.stringify(r.label) +
    '  robots=' + (r.channel === 'public' ? 'Allow' : 'Disallow'));
  console.log('       ' + r.why);
  if (r.suspect) {
    console.warn('  !! UNRECOGNISED BUILD HOST. Channel forced to "public" so no unvetted\n' +
      '     content ships, which also means a preview/test deployment will show only\n' +
      '     released features. Teach resolve() this host\'s environment variables\n' +
      '     (site/stamp_version.js) and re-run test/run_channel.js.');
  }
}

module.exports = { resolve: resolve, PRODUCTION_BRANCH: PRODUCTION_BRANCH };

/* Side effects only when run as a command, so test/run_channel.js can require this
 * file without stamping the working tree. */
if (require.main === module) main();
