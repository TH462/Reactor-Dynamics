/* Shared presentation helpers for the ops dashboard (dashboard.js, analytics.js).
 *
 * Everything user-visible goes through esc() — the reports view renders a player's
 * typed note, which is untrusted input displayed in a real browser.
 */

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/* Day-of-week initial, appended to every date the dashboard prints. Th/Sa/Su are two
 * letters on purpose — T and S alone are ambiguous, which defeats the point.
 *
 * Everything in this dataset is UTC: Analytics Engine returns "YYYY-MM-DD HH:MM:SS"
 * with a space, which `new Date()` is NOT required to parse and which V8 treats as
 * LOCAL time when it does. Both would silently shift the day near midnight, so the
 * string is normalised to explicit ISO-Z first rather than trusted.
 */
const DOW = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'];

export function dow(s) {
  if (!s) return '';
  let iso = String(s).trim().replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(iso)) iso += 'Z';
  const d = new Date(iso);
  return isFinite(d.getTime()) ? DOW[d.getUTCDay()] : '';
}

// A date with its weekday: "2026-08-09 Su". Suffixed rather than prefixed so the dates
// stay left-aligned in a column.
//
// ZONE-FREE, and takes a BARE CALENDAR DAY. "2026-08-09" is a label, not an instant, so
// there is nothing here to convert — the weekday of that date is the same in every zone.
// Its callers are the ones that decide which zone the day was computed in: the traffic
// table now hands it `etDay()` output (Eastern), and the reports view hands it an R2 key's
// UTC day prefix when an id carries no parseable stamp. Point-in-time stamps must use
// `etWithDow` instead; see the note there for why the two must not be swapped.
export function withDow(s) {
  const w = dow(s);
  return w ? String(s) + ' ' + w : String(s == null ? '' : s);
}

/* ---------------------------------------------------------------- Eastern time
 *
 * The dashboard reads EASTERN, because a person reads it (owner request, 2026-08-12) —
 * every date and time on every view, since 2026-08-13. STORAGE AND QUERIES STAY UTC and
 * must: Analytics Engine stores UTC, the SQL windows are relative (NOW() - INTERVAL), the
 * GraphQL filter accepts nothing but UTC, and the R2 bundle keys are UTC day prefixes.
 * Only what is DISPLAYED is converted — where a window BOUNDARY is now chosen in Eastern
 * (`etDayStartMs`), it is still sent over the wire as UTC.
 *
 * A BUCKET IS NOT AN INSTANT, AND RELABELLING ONE IS A LIE. The traffic table's rows are
 * day buckets. The row the upstream API marks 2026-08-11 holds UTC 00:00–24:00, which in
 * Eastern is 20:00 on the 10th through 20:00 on the 11th — so stamping "ET" on that label
 * without re-grouping the underlying query moves four or five hours of every day's counts
 * into the neighbouring row while looking entirely correct. That is why the first pass at
 * this (2026-08-12) left the column UTC and said so in its header.
 *
 * The fix is to re-group, not to relabel: `analytics.js` now asks RUM for `datetimeHour`
 * and sums the hours into Eastern days here-side, via `etDay()`. Measured 2026-08-13 on
 * the live dataset before the change landed — hourly and daily grouping return IDENTICAL
 * totals over 7/30/90 days (67/51, 50/40, 50/40 pageloads/visits) at the same
 * sampleInterval, so the finer grouping neither loses rows nor drops to a coarser
 * sampling tier. Without that measurement the re-group would be trading a labelling error
 * for an accuracy one.
 *
 * DST IS HANDLED BY THE ZONE, NOT BY ARITHMETIC — `America/New_York`, so EST and EDT
 * switch themselves. A fixed −5 (or −4) offset would be right for half the year, which
 * is the failure mode worth naming: it reads correct in testing and drifts an hour in
 * March. `Intl` is available in Workers; nothing extra is loaded. Asking the zone is
 * necessary but not sufficient — WHEN you ask it also matters, and `etDayStartMs` below
 * carries the case where the obvious sampling instant gives the wrong answer.
 *
 * The abbreviation is carried in the COLUMN HEADER ("ET") rather than on every row,
 * because these columns are scanned. Single headline values print it in full.
 */
const ET_ZONE = 'America/New_York';
const ET_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: ET_ZONE, hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  weekday: 'short', timeZoneName: 'short',
});
const EN_DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/* Accepts epoch MILLISECONDS or an Analytics Engine "YYYY-MM-DD HH:MM:SS" string.
 *
 * That string has no zone marker and `new Date()` is NOT required to parse it — V8
 * treats it as LOCAL time when it does, which on a UTC Worker is harmless and on any
 * other machine is a silent hours-long shift. It is normalised to explicit ISO-Z first,
 * exactly as `dow()` above already does. Same trap, same fix, one place each. */
function toDate(input) {
  if (input == null || input === '') return null;
  // A Date falls through to the string branch otherwise, where "Mon Aug 11 2026 …" parses
  // as nothing and the caller silently gets null — which is how `etDayStartMs` threw on
  // its own output the first time it was run.
  if (input instanceof Date) return Number.isFinite(input.getTime()) ? input : null;
  if (typeof input === 'number') return Number.isFinite(input) ? new Date(input) : null;
  let iso = String(input).trim().replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(iso)) iso += 'Z';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

