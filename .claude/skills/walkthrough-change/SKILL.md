---
name: walkthrough-change
description: The process a change to any PWR2 walkthrough (step text, grading, holds, injections, the board or speed bar as a walkthrough sees them) must follow — run_walkthrough_routes and its parts on the typical-player AND scripted-mistake routes, every number measured on both, the reviewer and its fixes, then one layman pass that confirms rather than discovers. Use when editing scenarios/walkthrough content, live-checklist steps, walkthrough grading or acceptance thresholds, or when a walkthrough playtest report comes in.
---

# Changing a walkthrough

Moved out of `CLAUDE.md` 2026-10-18 (owner, 2026-09-24: "Make the adjustments to your process
as you recommend"; order ruled 2026-09-29: "Adopt 1,2,4 as recommended." — `Blueprint/RULINGS.md`).

## The order

1. **Make the change.** Step text follows `Blueprint/CHECKLIST_WRITING_GUIDE.md` (built from two
   fresh-reader reviews, `Diagnostic/CHECKLIST_REVIEW_2026-09-06_*.md`). Players read only the
   action line (owner, 2026-10-10): lead with the action, teach through the visible plant
   response. No SI in live checklists (owner ruling 2026-09-06; a toggle is planned, not built).
   No xenon in the current walkthroughs (owner, 2026-09-26: xenon is a future walkthrough; raise
   10–12 is one closing note; rod windows are a guide — the count is the target, 1/M tracks the
   real core).
2. **`node test/run_walkthrough_routes.js`** and its parts (`--all` = unsplit): the
   typical-player route and the scripted-mistake routes — no silent strand, no tick on entry, no
   Continue flash. **Every number in step text is measured on BOTH routes** (HR12); the replay's
   fixed holds are not the player's route. Harness idiom: drive the checklist through the service
   at 600×, advancing on each acceptance (the `pwr2-checklist-measure-harness` memory).
3. **The reviewer** (a fresh agent handed the diff, the issue and what is already open) and its
   fixes.
4. **ONLY THEN one layman pass** — skill `layman-playthrough`: it confirms, never discovers. Every
   claim it makes is re-measured before any of it is filed.

## Traps specific to walkthroughs (measured)

- **An acceptance threshold at the centre of its own render band is a step the board cannot
  tell the player is met** (#749, 2026-09-18). `fmtExp` is `toFixed(1)`, so `1.4e3` draws for
  [1350, 1450) while `> 1400` refused the whole lower half; REACTOR POWER's `digits: 1` did the
  same at 0.1 — 107.4 s of dark Continue beside a tile already reading the target. **Grade the
  band FLOOR, on the channel the tile DRAWS.** The map's "PWR2 has no SR/IR channels" was stale;
  88 reused channels. Measure the PLAYER's route — the same fix bought 1 s on the replay and
  127 s on theirs.
- **A latching failure armed after the event it latches on is a no-op that reads as a working
  injection** (#670 Phase 2, 2026-09-09). `stuck_porv_open` latches on the first lift; the lift
  is at 5.5 s and the reseat near 25 s, so armed at 0–20 s the accident follows, at 30–60 s the
  valve reseats at 1985 psia (13.69 MPa) and nothing happens. A step's `inject` must fire before
  the event its failure waits for — **measure the window.**
- **The live checklist NEVER issues the step's `cmd`** — it draws text and grades off `acc`;
  `cmd`/`hold`/`ramp` stay replay-side. It DOES fire `inject_failure`/`clear_failure` behind the
  scenes since #670 (#694). Only a rate guard can tell a ramp from a staircase.
- "Block SI" is THREE actions on a cooldown: `lo_press` and `si_trip` both watch pressure
  downward and neither auto-blocks on the way down; both need P-11, so the Pressure SP comes
  down first.
- Players not doing a step may be disinterested, not lost; controls already flash — instrument
  before designing help.
- The TMI-2 securing beat sits BEFORE the decision, on its historical cue, and the decision is
  RESTORE injection or not; re-litigating that order re-breaks nine missions (#347).

## Gates to keep green

`run_walkthrough_routes.js` (+ parts), `run_checklist.js` / `run_checklist_pwr2.js`,
`run_campaign.js` + `_b` + `_c` (51/51 together), `run_m6.js`, `run_procedures.js`,
`verify_e2e_ui.js`; then `verify_ckl_relevance` and the board checks if the board changed.
Record the measured numbers in `Diagnostic/TUNING_LOG.md`; log the owner's reactions verbatim in
`Blueprint/TASTE_LOG.md`.
