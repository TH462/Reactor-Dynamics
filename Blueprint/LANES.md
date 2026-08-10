# Lanes — working in a repo that may have three agents in it

**Status: ADVISORY, except where an owner quote is reproduced.** The binding form of these
rules is the short block in `CLAUDE.md`; this file is the *how* — the worked failures each
rule was written from, the detection's blind spots, and the merge procedure. Same relationship
`Blueprint/SOP.md` has to the Hard Rules, and it exists for the same reason: the rules are
short, the evidence that stops them being re-litigated is not, and `CLAUDE.md` is paid for on
every turn by every agent.

Split out of `CLAUDE.md` on 2026-08-10, when that file hit its 15,000-word cap. The lane block
was **2,510 words, 17 % of the whole file**, and almost all of it was history. Nothing here was
deleted in the move; the citations came with it, and `Blueprint/**.md` is on the HR11 scan
surface (`test/run_hardrules.js`), so every owner quote is still counted where it was.

---

## 1. Why a branch is not isolation

Two sessions in one working directory overwrite each other's files and sweep each other's work
into the wrong commit. **This is not hypothetical: it happened on 2026-07-29 and cost a set of
manual edits their attribution.** A branch does not isolate anything — only a separate working
directory does, which is why the lanes are worktrees and not branches.

| Working tree | Branch | |
|---|---|---|
| `C:\grok_build\Reactor_Dynamics` | `develop` | the main working branch |
| `C:\grok_build\RD_workbench` | `workbench` | overflow lane 1 |
| `C:\grok_build\RD_backshop` | `backshop` | overflow lane 2 |
| `C:\grok_build\RD_Audit` | *(none — detached)* | the AUDIT LANE, not a work lane |

A new tree comes from `git worktree add <path> <branch>`, and needs `node_modules` junctioned
from the primary tree (it is gitignored, and the Playwright gates need it) plus an `inbox/`
directory. `CLAUDE.md` arrives with the checkout.

## 2. The occupancy check, and the two things it cannot see

```
git worktree list
git -C C:/grok_build/Reactor_Dynamics status --short && git log develop   -1 --format='%h %cr'
git -C C:/grok_build/RD_workbench   status --short && git log workbench -1 --format='%h %cr'
git -C C:/grok_build/RD_backshop    status --short && git log backshop  -1 --format='%h %cr'
gh issue list --repo TH462/Reactor-Dynamics --search 'label:status-wip-develop,status-wip-workbench,status-wip-backshop'
```

