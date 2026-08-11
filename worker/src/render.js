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
export function withDow(s) {
  const w = dow(s);
  return w ? String(s) + ' ' + w : String(s == null ? '' : s);
}

// Whole seconds -> "45s" / "3m 12s" / "11h 34m". Never a bare decimal: these are read
// at a glance and "0.05 h" is not a glance.
export function dur(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  return Math.floor(s / 3600) + 'h ' + Math.round((s % 3600) / 60) + 'm';
}

export function html(body, status) {
  return new Response(body, {
    status: status || 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export const PAGE_HEAD = `<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { background:#0b0f14; color:#d7e0e8; font:14px/1.5 -apple-system,Segoe UI,sans-serif; margin:0; padding:24px; }
  a { color:#5fb3d9; }
  h1 { font-size:18px; margin:0 0 16px; }
  h2 { font-size:14px; color:#8fa2b3; text-transform:uppercase; margin:0 0 8px; }
  table { border-collapse:collapse; width:100%; }
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
