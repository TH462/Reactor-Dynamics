/* Reactor Dynamics — the FEATURE USAGE page of the ops dashboard. (#674)
 *
 *   GET /dashboard?view=usage
 *
 * *(OWNER, 2026-09-09: "I need to update my telemetry site for tracking usage of the
 * walk-throughs. I'd like to be able to figure out if people get stuck on one or how far
 * they go and get bored. Can you create a page to track usage of these features and move
 * some of the feature tracking from the statistics page on the tracking site to this new
 * feature tracking page.")*
 *
 * Everything here reads ONE source, Analytics Engine over the SQL API — no Web Analytics,
 * no GraphQL. That is the whole difference from `analytics.js`, which mixes two APIs with
 * OPPOSITE sampling conventions; this page has one convention and it is the awkward one:
 *
 *   ⚠ `count()` IS RAW STORED ROWS, AN UNDERCOUNT. The true figure is
 *     `sum(_sample_interval)`. Every headline below uses it. `count(DISTINCT blob4)` is
 *     used for SESSION counts and there is no weighting that repairs it — a session whose
 *     every row was sampled away is simply gone — so every session figure on this page is
 *     a FLOOR and is labelled one.
 *
 * ------------------------------------------------------------------ what this can answer
 * The walkthroughs emitted NOTHING until this change: `start_checklist` went to the
 * service and no event followed it, so a leg nobody finishes and a leg everybody finishes
 * were the same page. Four events now report a run — see `site/telemetry.js` — and the
 * five walkthrough sections below are the questions the owner asked, in order:
 *
 *   how far do they go   -> "Drop-off by step", sessions completing each step
 *   where do they stick  -> "Time on step" (p90 over median) and the `overtaken` /
 *                           `caught_up` counts in "How steps checked off"
 *   what did they get wrong -> "Rewinds by step"
 *
 * ------------------------------------------------ ⚠ WHAT SURVIVES, AND WHAT DOES NOT
 * Analytics Engine retention is a FIXED THREE MONTHS. The daily rollup (rollup.js) is the
 * only thing that outlives it, and `usage_daily` keys on
 * [day, channel, release, event, key_str, plant] with NO NUMERIC COLUMNS. So:
 *
 *   SURVIVES  the step funnel and the completion rate — they are encoded in the KEY
 *             (`pwr_tmi2_incident:07:overtaken`, `pwr_tmi2_incident:complete`), which is
 *             exactly why the key is composite (worker/src/index.js, KEY_OF).
 *   DOES NOT  time-on-step. It is `double1`, and a double is not in the rollup key. Three
 *             months and it is gone.
 *
 * The page SAYS so under the time section rather than letting a reader assume the
 * durations go back for ever — the same honesty the coarse-tier warnings carry on the
 * analytics page.
 *
 * ------------------------------------------------------------- Analytics Engine SQL traps
 * All four cost a 422 at least once (RD_Ops/runbook.md):
 *
 *   - No subqueries.
 *   - COLUMNS ARE TYPED PER RESULT SET. Naming `double9` in a query no row matches is
 *     "unable to find type of column", not an empty table — which is why every walkthrough
 *     section is behind ONE cheap probe that names no doubles. Before the first release
 *     that emits these events, that probe returns 0 and the sections say so instead of
 *     rendering five identical error blocks.
 *   - `ORDER BY` resolves against the SELECT PROJECTION, so it may only name an alias that
 *     is actually selected. Most ordering here is done in JavaScript for that reason.
 *   - `max()` REJECTS A STRING COLUMN outright, and there is no `any()`/`argMax()`.
 *
 * ------------------------------------------------------------------- the RELEASE filter
 * `GET /dashboard?view=usage&version=<release>|<channel>` (#800, owner: "Feature usage
 * needs to correlate to version... i should be able to filter by version with a drop
 * down. default should be the latest."). `blob3` is the release string on every event and
 * `blob2` is its channel (public/preview/dev) — both have existed since the first row, so
 * neither needs a `COLUMNS_SINCE` guard the way double5-8 do.
 *
 * `max()` REJECTS A STRING, so "latest" cannot come from `max(blob3)` even if version
 * strings sorted correctly — and they do not: "Alpha 1.7.10" sorts BELOW "Alpha 1.7.9"
 * lexically, and this project was at 1.7.6 and climbing the day this was written, so a
 * lexical pick breaks within months. "Latest" is instead `max(timestamp)` per
 * (release, channel), computed once in `releaseOptions()` and reused for the default,
 * the dropdown order and the "how many sessions" label — see the comment there.
 *
 * A release can appear under more than one CHANNEL (a preview/RC build and its eventual
 * public release both write real rows). Rather than guess which one the owner wants,
 * (release, channel) is the selectable UNIT — each dropdown option names both, so no
 * label is ambiguous about what it includes, and "All versions" is the only option that
 * spans channels (still under the existing `blob2 <> 'dev'` exclusion below).
 */

import { esc, html, PAGE_HEAD, nav, table, dur, section, pctBar } from './render.js';
import { sql, DATASET, COLUMNS_SINCE } from './cfapi.js';

const num = (v) => (v == null || v === '' ? 0 : Number(v));

/* THE COMPOSITE KEY, taken apart. `blob5` is `id`, `id:step:by` or `id:reason` depending
 * on the event (KEY_OF in index.js). Parsed HERE and never in SQL: this dialect has no
 * string splitting worth depending on, and a query that guessed wrong would return
 * plausible rows rather than an error. */
function keyParts(k) {
  const p = String(k == null ? '' : k).split(':');
  return { id: p[0] || '', b: p[1] == null ? '' : p[1], c: p[2] == null ? '' : p[2] };
}

/* Median and p90 over a plain array, computed in JAVASCRIPT rather than in the query.
 *
 * Two reasons, and the second is the one that decides it. Analytics Engine SQL is a
 * documented subset and no quantile function is among the calls this project has ever
 * proven against it, so a `quantile(0.9)` would be a 422 discovered in production. And at
 * this site's volume the raw rows are a few hundred, which is nothing to pull.
 *
 * ⚠ UNWEIGHTED, over rows AS STORED. If sampling ever kicks in these are quantiles of the
 * sample, not of the population — which is honest for a shape question ("does the p90
 * tower over the median") and would be wrong for a total. Nothing here totals them.
 */
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}

