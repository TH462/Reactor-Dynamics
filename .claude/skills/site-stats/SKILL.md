---
name: site-stats
description: Pull live numbers from reactordynamics.com — visitors, top pages, referrers, in-sim usage, telemetry health. Use when asked "how many people", "what are they doing", "how's the site doing", "is telemetry working", or for any question about real traffic or player behaviour on the live site.
---

# Site stats

One command answers almost everything. **Run it before writing any query of your own.**

```bash
node tools/site_report.js                  # last 7 days, all three sections
node tools/site_report.js --days=30
node tools/site_report.js --only=traffic   # traffic | usage | health
node tools/site_report.js --json           # same numbers, machine-readable
```

It needs `CLOUDFLARE_API_TOKEN` in the environment. It is a **User** env var, so a
PowerShell session that predates it will not have it:

```powershell
$env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN","User")
```

No token → it exits 2 and prints how to make one. It never half-reports.

## What each section answers

| Section | Source | Answers |
|---|---|---|
| **TRAFFIC** | Web Analytics RUM (GraphQL) | how many visitors, which pages, referrers, countries, desktop vs mobile |
| **HEALTH** | `workersInvocationsAdaptive` (GraphQL) | did the telemetry Worker get hit, is it erroring |
| **USAGE** | Analytics Engine SQL | what players did at the board — starting IC, mode funnel, milestones, panels, controls, missions, session length |

**Bug report bundles are a different tool** — `tools/fetch_bug_reports.js`, which needs a
~20 s `wrangler dev --remote` spin-up. As of 2026-08-10 it lives on `workbench`/`backshop`
and not on `develop`.

## Reading the output honestly

- **`exact: yes` vs `±10` in TRAFFIC.** Past a ~7-day window Cloudflare answers from a
  coarser tier and rounds. **Use `--days=7` or less for a number you are going to quote.**
  Measured: the same two days read 7 + 13 pageloads at a 7-day span and 20 + 10 at 14 days.
- **`est` vs `raw` in USAGE.** `est` is `sum(_sample_interval)` — the estimate. `raw` is rows
  actually stored. The dataset samples even at low volume (149 vs 120 on 2026-08-10), so
  **`est` is the number to quote**.
- **Session counts are a FLOOR.** Sampling drops whole rows, so a session whose rows all got
  dropped is invisible. No weighting recovers it. Never say "exactly N players".
- **A missing `session_end` is not a crash** — the tab may still be open, or the unload beacon
  may not have flushed. Absence is not an ending.
- **Empty USAGE is not proof the pipeline is broken.** HEALTH answers "did anything arrive"
  from a different dataset; check it before concluding anything.

## Do not re-derive the queries

The traps are already encoded in the script's header comment. If you find yourself writing
raw SQL or GraphQL, read that header first — `uniq()`, `round()` and `quantile()` are all
422s, `ORDER BY` needs the alias not the raw double column, the SQL body is text/plain not
JSON, GraphQL returns errors inside a **200**, and the Cloudflare MCP cannot read the SQL
endpoint at all.

For a genuinely new question, use the escape hatches rather than a fresh transport:

```bash
node tools/site_report.js --sql="SELECT blob5 AS panel, sum(_sample_interval) AS est FROM reactor_dynamics_usage GROUP BY panel"
node tools/site_report.js --gql='{ viewer { accounts(filter: {accountTag: "…"}) { … } } }'
```

The AE column map is positional and lives in `worker/src/index.js`:
`blob1` event · `blob2` channel · `blob3` release · `blob4` session · `blob5` key ·
`blob6` plant · `double1` seconds · `double2` sim_seconds · `double3` mode · `double4` beat.

## Operational context

`C:\grok_build\RD_Ops\runbook.md` — account/zone/project ids, what is deployed where, the
Vercel rollback, and the traps that are about the site rather than the numbers. It is outside
every repo, so read it there; nothing in it can be committed.

## Reporting to the owner

US customary first with SI in parentheses where units apply. Lead with the number that
changed. Do not present a quantized figure as exact, and say when a window was too wide.
