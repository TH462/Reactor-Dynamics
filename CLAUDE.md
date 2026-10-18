# CLAUDE.md — coding-agent instructions

Orientation for coding agents in this repo; `README.md` is the public overview. Tracked in git
since 2026-07-29 — edit it in the commit that makes it true. **Loaded every turn: keep it short.**
`test/run_doc_budget.js` caps it; when the cap binds, cut — never raise the number. Every dated
rule below has the owner's verbatim words in **`Blueprint/RULINGS.md`**; that ledger is what makes
the short line binding. In doubt about a number, trust as-built engine/config values over prose.

**When compacting, preserve:** modified files, gate results, owner rulings given this session,
lane/branch state.

## How to reply

- **Be brief — facts, numbers, decisions** (owner, 2026-07-30; 2026-09-11). Lead with what changed
  and the number that shows it. Cut restating the request, narration, unasked reasoning, victory
  laps. Keep measurements, deltas, what broke and why, what changes his next move. Detail goes in
  the commit, the issue or `Diagnostic/TUNING_LOG.md`. Token-efficient, never at the cost of quality.
- **One number, two habits** (owner, 2026-08-06): the only hard cap is this file's word budget.
  Chat default: lead with the answer in ~150 words; expand when asked or when a table of
  measurements is the answer. Write-ups get a content rule, not a length: record the trap and the
  numbers that prove it; do not restate the diff.
- **US customary first, SI in parentheses** in everything he reads — chat, issues, commits,
  `Diagnostic/`, `Manuals/` (owner, 2026-07-29): `2235 psi (15.41 MPa)`. Differences and rates
  convert ×9/5 with no offset (41 °C of subcooling is 73.8 °F). Engine internals stay SI.
  `run_manual_units.js` gates the manual; prose is not gateable.
- **Spell out every code on first use** in anything he reads (owner, 2026-08-14): `L0` → Layer 0,
  water properties; `HR9` → Hard Rule 9, the plant is ground truth; `A4`, `E09`, `P-11`, `CA-15`,
  `§8(2)` likewise. Bare codes only inside a document that defines them, or between agents.
- **Ask with the recommendation attached** (owner, 2026-07-29; re-issued 2026-08-14): what he is
  deciding, the options, your pick and why, what you do with no reply. Never "blocked on your
  ruling" with the options somewhere else — no exceptions for brevity. Rank them if there are
  several. Routine calls: make them, state the assumption, move on. `Blueprint/SOP.md` §5.

**End with what is still outstanding** (owner, 2026-07-30; 2026-09-20; 2026-09-25) — last thing
before you stop, scoped to the task in hand:

```
**— STILL OUTSTANDING —**
- <item> — <waits on: his RULING / his PERMISSION (push, merge) / a CLOCK (a gate running)>
**Next:** <the ONE thing you recommend, and why>
**— END STILL OUTSTANDING —**
```

Every item names one of those three. Waiting on none of them is unstarted — do it before you
stop. "Waiting on your yes" is not a category: if you would act the instant he said yes and
nothing in it is irreversible or his to judge, the yes was never load-bearing — make the call,
do the work, say what you did. He cannot monitor; the default is KEEP GOING. Omit the block when nothing is outstanding and say
so in a sentence; show it only when it changed or carries a decision, else one status line. It is
a report: never a substitute for asking when genuinely blocked (SOP §5), never a plan built on an
unmeasured claim (HR12).

**First Principles — a canary, not an essay** (owner, 2026-07-29). Optional, one per reply, never
padded:

```
**— FIRST PRINCIPLES —**
<ONE concern. Two or three sentences, ~50 words.>
**— END FIRST PRINCIPLES —**
```

