/*
 * run_usage_page.js — the Feature usage view of the ops dashboard (#674).
 *
 *   node test/run_usage_page.js
 *   node test/run_usage_page.js --inject     # prove the gate can go red
 *
 * WHY THIS RUNNER HAS TO EXIST. `worker/src/usage.js` is where the walkthrough telemetry
 * becomes an ANSWER — a completion rate, a drop-off percentage, a p90 — and every one of
 * those is arithmetic this repo performs and Cloudflare does not. The queries return rows;
 * the meaning is assembled here-side. So a wrong denominator, a quantile index off by one
 * or a key parsed on the wrong separator all render a plausible, confident, wrong page,
 * and NOTHING else in the tree looks at it: `run_telemetry` reads the Worker's ingest as
 * TEXT, `run_rollup` drives the scheduled job, `run_dashboard_time` tests render.js's time
 * helpers. The dashboard's own numbers had no coverage of any kind.
 *
 * The failures it guards are the silent ones, all of them:
 *
 *   1. THE FUNNEL'S DENOMINATOR. "Sessions completing step N" is meaningless without
 *      saying "of what". It is of everyone who STARTED the walkthrough, deliberately —
 *      normalising on step 0 instead would make a walkthrough people open and abandon
 *      before checking anything off read as 100 % by definition, which is the single
 *      finding the owner asked for.
 *   2. THE QUANTILE. p90 is the whole point of the time table — a step whose p90 towers
 *      over its median is one most people walk through and some cannot finish. A p90 that
 *      is quietly a median says every step is fine.
 *   3. THE COMPOSITE KEY. blob5 is `id:step:by` or `id:reason`; parsing it on the wrong
 *      part silently attributes every row to one bucket.
 *   4. THE EMPTY-DATASET PATH. Analytics Engine types columns PER RESULT SET, so naming
 *      `double9` in a query no row matches is a 422 rather than an empty table. Before the
 *      client release that emits these events there are no rows at all, so the probe-guard
 *      is the difference between a page that explains itself and five error blocks.
 *
 * NO NETWORK. `cfapi.js` is replaced wholesale by a fake `sql` that dispatches on the
 * query text and returns canned rows, so what is under test is the page's arithmetic and
 * its rendering — not Cloudflare's behaviour, which this could not exercise anyway.
 *
 * The ESM loader is `run_rollup.js`'s idiom (base64 data: URLs, graph resolved bottom-up),
 * extended with a STUB map so a whole dependency can be swapped for a fake.
 */
'use strict';
var path = require('path');
var fs = require('fs');

var BOLD = '\x1b[1m', RED = '\x1b[31m', GREEN = '\x1b[32m', RST = '\x1b[0m';
var nPass = 0, nFail = 0;
function ck(name, cond, note) {
  var ok = !!cond;
  if (ok) nPass++; else nFail++;
  console.log((ok ? '  ' + GREEN + 'PASS' + RST + '  ' : '  ' + RED + 'FAIL' + RST + '  ') + name +
    (note ? '  -- ' + note : ''));
  return ok;
}
function head(s) { console.log('\n' + BOLD + s + RST); }

var INJECT = process.argv.indexOf('--inject') >= 0;

/* THE INJECTIONS, one per silent failure named in the header. Each is a change a real
 * author could make believing it harmless, and each leaves the page rendering normally. */
function injectSrc(rel, src) {
  if (!INJECT || rel !== 'usage.js') return src;
  return src
    // 1. the funnel normalised on itself — every step 100 %.
    .split('const pct = started ? (r.sessions / started) * 100 : 0;')
    .join('const pct = 100;')
    // 2. p90 quietly becomes a second median.
    .split('p90 = quantile(v, 0.9)').join('p90 = quantile(v, 0.5)')
    // 3. the composite key parsed as if it had no third part.
    .split("c: p[2] == null ? '' : p[2]").join("c: ''");
}

// ---------------------------------------------------------------- the fake upstream
/* Dispatch on the query TEXT, most specific first. Matching loosely is how a fake starts
 * answering the wrong question — two of these queries differ only in their GROUP BY. */