/* THE DURATION HISTOGRAM'S BUCKETS (#797 item 6). Chosen to bracket the landmarks
 * MEASURED on the live store rather than picked for round numbers: p50 ~3.0min falls
 * inside 2-5m, p75 ~21.8min inside 10-30m, p95 ~125.3min (2.09h) inside 1-3h, and the
 * observed max (336min, 5.6h) inside 3h+ — so every one of those four figures lands in
 * a DIFFERENT bucket, which is what "reveals the shape" means operationally: a coarser
 * grid would flatten two of them into one bar. Finer near the middle of the
 * distribution (five buckets under 30 minutes, where most sessions are) and coarser in
 * the tail (three buckets from 30 minutes to 3h+, where few are and precision buys
 * nothing).
 *
 * ZERO IS NOT A BUCKET HERE — it is handled separately by the caller. A session whose
 * every event landed in one write batch reads back a span of EXACTLY 0, which is a
 * floor artefact ("all events arrived in the same batch"), not evidence the visit was
 * instantaneous, and folding it into "<1m" would say something the data does not know.
 */
const DURATION_BUCKETS = [
  { max: 60, label: '<1m' },
  { max: 120, label: '1-2m' },
  { max: 300, label: '2-5m' },
  { max: 600, label: '5-10m' },
  { max: 1800, label: '10-30m' },
  { max: 3600, label: '30-60m' },
  { max: 10800, label: '1-3h' },
  { max: Infinity, label: '3h+' },
];

// -1 for the zero-span sentinel (the caller's own bucket, drawn first and separately —
// see DURATION_BUCKETS' header), otherwise the index of the first bucket whose `max`
// the value is strictly under.
function bucketDurationIdx(secs) {
  if (secs <= 0) return -1;
  for (let i = 0; i < DURATION_BUCKETS.length; i++) if (secs < DURATION_BUCKETS[i].max) return i;
  return DURATION_BUCKETS.length - 1;
}

/* A GENERIC "n of total, as a bar" table row, shared by the duration histogram and the
 * first-60-seconds touch-count histogram below — one row shape, one place that decides
 * how a count becomes a percentage, so the two histograms cannot silently disagree on
 * what they normalise against. `total` is the population (ALL sessions, per HR9's
 * "denominator is the starters" convention this page already uses for the step funnel),
 * never the sum of the rows themselves — a bucket table's rows may undercount `total`
 * (a session with no rows in ANY bucket, e.g. zero touches) and must not be hidden by a
 * denominator that only ever saw the rows that showed up. */
function bucketRow(label, n, total) {
  const pct = total ? (n / total) * 100 : 0;
  return { bucket: label, sessions: n, bar: pctBar(pct, n + ' / ' + total) };
}

/* Quotes a value for interpolation into an AE SQL string literal. `cfapi.js` has no
 * parameter binding (its own header says so), so anything built from a URL parameter has
 * to be escaped here rather than trusted — even though a release is normally "Alpha
 * 1.7.6" and a channel is public/preview/dev, neither of which contains a quote today. */
function sqlStr(s) { return "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'"; }

/* Below this many sessions, one session moves any percentage on this page by MORE than
 * the ten points its bars are drawn to (`pctBar` rounds to one decimal, but a reader
 * scans bars, not decimals) — 1/9 is already an 11-point swing. The newest release will
 * routinely sit under this for days after a push, which is exactly the case #800 exists
 * to surface, not to hide. */
const SMALL_SAMPLE = 10;

/* The (release, channel) combinations present in the window, newest FIRST BY LAST EVENT
 * — never by sorting the version string. "Alpha 1.7.10" sorts below "Alpha 1.7.9"
 * lexically (character 8 is '1' vs '9'), so a lexical pick silently regresses the moment
 * a two-digit patch number ships, which for this project is soon. `max(timestamp)` per
 * combination is the only thing that reads "latest" the same way a human would.
 *
 * `blob2 <> 'dev'` matches the exclusion every other query in this file already carries.
 * `count(DISTINCT blob4)` is the same FLOOR every session figure on this page already is
 * — see the file header — so the number shown per option is labelled the same way. */
async function releaseOptions(apiToken, since) {
  const rows = await sql(apiToken, `SELECT blob3 AS release, blob2 AS channel,
          max(timestamp) AS last_seen, count(DISTINCT blob4) AS sessions
     FROM ${DATASET} WHERE blob2 <> 'dev' AND ${since}
     GROUP BY release, channel`);
  const lastMs = (s) => {
    const t = Date.parse(String(s || '').trim().replace(' ', 'T') + 'Z');
    return isFinite(t) ? t : 0;
  };
  return rows.map((r) => ({
    release: String(r.release || '(none)'),
    channel: String(r.channel || '(none)'),
    sessions: num(r.sessions),
    lastMs: lastMs(r.last_seen),
  })).sort((a, b) => b.lastMs - a.lastMs);
}

const optKey = (r) => r.release + '|' + r.channel;

