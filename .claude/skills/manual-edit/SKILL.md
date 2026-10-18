---
name: manual-edit
description: The three-step procedure for any content change under Manuals/ (revision-history row at the top, chapter-qualified with a §; stamp_manual_revision.js; pack_manuals.js) so run_manual_rev.js stays green, plus the pending-row rule (the revision number never advances until a release), the gates on the manual's numbers, and the silent-drop merge trap. Use whenever editing, adding or merging anything in Manuals/*.md, or when run_manual_rev / run_manual_setpoints / run_manual_commands / run_manual_units goes red.
---

# Editing the operator manuals (`Manuals/`)

Moved out of `CLAUDE.md` 2026-10-18. Owner quotes: `Blueprint/RULINGS.md`.

## Three steps, in order — or `run_manual_rev.js` reddens

1. **Extend the pending (top) row of the table in `Manuals/00_REVISION_HISTORY.md`** with a new
   lettered item (newest first — the set revision is set-wide, one number for all 13 documents).
   **Do not open a new revision row for an edit.** A new row is opened only by a release; if the
   top row is a released one, the release procedure opens the next. The revision number advances only at a release (owner,
   2026-08-06: "The revision number only matters during a release to the website. Revision numbers
   should never go up until a release happens."). The newest row is the pending one and extends
   until the next release; that is also how a revision-number collision between two lanes
   resolves (Rev 13 shipped thirteen lettered items for that reason). **Read the top row for the
   current number — never a number written in a doc** (one written in `CLAUDE.md` rotted two
   revisions behind the table).
2. **`node tools/stamp_manual_revision.js`** propagates it and re-seals the content digests.
3. **`node tools/pack_manuals.js`** so the in-app copy carries it. (`tools/hook_repack_manuals.js`
   runs as a `PostToolUse` hook on Edit/Write and repacks; run it by hand if in doubt.)

The digest is the point: **editing a chapter without recording it is a red gate** — six changes
(#247, #248, #251, #260 ×2, the gpm scale fix, #263) were once missing from the history while
ten chapters still read `Revision: 0`.

## Write the row chapter-qualified

`run_manual_rev`'s content canary **only sees what a revision row NAMES**. Write rows with the
chapter and a `§` (e.g. "Ch 12 §12.4c …"). A chapter edited in the MIDDLE by two lanes resolves
in one lane's favour **saying nothing** — a 2026-08-03 merge dropped a whole §5.5 while the
digests re-sealed around it. **After any `Manuals/` merge, grep the chapter for what you wrote.**
`Blueprint/LANES.md` §6.

## What gates the manual, and what does not

Three runners gate the manual's NUMBERS against the engine; **nothing gates its PROSE** (#532):

- `run_manual_setpoints` — chapter 09's three tables, and boots all four initial conditions.
- `run_manual_commands` — §18 and the ESF arm payload against the command registries (#570).
- `run_manual_units` — US customary first with SI in parentheses across the manual and the
  board-facing copy (`ui/manual_procedures.js`, `ui/diagram/board/pwr_board_inspect.js`).
  Temperature DIFFERENCES and RATES convert ×9/5 with no offset (41 °C of subcooling is 73.8 °F,
  not 105.8; 21.8 °C/hr is 39.2 °F/hr).

A setpoint, action or initial condition that drifts reddens a gate; a described BEHAVIOUR or a
procedure's reasoning does not — #532 found six sites teaching an ESF arm that never existed.
**Grep the manual for the subject of every ruling and board change**, and add the coverage-map
entry when you add a row: coverage is asserted, not discovered.

`Manuals/*.md` IS the PWR manual; `pack_manuals.js` builds the in-app copy; `RD.MANUAL` for the
PWR is a stub. Checklists carry no SI (owner ruling 2026-09-06); the manuals keep US-first with SI.

## Writing rules

Player-facing text: `Blueprint/STYLE_GUIDE.md`; checklist steps:
`Blueprint/CHECKLIST_WRITING_GUIDE.md` (both advisory). Two registers for every label —
Learning (plain language) and Industry (real plant terminology). Modes are written *Mode N,
Name*. Where a simplification understates reality, say so plainly.
