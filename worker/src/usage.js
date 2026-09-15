/* Reactor Dynamics — the FEATURE USAGE page of the ops dashboard. (#674)
 *
 *   GET /dashboard?token=T&view=usage
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

// ---------------------------------------------------------------- the page
export async function usagePage(env, url, token) {
  const apiToken = env.CF_ANALYTICS_TOKEN;
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days')) || 30));
  const since = `timestamp > NOW() - INTERVAL '${days}' DAY`;

  const head = '<!doctype html><html><head>' + PAGE_HEAD
    + '<title>Feature usage — Reactor Dynamics</title></head><body>' + nav(token, 'usage');

  if (!apiToken) {
    return html(head
      + '<h1>Feature usage</h1>'
      + '<p class="warn">No <span class="mono">CF_ANALYTICS_TOKEN</span> secret is set on this Worker, '
      + 'so in-sim usage cannot be read.</p>'
      + '<pre>cd worker\nwrangler secret put CF_ANALYTICS_TOKEN   # Account Analytics / Read\nwrangler deploy</pre>'
      + '</body></html>');
  }

  const windowLink = (n) => {
    const href = '?token=' + encodeURIComponent(token) + '&view=usage&days=' + n;
    return n === days ? '<b>' + n + 'd</b>' : '<a href="' + href + '">' + n + 'd</a>';
  };

  /* THE PROBE. Names no doubles and no blob8, so it is safe on an empty dataset, and it is
   * what stops the five walkthrough sections from each rendering the same 422 in the
   * window between deploying this Worker and shipping the client that feeds it. */
  let haveWt = 0, probeErr = '';
  try {
    const r = await sql(apiToken, `SELECT sum(_sample_interval) AS n FROM ${DATASET}
        WHERE blob1 LIKE 'walkthrough_%' AND ${since}`);
    haveWt = num(r[0] && r[0].n);
  } catch (e) { probeErr = e.message; }

  const wt = haveWt > 0 ? await walkthroughSections(apiToken, since) : [];
  const migrated = await simSections(apiToken, since);

  const noData = '<p class="muted">No walkthrough events in this window. These four events '
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
    + '<a href="?token=' + encodeURIComponent(token) + '&view=analytics">Analytics</a>.</p>'
    + '<h2>Walkthroughs <span class="muted">— how far people get, and where they stall</span></h2>'
    + '<p class="muted">Session counts are a <b>FLOOR</b>: this dataset is sampled, whole '
    + 'rows are dropped, and no weighting recovers a session that vanished entirely. '
    + 'Event counts use <span class="mono">sum(_sample_interval)</span>, which does correct '
    + 'for sampling. Durations are <b>wall time</b>, not plant time — a step can burn a '
    + 'minute of someone’s life and an hour of the clock at 600×.</p>'
    + (haveWt > 0 ? wt.join('') : noData)
    + '<h2>In the simulator <span class="muted">— everything else the sim reports</span></h2>'
    + '<p class="muted">Moved here from the Analytics page, unchanged.</p>'
    + migrated.join('')
    + '</body></html>');
}