// ---------------------------------------------------------------- the page
export async function usagePage(env, url) {
  const apiToken = env.CF_ANALYTICS_TOKEN;
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days')) || 30));
  const since = `timestamp > NOW() - INTERVAL '${days}' DAY`;

  const head = '<!doctype html><html><head>' + PAGE_HEAD
    + '<title>Feature usage — Reactor Dynamics</title></head><body>' + nav('usage');

  if (!apiToken) {
    return html(head
      + '<h1>Feature usage</h1>'
      + '<p class="warn">No <span class="mono">CF_ANALYTICS_TOKEN</span> secret is set on this Worker, '
      + 'so in-sim usage cannot be read.</p>'
      + '<pre>cd worker\nwrangler secret put CF_ANALYTICS_TOKEN   # Account Analytics / Read\nwrangler deploy</pre>'
      + '</body></html>');
  }

  /* -------------------------------------------------------------- the version filter
   * See the file header. `releaseOptions` is queried unconditionally — it names no
   * doubles, so it is safe on a dataset with no walkthrough rows at all — and its
   * result decides everything below: the dropdown, the default selection, and the
   * WHERE-clause fragment every other query in this file now carries. */
  let releases = [], releasesErr = '';
  try { releases = await releaseOptions(apiToken, since); }
  catch (e) { releasesErr = e.message; }

  const rawVer = url.searchParams.get('version');
  let verParam = 'all';
  if (rawVer !== 'all') {
    const match = releases.find((r) => optKey(r) === rawVer);
    // No match — either this is the first load (no `version` param at all) or a stale/
    // hostile one naming a combination not in the current window. Either way the right
    // fallback is the SAME one requirement 2 asks for: the latest by last event, never
    // "all" — an unrecognised param must not silently widen the scope.
    verParam = match ? optKey(match) : (releases[0] ? optKey(releases[0]) : 'all');
  }
  const selected = verParam === 'all' ? null : releases.find((r) => optKey(r) === verParam);
  // Only ever built from a value that came out of `releases` itself (never straight off
  // the URL), so `sqlStr` here is a second layer of defence, not the only one.
  const versionWhere = selected
    ? ` AND blob3 = ${sqlStr(selected.release)} AND blob2 = ${sqlStr(selected.channel)}`
    : '';
  const sampleSessions = selected ? selected.sessions
    : releases.reduce((a, r) => a + r.sessions, 0);
  const sampleLabel = selected ? (selected.release + ' — ' + selected.channel) : 'All versions';

  const windowLink = (n) => {
    const href = '?view=usage&days=' + n + '&version=' + encodeURIComponent(verParam);
    return n === days ? '<b>' + n + 'd</b>' : '<a href="' + href + '">' + n + 'd</a>';
  };

  const versionForm = releases.length ? ('<form method="GET" style="margin:8px 0">'
    + '<input type="hidden" name="view" value="usage">'
    /* THE DAYS PARAMETER, CARRIED AS A HIDDEN FIELD — the trap named in the brief: a
     * `<button formaction="?...">` inside a GET form has its action's query string
     * DISCARDED by the browser, which then submits only the form's own fields (measured
     * in headless Edge against this exact dashboard, `render.js`'s `a.pbtn` comment).
     * The fix here is the same one render.js landed on for the preset links: never rely
     * on the browser preserving a query string it does not own. A hidden field IS one of
     * the form's own fields, so it survives. */
    + '<input type="hidden" name="days" value="' + days + '">'
    + '<select name="version">'
    + '<option value="all"' + (verParam === 'all' ? ' selected' : '') + '>All versions ('
    + releases.reduce((a, r) => a + r.sessions, 0) + ' sessions)</option>'
    + releases.map((r) => '<option value="' + esc(optKey(r)) + '"'
        + (optKey(r) === verParam ? ' selected' : '') + '>' + esc(r.release) + ' — '
        + esc(r.channel) + ' (' + r.sessions + ')</option>').join('')
    + '</select> <button type="submit">Go</button>'
    + '</form>') : '';

  const sampleWarn = sampleSessions < SMALL_SAMPLE
    ? ('<p class="warn">⚠ Only ' + sampleSessions + ' session'
      + (sampleSessions === 1 ? '' : 's') + ' in this window for <b>' + esc(sampleLabel)
      + '</b> — below ' + SMALL_SAMPLE + ', one session moves any percentage on this page '
      + 'by more than the bars below are drawn to. Read this as a few examples, not a '
      + 'trend.</p>')
    : '';

  /* THE PROBE. Names no doubles and no blob8, so it is safe on an empty dataset, and it is
   * what stops the five walkthrough sections from each rendering the same 422 in the
   * window between deploying this Worker and shipping the client that feeds it. Scoped
   * by the version filter too, so it answers "no walkthrough events for THIS release",
   * not just "none anywhere" — the per-query error catching inside walkthroughSections
   * already covers the case where an OLDER release predates an event this page reads,
   * so this probe only needs to save the common case, not prove every one. */
  let haveWt = 0, probeErr = '';
  try {
    const r = await sql(apiToken, `SELECT sum(_sample_interval) AS n FROM ${DATASET}
        WHERE blob1 LIKE 'walkthrough_%' AND blob2 <> 'dev' AND ${since}${versionWhere}`);
    haveWt = num(r[0] && r[0].n);
  } catch (e) { probeErr = e.message; }

  const wt = haveWt > 0 ? await walkthroughSections(apiToken, since, versionWhere) : [];
  // Unconditional, unlike the walkthrough sections above: a first command or panel is
  // ordinary command/panel_open traffic, not a walkthrough event, so it needs no probe
  // gated on `haveWt` — see firstMinuteSection's own header for why it names no
  // walkthrough-only column and is therefore safe on a dataset with none of those rows.
  const firstMinute = await firstMinuteSection(apiToken, since, versionWhere);
  const migrated = await simSections(apiToken, since, versionWhere);

  const noData = '<p class="muted">No walkthrough events in this window'
    + (selected ? ' for <b>' + esc(sampleLabel) + '</b>' : '') + '. These four events '
    + '(<span class="mono">walkthrough_start</span>, <span class="mono">_step</span>, '
    + '<span class="mono">_rewind</span>, <span class="mono">_end</span>) ship with the '
    + 'client release that follows this Worker deploy, so an empty window here before that '
    + 'release is the expected reading and not a fault.'
    + (probeErr ? ' The probe itself errored: <span class="mono">' + esc(probeErr) + '</span>' : '')
    + '</p>';

  return html(head
    + '<h1>Feature usage <span class="muted">— last ' + days + ' days</span></h1>'
    + '<p class="muted">Window: ' + windowLink(7) + ' · ' + windowLink(30) + ' · ' + windowLink(90)
    + ' · in-sim usage only. Traffic and page performance are on '
    + '<a href="?view=analytics">Analytics</a>.</p>'
    + versionForm
    + (releasesErr ? '<p class="err">version list query failed: ' + esc(releasesErr) + '</p>' : '')
    /* THE SAMPLE SIZE, STATED PROMINENTLY (#800) — every table and figure below is scoped
     * to exactly this selection, and this line is the whole reason the filter exists: a
     * fresh release routinely has a handful of sessions, and a funnel drawn from 2 reads
     * identically to one drawn from 33 unless something on the page says otherwise. */
    + '<p class="mono"><b>' + esc(sampleLabel) + ' · ' + sampleSessions + ' session'
    + (sampleSessions === 1 ? '' : 's') + '</b></p>'
    + sampleWarn
    /* The source line every view now carries instead of an `Exact` column (#764). This
     * page is not Web Analytics and has no coarse tier — it is the sampled Analytics
     * Engine dataset, whose grain is the IN-SIM SESSION, so it says so rather than
     * borrowing the traffic page's wording. */
    + '<p class="muted">Source: <b>Cloudflare Analytics Engine</b> — sampled '
    + '(session counts are a floor), 3-month retention.</p>'
    + '<h2>Walkthroughs <span class="muted">— how far people get, and where they stall</span></h2>'
    + '<p class="muted">Session counts are a <b>FLOOR</b>: this dataset is sampled, whole '
    + 'rows are dropped, and no weighting recovers a session that vanished entirely. '
    + 'Event counts use <span class="mono">sum(_sample_interval)</span>, which does correct '
    + 'for sampling. Durations are <b>wall time</b>, not plant time — a step can burn a '
    + 'minute of someone’s life and an hour of the clock at 600×.</p>'
    + (haveWt > 0 ? wt.join('') : noData)
    + '<h2>The first 60 seconds <span class="muted">— what a new visitor does before they decide to stay</span></h2>'
    + firstMinute.join('')
    + '<h2>In the simulator <span class="muted">— everything else the sim reports</span></h2>'
    + '<p class="muted">Moved here from the Analytics page, unchanged.</p>'
    + migrated.join('')
    + '</body></html>');
}