function fakeSql(rows) {
  return function (token, q) {
    /* A REJECTED PROMISE, never a synchronous throw. The real `sql()` is async, so a
     * fake that throws on the spot escapes the page's per-query `.catch` and would make
     * a correctly-handled failure look unhandled — the harness reporting a defect it
     * created itself. */
    try { return dispatch(rows, q); } catch (e) { return Promise.reject(e); }
  };
}

function dispatch(rows, q) {
  {
    var asked = String(q);
    function has() {
      for (var i = 0; i < arguments.length; i++) if (asked.indexOf(arguments[i]) === -1) return false;
      return true;
    }
    if (has("LIKE 'walkthrough_%'")) return Promise.resolve(rows.probe);
    if (has("'walkthrough_start'")) return Promise.resolve(rows.starts);
    if (has("'walkthrough_end'")) return Promise.resolve(rows.ends);
    if (has("'walkthrough_rewind'")) return Promise.resolve(rows.rewinds);
    if (has("'walkthrough_step'", 'LIMIT 20000')) return Promise.resolve(rows.dwell);
    if (has("'walkthrough_step'", 'blob5 AS k')) return Promise.resolve(rows.mix);
    if (has("'walkthrough_step'", 'GROUP BY wt, step')) return Promise.resolve(rows.funnel);
    // The migrated sections. Empty is a legitimate answer and renders "(none)".
    return Promise.resolve([]);
  }
}

function fakeCfapi(sqlBody) {
  return 'export const DATASET = "reactor_dynamics_usage";\n'
    + 'export const COLUMNS_SINCE = "toDateTime(\'2026-08-11 02:54:00\')";\n'
    + 'export const sql = globalThis.__RD_FAKE_SQL;\n'
    + 'export const gql = () => Promise.resolve({});\n'
    + 'export const ACCOUNT = "acct"; export const SITE_TAG = "tag";\n' + (sqlBody || '');
}

function loadEsm(ROOT, entry, stubs) {
  var built = {};
  function build(rel) {
    if (built[rel]) return built[rel];
    var src = Object.prototype.hasOwnProperty.call(stubs, rel)
      ? stubs[rel]
      : injectSrc(rel, fs.readFileSync(path.join(ROOT, 'worker', 'src', rel), 'utf8'));
    src = src.replace(/from\s+'\.\/([\w.]+\.js)'/g, function (_, dep) {
      return "from '" + build(dep) + "'";
    });
    built[rel] = 'data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64');
    return built[rel];
  }
  return import(build(entry));
}

// ---------------------------------------------------------------- the canned dataset
/* ONE walkthrough, chosen so every arithmetic answer is DISTINCTIVE — no two figures the
 * same, so a check cannot pass by reading a neighbouring column.
 *
 *   5 sessions started `pwr_heatup` (17 steps)
 *   2 completed, 2 left, 1 stopped        -> 40 % completion
 *   step 0: 5 of 5 (100 %)   step 1: 5 of 5, SIX check-offs (a redo)
 *   step 2: 3 of 5 (60 %)    step 3: 1 of 5 (20 %)
 *   step 2 dwell: 10 20 30 40 300 s       -> median 30s, p90 300s, spread 10.0x
 *   `by` mix carries 2 overtaken + 3 caught_up = 5 stuck-signal check-offs
 */
var ROWS = {
  probe: [{ n: 30 }],
  starts: [{ wt: 'pwr_heatup', sessions: 5, n: 6, steps: 17 }],
  ends: [
    { k: 'pwr_heatup:complete', sessions: 2, n: 2 },
    { k: 'pwr_heatup:left', sessions: 2, n: 2 },
    { k: 'pwr_heatup:stopped', sessions: 1, n: 1 },
  ],
  funnel: [
    { wt: 'pwr_heatup', step: 0, sessions: 5, n: 5 },
    { wt: 'pwr_heatup', step: 1, sessions: 5, n: 6 },
    { wt: 'pwr_heatup', step: 2, sessions: 3, n: 3 },
    { wt: 'pwr_heatup', step: 3, sessions: 1, n: 1 },
  ],
  mix: [
    { k: 'pwr_heatup:00:auto', n: 5 },
    { k: 'pwr_heatup:01:auto', n: 4 },
    { k: 'pwr_heatup:01:overtaken', n: 2 },
    { k: 'pwr_heatup:02:caught_up', n: 3 },
    { k: 'pwr_heatup:03:manual', n: 1 },
  ],
  rewinds: [{ wt: 'pwr_heatup', step: 1, sessions: 2, n: 3 }],
  dwell: [10, 20, 30, 40, 300].map(function (s) {
    return { wt: 'pwr_heatup', step: 2, seconds: s };
  }),
};

