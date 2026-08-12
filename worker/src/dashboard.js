/* Reactor Dynamics — ops dashboard.
 *
 * Two views behind one shared-secret token (`env.DASHBOARD_TOKEN`, a Worker secret —
 * never in this repo, never in RD_Ops):
 *
 *   GET /dashboard?token=T                    bug reports, newest first
 *   GET /dashboard?token=T&key=<r2 key>        one report
 *   GET /dashboard?token=T&key=<r2 key>&raw=1  the decompressed JSON, as-is
 *   GET /dashboard?token=T&view=analytics      traffic + in-sim usage (analytics.js)
 *   GET /dashboard?token=T&view=sessions       per-session drill-down (sessions.js)
 *   GET /dashboard?token=T&view=session&sid=…  one session's trace
 *
 * GET only, and not part of the CORS-fronted ingest API in index.js: this is meant to
 * be opened directly in a browser, not called from the site.
 *
 * Every string that came from a player (the note, anything inside the bundle) is
 * HTML-escaped before it goes on the page — the note is untrusted input rendered as a
 * page an owner reads in a real browser, and it is not the reporter's job to keep it
 * safe to display.
 */

import { esc, html, PAGE_HEAD, nav, cards, etWithDow, etFull } from './render.js';
import { analyticsPage } from './analytics.js';
import { sessionList, sessionDetail } from './sessions.js';
import { featuresPage, featuresAction } from './features.js';

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// bundles/<day>/<base36 ms>-<8 random chars>.json[.gz] — see index.js handleBundle.
function parseKey(key) {
  const parts = key.split('/');
  const day = parts[1] || '';
  const id = (parts[2] || '').replace(/\.json(\.gz)?$/, '');
  const ms = parseInt(id.split('-')[0], 36);
  // Match the Analytics Engine format the other two views print ("YYYY-MM-DD HH:MM:SS")
  // rather than raw ISO — milliseconds and a T are noise in a column someone scans.
  // This stays UTC: it is the wire format, and `etWithDow` converts it at RENDER (2026-08-12).
  // The `day` fallback is a bare date and the ET helpers pass it through unconverted — see
  // the DATE_ONLY note in render.js for why converting it would list a report a day early.
  const when = Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 19).replace('T', ' ') : day;
  return { day, id, when };
}

async function fetchBundle(env, key) {
  const obj = await env.BUNDLES.get(key);
  if (!obj) return null;
  const text = key.endsWith('.gz')
    ? await new Response(obj.body.pipeThrough(new DecompressionStream('gzip'))).text()
    : await obj.text();
  return JSON.parse(text);
}

async function reportList(env, token) {
  if (!env.BUNDLES) return html('no bucket bound', 503);

  // Keys sort newest-first as plain strings: the date segment dominates, and within a
  // day the base36-millisecond id segment is monotonic too.
  const listed = await env.BUNDLES.list({ prefix: 'bundles/', limit: 1000 });
  const keys = listed.objects.map((o) => o.key).sort().reverse();
  const shown = keys.slice(0, 50);

  const rows = await Promise.all(shown.map(async (key) => {
    const { when } = parseKey(key);
    let note = '', plant = '';
    try {
      const bundle = await fetchBundle(env, key);
      note = (bundle && bundle.note) || '';
      const manifest = bundle && bundle.bundle && bundle.bundle.manifest;
      plant = (manifest && manifest.plant_id) || '';
    } catch (e) {
      note = '(failed to read: ' + e.message + ')';
    }
    // The card CLAMPS the note in CSS, so the preview no longer has to be truncated to a
    // single line's worth here — 400 chars is a card's worth of reading, and anything past
    // it is a click away. The old 140 was sized for a table cell.
    const preview = note.length > 400 ? note.slice(0, 400) + '…' : note;
    return {
      title: etWithDow(when),
      meta: [{ k: 'Plant', v: plant || '—', mono: true }],
      body: preview || '(no note)',
      href: '?token=' + encodeURIComponent(token) + '&key=' + encodeURIComponent(key),
      hrefLabel: 'view report →',
    };
  }));

  return html('<!doctype html><html><head>' + PAGE_HEAD
    + '<title>Feedback — Reactor Dynamics</title></head><body>' + nav(token, '')
    + '<h1>Bug reports — ' + rows.length + ' of ' + listed.objects.length + ', newest first</h1>'
    + '<p class="muted">Times are Eastern.</p>'
    + cards(rows)
    + (listed.objects.length > rows.length ? '<p class="muted">Showing the most recent ' + rows.length + '.</p>' : '')
    + '</body></html>');
}