// ============================================================ the walkthrough sections
async function walkthroughSections(apiToken, since, versionWhere) {
  versionWhere = versionWhere || '';
  /* Four queries, run once and shared. Each section below is a rendering of these rather
   * than its own round trip — the same rows answer several questions, and a section that
   * re-asked would be a second chance to ask differently. */
  /* A FAILED QUERY IS REPORTED, NOT SWALLOWED. `Promise.all` rejects on the first
   * failure, which would take the whole page down for one bad query — but returning []
   * instead renders an EMPTY SECTION, and an empty section is indistinguishable from
   * "nothing happened", which is the exact failure this file's header warns about and
   * #485 shipped. So each query's error is CAUGHT AND KEPT, and named on the page. */
  const failed = [];
  const errRows = (what) => (e) => {
    failed.push(what + ': ' + String((e && e.message) || e).slice(0, 200));
    return [];
  };
  /* `blob2 <> 'dev'` on every query below — see the identical guard and its own comment
   * in simSections's "Controls people try but cannot use" further down. It never reaches
   * a matching-column 422 (blob2/channel is populated on every row, not a column added
   * later), so it needs no COLUMNS_SINCE-style probe. */
  const [starts, ends, mix, funnel, rewinds, dwell] = await Promise.all([
    sql(apiToken, `SELECT blob8 AS wt, count(DISTINCT blob4) AS sessions,
            sum(_sample_interval) AS n, max(double10) AS steps
       FROM ${DATASET} WHERE blob1 = 'walkthrough_start' AND blob2 <> 'dev' AND ${since}${versionWhere}
       GROUP BY wt`).catch(errRows('starts')),
    sql(apiToken, `SELECT blob5 AS k, count(DISTINCT blob4) AS sessions, sum(_sample_interval) AS n
       FROM ${DATASET} WHERE blob1 = 'walkthrough_end' AND blob2 <> 'dev' AND ${since}${versionWhere}
       GROUP BY k`).catch(errRows('ends')),
    // The by-mix comes off the COMPOSITE key, which is the copy that survives the rollup.
    sql(apiToken, `SELECT blob5 AS k, sum(_sample_interval) AS n
       FROM ${DATASET} WHERE blob1 = 'walkthrough_step' AND blob2 <> 'dev' AND ${since}${versionWhere}
       GROUP BY k`).catch(errRows('step mix')),
    /* …and the funnel comes off the COLUMNS, because `count(DISTINCT session)` per
     * (walkthrough, step) has to group on the step alone. Summing the by-mix rows instead
     * would double-count any session that checked one step off twice under two different
     * verdicts — which a rewind-and-redo produces, and which is precisely the case this
     * page exists to find. */
    sql(apiToken, `SELECT blob8 AS wt, double9 AS step, count(DISTINCT blob4) AS sessions,
            sum(_sample_interval) AS n
       FROM ${DATASET} WHERE blob1 = 'walkthrough_step' AND blob2 <> 'dev' AND ${since}${versionWhere}
       GROUP BY wt, step`).catch(errRows('funnel')),
    sql(apiToken, `SELECT blob8 AS wt, double9 AS step, count(DISTINCT blob4) AS sessions,
            sum(_sample_interval) AS n
       FROM ${DATASET} WHERE blob1 = 'walkthrough_rewind' AND blob2 <> 'dev' AND ${since}${versionWhere}
       GROUP BY wt, step`).catch(errRows('rewinds')),
    // Raw durations. Quantiles are computed here, not in SQL — see `quantile`.
    sql(apiToken, `SELECT blob8 AS wt, double9 AS step, double1 AS seconds
       FROM ${DATASET} WHERE blob1 = 'walkthrough_step' AND blob2 <> 'dev' AND ${since}${versionWhere}
       LIMIT 20000`).catch(errRows('time on step')),
  ]);

  // starters[id] -> {sessions, n, steps}
  const starters = new Map();
  starts.forEach((r) => starters.set(String(r.wt || ''), {
    sessions: num(r.sessions), n: num(r.n), steps: num(r.steps),
  }));
  const startedOf = (id) => (starters.get(id) || { sessions: 0 }).sessions;

  // ---- 1. started / finished / abandoned -----------------------------------
  const byId = new Map();
  const bucket = (id) => {
    if (!byId.has(id)) byId.set(id, { complete: 0, stopped: 0, switched: 0, left: 0 });
    return byId.get(id);
  };
  ends.forEach((r) => {
    const k = keyParts(r.k);
    const b = bucket(k.id);
    if (Object.prototype.hasOwnProperty.call(b, k.b)) b[k.b] += num(r.sessions);
  });

  const overview = [...new Set([...starters.keys(), ...byId.keys()])].sort().map((id) => {
    const s = starters.get(id) || { sessions: 0, steps: 0 };
    const b = bucket(id);
    const rate = s.sessions ? Math.round((b.complete / s.sessions) * 100) : null;
    return {
      wt: id || '(none)',
      steps: s.steps > 0 ? s.steps : '—',
      started: s.sessions,
      complete: b.complete,
      stopped: b.stopped,
      switched: b.switched,
      left: b.left,
      rate: rate == null ? '—' : pctBar(rate, rate + '%'),
      _sort: s.sessions,
    };
  }).sort((a, b) => b._sort - a._sort);

  // ---- 2. drop-off by step -------------------------------------------------
  const funnelRows = [];
  const perWt = new Map();
  funnel.forEach((r) => {
    const id = String(r.wt || '');
    if (!perWt.has(id)) perWt.set(id, []);
    perWt.get(id).push({ step: num(r.step), sessions: num(r.sessions), n: num(r.n) });
  });
  [...perWt.keys()].sort().forEach((id) => {
    const started = startedOf(id);
    perWt.get(id).sort((a, b) => a.step - b.step).forEach((r) => {
      /* THE DENOMINATOR IS THE STARTERS, not the first step — a walkthrough people open
       * and abandon before checking anything off is the sharpest possible finding, and
       * normalising on step 0 would hide it by definition. */
      const pct = started ? (r.sessions / started) * 100 : 0;
      funnelRows.push({
        wt: id, step: r.step,
        bar: started ? pctBar(pct, r.sessions + ' / ' + started) : pctBar(0, String(r.sessions)),
        checkoffs: r.n,
      });
    });
  });

  // ---- 3. time on step -----------------------------------------------------
  const dwellBy = new Map();
  dwell.forEach((r) => {
    /* '|' SEPARATES the two parts of the map key, and it is chosen rather than
     * defaulted: a walkthrough id comes off the wire through site/telemetry.js's enum
     * guard, whose charset is [A-Za-z0-9_.:-], so '|' cannot appear inside one and the
     * split below cannot be fooled by an id. (A space held this job for one commit and
     * was written as a literal NUL by accident — invisible in the source, and it made the
     * whole file read as binary to grep.) */
    const k = String(r.wt || '') + '|' + num(r.step);
    if (!dwellBy.has(k)) dwellBy.set(k, []);
    dwellBy.get(k).push(num(r.seconds));
  });
  const dwellRows = [...dwellBy.keys()].sort().map((k) => {
    const [id, step] = k.split('|');
    const v = dwellBy.get(k).sort((a, b) => a - b);
    const med = quantile(v, 0.5), p90 = quantile(v, 0.9);
    return {
      wt: id, step: Number(step),
      median: dur(med), p90: dur(p90),
      /* THE RATIO IS THE SIGNAL, not either figure on its own. A step whose p90 towers
       * over its median is a step MOST people walk straight through and SOME cannot
       * finish — which is a different defect from a step that is slow for everyone, and
       * the two are indistinguishable from a mean. */
      spread: med > 0 ? (p90 / med).toFixed(1) + '×' : (p90 > 0 ? 'p90 only' : '—'),
      samples: v.length,
      _s: id + ':' + String(Number(step)).padStart(3, '0'),
    };
  }).sort((a, b) => (a._s < b._s ? -1 : 1));

  // ---- 4. how steps checked off -------------------------------------------
  const mixRows = mix.map((r) => {
    const k = keyParts(r.k);
    return { wt: k.id, step: Number(k.b), by: k.c || '—', n: num(r.n),
             _s: k.id + ':' + k.b + ':' + k.c };
  }).sort((a, b) => (a._s < b._s ? -1 : 1));
  const stuck = mixRows.filter((r) => r.by === 'overtaken' || r.by === 'caught_up')
    .reduce((a, r) => a + r.n, 0);

  // ---- 5. rewinds ----------------------------------------------------------
  const rewindRows = rewinds.map((r) => ({
    wt: String(r.wt || ''), step: num(r.step),
    sessions: num(r.sessions), rewinds: num(r.n),
    _s: String(r.wt || '') + ':' + String(num(r.step)).padStart(3, '0'),
  })).sort((a, b) => b.rewinds - a.rewinds);

  /* Named ONCE, above the sections, rather than five times inside them: the probe has
   * already established that there IS data, so a failure here is a query fault and the
   * reader needs to know which sections below are therefore short. */
  const errNote = failed.length
    ? '<p class="err">' + failed.length + ' of the 6 walkthrough queries failed, so the '
      + 'sections below are incomplete — this is NOT "no activity": '
      + failed.map((f) => '<span class="mono">' + esc(f) + '</span>').join(' · ') + '</p>'
    : '';

  return [
    errNote,
    await section('Walkthroughs started, finished, abandoned', async () =>
      table(overview, [
        { key: 'wt', label: 'Walkthrough' }, { key: 'steps', label: 'Steps', num: true },
        { key: 'started', label: 'Started', num: true },
        { key: 'complete', label: 'Finished', num: true },
        { key: 'stopped', label: 'Stopped', num: true },
        { key: 'switched', label: 'Switched', num: true },
        { key: 'left', label: 'Left', num: true },
        { key: 'rate', label: 'Completion', raw: true }])
      + '<p class="muted"><b>Stopped</b> is the player closing the walkthrough, '
      + '<b>switched</b> is them leaving it for another one, and <b>left</b> is the tab '
      + 'going away mid-leg. Started and the three endings are counted in SESSIONS, so a '
      + 'session that opened one walkthrough twice counts once — and the four endings need '
      + 'not sum to the starts, because a run still open when the window closes has no '
      + 'ending row yet.</p>'),

    await section('Drop-off by step — how far do they go', async () =>
      table(funnelRows, [
        { key: 'wt', label: 'Walkthrough' }, { key: 'step', label: 'Step', num: true },
        { key: 'bar', label: 'Sessions completing it, of those who started', raw: true },
        { key: 'checkoffs', label: 'Check-offs', num: true }])
      + '<p class="muted">A row is a step <b>checked off</b>, so "step 6" means they '
      + 'finished step 6 and moved to step 7. The bar is against everyone who STARTED that '
      + 'walkthrough, not against step 0 — a walkthrough people open and abandon before '
      + 'checking anything off would be invisible if it were. <b>Check-offs</b> exceeding '
      + 'sessions is a step done more than once, which is a rewind-and-redo.</p>'),

    await section('Time on step — where do they get stuck', async () =>
      table(dwellRows, [
        { key: 'wt', label: 'Walkthrough' }, { key: 'step', label: 'Step', num: true },
        { key: 'median', label: 'Median', num: true }, { key: 'p90', label: 'p90', num: true },
        { key: 'spread', label: 'p90 ÷ median', num: true },
        { key: 'samples', label: 'Samples', num: true }])
      + '<p class="muted">Wall time on that one step. <b>Read the spread, not the median</b>: '
      + 'a step whose p90 towers over its median is one most people walk through and some '
      + 'cannot finish, which is a different defect from a step that is slow for everyone. '
      + 'A median of 0s is a step the plant already satisfied on arrival.</p>'
      + '<p class="warn">⚠ These durations are <b>Analytics Engine only</b> and retention '
      + 'there is a fixed three months. They are numeric columns, and the daily rollup that '
      + 'preserves the rest of this page keeps only the key string — so unlike the funnel '
      + 'and the completion rate above, <b>this table does not go back further than three '
      + 'months and never will</b>.</p>'),

    await section('How steps checked off', async () =>
      '<p class="muted">The instructor’s own verdict on each check-off. '
      + '<b><span class="mono">overtaken</span></b> means the plant moved past a step the '
      + 'player could no longer satisfy and <b><span class="mono">caught_up</span></b> means '
      + 'the step was already true when they reached it — <b>both are direct stuck-signals</b> '
      + 'and neither is visible in a count of check-offs. '
      + (stuck > 0
          ? '<b class="warn">' + stuck + ' of the check-offs in this window are one of those two.</b>'
          : 'None in this window.')
      + '</p>'
      + table(mixRows, [
        { key: 'wt', label: 'Walkthrough' }, { key: 'step', label: 'Step', num: true },
        { key: 'by', label: 'Checked off by' }, { key: 'n', label: 'Check-offs', num: true }])),

    await section('Rewinds by step — what did they get wrong', async () =>
      table(rewindRows, [
        { key: 'wt', label: 'Walkthrough' }, { key: 'step', label: 'Step', num: true },
        { key: 'rewinds', label: 'Rewinds', num: true },
        { key: 'sessions', label: 'Sessions', num: true }])
      + '<p class="muted">The step the player was ON when they pressed the walkthrough’s '
      + 'own Rewind — a step people back into is a step they got wrong. The checkpoint '
      + 'picker is a decision about the plant and is not counted here.</p>'),
  ];
}

