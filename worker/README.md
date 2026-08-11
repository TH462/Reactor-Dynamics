# Usage-data receiver

The server half of "what do people actually do in the sim". Deployed **separately from
the site** — the site is Cloudflare Pages, this is a Worker.

The client is `site/telemetry.js`; read the invariants at the top of that file first.
Between them they make the promises on `privacy.html`. **If you change what is kept
here, change that page in the same commit.**

---

## Setup, once

```bash
cd worker
npm i -g wrangler        # if you do not have it
wrangler login

wrangler r2 bucket create reactor-dynamics-bundles
wrangler deploy
```

The Analytics Engine dataset and the rate-limit namespace are created on first use —
there is nothing to provision for either.

Then set a **lifecycle rule** on the bucket so recordings expire. 90 days matches the
three months Analytics Engine keeps events, so the two halves of the data age out
together:

```bash
wrangler r2 bucket lifecycle add reactor-dynamics-bundles \
  --name expire-bundles --prefix bundles/ --expire-days 90
```

Finally, point the site at it. In the **Pages** project (not this Worker), add a build
environment variable:

```
RD_TELEMETRY_ENDPOINT = https://reactor-dynamics-telemetry.<your-subdomain>.workers.dev
```

`site/stamp_version.js` stamps it into `site/telemetry_endpoint.js` at build. **Until
that variable is set, the whole feature is dormant**: the consent prompt never opens,
the in-sim report form stays hidden, and nothing is collected. That is deliberate —
the safe state is the one that needs no action.

---

## Checking it works

The client is gated (`test/run_telemetry.js`, 103 checks — read the count off the runner,
not off this line, which said 50 for a gate that had reached 84) but **nothing in this repo can
test the server**. Treat the first deploy as a test:

```bash
# an event batch — expect 204
curl -i -X POST "$EP" -H 'Origin: https://reactordynamics.com' \
  -d '{"v":1,"session":"test","channel":"dev","release":"Alpha 1.3.0",
       "events":[{"e":"session_start","p":{"plant":"pwr","initial_state":"cold_shutdown"}}]}'

# a bundle — expect {"ok":true,"id":"..."}
echo '{"kind":"test"}' | gzip | curl -i -X POST "$EP?kind=bundle" \
  -H 'Origin: https://reactordynamics.com' -H 'Content-Type: application/json' \
  -H 'Content-Encoding: gzip' --data-binary @-

# the size cap — expect 413
head -c 3000000 /dev/zero | curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST "$EP?kind=bundle" -H 'Origin: https://reactordynamics.com' --data-binary @-

# EVERY ORIGIN IN ALLOWED_ORIGINS, not just the live one — expect 204 from each.
# An empty `events` array writes NOTHING, so this is safe to run against production.
for O in https://reactordynamics.com https://www.reactordynamics.com \
         https://develop.reactor-dynamics.pages.dev; do
  printf '%s -> ' "$O"
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "$EP" \
    -H "Origin: $O" -H 'Content-Type: application/json' -d '{"events":[]}'
done
```

