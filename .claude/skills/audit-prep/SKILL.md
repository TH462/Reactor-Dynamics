---
name: audit-prep
description: Prepare a #221 audit slice for launch from an ordinary (primed) session — refresh the slice's subjects-under-test list, record the tree the findings will be measured against, tag the lane, preflight, and print the launch line. Use before starting an audit slice, or when asked to "prep the audit", "set up the next audit slice", or "get slice N ready".
---

# Preparing an audit slice (#221)

**This skill runs in the PRIMED session on purpose.** Everything it does is work an audit session
must not do — reading `CLAUDE.md`, reading prior slices' findings, reading the memory index. That
is not a compromise; two of these steps can *only* be done by a session that can see those things.

You are not the auditor. You will not read the slice's source files. At the end you print a launch
line and stop.

> If you can see `CLAUDE.md`'s *Recent themes* or a memory index, you are in the right session for
> this skill. If you cannot, you are already the auditor — use `audit-slice` instead.

---

## 1. Which slice, and is the lane free

```
gh issue list --repo TH462/Reactor-Dynamics --search 'label:status-wip-develop,status-wip-workbench,status-wip-backshop'
```

#221's running order is **1 · 2 · 3 · 9 · 8 · 4 · 5 · 6 · 7**, mapped to issues
**#295 #296 #297 #344 #342 #298 #299 #300 #301**. Do not reorder to do the easy ones first — the
order is by blast radius. A slice with comments has already run; one with none has not.

Confirm the tree you are standing in is clean and no other lane holds the slice.

## 2. Refresh SUBJECTS TO TEST — the step that justifies this skill existing

#221 process step 1 requires each slice issue to list, by name, the **auto-loaded claims inside its
scope**, marked as on trial rather than as background facts. An auditor cannot un-read a claim; it
can be told the claim is under test.

**Only a primed session can write that list**, because it is a list of exactly what a primed session
can see and an audit session cannot. So:

- Read the slice's existing SUBJECTS TO TEST section.
- Compare it against what is always-on **today** — `CLAUDE.md`'s *Recent themes* and standing-traps
  list, the memory index, and any conclusion in `Blueprint/` or `Diagnostic/` that sits inside the
  slice's scope.
- **Add what has arrived since the list was written**, with the measured numbers attached. A claim
  with its number is testable; "the coupling was fixed" is not.
- Do not remove an entry because it now looks settled — settled is the property being tested.

If the slice issue has no such section, write one. Preflight will refuse to launch without it.

## 3. Record the tree the findings will be measured against

A finding is only re-runnable against a known tree, and #221's finding format requires a repro.

```
git log -1 --format='%H %cd %s'
node test/run_all.js            # or --fast if the slow Playwright gates are not in scope
```

Post a short comment on the slice issue: the **commit SHA**, the `run_all` result, and any runner
that is red. If a runner is red going in, say so explicitly — otherwise the auditor may file the
pre-existing red as a finding, and the fix side will chase it.

## 4. Tag the lane

```
gh issue edit <slice> --repo TH462/Reactor-Dynamics --add-label status-wip-<lane>
```

The lane is the **tree the audit will run in**, not the tree you are standing in — say which in the
comment if they differ. The tag is a statement and outranks the file sweep; clear it when the slice
stops, done or not.

## 5. Preflight and hand off

```
node tools/audit_preflight.js <slice>
```

Six checks, exit 2 naming the cause. **If it refuses, fix the cause.** Never hand-type the
`claude --settings ...` line to get past it — every check it makes has the same signature when
skipped: the slice runs, produces findings, and reads as independent.

Then tell the owner to run, **in a fresh window**:

```
tools\audit.cmd <slice>            (PowerShell / cmd)
sh tools/audit.sh <slice>          (Git Bash)
```

**A new window, not `/clear`.** Measured 2026-08-05: `/clear` fires `SessionStart`, and
`tools/hook_lane_status.js` prints WIP-tagged issue *titles* into the fresh context — plant defects
by name. `/clear` clears the conversation; it does not clear the always-on layer, and
`autoMemoryEnabled` is a process-level setting no skill can change mid-session.

## 6. Stop

Do not read the slice's source files "to help while you're here". Anything you conclude now becomes
a conclusion the auditor inherits, which is the failure the whole programme exists to prevent.

Work that *is* still fair game in this session: fix-side issues raised by **previous** slices,
writing or amending slice scope and rubric, and the programme's own tooling.
