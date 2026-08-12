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
// STILL UTC, DELIBERATELY. This is the helper for DAY BUCKETS — rows the upstream API
// already grouped by UTC calendar day. Point-in-time stamps use `etWithDow` below; see
// the note there for why the two must not be swapped.
export function withDow(s) {
  const w = dow(s);
  return w ? String(s) + ' ' + w : String(s == null ? '' : s);
}

/* ---------------------------------------------------------------- Eastern time
 *
 * The dashboard reads EASTERN, because a person reads it (owner request, 2026-08-12).
 * STORAGE AND QUERIES STAY UTC and must: Analytics Engine stores UTC, the SQL windows
 * are built in UTC, and the R2 bundle keys are UTC day prefixes. Only the presentation
 * of an INSTANT is converted.
 *
 * WHAT IS NOT CONVERTED, AND WHY IT WOULD BE WRONG TO. The daily traffic table is
 * bucketed by the upstream API on UTC calendar days. Relabelling those rows "ET" would
 * be a lie about their contents: the row marked 2026-08-11 holds UTC 00:00–24:00, which
 * is 20:00 on the 10th to 20:00 on the 11th in Eastern. Converting a bucket's LABEL
 * without re-grouping the QUERY silently shifts every count by four or five hours into
 * the neighbouring day. That column stays UTC and now says so in its header.
 *
 * DST IS HANDLED BY THE ZONE, NOT BY ARITHMETIC — `America/New_York`, so EST and EDT
 * switch themselves. A fixed −5 (or −4) offset would be right for half the year, which
 * is the failure mode worth naming: it reads correct in testing and drifts an hour in
 * March. `Intl` is available in Workers; nothing extra is loaded.
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

export function errBlock(message) {
  return '<p class="err">query failed: ' + esc(message) + '</p>';
}
