/* run_channel.js — static guard for WHICH AUDIENCE A DEPLOY THINKS IT IS FOR.
 *
 *   node test/run_channel.js
 *
 * WHY THIS EXISTS. `site/stamp_version.js` decides, at deploy time, whether a build
 * is 'public' (the released website), 'preview' (a test deployment) or 'dev' (a local
 * checkout). `site/flags.js` then resolves every unvetted feature against it:
 *
 *     if (stage === 'public') return true;
 *     if (stage === 'off')    return false;
 *     return channel() !== 'public';        // <- 'preview' AND 'dev' both show it
 *
 * So 'dev' is the most PERMISSIVE value, and it is also what the stamper falls back
 * to when it cannot identify its host. Until 2026-08-07 it identified exactly one
 * host — it read VERCEL_ENV and nothing else — which meant a move to Cloudflare
 * Pages (CF_PAGES_BRANCH, no VERCEL_ENV) would have stamped the PUBLIC site 'dev'
 * and turned on all four areas the owner had declared placeholders (#241). Measured
 * before the fix: campaign, scenarios, checklists and walkthroughs all `on`.
 *
 * Nothing would have failed. No gate reddened, the pages rendered, the deploy was
 * green — the site would simply have started offering unvetted content, on a host
 * migration, with no signal. That is the whole argument for this file: the decision
 * is made from environment variables that only exist on someone else's build
 * machine, so it is unobservable here unless something asks it directly.
 *
 * WHAT IT PINS. The full host matrix, and — more importantly — the CONSEQUENCE of
 * each answer, by asking site/flags.js what a visitor on that channel would actually
 * be offered. A channel string is not the thing that matters; what the channel does
 * to the flag layer is. The two are checked together so neither can drift alone.
 *
 * SHAPE. Static and pure: `resolve()` takes an env object and returns a decision, so
 * this runner writes nothing and stamps nothing — it cannot leave the working tree
 * modified even if it is killed mid-run. Same report convention as run_release.js /
 * run_site_meta.js: a check carries either the reason it passed or nothing.
 */
'use strict';
var path = require('path');
var ROOT = path.join(__dirname, '..');
var G = '\x1b[32m', R = '\x1b[31m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';

var stamp = require(path.join(ROOT, 'site', 'stamp_version.js'));

// flags.js is a browser global-namespace script; require() executes it into the
// shared global (CLAUDE.md, "Code conventions"). It reads globalThis.RD_CHANNEL on
// every call rather than caching, which is what lets the matrix below flip it.
global.window = global;
require(path.join(ROOT, 'site', 'channel.js'));
require(path.join(ROOT, 'site', 'flags.js'));
var Flags = globalThis.RD.Flags;

var findings = [], violations = [];
function check(rule, where, text, why) {
  var f = { rule: rule, where: where, text: text, why: why };
  findings.push(f);
  if (!why) violations.push(f);
  return f;
}

// The four areas that are built but held back until each is played end to end
// (#241). They are the payload of every decision in this file: if a channel is
// wrong, these are what leaks.
var GATED = ['campaign', 'scenarios', 'checklists', 'walkthroughs'];