/* A BARE "YYYY-MM-DD" IS A DAY, NOT AN INSTANT, and must not be converted.
 *
 * The reports view falls back to the R2 key's day prefix when an id carries no parseable
 * timestamp. Treating that as midnight UTC and converting would print the PREVIOUS DAY at
 * 20:00 — a report filed on the 11th listed under the 10th, which is worse than showing a
 * date with no time. Date-only input passes through and gets its UTC weekday, exactly as
 * `withDow` would give it. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function etFields(input) {
  const d = toDate(input);
  if (!d) return null;
  const p = {};
  for (const part of ET_PARTS.formatToParts(d)) p[part.type] = part.value;
  return p;
}

// "2026-08-11 21:34:07" in Eastern. Same shape as the UTC strings it replaces, so
// columns and CSVs do not change width or sort order within a zone.
export function et(input) {
  if (typeof input === 'string' && DATE_ONLY.test(input.trim())) return input.trim();
  const p = etFields(input);
  if (!p) return String(input == null ? '' : input);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

// …with the weekday initial, in the house DOW convention: "2026-08-11 21:34:07 T".
// The weekday is taken in EASTERN too — computing it from the UTC date would print the
// wrong letter for anything after 19:00 ET, which is most of an evening's traffic.
export function etWithDow(input) {
  if (typeof input === 'string' && DATE_ONLY.test(input.trim())) return withDow(input.trim());
  const p = etFields(input);
  if (!p) return String(input == null ? '' : input);
  const w = DOW[EN_DOW[p.weekday]] || '';
  return et(input) + (w ? ' ' + w : '');
}

// …and with the zone spelled out: "2026-08-11 21:34:07 T EDT". For single headline
// values, where there is room and the EST/EDT distinction is worth stating outright.
export function etFull(input) {
  if (typeof input === 'string' && DATE_ONLY.test(input.trim())) return withDow(input.trim());
  const p = etFields(input);
  if (!p) return String(input == null ? '' : input);
  return etWithDow(input) + (p.timeZoneName ? ' ' + p.timeZoneName : '');
}

// Which EASTERN calendar day an instant fell on: "2026-08-11". The bucketing key for the
// traffic table — an hour stamped 2026-08-12T02:00Z belongs to the 11th here, and that
// shift is the entire reason the table is grouped hourly and re-summed rather than read
// off the API's own day buckets.
export function etDay(input) {
  if (typeof input === 'string' && DATE_ONLY.test(input.trim())) return input.trim();
  const p = etFields(input);
  if (!p) return String(input == null ? '' : input);
  return `${p.year}-${p.month}-${p.day}`;
}

// How far the Eastern wall clock sits from UTC at a given instant, in ms. Negative west
// of Greenwich: -4h in EDT, -5h in EST. Read off the zone, never assumed.
function etOffsetMs(ms) {
  const q = etFields(ms);
  return Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour, +q.minute, +q.second)
    - Math.floor(ms / 1000) * 1000;
}

/* The UTC instant at which the Eastern calendar day containing `input` BEGAN — used to
 * align the query window, so the oldest row in the table is a whole Eastern day rather
 * than the last 19 or 20 hours of one.
 *
 * TWO PASSES, AND THE SECOND IS NOT OPTIONAL. An offset is a property of an instant, not
 * of a day, so finding the instant needs the offset and finding the offset needs the
 * instant. The fix is to guess with the offset at the same wall time read as UTC, then
 * re-read the offset AT THE GUESS and re-solve; one iteration is exact because the guess
 * is already within an hour of the answer and DST moves by an hour at 02:00, not at 00:00.
 *
 * The obvious alternative — sample the offset at NOON, safely away from the switch — is
 * what this was written as first, and it is wrong on precisely the two days a year the
 * whole exercise is about, in OPPOSITE directions. Noon on 2026-03-08 is already EDT, so
 * it puts that day's start at 04:00Z when 00:00 EST is 05:00Z (an hour early, into the
 * 7th); noon on 2026-11-01 is already EST, so it puts that day's start at 05:00Z when
 * 00:00 EDT is 04:00Z (an hour late, dropping the day's first hour). Both were measured;
 * `test/run_dashboard_time.js` pins all four cases so it cannot be "simplified" back.
 */
export function etDayStartMs(input) {
  const p = etFields(input);
  if (!p) return null;
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, 0, 0, 0);
  const guess = wall - etOffsetMs(wall);
  return wall - etOffsetMs(guess);
}

/* How many days of RUM the upstream API holds at FULL RESOLUTION. Not a preference and
 * not a guess — it is a property of Cloudflare's adaptive tiers, measured on the live
 * dataset (the numbers are in analytics.js, at the only place that consumes this). */
export const RUM_FULL_RES_DAYS = 7;

/* How a by-day row is titled: the Eastern day, its weekday letter, and — for the one row
 * a clamped window opens partway into — the word that stops it being read as a real drop
 * in traffic. A short bucket and a quiet day are the same row without it.
 *
 * A function, and exported, for one reason: written inline at the call site the only
 * available check is a regex for "(partial)", and that regex passes on
 * `(false ? ' (partial)' : '')`. Measured — it did, on the first injection run. */
export function dayLabel(day, partialDay) {
  return withDow(day) + (day != null && day === partialDay ? ' (partial)' : '');
}

/* WHERE A QUERY WINDOW MAY START: the Eastern midnight `days` back, but never earlier
 * than the full-resolution edge.
 *
 * Aligning the start to an Eastern midnight (2026-08-13) is right for the TABLE — it is
 * what makes the oldest row a whole day — and for four hours out of every twenty-four it
 * is fatal to the NUMBERS. `now - days*24h` taken between 00:00 and 04:00 UTC, which is
 * 8pm to midnight Eastern, has already rolled into the previous Eastern day, so its
 * midnight sits twenty hours the wrong side of the edge and the whole page drops to the
 * coarse tier. Nothing errors; the counts just quietly become approximations.
 *
 * Clamping trades that for a short oldest row, which the caller labels. Only inside the
 * full-resolution window: at 14/30/90 days the coarse tier is unavoidable, and trimming
 * the start there would silently shorten the window that was actually asked for.
 *
 * IT LIVES HERE, next to the helper it corrects, because this file is the one
 * `test/run_dashboard_time.js` imports — so the rule is exercised across a year of real
 * instants rather than pattern-matched out of the source. A copy in analytics.js could
 * only be tested by regex, and a regex cannot tell 8pm from 8am.
 */
export function windowStartMs(nowMs, days) {
  const want = etDayStartMs(nowMs - days * 864e5);
  if (days > RUM_FULL_RES_DAYS) return want;
  // 00:00 of (today - RUM_FULL_RES_DAYS), by arithmetic: an epoch day is exactly 864e5 ms,
  // and this edge is not a wall-clock date in any zone, so no offset belongs in it.
  const edge = nowMs - (nowMs % 864e5) - RUM_FULL_RES_DAYS * 864e5;
  return Math.max(want, edge);
}

// Whole seconds -> "45s" / "3m 12s" / "11h 34m". Never a bare decimal: these are read
// at a glance and "0.05 h" is not a glance.
export function dur(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  return Math.floor(s / 3600) + 'h ' + Math.round((s % 3600) / 60) + 'm';
}

