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

export function html(body, status) {
  return new Response(body, {
    status: status || 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
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
</style>`;

export function nav(token, current) {
  const link = (view, label) => {
    const href = '?token=' + encodeURIComponent(token) + (view ? '&view=' + view : '');
    return '<a class="' + (current === view ? 'on' : '') + '" href="' + href + '">' + label + '</a>';
  };
  return '<nav>' + link('', 'Bug reports') + link('analytics', 'Analytics')
    + link('sessions', 'Sessions') + link('features', 'Features') + '</nav>';
}

// A table that does not lie about an empty result — "(none)" rather than a blank frame.
// `cols` entries are {key, label, num?}; rows are plain objects.
export function table(rows, cols) {
  if (!rows || !rows.length) return '<p class="muted">(none)</p>';
  const head = cols.map((c) => '<th' + (c.num ? ' class="num"' : '') + '>' + esc(c.label) + '</th>').join('');
  const body = rows.map((r) =>
    '<tr>' + cols.map((c) =>
      '<td' + (c.num ? ' class="num"' : '') + '>' + esc(r[c.key]) + '</td>').join('') + '</tr>'
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
 * THE PALETTE IS COMPUTED, NOT CHOSEN. Two categorical slots for two series, validated
 * against this page's dark surface — blue #3987e5 and orange #d95926, worst adjacent CVD
 * separation ΔE 26.8 (protan) and 31.8 for normal vision. The first pair tried by eye
 * (this page's own link blue against a violet) FAILED at ΔE 3.0 deutan: indistinguishable
 * to a red-green colourblind reader, and only 12.2 to everyone else. Do not substitute
 * hexes here without re-running that check.
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
];

export function barChart(rows, opts) {
  opts = opts || {};
  if (!rows || rows.length < 2) return '';          // one bar is a number, not a chart
  const labelA = opts.labelA || 'A', labelB = opts.labelB || 'B';
  const W = 720, H = 190, PADL = 34, PADR = 96, PADT = 12, PADB = 26;
  const plotW = W - PADL - PADR, plotH = H - PADT - PADB;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.a || 0, r.b || 0)));
  /* A ceiling on a "nice" number, so the gridline reads as a round figure rather than as
   * whatever the tallest bar happened to be. */
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / pow) * pow;
  const slot = plotW / rows.length;
  const barW = Math.max(3, Math.min(18, slot / 2 - 3));   // 2px+ of surface between bars
  const y = (v) => PADT + plotH - (v / top) * plotH;

  let g = '';
  // Recessive grid: two lines and their labels, in muted ink, behind everything.
  [0, top].forEach((v) => {
    g += '<line x1="' + PADL + '" y1="' + y(v) + '" x2="' + (PADL + plotW) + '" y2="' + y(v)
      + '" stroke="#1c2531" stroke-width="1"/>'
      + '<text x="' + (PADL - 6) + '" y="' + (y(v) + 4) + '" fill="#8fa2b3" font-size="10" '
      + 'text-anchor="end">' + v + '</text>';
  });
  rows.forEach((r, i) => {
    const x0 = PADL + i * slot + (slot - barW * 2 - 2) / 2;
    SERIES.forEach((s, si) => {
      const v = r[s.key] || 0;
      const h = Math.max(v > 0 ? 2 : 0, (v / top) * plotH);
      if (!h) return;
      const x = x0 + si * (barW + 2);
      g += '<rect x="' + x + '" y="' + (PADT + plotH - h) + '" width="' + barW + '" height="' + h
        + '" rx="3" fill="' + s.color + '">'
        + '<title>' + esc(r.label) + ' — ' + esc(si === 0 ? labelA : labelB) + ': ' + v + '</title>'
        + '</rect>';
    });
    g += '<text x="' + (PADL + i * slot + slot / 2) + '" y="' + (H - 8) + '" fill="#8fa2b3" '
      + 'font-size="10" text-anchor="middle">' + esc(r.label) + '</text>';
  });
  // Direct labels at the right, so identity survives a greyscale print or a CVD reader.
  const last = rows[rows.length - 1] || {};
  g += '<text x="' + (PADL + plotW + 8) + '" y="' + (y(last.a || 0) + 4) + '" fill="'
    + SERIES[0].color + '" font-size="11">' + esc(labelA) + '</text>'
    + '<text x="' + (PADL + plotW + 8) + '" y="' + (y(last.b || 0) + 4) + '" fill="'
    + SERIES[1].color + '" font-size="11">' + esc(labelB) + '</text>';

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:' + W
    + 'px;display:block;margin:0 0 8px" role="img" aria-label="'
    + esc(labelA + ' and ' + labelB + ' per ' + (opts.bucket || 'period')) + '">' + g + '</svg>';
}

/* Fold a list of {date,pageloads,visits} Eastern days into the chart's rows. Weekly once
 * there is more than a week to show — see barChart's header for why. The oldest bucket is
 * marked when it is short, for the same reason `dayLabel` marks a partial day: a short
 * bucket and a quiet week are the same bar without it. */
export function bucketDays(dayRows, days) {
  if (!dayRows || !dayRows.length) return { rows: [], bucket: 'day' };
  if (days <= 7) {
    return { rows: dayRows.map((r) => ({ label: (r.date || '').slice(5),
                                         a: r.pageloads, b: r.visits })), bucket: 'day' };
  }
  const out = [];
  for (let end = dayRows.length; end > 0; end -= 7) {
    const start = Math.max(0, end - 7);
    const week = dayRows.slice(start, end);
    out.unshift({
      label: (week[0].date || '').slice(5) + (week.length < 7 ? '*' : ''),
      a: week.reduce((s, r) => s + (r.pageloads || 0), 0),
      b: week.reduce((s, r) => s + (r.visits || 0), 0),
      short: week.length < 7,
    });
  }
  return { rows: out, bucket: 'week' };
}

export function errBlock(message) {
  return '<p class="err">query failed: ' + esc(message) + '</p>';
}