/* ⚠ A NONCE, AND IT IS LOAD-BEARING. `import()` caches by URL and a data: URL is its own
 * content, so two renders built from identical source got the SAME module instance — and
 * `sql` is captured at module evaluation, which pinned every later render to the FIRST
 * fake. It did not error: the second and third cases simply re-rendered the first one's
 * data and two checks failed for a reason that had nothing to do with the page. The nonce
 * makes each render its own module graph. */
var nonce = 0;
async function render(rows, token) {
  globalThis.__RD_FAKE_SQL = fakeSql(rows);
  var ROOT = path.join(__dirname, '..');
  var mod = await loadEsm(ROOT, 'usage.js',
    { 'cfapi.js': fakeCfapi('// render ' + (++nonce) + '\n') });
  var url = new URL('https://example.invalid/dashboard?token=t&view=usage&days=30');
  var res = await mod.usagePage({ CF_ANALYTICS_TOKEN: 'x' }, url, token || 't');
  return res.text();
}

(async function main() {
  console.log(BOLD + '\nops dashboard — Feature usage view (#674)' + RST);
  var page = await render(ROWS);

  /* ------------------------------------------------------------------ 1. it is a page */
  head('1. the view renders, and knows which nav tab it is');
  ck('the page has the Feature usage heading', /<h1>Feature usage/.test(page));
  ck('the Usage tab is marked current', /<a class="on" href="[^"]*view=usage"/.test(page));
  /* THE NAME COLLISION. `&view=features` is the feature FLAGS page and predates this one;
   * a rename would break every bookmark the owner holds, so the two live side by side and
   * BOTH must be reachable from here. */
  ck('the Features (flags) tab is still in the nav and is a different view',
    /href="[^"]*view=features"/.test(page) && /href="[^"]*view=usage"/.test(page));

  /* ---------------------------------------------------------- 2. started / ended / rate */
  head('2. started, finished, abandoned — and the completion rate');
  ck('the walkthrough is listed with its step count', />pwr_heatup</.test(page) && />17</.test(page));
  /* 2 completed of 5 started. The three abandon reasons are DIFFERENT FACTS and are
   * counted apart: closing it, switching away, and the tab going. */
  ck('the completion rate is 2 of 5 = 40%', page.indexOf('>40%</b>') !== -1,
    'expected a 40% bar label');
  ck('the completion bar is drawn to 40.0%', page.indexOf('width:40.0%') !== -1);
  ck('stopped, switched and left are separate columns',
    /<th[^>]*>Stopped<\/th>/.test(page) && /<th[^>]*>Switched<\/th>/.test(page)
    && /<th[^>]*>Left<\/th>/.test(page));

  /* -------------------------------------------------------------- 3. the drop-off funnel */
  head('3. drop-off by step — the "how far do they go" answer');
  /* ⚠ THE DENOMINATOR IS THE STARTERS. Step 2 was completed by 3 sessions of the 5 that
   * started = 60 %. Against the first STEP it would also be 60 % here, which is exactly
   * why the fixture makes step 0 equal to the starters and the injection makes the
   * difference visible instead: a page normalised on itself reads 100 % everywhere. */
  ck('step 2 is 3 of 5 starters', page.indexOf('3 / 5') !== -1);
  ck('...drawn at 60.0% of the bar', page.indexOf('width:60.0%') !== -1);
  ck('step 3 is 1 of 5, drawn at 20.0%',
    page.indexOf('1 / 5') !== -1 && page.indexOf('width:20.0%') !== -1);
  ck('a step done more than once shows more check-offs than sessions',
    /step 6|>6<\/td>/.test(page), 'step 1 has 6 check-offs against 5 sessions');
  ck('the funnel says what its denominator is',
    /against everyone who STARTED/.test(page));

  /* -------------------------------------------------------------- 4. time on step */
  head('4. time on step — the "where do they get stuck" answer');
  // 10 20 30 40 300 -> median 30s, p90 300s. `dur()` renders 300 as "5m 0s".
  ck('the median of 10/20/30/40/300 is 30s', page.indexOf('>30s</td>') !== -1);
  ck('the p90 is 300s, not the median', page.indexOf('>5m 0s</td>') !== -1);
  ck('the spread is reported as p90 / median = 10.0x', page.indexOf('10.0×') !== -1);
  /* AND THE ROW MUST KNOW WHICH STEP IT IS. The quantiles alone cannot catch a key split
   * on the wrong separator — one group is still one group, so every duration figure stays
   * right while the row is labelled `pwr_heatup|2` / NaN. Measured: that exact defect
   * passed all three checks above. `NaN` is asserted page-wide because it is what every
   * arithmetic mistake here degrades to, and it renders as a plausible-looking cell. */
  ck('the time row names its own walkthrough and step',
    /<td>pwr_heatup<\/td><td class="num">2<\/td><td class="num">30s<\/td>/.test(page));
  ck('no cell anywhere on the page renders NaN', page.indexOf('NaN') === -1);
  ck('the internal group separator never reaches the page', page.indexOf('pwr_heatup|') === -1);
  /* THE RETENTION CAVEAT IS PART OF THE ANSWER. These durations are numeric columns and
   * the daily rollup keeps only the key string, so unlike the funnel above they cannot
   * outlive Analytics Engine's fixed three months. A reader who assumes otherwise draws a
   * trend off a window that silently truncates. */
  ck('the page warns that durations do not survive retention',
    /three months/.test(page) && /Analytics Engine<\/b> only|Analytics Engine only/.test(page));

  /* ---------------------------------------------------- 5. how steps checked off */
  head('5. how steps checked off — the direct stuck-signal');
  ck('the `by` verdict is parsed out of the third key part',
    page.indexOf('>overtaken</td>') !== -1 && page.indexOf('>caught_up</td>') !== -1);
  ck('overtaken and caught_up are totalled as the stuck-signal (2 + 3 = 5)',
    page.indexOf('5 of the check-offs in this window') !== -1);
  ck('...and the section says why those two mean stuck',
    /could no longer satisfy/.test(page) && /already true when they reached it/.test(page));

  /* ------------------------------------------------------------------ 6. rewinds */
  head('6. rewinds by step');
  ck('a rewind row renders its step and its count',
    /<th[^>]*>Rewinds<\/th>/.test(page) && page.indexOf('>3</td>') !== -1);
  ck('the checkpoint picker is excluded and the page says so',
    /checkpoint picker is a decision about the plant/.test(page));

  /* -------------------------------------------- 7. the sections moved off Analytics */
  head('7. the "In the simulator" block moved here');
  /* A SOURCE check, because this is a claim about a MOVE — the sections have to be on one
   * page and absent from the other, and rendering one page cannot show the other's
   * absence. Both directions, so a copy-and-paste that forgot to delete reddens too. */
  var ROOT = path.join(__dirname, '..');
  var an = fs.readFileSync(path.join(ROOT, 'worker', 'src', 'analytics.js'), 'utf8');
  ['Sessions by starting condition', 'How far through a startup they get',
   'Most-used controls', 'Controls people try but cannot use', 'Panels opened',
   'Time per session'].forEach(function (name) {
    ck('"' + name + '" is on the usage page', page.indexOf(name) !== -1);
    ck('..and is gone from analytics.js', an.indexOf(name) === -1);
  });
  ck('the "In the simulator" heading is gone from analytics.js',
    an.indexOf('In the simulator') === -1);
  ck('analytics.js links to the usage page instead', an.indexOf('view=usage') !== -1);

  /* ----------------------------------------------------- 8. the empty-dataset path */
  head('8. no walkthrough rows yet — the probe guard');
  /* Analytics Engine types columns PER RESULT SET: naming `double9` in a query nothing
   * matches is a 422, not an empty table. So on a dataset with no walkthrough rows the
   * five sections must not be ASKED, or the page is five error blocks on the day it ships.
   * The fake proves the guard by making every walkthrough query throw. */
  var empty = Object.assign({}, ROWS, { probe: [{ n: 0 }] });
  var thrown = 0;
  var strict = {
    probe: empty.probe,
    get starts() { thrown++; throw new Error('422 unable to find type of column'); },
    get ends() { thrown++; throw new Error('422'); },
    get funnel() { thrown++; throw new Error('422'); },
    get mix() { thrown++; throw new Error('422'); },
    get rewinds() { thrown++; throw new Error('422'); },
    get dwell() { thrown++; throw new Error('422'); },
  };
  var blank = await render(strict);
  ck('no walkthrough query is issued when the probe finds nothing', thrown === 0,
    thrown + ' walkthrough queries were issued against an empty dataset');
  ck('the page explains the empty window instead of erroring',
    /No walkthrough events in this window/.test(blank));
  ck('...and renders no error block', blank.indexOf('class="err"') === -1);
  ck('the migrated sections still render on an empty dataset',
    blank.indexOf('Panels opened') !== -1);

  /* --------------------------------------- 9b. a failed query is NAMED, not swallowed */
  head('9b. one broken query does not read as "no activity"');
  /* `Promise.all` rejects on the first failure, so each query catches its own — and the
   * lazy way to do that returns [] and renders an EMPTY SECTION. An empty section is
   * indistinguishable from "nothing happened", which is this file's own stated
   * anti-pattern and what #485 shipped. The error has to reach the page. */
  var partial = Object.assign({}, ROWS);
  Object.defineProperty(partial, 'funnel', {
    get: function () { return Promise.reject(new Error('422 unable to find type of column double9')); },
  });
  var broken = await render(partial);
  ck('a failed query is reported on the page', /walkthrough queries failed/.test(broken));
  ck('...it names which one', broken.indexOf('funnel: 422') !== -1);
  ck('...and says this is not an absence of activity',
    /NOT &quot;no activity&quot;|NOT "no activity"/.test(broken));
  ck('the sections that DID answer still render',
    broken.indexOf('overtaken') !== -1 && broken.indexOf('>40%</b>') !== -1);

  /* ------------------------------------------------------------------ 9. escaping */
  head('9. nothing from the wire reaches the page as markup');
  /* The enum guard in site/telemetry.js already forbids `<` in an id, and this page must
   * not DEPEND on that: the dashboard renders whatever the dataset holds, including rows a
   * hand-made probe put there. `raw` columns are the exception and are built here from a
   * clamped number, never from a wire value. */
  var hostile = Object.assign({}, ROWS, {
    starts: [{ wt: '<img src=x onerror=alert(1)>', sessions: 1, n: 1, steps: 3 }],
  });
  var esc = await render(hostile);
  ck('a hostile id is escaped, not rendered', esc.indexOf('<img src=x') === -1
    && esc.indexOf('&lt;img src=x') !== -1);

  console.log('\n' + BOLD + (nFail ? RED + 'FAIL' : GREEN + 'PASS') + RST
    + '  ' + nPass + ' passed, ' + nFail + ' failed'
    + (INJECT ? '  ' + BOLD + '(--inject: failures are the POINT)' + RST : ''));
  console.log(BOLD + '\nUSAGE PAGE: ' + (nFail ? RED + 'FAIL' : GREEN + 'OK') + RST
    + '  ' + nPass + 'passed ' + nFail + 'failed ' + (nPass + nFail) + 'checks\n');
  process.exit(nFail ? 1 : 0);
}()).catch(function (e) {
  console.error(RED + 'RUNNER ERROR' + RST, e && e.stack || e);
  process.exit(2);
});