/* CARDS — for RECORD lists, where `table()` is for comparisons (owner request, 2026-08-12:
 * "put the data on cards instead of infinitely expandable rows … when the screen is
 * stretched the rows become very long left to right with the data far from each other.
 * lots of wasted space").
 *
 * THE PROBLEM IS HORIZONTAL, not vertical. A wide table spends its extra width pushing
 * cells APART, so a session's id and its row count end up a screen apart and the eye has to
 * track across empty space to keep them associated — while the page shows only nine rows.
 * Extra width should buy MORE RECORDS, not more gap.
 *
 * That is what the grid does: `repeat(auto-fill, minmax(320px, 1fr))` turns a wider screen
 * into more cards per row, each one a fixed, scannable width with its fields stacked close
 * together. One column on a phone, four on a monitor, no breakpoint to maintain. The page
 * max-width in PAGE_HEAD is the other half of the same fix.
 *
 * Aggregate tables (top pages, actions, refusals, by-day) stay TABLES on purpose: those are
 * columns of numbers meant to be compared down the column, and cards would destroy exactly
 * the alignment that makes them readable. They get `width:auto` instead, so they size to
 * their content rather than to the window.
 *
 * `item` shape — every field optional except title:
 *   { title, titleHtml, href, hrefLabel, meta: [{k, v, mono}], body }
 * `titleHtml` bypasses escaping for a pre-built link; everything else is escaped here.
 */
export function cards(items) {
  if (!items || !items.length) return '<p class="muted">(none)</p>';
  return '<div class="cards">' + items.map((it) => {
    const title = it.titleHtml || esc(it.title == null ? '' : it.title);
    const meta = (it.meta || []).filter((m) => m && m.v !== '' && m.v != null).map((m) =>
      '<div class="k">' + esc(m.k) + '</div>'
      + '<div class="v' + (m.mono ? ' mono' : '') + '">' + esc(m.v) + '</div>').join('');
    return '<div class="card">'
      + '<div class="card-h">' + title + '</div>'
      + (meta ? '<div class="kv">' + meta + '</div>' : '')
      + (it.body ? '<div class="card-note">' + esc(it.body) + '</div>' : '')
      + (it.href ? '<div class="card-f"><a href="' + esc(it.href) + '">'
          + esc(it.hrefLabel || 'view') + '</a></div>' : '')
      + '</div>';
  }).join('') + '</div>';
}

/* Renders one titled section, and turns a FAILED QUERY into a visible message rather than
 * an empty frame — a silent zero is indistinguishable from "nothing happened". Lived in
 * analytics.js until the usage page (#674) needed the identical thing; two copies would
 * have been two error conventions. `fn` is async and may throw. */
export async function section(title, fn) {
  let inner;
  try { inner = await fn(); }
  catch (e) { inner = errBlock(e.message); }
  return '<section><h2>' + esc(title) + '</h2>' + inner + '</section>';
}

/* A ONE-BAR-PER-ROW MAGNITUDE CELL, for a funnel read down a table column (#674).
 *
 * NOT `barChart`: that draws a grouped column chart for a TIME SERIES, and a drop-off
 * funnel is not one — it is an ordered list where the only question is "how much shorter
 * is this row than the one above it", which the eye answers from left-aligned bars in a
 * column and cannot answer from a row of labelled columns.
 *
 * THE NUMBER STAYS IN THE CELL, not in a tooltip. A bar's length reads as a precision it
 * does not have at this site's volume, where one session can be a fifth of the bar; the
 * bar carries the shape and the printed figure carries the fact. `pct` is 0-100 and is
 * clamped, so a row somehow over its own denominator draws a full bar instead of
 * overflowing its cell. */
export function pctBar(pct, label) {
  const w = Math.max(0, Math.min(100, Number(pct) || 0));
  return '<div class="bar"><i style="width:' + w.toFixed(1) + '%"></i>'
    + '<b>' + esc(label == null ? Math.round(w) + '%' : label) + '</b></div>';
}

/* EVERY dashboard page goes out through here, which is the only reason the two privacy
 * headers below can be relied on: set them per view and the one view that forgets is the
 * one holding a player's bug-report note in a shared-device browser cache (#764).
 *
 *   Cache-Control: no-store    the bug list is other people's words; a back-button
 *                              rehydration of it on a borrowed laptop is a real leak.
 *   Referrer-Policy: no-referrer   the dashboard links OUT (a report's origin URL, the
 *                              site itself). Nothing of ours belongs in someone else's
 *                              access log, and this survived the token leaving the query
 *                              string precisely because it was never only about the token.
 *
 * `extra` is for the per-response headers a single view owns — Set-Cookie on login and
 * logout, X-Robots-Tag on the login page. It can override the two above; nothing does. */
export function html(body, status, extra) {
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  };
  if (extra) for (const k of Object.keys(extra)) headers[k] = extra[k];
  return new Response(body, { status: status || 200, headers });
}

