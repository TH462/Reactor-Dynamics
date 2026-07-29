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

> **You may not be the only agent in this repo. Check both lanes before you edit.** Two sessions
> in one working directory will overwrite each other's files and sweep each other's
> work into the wrong commit — this is not hypothetical, it happened on 2026-07-29 and
> cost a set of manual edits their attribution. A **branch does not isolate anything**;
> only a separate working directory does.
>
> | Working tree | Branch | |
> |---|---|---|
> | `C:\grok_build\Reactor_Dynamics` | `develop` | **the main working branch — use this unless it is taken** |
> | `C:\grok_build\RD_workbench` | `workbench` | the overflow lane, for when a second agent is already on `develop` |
>
> - **First thing in a session, check BOTH trees.** Occupancy is uncommitted modified files
>   *plus* a **recent** commit — run all three lines, do not stop at the tree you are standing in:
>   ```
>   git worktree list
>   git -C C:/grok_build/Reactor_Dynamics status --short && git log develop   -1 --format='%h %cr'
>   git -C C:/grok_build/RD_workbench   status --short && git log workbench -1 --format='%h %cr'
>   ```
>   A commit inside the last hour or so means a live session; hours old means history.
>   **Unmerged commits on `workbench` are NOT occupancy** — carrying work that has not reached
>   `develop` yet is what the lane is *for*. On 2026-07-29 it held five such commits and was
>   completely free. **The check is not one-shot: re-check before your first commit.** `develop`
>   was quiet in one session's t=0 snapshot and picked up another session an hour in.
> - **On a positive, WARN AND ASK — do not move on your own** *(OWNER RULING, 2026-07-29:
>   "Maybe it shouldn't be automatic. The agent should warn the user and ask if they should use
>   workbench." — and, refining it: "it should also check if there's an agent working in the
>   workbench before moving.")*. Say what you found in each lane (which files, which commit, how
>   recent), recommend, ask; SOP §5 shape. The detection misfires both ways — another live
>   session, the owner's own uncommitted edits, and your own leftovers read identically, and only
>   the owner can tell them apart cheaply. **Investigating in place while you wait is fine;
>   editing, writing probe files and committing are not** — collisions come from writes.
>   Normally recommend *yes, switch* when `develop` is busy and the workbench is clear: the risk
>   is asymmetric, a needless move costs one merge. **If BOTH lanes look occupied, do not pick
>   one** — say so and offer a third tree (below); that is the owner's call, not a default.
>   **Absent a reply: stay read-only and say what you are waiting on** *(OWNER RULING,
>   2026-07-29: "lets go with your recommendation.", on the recommendation to cut the earlier
>   draft's no-reply default)* — **the heuristic never gets an action.** The first draft moved to
>   the workbench on its own whenever it looked clear; that was an agent proposal marked "for the
>   owner to rule on" and never ruled on. It also fires on the *common* false positive — your own
>   leftovers in the tree you just started in — while the case where guessing wrong is genuinely
>   expensive is the case where the owner is present to answer in seconds.
> - **Starting on `workbench`: `git merge --ff-only develop` — and when it refuses, do a real
>   `git merge develop`.** It is not a feature branch, it exists only so a second agent has
>   somewhere to work, but `--ff-only` fails whenever the lane still carries unmerged work,
>   which is the normal case (`fatal: Not possible to fast-forward, aborting.`). Expect the
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
**29 runners at baseline**. Open backlog is dominated by RBMK/BWR operability (on hold) plus
a handful of UI/doc items.

**Recent themes** — **max 5 bullets, newest first; adding one means deleting the oldest.**
They are a reading aid, not a record: the full history is `Diagnostic/TUNING_LOG.md`, and
anything here that is standing procedure rather than news belongs in the list below it.

- **The plant can heat itself up now — the pump-heat netting is deleted (2026-07-29, #251).**
  The SG used to subtract RCP heat out of its own steam balance (`max(0, Q_sg − Q_pump)`,
  booked as "blowdown/ambient losses"), sized to cancel it identically at every flow because
  the turbine drew steam for core power alone. Consequence nobody had costed: **a heatup on
  pump heat was mathematically impossible** — measured, a stable attractor at 218.69 °F
  (103.72 °C) with ΔT pinned at `Q_pump/h_sg`, forever. Now the SG boils everything that
  crosses it and the follow governor draws it, both normalized on **NSSS rated heat** (core +
  pump), which is how a real plant rates its generators. Three things to know: the issue's
  "risky" step — recalibrating `steam_flow_rated` and giving the governor headroom — **was not
  needed**, because normalizing both sides makes rated come out exactly 1.0, so every gauge
  still reads 100 % at 100 %; the **cold IC was spawning synchronised to the grid**
  (`load_mode: 'follow'`, `generator_load = 1e-6`, rotor at rest — #235 fixed half of it), and
  with pump heat real the follow governor cracked to 6.2 % and re-stalled the heatup at
  306.05 °F, so Modes 3/5 now spawn off line on one `onLine` predicate; and **`pwr_mode5_to_mode3`
  was re-authored** — 10.71 plant-hours at 39.8 °F/hr with **no rod motion**, arriving hot and
  still subcritical, which is what Mode 3 actually is. The new gate was verified to **fail**
  with the netting restored. `pwr_heatup` (PWR-N03) is still the nuclear variant — deliberately
  not re-authored, filed as follow-up.
- **The PWR's last HR1 hole is closed — the low-flow trip reads an instrument (2026-07-29,
  #247).** `rcs_flow` is a real elbow-tap channel (% of rated, lag 1 s, injectable
  failures); the `__true_flow__` sentinel is **deleted from every file**, and with it the
  kernel's only PWR-only true_state reference (half of #228). A companion `mfw_isolated`
  status indication replaced the feed channel's read of `true_state.feedwater_isolated` —
  a field `getTrueState()` has **never exposed**, so that stand-down had never once fired.
  Three things to know: a **stuck-high flow channel now masks a real loss of flow** (probed
  — the low-flow trip never fires and `primary_pressure high` catches it instead), which is
  the teaching case the instrument was built for; the setpoint went to the real **90 % of
  rated, blocked below P-7 (10 %)** (#248, owner ruling) — measured, that trips at 1.8 s
  where DNB onset is 10.9 s, so the old unsourced 25 % had been letting DNB happen; and a
  new appended instrument still ships **noise: 0** (the cross-step PRNG rule), so it carries
  `noise_failure` instead — without it an injected `noisy` failure would have been silently
  inert. **`pwr_lof` was re-authored around the stuck channel**, because at 90 % a healthy
  channel means nothing happens at all. **One channel, not 2-of-3, is the remaining declared
  departure** (`Manuals/12` §10.7).
- **Half the full-stack procedure gate was running at a tenth of its declared speed
  (2026-07-29, #245).** `run_procedures_stack` set `timeAcceleration = 10` once; the
  service's fast-forward dropout then returned it to 1× on the first alarm/scram and nothing
  put it back — so **11 of 22 procedures** were judged on a *tenth* of the sim time their
  steps assume, from as early as t = 2 s. Fixed with `svc.attentionStops = false` (a headless
  gate has no operator to protect; `run_autoctl` had already made the same call) plus a
  per-procedure assertion that the run held its declared acceleration, so it cannot recur
  quietly. **Read this before trusting anything in #208:** four of its "RBMK/BWR plant
  defects" (`bwr_startup`, `rbmk_mcp_trip` ×2, `bwr_sbo_rcic`) were this bug and passed on
  the sim time alone — a green there proves the *mechanism*, not that either plant is right.
  It also exposed a stale PWR assertion: `pwr_stuck_porv` step 1 asserted inventory below
  100 % after 30 s, which only ever held because the run was starved — automatic HPI comes
  in at 10.5 MPa and refills past nominal, which is TMI's solid-pressurizer trap and the
  correct behaviour.

- **The Hard Rules were reorganized, and they now have guards (2026-07-29).** §3 is **nine
  rules**, split architecture (HR1–HR6) from practice (HR9, HR10, HR11), each naming its
  guard. HR7/HR8 retired to §11 and §8 — **a demotion out of binding, stated as one**;
  numbers are never reused (~580 citations). HR11 (a ruling needs a date + verbatim words)
  was extracted from inside HR9. The *how* moved to **`Blueprint/SOP.md`** — advisory,
  except §5 which quotes an owner instruction. New `test/run_hardrules.js` guards HR1, HR5,
  HR11. **Read HR1's guard output before trusting it green:** it separates settled
  *exceptions* from tracked *debt*. It declared 5 debts on day one; **4 were paid within
  the week (#247)** and **1 remains** (RBMK, unreviewed, on hold). The split working that
  fast is the argument for it — one list would have called all five "allowed".

- **The board explains itself, and the copy is gated (2026-07-28s, #96).** The System Scanner
  block is now the **inspection surface**: hover → one-line summary, click to expand → full
  description + a link into the manual section that documents the object. Board copy lives in
  `ui/diagram/board/pwr_board_inspect.js` (160 entries, keyed by diagram item id, reached
  through the driver's `inspectItem`); chrome copy stays inline as `data-scanner-hint` /
  `-detail`; gauge and alarm detail is **generated** from `RD.MANUAL` + the protection table.
  Three things to know before you touch it: an item with no entry inherits the **smallest box
  containing it** (geometry, not DOM — tiles are absolutely-positioned siblings); a new
  control/component/indication **fails `run_inspect.js`** until it has its own entry, and a
  manual citation is resolved against the packed markdown, so a dead §number is a red; and
  **hovering must not highlight the object** (owner, 2026-07-28 — the ring an early cut drew
  was "very annoying"), which `run_inspect` pins because the issue text asks for the opposite.



**Standing procedure — not part of the rotation above; these do not expire.**

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
  board change** — it is not in `run_all`. Currently **106/106** (measured 2026-07-29 on
  clean `develop` 5bf366f *and* after #246 — this line said 95/95, which was already stale
  when written down; the count moves whenever a pin is added, so re-measure rather than
  trusting it. History: 59 before the #235/#236 pins, +20 pipe-state/board-defect pins,
  +2 ROD AUTO, +3 from the #237 comment items, +11 for the generator FOLLOW/MAN/OFF
  selector (#230); the previously recorded "60/60" never matched the code either,
  #235 finding 6).
  **Read the tally from the harness's own summary line** (`ALL n CHECKS PASS` /
  `n FAILURES / n`) — scraping the page for the last `n/n` pair picks up unrelated
  numbers and reports a nonsense total.
- **Measure the board, don't eyeball it.** Mount it headless and read `RD.PwrBoard.ports()`:
  every port's scanned world coordinate is there, so an alignment claim is a subtraction, not
  a judgement. Two of #231's three filed leads were wrong and only this said so.

- **Verify a claim before you act on it.** Roughly half the issues touched on 2026-07-27 were
  stale or mis-framed — leaks already fixed, "reasons" that measurement disproved, premises
  copied between files. Read `Diagnostic/TUNING_LOG.md`'s top entry, then check the code.
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
> `test/run_all.js`, not as prose here. Run it; it compares all 27 runners against that
> map and exits non-zero on any drift. Prose baselines are what rotted (this section
> claimed `run_m5` **19/19** while its own status text said 18/19 — issue #161). **If
> you move a number, update `BASELINES` and this section together.**

```
node test/run_all.js            # all 27 runners (~6 min)
node test/run_all.js --fast     # skip the 2 Playwright gates (~2.5 min)
node test/run_all.js --only run_pwr,run_ops
node test/run_all.js --record   # print observed results as a BASELINES block
```

Drift is **symmetric** — a runner scoring *better* than baseline also fails, so a red
turning green has to be acknowledged (update the baseline, close the issue) instead of
being silently absorbed. Same convention as the strict xfails in `run_meltdown` /
`run_behavior`.

Green at baseline: PWR **32/32 (201 checks)**, BWR **15/15**, RBMK **23/23**, campaign **51/51 (3026 checks)**,
`run_m4` **25/25 (135 checks)**, `run_m5` **19/19**, `run_m6` **17/17 (102 checks)**, `run_m6ph` **8/8**, `run_autoctl` **20/20**,
`run_behavior` **38 pass / 0 xfail**, `run_meltdown` **9 pass / 0 xfail**,
`run_meltdown_stack` **3/3 (21/21 checks)**,
`run_procedures` **22/22 (102/102 checks)**,
`run_procedures_stack` **22/22 (178/178 checks, 2 strict xfails — both RBMK/BWR #208; the 7
`pwr_heatup` xfails cleared 2026-07-26c/d via #206 + #210, and FOUR more on 2026-07-29 that
were never plant defects at all — the harness was running 11 of its 22 procedures below the
10× it declares, so their steps got a tenth of their sim time (#245))**, `run_checklist` **24/24**, `run_scenarios`
**3/3**, `run_m7` **OK**, `run_flags` **16/16 (290 checks)**, `run_inspect` **7/7 (35 checks)**,
`run_contract` **84 checks / 0 failed**, `run_hr3` **29 checks / 0 failed**, `run_hardrules` **22 checks / 0 failed (1 declared HR1 debt — RBMK, on hold)**, `run_manual_units` **0 failed** (scored on failures only — the coverage count moves on ordinary prose edits, so it is deliberately NOT in the baseline), `verify_flags_ui` **48/48**,
`verify_e2e_ui` **PASS (16 screenshots)**, `verify_manual_follow` **PASS (84 checks)**.

Also green: `run_e2e_controls` **35/35** (both F12 reds were stale expectations, fixed
2026-07-25, #150).

**One tracked red**, carrying a `note` in `BASELINES`: `run_ops` **57/68** — probes are
tuning targets by design. **Measured 2026-07-27b from `Diagnostic/ops_results.json`:
PWR is 21/21 with ZERO fails; all 11 reds are 7 RBMK + 4 BWR**, and the deliberately-red
C2 accel-latency probe (#153) is one of the RBMK seven (*ABUSE [post] time-acceleration*),
not a separate twelfth item. This paragraph previously named **P4** among the open
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

## Running the tests

Plain Node CLI runners (no framework, no `package.json`). Engine/layer files are
global-namespace scripts that attach to `globalThis.RD`; `require()` executes them
into a shared global.

```
node test/run_all.js            # THE AGGREGATE GATE — all 27 runners vs recorded baselines
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
- **Then update** `CHANGELOG.md`, the `Project status` section above, and
  `Blueprint/BUILD_DECISIONS.md` if a decision or flag changed.
- **On release (merge `develop` → `main`)** → add the player-facing `changelog.html`
  entry with the next **`Alpha X.Y.Z`** version (see below).

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

> **Once the repo is public, releasing becomes a PR.** Going public (#196) turns on a
> branch ruleset requiring a pull request before merging to `main`, at which point
> `git push origin main` is **rejected** and the direct merge above stops working. Use:
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

The public site has a **player-facing** changelog at **`changelog.html`** — separate
from the developer `CHANGELOG.md`. **Every release gets a version number and a
`changelog.html` entry — required, not optional; do it as part of the merge.**

- **When** — immediately *before* merging `develop` → `main`. One entry per release.
- **Version** — `Alpha X.Y.Z` = **Platform . Feature . Refinement**. Read the top entry
  and bump the highest-significance digit in the release: **X** platform milestone (new
  reactor type, engine overhaul, alpha→beta — rare); **Y** a new player-facing feature
  (resets Z to 0); **Z** bug fixes / tuning / small refinements. **Do not trust a version
  written here** — read the top entry of `changelog.html` and `site/release.js`, which must
  always agree with each other. (This line said `1.6.1` while the site was on `1.8.2`.)
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
