---
name: merge-worktrees
description: Merge this repo's worktree lanes (workbench, backshop) into develop, then gate and push. Use when asked to "merge the worktrees", "merge the lanes", "bring the trees together", or before a release. Predicts conflicts before touching anything, reviews the incoming work rather than trusting a clean auto-merge, and refuses to push red.
---

# Merging the worktree lanes

This repo runs up to three agents in three working trees — `develop`
(`C:\grok_build\Reactor_Dynamics`), `workbench` (`C:\grok_build\RD_workbench`) and
`backshop` (`C:\grok_build\RD_backshop`). This skill brings them together safely.

**The whole point is the order: predict → merge → REVIEW → gate → push.** Skipping the
review step is how another session's work gets silently mangled or swept; skipping the
gate is how a red reaches `origin`.

## 1. Look before you touch anything

```bash
git fetch --all -q
for b in develop workbench backshop; do printf "%-10s " $b; git log $b -1 --format='%h %cr %s'; done
for b in workbench backshop; do printf "%-10s " $b; git rev-list --left-right --count develop...$b; done
for t in C:/grok_build/Reactor_Dynamics C:/grok_build/RD_workbench C:/grok_build/RD_backshop; do
  printf "%-32s %s file(s)\n" $t "$(git -C $t status --short | wc -l)"; done
```

- `0 0` means nothing to do for that lane. `N 0` means it is only behind — fast-forward it,
  there is nothing to merge *in*.
- **Uncommitted files in a lane mean a live session.** Do not merge that lane. Say what you
  found and ask. Their work is not yours to commit — see the rule in `CLAUDE.md`.
- **A commit within the last hour also means a live session.** You can still merge it (its
  work is committed), but expect it to move again, and say so rather than promising a final
  state you cannot deliver.

## 2. Predict the conflicts BEFORE merging

```bash
git merge-tree --write-tree --name-only develop <lane>    # exit 0 = clean, 1 = conflicts
```

This mutates nothing. Do it for every lane and report what it says *before* you start. It
turns "resolve whatever appears" into a plan.

Four files conflict routinely because they are newest-at-top and everyone appends:
`CHANGELOG.md`, `Diagnostic/TUNING_LOG.md`, `Blueprint/BUILD_DECISIONS.md`, `CLAUDE.md`, and
the `BASELINES` map in `test/run_all.js`.

## 3. Resolve by category, not by picking a side

| Kind | What to do |
|---|---|
| **Newest-at-top prose** (CHANGELOG, TUNING_LOG, BUILD_DECISIONS) | Keep **both** sides. Both appended; neither is wrong. **Do not renumber session headings** — since #339 the label carries the lane (`2026-08-05-develop-a`), so two lanes cannot collide and there is nothing to reallocate. That renumbering used to be a real step here (`b`→`c`, `c`→`d`, `d`→`e` at the 2026-08-04 merge, plus four cross-references), and it is retired. `node test/run_session_labels.js` after the merge says whether any label ended up naming two entries. |
| **Generated artifacts** (`ui/manual_md.js`) | **Never hand-merge.** Take either side, then regenerate: `node tools/pack_manuals.js`. Hand-editing a build product is how it stops matching its source. |
| **Mixed-fact lines** (a CLAUDE.md baselines line, a `BASELINES` entry) | Often needs a real **COMBINE**, not a choice. Each side may carry a unique fact — one adds a new runner, the other updates a score. Taking either whole silently drops the other. Read both, merge the facts. |

## 4. REVIEW the incoming work — the step people skip

A clean auto-merge means *textually* clean. It does not mean correct.

- **Read the diff of every file both sides touched.** `git diff <base>...<lane> -- <file>`.
  Ask whether the two changes are in the same *region of meaning*, not just different lines.
- **`git add <file>` stages the file, not your intent.** In a shared tree it takes everyone's
  changes to that file. Review each file's diff before staging — this is how a foreign
  baseline bump once rode into a commit and put a red on `origin`.
- **A new `test/run_*.js` needs a `BASELINES` entry** or `run_all` fails on an unbaselined
  runner. Check for new runners in the incoming commits.
- **New board controls/indications need a `pwr_board_inspect.js` entry** or `run_inspect`
  fails. Same for anything the manual documents.

## 4b. Run the merge audit — the step that catches what no gate can

```bash
node tools/merge_audit.js <base> <lane>     # audits the WORKING TREE, before you commit
```

**Two merges on 2026-08-03 each silently dropped content and every gate stayed green.**
`run_reachability`'s whole entry vanished from CLAUDE.md's gate-baselines line — that line is
one enormous paragraph every lane appends to, so it is resolved by hand or by regex and a
splice that eats a segment leaves valid markdown. `BASELINES` was untouched, so `run_all`
passed. The second lost 45 lines of `Manuals/12_SIM_PHYSICS.md`, which `run_manual_rev` cannot
see either because the digests are **re-sealed** by `stamp_manual_revision.js` after the edit.

The audit compares the structural inventory of the result against **both parents** and reports
anything a parent had and the result does not — gate entries, session-log headings, departure
rows, revision rows, BASELINES keys, authored procedure ids, flag entries, manual headings.

**Know its limit.** It catches a **named thing disappearing**. It does **not** catch paragraph
loss inside a section that survives — verified: it flags the first 2026-08-03 loss and misses
the second. A green MERGE AUDIT means "no named item vanished", not "the merge kept everything".

## 5. Gate, and attribute every red

```bash
node test/run_all.js
```

If a runner is red, **find out whose it is before fixing it**: run that gate on the incoming
branch at its own commit.

```bash
cd C:/grok_build/RD_<lane> && node test/<runner>.js
```

- Red there too → it shipped red; your merge carried it faithfully. Say so.
- Green there, red merged → the *combination* broke it. That is a real merge defect and yours
  to fix.

Fix what is unambiguous (a missing baseline entry, a missing inspect entry). **Do not invent
intent for another session's incomplete work** — especially UI copy or channel behaviour. Ask.

## 6. Sync the lanes and push

```bash
git -C C:/grok_build/RD_workbench merge --ff-only develop
git -C C:/grok_build/RD_backshop  merge --ff-only develop
```

`--ff-only` refusing means that lane gained a commit while you worked — go back to step 1 for
it. Do not force it.

```bash
git status --short          # MUST be clean: you are pushing exactly what you gated
git push origin develop
```

## Non-negotiables

- **Never push red.** If a red is another session's and cannot be resolved without their
  intent, hold the push and say why. Everything is committed on branches; nothing is lost by
  waiting.
- **Gate the exact commit you push, with a clean tree.** A gate run from before the last edit
  proves nothing.
- **`node --check <file>`** after editing any `.js` — a syntax error kills every runner that
  loads it and looks like a physics catastrophe in the gate output.
- **Verify edits landed** (`git diff`) before reporting them done.
