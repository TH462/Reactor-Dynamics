# AUDIT_CHARTER.md — running the #221 audit programme

**This file is for the PRIMED session** — the ordinary agent that prepares a slice, closes one out,
or maintains the lane. **If you are the auditor, this is not your document**; yours is
`C:\grok_build\RD_Audit\CLAUDE.md`, which auto-loads, and you should not be reading this one.

The audit programme, its rules of engagement and the per-slice tracking issues live in **GitHub
#221 and #295–#301**.

---

## 1. Where the auditor's rules live — and why not here

The auditor's standing orientation is **`Blueprint/AUDITOR_ORIENTATION.md`** (tracked, authored
here), deployed by `node tools/audit_deploy.js` to **`C:\grok_build\RD_Audit\CLAUDE.md`** (the only
path the harness auto-loads). `tools/audit_preflight.js` check 7 refuses a slice when the deployed
copy has drifted from the master.

**Do not restate the auditor's rules in this file.** They lived here as §1–10 until 2026-08-08 and
were moved wholesale, not copied. Two documents that both describe how to audit will disagree
eventually, and the one that loses the argument is the one the auditor is actually reading. Edit the
master, deploy, done.

What goes in the master is bounded *(OWNER RULING, 2026-08-08: the auditor is to audit "'blind'
without preconceived notions or the logic behind the choices" — asked whether harness mechanics
count as "the logic behind the choices", the owner selected **mechanics yes, judgments no**)*.
Mechanics — how to run a gate, which layer a runner measures at, unit conventions, rules of
engagement — stay, because an auditor measuring protection engine-direct sees a plant with no ESF
arms at all and files false findings. Conclusions about the plant — tuning history, gate scores,
standing traps, why a constant holds its value — do not.

> The rule the whole programme rests on, restated so it is not lost in the move:
> **everything in this repo's prose is a CLAIM UNDER TEST, not a background fact** — source
> comments, `Diagnostic/`, `Blueprint/`, `Manuals/`, commit messages, issue threads. They record
> what was *intended*, by the same process that wrote the code.

---

## 2. The audit lane — `C:\grok_build\RD_Audit`

*(OWNER RULING, 2026-08-08: asked whether backshop should stop being the audit lane and get its
`CLAUDE.md` back, the owner selected **yes — hand it back**. The audit lane is a directory of its
own, and "Ts wont be a new branch.")*

```
C:\grok_build\RD_Audit\
├── CLAUDE.md                      generated — the auditor's orientation. LOADS.
├── .claude\
│   ├── settings.json              permissions (tree/-prefixed) + the lane-status hook
│   └── settings.local.json        claudeMdExcludes + autoMemoryEnabled:false. Layers by default.
├── findings\                      the auditor's scratch. Outside the repo; git cannot see it.
└── tree\                          detached-HEAD worktree — the source under audit. NO BRANCH.
```