export const PAGE_HEAD = `<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  /* WIDTH IS CAPPED AND THE PAGE IS CENTRED (2026-08-12, owner: "when the screen is
     stretched the rows become very long left to right with the data far from each other").
     Everything here used to be full-bleed — body had no max-width and every table was
     width:100% — so on a wide monitor a four-column table put its first and last cell a
     screen apart and the eye lost the row. Reading distance, not screen width, is what a
     line length should be set by. */
  body { background:#0b0f14; color:#d7e0e8; font:14px/1.5 -apple-system,Segoe UI,sans-serif;
         margin:0 auto; padding:24px 32px; max-width:1680px; }
  a { color:#5fb3d9; }
  h1 { font-size:18px; margin:0 0 16px; }
  h2 { font-size:14px; color:#8fa2b3; text-transform:uppercase; margin:0 0 8px; }
  /* width:auto, so a table is as wide as its CONTENT and no wider. The cap stops a long
     free-text cell from re-introducing the stretch on its own. */
  table { border-collapse:collapse; width:auto; max-width:100%; }
  td, th { text-align:left; padding:6px 10px; border-bottom:1px solid #1c2531; vertical-align:top; }
  th { color:#8fa2b3; font-weight:600; font-size:12px; text-transform:uppercase; }
  tr:hover td { background:#111823; }
  .note { max-width:520px; white-space:pre-wrap; }
  .mono { font-family:ui-monospace,Consolas,monospace; }
  .muted { color:#8fa2b3; }
  .num { text-align:right; font-family:ui-monospace,Consolas,monospace; }
  pre { background:#111823; padding:12px; border-radius:6px; overflow:auto; white-space:pre-wrap; }
  section { margin-bottom:24px; }
  .backlink { display:inline-block; margin-bottom:16px; }
  nav { margin-bottom:20px; padding-bottom:12px; border-bottom:1px solid #1c2531; }
  nav a { margin-right:16px; }
  nav a.on { color:#d7e0e8; font-weight:600; text-decoration:none; }
  .tiles { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:24px; }
  .tile { background:#111823; border-radius:6px; padding:12px 18px; min-width:120px; }
  .tile .v { font-size:24px; font-family:ui-monospace,Consolas,monospace; }
  .tile .k { font-size:11px; color:#8fa2b3; text-transform:uppercase; }
  .warn { color:#d9a85f; }
  .err { color:#d97a7a; }
  /* Funnel bar (#674). A track wide enough to read a shape off, the fill left-aligned so
     the eye compares LEFT EDGES down the column, and the figure printed on top of it —
     the bar is the shape, the number is the fact. The fill colour is the chart's own
     categorical blue (see barChart's palette note), not a status colour: a bar wearing
     .warn's amber would claim a condition it does not have. */
  .bar { position:relative; min-width:180px; height:18px; background:#111823; border-radius:3px; }
  .bar i { position:absolute; inset:0 auto 0 0; background:#3987e5; border-radius:3px; }
  .bar b { position:relative; padding:0 6px; font:12px/18px ui-monospace,Consolas,monospace;
           color:#d7e0e8; font-weight:600; }
  /* Record cards. auto-fill/minmax means one column on a phone and as many as fit on a
     desktop, with no breakpoint to maintain. */
  .cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:12px; }
  .card { background:#111823; border:1px solid #1c2531; border-radius:8px; padding:14px 16px;
          display:flex; flex-direction:column; gap:10px; }
  .card:hover { border-color:#2a3646; }
  .card-h { font-family:ui-monospace,Consolas,monospace; font-size:13px; color:#d7e0e8;
            display:flex; justify-content:space-between; gap:10px; align-items:baseline; }
  .card .kv { display:grid; grid-template-columns:auto 1fr; gap:2px 12px; font-size:12px; }
  .card .kv .k { color:#8fa2b3; text-transform:uppercase; font-size:11px; white-space:nowrap; }
  .card .kv .v { color:#d7e0e8; }
  /* THE CLAMP IS THE POINT — a long note must not make its card taller than the screen.
     line-clamp degrades to plain overflow hiding where it is unsupported, which is still
     bounded; the full text lives on the detail page. */
  /* 7.5em is 5 lines x the 1.5 line-height, and the two MUST agree: at 6.5em the height cap
     cut into line five and sliced the glyphs in half horizontally — visible only in a
     screenshot, invisible in the markup. max-height is the fallback for engines without
     line-clamp; where line-clamp works it ends the text on a whole line with an ellipsis. */
  .card-note { white-space:pre-wrap; color:#c3cedb; font-size:13px; max-height:7.5em;
               overflow:hidden; display:-webkit-box; -webkit-line-clamp:5; -webkit-box-orient:vertical; }
  .card-f { margin-top:auto; font-size:12px; }
  /* PRESET RANGE LINKS. These are anchors rather than submit buttons, and that is the whole
     fix for #<n>: on a GET submission the browser DISCARDS the action URL's query string and
     replaces it with the form's own fields, so a per-button action carrying from/to sent the
     date inputs' CURRENT values instead -- every preset redrew the window already on screen.
     Measured in headless Edge 2026-09-20: clicking a 14d button whose own action asked for
     from=2026-09-07 navigated to from=2026-09-14, the value in the input. A preset is
     NAVIGATION, not submission; an anchor cannot have the defect. */
  a.pbtn { display:inline-block; padding:2px 10px; margin-right:4px; border-radius:4px;
           background:#111823; border:1px solid #1c2531; color:#d7e0e8; font-size:12px;
           text-decoration:none; }
  a.pbtn:hover { border-color:#2a3646; color:#5fb3d9; }
</style>`;

/* NO CREDENTIAL IN A HREF (#764). The nav used to rewrite the shared secret onto every
 * internal link, which put it in browser history, in the address bar of every screenshot,
 * and one outbound click away from someone else's access log. Authentication is the
 * `rd_dash` cookie now; a link carries only what it is FOR — view, sid, key, raw, days. */
export function nav(current) {
  const link = (view, label) => {
    const href = view ? '?view=' + view : '/dashboard';
    return '<a class="' + (current === view ? 'on' : '') + '" href="' + href + '">' + label + '</a>';
  };
  /* `usage` is the FEATURE USAGE page (#674) and `features` is the feature FLAGS page.
   * Two different things with confusingly close names, and the flags view had the good
   * name first — renaming it would break every bookmark the owner holds. */
  return '<nav>' + link('', 'Bug reports') + link('analytics', 'Analytics')
    + link('usage', 'Usage') + link('sessions', 'Sessions') + link('features', 'Features') + '</nav>';
}

/* A table that does not lie about an empty result — "(none)" rather than a blank frame.
 * `cols` entries are {key, label, num?, raw?}; rows are plain objects.
 *
 * ⚠ `raw` SUPPRESSES ESCAPING for that column and exists for ONE thing: a cell whose value
 * this file BUILT, such as `pctBar()`. Never mark a column raw because its value happens to
 * be a string today — every value on this page ultimately came off the wire, and the only
 * reason a bar is safe is that its markup is assembled here from a clamped number. */