A `SessionStart` hook runs all of this for you *(OWNER, 2026-08-04: "I want tasks to get
labeled with an in work label that also tells which worktree it's being worked in.")*, #343 —
`tools/hook_lane_status.js`, wired in `.claude/settings.json`. It prints your lane, the sweep
and every lane-tagged issue into the opening context. **It reports; it never blocks and never
decides.** Run the lines by hand if it did not fire.

**"COULD NOT CHECK" is not "clear."** The hook prints them differently on purpose: a `gh`
failure and an empty result are otherwise the same output, and that ambiguity hid the broken
sweep below for days.

### Blind spot 1 — the file sweep cannot see an agent between commits

Measured 2026-08-04. At one session's t=0 all three trees were clean and all three branch tips
were the same commit, so the sweep read *three free lanes* — while agents were live in **both**
overflow trees; they committed within the hour (#337 on workbench, #334 on backshop). **#337
was correctly tagged `status-wip-workbench` the whole time, and I called that tag stale on the
sweep's evidence and got it cleared.** A clean tree with an un-advanced tip is exactly what an
active agent looks like between commits.

**When the tag and the sweep disagree, the TAG wins** — it is a statement, the sweep is an
inference.

Also: a commit inside the last hour or so means a live session, hours old means history.
**Unmerged commits on `workbench` / `backshop` are NOT occupancy** — carrying work that has not
reached `develop` is what those lanes are *for*; on 2026-07-29 workbench held five such commits
and was completely free. And **the check is not one-shot: re-check before your first commit.**
`develop` was quiet in one session's t=0 snapshot and picked up another session an hour in.

### Blind spot 2 — the query was wrong from the day it was written

**It must be `--search 'label:a,b,c'`, NOT three `--label` flags** (fixed 2026-08-04). `gh`
**ANDs** repeated `--label`, so the original form asked for issues carrying all three lane tags
at once — which the convention forbids ("one only; the lane is the tree"). **It returned 0 for
every issue, always.** Measured: the AND form returns `0` while #337 is sitting there tagged
`status-wip-workbench`. The comma form inside `--search` is the OR.

This is the failure mode the tag was introduced to fix, arriving in the tool meant to read it —
**a green-looking sweep that had never once been able to see anything.** Run it and expect
output; a blank result means the lanes are free, and that should be rare enough to notice.

## 3. On a positive: warn and ask

*(OWNER RULING, 2026-07-29: "Maybe it shouldn't be automatic. The agent should warn the user and
ask if they should use workbench." — and, refining it: "it should also check if there's an agent
working in the workbench before moving.")*

Say what you found in each lane (which files, which commit, how recent), recommend, ask; SOP §5
shape. **The detection misfires both ways** — another live session, the owner's own uncommitted
edits, and your own leftovers read identically, and only the owner can tell them apart cheaply.
**Investigating in place while you wait is fine; editing, writing probe files and committing are
not** — collisions come from writes.

Normally recommend *yes, switch* when `develop` is busy and an overflow lane is clear: the risk
is asymmetric, a needless move costs one merge. Prefer **workbench** first, then **backshop**.
**If ALL overflow lanes look occupied, do not pick one** — say so and offer a further tree; that
is the owner's call.

**Absent a reply: stay read-only and say what you are waiting on** *(OWNER RULING, 2026-07-29:
"lets go with your recommendation.", on the recommendation to cut the earlier draft's no-reply
default)* — **the heuristic never gets an action.** The first draft moved to the workbench on
its own whenever it looked clear; that was an agent proposal marked "for the owner to rule on"
and never ruled on. It also fires on the *common* false positive — your own leftovers in the
tree you just started in — while the case where guessing wrong is genuinely expensive is the
case where the owner is present to answer in seconds.

## 4. Never merge into `develop` unless the owner says so

*(OWNER DIRECTIVE, 2026-07-31: "We need a rule to never merge unless I say so. Develop was being
worked")*

**This exists because an agent talked itself into it.** On 2026-07-31 I correctly held a merge
when `develop` had 24 uncommitted files, then merged twenty minutes later on my own reasoning
that "my merge does not touch their file". That reasoning is not wrong so much as **not mine to
apply**: it moves a shared branch under someone who is mid-change, and the only person who knows
whether that is survivable is the owner. **A clean `git status` is NOT permission either** — the
other session may simply be between commits.

Applies to `git merge`, fast-forwards, and anything that moves `develop`. "Committed on the lane,
gated, waiting" is the correct end state for a finished task.

## 5. The lanes are LOCAL — never push them

*(OWNER DIRECTIVE, 2026-07-31: "I don't want the workbench or backshop trees pushed to gh. Gh
should only have main and develop.")*

Commit on the lane, merge to `develop`, push `develop`. The repo is PUBLIC, so a pushed lane puts
work-in-progress on display, and the machine is backed up off-site so the remote buys no safety.
Written down because an agent pushed both lanes on 2026-07-31 to get CI on them — which also
created a **Vercel preview site per push**, which is how the owner found out. `vercel.json` now
refuses to build those branch names, and `gates.yml` no longer lists them.

## 6. Starting on a lane, and the merge conflicts you will get

**`git merge --ff-only develop` — and when it refuses, do a real `git merge develop`.** Neither
overflow lane is a feature branch; each exists only so another agent has somewhere to work, and
`--ff-only` fails whenever the lane still carries unmerged work, which is the normal case
(`fatal: Not possible to fast-forward, aborting.`).

**Guaranteed conflicts, all newest-at-top:** `CHANGELOG.md`, `Diagnostic/TUNING_LOG.md`,
`Blueprint/BUILD_DECISIONS.md`, and the `BASELINES` map in `test/run_all.js`. Keep both sides,
then **re-run `run_all`** — a mechanical BASELINES resolution can silently take the wrong number,
and that one will not announce itself.

### `Manuals/` is on that list too, and it is the DANGEROUS one

*(added 2026-08-03, after it happened.)* The four files above conflict LOUDLY — they are
append-at-top logs, so git stops and makes you choose. **A manual chapter is edited in the MIDDLE
by both lanes, so a merge can resolve it in one lane's favour and say nothing.**

Measured: the 2026-08-03 backshop merge silently dropped an entire `Manuals/12` §5.5 section —
the documentation of a physics change whose ENGINE half merged fine. The manual then said the
clad node "heats at the local decay-heat rate" and "No hydrogen generation" while the engine did
neither. Nothing caught it: `run_manual_rev` checked the revision TABLE, the set-wide stamp and
the content digests — and **the digests were re-sealed by the merge**, so they agreed with the
surviving text. The revision-history row still claimed the change, which is worse than silence:
**the record said it was documented and it was not.**

**`run_manual_rev` now carries a CONTENT CANARY for exactly this** (2026-08-04, #345): every
chapter-qualified section a revision row names — `**12 §5.5**`, `**09 §2.0**` — must still
resolve to a heading or a register row in that chapter. The 2026-08-03 signature is reproduced
and caught: digests **green** (re-sealed), canary **red** naming the row.

**It only sees what a row NAMES.** Bare `§5.5` with no chapter number is not resolved (44 in the
pre-zeroing table, pointing variously at Blueprint docs), and prose accuracy is out of scope by
design. So **after any merge that touches `Manuals/`, still grep the chapter for the thing you
wrote** — one `grep -c` per claim — and **write revision rows chapter-qualified with a `§`
section**, because a row without one cannot be guarded.

**That obligation is not theoretical — the first real three-lane merge broke it the same day**
(2026-08-04, the Rev 1/2/3 merge). Of its three content rows the gate could guard **one**:
backshop's `**12 §12.4b**` parsed; workbench's `**12** §7.1` was missed by a parser that only
tolerated emphasis around the *whole* ref (fixed — emphasis between the chapter and the `§` is
now allowed); and develop's row named `` `03` ``, `` `05` `` and `06 step 4` with **no `§` anchor
at all**, which no parser can resolve. That merge hand-verified all four claims and called it
*"the check no gate performs"* — half right: the gate performs it, for rows written so it can.

## 7. Session-log headings name the lane

**`YYYY-MM-DD-<lane>-<letter>`** *(OWNER RULING, 2026-08-04: "Work issue 339 in develop. Go with
option 2.")* — `2026-08-05-develop-a` in `Diagnostic/TUNING_LOG.md` and
`Blueprint/BUILD_DECISIONS.md`. Letter = the next one unused for that date **in your own lane**,
`-a` first, never bare.

A per-day letter needed three trees to agree on who got `b`, and they cannot see each other:
**17 labels named two or three entries each** by the 2026-08-04 merge. Old labels are NOT
renamed, so a bare `2026-08-04b` citation is ambiguous — #339 says why.
`test/run_session_labels.js` gates it from 2026-08-05.

## 8. The audit lane

`C:\grok_build\RD_Audit` *(OWNER RULING, 2026-08-08: "It will audit things 'blind' without
preconceived notions or the logic behind the choices", and "Ts wont be a new branch.")*. It holds
the auditor's own `CLAUDE.md` — generated from `Blueprint/AUDITOR_ORIENTATION.md` by
`node tools/audit_deploy.js` — a `findings/` scratch directory, and a **detached-HEAD worktree at
`tree/`** carrying the source under audit. No branch, so nothing done there can reach one, and
`.claude/settings.json` there additionally *denies* writes into `tree/**` and into all three work
lanes. **Do not work in it and do not commit from it.**

**This supersedes the backshop arrangement** *(OWNER RULING, 2026-08-06: "Workbench will not be an
audit lane.")*, which armed backshop by default and cost it `CLAUDE.md` for ordinary work. That
cost is retired: backshop's `.claude/settings.local.json` is gone and it is an ordinary lane
again. The flag route survives as a fallback — `claude --settings .claude/settings.audit.json`
from any work lane — but it excludes `CLAUDE.md` **without putting anything in its place**, so a
session launched that way must open `Blueprint/AUDITOR_ORIENTATION.md` by hand.

**If you are preparing or closing a slice, `Blueprint/AUDIT_CHARTER.md` is your document.** Do not
restate the auditor's rules anywhere but `Blueprint/AUDITOR_ORIENTATION.md`, and never hand-arm an
exclusion — run `node tools/audit_preflight.js`, because a silently-unmatched exclude pattern
looks exactly like a clean audit.

**The `SessionStart` hook withholds WIP issue *titles* in an audit lane** — measured 2026-08-05,
it had been printing a plant defect by name into contexts the exclusion had just cleaned (#383).
Hooks fire regardless of `claudeMdExcludes`, so that was the one priming channel no settings file
could close.