**The session's cwd is the lane directory, not `tree\`.** Everything depends on that: the auditor's
`CLAUDE.md` is at the cwd, `.claude/settings*.json` are read from the cwd, and the runners resolve
their own paths from `__dirname` so `node tree/test/run_all.js` works from a level up. **A session
started inside `tree\` instead gets the repo's own settings and no auditor orientation** — and, as
ever, nothing about that announces itself.

**Why a detached worktree.** RoE 1 is *findings only, no fixes*, and a detached HEAD means an edit
there cannot reach a branch even if one is made. `.claude/settings.json` in the lane adds `deny`
rules on `Edit`/`Write` into `tree/**` and into all three work lanes, so the rule is structural
rather than prose. The three work lanes — `develop`, `RD_workbench`, `RD_backshop` — are now all
ordinary and all keep their `CLAUDE.md`; the 2026-08-06 arrangement's accepted cost (ordinary work
in backshop running unprimed) is retired.

**No exclude entry may contain a wildcard**, and `audit_preflight.js` check 3b enforces it. A
catch-all broad enough to cover the work lanes — `**/grok_build/**/CLAUDE.md`, which is what was
there until 2026-08-08 — also matches `RD_Audit/CLAUDE.md`, the auditor's own orientation and the
one file in the lane that must load. Coverage of a newly-added worktree is check 3's job.

### 2a. Refreshing the tree for a slice

`tree/` is pinned to a commit. **It does not follow `develop`**, and the tooling the auditor runs —
including `hook_lane_status.js` and `audit_preflight.js` — comes from that pinned commit, so a stale
tree audits stale code with stale tools. Re-point it when you prepare a slice, then record the SHA
on the slice issue:

```
git -C C:/grok_build/RD_Audit/tree checkout --detach <sha>     # stays detached; no branch
node tools/audit_deploy.js                                     # re-deploy if the master moved
node tools/audit_preflight.js <slice>
```

### 2b. Rebuilding the lane from nothing

`.claude/` and `findings/` are outside the repo and are not backed up by it. If the lane is lost:

```
git worktree add --detach "C:/grok_build/RD_Audit/tree" develop
node tools/audit_deploy.js
mkdir C:\grok_build\RD_Audit\findings
```

…then recreate `.claude/settings.local.json` (the exclude list is `.claude/settings.audit.json`'s,
plus `C:/grok_build/RD_Audit/tree/CLAUDE.md` in both slash forms) and `.claude/settings.json` (the
`deny` rules, the `tree/`-prefixed permission allowlist, and the `SessionStart` hook). Then
**`node tools/audit_preflight.js`** — it is the only thing that will tell you whether you got it
right, and a lane assembled wrong looks exactly like a clean audit.

### 2c. The fallback: auditing from a work lane

`.claude/settings.audit.json` still exists for `claude --settings .claude/settings.audit.json` from
any work lane. It has one gap the lane does not: it excludes `CLAUDE.md` **without putting anything
in its place**, so such a session must open `Blueprint/AUDITOR_ORIENTATION.md` by hand before it
reads any source. Prefer the lane.

---

## 3. Preflight — prove the configuration, never the session

```
node tools/audit_preflight.js <slice>      # verifies the config; launches nothing
```

Eight checks, **exit 2 naming the cause** — settings unparseable, auto-memory on, a worktree whose
`CLAUDE.md` is missing from the exclude list, a wildcard in that list, a settings key a CLI upgrade
has renamed, no charter, a slice issue with no `SUBJECTS TO TEST` section, or an auditor orientation
that is missing, stale or excluded. Every one is a failure whose signature is *a clean-looking
audit* rather than a red, which is why it refuses instead of warning.

**It runs outside the session it protects**, and it only ever checks the tree it is run in (check 7
excepted — the orientation is a global fact). The other half is the auditor's **first-turn
self-check**, on the slice issue before any finding: whether `CLAUDE.md` was *auto-loaded into its
context without it reading the file*, and whether it sees a memory index. Asked the other way round
— *"can you see it"* — the Read tool answers a different question with a misleading yes.

That self-check has already caught two primed sessions before either filed a finding (#296, #297).
It has also caught an agent **reasoning about its own priming from the inside** (2026-08-05): a
session concluded it was primed because `CLAUDE.md` was in its context, when it had simply read the
file itself and the exclusion had held throughout. **A session cannot establish its own priming
state by introspection.** The check asks what the *harness* did.

**The `SessionStart` hook withholds WIP issue titles in an audit lane.** That was a measured leak:
on 2026-08-05 it printed a plant defect by name into a context the exclusion had just cleaned
(#383). Hooks fire regardless of `claudeMdExcludes`, so it is the one priming channel no settings
file can close.

*(OWNER, 2026-08-04: "what if i save claude.md to a safe place and you rewrite it specifically for
this test and after the test i restore claude.md?" — then, on the recommendation to use the
harness's own exclude switches plus a separate charter rather than swapping a tracked file:
"implement your recommendation." The 2026-08-08 lane move keeps that shape: nothing tracked is
swapped, and the auditor's document is generated rather than substituted.)*

---

## 4. Preparing a slice (primed session)

Everything here is work an audit session must not do, and step 2 can *only* be done by a session
that can see `CLAUDE.md` and the memory index.

1. **Pick the slice and check the lane.** Running order is **1 · 2 · 3 · 9 · 8 · 4 · 5 · 6 · 7** —
   issues **#295 #296 #297 #344 #342 #298 #299 #300 #301**, by blast radius, not by ease. A slice
   with comments has run; one with none has not. Sweep the lane tags before claiming one.
2. **Refresh SUBJECTS TO TEST — the step that needs a primed session.** #221 process step 1 requires
   each slice issue to name the auto-loaded claims inside its scope, marked as on trial. That is a
   list of exactly what a primed session can see and an auditor cannot, so **no other session can
   write it.** Add what has arrived since it was last written, *with the measured numbers* — a claim
   carrying its number is testable, "the coupling was fixed" is not. Do not delete an entry because
   it now looks settled; settled is the property under test. Preflight refuses a slice without this
   section.
3. **Refresh the audit tree** (§2a) and **record the tree the findings will be measured against** —
   the commit SHA and a `run_all` result, posted to the slice issue. **Name any runner that is
   already red**, or the auditor may file a pre-existing red as a finding and the fix side will
   chase it.
4. **Tag** the slice `status-wip-audit`.
5. **Preflight**: `node tools/audit_preflight.js <slice>`. If it refuses, fix the cause; never
   hand-arm the exclusion to get past it.
6. **Stop.** Do not read the slice's source files "to help while you're here" — anything you
   conclude becomes a conclusion the auditor inherits. Fix-side issues from *previous* slices,
   scope/rubric edits and programme tooling are all still fair game.

---

## 5. Closing a slice (primed session)

**Triage is not re-auditing.** Do not re-derive, soften, or drop a finding because you can think of
a reason the code is that way. Disagree on the issue, as a separate comment, with a measurement.

1. **Clear the lane tag first.** A tag left standing makes the next agent stand down for nobody.
2. **Check the slice was actually independent** — find the auditor's first-turn self-check. Reported
   clean, note it. Reported primed, the findings stand as observations but the *slice* is marked
   non-independent. **No self-check at all counts as primed**: inferring it was fine from a
   thorough-looking slice is the exact inference the mechanism replaces.
3. **File each real defect** as its own issue linked to the slice comment, carrying the `Claude`
   label and all four axes (`priority-*` by consequence, `type-*`, `system-*`, `plant-*`; see #61),
   plus the file:line, the evidence tag with its layer, and the repro line. **A finding whose
   measurement cannot be re-run is `INFERRED` wearing the wrong tag** — re-tag rather than file it
   as measured. Do not file: results the slice recorded as *holding*; a declared departure the slice
   re-derived (unless its stated basis no longer matches the shipped plant — *that* is the finding);
   or anything handed to another slice by name.
4. **Update the convergence table on #221.** Its own stopping rule — *"if slice N's findings are
   consistently less severe than slice N−1's, the audit is converging and should continue. If not,
   stop and re-scope"* — went untracked from the day it was written until 2026-08-05. One row per
   slice: findings, counts by severity, and whether it was independent. Count by the severity you
   filed, not the slice's adjectives, then say in one line whether it is converging. **The rule has
   a consequence attached; a table that never triggers it is decoration.**
5. **Record it**: a close comment on the slice issue, and lane-form session entries in
   `Diagnostic/TUNING_LOG.md` / `Blueprint/BUILD_DECISIONS.md` if the tree changed. **An empty slice
   is a real result** — record it as one rather than manufacturing findings to justify the run.
6. **Name what runs next** in the order above, and whether fix-side work blocks it. Fixes are
   separate work; do not start them in the same session without saying so.

---

## 6. History of the arrangement

Kept short, and kept out of the auditor's document on purpose.

- **2026-08-04** — the exclusion approach chosen over swapping a tracked `CLAUDE.md` (quoted in §3).
- **2026-08-05, #383** *(OWNER RULING, 2026-08-05, #383: "Let's do it with the files not the
  skills.")* — armed both overflow lanes with `settings.local.json` rather than driving the
  programme from skills, whose descriptions load into every session's prompt including an
  auditor's.
- **2026-08-06** *(OWNER RULING, 2026-08-06: "Workbench will not be an audit lane.")* — narrowed to
  backshop alone, at the stated cost that ordinary work there ran unprimed.
- **2026-08-08** — the lane moved to its own directory (§2), retiring that cost. `AUDIT_CHARTER.md`
  §1–10 became `Blueprint/AUDITOR_ORIENTATION.md`; this file kept the prep/close procedure.