export function table(rows, cols) {
  if (!rows || !rows.length) return '<p class="muted">(none)</p>';
  const head = cols.map((c) => '<th' + (c.num ? ' class="num"' : '') + '>' + esc(c.label) + '</th>').join('');
  const body = rows.map((r) =>
    '<tr>' + cols.map((c) =>
      '<td' + (c.num ? ' class="num"' : '') + '>'
      + (c.raw ? (r[c.key] == null ? '' : String(r[c.key])) : esc(r[c.key])) + '</td>').join('') + '</tr>'
  ).join('');
  return '<table><tr>' + head + '</tr>' + body + '</table>';
}

/* ---------------------------------------------------------------- the one chart (#604)
 *
 * A GROUPED COLUMN CHART, INLINE SVG, NO LIBRARY AND NO SCRIPT. The worker has no build
 * step and the dashboard ships no JavaScript at all; keeping it that way is worth more
 * than any charting library's features, and a bar chart is a hundred lines of arithmetic.
 *
 * WHY A CHART AT ALL, AND WHY WEEKLY. This site does 28 pageloads and 12 visits in a week
 * (measured 2026-09-02). A daily line over a 30-day window is four fifths zeros, and a
 * chart that is mostly zeros is worse than the table it sits above — it invites reading
 * noise as shape. So the buckets are WEEKS once the window is longer than one, and the
 * caller passes days when it is not. The exact numbers stay in the table directly below:
 * this draws the shape, the table answers "how many".
 *
 * THE PALETTE IS COMPUTED, NOT CHOSEN, FOR THE FIRST TWO. Blue #3987e5 and orange #d95926,
 * validated against this page's dark surface — worst adjacent CVD separation ΔE 26.8
 * (protan) and 31.8 for normal vision. The first pair tried by eye (this page's own link
 * blue against a violet) FAILED at ΔE 3.0 deutan: indistinguishable to a red-green
 * colourblind reader, and only 12.2 to everyone else. Do not substitute hexes here without
 * re-running that check.
 *
 * THE THIRD, #a374db (deep-link landings, added 2026-09-20 for the per-day series), is
 * chosen for hue distance from the first two and from GHOST_COLOR below — it was NOT put
 * through that same ΔE measurement. Said plainly rather than implying a check that never
 * ran (HR12); re-run it before trusting this hex under a CVD simulation.
 *
 * NOT the `.warn` / `.err` colours, deliberately: those are status, they mean something on
 * this page already, and a series wearing a status colour claims a condition it does not
 * have.
 *
 * IDENTITY IS NEVER COLOUR ALONE — each series is direct-labelled at its own last bar, and
 * every bar carries a <title> so a hover gives the exact figure without a tooltip library.
 */
const SERIES = [
  { key: 'a', color: '#3987e5' },
  { key: 'b', color: '#d95926' },
  { key: 'c', color: '#a374db' },
];
// The ghost (prior-period) trend colour — the page's existing `.muted` ink, so a past
// period reads as a memory rather than a competing claim. The 7-DAY TRAILING MEAN and its
// MEAN_COLOR (#5fd9a0) were REMOVED 2026-09-20 (owner: "get rid of the weekly average on
// that plot") — ghost is the only trend line left, and `stats.trailingMean` is gone with it.
const GHOST_COLOR = '#8fa2b3';

/* EXTENDED FOR THE TREND (#764 Unit 2b, on top of #604's original two-series chart): a
 * GHOST (prior-period) line, built from CONTIGUOUS RUNS of non-null points — a null breaks
 * the polyline into a new segment rather than being joined through as zero. A null ghost
 * value means the matching prior-period day is coarse or uncaptured; drawing a line through
 * it would show a dip that never happened. (A second trend line, a 7-day trailing mean, was
 * REMOVED 2026-09-20 — owner: "get rid of the weekly average on that plot" — along with
 * `stats.trailingMean`, which nothing else called.)
 *
 * A THIRD BAR SERIES, DEEP-LINK LANDINGS (2026-09-20, owner: "can you show that per day"),
 * joins pageloads and landing visits — a landing visit whose page is not `/` AND whose
 * referrer is `direct` (`stats.deepLinkLandingsByDay`). It is TINY on purpose: 0-2/day
 * against pageloads peaking in the tens over the same window. It shares this chart's ONE
 * axis, never a second, rescaled one — inflating it to look interesting would misrepresent
 * it — and a bar's minimum 2px height (below) is what keeps a value of 1 visible at all
 * against a much taller max.
 *
 * THREE STATUS MARKS a bar can carry without changing its height, because a bar's HEIGHT is
 * still only pageloads/visits/deep-link landings:
 *   PARTIAL  today, live and unfinished — drawn hollow (stroke only), never solid, so a
 *            half-finished day cannot be mistaken for a closed one at a glance.
 *   COARSE   Cloudflare's rounded tier (sample_interval > 1) — drawn at reduced opacity.
 *   MISSING  no rollup ran for that day — drawn as a dashed tick at the baseline, never a
 *            zero-height bar, because a day with genuinely no traffic and a day the cron
 *            never ran must not look identical (`stats.js`'s whole reason for existing).
 *
 * THIS CHART IS NOW ONLY EVER CALLED FOR A WINDOW OF 14 DAYS OR FEWER (2026-09-20, owner:
 * "for the 30 day and all can you make them a line graph"). A longer window draws
 * `lineChart` below instead of folding into weekly/monthly bars — `bucketDays` no longer
 * buckets at all, and the fourth mark this chart used to carry, PARTIAL_MISSING (a weekly
 * bucket where only some of its folded days were uncaptured), was a fact about a SUM and
 * cannot occur once nothing is summed; it is gone, along with the two checks and the
 * `bucket-partial-missing-hidden` injection that pinned it — see `bucketDays`' header.
 */