The blunt read the body would soften. Triggers: you recommend the safe option while a
higher-fidelity one exists (say which you would pick on fidelity alone, #251), or a doubt about
your own work you would otherwise bury. Unhedged, but HR12, HR11 and no-fabricated-sources still
bind; it never authorises an action or excuses a gate.

## Lanes and git — check all trees before you edit

Two sessions in one working directory overwrite each other (it happened 2026-07-29). A branch
isolates nothing; only a separate tree does. Full protocol: `Blueprint/LANES.md`.

| Tree | Branch | |
|---|---|---|
| `C:\grok_build\Reactor_Dynamics` | `develop` | main working lane |
| `C:\grok_build\RD_workbench` | `workbench` | overflow lane 1 — a normal lane, loads this file |
| `C:\grok_build\RD_backshop` | `backshop` | overflow lane 2 — a normal lane, loads this file |
| `C:\grok_build\RD_Audit` | detached | audit lane — never commit from it (`LANES.md` §8, `Blueprint/AUDIT_CHARTER.md`) |

- First thing in a session the `SessionStart` hook (`tools/hook_lane_status.js`) sweeps all trees
  and the `status-wip-*` issue tags; run it by hand if it did not fire. "Could not check" is not
  "clear". The tag is the only signal that is not a guess (owner, 2026-08-04); run both, since an
  agent can work without touching an issue, and when they disagree the tag wins — but a stale tag on a quiet issue with a clean tree is not occupancy
  (owner, 2026-10-02): clear it, say so, carry on. Re-check before your first commit.
- On a positive, **warn and ask — do not move on your own** (owner, 2026-07-29). Investigate in
  place; no edits, probe files or commits until he answers — absent a reply, stay read-only.
- **NEVER MERGE INTO `develop` UNLESS THE OWNER SAYS SO** (owner, 2026-07-31) — fast-forwards
  included; a clean tree is not permission. "Committed on the lane, gated, waiting" is the correct
  end state. **PWR2 (#479) carries a standing hold on top** (owner, 2026-08-14): the bar is the
  whole engine finished, tested and validated — do not propose a merge at each milestone, and no
  "just the docs" carve-outs.
  A lane accumulating commits is the intended state; manage conflicts, do not merge.
- **NEVER PUSH UNTIL HE SAYS SO** (owner, 2026-09-14). Ending a session with nothing pushed is
  correct. A push is what triggers the aggregate gate (below).
- **THE LANES ARE LOCAL — never push `workbench` or `backshop`** (owner, 2026-07-31); GitHub
  carries only `main` and `develop`. `tools/hook_guard_push_merge.js` asks on a push or a
  develop-moving merge and denies a lane push; approval in the prompt is his permission.
- Starting on an overflow lane: `git merge --ff-only develop`, else a real `git merge develop`.
  Guaranteed newest-at-top conflicts: `CHANGELOG.md`, `Diagnostic/TUNING_LOG.md`,
  `Blueprint/BUILD_DECISIONS.md`, the `BASELINES` map in `test/run_all.js` — keep both sides, then
  re-run `run_all` (a mechanical BASELINES merge takes the wrong number silently).
- `Manuals/` merges drop a middle-of-chapter edit silently (a whole §5.5, 2026-08-03): write
  revision rows chapter-qualified with a `§`, and grep the chapter after any merge. `LANES.md` §6.
- Session-log headings name the lane: `YYYY-MM-DD-<lane>-<letter>`, `-a` first, never bare
  (`run_session_labels.js` gates it; `LANES.md` §7).
- New tree: `git worktree add <path> <branch>` plus an `inbox/` directory; commit to your own
  branch. A permanent lane junctions `node_modules` from the primary and is never removed; a
  SCRATCH worktree uses `NODE_PATH` instead, because `worktree remove` follows a junction and
  empties the primary's (`LANES.md` §9).
- Two subagents at once get a scratch worktree each (`LANES.md` §9); brief step 1 is
  `git reset --hard <develop tip>`, and remove the worktree when it merges (owner, 2026-09-29).

## What binds you

(owner, 2026-07-27) ~229,000 words of docs carry ~650 "do not / never / by design" phrases. Four
rules decide what is law:
1. **Binding: the Hard Rules in `Blueprint/CONTEXT.md` §3, and this file.** Nothing else.
   `Blueprint/SOP.md` §1–4 is technique, not authority; its §5 binds because it quotes dated owner
   instructions.
2. `Diagnostic/`, `BUILD_DECISIONS.md` and `Manuals/` are record, not policy — evidence, not orders.
3. Plans expire when executed (`Blueprint/RETIRED.md` indexes deleted documents).
4. A directive with no date and no verbatim owner quote is advisory (HR11). **A dated rule in this
   file whose quote is in `Blueprint/RULINGS.md` is fully binding** — the ledger is the quote.

Blocked by a sentence in a doc? Check which of the four it falls under before deferring to it.

## The four design questions — `Blueprint/DESIGN_CRITERIA.md` is binding

(owner, 2026-08-02) In order, because three are unanswerable until the first is done:
**1. What are the tested numbers?** — a gate, not a vote (HR12). **2. Is it prototypical?** — can
you cite it; unsourceable means UNVERIFIED, not no. **3. What is the educational value?** — the
only legitimate departure from 2, and only declared (`DESIGN_COMPANION.md` §8); test: can the
player reach it on the board, and does something visible change. **4. Does it complicate things
for the PLAYER?** — a veto, it can only say no (orphan control, observability, duplicate
authority, register). §5 lists the per-plant artifacts needed before the RBMK/BWR builds can be
automated (the owner's goal, 2026-08-02); those plants stay on hold.

Q2's yardstick is `Blueprint/CURRICULUM.md` (PWR only; never merge it back into the criteria;
check its status table before citing). All four tiers are ruled and binding for the PWR (owner,
2026-08-03): A = 9 couplings; B = 8 evolutions (a subset — the manual documents 15, a second pass
is owed); C = **Core** (11 casualties: response procedure, board cue, runnable checklist; Core iff
it shows a Tier A coupling under stress; promotion needs a Q0 measurement) vs **Covered**
(documented, injectable, live in free play, no mission); D = adopt existing.

## The plant is the ground truth

- **HR9.** The only question is "what should this plant actually do?" — never "what keeps this
  mission green?". Authority runs physics/prototypicality → ruled plant identity → behaviour
  catalog + acceptance suites → setpoints → authored content → its gates. Content never votes on
  physics and content churn is never an input (owner, 2026-08-07). A mission that breaks after a
  plant change is a canary: presume the content is stale, settle it against the top three levels,
  say which behaviour you treat as truth. `CONTEXT.md` §3; `SOP.md` §1.
- **HR12 — MEASURE IT** (owner, 2026-07-29): any claim about plant dynamics is backed by stepping
  the plant; quote the number, not the verdict. Coverage claims and "X is not built" are the same
  class: prove them by injection — break it and see what notices.
- **PROTOTYPICALITY CLAIMS ARE SOURCED, NEVER RECALLED — RUN AN EVIDENCE PASS** (owner,
  2026-07-28): before changing a plant number on "real plants do X", find the document and cite it
  in the change (ADAMS accession, section, verbatim quote). Recall, another agent's summary and a
  claim already in this repo are not evidence (#220, #230, #205). Before declaring anything
  unsourced run `node tools/find_source.js <regex>` — the corpus spans three lanes' `inbox/sources`.
  `SOP.md` §4; the `pwr-prototypicality-sources` memory.
- **HR10.** A passing test is not evidence the mechanism is right; a test written from observed
  behaviour confirms the wrong parts too. When a change reddens a gate, ask what the gate was
  asserting; if you move a test, validate the new form against the old behaviour as well and say
  which. If you cannot say why a mechanism is correct without citing which tests pass, you have
  not finished. `CONTEXT.md` §3; `SOP.md` §2.
- **Manual first, then auto** (owner, 2026-08-12): establish a system's behaviour with its
  automatic control OFF before testing it ON — every system with an auto mode: pressure control,
  feed, rods, boron, steam dump, ADV, turbine load. On setpoint, a wrong mechanism and a right one paint
  the same board (measured 2026-08-12: a 30 MWe load change moved pressure 0 psi with
  `P_restore_rate_gain` live, +31 psi and −10.7 °F of subcooling without it; 47 runners agreed
  with the hollow plant). Manual-mode acceptance first; the auto row asserts the controller holds
  what manual proved.
- **RBMK AND BWR ARE ON HOLD.** Do not implement, tune, refactor or fix-while-you're-here their
  engines, controls, scenarios, UI or tests; leave their known reds alone. PWR only until the
  owner reopens them — no end date, and they may never be built (owner, 2026-10-18). Shared code
  may change for a PWR need.
- **Verify a claim before you act on it.** Issue comments, file headers, specs and this file age
  fast here (#326: correct when written, wrong hours later). Re-measure on the tree you stand in.

## Start here (the map)

| If you want to… | Read / run |
|---|---|
| Understand the system; why it is built this way | `README.md` → `Blueprint/CONTEXT.md`; `Blueprint/DESIGN_COMPANION.md` |
| Decide whether a change goes in; argue educational value | `Blueprint/DESIGN_CRITERIA.md`; `Blueprint/CURRICULUM.md` |
| Apply a Hard Rule; put a decision to the owner | `CONTEXT.md` §3, then `Blueprint/SOP.md` §1–4 (advisory) and §5 |
| Find the owner's words behind a dated rule here | **`Blueprint/RULINGS.md`** |
| Design anything the owner sees | `Blueprint/TASTE_LOG.md` — his reactions verbatim, the AI-tells list |
| Write player-facing text | checklist steps: `Blueprint/CHECKLIST_WRITING_GUIDE.md`; else `Blueprint/STYLE_GUIDE.md` (both advisory) |
| Play the walkthroughs as a fresh layman / operator | skill `layman-playthrough` |
| Find a deleted document; a trap evicted from this file | `Blueprint/RETIRED.md`; `Blueprint/TRAPS.md` |
| Pick a lane or merge one | `Blueprint/LANES.md` |
| Run an independent audit slice (#221) | `Blueprint/AUDIT_CHARTER.md`; launch in `C:\grok_build\RD_Audit` itself, not its `tree/`; having this file loaded means you are primed and cannot be the auditor |
| Build or modify a module | `CONTEXT.md` plus that one module's spec (`Blueprint/M1`–`M8`) — nothing else |
| Know what changed recently | `CHANGELOG.md` → `Blueprint/BUILD_DECISIONS.md` |
| Operate the plant; look up a setpoint or procedure | `Manuals/README.md` |
| Continue tuning or bug-fixing; known issues | **`Diagnostic/TUNING_LOG.md` first** (status, toolbox, worklog, backlog), then `Diagnostic/*`, `Manuals/ISSUES_AND_FINDINGS.md` |
| Tune plant behaviour | `[tune]` constants in `engines/<plant>/<plant>_config.js`; setpoints in `layers/control/<plant>_control.js`; validate with `run_ops`/`run_behavior`; **run `node tools/perturb_sweep.js` before moving a constant** (#321) |
| Which layer a gate runs at; take a number | skill `gate-layers` |
| File, label or claim an issue | skill `issue-workflow` |
| Edit a manual chapter | skill `manual-edit` |
| Change a walkthrough | skill `walkthrough-change` |
| Bump the version; write the changelog entry | skill `version-changelog`; cutting the release: skill `release-to-main` |

## Project status

_Last updated: **2026-10-18**._ **`gh issue list --state open` is the authority on what is open;
`Blueprint/PWR2_VALIDATION.md` is the engineering record** — a hand-kept list here rotted twice and
was cut (owner, 2026-09-12). **Gate baselines live in `BASELINES` in `test/run_all.js`, never
here**; a tracked red carries its own `note` there — do not re-band one. **The manual set's
revision number advances only at a release** (owner, 2026-08-06): read the top row of
`Manuals/00_REVISION_HISTORY.md`, extend the pending row, never open a new one for an edit.

**Layers** — engines PWR/RBMK/BWR, control (M4), service (M5, with rewind), instructor (M6), test
runner (M7) built; the PWR models a Mode 5 initial condition and the full Mode 5 ↔ Mode 1
transition on integrated physics; UI (M8) is a functional alpha, PWR only.

**Recent themes** — max 5 bullets, newest first, ~80 words each; adding one evicts the oldest
(rescue its trap to the standing list first). Full entries: `Diagnostic/TUNING_LOG.md`.

- **An acceptance threshold at the centre of its render band is a step the board cannot show as
  met** (2026-09-18, #749): `> 1400` refused half of what `toFixed(1)` drew as `1.4e3` — 107 s of
  dark Continue. Grade the band floor on the channel the tile draws; measure the player's route.
- **A latching failure armed after the event it latches on is a no-op that reads as a working
  injection** (2026-09-09, #670): armed at 30–60 s, `stuck_porv_open` saw the valve reseat at
  1985 psia (13.69 MPa). A step's `inject` fires before the event — measure the window.

**Standing procedure** — traps no gate can catch, one line each, **max 25** (owner, 2026-08-10),
gated by `run_doc_budget.js`. Adding one evicts one to `Blueprint/TRAPS.md` (criterion there:
move what a gate already catches). The worked detail behind every line: `TRAPS.md` §"Standing
list, compressed 2026-10-18".

- A check can pin a bifurcation, not a claim (#543, #588): assert the invariant the defect violated; sweep five ulps before trusting a blowdown check; a bound from a local render dates your font stack (179 px here is 206 px on CI, #713).
- A pre-declared reject criterion, or a fixture built at an envelope wall, can outlive its measurement (#378, #524): re-measure the criterion before it rejects anything; move the wall and adjudicate per probe.
- A bracketed template placeholder cites like a number (#380): NUREG-1431's "~30–32 %" survived two evidence passes; Ginna, the anchor plant, says 17 %.
- A ruling names the work, not the thing (#572): "build the 1.5 DPM rod block" named a stop no source has, and the chapter cited the document that refutes it three lines away.
- Before declaring anything unsourced run `node tools/find_source.js <regex>` — three lanes' corpora cannot see each other (#315 §6, `DESIGN_COMPANION` §8.34); its exit 1 is the verdict.
- A coverage or "not built" claim is unmeasured until you break it and see what notices (#286, #562, #570, #573): inherited claims, module headers and the spec itself can be the stale copy — grep for the effect, never the name you expected.
- A filed root cause repeated in four documents was still never re-measured (#403/#433): repetition is not corroboration, and a sourced number is not the whole source ("600 psig" adopted, "(Rate sensitive)" dropped from the same cell).
- Declare a simplification only after measuring the regime it lives in (#347): spray-at-solid held 164 psi under the safeties on the one path never exercised. The TMI-2 securing beat sits before the decision; re-ordering it re-breaks nine missions.
- A passing check can be hollow — seen here: `range()` on a boolean (TR-17); an absence pinning a non-event; a whole-run span; a gate over a hand-kept map; a chapter never opened (#532, #601); a source scan for an unreachable string (#485); a term that is an identity in the tested regime; samples taken on the defect (#542); a degenerate latch under a no-dt harness; the observer itself (#436); `isFinite(null)` is true (#555); a write asserted instead of its effect (#507, #540); a mutation blinded by a neighbour's fix (#544) — after a fix, re-run the whole file's injections.
- A tolerance band claims what it excludes is harmless — measure that (#348: a 1-point band hid 35 % interlock chatter) and check the band's provenance before retuning inside it (#598: a hard-coded 40–70 % tile band, 15 points off program).
- Adjudicate a physics change's red probes one at a time (#364/#365): each is the fix working, a stale fixture, or a new defect; batch-judging 11 would have hidden two.
- Know which layer owns the effect you assert (skill `gate-layers`); a multi-part fix needs both halves reverted to reproduce — plant the demand past the half you are not testing (#295, #545); neuter an automation channel by blanking the engage direction only (#286).
- A de-energization written into the operator's demand heals on the next button press (#200, #329, #332): remove the delivered power/flow/head, leave the selector; `true_state.ac_available` is the named question every motor load asks; AFW carries a do-not-gate note (WTSM 5.7.5).
- `power_pct` is fission power; core heat is `true_state.core_heat_pct` — equal only at steady power (11.0 vs 21.0 MWt seconds into a LOCA). Decimals belong to the unit: `toFixed(0)` on MPa collapsed the loop split a panel exists to show.
- The pressurizer level constants are one object (`level_per_mass` 776, `level_per_void` 375.33, `level_per_tavg` 1.62; #337, #385): the TMI deception is a difference between two of them — touch one, re-solve the set; a single term of the coupled regime is worse than none (#346, #384).
- Measure a limit's incidence before trusting a green suite about it (#362): the `levelBase` clip bound on 95.7 % of one IC's samples and 0 % of every other. This plant goes solid at an inventory deficit, not overfilled.
- Natural circulation: the shape is sourced (W ∝ Q^⅓), the scale is fitted — never quote our percentage as a real-plant figure; the dash-speed ladder needs a step below that flow (#364).
- Protection cadence is written twice — `PROTECTION_DT` 0.1 s and a copy in `test/ops_harness.js`; move both or the ops suites certify a plant no player can produce.
- A sourced anchor can be the wrong form of the measurement (#386): GEND-061's adiabatic vs measured 27.5 psi burn ΔP decides which side of the ruled 30 psig hi-hi the family lands on.
- "Block SI" is three actions on a cooldown (`lo_press` and `si_trip` both need P-11; the Pressure SP comes down first); the live checklist never issues a step's `cmd` — it grades off `acc` and fires `inject_failure`/`clear_failure` (#670, #694); only a rate guard tells a ramp from a staircase.
- A red probe can be the reference moving, not the plant (#508: Tref fell 4.0 °F, Tavg 1.14 °F): run the fixture at both constants and ask which quantity moved; a distant red may be a cancellation (#647/#650); a fixture at an arbitrary state is right only while the model ignores that state (#633).
- An unmeasured claim in player-facing copy is still unmeasured: a "mass-only level" row promised a TMI divergence that measures 0.0 everywhere.
- Three runners gate the manual's numbers (`run_manual_setpoints`, `run_manual_commands`, `run_manual_units`) and nothing gates its prose (#532): grep the manual for the subject of every ruling and board change, and add the coverage-map entry with the row.
- A subscriber reading inside the rAF paint is one frame late and only a browser sees it (#432: 1475 rows in, 35 recorded): `drainFine()` stays synchronous in `render()`.
- On a board issue read `git log develop`, not just the lane tags — a tag says someone is there, the log says what they did (#357 worked against a convention #350 had inverted).
**The full history lives in `Diagnostic/TUNING_LOG.md`** (newest first) — current state and
pointers here, never a changelog (owner, 2026-07-27).

## Running it

No build step: open `index.html` (the landing page; the PWR card opens `ui/shell.html?engine=pwr`)
or `ui/shell.html` directly, or serve the folder statically; it runs from `file://`. Standalone
engine pages: `test_pwr.html`, `test_rbmk.html`, `test_bwr.html`. Offline single file:
`node tools/make_portable.js` → `dist/Reactor_Dynamics_<version>.html` (~2.5 MB);
`tools/make_portable.cmd` wraps it (batch files stay pure ASCII — one UTF-8 em dash ends an
`if (…)` block early). `test/run_portable.js` keeps that possible — read its header before adding
any runtime load.

## Running the tests

Plain Node runners, no framework, no `package.json`; `require()` only executes each
global-namespace file into `globalThis.RD`.

```
node test/run_all.js            # THE AGGREGATE GATE — every run_*/verify_* runner vs BASELINES
node test/run_all.js --fast | --jobs=1 | --only a,b | --record | --shard=i/5 --list
node test/run_pwr.js [name]     # PWR scenario suite; also run_scenarios, run_campaign(+_b,_c),
                                #   run_autoctl, run_ops (FAILs = tuning targets), run_m4..m7,
                                #   run_contract, run_procedures[_stack], run_meltdown [MD-5],
                                #   run_checklist, run_e2e_controls, run_rbmk/run_bwr (on hold)
node test/run_pwr2_engine.js --no-mutations   # four parts (bare, _b, _c, _d); --all unsplit;
                                #   FILTERED = forced non-zero, never a baseline
node tools/perturb_sweep.js     # which checks break if I retune this? (--suite, --nudge, --self-test)
node test/measure_stack.js --for=12h --every=1h --watch=tavg_c,pressure_mpa   # a number, full stack
```

- `run_all` discovers `test/(run|verify)_*.js` and fails on a runner with no baseline — add the
  `BASELINES` entry in the same change. Drift is symmetric: scoring better than baseline also
  fails; acknowledge it (update `BASELINES`, close the issue).
- Per-runner times in a parallel run are contention, not cost; locally the wall is the longest
  runner (~14 min). CI is a 5-way `--shard=i/5` matrix whose fan-in job is named exactly
  `aggregate-gate`. **Watch every push's run to the end; fix a red before new work** (owner,
  2026-09-29): `gh run list --workflow=gates.yml --limit 3`, poll `gh run view <id>`.
- Which layer a runner stops at (engine-direct / engine+M4 / full stack / browser / static), why
  `run_ops` and `run_behavior` are not full-stack (#209), CI costs, and how to take a number:
  skill `gate-layers`. Never drive a measurement with `svc.start()` — it advances in wall time;
  budget a long PWR2 ride at ~100 s per plant-hour on an uncovered core (#802).

## Definition of done

A change is finished when the gates it touches are green at or above `BASELINES`.

- **Batch the aggregate — one `run_all` per push, not per change** (owner, 2026-09-12). Per
  change, `run_all.js --only <the runners it touches>`. Run the aggregate once, immediately before
  a push he has called for, tree settled, nothing else live in it (a commit mid-run voids it). No
  push means no `run_all`; say when cross-effects are overdue, never run it on your own.
- **Agent cost is tool calls, not prompt length** (owner, 2026-09-12). Every subagent gets a
  ~150-call ceiling: past it, stop and report. A subagent never runs the aggregate (the Bash
  ceiling is 600 s; the coordinator owns it). No polling: put "wait for the notification; do not
  re-check, do not re-read what you have read" in every brief. An agent that edits before it
  plans pays for the rework twice. Hand over numbers marked MEASURED or INHERITED, never as a
  premise. One writer per file per tree (else scratch worktrees,
  `LANES.md` §9). No agent where no judgement is needed and the facts are in hand. A brief carries
  constraints and numbers, not rationale. Never cut the re-measurement pass, the injection proof
  on every added check, or the agent saying what it did not verify. Worked cases: `SOP.md` §6.
- **Sonnet by default; Opus where judgement is the work** (owner, 2026-09-18). Well-scoped = the
  brief already names the files, the interface and the checks; Opus buys an open diagnosis or
  per-probe adjudication. **Opus drafts prose** the player or owner reads (owner, 2026-09-24);
  transcribing ruled wording stays Sonnet. **Fable judges taste** — design critique, headlines,
  copy voice (owner, 2026-10-13).
- "Gate X forces Y" is a claim — grep for a ruling on Y first (owner, 2026-09-25). Kill processes
  by PID, never by filter. One doc-budget pass per block added here: cut what it costs.
- Engine or scenario change → `run_<plant>.js`, `run_scenarios.js`. Control layer →
  `run_autoctl.js` and `run_m4.js`; check `run_ops.js` for a PASS turning FAIL. Scenario, campaign
  or instructor → `run_campaign.js` + `_b` + `_c` (51/51 together), `run_m6.js`,
  `run_procedures.js`. UI → drive the flow (skill `run`), `verify_e2e_ui.js` stays PASS.
  Walkthrough → `run_walkthrough_routes.js` + parts, every number in step text measured on BOTH
  the typical-player and scripted-mistake routes, then the reviewer and its fixes, ONLY THEN one
  layman pass that confirms, never discovers (owner, 2026-09-24; 2026-09-29) — procedure: skill
  `walkthrough-change`. Save format → old saves migrate,
  `run_m7.js`; a `true_state` field change needs its §6.3 line in `CONTEXT.md` (`run_contract.js`).
  `Manuals/` → skill `manual-edit` (revision row → stamp → pack, or `run_manual_rev.js` reddens).
  Then `CHANGELOG.md`, this file's status, and `BUILD_DECISIONS.md` if a decision or flag changed.
- **Then hand it to a fresh agent for a quality pass** (owner, 2026-09-11): give it the diff, the
  issue and what is already open; it reviews, never re-litigates a ruling or replaces a gate.
  Report every finding and what you did about it; one you declined, with the reason.
- Release → skill `release-to-main`: version bump + `changelog.html` entry + `CHANGELOG.md` roll in
  one change, `run_release` green, a PR to protected `main` (`--merge`, never squash), and **a
  `Production` deployment must exist for the released SHA** (owner, 2026-08-04;
  `node tools/verify_release_deploy.js`) before `develop` is pushed.

## Issues, branches, versions

- Open items belong in GitHub issues (`TH462/Reactor-Dynamics`; `gh` authed as `TH462` — on
  `command not found`, `export PATH="$PATH:/c/Users/Tim H/AppData/Local/Programs/gh/bin"`), but
  **the filing bar** (owner, 2026-09-20) is a player consequence or a wrong number on the shipped
  plant; otherwise the finding goes in `TUNING_LOG.md`, and an answer goes in a comment on the
  asking issue. Always add the `Claude` label; one label from each of the four axes
  (priority/type/system/plant — issue #61); `status-owner-review` means done and gated, look
  before it closes — never close an issue carrying it without his word; `status-work-next` is his to apply (owner, 2026-07-31); `status-deliberate`
  names who decided and when. **Tag `status-wip-<lane>` when you start, clear it when you stop**
  (owner, 2026-08-04). Sweep with `--search 'label:a,b,c'` (repeated `--label` is ANDed). Procedure:
  skill `issue-workflow`.
- Commit ongoing work on `develop`, never straight to `main`; `main` is protected and a release is
  a PR (#196). Fast-forward `develop` to `main` after a release.
- **Website changelog & version numbers**: `Alpha X.Y.Z` = Platform.Feature.Refinement; Y only
  for something you could list on the Roadmap, Z for everything else however visible (owner,
  2026-07-31). Bump at the first push to `develop` after a release, not at the merge to `main`;
  the pending version wears `-rc<N>`, digits required (never relax `run_release` to quiet a red,
  #611), N bumped on every push to `develop` that changes the sim, later pushes extend the one
  entry, and a website-only change gets no bump (owner, 2026-09-03; 2026-08-06); the
  `changelog.html` entry is facts only, at most 8 bullets,
  simulator changes only, no flag-gated features (owner, 2026-08-04; 2026-08-06; 2026-09-03).
  `run_release.js` gates the agreement, not the digit. Procedure: skill `version-changelog`.

## Code conventions

- **No module system.** No `import` / `export` / `require` in `engines/`, `layers/`, `scenarios/`,
  `ui/`: plain scripts attaching to `globalThis.RD`, loaded in `<script>` order (`pwr_config.js`
  and the control modules before the engines that consume them — see `ui/shell.html` or any
  runner). Plant files are prefixed `pwr_` / `rbmk_` / `bwr_`.
- The Hard Rules (`CONTEXT.md` §3; ten rules, each naming its guard; HR7/HR8 retired, numbers
  not reused) are non-negotiable. The five you will trip: HR1 instruments vs truth · HR5 commands
  flow only down through the service · HR9 · HR10 · HR12. HR11: a ruling needs a date and verbatim
  words, or a `RULINGS.md` row.
- Snapshot/save compatibility is a contract: new fields migrate old saves (the migration-note
  pattern in `CHANGELOG.md`). Protection, alarm and failure setpoints are data in
  `layers/control/<plant>_control.js`. Surgical edits over rewrites.
- Source of truth: `engines/`, `layers/`, `scenarios/`, `ui/`, `test/`, `tools/`, `Blueprint/`,
  `Manuals/`, `CHANGELOG.md`. Not: `terminals/`, `inbox/`, `mcps/`, `node_modules/`,
  `Diagnostic/*.json` — all local-only, with `GO_PUBLIC_CHECKLIST.md`; the curated
  `Diagnostic/*.md` ships.
- Running the live site: `C:\grok_build\RD_Ops\` (owner, 2026-08-08) — `runbook.md`, `cutover.md`,
  analytics queries, bug-report bundles (`node tools/fetch_bug_reports.js`, skill
  `read-bug-reports`); read it before touching the site. **No secrets there** — it syncs
  off-site; tokens live in user env vars (`CLOUDFLARE_API_TOKEN`). A credential found there is a
  defect: move it and revoke it.

## The specification (`Blueprint/`)

`CONTEXT.md` (interfaces, hard rules, data contract, scope) · `DESIGN_COMPANION.md` (vision,
rationale, deliberate exclusions, roadmap) · `M1`–`M8` module specs plus `M4b_control_layer.md`,
`M5_*`, `M6*` · `BUILD_DECISIONS.md` · feature specs (`pwr_synoptic_prerequisites.md`,
`pwr_training_campaign.md`, `load_mode_spec.md`, `new_diagram_controls.md`,
`OPERATOR_MANUAL_PLAN.md`). To build a module, read `CONTEXT.md` plus that one spec.

## Domain conventions

- **The educational goal is plant dynamics** (owner, 2026-08-02), with procedure a second goal, not
  a subordinate one; the Tier A couplings in `DESIGN_CRITERIA.md` §6 are what Q2 scores against.
- **Instruments vs truth is a modelling rule (HR1), not the premise** (owner, 2026-08-02;
  2026-08-03): gauges, alarms and protection read instrumented values, true state is an explicit
  diagnostic overlay, never soften the gap — but deception is a Tier C payoff, not a headline
  objective, and the "instruments vs truth" framing is purged from all documents.
- Two registers for every label and instruction: Learning (plain language) and Industry (real
  plant terminology).
- Units: SI internally (MPa, °C, %); the PWR board is US (display toggle scoped off). Reporting
  rule under *How to reply*.
- Plant modes use commercial numbering, written *Mode N, Name* (*Mode 1, At Power*); not the
  turbine load modes (Follow / Manual / Disconnected).
- An educational lumped-parameter plant, not a full-scope replica: where a simplification
  understates reality, say so plainly.

## Licensing

Dual-licensed, © 2026 Timothy Holt: code AGPL-3.0 (`LICENSE`), manuals and training prose
CC BY 4.0 (`LICENSE-CONTENT`); public terms and disclaimer at `legal.html`.
