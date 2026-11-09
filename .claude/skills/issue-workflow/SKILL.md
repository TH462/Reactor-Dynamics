---
name: issue-workflow
description: How GitHub issues are filed, labelled and claimed in this repo — the filing bar (player consequence or a wrong number on the shipped plant), the four required label axes, the status-* labels incl. owner-review / work-next / work-complete / deliberate, the status-wip-<lane> occupancy tags, gh commands and the --search-not-label sweep. Use when about to create, label, comment on, claim or close an issue, when asked to "file an issue", "tag it", "what's open", or when a finding might deserve an issue.
---

# Issue workflow (`TH462/Reactor-Dynamics`)

Moved out of `CLAUDE.md` 2026-10-18. The binding one-liners stay there; this is the procedure.
Owner quotes: `Blueprint/RULINGS.md` §Issues and §Lanes.

## The filing bar (owner, 2026-09-20)

Of 34 issues closed as not worth doing that day, 6 concluded in their own body that nothing
should change and 8 were tests about tests.

- **`Diagnostic/TUNING_LOG.md` is where a finding GOES; an issue is the EXCEPTION.**
- **The bar: a PLAYER CONSEQUENCE, or a wrong number on the SHIPPED plant.** "A gate could be
  tighter" and "I measured this and it is fine" fail it.
- A finding you would not file if you could not fix it yourself is not an issue.
- **An ANSWER goes in a COMMENT on the asking issue, never a new one.** Process findings go on
  the running process issue (#806) as a comment.
- Not gateable; it decays unless the sweep re-runs (skill `issue-sweep`).

## Commands

`gh` is installed per-user and authed as `TH462`. On `gh: command not found`:
`export PATH="$PATH:/c/Users/Tim H/AppData/Local/Programs/gh/bin"`. `gh auth login` is
interactive — ask the owner to run it with the `!` prefix if the token expires.

```
gh issue list   --repo TH462/Reactor-Dynamics --limit 30
gh issue view   <n> --repo TH462/Reactor-Dynamics --comments     # "work issue N" INCLUDES its thread
gh issue create --repo TH462/Reactor-Dynamics --title "…" --body-file <path> --label …
gh issue edit   <n> --repo TH462/Reactor-Dynamics --body-file <path>
gh issue close  <n> --repo TH462/Reactor-Dynamics --comment "…"
gh issue list   --repo TH462/Reactor-Dynamics --search 'label:status-wip-develop,status-wip-workbench,status-wip-backshop'
```

Draft long bodies to a file in `inbox/` (gitignored) and use `--body-file`; inline `--body`
mangles multi-line markdown. Cross-link related issues by number (`#122`). US customary units
first, SI in parentheses; spell out every code on first use.

## Labels

- **Always add `Claude` to every issue you touch** (`--label Claude` on create,
  `gh issue edit <n> --add-label Claude` otherwise). It means "Claude worked on this" — create,
  comment, or do the work it tracks.
- **Four required axes** (canonical definition: issue #61, self-contained; `gh label list` shows
  what is live; retired labels are listed there and never applied to new issues):
  - `priority-critical` · `priority-high` · `priority-medium` · `priority-low` — by
    **consequence**, not effort.
  - `type-bug` · `type-tuning` · `type-feature` · `type-enhancement` · `type-test-gap` ·
    `type-docs` · `type-cleanup` · `type-decision` · `type-process`. `type-bug` = the model is
    *wrong*; `type-tuning` = structurally right, the number reads badly.
  - `system-physics` · `system-control` · `system-service` · `system-instructor` ·
    `system-hmi` · `system-scenarios` · `system-test` · `system-docs` · `system-web`
  - `plant-pwr` · `plant-rbmk` · `plant-bwr` · `plant-shared`
- `status-*` only when it applies:
  - `status-on-hold` (RBMK/BWR — pair with the plant label).
  - `status-needs-ruling` — you are *blocked* and have delivered nothing. The decision travels
    with the blocker: what he decides, the options, your recommendation (owner, 2026-08-14).
  - `status-owner-review` (owner, 2026-07-31) — the work is **done and gated**; you want him to
    look before it closes (a recategorisation, a threshold, a wording choice). **Say what to look
    at, in one line.** Do not close an issue carrying it without his word.
  - `status-work-next` — his work order. Owner-applied by convention; never add it to promote
    your own issue.
  - `status-work-complete` — built, gated and pushed; nothing left on the issue itself, but it may
    stay open for a review, a release or a follow-up. Apply with the gate result in the comment and
    **clear `status-work-next` when you do**.
  - `status-deliberate` — known and intentional, do not "fix" (the deliberately-red C2 probe, the
    B3 known-fail). **Must name who decided it and when** (2026-07-27): a comment saying
    `OWNER RULING (YYYY-MM-DD): "<their words>"` or "<agent>'s call, owner-approved YYYY-MM-DD".
    An unattributed `status-deliberate` is advisory.
  - `status-verified` — claim re-checked against current source, not inherited from a stale doc.

## The lane tags — occupancy that is not a guess (owner, 2026-08-04)

`status-wip-develop` · `status-wip-workbench` · `status-wip-backshop` — an agent is **live on
this issue right now**, in the named tree (one only; the lane is the tree, not the branch).

- **Apply it when you START, clear it when you STOP** — not when you finish. Clear it on the
  turn you hand the issue back, whether the work landed, is blocked, or you were interrupted. A
  tag left standing makes the next agent stand down for nobody.
- **A stale tag is not occupancy** (owner, 2026-10-02, #811: untouched 3 days, work released,
  tree clean): clear it, say so, carry on.
- The tag does not replace the file sweep (an agent can work without touching an issue); run
  both. When they disagree, the tag wins — the sweep cannot see an agent between commits.
- **ONE `--label` is fine; THREE are not** — `gh` ANDs repeated `--label`, so the all-lanes
  sweep must be `--search 'label:a,b,c'` (`Blueprint/LANES.md` §2 for what that cost).

## Reading an issue

"Work issue N" includes its comment thread: the owner leaves rulings and extra work items
there. An issue's own investigation comment is a claim like any other — re-measure on the tree
you stand in (#326: both comments correct when written, wrong hours later).