// ============================================================ the walkthrough sections
async function walkthroughSections(apiToken, since) {
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
  const [starts, ends, mix, funnel, rewinds, dwell] = await Promise.all([
    sql(apiToken, `SELECT blob8 AS wt, count(DISTINCT blob4) AS sessions,
            sum(_sample_interval) AS n, max(double10) AS steps
       FROM ${DATASET} WHERE blob1 = 'walkthrough_start' AND ${since} GROUP BY wt`).catch(errRows('starts')),
    sql(apiToken, `SELECT blob5 AS k, count(DISTINCT blob4) AS sessions, sum(_sample_interval) AS n
       FROM ${DATASET} WHERE blob1 = 'walkthrough_end' AND ${since} GROUP BY k`).catch(errRows('ends')),
    // The by-mix comes off the COMPOSITE key, which is the copy that survives the rollup.
    sql(apiToken, `SELECT blob5 AS k, sum(_sample_interval) AS n
       FROM ${DATASET} WHERE blob1 = 'walkthrough_step' AND ${since} GROUP BY k`).catch(errRows('step mix')),
    /* …and the funnel comes off the COLUMNS, because `count(DISTINCT session)` per
     * (walkthrough, step) has to group on the step alone. Summing the by-mix rows instead
     * would double-count any session that checked one step off twice under two different
     * verdicts — which a rewind-and-redo produces, and which is precisely the case this
     * page exists to find. */
    sql(apiToken, `SELECT blob8 AS wt, double9 AS step, count(DISTINCT blob4) AS sessions,
            sum(_sample_interval) AS n
       FROM ${DATASET} WHERE blob1 = 'walkthrough_step' AND ${since} GROUP BY wt, step`).catch(errRows('funnel')),
    sql(apiToken, `SELECT blob8 AS wt, double9 AS step, count(DISTINCT blob4) AS sessions,
            sum(_sample_interval) AS n
       FROM ${DATASET} WHERE blob1 = 'walkthrough_rewind' AND ${since} GROUP BY wt, step`).catch(errRows('rewinds')),
    // Raw durations. Quantiles are computed here, not in SQL — see `quantile`.
    sql(apiToken, `SELECT blob8 AS wt, double9 AS step, double1 AS seconds
       FROM ${DATASET} WHERE blob1 = 'walkthrough_step' AND ${since} LIMIT 20000`).catch(errRows('time on step')),
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

// =============================================== the sections moved from analytics.js
// Moved VERBATIM (#674, owner: "move some of the feature tracking from the statistics
// page ... to this new feature tracking page"). Their comments came with them, because
// each one records a trap that is still true.
async function simSections(apiToken, since) {
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
    section('Time per session', async () => {
      const spans = await sql(apiToken, `SELECT blob4 AS session,
              min(timestamp) AS first_seen, max(timestamp) AS last_seen
         FROM ${DATASET} WHERE blob2 <> 'dev' AND ${since} GROUP BY session`);
      if (!spans.length) return '<p class="muted">(none)</p>';

      // The client clock is a separate query and only exists post-column; absent, the
      // write span stands alone. Naming double5 with no qualifying row is a 422.
      let lastBy = {};
      try {
        const probe = await sql(apiToken, `SELECT count() AS n FROM ${DATASET}
            WHERE ${since} AND timestamp >= ${COLUMNS_SINCE}`);
        if (num(probe[0] && probe[0].n) > 0) {
          (await sql(apiToken, `SELECT blob4 AS session, max(double5) AS t_last
              FROM ${DATASET} WHERE blob2 <> 'dev' AND ${since}
                AND timestamp >= ${COLUMNS_SINCE} GROUP BY session`))
            .forEach((r) => { lastBy[r.session] = num(r.t_last); });
        }
      } catch (e) { lastBy = {}; }

      const secs = spans.map((r) => {
        const t = (s) => Date.parse(String(s || '').trim().replace(' ', 'T') + 'Z');
        const write = (t(r.last_seen) - t(r.first_seen)) / 1000;
        return Math.max(isFinite(write) && write > 0 ? write : 0, lastBy[r.session] || 0);
      }).sort((a, b) => a - b);

      const mid = Math.floor(secs.length / 2);
      const median = secs.length % 2 ? secs[mid] : (secs[mid - 1] + secs[mid]) / 2;
      const mean = secs.reduce((a, b) => a + b, 0) / secs.length;

      return '<div class="tiles">'
        + '<div class="tile"><div class="v">' + esc(dur(median)) + '</div><div class="k">Median</div></div>'
        + '<div class="tile"><div class="v">' + esc(dur(mean)) + '</div><div class="k">Mean</div></div>'
        + '<div class="tile"><div class="v">' + esc(dur(secs[secs.length - 1])) + '</div><div class="k">Longest</div></div>'
        + '<div class="tile"><div class="v">' + secs.length + '</div><div class="k">Sessions</div></div>'
        + '</div>'
        + '<p class="muted">A FLOOR, and time a TAB WAS OPEN rather than time spent '
        + 'playing — the longest figure here is usually a tab someone left. Trust the '
        + 'median; the mean follows whichever tab was abandoned longest.</p>';
    }),
    section('Sessions by starting condition', async () => table(
      (await sql(apiToken, `SELECT blob5 AS initial_state, count(DISTINCT blob4) AS sessions
         FROM ${DATASET} WHERE blob1 = 'session_start' AND ${since}
         GROUP BY initial_state ORDER BY sessions DESC`))
        .map((r) => ({ initial_state: r.initial_state || '(none)', sessions: num(r.sessions) })),
      [{ key: 'initial_state', label: 'Starting condition' },
       { key: 'sessions', label: 'Sessions', num: true }])),
    section('How far through a startup they get', async () => table(
      (await sql(apiToken, `SELECT double3 AS mode, count(DISTINCT blob4) AS sessions
         FROM ${DATASET} WHERE blob1 = 'plant_mode' AND ${since}
         GROUP BY mode ORDER BY mode DESC`))
        .map((r) => ({ mode: 'Mode ' + num(r.mode), sessions: num(r.sessions) })),
      [{ key: 'mode', label: 'Reached' }, { key: 'sessions', label: 'Sessions', num: true }])),
    section('Most-used controls', async () => table(
      (await sql(apiToken, `SELECT blob5 AS action, sum(_sample_interval) AS uses,
              count(DISTINCT blob4) AS sessions
         FROM ${DATASET} WHERE blob1 = 'command' AND ${since}
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
              AND timestamp >= ${COLUMNS_SINCE} AND ${since}
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
         FROM ${DATASET} WHERE blob1 = 'panel_open' AND ${since}
         GROUP BY panel ORDER BY opens DESC LIMIT 20`))
        .map((r) => ({ panel: r.panel || '(none)', opens: num(r.opens), sessions: num(r.sessions) })),
      [{ key: 'panel', label: 'Panel' }, { key: 'opens', label: 'Opens', num: true },
       { key: 'sessions', label: 'Sessions', num: true }])),
  ]);
}
