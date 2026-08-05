---
name: audit-close
description: Close out a finished #221 audit slice — clear the lane tag, triage its findings into tracked issues with the four required axes, and record the slice's severity yield on the programme's convergence table. Use after an audit slice finishes, or when asked to "close the audit slice", "triage the audit findings", or "file the slice N findings".
---

# Closing an audit slice (#221)

Runs **after** a slice has reported. It is fine — expected — for this to be a primed session: the
auditing is over, and triage needs the context an auditor was denied.

**Triage is not re-auditing.** Do not re-derive a finding, soften it, or drop it because you can
think of a reason the code is that way. If you disagree, say so *on the issue as a separate
comment*, with a measurement. The finding stands until measured wrong.

---

## 1. Clear the lane tag first

```
gh issue edit <slice> --repo TH462/Reactor-Dynamics --remove-label status-wip-<lane>
```

Do this before anything else. A tag left standing makes the next agent stand down for a session
that ended.

## 2. Check the slice actually ran independently

Find the auditor's first-turn self-check comment on the slice issue: did it report `CLAUDE.md`
**auto-loaded without it reading the file**, and a memory index?

- **Reported clean** → note it, carry on.
- **Reported primed** → the findings still stand as observations, but **label the slice as
  non-independent on #221**, and say so in the convergence row below. A primed slice is evidence
  about the code, not evidence about the programme.
- **No self-check at all** → that is the same as primed. Do not infer it was fine from a slice that
  looks thorough; that inference is precisely what the mechanism exists to replace.

## 3. Triage each finding into an issue

One issue per real defect, linked back to the slice comment it came from. Required on every issue:
the **`Claude`** label plus all four axes — `priority-*` (by consequence), `type-*`, `system-*`,
`plant-*`. Canonical definitions are in issue **#61**.

Carry these through from the finding, verbatim where you can:

- the **file:line** and the one-sentence defect;
- the evidence tag — **`MEASURED`** with its number *and the layer it was measured at*, or
  **`INFERRED`** with the reasoning;
- the **repro line**. A finding whose measurement cannot be re-run is `INFERRED` wearing the wrong
  tag — re-tag it rather than filing it as measured.

Three things that are **not** defects and must not be filed as such:

- a result the slice recorded as *holding* (the mechanism was checked and was right);
- a **declared departure** the slice re-derived — check `DESIGN_COMPANION.md` before filing, and if
  the departure's *stated basis* no longer matches the shipped plant, that is the finding;
- a finding handed to another slice by name. File it there, or leave it for that slice.

Findings the owner must rule on get `status-needs-ruling` and a recommendation, not a menu.

## 4. Record the convergence row — the check nothing performs today

#221 states the programme's own stopping rule:

> *"if slice N's findings are consistently less severe than slice N−1's, the audit is converging and
> should continue. If not, stop and re-scope."*

Nothing tracks this. Post or update a table on **#221** with one row per completed slice:

| slice | ran | independent? | findings | high | med | low | notes |
|---|---|---|---|---|---|---|---|

Count by the severity you filed, not by the slice's own adjectives. Then say, in one line, whether
the trend is converging — and if it is not, say that plainly. **The rule has a consequence attached
("stop and re-scope"); a table that never triggers it is decoration.**

## 5. Update the record

- The slice issue: a close comment — what landed, what is deferred, what was handed to another slice.
- `Diagnostic/TUNING_LOG.md` and `Blueprint/BUILD_DECISIONS.md` under your lane-form session heading
  (`YYYY-MM-DD-<lane>-<letter>`), if anything in the tree changed.
- **An empty slice is a real result.** Record it as one. Do not manufacture findings to justify the
  run, and do not quietly leave the slice open because it felt thin.

## 6. Say what runs next

Name the next slice in #221's order — **1 · 2 · 3 · 9 · 8 · 4 · 5 · 6 · 7**, i.e.
**#295 #296 #297 #344 #342 #298 #299 #300 #301** — and whether its fix-side work blocks it.

Fixes are separate work from the audit. Do not start them in this session without saying so.
