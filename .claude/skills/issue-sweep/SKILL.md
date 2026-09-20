---
name: issue-sweep
description: Sweep the open GitHub issues for ones that are no longer worth doing — filed against code that has since been replaced, already fixed, self-cancelling, or an umbrella whose children all closed — and propose closes with a verified reason for each. Use at a release, after an engine or subsystem is replaced, or when the open count has grown past what anyone reads. Never auto-closes.
---

# Issue sweep

The filing bar in `CLAUDE.md` stops issues being born unnecessary. **Nothing stops one going
stale**, because an issue cannot know the code under it was deleted. This skill is the other
half, and the two failures need different treatment:

| | how it happens | what catches it |
|---|---|---|
| **Born unnecessary** | a finding that should have been a `TUNING_LOG` line | the filing bar |
| **Went stale** | the code under it was replaced, or its fix landed and nobody closed it | **this sweep** |

Measured 2026-09-20 on a 131-issue backlog: **34 were not worth doing, and 20 of those had gone
stale rather than being filed badly.** Nine audited a physics engine that had been replaced five
weeks earlier.

## When to run it

**Not on a calendar.** A date-based sweep runs many times and finds nothing on most of them.
Issues go stale when the code under them moves, so run it where that happens:

- **At a release** — you are reviewing what shipped anyway.
- **After any engine, layer or subsystem is REPLACED** (not merely changed). The PWR2 rebuild is
  what stranded 9 of the 34.
- **When the open count has grown past what anyone reads.** If nobody can hold the list in their
  head, the list has stopped being a work queue.

## What it must not do

- **Never close anything without the owner's word.** Produce the list and the reasons; he decides.
  A close is outward-facing on a public repo.
- **Never touch an issue carrying `status-owner-review`, `status-needs-ruling`, `status-work-next`
  or `status-on-hold`** — those are the owner's, whatever else is true of them. An issue marked
  `status-work-complete` AND `status-owner-review` still needs his eyes.
- **Never judge from the title.** Titles in this repo are essays and read as more current than
  they are. Verify against the tree.

## The procedure

**1. Pull the list with labels, dates and comment counts.**

```
gh issue list --repo TH462/Reactor-Dynamics --state open --limit 300 \
  --json number,title,labels,createdAt,comments \
  --jq '.[] | "\(.number)\t\(.createdAt[0:10])\tc=\(.comments|length)\t\([.labels[].name]|join(","))\t\(.title)"'
```

**2. Set aside the owner's.** Anything with a `status-*` marker from the list above comes out of
the pool untouched, as does anything he authored himself (no `Claude` label — check, do not
assume).

**3. Close the ones already marked `status-work-complete`** that do NOT also carry
`status-owner-review`. That label means built, gated, nothing left on the issue.

**4. Verify the rest against the tree, in parallel.** Delegate slices to subagents — this is the
expensive half and it is what makes the sweep trustworthy. Each slice reports per issue, facts
only, no worth judgement (that is the coordinator's):

- **CLAIM** — one line.
- **STILL TRUE / FIXED-ALREADY / RETIRED-SUBSYSTEM-ONLY / COULD-NOT-CHECK**, with the evidence
  where it was checked. Name the commit or the code for a FIXED-ALREADY.
- **PLAYER-VISIBLE?** — YES (say how they would hit it) / NO (internal, test-only, doc-only) /
  ONLY-VIA-FAILURE-INJECTION.
- **SIZE** — one-line fix / a few files / a design change.

Give each slice a tool-call ceiling and tell it explicitly: *read-only, do not edit, do not
comment on or close any issue.*

**5. Sort into buckets, and give every bucket a reason that is checkable.** The five that came
out of the first run:

- **Audits a replaced subsystem** — the finding cannot be acted on as written.
- **Already fixed, ruled, or self-cancelling** — including the issue whose own body concludes
  nothing should change.
- **Test-only, no player consequence** — the filing bar's own test, applied retrospectively.
- **Superseded process docs** — the practice is already in `CLAUDE.md`.
- **Umbrellas whose residue is separately open** — close the container, keep the children, and
  **name the open children in the closing comment** so the thread is still followable.

**6. Check the remainder for DUPLICATES and MERGES before proposing any work.** Cluster by topic
(`grep -i` the title list for the subsystem names). The first run found two issues for one
pressurizer change and three for one writing-style job.

**7. Put the buckets to the owner with a recommendation**, per `SOP.md` §5 — what he is deciding,
the options, your recommendation, and why. On his word, close with the bucket's reason recorded
on each issue.

## What the first run learned

- **The split is roughly half and half**, and only one half is a filing problem. Report both
  numbers: a bar alone will not fix the stale ones and a sweep alone will not stop new ones.
- **An issue's own body is evidence.** Six concluded that nothing should change; two were titled
  `ANSWER:`. Read the conclusion before checking the code.
- **A path is not a subsystem.** `engines/pwr/pwr_instruments.js` LOOKS retired and is reused
  unchanged by the current engine (`pwr2_shell.js`: *"it consumes published truth"*). Grep for who
  requires a file before calling anything dead — nine issues were correctly closed as
  retired-engine work and one nearly went with them that was live.
- **Check what the player can actually reach.** `site/flags.js` says what is `stage:'public'`
  versus `preview`; an issue against preview-gated content is real but reaches nobody today, and
  that changes its rank, not its truth.
- **A stale issue is not a wrong one.** Most were correct when written. Say that in the closing
  comment — the author was not careless, the code moved.
