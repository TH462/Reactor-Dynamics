---
name: audit-slice
description: Launch or run one slice of this repo's independent subsystem audit programme (GitHub #221). Use when asked to "run an audit slice", "run the next audit", "audit <subsystem>", or when handed a slice issue number. Decides first whether the current session is even allowed to be the auditor, and refuses to launch a slice whose independence cannot be shown.
---

# Running an audit slice (#221)

> **This file is read by BOTH the session that launches a slice and the session that runs it.**
> It therefore carries **no findings, no gate scores, and no claims about whether any mechanism in
> this plant is correct** — same rule as `Blueprint/AUDIT_CHARTER.md`. If you are about to add one,
> it belongs in the slice issue, not here.

## 0. First decide WHICH session you are

The programme's first rule of engagement is *do not hand the auditor prior conclusions*. The
repo's always-on context (`CLAUDE.md`, the auto-memory index) is dense with them, so a session
that was handed them **cannot be the auditor**, however careful it intends to be.

Check before anything else:

- **Was `CLAUDE.md` auto-loaded into your context** — present without you having read it?
- **Do you see an auto-memory index?**
- Did a `SessionStart` hook print a lane-occupancy banner?

**Any yes → Branch A. All no → Branch B.**

Do not soften this. "I read it but I will set it aside" is not available; you cannot un-read a
conclusion, and the whole programme's value is that the auditor never had one.

---

## Branch A — you are PRIMED. You are not the auditor; you are the launcher.

**If the slice has not been prepped, use the `audit-prep` skill instead** — it covers this branch
and adds the two steps only a primed session can do: refreshing the slice's SUBJECTS TO TEST list,
and recording the tree the findings will be measured against. What follows is the short form.

1. Run the preflight and print the launch line:

   ```
   node tools/audit_preflight.js <slice>       # or: tools\audit.cmd <slice> --print
   ```

2. Tell the owner to run, **in a fresh window**:

   ```
   tools\audit.cmd <slice>            (PowerShell / cmd)
   sh tools/audit.sh <slice>          (Git Bash)
   ```

3. **Stop there.** Specifically, do **not** start reading the slice's source files "to help" —
   anything you conclude here becomes a conclusion the next session inherits, which is the exact
   failure the programme exists to prevent.

**If preflight fails, fix the cause; never hand-type the `claude --settings ...` line to get past
it.** Every check it makes has the same signature when skipped: the slice runs, produces findings,
and reads as independent. There is no red anywhere. That is what the wrapper is for.

You may, in this branch, do process work the audit needs — write or amend the slice issue's scope
and rubric, keep the **SUBJECTS TO TEST** list current, or work fix-side issues that a *previous*
slice raised. Those are not auditing.

---

## Branch B — you are the AUDITOR. Run the slice.

### B1. Prove your own independence, on the record, before you read anything

Post this as a comment on the slice issue **before your first source file**:

- whether `CLAUDE.md` was auto-loaded into your context without you reading it;
- whether you can see an auto-memory index;
- the settings file you were launched with.

Phrase it as *"was it loaded"*, never *"can I see it"* — the Read tool can open `CLAUDE.md` at any
time, so "can I see it" answers a different question and answers it yes.

**If either was present, stop and say so.** A failed exclusion looks exactly like a clean audit
from the inside, so this self-report is the only evidence that exists. Reporting it as broken is
the mechanism working.

### B2. Read, in this order

1. `Blueprint/AUDIT_CHARTER.md` — replaces `CLAUDE.md` for you: how the repo is wired, which layer
   to measure at, the gates, conventions, where you may write.
2. The slice issue (`gh issue view <slice> --repo TH462/Reactor-Dynamics`) — its scope, its rubric,
   its **SUBJECTS TO TEST** list, and the six standing questions.

Everything else in this repo's prose — source comments, `Diagnostic/`, `Blueprint/`, `Manuals/`,
commit messages, issue threads — is a **claim under test**. Read it for what was *intended*, never
for what is *true*.

### B3. Work the slice

- **Findings only. No fixes.** Mixing them is how an audit becomes a refactor and stops auditing.
- **Tag every finding `MEASURED` or `INFERRED`**, and every `MEASURED` one names the **layer** it
  was measured at and how. Say *"could not establish"* rather than reasoning to a confident answer.
- **A realism claim carries a source** — an accession number, a section, enough verbatim quote to
  check. Check the corpus and the other lanes' `inbox/sources/` before concluding one does not exist.
- **Ask all six standing questions** of every mechanism that acts.
- **Read across a slice boundary; file inside it.** Hand the rest to the owning slice by name.
- **An empty slice is a real and valuable result.** Say so plainly rather than manufacturing
  findings to justify the run.

Tag the slice issue `status-wip-<lane>` when you start; clear it when you stop, done or not.

### B4. Land it

Findings go as comments on the slice issue in the charter's finding format — file:line, one-sentence
defect, evidence, severity by consequence, the rule it violates if any, and a one-line repro. Rank
most severe first. **A finding whose measurement cannot be re-run is `INFERRED` wearing the wrong
tag.** Real defects then get their own issues, linked back.

Filing the issues, clearing the lane tag and recording the slice's yield are the `audit-close`
skill — and that one is fine to run in an ordinary primed session, because the auditing is over.

---

## What this skill cannot do

**A skill cannot launch a session with different settings.** It loads into the session already
running — which in Branch A is precisely the primed one. The wrapper does the launching, this file
does the procedure, and the auditor's self-check does the part neither can: prove the running
session actually honoured the exclusion. All three are needed; none substitutes for another.