// ============================================================ the first 60 seconds
/* "THE FIRST 60 SECONDS" (#797 item 7). Half of all sessions are short (item 6's
 * histogram above), so the opening minute is the closest thing on this page to an
 * onboarding diagnostic: what a visitor touches first, and how far they get before they
 * decide whether to stay.
 *
 * THE CLOCK: double5 (t_page), not double6 (t_session). The two agree inside the first
 * minute unless the visitor reloaded within it — rare, and not what this section is
 * trying to catch. The deciding fact is HISTORY, not correctness: double5/t_page has
 * been on the wire since COLUMNS_SINCE (2026-08-11); double6/t_session — the
 * technically better clock, because it survives a reload — has accrued only about a
 * day of rows as of this writing (2026-09-21; the client-side path that populates it
 * reliably reached production long after the column itself was added, per index.js's
 * column map). Built on t_session today, this section would report on one day of
 * traffic for months. `historyNote` below says so on the page rather than leaving a
 * reader to assume otherwise.
 *
 * Guarded exactly as every other double5/6/7 query on this page already is:
 * `timestamp >= COLUMNS_SINCE` (a pre-column row reads back 0, not absent — cfapi.js's
 * header) and `double5 >= 0` (the -1 "not reported" sentinel). Also restricted to
 * `double5 <= 60`: nothing past the first minute answers "what happens in the first 60
 * seconds", and narrowing in SQL keeps row volume down without a LIMIT that could
 * silently truncate a busy window the way the time-on-step query's LIMIT 20000 could.
 *
 * SUB-SECOND ORDERING IS NOT AVAILABLE — double5 is stored to the nearest second, so
 * two events in the same second are unordered here, and "first" among a tie is
 * whichever row the result happens to return first. Nothing below depends on which. */