**Run that loop over the WHOLE list, every time.** Until 2026-08-09 every smoke test above
used the live origin only — the one that was always going to work — so nobody exercised the
test site, whose entry named `dev.reactordynamics.com`, a subdomain that was planned during
the Cloudflare migration and never created. Measured then: the test-site origin got
`403 origin not allowed` while the live one got `204`, and the preflight handed the test site
`Access-Control-Allow-Origin: https://reactordynamics.com`, so a browser blocked the response
regardless of status. Every bug report and event from the test site had been discarded
silently — and a checklist that only tests the passing case cannot see that, ever. (#413)

Then open the sim, answer **yes**, run a startup, close the tab, and check a row arrived.
A browser exercises the CORS preflight that curl above does not.

---

## The ops dashboard

`GET /dashboard?token=T` — a read-only viewer, gated by a shared-secret token instead of
the CORS origin check the ingestion routes use. Two views:

| | |
|---|---|
| `?token=T` | **Bug reports** — the R2 bundles, newest first, with a detail view per report and `&raw=1` for the JSON. `src/dashboard.js` |
| `?token=T&view=analytics` | **Analytics** — Web Analytics traffic + in-sim usage, `&days=7\|14\|30`. `src/analytics.js` |
| `?token=T&view=sessions` | **Sessions** — one row per session; click through to its ordered event trace. `src/sessions.js` |
| `?token=T&view=features` | **Features** — what the live sim gates, and the control that changes it. `src/features.js` |

Set the token once, as a Worker secret (never a repo file, never RD_Ops — that directory
syncs off-site and is deliberately secret-free):

```bash
cd worker
wrangler secret put DASHBOARD_TOKEN   # paste a random value when prompted
```

The analytics view needs a **second** secret, because the `EVENTS` binding is write-only —
**a Worker cannot read its own Analytics Engine dataset through the binding.** Both the SQL
API and the RUM GraphQL API are read over HTTPS with an account token (Account Analytics /
Read — the same one `tools/site_report.js` uses):

```bash
wrangler secret put CF_ANALYTICS_TOKEN
```

Without it the analytics view still loads and says which secret is missing, rather than
rendering an empty page that looks like zero traffic. The bug-report view does not need it.

**The session view still cannot answer "they never pressed X."** Its limits are in the
header of `src/sessions.js`: the rows are **sampled** (measured 2026-08-10: `command`
stored 42 raw against 64 estimated — a third of the presses are not there), a session is
a **tab** rather than a sitting (one live session spans 14:02 to 00:36 the next day;
`session_end` is missing for half of them), and **-1 is "not reported", never a zero**.
The complete record of one session exists only where somebody filed a bug report — that
bundle carries every command with its own timestamp.

**Ordering within a batch is solved** as of 2026-08-10. Each event carries `t_page`, and
the view sorts by the batch write time first and the client stamp within it. Verified in
a real browser against the preview site: six events sharing one write time of 03:11:51,
ordered 0:01 / 0:01 / 0:01 / 0:05 / 0:06 / 0:06. `t_page` resets on reload while the
session id survives one, so a **drop** in it is a positive detection of a page reload and
the view draws a band there rather than letting a backwards clock read as noise.

### Analytics Engine SQL, the parts that bite

All of these fail at **422** rather than degrading, and two of them produce the *same*
message from different causes:

- **No subqueries** (`unsupported expression type`).
- **`max()` refuses a String column** (`cannot use the String type as argument 1`), and
  there is no `any()`/`argMax()`. String columns come from a second query keyed on the
  event that carries them, never from an aggregate.
- **Columns are typed PER RESULT SET.** If no row matching the WHERE clause carries
  `double6`, naming it at all is `unable to find type of column` — so a session made
  entirely of pre-column rows cannot mention the new columns. Ask first whether any
  qualifying row exists; a try/catch would swallow every other 422 with it.
- **`ORDER BY` resolves against the SELECT PROJECTION**, not the table. `ORDER BY double6`
  is a 422 on the same query whose SELECT reads `double6 AS t_sess` — the projection is
  called `t_sess`. Same message for `ORDER BY timestamp` the moment `timestamp` leaves
  the SELECT list, which is what pinned the rule down.
- **`timestamp >= '<string>'`** is a 422; the `toDateTime()` cast is required.

### Feature flags: the dashboard sets them, the BUILD applies them

`GET /flags-stages` (open, unauthenticated) returns the queued stages;
`site/stamp_version.js` fetches it at build and freezes the result into the generated
`site/channel.js` as `RD_FLAG_STAGES`, which `site/flags.js` reads in place of its own
literals. Writes are a form POST to the dashboard behind `DASHBOARD_TOKEN`.

**A change is queued, not live — it ships on the next deploy of `main`.** That is a
consequence of the offline promise, not an oversight: the sim must load nothing at
runtime (`test/run_portable.js`), which is the only reason the emailable single-file
build works, and the offline download could not honour a runtime value anyway.

The read is open because a stage is **not a secret** — every one ships inside `flags.js`
to every visitor — so gating it would protect nothing while forcing a token into the
Pages build environment.

**`free_play` and `manual` cannot be set below `public`**, refused by the dashboard *and*
ignored by `flags.js`. `run_flags.js` already forbids it in source; a remote control able
to do what the gate forbids would make that gate decorative.

**Not active until `RD_FLAGS_ENDPOINT` is set in the Pages build environment.** Unset,
the stamper writes an empty map and records `RD_FLAG_SOURCE = "none"` — today's exact
behaviour. A failed fetch is the same fallback but records `"fallback"` and warns in the
build log, because a deploy that silently discarded a queued change would be worse than
one that says it did.

### A row older than a column reads back as 0, not -1

The receiver writes `-1` for "this client had no opinion". That cannot help with a row
written *before* the column existed: a short `doubles` array reads back as **0**, exactly
like a genuine "not blocked". Measured — Alpha 1.5.1 rows report `min(double7) = 0` and
`max(double5) = 0`. So every query over a new column needs **both** `>= 0` **and**
`timestamp >= COLUMNS_SINCE` (`src/cfapi.js`), and that constant has a real expiry:
three-month retention means it can be deleted once nothing older than 2026-11-11 survives.

**The two sampling conventions are opposite** and the header of `src/analytics.js` is the
long version: Analytics Engine `count()` undercounts (use `sum(_sample_interval)`), RUM
`count` is already sample-adjusted (never multiply it), and a window over 7 days is answered
from a coarser tier — measured on the live account, 7d reads an exact 29 pageloads where 30d
reads 40, rounded to the nearest 10. Every RUM row carries the interval it was answered at
and the page warns when the window crossed the seam.

If wrangler auths via a scoped `CLOUDFLARE_API_TOKEN` in the environment (Analytics-read
only, per `RD_Ops/runbook.md`), that token lacks permission to write Worker secrets —
unset it for this one command so wrangler falls back to its own OAuth login:
`env -u CLOUDFLARE_API_TOKEN wrangler secret put DASHBOARD_TOKEN`.

Bookmark `https://reactor-dynamics-telemetry.<subdomain>.workers.dev/dashboard?token=<T>`
— that URL is the credential. Rotating it is just `secret put` again followed by
`wrangler deploy`.

### Bug reports

```bash
node tools/fetch_bug_reports.js            # list every report, newest first
node tools/fetch_bug_reports.js --latest   # download the newest and summarise it
```

**Do not reach for `wrangler r2 object …` here.** There is no CLI way to LIST an R2
bucket — `r2 object` has only `get`/`put`/`delete`, and a key is `<base36 ms>-<8 random
chars>`, so `get` has nothing to be pointed at. This file and `RD_Ops/runbook.md` both
documented a `wrangler r2 object list` that has never existed, which is how the first real
report arrived with no way to read it (2026-08-10). `tools/fetch_bug_reports.js` runs a
throwaway reader Worker under `wrangler dev --remote` instead; its header explains why that
is the only route that needs no new credential.

The bundle is the same structure the Dev tab downloads — `manifest`, `timeseries`, `events`,
`commands`, `performance`, `snapshot_end` — but WRAPPED for the wire: the stored object is
`{v, kind, note, bundle}`, so all of that sits under `.bundle` and the reporter's typed
`note` is at the top (`site/telemetry.js:248`).

**`timeseries` is COLUMNAR from schema 1.1** — `{fields, t, accel, v[], lo[], hi[]}`, one
inner array per field, with `lo`/`hi` the min/max over each sample's interval. Schema 1.0 was
an array of row objects with `true_<field>` keys, ONE POINT SAMPLE PER BROADCAST and no
extremes, under a manifest that always claimed `sample_hz: 1` — so a bundle from a
fast-forwarded session had 180 s between rows and a whole LOCA could fall between two of them
(#432). There is no `sample_hz` any more and no scalar replaced it: the grid moves with
acceleration inside one session, so the row timestamps are the only honest answer, and
`manifest.sampling` declares just the floor and the source. `tools/fetch_bug_reports.js`
reads both versions and prints the derived rate.

### The questions this was built to answer

Query Analytics Engine over the SQL API. `blob1` is the event name — the column map
is documented in `src/index.js` and is **append-only**, because position is the schema.

**Where do people stop?** The single most useful query here.

```sql
SELECT blob5 AS last_panel, COUNT() AS sessions, AVG(double1) AS median_seconds
FROM reactor_dynamics_usage
WHERE blob1 = 'session_end' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY last_panel ORDER BY sessions DESC
```

**How far through a startup do they get?** Mode 5 → 3 → 2 → 1. A cliff between two
modes is a part of the plant that is too hard, stated as a number.

```sql
SELECT double3 AS mode, COUNT(DISTINCT blob4) AS sessions_reaching
FROM reactor_dynamics_usage
WHERE blob1 = 'plant_mode' GROUP BY mode ORDER BY mode DESC
```

**Which controls does nobody touch?** Compare against the board: a control with zero
rows is either undiscoverable or pointless, and the two need different fixes.

```sql
SELECT blob5 AS action, COUNT() AS uses, COUNT(DISTINCT blob4) AS sessions
FROM reactor_dynamics_usage
WHERE blob1 = 'command' GROUP BY action ORDER BY uses ASC
```

**Do missions get finished?**

```sql
SELECT blob5 AS mission,
       countIf(blob1 = 'mission_start')    AS started,
       countIf(blob1 = 'mission_complete') AS completed,
       countIf(blob1 = 'mission_abandon')  AS abandoned
FROM reactor_dynamics_usage
WHERE blob1 LIKE 'mission_%' GROUP BY mission ORDER BY started DESC
```

---

## Two things that will bite

**Position is the schema.** Analytics Engine has none, and Cloudflare's docs require
values "in consistent order across all writes". Adding a field means taking the next
free slot. Reordering or reusing one silently mixes old and new rows in every query
already written — no migration, no error, just numbers that quietly stop meaning what
they say.

**A bundle is not an event.** Session recordings are 63 KB–504 KB gzipped; the
Analytics Engine blob cap is 16 KB per data point, which a 30-minute session exceeds
by 44×. That is why there are two stores, and why they must not be merged for tidiness.