// ---------------------------------------------------------------- A. the host matrix
// Each row is a real deployment situation, named as one. `expect` is the channel;
// `offers` is whether a visitor there should be offered the unvetted areas.
var CASES = [
  { name: 'Cloudflare Pages, production branch',
    env: { CF_PAGES: '1', CF_PAGES_BRANCH: 'main', CF_PAGES_COMMIT_SHA: 'abcdef1234567890' },
    expect: 'public', offers: false, host: 'cloudflare' },

  { name: 'Cloudflare Pages, develop  (dev.reactordynamics.com)',
    env: { CF_PAGES: '1', CF_PAGES_BRANCH: 'develop', CF_PAGES_COMMIT_SHA: 'feed0123456789ab' },
    expect: 'preview', offers: true, host: 'cloudflare' },

  { name: 'Cloudflare Pages, any other branch',
    env: { CF_PAGES: '1', CF_PAGES_BRANCH: 'workbench', CF_PAGES_COMMIT_SHA: '0123456789abcdef' },
    expect: 'preview', offers: true, host: 'cloudflare' },

  { name: 'Vercel production',
    env: { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main', VERCEL_GIT_COMMIT_SHA: 'cafebabe0000000' },
    expect: 'public', offers: false, host: 'vercel' },

  { name: 'Vercel preview (a develop push)',
    env: { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'develop', VERCEL_GIT_COMMIT_SHA: 'deadbeef0000000' },
    expect: 'preview', offers: true, host: 'vercel' },

  { name: 'a local checkout / file:// / npx serve',
    env: {},
    expect: 'dev', offers: true, host: 'local' },

  // The defence against the NEXT host migration. An unrecognised CI must land on the
  // restrictive answer, not the permissive one — being uselessly conservative on a
  // test site is recoverable; shipping unvetted content to the public site is the
  // failure this whole file is about.
  { name: 'an UNRECOGNISED build host (the next migration)',
    env: { CI: 'true', GITHUB_SHA: '99887766554433221100' },
    expect: 'public', offers: false, host: 'unknown-ci' },
];

CASES.forEach(function (c) {
  var r = stamp.resolve(c.env);

  check('HOST', c.name, 'host = ' + r.host,
    r.host === c.host ? 'identified from its own environment variables' : null);

  check('CHANNEL', c.name, 'channel = ' + r.channel + ' (expected ' + c.expect + ')',
    r.channel === c.expect ? r.why : null);

  // THE CONSEQUENCE. Ask the flag layer what this channel actually offers, rather
  // than trusting that a string called 'public' behaves like one.
  globalThis.RD_CHANNEL = r.channel;
  var offered = GATED.filter(function (id) { return Flags.on(id); });
  var allOn = offered.length === GATED.length, allOff = offered.length === 0;

  check('OFFERS', c.name,
    'unvetted areas offered: ' + (offered.length ? offered.join(', ') : '<none>') +
    '  (' + offered.length + '/' + GATED.length + ')',
    (c.offers ? allOn : allOff)
      ? (c.offers ? 'a tester sees the work in progress, which is the point'
                  : 'the released site offers only what has been played through')
      : null);
});

// ---------------------------------------------------------------- B. the regression itself
// Named and asserted on its own, because a matrix row reads as one case among seven
// and this one is the reason the file exists. Reproduces the exact pre-fix condition:
// Cloudflare's variables present, Vercel's absent.
var cf = stamp.resolve({ CF_PAGES: '1', CF_PAGES_BRANCH: 'main', CF_PAGES_COMMIT_SHA: 'abcdef1234567890' });
check('REGRESSION', 'the 2026-08-07 host-migration defect',
  'Cloudflare production resolves to ' + JSON.stringify(cf.channel) + ', not "dev"',
  cf.channel === 'public'
    ? 'the pre-fix stamper read VERCEL_ENV only and fell through to "dev" here — ' +
      'which flags.js treats as the MOST permissive channel, not the safest'
    : null);

globalThis.RD_CHANNEL = 'dev';
var devOffers = GATED.filter(function (id) { return Flags.on(id); }).length;
check('REGRESSION', 'why "dev" was the dangerous fallback',
  'channel "dev" offers ' + devOffers + '/' + GATED.length + ' unvetted areas',
  devOffers === GATED.length
    ? 'documents the blast radius: an unidentified host must never land here'
    : null);

// The SHA has to survive too — it is what a bug report quotes to name its build.
check('REGRESSION', 'the build keeps its identity on Cloudflare',
  'version label = ' + JSON.stringify(cf.label),
  /^alpha · [0-9a-f]{7}$/.test(cf.label)
    ? 'CF_PAGES_COMMIT_SHA, 7 chars — "alpha · dev" is the unstamped failure'
    : null);

// ---------------------------------------------------------------- C. robots follows the channel
// Not the file (it is generated at deploy and gitignored) but the RULE, stated where
// it can be read: only the released site may be indexed.
check('ROBOTS', 'search indexing follows the channel',
  'public -> Allow, everything else -> Disallow',
  stamp.resolve({ CF_PAGES: '1', CF_PAGES_BRANCH: 'main' }).channel === 'public' &&
  stamp.resolve({ CF_PAGES: '1', CF_PAGES_BRANCH: 'develop' }).channel !== 'public'
    ? 'the test site serves the same pages as the live domain and must not compete' : null);

// ---------------------------------------------------------------- report
var byRule = {};
findings.forEach(function (f) { (byRule[f.rule] = byRule[f.rule] || []).push(f); });
['HOST', 'CHANNEL', 'OFFERS', 'REGRESSION', 'ROBOTS'].forEach(function (r) {
  var all = byRule[r] || [], bad = all.filter(function (f) { return !f.why; });
  if (!all.length) return;
  console.log('\n' + B + (bad.length ? R + 'FAIL' : G + 'PASS') + X + '  ' + B + r + X +
    D + '  (' + all.length + ' check' + (all.length === 1 ? '' : 's') + ', ' +
    bad.length + ' failed)' + X);
  bad.forEach(function (f) {
    console.log(R + '  ✗' + X + ' ' + f.where + D + '  ' + f.text + X);
  });
});

var bad = violations.length;
console.log('\n' + B + '─'.repeat(42) + X);
console.log(B + (bad ? R + 'CHANNEL STAMP: FAIL' : G + 'CHANNEL STAMP: OK') + X +
  '  ' + findings.length + ' checks, ' + bad + ' failed' +
  D + '  ·  ' + CASES.length + ' deployment situations' + X);
if (bad) {
  console.log(D + 'site/stamp_version.js decides who a build is for. "dev" is the most\n' +
    'PERMISSIVE channel in site/flags.js, so an unidentified host must never land\n' +
    'there — see the header of either file.' + X);
}
process.exit(bad ? 1 : 0);
