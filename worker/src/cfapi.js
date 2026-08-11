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
