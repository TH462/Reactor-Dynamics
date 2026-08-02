# CLAUDE.md — coding-agent instructions

**This file is the orientation document for coding agents** (Claude and others)
working in this repo. The public, visitor-facing overview is `README.md`.

**It is TRACKED IN GIT** (since 2026-07-29 — it used to be gitignored). Edit it like
source: the change belongs in the commit that makes it true, and `git log CLAUDE.md`
is how a future agent finds out *when* a rule arrived and *why*. It goes public with
the repo; there is nothing secret in it. It does reference two directories that stay
local (`inbox/`, `terminals/`) — that is fine, they are named as local.

**Keep it SHORT.** It is loaded into every agent's context on every turn. Prefer a
pointer over a paragraph, and delete as readily as you add. Hard caps that are part
of the file's design, not suggestions: the *Project status* themes list is **max 5
bullets** (drop the oldest), and nothing here may duplicate `Diagnostic/TUNING_LOG.md`
— if you are writing history, you are writing it in the wrong file.

When in doubt about a number, prefer the as-built engine/config values over prose
docs.

> **Be brief. Facts, numbers, decisions** *(OWNER DIRECTIVE, 2026-07-30: "I would also like to
> adjust the conciseness of replies. Most replies are a bit too long. I need just the facts and
> important information to know what the ai did and to make decisions.")*. Lead with what
> changed and the number that shows it. **Cut**: restating the request, narrating what you are
> about to do, reasoning nobody asked for, re-explaining a decision already made, and the
> victory lap after a green gate. **Keep**: measurements, deltas, what broke and why, and
> anything that changes what he does next. Detail belongs in the commit message, the issue or
> `Diagnostic/TUNING_LOG.md` — the reply is not where the record lives. The two delimited blocks
> below are already bounded; this does not shrink them further.

> **End with what is STILL OUTSTANDING** *(OWNER DIRECTIVE, 2026-07-30: "I would like to add to
> claude.md to have the ai place a 'Still Outstanding' summary at the bottom so i know exactly
> what still need to be done with respect to the task the ai is working on. This summary should
> include a recommendation for what to work on next.")*. Close any response that leaves work
> unfinished with a delimited block, last thing before you stop:
>
> ```
> **— STILL OUTSTANDING —**
> - <item> — <why it is not done: not started / blocked on X / needs your ruling>
> **Next:** <the ONE thing you recommend, and why>
> **— END STILL OUTSTANDING —**
> ```
>
> **Scope it to the task in hand**, not the whole backlog — the owner is asking "where are we on
> *this*", and a list of everything open answers a different question. **Name what blocks each
> item**: "not started", "waiting on your ruling" and "blocked by another session" are different
> facts and only one of them is yours to clear. **One recommendation, not a menu** — same rule as
> the block above.
>
> **Omit it entirely when nothing is outstanding**, and say so in a sentence instead. A section
> that appears every turn stops being read, which is the failure mode the First Principles rule
> already names. It is a *status report*: it never substitutes for asking when a decision
> genuinely blocks (SOP §5), and it never turns an unmeasured claim into a plan (HR12).

> **When you ask the owner something, bring the recommendation with it** *(OWNER RULING,
> 2026-07-29: "I think we should add to SOP to have you automatically give your recommendation
> when asking for my input so I don't have to keep asking for it.")*. Lead with the answer you
> would give and why, then the alternatives — a neutral menu is a recommendation you declined
> to make. Say what you will do if there is no reply, and what would change your mind. Rank
> them if there are several. And do not ask at all when the call is routine: make it, state
> the assumption, move on. Full guidance, including the cases where it genuinely blocks:
> `Blueprint/SOP.md` §5.

> **The First Principles section — a CANARY, not an essay** *(OWNER RULING, 2026-07-29: "I would
> label it the 'First Principles' section. The start and end should be marked."; narrowed hours
> later, on the first two in the wild: "the first principles section is usually too long. I
> consider it a canary. Something to tell me if there's something that needs to be looked into.
> It doesn't need to be verbose.")*. Any response may carry one delimited block giving the raw
> read — the blunt judgement, the disagreement with the framing, the thing the body would have
> softened into a menu:
>
> ```
> **— FIRST PRINCIPLES —**
> <ONE concern. Two or three sentences, ~50 words.>
> **— END FIRST PRINCIPLES —**
> ```
>
> **One concern, not a survey** — the first two drafts each crammed in three, which is what made
> them too long. Two candidates: ship the one you would most regret him not seeing. Needs more
> than three sentences: then the canary is a short line plus an offer to expand, or an issue.
> Same sense as HR9's — it says *look here*, it settles nothing.
>
> **Unhedged, not unaccountable.** Exempt from habit (hedging, deferring to documents, ranking
> the cheap option first), never from the rules: **HR12 still binds** — an unmeasured claim must
> say so, since a rules-free zone for confident plant-dynamics claims is what #205 and #220 are
> the record of — as do HR11 and no-fabricated-sources, and it can never authorise an action or
> excuse a gate. **Optional and never padded**: a slot filled every turn trains the owner to skip
> it. **Two triggers worth knowing** — the *ranking disclosure* (your recommendation is the safe
> option and a higher-fidelity one exists you are not recommending: say which you would pick on
> fidelity alone, #251), and a doubt about your own work you would otherwise bury. Not gateable.

> **You may not be the only agent in this repo. Check all lanes before you edit.** Two sessions
> in one working directory will overwrite each other's files and sweep each other's
> work into the wrong commit — this is not hypothetical, it happened on 2026-07-29 and
> cost a set of manual edits their attribution. A **branch does not isolate anything**;
> only a separate working directory does.
>
> | Working tree | Branch | |
> |---|---|---|
> | `C:\grok_build\Reactor_Dynamics` | `develop` | **the main working branch — use this unless it is taken** |
> | `C:\grok_build\RD_workbench` | `workbench` | overflow lane 1, for when a second agent is already on `develop` |
> | `C:\grok_build\RD_backshop` | `backshop` | overflow lane 2, same rules as workbench (third concurrent agent) |
>
> - **First thing in a session, check ALL trees.** Occupancy is uncommitted modified files
>   *plus* a **recent** commit — run all four lines, do not stop at the tree you are standing in:
>   ```
>   git worktree list
>   git -C C:/grok_build/Reactor_Dynamics status --short && git log develop   -1 --format='%h %cr'
>   git -C C:/grok_build/RD_workbench   status --short && git log workbench -1 --format='%h %cr'
>   git -C C:/grok_build/RD_backshop    status --short && git log backshop  -1 --format='%h %cr'
>   ```
>   A commit inside the last hour or so means a live session; hours old means history.
>   **Unmerged commits on `workbench` / `backshop` are NOT occupancy** — carrying work that has
>   not reached `develop` yet is what those lanes are *for*. On 2026-07-29 workbench held five
>   such commits and was completely free. **The check is not one-shot: re-check before your
>   first commit.** `develop` was quiet in one session's t=0 snapshot and picked up another
>   session an hour in.
> - **On a positive, WARN AND ASK — do not move on your own** *(OWNER RULING, 2026-07-29:
>   "Maybe it shouldn't be automatic. The agent should warn the user and ask if they should use
>   workbench." — and, refining it: "it should also check if there's an agent working in the
>   workbench before moving.")*. Say what you found in each lane (which files, which commit, how
>   recent), recommend, ask; SOP §5 shape. The detection misfires both ways — another live
>   session, the owner's own uncommitted edits, and your own leftovers read identically, and only
>   the owner can tell them apart cheaply. **Investigating in place while you wait is fine;
>   editing, writing probe files and committing are not** — collisions come from writes.
>   Normally recommend *yes, switch* when `develop` is busy and an overflow lane is clear: the
>   risk is asymmetric, a needless move costs one merge. Prefer **workbench** first, then
>   **backshop**. **If ALL overflow lanes look occupied, do not pick one** — say so and offer a
>   further tree; that is the owner's call, not a default.
> - **NEVER MERGE INTO `develop` UNLESS THE OWNER SAYS SO** *(OWNER DIRECTIVE, 2026-07-31:
>   "We need a rule to never merge unless I say so. Develop was being worked")*. Commit on
>   your lane, gate it, say it is ready — and **stop there**. The merge is the owner's call,
>   every time, not a step you finish the task with.
>
>   **This exists because an agent talked itself into it.** On 2026-07-31 I correctly held a
>   merge when `develop` had 24 uncommitted files, then merged twenty minutes later on my own
>   reasoning that "my merge does not touch their file". That reasoning is not wrong so much
>   as **not mine to apply**: it moves a shared branch under someone who is mid-change, and
>   the only person who knows whether that is survivable is the owner. A clean `git status`
>   is NOT permission either — the other session may simply be between commits.
>
>   Applies to `git merge`, fast-forwards, and anything that moves `develop`. Pushing a lane
>   is already forbidden below, so "committed on the lane, gated, waiting" is the correct
>   end state for a finished task.
>
> - **The lanes are LOCAL. Never `git push origin workbench` / `backshop`** *(OWNER DIRECTIVE,
>   2026-07-31: "I don't want the workbench or backshop trees pushed to gh. Gh should only have
>   main and develop.")*. Commit on the lane, merge to `develop`, push `develop`. The repo is
>   PUBLIC, so a pushed lane puts work-in-progress on display, and the machine is backed up
>   off-site so the remote buys no safety. This is written down because an agent pushed both
>   lanes on 2026-07-31 to get CI on them — which also created a **Vercel preview site per
>   push**, which is how the owner found out. `vercel.json` now refuses to build those branch
>   names, and `gates.yml` no longer lists them.
>   **Absent a reply: stay read-only and say what you are waiting on** *(OWNER RULING,
>   2026-07-29: "lets go with your recommendation.", on the recommendation to cut the earlier
>   draft's no-reply default)* — **the heuristic never gets an action.** The first draft moved to
>   the workbench on its own whenever it looked clear; that was an agent proposal marked "for the
>   owner to rule on" and never ruled on. It also fires on the *common* false positive — your own
>   leftovers in the tree you just started in — while the case where guessing wrong is genuinely
>   expensive is the case where the owner is present to answer in seconds.
> - **Starting on `workbench` or `backshop`: `git merge --ff-only develop` — and when it refuses,
>   do a real `git merge develop`.** Neither is a feature branch; each exists only so another
>   agent has somewhere to work, but `--ff-only` fails whenever the lane still carries unmerged
>   work, which is the normal case (`fatal: Not possible to fast-forward, aborting.`). Expect the
>   conflict files below, keep both sides, re-run `run_all`.
> - A new tree comes from `git worktree add <path> <branch>`, and needs `node_modules`
>   junctioned from the primary tree (it is gitignored, and the Playwright gates need it)
>   plus an `inbox/` directory. `CLAUDE.md` now arrives with the checkout.
> - Commit to **your own branch**; merge to `develop` only with gates green.
> - Guaranteed merge conflicts, all newest-at-top: `CHANGELOG.md`,
>   `Diagnostic/TUNING_LOG.md`, `Blueprint/BUILD_DECISIONS.md`, and the `BASELINES` map
>   in `test/run_all.js`. Keep both sides, then **re-run `run_all`** — a mechanical
>   BASELINES resolution can silently take the wrong number, and that one will not
>   announce itself.

> **The plant is the ground truth (HR9).** The only question that decides a tuning or
> behaviour change is **"what should this plant actually do?"** — never "what keeps this
> mission green?" Authority runs one way: physics/prototypicality → this plant's ruled-on
> identity → the behaviour catalog + physics acceptance suites → control setpoints →
> authored content → that content's gates. **Content never votes on physics.** When a
> mission, procedure or checklist breaks after a plant change, presume the *content* is
> stale. Read the break — it is a canary, not an authority — but settle it against the top
> three levels, and say which behaviour you are treating as ground truth. Full rule and the
> worked near-miss: `Blueprint/CONTEXT.md` §3 HR9.

> **Prototypicality claims are SOURCED, never recalled — run an evidence pass** *(OWNER
> DIRECTIVE, 2026-07-28: "I like the idea of the evidence pass to find the data on how a real
> plant does it instead of relying on recall. I think that should be our SOP for issues like
> this one. All sim plant designs should be based on real plant documentation.")*. Before you
> change a plant number, setpoint or behaviour on the grounds that "real plants do X", go find
> the document that says so and **cite it in the change** — ADAMS accession number, section,
> and enough verbatim quote to check. Recall is not evidence; neither is another agent's
> summary, nor a claim already in this repo (many were written from recall and several have
> been disproved — see #220, #230, #205). If you cannot source it, say so plainly and mark the
> claim unverified rather than acting on it. Worked examples: **#220** (ten claims verdicted
> against NRC primaries) and **#205** (an evidence pass that overturned the filed diagnosis
> *and* one of my own interim findings). Source corpus and the nrc.gov fetch workaround:
> `Diagnostic/TUNING_LOG.md` 2026-07-28q and the `pwr-prototypicality-sources` memory.

> **A passing test is not evidence the mechanism is right (HR10).** Tests check that the sim
> does what it is **intended** to do — not just that it does what it already does. A test
> written from observed behaviour can only confirm that behaviour, including the wrong parts. If you cannot say why a mechanism is correct without citing
> which tests pass, you have not finished — three probes accepting a design only means those
> three probes accept it. When a change reddens a gate, first ask what the gate was actually
> asserting: it may be pinning a fixture, a transient, or the defect you are fixing. If you
> move a test, validate the new form against the OLD behaviour too — passing on both makes it
> a better test; passing only on your change means you refitted it, and you must say so. Full
> rule and the three worked cases (#200, #206, #219): `Blueprint/CONTEXT.md` §3 HR10.

> **RBMK and BWR are on hold.** Do **not** implement, tune, refactor, extend, or
> "fix while you're here" the RBMK or BWR engines, controls, scenarios, UI, or
> their tests. All active work is **PWR only** until the PWR is finished and the
> owner reopens those plants. Touching them wastes tokens; leave known RBMK/BWR
> reds and backlog items alone unless the owner explicitly asks. Shared code is
> fine to change for a PWR need — do not start RBMK/BWR-specific work.

> **What actually binds you** *(OWNER RULING, 2026-07-27: "I think we have too many
> instructions in this project and it's starting to confuse the coding agents and gum up the
> works… Go with your recommendations")*. There are ~229,000 words of docs here containing
> ~650 "do not / never / by design" phrases. Four rules make that tractable:
> 1. **Binding: the Hard Rules in `Blueprint/CONTEXT.md` §3, and this file.** Nothing else.
>    Ten rules, deliberately short. **`Blueprint/SOP.md` §1–4 is NOT binding** — it holds the
>    *how* (worked cases, failure modes, procedure) that used to bloat §3 to 200 lines. Read
>    it for technique; do not cite it as authority. **§5 is the exception**: it records a
>    direct owner instruction, quoted and dated, so it binds under rule 4 below — because the
>    owner said it, not because SOP.md says it. That is the only way anything in that file
>    binds, and it is why every entry there must carry its quote.
> 2. **`Diagnostic/`, `BUILD_DECISIONS.md` and `Manuals/` are RECORD, not policy** — they say
>    what happened and why, not what you must do. Read them for evidence; don't obey them.
> 3. **Plans expire when executed.** A phased work order stops binding the moment it is done
>    (`PWR_SHIP_REVIEW_PLAN.md` was the worked example — it governed for a week after finishing,
>    and was retired 2026-07-29; see `Blueprint/RETIRED.md`, which is where deleted documents
>    are indexed so you can find one you did not know existed).
> 4. **A directive with no date + verbatim owner quote is advisory.** Weigh it, say you did,
>    move on. See `CONTEXT.md` §3 for the format and why.
>
> If you find yourself blocked by a sentence in a doc, check which of the four it falls under
> before deferring to it.

---

## Start here (the map)

Find your task and go straight to the authoritative source — you do **not** need
to read everything.

| If you want to… | Read / run |
|---|---|
| **Understand the whole system** | `README.md`, then `Blueprint/CONTEXT.md` (interfaces, hard rules, data contract). |
| **Understand *why* it's built this way** | `Blueprint/DESIGN_COMPANION.md` (vision, rationale, deliberate exclusions, v2 roadmap). |
| **Apply a Hard Rule to a real decision** | `Blueprint/CONTEXT.md` §3 for the rule (binding, 10 rules, each names its guard), then **`Blueprint/SOP.md`** §1–4 for the worked cases and technique (advisory). |
| **Put a decision to the owner** | `Blueprint/SOP.md` §5 — always bring your recommendation; see the block above. |
| **Find a document that was deleted** | `Blueprint/RETIRED.md` — what was removed, why, and the command to read it again. |
| **Build or modify a module** | `Blueprint/CONTEXT.md` **plus that one module's spec** (`Blueprint/M1`–`M8`) — and nothing else. |
| **Know what changed recently** | `CHANGELOG.md` (skimmable) → `Blueprint/BUILD_DECISIONS.md` (dense engineering rationale, tuning, gate tallies). |
| **Operate the plant / look up a control, setpoint, or procedure** | `Manuals/` — start at `Manuals/README.md` (commercial-format PWR operator manuals). |
| **Pick up the active tuning / bug-fixing effort** | `Diagnostic/TUNING_LOG.md` — the session-continuity record: current status, the tuning toolbox (knobs + tests + workflow), a dated worklog, and the full backlog of known & suspected issues. **Read this first when continuing tuning work.** |
| **See current known issues, tuning gaps, playtest findings** | `Diagnostic/` (`TUNING_LOG.md`, `SPEC_AUDIT_*.md`, `OPS_TUNING_REPORT.md`, `PLAYTEST_REPORT.md`) and `Manuals/ISSUES_AND_FINDINGS.md`. |
| **Tune plant behavior (the physics "knobs")** | Each plant's **`[tune]`-annotated constants** in `engines/<plant>/<plant>_config.js` (PWR 89, RBMK 27, BWR 37 — the file header explains the convention: `[tune]` values are starting points arbitrated by the scenario suite; un-marked values are fixed). Protection/alarm/failure setpoints are data too, in `layers/control/<plant>_control.js`. Validate with `test/run_ops.js` and `test/run_behavior.js`; open tuning targets are tracked in `Diagnostic/OPS_TUNING_REPORT.md`, and the live worklog + toolbox is `Diagnostic/TUNING_LOG.md`. |
| **Run the simulator** | Open `index.html` (landing page — Operate the PWR from there), or `ui/shell.html` directly — see below. |
| **Run the tests** | `node test/run_<suite>.js` — see below. |

---

## Project status

> **Keep this section current.** When you finish work that changes what is built,
> working, or broken, update the status line and gate baselines below in the same
> change. The dense, append-only version lives in `Blueprint/BUILD_DECISIONS.md`
> (Status line + Open Flags table) — update both.

_Last updated: **2026-07-29**._

**Where the PWR is.** All PWR engine, behaviour, ops and stack gates green; `run_all` is
**35 runners at baseline**. Open backlog is dominated by RBMK/BWR operability (on hold) plus
a handful of UI/doc items.

**Recent themes** — **max 5 bullets, newest first; adding one means deleting the oldest.**
They are a reading aid, not a record: the full history is `Diagnostic/TUNING_LOG.md`, and
anything here that is standing procedure rather than news belongs in the list below it.

> **Evicting a bullet: RESCUE THE TRAP FIRST.** Before you delete the oldest, ask what in it
> would still burn someone a month from now — a stale number that is still quoted in older
> prose, a wrong premise that got copied, a gotcha with no other home. Move that to the
> standing list below as **one line**, then drop the rest. The cap is there so the list stays
> readable, not so knowledge expires with the news: on 2026-07-31 the #260/#263 bullet was
> rotated out intact and took its "do not trust a 1400 ppm crossover" warning with it, which
> is the failure this paragraph exists to stop.

- **The board reads SI now, and the two hardest parts were not conversions (2026-08-01,
  #238).** The Settings SI position was DISABLED while the PWR was up (#237) because the
  board rendered US customary at every readout — ~30 inline `MPa2psi`/`C2F` calls plus US
  unit strings baked into the generated board data. One `UNIT_FAMILIES` table in
  `pwr_board_wiring.js` now feeds 19 readouts, 6 tiles, 5 setpoint boxes and the range
  hints, keyed off a new `ctx.units()` **accessor** (a value would freeze the board in
  whichever mode it mounted in). SI flow is **m³/h** *(OWNER RULING, 2026-08-01: selected
  "m³/h" from three options put to him — m³/h, L/min, kg/s; a selection, not verbatim
  words)*. Four things to know. **The flow family's BASE unit is gpm, not SI** — the gpm
  figures are authored display flavour over normalized internals (`Manuals/12` §646), so US
  is the identity there and SI is the converted side, the opposite of every other family.
  **Band QUANTISATION had to become per-unit and seventeen new checks missed it**: tile band
  edges round so the strip does not rebuild every frame, and the quantum was "a whole display
  unit" — 1 psi is sensible, 1 MPa is 145 of them and collapses the pressurizer's 15.20–15.76
  normal band and its 14.82/15.86 alarms onto 15 and 16. Injecting it left every check green;
  the eighteenth was written because of that. It is 0.01 MPa / 0.5 °C now. **Display DECIMALS
  belong to the unit, not the instrument** — 0.56 psi and 0.0039 MPa are the same measured
  noise and want 0 and 2 decimals; Tavg and subcooling are *quieter* in °C, so they stay
  whole. And **US is unchanged BY CONSTRUCTION**: the US unit STRING comes from the authored
  item and never from the table, which preserves the board's spelling quirks (`F`, `GPM`,
  `psig`) AND restores them on the way back — measured, 166 items identical across a
  US→SI→US round trip and `board_check`'s old check list byte-identical.
- **The steam dump was 2.6× the real capacity, and that made the P-9 trip un-teachable
  (2026-07-31).** `steam_dump_max` **1.05 → 0.40** *(OWNER RULING, 2026-07-31: "Let's change it to
  40%.")* — the prototypical value, *"In most Westinghouse units the capacity of the steam
  dump system is 40%"* (WTSM §11.2, ML11223A294). #220's evidence pass declared the 105 % a
  named departure (§8.17) that morning; this **retires** it — the gap was closed instead.
  Four things to know. **My first recommendation was 0.60 and it did not survive "why not
  40?"** — I argued the real 40 % is sized for their plant while ours needs **58 %** for the
  same criterion. Wrong quantity: the real design is 40 % dump **+ a 10 % rod step**, and
  measured at 0.40 this plant reproduces it (dump saturates, core settles **89.3 %**, a
  10.7 % step). 58 % is what the dump peaks at when no runback is needed — a fact about the
  oversized dump, not the criterion. **Turbine trip is INDIFFERENT to the capacity** (P-9
  scrams at +0.5 s, decay heat ~6 %), so the only thing 105 % ever bought was a clean full
  rejection — which a real Westinghouse plant does not ride out either. **The teaching case
  is the whole case**: at 105 % the trip's own premise (*"a turbine trip will cause a load
  rejection beyond the capacity of the Steam Dump System"*, NUREG-1431 Bases Function 16)
  was FALSE here, so the interlock could only be asserted; at 40 % it is demonstrable, and
  the dump is a finite resource you can drive to its stop. **FG-4 was RESTORED, not lost** —
  `PLAYTEST_CHECKLIST` describes the approved signature as ~64 % power / Tavg ~319 / pzr
  level just under the going-solid trip, and at 1.05 NOTHING produced that (Tavg 305.3,
  power 97.5 % through a total loss of load, a non-event); at 0.40 the rejection gives 46 %,
  320.1 °C, 95.6 % level against the 97 % trip. **Authored content did not move at all** —
  `run_campaign` 51/51, `run_procedures_stack` 22/22, `run_ops` 58/68, including the Mode
  5 ↔ 1 cooldown/heatup missions, which was the one blast radius flagged unmeasured before
  the ruling. Five probes re-banded (TR-1 was pinning a NON-EVENT; its PORV check is written
  POSITIVELY now) and **TR-1g** added — the check that says 40 % is *enough*.


- **Five automation channels could have been doing nothing, and the gate still read 24/24
  (2026-07-31, #286, split from #154).** `run_autoctl` engaged **seven channels at once** and
  asserted **aggregate** plant state — power, Tavg, pressure, SG level — so every band could
  be held by a channel other than the one under test. Measured by neutering the kernel
  (channel reports `engaged`, does nothing): `cvcs_makeup`, `boron_trim`, `grid_follow`,
  `boron_conc` and the **engage** half of `steam_dump` were each a complete no-op at a green
  **24/24**. Three things to know. **`boron_conc` is `defaultOn`** — it is in every free-play
  preset lineup, so it could have shipped inert to players. **`steam_dump`'s one incidental
  red was a different feature's test**: blanking it reddened only *"PWR · RPS reset works…
  (#228)"*, and only via the **disengage** path, so engaging it could have done nothing at
  all. And **the first injection LIED** — blanking a `mode` channel's disengage as well as
  its engage leaves the plant in whatever AUTO the IC shipped with (the rig's own t=0
  stand-down is what puts it in manual), so the `steam_dump` and `pzr_pressure` probes
  **passed against a dead channel** until the injection was narrowed to engage only. Six
  probes now engage **one** channel each and assert what nothing else in the lineup can
  produce — `cvcs_makeup` holds pzr level **54.9 %** against **22.5 %** dead; `boron_trim`
  recovers rods to **88.6 %** against **100.0 %**, out of travel; `steam_dump` holds a
  turbine trip at **1121 psi (7.73 MPa)** against **1368 psi (9.43 MPa)** *with the code
  safeties lifting*. `run_autoctl` **24 → 30**. The rest of #154 was re-verified in the same
  pass: about half is dead (all five TMI-2 Part-3 endings, the follow-mode save/restore
  branch, cold-init trip blocks, the PORV block valve), and what stands is `reset_below`,
  `porv_tailpipe_temp`, the PZR code safeties, the RHR interlock, and 8-of-29 save migration.

- **The map that pins procedure steps to controls was the browser gate's COVERAGE LIST, and
  it had gone stale (2026-07-31, #224).** `STEP_UI` in `test/manual_ui_map.js` reported 32
  mismatches — but the filed defect understated it: **`verify_manual_follow.js` iterates that
  table, not the procedure steps**, so an unmapped step is **UNVERIFIED**, not merely unmapped.
  Measured: **17 of the 45** controlled PWR steps covered, `pwr_heatup` at **zero**, and the
  gate reporting a confident PASS over the slice that was left. Three things to know. **The
  issue's own caveat resolved to a third answer** — it asked whether the 32 were real defects
  or an over-strict auditor; neither, **all 45 steps resolve** against the board's control
  vocabulary, so no procedure has ever named a control the player cannot reach.
  **`VIEW_CONTROLS.pwr` was a hand copy of a display that no longer exists**: the PWR plant
  display is the learning BOARD with no view bar, and nine labels the procedures use
  (`RCP Run/Stop`, `Dump SP`, `Trip Blocks`, `1/M Plot`…) were absent from the copy while
  being perfectly reachable — filling the table against it would have manufactured nine false
  failures. PWR now reads `PwrBoardDriver.controlLabels()`, the same `CONTROL_LABEL_MAP`
  `revealControl` resolves and `run_campaign` already validates beat highlights against. And
  **the loops had to be rewritten to afford the coverage**: the bar check re-navigated per
  entry with `&view=`, **a parameter nothing in `ui/app.js` reads**, and the follow check
  reloaded and re-clicked `next` *i* times per entry (O(n²) — `pwr_heatup` alone: 153 clicks).
  Both walk once now: **84 → 174 checks for 115 → 132 s**. The auditor is
  `run_manual_controls.js` now so auto-discovery baselines it, which is the only thing that
  stops a fourth recurrence (`run_all` **34 → 35 runners**).

- **The P-9 permissive read the plant instead of the gauge, and the HR1 gate said that
  could not happen (2026-07-31, #220).** `above_p9` was `(s.power_pct || 0) > 50` — **true**
  power — while gating three protection decisions (SG hi-hi reactor trip, Reactor Trip on
  Turbine Trip, loss-of-main-feed AFW start). The real one is *"actuated at approximately
  50% power as determined by two-out-of-four NIS power range detectors"* (NUREG-1431 Rev 4
  Bases B 3.3.1, ML12100A228). **Measured** (hot full power, seed 42) with the power-range
  channel stuck at **40 %** and the core genuinely at **100 %**: a turbine trip still
  scrammed at **+0.5 s** and an SG overfeed at **+0.2 s**. Now it de-arms — the turbine trip
  rides out on the dump, the hi-hi still isolates feed and trips the turbine without
  scramming, and the plant trips **59 s later on `sg_level low`**, a genuine limit. Four
  things to know. **With a healthy channel NOTHING moves** — all 34 runners were green at
  baseline before the new checks, which is what makes it a *sensing* fix and also exactly
  why nothing caught it; probe **TR-1f** has to *fail the instrument* to observe anything at
  all (4 checks red on the old engine). **The guard's own comment was the bug**:
  `run_hardrules` scans `layers/control/` for `getTrueState()`/`true_state` and asserted in
  writing that *"nothing that DECIDES can reach truth by a path this misses"* — but a trip's
  `condition:` key is a **status word the ENGINE computes and hands over**, invisible to that
  scan. New **HR1(b)**: every permissive key is declared (`instrument`/`lineup`/`latch`/
  `hold`) and the instrument-derived ones are **checked against the engine line defining
  them**; 39 → **50 checks**, injection-verified three ways. **Two comments carried the REAL
  plant's premise for behaviour this plant deliberately departs from** — the drift class #220
  exists to catch: one still said *"no anticipatory reactor trip exists"* (false since #216),
  and the P-9 header recited **dump capacity**, which is the one justification that does not
  apply at 105 %. And **four departures are now declared** (§8.17–§8.20: the 105 % dump vs a
  prototypical 40 %, the 1.5 DPM withdrawal block, the AFW 20 %/17 % offset, status-level P-9
  sensing) — the evidence pass verdicted 7/2/1 with **none wrong**, so what it bought was the
  numbers and the qualifications, not a correction.


**Standing procedure — not part of the rotation above; these do not expire.**

- **Protection cadence is written down TWICE, and only one copy is the plant's** (rescued
  from the #153 bullet on eviction, 2026-08-01). The service evaluates protection on a
  **sim-time** cadence, `PROTECTION_DT` 0.1 s — it used to be once per broadcast, so
  `timeAcceleration` set how well the reactor was protected and at the shipped 3600× nothing
  fired at all. The trap that outlives the fix: **`test/ops_harness.js` carries its own
  `evalEvery`**, an independent copy of that cadence, so moving one and not the other leaves
  the ops suites certifying a plant no player can produce. 1× is byte-identical by
  construction (a 1× broadcast IS `PROTECTION_DT`), which is exactly why a divergence here
  stays invisible at the speed you are most likely to test at.
- **The moderator model was re-done TWICE, and older prose still quotes the dead numbers**
  (#260 then #263; rescued from the themes rotation 2026-07-31). If you meet a **1400 ppm
  boron crossover** or a **−20 pcm/°C** at-power moderator coefficient in any document, it is
  stale — both were superseded. The live values are fitted to the three measured BEAVRS
  Cycle 1 HZP isothermal coefficients: at-power **−26.8 pcm/°C**, HZP ARO critical boron
  **986 ppm**, control bank **4068** / shutdown **3676** pcm. `run_reactivity` is what pins
  them, and it reddens if a rod worth or `alpha_D` moves without a re-solve. Still open:
  there is **no Estimated Critical Condition** anywhere, which is what would have stopped the
  free-play event that started #260.
- **Traps rescued from bullets rotated out on 2026-07-31** (per the eviction rule above).
  **#137 rewind:** the free-play checkpoint cadence is **20 s of WALL clock**, not sim time, and
  `_now()` is a prototype seam **because a headless runner burns no wall time** — without it the
  cadence is invisible to every gate here, so do not simplify it away. **#284 turbine:** a
  synchronised machine **motors, it does not decelerate** — test the BREAKER (`RD.LoadMode.isOnLine`),
  never `generator_load > 0`, and that predicate deliberately EXCLUDES `turbine_tripped` because a
  trip and an open breaker are different events (#230). `mwe_output` reads the TURBINE, not the core.
  **#249 pressurizer:** `level_per_mass_surplus` is **776**, fitted to real geometry (pzr steam space
  = 5.8 % of RCS volume); `cvcs_charge_per_level` was deliberately **NOT** scaled with it — the
  documented 83 s loop τ is the *deficit* branch, so touching the shared gain to fix a surplus-side
  number slows leak make-up to 215 s.
- **The pzr level PROGRAM and the level PHYSICS are two different lines now (#289, 2026-08-01).**
  `levelBase()` is unbounded upward — coolant expands. `levelProgram()` is the same line
  **clamped** at `level_prog_floor` 28 and `level_prog_ceiling` **61.5**, and it is what the
  CVCS setpoint and `pzr_level_dev` read. **Every consumer of "the program" must call
  `levelProgram`, not `levelBase`** — `_levelDev` called `levelBase` and read **−38.5 %** with
  the controller exactly on setpoint, which pegs `PZR LVL DEV LO` for a whole load rejection.
  The ceiling exists because without it the program chased Tavg to ~94 % and scrammed the plant
  on the 97 % going-solid trip **with inventory correct**. Do NOT "simplify" it to
  `pzr_level_nominal` (55): measured, a ceiling sitting on the normal operating point rectifies
  Tavg noise and biases the setpoint low permanently (0.15 % of inventory, reddens
  `run_e2e_controls`' droop check). A program maximum is a limit, not part of the control law.
- **The board is the V2 diagram, and `pwr_board_data.js` is GENERATED.** Edit in the Claude
  Design "PWR Reactor" builder, re-export to `inbox/Diagram V2.json`, run
  `node tools/gen_board_data.js`, then re-point ids in `pwr_board_wiring.js`. **The builder's
  live state lives in browser localStorage, not in the project files** — the `BUILTIN_DOC` in
  `Diagram Building Tools.dc.html` is only a stale fallback, so you cannot pull the current
  diagram over MCP. Ask the owner to export.
- **A re-export changes PIPE ids.** Pipe ids are regenerated whenever a run is re-drawn, so
  `PIPE_TEMP` silently orphans and pipes freeze at authored temps. `selfTest` now asserts
  every `PIPE_TEMP` key and every `CONTROL_LABEL_MAP` target still exists — if you add a map
  keyed by diagram ids, guard it the same way. A re-export can also silently undo **board
  geometry** fixes: `ui/test_panel/board_check.html` pins the pressurizer's plumb joints
  against the fittings above and below it (#231), pipe **animation play-state vs plant
  state** in three states (#236), and the #235 board defects, for the same reason. **Run
  board_check (headless Edge, `--dump-dom`; `document.title` says PASS/FAIL) after any
  board change** — it is not in `run_all`. Currently **168/168** (MEASURED 2026-08-01 on the MERGED tree. Both branches moved it and neither figure survives: develop reported 149/149 after #289, workbench **162 checks with 1 FAILURE** after #238 — and workbench correctly predicted that its one red, *"func: SCRAM two-step trips the reactor"*, was a HARNESS bug already fixed in develop's #289 work, so the merge resolves it. **Before #289 this line claimed 143/143 while the harness was actually at 1 FAILURE / 143** — nobody had run it, which is the standing argument for running it rather than trusting this number. Both of those reds were harness bugs, not plant defects. **Four traps if you touch this file:** the TRIP BLOCKS check must restore the `ir_high` block BEFORE the plant is stepped — at full power the IR channel reads 2.0e-3 against a 1.67e-3 setpoint, so the trip condition is STANDING and the block is all that holds it off; `rps.scrammed` **LATCHES**, so re-blocking cannot undo a scram once it fires; `reset_rps` is refused **RODS_NOT_INSERTED** until the rods seat (measured, still coasting at 95 % power a few ticks after the scram); and the dual-mode SCRAM/RESET button reads which half it is off the **RENDERED** snapshot, so re-render after a reset or the clicks land on the wrong half — this line said 95/95 once, which was already stale when
  written down; the count moves whenever a pin is added, so re-measure rather than trusting
  it. History: 59 before the #235/#236 pins, +20 pipe-state/board-defect pins, +2 ROD AUTO,
  +3 from the #237 comment items, +11 for the generator FOLLOW/MAN/OFF selector (#230),
  **+7 power tile armed-trip bands (#267), +8 pressure tile (#270), +6 NIS thresholds
  (#271), +4 ITEM_CHANNEL / liveNote, +7 the SG FEED corner status (#214) and +5 the SCRAM button's RESET half (#75) — including a pin on the ORIGINAL defect, so restoring the empty handler reddens it**; the previously recorded "60/60" never
  matched the code either, #235 finding 6).
  **Read the tally from the harness's own summary line** (`ALL n CHECKS PASS` /
  `n FAILURES / n`) — scraping the page for the last `n/n` pair picks up unrelated
  numbers and reports a nonsense total.
- **Measure the board, don't eyeball it.** Mount it headless and read `RD.PwrBoard.ports()`:
  every port's scanned world coordinate is there, so an alignment claim is a subtraction, not
  a judgement. Two of #231's three filed leads were wrong and only this said so.

- **Verify a claim before you act on it.** Roughly half the issues touched on 2026-07-27 were
  stale or mis-framed — leaks already fixed, "reasons" that measurement disproved, premises
  copied between files. Read `Diagnostic/TUNING_LOG.md`'s top entry, then check the code.
- **A claim about COVERAGE is an unmeasured claim — prove it by injection** *(my call,
  2026-07-31; not an owner ruling)*. HR12 binds assertions about plant dynamics: step the
  plant, quote the number. The class that keeps going wrong is the neighbouring one it does
  **not** name — *"X is untested"*, *"the gate covers Y"*, *"nothing asserts Z"* — and those
  are just as measurable, with a tool the repo already uses. **To prove something is untested,
  break it and run the gate.** Neuter the channel, invert the comparison, delete the config,
  and see what reddens; if nothing does, it is untested as a *measurement* rather than as an
  opinion. That is how #286 found five inert automation channels behind a green 24/24 — and
  skipping it is how, the same day, I repeated this repo's own claim that the RHR 400 psi
  (2.76 MPa) interlock was untested when `run_pwr` covers it fully, and predicted its cooldown
  probe stopped at 10 MPa when it actually reaches **283 psi (1.95 MPa)**. One run caught both.
  **Inherited claims are the risky ones**: a sentence from a review, an issue body or this file
  has usually aged, and repeating it in your own voice launders it into a fresh assertion.
  Either say "the 2026-07-19 review says X, unverified", or go and measure.
- **Provenance matters more than it looks.** Many "owner rulings" in this repo were written by
  agents; all agent work commits under the owner's name, so git blame proves nothing. A ruling
  without a date and a verbatim owner quote is advisory — see `Blueprint/CONTEXT.md` §3.
- **`test/run_hr3.js` guards HR3** in the shared control kernel; **`test/run_hardrules.js` guards HR1, HR5 and HR11** (HR2, HR6 and half of HR4 are unguarded, and HR10/HR12 are not gateable at all — §3 says so in each case). `run_campaign` validates every
  scenario, not just campaign-wired ones.
- **A new `true_state` field must be documented in the same change (2026-07-28, #225).**
  `test/run_contract.js` diffs `Object.keys(getTrueState())` against the §6.3 block in
  `Blueprint/CONTEXT.md` and fails BOTH ways — an undocumented field and a documented
  phantom. Nothing compared the two before, so the gap reached 29 of 84 PWR fields. PWR
  only; the RBMK/BWR blocks are registered `skip` and were never audited.

**The full history lives in `Diagnostic/TUNING_LOG.md` (newest first)** — it is the
session-continuity record and a strict superset of what this section used to duplicate. This
section used to carry fifteen stacked historical entries, ~280 lines, every one of them a
second copy of a TUNING_LOG entry, in the first file every agent reads. Cut 2026-07-27
*(OWNER RULING, 2026-07-27: "Execute the cut.")*. **Keep it short: current state and pointers,
not a changelog.**


**Layers**
- **Physics engines complete** — PWR (M1) ✅, RBMK (M2) ✅, BWR (M3) ✅. All three
  have full balance-of-plant (turbine/condenser/generator + electrical output). The
  PWR models a **Cold Shutdown (Mode 5) initial condition** and the **full Mode 5 ↔
  Mode 1 heatup/cooldown on integrated physics** — see `CHANGELOG.md`.
- **Stack complete** — Control (M4) ✅, Simulation Service (M5, +rewind) ✅,
  Instructor (M6) ✅ (beat engine, Path-2 follow, TMI flagship, rewind, highlights,
  Hook + Training), Test Runner (M7) ✅.
- **UI (M8): functional alpha, PWR only** 🟦 — M8 and the M4 control UI are not yet
  extended to RBMK/BWR.

**Known open work** (details in `Diagnostic/` + `Manuals/ISSUES_AND_FINDINGS.md` +
`BUILD_DECISIONS.md` Open Flags)
- Chernobyl / Fukushima **flagship scenarios** and the campaign wrapper for RBMK/BWR.
- Extend the **M8 UI / M4 control surface to RBMK + BWR**.
- **Campaign ↔ Mode-5 alignment: done** — strings use *Mode N, Name*, and three
  missions (`pwr_mode5_to_mode3`, `pwr_mode3_to_mode5`, `pwr_return_to_mode1`) drive
  the full Mode 5 ↔ 1 loop on the board (`Manuals/CAMPAIGN_MODE_ALIGNMENT_SPEC.md`
  §2–3). `11_CAMPAIGN_CROSSWALK.md` verified current (Rev 1, 34 missions + bonus).
- **Mode-5 controls exposed in the UI**: RCP **Run/Stop** (`set_rcp`), **Pressure SP**
  and **Dump SP** setpoint boxes. Remaining polish: a `plant_mode` text indicator and
  an explicit `eccs_mode` readout (nice-to-have).
- **ECCS card UI layout** open (contract in `Blueprint/pwr_synoptic_prerequisites.md`).

**Current gate baselines — `node test/run_all.js` is now the authority.**

> Since 2026-07-25 the baselines live as **data** in the `BASELINES` map at the top of
> `test/run_all.js`, not as prose here. Run it; it compares all 35 runners against that
> map and exits non-zero on any drift. Prose baselines are what rotted (this section
> claimed `run_m5` **19/19** while its own status text said 18/19 — issue #161). **If
> you move a number, update `BASELINES` and this section together.**

```
node test/run_all.js            # all 35 runners (~6 min)
node test/run_all.js --fast     # skip the 2 Playwright gates (~2.5 min)
node test/run_all.js --only run_pwr,run_ops
node test/run_all.js --record   # print observed results as a BASELINES block
```

Drift is **symmetric** — a runner scoring *better* than baseline also fails, so a red
turning green has to be acknowledged (update the baseline, close the issue) instead of
being silently absorbed. Same convention as the strict xfails in `run_meltdown` /
`run_behavior`.

**CI runs the same command on every push and PR to `main`/`develop`**
(`.github/workflows/gates.yml`, ~8 min) — all 35 runners, browser gates included; it
installs playwright into `./node_modules` from a scratch prefix and asserts no manifest
appeared in the repo root. **Check it after you push** — `gh run list --workflow=gates.yml
--limit 3`. It ran `--fast` with no install from 2026-07-27, which worked until
`verify_flags_ui.js` arrived (#241, 2026-07-28 20:49 UTC): that gate needs playwright but
is not marked `slow: true`, so `--fast` runs it and it dies `MODULE_NOT_FOUND` in a
checkout where `node_modules/` is gitignored. Last green was **2026-07-28T19:52Z, one hour
before that commit**; the following **32 runs were red without exception**, including the
push to `main` for Alpha 1.10.0 and the #272 release PR. Nobody noticed for three days,
which is the argument for a required status check and against a badge (#191).

Green at baseline: PWR **36/36 (240 checks)** (237 → 240 on 2026-07-31, #288 — the RHR suction valve's block-open permissive and its autoclosure interlock were ONE constant, so the deadband was zero and the valve chattered across a single boundary; against #287's one-shot entry permissive the first chatter was permanent. The autoclose is its own **600 psi (4.14 MPa)** setpoint now, ~200 psi above the unchanged 400 psi block-open, both sourced to NUREG-0933 Issue 99. The third new check is the one easy to forget: an open must still be **REFUSED** inside the deadband, because the block-open setpoint did not move. **The measurement trap is worth more than the fix, and it is not the one I first wrote down** — `engine.reset()` takes an OBJECT (`{initial_state}`) and **silently ignores a string**, defaulting to `hot_full_power`. Three rigs here ran on a 300 °C plant while logging `cold_shutdown`, and published two wrong findings before it was caught: a close at **377 psi** (below the configured 400) and a "the plant overshot to 604 psi mid-step" explanation that was really just the wrong IC surging. **Assert the IC — log `s.pressure_mpa` right after `reset`** — nothing else in the rig will tell you. 32 → 36 on 2026-07-31, #154 item 11 — four engine surfaces asserted NOWHERE: the pressurizer **code safeties** (`s.safety_open` had zero references in the tree; only the SG safeties were ever asserted), **`porv_tailpipe_temp`** (the TMI/Davis-Besse tell the flagship teaches), the TMI-2 **blocked-AFW** device (only ever asserted FALSE) and the **unknown-command** path. `save_migration` went 8 → 20 of the 29 `_migrateState` defaults, including the `rcp_secured` INFERENCE (#240) — the one judgement call in the migration, unasserted both ways. Layer note: the code valves are a COMMANDED state in the engine and their pop/reseat SETPOINTS are an M4 actuation, so the threshold half lives in `run_m4`; measured, a real transient cannot reach them at all — the high-pressure reactor trip caps indicated pressure at **2460 psi (16.96 MPa)**, under the 2484 psi (17.13 MPa) pop, so only an ATWS or a failed instrument gets there), BWR **15/15**, RBMK **23/23**, campaign **51/51 (3038 checks)**,
`run_m4` **34/34 (194 checks)** (33 → 34 on 2026-08-01, #294 — **`COLD_MODES = [4, 5]` was tested at 5 only.** It gates six alarm behaviours; narrowing it to `[5]` left **six gates green** — `run_m4`/`run_pwr`/`run_ops`/`run_contract`/`run_reachability`/`run_hardrules` at 185/240/351/139/58/75 — so the Mode 4 half could have been deleted outright unnoticed. What it suppresses is not cosmetic: on a correctly depressurized cold plant the injected form raises a spurious **CRITICAL** (`pzr_pressure_lolo`) plus three spurious warnings, **and loses A33** — the one alarm carrying news — because its `condition` stops matching. **Three of the five deltas are priority-only**, on alarms that still appear either way, which is exactly what a presence check cannot see; assert the priority. Mode 4 is where a plant spends most of a cooldown from power and where the #287 sequence lands. The probe reaches it the way the plant really does — **lose the heat sink, heat on decay + pump heat** (Mode 4 at 1000 sim s, ~1 s wall) — rather than hand-setting a temperature, so the mechanism under test is the engine's. 5 checks red on the injected config. 28 → 32 on 2026-07-31, #154 item 6 — four kernel internals with no test at all: actuation **`reset_below`** (a comment recorded the shipped PORV-flapping inversion; nothing pinned the fix), numeric **`override_value`** interception (five PWR failures use it and the intercepted-command path was never once observed), interception **precedence** (first-injected wins — the probe distinguishes it from last-wins, so both halves invert under injection), and **`acknowledge_all_alarms`**, previously asserted only as "the instructor gate does not block it"), `run_m5` **23/23 (103 checks)** (79 → 83 on 2026-07-31, #137 — the free-play checkpoint cadence became REAL time. The load-bearing check piles up **360 sim-s with the wall clock frozen** and requires ZERO checkpoints; the pre-fix service lays **21** there. `_now()` is a prototype seam because a headless runner burns no wall time — without it this cadence is untestable), `run_m6` **18/18 (117 checks)** (#154 item 7 — chat-mode transcript mechanics: the story clock, the **time-skip divider** (first line of the beat only, or the UI repeats it down an ordinary exchange) and the **`CHAT_LOG_CAP`** ring, which matters because the snapshot passes the log BY REFERENCE every broadcast), `run_m6ph` **8/8**, `run_autoctl` **30/30** (24 → 30 on 2026-07-31, #286 — the suite engaged **seven channels at once** and asserted AGGREGATE plant state, so a dead channel hid behind its neighbours. Measured by neutering the kernel: `cvcs_makeup`, `boron_trim`, `grid_follow`, `boron_conc` and the ENGAGE half of `steam_dump` were each a complete no-op at a green 24/24, and **`boron_conc` is `defaultOn`** — inert in every free-play lineup. If you repeat that injection, neuter the **engage direction only**: the rig stands every channel down at t=0, so blanking the disengage too leaves the plant in the IC's own AUTO, and two probes then pass against a dead channel),
`run_behavior` **43 pass / 0 xfail** (42 → 43 on 2026-08-01, #289 — **TR-1h**, the full rejection on the SHIPPED lineup, which nothing asserted once `rods_tavg` became `defaultOn` at power *(OWNER RULING, 2026-08-01: "Let's start the rods in auto. Might as well, everything else starts in auto.")*. **TR-1g was RE-AUTHORED against WTSM 11.2, not re-banded**: the dump is TRANSIENT — *"until the power in the reactor is reduced to the same value as the secondary load"* — so its old 85..93 % steady state was a rods-in-manual ARTEFACT pinned as the design case, and the rod channel following turbine-only `steam_flow` is correct. Five probes now stand the rod channel DOWN explicitly via `rodsManual()` — EV-3, EV-11, TR-1, TR-1c and **TR-1e leg B**, which needs core and generator to DISAGREE by ~2× or it stops discriminating at all. Injection-verified: 7 checks red on the pre-change lineup. **Trap**: TR-1h's first draft asserted "the safeties NEVER lift" from a `measure_stack` run sampled every 150 s, which missed the peak — `h.range()` sees every step, and the defensible claim is PERMANENCE, not occurrence. 41 → 42 on 2026-07-31: the steam dump went **1.05 → 0.40**, the prototypical Westinghouse capacity *(OWNER RULING, 2026-07-31: "Let's change it to 40%.")*, and **TR-1g** is the check that says 40 % is ENOUGH — the 50 % loss of load, no trip, no relief lift, and the documented 40 %+10 % split pinned. FIVE probes were RE-BANDED, not weakened: TR-1 had been pinning a **non-event** ("dump carries near-full power 90..103 %", "no PORV lift" — measured at 1.05 a total loss of load reached Tavg 305.3 °C with power at 97.5 %). It pins the defence-in-depth ladder now, and its PORV check is written **POSITIVELY** so restoring capacity has to edit the line rather than slide through a band. 40 → 41 on 2026-07-31, #220: **TR-1f** — the P-9 permissive is an INSTRUMENT reading, and the probe has to FAIL the channel to observe anything at all, because with a healthy one the fix moves nothing. 4 checks red on the old engine. 38 → 39 on 2026-07-31, #135: **TR-14**, the SOURCED loss-of-feedwater drain rate. It exists because moving `K_sg_level` by **3.6×** left all 32 runners green — nothing in the suite asserted how fast a steam generator empties, so the constant could drift back unnoticed. Fails at 13.0 s against its 25–60 s band on the old value. 39 → 40 same day, #284: **TR-1e** — nothing in the suite compared what the turbine was ADMITTED against what the reactor MADE, because every other check runs where the two agree, so a **2× error on a board gauge** sat behind 34 green runners. Fails 3 checks on the old engine), `run_meltdown` **10 pass / 0 xfail**,
`run_meltdown_stack` **3/3 (21/21 checks)**,
`run_procedures` **22/22 (99/99 checks)**,
`run_procedures_stack` **22/22 (176/176 checks, 2 strict xfails — both RBMK/BWR #208; the 7
`pwr_heatup` xfails cleared 2026-07-26c/d via #206 + #210, and FOUR more on 2026-07-29 that
were never plant defects at all — the harness was running 11 of its 22 procedures below the
10× it declares, so their steps got a tenth of their sim time (#245))**, `run_checklist` **24/24**, `run_scenarios`
**3/3**, `run_m7` **OK**, `run_flags` **16/16 (290 checks)**, `run_inspect` **7/7 (35 checks)**,
`run_contract` **139 checks / 0 failed** (84 → 138 on 2026-07-31, #157 — it now guards a second contract: every alarm on all three plants declares a `category`, which the UI used to keyword-match off the alarm id), `run_reactivity` **27 checks / 0 failed** (#260 — pins the SOURCED reactivity anchors; `rho_excess` is solved against BEAVRS's 975 ppm HZP ARO critical boron, so this is what reddens if a rod worth or `alpha_D` moves without a re-solve. 23 → 27 on 2026-07-30, #263 item 2: the four inputs `pwr_startup`'s 26-step creep is DERIVED from — startup-IC boron, critical position, differential bank worth, and the excess the creep leaves), `run_hr3` **27 checks / 0 failed** (29 → 27 on 2026-07-31, #228), `run_reachability` **58 checks / 0 failed** (NEW 2026-07-30, #249/#273 — **can the plant reach its own setpoints?** Part A is static and total: all 50 PWR trip/actuation/alarm thresholds must sit STRICTLY inside their instrument's declared range, since `crossed()` is strict. Part B DRIVES the plant and watches the indicated channel cross, which is the only half that can catch a clamp — `pzr_level`'s range is [0,100] and its trip is 97, so Part A was perfectly happy while the level physically could not exceed 88.00 %, and that is what let a full accumulator dump hide behind an "arrived UNscrammed" check for months. **Add a case here whenever you assert that a trip did NOT fire** — that claim is worth exactly what the gauge can reach), `run_hardrules` **83 checks / 0 failed (1 declared HR1 debt — RBMK, on hold)** (**MEASURED 83 on the MERGED tree — not develop's 63, not workbench's 80, and not the two added together.** **And measure it AFTER resolving, not during**: a first pass read 84 off a tree that still had the conflict markers in it, so both sides' citations were present at once and the duplicates were counted. Both branches moved this number independently and a mechanical conflict resolution ships a drift; this line and the `BASELINES` entry are the worked example the entry itself warns about. develop: 60 → 63 (#289) — three citation sites for the rods-in-auto and ROD-AUTO-colour rulings, and the gate ALSO caught a real defect in that change, the first `rods_tavg` `defaultOn` reading `true_state.power_pct` and failing as an undeclared HR1 site, the #220 class exactly. workbench: 43 → 77 (#290) — HR11 matched the literal `OWNER RULING` only, so ELEVEN in-scope `OWNER DIRECTIVE` citations were unguarded, including *never merge into develop* and *never push the lanes*; then 77 → 80 (#238), ordinary write-up drift. The merged figure is higher than either because the widened #290 guard also sees develop's 2026-08-01b/c write-ups, which workbench's own 'measured on the merged tree' note predates. 47 → 48 on 2026-07-31 — the `06 PWR-A33` keep-it ruling, recorded so the "that alarm got rare, delete it" argument is not re-litigated from scratch. 43 → 47 on 2026-07-31 (#288) is the same mechanism a third time: the engine and config change moved NOTHING here, and the four write-up sites citing `"issue 288, split them."` — CHANGELOG, TUNING_LOG, BUILD_DECISIONS and the manual revision row — are the whole delta. this line once said 28 while the gate was at 29. It counts `OWNER RULING` / `OWNER DIRECTIVE` **citation sites** wherever they are tracked — that wording used to read "dated owner quotes", which is what made #290's silence look like a clean bill rather than a marker it never matched — so **writing a change up moves it, not just making the change**; re-run it AFTER the docs. 40 → 39 on 2026-07-31 (#286) is the rule biting the OTHER way: the *Recent themes* cap is five bullets, so adding one dropped the #260/#263 bullet and with it the `"for 263 item 1 fit the measurement."` citation — the ruling still stands in three other tracked files, so this is one fewer citation SITE, not one fewer ruling. **The themes cap and this gate pull against each other**; check where else a quote lives before restoring a bullet to chase the number. 39 → 40 on 2026-07-31 (#284) was that rule again, cleanly: the engine fix moved nothing, and the BUILD_DECISIONS write-up moved it by quoting #230's ruling. 39 was MEASURED on the merged tree: `develop` took it 29 → 39 across #249/#273/#276 and `workbench` 29 → 32 (#249, three sites carrying `"249 - fit it."`) independently, so neither branch figure was right and a mechanical resolution would have shipped a drift), `run_release` **8 checks / 0 failed** (pre-release mode — re-arms to more on the first real version) (NEW 2026-07-31 — **release bookkeeping**: `site/release.js`, `changelog.html` and `CHANGELOG.md` must agree on what shipped. Written because the `CHANGELOG.md` roll — renaming `## [Unreleased]` to the version — was skipped for **Alpha 1.10.0 AND 1.11.0**, leaving 434 lines of two shipped releases filed as unreleased with the newest heading reading 1.9.0. **Nothing downstream reads that heading**, so nothing went red and nobody noticed; a CLAUDE.md note and a release-skill step already said to do it, and they are what failed. Verified against the real pre-fix file, not a synthetic one: 3 checks red. The count moves with the number of released versions — every `changelog.html` entry down to the oldest one `CHANGELOG.md` still names individually is cross-checked, so **a release adds a check**), `run_portable` **124 checks / 0 failed** (the offline single-file build — count moves with the shipped asset list; +7 on 2026-07-30 for the DOWNLOAD section, #275, which guards the *delivery* rather than the artifact: the site's download button is stamped with the release version by `site/nav.js`, and every way that wiring can break leaves a button that still works and still hands out `latest.zip`), `run_manual_units` **0 failed** (scored on failures only — the coverage count moves on ordinary prose edits, so it is deliberately NOT in the baseline), `run_manual_rev` **13 checks / 0 failed** (the manual set's revision history — table shape, set-wide stamp agreement, content-digest seal, pack currency; IS baselined, because unlike `run_manual_units` its checks are structural and do not move on prose. **A chapter edited with no revision row reddens it** — the failure it was written for, after six content changes went unrecorded), `verify_flags_ui` **42/42** (this line said 48/48 from the day it was written; `BASELINES`
always said 42 and the gate has always scored 42),
`verify_e2e_ui` **PASS (16 screenshots)** (scored on screenshots — the count is `ENGINES × VIEWS`, so **sections are free to add and none of them move this number**; `testRewindPicker` arrived 2026-07-31 with #137 and `testTrendPreseed` 2026-08-01, both at 16. **`testTrendPreseed` guards the REAL 30-minute graph preseed** *(OWNER, 2026-08-01: "when you make preset starts, run them for 30 minutes to fill up the graph with real data before saving")* — `ui/app.js` `ensurePreseed` seeds flat instantly then swaps in a genuinely-run trace off the main thread, cached per plant+dv+IC. **If you write a check here, scope it to `#chartCanvas`**: counting distinct y-values across ALL polylines reads ~250 gauge sparklines and scores 32 whether the feature works or not — it proved nothing twice. Scoped, the A/B is 28 distinct y over 61 points vs **exactly 1** with the call neutered), `verify_manual_follow` **PASS (141 checks)** (84 → 174 on 2026-07-31, #224 — NOT new assertions, the same ones finally applied to the steps they were always meant to cover. This gate iterates `STEP_UI` in `test/manual_ui_map.js` rather than the procedure steps, so **that table is its coverage list** and an unmapped step is UNVERIFIED, not merely unmapped: measured, 17 of the 45 controlled PWR steps, `pwr_heatup` at ZERO, gate green. Runtime only 115 → 132 s because the per-entry page loads went too — the bar loop re-navigated with `&view=`, which **nothing in `ui/app.js` reads**), `run_manual_controls` **94 checks / 0 failed** (NEW 2026-07-31, #224 — was `test/audit_manual_controls.js`, and that is the whole point: not a `run_*.js`, so auto-discovery never saw it, so it had no baseline, so it sat at 32 mismatches / exit 1 through three procedure re-authorings. Guards that every controlled procedure step names a control the board can actually reveal AND is covered by the browser gate. Count moves with controlled steps, 2 checks each).

Also green: `run_e2e_controls` **59/59** (both F12 reds were stale expectations, fixed
2026-07-25, #150; 35 → 39 on 2026-07-29 when the CVCS droop check was rebuilt to measure
at equilibrium instead of half a time constant into the transient — #194; **39 → 59 on
2026-07-31, #75**, the RPS reset from the board. Worth knowing for the next person writing
checks here: the first cut of those 20 was 18 checks, all green, and deleting the ENTIRE
`rps_reset_permissive` config still left the suite green — the standing turbine trip covers
the first half-second after a scram and the rods are seated before the later checks run, so
the ~1–3 s window where that config is the only thing binding was never asserted. Injection
found it; reading the tests did not).

**One tracked red**, carrying a `note` in `BASELINES`: `run_ops` **59/69** — probes are
tuning targets by design. **Measured 2026-07-31 from `Diagnostic/ops_results.json`:
PWR is 22/22 with ZERO fails; the 10 reds are 6 RBMK + 4 BWR (the tally line says 11 FAILED — those are individual checks, not probes).** The deliberately-red C2
accel-latency probe (#153) was the RBMK seventh and is **green as of 2026-07-31 — because
the defect was fixed, not because the test was weakened**; all three accel probes (PWR,
RBMK *[post]*, BWR) now report the same trip delay at 1× and 256×. This paragraph
previously named **P4** among the open
targets — a P-prefixed probe is PWR, and P4 has passed since 2026-07-22. That error was
then copied verbatim into `run_all.js`'s `note`, so it drifted in two places (#161(b));
both are corrected together. (**P7 resolved 2026-07-22**, CVCS letdown/charging enter the
mass balance through `cvcs_inventory_gain`, see `Diagnostic/OPS_TUNING_REPORT.md` update
2026-07-22b.)

`verify_e2e_ui` also carries **1 strict xfail** pinning the manual's missing unit
conversion (#111) — it errors if the manual ever starts converting.

---

## Running it

No build step. Either open `index.html` (the landing page — the PWR card opens the
control room at `ui/shell.html?engine=pwr`), open `ui/shell.html` directly, or serve
the folder with any static server (`npx serve .` or `python3 -m http.server`).

The control-room UI is `ui/shell.html` (loads engines + layers, wired through
`ui/app.js`). Standalone engine test pages: `test_pwr.html`, `test_rbmk.html`,
`test_bwr.html`.

**Offline / portable:** it already runs from `file://` with no server — nothing loads
anything at runtime. `node tools/make_portable.js` collapses the control room into one
self-contained `dist/Reactor_Dynamics_<version>.html` (~2.5 MB) you can email or carry on a
stick; `tools/make_portable.cmd` is the double-clickable wrapper (builds + zips, and exists
because double-clicking the `.js` gets Windows Script Host, not Node — `800A03EA`).
`test/run_portable.js` is what keeps that possible; read its header before adding any
runtime load. **A batch file must stay pure ASCII** — cmd reads it in the OEM code page, and
one UTF-8 em dash inside an `if (…)` block ends the block early and runs the prose as
commands.

## Running the tests

Plain Node CLI runners (no framework, no `package.json`). Engine/layer files are
global-namespace scripts that attach to `globalThis.RD`; `require()` executes them
into a shared global.

```
node test/run_all.js            # THE AGGREGATE GATE — all 35 runners vs recorded baselines
node test/run_all.js --fast     #   …skipping the 2 slow Playwright gates
node test/run_pwr.js            # PWR scenario suite (all)
node test/run_pwr.js <name>     # one scenario by key, e.g. flagship_tmi
node test/run_rbmk.js           # RBMK suite
node test/run_bwr.js            # BWR suite
node test/run_scenarios.js      # all flagship + library scenarios
node test/run_campaign.js       # PWR training campaign gate (structural + functional)
node test/run_autoctl.js        # control-layer automation gate
node test/run_ops.js            # engine-under-M4 ops probes (FAILs = tuning targets)
node test/run_m4.js … run_m7.js # per-layer stack tests
node test/run_contract.js       # §6.3 true_state contract vs getTrueState() (static; both directions)
node test/run_e2e_controls.js   # service-level control plumbing
node test/run_procedures.js     # manual procedures replay (strict known-fails annotated)
node test/run_meltdown.js       # PWR core-damage / meltdown paths (strict xfail; 8/8 green)
node test/run_meltdown.js MD-5  # one path by id
node test/run_procedures_stack.js          # the SAME procedures through M4+M5+M6 (see below)
node test/run_procedures_stack.js pwr_startup   # one by id
node test/run_procedures_stack.js --lineup=bare # the noDefaults/campaign lineup
node test/measure_stack.js --for=12h --every=1h --watch=tavg_c,pressure_mpa
                                # TAKE A NUMBER from a long FULL-STACK evolution (see below)
```

`test/ops_*.js`, `test/*_harness.js`, and `test/verify_*.js` are supporting
harnesses. Ops-probe FAILs are tuning targets, tracked in
`Diagnostic/OPS_TUNING_REPORT.md`. `run_e2e_controls.js` and `run_procedures.js`
are PART OF THE GATE LIST — both drifted red unnoticed once because they weren't
listed (2026-07-19 review). **`run_all.js` discovers `test/run_*.js` and
`test/verify_*.js` automatically and fails on any runner it has no baseline for**, so
a new gate cannot go unlisted again — add it to `BASELINES` when you add the runner.

### Know which LAYER a gate runs at (this has bitten us three times)

A runner that holds a `ControlFailureLayer` still is **not** full-stack.
`ControlLayer.stepAutomation()` and `engageDefaults()` have **exactly one production
caller each — both in `layers/simulation_service.js`** (:176, :152), as does
`engine.getStartupLineup()` (:156-159). So anything that stops below M5 runs with **the
automation-channel runtime never ticking and no channel ever engaged**, and without the
free-play lineup. Since `feed_sg` (the three-element feed controller that *replaces coupled
feed as the level backbone*), `cvcs_makeup` and `boron_conc` are all `defaultOn`, such a
harness is testing a plant the player never gets.

| layer | runners |
|---|---|
| **engine-direct** | `run_pwr`, `run_rbmk`, `run_bwr`, `run_meltdown`, `run_procedures` |
| **engine + M4** (looks full-stack, isn't) | `run_ops`, `run_behavior`, `run_m4` |
| **full stack** (M4+M5+M6) | `run_procedures_stack`, `run_m5`, `run_m6`/`run_m6ph` (integration halves), `run_m7`, `run_autoctl`, `run_campaign`, `run_checklist`, `run_scenarios`, `run_e2e_controls` |
| **browser** | `verify_e2e_ui`, `verify_manual_follow` (the latter never plays the sim — control-surface reachability only) |
| **static** (source/doc/registry consistency — the plant is never stepped) | `run_hr3`, `run_hardrules`, `run_contract` (resets the engine to read its field list, never runs it), `run_inspect`, `run_flags` |

Engine-direct is the right choice for isolated-physics acceptance; the mistake is *relying*
on it for anything the control layer decides. **When you write a procedure, scenario, or
behaviour assertion, ask which layer owns the effect you are asserting.** Known open
consequences: **#209** (`run_behavior`/`run_ops` certify on a lineup that never ships),
**#206**/**#208** (procedures green engine-direct, broken under the stack).

**To take an ad-hoc number, use `node test/measure_stack.js`** — full stack, any IC/duration/
scheduled commands, US-first units, and it stamps the LAYER into its own output so a
wrong-layer figure is visible in the artifact (#266). **Never drive a measurement with
`svc.start()`**: it arms `setTimeout(broadcastMs)` and advances in WALL time — measured, 5.0 s
of wall bought 48.0 s of sim at 10×, which is why #266 believed a long full-stack ride was
impossible and published two engine-direct numbers instead (one 13× wrong). Driving `tick()`
directly, 12 plant-hours is **~35 s** and cost is linear in sim duration; per cycle it is
**87.9 % `engine.step`**, so there is no per-cycle overhead worth optimising.

## Definition of done

A change is not finished until the gates it touches are green (at or above the
baselines in _Project status_). Runners print `PASS`/`FAIL` per test and a tally.

- **Any engine or scenario change** → the affected `run_<plant>.js` and `run_scenarios.js`.
- **Control-layer change** → `run_autoctl.js` **and** `run_m4.js`; check `run_ops.js`
  for regressions (don't turn a `PASS` into a `FAIL`).
- **Scenario / campaign / instructor change** → `run_campaign.js` (must stay
  **51/51**), `run_m6.js`, `run_procedures.js`.
- **UI change** → `run` the app and drive the affected flow (see `/run` and the
  headless Edge workflow); `verify_e2e_ui.js` must stay **PASS**.
- **Snapshot/contract or save-format change** → old saves must still migrate (see the
  migration-note pattern in `CHANGELOG.md`); re-run `run_m7.js`. **A new/renamed/removed
  `true_state` field also needs its §6.3 line in `Blueprint/CONTEXT.md`** — `run_contract.js`
  fails until it has one, and fails again if a documented field disappears (#225).
- **Any `Manuals/*.md` content change** → three steps, in order, or `run_manual_rev.js`
  reddens: (1) add a row at the **top** of the table in `Manuals/00_REVISION_HISTORY.md`
  (newest first — the set revision is **set-wide**, one number for all 13 documents);
  (2) `node tools/stamp_manual_revision.js` to propagate it and re-seal the content
  digests; (3) `node tools/pack_manuals.js` so the in-app copy carries it. The digest is
  the point: **editing a chapter without recording it is a red gate**, which is how six
  changes (#247, #248, #251, #260 ×2, the gpm scale fix, #263) came to be missing from
  the history while ten chapters still read `Revision: 0`.
- **Then update** `CHANGELOG.md`, the `Project status` section above, and
  `Blueprint/BUILD_DECISIONS.md` if a decision or flag changed.
- **On release (merge `develop` → `main`)** → **SUSPENDED, no version bump** *(OWNER
  DIRECTIVE, 2026-07-31: "we are not doing version bumps when releasing to main until the
  public release.")*. Merge to `main` with the gates green and **nothing else**: no new
  `Alpha X.Y.Z`, no `changelog.html` entry, no `site/release.js` bump, and **leave
  `CHANGELOG.md`'s `## [Unreleased]` standing** — work accumulates there until the public
  release, which takes one version for the lot. `run_release.js` stays green because it
  gates *agreement* between the three, not the act of bumping, and none of them move.
  **This was already true and this file did not say so** — `site/release.js` went to
  `Pre Alpha` in `144a7e8` on 2026-07-31 and the release that afternoon shipped with no
  bump, no entry and no tag, while the text here still demanded all three. Launch day is
  tracked as **#282** (reset to `Alpha 1.0.0`, write the public changelog, restamp the
  manual set); read that issue, not this paragraph, when the suspension lifts.
  The suspended procedure is below under *Website changelog & version numbers*; restore it
  at the public release, and read it then rather than now.

---

## Issue tracking (GitHub) — the owner's preferred workflow

**Open items belong in GitHub issues**, not only in `Diagnostic/` prose. When you find a defect,
a gap, or a deferred decision that outlives the session, file it.

Repo: **`TH462/Reactor-Dynamics`**. The `gh` CLI is installed **per-user** (the MSI needs admin
and fails with 1603 from a non-elevated session, so it was installed from the portable zip):

```
C:\Users\Tim H\AppData\Local\Programs\gh\bin\gh.exe     # on the user PATH
"/c/Users/Tim H/AppData/Local/Programs/gh/bin/gh.exe"   # Git Bash form (quote it — space in the path)
```

If `gh: command not found` in a shell that predates the PATH edit, prepend it:
`export PATH="$PATH:/c/Users/Tim H/AppData/Local/Programs/gh/bin"`.

Auth is already done (`gh auth status` → logged in as `TH462`). **`gh auth login` is
interactive — you cannot run it**; ask the owner to run it with the `!` prefix if the token
ever expires.

```
gh issue list   --repo TH462/Reactor-Dynamics --limit 30
gh issue view   <n> --repo TH462/Reactor-Dynamics
gh issue create --repo TH462/Reactor-Dynamics --title "…" --body-file <path> --label …
gh issue edit   <n> --repo TH462/Reactor-Dynamics --body-file <path>
gh issue close  <n> --repo TH462/Reactor-Dynamics --comment "…"
```

- **ALWAYS add the `Claude` label to every issue you touch** (`--label Claude` on create,
  `gh issue edit <n> --add-label Claude` otherwise). It means **"Claude worked on this"** —
  not just authorship — so apply it when you create an issue, comment on one, or do the work
  it tracks. It exists so the owner can see agent involvement at a glance.
- **Draft long bodies to a file and use `--body-file`** — `inbox/` is gitignored, so drafts
  don't pollute the repo. Inline `--body` mangles multi-line markdown.
- **Labels — four required axes** (scheme revised 2026-07-25; the canonical definition is
  **GitHub issue #61**, which is self-contained — the `PROJECT_WORKFLOW.md` it used to cite
  never existed). Every issue gets one of each:
  - `priority-critical` · `priority-high` · `priority-medium` · `priority-low` — by
    **consequence**, not effort.
  - `type-bug` · `type-tuning` · `type-feature` · `type-enhancement` · `type-test-gap` ·
    `type-docs` · `type-cleanup` · `type-decision` · `type-process`. `type-bug` = the model is
    *wrong*; `type-tuning` = structurally right, the number reads badly.
  - `system-physics` · `system-control` · `system-service` · `system-instructor` ·
    `system-hmi` · `system-scenarios` · `system-test` · `system-docs` · `system-web`
  - `plant-pwr` · `plant-rbmk` · `plant-bwr` · `plant-shared`

  Then `status-*` only when it applies: `status-on-hold` (RBMK/BWR — pair with the plant
  label), `status-needs-ruling`, `status-deliberate` (**known and intentional — do not "fix"**,
  e.g. the deliberately-red C2 probe, the B3 known-fail), `status-verified` (claim re-checked
  against current source, not inherited from a stale doc).

  **Two labels the owner added 2026-07-31** *(OWNER DIRECTIVE, 2026-07-31: "The review tag
  is for when the ai wants me to review something before closing the issue"; "Add an owner
  review tag and a 'work next' tag to issues")*:
  - **`status-owner-review`** — the work is **done and gated**; you want the owner to look
    before it closes. Not the same as `status-needs-ruling`, which means you are *blocked*
    and have delivered nothing. Use it when you shipped something with a judgement call
    inside it — a recategorisation, a threshold, a wording choice — and the owner should
    see the call before it becomes history. **Say what to look at**, in one line, or the
    label just means "read the whole thread". **Do not close an issue carrying it** without
    the owner's word.
  - **`status-work-next`** — the owner's work order: pick this up next. Owner-applied by
    convention; do not add it to your own issues to promote them.
  - **`status-work-complete`** — built, gated and pushed; nothing left to do on the issue
    itself. It is **not** the same as closed: an issue can be complete and still open
    because it is waiting on a review, a release, or a decision on a follow-up. Apply it
    with the gate result in the comment, and **clear `status-work-next` when you do**.

  **`status-deliberate` must name who decided it, and when** *(added 2026-07-27)*. The label
  turns any past call into standing law, so a comment on the issue has to say either
  `OWNER RULING (YYYY-MM-DD): "<their words>"` or "<agent>'s call, owner-approved
  YYYY-MM-DD" — otherwise it is one agent's preference wearing the project's authority.
  An unattributed `status-deliberate` is advisory: weigh it and say you did.

  Retired — do not apply to new issues: `assign-*` (use GitHub assignees), `type-refactor`
  (→`type-cleanup`), `type-design` (→`type-decision`), `system-api`/`system-state`
  (→`system-service`), `ui`/`ui-ux` (→`system-hmi`), the GitHub defaults `bug`/`enhancement`/
  `documentation`, and the legacy `phase-*`/`chief`/`grok-build`/`technical`/`decision`/
  `workflow` tags. They are left in place on old issues, not deleted.
- **Cross-link related issues by number** (`#122`) once both exist.
- Keep the durable engineering record in `Diagnostic/TUNING_LOG.md` **and** file the issue —
  the log is the narrative, the issue is the tracked unit of work.

## Branching & workflow

**Commit ongoing work to `develop`, not `main`.** `develop` is the active
integration branch; `main` is stable/release. Do not commit straight to `main`.

- **New work** → branch from / commit on `develop`.
- **Releasing** → merge `develop` → `main` and push both, only when gates are green.
  **Immediately before the merge, add the website changelog entry + version number.**
- Keep `develop` current with `main` (fast-forward) before starting new work.

> **The repo IS public and `main` IS protected — releasing is a PR** (2026-07-30, #196).
> A branch ruleset requires a pull request before merging to `main`, blocks force-push and
> deletion, and allows only the merge method, so `git push origin main` is **rejected** and
> the direct merge above no longer works. Approvals are set to **0** deliberately — GitHub
> forbids approving your own PR, so any higher number would block every merge on a
> solo-maintained repo. Use:
>
> ```
> gh pr create --base main --head develop --title "Release Alpha X.Y.Z — <headline>" --body-file <path>
> gh pr merge --merge          # --merge, NOT --squash: squashing flattens the release history
> git checkout develop && git merge --ff-only main && git push origin develop
> git push origin --tags       # tags are pushed separately; the PR does not carry them
> ```
>
> Everything else is unchanged — gates green first, changelog entry and version bump
> **before** opening the PR, annotated tag on the merge commit. Check whether the ruleset
> is actually on (`gh api repos/TH462/Reactor-Dynamics/rulesets`) rather than assuming:
> until #196 step 3 lands, the direct merge is still correct.

### Website changelog & version numbers

> **SUSPENDED until the public release — do not do any of this** *(OWNER DIRECTIVE,
> 2026-07-31: "we are not doing version bumps when releasing to main until the public
> release.")*. Everything in this subsection is on hold: no version bump, no
> `changelog.html` entry, no `site/release.js` change, and no `CHANGELOG.md` `[Unreleased]`
> roll. Merging `develop` → `main` is now gates-green-then-merge, nothing more. It is kept
> here rather than deleted because it resumes at the public release — **which then takes ONE
> version for everything that accumulated**, not a replay of the skipped bumps. The digit
> rules below are what that one version will be chosen with.

The public site has a **player-facing** changelog at **`changelog.html`** — separate
from the developer `CHANGELOG.md`. **Every release gets a version number and a
`changelog.html` entry — required, not optional; do it as part of the merge.**

- **When** — immediately *before* merging `develop` → `main`. One entry per release.
- **Version** — `Alpha X.Y.Z` = **Platform . Feature . Refinement**. Read the top entry
  and bump the highest-significance digit in the release:
  - **X** platform milestone (new reactor type, engine overhaul, alpha→beta). Rare.
  - **Y** a **major change or a genuinely new capability** — something that did not exist
    before and that you would list on the Roadmap. **Resets Z to 0.**
  - **Z** everything else — **including player-facing changes and fixes**, as long as they
    improve something the sim already did.

  **Y IS FOR NEW THINGS, NOT FOR VISIBLE THINGS** *(OWNER DIRECTIVE, 2026-07-31: "I think we
  should have the y part of the change number be for major changes or feature additions in
  order to reduce the change number blowup. Z is for smaller changes and fixes even if they
  are player facing.")*. This rule used to read "**Y** — a new player-facing feature", which
  caught nearly every release, because almost everything here is player-facing eventually.
  Measured: the version went **1.2.0 → 1.11.0 in eight days**, and the owner then asked
  whether to roll it back (recommended against — the runaway was the *rule*, not the number;
  see `CHANGELOG.md` 2026-07-31). **The operative test: could you add it to the Roadmap as a
  line item?** New system, new scenario, new mode, new page → **Y**. Better/clearer/fixed
  version of something already there → **Z**, however visible it is.

  **Do not trust a version written here** — read the top entry of `changelog.html` and
  `site/release.js`, which must always agree with each other. (This line said `1.6.1` while
  the site was on `1.8.2`.) `run_release.js` gates that agreement but explicitly **not** the
  digit choice: which digit fits is judgement and is not parseable.
- **The entry** — add a new `<article class="log-entry">` at the TOP (newest-first):
  the **version** (`<span class="log-ver mono">Alpha X.Y.Z</span>`), the **date**
  (visible text *and* `datetime="YYYY-MM-DD"`), and a brief **player-facing** summary.
  **Style: concise and factual** — one line per change, lead with the change, no marketing
  or filler. Copy the template in the file's `ADDING AN ENTRY` comment.
- **Not** the same as the `RD_VERSION` deploy stamp (`site/version.js` — git SHA Vercel
  stamps at build time).

---

## Code conventions (how the code is wired)

Read this before editing any source file — the wiring is deliberate and easy to break.

- **No module system. Do not add `import` / `export` / `require` to source files.**
  Every file in `engines/`, `layers/`, `scenarios/`, and `ui/` is a plain
  global-namespace script that attaches to `globalThis.RD`. In the browser they load
  via `<script>` tags in order; the Node test runners call `require()` only to
  *execute* each file into the shared global. ES-module/CommonJS syntax inside a source
  file breaks both load paths.
- **Load order matters.** `pwr_config.js` / control modules load before the engine
  files that consume them (see the ordered list in any `test/run_*.js` and `ui/shell.html`).
- **File naming.** Plant-specific files are prefixed `pwr_` / `rbmk_` / `bwr_`.
- **Hard Rules are non-negotiable.** Before changing engine behaviour or the data
  contract, read the **Hard Rules** in `Blueprint/CONTEXT.md` §3 — **ten rules, and the
  list is meant to stay short.** Reorganized 2026-07-29: architecture (HR1–HR6) is split
  from practice (HR9, HR10, HR11, HR12); each rule now names its **guard**; the *how* — worked
  cases, failure modes, procedure — moved to **`Blueprint/SOP.md`**, which is advisory,
  not binding. HR7 (failure taxonomy → §11) and HR8 (params-in-code → §8) were retired
  from §3 as a convention and a scope boundary; their numbers are not reused, because
  ~580 citations point at these numbers.
  The five you will actually trip over: **HR1** instruments-vs-truth · **HR5** commands
  only flow down through the service · **HR9** the plant is the ground truth, content
  follows the plant · **HR10** a passing test is not evidence the mechanism is right ·
  **HR12** an assertion about plant dynamics must be MEASURED — step the plant and quote
  the number *(OWNER RULING, 2026-07-29: "if you make assertions about plant dynamics, you
  must back it up by testing them.")*. **HR11** (a ruling needs a date + the owner's
  verbatim words, or it is advisory) was extracted from inside HR9 — it is cited constantly
  and was unfindable.
- **Snapshot / save compatibility is a contract.** New snapshot fields must migrate
  older saves — follow the migration-note pattern in `CHANGELOG.md`.

### Authoritative vs. scratch

Source of truth: `engines/`, `layers/`, `scenarios/`, `ui/`, `test/`, `tools/` (code)
and `Blueprint/`, `Manuals/`, `CHANGELOG.md` (docs). **Not** source of truth — don't
mine these for intent: `terminals/` (raw session logs), `inbox/` (handoff drafts),
`mcps/`, `node_modules/`, and the `Diagnostic/*.json` dumps (the `.md` reports are
curated). **Local-only (kept out of the public GitHub repo):** `terminals/`, `mcps/`,
`inbox/`, `Diagnostic/*.json`, `GO_PUBLIC_CHECKLIST.md`. (**Not** `CLAUDE.md` — it is tracked
and goes public with the repo, as line 6 says.) The curated
`Diagnostic/*.md` reports ARE published.

---

## The specification (`Blueprint/`)

**To build a module, read `CONTEXT.md` plus that one module's spec — nothing else.**

- `CONTEXT.md` — shared interfaces, hard rules, data contract, scope, build map.
- `DESIGN_COMPANION.md` — vision, rationale, deliberate exclusions, v2 roadmap.
- `M1`–`M8` module files — full implementation spec for each buildable unit.
- `M4b_control_layer.md`, `M5_*`, `M6*` — expanded control/service/instructor specs.
- `BUILD_DECISIONS.md` — running log of what was decided and why during the build.
- Feature specs: `pwr_synoptic_prerequisites.md`, `pwr_training_campaign.md`,
  `load_mode_spec.md`, `new_diagram_controls.md`, `OPERATOR_MANUAL_PLAN.md`.

**Build order:** M1→M2→M3 (engines, each tuned until its scenario suite passes) → M4
→ M5 → M6·PH (placeholder instructor) → M7 (validate wiring) → M8 (UI) → M6 (real
instructor + flagship scenarios).

---

## Domain conventions

- **Instruments vs truth.** Gauges, alarms, and automatic protection read *instrumented*
  values (lag, noise, possible failure). True state is available only as an explicit
  diagnostic overlay. Never soften the gap — the dissonance is the lesson.
- **Two registers.** Every label/instructional string exists in a **Learning** register
  (plain language) and an **Industry** register (real plant terminology).
- **Units.** SI internally (MPa, °C, %). The UI has a display-unit toggle (scoped OFF for the PWR board, which is US). **US customary FIRST with SI in parentheses — `2235 psi (15.41 MPa)`, `565 °F (296 °C)` — in the `Manuals/` set AND in everything you hand the owner**: chat replies, issue bodies and comments, commit messages, `Diagnostic/` entries *(OWNER DIRECTIVE, 2026-07-29: "also add a gh issue to add to claude.md to always give me imperial numbers not SI.")*. Temperature DIFFERENCES and RATES (subcooling margin, leg ΔT, DNB margin, deadbands, heatup/cooldown rates) convert ×9/5 with NO offset — this is the one that gets written wrong: 41 °C of subcooling is 73.8 °F, not 105.8, and 21.8 °C/hr is 39.2 °F/hr. `test/run_manual_units.js` enforces it across the manual and the board-facing copy (`ui/manual_procedures.js`, `ui/diagram/board/pwr_board_inspect.js`); **agent prose is not gateable**, like HR10 and HR12 — a green run does not cover it. Engine internals stay SI and do not move: command payloads, config constants, `true_state`.
- **Plant MODES** use commercial numbering, written **Mode N, Name** (e.g. *Mode 1, At
  Power*). Do not confuse with turbine load modes (Follow / Manual / Disconnected).
- **This is an educational lumped-parameter plant,** not a full-scope replica of a
  licensed reactor. Where a simplification understates reality, say so plainly.

---

## Licensing (for public release)

Dual-licensed, © 2026 Timothy Holt: **code → AGPL-3.0** (`LICENSE`), **manuals &
training prose → CC BY 4.0** (`LICENSE-CONTENT`). Public terms/disclaimer at
`legal.html`. When the repo goes public, fill the AGPL §13 source-repo URL in
`legal.html` §5 and `README.md` (placeholders are in place). See the
`licensing-and-go-public-prep` memory for the full checklist.