export function barChart(rows, opts) {
  opts = opts || {};
  if (!rows || rows.length < 2) return '';          // one bar is a number, not a chart
  const labelA = opts.labelA || 'A', labelB = opts.labelB || 'B', labelC = opts.labelC || 'C';
  // The GUTTER label falls back to labelC; pass labelCShort when labelC will not fit PADR.
  const labelCShort = opts.labelCShort || labelC;
  const labelGhost = opts.labelGhost || 'prior period';
  const W = 720, H = 190, PADL = 34, PADR = 96, PADT = 12, PADB = 26;
  const plotW = W - PADL - PADR, plotH = H - PADT - PADB;
  const max = Math.max(1, ...rows.map((r) =>
    Math.max(r.a || 0, r.b || 0, r.c || 0, r.ghost || 0)));
  /* A ceiling on a "nice" number, so the gridline reads as a round figure rather than as
   * whatever the tallest bar happened to be. */
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / pow) * pow;
  const slot = plotW / rows.length;
  const nSeries = SERIES.length, seriesGap = 2;
  // barW sized for THREE bars per slot (was two, before the deep-link series) — the +gap
  // accounting keeps the same 2px+ margin of surface between bars the two-series chart had.
  const barW = Math.max(2, Math.min(14, (slot - seriesGap * (nSeries - 1)) / nSeries - seriesGap));
  const groupW = barW * nSeries + seriesGap * (nSeries - 1);
  const y = (v) => PADT + plotH - (v / top) * plotH;
  const xMid = (i) => PADL + i * slot + slot / 2;

  let g = '';
  // Recessive grid: two lines and their labels, in muted ink, behind everything.
  [0, top].forEach((v) => {
    g += '<line x1="' + PADL + '" y1="' + y(v) + '" x2="' + (PADL + plotW) + '" y2="' + y(v)
      + '" stroke="#1c2531" stroke-width="1"/>'
      + '<text x="' + (PADL - 6) + '" y="' + (y(v) + 4) + '" fill="#8fa2b3" font-size="10" '
      + 'text-anchor="end">' + v + '</text>';
  });
  rows.forEach((r, i) => {
    const x0 = PADL + i * slot + (slot - groupW) / 2;
    if (!r.missing) {
      SERIES.forEach((s, si) => {
        const v = r[s.key] || 0;
        const h = Math.max(v > 0 ? 2 : 0, (v / top) * plotH);
        if (!h) return;
        const x = x0 + si * (barW + seriesGap);
        const seriesLabel = si === 0 ? labelA : si === 1 ? labelB : labelC;
        const style = r.partial
          ? 'fill="none" stroke="' + s.color + '" stroke-width="2"'
          : 'fill="' + s.color + '"' + (r.coarse ? ' fill-opacity="0.45"' : '');
        const flag = r.partial ? ' (today, partial)' : r.coarse ? coarseFlag(r) : '';
        g += '<rect x="' + x + '" y="' + (PADT + plotH - h) + '" width="' + barW + '" height="' + h
          + '" rx="3" ' + style + '><title>' + esc(r.label) + ' — ' + esc(seriesLabel)
          + ': ' + v + flag + '</title></rect>';
      });
    } else {
      // A tick, not a bar: zero-height would be indistinguishable from a genuine zero day.
      g += '<line x1="' + (xMid(i) - barW) + '" y1="' + (PADT + plotH) + '" x2="' + (xMid(i) + barW)
        + '" y2="' + (PADT + plotH) + '" stroke="#8fa2b3" stroke-width="3" stroke-dasharray="2,2">'
        + '<title>' + esc(r.label) + ' — no data captured</title></line>';
    }
    g += '<text x="' + xMid(i) + '" y="' + (H - 8) + '" fill="#8fa2b3" '
      + 'font-size="10" text-anchor="middle">' + esc(r.label) + '</text>';
  });

  // Trend line: one polyline per CONTIGUOUS run of non-null points, so a gap in the data
  // breaks the line instead of being interpolated across. GHOST is the only one left — the
  // 7-day trailing mean was removed 2026-09-20.
  const trendLine = (key, color, dashed) => {
    const segs = [];
    let cur = [];
    rows.forEach((r, i) => {
      const v = r[key];
      if (v == null) { if (cur.length > 1) segs.push(cur); cur = []; return; }
      cur.push(xMid(i) + ',' + y(v).toFixed(1));
    });
    if (cur.length > 1) segs.push(cur);
    return segs.map((pts) => '<polyline points="' + pts.join(' ') + '" fill="none" stroke="'
      + color + '" stroke-width="2"' + (dashed ? ' stroke-dasharray="5,4"' : '') + '/>').join('');
  };
  g += trendLine('ghost', GHOST_COLOR, true);

  // Direct labels at the right, so identity survives a greyscale print or a CVD reader.
  // Collision-avoided: two labels within 11px are pushed apart rather than left overlapping,
  // which is common once the ghost line ends near a bar's own height.
  const last = rows[rows.length - 1] || {};
  const lastNonNull = (key) => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i][key] != null) return rows[i][key]; return null; };
  const labels = [{ y: y(last.a || 0), color: SERIES[0].color, text: labelA }];
  labels.push({ y: y(last.b || 0), color: SERIES[1].color, text: labelB });
  labels.push({ y: y(last.c || 0), color: SERIES[2].color, text: labelCShort });
  const lg = lastNonNull('ghost'); if (lg != null) labels.push({ y: y(lg), color: GHOST_COLOR, text: labelGhost });
  labels.sort((p, q) => p.y - q.y);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < 11) labels[i].y = labels[i - 1].y + 11;
  }
  labels.forEach((l) => {
    g += '<text x="' + (PADL + plotW + 8) + '" y="' + (l.y + 4) + '" fill="' + l.color
      + '" font-size="11">' + esc(l.text) + '</text>';
  });

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:' + W
    + 'px;display:block;margin:0 0 8px" role="img" aria-label="'
    + esc(labelA + ', ' + labelB + ' and ' + labelC + ' per ' + (opts.bucket || 'period')) + '">' + g + '</svg>';
}

/* Map {day,pageloads,visits,deepLink,coarse,missing,partial,ghost} Eastern-day rows (ascending)
 * onto `barChart`'s row shape — one bar per DAY, always (2026-09-20 rewrite; owner: "for
 * the 30 day and all can you make them a line graph and show data from every day not the
 * weekly average"). `analytics.js` now only calls this for a window of 14 days or fewer —
 * `barChart`'s own widest readable width — and calls `lineChart` below for anything longer,
 * so THIS FUNCTION NO LONGER BUCKETS AT ANY LENGTH.
 *
 * IT USED TO. Before this change a >14-day window folded into weekly bars and a >90-day one
 * into monthly bars, sized off the row count rather than a caller-supplied `days` (an
 * arbitrary range has no guarantee the two agree). That folding — and the `partialMissing`
 * mark that existed ONLY to flag a bucket where some but not all of its folded days were
 * uncaptured, a fact about a SUM — cannot occur once nothing is ever summed, so both are
 * gone, along with `short` (the bucket-doesn't-divide-evenly mark, equally a fact about
 * folding). Removed with them: the `bucket-threshold-widen` and
 * `bucket-partial-missing-hidden` injections in `test/run_dashboard_trend.js`, and the two
 * checks under its old section 7 that asserted week/month bucket counts at 30/45/400 days —
 * see that file for what replaced them. */
