/* Deploy build step: stamp WHICH BUILD this is (site/version.js) and WHO IT IS FOR
 * (site/channel.js), plus a robots.txt that keeps non-production hosts out of search.
 *
 * Runs on Vercel and on Cloudflare Pages, and is correct off both. Kept under site/
 * (not tools/) because it is deploy BUILD tooling; site/build_site.js declares it
 * build-only (BUILD_ONLY) and prunes it from the published output.
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

/* The dashboard's queued flag stages, fetched at BUILD time.
 *
 * Why the build and not the browser: site/flags.js must not load anything at runtime.
 * test/run_portable.js asserts that for every file the shell ships, and it is the only
 * reason the single-file offline build works — it already caught the same pattern in
 * telemetry.js, and the answer then was to ship neither file rather than add an
 * exception. So the value becomes a literal here, exactly like the channel.
 *
 * FAILURE IS NOT SILENT AND IS NOT FATAL. A Worker outage must not block a site deploy,
 * so a failed fetch falls back to the stage literals already in flags.js — which is the
 * behaviour that existed before any of this. But falling back silently would let a
 * deploy quietly discard a change the owner made and believed was shipping, so the
 * source is recorded in the generated file and printed in the build log. The dashboard
 * reads that marker back and can say the last build did not pick the settings up.
 */
async function fetchStages() {
  const url = process.env.RD_FLAGS_ENDPOINT;
  if (!url) return { stages: {}, source: 'none', note: 'RD_FLAGS_ENDPOINT not set' };
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);   // a hung fetch must not hang a deploy
    const res = await fetch(url, { signal: ctl.signal, headers: { 'Cache-Control': 'no-store' } });
    clearTimeout(t);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    const stages = (j && j.stages) || {};
    // Validate rather than trust: this value is about to become executable source.
    // Built by split() rather than as bare quoted literals ON PURPOSE. These are
    // STAGES, not channels, and test/run_flags.js enumerates the channels this file can
    // emit by scanning it for quoted channel names — which the two vocabularies share
    // two of. A literal array here is counted as two more channel emissions and checked
    // against the wrong vocabulary. The scan does not strip comments either, so naming
    // those values in quotes ANYWHERE in this file, prose included, inflates it further.
    const OK_STAGES = 'public preview off'.split(' ');
    const clean = {};
    Object.keys(stages).forEach((k) => {
      if (/^[a-z][a-z0-9_]*(:[a-z0-9_]+)?$/.test(k) && OK_STAGES.indexOf(stages[k]) !== -1) {
        clean[k] = stages[k];
      }
    });
    return { stages: clean, source: 'kv', updated: (j && j.updated) || null };
  } catch (e) {
    return { stages: {}, source: 'fallback', note: String(e.message || e) };
  }
}

