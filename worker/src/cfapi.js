/* Cloudflare read APIs — the two transports the dashboard's analytics views use.
 *
 * Both are read over HTTPS with an account API token (Account Analytics / Read), held
 * as the `CF_ANALYTICS_TOKEN` Worker secret. The `EVENTS` binding in wrangler.toml is
 * WRITE-ONLY: a Worker cannot read its own Analytics Engine dataset through it, which
 * is the whole reason a token is involved.
 *
 * Query shapes are lifted from `tools/site_report.js`, the verified path — keep the two
 * in step rather than inventing a second dialect.
 *
 * Analytics Engine SQL is a SUBSET of SQL: no subqueries (`unsupported expression type`,
 * measured), and there is no parameter binding, so anything interpolated into a query
 * must be validated by shape at the call site.
 */

export const ACCOUNT = 'f6ee6be4ecfceb66a8a6b7b6ed26d286';
export const SITE_TAG = '283f126f6ff94319a638db77f6d0602b';
export const DATASET = 'reactor_dynamics_usage';

/* WHEN THE 2026-08-10 COLUMNS STARTED EXISTING. Any query over double5..8 or blob7
 * must carry `AND timestamp >= COLUMNS_SINCE`, and the -1 sentinel is NOT a substitute.
 *
 * The sentinel distinguishes "this client had no opinion" from "the plant allowed it".
 * It cannot distinguish either from a row written BEFORE the column existed, because a
 * short doubles array reads back as **0**, not null — measured on the live dataset:
 * rows from Alpha 1.5.1 report `min(double7) = 0` and `max(double5) = 0`, exactly like
 * a genuine "not blocked" with a page-load stamp of zero. So `double7 >= 0` alone
 * silently drags every historical row into the denominator and understates every rate.
 *
 * Set to the first row PROVEN to carry the columns rather than to the deploy minute,
 * so it errs toward dropping a few real rows instead of admitting fake zeros.
 *
 * This constant has a real expiry: Analytics Engine retention is a fixed three months,
 * so once no row older than 2026-11-11 survives, every remaining row carries the
 * columns and this filter can be deleted outright.
 */
export const COLUMNS_SINCE_TS = '2026-08-11 02:54:00';
// SQL form. `timestamp >= '<string>'` is a 422 — "cannot combine the DateTime and
// String types with the >= operator" — so the cast is required, not decorative.
export const COLUMNS_SINCE = `toDateTime('${COLUMNS_SINCE_TS}')`;

export async function sql(token, q) {
  const res = await fetch(
    'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT + '/analytics_engine/sql',
    { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'text/plain' }, body: q }
  );
  const text = await res.text();
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + text.slice(0, 200).trim());
  let j;
  try { j = JSON.parse(text); } catch (e) { throw new Error('unparseable response: ' + text.slice(0, 120)); }
  return j.data || [];
}

export async function gql(token, query) {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const j = await res.json().catch(() => null);
  if (!j) throw new Error('HTTP ' + res.status + ': unparseable response');
  // A bad GraphQL query is a 200 with an errors array — the status never tells you.
  if (j.errors && j.errors.length) throw new Error(j.errors.map((e) => e.message).join('; ').slice(0, 200));
  const accts = ((j.data || {}).viewer || {}).accounts || [];
  return accts[0] || {};
}