/* The rounding a row ACTUALLY carries, never a literal. `si` is MAX(sample_interval) from
 * the first-party store or the live RUM batch; Cloudflare's coarse tier happens to be 10
 * today and is not promised to stay there. Falls back to a bare "coarse" rather than
 * inventing a figure if a row is somehow marked coarse with no interval behind it. */
function coarseFlag(r) {
  const si = Math.max(1, Number(r && r.si) || 1);
  return si > 1 ? ' (coarse, ±' + si + ')' : ' (coarse)';
}

export function bucketDays(dayRows) {
  if (!dayRows || !dayRows.length) return { rows: [], bucket: 'day' };
  return {
    bucket: 'day',
    rows: dayRows.map((r) => ({
      label: r.day.slice(5) + ' ' + dow(r.day),
      a: r.pageloads || 0,
      b: r.visits || 0,
      c: r.deepLink || 0,
      ghost: r.ghost == null ? null : r.ghost,
      coarse: !!r.coarse,
      /* THE MEASURED interval, carried so the tooltip can state the rounding it actually
       * got instead of a hard-coded 10. Cloudflare's coarse tier is 10 TODAY; it is not a
       * constant, and a page that prints a number nobody measured is the defect this
       * whole issue is about. `bucketDays` dropped it, so the bar chart could not. */
      si: Math.max(1, Number(r.si) || 1),
      missing: !!r.missing,
      partial: !!r.partial,
    })),
  };
}

/* ---------------------------------------------------------------- the line chart (2026-09-20)
 *
 * ONE POINT PER DAY, NO BUCKETING, for any window over 14 days (owner: "for the 30 day and
 * all can you make them a line graph and show data from every day not the weekly average").
 * `barChart` above is UNCHANGED and still draws the 14-day-or-fewer case; #764's "mostly
 * zeros" argument against a daily chart doesn't hold once the shape is a line rather than a
 * bar — a line reads fine at 30, 90 or 400 points, a wall of 2px-wide bars does not.
 *
 * THE TRAP: a missing day's STORED count is 0 — `missing` is the only thing that says the
 * nightly rollup never ran, not the value. Joining the line straight through it draws a
 * PLUNGE TO ZERO AND BACK, a collapse that never happened, so each series' line is built
 * from CONTIGUOUS RUNS of non-missing days (`dataLine` below), exactly the segment-per-run
 * idiom the ghost trend line already uses for a null window — and every missing day
 * ALSO draws the same dashed baseline tick `barChart` uses for a whole missing bar, so the
 * gap in the line reads as "no data", not as an unexplained hole (`test/run_dashboard_trend
 * .js`'s `line-joins-through-missing` and `line-missing-tick-gone` injections prove both
 * halves separately — a fixed line with no tick, or a tick with no break, is still wrong).
 *
 * A THIRD DATA SERIES, DEEP-LINK LANDINGS (2026-09-20), draws the same way as pageloads and
 * landing visits — its own `dataLine` call, its own point markers, no second axis and no
 * rescale (see `barChart`'s header for why: the honest picture is a series hugging zero at
 * 0-2/day against pageloads in the tens).
 *
 * `partial` (today, live) and `coarse` (Cloudflare-rounded) are per-day facts that must
 * survive the shape change: drawn on the POINT MARKER, same convention as the bar — a
 * hollow ring for partial, reduced opacity for coarse — never solid, never folded away.
 *
 * `partialMissing` HAS NO EQUIVALENT HERE. It marked a WEEKLY BUCKET where some but not all
 * of the folded days were uncaptured — a fact about a sum. A line's points are never
 * summed, so see `bucketDays`' header for where that logic (and the checks pinning it) went.
 *
 * X-AXIS LABELS are thinned to roughly `LABEL_TARGET` across the window — every label at 30
 * days is already tight, at 90 or 400 it is unreadable — so only every `lineLabelStride`-th
 * day is labelled, plus the LAST day always, so the window's end is never the one label a
 * stride happens to skip. The stride is also what the caller's legend prints, so the
 * spacing is stated, not left for the reader to count.
 */
const LABEL_TARGET = 12;

// Exported so `analytics.js` can state the spacing in the legend using the SAME number
// this function draws with, rather than a second guess that could silently drift from it.
export function lineLabelStride(n) {
  return Math.max(1, Math.ceil((n || 1) / LABEL_TARGET));
}