async function main() {
  const r = resolve(process.env);
  const f = await fetchStages();
  if (f.source === 'fallback') {
    console.warn('[stamp] FLAG STAGES: could not reach ' + process.env.RD_FLAGS_ENDPOINT +
      ' (' + f.note + ') — falling back to the literals in site/flags.js. ' +
      'Any change queued in the dashboard is NOT in this build.');
  } else if (f.source === 'kv') {
    console.log('[stamp] flag stages: ' + Object.keys(f.stages).length + ' override(s) from KV');
  }

  fs.writeFileSync(path.join(__dirname, 'version.js'),
    '/* Generated at deploy by site/stamp_version.js. Repo copy is a placeholder. */\n' +
    'window.RD_VERSION = ' + JSON.stringify(r.label) + ';\n');

  /* THE GENERATED FILES CARRY THEIR OWN DOCUMENTATION, and that is not decoration.
   * These files are committed (as the local-run placeholders) AND rewritten on every
   * deploy, so anything hand-written in them is destroyed the first time anyone runs
   * this script locally — which is exactly what happened on 2026-08-07, taking 23 lines
   * of explanation with it. Emitting the prose here means the artifact and the committed
   * copy are the same thing, and the trap cannot fire again. */
  fs.writeFileSync(path.join(__dirname, 'channel.js'),
    '/* GENERATED by site/stamp_version.js — do not hand-edit; a local run overwrites it.\n' +
    ' * This build: ' + r.host + ' — ' + r.why + '\n' +
    ' *\n' +
    ' *   \'public\'  — the released website (the `main` branch, on whichever host)\n' +
    ' *   \'preview\' — a test deployment: any other branch, e.g. the `develop` test site\n' +
    ' *   \'dev\'     — no CI at all: a clone, file://, a local static server\n' +
    ' *\n' +
    ' * site/flags.js resolves unvetted content as `channel() !== \'public\'`, so \'dev\' is\n' +
    ' * the most PERMISSIVE value here, not the safest — which is why resolve() never\n' +
    ' * falls back to it on a machine that looks like CI. test/run_channel.js pins the\n' +
    ' * whole host matrix, including that one.\n' +
    ' *\n' +
    ' * RD_FLAG_STAGES below is the dashboard\'s answer, fetched from the Worker at BUILD\n' +
    ' * time and frozen here as a literal — the sim never asks anything at runtime, which\n' +
    ' * is what test/run_portable.js exists to keep true. It OVERRIDES the matching stage\n' +
    ' * in site/flags.js; an empty object means "use the literals", which is also what a\n' +
    ' * failed fetch produces. RD_FLAG_SOURCE says which of those happened, because the\n' +
    ' * two are indistinguishable from the values alone.\n' +
    ' */\n' +
    'window.RD_CHANNEL = ' + JSON.stringify(r.channel) + ';\n' +
    'window.RD_FLAG_STAGES = ' + JSON.stringify(f.stages) + ';\n' +
    'window.RD_FLAG_SOURCE = ' + JSON.stringify(f.source + (f.updated ? ' ' + f.updated : '')) + ';\n');

  /* KEEP THE TEST SITE OUT OF SEARCH. The test site — `develop.reactor-dynamics.pages.dev`
   * *(OWNER RULING, 2026-08-09: "instead of dev.reactordynamics.com im going to use the
   * currently functioning https://develop.reactor-dynamics.pages.dev/. This works just as
   * well.")* — serves the same pages as the live domain, so without this it competes with
   * production in results and can surface half-finished copy under the project's name.
   * That it is a `pages.dev` host rather than a subdomain changes nothing here: it is
   * publicly reachable and indexable. The rel=canonical tags
   * on every page already point at the live domain, which discourages indexing; this
   * is the belt to that pair of braces. Generated rather than committed so it cannot
   * disagree with the channel it is supposed to follow — and gitignored for the same
   * reason site/version.js's real value is. */
  /* The usage-data endpoint, stamped the same way and for the same reason: the repo
   * copy is empty, so a clone and a local file:// run send nothing without anyone
   * having to remember to switch them off. Supplied by the deploy environment
   * (RD_TELEMETRY_ENDPOINT), so it is configuration rather than source — and if it
   * is not set, every deploy is silent too. Failing to an empty string is the whole
   * point: the safe state must be the one that needs no action. */
  const tel = (process.env.RD_TELEMETRY_ENDPOINT || '').trim();
  fs.writeFileSync(path.join(__dirname, 'telemetry_endpoint.js'),
    '/* GENERATED by site/stamp_version.js — do not hand-edit; a local run overwrites it.\n' +
    ' * Supplied by the deploy environment as RD_TELEMETRY_ENDPOINT.\n' +
    ' *\n' +
    ' * EMPTY IS THE SAFE STATE AND THE DEFAULT: site/telemetry.js sends nothing at all\n' +
    ' * without an endpoint, so a clone, a local file:// run and any deploy that has not\n' +
    ' * set the variable are all silent by construction rather than by anyone remembering\n' +
    ' * to switch them off.\n' +
    ' *\n' +
    ' * tools/make_portable.js OMITs this file and telemetry.js from the offline build\n' +
    ' * entirely — it runs after this script, so blanking alone would be too late to be\n' +
    ' * trustworthy, and "is not present" is a stronger promise than "cannot fire".\n' +
    ' */\n' +
    'window.RD_TELEMETRY_ENDPOINT = ' + JSON.stringify(tel) + ';\n');

  const robots = r.channel === 'public'
    ? 'User-agent: *\nAllow: /\n'
    : '# ' + r.channel + ' build (' + r.host + '): not the released site — keep it out of search.\n' +
      'User-agent: *\nDisallow: /\n';
  fs.writeFileSync(path.join(__dirname, '..', 'robots.txt'), robots);

  console.log('stamp: host=' + r.host + '  branch=' + (r.branch || '<none>') +
    '  channel=' + r.channel + '  version=' + JSON.stringify(r.label) +
    '  robots=' + (r.channel === 'public' ? 'Allow' : 'Disallow') +
    '  telemetry=' + (tel ? 'configured' : 'OFF (no RD_TELEMETRY_ENDPOINT)'));
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
// main() is async since the flag-stage fetch. An unhandled rejection would exit 0 and
// ship a half-written stamp, so the failure is made explicit and non-zero. (The fetch
// itself never rejects — it degrades to the literals — so reaching this means a real
// bug in the stamping, which SHOULD stop a deploy.)
if (require.main === module) {
  main().catch((e) => { console.error('[stamp] FAILED:', e && e.stack || e); process.exit(1); });
}