async function firstMinuteSection(apiToken, since, versionWhere) {
  versionWhere = versionWhere || '';
  const failed = [];
  const errRows = (what) => (e) => {
    failed.push(what + ': ' + String((e && e.message) || e).slice(0, 200));
    return [];
  };

  const [totalRows, cmdRows, panelRows] = await Promise.all([
    sql(apiToken, `SELECT count(DISTINCT blob4) AS sessions
        FROM ${DATASET} WHERE blob2 <> 'dev' AND ${since}${versionWhere} AND timestamp >= ${COLUMNS_SINCE}`)
      .catch(errRows('total sessions')),
    sql(apiToken, `SELECT blob4 AS session, blob5 AS action, double5 AS t
        FROM ${DATASET} WHERE blob1 = 'command' AND blob2 <> 'dev' AND ${since}${versionWhere}
          AND timestamp >= ${COLUMNS_SINCE} AND double5 >= 0 AND double5 <= 60
        LIMIT 20000`)
      .catch(errRows('first-minute commands')),
    sql(apiToken, `SELECT blob4 AS session, blob5 AS panel, double5 AS t
        FROM ${DATASET} WHERE blob1 = 'panel_open' AND blob2 <> 'dev' AND ${since}${versionWhere}
          AND timestamp >= ${COLUMNS_SINCE} AND double5 >= 0 AND double5 <= 60
        LIMIT 20000`)
      .catch(errRows('first-minute panels')),
  ]);

  const totalSessions = num(totalRows[0] && totalRows[0].sessions);

  // The earliest row per session — "first wins, a same-second tie is whichever the
  // result returns first", exactly the limit the header above states plainly.
  function firstBySession(rows, labelKey) {
    const best = new Map();
    rows.forEach((r) => {
      const s = String(r.session || '');
      const t = num(r.t);
      const cur = best.get(s);
      if (!cur || t < cur.t) best.set(s, { t, label: String(r[labelKey] || '(none)') });
    });
    return best;
  }
  // Same {n of total, as a bar} shape as `bucketRow` above, but the label is the thing
  // itself (an action/panel name) rather than a span bucket, and kept as a separate
  // function so renaming one column never reshapes the other's.
  function namedRow(label, n, total) {
    const pct = total ? (n / total) * 100 : 0;
    return { name: label, sessions: n, bar: pctBar(pct, n + ' / ' + total) };
  }
  function rankRows(best, total) {
    const tally = new Map();
    best.forEach((v) => tally.set(v.label, (tally.get(v.label) || 0) + 1));
    return [...tally.keys()].sort((a, b) => tally.get(b) - tally.get(a))
      .map((label) => namedRow(label, tally.get(label), total));
  }

  const cmdRankRows = rankRows(firstBySession(cmdRows, 'action'), totalSessions);
  const panelRankRows = rankRows(firstBySession(panelRows, 'panel'), totalSessions);

  /* HOW FAR — touches (commands + panel opens) inside the first 60 seconds, per
   * session. A session that touched NOTHING is a real category and stays visible as
   * bucket 0: `totalSessions` (every session in the window, from the COLUMNS_SINCE-
   * guarded count above) is the denominator throughout, and `touched.size` is
   * SUBTRACTED from it for bucket 0 rather than the rest of the table assuming a
   * smaller population — same "denominator is everyone who started" convention the
   * step funnel above already uses. */
  const touched = new Map();
  const addTouch = (s) => touched.set(s, (touched.get(s) || 0) + 1);
  cmdRows.forEach((r) => addTouch(String(r.session || '')));
  panelRows.forEach((r) => addTouch(String(r.session || '')));
  const TOUCH_BUCKETS = [
    { min: 1, max: 1, label: '1' }, { min: 2, max: 3, label: '2-3' },
    { min: 4, max: 7, label: '4-7' }, { min: 8, max: Infinity, label: '8+' },
  ];
  const touchCounts = TOUCH_BUCKETS.map(() => 0);
  touched.forEach((n) => {
    const i = TOUCH_BUCKETS.findIndex((b) => n >= b.min && n <= b.max);
    if (i >= 0) touchCounts[i]++;
  });
  const zeroTouch = Math.max(0, totalSessions - touched.size);
  const farRows = [bucketRow('0 — touched nothing', zeroTouch, totalSessions)]
    .concat(TOUCH_BUCKETS.map((b, i) => bucketRow(b.label, touchCounts[i], totalSessions)));

  const errNote = failed.length
    ? '<p class="err">' + failed.length + ' of the 3 first-minute queries failed: '
      + failed.map((f) => '<span class="mono">' + esc(f) + '</span>').join(' · ') + '</p>'
    : '';

  const historyNote = '<p class="muted">Clock: <span class="mono">t_page</span> (seconds '
    + 'since page load), 1-second resolution, no sub-second ordering, sessions back to '
    + '2026-08-11. The reload-safe alternative (<span class="mono">t_session</span>) has '
    + 'only about a day of history behind it as of this writing and would show almost '
    + 'nothing over the windows above — this section moves to it once that changes.</p>';

  return [
    errNote,
    await section('First control touched — the first 60 seconds', async () => table(cmdRankRows,
      [{ key: 'name', label: 'Action' }, { key: 'sessions', label: 'Sessions', num: true },
       { key: 'bar', label: 'Share of all sessions in this window', raw: true }])
      + '<p class="muted">The first <span class="mono">command</span> event each session '
      + 'sent, inside its first 60 seconds — against everyone in this window, not only '
      + 'those who touched something.</p>' + historyNote),
    await section('First panel opened — the first 60 seconds', async () => table(panelRankRows,
      [{ key: 'name', label: 'Panel' }, { key: 'sessions', label: 'Sessions', num: true },
       { key: 'bar', label: 'Share of all sessions in this window', raw: true }])
      + '<p class="muted">The first panel each session opened, inside its first 60 '
      + 'seconds.</p>'),
    await section('How far in 60 seconds', async () => table(farRows,
      [{ key: 'bucket', label: 'Touches' }, { key: 'sessions', label: 'Sessions', num: true },
       { key: 'bar', label: 'Share of all sessions in this window', raw: true }])
      + '<p class="muted">Controls pressed plus panels opened, summed, inside the first '
      + '60 seconds of the session. <b>0 is a real category</b> — a session that never '
      + 'touched anything in its first minute, not a session this query missed.</p>'),
  ];
}