export function lineChart(rows, opts) {
  opts = opts || {};
  if (!rows || rows.length < 2) return '';
  const labelA = opts.labelA || 'A', labelB = opts.labelB || 'B', labelC = opts.labelC || 'C';
  // The GUTTER label falls back to labelC; pass labelCShort when labelC will not fit PADR.
  const labelCShort = opts.labelCShort || labelC;
  const labelGhost = opts.labelGhost || 'prior period';
  const W = 720, H = 190, PADL = 34, PADR = 96, PADT = 12, PADB = 26;
  const plotW = W - PADL - PADR, plotH = H - PADT - PADB;
  const max = Math.max(1, ...rows.map((r) => Math.max(
    r.missing ? 0 : (r.pageloads || 0), r.missing ? 0 : (r.visits || 0),
    r.missing ? 0 : (r.deepLink || 0), r.ghost || 0)));
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / pow) * pow;
  const n = rows.length;
  const slot = plotW / n;
  const y = (v) => PADT + plotH - (v / top) * plotH;
  const xMid = (i) => PADL + i * slot + slot / 2;
  const stride = lineLabelStride(n);
  const dayLbl = (r) => r.day.slice(5) + ' ' + dow(r.day);

  let g = '';
  [0, top].forEach((v) => {
    g += '<line x1="' + PADL + '" y1="' + y(v) + '" x2="' + (PADL + plotW) + '" y2="' + y(v)
      + '" stroke="#1c2531" stroke-width="1"/>'
      + '<text x="' + (PADL - 6) + '" y="' + (y(v) + 4) + '" fill="#8fa2b3" font-size="10" '
      + 'text-anchor="end">' + v + '</text>';
  });

  // Baseline ticks for every MISSING day, drawn first so a marker at the same x is never
  // hidden under one — same visual language as barChart's own missing-bucket tick, just
  // narrower to fit a much tighter slot.
  rows.forEach((r, i) => {
    if (!r.missing) return;
    g += '<line x1="' + (xMid(i) - 3) + '" y1="' + (PADT + plotH) + '" x2="' + (xMid(i) + 3)
      + '" y2="' + (PADT + plotH) + '" stroke="#8fa2b3" stroke-width="3" stroke-dasharray="2,2">'
      + '<title>' + esc(dayLbl(r)) + ' — no data captured</title></line>';
  });

  // One series line per CONTIGUOUS run of non-missing days — a missing day breaks the line
  // instead of being interpolated across as a drop to zero — plus a point marker per day
  // carrying the same partial/coarse status the bar chart puts on a bar.
  const dataLine = (valueKey, color, seriesLabel) => {
    const segs = []; let cur = [];
    rows.forEach((r, i) => {
      if (r.missing) { if (cur.length > 1) segs.push(cur); cur = []; return; }
      cur.push(xMid(i) + ',' + y(r[valueKey] || 0).toFixed(1));
    });
    if (cur.length > 1) segs.push(cur);
    let out = segs.map((pts) => '<polyline points="' + pts.join(' ') + '" fill="none" stroke="'
      + color + '" stroke-width="2"/>').join('');
    rows.forEach((r, i) => {
      if (r.missing) return;
      const v = r[valueKey] || 0;
      const style = r.partial ? 'fill="none" stroke="' + color + '" stroke-width="2"'
        : 'fill="' + color + '"' + (r.coarse ? ' fill-opacity="0.45"' : '');
      const flag = r.partial ? ' (today, partial)' : r.coarse ? coarseFlag(r) : '';
      out += '<circle cx="' + xMid(i) + '" cy="' + y(v).toFixed(1) + '" r="2.5" ' + style + '>'
        + '<title>' + esc(dayLbl(r)) + ' — ' + esc(seriesLabel) + ': ' + v + flag + '</title></circle>';
    });
    return out;
  };
  g += dataLine('pageloads', SERIES[0].color, labelA);
  g += dataLine('visits', SERIES[1].color, labelB);
  g += dataLine('deepLink', SERIES[2].color, labelC);

  // Trend line — GHOST is the only one left; the 7-day trailing mean was removed 2026-09-20.
  const trendLine = (key, color, dashed) => {
    const segs = []; let cur = [];
    rows.forEach((r, i) => {
      const v = r[key];
      if (v == null) { if (cur.length > 1) segs.push(cur); cur = []; return; }
      cur.push(xMid(i) + ',' + y(v).toFixed(1));
    });
    if (cur.length > 1) segs.push(cur);
    return segs.map((pts) => '<polyline points="' + pts.join(' ') + '" fill="none" stroke="'
      + color + '" stroke-width="2"' + (dashed ? ' stroke-dasharray="5,4"' : '') + '/>').join('');
  };
  g += trendLine('ghost', GHOST_COLOR, true);

  // X-axis labels, thinned to roughly LABEL_TARGET across the window, plus the LAST day
  // always — a stride that would otherwise skip the window's own end point.
  /* AND THE LABEL BEFORE THE LAST IS DROPPED WHEN THE TWO WOULD COLLIDE. Forcing the final
   * label while also drawing every stride-th one puts two within one day of each other
   * whenever (n - 1) is not a multiple of the stride: MEASURED on an 18-day window at
   * stride 2, `09-17 Th` and `09-18 F` overprinted as `09-17 TH09-18 F`. The label is wider
   * than one day's slot, so anything inside two slots touches; the window's END is the one
   * worth keeping, so its neighbour gives way. Only a RENDER shows this -- the markup is
   * well-formed either way, which is why the check for it screenshots. */
  const lastForced = (n - 1) % stride !== 0;
  rows.forEach((r, i) => {
    if (i % stride !== 0 && i !== n - 1) return;
    if (lastForced && i !== n - 1 && (n - 1) - i < 2 * stride) return;
    g += '<text x="' + xMid(i) + '" y="' + (H - 8) + '" fill="#8fa2b3" '
      + 'font-size="10" text-anchor="middle">' + esc(dayLbl(r)) + '</text>';
  });

  // Direct labels at the right, collision-avoided exactly as barChart does — the DATA
  // series use the LAST NON-MISSING day, never the last row outright, so a window ending on
  // an uncaptured day does not plant a label at the y=0 baseline.
  let lastRow = null;
  for (let i = rows.length - 1; i >= 0; i--) if (!rows[i].missing) { lastRow = rows[i]; break; }
  const lastNonNull = (key) => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i][key] != null) return rows[i][key]; return null; };
  const labels = [];
  if (lastRow) {
    labels.push({ y: y(lastRow.pageloads || 0), color: SERIES[0].color, text: labelA });
    labels.push({ y: y(lastRow.visits || 0), color: SERIES[1].color, text: labelB });
    labels.push({ y: y(lastRow.deepLink || 0), color: SERIES[2].color, text: labelCShort });
  }
  const lg = lastNonNull('ghost'); if (lg != null) labels.push({ y: y(lg), color: GHOST_COLOR, text: labelGhost });
  labels.sort((p, q) => p.y - q.y);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < 11) labels[i].y = labels[i - 1].y + 11;
  }
  labels.forEach((l) => {
    g += '<text x="' + (PADL + plotW + 8) + '" y="' + (l.y + 4) + '" fill="' + l.color
      + '" font-size="11">' + esc(l.text) + '</text>';
  });

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:' + W
    + 'px;display:block;margin:0 0 8px" role="img" aria-label="'
    + esc(labelA + ', ' + labelB + ' and ' + labelC + ' per day') + '">' + g + '</svg>';
}

export function errBlock(message) {
  return '<p class="err">query failed: ' + esc(message) + '</p>';
}
