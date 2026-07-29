# Retired files — what was removed, and how to read it again

**Why this file exists.** Git already keeps every deleted file forever, so this is not a
backup. It solves the one thing git history is genuinely bad at: **you cannot grep for a
file you do not know existed.** When a document is removed, it gets one row here, and that
row is enough to find it again.

**Recovering one.** The commit named below is the one that *deleted* the file, so read the
version from its parent:

```
git show <sha>^:<path>                 # print it
git show <sha>^:<path> > <path>        # restore it in place
git log --diff-filter=D --name-only    # everything ever deleted, if this index missed one
```

**Adding a row.** Delete with `git rm`, add the row in the same commit, and fill the sha in
afterwards (it cannot exist before the commit does — `git log -1 --format=%h` right after).
Say *why* in one line; "obsolete" is not a reason, "executed, findings live in X" is.

**What does NOT belong here.** Code deletions — those are visible in the diff of the change
that made them, and the commit message is the right place. This index is for whole
*documents* that a future reader might look for and not find.

---

| Retired | Path | Why | Deleted in |
|---|---|---|---|
| 2026-07-29 | `Diagnostic/PWR_SHIP_REVIEW_PLAN.md` | Executed plan. Carried an explicit ⛔ EXECUTED banner and closed 2026-07-27 *(OWNER RULING: "Yes. Marking done.")*. Its findings are the durable record and stay: `Diagnostic/PWR_SHIP_REVIEW_2026-07.md`. This is the file CLAUDE.md cites as the worked example of a plan that kept governing for a week after it finished. | `8749984` |
| 2026-07-29 | `Diagnostic/PWR_PRESSURE_MODEL_PLAN.md` | Executed. Header read *Status: IMPLEMENTED* — `blowdown_gain=0.02`, `blowdown_sink_c=110 °C`, `accumulator_trip_mpa` restored 1.5 → 4.14 MPa, Mode 5 accumulator isolation added. The as-built values are in `engines/pwr/pwr_config.js`; the rationale is in `BUILD_DECISIONS.md`. | `8749984` |
| 2026-07-29 | `Diagnostic/ITEM1_TAVG_HANDOFF.md` | Resolved 2026-07-20 and superseded — the re-plan landed as `Blueprint/PWR_FEEL_TUNING_PLAN.md` and the work was committed as its Phase 0. **Note before you skip it:** its own header claimed the physics findings in it "remain the durable record", and they were never re-homed. If you are working on the Tavg program, read the recovered file rather than assuming `TUNING_LOG` covers it. | `8749984` |
| 2026-07-29 | `Blueprint/ECCS_PUMP_MERGE_PLAN.md` | Executed. HPI and CVCS make-up are one pump, LPI/RHR is its own; the merge is visible in the code as the single `hpi_active` flag with `set_lpi` kept only as a deprecated alias (`pwr_engine.js`). | `8749984` |
| 2026-07-29 | `pwr_full_plant_diagram_v2.html`, `pwr_primary_loop_diagram_v2.html`, `pwr_secondary_loop_diagram_v2.html` | Dead pages — superseded by the V2 board (`ui/diagram/board/`). Referenced by no HTML, JS or JSON; they survived only as three lines in `.vercelignore`, removed with them. | `8749984` |

---

## Considered and deliberately KEPT

Recorded so the next cleanup does not have to re-derive it.

- **`Blueprint/PWR_FEEL_TUNING_PLAN.md`** — reads like an executed plan (approved 2026-07-20,
  "Phase 0 executed same day") but it is a **seven-phase** plan and only Phase 0 is provably
  done. Phase 3 has not picked this plant's Tavg anchors — the current ones are placeholders,
  by the plan's own account. **Still live.**
- **`Blueprint/OPERATOR_MANUAL_PLAN.md`** — status is *APPROVED & IN BUILD*, with the rich
  RBMK/BWR procedures outstanding. Dormant only because those plants are on hold, so it is
  the spec for work that resumes, not a finished one.
- **`ui/diagram/pwr_synoptic.js` + `.css`** (~100 KB) — the retired V1 board. It genuinely
  never mounts (`verify_manual_follow` established that), but it is still `<script>`-loaded by
  `ui/shell.html` and `ui/app.js` holds three live fallback references
  (`RD.PwrBoard || RD.PwrSynoptic`). Removing it is a real change with a real test surface,
  not a file deletion. Tracked as **#246**.
