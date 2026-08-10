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

The client is gated (`test/run_telemetry.js`, 50 checks) but **nothing in this repo can
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
```

Then open the sim, answer **yes**, run a startup, close the tab, and check a row arrived.
A browser exercises the CORS preflight that curl above does not.

---

## Reading it

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

The bundle is the same structure the Dev tab downloads — `manifest`, `timeseries` (1 Hz),
`events`, `commands`, `performance`, `snapshot_end` — but WRAPPED for the wire: the stored
object is `{v, kind, note, bundle}`, so all of that sits under `.bundle` and the reporter's
typed `note` is at the top (`site/telemetry.js:248`).

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
