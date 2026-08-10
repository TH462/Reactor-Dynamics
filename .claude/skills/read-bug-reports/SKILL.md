---
name: read-bug-reports
description: Pull and read the in-sim bug reports players send from the sim's Report a Problem form. Use when asked to "check the feedback", "did my report come through", "any bug reports?", "read the latest report", "see if you can see it" after someone sends one, or when triaging a reported defect that has a session recording behind it.
---

# Reading the in-sim bug reports

A player who hits **Report a Problem** in the sim POSTs a gzipped session recording to the
telemetry Worker, which puts it in the R2 bucket `reactor-dynamics-bundles` under
`bundles/<date>/<id>.json.gz`. This skill gets it back out and turns it into a diagnosis.

## 1. Pull it

```bash
node tools/fetch_bug_reports.js            # list every report, newest first
node tools/fetch_bug_reports.js --latest   # download the newest and summarise it
node tools/fetch_bug_reports.js --all      # download everything not already local
node tools/fetch_bug_reports.js --get=<id> # one report, by id fragment or full key
node tools/fetch_bug_reports.js --full     # plus every set_speed and every alarm clear
```

It takes ~20 s: there is no way to list an R2 bucket from the CLI, so the tool stands up a
throwaway Worker under `wrangler dev --remote`, reads through it, and tears it down. Nothing
is deployed and it needs no API token — wrangler's existing login is enough.

**If it says wrangler is not logged in**, ask the owner to run `npx wrangler login` with the
`!` prefix. It is interactive; you cannot run it.

## 2. Where the file lands, and why not in the repo

`C:\grok_build\RD_Ops\bug-reports\<date>_<id>.json` — outside every worktree, so a report
cannot be swept into a commit. **A report carries a player's typed words.** Summarise it,
quote what is technically relevant, and do not paste the whole thing into a public GitHub
issue without a reason. `--read=<path>` re-summarises a saved file with no network at all.

## 3. Read it

The summary leads with the reporter's **NOTE** — their words are the only part of the bundle
that says what they *thought* went wrong, and it is often the only statement of the actual
complaint. Everything under it is evidence for or against that statement:

| in the bundle | what it answers |
|---|---|
| `note` | what they think happened |
| `manifest` | which plant, which IC, which scenario, the seed — enough to reproduce |
| `commands` | what they actually did, with `blocked` / `error` flags |
| `events` | alarms, scrams and trip reasons on the plant clock |
| `timeseries` | 1 Hz true-state history — the shape of the transient |
| `performance` | fps and render/step percentiles, for "it flickers on my PC" |
| `snapshot_end` | the full engine state at the moment they reported |

**The bundle is NESTED**: the stored object is `{v, kind, note, bundle}` and everything above
except `note` is one level down under `.bundle`. Ad-hoc `jq` against the flat shape reads
`null` and looks like an empty report.

## 4. Then treat it like any other claim

A report is a **symptom, not a diagnosis** — HR9 and HR12 both apply. The reporter saw the
board; they did not see the engine. Reproduce from the manifest (plant, IC, seed, and the
commands with their timestamps), measure, and only then say what the defect is. If it is
real, file it with the report id in the body so the recording can be found again — the
reporter is never told the id, so the id in your issue is the only handle on it.