// =============================================== the sections moved from analytics.js
// Moved VERBATIM (#674, owner: "move some of the feature tracking from the statistics
// page ... to this new feature tracking page"). Their comments came with them, because
// each one records a trap that is still true.
async function simSections(apiToken, since, versionWhere) {
  versionWhere = versionWhere || '';
  return Promise.all([
    /* TIME PER SESSION. Reported as a MEDIAN first and a mean second, because the mean
     * here is close to meaningless: the live data contains a tab left open 11h 34m, and
     * one of those drags an average across a handful of real sessions into nonsense.
     *
     * Every figure is a FLOOR built from two independent lower bounds per session — the
     * span of write times, and the client's own clock at its last event. Neither can
     * overstate: the write span misses everything inside a single batch (measured: two
     * real sessions of 6 and 4 events span 00:00 while the player was there at least
     * 6 s), and the client clock restarts at 0 on a reload. The larger of the two is
     * the best available lower bound, and it measures a tab being OPEN, not play.
     */
    /* THE POPULATION IS ALREADY EVERY SESSION, NOT ONLY ENDED ONES (#797 item 6). This
     * query groups on blob4 over the WHOLE event stream — no `blob1 = 'session_end'`
     * filter — so a tab left open (which never writes an end row) still contributes its
     * write span. That matters because `tools/site_report.js`'s separate `usage_length`
     * query DOES filter to `session_end` only, and reporting THAT figure as "time per
     * session" is what produced the wrong p50 1.9min the owner had to be corrected on —
     * the biased-short population is a real, already-happened mistake, just not one that
     * lived on this page. Named here so the next person does not "fix" this query to
     * match that one. */
    section('Time per session', async () => {
      const spans = await sql(apiToken, `SELECT blob4 AS session,
              min(timestamp) AS first_seen, max(timestamp) AS last_seen
         FROM ${DATASET} WHERE blob2 <> 'dev' AND ${since}${versionWhere} GROUP BY session`);
      if (!spans.length) return '<p class="muted">(none)</p>';

      // The client clock is a separate query and only exists post-column; absent, the
      // write span stands alone. Naming double5 with no qualifying row is a 422.
      let lastBy = {};
      try {
        const probe = await sql(apiToken, `SELECT count() AS n FROM ${DATASET}
            WHERE ${since} AND timestamp >= ${COLUMNS_SINCE}${versionWhere}`);
        if (num(probe[0] && probe[0].n) > 0) {
          // double6 is t_session — seconds since the session id was MINTED, which
          // survives a reload. double5/t_page is seconds since PAGE LOAD and resets on
          // every reload, making it a weaker floor than the design intends (#same bug
          // as sessions.js's detail query, which already reads double6 correctly).
          (await sql(apiToken, `SELECT blob4 AS session, max(double6) AS t_last
              FROM ${DATASET} WHERE blob2 <> 'dev' AND ${since}
                AND timestamp >= ${COLUMNS_SINCE}${versionWhere} GROUP BY session`))
            .forEach((r) => { lastBy[r.session] = num(r.t_last); });
        }
      } catch (e) { lastBy = {}; }

      const secs = spans.map((r) => {
        const t = (s) => Date.parse(String(s || '').trim().replace(' ', 'T') + 'Z');
        const write = (t(r.last_seen) - t(r.first_seen)) / 1000;
        return Math.max(isFinite(write) && write > 0 ? write : 0, lastBy[r.session] || 0);
      }).sort((a, b) => a - b);

      /* PERCENTILES, RESTATED (#797 item 6 defect 1's fix): p50/p75/p95/max off the SAME
       * `quantile()` this page already uses for time-on-step, over the SAME `secs`
       * population the histogram below reads — one array, two views of it, so the two
       * can never silently disagree on what they are counting. Mean is dropped rather
       * than kept alongside: the comment this replaced already called it "close to
       * meaningless" (one long-open tab drags it), and the histogram below shows the
       * shape a single mean could never have. */
      const p50 = quantile(secs, 0.5), p75 = quantile(secs, 0.75), p95 = quantile(secs, 0.95);
      const tiles = '<div class="tiles">'
        + '<div class="tile"><div class="v">' + esc(dur(p50)) + '</div><div class="k">p50</div></div>'
        + '<div class="tile"><div class="v">' + esc(dur(p75)) + '</div><div class="k">p75</div></div>'
        + '<div class="tile"><div class="v">' + esc(dur(p95)) + '</div><div class="k">p95</div></div>'
        + '<div class="tile"><div class="v">' + esc(dur(secs[secs.length - 1])) + '</div><div class="k">Max</div></div>'
        + '<div class="tile"><div class="v">' + secs.length + '</div><div class="k">Sessions</div></div>'
        + '</div>';

      /* THE HISTOGRAM (#797 item 6 defect 2's fix). Percentiles alone hid a BIMODAL
       * shape — a cluster of sessions whose every event landed in one write batch
       * (span exactly 0) sitting beside a long tail out to hours — and p50 over that mix
       * reads as one typical session when there is no such thing. The zero-span row is
       * drawn FIRST and separately from DURATION_BUCKETS (see its header): it is a floor
       * artefact ("all events arrived in one batch"), not proof of an instant visit, and
       * folding it into "<1m" would claim precision the data does not have. */
      const zeroCount = secs.filter((s) => s <= 0).length;
      const bucketCounts = DURATION_BUCKETS.map(() => 0);
      secs.forEach((s) => { const i = bucketDurationIdx(s); if (i >= 0) bucketCounts[i]++; });
      const histRows = [bucketRow('0s (single batch)', zeroCount, secs.length)]
        .concat(DURATION_BUCKETS.map((b, i) => bucketRow(b.label, bucketCounts[i], secs.length)));

      return tiles
        + table(histRows, [
          { key: 'bucket', label: 'Span' }, { key: 'sessions', label: 'Sessions', num: true },
          { key: 'bar', label: 'Share of sessions in this window', raw: true }])
        + '<p class="muted">A FLOOR, and time a TAB WAS OPEN rather than time spent '
        + 'playing — the tail is usually a tab someone left. <b>A span of 0 means every '
        + 'event this session sent landed in the same write batch</b> — a gap in what the '
        + 'floor can measure, not evidence the visit was instantaneous. Trust the shape '
        + 'over any single figure: this distribution is not one typical session, it is '
        + 'two populations (a batch-floor cluster and a long tail) that a mean or a '
        + 'lone median would blend into a number neither describes.</p>';
    }),
    section('Sessions by starting condition', async () => table(
      (await sql(apiToken, `SELECT blob5 AS initial_state, count(DISTINCT blob4) AS sessions
         FROM ${DATASET} WHERE blob1 = 'session_start' AND blob2 <> 'dev' AND ${since}${versionWhere}
         GROUP BY initial_state ORDER BY sessions DESC`))
        .map((r) => ({ initial_state: r.initial_state || '(none)', sessions: num(r.sessions) })),
      [{ key: 'initial_state', label: 'Starting condition' },
       { key: 'sessions', label: 'Sessions', num: true }])),
    section('How far through a startup they get', async () => table(
      (await sql(apiToken, `SELECT double3 AS mode, count(DISTINCT blob4) AS sessions
         FROM ${DATASET} WHERE blob1 = 'plant_mode' AND blob2 <> 'dev' AND ${since}${versionWhere}
         GROUP BY mode ORDER BY mode DESC`))
        .map((r) => ({ mode: 'Mode ' + num(r.mode), sessions: num(r.sessions) })),
      [{ key: 'mode', label: 'Reached' }, { key: 'sessions', label: 'Sessions', num: true }])),
    section('Most-used controls', async () => table(
      (await sql(apiToken, `SELECT blob5 AS action, sum(_sample_interval) AS uses,
              count(DISTINCT blob4) AS sessions
         FROM ${DATASET} WHERE blob1 = 'command' AND blob2 <> 'dev' AND ${since}${versionWhere}
         GROUP BY action ORDER BY uses DESC LIMIT 20`))
        .map((r) => ({ action: r.action || '(none)', uses: num(r.uses), sessions: num(r.sessions) })),
      [{ key: 'action', label: 'Action' }, { key: 'uses', label: 'Uses', num: true },
       { key: 'sessions', label: 'Sessions', num: true }])),
    /* Controls the plant REFUSED. TWO guards, and neither is optional: `double7 >= 0`
     * drops clients that had no opinion, and `timestamp >= COLUMNS_SINCE` drops rows
     * written before the column existed — those read back as 0, not -1, so the sentinel
     * cannot see them and they would be counted as "allowed" (see cfapi.js). The rate
     * matters more than the count — 40 refusals out of 41 presses is a control nobody
     * can use, 40 out of 4000 is an interlock doing its job — so the denominator comes
     * from the same query rather than by eye, and both guards apply to it too.
     *
     * DENOMINATOR CAVEAT, stated on the page: this counts presses that went through the
     * command dispatcher. `play`, `reset`, `start_scenario` and the URL-bootstrap paths
     * call service.handleCommand directly and emit nothing, so they are in neither column. */
    section('Controls people try but cannot use', async () => {
      /* `blob2 <> 'dev'` excludes hand-made probes. The dev channel never reaches this
       * dataset from a real visitor — a local checkout has no endpoint and sends
       * nothing — so a dev row is always someone testing the pipeline by hand. It is
       * filtered HERE and not in the sections above because this view reports a RATE:
       * one synthetic row among hundreds cannot move a ranking, but it can and did read
       * as "rod_nudge, 100 % refused, a control nobody can use". */
      const rows = await sql(apiToken, `SELECT blob5 AS action, blob7 AS code,
              sum(_sample_interval) AS presses,
              sumIf(_sample_interval, double7 = 1) AS refused,
              count(DISTINCT blob4) AS sessions
         FROM ${DATASET} WHERE blob1 = 'command' AND double7 >= 0
              AND blob2 <> 'dev'
              AND timestamp >= ${COLUMNS_SINCE} AND ${since}${versionWhere}
         GROUP BY action, code ORDER BY refused DESC LIMIT 25`);
      const shown = rows.filter((r) => num(r.refused) > 0).map((r) => ({
        action: r.action || '(none)',
        code: r.code || '—',
        refused: num(r.refused),
        presses: num(r.presses),
        rate: num(r.presses) ? Math.round((num(r.refused) / num(r.presses)) * 100) + '%' : '—',
        sessions: num(r.sessions),
      }));
      return table(shown, [
        { key: 'action', label: 'Action' }, { key: 'code', label: 'Why' },
        { key: 'refused', label: 'Refused', num: true }, { key: 'presses', label: 'Presses', num: true },
        { key: 'rate', label: 'Rate', num: true }, { key: 'sessions', label: 'Sessions', num: true }])
        + '<p class="muted">Of presses that went through the command dispatcher — '
        + '<span class="mono">play</span>, <span class="mono">reset</span> and scenario '
        + 'starts bypass it and are in neither column. Rows from clients older than the '
        + 'column are excluded rather than counted as “not refused”.</p>';
    }),
    section('Panels opened', async () => table(
      (await sql(apiToken, `SELECT blob5 AS panel, sum(_sample_interval) AS opens,
              count(DISTINCT blob4) AS sessions
         FROM ${DATASET} WHERE blob1 = 'panel_open' AND blob2 <> 'dev' AND ${since}${versionWhere}
         GROUP BY panel ORDER BY opens DESC LIMIT 20`))
        .map((r) => ({ panel: r.panel || '(none)', opens: num(r.opens), sessions: num(r.sessions) })),
      [{ key: 'panel', label: 'Panel' }, { key: 'opens', label: 'Opens', num: true },
       { key: 'sessions', label: 'Sessions', num: true }])),
  ]);
}