async function reportDetail(env, key, token) {
  let bundle;
  try { bundle = await fetchBundle(env, key); }
  catch (e) { return html('failed to read report: ' + esc(e.message), 500); }
  if (!bundle) return html('not found', 404);

  const b = bundle.bundle || {};
  const manifest = b.manifest || {};
  const events = Array.isArray(b.events) ? b.events : [];
  const commands = Array.isArray(b.commands) ? b.commands : [];
  const perf = b.performance || {};
  const { when, id } = parseKey(key);

  const eventRows = events.slice(0, 200).map((e) =>
    '<tr><td class="mono muted">' + esc(e.t) + '</td><td>' + esc(e.type || e.kind || '')
    + '</td><td class="mono muted">' + esc(JSON.stringify(e)) + '</td></tr>'
  ).join('');
  const cmdRows = commands.slice(0, 200).map((c) =>
    '<tr><td class="mono muted">' + esc(c.t) + '</td><td>' + esc(c.action || c.cmd || '')
    + '</td><td>' + esc(c.blocked ? 'blocked' : (c.error || '')) + '</td></tr>'
  ).join('');

  const backHref = '?token=' + encodeURIComponent(token);
  const rawHref = backHref + '&key=' + encodeURIComponent(key) + '&raw=1';

  return html('<!doctype html><html><head>' + PAGE_HEAD
    + '<title>Report ' + esc(id) + '</title></head><body>' + nav(token, '')
    + '<a class="backlink" href="' + backHref + '">&larr; all reports</a>'
    + '<h1>' + esc(etFull(when)) + ' — <span class="mono">' + esc(id) + '</span></h1>'
    + '<section><h2>Note</h2><pre>' + esc(bundle.note || '(no note)') + '</pre></section>'
    + '<section><h2>Manifest</h2><pre>' + esc(JSON.stringify(manifest, null, 2)) + '</pre></section>'
    + '<section><h2>Events (' + events.length + ')</h2><table><tr><th>t</th><th>type</th><th>raw</th></tr>' + eventRows + '</table></section>'
    + '<section><h2>Commands (' + commands.length + ')</h2><table><tr><th>t</th><th>action</th><th>flag</th></tr>' + cmdRows + '</table></section>'
    + '<section><h2>Performance</h2><pre>' + esc(JSON.stringify(perf, null, 2)) + '</pre></section>'
    + '<p><a href="' + rawHref + '">raw json</a></p>'
    + '</body></html>');
}

export async function handleDashboard(env, url, request) {
  if (!env.DASHBOARD_TOKEN) return html('dashboard not configured', 503);
  const token = url.searchParams.get('token') || '';
  if (!safeEqual(token, env.DASHBOARD_TOKEN)) return html('unauthorized', 401);

  // The only write in the whole dashboard, and it is the same token gate as the reads.
  // Answered with a 303 so a refresh cannot resubmit the change.
  if (request && request.method === 'POST') {
    if (url.searchParams.get('view') !== 'features') return html('no such action', 404);
    return featuresAction(env, url, token, await request.formData());
  }

  const view = url.searchParams.get('view');
  if (view === 'analytics') return analyticsPage(env, url, token);
  if (view === 'sessions') return sessionList(env, url, token);
  if (view === 'features') return featuresPage(env, url, token);
  if (view === 'session') return sessionDetail(env, url, token, url.searchParams.get('sid') || '');

  const key = url.searchParams.get('key');
  if (!key) return reportList(env, token);

  if (url.searchParams.get('raw') === '1') {
    let bundle;
    try { bundle = await fetchBundle(env, key); }
    catch (e) { return html('failed to read: ' + esc(e.message), 500); }
    if (!bundle) return html('not found', 404);
    return new Response(JSON.stringify(bundle, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return reportDetail(env, key, token);
}
